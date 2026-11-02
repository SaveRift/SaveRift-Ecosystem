// SPDX-License-Identifier: Apache-2.0
// Synthetic controls for byte parity and snapshot-scoped reuse. No player data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {Buffer} from '../../../sdk/buffer.mjs';
import {hash} from '../../../sdk/crypto.mjs';
import {createSaveBundle} from '../../../sdk/contracts.mjs';
import {createPluginSession,createExecutionLock} from '../../../sdk/runner.mjs';
import {buildCrimsonPackage} from '../scripts/build.mjs';
import {chacha20,encodeSave} from '../src/crimson-codec.mjs';
import {sourceFromBundle,verifyBackup} from '../src/source-binding.mjs';
import {quantityParcFixture} from './synthetic-parc.mjs';

test('local-word ChaCha20 matches independent OpenSSL across block and counter boundaries',()=>{
 for(const length of [0,1,63,64,65,1024,1024*1024])for(const carry of [false,true]){
  const key=Buffer.alloc(32),nonce=Buffer.alloc(16),data=Buffer.alloc(length);
  for(let i=0;i<key.length;i++)key[i]=(i*17+3)&255;
  for(let i=0;i<nonce.length;i++)nonce[i]=(i*13+5)&255;
  if(carry)nonce.writeUInt32LE(0xffffffff,0);
  for(let i=0;i<data.length;i++)data[i]=(i*29+length)&255;
  const expected=Buffer.from(createCipheriv('chacha20',key,nonce).update(data));
  assert.equal(chacha20(data,key,nonce).equals(expected),true);
  assert.equal(chacha20(expected,key,nonce).equals(data),true);
 }
});

test('lazy projection verifies selected bytes once and freezes all cached source structure',()=>{
 const data=Buffer.from('synthetic bytes'),artifact={id:'main',logicalPath:'slot100,savedgame/save',role:'main',byteLength:data.length,sha256:hash(data)},bundle={id:'test',bundleDigest:hash('test'),artifacts:[artifact]};let reads=0;
 const bound=sourceFromBundle(bundle,{readArtifact(){reads++;return data;}},{lazy:true});
 assert.equal(reads,0);
 artifact.sha256=hash('unrelated metadata');bundle.bundleDigest=hash('unrelated bundle');
 const source=bound.source;assert.equal(reads,1);assert.equal(verifyBackup(source),true);
 assert.equal(source.revision,bound.metadata.sha256);
 assert.equal(bound.source,source);assert.equal(reads,1);
 for(const value of [source,source.containers,source.containers[0],source.containers[0].index,source.containers[0].blobs,source.containers[0].blobs[0]])assert.equal(Object.isFrozen(value),true);
 assert.throws(()=>{source.containers[0].blobs[0].data='changed';},TypeError);
 const copy=JSON.parse(JSON.stringify(source));copy.containers[0].blobs[0].data=Buffer.from('tampered bytes').toString('base64');assert.equal(verifyBackup(copy),false);
});

test('failed lazy materialization never leaves a partially trusted source projection',()=>{
 const a=Buffer.from('one'),b=Buffer.from('two'),artifacts=[['main','save',a],['sidecar','lobby',b]].map(([id,name,data])=>({id,logicalPath:'slot100,savedgame/'+name,role:id==='main'?'main':'sidecar',byteLength:data.length,sha256:hash(data)}));let valid=false;
 const bound=sourceFromBundle({id:'test',bundleDigest:hash('test'),artifacts},{readArtifact:id=>id==='main'?a:valid?b:Buffer.from('bad')},{lazy:true});
 assert.throws(()=>bound.source,{code:'CRIMSON_ARTIFACT_SOURCE_CHANGED'});valid=true;
 const source=bound.source;assert.equal(verifyBackup(source),true);assert.equal(source.blobCount,2);assert.equal(source.containers[0].blobs.length,2);
});

test('detect and open reuse only one immutable session snapshot; close releases its cache',async()=>{
 const h=Buffer.alloc(128);h.write('SAVE');h.writeUInt16LE(2,4);h.writeUInt16LE(128,6);
 const save=await encodeSave(quantityParcFixture().raw,h,{nonce:Buffer.alloc(16,7)}),artifacts=new Map([['main',save]]),bundle=createSaveBundle([{id:'main',logicalPath:'slot100,savedgame/save',role:'main',byteLength:save.length,sha256:hash(save)}]),pkg=await buildCrimsonPackage({write:false}),f={package:pkg,executionLock:createExecutionLock(pkg),bundle,artifacts};
 const session=await createPluginSession(f);
 try{
  assert.equal((await session.call('detect',[bundle])).state,'supported');const afterDetect=session.metrics().hostCalls;
  const handle=await session.call('open',[bundle]);assert.equal(session.metrics().hostCalls,afterDetect);
  await session.call('close',[handle]);await session.call('open',[bundle]);assert.ok(session.metrics().hostCalls>afterDetect);
 }finally{session.close();}
 const changed=new Map([['main',Buffer.from(save)]]);changed.get('main')[128]^=1;
 await assert.rejects(createPluginSession({...f,artifacts:changed}),{code:'ARTIFACT_MISMATCH'});
});

