// SPDX-License-Identifier: Apache-2.0
// Native PC transport helpers. These do not implement Oodle decompression and
// are not a claim of raw-save connector support. Based on the project's proven
// September repack_progression_save.ps1 and unpack_save_blocks.ps1 framing.
import {fail} from './typed-context.mjs';
const MAGIC=new Uint8Array([0x33,0xaa,0xfb,0x57,0x99,0xfa,0x04,0x10]);
const INFO=new Uint8Array([3,0,5,0,0,4,0]);
const tables=new Map();
function crcTable(polynomial){let table=tables.get(polynomial);if(!table){table=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?polynomial:0);table[i]=c>>>0;}tables.set(polynomial,table);}return table;}
export function seededCrc(bytes,start=0,end=bytes.length,polynomial=0xedb88320){
  const table=crcTable(polynomial);
  let crc=(0xf4c3b8a2^0xffffffff)>>>0;for(let i=start;i<end;i++)crc=(table[(crc^bytes[i])&255]^(crc>>>8))>>>0;return (crc^0xffffffff)>>>0;
}
// Inspect both independent native CRCs in one pass over the large payload.
// The stored payload CRC is part of the outer header, so validation can share
// the walk; encoding still computes the dependent fields in their native order.
function crcPair(bytes){const regular=crcTable(0xedb88320),castagnoli=crcTable(0x82f63b78);let a=(0xf4c3b8a2^0xffffffff)>>>0,b=a;for(let i=0;i<20;i++)b=(castagnoli[(b^bytes[i])&255]^(b>>>8))>>>0;for(let i=20;i<bytes.length-4;i++){const v=bytes[i];a=(regular[(a^v)&255]^(a>>>8))>>>0;b=(castagnoli[(b^v)&255]^(b>>>8))>>>0;}return [(a^0xffffffff)>>>0,(b^0xffffffff)>>>0];}
export function adlerZero(bytes){let a=0,b=0;for(const x of bytes){a=(a+x)%65521;b=(b+a)%65521;}return ((b<<16)|a)>>>0;}
const same=(bytes,offset,wanted)=>wanted.every((v,i)=>bytes[offset+i]===v);
const join=parts=>{const b=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){b.set(p,at);at+=p.length;}return b;};
const u32=(bytes,p)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(p,true);

/** Validate transport integrity and every context/block length/checksum.
 * Compressed blocks remain compressed; plaintext validation requires a decoder.
 */
export function inspectNativeContainer(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<24||bytes.length>24*1024*1024)fail('AC_NATIVE_SIZE');
  if(u32(bytes,0)!==0x00fedbac)fail('AC_NATIVE_MAGIC');
  if(u32(bytes,4)!==54||u32(bytes,8)!==4)fail('AC_NATIVE_VERSION_UNSUPPORTED');
  const [payloadCrc,outerCrc]=crcPair(bytes);if(payloadCrc!==u32(bytes,16))fail('AC_NATIVE_PAYLOAD_CRC');
  if(outerCrc!==u32(bytes,bytes.length-4))fail('AC_NATIVE_OUTER_CRC');
  const contexts=[];let p=20,totalPlain=0;
  while(p<bytes.length-4){
    if(p+31>bytes.length-4||contexts.length>=256)fail('AC_NATIVE_CONTEXT_BOUNDS');
    const start=p,magic=p+16,size=u32(bytes,p+8),plainSize=u32(bytes,p+12),end=magic+size-4;
    if(size<24||end>bytes.length-4||plainSize<30||plainSize>8*1024*1024)fail('AC_NATIVE_CONTEXT_LENGTH');
    if(!same(bytes,magic,MAGIC)||!same(bytes,magic+8,INFO))fail('AC_NATIVE_COMPRESSION_UNSUPPORTED');
    p=magic+15;const blocks=[];let sum=0;
    while(p<end){
      if(p+5>end)fail('AC_NATIVE_BLOCK_HEADER');const offset=p,flag=bytes[p],packed=u32(bytes,p+1);let plain=packed,checksum=null;p+=5;
      if(flag===1){if(p+8>end)fail('AC_NATIVE_BLOCK_HEADER');plain=u32(bytes,p);checksum=u32(bytes,p+4);p+=8;}else if(flag!==0)fail('AC_NATIVE_BLOCK_FLAG');
      if(packed<1||packed>262144||plain<1||plain>262144||p+packed>end||sum+plain>plainSize)fail('AC_NATIVE_BLOCK_LENGTH');
      if(flag===1&&adlerZero(bytes.subarray(p,p+packed))!==checksum)fail('AC_NATIVE_BLOCK_ADLER');
      blocks.push({offset,dataOffset:p,end:p+packed,flag,packed,plain,plainOffset:sum,checksum,requiresDecoder:flag===1&&packed!==plain});sum+=plain;p+=packed;
    }
    if(p!==end||sum!==plainSize)fail('AC_NATIVE_CONTEXT_CONSUMPTION');
    totalPlain+=plainSize;if(totalPlain>64*1024*1024)fail('AC_NATIVE_TOTAL_PLAIN_LIMIT');
    contexts.push({index:contexts.length,start,magic,end,plainSize,blocks});
  }
  if(p!==bytes.length-4||!contexts.length)fail('AC_NATIVE_TRAILING_BYTES');
  return {version:54,contexts,totalPlain,compressedBlocks:contexts.reduce((n,c)=>n+c.blocks.filter(b=>b.requiresDecoder).length,0)};
}

