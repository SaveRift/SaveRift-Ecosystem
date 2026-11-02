// SPDX-License-Identifier: Apache-2.0
// All resources, fixtures and principals in these tests are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceService} from '../service.mjs';
import {createMemoryStore, sha256} from '../storage.mjs';
import {templateFromPackage} from '../execution.mjs';
import {createIsolatedExecutor} from '../executor.mjs';
import {DEFAULT_SCOPES} from '../tool-definitions.mjs';
import {createGameAccess} from '../../collaboration/enrollment.mjs';
import {validatePackage} from '../../sdk/contracts.mjs';

const alice = {id: 'synthetic-reference-owner', scopes: [...DEFAULT_SCOPES]}, bob = {id: 'another-reference-owner', scopes: [...DEFAULT_SCOPES]};
const code = `const read=b=>JSON.parse(String.fromCharCode(...b));const encode=v=>Uint8Array.from(JSON.stringify(v),c=>c.charCodeAt(0));
function original(bundle,ctx){const main=bundle.artifacts.find(a=>a.role==='main'),ref=bundle.artifacts.find(a=>a.role==='reference-data');if(!main||!ref)throw Error('Managed reference required');const d=ctx.catalogQuery({method:'saverift.data.resource',id:'numbers.json',artifactId:ref.id});if(d.resource.sha256!==ref.sha256||!ctx.executionLock.dataPacks.some(p=>p.id===d.package.id&&p.digest===d.package.digest))throw Error('Reference pin changed');return{main,bytes:ctx.readArtifact(main.id),value:read(ctx.readArtifact(main.id)),reference:read(ctx.readArtifact(ref.id))};}
export default{detect(b,c){original(b,c);return{state:'supported'}},open(b,c){const s=original(b,c);return{level:s.value.level,reference:s.reference.marker}},describe(){return{defaultQuery:{method:'summary'},domainApis:{'test.reference.document':'0.1.0'}}},query(v){return v},plan(b,p,c){const s=original(b,c);for(const op of p.operations)s.value.level=op.params.level;const out=c.writeArtifact({logicalPath:s.main.logicalPath,role:'main'},p.operations.length?encode(s.value):s.bytes);return{inputBundleDigest:b.bundleDigest,executionLockDigest:c.executionLock.digest,operationDigest:p.operationDigest,outputs:[out],retainedInputArtifacts:[],summary:{changes:[]},requirements:[],validation:{checks:[{checkId:'test.structure',result:'passed',required:true}]}}},validate(b,p,c){original(b,c);for(const out of p.outputs)if(!Number.isSafeInteger(read(c.readArtifact(out.id)).level))throw Error('Invalid level');return{checks:[{checkId:'test.structure',result:'passed',required:true}]}},close(){}};`;
const pkg = {manifest: {manifestVersion: '0.1', id: 'test.reference-game', kind: 'game', version: '0.1.0', hostApi: '>=0.1.0 <0.2.0', license: 'Apache-2.0', entrypoints: {runtime: 'runtime.mjs', runtimeProfile: 'isolated-js-v1'}, operations: [{id: 'test.level.set', apiVersion: '0.1.0', inputSchema: {type: 'object', properties: {level: {type: 'integer'}}, required: ['level'], additionalProperties: false}, writeDomains: [{path: 'level', mode: 'ordered'}]}]}, files: {'runtime.mjs': code}};
const primaryDigest = validatePackage(pkg).packageDigest;
const extension = {manifest: {manifestVersion: '0.1', kind: 'extension', id: 'test.reference-extension', version: '0.1.0', hostApi: '0.1.0', entrypoints: {runtime: 'runtime.mjs', runtimeProfile: 'isolated-js-v1'}, managedReferencesApproved: true}, files: {'runtime.mjs': 'export default {describe(){return {}}}'} };
function dataPackage(marker = 'synthetic-private-provider') {
  const bytes = new TextEncoder().encode(JSON.stringify({marker}));
  return {manifest: {manifestVersion: '0.1', id: 'test.private-reference', kind: 'data', version: '0.1.0', hostApi: '0.1.0', license: 'LicenseRef-Synthetic-Private-Test', provenance: {redistributionApproved: false}, data: {resources: [{id: 'numbers.json', path: 'resources/numbers.json', sha256: sha256(bytes), byteLength: bytes.length}]}}, files: {'resources/numbers.json': bytes}};
}
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};};
async function harness({resumable = true, enrolled = false} = {}) {
  const store = createMemoryStore(), tasks = [], access = enrolled ? createGameAccess({store}) : undefined;
  if (access) await access.enroll(alice, {gameId: 'synthetic', expectedRevision: 0});
  let currentData = dataPackage(), lookup = async ({baseExecutionLockDigest}) => ({primaryDigest, baseExecutionLockDigest, packages: [currentData]});
  const executor = createIsolatedExecutor(), execute = Object.assign(async args => {return executor(args);}, {step: async (...args) => {return executor.step(...args);}});
  const service = () => createWorkspaceService({store, access, collaboration: access ? {verifyDiscovery: async () => ({})} : undefined, templates: [{...templateFromPackage(pkg), id: 'synthetic-json', fixture: {name: 'synthetic.json', role: 'main', text: '{"level":7}'}}, templateFromPackage(extension, {id: 'test-extension'})], resolveReferenceData: args => lookup(args), executeJob: execute, resumableJobs: resumable, schedule: p => tasks.push(p)});
  const call = (name, args, principal = alice, context) => service().dispatch(principal, 'saverift_' + name, args, context);
  const workspace = (await call('workspace_create', {template: 'synthetic-json', name: 'Managed reference test', ...(enrolled ? {gameId: 'synthetic', discoveryId: 'discovery_example123'} : {})})).workspace;
  const built = await call('plugin_build', {workspaceId: workspace.id, expectedRevision: workspace.revision}); await Promise.all(tasks.splice(0));
  const artifactId = (await call('job_status', {workspaceId: workspace.id, jobId: built.jobId})).job.result.artifactId;
  const args = {workspaceId: workspace.id, artifactId, fixtureIds: workspace.fixtures.map(value => value.id)};
  async function buildExtension() {const w = (await call('workspace_create', {template: 'test-extension', name: 'Independent synthetic extension'})).workspace, b = await call('plugin_build', {workspaceId: w.id, expectedRevision: w.revision}); await Promise.all(tasks.splice(0)); return (await call('job_status', {workspaceId: w.id, jobId: b.jobId})).job.result.artifactId;}
  return {store, access, tasks, service, call, args, buildExtension, setData(value) {currentData = value;}, setLookup(value) {lookup = value;}};
}

