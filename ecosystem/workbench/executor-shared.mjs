// SPDX-License-Identifier: Apache-2.0
import {createSaveBundle} from '../sdk/contracts.mjs';
import {sha256, fail} from './storage.mjs';

export function inputs(fixtures) {
  const artifacts = new Map(fixtures.map(f => [f.id, f.bytes]));
  const bundle = createSaveBundle(fixtures.map(f => ({id: f.id, logicalPath: f.name, role: f.role, byteLength: f.bytes.length, sha256: sha256(f.bytes)})));
  return {bundle, artifacts};
}

export function candidateFiles(original, candidate, output, inputBytes, pkg) {
  if (!Array.isArray(candidate?.outputs) || !Array.isArray(candidate.retainedInputArtifacts)) fail('CANDIDATE_INVALID', 'A candidate must account for its output and retained artifacts.');
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
  for (const source of original.artifacts) if (!inputOnlyRoles.includes(source.role) && !paths.has(`${source.role}:${source.logicalPath}`)) fail('CANDIDATE_MISSING_SIBLING', 'A candidate failed to preserve an original artifact.');
  const reports = [candidate.changeSummaryRef, candidate.validationReportRef].filter(Boolean);
  for (const report of reports) if (!output.has(report) || output.get(report).length > 64 * 1024) fail('CANDIDATE_REPORT_INVALID', 'A candidate report reference is unavailable or too large.');
  for (const id of output.keys()) if (!ids.has(id) && !reports.includes(id)) fail('CANDIDATE_UNDECLARED_OUTPUT', 'A candidate left undeclared artifact output.');
  return outputs;
}
export const requiredChecksPassed = validation => Array.isArray(validation?.checks) && validation.checks.length > 0 && validation.checks.every(check => check.required === false || check.result === 'passed');

