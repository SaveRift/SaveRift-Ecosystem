// SPDX-License-Identifier: Apache-2.0
// Trusted principals, private source/fixture records, and a conditional branch
// stub exercise migration. This is not a live GitHub or contributor trial.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryStore} from '../storage.mjs';
import {createWorkspaceService} from '../service.mjs';
import {TEMPLATES} from '../templates.mjs';
import {DEFAULT_SCOPES} from '../tool-definitions.mjs';
import {createGameAccess} from '../../collaboration/enrollment.mjs';
import {DEFAULT_GAME_PROJECTS} from '../../collaboration/projects.mjs';
import {createWorkbenchRouter} from '../router.mjs';
import {createDeveloperMcpHandler} from '../mcp.mjs';
import {Client, StreamableHTTPClientTransport} from '@modelcontextprotocol/client';

const alice = {id: 'migration-source-owner', scopes: [...DEFAULT_SCOPES]}, bob = {...alice, id: 'migration-other-owner'};
const BASE = 'a'.repeat(40), MOVED = 'c'.repeat(40), TREE = 'b'.repeat(40);
const manifest = JSON.parse(TEMPLATES[0].files['manifest.json']);
const projectInput = {...DEFAULT_GAME_PROJECTS[1], packageId: manifest.id, baseCommit: BASE, repository: {id: '7891234', owner: 'example-org', name: 'ecosystem', defaultBranch: 'main'}};
const failure = code => Object.assign(Error(code), {code, status: 409});
async function harness({executeJob} = {}) {
  const memory = createMemoryStore(), tasks = []; let failFinalWrite = false, clock = 1000;
  const store = {...memory, async put(key, value, options) {
    if (failFinalWrite && key.includes('/workspaces/') && value.lastMigrationId && !value.migrationPending) { failFinalWrite = false; throw failure('REVISION_CONFLICT'); }
    return memory.put(key, value, options);
  }};
  const legacy = createWorkspaceService({store, executeJob, schedule: p => tasks.push(p), now: () => clock});
  const callLegacy = (name, args, principal = alice) => legacy.dispatch(principal, 'saverift_' + name, args);
  let workspace = (await callLegacy('workspace_create', {template: 'synthetic-json', name: 'Retained old source'})).workspace;
  workspace = (await callLegacy('workspace_patch', {workspaceId: workspace.id, expectedRevision: workspace.revision, edits: [{path: 'README.md', content: 'A deliberate private source improvement'}]})).workspace;
  const privateFixtures = [];
  for (const [name, allowed] of [['owner-only.json', false], ['ai-permitted.json', true]]) {
    const bytes = new TextEncoder().encode(JSON.stringify({privateFixtureMarker: 'never-export-this-value'}));
    const upload = await callLegacy('fixture_upload_prepare', {workspaceId: workspace.id, name, byteLength: bytes.length});
    const fixture = await legacy.trustedUploadFixture(alice, upload.uploadId, bytes);
    if (allowed) await legacy.trustedSetFixtureConsent(alice, workspace.id, fixture.id, true);
    privateFixtures.push(fixture.id);
  }
  workspace = (await callLegacy('workspace_status', {workspaceId: workspace.id})).workspace;
  const access = createGameAccess({store, projects: [projectInput], now: () => clock}), project = access.getProject('synthetic'), packageRoot = project.packageRoots[0];
  const branch = {id: 'bws_' + '1'.repeat(32), gameId: project.id, packageId: project.packageId, packageRoots: project.packageRoots, projectDigest: project.projectDigest, repository: project.repository, baseCommit: BASE, gitHead: BASE, treeSha: TREE, branch: 'saverift/synthetic/owner/issue-9-migration', issueNumber: 9, featureKey: 'legacy.migration', revision: 3, operation: null, dirty: false};
  const state = {workspace: branch, remoteHead: BASE, files: Object.fromEntries(Object.entries({...TEMPLATES[0].files, 'src/canonical-extra.mjs': 'export const canonical = true;'}).map(([path, content]) => [packageRoot + path, content]))};
  const calls = [];
  const collaboration = {
    async verifyDiscovery(principal, args) { if (principal.id !== alice.id || args.gameId !== project.id || args.discoveryId !== 'discovery-owner') throw failure('PROJECT_DISCOVERY_STALE'); return {gameId: project.id}; },
    async dispatch(principal, action, args) {
      if (principal.id !== alice.id || args.gameId !== project.id || args.workspaceId !== branch.id) throw failure('BRANCH_WORKSPACE_NOT_FOUND');
      calls.push({action, args: structuredClone(args)});
      if (action === 'branch_workspace_read') return {workspace: structuredClone(state.workspace), files: structuredClone(state.files)};
      if (args.expectedRevision !== state.workspace.revision || args.expectedGitHead !== state.workspace.gitHead) throw failure('BRANCH_WORKSPACE_CONFLICT');
      if (action === 'branch_workspace_verify') {
        if (state.remoteHead !== state.workspace.gitHead) throw failure('GITHUB_HEAD_CHANGED');
        return {workspace: structuredClone(state.workspace), head: {sha: state.remoteHead, treeSha: TREE}};
      }
      if (action !== 'branch_workspace_patch') throw failure('UNEXPECTED_ACTION');
      for (const change of args.changes) { assert.ok(change.path.startsWith(packageRoot)); if (change.content === null) delete state.files[change.path]; else state.files[change.path] = change.content; }
      state.workspace.revision++; state.workspace.dirty = true;
      return {workspace: structuredClone(state.workspace)};
    }
  };
  const service = createWorkspaceService({store, access, collaboration, executeJob, schedule: p => tasks.push(p), now: () => clock});
  const call = (name, args, principal = alice) => service.dispatch(principal, 'saverift_' + name, args);
  const args = (extra = {}) => ({workspaceId: workspace.id, expectedRevision: workspace.revision, gameId: project.id, discoveryId: 'discovery-owner', templateId: 'synthetic-json', mode: 'project', ...extra});
  const prepare = extra => call('workspace_migration_prepare', args(extra));
  const confirm = review => call('workspace_migration_confirm', {workspaceId: workspace.id, expectedRevision: review.sourceRevision, reviewId: review.reviewId});
  const branchArgs = () => ({mode: 'branch', branchWorkspaceId: branch.id, packageRoot, expectedBranchRevision: state.workspace.revision, expectedGitHead: state.workspace.gitHead});
  const fixtureRows = async () => (await store.list('developers/', 1000)).filter(row => row.key.includes('/fixtures/'));
  return {store, tasks, legacy, service, call, callLegacy, access, project, packageRoot, state, calls, workspace, privateFixtures, args, prepare, confirm, branchArgs, fixtureRows,
    async enable(principal = alice) { return access.enroll(principal, {gameId: project.id, expectedRevision: 0}); },
    async flush() { await Promise.all(tasks.splice(0)); },
    async current() { return (await call('workspace_status', {workspaceId: workspace.id})).workspace; },
    failFinalCAS() { failFinalWrite = true; }, advance(ms) { clock += ms; }
  };
}

