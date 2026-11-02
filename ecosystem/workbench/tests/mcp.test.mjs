// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client, StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {createMemoryStore} from '../storage.mjs';
import {createWorkspaceService} from '../service.mjs';
import {DEFAULT_SCOPES} from '../tool-definitions.mjs';
import {createDeveloperMcpHandler, MCP_COMPATIBILITY} from '../mcp.mjs';
import {createIsolatedExecutor} from '../executor.mjs';
import {createExecutionLock} from '../../sdk/runner.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const parsed = result => result.structuredContent || JSON.parse(result.content.find(c => c.type === 'text').text);

test('official SDK2.4 client launches local stdio, discovers2026 protocol, resources/prompts and completes isolated workflow', {timeout: 20000}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saverift-mcp-test-'));
  const transport = new StdioClientTransport({command: process.execPath, args: [join(root, 'stdio.mjs')], cwd: root, env: {SAVERIFT_WORKBENCH_DIR: directory}, stderr: 'pipe'});
  const client = new Client({name: 'saverift-official-sdk-conformance', version: '0.1.0'}, {versionNegotiation: {mode: {pin: '2026-07-28'}}});
  let stderr = ''; transport.stderr.on('data', chunk => { stderr += chunk.toString(); });
  try {
    await client.connect(transport);
    assert.equal(MCP_COMPATIBILITY.sdkVersion, '2.4.0');
    const listed = await client.listTools(); assert.ok(listed.tools.some(t => t.name === 'saverift_workspace_patch'));
    const coordinationPublication = new Set(['saverift_work_publish_prepare', 'saverift_work_publish', 'saverift_work_publish_reconcile']);
    assert.ok(!listed.tools.some(t => /shell|xbox.*write|publish/.test(t.name) && !coordinationPublication.has(t.name)));
    assert.ok(!listed.tools.some(t => /registry.*promot|^saverift_(?:xbox|save)_(?:upload|restore)/.test(t.name)));
    assert.ok((await client.listResources()).resources.some(r => r.uri === 'saverift://docs/fixture-consent-v0.1'));
    assert.ok((await client.listPrompts()).prompts.some(p => p.name === 'build-custom-ui'));
    const created = parsed(await client.callTool({name: 'saverift_workspace_create', arguments: {template: 'synthetic-json', name: 'Official MCP client'}}));
    const ws = created.workspace;
    const build = parsed(await client.callTool({name: 'saverift_plugin_build', arguments: {workspaceId: ws.id, expectedRevision: ws.revision}}));
    let job;
    for (let attempt = 0; attempt < 50; attempt++) { job = parsed(await client.callTool({name: 'saverift_job_status', arguments: {workspaceId: ws.id, jobId: build.jobId}})); if (!['pending', 'running'].includes(job.status)) break; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.equal(job.status, 'passed', JSON.stringify(job));
    const tests = parsed(await client.callTool({name: 'saverift_tests_run', arguments: {workspaceId: ws.id, artifactId: job.job.result.artifactId, fixtureIds: ws.fixtures.map(f => f.id)}}));
    for (let attempt = 0; attempt < 50; attempt++) { job = parsed(await client.callTool({name: 'saverift_job_status', arguments: {workspaceId: ws.id, jobId: tests.jobId}})); if (!['pending', 'running'].includes(job.status)) break; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.equal(job.status, 'passed', JSON.stringify(job));
    assert.ok(job.job.result.checks.some(c => c.name === 'independent-reopen'));
    assert.equal(stderr, '');
  } finally { await client.close(); await rm(directory, {recursive: true, force: true}); }
});

test('official Streamable HTTP client uses verified independent developer principal and rejects anonymous/forged identity', async () => {
  const service = createWorkspaceService({store: createMemoryStore()});
  const principal = {id: 'http-developer-no-xbox', scopes: [...DEFAULT_SCOPES]};
  const handler = createDeveloperMcpHandler({service, authenticate: async request => request.headers.get('authorization') === 'Bearer test-only-developer-grant' ? principal : null, allowedHosts: ['studio.test'], allowedOrigins: ['https://studio.test']});
  const unauthorized = await handler.fetch(new Request('https://studio.test/mcp', {method: 'POST', headers: {'Content-Type': 'application/json', 'oai-authenticated-user-id': principal.id}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'server/discover'})})); assert.equal(unauthorized.status, 401);
  const client = new Client({name: 'saverift-http-protocol-control', version: '0.1.0'}, {versionNegotiation: {mode: {pin: '2026-07-28'}}});
  const transport = new StreamableHTTPClientTransport(new URL('https://studio.test/mcp'), {requestInit: {headers: {Authorization: 'Bearer test-only-developer-grant'}}, fetch: async (input, init) => handler.fetch(new Request(input, init))});
  try { await client.connect(transport); const templates = parsed(await client.callTool({name: 'saverift_template_list', arguments: {}})); assert.equal(templates.status, 'passed'); assert.ok(templates.templates.some(t => t.id === 'synthetic-json')); }
  finally { await client.close(); }
  const foreign = await handler.fetch(new Request('https://studio.test/mcp', {method: 'POST', headers: {Authorization: 'Bearer test-only-developer-grant', Origin: 'https://attacker.test'}, body: '{}'})); assert.equal(foreign.status, 403);
});

test('the workbench executor runs canonical root connector states, required checks, retained outputs and separate summary artifact', async () => {
  const base = new URL('../../plugins/synthetic-game/', import.meta.url), manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  const pkg = {manifest, files: {'runtime/connector.mjs': await readFile(new URL('connector.mjs', base), 'utf8')}};
  const bytes = new Uint8Array(await readFile(new URL('fixture.save', base))), execute = createIsolatedExecutor();
  const fixtures = [{id: 'fixture_root_synthetic', name: 'world.save', role: 'world', bytes}];
  const result = await execute({kind: 'tests', package: pkg, executionLock: createExecutionLock(pkg), fixtures, input: {}});
  assert.equal(result.status, 'passed'); assert.ok(result.checks.some(c => c.name === 'no-op-byte-parity'));
  const changed = await execute({kind: 'candidate', package: pkg, executionLock: createExecutionLock(pkg), fixtures, input: {operations: [{instanceId: 'intent-fuel', id: 'example.synthetic.setVehicleFuel', apiVersion: '0.1.0', params: {fuel: 14}}]}});
  assert.equal(changed.summary.after.vehicle.fuel, 14); assert.equal(changed.privateArtifacts.length, 1);
});
