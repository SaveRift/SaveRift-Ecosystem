// MPL-2.0. Fixed map-fog preview. NattKh's _set_fog fills the existing RLE
// code array with 0xFF; Saveglass locates it from exact typed descriptors.
// This module has no cloud access, donor import or publication capability.
import {Buffer} from '../../../sdk/buffer.mjs';
import {decodeSave,encodeSave,CodecError} from './crimson-codec.mjs';
import {readDocument} from './crimson-document.mjs';
import {hash} from './source-binding.mjs';
const mapOutputWitnesses=new WeakMap();
// Only the fixed map writer can register this exact typed/byte-preserving
// result. Serialized receipts, result clones and changed bytes cannot reuse it.
export function mapOutputWitness(result,source){
 const proof=mapOutputWitnesses.get(result);
 if(!proof||!Buffer.isBuffer(source)||!Buffer.isBuffer(result?.encoded)||hash(source)!==proof.sourceSha256||hash(result.encoded)!==proof.outputSha256||hash(JSON.stringify(result.report))!==proof.reportSha256)return null;
 return Object.freeze({...proof});
}

const fogFields=[{name:'_fogRLESaveData',type:'ReflectObject',kind:4,size:8,aux:8}];
const rleFields=[{name:'_jumpingTable',type:'uint32',kind:3,size:4,aux:4096},{name:'_codeList',type:'uint8',kind:3,size:1,aux:4096},{name:'_lengthList',type:'uint8',kind:3,size:1,aux:4096}];
export const MAP_REVEAL_REVISION='saveglass.map-reveal-preview.v1';
export const mapRevealProfile=Object.freeze({
 revision:'crimson-map-fog-ff.v1',schemaSha256:'8427f58057ea9bf6dac35bc139cba163ddb135cfe89d748a2d36b94eec88d668',
 types:{FogSaveData:{fields:fogFields,sha256:hash(JSON.stringify(fogFields))},SimpleRunLengthEncodingSaveData:{fields:rleFields,sha256:hash(JSON.stringify(rleFields))}},
 source:{repository:'NattKh/CRIMSON-DESERT-SAVE-EDITOR-AND-GAME-MODS',commit:'96e7f78fcb00d6cb5615171a7f359f0c2de5b114',file:'CrimsonSaveEditor/gui.py',methods:['_debug_reveal_map','_set_fog'],attribution:'NattKh',permission:'owner_supplied_permission'},
 scope:'fog_rle_code_array_only',fillValue:255,maximumCodeCount:100000
});
const fail=code=>{throw new CodecError('The map-reveal preview stopped at its compatibility check.',code);};
function metadata(raw,{compareTo}={}){
 // Strict traversal still visits every root, list, scalar and array. Release
 // UI projections immediately; this operation needs only schema/audit/diff.
 const d=readDocument(raw,{captureTypes:['FogSaveData'],listLimit:0,hashPlaintext:false,...(compareTo?{compareTo}:{})});
 for(const root of d.blocks)root.fields=null;return d;
}
function locateFog(raw,schema){
 for(const [name,pin] of Object.entries(mapRevealProfile.types)){
  const type=schema.types.find(t=>t.name===name);if(!type||hash(JSON.stringify(type.fields))!==pin.sha256)fail('CRIMSON_MAP_DESCRIPTOR_UNSUPPORTED');
 }
 const roots=schema.toc.map((entry,index)=>({entry,index})).filter(({entry})=>schema.types[entry.classIndex]?.name==='FogSaveData');
 if(!roots.length)fail('CRIMSON_MAP_FOG_UNAVAILABLE');if(roots.length!==1)fail('CRIMSON_MAP_FOG_AMBIGUOUS');
 const {entry,index}=roots[0],end=entry.offset+entry.bytes;
 if(raw.readUInt16LE(entry.offset)!==1||raw[entry.offset+2]!==1)fail('CRIMSON_MAP_FOG_UNAVAILABLE');
 let p=entry.offset+7;
 if(raw.readUInt16LE(p)!==1||raw[p+2]!==7)fail('CRIMSON_MAP_RLE_UNSUPPORTED');
 const typeAt=p+3,type=schema.types[raw.readUInt16LE(typeAt)],payload=typeAt+15;
 if(type?.name!=='SimpleRunLengthEncodingSaveData'||raw[typeAt+2]!==0||!raw.subarray(typeAt+3,typeAt+11).equals(Buffer.alloc(8,255))||raw.readUInt32LE(typeAt+11)!==payload)fail('CRIMSON_MAP_RLE_UNSUPPORTED');
 p=payload+4;const arrays={};
 for(const def of type.fields){
  if(p+5>end||raw[p]!==0)fail('CRIMSON_MAP_RLE_UNSUPPORTED');
  const count=raw.readUInt32LE(p+1),start=p+5,stop=start+count*def.size;
  if(count<1||count>mapRevealProfile.maximumCodeCount||!Number.isSafeInteger(stop)||stop>end)fail('CRIMSON_MAP_RLE_BOUNDS');
  arrays[def.name]={tagOffset:p,count,start,end:stop,bytes:stop-start};p=stop;
 }
 if(p+4!==end||raw.readUInt32LE(p)!==p-payload||arrays._codeList.count!==arrays._lengthList.count)fail('CRIMSON_MAP_RLE_UNSUPPORTED');
 return {entry,index,arrays,code:arrays._codeList,path:`$[${index}].FogSaveData._fogRLESaveData._codeList`};
}

