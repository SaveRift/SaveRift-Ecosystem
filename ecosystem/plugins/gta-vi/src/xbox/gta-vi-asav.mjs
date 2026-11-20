// SPDX-License-Identifier: Apache-2.0
import {TextDecoder} from '../../../../sdk/text-encoding.mjs';
const utf8=new TextDecoder('utf-8',{fatal:true});
const SETTINGS_KEY_NAMES=Object.freeze({
  '00ba555f':'closedCaptions','10d6ddf3':'heistsEpicAmount','125b4637':'ammo','17d82a47':'display',
  '1abb5826':'objective','203e2854':'ragdoll','2202fbe1':'autoLevel','23683a0d':'controls',
  '25584db6':'camera','2af4b66c':'colorblindMode','3300c23e':'musicLevel','3301e662':'vibration',
  '33bc3e71':'subtitlesBackground','36f410b7':'uiSfxLevel','44c0d1e9':'crew_autoshop',
  '490691e6':'cameraBob','4b62d3b2':'language','557759b4':'moneyStorySpeed',
  '6293d9ce':'autoSave','65b0928e':'vibrationSettings','66d342f5':'coverScoreMode',
  '6a510681':'fov','8372d0df':'radioStation','907ca2e1':'allowAspectIdle','944fa9d9':'hud',
  '9c7b93d4':'vehicleDefaultPitch','a49d0765':'money','b80c6ae8':'audio','bf1a0b77':'aimMode',
  'c63c7f4b':'dialogueLevel','c89952df':'subtitles','d649ef0f':'temperature',
  'd7019faa':'voiceSettings','d934e616':'weaponPreview','e608de7b':'clock',
  'e8c91000':'controllerSettings','ee190b4e':'sfxLevel','f8175bd0':'subtitlesSpeaker',
  'f9713d90':'aimAcceleration',
});

export function labelSettingsPath(path){
  return path.replace(/\$0x([a-f0-9]{8})/gi,(match,hash)=>SETTINGS_KEY_NAMES[hash.toLowerCase()]||match);
}

export function inspectAsav(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<368||String.fromCharCode(...bytes.subarray(0,4))!=='ASAV')return {format:'unrecognized'};
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const payloadOffset=view.getUint32(20,true);
  const version=view.getUint32(4,true);
  if(version!==2||payloadOffset!==368||payloadOffset>=bytes.length)return {format:'ASAV',version,payloadOffset,readable:false};
  const slotName=String.fromCharCode(...bytes.subarray(0x128,0x130));
  const progress=slotName==='SARC0015'?view.getFloat32(0x158,true):null;
  const completionPercent=Number.isFinite(progress)&&progress>=0&&progress<=100?progress:null;
  const payload=bytes.subarray(payloadOffset);
  try{
    const text=utf8.decode(payload),value=JSON.parse(text);
    if(!value||typeof value!=='object'||Array.isArray(value))return {format:'ASAV',version,payloadOffset,readable:false};
    return {format:'ASAV',version,payloadOffset,completionPercent,readable:true,text,value,fields:indexJsonFields(value)};
  }catch{return {format:'ASAV',version,payloadOffset,completionPercent,readable:false};}
}

export function indexJsonFields(value){
  const fields=[];
  function visit(node,path,depth){
    if(fields.length>=10000||depth>32)return;
    if(node&&typeof node==='object'){
      for(const [key,child] of Object.entries(node))visit(child,`${path}/${key.replaceAll('~','~0').replaceAll('/','~1')}`,depth+1);
    }else fields.push({path,label:labelSettingsPath(path),type:node===null?'null':typeof node,value:node});
  }
  visit(value,'',0);
  return fields;
}

export function validateJsonDraft(text,original){
  let value;
  try{value=JSON.parse(text);}catch{throw new Error('The edited text is not valid JSON.');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('The root must remain a JSON object.');
  const before=indexJsonFields(original),after=indexJsonFields(value);
  const beforeTypes=new Map(before.map(field=>[field.path,field.type]));
  if(after.length!==before.length||after.some(field=>beforeTypes.get(field.path)!==field.type))throw new Error('Keep the same settings paths and value types. The game format has not been validated for structural changes.');
  return {value,changed:after.filter(field=>before.find(old=>old.path===field.path)?.value!==field.value)};
}
