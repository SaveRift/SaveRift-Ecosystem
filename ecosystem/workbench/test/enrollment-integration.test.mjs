// SPDX-License-Identifier: Apache-2.0
// Hosted opt-in lifecycle tests use only public synthetic templates/fixtures.
// The discovery stub models a trusted, already viewed discovery; GitHub
// coordination itself is covered by collaboration service/provider tests.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMemoryStore} from '../storage.mjs';
import {createWorkspaceService} from '../service.mjs';
import {createIsolatedExecutor} from '../executor.mjs';
import {TEMPLATES} from '../templates.mjs';
import {templateFromPackage} from '../execution.mjs';
import {DEFAULT_SCOPES} from '../tool-definitions.mjs';
import {createWorkbenchRouter} from '../router.mjs';
import {createDeveloperMcpHandler} from '../mcp.mjs';
import {Client, StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createGameAccess} from '../../collaboration/enrollment.mjs';
import {DEFAULT_GAME_PROJECTS} from '../../collaboration/projects.mjs';

const alice = {id: 'hosted-developer-alice', scopes: [...DEFAULT_SCOPES]};
const bob = {id: 'hosted-developer-bob', scopes: [...DEFAULT_SCOPES]};
const deferred = () => { let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve}; };
const failCodes = ['GAME_GRANT_REVOKED', 'GAME_ENROLLMENT_REQUIRED'];
function gatedStore() {
  const original = createMemoryStore(); let pending;
  return {...original, arm(category) { const seen = deferred(), gate = deferred(); pending = {category, seen, gate}; return {seen: seen.promise, release: gate.resolve}; },
    async get(key) { const row = await original.get(key); if (pending && key.includes(`/${pending.category}/`)) { const selected = pending; pending = null; selected.seen.resolve(); await selected.gate.promise; } return row; }
  };
}
function harness(options = {}) {
  const tasks = [], store = options.store || createMemoryStore(), projects = options.projects || DEFAULT_GAME_PROJECTS;
  const access = createGameAccess({store, projects}), discoveries = new Set();
  const discoveryId = (principal, gameId) => `discovery_${principal.id.replaceAll('-', '_')}_${gameId.replaceAll('-', '_')}`;
  const collaboration = {async verifyDiscovery(principal, {gameId, discoveryId: selected}) {
    assert.equal(discoveries.has(`${principal.id}\0${gameId}\0${selected}`), true, 'creation requires an account/game-specific completed discovery');
    return {gameId, project: access.getProject(gameId)};
  }};
  const service = createWorkspaceService({store, access, collaboration, templates: options.templates || TEMPLATES, executeJob: options.executeJob || createIsolatedExecutor(), schedule: promise => tasks.push(promise)});
  const call = (name, args = {}, principal = alice) => service.dispatch(principal, `saverift_${name}`, args);
  return {store, access, service, call,
    async enable(principal = alice, gameId = 'synthetic', expectedRevision = 0) { return access.enroll(principal, {gameId, expectedRevision}); },
    async revokeAndReenable(principal = alice, gameId = 'synthetic') { const current = await access.getMembership(principal, gameId); const disabled = await access.optOut(principal, {gameId, expectedRevision: current.revision}); return access.enroll(principal, {gameId, expectedRevision: disabled.revision}); },
    async create(principal = alice, gameId = 'synthetic', template = 'synthetic-json') { const selected = discoveryId(principal, gameId); discoveries.add(`${principal.id}\0${gameId}\0${selected}`); return (await call('workspace_create', {template, name: `${gameId} authoring`, gameId, discoveryId: selected}, principal)).workspace; },
    async flush() { await Promise.all(tasks.splice(0)); }
  };
}
async function built(h, workspace, principal = alice) {
  const started = await h.call('plugin_build', {workspaceId: workspace.id, expectedRevision: workspace.revision}, principal); await h.flush();
  const result = await h.call('job_status', {workspaceId: workspace.id, jobId: started.jobId}, principal);
  assert.equal(result.status, 'passed', JSON.stringify(result)); return result.job.result.artifactId;
}
async function privateRows(h, category) { return (await h.store.list('developers/', 1000)).filter(row => row.key.includes(`/${category}/`)); }

