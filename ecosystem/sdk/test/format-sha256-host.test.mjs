// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash as nativeHash,createHmac} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {newQuickJSWASMModuleFromVariant} from 'quickjs-emscripten-core';
import {createFormatSha256Host,FORMAT_SHA256_LIMITS as CAPS} from '../format-sha256-host.mjs';
import {createPluginSession,runPlugin,createExecutionLock} from '../runner.mjs';
import {createSaveBundle} from '../contracts.mjs';

const native=bytes=>nativeHash('sha256').update(bytes).digest('hex');
const sample=n=>Uint8Array.from({length:n},(_,i)=>(i*137+(i>>>3))&255);
function fixture(code,bytes=new Uint8Array([1,2,3])){
  const pkg={manifest:{manifestVersion:'0.1',id:'example.bounded-format-sha',version:'0.1.0',entrypoints:{runtime:'runtime/index.mjs',runtimeProfile:'isolated-js-v1'}},files:{'runtime/index.mjs':code}};
  const descriptor={id:'synthetic-input',logicalPath:'synthetic.bytes',role:'main',byteLength:bytes.length,sha256:native(bytes)};
  return {package:pkg,bundle:createSaveBundle([descriptor]),artifacts:new Map([[descriptor.id,bytes]]),executionLock:createExecutionLock(pkg)};
}
async function invoke(code,{bytes,limits,signal,host}={}){const f=fixture(code,bytes);return runPlugin({...f,method:'detect',args:[f.bundle],limits,signal},host);}

test('pure host SHA stream matches independent vectors and destroys finalized/closed streams',()=>{
  const h=createFormatSha256Host({check(){}}),a=h.init(),b=h.init(),x=sample(65537),y=sample(120);
  h.update(a,x.subarray(0,65536));h.update(b,y.subarray(0,55));h.update(a,x.subarray(65536));h.update(b,y.subarray(55));
  assert.equal(Buffer.from(h.final(a)).toString('hex'),native(x));assert.equal(Buffer.from(h.final(b)).toString('hex'),native(y));
  assert.equal(h.metrics().cryptoBytes,x.length+y.length);assert.equal(h.metrics().cryptoLiveStreams,0);
  assert.throws(()=>h.final(a),e=>e.code==='FORMAT_HASH_SCOPE_DENIED');
  h.init();assert.equal(h.metrics().cryptoLiveStreams,1);h.close();assert.equal(h.metrics().cryptoLiveStreams,0);h.close();
  assert.throws(()=>h.init(),e=>e.code==='FORMAT_HASH_CLOSED');
});

