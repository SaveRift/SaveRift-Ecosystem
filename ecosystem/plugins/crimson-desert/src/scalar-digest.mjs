// SPDX-License-Identifier: Apache-2.0
// Exact legacy scalar-tuple stream, with one bounded UTF-8 buffer instead of
// a new encoded byte array and SHA update for every strictly walked scalar.
import {createHash} from '../../../sdk/crypto.mjs';

const BUFFER_BYTES=64*1024;
const ASCII=/^[\x00-\x7f]*$/;

export function createScalarDigest(){
 const state=createHash('sha256'),nativeText=typeof state.updateText==='function',buffer=nativeText?null:new Uint8Array(BUFFER_BYTES);
 let used=0,count=0,finished=false,textRows=[],textUnits=0,textAscii=true;
 function flush(){
  if(used){state.update(used===BUFFER_BYTES?buffer:buffer.subarray(0,used));used=0;}
 }
 function write(text){
  for(let i=0;i<text.length;i++){
   let code=text.charCodeAt(i);
   if(code<0x80){buffer[used++]=code;if(used===BUFFER_BYTES)flush();continue;}
   if(code>=0xd800&&code<=0xdbff){
    const next=text.charCodeAt(i+1);
    if(next>=0xdc00&&next<=0xdfff){code=0x10000+((code-0xd800)<<10)+(next-0xdc00);i++;}else code=0xfffd;
   }else if(code>=0xdc00&&code<=0xdfff)code=0xfffd;
   // Reserve the largest UTF-8 sequence. SHA consumes bytes synchronously;
   // neither a full buffer nor the final partial view escapes this stream.
   if(used>BUFFER_BYTES-4)flush();
   if(code<0x800){buffer[used++]=0xc0|(code>>6);buffer[used++]=0x80|(code&63);}
   else if(code<0x10000){buffer[used++]=0xe0|(code>>12);buffer[used++]=0x80|((code>>6)&63);buffer[used++]=0x80|(code&63);}
   else{buffer[used++]=0xf0|(code>>18);buffer[used++]=0x80|((code>>12)&63);buffer[used++]=0x80|((code>>6)&63);buffer[used++]=0x80|(code&63);}
   if(used===BUFFER_BYTES)flush();
  }
 }
 function flushText(){
  if(textUnits){state.updateText(textRows.join(''));textRows=[];textUnits=0;}
 }
 function writeText(text){
  const ascii=ASCII.test(text),limit=ascii?BUFFER_BYTES:16384;
  if(textUnits&&textAscii!==ascii)flushText();textAscii=ascii;
  for(let offset=0;offset<text.length;){
   let end=Math.min(text.length,offset+limit-textUnits);
   // The SDK handles unsupported FFI text through its exact binary path.
   // Never separate a valid UTF-16 pair between two updateText calls.
   if(end<text.length&&text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff&&text.charCodeAt(end)>=0xdc00&&text.charCodeAt(end)<=0xdfff)end--;
   if(end===offset){flushText();continue;}
   textRows.push(text.slice(offset,end));textUnits+=end-offset;offset=end;
   if(textUnits===limit)flushText();
  }
 }
 const api={
  update(event){
   if(finished)throw Error('Scalar digest already finalized.');
   // Serialize before mutating hash state, retaining the original tuple's
   // JSON coercion/error semantics and its exact trailing newline.
   const row=JSON.stringify([event.path,event.type,event.bytes,event.value])+'\n';
   if(nativeText)writeText(row);else write(row);count++;return api;
  },
  digest(){
   if(finished)throw Error('Scalar digest already finalized.');
   finished=true;if(nativeText)flushText();else flush();const sha256=state.digest('hex');buffer?.fill(0);textRows=[];
   return {sha256,count};
  }
 };
 return api;
}