test('legacy source remains exportable; migration requires explicit enrollment, discovery and package choice', async () => {
  const h = await harness();
  await assert.rejects(h.call('workspace_status', {workspaceId: h.workspace.id}), {code: 'WORKSPACE_PROJECT_UNBOUND'});
  const exported = await h.call('workspace_export', {workspaceId: h.workspace.id});
  assert.equal(exported.files['README.md'], 'A deliberate private source improvement');
  await assert.rejects(h.prepare(), {code: 'GAME_ENROLLMENT_REQUIRED'});
  assert.equal((await h.access.getMembership(alice, 'synthetic')).state, 'disabled');
  await h.enable();
  await assert.rejects(h.prepare({discoveryId: 'not-reviewed'}), {code: 'PROJECT_DISCOVERY_STALE'});
  await assert.rejects(h.prepare({templateId: 'foreign-package'}), {code: 'TEMPLATE_PROJECT_MISMATCH'});
  await assert.rejects(h.call('workspace_migration_prepare', h.args(), bob), {code: 'WORKSPACE_NOT_FOUND'});
  const review = await h.prepare();
  assert.equal(review.canConfirm, true); assert.equal(review.mode, 'project');
  assert.equal(review.canonical.bindingScope, 'project-only'); assert.equal(review.canonical.branch, null);
  assert.equal(review.fixturePreservation.count, 3);
  assert.equal(JSON.stringify(review).includes('never-export-this-value'), false);
  assert.equal(review.diff[0].path, 'README.md');
});

