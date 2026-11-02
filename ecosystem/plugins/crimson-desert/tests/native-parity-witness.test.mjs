// SPDX-License-Identifier: Apache-2.0
// Synthetic originals only. No witness crosses a source/context/engine boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Buffer} from '../../../sdk/buffer.mjs';
import {hash} from '../../../sdk/crypto.mjs';
import {createSaveBundle} from '../../../sdk/contracts.mjs';
import {runPlugin,createExecutionLock} from '../../../sdk/runner.mjs';
import {encodeSave,decodeSave} from '../src/crimson-codec.mjs';
import {readDocument} from '../src/crimson-document.mjs';
import {sourceFromBundle,bindPreparedSource,preparedSource,preparedSourceNativeParity} from '../src/source-binding.mjs';
import {quantityParcFixture} from './synthetic-parc.mjs';

async function fixture(){
 const header=Buffer.alloc(128);header.write('SAVE');header.writeUInt16LE(2,4);header.writeUInt16LE(128,6);header[0x70]=37;
 const encoded=await encodeSave(quantityParcFixture().raw,header,{nonce:Buffer.alloc(16,9)}),descriptor={id:'main',logicalPath:'slot100,savedgame/save',role:'main',byteLength:encoded.length,sha256:hash(encoded)},bundle={id:'synthetic-witness',bundleDigest:hash('synthetic-witness'),artifacts:[descriptor]},context={executionLock:{digest:hash('synthetic-lock'),connector:{id:'example.synthetic',digest:hash('synthetic-package')}},readArtifact:()=>encoded},bound=sourceFromBundle(bundle,context),decoded=await decodeSave(encoded),document=readDocument(decoded.plaintext),input={backupSha256:bundle.bundleDigest,backupRevision:bundle.bundleDigest,container:'slot100,savedgame',payload:'save',payloadSha256:descriptor.sha256,plaintextSha256:document.plaintextSha256,schemaSha256:document.schemaSha256};
 bindPreparedSource(bound.source,bound.metadata,{context,container:input.container,payload:input.payload,payloadSha256:descriptor.sha256,decoded,document});
 return {...bound,context,decoded,document,input,encoded:preparedSource(bound.source,bound.metadata,input).encoded};
}
const prove=(f,encoder)=>preparedSourceNativeParity(f.source,f.metadata,f.input,f.decoded,f.encoded,encoder);

test('native parity is proven once only for the exact original and encoder in one prepared snapshot',async()=>{
 const f=await fixture();let calls=0;const encoder=(...args)=>{calls++;return encodeSave(...args);};
 assert.equal(await prove(f,encoder),true);assert.equal(calls,1);
 assert.equal(await prove(f,encoder),true);assert.equal(calls,1);
 const otherEncoder=(...args)=>{calls++;return encodeSave(...args);};
 assert.equal(await prove(f,otherEncoder),true);assert.equal(calls,2);
 assert.equal(await prove(f,otherEncoder),true);assert.equal(calls,2);
 // A different source/context with identical bytes still needs its own proof.
 assert.equal(await prove(await fixture(),otherEncoder),true);assert.equal(calls,3);
});

test('source/metadata/decoded clones and JSON claims cannot inherit a native parity witness',async()=>{
 const f=await fixture();let calls=0;const encoder=(...args)=>{calls++;return encodeSave(...args);};await prove(f,encoder);
 const source=JSON.parse(JSON.stringify(f.source));source.nativeParityVerified=true;
 const cloned={...f,source,input:{...f.input,nativeParityVerified:true}};
 assert.equal(await prove(cloned,encoder),true);assert.equal(await prove(cloned,encoder),true);assert.equal(calls,3);
 assert.equal(await prove({...f,metadata:{...f.metadata}},encoder),true);assert.equal(calls,4);
 assert.equal(await prove({...f,decoded:{...f.decoded},encoded:Buffer.from(f.encoded)},encoder),true);assert.equal(calls,5);
});

