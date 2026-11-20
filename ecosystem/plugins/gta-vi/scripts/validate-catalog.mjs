import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const CONFIDENCE = new Set(['verified', 'observed', 'candidate', 'unknown']);
const PLATFORMS = new Set(['ps5', 'xbox']);
const fail = (message) => { throw new Error(`GTA VI catalog: ${message}`); };
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;

export function loadCatalogData(root = ROOT) {
  const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
  const catalog = read('catalog.json');
  const sources = read('sources.json');
  const entities = Object.fromEntries(catalog.categories.map((category) => [category, read(`entities/${category}.json`)]));
  const mappings = Object.fromEntries(catalog.platforms.map((platform) => [platform, read(`save-mappings/${platform}.json`)]));
  return { catalog, sources, entities, mappings };
}

export function validateCatalogData({ catalog, sources, entities, mappings }) {
  if (catalog?.schema !== 'saverift.gta-vi.catalog.v1' || !nonempty(catalog.id) || !nonempty(catalog.version)) fail('invalid catalog metadata');
  if (!Array.isArray(catalog.categories) || !Array.isArray(catalog.platforms) || !catalog.categories.length) fail('missing categories or platforms');
  if (new Set(catalog.categories).size !== catalog.categories.length || new Set(catalog.platforms).size !== catalog.platforms.length || catalog.platforms.some((platform) => !PLATFORMS.has(platform))) fail('duplicate or unsupported category/platform');
  if (sources?.schema !== 'saverift.gta-vi.sources.v1' || !Array.isArray(sources.sources)) fail('invalid sources');
  const sourceIds = new Set();
  for (const source of sources.sources) {
    if (![source.id, source.kind, source.title, source.locator, source.revision, source.license, source.attribution, source.allowedUse].every(nonempty) || sourceIds.has(source.id)) fail(`invalid or duplicate source ${source.id}`);
    sourceIds.add(source.id);
  }
  const ids = new Set();
  const entityById = new Map();
  const checkEvidence = (entry, label) => {
    if (!CONFIDENCE.has(entry.confidence) || !Array.isArray(entry.evidence) || !entry.evidence.length) fail(`missing confidence/evidence for ${label}`);
    for (const item of entry.evidence) if (!sourceIds.has(item.sourceRef) || !nonempty(item.location) || !nonempty(item.method)) fail(`invalid provenance for ${label}`);
    const applicability = entry.applicability;
    if (!applicability || !Array.isArray(applicability.platforms) || !applicability.platforms.length || new Set(applicability.platforms).size !== applicability.platforms.length || applicability.platforms.some((platform) => !catalog.platforms.includes(platform)) || !(applicability.build === null || nonempty(applicability.build))) fail(`invalid platform/build for ${label}`);
  };
  for (const category of catalog.categories) {
    const group = entities?.[category];
    if (group?.schema !== 'saverift.gta-vi.entities.v1' || group.category !== category || !Array.isArray(group.entries)) fail(`invalid ${category} file`);
    for (const entry of group.entries) {
      if (!nonempty(entry.id) || !entry.id.startsWith(`gta-vi:${category}:`) || ids.has(entry.id) || !nonempty(entry.name?.en)) fail(`invalid or duplicate entity ${entry.id}`);
      if (entry.nativeIds && (typeof entry.nativeIds !== 'object' || Object.values(entry.nativeIds).some((value) => typeof value !== 'string'))) fail(`native IDs must be lossless strings for ${entry.id}`);
      checkEvidence(entry, entry.id);
      ids.add(entry.id);
      entityById.set(entry.id, entry);
    }
  }
  let mappingCount = 0;
  for (const platform of catalog.platforms) {
    const group = mappings?.[platform];
    if (group?.schema !== 'saverift.gta-vi.save-mappings.v1' || group.platform !== platform || !Array.isArray(group.entries)) fail(`invalid ${platform} save mappings`);
    for (const entry of group.entries) {
      if (!nonempty(entry.id) || ids.has(entry.id) || !ids.has(entry.targetId) || !nonempty(entry.format) || !/^0x[0-9a-f]{8}$/i.test(entry.fieldHash) || !nonempty(entry.preimage)) fail(`invalid save-field link ${entry.id}`);
      checkEvidence(entry, entry.id);
      if (entry.applicability.platforms.length !== 1 || entry.applicability.platforms[0] !== platform) fail(`mapping platform mismatch ${entry.id}`);
      if (!entityById.get(entry.targetId)?.applicability.platforms.includes(platform)) fail(`mapping target platform mismatch ${entry.id}`);
      if (typeof entry.editable !== 'boolean' || (entry.editable && entry.confidence !== 'verified')) fail(`unverified editable mapping ${entry.id}`);
      if (entry.editable) {
        const validation = entry.editValidation;
        const stages = ['controlled-before-after', 'encode-restore', 'nondefault-in-game-load'];
        if (!validation || validation.platform !== platform || !nonempty(validation.build) || validation.build !== entry.applicability.build || !Array.isArray(validation.checks) || validation.checks.length !== stages.length) fail(`missing edit validation for ${entry.id}`);
        for (const [index, check] of validation.checks.entries()) {
          if (check.stage !== stages[index] || !sourceIds.has(check.sourceRef) || !nonempty(check.location) || !nonempty(check.method)) fail(`invalid edit validation for ${entry.id}`);
        }
        const loaded = validation.checks[2];
        if (![loaded.defaultValue, loaded.expectedValue, loaded.observedValue].every(nonempty) || loaded.expectedValue === loaded.defaultValue || loaded.observedValue !== loaded.expectedValue) fail(`unverified in-game value for ${entry.id}`);
      } else if (entry.editValidation !== undefined) fail(`unexpected edit validation for ${entry.id}`);
      ids.add(entry.id);
      mappingCount++;
    }
  }
  return { categories: catalog.categories.length, sources: sourceIds.size, entities: ids.size - mappingCount, saveMappings: mappingCount };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = validateCatalogData(loadCatalogData());
    process.stdout.write(`GTA VI catalog valid: ${result.categories} categories, ${result.entities} entities, ${result.sources} sources, ${result.saveMappings} save links.\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
