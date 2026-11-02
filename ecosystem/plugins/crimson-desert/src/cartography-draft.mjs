// Bound, server-compiled cartography changes. The caller selects a recipe,
// never encoded data, offsets, donor records or arbitrary knowledge IDs.
import {Buffer} from '../../../sdk/buffer.mjs';
import {hash,verifyBackup,ProbeError,assertSourceBinding} from './source-binding.mjs';
import {CodecError} from './crimson-codec.mjs';
import {previewMapReveal} from './crimson-map-reveal.mjs';
import {previewAbyssNexus} from './crimson-abyss-nexus.mjs';

export const CARTOGRAPHY_PLAN_SCHEMA='saveglass.cartography-plan.v1';
export const CARTOGRAPHY_RECIPES=Object.freeze(['reveal-map','unlock-nexus']);
const keys=['schema','container','payload','backupSha256','backupRevision','payloadSha256','plaintextSha256','schemaSha256','recipe'];
const digest=/^[a-f0-9]{64}$/;
const fail=(code,message='This map change no longer matches the selected save. Reload the save and review it again.',status=409)=>{throw new ProbeError(message,status,code);};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const cartographyPlanDigest=input=>hash(JSON.stringify(canonical(input)));
export function assertCartographyPlan(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.length||!keys.every(k=>Object.hasOwn(input,k))||input.schema!==CARTOGRAPHY_PLAN_SCHEMA||input.payload!=='save'||!/^slot\d{1,3},savedgame$/.test(input.container||'')||!CARTOGRAPHY_RECIPES.includes(input.recipe)||!keys.filter(k=>k.endsWith('Sha256')||k==='backupRevision').every(k=>typeof input[k]==='string'&&digest.test(input[k])))fail('CARTOGRAPHY_PLAN_INVALID','Choose one supported map change for one captured save.',400);
 return input;
}

// Compiler seams are private test dependencies, never HTTP parameters.
export function createCartographyDraftCompiler({mapCompiler=previewMapReveal,nexusCompiler=previewAbyssNexus}={}){
 return async function compile(backup,metadata,input,{nonce,retainEncoded=false}={}){
  assertCartographyPlan(input);
  if(nonce!==undefined&&(!Buffer.isBuffer(nonce)||nonce.length!==16))fail('CARTOGRAPHY_NONCE_INVALID');
  assertSourceBinding(backup,metadata,input);
  if(metadata.sha256!==input.backupSha256||backup.revision!==input.backupRevision)fail('CARTOGRAPHY_SOURCE_CHANGED');
  const containers=backup.containers.filter(c=>c.index?.fileName===input.container),container=containers[0];
  if(containers.length!==1||container.blobs.length!==2||container.blobs.filter(b=>b.name==='lobby').length!==1||container.blobs.filter(b=>b.name==='save').length!==1)fail('CARTOGRAPHY_PAYLOAD_REQUIRED');
  const blob=container.blobs.find(b=>b.name==='save'),source=Buffer.from(blob.data,'base64');
  if(source.length!==blob.size||hash(source)!==blob.sha256||blob.sha256!==input.payloadSha256)fail('CARTOGRAPHY_SOURCE_CHANGED');
  let result;try{result=await (input.recipe==='reveal-map'?mapCompiler:nexusCompiler)(source,nonce===undefined?{}:{nonce});}catch(error){if(error instanceof CodecError)throw new ProbeError(error.message,409,error.code);throw error;}
  const {encoded,report}=result,v=report?.validation;
  if(report?.sourceSha256!==input.payloadSha256||report.beforePlaintextSha256!==input.plaintextSha256||report.schemaSha256!==input.schemaSha256||report.outputSha256!==hash(encoded)||report.sourceSaveUnchanged!==true||report.cloudRequests!==0||report.canSend!==false||!v?.nativeNoOpByteParity||!v?.hmacReverified||!v?.encodedOutputReopened||!v?.unknownHeaderBytesPreserved)fail('CARTOGRAPHY_VALIDATION_FAILED');
  if(!Array.isArray(report.decodedDiff)||!report.decodedDiff.length)fail('CARTOGRAPHY_ALREADY_ENABLED','This map change is already enabled in the selected save.');
  if(input.recipe==='reveal-map'&&(report.schema!=='saveglass.map-reveal-preview.v1'||report.decodedDiff.length!==1||report.decodedDiff[0].operation!=='fog.revealMap'||v.bytesOutsideFogRangeUnchanged!==true||v.knowledgeUnchanged!==true||v.discoveriesUnchanged!==true||report.nexusUnlock!==false||report.treasureReveal!==false))fail('CARTOGRAPHY_VALIDATION_FAILED');
  // A knowledge-only Nexus artifact is explicitly rejected. Discovery records
  // are part of the corrected recipe, while fog and unrelated discoveries stay.
  if(input.recipe==='unlock-nexus'&&(report.schema!=='saveglass.abyss-nexus-preview.v1'||report.decodedDiff.some(d=>!['knowledge.add','knowledge.setLevel','nexus.discovery.add'].includes(d.operation))||v.intendedNexusOnly!==true||v.unrelatedDiscoveriesPreserved!==true||v.fogBytesUnchanged!==true||report.mapFogReveal!==false||report.questProgressChanged!==false||report.inventoryChanged!==false))fail('CARTOGRAPHY_VALIDATION_FAILED');
  const compiled={...report,schema:'saveglass.cartography-draft-preview.v1',previewSchema:report.schema,recipe:input.recipe,backupId:metadata.id,backupSha256:metadata.sha256,backupRevision:backup.revision,container:input.container,payload:'save',payloadSha256:blob.sha256,planSha256:cartographyPlanDigest(input),encodedSha256:hash(encoded),originalBackupUnchanged:true,pairedLobbyUnchanged:true,allOtherPayloadsMustRemainUnchanged:true,liveCloudRevisionCheck:'not_performed',draftOnly:true,publishEligible:false,writesEnabled:false,gameAcceptance:input.recipe==='reveal-map'?'owner_verified_map_recipe':'corrected_nexus_recipe_awaiting_game_confirmation'};
  if(retainEncoded&&input.recipe==='unlock-nexus'){
   // Keep the complete intended diff in the read-only preview. The durable job
   // binds it by digest plus per-operation digests, avoiding a 150KiB record
   // exceeding the existing shared-journal limit. Execution recompiles every
   // record from the same source and nonce and compares this digest-bound diff.
   compiled.fullDecodedDiffSha256=hash(JSON.stringify(canonical(report.decodedDiff)));
   compiled.fullDecodedDiffRecords=report.decodedDiff.length;
   compiled.decodedDiffDetail='digest_bound_summary';
   compiled.decodedDiff=[...new Set(report.decodedDiff.map(d=>d.operation))].sort().map(operation=>{const records=report.decodedDiff.filter(d=>d.operation===operation);return {operation,records:records.length,recordsSha256:hash(JSON.stringify(canonical(records)))};});
  }
  return retainEncoded?{report:compiled,encoded}:compiled;
 };
}
export const compileCartographyDraft=createCartographyDraftCompiler();
export const createCartographyWorkbenchDraft=(backup,metadata,input,{nonce}={})=>compileCartographyDraft(backup,metadata,input,{nonce,retainEncoded:true});
