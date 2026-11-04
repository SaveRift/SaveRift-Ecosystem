// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createIsolatedExecutor} from '../executor.mjs';
import {TEMPLATES} from '../templates.mjs';
import {packageFromSource, composeExecution} from '../execution.mjs';
import {validatePackage, LIMITS as SDK_LIMITS} from '../../sdk/contracts.mjs';
import {PHASE_CHECKPOINT_LIMITS} from '../phase-executor.mjs';
import {sha256} from '../storage.mjs';

const encode = text => new TextEncoder().encode(text);
function fixture(kind = 'candidate') {
  const template = TEMPLATES.find(value => value.id === 'synthetic-json'), packaged = packageFromSource(template.files);
  const primary = {manifest: packaged.manifest, files: packaged.files, digest: packaged.packageDigest};
  return {kind, package: primary, executionLock: composeExecution(primary).executionLock, fixtures: [{id: 'fixture_synthetic', name: 'synthetic.save.json', role: 'main', bytes: encode(template.fixture.text)}], input: {operations: [{instanceId: 'test-level', id: 'synthetic.level.set', apiVersion: '0.1.0', params: {level: 12}}]}};
}
async function complete(args) {
  let checkpoint, calls = 0, before = 0;
  for (;;) {
    // A new host function and JSON round trip simulate process/request changes;
    // completed guest engines must never be retained or rerun.
    const value = await createIsolatedExecutor().step(args, checkpoint);
    calls++;
    if (value.done) return {...value, calls};
    assert.equal(value.checkpoint.phases.length, before + 1);
    before = value.checkpoint.phases.length;
    assert.ok(value.progress.completedEngines > 0);
    checkpoint = JSON.parse(JSON.stringify(value.checkpoint));
    if (calls > 132) throw Error('Continuation did not finish.');
  }
}

test('fresh-engine continuations preserve full executor candidate checks and bytes', async () => {
  const args = fixture(), original = await createIsolatedExecutor()(args), resumed = await complete(args);
  assert.equal(resumed.calls, 4);
  assert.equal(resumed.result.status, 'passed');
  assert.deepEqual(resumed.result.checks, original.checks);
  assert.deepEqual(resumed.result.summary.before, original.summary.before);
  assert.deepEqual(resumed.result.summary.after, original.summary.after);
  assert.equal(resumed.result.summary.after.level, 12);
  assert.deepEqual(resumed.result.privateArtifacts.map(a => [...a.bytes]), original.privateArtifacts.map(a => [...a.bytes]));
  assert.deepEqual(resumed.result.runtime.phases.map(p => p.phase), ['inspection', 'serialization', 'validation', 'reopen']);
  for (const key of ['interrupts', 'hostCalls', 'outputBytes']) assert.equal(resumed.result.runtime.totals[key], resumed.result.runtime.phases.reduce((n, p) => n + p[key], 0));
});

test('no-op and inspect preserve their distinct checks without claiming game acceptance', async () => {
  const result = await complete(fixture('tests'));
  assert.equal(result.result.status, 'passed');
  assert.ok(result.result.checks.some(check => check.name === 'no-op-byte-parity'));
  assert.ok(result.result.checks.some(check => check.name === 'independent-reopen'));
  assert.equal(result.result.gameAcceptance, 'unverified');
  assert.equal(result.result.privateArtifacts, undefined);
  const inspect = fixture('inspect'); inspect.input = {query: {domain: 'summary'}};
  const one = await createIsolatedExecutor().step(inspect);
  assert.equal(one.done, true); assert.equal(one.result.status, 'passed'); assert.equal(one.result.data.level, 7);
});

