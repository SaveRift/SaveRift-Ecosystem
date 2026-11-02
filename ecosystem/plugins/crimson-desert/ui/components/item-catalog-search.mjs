// SPDX-License-Identifier: Apache-2.0
// Page the complete pinned display catalog. The numeric key remains the exact
// selected identity; a name or alias match never substitutes a different ID.
export function searchCatalogPage(items,query,ownedKeys=[],{offset=0,limit=24}={}){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Invalid catalog page.');
  const q=String(query??'').trim().toLocaleLowerCase();
  if(q.length<2&&!/^\d+$/.test(q))return {items:[],total:0,hasMore:false};
  const owned=new Set(ownedKeys);
  const matches=items.filter(item=>!owned.has(item.key)&&(String(item.key)===q||item.name.toLocaleLowerCase().includes(q)||String(item.internalName||'').toLocaleLowerCase().includes(q)||(item.searchAliases||[]).some(name=>name.toLocaleLowerCase().includes(q))));
  matches.sort((a,b)=>(String(a.key)===q?-1:String(b.key)===q?1:0)||a.name.localeCompare(b.name)||a.key-b.key);
  return {items:matches.slice(offset,offset+limit),total:matches.length,hasMore:offset+limit<matches.length};
}
