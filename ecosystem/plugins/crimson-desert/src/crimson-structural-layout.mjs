// MPL-2.0. Metadata-driven relocation shared by isolated offline controls.
// No route, cloud authorization, item construction or publication policy here.
import {Buffer} from '../../../sdk/buffer.mjs';
import {createScalarDigest} from './scalar-digest.mjs';
import {CodecError} from './crimson-codec.mjs';
import {readDocument} from './crimson-document.mjs';
import {hash} from './source-binding.mjs';
const MAX_ID=0xffffffffffffffffn;
const nativeTraces=new WeakMap();
const fail=code=>{throw new CodecError('The offline structural layout check stopped.',code);};
export function traceStructuralDocument(raw,{skipStart=-1,skipEnd=-1,captureRelocation=true,captureTypes,listLimit,hashPlaintext=true}={}){
 let locatorValues=[],objectValues=[];const identities=[];
 const document=readDocument(raw,{captureTypes,listLimit,hashPlaintext,onLocator:captureRelocation?e=>locatorValues.push(e.pointerOffset,e.advertisedPayloadOffset):undefined,onObject:captureRelocation?e=>{if(e.inline)objectValues.push(e.start,e.trailerOffset);}:undefined,scalarFields:['_itemNo','_mercenaryNo'],onScalar:captureRelocation?e=>{
  if(captureRelocation&&/\._(?:itemNo|mercenaryNo)$/.test(e.path)&&e.bytes===8&&typeof e.value==='string'&&/^[1-9]\d{0,19}$/.test(e.value)&&BigInt(e.value)<=MAX_ID)identities.push({offset:e.offset,value:e.value});
 }:undefined});
 const originalHash=document.plaintextSha256||hash(raw);let fingerprint;
 function scalarProof(){
  if(hash(raw)!==originalHash)fail('CRIMSON_STRUCTURAL_SOURCE_CHANGED');
  if(!fingerprint){const digest=createScalarDigest();readDocument(raw,{captureTypes:[],listLimit:0,hashPlaintext:false,onScalar:e=>{if(e.offset>=skipStart&&e.offset<skipEnd)return;digest.update(e);}});fingerprint=digest.digest();}
  return fingerprint;
 }
 const state={locatorWords:new Uint32Array(locatorValues),objectWords:new Uint32Array(objectValues),locators:null,objects:null};locatorValues=objectValues=null;
 state.locatorsGetter=()=>state.locators??=Array.from({length:state.locatorWords.length/2},(_,i)=>({pointerOffset:state.locatorWords[i*2],advertisedPayloadOffset:state.locatorWords[i*2+1]}));
 state.objectsGetter=()=>state.objects??=Array.from({length:state.objectWords.length/2},(_,i)=>({inline:true,start:state.objectWords[i*2],trailerOffset:state.objectWords[i*2+1]}));
 const result={document,get locators(){return state.locatorsGetter();},get objects(){return state.objectsGetter();},identities,projection:{captureTypes,listLimit,hashPlaintext},get scalarDigest(){return scalarProof().sha256;},get scalarCount(){return scalarProof().count;}};
 state.locatorsDescriptor=Object.getOwnPropertyDescriptor(result,'locators').get;state.objectsDescriptor=Object.getOwnPropertyDescriptor(result,'objects').get;
 if(captureRelocation){
  const lists=new Map();
  function visit(node){if(!node?.fields)return;for(const f of Object.values(node.fields)){if(f.present&&[6,7].includes(f.kind)&&f.value)lists.set(f.offset,{end:f.end,count:f.count});if(f.value?.elements)f.value.elements.forEach(visit);else if(f.value?.fields)visit(f.value);}}
  document.blocks.forEach(visit);
  const before={plaintext:raw,schemaSha256:document.schemaSha256,schema:{streamSize:document.schema.streamSize,dataStart:document.schema.dataStart,toc:document.schema.toc.map(e=>Object.freeze({...e}))},audit:{advisoryLocators:document.audit.advisoryLocators,unconsumedBytes:document.audit.unconsumedBytes}};
  // Native insertion needs compact private words. Legacy metadata rows are
  // materialized only when a caller actually reads or clones them.
  Object.assign(state,{raw,originalHash,before,lists});nativeTraces.set(result,state);
 }
 return result;
}
function nativeTrace(trace,list){
 const proof=nativeTraces.get(trace);if(!proof||proof.consumed)return null;
 if(trace.document.plaintext!==proof.raw||hash(proof.raw)!==proof.originalHash)fail('CRIMSON_STRUCTURAL_SOURCE_CHANGED');
 if(!list||![Object.prototype,null].includes(Object.getPrototypeOf(list))||Object.values(Object.getOwnPropertyDescriptors(list)).some(d=>d.get||d.set)||!list.value||![Object.prototype,null].includes(Object.getPrototypeOf(list.value))||Object.values(Object.getOwnPropertyDescriptors(list.value)).some(d=>d.get||d.set))return null;
 const nativeList=proof.lists.get(list.offset);
 if(Object.getOwnPropertyDescriptor(trace,'locators')?.get!==proof.locatorsDescriptor||Object.getOwnPropertyDescriptor(trace,'objects')?.get!==proof.objectsDescriptor||!nativeList||nativeList.end!==list.end||nativeList.count!==list.value?.count||proof.locators&&(proof.locators.length*2!==proof.locatorWords.length||!proof.locators.every((v,i)=>v.pointerOffset===proof.locatorWords[i*2]&&v.advertisedPayloadOffset===proof.locatorWords[i*2+1]))||proof.objects&&(proof.objects.length*2!==proof.objectWords.length||!proof.objects.every((v,i)=>v.inline===true&&v.start===proof.objectWords[i*2]&&v.trailerOffset===proof.objectWords[i*2+1])))return null;
 return {...proof,list:{offset:list.offset,end:nativeList.end,present:list.present,value:{count:nativeList.count,truncated:list.value.truncated}}};
}
export function releaseStructuralTrace(trace){
 const state=nativeTraces.get(trace);if(!state)return;
 state.locators=state.objects=[];state.locatorWords=state.objectWords=new Uint32Array(0);state.lists.clear();state.before=null;state.raw=null;trace.identities.length=0;nativeTraces.delete(trace);
}
export function allocateStructuralItemId(trace){
 const raw=trace.document.plaintext;
 let next=trace.identities.reduce((m,i)=>BigInt(i.value)!==MAX_ID&&BigInt(i.value)>m?BigInt(i.value):m,0n)+1n,attempts=0;
 for(;;){if(next>MAX_ID||attempts++>=4096)fail('CRIMSON_STRUCTURAL_ID_EXHAUSTED');const b=Buffer.alloc(8);b.writeBigUInt64LE(next);if(!raw.includes(b))return next;next++;}
}
export function insertTypedRecord(trace,list,record){
 return insertTypedRecords(trace,list,[record]);
}
// Internal bounded batch seam for one reviewed list. Records must already have
// exact typed absolute locators for their final positions. No HTTP input here.
export function insertTypedRecords(trace,list,records){
 if(!Array.isArray(records)||records.length<1||records.length>512||records.some(r=>!Buffer.isBuffer(r)||r.length<24||r.length>16384))fail('CRIMSON_STRUCTURAL_LAYOUT_UNSUPPORTED');
 const proof=nativeTrace(trace,list),target=proof?.list||list,before=proof?.before||trace.document,raw=before.plaintext,schema=before.schema,insert=target.end,record=Buffer.concat(records),delta=record.length;
 if(delta>32768||raw.length+delta>8*1024*1024||schema.streamSize!==raw.length||before.audit.advisoryLocators!==0||before.audit.unconsumedBytes!==0||!target.present||target.value?.truncated||!Number.isSafeInteger(target.value?.count)||target.value.count+records.length>100000||raw[target.offset]!==0||raw.readUInt32LE(target.offset+1)!==target.value.count)fail('CRIMSON_STRUCTURAL_LAYOUT_UNSUPPORTED');
 const position=at=>at>=insert?at+delta:at,patched=Buffer.concat([raw.subarray(0,insert),record,raw.subarray(insert)]),patches=new Map();
 function patch(offset,after,reason){
  if(!Number.isSafeInteger(offset)||offset<0||offset+4>raw.length||!Number.isSafeInteger(after)||after<0||after>0xffffffff||offset<insert&&offset+4>insert)fail('CRIMSON_STRUCTURAL_PATCH_BOUNDS');
  const prior=patches.get(offset);if(prior&&prior.after!==after)fail('CRIMSON_STRUCTURAL_PATCH_CONFLICT');const original=raw.readUInt32LE(offset);if(original===after)return;
  patches.set(offset,{offset,before:original,after,reason});patched.writeUInt32LE(after,position(offset));
 }
 patch(target.offset+1,target.value.count+records.length,'list_count');const tocStart=schema.dataStart-schema.toc.length*20;patch(tocStart-4,raw.length+delta,'stream_size');let containing=0;
 // A final list may end exactly where the next root starts. Its list tag,
 // rather than the insertion boundary, identifies the containing root.
 schema.toc.forEach((entry,i)=>{if(entry.offset<=target.offset&&target.offset<entry.offset+entry.bytes){if(insert>entry.offset+entry.bytes)fail('CRIMSON_STRUCTURAL_LAYOUT_UNSUPPORTED');containing++;patch(tocStart+i*20+16,entry.bytes+delta,'containing_toc_size');}else if(entry.offset>=insert)patch(tocStart+i*20+12,entry.offset+delta,'following_toc_offset');});
 if(containing!==1)fail('CRIMSON_STRUCTURAL_LAYOUT_UNSUPPORTED');
 if(proof){
  for(let i=0;i<proof.locatorWords.length;i+=2)if(proof.locatorWords[i+1]>=insert)patch(proof.locatorWords[i],proof.locatorWords[i+1]+delta,'typed_locator_relocation');
  for(let i=0;i<proof.objectWords.length;i+=2)if(proof.objectWords[i]<insert&&insert<=proof.objectWords[i+1])patch(proof.objectWords[i+1],raw.readUInt32LE(proof.objectWords[i+1])+delta,'containing_inline_size');
 }else{
  for(const l of trace.locators)if(l.advertisedPayloadOffset>=insert)patch(l.pointerOffset,l.advertisedPayloadOffset+delta,'typed_locator_relocation');
  for(const o of trace.objects)if(o.inline&&o.start<insert&&insert<=o.trailerOffset)patch(o.trailerOffset,raw.readUInt32LE(o.trailerOffset)+delta,'containing_inline_size');
 }
 // The new private buffer is not exposed until return. Temporarily undo its
 // known metadata words, prove both original byte ranges exactly, then restore
 // the relocation words before the fresh strict parse. No full reverse copy.
 for(const p of patches.values())patched.writeUInt32LE(p.before,position(p.offset));
 const reverseEqual=patched.subarray(0,insert).equals(raw.subarray(0,insert))&&patched.subarray(insert+delta).equals(raw.subarray(insert));
 for(const p of patches.values())patched.writeUInt32LE(p.after,position(p.offset));
 if(!reverseEqual)fail('CRIMSON_STRUCTURAL_UNRELATED_BYTES_CHANGED');
 if(proof&&hash(raw)!==proof.originalHash)fail('CRIMSON_STRUCTURAL_SOURCE_CHANGED');
 const after=traceStructuralDocument(patched,{...trace.projection,skipStart:insert,skipEnd:insert+delta,captureRelocation:false});
 // Native metadata identifies every editable header word and the exact list
 // boundary. Reversing only those words plus the insertion proved all other
 // original bytes identical; the fresh strict walk proves valid relocation.
 // Cloned or changed metadata retains the independent scalar-stream proof.
 if(after.document.schemaSha256!==before.schemaSha256||after.document.audit.advisoryLocators!==0||after.document.audit.unconsumedBytes!==0||!proof&&(after.scalarDigest!==trace.scalarDigest||after.scalarCount!==trace.scalarCount))fail('CRIMSON_STRUCTURAL_SEMANTIC_DIFF');
 if(proof)nativeTraces.get(trace).consumed=true;
 const patchCounts={};for(const p of patches.values())patchCounts[p.reason]=(patchCounts[p.reason]||0)+1;
 return {raw:patched,trace:after,insert,delta,patchCounts,reverseStructuralByteParity:true,conservationProof:proof?'native_metadata_reverse_bytes':'full_scalar_stream'};
}
