// Schema-driven fresh catalog-item construction. No donor state or cloud
// operations; destination and clean defaults come from pinned source data.
import {Buffer} from '../../../sdk/buffer.mjs';
import {decodeSave,encodeSave,CodecError} from './crimson-codec.mjs';
import {readDocument,field,value,elements} from './crimson-document.mjs';
import {traceStructuralDocument,allocateStructuralItemId,insertTypedRecords} from './crimson-structural-layout.mjs';
import {getData} from './data-provider.mjs';
const gear=getData('crimson-gear-control.json');
const nexus=getData('crimson-abyss-nexus.json');
import {normalItemAdditionDefinition,normalItemAdditionProfile,NORMAL_ITEM_SCHEMA} from './normal-item-profile.mjs';
import {hash} from './source-binding.mjs';
import {canonicalJson} from '../../../sdk/crypto.mjs';
const itemScopeWitnesses=new WeakMap();
const scopeJson=value=>canonicalJson(JSON.parse(JSON.stringify(value)));
export function itemScopeWitness(result,source,inputs){
 const proof=itemScopeWitnesses.get(result);
 if(!proof||!Buffer.isBuffer(source)||!Buffer.isBuffer(result?.encoded)||hash(source)!==proof.sourceSha256||hash(result.encoded)!==proof.outputSha256||hash(scopeJson(inputs))!==proof.intentSha256||hash(scopeJson(result.report))!==proof.reportSha256)return null;
 return Object.freeze({...proof});
}
import {catalogItemAdditionDefinition,catalogItemAdditionProfile,CATALOG_ITEM_SCHEMA} from './catalog-item-profile.mjs';
export {normalItemAdditionDefinition,normalItemAdditionSupported,normalItemAdditionProfile} from './normal-item-profile.mjs';
const MAX=8*1024*1024,MAX_ID=0xffffffffffffffffn;
const INVENTORY_PROJECTION={captureTypes:['InventorySaveData'],listLimit:250,hashPlaintext:false};
const KNOWLEDGE_PROJECTION={captureTypes:['KnowledgeSaveData'],listLimit:0,hashPlaintext:false};
const fail=(code,message='This item addition stopped at its compatibility check.')=>{throw new CodecError(message,code);};
const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
function prune(document){for(const root of document.blocks)if(!['InventorySaveData','KnowledgeSaveData'].includes(root.type))root.fields=null;return document;}
function header(type,mask,start){return Buffer.concat([u16(mask.length),mask,u16(type.index),Buffer.from([0]),Buffer.alloc(8,255),u32(start+17+mask.length)]);}
function verifyTypes(schema){
 const types=new Map(schema.types.map(t=>[t.name,t]));
 for(const [name,pin]of Object.entries({...gear.nativeSchema.types,...nexus.nativeSchema.types}))if(!types.has(name)||hash(JSON.stringify(types.get(name).fields))!==(pin.signature||pin.sha256))fail('CRIMSON_ITEM_DESCRIPTOR_UNSUPPORTED');
 return types;
}
function freshItem(types,{start,itemNo,slot,key,quantity,definition}){
 const type=types.get('ItemSaveData'),socket=types.get('ItemSocketSaveData');
 // Same schema-driven clean base as Workshop's generic catalog constructor,
 // with requested quantity and source-defined initial unlocked socket count.
 const values=new Map([['_saveVersion',[1n,4]],['_itemNo',[itemNo,8]],['_itemKey',[BigInt(key),4]],['_slotNo',[BigInt(slot),2]],['_stackCount',[quantity,8]],['_enchantLevel',[0n,2]],['_endurance',[BigInt(definition?.endurance??65535),2]],['_maxSocketCount',[5n,1]],['_validSocketCount',[BigInt(definition?.initialUnlockedSockets??0),1]],['_transferredItemKey',[BigInt(key),4]],['_maxChargeUseableCount',[BigInt(definition?.maxCharge??1),4]],['_chargedUseableCount',[1n,8]],['_isNewMark',[1n,1]]]);
 const present=new Set([...values.keys(),'_socketSaveDataList']),mask=Buffer.alloc(Math.ceil(type.fields.length/8));type.fields.forEach((f,i)=>{if(present.has(f.name))mask[i>>3]|=1<<(i&7);});
 const chunks=[header(type,mask,start),Buffer.alloc(4)];let length=chunks.reduce((n,b)=>n+b.length,0),payload=chunks[0].length;
 const append=b=>{chunks.push(b);length+=b.length;};
 for(const f of type.fields){if(values.has(f.name)){const [v,width]=values.get(f.name);if(f.kind!==0||f.size!==width)fail('CRIMSON_ITEM_DESCRIPTOR_UNSUPPORTED');const b=Buffer.alloc(width);width===8?b.writeBigUInt64LE(v):b.writeUIntLE(Number(v),0,width);append(b);}else if(f.name==='_socketSaveDataList'){append(Buffer.concat([Buffer.from([0]),u32(5),Buffer.alloc(13)]));for(let i=0;i<5;i++){append(header(socket,Buffer.alloc(Math.ceil(socket.fields.length/8)),start+length));append(Buffer.alloc(4));append(u32(4));}}else if([3,6,7].includes(f.kind))append(Buffer.from([1]));}
 append(u32(length-payload));return Buffer.concat(chunks);
}
function freshKnowledge(type,start,key,time){const b=Buffer.alloc(43);b.writeUInt16LE(1);b[2]=15;b.writeUInt16LE(type.index,3);b.fill(255,6,14);b.writeUInt32LE(start+18,14);b.writeUInt32LE(key,22);b.writeUInt32LE(1,26);b.writeBigUInt64LE(BigInt(time),30);b[38]=1;b.writeUInt32LE(21,39);return b;}
function knowledge(raw){
 const rows=new Map(),document=prune(readDocument(raw,{...KNOWLEDGE_PROJECTION,scalarFields:['_key','_level','_learnedFieldTime','_isNewMark'],onScalar:e=>{const m=/\.KnowledgeSaveData\._list\[(\d+)\]\.(_key|_level|_learnedFieldTime|_isNewMark)$/.exec(e.path);if(m){const row=rows.get(+m[1])||{index:+m[1],fields:{}};row.fields[m[2]]={value:e.value,type:e.type,bytes:e.bytes,offset:e.offset};rows.set(row.index,row);}}}));
 const roots=document.blocks.filter(b=>b.type==='KnowledgeSaveData'),list=roots.length===1?field(roots[0],'_list'):null;
 if(!list?.present||list.kind!==6||!Number.isSafeInteger(list.count)||list.count<1||list.count>10000||rows.size!==list.count)fail('CRIMSON_ITEM_KNOWLEDGE_INCOMPLETE');
 const byKey=new Map();for(let i=0;i<list.count;i++){const row=rows.get(i),key=row?.fields._key;if(!key||key.bytes!==4||key.type!=='KnowledgeKey'||!Number.isSafeInteger(key.value)||key.value<=0||byKey.has(key.value))fail('CRIMSON_ITEM_KNOWLEDGE_AMBIGUOUS');row.key=key.value;byKey.set(row.key,row);}
 return {document,list,rows:[...rows.values()],byKey};
}
function applyDiscovery(raw,definition,types){
 // No discovery mapping means exact byte preservation. The surrounding strict
 // structural walk/reopen still validates the complete knowledge branch.
 if(!definition.knowledgeKeys.length)return {raw,decodedDiff:[],reverseStructuralByteParity:true};
 const before=knowledge(raw),patch=Buffer.from(raw),diff=[];
 for(const key of definition.knowledgeKeys){const row=before.byKey.get(key);if(row){const level=row.fields._level;if(level?.bytes!==4||level.type!=='TLevel'||!Number.isSafeInteger(level.value)||level.value<0)fail('CRIMSON_ITEM_KNOWLEDGE_LEVEL_UNSUPPORTED');if(level.value<1){patch.writeUInt32LE(1,level.offset);diff.push({operation:'knowledge.setLevel',key,field:'_level',beforeLevel:level.value,afterLevel:1});}}}
 const missing=definition.knowledgeKeys.filter(key=>!before.byKey.has(key));let output=patch,reverse=true;
 if(missing.length){const template=before.rows.find(r=>r.fields._level?.value>=1&&r.fields._learnedFieldTime?.bytes===8&&r.fields._isNewMark?.bytes===1);if(!template||!/^\d{1,20}$/.test(String(template.fields._learnedFieldTime.value)))fail('CRIMSON_ITEM_KNOWLEDGE_TEMPLATE_REQUIRED');const trace=traceStructuralDocument(patch,KNOWLEDGE_PROJECTION);prune(trace.document);let at=before.list.end;const records=missing.map(key=>{const b=freshKnowledge(types.get('KnowledgeElementSaveData'),at,key,template.fields._learnedFieldTime.value);at+=b.length;diff.push({operation:'knowledge.add',key,objectType:'KnowledgeElementSaveData',before:null,after:{_key:key,_level:1,_learnedFieldTime:template.fields._learnedFieldTime.value,_isNewMark:true}});return b;});const edit=insertTypedRecords(trace,{...before.list,value:{count:before.list.count,truncated:false}},records);output=edit.raw;reverse=edit.reverseStructuralByteParity;edit.trace=null;}
 const after=knowledge(output);if(after.list.count!==before.list.count+missing.length)fail('CRIMSON_ITEM_KNOWLEDGE_DIFF');
 for(const row of before.rows){const next=after.byKey.get(row.key);if(!next)fail('CRIMSON_ITEM_KNOWLEDGE_DIFF');for(const [name,old]of Object.entries(row.fields)){const n=next.fields[name],changed=name==='_level'&&diff.some(d=>d.operation==='knowledge.setLevel'&&d.key===row.key);if(!n||n.type!==old.type||n.bytes!==old.bytes||n.value!==(changed?1:old.value))fail('CRIMSON_ITEM_KNOWLEDGE_DIFF');}}
 for(const key of definition.knowledgeKeys)if(!after.byKey.has(key)||after.byKey.get(key).fields._level?.value<1)fail('CRIMSON_ITEM_KNOWLEDGE_DIFF');
 for(const change of diff.filter(d=>d.operation==='knowledge.add')){const row=after.byKey.get(change.key);for(const [name,expected]of Object.entries(change.after))if(row?.fields[name]?.value!==expected)fail('CRIMSON_ITEM_KNOWLEDGE_DIFF');}
 return {raw:output,decodedDiff:diff,reverseStructuralByteParity:reverse};
}
function bag(document,inventoryKey=2){const roots=document.blocks.filter(b=>b.type==='InventorySaveData');if(roots.length!==1)fail('CRIMSON_ITEM_INVENTORY_AMBIGUOUS');const bags=elements(roots[0],'_inventorylist').filter(b=>value(b,'_inventoryKey')===inventoryKey);if(bags.length!==1)fail('CRIMSON_ITEM_INVENTORY_AMBIGUOUS');return bags[0];}
function verifyItem(item,expected,definition){
 const values={_saveVersion:1,_itemNo:expected.instanceId,_itemKey:expected.definitionKey,_slotNo:expected.slot,_stackCount:expected.quantity,_enchantLevel:0,_endurance:definition?.endurance??65535,_maxSocketCount:5,_validSocketCount:definition?.initialUnlockedSockets??0,_transferredItemKey:expected.definitionKey,_maxChargeUseableCount:definition?.maxCharge??1,_chargedUseableCount:'1',_isNewMark:true};
 for(const [name,v]of Object.entries(values))if(!field(item,name)?.present||value(item,name)!==v)fail('CRIMSON_ITEM_INSERTED_VALUE_MISMATCH');
 const sockets=elements(item,'_socketSaveDataList');if(sockets.length!==5||sockets.some(s=>Object.values(s.fields).some(f=>f.present)))fail('CRIMSON_ITEM_INSERTED_SOCKET_MISMATCH');
 for(const [name,f]of Object.entries(item.fields))if(f.present&&!Object.hasOwn(values,name)&&name!=='_socketSaveDataList')fail('CRIMSON_ITEM_INHERITED_STATE');
}
function createItemAddition({schemaPins,definitionFor,profile,inventoryProjection,reportSchema,allowOwned=false}){
 if(!Array.isArray(schemaPins)||!schemaPins.length||schemaPins.length>3||schemaPins.some(s=>!/^[a-f0-9]{64}$/.test(s)))throw Error('Invalid internal item schema pins.');
 const buildMany=async function(source,inputs,{nonce}={}){
  if(!Buffer.isBuffer(source)||source.length<128||source.length>MAX||!Array.isArray(inputs)||!inputs.length||inputs.length>16||nonce!==undefined&&(!Buffer.isBuffer(nonce)||nonce.length!==16))fail('CRIMSON_ITEM_INPUT_INVALID');
  if(hash(JSON.stringify(profile.entries))!==profile.entriesSha256)fail('CRIMSON_ITEM_PROFILE_INVALID');
  const requested=new Set(),definitions=inputs.map(input=>{
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||!Object.hasOwn(input,'definitionKey')||!Object.hasOwn(input,'quantity')||!Number.isSafeInteger(input.definitionKey)||typeof input.quantity!=='string'||!/^[1-9]\d{0,8}$/.test(input.quantity)||requested.has(input.definitionKey))fail('CRIMSON_ITEM_INPUT_INVALID');
   requested.add(input.definitionKey);const definition=definitionFor(input.definitionKey);if(!definition)fail('CRIMSON_ITEM_FAMILY_UNSUPPORTED');
   const total=BigInt(input.quantity),maxStack=BigInt(definition.maxStack);return {input,definition,total,maxStack,required:Number((total+maxStack-1n)/maxStack)};
  });
  const required=definitions.reduce((n,d)=>n+d.required,0);if(required>64)fail('CRIMSON_ITEM_BATCH_LIMIT');
  const definitionByKey=new Map(definitions.map(d=>[d.input.definitionKey,d.definition]));
  const discoveryDefinition={knowledgeKeys:[...new Set(definitions.flatMap(d=>d.definition.knowledgeKeys))].sort((a,b)=>a-b)};
  const sourceHash=hash(source),decoded=await decodeSave(source),trace=traceStructuralDocument(decoded.plaintext,inventoryProjection),before=prune(trace.document),types=verifyTypes(before.schema);
  if(decoded.version!==2||!schemaPins.includes(before.schemaSha256)||before.audit.advisoryLocators||before.audit.unconsumedBytes)fail('CRIMSON_ITEM_SCHEMA_UNSUPPORTED');
  if(!(await encodeSave(decoded.plaintext,decoded.header,{nonce:decoded.header.subarray(0x1a,0x2a)})).equals(source))fail('CRIMSON_ITEM_NATIVE_PARITY_FAILED');
  const groups=new Map();for(const definition of definitions){const key=definition.definition.defaultInventory;const rows=groups.get(key)||[];rows.push(definition);groups.set(key,rows);}
  const raw=Buffer.from(decoded.plaintext),decodedDiff=[],plans=[];
  for(const [inventoryKey,rows]of groups){
   const inventory=bag(before,inventoryKey),list=field(inventory,'_itemList'),items=elements(inventory,'_itemList');
   if(!list?.present)fail('CRIMSON_ITEM_DESTINATION_LIST_MISSING');
   if(list.value?.truncated||list.value.count!==items.length)fail('CRIMSON_ITEM_INVENTORY_INCOMPLETE');
   const balances=rows.filter(r=>r.definition.uniqueBalance);if(balances.some(r=>r.required!==1||items.some(i=>value(i,'_itemKey')===r.input.definitionKey)))fail('CRIMSON_ITEM_CURRENCY_BALANCE','Use Quick Changes → Copper to update the existing balance instead of adding another currency record.');
   const keys=new Set(rows.map(r=>r.input.definitionKey));if(!allowOwned&&items.some(i=>keys.has(value(i,'_itemKey'))))fail('CRIMSON_ITEM_ALREADY_OWNED');
   const count=rows.reduce((n,row)=>n+row.required,0),slots=new Set(items.map(i=>value(i,'_slotNo')));
   if(slots.size!==items.length||[...slots].some(slot=>!Number.isSafeInteger(slot)||slot<0||slot>65535))fail('CRIMSON_ITEM_CAPACITY_AMBIGUOUS');
   let oldCapacity=null,newCapacity=null;
   if(inventoryKey===2){const expansion=field(inventory,'_varyExpandSlotCount');if(!expansion?.present||expansion.bytes!==2||!Number.isSafeInteger(expansion.value)||expansion.value<0||expansion.value>200)fail('CRIMSON_ITEM_INVENTORY_INCOMPLETE');oldCapacity=50+expansion.value;if([...slots].some(slot=>slot>=oldCapacity))fail('CRIMSON_ITEM_CAPACITY_AMBIGUOUS');newCapacity=Math.max(oldCapacity,items.length+count);if(newCapacity>250)fail('CRIMSON_ITEM_CAPACITY_LIMIT');if(newCapacity>oldCapacity){raw.writeUInt16LE(newCapacity-50,expansion.offset);decodedDiff.push({operation:'inventory.setExpansionValue',inventoryKey:2,before:expansion.value,after:newCapacity-50,beforeBagSize:oldCapacity,afterBagSize:newCapacity});}}
   else if(items.length+count>65536)fail('CRIMSON_ITEM_CAPACITY_LIMIT');
   plans.push({inventoryKey,rows,originalCount:items.length,slots,before:oldCapacity,after:newCapacity,additionalSlots:count,automaticExpansion:newCapacity!==oldCapacity,ceiling:inventoryKey===2?250:null,slotIndexCeiling:65535});
  }
  let next=allocateStructuralItemId(trace),workingRaw=raw,preservationProof=true;const inserted=[];
  let firstPlan=true;
  for(const plan of plans){
   // A copied, byte-identical first working buffer has the same complete
   // strict trace and scalar proof. Capacity patches and later insertions
   // always receive a fresh walk before their locators can be used.
   const working=firstPlan&&workingRaw.equals(decoded.plaintext)?trace:traceStructuralDocument(workingRaw,inventoryProjection);firstPlan=false;
   if(working!==trace){trace.locators.length=0;trace.objects.length=0;trace.identities.length=0;}
   prune(working.document);const list=field(bag(working.document,plan.inventoryKey),'_itemList');let at=list.end,slot=0;const records=[],batch=[];
   for(const {input,definition,total,maxStack,required:countRequired}of plan.rows){let left=total;
    for(let n=0;n<countRequired;n++){while(plan.slots.has(slot))slot++;if(slot>65535||plan.inventoryKey===2&&slot>=plan.after)fail('CRIMSON_ITEM_CAPACITY_LIMIT');for(let tries=0;;tries++){if(next>MAX_ID||tries>4096)fail('CRIMSON_ITEM_ID_EXHAUSTED');const b=Buffer.alloc(8);b.writeBigUInt64LE(next);if(!workingRaw.includes(b))break;next++;}const count=left>maxStack?maxStack:left,record=freshItem(types,{start:at,itemNo:next,slot,key:input.definitionKey,quantity:count,definition}),row={definitionKey:input.definitionKey,inventoryKey:plan.inventoryKey,instanceId:String(next),slot,quantity:String(count)};records.push(record);batch.push(row);plan.slots.add(slot);next++;at+=record.length;left-=count;}
   }
   const edit=insertTypedRecords(working,list,records);working.locators.length=0;working.objects.length=0;working.identities.length=0;prune(edit.trace.document);const afterItems=elements(bag(edit.trace.document,plan.inventoryKey),'_itemList');if(afterItems.length!==plan.originalCount+plan.additionalSlots)fail('CRIMSON_ITEM_INSERTION_COUNT');
   for(const row of batch){const found=afterItems.filter(i=>String(value(i,'_itemNo'))===row.instanceId);if(found.length!==1)fail('CRIMSON_ITEM_INSERTION_COUNT');verifyItem(found[0],row,definitionByKey.get(row.definitionKey));decodedDiff.push({operation:'inventory.addItem',objectType:'ItemSaveData',before:null,after:row,...row});}
   preservationProof=preservationProof&&edit.reverseStructuralByteParity;inserted.push(...batch);workingRaw=edit.raw;edit.trace=null;
  }
  const discovery=applyDiscovery(workingRaw,discoveryDefinition,types);decodedDiff.push(...discovery.decodedDiff);const encoded=await encodeSave(discovery.raw,decoded.header,nonce===undefined?{}:{nonce}),reopened=await decodeSave(encoded);
  preservationProof=preservationProof&&discovery.reverseStructuralByteParity;if(!preservationProof)fail('CRIMSON_ITEM_UNRELATED_BYTES_CHANGED');
  const finalAudit=readDocument(reopened.plaintext,{captureTypes:[],listLimit:0,hashPlaintext:false}).audit;if(finalAudit.nonzeroListMetadata!==before.audit.nonzeroListMetadata||finalAudit.advisoryLocators||finalAudit.unconsumedBytes)fail('CRIMSON_ITEM_REOPEN_FAILED');
  if(!(await encodeSave(reopened.plaintext,reopened.header,{nonce:reopened.header.subarray(0x1a,0x2a)})).equals(encoded))fail('CRIMSON_ITEM_NATIVE_PARITY_FAILED');
  if(!reopened.plaintext.equals(discovery.raw)||!encoded.subarray(0,0x12).equals(source.subarray(0,0x12))||!encoded.subarray(0x4a,128).equals(source.subarray(0x4a,128))||hash(source)!==sourceHash)fail('CRIMSON_ITEM_REOPEN_FAILED');
  const perInventory=plans.map(({inventoryKey,before,after,additionalSlots,automaticExpansion,ceiling,slotIndexCeiling})=>({inventoryKey,before,after,additionalSlots,automaticExpansion,ceiling,slotIndexCeiling})),bag2=perInventory.find(p=>p.inventoryKey===2),capacity=bag2?{before:bag2.before,after:bag2.after,additionalSlots:bag2.additionalSlots,automaticExpansion:bag2.automaticExpansion,ceiling:250}:{before:null,after:null,additionalSlots:0,automaticExpansion:false,ceiling:250};
  const result={encoded,report:{schema:reportSchema,revision:profile.revision,sourceSha256:sourceHash,outputSha256:hash(encoded),schemaSha256:before.schemaSha256,outputEncodedBytes:encoded.length,inserted,decodedDiff,discovery:{status:definitions.length===1?definitions[0].definition.discovery:'explicit_combined_pickup_mapping',knowledgeKeys:discoveryDefinition.knowledgeKeys,changes:discovery.decodedDiff},capacity,perInventory,runtimeRequirements:definitions.filter(d=>d.definition.runtimeRequirement).map(d=>({definitionKey:d.input.definitionKey,message:d.definition.runtimeRequirement})),validation:{nativeNoOpByteParity:true,nativeOutputNoOpByteParity:true,fullTypedReparse:true,intendedOnly:true,allOtherOriginalScalarValuesUnchanged:true,originalOpaqueBytesPreserved:true,existingInventoryRecordsUnchanged:true,existingInventoryAndActiveEquipmentUnchanged:true,reverseStructuralByteParity:preservationProof,noInheritedDonorState:true,knownDescriptorFingerprintMatched:true,discoveryMappingExplicit:true,hmacReverified:true,encodedOutputReopened:true,unknownHeaderBytesPreserved:true,nonzeroListMetadataBefore:before.audit.nonzeroListMetadata,nonzeroListMetadataAfter:finalAudit.nonzeroListMetadata},cloudRequests:0,structuralPublicationEnabled:false,gameAcceptance:'source_backed_catalog_constructor_per_item_game_behavior_not_guaranteed',catalogWideSupport:profile===catalogItemAdditionProfile}};
  itemScopeWitnesses.set(result,Object.freeze({kind:'native-item-structural-byte-proof',sourceSha256:sourceHash,outputSha256:hash(encoded),intentSha256:hash(scopeJson(inputs)),reportSha256:hash(scopeJson(result.report))}));
  return result;
 };
 const build=(source,input,options)=>buildMany(source,[input],options);
 Object.defineProperty(build,'many',{value:buildMany});return build;
}
export function createNormalItemAddition({schemaPins=[NORMAL_ITEM_SCHEMA]}={}){return createItemAddition({schemaPins,definitionFor:normalItemAdditionDefinition,profile:normalItemAdditionProfile,inventoryProjection:INVENTORY_PROJECTION,reportSchema:'saveglass.normal-item-addition.v1'});}
export function createCatalogItemAddition({schemaPins=[CATALOG_ITEM_SCHEMA]}={}){return createItemAddition({schemaPins,definitionFor:catalogItemAdditionDefinition,profile:catalogItemAdditionProfile,inventoryProjection:{captureTypes:['InventorySaveData'],listLimit:1024,hashPlaintext:false},reportSchema:'saveglass.catalog-item-addition.v1',allowOwned:true});}
export const buildNormalItemAddition=createNormalItemAddition();
export const buildNormalItemAdditions=buildNormalItemAddition.many;
export const buildCatalogItemAddition=createCatalogItemAddition();
export const buildCatalogItemAdditions=buildCatalogItemAddition.many;
