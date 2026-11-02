// SPDX-License-Identifier: Apache-2.0
// The optimized guest text path must preserve Node's exact legacy tuple bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {runPlugin,createExecutionLock} from '../../../sdk/runner.mjs';
import {createSaveBundle} from '../../../sdk/contracts.mjs';

const tuple=event=>JSON.stringify([event.path,event.type,event.bytes,event.value])+'\n';
const event=(value,path='$[0].Synthetic._list[0]._value')=>({path,type:'SyntheticScalar',bytes:8,value});
const oracle=events=>({sha256:createHash('sha256').update(events.map(tuple).join(''),'utf8').digest('hex'),count:events.length});
const source=`import{createScalarDigest}from'./scalar-digest.mjs';import{createHash}from'../../../sdk/crypto.mjs';import{TextDecoder}from'../../../sdk/text-encoding.mjs';export default{detect(bundle,ctx){const groups=JSON.parse(new TextDecoder().decode(ctx.readArtifact(bundle.artifacts[0].id))),probe=createHash('sha256'),nativeText=typeof probe.updateText==='function';probe.destroy();return{nativeText,groups:groups.map(events=>{const digest=createScalarDigest();for(const event of events)digest.update(event);return digest.digest();})};}};`;

test('actual isolated scalar text batches match native tuple SHA across ASCII, BMP, BOM and surrogate boundaries',async()=>{
 const base=event(''),prefix=JSON.stringify([base.path,base.type,base.bytes,'']).slice(0,-2).length;
 const groups=[
  [],[event('one'),event('two')],
  [event('x'.repeat(65536-prefix-1)+'z'),event('tail')],
  [event('x'.repeat(16384-prefix-1)+'🐈'),event('tail')],
  [event('猫'.repeat(16384-prefix-1)+'🐈'),event('tail')],
  [event('\ufeff'.repeat(17000)),event('x'.repeat(16384-prefix)+'\ufeff'),event('\u0000'),event('\ud800 lone \udfff'),event('猫🐈é\u0800')],
  Array.from({length:450},(_,i)=>event((i%2?'猫🐈':'x').repeat(100),`$[0].Synthetic._list[${i}]._value`)),
  [event('x'.repeat(180000)),event('猫🐈'.repeat(22000))]
 ];
 const compiled=(await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),sourcefile:'scalar-digest-vectors.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;
 const pkg={manifest:{manifestVersion:'0.1',id:'example.scalar-text-oracle',version:'0.1.0',entrypoints:{runtime:'runtime/index.mjs',runtimeProfile:'isolated-js-v1'}},files:{'runtime/index.mjs':compiled}};
 const bytes=Buffer.from(JSON.stringify(groups)),descriptor={id:'synthetic-tuples',logicalPath:'synthetic-tuples.json',role:'main',byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},bundle=createSaveBundle([descriptor]);
 const result=await runPlugin({package:pkg,bundle,artifacts:new Map([[descriptor.id,bytes]]),executionLock:createExecutionLock(pkg),method:'detect',args:[bundle]});
 assert.equal(result.result.nativeText,true);assert.deepEqual(result.result.groups,groups.map(oracle));
 assert.equal(result.metrics.cryptoLiveStreams,0);assert.ok(result.metrics.cryptoBytes>0);assert.ok(result.metrics.hostCalls<1500);
});
