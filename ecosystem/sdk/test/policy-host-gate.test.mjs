// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,validatePackage} from '../contracts.mjs';
import {createExecutionLock,createRegistry} from '../registry.mjs';
import {createDraft,editDraft,operationDigest,bindPreparedDraft,candidateDigest} from '../draft.mjs';
import {createPublicationGate} from '../host-gate.mjs';
import {createEntitlementPolicy} from '../entitlements.mjs';

const h=value=>value.repeat(64),original={bundleDigest:h('b')},account=h('c'),sourceRevision=h('d');
const pkg={manifest:{manifestVersion:'0.1',id:'example.game',kind:'game',version:'1',entrypoints:{runtime:'main.mjs',runtimeProfile:'isolated-js-v1'}},files:{'main.mjs':'export default { detect(){return {state:"supported"}} };'}};
const pin={id:pkg.manifest.id,version:pkg.manifest.version,digest:validatePackage(pkg).packageDigest};
const lock=createExecutionLock({connector:pin});
const operation={instanceId:'op-1',id:'example.game.set',apiVersion:'1',params:{count:2}};
const operationCatalog=[{id:operation.id,apiVersion:'1',owner:pin.id,writeDomains:[{path:'base.record',mode:'ordered'}],validate:value=>Number.isSafeInteger(value.count)}];
const destination={slot:'synthetic-empty-slot'};
const createIntent=()=>editDraft(createDraft({id:'draft-1',baseBundleDigest:original.bundleDigest,sourceRevision,accountBindingDigest:account,executionLockDigest:lock.digest}),{type:'stage',operation},{expectedRevision:0,operationCatalog});
async function setup(){
  const registry=createRegistry({verifyAttestation:async()=>true});await registry.add(pkg,{review:{result:'approved',reference:'synthetic-review'},attestation:{synthetic:true}});registry.promote(pin);
  let clock=Date.parse('2026-11-02T12:00:00Z'),counter=0;
  const policy=createEntitlementPolicy({now:()=>clock,classifiers:[{id:'example.inspector',digest:h('e'),connectorDigest:pin.digest,catalogDigests:[],reviewed:true,inspectTransition:async({original,candidate})=>({originalDigest:original.bundleDigest,candidateDigest:digest(candidate),complete:true,coverage:'complete_transition',changes:[{recordId:'base-instance',change:'modified',classification:'base'}]})}]});
  const draft=createIntent(),candidate={id:'candidate-1',inputBundleDigest:original.bundleDigest,executionLockDigest:lock.digest,operationDigest:operationDigest(draft.operations),outputs:[{id:'result-main',sha256:h('f'),byteLength:42}],retainedInputArtifacts:[]};
  const evidence=await policy.evaluate({original,candidate,executionLock:lock,accountBindingDigest:account,destinationBindingDigest:digest(destination),product:'synthetic',platform:'synthetic'});
  const state=bindPreparedDraft(draft,{candidate,executionLock:lock,validation:{checks:[{checkId:'synthetic-reopen',result:'passed',required:true}]},policy:evidence});
  const validateCurrent=async context=>policy.verify(context.policy,{originalDigest:original.bundleDigest,candidateDigest:candidateDigest(context.candidate),executionLockDigest:context.executionLock.digest,accountBindingDigest:context.draft.accountBindingDigest,destinationBindingDigest:digest(context.destination),product:'synthetic',platform:'synthetic',now:clock});
  const gate=createPublicationGate({registry,validateCurrent,confirm:async()=>true,now:()=>clock,randomId:()=>`synthetic-approval-${++counter}`});
  return {registry,policy,gate,validateCurrent,context:{draft:state,candidate,executionLock:lock,policy:evidence,destination},clock:()=>clock,setClock:value=>{clock=value;}};
}
test('a prepared draft uses independently issued complete-candidate policy through the real trusted gate',async()=>{
  const {gate,context}=await setup(),approval=await gate.requestApproval(context);const transaction=await gate.begin(context,approval);assert.equal(transaction.transactionState,'committing');
  // Reference gate starts no storage request; no Xbox transport exists here.
  assert.deepEqual(gate.settle(approval.approvalId,{outcome:'unknown'}),{state:'reconcile',retryAllowed:false});
});
test('forged checksum-valid policy is rejected by issuer provenance before approval',async()=>{
  const {gate,context}=await setup(),forged=JSON.parse(JSON.stringify(context.policy));delete forged.evidenceDigest;forged.evidenceDigest=digest(forged);
  assert.equal(forged.evidenceDigest,context.policy.evidenceDigest);
  await assert.rejects(gate.requestApproval({...context,policy:forged}),{code:'HOST_CURRENT_CHECK_FAILED'});
});
test('account, destination, candidate, operation, expiry and source substitutions invalidate trusted review',async()=>{
  const {gate,context,setClock,clock}=await setup(),approval=await gate.requestApproval(context);
  for(const changed of [
    {...context,destination:{slot:'overwrite-other'}},
    {...context,draft:{...context.draft,accountBindingDigest:h('0')}},
    {...context,draft:{...context.draft,sourceRevision:h('0')}},
    {...context,candidate:{...context.candidate,outputs:[{...context.candidate.outputs[0],sha256:h('0')}]}},
    {...context,draft:{...context.draft,operations:[{...operation,params:{count:100}}]}}
  ])await assert.rejects(gate.begin(changed,approval));
  setClock(clock()+300001);await assert.rejects(gate.begin(context,approval),{code:'HOST_APPROVAL_INVALID'});
});
test('revocation during asynchronous policy verification prevents approval or commit',async()=>{
  const {registry,validateCurrent,context}=await setup();let revoke=false,counter=0;
  // A wall clock consistent with the policy fixture is required for this test.
  const approvalGate=createPublicationGate({registry,validateCurrent:async value=>{const accepted=await validateCurrent(value);if(revoke)registry.revoke(pin,{reason:'synthetic-revocation',incident:'test-race'});return accepted;},confirm:async()=>true,randomId:()=>`synthetic-approval-race-${++counter}`,now:()=>Date.parse('2026-11-02T12:00:00Z')});
  const approval=await approvalGate.requestApproval(context);revoke=true;await assert.rejects(approvalGate.begin(context,approval),{code:'REGISTRY_UNAVAILABLE'});
});
