import {Buffer} from './buffer.mjs';
import {hash,canonicalJson} from './crypto.mjs';
export {hash} from './crypto.mjs';

export const SDK_VERSION='0.1.0';
export const RUNTIME_PROFILE='isolated-js-v1';
export const LIFECYCLE=Object.freeze(['detect','open','describe','query','plan','validate','close']);
export const LIMITS=Object.freeze({packageBytes:32*1024*1024,packageFiles:2048,sourceBytes:8*1024*1024,artifactBytes:8*1024*1024,totalArtifactBytes:24*1024*1024,outputBytes:24*1024*1024,outputArtifacts:32,jsonBytes:256*1024,memoryBytes:64*1024*1024,heapBytes:48*1024*1024,stackBytes:256*1024,interrupts:100000,timeoutMs:10000,pendingJobs:10000,hostCalls:4096});
export class PluginError extends Error{constructor(code,message){super(message);this.name='PluginError';this.code=code;}}
export const fail=(code,message)=>{throw new PluginError(code,message);};
export const canonical=canonicalJson;
export const digest=value=>hash(canonical(value));
export function jsonCopy(value,max=LIMITS.jsonBytes){const text=canonical(value);if(Buffer.byteLength(text)>max)fail('JSON_LIMIT','The wire value exceeds the JSON limit.');return JSON.parse(text);}
export function logicalPath(path){if(typeof path!=='string'||!path||path.length>240||path.startsWith('/')||path.includes('\\')||path.split('/').some(x=>!x||x==='.'||x==='..')||/[\u0000-\u001f\u007f:]/.test(path))fail('PACKAGE_PATH_INVALID','A package path is invalid.');return path;}
export function artifactBytes(value){if(!(value instanceof Uint8Array))fail('ARTIFACT_INVALID','Artifacts must use the binary channel.');return new Uint8Array(value);}
export function validateOperation(value){if(!value||typeof value.id!=='string'||!value.id.includes('.')||typeof value.apiVersion!=='string'||!Object.hasOwn(value,'params'))fail('OPERATION_INVALID','Operations require namespaced id, apiVersion and params.');return jsonCopy(value);}
export function validatePackage(input,limits=LIMITS){
  if(!input||!input.manifest||!input.files||typeof input.files!=='object')fail('PACKAGE_INVALID','Package manifest and immutable files are required.');
  const manifest=jsonCopy(input.manifest),kind=manifest.kind||'game',executable=['game','extension'].includes(kind),entry=executable?logicalPath(manifest.entrypoints?.runtime):null;
  if(!['game','extension','data','assets','preset','ui'].includes(kind)||manifest.manifestVersion!=='0.1'||typeof manifest.id!=='string'||!manifest.id.includes('.')||typeof manifest.version!=='string'||(executable&&manifest.entrypoints.runtimeProfile!==RUNTIME_PROFILE)||(!executable&&manifest.entrypoints?.runtime))fail('MANIFEST_INVALID','The package manifest or runtime profile is unsupported.');
  if(manifest.methods!==undefined&&(!Array.isArray(manifest.methods)||manifest.methods.length>64||new Set(manifest.methods).size!==manifest.methods.length||manifest.methods.some(x=>typeof x!=='string'||!/^[A-Za-z][A-Za-z0-9_.:-]{0,95}$/.test(x))))fail('MANIFEST_INVALID','Custom runtime methods are invalid.');
  const entries=input.files instanceof Map?[...input.files]:Object.entries(input.files);if(!entries.length||entries.length>limits.packageFiles)fail('PACKAGE_LIMIT','The package file count is outside the limit.');
  const seen=new Set(),files=new Map(),descriptors=[];let total=0;
  for(const [name,value] of entries){logicalPath(name);const folded=name.toLowerCase();if(seen.has(folded))fail('PACKAGE_DUPLICATE','Duplicate or case-colliding package paths are forbidden.');seen.add(folded);
    const data=typeof value==='string'?Buffer.from(value):artifactBytes(value);total+=data.length;if(total>limits.packageBytes)fail('PACKAGE_LIMIT','The expanded package exceeds its byte limit.');
    if(/\.(?:mjs|js)$/.test(name)&&data.length>limits.sourceBytes)fail('SOURCE_LIMIT','An executable module exceeds its source limit.');files.set(name,new Uint8Array(data));descriptors.push({path:name,byteLength:data.length,sha256:hash(data)});
  }
  if(executable&&(!files.has(entry)||!/\.(?:mjs|js)$/.test(entry)))fail('ENTRYPOINT_INVALID','The runtime entrypoint must be a packaged JavaScript module.');
  descriptors.sort((a,b)=>a.path.localeCompare(b.path));const packageDigest=digest({manifest,files:descriptors});
  if(input.packageDigest&&input.packageDigest!==packageDigest)fail('PACKAGE_DIGEST_MISMATCH','The immutable package digest does not match.');
  return {manifest:Object.freeze(manifest),files,packageDigest,descriptors:Object.freeze(descriptors),byteLength:total};
}
export function createSaveBundle(artifacts,{id='bundle',hints={}}={}){
  if(!Array.isArray(artifacts)||artifacts.length>128||typeof id!=='string'||!id||id.length>128)fail('BUNDLE_INVALID','Bounded bundle identity and artifacts are required.');
  const allowedHints=new Set(['gameIdentity','platform','build','locale']);if(Object.keys(hints).some(k=>!allowedHints.has(k)||typeof hints[k]!=='string'||hints[k].length>160))fail('BUNDLE_INVALID','Only minimal public game hints may enter a bundle.');
  const seen=new Set(),descriptors=artifacts.map(x=>{if(typeof x.id!=='string'||!x.id||x.id.length>128||seen.has(x.id))fail('BUNDLE_INVALID','Artifact handles must be unique.');seen.add(x.id);logicalPath(x.logicalPath);if(!Number.isSafeInteger(x.byteLength)||x.byteLength<0||!/^[0-9a-f]{64}$/.test(x.sha256)||(x.role!==undefined&&(typeof x.role!=='string'||!x.role||x.role.length>64)))fail('BUNDLE_INVALID','Artifact metadata is invalid.');return {id:x.id,logicalPath:x.logicalPath,role:x.role||'main',byteLength:x.byteLength,sha256:x.sha256};});
  const content={id,artifacts:descriptors,hints:jsonCopy(hints)};return Object.freeze({...content,bundleDigest:digest(content)});
}