test('prepared snapshot reuse is opaque, context-bound and unavailable to source clones',async()=>{
 const {decodeSave}=await import('../src/crimson-codec.mjs'),{readDocument}=await import('../src/crimson-document.mjs'),{bindPreparedSource,preparedSource}=await import('../src/source-binding.mjs');
 const h=Buffer.alloc(128);h.write('SAVE');h.writeUInt16LE(2,4);h.writeUInt16LE(128,6);
 const encoded=await encodeSave(quantityParcFixture().raw,h,{nonce:Buffer.alloc(16,3)}),artifact={id:'main',logicalPath:'slot100,savedgame/save',role:'main',byteLength:encoded.length,sha256:hash(encoded)},bundle={id:'one-snapshot',bundleDigest:hash('one-snapshot'),artifacts:[artifact]},context={executionLock:{digest:hash('one-lock')},readArtifact:()=>encoded},bound=sourceFromBundle(bundle,context),decoded=await decodeSave(encoded),projection={captureTypes:['InventorySaveData'],fieldListLimits:{'InventoryElementSaveData._itemList':1024}},document=readDocument(decoded.plaintext,projection),input={backupSha256:bundle.bundleDigest,backupRevision:bundle.bundleDigest,container:'slot100,savedgame',payload:'save',payloadSha256:artifact.sha256,plaintextSha256:document.plaintextSha256,schemaSha256:document.schemaSha256};
 bindPreparedSource(bound.source,bound.metadata,{context,container:input.container,payload:input.payload,payloadSha256:input.payloadSha256,decoded,document,projection});
 const reused=preparedSource(bound.source,bound.metadata,input);assert.equal(reused.decoded,decoded);assert.equal(reused.document,document);assert.equal(reused.encoded.equals(encoded),true);assert.notEqual(reused.encoded,encoded);
 assert.equal(preparedSource(JSON.parse(JSON.stringify(bound.source)),bound.metadata,input),null);
 assert.throws(()=>bindPreparedSource(bound.source,bound.metadata,{context:{...context},container:input.container,payload:input.payload,payloadSha256:input.payloadSha256,decoded,document}),{code:'CRIMSON_PREPARED_SOURCE_INVALID'});
 assert.throws(()=>preparedSource(bound.source,bound.metadata,{...input,payloadSha256:hash('different artifact')}),{code:'CRIMSON_PREPARED_SOURCE_CHANGED'});
 context.executionLock.digest=hash('another lock');assert.throws(()=>preparedSource(bound.source,bound.metadata,input),{code:'CRIMSON_PREPARED_SOURCE_CHANGED'});
});

test('digest-free strict traversal preserves every field and format assertion',async()=>{
 const {readDocument}=await import('../src/crimson-document.mjs'),{typedParcFixture}=await import('./synthetic-parc.mjs'),fixture=typedParcFixture(),options={captureTypes:[],listLimit:0};
 const full=readDocument(fixture.raw,options),scoped=readDocument(fixture.raw,{...options,hashPlaintext:false});
 assert.equal(scoped.plaintextSha256,null);assert.equal(scoped.schemaSha256,full.schemaSha256);assert.deepEqual(scoped.audit,full.audit);
 const changed=Buffer.from(fixture.raw);changed[fixture.markerOffset]=0;
 assert.throws(()=>readDocument(changed,{...options,hashPlaintext:false}),{code:'PARC_TYPED_INVALID'});
 assert.throws(()=>readDocument(fixture.raw,{hashPlaintext:'disabled'}),{code:'PARC_TYPED_INVALID'});
});

