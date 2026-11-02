// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {MessageChannel} from 'node:worker_threads';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {createLocalWorkbench} from '../local.mjs';
import {createMemoryStore} from '../storage.mjs';
import {createWorkspaceService} from '../service.mjs';
import {createIsolatedExecutor} from '../executor.mjs';
import {templateFromPackage, composeExecution} from '../execution.mjs';
import {DEFAULT_SCOPES} from '../tool-definitions.mjs';
import {compileUiPackage} from '../../ui/vanilla-frame.mjs';
import {createUiPortHost, createUiPortClient} from '../../sdk/ui-bridge.mjs';
import {createExecutionLock} from '../../sdk/registry.mjs';
import {validatePackage} from '../../sdk/contracts.mjs';
import {createSaveBundle, LIMITS as SDK_LIMITS} from '../../sdk/contracts.mjs';
import {runPlugin} from '../../sdk/runner.mjs';
import {sha256} from '../storage.mjs';

const runFile = promisify(execFile), principal = {id: 'extension-developer', scopes: [...DEFAULT_SCOPES]}, other = {...principal, id: 'other-developer'};
const base = new URL('../../plugins/', import.meta.url);
async function examplePackages() {
  const gameManifest = JSON.parse(await readFile(new URL('synthetic-game/manifest.json', base), 'utf8'));
  const game = {manifest: gameManifest, files: {'runtime/connector.mjs': await readFile(new URL('synthetic-game/connector.mjs', base), 'utf8')}};
  const manifest = JSON.parse(await readFile(new URL('synthetic-extension/manifest.json', base), 'utf8')), files = {};
  for (const path of [manifest.entrypoints.runtime, ...Object.values(manifest.ui), ...manifest.operations.map(op => op.inputSchema)]) files[path] = await readFile(new URL(`synthetic-extension/${path}`, base), 'utf8');
  return {game, extension: {manifest, files}, fixture: await readFile(new URL('synthetic-game/fixture.save', base))};
}
const resultValue = result => { if (result.isError) throw Object.assign(Error(JSON.parse(result.content[0].text).error), JSON.parse(result.content[0].text)); return result.structuredContent || JSON.parse(result.content[0].text); };

