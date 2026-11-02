// SPDX-License-Identifier: Apache-2.0
import {planItemAdditionsSpace} from '../../src/inventory-placement.mjs';
import {CARTOGRAPHY_STAGED_SCHEMA,cartographyDraftPlan} from './cartography-plan.mjs';
import {STRUCTURAL_PLAN_SCHEMA,structuralIntent,structuralOperations,assertDraftOperationCount} from './structural-plan.mjs';
import {existingStackQuantityProfile,validInventoryKey} from '../../src/inventory-quantity-profile.mjs';
export function copperRecord(records){const found=records.filter(r=>r.definitionKey===1&&r.inventoryKey===2);return found.length===1?found[0]:null;}
export function quantityLimit(record){return existingStackQuantityProfile(record?.definitionKey,record?.referenceMaxStack)?.maximum??null;}
export function quantityEditable(record){
  const profile=existingStackQuantityProfile(record?.definitionKey,record?.referenceMaxStack);
  return validInventoryKey(record?.inventoryKey)&&Boolean(record.catalogMatched||record.catalogNamed)&&record.quantityPresent&&record.quantityBytes===8&&Boolean(profile)&&(!profile.uniqueBalance||record.inventoryKey===2);
}
export function bagSize(record){return Number.isSafeInteger(record?.expansionSlots)?50+record.expansionSlots:null;}
export function expansionForBagSize(total,record){
  if(typeof total!=='string'||!/^[1-9]\d{1,2}$/.test(total)||Number(total)<50||Number(total)>250)throw Error('Enter a bag size from 50 to 250.');
  const current=bagSize(record);if(current===null)throw Error('Bag size is unavailable for this save.');
  if(Number(total)<=current)throw Error('Choose a bag size larger than the current size.');
  return String(Number(total)-50);
}
export function draftTarget(draft){if(draft.schema===CARTOGRAPHY_STAGED_SCHEMA)return draft.operation;if(draft.schema!=='saveglass.crimson-staged-operation.v1')return `${draft.operation}:${draft.definitionKey??draft.characterKey}`;return draft.operation==='inventory.setExpansionValue'?`${draft.operation}:${draft.inventoryKey}`:`quantity:${draft.inventoryKey}:${draft.definitionKey}:${draft.instanceId}:${draft.slot}`;}
export function mergeDraft(drafts,draft){const target=draftTarget(draft),index=drafts.findIndex(d=>draftTarget(d)===target);return index<0?[...drafts,draft]:drafts.map((d,i)=>i===index?draft:d);}
export function searchItemCatalog(items,query,ownedKeys,limit=24){
  const q=query.trim().toLocaleLowerCase();if(q.length<2&&!/^\d+$/.test(q))return [];
  const owned=new Set(ownedKeys);return items.filter(i=>!owned.has(i.key)&&(String(i.key)===q||i.name.toLocaleLowerCase().includes(q)||String(i.internalName||'').toLocaleLowerCase().includes(q)||(i.searchAliases||[]).some(name=>name.toLocaleLowerCase().includes(q)))).sort((a,b)=>(String(a.key)===q?-1:String(b.key)===q?1:0)||a.name.localeCompare(b.name)||a.key-b.key).slice(0,limit);
}
export function additionIntent(item,quantity,inventoryKey,records){
  if(!item||!Number.isSafeInteger(item.key)||item.key<1||item.key>0xffffffff)throw Error('Select an exact numeric catalog item.');
  if(typeof quantity!=='string'||!/^[1-9]\d{0,8}$/.test(quantity))throw Error('Enter a quantity from 1 to 999,999,999.');
  if(!Number.isSafeInteger(inventoryKey))throw Error('Choose a mapped inventory bag.');
  return {schema:'saveglass.item-addition-intent.v1',operation:'inventory.addItem',definitionKey:item.key,displayName:item.name,internalName:item.internalName??null,quantity,referenceMaxStack:item.referenceMaxStack??null,inventoryKey,status:'awaiting_combined_validation',canApply:false,publishEligible:false};
}
export function additionPreview(item,quantity,domains,drafts=[],placement=null){
  const mapped=placement?.definitionKey===item.key&&placement.internalName===item.internalName?placement:null;
  const intent=additionIntent({...item,referenceMaxStack:mapped?.referenceMaxStack??item.referenceMaxStack},quantity,mapped?.defaultInventory??2,domains.inventory.records),pending=drafts.filter(d=>d.schema==='saveglass.item-addition-intent.v1'&&d.definitionKey!==item.key);
  const capacityPlan=planItemAdditionsSpace(domains,[...pending,intent],drafts),newItemSlots=mapped&&/^[1-9]\d*$/.test(String(intent.referenceMaxStack))?Number((BigInt(quantity)+BigInt(intent.referenceMaxStack)-1n)/BigInt(intent.referenceMaxStack)):null;
  if(!mapped){capacityPlan.canFit=false;capacityPlan.warning='This item’s inventory placement is not mapped yet. No bag is chosen automatically.';}
  return {...intent,inventoryKey:mapped?.defaultInventory??null,placementSource:mapped?.source??'unmapped',runtimeRequirement:mapped?.runtimeRequirement??null,capacityPlan:{...capacityPlan,newItemSlots,pendingItemSlots:newItemSlots===null?null:capacityPlan.additionalSlots-newItemSlots},automaticSpaceExpansion:'minimal_when_required'};
}
export function scalarPlan(backup,report,payload,operation,expectedValue,desiredValue){const d=payload.crimson.domains;return {schema:'saveglass.inventory-scalar-plan.v1',operation,container:payload.container,payload:payload.name,backupSha256:report.backupSha256,backupRevision:report.backupRevision,payloadSha256:payload.sha256,plaintextSha256:d.plaintextSha256,schemaSha256:d.schemaSha256,decoderRevision:d.decoderRevision,catalogRevision:d.catalog.revisionId,inventoryKey:2,expectedValue:String(expectedValue),desiredValue:String(desiredValue)};}

