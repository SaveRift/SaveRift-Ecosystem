// SPDX-License-Identifier: Apache-2.0
// Invented records and public format keys only. Never a player save fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createHmac} from 'node:crypto';
import {Buffer} from '../../../sdk/buffer.mjs';
import {hash} from '../../../sdk/crypto.mjs';
import {configureDataProviders} from '../src/data-provider.mjs';
import {typedParcFixture,quantityParcFixture} from './synthetic-parc.mjs';
const catalog={manifest:{revision:'synthetic.v1',effectiveSha256:'0'.repeat(64)},items:[{key:1000730,name:'Synthetic consumable',internalName:'Synthetic_Consumable',category:'Test',referenceMaxStack:'50'}]};
const constructors={entries:[[1000730,2,'50',0,0,0,false,[],0,0]],unavailable:[],balanceDefinitions:[],columns:[],source:{},runtimeRequirements:{}};
configureDataProviders([['crimson-items.json',catalog],['crimson-construction-items.json',constructors]].map(([id,value])=>{const bytes=Buffer.from(JSON.stringify(value));return {id,bytes,sha256:hash(bytes)};}),{synthetic:true});
const {decodeSave,encodeSave,inflateLz4}=await import('../src/crimson-codec.mjs');
const {readDocument,DECODER_REVISION}=await import('../src/crimson-document.mjs');
const {compressStandardLz4}=await import('../src/lz4-standard.mjs');
const {createCrimsonDraftCompiler}=await import('../src/crimson-draft.mjs');
const {sourceFromBundle,bindPreparedSource}=await import('../src/source-binding.mjs');
const {CATALOG_REVISION,normalizeCrimson}=await import('../src/crimson-domain.mjs');
// The explicit public key below is the upstream v2 format key; it is unrelated
// to a Microsoft account, native credential, or Xbox signing key.
const key=Buffer.from('9a4beb127f9e748b148d6690c25cc9379a315bd56c28af6319fd559f1152ac00','hex');
function header(){const h=Buffer.alloc(128);h.write('SAVE');h.writeUInt16LE(2,4);h.writeUInt16LE(128,6);h[0x70]=37;h[0x7f]=90;return h;}
function independentEnvelope(raw,h,nonce){const compressed=compressStandardLz4(raw),copy=Buffer.from(h);copy.writeUInt32LE(raw.length,0x12);copy.writeUInt32LE(compressed.length,0x16);nonce.copy(copy,0x1a);Buffer.from(createHmac('sha256',key).update(compressed).digest()).copy(copy,0x2a);return Buffer.concat([copy,Buffer.from(createCipheriv('chacha20',key,nonce).update(compressed))]);}
test('public codec exactly matches independent OpenSSL ChaCha/HMAC envelope and native-standard no-op',async()=>{
 const {raw}=typedParcFixture(),nonce=Buffer.alloc(16,9),expected=independentEnvelope(raw,header(),nonce),encoded=await encodeSave(raw,header(),{nonce});assert.equal(encoded.equals(expected),true);
 const decoded=await decodeSave(expected);assert.equal(decoded.plaintext.equals(raw),true);assert.equal((await encodeSave(raw,decoded.header,{nonce:decoded.header.subarray(0x1a,0x2a)})).equals(expected),true);assert.equal(encoded[0x70],37);assert.equal(encoded[0x7f],90);
 const changed=Buffer.from(encoded);changed[changed.length-1]^=1;await assert.rejects(decodeSave(changed),e=>e.code==='CRIMSON_HMAC_FAILED');
});
test('omitted lists, nonzero metadata, exact wide integers and unknown fields survive decode',()=>{
 const f=typedParcFixture(),d=readDocument(f.raw),root=d.blocks[0];assert.equal(d.audit.omittedListMarkers,4);assert.equal(d.audit.nonzeroListMetadata,1);assert.equal(root.fields.wide.value,'9007199254740993');assert.equal(root.fields.zero.value,'0');assert.equal(root.fields.absentScalar.present,false);assert.equal(root.fields.list.value.elements[0].fields.unmapped.value.hex,'040506');
 const bad=Buffer.from(f.raw);bad[f.markerOffset]=0;assert.throws(()=>readDocument(bad),e=>e.code==='PARC_TYPED_INVALID');
});
test('real scalar compiler emits exactly the intended synthetic quantity and independently reopens output',async()=>{
 const {raw,instanceId}=quantityParcFixture(),source=await encodeSave(raw,header(),{nonce:Buffer.alloc(16,8)}),d=readDocument(raw),bundle={id:'synthetic',bundleDigest:hash('synthetic-bundle'),artifacts:[{id:'main',logicalPath:'slot100,savedgame/save',role:'main',byteLength:source.length,sha256:hash(source)},{id:'lobby',logicalPath:'slot100,savedgame/lobby',role:'sidecar',byteLength:6,sha256:hash('lobby!')}]},bytes=new Map([['main',source],['lobby',Buffer.from('lobby!')]]),bound=sourceFromBundle(bundle,{readArtifact:id=>bytes.get(id)}),compiler=createCrimsonDraftCompiler({schemaPins:[{schemaSha256:d.schemaSha256,requiresHousing:false}]}),plan={schema:'saveglass.crimson-draft-plan.v1',container:'slot100,savedgame',payload:'save',backupSha256:bundle.bundleDigest,backupRevision:bundle.bundleDigest,payloadSha256:hash(source),plaintextSha256:hash(raw),schemaSha256:d.schemaSha256,decoderRevision:DECODER_REVISION,catalogRevision:CATALOG_REVISION,operations:[{operation:'inventory.setQuantity',inventoryKey:2,definitionKey:1000730,instanceId,slot:0,expectedValue:'5',desiredValue:'6'}]};
 const result=await compiler(bound.source,bound.metadata,plan,{nonce:Buffer.alloc(16,4),retainEncoded:true}),decoded=await decodeSave(result.encoded),after=readDocument(decoded.plaintext,{compareTo:raw}),expected=Buffer.from(raw);expected.writeBigUInt64LE(6n,result.report.operations[0].offset);assert.equal(decoded.plaintext.equals(expected),true);assert.equal(result.encoded.equals(independentEnvelope(expected,header(),Buffer.alloc(16,4))),true);assert.equal(after.decodedDiff.length,1);assert.equal(after.decodedDiff[0].field,'_stackCount');assert.equal(normalizeCrimson(after,{saveVersion:2}).inventory.records[0].quantity,'6');assert.equal(source.equals(bytes.get('main')),true);assert.equal(result.report.validation.unknownHeaderBytesPreserved,true);
});
test('prepared scalar compiler reuses one verified original walk and freshly reparses its intended-only output',async()=>{
 const {raw,instanceId}=quantityParcFixture(),encoded=await encodeSave(raw,header(),{nonce:Buffer.alloc(16,8)}),artifact={id:'main',logicalPath:'slot100,savedgame/save',role:'main',byteLength:encoded.length,sha256:hash(encoded)},bundle={id:'prepared-synthetic',bundleDigest:hash('prepared-synthetic'),artifacts:[artifact]},context={executionLock:{digest:hash('prepared-lock')},readArtifact:()=>encoded},bound=sourceFromBundle(bundle,context),decoded=await decodeSave(encoded);let walkedObjects=0;
 const projection={captureTypes:['InventorySaveData'],fieldListLimits:{'InventoryElementSaveData._itemList':1024},onObject:()=>walkedObjects++},document=readDocument(decoded.plaintext,projection),plan={schema:'saveglass.crimson-draft-plan.v1',container:'slot100,savedgame',payload:'save',backupSha256:bundle.bundleDigest,backupRevision:bundle.bundleDigest,payloadSha256:artifact.sha256,plaintextSha256:document.plaintextSha256,schemaSha256:document.schemaSha256,decoderRevision:DECODER_REVISION,catalogRevision:CATALOG_REVISION,operations:[{operation:'inventory.setQuantity',inventoryKey:2,definitionKey:1000730,instanceId,slot:0,expectedValue:'5',desiredValue:'6'}]};
 bindPreparedSource(bound.source,bound.metadata,{context,container:plan.container,payload:'save',payloadSha256:artifact.sha256,decoded,document,projection});
 assert.equal(walkedObjects,document.audit.objects);
 const compile=createCrimsonDraftCompiler({schemaPins:[{schemaSha256:document.schemaSha256,requiresHousing:false}]}),result=await compile(bound.source,bound.metadata,plan,{nonce:Buffer.alloc(16,4),retainEncoded:true});
 assert.equal(walkedObjects,document.audit.objects*2,'one original verified walk plus one fresh output walk');
 assert.equal(result.report.decodedDiff.length,1);assert.equal(result.report.decodedDiff[0].field,'_stackCount');assert.equal(result.report.validation.fullDocumentReparsed,true);assert.equal(result.report.validation.originalNoOpByteParity,true);
 assert.equal(decoded.plaintext.equals(raw),true);assert.equal(encoded.equals(await encodeSave(raw,header(),{nonce:Buffer.alloc(16,8)})),true);
 const independent=readDocument((await decodeSave(result.encoded)).plaintext,{compareTo:raw});assert.equal(independent.decodedDiff.length,1);assert.equal(independent.decodedDiff[0].after,'6');
});
test('LZ4 bounded standard block preserves match-heavy and high-entropy buffers',()=>{
 for(const size of [1,19,65546,65547,200000]){const raw=Buffer.alloc(size);for(let i=0;i<size;i++)raw[i]=i%251;const encoded=compressStandardLz4(raw);assert.equal(inflateLz4(encoded,size).equals(raw),true);if(size>1000)assert.ok(encoded.length<size/4);}
});
test('standard LZ4 matches independent liblz4 1.9.4 synthetic golden blocks across table boundaries',()=>{
 // Generated independently with LZ4_compress_default, not this compressor.
 const controls=[
  [65546,false,65804,'1b7bb21a5ce4c18698a5d94bf40ecba03b38a6cba093911a0f82a66975c1e9e6'],
  [65547,false,65805,'8c212ca6972f721f07df0eb564aa657ac8e585662e118bcdf5d05fc492f659ea'],
  [200000,false,200786,'2c6eddfa1d454b5e2e125f192e48080b780d667aba87614143a5573249200f96'],
  [1048576,false,1052690,'393421aa2973fedda76053f5a29dfce88962adf5a9f51ddb0ca03547c34cd058'],
  [65546,true,34002,'71097dea59264423207ade230e1300b6acacc78adeb032a5317931381ad8c386'],
  [65547,true,34003,'37667ea693bd396e1b58cf8f819107f247f102556aa255ce8eb5a666b9a2a1a1'],
  [200000,true,104382,'d01eb924465504e3b09090f6b11e194ef94d9e61ff92f7847f0aff87b999f78f'],
  [1048576,true,542347,'a68e5f17befaee5a9d7c2adb09e3d987077827408bfe4182806c932891c8c98c']
 ];
 for(const [size,repeated,length,digest]of controls){
  const raw=Buffer.alloc(size);let state=0x8badf00d;
  for(let i=0;i<size;i++){state^=state<<13;state^=state>>>17;state^=state<<5;raw[i]=repeated&&i>=2000&&i%1000<500?raw[i-2000]:state&255;}
  const encoded=compressStandardLz4(raw);assert.equal(encoded.length,length);assert.equal(hash(encoded),digest);assert.equal(inflateLz4(encoded,size).equals(raw),true);
 }
});
