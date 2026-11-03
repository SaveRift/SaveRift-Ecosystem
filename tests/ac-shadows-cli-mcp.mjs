// SPDX-License-Identifier: Apache-2.0
// Retrieve an existing authorized AC job through the real CLI and MCP stdio.
// Reads no fixture bytes and does not rerun the expensive candidate workflow.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const require = createRequire(new URL('../ecosystem/workbench/package.json', import.meta.url));
const {Client} = require('@modelcontextprotocol/client');
const {StdioClientTransport} = require('@modelcontextprotocol/client/stdio');
const config = JSON.parse(await readFile(process.env.SAVERIFT_AC_FLOW_CONFIG, 'utf8'));
const evidencePath = resolve(config.outputDirectory, 'workflow-receipt.json');
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
const workbench = fileURLToPath(new URL('../ecosystem/workbench/', import.meta.url));
const env = {...process.env, SAVERIFT_WORKBENCH_DIR: process.env.SAVERIFT_WORKBENCH_DIR || config.stateDirectory};
const args = {workspaceId: evidence.workspaceId, jobId: evidence.candidate?.job.id || evidence.noop.job.id};
const cli = JSON.parse(execFileSync(process.execPath, [resolve(workbench, 'cli.mjs'), 'call', 'saverift_job_status', JSON.stringify(args)], {env, encoding: 'utf8'}));
assert.equal(cli.status, 'passed');
const transport = new StdioClientTransport({command: process.execPath, args: [resolve(workbench, 'stdio.mjs')], cwd: workbench, env, stderr: 'pipe'});
const client = new Client({name: 'saverift-ac-review', version: '0.1.0'}, {versionNegotiation: {mode: {pin: '2026-07-28'}}});
const parsed = response => response.structuredContent || JSON.parse(response.content.find(c => c.type === 'text').text);
let stderr = '';
transport.stderr.on('data', chunk => {stderr += chunk.toString();});
try {
  await client.connect(transport);
  const tools = await client.listTools();
  assert.ok(tools.tools.some(t => t.name === 'saverift_candidate_prepare'));
  const mcp = parsed(await client.callTool({name: 'saverift_job_status', arguments: args}));
  assert.equal(mcp.status, 'passed');
  assert.equal(mcp.job.id, cli.job.id);
  assert.equal(mcp.job.result.executionLockDigest, evidence.executionLockDigest);
  const projects = parsed(await client.callTool({name: 'saverift_project_list', arguments: {}}));
  assert.equal(stderr, '');
  const receipt = {schema: 'saverift.ac-shadows.cli-mcp.v1', status: 'passed', cli: 'actual child process',
    mcp: 'official SDK 2.4.0 client and actual stdio server; negotiated pinned protocol 2026-07-28',
    workspaceId: evidence.workspaceId, jobId: mcp.job.id, packageDigest: evidence.packageDigest,
    executionLockDigest: evidence.executionLockDigest, listedTools: tools.tools.length,
    projects, fixtureBytesInArguments: false, gameAcceptance: 'not_run', hosted: 'not_run'};
  await writeFile(resolve(config.outputDirectory, 'cli-mcp-receipt.json'), JSON.stringify(receipt, null, 2));
  process.stdout.write(JSON.stringify({status: receipt.status, jobId: receipt.jobId, listedTools: receipt.listedTools}) + '\n');
} finally {await client.close();}
