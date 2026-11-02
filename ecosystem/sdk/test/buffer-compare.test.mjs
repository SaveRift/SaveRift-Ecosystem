// Synthetic public byte vectors and an independent native Node oracle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer as NativeBuffer} from 'node:buffer';
import {Buffer} from '../buffer.mjs';
import {build} from 'esbuild';
import {runPlugin,createExecutionLock} from '../runner.mjs';
import {createSaveBundle} from '../contracts.mjs';
import {fileURLToPath} from 'node:url';
const oracle=(a,b)=>Math.sign(NativeBuffer.compare(a,b));
test('portable comparison preserves ordering, lengths and byte views without modifying inputs',()=>{
 for(const length of [0,1,3,4,5,63,64,65,257,4097])for(const offset of [0,1,2,3]){
  const a=Buffer.alloc(length+offset+4,17).subarray(offset,offset+length),b=Buffer.from(a);
  const original=NativeBuffer.from(a);assert.equal(Buffer.compare(a,b),0);assert.equal(a.equals(b),true);
  for(const where of [...new Set([0,1,3,4,Math.max(0,length-1)])].filter(i=>i<length))for(const delta of [-1,1]){b[where]+=delta;assert.equal(Buffer.compare(a,b),oracle(a,b));assert.equal(Buffer.compare(b,a),oracle(b,a));assert.equal(a.equals(b),false);b[where]-=delta;}
  assert.equal(Buffer.compare(a,b.subarray(0,Math.max(0,length-1))),oracle(a,b.subarray(0,Math.max(0,length-1))));
  assert.deepEqual(NativeBuffer.from(a),original);assert.equal(Buffer.compare(new Uint8Array(a),b),0);
 }
 assert.throws(()=>Buffer.compare('not bytes',Buffer.alloc(1)),TypeError);
 assert.throws(()=>Buffer.alloc(1).equals(new Uint8Array(1)),TypeError);
});
test('large unaligned comparisons and equality use the same semantics in an actual isolated engine',async()=>{
 const entry=`import {Buffer} from './buffer.mjs';export default {detect(){const left=Buffer.alloc(4*1024*1024+3,17).subarray(1),right=Buffer.alloc(left.length+3,17).subarray(3);const equal=left.equals(right);right[right.length-1]=18;return {equal,order:Buffer.compare(left,right),reverse:Buffer.compare(right,left),sourceLast:left[left.length-1]};}};`;
 const code=(await build({stdin:{contents:entry,resolveDir:fileURLToPath(new URL('../',import.meta.url)),sourcefile:'synthetic-compare.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;
 const pkg={manifest:{manifestVersion:'0.1',id:'test.binary-compare',version:'0.1.0',entrypoints:{runtime:'runtime.mjs',runtimeProfile:'isolated-js-v1'}},files:{'runtime.mjs':code}},bundle=createSaveBundle([]);
 const result=await runPlugin({package:pkg,executionLock:createExecutionLock(pkg),bundle,artifacts:new Map(),method:'detect',args:[bundle]});
 assert.deepEqual(result.result,{equal:true,order:-1,reverse:1,sourceLast:17});assert.equal(result.metrics.hostCalls,0);
});
