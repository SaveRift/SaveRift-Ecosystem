// MPL-2.0. Existing-scalar offline composition using the audited, lossless
// Workshop/NattKh document model. This module has no cloud or persistence API.
import {Buffer} from '../../../sdk/buffer.mjs';
import {ProbeError,hash,verifyBackup} from './source-binding.mjs';
import {decodeSave,encodeSave} from './crimson-codec.mjs';
import {readDocument,field,value,elements,DECODER_REVISION} from './crimson-document.mjs';
import {FISH_QUANTITY_RULE,quantityTarget} from './crimson-policy.mjs';
const PREVIOUS_HOUSING_SCHEMA='606d393978b53c27a3e827fb6a592ce2a6c2e91f2de82dd063e5be93d0cfdedf';
import {CATALOG_REVISION,catalogItem} from './crimson-domain.mjs';
import {assertOfflineDraftCapability,assertSourceBinding,preparedSource} from './source-binding.mjs';
import {STANDARD_LZ4_PROFILE} from './lz4-standard.mjs';
import {existingStackQuantityProfile,validInventoryKey} from './inventory-quantity-profile.mjs';

export const CRIMSON_DRAFT_REVISION='saveglass.crimson-existing-scalars.v3';
export const CRIMSON_CURRENT_SCHEMA='8427f58057ea9bf6dac35bc139cba163ddb135cfe89d748a2d36b94eec88d668';
// These are conservative product bounds, not a claim of an engine maximum.
// The owner supplied the base-capacity rule; decreases remain unsupported.
export const CRIMSON_BAG_CAPACITY=Object.freeze({base:50,min:50,max:250,increaseOnly:true});
export const CRIMSON_DRAFT_SCHEMAS=Object.freeze([
  Object.freeze({schemaSha256:FISH_QUANTITY_RULE.schemaSha256,requiresHousing:false}),
  Object.freeze({schemaSha256:PREVIOUS_HOUSING_SCHEMA,requiresHousing:true}),
  Object.freeze({schemaSha256:CRIMSON_CURRENT_SCHEMA,requiresHousing:true})
]);
const PLAN_KEYS=['schema','container','payload','backupSha256','backupRevision','payloadSha256','plaintextSha256','schemaSha256','decoderRevision','catalogRevision','operations'];
const ITEM_KEYS=['operation','inventoryKey','definitionKey','instanceId','slot','expectedValue','desiredValue'];
const EXPANSION_KEYS=['operation','inventoryKey','expectedValue','desiredValue'];
const HASH=/^[a-f0-9]{64}$/;
const GUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=(code,message='The offline draft stopped at its reported validation gate.',status=409)=>{throw new ProbeError(message,status,code);};
const decimal=(v,max)=>typeof v==='string'&&/^(0|[1-9]\d{0,19})$/.test(v)&&BigInt(v)<=max;
const stableJson=value=>JSON.stringify(canonical(value));
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}

