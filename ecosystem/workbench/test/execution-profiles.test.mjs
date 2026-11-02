// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createReviewedLargeSaveProfile, executionProfile} from '../../sdk/execution-profiles.mjs';
import {createPluginSession} from '../../sdk/runner.mjs';
import {validatePackage} from '../../sdk/contracts.mjs';
import {createExecutionLock} from '../../sdk/registry.mjs';
import {createIsolatedExecutor} from '../executor.mjs';
import {TEMPLATES} from '../templates.mjs';
import {packageFromSource, composeExecution} from '../execution.mjs';
function sample() {
  const template = TEMPLATES.find(t => t.id === 'synthetic-json'), pkg = packageFromSource(template.files);
  return {pkg, executionLock: composeExecution({...pkg, digest: pkg.packageDigest}).executionLock, fixtures: [{id: 'fixture_one', name: 'one.json', role: 'main', bytes: new TextEncoder().encode(template.fixture.text)}]};
}
test('only an opaque digest-bound host capability raises the fixed time ceiling', async () => {
  const {pkg, executionLock} = sample(), token = createReviewedLargeSaveProfile({packageDigest: pkg.packageDigest});
  assert.equal(executionProfile(token, validatePackage(pkg).packageDigest).maxPhaseMs, 30000);
  assert.equal(executionProfile(undefined, pkg.packageDigest).maxPhaseMs, 10000);
  assert.throws(() => executionProfile(JSON.parse(JSON.stringify(token)), pkg.packageDigest), {code: 'EXECUTION_PROFILE_DENIED'});
  assert.throws(() => executionProfile(token, 'f'.repeat(64)), {code: 'EXECUTION_PROFILE_DENIED'});
  await assert.rejects(createPluginSession({package: pkg, executionLock, limits: {timeoutMs: 10001}}), {code: 'LIMITS_INVALID'});
  await assert.rejects(createPluginSession({package: pkg, executionLock, executionProfile: {...token}, limits: {timeoutMs: 30000}}), {code: 'EXECUTION_PROFILE_DENIED'});
  await assert.rejects(createPluginSession({package: pkg, executionLock, executionProfile: token, limits: {timeoutMs: 30001}}), {code: 'LIMITS_INVALID'});
  await assert.rejects(createPluginSession({package: pkg, executionLock, executionProfile: token, limits: {interrupts: 100001}}), {code: 'LIMITS_INVALID'});
  await assert.rejects(createPluginSession({package: pkg, executionLock, executionProfile: token, limits: {packageBytes: 2}}), {code: 'PACKAGE_LIMIT'});
  const session = await createPluginSession({package: pkg, executionLock, executionProfile: token, limits: {timeoutMs: 30000}}); session.close();
});
test('full and resumed hosts bind the profile and report fixed30/90 policy', async () => {
  const {pkg, executionLock, fixtures} = sample(), token = createReviewedLargeSaveProfile({packageDigest: pkg.packageDigest}), host = {executionProfileFor: () => token};
  const args = {kind: 'tests', package: pkg, executionLock, fixtures, input: {}};
  const full = await createIsolatedExecutor(host)(args); assert.equal(full.runtime.profile.id, 'developer-large-save-v1'); assert.equal(full.runtime.profile.maxJobWallMs, 90000);
  const first = await createIsolatedExecutor(host).step(args);
  await assert.rejects(createIsolatedExecutor().step(args, first.checkpoint), {code: 'JOB_CHECKPOINT_INVALID'});
  let result = first; while (!result.done) result = await createIsolatedExecutor(host).step(args, JSON.parse(JSON.stringify(result.checkpoint)));
  assert.equal(result.result.runtime.profile.maxPhaseMs, 30000); assert.equal(result.result.runtime.profile.maxJobWallMs, 90000);
});

