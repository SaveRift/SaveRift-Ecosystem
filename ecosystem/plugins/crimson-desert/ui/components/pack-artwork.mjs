// SPDX-License-Identifier: Apache-2.0
import {getData} from '../../src/data-provider.mjs';
// Display-only enrichment. Never change a recipe, save record or delivery gate.
const artwork=getData('crimson-pack-artwork.json');
const contents=getData('crimson-content-artwork.json');
const presentation=getData('crimson-pack-presentation.json');

const LOCAL_ART=/^\/assets\/(?:crimsondb\/items\/[a-z_]+\/[a-f0-9]{8}|crimson-thgl\/items\/i\d+)\.webp$/;
const selected=new Map(artwork.assets.map(asset=>[asset.packId,asset]));
const itemArt=new Map(contents.assets.map(asset=>[asset.definitionKey,asset]));
const packArt=new Map(presentation.assets.map(asset=>[asset.packId,asset]));

export function packItemArtwork(pack,content){
  const exact=itemArt.get(content?.definitionKey);
  if(exact&&exact.internalName===content?.internalName&&LOCAL_ART.test(exact.localPath))return exact.localPath;
  const asset=selected.get(pack?.id);
  return pack?.category==='gear'&&asset&&asset.definitionKey===content?.definitionKey&&asset.internalName===content?.internalName&&LOCAL_ART.test(asset.localPath)?asset.localPath:null;
}

export function collectionBackdrop(pack){
  if(pack?.category!=='gear')return null;
  const asset=selected.get(pack.id);
  return asset&&LOCAL_ART.test(asset.localPath)&&pack.contents?.some(c=>c.definitionKey===asset.definitionKey&&c.internalName===asset.internalName)?asset.localPath:null;
}
export function packArtwork(pack){
  if(pack?.category==='gear')return collectionBackdrop(pack);
  const asset=packArt.get(pack?.id);
  if(asset&&LOCAL_ART.test(asset.localPath))return asset.localPath;
  // Keep the original coin-stack artwork for the renamed entry-level pack.
  return pack?.id==='copper-pouch-small'&&LOCAL_ART.test(pack.iconUrl||'')?pack.iconUrl:null;
}
