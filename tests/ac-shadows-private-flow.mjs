// SPDX-License-Identifier: Apache-2.0
// Opt-in integration harness. Private input/config/state/output live outside this checkout.
// This exercises the public service and isolated runtime; it is not browser evidence.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, relative, basename, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createLocalWorkbench} from '../ecosystem/workbench/local.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const configPath = process.env.SAVERIFT_AC_FLOW_CONFIG;
assert.ok(configPath, 'Set SAVERIFT_AC_FLOW_CONFIG to an authorized private JSON configuration.');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const external = value => {
  const absolute = resolve(value), rel = relative(root, absolute);
  assert.ok(rel === '..' || rel.startsWith(`..${sep}`) || /^[A-Za-z]:/.test(rel), 'Private paths must be outside the source checkout.');
  return absolute;
};
const outputDirectory = external(config.outputDirectory);
const stateDirectory = external(process.env.SAVERIFT_WORKBENCH_DIR || config.stateDirectory);
await mkdir(outputDirectory, {recursive: true});
assert.ok(Array.isArray(config.fixtures) && config.fixtures.length > 0 && config.fixtures.length <= 8, 'Select one to eight authorized fixtures.');
assert.ok(config.fixtures.every(f => f.allowAiInspection === true), 'Use explicit per-fixture AI consent in this private configuration.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = {schema: 'saverift.ac-shadows.local-workflow.v1', startedAt: new Date().toISOString(),
  evidenceScope: 'local public-service and actual isolated QuickJS execution', browserForm: 'not_run', hosted: 'not_run', gameAcceptance: 'not_run', recovery: 'not_run', publication: 'not_performed', xboxWrites: 0};
const checkpoint = async () => writeFile(resolve(outputDirectory, 'workflow-receipt.json'), JSON.stringify(receipt, null, 2));
const tasks = [];
const {service, principal} = await createLocalWorkbench({directory: stateDirectory, schedule: task => tasks.push(task)});
const call = (name, args = {}) => service.dispatch(principal, `saverift_${name}`, args);
async function complete(job) {
  await Promise.all(tasks.splice(0));
  const status = await call('job_status', {workspaceId: receipt.workspaceId, jobId: job.jobId});
  receipt.lastJob = status;
  await checkpoint();
  assert.equal(status.status, 'passed', `Job ${job.jobId} ended ${status.status}: ${status.job?.error?.code || status.job?.result?.reason || ''}`);
  return status;
}

