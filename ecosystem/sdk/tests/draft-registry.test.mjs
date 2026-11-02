// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '../crypto.mjs';
import {createArtifactStore,createBundle,verifyBundle} from '../artifacts.mjs';
import {createExecutionLock,createRegistry,verifyExecutionLock} from '../registry.mjs';
import {validatePackage} from '../contracts.mjs';
import {createDraft,editDraft,operationDigest,bindPreparedDraft} from '../draft.mjs';
import {createPublicationGate} from '../host-gate.mjs';
const d=sha256('example'),pkg={manifest:{manifestVersion:'0.1',id:'example.game',version:'0.1.0',entrypoints:{runtime:'main.mjs',runtimeProfile:'isolated-js-v1'}},files:{'main.mjs':'export default {detect(){return {state:"supported"}}}'}},p={id:pkg.manifest.id,version:pkg.manifest.version,digest:validatePackage(pkg).packageDigest};
const lock=createExecutionLock({connector:p});
const catalog=[{id:'example.set',apiVersion:'0.1.0',owner:'example.game',writeDomains:[{path:'world.camp',mode:'ordered'}],validate:p=>typeof p.value==='number'},{id:'community.modify',apiVersion:'0.1.0',owner:'community.mod',writeDomains:[{path:'world.camp',mode:'exclusive'}],validate:()=>true},{id:'example.dependent',apiVersion:'0.1.0',owner:'example.game',writeDomains:[],requires:['example.set'],validate:()=>true}];
const op={instanceId:'op-1',id:'example.set',apiVersion:'0.1.0',params:{value:1}};
const draft=()=>createDraft({id:'draft-1',baseBundleDigest:d,sourceRevision:d,accountBindingDigest:d,executionLockDigest:lock.digest});
async function registered(){const registry=createRegistry({verifyAttestation:async ({digest})=>digest===p.digest});await registry.add(pkg,{attestation:{fixture:true},review:{result:'approved',reference:'synthetic-review'}});registry.promote(p);return registry;}
test('immutable binary artifact channel verifies copies, lengths, logical paths and bundle digests',()=>{
 const store=createArtifactStore({maxArtifactBytes:3,maxBytes:6,maxArtifacts:2}),input=new Uint8Array([1,2,3]),a=store.put(input,{logicalPath:'world/main',role:'world'});input[0]=9;
 assert.deepEqual([...store.read(a.id)],[1,2,3]);const returned=store.read(a.id);returned[1]=9;assert.equal(store.verify(a),true);
 assert.equal(store.verify({...a,role:'another-sibling'}),false);assert.equal(store.verify({...a,logicalPath:'world/other'}),false);
 const bundle=createBundle([a],{platform:'synthetic'});assert.equal(verifyBundle(bundle,store),true);assert.equal(verifyBundle({...bundle,hints:{platform:'xbox'}},store),false);
 assert.throws(()=>createBundle([a,{...a,logicalPath:'WORLD/MAIN'}]),{code:'BUNDLE_INVALID'});assert.throws(()=>store.put(input,{logicalPath:'../escape'}),{code:'ARTIFACT_INVALID'});assert.throws(()=>store.put(new Uint8Array(4),{logicalPath:'large'}),{code:'ARTIFACT_LIMIT'});
});
test('trusted ingestion retains opaque runner IDs and rejects byte or metadata collisions',()=>{
 const store=createArtifactStore(),bytes=new Uint8Array([1,2]),descriptor={id:'output-1-example',logicalPath:'main.save',role:'main',byteLength:2,sha256:sha256(bytes)};
 store.adopt(descriptor,bytes);assert.equal(store.verify(descriptor),true);assert.equal(verifyBundle(createBundle([descriptor]),store),true);
 assert.throws(()=>store.adopt({...descriptor,logicalPath:'sidecar.save'},bytes),{code:'ARTIFACT_ID_COLLISION'});assert.throws(()=>store.adopt(descriptor,new Uint8Array([3,4])),{code:'ARTIFACT_INVALID'});
});
test('atomic compound operations reject partial updates and cross-package removals',()=>{
 const options={expectedRevision:0,operationCatalog:catalog};
 assert.throws(()=>editDraft(draft(),{type:'stageMany',operations:[op,{...op,instanceId:'bad',params:{value:'invalid'}}],removeInstanceIds:[]},options),{code:'OPERATION_PARAMS_INVALID'});
 const first=editDraft(draft(),{type:'stageMany',operations:[op,{...op,instanceId:'dependent',id:'example.dependent'}],removeInstanceIds:[]},options);assert.equal(first.revision,1);assert.equal(first.operations.length,2);
 assert.throws(()=>editDraft(first,{type:'stageMany',operations:[],removeInstanceIds:['op-1','dependent']},{expectedRevision:1,operationCatalog:catalog,allowedOwners:['community.mod']}),{code:'OPERATION_SCOPE_DENIED'});
 assert.equal(first.operations.length,2);assert.equal(first.revision,1);
 const empty=editDraft(first,{type:'stageMany',operations:[],removeInstanceIds:['op-1','dependent']},{expectedRevision:1,operationCatalog:catalog,allowedOwners:['example.game']});assert.equal(empty.operations.length,0);assert.equal(empty.revision,2);
});
test('registry requires independent review/attestation, immutable versions, pins and scoped revocation',async()=>{
 const r=createRegistry({verifyAttestation:async()=>false});await assert.rejects(r.add(pkg,{review:{result:'approved',reference:'x'}}),{code:'REGISTRY_REVIEW_REQUIRED'});
 const registry=await registered();assert.equal(registry.resolve(p.id).digest,p.digest);assert.equal(verifyExecutionLock(lock),true);assert.equal(verifyExecutionLock({...lock,dataPacks:[p]}),false);
 assert.doesNotThrow(()=>registry.assertLock(lock));registry.revoke(p,{reason:'bad codec',incident:'synthetic-incident'});assert.throws(()=>registry.assertLock(lock),{code:'REGISTRY_UNAVAILABLE'});
 await assert.rejects(registry.add(pkg,{review:{result:'approved',reference:'new'}}),{code:'REGISTRY_REVOKED'});
});
test('canonical draft CAS, conflicts, dependencies, reorder and approval invalidation',()=>{
 let state=editDraft(draft(),{type:'stage',operation:op},{expectedRevision:0,operationCatalog:catalog});assert.equal(state.revision,1);assert.equal(draft().operations.length,0);
 assert.throws(()=>editDraft(state,{type:'remove',instanceId:'op-1'},{expectedRevision:0,operationCatalog:catalog}),{code:'DRAFT_REVISION_CONFLICT'});
 assert.throws(()=>editDraft(state,{type:'stage',operation:{...op,instanceId:'op-2',id:'community.modify'}},{expectedRevision:1,operationCatalog:catalog}),{code:'OPERATION_CONFLICT'});
 state=editDraft(state,{type:'stage',operation:{...op,instanceId:'op-2',id:'example.dependent',params:{}}},{expectedRevision:1,operationCatalog:catalog});
 assert.throws(()=>editDraft(state,{type:'reorder',instanceIds:['op-2','op-1']},{expectedRevision:2,operationCatalog:catalog}),{code:'OPERATION_DEPENDENCY_MISSING'});
 assert.throws(()=>editDraft(state,{type:'remove',instanceId:'op-1'},{expectedRevision:2,operationCatalog:catalog}),{code:'OPERATION_DEPENDENCY_MISSING'});
 const candidate={inputBundleDigest:d,executionLockDigest:lock.digest,operationDigest:operationDigest(state.operations),outputs:[]};
 state=bindPreparedDraft(state,{candidate,validation:{checks:[{result:'passed'}]},policy:{decision:'allow',evidenceDigest:d},executionLock:lock});assert.equal(state.status,'prepared');
 state=editDraft(state,{type:'remove',instanceId:'op-2'},{expectedRevision:2,operationCatalog:catalog});assert.equal(state.prepared,null);assert.equal(state.status,'editing');
});
test('trusted gate binds candidate bytes, account, destination, source, registry and one-use confirmation',async()=>{
 const registry=await registered();let clock=100,confirmations=0;const gate=createPublicationGate({registry,validateCurrent:async()=>true,confirm:async()=>{confirmations++;return true;},now:()=>clock,randomId:()=>String(confirmations).padStart(20,'a'),ttlMs:1000});
 const candidate={inputBundleDigest:d,executionLockDigest:lock.digest,operationDigest:operationDigest([]),outputs:[{sha256:d,byteLength:1}]},policy={decision:'allow',evidenceDigest:d,expiresAt:new Date(100000).toISOString()};
 const state=bindPreparedDraft(draft(),{candidate,validation:{checks:[{result:'passed'}]},policy,executionLock:lock}),context={draft:state,candidate,policy,executionLock:lock,destination:{slot:'empty-1'}};
 const approval=await gate.requestApproval(context);
 await assert.rejects(gate.begin({...context,destination:{slot:'overwrite-1'}},approval),{code:'HOST_BINDING_CHANGED'});
 await assert.rejects(gate.begin({...context,draft:{...state,accountBindingDigest:sha256('other')}},approval),{code:'HOST_BINDING_CHANGED'});
 const results=await Promise.allSettled([gate.begin(context,approval),gate.begin(context,approval)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.deepEqual(gate.settle(approval.approvalId,{outcome:'unknown'}),{state:'reconcile',retryAllowed:false});await assert.rejects(gate.begin(context,approval),{code:'HOST_APPROVAL_INVALID'});
 gate.settle(approval.approvalId,{outcome:'committed',receiptDigest:d});assert.equal(gate.inspect(approval.approvalId).state,'committed');
 const second=await gate.requestApproval(context);clock+=1001;await assert.rejects(gate.begin(context,second),{code:'HOST_APPROVAL_INVALID'});
 const third=await gate.requestApproval(context);registry.revoke(p,{reason:'revoked',incident:'unit-test'});await assert.rejects(gate.begin(context,third),{code:'REGISTRY_UNAVAILABLE'});
});
