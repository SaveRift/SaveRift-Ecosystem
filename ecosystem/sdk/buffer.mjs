// Portable binary helpers. This is the browser implementation, never Node's
// Buffer or a filesystem/network capability. Bundlers include it in the package.
import {Buffer} from 'buffer/index.js';
// The upstream static compare copies Uint8Array inputs, including Buffers.
// Compare their existing views instead. Word equality skips four bytes at a
// time; the first differing word is still ordered by its first differing byte.
const portableCompare=Buffer.compare;
Buffer.compare=function compare(a,b){
 if(!(a instanceof Uint8Array)||!(b instanceof Uint8Array))return portableCompare(a,b);
 if(a===b)return 0;
 const length=Math.min(a.byteLength,b.byteLength);let at=0;
 if(length>=64){
  const left=new DataView(a.buffer,a.byteOffset,a.byteLength),right=new DataView(b.buffer,b.byteOffset,b.byteLength);
  for(;at+4<=length;at+=4)if(left.getUint32(at)!==right.getUint32(at))break;
 }
 for(;at<length;at++)if(a[at]!==b[at])return a[at]<b[at]?-1:1;
 return a.byteLength===b.byteLength?0:a.byteLength<b.byteLength?-1:1;
};
// Native typed-array search skips nonmatching first bytes in C, rather than
// interpreting a JavaScript loop over multi-megabyte identity search ranges.
// Preserve upstream handling of strings, encodings and unusual offsets.
const portableIndexOf=Buffer.prototype.indexOf,nativeByteIndexOf=Uint8Array.prototype.indexOf;
Buffer.prototype.indexOf=function indexOf(needle,offset,encoding){
 if(!Buffer.isBuffer(needle)||!needle.length||encoding!==undefined||offset!==undefined&&(!Number.isInteger(offset)||offset>0x7fffffff||offset< -0x80000000))return portableIndexOf.call(this,needle,offset,encoding);
 const start=offset===undefined?0:offset<0?Math.max(0,this.length+offset):offset,last=this.length-needle.length;
 for(let at=nativeByteIndexOf.call(this,needle[0],start);at>=0&&at<=last;at=nativeByteIndexOf.call(this,needle[0],at+1)){
  let n=1;while(n<needle.length&&this[at+n]===needle[n])n++;
  if(n===needle.length)return at;
 }
 return -1;
};
export {Buffer};
