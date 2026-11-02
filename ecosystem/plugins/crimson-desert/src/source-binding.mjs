// SPDX-License-Identifier: Apache-2.0
// Format-local artifact checks only. Ownership, account, cloud revisions,
// entitlement and publication authority are independently enforced by the host.
import {Buffer} from '../../../sdk/buffer.mjs';
import {hash} from '../../../sdk/crypto.mjs';
export {hash};
export class ProbeError extends Error{constructor(message,status=409,code='CRIMSON_SOURCE_INVALID'){super(message);this.name='CrimsonOperationError';this.status=status;this.code=code;}}
const digest=/^[a-f0-9]{64}$/;
// Only this module's deeply frozen, byte-verified projections may skip repeating
// a base64 decode and digest. Caller-provided/cloned objects always take the full
// verification path. The set belongs to one isolated engine, not an account cache.
const verifiedSources=new WeakSet(),sourceContexts=new WeakMap(),sourceBytes=new WeakMap(),preparedSources=new WeakMap(),nativeParityWitnesses=new WeakMap();
export function verifyBackup(source){
 if(verifiedSources.has(source))return true;
 if(source?.schema!=='saverift.crimson-artifact-source.v1'||source.source!=='plugin_bundle'||!Array.isArray(source.containers)||source.containers.length>128)return false;
 let total=0,count=0;const seen=new Set();
 try{for(const c of source.containers){if(typeof c.index?.fileName!=='string'||seen.has(c.index.fileName)||!Array.isArray(c.blobs))return false;seen.add(c.index.fileName);const names=new Set();for(const b of c.blobs){const bytes=Buffer.from(b.data,'base64');if(names.has(b.name)||bytes.length!==b.size||bytes.length>8*1024*1024||bytes.toString('base64')!==b.data||hash(bytes)!==b.sha256)return false;names.add(b.name);total+=bytes.length;count++;}}}catch{return false;}
 return total===source.totalBytes&&count===source.blobCount&&total<=8*1024*1024;
}
export function assertSourceBinding(source,metadata,input){
 if(!verifyBackup(source)||metadata?.complete!==true||typeof metadata.id!=='string'||!metadata.id||!digest.test(metadata.sha256||'')||!digest.test(source.revision||''))throw new ProbeError('Selected artifact bytes are incomplete or changed.',409,'CRIMSON_ARTIFACT_SOURCE_INVALID');
 if(input&&(input.backupSha256!==metadata.sha256||input.backupRevision!==source.revision))throw new ProbeError('The plan belongs to another artifact bundle.',409,'CRIMSON_ARTIFACT_SOURCE_CHANGED');
 return source;
}
export function assertOfflineDraftCapability({schemaSha256,saveVersion,payload}){if(!digest.test(schemaSha256||'')||saveVersion!==2||payload!=='save')throw new ProbeError('This format cannot be compiled.',409,'CRIMSON_FORMAT_CAPABILITY_UNSUPPORTED');}
export function sourceFromBundle(bundle,ctx,{lazy=false}={}){
 if(typeof bundle?.id!=='string'||!bundle.id||!digest.test(bundle.bundleDigest||'')||!Array.isArray(bundle.artifacts))throw new ProbeError('Selected artifact bundle metadata is invalid.',409,'CRIMSON_ARTIFACT_SOURCE_INVALID');
 const ids=new Map(),selected=[];
 for(const entry of bundle.artifacts){
  const artifact=Object.freeze({...entry});
  if(['reference-data','preset-source'].includes(artifact.role))continue;
  const parts=artifact.logicalPath.split('/'),name=artifact.role==='main'||artifact.role==='save'?'save':artifact.role==='sidecar'||artifact.role==='lobby'?'lobby':parts.at(-1);
  if(!['save','lobby'].includes(name))continue;
  const container=parts.length>1?parts.slice(0,-1).join('/'):bundle.hints?.container||'slot100,savedgame',key=container+'/'+name;
  if(!/^slot\d{1,3},savedgame$/.test(container))throw new ProbeError('The selected game file mapping is unsupported.',409,'CRIMSON_CONTAINER_MAPPING_UNSUPPORTED');
  if(ids.has(key)||!Number.isSafeInteger(artifact.byteLength)||artifact.byteLength<0||artifact.byteLength>8*1024*1024||!digest.test(artifact.sha256||''))throw new ProbeError('Selected artifact descriptors are incomplete or duplicate.',409,'CRIMSON_ARTIFACT_SOURCE_INVALID');
  ids.set(key,artifact);selected.push({artifact,container,name});
 }
 const metadata=Object.freeze({id:bundle.id,complete:true,sha256:bundle.bundleDigest});let source;
 function materialize(){
  if(source)return source;
  const grouped=new Map(),encoded=new Map();let totalBytes=0,blobCount=0;
  for(const {artifact,container,name}of selected){
   const bytes=Buffer.from(ctx.readArtifact(artifact.id));if(bytes.length!==artifact.byteLength||hash(bytes)!==artifact.sha256)throw new ProbeError('Selected artifact bytes changed.',409,'CRIMSON_ARTIFACT_SOURCE_CHANGED');
   encoded.set(container+'/'+name,bytes);
   totalBytes+=bytes.length;blobCount++;if(totalBytes>8*1024*1024)throw new ProbeError('Selected artifact bytes exceed the format-source limit.',409,'CRIMSON_ARTIFACT_SOURCE_INVALID');
   let encodedText;
   const row=Object.freeze({name,size:bytes.length,get data(){return encodedText??=bytes.toString('base64');},sha256:artifact.sha256,artifactId:artifact.id}),c=grouped.get(container)||{index:Object.freeze({fileName:container}),blobs:[]};c.blobs.push(row);grouped.set(container,c);
  }
  if(grouped.size>128)throw new ProbeError('Selected artifact containers exceed the format-source limit.',409,'CRIMSON_ARTIFACT_SOURCE_INVALID');
  const containers=Object.freeze([...grouped.values()].map(c=>Object.freeze({...c,blobs:Object.freeze(c.blobs)})));
  const result=Object.freeze({schema:'saverift.crimson-artifact-source.v1',source:'plugin_bundle',revision:metadata.sha256,containers,totalBytes,blobCount});
  // Construction checked the original selected bytes and all projection counts;
  // the immutable base64 string cannot change before a compiler uses it.
  verifiedSources.add(result);sourceContexts.set(result,ctx);sourceBytes.set(result,encoded);assertSourceBinding(result,metadata);source=result;return source;
 }
 const result={metadata,ids,get source(){return materialize();}};
 if(!lazy)materialize();return result;
}

