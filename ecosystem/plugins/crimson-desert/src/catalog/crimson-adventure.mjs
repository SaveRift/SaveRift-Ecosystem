// Read-only display mappings. Native CharacterKey is not SkillPointOwnerType.
// CharacterKey values are pinned to NattKh/CrimsonGameMods character_names.json
// at 96e7f78fcb00d6cb5615171a7f359f0c2de5b114. Names, artwork and chapter
// descriptions are permitted CrimsonDB enrichment checked 2026-10-31.
import {getData} from '../data-provider.mjs';
const display=getData('crimson-adventure-display.json');
export const adventureManifest=Object.freeze(display.manifest);
export const playableCharacters=Object.freeze(display.characters);
const observedChapterPairs=new Map(display.chapterPairs);
export function observedChapter(mission,quest){
  const mapped=observedChapterPairs.get(`${mission}:${quest}`);
  return mapped?{...mapped,label:`Chapter ${mapped.number}`,mapping:'owner_verified_menu_pair',sourceUrl:adventureManifest.chapterSource}:null;
}

export function normalizeAdventure({character={},companions=[],quests={}}={}){
  const activeKey=character._characterKey?.present?character._characterKey.value:null;
  const state=key=>character[key]?.present?character[key]:{present:false,value:null};
  return {
    schema:'saveglass.crimson-adventure.v1',displayOnly:true,
    chapter:quests.lastCompletedMission?.present&&quests.lastCompletedMainQuest?.present?observedChapter(quests.lastCompletedMission.value,quests.lastCompletedMainQuest.value):null,
    activeCharacterKey:activeKey,
    currentHp:state('_currentHp'),currentMp:state('_currentMp'),
    characters:playableCharacters.map(entry=>{
      const active=activeKey===entry.characterKey,matching=companions.filter(c=>c.characterKey===entry.characterKey),stored=matching.length===1?matching[0]:null;
      return {...entry,active,recordState:active?'active':stored?'recorded':matching.length>1?'ambiguous':'not_recorded',
        available:active?true:null,availabilitySource:active?'active_character':'quest_event_gate_unmapped',
        currentHp:active?state('_currentHp'):{present:Boolean(stored?.presence?._currentHp),value:stored?.presence?._currentHp?stored.currentHp:null},
        currentMp:active?state('_currentMp'):{present:Boolean(stored?.presence?._currentMp),value:stored?.presence?._currentMp?stored.currentMp:null},
        // SkillPointOwnerType 0/1/2 is not joined by row number or CharacterKey.
        skillPointsMapping:'unverified',sourceUrl:adventureManifest.guideSource};
    }),
    source:adventureManifest
  };
}
