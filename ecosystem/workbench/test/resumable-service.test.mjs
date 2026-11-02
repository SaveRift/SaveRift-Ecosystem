// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryStore, sha256} from '../storage.mjs';
import {createWorkspaceService} from '../service.mjs';
import {createIsolatedExecutor} from '../executor.mjs';
import {DEFAULT_SCOPES} from '../tool-definitions.mjs';
import {createGameAccess} from '../../collaboration/enrollment.mjs';
const alice = {id: 'resumed-owner', scopes: [...DEFAULT_SCOPES]}, bob = {id: 'independent-owner', scopes: [...DEFAULT_SCOPES]};
const deferred = () => {let resolve; const promise = new Promise(done => resolve = done); return {promise, resolve};};
async function harness({executeJob = createIsolatedExecutor(), enrolled = false, now} = {}) {
  const store = createMemoryStore(), tasks = [], access = enrolled ? createGameAccess({store}) : undefined;
  if (access) await access.enroll(alice, {gameId: 'synthetic', expectedRevision: 0});
  const collaboration = {verifyDiscovery: async () => ({gameId: 'synthetic', project: access.getProject('synthetic')})};
  const service = () => createWorkspaceService({store, executeJob, access, collaboration, resumableJobs: true, schedule: p => tasks.push(p), ...(now ? {now} : {})});
  const call = (name, args, principal = alice, context) => service().dispatch(principal, 'saverift_' + name, args, context);
  const workspace = (await call('workspace_create', {template: 'synthetic-json', name: 'Resumed test', ...(enrolled ? {gameId: 'synthetic', discoveryId: 'discovery_valid123'} : {})})).workspace;
  const build = await call('plugin_build', {workspaceId: workspace.id, expectedRevision: workspace.revision}); await Promise.all(tasks.splice(0));
  const artifactId = (await call('job_status', {workspaceId: workspace.id, jobId: build.jobId})).job.result.artifactId;
  const current = (await call('workspace_status', {workspaceId: workspace.id})).workspace;
  const args = {workspaceId: current.id, artifactId, fixtureIds: current.fixtures.map(f => f.id)};
  const rows = async category => (await store.list('developers/', 1000)).filter(row => row.key.includes('/' + category + '/'));
  return {store, access, service, call, args, rows};
}
function fakeExecutor(step) {const fn = () => {throw Error('The full pipeline must not run.');}; fn.step = step; return fn;}
function pause(checkpoint = null) {return {done: false, checkpoint: {phases: [...(checkpoint?.phases || []), {phase: 'synthetic'}], marker: 'private-checkpoint-marker'}};}

