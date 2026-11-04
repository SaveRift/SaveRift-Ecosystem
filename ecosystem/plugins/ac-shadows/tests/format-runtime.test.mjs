// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';
import {buildAcShadowsPackage} from '../scripts/build.mjs';
import {createPluginSession,createExecutionLock} from '../../../sdk/runner.mjs';
import {createSaveBundle,hash} from '../../../sdk/contracts.mjs';
import {syntheticNativeSave} from './format-fixtures.mjs';
test('native prepared format executes open/query/plan/validate in the real default isolated runner',async()=>{
  const fixture=syntheticNativeSave(),artifacts=new Map([['main',fixture.bytes],['private-key',fixture.key],['sibling',new Uint8Array([7,9,11])]]),roles={main:'main','private-key':'ac-key',sibling:'sidecar'};
  const bundle=createSaveBundle([...artifacts].map(([id,b])=>({id,logicalPath:id+'.bin',role:roles[id],sha256:hash(b),byteLength:b.length})),{hints:{gameIdentity:'ac-shadows',platform:'pc'}});
  const pkg=await buildAcShadowsPackage({write:false}),session=await createPluginSession({package:pkg,executionLock:createExecutionLock(pkg),bundle,artifacts});
  try{
    assert.equal((await session.call('detect',[bundle])).state,'supported');const handle=await session.call('open',[bundle]);
    const inventory=await session.call('query',[handle,{method:'acshadows.inventory.list',params:{limit:50}}]),row=inventory.records.find(r=>r.editableFields.includes('level'));
    const op={id:'acshadows.inventory.setLevel',apiVersion:'0.1.0',params:{recordId:row.recordId,expectedLevel:row.level,level:row.level+1,sourceSha256:handle.sourceSha256}};
    const candidate=await session.call('plan',[bundle,{operations:[op],operationDigest:'a'.repeat(64)}]);
    assert(!candidate.outputs.some(a=>a.role==='ac-key'));assert(candidate.outputs.some(a=>a.id==='sibling'));
    const validation=await session.call('validate',[bundle,candidate]);assert(validation.checks.every(c=>c.result==='passed'));assert.equal(session.metrics().runner,'isolated-js-v1');
    const output=candidate.outputs.find(a=>a.role==='main');assert.equal(hash(session.artifacts().get(output.id)),output.sha256);
    await session.call('close',[handle]);
  }finally{session.close();}
});
