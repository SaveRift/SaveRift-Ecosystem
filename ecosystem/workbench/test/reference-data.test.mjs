// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePackage, createSaveBundle} from '../../sdk/contracts.mjs';
import {createExecutionLock} from '../../sdk/registry.mjs';
import {sha256} from '../storage.mjs';
import {referenceDataFor as resolveReferences, queryReferenceResource} from '../reference-data.mjs';
import {inputs, executionHost, candidateFiles} from '../executor-shared.mjs';
import {composeExecution} from '../execution.mjs';

const encode = value => new TextEncoder().encode(value);
const primaryDigest = sha256('synthetic-primary-code');
const baseExecutionLock = createExecutionLock({connector: {id: 'test.primary', version: '0.1.0', digest: primaryDigest}});
const referenceDataFor = (primary, value, lock) => resolveReferences(primary, value, lock, lock ? undefined : baseExecutionLock.digest);
const clone = value => JSON.parse(JSON.stringify(value));
function dataPackage(text = '{"value":3}') {
  const bytes = encode(text), pkg = {
    manifest: {manifestVersion: '0.1', kind: 'data', id: 'test.managed-data', version: '0.1.0', hostApi: '>=0.1.0 <0.2.0', license: 'Apache-2.0', data: {resources: [{id: 'numbers.json', path: 'resources/numbers.json', byteLength: bytes.length, sha256: sha256(bytes)}]}, provenance: {source: 'synthetic-test-only', redistributionApproved: false}},
    files: {'resources/numbers.json': text}
  };
  return {...pkg, packageDigest: validatePackage(pkg).packageDigest};
}
const supplied = pkg => ({primaryDigest, baseExecutionLockDigest: baseExecutionLock.digest, packages: [pkg]});
function lockFor(pkg, override = {}) {
  return createExecutionLock({connector: {id: 'test.primary', version: '0.1.0', digest: primaryDigest}, dataPacks: [{id: pkg.manifest.id, version: pkg.manifest.version, digest: pkg.packageDigest, ...override}]});
}
function changed(pkg, edit) {const result = clone(pkg); delete result.packageDigest; edit(result); return result;}
const descriptor = (id, logicalPath, bytes, role = 'main') => ({id, logicalPath, role, byteLength: bytes.length, sha256: sha256(bytes)});

test('managed references are absent by default and bind immutable package/resource bytes when explicitly supplied', () => {
  const empty = {referenceData: null, packages: [], artifacts: [], resources: []};
  assert.deepEqual(referenceDataFor(primaryDigest), empty);
  assert.deepEqual(referenceDataFor(primaryDigest, null), empty);
  const pkg = dataPackage(), result = referenceDataFor(primaryDigest, supplied(pkg), lockFor(pkg)), artifact = result.artifacts[0];
  assert.equal(result.referenceData.primaryDigest, primaryDigest);
  assert.equal(result.packages.length, 1);
  assert.equal(result.packages[0].packageDigest, pkg.packageDigest);
  assert.equal(result.packages[0].manifest.provenance.redistributionApproved, false);
  assert.equal(artifact.role, 'reference-data');
  assert.equal(sha256(artifact.bytes), pkg.manifest.data.resources[0].sha256);
  assert.match(artifact.id, /^managed_[a-f0-9]{48}$/);
  assert.deepEqual(result.artifacts.map(a => a.id), referenceDataFor(primaryDigest, supplied(pkg), lockFor(pkg)).artifacts.map(a => a.id));
  assert.notEqual(artifact.id, referenceDataFor(primaryDigest, supplied(dataPackage('{"value":4}'))).artifacts[0].id);
});

test('reference binding rejects another primary, forged package pins, wrong kinds and duplicate or excess packages', () => {
  const pkg = dataPackage();
  assert.throws(() => referenceDataFor(sha256('another primary'), supplied(pkg)), {code: 'REFERENCE_DATA_BINDING_INVALID'});
  assert.throws(() => referenceDataFor(primaryDigest, {...supplied(pkg), packages: Array(9).fill(pkg)}), {code: 'REFERENCE_DATA_BINDING_INVALID'});
  assert.throws(() => referenceDataFor(primaryDigest, {...supplied(pkg), packages: [pkg, pkg]}), {code: 'REFERENCE_DATA_INVALID'});
  assert.throws(() => referenceDataFor(primaryDigest, supplied({...pkg, packageDigest: 'f'.repeat(64)})), {code: 'PACKAGE_DIGEST_MISMATCH'});
  assert.throws(() => referenceDataFor(primaryDigest, supplied(changed(pkg, p => {p.manifest.kind = 'assets';}))), {code: 'REFERENCE_DATA_INVALID'});
  assert.throws(() => referenceDataFor(primaryDigest, supplied(pkg), lockFor(pkg, {digest: '0'.repeat(64)})), {code: 'REFERENCE_DATA_LOCK_INVALID'});
  assert.throws(() => referenceDataFor(primaryDigest, supplied(pkg), lockFor(pkg, {version: '0.2.0'})), {code: 'REFERENCE_DATA_LOCK_INVALID'});
});

