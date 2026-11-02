// Read-only, normalized views of the three owner-permitted reference saves.
// No encrypted save body, donor identity, live draft or Xbox import is exposed.
import {getData} from './data-provider.mjs';
const references=getData('crimson-save-presets.json');
import {catalogItem,CATALOG_REVISION} from './crimson-domain.mjs';
import {itemEnrichment,companionEnrichment} from './catalog/crimson-enrichment.mjs';
import {ProbeError} from './source-binding.mjs';
const START_SMART_REFERENCE=getData('crimson-preset-reference-pins.json').starter||null;

const ids=new Set(['starter-all-nexus','midgame-hernand-100','endgame-20001']);
const digest=/^[0-9a-f]{64}$/;
const fail=()=>{throw new ProbeError('The reference preset could not be verified.',503,'PRESET_REFERENCE_INVALID');};
const copy=value=>structuredClone(value);
const importReasons=Object.freeze([
  Object.freeze({code:'RECIPIENT_SCHEMA_NOT_VALIDATED',label:'Xbox recipient schema compatibility needs validation.'}),
  Object.freeze({code:'RECIPIENT_IDENTITY_MAPPING_REQUIRED',label:'Recipient identity and account-bound fields need review.'}),
  Object.freeze({code:'LOBBY_BINDING_REVIEW_REQUIRED',label:'The paired lobby and destination bindings need validation.'}),
  Object.freeze({code:'RECIPIENT_GAME_ROUND_TRIP_REQUIRED',label:'A recipient game-load, save and relaunch test is required.'})
]);
const startSmartReleaseReasons=Object.freeze([
  Object.freeze({code:'PRESET_PROVIDER_DELIVERY_NOT_RELEASED',label:'Private delivery of the pinned reference pair to the normal import flow is not released.'}),
  Object.freeze({code:'PRESET_DESTINATION_RELEASE_REQUIRED',label:'The verified creation used an empty Save 2. Other destinations and overwrites remain separately gated.'}),
  Object.freeze({code:'PRESET_REVIEW_SEND_INTEGRATION_REQUIRED',label:'Repeatable preset import needs its normal review, destination and readback checks.'})
]);
function confirmedStartSmart(preset){
  return Boolean(START_SMART_REFERENCE)&&preset.id==='starter-all-nexus'&&preset.source.saveSha256===START_SMART_REFERENCE.save.sha256&&preset.source.lobbySha256===START_SMART_REFERENCE.lobby.sha256&&preset.source.schemaSha256===START_SMART_REFERENCE.save.schemaSha256;
}

// Validate the intentionally small checked-in summary contract. The complete
// documents were parsed offline; these display rows are never save writers.
function validateReferences(){
  if(references.schema!=='saveglass.crimson-reference-presets.v1'||references.sourceType!=='normalized_reference_summary'||references.rawSaveIncluded!==false||references.accountIdentifiersIncluded!==false||references.titleId!=='1754076455'||references.presets.length!==3)fail();
  const seen=new Set();
  for(const p of references.presets){
    if(!ids.has(p.id)||seen.has(p.id)||!['starter','midgame','endgame'].includes(p.stage)||p.source?.permission!=='owner_granted_reference_use_2026-10-31'||['archiveSha256','saveSha256','lobbySha256','schemaSha256'].some(k=>!digest.test(p.source[k]||''))||p.source.saveVersion!==2)fail();
    seen.add(p.id);
    if(p.validation?.hmacVerified!==true||p.validation.fullTypedTraversal!==true||p.validation.advisoryLocators!==0||p.validation.unconsumedBytes!==0)fail();
    const {inventory,companions,progress}=p.domains||{};
    if(!inventory||!Array.isArray(inventory.records)||inventory.records.length!==p.summary.inventoryRecords||inventory.recordCount!==inventory.records.length||inventory.records.length>5000||!Array.isArray(companions)||companions.length!==p.summary.companions||companions.length>1000||!progress)fail();
    for(const row of inventory.records)if(!Number.isSafeInteger(row.definitionKey)||row.definitionKey<0||!Number.isSafeInteger(row.inventoryKey)||!Number.isSafeInteger(row.slot)||row.quantity!==null&&!/^(0|[1-9]\d{0,19})$/.test(row.quantity))fail();
    if(inventory.records.filter(r=>r.inventoryKey===2).length!==p.summary.carriedInventoryRecords||progress.knowledgeRecords!==p.summary.knowledgeRecords||progress.questRecords!==p.summary.questRecords)fail();
    if(companions.some(c=>!Number.isSafeInteger(c.characterKey)||c.characterKey<0)||companions.filter(c=>c.classification==='pet').length!==p.summary.pets||companions.filter(c=>c.classification==='mount').length!==p.summary.mounts)fail();
  }
}
if(references.presets.length)validateReferences();

