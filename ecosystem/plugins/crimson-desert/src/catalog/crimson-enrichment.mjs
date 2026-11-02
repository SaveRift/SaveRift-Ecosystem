// Display metadata only. Native ItemKey/CharacterKey remain separate namespaces.
// See docs/crimson-display-enrichment.md for source pins and routing limits.
import {getData} from '../data-provider.mjs';
const data=getData('crimson-enrichment.json');
const pinned=getData('crimson-items.json');
import {exactItemArtwork,exactCompanionArtwork} from './crimson-artwork-resolver.mjs';

export const enrichmentManifest=Object.freeze(data.manifest);
const nativeItems=new Map(pinned.items.map(i=>[i.key,i]));
const curatedItems=new Map(data.items.map(i=>[i.key,i]));
const equipment=new Map(data.equipment.map(i=>[i.key,i]));
const descriptions={
  'Fish Fillet':'Fish prepared for cooking; obtained by cleaning fish.',
  'Apple':'A sweet, crisp fruit used in cooking.',
  'Sugar':'A sweet cooking ingredient sold by grocers.',
  'Fish Porridge':'A mild dish made with fish, grain and water.',
  'Wine':'A fermented fruit drink.',
  'Timber':'Wood used in processing, crafting and construction.',
  'Fishing Rod':'A tool for catching fish in rivers and the sea.',
  'Arrow':'Standard ammunition for bows.',
  'Copper':'Pywel’s everyday currency.',
  'Balton Longsword':'A mass-produced longsword named in honor of Balton.',
  'Wild Rock Honey':'Honey gathered from hives in mountain rock crevices.',
  'Ferman Plate Helm':'A plate helm named after a Delesyian knight.',
  'Meat Skewers':'Grilled skewers of meat and vegetables.',
  'Poison Arrow':'Bow ammunition that inflicts poison.',
  'Pan-Fried Marinated Meat':'Thin meat marinated with fruit and quickly stir-fried.',
  'Iron Ore':'A common metal ore used for crafting and refinement.',
  'Cloth Piece':'A small fabric scrap for practical repairs and crafting.',
  'Garlic':'A pungent cooking ingredient cultivated in Delesyia.',
  'Grape':'Sweet fruit used in a variety of dishes.',
  'Cooking Oil':'Oil used for grilling and frying.',
  'Stone':'A basic material for building and processing.',
  'Wool':'An insulating fiber and trade good.',
  'Flour':'Milled wheat used in cooking and trade.',
  'Ceramic':'A fired-clay trade good.',
  'Grilled Meat':'Meat cooked over a flame.',
  'Water':'A basic ingredient sold by grocers.',
  'Logging Axe':'A tool for cutting timber.',
  'Dried Fish':'Preserved fish prepared for storage and travel.',
  'Jerky':'Dried meat preserved for travel.',
  'Grilled Fruit':'Slow-cooked fruit served as a sweet dish.',
  'Azurite':'A blue mineral used as a gemstone.',
  'Bloodstone':'A reddish mineral that requires care during processing.',
  'Orange':'A juicy citrus fruit cultivated in southern Delesyia.',
  'Bread':'A baked grain staple.',
  'Garnet':'A red gemstone used in jewelry and decoration.',
  'Small Bone':'A light crafting material obtained from animals.',
  'Thin Hide':'Flexible hide used for light armor and decoration.',
  'Fleece':'Soft sheep wool obtained at Greymane Camp.',
  'Raspberry':'A small berry used as a cooking ingredient.',
  'Rosemary':'An aromatic herb found in Hernand and Demeniss.',
  'Fruit Tea':'A drink made by steeping fruit and herbs.',
  'Bird Meat':'Tender meat obtained from birds or a butcher.',
  'Salt-Roasted Bird Meat':'Salt-seasoned bird meat cooked until crisp.',
  'Lentils':'A grain ingredient cultivated in Hernand.',
  'Glenmore Sword':'A sword made by House Glenmore of Hernand.',
  'Sydmon Bow':'A bow named for the blacksmith Sydmon.',
  'Warspike Spear':'A spear made for House Alfonso’s soldiers.',
  'Bekker Large Shield':'A worn shield named for the warrior Bekker.',
  'Scarlet Blades Cloth Armor':'Red clothing worn by the Bleed Bandits.'
};

function displayTaxonomy(internalName){
  if(internalName.startsWith('Collection_Prop_')||internalName.startsWith('Collection_gemstone_'))return 'Collectibles';
  if(internalName.startsWith('Quest_')||internalName.startsWith('NoticePaper_'))return 'Quest items';
  if(internalName.startsWith('Item_Skill_AbyssGear_'))return 'Abyss gear';
  if(internalName.startsWith('Trade_'))return 'Trade goods';
  if(internalName.endsWith('_Seed'))return 'Seeds';
  return null;
}

function broadCategory(category){
  if(['Helmets','Gloves','Boots','Cloaks','Armor'].includes(category))return 'Armor';
  if(['One-Handed Swords','Two-Handed Swords','Spears','Axes','Maces','Hammers','Bows','Rapiers','Cannons','Daggers','Muskets','Halberds','Shotguns','Pistols','Crossbows'].includes(category))return 'Weapons';
  if(['Necklaces','Rings','Earrings'].includes(category))return 'Accessories';
  if(['Horse Equipment','Pet Equipment','Dragon Equipment','ATAG Parts'].includes(category))return 'Companion gear';
  if(category==='Backpacks')return 'Bags';
  if(category==='Lanterns')return 'Tools';
  if(category==='Other Equipment')return 'Equipment';
  return category;
}

export function itemEnrichment(itemKey,internalName){
  const native=nativeItems.get(itemKey);
  // Never join a CrimsonDB external numeric ID, or a renamed/reused native key.
  if(!native||!internalName||native.internalName!==internalName)return null;
  const curated=curatedItems.get(itemKey),gear=equipment.get(itemKey);
  const matched=curated?.internalName===internalName?curated:null;
  const gearMatch=gear?.internalName===internalName?gear:null;
  const taxonomy=displayTaxonomy(internalName);
  const artwork=exactItemArtwork(itemKey,internalName);
  if(!matched&&!gearMatch&&!taxonomy&&!artwork)return null;
  const subcategory=matched?.category||gearMatch?.category||taxonomy||artwork?.category||native.category;
  return {
    category:broadCategory(subcategory),subcategory,
    categorySource:matched?'crimsondb_curated_crosswalk':gearMatch?'workshop_exact_ItemKey_internalName':taxonomy?'pinned_internal_name_display_taxonomy':artwork?.category?'thgl_exact_item_category':'pinned_numeric_catalog',
    iconUrl:matched?.iconUrl||artwork?.iconUrl||null,
    description:matched?descriptions[matched.name]||null:null,
    sourceUrl:matched?.sourceUrl||artwork?.sourceUrl||null,
    referenceDefaultInventory:gearMatch?.sourceDefaultInventory??null,
    routingVerified:false
  };
}

export const companionCatalog=Object.freeze(data.companions.map(c=>Object.freeze({...c,...exactCompanionArtwork(c.key,c.internalName),addStatus:'unverified_disabled'})));
const characters=new Map([...companionCatalog,...data.systemCharacters].map(c=>[c.key,c]));
export function companionEnrichment(characterKey){
  const entry=characters.get(characterKey);
  return entry?{...entry,displayName:entry.name,classificationSource:entry.classification==='system'?'pinned_native_characterinfo':'workshop_exact_CharacterKey',iconUrl:entry.iconUrl||null,sourceUrl:entry.sourceUrl||null}:null;
}
