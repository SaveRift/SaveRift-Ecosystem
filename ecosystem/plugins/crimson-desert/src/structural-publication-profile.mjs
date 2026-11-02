import {companionAdditionSupported} from './companion-addition-profile.mjs';
import {catalogItemAdditionSupported} from './catalog-item-profile.mjs';
// Admission follows source-backed known record constructors. Search membership
// alone is separate from available native defaults and required typed branches.
export const MAX_STRUCTURAL_OPERATIONS=16;
export const MAX_STRUCTURAL_ITEM_INTENTS=16;
export const MAX_STRUCTURAL_SCALAR_OPERATIONS=8;
export const MAX_COMPANION_ADDITIONS=16;
export const MAX_STRUCTURAL_NEW_ITEM_STACKS=64;
export const STRUCTURAL_PLAN_SCHEMA='saveglass.structural-draft-plan.v1';
export const STRUCTURAL_PUBLICATION_PROFILE='saveglass-crimson-reviewed-additions107.v1';
export const STRUCTURAL_SCHEMA_SHA256='8427f58057ea9bf6dac35bc139cba163ddb135cfe89d748a2d36b94eec88d668';
export const structuralSchemaSupported=(schemaSha256,version=2)=>schemaSha256===STRUCTURAL_SCHEMA_SHA256&&version===2;
export const structuralItemFamily=key=>catalogItemAdditionSupported(key)?'catalog_item':null;
export const structuralCompanionFamily=key=>companionAdditionSupported(key)?'catalog_companion':null;
