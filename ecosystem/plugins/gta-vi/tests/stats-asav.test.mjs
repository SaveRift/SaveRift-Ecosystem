// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {buildGtaViStatEdits,editableGtaViStats} from '../src/shared/gta-vi-stats.mjs';
import {inspectAsav,labelSettingsPath,validateJsonDraft} from '../src/xbox/gta-vi-asav.mjs';

function asav(text='{"$0x1":{"$0x2":6,"$0x3":true}}'){
  const payload=Buffer.from(text),bytes=Buffer.alloc(368+payload.length);
  bytes.write('ASAV');
  bytes.writeUInt32LE(2,4);
  bytes.writeUInt32LE(368,20);
  payload.copy(bytes,368);
  return bytes;
}

test('stat draft keeps observed field hash and original block size',()=>{
  const text='{"$0xe528fe31":{"$0x0834e1d0":130.000000,"$0x4802abf7":100.000000}}';
  const jsav={blocks:[{text}],fields:[{hash:'$0x0834e1d0',values:[{block:0,value:130}]}]};
  const [edit]=buildGtaViStatEdits(jsav,{health:'120'});
  assert.equal(edit.draft.length,text.length);
  assert.equal(JSON.parse(edit.draft)['$0xe528fe31']['$0x0834e1d0'],120);
  assert.throws(()=>buildGtaViStatEdits(jsav,{health:'1000'}),/0 to 999/);
});

test('ambiguous repeated armour values are not offered as a player stat',()=>{
  const jsav={blocks:[{text:'{"$0x45b925e3":0.000000}'}],fields:[{hash:'$0x45b925e3',values:[{block:0,value:0},{block:0,value:0}]}]};
  assert.deepEqual(editableGtaViStats(jsav),[]);
});

test('ASAV settings are indexed and structural edits are checked',()=>{
  const inspected=inspectAsav(asav());
  assert.equal(inspected.readable,true);
  assert.deepEqual(inspected.fields.map(field=>[field.path,field.type]),[['/$0x1/$0x2','number'],['/$0x1/$0x3','boolean']]);
  assert.equal(validateJsonDraft(inspected.text.replace(':6',':7'),inspected.value).changed.length,1);
  assert.throws(()=>validateJsonDraft('{"$0x1":{"$0x2":"6","$0x3":true}}',inspected.value),/same settings paths and value types/);
  assert.equal(labelSettingsPath('/$0x8c1c3948/$0xb80c6ae8/$0x3300c23e'),'/$0x8c1c3948/audio/musicLevel');
});

test('ASAV SARC0015 header exposes synthetic completion',()=>{
  const bytes=asav();
  bytes.set(Buffer.from('SARC0015'),0x128);
  new DataView(bytes.buffer).setFloat32(0x158,1.98,true);
  assert.equal(inspectAsav(bytes).completionPercent.toFixed(2),'1.98');
});
