// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryStore} from '../../workbench/storage.mjs';
import {assertProjectPath, developerKey, roleAllows} from '../authorization.mjs';
import {createGameAccess, MEMBERSHIP_SCHEMA} from '../enrollment.mjs';
import {createProjectRegistry, DEFAULT_GAME_PROJECTS} from '../projects.mjs';

const alice = {id: 'independent-developer-alice', scopes: ['workspace:read', 'workspace:write']};
const bob = {id: 'independent-developer-bob', scopes: ['workspace:read', 'workspace:write']};
const admin = {id: 'separately-authorized-platform-admin', scopes: []};
const create = (options = {}) => createGameAccess({store: createMemoryStore(), now: () => 1234, ...options});
const enable = (access, principal = alice, gameId = 'synthetic', expectedRevision = 0) => access.enroll(principal, {gameId, expectedRevision});
const denied = (promise, code) => assert.rejects(promise, {code});

test('public discovery is independent of Xbox and defaults to an honestly disconnected GitHub project', async () => {
  const access = create(), projects = access.listProjects();
  assert.equal(projects.length, 2);
  assert.deepEqual(projects.map(project => project.repository), [null, null]);
  assert.ok(projects.every(project => project.repositoryState === 'unconfigured'));
  assert.equal(access.getProject('crimson-desert').issueLabel, 'game:crimson-desert');
  assert.equal(access.getProject('crimson-desert').branchPrefix, 'saverift/crimson-desert/');
  await access.assertAccess(null, {gameId: 'crimson-desert', action: 'discovery'});
  projects[0].packageRoots.push('private/');
  assert.equal(access.getProject('crimson-desert').packageRoots.length, 1);
  await denied(access.getMembership(null, 'synthetic'), 'DEVELOPER_SIGN_IN_REQUIRED');
});

test('two developers independently opt in to one game without gaining access to another', async () => {
  const access = create();
  assert.deepEqual(await access.getMembership(alice, 'synthetic'), {schema: MEMBERSHIP_SCHEMA, gameId: 'synthetic', state: 'disabled', role: 'contributor', revision: 0, updatedAt: null, authoringEnabled: false});
  const enrolled = await enable(access);
  assert.equal(enrolled.state, 'enabled'); assert.equal(enrolled.role, 'contributor');
  assert.equal((await access.assertAccess(alice, {gameId: 'synthetic', action: 'workspace.create'})).membershipRevision, 1);
  await denied(access.assertAccess(alice, {gameId: 'crimson-desert', action: 'workspace.create'}), 'GAME_ENROLLMENT_REQUIRED');
  await denied(access.assertAccess(bob, {gameId: 'synthetic', action: 'git.write'}), 'GAME_ENROLLMENT_REQUIRED');
  await enable(access, bob);
  assert.equal((await access.getMembership(bob, 'synthetic')).revision, 1);
  await access.optOut(alice, {gameId: 'synthetic', expectedRevision: 1});
  assert.equal((await access.getMembership(bob, 'synthetic')).state, 'enabled');
  assert.equal(JSON.stringify(enrolled).includes(alice.id), false);
  assert.equal(JSON.stringify(await access.listMemberships(alice)).includes(developerKey(alice)), false);
});

test('self-enrollment accepts no role, repository, principal or game-authority claims', async () => {
  const access = create();
  for (const field of ['role', 'repository', 'isAdmin', 'principal']) await denied(access.enroll(alice, {gameId: 'synthetic', expectedRevision: 0, [field]: 'maintainer'}), 'ENROLLMENT_INPUT_INVALID');
  await denied(access.enroll(alice, {gameId: 'missing', expectedRevision: 0}), 'GAME_PROJECT_NOT_FOUND');
  await denied(access.enroll(alice, {gameId: 'synthetic'}), 'ENROLLMENT_INPUT_INVALID');
  await denied(access.enroll(alice, {gameId: 'synthetic', expectedRevision: -1}), 'MEMBERSHIP_REVISION_REQUIRED');
  await enable(access, {...alice, gamertag: 'Nikitabananana', isAdmin: true});
  for (const action of ['contribution:review', 'contribution:merge']) await denied(access.assertAccess(alice, {gameId: 'synthetic', action}), 'GAME_ROLE_REQUIRED');
  for (const action of ['xbox:write', 'registry:promote', 'release:publish', 'platform:admin', 'unknown']) await denied(access.assertAccess(alice, {gameId: 'synthetic', action}), 'GAME_ACTION_FORBIDDEN');
});

