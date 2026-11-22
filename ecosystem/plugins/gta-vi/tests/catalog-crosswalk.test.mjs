// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCatalogData} from '../scripts/validate-catalog.mjs';
import {listCatalogEntries} from '../src/shared/gta-vi-catalog.mjs';

// Synthetic public fixtures only: these values make no game-identity claims.
const metadata = (domain) => ({domain, representation: 'hex', bitWidth: 32});
function fixture() {
  return {
    catalog: {schema: 'saverift.gta-vi.catalog.v1', id: 'synthetic', version: '1', categories: ['vehicles'], platforms: ['xbox']},
    sources: {schema: 'saverift.gta-vi.sources.v1', sources: [{
      id: 'synthetic-source', kind: 'synthetic', title: 'Synthetic test data',
      locator: 'synthetic:catalog-crosswalk', revision: '1', license: 'Apache-2.0',
      attribution: 'SaveRift tests', allowedUse: 'public synthetic test fixture',
    }]},
    entities: {vehicles: {schema: 'saverift.gta-vi.entities.v1', category: 'vehicles', entries: [{
      id: 'gta-vi:vehicles:synthetic-observation', name: {en: 'Observed synthetic model identifier'},
      nativeIds: {modelHash32: '0x00000001', configurationId: 'Raiden'},
      attributes: {
        identifierMetadata: {modelHash32: metadata('model')}, editorReady: false, saveMapping: 'unvalidated',
        crosswalk: [{kind: 'website-label', nativeIdKey: 'modelHash32', sourceRef: 'synthetic-source',
          sourceRecordId: 'synthetic-label-1', label: 'Synthetic label', matchMethod: 'literal_exact', confidence: 'candidate'}],
      },
      confidence: 'observed', applicability: {platforms: ['xbox'], build: null},
      evidence: [{sourceRef: 'synthetic-source', location: 'synthetic record 1; model field', method: 'synthetic fixture'}],
    }]}},
    mappings: {xbox: {schema: 'saverift.gta-vi.save-mappings.v1', platform: 'xbox', entries: []}},
  };
}
const entry = (data) => data.entities.vehicles.entries[0];
const crosswalk = (data) => entry(data).attributes.crosswalk[0];
function reportedFixture(value = 'Hello', representation = 'literal', bitWidth = null, domain = 'spec') {
  const data = fixture();
  entry(data).nativeIds = {referenceId: value, referenceNamespace: `website-reported:GTA.ZONE:${domain}`};
  entry(data).confidence = 'candidate';
  entry(data).attributes = {
    reportedIdentifierMetadata: {referenceId: {domain, representation, bitWidth, confidence: 'candidate'}},
    editorReady: false, saveMapping: 'unvalidated',
  };
  return data;
}

test('typed native observation and candidate label retain separate confidence and exact strings', () => {
  const data = fixture();
  assert.deepEqual(validateCatalogData(data), {categories: 1, sources: 1, entities: 1, saveMappings: 0});
  assert.equal(entry(data).nativeIds.modelHash32, '0x00000001');
  assert.equal(entry(data).nativeIds.configurationId, 'Raiden');
  assert.equal(entry(data).confidence, 'observed');
  assert.equal(crosswalk(data).confidence, 'candidate');
  assert.equal(entry(data).attributes.editorReady, false);
});

test('native hashes reject truncated, overflowing, decimal, and numeric representations', () => {
  for (const value of ['0x1', '0x100000000', '4294967295', '-1', 1, 9007199254740992]) {
    const data = fixture();
    entry(data).nativeIds.modelHash32 = value;
    assert.throws(() => validateCatalogData(data), /32-bit native hash|lossless strings/);
  }
  for (const value of ['0x00000000', '0xffffffff', '0xAbCdEf01']) {
    const data = fixture();
    entry(data).nativeIds.modelHash32 = value;
    validateCatalogData(data);
    assert.equal(entry(data).nativeIds.modelHash32, value);
  }
});

test('typed identifiers require the correct domain, bit width, and existing ID', () => {
  for (const mutate of [
    (item) => { delete item.attributes.identifierMetadata; },
    (item) => { item.attributes.identifierMetadata.modelHash32.domain = 'preset'; },
    (item) => { item.attributes.identifierMetadata.modelHash32.bitWidth = 64; },
    (item) => { item.attributes.identifierMetadata.modelHash32.representation = 'number'; },
    (item) => { item.attributes.identifierMetadata.weaponSpecHash32 = metadata('spec'); },
    (item) => { item.attributes.identifierMetadata = []; },
  ]) {
    const data = fixture();
    mutate(entry(data));
    assert.throws(() => validateCatalogData(data), /identifier metadata/);
  }
  for (const nativeIds of [null, [], ['0x00000001']]) {
    const data = fixture();
    entry(data).nativeIds = nativeIds;
    assert.throws(() => validateCatalogData(data), /lossless strings/);
  }
});

