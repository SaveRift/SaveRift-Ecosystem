// SPDX-License-Identifier: Apache-2.0
import {createPluginSession, runPlugin} from '../sdk/runner.mjs';
import {createSaveBundle, LIMITS as SDK_LIMITS} from '../sdk/contracts.mjs';
import {sha256, fail} from './storage.mjs';
import {queryCatalog} from '../sdk/data.mjs';
import {operationDigest, compileOperationLog} from '../sdk/draft.mjs';
import {validateExecutionPackages} from '../sdk/registry.mjs';

function inputs(fixtures) {
  const artifacts = new Map(fixtures.map(f => [f.id, f.bytes]));
  const bundle = createSaveBundle(fixtures.map(f => ({id: f.id, logicalPath: f.name, role: f.role, byteLength: f.bytes.length, sha256: sha256(f.bytes)})));
  return {bundle, artifacts};
}

function candidateFiles(original, candidate, output, inputBytes, pkg) {
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
const requiredChecksPassed = validation => Array.isArray(validation?.checks) && validation.checks.length > 0 && validation.checks.every(check => check.required === false || check.result === 'passed');

// This adapter does not load plugin code into Node/Worker globals. Every method
// runs in the SDK's separate QuickJS Wasm heap with a closed package loader.
export function createIsolatedExecutor(host = {}) {
  return async function executeJob({kind, package: pkg, extensions = [], executionLock, dataPackages = [], catalog, catalogs = catalog ? [catalog] : [], fixtures, input, signal}) {
    validateExecutionPackages(executionLock, [pkg, ...extensions.map(e => e.package), ...dataPackages]);
    if (!fixtures.length) return {status: 'not_run', reason: 'Select an explicitly authorized fixture to run lifecycle/no-op tests.'};
    const selected = inputs(fixtures), checks = [], phases = [];
    const budget = {startedAt: Date.now(), wallMs: 60000, interrupts: SDK_LIMITS.interrupts, hostCalls: SDK_LIMITS.hostCalls, outputBytes: SDK_LIMITS.outputBytes, outputArtifacts: SDK_LIMITS.outputArtifacts};
    function limitsForPhase() {
      const remainingMs = budget.wallMs - (Date.now() - budget.startedAt);
      if (remainingMs <= 0 || signal?.aborted) fail(signal?.aborted ? 'JOB_ABORTED' : 'JOB_TIME_LIMIT', signal?.aborted ? 'The plugin job was cancelled.' : 'The offline job exceeded its total wall-clock limit.');
      if (budget.interrupts <= 0 || budget.hostCalls <= 0 || budget.outputBytes <= 0 || budget.outputArtifacts <= 0) fail('JOB_RESOURCE_LIMIT', 'The offline job exhausted its shared instruction or artifact budget.');
      return {timeoutMs: Math.min(SDK_LIMITS.timeoutMs, remainingMs), interrupts: budget.interrupts, hostCalls: budget.hostCalls, outputBytes: budget.outputBytes, outputArtifacts: budget.outputArtifacts};
    }
    function accountPhase(phase, metrics, artifactCount = 0, packageId) {
      budget.interrupts -= metrics.interrupts; budget.hostCalls -= metrics.hostCalls; budget.outputBytes -= metrics.outputBytes; budget.outputArtifacts -= artifactCount;
      phases.push({phase, ...(packageId ? {packageId} : {}), ...metrics});
      if (budget.interrupts < 0 || budget.hostCalls < 0 || budget.outputBytes < 0 || budget.outputArtifacts < 0) fail('JOB_RESOURCE_LIMIT', 'The offline job exceeded its shared instruction or artifact budget.');
      if (Date.now() - budget.startedAt > budget.wallMs) fail('JOB_TIME_LIMIT', 'The offline job exceeded its total wall-clock limit.');
    }
    const pinnedHost = catalogs.length ? {...host, catalogQuery: query => {
      const matching = query.catalogId ? catalogs.filter(c => c.catalogId === query.catalogId) : catalogs;
      if (matching.length !== 1) fail('CATALOG_SELECTION_REQUIRED', 'Select one exact pinned reference-data catalog.');
      return queryCatalog(matching[0], query);
    }} : host;
    let description, originalQuery, defaultQuery;
    let inspection = await createPluginSession({package: pkg, executionLock, ...selected, signal, limits: limitsForPhase()}, pinnedHost);
    try {
      const detection = await inspection.call('detect', [selected.bundle]);
      if (detection?.state !== 'supported') fail('FORMAT_NOT_SUPPORTED', 'The plugin did not detect the selected fixture family.');
      checks.push({name: 'detect', status: 'passed'});
      const handle = await inspection.call('open', [selected.bundle]); checks.push({name: 'open-original', status: 'passed'});
      description = await inspection.call('describe', [handle]);
      defaultQuery = pkg.manifest.workbench?.defaultQuery || description.defaultQuery || {method: Object.keys(description.domainApis || pkg.manifest.extensionApis || {})[0]};
      originalQuery = await inspection.call('query', [handle, defaultQuery]); checks.push({name: 'describe-query', status: 'passed'});
      if (kind === 'inspect') {
        const data = input.query ? await inspection.call('query', [handle, input.query]) : originalQuery;
        await inspection.call('close', [handle]);
        return {status: 'passed', description, data, runtime: inspection.metrics(), executionLockDigest: executionLock.digest, gameAcceptance: 'unverified'};
      }
      await inspection.call('close', [handle]);
    } finally { const metrics = inspection.metrics(), count = inspection.artifacts().size; inspection.close(); inspection = null; accountPhase('inspection', metrics, count); }
    // Inspection, each extension, serialization, validation and re-open receive
    // fresh isolated engines. The existing per-engine CPU/memory limits remain.
    const operations = kind === 'tests' ? [] : input.operations;
    const run = async options => {
      const result = await runPlugin({...options, artifacts: selected.artifacts, limits: limitsForPhase()}, pinnedHost);
      accountPhase(options.package.manifest.id === pkg.manifest.id ? 'serialization' : 'extension', result.metrics, result.artifacts.size, options.package.manifest.id);
      if (options.package.manifest.id !== pkg.manifest.id && result.artifacts.size) fail('EXTENSION_OUTPUT_FORBIDDEN', 'Extensions may transform intent; only the primary connector serializes save artifacts.');
      return result;
    };
    const planned = await compileOperationLog({bundle: selected.bundle, operations, executionLock, connector: {package: pkg}, extensions, document: originalQuery, run, signal});
    const candidate = planned.result, outputs = planned.artifacts;
    if (candidate.inputBundleDigest !== selected.bundle.bundleDigest || candidate.executionLockDigest !== executionLock.digest || candidate.operationDigest !== operationDigest(operations)) fail('CANDIDATE_BINDING_INVALID', 'Candidate source, dependency lock or operation binding changed.');
    const descriptors = candidateFiles(selected.bundle, candidate, outputs, selected.artifacts, pkg);
    const finalArtifacts = new Map([...selected.artifacts, ...outputs]);
    const newlySelected = [...outputs].filter(([id]) => !selected.artifacts.has(id)).map(([id, bytes]) => candidate.outputs.find(a => a.id === id) || {id, logicalPath: `reports/${id}.json`, role: 'validation-report', byteLength: bytes.length, sha256: sha256(bytes)});
    const accessBundle = createSaveBundle([...selected.bundle.artifacts, ...newlySelected], {id: 'validation-access'});
    let validator = await createPluginSession({package: pkg, executionLock, bundle: accessBundle, artifacts: finalArtifacts, signal, limits: limitsForPhase()}, pinnedHost);
    try {
      const validation = await validator.call('validate', [selected.bundle, candidate]);
      if (!requiredChecksPassed(validation) || !requiredChecksPassed(candidate.validation)) fail('CANDIDATE_VALIDATION_FAILED', 'Required candidate validation checks did not all pass.');
      checks.push({name: 'candidate-validation', status: 'passed'});
    } finally { const metrics = validator.metrics(), count = validator.artifacts().size; validator.close(); validator = null; accountPhase('validation', metrics, count); }
    if (kind === 'tests') {
      for (const descriptor of descriptors) {
        const prior = selected.bundle.artifacts.find(a => a.logicalPath === descriptor.logicalPath && a.role === descriptor.role), actual = finalArtifacts.get(descriptor.id);
        if (!prior || !actual || sha256(actual) !== prior.sha256) fail('NOOP_BYTES_CHANGED', 'The no-op round trip changed original artifact bytes.');
      }
      checks.push({name: 'no-op-byte-parity', status: 'passed'});
    }
    const supporting = selected.bundle.artifacts.filter(a => (pkg.manifest.workbench?.inputOnlyRoles || []).includes(a.role) && !descriptors.some(d => d.id === a.id));
    const finalBundle = createSaveBundle([...descriptors, ...supporting], {id: 'candidate'});
    let reopened = await createPluginSession({package: pkg, executionLock, bundle: finalBundle, artifacts: finalArtifacts, signal, limits: limitsForPhase()}, pinnedHost);
    let reopenedQuery;
    try {
      const detected = await reopened.call('detect', [finalBundle]); if (detected?.state !== 'supported') fail('CANDIDATE_REOPEN_FAILED', 'Reconstructed output was not detected in a fresh runtime.');
      const handle = await reopened.call('open', [finalBundle]); reopenedQuery = await reopened.call('query', [handle, defaultQuery]); await reopened.call('close', [handle]);
    } finally { const metrics = reopened.metrics(), count = reopened.artifacts().size; reopened.close(); reopened = null; accountPhase('reopen', metrics, count); }
    checks.push({name: 'independent-reopen', status: 'passed'});
    const result = {status: 'passed', checks, runtime: {phases, profile: {maxJobWallMs: budget.wallMs, maxPhaseMs: SDK_LIMITS.timeoutMs, maxJobInterrupts: SDK_LIMITS.interrupts, maxJobHostCalls: SDK_LIMITS.hostCalls}, totals: {interrupts: SDK_LIMITS.interrupts - budget.interrupts, hostCalls: SDK_LIMITS.hostCalls - budget.hostCalls, outputBytes: SDK_LIMITS.outputBytes - budget.outputBytes, outputArtifacts: SDK_LIMITS.outputArtifacts - budget.outputArtifacts}}, executionLockDigest: executionLock.digest, gameAcceptance: 'unverified', entitlement: 'host-review-required', summary: kind === 'tests' ? {description, originalQuery} : {before: originalQuery, after: reopenedQuery, changes: candidate.summary?.changes || [], candidateBundleDigest: finalBundle.bundleDigest, artifacts: descriptors}};
    if (kind === 'candidate') result.privateArtifacts = descriptors.map(descriptor => ({...descriptor, bytes: finalArtifacts.get(descriptor.id)}));
    return result;
  };
}
