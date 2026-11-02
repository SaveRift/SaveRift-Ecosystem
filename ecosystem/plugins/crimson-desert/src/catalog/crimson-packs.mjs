// Immutable recipe data and snapshot-only resolution. No network, persistence,
// platform credentials, writable offsets or arbitrary record constructors.
import {getData} from '../data-provider.mjs';
const data=getData('crimson-packs.json');
const itemCatalogData=getData('crimson-items.json');
import {planPackInventorySpace} from '../inventory-placement.mjs';
import {structuralSchemaSupported,MAX_STRUCTURAL_OPERATIONS,MAX_STRUCTURAL_ITEM_INTENTS,MAX_STRUCTURAL_SCALAR_OPERATIONS,MAX_COMPANION_ADDITIONS,MAX_STRUCTURAL_NEW_ITEM_STACKS} from '../structural-publication-profile.mjs';
import {catalogItemAdditionDefinition,catalogItemAdditionSupported,catalogItemAdditionUnavailableReason} from '../catalog-item-profile.mjs';
import {companionAdditionDefinition,companionAdditionSupported} from '../companion-addition-profile.mjs';
import {existingStackQuantityProfile,validInventoryKey} from '../inventory-quantity-profile.mjs';

export const PACK_REVISION=data.manifest.revision+':'+data.manifest.recipeSha256;
const MAX=MAX_STRUCTURAL_OPERATIONS,U64=0xffffffffffffffffn;
const decimal=v=>typeof v==='string'&&/^(0|[1-9]\d{0,19})$/.test(v)&&BigInt(v)<=U64;
const keyOf=d=>d.operation.startsWith('cartography.')?d.operation:d.operation==='inventory.setExpansionValue'?`capacity:${d.inventoryKey}`:d.operation==='inventory.addItem'?`addition:item:${d.definitionKey}`:d.operation==='companions.add'?`addition:companion:${d.characterKey}`:`item:${d.inventoryKey}:${d.definitionKey}:${d.instanceId}:${d.slot}`;
function freeze(v){if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
const packs=freeze(data.packs.map(p=>({...p,recipeRevision:PACK_REVISION,catalogRevision:data.manifest.catalogRevision})));
const catalog=freeze({...data.manifest,revision:PACK_REVISION,packs});
const byId=new Map(packs.map(p=>[p.id,p]));
const itemDefinitions=new Map(itemCatalogData.items.map(item=>[item.key,item]));
const additionFamily=(key,domains)=>structuralSchemaSupported(domains.schemaSha256,domains.saveVersion)&&catalogItemAdditionSupported(key,domains.schemaSha256)?'catalog_item':null;
const ownsDefinition=(domains,key)=>domains.inventory.ownedDefinitionKeys?.includes(key)||domains.inventory.records.some(r=>r.definitionKey===key);
function additionDefinition(key){const profile=catalogItemAdditionDefinition(key),item=itemDefinitions.get(key);return profile&&item?{definitionKey:key,displayName:item.name,internalName:item.internalName,referenceMaxStack:profile.maxStack,inventoryKey:profile.defaultInventory,runtimeRequirement:profile.runtimeRequirement,uniqueBalance:profile.uniqueBalance}:null;}
function additionOperation(definition,quantity){return {schema:'saveglass.item-addition-intent.v1',operation:'inventory.addItem',...definition,quantity:String(quantity),status:'awaiting_combined_validation',publishEligible:false};}
function additionQuantitySupported(definition,quantity){return typeof quantity==='string'&&/^[1-9]\d{0,8}$/.test(quantity)&&decimal(definition.referenceMaxStack)&&BigInt(definition.referenceMaxStack)>0n&&(!definition.uniqueBalance||BigInt(quantity)<=BigInt(definition.referenceMaxStack))&&(BigInt(quantity)+BigInt(definition.referenceMaxStack)-1n)/BigInt(definition.referenceMaxStack)<=BigInt(MAX_STRUCTURAL_NEW_ITEM_STACKS);}
export function getPackCatalog(){return catalog;}
export function getPackRecipe(id){return byId.get(id)||null;}
export class PackError extends Error{constructor(code,message,status=409){super(message);this.name='PackError';this.code=code;this.status=status;}}
const failure=(code,message,status)=>{throw new PackError(code,message,status);};
function stage(operation,record,desired){
  const capacity=operation==='inventory.setExpansionValue';
  return {schema:'saveglass.crimson-staged-operation.v1',operation,displayName:capacity?'Bag size':record.displayName,inventoryKey:record.inventoryKey,expectedValue:String(capacity?record.expansionSlots:record.quantity),desiredValue:String(desired),...(capacity?{}:{definitionKey:record.definitionKey,instanceId:record.instanceId,slot:record.slot}),status:'awaiting_combined_validation',publishEligible:false};
}
function basicRecord(r,domains){
  if(!validInventoryKey(r.inventoryKey)||r.catalogMatched!==true||r.quantityPresent!==true||r.quantityBytes!==8||!decimal(r.quantity)||!decimal(r.instanceId)||r.instanceId==='0'||!Number.isSafeInteger(r.slot)||r.slot<0||r.slot>65535||!existingStackQuantityProfile(r.definitionKey,r.referenceMaxStack))return false;
  const bags=domains.inventory.bags.filter(b=>b.inventoryKey===r.inventoryKey),records=domains.inventory.records.filter(item=>item.inventoryKey===r.inventoryKey),slots=records.map(item=>item.slot);
  return bags.length===1&&bags[0].itemListPresent===true&&bags[0].truncated===false&&bags[0].itemRecordCount===records.length&&slots.every(slot=>Number.isSafeInteger(slot)&&slot>=0&&slot<=65535)&&new Set(slots).size===slots.length;
}
function sourceCheck(domains){
  if(!domains||domains.schema!=='saveglass.crimson-domains.v1'||domains.catalog?.revisionId!==catalog.catalogRevision||domains.saveVersion!==2||!catalog.compatibleSchemaSha256.includes(domains.schemaSha256)||domains.structuralValidation!=='full_strict_traversal'||domains.audit?.unconsumedBytes!==0||domains.catalog?.coverage?.completeInventory!==true||!Array.isArray(domains.inventory?.records)||!Array.isArray(domains.inventory?.bags))return 'This save needs a supported, complete inspection before a pack can be staged.';
  if(domains.inventory.records.length>10000||domains.inventory.bags.length>128)return 'This inventory exceeds the bounded pack preview.';
  const list=domains.inventory.records,ids=list.map(r=>r.instanceId).filter(id=>id!==null&&id!==undefined);
  if(ids.some(id=>!decimal(id)||id==='0')||new Set(ids).size!==ids.length)return 'The save has ambiguous item identities. No pack will be applied.';
  const bags=domains.inventory.bags.filter(b=>b.inventoryKey===2),owned=list.filter(r=>r.inventoryKey===2),slots=owned.map(r=>r.slot);
  if(bags.length!==1||bags[0].truncated||bags[0].itemListPresent!==true||bags[0].itemRecordCount!==owned.length||slots.some(n=>!Number.isSafeInteger(n)||n<0||n>65535)||new Set(slots).size!==slots.length)return 'The editable inventory is incomplete or its occupied slots are ambiguous.';
  return null;
}
function normalizeDrafts(domains,drafts){
  if(!Array.isArray(drafts)||drafts.length>MAX)failure('PACK_DRAFT_CONFLICT',`Keep the combined draft within ${MAX} changes.`);
  const out=[],targets=new Set(),companionGroups=new Set(),records=domains.inventory.records;
  for(const d of drafts){
    if(d?.schema==='saveglass.cartography-staged.v1'){
      const names={'reveal-map':'Reveal Map','unlock-nexus':'Nexus Unlock'};
      if(!structuralSchemaSupported(domains.schemaSha256,domains.saveVersion)||!Object.hasOwn(names,d.recipe)||d.operation!=='cartography.'+d.recipe||targets.has(d.operation))failure('PACK_DRAFT_CONFLICT','Choose each supported Cartography change once for this save.');
      targets.add(d.operation);out.push({schema:d.schema,operation:d.operation,recipe:d.recipe,displayName:names[d.recipe],status:'awaiting_bound_validation',publishEligible:false});continue;
    }
    if(d?.schema==='saveglass.item-addition-intent.v1'&&d.operation==='inventory.addItem'){
      const definition=additionDefinition(d.definitionKey),family=additionFamily(d.definitionKey,domains);
      if(definition?.uniqueBalance&&ownsDefinition(domains,d.definitionKey))failure('PACK_DRAFT_CONFLICT','Use Copper in Quick changes to change your existing balance.');
      if(!definition||!family||!additionQuantitySupported(definition,d.quantity))failure('PACK_DRAFT_CONFLICT','An item addition is missing native constructor metadata or exceeds its stack limit.');
      const normalized=additionOperation(definition,d.quantity),target=keyOf(normalized);if(targets.has(target))failure('PACK_DRAFT_CONFLICT','Two draft entries target the same addition.');targets.add(target);out.push(normalized);continue;
    }
    if(d?.schema==='saveglass.companion-addition-intent.v1'&&d.operation==='companions.add'){
      const definition=companionAdditionDefinition(d.characterKey),group=definition?.ownershipGroup,groupOf=key=>companionAdditionDefinition(key)?.ownershipGroup||`character:${key}`;
      if(!structuralSchemaSupported(domains.schemaSha256,domains.saveVersion)||!companionAdditionSupported(d.characterKey,domains.schemaSha256)||d.quantity!=='1'||!Array.isArray(domains.companions)||domains.companions.some(c=>groupOf(c.characterKey)===group)||companionGroups.has(group))failure('PACK_DRAFT_CONFLICT','This companion is already owned or queued, or its clean save record is unavailable.');
      const normalized={schema:'saveglass.companion-addition-intent.v1',operation:'companions.add',characterKey:d.characterKey,displayName:definition.name,classification:definition.category==='pets'?'pet':definition.category==='camp'?'camp':'mount',quantity:'1',status:'awaiting_combined_validation',publishEligible:false},target=keyOf(normalized);if(targets.has(target))failure('PACK_DRAFT_CONFLICT','Two draft entries target the same companion.');targets.add(target);companionGroups.add(group);out.push(normalized);continue;
    }
    if(!d||d.schema!=='saveglass.crimson-staged-operation.v1'||!validInventoryKey(d.inventoryKey)||d.operation!=='inventory.setQuantity'&&d.inventoryKey!==2||!decimal(d.expectedValue)||!decimal(d.desiredValue)||d.expectedValue===d.desiredValue)failure('PACK_DRAFT_CONFLICT','Remove changes whose inventory identity or original value cannot be validated before applying a pack.');
    let record,desired=BigInt(d.desiredValue),normalized;
    if(d.operation==='inventory.setExpansionValue'){
      const bags=domains.inventory.bags.filter(b=>b.inventoryKey===2);record=bags[0];
      if(bags.length!==1||!Number.isSafeInteger(record.expansionSlots)||String(record.expansionSlots)!==d.expectedValue||desired<=BigInt(d.expectedValue)||desired>200n)failure('PACK_DRAFT_CONFLICT','The staged bag size no longer matches this save.');
      normalized=stage(d.operation,record,d.desiredValue);
    }else{
      const matches=records.filter(r=>r.inventoryKey===d.inventoryKey&&r.definitionKey===d.definitionKey&&r.instanceId===d.instanceId&&r.slot===d.slot);record=matches[0];
      if(matches.length!==1||!basicRecord(record,domains)||record.quantity!==d.expectedValue||!['inventory.setQuantity','inventory.setCopper'].includes(d.operation)||(d.operation==='inventory.setCopper')!==existingStackQuantityProfile(record.definitionKey,record.referenceMaxStack)?.uniqueBalance||desired<1n||desired>BigInt(existingStackQuantityProfile(record.definitionKey,record.referenceMaxStack).maximum))failure('PACK_DRAFT_CONFLICT','An existing staged item no longer matches its exact source record or native stack limit.');
      normalized=stage(d.operation,record,d.desiredValue);
    }
    const target=keyOf(normalized);if(targets.has(target))failure('PACK_DRAFT_CONFLICT','Two draft entries target the same field.');targets.add(target);out.push(normalized);
  }
  return out;
}
function unavailable(row,reasonCode,reason){return {...row,status:'unavailable',reasonCode,reason,operation:null};}
function conflicting(row,reasonCode,reason){return {...row,status:'conflict',reasonCode,reason,operation:null};}
function resolveAddition(row,content,domains,pending){
  if(!structuralSchemaSupported(domains.schemaSha256,domains.saveVersion))return unavailable({...row,current:'0',effective:'0',after:'0'},'ADDITION_SCHEMA_UNSUPPORTED','New item additions are not supported for this save layout yet. Owned stack upgrades can still be reviewed.');
  const family=additionFamily(content.definitionKey,domains),definition=additionDefinition(content.definitionKey),target=content.targetQuantity;
  if(!family||!definition)return unavailable({...row,current:'0',effective:'0',after:'0'},'CONSTRUCTOR_METADATA_MISSING',catalogItemAdditionUnavailableReason(content.definitionKey)==='embedded_subitem_defaults_required'?'This item requires embedded contents metadata that is not available yet.':'Native constructor metadata is missing for this item.');
  if(definition.internalName!==content.internalName||itemDefinitions.get(content.definitionKey)?.referenceMaxStack!==content.referenceMaxStack)return unavailable(row,'CATALOG_IDENTITY_MISMATCH','This recipe does not match the exact pinned catalog identity and reference limit.');
  if(!additionQuantitySupported(definition,target))return unavailable(row,'REFERENCE_LIMIT','This recipe exceeds the constructor stack budget.');
  const p=pending.get(`addition:item:${content.definitionKey}`);
  if(p)return BigInt(p.quantity)>=BigInt(target)?{...row,current:'0',effective:p.quantity,after:p.quantity,status:'satisfied',reasonCode:'MINIMUM_ALREADY_MET',reason:'This item is already covered by your staged addition.'}:conflicting({...row,current:'0',effective:p.quantity,after:p.quantity},'PENDING_EDIT_CONFLICT','A smaller addition is already staged for this item. Review or remove it before applying this pack.');
  return {...row,current:'0',effective:'0',after:target,status:'ready',reasonCode:'REVIEWED_ITEM_ADDITION',reason:'Add a fresh item using the reviewed constructor. Existing records stay unchanged.',requiredCapability:'insert_item',constructorFamily:family,operation:additionOperation(definition,target)};
}
function resolveItem(recipe,content,domains,pending){
  const all=domains.inventory.records.filter(r=>r.definitionKey===content.definitionKey);
  const row={kind:'item',definitionKey:content.definitionKey,internalName:content.internalName,displayName:content.displayName,iconUrl:content.iconUrl,target:content.targetQuantity,current:null,effective:null,after:null,status:'unavailable',reasonCode:null,reason:null,operation:null,requiredCapability:recipe.delivery==='missing_only'?'insert_item':'edit_existing'};
  if(all.some(r=>r.catalogMatched!==true||r.internalName!==content.internalName))return unavailable(row,'CATALOG_IDENTITY_MISMATCH','The exact item definition could not be matched in this save.');
  if(recipe.delivery==='missing_only'){
    if(all.length)return {...row,current:String(all.length),effective:String(all.length),after:String(all.length),status:'satisfied',reasonCode:'ALREADY_OWNED',reason:'Already owned. Existing gear is kept as it is.',ownedInstances:all.length};
    if(ownsDefinition(domains,content.definitionKey))return {...row,current:'1',effective:'1',after:'1',status:'satisfied',reasonCode:'ALREADY_OWNED',reason:'Already owned or equipped. Existing gear is kept as it is.',ownershipLocation:'equipped_or_other_saved_item'};
    return resolveAddition(row,content,domains,pending);
  }
  const profile=existingStackQuantityProfile(content.definitionKey,content.referenceMaxStack),records=[...all].sort((a,b)=>Number(a.inventoryKey!==2)-Number(b.inventoryKey!==2)||a.inventoryKey-b.inventoryKey||a.slot-b.slot||(BigInt(a.instanceId)<BigInt(b.instanceId)?-1:1));
  const fresh=pending.get(`addition:item:${content.definitionKey}`);
  if(!records.length&&fresh)return resolveAddition(row,content,domains,pending);
  if(!records.length){if(!all.length&&!ownsDefinition(domains,content.definitionKey))return resolveAddition(row,content,domains,pending);const observed=all.length&&all.every(r=>decimal(r.quantity))?String(all.reduce((n,r)=>n+BigInt(r.quantity),0n)):null;return unavailable({...row,current:observed,effective:observed,after:observed,ownedInstances:all.length||null},'NONEDITABLE_OWNED_RECORD','This owned or equipped item is outside the editable inventory. It will be preserved.');}
  if(profile?.uniqueBalance&&(records.length!==1||records[0].inventoryKey!==2))return unavailable({...row,ownedInstances:records.length},'COPPER_IDENTITY_AMBIGUOUS','Exactly one Copper balance in the main inventory is required. No currency value will be chosen automatically.');
  if(!profile||records.some(r=>!basicRecord(r,domains)||r.referenceMaxStack!==content.referenceMaxStack))return unavailable({...row,ownedInstances:records.length},'EXISTING_FIELD_UNSUPPORTED','This saved record has no complete, supported quantity field or its inventory is ambiguous. It will be preserved.');
  const target=BigInt(content.targetQuantity),maximum=BigInt(profile.maximum);
  if(target<1n||target>maximum)return unavailable(row,'REFERENCE_LIMIT','This recipe exceeds the pinned reference stack limit.');
  const quantities=records.map(r=>({r,current:BigInt(r.quantity),effective:BigInt(pending.get(keyOf(stage(content.definitionKey===1?'inventory.setCopper':'inventory.setQuantity',r,r.quantity)))?.desiredValue??r.quantity)}));
  const current=quantities.reduce((n,x)=>n+x.current,0n),effective=quantities.reduce((n,x)=>n+x.effective,0n)+(fresh?BigInt(fresh.quantity):0n),after=effective<target?target:effective;
  const known={...row,current:String(current),effective:String(effective),after:String(after),ownedInstances:records.length};
  if(quantities.some(x=>x.effective<x.current))return conflicting({...known,after:String(effective)},'PENDING_EDIT_CONFLICT','An existing change reduces this item. Remove that change before applying this pack.');
  if(effective>=target)return {...known,status:'satisfied',reasonCode:'MINIMUM_ALREADY_MET',reason:effective!==current?'This minimum is already covered by your staged changes.':'Already at or above this target. Nothing is removed.'};
  // A minimum target never exceeds one stack's reference bound. Existing
  // sibling stacks are counted and preserved, so the first exact editable
  // instance can always hold the deficit without allocating another slot.
  const first=quantities.find(x=>!pending.has(keyOf(stage(content.definitionKey===1?'inventory.setCopper':'inventory.setQuantity',x.r,x.r.quantity))));
  if(!first)return conflicting({...known,after:String(effective)},'PENDING_EDIT_CONFLICT','A different quantity is already staged for this item. Remove that change before applying this pack.');
  const desired=first.effective+(target-effective);
  if(desired>maximum)return unavailable(known,'STACK_CAPACITY_REQUIRED','This refill would need a new stack. It has not been partially applied.');
  const operation=stage(content.definitionKey===1?'inventory.setCopper':'inventory.setQuantity',first.r,String(desired));
  return {...known,status:'ready',reasonCode:'EXISTING_STACK_TOP_UP',reason:records.length>1?'Top up one existing stack; all sibling stacks stay unchanged.':'Top up the existing stack.',operation};
}
function resolveCapacity(content,domains,pending){
  const row={kind:'capacity',displayName:'Bag size',definitionKey:null,iconUrl:null,target:String(content.targetCapacity),current:null,effective:null,after:null,operation:null,requiredCapability:'edit_capacity'};
  const bags=domains.inventory.bags.filter(b=>b.inventoryKey===2),bag=bags[0];
  if(bags.length!==1||!Number.isSafeInteger(bag.expansionSlots)||bag.expansionSlots<0||bag.expansionSlots>200)return unavailable(row,'CAPACITY_FIELD_UNSUPPORTED','Bag size is unavailable for this snapshot.');
  const current=50+bag.expansionSlots,p= pending.get('capacity:2'),effective=p?50+Number(p.desiredValue):current,after=Math.max(effective,content.targetCapacity);
  const known={...row,current:String(current),effective:String(effective),after:String(after)};
  if(after<50||after>250||domains.inventory.records.filter(r=>r.inventoryKey===2).some(r=>r.slot>=after))return unavailable(known,'CAPACITY_CONFLICT','The requested bag size conflicts with the supported range or occupied slots.');
  if(effective>=content.targetCapacity)return {...known,status:'satisfied',reasonCode:'MINIMUM_ALREADY_MET',reason:'Your bag already has at least this much room.'};
  if(p)return conflicting({...known,after:String(effective)},'PENDING_EDIT_CONFLICT','A different bag size is already staged. Remove that change before applying this pack.');
  return {...known,status:'ready',reasonCode:'EXISTING_CAPACITY_INCREASE',reason:'Increase the existing bag size; all stored items stay in place.',operation:stage('inventory.setExpansionValue',bag,String(after-50))};
}

export function previewPack(packId,{domains,drafts=[]}={}){
  const recipe=getPackRecipe(packId);if(!recipe)failure('PACK_NOT_FOUND','Choose a pack from the current catalog.',404);
  const sourceProblem=sourceCheck(domains);let conflict=recipe.paused?'This pack is paused while its compatibility is reviewed.':sourceProblem,normalized=[];
  if(!conflict)try{normalized=normalizeDrafts(domains,drafts);}catch(error){conflict=error.message;}
  const pending=new Map(normalized.map(d=>[keyOf(d),d]));
  let entries;
  if(sourceProblem)entries=recipe.contents.map(c=>({...c,target:c.targetQuantity??String(c.targetCapacity),current:null,effective:null,after:null,status:'unavailable',reasonCode:'SNAPSHOT_UNSUPPORTED',reason:conflict,operation:null}));
  else entries=recipe.contents.map(c=>c.kind==='capacity'?resolveCapacity(c,domains,pending):resolveItem(recipe,c,domains,pending));
  const combine=rows=>{const combined=[...normalized];for(const operation of rows.filter(e=>e.operation).map(e=>e.operation)){const i=combined.findIndex(d=>keyOf(d)===keyOf(operation));if(i<0)combined.push(operation);else combined[i]=operation;}return combined;};
  let combined=combine(entries),inventorySpace=planPackInventorySpace(recipe,entries,domains,combined,{deliveryOnly:true});
  if(inventorySpace.newItemDefinitions>0&&!inventorySpace.canFit){
    const packAdditions=entries.filter(e=>e.operation?.operation==='inventory.addItem').length,failedDestinations=new Map(inventorySpace.perInventory?.filter(p=>!p.canFit).map(p=>[p.inventoryKey,p])||[]),allAdditionsBlocked=!inventorySpace.placementComplete||inventorySpace.reason==='CONSTRUCTOR_BATCH_LIMIT';
    entries=entries.map(e=>{const destination=failedDestinations.get(e.operation?.inventoryKey);return e.operation?.operation==='inventory.addItem'&&(allAdditionsBlocked||destination)?unavailable(e,destination?.reason||'INVENTORY_CAPACITY_LIMIT',destination?.warning||inventorySpace.warning||'There is not enough verified inventory space for this addition.'):e;});
    combined=combine(entries);
    if(!packAdditions||normalized.some(d=>d.operation==='inventory.addItem')&&!planPackInventorySpace(recipe,entries,domains,normalized,{deliveryOnly:true}).canFit)conflict=inventorySpace.warning||'An existing staged addition does not fit in this inventory.';
  }
  const stagedOperations=entries.filter(e=>e.operation).map(e=>e.operation);
  const newSlots=combined.filter(d=>d.operation==='inventory.addItem').reduce((n,d)=>n+Number((BigInt(d.quantity)+BigInt(d.referenceMaxStack)-1n)/BigInt(d.referenceMaxStack)),0);
  if(newSlots>MAX_STRUCTURAL_NEW_ITEM_STACKS)conflict=`Choose fewer new items. A transfer can add at most ${MAX_STRUCTURAL_NEW_ITEM_STACKS} new item stacks at once.`;
  const itemAdditions=combined.filter(d=>d.operation==='inventory.addItem').length,companions=combined.filter(d=>d.operation==='companions.add').length,cartography=combined.filter(d=>d.operation.startsWith('cartography.')).length,scalars=combined.length-itemAdditions-companions-cartography,limit=itemAdditions||companions||cartography?MAX:MAX_STRUCTURAL_SCALAR_OPERATIONS;
  if(itemAdditions>MAX_STRUCTURAL_ITEM_INTENTS)conflict=`Add at most ${MAX_STRUCTURAL_ITEM_INTENTS} different items in one transfer.`;
  if(companions>MAX_COMPANION_ADDITIONS)conflict=`Add at most ${MAX_COMPANION_ADDITIONS} companions in one transfer.`;
  if(scalars>MAX_STRUCTURAL_SCALAR_OPERATIONS)conflict='This pack would exceed eight existing-field changes. Remove another change or choose a smaller pack.';
  if(combined.length>limit)conflict=limit===MAX_STRUCTURAL_SCALAR_OPERATIONS?'This pack would exceed eight combined changes. Remove another change or choose a smaller pack.':`This pack would exceed ${limit} combined changes. Remove another change or choose a smaller pack.`;
  const omitted=entries.filter(e=>e.status==='unavailable'||e.status==='conflict'),ready=stagedOperations.length;
  const summary={changes:ready,alreadySatisfied:entries.filter(e=>e.status==='satisfied').length,unavailable:entries.filter(e=>e.status==='unavailable').length,conflicts:entries.filter(e=>e.status==='conflict').length+(conflict?1:0),total:entries.length,combinedChanges:combined.length};
  return {schema:'saveglass.crimson-pack-preview.v1',recipeRevision:PACK_REVISION,catalogRevision:catalog.catalogRevision,recipe,entries,stagedOperations,combinedDrafts:combined,omitted,summary,inventorySpace,
    canStageFull:ready>0&&omitted.length===0&&!conflict,canStageAvailable:ready>0&&!conflict,alreadyComplete:ready===0&&omitted.length===0&&!conflict,mergeConflict:conflict,
    partialApplicationRequiresExplicitChoice:omitted.length>0&&ready>0,structuralAdditionsEnabled:!sourceProblem&&structuralSchemaSupported(domains?.schemaSha256,domains?.saveVersion),commercialDeliveryEnabled:false,originalPreserved:true,
    message:conflict|| (omitted.length?'Some contents are unavailable. Only an explicit available-contents selection can stage the supported changes listed here.':ready?'Review these exact changes before staging them.':'This save already meets every target in the pack.')};
}

export function stagePack(packId,{domains,drafts=[],selection='full'}={}){
  if(!['full','available'].includes(selection))failure('PACK_SELECTION_INVALID','Choose the complete pack or explicitly select its available contents.',400);
  const preview=previewPack(packId,{domains,drafts});
  if(selection==='full'&&!preview.canStageFull)failure('PACK_NOT_FULLY_ELIGIBLE',preview.mergeConflict||'This pack cannot be staged in full. Review the unavailable contents.');
  if(selection==='available'&&!preview.canStageAvailable)failure('PACK_NOT_ELIGIBLE',preview.mergeConflict||'This pack has no supported changes to stage.');
  return {preview,stagedOperations:preview.stagedOperations,combinedDrafts:preview.combinedDrafts,omitted:selection==='available'?preview.omitted:[]};
}
