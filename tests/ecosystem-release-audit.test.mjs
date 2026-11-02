// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {auditPlan,stageExport,archiveExport,discoverPlan,scanText,createInventory,inventoryToSpdx,PLAN_SCHEMA} from '../scripts/ecosystem-release-audit.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t){const base=await mkdtemp(join(tmpdir(),'saverift-export-')),root=join(base,'source');await mkdir(root);t.after(()=>rm(base,{recursive:true,force:true}));return {base,root,output:join(base,'export')};}
async function entry(root,path,text,extra={}){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),text);return {source:path,destination:path,sha256:digest(text),license:'Apache-2.0',rights:'original',origin:'Original synthetic test source',review:'approved-local-candidate',...extra};}
const plan=files=>({schema:PLAN_SCHEMA,publicReleaseApproved:false,repositoryDestinations:null,files});
test('exact reviewed source exports without private Git history and produces deterministic archives',async t=>{
 const f=await fixture(t),item=await entry(f.root,'ecosystem/sdk/example.mjs','export const value=1;\n');await mkdir(join(f.root,'.git'));await writeFile(join(f.root,'.git','config'),'private');
 const report=await stageExport(plan([item]),{sourceRoot:f.root,output:f.output});assert.equal(report.state,'ready_for_local_review');assert.equal(report.publicReleaseApproved,false);assert.equal(await readFile(join(f.output,item.destination),'utf8'),'export const value=1;\n');await assert.rejects(lstat(join(f.output,'.git')),{code:'ENOENT'});
 const first=await archiveExport(f.output);await rm(first.file);const second=await archiveExport(f.output);assert.equal(first.sha256,second.sha256);await assert.rejects(stageExport(plan([item]),{sourceRoot:f.root,output:f.output}),/already exists/);
});
test('source changes, pending rights and incomplete local import closures block staging',async t=>{
 const f=await fixture(t),item=await entry(f.root,'ecosystem/sdk/a.mjs',"import './missing.mjs';\n");let result=await auditPlan(plan([item]),{sourceRoot:f.root});assert.equal(result.findings[0].rule,'missing-local-import');
 await writeFile(join(f.root,item.source),'changed');result=await auditPlan(plan([item]),{sourceRoot:f.root});assert.equal(result.findings[0].rule,'source-changed');
 result=await auditPlan(plan([{...item,review:'pending'}]),{sourceRoot:f.root});assert.equal(result.findings[0].rule,'unreviewed-rights');
 result=await stageExport(plan([{...item,license:'NOASSERTION'}]),{sourceRoot:f.root,output:f.output});assert.equal(result.state,'blocked');await assert.rejects(lstat(f.output),{code:'ENOENT'});
});
test('archive refuses changed or unreviewed staged files',async t=>{
 const f=await fixture(t),item=await entry(f.root,'ecosystem/sdk/a.mjs','export {};\n');await stageExport(plan([item]),{sourceRoot:f.root,output:f.output});
 await writeFile(join(f.output,'unexpected.txt'),'unreviewed');await assert.rejects(archiveExport(f.output),/unreviewed/);await rm(join(f.output,'unexpected.txt'));
 await writeFile(join(f.output,item.destination),'changed');await assert.rejects(archiveExport(f.output),/changed after review/);
});
test('private paths, donor/template data, traversal, symlinks and case-collisions fail closed',async t=>{
 const f=await fixture(t),a=await entry(f.root,'ecosystem/sdk/a.mjs','export {};\n');
 for(const [source,rule]of [['server/cloud.mjs','private-or-unsupported-path'],['ecosystem/plugins/crimson-desert/catalog/items.json','unresolved-data-rights'],['ecosystem/plugins/crimson-desert/crimson-companion-templates.json','unresolved-data-rights'],['../outside.mjs','invalid-path'],['ecosystem/sdk/.env','private-or-unsupported-path']]){const r=await auditPlan(plan([{...a,source}]),{sourceRoot:f.root});assert.equal(r.findings[0].rule,rule);}
 await symlink(join(f.root,a.source),join(f.root,'ecosystem/sdk/link.mjs'));let r=await auditPlan(plan([{...a,source:'ecosystem/sdk/link.mjs'}]),{sourceRoot:f.root});assert.equal(r.findings[0].rule,'symlink');
 r=await auditPlan(plan([a,{...a,destination:a.destination.toUpperCase()}]),{sourceRoot:f.root});assert.equal(r.findings[0].rule,'duplicate-destination');await assert.rejects(stageExport(plan([a]),{sourceRoot:f.root,output:join(f.root,'out')}),/outside/);
});
test('credential findings contain rule and location without leaking matching values',()=>{
 const credential='ghp_'+'z'.repeat(32),email='owner'+'@'+'private.example.com',text=`const t='${credential}';\n${email}\nhttps://example.invalid/a?sig=${'a'.repeat(40)}`;
 const findings=scanText('ecosystem/sdk/bad.mjs',Buffer.from(text));assert.deepEqual(findings.map(f=>f.rule),['github-credential','signed-url','personal-email']);const report=JSON.stringify(findings);assert.equal(report.includes(credential),false);assert.equal(report.includes(email),false);assert.equal(report.includes('a'.repeat(40)),false);assert.equal(scanText('test',Buffer.from('nobody@example.invalid')).length,0);
});
test('credential-like filenames are rejected without printing their value',async t=>{
 const f=await fixture(t),credential='ghp_'+'z'.repeat(32),item=await entry(f.root,`ecosystem/sdk/${credential}.mjs`,'export {};');const result=await auditPlan(plan([item]),{sourceRoot:f.root});assert.equal(result.findings[0].path,'[redacted-filename]');assert.equal(JSON.stringify(result).includes(credential),false);
 const safe=await entry(f.root,'ecosystem/sdk/safe.mjs','export {};',{origin:credential});const metadata=await auditPlan(plan([safe]),{sourceRoot:f.root});assert.equal(metadata.findings[0].path,'[review-metadata]');assert.equal(JSON.stringify(metadata).includes(credential),false);
});
test('discovery produces unapproved exact hashes, excludes secrets and does not invent rights',async t=>{
 const f=await fixture(t);await entry(f.root,'ecosystem/sdk/a.mjs','export {};');await entry(f.root,'ecosystem/sdk/.env','SECRET');await entry(f.root,'ecosystem/plugins/crimson-desert/catalog/items.json','[]');const result=await discoverPlan({sourceRoot:f.root});assert.equal(result.files.length,1);assert.equal(result.files[0].review,'pending');assert.equal(result.repositoryDestinations,null);assert.equal(result.publicReleaseApproved,false);
});
test('dependency inventory and SPDX distinguish declarations from concluded license clearance',async t=>{
 const f=await fixture(t),lock=join(f.root,'lock.json');await writeFile(lock,JSON.stringify({lockfileVersion:3,packages:{'':{private:true},'node_modules/example':{version:'1.2.3',license:'MIT',integrity:'sha512-example'}}}));const inventory=await createInventory(lock),spdx=inventoryToSpdx(inventory);assert.equal(inventory.packages[0].license,'MIT');assert.equal(spdx.packages[0].licenseConcluded,'NOASSERTION');assert.equal(spdx.packages[0].downloadLocation,'NOASSERTION');assert.equal(spdx.spdxVersion,'SPDX-2.3');
});