test('hosted workbench requires opt-in for each independent developer but preserves owner isolation', async () => {
  const h = harness();
  await assert.rejects(h.create(), {code: 'GAME_ENROLLMENT_REQUIRED'});
  await h.enable(); const a = await h.create();
  assert.equal(a.gameId, 'synthetic');
  await assert.rejects(h.create(bob), {code: 'GAME_ENROLLMENT_REQUIRED'});
  await h.enable(bob); const b = await h.create(bob);
  assert.equal((await h.call('workspace_list', {}, bob)).workspaces[0].id, b.id);
  await assert.rejects(h.call('workspace_read', {workspaceId: a.id, path: 'README.md'}, bob), {code: 'WORKSPACE_NOT_FOUND'});
  await h.access.optOut(alice, {gameId: 'synthetic', expectedRevision: 1});
  await assert.rejects(h.call('workspace_status', {workspaceId: a.id}), {code: 'GAME_ENROLLMENT_REQUIRED'});
  assert.equal((await h.call('workspace_status', {workspaceId: b.id}, bob)).workspace.id, b.id);
});

test('source-only owner export remains available after opt-out without exposing fixtures or other developers', async () => {
  const h = harness(); await h.enable(); const workspace = await h.create();
  const bytes = new TextEncoder().encode('{"ownerPrivateMarker":"not-public-source"}');
  const intent = await h.call('fixture_upload_prepare', {workspaceId: workspace.id, name: 'private-marker.save', byteLength: bytes.length});
  await h.service.trustedUploadFixture(alice, intent.uploadId, bytes);
  await h.access.optOut(alice, {gameId: 'synthetic', expectedRevision: 1});
  const exported = await h.call('workspace_export', {workspaceId: workspace.id});
  assert.ok(exported.files['manifest.json']); assert.ok(exported.files['runtime/index.mjs']);
  const serialized = JSON.stringify(exported);
  for (const privateValue of ['private-marker.save', 'ownerPrivateMarker', 'not-public-source', Buffer.from(bytes).toString('base64')]) assert.equal(serialized.includes(privateValue), false);
  assert.equal(exported.fixtures, undefined);
  await assert.rejects(h.call('workspace_export', {workspaceId: workspace.id}, bob), {code: 'WORKSPACE_NOT_FOUND'});
});

test('fixture upload intents captured before opt-out cannot revive on re-enrollment', async () => {
  const h = harness(); await h.enable(); const workspace = await h.create(), bytes = new TextEncoder().encode('{"level":12}');
  const prepared = await h.call('fixture_upload_prepare', {workspaceId: workspace.id, name: 'fresh-private.json', byteLength: bytes.length});
  await h.revokeAndReenable();
  await assert.rejects(h.service.trustedUploadFixture(alice, prepared.uploadId, bytes), error => error.code === 'GAME_GRANT_REVOKED');
  const status = await h.call('workspace_status', {workspaceId: workspace.id});
  assert.equal(status.workspace.fixtures.some(fixture => fixture.name === 'fresh-private.json'), false);
  const fresh = await h.call('fixture_upload_prepare', {workspaceId: workspace.id, name: 'fresh-private.json', byteLength: bytes.length});
  assert.equal((await h.service.trustedUploadFixture(alice, fresh.uploadId, bytes)).name, 'fresh-private.json');
});

test('pending packaging jobs cannot issue an artifact after their captured game grant is revoked', {timeout: 10000}, async () => {
  const original = createMemoryStore(), gate = deferred(), seen = deferred(); let holdPending = false;
  const store = {...original, async get(key) { const row = await original.get(key); if (holdPending && key.includes('/jobs/') && row?.value.status === 'pending') { holdPending = false; seen.resolve(); await gate.promise; } return row; }};
  const h = harness({store}); await h.enable(); const workspace = await h.create();
  holdPending = true;
  const started = await h.call('plugin_build', {workspaceId: workspace.id, expectedRevision: workspace.revision});
  await seen.promise; await h.revokeAndReenable(); gate.resolve(); await h.flush();
  const jobs = await privateRows(h, 'jobs'), job = jobs.find(row => row.value.id === started.jobId).value;
  assert.equal(job.status, 'failed'); assert.ok(failCodes.includes(job.result.code), JSON.stringify(job.result));
  assert.equal((await privateRows(h, 'artifacts')).length, 0);
  assert.equal((await privateRows(h, 'candidates')).length, 0);
});

