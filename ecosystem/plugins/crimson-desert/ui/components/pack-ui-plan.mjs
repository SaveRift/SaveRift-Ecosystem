// SPDX-License-Identifier: Apache-2.0
// Never accept a recipe preview for a different snapshot or overwrite edits
// that changed while its server-side comparison was running.
import {composedDraftPlan} from './inventory-tools.mjs';
import {structuralOperations,draftOperationLimit} from './structural-plan.mjs';
import {validInventoryKey} from '../../src/inventory-quantity-profile.mjs';
export function packContextKey(backup,report,payload,drafts){return JSON.stringify({backupId:backup.id,backupSha256:report.backupSha256,backupRevision:report.backupRevision,container:payload.container,payload:payload.name,payloadSha256:payload.sha256,drafts});}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const decimal=value=>typeof value==='string'&&/^(0|[1-9]\d{0,19})$/.test(value);
const fail=()=>{throw Error('This pack could not be matched to your current save and exact changes. Open it again before staging.');};
async function planDigest(plan){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(plan))))),value=>value.toString(16).padStart(2,'0')).join('');}
async function assertStructuralCompiledPack(result,{backup,report,payload,recipeRevision,packId}){
  const plan=result.inputPlan,validation=result.validationReport,domains=payload.crimson?.domains,mixed=plan?.schema==='saveglass.mixed-draft-plan.v1';
  if(!domains||result.schema!=='saveglass.crimson-pack-resolution.v1'||!['full','available'].includes(result.selection)||!validation||validation.schema!==(mixed?'saveglass.mixed-draft-preview.v1':'saveglass.structural-draft-preview.v1')||
    result.backupId!==backup.id||result.backupSha256!==report.backupSha256||result.backupRevision!==report.backupRevision||result.container!==payload.container||result.payload!==payload.name||result.payloadSha256!==payload.sha256||
    !Array.isArray(result.combinedDrafts)||result.combinedDrafts.length<1||result.combinedDrafts.length>draftOperationLimit(result.combinedDrafts)||!Array.isArray(result.stagedOperations)||!result.stagedOperations.length||
    recipeRevision&&(result.recipeRevision!==recipeRevision||result.preview?.recipeRevision!==recipeRevision)||packId&&result.preview?.recipe?.id!==packId)fail();
  const expected=composedDraftPlan(backup,report,payload,result.combinedDrafts),combined=structuralOperations(result.combinedDrafts),staged=structuralOperations(result.stagedOperations);
  if(!same(plan,expected)||!same(plan.operations,combined)||!same(staged,structuralOperations(result.preview?.stagedOperations||[]))||staged.some(operation=>!combined.some(candidate=>same(candidate,operation))))fail();
  for(const [key,value]of Object.entries({backupId:backup.id,backupSha256:report.backupSha256,backupRevision:report.backupRevision,container:payload.container,payload:payload.name,payloadSha256:payload.sha256,beforePlaintextSha256:domains.plaintextSha256,schemaSha256:domains.schemaSha256,decoderRevision:domains.decoderRevision,catalogRevision:domains.catalog.revisionId}))if(validation[key]!==value)fail();
  for(const key of ['allOtherDecodedValuesUnchanged',...(mixed?['stagewiseIntendedOnlyUnion']:['stagewiseReverseStructuralByteParity','distinctGlobalNewIdentities']),'hmacReverified','encodedOutputReopened','unknownHeaderBytesPreserved','nonzeroListMetadataPreserved','nativeLz4NoOpByteParity'])if(validation.validation?.[key]!==true)fail();
  if(!Array.isArray(validation.decodedDiff)||!validation.decodedDiff.length||validation.planSha256!==await planDigest(plan))fail();
  return result.combinedDrafts;
}
function intent(draft,{report=false}={}){
  const expansion=draft?.operation==='inventory.setExpansionValue',expected=report?draft?.before:draft?.expectedValue,desired=report?draft?.after:draft?.desiredValue;
  if(!draft||!['inventory.setQuantity','inventory.setCopper','inventory.setExpansionValue'].includes(draft.operation)||!validInventoryKey(draft.inventoryKey)||draft.operation!=='inventory.setQuantity'&&draft.inventoryKey!==2||!decimal(expected)||!decimal(desired)||expected===desired||!report&&draft.schema!=='saveglass.crimson-staged-operation.v1')fail();
  if(report&&(draft.field!==(expansion?'_varyExpandSlotCount':'_stackCount')||draft.objectType!==(expansion?'InventoryElementSaveData':'ItemSaveData')||draft.fieldBytes!==(expansion?2:8)||!Number.isSafeInteger(draft.offset)||draft.offset<0))fail();
  const base={operation:draft.operation,inventoryKey:draft.inventoryKey,expectedValue:expected,desiredValue:desired};
  if(expansion)return base;
  if(!Number.isSafeInteger(draft.definitionKey)||draft.definitionKey<1||!decimal(draft.instanceId)||draft.instanceId==='0'||!Number.isSafeInteger(draft.slot)||draft.slot<0||draft.slot>65535)fail();
  return {...base,definitionKey:draft.definitionKey,instanceId:draft.instanceId,slot:draft.slot};
}
export async function assertCompiledPack(result,{backup,report,payload,recipeRevision,packId}){
  if(['saveglass.structural-draft-plan.v1','saveglass.mixed-draft-plan.v1'].includes(result?.inputPlan?.schema))return assertStructuralCompiledPack(result,{backup,report,payload,recipeRevision,packId});
  const plan=result?.inputPlan,validation=result?.validationReport,domains=payload.crimson?.domains;
  if(!plan||!validation||!domains||result.schema!=='saveglass.crimson-pack-resolution.v1'||!['full','available'].includes(result.selection)||
    result.backupId!==backup.id||result.backupSha256!==report.backupSha256||result.backupRevision!==report.backupRevision||result.container!==payload.container||result.payload!==payload.name||result.payloadSha256!==payload.sha256||
    !Array.isArray(result.combinedDrafts)||result.combinedDrafts.length<1||result.combinedDrafts.length>8||!Array.isArray(result.stagedOperations)||!result.stagedOperations.length||
    plan.schema!=='saveglass.crimson-draft-plan.v1'||validation.schema!=='saveglass.crimson-draft-preview.v1'||
    plan.container!==payload.container||plan.payload!==payload.name||plan.backupSha256!==report.backupSha256||plan.backupRevision!==report.backupRevision||plan.payloadSha256!==payload.sha256||
    plan.plaintextSha256!==domains.plaintextSha256||plan.schemaSha256!==domains.schemaSha256||plan.decoderRevision!==domains.decoderRevision||plan.catalogRevision!==domains.catalog.revisionId||
    validation.backupId!==backup.id||validation.backupSha256!==report.backupSha256||validation.backupRevision!==report.backupRevision||validation.container!==payload.container||validation.payload!==payload.name||validation.payloadSha256!==payload.sha256||
    validation.beforePlaintextSha256!==domains.plaintextSha256||validation.schemaSha256!==domains.schemaSha256||validation.decoderRevision!==domains.decoderRevision||validation.catalogRevision!==domains.catalog.revisionId||
    validation.validation?.allOtherDecodedValuesUnchanged!==true||validation.validation?.allOtherPlaintextBytesUnchanged!==true||validation.validation?.encodedOutputReopened!==true||
    !Array.isArray(plan.operations)||!Array.isArray(validation.operations)||!Array.isArray(validation.decodedDiff))fail();
  if(recipeRevision&&(result.recipeRevision!==recipeRevision||result.preview?.recipeRevision!==recipeRevision)||packId&&result.preview?.recipe?.id!==packId)fail();
  const combined=result.combinedDrafts.map(draft=>intent(draft)),planned=plan.operations.map(operation=>intent({...operation,schema:'saveglass.crimson-staged-operation.v1'})),compiled=validation.operations.map(operation=>intent(operation,{report:true})),staged=result.stagedOperations.map(draft=>intent(draft));
  if(!same(combined,planned)||!same(combined,compiled)||new Set(combined.map(value=>JSON.stringify(canonical(value)))).size!==combined.length||staged.some(operation=>!combined.some(candidate=>same(candidate,operation)))||
    !same(staged,(result.preview?.stagedOperations||[]).map(draft=>intent(draft)))||validation.decodedDiff.length!==compiled.length||validation.validation.intendedDecodedFields!==compiled.length)fail();
  for(const operation of validation.operations){
    const matches=validation.decodedDiff.filter(change=>change.offset===operation.offset&&change.bytes===operation.fieldBytes&&change.objectType===operation.objectType&&change.field===operation.field&&String(change.before)===operation.before&&String(change.after)===operation.after);
    if(matches.length!==1)fail();
  }
  const digest=await planDigest(plan);
  if(validation.planSha256!==digest)fail();
  return result.combinedDrafts;
}

export function packEntryStatus(entry){
  const pending=entry.current!==null&&entry.current!==undefined&&entry.effective!==null&&entry.effective!==undefined&&String(entry.current)!==String(entry.effective);
  if(entry.status==='satisfied')return pending?'Already in your changes':'Already covered';
  if(entry.status==='ready')return 'Ready to stage';
  if(entry.reasonCode==='NONEDITABLE_OWNED_RECORD')return entry.reason||'The existing quantity field could not be verified. This record will be preserved.';
  return entry.reason||'Not available in this save';
}
export function packOwnershipLabel(entry){
  if(entry.reasonCode==='NONEDITABLE_OWNED_RECORD')return 'Owned · unavailable';
  if(entry.reasonCode==='STRUCTURAL_ADDITION_REQUIRED')return 'Not owned';
  return entry.current===null||entry.current===undefined?'Unavailable':String(entry.current);
}
