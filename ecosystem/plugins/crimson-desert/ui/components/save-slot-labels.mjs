// SPDX-License-Identifier: Apache-2.0
import {observedChapter} from '../../src/catalog/crimson-adventure.mjs';

// Chapter and quest names share one exact reviewed mission/quest-pair mapping.
export function slotFallback(name){return /^slot\d+,savedgame$/.test(name)?name.split(',')[0].replace('slot','Slot '):name;}
// Crimson's menu numbers are separate from its storage names. Both supplied
// NattKh editors map slot1 to Auto Save 2 and slot100 to manual Save 1.
// Restrict this mapping to the documented slots and the verified Crimson title.
export function crimsonSaveSlotName(name){
  const match=/^slot(0|1|2|10[0-8]),savedgame$/.exec(name);
  if(!match)return null;
  const number=Number(match[1]);
  return number<100?`Auto Save ${number+1}`:`Save ${number-99}`;
}
export function saveSlotLabel(container,metadata,{advanced=false,titleId=null}={}){
  const crimson=String(titleId)==='1754076455';
  const identity=(crimson?crimsonSaveSlotName(container.name):null)||slotFallback(container.name);
  const custom=typeof metadata?.customName==='string'?metadata.customName.trim().slice(0,128):'';
  const chapter=crimson?observedChapter(metadata?.missionKey,metadata?.mainQuestKey):null;
  const title=[chapter?.title,custom?`“${custom}”`:null].filter(Boolean).join(' ');
  const description=chapter?`${chapter.label} | ${title}`:title;
  const raw=advanced&&crimson&&/^slot\d+,savedgame$/.test(container.name)?`cloud ${container.name.split(',')[0]}`:null;
  return [identity,description,raw].filter(Boolean).join(' · ');
}
export function orderedSaveSlots(containers){
  return [...containers].sort((a,b)=>(Date.parse(b.saveTimestamp)||0)-(Date.parse(a.saveTimestamp)||0));
}
