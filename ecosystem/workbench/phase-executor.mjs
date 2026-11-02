// SPDX-License-Identifier: Apache-2.0
// Trusted-host continuation only. Checkpoints contain private outputs and must
// be encrypted, owner-bound and digest-pinned outside public job metadata.
import {Buffer} from 'node:buffer';
import {executionProfile} from '../sdk/execution-profiles.mjs';
import {validatePackage} from '../sdk/contracts.mjs';
import {createPluginSession, runPlugin} from '../sdk/runner.mjs';
import {createSaveBundle, LIMITS as SDK_LIMITS} from '../sdk/contracts.mjs';
import {canonicalJson} from '../sdk/crypto.mjs';
import {operationDigest, compileOperationLog} from '../sdk/draft.mjs';
import {validateExecutionPackages} from '../sdk/registry.mjs';
import {sha256, fail} from './storage.mjs';
import {inputs, candidateFiles, requiredChecksPassed, executionHost} from './executor-shared.mjs';
import {referenceDataFor} from './reference-data.mjs';

const SCHEMA = 'saverift.isolated-job-checkpoint.v1';
export const PHASE_CHECKPOINT_LIMITS = Object.freeze({bytes: 8 * 1024 * 1024, controlBytes: 2 * 1024 * 1024, phases: 132, jobWallMs: 60000});
const copy = value => JSON.parse(JSON.stringify(value));
const digest = value => sha256(canonicalJson(value));
const integer = value => Number.isSafeInteger(value) && value >= 0;
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const PHASE_YIELD = Symbol('one isolated engine completed');

function encodeArtifacts(map) {
  return [...map].map(([id, bytes]) => ({id, byteLength: bytes.length, sha256: sha256(bytes), data: Buffer.from(bytes).toString('base64')}));
}
function decodeArtifacts(rows) {
  if (!Array.isArray(rows) || rows.length > SDK_LIMITS.outputArtifacts) fail('JOB_CHECKPOINT_INVALID', 'Invalid private artifact checkpoint.');
  const map = new Map(); let total = 0;
  for (const row of rows) {
    if (typeof row.id !== 'string' || map.has(row.id) || !integer(row.byteLength) || !isHash(row.sha256) || typeof row.data !== 'string') fail('JOB_CHECKPOINT_INVALID', 'Invalid private artifact checkpoint.');
    const bytes = new Uint8Array(Buffer.from(row.data, 'base64'));
    if (bytes.length !== row.byteLength || row.data !== Buffer.from(bytes).toString('base64') || sha256(bytes) !== row.sha256) fail('JOB_CHECKPOINT_INVALID', 'Private checkpoint artifact bytes changed.');
    total += bytes.length; if (total > SDK_LIMITS.outputBytes) fail('JOB_CHECKPOINT_INVALID', 'Private checkpoint artifacts exceed their shared budget.');
    map.set(row.id, bytes);
  }
  return map;
}
function boundedCheckpoint(state) {
  const control = {...state, runs: state.runs.map(run => ({...run, artifacts: run.artifacts.map(({data, ...entry}) => entry)}))};
  if (Buffer.byteLength(JSON.stringify(control)) > PHASE_CHECKPOINT_LIMITS.controlBytes || Buffer.byteLength(JSON.stringify(state)) > PHASE_CHECKPOINT_LIMITS.bytes) fail('JOB_CHECKPOINT_LIMIT', 'The private continuation exceeds the hosted checkpoint quota.');
  return copy(state);
}

