// Browser-safe construction metadata, compressed as tuples to avoid eagerly
// duplicating the searchable name/art catalog. No per-ID gameplay allowlist.
import {getData} from './data-provider.mjs';
const data=getData('crimson-construction-items.json');
export const CATALOG_ITEM_SCHEMA='8427f58057ea9bf6dac35bc139cba163ddb135cfe89d748a2d36b94eec88d668';
const rows=new Map(),definitions=new Map();
for(const row of data.entries){Object.freeze(row[7]);Object.freeze(row);rows.set(row[0],row);}
for(const row of data.unavailable)Object.freeze(row);
Object.freeze(data.balanceDefinitions);Object.freeze(data.entries);Object.freeze(data.unavailable);Object.freeze(data.columns);Object.freeze(data.source);Object.freeze(data.runtimeRequirements);
export const catalogItemAdditionProfile=Object.freeze(data);
const unavailable=new Map(data.unavailable);
export function catalogItemAdditionSupported(key,schemaSha256){return rows.has(key)&&(schemaSha256===undefined||schemaSha256===CATALOG_ITEM_SCHEMA);}
export function catalogItemAdditionUnavailableReason(key){return unavailable.get(key)||(rows.has(key)?null:'catalog_definition_missing');}
export function catalogItemAdditionDefinition(key){
 if(definitions.has(key))return definitions.get(key);const row=rows.get(key);if(!row)return null;
 const definition=Object.freeze({definitionKey:row[0],defaultInventory:row[1],maxStack:row[2],initialUnlockedSockets:row[3],endurance:row[4],maxCharge:row[5],characterEquipment:row[6],knowledgeKeys:row[7],discovery:row[8]===1||row[8]===3?'explicit_pickup_link':'explicit_no_pickup_discovery',discoverySource:row[8]<2?'workshop_current_mapping':'native_item_info',routingSource:row[9]?'workshop_catalog':'native_item_info',family:row[6]?'equipment':'item',refinement:0,maxSocketCount:5,chargedClock:'1',uniqueBalance:data.balanceDefinitions.includes(key),runtimeRequirement:data.runtimeRequirements[String(key)]||null});
 definitions.set(key,definition);return definition;
}
