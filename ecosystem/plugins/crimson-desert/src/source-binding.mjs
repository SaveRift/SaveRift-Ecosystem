// SPDX-License-Identifier: Apache-2.0
// Format-local artifact checks only. Ownership, account, cloud revisions,
// entitlement and publication authority are independently enforced by the host.
import {Buffer} from '../../../sdk/buffer.mjs';
import {hash} from '../../../sdk/crypto.mjs';
export {hash};
export class ProbeError extends Error{constructor(message,status=409,code='CRIMSON_SOURCE_INVALID'){super(message);this.name='CrimsonOperationError';this.status=status;this.code=code;}}
const digest=/^[a-f0-9]{64}$/;
export function verifyBackup(source){
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
export function sourceFromBundle(bundle,ctx){
 const grouped=new Map(),ids=new Map();
 for(const artifact of bundle.artifacts){
  if(['reference-data','preset-source'].includes(artifact.role))continue;
  const parts=artifact.logicalPath.split('/'),name=artifact.role==='main'||artifact.role==='save'?'save':artifact.role==='sidecar'||artifact.role==='lobby'?'lobby':parts.at(-1);
  if(!['save','lobby'].includes(name))continue;
  const container=parts.length>1?parts.slice(0,-1).join('/'):bundle.hints?.container||'slot100,savedgame';
  if(!/^slot\d{1,3},savedgame$/.test(container))throw new ProbeError('The selected game file mapping is unsupported.',409,'CRIMSON_CONTAINER_MAPPING_UNSUPPORTED');
  const bytes=Buffer.from(ctx.readArtifact(artifact.id));if(bytes.length!==artifact.byteLength||hash(bytes)!==artifact.sha256)throw new ProbeError('Selected artifact bytes changed.',409,'CRIMSON_ARTIFACT_SOURCE_CHANGED');
  const row={name,size:bytes.length,data:bytes.toString('base64'),sha256:artifact.sha256,artifactId:artifact.id},c=grouped.get(container)||{index:{fileName:container},blobs:[]};c.blobs.push(row);grouped.set(container,c);ids.set(`${container}/${name}`,artifact);
 }
 const containers=[...grouped.values()],source={schema:'saverift.crimson-artifact-source.v1',source:'plugin_bundle',revision:bundle.bundleDigest,containers,totalBytes:containers.reduce((n,c)=>n+c.blobs.reduce((m,b)=>m+b.size,0),0),blobCount:containers.reduce((n,c)=>n+c.blobs.length,0)};
 const metadata={id:bundle.id,complete:true,sha256:bundle.bundleDigest};assertSourceBinding(source,metadata);return {source,metadata,ids};
}