/** Advance at most one fresh isolated engine; no completed engine is replayed. */
export function createPhaseExecutor(host = {}) {
  return async function step({kind, package: pkg, extensions = [], executionLock, dataPackages = [], referenceData, catalog, catalogs = catalog ? [catalog] : [], fixtures, input = {}, signal, jobStartedAt}, checkpoint = null) {
    validateExecutionPackages(executionLock, [pkg, ...extensions.map(e => e.package), ...dataPackages]);
    if (!fixtures.length) return {done: true, result: {status: 'not_run', reason: 'Select an explicitly authorized fixture to run lifecycle/no-op tests.'}};
    if (!['inspect', 'tests', 'candidate'].includes(kind)) fail('JOB_KIND_INVALID', 'The isolated continuation kind is unsupported.');
    const primary = validatePackage(pkg), token = host.executionProfileFor?.(primary), profile = executionProfile(token, primary.packageDigest), managed = referenceDataFor(primary.packageDigest, referenceData, executionLock);
    const jobCeilings={...SDK_LIMITS,hostCalls:profile.maxJobHostCalls??SDK_LIMITS.hostCalls};
    const selected = inputs(fixtures, managed.artifacts), managedIds = new Set(managed.artifacts.map(value => value.id)), operations = kind === 'tests' ? [] : input.operations;
    const binding = digest({profile, kind, bundle: selected.bundle.bundleDigest, executionLock: executionLock.digest, operations: operations || null, query: input.query || null, catalogs});
    const state = checkpoint ? copy(checkpoint) : {schema: SCHEMA, binding, startedAt: jobStartedAt ?? Date.now(), phase: 'inspection', checks: [], phases: [], runs: []};
    if (state.schema !== SCHEMA || state.binding !== binding || !integer(state.startedAt) || state.startedAt > Date.now() || !['inspection', 'compile', 'validation', 'reopen'].includes(state.phase) || !Array.isArray(state.checks) || !Array.isArray(state.phases) || !Array.isArray(state.runs) || state.phases.length > PHASE_CHECKPOINT_LIMITS.phases || state.runs.length > 129) fail('JOB_CHECKPOINT_INVALID', 'This continuation belongs to another immutable input or is malformed.');
    boundedCheckpoint(state);
    const consumed = {interrupts: 0, hostCalls: 0, outputBytes: 0, outputArtifacts: 0};
    for (const phase of state.phases) {
      for (const key of Object.keys(consumed)) {
        const value = key === 'outputArtifacts' ? phase.createdArtifacts : phase[key];
        if (!integer(value)) fail('JOB_CHECKPOINT_INVALID', 'Invalid continuation resource ledger.');
        consumed[key] += value;
      }
    }
    const budget = (primary = true) => {
      const left = profile.maxJobWallMs - (Date.now() - state.startedAt);
      if (signal?.aborted || left <= 0) fail(signal?.aborted ? 'JOB_ABORTED' : 'JOB_TIME_LIMIT', signal?.aborted ? 'The plugin job was cancelled.' : 'The complete job deadline includes pauses between phases.');
      const remaining = Object.fromEntries(Object.entries(consumed).map(([key, value]) => [key, jobCeilings[key] - value]));
      if(!primary)remaining.hostCalls=Math.min(remaining.hostCalls,SDK_LIMITS.hostCalls-state.phases.filter(p=>p.phase==='extension').reduce((n,p)=>n+p.hostCalls,0));
      if (Object.values(remaining).some(value => value <= 0)) fail('JOB_RESOURCE_LIMIT', 'The shared isolated job budget is exhausted.');
      return {...remaining, timeoutMs: Math.min(primary ? profile.maxPhaseMs : SDK_LIMITS.timeoutMs, left)};
    };
    budget();
    function account(name, metrics, count = 0, packageId) {
      const row = {phase: name, ...(packageId ? {packageId} : {}), ...metrics, createdArtifacts: count};
      for (const key of Object.keys(consumed)) {const value = key === 'outputArtifacts' ? count : metrics[key]; if (!integer(value)) fail('RUNNER_METRICS_INVALID', 'The runner resource report is invalid.'); consumed[key] += value; if (consumed[key] > jobCeilings[key]) fail('JOB_RESOURCE_LIMIT', 'The shared isolated job budget was exceeded.');}
      state.phases.push(row); budget();
    }
    const pinnedHost = executionHost(host, catalogs, managed.resources);
    const pending = () => ({done: false, checkpoint: boundedCheckpoint(state), progress: {phase: state.phase, completedEngines: state.phases.length, elapsedMs: Date.now() - state.startedAt}});
    let engineUsed = false;
    if (state.phase === 'inspection') {
      let inspection = await createPluginSession({package: pkg, executionLock, ...selected, signal, executionProfile: token, limits: budget()}, pinnedHost), inspectResult;
      try {
        if ((await inspection.call('detect', [selected.bundle]))?.state !== 'supported') fail('FORMAT_NOT_SUPPORTED', 'The plugin did not detect the selected fixture family.');
        state.checks.push({name: 'detect', status: 'passed'});
        const handle = await inspection.call('open', [selected.bundle]); state.checks.push({name: 'open-original', status: 'passed'});
        state.description = await inspection.call('describe', [handle]);
        state.defaultQuery = pkg.manifest.workbench?.defaultQuery || state.description.defaultQuery || {method: Object.keys(state.description.domainApis || pkg.manifest.extensionApis || {})[0]};
        state.originalQuery = await inspection.call('query', [handle, state.defaultQuery]); state.checks.push({name: 'describe-query', status: 'passed'});
        if (kind === 'inspect') inspectResult = input.query ? await inspection.call('query', [handle, input.query]) : state.originalQuery;
        await inspection.call('close', [handle]);
      } finally {const metrics = inspection.metrics(), count = inspection.artifacts().size; inspection.close(); inspection = null; account('inspection', metrics, count);}
      if (kind === 'inspect') return {done: true, result: {status: 'passed', description: state.description, data: inspectResult, runtime: state.phases[0], executionLockDigest: executionLock.digest, gameAcceptance: 'unverified'}};
      state.phase = 'compile'; return pending();
    }
    let planned;
    async function compilation() {
      let callIndex = 0;
      const run = async options => {
        const signature = digest({packageId: options.package.manifest.id, method: options.method, input: options.input || null, args: options.args || null});
        const stored = state.runs[callIndex++];
        if (stored) {
          if (stored.signature !== signature || !Array.isArray(stored.artifacts)) fail('JOB_CHECKPOINT_INVALID', 'The continuation call sequence changed.');
          return {result: copy(stored.result), artifacts: decodeArtifacts(stored.artifacts), metrics: copy(stored.metrics)};
        }
        if (engineUsed) fail('JOB_PHASE_INVARIANT', 'Only one new isolated engine may run in an invocation.');
        engineUsed = true;
        const primary = options.package.manifest.id === pkg.manifest.id;
        const value = await runPlugin({...options, artifacts: selected.artifacts, executionProfile: primary ? token : undefined, limits: budget(primary)}, pinnedHost);
        account(primary ? 'serialization' : 'extension', value.metrics, value.artifacts.size, options.package.manifest.id);
        if (!primary && value.artifacts.size) fail('EXTENSION_OUTPUT_FORBIDDEN', 'Extensions cannot serialize save artifacts.');
        state.runs.push({signature, method: options.method, result: copy(primary ? value.result : {operations: value.result?.operations}), artifacts: encodeArtifacts(value.artifacts), metrics: copy(value.metrics)});
        boundedCheckpoint(state);
        throw PHASE_YIELD;
      };
      const result = await compileOperationLog({bundle: selected.bundle, operations, executionLock, connector: {package: pkg}, extensions, document: state.originalQuery, run, signal});
      if (callIndex !== state.runs.length) fail('JOB_CHECKPOINT_INVALID', 'The continuation contains unconsumed calls.');
      return result;
    }
    try { planned = await compilation(); } catch (error) {if (error === PHASE_YIELD) return pending(); throw error;}
    const candidate = planned.result, outputs = planned.artifacts;
    if (candidate.inputBundleDigest !== selected.bundle.bundleDigest || candidate.executionLockDigest !== executionLock.digest || candidate.operationDigest !== operationDigest(operations)) fail('CANDIDATE_BINDING_INVALID', 'Candidate source, dependency lock or operation binding changed.');
    const descriptors = candidateFiles(selected.bundle, candidate, outputs, selected.artifacts, pkg, managedIds), finalArtifacts = new Map([...selected.artifacts, ...outputs]);
    if (state.phase === 'compile') state.phase = 'validation';
    if (state.phase === 'validation') {
      const newlySelected = [...outputs].filter(([id]) => !selected.artifacts.has(id)).map(([id, bytes]) => candidate.outputs.find(item => item.id === id) || {id, logicalPath: `reports/${id}.json`, role: 'validation-report', byteLength: bytes.length, sha256: sha256(bytes)});
      const accessBundle = createSaveBundle([...selected.bundle.artifacts, ...newlySelected], {id: 'validation-access'});
      let validator = await createPluginSession({package: pkg, executionLock, bundle: accessBundle, artifacts: finalArtifacts, signal, executionProfile: token, limits: budget()}, pinnedHost);
      try {
        const validation = await validator.call('validate', [selected.bundle, candidate]);
        if (!requiredChecksPassed(validation) || !requiredChecksPassed(candidate.validation)) fail('CANDIDATE_VALIDATION_FAILED', 'Required candidate validation checks did not all pass.');
        state.checks.push({name: 'candidate-validation', status: 'passed'});
      } finally {const metrics = validator.metrics(), count = validator.artifacts().size; validator.close(); validator = null; account('validation', metrics, count);}
      if (kind === 'tests') {
        for (const descriptor of descriptors) {const prior = selected.bundle.artifacts.find(item => item.logicalPath === descriptor.logicalPath && item.role === descriptor.role), actual = finalArtifacts.get(descriptor.id); if (!prior || !actual || sha256(actual) !== prior.sha256) fail('NOOP_BYTES_CHANGED', 'The no-op round trip changed original artifact bytes.');}
        state.checks.push({name: 'no-op-byte-parity', status: 'passed'});
      }
      state.phase = 'reopen'; return pending();
    }
    if (state.phase !== 'reopen') fail('JOB_CHECKPOINT_INVALID', 'The continuation phase is invalid.');
    const supporting = selected.bundle.artifacts.filter(item => (managedIds.has(item.id) || (pkg.manifest.workbench?.inputOnlyRoles || []).includes(item.role)) && !descriptors.some(descriptor => descriptor.id === item.id));
    const finalBundle = createSaveBundle([...descriptors, ...supporting], {id: 'candidate'});
    let reopened = await createPluginSession({package: pkg, executionLock, bundle: finalBundle, artifacts: finalArtifacts, signal, executionProfile: token, limits: budget()}, pinnedHost), reopenedQuery;
    try {
      if ((await reopened.call('detect', [finalBundle]))?.state !== 'supported') fail('CANDIDATE_REOPEN_FAILED', 'Reconstructed output was not detected in a fresh runtime.');
      const handle = await reopened.call('open', [finalBundle]); reopenedQuery = await reopened.call('query', [handle, state.defaultQuery]); await reopened.call('close', [handle]);
    } finally {const metrics = reopened.metrics(), count = reopened.artifacts().size; reopened.close(); reopened = null; account('reopen', metrics, count);}
    state.checks.push({name: 'independent-reopen', status: 'passed'});
    const result = {status: 'passed', checks: state.checks, runtime: {phases: state.phases, profile: {id: profile.id, maxJobWallMs: profile.maxJobWallMs, maxPhaseMs: profile.maxPhaseMs, maxJobInterrupts: SDK_LIMITS.interrupts, maxJobHostCalls: jobCeilings.hostCalls, resumable: true, checkpointBytes: PHASE_CHECKPOINT_LIMITS.bytes}, totals: consumed}, executionLockDigest: executionLock.digest, gameAcceptance: 'unverified', entitlement: 'host-review-required', summary: kind === 'tests' ? {description: state.description, originalQuery: state.originalQuery} : {before: state.originalQuery, after: reopenedQuery, changes: candidate.summary?.changes || [], candidateBundleDigest: finalBundle.bundleDigest, artifacts: descriptors}};
    if (kind === 'candidate') result.privateArtifacts = descriptors.map(descriptor => ({...descriptor, bytes: finalArtifacts.get(descriptor.id)}));
    return {done: true, result};
  };
}
