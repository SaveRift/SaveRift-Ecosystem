// SPDX-License-Identifier: Apache-2.0
import {sha256,canonicalJson} from './crypto.mjs';
import {createSaveBundle} from './contracts.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const validPath=p=>typeof p==='string'&&p.length>0&&p.length<=240&&!p.startsWith('/')&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='.'||x==='..')&&!/[\u0000-\u001f\u007f:]/u.test(p);
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9._:-]{1,160}$/.test(id);
export function createArtifactStore({maxBytes=32*1024*1024,maxArtifactBytes=8*1024*1024,maxArtifacts=128}={}){
 const contents=new Map(),metadata=new Map();let total=0;
 function adopt(descriptor,bytes){
  if(!(bytes instanceof Uint8Array)||!descriptor||Object.keys(descriptor).sort().join(',')!=='byteLength,id,logicalPath,role,sha256'||!validId(descriptor.id)||!validPath(descriptor.logicalPath)||typeof descriptor.role!=='string'||!descriptor.role||descriptor.role.length>80||descriptor.byteLength!==bytes.byteLength||descriptor.sha256!==sha256(bytes))fail('ARTIFACT_INVALID');
  if(bytes.byteLength>maxArtifactBytes)fail('ARTIFACT_LIMIT');
  const {id}=descriptor;
  if(contents.has(id)){if(canonicalJson(metadata.get(id))!==canonicalJson(descriptor)||sha256(contents.get(id))!==descriptor.sha256)fail('ARTIFACT_ID_COLLISION');return metadata.get(id);}
  if(total+bytes.byteLength>maxBytes||contents.size>=maxArtifacts)fail('ARTIFACT_LIMIT');
  const checked=Object.freeze({...descriptor});contents.set(id,bytes.slice());metadata.set(id,checked);total+=bytes.byteLength;return checked;
 }
 return Object.freeze({
  put(bytes,{logicalPath,role='main'}={}){
   if(!(bytes instanceof Uint8Array)||!validPath(logicalPath)||typeof role!=='string'||!role||role.length>80)fail('ARTIFACT_INVALID');
   if(bytes.byteLength>maxArtifactBytes)fail('ARTIFACT_LIMIT');
   const digest=sha256(bytes),id='artifact:'+sha256(canonicalJson({logicalPath,role,sha256:digest}));
   return adopt({id,logicalPath,role,byteLength:bytes.byteLength,sha256:digest},bytes);
  },
  // Trusted host ingestion of a runner's scoped binary output. IDs are opaque.
  adopt,
  read(id){const b=contents.get(id);if(!b)fail('ARTIFACT_NOT_FOUND');return b.slice();},
  verify(descriptor){try{const b=contents.get(descriptor?.id);return !!b&&b.byteLength===descriptor.byteLength&&sha256(b)===descriptor.sha256&&canonicalJson(metadata.get(descriptor.id))===canonicalJson(descriptor);}catch{return false;}},
  get byteLength(){return total;},
  clear(){contents.clear();metadata.clear();total=0;}
 });
}
export function createBundle(artifacts,hints={}){
 if(!Array.isArray(artifacts)||!artifacts.length||artifacts.length>128)fail('BUNDLE_INVALID');
 const paths=new Set(),ids=new Set();
 for(const a of artifacts){if(!validPath(a?.logicalPath)||paths.has(a.logicalPath.toLowerCase())||ids.has(a.id)||!validId(a.id)||!/^[a-f0-9]{64}$/.test(a.sha256)||!Number.isSafeInteger(a.byteLength)||a.byteLength<0)fail('BUNDLE_INVALID');paths.add(a.logicalPath.toLowerCase());ids.add(a.id);}
 if(Object.keys(hints).some(k=>!['gameIdentity','platform','build','locale'].includes(k))||Object.values(hints).some(v=>typeof v!=='string'||v.length>200))fail('BUNDLE_HINTS_INVALID');
 const sorted=artifacts.map(a=>({...a})).sort((a,b)=>a.logicalPath.localeCompare(b.logicalPath));
 return cloneBundle(createSaveBundle(sorted,{id:'bundle:'+sha256(canonicalJson({artifacts:sorted,hints})),hints}));
}
const cloneBundle=value=>JSON.parse(canonicalJson(value));
export function verifyBundle(bundle,store){
 try{return createBundle(bundle.artifacts,bundle.hints).bundleDigest===bundle.bundleDigest&&bundle.artifacts.every(a=>store.verify(a));}catch{return false;}
}
