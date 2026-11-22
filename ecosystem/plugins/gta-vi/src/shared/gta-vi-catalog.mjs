// SPDX-License-Identifier: Apache-2.0

const DOMAINS = new Set(['model', 'spec', 'preset', 'recipe', 'item']);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const fail = (code) => { throw Object.assign(new Error(code), {code}); };

// Leave room for the UI response envelope (128 KiB, 12,000 nodes, 24 levels).
// The isolated runtime's JSON ceiling is larger, at 256 KiB.
export const CATALOG_PAGE_LIMITS = Object.freeze({maxBytes: 112 * 1024, maxNodes: 10000, maxDepth: 20});

function jsonBytes(value) {
  const text = JSON.stringify(value);
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

function shapeNodes(value, depth = 0) {
  if (depth > CATALOG_PAGE_LIMITS.maxDepth) return Infinity;
  let nodes = 1;
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) {
      nodes += shapeNodes(child, depth + 1);
      if (nodes > CATALOG_PAGE_LIMITS.maxNodes) return Infinity;
    }
  }
  return nodes;
}

/** Apply the same complete-response budget to a selected catalog detail. */
export function assertCatalogResponse(value, code = 'GTAVI_CATALOG_DETAILS_LIMIT') {
  if (shapeNodes(value) > CATALOG_PAGE_LIMITS.maxNodes || jsonBytes(value) > CATALOG_PAGE_LIMITS.maxBytes) fail(code);
  return value;
}

function boundedPage(entries, category, offset, limit) {
  const page = {category, entries: [], total: entries.length, offset, limit, nextOffset: null};
  let bytes = 0, nodes = shapeNodes(page);
  for (const entry of entries.slice(offset, offset + limit)) {
    const next = offset + page.entries.length + 1;
    const nextOffset = next < entries.length ? next : null;
    const header = {...page, entries: [], nextOffset};
    // The empty array brackets are already counted in header; add full entry
    // encodings and separators. Each entry is serialized once, without edits.
    const nextBytes = bytes + jsonBytes(entry) + (page.entries.length ? 1 : 0);
    const nextNodes = nodes + shapeNodes(entry, 2);
    if (jsonBytes(header) + nextBytes > CATALOG_PAGE_LIMITS.maxBytes || nextNodes > CATALOG_PAGE_LIMITS.maxNodes) {
      if (!page.entries.length) fail('GTAVI_CATALOG_ENTRY_LIMIT');
      break;
    }
    page.entries.push(entry);
    page.nextOffset = nextOffset;
    bytes = nextBytes; nodes = nextNodes;
  }
  return page;
}

/** Read-only catalog lookup. Identifier equality is case-sensitive and lossless. */
export function listCatalogEntries(catalog, input = {}) {
  const category = typeof input.category === 'string' ? input.category : '';
  if (!Object.hasOwn(catalog, category)) fail('GTAVI_CATALOG_CATEGORY_UNKNOWN');
  const {nativeIdKey, nativeIdValue, identifierDomain} = input;
  const hasNativeId = nativeIdKey !== undefined || nativeIdValue !== undefined;
  if (hasNativeId && (!nonempty(nativeIdKey) || !nonempty(nativeIdValue))) fail('GTAVI_CATALOG_FILTER_INVALID');
  if (identifierDomain !== undefined && !DOMAINS.has(identifierDomain)) fail('GTAVI_CATALOG_FILTER_INVALID');
  let entries = catalog[category].entries;
  if (hasNativeId || identifierDomain !== undefined) entries = entries.filter((entry) => {
    if (hasNativeId && (!Object.hasOwn(entry.nativeIds || {}, nativeIdKey) || entry.nativeIds[nativeIdKey] !== nativeIdValue)) return false;
    if (identifierDomain === undefined) return true;
    const metadata = [entry.attributes?.identifierMetadata || {}, entry.attributes?.reportedIdentifierMetadata || {}];
    const observedOrReportedDomain = metadata.some((group) => hasNativeId
      ? group[nativeIdKey]?.domain === identifierDomain
      : Object.values(group).some((item) => item.domain === identifierDomain));
    const candidateDomain = (entry.attributes?.hashCandidates || []).some((item) => item.domain === identifierDomain && (!hasNativeId || item.nativeIdKey === nativeIdKey));
    return observedOrReportedDomain || candidateDomain;
  });
  const offset = Number.isSafeInteger(input.offset) && input.offset >= 0 ? input.offset : 0;
  const limit = Number.isSafeInteger(input.limit) ? Math.max(1, Math.min(25, input.limit)) : 25;
  return boundedPage(entries, category, offset, limit);
}