export function stagedScalar(operation,record,desiredValue){
  if(!['inventory.setCopper','inventory.setQuantity','inventory.setExpansionValue'].includes(operation))throw Error('This field is not supported by the offline change plan.');
  if(typeof desiredValue!=='string'||!/^(0|[1-9]\d{0,8})$/.test(desiredValue))throw Error('Enter an exact nonnegative whole number.');
  const expansion=operation==='inventory.setExpansionValue',expected=expansion?record?.expansionSlots:record?.quantity;
  if(!validInventoryKey(record?.inventoryKey)||operation!=='inventory.setQuantity'&&record.inventoryKey!==2||expected===undefined||expected===null||(!expansion&&!record.quantityPresent))throw Error('An existing inventory field with its exact inventory identity is required.');
  if(String(expected)===desiredValue)throw Error('Choose a value different from the original.');
  return {schema:'saveglass.crimson-staged-operation.v1',operation,displayName:expansion?'Bag size':record.definitionKey===1?'Copper':record.displayName,inventoryKey:record.inventoryKey,expectedValue:String(expected),desiredValue,...(!expansion?{definitionKey:record.definitionKey,instanceId:record.instanceId,slot:record.slot}:{}),status:'awaiting_combined_validation',publishEligible:false};
}
export function composedDraftPlan(backup,report,payload,drafts){
  assertDraftOperationCount(drafts);
  if(drafts.some(d=>d.schema===CARTOGRAPHY_STAGED_SCHEMA))return cartographyDraftPlan(report,payload,drafts);
  const d=payload.crimson.domains;
  if(drafts.some(structuralIntent))return {schema:STRUCTURAL_PLAN_SCHEMA,container:payload.container,payload:payload.name,backupSha256:report.backupSha256,backupRevision:report.backupRevision,payloadSha256:payload.sha256,plaintextSha256:d.plaintextSha256,schemaSha256:d.schemaSha256,decoderRevision:d.decoderRevision,catalogRevision:d.catalog.revisionId,operations:structuralOperations(drafts)};
  if(drafts.some(d=>d.schema!=='saveglass.crimson-staged-operation.v1'))throw Error('This change cannot be combined with existing item edits.');
  return {schema:'saveglass.crimson-draft-plan.v1',container:payload.container,payload:payload.name,backupSha256:report.backupSha256,backupRevision:report.backupRevision,payloadSha256:payload.sha256,plaintextSha256:d.plaintextSha256,schemaSha256:d.schemaSha256,decoderRevision:d.decoderRevision,catalogRevision:d.catalog.revisionId,operations:drafts.map(({operation,inventoryKey,definitionKey,instanceId,slot,expectedValue,desiredValue})=>({operation,inventoryKey,expectedValue,desiredValue,...(operation!=='inventory.setExpansionValue'?{definitionKey,instanceId,slot}:{})}))};
}