test('separate contributor extension works through actual MCP, compiled custom preview, scoped UI bridge and one primary serializer', {timeout: 30000}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saverift-extension-mcp-'));
  const transport = new StdioClientTransport({command: process.execPath, args: [fileURLToPath(new URL('../stdio.mjs', import.meta.url))], env: {SAVERIFT_WORKBENCH_DIR: directory}, stderr: 'pipe'});
  const client = new Client({name: 'extension-workflow-conformance', version: '0.1.0'}, {versionNegotiation: {mode: {pin: '2026-07-28'}}});
  let uiHost, uiClient;
  try {
    await client.connect(transport);
    const call = async (name, args = {}) => resultValue(await client.callTool({name: `saverift_${name}`, arguments: args}));
    const wait = async (workspaceId, jobId) => { for (let i = 0; i < 100; i++) { const result = await call('job_status', {workspaceId, jobId}); if (!['pending', 'running'].includes(result.status)) return result; await new Promise(resolve => setTimeout(resolve, 20)); } throw Error('Job timed out'); };
    const game = (await call('workspace_create', {template: 'plugin-example.synthetic-game', name: 'Synthetic Frontier primary'})).workspace;
    const extension = (await call('workspace_create', {template: 'plugin-example.level-tools', name: 'Separate progression extension'})).workspace;
    // This is the trusted owner-operated file attachment, distinct from an AI
    // tool granting itself fixture access. The file is wholly synthetic.
    await runFile(process.execPath, [fileURLToPath(new URL('../cli.mjs', import.meta.url)), 'fixture', game.id, fileURLToPath(new URL('synthetic-game/fixture.save', base)), '--role', 'world', '--allow-ai-inspection'], {env: {...process.env, SAVERIFT_WORKBENCH_DIR: directory}});
    const current = (await call('workspace_status', {workspaceId: game.id})).workspace;
    const builtGame = await wait(game.id, (await call('plugin_build', {workspaceId: game.id, expectedRevision: current.revision})).jobId);
    const builtExtension = await wait(extension.id, (await call('plugin_build', {workspaceId: extension.id, expectedRevision: extension.revision})).jobId);
    assert.equal(builtGame.status, 'passed'); assert.equal(builtExtension.status, 'passed');
    const artifactId = builtGame.job.result.artifactId, extensionId = builtExtension.job.result.artifactId, selection = {workspaceId: game.id, artifactId, extensionArtifactIds: [extensionId], fixtureIds: current.fixtures.map(f => f.id)};
    const preview = await call('preview_open', {...selection, uiArtifactId: extensionId});
    assert.equal(preview.views.find(view => view.selected).id, 'example.level-tools');
    const local = await createLocalWorkbench({directory}), opened = await local.service.readPreview(local.principal, preview.previewId), ui = compileUiPackage({manifest: opened.artifact.manifest, files: opened.artifact.files});
    assert.equal(opened.primary.manifest.id, 'example.synthetic-game'); assert.equal(opened.artifact.manifest.id, 'example.level-tools'); assert.match(ui.script, /Your next chapter/);
    const ports = new MessageChannel();
    uiHost = createUiPortHost({port: ports.port1, instanceId: 'contributor-view', handlers: {
      getDraft: () => local.service.readPreviewDraft(local.principal, preview.previewId),
      query: async query => (await local.service.queryPreview(local.principal, preview.previewId, query)).data,
      stage: params => local.service.editPreviewDraft(local.principal, preview.previewId, {method: 'stage', params})
    }});
    uiClient = createUiPortClient({port: ports.port2, instanceId: 'contributor-view'});
    const original = await uiClient.query({method: 'example.level-tools.inspect', args: {}}); assert.equal(original.progression.level, 2);
    const initial = await uiClient.getDraft({});
    const staged = await uiClient.stage({expectedRevision: initial.revision, operation: {id: 'example.level-tools.setLevel', apiVersion: '0.1.0', params: {targetLevel: 8}}}); assert.equal(staged.revision, 1);
    await assert.rejects(uiClient.stage({expectedRevision: 1, operation: {id: 'example.synthetic.setVehicleFuel', apiVersion: '0.1.0', params: {fuel: 90}}}), {code: 'OPERATION_SCOPE_DENIED'});
    await assert.rejects(local.service.editPreviewDraft(local.principal, preview.previewId, {method: 'stage', params: {expectedRevision: 0, operation: {id: 'example.level-tools.setLevel', apiVersion: '0.1.0', params: {targetLevel: 9}}}}), {code: 'DRAFT_REVISION_CONFLICT'});
    const shared = await local.service.readPreviewDraft(local.principal, preview.previewId); assert.equal(shared.operations.length, 1);
    const tests = await wait(game.id, (await call('tests_run', selection)).jobId); assert.equal(tests.status, 'passed');
    const candidate = await wait(game.id, (await call('candidate_prepare', {...selection, expectedDraftRevision: shared.revision})).jobId);
    assert.equal(candidate.status, 'passed', JSON.stringify(candidate));
    assert.deepEqual(candidate.job.result.summary.after.progression, {level: 8, xp: 34300, skillPoints: 13});
    assert.deepEqual(candidate.job.result.summary.after.unknownBranch, original.unknownBranch);
    assert.equal(candidate.job.result.runtime.phases.filter(p => p.phase === 'serialization').length, 1);
    assert.equal(candidate.job.result.runtime.phases.filter(p => p.phase === 'extension').length, 1);
    assert.equal(candidate.job.result.runtime.totals.interrupts, candidate.job.result.runtime.phases.reduce((sum, phase) => sum + phase.interrupts, 0));
    assert.ok(candidate.job.result.runtime.totals.interrupts <= SDK_LIMITS.interrupts);
    assert.ok(candidate.job.result.runtime.totals.hostCalls <= SDK_LIMITS.hostCalls);
    assert.equal(candidate.job.result.executionLockDigest, preview.executionLockDigest);
  } finally { uiClient?.close(); uiHost?.close(); await client.close(); await rm(directory, {recursive: true, force: true}); }
});

