// SPDX-License-Identifier: Apache-2.0
import {executionProfile} from '../sdk/execution-profiles.mjs';
import {validatePackage} from '../sdk/contracts.mjs';
import {createPluginSession, runPlugin} from '../sdk/runner.mjs';
import {createSaveBundle, LIMITS as SDK_LIMITS} from '../sdk/contracts.mjs';
import {sha256, fail} from './storage.mjs';
import {queryCatalog} from '../sdk/data.mjs';
import {operationDigest, compileOperationLog} from '../sdk/draft.mjs';
import {validateExecutionPackages} from '../sdk/registry.mjs';

import {inputs, candidateFiles, requiredChecksPassed} from './executor-shared.mjs';
import {createPhaseExecutor} from './phase-executor.mjs';

// This adapter does not load plugin code into Node/Worker globals. Every method
// runs in the SDK's separate QuickJS Wasm heap with a closed package loader.
export function createIsolatedExecutor(host = {}) {
  const executeJob = async function executeJob({kind, package: pkg, extensions = [], executionLock, dataPackages = [], catalog, catalogs = catalog ? [catalog] : [], fixtures, input, signal}) {
    validateExecutionPackages(executionLock, [pkg, ...extensions.map(e => e.package), ...dataPackages]);
    if (!fixtures.length) return {status: 'not_run', reason: 'Select an explicitly authorized fixture to run lifecycle/no-op tests.'};
    const token = host.executionProfileFor?.(validatePackage(pkg)), profile = executionProfile(token, validatePackage(pkg).packageDigest);
    const selected = inputs(fixtures), checks = [], phases = [];
    const budget = {startedAt: Date.now(), wallMs: profile.maxJobWallMs, interrupts: SDK_LIMITS.interrupts, hostCalls: SDK_LIMITS.hostCalls, outputBytes: SDK_LIMITS.outputBytes, outputArtifacts: SDK_LIMITS.outputArtifacts};
    function limitsForPhase(primary = true) {
      const remainingMs = budget.wallMs - (Date.now() - budget.startedAt);
      if (remainingMs <= 0 || signal?.aborted) fail(signal?.aborted ? 'JOB_ABORTED' : 'JOB_TIME_LIMIT', signal?.aborted ? 'The plugin job was cancelled.' : 'The offline job exceeded its total wall-clock limit.');
      if (budget.interrupts <= 0 || budget.hostCalls <= 0 || budget.outputBytes <= 0 || budget.outputArtifacts <= 0) fail('JOB_RESOURCE_LIMIT', 'The offline job exhausted its shared instruction or artifact budget.');
      return {timeoutMs: Math.min(primary ? profile.maxPhaseMs : SDK_LIMITS.timeoutMs, remainingMs), interrupts: budget.interrupts, hostCalls: budget.hostCalls, outputBytes: budget.outputBytes, outputArtifacts: budget.outputArtifacts};
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
    let inspection = await createPluginSession({package: pkg, executionLock, ...selected, signal, executionProfile: token, limits: limitsForPhase()}, pinnedHost);
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
      const result = await runPlugin({...options, artifacts: selected.artifacts, executionProfile: options.package.manifest.id === pkg.manifest.id ? token : undefined, limits: limitsForPhase(options.package.manifest.id === pkg.manifest.id)}, pinnedHost);
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
    let validator = await createPluginSession({package: pkg, executionLock, bundle: accessBundle, artifacts: finalArtifacts, signal, executionProfile: token, limits: limitsForPhase()}, pinnedHost);
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
    let reopened = await createPluginSession({package: pkg, executionLock, bundle: finalBundle, artifacts: finalArtifacts, signal, executionProfile: token, limits: limitsForPhase()}, pinnedHost);
    let reopenedQuery;
    try {
      const detected = await reopened.call('detect', [finalBundle]); if (detected?.state !== 'supported') fail('CANDIDATE_REOPEN_FAILED', 'Reconstructed output was not detected in a fresh runtime.');
      const handle = await reopened.call('open', [finalBundle]); reopenedQuery = await reopened.call('query', [handle, defaultQuery]); await reopened.call('close', [handle]);
    } finally { const metrics = reopened.metrics(), count = reopened.artifacts().size; reopened.close(); reopened = null; accountPhase('reopen', metrics, count); }
    checks.push({name: 'independent-reopen', status: 'passed'});
    const result = {status: 'passed', checks, runtime: {phases, profile: {maxJobWallMs: budget.wallMs, maxPhaseMs: profile.maxPhaseMs, id: profile.id, maxJobInterrupts: SDK_LIMITS.interrupts, maxJobHostCalls: SDK_LIMITS.hostCalls}, totals: {interrupts: SDK_LIMITS.interrupts - budget.interrupts, hostCalls: SDK_LIMITS.hostCalls - budget.hostCalls, outputBytes: SDK_LIMITS.outputBytes - budget.outputBytes, outputArtifacts: SDK_LIMITS.outputArtifacts - budget.outputArtifacts}}, executionLockDigest: executionLock.digest, gameAcceptance: 'unverified', entitlement: 'host-review-required', summary: kind === 'tests' ? {description, originalQuery} : {before: originalQuery, after: reopenedQuery, changes: candidate.summary?.changes || [], candidateBundleDigest: finalBundle.bundleDigest, artifacts: descriptors}};
    if (kind === 'candidate') result.privateArtifacts = descriptors.map(descriptor => ({...descriptor, bytes: finalArtifacts.get(descriptor.id)}));
    return result;
  };
  executeJob.step = createPhaseExecutor(host);
  return executeJob;
}
