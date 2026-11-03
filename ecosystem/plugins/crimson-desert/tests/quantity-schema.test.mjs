// SPDX-License-Identifier: Apache-2.0
// Invented reordered descriptors and an untouched extra root; no player fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from '../../../sdk/buffer.mjs';
import {hash} from '../../../sdk/crypto.mjs';
import {configureDataProviders} from '../src/data-provider.mjs';
import {encodeSave,decodeSave,parcSchema} from '../src/crimson-codec.mjs';
import {readDocument,DECODER_REVISION} from '../src/crimson-document.mjs';
import {quantityParcFixture,u16,u32,u64} from './synthetic-parc.mjs';
const catalog={manifest:{revision:'synthetic.v1',effectiveSha256:'0'.repeat(64)},items:[{key:1000730,name:'Invented stack',referenceMaxStack:'50'}]},constructors={entries:[[1000730,2,'50',0,0,0,false,[],0,0]],unavailable:[],balanceDefinitions:[],columns:[],source:{},runtimeRequirements:{}};
configureDataProviders([['crimson-items.json',catalog],['crimson-construction-items.json',constructors]].map(([id,value])=>{const bytes=Buffer.from(JSON.stringify(value));return {id,bytes,sha256:hash(bytes)};}),{synthetic:true});
const {createCrimsonDraftCompiler,compileCrimsonDraft,CRIMSON_DRAFT_SCHEMAS,CRIMSON_QUANTITY_SCHEMA}=await import('../src/crimson-draft.mjs');
const {CATALOG_REVISION}=await import('../src/crimson-domain.mjs');
const {sourceFromBundle}=await import('../src/source-binding.mjs');
const {structuralSchemaSupported}=await import('../src/structural-publication-profile.mjs');
const {assertMixedPlan}=await import('../src/mixed-draft.mjs');
const string=s=>Buffer.concat([u32(Buffer.byteLength(s)),Buffer.from(s)]);
function reorderedFixture({descriptorType='TStackCount',...options}={}){
 const f=quantityParcFixture(options),old=parcSchema(f.raw),locators=[];readDocument(f.raw,{onLocator:e=>locators.push(e)});
 const extra=name=>({name,fields:[{name:'_inventedGuard',type:'uint64',kind:0,size:8,aux:0}]}),types=[extra('SyntheticUntouchedRoot'),...structuredClone(old.types).reverse(),extra('SyntheticUnusedA'),extra('SyntheticUnusedB')],indices=new Map(types.map((t,i)=>[t.name,i]));
 types.find(t=>t.name==='ItemSaveData').fields[4].type=descriptorType;
 const schema=Buffer.concat([u32(old.roots),u16(types.length),...types.flatMap(t=>[string(t.name),u16(t.fields.length),...t.fields.map(d=>Buffer.concat([string(d.name),string(d.type),u16(d.kind),u16(d.size),u32(d.aux)]))])]);
 const start=14+schema.length+12+(old.toc.length+1)*20,delta=start-old.dataStart,data=Buffer.from(f.raw.subarray(old.dataStart));
 for(const e of locators){const typeOffset=e.wrapperStart+2+f.raw.readUInt16LE(e.wrapperStart);data.writeUInt16LE(indices.get(e.typeName),typeOffset-old.dataStart);data.writeUInt32LE(e.wrapperEnd+delta,e.pointerOffset-old.dataStart);}
 const extraRoot=Buffer.concat([u16(1),Buffer.from([1]),u32(73),u64('12345678901234567')]),toc=old.toc.map(e=>({...e,classIndex:indices.get(old.types[e.classIndex].name),offset:e.offset+delta}));
 toc.push({classIndex:indices.get('SyntheticUntouchedRoot'),sentinel1:0,sentinel2:0,offset:start+data.length,bytes:extraRoot.length});
 const raw=Buffer.concat([f.raw.subarray(0,14),schema,u32(old.reserved),u32(toc.length),u32(data.length+extraRoot.length),...toc.flatMap(e=>[u32(e.classIndex),u32(e.sentinel1),u32(e.sentinel2),u32(e.offset),u32(e.bytes)]),data,extraRoot]);
 return {raw,instanceId:f.instanceId,extraRoot};
}
async function boundFixture(options={}){
 const f=reorderedFixture(options),header=Buffer.alloc(128);header.write('SAVE');header.writeUInt16LE(2,4);header.writeUInt16LE(128,6);header[0x70]=37;
 const encoded=await encodeSave(f.raw,header,{nonce:Buffer.alloc(16,8)}),document=readDocument(f.raw),lobby=Buffer.from('invented unchanged sidecar'),bundle={id:'synthetic-reordered',bundleDigest:hash('invented-reordered-source'),artifacts:[{id:'main',logicalPath:'slot100,savedgame/save',role:'main',byteLength:encoded.length,sha256:hash(encoded)},{id:'lobby',logicalPath:'slot100,savedgame/lobby',role:'sidecar',byteLength:lobby.length,sha256:hash(lobby)}]},bytes=new Map([['main',encoded],['lobby',lobby]]),bound=sourceFromBundle(bundle,{readArtifact:id=>bytes.get(id)}),plan={schema:'saveglass.crimson-draft-plan.v1',container:'slot100,savedgame',payload:'save',backupSha256:bundle.bundleDigest,backupRevision:bundle.bundleDigest,payloadSha256:hash(encoded),plaintextSha256:hash(f.raw),schemaSha256:document.schemaSha256,decoderRevision:DECODER_REVISION,catalogRevision:CATALOG_REVISION,operations:[{operation:'inventory.setQuantity',inventoryKey:2,definitionKey:1000730,instanceId:f.instanceId,slot:0,expectedValue:options.quantity??'5',desiredValue:'6'}]};
 return {...f,encoded,document,bound,plan,bytes,lobby,compiler:createCrimsonDraftCompiler({schemaPins:[{schemaSha256:document.schemaSha256,requiresHousing:false}]})};
}
const compile=(f,plan=f.plan)=>f.compiler(f.bound.source,f.bound.metadata,plan,{nonce:Buffer.alloc(16,4),retainEncoded:true});
test('the new fixed quantity schema leaves legacy and structural admission unchanged',()=>{
 assert.equal(CRIMSON_QUANTITY_SCHEMA,'5d31e58dfb5dee0449bb59162f7a0d68ad56e67faf2aa06a5b41c38daf31e003');assert.equal(CRIMSON_DRAFT_SCHEMAS.length,3);assert.equal(CRIMSON_DRAFT_SCHEMAS.some(p=>p.schemaSha256===CRIMSON_QUANTITY_SCHEMA),false);assert.equal(structuralSchemaSupported(CRIMSON_QUANTITY_SCHEMA,2),false);
});
test('reordered synthetic type indices and three extra descriptors preserve every byte outside the exact scalar',async()=>{
 const f=await boundFixture(),result=await compile(f),decoded=await decodeSave(result.encoded),after=readDocument(decoded.plaintext,{compareTo:f.raw}),expected=Buffer.from(f.raw),target=result.report.operations[0];expected.writeBigUInt64LE(6n,target.offset);
 assert.equal(f.document.schema.types.length,6);assert.equal(f.document.schema.types.find(t=>t.name==='ItemSaveData').index,1);assert.equal(f.document.audit.advisoryLocators,0);assert.equal(f.document.audit.unconsumedBytes,0);
 assert.equal(decoded.plaintext.equals(expected),true);assert.equal(after.schemaSha256,f.document.schemaSha256);assert.equal(decoded.plaintext.subarray(-f.extraRoot.length).equals(f.extraRoot),true);assert.equal(after.decodedDiff.length,1);assert.equal(after.decodedDiff[0].field,'_stackCount');assert.equal(after.decodedDiff[0].before,'5');assert.equal(after.decodedDiff[0].after,'6');assert.equal(f.encoded.equals(f.bytes.get('main')),true);assert.equal(f.bytes.get('lobby').equals(f.lobby),true);
 assert.equal(result.report.validation.hmacReverified,true);assert.equal(result.report.validation.originalNoOpByteParity,true);assert.equal(result.report.validation.allOtherPlaintextBytesUnchanged,true);assert.equal(result.report.validation.allOtherDecodedValuesUnchanged,true);assert.equal(result.report.publishEligible,false);
});
test('unknown actual schema hashes remain rejected by the fixed compiler even with a claimed reviewed hash',async()=>{
 const f=await boundFixture();await assert.rejects(compileCrimsonDraft(f.bound.source,f.bound.metadata,f.plan),{code:'CRIMSON_DRAFT_SCHEMA_UNSUPPORTED'});await assert.rejects(compileCrimsonDraft(f.bound.source,f.bound.metadata,{...f.plan,schemaSha256:CRIMSON_QUANTITY_SCHEMA}),{code:'CRIMSON_DRAFT_SCHEMA_UNSUPPORTED'});
});
test('a quantity plus map request keeps the separate mixed schema gate',async()=>{
 const f=await boundFixture(),plan={...f.plan,schema:'saveglass.mixed-draft-plan.v1',schemaSha256:CRIMSON_QUANTITY_SCHEMA,operations:[...f.plan.operations,{operation:'cartography.reveal-map'}]};
 assert.throws(()=>assertMixedPlan(plan),{code:'MIXED_SCHEMA_UNSUPPORTED'});
});
test('an explicitly pinned synthetic schema still rejects a changed quantity descriptor or missing required housing',async()=>{
 const changed=await boundFixture({descriptorType:'SyntheticOtherCount'});await assert.rejects(compile(changed),{code:'CRIMSON_DRAFT_DESCRIPTOR_UNSUPPORTED'});
 const missing=await boundFixture(),compiler=createCrimsonDraftCompiler({schemaPins:[{schemaSha256:missing.document.schemaSha256,requiresHousing:true}]});await assert.rejects(compiler(missing.bound.source,missing.bound.metadata,missing.plan),{code:'CRIMSON_DRAFT_HOUSING_UNSUPPORTED'});
});
test('reordered schemas retain identity, expected-value, absent-field, duplicate-target and range guards',async()=>{
 const f=await boundFixture(),op=f.plan.operations[0];
 for(const [patch,code]of [[{instanceId:'99'},'CRIMSON_DRAFT_TARGET_MISMATCH'],[{expectedValue:'4'},'CRIMSON_DRAFT_EXPECTATION_MISMATCH'],[{desiredValue:'0'},'CRIMSON_DRAFT_REFERENCE_LIMIT'],[{desiredValue:'51'},'CRIMSON_DRAFT_REFERENCE_LIMIT']])await assert.rejects(compile(f,{...f.plan,operations:[{...op,...patch}]}),{code});
 await assert.rejects(compile(f,{...f.plan,operations:[op,{...op,desiredValue:'7'}]}),{code:'CRIMSON_DRAFT_CONFLICT'});
 const absent=await boundFixture({quantityPresent:false});await assert.rejects(compile(absent),{code:'CRIMSON_DRAFT_STRUCTURAL_REQUIRED'});
 const duplicate=await boundFixture({duplicateInstance:true});await assert.rejects(compile(duplicate),{code:'CRIMSON_DRAFT_TARGET_MISMATCH'});
 await assert.rejects(compile(f,{...f.plan,payloadSha256:'0'.repeat(64)}),{code:'CRIMSON_DRAFT_STALE'});
});