test('changing immutable input, package or cached calls cannot resume old evidence', async () => {
  const args = fixture(), first = await createIsolatedExecutor().step(args);
  const changed = structuredClone(args); changed.fixtures[0].bytes = encode('{"format":"saverift-synthetic-v1","level":9}');
  await assert.rejects(createIsolatedExecutor().step(changed, first.checkpoint), {code: 'JOB_CHECKPOINT_INVALID'});
  const operation = structuredClone(args); operation.input.operations[0].params.level = 15;
  await assert.rejects(createIsolatedExecutor().step(operation, first.checkpoint), {code: 'JOB_CHECKPOINT_INVALID'});
  const packageChanged = structuredClone(args); packageChanged.package.files['runtime/index.mjs'] += '\n// changed';
  await assert.rejects(createIsolatedExecutor().step(packageChanged, first.checkpoint));
  const planned = await createIsolatedExecutor().step(args, first.checkpoint);
  const calls = structuredClone(planned.checkpoint); calls.runs[0].signature = '0'.repeat(64);
  await assert.rejects(createIsolatedExecutor().step(args, calls), {code: 'JOB_CHECKPOINT_INVALID'});
  const bytes = structuredClone(planned.checkpoint); bytes.runs[0].artifacts[0].data = Buffer.from('changed').toString('base64');
  await assert.rejects(createIsolatedExecutor().step(args, bytes), {code: 'JOB_CHECKPOINT_INVALID'});
});

test('shared deadline, resource ledger, cancellation and checkpoint quotas stay bounded', async () => {
  const args = fixture(), first = await createIsolatedExecutor().step(args), expired = structuredClone(first.checkpoint);
  expired.startedAt = Date.now() - PHASE_CHECKPOINT_LIMITS.jobWallMs - 1;
  await assert.rejects(createIsolatedExecutor().step(args, expired), {code: 'JOB_TIME_LIMIT'});
  const exhausted = structuredClone(first.checkpoint); exhausted.phases[0].interrupts = SDK_LIMITS.interrupts;
  await assert.rejects(createIsolatedExecutor().step(args, exhausted), {code: 'JOB_RESOURCE_LIMIT'});
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(createIsolatedExecutor().step({...args, signal: cancelled.signal}, first.checkpoint), {code: 'JOB_ABORTED'});
  const large = structuredClone(first.checkpoint); large.description = {text: 'x'.repeat(PHASE_CHECKPOINT_LIMITS.controlBytes)};
  await assert.rejects(createIsolatedExecutor().step(args, large), {code: 'JOB_CHECKPOINT_LIMIT'});
});

test('each extension expansion advances independently before one connector serializer', async () => {
  const base = new URL('../../plugins/', import.meta.url), manifest = JSON.parse(await readFile(new URL('synthetic-game/manifest.json', base), 'utf8'));
  const game = {manifest, files: {'runtime/connector.mjs': await readFile(new URL('synthetic-game/connector.mjs', base), 'utf8')}};
  const em = JSON.parse(await readFile(new URL('synthetic-extension/manifest.json', base), 'utf8')), files = {};
  for (const path of [em.entrypoints.runtime, ...Object.values(em.ui), ...em.operations.map(op => op.inputSchema)]) files[path] = await readFile(new URL('synthetic-extension/' + path, base), 'utf8');
  const extension = {manifest: em, files}, primary = {...game, digest: validatePackage(game).packageDigest}, ext = {...extension, digest: validatePackage(extension).packageDigest};
  const args = {kind: 'candidate', package: game, extensions: [{package: extension}], executionLock: composeExecution(primary, [ext]).executionLock, fixtures: [{id: 'fixture_world', name: 'world.save', role: 'world', bytes: new Uint8Array(await readFile(new URL('synthetic-game/fixture.save', base)))}], input: {operations: [{instanceId: 'level-eight', id: 'example.level-tools.setLevel', apiVersion: '0.1.0', params: {targetLevel: 8}}]}};
  const result = await complete(args);
  assert.equal(result.calls, 5);
  assert.equal(result.result.summary.after.progression.level, 8);
  assert.equal(result.result.runtime.phases.filter(p => p.phase === 'extension').length, 1);
  assert.equal(result.result.runtime.phases.filter(p => p.phase === 'serialization').length, 1);
});

