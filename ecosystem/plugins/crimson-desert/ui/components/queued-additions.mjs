// SPDX-License-Identifier: Apache-2.0
// Queued cards are a projection of the current draft, never owned save records.
// All artwork and taxonomy are joined through exact numeric catalog identities.
import {exactItemArtwork,exactCompanionArtwork} from '../../src/catalog/crimson-artwork-resolver.mjs';
export function queuedAdditions(drafts,{items=[],itemEnrichment=()=>null,companionEnrichment=()=>null}={}){
 const definitions=new Map(items.map(item=>[item.key,item])),queued={items:[],companions:[]};
 drafts.forEach((draft,draftIndex)=>{
  if(draft.schema==='saveglass.item-addition-intent.v1'&&draft.operation==='inventory.addItem'){
   const item=definitions.get(draft.definitionKey),display=item?itemEnrichment(item.key,item.internalName):null,art=exactItemArtwork(draft.definitionKey,item?.internalName||draft.internalName);
   queued.items.push({id:`queued-item-${draft.definitionKey}`,draftIndex,definitionKey:draft.definitionKey,displayName:item?.name||draft.displayName||`Item ${draft.definitionKey}`,internalName:item?.internalName||art?.internalName||'',searchAliases:item?.searchAliases||[],category:display?.category||art?.category||item?.category||'Item',iconUrl:display?.iconUrl||art?.iconUrl||null,inventoryKey:draft.inventoryKey??2,quantity:draft.quantity,queued:true});
  }else if(draft.schema==='saveglass.companion-addition-intent.v1'&&draft.operation==='companions.add'){
   const companion=companionEnrichment(draft.characterKey),art=exactCompanionArtwork(draft.characterKey,companion?.internalName||draft.internalName);
   queued.companions.push({id:`queued-companion-${draft.characterKey}`,draftIndex,characterKey:draft.characterKey,displayName:companion?.displayName||companion?.name||draft.displayName||art?.displayName||`Companion ${draft.characterKey}`,classification:companion?.classification||draft.classification||art?.classification||'other',iconUrl:companion?.iconUrl||art?.iconUrl||null,queued:true});
  }
 });
 return queued;
}
