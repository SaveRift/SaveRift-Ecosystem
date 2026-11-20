// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGtaViPackage} from '../scripts/build.mjs';
import {createSaveBundle, LIMITS} from '../../../sdk/contracts.mjs';
import {sha256} from '../../../sdk/crypto.mjs';
import {createExecutionLock} from '../../../sdk/registry.mjs';
import {createPluginSession} from '../../../sdk/runner.mjs';
import {makeSyntheticJsav} from './synthetic-jsav.mjs';
import {loadCatalogData} from '../scripts/validate-catalog.mjs';

function largestCatalogPage(data) {
  let largest = null;
  for (const [category, group] of Object.entries(data.entities)) {
    for (let offset = 0; offset < group.entries.length; offset++) {
      const page = {category, entries: group.entries.slice(offset, offset + 25), total: group.entries.length, offset, limit: 25};
      const byteLength = Buffer.byteLength(JSON.stringify(page));
      if (!largest || byteLength > largest.byteLength) largest = {page, byteLength};
    }
  }
  assert.ok(largest);
  return largest;
}

test('one pinned GTA VI package inspects synthetic Xbox and PS5 JSAV without write authority', {timeout: 30000}, async () => {
  const pkg = await buildGtaViPackage({write: false});
  assert.equal(pkg.manifest.id, 'saverift.gta-vi');
  assert.deepEqual(pkg.manifest.gameTargets.map(target => target.platform), ['xbox', 'ps5']);
  assert.deepEqual(pkg.manifest.operations, []);
  const catalogData = loadCatalogData();
  const largest = largestCatalogPage(catalogData);
  assert.ok(largest.byteLength <= LIMITS.jsonBytes, 'Every possible 25-entry catalogue page must fit the isolated message limit');
  assert.ok(catalogData.entities.vehicles.entries.length > 25, 'Exercise catalogue pagination with reviewed vehicle observations');
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
      const firstPage = await session.call('query', [handle, {method: 'gtavi.catalog.list', params: {category: 'vehicles', offset: 0, limit: 100}}]);
      const nextPage = await session.call('query', [handle, {method: 'gtavi.catalog.list', params: {category: 'vehicles', offset: 25, limit: 25}}]);
      assert.equal(firstPage.limit, 25);
      assert.equal(firstPage.total, catalogData.entities.vehicles.entries.length);
      assert.equal(nextPage.offset, 25);
      assert.deepEqual(firstPage.entries.map(entry => entry.id), catalogData.entities.vehicles.entries.slice(0, 25).map(entry => entry.id));
      assert.deepEqual(nextPage.entries.map(entry => entry.id), catalogData.entities.vehicles.entries.slice(25, 50).map(entry => entry.id));
      for (const entry of [...firstPage.entries, ...nextPage.entries]) {
        if (!entry.id.includes(':rpf9-observation-')) continue;
        assert.deepEqual(entry.applicability, {platforms: ['xbox'], build: null});
        assert.equal(entry.attributes.runtimeAvailability, 'unverified');
      }
      const largestPage = await session.call('query', [handle, {method: 'gtavi.catalog.list', params: {category: largest.page.category, offset: largest.page.offset, limit: 25}}]);
      assert.deepEqual(largestPage, largest.page);
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