test('structural composition reuses only its exact prepared original; cloned sources remain fully checked',async()=>{
 const {decodeSave}=await import('../src/crimson-codec.mjs'),{readDocument}=await import('../src/crimson-document.mjs'),{bindPreparedSource,preparedSource}=await import('../src/source-binding.mjs'),{structuralSourcePayload}=await import('../src/structural-draft.mjs');
 const header=Buffer.alloc(128);header.write('SAVE');header.writeUInt16LE(2,4);header.writeUInt16LE(128,6);header[0x70]=37;
 const encoded=await encodeSave(quantityParcFixture().raw,header,{nonce:Buffer.alloc(16,3)}),lobby=Buffer.from('invented unchanged paired sidecar'),files=new Map([['main',encoded],['sidecar',lobby]]),bundle={id:'paired-synthetic',bundleDigest:hash('paired-synthetic'),artifacts:[...files].map(([id,bytes])=>({id,logicalPath:'slot100,savedgame/'+(id==='main'?'save':'lobby'),role:id==='main'?'main':'sidecar',byteLength:bytes.length,sha256:hash(bytes)}))},context={executionLock:{digest:hash('paired-lock')},readArtifact:id=>files.get(id)},bound=sourceFromBundle(bundle,context),decoded=await decodeSave(encoded),document=readDocument(decoded.plaintext),input={backupSha256:bundle.bundleDigest,backupRevision:bundle.bundleDigest,container:'slot100,savedgame',payload:'save',payloadSha256:hash(encoded),plaintextSha256:document.plaintextSha256,schemaSha256:document.schemaSha256};
 bindPreparedSource(bound.source,bound.metadata,{context,container:input.container,payload:input.payload,payloadSha256:input.payloadSha256,decoded,document});
 const prepared=preparedSource(bound.source,bound.metadata,input),trusted=structuralSourcePayload(bound.source,bound.metadata,input);assert.equal(trusted.prepared,prepared);assert.equal(trusted.bytes,prepared.encoded);assert.equal(trusted.prepared.decoded,decoded);assert.equal(trusted.prepared.document,document);
 const copy=JSON.parse(JSON.stringify(bound.source)),untrusted=structuralSourcePayload(copy,bound.metadata,input);assert.equal(untrusted.prepared,null);assert.notEqual(untrusted.bytes,trusted.bytes);assert.equal(untrusted.bytes.equals(encoded),true);assert.equal((await decodeSave(untrusted.bytes)).plaintext.equals(decoded.plaintext),true);
 copy.containers[0].blobs[0].data=Buffer.from('tampered paired bytes').toString('base64');assert.throws(()=>structuralSourcePayload(copy,bound.metadata,input),{code:'CRIMSON_ARTIFACT_SOURCE_INVALID'});
 assert.throws(()=>structuralSourcePayload(bound.source,bound.metadata,{...input,plaintextSha256:hash('stale plaintext')}),{code:'CRIMSON_PREPARED_SOURCE_CHANGED'});
 assert.equal(encoded.equals(await encodeSave(decoded.plaintext,decoded.header,{nonce:decoded.header.subarray(0x1a,0x2a)})),true);assert.equal(lobby.equals(files.get('sidecar')),true);
});

test('prepared composition never substitutes for the required matching paired source',async()=>{
 const {decodeSave}=await import('../src/crimson-codec.mjs'),{readDocument}=await import('../src/crimson-document.mjs'),{bindPreparedSource}=await import('../src/source-binding.mjs'),{structuralSourcePayload}=await import('../src/structural-draft.mjs');
 const header=Buffer.alloc(128);header.write('SAVE');header.writeUInt16LE(2,4);header.writeUInt16LE(128,6);
 const encoded=await encodeSave(quantityParcFixture().raw,header,{nonce:Buffer.alloc(16,4)}),bundle={id:'unpaired',bundleDigest:hash('unpaired'),artifacts:[{id:'main',logicalPath:'slot100,savedgame/save',role:'main',byteLength:encoded.length,sha256:hash(encoded)}]},context={executionLock:{digest:hash('unpaired-lock')},readArtifact:()=>encoded},bound=sourceFromBundle(bundle,context),decoded=await decodeSave(encoded),document=readDocument(decoded.plaintext),input={backupSha256:bundle.bundleDigest,backupRevision:bundle.bundleDigest,container:'slot100,savedgame',payload:'save',payloadSha256:hash(encoded),plaintextSha256:document.plaintextSha256,schemaSha256:document.schemaSha256};
 bindPreparedSource(bound.source,bound.metadata,{context,container:input.container,payload:input.payload,payloadSha256:input.payloadSha256,decoded,document});
 assert.throws(()=>structuralSourcePayload(bound.source,bound.metadata,input),{code:'STRUCTURAL_SOURCE_CHANGED'});assert.throws(()=>structuralSourcePayload(JSON.parse(JSON.stringify(bound.source)),bound.metadata,input),{code:'STRUCTURAL_SOURCE_CHANGED'});
});