test('revision checks reject stale writes and concurrent enrollment atomically', async () => {
  const access = create();
  const results = await Promise.allSettled([enable(access), enable(access)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'MEMBERSHIP_REVISION_CONFLICT');
  await denied(access.optOut(alice, {gameId: 'synthetic', expectedRevision: 0}), 'MEMBERSHIP_REVISION_CONFLICT');
  assert.equal((await access.getMembership(alice, 'synthetic')).revision, 1);
  // Repeated explicit opt-in is idempotent, but only at the current revision.
  assert.equal((await enable(access, alice, 'synthetic', 1)).revision, 1);
});

test('one CAS ledger enforces active project quotas even during concurrent cross-game opt-in', async () => {
  const access = create({maxEnabledGames: 1, maxMemberships: 2});
  const results = await Promise.allSettled([enable(access), enable(access, alice, 'crimson-desert')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'MEMBERSHIP_REVISION_CONFLICT');
  const memberships = await access.listMemberships(alice), occupied = memberships[0].gameId, other = occupied === 'synthetic' ? 'crimson-desert' : 'synthetic';
  await denied(enable(access, alice, other), 'MEMBERSHIP_QUOTA');
  await access.optOut(alice, {gameId: occupied, expectedRevision: 1});
  await enable(access, alice, other);
  assert.equal((await access.listMemberships(alice)).filter(value => value.authoringEnabled).length, 1);
});

test('captured jobs and previews remain revoked after opt-out and re-enrollment', async () => {
  const access = create(); await enable(access);
  const old = await access.captureGrant(alice, 'synthetic');
  assert.equal(await access.assertGrant(alice, old), true);
  await access.optOut(alice, {gameId: 'synthetic', expectedRevision: 1});
  await denied(access.assertGrant(alice, old), 'GAME_GRANT_REVOKED');
  for (const action of ['fixture:inspect', 'job:run', 'preview:read', 'git:commit']) await denied(access.assertAccess(alice, {gameId: 'synthetic', action}), 'GAME_ENROLLMENT_REQUIRED');
  const exported = await access.assertAccess(alice, {gameId: 'synthetic', action: 'source.export'});
  assert.equal(exported.ownSourceOnly, true); assert.equal(exported.fixturesAllowed, false);
  await enable(access, alice, 'synthetic', 2);
  await denied(access.assertGrant(alice, old), 'GAME_GRANT_REVOKED');
  assert.notEqual((await access.captureGrant(alice, 'synthetic')).epoch, old.epoch);
});

test('grants cannot cross principals or games, and unknown grant fields are rejected', async () => {
  const access = create(); await enable(access); await enable(access, bob); await enable(access, alice, 'crimson-desert');
  const grant = await access.captureGrant(alice, 'synthetic');
  await denied(access.assertGrant(bob, grant), 'GAME_GRANT_REVOKED');
  await denied(access.assertAccess(alice, {gameId: 'crimson-desert', action: 'job:run', capturedGrant: grant}), 'GAME_GRANT_REVOKED');
  await denied(access.assertGrant(alice, {...grant, fixtures: true}), 'GAME_GRANT_REVOKED');
  await access.assertAccess(alice, {gameId: 'synthetic', action: 'job:run', capturedGrant: grant});
});

test('suspension cannot be escaped by opting out or re-enrolling, and no gamertag bypasses administration', async () => {
  const access = create({isPlatformAdmin: actor => actor.id === admin.id}); await enable(access);
  const grant = await access.captureGrant(alice, 'synthetic');
  await denied(access.setState({...alice, gamertag: 'Nikitabananana', isPlatformAdmin: true}, alice, {gameId: 'synthetic', expectedRevision: 1, state: 'suspended'}), 'PLATFORM_ADMIN_REQUIRED');
  await access.setState(admin, alice, {gameId: 'synthetic', expectedRevision: 1, state: 'suspended'});
  assert.equal((await access.optOut(alice, {gameId: 'synthetic', expectedRevision: 2})).state, 'suspended');
  await denied(enable(access, alice, 'synthetic', 2), 'MEMBERSHIP_SUSPENDED');
  await denied(access.assertAccess(alice, {gameId: 'synthetic', action: 'preview:create'}), 'MEMBERSHIP_SUSPENDED');
  await denied(access.assertGrant(alice, grant), 'GAME_GRANT_REVOKED');
  await access.setState(admin, alice, {gameId: 'synthetic', expectedRevision: 2, state: 'disabled'});
  await enable(access, alice, 'synthetic', 3);
  await denied(access.assertGrant(alice, grant), 'GAME_GRANT_REVOKED');
});

test('separate host-assigned roles can review or maintain but never publish, promote or write Xbox', async () => {
  const access = create({isPlatformAdmin: actor => actor.id === admin.id}); await enable(access);
  const grant = await access.captureGrant(alice, 'synthetic');
  await denied(access.assignRole(alice, alice, {gameId: 'synthetic', expectedRevision: 1, role: 'maintainer'}), 'PLATFORM_ADMIN_REQUIRED');
  await access.assignRole(admin, alice, {gameId: 'synthetic', expectedRevision: 1, role: 'reviewer'});
  await access.assertAccess(alice, {gameId: 'synthetic', action: 'contribution:review'});
  await denied(access.assertGrant(alice, grant), 'GAME_GRANT_REVOKED');
  await denied(access.assertAccess(alice, {gameId: 'synthetic', action: 'contribution:merge'}), 'GAME_ROLE_REQUIRED');
  await access.assignRole(admin, alice, {gameId: 'synthetic', expectedRevision: 2, role: 'maintainer'});
  await access.assertAccess(alice, {gameId: 'synthetic', action: 'contribution:merge'});
  await denied(access.assertAccess(alice, {gameId: 'synthetic', action: 'registry:promote'}), 'GAME_ACTION_FORBIDDEN');
  await access.optOut(alice, {gameId: 'synthetic', expectedRevision: 3});
  assert.equal((await enable(access, alice, 'synthetic', 4)).role, 'contributor');
  assert.throws(() => roleAllows('maintainer', 'xbox:write'), {code: 'GAME_ACTION_FORBIDDEN'});
});

test('project configuration changes invalidate captured authoring grants', async () => {
  const store = createMemoryStore(), first = create({store}); await enable(first);
  const grant = await first.captureGrant(alice, 'synthetic');
  const projects = DEFAULT_GAME_PROJECTS.map(project => project.id === 'synthetic' ? {...project, capabilities: [...project.capabilities, 'new independently reviewed capability']} : project);
  const second = create({store, projects});
  await denied(second.assertGrant(alice, grant), 'GAME_GRANT_REVOKED');
  assert.notEqual(second.getProject('synthetic').projectDigest, first.getProject('synthetic').projectDigest);
});

test('source path binding rejects traversal, protected files and sibling packages', () => {
  const project = createProjectRegistry().get('synthetic');
  assert.equal(assertProjectPath(project, 'ecosystem/plugins/synthetic-extension/runtime/index.mjs'), 'ecosystem/plugins/synthetic-extension/runtime/index.mjs');
  for (const path of ['ecosystem/plugins/synthetic-game/../crimson-desert/connector.mjs', '/ecosystem/plugins/synthetic-game/runtime.mjs', 'ecosystem/plugins/synthetic-game/%2e%2e/file', 'ecosystem/plugins/synthetic-game\\runtime.mjs', 'ecosystem/plugins/synthetic-game//runtime.mjs']) assert.throws(() => assertProjectPath(project, path), {code: 'PROJECT_PATH_REJECTED'});
  for (const path of ['ecosystem/plugins/crimson-desert/connector.mjs', 'ecosystem/plugins/synthetic-game-other/runtime.mjs', 'ecosystem/plugins/synthetic-game/.github/workflows/publish.yml', 'ecosystem/plugins/synthetic-game/fixtures/player.json', 'ecosystem/plugins/synthetic-game/CODEOWNERS', 'ecosystem/plugins/synthetic-game/.env', 'ecosystem/plugins/synthetic-game/Tokens.json']) assert.throws(() => assertProjectPath(project, path), {code: 'PROJECT_PATH_FORBIDDEN'});
  // A mistaken broad host mapping must not turn game authorship into policy editing.
  for (const path of ['ecosystem/sdk/contracts.mjs', 'ecosystem/registry/promotion.mjs', 'ecosystem/workbench/service.mjs', 'ecosystem/collaboration/enrollment.mjs']) assert.throws(() => assertProjectPath({...project, packageRoots: ['ecosystem/']}, path), {code: 'PROJECT_PATH_FORBIDDEN'});
});

test('trusted project configuration pins repository identity and cannot accidentally map a production repository', () => {
  const base = DEFAULT_GAME_PROJECTS[1], repository = {id: '123456', owner: 'public-ecosystem', name: 'saverift-ecosystem', defaultBranch: 'main'};
  const project = createProjectRegistry([{...base, repository}]).get('synthetic');
  assert.equal(project.repository.id, '123456'); assert.equal(project.repository.url, 'https://github.com/public-ecosystem/saverift-ecosystem');
  assert.equal(project.repositoryState, 'configured');
  for (const bad of [{...repository, privateProduction: true}, {...repository, purpose: 'production'}, {...repository, id: ''}, {...repository, defaultBranch: '../main'}, {...repository, owner: 'somebody/else'}]) assert.throws(() => createProjectRegistry([{...base, repository: bad}]), {code: 'PROJECT_REPOSITORY_INVALID'});
  for (const id of ['constructor', 'prototype', '__proto__']) assert.throws(() => createProjectRegistry([{...base, id}]), {code: 'PROJECT_CONFIGURATION_INVALID'});
  const closed = create({projects: [{...base, enrollmentOpen: false}]});
  return denied(enable(closed), 'GAME_ENROLLMENT_CLOSED');
});

test('corrupt private membership records fail closed and do not replace another contributor identity', async () => {
  const store = createMemoryStore(), access = create({store}); await enable(access);
  const key = `collaboration/enrollments/${developerKey(alice)}`, row = await store.get(key);
  await store.put(key, {...row.value, developer: developerKey(bob)}, {ifMatch: row.etag});
  await denied(access.getMembership(alice, 'synthetic'), 'ENROLLMENT_RECORD_INVALID');
  await denied(enable(access, alice, 'synthetic', 1), 'ENROLLMENT_RECORD_INVALID');
  assert.equal((await access.getMembership(bob, 'synthetic')).revision, 0);
});
