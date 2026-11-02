import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash as nativeHash,webcrypto} from 'node:crypto';
import {createSaveBundle,validatePackage,RUNTIME_PROFILE} from '../contracts.mjs';
import {canonicalJson,sha256,createHash,hmacSha256,formatCrypto} from '../crypto.mjs';
import {runPlugin,createPluginSession,createExecutionLock} from '../runner.mjs';
import {TextDecoder as PortableDecoder,TextEncoder as PortableEncoder} from '../text-encoding.mjs';
import {newQuickJSWASMModuleFromVariant} from 'quickjs-emscripten-core';

function fixture(code,{methods=[],files={},bytes=new Uint8Array([1,2,3])}={}){
  const packageInput={manifest:{manifestVersion:'0.1',id:'example.runner-test',version:'0.1.0',entrypoints:{runtime:'runtime/index.js',runtimeProfile:RUNTIME_PROFILE},methods},files:{'runtime/index.js':code,...files}};
  const descriptor={id:'selected-save',logicalPath:'main.sav',role:'main',byteLength:bytes.length,sha256:sha256(bytes)},bundle=createSaveBundle([descriptor]);
  return {package:packageInput,bundle,artifacts:new Map([[descriptor.id,bytes]]),executionLock:createExecutionLock(packageInput)};
}
const invoke=(code,args=[],extra={})=>runPlugin({...fixture(code,extra),method:'detect',args,limits:extra.limits},extra.host);

