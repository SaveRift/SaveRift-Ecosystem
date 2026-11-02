// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createCipheriv} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {newQuickJSWASMModuleFromVariant} from 'quickjs-emscripten-core';
import {runPlugin,createExecutionLock} from '../runner.mjs';
import {createSaveBundle} from '../contracts.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function request(code,bytes=new Uint8Array([1])){
 const pkg={manifest:{manifestVersion:'0.1',id:'example.lz4-control',version:'0.1.0',entrypoints:{runtime:'runtime/index.mjs',runtimeProfile:'isolated-js-v1'}},files:{'runtime/index.mjs':code}};
 const descriptor={id:'input',role:'main',logicalPath:'synthetic.bin',byteLength:bytes.length,sha256:sha(bytes)},bundle=createSaveBundle([descriptor]);
 return {package:pkg,executionLock:createExecutionLock(pkg),bundle,artifacts:new Map([['input',bytes]]),method:'detect',args:[bundle]};
}
test('actual isolated bounded compression matches independent liblz4 golden blocks',async()=>{
 const entry=`import{Buffer}from'../buffer.mjs';import{sha256}from'../crypto.mjs';import{compressStandardLz4}from'../../plugins/crimson-desert/src/lz4-standard.mjs';export default{detect(bundle,ctx){const original=ctx.readArtifact('input'),before=sha256(original),bytes=Buffer.alloc(original.length+9);bytes.set(original,7);const output=compressStandardLz4(bytes.subarray(7,7+original.length));return {sha256:sha256(output),length:output.length,unchanged:sha256(original)===before,roundTrip:sha256(new Uint8Array(__saveriftLz4Decompress(output.buffer.slice(output.byteOffset,output.byteOffset+output.byteLength),original.length)))===before};}};`;
 const code=(await build({stdin:{contents:entry,resolveDir:fileURLToPath(new URL('.',import.meta.url)),sourcefile:'lz4-goldens.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;
 const controls=[[65546,false,65804,'1b7bb21a5ce4c18698a5d94bf40ecba03b38a6cba093911a0f82a66975c1e9e6'],[65547,false,65805,'8c212ca6972f721f07df0eb564aa657ac8e585662e118bcdf5d05fc492f659ea'],[1048576,false,1052690,'393421aa2973fedda76053f5a29dfce88962adf5a9f51ddb0ca03547c34cd058'],[1048576,true,542347,'a68e5f17befaee5a9d7c2adb09e3d987077827408bfe4182806c932891c8c98c']];
 for(const [size,repeated,length,digest] of controls){const bytes=new Uint8Array(size);let state=0x8badf00d;for(let i=0;i<size;i++){state^=state<<13;state^=state>>>17;state^=state<<5;bytes[i]=repeated&&i>=2000&&i%1000<500?bytes[i-2000]:state&255;}
  const result=await runPlugin(request(code,bytes));assert.deepEqual(result.result,{sha256:digest,length,unchanged:true,roundTrip:true});assert.equal(result.metrics.compressionBytes,size);assert.equal(result.artifacts.size,0);
 }
});
test('compression rejects oversized or spoofed buffers before copying and charges the shared callback budget',async()=>{
 let copies=0;
 const host={async instantiateModule(variant){const module=await newQuickJSWASMModuleFromVariant(variant),newRuntime=module.newRuntime.bind(module);module.newRuntime=(...args)=>{const runtime=newRuntime(...args),newContext=runtime.newContext.bind(runtime);runtime.newContext=(...args)=>{const context=newContext(...args),get=context.getArrayBuffer.bind(context);context.getArrayBuffer=(...args)=>{copies++;return get(...args);};return context;};return runtime;};return module;}};
 for(const [setup,code]of [[`const b=new ArrayBuffer(8388609);Object.defineProperty(b,'byteLength',{value:1});`,'FORMAT_COMPRESSION_INPUT_LIMIT'],[`const b=new Proxy(new ArrayBuffer(1),{});`,'FORMAT_COMPRESSION_BUFFER_REQUIRED'],[`const b={get byteLength(){throw Error('must not run');}};`,'FORMAT_COMPRESSION_BUFFER_REQUIRED']]){
  await assert.rejects(runPlugin(request(`export default{detect(){${setup}return __saveriftLz4Compress(b);}}`),host),e=>e.code===code);assert.equal(copies,0);
 }
 await assert.rejects(runPlugin({...request(`export default{detect(){return __saveriftLz4Compress(new ArrayBuffer(65537));}}`),limits:{hostCalls:1}},host),e=>e.code==='HOST_CALL_LIMIT');assert.equal(copies,0);
 const controller=new AbortController();await assert.rejects(runPlugin({...request(`export default{detect(_,ctx){ctx.reportProgress({phase:'cancel',completed:0});return __saveriftLz4Compress(new ArrayBuffer(32));}}`),signal:controller.signal},{onProgress(){controller.abort();}}),e=>e.code==='JOB_ABORTED');
});
test('actual isolated original ChaCha math matches OpenSSL including counter carry',async()=>{
 const key=Uint8Array.from({length:32},(_,i)=>i*3),nonce=new Uint8Array(16).fill(255);nonce[0]=254;
 const entry=`import{sha256}from'../crypto.mjs';export default{detect(_,ctx){const bytes=ctx.readArtifact('input'),key=Uint8Array.from(${JSON.stringify([...key])}),nonce=Uint8Array.from(${JSON.stringify([...nonce])}),output=new Uint8Array(__saveriftChaCha20(bytes.buffer,key.buffer,nonce.buffer));return {sha256:sha256(output),roundTrip:sha256(new Uint8Array(__saveriftChaCha20(output.buffer,key.buffer,nonce.buffer)))===sha256(bytes)};}};`;
 const code=(await build({stdin:{contents:entry,resolveDir:fileURLToPath(new URL('.',import.meta.url)),sourcefile:'chacha-host-vector.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;
 for(const size of [1,63,64,65,129,1048576]){const bytes=Uint8Array.from({length:size},(_,i)=>(i*137+(i>>>3))&255),expected=createCipheriv('chacha20',key,nonce).update(bytes),result=await runPlugin(request(code,bytes));assert.deepEqual(result.result,{sha256:sha(expected),roundTrip:true});assert.equal(result.artifacts.size,0);}
});
test('binary math checks input/key/nonce and decompressed size before materialization',async()=>{
 let copies=0;const host={async instantiateModule(variant){const module=await newQuickJSWASMModuleFromVariant(variant),newRuntime=module.newRuntime.bind(module);module.newRuntime=(...args)=>{const runtime=newRuntime(...args),newContext=runtime.newContext.bind(runtime);runtime.newContext=(...args)=>{const context=newContext(...args),get=context.getArrayBuffer.bind(context);context.getArrayBuffer=(...args)=>{copies++;return get(...args);};return context;};return runtime;};return module;}};
 const cases=[["__saveriftChaCha20(new ArrayBuffer(8388609),new ArrayBuffer(32),new ArrayBuffer(16))",'FORMAT_BINARY_INPUT_LIMIT'],["__saveriftChaCha20(new ArrayBuffer(32),new ArrayBuffer(31),new ArrayBuffer(16))",'FORMAT_BINARY_INPUT_LIMIT'],["__saveriftChaCha20(new ArrayBuffer(32),new ArrayBuffer(32),new Proxy(new ArrayBuffer(16),{}))",'FORMAT_BINARY_BUFFER_REQUIRED'],["__saveriftLz4Decompress(new ArrayBuffer(32),33554433)",'FORMAT_BINARY_OUTPUT_LIMIT'],["__saveriftLz4Decompress(new ArrayBuffer(32),NaN)",'FORMAT_BINARY_OUTPUT_LIMIT']];
 for(const [call,code]of cases){await assert.rejects(runPlugin(request(`export default{detect(){return ${call};}}`),host),e=>e.code===code);assert.equal(copies,0);}
});
