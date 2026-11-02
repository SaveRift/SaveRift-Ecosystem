import {runPluginWorker} from '../worker-runner.mjs';
import {createExecutionLock} from '../runner.mjs';
import {createSaveBundle} from '../contracts.mjs';
export default {async fetch(request){
  const kind=new URL(request.url).searchParams.get('case')||'ambient';
  const sources={ambient:'return {fetch:typeof fetch,process:typeof process,require:typeof require,crypto:typeof crypto,bytes:ctx.randomBytes(8).length};',binary:'const input=new Uint8Array(64).fill(65),cipher=new Uint8Array(__saveriftChaCha20(input.buffer,new ArrayBuffer(32),new ArrayBuffer(16))),compressed=__saveriftLz4Compress(input.buffer),plain=new Uint8Array(__saveriftLz4Decompress(compressed,64));const text=JSON.parse(__saveriftUtf8Decode(Uint8Array.of(239,187,191,0,65).buffer,1,0));return {cipher:[...cipher.slice(0,8)],roundTrip:plain.length===64&&plain.every(x=>x===65),utf8:[...text].map(c=>c.charCodeAt(0))};',cpu:'while(true){}',memory:'return new ArrayBuffer(80*1024*1024);'};
  if(!Object.hasOwn(sources,kind))return new Response('Unknown fixed probe',{status:400});
  const pkg={manifest:{manifestVersion:'0.1',id:'example.worker-probe',version:'0.1.0',entrypoints:{runtime:'runtime/index.js',runtimeProfile:'isolated-js-v1'}},files:{'runtime/index.js':`export default {detect(_,ctx){${sources[kind]}}}`}};
  try{const outcome=await runPluginWorker({package:pkg,executionLock:createExecutionLock(pkg),bundle:createSaveBundle([]),method:'detect',args:[null],limits:{interrupts:8}});return Response.json({result:outcome.result,metrics:outcome.metrics});}catch(error){return Response.json({code:error.code||'PROBE_ERROR',message:error.message},{status:422});}
}};
