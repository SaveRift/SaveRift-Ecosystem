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
const {sourceFromBundle}=await import('../src/source-binding.mjs');
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
test('LZ4 bounded standard block preserves match-heavy and high-entropy buffers',()=>{
 for(const size of [1,19,65546,65547,200000]){const raw=Buffer.alloc(size);for(let i=0;i<size;i++)raw[i]=i%251;const encoded=compressStandardLz4(raw);assert.equal(inflateLz4(encoded,size).equals(raw),true);if(size>1000)assert.ok(encoded.length<size/4);}
});
