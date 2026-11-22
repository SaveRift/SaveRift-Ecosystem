// SPDX-License-Identifier: Apache-2.0
import {assertCatalogResponse} from './gta-vi-catalog.mjs';

const fail = code => { throw Object.assign(new Error(code), {code}); };
const validId = value => typeof value === 'string' && value.length <= 240 && /^gta-vi:[a-z-]+:[a-z0-9-]+$/.test(value);
const pointerPart = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');

function sourceRefs(value, refs = new Set()) {
  if (value && typeof value === 'object') {
    if (typeof value.sourceRef === 'string') refs.add(value.sourceRef);
    for (const child of Object.values(value)) if (child && typeof child === 'object') sourceRefs(child, refs);
  }
  return refs;
}

/** Select one exact catalog identity without substituting another identifier domain. */
export function getCatalogDetails(catalog, presentations, sourceDocument, input = {}) {
  const {catalogId} = input;
  if (!validId(catalogId)) fail('GTAVI_CATALOG_ID_INVALID');
  const category = catalogId.split(':')[1];
  const entry = Object.hasOwn(catalog, category) && catalog[category].entries.find(row => row.id === catalogId);
  if (!entry) fail('GTAVI_CATALOG_ENTRY_UNKNOWN');
  const document = presentations[category];
  const stored = document?.entries.find(row => row.catalogId === catalogId) || null;
  const expand = fact => {
    const sourceRef = fact.sourceRef || stored.sourceRef;
    const definition = document.fieldDefinitions?.[sourceRef]?.[fact.key];
    if (!definition) {
      if (typeof fact.label !== 'string' || !fact.label) fail('GTAVI_PRESENTATION_FIELD_UNKNOWN');
      return fact;
    }
    return {...definition, ...fact, sourceRef,
      valuePointer: fact.valuePointer || `${stored.sourceRowPointer}/4/${definition.index}`,
      descriptorPointer: fact.descriptorPointer || definition.descriptorPointer || `/f/${definition.index}`,
      ...(fact.displayValue !== undefined ? {displayValuePointer: fact.displayValuePointer || `/tr/${pointerPart(fact.key)}/${pointerPart(fact.value)}`} : {})};
  };
  const details = stored ? {...stored, stats: (stored.stats || []).map(expand), properties: (stored.properties || []).map(expand)} : null;
  // Reject excessive depth before following source references recursively.
  if (details) assertCatalogResponse(details);
  const refs = sourceRefs(details);
  const sources = (sourceDocument.sources || []).filter(source => refs.has(source.id));
  return assertCatalogResponse({catalogId, category, name: entry.name, applicability: entry.applicability,
    confidence: entry.confidence, available: details !== null, details, sources});
}

/** Build-time integrity checks; detail data cannot create or rename catalog identities. */
export function validateCatalogPresentations(catalog, presentations, sourceDocument) {
  if (sourceDocument?.schema !== 'saverift.gta-vi.presentation-sources.v1' || !Array.isArray(sourceDocument.sources)) fail('GTAVI_PRESENTATION_SOURCES_INVALID');
  const sourceIds = new Set();
  for (const source of sourceDocument.sources) {
    if (!source || typeof source.id !== 'string' || !source.id || sourceIds.has(source.id)) fail('GTAVI_PRESENTATION_SOURCES_INVALID');
    sourceIds.add(source.id);
  }
  const seen = new Set();
  for (const [category, document] of Object.entries(presentations)) {
    if (!Object.hasOwn(catalog, category) || document?.schema !== 'saverift.gta-vi.presentation.v1' || document.category !== category || !Array.isArray(document.entries)) fail('GTAVI_PRESENTATION_INVALID');
    for (const details of document.entries) {
      if (!validId(details.catalogId) || details.catalogId.split(':')[1] !== category || seen.has(details.catalogId)) fail('GTAVI_PRESENTATION_ID_INVALID');
      seen.add(details.catalogId);
      assertCatalogResponse(details);
      for (const ref of sourceRefs(details)) if (!sourceIds.has(ref)) fail('GTAVI_PRESENTATION_SOURCE_UNKNOWN');
      const response = getCatalogDetails(catalog, presentations, sourceDocument, {catalogId: details.catalogId});
      for (const relatedId of details.relatedSpecCatalogIds || []) {
        const related = catalog.weapons?.entries.find(row => row.id === relatedId);
        if (related?.attributes?.reportedIdentifierMetadata?.referenceId?.domain !== 'spec') fail('GTAVI_PRESENTATION_RELATION_INVALID');
      }
      if (response.details.catalogId !== details.catalogId) fail('GTAVI_PRESENTATION_ID_INVALID');
    }
  }
  return {entries: seen.size, sources: sourceIds.size};
}