// Internal primary-connector reuse. A JSON request or cloned source cannot
// manufacture the verified source/context identity required by this map.
export function bindPreparedSource(source,metadata,{context,container,payload,payloadSha256,decoded,document,projection}){
 assertSourceBinding(source,metadata);
 const blob=source.containers.find(c=>c.index.fileName===container)?.blobs.find(b=>b.name===payload);
 if(!verifiedSources.has(source)||sourceContexts.get(source)!==context||!blob||blob.sha256!==payloadSha256||document?.plaintext!==decoded?.plaintext||!Buffer.isBuffer(decoded?.plaintext)||!Buffer.isBuffer(decoded?.header)||decoded.header.length!==128||!digest.test(document?.plaintextSha256||'')||!digest.test(document?.schemaSha256||''))throw new ProbeError('Prepared format source is not this verified snapshot.',409,'CRIMSON_PREPARED_SOURCE_INVALID');
 // The byte buffer remains private to this engine's connector/compiler. It was
 // copied and hashed during projection construction; the compiler never writes
 // into it. Re-decoding its frozen base64 representation would add no evidence.
 const encoded=sourceBytes.get(source)?.get(container+'/'+payload);
 if(!encoded||encoded.length!==blob.size)throw new ProbeError('Prepared format bytes are unavailable.',409,'CRIMSON_PREPARED_SOURCE_INVALID');
 preparedSources.set(source,Object.freeze({context,executionLock:context.executionLock,lockBinding:JSON.stringify(context.executionLock??null),lockDigest:context.executionLock?.digest,metadata,revision:source.revision,container,payload,payloadSha256,encoded,decoded,document,projection,plaintextSha256:document.plaintextSha256,schemaSha256:document.schemaSha256,headerSha256:hash(decoded.header),version:decoded.version,flags:decoded.flags}));
}
export function preparedSource(source,metadata,input){
 const snapshot=preparedSources.get(source);
 if(!snapshot)return null;
 assertSourceBinding(source,metadata,input);
 if(!verifiedSources.has(source)||snapshot.context!==sourceContexts.get(source)||snapshot.executionLock!==snapshot.context.executionLock||snapshot.lockBinding!==JSON.stringify(snapshot.context.executionLock??null)||snapshot.lockDigest!==snapshot.context.executionLock?.digest||snapshot.revision!==source.revision||snapshot.container!==input.container||snapshot.payload!==input.payload||snapshot.payloadSha256!==input.payloadSha256||snapshot.document.plaintextSha256!==snapshot.plaintextSha256||snapshot.document.schemaSha256!==snapshot.schemaSha256||snapshot.plaintextSha256!==input.plaintextSha256||snapshot.schemaSha256!==input.schemaSha256)throw new ProbeError('Prepared format source belongs to a different snapshot.',409,'CRIMSON_PREPARED_SOURCE_CHANGED');
 return snapshot;
}

