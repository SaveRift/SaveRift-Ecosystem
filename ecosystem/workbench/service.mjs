// SPDX-License-Identifier: Apache-2.0
import {randomUUID} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {sha256, fail} from './storage.mjs';
import {TOOL_DEFINITIONS, toolDefinition} from './tool-definitions.mjs';
import {PINNED_DOCS, TEMPLATES} from './templates.mjs';
import {validatePackage, createSaveBundle} from '../sdk/contracts.mjs';
import {createCatalogSnapshot, createCrosswalk} from '../sdk/data.mjs';
import {compileUiPackage} from '../ui/vanilla-frame.mjs';
import {createDraft, editDraft} from '../sdk/draft.mjs';
import {createOperationCatalog} from '../sdk/operation-catalog.mjs';
import {packageFromSource, composeExecution} from './execution.mjs';

export const WORKBENCH_SCHEMA = 'saverift.developer-workspace.v1';
export const LIMITS = Object.freeze({files: 256, sourceBytes: 4 * 1024 * 1024, fileBytes: 1024 * 1024, fixtures: 8, fixtureBytes: 8 * 1024 * 1024, fixtureTotalBytes: 16 * 1024 * 1024, jobs: 30, workspaces: 20, responseBytes: 64 * 1024, previewMs: 15 * 60000});
const encode = value => new TextEncoder().encode(value);
const text = bytes => new TextDecoder('utf-8', {fatal: true}).decode(bytes);
const HOST_JSON_INSPECTION_BYTES = 128 * 1024;
const identifier = prefix => `${prefix}_${randomUUID().replaceAll('-', '')}`;
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const digest = value => sha256(canonical(value));
const safePath = path => {
  if (typeof path !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_. /-]{0,179}$/.test(path) || path.includes('\\') || path.split('/').some(p => !p || ['.', '..', '__proto__', 'constructor', 'prototype'].includes(p)) || /^(?:fixtures?|private|logs?|node_modules|\.git)(?:\/|$)/i.test(path) || /(?:^|\/)(?:\.env(?:\..*)?|credentials?|tokens?|sessions?|cookies?)(?:\.|\/|$)/i.test(path)) fail('SOURCE_PATH_REJECTED', 'Use a relative source path outside private fixture and credential storage.');
  return path;
};
function validateFiles(files) {
  if (Object.keys(files).length > LIMITS.files) fail('SOURCE_QUOTA', 'This workspace has too many source files.', 413);
  let total = 0; const folded = new Set();
  for (const [path, content] of Object.entries(files)) {
    safePath(path); const lower = path.toLowerCase(); if (folded.has(lower)) fail('SOURCE_PATH_COLLISION', 'Source paths must be unique ignoring case.'); folded.add(lower);
    const size = encode(content).byteLength; if (size > LIMITS.fileBytes) fail('SOURCE_QUOTA', 'A source file exceeds the file limit.', 413); total += size;
  }
  if (total > LIMITS.sourceBytes) fail('SOURCE_QUOTA', 'Workspace source exceeds its size limit.', 413);
}
const publicFixture = value => ({id: value.id, name: value.name, role: value.role, byteLength: value.byteLength, sha256: value.sha256, aiAccess: value.aiAccess === true, synthetic: value.synthetic === true, expiresAt: value.expiresAt});
const publicWorkspace = value => ({id: value.id, name: value.name, gameId: value.gameId || null, packageId: value.packageId || null, gitBinding: value.gitBinding || null, revision: value.revision, createdAt: value.createdAt, updatedAt: value.updatedAt, files: Object.entries(value.files).map(([path, content]) => ({path, byteLength: encode(content).byteLength, sha256: sha256(content)})), fixtures: value.fixtures, catalog: value.catalog ? {count: value.catalog.records.length, digest: value.catalog.digest, provenance: value.catalog.provenance} : null, jobs: value.jobs});
function parseCsv(input) {
  const rows = []; let row = [], field = '', quote = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') { if (quote && input[i + 1] === '"') { field += '"'; i++; } else if (quote || field.length === 0) quote = !quote; else fail('CATALOG_CSV_INVALID', 'A quoted CSV field is malformed.'); }
    else if (!quote && (c === ',' || c === '\n' || c === '\r')) { row.push(field); field = ''; if (c !== ',') { if (c === '\r' && input[i + 1] === '\n') i++; if (row.some(Boolean)) rows.push(row); row = []; } }
    else field += c;
  }
  if (quote) fail('CATALOG_CSV_INVALID', 'A quoted CSV field was not closed.');
  row.push(field); if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift(); if (!headers?.length || new Set(headers).size !== headers.length) fail('CATALOG_CSV_INVALID', 'CSV requires unique column names.');
  return rows.map(values => { if (values.length !== headers.length) fail('CATALOG_CSV_INVALID', 'CSV rows must have the same number of columns.'); return Object.fromEntries(headers.map((h, i) => [h, values[i]])); });
}

