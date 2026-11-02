// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createGithubWebhookReceiver,verifyGithubSignature,verifyGithubWebhook} from '../github-webhooks.mjs';
import {createMemoryStore} from '../../workbench/storage.mjs';

const secret="It's a Secret to Everybody",delivery='12345678-1234-5678-9012-123456789abc';
const mapping={id:'42',installationId:'17',owner:'example',name:'ecosystem'};
const bytes=payload=>Buffer.from(typeof payload==='string'?payload:JSON.stringify(payload));
const signed=(payload,event='push',id=delivery)=>{const rawBody=bytes(payload);return {rawBody,headers:{'X-Hub-Signature-256':'sha256='+createHmac('sha256',secret).update(rawBody).digest('hex'),'X-GitHub-Delivery':id,'X-GitHub-Event':event}};};
const payload=extra=>({repository:{id:42},installation:{id:17},ref:'refs/heads/main',...extra});
function harness(options={}){const store=createMemoryStore(),calls=[];let now=1000;const receiver=createGithubWebhookReceiver({store,secret,now:()=>now,resolveRepository:async()=>mapping,reconcile:async value=>{calls.push(value);return {headSha:'a'.repeat(40)};},...options});return {receiver,store,calls,advance:value=>{now+=value;}};}
test('HMAC verifier matches GitHub official raw-body vector exactly',()=>{
 assert.equal(verifyGithubSignature({rawBody:bytes('Hello, World!'),secret,headers:{'X-Hub-Signature-256':'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17'}}),true);
 assert.throws(()=>verifyGithubSignature({rawBody:bytes('Hello, World?'),secret,headers:{'x-hub-signature-256':'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17'}}),{code:'GITHUB_WEBHOOK_SIGNATURE_INVALID'});
});
test('raw UTF8 bytes, strict signature, body limits and headers are verified before parsing',()=>{
 const good=signed(payload({description:'Pywel ✓'}));assert.equal(verifyGithubWebhook({...good,secret}).repositoryId,'42');const changed={...good,rawBody:bytes(payload({description:'Pywel x'}))};assert.throws(()=>verifyGithubWebhook({...changed,secret}),{code:'GITHUB_WEBHOOK_SIGNATURE_INVALID'});assert.throws(()=>verifyGithubWebhook({...good,secret,maxBytes:10}),{code:'GITHUB_WEBHOOK_LIMIT'});assert.throws(()=>verifyGithubWebhook({...signed('not json'),secret}),{code:'GITHUB_WEBHOOK_JSON_INVALID'});assert.throws(()=>verifyGithubWebhook({...good,secret,headers:{...good.headers,'X-GitHub-Delivery':'untrusted'}}),{code:'GITHUB_WEBHOOK_HEADERS_INVALID'});
});
test('unknown and unconfigured-scope events cannot mutate coordination',async()=>{
 const h=harness();assert.equal((await h.receiver.accept(signed(payload(),'ping'))).ignored,true);await assert.rejects(h.receiver.accept(signed(payload({repository:{id:99}}))),{code:'GITHUB_WEBHOOK_SCOPE_DENIED'});assert.equal((await h.store.list('github/')).length,0);assert.equal(h.calls.length,0);
});
test('signed delivery and body dedupe survive concurrency and changed delivery IDs',async()=>{
 const h=harness(),event=signed(payload());const results=await Promise.all([h.receiver.accept(event),h.receiver.accept(event)]);assert.equal(results.filter(x=>!x.duplicate).length,1);const first=results.find(x=>!x.duplicate);assert.equal((await h.receiver.accept(signed(payload(),'push','99999999-1234-5678-9012-123456789abc'))).duplicate,true);await h.receiver.process(first.reconcileKey);assert.equal(h.calls.length,1);assert.equal((await h.receiver.accept(event)).state,'completed');
 await assert.rejects(h.receiver.accept(signed(payload({changed:true}))),{code:'GITHUB_WEBHOOK_DELIVERY_CONFLICT'});
});
test('webhook data is only a hint; reconciliation reads current authority without raw issue or source bodies',async()=>{
 const h=harness(),accepted=await h.receiver.accept(signed(payload({after:'b'.repeat(40),issue:{body:'This raw body is deliberately excluded'},commits:[{message:'not source authority'}]})));assert.equal(h.calls.length,0);assert.equal((await h.receiver.process(accepted.reconcileKey)).state,'completed');assert.equal(h.calls.length,1);const call=h.calls[0];assert.ok(!Object.hasOwn(call,'after'));assert.ok(!Object.hasOwn(call,'issue'));assert.equal(call.repository.id,'42');const stored=await h.store.get(accepted.reconcileKey);assert.equal(stored.value.currentHead,'a'.repeat(40));assert.ok(!JSON.stringify(await h.store.list('github/')).includes('deliberately excluded'));
});
test('parallel processors use one durable CAS lease and repeated completed jobs do not reconcile',async()=>{
 let release,started;const wait=new Promise(resolve=>{release=resolve;}),began=new Promise(resolve=>{started=resolve;});const h=harness({reconcile:async()=>{started();await wait;return {headSha:'a'.repeat(40)};}}),accepted=await h.receiver.accept(signed(payload()));const first=h.receiver.process(accepted.reconcileKey);await began;assert.equal((await h.receiver.process(accepted.reconcileKey)).state,'running');release();assert.equal((await first).state,'completed');assert.equal((await h.receiver.process(accepted.reconcileKey)).state,'completed');
});
test('expired lease can recover safely without a stale worker overwriting the newer reconciliation',async()=>{
 let release,started,count=0;const wait=new Promise(resolve=>{release=resolve;}),began=new Promise(resolve=>{started=resolve;});const h=harness({reconcile:async()=>{if(count++===0){started();await wait;return {headSha:'b'.repeat(40)};}return {headSha:'a'.repeat(40)};}}),accepted=await h.receiver.accept(signed(payload()));const first=h.receiver.process(accepted.reconcileKey);await began;h.advance(60001);assert.equal((await h.receiver.process(accepted.reconcileKey)).state,'completed');release();assert.equal((await first).state,'superseded');assert.equal((await h.store.get(accepted.reconcileKey)).value.currentHead,'a'.repeat(40));
});
test('reconciliation failure stores only safe code, requires backoff and never applies event head',async()=>{
 const h=harness({reconcile:async()=>{throw Error('sensitive upstream text');}}),accepted=await h.receiver.accept(signed(payload({after:'b'.repeat(40)})));assert.equal((await h.receiver.process(accepted.reconcileKey)).state,'failed');assert.equal((await h.receiver.process(accepted.reconcileKey)).state,'retry_pending');assert.ok(!JSON.stringify(await h.store.list('github/')).includes('sensitive'));h.advance(60001);assert.equal((await h.receiver.process(accepted.reconcileKey)).state,'failed');h.advance(120001);assert.equal((await h.receiver.process(accepted.reconcileKey)).state,'failed');h.advance(180001);assert.equal((await h.receiver.process(accepted.reconcileKey)).state,'manual_reconciliation_required');
});
