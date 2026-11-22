import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const CONFIDENCE = new Set(['verified', 'observed', 'candidate', 'unknown']);
const PLATFORMS = new Set(['ps5', 'xbox']);
const HASH_DOMAINS = Object.freeze({
  modelHash32: 'model', weaponSpecHash32: 'spec', weaponPresetHash32: 'preset',
  weaponRecipeHash32: 'recipe', itemHash32: 'item',
});
const IDENTIFIER_DOMAINS = new Set(Object.values(HASH_DOMAINS));
const fail = (message) => { throw new Error(`GTA VI catalog: ${message}`); };
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function joaat32Ascii(token) {
  let hash = 0;
  for (const char of token) {
    hash = (hash + char.charCodeAt(0)) >>> 0;
    hash = (hash + (hash << 10)) >>> 0;
    hash ^= hash >>> 6;
  }
  hash = (hash + (hash << 3)) >>> 0;
  hash ^= hash >>> 11;
  hash = (hash + (hash << 15)) >>> 0;
  return `0x${hash.toString(16).padStart(8, '0')}`;
}

function checkIdentifiers(entry, sourceIds) {
  const nativeIds = entry.nativeIds;
  if (nativeIds !== undefined && (!record(nativeIds) || Object.values(nativeIds).some((value) => typeof value !== 'string'))) fail(`native IDs must be lossless strings for ${entry.id}`);
  const metadata = entry.attributes?.identifierMetadata;
  if (metadata !== undefined && !record(metadata)) fail(`invalid identifier metadata for ${entry.id}`);
  for (const key of Object.keys(HASH_DOMAINS)) {
    if (!nativeIds || !Object.hasOwn(nativeIds, key)) continue;
    if (!/^0x[0-9a-f]{8}$/i.test(nativeIds[key])) fail(`invalid 32-bit native hash ${key} for ${entry.id}`);
    if (!metadata || !Object.hasOwn(metadata, key)) fail(`missing identifier metadata ${key} for ${entry.id}`);
  }
  for (const [key, item] of Object.entries(metadata || {})) {
    if (!Object.hasOwn(HASH_DOMAINS, key) || !nativeIds || !Object.hasOwn(nativeIds, key) || !record(item) || item.domain !== HASH_DOMAINS[key] || item.representation !== 'hex' || item.bitWidth !== 32) fail(`invalid identifier metadata ${key} for ${entry.id}`);
  }
  const reported = entry.attributes?.reportedIdentifierMetadata;
  if (reported !== undefined) {
    if (!record(reported) || Object.keys(reported).length !== 1 || !Object.hasOwn(reported, 'referenceId') || !record(reported.referenceId) || !nonempty(nativeIds?.referenceId)) fail(`invalid reported identifier metadata for ${entry.id}`);
    const item = reported.referenceId;
    if (!IDENTIFIER_DOMAINS.has(item.domain) || item.confidence !== 'candidate' || entry.confidence !== 'candidate' || nativeIds.referenceNamespace !== `website-reported:GTA.ZONE:${item.domain}`) fail(`invalid reported identifier domain/confidence/namespace for ${entry.id}`);
    if (item.representation === 'hex') {
      if (![32, 64].includes(item.bitWidth) || !new RegExp(`^0x[0-9a-f]{${item.bitWidth / 4}}$`, 'i').test(nativeIds.referenceId)) fail(`invalid reported identifier hash width for ${entry.id}`);
    } else if (item.representation !== 'literal' || item.bitWidth !== null || /^0x[0-9a-f]+$/i.test(nativeIds.referenceId)) fail(`invalid reported identifier literal for ${entry.id}`);
  }
  const hashCandidates = entry.attributes?.hashCandidates;
  if (hashCandidates !== undefined) {
    if (!Array.isArray(hashCandidates) || hashCandidates.length > 10) fail(`invalid hash candidates for ${entry.id}`);
    const seen = new Set();
    for (const item of hashCandidates) {
      if (!record(item) || !nativeIds || !Object.hasOwn(nativeIds, item.nativeIdKey) || Object.hasOwn(HASH_DOMAINS, item.nativeIdKey) || !nonempty(nativeIds[item.nativeIdKey])) fail(`invalid hash candidate native ID for ${entry.id}`);
      if (!IDENTIFIER_DOMAINS.has(item.domain) || item.algorithm !== 'joaat32' || !['exact', 'lowercase'].includes(item.transform) || item.confidence !== 'candidate' || !/^0x[0-9a-f]{8}$/i.test(item.value)) fail(`invalid hash candidate contract for ${entry.id}`);
      const literal = nativeIds[item.nativeIdKey];
      if (reported?.[item.nativeIdKey]?.representation === 'hex' || /^0x[0-9a-f]+$/i.test(literal)) fail(`hash candidate cannot hash a hexadecimal identifier for ${entry.id}`);
      if (/[^\x00-\x7f]/.test(literal)) fail(`non-ASCII hash candidate token for ${entry.id}`);
      const token = item.transform === 'lowercase' ? literal.toLowerCase() : literal;
      if (joaat32Ascii(token) !== item.value.toLowerCase()) fail(`hash candidate calculation mismatch for ${entry.id}`);
      const identity = JSON.stringify([item.nativeIdKey, item.domain, item.transform]);
      if (seen.has(identity)) fail(`duplicate hash candidate for ${entry.id}`);
      seen.add(identity);
    }
  }
  const crosswalk = entry.attributes?.crosswalk;
  if (crosswalk === undefined) return;
  if (!Array.isArray(crosswalk)) fail(`invalid crosswalk for ${entry.id}`);
  for (const item of crosswalk) {
    if (!record(item) || !(Object.hasOwn(HASH_DOMAINS, item.nativeIdKey) || item.kind === 'website-native-id' && item.nativeIdKey === 'referenceId') || !nativeIds || !Object.hasOwn(nativeIds, item.nativeIdKey)) fail(`invalid crosswalk native ID for ${entry.id}`);
    if (!sourceIds.has(item.sourceRef) || !(nonempty(item.location) || nonempty(item.sourceRecordId))) fail(`invalid crosswalk provenance for ${entry.id}`);
    if (!['candidate', 'observed', 'verified'].includes(item.confidence) || !['joaat32_exact', 'joaat32_lowercase', 'hash32_value_exact', 'literal_exact'].includes(item.matchMethod)) fail(`invalid crosswalk confidence/method for ${entry.id}`);
    for (const key of ['location', 'sourceRecordId', 'namespace', 'url', 'comparedText']) {
      if (item[key] !== undefined && !nonempty(item[key])) fail(`invalid crosswalk ${key} for ${entry.id}`);
    }
    if (item.kind === 'website-native-id') {
      if (item.nativeIdKey !== 'referenceId' || item.matchMethod !== 'literal_exact' || item.confidence !== 'candidate' || !nonempty(item.label) || item.token !== undefined || !nonempty(item.comparedText) || item.comparedText !== nativeIds.referenceId) fail(`invalid website-native-id crosswalk for ${entry.id}`);
    } else if (item.kind === 'website-label') {
      if (!nonempty(item.label) || item.token !== undefined) fail(`invalid website-label crosswalk for ${entry.id}`);
      if (item.matchMethod !== 'literal_exact') {
        if (item.confidence !== 'candidate') fail(`automatic website hash requires candidate confidence for ${entry.id}`);
        if (item.matchMethod === 'hash32_value_exact') {
          if (!/^0x[0-9a-f]{8}$/i.test(item.comparedText) || Number.parseInt(item.comparedText.slice(2), 16) !== Number.parseInt(nativeIds[item.nativeIdKey].slice(2), 16)) fail(`invalid website hash32 value match for ${entry.id}`);
        } else {
          if (!nonempty(item.comparedText) || /[^\x00-\x7f]/.test(item.comparedText)) fail(`invalid ASCII website comparison text for ${entry.id}`);
          const token = item.matchMethod === 'joaat32_lowercase' ? item.comparedText.toLowerCase() : item.comparedText;
          if (joaat32Ascii(token) !== nativeIds[item.nativeIdKey].toLowerCase()) fail(`website hash calculation mismatch for ${entry.id}`);
        }
      }
      if (item.confidence === 'candidate' && entry.name.en === item.label && entry.confidence !== 'candidate') fail(`candidate display label requires candidate confidence for ${entry.id}`);
    } else if (item.kind === 'native-token-hash') {
      if (!nonempty(item.token) || item.label !== undefined || !['joaat32_exact', 'joaat32_lowercase'].includes(item.matchMethod)) fail(`invalid native-token-hash crosswalk for ${entry.id}`);
      if (/[^\x00-\x7f]/.test(item.token)) fail(`non-ASCII crosswalk token for ${entry.id}`);
      const token = item.matchMethod === 'joaat32_lowercase' ? item.token.toLowerCase() : item.token;
      if (joaat32Ascii(token) !== nativeIds[item.nativeIdKey].toLowerCase()) fail(`crosswalk hash calculation mismatch for ${entry.id}`);
    } else fail(`invalid crosswalk kind for ${entry.id}`);
  }
}

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
      checkIdentifiers(entry, sourceIds);
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
