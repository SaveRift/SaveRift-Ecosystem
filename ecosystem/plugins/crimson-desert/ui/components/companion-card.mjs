// SPDX-License-Identifier: Apache-2.0
// Presentation only. Default Herspia is pinned by native CharacterKey, not by
// the player's custom name or a fuzzy match against other horse breeds.
// Exact catalog identity: Riding_Horse_Tiuta_Unique_2050_kliff.
export const DEFAULT_HERSPIA_KEY=1003120;

export function defaultCompanionLast(rows){
  const normal=[],defaults=[];
  for(const row of rows)(row.characterKey===DEFAULT_HERSPIA_KEY?defaults:normal).push(row);
  return [...normal,...defaults];
}

const text=value=>typeof value==='string'?value.trim():'';
const types={pet:'Pet',mount:'Mount',mercenary:'Companion',system:'System'};
const numeric=value=>typeof value==='number'?Number.isFinite(value):typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value.trim())&&Number.isFinite(Number(value));

export function companionCardInfo(companion){
  const customName=text(companion.customName),speciesName=text(companion.displayName);
  const breed=text(companion.breed)||text(companion.species)||(customName&&speciesName!==customName?speciesName:'');
  const type=[types[companion.classification]||'Companion',breed].filter(Boolean).join(' · ');
  const vitals=[['HP','currentHp','_currentHp'],['MP','currentMp','_currentMp']]
    .filter(([,key,presence])=>companion.presence?.[presence]!==false&&numeric(companion[key]))
    .map(([label,key])=>({label,value:companion[key]}));
  return {name:customName||speciesName||'Unnamed companion',type,vitals};
}
