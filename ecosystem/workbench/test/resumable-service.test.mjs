// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryStore, sha256} from '../storage.mjs';
import {createWorkspaceService} from '../service.mjs';
import {createIsolatedExecutor} from '../executor.mjs';
import {DEFAULT_SCOPES} from '../tool-definitions.mjs';
import {createGameAccess} from '../../collaboration/enrollment.mjs';
import {LIMITS as SDK_LIMITS} from '../../sdk/contracts.mjs';
const alice = {id: 'resumed-owner', scopes: [...DEFAULT_SCOPES]}, bob = {id: 'independent-owner', scopes: [...DEFAULT_SCOPES]};
const deferred = () => {let resolve; const promise = new Promise(done => resolve = done); return {promise, resolve};};
async function harness({executeJob = createIsolatedExecutor(), enrolled = false, now, resumable = true} = {}) {
  const store = createMemoryStore(), tasks = [], access = enrolled ? createGameAccess({store}) : undefined;
  if (access) await access.enroll(alice, {gameId: 'synthetic', expectedRevision: 0});
  const collaboration = {verifyDiscovery: async () => ({gameId: 'synthetic', project: access.getProject('synthetic')})};
  const service = () => createWorkspaceService({store, executeJob, access, collaboration, resumableJobs: resumable, schedule: p => tasks.push(p), ...(now ? {now} : {})});
  const call = (name, args, principal = alice, context) => service().dispatch(principal, 'saverift_' + name, args, context);
  const workspace = (await call('workspace_create', {template: 'synthetic-json', name: 'Resumed test', ...(enrolled ? {gameId: 'synthetic', discoveryId: 'discovery_valid123'} : {})})).workspace;
  const build = await call('plugin_build', {workspaceId: workspace.id, expectedRevision: workspace.revision}); await Promise.all(tasks.splice(0));
  const artifactId = (await call('job_status', {workspaceId: workspace.id, jobId: build.jobId})).job.result.artifactId;
  const current = (await call('workspace_status', {workspaceId: workspace.id})).workspace;
  const args = {workspaceId: current.id, artifactId, fixtureIds: current.fixtures.map(f => f.id)};
  const rows = async category => (await store.list('developers/', 1000)).filter(row => row.key.includes('/' + category + '/'));
  return {store, access, service, call, args, rows, tasks};
}
function fakeExecutor(step) {const fn = () => {throw Error('The full pipeline must not run.');}; fn.step = step; return fn;}
function pause(checkpoint = null) {return {done: false, checkpoint: {phases: [...(checkpoint?.phases || []), {phase: 'synthetic'}], marker: 'private-checkpoint-marker'}};}

for (const resumable of [false, true]) test(`large diagnostic queries become digest receipts after validation in ${resumable ? 'resumed' : 'full'} jobs`, async () => {
  const query = {records: Array.from({length: 1200}, (_, i) => ({id: i, label: 'Synthetic 猫 record '.repeat(8)}))};
  const result = {status: 'passed', checks: [{name: 'independent-reopen', status: 'passed'}], executionLockDigest: 'a'.repeat(64), summary: {description: {domainApis: {'test.domain': '0.1.0'}}, originalQuery: query, before: query, after: query, changes: [{operation: 'test.level.set', before: 7, after: 12}], candidateBundleDigest: 'b'.repeat(64)}};
  const executeJob = Object.assign(async () => structuredClone(result), {step: async () => ({done: true, result: structuredClone(result)})});
  const h = await harness({executeJob, resumable}), start = await h.call('tests_run', h.args); await Promise.all(h.tasks.splice(0));
  const status = await h.call('job_status', {workspaceId: h.args.workspaceId, jobId: start.jobId}), stored = status.job.result;
  assert.equal(status.status, 'passed'); assert.deepEqual(stored.checks, result.checks);
  assert.equal(stored.executionLockDigest, result.executionLockDigest);
  assert.deepEqual(stored.summary.changes, result.summary.changes);
  assert.equal(stored.summary.candidateBundleDigest, result.summary.candidateBundleDigest);
  assert.deepEqual(stored.summary.description, result.summary.description);
  for (const name of ['originalQuery', 'before', 'after']) {
    assert.equal(stored.summary[name].detail, 'omitted_from_job_report');
    assert.equal(stored.summary[name].sha256, sha256(JSON.stringify(query)));
    assert.equal(stored.summary[name].byteLength, new TextEncoder().encode(JSON.stringify(query)).length);
  }
  assert.ok(new TextEncoder().encode(JSON.stringify(status)).length < 64 * 1024);
  assert.equal(result.summary.originalQuery.records.length, 1200);
});