// The schema-pin seam is test-only configuration, never an HTTP parameter.
export function createMapRevealPreview({schemaPins=[mapRevealProfile.schemaSha256]}={}){
 if(!Array.isArray(schemaPins)||!schemaPins.length||schemaPins.length>4||schemaPins.some(s=>!/^[a-f0-9]{64}$/.test(s)))throw Error('Invalid internal map schema pins.');
 return async function preview(source,{nonce}={}){
  if(!Buffer.isBuffer(source)||source.length<128||source.length>8*1024*1024||nonce!==undefined&&(!Buffer.isBuffer(nonce)||nonce.length!==16))fail('CRIMSON_MAP_INPUT_INVALID');
  const sourceHash=hash(source),decoded=await decodeSave(source),before=metadata(decoded.plaintext);
  if(decoded.version!==2||!schemaPins.includes(before.schemaSha256)||before.audit.advisoryLocators!==0||before.audit.unconsumedBytes!==0)fail('CRIMSON_MAP_SCHEMA_UNSUPPORTED');
  const fog=locateFog(decoded.plaintext,before.schema),original=decoded.plaintext.subarray(fog.code.start,fog.code.end);
  if(!(await encodeSave(decoded.plaintext,decoded.header,{nonce:decoded.header.subarray(0x1a,0x2a)})).equals(source))fail('CRIMSON_MAP_NATIVE_PARITY_FAILED');
  let alreadyRevealed=0;for(const byte of original)if(byte===255)alreadyRevealed++;
  const changed=fog.code.count-alreadyRevealed,raw=Buffer.from(decoded.plaintext);if(changed)raw.fill(255,fog.code.start,fog.code.end);
  if(!raw.subarray(0,fog.code.start).equals(decoded.plaintext.subarray(0,fog.code.start))||!raw.subarray(fog.code.end).equals(decoded.plaintext.subarray(fog.code.end)))fail('CRIMSON_MAP_UNRELATED_BYTES_CHANGED');
  const after=metadata(raw,{compareTo:decoded.plaintext}),typed=after.decodedDiff;
  if(after.schemaSha256!==before.schemaSha256||after.audit.advisoryLocators!==0||after.audit.unconsumedBytes!==0||after.audit.nonzeroListMetadata!==before.audit.nonzeroListMetadata||typed.length!==(changed?1:0)||typed.some(d=>d.path!==fog.path||d.objectType!=='SimpleRunLengthEncodingSaveData'||d.field!=='_codeList'||d.offset!==fog.code.tagOffset||d.bytes!==fog.code.count+5))fail('CRIMSON_MAP_INTENDED_DIFF_FAILED');
  for(const name of ['_jumpingTable','_lengthList']){
   const a=fog.arrays[name];if(!raw.subarray(a.start,a.end).equals(decoded.plaintext.subarray(a.start,a.end)))fail('CRIMSON_MAP_RLE_METADATA_CHANGED');
  }
  const encoded=changed?await encodeSave(raw,decoded.header,nonce===undefined?{}:{nonce}):Buffer.from(source),reopened=await decodeSave(encoded);
  if(!reopened.plaintext.equals(raw)||!encoded.subarray(0,0x12).equals(source.subarray(0,0x12))||!encoded.subarray(0x4a,128).equals(source.subarray(0x4a,128))||hash(source)!==sourceHash)fail('CRIMSON_MAP_REOPEN_FAILED');
  if(!(await encodeSave(reopened.plaintext,reopened.header,{nonce:reopened.header.subarray(0x1a,0x2a)})).equals(encoded))fail('CRIMSON_MAP_NATIVE_PARITY_FAILED');
  const result={encoded,report:{schema:MAP_REVEAL_REVISION,revision:mapRevealProfile.revision,status:changed?'preview_ready':'already_revealed',scope:mapRevealProfile.scope,sourceSha256:sourceHash,beforePlaintextSha256:hash(decoded.plaintext),afterPlaintextSha256:hash(raw),schemaSha256:before.schemaSha256,outputSha256:hash(encoded),encodedBytes:encoded.length,coverage:{encodedFogSegments:fog.code.count,fullyRevealedSegmentsBefore:alreadyRevealed,segmentsToReveal:changed,fullyRevealedSegmentsAfter:fog.code.count},decodedDiff:changed?[{operation:'fog.revealMap',path:fog.path,objectType:'SimpleRunLengthEncodingSaveData',field:'_codeList',bytes:fog.code.count,changedBytes:changed,beforeSha256:hash(original),afterSha256:hash(raw.subarray(fog.code.start,fog.code.end)),fillValue:255}]:[],source:mapRevealProfile.source,validation:{nativeNoOpByteParity:true,fullTypedReparse:true,intendedFogArrayOnly:true,bytesOutsideFogRangeUnchanged:true,rleJumpingAndLengthsUnchanged:true,knowledgeUnchanged:true,discoveriesUnchanged:true,treasureStateUnchanged:true,questsUnchanged:true,inventoryCompanionsUnchanged:true,unknownHeaderBytesPreserved:true,hmacReverified:true,encodedOutputReopened:true,nonzeroListMetadataBefore:before.audit.nonzeroListMetadata,nonzeroListMetadataAfter:after.audit.nonzeroListMetadata},sourceSaveUnchanged:true,canSend:false,cloudRequests:0,publicationEnabled:false,gameAcceptance:'unverified_map_recipe',nexusUnlock:false,treasureReveal:false,modifiedDataStored:false}};
  mapOutputWitnesses.set(result,Object.freeze({kind:"native-map-byte-proof",sourceSha256:sourceHash,outputSha256:result.report.outputSha256,plaintextSha256:result.report.afterPlaintextSha256,schemaSha256:before.schemaSha256,audit:Object.freeze({advisoryLocators:after.audit.advisoryLocators,unconsumedBytes:after.audit.unconsumedBytes,nonzeroListMetadata:after.audit.nonzeroListMetadata}),reportSha256:hash(JSON.stringify(result.report))}));
  return result;
 };
}
export const previewMapReveal=createMapRevealPreview();
