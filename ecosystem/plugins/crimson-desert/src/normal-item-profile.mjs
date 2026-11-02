// Browser-safe, read-only eligibility data. This is not a publication grant.
import {getData} from './data-provider.mjs';
const data=getData('crimson-normal-items.json');
export const NORMAL_ITEM_SCHEMA='8427f58057ea9bf6dac35bc139cba163ddb135cfe89d748a2d36b94eec88d668';
for(const entry of data.entries){Object.freeze(entry.knowledgeKeys);Object.freeze(entry);}
Object.freeze(data.entries);
export const normalItemAdditionProfile=Object.freeze(data);
const definitions=new Map(data.entries.map(entry=>[entry.definitionKey,entry]));
export function normalItemAdditionDefinition(key){return definitions.get(key)||null;}
export function normalItemAdditionSupported(key,schemaSha256){return Boolean(definitions.has(key)&&(schemaSha256===undefined||schemaSha256===NORMAL_ITEM_SCHEMA));}
