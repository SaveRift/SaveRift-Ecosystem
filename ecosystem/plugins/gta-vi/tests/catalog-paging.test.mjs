// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertUiJson} from '../../../sdk/ui-bridge.mjs';
import {CATALOG_PAGE_LIMITS, listCatalogEntries} from '../src/shared/gta-vi-catalog.mjs';

const row = (i, detail = {}) => ({id: `synthetic-${i}`, name: {en: `Synthetic ${i}`},
  nativeIds: {modelHash32: `0x${i.toString(16).padStart(8, '0')}`},
  attributes: {identifierMetadata: {modelHash32: {domain: 'model', representation: 'hex', bitWidth: 32}}, ...detail}});
const catalog = (entries) => ({vehicles: {entries}});
const envelope = (page) => ({protocol: 'saverift.ui.v1', instanceId: 'i'.repeat(128),
  sequence: Number.MAX_SAFE_INTEGER, type: 'response', requestId: 'r'.repeat(128), ok: true, result: page});
function checkPage(page) {
  assert.ok(Buffer.byteLength(JSON.stringify(page)) <= CATALOG_PAGE_LIMITS.maxBytes);
  assertUiJson(envelope(page));
}
function allPages(entries) {
  const collected = [], pages = [];
  let offset = 0;
  do {
    const page = listCatalogEntries(catalog(entries), {category: 'vehicles', identifierDomain: 'model', offset, limit: 25});
    checkPage(page);
    assert.equal(page.limit, 25);
    assert.equal(page.total, entries.length);
    assert.ok(page.entries.length > 0);
    if (page.nextOffset !== null) assert.equal(page.nextOffset, offset + page.entries.length);
    collected.push(...page.entries); pages.push(page);
    offset = page.nextOffset;
  } while (offset !== null);
  assert.deepEqual(collected, entries);
  return pages;
}

test('ordinary pages preserve the requested count and expose exact continuation', () => {
  const entries = Array.from({length: 54}, (_, i) => row(i));
  const pages = allPages(entries);
  assert.deepEqual(pages.map(p => [p.offset, p.entries.length, p.nextOffset]), [[0, 25, 25], [25, 25, 50], [50, 4, null]]);
  const empty = listCatalogEntries(catalog(entries), {category: 'vehicles', offset: 100});
  assert.deepEqual(empty.entries, []); assert.equal(empty.nextOffset, null); checkPage(empty);
});

test('rich native witnesses use UTF-8 byte paging and retain every complete row', () => {
  const entries = Array.from({length: 37}, (_, i) => row(i, {
    nativeWitnesses: [{sourceRef: 'synthetic', location: 'é🙂'.repeat(1500), ordinal: i}],
    crosswalk: [{kind: 'synthetic', token: `TOKEN_${i}`, sourceRef: 'synthetic'}],
  }));
  const pages = allPages(entries);
  assert.ok(pages[0].entries.length < 25);
  assert.ok(pages.length > 2);
});

test('a complete 100 KiB entry fits while another entry waits for the next page', () => {
  const entries = [row(0, {nativeWitnesses: [{location: 'x'.repeat(100 * 1024)}]}), row(1, {nativeWitnesses: [{location: 'x'.repeat(16 * 1024)}]})];
  const pages = allPages(entries);
  assert.deepEqual(pages.map(p => p.entries.length), [1, 1]);
});

test('shape-heavy small JSON pages remain inside the UI node limit', () => {
  const entries = Array.from({length: 30}, (_, i) => row(i, {nativeWitnesses: Array(600).fill(null)}));
  const pages = allPages(entries);
  assert.ok(pages[0].entries.length < 25);
  assert.ok(Buffer.byteLength(JSON.stringify(pages[0])) < 60 * 1024);
});

test('an individual oversized or deeply nested entry fails explicitly without omission', () => {
  let nested = {};
  for (let i = 0; i < 22; i++) nested = {child: nested};
  for (const detail of [{nativeWitnesses: ['x'.repeat(CATALOG_PAGE_LIMITS.maxBytes)]},
    {nativeWitnesses: Array(CATALOG_PAGE_LIMITS.maxNodes).fill(null)}, {nativeWitnesses: nested}]) {
    const entries = [row(0), row(1, detail), row(2)];
    const first = listCatalogEntries(catalog(entries), {category: 'vehicles'});
    assert.equal(first.entries.length, 1); assert.equal(first.nextOffset, 1);
    assert.throws(() => listCatalogEntries(catalog(entries), {category: 'vehicles', offset: first.nextOffset}), {code: 'GTAVI_CATALOG_ENTRY_LIMIT'});
  }
});
