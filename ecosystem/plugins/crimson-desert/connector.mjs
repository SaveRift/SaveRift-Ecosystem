// SPDX-License-Identifier: MPL-2.0
// The game package returns candidate artifacts. It has no Microsoft/Xbox API,
// credentials, owner cookies, lock capability or account storage enumeration.
import {Buffer} from '../../sdk/buffer.mjs';
import {hash,canonicalJson} from '../../sdk/crypto.mjs';
import {installTextEncoding} from '../../sdk/text-encoding.mjs';
import {compileSchema} from '../../sdk/schema.mjs';
import manifest from './manifest.json' with {type:'json'};
import {configureDataProviders,dataProviderStatus,getData} from './src/data-provider.mjs';
import {sourceFromBundle,bindPreparedSource} from './src/source-binding.mjs';
installTextEncoding();
if(typeof globalThis.structuredClone!=='function')globalThis.structuredClone=value=>JSON.parse(JSON.stringify(value));
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const states=new Map();let initialized=false,runtime,cachedOpen;
const operationValidators=new Map();
const operationNames=['inventory.setQuantity','inventory.setCopper','inventory.setExpansionValue','inventory.addItem','companions.add','cartography.reveal-map','cartography.unlock-nexus','preset.replaceAdventure','document.patchFixedWidth'];
async function load(bundle,ctx){
 if(!initialized){
  const providers=[],expected=[];
  for(const a of bundle.artifacts.filter(a=>a.role==='reference-data')){
   const id=a.logicalPath.split('/').at(-1),descriptor=ctx.catalogQuery({method:'saverift.data.resource',id,artifactId:a.id}),pin=(ctx.executionLock.dataPacks||[]).find(p=>p.id===descriptor?.package?.id&&p.version===descriptor.package.version&&p.digest===descriptor.package.digest);
   if(!pin||descriptor.resource?.sha256!==a.sha256||descriptor.resource?.byteLength!==a.byteLength||descriptor.resource?.id!==id)fail('DATA_PROVIDER_LOCK_REQUIRED','Every reference provider must resolve from a data package pinned by the execution lock.');
   providers.push({id,artifactId:a.id,sha256:a.sha256,byteLength:a.byteLength,read:()=>ctx.readArtifact(a.id)});expected.push({id,sha256:a.sha256,byteLength:a.byteLength});
  }
  configureDataProviders(providers,{expected,verifiedArtifacts:bundle.artifacts});initialized=true;
 }
 if(!runtime){
  const [codec,document]=await Promise.all([import('./src/crimson-codec.mjs'),import('./src/crimson-document.mjs')]);
  runtime={...codec,...document};
 }
 return runtime;
}
async function subsystem(name){
 const imports={domain:()=>import('./src/crimson-domain.mjs'),operations:()=>import('./src/mixed-draft.mjs'),packs:()=>import('./src/crimson-packs.mjs'),recipes:()=>import('./src/catalog/crimson-packs.mjs'),presets:()=>import('./src/preset-library.mjs'),upload:()=>import('./src/uploaded-save.mjs'),pair:()=>import('./src/preset-pair.mjs'),document:()=>import('./src/document-api.mjs')};
 const module=await imports[name]();Object.assign(runtime,module);return runtime;
}
async function inspectUploadedBundle(bundle,ctx){
 await load(bundle,ctx);
 const files=bundle.artifacts.filter(a=>!['reference-data','preset-source'].includes(a.role)).map(a=>({name:a.logicalPath.split('/').at(-1),dataBase64:Buffer.from(ctx.readArtifact(a.id)).toString('base64')})),report=await (await subsystem('upload')).inspectUploadedSaves({game:'crimson-desert',files});
 for(let index=0;index<report.files.length;index++){
  const file=report.files[index],copy=file.nativeCopy;if(!copy)continue;
  if(file.status!=='validated'||typeof copy.dataBase64!=='string')fail('CRIMSON_IMPORT_EXPORT_INVALID');
  const bytes=Buffer.from(copy.dataBase64,'base64');if(bytes.length!==copy.bytes||bytes.toString('base64')!==copy.dataBase64||hash(bytes)!==copy.sha256||!/^native-[A-Za-z0-9._ -]+\.save$/.test(copy.filename))fail('CRIMSON_IMPORT_EXPORT_INVALID');
  const artifact=ctx.writeArtifact({logicalPath:`exports/${index+1}-${copy.filename}`,role:'native-export'},bytes);
  if(artifact.byteLength!==copy.bytes||artifact.sha256!==copy.sha256||artifact.role!=='native-export')fail('CRIMSON_IMPORT_EXPORT_INVALID');
  // Only immutable metadata/handles cross the JSON wire. The legacy inspector
  // keeps its base64 return for the existing private UI compatibility path.
  file.nativeCopy={filename:copy.filename,bytes:copy.bytes,sha256:copy.sha256,artifact};
 }
 return {...report,nativeCopyDelivery:'binary_artifact'};
}
async function compilerFor(document,operations){
 const kind=operations.some(o=>o.operation.startsWith('cartography.'))?'mixed':operations.some(o=>['inventory.addItem','companions.add'].includes(o.operation))?'structural':'scalar',profiles=getData('crimson-schema-profiles.json').profiles,matching=profiles?.filter(p=>p.schemaSha256===document.schemaSha256)||[],scalar=await import('./src/crimson-draft.mjs');
 const schemas={mixed:'saveglass.mixed-draft-plan.v1',structural:'saveglass.structural-draft-plan.v1',scalar:'saveglass.crimson-draft-plan.v1'};
 if(matching.length>1||matching.length===1&&(typeof matching[0].requiresHousing!=='boolean'||!['synthetic_conformance','offline_reviewed'].includes(matching[0].evidence)))fail('CRIMSON_SCHEMA_PROFILE_INVALID');
 const pin=matching[0],scalarBase=pin?scalar.createCrimsonDraftCompiler({schemaPins:[{schemaSha256:pin.schemaSha256,requiresHousing:pin.requiresHousing}]}):null,scalarCompiler=scalarBase?(b,m,p,o)=>scalarBase(b,m,p,{...o,retainEncoded:true}):scalar.createWorkbenchDraft;
 // Scalar edits must not eagerly import companion templates, structural
 // constructors, cartography or preset reference bodies.
 if(kind==='scalar')return {schema:schemas.scalar,compile:scalarCompiler};
 const structure=await import('./src/structural-draft.mjs');
 if(!pin){if(kind==='mixed')await subsystem('operations');return {schema:schemas[kind],compile:kind==='mixed'?runtime.createMixedWorkbenchDraft:structure.createStructuralWorkbenchDraft};}
 const schemaPins=[pin.schemaSha256],item=await import('./src/crimson-item-addition.mjs'),items=item.createCatalogItemAddition({schemaPins}),companions=async(...args)=>(await import('./src/crimson-companion-addition.mjs')).createCompanionAdditions({schemaPins})(...args),structuralBase=structure.createStructuralDraftCompiler({schemaPins,scalarCompiler,itemCompiler:items.many,companionCompiler:companions}),structuralCompiler=(b,m,p,o)=>structuralBase(b,m,p,{...o,retainEncoded:true});
 if(kind==='structural')return {schema:schemas.structural,compile:structuralCompiler};
 const [map,nexus]=await Promise.all([import('./src/crimson-map-reveal.mjs'),import('./src/crimson-abyss-nexus.mjs')]);await subsystem('operations');
 const mixed=runtime.createMixedDraftCompiler({schemaPins,scalarCompiler,structuralCompiler,mapCompiler:map.createMapRevealPreview({schemaPins}),nexusCompiler:nexus.createAbyssNexusPreview({schemaPins})});
 return {schema:schemas.mixed,compile:(b,m,p,o)=>mixed(b,m,p,{...o,retainEncoded:true})};
}