test('confirmed migration preserves workspace ID, private source/history and every fixture consent record exactly', async () => {
  const h = await harness(); await h.enable();
  const before = await h.fixtureRows(), original = await h.call('workspace_export', {workspaceId: h.workspace.id});
  const review = await h.prepare(), result = await h.confirm(review);
  assert.equal(result.workspace.id, h.workspace.id); assert.equal(result.workspace.gameId, 'synthetic');
  assert.equal(result.workspace.packageId, manifest.id); assert.equal(result.workspace.gitBinding, null);
  assert.equal(result.workspace.revision, h.workspace.revision + 1); assert.deepEqual(result.workspace.jobs, []);
  assert.equal((await h.call('workspace_read', {workspaceId: h.workspace.id, path: 'README.md'})).content, original.files['README.md']);
  assert.deepEqual(await h.fixtureRows(), before);
  assert.equal((await h.access.getMembership(alice, 'synthetic')).role, 'contributor');
  const snapshot = await h.call('workspace_export', {workspaceId: h.workspace.id, migrationId: review.reviewId});
  assert.deepEqual(snapshot.files, original.files); assert.equal(snapshot.revision, original.revision); assert.equal(snapshot.archived, true);
  assert.equal(JSON.stringify(snapshot).includes('never-export-this-value'), false);
  const retry = await h.confirm(review); assert.equal(retry.migration.alreadyApplied, true);
  assert.equal((await h.current()).migrationHistory.length, 1);
  await assert.rejects(h.service.dispatch(bob, 'saverift_workspace_export', {workspaceId: h.workspace.id, migrationId: review.reviewId}), {code: 'WORKSPACE_NOT_FOUND'});
});

test('old artifacts, previews, jobs and upload intents cannot be reused after the binding changes', async () => {
  const h = await harness();
  const build = await h.callLegacy('plugin_build', {workspaceId: h.workspace.id, expectedRevision: h.workspace.revision}); await h.flush();
  const built = await h.callLegacy('job_status', {workspaceId: h.workspace.id, jobId: build.jobId});
  const artifactId = built.job.result.artifactId;
  const preview = await h.callLegacy('preview_open', {workspaceId: h.workspace.id, artifactId});
  const bytes = new TextEncoder().encode('{}');
  const upload = await h.callLegacy('fixture_upload_prepare', {workspaceId: h.workspace.id, name: 'old-intent.json', byteLength: bytes.length});
  h.workspace = (await h.callLegacy('workspace_status', {workspaceId: h.workspace.id})).workspace;
  await h.enable();
  const review = await h.call('workspace_migration_prepare', {...h.args(), expectedRevision: h.workspace.revision});
  await h.confirm(review);
  await assert.rejects(h.call('job_status', {workspaceId: h.workspace.id, jobId: build.jobId}), {code: 'WORKSPACE_EVIDENCE_STALE'});
  await assert.rejects(h.call('tests_run', {workspaceId: h.workspace.id, artifactId}), {code: 'WORKSPACE_EVIDENCE_STALE'});
  await assert.rejects(h.service.readPreview(alice, preview.previewId), {code: 'WORKSPACE_EVIDENCE_STALE'});
  await assert.rejects(h.service.trustedUploadFixture(alice, upload.uploadId, bytes), {code: 'WORKSPACE_EVIDENCE_STALE'});
  const fresh = await h.current(), next = await h.call('plugin_build', {workspaceId: fresh.id, expectedRevision: fresh.revision}); await h.flush();
  assert.equal((await h.call('job_status', {workspaceId: fresh.id, jobId: next.jobId})).status, 'passed');
});

