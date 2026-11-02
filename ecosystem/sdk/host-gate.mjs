// SPDX-License-Identifier: Apache-2.0
// Reference trusted-host gate. This is not an Xbox transport or an MCP write tool.
import {sha256,canonicalJson} from './crypto.mjs';
import {candidateDigest,operationDigest} from './draft.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const clone=v=>JSON.parse(canonicalJson(v));
export function createPublicationGate({registry,validateCurrent,confirm,now=Date.now,randomId,ttlMs=5*60*1000}={}){
 if(!registry||typeof validateCurrent!=='function'||typeof confirm!=='function'||typeof randomId!=='function')fail('HOST_GATE_CONFIGURATION');
 const approvals=new Map();
 const binding=({draft,candidate,destination,policy})=>({draftId:draft.id,draftRevision:draft.revision,accountBindingDigest:draft.accountBindingDigest,sourceRevision:draft.sourceRevision,executionLockDigest:draft.executionLockDigest,operationDigest:operationDigest(draft.operations),candidateDigest:candidateDigest(candidate),destinationDigest:sha256(canonicalJson(destination)),policyDigest:policy.evidenceDigest});
 function checkBindings(context){
  const {draft,candidate,executionLock,policy}=context;
  registry.assertLock(executionLock);
  if(draft.status!=='prepared'||!draft.prepared||draft.prepared.revision!==draft.revision||draft.prepared.candidateDigest!==candidateDigest(candidate)||draft.prepared.policyDigest!==policy.evidenceDigest||draft.prepared.operationDigest!==operationDigest(draft.operations)||candidate.operationDigest!==operationDigest(draft.operations)||candidate.inputBundleDigest!==draft.baseBundleDigest||candidate.executionLockDigest!==executionLock.digest||executionLock.digest!==draft.executionLockDigest||policy.decision!=='allow'||!Number.isFinite(Date.parse(policy.expiresAt))||Date.parse(policy.expiresAt)<=now())fail('HOST_BINDING_CHANGED');
 }
 async function check(context){
  checkBindings(context);const before=canonicalJson(binding(context));
  // Host callback verifies stored source, complete backup, destination/revision,
  // independent policy proof and artifact bytes. Request flags are never proof.
  if(await validateCurrent(context)!==true)fail('HOST_CURRENT_CHECK_FAILED');
  checkBindings(context);if(before!==canonicalJson(binding(context)))fail('HOST_BINDING_CHANGED');
 }
 return Object.freeze({
  async requestApproval(context){await check(context);const bound=binding(context);if(await confirm(clone(bound))!==true)fail('HOST_CONFIRMATION_REQUIRED');await check(context);if(canonicalJson(bound)!==canonicalJson(binding(context)))fail('HOST_BINDING_CHANGED');const id=randomId();if(typeof id!=='string'||id.length<16||approvals.has(id))fail('HOST_APPROVAL_ID_INVALID');const expiresAt=Math.min(now()+ttlMs,Date.parse(context.policy.expiresAt));approvals.set(id,{binding:canonicalJson(bound),expiresAt,state:'approved'});return {approvalId:id,expiresAt};},
  async begin(context,{approvalId}){const record=approvals.get(approvalId);if(!record||record.expiresAt<=now()||record.state!=='approved')fail('HOST_APPROVAL_INVALID');await check(context);if(record.binding!==canonicalJson(binding(context)))fail('HOST_BINDING_CHANGED');
   // Consume synchronously after asynchronous checks, preventing duplicate begins.
   if(record.state!=='approved'||record.expiresAt<=now())fail('HOST_APPROVAL_INVALID');record.state='committing';return {approvalId,binding:clone(binding(context)),transactionState:'committing'};
  },
  settle(approvalId,{outcome,receiptDigest}={}){const r=approvals.get(approvalId);if(!r||!['committing','reconcile'].includes(r.state))fail('HOST_TRANSACTION_INVALID');if(outcome==='unknown'){r.state='reconcile';return {state:r.state,retryAllowed:false};}if(!['committed','not_committed'].includes(outcome)||typeof receiptDigest!=='string'||!/^[a-f0-9]{64}$/.test(receiptDigest))fail('HOST_RECEIPT_REQUIRED');r.state=outcome;return {state:r.state,retryAllowed:false};},
  revokeAll(){for(const r of approvals.values())if(r.state==='approved')r.state='revoked';},
  inspect(approvalId){const r=approvals.get(approvalId);return r?{state:r.state,expiresAt:r.expiresAt}:null;}
 });
}