function mainArtifact(bundle){const explicit=bundle.artifacts.filter(a=>['main','save'].includes(a.role)),rows=explicit.length?explicit:bundle.artifacts.filter(a=>!['reference-data','preset-source'].includes(a.role)&&a.logicalPath.split('/').at(-1)==='save');if(rows.length!==1)fail('CRIMSON_MAIN_AMBIGUOUS','Select exactly one main save.');return rows[0];}
async function opened(bundle,ctx){
 // SDK-selected bytes are immutable inside one isolated engine. Cache only the
 // exact serialized descriptor set in this same context, never across engines,
 // accounts, snapshots, changed hints, or a supplied digest alone.
 const binding=canonicalJson(bundle);
 if(cachedOpen?.context===ctx&&cachedOpen.binding===binding)return cachedOpen.value;
 cachedOpen=null;
 const r=await load(bundle,ctx),mapped=sourceFromBundle(bundle,ctx,{lazy:true}),a=mainArtifact(bundle),decoded=await r.decodeSave(Buffer.from(ctx.readArtifact(a.id))),document=r.readDocument(decoded.plaintext,{fieldListLimits:{'InventoryElementSaveData._itemList':1024,'MercenaryClanSaveData._mercenaryDataList':1000}}),domains=(await subsystem('domain')).normalizeCrimson(document,{saveVersion:decoded.version}),container=[...mapped.ids].find(([,d])=>d.id===a.id)?.[0].replace(/\/save$/,'');
 // Read-only inspection needs no legacy base64 projection. A compiler asks for
 // it explicitly through this getter; construction still verifies every byte.
 const value={bundle,metadata:mapped.metadata,ids:mapped.ids,get source(){return mapped.source;},artifact:a,container,decoded,document,domains};
 cachedOpen={context:ctx,binding,value};return value;
}
async function compilerSnapshot(bundle,ctx,operations){
 // Ordinary plans need the inventory scalar projection, not a retained UI
 // document and normalized domains. Structural compilers build their own
 // complete semantic indexes; this reader still strictly walks every root.
 const r=await load(bundle,ctx),mapped=sourceFromBundle(bundle,ctx,{lazy:true}),artifact=mainArtifact(bundle),decoded=await r.decodeSave(Buffer.from(ctx.readArtifact(artifact.id))),structural=operations.some(o=>['inventory.addItem','companions.add'].includes(o.operation)),projection={captureTypes:['InventorySaveData',...(operations.some(o=>o.operation==='companions.add')?['MercenaryClanSaveData']:[])],fieldListLimits:{'InventoryElementSaveData._itemList':1024}},document=structural?(await import('./src/structural-draft.mjs')).prepareStructuralDocument(decoded.plaintext,operations):r.readDocument(decoded.plaintext,projection),container=[...mapped.ids].find(([,d])=>d.id===artifact.id)?.[0].replace(/\/save$/,'');
 await subsystem('domain');
 return {metadata:mapped.metadata,get source(){return mapped.source;},artifact,container,decoded,document,projection};
}

