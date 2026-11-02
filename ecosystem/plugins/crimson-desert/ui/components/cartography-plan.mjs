// SPDX-License-Identifier: Apache-2.0
import {structuralOperations} from './structural-plan.mjs';
export const CARTOGRAPHY_STAGED_SCHEMA='saveglass.cartography-staged.v1';
const recipes={'reveal-map':'Reveal Map','unlock-nexus':'Nexus Unlock'};
export function stagedCartography(recipe){
 if(!Object.hasOwn(recipes,recipe))throw Error('Choose a supported Cartography change.');
 return {schema:CARTOGRAPHY_STAGED_SCHEMA,operation:'cartography.'+recipe,recipe,displayName:recipes[recipe],status:'awaiting_bound_validation',publishEligible:false};
}
export function cartographyDraftPlan(report,payload,drafts){
 const mapDrafts=drafts.filter(d=>d.schema===CARTOGRAPHY_STAGED_SCHEMA);if(!mapDrafts.length||mapDrafts.some(d=>!Object.hasOwn(recipes,d.recipe)||d.operation!=='cartography.'+d.recipe)||new Set(mapDrafts.map(d=>d.recipe)).size!==mapDrafts.length)throw Error('Choose each supported Cartography change once.');
 const d=payload.crimson.domains;
 if(drafts.length>1)return {schema:'saveglass.mixed-draft-plan.v1',container:payload.container,payload:payload.name,backupSha256:report.backupSha256,backupRevision:report.backupRevision,payloadSha256:payload.sha256,plaintextSha256:d.plaintextSha256,schemaSha256:d.schemaSha256,decoderRevision:d.decoderRevision,catalogRevision:d.catalog?.revisionId,operations:structuralOperations(drafts)};
 return {schema:'saveglass.cartography-plan.v1',container:payload.container,payload:payload.name,backupSha256:report.backupSha256,backupRevision:report.backupRevision,payloadSha256:payload.sha256,plaintextSha256:d.plaintextSha256,schemaSha256:d.schemaSha256,recipe:drafts[0].recipe};
}
