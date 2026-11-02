// SPDX-License-Identifier: Apache-2.0
// Explicit local import recipe. It reads user-supplied reference JSON only;
// it neither fetches websites nor grants redistribution/entitlement rights.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {validatePackage,digest} from '../../../sdk/contracts.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function importCrimsonReferenceData(sourceDirectory,{optional=[]}={}){
 const requirements=JSON.parse(await readFile(new URL('../data/provider-requirements.json',import.meta.url),'utf8')),providers=[];
 for(const pin of requirements.dataFiles){
  if(!pin.sha256)continue;
  let bytes;try{bytes=await readFile(resolve(sourceDirectory,pin.id));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(bytes.length!==pin.byteLength||hash(bytes)!==pin.sha256)throw Object.assign(new Error('Reference data changed: '+pin.id),{code:'DATA_PROVIDER_DIGEST_MISMATCH'});
  JSON.parse(bytes.toString('utf8'));providers.push({id:pin.id,bytes,sha256:pin.sha256,byteLength:bytes.length,distribution:'restricted_pending_review'});
 }
 for(const value of optional){if(!['crimson-adventure-display.json','crimson-preset-reference-pins.json','crimson-pack-artwork.json','crimson-pack-presentation.json'].includes(value.id)||providers.some(x=>x.id===value.id))throw Error('Unknown or duplicate optional provider.');const bytes=Buffer.from(JSON.stringify(value.data));providers.push({id:value.id,bytes,sha256:hash(bytes),byteLength:bytes.length,distribution:'restricted_pending_review'});}
 return {schema:'saverift.crimson-local-data-import.v1',providers,redistributionApproved:false,entitlementsEstablished:false};
}
export function providerArtifacts(imported){return imported.providers.map(p=>({id:'reference:'+p.id,logicalPath:'data/'+p.id,role:'reference-data',byteLength:p.byteLength,sha256:p.sha256}));}
export function packageReferenceData(imported){
 const resources=imported.providers.map(p=>({id:p.id,path:'resources/'+p.id,sha256:p.sha256,byteLength:p.byteLength})).sort((a,b)=>a.id.localeCompare(b.id));
 const manifest={manifestVersion:'0.1',kind:'data',id:'saverift.crimson-reference-data',version:'0.1.0-private.'+digest(resources).slice(0,12),hostApi:'>=0.1.0 <0.2.0',license:'Restricted-Pending-Redistribution-Review',data:{resources},provenance:{source:'explicit_local_import_recipe',redistributionApproved:false,entitlementsEstablished:false}};
 const files=Object.fromEntries(imported.providers.map(p=>['resources/'+p.id,new Uint8Array(p.bytes)])),checked=validatePackage({manifest,files});return {manifest,files,packageDigest:checked.packageDigest};
}
export function providerLockPins(imported){const p=packageReferenceData(imported);return [{id:p.manifest.id,version:p.manifest.version,digest:p.packageDigest}];}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const source=process.argv[2];if(!source)throw Error('Pass the local directory of reference JSON files you are permitted to use.');const imported=await importCrimsonReferenceData(resolve(source));process.stdout.write(JSON.stringify({schema:imported.schema,providers:imported.providers.map(({bytes,...p})=>p),redistributionApproved:false,entitlementsEstablished:false},null,2)+'\n');
}