test('running isolated results cannot publish reports or private candidate bytes after revocation', {timeout: 10000}, async () => {
  const gate = deferred(), entered = deferred();
  const h = harness({executeJob: async () => { entered.resolve(); await gate.promise; return {status: 'passed', privateArtifacts: [{id: 'candidate_synthetic', bytes: new TextEncoder().encode('must-not-be-retained')}], secret: 'must-not-be-reported'}; }});
  await h.enable(); const workspace = await h.create(), artifactId = await built(h, workspace);
  const started = await h.call('tests_run', {workspaceId: workspace.id, artifactId, fixtureIds: workspace.fixtures.map(fixture => fixture.id)});
  await entered.promise; await h.revokeAndReenable(); gate.resolve(); await h.flush();
  const job = (await privateRows(h, 'jobs')).find(row => row.value.id === started.jobId).value;
  assert.equal(job.status, 'failed'); assert.ok(failCodes.includes(job.result.code), JSON.stringify(job.result));
  assert.equal(JSON.stringify(job).includes('must-not-be-reported'), false);
  assert.equal((await privateRows(h, 'candidates')).length, 0);
});

test('preview and its query/draft interfaces stay revoked after developer tools are re-enabled', async () => {
  const h = harness(); await h.enable(); const workspace = await h.create(), artifactId = await built(h, workspace);
  const args = {workspaceId: workspace.id, artifactId, fixtureIds: workspace.fixtures.map(fixture => fixture.id)};
  const preview = await h.call('preview_open', args); await h.service.readPreview(alice, preview.previewId);
  await h.revokeAndReenable();
  for (const operation of [() => h.service.readPreview(alice, preview.previewId), () => h.service.queryPreview(alice, preview.previewId, {domain: 'summary'}), () => h.service.readPreviewDraft(alice, preview.previewId), () => h.service.editPreviewDraft(alice, preview.previewId, {method: 'stage', params: {expectedRevision: 0, operation: {id: 'synthetic.level.set', apiVersion: '0.1.0', params: {level: 8}}}})]) await assert.rejects(operation(), {code: 'GAME_GRANT_REVOKED'});
  const current = (await h.call('workspace_status', {workspaceId: workspace.id})).workspace;
  const rebuilt = await built(h, current);
  const fresh = await h.call('preview_open', {...args, artifactId: rebuilt});
  assert.ok(await h.service.readPreview(alice, fresh.previewId));
});

test('an in-flight custom preview query rejects its late report after revocation', {timeout: 10000}, async () => {
  const entered = deferred(), gate = deferred();
  const h = harness({executeJob: async () => { entered.resolve(); await gate.promise; return {status: 'passed', data: {privateMarker: 'late report'}}; }});
  await h.enable(); const workspace = await h.create(), artifactId = await built(h, workspace);
  const preview = await h.call('preview_open', {workspaceId: workspace.id, artifactId, fixtureIds: workspace.fixtures.map(fixture => fixture.id)});
  const query = h.service.queryPreview(alice, preview.previewId, {domain: 'summary'});
  await entered.promise; await h.revokeAndReenable(); gate.resolve();
  await assert.rejects(query, {code: 'GAME_GRANT_REVOKED'});
});

test('an in-flight private draft read cannot expose its result after revocation', {timeout: 10000}, async () => {
  const store = gatedStore(), h = harness({store}); await h.enable();
  const workspace = await h.create(), artifactId = await built(h, workspace), preview = await h.call('preview_open', {workspaceId: workspace.id, artifactId});
  const gate = store.arm('drafts'), request = h.service.readPreviewDraft(alice, preview.previewId);
  await gate.seen; await h.revokeAndReenable(); gate.release();
  await assert.rejects(request, {code: 'GAME_GRANT_REVOKED'});
});

test('an in-flight custom UI draft edit cannot persist after revocation and re-enrollment', {timeout: 10000}, async () => {
  const store = gatedStore(), h = harness({store}); await h.enable();
  const workspace = await h.create(), artifactId = await built(h, workspace), preview = await h.call('preview_open', {workspaceId: workspace.id, artifactId});
  const gate = store.arm('drafts'), request = h.service.editPreviewDraft(alice, preview.previewId, {method: 'stage', params: {expectedRevision: 0, operation: {id: 'synthetic.level.set', apiVersion: '0.1.0', params: {level: 8}}}});
  await gate.seen; await h.revokeAndReenable(); gate.release();
  await assert.rejects(request, {code: 'GAME_GRANT_REVOKED'});
  assert.equal((await privateRows(h, 'drafts'))[0].value.draft.revision, 0);
});

test('an in-flight fixture consent change cannot become effective after its enrollment was revoked', {timeout: 10000}, async () => {
  const store = gatedStore(), h = harness({store}); await h.enable(); const workspace = await h.create(), bytes = new TextEncoder().encode('{"format":"synthetic-private-fixture"}');
  const intent = await h.call('fixture_upload_prepare', {workspaceId: workspace.id, name: 'private-consent-test.json', byteLength: bytes.length});
  const fixture = await h.service.trustedUploadFixture(alice, intent.uploadId, bytes), gate = store.arm('fixtures');
  const request = h.service.trustedSetFixtureConsent(alice, workspace.id, fixture.id, true);
  await gate.seen; await h.revokeAndReenable(); gate.release();
  await assert.rejects(request, {code: 'GAME_GRANT_REVOKED'});
  assert.equal((await privateRows(h, 'fixtures')).find(row => row.value.id === fixture.id).value.aiAccess, false);
});

