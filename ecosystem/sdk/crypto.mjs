import {sha256 as nobleSha256} from '@noble/hashes/sha256';
import {hmac} from '@noble/hashes/hmac';
import {Buffer} from './buffer.mjs';

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