test('separate HTTP hosts resume one fresh engine per poll and expose no checkpoints', async () => {
  const h = await harness(), job = await h.call('tests_run', h.args), ref = {workspaceId: h.args.workspaceId, jobId: job.jobId};
  assert.equal((await h.rows('jobcheckpoints')).length, 1);
  await assert.rejects(h.call('job_status', ref, bob), {code: 'WORKSPACE_NOT_FOUND'});
  let last;
  for (let poll = 0; poll < 3; poll++) {
    last = await h.call('job_status', ref); // a new service instance every time
    assert.equal(JSON.stringify(last).includes('checkpointDigest'), false);
    assert.equal(JSON.stringify(last).includes('consentProofs'), false);
    assert.equal(JSON.stringify(last).includes('phaseLease'), false);
    if (poll < 2) assert.equal(last.job.progress.completedEngines, poll + 2);
  }
  assert.equal(last.status, 'passed');
  assert.deepEqual(last.job.result.runtime.phases.map(p => p.phase), ['inspection', 'serialization', 'validation', 'reopen']);
  assert.equal((await h.rows('jobcheckpoints')).length, 0);
});
test('concurrent authenticated polls acquire one CAS lease, never replaying an engine', async () => {
  const entered = deferred(), hold = deferred(); let calls = 0;
  const h = await harness({executeJob: fakeExecutor(async (_, checkpoint) => {calls++; if (calls === 2) {entered.resolve(); await hold.promise;} return pause(checkpoint);})});
  const job = await h.call('tests_run', h.args), ref = {workspaceId: h.args.workspaceId, jobId: job.jobId};
  const first = h.call('job_status', ref); await entered.promise;
  const second = await h.call('job_status', ref); assert.equal(second.status, 'running'); assert.equal(calls, 2);
  assert.equal(JSON.stringify(second).includes('private-checkpoint-marker'), false);
  hold.resolve(); await first; assert.equal(calls, 2);
});
test('cancellation in another HTTP host suppresses a late candidate and future phases', async () => {
  const entered = deferred(), hold = deferred(); let calls = 0; const bytes = new TextEncoder().encode('private-late-output');
  const h = await harness({executeJob: fakeExecutor(async (_, checkpoint) => {calls++; if (calls === 1) return pause(checkpoint); entered.resolve(); await hold.promise; return {done: true, result: {status: 'passed', privateArtifacts: [{id: 'output_late123', logicalPath: 'one.json', role: 'main', byteLength: bytes.length, sha256: sha256(bytes), bytes}]}};})});
  const job = await h.call('tests_run', h.args), ref = {workspaceId: h.args.workspaceId, jobId: job.jobId};
  const running = h.call('job_status', ref); await entered.promise; await h.call('job_cancel', ref); hold.resolve(); await running;
  assert.equal((await h.call('job_status', ref)).status, 'cancelled'); assert.equal(calls, 2);
  assert.equal((await h.rows('candidates')).length, 0); assert.equal((await h.rows('jobcheckpoints')).length, 0);
  await assert.rejects(h.service().downloadCandidate(alice, job.jobId), {code: 'VALIDATED_CANDIDATE_REQUIRED'});
});
test('consent revision changes cannot revive a continuation after off/on', async () => {
  let calls = 0;
  const h = await harness({executeJob: fakeExecutor(async (_, checkpoint) => {calls++; return pause(checkpoint);})}), job = await h.call('tests_run', h.args);
  const owner = h.service(), fixtureId = h.args.fixtureIds[0];
  await owner.trustedSetFixtureConsent(alice, h.args.workspaceId, fixtureId, false);
  await owner.trustedSetFixtureConsent(alice, h.args.workspaceId, fixtureId, true);
  await assert.rejects(h.call('job_status', {workspaceId: h.args.workspaceId, jobId: job.jobId}), {code: 'FIXTURE_AUTHORIZATION_CHANGED'}); assert.equal(calls, 1);
  // Owner UI can inspect the terminal failure without granting model access.
  const result = await h.call('job_status', {workspaceId: h.args.workspaceId, jobId: job.jobId}, alice, {channel: 'trusted-ui'});
  assert.equal(result.status, 'failed'); assert.equal(result.job.result.code, 'FIXTURE_AUTHORIZATION_CHANGED');
});
test('revoked game grants cannot resume after re-enrollment', async () => {
  let calls = 0;
  const h = await harness({enrolled: true, executeJob: fakeExecutor(async (_, checkpoint) => {calls++; return pause(checkpoint);})}), job = await h.call('tests_run', h.args);
  const disabled = await h.access.optOut(alice, {gameId: 'synthetic', expectedRevision: 1}); await h.access.enroll(alice, {gameId: 'synthetic', expectedRevision: disabled.revision});
  await assert.rejects(h.call('job_status', {workspaceId: h.args.workspaceId, jobId: job.jobId}), {code: 'GAME_GRANT_REVOKED'}); assert.equal(calls, 1);
});
test('tampered private state and expired uncertain leases stop without CPU replay', async () => {
  let clock = Date.now(), calls = 0;
  const h = await harness({now: () => clock, executeJob: fakeExecutor(async (_, checkpoint) => {calls++; return pause(checkpoint);})});
  const first = await h.call('tests_run', h.args), checkpoint = (await h.rows('jobcheckpoints'))[0];
  await h.store.put(checkpoint.key, {...checkpoint.value, checkpoint: {phases: [], marker: 'tampered'}}, {ifMatch: checkpoint.etag});
  const failed = await h.call('job_status', {workspaceId: h.args.workspaceId, jobId: first.jobId});
  assert.equal(failed.job.result.code, 'JOB_CHECKPOINT_INVALID'); assert.equal(calls, 1);
  const second = await h.call('tests_run', h.args), row = (await h.rows('jobs')).find(row => row.value.id === second.jobId);
  await h.store.put(row.key, {...row.value, phaseState: 'executing', phaseLease: {id: 'phase_lost', expiresAt: clock + 45000}}, {ifMatch: row.etag});
  clock += 45001;
  const interrupted = await h.call('job_status', {workspaceId: h.args.workspaceId, jobId: second.jobId});
  assert.equal(interrupted.job.result.code, 'JOB_PHASE_INTERRUPTED'); assert.equal(calls, 2);
});
test('workspace evidence changes isolate old job inputs from the migrated source', async () => {
  let calls = 0;
  const h = await harness({executeJob: fakeExecutor(async (_, checkpoint) => {calls++; return pause(checkpoint);})}), job = await h.call('tests_run', h.args), ws = (await h.rows('workspaces'))[0];
  await h.store.put(ws.key, {...ws.value, evidenceEpoch: 'new-explicit-binding'}, {ifMatch: ws.etag});
  await assert.rejects(h.call('job_status', {workspaceId: h.args.workspaceId, jobId: job.jobId}), {code: 'WORKSPACE_EVIDENCE_STALE'}); assert.equal(calls, 1);
});
test('fixture consent and game grant are rechecked after engine execution before checkpoint persistence', async () => {
  for (const revoke of ['consent', 'grant']) {
    const entered = deferred(), hold = deferred(); let calls = 0;
    const h = await harness({enrolled: revoke === 'grant', executeJob: fakeExecutor(async (_, checkpoint) => {calls++; if (calls === 1) return pause(checkpoint); entered.resolve(); await hold.promise; return pause(checkpoint);})});
    const job = await h.call('tests_run', h.args), ref = {workspaceId: h.args.workspaceId, jobId: job.jobId}, running = h.call('job_status', ref);
    await entered.promise;
    if (revoke === 'consent') {
      await h.service().trustedSetFixtureConsent(alice, h.args.workspaceId, h.args.fixtureIds[0], false);
      await h.service().trustedSetFixtureConsent(alice, h.args.workspaceId, h.args.fixtureIds[0], true);
    } else {
      const disabled = await h.access.optOut(alice, {gameId: 'synthetic', expectedRevision: 1}); await h.access.enroll(alice, {gameId: 'synthetic', expectedRevision: disabled.revision});
    }
    hold.resolve();
    await assert.rejects(running, {code: revoke === 'consent' ? 'FIXTURE_AUTHORIZATION_CHANGED' : 'GAME_GRANT_REVOKED'});
    const row = (await h.rows('jobs')).find(row => row.value.id === job.jobId);
    assert.equal(row.value.status, 'failed'); assert.equal(row.value.result.code, revoke === 'consent' ? 'FIXTURE_AUTHORIZATION_CHANGED' : 'GAME_GRANT_REVOKED');
    assert.equal((await h.rows('jobcheckpoints')).length, 0); assert.equal((await h.rows('candidates')).length, 0); assert.equal(calls, 2);
  }
});
test('only a passed owner-bound resumed candidate exposes a separate download', async () => {
  const h = await harness(), job = await h.call('candidate_prepare', {...h.args, operations: [{id: 'synthetic.level.set', apiVersion: '0.1.0', params: {level: 12}}]}), ref = {workspaceId: h.args.workspaceId, jobId: job.jobId};
  await assert.rejects(h.service().downloadCandidate(alice, job.jobId), {code: 'VALIDATED_CANDIDATE_REQUIRED'});
  let response; for (let i = 0; i < 3; i++) response = await h.call('job_status', ref);
  assert.equal(response.status, 'passed'); assert.equal(response.job.result.summary.after.level, 12);
  assert.equal(JSON.stringify(response).includes('privateArtifacts'), false);
  assert.equal(JSON.stringify(response).includes('"bytes"'), false);
  await assert.rejects(h.service().downloadCandidate(bob, job.jobId), {code: 'OBJECT_NOT_FOUND'});
  const downloaded = await h.service().downloadCandidate(alice, job.jobId);
  for (const artifact of downloaded.artifacts) {const bytes = Buffer.from(artifact.bytes, 'base64'); assert.equal(bytes.length, artifact.byteLength); assert.equal(sha256(bytes), artifact.sha256);}
});
