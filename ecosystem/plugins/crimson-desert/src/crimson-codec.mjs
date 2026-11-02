// Read-only compatibility investigation. Protocol references:
// NattKh/.../CrimsonSaveEditor/save_crypto.py and parc_serializer.py,
// pinned revision 96e7f78fcb00d6cb5615171a7f359f0c2de5b114 (MPL-2.0).
// This module never publishes or replaces a stored save. Semantic game support
// remains unverified even when its envelope can be decoded and reopened.
import {Buffer} from '../../../sdk/buffer.mjs';
import {formatCrypto as crypto,randomBytes} from '../../../sdk/crypto.mjs';
import {hash} from './source-binding.mjs';
import {compressStandardLz4} from './lz4-standard.mjs';
import {chacha20Block,inflateLz4Block} from '../../../sdk/format-binary.mjs';

export class CodecError extends Error{constructor(message,code){super(message);this.code=code;}}
const fail=(message,code='CRIMSON_FORMAT_INVALID')=>{throw new CodecError(message,code);};
const limit=32*1024*1024;
function saveKey(version){
  const prefixes={1:'^Qgbrm/.#@`zsr]\\@rvfal#"',2:'^Pearl--#Abyss__@!!'},prefix=prefixes[version];
  if(!prefix)fail('This SAVE version has no verified compatibility key.','CRIMSON_VERSION_UNSUPPORTED');
  const base=Buffer.from('C41B8E730DF259A637CC04E9B12F9668DA107A853E61F9224DB80AD75C13EF90','hex').subarray(0,31),material=Buffer.from(prefix+'PRIVATE_HMAC_SECRET_CHECK'),key=Buffer.alloc(32);
  for(let i=0;i<31;i++)key[i]=base[i]^material[i];return key;
}
// Original ChaCha20's 64-bit little-endian counter and 64-bit nonce, matching
// Python cryptography's algorithms.ChaCha20 used by the pinned reader.
// Keep the working words in local variables: millions of typed-array quarter
// round calls are needlessly expensive in the isolated interpreter. The rounds
// and 64-bit counter layout remain byte-identical to the reference algorithm.
// Signed working words keep QuickJS on its integer path; output/counter words
// retain their unsigned conversion at the format boundary.
export function chacha20(data,key,nonce){
  if(key.length!==32||nonce.length!==16)fail('Invalid ChaCha20 key or nonce.');
  if(typeof globalThis.__saveriftChaCha20!=='function')return chacha20Block(data,key,nonce);
  const view=bytes=>bytes.byteOffset===0&&bytes.byteLength===bytes.buffer.byteLength?bytes.buffer:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  return Buffer.from(globalThis.__saveriftChaCha20(view(data),view(key),view(nonce)));
}
export function inflateLz4(input,size){
  if(!Number.isSafeInteger(size)||size<1||size>limit)fail('The declared decompressed size exceeds the inspection limit.','CRIMSON_SIZE_LIMIT');
  if(typeof globalThis.__saveriftLz4Decompress!=='function')return inflateLz4Block(input,size);
  const bytes=input.byteOffset===0&&input.byteLength===input.buffer.byteLength?input.buffer:input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength);
  return Buffer.from(globalThis.__saveriftLz4Decompress(bytes,size));
}
async function hmacKey(key){return crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function decodeSave(bytes){
  if(bytes.length<128||bytes.subarray(0,4).toString()!=='SAVE')fail('The payload is not a Crimson SAVE envelope.');
  const version=bytes.readUInt16LE(4),flags=bytes.readUInt16LE(6),uncompressedSize=bytes.readUInt32LE(0x12),compressedSize=bytes.readUInt32LE(0x16),key=saveKey(version);
  if(flags!==0x80)fail('The SAVE compression flags are not supported by this codec.','CRIMSON_FLAGS_UNSUPPORTED');
  if(!compressedSize||compressedSize+128!==bytes.length)fail('SAVE payload length or trailing data is unsupported.');
  const compressed=chacha20(bytes.subarray(128),key,bytes.subarray(0x1a,0x2a));
  if(!await crypto.subtle.verify('HMAC',await hmacKey(key),bytes.subarray(0x2a,0x4a),compressed))fail('The SAVE HMAC did not verify. No decompression or edit was attempted.','CRIMSON_HMAC_FAILED');
  return {version,flags,compressedSize,uncompressedSize,header:Buffer.from(bytes.subarray(0,128)),plaintext:inflateLz4(compressed,uncompressedSize)};
}
export async function encodeSave(plaintext,header,{nonce=randomBytes(16)}={}){
  if(plaintext.length>8*1024*1024)fail('Re-encoding exceeds the bounded round-trip limit.','CRIMSON_ROUNDTRIP_SIZE_LIMIT');
  const copy=Buffer.from(header),version=copy.readUInt16LE(4),key=saveKey(version),compressed=compressStandardLz4(plaintext);
  copy.writeUInt32LE(plaintext.length,0x12);copy.writeUInt32LE(compressed.length,0x16);nonce.copy(copy,0x1a);
  Buffer.from(await crypto.subtle.sign('HMAC',await hmacKey(key),compressed)).copy(copy,0x2a);
  return Buffer.concat([copy,chacha20(compressed,key,nonce)]);
}

export function parcSchema(raw){
  let pos=14;
  function need(n){if(!Number.isSafeInteger(n)||n<0||pos+n>raw.length)fail('PARC schema or table is truncated.','PARC_BOUNDS_INVALID');}
  function u16(){need(2);const v=raw.readUInt16LE(pos);pos+=2;return v;}
  function u32(){need(4);const v=raw.readUInt32LE(pos);pos+=4;return v;}
  function string(){const n=u32();if(n>2048)fail('PARC name exceeds the inspection limit.');need(n);let v;try{v=new TextDecoder('utf-8',{fatal:true}).decode(raw.subarray(pos,pos+n));}catch{fail('PARC schema contains invalid UTF-8.','PARC_TEXT_INVALID');}pos+=n;return v;}
  if(raw.length<20||raw.readUInt16LE(0)!==0xffff)fail('The decoded payload has no recognized PARC header.','PARC_NOT_RECOGNIZED');
  const roots=u32(),count=u16(),types=[];let totalFields=0;
  if(count>4000)fail('PARC type count exceeds the inspection limit.');
  for(let i=0;i<count;i++){
    const name=string(),fieldCount=u16(),fields=[];totalFields+=fieldCount;if(totalFields>50000)fail('PARC field count exceeds the inspection limit.');
    for(let j=0;j<fieldCount;j++){const fieldName=string(),type=string(),kind=u16(),size=u16(),aux=u32();fields.push({name:fieldName,type,kind,size,aux});}
    types.push({index:i,name,fields});
  }
  const reserved=u32(),entries=u32(),streamSize=u32(),toc=[];if(entries>10000)fail('PARC object count exceeds the inspection limit.');
  need(entries*20);
  for(let i=0;i<entries;i++){const classIndex=u32(),sentinel1=u32(),sentinel2=u32(),offset=u32(),bytes=u32();if(classIndex>=types.length||offset+bytes>raw.length)fail('PARC object points outside its type table or payload.','PARC_BOUNDS_INVALID');toc.push({classIndex,sentinel1,sentinel2,offset,bytes});}
  for(const e of toc)if(e.offset<pos)fail('PARC object overlaps its schema or table.','PARC_BOUNDS_INVALID');
  return {roots,reserved,streamSize,types,toc,dataStart:pos};
}

// The upstream scanner recognizes item signatures inside InventorySaveData.
// This is a bounded candidate locator, not a complete semantic field decoder.
export function inventoryCandidates(raw,parsed=parcSchema(raw)){
  const itemType=parsed.types.find(t=>t.name==='ItemSaveData');
  const expected=['_saveVersion','_itemNo','_itemKey','_slotNo','_stackCount'];
  if(!itemType||expected.some((name,i)=>itemType.fields[i]?.name!==name))return {status:'schema_unsupported',records:[],message:'The ItemSaveData field signature has not been mapped for this save.'};
  const inventory=parsed.types.find(t=>t.name==='InventorySaveData'),records=[],seen=new Set(),sourceHash=hash(raw);
  if(!inventory)return {status:'not_present',records:[]};
  for(const entry of parsed.toc.filter(e=>e.classIndex===inventory.index)){
    for(let offset=entry.offset+16;offset+34<=entry.offset+entry.bytes;offset++){
      if(raw.readUInt32LE(offset)!==1||raw.readBigUInt64LE(offset-16)!==0xffffffffffffffffn||seen.has(offset))continue;
      const itemNo=raw.readBigUInt64LE(offset+4),itemKey=raw.readUInt32LE(offset+12),slot=raw.readUInt16LE(offset+16),quantity=raw.readBigUInt64LE(offset+18);
      if(itemNo<1n||itemNo>999999n||!itemKey||itemKey>0x7fffffff||slot>200||quantity<1n||quantity>99999n)continue;
      seen.add(offset);records.push({id:hash(`${sourceHash}:${offset}:${itemNo}:${itemKey}:${slot}`).slice(0,24),offset,itemNo:Number(itemNo),itemKey,slot,quantity:Number(quantity)});
      if(records.length>=1000)fail('Inventory candidate limit exceeded.','CRIMSON_INVENTORY_LIMIT');
    }
  }
  return {status:'candidates_only',method:'Pinned NattKh inventory signature scan with schema and block bounds checks; item names, limits and game semantics are not yet validated.',count:records.length,records};
}

export async function inspectCrimson(bytes,{typedCache}={}){
  const result={codec:'crimson-save-envelope-v1',sourceRevision:'96e7f78fcb00d6cb5615171a7f359f0c2de5b114',semanticValidation:'unverified',editingEnabled:false};
  try{
    const decoded=await decodeSave(bytes);
    Object.assign(result,{status:'decoded',version:decoded.version,hmac:'verified',compressedBytes:decoded.compressedSize,decompressedBytes:decoded.uncompressedSize,plaintextSha256:hash(decoded.plaintext)});
    try{const parsed=parcSchema(decoded.plaintext);result.structure={status:'schema_and_bounds_checked',typeCount:parsed.types.length,objectCount:parsed.toc.length,classes:parsed.types.map(t=>({name:t.name,fieldCount:t.fields.length,fields:t.fields.map(f=>f.name)}))};const inventory=inventoryCandidates(decoded.plaintext,parsed);result.inventory={...inventory,records:inventory.records.slice(0,200)};}
    catch(e){if(!(e instanceof CodecError))throw e;result.structure={status:'unsupported',code:e.code,message:e.message};}
    try{const {readDocument}=await import('./crimson-document.mjs'),{normalizeCrimson}=await import('./crimson-domain.mjs');result.domains=typedCache?.get(result.plaintextSha256)||normalizeCrimson(readDocument(decoded.plaintext,{fieldListLimits:{'InventoryElementSaveData._itemList':1024,'MercenaryClanSaveData._mercenaryDataList':1000}}),{saveVersion:decoded.version});typedCache?.set(result.plaintextSha256,result.domains);result.typedValidation={status:'passed',decoderRevision:result.domains.decoderRevision,unconsumedBytes:0};}
    catch(e){if(!(e instanceof CodecError))throw e;result.typedValidation={status:'blocked',code:e.code,message:e.message};}
    try{
      const encoded=await encodeSave(decoded.plaintext,decoded.header),reopened=await decodeSave(encoded);
      if(!decoded.plaintext.equals(reopened.plaintext)||reopened.version!==decoded.version)fail('Reopened plaintext did not match.');
      result.roundTrip={status:'passed',kind:'Unmodified plaintext re-encoded with a new nonce, then HMAC verified and reopened. No game-engine load has been tested.',bytes:encoded.length,plaintextMatches:true,originalUnchanged:true};
    }catch(e){if(!(e instanceof CodecError))throw e;result.roundTrip={status:'blocked',code:e.code,message:e.message};}
  }catch(e){if(!(e instanceof CodecError))throw e;Object.assign(result,{status:'blocked',code:e.code,message:e.message});}
  return result;
}
