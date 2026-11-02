// SPDX-License-Identifier: Apache-2.0
// Worker routing/authentication integration; synthetic identities/fixtures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeveloperWorker} from '../worker-entry.mjs';
import {createMemoryStore} from '../storage.mjs';
import {DEFAULT_SCOPES} from '../tool-definitions.mjs';
const alice = {id: 'worker-synthetic-alice', scopes: [...DEFAULT_SCOPES]}, bob = {id: 'worker-synthetic-bob', scopes: [...DEFAULT_SCOPES]};
async function harness(resumableJobs) {
  const store = createMemoryStore(), pending = []; let fullCalls = 0, phaseCalls = 0;
  const executeJob = async () => {fullCalls++; return {status: 'passed', synthetic: 'complete-default-pipeline'};};
  executeJob.step = async (_, checkpoint) => {
    phaseCalls++;
    if (!checkpoint) return {done: false, checkpoint: {phases: [{phase: 'synthetic-first'}], secret: 'private-intermediate-marker'}};
    return {done: true, result: {status: 'passed', synthetic: 'finished-second-phase'}};
  };
  const worker = createDeveloperWorker({
    authenticate: async request => ({'Bearer alice': alice, 'Bearer bob': bob}[request.headers.get('authorization')] || null),
    createStore: async () => store, executeJob, assetFetch: async () => new Response('asset'),
    allowedHosts: ['studio.test'], allowedOrigins: ['https://studio.test'],
    ...(resumableJobs === undefined ? {} : {resumableJobs})
  });
  async function call(name, args = {}, authorization = 'Bearer alice') {
    const response = await worker.fetch(new Request('https://studio.test/api/developer/call', {
      method: 'POST', headers: {Origin: 'https://studio.test', 'Content-Type': 'application/json', ...(authorization ? {Authorization: authorization} : {})},
      body: JSON.stringify({name: 'saverift_' + name, arguments: args})
    }), {}, {waitUntil: promise => pending.push(promise)});
    return {status: response.status, body: await response.json()};
  }
  await call('developer_enrollment_set', {gameId: 'synthetic', state: 'enabled', expectedRevision: 0});
  const discovery = await call('project_discover', {gameId: 'synthetic'});
  const workspace = (await call('workspace_create', {template: 'synthetic-json', name: 'Worker phase integration', gameId: 'synthetic', discoveryId: discovery.body.discoveryId})).body.workspace;
  assert.ok(workspace?.id);
  const built = await call('plugin_build', {workspaceId: workspace.id, expectedRevision: workspace.revision});
  await Promise.all(pending.splice(0));
  const artifactId = (await call('job_status', {workspaceId: workspace.id, jobId: built.body.jobId})).body.job.result.artifactId;
  const current = (await call('workspace_status', {workspaceId: workspace.id})).body.workspace;
  return {call, pending, counters: () => ({fullCalls, phaseCalls}), args: {workspaceId: workspace.id, artifactId, fixtureIds: current.fixtures.map(f => f.id)}};
}
test('worker opt-in awaits one phase per authenticated job request and never schedules the whole pipeline', async () => {
  const h = await harness(true), started = await h.call('tests_run', h.args);
  assert.equal(started.status, 200); assert.deepEqual(h.counters(), {fullCalls: 0, phaseCalls: 1}); assert.equal(h.pending.length, 0);
  const ref = {workspaceId: h.args.workspaceId, jobId: started.body.jobId};
  assert.equal((await h.call('job_status', ref, null)).status, 401);
  assert.equal((await h.call('job_status', ref, 'Bearer bob')).status, 404);
  assert.deepEqual(h.counters(), {fullCalls: 0, phaseCalls: 1});
  const completed = await h.call('job_status', ref);
  assert.equal(completed.status, 200); assert.equal(completed.body.status, 'passed');
  assert.equal(completed.body.job.result.synthetic, 'finished-second-phase');
  assert.equal(JSON.stringify(completed.body).includes('private-intermediate-marker'), false);
  assert.deepEqual(h.counters(), {fullCalls: 0, phaseCalls: 2}); assert.equal(h.pending.length, 0);
  await h.call('job_status', ref); assert.equal(h.counters().phaseCalls, 2);
});
test('worker default preserves the full pipeline and its existing background scheduling', async () => {
  const h = await harness(), started = await h.call('tests_run', h.args);
  assert.equal(started.status, 200); assert.equal(h.pending.length, 1);
  await Promise.all(h.pending.splice(0));
  const completed = await h.call('job_status', {workspaceId: h.args.workspaceId, jobId: started.body.jobId});
  assert.equal(completed.body.status, 'passed'); assert.equal(completed.body.job.result.synthetic, 'complete-default-pipeline');
  assert.deepEqual(h.counters(), {fullCalls: 1, phaseCalls: 0});
});