for (const resumable of [false, true]) test(`large validation and intent reports still fail the existing quota in ${resumable ? 'resumed' : 'full'} jobs`, async () => {
  const result = {status: 'passed', summary: {before: {large: 'x'.repeat(100000)}, changes: [{operation: 'test.excessive', detail: 'x'.repeat(70000)}]}};
  const executeJob = Object.assign(async () => structuredClone(result), {step: async () => ({done: true, result: structuredClone(result)})});
  const h = await harness({executeJob, resumable}), start = await h.call('tests_run', h.args); await Promise.all(h.tasks.splice(0));
  const status = await h.call('job_status', {workspaceId: h.args.workspaceId, jobId: start.jobId});
  assert.equal(status.status, 'failed'); assert.equal(status.job.result.code, 'RUNNER_OUTPUT_LIMIT');
  assert.equal((await h.rows('candidates')).length, 0);
});

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

function referencedExecutor(bytes, {beforeResult, beforeRead} = {}) {
  let calls = 0;
  const descriptor = {id: 'output_private_size', logicalPath: 'synthetic-size.main', role: 'main', byteLength: bytes.length, sha256: sha256(bytes)};
  const executeJob = fakeExecutor(async ({checkpointArtifacts}, checkpoint) => {
    calls++;
    if (calls === 1) return pause(checkpoint);
    if (calls === 2) {
      const ref = await checkpointArtifacts.write(descriptor, bytes);
      if (beforeResult) await beforeResult();
      return {done: false, checkpoint: {phases: [{phase: 'inspection'}, {phase: 'serialization'}], artifacts: [{...descriptor, ref}]}};
    }
    if (beforeRead) await beforeRead();
    const restored = await checkpointArtifacts.read(checkpoint.artifacts[0]);
    return {done: true, result: {status: 'passed', privateArtifacts: [{...descriptor, bytes: restored}]}};
  });
  return executeJob;
}

test('encrypted object references persist a size-equivalent output and are removed after exact download publication', async () => {
  const bytes = new Uint8Array(7459585).fill(19), h = await harness({executeJob: referencedExecutor(bytes)});
  const job = await h.call('candidate_prepare', {...h.args, operations: [{id: 'synthetic.level.set', apiVersion: '0.1.0', params: {level: 8}}]}), ref = {workspaceId: h.args.workspaceId, jobId: job.jobId};
  const progress = await h.call('job_status', ref), checkpoint = (await h.rows('jobcheckpoints'))[0];
  assert.ok(Buffer.byteLength(JSON.stringify(checkpoint.value)) < 16384);
  assert.equal(JSON.stringify(checkpoint.value).includes('"bytes"'), false);
  assert.equal(JSON.stringify(progress).includes('jobartifacts'), false);
  assert.equal((await h.rows('jobartifacts')).length, 1);
  await assert.rejects(h.call('job_status', ref, bob), {code: 'WORKSPACE_NOT_FOUND'});
  assert.equal((await h.call('job_status', ref)).status, 'passed');
  const downloaded = await h.service().downloadCandidate(alice, job.jobId);
  assert.equal(downloaded.artifacts[0].byteLength, bytes.length);
  assert.equal(sha256(Buffer.from(downloaded.artifacts[0].bytes, 'base64')), sha256(bytes));
  assert.equal((await h.rows('jobartifacts')).length, 0);
  assert.equal((await h.rows('jobartifactindexes')).length, 0);
  assert.equal((await h.rows('jobcheckpoints')).length, 0);
});

for (const mutation of ['missing', 'binding', 'bytes', 'length']) test(`a ${mutation} private output cannot resume or become a candidate`, async () => {
  const h = await harness({executeJob: referencedExecutor(new Uint8Array(64).fill(17))}), job = await h.call('tests_run', h.args), ref = {workspaceId: h.args.workspaceId, jobId: job.jobId};
  await h.call('job_status', ref);
  const artifact = (await h.rows('jobartifacts'))[0];
  if (mutation === 'missing') await h.store.delete(artifact.key);
  else await h.store.put(artifact.key, {...artifact.value, ...(mutation === 'binding' ? {bindingDigest: '0'.repeat(64)} : mutation === 'length' ? {byteLength: SDK_LIMITS.artifactBytes + 1} : {bytes: Buffer.from('tampered').toString('base64')})}, {ifMatch: artifact.etag});
  const failed = await h.call('job_status', ref);
  assert.equal(failed.status, 'failed'); assert.equal(failed.job.result.code, 'JOB_CHECKPOINT_INVALID');
  assert.equal((await h.rows('candidates')).length, 0); assert.equal((await h.rows('jobartifacts')).length, 0);
});

test('private output count, per-artifact and aggregate budgets are not raised by references', async () => {
  for (const limit of ['artifact', 'count', 'aggregate']) {
    const executeJob = fakeExecutor(async ({checkpointArtifacts}) => {
      const count = limit === 'count' ? 33 : limit === 'aggregate' ? 4 : 1;
      for (let i = 0; i < count; i++) {
        const bytes = new Uint8Array(limit === 'artifact' ? SDK_LIMITS.artifactBytes + 1 : limit === 'aggregate' ? 7 * 1024 * 1024 : 1).fill(i);
        await checkpointArtifacts.write({id: 'output_' + i, byteLength: bytes.length, sha256: sha256(bytes)}, bytes);
      }
      throw Error('Budget should reject before this point.');
    });
    const h = await harness({executeJob}), job = await h.call('tests_run', h.args), status = await h.call('job_status', {workspaceId: h.args.workspaceId, jobId: job.jobId});
    assert.equal(status.status, 'failed'); assert.equal(status.job.result.code, limit === 'artifact' ? 'JOB_CHECKPOINT_INVALID' : 'JOB_CHECKPOINT_LIMIT');
    assert.equal((await h.rows('jobartifacts')).length, 0);
  }
});