test('actual Wasm guest has no host env, filesystem, fetch, native module loader or host constructors',async()=>{
  const result=await invoke(`export default {detect(){return [typeof process,typeof require,typeof fetch,typeof XMLHttpRequest,typeof WebSocket,typeof crypto,typeof Buffer,typeof WebAssembly,typeof Worker,typeof Deno,typeof Bun];}}`);
  assert.deepEqual(result.result,Array(11).fill('undefined'));assert.match(result.metrics.engine,/quickjs.*wasm/);assert.equal(result.metrics.packageDigest.length,64);assert.ok(result.metrics.memoryBytes<=64*1024*1024);
});
test('guest Function constructor remains interpreter-only and cannot recover host process',async()=>{
  assert.equal((await invoke(`export default {detect(){return Function('return typeof process')();}}`)).result,'undefined');
});
test('module resolver accepts packaged relative modules and denies native, network and package traversal imports',async()=>{
  const good=await invoke(`import value from './local.js';export default {detect(){return value;}}`,[],{files:{'runtime/local.js':'export default 42;'}});assert.equal(good.result,42);
  for(const path of ['node:fs','node:crypto','https://example.com/a.js','../../outside.js','buffer'])await assert.rejects(invoke(`import value from ${JSON.stringify(path)};export default {detect(){return value;}}`),/IMPORT_DENIED|packaged relative|escape the package/);
});
test('endless CPU and unbounded promise chains fail under the actual interpreter budget',async()=>{
  await assert.rejects(invoke('export default {detect(){while(true){}}}',[],{limits:{interrupts:8}}),e=>e.code==='CPU_LIMIT');
  await assert.rejects(invoke('export default {async detect(){for(;;)await Promise.resolve();}}',[],{limits:{pendingJobs:10}}),e=>e.code==='PENDING_JOB_LIMIT');
});
test('heap allocation, stack recursion, metadata size and host callback count are bounded',async()=>{
  await assert.rejects(invoke('export default {detect(){return new ArrayBuffer(80*1024*1024);}}'),e=>e.code==='MEMORY_LIMIT');
  await assert.rejects(invoke('export default {detect(){function f(){return f()+1;}return f();}}'),e=>e.code==='MEMORY_LIMIT');
  await assert.rejects(invoke('export default {detect(){return "x".repeat(300000);}}'),/JSON_LIMIT|JSON limit/);
  await assert.rejects(invoke('export default {detect(_,ctx){for(let i=0;i<100;i++)ctx.randomBytes(1);return 1;}}',[null],{limits:{hostCalls:2}}),e=>e.code==='HOST_CALL_LIMIT');
});
test('binary artifact channel scopes reads, copies inputs and hashes outputs without base64 JSON',async()=>{
  const config=fixture(`export default {plan(bundle,ops,ctx){const bytes=ctx.readArtifact(bundle.artifacts[0].id);bytes[0]=9;const out=ctx.writeArtifact({logicalPath:'main.sav',role:'main'},bytes);return {outputs:[out],inputBundleDigest:bundle.bundleDigest};}}`);
  const result=await runPlugin({...config,method:'plan',args:[config.bundle,[]]});const out=result.result.outputs[0];assert.deepEqual([...result.artifacts.get(out.id)],[9,2,3]);assert.equal(config.artifacts.get('selected-save')[0],1);assert.equal(out.sha256,sha256(new Uint8Array([9,2,3])));
  await assert.rejects(invoke(`export default {detect(_,ctx){return [...ctx.readArtifact('unrelated-account-save')];}}`,[null]),e=>e.code==='PLUGIN_EXECUTION_FAILED'&&/ARTIFACT_SCOPE_DENIED/.test(e.message));
  await assert.rejects(invoke(`export default {detect(_,ctx){return ctx.readArtifact('selected-save',{offset:2,length:100});}}`,[null]),e=>e.code==='ARTIFACT_SCOPE_DENIED');
  await assert.rejects(invoke(`export default {detect(_,ctx){return ctx.writeArtifact({logicalPath:'out',role:'main'},new Uint8Array(30));}}`,[null],{limits:{outputBytes:10}}),e=>e.code==='OUTPUT_LIMIT');
});
test('generated output handles cannot collide with a selected caller-chosen input handle',async()=>{
  const bytes=new Uint8Array([1,2,3]),id=`output-1-${sha256(bytes).slice(0,16)}`,config=fixture(`export default {plan(bundle,ops,ctx){return ctx.writeArtifact({logicalPath:'main.sav',role:'main'},ctx.readArtifact(bundle.artifacts[0].id));}}`),bundle=createSaveBundle([{id,logicalPath:'main.sav',role:'main',byteLength:bytes.length,sha256:sha256(bytes)}]);const result=await runPlugin({...config,bundle,artifacts:new Map([[id,bytes]]),method:'plan',args:[bundle,[]]});assert.notEqual(result.result.id,id);assert.equal(result.artifacts.has(id),false);assert.deepEqual(result.artifacts.get(result.result.id),bytes);
});
test('changed source, changed selected bytes and changed execution pins fail before evaluating code',async()=>{
  const config=fixture('export default {detect(){return true;}}');config.package.files['runtime/index.js']='export default {detect(){return false;}}';await assert.rejects(runPlugin({...config,method:'detect'}),e=>e.code==='LOCK_PACKAGE_MISMATCH');
  const changed=fixture('export default {detect(){return true;}}');changed.artifacts.get('selected-save')[0]=99;await assert.rejects(runPlugin({...changed,method:'detect'}),e=>e.code==='ARTIFACT_MISMATCH');
  const lock=fixture('export default {detect(){return true;}}');lock.executionLock.connector.version='evil';await assert.rejects(runPlugin({...lock,method:'detect'}),e=>e.code==='LOCK_DIGEST_MISMATCH');
});
test('session document handles stay in one isolated instance and declared extension methods work',async()=>{
  const config=fixture(`const documents=new Map();export default {open(bundle){documents.set('document-1',{faction:'river',bundle:bundle.id});return 'document-1';},query(handle,query){return documents.get(handle)[query.method];},expand(operation){return {operations:[operation]};},close(handle){documents.delete(handle);}}`,{methods:['expand']});
  const session=await createPluginSession(config);try{const handle=await session.call('open',[config.bundle]);assert.equal(await session.call('query',[handle,{method:'faction'}]),'river');assert.deepEqual(await session.call('expand',[{id:'community.custom',apiVersion:'0.1.0',params:{camp:1}}]),{operations:[{id:'community.custom',apiVersion:'0.1.0',params:{camp:1}}]});await assert.rejects(session.call('publish',[]),e=>e.code==='METHOD_DENIED');}finally{session.close();}await assert.rejects(session.call('open',[]),e=>e.code==='SESSION_CLOSED');
});
test('cancellation before start and during a synchronous host callback aborts without outputs',async()=>{
  const controller=new AbortController();controller.abort();await assert.rejects(runPlugin({...fixture('export default {detect(){return 1;}}'),method:'detect',signal:controller.signal}),e=>e.code==='JOB_ABORTED');
  const active=new AbortController();await assert.rejects(runPlugin({...fixture('export default {detect(_,ctx){ctx.reportProgress({phase:"decode",completed:0,total:1});for(;;){} }}'),method:'detect',args:[null],signal:active.signal},{onProgress(){active.abort();}}),e=>e.code==='JOB_ABORTED');
});
test('unavailable ambient async IO fails rather than retaining an unbounded job',async()=>{
  await assert.rejects(invoke('export default {detect(){return new Promise(()=>{});}}'),e=>e.code==='ASYNC_UNSUPPORTED');
});
test('dynamic module and promise contexts are all disposed before the Wasm runtime',async()=>{
  for(let i=0;i<3;i++){const result=await invoke(`export default {async detect(){const module=await import('./later.js');await Promise.resolve();return module.value;}}`,[],{files:{'runtime/later.js':'export const value=42;'}});assert.equal(result.result,42);assert.ok(result.metrics.contextsCreated>=1);}
});
test('library-created secondary contexts are disposed too, reproducing the full-provider teardown regression',async()=>{
  const host={async instantiateModule(variant){const module=await newQuickJSWASMModuleFromVariant(variant),newRuntime=module.newRuntime.bind(module);module.newRuntime=(...args)=>{const runtime=newRuntime(...args),execute=runtime.executePendingJobs.bind(runtime);let measured=false;runtime.executePendingJobs=(count)=>{if(!measured){measured=true;runtime.computeMemoryUsage().dispose();}return execute(count);};return runtime;};return module;}};
  const result=await invoke('export default {async detect(){await Promise.resolve();return 42;}}',[],{host});assert.equal(result.result,42);assert.ok(result.metrics.contextsCreated>=2);
});
test('portable SHA256/HMAC matches Node independently and wire JSON preserves decimal IDs exactly',async()=>{
  const input=new Uint8Array([1,2,255,0]),key=new Uint8Array([4,5]);assert.equal(sha256(input),nativeHash('sha256').update(input).digest('hex'));assert.equal(createHash('sha256').update(input).digest('hex'),sha256(input));assert.equal(hmacSha256(key,input).toString('hex'),createHmac('sha256',key).update(input).digest('hex'));
  const k=await formatCrypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);const signed=await formatCrypto.subtle.sign('HMAC',k,input);assert.equal(signed.byteLength,32);assert.equal(await formatCrypto.subtle.verify('HMAC',k,signed,input),true);
  const native=await webcrypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['verify']);assert.equal(await webcrypto.subtle.verify('HMAC',native,signed,input),true);
  assert.equal(canonicalJson({z:'18446744073709551615',a:0}),'{"a":0,"z":"18446744073709551615"}');for(const invalid of [undefined,NaN,Infinity,9007199254740992,{a:undefined},JSON.parse('{"__proto__":1}'),Array(2)])assert.throws(()=>canonicalJson(invalid),TypeError);
});
test('package paths and source digests are deterministic and archive hazards are rejected',()=>{
  const pkg=fixture('export default {};').package;const a=validatePackage(pkg),b=validatePackage({...pkg,files:new Map(Object.entries(pkg.files))});assert.equal(a.packageDigest,b.packageDigest);
  for(const path of ['/abs.js','../outside.js','runtime/../x.js','runtime\\x.js','https:x.js'])assert.throws(()=>validatePackage({...pkg,files:{...pkg.files,[path]:'evil'}}),e=>e.code==='PACKAGE_PATH_INVALID');
  assert.throws(()=>validatePackage({...pkg,files:{...pkg.files,'runtime/INDEX.js':'evil'}}),e=>e.code==='PACKAGE_DUPLICATE');
});
test('data, asset and preset packages are immutable first-class pins without executable entrypoints',async()=>{
  for(const kind of ['data','assets','preset','ui']){const pkg={manifest:{manifestVersion:'0.1',kind,id:'example.'+kind,version:'0.1.0'},files:{'data/example.json':'{}'}};const checked=validatePackage(pkg);assert.equal(checked.packageDigest.length,64);await assert.rejects(runPlugin({package:pkg,executionLock:createExecutionLock(pkg),method:'detect'}),e=>e.code==='PACKAGE_NOT_EXECUTABLE');assert.throws(()=>validatePackage({...pkg,manifest:{...pkg.manifest,entrypoints:{runtime:'evil.js'}}}),e=>e.code==='MANIFEST_INVALID');}
});
test('bundles reject account/transport metadata and portable UTF8 decoder independently rejects malformed sequences',async()=>{
  assert.throws(()=>createSaveBundle([],{hints:{accessToken:'never'}}),e=>e.code==='BUNDLE_INVALID');const config=fixture('export default {detect(){return true;}}');config.bundle={...config.bundle,cloudRevision:'private'};await assert.rejects(runPlugin({...config,method:'detect'}),e=>e.code==='BUNDLE_DIGEST_MISMATCH');
  const encoder=new PortableEncoder(),decoder=new PortableDecoder('utf-8',{fatal:true});for(const text of ['Fish Fillet','猫🐈','\ufeffgold','\ud800'])assert.equal(decoder.decode(encoder.encode(text)),new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(text)));
  for(const bytes of [[0xc0,0x80],[0xe0,0x80,0x80],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80],[0xe1,0x80],[0xff]])assert.throws(()=>decoder.decode(new Uint8Array(bytes)),TypeError);
});