export function decodeContext(container,context,decoder){
  const parts=[];
  for(const b of context.blocks){const packed=container.subarray(b.dataOffset,b.end);let plain;if(b.requiresDecoder){if(typeof decoder!=='function')fail('AC_OODLE_REQUIRED');plain=decoder(packed,b.plain);}else plain=packed;
    if(!(plain instanceof Uint8Array)||plain.length!==b.plain)fail('AC_DECODE_LENGTH');parts.push(plain);
  }
  return join(parts);
}

/** Primary container serializer. Only changed blocks become flag-0 stored
 * blocks, an existing native format branch. Unchanged context/block bytes are
 * reused exactly. No proprietary compression code or DLL is distributed.
 * Callers must independently establish oldPlain came from this exact source.
 */
export function replaceContext(bytes,inspection,index,oldPlain,newPlain){
  const target=inspection.contexts[index];if(!target||oldPlain.length!==target.plainSize||newPlain.length!==target.plainSize)fail('AC_REPLACE_LENGTH');
  if(oldPlain.every((v,i)=>v===newPlain[i]))return new Uint8Array(bytes);
  const blocks=[];for(const block of target.blocks){const old=oldPlain.subarray(block.plainOffset,block.plainOffset+block.plain),next=newPlain.subarray(block.plainOffset,block.plainOffset+block.plain);if(old.every((v,i)=>v===next[i]))blocks.push(bytes.subarray(block.offset,block.end));else{const header=new Uint8Array(5);new DataView(header.buffer).setUint32(1,next.length,true);blocks.push(header,next);}}
  const record=join([bytes.subarray(target.start,target.magic+15),...blocks]);new DataView(record.buffer).setUint32(8,record.length-12,true);
  const output=join([bytes.subarray(0,target.start),record,bytes.subarray(target.end)]),view=new DataView(output.buffer);view.setUint32(16,seededCrc(output,20,output.length-4),true);view.setUint32(output.length-4,seededCrc(output,0,output.length-4,0x82f63b78),true);
  inspectNativeContainer(output);return output;
}

/** Explicitly supplied private base key, never a bundled account identifier.
 * Rotation follows payload length. Using the same input/output key preserves
 * ownership; it does not authenticate a new owner or infer a credential.
 */
export function transformPayload(bytes,baseKey){if(!(baseKey instanceof Uint8Array)||baseKey.length!==16)fail('AC_PRIVATE_KEY_REQUIRED');const rotation=bytes.length%16,out=new Uint8Array(bytes.length);for(let i=0;i<out.length;i++)out[i]=bytes[i]^baseKey[(i-rotation+16)%16];return out;}
