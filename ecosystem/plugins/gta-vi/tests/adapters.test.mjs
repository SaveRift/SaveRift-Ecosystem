// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectGtaViJsav} from '../src/shared/gta-vi-jsav.mjs';
import {readGtaViPs5Zip} from '../src/ps5/gta-vi-ps5-zip.mjs';
import {buildEditedGtaViPs5Zip} from '../src/ps5/gta-vi-ps5-repack.mjs';
import {readGtaViXboxZip} from '../src/xbox/gta-vi-xbox-zip.mjs';
import {buildEditedGtaViXboxZip} from '../src/xbox/gta-vi-xbox-repack.mjs';
import {makeSyntheticJsav} from './synthetic-jsav.mjs';
import {makeStoredZip} from './synthetic-zip.mjs';

const memory=(healthToken='130')=>makeSyntheticJsav({healthToken});
function ps5Archive({healthToken='130',titleId='PPSA01547'}={}){
  const chives=Buffer.alloc(34+368);
  chives.write('SLAYER1');
  chives.write('ASAV',34);
  chives.write('SARC0015',330);
  const folder='sdimg_sce_sdmemory';
  return makeStoredZip([
    [`${folder}/memory.dat`,memory(healthToken)],
    [`${folder}/chives.dat`,chives],
    [`${folder}/chives.json`,Buffer.from(JSON.stringify({platform:'PS5',title_id:titleId,save_directory:'sce_sdmemory',encrypted_name:folder}))],
    [`${folder}/sce_sys/param.sfo`,Buffer.from('Autosave')],
  ]);
}
function xboxArchive({healthToken='130'}={}){
  const backup={schema:'saveglass.raw-backup.v2',identity:{titleId:'2035456122',titleName:'Grand Theft Auto VI'},containers:[{index:{fileName:'SARC0000,savedgame'}}]};
  return makeStoredZip([
    ['xbox-backup.json',Buffer.from(JSON.stringify(backup))],
    ['SARC0000/Save Game Data',memory(healthToken)],
    ['SARC0000/Save Game Header',Buffer.alloc(16)],
  ]);
}

test('PS5 adapter rejects malformed archive and preserves untouched files during local edit',async()=>{
  await assert.rejects(readGtaViPs5Zip(new Uint8Array(64)),/ZIP/);
  const zip=await readGtaViPs5Zip(ps5Archive(),'PPSA01547');
  const jsav=inspectGtaViJsav(zip.memory,zip.chives);
  const draft=jsav.blocks[0].text.replace('130','129');
  const result=await buildEditedGtaViPs5Zip({zip,jsav,blockIndex:0,draft,expectedTitleId:'PPSA01547'});
  const checked=await readGtaViPs5Zip(result,'PPSA01547');
  assert.equal(inspectGtaViJsav(checked.memory,checked.chives).fields.find(row=>row.name==='fHealth').values[0].value,129);
  for(const [name,bytes] of zip.files){
    if(name.endsWith('/memory.dat'))continue;
    assert.deepEqual(Buffer.from(checked.files.get(name)),Buffer.from(bytes),`${name} changed`);
  }
});

test('PS5 adapter rejects a parsed block from a different save',async()=>{
  const zip=await readGtaViPs5Zip(ps5Archive());
  const stale=await readGtaViPs5Zip(ps5Archive({healthToken:'131'}));
  const jsav=inspectGtaViJsav(stale.memory,stale.chives);
  const draft=jsav.blocks[0].text.replace('131','129');
  await assert.rejects(buildEditedGtaViPs5Zip({zip,jsav,blockIndex:0,draft}),/selected save changed/);
});

test('PS5 adapter binds the selected title when a trusted title ID is supplied',async()=>{
  await assert.rejects(readGtaViPs5Zip(ps5Archive({titleId:'PPSA12345'}),'PPSA01547'),/title does not match/);
  const zip=await readGtaViPs5Zip(ps5Archive());
  const jsav=inspectGtaViJsav(zip.memory,zip.chives);
  const draft=jsav.blocks[0].text.replace('130','129');
  await assert.rejects(buildEditedGtaViPs5Zip({zip,jsav,blockIndex:0,draft,expectedTitleId:'PPSA12345'}),/title does not match/);
});

test('Xbox adapter rejects malformed archive and preserves untouched files during local edit',async()=>{
  await assert.rejects(readGtaViXboxZip(new Uint8Array(64),'2035456122'),/ZIP/);
  const archive=await readGtaViXboxZip(xboxArchive(),'2035456122');
  const slot=archive.slots[0],jsav=inspectGtaViJsav(slot.memory);
  const draft=jsav.blocks[0].text.replace('130','129');
  const result=await buildEditedGtaViXboxZip({archive,jsav,slotName:slot.name,blockIndex:0,draft});
  const checked=await readGtaViXboxZip(result,'2035456122');
  assert.equal(inspectGtaViJsav(checked.slots[0].memory).fields.find(row=>row.name==='fHealth').values[0].value,129);
  for(const [name,bytes] of archive.files){
    if(name.endsWith('/Save Game Data'))continue;
    assert.deepEqual(Buffer.from(checked.files.get(name)),Buffer.from(bytes),`${name} changed`);
  }
});

test('Xbox adapter rejects a parsed block from a different save',async()=>{
  const archive=await readGtaViXboxZip(xboxArchive(),'2035456122');
  const stale=await readGtaViXboxZip(xboxArchive({healthToken:'131'}),'2035456122');
  const jsav=inspectGtaViJsav(stale.slots[0].memory);
  const draft=jsav.blocks[0].text.replace('131','129');
  await assert.rejects(buildEditedGtaViXboxZip({archive,jsav,slotName:archive.slots[0].name,blockIndex:0,draft}),/selected save changed/);
});
