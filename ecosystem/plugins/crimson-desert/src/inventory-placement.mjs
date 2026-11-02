// Exact native placement and bounded planning metadata. The server still
// validates every destination and constructs the save independently.
import {catalogItemAdditionDefinition,catalogItemAdditionProfile} from './catalog-item-profile.mjs';
import {planInventoryCapacity} from './inventory-capacity.mjs';
import {MAX_STRUCTURAL_NEW_ITEM_STACKS} from './structural-publication-profile.mjs';
const positive=value=>typeof value==='string'&&/^[1-9]\d{0,19}$/.test(value)&&BigInt(value)<=0xffffffffffffffffn;
export function getInventoryPlacement(item){
  const key=item?.definitionKey??item?.key,profile=catalogItemAdditionDefinition(key);
  return profile?Object.freeze({definitionKey:key,internalName:item?.internalName??null,defaultInventory:profile.defaultInventory,referenceMaxStack:profile.maxStack,source:'pinned_catalog_native_defaults',sourceSha256:catalogItemAdditionProfile.entriesSha256,currentGameAcceptance:'source_backed_constructor',runtimeRequirement:profile.runtimeRequirement}):null;
}
function otherInventorySpace(domains,inventoryKey,additionalSlots){
  const bags=domains?.inventory?.bags?.filter(b=>b.inventoryKey===inventoryKey),records=domains?.inventory?.records?.filter(r=>r.inventoryKey===inventoryKey),bag=bags?.[0];
  const fixed={inventoryKey,additionalSlots,automaticExpansionRequired:false,existingItemsPreserved:true,allocation:'first_free_uint16_slots',capacitySource:'native_slot_address_space_not_physical_bag_capacity'};
  if(bags?.length!==1||!Array.isArray(records)||bag.itemListPresent!==true||bag.truncated!==false||bag.itemRecordCount!==records.length)return {...fixed,canFit:false,reason:'DESTINATION_INVENTORY_MISSING',warning:`This save does not contain a complete destination inventory ${inventoryKey}. No new inventory group will be created.`};
  const slots=records.map(r=>r.slot),ids=records.map(r=>r.instanceId);
  if(slots.some(n=>!Number.isSafeInteger(n)||n<0||n>65535)||new Set(slots).size!==slots.length||ids.some(id=>!positive(id))||new Set(ids).size!==ids.length)return {...fixed,canFit:false,reason:'DESTINATION_INVENTORY_AMBIGUOUS',warning:`Destination inventory ${inventoryKey} has ambiguous slots or identities.`};
  const canFit=records.length+additionalSlots<=65536;
  return {...fixed,canFit,occupiedSlots:records.length,reason:canFit?null:'DESTINATION_SLOT_LIMIT',warning:canFit?null:`Destination inventory ${inventoryKey} has no unused native slots.`};
}
export function planItemAdditionsSpace(domains,additions,drafts=[]){
  const unmapped=[],grouped=new Map();let additionalSlots=0;
  for(const entry of additions){
    const placement=getInventoryPlacement(entry),quantity=String(entry.quantity??entry.targetQuantity??'');
    if(!placement||!positive(quantity)||!positive(placement.referenceMaxStack)){unmapped.push(entry.displayName||String(entry.definitionKey));continue;}
    const slots=Number((BigInt(quantity)+BigInt(placement.referenceMaxStack)-1n)/BigInt(placement.referenceMaxStack));
    if(!Number.isSafeInteger(slots)||slots>MAX_STRUCTURAL_NEW_ITEM_STACKS){unmapped.push(entry.displayName||String(entry.definitionKey));continue;}
    additionalSlots+=slots;grouped.set(placement.defaultInventory,(grouped.get(placement.defaultInventory)||0)+slots);
  }
  const size=drafts.find(d=>d.operation==='inventory.setExpansionValue'&&d.schema==='saveglass.crimson-staged-operation.v1'),inventory=domains?.inventory;
  const plannedInventory=Array.isArray(inventory?.bags)?{...inventory,bags:inventory.bags.map(b=>b.inventoryKey===2&&size&&/^\d+$/.test(size.desiredValue)&&Number(size.desiredValue)>=b.expansionSlots&&Number(size.desiredValue)<=200?{...b,expansionSlots:Number(size.desiredValue)}:b)}:null;
  const main=planInventoryCapacity({inventory:plannedInventory},{additionalSlots:grouped.get(2)||0});
  const perInventory=[...grouped].map(([key,slots])=>key===2?{...main,additionalSlots:slots}:otherInventorySpace(domains,key,slots));
  const failed=perInventory.find(p=>!p.canFit),batchOver=additionalSlots>MAX_STRUCTURAL_NEW_ITEM_STACKS;
  const canFit=unmapped.length===0&&!failed&&!batchOver&&(additions.length>0||main.canFit);
  return {...main,inventoryKey:grouped.size===1?[...grouped.keys()][0]:2,additionalSlots,newItemDefinitions:additions.length,perInventory,placementComplete:unmapped.length===0,unmappedContents:unmapped,
    state:canFit?'planned':'unavailable',canFit,automaticExpansionRequired:Boolean(grouped.has(2)&&main.automaticExpansionRequired),
    reason:unmapped.length?'PLACEMENT_UNMAPPED':batchOver?'CONSTRUCTOR_BATCH_LIMIT':failed?.reason??(additions.length?null:main.reason),
    warning:unmapped.length?`Placement or quantity metadata is missing for ${unmapped.length} ${unmapped.length===1?'item':'items'}. No destination is chosen automatically.`:batchOver?`A transfer can add at most ${MAX_STRUCTURAL_NEW_ITEM_STACKS} new item stacks.`:failed?.warning??(additions.length?null:main.warning),
    structuralDeliveryEnabled:true};
}
export function planPackInventorySpace(recipe,entries,domains,drafts=[],{deliveryOnly=false}={}){
  const additions=deliveryOnly?drafts.filter(d=>d.schema==='saveglass.item-addition-intent.v1'&&d.operation==='inventory.addItem'):entries.filter(e=>e.reasonCode==='STRUCTURAL_ADDITION_REQUIRED').map(e=>recipe.contents.find(c=>c.definitionKey===e.definitionKey&&c.internalName===e.internalName)).filter(Boolean);
  return {...planItemAdditionsSpace(domains,additions,drafts),structuralDeliveryEnabled:deliveryOnly};
}