test('actual guest text SHA/HMAC preserves Node Unicode, NUL, BOM and surrogate boundary semantics',async()=>{
  const inputs=['','ascii\n','a'.repeat(65536),'\u0080\u07ff\u0800\ud7ff\ue000\ufefe\ufffd\ufffe\uffff',
    '\ufeff','\ufeff'+'a'.repeat(100),'a'.repeat(100)+'\ufeff','a\0b','a\ud800b','a\udc00b',
    'a'.repeat(16383)+'🧙'+'b'.repeat(16384),'a'.repeat(65535)+'🧙','é'.repeat(16385)];
  const code=`import{createHash,sha256,hmacSha256}from'./crypto.mjs';export default{detect(){const inputs=${JSON.stringify(inputs)};return inputs.map(text=>({sha:sha256(text),text:createHash('sha256').updateText(text).digest('hex'),auto:createHash('sha256').update(text).digest('hex'),hmac:hmacSha256('κ\\0💡',text).toString('hex')}));}};`;
  const compiled=(await build({stdin:{contents:code,resolveDir:fileURLToPath(new URL('..',import.meta.url)),sourcefile:'bounded-format-text-vectors.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;
  const result=await invoke(compiled);
  for(let i=0;i<inputs.length;i++){const expected=native(Buffer.from(inputs[i]));assert.equal(result.result[i].sha,expected);assert.equal(result.result[i].text,expected);assert.equal(result.result[i].auto,expected);assert.equal(result.result[i].hmac,createHmac('sha256','κ\0💡').update(inputs[i]).digest('hex'));}
  assert.equal(result.metrics.cryptoBytes,inputs.reduce((sum,text)=>sum+Buffer.byteLength(text)*4+160,0));assert.equal(result.metrics.cryptoLiveStreams,0);
});

test('raw text and stream IDs are primitive/prebounded and FFI-unsafe values never materialize',async()=>{
  let copied=[];
  const host={async instantiateModule(variant){
    const module=await newQuickJSWASMModuleFromVariant(variant),newRuntime=module.newRuntime.bind(module);
    module.newRuntime=(...args)=>{const runtime=newRuntime(...args),newContext=runtime.newContext.bind(runtime);
      runtime.newContext=(...args)=>{const context=newContext(...args),getString=context.getString.bind(context);context.getString=handle=>{if(context.typeof(handle)==='string'){const length=context.getProp(handle,'length');try{copied.push(context.getNumber(length));}finally{length.dispose();}}return getString(handle);};return context;};return runtime;};return module;
  }};
  const textCases=[
    [`'x'.repeat(65537)`,'FORMAT_HASH_TEXT_CHUNK_LIMIT',65537],
    [`'é'.repeat(16385)`,'FORMAT_HASH_TEXT_CHUNK_LIMIT',16385],
    [`'a'.repeat(2047)+'\\0'`,'FORMAT_HASH_TEXT_ENCODING',2048],
    [`'\\ufeff'+'a'.repeat(2047)`,'FORMAT_HASH_TEXT_ENCODING',2048],
    [`'a'.repeat(2047)+'\\ud800'`,'FORMAT_HASH_TEXT_ENCODING',2048],
    [`new Proxy(new String('short'),{get(){throw Error('must not coerce')}})`,'FORMAT_HASH_TEXT_REQUIRED',null],
    [`{get length(){throw Error('must not read getter')},toString(){throw Error('must not coerce')}}`,'FORMAT_HASH_TEXT_REQUIRED',null]
  ];
  for(const [value,code,length]of textCases){copied=[];await assert.rejects(invoke(`export default{detect(){const id=__saveriftSha256Init();Object.defineProperty(Object.prototype,'length',{get(){throw Error('must not read inherited length')}});RegExp.prototype.exec=()=>null;RegExp.prototype.test=()=>false;__saveriftSha256UpdateText(id,${value});}}`,{host}),e=>e.code===code);if(length!==null)assert.equal(copied.includes(length),false,'rejected text must not materialize');}
  const idCases=[
    [`'a'.repeat(65537)`,65537],
    [`id+'\\0'+'x'.repeat(28)`,63],
    [`id+'\\ud800'+'x'.repeat(27)`,62],
    [`id+'\\ufeff'+'x'.repeat(29)`,64],
    [`new Proxy(new String(id),{get(){throw Error('must not coerce')}})`,null]
  ];
  for(const [value,length]of idCases){copied=[];await assert.rejects(invoke(`export default{detect(){const id=__saveriftSha256Init();RegExp.prototype.exec=()=>null;RegExp.prototype.test=()=>false;__saveriftSha256UpdateText(${value},'x');}}`,{host}),e=>e.code==='FORMAT_HASH_SCOPE_DENIED');if(length!==null)assert.equal(copied.includes(length),false,'rejected ID must not materialize');}
  copied=[];const valid=await invoke(`export default{detect(){const a=__saveriftSha256Init(),b=__saveriftSha256Init();__saveriftSha256UpdateText(a,'a'.repeat(65536));__saveriftSha256UpdateText(b,'é'.repeat(16384));return [[...new Uint8Array(__saveriftSha256Final(a))],[...new Uint8Array(__saveriftSha256Final(b))]];}}`,{host});
  assert.deepEqual(valid.result,[[...nativeHash('sha256').update('a'.repeat(65536)).digest()],[...nativeHash('sha256').update('é'.repeat(16384)).digest()]]);assert.ok(copied.includes(65536));assert.ok(copied.includes(16384));assert.ok(Math.max(...copied)<=65536);assert.equal(valid.metrics.cryptoBytes,65536+16384*2);
});

test('text hashing shares callback quota, cancellation and exact separate-update surrogate semantics',async()=>{
  await assert.rejects(invoke(`export default{detect(){const id=__saveriftSha256Init();__saveriftSha256UpdateText(id,'hello');__saveriftSha256Final(id);}}`,{limits:{hostCalls:2}}),e=>e.code==='HOST_CALL_LIMIT');
  const controller=new AbortController();await assert.rejects(invoke(`export default{detect(_,ctx){const id=__saveriftSha256Init();__saveriftSha256UpdateText(id,'hello');ctx.reportProgress({phase:'text-hashed',completed:1});__saveriftSha256UpdateText(id,'late');}}`,{signal:controller.signal,host:{onProgress(){controller.abort();}}}),e=>e.code==='JOB_ABORTED');
  const code=`import{createHash}from'./crypto.mjs';export default{detect(){return createHash('sha256').updateText('\\ud800').updateText('\\udc00').digest('hex');}};`;
  const compiled=(await build({stdin:{contents:code,resolveDir:fileURLToPath(new URL('..',import.meta.url)),sourcefile:'bounded-text-stream-semantics.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;
  assert.equal((await invoke(compiled)).result,nativeHash('sha256').update('\ud800').update('\udc00').digest('hex'));
});

test('fixed stream, chunk and session byte caps reject before additional SHA work',()=>{
  const h=createFormatSha256Host({check(){}}),ids=Array.from({length:CAPS.streams},()=>h.init());
  assert.throws(()=>h.init(),e=>e.code==='FORMAT_HASH_STREAM_LIMIT');
  assert.throws(()=>h.update(ids[0],new Uint8Array(CAPS.chunkBytes+1)),e=>e.code==='FORMAT_HASH_CHUNK_LIMIT');
  assert.equal(h.metrics().cryptoBytes,0);h.abort(ids.pop());assert.equal(h.metrics().cryptoLiveStreams,7);
  const chunk=new Uint8Array(CAPS.chunkBytes);
  for(let i=0;i<CAPS.totalBytes/CAPS.chunkBytes;i++)h.update(ids[0],chunk);
  assert.equal(h.metrics().cryptoBytes,CAPS.totalBytes);
  assert.throws(()=>h.update(ids[0],new Uint8Array([1])),e=>e.code==='FORMAT_HASH_BYTE_LIMIT');
  assert.equal(h.metrics().cryptoBytes,CAPS.totalBytes);h.close();
});

test('execution budget is checked after pure SHA work and cleanup remains available after rejection',()=>{
  let checks=0;const h=createFormatSha256Host({check(){if(++checks===4)throw Object.assign(Error('deadline'),{code:'CPU_LIMIT'});}}),id=h.init();
  assert.throws(()=>h.update(id,new Uint8Array(32)),e=>e.code==='CPU_LIMIT');
  assert.equal(h.metrics().cryptoBytes,32);h.close();assert.equal(h.metrics().cryptoLiveStreams,0);
});

test('actual guest streams, one-shot SHA and HMAC match independent native boundary/long-key vectors',async()=>{
  const code=`import{createHash,sha256,hmacSha256}from'./crypto.mjs';export default{detect(bundle,ctx){const data=ctx.readArtifact(bundle.artifacts[0].id),results=[];for(const n of [0,1,55,56,63,64,65,65535,65536,65537]){const bytes=data.subarray(7,7+n),a=createHash('sha256'),b=createHash('sha256');for(let i=0;i<bytes.length;i+=8191){a.update(bytes.subarray(i,i+8191));b.update(bytes.subarray(i,i+8191));}results.push({n,stream:a.digest('hex'),other:b.digest('hex'),sha:sha256(bytes),hmac:hmacSha256(data.subarray(0,n%1025),bytes).toString('hex')});}const h=createHash('sha256');h.update('discarded');h.destroy();let destroyed;try{h.update('x');}catch(e){destroyed=e.message;}return{results,destroyed,ambient:__saveriftSha256Init.constructor('return [typeof process,typeof fetch,typeof require]')()};}};`;
  const compiled=(await build({stdin:{contents:code,resolveDir:fileURLToPath(new URL('..',import.meta.url)),sourcefile:'bounded-format-vectors.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;
  const bytes=sample(65544),result=await invoke(compiled,{bytes});
  for(const row of result.result.results){const value=bytes.subarray(7,7+row.n);assert.equal(row.stream,native(value));assert.equal(row.other,native(value));assert.equal(row.sha,native(value));assert.equal(row.hmac,createHmac('sha256',bytes.subarray(0,row.n%1025)).update(value).digest('hex'));}
  assert.match(result.result.destroyed,/finalized/);assert.deepEqual(result.result.ambient,['undefined','undefined','undefined']);assert.equal(result.metrics.cryptoLiveStreams,0);
});

test('actual raw guest bridge enforces binary chunk, stream, ID and existing callback quotas',async()=>{
  await assert.rejects(invoke(`export default{detect(){const id=__saveriftSha256Init();__saveriftSha256Update(id,new ArrayBuffer(65537));}}`),e=>e.code==='FORMAT_HASH_CHUNK_LIMIT');
  await assert.rejects(invoke(`export default{detect(){for(let i=0;i<9;i++)__saveriftSha256Init();}}`),e=>e.code==='FORMAT_HASH_STREAM_LIMIT');
  await assert.rejects(invoke(`export default{detect(){const id=__saveriftSha256Init();__saveriftSha256Final(id);__saveriftSha256Final(id);}}`),e=>e.code==='FORMAT_HASH_SCOPE_DENIED');
  await assert.rejects(invoke(`export default{detect(){__saveriftSha256Update({toString(){throw Error('must not coerce')}},new ArrayBuffer(0));}}`),e=>e.code==='FORMAT_HASH_SCOPE_DENIED');
  await assert.rejects(invoke(`export default{detect(){const id=__saveriftSha256Init();__saveriftSha256Update(id,new ArrayBuffer(0));__saveriftSha256Final(id);}}`,{limits:{hostCalls:2}}),e=>e.code==='HOST_CALL_LIMIT');
});

test('intrinsic branded length rejects oversized/spoofed/Proxy buffers before host materialization',async()=>{
  let materializations=0;
  const host={async instantiateModule(variant){
    const module=await newQuickJSWASMModuleFromVariant(variant),newRuntime=module.newRuntime.bind(module);
    module.newRuntime=(...args)=>{const runtime=newRuntime(...args),newContext=runtime.newContext.bind(runtime);
      runtime.newContext=(...args)=>{const context=newContext(...args),getArrayBuffer=context.getArrayBuffer.bind(context);context.getArrayBuffer=(...args)=>{materializations++;return getArrayBuffer(...args);};return context;};return runtime;};return module;
  }};
  const cases=[
    [`const buffer=new ArrayBuffer(65537);Object.defineProperty(buffer,'byteLength',{value:1});`,'FORMAT_HASH_CHUNK_LIMIT'],
    [`const buffer=new ArrayBuffer(65537);Object.defineProperty(ArrayBuffer.prototype,'byteLength',{get(){return 1;}});`,'FORMAT_HASH_CHUNK_LIMIT'],
    [`const buffer=new Proxy(new ArrayBuffer(65536),{get(){throw Error('Proxy trap must not run');}});`,'FORMAT_HASH_BUFFER_REQUIRED'],
    [`const buffer={get byteLength(){throw Error('fake getter must not run');}};`,'FORMAT_HASH_BUFFER_REQUIRED']
  ];
  for(const [setup,code] of cases){await assert.rejects(invoke(`export default{detect(){const id=__saveriftSha256Init();${setup}__saveriftSha256Update(id,buffer);}}`,{host}),e=>e.code===code);assert.equal(materializations,0);}
  const result=await invoke(`export default{detect(){const id=__saveriftSha256Init(),buffer=new ArrayBuffer(65536);Object.defineProperty(buffer,'byteLength',{get(){throw Error('own getter must not run');}});__saveriftSha256Update(id,buffer);return [...new Uint8Array(__saveriftSha256Final(id))];}}`,{host});
  assert.deepEqual(result.result,[...nativeHash('sha256').update(new Uint8Array(65536)).digest()]);assert.equal(materializations,1);
});

test('bootstrap failure after opening a format hash destroys state and intrinsic handles',async()=>{
  await assert.rejects(invoke(`const stream=__saveriftSha256Init();throw Error('synthetic module failure');export default{};`),e=>e.code==='PLUGIN_EXECUTION_FAILED'&&/synthetic module failure/.test(e.message));
  const result=await invoke(`export default{detect(){return __saveriftSha256Init().length>0;}}`);assert.equal(result.result,true);
});

test('actual guest bridge session IDs cannot select another session and close destroys unfinalized state',async()=>{
  const config=fixture(`export default{detect(){return __saveriftSha256Init();}}`),session=await createPluginSession(config);
  const foreign=await session.call('detect',[]);assert.equal(session.metrics().cryptoLiveStreams,1);session.close();assert.equal(session.metrics().cryptoLiveStreams,0);
  await assert.rejects(invoke(`export default{detect(){__saveriftSha256Init();__saveriftSha256Update(${JSON.stringify(foreign)},new ArrayBuffer(0));}}`),e=>e.code==='FORMAT_HASH_SCOPE_DENIED');
});

test('actual guest SHA updates retain cancellation and produce no late artifacts',async()=>{
  const controller=new AbortController();
  await assert.rejects(invoke(`export default{detect(_,ctx){const id=__saveriftSha256Init();__saveriftSha256Update(id,new ArrayBuffer(65536));ctx.reportProgress({phase:'first-hash-chunk',completed:1});__saveriftSha256Update(id,new ArrayBuffer(65536));return ctx.writeArtifact({logicalPath:'late',role:'main'},new Uint8Array([1]));}}`,{signal:controller.signal,host:{onProgress(){controller.abort();}}}),e=>e.code==='JOB_ABORTED');
});
