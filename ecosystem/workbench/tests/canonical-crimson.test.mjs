// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildCrimsonPackage} from '../../plugins/crimson-desert/scripts/build.mjs';
import {createWorkspaceService} from '../service.mjs';
import {createMemoryStore} from '../storage.mjs';
import {templateFromPackage} from '../execution.mjs';
import {DEFAULT_SCOPES} from '../tool-definitions.mjs';

test('actual canonical Crimson release package → workspace template → build preserves its exact package digest', {timeout: 30000}, async () => {
  const pkg = await buildCrimsonPackage({write: false}), tasks = [], principal = {id: 'canonical-build-developer', scopes: [...DEFAULT_SCOPES]};
  const service = createWorkspaceService({store: createMemoryStore(), templates: [templateFromPackage(pkg)], schedule: p => tasks.push(p)});
  const ws = (await service.dispatch(principal, 'saverift_workspace_create', {template: `plugin-${pkg.manifest.id}`, name: 'Exact Crimson release'})).workspace;
  assert.equal(ws.files.length, Object.keys(pkg.files).length + 1);
  const job = await service.dispatch(principal, 'saverift_plugin_build', {workspaceId: ws.id, expectedRevision: ws.revision}); await Promise.all(tasks);
  const result = await service.dispatch(principal, 'saverift_job_status', {workspaceId: ws.id, jobId: job.jobId}); assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(result.job.result.digest, pkg.packageDigest);
});