test('legacy configuration IDs need no invented hash or domain', () => {
  const data = fixture();
  delete entry(data).nativeIds.modelHash32;
  delete entry(data).attributes.identifierMetadata;
  delete entry(data).attributes.crosswalk;
  validateCatalogData(data);
  assert.deepEqual(entry(data).nativeIds, {configurationId: 'Raiden'});
});

test('crosswalk rows require an existing typed ID and precise registered provenance', () => {
  for (const mutate of [
    (item) => { item.sourceRef = 'missing-source'; },
    (item) => { delete item.sourceRecordId; },
    (item) => { item.sourceRecordId = ' '; },
    (item) => { item.nativeIdKey = 'weaponSpecHash32'; },
    (item) => { item.nativeIdKey = 'configurationId'; },
    (item) => { item.confidence = 'unknown'; },
    (item) => { item.matchMethod = 'similar_english_name'; },
  ]) {
    const data = fixture();
    mutate(crosswalk(data));
    assert.throws(() => validateCatalogData(data), /crosswalk/);
  }
  const located = fixture();
  delete crosswalk(located).sourceRecordId;
  crosswalk(located).location = 'synthetic page; row 1';
  validateCatalogData(located);
});

test('token/hash relations preserve raw case and declare the hash transformation', () => {
  const data = fixture();
  entry(data).nativeIds.modelHash32 = '0xa4d99b7d';
  entry(data).attributes.crosswalk = [{kind: 'native-token-hash', nativeIdKey: 'modelHash32',
    sourceRef: 'synthetic-source', location: 'synthetic token observation',
    token: 'Raiden', namespace: 'synthetic-model', matchMethod: 'joaat32_lowercase', confidence: 'candidate'}];
  validateCatalogData(data);
  assert.equal(crosswalk(data).token, 'Raiden');
  crosswalk(data).matchMethod = 'joaat32_exact';
  assert.throws(() => validateCatalogData(data), /crosswalk hash calculation mismatch/);
  crosswalk(data).matchMethod = 'literal_exact';
  assert.throws(() => validateCatalogData(data), /native-token-hash/);
});

test('a candidate display label cannot inherit the observed native ID confidence', () => {
  const data = fixture();
  entry(data).name.en = crosswalk(data).label;
  assert.throws(() => validateCatalogData(data), /candidate display label/);
  entry(data).confidence = 'candidate';
  validateCatalogData(data);
});

test('automatic website hashes preserve the exact compared text and remain candidate joins', () => {
  const data = fixture();
  entry(data).nativeIds.modelHash32 = '0xc8fd181b';
  Object.assign(crosswalk(data), {label: 'Synthetic friendly name', comparedText: 'Hello',
    namespace: 'website_slug', matchMethod: 'joaat32_lowercase', confidence: 'candidate'});
  validateCatalogData(data);
  assert.equal(crosswalk(data).comparedText, 'Hello');
  assert.equal(crosswalk(data).label, 'Synthetic friendly name');
  assert.equal(crosswalk(data).namespace, 'website_slug');
  for (const mutate of [
    (row) => { delete row.comparedText; },
    (row) => { row.comparedText = 'Héllo'; },
    (row) => { row.comparedText = 'wrong'; },
    (row) => { row.matchMethod = 'joaat32_exact'; },
    (row) => { row.confidence = 'observed'; },
    (row) => { row.confidence = 'verified'; },
  ]) {
    const changed = structuredClone(data);
    mutate(crosswalk(changed));
    assert.throws(() => validateCatalogData(changed), /website/);
  }
  crosswalk(data).matchMethod = 'literal_exact';
  crosswalk(data).confidence = 'verified';
  delete crosswalk(data).comparedText;
  validateCatalogData(data);
});