test('branch migration carries only deliberate local deltas, keeps new canonical files and retains fixture isolation', async () => {
  const h = await harness(); await h.enable();
  const before = await h.fixtureRows(), review = await h.prepare(h.branchArgs()), result = await h.confirm(review);
  assert.equal(result.workspace.gitBinding.branchWorkspaceId, h.state.workspace.id);
  assert.equal(result.workspace.gitBinding.baseCommit, BASE); assert.equal(result.workspace.gitBinding.issueNumber, 9);
  assert.equal(result.workspace.gitBinding.gitHead, BASE);
  assert.equal(h.state.files[h.packageRoot + 'README.md'], 'A deliberate private source improvement');
  assert.equal((await h.call('workspace_read', {workspaceId: h.workspace.id, path: 'src/canonical-extra.mjs'})).content, 'export const canonical = true;');
  assert.deepEqual(await h.fixtureRows(), before);
  assert.equal(h.calls.filter(call => call.action === 'branch_workspace_patch').length, 1);
  assert.equal(h.calls.some(call => /checkpoint|pr_open/.test(call.action)), false);
});

test('conflicts require source inspection and a freshly reviewed explicit resolution', async () => {
  const h = await harness(); await h.enable(); h.state.files[h.packageRoot + 'README.md'] = 'Another canonical source improvement';
  const review = await h.prepare(h.branchArgs()); assert.equal(review.canConfirm, false); assert.equal(review.conflicts.length, 1);
  const inspected = await h.call('workspace_migration_read', {workspaceId: h.workspace.id, reviewId: review.reviewId, path: 'README.md', variant: 'canonical'});
  assert.equal(inspected.content, 'Another canonical source improvement');
  await assert.rejects(h.confirm(review), {code: 'MIGRATION_SOURCE_CONFLICT'});
  const resolved = await h.prepare({...h.branchArgs(), resolutions: [{path: 'README.md', choice: 'canonical'}]});
  await assert.rejects(h.confirm(review), {code: 'MIGRATION_REVIEW_STALE'});
  const result = await h.confirm(resolved); assert.equal(result.workspace.gitBinding.dirty, false);
  assert.equal((await h.call('workspace_read', {workspaceId: h.workspace.id, path: 'README.md'})).content, inspected.content);
  const archive = await h.call('workspace_export', {workspaceId: h.workspace.id, migrationId: resolved.reviewId});
  assert.equal(archive.files['README.md'], 'A deliberate private source improvement');
});

test('stale source, remote head, fixture consent and revoked review grants stop migration without changing source', async () => {
  const h = await harness(); await h.enable(); const original = await h.call('workspace_export', {workspaceId: h.workspace.id});
  const branchReview = await h.prepare(h.branchArgs()); h.state.remoteHead = MOVED;
  await assert.rejects(h.confirm(branchReview), {code: 'GITHUB_HEAD_CHANGED'}); h.state.remoteHead = BASE;
  const consentReview = await h.prepare();
  const row = (await h.fixtureRows()).find(row => row.value.id === h.privateFixtures[1]);
  await h.store.put(row.key, {...row.value, aiAccess: false}, {ifMatch: row.etag});
  await assert.rejects(h.confirm(consentReview), {code: 'MIGRATION_FIXTURE_CHANGED'});
  const revoked = await h.prepare(); await h.access.optOut(alice, {gameId: 'synthetic', expectedRevision: 1});
  await h.access.enroll(alice, {gameId: 'synthetic', expectedRevision: 2});
  await assert.rejects(h.confirm(revoked), {code: 'GAME_GRANT_REVOKED'});
  const sourceReview = await h.prepare();
  await h.callLegacy('workspace_patch', {workspaceId: h.workspace.id, expectedRevision: h.workspace.revision, edits: [{path: 'README.md', content: 'A newer private change'}]});
  await assert.rejects(h.confirm(sourceReview), {code: 'MIGRATION_REVIEW_STALE'});
  assert.equal((await h.call('workspace_export', {workspaceId: h.workspace.id})).files['README.md'], 'A newer private change');
  assert.notEqual(original.files['README.md'], 'A newer private change');
});

