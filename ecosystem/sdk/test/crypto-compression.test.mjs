// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash as nativeHash,createHmac} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {sha256,createHash,hmacSha256} from '../crypto.mjs';
import {createSaveBundle,LIMITS} from '../contracts.mjs';
import {runPlugin,createExecutionLock} from '../runner.mjs';

const digest=value=>nativeHash('sha256').update(value).digest('hex');
const sample=length=>Uint8Array.from({length},(_,i)=>(i*137+(i>>>3))&255);

test('interpreter SHA compression matches independent native boundary and unaligned-view vectors',()=>{
  assert.equal(sha256(''),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for(const size of [1,2,3,55,56,57,63,64,65,119,120,127,128,129,511,512,4097,65537,1048576]){
    const whole=sample(size+11),input=whole.subarray(7,7+size);
    assert.equal(sha256(input),digest(input),'input bytes '+size);
    const hash=createHash('sha256');let offset=0;
    while(offset<input.length){const end=Math.min(input.length,offset+(offset%97)+1);hash.update(input.subarray(offset,end));offset=end;}
    assert.equal(hash.digest('hex'),digest(input),'streaming bytes '+size);
    assert.throws(()=>hash.update(input),/finalized/);
  }
  const millionA=new Uint8Array(1000000).fill(97);
  assert.equal(sha256(millionA),'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
});

test('HMAC and interleaved streaming retain independent state and long-key handling',()=>{
  const input=sample(4097);
  for(const length of [0,1,31,32,63,64,65,127,1024]){
    const key=sample(length);
    assert.equal(hmacSha256(key,input).toString('hex'),createHmac('sha256',key).update(input).digest('hex'));
  }
  const a=createHash('sha256'),b=createHash('sha256'),x=sample(2049),y=sample(1051);
  for(let offset=0;offset<Math.max(x.length,y.length);offset+=17){a.update(x.subarray(offset,offset+17));b.update(y.subarray(offset,offset+17));}
  assert.equal(a.digest('hex'),digest(x));assert.equal(b.digest('hex'),digest(y));
});

test('the optimized public hash/HMAC run inside the unchanged Wasm resource boundary',async()=>{
  const code=`import {hash,hmacSha256} from './crypto.mjs';export default {detect(bundle,ctx){const bytes=ctx.readArtifact(bundle.artifacts[0].id);return {sha256:hash(bytes),hmac:hmacSha256(new Uint8Array([1,2,3]),bytes).toString('hex'),ambient:[typeof process,typeof fetch,typeof crypto]};}};`;
  const compiled=(await build({stdin:{contents:code,resolveDir:fileURLToPath(new URL('..',import.meta.url)),sourcefile:'hash-conformance.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;
  const bytes=sample(1048577),artifact={id:'synthetic-crypto-input',logicalPath:'synthetic.bytes',role:'main',byteLength:bytes.length,sha256:digest(bytes)},bundle=createSaveBundle([artifact]);
  const pkg={manifest:{manifestVersion:'0.1',id:'example.crypto-conformance',version:'0.1.0',entrypoints:{runtime:'runtime/index.mjs',runtimeProfile:'isolated-js-v1'}},files:{'runtime/index.mjs':compiled}};
  const result=await runPlugin({package:pkg,bundle,artifacts:new Map([[artifact.id,bytes]]),executionLock:createExecutionLock(pkg),method:'detect',args:[bundle]});
  assert.equal(result.result.sha256,digest(bytes));assert.equal(result.result.hmac,createHmac('sha256',new Uint8Array([1,2,3])).update(bytes).digest('hex'));
  assert.deepEqual(result.result.ambient,['undefined','undefined','undefined']);
  assert.ok(result.metrics.memoryBytes<=LIMITS.memoryBytes);assert.ok(result.metrics.interrupts<=LIMITS.interrupts);assert.equal(result.metrics.hostCalls,1);
});
