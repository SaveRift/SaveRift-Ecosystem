// SPDX-License-Identifier: Apache-2.0
import {createSaveBundle} from '../sdk/contracts.mjs';
import {sha256, fail} from './storage.mjs';
import {queryCatalog} from '../sdk/data.mjs';
import {queryReferenceResource} from './reference-data.mjs';

export function inputs(fixtures, references = []) {
  for (const fixture of fixtures) if (fixture.byteLength !== undefined && fixture.byteLength !== fixture.bytes.length || fixture.sha256 !== undefined && fixture.sha256 !== sha256(fixture.bytes)) fail('FIXTURE_BYTES_CHANGED', 'Selected fixture bytes differ from their stored metadata.');
  for (const reference of references) if (fixtures.some(value => value.id === reference.id || value.name === reference.name)) fail('REFERENCE_INPUT_CONFLICT', 'A player fixture conflicts with a managed reference handle or path.');
  const selected = [...fixtures, ...references], artifacts = new Map(selected.map(f => [f.id, f.bytes]));
  const bundle = createSaveBundle(selected.map(f => ({id: f.id, logicalPath: f.name, role: f.role, byteLength: f.bytes.length, sha256: sha256(f.bytes)})));
  return {bundle, artifacts};
}

export function executionHost(host, catalogs, resources) {
  if (!catalogs.length && !resources.length) return host;
  return {...host, catalogQuery: query => {
    if (resources.length && query?.method === 'saverift.data.resource') return queryReferenceResource(resources, query);
    if (catalogs.length) {
      const matching = query.catalogId ? catalogs.filter(value => value.catalogId === query.catalogId) : catalogs;
      if (matching.length !== 1) fail('CATALOG_SELECTION_REQUIRED', 'Select one exact pinned reference-data catalog.');
      return queryCatalog(matching[0], query);
    }
    if (!host.catalogQuery) fail('CATALOG_UNAVAILABLE', 'No pinned catalog is attached.');
    return host.catalogQuery(query);
  }};
}

export function candidateFiles(original, candidate, output, inputBytes, pkg, managedIds = new Set()) {
  if (!Array.isArray(candidate?.outputs) || !Array.isArray(candidate.retainedInputArtifacts)) fail('CANDIDATE_INVALID', 'A candidate must account for its output and retained artifacts.');
  const managedHashes = new Set(original.artifacts.filter(value => managedIds.has(value.id)).map(value => value.byteLength + ':' + value.sha256));
  if (candidate.outputs.some(value => managedIds.has(value.id) || managedIds.size && value.role === 'reference-data' || managedHashes.has(value.byteLength + ':' + value.sha256)) || candidate.retainedInputArtifacts.some(id => managedIds.has(id))) fail('REFERENCE_OUTPUT_FORBIDDEN', 'Managed references cannot become a candidate save or download.');
  const retained = candidate.retainedInputArtifacts.map(id => {
    const descriptor = original.artifacts.find(a => a.id === id); if (!descriptor) fail('CANDIDATE_SCOPE_INVALID', 'A candidate retained an unselected input.'); return descriptor;
  });
  const paths = new Set(), ids = new Set(), outputs = candidate.outputs.map(descriptor => {
    if (ids.has(descriptor.id)) fail('CANDIDATE_DUPLICATE_ID', 'A candidate repeats an artifact identifier.'); ids.add(descriptor.id);
    const bytes = output.get(descriptor.id) || inputBytes.get(descriptor.id);
    if (!bytes || descriptor.byteLength !== bytes.length || descriptor.sha256 !== sha256(bytes)) fail('CANDIDATE_BYTES_INVALID', 'Candidate artifact metadata does not match isolated output.');
    return descriptor;
  });
  // Canonical connectors include retained descriptors in outputs. The explicit
  // retained list must point at exactly those original bytes, never double them.
  for (const descriptor of retained) {
    if (!ids.has(descriptor.id)) { outputs.push(descriptor); ids.add(descriptor.id); }
    else if (outputs.find(a => a.id === descriptor.id)?.sha256 !== descriptor.sha256) fail('CANDIDATE_RETAINED_CHANGED', 'A retained input descriptor changed.');
  }
  for (const descriptor of outputs) { const path = `${descriptor.role}:${descriptor.logicalPath}`; if (paths.has(path)) fail('CANDIDATE_DUPLICATE_PATH', 'A candidate repeats an artifact path.'); paths.add(path); }
  const inputOnlyRoles = pkg.manifest.workbench?.inputOnlyRoles || [];
  for (const source of original.artifacts) if (!managedIds.has(source.id) && !inputOnlyRoles.includes(source.role) && !paths.has(`${source.role}:${source.logicalPath}`)) fail('CANDIDATE_MISSING_SIBLING', 'A candidate failed to preserve an original artifact.');
  const reports = [candidate.changeSummaryRef, candidate.validationReportRef].filter(Boolean);
  for (const report of reports) if (!output.has(report) || output.get(report).length > 64 * 1024) fail('CANDIDATE_REPORT_INVALID', 'A candidate report reference is unavailable or too large.');
  for (const id of output.keys()) if (!ids.has(id) && !reports.includes(id)) fail('CANDIDATE_UNDECLARED_OUTPUT', 'A candidate left undeclared artifact output.');
  return outputs;
}
export const requiredChecksPassed = validation => Array.isArray(validation?.checks) && validation.checks.length > 0 && validation.checks.every(check => check.required === false || check.result === 'passed');

// Full query results are used during execution. Public job receipts need only
// bounded diagnostic views; validation, intent and artifact pins stay intact.
export function boundedJobSummary(result) {
  if (!result?.summary || typeof result.summary !== 'object' || Array.isArray(result.summary)) return result;
  const summary = {...result.summary};
  for (const key of ['description', 'originalQuery', 'before', 'after']) {
    if (!Object.hasOwn(summary, key)) continue;
    const serialized = JSON.stringify(summary[key]);
    if (serialized === undefined) continue;
    const byteLength = new TextEncoder().encode(serialized).byteLength;
    if (byteLength > 8192) summary[key] = {schema: 'saverift.job-query-receipt.v1', detail: 'omitted_from_job_report', byteLength, sha256: sha256(serialized), access: 'Use the authorized preview queries to inspect the source or candidate.'};
  }
  return {...result, summary};
}

