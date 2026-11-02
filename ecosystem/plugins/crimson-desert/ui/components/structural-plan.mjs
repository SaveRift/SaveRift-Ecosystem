// SPDX-License-Identifier: Apache-2.0
// UI intents carry catalog identities only. The server selects and validates
// the constructor, placement, new identities and encoded output independently.
import {MAX_STRUCTURAL_OPERATIONS,MAX_STRUCTURAL_ITEM_INTENTS,MAX_STRUCTURAL_SCALAR_OPERATIONS,MAX_COMPANION_ADDITIONS} from '../../src/structural-publication-profile.mjs';
export const STRUCTURAL_PLAN_SCHEMA='saveglass.structural-draft-plan.v1';
export const structuralIntent=draft=>['saveglass.item-addition-intent.v1','saveglass.companion-addition-intent.v1'].includes(draft?.schema);
export const draftOperationLimit=drafts=>drafts.some(d=>structuralIntent(d)||d?.schema==='saveglass.cartography-staged.v1')?MAX_STRUCTURAL_OPERATIONS:MAX_STRUCTURAL_SCALAR_OPERATIONS;
export function assertDraftOperationCount(drafts){
  if(!Array.isArray(drafts))throw Error('Choose changes for one save.');
  const limit=draftOperationLimit(drafts);
  if(drafts.length<1||drafts.length>limit)throw Error(limit===MAX_STRUCTURAL_SCALAR_OPERATIONS?'Choose one to eight changes for this snapshot.':`Choose one to ${limit} changes for this snapshot.`);
  if(drafts.filter(d=>d?.operation==='inventory.addItem').length>MAX_STRUCTURAL_ITEM_INTENTS)throw Error(`Add at most ${MAX_STRUCTURAL_ITEM_INTENTS} different items in one transfer.`);
  if(drafts.filter(d=>d?.operation==='companions.add').length>MAX_COMPANION_ADDITIONS)throw Error(`Add at most ${MAX_COMPANION_ADDITIONS} companions in one transfer.`);
  if(drafts.filter(d=>d?.schema==='saveglass.crimson-staged-operation.v1').length>MAX_STRUCTURAL_SCALAR_OPERATIONS)throw Error('Edit at most eight existing fields in one transfer.');
  return drafts;
}
const whole=value=>typeof value==='string'&&/^(0|[1-9]\d{0,19})$/.test(value);
export function structuralOperations(drafts){
  assertDraftOperationCount(drafts);
  return drafts.map(draft=>{
    if(draft.schema==='saveglass.cartography-staged.v1'&&['reveal-map','unlock-nexus'].includes(draft.recipe)&&draft.operation==='cartography.'+draft.recipe)return {operation:draft.operation};
    if(draft.schema==='saveglass.item-addition-intent.v1'&&draft.operation==='inventory.addItem'){
      if(!Number.isSafeInteger(draft.definitionKey)||draft.definitionKey<1||draft.definitionKey>0xffffffff||typeof draft.quantity!=='string'||!/^[1-9]\d{0,8}$/.test(draft.quantity))throw Error('Choose an exact catalog item and whole quantity.');
      return {operation:'inventory.addItem',definitionKey:draft.definitionKey,quantity:draft.quantity};
    }
    if(draft.schema==='saveglass.companion-addition-intent.v1'&&draft.operation==='companions.add'){
      if(!Number.isSafeInteger(draft.characterKey)||draft.characterKey<1||draft.characterKey>0xffffffff)throw Error('Choose an exact catalog companion.');
      return {operation:'companions.add',characterKey:draft.characterKey};
    }
    if(draft.schema!=='saveglass.crimson-staged-operation.v1'||!['inventory.setQuantity','inventory.setCopper','inventory.setExpansionValue'].includes(draft.operation)||(!Number.isSafeInteger(draft.inventoryKey)||draft.inventoryKey<0||draft.inventoryKey>65535||draft.operation!=='inventory.setQuantity'&&draft.inventoryKey!==2)||!whole(draft.expectedValue)||!whole(draft.desiredValue))throw Error('This change cannot be combined with the selected additions.');
    const base={operation:draft.operation,inventoryKey:draft.inventoryKey,expectedValue:draft.expectedValue,desiredValue:draft.desiredValue};
    if(draft.operation==='inventory.setExpansionValue')return base;
    if(!Number.isSafeInteger(draft.definitionKey)||draft.definitionKey<1||!whole(draft.instanceId)||draft.instanceId==='0'||!Number.isSafeInteger(draft.slot)||draft.slot<0||draft.slot>65535)throw Error('The existing item identity could not be matched.');
    return {...base,definitionKey:draft.definitionKey,instanceId:draft.instanceId,slot:draft.slot};
  });
}