test('reported website identifiers retain candidate scope and lossless 32/64-bit values', () => {
  for (const [value, representation, bitWidth] of [
    ['Hello', 'literal', null], ['0x00000001', 'hex', 32], ['0xFFFFFFFFFFFFFFFF', 'hex', 64],
  ]) {
    const data = reportedFixture(value, representation, bitWidth);
    validateCatalogData(data);
    const result = listCatalogEntries(data.entities, {category: 'vehicles', nativeIdKey: 'referenceId', nativeIdValue: value, identifierDomain: 'spec'});
    assert.equal(result.total, 1);
    assert.equal(result.entries[0].nativeIds.referenceId, value);
    assert.equal(result.entries[0].confidence, 'candidate');
    assert.equal(result.entries[0].nativeIds.weaponSpecHash32, undefined);
    assert.equal(listCatalogEntries(data.entities, {category: 'vehicles', identifierDomain: 'spec'}).total, 1);
    assert.equal(listCatalogEntries(data.entities, {category: 'vehicles', identifierDomain: 'model'}).total, 0);
  }
});

test('published website hex32 values compare numerically while retaining their original case', () => {
  const data = fixture();
  entry(data).nativeIds.modelHash32 = '0xabcdef01';
  Object.assign(crosswalk(data), {comparedText: '0xABCDEF01', matchMethod: 'hash32_value_exact'});
  validateCatalogData(data);
  assert.equal(crosswalk(data).comparedText, '0xABCDEF01');
  for (const value of ['0xabcdef02', '0x1', '0x00000000abcdef01', 'abcdef01']) {
    const changed = structuredClone(data);
    crosswalk(changed).comparedText = value;
    assert.throws(() => validateCatalogData(changed), /website hash32 value match/);
  }
  crosswalk(data).confidence = 'verified';
  assert.throws(() => validateCatalogData(data), /automatic website hash/);
});

test('reported identifiers reject namespace, confidence, representation, and width errors', () => {
  for (const mutate of [
    (item) => { item.confidence = 'observed'; },
    (item) => { item.nativeIds.referenceNamespace = 'WeaponSpec'; },
    (item) => { item.nativeIds.referenceNamespace = 'website-reported:GTA.ZONE:item'; },
    (item) => { item.attributes.reportedIdentifierMetadata.referenceId.confidence = 'verified'; },
    (item) => { item.attributes.reportedIdentifierMetadata.referenceId.domain = 'loadout'; },
    (item) => { item.attributes.reportedIdentifierMetadata.referenceId.bitWidth = 32; },
    (item) => { item.nativeIds.referenceId = ' '; },
    (item) => { item.nativeIds.referenceId = '0x00000001'; },
  ]) {
    const data = reportedFixture();
    mutate(entry(data));
    assert.throws(() => validateCatalogData(data), /reported identifier/);
  }
  for (const [value, width] of [['0x1', 32], ['0x100000000', 32], ['0x00000001', 64], ['0x00000001', null]]) {
    assert.throws(() => validateCatalogData(reportedFixture(value, 'hex', width)), /reported identifier hash width/);
  }
});

test('reported literals may have derived candidates while hexadecimal identifiers cannot be rehashed', () => {
  const data = reportedFixture();
  entry(data).attributes.hashCandidates = [{nativeIdKey: 'referenceId', domain: 'spec', algorithm: 'joaat32', transform: 'exact', value: '0x715ce7ec', confidence: 'candidate'}];
  validateCatalogData(data);
  const hexadecimal = reportedFixture('0x715ce7ec', 'hex', 32);
  entry(hexadecimal).attributes.hashCandidates = structuredClone(entry(data).attributes.hashCandidates);
  assert.throws(() => validateCatalogData(hexadecimal), /cannot hash a hexadecimal identifier/);
  const originalLiteral = fixture();
  entry(originalLiteral).nativeIds.configurationId = '0x715ce7ec';
  entry(originalLiteral).attributes.hashCandidates = [{...entry(data).attributes.hashCandidates[0], nativeIdKey: 'configurationId'}];
  assert.throws(() => validateCatalogData(originalLiteral), /cannot hash a hexadecimal identifier/);
});

