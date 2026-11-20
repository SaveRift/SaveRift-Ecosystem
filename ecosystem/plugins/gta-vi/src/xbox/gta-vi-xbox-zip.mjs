// SPDX-License-Identifier: Apache-2.0
import {TextDecoder} from '../../../../sdk/text-encoding.mjs';
// Inspect the complete Xbox ZIP returned by GarlicSaves in the browser.
// Keep strict limits because the archive is supplied by the user.
const utf8=new TextDecoder();
const MAX_ZIP=32*1024*1024,MAX_FILE=16*1024*1024,MAX_EXPANDED=64*1024*1024;
const fail=message=>{throw new Error(`This GTA VI Xbox ZIP could not be inspected: ${message}`);};
const u16=(view,at)=>view.getUint16(at,true),u32=(view,at)=>view.getUint32(at,true);

function crc32(bytes){
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}

async function readEntries(data){
  const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
  if(bytes.length<22||bytes.length>MAX_ZIP)fail('ZIP size is unsupported');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let eocd=-1;
  for(let at=bytes.length-22;at>=Math.max(0,bytes.length-22-65535);at--){if(u32(view,at)===0x06054b50){eocd=at;break;}}
  if(eocd<0||u16(view,eocd+4)||u16(view,eocd+6))fail('ZIP directory is unsupported');
  const count=u16(view,eocd+10),directoryBytes=u32(view,eocd+12),directoryStart=u32(view,eocd+16);
  if(count<3||count>128||directoryStart+directoryBytes>eocd)fail('ZIP directory is invalid');
  const files=new Map();let at=directoryStart,expanded=0;
  for(let index=0;index<count;index++){
    if(at+46>bytes.length||u32(view,at)!==0x02014b50)fail('ZIP entry is invalid');
    const flags=u16(view,at+8),method=u16(view,at+10),expectedCrc=u32(view,at+16);
    const compressed=u32(view,at+20),size=u32(view,at+24),nameLength=u16(view,at+28);
    const extraLength=u16(view,at+30),commentLength=u16(view,at+32),localStart=u32(view,at+42);
    const next=at+46+nameLength+extraLength+commentLength;
    expanded+=size;
    if(next>bytes.length||flags&1||![0,8].includes(method)||size>MAX_FILE||compressed>MAX_FILE||expanded>MAX_EXPANDED)fail('ZIP entry is unsupported');
    const name=utf8.decode(bytes.subarray(at+46,at+46+nameLength));
    if(!name||name.includes('\\')||name.startsWith('/')||name.split('/').some(part=>!part||part==='.'||part==='..')||files.has(name))fail('ZIP path is invalid');
    if(localStart+30>bytes.length||u32(view,localStart)!==0x04034b50)fail('ZIP local entry is missing');
    const localNameLength=u16(view,localStart+26),localExtraLength=u16(view,localStart+28);
    if(utf8.decode(bytes.subarray(localStart+30,localStart+30+localNameLength))!==name)fail('ZIP names disagree');
    const dataStart=localStart+30+localNameLength+localExtraLength;
    if(dataStart+compressed>directoryStart)fail('ZIP entry exceeds its bounds');
    let content=bytes.subarray(dataStart,dataStart+compressed);
    if(method===8){
      if(typeof DecompressionStream!=='function')fail('compressed ZIP entries need a newer browser');
      try{
        const reader=new Blob([content]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        const chunks=[];let total=0;
        for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>size){await reader.cancel();fail('ZIP entry expanded beyond its declared size');}chunks.push(value);}
        content=new Uint8Array(total);let copied=0;for(const chunk of chunks){content.set(chunk,copied);copied+=chunk.length;}
      }catch{fail('ZIP entry could not be decompressed');}
    }
    if(content.length!==size||crc32(content)!==expectedCrc)fail('ZIP entry failed its checksum');
    files.set(name,content);at=next;
  }
  if(at!==directoryStart+directoryBytes)fail('ZIP directory length changed');
  return files;
}

export async function readGtaViXboxZip(data,expectedTitleId=''){
  const files=await readEntries(data);
  const backupBytes=files.get('xbox-backup.json');
  if(!backupBytes)fail('the original Xbox backup is missing');
  let backup;
  try{backup=JSON.parse(utf8.decode(backupBytes));}catch{fail('Xbox backup metadata is invalid');}
  const titleId=String(backup?.identity?.titleId||'');
  if(backup?.schema!=='saveglass.raw-backup.v2'||!/^\d{1,20}$/.test(titleId)||
     backup?.identity?.titleName!=='Grand Theft Auto VI'||expectedTitleId&&titleId!==String(expectedTitleId))
    fail('this archive does not match the selected GTA VI game');
  const declared=new Set((backup.containers||[]).map(item=>String(item.index?.fileName||'').replace(/,savedgame$/,'')));
  const slots=[];
  for(const [name,memory] of files){
    const match=/^(SARC\d{4})\/Save Game Data$/.exec(name);
    if(!match)continue;
    const slot=match[1],header=files.get(`${slot}/Save Game Header`);
    if(!declared.has(slot)||!header||header.length<16||memory.length<48||utf8.decode(memory.subarray(0,4))!=='JSAV')fail('a story slot is incomplete');
    slots.push({name:slot,memory,header});
  }
  slots.sort((a,b)=>a.name.localeCompare(b.name));
  if(!slots.length||slots.length>32)fail('no supported GTA VI story slots were found');
  return {titleId,slots,files};
}
