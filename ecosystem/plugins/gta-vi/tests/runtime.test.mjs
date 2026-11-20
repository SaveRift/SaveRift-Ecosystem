// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGtaViPackage} from '../scripts/build.mjs';
import {createSaveBundle} from '../../../sdk/contracts.mjs';
import {sha256} from '../../../sdk/crypto.mjs';
import {createExecutionLock} from '../../../sdk/registry.mjs';
import {createPluginSession} from '../../../sdk/runner.mjs';
import {makeSyntheticJsav} from './synthetic-jsav.mjs';

test('one pinned GTA VI package inspects synthetic Xbox and PS5 JSAV without write authority', {timeout: 30000}, async () => {
  const pkg = await buildGtaViPackage({write: false});
  assert.equal(pkg.manifest.id, 'saverift.gta-vi');
  assert.deepEqual(pkg.manifest.gameTargets.map(target => target.platform), ['xbox', 'ps5']);
  assert.deepEqual(pkg.manifest.operations, []);
  const bytes = new Uint8Array(makeSyntheticJsav());
  const artifact = {id: 'synthetic-memory', logicalPath: 'memory.dat', role: 'memory', byteLength: bytes.length, sha256: sha256(bytes)};
  const lock = createExecutionLock({connector: {id: pkg.manifest.id, version: pkg.manifest.version, digest: pkg.packageDigest}});
  for (const platform of ['xbox', 'ps5']) {
    const bundle = createSaveBundle([artifact], {hints: {gameIdentity: 'grand-theft-auto-vi', platform}});
    const session = await createPluginSession({package: pkg, bundle, artifacts: new Map([[artifact.id, bytes]]), executionLock: lock});
    try {
      assert.equal((await session.call('detect', [bundle])).state, 'supported');
      const handle = await session.call('open', [bundle]);
      assert.equal(handle.platform, platform);
      assert.equal(handle.codeBlockCount, 1);
      assert.equal(handle.scriptBlockCount, 1);
      assert.equal((await session.call('query', [handle, {method: 'gtavi.inspect'}])).platform, platform);
      assert.equal((await session.call('query', [handle, {method: 'gtavi.catalog.categories'}])).categories.length, 9);
      const fields = await session.call('query', [handle, {method: 'gtavi.fields.list', params: {offset: 0, limit: 50}}]);
      assert.equal(fields.total, handle.fieldCount);
      await assert.rejects(session.call('plan', [bundle, {operations: [], operationDigest: sha256('empty')}]));
      await session.call('close', [handle]);
    } finally { session.close(); }
  }
  assert.equal(sha256(bytes), artifact.sha256);
});

test('GTA VI runtime refuses an unverified or foreign bundle identity', {timeout: 30000}, async () => {
  const pkg = await buildGtaViPackage({write: false});
  const bytes = new Uint8Array(makeSyntheticJsav());
  const artifact = {id: 'synthetic-memory', logicalPath: 'memory.dat', role: 'memory', byteLength: bytes.length, sha256: sha256(bytes)};
  const lock = createExecutionLock({connector: {id: pkg.manifest.id, version: pkg.manifest.version, digest: pkg.packageDigest}});
  for (const hints of [{platform: 'xbox'}, {gameIdentity: 'another-game', platform: 'xbox'}, {gameIdentity: 'grand-theft-auto-vi', platform: 'pc'}]) {
    const bundle = createSaveBundle([artifact], {hints});
    const session = await createPluginSession({package: pkg, bundle, artifacts: new Map([[artifact.id, bytes]]), executionLock: lock});
    try { assert.notEqual((await session.call('detect', [bundle])).state, 'supported'); }
    finally { session.close(); }
  }
});
