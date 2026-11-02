// Browser-safe, source-backed construction metadata. Search/catalog membership
// and clean typed-record support remain separate, explicit facts.
import {getData} from './data-provider.mjs';
const data=getData('crimson-companion-additions.json');
for(const entry of data.entries){Object.freeze(entry.templateVariants);Object.freeze(entry);}
Object.freeze(data.entries);
export const COMPANION_ADDITION_SCHEMA=data.schemaSha256;
export const companionAdditionProfile=Object.freeze(data);
const definitions=new Map(data.entries.map(entry=>[entry.characterKey,entry]));
export const companionAdditionDefinition=key=>definitions.get(key)||null;
export const companionAdditionSupported=(key,schemaSha256)=>definitions.get(key)?.supported===true&&(schemaSha256===undefined||schemaSha256===COMPANION_ADDITION_SCHEMA);