function validateInput(input){
  if(!exact(input,PLAN_KEYS)||input.schema!=='saveglass.crimson-draft-plan.v1'||input.payload!=='save'||
    typeof input.container!=='string'||!/^slot\d{1,3},savedgame$/.test(input.container)||
    !['backupSha256','backupRevision','payloadSha256','plaintextSha256','schemaSha256'].every(k=>typeof input[k]==='string'&&HASH.test(input[k]))||
    !Array.isArray(input.operations)||input.operations.length<1||input.operations.length>8)fail('CRIMSON_DRAFT_PLAN_INVALID','Use a bound draft with one to eight supported existing-scalar operations.',400);
  if(input.decoderRevision!==DECODER_REVISION||input.catalogRevision!==CATALOG_REVISION)fail('CRIMSON_DRAFT_STALE','Reopen the snapshot with the current decoder and catalog.');
  for(const op of input.operations){
    const expansion=op?.operation==='inventory.setExpansionValue';
    if(!exact(op,expansion?EXPANSION_KEYS:ITEM_KEYS)||!validInventoryKey(op.inventoryKey)||op.operation!=='inventory.setQuantity'&&op.inventoryKey!==2||
      !['inventory.setQuantity','inventory.setCopper','inventory.setExpansionValue'].includes(op.operation)||
      !decimal(op.expectedValue,0xffffffffffffffffn)||!decimal(op.desiredValue,0xffffffffffffffffn)||op.expectedValue===op.desiredValue)fail('CRIMSON_DRAFT_OPERATION_INVALID','Use an existing inventory scalar with its exact inventory identity and decimal values.',400);
    if(expansion){
      if(BigInt(op.expectedValue)>200n||BigInt(op.desiredValue)>200n||BigInt(op.desiredValue)<=BigInt(op.expectedValue))fail('CRIMSON_DRAFT_EXPANSION_LIMIT','Bag size may only increase, within the conservative total capacity of 50 to 250.',400);
    }else{
      if(!Number.isSafeInteger(op.slot)||op.slot<0||op.slot>65535||!decimal(op.instanceId,0xffffffffffffffffn)||op.instanceId==='0'||
        !Number.isSafeInteger(op.definitionKey)||op.definitionKey<1||op.definitionKey>0xffffffff)fail('CRIMSON_DRAFT_TARGET_INVALID','Select the existing record by its exact instance, definition, bag and slot.',400);
      const item=catalogItem(op.definitionKey),profile=existingStackQuantityProfile(op.definitionKey,item?.referenceMaxStack);
      if(!profile||(op.operation==='inventory.setCopper'?!profile.uniqueBalance:profile.uniqueBalance))fail('CRIMSON_DRAFT_TARGET_INVALID','Only a known native stackable item or the existing Copper balance can be changed.',400);
      const max=BigInt(profile.maximum);
      if(BigInt(op.desiredValue)<1n||BigInt(op.desiredValue)>max)fail('CRIMSON_DRAFT_REFERENCE_LIMIT','The desired quantity exceeds this offline reference bound; this is not a game-verified maximum.',400);
    }
  }
}

function inventoryContext(document,pin){
  if(document.audit.unconsumedBytes!==0)fail('CRIMSON_DRAFT_DOCUMENT_INVALID');
  const types=new Map(document.schema.types.map(t=>[t.name,t]));
  if(types.size!==document.schema.types.length||document.schema.types.some(t=>new Set(t.fields.map(f=>f.name)).size!==t.fields.length))fail('CRIMSON_DRAFT_DOCUMENT_AMBIGUOUS');
  const roots=document.blocks.filter(b=>b.type==='InventorySaveData');
  if(roots.length!==1)fail('CRIMSON_DRAFT_INVENTORY_INCOMPLETE');
  const root=roots[0],list=field(root,'_inventorylist'),bags=elements(root,'_inventorylist');
  if(!list?.present||list.value?.truncated||list.value?.count!==bags.length||bags.some(b=>{const items=field(b,'_itemList');return !items||items.present&&(items.value?.truncated||items.value?.count!==items.value?.elements?.length);} ))fail('CRIMSON_DRAFT_INVENTORY_INCOMPLETE');
  const owned=bags.filter(b=>value(b,'_inventoryKey')===2);
  if(owned.length>1)fail('CRIMSON_DRAFT_INVENTORY_AMBIGUOUS');
  const bag=owned[0],itemType=types.get('ItemSaveData'),quantity={name:'_stackCount',type:'TStackCount',kind:0,size:8,aux:0};
  if(!itemType||itemType.fields.findIndex(f=>f.name==='_stackCount')!==4||!equal(itemType.fields[4],quantity))fail('CRIMSON_DRAFT_DESCRIPTOR_UNSUPPORTED');
  let housing=null;
  if(pin.requiresHousing){
    const descriptor={name:'_housingGimmickInfoKey',type:'GimmickInfoKey',kind:0,size:4,aux:0},definition=types.get('InventoryHousingGimmickSaveData'),branch=field(root,'_inventoryHousingGimmickSaveData');
    if(!definition||!equal(definition.fields,[descriptor])||!branch?.present||![6,7].includes(branch.kind)||branch.type!=='ReflectObject'||
      branch.value?.truncated||!Number.isSafeInteger(branch.value?.count)||branch.value.count<0||branch.value.count>200||branch.value.count!==branch.value.elements?.length)fail('CRIMSON_DRAFT_HOUSING_UNSUPPORTED');
    // Empty, one-record and multi-record lists use the same reviewed descriptor.
    // Preserve the entire field, including list marker, count and metadata.
    housing=branch;const housingObjects=new Set(branch.value.elements);
    for(const object of housingObjects){const key=field(object,'_housingGimmickInfoKey');
      if(object.type!=='InventoryHousingGimmickSaveData'||!key?.present||key.kind!==0||key.type!==descriptor.type||key.bytes!==4||!Number.isSafeInteger(key.value)||key.value<0||key.value>0xffffffff)fail('CRIMSON_DRAFT_HOUSING_UNSUPPORTED');}
    let count=0;
    function visit(node){if(!node||typeof node!=='object')return;if(node.fields){if(node.type==='InventoryHousingGimmickSaveData'){count++;if(!housingObjects.has(node))fail('CRIMSON_DRAFT_HOUSING_UNSUPPORTED');}for(const f of Object.values(node.fields))visit(f.value);}else if(Array.isArray(node))for(const child of node)visit(child);else if(Array.isArray(node.elements)){if(node.truncated||node.count!==node.elements.length)fail('CRIMSON_DRAFT_INVENTORY_INCOMPLETE');for(const child of node.elements)visit(child);}}
    visit(root);if(count!==housingObjects.size||count!==branch.value.count)fail('CRIMSON_DRAFT_HOUSING_UNSUPPORTED');
  }
  return {types,root,bag,housing};
}