test('expanded reviewed primary work is fixed, opaque and leaves ordinary and extension quotas intact',async()=>{
 const {pkg:source}=sample(),pkg={manifest:source.manifest,files:{...source.files,[source.manifest.entrypoints.runtime]:'export default {detect(_,ctx){for(let i=0;i<4500;i++)ctx.randomBytes(1);return {done:true};}}'}},pin=validatePackage(pkg).packageDigest,executionLock=composeExecution({...pkg,digest:pin}).executionLock;
 const token=createReviewedLargeSaveProfile({packageDigest:pin,profile:'developer-large-save-v2'});
 assert.equal(executionProfile(token,pin).maxJobHostCalls,8192);assert.equal(executionProfile(token,pin).maxPhaseMs,30000);
 assert.throws(()=>createReviewedLargeSaveProfile({packageDigest:pin,profile:'arbitrary'}),{code:'EXECUTION_PROFILE_INVALID'});
 await assert.rejects(createPluginSession({package:pkg,executionLock,executionProfile:token,limits:{hostCalls:8193}}),{code:'LIMITS_INVALID'});
 await assert.rejects(createPluginSession({package:pkg,executionLock,executionProfile:JSON.parse(JSON.stringify(token))}),{code:'EXECUTION_PROFILE_DENIED'});
 for(const profile of [undefined,createReviewedLargeSaveProfile({packageDigest:pin})]){
  const session=await createPluginSession({package:pkg,executionLock,executionProfile:profile});try{await assert.rejects(session.call('detect',[null]),{code:'HOST_CALL_LIMIT'});assert.equal(session.artifacts().size,0);}finally{session.close();}
 }
 const session=await createPluginSession({package:pkg,executionLock,executionProfile:token});try{assert.deepEqual(await session.call('detect',[null]),{done:true});assert.equal(session.metrics().hostCalls,4500);assert.equal(session.artifacts().size,0);}finally{session.close();}
 const extension={...pkg,manifest:{...pkg.manifest,kind:'extension'}},extensionPin=validatePackage(extension).packageDigest,extensionToken=createReviewedLargeSaveProfile({packageDigest:extensionPin,profile:'developer-large-save-v2'});
 await assert.rejects(createPluginSession({package:extension,executionLock:createExecutionLock({connector:{id:extension.manifest.id,version:extension.manifest.version,digest:extensionPin}}),executionProfile:extensionToken}),{code:'EXECUTION_PROFILE_DENIED'});
});

test('expanded full and resumed jobs report the same bound and reject a profile change',async()=>{
 const {pkg,executionLock,fixtures}=sample(),token=createReviewedLargeSaveProfile({packageDigest:pkg.packageDigest,profile:'developer-large-save-v2'}),host={executionProfileFor:()=>token},args={kind:'tests',package:pkg,executionLock,fixtures,input:{}};
 const executor=createIsolatedExecutor(host),full=await executor(args);assert.equal(full.runtime.profile.maxJobHostCalls,8192);assert.equal(full.runtime.profile.id,'developer-large-save-v2');assert.ok(full.runtime.totals.hostCalls<8192);
 let result=await executor.step(args);await assert.rejects(createIsolatedExecutor({executionProfileFor:()=>createReviewedLargeSaveProfile({packageDigest:pkg.packageDigest})}).step(args,result.checkpoint),{code:'JOB_CHECKPOINT_INVALID'});
 const exhausted=structuredClone(result.checkpoint);exhausted.phases[0].hostCalls=8191;await assert.rejects(executor.step(args,exhausted),error=>['HOST_CALL_LIMIT','JOB_RESOURCE_LIMIT'].includes(error.code));
 while(!result.done)result=await executor.step(args,JSON.parse(JSON.stringify(result.checkpoint)));
 assert.equal(result.result.runtime.profile.maxJobHostCalls,8192);assert.equal(result.result.runtime.totals.hostCalls,full.runtime.totals.hostCalls);
});
test('profiled malicious CPU, heap, callbacks and cancellation remain contained without outputs', async () => {
  const {pkg: source} = sample();
  async function invoke(code, limits = {}, host = {}, signal) {
    const pkg = {manifest: source.manifest, files: {...source.files, [source.manifest.entrypoints.runtime]: code}}, pin = validatePackage(pkg).packageDigest;
    const token = createReviewedLargeSaveProfile({packageDigest: pin}), executionLock = composeExecution({...pkg, digest: pin}).executionLock;
    const session = await createPluginSession({package: pkg, executionLock, executionProfile: token, limits: {timeoutMs: 30000, ...limits}, signal}, host);
    const started = performance.now();
    try {await session.call('detect', [null]); throw Error('Malicious method unexpectedly returned.');}
    catch (error) {assert.equal(session.artifacts().size, 0); assert.ok(performance.now() - started < 1500, 'a reduced interrupt/heap/callback budget must fail promptly'); throw error;}
    finally {session.close();}
  }
  await assert.rejects(invoke('export default {detect(){for(;;){}}}', {interrupts: 8}), {code: 'CPU_LIMIT'});
  await assert.rejects(invoke('export default {detect(){return new ArrayBuffer(80*1024*1024);}}'), {code: 'MEMORY_LIMIT'});
  await assert.rejects(invoke('export default {detect(_,ctx){for(;;)ctx.randomBytes(1);}}', {hostCalls: 2}), {code: 'HOST_CALL_LIMIT'});
  const controller = new AbortController();
  await assert.rejects(invoke('export default {detect(_,ctx){ctx.reportProgress({phase:"test",completed:0});for(;;){}}}', {}, {onProgress(){controller.abort();}}, controller.signal), {code: 'JOB_ABORTED'});
});
