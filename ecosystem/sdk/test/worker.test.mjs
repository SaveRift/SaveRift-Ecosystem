import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {createCipheriv} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildWorkerRunner} from '../build-worker.mjs';
test('actual workerd static-Wasm adapter runs offline guest and enforces CPU/memory quotas',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'saverift-workerd-'));let worker;
  try{
    const built=await buildWorkerRunner({entrypoint:fileURLToPath(new URL('./worker-probe.mjs',import.meta.url)),outdir:dir});
    const port=await new Promise(resolve=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
    const architecture=process.arch==='x64'?'64':process.arch,platform=process.platform==='win32'?'windows':process.platform;
    const binary=fileURLToPath(import.meta.resolve(`@cloudflare/workerd-${platform}-${architecture}/bin/workerd${process.platform==='win32'?'.exe':''}`));
    worker=spawn(binary,['serve',built.config,`--socket-addr=http=127.0.0.1:${port}`],{stdio:['ignore','pipe','pipe']});let errors='';worker.stderr.on('data',data=>{errors+=data.toString().slice(0,4000);});
    const endpoint=`http://127.0.0.1:${port}/`;let ready;
    for(let i=0;i<100;i++){if(worker.exitCode!==null)throw new Error('workerd startup failed: '+errors);try{ready=await fetch(endpoint);break;}catch{await new Promise(resolve=>setTimeout(resolve,20));}}
    assert.ok(ready,'workerd did not become ready: '+errors);const body=await ready.json();assert.equal(ready.status,200,JSON.stringify(body)+' '+errors);assert.deepEqual(body.result,{bytes:8,crypto:'undefined',fetch:'undefined',process:'undefined',require:'undefined'});assert.ok(body.metrics.memoryBytes<=64*1024*1024);
    const binaryResult=await (await fetch(endpoint+'?case=binary')).json();assert.deepEqual(binaryResult.result,{cipher:[...createCipheriv('chacha20',new Uint8Array(32),new Uint8Array(16)).update(new Uint8Array(64).fill(65)).subarray(0,8)],roundTrip:true});
    for(const [kind,code]of [['cpu','CPU_LIMIT'],['memory','MEMORY_LIMIT']]){const response=await fetch(endpoint+'?case='+kind),body=await response.json();assert.equal(response.status,422);assert.equal(body.code,code,JSON.stringify(body));}
  }finally{if(worker&&worker.exitCode===null){worker.kill('SIGTERM');await new Promise(resolve=>worker.once('exit',resolve));}await rm(dir,{recursive:true,force:true});}
});
