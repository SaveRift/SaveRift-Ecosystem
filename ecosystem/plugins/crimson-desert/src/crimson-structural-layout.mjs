// MPL-2.0. Metadata-driven relocation shared by isolated offline controls.
// No route, cloud authorization, item construction or publication policy here.
import {Buffer} from '../../../sdk/buffer.mjs';
import {createHash} from '../../../sdk/crypto.mjs';
import {CodecError} from './crimson-codec.mjs';
import {readDocument} from './crimson-document.mjs';
const MAX_ID=0xffffffffffffffffn;
const fail=code=>{throw new CodecError('The offline structural layout check stopped.',code);};
export function traceStructuralDocument(raw,{skipStart=-1,skipEnd=-1,captureRelocation=true,captureTypes,listLimit}={}){
 const locators=[],objects=[],identities=[],digest=createHash('sha256');let scalarCount=0;
 const document=readDocument(raw,{captureTypes,listLimit,onLocator:captureRelocation?e=>locators.push({pointerOffset:e.pointerOffset,advertisedPayloadOffset:e.advertisedPayloadOffset}):undefined,onObject:captureRelocation?e=>{if(e.inline)objects.push({inline:true,start:e.start,trailerOffset:e.trailerOffset});}:undefined,onScalar:e=>{
  if(captureRelocation&&/\._(?:itemNo|mercenaryNo)$/.test(e.path)&&e.bytes===8&&typeof e.value==='string'&&/^[1-9]\d{0,19}$/.test(e.value)&&BigInt(e.value)<=MAX_ID)identities.push({offset:e.offset,value:e.value});
  if(e.offset>=skipStart&&e.offset<skipEnd)return;
  digest.update(JSON.stringify([e.path,e.type,e.bytes,e.value])+'\n');scalarCount++;
 }});
 return {document,locators,objects,identities,projection:{captureTypes,listLimit},scalarDigest:digest.digest('hex'),scalarCount};
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
 const before=trace.document,raw=before.plaintext,schema=before.schema,insert=list.end,record=Buffer.concat(records),delta=record.length;
 if(delta>32768||raw.length+delta>8*1024*1024||schema.streamSize!==raw.length||before.audit.advisoryLocators!==0||before.audit.unconsumedBytes!==0||!list.present||list.value?.truncated||!Number.isSafeInteger(list.value?.count)||list.value.count+records.length>100000||raw[list.offset]!==0||raw.readUInt32LE(list.offset+1)!==list.value.count)fail('CRIMSON_STRUCTURAL_LAYOUT_UNSUPPORTED');
 const position=at=>at>=insert?at+delta:at,patched=Buffer.concat([raw.subarray(0,insert),record,raw.subarray(insert)]),patches=new Map();
 function patch(offset,after,reason){
  if(!Number.isSafeInteger(offset)||offset<0||offset+4>raw.length||!Number.isSafeInteger(after)||after<0||after>0xffffffff||offset<insert&&offset+4>insert)fail('CRIMSON_STRUCTURAL_PATCH_BOUNDS');
  const prior=patches.get(offset);if(prior&&prior.after!==after)fail('CRIMSON_STRUCTURAL_PATCH_CONFLICT');const original=raw.readUInt32LE(offset);if(original===after)return;
  patches.set(offset,{offset,before:original,after,reason});patched.writeUInt32LE(after,position(offset));
 }
 patch(list.offset+1,list.value.count+records.length,'list_count');const tocStart=schema.dataStart-schema.toc.length*20;patch(tocStart-4,raw.length+delta,'stream_size');let containing=0;
 // A final list may end exactly where the next root starts. Its list tag,
 // rather than the insertion boundary, identifies the containing root.
 schema.toc.forEach((entry,i)=>{if(entry.offset<=list.offset&&list.offset<entry.offset+entry.bytes){if(insert>entry.offset+entry.bytes)fail('CRIMSON_STRUCTURAL_LAYOUT_UNSUPPORTED');containing++;patch(tocStart+i*20+16,entry.bytes+delta,'containing_toc_size');}else if(entry.offset>=insert)patch(tocStart+i*20+12,entry.offset+delta,'following_toc_offset');});
 if(containing!==1)fail('CRIMSON_STRUCTURAL_LAYOUT_UNSUPPORTED');
 for(const l of trace.locators)if(l.advertisedPayloadOffset>=insert)patch(l.pointerOffset,l.advertisedPayloadOffset+delta,'typed_locator_relocation');
 for(const o of trace.objects)if(o.inline&&o.start<insert&&insert<=o.trailerOffset)patch(o.trailerOffset,raw.readUInt32LE(o.trailerOffset)+delta,'containing_inline_size');
 const reversed=Buffer.concat([patched.subarray(0,insert),patched.subarray(insert+delta)]);for(const p of patches.values())reversed.writeUInt32LE(p.before,p.offset);
 if(!reversed.equals(raw))fail('CRIMSON_STRUCTURAL_UNRELATED_BYTES_CHANGED');
 const after=traceStructuralDocument(patched,{...trace.projection,skipStart:insert,skipEnd:insert+delta,captureRelocation:false});
 if(after.document.schemaSha256!==before.schemaSha256||after.document.audit.advisoryLocators!==0||after.document.audit.unconsumedBytes!==0||after.scalarDigest!==trace.scalarDigest||after.scalarCount!==trace.scalarCount)fail('CRIMSON_STRUCTURAL_SEMANTIC_DIFF');
 const patchCounts={};for(const p of patches.values())patchCounts[p.reason]=(patchCounts[p.reason]||0)+1;
 return {raw:patched,trace:after,insert,delta,patchCounts,reverseStructuralByteParity:true};
}
