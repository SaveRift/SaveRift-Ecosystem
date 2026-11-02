// MPL-2.0. Fixed Abyss Nexus knowledge preview, derived from NattKh's reviewed
// knowledge pack plus the licensed Start Smart field-Nexus discoveries.
// No cloud route, donor progress replacement or publication.
import {Buffer} from '../../../sdk/buffer.mjs';
import {getData} from './data-provider.mjs';
const profile=getData('crimson-abyss-nexus.json');
import {decodeSave,encodeSave,CodecError} from './crimson-codec.mjs';
import {readDocument,field} from './crimson-document.mjs';
import {hash} from './source-binding.mjs';
import {traceStructuralDocument,insertTypedRecords} from './crimson-structural-layout.mjs';
import {addNexusDiscoveries} from './crimson-nexus-discoveries.mjs';

export const ABYSS_NEXUS_REVISION='saveglass.abyss-nexus-preview.v1';
export const abyssNexusProfile=Object.freeze(profile);
const MAX=8*1024*1024,keys=new Map(profile.entries.map(e=>[e.key,e]));
const fail=code=>{throw new CodecError('The Abyss Nexus preview stopped at its compatibility check.',code);};
const pathPattern=/^(\$\[\d+\]\.KnowledgeSaveData\._list\[(\d+)\])\.(_key|_level|_learnedFieldTime|_isNewMark)$/;
function retainKnowledgeProjection(document){
 // Full strict traversal and all scalar callbacks have already completed.
 // The preview needs only this list projection; keep original bytes/schema and
 // audit intact rather than retaining duplicate inventory/quest UI trees.
 for(const root of document.blocks)if(root.type!=='KnowledgeSaveData')root.fields=null;
 return document;
}
function scanKnowledge(raw){
 const rows=new Map();
 const document=readDocument(raw,{onScalar:e=>{
  const m=pathPattern.exec(e.path);if(!m)return;
  const index=Number(m[2]),row=rows.get(index)||{index,fields:{}};
  row.fields[m[3]]={value:e.value,offset:e.offset,bytes:e.bytes,type:e.type};rows.set(index,row);
 }});
 const roots=document.blocks.filter(b=>b.type==='KnowledgeSaveData');if(roots.length!==1)fail('CRIMSON_NEXUS_KNOWLEDGE_AMBIGUOUS');
 const list=field(roots[0],'_list');
 if(!list?.present||list.kind!==6||!Number.isSafeInteger(list.count)||list.count<1||list.count>10000||rows.size!==list.count)fail('CRIMSON_NEXUS_KNOWLEDGE_INCOMPLETE');
 const byKey=new Map();
 for(let i=0;i<list.count;i++){
  const row=rows.get(i),key=row?.fields?._key;
  if(!key||key.type!=='KnowledgeKey'||key.bytes!==4||!Number.isSafeInteger(key.value)||key.value<=0||byKey.has(key.value))fail('CRIMSON_NEXUS_KNOWLEDGE_AMBIGUOUS');
  row.key=key.value;byKey.set(row.key,row);
 }
 retainKnowledgeProjection(document);return {document,list,rows:[...rows.values()].sort((a,b)=>a.index-b.index),byKey};
}
function checkedProfile(schema){
 if(profile.minimumLevel!==1||profile.entries.length!==305||keys.size!==305||hash(JSON.stringify(profile.entries))!==profile.contentSha256||profile.targets.nexusLocationKnowledge!==303||profile.targets.supportingKnowledge!==2||profile.entries.filter(e=>e.internalName.startsWith('Knowledge_AbyssRuins_')).length!==303||profile.entries.some(e=>!e.internalName.startsWith('Knowledge_AbyssRuins_')&&![1000363,1001031].includes(e.key)))fail('CRIMSON_NEXUS_PROFILE_INVALID');
 for(const [name,pin] of Object.entries(profile.nativeSchema.types)){
  const type=schema.types.find(t=>t.name===name);if(!type||hash(JSON.stringify(type.fields))!==pin.sha256)fail('CRIMSON_NEXUS_DESCRIPTOR_UNSUPPORTED');
 }
 return schema.types.find(t=>t.name==='KnowledgeElementSaveData');
}
function freshKnowledge(type,start,key,time){
 // All fields use the current save's exact descriptor. Time comes from that
 // save's own native template; no reference-save field or progress is copied.
 const b=Buffer.alloc(43);b.writeUInt16LE(1,0);b[2]=15;b.writeUInt16LE(type.index,3);b[5]=0;b.fill(255,6,14);b.writeUInt32LE(start+18,14);
 b.writeUInt32LE(0,18);b.writeUInt32LE(key,22);b.writeUInt32LE(1,26);b.writeBigUInt64LE(BigInt(time),30);b[38]=1;b.writeUInt32LE(21,39);return b;
}
function sameFields(a,b,{level=false}={}){
 const names=new Set([...Object.keys(a.fields),...Object.keys(b.fields)]);
 for(const name of names){if(level&&name==='_level')continue;const x=a.fields[name],y=b.fields[name];if(!x||!y||x.type!==y.type||x.bytes!==y.bytes||x.value!==y.value)return false;}return true;
}
function fogPreserved(before,after,insert,delta){
 const types=before.document.schema.types,original=before.document.schema.toc.filter(e=>types[e.classIndex]?.name==='FogSaveData'),updated=after.schema.toc.filter(e=>after.schema.types[e.classIndex]?.name==='FogSaveData');
 if(original.length!==updated.length)return false;
 return original.every((e,i)=>{
  const next=updated[i];if(e.bytes!==next.bytes)return false;
  const expected=Buffer.from(before.document.plaintext.subarray(e.offset,e.offset+e.bytes));
  for(const loc of before.locators)if(loc.pointerOffset>=e.offset&&loc.pointerOffset+4<=e.offset+e.bytes&&loc.advertisedPayloadOffset>=insert)expected.writeUInt32LE(loc.advertisedPayloadOffset+delta,loc.pointerOffset-e.offset);
  return expected.equals(after.plaintext.subarray(next.offset,next.offset+next.bytes));
 });
}