test('manifest edits cannot retarget the immutable workspace game or trusted package identity', async () => {
  const h = harness(); await h.enable(); const workspace = await h.create();
  const manifest = JSON.parse(TEMPLATES[0].files['manifest.json']); manifest.id = 'saverift.crimson-desert';
  let patched;
  try { patched = await h.call('workspace_patch', {workspaceId: workspace.id, expectedRevision: workspace.revision, edits: [{path: 'manifest.json', content: JSON.stringify(manifest)}]}); }
  catch (error) { assert.match(error.code || '', /(?:IDENTITY|PACKAGE|PROJECT|MANIFEST)/); }
  if (patched) {
    const started = await h.call('plugin_build', {workspaceId: workspace.id, expectedRevision: patched.workspace.revision}); await h.flush();
    const result = await h.call('job_status', {workspaceId: workspace.id, jobId: started.jobId});
    assert.equal(result.status, 'failed'); assert.match(result.job.result.code, /(?:IDENTITY|PACKAGE|PROJECT|MANIFEST)/);
  }
  assert.equal((await h.call('workspace_status', {workspaceId: workspace.id})).workspace.gameId, 'synthetic');
});

test('a selected extension requires its own project opt-in even when the primary game remains enabled', async () => {
  const base = new URL('../../plugins/', import.meta.url), manifest = JSON.parse(await readFile(new URL('synthetic-extension/manifest.json', base), 'utf8')), files = {};
  for (const path of [manifest.entrypoints.runtime, ...Object.values(manifest.ui), ...manifest.operations.map(operation => operation.inputSchema)]) files[path] = await readFile(new URL(`synthetic-extension/${path}`, base), 'utf8');
  const extension = templateFromPackage({manifest, files});
  const projects = [...DEFAULT_GAME_PROJECTS, {...DEFAULT_GAME_PROJECTS[1], id: 'extension-testing', displayName: 'Independent extension test project', packageId: manifest.id, templateIds: [extension.id], packageRoots: ['ecosystem/plugins/synthetic-extension/']}];
  const h = harness({projects, templates: [...TEMPLATES, extension]}); await h.enable(); await h.enable(alice, 'extension-testing');
  const primary = await h.create(), ext = await h.create(alice, 'extension-testing', extension.id);
  const artifactId = await built(h, primary), extensionArtifactId = await built(h, ext);
  await h.access.optOut(alice, {gameId: 'extension-testing', expectedRevision: 1});
  await assert.rejects(h.call('preview_open', {workspaceId: primary.id, artifactId, extensionArtifactIds: [extensionArtifactId]}), error => failCodes.includes(error.code));
  await assert.rejects(h.call('tests_run', {workspaceId: primary.id, artifactId, extensionArtifactIds: [extensionArtifactId]}), error => failCodes.includes(error.code));
});

