// SPDX-License-Identifier: Apache-2.0
import {sha256,canonicalJson} from './crypto.mjs';
import {validatePackage} from './contracts.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const copy=v=>JSON.parse(canonicalJson(v));
function pin(value){if(!value||typeof value.id!=='string'||!value.id.includes('.')||typeof value.version!=='string'||!digest(value.digest))fail('REGISTRY_PIN_INVALID');return {id:value.id,version:value.version,digest:value.digest};}
export function createExecutionLock({connector,extensions=[],dataPacks=[],hostApi='0.1.0',runnerProfile='isolated-js-v1'}){
 const base={schema:'saverift.execution-lock.v1',connector:pin(connector),extensions:extensions.map(pin).sort((a,b)=>a.id.localeCompare(b.id)),dataPacks:dataPacks.map(pin).sort((a,b)=>a.id.localeCompare(b.id)),hostApi,runnerProfile};
 const ids=[base.connector,...base.extensions,...base.dataPacks].map(x=>x.id);if(new Set(ids).size!==ids.length||hostApi!=='0.1.0'||runnerProfile!=='isolated-js-v1')fail('EXECUTION_LOCK_INVALID');
 return {...base,digest:sha256(canonicalJson(base))};
}
export function verifyExecutionLock(lock){try{const normalized=createExecutionLock(lock);return canonicalJson(normalized)===canonicalJson(lock);}catch{return false;}}
/** Resolve public domain APIs from exact packages rather than private host knowledge. */
export function validateExecutionPackages(lock,packages){
 if(!verifyExecutionLock(lock)||!Array.isArray(packages))fail('EXECUTION_LOCK_INVALID');
 const byId=new Map();for(const input of packages){const p=validatePackage(input);if(byId.has(p.manifest.id))fail('PACKAGE_DUPLICATE');byId.set(p.manifest.id,p);}
 const apis=new Map(),pins=[lock.connector,...lock.extensions,...lock.dataPacks];
 for(const pin of pins){const pkg=byId.get(pin.id);if(!pkg||pkg.packageDigest!==pin.digest||pkg.manifest.version!==pin.version)fail('DEPENDENCY_MISMATCH');if(pkg.manifest.hostApi&&!['0.1.0','>=0.1.0 <0.2.0'].includes(pkg.manifest.hostApi))fail('HOST_API_UNSUPPORTED');for(const [name,version] of Object.entries(pkg.manifest.extensionApis||{})){if(apis.has(name))fail('DOMAIN_API_AMBIGUOUS');apis.set(name,version);}}
 const game=byId.get(lock.connector.id);if(game.manifest.kind!=='game')fail('CONNECTOR_KIND_INVALID');
 for(const pin of lock.extensions){const ext=byId.get(pin.id);if(ext.manifest.kind!=='extension')fail('EXTENSION_KIND_INVALID');for(const [api,version] of Object.entries(ext.manifest.dependencies||{}))if(apis.get(api)!==version)fail('DOMAIN_API_MISMATCH');}
 if(packages.length!==pins.length)fail('UNPINNED_PACKAGE');return {executionLockDigest:lock.digest,domainApis:Object.fromEntries(apis)};
}
/** Authority lives in the configured verifier/reviewer, never a manifest flag. */
export function createRegistry({verifyAttestation}={}){
 const records=new Map(),active=new Map();let epoch=0;
 return Object.freeze({
  async add(pkg,{attestation,review}={}){
   const checked=validatePackage(pkg),d=checked.packageDigest;
   if(!review||review.result!=='approved'||typeof review.reference!=='string'||!review.reference||typeof verifyAttestation!=='function'||!await verifyAttestation({digest:d,manifest:pkg.manifest,attestation}))fail('REGISTRY_REVIEW_REQUIRED');
   const key=pkg.manifest.id+'@'+pkg.manifest.version,old=records.get(key);if(old&&old.digest!==d)fail('REGISTRY_IMMUTABLE_VERSION');
   if(old?.revoked)fail('REGISTRY_REVOKED');
   const record={...pin({id:pkg.manifest.id,version:pkg.manifest.version,digest:d}),review:copy(review),revoked:false,revocation:null};
   records.set(key,record);return copy(record);
  },
  promote(exactPin){const p=pin(exactPin),r=records.get(p.id+'@'+p.version);if(!r||r.digest!==p.digest||r.revoked)fail('REGISTRY_UNAVAILABLE');active.set(p.id,p.version);epoch++;return copy(r);},
  resolve(id,{version}={}){const v=version??active.get(id),r=records.get(id+'@'+v);if(!r||r.revoked)fail('REGISTRY_UNAVAILABLE');return copy(r);},
  assertLock(lock){if(!verifyExecutionLock(lock))fail('EXECUTION_LOCK_INVALID');for(const p of [lock.connector,...lock.extensions,...lock.dataPacks]){const r=records.get(p.id+'@'+p.version);if(!r||r.digest!==p.digest||r.revoked)fail('REGISTRY_UNAVAILABLE');}return {registryEpoch:epoch,executionLockDigest:lock.digest};},
  revoke(exactPin,{reason,incident}={}){const p=pin(exactPin),r=records.get(p.id+'@'+p.version);if(!r||r.digest!==p.digest||typeof reason!=='string'||!reason||typeof incident!=='string'||!incident)fail('REGISTRY_REVOCATION_INVALID');r.revoked=true;r.revocation={reason,incident};if(active.get(p.id)===p.version)active.delete(p.id);epoch++;return copy(r);},
  get epoch(){return epoch;}
 });
}