function publication(preset){
  const confirmed=confirmedStartSmart(preset),reasons=copy(confirmed?startSmartReleaseReasons:importReasons);
  if(preset.validation.encoderLimitExceeded)reasons.push({code:'DECODED_ENCODER_LIMIT',label:'This reference exceeds the current 8 MiB decoded encoder limit.'});
  return {enabled:false,mode:'full_adventure_replacement',reasons,protectedSave9:true,automaticRetry:false,automaticRollback:false,
    acceptance:confirmed?{source:'owner_reported_console_observation',gameLoad:'confirmed',newSlotCreation:'confirmed',scope:'exact_pinned_pair_in_empty_manual_save_2',testedAccountCount:1,saveRelaunch:'not_reported',overwrite:'unverified',grantsNewWritePermission:false}:null};
}
function card(preset){
  return {...copy(Object.fromEntries(['id','name','stage','description','source','claimedFeatures','summary','validation'].map(k=>[k,preset[k]]))),publication:publication(preset)};
}
export function presetCatalog(){
  return {schema:'saveglass.preset-library.v1',revision:references.revision,titleId:references.titleId,source:'licensed_reference_preset',readonly:true,replacesAdventure:true,presets:references.presets.map(card),rawSaveIncluded:false,accountIdentifiersIncluded:false,cloudWritesEnabled:false};
}
export function presetPreview(presetId){
  if(typeof presetId!=='string'||!ids.has(presetId))throw new ProbeError('Choose a listed reference preset.',404,'PRESET_NOT_FOUND');
  const preset=references.presets.find(p=>p.id===presetId);if(!preset)throw new ProbeError('This reference provider is unavailable.',503,'PRESET_PROVIDER_UNAVAILABLE');const domains=copy(preset.domains);
  // Display enrichment remains exact-key only. It cannot change source
  // quantities, placement, quest data, capabilities or import eligibility.
  domains.inventory.records=domains.inventory.records.map(row=>{
    const item=catalogItem(row.definitionKey),enriched=itemEnrichment(row.definitionKey,item?.internalName);
    return {...row,displayName:item?.name||row.displayName,internalName:item?.internalName||row.internalName,category:enriched?.category||item?.category||row.category,iconUrl:enriched?.iconUrl||row.iconUrl,catalogMatched:Boolean(item)};
  });
  domains.companions=domains.companions.map(row=>{
    const enriched=companionEnrichment(row.characterKey);
    return {...row,displayName:enriched?.displayName||row.displayName,classification:enriched?.classification||row.classification,iconUrl:enriched?.iconUrl||row.iconUrl};
  });
  return {schema:'saveglass.preset-preview.v1',revision:references.revision,source:'licensed_reference_preset',readonly:true,replacesAdventure:true,preset:card(preset),domains,displayCatalogRevision:CATALOG_REVISION,publication:publication(preset),rawSaveIncluded:false,accountIdentifiersIncluded:false,liveAccountModified:false,loadedIntoLiveDraft:false};
}
