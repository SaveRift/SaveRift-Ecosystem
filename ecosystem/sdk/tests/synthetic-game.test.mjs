// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSaveBundle,validatePackage} from '../contracts.mjs';
import {sha256} from '../crypto.mjs';
import {createExecutionLock} from '../registry.mjs';
import {runPlugin,createPluginSession} from '../runner.mjs';
import {compileOperationLog,operationDigest} from '../draft.mjs';
const root=new URL('../../plugins/synthetic-game/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8')),code=await readFile(new URL('connector.mjs',root),'utf8'),bytes=new Uint8Array(await readFile(new URL('fixture.save',root)));
const pkg={manifest,files:{'runtime/connector.mjs':code}},packageDigest=validatePackage(pkg).packageDigest;
const lock=createExecutionLock({connector:{id:manifest.id,version:manifest.version,digest:packageDigest}}),artifact={id:'synthetic-world',logicalPath:'world.save',role:'world',byteLength:bytes.length,sha256:sha256(bytes)},bundle=createSaveBundle([artifact],{hints:{gameIdentity:'synthetic.frontier',platform:'synthetic'}}),artifacts=new Map([[artifact.id,bytes]]);
test('real isolated file-in/file-out, custom domains and unknown fields survive',async()=>{
 const session=await createPluginSession({package:pkg,bundle,artifacts,executionLock:lock});
 try{assert.equal((await session.call('detect',[bundle])).state,'supported');const doc=await session.call('open',[bundle]);assert.equal(doc.camp.workers,4);assert.equal(doc.unknownBranch.integer,'18446744073709551615');
  const ops=[{id:'example.synthetic.setVehicleFuel',apiVersion:'0.1.0',params:{fuel:80}},{id:'example.synthetic.setFaction',apiVersion:'0.1.0',params:{id:'cartographers',reputation:20}}];
  const candidate=await session.call('plan',[bundle,{operations:ops,operationDigest:sha256('test-ops')}]);const checked=await session.call('validate',[bundle,candidate]);assert.ok(checked.checks.every(c=>c.result==='passed'));
  const output=session.artifacts().get(candidate.outputs[0].id),parsed=JSON.parse(new TextDecoder().decode(output).split('\n').slice(1).join('\n'));assert.equal(parsed.vehicle.fuel,80);assert.equal(parsed.factions[0].reputation,20);assert.deepEqual(parsed.progression,doc.progression);assert.deepEqual(parsed.camp,doc.camp);
 }finally{session.close();}
});
test('no-op retains exact bytes and malformed/unsupported input never mutates original',async()=>{
 const noOp=await runPlugin({package:pkg,bundle,artifacts,executionLock:lock,method:'plan',args:[bundle,{operations:[],operationDigest:sha256('empty')}]});assert.equal(noOp.result.outputs[0].sha256,artifact.sha256);assert.deepEqual(noOp.result.retainedInputArtifacts,[artifact.id]);
 await assert.rejects(runPlugin({package:pkg,bundle,artifacts,executionLock:lock,method:'plan',args:[bundle,{operations:[{id:'example.synthetic.setVehicleFuel',apiVersion:'0.1.0',params:{fuel:1000}}],operationDigest:sha256('bad')}]}));
 assert.equal(sha256(artifacts.get(artifact.id)),artifact.sha256);
});
test('separate contributor extension adds linked progression and leaves serializer in connector',async()=>{
 const base=new URL('../../plugins/synthetic-extension/',import.meta.url),m=JSON.parse(await readFile(new URL('manifest.json',base),'utf8')),extension={manifest:m,files:{'runtime.mjs':await readFile(new URL('runtime.mjs',base),'utf8'),'schemas/set-level.json':await readFile(new URL('schemas/set-level.json',base),'utf8')}};
 const extPin={id:m.id,version:m.version,digest:validatePackage(extension).packageDigest},both=createExecutionLock({connector:lock.connector,extensions:[extPin]});
 const inspected=await runPlugin({package:pkg,bundle,artifacts,executionLock:both,method:'open',args:[bundle]});
 const operations=[{instanceId:'level-op',id:'example.level-tools.setLevel',apiVersion:'0.1.0',params:{targetLevel:5}},{instanceId:'camp-op',id:'example.synthetic.setFaction',apiVersion:'0.1.0',params:{id:'cartographers',reputation:25}}];
 const output=await compileOperationLog({bundle,operations,executionLock:both,connector:{package:pkg,artifacts},extensions:[{package:extension,artifacts}],document:inspected.result,run:runPlugin});
 assert.equal(output.result.operationDigest,operationDigest(operations));assert.equal(output.metrics.packageDigest,packageDigest);
 const file=output.artifacts.get(output.result.outputs[0].id),doc=JSON.parse(new TextDecoder().decode(file).split('\n').slice(1).join('\n'));
 assert.deepEqual(doc.progression,{level:5,xp:6400,skillPoints:7});assert.equal(doc.factions[0].reputation,25);assert.deepEqual(doc.vehicle,{id:'sand-sled',fuel:25});assert.equal(doc.unknownBranch.integer,'18446744073709551615');
});
test('extension schema, public API and write domains are enforced before serialization',async()=>{
 const base=new URL('../../plugins/synthetic-extension/',import.meta.url),m=JSON.parse(await readFile(new URL('manifest.json',base),'utf8')),files={'runtime.mjs':await readFile(new URL('runtime.mjs',base),'utf8'),'schemas/set-level.json':await readFile(new URL('schemas/set-level.json',base),'utf8')};
 const execute=async (manifest,code,params)=>{
  const ext={manifest,files:{...files,'runtime.mjs':code}},pin={id:manifest.id,version:manifest.version,digest:validatePackage(ext).packageDigest},both=createExecutionLock({connector:lock.connector,extensions:[pin]}),op={instanceId:'extension-op',id:'example.level-tools.setLevel',apiVersion:'0.1.0',params};
  return compileOperationLog({bundle,operations:[op],executionLock:both,connector:{package:pkg,artifacts},extensions:[{package:ext,artifacts}],document:{progression:{level:2,xp:100,skillPoints:1}},run:runPlugin});
 };
 await assert.rejects(execute(m,files['runtime.mjs'],{targetLevel:'5'}),{code:'OPERATION_PARAMS_INVALID'});
 await assert.rejects(execute({...m,dependencies:{'example.synthetic.document':'2.0.0'}},files['runtime.mjs'],{targetLevel:5}),{code:'DOMAIN_API_MISMATCH'});
 const rogue='export default {expand(){return {operations:[{id:"example.synthetic.setVehicleFuel",apiVersion:"0.1.0",params:{fuel:100}}]}}}';
 await assert.rejects(execute(m,rogue,{targetLevel:5}),{code:'EXTENSION_SCOPE_INVALID'});
 assert.equal(sha256(artifacts.get(artifact.id)),artifact.sha256);
});