for (const resumable of [false, true]) test(`managed providers bind the shared draft, ${resumable ? 'resumed' : 'full'} runner and fresh reopen without entering source/fixtures/downloads`, async () => {
  const h = await harness({resumable}), preview = await h.call('preview_open', h.args);
  const draft = await h.service().readPreviewDraft(alice, preview.previewId), inspected = await h.service().queryPreview(alice, preview.previewId, {method: 'summary'});
  assert.equal(inspected.data.reference, 'synthetic-private-provider');
  const start = await h.call('candidate_prepare', {...h.args, operations: [{id: 'test.level.set', apiVersion: '0.1.0', params: {level: 12}}]});
  if (!resumable) await Promise.all(h.tasks.splice(0));
  let result; for (let i = 0; i < 5; i++) {result = await h.call('job_status', {workspaceId: h.args.workspaceId, jobId: start.jobId}); if (result.status === 'passed' || result.status === 'failed') break;}
  assert.equal(result.status, 'passed', JSON.stringify(result)); assert.equal(result.job.result.summary.after.level, 12);
  assert.equal(result.job.result.summary.before.reference, 'synthetic-private-provider');
  const currentDraft = await h.service().readPreviewDraft(alice, preview.previewId); assert.equal(currentDraft.baseBundleDigest, draft.baseBundleDigest); assert.equal(currentDraft.executionLockDigest, preview.executionLockDigest);
  const downloaded = await h.service().downloadCandidate(alice, start.jobId); assert.equal(downloaded.artifacts.length, 1); assert.equal(downloaded.artifacts[0].role, 'main');
  assert.equal(JSON.parse(Buffer.from(downloaded.artifacts[0].bytes, 'base64')).level, 12);
  const exported = await h.call('workspace_export', {workspaceId: h.args.workspaceId}); assert.equal(JSON.stringify(exported).includes('synthetic-private-provider'), false); assert.equal(Object.keys(exported.files).some(path => path.includes('resources/')), false);
  const status = await h.call('workspace_status', {workspaceId: h.args.workspaceId}); assert.equal(status.workspace.fixtures.length, 1); assert.equal(status.workspace.fixtures[0].aiAccess, false);
  await assert.rejects(h.service().downloadCandidate(bob, start.jobId), {code: 'OBJECT_NOT_FOUND'});
  h.setData(dataPackage('new-reference-revision'));
  assert.deepEqual((await h.service().downloadCandidate(alice, start.jobId)).artifacts, downloaded.artifacts);
});

