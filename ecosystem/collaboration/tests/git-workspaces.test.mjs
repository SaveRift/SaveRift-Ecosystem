// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAllowedSourcePath, validateSourceFiles, sourceDigest, applySourceChanges, diffSourceFiles, threeWaySourceMerge, publicBranchWorkspace} from '../git-workspaces.mjs';

const root = 'ecosystem/plugins/synthetic-game/', project = {packageRoots: [root]}, path = name => root + name;
test('source editing is package-scoped and rejects private, binary, fixture and policy paths', () => {
  assert.equal(assertAllowedSourcePath(project, path('src/main.mjs')), path('src/main.mjs'));
  for (const rejected of ['../escape.mjs', 'ecosystem/sdk/api.mjs', path('fixtures/example.json'), path('consent/player.json'), path('.github/workflows/ci.yml'), path('save.dat'), path('trace.har'), path('cover.png'), path('private/customer.json'), path('MicrosoftGame.config')]) assert.throws(() => assertAllowedSourcePath(project, rejected), {name: 'CollaborationAccessError'});
  for (const content of ['bad\0source', '\ud800', '-----BEGIN ' + 'PRIVATE KEY-----']) assert.throws(() => validateSourceFiles({[path('main.mjs')]: content}, project), {code: 'SOURCE_CONTENT_REJECTED'});
});
test('files enforce case and directory collisions and byte limits', () => {
  for (const files of [{[path('Main.mjs')]: '', [path('main.mjs')]: ''}, {[path('src')]: '', [path('src/main.mjs')]: ''}]) assert.throws(() => validateSourceFiles(files, project), {code: 'SOURCE_PATH_COLLISION'});
  assert.throws(() => validateSourceFiles({[path('main.mjs')]: 'é'.repeat(524289)}, project), {code: 'SOURCE_CONTENT_REJECTED'});
  assert.throws(() => validateSourceFiles(Object.fromEntries(Array.from({length: 257}, (_, i) => [path(`${i}.mjs`), ''])), project), {code: 'SOURCE_LIMIT_EXCEEDED'});
});
test('changes preserve read-only inputs, support explicit deletion and produce stable digests', () => {
  const files = Object.freeze({[path('main.mjs')]: 'old', [path('README.md')]: 'keep'}), changes = Object.freeze([{path: path('main.mjs'), content: 'new'}, {path: path('extra.mjs'), content: ''}]);
  const next = applySourceChanges(files, changes, project);
  assert.equal(files[path('main.mjs')], 'old'); assert.equal(next[path('README.md')], 'keep');
  assert.equal(sourceDigest(next), sourceDigest(Object.fromEntries(Object.entries(next).reverse())));
  const diff = diffSourceFiles(files, next); assert.equal(diff.length, 2); assert.deepEqual(diff.map(value => value.path), [path('extra.mjs'), path('main.mjs')]);
  assert.equal(diff[0].beforeDigest, null); assert.equal(diff[0].after, ''); assert.match(diff[1].beforeDigest, /^[a-f0-9]{64}$/);
  assert.equal(own(applySourceChanges(next, [{path: path('extra.mjs'), after: null}], project), path('extra.mjs')), false);
  assert.throws(() => applySourceChanges(files, [{path: path('missing.mjs'), content: null}], project), {code: 'SOURCE_DELETE_MISSING'});
  assert.throws(() => applySourceChanges(files, [{path: path('MAIN.mjs'), content: 'replace'}], project), {code: 'SOURCE_PATH_COLLISION'});
});
const own = (value, key) => Object.hasOwn(value, key);
test('whole-file three-way merge combines independent edits and retains local conflict content', () => {
  const a = path('a.mjs'), b = path('b.mjs'), base = Object.freeze({[a]: 'base-a', [b]: 'base-b'}), local = Object.freeze({[a]: 'local-a', [b]: 'base-b'}), remote = Object.freeze({[a]: 'base-a', [b]: 'remote-b'});
  assert.deepEqual(threeWaySourceMerge(base, local, remote).files, {[a]: 'local-a', [b]: 'remote-b'});
  const conflict = threeWaySourceMerge(base, local, {[a]: 'remote-a', [b]: 'base-b'});
  assert.deepEqual(conflict.conflicts, [{path: a, base: 'base-a', local: 'local-a', remote: 'remote-a'}]); assert.equal(conflict.files[a], 'local-a');
  assert.equal(base[a], 'base-a'); assert.equal(remote[b], 'remote-b');
});
test('merge handles deletion and divergent additions without losing local edits', () => {
  const a = path('a.mjs');
  assert.deepEqual(threeWaySourceMerge({[a]: 'base'}, {}, {[a]: 'base'}).files, {});
  assert.deepEqual(threeWaySourceMerge({[a]: 'base'}, {[a]: 'base'}, {}).files, {});
  assert.deepEqual(threeWaySourceMerge({[a]: 'base'}, {}, {[a]: 'remote'}).conflicts, [{path: a, base: 'base', local: null, remote: 'remote'}]);
  const addition = threeWaySourceMerge({}, {[a]: 'local'}, {[a]: 'remote'}); assert.equal(addition.files[a], 'local'); assert.equal(addition.conflicts[0].base, null);
});
test('public workspace projection excludes private source, fixture, grant and review material', () => {
  const record = {id: 'branch1', gameId: 'synthetic', revision: 2, packageRoots: [root], repository: {id: '1', owner: 'saverift', name: 'ecosystem', token: 'secret'}, owner: 'private', files: {'save.dat': 'data'}, baseFiles: {secret: 'data'}, grants: ['private'], fixtures: ['private'], review: 'private', operation: {id: 'op', state: 'pending', body: 'private'}, pr: {number: 12, draft: true, body: 'private'}, evidenceState: 'invalidated'};
  const view = publicBranchWorkspace(record);
  assert.deepEqual(view, {id: 'branch1', gameId: 'synthetic', revision: 2, packageRoots: [root], evidenceState: 'invalidated', repository: {id: '1', owner: 'saverift', name: 'ecosystem'}, operation: {id: 'op', state: 'pending'}, pr: {number: 12, draft: true}});
  view.packageRoots.push('other/'); assert.equal(record.packageRoots.length, 1);
});
test('evidence projection exposes bounded source provenance without fixture references or result blobs', () => {
  const lock = path('package-lock.json'), record = {id: 'branch1', evidenceState: {state: 'needs_run', sourceDigest: 'a'.repeat(64), commitSha: 'b'.repeat(40), treeSha: 'c'.repeat(40), runnerVersion: null, reason: 'Source changed.', dependencyLockDigests: {[lock]: 'd'.repeat(64), [path('fixtures/requirements.lock')]: 'e'.repeat(64), [path('unrelated.mjs')]: 'f'.repeat(64)}, fixtureReferences: [{owner: 'private'}], results: {private: 'log'}}};
  const view = publicBranchWorkspace(record);
  assert.deepEqual(view.evidenceState, {state: 'needs_run', runnerVersion: null, reason: 'Source changed.', sourceDigest: 'a'.repeat(64), commitSha: 'b'.repeat(40), treeSha: 'c'.repeat(40), dependencyLockDigests: {[lock]: 'd'.repeat(64)}});
  view.evidenceState.dependencyLockDigests[lock] = '0'.repeat(64); assert.equal(record.evidenceState.dependencyLockDigests[lock], 'd'.repeat(64));
});