for (const interruption of ['cancel', 'consent', 'grant', 'source']) test(`${interruption} during a private artifact phase prevents late persistence and cleans outputs`, async () => {
  const entered = deferred(), hold = deferred();
  const h = await harness({enrolled: interruption === 'grant', executeJob: referencedExecutor(new Uint8Array(64).fill(17), {beforeResult: async () => {entered.resolve(); await hold.promise;}})});
  const job = await h.call('tests_run', h.args), ref = {workspaceId: h.args.workspaceId, jobId: job.jobId}, running = h.call('job_status', ref);
  await entered.promise;
  assert.equal((await h.rows('jobartifacts')).length, 1);
  if (interruption === 'cancel') await h.call('job_cancel', ref);
  if (interruption === 'consent') await h.service().trustedSetFixtureConsent(alice, h.args.workspaceId, h.args.fixtureIds[0], false);
  if (interruption === 'grant') {const disabled = await h.access.optOut(alice, {gameId: 'synthetic', expectedRevision: 1}); await h.access.enroll(alice, {gameId: 'synthetic', expectedRevision: disabled.revision});}
  if (interruption === 'source') {const row = (await h.rows('workspaces'))[0]; await h.store.put(row.key, {...row.value, evidenceEpoch: 'changed-source'}, {ifMatch: row.etag});}
  hold.resolve();
  if (interruption === 'cancel') assert.equal((await running).status, 'cancelled');
  else await assert.rejects(running, {code: interruption === 'consent' ? 'FIXTURE_AUTHORIZATION_CHANGED' : interruption === 'grant' ? 'GAME_GRANT_REVOKED' : 'WORKSPACE_EVIDENCE_STALE'});
  assert.equal((await h.rows('jobartifacts')).length, 0); assert.equal((await h.rows('jobcheckpoints')).length, 0); assert.equal((await h.rows('candidates')).length, 0);
});

test('cancel between descriptor reservation and payload persistence cleans the partial write', async () => {
  const entered = deferred(), hold = deferred(), h = await harness({executeJob: referencedExecutor(new Uint8Array(64).fill(17))});
  const put = h.store.put.bind(h.store); let held = false;
  h.store.put = async (key, value, options) => {const row = await put(key, value, options); if (!held && key.includes('/jobartifactindexes/')) {held = true; entered.resolve(); await hold.promise;} return row;};
  const job = await h.call('tests_run', h.args), ref = {workspaceId: h.args.workspaceId, jobId: job.jobId}, running = h.call('job_status', ref);
  await entered.promise; await h.call('job_cancel', ref); hold.resolve();
  assert.equal((await running).status, 'cancelled');
  assert.equal((await h.rows('jobartifacts')).length, 0); assert.equal((await h.rows('jobartifactindexes')).length, 0);
});

test('an uncertain payload put is cleaned and cannot become a resumable result', async () => {
  const h = await harness({executeJob: referencedExecutor(new Uint8Array(64).fill(17))}), put = h.store.put.bind(h.store); let injected = false;
  h.store.put = async (key, value, options) => {const row = await put(key, value, options); if (!injected && key.includes('/jobartifacts/')) {injected = true; throw Object.assign(Error('synthetic uncertain storage write'), {code: 'SYNTHETIC_STORAGE_FAILURE'});} return row;};
  const job = await h.call('tests_run', h.args), status = await h.call('job_status', {workspaceId: h.args.workspaceId, jobId: job.jobId});
  assert.equal(status.status, 'failed'); assert.equal(status.job.result.code, 'SYNTHETIC_STORAGE_FAILURE');
  assert.equal((await h.rows('jobartifacts')).length, 0); assert.equal((await h.rows('jobartifactindexes')).length, 0); assert.equal((await h.rows('jobcheckpoints')).length, 0);
});

test('an expired uncertain lease cleans referenced outputs without replay', async () => {
  let clock = Date.now();
  const h = await harness({now: () => clock, executeJob: referencedExecutor(new Uint8Array(64).fill(17))}), job = await h.call('tests_run', h.args), ref = {workspaceId: h.args.workspaceId, jobId: job.jobId};
  await h.call('job_status', ref);
  const row = (await h.rows('jobs')).find(value => value.value.id === job.jobId);
  await h.store.put(row.key, {...row.value, phaseState: 'executing', phaseLease: {id: 'phase_uncertain', expiresAt: clock + 45000}}, {ifMatch: row.etag}); clock += 45001;
  assert.equal((await h.call('job_status', ref)).job.result.code, 'JOB_PHASE_INTERRUPTED');
  assert.equal((await h.rows('jobartifacts')).length, 0); assert.equal((await h.rows('jobartifactindexes')).length, 0);
});
