// SPDX-License-Identifier: Apache-2.0
import {TextEncoder} from '../../../../sdk/text-encoding.mjs';
import {inspectGtaViPs5Jsav} from '../shared/gta-vi-jsav.mjs';
import {readGtaViPs5Zip} from './gta-vi-ps5-zip.mjs';

const utf8=new TextEncoder();
const put16=(view,at,value)=>view.setUint16(at,value,true);
const put32=(view,at,value)=>view.setUint32(at,value,true);

function crc32(bytes){
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}

function originalBlockMatches(memory,block){
  if(!Number.isSafeInteger(block.offset)||block.offset<0||!Number.isSafeInteger(block.length)||block.length<1||block.offset+block.length>memory.length)return false;
  const original=utf8.encode(block.text);
  if(original.length!==block.length)return false;
  for(let i=0;i<original.length;i++)if(memory[block.offset+i]!==original[i])return false;
  return true;
}

function storedZip(files){
  const entries=[...files].map(([name,data])=>({name:utf8.encode(name),data,crc:crc32(data)}));
  if(!entries.length||entries.length>128)throw Error('The save ZIP has an unsupported number of files.');
  const localBytes=entries.reduce((total,item)=>total+30+item.name.length+item.data.length,0);
  const centralBytes=entries.reduce((total,item)=>total+46+item.name.length,0);
  const bytes=new Uint8Array(localBytes+centralBytes+22);
  if(bytes.length>32*1024*1024)throw Error('The edited save ZIP is too large.');
  const view=new DataView(bytes.buffer);
  let at=0;
  for(const item of entries){
    item.offset=at;
    put32(view,at,0x04034b50);put16(view,at+4,20);
    put32(view,at+14,item.crc);put32(view,at+18,item.data.length);put32(view,at+22,item.data.length);
    put16(view,at+26,item.name.length);
    bytes.set(item.name,at+30);
    at+=30+item.name.length;
    bytes.set(item.data,at);
    at+=item.data.length;
  }
  const centralStart=at;
  for(const item of entries){
    put32(view,at,0x02014b50);put16(view,at+4,20);put16(view,at+6,20);
    put32(view,at+16,item.crc);put32(view,at+20,item.data.length);put32(view,at+24,item.data.length);
    put16(view,at+28,item.name.length);put32(view,at+42,item.offset);
    bytes.set(item.name,at+46);
    at+=46+item.name.length;
  }
  put32(view,at,0x06054b50);put16(view,at+8,entries.length);put16(view,at+10,entries.length);
  put32(view,at+12,at-centralStart);put32(view,at+16,centralStart);
  return bytes;
}

export async function buildEditedGtaViPs5Zip({zip,jsav,blockIndex,draft,edits,expectedTitleId=''}){
  const changes=edits||[{blockIndex,draft}];
  if(!zip?.files||!zip?.imageName||!Array.isArray(changes)||!changes.length)throw Error('Open a valid GTA VI story block first.');
  if(expectedTitleId&&zip.titleId!==expectedTitleId)throw Error('The selected save title does not match the expected PS5 game.');
  const memory=new Uint8Array(zip.memory);
  const touched=new Set();
  for(const change of changes){
    const block=jsav?.blocks?.[change.blockIndex];
    if(!block||typeof change.draft!=='string'||touched.has(change.blockIndex))throw Error('Choose distinct valid story blocks.');
    if(block.hasUnsafeIntegers)throw Error('This block contains large integer values and cannot be safely edited yet.');
    if(!originalBlockMatches(memory,block))throw Error('The selected save changed since this story block was opened. Reopen it before editing.');
    touched.add(change.blockIndex);
    if(change.draft===block.text)throw Error('Change this block before saving an edited ZIP.');
    let parsed;
    try{parsed=JSON.parse(change.draft);}catch{throw Error('The edited block must be valid JSON.');}
    if(!parsed||typeof parsed!=='object'||!change.draft.includes(`"${block.hash}"`))
      throw Error('Keep the original block hash in the edited JSON.');
    const replacement=utf8.encode(change.draft);
    if(replacement.length!==block.length)
      throw Error('This beta editor requires each edited block to keep the same byte length.');
    memory.set(replacement,block.offset);
  }
  inspectGtaViPs5Jsav(memory,zip.chives);
  const files=new Map(zip.files);
  files.set(`${zip.imageName}/memory.dat`,memory);
  const output=storedZip(files);
  const checked=await readGtaViPs5Zip(output,expectedTitleId);
  const checkedJsav=inspectGtaViPs5Jsav(checked.memory,checked.chives);
  for(const change of changes)if(checkedJsav.blocks[change.blockIndex]?.text!==change.draft)throw Error('An edited story block did not survive the ZIP check.');
  return output;
}
