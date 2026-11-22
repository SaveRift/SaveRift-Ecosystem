// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {getCatalogDetails, validateCatalogPresentations} from '../src/shared/gta-vi-details.mjs';
import {CATALOG_PAGE_LIMITS} from '../src/shared/gta-vi-catalog.mjs';
import {assertUiJson} from '../../../sdk/ui-bridge.mjs';

const specId = 'gta-vi:weapons:synthetic-spec', presetId = 'gta-vi:weapons:synthetic-preset';
function fixture() {
  const catalog = {weapons: {entries: [{id: specId, name: {en: 'Synthetic specification'}, applicability: {platforms: ['xbox'], build: null}, confidence: 'candidate',
    attributes: {reportedIdentifierMetadata: {referenceId: {domain: 'spec'}}}},
    {id: presetId, name: {en: 'Synthetic preset'}, applicability: {platforms: ['xbox'], build: null}, confidence: 'candidate'}]},
    items: {entries: [{id: 'gta-vi:items:legacy-reference', name: {en: 'Legacy reference'}, applicability: {platforms: ['xbox'], build: null}, confidence: 'observed'}]}};
  const sources = {schema: 'saverift.gta-vi.presentation-sources.v1', sources: [{id: 'synthetic-source', title: 'Synthetic data source', locator: 'synthetic-fixture'}]};
  const presentations = {weapons: {schema: 'saverift.gta-vi.presentation.v1', category: 'weapons',
    fieldDefinitions: {'synthetic-source': {damage: {index: 3, label: 'Damage', type: 'number', unit: null, sourceInterpreted: false}, range: {index: 4, label: 'Range', type: 'number', unit: 'm', sourceInterpreted: true}}},
    entries: [{catalogId: specId, sourceRef: 'synthetic-source', sourceRowPointer: '/e/7', publishedIdentifier: 'SPEC_EXACT', price: null,
      description: {en: 'Synthetic facts.', kind: 'generated-factual-summary'}, stats: [{key: 'damage', value: 0}, {key: 'range', value: 10.5}],
      properties: [], models: [{role: 'model', value: '0x0011223344556677', representation: 'hex64'}],
      media: [{url: 'https://example.invalid/source.webp', assetId: null, role: 'source-row-image'}]},
    {catalogId: presetId, sourceRef: 'synthetic-source', sourceRowPointer: '/e/8', stats: [], properties: [], relatedSpecCatalogIds: [specId]}]}};
  return {catalog, sources, presentations};
}
const envelope = result => ({protocol: 'saverift.ui.v1', instanceId: 'i'.repeat(128), sequence: Number.MAX_SAFE_INTEGER,
  type: 'response', requestId: 'r'.repeat(128), ok: true, result});

test('detail lookup expands shared field definitions with exact values, units and source pointers', () => {
  const f = fixture(), original = JSON.stringify(f);
  const result = getCatalogDetails(f.catalog, f.presentations, f.sources, {catalogId: specId});
  assert.equal(result.available, true); assert.equal(result.catalogId, specId);
  assert.deepEqual(result.details.stats[0], {index: 3, label: 'Damage', type: 'number', unit: null, sourceInterpreted: false,
    key: 'damage', value: 0, sourceRef: 'synthetic-source', valuePointer: '/e/7/4/3', descriptorPointer: '/f/3'});
  assert.equal(result.details.stats[1].sourceInterpreted, true);
  assert.equal(result.details.price, null);
  assert.equal(result.details.models[0].value, '0x0011223344556677');
  assert.equal(result.details.media[0].assetId, null);
  assert.deepEqual(result.sources, f.sources.sources);
  assertUiJson(envelope(result));
  assert.equal(JSON.stringify(f), original, 'Queries must not mutate stored data or identities');
});

test('preset details retain the spec relationship without borrowing its statistics or thumbnail', () => {
  const f = fixture();
  const result = getCatalogDetails(f.catalog, f.presentations, f.sources, {catalogId: presetId});
  assert.deepEqual(result.details.relatedSpecCatalogIds, [specId]);
  assert.deepEqual(result.details.stats, []); assert.equal(result.details.media, undefined);
  assert.deepEqual(validateCatalogPresentations(f.catalog, f.presentations, f.sources), {entries: 2, sources: 1});
});

test('translated display values retain exact escaped translation-table pointers', () => {
  const f = fixture(), key = 'class/~';
  f.presentations.weapons.fieldDefinitions['synthetic-source'][key] = {index: 9, label: 'Class', type: 'enum'};
  f.presentations.weapons.entries[0].properties = [{key, value: '~raw/value', displayValue: 'Readable class'}];
  const result = getCatalogDetails(f.catalog, f.presentations, f.sources, {catalogId: specId});
  assert.equal(result.details.properties[0].value, '~raw/value');
  assert.equal(result.details.properties[0].displayValue, 'Readable class');
  assert.equal(result.details.properties[0].displayValuePointer, '/tr/class~1~0/~0raw~1value');
});

test('missing detail data is distinct from an unknown identity or a raw identifier', () => {
  const f = fixture();
  const result = getCatalogDetails(f.catalog, f.presentations, f.sources, {catalogId: 'gta-vi:items:legacy-reference'});
  assert.equal(result.available, false); assert.equal(result.details, null); assert.deepEqual(result.sources, []);
  assert.throws(() => getCatalogDetails(f.catalog, f.presentations, f.sources, {catalogId: 'gta-vi:items:unknown'}), {code: 'GTAVI_CATALOG_ENTRY_UNKNOWN'});
  for (const catalogId of ['SPEC_EXACT', 123, '', 'gta-vi:weapons:SYNTHETIC-SPEC']) {
    assert.throws(() => getCatalogDetails(f.catalog, f.presentations, f.sources, {catalogId}), {code: 'GTAVI_CATALOG_ID_INVALID'});
  }
});

test('complete detail responses enforce UTF-8, node and depth budgets without truncation', () => {
  for (const value of ['é🙂'.repeat(30000), Array(CATALOG_PAGE_LIMITS.maxNodes).fill(null),
    Array.from({length: 23}).reduce(value => ({child: value}), null)]) {
    const f = fixture(); f.presentations.weapons.entries[0].extraEvidence = value;
    assert.throws(() => getCatalogDetails(f.catalog, f.presentations, f.sources, {catalogId: specId}), {code: 'GTAVI_CATALOG_DETAILS_LIMIT'});
  }
});

test('build validation rejects orphan, duplicate, wrong-domain and unknown-source details', () => {
  const cases = [
    [f => { f.presentations.weapons.entries[0].catalogId = 'gta-vi:weapons:orphan'; }, 'GTAVI_CATALOG_ENTRY_UNKNOWN'],
    [f => { f.presentations.weapons.entries.push({...f.presentations.weapons.entries[0]}); }, 'GTAVI_PRESENTATION_ID_INVALID'],
    [f => { f.presentations.weapons.entries[0].sourceRef = 'unknown'; }, 'GTAVI_PRESENTATION_SOURCE_UNKNOWN'],
    [f => { f.presentations.weapons.entries[0].stats[0].key = 'unknown'; }, 'GTAVI_PRESENTATION_FIELD_UNKNOWN'],
    [f => { f.presentations.weapons.entries[1].relatedSpecCatalogIds = [presetId]; }, 'GTAVI_PRESENTATION_RELATION_INVALID'],
  ];
  for (const [change, code] of cases) { const f = fixture(); change(f); assert.throws(() => validateCatalogPresentations(f.catalog, f.presentations, f.sources), {code}); }
});
