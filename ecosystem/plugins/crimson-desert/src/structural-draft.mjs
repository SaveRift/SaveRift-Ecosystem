// Server-owned composition of source-backed typed item/companion constructors.
// Inputs contain intent and immutable-source bindings, never bytes or offsets.
import {Buffer} from '../../../sdk/buffer.mjs';
import {createScalarDigest} from './scalar-digest.mjs';
import {ProbeError,hash,verifyBackup,assertSourceBinding,preparedSource,preparedSourceNativeParity} from './source-binding.mjs';
import {decodeSave,encodeSave,CodecError} from './crimson-codec.mjs';
import {readDocument,field,value,elements,DECODER_REVISION} from './crimson-document.mjs';
import {CRIMSON_CURRENT_SCHEMA,createWorkbenchDraft,scalarScopeWitness} from './crimson-draft.mjs';
import {CATALOG_REVISION} from './crimson-domain.mjs';
import {planInventoryCapacity} from './inventory-capacity.mjs';
import {buildCatalogItemAdditions,itemScopeWitness} from './crimson-item-addition.mjs';
import {catalogItemAdditionDefinition} from './catalog-item-profile.mjs';
import {STRUCTURAL_PLAN_SCHEMA,MAX_STRUCTURAL_OPERATIONS,MAX_STRUCTURAL_ITEM_INTENTS,MAX_STRUCTURAL_SCALAR_OPERATIONS,MAX_COMPANION_ADDITIONS,MAX_STRUCTURAL_NEW_ITEM_STACKS,structuralItemFamily,structuralCompanionFamily} from './structural-publication-profile.mjs';