function resolveOperation(document,context,op){
  let target,definition,objectType,fieldName,width,displayName;
  if(op.operation==='inventory.setExpansionValue'){
    if(!context.bag||!field(context.bag,'_itemList')?.present)fail('CRIMSON_DRAFT_INVENTORY_INCOMPLETE');
    target=field(context.bag,'_varyExpandSlotCount');definition=context.types.get('InventoryElementSaveData')?.fields.find(f=>f.name==='_varyExpandSlotCount');
    objectType='InventoryElementSaveData';fieldName='_varyExpandSlotCount';width=2;displayName='Bag size';
    if(!equal(definition,{name:fieldName,type:'TInventorySlotNo',kind:0,size:2,aux:0}))fail('CRIMSON_DRAFT_DESCRIPTOR_UNSUPPORTED');
    const slots=elements(context.bag,'_itemList').map(i=>value(i,'_slotNo'));
    if(slots.some(slot=>!Number.isSafeInteger(slot)||slot<0||slot>=CRIMSON_BAG_CAPACITY.base+Number(op.desiredValue))||new Set(slots).size!==slots.length)fail('CRIMSON_DRAFT_CAPACITY_CONFLICT','The bag size conflicts with existing occupied slots.');
  }else{
    const resolved=quantityTarget(document,op);
    if(resolved.error||resolved.item?.type!=='ItemSaveData')fail('CRIMSON_DRAFT_TARGET_MISMATCH','The selected item identity is missing, ambiguous or changed.');
    if(op.operation==='inventory.setCopper'&&elements(context.bag,'_itemList').filter(i=>value(i,'_itemKey')===1).length!==1)fail('CRIMSON_DRAFT_TARGET_MISMATCH','Exactly one Bag 2 Copper record is required.');
    target=resolved.quantity;definition=context.types.get('ItemSaveData').fields[4];objectType='ItemSaveData';fieldName='_stackCount';width=8;displayName=op.definitionKey===1?'Copper':catalogItem(op.definitionKey).name;
  }
  if(!target?.present)fail('CRIMSON_DRAFT_STRUCTURAL_REQUIRED','An absent field requires structural insertion, which is disabled.');
  if(target.kind!==0||target.type!==definition.type||target.bytes!==width||String(target.value)!==op.expectedValue)fail('CRIMSON_DRAFT_EXPECTATION_MISMATCH','The existing field descriptor or expected original value changed.');
  return {operation:op.operation,displayName,inventoryKey:op.inventoryKey,...(op.operation==='inventory.setExpansionValue'?{beforeCapacity:50+Number(op.expectedValue),afterCapacity:50+Number(op.desiredValue)}:{definitionKey:op.definitionKey,instanceId:op.instanceId,slot:op.slot}),before:op.expectedValue,after:op.desiredValue,field:fieldName,objectType,offset:target.offset,fieldBytes:width,limitStatus:op.operation==='inventory.setExpansionValue'?'conservative_capacity_bound_increase_only':'native_and_pinned_catalog_minimum_not_game_verified'};
}

