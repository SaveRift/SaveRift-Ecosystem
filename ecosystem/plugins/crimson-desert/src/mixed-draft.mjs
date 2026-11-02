// One bound, reviewed file assembled by the existing narrow compilers. Each
// stage proves its complete input unchanged outside its own intended scope;
// exact encoded/plaintext hash links compose those proofs into one union.
import {Buffer} from '../../../sdk/buffer.mjs';
import {hash,ProbeError} from './source-binding.mjs';
import {decodeSave,encodeSave,CodecError} from './crimson-codec.mjs';
import {readDocument,DECODER_REVISION} from './crimson-document.mjs';
import {CATALOG_REVISION} from './crimson-domain.mjs';
import {CRIMSON_CURRENT_SCHEMA,createWorkbenchDraft} from './crimson-draft.mjs';
import {assertStructuralPlan,structuralSourcePayload,createStructuralWorkbenchDraft} from './structural-draft.mjs';
import {STRUCTURAL_PLAN_SCHEMA,MAX_STRUCTURAL_OPERATIONS} from './structural-publication-profile.mjs';
import {previewAbyssNexus} from './crimson-abyss-nexus.mjs';
import {previewMapReveal,mapOutputWitness} from './crimson-map-reveal.mjs';
import {preparedSourceNativeParity} from './source-binding.mjs';
export const MIXED_PLAN_SCHEMA='saveglass.mixed-draft-plan.v1';
export const MIXED_PUBLICATION_PROFILE='saveglass-crimson-mixed107.v1';
const common=['schema','container','payload','backupSha256','backupRevision','payloadSha256','plaintextSha256','schemaSha256','decoderRevision','catalogRevision','operations'];
const cartography=['cartography.unlock-nexus','cartography.reveal-map'];
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const mixedPlanDigest=input=>hash(JSON.stringify(canonical(input)));
const fail=(code,message='The combined changes could not be validated together. Your original save is unchanged.',status=409)=>{throw new ProbeError(message,status,code);};
export function assertMixedPlan(input,{schemaPins=[CRIMSON_CURRENT_SCHEMA]}={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==common.length||!common.every(k=>Object.hasOwn(input,k))||input.schema!==MIXED_PLAN_SCHEMA||input.payload!=='save'||!/^slot\d{1,3},savedgame$/.test(input.container||'')||!common.filter(k=>k.endsWith('Sha256')||k==='backupRevision').every(k=>typeof input[k]==='string'&&/^[a-f0-9]{64}$/.test(input[k]))||input.decoderRevision!==DECODER_REVISION||input.catalogRevision!==CATALOG_REVISION||!Array.isArray(input.operations)||!input.operations.length||input.operations.length>MAX_STRUCTURAL_OPERATIONS)fail('MIXED_PLAN_INVALID','Choose up to sixteen supported changes for one save.',400);
 if(!schemaPins.includes(input.schemaSha256))fail('MIXED_SCHEMA_UNSUPPORTED','This save layout cannot combine these changes yet.');
 const recipes=input.operations.filter(op=>cartography.includes(op?.operation)),other=input.operations.filter(op=>!cartography.includes(op?.operation));
 if(!recipes.length||recipes.some(op=>Object.keys(op).length!==1)||new Set(recipes.map(op=>op.operation)).size!==recipes.length)fail('MIXED_RECIPE_INVALID','Choose each supported Cartography change once.',400);
 if(other.length)assertStructuralPlan({...input,schema:STRUCTURAL_PLAN_SCHEMA,operations:other},{allowScalarOnly:true,schemaPins});
 return input;
}
function metadata(raw){const d=readDocument(raw,{captureTypes:[],listLimit:0});return {schemaSha256:d.schemaSha256,plaintextSha256:d.plaintextSha256,audit:d.audit};}
function checkMap(report){const v=report.validation;return report.schema==='saveglass.map-reveal-preview.v1'&&v.bytesOutsideFogRangeUnchanged===true&&v.knowledgeUnchanged===true&&v.discoveriesUnchanged===true&&v.rleJumpingAndLengthsUnchanged===true&&report.nexusUnlock===false&&report.treasureReveal===false&&report.decodedDiff.every(d=>d.operation==='fog.revealMap')&&report.decodedDiff.length<=1;}
function checkNexus(report){const v=report.validation;return report.schema==='saveglass.abyss-nexus-preview.v1'&&v.intendedNexusOnly===true&&v.unrelatedDiscoveriesPreserved===true&&v.fogBytesUnchanged===true&&v.unrelatedKnowledgePreserved===true&&v.originalOpaqueBytesPreserved===true&&report.mapFogReveal===false&&report.questProgressChanged===false&&report.inventoryChanged===false&&report.decodedDiff.every(d=>['knowledge.add','knowledge.setLevel','nexus.discovery.add'].includes(d.operation));}
// Only native code supplies these dependencies/schema pins; no HTTP field can
// inject a compiler, a pin, a donor record or a location into this function.
export function createMixedDraftCompiler({schemaPins=[CRIMSON_CURRENT_SCHEMA],structuralCompiler=createStructuralWorkbenchDraft,scalarCompiler=createWorkbenchDraft,nexusCompiler=previewAbyssNexus,mapCompiler=previewMapReveal}={}){
 if(!Array.isArray(schemaPins)||!schemaPins.length||schemaPins.length>3||schemaPins.some(s=>!/^[a-f0-9]{64}$/.test(s))||[structuralCompiler,scalarCompiler,nexusCompiler,mapCompiler].some(fn=>typeof fn!=='function'))throw Error('Invalid internal mixed compiler configuration.');
 return async function compile(backup,ownedMetadata,suppliedInput,{nonce,retainEncoded=false}={}){
  assertMixedPlan(suppliedInput,{schemaPins});const input=structuredClone(suppliedInput),requestedPlanSha256=mixedPlanDigest(input);if(nonce!==undefined&&(!Buffer.isBuffer(nonce)||nonce.length!==16)||typeof retainEncoded!=='boolean')fail('MIXED_OPTIONS_INVALID');
  // The primary connector has already authenticated and strictly traversed its
  // immutable original. An opaque prepared handle can reuse that exact proof;
  // independent/cloned sources still decode and traverse before composition.
  const {bytes:source,prepared}=structuralSourcePayload(backup,ownedMetadata,input),decoded=prepared?.decoded||await decodeSave(source),before=prepared?.document||metadata(decoded.plaintext);
  if(decoded.version!==2||before.schemaSha256!==input.schemaSha256||before.plaintextSha256!==input.plaintextSha256||before.audit.advisoryLocators||before.audit.unconsumedBytes)fail('MIXED_SOURCE_CHANGED');
  const nonCart=input.operations.filter(op=>!cartography.includes(op.operation)),structural=nonCart.some(op=>['inventory.addItem','companions.add'].includes(op.operation));
  // Exact native children independently prove this same original envelope.
  // Custom compiler seams and cartography-only plans keep the parent proof.
  const nativeChild=nonCart.length&&(structural?structuralCompiler===createStructuralWorkbenchDraft:scalarCompiler===createWorkbenchDraft);
  if(!nativeChild&&!await preparedSourceNativeParity(backup,ownedMetadata,input,decoded,source,encodeSave))fail('MIXED_NATIVE_PARITY_FAILED');
  let working=source,plainHash=before.plaintextSha256,finalMap;const stages=[],diff=[];
  async function accept(domain,result,{operations=false,structural=false,expectedPlanSha256,expectedBindings}={}){
   const {encoded,report}=result||{},v=report?.validation;
   if(!Buffer.isBuffer(encoded)||encoded.length<128||encoded.length>8*1024*1024||!report||!v||!Array.isArray(report.decodedDiff))fail('MIXED_STAGE_CHAIN_INVALID');
   // Hash once after the asynchronous decode, then use these exact checked
   // values throughout the synchronous chain/report assembly.
   const reopened=await decodeSave(encoded),sourceSha256=hash(working),outputSha256=hash(encoded);
   if(report.schemaSha256!==input.schemaSha256||report.beforePlaintextSha256!==plainHash||(operations?report.payloadSha256:report.sourceSha256)!==sourceSha256||(report.encodedSha256||report.outputSha256)!==outputSha256||report.afterPlaintextSha256!==hash(reopened.plaintext)||v.hmacReverified!==true||v.encodedOutputReopened!==true||v.unknownHeaderBytesPreserved!==true)fail('MIXED_STAGE_CHAIN_INVALID');
   if(operations){if(report.planSha256!==expectedPlanSha256||Object.entries(expectedBindings).some(([key,value])=>report[key]!==value)||report.schema!==(structural?'saveglass.structural-draft-preview.v1':'saveglass.crimson-draft-preview.v1'))fail('MIXED_STAGE_INTENT_INVALID');if(report.originalBackupUnchanged!==true||v.allOtherDecodedValuesUnchanged!==true||v.originalNoOpByteParity!==true||structural&&v.stagewiseReverseStructuralByteParity!==true||!structural&&v.allOtherPlaintextBytesUnchanged!==true)fail('MIXED_STAGE_SCOPE_INVALID');}
   else if(report.sourceSaveUnchanged!==true||report.cloudRequests!==0||report.canSend!==false||v.nativeNoOpByteParity!==true||(domain==='unlock-nexus'?!checkNexus(report):!checkMap(report)))fail('MIXED_STAGE_SCOPE_INVALID');
   // Verify the reported chain with actual decrypted output; a successful
   // compiler return or a boolean alone is insufficient source correspondence.
   finalMap=domain==='reveal-map'?{result,source:working}:null;
   stages.push({domain,compilerRevision:report.revision||report.compilerRevision||report.schema,sourceSha256,beforePlaintextSha256:plainHash,outputSha256,afterPlaintextSha256:report.afterPlaintextSha256,decodedDiffRecords:report.decodedDiff.length,decodedDiffSha256:hash(JSON.stringify(canonical(report.decodedDiff))),validation:v,runtimeRequirements:report.runtimeRequirements||[]});
   diff.push(...report.decodedDiff);working=encoded;plainHash=report.afterPlaintextSha256;
  }
  try{
   if(nonCart.length){const structural=nonCart.some(op=>['inventory.addItem','companions.add'].includes(op.operation)),plan=structuredClone({...input,schema:structural?STRUCTURAL_PLAN_SCHEMA:'saveglass.crimson-draft-plan.v1',operations:nonCart}),expectedPlanSha256=mixedPlanDigest(plan),expectedBindings={backupId:ownedMetadata.id,...Object.fromEntries(['backupSha256','backupRevision','container','payload','payloadSha256','schemaSha256','decoderRevision','catalogRevision'].map(key=>[key,input[key]]))};await accept('save-edits',await (structural?structuralCompiler:scalarCompiler)(backup,ownedMetadata,plan,{nonce}),{operations:true,structural,expectedPlanSha256,expectedBindings});}
   for(const operation of cartography)if(input.operations.some(op=>op.operation===operation)){const nexus=operation==='cartography.unlock-nexus';await accept(nexus?'unlock-nexus':'reveal-map',await (nexus?nexusCompiler:mapCompiler)(working,nonce===undefined?{}:{nonce}));}
  }catch(error){if(error instanceof CodecError)throw new ProbeError(error.message,409,error.code);throw error;}
  if(mixedPlanDigest(input)!==requestedPlanSha256||mixedPlanDigest(suppliedInput)!==requestedPlanSha256)fail('MIXED_INTENT_CHANGED');
  if(!diff.length)fail('MIXED_ALREADY_SATISFIED','These changes are already present in the selected save.');
  const reopened=await decodeSave(working),proof=finalMap&&mapOutputWitness(finalMap.result,finalMap.source),encodedSha256=hash(working);
  // The native final map stage already strictly reparsed these exact bytes and
  // re-encoded its output. Recheck its opaque byte/report binding after decode;
  // custom/cloned results retain the complete independent final walk/encode.
  const after=proof?{schemaSha256:proof.schemaSha256,plaintextSha256:hash(reopened.plaintext),audit:proof.audit}:metadata(reopened.plaintext);
  if(proof&&(after.plaintextSha256!==proof.plaintextSha256||encodedSha256!==proof.outputSha256)||after.schemaSha256!==before.schemaSha256||after.plaintextSha256!==plainHash||after.audit.advisoryLocators||after.audit.unconsumedBytes||after.audit.nonzeroListMetadata!==before.audit.nonzeroListMetadata||!working.subarray(0,0x12).equals(source.subarray(0,0x12))||!working.subarray(0x4a,128).equals(source.subarray(0x4a,128))||hash(source)!==input.payloadSha256||!proof&&!(await encodeSave(reopened.plaintext,reopened.header,{nonce:reopened.header.subarray(0x1a,0x2a)})).equals(working))fail('MIXED_REOPEN_FAILED');
  const fullDigest=hash(JSON.stringify(canonical(diff))),summary=()=>[...new Set(diff.map(d=>d.operation))].sort().map(operation=>{const rows=diff.filter(d=>d.operation===operation);return {operation,records:rows.length,recordsSha256:hash(JSON.stringify(canonical(rows)))};});
  const report={schema:'saveglass.mixed-draft-preview.v1',revision:'saverift.mixed-stage-union.2026-11-01.v1',source:'plugin_bundle',backupId:ownedMetadata.id,backupSha256:ownedMetadata.sha256,backupRevision:backup.revision,container:input.container,payload:'save',payloadSha256:input.payloadSha256,schemaSha256:before.schemaSha256,decoderRevision:DECODER_REVISION,catalogRevision:CATALOG_REVISION,beforePlaintextSha256:before.plaintextSha256,afterPlaintextSha256:after.plaintextSha256,encodedSha256,encodedBytes:working.length,planSha256:requestedPlanSha256,operations:input.operations,decodedDiff:retainEncoded?summary():diff,fullDecodedDiffSha256:fullDigest,fullDecodedDiffRecords:diff.length,decodedDiffDetail:retainEncoded?'digest_bound_stage_union':'full_stage_union',stages,runtimeRequirements:stages.flatMap(s=>s.runtimeRequirements),validation:{allOtherDecodedValuesUnchanged:true,stagewiseIntendedOnlyUnion:true,stageEncodedAndPlaintextChainVerified:true,originalNoOpByteParity:true,nativeLz4NoOpByteParity:true,hmacReverified:true,encodedOutputReopened:true,unknownHeaderBytesPreserved:true,nonzeroListMetadataPreserved:true,nonzeroListMetadataBefore:before.audit.nonzeroListMetadata,nonzeroListMetadataAfter:after.audit.nonzeroListMetadata,originalBackupUnchanged:true,finalTypedDocumentReparsed:true,finalValidation:proof?"native-map-byte-proof":"fresh-final-document"},pairedLobbyUnchanged:true,originalBackupUnchanged:true,modifiedSaveStored:false,cloudRequests:0,draftOnly:true,writesEnabled:false,publishEligible:false};
  return retainEncoded?{report,encoded:working}:report;
 };
}
export const compileMixedDraft=createMixedDraftCompiler();
export const createMixedWorkbenchDraft=(backup,metadata,input,{nonce}={})=>compileMixedDraft(backup,metadata,input,{nonce,retainEncoded:true});
