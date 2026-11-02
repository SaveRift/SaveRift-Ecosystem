import {getData} from './data-provider.mjs';
const catalog=getData('crimson-items.json');
import {DECODER_REVISION,elements,field,value} from './crimson-document.mjs';
import {hash} from './source-binding.mjs';
import {FISH_QUANTITY_RULE,quantityCapability} from './crimson-policy.mjs';
import {itemEnrichment,companionEnrichment,enrichmentManifest} from './catalog/crimson-enrichment.mjs';
import {normalizeAdventure} from './catalog/crimson-adventure.mjs';
const items=new Map(catalog.items.map(i=>[i.key,i]));
export const CATALOG_REVISION=catalog.manifest.revision+':'+(catalog.manifest.effectiveSha256||catalog.manifest.upstreamSha256);
export const catalogManifest={...catalog.manifest,crimsonDB:{...enrichmentManifest,status:'permitted_curated_display_enrichment'}};
export const catalogItem=key=>items.get(key)||null;
const state=(o,k)=>({present:Boolean(field(o,k)?.present),value:value(o,k)});
const count=(o,k)=>field(o,k)?.present?field(o,k).count:null;
const scalarFields=o=>Object.fromEntries(Object.entries(o?.fields||{}).filter(([,f])=>f.kind===0||f.kind===2||f.kind===1).map(([k,f])=>[k,{present:f.present,value:f.value}]));
// Equipment can hold an owned item that is absent from the inventory lists.
// This projection is ownership metadata only; it contains no instance IDs or
// record bytes and never supplies construction defaults.
function ownedDefinitions(document){
  const keys=new Set();let complete=true;
  function visit(node){
    if(!node?.fields){complete=false;return;}
    if(node.type==='ItemSaveData'&&field(node,'_itemKey')?.present){const key=value(node,'_itemKey');if(Number.isSafeInteger(key)&&key>0)keys.add(key);else complete=false;}
    for(const f of Object.values(node.fields)){
      if(f.value?.elements){if(f.value.truncated||f.count!==f.value.elements.length)complete=false;f.value.elements.forEach(visit);}
      else if(f.value?.fields)visit(f.value);
    }
  }
  for(const root of document.blocks)if(['InventorySaveData','EquipmentSaveData'].includes(root.type))visit(root);
  return {ownedDefinitionKeys:[...keys].sort((a,b)=>a-b),ownershipComplete:complete,ownershipScope:'inventory_and_equipment_ItemSaveData'};
}
export function normalizeCrimson(document,{saveVersion}={}){
  const root=name=>document.blocks.find(b=>b.type===name),inv=root('InventorySaveData'),merc=root('MercenaryClanSaveData'),knowledge=root('KnowledgeSaveData'),quests=root('QuestSaveData'),status=root('CharacterStatusSaveData'),transform=root('TransformSaveData'),misc=root('ContentsMiscSaveData'),equipment=root('EquipmentSaveData');
  const ownership=ownedDefinitions(document),records=[],bags=elements(inv,'_inventorylist').map(b=>{
    const inventoryKey=value(b,'_inventoryKey'),list=field(b,'_itemList');
    for(const item of elements(b,'_itemList')){
      const definitionKey=value(item,'_itemKey'),instanceId=value(item,'_itemNo'),quantity=field(item,'_stackCount'),entry=items.get(definitionKey),enrichment=itemEnrichment(definitionKey,entry?.internalName);
      records.push({id:hash(`${document.plaintextSha256}:${inventoryKey}:${instanceId}:${definitionKey}:${item.start}`).slice(0,24),inventoryKey,instanceId,definitionKey,slot:value(item,'_slotNo'),quantity:quantity?.present?String(quantity.value):null,quantityPresent:Boolean(quantity?.present),quantityBytes:quantity?.present?quantity.bytes:null,enchantLevel:value(item,'_enchantLevel'),displayName:entry?.name||`Unknown item · ${definitionKey??'absent'}`,searchAliases:entry?.searchAliases||[],internalName:entry?.internalName||null,category:enrichment?.category||entry?.category||'Unmapped',subcategory:enrichment?.subcategory||null,iconUrl:enrichment?.iconUrl||null,description:enrichment?.description||null,sourceUrl:enrichment?.sourceUrl||null,categorySource:enrichment?.categorySource||'pinned_numeric_catalog',catalogMatched:Boolean(entry),referenceMaxStack:entry?.referenceMaxStack||null,capabilities:{read:'typed',setQuantity:quantityCapability({inventoryKey,definitionKey,instanceId,quantity:quantity?.present?String(quantity.value):null,quantityPresent:Boolean(quantity?.present),quantityBytes:quantity?.bytes},document.schemaSha256,saveVersion),add:'unsupported',publish:'disabled'}});
    }
    return {inventoryKey,itemRecordCount:list?.count??0,itemListPresent:Boolean(list?.present),storedItemCount:list?.count??null,retainedRecords:list?.value?.elements.length??0,expansionSlots:value(b,'_varyExpandSlotCount'),baseCapacity:inventoryKey===2?50:null,totalCapacity:inventoryKey===2&&Number.isInteger(value(b,'_varyExpandSlotCount'))?50+value(b,'_varyExpandSlotCount'):null,capacitySource:inventoryKey===2?'owner_reported_base_50':null,truncated:Boolean(list?.value?.truncated)};
  });
  const keys=new Set(records.map(r=>r.definitionKey)),unknown=[...keys].filter(k=>!items.has(k));
  const companions=elements(merc,'_mercenaryDataList').map(c=>{
    const characterKey=value(c,'_characterKey'),enrichment=companionEnrichment(characterKey);
    return {characterKey,instanceId:value(c,'_mercenaryNo'),customName:value(c,'_mercenaryName'),
      displayName:enrichment?.displayName||null,internalName:enrichment?.internalName||null,
      classification:enrichment?.classification||null,classificationSource:enrichment?.classificationSource||null,
      iconUrl:enrichment?.iconUrl||null,sourceUrl:enrichment?.sourceUrl||null,
      owner:value(c,'_ownedCharacterKey'),level:value(value(c,'_levelData'),'_level'),
      currentHp:value(c,'_currentHp'),currentMp:value(c,'_currentMp'),maxHp:null,maxMp:null,
      summoned:value(c,'_lastSummoned'),fieldKey:value(c,'_spawnFieldInfoKey'),position:value(c,'_spawnPosition'),yaw:value(c,'_spawnYaw'),
      equipmentRecords:count(c,'_equipItemList'),inventoryRecords:count(c,'_inventoryItemList'),
      presence:Object.fromEntries(['_mercenaryName','_ownedCharacterKey','_currentHp','_currentMp','_lastSummoned','_spawnPosition','_spawnFieldInfoKey'].map(k=>[k,Boolean(field(c,k)?.present)])),
      capabilities:{read:'typed',classification:enrichment?'exact_native_key_catalog':'unmapped',edit:'unsupported',add:'unsupported'}};
  });
  const summaryFields=['_stageStateData','_missionStateList','_questStateList','_questGaugeStateList'];
  const progress={character:scalarFields(status),knowledge:{recordCount:count(knowledge,'_list'),followLearnRecordCount:count(knowledge,'_learnedFollowLearnKnowledge'),sample:elements(knowledge,'_list').slice(0,50).map(scalarFields),sampleLimit:50},skillPoints:elements(knowledge,'_skillPointSaveDataList').map(s=>({ownerType:state(s,'_skillPointOwnerType'),current:state(s,'_currentSkillPoint'),elapsed:state(s,'_elapsedSkillPoint')})),quests:{counts:Object.fromEntries(summaryFields.map(k=>[k,count(quests,k)])),lastCompletedMission:state(quests,'_lastCompletedMissionKey'),lastCompletedMainQuest:state(quests,'_lastCompletedMainQuestKey'),sample:elements(quests,'_questStateList').slice(0,50).map(scalarFields),sampleLimit:50},capabilities:{read:'typed_record_state',unlock:'unsupported',complete:'unsupported'}};
  progress.adventure=normalizeAdventure({character:progress.character,companions,quests:progress.quests});
  const location={lastField:state(transform,'_lastfieldInfoKey'),transforms:elements(transform,'_fieldSaveDataList').map(t=>({fieldKey:state(t,'_fieldInfoKey'),fieldTimeRaw:state(t,'_fieldTimeRaw'),position:state(t,'_position'),rotation:state(t,'_rotation')})),pins:{recordCount:count(misc,'_pinMarkerDataList'),records:elements(misc,'_pinMarkerDataList').slice(0,50).map(scalarFields)},coordinateSystem:'game_world_unmapped',capabilities:{read:'typed',teleport:'unsupported'}};
  const activeTransforms=location.transforms.map((entry,index)=>({entry,index})).filter(({entry})=>location.lastField.present&&entry.fieldKey.present&&entry.fieldKey.value===location.lastField.value);
  location.activeTransformIndex=activeTransforms.length===1?activeTransforms[0].index:null;
  location.mapProjection={state:'unverified',verticalAxis:'unmapped',playerMarker:false};
  return {schema:'saveglass.crimson-domains.v1',decoderRevision:DECODER_REVISION,schemaSha256:document.schemaSha256,saveVersion:saveVersion??null,quantityRule:FISH_QUANTITY_RULE,plaintextSha256:document.plaintextSha256,structuralValidation:'full_strict_traversal',audit:document.audit,catalog:{...catalogManifest,revisionId:CATALOG_REVISION,coverage:{recordCount:records.length,namedRecords:records.filter(r=>r.catalogMatched).length,uniqueDefinitions:keys.size,namedDefinitions:keys.size-unknown.length,unknownDefinitionKeys:unknown,enrichedRecords:records.filter(r=>r.categorySource!=='pinned_numeric_catalog').length,artworkRecords:records.filter(r=>r.iconUrl).length,artworkDefinitions:new Set(records.filter(r=>r.iconUrl).map(r=>r.definitionKey)).size,completeInventory:!bags.some(b=>b.truncated)}},inventory:{bagCount:field(inv,'_inventorylist')?.count??0,recordCount:bags.reduce((n,b)=>n+(b.itemRecordCount??0),0),bags,records,...ownership},companions,progress,location,equipment:{equipmentRecords:count(equipment,'_list'),reserveUseRecords:count(equipment,'_useItemSaveList')},relationships:{friendlyRecords:count(root('FriendlySaveData'),'_friendlyDataList'),affinityRecords:count(root('FriendlySaveData'),'_playAbleAffinityDataList')},stores:{recordCount:count(root('StoreSaveData'),'_storeDataList')},semanticSentinels:{farmUpdateDay:state(merc,'_currentFarmUpdateDay'),lastFocusCharacter:state(merc,'_lastFocusCharacterKey')},gates:{read:'verified_structure',existingScalar:'source_bound_compiler',structuralAdditions:'source_bound_constructor',cloudPublication:'separate_reviewed_sender',gameAcceptance:'not_established_by_decode'},previewScope:{status:'inspection_only',message:'This view does not change your save. Edits are compiled against the selected source and validated before review and sending.'}};
}