// Explicit internal fixture seam. HTTP handlers import only the fixed compiler
// below; input cannot select a rule, schema allowlist, offset or write target.
export function createCrimsonDraftCompiler({schemaPins=CRIMSON_DRAFT_SCHEMAS,assertCapability=assertOfflineDraftCapability}={}){
  if(!Array.isArray(schemaPins)||schemaPins.length<1||schemaPins.length>3||schemaPins.some(p=>!exact(p,['schemaSha256','requiresHousing'])||!HASH.test(p.schemaSha256)||typeof p.requiresHousing!=='boolean'))throw Error('Invalid internal draft schema pins.');
  const pins=new Map(schemaPins.map(p=>[p.schemaSha256,{...p}]));
  if(pins.size!==schemaPins.length)throw Error('Duplicate internal draft schema pin.');
  if(typeof assertCapability!=='function')throw Error('Invalid internal capability guard.');
  return async function compileCrimsonDraft(backup,metadata,input,{nonce,retainEncoded=false}={}){
    if(nonce!==undefined&&(!Buffer.isBuffer(nonce)||nonce.length!==16)||typeof retainEncoded!=='boolean')throw Error('Invalid internal compiler options.');
    validateInput(input);
    assertSourceBinding(backup,metadata,input);
    if(metadata.sha256!==input.backupSha256||backup.revision!==input.backupRevision)fail('CRIMSON_DRAFT_STALE','The original snapshot binding changed.');
    const containers=backup.containers.filter(c=>c.index.fileName===input.container),blobs=containers.length===1?containers[0].blobs.filter(b=>b.name===input.payload):[];
    if(blobs.length!==1||blobs[0].sha256!==input.payloadSha256)fail('CRIMSON_DRAFT_STALE','The original payload binding changed.');
    const prepared=preparedSource(backup,metadata,input),source=prepared?.encoded||Buffer.from(blobs[0].data,'base64');
    if(source.length>8*1024*1024||!prepared&&source.toString('base64')!==blobs[0].data)fail('CRIMSON_DRAFT_PAYLOAD_INVALID');
    const decoded=prepared?.decoded||await decodeSave(source);
    if(decoded.version!==2)fail('CRIMSON_DRAFT_WRAPPER_UNSUPPORTED');
    const projection=prepared?.projection||{fieldListLimits:{'InventoryElementSaveData._itemList':1024}},before=prepared?.document||readDocument(decoded.plaintext,projection),pin=pins.get(before.schemaSha256);
    if(!pin||input.schemaSha256!==before.schemaSha256)fail('CRIMSON_DRAFT_SCHEMA_UNSUPPORTED','This snapshot schema is outside the reviewed offline composition pins.');
    if(input.plaintextSha256!==before.plaintextSha256)fail('CRIMSON_DRAFT_STALE','The original plaintext binding changed.');
    assertCapability({schemaSha256:before.schemaSha256,saveVersion:decoded.version,container:input.container,payload:input.payload});
    const noOp=await encodeSave(decoded.plaintext,decoded.header,{nonce:decoded.header.subarray(0x1a,0x2a)});
    if(!noOp.equals(source))fail('CRIMSON_DRAFT_NATIVE_PARITY_FAILED','The original save does not reproduce byte-for-byte with the native-compatible encoder.');
    const context=inventoryContext(before,pin),operations=input.operations.map(op=>resolveOperation(before,context,op)),ordered=[...operations].sort((a,b)=>a.offset-b.offset);
    if(ordered.some((target,i)=>i>0&&target.offset<ordered[i-1].offset+ordered[i-1].fieldBytes))fail('CRIMSON_DRAFT_CONFLICT','Two draft operations target the same or overlapping existing field.');
    const patched=Buffer.from(decoded.plaintext);
    for(const op of operations){if(op.fieldBytes===8)patched.writeBigUInt64LE(BigInt(op.after),op.offset);else patched.writeUInt16LE(Number(op.after),op.offset);}
    let changedBytes=0,range=0;
    for(let at=0;at<patched.length;at++)if(patched[at]!==decoded.plaintext[at]){while(range<ordered.length&&at>=ordered[range].offset+ordered[range].fieldBytes)range++;if(range>=ordered.length||at<ordered[range].offset)fail('CRIMSON_DRAFT_DIFF_FAILED');changedBytes++;}
    // All operations are applied to one source, followed by one encoding pass.
    const encoded=await encodeSave(patched,decoded.header,nonce===undefined?{}:{nonce});
    if(encoded.length>8*1024*1024)fail('CRIMSON_DRAFT_ENCODED_LIMIT');
    const reopened=await decodeSave(encoded);
    if(reopened.version!==decoded.version||reopened.flags!==decoded.flags||!reopened.plaintext.equals(patched))fail('CRIMSON_DRAFT_REOPEN_FAILED');
    if(!encoded.subarray(0,0x16).equals(source.subarray(0,0x16))||!encoded.subarray(0x4a,128).equals(source.subarray(0x4a,128)))fail('CRIMSON_DRAFT_HEADER_CHANGED');
    const after=readDocument(reopened.plaintext,{...projection,compareTo:decoded.plaintext}),diff=after.decodedDiff;
    if(after.schemaSha256!==before.schemaSha256||!equal(after.audit,before.audit)||diff.length!==operations.length||
      diff.some(d=>!operations.some(op=>op.offset===d.offset&&op.fieldBytes===d.bytes&&op.field===d.field&&op.objectType===d.objectType&&String(d.before)===op.before&&String(d.after)===op.after)))fail('CRIMSON_DRAFT_DIFF_FAILED','The full decoded comparison contains an unintended change.');
    const afterContext=inventoryContext(after,pin);
    const housingUnchanged=!context.housing||context.housing.offset===afterContext.housing.offset&&context.housing.end===afterContext.housing.end&&hash(decoded.plaintext.subarray(context.housing.offset,context.housing.end))===hash(reopened.plaintext.subarray(afterContext.housing.offset,afterContext.housing.end));
    if(!housingUnchanged)fail('CRIMSON_DRAFT_HOUSING_CHANGED');
    const manifest=operations.map(op=>({...op,changedBytes:patched.subarray(op.offset,op.offset+op.fieldBytes).reduce((n,v,i)=>n+(v!==decoded.plaintext[op.offset+i]),0)}));
    const report={schema:'saveglass.crimson-draft-preview.v1',compilerRevision:CRIMSON_DRAFT_REVISION,encoderRevision:STANDARD_LZ4_PROFILE,compression:'standard_lz4_block',source:'plugin_bundle',backupId:metadata.id,backupSha256:metadata.sha256,backupRevision:backup.revision,container:input.container,payload:input.payload,payloadSha256:blobs[0].sha256,
      schemaSha256:before.schemaSha256,decoderRevision:DECODER_REVISION,catalogRevision:CATALOG_REVISION,planSha256:hash(stableJson(input)),operations:manifest,decodedDiff:diff,changedBytes,beforePlaintextSha256:before.plaintextSha256,afterPlaintextSha256:after.plaintextSha256,encodedSha256:hash(encoded),encodedBytes:encoded.length,
      validation:{backupIntegrity:'verified',snapshotRevisionBinding:'verified',liveCloudRevisionCheck:'not_performed',originalNoOpByteParity:true,unknownHeaderBytesPreserved:true,fullDocumentReparsed:true,comparedLeafFields:after.comparison.comparedLeafFields,objectCount:after.audit.objects,unconsumedBytes:after.audit.unconsumedBytes,intendedDecodedFields:operations.length,allOtherPlaintextBytesUnchanged:true,allOtherDecodedValuesUnchanged:true,omittedListMarkersPreserved:after.audit.omittedListMarkers,nonzeroListMetadataPreserved:after.audit.nonzeroListMetadata,housingBranchBytesUnchanged:housingUnchanged,housingBranchPresent:Boolean(context.housing),housingRecords:context.housing?.value.count??0,hmacReverified:true,encodedOutputReopened:true,encodingPasses:1,noOpEncodingPasses:1,gameAcceptance:'unverified'},
      draftOnly:true,originalBackupUnchanged:true,modifiedSaveStored:false,encodedBytesReturned:false,writesEnabled:false,publishEligible:false,gates:{structuralAdditions:'disabled',cloudPublication:'disabled',restore:'disabled',gameEngineAcceptance:'unverified'},message:'The combined draft passed intended-only comparison and native-compatible re-open checks. Publication requires the separate account, backup, revision and confirmation gates; game acceptance of this draft remains unverified.'};
    return retainEncoded?{report,encoded}:report;
  };
}
export const compileCrimsonDraft=createCrimsonDraftCompiler();
// Server-internal publication seam. HTTP preview handlers use the safe report
// compiler above; neither input JSON nor a capability DTO can enable this path.
export const createWorkbenchDraft=(backup,metadata,input,{nonce}={})=>compileCrimsonDraft(backup,metadata,input,{nonce,retainEncoded:true});
