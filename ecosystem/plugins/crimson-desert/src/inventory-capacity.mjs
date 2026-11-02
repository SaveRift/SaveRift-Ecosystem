// Capacity planning is pure and cannot construct records or publish a save.
// 250 is SaveRift's reviewed product ceiling, not a proven universal game max.
export const INVENTORY_BASE_CAPACITY=50;
export const INVENTORY_CAPACITY_CEILING=250;
const id=value=>typeof value==='string'&&/^[1-9]\d{0,19}$/.test(value)&&BigInt(value)<=0xffffffffffffffffn;
export function planInventoryCapacity(domains,{additionalSlots=0,inventoryKey=2,ceiling=INVENTORY_CAPACITY_CEILING}={}){
  const fixed={schema:'saveglass.inventory-capacity-plan.v1',inventoryKey,additionalSlots,ceiling,
    ceilingSource:'saveglass_product_guard_not_verified_engine_max',publicationEnabled:false};
  const rejected=(reason,warning)=>({...fixed,state:'unavailable',canFit:false,reason,warning,oldTotalCapacity:null,newTotalCapacity:null,requiredExpansionSlots:null,automaticExpansionRequired:false});
  if(inventoryKey!==2||ceiling!==INVENTORY_CAPACITY_CEILING||!Number.isSafeInteger(additionalSlots)||additionalSlots<0||additionalSlots>1000000000)return rejected('CAPACITY_REQUEST_UNSUPPORTED','Inventory space could not be checked for this request.');
  const inventory=domains?.inventory,bags=inventory?.bags?.filter(b=>b.inventoryKey===inventoryKey),records=inventory?.records?.filter(r=>r.inventoryKey===inventoryKey),bag=bags?.[0];
  if(bags?.length!==1||!Array.isArray(records)||bag.itemListPresent!==true||bag.truncated!==false||bag.itemRecordCount!==records.length||!Number.isSafeInteger(bag.expansionSlots)||bag.expansionSlots<0||bag.expansionSlots>ceiling-INVENTORY_BASE_CAPACITY)return rejected('CAPACITY_SOURCE_UNSUPPORTED','Inventory space needs a complete supported bag inspection.');
  const oldTotalCapacity=INVENTORY_BASE_CAPACITY+bag.expansionSlots,slots=records.map(r=>r.slot),ids=records.map(r=>r.instanceId);
  if(slots.some(slot=>!Number.isSafeInteger(slot)||slot<0||slot>=oldTotalCapacity)||new Set(slots).size!==slots.length||ids.some(value=>!id(value))||new Set(ids).size!==ids.length)return rejected('CAPACITY_SOURCE_AMBIGUOUS','Inventory slots or item identities are ambiguous. Nothing will be added automatically.');
  const occupiedSlots=slots.length,freeSlots=oldTotalCapacity-occupiedSlots,requiredTotalCapacity=occupiedSlots+additionalSlots,newTotalCapacity=Math.max(oldTotalCapacity,Math.min(ceiling,requiredTotalCapacity)),canFit=requiredTotalCapacity<=ceiling;
  return {...fixed,state:canFit?'planned':'limit_reached',canFit,reason:canFit?null:'CAPACITY_LIMIT',occupiedSlots,freeSlots,
    oldTotalCapacity,newTotalCapacity,requiredTotalCapacity,requiredExpansionSlots:newTotalCapacity-INVENTORY_BASE_CAPACITY,
    automaticExpansionRequired:canFit&&newTotalCapacity>oldTotalCapacity,
    warning:canFit?null:'Not every new item will fit within SaveRift’s 250-slot limit. Remove items or choose fewer additions.',
    allocation:'first_free_slots_within_verified_capacity',existingItemsPreserved:true,partialDeliveryEnabled:false};
}