const common=['schema','container','payload','backupSha256','backupRevision','payloadSha256','plaintextSha256','schemaSha256','decoderRevision','catalogRevision','operations'];
const scalarNames=['inventory.setQuantity','inventory.setCopper','inventory.setExpansionValue'];
const digest=/^[a-f0-9]{64}$/;
const structuralSnapshots=new WeakMap();
// Item-only composition must not retain the unrelated companion template pack.
const buildCompanionAdditions=async(...args)=>(await import('./crimson-companion-addition.mjs')).buildCompanionAdditions(...args);
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const canonical=o=>Array.isArray(o)?o.map(canonical):o&&typeof o==='object'?Object.fromEntries(Object.keys(o).sort().map(k=>[k,canonical(o[k])])):o;
export const structuralDraftDigest=input=>hash(JSON.stringify(canonical(input)));
const fail=(code,message='This addition does not match this save’s known record format. Reopen your save and review the changes.',status=409)=>{throw new ProbeError(message,status,code);};
export function assertStructuralPlan(input,{allowScalarOnly=false,schemaPins=[CRIMSON_CURRENT_SCHEMA]}={}){
 if(!exact(input,common)||input.schema!==STRUCTURAL_PLAN_SCHEMA||input.payload!=='save'||!/^slot\d{1,3},savedgame$/.test(input.container||'')||!common.filter(k=>k.endsWith('Sha256')||k==='backupRevision').every(k=>typeof input[k]==='string'&&digest.test(input[k]))||!Array.isArray(input.operations)||input.operations.length<1||input.operations.length>MAX_STRUCTURAL_OPERATIONS)fail('STRUCTURAL_PLAN_INVALID',undefined,400);
 if(input.decoderRevision!==DECODER_REVISION||input.catalogRevision!==CATALOG_REVISION)fail('STRUCTURAL_PLAN_STALE');
 if(!schemaPins.includes(input.schemaSha256))fail('STRUCTURAL_SCHEMA_UNSUPPORTED','This save layout is not supported for additions yet. Choose another save.');
 let scalars=0,items=0,pets=0,newSlots=0;const identities=new Set();
 for(const op of input.operations){
  if(scalarNames.includes(op?.operation)){
   const keys=op.operation==='inventory.setExpansionValue'?['operation','inventoryKey','expectedValue','desiredValue']:['operation','inventoryKey','definitionKey','instanceId','slot','expectedValue','desiredValue'];
   if(!exact(op,keys)||(!Number.isSafeInteger(op.inventoryKey)||op.inventoryKey<0||op.inventoryKey>65535||op.operation!=='inventory.setQuantity'&&op.inventoryKey!==2)||typeof op.expectedValue!=='string'||typeof op.desiredValue!=='string'||!/^\d{1,20}$/.test(op.expectedValue)||!/^\d{1,20}$/.test(op.desiredValue))fail('STRUCTURAL_OPERATION_INVALID',undefined,400);scalars++;continue;
  }
  if(op?.operation==='inventory.addItem'&&exact(op,['operation','definitionKey','quantity'])&&structuralItemFamily(op.definitionKey)&&typeof op.quantity==='string'&&/^[1-9]\d{0,8}$/.test(op.quantity)){const max=BigInt(catalogItemAdditionDefinition(op.definitionKey).maxStack);if((BigInt(op.quantity)+max-1n)/max>BigInt(MAX_STRUCTURAL_NEW_ITEM_STACKS))fail('STRUCTURAL_QUANTITY_UNSUPPORTED','Choose a smaller quantity for this item.',400);newSlots+=Number((BigInt(op.quantity)+max-1n)/max);items++;if(identities.has('item:'+op.definitionKey))fail('STRUCTURAL_OPERATION_DUPLICATE');identities.add('item:'+op.definitionKey);continue;}
  if(op?.operation==='companions.add'&&exact(op,['operation','characterKey'])&&structuralCompanionFamily(op.characterKey)){pets++;if(identities.has('pet:'+op.characterKey))fail('STRUCTURAL_OPERATION_DUPLICATE');identities.add('pet:'+op.characterKey);continue;}
  fail('STRUCTURAL_OPERATION_UNSUPPORTED','This catalog entry is missing a required clean record template or native field definition.',400);
 }
 if(!allowScalarOnly&&!items&&!pets||scalars>MAX_STRUCTURAL_SCALAR_OPERATIONS||items>MAX_STRUCTURAL_ITEM_INTENTS||pets>MAX_COMPANION_ADDITIONS||newSlots>MAX_STRUCTURAL_NEW_ITEM_STACKS)fail('STRUCTURAL_SCOPE_UNSUPPORTED',undefined,400);
 return input;
}
function records(document,type){const out=[];function visit(o){if(!o?.fields)return;if(o.type===type)out.push(o);for(const f of Object.values(o.fields)){if(f.value?.elements)f.value.elements.forEach(visit);else if(f.value?.fields)visit(f.value);}}document.blocks.forEach(visit);return out;}
function one(rows,select,code='STRUCTURAL_SOURCE_AMBIGUOUS'){const a=rows.filter(select);if(a.length!==1)fail(code);return a[0];}
function scalarDigest(raw,{paths=new Set(),ranges=[]}={}){const d=createScalarDigest();readDocument(raw,{captureTypes:[],listLimit:0,hashPlaintext:false,onScalar:e=>{if(paths.has(e.path)||ranges.some(r=>e.offset>=r.wrapperStart&&e.offset<r.end))return;d.update(e);}});return d.digest();}
export function structuralSourcePayload(backup,metadata,input){
 assertSourceBinding(backup,metadata,input);
 const c=one(backup.containers,c=>c.index?.fileName===input.container),blob=one(c.blobs,b=>b.name==='save');
 if(c.blobs.length!==2||!c.blobs.some(b=>b.name==='lobby')||blob.sha256!==input.payloadSha256)fail('STRUCTURAL_SOURCE_CHANGED');
 const prepared=preparedSource(backup,metadata,input),bytes=prepared?.encoded||Buffer.from(blob.data,'base64');
 // Only this engine's opaque, context/digest-bound original may reuse bytes.
 // Clones and caller-created sources retain the complete canonical/hash path.
 if(bytes.length<128||bytes.length>8*1024*1024||bytes.length!==blob.size||!prepared&&(bytes.toString('base64')!==blob.data||hash(bytes)!==blob.sha256))fail('STRUCTURAL_SOURCE_CHANGED');return {bytes,blob,prepared};
}
// Full scalar events are retained only as bounded identity/knowledge metadata;
// large knowledge lists are not expanded into UI-style object projections.
function semanticIndex(raw,{hashPlaintext=true,scalarLocators=false,knowledgeDetails=true,companionDetails=true}={}){
 const knowledge=new Map(),knowledgePaths=new Map(),identities=new Map(),scalarPaths=new Map();let itemCount=0,petCount=0,knowledgeCount=0;
 // Identity names intentionally match every type, including opaque references.
 const document=readDocument(raw,{captureTypes:['InventorySaveData',...(companionDetails?['MercenaryClanSaveData']:[])],listLimit:1024,hashPlaintext,scalarFields:['_itemNo','_mercenaryNo','_key',...(knowledgeDetails?['_level','_learnedFieldTime','_isNewMark']:[]),...(scalarLocators?['_stackCount','_varyExpandSlotCount']:[])],onScalar:e=>{
  if(scalarLocators&&/\.(?:_stackCount|_varyExpandSlotCount)$/.test(e.path)){if(scalarPaths.has(e.offset))fail('STRUCTURAL_SCALAR_BINDING_FAILED');scalarPaths.set(e.offset,e);}
  if(/\.(_itemNo|_mercenaryNo)$/.test(e.path)){const id=String(e.value);identities.set(id,(identities.get(id)||0)+1);}
  const m=/^(.*\.KnowledgeSaveData\._list\[(\d+)\])\.(_key|_level|_learnedFieldTime|_isNewMark)$/.exec(e.path);
  if(m){if(knowledgeDetails){const row=knowledgePaths.get(m[1])||{path:m[1],index:Number(m[2]),fields:{}};row.fields[m[3]]=e;knowledgePaths.set(m[1],row);}else if(m[3]==='_key'){if(!Number.isSafeInteger(e.value)||knowledge.has(e.value))fail('STRUCTURAL_KNOWLEDGE_AMBIGUOUS');knowledge.set(e.value,{key:e.value});}}
 },onObject:e=>{
  if(e.type==='ItemSaveData')itemCount++;
  if(e.type==='MercenarySaveData')petCount++;
  if(e.type==='KnowledgeElementSaveData'){knowledgeCount++;if(knowledgeDetails){const row=knowledgePaths.get(e.path);if(row)row.range={wrapperStart:e.start,end:e.end};}}
 }});
 for(const row of knowledgePaths.values()){const key=row.fields._key?.value;if(!Number.isSafeInteger(key)||knowledge.has(key))fail('STRUCTURAL_KNOWLEDGE_AMBIGUOUS');row.key=key;knowledge.set(key,row);}
 if(!knowledgeDetails&&knowledge.size!==knowledgeCount)fail('STRUCTURAL_KNOWLEDGE_AMBIGUOUS');
 return {document,knowledge,identities,itemCount,petCount,scalarPaths};
}
function projectionDigest(document){const {plaintext,...projection}=document;return hash(JSON.stringify(projection));}
// The primary snapshot can collect this same strict index during its first
// walk. Private maps stay opaque; any changed public projection is rejected.
export function prepareStructuralDocument(raw,operations){
 const knowledgeDetails=operations.some(o=>o.operation==='inventory.addItem'&&catalogItemAdditionDefinition(o.definitionKey)?.knowledgeKeys.length),companionDetails=operations.some(o=>o.operation==='companions.add');
 const index=semanticIndex(raw,{scalarLocators:true,knowledgeDetails,companionDetails});
 structuralSnapshots.set(index.document,{index,knowledgeDetails,companionDetails,digest:projectionDigest(index.document)});return index.document;
}
function preparedStructuralIndex(prepared,{knowledgeDetails,companionDetails}){
 const snapshot=structuralSnapshots.get(prepared?.document);if(!snapshot||snapshot.knowledgeDetails!==knowledgeDetails||snapshot.companionDetails!==companionDetails)return null;
 if(prepared.document.plaintext!==prepared.decoded.plaintext||projectionDigest(prepared.document)!==snapshot.digest)fail('STRUCTURAL_SOURCE_CHANGED');
 return {...snapshot.index};
}
function permittedKnowledgeChanges(sourceIndex,addItems){
 const changes=new Map();for(const op of addItems){for(const key of catalogItemAdditionDefinition(op.definitionKey).knowledgeKeys){const old=sourceIndex.knowledge.get(key);if(!old)changes.set(key,{operation:'knowledge.add',key});else if(old.fields._level?.value<1)changes.set(key,{operation:'knowledge.setLevel',key,beforeLevel:old.fields._level.value,afterLevel:1,path:old.fields._level.path});}
 }
 return changes;
}
export function createStructuralDraftCompiler({schemaPins=[CRIMSON_CURRENT_SCHEMA],itemCompiler=buildCatalogItemAdditions,companionCompiler=buildCompanionAdditions,scalarCompiler=createWorkbenchDraft}={}){
 if(!Array.isArray(schemaPins)||!schemaPins.length||schemaPins.length>3||schemaPins.some(s=>!/^[a-f0-9]{64}$/.test(s))||[itemCompiler,companionCompiler,scalarCompiler].some(fn=>typeof fn!=='function'))throw Error('Invalid internal structural compiler configuration.');
 return async function compileStructuralDraft(backup,metadata,input,{nonce,retainEncoded=false}={}){
 assertStructuralPlan(input,{schemaPins});if(nonce!==undefined&&(!Buffer.isBuffer(nonce)||nonce.length!==16))fail('STRUCTURAL_NONCE_INVALID');
 const addItems=input.operations.filter(o=>o.operation==='inventory.addItem'),addPets=input.operations.filter(o=>o.operation==='companions.add'),scalarOps=input.operations.filter(o=>scalarNames.includes(o.operation)).map(o=>({...o})),knowledgeDetails=addItems.some(op=>catalogItemAdditionDefinition(op.definitionKey).knowledgeKeys.length>0);
 const {bytes:source,blob,prepared}=structuralSourcePayload(backup,metadata,input),decoded=prepared?.decoded||await decodeSave(source),sourceIndex=preparedStructuralIndex(prepared,{knowledgeDetails,companionDetails:addPets.length>0})||semanticIndex(decoded.plaintext,{scalarLocators:true,knowledgeDetails,companionDetails:addPets.length>0});let before=sourceIndex.document;
 if(decoded.version!==2||!schemaPins.includes(before.schemaSha256)||before.schemaSha256!==input.schemaSha256||before.plaintextSha256!==input.plaintextSha256||before.audit.advisoryLocators||before.audit.unconsumedBytes)fail('STRUCTURAL_SOURCE_CHANGED');
 if(!await preparedSourceNativeParity(backup,metadata,input,decoded,source,encodeSave))fail('STRUCTURAL_NATIVE_PARITY_FAILED');
 const stackCount=op=>{const max=BigInt(catalogItemAdditionDefinition(op.definitionKey).maxStack);return Number((BigInt(op.quantity)+max-1n)/max);},totalStacks=addItems.reduce((n,op)=>n+stackCount(op),0),slotsNeeded=addItems.filter(op=>catalogItemAdditionDefinition(op.definitionKey).defaultInventory===2).reduce((n,op)=>n+stackCount(op),0);
 if(totalStacks>MAX_STRUCTURAL_NEW_ITEM_STACKS)fail('STRUCTURAL_OPERATION_LIMIT','Send fewer item stacks together.');
 let capacity=null;
 if(slotsNeeded||scalarOps.some(op=>op.inventoryKey===2)){
  const bag=one(elements(one(before.blocks,b=>b.type==='InventorySaveData'),'_inventorylist'),b=>value(b,'_inventoryKey')===2),list=field(bag,'_itemList'),rows=elements(bag,'_itemList'),expansion=field(bag,'_varyExpandSlotCount');
  if(!list?.present||list.value?.truncated||list.count!==rows.length||!expansion?.present||expansion.kind!==0||expansion.bytes!==2)fail('STRUCTURAL_INVENTORY_INCOMPLETE');
  capacity=planInventoryCapacity({inventory:{bags:[{inventoryKey:2,itemListPresent:true,truncated:false,itemRecordCount:rows.length,expansionSlots:expansion.value}],records:rows.map(r=>({inventoryKey:2,slot:value(r,'_slotNo'),instanceId:value(r,'_itemNo')}))}},{additionalSlots:slotsNeeded});
  if(!capacity.canFit)fail('STRUCTURAL_INVENTORY_FULL',capacity.warning);
  const capacityOp=scalarOps.find(o=>o.operation==='inventory.setExpansionValue');
  if(capacity.automaticExpansionRequired){if(capacityOp)capacityOp.desiredValue=String(Math.max(Number(capacityOp.desiredValue),capacity.requiredExpansionSlots));else scalarOps.push({operation:'inventory.setExpansionValue',inventoryKey:2,expectedValue:String(expansion.value),desiredValue:String(capacity.requiredExpansionSlots)});}
 }
 if(scalarOps.length>MAX_STRUCTURAL_SCALAR_OPERATIONS)fail('STRUCTURAL_OPERATION_LIMIT','Send fewer changes together so inventory space can be checked.');
 const nonzero=before.audit.nonzeroListMetadata,originalSchema=before.schemaSha256,knowledgeChanges=permittedKnowledgeChanges(sourceIndex,addItems);
 before=null;sourceIndex.document=null;
 let working=source,scalarReport=null,nativeScope=true;const scopeProofs=[],scopeChecks=[],stages=[],paths=new Set([...knowledgeChanges.values()].filter(d=>d.path).map(d=>d.path));
 if(scalarOps.length){
  const scalarPlan={...input,schema:'saveglass.crimson-draft-plan.v1',operations:scalarOps},r=await scalarCompiler(backup,metadata,scalarPlan,{nonce});working=r.encoded;scalarReport=r.report;
  const proof=scalarScopeWitness(r,source,scalarPlan);nativeScope=Boolean(proof);if(proof){scopeProofs.push(proof);scopeChecks.push(()=>Boolean(scalarScopeWitness(r,source,scalarPlan)));}
  if(scalarReport.operations.length!==scalarOps.length)fail('STRUCTURAL_SCALAR_BINDING_FAILED');
  for(const op of scalarReport.operations){const e=sourceIndex.scalarPaths.get(op.offset);if(!e||e.bytes!==op.fieldBytes||String(e.value)!==op.before||!e.path.endsWith('.'+op.field)||paths.has(e.path))fail('STRUCTURAL_SCALAR_BINDING_FAILED');paths.add(e.path);}
 }
 try{
  const requests=[...(addItems.length?[{operation:'inventory.addItem',family:'catalog_item',items:addItems}]:[]),...(addPets.length?[{operation:'companions.add',family:'catalog_companion',companions:addPets}]:[])];
  for(const op of requests){
   const item=op.operation==='inventory.addItem',stageSource=working;
   const r=item?await itemCompiler(working,op.items.map(o=>({definitionKey:o.definitionKey,quantity:o.quantity})),{nonce}):await companionCompiler(working,op.companions.map(o=>({characterKey:o.characterKey})),{nonce});
   const proof=item?itemScopeWitness(r,stageSource,op.items.map(o=>({definitionKey:o.definitionKey,quantity:o.quantity}))):null;
   nativeScope=nativeScope&&Boolean(proof);if(proof){scopeProofs.push(proof);scopeChecks.push(()=>Boolean(itemScopeWitness(r,stageSource,op.items.map(o=>({definitionKey:o.definitionKey,quantity:o.quantity})))));}
   const flags=['fullTypedReparse','reverseStructuralByteParity','hmacReverified','encodedOutputReopened','unknownHeaderBytesPreserved','allOtherOriginalScalarValuesUnchanged'];
   if(r.report.sourceSha256!==hash(working)||r.report.cloudRequests!==0||!flags.every(k=>r.report.validation[k]===true))fail('STRUCTURAL_STAGE_VALIDATION_FAILED');
   stages.push({operation:op.operation,family:op.family,revision:r.report.revision,sourceSha256:r.report.sourceSha256,outputSha256:r.report.outputSha256,inserted:Array.isArray(r.report.inserted)?r.report.inserted:[r.report.inserted],decodedDiff:r.report.decodedDiff||[],perInventory:r.report.perInventory||[],runtimeRequirements:r.report.runtimeRequirements||r.report.inserted.filter(r=>r.runtimeRequirement).map(r=>({characterKey:r.characterKey,message:r.runtimeRequirement})),validation:r.report.validation});working=r.encoded;
  }
 }catch(error){if(error instanceof CodecError){const messages={CRIMSON_COMPANION_ALREADY_OWNED:'This save already has this companion.',CRIMSON_ITEM_ALREADY_OWNED:'This item is already in your bag. Change its existing stack instead.',CRIMSON_GEAR_ALREADY_OWNED:'This gear is already owned in this save.'};throw new ProbeError(messages[error.code]||error.message,409,error.code);}throw error;}
 const actualKnowledge=stages.flatMap(s=>s.decodedDiff.filter(d=>d.operation==='knowledge.add'||d.operation==='knowledge.setLevel'));
 // Every native child is checked again after the final asynchronous decode.
 // Repeating that same full-byte proof immediately before it adds no evidence.
 const nativeItemUnion=nativeScope&&!knowledgeDetails&&!addPets.length;
 const reopened=await decodeSave(working);let after,afterPlaintextSha256,original=null;
 if(nativeItemUnion){
  // Each exact native child already validated its complete typed output and
  // proved preservation of all original values. Compose those opaque proofs;
  // a second inventory/global index adds no independent byte evidence.
  const proof=scopeProofs.at(-1),entries=stages.flatMap(s=>s.inserted),ids=new Set(),totals=new Map();
  afterPlaintextSha256=hash(reopened.plaintext);
  if(proof?.kind!=='native-item-structural-byte-proof'||proof.outputSha256!==hash(working)||proof.plaintextSha256!==afterPlaintextSha256||proof.schemaSha256!==originalSchema||proof.nonzeroListMetadata!==nonzero||actualKnowledge.length||entries.length!==totalStacks)fail('STRUCTURAL_UNINTENDED_CHANGE');
  for(const entry of entries){const definition=catalogItemAdditionDefinition(entry.definitionKey);if(!addItems.some(o=>o.definitionKey===entry.definitionKey)||entry.inventoryKey!==definition.defaultInventory||sourceIndex.identities.has(entry.instanceId)||ids.has(entry.instanceId)||!/^[1-9]\d{0,19}$/.test(entry.quantity)||BigInt(entry.quantity)>BigInt(definition.maxStack))fail('STRUCTURAL_FINAL_IDENTITY_CHANGED');ids.add(entry.instanceId);totals.set(entry.definitionKey,(totals.get(entry.definitionKey)||0n)+BigInt(entry.quantity));}
  if(addItems.some(o=>totals.get(o.definitionKey)!==BigInt(o.quantity)))fail('STRUCTURAL_FINAL_QUANTITY_CHANGED');
  after={schemaSha256:proof.schemaSha256,audit:{nonzeroListMetadata:proof.nonzeroListMetadata,advisoryLocators:0,unconsumedBytes:0}};
 }else{
 const finalIndex=semanticIndex(reopened.plaintext,{hashPlaintext:false,knowledgeDetails,companionDetails:addPets.length>0});after=finalIndex.document;const afterItems=records(after,'ItemSaveData'),afterPets=records(after,'MercenarySaveData'),inserted=[],newIds=[];
 const requestedItems=new Map(addItems.map(op=>[op.definitionKey,op])),requestedPets=new Set(addPets.map(op=>op.characterKey)),itemTotals=new Map(),itemBags=new Map();
 for(const bag of elements(after.blocks.find(b=>b.type==='InventorySaveData'),'_inventorylist'))for(const r of elements(bag,'_itemList'))itemBags.set(value(r,'_itemNo'),value(bag,'_inventoryKey'));
 let insertedItems=0,insertedPets=0,embeddedItems=0;
 for(const stage of stages){const pet=stage.operation==='companions.add';for(const entry of stage.inserted){
  const r=one(pet?afterPets:afterItems,o=>String(value(o,pet?'_mercenaryNo':'_itemNo'))===entry.instanceId);inserted.push(r);
  if(pet){
   if(!requestedPets.has(entry.characterKey))fail('STRUCTURAL_FINAL_IDENTITY_CHANGED');const nestedItems=records({blocks:[r]},'ItemSaveData'),actualIds=[{kind:'companion',instanceId:value(r,'_mercenaryNo')},...nestedItems.map(i=>({kind:'item',instanceId:value(i,'_itemNo')}))],sortIds=ids=>ids.map(i=>i.kind+':'+i.instanceId).sort();
   if(nestedItems.length!==(entry.embeddedItems||0)||JSON.stringify(sortIds(actualIds))!==JSON.stringify(sortIds(entry.identities||[])))fail('STRUCTURAL_FINAL_IDENTITY_CHANGED');
   insertedPets++;embeddedItems+=nestedItems.length;newIds.push(...actualIds.map(i=>i.instanceId));
  }else{
   const request=requestedItems.get(entry.definitionKey),definition=catalogItemAdditionDefinition(entry.definitionKey);if(!request||entry.inventoryKey!==definition.defaultInventory||itemBags.get(entry.instanceId)!==definition.defaultInventory||value(r,'_slotNo')!==entry.slot||!/^[1-9]\d{0,19}$/.test(entry.quantity)||BigInt(entry.quantity)>BigInt(definition.maxStack))fail('STRUCTURAL_FINAL_IDENTITY_CHANGED');
   itemTotals.set(entry.definitionKey,(itemTotals.get(entry.definitionKey)||0n)+BigInt(entry.quantity));insertedItems++;newIds.push(entry.instanceId);
  }
  if(value(r,pet?'_characterKey':'_itemKey')!==(pet?entry.characterKey:entry.definitionKey)||!pet&&String(value(r,'_stackCount'))!==entry.quantity)fail('STRUCTURAL_FINAL_IDENTITY_CHANGED');
 }}
 if(actualKnowledge.length!==knowledgeChanges.size||new Set(actualKnowledge.map(d=>d.key)).size!==actualKnowledge.length)fail('STRUCTURAL_DISCOVERY_DIFF');
 let addedKnowledge=0;
 for(const change of actualKnowledge){
  const allowed=knowledgeChanges.get(change.key),old=sourceIndex.knowledge.get(change.key),row=finalIndex.knowledge.get(change.key);
  if(!allowed||allowed.operation!==change.operation||!row||row.fields._level?.value!==1)fail('STRUCTURAL_DISCOVERY_DIFF');
  if(change.operation==='knowledge.add'){
   if(old||!row.range||row.index<sourceIndex.knowledge.size||Object.entries(change.after||{}).some(([key,expected])=>row.fields[key]?.value!==expected))fail('STRUCTURAL_DISCOVERY_DIFF');
   inserted.push(row.range);addedKnowledge++;
  }else if(change.beforeLevel!==old.fields._level.value||change.afterLevel!==1||row.fields._level.path!==allowed.path)fail('STRUCTURAL_DISCOVERY_DIFF');
 }
 if(addItems.some(op=>itemTotals.get(op.definitionKey)!==BigInt(op.quantity)))fail('STRUCTURAL_FINAL_QUANTITY_CHANGED');
 // Fixed native stages already proved their exact scalar byte ranges and
 // reverse structural relocation. Only opaque, byte/intent/report-bound
 // results from this engine may compose those proofs. Custom/cloned results
 // retain the independent full scalar-stream comparison.
 original=nativeScope?null:scalarDigest(decoded.plaintext,{paths});
 if(finalIndex.knowledge.size!==sourceIndex.knowledge.size+addedKnowledge||newIds.some(id=>sourceIndex.identities.has(id)||finalIndex.identities.get(id)!==1)||new Set(newIds).size!==newIds.length||insertedItems!==totalStacks||insertedPets!==addPets.length||finalIndex.itemCount!==sourceIndex.itemCount+insertedItems+embeddedItems||finalIndex.petCount!==sourceIndex.petCount+insertedPets||after.schemaSha256!==originalSchema||after.audit.nonzeroListMetadata!==nonzero||after.audit.advisoryLocators||after.audit.unconsumedBytes||!nativeScope&&JSON.stringify(scalarDigest(reopened.plaintext,{paths,ranges:inserted}))!==JSON.stringify(original))fail('STRUCTURAL_UNINTENDED_CHANGE');
 if(scalarReport){for(const op of scalarReport.operations){const target=op.operation==='inventory.setExpansionValue'?one(elements(one(after.blocks,b=>b.type==='InventorySaveData'),'_inventorylist'),b=>value(b,'_inventoryKey')===2):one(afterItems,o=>String(value(o,'_itemNo'))===op.instanceId);if(String(value(target,op.field))!==op.after||op.operation!=='inventory.setExpansionValue'&&itemBags.get(op.instanceId)!==op.inventoryKey)fail('STRUCTURAL_SCALAR_CHANGED');}}
 }
 if(nativeScope&&!scopeChecks.every(check=>check()))fail('STRUCTURAL_STAGE_VALIDATION_FAILED');
 if(!working.subarray(0,0x12).equals(source.subarray(0,0x12))||!working.subarray(0x4a,128).equals(source.subarray(0x4a,128))||!nativeItemUnion&&!(await encodeSave(reopened.plaintext,reopened.header,{nonce:reopened.header.subarray(0x1a,0x2a)})).equals(working)||hash(source)!==blob.sha256)fail('STRUCTURAL_REOPEN_FAILED');
 const beforePlaintextSha256=hash(decoded.plaintext);if(beforePlaintextSha256!==input.plaintextSha256)fail('STRUCTURAL_SOURCE_CHANGED');
 afterPlaintextSha256??=hash(reopened.plaintext);
 const operations=[...(scalarReport?.operations||[]),...stages.flatMap(s=>s.inserted.map(entry=>({operation:s.operation,...entry}))),...actualKnowledge];
 const report={schema:'saveglass.structural-draft-preview.v1',revision:'saverift.source-backed-construction.2026-11-01.v2',decoderRevision:DECODER_REVISION,catalogRevision:CATALOG_REVISION,source:'plugin_bundle',backupId:metadata.id,backupSha256:metadata.sha256,backupRevision:backup.revision,container:input.container,payload:'save',payloadSha256:blob.sha256,schemaSha256:originalSchema,beforePlaintextSha256,afterPlaintextSha256,planSha256:structuralDraftDigest(input),encodedSha256:hash(working),encodedBytes:working.length,operations,decodedDiff:operations,capacity,stages,runtimeRequirements:stages.flatMap(s=>s.runtimeRequirements),validation:{nativeNoOpByteParity:true,nativeLz4NoOpByteParity:true,originalNoOpByteParity:true,fullDocumentReparsed:true,fullTypedReparse:true,allOtherDecodedValuesUnchanged:true,originalScalarValuesUnchanged:true,...(original?{originalScalarDigest:original.sha256,originalScalarCount:original.count}:{conservationProof:{format:'native-stage-witnesses.v1',stages:scopeProofs}}),stagewiseReverseStructuralByteParity:true,distinctGlobalNewIdentities:true,discoveryIntendedOnly:true,hmacReverified:true,encodedOutputReopened:true,unknownHeaderBytesPreserved:true,nonzeroListMetadataPreserved:after.audit.nonzeroListMetadata===nonzero,nonzeroListMetadataBefore:nonzero,nonzeroListMetadataAfter:after.audit.nonzeroListMetadata},gameAcceptance:'known_record_structure_no_per_definition_console_gate',draftOnly:true,originalBackupUnchanged:true,modifiedSaveStored:false,writesEnabled:false,publishEligible:false};
 return retainEncoded?{report,encoded:working}:report;
 };
}
export const compileStructuralDraft=createStructuralDraftCompiler();
export const createStructuralWorkbenchDraft=(backup,metadata,input,{nonce}={})=>compileStructuralDraft(backup,metadata,input,{nonce,retainEncoded:true});
