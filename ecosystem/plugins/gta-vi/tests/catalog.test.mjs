import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalogData, validateCatalogData } from '../scripts/validate-catalog.mjs';

const copy = () => structuredClone(loadCatalogData());

test('public game catalog validates', () => {
  const result = validateCatalogData(copy());
  assert.equal(result.categories, 9);
  assert.ok(result.entities >= 4);
  const data = copy();
  const sharedTargets = new Set(Object.values(data.mappings).flatMap(group => group.entries.map(entry => entry.targetId)));
  assert.equal(sharedTargets.size, 9);
  for (const targetId of sharedTargets) {
    const entry = data.entities.systems.entries.find(item => item.id === targetId);
    assert.ok(entry, `Missing shared save concept ${targetId}`);
    assert.deepEqual(entry.applicability.platforms, ['ps5', 'xbox']);
    assert.ok(entry.evidence.some(item => item.sourceRef === 'saverift-anonymized-xbox-jsav-analysis-2026-11-20'));
  }
});

test('RPF9 observations retain their Xbox scope without becoming save links or runtime claims', () => {
  const data = copy();
  const allEntries = Object.values(data.entities).flatMap(group => group.entries);
  const entriesById = new Map(allEntries.map(entry => [entry.id, entry]));
  const saveTargets = new Set(Object.values(data.mappings).flatMap(group => group.entries.map(entry => entry.targetId)));
  const observations = allEntries.filter(entry => /:rpf9-observation-/.test(entry.id));
  assert.ok(observations.length > 0, 'The reviewed RPF9 observations must be included');
  const recordIds = new Set();
  for (const entry of observations) {
    assert.match(entry.id, /^gta-vi:[a-z-]+:rpf9-observation-[0-9a-f]{64}$/);
    assert.equal(entry.confidence, 'observed');
    assert.deepEqual(entry.applicability, {platforms: ['xbox'], build: null});
    assert.equal(entry.attributes.editorReady, false);
    assert.equal(entry.attributes.runtimeAvailability, 'unverified');
    assert.equal(entry.attributes.saveMapping, 'unvalidated');
    assert.equal(entry.attributes.originalArchiveMembershipProven, false);
    assert.ok(typeof entry.attributes.recordRole === 'string' && entry.attributes.recordRole.length > 0);
    assert.ok(typeof entry.attributes.semanticRole === 'string' && entry.attributes.semanticRole.length > 0);
    assert.ok(typeof entry.attributes.sourceRecordId === 'string' && entry.attributes.sourceRecordId.length > 0);
    assert.ok(!recordIds.has(entry.attributes.sourceRecordId), 'Source observations must not be duplicated');
    recordIds.add(entry.attributes.sourceRecordId);
    assert.ok(!saveTargets.has(entry.id), `Unvalidated observation became a save link: ${entry.id}`);
    if (entry.attributes.parentCatalogId !== undefined) {
      assert.ok(entriesById.has(entry.attributes.parentCatalogId), `Missing configuration parent for ${entry.id}`);
    }
    if (entry.id.startsWith('gta-vi:weapons:')) {
      assert.ok(typeof entry.nativeIds?.referenceId === 'string' && entry.nativeIds.referenceId.length > 0);
      assert.ok(typeof entry.nativeIds?.referenceNamespace === 'string' && entry.nativeIds.referenceNamespace.length > 0);
      assert.equal(entry.nativeIds.configurationId, undefined, 'An unresolved weapon reference is not a definition');
    } else if (entry.nativeIds && Object.keys(entry.nativeIds).length > 0) {
      assert.ok(typeof entry.nativeIds.configurationId === 'string' && entry.nativeIds.configurationId.length > 0);
      assert.ok(typeof entry.nativeIds.configurationNamespace === 'string' && entry.nativeIds.configurationNamespace.length > 0);
    }
  }
});

test('missing provenance is rejected', () => {
  const data = copy();
  data.entities.characters.entries[0].evidence = [];
  assert.throws(() => validateCatalogData(data), /confidence\/evidence/);
});

test('duplicate identifiers are rejected across categories', () => {
  const data = copy();
  data.entities.characters.entries.push(structuredClone(data.entities.characters.entries[0]));
  assert.throws(() => validateCatalogData(data), /duplicate entity/);
});

test('unsupported platforms and candidate edits are rejected', () => {
  const data = copy();
  data.entities.characters.entries[0].applicability.platforms = ['ps4'];
  assert.throws(() => validateCatalogData(data), /platform\/build/);
  const edit = copy();
  edit.mappings.ps5.entries[0].editable = true;
  assert.throws(() => validateCatalogData(edit), /unverified editable/);
});

test('save mapping target must include the mapping platform', () => {
  const data = copy();
  const targetId = data.mappings.xbox.entries[0].targetId;
  const entry = Object.values(data.entities).flatMap(group => group.entries).find(item => item.id === targetId);
  assert.ok(entry);
  entry.applicability.platforms = ['ps5'];
  assert.throws(() => validateCatalogData(data), /mapping target platform mismatch/);
});

test('a verified label alone cannot make a save field editable', () => {
  const data = copy();
  data.mappings.ps5.entries[0].confidence = 'verified';
  data.mappings.ps5.entries[0].editable = true;
  assert.throws(() => validateCatalogData(data), /missing edit validation/);
});