test('website-native-id associations require exact literal equality and candidate confidence', () => {
  const data = reportedFixture();
  const row = {kind: 'website-native-id', nativeIdKey: 'referenceId', sourceRef: 'synthetic-source',
    sourceRecordId: 'synthetic-native-id-1', comparedText: 'Hello', label: 'Synthetic website label',
    matchMethod: 'literal_exact', confidence: 'candidate'};
  entry(data).attributes.crosswalk = [row];
  validateCatalogData(data);
  for (const mutate of [
    (item) => { item.comparedText = 'hello'; },
    (item) => { delete item.comparedText; },
    (item) => { item.confidence = 'verified'; },
    (item) => { item.matchMethod = 'joaat32_exact'; },
    (item) => { item.token = 'Hello'; },
  ]) {
    const changed = structuredClone(data);
    mutate(crosswalk(changed));
    assert.throws(() => validateCatalogData(changed), /website-native-id/);
  }
  const observed = fixture();
  entry(observed).nativeIds.referenceId = 'Hello';
  entry(observed).nativeIds.referenceNamespace = 'WeaponSpec';
  entry(observed).attributes.crosswalk = [structuredClone(row)];
  validateCatalogData(observed);
  assert.equal(entry(observed).confidence, 'observed');
  assert.equal(entry(observed).name.en, 'Observed synthetic model identifier');
});

test('derived hashes are recalculated from the exact source token without becoming native IDs', () => {
  const data = fixture();
  entry(data).nativeIds.configurationId = 'Hello';
  entry(data).attributes.hashCandidates = [
    {nativeIdKey: 'configurationId', domain: 'model', algorithm: 'joaat32', transform: 'exact', value: '0x715ce7ec', confidence: 'candidate'},
    {nativeIdKey: 'configurationId', domain: 'model', algorithm: 'joaat32', transform: 'lowercase', value: '0xc8fd181b', confidence: 'candidate'},
  ];
  const before = structuredClone(entry(data).nativeIds);
  validateCatalogData(data);
  assert.deepEqual(entry(data).nativeIds, before);
  assert.equal(entry(data).confidence, 'observed');
  entry(data).nativeIds.configurationId = 'hello';
  entry(data).attributes.hashCandidates[0].value = '0xc8fd181b';
  validateCatalogData(data);
  assert.equal(entry(data).attributes.hashCandidates.length, 2, 'Equal values with different transforms remain separate');
});

test('hash candidates reject incorrect calculations, non-ASCII input, promotion, and duplicate transforms', () => {
  for (const mutate of [
    (item) => { item.attributes.hashCandidates[0].value = '0xa4d99b7d'; },
    (item) => { item.attributes.hashCandidates[0].value = '0x1'; },
    (item) => { item.attributes.hashCandidates[0].confidence = 'observed'; },
    (item) => { item.attributes.hashCandidates[0].algorithm = 'sha256'; },
    (item) => { item.attributes.hashCandidates[0].transform = 'uppercase'; },
    (item) => { item.attributes.hashCandidates[0].domain = 'loadout'; },
    (item) => { item.attributes.hashCandidates[0].nativeIdKey = 'missingId'; },
    (item) => { item.attributes.hashCandidates[0].nativeIdKey = 'modelHash32'; },
    (item) => { item.nativeIds.configurationId = 'Raïden'; },
    (item) => { item.attributes.hashCandidates.push(structuredClone(item.attributes.hashCandidates[0])); },
    (item) => { item.attributes.hashCandidates = Array(11).fill(item.attributes.hashCandidates[0]); },
  ]) {
    const data = fixture();
    entry(data).attributes.hashCandidates = [{nativeIdKey: 'configurationId', domain: 'model', algorithm: 'joaat32', transform: 'exact', value: '0x3da093a7', confidence: 'candidate'}];
    mutate(entry(data));
    assert.throws(() => validateCatalogData(data), /hash candidate/);
  }
});

test('verified crosswalk wording does not make a candidate save link editable', () => {
  const data = fixture();
  crosswalk(data).confidence = 'verified';
  data.mappings.xbox.entries.push({
    id: 'gta-vi:save-field:synthetic-model', targetId: entry(data).id,
    format: 'synthetic', fieldHash: '0x00000002', preimage: 'SyntheticModel',
    confidence: 'candidate', editable: true, applicability: {platforms: ['xbox'], build: null},
    evidence: structuredClone(entry(data).evidence),
  });
  assert.throws(() => validateCatalogData(data), /unverified editable/);
});

test('exact native-ID queries keep case-distinct identifiers separate', () => {
  const data = fixture();
  const lower = structuredClone(entry(data));
  lower.id = 'gta-vi:vehicles:synthetic-lowercase';
  lower.nativeIds.configurationId = 'raiden';
  data.entities.vehicles.entries.push(lower);
  const result = listCatalogEntries(data.entities, {category: 'vehicles', nativeIdKey: 'configurationId', nativeIdValue: 'Raiden'});
  assert.equal(result.total, 1);
  assert.equal(result.entries[0].id, entry(data).id);
  assert.equal(listCatalogEntries(data.entities, {category: 'vehicles', nativeIdKey: 'configurationId', nativeIdValue: 'RAIDEN'}).total, 0);
});

