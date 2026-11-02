import variant from '@jitl/quickjs-wasmfile-release-sync';
import {newVariant,newQuickJSWASMModuleFromVariant} from 'quickjs-emscripten-core';
import {Buffer} from './buffer.mjs';
import {hash,canonicalJson} from './crypto.mjs';
import {LIMITS,LIFECYCLE,RUNTIME_PROFILE,PluginError,fail,jsonCopy,logicalPath,validatePackage,createSaveBundle,digest} from './contracts.mjs';
import {createExecutionLock as createPinnedLock,verifyExecutionLock} from './registry.mjs';

const PAGE=65536;
const own=(object,key)=>Object.hasOwn(object,key);
export function createExecutionLock(packageInput){
  const pkg=validatePackage(packageInput);return createPinnedLock({connector:{id:pkg.manifest.id,version:pkg.manifest.version,digest:pkg.packageDigest}});
}
function boundedLimits(input={}){
  const limits={...LIMITS};for(const [key,value]of Object.entries(input)){if(!own(LIMITS,key)||!Number.isSafeInteger(value)||value<1||value>LIMITS[key])fail('LIMITS_INVALID','Execution limits may only reduce documented quotas.');limits[key]=value;}
  if(limits.memoryBytes<16*1024*1024||limits.memoryBytes%PAGE||limits.heapBytes>=limits.memoryBytes)fail('LIMITS_INVALID','Wasm memory must be page aligned and larger than the heap limit.');return limits;
}
function verifyLock(lock,pkg){
  const value=jsonCopy(lock);if(value?.schema!=='saverift.execution-lock.v1'||value.runnerProfile!==RUNTIME_PROFILE||value.hostApi!=='0.1.0')fail('LOCK_INVALID','An exact compatible execution lock is required.');
  if(!verifyExecutionLock(value))fail('LOCK_DIGEST_MISMATCH','Execution lock pins or digest do not match.');
  const pins=[value.connector,...(value.extensions||[]),...(value.dataPacks||[])];if(!pins.some(x=>x?.id===pkg.manifest.id&&x.version===pkg.manifest.version&&x.digest===pkg.packageDigest))fail('LOCK_PACKAGE_MISMATCH','The package is not pinned by this execution lock.');return value;
}
function normalizedModule(request,base){
  if(typeof request!=='string'||!request.startsWith('.')||request.includes('\\')||request.includes(':')||request.includes('\0'))fail('IMPORT_DENIED','Only packaged relative JavaScript imports are allowed.');
  const parts=base.split('/');parts.pop();for(const part of request.split('/')){if(!part||part==='.')continue;if(part==='..'){if(!parts.length)fail('IMPORT_DENIED','Imports cannot escape the package.');parts.pop();}else parts.push(part);}
  return logicalPath(parts.join('/'));
}

/** Each session owns a separate Wasm instance and only explicitly selected bytes.
 * instantiateModule is a trusted portability hook: Workers pass a statically
 * imported WebAssembly.Module, never a plugin URL or a module chosen by guests.
 */