test('a failed final CAS preserves original source and consent; a fresh review can recover the branch autosave', async () => {
  const h = await harness(); await h.enable(); const before = await h.fixtureRows(), review = await h.prepare(h.branchArgs());
  h.failFinalCAS(); await assert.rejects(h.confirm(review), {code: 'REVISION_CONFLICT'});
  await assert.rejects(h.call('workspace_status', {workspaceId: h.workspace.id}), {code: 'WORKSPACE_PROJECT_UNBOUND'});
  assert.deepEqual(await h.fixtureRows(), before);
  assert.equal((await h.call('workspace_export', {workspaceId: h.workspace.id})).files['README.md'], 'A deliberate private source improvement');
  const recovered = await h.prepare(h.branchArgs()), result = await h.confirm(recovered);
  assert.equal(result.workspace.gameId, 'synthetic'); assert.equal(result.workspace.migrationHistory.length, 1);
  assert.equal(h.calls.filter(call => call.action === 'branch_workspace_patch').length, 1);
});

test('a source-only migrated workspace can later deliberately attach to its exact canonical branch', async () => {
  const h = await harness(); await h.enable(); const first = await h.prepare(), migrated = await h.confirm(first);
  const review = await h.call('workspace_migration_prepare', {...h.args(), ...h.branchArgs(), expectedRevision: migrated.workspace.revision});
  const attached = await h.call('workspace_migration_confirm', {workspaceId: h.workspace.id, reviewId: review.reviewId, expectedRevision: review.sourceRevision});
  assert.equal(attached.workspace.gitBinding.branchWorkspaceId, h.state.workspace.id);
  assert.equal(attached.workspace.migrationHistory.length, 2);
  assert.equal(attached.workspace.migrationHistory[0].id, first.reviewId);
});

test('expired migration reviews preserve export and cannot silently bind a legacy workspace', async () => {
  const h = await harness(); await h.enable(); const review = await h.prepare(); h.advance(10 * 60000 + 1);
  await assert.rejects(h.confirm(review), {code: 'MIGRATION_REVIEW_EXPIRED'});
  assert.equal((await h.call('workspace_export', {workspaceId: h.workspace.id})).gameId, null);
});

test('simultaneous confirms apply once and never duplicate source history or modify fixture consent', async () => {
  const h = await harness(); await h.enable(); const before = await h.fixtureRows(), review = await h.prepare();
  const results = await Promise.allSettled([h.confirm(review), h.confirm(review)]);
  assert.ok(results.some(result => result.status === 'fulfilled'));
  const current = await h.current(); assert.equal(current.migrationHistory.length, 1); assert.equal(current.revision, review.sourceRevision + 1);
  assert.deepEqual(await h.fixtureRows(), before);
  assert.equal((await h.store.list('developers/', 1000)).filter(row => row.key.includes('/migrationarchives/')).length, 1);
});