test('domain filters bind to the requested ID, not an unrelated hash on the same entry', () => {
  const data = fixture();
  entry(data).nativeIds.weaponSpecHash32 = '0x00000001';
  entry(data).attributes.identifierMetadata.weaponSpecHash32 = metadata('spec');
  const params = {category: 'vehicles', nativeIdKey: 'modelHash32', nativeIdValue: '0x00000001'};
  assert.equal(listCatalogEntries(data.entities, {...params, identifierDomain: 'model'}).total, 1);
  assert.equal(listCatalogEntries(data.entities, {...params, identifierDomain: 'spec'}).total, 0);
  assert.equal(listCatalogEntries(data.entities, {category: 'vehicles', identifierDomain: 'spec'}).total, 1);
  assert.equal(listCatalogEntries(data.entities, {category: 'vehicles', identifierDomain: 'recipe'}).total, 0);
});

test('domain queries can find literal references with hash candidates but never treat calculations as native values', () => {
  const data = fixture();
  entry(data).nativeIds.referenceId = 'Hello';
  entry(data).attributes.hashCandidates = [{nativeIdKey: 'referenceId', domain: 'spec', algorithm: 'joaat32', transform: 'exact', value: '0x715ce7ec', confidence: 'candidate'}];
  validateCatalogData(data);
  const params = {category: 'vehicles', nativeIdKey: 'referenceId', nativeIdValue: 'Hello', identifierDomain: 'spec'};
  const result = listCatalogEntries(data.entities, params);
  assert.equal(result.total, 1);
  assert.equal(result.entries[0].attributes.hashCandidates[0].confidence, 'candidate');
  assert.equal(listCatalogEntries(data.entities, {category: 'vehicles', identifierDomain: 'spec'}).total, 1);
  assert.equal(listCatalogEntries(data.entities, {...params, identifierDomain: 'model'}).total, 0);
  assert.equal(listCatalogEntries(data.entities, {...params, nativeIdValue: '0x715ce7ec'}).total, 0);
  assert.equal(listCatalogEntries(data.entities, {...params, nativeIdKey: 'weaponSpecHash32', nativeIdValue: '0x715ce7ec'}).total, 0);
});

test('filters precede bounded pagination and do not merge repeated observations', () => {
  const data = fixture();
  const original = entry(data);
  data.entities.vehicles.entries = Array.from({length: 60}, (_, i) => {
    const item = structuredClone(original);
    item.id = `gta-vi:vehicles:synthetic-${i}`;
    item.nativeIds.configurationId = i % 2 ? 'raiden' : 'Raiden';
    return item;
  });
  const before = JSON.stringify(data.entities);
  const result = listCatalogEntries(data.entities, {category: 'vehicles', nativeIdKey: 'configurationId', nativeIdValue: 'Raiden', offset: 3, limit: 1000});
  assert.equal(result.total, 30);
  assert.equal(result.limit, 25);
  assert.equal(result.entries.length, 25);
  assert.equal(result.entries[0].id, 'gta-vi:vehicles:synthetic-6');
  assert.equal(result.entries[24].id, 'gta-vi:vehicles:synthetic-54');
  assert.equal(JSON.stringify(data.entities), before);
  const all = listCatalogEntries(data.entities, {category: 'vehicles'});
  assert.equal(all.total, 60);
  assert.equal(all.entries.length, 25);
});

test('queries reject partial, numeric, or unknown-domain filters', () => {
  const data = fixture();
  for (const filter of [
    {nativeIdKey: 'modelHash32'}, {nativeIdValue: '0x00000001'},
    {nativeIdKey: 'modelHash32', nativeIdValue: 1},
    {nativeIdKey: 'modelHash32', nativeIdValue: ''},
    {identifierDomain: 'configuration'}, {identifierDomain: null},
  ]) assert.throws(() => listCatalogEntries(data.entities, {category: 'vehicles', ...filter}), {code: 'GTAVI_CATALOG_FILTER_INVALID'});
  assert.throws(() => listCatalogEntries(data.entities, {category: 'toString'}), {code: 'GTAVI_CATALOG_CATEGORY_UNKNOWN'});
});