try {
  receipt.templates = (await call('template_list')).templates.map(t => ({id: t.id, packageDigest: t.packageDigest}));
  receipt.projects = await call('project_list');
  const selected = receipt.templates.find(t => t.id === 'plugin-saverift.ac-shadows');
  assert.ok(selected, 'Build the AC plugin before starting the workbench so local template discovery can validate it.');
  const created = await call('workspace_create', {template: selected.id, name: config.name || 'AC Shadows private integration'});
  const workspace = created.workspace;
  receipt.workspaceId = workspace.id;
  receipt.sourceRevision = workspace.revision;
  receipt.fixtures = [];
  await checkpoint();
  for (const selectedFile of config.fixtures) {
    const file = external(selectedFile.path), bytes = new Uint8Array(await readFile(file));
    const prepared = await call('fixture_upload_prepare', {workspaceId: workspace.id, name: selectedFile.name || basename(file), byteLength: bytes.length, role: selectedFile.role || 'main'});
    const uploaded = await service.trustedUploadFixture(principal, prepared.uploadId, bytes);
    await service.trustedSetFixtureConsent(principal, workspace.id, uploaded.id, true);
    receipt.fixtures.push({id: uploaded.id, name: selectedFile.name || basename(file), role: selectedFile.role || 'main', byteLength: bytes.length, sha256: hash(bytes)});
  }
  const refreshed = (await call('workspace_status', {workspaceId: workspace.id})).workspace;
  receipt.sourceRevision = refreshed.revision;
  const built = await complete(await call('plugin_build', {workspaceId: workspace.id, expectedRevision: refreshed.revision}));
  receipt.build = built;
  receipt.artifactId = built.job.result.artifactId;
  const input = {workspaceId: workspace.id, artifactId: receipt.artifactId, fixtureIds: receipt.fixtures.map(f => f.id)};
  receipt.noop = await complete(await call('tests_run', input));
  assert.ok(receipt.noop.job.result.checks.some(c => c.name === 'no-op-byte-parity' && c.status === 'passed'));
  receipt.preview = await call('preview_open', input);
  const preview = await service.readPreview(principal, receipt.preview.previewId);
  receipt.packageDigest = preview.artifact.digest;
  receipt.executionLockDigest = receipt.preview.executionLockDigest;
  if (config.query) receipt.query = await service.queryPreview(principal, receipt.preview.previewId, config.query);
  await checkpoint();

  if (config.operations?.length) {
    const originalDraft = await service.readPreviewDraft(principal, receipt.preview.previewId);
    const request = {method: 'stage', params: {expectedRevision: originalDraft.revision, operations: config.operations}};
    const draft = await service.editPreviewDraft(principal, receipt.preview.previewId, request);
    await assert.rejects(service.editPreviewDraft(principal, receipt.preview.previewId, request), {code: 'DRAFT_REVISION_CONFLICT'});
    receipt.staleDraftRejection = 'passed';
    receipt.draftRevision = draft.revision;
    receipt.candidate = await complete(await call('candidate_prepare', {...input, expectedDraftRevision: draft.revision}));
    const downloaded = await service.downloadCandidate(principal, receipt.candidate.job.id);
    const inputOnlyRoles = preview.artifact.manifest.workbench?.inputOnlyRoles || [];
    assert.ok(downloaded.artifacts.every(artifact => !inputOnlyRoles.includes(artifact.role)), 'Input-only keys/reference artifacts must not be downloadable.');
    receipt.downloads = [];
    await mkdir(resolve(outputDirectory, 'candidate'), {recursive: true});
    for (const artifact of downloaded.artifacts) {
      const bytes = Buffer.from(artifact.bytes, 'base64');
      assert.equal(bytes.length, artifact.byteLength); assert.equal(hash(bytes), artifact.sha256);
      const name = artifact.logicalPath.replaceAll(/[^a-zA-Z0-9_.-]/g, '_');
      await writeFile(resolve(outputDirectory, 'candidate', name), bytes);
      const source = receipt.fixtures.find(f => f.name === artifact.logicalPath && f.role === artifact.role);
      if (artifact.role === 'sibling') assert.equal(artifact.sha256, source?.sha256, 'An unrelated selected sibling must be byte-identical.');
      receipt.downloads.push({id: artifact.id, logicalPath: artifact.logicalPath, file: `candidate/${name}`, role: artifact.role, byteLength: bytes.length, sha256: hash(bytes), unchangedFromSelectedInput: source ? source.sha256 === artifact.sha256 : null});
    }
    receipt.inputOnlyOutputExclusion = 'passed';
    receipt.resultRetrieval = 'local service bytes retrieved and descriptor sizes/hashes verified; browser download not implied';
  }
  const canonicalInventory = JSON.parse(await readFile(resolve(root, 'ecosystem/plugins/ac-shadows/package-lock.generated.json'), 'utf8'));
  for (const file of canonicalInventory.files) assert.equal(hash(preview.artifact.files[file.path]), file.sha256, `The tested artifact differs from the canonical compiled package at ${file.path}.`);
  const releasePaths = canonicalInventory.files.map(file => file.path);
  receipt.releasePackageDigest = canonicalInventory.packageDigest;
  receipt.release = await call('release_prepare', {workspaceId: workspace.id, artifactId: receipt.artifactId, paths: ['manifest.json', ...releasePaths], licenseEvidence: config.licenseEvidence || 'Original AC connector code, Apache-2.0; referenced SDK licenses retained. No private fixture bytes or account data included.'});
  const review = await service.downloadRelease(principal, receipt.release.releaseId);
  await writeFile(resolve(outputDirectory, 'source-review.json'), JSON.stringify(review, null, 2));
  receipt.status = 'passed'; receipt.completedAt = new Date().toISOString();
  await checkpoint();
  process.stdout.write(JSON.stringify({status: receipt.status, workspaceId: receipt.workspaceId, artifactId: receipt.artifactId, packageDigest: receipt.packageDigest, executionLockDigest: receipt.executionLockDigest, previewId: receipt.preview.previewId, candidateJobId: receipt.candidate?.job.id, releaseId: receipt.release.releaseId}) + '\n');
} catch (error) {
  receipt.status = 'failed'; receipt.failure = {code: error.code || 'VALIDATION_FAILED', message: error.message}; await checkpoint();
  process.stderr.write(`${receipt.failure.code}: see the private workflow receipt.\n`); process.exitCode = 1;
}
