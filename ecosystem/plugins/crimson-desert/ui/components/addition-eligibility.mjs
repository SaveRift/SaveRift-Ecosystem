// SPDX-License-Identifier: Apache-2.0
// Browser guidance only. The server independently validates every source and
// constructor before producing a reviewable draft or accepting publication.
import {structuralSchemaSupported,MAX_COMPANION_ADDITIONS,MAX_STRUCTURAL_NEW_ITEM_STACKS} from '../../src/structural-publication-profile.mjs';
import {catalogItemAdditionDefinition,catalogItemAdditionUnavailableReason} from '../../src/catalog-item-profile.mjs';
import {companionAdditionDefinition,companionAdditionSupported} from '../../src/companion-addition-profile.mjs';
const whole=v=>typeof v==='string'&&/^[1-9]\d{0,8}$/.test(v);
export function ownedItemDefinitionKeys(domains){return domains?.inventory?.ownedDefinitionKeys??domains?.inventory?.records?.map(r=>r.definitionKey)??[];}
export function itemAdditionProblem(item,quantity,domains){
 if(!item)return 'Choose an item.';
 if(!structuralSchemaSupported(domains.schemaSha256,domains.saveVersion))return 'Adding items is not supported for this save layout yet.';
 const definition=catalogItemAdditionDefinition(item.key);
 if(definition?.uniqueBalance&&ownedItemDefinitionKeys(domains).includes(item.key))return 'Use Copper in Quick changes to change your existing balance.';
 if(!definition)return catalogItemAdditionUnavailableReason(item.key)==='embedded_subitem_defaults_required'?'This container item needs contents metadata that is not available yet.':'Native construction metadata is missing for this item.';
 if(!whole(quantity))return 'Enter a quantity from 1 to 999,999,999.';
 const maximum=definition.maxStack;
 if(!maximum||!/^\d+$/.test(String(maximum))||BigInt(maximum)<1n)return 'This item’s stack limit is unavailable.';
 if(definition.uniqueBalance&&BigInt(quantity)>BigInt(maximum))return `Enter a Copper balance from 1 to ${maximum}.`;
 if((BigInt(quantity)+BigInt(maximum)-1n)/BigInt(maximum)>BigInt(MAX_STRUCTURAL_NEW_ITEM_STACKS))return `Add no more than ${MAX_STRUCTURAL_NEW_ITEM_STACKS} new stacks at a time.`;
 return null;
}
export function companionAdditionProblem(companion,domains,drafts=[]){
 if(!companion)return 'Choose a companion.';
 if(!structuralSchemaSupported(domains.schemaSha256,domains.saveVersion))return 'Adding companions is not supported for this save layout yet.';
 if(!Array.isArray(domains.companions))return 'Companion ownership could not be checked. Reopen your save before adding companions.';
 const definition=companionAdditionDefinition(companion.key),group=definition?.ownershipGroup||`character:${companion.key}`,groupOf=key=>companionAdditionDefinition(key)?.ownershipGroup||`character:${key}`;
 if(domains.companions.some(c=>groupOf(c.characterKey)===group))return 'This companion or another variant using its ownership slot is already in your save.';
 if(!companionAdditionSupported(companion.key,domains.schemaSha256))return definition?.technicalGap==='camp_worker_operation_not_implemented'?'Camp-worker additions need a separate save operation.':definition?.technicalGap==='special_prerequisites_not_mapped'?'This companion needs unlock prerequisites that are not mapped yet.':'A clean save record is missing for this companion.';
 const pending=drafts.filter(d=>d.operation==='companions.add');
 if(pending.some(d=>groupOf(d.characterKey)===group))return 'This companion or another variant is already in your changes.';
 if(pending.length>=MAX_COMPANION_ADDITIONS)return `Add at most ${MAX_COMPANION_ADDITIONS} companions in one transfer.`;
 return null;
}
