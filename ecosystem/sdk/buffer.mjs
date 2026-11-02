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
export {Buffer};
