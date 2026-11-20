// SPDX-License-Identifier: Apache-2.0
import {TextDecoder} from '../../../../sdk/text-encoding.mjs';
const utf8=new TextDecoder('utf-8',{fatal:true});
const MAX_ZIP_BYTES=32*1024*1024;
const MAX_FILE_BYTES=16*1024*1024;
const MAX_EXPANDED_BYTES=64*1024*1024;


const u16=(view,at)=>view.getUint16(at,true);
const u32=(view,at)=>view.getUint32(at,true);
const viewOf=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
const textOf=(bytes,start,end)=>utf8.decode(bytes.subarray(start,end));
const fail=message=>{throw new Error(`This GTA VI save could not be inspected: ${message}`);};

function crc32(bytes){
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}

export async function readGtaViPs5Zip(data,expectedTitleId=''){
  if(expectedTitleId&&(!/^(?:PPSA|ECAS)\d{5}$/.test(expectedTitleId)))fail('expected PS5 title ID is invalid');
  const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
  if(bytes.length<22||bytes.length>MAX_ZIP_BYTES)fail('ZIP size is unsupported');
  const view=viewOf(bytes);
  let eocd=-1;
  for(let at=bytes.length-22;at>=Math.max(0,bytes.length-22-65535);at--){if(u32(view,at)===0x06054b50){eocd=at;break;}}
  if(eocd<0||u16(view,eocd+4)||u16(view,eocd+6))fail('multi-disk ZIP is unsupported');
  const count=u16(view,eocd+10),centralBytes=u32(view,eocd+12),centralStart=u32(view,eocd+16);
  if(count<1||count>128||centralStart+centralBytes>eocd)fail('ZIP directory is invalid');
  const files=new Map();let at=centralStart,totalExpanded=0;
  for(let i=0;i<count;i++){
    if(at+46>bytes.length||u32(view,at)!==0x02014b50)fail('ZIP entry is invalid');
    const flags=u16(view,at+8),method=u16(view,at+10),expectedCrc=u32(view,at+16);
    const compressedSize=u32(view,at+20),size=u32(view,at+24);
    const nameLength=u16(view,at+28),extraLength=u16(view,at+30),commentLength=u16(view,at+32);
    const localStart=u32(view,at+42),next=at+46+nameLength+extraLength+commentLength;
    totalExpanded+=size;
    if(next>bytes.length||flags&1||![0,8].includes(method)||size>MAX_FILE_BYTES||compressedSize>MAX_FILE_BYTES||totalExpanded>MAX_EXPANDED_BYTES)fail('ZIP entry is unsupported');
    const name=textOf(bytes,at+46,at+46+nameLength);
    if(!name||name.includes('\\')||name.startsWith('/')||name.split('/').includes('..')||files.has(name))fail('ZIP path is invalid');
    if(localStart+30>bytes.length||u32(view,localStart)!==0x04034b50)fail('ZIP local entry is missing');
    const dataStart=localStart+30+u16(view,localStart+26)+u16(view,localStart+28);
    if(dataStart+compressedSize>centralStart)fail('ZIP entry exceeds its bounds');
    let content=bytes.subarray(dataStart,dataStart+compressedSize);
    if(method===8){
      if(typeof DecompressionStream!=='function')fail('compressed ZIP entries are unsupported in this browser');
      try{
        const reader=new Blob([content]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        const chunks=[];let total=0;
        for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>size){await reader.cancel();fail('ZIP entry expanded beyond its declared size');}chunks.push(value);}
        content=new Uint8Array(total);let copied=0;for(const chunk of chunks){content.set(chunk,copied);copied+=chunk.length;}
      }
      catch{fail('ZIP entry could not be decompressed');}
    }
    if(content.length!==size||crc32(content)!==expectedCrc)fail('ZIP entry failed its checksum');
    files.set(name,content);at=next;
  }
  if(at!==centralStart+centralBytes)fail('ZIP directory length changed');
  const roots=[...files.keys()].filter(name=>/^sdimg_[A-Za-z0-9._-]+\/memory\.dat$/.test(name));
  if(roots.length!==1)fail('exactly one save image is required');
  const imageName=roots[0].split('/')[0];
  const memory=files.get(`${imageName}/memory.dat`);
  const chives=files.get(`${imageName}/chives.dat`);
  const manifestBytes=files.get(`${imageName}/chives.json`);
  if(!memory||!chives||!manifestBytes)fail('the image files or chives.json are missing');
  let manifest;
  try{manifest=JSON.parse(utf8.decode(manifestBytes));}catch{fail('chives.json is invalid');}
  if(manifest?.platform!=='PS5'||!/^(?:PPSA|ECAS)\d{5}$/.test(manifest.title_id||'')||
     manifest.encrypted_name!==imageName||typeof manifest.save_directory!=='string'||!manifest.save_directory)
    fail('save image metadata does not match this ZIP');
  if(expectedTitleId&&manifest.title_id!==expectedTitleId)fail('save image title does not match the selected PS5 game');
  // The Rockstar slot name lives in the ASAV companion, while sce_sdmemory is
  // the PS5 save directory. Neither name may be changed to choose a destination.
  const slotNames=[];
  for(let at=0;at+8<=Math.min(chives.length,4096);at++){
    if(chives[at]!==83||chives[at+1]!==65||chives[at+2]!==82||chives[at+3]!==67)continue;
    const digits=chives.subarray(at+4,at+8);
    if(digits.every(byte=>byte>=48&&byte<=57))slotNames.push(String.fromCharCode(...chives.subarray(at,at+8)));
  }
  const slotName=slotNames.length===1?slotNames[0]:null;
  const sfo=files.get(`${imageName}/sce_sys/param.sfo`);
  const sfoText=sfo?new TextDecoder().decode(sfo):'';
  const autosave=slotName==='SARC0015'&&/autosave/i.test(sfoText);
  return {files,memory,chives,titleId:manifest.title_id,imageName,slotName,autosave};
}
