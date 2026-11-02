// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createReviewedLargeSaveProfile, executionProfile} from '../../sdk/execution-profiles.mjs';
import {createPluginSession} from '../../sdk/runner.mjs';
import {validatePackage} from '../../sdk/contracts.mjs';
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
