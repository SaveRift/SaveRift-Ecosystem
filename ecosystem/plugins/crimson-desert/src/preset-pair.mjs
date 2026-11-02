// SPDX-License-Identifier: MPL-2.0
// Pure pair validation extracted from preset-import-control. The host's
// authorization, recipient checks, locks and upload transaction are excluded.
import {Buffer} from '../../../sdk/buffer.mjs';
import {hash} from './source-binding.mjs';
import {decodeSave,encodeSave} from './crimson-codec.mjs';
import {readDocument,value} from './crimson-document.mjs';
export async function validateReferencePair(pair,reference){
 const fail=code=>{throw Object.assign(new Error('The preset pair stopped at its validation gate.'),{code});};
 if(!pair||Object.keys(pair).sort().join(',')!=='lobby,save'||!reference)fail('PRESET_REFERENCE_PROVIDER_REQUIRED');
 const payloads={},decoded={};
 for(const name of ['save','lobby']){
  const bytes=Buffer.from(pair[name]),pin=reference[name];if(!pin||bytes.length!==pin.bytes||hash(bytes)!==pin.sha256)fail('PRESET_REFERENCE_MISMATCH');
  const state=await decodeSave(bytes),scalars=[],document=readDocument(state.plaintext,{onScalar:e=>{if(name==='lobby')scalars.push({path:e.path,value:e.value});}});
  if(state.version!==2||state.flags!==0x80||document.schemaSha256!==pin.schemaSha256||document.audit.advisoryLocators||document.audit.unconsumedBytes||!(await encodeSave(state.plaintext,state.header,{nonce:state.header.subarray(0x1a,0x2a)})).equals(bytes))fail('PRESET_REFERENCE_REOPEN_FAILED');
  const reopened=await decodeSave(bytes);if(!reopened.plaintext.equals(state.plaintext))fail('PRESET_REFERENCE_REOPEN_FAILED');
  payloads[name]={bytes:bytes.length,sha256:hash(bytes),plaintextSha256:hash(state.plaintext),schemaSha256:document.schemaSha256,saveVersion:state.version,nonzeroListMetadata:document.audit.nonzeroListMetadata,omittedListMarkers:document.audit.omittedListMarkers};
  decoded[name]=name==='save'?{missionKey:value(document.blocks.find(b=>b.type==='QuestSaveData'),'_lastCompletedMissionKey'),mainQuestKey:value(document.blocks.find(b=>b.type==='QuestSaveData'),'_lastCompletedMainQuestKey')}:Object.fromEntries(scalars.map(e=>[e.path.split('.').at(-1),e.value]));
 }
 const main=decoded.save,lobby=decoded.lobby;if(main.missionKey!==reference.missionKey||main.mainQuestKey!==reference.mainQuestKey||lobby._slotDisplayNameMissionKey!==main.missionKey||lobby._slotDisplayNameMainQuestKey!==main.mainQuestKey||lobby._gameSaveVersion!==reference.gameSaveVersion||lobby._generateNo!==reference.generateNo)fail('PRESET_PAIRED_METADATA_MISMATCH');
 return {payloads,main,lobby,total:pair.save.length+pair.lobby.length};
}
