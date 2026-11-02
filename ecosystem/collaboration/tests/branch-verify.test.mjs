// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryStore, sha256} from '../../workbench/storage.mjs';
import {createGameAccess} from '../enrollment.mjs';
import {DEFAULT_GAME_PROJECTS} from '../projects.mjs';
import {developerKey} from '../authorization.mjs';
import {createCollaborationService, BRANCH_WORKSPACE_SCHEMA} from '../service.mjs';

test('read-only branch verification checks real provider head without synchronizing or overwriting source', async () => {
  const alice = {id: 'verify-source-owner', scopes: ['git:read']}, bob = {...alice, id: 'verify-other-owner'};
  const store = createMemoryStore(), input = {...DEFAULT_GAME_PROJECTS[1], repository: {id: '7891234', owner: 'example-org', name: 'ecosystem', defaultBranch: 'main'}};
  const access = createGameAccess({store, projects: [input]}), project = access.getProject('synthetic');
  await access.enroll(alice, {gameId: project.id, expectedRevision: 0}); await access.enroll(bob, {gameId: project.id, expectedRevision: 0});
  const base = 'a'.repeat(40), tree = 'b'.repeat(40), id = 'bws_' + '1'.repeat(32);
  const key = `collaboration/branches/${sha256(project.id)}/${developerKey(alice)}/${id}`;
  const record = {schema: BRANCH_WORKSPACE_SCHEMA, id, owner: developerKey(alice), gameId: project.id, projectDigest: project.projectDigest, repository: project.repository, packageId: project.packageId, packageRoots: project.packageRoots, branch: 'saverift/synthetic/owner/issue-9-verify', issueNumber: 9, baseCommit: base, gitHead: base, treeSha: tree, revision: 4, operation: null, files: {[project.packageRoots[0] + 'README.md']: 'Private autosave stays intact'}, dirty: true};
  await store.put(key, record, {ifAbsent: true}); const before = await store.get(key);
  let remote = base, reads = 0;
  const service = createCollaborationService({store, access, git: {async readHead(ctx) { reads++; assert.equal(ctx.actor.id, alice.id); await access.assertGrant(alice, ctx.grant); assert.equal(ctx.branch, record.branch); return {sha: remote, treeSha: tree}; }}});
  const args = {gameId: project.id, workspaceId: id, expectedRevision: 4, expectedGitHead: base};
  const result = await service.dispatch(alice, 'branch_workspace_verify', args);
  assert.equal(result.head.sha, base); assert.equal(reads, 1); assert.deepEqual(await store.get(key), before);
  remote = 'c'.repeat(40);
  await assert.rejects(service.dispatch(alice, 'branch_workspace_verify', args), {code: 'GITHUB_HEAD_CHANGED'});
  assert.deepEqual(await store.get(key), before);
  await assert.rejects(service.dispatch(alice, 'branch_workspace_verify', {...args, expectedRevision: 3}), {code: 'BRANCH_WORKSPACE_CONFLICT'});
  await assert.rejects(service.dispatch(bob, 'branch_workspace_verify', args), {code: 'BRANCH_WORKSPACE_NOT_FOUND'});
  await access.optOut(alice, {gameId: project.id, expectedRevision: 1});
  await assert.rejects(service.dispatch(alice, 'branch_workspace_verify', args), {code: 'GAME_ENROLLMENT_REQUIRED'});
  assert.equal(reads, 2);
});
