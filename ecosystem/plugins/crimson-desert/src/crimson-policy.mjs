// MPL-2.0. Narrow offline trial, reviewed against Workshop 1.01 and NattKh.
// This is not a game-engine compatibility or cloud-publication policy.
import {field,value,elements} from './crimson-document.mjs';
export const FISH_QUANTITY_RULE=Object.freeze({
  id:'crimson.fish-fillet.5-to-6.v1',operation:'inventory.setQuantity',saveVersion:2,
  schemaSha256:'f73ef48c344a0a4e5ede5003d5296b586c473575bbff32e5a152cc58e45e4e7d',
  inventoryKey:2,definitionKey:1000730,expectedQuantity:'5',desiredQuantity:'6',fieldBytes:8,
  referenceMaxStack:'50',limitStatus:'reference_only_not_game_engine_verified',
  workshopArchiveSha256:'8107ad0d900be25a64629f56f4ed7a0745bc1cd9b4a819349e35e5f51771a715'
});
export function quantityCapability(record,schemaSha256,saveVersion){
  const r=FISH_QUANTITY_RULE;
  if(schemaSha256!==r.schemaSha256||saveVersion!==r.saveVersion)return 'unsupported_schema';
  return record.inventoryKey===r.inventoryKey&&record.definitionKey===r.definitionKey&&record.quantity===r.expectedQuantity&&record.quantityPresent&&record.quantityBytes===r.fieldBytes&&typeof record.instanceId==='string'&&/^[1-9]\d*$/.test(record.instanceId)?'offline_preview_available':'unsupported_transition';
}
// Stable instance + definition + bag identity; a slot alone is never a target.
export function quantityTarget(document,input){
  const roots=document.blocks.filter(b=>b.type==='InventorySaveData');
  if(roots.length!==1)return {error:'Inventory root is missing or ambiguous.'};
  const list=field(roots[0],'_inventorylist');if(list?.value?.truncated)return {error:'The full bag list is required for this preview.'};
  const bags=elements(roots[0],'_inventorylist');
  if(bags.some(b=>field(b,'_itemList')?.value?.truncated))return {error:'The full inventory is required to check instance uniqueness.'};
  const owners=bags.filter(b=>value(b,'_inventoryKey')===input.inventoryKey);
  if(owners.length!==1)return {error:'The selected bag is missing or ambiguous.'};
  const itemList=field(owners[0],'_itemList'),owned=elements(owners[0],'_itemList'),slots=owned.map(item=>value(item,'_slotNo'));
  if(!itemList?.present||itemList.value?.truncated||itemList.count!==owned.length||slots.some(slot=>!Number.isSafeInteger(slot)||slot<0||slot>65535)||new Set(slots).size!==slots.length)return {error:'The selected inventory is incomplete or has ambiguous slots.'};
  const occurrences=bags.flatMap(b=>elements(b,'_itemList')).filter(i=>value(i,'_itemNo')===input.instanceId);
  if(occurrences.length!==1)return {error:'The item instance is missing or ambiguous.'};
  const item=elements(owners[0],'_itemList').find(i=>i===occurrences[0]&&value(i,'_itemKey')===input.definitionKey&&value(i,'_slotNo')===input.slot);
  if(!item)return {error:'The instance, definition, bag or slot changed.'};
  return {item,quantity:field(item,'_stackCount')};
}
