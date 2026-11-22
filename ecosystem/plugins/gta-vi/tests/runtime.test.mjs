// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGtaViPackage} from '../scripts/build.mjs';
import {createSaveBundle, LIMITS} from '../../../sdk/contracts.mjs';
import {sha256} from '../../../sdk/crypto.mjs';
import {createExecutionLock} from '../../../sdk/registry.mjs';
import {createPluginSession} from '../../../sdk/runner.mjs';
import {makeSyntheticJsav} from './synthetic-jsav.mjs';
import {loadCatalogData} from '../scripts/validate-catalog.mjs';
import {listCatalogEntries} from '../src/shared/gta-vi-catalog.mjs';
import {getCatalogDetails} from '../src/shared/gta-vi-details.mjs';
import {assertUiJson} from '../../../sdk/ui-bridge.mjs';

function largestCatalogPage(data) {
  let largest = null;
  for (const [category, group] of Object.entries(data.entities)) {
    for (let offset = 0; offset < group.entries.length; offset++) {
      const page = listCatalogEntries(data.entities, {category, offset, limit: 25});
      assertUiJson({protocol: 'saverift.ui.v1', instanceId: 'i'.repeat(128), sequence: Number.MAX_SAFE_INTEGER,
        type: 'response', requestId: 'r'.repeat(128), ok: true, result: page});
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
  const presentationData = Object.fromEntries(['vehicles', 'weapons', 'items'].map(category => [category,
    JSON.parse(readFileSync(new URL(`../data/details/${category}.json`, import.meta.url), 'utf8'))]));
  const presentationSources = JSON.parse(readFileSync(new URL('../data/details/sources.json', import.meta.url), 'utf8'));
  const modulePaths = Object.keys(pkg.files).filter(path => path.startsWith('runtime/catalog/')).sort();
  assert.deepEqual(modulePaths, Object.keys(catalogData.entities).map(category => `runtime/catalog/${category}.mjs`).sort());
  for (const [category, document] of Object.entries(catalogData.entities)) {
    const source = pkg.files[`runtime/catalog/${category}.mjs`];
    assert.ok(Buffer.byteLength(source) <= LIMITS.sourceBytes, `${category} must fit its own source budget`);
    assert.ok(source.startsWith('export default ') && source.endsWith(';\n'));
    assert.deepEqual(JSON.parse(source.slice('export default '.length, -2)), document, `${category} must retain its complete JSON data`);
  }
  assert.ok(Buffer.byteLength(pkg.files['runtime/connector.mjs']) <= LIMITS.sourceBytes);
  assert.deepEqual(Object.keys(pkg.files).filter(path => path.startsWith('runtime/details/')).sort(),
    ['items', 'sources', 'vehicles', 'weapons'].map(name => `runtime/details/${name}.mjs`));
  for (const [name, document] of Object.entries({...presentationData, sources: presentationSources})) {
    const source = pkg.files[`runtime/details/${name}.mjs`];
    assert.ok(Buffer.byteLength(source) <= LIMITS.sourceBytes);
    assert.deepEqual(JSON.parse(source.slice('export default '.length, -2)), document, `${name} must retain complete presentation data`);
  }
  const detailExamples = [...Object.values(presentationData).map(document => document.entries.find(entry => entry.stats.length)),
    presentationData.weapons.entries.find(entry => entry.relatedSpecCatalogIds?.length)];
  assert.ok(detailExamples.every(Boolean));
  const largest = largestCatalogPage(catalogData);
  assert.ok(largest.byteLength <= LIMITS.jsonBytes, 'Every bounded catalogue page must fit the isolated message limit');
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
      const categories = (await session.call('query', [handle, {method: 'gtavi.catalog.categories'}])).categories;
      assert.deepEqual(categories.map(item => [item.category, item.count]).sort(), Object.entries(catalogData.entities).map(([category, data]) => [category, data.entries.length]).sort());
      const firstPage = await session.call('query', [handle, {method: 'gtavi.catalog.list', params: {category: 'vehicles', offset: 0, limit: 100}}]);
      assert.notEqual(firstPage.nextOffset, null);
      const nextPage = await session.call('query', [handle, {method: 'gtavi.catalog.list', params: {category: 'vehicles', offset: firstPage.nextOffset, limit: 25}}]);
      assert.equal(firstPage.limit, 25);
      assert.equal(firstPage.total, catalogData.entities.vehicles.entries.length);
      assert.equal(nextPage.offset, firstPage.entries.length);
      assert.deepEqual(firstPage, listCatalogEntries(catalogData.entities, {category: 'vehicles', offset: 0, limit: 100}));
      assert.deepEqual(nextPage, listCatalogEntries(catalogData.entities, {category: 'vehicles', offset: firstPage.nextOffset, limit: 25}));
      for (const entry of [...firstPage.entries, ...nextPage.entries]) {
        if (!entry.id.includes(':rpf9-observation-')) continue;
        assert.deepEqual(entry.applicability, {platforms: ['xbox'], build: null});
        assert.equal(entry.attributes.runtimeAvailability, 'unverified');
      }
      const largestPage = await session.call('query', [handle, {method: 'gtavi.catalog.list', params: {category: largest.page.category, offset: largest.page.offset, limit: 25}}]);
      assert.deepEqual(largestPage, largest.page);
      for (const entry of detailExamples) {
        const result = await session.call('query', [handle, {method: 'gtavi.catalog.details', params: {catalogId: entry.catalogId}}]);
        assert.deepEqual(result, getCatalogDetails(catalogData.entities, presentationData, presentationSources, {catalogId: entry.catalogId}));
        assert.equal(result.available, true);
        assertUiJson({protocol: 'saverift.ui.v1', instanceId: 'details', sequence: 1, type: 'response', requestId: 'request', ok: true, result});
        assert.ok(result.details.media.every(media => media.assetId === null), 'Research image URLs are not silently authorized as runtime assets');
      }
      const legacyId = catalogData.entities.characters.entries[0].id;
      const legacy = await session.call('query', [handle, {method: 'gtavi.catalog.details', args: {catalogId: legacyId}}]);
      assert.equal(legacy.available, false); assert.equal(legacy.details, null);
      await assert.rejects(session.call('query', [handle, {method: 'gtavi.catalog.details', params: {catalogId: 'gta-vi:items:unknown'}}]));
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
