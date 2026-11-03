// SPDX-License-Identifier: Apache-2.0
// Opt-in private fixture diagnostic. Never loads fixture bytes from source.
import {readFile,writeFile} from 'node:fs/promises';
import {buildAcShadowsPackage} from '../scripts/build.mjs';
import {createPluginSession,createExecutionLock} from '../../../sdk/runner.mjs';
import {createSaveBundle,hash} from '../../../sdk/contracts.mjs';
import {operationDigest} from '../../../sdk/draft.mjs';
const config=JSON.parse(await readFile(process.argv[2],'utf8'));
const artifacts=new Map(),descriptors=[];
for(const [i,f] of config.fixtures.entries()){const bytes=new Uint8Array(await readFile(f.path)),id='input-'+i;artifacts.set(id,bytes);descriptors.push({id,logicalPath:f.name,role:f.role,byteLength:bytes.length,sha256:hash(bytes)});}
const bundle=createSaveBundle(descriptors,{hints:{gameIdentity:'ac-shadows',platform:'pc'}}),pkg=await buildAcShadowsPackage({write:false}),executionLock=createExecutionLock(pkg),report={packageDigest:pkg.packageDigest,phases:[]};
let candidate;
async function run(name,b,input,fn){const s=await createPluginSession({package:pkg,executionLock,bundle:b,artifacts:input});try{const result=await fn(s);report.phases.push({name,status:'passed',...s.metrics()});for(const [id,bytes]of s.artifacts())artifacts.set(id,bytes);return result;}catch(e){report.phases.push({name,status:'failed',code:e.code,...s.metrics()});throw e;}finally{s.close();}}
try{
  candidate=await run('serialization',bundle,artifacts,s=>s.call('plan',[bundle,{operations:config.operations,operationDigest:operationDigest(config.operations)}]));
  const added=[...artifacts].filter(([id])=>!descriptors.some(a=>a.id===id)).map(([id,bytes])=>candidate.outputs.find(a=>a.id===id)||{id,logicalPath:'reports/'+id+'.json',role:'validation-report',byteLength:bytes.length,sha256:hash(bytes)}),access=createSaveBundle([...descriptors,...added]);
  await run('validation',access,artifacts,s=>s.call('validate',[bundle,candidate]));
}catch(e){report.error={code:e.code,message:e.message};process.exitCode=1;}
console.log(JSON.stringify(report,null,2));if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(report,null,2));