test('browser and official MCP share one enrollment revision, source authoring authority and revocation state', async () => {
  const h = harness(), authenticate = async request => request.headers.get('authorization') === 'Bearer synthetic-developer-grant' ? alice : null;
  const router = createWorkbenchRouter({service: h.service, authenticate, allowedHosts: ['studio.test'], allowedOrigins: ['https://studio.test']});
  const handler = createDeveloperMcpHandler({service: h.service, authenticate, allowedHosts: ['studio.test'], allowedOrigins: ['https://studio.test']});
  const browser = async (name, args) => { const response = await router(new Request('https://studio.test/api/developer/call', {method: 'POST', headers: {Authorization: 'Bearer synthetic-developer-grant', Origin: 'https://studio.test', 'Content-Type': 'application/json'}, body: JSON.stringify({name: `saverift_${name}`, arguments: args})})); return {status: response.status, body: await response.json()}; };
  const client = new Client({name: 'hosted-enrollment-authority-control', version: '0.1.0'}, {versionNegotiation: {mode: {pin: '2026-07-28'}}});
  const transport = new StreamableHTTPClientTransport(new URL('https://studio.test/mcp'), {requestInit: {headers: {Authorization: 'Bearer synthetic-developer-grant'}}, fetch: (input, init) => handler.fetch(new Request(input, init))});
  const mcp = async (name, args) => { const result = await client.callTool({name: `saverift_${name}`, arguments: args}); return result.structuredContent || JSON.parse(result.content[0].text); };
  try {
    await client.connect(transport);
    assert.equal((await browser('developer_enrollment_set', {gameId: 'synthetic', state: 'enabled', expectedRevision: 0})).body.membership.state, 'enabled');
    assert.equal((await mcp('developer_enrollment_get', {gameId: 'synthetic'})).membership.revision, 1);
    const workspace = await h.create();
    const changed = await mcp('workspace_patch', {workspaceId: workspace.id, expectedRevision: workspace.revision, edits: [{path: 'README.md', content: 'Same authoring permissions through MCP and browser.'}]});
    assert.equal(changed.status, 'passed');
    assert.equal((await browser('workspace_read', {workspaceId: workspace.id, path: 'README.md'})).body.content, 'Same authoring permissions through MCP and browser.');
    assert.equal((await mcp('developer_enrollment_set', {gameId: 'synthetic', state: 'disabled', expectedRevision: 1})).membership.state, 'disabled');
    const deniedBrowser = await browser('workspace_read', {workspaceId: workspace.id, path: 'README.md'}), deniedMcp = await mcp('workspace_read', {workspaceId: workspace.id, path: 'README.md'});
    assert.equal(deniedBrowser.status, 403); assert.equal(deniedBrowser.body.code, deniedMcp.code); assert.equal(deniedMcp.code, 'GAME_ENROLLMENT_REQUIRED');
    assert.equal((await browser('workspace_export', {workspaceId: workspace.id})).body.excludesPrivateData, true);
    assert.equal((await mcp('workspace_export', {workspaceId: workspace.id})).excludesPrivateData, true);
  } finally { await client.close(); }
});

test('hosted enrollment never upgrades browser or MCP transport scopes and forged headers confer no authority', async () => {
  const h = harness(); await h.enable(); const workspace = await h.create();
  const readOnly = {...alice, scopes: ['developer:docs', 'workspace:read']};
  const authenticate = async request => request.headers.get('authorization') === 'Bearer synthetic-read-only-grant' ? readOnly : null;
  const router = createWorkbenchRouter({service: h.service, authenticate, allowedHosts: ['studio.test'], allowedOrigins: ['https://studio.test']});
  const forged = await router(new Request('https://studio.test/api/developer/status', {headers: {'oai-authenticated-user-id': alice.id, 'x-saverift-role': 'maintainer'}}));
  assert.equal(forged.status, 401);
  const response = await router(new Request('https://studio.test/api/developer/call', {method: 'POST', headers: {Authorization: 'Bearer synthetic-read-only-grant', Origin: 'https://studio.test', 'Content-Type': 'application/json', 'x-saverift-role': 'maintainer'}, body: JSON.stringify({name: 'saverift_workspace_patch', arguments: {workspaceId: workspace.id, expectedRevision: workspace.revision, edits: [{path: 'README.md', content: 'forged write'}]}})}));
  assert.equal(response.status, 403); assert.equal((await response.json()).code, 'SCOPE_REQUIRED');
  const handler = createDeveloperMcpHandler({service: h.service, authenticate, allowedHosts: ['studio.test']});
  const client = new Client({name: 'hosted-scope-control', version: '0.1.0'}, {versionNegotiation: {mode: {pin: '2026-07-28'}}});
  const transport = new StreamableHTTPClientTransport(new URL('https://studio.test/mcp'), {requestInit: {headers: {Authorization: 'Bearer synthetic-read-only-grant'}}, fetch: (input, init) => handler.fetch(new Request(input, init))});
  try { await client.connect(transport); assert.equal((await client.listTools()).tools.some(tool => tool.name === 'saverift_workspace_patch' || tool.name === 'saverift_developer_enrollment_set'), false); }
  finally { await client.close(); }
  assert.notEqual((await h.call('workspace_read', {workspaceId: workspace.id, path: 'README.md'})).content, 'forged write');
});

test('standalone local workbench remains usable without hosted enrollment or Microsoft identity', async () => {
  const tasks = [], service = createWorkspaceService({store: createMemoryStore(), schedule: promise => tasks.push(promise)});
  const workspace = (await service.dispatch(alice, 'saverift_workspace_create', {template: 'synthetic-json', name: 'Local offline authoring'})).workspace;
  assert.equal((await service.dispatch(alice, 'saverift_workspace_read', {workspaceId: workspace.id, path: 'README.md'})).content.includes('Synthetic'), true);
  await Promise.all(tasks);
});