test('an in-flight old runner cannot retain candidate bytes or expose a late report after migration', async () => {
  let finish, started;
  const running = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { finish = resolve; });
  const h = await harness({executeJob: async () => { started(); await gate; return {status: 'passed', secretReport: 'late-private-report', privateArtifacts: [{id: 'candidate_bytes', logicalPath: 'save', role: 'main', bytes: new Uint8Array([1, 2, 3])}]}; }});
  const build = await h.callLegacy('plugin_build', {workspaceId: h.workspace.id, expectedRevision: h.workspace.revision}); await h.flush();
  const built = await h.callLegacy('job_status', {workspaceId: h.workspace.id, jobId: build.jobId});
  const tests = await h.callLegacy('tests_run', {workspaceId: h.workspace.id, artifactId: built.job.result.artifactId}); await running;
  const latest = (await h.callLegacy('workspace_status', {workspaceId: h.workspace.id})).workspace;
  await h.enable();
  const review = await h.call('workspace_migration_prepare', {...h.args(), expectedRevision: latest.revision});
  await h.confirm(review); finish(); await h.flush();
  await assert.rejects(h.call('job_status', {workspaceId: h.workspace.id, jobId: tests.jobId}), {code: 'WORKSPACE_EVIDENCE_STALE'});
  const rows = await h.store.list('developers/', 1000);
  assert.equal(rows.some(row => row.key.includes('/candidates/')), false);
  const old = rows.find(row => row.value.id === tests.jobId).value;
  assert.equal(old.result.code, 'WORKSPACE_EVIDENCE_STALE');
  assert.equal(JSON.stringify(old).includes('late-private-report'), false);
});

test('browser and official MCP clients use the same migration review, scope and fixture-isolation checks', async () => {
  const h = await harness(); await h.enable();
  const authenticate = async request => request.headers.get('authorization') === 'Bearer owner' ? alice : null;
  const options = {service: h.service, authenticate, allowedHosts: ['studio.test'], allowedOrigins: ['https://studio.test']};
  const router = createWorkbenchRouter(options), mcp = createDeveloperMcpHandler(options);
  const client = new Client({name: 'migration-owner-test', version: '0.1.0'}, {versionNegotiation: {mode: {pin: '2026-07-28'}}});
  const transport = new StreamableHTTPClientTransport(new URL('https://studio.test/mcp'), {requestInit: {headers: {Authorization: 'Bearer owner'}}, fetch: async (url, init) => mcp.fetch(new Request(url, init))});
  await client.connect(transport);
  try {
    const response = await router(new Request('https://studio.test/api/developer/call', {method: 'POST', headers: {Authorization: 'Bearer owner', Origin: 'https://studio.test', 'Content-Type': 'application/json'}, body: JSON.stringify({name: 'saverift_workspace_migration_prepare', arguments: h.args()})}));
    assert.equal(response.status, 200); const review = await response.json();
    const result = await client.callTool({name: 'saverift_workspace_migration_confirm', arguments: {workspaceId: h.workspace.id, expectedRevision: review.sourceRevision, reviewId: review.reviewId}});
    const parsed = result.structuredContent || JSON.parse(result.content[0].text);
    assert.equal(parsed.status, 'passed'); assert.equal(parsed.workspace.id, h.workspace.id);
    assert.equal(JSON.stringify(result).includes('never-export-this-value'), false);
    const readOnly = {...alice, scopes: ['workspace:read']};
    await assert.rejects(h.service.dispatch(readOnly, 'saverift_workspace_migration_prepare', h.args()), {code: 'SCOPE_REQUIRED'});
  } finally { await client.close(); }
});

