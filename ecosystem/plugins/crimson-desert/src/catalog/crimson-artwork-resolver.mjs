// Display-only exact identity lookup. ItemKey and CharacterKey never share a
// map or numeric fallback; image URLs are taken from observed public datasets.
import {getData} from '../data-provider.mjs';
const itemIndex=getData('crimson-item-artwork-index.json');
const localItems=getData('crimson-content-artwork.json');
const companions=getData('crimson-companion-artwork.json');
const itemRows=new Map(itemIndex.entries.map(row=>[row[0],row]));
const curatedItems=new Map(itemIndex.curatedAssets.map(row=>[row[0],row]));
const localItemRows=new Map(localItems.assets.map(row=>[row.definitionKey,row]));
const companionRows=new Map(companions.assets.map(row=>[row.characterKey,row]));
const localItemPath=/^\/assets\/(?:crimsondb\/items\/[a-z_]+\/[a-f0-9]{8}|crimson-thgl\/items\/i\d+)\.webp$/;
const localCompanionPath=/^\/assets\/crimsondb\/(?:pets|vehicles\/portraits)\/[a-f0-9]{8}\.webp$/;
const remoteCompanionPath=/^https:\/\/crimsondb\.gg\/images\/(?:pets|vehicles\/portraits)\/[a-f0-9]{8}\.webp$/;
const categories={materials:'Materials',consumables:'Consumables',documents:'Documents',equipment:'Equipment',miscellaneous:'Misc'};
const knownKey=key=>Number.isSafeInteger(key)&&key>0;
const matches=(expected,supplied)=>supplied===undefined||supplied===null||supplied===''||supplied===expected;
export const artworkCoverage=Object.freeze({items:itemIndex.coverage,companions:companions.coverage});

export function exactItemArtwork(definitionKey,internalName){
 if(!knownKey(definitionKey))return null;
 const curated=curatedItems.get(definitionKey),local=localItemRows.get(definitionKey),row=itemRows.get(definitionKey);
 const canonical=curated?.[1]||local?.internalName||row?.[1];if(!canonical||!matches(canonical,internalName))return null;
 const category=categories[row?.[2]]||null;
 if(curated&&localItemPath.test(curated[2]))return {definitionKey,internalName:canonical,category,iconUrl:curated[2],sourceUrl:curated[3],source:'crimsondb_exact_curated'};
 if(local&&localItemPath.test(local.localPath))return {definitionKey,internalName:canonical,category,iconUrl:local.localPath,sourceUrl:local.sourcePage,source:'thgl_exact_cached'};
 if(!row||row[1]!==canonical)return null;
 return {definitionKey,internalName:canonical,category,iconUrl:`https://cdn.th.gl/crimson-desert/icons/db/i${definitionKey}.webp`,sourceUrl:`https://crimsondesert.th.gl/db/${row[2]}/${row[3]}`,source:'thgl_exact_source_index'};
}

export function exactCompanionArtwork(characterKey,internalName){
 if(!knownKey(characterKey))return null;const row=companionRows.get(characterKey);if(!row||!matches(row.internalName,internalName))return null;
 const iconUrl=row.localPath&&localCompanionPath.test(row.localPath)?row.localPath:remoteCompanionPath.test(row.sourceUrl||'')?row.sourceUrl:null;
 return iconUrl?{characterKey,internalName:row.internalName,displayName:row.sourceName,classification:row.classification,iconUrl,sourceUrl:row.sourcePage,source:'crimsondb_exact_character_variant'}:null;
}
