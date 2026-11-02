#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Local preparation only: this module has no network, GitHub or Xbox client.
import {createHash} from 'node:crypto';
import {lstat,realpath,readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {resolve,relative,dirname,basename,sep,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';

export const PLAN_SCHEMA='saverift.release-export-plan.v1';
const ROOTS=['ecosystem/sdk/','ecosystem/ui/','ecosystem/workbench/','ecosystem/collaboration/','ecosystem/plugins/synthetic','ecosystem/plugins/crimson-desert/','ecosystem/registry/','ecosystem/tests/','ecosystem/scripts/','docs/ecosystem/public/'];
const SUPPORT=new Set(['.gitattributes','ecosystem/package.json','ecosystem/package-lock.json','ecosystem/.gitignore','ecosystem/README.md','ecosystem/LICENSE','ecosystem/NOTICE','ecosystem/AGENTS.md','scripts/ecosystem-release-audit.mjs','tests/ecosystem-release-audit.test.mjs','.github/workflows/ecosystem-ci.yml']);
const RIGHTS=new Set(['original','licensed-code','synthetic','import-recipe']);
const HASH=/^[a-f0-9]{64}$/;
const MAX_FILE=8*1024*1024,MAX_TOTAL=48*1024*1024;
const BLOCKED_PATH=/(?:^|\/)(?:\.git|node_modules|\.env(?:\..*)?|\.runtime|\.saverift-workbench|private|backups?|captures?|logs|auth-cache|customer-data)(?:\/|$)|\.(?:har|pem|pfx|p12|key|save|sav|mp4|bin|png|webp|jpg|jpeg|avif|map|zip|tgz|gz|wasm|log|sqlite|db)$/i;
const HELD_DATA=/(?:^|\/)(?:donor|artwork|assets|fixtures-private)(?:\/|$)|(?:^|\/)(?:catalog|catalogs)\/.*\.(?:json|csv|tsv|jsonl)$|(?:crimson-(?:items|enrichment|companion-templates|nexus-discoveries|save-presets|construction-items|normal-items|inventory-placement|artwork|content-artwork))\.json$/i;
const SECRET_RULES=[
 ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
 ['github-credential',/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g],
 ['jwt-credential',/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g],
 ['xbox-credential',/XBL3\.0 x=[A-Za-z0-9_-]{1,128};[A-Za-z0-9_.-]{24,}/g],
 ['signed-url',/[?&](?:sig|access_token|refresh_token|client_secret)=[A-Za-z0-9_%+/=-]{16,}/gi],
 ['credential-literal',/\b(?:refresh[_-]?token|access[_-]?token|client[_-]?secret|session[_-]?cookie)\b\s*[=:]\s*["'][^"'\r\n]{24,}["']/gi],
 ['private-origin',/git\.chatgpt-team\.site|oai-library:\/\/|file-inline-libfile[_]/g],
 ['personal-email',/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g],
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function inside(root,path){const rel=relative(root,path);return rel===''||(!rel.startsWith('..'+sep)&&rel!=='..');}
function pathValid(path){return typeof path==='string'&&path.length>0&&path.length<=300&&!path.includes('\\')&&!path.includes('\0')&&!path.startsWith('/')&&posix.normalize(path)===path&&!path.split('/').some(v=>v==='..'||v==='.'||!v);}
function permitted(path){return SUPPORT.has(path)||ROOTS.some(prefix=>path.startsWith(prefix));}
function finding(path,rule,extra={}){return {path,rule,...extra};}
export function scanText(path,bytes){
 const text=bytes.toString('utf8'),findings=[];
 for(const [rule,re]of SECRET_RULES){re.lastIndex=0;for(const match of text.matchAll(re)){
  if(rule==='personal-email'&&/\.(?:invalid|example|test)$/i.test(match[0].split('@')[1]))continue;
  findings.push(finding(path,rule,{line:text.slice(0,match.index).split('\n').length}));
 }}
 if(/(?:from\s*|import\s*\(|require\s*\()\s*["'][^"']*(?:server\/(?:cloud|.*publication|.*auth)|worker\/|bridge\/|docs\/saveglass)/.test(text))findings.push(finding(path,'private-import'));
 return findings;
}
async function checkedSource(root,path){
 let at=root;
 for(const part of path.split('/')){at=resolve(at,part);if((await lstat(at)).isSymbolicLink())throw Error('symlink');}
 const actual=await realpath(at);if(!inside(root,actual))throw Error('outside');
 const stat=await lstat(actual);if(!stat.isFile())throw Error('not-file');if(stat.size>MAX_FILE)throw Error('file-size');return {actual,stat};
}
export async function auditPlan(plan,{sourceRoot=process.cwd()}={}){
 const root=await realpath(sourceRoot),findings=[],files=[],destinations=new Set();let total=0;
 if(plan?.schema!==PLAN_SCHEMA||!Array.isArray(plan.files)||!plan.files.length||plan.files.length>2048)throw Error('Invalid or empty release export plan.');
 for(const entry of plan.files){
  const path=entry?.source,destination=entry?.destination;
  if(!pathValid(path)||!pathValid(destination)){findings.push(finding('[invalid]','invalid-path'));continue;}
  const filenameFindings=scanText('[redacted-filename]',Buffer.from(path+'\n'+destination));if(filenameFindings.length){findings.push(...filenameFindings);continue;}
  const metadataFindings=scanText('[review-metadata]',Buffer.from(JSON.stringify({license:entry.license,origin:entry.origin,rights:entry.rights})));if(metadataFindings.length){findings.push(...metadataFindings);continue;}
  const syntheticFixture=entry.rights==='synthetic'&&/^ecosystem\/plugins\/synthetic[^/]*\/(?:.*\/)?fixture\.save$/.test(path)&&destination===path;
  if(!permitted(path)||(BLOCKED_PATH.test(path)||BLOCKED_PATH.test(destination))&&!syntheticFixture){findings.push(finding(path,'private-or-unsupported-path'));continue;}
  if(HELD_DATA.test(path)||HELD_DATA.test(destination)){findings.push(finding(path,'unresolved-data-rights'));continue;}
  const folded=destination.toLowerCase();if(destinations.has(folded)){findings.push(finding(path,'duplicate-destination'));continue;}destinations.add(folded);
  if(entry.review!=='approved-local-candidate'||!RIGHTS.has(entry.rights)||typeof entry.license!=='string'||!entry.license.trim()||/NOASSERTION|UNLICENSED|pending/i.test(entry.license)||typeof entry.origin!=='string'||!entry.origin.trim()){findings.push(finding(path,'unreviewed-rights'));continue;}
  if(!HASH.test(entry.sha256||'')){findings.push(finding(path,'missing-hash'));continue;}
  try{
   const {actual,stat}=await checkedSource(root,path),bytes=await readFile(actual),digest=sha(bytes);total+=stat.size;
   if(digest!==entry.sha256){findings.push(finding(path,'source-changed'));continue;}
   if(total>MAX_TOTAL){findings.push(finding(path,'total-size'));continue;}
   findings.push(...scanText(path,bytes));
   files.push({source:path,destination,sha256:digest,bytes:stat.size,license:entry.license,rights:entry.rights,origin:entry.origin});
  }catch(error){findings.push(finding(path,['symlink','outside','not-file','file-size'].includes(error.message)?error.message:'source-unavailable'));}
 }
 // Static package-local dependencies must be present in the same reviewed export.
 const selected=new Set(files.map(file=>file.source));
 for(const file of files){if(!/\.(?:mjs|cjs|js|jsx|ts|tsx)$/.test(file.source))continue;const bytes=await readFile(resolve(root,file.source)),code=bytes.toString('utf8');
  // Anchor static declarations: test strings containing deliberately denied
  // imports are data, not this module's actual source dependencies. Computed
  // imports/resources still require the mandatory clean-export build/tests.
  const imports=/^[ \t]*(?:import|export)[ \t]+(?:[^;"'`]*?\s+from\s*)?["'](\.[^"']+)["']/gm;
  for(const match of code.matchAll(imports)){const specifier=match[1].split(/[?#]/)[0];if(!specifier||!posix.extname(specifier))continue;const target=posix.normalize(posix.join(posix.dirname(file.source),specifier));if(!selected.has(target))findings.push(finding(file.source,'missing-local-import',{dependency:target}));}
 }
 return {schema:'saverift.release-audit.v1',state:findings.length?'blocked':'ready_for_local_review',publicReleaseApproved:false,repositoryDestinations:plan.repositoryDestinations??null,files,totalBytes:total,findings};
}
export async function createInventory(lockFile){
 const lock=JSON.parse(await readFile(lockFile,'utf8')),packages=[];
 for(const [path,item]of Object.entries(lock.packages??{}))if(path)packages.push({name:item.name??path.split('node_modules/').at(-1),version:item.version??null,license:item.license??'NOASSERTION',integrity:item.integrity??null,optional:!!item.optional,dev:!!item.dev});
 packages.sort((a,b)=>a.name.localeCompare(b.name)||String(a.version).localeCompare(String(b.version)));
 return {schema:'saverift.dependency-inventory.v1',lockVersion:lock.lockfileVersion,licenseEvidence:'package_lock_metadata_not_full_notice_clearance',packages};
}
export function inventoryToSpdx(inventory,{name='SaveRift local release candidate'}={}){
 const data=JSON.stringify(inventory),digest=sha(data);
 return {spdxVersion:'SPDX-2.3',dataLicense:'CC0-1.0',SPDXID:'SPDXRef-DOCUMENT',name,documentNamespace:`https://saverift.com/spdx/${digest}`,creationInfo:{creators:['Tool: saverift-release-audit'],created:'1970-01-01T00:00:00Z',comment:'Deterministic package-lock metadata inventory; license files and artifact inclusion require separate review.'},packages:inventory.packages.map((p,i)=>({name:p.name,SPDXID:`SPDXRef-Package-${i+1}`,versionInfo:p.version??'NOASSERTION',downloadLocation:'NOASSERTION',filesAnalyzed:false,licenseConcluded:'NOASSERTION',licenseDeclared:p.license,copyrightText:'NOASSERTION'})),relationships:[]};
}
export async function stageExport(plan,{sourceRoot=process.cwd(),output}={}){
 const root=await realpath(sourceRoot);let target=resolve(output??'');if(!output||inside(root,target))throw Error('Export output must be outside the source repository.');
 const report=await auditPlan(plan,{sourceRoot:root});if(report.findings.length)return report;
 try{await lstat(target);throw Error('Export output already exists.');}catch(error){if(error.code!=='ENOENT')throw error;}
 // Creating the final directory non-recursively prevents overwriting a pre-existing export.
 await mkdir(dirname(target),{recursive:true});target=resolve(await realpath(dirname(target)),basename(target));if(inside(root,target))throw Error('Export output must be outside the source repository.');await mkdir(target);
 for(const file of report.files){const {actual}=await checkedSource(root,file.source),bytes=await readFile(actual);if(sha(bytes)!==file.sha256)throw Error('Source changed during export.');const dest=resolve(target,file.destination);if(!inside(target,dest))throw Error('Invalid export destination.');await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes,{flag:'wx',mode:0o644});}
 await writeFile(resolve(target,'EXPORT-REVIEW.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 const sums=report.files.map(file=>`${file.sha256}  ${file.destination}`).sort().join('\n')+'\n';await writeFile(resolve(target,'SHA256SUMS'),sums,{flag:'wx'});
 return report;
}
export async function archiveExport(output){
 const root=await realpath(output),archive=root+'.tar.gz';
 try{await lstat(archive);throw Error('Archive already exists.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const report=JSON.parse(await readFile(resolve(root,'EXPORT-REVIEW.json'),'utf8'));
 if(report.schema!=='saverift.release-audit.v1'||report.state!=='ready_for_local_review'||report.publicReleaseApproved!==false||!Array.isArray(report.files)||report.findings?.length)throw Error('Export review report is invalid.');
 const expected=new Set(['EXPORT-REVIEW.json','SHA256SUMS',...report.files.map(file=>file.destination)]),seen=new Set();
 async function inspect(path=''){for(const item of await readdir(resolve(root,path),{withFileTypes:true})){const child=path?path+'/'+item.name:item.name;if(item.isSymbolicLink())throw Error('Export contains a symlink.');if(item.isDirectory())await inspect(child);else if(item.isFile()){if(!expected.has(child))throw Error('Export contains an unreviewed file.');seen.add(child);}else throw Error('Export contains an unsupported entry.');}}
 await inspect();if(seen.size!==expected.size)throw Error('Export is missing a reviewed file.');
 for(const file of report.files){if(!pathValid(file.destination)||!HASH.test(file.sha256)||sha(await readFile(resolve(root,file.destination)))!==file.sha256)throw Error('Export changed after review.');}
 const sums=report.files.map(file=>`${file.sha256}  ${file.destination}`).sort().join('\n')+'\n';if(await readFile(resolve(root,'SHA256SUMS'),'utf8')!==sums)throw Error('Export checksums changed after review.');
 const result=spawnSync('tar',['--sort=name','--mtime=@0','--owner=0','--group=0','--numeric-owner','--format=ustar','-cf','-','-C',root,'.'],{maxBuffer:MAX_TOTAL+8*1024*1024});
 if(result.status!==0)throw Error('Deterministic tar creation failed.');
 const bytes=gzipSync(result.stdout,{level:9,mtime:0});await writeFile(archive,bytes,{flag:'wx'});return {file:archive,sha256:sha(bytes),bytes:bytes.length};
}
export async function discoverPlan({sourceRoot=process.cwd()}={}){
 const root=await realpath(sourceRoot),files=[];
 async function walk(path){let entries;try{entries=await readdir(resolve(root,path),{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}for(const entry of entries){const child=path+'/'+entry.name,syntheticFixture=/^ecosystem\/plugins\/synthetic[^/]*\/(?:.*\/)?fixture\.save$/.test(child);if(entry.isSymbolicLink()||(BLOCKED_PATH.test(child)&&!syntheticFixture)||HELD_DATA.test(child))continue;if(entry.isDirectory())await walk(child);else if(entry.isFile()&&permitted(child)){const bytes=await readFile(resolve(root,child));files.push({source:child,destination:child,sha256:sha(bytes),license:'NOASSERTION',rights:'pending',origin:'pending_source_review',review:'pending'});}}}
 await walk('ecosystem');await walk('docs/ecosystem/public');
 for(const path of SUPPORT){try{const bytes=await readFile(resolve(root,path));if(!files.some(f=>f.source===path))files.push({source:path,destination:path,sha256:sha(bytes),license:'NOASSERTION',rights:'pending',origin:'pending_source_review',review:'pending'});}catch(error){if(error.code!=='ENOENT')throw error;}}
 return {schema:PLAN_SCHEMA,repositoryDestinations:null,publicReleaseApproved:false,files:files.sort((a,b)=>a.source.localeCompare(b.source))};
}
async function main(args){
 const get=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];},root=get('--source')??process.cwd();
 if(args.includes('--discover')){const plan=await discoverPlan({sourceRoot:root});const output=get('--plan');if(!output)throw Error('--discover requires --plan output.');await writeFile(output,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({state:'pending_review',files:plan.files.length,plan:output}));return;}
 const path=get('--plan');if(!path)throw Error('Use --plan FILE [--source ROOT] [--stage OUT] [--archive]. No publication is performed.');
 const plan=JSON.parse(await readFile(path,'utf8')),out=get('--stage'),report=out?await stageExport(plan,{sourceRoot:root,output:out}):await auditPlan(plan,{sourceRoot:root});
 const reportPath=get('--report');if(reportPath)await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({state:report.state,files:report.files.length,totalBytes:report.totalBytes,findings:report.findings}));
 if(report.findings.length){process.exitCode=1;return;}if(args.includes('--archive')){if(!out)throw Error('--archive requires --stage.');console.log(JSON.stringify(await archiveExport(out)));}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{
 // JSON/parser/filesystem exception messages can embed untrusted input paths
 // or data. Expected audit failures already have bounded rule/location output.
 const code=error instanceof SyntaxError?'INVALID_JSON':['ENOENT','EEXIST','EACCES'].includes(error.code)?error.code:'VALIDATION_FAILED';
 console.error(JSON.stringify({state:'failed',code,publicReleaseApproved:false}));process.exitCode=1;
});
