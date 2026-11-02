// SPDX-License-Identifier: Apache-2.0
// Invented Fog/Inventory roots exercise scoped retention and full validation.
import test from 'node:test';import assert from 'node:assert/strict';
import {Buffer} from '../../../sdk/buffer.mjs';import {hash} from '../../../sdk/crypto.mjs';
import {encodeSave,decodeSave} from '../src/crimson-codec.mjs';import {readDocument} from '../src/crimson-document.mjs';
import {createMapRevealPreview,mapRevealProfile,mapOutputWitness} from '../src/crimson-map-reveal.mjs';
import {u16,u32} from './synthetic-parc.mjs';
const str=s=>Buffer.concat([u32(Buffer.byteLength(s)),Buffer.from(s)]);
function fixture({invalidText=false}={}){
 const types=[...Object.entries(mapRevealProfile.types).map(([name,pin])=>({name,fields:pin.fields})),{name:'InventorySaveData',fields:[{name:'_label',type:'string',kind:1,size:1,aux:0}]}],schema=Buffer.concat([u32(2),u16(types.length),...types.flatMap(t=>[str(t.name),u16(t.fields.length),...t.fields.map(f=>Buffer.concat([str(f.name),str(f.type),u16(f.kind),u16(f.size),u32(f.aux)]))])]),prefix=Buffer.alloc(14);prefix.writeUInt16LE(65535);prefix.writeUInt16LE(4,2);
 const start=14+schema.length+52,array=(values,width=1)=>Buffer.concat([Buffer.from([0]),u32(values.length),...values.map(v=>width===4?u32(v):Buffer.from([v]))]),payload=Buffer.concat([u32(0),array([0,3],4),array([3,255,9]),array([1,1,1])]),wrapper=Buffer.concat([u16(1),Buffer.from([7]),u16(1),Buffer.from([0]),Buffer.alloc(8,255),u32(start+25)]),fog=Buffer.concat([u16(1),Buffer.from([1]),u32(17),wrapper,payload,u32(payload.length)]),label=invalidText?Buffer.from([0xc3,0x28]):Buffer.from('untouched player label'),inventory=Buffer.concat([u16(1),Buffer.from([1]),u32(0),u32(label.length),label]);
 return Buffer.concat([prefix,schema,u32(0),u32(2),u32(fog.length+inventory.length),u32(0),u32(0),u32(0),u32(start),u32(fog.length),u32(2),u32(0),u32(0),u32(start+fog.length),u32(inventory.length),fog,inventory]);
}
function header(){const h=Buffer.alloc(128);h.write('SAVE');h.writeUInt16LE(2,4);h.writeUInt16LE(128,6);h[0x70]=42;return h;}
test('Fog-only retention still reveals only codes and independently preserves all unrelated bytes',async()=>{
 const raw=fixture(),d=readDocument(raw),source=await encodeSave(raw,header(),{nonce:Buffer.alloc(16,3)}),preview=createMapRevealPreview({schemaPins:[d.schemaSha256]}),r=await preview(source,{nonce:Buffer.alloc(16,4)}),after=(await decodeSave(r.encoded)).plaintext,diff=readDocument(after,{compareTo:raw,onScalar(){}});
 assert.equal(r.report.coverage.segmentsToReveal,2);assert.equal(r.report.validation.bytesOutsideFogRangeUnchanged,true);assert.equal(r.report.validation.rleJumpingAndLengthsUnchanged,true);assert.equal(diff.decodedDiff.length,1);assert.equal(diff.decodedDiff[0].field,'_codeList');assert.equal(r.encoded[0x70],42);assert.equal(r.report.sourceSha256,hash(source));
 const root=d.schema.toc[1];assert.equal(after.subarray(root.offset,root.offset+root.bytes).equals(raw.subarray(root.offset,root.offset+root.bytes)),true);
 const proof=mapOutputWitness(r,source);assert.equal(proof.plaintextSha256,hash(after));assert.equal(proof.schemaSha256,d.schemaSha256);assert.equal(mapOutputWitness({...r},source),null);
 const changed=Buffer.from(source);changed[128]^=1;assert.equal(mapOutputWitness(r,changed),null);
 r.encoded[128]^=1;assert.equal(mapOutputWitness(r,source),null);r.encoded[128]^=1;
 r.report.validation.claimedByCaller=true;assert.equal(mapOutputWitness(r,source),null);delete r.report.validation.claimedByCaller;assert.ok(mapOutputWitness(r,source));
});

test('mixed native final-map reuse equals a custom cloned-result full reparse',async()=>{
 const {createMixedDraftCompiler}=await import('../src/mixed-draft.mjs'),{sourceFromBundle}=await import('../src/source-binding.mjs'),{DECODER_REVISION}=await import('../src/crimson-document.mjs'),{CATALOG_REVISION}=await import('../src/crimson-domain.mjs');
 const raw=fixture(),document=readDocument(raw),encoded=await encodeSave(raw,header(),{nonce:Buffer.alloc(16,3)}),lobby=Buffer.from('synthetic unchanged lobby'),files=new Map([['main',encoded],['lobby',lobby]]),bundle={id:'synthetic-map-union',bundleDigest:hash('synthetic-map-union'),artifacts:[...files].map(([id,b])=>({id,logicalPath:'slot100,savedgame/'+(id==='main'?'save':'lobby'),role:id==='main'?'main':'sidecar',byteLength:b.length,sha256:hash(b)}))},bound=sourceFromBundle(bundle,{readArtifact:id=>files.get(id)}),input={schema:'saveglass.mixed-draft-plan.v1',container:'slot100,savedgame',payload:'save',backupSha256:bundle.bundleDigest,backupRevision:bundle.bundleDigest,payloadSha256:hash(encoded),plaintextSha256:hash(raw),schemaSha256:document.schemaSha256,decoderRevision:DECODER_REVISION,catalogRevision:CATALOG_REVISION,operations:[{operation:'cartography.reveal-map'}]},mapCompiler=createMapRevealPreview({schemaPins:[document.schemaSha256]}),compile=createMixedDraftCompiler({schemaPins:[document.schemaSha256],mapCompiler}),fallback=createMixedDraftCompiler({schemaPins:[document.schemaSha256],mapCompiler:async(...args)=>({...await mapCompiler(...args)})});
 const options={nonce:Buffer.alloc(16,4),retainEncoded:true},native=await compile(bound.source,bound.metadata,input,options),cloned=await fallback(bound.source,bound.metadata,input,options);
 assert.equal(native.encoded.equals(cloned.encoded),true);assert.equal(native.report.afterPlaintextSha256,cloned.report.afterPlaintextSha256);assert.deepEqual(native.report.decodedDiff,cloned.report.decodedDiff);assert.equal(native.report.validation.finalValidation,'native-map-byte-proof');assert.equal(cloned.report.validation.finalValidation,'fresh-final-document');
});
test('Fog-only retention does not bypass invalid UTF-8 in an unrelated normally captured root',async()=>{
 const raw=fixture({invalidText:true}),schemaPin=hash(JSON.stringify((await import('../src/crimson-codec.mjs')).parcSchema(raw).types)),source=await encodeSave(raw,header(),{nonce:Buffer.alloc(16,5)}),preview=createMapRevealPreview({schemaPins:[schemaPin]});
 await assert.rejects(preview(source),TypeError);
});
