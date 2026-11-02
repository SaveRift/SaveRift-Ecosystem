// Offline, owned-snapshot pack resolution. All cloud publication still goes
// through the separately confirmed workbench job; this module cannot fetch,
// lock, upload, retain modified bytes or change an account connection.
import {Buffer} from '../../../sdk/buffer.mjs';
import {ProbeError,verifyBackup,assertSourceBinding} from './source-binding.mjs';
import {decodeSave} from './crimson-codec.mjs';
import {readDocument,DECODER_REVISION} from './crimson-document.mjs';
import {normalizeCrimson,CATALOG_REVISION} from './crimson-domain.mjs';
import {compileCrimsonDraft} from './crimson-draft.mjs';
import {compileStructuralDraft} from './structural-draft.mjs';
import {STRUCTURAL_PLAN_SCHEMA,MAX_STRUCTURAL_OPERATIONS} from './structural-publication-profile.mjs';
import {MIXED_PLAN_SCHEMA,compileMixedDraft} from './mixed-draft.mjs';
import {PACK_REVISION,getPackRecipe,previewPack,stagePack,PackError} from './catalog/crimson-packs.mjs';

const SCID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/,GUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fail=(code,message,status=409)=>{throw new ProbeError(message,status,code);};
function validate(backup,metadata,input){
  if(!exact(input,['container','payload','packId','recipeRevision','selection','drafts'])||!/^slot\d{1,3},savedgame$/.test(input.container||'')||input.payload!=='save'||typeof input.packId!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.packId)||!['review','full','available'].includes(input.selection)||!Array.isArray(input.drafts)||input.drafts.length>MAX_STRUCTURAL_OPERATIONS)fail('PACK_INPUT_INVALID',`Choose a current pack and one source save, with at most ${MAX_STRUCTURAL_OPERATIONS} reviewed changes.`,400);
  if(input.recipeRevision!==PACK_REVISION)fail('PACK_RECIPE_STALE','The pack recipe changed. Reopen the pack before staging it.');
  if(!getPackRecipe(input.packId))fail('PACK_NOT_FOUND','Choose a pack from the current catalog.',404);
  assertSourceBinding(backup,metadata);
}
function inputPlan(backup,metadata,payload,domains,container,drafts){return {
  schema:drafts.some(d=>d.operation.startsWith('cartography.'))?MIXED_PLAN_SCHEMA:drafts.some(d=>['inventory.addItem','companions.add'].includes(d.operation))?STRUCTURAL_PLAN_SCHEMA:'saveglass.crimson-draft-plan.v1',container,payload:'save',backupSha256:metadata.sha256,backupRevision:backup.revision,payloadSha256:payload.sha256,plaintextSha256:domains.plaintextSha256,schemaSha256:domains.schemaSha256,decoderRevision:DECODER_REVISION,catalogRevision:CATALOG_REVISION,
  operations:drafts.map(({operation,inventoryKey,expectedValue,desiredValue,definitionKey,instanceId,slot,quantity,characterKey})=>operation.startsWith('cartography.')?{operation}:operation==='inventory.addItem'?{operation,definitionKey,quantity}:operation==='companions.add'?{operation,characterKey}:{operation,inventoryKey,expectedValue,desiredValue,...(operation==='inventory.setExpansionValue'?{}:{definitionKey,instanceId,slot})})
};}
export async function previewCrimsonPack(backup,metadata,input){
  validate(backup,metadata,input);
  const containers=backup.containers.filter(c=>c.index.fileName===input.container),payloads=containers.length===1?containers[0].blobs.filter(p=>p.name===input.payload):[];
  if(payloads.length!==1)fail('PACK_SOURCE_MISSING','The selected save is missing or ambiguous in this snapshot.');
  const payload=payloads[0],bytes=Buffer.from(payload.data,'base64');
  if(bytes.length>8*1024*1024||bytes.toString('base64')!==payload.data||!HASH.test(payload.sha256||''))fail('PACK_SOURCE_INVALID','The selected payload could not be verified.');
  const decoded=await decodeSave(bytes),domains=normalizeCrimson(readDocument(decoded.plaintext,{fieldListLimits:{'InventoryElementSaveData._itemList':1024,'MercenaryClanSaveData._mercenaryDataList':1000}}),{saveVersion:decoded.version});
  let preview,stagedOperations=[],combinedDrafts=[],plan=null,validationReport=null;
  try{
    if(input.selection==='review')preview=previewPack(input.packId,{domains,drafts:input.drafts});
    else{
      const staged=stagePack(input.packId,{domains,drafts:input.drafts,selection:input.selection});preview=staged.preview;stagedOperations=staged.stagedOperations;combinedDrafts=staged.combinedDrafts;
      plan=inputPlan(backup,metadata,payload,domains,input.container,combinedDrafts);
      validationReport=await (plan.schema===MIXED_PLAN_SCHEMA?compileMixedDraft:plan.schema===STRUCTURAL_PLAN_SCHEMA?compileStructuralDraft:compileCrimsonDraft)(backup,metadata,plan);
    }
  }catch(error){if(error instanceof PackError)fail(error.code,error.message,error.status);throw error;}
  const protectedReference=input.container==='slot108,savedgame';
  if(protectedReference)preview={...preview,canStageFull:false,canStageAvailable:false,mergeConflict:'This clean reference save is protected. Choose another save to stage a pack.',protectedReference:true};
  return {schema:'saveglass.crimson-pack-resolution.v1',source:'plugin_bundle',backupId:metadata.id,backupSha256:metadata.sha256,backupRevision:backup.revision,container:input.container,payload:input.payload,payloadSha256:payload.sha256,recipeRevision:PACK_REVISION,selection:input.selection,preview,stagedOperations,combinedDrafts,inputPlan:plan,validationReport,
    originalBackupUnchanged:true,modifiedSaveStored:false,encodedBytesReturned:false,cloudRequests:0,cloudWritesEnabled:false,structuralAdditionsEnabled:preview.structuralAdditionsEnabled,commercialDeliveryEnabled:false,
    message:validationReport?'The exact combined draft passed intended-only comparison and encrypted re-open validation. Use the separate Send to Xbox review to publish it.':'Pack contents and eligibility were resolved against the selected original. No changes have been staged or sent by this review.'};
}