async function checkedEnvelope(bundle,ctx){
 sourceFromBundle(bundle,ctx,{lazy:true});
 const r=await load(bundle,ctx),artifact=mainArtifact(bundle),bytes=Buffer.from(ctx.readArtifact(artifact.id)),decoded=await r.decodeSave(bytes),document=r.readDocument(decoded.plaintext,{captureTypes:[],listLimit:0,hashPlaintext:false});
 return {artifact,bytes,decoded,schemaSha256:document.schemaSha256};
}

async function originalWitness(bundle,ctx){const source=await checkedEnvelope(bundle,ctx);return {header:source.decoded.header,schemaSha256:source.schemaSha256};}

const page=(rows,q={})=>{const offset=Number.isSafeInteger(q.offset)&&q.offset>=0?q.offset:0,limit=Number.isSafeInteger(q.limit)?Math.max(1,Math.min(q.limit,100)):35;return {records:rows.slice(offset,offset+limit),offset,limit,total:rows.length,hasMore:offset+limit<rows.length};};
function summary(s){return {schema:'saverift.crimson-open.v1',id:s.bundle.bundleDigest,container:s.container,artifact:s.artifact,saveVersion:s.decoded.version,schemaSha256:s.document.schemaSha256,plaintextSha256:s.document.plaintextSha256,decoderRevision:s.domains.decoderRevision,catalogRevision:s.domains.catalog.revisionId,inventoryRecords:s.domains.inventory.recordCount,companions:s.domains.companions.length,providers:dataProviderStatus(),liveAccount:false};}
function stateFor(handle){const s=states.get(handle?.id);if(!s)fail('CRIMSON_DOCUMENT_CLOSED','Open this save in the current isolated session.');return s;}
function plainOperation(op){
 if(op?.apiVersion!=='0.1.0'||typeof op.id!=='string'||!op.id.startsWith('crimson.')||!operationNames.includes(op.id.slice(8))||!op.params||typeof op.params!=='object'||Array.isArray(op.params)||Object.hasOwn(op.params,'operation'))fail('CRIMSON_OPERATION_UNSUPPORTED');
 let validator=operationValidators.get(op.id);if(!validator){const definition=manifest.operations.find(d=>d.id===op.id&&d.apiVersion===op.apiVersion);if(!definition?.inputSchema)fail('CRIMSON_OPERATION_SCHEMA_MISSING');validator=compileSchema(definition.inputSchema);operationValidators.set(op.id,validator);}if(!validator.validate(op.params))fail('CRIMSON_OPERATION_PARAMS_INVALID');
 return {operation:op.id.slice(8),...op.params};
}
const inspectChecks=()=>[{checkId:'crimson.integrity',result:'passed',required:true},{checkId:'crimson.full-typed-traversal',result:'passed',required:true},{checkId:'crimson.native-encode-reopen',result:'passed',required:true}];
export default {
 async detect(bundle,ctx){
  if(bundle.hints?.gameIdentity&& !['crimson-desert','1754076455','xbox.1754076455'].includes(bundle.hints.gameIdentity))return {state:'not_a_match'};
  let a;try{a=mainArtifact(bundle);}catch(e){return {state:'recognized_unsupported',reason:e.code};}
  const head=Buffer.from(ctx.readArtifact(a.id,{offset:0,length:Math.min(128,a.byteLength)}));if(head.subarray(0,4).toString()!=='SAVE')return {state:'not_a_match'};
  try{const s=await opened(bundle,ctx);return {state:'supported',family:'crimson-save-parc',saveVersion:s.decoded.version,schemaSha256:s.document.schemaSha256,requiredRoles:['main','sidecar'],mutationCompatibility:'operation_and_schema_specific'};}catch(e){return {state:'recognized_unsupported',reason:e.code||'CRIMSON_FORMAT_INVALID'};}
 },
 async open(bundle,ctx){const s=await opened(bundle,ctx);states.set(bundle.bundleDigest,s);return summary(s);},
 describe(){return {domainApis:{'crimson.document':'0.1.0'},operations:operationNames.map(n=>({id:'crimson.'+n,apiVersion:'0.1.0',writeDomains:[{path:n.split('.')[0],mode:'ordered'}],...(n.startsWith('document.')?{experimental:true,entitlementEffects:'unreviewed',requiresIndependentHostInspector:true}:{})})),documentQueries:['crimson.document','crimson.document.schema','crimson.document.fields','crimson.document.bytes'],views:[{id:'upgrades',mode:'custom'},{id:'inventory',mode:'custom'},{id:'companions',mode:'custom'},{id:'cartography',mode:'custom'},{id:'progress',mode:'custom'},{id:'presets',mode:'custom'},{id:'advanced-import',mode:'custom',advanced:true}],unavailable:['treasure-reveal','teleport','story-edit'],publication:'trusted-host-only'};},
 async query(handle,q,ctx){
  if(q?.method==='crimson.import.inspect'&&Array.isArray(handle?.artifacts))return inspectUploadedBundle(handle,ctx);
  const s=stateFor(handle),r=runtime,p=q?.params||q?.args||q||{};
  if(q.method==='crimson.document')return (await subsystem('document')).describeDocument(s.document,p);
  if(q.method==='crimson.document.schema')return (await subsystem('document')).queryDocumentSchema(s.document,p);
  if(q.method==='crimson.document.fields')return (await subsystem('document')).queryDocumentFields(s.document,p);
  if(q.method==='crimson.document.bytes')return (await subsystem('document')).queryDocumentBytes(s.document,p);
  if(q.method==='crimson.inspect')return {schema:'saverift.crimson-inspection.v1',...summary(s),domains:s.domains};
  if(q.method==='crimson.explorer')return {game:{titleId:'1754076455',name:'Crimson Desert',key:'1754076455'},backup:{id:s.bundle.id,sha256:s.bundle.bundleDigest,complete:true},report:{schema:'saveglass.backup-inspection.v1',backupId:s.bundle.id,backupSha256:s.bundle.bundleDigest,backupRevision:s.bundle.bundleDigest,payloads:[{container:s.container,name:'save',sha256:s.artifact.sha256,bytes:s.artifact.byteLength,format:'crimson-save',crimson:{status:'decoded',version:s.decoded.version,domains:s.domains,typedValidation:{status:'passed',decoderRevision:r.DECODER_REVISION}}}]},initialContainer:s.container};
  if(q.method==='crimson.inventory'){let rows=s.domains.inventory.records;if(p.category)rows=rows.filter(x=>x.category===p.category);if(p.search){const search=String(p.search).toLowerCase();rows=rows.filter(x=>[x.displayName,x.internalName,x.definitionKey,...(x.searchAliases||[])].join(' ').toLowerCase().includes(search));}return {...page(rows,p),bags:s.domains.inventory.bags,ownershipComplete:s.domains.inventory.ownershipComplete};}
  if(q.method==='crimson.companions')return page(s.domains.companions.filter(x=>!p.kind||x.classification===p.kind),p);
  if(q.method==='crimson.progress')return s.domains.progress;
  if(q.method==='crimson.location')return s.domains.location;
  if(q.method==='crimson.capabilities'){
   const supported=s.decoded.version===2&&s.document.schemaSha256==='8427f58057ea9bf6dac35bc139cba163ddb135cfe89d748a2d36b94eec88d668',record=(available,reason)=>({available,reason,state:available?'format_supported':'unavailable'});
   return {schema:'saverift.plugin-capabilities.v1',payloads:[{container:s.container,name:'save',capabilities:{decode:record(true,'The complete typed document was read.'),preview:record(true,'Candidate validation is separate from game acceptance.'),edit_existing:record(supported,'Existing scalar edits require a matching schema and definition.'),edit_capacity:record(supported,'Bag capacity is calculated from the saved expansion field.'),insert_item:record(supported&&getData('crimson-construction-items.json').entries.length>0,'A matching pinned construction provider is required.'),edit_companion:record(supported&&getData('crimson-companion-additions.json').entries.length>0,'A matching pinned template provider is required.'),publish:record(false,'Only the trusted host can approve and transfer a candidate.'),restore:record(false,'Restoration is a separately verified host operation.')}}]};
  }
  if(q.method==='crimson.catalog.items'){const rows=getData('crimson-items.json').items,search=String(p.search||'').toLowerCase();return page(rows.filter(x=>!search||[x.name,x.internalName,x.key,...(x.searchAliases||[])].join(' ').toLowerCase().includes(search)),p);}
  if(q.method==='crimson.catalog.companions'){const rows=getData('crimson-enrichment.json').companions,search=String(p.search||'').toLowerCase();return page(rows.filter(x=>!search||JSON.stringify(x).toLowerCase().includes(search)),p);}
  if(q.method==='crimson.packs')return (await subsystem('recipes')).getPackCatalog();
  if(q.method==='crimson.pack-preview')return (await subsystem('packs')).previewCrimsonPack(s.source,s.metadata,{container:s.container,payload:'save',...p});
  if(q.method==='crimson.presets')return (await subsystem('presets')).presetCatalog();
  if(q.method==='crimson.preset-preview')return (await subsystem('presets')).presetPreview(p.presetId);
  if(q.method==='crimson.map-preview'||q.method==='crimson.nexus-preview'){const mod=await import('./src/crimson-map-reveal.mjs'),nexus=await import('./src/crimson-abyss-nexus.mjs');return (await (q.method==='crimson.map-preview'?mod.previewMapReveal:nexus.previewAbyssNexus)(Buffer.from(ctx.readArtifact(s.artifact.id)))).report;}
  if(q.method==='crimson.import.inspect')return inspectUploadedBundle(s.bundle,ctx);
  fail('CRIMSON_QUERY_UNSUPPORTED');
 },
 async plan(bundle,{operations,operationDigest},ctx){
  if(!Array.isArray(operations)||operations.length>16||!/^[a-f0-9]{64}$/.test(operationDigest||''))fail('CRIMSON_OPERATION_LOG_INVALID');
  const ops=operations.map(plainOperation),ordinary=ops.length&&ops.every(o=>o.operation!=='document.patchFixedWidth'&&o.operation!=='preset.replaceAdventure'),s=!ops.length?await checkedEnvelope(bundle,ctx):ordinary?await compilerSnapshot(bundle,ctx,ops):await opened(bundle,ctx),r=runtime,research=ops.filter(o=>o.operation==='document.patchFixedWidth'),known=ops.filter(o=>o.operation!=='document.patchFixedWidth');if(research.reduce((n,o)=>n+(o.patches?.length||0),0)>16)fail('CRIMSON_DOCUMENT_PATCH_LIMIT');let output=s.artifact,report={operations:[],validation:{originalBackupUnchanged:true}},outputs=bundle.artifacts.filter(a=>!['reference-data','preset-source'].includes(a.role)),retained=outputs.map(a=>a.id);
  if(ops.some(o=>o.operation==='preset.replaceAdventure')){
   if(ops.length!==1)fail('CRIMSON_PRESET_REPLACEMENT_EXCLUSIVE');await subsystem('pair');const op=ops[0],reference=getData('crimson-preset-reference-pins.json')[op.presetId];if(!reference)fail('PRESET_REFERENCE_PROVIDER_REQUIRED');
   const pair={};for(const name of ['save','lobby']){const a=bundle.artifacts.find(a=>a.id===op[name+'ArtifactId']);if(!a||a.role!=='preset-source')fail('PRESET_REFERENCE_ARTIFACT_REQUIRED');pair[name]=Buffer.from(ctx.readArtifact(a.id));}report=await r.validateReferencePair(pair,reference);
   outputs=['save','lobby'].map(name=>ctx.writeArtifact({logicalPath:s.container+'/'+name,role:name==='save'?'main':'sidecar'},pair[name]));retained=[];
  }else if(known.length){
   const selectedCompiler=await compilerFor(s.document,known),source=s.source;bindPreparedSource(source,s.metadata,{context:ctx,container:s.container,payload:'save',payloadSha256:s.artifact.sha256,decoded:s.decoded,document:s.document,projection:s.projection});const plan={schema:selectedCompiler.schema,container:s.container,payload:'save',backupSha256:s.metadata.sha256,backupRevision:s.source.revision,payloadSha256:s.artifact.sha256,plaintextSha256:s.document.plaintextSha256,schemaSha256:s.document.schemaSha256,decoderRevision:r.DECODER_REVISION,catalogRevision:r.CATALOG_REVISION,operations:known};
   const result=await selectedCompiler.compile(source,s.metadata,plan,{nonce:Buffer.from(ctx.randomBytes(16))});report=result.report;output=ctx.writeArtifact({logicalPath:s.artifact.logicalPath,role:s.artifact.role},result.encoded);outputs=outputs.map(a=>a.id===s.artifact.id?output:a);retained=retained.filter(id=>id!==s.artifact.id);
  }else{const copy=await r.encodeSave(s.decoded.plaintext,s.decoded.header,{nonce:s.decoded.header.subarray(0x1a,0x2a)});if(!copy.equals(Buffer.from(ctx.readArtifact(s.artifact.id))))fail('CRIMSON_CANDIDATE_NATIVE_PARITY_FAILED');}
  for(const op of research){const {operation,...params}=op,stage=await (await subsystem('document')).patchFixedWidth(Buffer.from(ctx.readArtifact(output.id)),params,{originalDocument:s.document,nonce:Buffer.from(ctx.randomBytes(16))}),prior=report;report={schema:'saverift.crimson-research-composition.v1',stages:[prior,stage.report],validation:stage.report.validation,decodedDiff:stage.report.decodedDiff,experimental:true,entitlementEffects:'unreviewed',requiresIndependentHostInspector:true};output=ctx.writeArtifact({logicalPath:s.artifact.logicalPath,role:s.artifact.role},stage.encoded);outputs=outputs.map(a=>a.logicalPath===s.artifact.logicalPath?output:a);retained=retained.filter(id=>id!==s.artifact.id);}
  const reportArtifact=ctx.writeArtifact({logicalPath:'reports/crimson-changes.json',role:'change-summary'},Buffer.from(JSON.stringify(report)));
  return {id:'candidate:crimson:'+hash(canonicalJson({bundle:bundle.bundleDigest,operationDigest})).slice(0,24),inputBundleDigest:bundle.bundleDigest,executionLockDigest:ctx.executionLock.digest,operationDigest,outputs,retainedInputArtifacts:retained,changeSummaryRef:reportArtifact.id,requirements:{changedDomains:[...new Set(ops.map(o=>o.operation.split('.')[0]))],additions:ops.filter(o=>['inventory.addItem','companions.add'].includes(o.operation)),runtimeRequirements:report.runtimeRequirements||[],entitlementClassification:'host_independent_review_required',...(research.length?{experimentalFixedWidthPatch:true,entitlementEffects:'unreviewed',requiresIndependentHostInspector:true}:{}),gameAcceptance:'unverified_for_this_candidate'},validation:{checks:inspectChecks()}};
 },
 async validate(original,candidate,ctx){
  const r=await load(original,ctx),artifact=mainArtifact(original);
  if(candidate.inputBundleDigest!==original.bundleDigest||candidate.executionLockDigest!==ctx.executionLock.digest)fail('CRIMSON_CANDIDATE_BINDING_CHANGED');
  const inputs=original.artifacts.filter(a=>!['reference-data','preset-source'].includes(a.role));if(candidate.outputs.length!==inputs.length||new Set(candidate.outputs.map(a=>a.logicalPath)).size!==inputs.length||candidate.outputs.some(a=>!inputs.some(i=>i.logicalPath===a.logicalPath)))fail('CRIMSON_CANDIDATE_OUTPUT_SCOPE_CHANGED');
  const out=candidate.outputs.filter(a=>a.role==='main'||a.role==='save'||a.logicalPath===artifact.logicalPath);if(out.length!==1)fail('CRIMSON_CANDIDATE_MAIN_AMBIGUOUS');
  const bytes=Buffer.from(ctx.readArtifact(out[0].id));if(hash(bytes)!==out[0].sha256||bytes.length!==out[0].byteLength)fail('CRIMSON_CANDIDATE_DIGEST_CHANGED');
  // The selected source is host-verified. Equal SHA/length binds an unchanged
  // output to those exact input bytes; one full traversal proves both copies.
  const unchanged=out[0].sha256===artifact.sha256&&out[0].byteLength===artifact.byteLength;
  let originalHeader,originalSchema;
  if(!unchanged){
   // Keep only the tiny original witness, not two full typed projections. The
   // helper fully verifies HMAC, decompression, UTF-8 and every typed field.
   const witness=await originalWitness(original,ctx);originalHeader=witness.header;originalSchema=witness.schemaSha256;
  }
  const decoded=await r.decodeSave(bytes),document=r.readDocument(decoded.plaintext,{captureTypes:[],listLimit:0,hashPlaintext:false}),reencoded=await r.encodeSave(decoded.plaintext,decoded.header,{nonce:decoded.header.subarray(0x1a,0x2a)});if(!reencoded.equals(bytes))fail('CRIMSON_CANDIDATE_NATIVE_PARITY_FAILED');
  let replaced=false;
  for(const a of inputs.filter(a=>a.id!==artifact.id)){const kept=candidate.outputs.find(x=>x.logicalPath===a.logicalPath);if(!kept)fail('CRIMSON_CANDIDATE_SIDECAR_MISSING');if(kept.sha256!==a.sha256){if(a.role!=='sidecar'&&a.role!=='lobby')fail('CRIMSON_CANDIDATE_SIDECAR_CHANGED');const pins=Object.values(getData('crimson-preset-reference-pins.json')).filter(x=>x&&typeof x==='object'&&x.save?.sha256===out[0].sha256&&x.lobby?.sha256===kept.sha256);if(pins.length!==1)fail('CRIMSON_CANDIDATE_PRESET_UNVERIFIED');await subsystem('pair');await r.validateReferencePair({save:bytes,lobby:Buffer.from(ctx.readArtifact(kept.id))},pins[0]);replaced=true;}}
  if(!replaced&&!unchanged&&(!decoded.header.subarray(0,0x12).equals(originalHeader.subarray(0,0x12))||!decoded.header.subarray(0x4a,128).equals(originalHeader.subarray(0x4a,128))||document.schemaSha256!==originalSchema))fail('CRIMSON_CANDIDATE_UNKNOWN_HEADER_CHANGED');
  return {checks:[...inspectChecks(),{checkId:replaced?'crimson.preset-pair-validated':'crimson.sidecars-preserved',result:'passed',required:true}],schemaSha256:document.schemaSha256,entitlements:'not_established_by_format_validation',gameAcceptance:'unverified'};
 },
 close(handle){if(handle?.id)states.delete(handle.id);else states.clear();if(!handle?.id||cachedOpen?.value.bundle.bundleDigest===handle.id)cachedOpen=null;return null;}
};