test('managed approval binds the complete executable closure and source flags cannot grant it', () => {
  const pkg = dataPackage(), value = supplied(pkg);
  assert.throws(() => referenceDataFor(primaryDigest, {...value, baseExecutionLockDigest: '0'.repeat(64)}), {code: 'REFERENCE_DATA_BINDING_INVALID'});
  const differentClosure = createExecutionLock({...lockFor(pkg), extensions: [{id: 'test.extra-extension', version: '0.1.0', digest: sha256('different extension')}]});
  assert.throws(() => referenceDataFor(primaryDigest, value, differentClosure), {code: 'REFERENCE_DATA_BINDING_INVALID'});
  const approvedExtension = {id: 'test.extra-extension', version: '0.1.0', digest: sha256('approved extension')}, approvedBase = createExecutionLock({...baseExecutionLock, extensions: [approvedExtension]});
  assert.throws(() => referenceDataFor(primaryDigest, {...value, baseExecutionLockDigest: approvedBase.digest}, differentClosure), {code: 'REFERENCE_DATA_BINDING_INVALID'});
  assert.throws(() => referenceDataFor(primaryDigest, {primaryDigest, packages: [pkg], approved: true}), {code: 'REFERENCE_DATA_BINDING_INVALID'});
  const game = {manifest: {manifestVersion: '0.1', kind: 'game', id: 'test.claimed-reference', version: '0.1.0', hostApi: '0.1.0', entrypoints: {runtime: 'runtime.mjs', runtimeProfile: 'isolated-js-v1'}, managedReferencesApproved: true}, files: {'runtime.mjs': 'export default {}'}};
  const primary = {...game, digest: validatePackage(game).packageDigest}, execution = composeExecution(primary);
  assert.equal(execution.referenceData, null); assert.deepEqual(execution.referenceArtifacts, []); assert.deepEqual(execution.executionLock.dataPacks, []);
});

test('every resource must have unique identifiers and paths and a matching immutable file, size and hash', () => {
  const pkg = dataPackage();
  for (const edit of [
    p => {p.manifest.data.resources.push({...p.manifest.data.resources[0]});},
    p => {p.manifest.data.resources.push({...p.manifest.data.resources[0], id: 'second.json'});},
    p => {p.manifest.data.resources[0].id = '';}
  ]) assert.throws(() => referenceDataFor(primaryDigest, supplied(changed(pkg, edit))), {code: 'REFERENCE_RESOURCE_INVALID'});
  for (const edit of [
    p => {p.manifest.data.resources[0].path = 'resources/missing.json';},
    p => {p.manifest.data.resources[0].byteLength++;},
    p => {p.manifest.data.resources[0].sha256 = '0'.repeat(64);}
  ]) assert.throws(() => referenceDataFor(primaryDigest, supplied(changed(pkg, edit))), {code: 'REFERENCE_RESOURCE_MISMATCH'});
  assert.throws(() => referenceDataFor(primaryDigest, supplied(changed(pkg, p => {p.manifest.data.resources[0].path = '../outside.json';}))), {code: 'PACKAGE_PATH_INVALID'});
  const tooMany = changed(pkg, p => {p.files = {}; p.manifest.data.resources = Array.from({length: 129}, (_, i) => {const path = 'resources/row-' + i + '.json'; p.files[path] = '{}'; return {id: 'row-' + i + '.json', path, byteLength: 2, sha256: sha256(encode('{}'))};});});
  assert.throws(() => referenceDataFor(primaryDigest, supplied(tooMany)), {code: 'REFERENCE_RESOURCE_INVALID'});
});

test('resource resolution requires the exact managed method, identifier and selected artifact handle', () => {
  const pkg = dataPackage(), result = referenceDataFor(primaryDigest, supplied(pkg)), artifact = result.artifacts[0];
  const query = {method: 'saverift.data.resource', id: 'numbers.json', artifactId: artifact.id};
  const resolved = queryReferenceResource(result.resources, query);
  assert.deepEqual(resolved.package, {id: pkg.manifest.id, version: pkg.manifest.version, digest: pkg.packageDigest});
  assert.equal(resolved.resource.sha256, pkg.manifest.data.resources[0].sha256);
  for (const invalid of [null, {...query, method: 'anything-else'}, {...query, id: 'other.json'}, {...query, artifactId: 'fixture_not_selected'}, {method: query.method, id: query.id}]) {
    assert.throws(() => queryReferenceResource(result.resources, invalid), {code: 'REFERENCE_RESOURCE_UNAVAILABLE'});
  }
  resolved.resource.sha256 = '0'.repeat(64);
  assert.equal(queryReferenceResource(result.resources, query).resource.sha256, pkg.manifest.data.resources[0].sha256);
  assert.throws(() => queryReferenceResource([...result.resources, result.resources[0]], query), {code: 'REFERENCE_RESOURCE_UNAVAILABLE'});
});