test('execution selection rejects wrong domain API, missing pins, wrong kind and foreign developer artifacts', async () => {
  const {game, extension} = await examplePackages(), primary = {...game, id: 'artifact_primary', digest: validatePackage(game).packageDigest}, ext = {...extension, id: 'artifact_extension', digest: validatePackage(extension).packageDigest};
  const wrong = structuredClone(extension); wrong.manifest.dependencies['example.synthetic.document'] = '9.0.0';
  assert.throws(() => composeExecution(primary, [{...wrong, digest: validatePackage(wrong).packageDigest}]), {code: 'DOMAIN_API_MISMATCH'});
  assert.throws(() => composeExecution(primary, [primary]), {code: 'EXTENSION_KIND_INVALID'});
  const execute = createIsolatedExecutor(), bytes = new Uint8Array(await readFile(new URL('synthetic-game/fixture.save', base)));
  await assert.rejects(execute({kind: 'tests', package: game, extensions: [{package: extension}], executionLock: createExecutionLock({connector: {id: primary.manifest.id, version: primary.manifest.version, digest: primary.digest}}), fixtures: [{id: 'fixture_synthetic', name: 'world.save', role: 'world', bytes}], input: {}}), {code: 'UNPINNED_PACKAGE'});
  const tasks = [], service = createWorkspaceService({store: createMemoryStore(), templates: [templateFromPackage(game), templateFromPackage(extension)], schedule: p => tasks.push(p)});
  const ws = (await service.dispatch(principal, 'saverift_workspace_create', {name: 'Primary', template: 'plugin-example.synthetic-game'})).workspace, foreign = (await service.dispatch(other, 'saverift_workspace_create', {name: 'Foreign extension', template: 'plugin-example.level-tools'})).workspace;
  const a = await service.dispatch(principal, 'saverift_plugin_build', {workspaceId: ws.id, expectedRevision: ws.revision}), b = await service.dispatch(other, 'saverift_plugin_build', {workspaceId: foreign.id, expectedRevision: foreign.revision}); await Promise.all(tasks);
  const pa = (await service.dispatch(principal, 'saverift_job_status', {workspaceId: ws.id, jobId: a.jobId})).job.result.artifactId, pb = (await service.dispatch(other, 'saverift_job_status', {workspaceId: foreign.id, jobId: b.jobId})).job.result.artifactId;
  await assert.rejects(service.dispatch(principal, 'saverift_preview_open', {workspaceId: ws.id, artifactId: pa, extensionArtifactIds: [pb]}), {code: 'OBJECT_NOT_FOUND'});
  await assert.rejects(service.dispatch(principal, 'saverift_preview_open', {workspaceId: ws.id, artifactId: pa, uiArtifactId: pb}), {code: 'PREVIEW_VIEW_NOT_PINNED'});
});

test('canonical source packaging keeps the separate manifest out of package files', async () => {
  const {game} = await examplePackages(), tasks = [], service = createWorkspaceService({store: createMemoryStore(), templates: [templateFromPackage(game)], schedule: p => tasks.push(p)});
  const ws = (await service.dispatch(principal, 'saverift_workspace_create', {template: 'plugin-example.synthetic-game', name: 'Exact package'})).workspace;
  const started = await service.dispatch(principal, 'saverift_plugin_build', {workspaceId: ws.id, expectedRevision: ws.revision}); await Promise.all(tasks);
  const built = await service.dispatch(principal, 'saverift_job_status', {workspaceId: ws.id, jobId: started.jobId});
  assert.equal(built.job.result.digest, validatePackage(game).packageDigest);
});

