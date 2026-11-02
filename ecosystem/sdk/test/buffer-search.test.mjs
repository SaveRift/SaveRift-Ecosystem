// Independent Node oracle; public invented byte sequences only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer as NativeBuffer} from 'node:buffer';
import {Buffer} from '../buffer.mjs';
import {build} from 'esbuild';
import {runPlugin,createExecutionLock} from '../runner.mjs';
import {createSaveBundle} from '../contracts.mjs';
import {fileURLToPath} from 'node:url';
test('portable byte search matches Node for offsets, overlaps, views and missing identities',()=>{
 for(const input of [[1,1,1,2,1,1,2,3],Array.from({length:1024},(_,i)=>i%251),[]])for(const needle of [[1],[1,1,2],[1,2,3],[255,254],[0],input.length?input:[1]])for(const offset of [undefined,-10000,-3,-1,0,1,3,10000]){
  const bytes=Buffer.from([99,...input,99]).subarray(1,input.length+1),find=Buffer.from([99,...needle,99]).subarray(1,needle.length+1),before=NativeBuffer.from(bytes),expected=before.indexOf(NativeBuffer.from(find),offset);
  assert.equal(bytes.indexOf(find,offset),expected);assert.equal(bytes.includes(find,offset),expected!==-1);assert.deepEqual(NativeBuffer.from(bytes),before);
 }
 const text=Buffer.from('aabbccbb');assert.equal(text.indexOf('bb'),2);assert.equal(text.indexOf(98),2);assert.equal(text.indexOf(Buffer.from('bb'),-3),6);assert.equal(text.indexOf(Buffer.alloc(0)),-1);
 const wide=Buffer.from('abcabc','utf16le');assert.equal(wide.indexOf(Buffer.from('bc','utf16le'),0,'utf16le'),2);
});
test('large byte search preserves exact first-match behavior in an actual isolated engine',async()=>{
 const entry=`import {Buffer} from './buffer.mjs';export default {detect(){const raw=Buffer.alloc(4*1024*1024,17),needle=Buffer.from([37,4,2,19,0,0,0,0]);needle.copy(raw,raw.length-needle.length);return {found:raw.indexOf(needle),next:raw.indexOf(needle,raw.length-7),missing:raw.includes(Buffer.from([37,4,2,18,0,0,0,0])),last:raw[raw.length-1]};}};`;
 const code=(await build({stdin:{contents:entry,resolveDir:fileURLToPath(new URL('../',import.meta.url)),sourcefile:'synthetic-search.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;
 const pkg={manifest:{manifestVersion:'0.1',id:'test.binary-search',version:'0.1.0',entrypoints:{runtime:'runtime.mjs',runtimeProfile:'isolated-js-v1'}},files:{'runtime.mjs':code}},bundle=createSaveBundle([]),result=await runPlugin({package:pkg,executionLock:createExecutionLock(pkg),bundle,artifacts:new Map(),method:'detect',args:[bundle]});
 assert.deepEqual(result.result,{found:4*1024*1024-8,next:-1,missing:false,last:0});assert.equal(result.metrics.hostCalls,0);
});