test('managed input handles cannot collide with player fixtures, and player byte pins remain enforced', () => {
  const result = referenceDataFor(primaryDigest, supplied(dataPackage())), reference = result.artifacts[0], bytes = encode('{"level":2}'), fixture = {id: 'fixture_one', name: 'save.json', role: 'main', bytes, byteLength: bytes.length, sha256: sha256(bytes)};
  const selected = inputs([fixture], result.artifacts);
  assert.equal(selected.bundle.artifacts.length, 2);
  assert.equal(selected.bundle.artifacts[0].sha256, fixture.sha256);
  assert.equal(selected.artifacts.get(reference.id), reference.bytes);
  assert.deepEqual(inputs([fixture]).bundle, createSaveBundle([descriptor(fixture.id, fixture.name, bytes)]));
  assert.throws(() => inputs([{...fixture, id: reference.id}], result.artifacts), {code: 'REFERENCE_INPUT_CONFLICT'});
  assert.throws(() => inputs([{...fixture, name: reference.name}], result.artifacts), {code: 'REFERENCE_INPUT_CONFLICT'});
  assert.throws(() => inputs([{...fixture, sha256: '0'.repeat(64)}], result.artifacts), {code: 'FIXTURE_BYTES_CHANGED'});
  assert.throws(() => inputs([{...fixture, byteLength: bytes.length + 1}], result.artifacts), {code: 'FIXTURE_BYTES_CHANGED'});
});

test('managed references stay out of candidate outputs, retained artifacts and download roles', () => {
  const result = referenceDataFor(primaryDigest, supplied(dataPackage())), reference = result.artifacts[0], bytes = encode('{"level":2}'), main = descriptor('fixture_one', 'save.json', bytes), ref = descriptor(reference.id, reference.name, reference.bytes, reference.role);
  const original = createSaveBundle([main, ref]), outputBytes = encode('{"level":3}'), output = descriptor('output_one', 'save.json', outputBytes), artifacts = new Map([[main.id, bytes], [ref.id, reference.bytes]]), outputs = new Map([[output.id, outputBytes]]), ids = new Set([reference.id]);
  const candidate = {outputs: [output], retainedInputArtifacts: []}, pkg = {manifest: {}};
  assert.deepEqual(candidateFiles(original, candidate, outputs, artifacts, pkg, ids), [output]);
  assert.throws(() => candidateFiles(original, candidate, outputs, artifacts, pkg), {code: 'CANDIDATE_MISSING_SIBLING'});
  assert.throws(() => candidateFiles(original, {...candidate, outputs: [output, ref]}, outputs, artifacts, pkg, ids), {code: 'REFERENCE_OUTPUT_FORBIDDEN'});
  assert.throws(() => candidateFiles(original, {...candidate, retainedInputArtifacts: [ref.id]}, outputs, artifacts, pkg, ids), {code: 'REFERENCE_OUTPUT_FORBIDDEN'});
  assert.throws(() => candidateFiles(original, {...candidate, outputs: [{...output, role: 'reference-data'}]}, outputs, artifacts, pkg, ids), {code: 'REFERENCE_OUTPUT_FORBIDDEN'});
  assert.throws(() => candidateFiles(original, {...candidate, outputs: [{...ref, id: 'output_copied_reference', role: 'main', logicalPath: 'save.json'}]}, new Map([['output_copied_reference', reference.bytes]]), artifacts, pkg, ids), {code: 'REFERENCE_OUTPUT_FORBIDDEN'});
});

test('managed resource queries do not replace an ordinary host catalog callback', () => {
  const result = referenceDataFor(primaryDigest, supplied(dataPackage())), artifact = result.artifacts[0], calls = [], host = {catalogQuery: value => {calls.push(value); return {normal: true};}};
  assert.equal(executionHost(host, [], []), host);
  const attached = executionHost(host, [], result.resources);
  assert.equal(attached.catalogQuery({method: 'saverift.data.resource', id: 'numbers.json', artifactId: artifact.id}).resource.id, 'numbers.json');
  assert.equal(calls.length, 0);
  assert.deepEqual(attached.catalogQuery({method: 'normal-catalog'}), {normal: true});
  assert.equal(calls.length, 1);
  assert.throws(() => attached.catalogQuery({method: 'saverift.data.resource', id: 'numbers.json', artifactId: 'wrong'}), {code: 'REFERENCE_RESOURCE_UNAVAILABLE'});
  assert.equal(calls.length, 1);
});
