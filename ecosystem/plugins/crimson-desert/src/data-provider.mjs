// SPDX-License-Identifier: Apache-2.0
// Provider contents are separate artifacts. No art, donor save, or restricted
// catalog is silently redistributed with the executable connector.
import {hash} from '../../../sdk/crypto.mjs';
import {Buffer} from '../../../sdk/buffer.mjs';
const CURRENT='8427f58057ea9bf6dac35bc139cba163ddb135cfe89d748a2d36b94eec88d668';
const stores=new Map();let installed=false;
function neutral(id){
 const zero='0'.repeat(64),manifest={revision:'numeric-fallback.v1',effectiveSha256:zero,upstreamSha256:zero,recipeSha256:zero,catalogRevision:'numeric-fallback.v1:'+zero,compatibleSchemaSha256:[CURRENT],titleId:'1754076455',displayOnly:true,permission:'provider_unavailable'};
 const value={schema:'saverift.missing-data-provider.v1',revision:'numeric-fallback.v1',manifest,items:[],equipment:[],companions:[],systemCharacters:[],entries:[],unavailable:[],balanceDefinitions:[],columns:[],runtimeRequirements:{},source:{state:'provider_unavailable'},nativeSchema:{schemaSha256:CURRENT,types:{}},schemaSha256:CURRENT,templates:[],schemas:{},nativeTypes:{},newFieldsOmittedByType:{},types:{},targets:{},selection:{},assets:[],curatedAssets:[],coverage:{},packs:[],presets:[],characters:[],chapterPairs:[],profiles:[],sourceType:'normalized_reference_summary',rawSaveIncluded:false,accountIdentifiersIncluded:false,titleId:'1754076455',starter:null};
 if(id==='crimson-adventure-display.json')value.manifest={...manifest,skillOwnerMapping:'unverified',unlockMapping:'unverified',mapCoordinateMapping:'unverified'};
 return value;
}
export function getData(id){const stored=stores.get(id);if(!stored)return neutral(id);if(!stored.value){const bytes=stored.bytes??Buffer.from(stored.read());if(bytes.length!==stored.byteLength||!stored.verified&&hash(bytes)!==stored.sha256)throw Object.assign(new Error('Reference artifact bytes changed.'),{code:'DATA_PROVIDER_DIGEST_MISMATCH'});stored.value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));stored.bytes=null;stored.read=null;}return stored.value;}
export function dataProviderStatus(){return {schema:'saverift.crimson-provider-status.v1',providers:[...stores].map(([id,p])=>({id,sha256:p.sha256,byteLength:p.byteLength,distribution:p.distribution})),fallback:!stores.size};}
export function configureDataProviders(providers=[],{expected=[],synthetic=false,verifiedArtifacts=[]}={}){
 if(installed)throw Object.assign(new Error('Data providers are immutable for this isolated session.'),{code:'DATA_PROVIDER_ALREADY_BOUND'});
 const pins=new Map(expected.map(x=>[x.id,x]));
 for(const provider of providers){
  const {id}=provider;if(typeof id!=='string'||!/^[a-z0-9-]+\.json$/.test(id)||stores.has(id))throw Object.assign(new Error('Duplicate or invalid data provider.'),{code:'DATA_PROVIDER_INVALID'});
  const bytes=provider.bytes?Buffer.from(provider.bytes):null,byteLength=bytes?.length??provider.byteLength,verified=verifiedArtifacts.find(a=>a.id===provider.artifactId&&a.sha256===provider.sha256&&a.byteLength===byteLength),sha256=verified?verified.sha256:bytes?hash(bytes):null,pin=pins.get(id);
  if(!Number.isSafeInteger(byteLength)||byteLength>4*1024*1024||sha256!==provider.sha256||(!bytes&&(!verified||typeof provider.read!=='function'))||(!synthetic&&(!pin||pin.sha256!==sha256||pin.byteLength!==byteLength)))throw Object.assign(new Error('The data provider does not match its immutable pin.'),{code:'DATA_PROVIDER_DIGEST_MISMATCH'});
  // JSON is parsed only if a game subsystem asks for this provider. Preset
  // summaries and companion templates are not retained merely to read a save.
  stores.set(id,{bytes,read:provider.read,verified:Boolean(verified),value:null,sha256,byteLength,distribution:synthetic?'synthetic_test_only':'restricted_pending_review'});
 }
 installed=true;return dataProviderStatus();
}
