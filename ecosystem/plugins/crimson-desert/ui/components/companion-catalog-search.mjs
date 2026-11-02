// SPDX-License-Identifier: Apache-2.0
// Browse the complete display catalog; membership is not a construction grant.
export function searchCompanionCatalogPage(catalog,{query='',kind='pet',ownedKeys=[],drafts=[],offset=0,limit=24,advanced=false,definition=()=>null}={}){
 const group=key=>definition(key)?.ownershipGroup||`character:${key}`,excluded=new Set([...ownedKeys,...drafts.filter(d=>d.schema==='saveglass.companion-addition-intent.v1'&&d.operation==='companions.add').map(d=>d.characterKey)].map(group)),q=query.trim().toLocaleLowerCase();
 const matches=catalog.filter(c=>!excluded.has(group(c.key))&&(kind==='other'?!['pet','mount'].includes(c.classification):c.classification===kind)&&(!q||`${c.name} ${advanced?c.key:''}`.toLocaleLowerCase().includes(q)));
 const size=Number.isSafeInteger(limit)&&limit>0?Math.min(limit,100):24,start=Math.min(Number.isSafeInteger(offset)&&offset>0?Math.floor(offset/size)*size:0,Math.max(0,Math.ceil(matches.length/size)-1)*size);
 return {items:matches.slice(start,start+size),total:matches.length,offset:start,hasMore:start+size<matches.length};
}
