import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalogData, validateCatalogData } from '../scripts/validate-catalog.mjs';

const copy = () => structuredClone(loadCatalogData());

test('public game catalog validates', () => {
  const result = validateCatalogData(copy());
  assert.equal(result.categories, 9);
  assert.ok(result.entities >= 4);
  const data = copy();
  for (const entry of data.entities.systems.entries) {
    assert.deepEqual(entry.applicability.platforms, ['ps5', 'xbox']);
    assert.ok(entry.evidence.some(item => item.sourceRef === 'saverift-anonymized-xbox-jsav-analysis-2026-11-20'));
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
  data.entities.systems.entries[0].applicability.platforms = ['ps5'];
  assert.throws(() => validateCatalogData(data), /mapping target platform mismatch/);
});

test('a verified label alone cannot make a save field editable', () => {
  const data = copy();
  data.mappings.ps5.entries[0].confidence = 'verified';
  data.mappings.ps5.entries[0].editable = true;
  assert.throws(() => validateCatalogData(data), /missing edit validation/);
});
