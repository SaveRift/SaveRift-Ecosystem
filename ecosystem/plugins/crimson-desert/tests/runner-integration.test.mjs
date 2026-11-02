// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from '../../../sdk/buffer.mjs';
import {hash} from '../../../sdk/crypto.mjs';
import {createSaveBundle,validatePackage} from '../../../sdk/contracts.mjs';
import {createExecutionLock as pinExecutionLock,validateExecutionPackages} from '../../../sdk/registry.mjs';
import {createPluginSession,createExecutionLock,runPlugin} from '../../../sdk/runner.mjs';
import {buildCrimsonPackage} from '../scripts/build.mjs';
import {typedParcFixture,quantityParcFixture} from './synthetic-parc.mjs';
import {encodeSave} from '../src/crimson-codec.mjs';
import {readDocument} from '../src/crimson-document.mjs';
import {decodeSave} from '../src/crimson-codec.mjs';
function header(){const h=Buffer.alloc(128);h.write('SAVE');h.writeUInt16LE(2,4);h.writeUInt16LE(128,6);h[0x70]=37;return h;}
async function fixture(){const {raw}=quantityParcFixture(),save=await encodeSave(raw,header(),{nonce:Buffer.alloc(16,8)}),lobby=Buffer.from('synthetic unchanged sidecar'),artifacts=new Map([['main',save],['sidecar',lobby]]),bundle=createSaveBundle([...artifacts].map(([id,bytes])=>({id,logicalPath:'slot100,savedgame/'+(id==='main'?'save':'lobby'),role:id==='main'?'main':'sidecar',byteLength:bytes.length,sha256:hash(bytes)})),{id:'synthetic-reference',hints:{gameIdentity:'crimson-desert'}}),pkg=await buildCrimsonPackage({write:false});return {bundle,artifacts,package:pkg,executionLock:createExecutionLock(pkg)};}
test('actual packaged Crimson codec executes detect/open/paginated query without private modules in QuickJS',async()=>{
 const f=await fixture(),session=await createPluginSession(f);try{const match=await session.call('detect',[f.bundle]);assert.equal(match.state,'supported');const opened=await session.call('open',[f.bundle]),inventory=await session.call('query',[opened,{method:'crimson.inventory',limit:35}]);assert.equal(inventory.total,1);assert.equal(inventory.records[0].quantity,'5');assert.equal(inventory.records[0].instanceId,'9007199254740993');assert.equal(inventory.records[0].catalogMatched,false);assert.equal(opened.providers.fallback,true);const explorer=await session.call('query',[opened,{method:'crimson.explorer'}]);assert.equal(explorer.report.payloads[0].crimson.domains.inventory.recordCount,1);assert.equal(JSON.stringify(explorer).includes('xuid'),false);}finally{session.close();}
});
test('real connector produces and validates a no-op candidate through artifact handles only',async()=>{
 const f=await fixture(),session=await createPluginSession(f);try{const candidate=await session.call('plan',[f.bundle,{operations:[],operationDigest:hash('[]')}]);assert.equal(candidate.inputBundleDigest,f.bundle.bundleDigest);assert.equal(candidate.executionLockDigest,f.executionLock.digest);assert.equal(candidate.outputs.length,2);assert.deepEqual(candidate.retainedInputArtifacts,['main','sidecar']);const result=await session.call('validate',[f.bundle,candidate]);assert.equal(result.checks.every(x=>x.result==='passed'),true);assert.ok(session.artifacts().size>0);}finally{session.close();}
});
test('unknown item additions fail honestly without redistributing restricted constructor data',async()=>{
 const f=await fixture();await assert.rejects(runPlugin({...f,method:'plan',args:[f.bundle,{operations:[{id:'crimson.inventory.addItem',apiVersion:'0.1.0',instanceId:'addition-one',params:{definitionKey:42,quantity:'1'}}],operationDigest:hash('request')}]}),e=>/SCHEMA|UNSUPPORTED/.test(e.code));
});
test('isolated serializer produces an intended-only quantity candidate using a normal pinned synthetic data package',async()=>{
 const f=await fixture(),decoded=await decodeSave(Buffer.from(f.artifacts.get('main'))),pin=readDocument(decoded.plaintext).schemaSha256,data={
  'crimson-items.json':{manifest:{revision:'synthetic.v1',effectiveSha256:'0'.repeat(64)},items:[{key:1000730,name:'Synthetic consumable',internalName:'Synthetic_Consumable',category:'Test',referenceMaxStack:'50'}]},
  'crimson-construction-items.json':{entries:[[1000730,2,'50',0,0,0,false,[],0,0]],unavailable:[],balanceDefinitions:[],columns:[],source:{},runtimeRequirements:{}},
  'crimson-schema-profiles.json':{profiles:[{schemaSha256:pin,requiresHousing:false,evidence:'synthetic_conformance'}]}
 },files=Object.fromEntries(Object.entries(data).map(([id,value])=>['resources/'+id,JSON.stringify(value)])),resources=Object.entries(files).map(([path,bytes])=>({id:path.split('/').at(-1),path,byteLength:Buffer.byteLength(bytes),sha256:hash(bytes)})),dataPackage={manifest:{manifestVersion:'0.1',kind:'data',id:'example.crimson-synthetic-data',version:'0.1.0',license:'Apache-2.0',hostApi:'>=0.1.0 <0.2.0',data:{resources}},files},checked=validatePackage(dataPackage),dataPin={id:dataPackage.manifest.id,version:dataPackage.manifest.version,digest:checked.packageDigest},executionLock=pinExecutionLock({...f.executionLock,dataPacks:[dataPin]}),extra=resources.map(r=>({id:'reference:'+r.id,logicalPath:'data/'+r.id,role:'reference-data',byteLength:r.byteLength,sha256:r.sha256})),bundle=createSaveBundle([...f.bundle.artifacts,...extra],{id:f.bundle.id,hints:f.bundle.hints}),artifacts=new Map([...f.artifacts,...extra.map(a=>[a.id,Buffer.from(files['resources/'+a.logicalPath.split('/').at(-1)])])]),session=await createPluginSession({package:f.package,executionLock,bundle,artifacts},{catalogQuery:q=>({package:dataPin,resource:resources.find(r=>r.id===q.id)})});
 validateExecutionPackages(executionLock,[f.package,dataPackage]);
 try{const operation={instanceId:'synthetic-quantity',id:'crimson.inventory.setQuantity',apiVersion:'0.1.0',params:{inventoryKey:2,definitionKey:1000730,instanceId:'9007199254740993',slot:0,expectedValue:'5',desiredValue:'6'}},candidate=await session.call('plan',[bundle,{operations:[operation],operationDigest:hash('synthetic-approved-log')}]),validation=await session.call('validate',[bundle,candidate]),output=session.artifacts().get(candidate.outputs.find(a=>a.role==='main').id),after=await decodeSave(Buffer.from(output)),diff=readDocument(after.plaintext,{compareTo:decoded.plaintext});assert.equal(validation.checks.every(x=>x.result==='passed'),true);assert.equal(diff.decodedDiff.length,1);assert.equal(diff.decodedDiff[0].field,'_stackCount');assert.equal(diff.decodedDiff[0].before,'5');assert.equal(diff.decodedDiff[0].after,'6');assert.equal(candidate.retainedInputArtifacts.includes('sidecar'),true);assert.equal(candidate.requirements.entitlementClassification,'host_independent_review_required');}finally{session.close();}
});
test('package runtime has no private imports or copied catalog bodies',async()=>{
 const p=await buildCrimsonPackage({write:false});assert.ok(p.files['runtime/connector.mjs'].length>100000);assert.equal(/(?:from\s*|import\s*\()['"](?:node:|https?:)/.test(p.files['runtime/connector.mjs']),false);assert.deepEqual(Object.keys(p.files).filter(x=>x.endsWith('.json')),['data/provider-requirements.json']);assert.equal(JSON.parse(p.files['data/provider-requirements.json']).dataFiles.every(p=>p.included===false),true);assert.equal(p.files['runtime/connector.mjs'].includes('9007199254740993'),false);
});
test('a contributor can inspect an arbitrary typed field and prepare a local fixed-width candidate without a private writer',async()=>{
 const f=await fixture(),session=await createPluginSession(f);try{
  const opened=await session.call('open',[f.bundle]),document=await session.call('query',[opened,{method:'crimson.document'}]),fields=await session.call('query',[opened,{method:'crimson.document.fields',args:{limit:100}}]),field=fields.records.find(r=>r.path.endsWith('._guardHp'));assert.equal(document.apiVersion,'0.1.0');assert.equal(field.value,'777');
  const bytes=await session.call('query',[opened,{method:'crimson.document.bytes',args:{offset:field.offset,length:field.byteLength}}]),replacement=Buffer.alloc(8);replacement.writeBigUInt64LE(778n);
  const operation={id:'crimson.document.patchFixedWidth',apiVersion:'0.1.0',instanceId:'research-one',params:{plaintextSha256:document.plaintextSha256,schemaSha256:document.schemaSha256,patches:[{path:field.path,offset:field.offset,expectedHex:bytes.hex,replacementHex:replacement.toString('hex')}]}},candidate=await session.call('plan',[f.bundle,{operations:[operation],operationDigest:hash(JSON.stringify(operation))}]),validation=await session.call('validate',[f.bundle,candidate]),decoded=await decodeSave(Buffer.from(session.artifacts().get(candidate.outputs.find(a=>a.role==='main').id))),original=await decodeSave(Buffer.from(f.artifacts.get('main'))),diff=readDocument(decoded.plaintext,{compareTo:original.plaintext,onScalar:()=>{}});
  assert.equal(diff.decodedDiff.length,1);assert.equal(diff.decodedDiff[0].field,'_guardHp');assert.equal(diff.decodedDiff[0].before,'777');assert.equal(diff.decodedDiff[0].after,'778');assert.equal(candidate.requirements.experimentalFixedWidthPatch,true);assert.equal(candidate.requirements.entitlementEffects,'unreviewed');assert.equal(candidate.requirements.requiresIndependentHostInspector,true);assert.equal(validation.checks.every(x=>x.result==='passed'),true);
 }finally{session.close();}
});
test('typed research writes reject stale source and schema bytes that are not present scalar locators',async()=>{
 const f=await fixture(),session=await createPluginSession(f);try{
  const opened=await session.call('open',[f.bundle]),document=await session.call('query',[opened,{method:'crimson.document'}]),fields=await session.call('query',[opened,{method:'crimson.document.fields',args:{limit:100}}]),field=fields.records.find(r=>r.path.endsWith('._guardHp')),params={plaintextSha256:document.plaintextSha256,schemaSha256:document.schemaSha256,patches:[{path:field.path,offset:field.offset,expectedHex:'0903000000000000',replacementHex:'0a03000000000000'}]};
  const op=value=>[{id:'crimson.document.patchFixedWidth',apiVersion:'0.1.0',instanceId:'research-invalid',params:value}];
  await assert.rejects(session.call('plan',[f.bundle,{operations:op({...params,plaintextSha256:'0'.repeat(64)}),operationDigest:hash('stale')}]),e=>e.code==='CRIMSON_DOCUMENT_PATCH_BINDING_INVALID');
  await assert.rejects(session.call('plan',[f.bundle,{operations:op({...params,patches:[{...params.patches[0],offset:0}]}),operationDigest:hash('metadata')}]),e=>e.code==='CRIMSON_DOCUMENT_PATCH_LOCATOR_CHANGED');
  await assert.rejects(session.call('query',[opened,{method:'crimson.document.bytes',args:{offset:0,length:4097}}]),e=>e.code==='CRIMSON_DOCUMENT_QUERY_INVALID');
 }finally{session.close();}
});
test('direct SDK callers cannot override a registered operation with a params.operation dispatch key',async()=>{
 const f=await fixture();await assert.rejects(runPlugin({...f,method:'plan',args:[f.bundle,{operations:[{id:'crimson.inventory.setQuantity',apiVersion:'0.1.0',instanceId:'malformed-operation',params:{operation:'cartography.reveal-map'}}],operationDigest:hash('untrusted-dispatch')}]}),e=>e.code==='CRIMSON_OPERATION_UNSUPPORTED');
});
