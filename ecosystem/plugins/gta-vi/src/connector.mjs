// SPDX-License-Identifier: Apache-2.0
// Read-only public runtime. Platform-specific container preparation stays outside
// the isolated runner until a complete, independently verified round trip exists.
import {hash} from '../../../sdk/crypto.mjs';
import {inspectGtaViJsav} from './shared/gta-vi-jsav.mjs';
import characters from '../data/entities/characters.json';
import vehicles from '../data/entities/vehicles.json';
import weapons from '../data/entities/weapons.json';
import clothing from '../data/entities/clothing.json';
import items from '../data/entities/items.json';
import currencies from '../data/entities/currencies.json';
import locations from '../data/entities/locations.json';
import activities from '../data/entities/activities.json';
import systems from '../data/entities/systems.json';

const states = new Map();
const catalog = Object.freeze({characters, vehicles, weapons, clothing, items, currencies, locations, activities, systems});
const error = (code, message = code) => { throw Object.assign(new Error(message), {code}); };
const identity = value => typeof value === 'string' && ['grand-theft-auto-vi', 'gta-vi', 'saverift.gta-vi'].includes(value.toLowerCase());
const platform = value => typeof value === 'string' ? value.toLowerCase() : '';
const rows = fields => Array.isArray(fields) ? fields : fields && typeof fields === 'object' ? Object.entries(fields).map(([name, value]) => ({name, value})) : [];
const fieldRow = value => ({hash: value.hash, label: value.label ?? value.name ?? null, name: value.name ?? null, category: value.category ?? null, sampleCount: Array.isArray(value.values) ? value.values.length : 0});

function select(bundle) {
  if (!identity(bundle.hints?.gameIdentity)) error('GTAVI_IDENTITY_REQUIRED', 'Select a verified GTA VI game identity.');
  if (!['xbox', 'ps5'].includes(platform(bundle.hints?.platform))) error('GTAVI_PLATFORM_UNSUPPORTED', 'Select an Xbox or PS5 decoded save.');
  const memory = bundle.artifacts.filter(item => ['memory', 'jsav', 'main'].includes(item.role));
  const chives = bundle.artifacts.filter(item => item.role === 'chives');
  if (memory.length !== 1 || chives.length > 1) error('GTAVI_ARTIFACT_SELECTION', 'Select exactly one decoded JSAV memory artifact and at most one chives artifact.');
  return {memory: memory[0], chives: chives[0]};
}

function inspect(bundle, ctx) {
  const selected = select(bundle);
  const memory = ctx.readArtifact(selected.memory.id);
  if (hash(memory) !== selected.memory.sha256) error('GTAVI_SOURCE_MISMATCH');
  if (memory.length < 48 || memory[0] !== 0x4a || memory[1] !== 0x53 || memory[2] !== 0x41 || memory[3] !== 0x56) error('GTAVI_UNSUPPORTED_FORMAT');
  const chives = selected.chives ? ctx.readArtifact(selected.chives.id) : new Uint8Array();
  if (selected.chives && hash(chives) !== selected.chives.sha256) error('GTAVI_SOURCE_MISMATCH');
  const parsed = inspectGtaViJsav(memory, chives);
  return {selected, parsed, platform: platform(bundle.hints.platform)};
}

function summary(state) {
  const parsed = state.parsed;
  return {
    schema: 'saverift.gta-vi.inspect.v1',
    format: 'gta-vi-decoded-jsav-v3',
    platform: state.platform,
    sourceSha256: state.selected.memory.sha256,
    version: parsed.version,
    codeBlockCount: parsed.codeCount,
    scriptBlockCount: parsed.scriptCount,
    fieldCount: rows(parsed.fields).length,
    labeledFieldCount: rows(parsed.fields).length,
    hasLargeIntegers: Boolean(parsed.hasUnsafeIntegers),
    completionPercent: parsed.completionPercent ?? null,
    saveTimestamp: parsed.saveTimestamp ?? null,
    capabilities: {inspect: true, edit: false, restore: false},
    gameAcceptance: 'not_run'
  };
}

function state(handle) {
  const value = states.get(handle?.id);
  if (!value) error('GTAVI_DOCUMENT_CLOSED');
  return value;
}

export default {
  detect(bundle, ctx) {
    if (bundle.hints?.gameIdentity && !identity(bundle.hints.gameIdentity)) return {state: 'not_a_match'};
    try {
      const value = inspect(bundle, ctx);
      return {state: 'supported', format: 'gta-vi-decoded-jsav-v3', platform: value.platform, requiredRoles: [value.selected.memory.role]};
    } catch (cause) {
      return {state: cause.code === 'GTAVI_UNSUPPORTED_FORMAT' ? 'not_a_match' : 'recognized_unsupported', reason: cause.code || 'GTAVI_CORRUPT_INPUT'};
    }
  },
  open(bundle, ctx) {
    const value = inspect(bundle, ctx);
    const id = bundle.bundleDigest;
    states.set(id, value);
    return {id, ...summary(value)};
  },
  describe() {
    return {domainApis: {'gtavi.inspect': '0.1.0', 'gtavi.catalog': '0.1.0'}, operations: [], views: [{id: 'gtavi.overview', mode: 'custom'}], unavailable: ['raw-xbox-container', 'raw-ps5-container', 'save-editing', 'restore']};
  },
  query(handle, request) {
    const value = state(handle);
    if (request?.method === 'gtavi.inspect') return summary(value);
    if (request?.method === 'gtavi.catalog.categories') return {categories: Object.entries(catalog).map(([category, data]) => ({category, count: data.entries.length}))};
    if (request?.method === 'gtavi.catalog.list') {
      const input = request.params || request.args || {};
      const category = typeof input.category === 'string' ? input.category : '';
      const selected = catalog[category];
      if (!Object.hasOwn(catalog, category) || !selected) error('GTAVI_CATALOG_CATEGORY_UNKNOWN');
      const offset = Number.isSafeInteger(input.offset) && input.offset >= 0 ? input.offset : 0;
      const limit = Number.isSafeInteger(input.limit) ? Math.max(1, Math.min(25, input.limit)) : 25;
      return {category, entries: selected.entries.slice(offset, offset + limit), total: selected.entries.length, offset, limit};
    }
    if (request?.method === 'gtavi.fields.list') {
      const input = request.params || request.args || {};
      const offset = Number.isSafeInteger(input.offset) && input.offset >= 0 ? input.offset : 0;
      const limit = Number.isSafeInteger(input.limit) ? Math.max(1, Math.min(50, input.limit)) : 50;
      const all = rows(value.parsed.fields);
      return {fields: all.slice(offset, offset + limit).map(fieldRow), total: all.length, offset, limit};
    }
    error('GTAVI_QUERY_UNSUPPORTED');
  },
  plan() { error('GTAVI_READ_ONLY', 'This connector has no verified write operation.'); },
  validate() { error('GTAVI_READ_ONLY', 'This connector has no candidate to validate.'); },
  close(handle) { if (handle?.id) states.delete(handle.id); else states.clear(); return null; }
};
