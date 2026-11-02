// SPDX-License-Identifier: Apache-2.0
// Exercises private build copies against a source-only canonical branch stub.
// Real GitHub request coordination and author verification have separate tests.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryStore} from '../storage.mjs';
import {createWorkspaceService} from '../service.mjs';
import {createDeveloperWorker} from '../worker-entry.mjs';
import {DEFAULT_SCOPES} from '../tool-definitions.mjs';
import {TEMPLATES} from '../templates.mjs';
import {createGameAccess} from '../../collaboration/enrollment.mjs';
import {DEFAULT_GAME_PROJECTS} from '../../collaboration/projects.mjs';

const alice = {id: 'branch-source-owner', scopes: [...DEFAULT_SCOPES]}, bob = {...alice, id: 'other-branch-source-owner'};
const BASE = 'a'.repeat(40), NEXT = 'c'.repeat(40), TREE = 'b'.repeat(40);
const repository = {id: '7654321', owner: 'saverift-test', name: 'public-ecosystem', defaultBranch: 'main'};
const manifest = JSON.parse(TEMPLATES[0].files['manifest.json']);
const projectInput = {...DEFAULT_GAME_PROJECTS[1], packageId: manifest.id, repository};
const error = (code, message = code, status = 409) => Object.assign(Error(message), {code, status});
function harness() {
  const original = createMemoryStore(); let failRootCAS = false;
  const store = {...original, async put(key, value, options) { if (failRootCAS && key.includes('/workspaces/') && options?.ifMatch) { failRootCAS = false; throw error('REVISION_CONFLICT'); } return original.put(key, value, options); }};
  const access = createGameAccess({store, projects: [projectInput]}), project = access.getProject('synthetic'), packageRoot = project.packageRoots[0], tasks = [], calls = [];
  const state = {files: Object.fromEntries(Object.entries(TEMPLATES[0].files).map(([path, content]) => [packageRoot + path, content])), workspace: {
    id: 'bws_' + '1'.repeat(32), gameId: project.id, repository: project.repository, projectDigest: project.projectDigest,
    packageId: manifest.id, packageRoots: project.packageRoots, revision: 3, issueNumber: 27, featureKey: 'fixture.roundtrip',
    branch: 'saverift/synthetic/alice/issue-27-roundtrip', baseCommit: BASE, gitHead: BASE, treeSha: TREE,
    lastSynchronizedCommit: BASE, dirty: false, syncState: 'current', operation: null, createdAt: 1000, updatedAt: 1000
  }};
  // A different package is present in the same source response. It must not be
  // copied into this package's private build workspace.
  state.files[project.packageRoots[1] + 'README.md'] = 'Unselected independent extension source';
  let failCanonicalCAS = false;
  const collaboration = {async dispatch(principal, action, args) {
    if (principal.id !== alice.id || args.gameId !== project.id || args.workspaceId !== state.workspace.id) throw error('BRANCH_WORKSPACE_NOT_FOUND', 'This source belongs to another developer.', 404);
    calls.push({action, args: structuredClone(args)});
    if (action === 'branch_workspace_read') return {workspace: structuredClone(state.workspace), files: structuredClone(state.files)};
    if (action !== 'branch_workspace_patch') throw error('TEST_UNEXPECTED_ACTION');
    if (failCanonicalCAS) { failCanonicalCAS = false; state.workspace.revision++; state.files[packageRoot + 'README.md'] = 'A concurrent contributor edit'; throw error('COLLABORATION_REVISION_CONFLICT'); }
    if (args.expectedRevision !== state.workspace.revision || args.expectedGitHead !== state.workspace.gitHead) throw error('BRANCH_WORKSPACE_CONFLICT');
    for (const change of args.changes) { assert.ok(change.path.startsWith(packageRoot)); if (change.content === null) delete state.files[change.path]; else state.files[change.path] = change.content; }
    state.workspace.revision++; state.workspace.dirty = true; state.workspace.updatedAt++;
    return {workspace: structuredClone(state.workspace)};
  }};
  const service = createWorkspaceService({store, access, collaboration, schedule: promise => tasks.push(promise)}), call = (name, args, principal = alice) => service.dispatch(principal, 'saverift_' + name, args);
  return {store, access, project, packageRoot, state, calls, service, call,
    async enable(principal = alice) { await access.enroll(principal, {gameId: project.id, expectedRevision: 0}); },
    async attach(args = {}, principal = alice) { return (await call('workspace_from_branch', {gameId: project.id, branchWorkspaceId: state.workspace.id, name: 'Build issue 27', ...args}, principal)).workspace; },
    async flush() { await Promise.all(tasks.splice(0)); },
    failNextRootCAS() { failRootCAS = true; }, failNextCanonicalCAS() { failCanonicalCAS = true; }
  };
}
const read = async (h, workspaceId, path = 'README.md') => (await h.call('workspace_read', {workspaceId, path})).content;
const patchArgs = (workspace, content) => ({workspaceId: workspace.id, expectedRevision: workspace.revision, expectedGitHead: workspace.gitBinding.gitHead, edits: [{path: 'README.md', content}]});
const syncArgs = (workspace, branch) => ({workspaceId: workspace.id, expectedRevision: workspace.revision, expectedBranchRevision: branch.revision, expectedGitHead: branch.gitHead});