// The pin seam is internal test configuration, never accepted from an HTTP body.
export function createAbyssNexusPreview({schemaPins=[profile.nativeSchema.schemaSha256]}={}){
 if(!Array.isArray(schemaPins)||!schemaPins.length||schemaPins.length>4||schemaPins.some(s=>!/^[a-f0-9]{64}$/.test(s)))throw Error('Invalid internal Nexus schema pins.');
 return async function preview(source,{nonce}={}){
  if(!Buffer.isBuffer(source)||source.length<128||source.length>MAX||nonce!==undefined&&(!Buffer.isBuffer(nonce)||nonce.length!==16))fail('CRIMSON_NEXUS_INPUT_INVALID');
  const sourceHash=hash(source),decoded=await decodeSave(source),before=scanKnowledge(decoded.plaintext),type=checkedProfile(before.document.schema);
  if(decoded.version!==2||!schemaPins.includes(before.document.schemaSha256)||before.document.audit.advisoryLocators!==0||before.document.audit.unconsumedBytes!==0)fail('CRIMSON_NEXUS_SCHEMA_UNSUPPORTED');
  if(!(await encodeSave(decoded.plaintext,decoded.header,{nonce:decoded.header.subarray(0x1a,0x2a)})).equals(source))fail('CRIMSON_NEXUS_NATIVE_PARITY_FAILED');
  const missing=[],changes=[],levelPatches=[];let alreadySatisfied=0,presentBefore=0;
  for(const entry of profile.entries){
   const row=before.byKey.get(entry.key);
   if(!row){missing.push(entry);changes.push({operation:'knowledge.add',key:entry.key,internalName:entry.internalName,displayName:entry.displayName,beforeLevel:null,afterLevel:1});continue;}
   presentBefore++;const level=row.fields._level;
   if(!level||level.type!=='TLevel'||level.bytes!==4||!Number.isSafeInteger(level.value)||level.value<0)fail('CRIMSON_NEXUS_TARGET_LEVEL_UNSUPPORTED');
   if(level.value>=1){alreadySatisfied++;continue;}
   levelPatches.push({key:entry.key,offset:level.offset,before:level.value,after:1});changes.push({operation:'knowledge.setLevel',key:entry.key,internalName:entry.internalName,displayName:entry.displayName,beforeLevel:level.value,afterLevel:1});
  }
  const patched=Buffer.from(decoded.plaintext);for(const p of levelPatches)patched.writeUInt32LE(1,p.offset);
  const restored=Buffer.from(patched);for(const p of levelPatches)restored.writeUInt32LE(p.before,p.offset);if(!restored.equals(decoded.plaintext))fail('CRIMSON_NEXUS_UNRELATED_BYTES_CHANGED');
  const traced=traceStructuralDocument(patched);retainKnowledgeProjection(traced.document);let raw=patched,edit=null,template=null;
  if(missing.length){
   template=before.rows.find(r=>keys.has(r.key)&&r.fields._level?.value>=1&&r.fields._learnedFieldTime?.bytes===8&&r.fields._isNewMark?.bytes===1)||before.rows.find(r=>r.fields._level?.value>=1&&r.fields._learnedFieldTime?.bytes===8&&r.fields._isNewMark?.bytes===1);
   if(!template||!/^\d{1,20}$/.test(String(template.fields._learnedFieldTime.value)))fail('CRIMSON_NEXUS_NATIVE_TEMPLATE_REQUIRED');
   let cursor=before.list.end;const records=missing.map(e=>{const b=freshKnowledge(type,cursor,e.key,template.fields._learnedFieldTime.value);cursor+=b.length;return b;});
   // Ordinary projections retain at most 200 elements. scanKnowledge's scalar
   // stream above independently verified EVERY declared row and unique key.
   // Supply only that proven-complete list metadata to the bounded batch helper.
   const completeList={...before.list,value:{count:before.list.count,truncated:false}};
   edit=insertTypedRecords(traced,completeList,records);raw=edit.raw;
   // The batch helper already verified the full original scalar digest and
   // reverse-byte proof. A fresh final scan below verifies target semantics.
   // Release its duplicate UI projection before that scan and re-encoding.
   edit.trace=null;
  }
  const after=scanKnowledge(raw);
  if(after.list.count!==before.list.count+missing.length||after.document.schemaSha256!==before.document.schemaSha256||after.document.audit.advisoryLocators!==0||after.document.audit.unconsumedBytes!==0||after.document.audit.nonzeroListMetadata!==before.document.audit.nonzeroListMetadata)fail('CRIMSON_NEXUS_REPARSE_FAILED');
  for(const row of before.rows){const next=after.byKey.get(row.key),changed=levelPatches.some(p=>p.key===row.key);if(!next||!sameFields(row,next,{level:changed})||changed&&next.fields._level?.value!==1)fail('CRIMSON_NEXUS_SEMANTIC_DIFF');}
  for(const entry of profile.entries){const row=after.byKey.get(entry.key);if(!row||row.fields._level?.value<1)fail('CRIMSON_NEXUS_TARGET_MISSING');}
  for(const entry of missing){const row=after.byKey.get(entry.key);if(row.fields._level?.value!==1||row.fields._learnedFieldTime?.value!==template.fields._learnedFieldTime.value||row.fields._isNewMark?.value!==true||Object.keys(row.fields).length!==4)fail('CRIMSON_NEXUS_INSERTED_DEFAULT_MISMATCH');}
  if(!fogPreserved(traced,after.document,edit?.insert??raw.length,edit?.delta??0))fail('CRIMSON_NEXUS_FOG_CHANGED');
  const discoveries=addNexusDiscoveries(raw);raw=discoveries.raw;
  const changed=changes.length+discoveries.decodedDiff.length;
  const encoded=changed?await encodeSave(raw,decoded.header,nonce===undefined?{}:{nonce}):Buffer.from(source),reopened=await decodeSave(encoded);
  if(!reopened.plaintext.equals(raw)||!encoded.subarray(0,0x12).equals(source.subarray(0,0x12))||!encoded.subarray(0x4a,128).equals(source.subarray(0x4a,128))||hash(source)!==sourceHash)fail('CRIMSON_NEXUS_REOPEN_FAILED');
  if(!(await encodeSave(reopened.plaintext,reopened.header,{nonce:reopened.header.subarray(0x1a,0x2a)})).equals(encoded))fail('CRIMSON_NEXUS_NATIVE_PARITY_FAILED');
  const decodedDiff=changes.map(change=>change.operation==='knowledge.add'?{...change,objectType:'KnowledgeElementSaveData',before:null,after:{_key:change.key,_level:1,_learnedFieldTime:template.fields._learnedFieldTime.value,_isNewMark:true}}:{...change,objectType:'KnowledgeElementSaveData',field:'_level'});
  return {encoded,report:{schema:ABYSS_NEXUS_REVISION,revision:'crimson-abyss-nexus-knowledge-discovery.v2',status:changed?'preview_ready':'already_satisfied',scope:'nexus_knowledge_and_missing_field_discoveries',sourceSha256:sourceHash,beforePlaintextSha256:hash(decoded.plaintext),afterPlaintextSha256:hash(raw),schemaSha256:before.document.schemaSha256,outputSha256:hash(encoded),encodedBytes:encoded.length,targets:profile.targets,coverage:{presentBefore,missingBefore:missing.length,levelsBelowMinimum:levelPatches.length,alreadySatisfied,addedRecords:missing.length,updatedLevels:levelPatches.length,beforeKnowledgeRecords:before.list.count,afterKnowledgeRecords:after.list.count,...discoveries.coverage},decodedDiff:[...decodedDiff,...discoveries.decodedDiff],source:profile.source,discoverySource:discoveries.source,selection:profile.selection,template:template?{source:'same_save_native_knowledge_record',key:template.key,learnedFieldTime:'preserved_same_save_template',newMark:true}:null,validation:{nativeNoOpByteParity:true,fullTypedReparse:true,intendedKnowledgeOnly:false,intendedNexusOnly:true,...discoveries.validation,unrelatedKnowledgePreserved:true,existingHigherLevelsPreserved:true,fogBytesUnchanged:true,originalOpaqueBytesPreserved:true,unknownHeaderBytesPreserved:true,hmacReverified:true,encodedOutputReopened:true,reverseStructuralByteParity:!missing.length||edit.reverseStructuralByteParity,nonzeroListMetadataBefore:before.document.audit.nonzeroListMetadata,nonzeroListMetadataAfter:after.document.audit.nonzeroListMetadata},sourceSaveUnchanged:true,canSend:false,cloudRequests:0,publicationEnabled:false,gameAcceptance:'unverified_nexus_discovery_recipe',mapFogReveal:false,questProgressChanged:false,inventoryChanged:false}};
 };
}
export const previewAbyssNexus=createAbyssNexusPreview();
