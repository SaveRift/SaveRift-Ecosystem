// Read-only compatibility investigation. Protocol references:
// NattKh/.../CrimsonSaveEditor/save_crypto.py and parc_serializer.py,
// pinned revision 96e7f78fcb00d6cb5615171a7f359f0c2de5b114 (MPL-2.0).
// This module never publishes or replaces a stored save. Semantic game support
// remains unverified even when its envelope can be decoded and reopened.
import {Buffer} from '../../../sdk/buffer.mjs';
import {formatCrypto as crypto,randomBytes} from '../../../sdk/crypto.mjs';
import {hash} from './source-binding.mjs';
import {compressStandardLz4} from './lz4-standard.mjs';

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
export function chacha20(data,key,nonce){
  if(key.length!==32||nonce.length!==16)fail('Invalid ChaCha20 key or nonce.');
  const state=new Uint32Array(16);state.set([0x61707865,0x3320646e,0x79622d32,0x6b206574]);
  for(let i=0;i<8;i++)state[4+i]=key.readUInt32LE(i*4);
  for(let i=0;i<4;i++)state[12+i]=nonce.readUInt32LE(i*4);
  const output=Buffer.alloc(data.length),block=Buffer.alloc(64);
  for(let pos=0;pos<data.length;pos+=64){
    let x0=state[0],x1=state[1],x2=state[2],x3=state[3],x4=state[4],x5=state[5],x6=state[6],x7=state[7],x8=state[8],x9=state[9],x10=state[10],x11=state[11],x12=state[12],x13=state[13],x14=state[14],x15=state[15];
    for(let i=0;i<10;i++){
      x0=(x0+x4)>>>0;x12^=x0;x12=((x12<<16)|(x12>>>16))>>>0;
      x8=(x8+x12)>>>0;x4^=x8;x4=((x4<<12)|(x4>>>20))>>>0;
      x0=(x0+x4)>>>0;x12^=x0;x12=((x12<<8)|(x12>>>24))>>>0;
      x8=(x8+x12)>>>0;x4^=x8;x4=((x4<<7)|(x4>>>25))>>>0;
      x1=(x1+x5)>>>0;x13^=x1;x13=((x13<<16)|(x13>>>16))>>>0;
      x9=(x9+x13)>>>0;x5^=x9;x5=((x5<<12)|(x5>>>20))>>>0;
      x1=(x1+x5)>>>0;x13^=x1;x13=((x13<<8)|(x13>>>24))>>>0;
      x9=(x9+x13)>>>0;x5^=x9;x5=((x5<<7)|(x5>>>25))>>>0;
      x2=(x2+x6)>>>0;x14^=x2;x14=((x14<<16)|(x14>>>16))>>>0;
      x10=(x10+x14)>>>0;x6^=x10;x6=((x6<<12)|(x6>>>20))>>>0;
      x2=(x2+x6)>>>0;x14^=x2;x14=((x14<<8)|(x14>>>24))>>>0;
      x10=(x10+x14)>>>0;x6^=x10;x6=((x6<<7)|(x6>>>25))>>>0;
      x3=(x3+x7)>>>0;x15^=x3;x15=((x15<<16)|(x15>>>16))>>>0;
      x11=(x11+x15)>>>0;x7^=x11;x7=((x7<<12)|(x7>>>20))>>>0;
      x3=(x3+x7)>>>0;x15^=x3;x15=((x15<<8)|(x15>>>24))>>>0;
      x11=(x11+x15)>>>0;x7^=x11;x7=((x7<<7)|(x7>>>25))>>>0;
      x0=(x0+x5)>>>0;x15^=x0;x15=((x15<<16)|(x15>>>16))>>>0;
      x10=(x10+x15)>>>0;x5^=x10;x5=((x5<<12)|(x5>>>20))>>>0;
      x0=(x0+x5)>>>0;x15^=x0;x15=((x15<<8)|(x15>>>24))>>>0;
      x10=(x10+x15)>>>0;x5^=x10;x5=((x5<<7)|(x5>>>25))>>>0;
      x1=(x1+x6)>>>0;x12^=x1;x12=((x12<<16)|(x12>>>16))>>>0;
      x11=(x11+x12)>>>0;x6^=x11;x6=((x6<<12)|(x6>>>20))>>>0;
      x1=(x1+x6)>>>0;x12^=x1;x12=((x12<<8)|(x12>>>24))>>>0;
      x11=(x11+x12)>>>0;x6^=x11;x6=((x6<<7)|(x6>>>25))>>>0;
      x2=(x2+x7)>>>0;x13^=x2;x13=((x13<<16)|(x13>>>16))>>>0;
      x8=(x8+x13)>>>0;x7^=x8;x7=((x7<<12)|(x7>>>20))>>>0;
      x2=(x2+x7)>>>0;x13^=x2;x13=((x13<<8)|(x13>>>24))>>>0;
      x8=(x8+x13)>>>0;x7^=x8;x7=((x7<<7)|(x7>>>25))>>>0;
      x3=(x3+x4)>>>0;x14^=x3;x14=((x14<<16)|(x14>>>16))>>>0;
      x9=(x9+x14)>>>0;x4^=x9;x4=((x4<<12)|(x4>>>20))>>>0;
      x3=(x3+x4)>>>0;x14^=x3;x14=((x14<<8)|(x14>>>24))>>>0;
      x9=(x9+x14)>>>0;x4^=x9;x4=((x4<<7)|(x4>>>25))>>>0;
    }
    if(pos+64<=data.length){
      let word;
      word=(x0+state[0])>>>0;output[pos+0]=data[pos+0]^(word);output[pos+1]=data[pos+1]^(word>>>8);output[pos+2]=data[pos+2]^(word>>>16);output[pos+3]=data[pos+3]^(word>>>24);
      word=(x1+state[1])>>>0;output[pos+4]=data[pos+4]^(word);output[pos+5]=data[pos+5]^(word>>>8);output[pos+6]=data[pos+6]^(word>>>16);output[pos+7]=data[pos+7]^(word>>>24);
      word=(x2+state[2])>>>0;output[pos+8]=data[pos+8]^(word);output[pos+9]=data[pos+9]^(word>>>8);output[pos+10]=data[pos+10]^(word>>>16);output[pos+11]=data[pos+11]^(word>>>24);
      word=(x3+state[3])>>>0;output[pos+12]=data[pos+12]^(word);output[pos+13]=data[pos+13]^(word>>>8);output[pos+14]=data[pos+14]^(word>>>16);output[pos+15]=data[pos+15]^(word>>>24);
      word=(x4+state[4])>>>0;output[pos+16]=data[pos+16]^(word);output[pos+17]=data[pos+17]^(word>>>8);output[pos+18]=data[pos+18]^(word>>>16);output[pos+19]=data[pos+19]^(word>>>24);
      word=(x5+state[5])>>>0;output[pos+20]=data[pos+20]^(word);output[pos+21]=data[pos+21]^(word>>>8);output[pos+22]=data[pos+22]^(word>>>16);output[pos+23]=data[pos+23]^(word>>>24);
      word=(x6+state[6])>>>0;output[pos+24]=data[pos+24]^(word);output[pos+25]=data[pos+25]^(word>>>8);output[pos+26]=data[pos+26]^(word>>>16);output[pos+27]=data[pos+27]^(word>>>24);
      word=(x7+state[7])>>>0;output[pos+28]=data[pos+28]^(word);output[pos+29]=data[pos+29]^(word>>>8);output[pos+30]=data[pos+30]^(word>>>16);output[pos+31]=data[pos+31]^(word>>>24);
      word=(x8+state[8])>>>0;output[pos+32]=data[pos+32]^(word);output[pos+33]=data[pos+33]^(word>>>8);output[pos+34]=data[pos+34]^(word>>>16);output[pos+35]=data[pos+35]^(word>>>24);
      word=(x9+state[9])>>>0;output[pos+36]=data[pos+36]^(word);output[pos+37]=data[pos+37]^(word>>>8);output[pos+38]=data[pos+38]^(word>>>16);output[pos+39]=data[pos+39]^(word>>>24);
      word=(x10+state[10])>>>0;output[pos+40]=data[pos+40]^(word);output[pos+41]=data[pos+41]^(word>>>8);output[pos+42]=data[pos+42]^(word>>>16);output[pos+43]=data[pos+43]^(word>>>24);
      word=(x11+state[11])>>>0;output[pos+44]=data[pos+44]^(word);output[pos+45]=data[pos+45]^(word>>>8);output[pos+46]=data[pos+46]^(word>>>16);output[pos+47]=data[pos+47]^(word>>>24);
      word=(x12+state[12])>>>0;output[pos+48]=data[pos+48]^(word);output[pos+49]=data[pos+49]^(word>>>8);output[pos+50]=data[pos+50]^(word>>>16);output[pos+51]=data[pos+51]^(word>>>24);
      word=(x13+state[13])>>>0;output[pos+52]=data[pos+52]^(word);output[pos+53]=data[pos+53]^(word>>>8);output[pos+54]=data[pos+54]^(word>>>16);output[pos+55]=data[pos+55]^(word>>>24);
      word=(x14+state[14])>>>0;output[pos+56]=data[pos+56]^(word);output[pos+57]=data[pos+57]^(word>>>8);output[pos+58]=data[pos+58]^(word>>>16);output[pos+59]=data[pos+59]^(word>>>24);
      word=(x15+state[15])>>>0;output[pos+60]=data[pos+60]^(word);output[pos+61]=data[pos+61]^(word>>>8);output[pos+62]=data[pos+62]^(word>>>16);output[pos+63]=data[pos+63]^(word>>>24);
    }else{
      block.writeUInt32LE((x0+state[0])>>>0,0);
      block.writeUInt32LE((x1+state[1])>>>0,4);
      block.writeUInt32LE((x2+state[2])>>>0,8);
      block.writeUInt32LE((x3+state[3])>>>0,12);
      block.writeUInt32LE((x4+state[4])>>>0,16);
      block.writeUInt32LE((x5+state[5])>>>0,20);
      block.writeUInt32LE((x6+state[6])>>>0,24);
      block.writeUInt32LE((x7+state[7])>>>0,28);
      block.writeUInt32LE((x8+state[8])>>>0,32);
      block.writeUInt32LE((x9+state[9])>>>0,36);
      block.writeUInt32LE((x10+state[10])>>>0,40);
      block.writeUInt32LE((x11+state[11])>>>0,44);
      block.writeUInt32LE((x12+state[12])>>>0,48);
      block.writeUInt32LE((x13+state[13])>>>0,52);
      block.writeUInt32LE((x14+state[14])>>>0,56);
      block.writeUInt32LE((x15+state[15])>>>0,60);
      for(let i=0;i<64&&pos+i<data.length;i++)output[pos+i]=data[pos+i]^block[i];
    }
    state[12]=(state[12]+1)>>>0;if(!state[12])state[13]=(state[13]+1)>>>0;
  }
  return output;
}
export function inflateLz4(input,size){
  if(!Number.isSafeInteger(size)||size<1||size>limit)fail('The declared decompressed size exceeds the inspection limit.','CRIMSON_SIZE_LIMIT');
  const out=Buffer.alloc(size);let ip=0,op=0;
  function length(base){let n=base;if(base===15){let b;do{if(ip>=input.length)fail('Truncated LZ4 length.');b=input[ip++];n+=b;if(n>limit)fail('LZ4 length exceeds the limit.','CRIMSON_SIZE_LIMIT');}while(b===255);}return n;}
  while(ip<input.length){
    const token=input[ip++],literal=length(token>>>4);
    if(ip+literal>input.length||op+literal>size)fail('LZ4 literal exceeds its declared bounds.');
    input.copy(out,op,ip,ip+literal);ip+=literal;op+=literal;
    if(ip===input.length)break;
    if(ip+2>input.length)fail('Truncated LZ4 match offset.');const offset=input.readUInt16LE(ip);ip+=2;
    if(!offset||offset>op)fail('Invalid LZ4 match offset.');const match=length(token&15)+4;
    if(op+match>size)fail('LZ4 match exceeds the declared output size.');
    for(let i=0;i<match;i++){out[op]=out[op-offset];op++;}
  }
  if(op!==size)fail('LZ4 output length does not match the SAVE header.');return out;
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