test('expired interrupted migration can be stopped after opt-out without replaying or discarding either source copy', async () => {
  const h = await harness(); await h.enable(); const review = await h.prepare(h.branchArgs()), before = await h.fixtureRows();
  const rows = await h.store.list('developers/', 1000), source = rows.find(row => row.key.includes('/workspaces/') && row.value.id === h.workspace.id), prepared = rows.find(row => row.key.includes('/migrationreviews/'));
  const leaseExpiresAt = 61000;
  await h.store.put(prepared.key, {...prepared.value, state: 'applying', leaseExpiresAt}, {ifMatch: prepared.etag});
  await h.store.put(source.key, {...source.value, migrationPending: {reviewId: review.reviewId, sourceRevision: source.value.revision, leaseExpiresAt}}, {ifMatch: source.etag});
  const args = {workspaceId: h.workspace.id, expectedRevision: source.value.revision, reviewId: review.reviewId};
  await assert.rejects(h.call('workspace_migration_reconcile', args), {code: 'MIGRATION_IN_PROGRESS'});
  await assert.rejects(h.call('workspace_migration_reconcile', args, bob), {code: 'WORKSPACE_NOT_FOUND'});
  h.state.files[h.packageRoot + 'README.md'] = 'A separately preserved branch autosave';
  await h.access.optOut(alice, {gameId: 'synthetic', expectedRevision: 1}); h.advance(60001);
  const result = await h.call('workspace_migration_reconcile', args);
  assert.equal(result.status, 'needs_review'); assert.equal(result.originalSourcePreserved, true);
  assert.equal(result.workspace, undefined); assert.equal(result.fixtures, undefined);
  assert.equal((await h.call('workspace_export', {workspaceId: h.workspace.id})).files['README.md'], 'A deliberate private source improvement');
  assert.equal(h.state.files[h.packageRoot + 'README.md'], 'A separately preserved branch autosave');
  assert.deepEqual(await h.fixtureRows(), before);
  assert.equal(h.calls.filter(call => call.action === 'branch_workspace_patch').length, 0);
  await assert.rejects(h.prepare(h.branchArgs()), {code: 'GAME_ENROLLMENT_REQUIRED'});
});

test('a selected dependency binding change also invalidates an in-flight primary job', async () => {
  let finish, started;
  const running = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { finish = resolve; });
  const h = await harness({executeJob: async () => { started(); await gate; return {status: 'passed', staleExtensionReport: 'must-not-be-exposed'}; }});
  let extension = (await h.callLegacy('workspace_create', {template: 'synthetic-json', name: 'Separate extension source'})).workspace;
  const extensionManifest = {...manifest, id: 'example.migration-extension', kind: 'extension', methods: ['expand'], dependencies: {}, operations: []};
  extension = (await h.callLegacy('workspace_patch', {workspaceId: extension.id, expectedRevision: extension.revision, edits: [{path: 'manifest.json', content: JSON.stringify(extensionManifest)}, {path: 'runtime/index.mjs', content: 'export default {expand(){return []}};'}]})).workspace;
  const first = await h.callLegacy('plugin_build', {workspaceId: h.workspace.id, expectedRevision: h.workspace.revision});
  const second = await h.callLegacy('plugin_build', {workspaceId: extension.id, expectedRevision: extension.revision}); await h.flush();
  const primaryArtifact = (await h.callLegacy('job_status', {workspaceId: h.workspace.id, jobId: first.jobId})).job.result.artifactId;
  const extensionArtifact = (await h.callLegacy('job_status', {workspaceId: extension.id, jobId: second.jobId})).job.result.artifactId;
  assert.ok(extensionArtifact);
  const job = await h.callLegacy('tests_run', {workspaceId: h.workspace.id, artifactId: primaryArtifact, extensionArtifactIds: [extensionArtifact]}); await running;
  // A durable workspace binding transition is the boundary being tested. The
  // selected extension belongs to the same owner but has a new evidence epoch.
  const source = (await h.store.list('developers/', 1000)).find(row => row.key.includes('/workspaces/') && row.value.id === extension.id);
  await h.store.put(source.key, {...source.value, evidenceEpoch: 'epoch_after_explicit_migration'}, {ifMatch: source.etag});
  finish(); await h.flush();
  await assert.rejects(h.callLegacy('job_status', {workspaceId: h.workspace.id, jobId: job.jobId}), {code: 'WORKSPACE_EVIDENCE_STALE'});
  const stored = (await h.store.list('developers/', 1000)).find(row => row.value.id === job.jobId).value;
  assert.equal(stored.result.code, 'WORKSPACE_EVIDENCE_STALE'); assert.equal(JSON.stringify(stored).includes('must-not-be-exposed'), false);
});