export function createWorkspaceService({store, executeJob, templates = TEMPLATES, schedule = promise => { void promise.catch(() => {}); }, now = Date.now, previewBase = '/developer/preview', access, collaboration} = {}) {
  if (!store) throw Error('A private workspace store is required.');
  const controllers = new Map();
  const requireScope = (principal, scope) => { if (!principal?.scopes?.includes(scope)) fail('SCOPE_REQUIRED', `Developer authorization requires ${scope}.`, 403); };
  const principalId = principal => {
    if (!principal || typeof principal.id !== 'string' || !principal.id || principal.id.length > 300 || !Array.isArray(principal.scopes)) fail('DEVELOPER_SIGN_IN_REQUIRED', 'Sign in to the developer workbench.', 401);
    return sha256(`developer:${principal.id}`);
  };
  const base = principal => `developers/${principalId(principal)}`;
  const key = (principal, workspaceId) => `${base(principal)}/workspaces/${workspaceId}`;
  const objectKey = (principal, type, id) => `${base(principal)}/${type}/${id}`;
  async function gameAccess(principal, value, action = 'workspace:read', grant) {
    if (!access) return;
    if (!value.gameId) fail('WORKSPACE_PROJECT_UNBOUND', 'This legacy workspace needs an explicit project migration. Its source remains exportable.', 409);
    await access.assertAccess(principal, {gameId: value.gameId, action, capturedGrant: grant});
  }
  async function assertGrants(principal, grants = []) {
    if (access) for (const grant of grants) await access.assertGrant(principal, grant);
  }
  async function captureGrants(principal, values) {
    if (!access) return [];
    const ids = [...new Set(values.map(value => value.gameId))];
    if (ids.some(id => !id)) fail('WORKSPACE_PROJECT_UNBOUND', 'Bind every selected workspace to a game project first.', 409);
    return Promise.all(ids.map(id => access.captureGrant(principal, id)));
  }
  async function verifyBranchSource(principal, value, expectedGitHead) {
    if (!value.gitBinding) return;
    if (expectedGitHead && expectedGitHead !== value.gitBinding.gitHead) fail('GIT_HEAD_CHANGED', 'The expected Git head changed. Review the current branch source.', 409);
    const current = await collaboration.dispatch(principal, 'branch_workspace_read', {gameId: value.gameId, workspaceId: value.gitBinding.branchWorkspaceId});
    assertBranchBinding(value.gameId, current.workspace, value.gitBinding);
    const files = Object.fromEntries(Object.entries(current.files).filter(([path]) => path.startsWith(value.gitBinding.packageRoot)).map(([path, content]) => [path.slice(value.gitBinding.packageRoot.length), content]));
    if (current.workspace.revision !== value.gitBinding.revision || current.workspace.gitHead !== value.gitBinding.gitHead || digest(files) !== digest(value.files)) fail('GIT_SOURCE_REFRESH_REQUIRED', 'The branch source changed. Review it and explicitly refresh this private build copy.', 409);
  }
  function assertBranchBinding(gameId, branch, previous) {
    const project = access.getProject(gameId);
    const repository = project.repository;
    if (!repository || branch.gameId !== gameId || branch.repository?.id !== repository.id || branch.repository?.owner !== repository.owner || branch.repository?.name !== repository.name || branch.projectDigest !== project.projectDigest || branch.packageId !== project.packageId || !branch.packageRoots?.every(root => project.packageRoots.includes(root))) fail('BRANCH_PACKAGE_MISMATCH', 'The repository or game-package mapping changed. Export your source and prepare a newly bound workspace.', 409);
    if (previous && (branch.id !== previous.branchWorkspaceId || ['gameId', 'packageId', 'baseCommit', 'issueNumber', 'branch', 'projectDigest'].some(field => branch[field] !== previous[field]))) fail('BRANCH_PACKAGE_MISMATCH', 'The branch’s immutable repository, issue or base binding changed.', 409);
  }
  const readRequired = async (principal, type, id, workspaceId) => {
    const row = await store.get(objectKey(principal, type, id));
    if (!row || row.value.deleted || workspaceId && row.value.workspaceId !== workspaceId) fail('OBJECT_NOT_FOUND', 'This developer object is unavailable.', 404);
    return row;
  };
  async function workspace(principal, id, action = 'workspace:read') {
    const row = await store.get(key(principal, id));
    if (!row || row.value.deleted || row.value.schema !== WORKBENCH_SCHEMA) fail('WORKSPACE_NOT_FOUND', 'This developer workspace is unavailable.', 404);
    await gameAccess(principal, row.value, action);
    row.gameGrants = await captureGrants(principal, [row.value]);
    return row;
  }
  async function update(principal, row, expectedRevision, mutate) {
    if (row.value.revision !== expectedRevision) fail('REVISION_CONFLICT', 'This workspace changed. Refresh before retrying.', 409);
    const value = structuredClone(row.value); await mutate(value); value.revision++; value.updatedAt = now();
    await gameAccess(principal, value, 'workspace:write');
    await assertGrants(principal, row.gameGrants);
    return store.put(key(principal, value.id), value, {ifMatch: row.etag});
  }
  async function fixture(principal, workspaceId, fixtureId, {ai = false} = {}) {
    const ws = await workspace(principal, workspaceId);
    const row = await readRequired(principal, 'fixtures', fixtureId, workspaceId);
    if (row.value.expiresAt <= now()) fail('FIXTURE_EXPIRED', 'This fixture has expired. Upload it again.', 410);
    if (ai && !row.value.synthetic && !row.value.aiAccess) fail('FIXTURE_AI_CONSENT_REQUIRED', 'The owner must allow AI inspection for this fixture in the trusted workbench.', 403);
    await assertGrants(principal, ws.gameGrants);
    row.gameGrants = ws.gameGrants;
    return row;
  }
  async function fixtureInputs(principal, workspaceId, ids, {ai = true} = {}) {
    return Promise.all(ids.map(async id => {
      const row = await fixture(principal, workspaceId, id, {ai});
      return {...publicFixture(row.value), bytes: new Uint8Array(Buffer.from(row.value.bytes, 'base64'))};
    }));
  }
  async function addFixture(principal, row, {name, role, bytes, synthetic = false, aiAccess = false}) {
    const data = new Uint8Array(bytes);
    if (!data.length || data.length > LIMITS.fixtureBytes || row.value.fixtures.length >= LIMITS.fixtures || row.value.fixtures.reduce((a, f) => a + f.byteLength, data.length) > LIMITS.fixtureTotalBytes) fail('FIXTURE_QUOTA', 'This fixture exceeds workspace limits.', 413);
    const value = {id: identifier('fixture'), workspaceId: row.value.id, name, role, byteLength: data.length, sha256: sha256(data), bytes: Buffer.from(data).toString('base64'), aiAccess, synthetic, createdAt: now(), expiresAt: now() + 30 * 86400000};
    await assertGrants(principal, row.gameGrants);
    await store.put(objectKey(principal, 'fixtures', value.id), value, {ifAbsent: true});
    try { await update(principal, row, row.value.revision, v => v.fixtures.push(publicFixture(value))); }
    catch (e) { await store.delete(objectKey(principal, 'fixtures', value.id)); throw e; }
    return publicFixture(value);
  }
  async function execution(principal, args) {
    const primary = (await readRequired(principal, 'artifacts', args.artifactId, args.workspaceId)).value;
    await assertGrants(principal, primary.gameGrants);
    const primaryWorkspace = await workspace(principal, primary.workspaceId);
    const ids = args.extensionArtifactIds || [];
    if (ids.length > 8 || new Set(ids).size !== ids.length || ids.includes(primary.id)) fail('EXTENSION_SELECTION_INVALID', 'Choose a bounded unique set of built extensions.');
    const dependencyWorkspaces = [];
    const extensions = await Promise.all(ids.map(async id => { const row = await readRequired(principal, 'artifacts', id); await assertGrants(principal, row.value.gameGrants); dependencyWorkspaces.push((await workspace(principal, row.value.workspaceId)).value); return row.value; }));
    const selected = composeExecution(primary, extensions);
    selected.gameGrants = await captureGrants(principal, [primaryWorkspace.value, ...dependencyWorkspaces]);
    if (args.executionLockDigest && args.executionLockDigest !== selected.executionLock.digest) fail('DEPENDENCY_MISMATCH', 'The selected execution dependency lock changed.');
    return selected;
  }
  function operationCatalog(selected) {
    return createOperationCatalog(selected.packages);
  }
  async function sourceDraft(principal, selected, fixtureIds) {
    const artifact = selected.primary;
    const fixtures = await fixtureInputs(principal, artifact.workspaceId, fixtureIds, {ai: false});
    const bundle = createSaveBundle(fixtures.map(f => ({id: f.id, logicalPath: f.name, role: f.role, byteLength: f.byteLength, sha256: f.sha256})));
    const id = `draft_${digest({artifact: artifact.digest, lock: selected.executionLock.digest, bundle: bundle.bundleDigest}).slice(0, 40)}`;
    const name = objectKey(principal, 'drafts', id); let row = await store.get(name);
    if (!row) {
      const draft = createDraft({id, baseBundleDigest: bundle.bundleDigest, sourceRevision: sha256(String(artifact.sourceRevision)), accountBindingDigest: principalId(principal), executionLockDigest: selected.executionLock.digest});
      await assertGrants(principal, selected.gameGrants);
      try { row = await store.put(name, {workspaceId: artifact.workspaceId, draft}, {ifAbsent: true}); }
      catch (e) { if (e.code !== 'REVISION_CONFLICT') throw e; row = await store.get(name); }
    }
    return row;
  }
  async function startJob(principal, row, type, input) {
    if (row.value.jobs.length >= LIMITS.jobs) fail('JOB_QUOTA', 'This workspace has reached its job limit.', 429);
    const gameGrants = input.gameGrants || row.gameGrants || [];
    await assertGrants(principal, gameGrants);
    const value = {id: identifier('job'), workspaceId: row.value.id, gameId: row.value.gameId || null, gameGrants, revision: row.value.revision, type, status: 'pending', createdAt: now(), input};
    await store.put(objectKey(principal, 'jobs', value.id), value, {ifAbsent: true});
    await update(principal, row, row.value.revision, v => v.jobs.unshift({id: value.id, type, createdAt: value.createdAt}));
    schedule(runJob(principal, value.id));
    return {status: 'pending', jobId: value.id, workspaceId: row.value.id, workspaceRevision: row.value.revision};
  }
  async function runJob(principal, jobId) {
    let row = await readRequired(principal, 'jobs', jobId);
    if (row.value.status !== 'pending') return;
    row = await store.put(objectKey(principal, 'jobs', jobId), {...row.value, status: 'running', startedAt: now()}, {ifMatch: row.etag});
    const controller = new AbortController(); controllers.set(jobId, controller);
    let createdArtifactId = null;
    try {
      await assertGrants(principal, row.value.gameGrants);
      let result;
      if (row.value.type === 'build') {
        const files = row.value.input.source.files; validateFiles(files);
        let manifest; try { manifest = JSON.parse(files['manifest.json']); } catch { fail('MANIFEST_INVALID', 'A valid manifest.json is required.'); }
        if (access && (manifest.id !== row.value.input.source.packageId || manifest.kind !== row.value.input.source.packageKind)) fail('WORKSPACE_PACKAGE_MISMATCH', 'This workspace is bound to an exact package identity. Create a new authorized package workspace to change it.', 409);
        if (!manifest.id || !manifest.version || manifest.entrypoints?.runtimeProfile !== 'isolated-js-v1' || !files[safePath(manifest.entrypoints.runtime)] || manifest.entrypoints.ui && !files[safePath(manifest.entrypoints.ui)]) fail('MANIFEST_INVALID', 'Manifest must name existing runtime/UI files and the isolated-js-v1 profile.');
        if (manifest.ui) compileUiPackage({manifest, files});
        const pkg = packageFromSource(files), packageDigest = pkg.packageDigest;
        const catalog = row.value.input.source.catalog;
        const sourceBinding = {workspaceId: row.value.workspaceId, sourceRevision: row.value.revision, sourceDigest: digest(files), gitBinding: row.value.input.source.gitBinding || null, dependencyLockDigests: Object.fromEntries(Object.entries(files).filter(([path]) => /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock)$/.test(path)).map(([path, content]) => [path, sha256(content)])), runnerVersion: 'saverift-source-package-builder/0.1', fixtureReferences: []};
        const artifact = {id: identifier('artifact'), workspaceId: row.value.workspaceId, gameGrants: row.value.gameGrants || [], sourceBinding, sourceRevision: row.value.revision, manifest, files: pkg.files, digest: packageDigest, catalog, createdAt: now(), executionLock: null};
        if (manifest.kind === 'game') artifact.executionLock = composeExecution(artifact).executionLock;
        await assertGrants(principal, row.value.gameGrants);
        await store.put(objectKey(principal, 'artifacts', artifact.id), artifact, {ifAbsent: true});
        createdArtifactId = artifact.id;
        // A source build is packaging, not proof of lifecycle/game conformance.
        result = {status: 'passed', artifactId: artifact.id, kind: manifest.kind, digest: packageDigest, sourceRevision: artifact.sourceRevision, sourceBinding, validation: 'source-package-built', gameAcceptance: 'unverified'};
      } else if (!executeJob) result = {status: 'not_run', reason: 'An isolated runtime executor is not configured.'};
      else {
        const selected = await execution(principal, row.value.input), artifact = selected.primary;
        const fixtures = await fixtureInputs(principal, row.value.workspaceId, row.value.input.fixtureIds, {ai: row.value.input.aiAccessRequired !== false});
        result = await executeJob({kind: row.value.type, package: {manifest: artifact.manifest, files: artifact.files}, extensions: selected.extensions.map(a => ({package: {manifest: a.manifest, files: a.files}})), executionLock: selected.executionLock, dataPackages: selected.dataPackages, catalogs: selected.catalogs, fixtures, input: row.value.input, signal: controller.signal});
      }
      await assertGrants(principal, row.value.gameGrants);
      if (result?.privateArtifacts) {
        const artifacts = result.privateArtifacts.map(({bytes, ...descriptor}) => ({...descriptor, bytes: Buffer.from(bytes).toString('base64')}));
        await store.put(objectKey(principal, 'candidates', jobId), {workspaceId: row.value.workspaceId, gameGrants: row.value.gameGrants || [], artifacts, createdAt: now()}, {ifAbsent: true});
        const {privateArtifacts, ...publicResult} = result; result = {...publicResult, candidateDownloadPath: `/api/developer/candidates/${jobId}`};
      }
      if (!result || !['passed', 'failed', 'not_run', 'needs_review'].includes(result.status)) fail('RUNNER_RESULT_INVALID', 'The isolated runner returned an invalid job result.');
      if (encode(JSON.stringify(result)).length > LIMITS.responseBytes) fail('RUNNER_OUTPUT_LIMIT', 'The isolated runner output exceeded its report limit.');
      const current = await readRequired(principal, 'jobs', jobId);
      if (current.value.status === 'cancelled') return;
      await assertGrants(principal, row.value.gameGrants);
      await store.put(objectKey(principal, 'jobs', jobId), {...current.value, status: result.status, result, finishedAt: now()}, {ifMatch: current.etag});
    } catch (error) {
      if (['GAME_GRANT_REVOKED', 'GAME_ENROLLMENT_REQUIRED', 'MEMBERSHIP_SUSPENDED'].includes(error.code)) {
        if (createdArtifactId) await store.delete(objectKey(principal, 'artifacts', createdArtifactId));
        await store.delete(objectKey(principal, 'candidates', jobId));
      }
      const current = await readRequired(principal, 'jobs', jobId);
      if (current.value.status !== 'cancelled') await store.put(objectKey(principal, 'jobs', jobId), {...current.value, status: 'failed', result: {status: 'failed', code: error.code || 'ISOLATED_JOB_FAILED', error: error.code ? error.message : 'The isolated job failed. See the bounded local runner diagnostics.'}, finishedAt: now()}, {ifMatch: current.etag});
    } finally { controllers.delete(jobId); }
  }
  const handlers = {
    project_list: async () => ({status: 'passed', hostedEnrollment: Boolean(access), projects: access?.listProjects() || []}),
    developer_enrollment_get: async (principal, args) => {
      if (!access) fail('HOSTED_ENROLLMENT_NOT_CONFIGURED', 'Local source tools do not require hosted enrollment.', 409);
      return {status: 'passed', membership: await access.getMembership(principal, args.gameId)};
    },
    developer_enrollment_set: async (principal, {gameId, state, expectedRevision}) => {
      if (!access) fail('HOSTED_ENROLLMENT_NOT_CONFIGURED', 'Local source tools do not require hosted enrollment.', 409);
      const membership = await access[state === 'enabled' ? 'enroll' : 'optOut'](principal, {gameId, expectedRevision});
      return {status: 'passed', membership};
    },
    docs_search: async (_, args) => ({status: 'passed', version: '0.1', results: PINNED_DOCS.filter(d => !args.query || `${d.title} ${d.text}`.toLowerCase().includes(args.query.toLowerCase())).slice(0, args.limit)}),
    template_list: async () => ({status: 'passed', templates: templates.map(({files, fixture, ...value}) => value)}),
    workspace_create: async (principal, args) => {
      const current = await store.list(`${base(principal)}/workspaces/`, LIMITS.workspaces + 1);
      if (current.length >= LIMITS.workspaces) fail('WORKSPACE_QUOTA', 'This developer account has reached its workspace limit.', 429);
      const template = templates.find(t => t.id === args.template), id = identifier('workspace');
      if (!template) fail('TEMPLATE_NOT_FOUND', 'This template is unavailable.', 404);
      let gameGrants = [];
      if (access) {
        const project = access.getProject(args.gameId);
        if (!project.templateIds.includes(template.id)) fail('TEMPLATE_PROJECT_MISMATCH', 'Choose a template assigned to this game project.', 403);
        await access.assertAccess(principal, {gameId: project.id, action: 'workspace:create'});
        if (!collaboration?.verifyDiscovery) fail('COLLABORATION_NOT_CONFIGURED', 'Hosted source creation requires project discovery.', 409);
        await collaboration.verifyDiscovery(principal, {gameId: project.id, discoveryId: args.discoveryId});
        gameGrants = await captureGrants(principal, [{gameId: project.id}]);
      }
      validateFiles(template.files);
      const templateManifest = JSON.parse(template.files['manifest.json']);
      const value = {schema: WORKBENCH_SCHEMA, id, name: args.name, gameId: access ? args.gameId : null, templateId: template.id, packageId: templateManifest.id, packageKind: templateManifest.kind, revision: 1, files: structuredClone(template.files), fixtures: [], jobs: [], catalog: null, createdAt: now(), updatedAt: now()};
      await assertGrants(principal, gameGrants);
      let row = await store.put(key(principal, id), value, {ifAbsent: true});
      row.gameGrants = gameGrants;
      if (template.fixture) { await addFixture(principal, row, {...template.fixture, bytes: encode(template.fixture.text), synthetic: true}); row = await workspace(principal, id); }
      return {status: 'passed', workspace: publicWorkspace(row.value)};
    },
    workspace_list: async principal => ({status: 'passed', workspaces: await Promise.all((await store.list(`${base(principal)}/workspaces/`, LIMITS.workspaces)).map(async r => {
      if (!access) return publicWorkspace(r.value);
      const membership = r.value.gameId ? await access.getMembership(principal, r.value.gameId) : null;
      return {...publicWorkspace(r.value), enrollmentState: membership?.state || 'unbound', ...(membership?.state === 'enabled' ? {} : {fixtures: [], jobs: [], catalog: null})};
    }))}),
    workspace_export: async (principal, args) => {
      const row = await store.get(key(principal, args.workspaceId));
      if (!row || row.value.deleted || row.value.schema !== WORKBENCH_SCHEMA) fail('WORKSPACE_NOT_FOUND', 'This source workspace is unavailable.', 404);
      if (access && row.value.gameId) await access.assertAccess(principal, {gameId: row.value.gameId, action: 'source:export'});
      return {status: 'passed', workspaceId: row.value.id, gameId: row.value.gameId || null, revision: row.value.revision, files: structuredClone(row.value.files), digest: digest(row.value.files), excludesPrivateData: true};
    },
    workspace_from_branch: async (principal, args) => {
      if (!access || !collaboration) fail('COLLABORATION_NOT_CONFIGURED', 'Hosted branch workspaces are not configured.', 409);
      const project = access.getProject(args.gameId);
      await access.assertAccess(principal, {gameId: project.id, action: 'workspace:create'});
      const source = await collaboration.dispatch(principal, 'branch_workspace_read', {gameId: project.id, workspaceId: args.branchWorkspaceId});
      const branch = source.workspace, packageRoot = args.packageRoot || project.packageRoots[0];
      assertBranchBinding(project.id, branch);
      if (!project.packageRoots.includes(packageRoot) || branch.gameId !== project.id || branch.repository?.id !== project.repository?.id) fail('BRANCH_PACKAGE_MISMATCH', 'This branch is not bound to the selected repository and package.', 403);
      const files = Object.fromEntries(Object.entries(source.files).filter(([path]) => path.startsWith(packageRoot)).map(([path, value]) => [path.slice(packageRoot.length), value]));
      validateFiles(files);
      let manifest; try { manifest = JSON.parse(files['manifest.json']); } catch { fail('MANIFEST_INVALID', 'The selected package root needs a valid manifest.json.'); }
      const rows = await store.list(`${base(principal)}/workspaces/`, LIMITS.workspaces + 1);
      if (rows.length >= LIMITS.workspaces) fail('WORKSPACE_QUOTA', 'This developer account has reached its workspace limit.', 429);
      if (rows.some(row => row.value.gitBinding?.branchWorkspaceId === branch.id && row.value.gitBinding?.packageRoot === packageRoot)) fail('BRANCH_ALREADY_ATTACHED', 'Open the existing build workspace for this branch and package.', 409);
      const gameGrants = await captureGrants(principal, [{gameId: project.id}]);
      const value = {schema: WORKBENCH_SCHEMA, id: identifier('workspace'), name: args.name, gameId: project.id, packageId: manifest.id, packageKind: manifest.kind, revision: 1, files, fixtures: [], jobs: [], catalog: null, createdAt: now(), updatedAt: now(), gitBinding: {...branch, branchWorkspaceId: branch.id, packageRoot}};
      await assertGrants(principal, gameGrants);
      const saved = await store.put(key(principal, value.id), value, {ifAbsent: true});
      return {status: 'passed', workspace: publicWorkspace(saved.value)};
    },
    workspace_sync_from_branch: async (principal, args) => {
      const row = await workspace(principal, args.workspaceId, 'workspace:write'), binding = row.value.gitBinding;
      if (!binding || !collaboration) fail('BRANCH_WORKSPACE_REQUIRED', 'This workspace has no canonical Git source.', 409);
      const current = await collaboration.dispatch(principal, 'branch_workspace_read', {gameId: row.value.gameId, workspaceId: binding.branchWorkspaceId});
      assertBranchBinding(row.value.gameId, current.workspace, binding);
      if (current.workspace.revision !== args.expectedBranchRevision || current.workspace.gitHead !== args.expectedGitHead) fail('GIT_SOURCE_REFRESH_REQUIRED', 'Review the latest branch revision before synchronizing source.', 409);
      const files = Object.fromEntries(Object.entries(current.files).filter(([path]) => path.startsWith(binding.packageRoot)).map(([path, value]) => [path.slice(binding.packageRoot.length), value]));
      validateFiles(files);
      let manifest; try { manifest = JSON.parse(files['manifest.json']); } catch { fail('MANIFEST_INVALID', 'The canonical package needs a valid manifest.'); }
      if (manifest.id !== row.value.packageId || manifest.kind !== row.value.packageKind) fail('WORKSPACE_PACKAGE_MISMATCH', 'The canonical package identity changed. Export your source and create a newly bound workspace.', 409);
      const next = await update(principal, row, args.expectedRevision, value => { value.files = files; value.gitBinding = {...current.workspace, branchWorkspaceId: binding.branchWorkspaceId, packageRoot: binding.packageRoot}; });
      return {status: 'passed', workspace: publicWorkspace(next.value), buildEvidence: 'needs_run'};
    },
    workspace_status: async (principal, args) => ({status: 'passed', workspace: publicWorkspace((await workspace(principal, args.workspaceId)).value)}),
    workspace_read: async (principal, args) => { const row = await workspace(principal, args.workspaceId), path = safePath(args.path), value = row.value.files[path]; if (value === undefined) fail('SOURCE_NOT_FOUND', 'This source file is unavailable.', 404); return {status: 'passed', workspaceRevision: row.value.revision, path, content: value.slice(args.start, args.start + args.length), totalLength: value.length, truncated: value.length > args.start + args.length}; },
    workspace_patch: async (principal, args) => {
      const row = await workspace(principal, args.workspaceId), paths = args.edits.map(e => safePath(e.path)); if (new Set(paths).size !== paths.length) fail('DUPLICATE_PATCH_PATH', 'Patch a source path only once.');
      if (row.value.revision !== args.expectedRevision) fail('REVISION_CONFLICT', 'Refresh the private source before saving.', 409);
      if (row.value.gitBinding && !args.expectedGitHead) fail('GIT_HEAD_REQUIRED', 'Git-bound source edits require the exact Git head.', 409);
      await verifyBranchSource(principal, row.value, args.expectedGitHead);
      const files = structuredClone(row.value.files);
      for (const edit of args.edits) if (edit.content === null) delete files[edit.path]; else files[edit.path] = edit.content;
      validateFiles(files);
      let gitBinding = row.value.gitBinding;
      if (gitBinding) {
        await assertGrants(principal, row.gameGrants);
        const result = await collaboration.dispatch(principal, 'branch_workspace_patch', {gameId: row.value.gameId, workspaceId: gitBinding.branchWorkspaceId, expectedRevision: gitBinding.revision, expectedGitHead: gitBinding.gitHead, changes: args.edits.map(edit => ({...edit, path: gitBinding.packageRoot + edit.path}))});
        gitBinding = {...result.workspace, branchWorkspaceId: gitBinding.branchWorkspaceId, packageRoot: gitBinding.packageRoot};
      }
      const next = await update(principal, row, args.expectedRevision, value => { value.files = files; if (gitBinding) value.gitBinding = gitBinding; });
      return {status: 'passed', workspace: publicWorkspace(next.value)};
    },
    fixture_upload_prepare: async (principal, args) => { const row = await workspace(principal, args.workspaceId, 'fixture:upload'); const uploadId = identifier('upload'); await assertGrants(principal, row.gameGrants); await store.put(objectKey(principal, 'uploads', uploadId), {...args, gameGrants: row.gameGrants || [], id: uploadId, expiresAt: now() + 10 * 60000, used: false}, {ifAbsent: true}); return {status: 'needs_review', uploadId, uploadPath: `/api/developer/uploads/${uploadId}`, expiresAt: now() + 10 * 60000, aiAccess: false, message: 'Upload the file in the trusted workbench. AI access is a separate owner choice.'}; },
    fixture_inspect: async (principal, args) => {
      const row = await fixture(principal, args.workspaceId, args.fixtureId, {ai: true});
      const bytes = Buffer.from(row.value.bytes, 'base64'); let report = {format: 'unrecognized', byteLength: bytes.length, inspection: 'metadata_only'};
      if (bytes.length > HOST_JSON_INSPECTION_BYTES) report = {format: 'not_decoded', byteLength: bytes.length, inspection: 'metadata_only', reason: 'generic_json_inspection_limit', message: 'Generic host JSON inspection is limited to 128 KiB. Use an isolated game query for larger fixtures.'};
      else {
        try { const parsed = JSON.parse(text(bytes)), object = parsed && typeof parsed === 'object'; report = {format: 'json', inspection: 'bounded_json', topLevelType: parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed, topLevelKeys: object ? Object.keys(parsed).slice(0, 40) : []}; if (object && args.fields.length) report.selectedFields = Object.fromEntries(args.fields.filter(field => /^[A-Za-z0-9_-]+$/.test(field) && Object.hasOwn(parsed, field)).map(field => [field, parsed[field]])); }
        catch {}
      }
      if (encode(JSON.stringify(report)).length > 8192) report = {format: report.format, byteLength: bytes.length, warning: 'Selected values exceed the bounded AI report limit.'};
      return {status: 'passed', fixture: publicFixture(row.value), report};
    },
    fixture_compare: async (principal, args) => {
      const fixtures = await fixtureInputs(principal, args.workspaceId, args.fixtureIds); let differences = [], semanticComparison = 'not_run', reason = 'unrecognized_json';
      if (fixtures.some(f => f.bytes.length > HOST_JSON_INSPECTION_BYTES)) reason = 'generic_json_inspection_limit';
      else try { const [a, b] = fixtures.map(f => JSON.parse(text(f.bytes))); const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]; differences = keys.filter(k => canonical(a[k]) !== canonical(b[k])).slice(0, 40).map(path => ({path, change: Object.hasOwn(a, path) ? Object.hasOwn(b, path) ? 'changed' : 'removed' : 'added'})); semanticComparison = 'bounded_top_level_json'; reason = null; } catch {}
      return {status: 'passed', identical: fixtures[0].sha256 === fixtures[1].sha256, byteLengths: fixtures.map(f => f.byteLength), differences, semanticComparison, reason, gameAcceptance: 'unverified'};
    },
    catalog_import: async (principal, args) => {
      let rows; try { rows = args.format === 'csv' ? parseCsv(args.text) : JSON.parse(args.text); } catch (e) { if (e.code) throw e; fail('CATALOG_INVALID', 'Reference data is not valid JSON or CSV.'); }
      if (!Array.isArray(rows) || rows.length > 5000) fail('CATALOG_INVALID', 'Reference data must contain at most 5,000 records.');
      const records = rows.map(row => { const id = row?.[args.idField], name = row?.[args.nameField]; if (!['string', 'number'].includes(typeof id) || typeof name !== 'string' || String(id).length > 100 || name.length > 300) fail('CATALOG_CROSSWALK_INVALID', 'Every record needs a bounded ID and name through the selected crosswalk.'); return {id: String(id), name, attributes: row}; });
      if (new Set(records.map(r => r.id)).size !== records.length) fail('CATALOG_DUPLICATE_ID', 'Reference IDs must be unique.');
      const snapshot = createCatalogSnapshot({catalogId: 'workspace.reference', version: '0.1.0', defaultLocale: 'en', gameBuildRange: 'unknown', sources: [{id: 'workspace.source.upload', revision: sha256(args.text), license: args.provenance.license, attribution: args.provenance.source, retrievalMethod: 'developer-upload'}], entities: records.map(record => ({id: `workspace.item.${record.id}`, nativeId: record.id, type: typeof record.attributes.type === 'string' ? record.attributes.type : 'item', name: {en: record.name}, attributes: record.attributes, sourceRef: 'workspace.source.upload', ...(record.attributes.requirements && typeof record.attributes.requirements === 'object' ? {requirements: record.attributes.requirements} : {})}))});
      const crosswalk = createCrosswalk({id: 'workspace.crosswalk.upload', version: '0.1.0', sourceNamespace: 'workspace.upload', targetCatalogDigest: snapshot.digest, sourceRef: 'workspace.source.upload', entries: records.map(record => ({sourceId: record.id, targetId: `workspace.item.${record.id}`}))});
      const row = await workspace(principal, args.workspaceId), catalog = {records, snapshot, crosswalk, provenance: args.provenance, digest: snapshot.digest, importedAt: now()};
      const next = await update(principal, row, args.expectedRevision, value => { value.catalog = catalog; });
      return {status: 'passed', workspaceRevision: next.value.revision, count: records.length, catalogDigest: catalog.digest, provenance: catalog.provenance};
    },
    catalog_query: async (principal, args) => { const row = await workspace(principal, args.workspaceId), all = row.value.catalog?.records || [], records = all.filter(r => `${r.id} ${r.name}`.toLowerCase().includes(args.query.toLowerCase())); return {status: 'passed', digest: row.value.catalog?.digest || null, total: records.length, records: records.slice(args.offset, args.offset + args.limit)}; },
    plugin_build: async (principal, args) => { const row = await workspace(principal, args.workspaceId); if (args.expectedRevision !== row.value.revision) fail('REVISION_CONFLICT', 'This workspace changed. Refresh before building.', 409); await verifyBranchSource(principal, row.value); return startJob(principal, row, 'build', {source: {files: structuredClone(row.value.files), catalog: structuredClone(row.value.catalog), packageId: row.value.packageId, packageKind: row.value.packageKind, gitBinding: row.value.gitBinding || null}}); },
    tests_run: async (principal, args, context) => { const row = await workspace(principal, args.workspaceId), selected = await execution(principal, args); const aiAccessRequired = context.channel !== 'trusted-ui'; await fixtureInputs(principal, args.workspaceId, args.fixtureIds, {ai: aiAccessRequired}); return startJob(principal, row, 'tests', {...args, gameGrants: selected.gameGrants, executionLockDigest: selected.executionLock.digest, aiAccessRequired}); },
    candidate_prepare: async (principal, args, context) => {
      const row = await workspace(principal, args.workspaceId), selected = await execution(principal, args);
      const aiAccessRequired = context.channel !== 'trusted-ui';
      await fixtureInputs(principal, args.workspaceId, args.fixtureIds, {ai: aiAccessRequired});
      let draftRow = await sourceDraft(principal, selected, args.fixtureIds), draft = draftRow.value.draft;
      if (args.operations) {
        if (draft.operations.length && args.expectedDraftRevision === undefined) fail('DRAFT_REVISION_REQUIRED', 'Review the existing shared draft and supply its revision before replacing it.', 409);
        draft = editDraft(draft, {type: 'stageMany', removeInstanceIds: draft.operations.map(op => op.instanceId), operations: args.operations.map(op => ({...op, instanceId: identifier('intent')}))}, {expectedRevision: args.expectedDraftRevision ?? draft.revision, operationCatalog: operationCatalog(selected)});
        await assertGrants(principal, selected.gameGrants);
        draftRow = await store.put(objectKey(principal, 'drafts', draft.id), {...draftRow.value, draft}, {ifMatch: draftRow.etag});
      } else if (args.expectedDraftRevision !== draft.revision) fail('DRAFT_REVISION_CONFLICT', 'This draft changed. Refresh before preparing a candidate.', 409);
      if (!draft.operations.length) fail('DRAFT_EMPTY', 'Stage at least one offline change first.');
      return startJob(principal, row, 'candidate', {...args, gameGrants: selected.gameGrants, operations: draft.operations, draftId: draft.id, draftRevision: draft.revision, executionLockDigest: selected.executionLock.digest, aiAccessRequired});
    },
    job_status: async (principal, args, context) => { await workspace(principal, args.workspaceId); const row = await readRequired(principal, 'jobs', args.jobId, args.workspaceId); await assertGrants(principal, row.value.gameGrants); if (context.channel !== 'trusted-ui' && row.value.input.fixtureIds?.length) await fixtureInputs(principal, args.workspaceId, row.value.input.fixtureIds); const {input, gameGrants, ...job} = row.value; return {status: job.status, job}; },
    job_cancel: async (principal, args) => { await workspace(principal, args.workspaceId); const row = await readRequired(principal, 'jobs', args.jobId, args.workspaceId); if (!['pending', 'running'].includes(row.value.status)) return {status: row.value.status, jobId: args.jobId}; controllers.get(args.jobId)?.abort(); await store.put(objectKey(principal, 'jobs', args.jobId), {...row.value, status: 'cancelled', finishedAt: now()}, {ifMatch: row.etag}); return {status: 'cancelled', jobId: args.jobId}; },
    preview_open: async (principal, args, context) => {
      await workspace(principal, args.workspaceId); const selected = await execution(principal, args);
      const available = [selected.primary, ...selected.extensions], view = args.uiArtifactId ? available.find(a => a.id === args.uiArtifactId) : available.find(a => a.manifest.ui) || selected.primary;
      if (!view) fail('PREVIEW_VIEW_NOT_PINNED', 'Choose a view from the exact selected package closure.', 403);
      await fixtureInputs(principal, args.workspaceId, args.fixtureIds, {ai: context.channel !== 'trusted-ui'});
      const draft = await sourceDraft(principal, selected, args.fixtureIds), value = {...args, gameGrants: selected.gameGrants, uiArtifactId: view.id, executionLockDigest: selected.executionLock.digest, draftId: draft.value.draft.id, id: identifier('preview'), expiresAt: now() + LIMITS.previewMs};
      await assertGrants(principal, value.gameGrants);
      await store.put(objectKey(principal, 'previews', value.id), value, {ifAbsent: true});
      return {status: 'passed', previewId: value.id, previewPath: `${previewBase}/${value.id}`, executionLockDigest: selected.executionLock.digest, views: available.filter(a => a.manifest.ui).map(a => ({artifactId: a.id, id: a.manifest.id, displayName: a.manifest.displayName, views: a.manifest.views || [], selected: a.id === view.id})), expiresAt: value.expiresAt, authenticationRequired: true};
    },
    release_prepare: async (principal, args) => {
      const wsRow = await workspace(principal, args.workspaceId); const artifact = (await readRequired(principal, 'artifacts', args.artifactId, args.workspaceId)).value, files = {}, sourceFiles = {...artifact.files, 'manifest.json': JSON.stringify(artifact.manifest, null, 2)};
      await assertGrants(principal, artifact.gameGrants);
      for (const path of args.paths) { safePath(path); if (!Object.hasOwn(sourceFiles, path) || !/^(?:manifest\.json|(?:README|LICENSE|NOTICE|CHANGELOG|CONTRIBUTING|SECURITY|DEVELOPER_API)(?:\.md)?|(?:runtime|ui|schemas|catalogs|assets|presets|tests|licenses|data)\/)/.test(path) || /\.(?:save|sav|bin|har|log|map|png|jpg|jpeg|webp|mp4|zip|tgz)$/i.test(path)) fail('EXPORT_PATH_REJECTED', 'Release review accepts explicit source paths only, never fixture bytes or generated private outputs.'); files[path] = sourceFiles[path]; }
      if (!files['manifest.json']) fail('EXPORT_MANIFEST_REQUIRED', 'Include manifest.json in the reviewed export.');
      const required = ['manifest.json', artifact.manifest.entrypoints.runtime, ...Object.values(artifact.manifest.ui || {}), ...(artifact.manifest.operations || []).map(op => op?.inputSchema)].filter(path => typeof path === 'string');
      const missing = required.filter(path => !Object.hasOwn(files, path));
      if (missing.length) fail('EXPORT_PACKAGE_INCOMPLETE', `The explicit source allowlist omits required package entries: ${missing.join(', ')}.`);
      validatePackage({manifest: artifact.manifest, files: Object.fromEntries(Object.entries(files).filter(([path]) => path !== 'manifest.json'))}); if (artifact.manifest.ui) compileUiPackage({manifest: artifact.manifest, files});
      const combined = Object.values(files).join('\n'); if (/(?:Bearer\s+[A-Za-z0-9_.-]{16,}|XBL3\.0|(?:refresh_token|access_token|device_token|xuid)\s*["':=]|https?:\/\/[^\s"']+[?&](?:sig|token|key)=)/i.test(combined)) fail('EXPORT_SENSITIVE_DATA', 'The selected source contains possible credentials or account data. Review it before preparing an export.');
      const value = {id: identifier('release'), workspaceId: args.workspaceId, gameGrants: wsRow.gameGrants || [], sourceBinding: artifact.sourceBinding || null, artifactId: args.artifactId, files, digest: digest(files), licenseEvidence: args.licenseEvidence, status: 'needs_review', createdAt: now(), excludesFixtures: true}; await assertGrants(principal, wsRow.gameGrants); await store.put(objectKey(principal, 'releases', value.id), value, {ifAbsent: true});
      return {status: 'needs_review', releaseId: value.id, digest: value.digest, files: Object.keys(files), downloadPath: `/api/developer/releases/${value.id}`, publication: 'not_performed', warning: 'Review the exact source bundle and license evidence before public publication.'};
    },
    registry_submit: async (principal, args) => { await workspace(principal, args.workspaceId); const release = await readRequired(principal, 'releases', args.releaseId, args.workspaceId); await assertGrants(principal, release.value.gameGrants); const value = {id: identifier('review'), workspaceId: args.workspaceId, releaseId: args.releaseId, digest: release.value.digest, status: 'needs_review', createdAt: now()}; await store.put(objectKey(principal, 'reviews', value.id), value, {ifAbsent: true}); return {...value, registryPromotion: 'not_performed'}; },
    trial_request: async (principal, args) => { await workspace(principal, args.workspaceId); const job = await readRequired(principal, 'jobs', args.jobId, args.workspaceId); await assertGrants(principal, job.value.gameGrants); if (job.value.type !== 'candidate' || job.value.status !== 'passed') fail('VALIDATED_CANDIDATE_REQUIRED', 'A passed offline candidate is required before requesting review.'); return {status: 'needs_review', workspaceId: args.workspaceId, jobId: args.jobId, reviewPath: '/developer/trials', xboxWritesPerformed: 0, reason: 'Live trials require separate trusted-host review, owned cloud binding, entitlement checks and owner approval. No writer is connected to this workbench.'}; }
  };
  return {
    tools(principal) { principalId(principal); return TOOL_DEFINITIONS.filter(t => principal.scopes.includes(t.scope)); },
    async dispatch(principal, name, input = {}, context = {}) {
      principalId(principal); const definition = toolDefinition(name);
      if (!definition) fail('TOOL_NOT_FOUND', 'This developer tool is unavailable.', 404);
      if (!principal.scopes.includes(definition.scope)) fail('SCOPE_REQUIRED', `Developer authorization requires ${definition.scope}.`, 403);
      const parsed = definition.schema.safeParse(input); if (!parsed.success) fail('INPUT_INVALID', 'The tool input does not match its documented schema.');
      const action = name.slice('saverift_'.length);
      if (access && parsed.data.workspaceId && handlers[action] && action !== 'workspace_export') {
        const actionNames = {workspace_patch: 'workspace:write', fixture_upload_prepare: 'fixture:upload', fixture_inspect: 'fixture:inspect', fixture_compare: 'fixture:inspect', catalog_import: 'catalog:import', catalog_query: 'catalog:query', plugin_build: 'job:run', tests_run: 'job:run', candidate_prepare: 'job:run', job_status: 'job:read', job_cancel: 'job:cancel', preview_open: 'preview:create', release_prepare: 'release:prepare', registry_submit: 'registry:submit', trial_request: 'trial:request'};
        await workspace(principal, parsed.data.workspaceId, actionNames[action] || 'workspace:read');
      }
      if (handlers[action]) return handlers[action](principal, parsed.data, context);
      if (collaboration) return collaboration.dispatch(principal, action, parsed.data);
      fail('COLLABORATION_NOT_CONFIGURED', 'Git collaboration is not configured in this deployment.', 409);
    },
    async trustedUploadFixture(principal, uploadId, bytes) {
      if (!principal?.scopes?.includes('workspace:write')) fail('SCOPE_REQUIRED', 'Developer authorization requires workspace:write.', 403);
      const upload = await readRequired(principal, 'uploads', uploadId);
      await assertGrants(principal, upload.value.gameGrants);
      if (upload.value.used || upload.value.expiresAt <= now()) fail('UPLOAD_EXPIRED', 'This upload intent is expired or already used.', 410);
      if (bytes.byteLength !== upload.value.byteLength) fail('UPLOAD_LENGTH_MISMATCH', 'The uploaded file length does not match its declaration.');
      await store.put(objectKey(principal, 'uploads', uploadId), {...upload.value, used: true}, {ifMatch: upload.etag});
      return addFixture(principal, await workspace(principal, upload.value.workspaceId), {...upload.value, bytes});
    },
    async trustedSetFixtureConsent(principal, workspaceId, fixtureId, allowed) {
      if (!principal?.scopes?.includes('workspace:write')) fail('SCOPE_REQUIRED', 'Developer authorization requires workspace:write.', 403);
      const row = await fixture(principal, workspaceId, fixtureId); const next = {...row.value, aiAccess: allowed === true};
      await gameAccess(principal, {gameId: (await workspace(principal, workspaceId)).value.gameId}, 'fixture:consent');
      await assertGrants(principal, row.gameGrants);
      await store.put(objectKey(principal, 'fixtures', fixtureId), next, {ifMatch: row.etag});
      const wsRow = await workspace(principal, workspaceId); await update(principal, wsRow, wsRow.value.revision, v => { v.fixtures = v.fixtures.map(f => f.id === fixtureId ? publicFixture(next) : f); });
      return publicFixture(next);
    },
    async trustedDeleteFixture(principal, workspaceId, fixtureId) {
      if (!principal?.scopes?.includes('workspace:write')) fail('SCOPE_REQUIRED', 'Developer authorization requires workspace:write.', 403);
      const row = await fixture(principal, workspaceId, fixtureId); await assertGrants(principal, row.gameGrants); await store.delete(objectKey(principal, 'fixtures', fixtureId), {ifMatch: row.etag});
      const wsRow = await workspace(principal, workspaceId); await update(principal, wsRow, wsRow.value.revision, v => { v.fixtures = v.fixtures.filter(f => f.id !== fixtureId); }); return {status: 'passed'};
    },
    async readPreview(principal, previewId) {
      requireScope(principal, 'workspace:read');
      const row = await readRequired(principal, 'previews', previewId);
      await assertGrants(principal, row.value.gameGrants);
      if (row.value.expiresAt <= now()) fail('PREVIEW_EXPIRED', 'This preview expired. Open a new preview.', 410);
      await workspace(principal, row.value.workspaceId);
      const selected = await execution(principal, row.value), view = [selected.primary, ...selected.extensions].find(a => a.id === row.value.uiArtifactId);
      if (!view) fail('PREVIEW_VIEW_NOT_PINNED', 'This view is no longer part of the selected exact package closure.', 403);
      await assertGrants(principal, row.value.gameGrants);
      const {gameGrants, ...publicPreview} = row.value;
      return {preview: publicPreview, artifact: view, primary: selected.primary, execution: selected, gameGrants};
    },
    async queryPreview(principal, previewId, query, signal) {
      const {preview, primary, execution: selected, gameGrants} = await this.readPreview(principal, previewId);
      if (!executeJob) return {status: 'not_run', reason: 'An isolated runtime executor is not configured.'};
      const fixtures = await fixtureInputs(principal, preview.workspaceId, preview.fixtureIds, {ai: false});
      const result = await executeJob({kind: 'inspect', package: {manifest: primary.manifest, files: primary.files}, extensions: selected.extensions.map(a => ({package: {manifest: a.manifest, files: a.files}})), executionLock: selected.executionLock, dataPackages: selected.dataPackages, catalogs: selected.catalogs, fixtures, input: {query}, signal});
      await assertGrants(principal, gameGrants);
      if (encode(JSON.stringify(result)).length > LIMITS.responseBytes) fail('RUNNER_OUTPUT_LIMIT', 'The preview query exceeds its report limit.');
      return result;
    },
    async readPreviewDraft(principal, previewId) {
      const {preview, gameGrants} = await this.readPreview(principal, previewId);
      const draft = (await readRequired(principal, 'drafts', preview.draftId, preview.workspaceId)).value.draft;
      await assertGrants(principal, gameGrants);
      return draft;
    },
    async editPreviewDraft(principal, previewId, request) {
      if (!principal?.scopes?.includes('workspace:write')) fail('SCOPE_REQUIRED', 'Developer authorization requires workspace:write.', 403);
      const {preview, artifact, execution: selected, gameGrants} = await this.readPreview(principal, previewId), row = await readRequired(principal, 'drafts', preview.draftId, preview.workspaceId);
      let edit;
      if (request.method === 'stage') {
        const operations = request.params.operations || (request.params.operation ? [request.params.operation] : []);
        if (!Array.isArray(operations) || operations.length < 1 || operations.length > 128) fail('DRAFT_EDIT_INVALID', 'A bounded operation list is required.');
        edit = {type: 'stageMany', operations: operations.map(op => ({id: op.id, apiVersion: op.apiVersion, params: op.params, instanceId: identifier('intent')})), removeInstanceIds: request.params.removeInstanceIds || []};
      } else if (request.method === 'removeOperation') edit = {type: 'remove', instanceId: request.params.instanceId};
      else if (request.method === 'reorderOperations') edit = {type: 'reorder', instanceIds: request.params.instanceIds};
      else fail('DRAFT_EDIT_INVALID', 'This preview draft action is unavailable.');
      const draft = editDraft(row.value.draft, edit, {expectedRevision: request.params.expectedRevision, operationCatalog: operationCatalog(selected), allowedOwners: [artifact.manifest.id]});
      await assertGrants(principal, gameGrants);
      await store.put(objectKey(principal, 'drafts', preview.draftId), {...row.value, draft}, {ifMatch: row.etag});
      return draft;
    },
    async downloadRelease(principal, releaseId) { requireScope(principal, 'workspace:read'); const row = await readRequired(principal, 'releases', releaseId); await workspace(principal, row.value.workspaceId); await assertGrants(principal, row.value.gameGrants); const {gameGrants, ...value} = row.value; return value; },
    async downloadCandidate(principal, jobId) { requireScope(principal, 'workspace:read'); const row = await readRequired(principal, 'candidates', jobId); await workspace(principal, row.value.workspaceId); await assertGrants(principal, row.value.gameGrants); const {gameGrants, ...value} = row.value; return value; },
    runJob
  };
}
