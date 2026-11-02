// SPDX-License-Identifier: Apache-2.0 AND MIT
import {SHA256} from '@noble/hashes/sha256';
import {wrapConstructor} from '@noble/hashes/utils';
import {hmac} from '@noble/hashes/hmac';
import {Buffer} from './buffer.mjs';

/* SHA-256 compression is adapted from @noble/hashes 1.8.0 for an interpreter:
 * inline the rotate/choice/majority helpers in the measured per-block hot path.
 * Noble still supplies padding, streaming, cloning, validation and destruction.
 *
 * Copyright (c) 2022 Paul Miller (https://paulmillr.com)
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
const SHA256_K = new Int32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);
class InterpreterSHA256 extends SHA256 {
  constructor(){super();this.words=new Int32Array(64);}
  process(view,offset){
    const w=this.words;
    for(let i=0;i<16;i++,offset+=4)w[i]=view.getUint32(offset,false);
    for(let i=16;i<64;i++){
      const x=w[i-15],y=w[i-2];
      const s0=((x>>>7)|(x<<25))^((x>>>18)|(x<<14))^(x>>>3);
      const s1=((y>>>17)|(y<<15))^((y>>>19)|(y<<13))^(y>>>10);
      w[i]=(s1+w[i-7]+s0+w[i-16])|0;
    }
    let a=this.A,b=this.B,c=this.C,d=this.D,e=this.E,f=this.F,g=this.G,h=this.H;
    for(let i=0;i<64;i++){
      const s1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7));
      const t1=(h+s1+((e&f)^(~e&g))+SHA256_K[i]+w[i])|0;
      const s0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10));
      const t2=(s0+((a&b)^(a&c)^(b&c)))|0;
      h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
    }
    this.A=(this.A+a)|0;this.B=(this.B+b)|0;this.C=(this.C+c)|0;this.D=(this.D+d)|0;
    this.E=(this.E+e)|0;this.F=(this.F+f)|0;this.G=(this.G+g)|0;this.H=(this.H+h)|0;
  }
  roundClean(){this.words.fill(0);}
  destroy(){super.destroy();this.words.fill(0);}
}
const nobleSha256=wrapConstructor(()=>new InterpreterSHA256());

const bytes=value=>typeof value==='string'?Buffer.from(value):value instanceof Uint8Array?value:new Uint8Array(value);
export const sha256=value=>Buffer.from(nobleSha256(bytes(value))).toString('hex');
export const hash=sha256;
export const hmacSha256=(key,value)=>Buffer.from(hmac(nobleSha256,bytes(key),bytes(value)));
export function canonicalJson(value){
  const ancestors=new Set();let nodes=0;
  function visit(value,depth){
    if(depth>64||++nodes>100000)throw new TypeError('Wire values exceed the nesting or node limit.');
    if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
    if(typeof value==='number'){if(!Number.isFinite(value)||(Number.isInteger(value)&&!Number.isSafeInteger(value)))throw new TypeError('Wire numbers must be finite and lossless.');return JSON.stringify(value);}
    if(!value||typeof value!=='object'||(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new TypeError('Wire values must use plain JSON.');
    if(ancestors.has(value))throw new TypeError('Wire values cannot contain cycles.');ancestors.add(value);
    try{if(Array.isArray(value)){const entries=[];for(let i=0;i<value.length;i++){if(!Object.hasOwn(value,i))throw new TypeError('Wire arrays cannot contain holes.');entries.push(visit(value[i],depth+1));}return '['+entries.join(',')+']';}
      return '{'+Object.keys(value).sort().map(k=>{if(['__proto__','prototype','constructor'].includes(k))throw new TypeError('Prototype keys are forbidden.');const property=Object.getOwnPropertyDescriptor(value,k);if(!property||!Object.hasOwn(property,'value'))throw new TypeError('Wire values cannot contain accessors.');return JSON.stringify(k)+':'+visit(property.value,depth+1);}).join(',')+'}';
    }finally{ancestors.delete(value);}
  }
  return visit(value,0);
}

// Compatibility surface for the extracted format code, not node:crypto.
export function createHash(algorithm){
  if(algorithm!=='sha256')throw new TypeError('Only SHA-256 is supported.');
  const state=nobleSha256.create();let finished=false;
  const api={update(value){if(finished)throw new Error('Hash already finalized.');state.update(bytes(value));return api;},digest(encoding){if(finished)throw new Error('Hash already finalized.');finished=true;const out=Buffer.from(state.digest());return encoding?out.toString(encoding):out;}};
  return api;
}
export function randomBytes(length){
  if(!Number.isSafeInteger(length)||length<1||length>64)throw new RangeError('Random requests are limited to 64 bytes.');
  if(typeof globalThis.__saveriftRandom==='function')return Buffer.from(globalThis.__saveriftRandom(length));
  if(globalThis.crypto?.getRandomValues)return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(length)));
  throw new Error('Secure runtime randomness is unavailable.');
}
function equal(a,b){a=bytes(a);b=bytes(b);if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;}

// Format-integrity crypto is public format knowledge. It cannot sign Xbox
// requests or use account keys; raw HMAC keys stay inside the guest interpreter.
export const formatCrypto=Object.freeze({
  getRandomValues(array){const data=randomBytes(array.byteLength);array.set(data);return array;},
  subtle:Object.freeze({
    async importKey(format,key,algorithm,_extractable,usages){
      const hashName=typeof algorithm?.hash==='string'?algorithm.hash:algorithm?.hash?.name;
      if(format!=='raw'||algorithm?.name!=='HMAC'||hashName!=='SHA-256'||!Array.isArray(usages)||usages.some(x=>x!=='sign'&&x!=='verify'))throw new TypeError('Only raw format HMAC-SHA256 keys are supported.');
      return Object.freeze({bytes:Buffer.from(bytes(key)),usages:[...usages]});
    },
    async sign(algorithm,key,value){if(algorithm!=='HMAC'||!key.usages.includes('sign'))throw new TypeError('Unsupported format signature.');const out=hmacSha256(key.bytes,value);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);},
    async verify(algorithm,key,signature,value){if(algorithm!=='HMAC'||!key.usages.includes('verify'))throw new TypeError('Unsupported format signature.');return equal(hmacSha256(key.bytes,value),signature);}
  })
});