test('branch attachment preserves exact repository, package, base and issue and copies selected source only', async () => {
  const h = harness(); await h.enable(); const workspace = await h.attach();
  assert.equal(workspace.gameId, 'synthetic');
  for (const name of ['repository', 'packageId', 'baseCommit', 'issueNumber', 'featureKey', 'branch', 'gitHead', 'treeSha', 'projectDigest']) assert.deepEqual(workspace.gitBinding[name], h.state.workspace[name]);
  assert.equal(workspace.gitBinding.branchWorkspaceId, h.state.workspace.id); assert.equal(workspace.gitBinding.packageRoot, h.packageRoot);
  assert.deepEqual(workspace.fixtures, []); assert.deepEqual(workspace.jobs, []); assert.equal(workspace.catalog, null);
  const exported = await h.call('workspace_export', {workspaceId: workspace.id});
  assert.deepEqual(exported.files, TEMPLATES[0].files);
  assert.equal(JSON.stringify(exported).includes('Unselected independent extension source'), false);
  await assert.rejects(h.attach(), {code: 'BRANCH_ALREADY_ATTACHED'});
});

test('Git-bound source edits require the exact expected head and autosave into the matching canonical prefix', async () => {
  const h = harness(); await h.enable(); const workspace = await h.attach(), args = patchArgs(workspace, 'Canonical autosave retained');
  const {expectedGitHead, ...missing} = args;
  await assert.rejects(h.call('workspace_patch', missing), {code: 'GIT_HEAD_REQUIRED'});
  await assert.rejects(h.call('workspace_patch', {...args, expectedGitHead: NEXT}), {code: 'GIT_HEAD_CHANGED'});
  const saved = (await h.call('workspace_patch', args)).workspace;
  assert.equal(await read(h, workspace.id), 'Canonical autosave retained');
  assert.equal(h.state.files[h.packageRoot + 'README.md'], 'Canonical autosave retained');
  assert.equal(saved.gitBinding.revision, h.state.workspace.revision);
  assert.equal(h.calls.find(call => call.action === 'branch_workspace_patch').args.changes[0].path, h.packageRoot + 'README.md');
  assert.equal(h.state.files[h.project.packageRoots[1] + 'README.md'], 'Unselected independent extension source');
});

test('canonical source revision or head changes stop builds and edits until explicit exact sync', async () => {
  const h = harness(); await h.enable(); const workspace = await h.attach();
  h.state.workspace.revision++; h.state.workspace.gitHead = NEXT; h.state.files[h.packageRoot + 'README.md'] = 'New upstream source reviewed explicitly';
  await assert.rejects(h.call('plugin_build', {workspaceId: workspace.id, expectedRevision: workspace.revision}), {code: 'GIT_SOURCE_REFRESH_REQUIRED'});
  await assert.rejects(h.call('workspace_patch', patchArgs(workspace, 'Unreviewed overwrite')), {code: 'GIT_SOURCE_REFRESH_REQUIRED'});
  await assert.rejects(h.call('workspace_sync_from_branch', {...syncArgs(workspace, h.state.workspace), expectedBranchRevision: 3}), {code: 'GIT_SOURCE_REFRESH_REQUIRED'});
  const synced = (await h.call('workspace_sync_from_branch', syncArgs(workspace, h.state.workspace))).workspace;
  assert.equal(await read(h, workspace.id), 'New upstream source reviewed explicitly'); assert.equal(synced.gitBinding.gitHead, NEXT);
  const build = await h.call('plugin_build', {workspaceId: workspace.id, expectedRevision: synced.revision}); await h.flush();
  const result = await h.call('job_status', {workspaceId: workspace.id, jobId: build.jobId}); assert.equal(result.status, 'passed');
  const evidence = result.job.result.sourceBinding;
  assert.equal(evidence.workspaceId, workspace.id); assert.equal(evidence.sourceRevision, synced.revision);
  assert.equal(evidence.sourceDigest, (await h.call('workspace_export', {workspaceId: workspace.id})).digest);
  assert.deepEqual(evidence.gitBinding, synced.gitBinding); assert.equal(evidence.gitBinding.gitHead, NEXT);
  assert.equal(evidence.gitBinding.baseCommit, BASE); assert.equal(evidence.gitBinding.issueNumber, 27);
  assert.equal(evidence.runnerVersion, 'saverift-source-package-builder/0.1');
  assert.deepEqual(evidence.dependencyLockDigests, {}); assert.deepEqual(evidence.fixtureReferences, []);
  const artifact = (await h.store.list('developers/', 1000)).find(row => row.key.includes('/artifacts/') && row.value.id === result.job.result.artifactId);
  assert.deepEqual(artifact.value.sourceBinding, evidence);
});