test('size-equivalent prepared save resumes using private output references within existing limits', async () => {
  const files = {...TEMPLATES.find(value => value.id === 'blank').files}, manifest = JSON.parse(files['manifest.json']);
  manifest.workbench = {inputOnlyRoles: ['input-only-transform']}; files['manifest.json'] = JSON.stringify(manifest);
  files['runtime/index.mjs'] = `export default {
    detect(){return {state:'supported'}},open(b){return {byteLength:b.artifacts[0].byteLength}},
    describe(){return {domainApis:{'test.size':'0.1.0'},defaultQuery:{method:'test.size'}}},query(v){return v},
    plan(b,p,c){const main=b.artifacts[0],out=c.writeArtifact({logicalPath:main.logicalPath,role:main.role},c.readArtifact(main.id));return {inputBundleDigest:b.bundleDigest,executionLockDigest:c.executionLock.digest,operationDigest:p.operationDigest,outputs:[out],retainedInputArtifacts:b.artifacts.slice(1).filter(a=>a.role!=='input-only-transform').map(a=>a.id),summary:{changes:[]},requirements:[],validation:{checks:[{checkId:'test.size',result:'passed',required:true}],gameAcceptance:'unverified'}}},
    validate(){return {checks:[{checkId:'test.size',result:'passed',required:true}],gameAcceptance:'unverified'}},close(){}
  };`;
  const packaged = packageFromSource(files), primary = {manifest: packaged.manifest, files: packaged.files, digest: packaged.packageDigest};
  const main = new Uint8Array(7459585).fill(19), sibling = new Uint8Array(901776).fill(29), secret = new Uint8Array(32).fill(211);
  const stored = new Map(), checkpointArtifacts = {async write(d, bytes) {assert.equal(d.sha256, sha256(main)); stored.set(d.sha256, bytes.slice()); return d.sha256;}, async read(d) {return stored.get(d.ref)?.slice();}};
  const args = {kind: 'tests', package: primary, executionLock: composeExecution(primary).executionLock, fixtures: [{id: 'main', name: 'size.main', role: 'main', bytes: main}, {id: 'sibling', name: 'size.sibling', role: 'sibling', bytes: sibling}, {id: 'input_only', name: 'transform.private', role: 'input-only-transform', bytes: secret}], input: {operations: []}, checkpointArtifacts};
  let checkpoint, result, calls = 0;
  do {
    result = await createIsolatedExecutor().step(args, checkpoint); calls++;
    if (!result.done) {
      assert.ok(Buffer.byteLength(JSON.stringify(result.checkpoint)) < 16384);
      assert.equal(JSON.stringify(result.checkpoint).includes('"data"'), false);
      checkpoint = JSON.parse(JSON.stringify(result.checkpoint));
    }
  } while (!result.done && calls < 5);
  assert.equal(calls, 4); assert.equal(result.result.status, 'passed');
  assert.equal(result.result.runtime.profile.checkpointBytes, 8 * 1024 * 1024);
  assert.equal(stored.size, 1); assert.equal(stored.has(sha256(secret)), false);
  assert.ok(result.result.runtime.phases.every(phase => phase.memoryBytes <= SDK_LIMITS.memoryBytes));
  assert.ok(result.result.checks.some(check => check.name === 'no-op-byte-parity'));
});

test('referenced outputs require trusted storage and exact actual bytes on resume', async () => {
  const stored = new Map(), checkpointArtifacts = {async write(d, bytes) {stored.set(d.sha256, bytes.slice()); return d.sha256;}, async read(d) {return stored.get(d.ref);}};
  const args = {...fixture(), checkpointArtifacts}, first = await createIsolatedExecutor().step(args), second = await createIsolatedExecutor().step(args, first.checkpoint);
  const reference = second.checkpoint.runs[0].artifacts[0];
  assert.equal(reference.ref, reference.sha256); assert.equal(reference.data, undefined);
  await assert.rejects(createIsolatedExecutor().step({...args, checkpointArtifacts: undefined}, second.checkpoint), {code: 'JOB_CHECKPOINT_INVALID'});
  stored.set(reference.ref, encode('tampered'));
  await assert.rejects(createIsolatedExecutor().step(args, second.checkpoint), {code: 'JOB_CHECKPOINT_INVALID'});
  const invalid = structuredClone(second.checkpoint); invalid.runs[0].artifacts[0].byteLength = SDK_LIMITS.artifactBytes + 1;
  await assert.rejects(createIsolatedExecutor().step(args, invalid), {code: 'JOB_CHECKPOINT_INVALID'});
});