test('cached parity rejects changes to bytes, decoded flags, document or execution/package context',async()=>{
 const mutations=[f=>{f.encoded[128]^=1;},f=>{f.decoded.plaintext[20]^=1;},f=>{f.decoded.header[0x70]^=1;},f=>{f.decoded.version=1;},f=>{f.decoded.flags=0;},f=>{f.document.plaintextSha256=hash('changed-document');},f=>{f.context.executionLock.digest=hash('changed-lock');},f=>{f.context.executionLock={...f.context.executionLock};},f=>{f.context.executionLock.connector.digest=hash('changed-package');}];
 for(const mutate of mutations){const f=await fixture();let calls=0;const encoder=(...args)=>{calls++;return encodeSave(...args);};await prove(f,encoder);mutate(f);await assert.rejects(prove(f,encoder),{code:'CRIMSON_PREPARED_SOURCE_CHANGED'});assert.equal(calls,1);}
});

test('failed or asynchronously mutated native proofs never establish a witness',async()=>{
 const f=await fixture();let failedCalls=0;const bad=async()=>{failedCalls++;return Buffer.from('not the original save');};
 assert.equal(await prove(f,bad),false);assert.equal(await prove(f,bad),false);assert.equal(failedCalls,2);
 const original=f.decoded.plaintext[20];let mutatedCalls=0;const mutating=async(...args)=>{mutatedCalls++;const result=await encodeSave(...args);f.decoded.plaintext[20]^=1;return result;};
 await assert.rejects(prove(f,mutating),{code:'CRIMSON_PREPARED_SOURCE_CHANGED'});f.decoded.plaintext[20]=original;
 let validCalls=0;const valid=(...args)=>{validCalls++;return encodeSave(...args);};assert.equal(await prove(f,valid),true);assert.equal(validCalls,1);assert.equal(mutatedCalls,1);
});

test('each fresh isolated engine independently proves its original native envelope',async()=>{
 const f=await fixture(),descriptor={id:'main',logicalPath:'slot100,savedgame/save',role:'main',byteLength:f.encoded.length,sha256:hash(f.encoded)},bundle=createSaveBundle([descriptor]);
 const entry=`import{installTextEncoding}from'../../../sdk/text-encoding.mjs';installTextEncoding();import{Buffer}from'../../../sdk/buffer.mjs';import{sourceFromBundle,bindPreparedSource,preparedSource,preparedSourceNativeParity}from'./source-binding.mjs';import{decodeSave,encodeSave}from'./crimson-codec.mjs';import{readDocument}from'./crimson-document.mjs';let calls=0;const encoder=(...args)=>{calls++;return encodeSave(...args)};export default{async detect(bundle,ctx){const bound=sourceFromBundle(bundle,ctx),decoded=await decodeSave(Buffer.from(ctx.readArtifact(bundle.artifacts[0].id))),document=readDocument(decoded.plaintext),input={backupSha256:bundle.bundleDigest,backupRevision:bundle.bundleDigest,container:'slot100,savedgame',payload:'save',payloadSha256:bundle.artifacts[0].sha256,plaintextSha256:document.plaintextSha256,schemaSha256:document.schemaSha256};bindPreparedSource(bound.source,bound.metadata,{context:ctx,container:input.container,payload:input.payload,payloadSha256:input.payloadSha256,decoded,document});const encoded=preparedSource(bound.source,bound.metadata,input).encoded,proofs=[];for(let i=0;i<2;i++)proofs.push(await preparedSourceNativeParity(bound.source,bound.metadata,input,decoded,encoded,encoder));return{calls,proofs}}};`;
 const compiled=(await build({stdin:{contents:entry,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),sourcefile:'native-parity-test.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text,pkg={manifest:{manifestVersion:'0.1',id:'example.native-parity-control',version:'0.1.0',entrypoints:{runtime:'runtime/index.mjs',runtimeProfile:'isolated-js-v1'}},files:{'runtime/index.mjs':compiled}};
 for(let i=0;i<2;i++){const r=await runPlugin({package:pkg,executionLock:createExecutionLock(pkg),bundle,artifacts:new Map([[descriptor.id,f.encoded]]),method:'detect',args:[bundle]});assert.deepEqual(r.result,{calls:1,proofs:[true,true]});assert.equal(r.metrics.contextsCreated,1);}
});