test('manifest package identity cannot be retargeted through an upstream sync', async () => {
  const h = harness(); await h.enable(); const workspace = await h.attach(), original = await read(h, workspace.id, 'manifest.json');
  h.state.files[h.packageRoot + 'manifest.json'] = JSON.stringify({...manifest, id: 'another.game'}); h.state.workspace.revision++;
  await assert.rejects(h.call('workspace_sync_from_branch', syncArgs(workspace, h.state.workspace)), {code: 'WORKSPACE_PACKAGE_MISMATCH'});
  assert.equal(await read(h, workspace.id, 'manifest.json'), original);
});

test('a concurrent canonical autosave never silently overwrites either private source copy', async () => {
  const h = harness(); await h.enable(); const workspace = await h.attach(), original = await read(h, workspace.id);
  h.failNextCanonicalCAS();
  await assert.rejects(h.call('workspace_patch', patchArgs(workspace, 'A stale competing edit')), {code: 'COLLABORATION_REVISION_CONFLICT'});
  assert.equal(await read(h, workspace.id), original); assert.equal(h.state.files[h.packageRoot + 'README.md'], 'A concurrent contributor edit');
  await assert.rejects(h.call('plugin_build', {workspaceId: workspace.id, expectedRevision: workspace.revision}), {code: 'GIT_SOURCE_REFRESH_REQUIRED'});
  const synced = await h.call('workspace_sync_from_branch', syncArgs(workspace, h.state.workspace)); assert.equal(synced.workspace.revision, workspace.revision + 1);
  assert.equal(await read(h, workspace.id), 'A concurrent contributor edit');
});

test('private source CAS failure preserves canonical autosave and requires explicit recovery sync', async () => {
  const h = harness(); await h.enable(); const workspace = await h.attach(), original = await read(h, workspace.id);
  h.failNextRootCAS();
  await assert.rejects(h.call('workspace_patch', patchArgs(workspace, 'Saved safely in canonical workspace')), {code: 'REVISION_CONFLICT'});
  assert.equal(await read(h, workspace.id), original); assert.equal(h.state.files[h.packageRoot + 'README.md'], 'Saved safely in canonical workspace');
  await assert.rejects(h.call('plugin_build', {workspaceId: workspace.id, expectedRevision: workspace.revision}), {code: 'GIT_SOURCE_REFRESH_REQUIRED'});
  await h.call('workspace_sync_from_branch', syncArgs(workspace, h.state.workspace));
  assert.equal(await read(h, workspace.id), 'Saved safely in canonical workspace');
});

test('package roots, canonical bindings and private ownership remain exact', async () => {
  const h = harness(); await h.enable(); await h.enable(bob);
  await assert.rejects(h.attach({packageRoot: 'ecosystem/plugins/elsewhere/'}), {code: 'BRANCH_PACKAGE_MISMATCH'});
  await assert.rejects(h.attach({}, bob), {code: 'BRANCH_WORKSPACE_NOT_FOUND'});
  const workspace = await h.attach();
  await assert.rejects(h.call('workspace_read', {workspaceId: workspace.id, path: 'README.md'}, bob), {code: 'WORKSPACE_NOT_FOUND'});
  for (const changes of [{repository: {...h.state.workspace.repository, id: '9999999'}}, {issueNumber: 999}, {baseCommit: NEXT}, {branch: 'saverift/synthetic/elsewhere'}]) {
    const before = structuredClone(h.state.workspace); Object.assign(h.state.workspace, changes); h.state.workspace.revision++;
    await assert.rejects(h.call('workspace_sync_from_branch', syncArgs(workspace, h.state.workspace)), error => /(?:BINDING|PACKAGE|PROJECT|REPOSITORY)/.test(error.code || ''));
    h.state.workspace = before;
  }
});

