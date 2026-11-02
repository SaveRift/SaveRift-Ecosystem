/*
 * Adapted from LZ4's standard no-dictionary compressor, acceleration 1.
 * Copyright (c) Yann Collet. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
import {Buffer} from './buffer.mjs';

// Source: NattKh revision 96e7f78fcb00d6cb5615171a7f359f0c2de5b114,
// CrimsonSaveEditorCpp/third_party/lz4/lz4.c (LZ4 1.10.0), hashPosition and
// compress_generic_validated. This deliberately implements only the little-
// endian x64 standard, one-shot, no-dictionary, full-capacity mode. Exact
// bytes are checked independently against system liblz4 1.9.4 controls.
// No LZ4 frame or prepended length is emitted; SAVE already carries the length.
export const STANDARD_LZ4_PROFILE='lz4-standard-x64-le-acceleration1.v1';
const MAX_INPUT=8*1024*1024;

export function compressStandardLz4Block(data){
  if(!(data instanceof Uint8Array)||data.length<1||data.length>MAX_INPUT)throw new RangeError('Standard LZ4 input must be 1 byte to 8 MiB.');
  const size=data.length,small=size<65547,table=new Uint32Array(small?8192:4096);
  const input=Buffer.from(data.buffer,data.byteOffset,data.byteLength),view=new DataView(input.buffer,input.byteOffset,input.byteLength);
  const out=Buffer.allocUnsafe(size+Math.floor(size/255)+16);
  let ip=0,anchor=0,op=0;
  const read32=p=>view.getUint32(p,true);
  function positionHash(p){
    const a=read32(p);
    if(small)return (Math.imul(a,2654435761)>>>0)>>>19;
    // ((LE64 << 24) * 889523592379 mod 2^64) >> 52. Only five input
    // bytes matter. Exact 16-bit products avoid floating-point/BigInt drift.
    const a0=a&65535,a1=a>>>16,low=a0*0xdcbb,middle=a1*0xdcbb+a0*0x1bbc+(low>>>16);
    // These limb sums stay below 2^32. Reuse their exact carry instead of
    // recomputing two multiplications and floating-point floor calls.
    const high=(middle>>>16)+a1*0x1bbc;
    const highByte=(high+(a0&255)*0xcf+input[p+4]*0xbb)&255;
    return (highByte<<4)|((middle>>>12)&15);
  }
  function length(n){while(n>=255){out[op++]=255;n-=255;}out[op++]=n;}
  function literals(end){
    const count=end-anchor,token=op++;
    out[token]=Math.min(count,15)<<4;
    if(count>=15)length(count-15);
    out.set(input.subarray(anchor,end),op);op+=count;return token;
  }
  if(size>=13){
    table[positionHash(0)]=0;
    ip=1;let forwardHash=positionHash(ip);
    const searchLimit=size-11,matchLimit=size-5;
    main: for(;;){
      let match,forward=ip,step=1,searchCount=64;
      for(;;){
        const h=forwardHash,current=forward;match=table[h];ip=forward;
        forward+=step;step=searchCount++>>>6;
        if(forward>searchLimit)break main;
        forwardHash=positionHash(forward);table[h]=current;
        if(current-match<=65535&&read32(match)===read32(ip))break;
      }
      while(ip>anchor&&match>0&&input[ip-1]===input[match-1]){ip--;match--;}
      let token=literals(ip);
      for(;;){
        const offset=ip-match;out[op++]=offset;out[op++]=offset>>>8;
        let end=ip+4,ref=match+4;
        while(end<matchLimit&&input[end]===input[ref]){end++;ref++;}
        const matchCode=end-ip-4;ip=end;
        out[token]+=Math.min(matchCode,15);if(matchCode>=15)length(matchCode-15);
        anchor=ip;
        if(ip>=searchLimit)break main;
        table[positionHash(ip-2)]=ip-2;
        const h=positionHash(ip);match=table[h];table[h]=ip;
        if(ip-match<=65535&&read32(match)===read32(ip)){token=op++;out[token]=0;continue;}
        forwardHash=positionHash(++ip);break;
      }
    }
  }
  literals(size);
  if(op>out.length)throw new RangeError('Standard LZ4 output exceeded its bounded allocation.');
  return out.subarray(0,op);
}