test('cross-package exclusive domain conflicts reject the complete intent batch without changing its durable draft', async () => {
  const {game, extension, fixture} = await examplePackages(), conflicting = structuredClone(extension);
  conflicting.manifest.id = 'example.conflict-tools'; conflicting.manifest.operations[0].id = 'example.conflict-tools.setLevel'; conflicting.manifest.operations[0].writeDomains = [{path: 'progression', mode: 'exclusive'}];
  const gameTemplate = templateFromPackage(game); gameTemplate.fixture = {name: 'world.save', role: 'world', text: fixture.toString('utf8')};
  const tasks = [], service = createWorkspaceService({store: createMemoryStore(), templates: [gameTemplate, templateFromPackage(extension), templateFromPackage(conflicting)], schedule: p => tasks.push(p)});
  const call = (name, args) => service.dispatch(principal, `saverift_${name}`, args);
  async function built(template) {
    const workspace = (await call('workspace_create', {template, name: template})).workspace, job = await call('plugin_build', {workspaceId: workspace.id, expectedRevision: workspace.revision});
    await Promise.all(tasks.splice(0)); return {workspace, artifactId: (await call('job_status', {workspaceId: workspace.id, jobId: job.jobId})).job.result.artifactId};
  }
  const primary = await built(gameTemplate.id), a = await built('plugin-example.level-tools'), b = await built('plugin-example.conflict-tools');
  const selected = {workspaceId: primary.workspace.id, artifactId: primary.artifactId, extensionArtifactIds: [a.artifactId, b.artifactId], fixtureIds: primary.workspace.fixtures.map(f => f.id)};
  const preview = await call('preview_open', {...selected, uiArtifactId: a.artifactId});
  await assert.rejects(call('candidate_prepare', {...selected, operations: [{id: 'example.level-tools.setLevel', apiVersion: '0.1.0', params: {targetLevel: 8}}, {id: 'example.conflict-tools.setLevel', apiVersion: '0.1.0', params: {targetLevel: 9}}]}), {code: 'OPERATION_CONFLICT'});
  const draft = await service.readPreviewDraft(principal, preview.previewId); assert.equal(draft.revision, 0); assert.deepEqual(draft.operations, []);
});

test('fresh phases share the original host-call budget even when the Worker wall clock is frozen', async () => {
  const {game, extension, fixture} = await examplePackages(), noisy = structuredClone(extension);
  noisy.files[noisy.manifest.entrypoints.runtime] = noisy.files[noisy.manifest.entrypoints.runtime].replace('export function expand({document, operation, priorOperations = []}) {', "export function expand({document, operation, priorOperations = []},ctx) { for(let i=0;i<4095;i++)ctx.reportProgress({phase:'extension',completed:i});");
  const selected = composeExecution({...game, digest: validatePackage(game).packageDigest}, [{...noisy, digest: validatePackage(noisy).packageDigest}]), bytes = new Uint8Array(fixture), descriptor = {id: 'fixture_budget', logicalPath: 'world.save', role: 'world', byteLength: bytes.length, sha256: sha256(bytes)}, bundle = createSaveBundle([descriptor]), operation = {instanceId: 'intent_budget', id: 'example.level-tools.setLevel', apiVersion: '0.1.0', params: {targetLevel: 8}};
  const document = JSON.parse(fixture.toString('utf8').slice('RIFT-SYNTHETIC/1\n'.length)), originalNow = Date.now;
  Date.now = () => 1000;
  try {
    // The extension fits in an isolated single-phase profile by itself.
    const single = await runPlugin({package: noisy, executionLock: selected.executionLock, bundle, artifacts: new Map([[descriptor.id, bytes]]), method: 'expand', input: {document, operation, priorOperations: []}});
    assert.equal(single.metrics.hostCalls, 4095);
    // Inspection has already spent two reads. Resetting the fresh engine to a
    // new4096-call budget would incorrectly permit this same extension again.
    await assert.rejects(createIsolatedExecutor()({kind: 'candidate', package: game, extensions: [{package: noisy}], executionLock: selected.executionLock, fixtures: [{id: descriptor.id, name: descriptor.logicalPath, role: descriptor.role, bytes}], input: {operations: [operation]}}), error => ['HOST_CALL_LIMIT', 'JOB_RESOURCE_LIMIT', 'PLUGIN_EXECUTION_FAILED'].includes(error.code) && /HOST_CALL_LIMIT|resource|budget/.test(error.message));
  } finally { Date.now = originalNow; }
});