test('changed managed packages invalidate captured preview/job locks and cannot resume old state', async () => {
  const h = await harness(), preview = await h.call('preview_open', h.args), start = await h.call('tests_run', h.args);
  h.setData(dataPackage('different-synthetic-reference'));
  await assert.rejects(h.service().queryPreview(alice, preview.previewId, {method: 'summary'}), {code: 'DEPENDENCY_MISMATCH'});
  const stopped = await h.call('job_status', {workspaceId: h.args.workspaceId, jobId: start.jobId}); assert.equal(stopped.status, 'failed'); assert.equal(stopped.job.result.code, 'DEPENDENCY_MISMATCH');
  assert.equal(stopped.job.progress.completedEngines, 1);
  assert.equal((await h.store.list('developers/', 1000)).some(row => row.key.includes('/jobcheckpoints/')), false);
  await assert.rejects(h.service().downloadCandidate(alice, start.jobId), {code: 'VALIDATED_CANDIDATE_REQUIRED'});
});

test('another account cannot reach the managed resolver through an owned artifact or preview', async () => {
  const h = await harness(); let lookups = 0;
  h.setLookup(async ({baseExecutionLockDigest}) => {lookups++; return {primaryDigest, baseExecutionLockDigest, packages: [dataPackage()]};});
  await assert.rejects(h.call('tests_run', h.args, bob), {code: 'WORKSPACE_NOT_FOUND'});
  await assert.rejects(h.call('preview_open', h.args, bob), {code: 'WORKSPACE_NOT_FOUND'});
  assert.equal(lookups, 0);
});

test('an extension cannot reuse a primary-only managed-data approval, even with a claimed source permission', async () => {
  const h = await harness(); let approvedDigest, observed;
  h.setLookup(async request => {observed = request; approvedDigest ??= request.baseExecutionLockDigest; return {primaryDigest, baseExecutionLockDigest: approvedDigest, packages: [dataPackage()]};});
  await h.call('preview_open', h.args); assert.deepEqual(observed.extensions, []);
  const extensionArtifactId = await h.buildExtension();
  await assert.rejects(h.call('tests_run', {...h.args, extensionArtifactIds: [extensionArtifactId]}), {code: 'REFERENCE_DATA_BINDING_INVALID'});
  assert.deepEqual(observed.primary, {id: pkg.manifest.id, version: pkg.manifest.version, digest: primaryDigest});
  assert.deepEqual(observed.extensions, [{id: extension.manifest.id, version: extension.manifest.version, digest: validatePackage(extension).packageDigest}]);
  assert.notEqual(observed.baseExecutionLockDigest, approvedDigest);
});

test('managed lookup never grants AI consent for an uploaded private fixture', async () => {
  const h = await harness(), bytes = new TextEncoder().encode('{"level":8}'), intent = await h.call('fixture_upload_prepare', {workspaceId: h.args.workspaceId, name: 'private-owned.json', byteLength: bytes.length, role: 'main'});
  const fixture = await h.service().trustedUploadFixture(alice, intent.uploadId, bytes);
  assert.equal(fixture.aiAccess, false);
  await assert.rejects(h.call('tests_run', {...h.args, fixtureIds: [fixture.id]}), {code: 'FIXTURE_AI_CONSENT_REQUIRED'});
  const status = await h.call('workspace_status', {workspaceId: h.args.workspaceId}); assert.equal(status.workspace.fixtures.find(value => value.id === fixture.id).aiAccess, false);
});

test('revocation and re-enrollment during an async managed lookup cannot revive old artifacts', async () => {
  const h = await harness({enrolled: true}), entered = deferred(), resume = deferred();
  h.setLookup(async ({baseExecutionLockDigest}) => {entered.resolve(); await resume.promise; return {primaryDigest, baseExecutionLockDigest, packages: [dataPackage()]};});
  const pending = h.call('tests_run', h.args); await entered.promise;
  await h.access.optOut(alice, {gameId: 'synthetic', expectedRevision: 1}); await h.access.enroll(alice, {gameId: 'synthetic', expectedRevision: 2}); resume.resolve();
  await assert.rejects(pending, {code: 'GAME_GRANT_REVOKED'});
});
