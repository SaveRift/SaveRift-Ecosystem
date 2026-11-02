// Source-backed clean companion templates, not live/donor roster cloning.
// Workshop's category selection + ownership-group algorithm is preserved.
import {Buffer} from '../../../sdk/buffer.mjs';
import {getData} from './data-provider.mjs';
const templates=getData('crimson-companion-templates.json');
import {companionAdditionDefinition,companionAdditionSupported,companionAdditionProfile,COMPANION_ADDITION_SCHEMA} from './companion-addition-profile.mjs';
import {companionEnrichment} from './catalog/crimson-enrichment.mjs';
import {decodeSave,encodeSave,CodecError} from './crimson-codec.mjs';
import {field,value,elements} from './crimson-document.mjs';
import {traceStructuralDocument,allocateStructuralItemId,insertTypedRecords} from './crimson-structural-layout.mjs';
import {hash} from './source-binding.mjs';
export {companionAdditionDefinition,companionAdditionSupported,companionAdditionProfile};
const MAX=8*1024*1024,MAX_ID=0xffffffffffffffffn;
const fail=(code,message='This companion record does not match the available game format.')=>{throw new CodecError(message,code);};
const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;},u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const descriptor=f=>[f.name,f.type,f.kind,f.size,f.aux];
function sourceTree(template,key){
 const raw=Buffer.from(template.record,'base64');if(hash(raw)!==template.sha256||raw.length<24||raw.length>16384)fail('CRIMSON_COMPANION_TEMPLATE_INVALID');
 const locators=new Map(template.locators.map(l=>[l.pointerOffset+4,l])),identities=new Map(template.identities.map(i=>[i.offset,i.kind]));let visited=0,identityCount=0;
 function object(start){
  if(start<0||start+23>raw.length)fail('CRIMSON_COMPANION_TEMPLATE_INVALID');const width=raw.readUInt16LE(start),mask=raw.subarray(start+2,start+2+width),typeOffset=start+2+width,payload=typeOffset+15,loc=locators.get(payload),schema=templates.schemas[loc?.type];
  if(width<1||width>16||!schema||!loc||loc.typeOffset!==typeOffset||loc.pointerOffset!==typeOffset+11||raw.readUInt32LE(loc.pointerOffset)!==payload||raw[typeOffset+2]!==0||!raw.subarray(typeOffset+3,typeOffset+11).equals(Buffer.alloc(8,255)))fail('CRIMSON_COMPANION_TEMPLATE_INVALID');
  const node={type:loc.type,schema,fields:new Map(),reserved:Buffer.from(raw.subarray(payload,payload+4))};let at=payload+4;visited++;
  for(let i=0;i<schema.length;i++){
   const[name,,kind,size]=schema[i],present=Boolean(mask[i>>3]&(1<<(i&7)));
   if(!present){if([3,6,7].includes(kind)&&raw[at++]!==1)fail('CRIMSON_COMPANION_TEMPLATE_INVALID');continue;}
   if(kind===0){if(size<1||at+size>raw.length)fail('CRIMSON_COMPANION_TEMPLATE_INVALID');const identity=identities.get(at);if(identity){if(size!==8||!['companion','item'].includes(identity)||raw.readBigUInt64LE(at)!==0n||(identity==='companion'?name!=='_mercenaryNo':name!=='_itemNo'))fail('CRIMSON_COMPANION_TEMPLATE_IDENTITY');identityCount++;}node.fields.set(name,{bytes:Buffer.from(raw.subarray(at,at+size)),identity});at+=size;}
   else if(kind===4){const child=object(at);node.fields.set(name,{node:child.node});at=child.end;}
   else if(kind===6||kind===7){if(raw[at]!==0||at+18>raw.length)fail('CRIMSON_COMPANION_TEMPLATE_INVALID');const count=raw.readUInt32LE(at+1),metadata=Buffer.from(raw.subarray(at+5,at+18)),children=[];if(count>64)fail('CRIMSON_COMPANION_TEMPLATE_INVALID');at+=18;for(let j=0;j<count;j++){const child=object(at);children.push(child.node);at=child.end;}node.fields.set(name,{list:children,metadata});}
   else fail('CRIMSON_COMPANION_TEMPLATE_FIELD_UNSUPPORTED');
  }
  if(at+4>raw.length||raw.readUInt32LE(at)!==at-payload)fail('CRIMSON_COMPANION_TEMPLATE_INVALID');return {node,end:at+4};
 }
 const result=object(0);if(result.end!==raw.length||visited!==template.locators.length||identityCount!==template.identities.length||result.node.type!=='MercenarySaveData'||result.node.fields.get('_characterKey')?.bytes.readUInt32LE()!==key)fail('CRIMSON_COMPANION_TEMPLATE_INVALID');return result.node;
}
function encodeTree(tree,schema,start,allocate){
 const kinds=new Map(schema.types.map(t=>[t.name,t])),assigned=[];
 function object(node,at){
  const type=kinds.get(node.type),pin=templates.nativeTypes[node.type];if(!type||!pin||hash(JSON.stringify(type.fields))!==(pin.signature||pin.sha256)||node.schema.some(f=>!type.fields.some(n=>JSON.stringify(descriptor(n))===JSON.stringify(f))))fail('CRIMSON_COMPANION_DESCRIPTOR_UNSUPPORTED');
  const oldOrder=node.schema.map(f=>type.fields.findIndex(n=>JSON.stringify(descriptor(n))===JSON.stringify(f)));if(oldOrder.some((n,i)=>i>0&&n<=oldOrder[i-1]))fail('CRIMSON_COMPANION_DESCRIPTOR_UNSUPPORTED');
  const extra=type.fields.filter(f=>!node.schema.some(o=>o[0]===f.name)).map(f=>f.name);if(JSON.stringify(extra)!==JSON.stringify(templates.newFieldsOmittedByType[node.type]||[]))fail('CRIMSON_COMPANION_DESCRIPTOR_UNSUPPORTED');
  const mask=Buffer.alloc(Math.ceil(type.fields.length/8));type.fields.forEach((f,i)=>{if(node.fields.has(f.name))mask[i>>3]|=1<<(i&7);});
  const head=Buffer.concat([u16(mask.length),mask,u16(type.index),Buffer.from([0]),Buffer.alloc(8,255),u32(at+17+mask.length)]),parts=[head,node.reserved];let length=head.length+4;const append=b=>{parts.push(b);length+=b.length;};
  for(const f of type.fields){const data=node.fields.get(f.name);if(data?.bytes){const b=Buffer.from(data.bytes);if(data.identity){const id=allocate();b.writeBigUInt64LE(id);data.outputIdentity=id.toString();assigned.push({kind:data.identity,instanceId:id.toString()});}append(b);}else if(data?.node)append(object(data.node,at+length));else if(data?.list){append(Buffer.concat([Buffer.from([0]),u32(data.list.length),data.metadata]));for(const child of data.list)append(object(child,at+length));}else if([3,6,7].includes(f.kind))append(Buffer.from([1]));}
  append(u32(length-head.length));return Buffer.concat(parts);
 }
 return {record:object(tree,start),identities:assigned};
}
function verifyTree(record,tree,raw){
 if(record.type!==tree.type)fail('CRIMSON_COMPANION_INSERTED_DIFF');
 for(const[name,f]of Object.entries(record.fields)){
  const expected=tree.fields.get(name);if(Boolean(f.present)!==Boolean(expected))fail('CRIMSON_COMPANION_INSERTED_DIFF');if(!expected)continue;
  if(expected.bytes){const bytes=Buffer.from(expected.bytes);if(expected.identity)bytes.writeBigUInt64LE(BigInt(expected.outputIdentity));if(!raw.subarray(f.offset,f.end).equals(bytes))fail('CRIMSON_COMPANION_INSERTED_DIFF');}
  else if(expected.node)verifyTree(f.value,expected.node,raw);
  else if(expected.list){const children=elements(record,name);if(f.value?.truncated||f.value.count!==expected.list.length||children.length!==expected.list.length||!f.value.metadataBytes.equals(expected.metadata))fail('CRIMSON_COMPANION_INSERTED_DIFF');children.forEach((child,i)=>verifyTree(child,expected.list[i],raw));}
 }
}
function treeCount(node,type){return Number(node.type===type)+[...node.fields.values()].reduce((n,f)=>n+(f.node?treeCount(f.node,type):f.list?f.list.reduce((m,c)=>m+treeCount(c,type),0):0),0);}
const groupFor=key=>companionAdditionDefinition(key)?.ownershipGroup||`character:${key}`;
export function createCompanionAdditions({schemaPins=[COMPANION_ADDITION_SCHEMA]}={}){
 if(!Array.isArray(schemaPins)||!schemaPins.length||schemaPins.length>3||schemaPins.some(s=>!/^[a-f0-9]{64}$/.test(s)))throw Error('Invalid internal companion schema pins.');
 return async function build(source,inputs,{nonce}={}){
  if(!Buffer.isBuffer(source)||source.length<128||source.length>MAX||!Array.isArray(inputs)||!inputs.length||inputs.length>16||inputs.some(o=>!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).length!==1||!Number.isSafeInteger(o.characterKey)||!companionAdditionSupported(o.characterKey))||nonce!==undefined&&(!Buffer.isBuffer(nonce)||nonce.length!==16))fail('CRIMSON_COMPANION_INPUT_INVALID','Choose companions with a known clean game record.');
  if(hash(JSON.stringify(companionAdditionProfile.entries))!==companionAdditionProfile.entriesSha256||hash(JSON.stringify(templates.templates))!==templates.templatesSha256)fail('CRIMSON_COMPANION_PROFILE_INVALID');
  const sourceHash=hash(source),decoded=await decodeSave(source),trace=traceStructuralDocument(decoded.plaintext,{captureTypes:['MercenaryClanSaveData'],listLimit:1000}),before=trace.document;
  if(decoded.version!==2||!schemaPins.includes(before.schemaSha256)||before.audit.advisoryLocators||before.audit.unconsumedBytes)fail('CRIMSON_COMPANION_SCHEMA_UNSUPPORTED');
  if(!(await encodeSave(decoded.plaintext,decoded.header,{nonce:decoded.header.subarray(0x1a,0x2a)})).equals(source))fail('CRIMSON_COMPANION_NATIVE_PARITY_FAILED');
  const roots=before.blocks.filter(b=>b.type==='MercenaryClanSaveData');if(roots.length!==1)fail('CRIMSON_COMPANION_CLAN_AMBIGUOUS');const list=field(roots[0],'_mercenaryDataList'),rows=elements(roots[0],'_mercenaryDataList');
  if(!list?.present||list.value?.truncated||list.value.count!==rows.length||rows.length<1||rows.length+inputs.length>1000||rows.some(r=>r.type!=='MercenarySaveData'))fail('CRIMSON_COMPANION_CLAN_INCOMPLETE');
  const ownedGroups=new Set(rows.map(r=>groupFor(value(r,'_characterKey')))),selectedGroups=new Set();
  for(const row of rows){const key=value(row,'_characterKey');if(value(row,'_isMainMercenary')===true&&value(row,'_ownedCharacterKey')===1){const definition=companionAdditionDefinition(key);if(definition)selectedGroups.add(definition.category);else if(companionEnrichment(key)?.classification!=='system')fail('CRIMSON_COMPANION_SELECTION_UNMAPPED');}}
  const ids=rows.map(r=>value(r,'_mercenaryNo'));if(ids.some(id=>typeof id!=='string'||!/^[1-9]\d*$/.test(id))||new Set(ids).size!==ids.length)fail('CRIMSON_COMPANION_IDENTITIES_AMBIGUOUS');
  let next=allocateStructuralItemId(trace),position=list.end;const allocated=new Set(),records=[],inserted=[],trees=[];
  function allocate(){for(let tries=0;;tries++){if(next>MAX_ID||tries>4096)fail('CRIMSON_COMPANION_ID_EXHAUSTED');const n=next++,b=Buffer.alloc(8);b.writeBigUInt64LE(n);if(!decoded.plaintext.includes(b)&&!allocated.has(n.toString())){allocated.add(n.toString());return n;}}}
  for(const input of inputs){
   const definition=companionAdditionDefinition(input.characterKey),group=groupFor(input.characterKey);if(ownedGroups.has(group))fail('CRIMSON_COMPANION_ALREADY_OWNED','This companion or another variant using its ownership slot is already owned or queued.');ownedGroups.add(group);
   const selected=!selectedGroups.has(definition.category),state=selected?'selected':'idle',tree=sourceTree(templates.templates[String(input.characterKey)][state],input.characterKey);if(definition.category==='pets'&&treeCount(tree,'ItemSaveData'))fail('CRIMSON_COMPANION_PET_EQUIPMENT_INVALID');
   const built=encodeTree(tree,before.schema,position,allocate),identity=built.identities.find(id=>id.kind==='companion');if(!identity||built.identities.filter(id=>id.kind==='companion').length!==1)fail('CRIMSON_COMPANION_TEMPLATE_IDENTITY');
   records.push(built.record);trees.push(tree);inserted.push({characterKey:input.characterKey,displayName:definition.name,category:definition.category,ownershipGroup:group,instanceId:identity.instanceId,selectedInCategory:selected,templateVariant:state,runtimeRequirement:definition.runtimeRequirement,recordBytes:built.record.length,embeddedItems:treeCount(tree,'ItemSaveData'),identities:built.identities});position+=built.record.length;if(selected)selectedGroups.add(definition.category);
  }
  const edit=insertTypedRecords(trace,list,records),after=edit.trace.document,afterRows=elements(after.blocks.find(b=>b.type==='MercenaryClanSaveData'),'_mercenaryDataList');if(afterRows.length!==rows.length+inputs.length)fail('CRIMSON_COMPANION_INSERTION_COUNT');
  inserted.forEach((entry,i)=>{const row=afterRows[rows.length+i];if(value(row,'_characterKey')!==entry.characterKey||value(row,'_mercenaryNo')!==entry.instanceId||Boolean(value(row,'_isMainMercenary'))!==entry.selectedInCategory||entry.selectedInCategory&&value(row,'_ownedCharacterKey')!==1)fail('CRIMSON_COMPANION_INSERTED_DIFF');verifyTree(row,trees[i],edit.raw);});
  const typedIds=traceStructuralDocument(edit.raw,{captureRelocation:true,captureTypes:[],listLimit:0}).identities.map(i=>i.value);if([...allocated].some(id=>typedIds.filter(v=>v===id).length!==1)||allocated.size!==inserted.reduce((n,r)=>n+r.identities.length,0))fail('CRIMSON_COMPANION_IDENTITY_COLLISION');
  const encoded=await encodeSave(edit.raw,decoded.header,nonce===undefined?{}:{nonce}),reopened=await decodeSave(encoded);if(!reopened.plaintext.equals(edit.raw)||!encoded.subarray(0,0x12).equals(source.subarray(0,0x12))||!encoded.subarray(0x4a,128).equals(source.subarray(0x4a,128))||hash(source)!==sourceHash||!(await encodeSave(reopened.plaintext,reopened.header,{nonce:reopened.header.subarray(0x1a,0x2a)})).equals(encoded))fail('CRIMSON_COMPANION_REOPEN_FAILED');
  if(after.audit.nonzeroListMetadata!==before.audit.nonzeroListMetadata)fail('CRIMSON_COMPANION_METADATA_CHANGED');
  return {encoded,report:{schema:'saverift.companion-addition.v1',revision:companionAdditionProfile.revision,sourceSha256:sourceHash,outputSha256:hash(encoded),schemaSha256:before.schemaSha256,inserted,decodedDiff:inserted.map(r=>({operation:'companions.add',...r})),validation:{nativeNoOpByteParity:true,nativeOutputNoOpByteParity:true,fullTypedReparse:true,originalScalarValuesUnchanged:true,allOtherOriginalScalarValuesUnchanged:true,reverseStructuralByteParity:edit.reverseStructuralByteParity,sourceTemplateLogicalValuesPreserved:true,existingInventoryAndCompanionsUnchanged:true,existingSelectionPreserved:true,newSelectionOnlyWhenCategoryEmpty:true,knownDescriptorFingerprintsMatched:true,globalIdentitiesUnique:true,knowledgeUnchanged:true,hmacReverified:true,encodedOutputReopened:true,unknownHeaderBytesPreserved:true,nonzeroListMetadataBefore:before.audit.nonzeroListMetadata,nonzeroListMetadataAfter:after.audit.nonzeroListMetadata},cloudRequests:0,structuralPublicationEnabled:false,gameAcceptance:'known_clean_record_structure_no_per_definition_console_gate'}};
 };
}
export const buildCompanionAdditions=createCompanionAdditions();