export async function createPluginSession(options,host={}){
  const limits=boundedLimits(options?.limits),pkg=validatePackage(options?.package,limits),lock=verifyLock(options?.executionLock,pkg),signal=options?.signal;
  if(pkg.manifest.kind&&!['game','extension'].includes(pkg.manifest.kind))fail('PACKAGE_NOT_EXECUTABLE','Only connector and system-extension packages execute in the runner.');
  const source=options.artifacts instanceof Map?options.artifacts:new Map(Object.entries(options.artifacts||{}));
  const bundle=jsonCopy(options.bundle||createSaveBundle([])),normalized=createSaveBundle(bundle.artifacts,{id:bundle.id,hints:bundle.hints});if(canonicalJson(bundle)!==canonicalJson(normalized))fail('BUNDLE_DIGEST_MISMATCH','Input bundle has changed or contains nonpublic fields.');
  const inputs=new Map(),outputs=new Map();let inputBytes=0;
  for(const artifact of bundle.artifacts){const data=source.get(artifact.id);if(!(data instanceof Uint8Array)||data.length!==artifact.byteLength||data.length>limits.artifactBytes||hash(data)!==artifact.sha256||inputs.has(artifact.id))fail('ARTIFACT_MISMATCH','A selected artifact is missing, oversized, duplicate or changed.');inputBytes+=data.length;if(inputBytes>limits.totalArtifactBytes)fail('ARTIFACT_LIMIT','Selected input bytes exceed the limit.');inputs.set(artifact.id,new Uint8Array(data));}
  let closed=false,active=false,interrupts=0,hostCalls=0,outputBytes=0,started=Date.now(),deadline=started+limits.timeoutMs,lastFailure=null;
  const metrics={runner:RUNTIME_PROFILE,engine:'quickjs-2025-09-13+f1139494/wasm-0.32.0',packageDigest:pkg.packageDigest,executionLockDigest:lock.digest,inputBytes,outputBytes:0,interrupts:0,hostCalls:0,elapsedMs:0,memoryBytes:0};
  function check(){if(closed)fail('SESSION_CLOSED','The isolated session has closed.');if(signal?.aborted)fail('JOB_ABORTED','The plugin job was cancelled.');if(Date.now()>deadline)fail('CPU_LIMIT','The plugin execution deadline was exceeded.');}
  check();
  let memory=new WebAssembly.Memory({initial:256,maximum:limits.memoryBytes/PAGE});
  let customized=newVariant(variant,{wasmMemory:memory,...(host.wasmModule?{wasmModule:host.wasmModule}:{})});
  let QuickJS=host.instantiateModule?await host.instantiateModule(customized):await newQuickJSWASMModuleFromVariant(customized);
  customized=null;
  let runtime=QuickJS.newRuntime();QuickJS=null;runtime.setMemoryLimit(limits.heapBytes);runtime.setMaxStackSize(limits.stackBytes);
  runtime.setInterruptHandler(()=>{interrupts++;return closed||signal?.aborted||interrupts>limits.interrupts||Date.now()>deadline;});
  // ESM/dynamic-import callbacks can make additional QuickJSContext wrappers.
  // QuickJSRuntime.dispose() frees its own runtime, not those contexts. Track
  // the public factory so every context is disposed before JS_FreeRuntime.
  const contexts=new Set();let newContext=runtime.newContext.bind(runtime);
  runtime.newContext=(...args)=>{const value=newContext(...args);contexts.add(value);return value;};
  let context=runtime.newContext();
  function guestError(handle){let value;try{value=context.dump(handle);}catch{value=null;}const detail=value?.message||'Plugin execution failed.';
    if(signal?.aborted)return new PluginError('JOB_ABORTED','The plugin job was cancelled.');if(interrupts>limits.interrupts||Date.now()>deadline)return new PluginError('CPU_LIMIT','The plugin computation exceeded its execution budget.');if(/out of memory|allocation|stack overflow/i.test(detail))return new PluginError('MEMORY_LIMIT','The plugin exceeded its memory or stack limit.');return new PluginError(value?.code||'PLUGIN_EXECUTION_FAILED',String(detail).slice(0,512));
  }
  function unwrap(result){if(result.error){const error=guestError(result.error);result.error.dispose();throw error;}return result.value;}
  function evalGuest(code,file='saverift-host.js'){return unwrap(context.evalCode(code,file,{type:'global'}));}
  function addFunction(name,implementation){const fn=context.newFunction(name,(...args)=>{try{check();hostCalls++;if(hostCalls>limits.hostCalls)fail('HOST_CALL_LIMIT','The plugin exceeded its host-call budget.');return implementation(...args);}catch(error){const guest=context.newError({name:'PluginError',message:error.code||'HOST_CALL_REJECTED'}),code=context.newString(error.code||'HOST_CALL_REJECTED');context.setProp(guest,'code',code);code.dispose();return {error:guest};}});context.setProp(context.global,name,fn);fn.dispose();}
  const string=handle=>context.getString(handle);
  function json(handle){const text=string(handle);if(Buffer.byteLength(text)>limits.jsonBytes)fail('JSON_LIMIT','A plugin message exceeds the JSON limit.');return jsonCopy(JSON.parse(text),limits.jsonBytes);}
  addFunction('__saveriftRead',(idArg,offsetArg,lengthArg)=>{
    const id=string(idArg),bytes=inputs.get(id)||outputs.get(id),offset=context.getNumber(offsetArg),length=context.getNumber(lengthArg);
    if(!bytes||!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>bytes.length||length>limits.artifactBytes)fail('ARTIFACT_SCOPE_DENIED','The requested artifact range is unavailable.');
    return context.newArrayBuffer(bytes.slice(offset,offset+length).buffer);
  });
  addFunction('__saveriftWrite',(metadataArg,arrayArg)=>{
    if(outputs.size>=limits.outputArtifacts)fail('OUTPUT_LIMIT','The plugin exceeded its output artifact limit.');const metadata=json(metadataArg);logicalPath(metadata.logicalPath);if(typeof metadata.role!=='string'||metadata.role.length>64)fail('ARTIFACT_INVALID','An output role is required.');
    const view=context.getArrayBuffer(arrayArg);try{const length=view.value.length;if(length>limits.artifactBytes||outputBytes+length>limits.outputBytes)fail('OUTPUT_LIMIT','The plugin exceeded its output byte budget.');
      const bytes=new Uint8Array(view.value);let counter=outputs.size+1,id;do{id=`output-${counter++}-${hash(bytes).slice(0,16)}`;}while(inputs.has(id)||outputs.has(id));outputs.set(id,bytes);outputBytes+=length;return context.newString(JSON.stringify({id,logicalPath:metadata.logicalPath,role:metadata.role,byteLength:length,sha256:hash(bytes)}));
    }finally{view.dispose();}
  });
  addFunction('__saveriftRandom',lengthArg=>{const length=context.getNumber(lengthArg);if(!Number.isSafeInteger(length)||length<1||length>64)fail('RANDOM_LIMIT','Random requests are limited to 64 bytes.');const bytes=new Uint8Array(length);globalThis.crypto.getRandomValues(bytes);return context.newArrayBuffer(bytes.buffer);});
  addFunction('__saveriftProgress',arg=>{const event=json(arg);if(typeof event.phase!=='string'||event.phase.length>80||!Number.isSafeInteger(event.completed)||event.completed<0||(event.total!==undefined&&(!Number.isSafeInteger(event.total)||event.total<event.completed)))fail('PROGRESS_INVALID','Progress must be bounded counters.');host.onProgress?.(event);return context.undefined;});
  addFunction('__saveriftCatalog',arg=>{const query=json(arg);if(!host.catalogQuery)fail('CATALOG_UNAVAILABLE','No pinned catalog is attached.');const value=jsonCopy(host.catalogQuery(query,{executionLock:lock}),limits.jsonBytes);return context.newString(JSON.stringify(value));});
  addFunction('__saveriftCancelled',()=>{check();return context.undefined;});
  runtime.setModuleLoader(name=>{const file=pkg.files.get(name);if(!file||!/\.(?:mjs|js)$/.test(name))throw new Error('IMPORT_DENIED');return Buffer.from(file).toString('utf8');},(base,request)=>normalizedModule(request,base));
  // The wrapper and all intrinsics execute inside QuickJS. No host objects,
  // Function constructors, URL loaders or promises are passed into the guest.
  const bootstrap=`
    const __limits=${JSON.stringify({jsonBytes:limits.jsonBytes})};
    globalThis.__saveriftContext=Object.freeze({
      readArtifact(id,options={}){const meta=__bundle.artifacts.find(x=>x.id===id)||__outputMeta.get(id);if(!meta)throw Error('ARTIFACT_SCOPE_DENIED');return new Uint8Array(__saveriftRead(id,options.offset??0,options.length??(meta.byteLength-(options.offset??0))));},
      writeArtifact(metadata,bytes){if(!(bytes instanceof Uint8Array))throw Error('ARTIFACT_INVALID');const data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),meta=JSON.parse(__saveriftWrite(JSON.stringify({...metadata,role:metadata.role??'candidate'}),data));__outputMeta.set(meta.id,meta);return meta;},
      randomBytes(length){return new Uint8Array(__saveriftRandom(length));},
      reportProgress(event){__saveriftProgress(JSON.stringify(event));},
      catalogQuery(query){return JSON.parse(__saveriftCatalog(JSON.stringify(query)));},
      checkCancelled(){__saveriftCancelled();},
      clock(){return ${Number.isSafeInteger(options.clock)?options.clock:0};},
      executionLock:${JSON.stringify(lock)},bundleDigest:${JSON.stringify(bundle.bundleDigest)}
    });
    const __bundle=${JSON.stringify(bundle)},__outputMeta=new Map();
    globalThis.__saveriftInvoke=async function(method,args){const fn=__saveriftConnector[method];if(typeof fn!=='function')throw Error('METHOD_UNAVAILABLE');const value=await fn.call(__saveriftConnector,...args,__saveriftContext);const json=JSON.stringify(value===undefined?null:value);if(json.length>__limits.jsonBytes)throw Error('JSON_LIMIT');return json;};
  `;
  try{
    const bootstrapResult=evalGuest(bootstrap);bootstrapResult.dispose();
    const entry=pkg.manifest.entrypoints.runtime;
    const loaded=unwrap(context.evalCode(`import connector from './${entry}'; globalThis.__saveriftConnector=connector;`,'saverift-entry.mjs',{type:'module'}));loaded.dispose();
  }catch(error){for(const value of contexts)if(value.alive)value.dispose();runtime.dispose();throw error;}
  async function settle(handle){
    let count=0;for(;;){check();const state=context.getPromiseState(handle);if(state.type==='fulfilled')return state.value;if(state.type==='rejected'){const error=guestError(state.error);state.error.dispose();throw error;}
      if(!runtime.hasPendingJob())fail('ASYNC_UNSUPPORTED','The plugin promise waits on unavailable ambient I/O.');if(++count>limits.pendingJobs)fail('PENDING_JOB_LIMIT','The plugin exceeded its pending-job budget.');const jobs=runtime.executePendingJobs(1);if(jobs.error){const error=guestError(jobs.error);jobs.error.dispose();throw error;}
    }
  }
  function updateMetrics(){metrics.outputBytes=outputBytes;metrics.interrupts=interrupts;metrics.hostCalls=hostCalls;metrics.elapsedMs=Date.now()-started;if(memory)metrics.memoryBytes=memory.buffer.byteLength;if(runtime)metrics.contextsCreated=contexts.size;return {...metrics};}
  const allowed=new Set([...LIFECYCLE,...(pkg.manifest.methods||[])]);
  return {
    packageDigest:pkg.packageDigest,executionLock:lock,bundle,
    async call(method,args=[]){
      check();if(active)fail('CONCURRENT_CALL','A plugin session executes one request at a time.');if(!allowed.has(method)||typeof method!=='string'||!Array.isArray(args))fail('METHOD_DENIED','The method is not declared by this package.');active=true;
      let result,methodArg,argsArg,invoke;
      try{const safeArgs=jsonCopy(args,limits.jsonBytes);methodArg=context.newString(method);argsArg=evalGuest(`(${JSON.stringify(safeArgs)})`);invoke=context.getProp(context.global,'__saveriftInvoke');result=unwrap(context.callFunction(invoke,context.undefined,methodArg,argsArg));const value=await settle(result);try{const text=context.getString(value);if(Buffer.byteLength(text)>limits.jsonBytes)fail('JSON_LIMIT','The plugin result exceeds the JSON limit.');return jsonCopy(JSON.parse(text),limits.jsonBytes);}finally{value.dispose();}}
      catch(error){lastFailure=error;throw error;}
      finally{result?.dispose();methodArg?.dispose();argsArg?.dispose();invoke?.dispose();active=false;updateMetrics();}
    },
    artifacts(){return new Map([...outputs].map(([id,bytes])=>[id,new Uint8Array(bytes)]));},
    metrics:updateMetrics,
    close(){if(closed)return;updateMetrics();try{let pending=0;while(runtime.hasPendingJob()){check();if(++pending>limits.pendingJobs)fail('PENDING_JOB_LIMIT','The plugin exceeded its cleanup pending-job budget.');const jobs=runtime.executePendingJobs(1);if(jobs.error){const error=guestError(jobs.error);jobs.error.dispose();throw error;}}for(const value of contexts)if(value.alive)value.dispose();runtime.dispose();}catch(error){if(!lastFailure)throw new PluginError('RUNTIME_DISPOSAL_FAILED','The isolated instance failed to dispose.');metrics.disposalFailed=true;}finally{closed=true;context=null;runtime=null;memory=null;newContext=null;contexts.clear();inputs.clear();outputs.clear();}}
  };
}
export async function runPlugin(options,host){
  const session=await createPluginSession(options,host);try{const args=options.args??(options.input!==undefined?[options.input]:[]);const result=await session.call(options.method,args);return {result,artifacts:session.artifacts(),metrics:session.metrics(),executionLock:session.executionLock};}finally{session.close();}
}
