// Synthetic UTF-8 vectors; native WHATWG TextDecoder is the independent oracle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {runPlugin,createExecutionLock} from '../runner.mjs';
import {createSaveBundle} from '../contracts.mjs';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
async function run(code,{bytes=new Uint8Array(),limits,host}={}){
 const source=(await build({stdin:{contents:code,resolveDir:root,sourcefile:'synthetic-utf8.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;
 const pkg={manifest:{manifestVersion:'0.1',id:'test.utf8-native',version:'0.1.0',entrypoints:{runtime:'runtime.mjs',runtimeProfile:'isolated-js-v1'}},files:{'runtime.mjs':source}},descriptor={id:'vectors',logicalPath:'vectors.json',role:'main',byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},bundle=createSaveBundle([descriptor]);
 return runPlugin({package:pkg,executionLock:createExecutionLock(pkg),bundle,artifacts:new Map([[descriptor.id,bytes]]),method:'detect',args:[bundle],limits},host);
}
test('large native UTF-8 decoding preserves NUL, BOM, astral text, view bounds and replacement/fatal behavior',async()=>{
 const native=new TextEncoder(),prefix=native.encode('a'.repeat(4096)),vectors=[];
 for(const tail of [native.encode('猫🐈é\u0000tail'),Uint8Array.of(0xc0,0x80),Uint8Array.of(0xed,0xa0,0x80),Uint8Array.of(0xf0,0x9f)])for(const fatal of [false,true])vectors.push({bytes:[...prefix,...tail],fatal,ignoreBOM:false});
 for(const ignoreBOM of [false,true])vectors.push({bytes:[0xef,0xbb,0xbf,...prefix],fatal:true,ignoreBOM});
 const bytes=native.encode(JSON.stringify(vectors));
 const expected=vectors.map(v=>{try{return new TextDecoder('utf-8',v).decode(Uint8Array.from(v.bytes));}catch{return 'fatal-error';}});
 const result=await run(`import{TextDecoder}from'./text-encoding.mjs';export default{detect(b,c){const groups=JSON.parse(new TextDecoder().decode(c.readArtifact(b.artifacts[0].id)));return groups.map(v=>{const full=Uint8Array.from([77,...v.bytes,88]),view=full.subarray(1,full.length-1);try{return new TextDecoder('utf-8',v).decode(view)}catch(e){if(e instanceof TypeError)return 'fatal-error';throw e}})}};`,{bytes});
 assert.deepEqual(result.result,expected);assert.ok(result.metrics.textBytes>bytes.length);
});
test('native UTF-8 helper rejects false buffers, invalid flags and oversized input before accepting work',async()=>{
 for(const [expression,code] of [[`({byteLength:0})`,'FORMAT_BINARY_BUFFER_REQUIRED'],[`new Proxy(new ArrayBuffer(8),{})`,'FORMAT_BINARY_BUFFER_REQUIRED'],[`new ArrayBuffer(8*1024*1024+1)`,'FORMAT_BINARY_INPUT_LIMIT']]){
  await assert.rejects(run(`export default{detect(){return __saveriftUtf8Decode(${expression},1,0)}};`),{code});
 }
 await assert.rejects(run(`export default{detect(){return __saveriftUtf8Decode(new ArrayBuffer(0),2,0)}};`),{code:'FORMAT_TEXT_OPTIONS_INVALID'});
});
test('invalid UTF-8 still consumes the shared bounded byte budget',async()=>{
 await assert.rejects(run(`export default{detect(){const a=new Uint8Array(4*1024*1024);a[0]=255;for(let i=0;i<33;i++)__saveriftUtf8Decode(a.buffer,1,0);return true}};`),{code:'FORMAT_TEXT_BYTE_LIMIT'});
});
test('native text conversion charges weighted work to the existing callback quota',async()=>{
 await assert.rejects(run(`export default{detect(){return __saveriftUtf8Decode(new ArrayBuffer(1024*1024),0,0)}};`,{limits:{hostCalls:2}}),{code:'HOST_CALL_LIMIT'});
});