test('hosted worker enables per-game access but defaults to disconnected GitHub with no external mutations', async () => {
  const store = createMemoryStore(), pending = [], worker = createDeveloperWorker({authenticate: async () => alice, createStore: async () => store, assetFetch: async () => new Response('asset'), allowedHosts: ['studio.test'], allowedOrigins: ['https://studio.test']});
  const call = async (name, args = {}) => { const response = await worker.fetch(new Request('https://studio.test/api/developer/call', {method: 'POST', headers: {Origin: 'https://studio.test', 'Content-Type': 'application/json'}, body: JSON.stringify({name: 'saverift_' + name, arguments: args})}), {}, {waitUntil: promise => pending.push(promise)}); return {status: response.status, value: await response.json()}; };
  const listed = await call('project_list'); assert.equal(listed.value.hostedEnrollment, true); assert.ok(listed.value.projects.every(project => project.repository === null));
  await call('developer_enrollment_set', {gameId: 'synthetic', expectedRevision: 0, state: 'enabled'});
  const discovery = await call('project_discover', {gameId: 'synthetic'}); assert.equal(discovery.value.state, 'setup_required'); assert.equal(discovery.value.github.state, 'not_configured');
  const blocked = await call('branch_workspace_create', {gameId: 'synthetic', discoveryId: discovery.value.discoveryId, issueNumber: 27, featureKey: 'fixture.roundtrip', expectedRevision: 0, expectedGitHead: BASE});
  assert.equal(blocked.status, 503); assert.equal(blocked.value.code, 'GITHUB_NOT_CONFIGURED');
  await Promise.all(pending);
});

test('an explicitly injected Git adapter still cannot mutate GitHub without a separate host gate', async () => {
  const store = createMemoryStore(), pending = []; let adapterCalls = 0, mutationCalls = 0;
  const issue = {id: 127, number: 27, title: 'Small public synthetic change', state: 'open', labels: ['game:synthetic'], assignees: [], htmlUrl: 'https://github.com/saverift-test/public-ecosystem/issues/27', updatedAt: '2026-11-02T00:00:00Z'};
  const worker = createDeveloperWorker({authenticate: async () => alice, createStore: async () => store, assetFetch: async () => new Response('asset'), projects: [projectInput], allowedHosts: ['studio.test'], allowedOrigins: ['https://studio.test'], createGitAdapter: async (_env, {access}) => {
    adapterCalls++; return {getRepository: async () => access.getProject('synthetic').repository, readHead: async () => ({sha: BASE, treeSha: TREE}), listIssues: async () => ({issues: [issue], hasMore: false}), listDraftPRs: async () => ({pullRequests: [], hasMore: false}), getIssue: async () => issue, createBranch: async () => {mutationCalls++; throw Error('No external writes are permitted in this test');}};
  }});
  const call = async (name, args = {}) => { const response = await worker.fetch(new Request('https://studio.test/api/developer/call', {method: 'POST', headers: {Origin: 'https://studio.test', 'Content-Type': 'application/json'}, body: JSON.stringify({name: 'saverift_' + name, arguments: args})}), {}, {waitUntil: promise => pending.push(promise)}); return {status: response.status, value: await response.json()}; };
  await call('developer_enrollment_set', {gameId: 'synthetic', expectedRevision: 0, state: 'enabled'});
  const discovery = await call('project_discover', {gameId: 'synthetic'}); assert.equal(discovery.value.state, 'current', JSON.stringify(discovery));
  const blocked = await call('branch_workspace_create', {gameId: 'synthetic', discoveryId: discovery.value.discoveryId, issueNumber: 27, featureKey: 'fixture.roundtrip', expectedRevision: 0, expectedGitHead: BASE});
  assert.equal(blocked.status, 403); assert.equal(blocked.value.code, 'GITHUB_MUTATIONS_DISABLED');
  assert.ok(adapterCalls > 0); assert.equal(mutationCalls, 0); await Promise.all(pending);
});