// Reuse only a native no-op proof of this engine's exact original snapshot.
// Callers still perform their own scope checks and independently reopen output.
// No serialized flag, digest alone, cloned projection or other encoder can
// create a cache hit. The encoder dependency is internal compiled code only.
export async function preparedSourceNativeParity(source,metadata,input,decoded,encoded,encoder){
 if(typeof encoder!=='function')throw TypeError('A native format encoder is required.');
 const snapshot=preparedSource(source,metadata,input);
 const changed=()=>{throw new ProbeError('The original format bytes changed before native verification.',409,'CRIMSON_PREPARED_SOURCE_CHANGED');};
 function integrity(){
  if(!snapshot)assertSourceBinding(source,metadata,input);
  if(!Buffer.isBuffer(encoded)||encoded.length<128||!Buffer.isBuffer(decoded?.plaintext)||!Buffer.isBuffer(decoded?.header)||decoded.header.length!==128)changed();
  const encodedSha256=hash(encoded),plaintextSha256=hash(decoded.plaintext),headerSha256=hash(decoded.header),version=decoded.version,flags=decoded.flags;
  if(encodedSha256!==input.payloadSha256||plaintextSha256!==input.plaintextSha256||!decoded.header.equals(encoded.subarray(0,128))||version!==decoded.header.readUInt16LE(4)||flags!==decoded.header.readUInt16LE(6))changed();
  if(snapshot&&(preparedSource(source,metadata,input)!==snapshot||encodedSha256!==snapshot.payloadSha256||plaintextSha256!==snapshot.plaintextSha256||headerSha256!==snapshot.headerSha256||version!==snapshot.version||flags!==snapshot.flags))changed();
  return {encodedSha256,plaintextSha256,headerSha256,version,flags};
 }
 const before=integrity(),cacheable=snapshot&&snapshot.metadata===metadata&&snapshot.decoded===decoded&&snapshot.encoded===encoded&&snapshot.document.plaintext===decoded.plaintext,witness=cacheable&&nativeParityWitnesses.get(snapshot);
 if(witness&&witness.encoder===encoder&&Object.keys(before).every(key=>before[key]===witness[key]))return true;
 const result=await encoder(decoded.plaintext,decoded.header,{nonce:decoded.header.subarray(0x1a,0x2a)});
 const after=integrity();if(Object.keys(before).some(key=>before[key]!==after[key]))changed();
 if(!Buffer.isBuffer(result)||!result.equals(encoded))return false;
 if(cacheable)nativeParityWitnesses.set(snapshot,Object.freeze({...after,encoder}));
 return true;
}
