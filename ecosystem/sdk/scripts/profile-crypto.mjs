#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Synthetic byte buffers only. No account, player fixture, network or budget override.
import {build} from 'esbuild';
import {createHash,createHmac} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createSaveBundle} from '../contracts.mjs';
import {runPlugin,createExecutionLock} from '../runner.mjs';

const source=`import {hash,hmacSha256} from './crypto.mjs';
import {Buffer} from './buffer.mjs';
export default {detect(bundle,operation,ctx){
 const bytes=ctx.readArtifact(bundle.artifacts[0].id),started=Date.now();let result;
 if(operation==='sha256')result=hash(bytes);
 else if(operation==='hmac')result=hmacSha256(new Uint8Array([1,2,3]),bytes).toString('hex');
 else if(operation==='base64'){const value=Buffer.from(bytes).toString('base64');result={length:value.length,prefix:value.slice(0,32),suffix:value.slice(-32)};}
 else if(operation==='base64-roundtrip'){const value=Buffer.from(Buffer.from(bytes).toString('base64'),'base64');result={length:value.length,prefix:Array.from(value.subarray(0,8)),suffix:Array.from(value.subarray(-8))};}
 else if(operation==='ten-copies'){let value;for(let i=0;i<10;i++)value=Buffer.from(bytes);result={length:value.length};}
 else throw Error('Unknown synthetic operation');
 return {operation,operationMs:Date.now()-started,result};
}};`;
const code=(await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('..',import.meta.url)),sourcefile:'crypto-profile.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;
const pkg={manifest:{manifestVersion:'0.1',id:'example.crypto-profile',version:'0.1.0',entrypoints:{runtime:'runtime/index.mjs',runtimeProfile:'isolated-js-v1'}},files:{'runtime/index.mjs':code}};
let failed=false;
for(const byteLength of [1022451,4114945]){
 const bytes=Uint8Array.from({length:byteLength},(_,index)=>index%251),digest=createHash('sha256').update(bytes).digest('hex');
 const artifact={id:'synthetic-crypto-bytes',logicalPath:'synthetic.bytes',role:'main',byteLength,sha256:digest},bundle=createSaveBundle([artifact]);
 for(const operation of ['sha256','hmac','base64','base64-roundtrip','ten-copies']){
  try{
   const output=await runPlugin({package:pkg,bundle,executionLock:createExecutionLock(pkg),artifacts:new Map([[artifact.id,bytes]]),method:'detect',args:[bundle,operation]});
   let expected;
   if(operation==='sha256')expected=digest;
   else if(operation==='hmac')expected=createHmac('sha256',new Uint8Array([1,2,3])).update(bytes).digest('hex');
   else if(operation==='base64'){const value=Buffer.from(bytes).toString('base64');expected={length:value.length,prefix:value.slice(0,32),suffix:value.slice(-32)};}
   else if(operation==='base64-roundtrip')expected={length:byteLength,prefix:Array.from(bytes.subarray(0,8)),suffix:Array.from(bytes.subarray(-8))};
   else expected={length:byteLength};
   if(JSON.stringify(output.result.result)!==JSON.stringify(expected))throw Error('Independent native result mismatch');
   console.log(JSON.stringify({byteLength,operation,status:'passed',operationMs:output.result.operationMs,metrics:output.metrics}));
  }catch(error){failed=true;console.log(JSON.stringify({byteLength,operation,status:'failed',code:error.code||'CRYPTO_PROFILE_FAILED'}));}
 }
}
if(failed)process.exitCode=1;
