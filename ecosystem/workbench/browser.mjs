// SPDX-License-Identifier: Apache-2.0
import {compileUiPackage, mountPluginFrame} from '/developer-assets/ui/vanilla-frame.mjs';
const $ = selector => document.querySelector(selector);
let workspace, editingPath, editingContent, artifactId, preview, frame, draft, busy = false;
let workspaceIndex = new Map(), sourceOnly = false;
let projects = [], templates = [], project, discovery, membership, projectTools = false, branchWorkspace, issueReview, checkpointReview, prReview, branchObservation;
let githubConnection, githubPolling = false, githubPollSequence = 0;
let workPublicationReview, workPublicationTarget, workPublicationUnknown = false;
let migrationReview, migrationOpen = false, migrationGameId = '', migrationChoices = new Map(), migrationFile;
let githubSetup, githubSetupPolling = false, githubSetupSequence = 0;
const workspaceToolsEnabled = () => !projectTools || Boolean(workspace && workspace.gameId === project?.id && membership?.state === 'enabled');
const fixtures = () => workspace?.fixtures.map(f => f.id) || [];
const dependencySelection = () => ({extensionArtifactIds: ($('#extension-artifacts').value || '').split(/[\s,]+/).filter(Boolean)});
const show = (message, error = false) => { $('#notice').textContent = message || ''; $('#notice').classList.toggle('error', error); };
async function api(path, options = {}) {
  const response = await fetch(`/api/developer${path}`, {credentials: 'same-origin', ...options});
  const result = await response.json(); if (!response.ok || result.status === 'failed') throw Object.assign(Error(typeof result.error === 'string' ? result.error : result.error?.message || result.message || result.code || 'Developer operation failed.'), {code: result.code || result.error?.code, status: response.status}); return result;
}
const post = (path, body) => api(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
const call = (name, args = {}) => post('/call', {name: `saverift_${name}`, arguments: args});
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function action(selector, handler) { $(selector).addEventListener('click', () => task(handler)); }
async function task(handler) { if (busy) return; busy = true; $('#identity-state').classList.add('status-running'); try { await handler(); } catch (error) { show(error.message, true); } finally { busy = false; $('#identity-state').classList.remove('status-running'); } }
function tab(name) { document.querySelectorAll('[data-panel]').forEach(node => { node.hidden = node.dataset.panel !== name; }); document.querySelectorAll('[data-tab]').forEach(node => node.classList.toggle('selected', node.dataset.tab === name)); }
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => tab(button.dataset.tab));
async function reloadList(selectedId) {
  const result = await call('workspace_list'); workspaceIndex = new Map(result.workspaces.map(value => [value.id, value])); $('#workspaces').replaceChildren(el('option', 'Select a workspace'));
  for (const item of result.workspaces) { const option = el('option', item.name); option.value = item.id; $('#workspaces').append(option); }
  if (selectedId) $('#workspaces').value = selectedId;
}
async function loadWorkspace(id) {
  clearMigrationReview(); migrationOpen = false; migrationGameId = '';
  frame?.revoke(); frame = undefined; preview = undefined; draft = undefined; artifactId = undefined;
  $('#extension-artifacts').value = ''; $('#preview-view').replaceChildren(el('option', 'Automatic view')); $('#preview-view').firstChild.value = '';
  sourceOnly = false;
  try { workspace = (await call('workspace_status', {workspaceId: id})).workspace; }
  catch (error) {
    const listed = workspaceIndex.get(id);
    if (!listed || !['GAME_ENROLLMENT_REQUIRED', 'MEMBERSHIP_SUSPENDED', 'WORKSPACE_PROJECT_UNBOUND'].includes(error.code)) throw error;
    workspace = {...listed, fixtures: [], jobs: [], catalog: null}; sourceOnly = true;
  }
  if (projectTools && workspace.gameId && workspace.gameId !== project?.id) { $('#game-project').value = workspace.gameId; await loadProject(workspace.gameId); }
  branchWorkspace = undefined; branchObservation = undefined; clearGitReviews();
  if (workspace.gitBinding?.branchWorkspaceId || workspace.gitBinding?.id) await loadBranchWorkspace(); else renderGit();
  sessionStorage.setItem('saverift-dev-workspace', id); $('#workspace-title').textContent = workspace.name; $('#empty-state').hidden = true; $('#workspace-content').hidden = false;
  await renderWorkspace();
  if (sourceOnly) { tab('source'); show(!workspace.gameId ? 'This existing workspace has no project binding. Download your source or choose a game and review its explicit migration below. Private fixture consent will be preserved.' : 'Hosted tools are disabled for this project. Your source download remains available; private fixtures and jobs are hidden.'); return; }
  for (const job of workspace.jobs.filter(j => j.type === 'build')) { const status = await call('job_status', {workspaceId: id, jobId: job.id}); if (status.status === 'passed') { artifactId = status.job.result.artifactId; $('#artifact-state').textContent = `Built source revision ${status.job.result.sourceRevision} · ${artifactId}`; break; } }
}
async function renderWorkspace() {
  $('#workspace-meta').textContent = sourceOnly ? `Source export only · revision ${workspace.revision} · ${workspace.files.length} source files` : `Revision ${workspace.revision} · ${workspace.files.length} source files · ${workspace.fixtures.length} private/synthetic fixtures`;
  $('#file-list').replaceChildren(); $('#release-files').replaceChildren();
  $('#source-version').replaceChildren(el('option', 'Current source')); $('#source-version').firstChild.value = '';
  for (const version of workspace.migrationHistory || []) { const option = el('option', `Before migration · revision ${version.sourceRevision}`); option.value = version.id; $('#source-version').append(option); }
  $('#source-version-label').hidden = !workspace.migrationHistory?.length;
  for (const file of workspace.files) {
    const button = el('button', file.path); button.disabled = !workspaceToolsEnabled(); button.classList.toggle('active', editingPath === file.path); button.onclick = () => task(() => openFile(file.path)); $('#file-list').append(button);
    const label = el('label'), checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.value = file.path; checkbox.checked = true; label.append(checkbox, document.createTextNode(file.path)); $('#release-files').append(label);
  }
  renderFixtures(); renderMigration(); updateProjectControls();
  if (!editingPath || !workspace.files.some(f => f.path === editingPath)) editingPath = workspace.files[0]?.path;
  if (editingPath && !sourceOnly) await openFile(editingPath);
  else { editingPath = undefined; editingContent = ''; $('#editing-path').textContent = 'Your source download is available'; $('#source-editor').value = ''; $('#source-editor').placeholder = 'Enable this game’s developer tools to resume editing. Source export remains available without enrollment.'; }
}
async function refreshWorkspace() { workspace = (await call('workspace_status', {workspaceId: workspace.id})).workspace; await renderWorkspace(); }
async function openFile(path) {
  const first = await call('workspace_read', {workspaceId: workspace.id, path}); let content = first.content;
  while (content.length < first.totalLength) { const next = await call('workspace_read', {workspaceId: workspace.id, path, start: content.length}); if (next.workspaceRevision !== first.workspaceRevision || !next.content.length) throw Error('Source changed while this file was loading. Refresh the workspace.'); content += next.content; }
  editingPath = path; editingContent = content; $('#editing-path').textContent = path; $('#source-editor').value = content; document.querySelectorAll('#file-list button').forEach(node => node.classList.toggle('active', node.textContent === path)); clearGitReviews();
}
function renderFixtures() {
  $('#fixture-list').replaceChildren();
  for (const f of workspace.fixtures) {
    const card = el('article', undefined, 'fixture-card'); card.append(el('strong', f.name), el('small', `${f.synthetic ? 'Synthetic example' : 'Private upload'} · ${f.byteLength.toLocaleString()} bytes · ${f.role}`));
    const label = el('label'), toggle = el('input'); toggle.type = 'checkbox'; toggle.checked = f.aiAccess || f.synthetic; toggle.disabled = f.synthetic || !workspaceToolsEnabled(); toggle.dataset.synthetic = String(f.synthetic);
    toggle.onchange = () => task(async () => { await post(`/fixtures/${f.id}/consent`, {workspaceId: workspace.id, aiAccess: toggle.checked}); await refreshWorkspace(); show(toggle.checked ? 'This fixture is available for bounded AI inspection.' : 'AI fixture access revoked.'); });
    label.append(toggle, document.createTextNode(f.synthetic ? 'Original synthetic data · safe for examples' : 'Allow AI inspection of this fixture')); card.append(label);
    const remove = el('button', 'Delete fixture'); remove.disabled = !workspaceToolsEnabled(); remove.onclick = () => task(async () => { if (!confirm(`Delete ${f.name} from this private workspace?`)) return; await api(`/fixtures/${f.id}?workspaceId=${workspace.id}`, {method: 'DELETE'}); await refreshWorkspace(); }); card.append(remove); $('#fixture-list').append(card);
  }
}
async function createWorkspace() { checkSavedSourceIfOpen(); if (projectTools && (!project || !discovery?.discoveryId || membership?.state !== 'enabled')) throw Error('Review the game project and enable its developer tools first.'); const template = $('#template-choice').value || 'synthetic-json', name = template === 'synthetic-json' ? 'My synthetic game' : $('#template-choice').selectedOptions[0].textContent; const result = await call('workspace_create', {name: name.slice(0,80), template, ...(projectTools ? {gameId: project.id, discoveryId: discovery.discoveryId} : {})}); await reloadList(result.workspace.id); await loadWorkspace(result.workspace.id); show(template === 'synthetic-json' ? 'Synthetic workspace created. This is demonstration data, never a live game save.' : 'Connector source forked privately. Attach an owned fixture before testing; no player files were imported.'); }
action('#create-workspace', createWorkspace); action('#create-first', createWorkspace);
$('#workspaces').onchange = () => { if ($('#workspaces').value) return task(async () => { try { checkSavedSourceIfOpen(); } catch (error) { $('#workspaces').value = workspace?.id || ''; throw error; } await loadWorkspace($('#workspaces').value); }); };
action('#save-file', async () => { if (!workspace || !editingPath) return; const result = await call('workspace_patch', {workspaceId: workspace.id, expectedRevision: workspace.revision, ...(workspace.gitBinding ? {expectedGitHead: workspace.gitBinding.gitHead} : {}), edits: [{path: editingPath, content: $('#source-editor').value}]}); workspace = result.workspace; clearGitReviews(); if (workspace.gitBinding) await loadBranchWorkspace(); await renderWorkspace(); show('Source saved. Build a new artifact to preview these changes.'); });
action('#new-file', async () => { const path = prompt('New relative source path, for example runtime/skills.mjs'); if (!path) return; const result = await call('workspace_patch', {workspaceId: workspace.id, expectedRevision: workspace.revision, ...(workspace.gitBinding ? {expectedGitHead: workspace.gitBinding.gitHead} : {}), edits: [{path, content: '// Your new game system\n'}]}); workspace = result.workspace; clearGitReviews(); if (workspace.gitBinding) await loadBranchWorkspace(); editingPath = path; await renderWorkspace(); });
$('#fixture-upload').onchange = () => task(async () => { const file = $('#fixture-upload').files[0]; if (!file) return; try { const upload = await call('fixture_upload_prepare', {workspaceId: workspace.id, name: file.name, byteLength: file.size, role: $('#fixture-role').value}); await api(`/uploads/${upload.uploadId}`, {method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body: file}); await refreshWorkspace(); show('Fixture uploaded privately. AI inspection stays off until you enable it.'); } finally { $('#fixture-upload').value = ''; } });
action('#import-catalog', async () => { const result = await call('catalog_import', {workspaceId: workspace.id, expectedRevision: workspace.revision, format: $('#catalog-format').value, text: $('#catalog-text').value, idField: $('#catalog-id').value, nameField: $('#catalog-name').value, provenance: {source: $('#catalog-source').value, license: $('#catalog-license').value}}); await refreshWorkspace(); $('#catalog-results').textContent = JSON.stringify(result, null, 2); show('Reference data and explicit identifier crosswalk pinned.'); });
action('#query-catalog', async () => { $('#catalog-results').textContent = JSON.stringify(await call('catalog_query', {workspaceId: workspace.id, query: $('#catalog-search').value}), null, 2); });
async function waitForJob(job) {
  for (let i = 0; i < 180; i++) {
    const result = await call('job_status', {workspaceId: workspace.id, jobId: job.jobId}); $('#job-results').textContent = JSON.stringify(result, null, 2);
    if (!['pending', 'running'].includes(result.status)) { await refreshWorkspace(); if (result.status === 'failed') throw Error(result.job.result?.error || 'The isolated job failed.'); return result.job; }
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw Error('This job is still running. Reopen Build & test to check its durable status.');
}
action('#build-plugin', async () => { const job = await waitForJob(await call('plugin_build', {workspaceId: workspace.id, expectedRevision: workspace.revision})); artifactId = job.result.artifactId; $('#artifact-state').textContent = `Built source revision ${job.result.sourceRevision} · ${artifactId}`; show('Immutable source package built. Run conformance before preparing a release.'); });
action('#run-tests', async () => { if (!artifactId) throw Error('Build a source package first.'); const job = await waitForJob(await call('tests_run', {workspaceId: workspace.id, artifactId, fixtureIds: fixtures(), ...dependencySelection()})); show(job.status === 'passed' ? 'Isolated lifecycle, no-op byte parity and fresh-engine re-open passed. Game acceptance remains unverified.' : `Tests: ${job.status}. ${job.result.reason || ''}`); });
async function candidate(args) {
  if (!artifactId) throw Error('Build a source package first.');
  const job = await waitForJob(await call('candidate_prepare', {workspaceId: workspace.id, artifactId, fixtureIds: fixtures(), ...dependencySelection(), ...args}));
  $('#candidate-downloads').replaceChildren();
  if (job.result.candidateDownloadPath) { const output = await api(`/candidates/${job.id}`); for (const artifact of output.artifacts) { const link = el('a', `Download offline ${artifact.logicalPath}`, 'download'); link.href = artifact.downloadPath; $('#candidate-downloads').append(link); } }
  show(`Offline candidate ${job.status}. No Xbox write or public publication occurred.`); tab('run');
}
action('#prepare-candidate', async () => { const operations = JSON.parse($('#operations').value); await candidate({operations, ...(draft ? {expectedDraftRevision: draft.revision} : {})}); });
async function getDraft() { if (!preview) return null; draft = (await api(`/previews/${preview.previewId}/draft`)).draft; $('#draft-state').textContent = `Shared draft revision ${draft.revision} · ${draft.operations.length} queued change${draft.operations.length === 1 ? '' : 's'} · persists for this exact source`; return draft; }
async function editDraft(method, params) { if (!Number.isSafeInteger(params.expectedRevision)) throw Error('Refresh the shared draft before staging this change.'); const result = await post(`/previews/${preview.previewId}/draft`, {method, params}); draft = result.draft; frame?.notifyDraft(draft); await getDraft(); return draft; }
action('#open-preview', async () => {
  if (!artifactId) throw Error('Build a source package first.'); frame?.revoke();
  preview = await call('preview_open', {workspaceId: workspace.id, artifactId, fixtureIds: fixtures(), ...dependencySelection(), ...($('#preview-view').value ? {uiArtifactId: $('#preview-view').value} : {})});
  $('#preview-view').replaceChildren(...preview.views.map(view => { const option = el('option', `${view.displayName || view.id} · ${view.id}`); option.value = view.artifactId; option.selected = view.selected; return option; }));
  const result = await api(`/previews/${preview.previewId}`); await getDraft();
  frame = await mountPluginFrame({container: $('#plugin-preview'), ui: compileUiPackage(result.package), packageIdentity: result.package.manifest, handlers: {
    getContext: async () => ({mode: 'developer-preview', source: workspace.fixtures.every(f => f.synthetic) ? 'synthetic' : 'private-fixture', package: {id: result.package.manifest.id, version: result.package.manifest.version}, cloudWritesEnabled: false}),
    query: async params => { const result = await post(`/previews/${preview.previewId}/query`, {query: params}); if (result.status !== 'passed') throw Error(result.reason || 'This isolated query did not run.'); return result.data; },
    getDraft, subscribeDraft: getDraft, stage: params => editDraft('stage', params), removeOperation: params => editDraft('removeOperation', params), reorderOperations: params => editDraft('reorderOperations', params),
    catalogQuery: params => call('catalog_query', {workspaceId: workspace.id, query: params.search || params.query || ''}),
    resize: async () => ({accepted: true}), announce: async params => { show(String(params.message || '').slice(0, 300)); return {announced: true}; }
  }, onReview: async () => { await getDraft(); tab('run'); show('Review the shared offline draft, then validate its reconstructed candidate.'); }, onViolation: error => show(`The isolated preview stopped (${error.code || 'UI_ERROR'}).`, true), onReady: host => host.notifyDraft(draft)});
});
$('#extension-artifacts').addEventListener('change', () => { frame?.revoke(); frame = undefined; preview = undefined; draft = undefined; $('#preview-view').replaceChildren(el('option', 'Automatic view')); $('#preview-view').firstChild.value = ''; $('#draft-state').textContent = 'Dependency selection changed. Open a view to load its exact bound shared draft.'; });
$('#preview-view').addEventListener('change', () => { frame?.revoke(); frame = undefined; preview = undefined; draft = undefined; $('#draft-state').textContent = 'Open the selected package view to connect its scoped editor.'; });
action('#prepare-preview-draft', async () => { const current = await getDraft(); if (!current?.operations.length) throw Error('Stage a change in the custom editor first.'); await candidate({expectedDraftRevision: current.revision}); });
action('#prepare-release', async () => { if (!artifactId) throw Error('Build the exact source package first.'); const paths = [...document.querySelectorAll('#release-files input:checked')].map(input => input.value); const result = await call('release_prepare', {workspaceId: workspace.id, artifactId, paths, licenseEvidence: $('#license-evidence').value}); $('#release-result').textContent = JSON.stringify(result, null, 2); const link = el('a', 'Download exact source review bundle', 'download'); link.href = result.downloadPath; $('#release-download').replaceChildren(link); show('Private review bundle prepared. Public GitHub release and registry promotion remain separate approval steps.'); });
function safeLink(url, label, className = '') {
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.username || parsed.password) return el('span', label, className); const link = el('a', label, className); link.href = parsed.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link; }
  catch { return el('span', label, className); }
}
function emptyList(selector, text) { $(selector).replaceChildren(el('p', text, 'portal-empty')); }
function renderTemplates() {
  const choices = projectTools && project ? templates.filter(value => project.templateIds.includes(value.id)) : templates;
  $('#template-choice').replaceChildren(...choices.map(value => { const option = el('option', value.title); option.value = value.id; return option; }));
  updateProjectControls();
}
function updateProjectControls() {
  const hostedEnabled = !projectTools || membership?.state === 'enabled';
  const discovered = !projectTools || Boolean(discovery?.discoveryId);
  for (const id of ['create-workspace', 'create-first']) $('#' + id).disabled = !hostedEnabled || !discovered || !$('#template-choice').options.length;
  const remote = hostedEnabled && discovered && Boolean(project?.repository) && discovery?.github?.state === 'connected' && discovery?.github?.canonical === true;
  for (const id of ['claim-work', 'join-work', 'prepare-issue', 'submit-issue']) $('#' + id).disabled = !remote;
  const githubReady = githubConnection?.configured === true && githubConnection?.linked === true && githubConnection?.commitIdentityReady === true;
  for (const id of ['create-branch', 'create-project-branch']) $('#' + id).disabled = !remote || !githubReady;
  const linked = Boolean(branchWorkspace || workspace?.gitBinding), writable = remote && linked && (!workspace?.gameId || workspace.gameId === project?.id);
  for (const id of ['refresh-branch', 'sync-branch-source', 'preview-git', 'update-upstream', 'prepare-checkpoint', 'prepare-pr']) $('#' + id).disabled = !writable;
  const sourceCurrent = !branchWorkspace || workspace?.gitBinding?.gitHead === branchWorkspace.gitHead && (workspace?.gitBinding?.sourceRevision ?? workspace?.gitBinding?.revision) === branchWorkspace.revision;
  for (const id of ['prepare-checkpoint', 'prepare-pr']) $('#' + id).disabled = !writable || !sourceCurrent || !githubReady;
  $('#commit-checkpoint').disabled = !writable || !sourceCurrent || !githubReady || !checkpointReview;
  $('#open-pr').disabled = !writable || !sourceCurrent || !githubReady || !prReview;
  $('#prepare-work-publication').disabled = !remote || !githubReady || workPublicationUnknown;
  $('#publish-work').disabled = !remote || !githubReady || !workPublicationReview || workPublicationUnknown;
  $('#reconcile-work-publication').disabled = !remote || !githubReady || !workPublicationTarget || workPublicationTarget.gameId !== project?.id;
  $('#developer-opt-in').disabled = membership?.state === 'suspended';
  for (const id of ['save-file', 'new-file', 'import-catalog', 'query-catalog', 'build-plugin', 'run-tests', 'prepare-candidate', 'open-preview', 'prepare-preview-draft', 'prepare-release', 'fixture-upload']) $('#' + id).disabled = !workspaceToolsEnabled();
  $('#export-source').disabled = !workspace; $('#source-editor').disabled = !workspaceToolsEnabled();
  for (const control of document.querySelectorAll('#fixture-list button, #fixture-list input')) control.disabled = !workspaceToolsEnabled() || (control.type === 'checkbox' && control.dataset.synthetic === 'true');
  updateMigrationControls();
}
async function initializeProjects() {
  let result;
  try { result = await call('project_list'); }
  catch (error) { if (!['TOOL_NOT_FOUND', 'UNKNOWN_TOOL', 'METHOD_NOT_FOUND', 'TOOL_UNKNOWN'].includes(error.code)) throw error; $('#game-project').replaceChildren(el('option', 'Local source tools')); $('#game-project').disabled = true; return; }
  projectTools = true; projects = result.projects;
  $('#game-project').replaceChildren(...projects.map(value => { const option = el('option', value.displayName); option.value = value.id; return option; }));
  const saved = sessionStorage.getItem('saverift-dev-project');
  if (saved && projects.some(value => value.id === saved)) $('#game-project').value = saved;
  if (projects.length) await loadProject($('#game-project').value);
}
async function loadProject(gameId) {
  if (migrationReview && migrationReview.gameId !== gameId) clearMigrationReview();
  if (project?.id !== gameId) clearWorkPublicationReview();
  project = projects.find(value => value.id === gameId); discovery = undefined; membership = undefined; issueReview = undefined;
  if (!project) throw Error('Choose an available game project.');
  $('#project-portal').hidden = false; $('#project-portal').classList.add('is-loading'); updateProjectControls();
  try {
    const [result, enrollment] = await Promise.allSettled([call('project_discover', {gameId}), call('developer_enrollment_get', {gameId})]);
    if (enrollment.status !== 'fulfilled') throw enrollment.reason;
    membership = enrollment.value.membership;
    discovery = result.status === 'fulfilled' ? result.value : {state: 'unavailable', syncError: result.reason?.message || 'Project discovery is unavailable.'};
    sessionStorage.setItem('saverift-dev-project', gameId); renderProject(); renderTemplates(); renderGit(); renderMigration();
    if (['stale', 'unavailable'].includes(discovery.state)) show(`GitHub synchronization is unavailable: ${discovery.syncError || discovery.github?.error?.code || 'The latest repository state could not be verified.'} Existing source remains private; new contributions require a fresh project snapshot.`, true);
  } finally { $('#project-portal').classList.remove('is-loading'); }
}
function projectIssues() { return discovery?.issues || []; }
function projectWorkItems() { return discovery?.workItems || []; }
function workInput() {
  if (!project || !discovery?.discoveryId) throw Error('Refresh existing work before choosing a feature.');
  const issueNumber = Number($('#work-issue').value), featureKey = $('#work-feature').value.trim();
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1 || !featureKey) throw Error('Choose a linked issue and a small feature key first.');
  const workItem = projectWorkItems().find(value => value.issueNumber === issueNumber && value.featureKey === featureKey);
  return {gameId: project.id, discoveryId: discovery.discoveryId, issueNumber, featureKey, expectedRevision: workItem?.revision || 0};
}
function renderProject() {
  const repository = project.repository;
  $('#project-title').textContent = project.displayName;
  $('#project-summary').textContent = ['stale', 'unavailable'].includes(discovery?.state) ? 'GitHub synchronization is unavailable. Refresh existing work before scaffolding a contribution.' : repository ? 'Existing capabilities and current GitHub work, together with your private workspace state.' : 'The editable package is ready for local and hosted development. Its GitHub destination has not been configured.';
  $('#repository-state').textContent = repository ? `${repository.owner}/${repository.name}` : 'GitHub repository not configured';
  $('#developer-opt-in').checked = membership?.state === 'enabled';
  $('#enrollment-state').textContent = membership?.state === 'suspended' ? 'Suspended · contact the project maintainer' : membership?.state === 'enabled' ? `Enabled · ${membership.role}` : 'Disabled · source and local tools remain available';
  $('#project-capabilities').replaceChildren(...project.capabilities.map(value => el('li', value)));
  $('#project-package').textContent = `${project.packageId}\n${project.packageRoots.join(' · ')}\n${project.license}`;
  $('#project-source-link').replaceChildren(...(repository ? [safeLink(repository.url, 'Open canonical source ↗', 'project-source')] : []));
  const issues = projectIssues(), selectedIssue = $('#work-issue').value;
  $('#work-issue').replaceChildren(el('option', 'Choose an issue')); $('#work-issue').firstChild.value = '';
  for (const issue of issues) { const option = el('option', `#${issue.number} · ${issue.title}`); option.value = issue.number; $('#work-issue').append(option); }
  if (issues.some(value => String(value.number) === selectedIssue)) $('#work-issue').value = selectedIssue;
  if (!issues.length) emptyList('#project-issues', ['stale', 'unavailable'].includes(discovery?.state) ? 'Issue status is unavailable; this is not an empty-work confirmation.' : repository ? 'No open issues in the last synchronized snapshot.' : 'Live issue discovery starts after repository setup.');
  else $('#project-issues').replaceChildren(...issues.map(value => { const entry = el('article', undefined, 'portal-entry'); entry.append(safeLink(value.url || value.htmlUrl || value.html_url, `#${value.number} · ${value.title}`), el('small', `${value.state || 'open'}${value.assignees?.length ? ' · ' + value.assignees.map(item => typeof item === 'string' ? item : item.login).join(', ') : ''}`)); const choose = el('button', 'Choose this issue'); choose.onclick = () => { $('#work-issue').value = value.number; $('#work-feature').focus(); }; entry.append(choose); return entry; }));
  const contributors = [...(discovery?.contributors || []), ...(project.maintainers || []).map(value => ({login: value, role: 'maintainer'}))];
  const distinct = [...new Map(contributors.map(value => [typeof value === 'string' ? value : value.login || value.name, value])).values()];
  if (!distinct.length) emptyList('#project-contributors', repository ? 'No contributor identities in this snapshot.' : 'Contributors will appear with the canonical project.');
  else $('#project-contributors').replaceChildren(...distinct.map(value => { const login = typeof value === 'string' ? value : value.login || value.name; const entry = el('article', undefined, 'portal-entry'); entry.append(el('strong', login), el('small', value.role || 'contributor')); return entry; }));
  const drafts = discovery?.draftPullRequests || discovery?.draftPRs || [];
  if (!drafts.length) emptyList('#project-drafts', ['stale', 'unavailable'].includes(discovery?.state) ? 'Draft PR status is unavailable.' : repository ? 'No draft pull requests in this snapshot.' : 'Draft PRs require a configured repository.');
  else $('#project-drafts').replaceChildren(...drafts.map(value => { const entry = el('article', undefined, 'portal-entry'); entry.append(safeLink(value.url || value.htmlUrl || value.html_url, `#${value.number} · ${value.title}`), el('small', `${value.author?.login || value.author || 'Contributor'} · ${value.headRef || value.head?.ref || 'draft'}`)); return entry; }));
  const active = projectWorkItems();
  if (!active.length) emptyList('#active-work', 'No active feature claims in this snapshot. Claims coordinate work on a GitHub issue; they do not reserve a whole game.');
  else $('#active-work').replaceChildren(...active.map(value => { const entry = el('article', undefined, 'portal-entry'); entry.append(el('strong', `#${value.issueNumber} · ${value.featureKey}`), el('small', `${value.state} · revision ${value.revision} · ${value.collaborators?.length || 0} collaborator(s)${value.stale ? ' · activity is stale; review before reassignment' : ''}`)); const choose = el('button', 'Choose this feature'); choose.onclick = () => { $('#work-issue').value = value.issueNumber; $('#work-feature').value = value.featureKey; }; entry.append(choose); return entry; }));
  updateProjectControls();
}
$('#game-project').onchange = () => { if (busy) { $('#game-project').value = project?.id || ''; return; } return task(() => loadProject($('#game-project').value)); };
action('#refresh-project', () => loadProject($('#game-project').value));
action('#export-source', async () => {
  const migrationId = $('#source-version').value;
  const result = await call('workspace_export', {workspaceId: workspace.id, ...(migrationId ? {migrationId} : {})});
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], {type: 'application/json'}));
  const link = el('a'); link.href = url; link.download = `${workspace.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'workspace'}${migrationId ? '-revision-' + result.revision : ''}-source.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  show(`${migrationId ? 'Your preserved pre-migration' : 'Your editable'} source downloaded. Private fixtures, credentials and job data are excluded.`);
});
function checkSavedSourceIfOpen() {
  if (workspace && editingPath && $('#source-editor').value !== editingContent) throw Error('Save the current source file before changing workspace or migration target.');
}
function clearMigrationReview({keepChoices = false} = {}) {
  migrationReview = undefined; migrationFile = undefined;
  if (!keepChoices) migrationChoices.clear();
  $('#migration-review').hidden = true; $('#cancel-migration-review').hidden = true; $('#migration-file-preview').hidden = true;
  $('#migration-source-diff').replaceChildren(); $('#confirm-migration').disabled = true;
  $('#prepare-migration').textContent = 'Review migration';
}
function renderMigration() {
  const eligible = projectTools && workspace && !workspace.gitBinding;
  $('#migrate-workspace').hidden = !eligible;
  $('#migrate-workspace').textContent = workspace?.gameId ? 'Link existing source' : 'Migrate workspace';
  $('#workspace-migration').hidden = !eligible || Boolean(workspace.gameId && !migrationOpen);
  if (!eligible) return;
  $('#migration-title').textContent = workspace.gameId ? 'Carry your source into a branch.' : 'Give your source a project.';
  const selectedGame = migrationGameId;
  $('#migration-game').replaceChildren(el('option', 'Choose a game project')); $('#migration-game').firstChild.value = '';
  for (const game of projects.filter(value => !workspace.gameId || value.id === workspace.gameId)) { const option = el('option', game.displayName); option.value = game.id; $('#migration-game').append(option); }
  if (selectedGame && projects.some(value => value.id === selectedGame)) $('#migration-game').value = selectedGame;
  const target = projects.find(value => value.id === migrationGameId), selectedTemplate = $('#migration-template').value;
  $('#migration-template').replaceChildren(el('option', 'Choose a package')); $('#migration-template').firstChild.value = '';
  for (const template of templates.filter(value => target?.templateIds.includes(value.id))) { const option = el('option', template.title); option.value = template.id; $('#migration-template').append(option); }
  if ([...$('#migration-template').options].some(option => option.value === selectedTemplate)) $('#migration-template').value = selectedTemplate;
  const selectedRoot = $('#migration-package-root').value;
  $('#migration-package-root').replaceChildren(el('option', 'Choose an allowed package root')); $('#migration-package-root').firstChild.value = '';
  for (const root of target?.packageRoots || []) { const option = el('option', root); option.value = root; $('#migration-package-root').append(option); }
  if (target?.packageRoots.includes(selectedRoot)) $('#migration-package-root').value = selectedRoot;
  if (!['project', 'branch'].includes($('#migration-mode').value)) $('#migration-mode').value = 'project';
  for (const option of $('#migration-mode').options) option.disabled = Boolean(workspace.gameId) && option.value === 'project';
  $('#migration-state').textContent = `Private revision ${workspace.revision} stays retained. Review the selected package and source differences before confirming. Migration does not enable developer enrollment.`;
  updateMigrationControls();
}
function updateMigrationControls() {
  const target = projects.find(value => value.id === migrationGameId);
  const current = target?.id === project?.id, enabled = current && membership?.state === 'enabled';
  const discovered = current && Boolean(discovery?.discoveryId), branchMode = $('#migration-mode').value === 'branch';
  const canonical = current && Boolean(target?.repository) && discovery?.github?.state === 'connected' && discovery?.github?.canonical === true;
  $('#migration-branch-fields').hidden = !branchMode;
  $('#migration-game').disabled = !workspace || Boolean(workspace.gitBinding);
  $('#migration-template').disabled = !target;
  const sourceTarget = target ? `${target.displayName} · ${target.packageId}\n${target.repository ? target.repository.owner + '/' + target.repository.name : 'GitHub is not configured'}\n${target.baseCommit || 'No reviewed project base is configured.'}` : 'No target selected. Migration does not enable enrollment or assign a Git branch.';
  $('#migration-target-state').textContent = sourceTarget + (target ? `\n${!current ? 'Refresh this target project before migration.' : membership?.state === 'suspended' ? 'Developer access is suspended for this game.' : !enabled ? 'Enable this game’s developer tools above before preparing migration.' : branchMode ? canonical ? 'Choose an already-created owned issue branch. Its exact head and revision will be reviewed.' : 'A live canonical repository connection is required to attach a branch.' : 'Private project binding only. This does not link a Git branch or publish source.'}` : '');
  const targetReady = Boolean(workspace && !workspace.gitBinding && target && enabled && discovered && $('#migration-template').value);
  $('#prepare-migration').disabled = !targetReady || branchMode && (!canonical || !$('#migration-branch-id').value.trim() || !$('#migration-package-root').value);
  $('#confirm-migration').disabled = !targetReady || !migrationReview || migrationReview.gameId !== project?.id || migrationReview.sourceRevision !== workspace?.revision || migrationReview.canConfirm !== true || !Number.isFinite(migrationReview.expiresAt) || migrationReview.expiresAt <= Date.now();
}
action('#migrate-workspace', () => {
  checkSavedSourceIfOpen(); migrationOpen = true; clearMigrationReview();
  if (workspace.gameId) { migrationGameId = workspace.gameId; $('#migration-mode').value = 'branch'; }
  else { migrationGameId = ''; $('#migration-mode').value = 'project'; }
  renderMigration(); tab('source'); $('#migration-game').focus();
});
$('#migration-game').onchange = () => task(async () => {
  checkSavedSourceIfOpen(); clearMigrationReview(); migrationGameId = $('#migration-game').value;
  $('#migration-template').value = ''; $('#migration-package-root').value = '';
  if (migrationGameId) { $('#game-project').value = migrationGameId; await loadProject(migrationGameId); }
  renderMigration();
});
for (const selector of ['#migration-template', '#migration-mode', '#migration-package-root', '#migration-branch-id']) $(selector).addEventListener(selector === '#migration-branch-id' ? 'input' : 'change', () => { clearMigrationReview(); updateMigrationControls(); });
function renderMigrationDiff(result) {
  $('#migration-source-diff').replaceChildren();
  const conflicts = new Map((result.conflicts || []).map(value => [value.path, value]));
  for (const change of result.diff || []) {
    const row = el('article', undefined, 'migration-diff-row');
    row.append(el('strong', change.path), el('small', `${change.change || 'source difference'}${change.conflict ? ' · explicit choice required' : ''}`));
    const views = el('div', undefined, 'actions');
    for (const [variant, label] of [['base', 'Package base'], ['local', 'Private source'], ['canonical', 'Canonical source'], ['proposed', 'Proposed source']]) {
      const button = el('button', label); button.onclick = () => task(() => readMigrationFile(change.path, variant)); views.append(button);
    }
    row.append(views);
    if (change.conflict || conflicts.has(change.path)) {
      const label = el('label', undefined, 'field'), select = el('select');
      label.append(document.createTextNode('Resolve this source conflict'));
      for (const [value, text] of [['', 'Choose explicitly'], ['local', 'Keep private source'], ['canonical', 'Use canonical source']]) { const option = el('option', text); option.value = value; select.append(option); }
      select.value = migrationChoices.get(change.path) || change.choice || '';
      select.onchange = () => { if (!migrationReview) return; if (select.value) migrationChoices.set(change.path, select.value); else migrationChoices.delete(change.path); migrationReview.canConfirm = false; $('#prepare-migration').textContent = 'Review resolved migration'; updateMigrationControls(); };
      label.append(select); row.append(label);
    }
    $('#migration-source-diff').append(row);
  }
  if (!result.diff?.length) $('#migration-source-diff').append(el('p', 'No private source differences from the selected package.', 'muted'));
}
async function readMigrationFile(path, variant, append = false) {
  if (!migrationReview) throw Error('Prepare a current migration review before reading its source.');
  const start = append ? migrationFile.content.length : 0, reviewId = migrationReview.reviewId;
  const result = await call('workspace_migration_read', {workspaceId: workspace.id, reviewId, path, variant, start, length: 32768});
  if (migrationReview?.reviewId !== reviewId || result.sourceRevision !== migrationReview.sourceRevision) throw Error('The migration source changed. Prepare a fresh review.');
  migrationFile = {path, variant, content: (append ? migrationFile.content : '') + result.content, totalLength: result.totalLength};
  $('#migration-file-preview').hidden = false; $('#migration-file-label').textContent = `${path} · ${variant} · ${migrationFile.content.length.toLocaleString()} / ${result.totalLength.toLocaleString()} characters`;
  $('#migration-file-content').textContent = migrationFile.content; $('#migration-load-more').hidden = !result.truncated || migrationFile.content.length >= result.totalLength;
}
action('#migration-load-more', () => readMigrationFile(migrationFile.path, migrationFile.variant, true));
action('#cancel-migration-review', () => { clearMigrationReview(); updateMigrationControls(); show('Migration review discarded. Your workspace and fixture permissions are unchanged.'); });
action('#prepare-migration', async () => {
  checkSavedSourceIfOpen();
  if (!workspace || !migrationGameId || migrationGameId !== project?.id || membership?.state !== 'enabled' || !discovery?.discoveryId) throw Error('Choose the target game, review its existing work and explicitly enable developer tools before migration.');
  const input = {workspaceId: workspace.id, expectedRevision: workspace.revision, gameId: migrationGameId, discoveryId: discovery.discoveryId, templateId: $('#migration-template').value, mode: $('#migration-mode').value};
  if (!input.templateId) throw Error('Choose the exact package source for this workspace.');
  if (input.mode === 'branch') {
    input.branchWorkspaceId = $('#migration-branch-id').value.trim(); input.packageRoot = $('#migration-package-root').value;
    if (!input.branchWorkspaceId || !input.packageRoot) throw Error('Choose an owned issue-bound branch workspace and its allowed package root.');
    const result = await call('branch_workspace_status', {gameId: input.gameId, workspaceId: input.branchWorkspaceId});
    input.expectedBranchRevision = result.workspace.revision; input.expectedGitHead = result.workspace.gitHead;
  }
  if (migrationChoices.size) input.resolutions = [...migrationChoices].map(([path, choice]) => ({path, choice}));
  clearMigrationReview({keepChoices: true});
  const result = await call('workspace_migration_prepare', input);
  migrationReview = result; $('#migration-review').hidden = false; $('#cancel-migration-review').hidden = false;
  $('#migration-preview').textContent = JSON.stringify({workspaceId: result.workspaceId, sourceRevision: result.sourceRevision, gameId: result.gameId, packageId: result.packageId, mode: result.mode, canonical: result.canonical, sourceDifferences: result.diff?.length || 0, unresolvedConflicts: result.conflicts?.length || 0, sourceManifestMismatch: result.sourceManifestMismatch === true, canConfirm: result.canConfirm, evidence: result.evidence, expiresAt: result.expiresAt}, null, 2);
  const count = result.fixturePreservation?.count;
  $('#migration-fixture-state').textContent = `${Number.isSafeInteger(count) ? count + ' existing fixture(s)' : 'Existing fixtures'} stay private to this account. Ownership, expiry and AI-inspection consent remain unchanged. Build and preview evidence requires a fresh run.`;
  renderMigrationDiff(result); updateMigrationControls();
  show(!result.canConfirm ? 'Source conflicts need explicit choices. Reprepare the review after resolving them; no source has changed.' : result.sourceManifestMismatch ? 'Your manifest differs from the selected package identity. Migration preserves it; correct it before building. Review the exact target and source differences before confirming.' : 'Review the exact target and source differences, then confirm migration. Nothing has changed yet.');
});
action('#confirm-migration', async () => {
  checkSavedSourceIfOpen();
  if (migrationReview && migrationReview.expiresAt <= Date.now()) { clearMigrationReview(); throw Error('This migration review expired. Prepare a fresh review of the current source.'); }
  if (!migrationReview?.canConfirm || migrationReview.sourceRevision !== workspace?.revision || migrationReview.gameId !== project?.id || membership?.state !== 'enabled') throw Error('Prepare a fresh, fully resolved migration review first.');
  const input = {workspaceId: workspace.id, expectedRevision: migrationReview.sourceRevision, reviewId: migrationReview.reviewId};
  clearMigrationReview();
  const result = await call('workspace_migration_confirm', input);
  frame?.revoke(); frame = undefined; preview = undefined; draft = undefined; artifactId = undefined; editingPath = undefined;
  $('#artifact-state').textContent = 'Workspace binding changed. Build and test this exact source again.';
  await reloadList(result.workspace.id); await loadWorkspace(result.workspace.id); tab('source');
  show('Workspace migrated. Private source and fixture consent are preserved. Build and preview evidence must be regenerated; no Git commit or Xbox write occurred.');
});
$('#developer-opt-in').onchange = () => task(async () => {
  clearMigrationReview();
  const state = $('#developer-opt-in').checked ? 'enabled' : 'disabled';
  try { membership = (await call('developer_enrollment_set', {gameId: project.id, state, expectedRevision: membership.revision})).membership; }
  finally { $('#developer-opt-in').checked = membership?.state === 'enabled'; updateProjectControls(); }
  if (state === 'disabled') { frame?.revoke(); frame = undefined; preview = undefined; draft = undefined; if (workspace?.gameId === project.id) { sourceOnly = true; workspace = {...workspace, fixtures: [], jobs: [], catalog: null}; await renderWorkspace(); tab('source'); } }
  else if (workspace?.gameId === project.id) await loadWorkspace(workspace.id);
  renderProject(); show(state === 'enabled' ? `Developer tools enabled for ${project.displayName}. GitHub and fixture permissions remain separate.` : 'Hosted developer tools disabled. Public commits and PRs remain in GitHub.');
});
for (const [selector, actionName] of [['#claim-work', 'work_claim'], ['#join-work', 'work_join']]) action(selector, async () => {
  const result = await call(actionName, workInput()); clearWorkPublicationReview();
  await loadProject(project.id); $('#work-issue').value = result.workItem.issueNumber; $('#work-feature').value = result.workItem.featureKey;
  show(result.status === 'already_claimed' ? 'This feature already has active work. You can join it or choose a smaller task.' : result.status === 'joined' ? 'You joined the existing feature.' : 'Feature claim saved. GitHub remains the public coordination record.');
});
function clearGitReviews() { checkpointReview = undefined; prReview = undefined; $('#checkpoint-preview').hidden = true; $('#commit-checkpoint').hidden = true; $('#pr-preview').hidden = true; $('#open-pr').hidden = true; }
function gitWorkspaceId() { return branchWorkspace?.id || workspace?.gitBinding?.branchWorkspaceId || workspace?.gitBinding?.id; }
async function loadBranchWorkspace() {
  const id = gitWorkspaceId(); if (!id) { renderGit(); return; }
  const result = await call('branch_workspace_status', {gameId: workspace.gameId || project.id, workspaceId: id}); branchWorkspace = result.workspace || result.branchWorkspace; renderGit();
}
function gitArgs() { if (!workspace || !gitWorkspaceId()) throw Error('Link a branch-backed workspace first.'); return {gameId: workspace.gameId || project.id, workspaceId: gitWorkspaceId(), expectedRevision: branchWorkspace.revision, expectedGitHead: branchWorkspace.gitHead}; }
function renderGit() {
  const binding = branchWorkspace || workspace?.gitBinding;
  $('#git-binding').replaceChildren();
  if (!binding) { $('#git-binding').append(el('p', 'This private workspace is not linked to a repository branch.', 'muted')); $('#git-sync-state').textContent = 'No branch linked'; }
  else {
    const values = [['Repository', binding.repository?.url || (binding.repository?.owner && `${binding.repository.owner}/${binding.repository.name}`) || binding.repositoryId], ['Package', binding.packageId || project?.packageId], ['Allowed roots', (binding.packageRoots || project?.packageRoots || []).join(' · ')], ['Base commit', binding.baseCommit], ['Branch', binding.branch || binding.branchName || binding.branchRef], ['Git head', binding.headCommit || binding.head || binding.gitHead], ['Linked issue', binding.issueNumber ? `#${binding.issueNumber} · ${binding.featureKey || ''}` : 'No issue binding'], ['Private revision', binding.revision], ['Last synchronized', binding.lastSynchronizedCommit || binding.lastSynchronizedAt || binding.lastSyncAt || 'Not synchronized']];
    const list = el('dl'); for (const [key, value] of values) { list.append(el('dt', key), el('dd', value === undefined || value === null ? 'Unavailable' : String(value))); } $('#git-binding').append(list);
    const conflicted = branchObservation?.state === 'conflict' || binding.conflicts?.length || binding.syncState === 'conflict'; $('#git-sync-state').textContent = conflicted ? 'Conflict · local edits retained' : binding.dirty ? 'Private edits not committed' : branchObservation?.state || binding.syncState || 'Branch linked'; $('#git-sync-state').classList.toggle('sync-conflict', Boolean(conflicted));
  }
  $('#git-availability').textContent = !project?.repository ? 'GitHub is not configured for this project. Source tools still work; remote branches, commits and PRs are unavailable.' : !binding ? 'Choose a canonical issue and feature above, then create a branch. Your existing private workspace will be retained.' : 'Private source saves do not publish commits. Review each diff and expected Git head before checkpointing.';
  updateProjectControls();
}

action('#prepare-issue', async () => {
  const title = $('#issue-title').value.trim(), summary = $('#issue-body').value.trim(), featureKey = $('#work-feature').value.trim();
  if (!title || !summary || !featureKey) throw Error('Give the proposed issue a title, scope, verification target and feature key.');
  const result = await call('issue_propose', {gameId: project.id, discoveryId: discovery.discoveryId, title, summary, featureKey, expectedRevision: 0});
  issueReview = result.proposal; $('#issue-preview').textContent = JSON.stringify(issueReview, null, 2); $('#issue-preview').hidden = false; $('#submit-issue').hidden = false;
  show('Private issue proposal prepared. Review it before explicitly submitting to GitHub.');
});
action('#submit-issue', async () => {
  if (!issueReview) throw Error('Preview the issue before submitting it.');
  const result = await call('issue_submit', {gameId: project.id, proposalId: issueReview.id, expectedRevision: issueReview.revision, discoveryId: discovery.discoveryId});
  $('#submit-issue').hidden = true; $('#issue-preview').textContent = JSON.stringify(result, null, 2); issueReview = undefined; await loadProject(project.id); show('Issue submitted to GitHub. Refresh existing work before claiming it.');
});
for (const selector of ['#issue-title', '#issue-body', '#work-feature']) $(selector).addEventListener('input', () => { issueReview = undefined; $('#submit-issue').hidden = true; });
async function createBranchWorkspace() {
  checkSavedSourceIfOpen();
  const selected = workInput();
  if (!selected.expectedRevision) throw Error('Claim or join this issue feature before creating its branch.');
  const expectedGitHead = discovery?.head?.sha;
  if (!expectedGitHead) throw Error('Refresh the project to obtain its exact Git head before creating a branch.');
  const result = await call('branch_workspace_create', {...selected, expectedGitHead});
  const created = await call('workspace_from_branch', {gameId: project.id, branchWorkspaceId: result.workspace.id, name: `${project.displayName} · ${selected.featureKey}`.slice(0, 80)});
  await reloadList(created.workspace.id); await loadWorkspace(created.workspace.id); tab('source'); show('Repository source opened in a branch-backed workspace. Your other private workspaces are retained.');
}
action('#create-branch', createBranchWorkspace); action('#create-project-branch', createBranchWorkspace);
action('#refresh-branch', async () => { await loadBranchWorkspace(); show('Stored branch state refreshed. Update from upstream checks the current remote source.'); });
async function syncBranchSource() {
  checkSavedSource();
  const result = await call('workspace_sync_from_branch', {workspaceId: workspace.id, expectedRevision: workspace.revision, expectedBranchRevision: branchWorkspace.revision, expectedGitHead: branchWorkspace.gitHead});
  workspace = result.workspace; clearGitReviews(); artifactId = undefined; frame?.revoke(); frame = undefined; preview = undefined; draft = undefined; $('#artifact-state').textContent = 'Source binding changed. Build and test this exact revision.'; await refreshWorkspace(); renderGit();
}
action('#sync-branch-source', async () => { await syncBranchSource(); show('Exact branch source loaded into the private editor. Build evidence must be refreshed.'); });
action('#preview-git', async () => { const result = await call('branch_workspace_diff', {gameId: workspace.gameId || project.id, workspaceId: gitWorkspaceId()}); $('#git-diff').textContent = JSON.stringify(result, null, 2); });
action('#update-upstream', async () => {
  checkSavedSource();
  const result = await call('workspace_update_upstream', gitArgs()); branchWorkspace = result.workspace; branchObservation = result; clearGitReviews(); if (result.state === 'updated') await syncBranchSource(); renderGit(); $('#git-diff').textContent = JSON.stringify(result, null, 2); show(result.state === 'conflict' ? 'Upstream conflicts need review. Your private changes have been retained.' : result.message || 'Upstream synchronization reviewed. Build and test this source before using new evidence.');
});
function checkSavedSource() { if (!workspace) throw Error('Open a source workspace first.'); if (editingPath && $('#source-editor').value !== editingContent) throw Error('Save the current file before preparing a Git action.'); }
for (const [selector, method, kind] of [['#prepare-checkpoint', 'checkpoint_prepare', 'checkpoint'], ['#prepare-pr', 'pr_prepare', 'pr']]) action(selector, async () => {
  checkSavedSource(); const result = await call(method, gitArgs()); branchWorkspace = result.workspace;
  const target = kind === 'checkpoint' ? '#checkpoint-preview' : '#pr-preview', confirm = kind === 'checkpoint' ? '#commit-checkpoint' : '#open-pr';
  $(target).textContent = JSON.stringify({review: result.review, diff: result.diff}, null, 2); $(target).hidden = false; $(confirm).hidden = false;
  if (kind === 'checkpoint') checkpointReview = result.review; else prReview = result.review; renderGit(); show(kind === 'checkpoint' ? 'Review the exact source and Git head before committing.' : 'Review the draft PR before opening it on GitHub.');
});
action('#commit-checkpoint', async () => {
  if (!checkpointReview) throw Error('Prepare and review this checkpoint first.');
  const result = await call('checkpoint_commit', {...gitArgs(), reviewId: checkpointReview.id}); branchWorkspace = result.workspace; branchObservation = undefined; clearGitReviews(); await syncBranchSource(); renderGit(); $('#git-diff').textContent = JSON.stringify(result, null, 2); show('Reviewed source committed. Public review and registry promotion remain separate.');
});
action('#open-pr', async () => {
  if (!prReview) throw Error('Prepare and review this draft PR first.');
  const result = await call('pr_open', {...gitArgs(), reviewId: prReview.id}); if (result.workspace) branchWorkspace = result.workspace; clearGitReviews(); await syncBranchSource(); renderGit();
  const pr = result.pullRequest || result.pr; $('#pr-link').replaceChildren(...(pr ? [safeLink(pr.url || pr.htmlUrl || pr.html_url, `Open draft PR #${pr.number} ↗`, 'download')] : [])); show('Draft PR opened for maintainers. No merge, registry promotion or Xbox publication occurred.');
});
$('#source-editor').addEventListener('input', clearGitReviews);

function clearWorkPublicationReview() {
  if (workPublicationUnknown) { workPublicationReview = undefined; $('#publish-work').hidden = true; $('#reconcile-work-publication').hidden = false; $('#work-publication-state').textContent = `An earlier work update for ${workPublicationTarget.gameId} needs reconciliation. Return to that project to check the outcome.`; return; }
  workPublicationReview = undefined; workPublicationTarget = undefined; workPublicationUnknown = false;
  $('#publish-work').hidden = true; $('#reconcile-work-publication').hidden = true; $('#work-publication-preview').hidden = true;
  $('#work-publication-state').textContent = 'Public coordination status has not been checked.'; $('#work-publication-link').replaceChildren();
}
function showWorkPublication(publication, message) {
  $('#work-publication-state').textContent = publication?.state === 'published' ? 'Published to the canonical GitHub issue. Issue assignment and maintainer authority remain separate.' : message || `Publication state: ${publication?.state || 'not checked'}`;
  const comment = publication?.comment; $('#work-publication-link').replaceChildren(...(comment?.url ? [safeLink(comment.url, 'View public work update ↗', 'download')] : []));
}
action('#prepare-work-publication', async () => {
  const target = workInput();
  if (!target.expectedRevision) throw Error('Claim or join this feature before preparing its public work update.');
  let result;
  try { result = await call('work_publish_prepare', target); }
  catch (error) { if (error.code === 'WORK_PUBLICATION_OUTCOME_UNKNOWN') { workPublicationTarget = target; workPublicationUnknown = true; $('#publish-work').hidden = true; $('#reconcile-work-publication').hidden = false; $('#work-publication-state').textContent = 'An earlier publication outcome needs reconciliation. Do not post another work update.'; updateProjectControls(); } throw error; }
  workPublicationTarget = target; workPublicationReview = result.review; workPublicationUnknown = false;
  if (result.publication) { showWorkPublication(result.publication); $('#publish-work').hidden = true; $('#work-publication-preview').hidden = true; }
  else {
    $('#work-publication-preview').textContent = result.publicRecord.body; $('#work-publication-preview').hidden = false; $('#publish-work').hidden = false;
    $('#work-publication-state').textContent = `Review the exact comment for GitHub issue #${result.publicRecord.issueNumber}. It has not been posted.`;
  }
  $('#reconcile-work-publication').hidden = true; updateProjectControls();
});
action('#publish-work', async () => {
  if (!workPublicationReview || !workPublicationTarget) throw Error('Prepare and review this public work update first.');
  const target = {...workPublicationTarget}; const reviewId = workPublicationReview.id;
  try {
    const result = await call('work_publish', {...target, reviewId}); workPublicationReview = undefined; $('#publish-work').hidden = true; showWorkPublication(result.publication); updateProjectControls();
  } catch (error) {
    workPublicationReview = undefined; $('#publish-work').hidden = true;
    const preflight = ['GITHUB_MUTATIONS_DISABLED', 'SOURCE_REVIEW_STALE', 'SOURCE_REVIEW_REQUIRED', 'WORK_ITEM_REVISION_CONFLICT', 'GITHUB_AUTHOR_MISMATCH', 'GITHUB_AUTHOR_NOT_VERIFIED', 'GAME_ENROLLMENT_REQUIRED', 'MEMBERSHIP_SUSPENDED', 'GAME_GRANT_REVOKED', 'GITHUB_NOT_CONFIGURED', 'GITHUB_APP_NOT_CONFIGURED'];
    if (preflight.includes(error.code)) { $('#work-publication-state').textContent = `Not published: ${error.message}`; updateProjectControls(); throw error; }
    workPublicationUnknown = true; $('#reconcile-work-publication').hidden = false; $('#work-publication-state').textContent = 'Publication outcome needs reconciliation. Do not post again until the exact outcome is known.'; updateProjectControls(); show(`${error.code || 'GITHUB_UNAVAILABLE'}: ${error.message} Check the original publication outcome before another post.`, true);
  }
});
action('#reconcile-work-publication', async () => {
  if (!workPublicationTarget || workPublicationTarget.gameId !== project?.id) throw Error('Return to the original game project to reconcile this work update.');
  const latest = projectWorkItems().find(value => value.issueNumber === workPublicationTarget.issueNumber && value.featureKey === workPublicationTarget.featureKey);
  const result = await call('work_publish_reconcile', {...workPublicationTarget, discoveryId: discovery.discoveryId, expectedRevision: latest?.revision || workPublicationTarget.expectedRevision});
  workPublicationUnknown = result.publication?.state !== 'published'; $('#reconcile-work-publication').hidden = !workPublicationUnknown; showWorkPublication(result.publication, result.message); updateProjectControls();
});
for (const selector of ['#work-feature', '#work-issue']) $(selector).addEventListener(selector === '#work-issue' ? 'change' : 'input', () => { if (!workPublicationUnknown) clearWorkPublicationReview(); updateProjectControls(); });

function renderGithubConnection() {
  const linked = githubConnection?.linked === true;
  $('#link-github').disabled = githubConnection?.configured !== true || linked || githubPolling;
  $('#link-github').textContent = githubPolling ? 'Waiting for GitHub…' : 'Link GitHub';
  $('#unlink-github').hidden = !linked; $('#unlink-github').disabled = githubPolling;
  $('#github-commit-identity').hidden = !linked || githubConnection?.commitIdentityReady === true;
  $('#set-github-identity').disabled = !linked || !$('#github-email-consent').checked || !$('#github-email').value.trim();
  document.querySelector('.github-connection').classList.toggle('is-pending', githubPolling);
  if (githubConnection?.state === 'unavailable') $('#github-state').textContent = 'The GitHub connection could not be checked. Refresh to verify its state.';
  else if (githubConnection?.configured !== true) $('#github-state').textContent = 'GitHub App setup is not configured for this workbench. Source editing remains available.';
  else if (linked) {
    const user = githubConnection.githubUser, name = typeof user === 'string' ? user : user?.login || user?.name || 'Verified contributor';
    $('#github-state').textContent = `${name} · ${githubConnection.commitIdentityReady ? 'Commit identity ready' : 'Choose your public commit identity below'}`;
  } else $('#github-state').textContent = githubPolling ? 'Complete authorization on GitHub. No repository action is submitted during linking.' : 'Link directly on GitHub before creating a contribution branch.';
  updateProjectControls();
}
async function refreshGithubConnection() {
  try { githubConnection = await api('/github/status'); }
  catch (error) {
    githubConnection = ['GITHUB_NOT_CONFIGURED', 'ROUTE_NOT_FOUND', 'NOT_FOUND'].includes(error.code) ? {configured: false, linked: false} : {configured: false, linked: false, state: 'unavailable'};
  }
  renderGithubConnection(); return githubConnection;
}
function githubAuthorizationUrl(value) {
  let parsed; try { parsed = new URL(value); } catch { throw Error('The server did not return a valid GitHub authorization URL.'); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.port || parsed.hash || parsed.username || parsed.password || parsed.pathname !== '/login/oauth/authorize' || !parsed.searchParams.get('client_id') || !parsed.searchParams.get('state')) throw Error('The server did not return a genuine GitHub authorization URL.');
  return parsed.href;
}
async function pollGithubAuthorization(popup, expiresAt, sequence) {
  const deadline = Math.min(Date.now() + 180000, Number.isFinite(expiresAt) ? expiresAt : Date.now() + 180000);
  try {
    for (let i = 0; i < 120 && Date.now() < deadline && sequence === githubPollSequence; i++) {
      const current = await refreshGithubConnection();
      if (current.linked === true) { $('#github-authorization-link').hidden = true; show(current.commitIdentityReady ? 'GitHub identity linked. Contribution and release permissions remain separate.' : 'GitHub identity linked. Select a verified address for public commits.'); break; }
      if (popup?.closed) { show('The GitHub window closed. Refresh the connection if you completed authorization.'); break; }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  } finally {
    if (sequence === githubPollSequence) { githubPolling = false; renderGithubConnection(); }
  }
}
action('#refresh-github', refreshGithubConnection);
action('#link-github', async () => {
  if (githubConnection?.configured !== true) throw Error('GitHub App setup is required before linking.');
  // Open synchronously from the user click; the server chooses the actual
  // authorization URL. No credentials are accepted by this page.
  const popup = window.open('about:blank', '_blank', 'popup,width=640,height=760');
  if (popup) popup.opener = null;
  try {
    const result = await post('/github/begin', {}), url = githubAuthorizationUrl(result.authorizationUrl);
    const fallback = $('#github-authorization-link'); fallback.href = url; fallback.hidden = false;
    if (popup) { popup.location.replace(url); popup.focus(); }
    githubPolling = true; const sequence = ++githubPollSequence; renderGithubConnection();
    void pollGithubAuthorization(popup, typeof result.expiresAt === 'string' ? Date.parse(result.expiresAt) : result.expiresAt, sequence);
  } catch (error) { popup?.close(); throw error; }
});
$('#github-email').addEventListener('input', renderGithubConnection); $('#github-email-consent').addEventListener('change', renderGithubConnection);
action('#set-github-identity', async () => {
  if (!$('#github-email-consent').checked) throw Error('Confirm that this verified address may appear in public commits.');
  const email = $('#github-email').value.trim(); if (!email) throw Error('Enter a verified GitHub email or verified no-reply address.');
  await post('/github/identity', {email}); $('#github-email-consent').checked = false; $('#github-email').value = ''; await refreshGithubConnection(); clearGitReviews(); clearWorkPublicationReview(); show('Public commit identity verified. Existing source reviews must be prepared again.');
});
action('#unlink-github', async () => {
  ++githubPollSequence; githubPolling = false; await post('/github/unlink', {}); $('#github-authorization-link').hidden = true; $('#github-email-consent').checked = false; $('#github-email').value = ''; clearGitReviews(); clearWorkPublicationReview(); await refreshGithubConnection(); show('GitHub unlinked. Public commits and PRs remain on GitHub; your Microsoft connection and game enrollment are unchanged.');
});
function setupRegistrationUrl(path) {
  let url, origin;
  try { origin = new URL(document.baseURI).origin; url = new URL(path, document.baseURI); } catch { throw Error('The server did not return a valid owner setup page.'); }
  if (typeof path !== 'string' || !path.startsWith('/api/developer/github/setup/register?') || url.origin !== origin || url.pathname !== '/api/developer/github/setup/register' || url.hash || url.searchParams.getAll('state').length !== 1 || !url.searchParams.get('state') || [...url.searchParams.keys()].some(key => key !== 'state')) throw Error('The server did not return the trusted owner setup page.');
  return url.href;
}
function setupInstallationUrl(value, status) {
  const slug = status.slug || status.app?.slug, organizationId = status.organization?.id, repositoryId = status.repository?.id;
  let url; try { url = new URL(value); } catch { return null; }
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,100}$/.test(slug) || !organizationId || !repositoryId || url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.hash || url.pathname !== `/apps/${slug}/installations/new/permissions` || String(organizationId) !== url.searchParams.get('suggested_target_id') || url.searchParams.getAll('suggested_target_id').length !== 1 || url.searchParams.getAll('repository_ids[]').length !== 1 || url.searchParams.get('repository_ids[]') !== String(repositoryId) || [...url.searchParams.keys()].some(key => !['suggested_target_id', 'repository_ids[]'].includes(key))) return null;
  return url.href;
}
function renderGithubSetup() {
  const owner = githubSetup?.ownerSetupAvailable === true || githubSetup?.canSetup === true;
  $('#github-owner-setup').hidden = !owner;
  if (!owner) return;
  const configured = githubSetup.configured === true, installation = githubSetup.installation;
  const installed = Boolean(installation?.id && (installation.verified === true || installation.verifiedAt));
  const blocked = ['converting', 'recovery_required', 'unavailable'].includes(githubSetup.state);
  $('#begin-github-setup').hidden = configured;
  $('#begin-github-setup').disabled = blocked || githubSetupPolling;
  $('#begin-github-setup').textContent = githubSetupPolling ? 'Waiting for App registration…' : 'Open GitHub App setup';
  $('#verify-github-installation').hidden = !configured || installed; $('#verify-github-installation').disabled = githubSetupPolling;
  const installUrl = configured ? setupInstallationUrl(githubSetup.installationUrl || githubSetup.installUrl, githubSetup) : null;
  $('#github-installation-link').hidden = !installUrl || installed;
  if (installUrl) $('#github-installation-link').href = installUrl;
  if (configured) $('#github-registration-link').hidden = true;
  $('#github-setup-state').textContent = installed ? `${githubSetup.slug || githubSetup.app?.slug || 'SaveRift App'} · selected ecosystem repository verified. Contributors still link their own GitHub identity.` : configured ? 'App registered. Install it for only the selected ecosystem repository on GitHub, then verify the installation here.' : githubSetup.state === 'recovery_required' ? 'An earlier registration needs owner recovery. No replacement App will be created automatically.' : githubSetup.state === 'converting' ? 'The backend is completing App registration. Refresh to check the result.' : githubSetup.state === 'unavailable' ? 'Owner setup state could not be checked. Refresh before continuing.' : githubSetup.state === 'pending' ? 'Complete App creation on GitHub’s genuine screen, then refresh this setup status.' : 'Register SaveRift’s scoped GitHub App. Your existing ChatGPT GitHub connection and contributor linking remain separate.';
  $('#github-webhook-state').textContent = githubSetup.webhookState === 'inactive_private_host' ? 'Webhook delivery is inactive on this private host. Discovery uses live GitHub reads; this setup does not publish the workbench or source.' : '';
}
async function refreshGithubSetup() {
  try { githubSetup = await api('/github/setup/status'); }
  catch (error) { githubSetup = error.status === 401 || error.status === 403 || ['SCOPE_REQUIRED', 'GITHUB_APP_OWNER_REQUIRED', 'GITHUB_APP_SETUP_DENIED', 'GITHUB_APP_SETUP_OWNER_REQUIRED', 'DEVELOPER_SIGN_IN_REQUIRED', 'DEVELOPER_ROUTE_NOT_FOUND', 'GITHUB_APP_SETUP_ROUTE_NOT_FOUND', 'NOT_FOUND', 'ROUTE_NOT_FOUND'].includes(error.code) ? undefined : githubSetup?.ownerSetupAvailable ? {...githubSetup, state: 'unavailable'} : undefined; }
  renderGithubSetup(); return githubSetup;
}
async function pollGithubSetup(popup, expiresAt, sequence) {
  const deadline = Math.min(Date.now() + 180000, Number.isFinite(expiresAt) ? expiresAt : Date.now() + 180000);
  try {
    for (let i = 0; i < 120 && Date.now() < deadline && sequence === githubSetupSequence; i++) {
      const status = await refreshGithubSetup();
      if (status?.configured === true) { await refreshGithubConnection(); show('SaveRift’s GitHub App is registered. Complete its selected-repository installation before authoring.'); break; }
      if (!status?.ownerSetupAvailable || status.state === 'recovery_required' || popup?.closed) break;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  } finally { if (sequence === githubSetupSequence) { githubSetupPolling = false; renderGithubSetup(); } }
}
action('#refresh-github-setup', async () => { await refreshGithubSetup(); await refreshGithubConnection(); });
action('#begin-github-setup', async () => {
  if (githubSetup?.ownerSetupAvailable !== true && githubSetup?.canSetup !== true) throw Error('Only the verified owner can begin GitHub App setup.');
  const popup = window.open('about:blank', '_blank', 'popup,width=760,height=820'); if (popup) popup.opener = null;
  try {
    const result = await post('/github/setup/begin', {}), url = setupRegistrationUrl(result.registrationPath);
    const link = $('#github-registration-link'); link.href = url; link.hidden = false;
    if (popup) { popup.location.replace(url); popup.focus(); }
    githubSetupPolling = true; const sequence = ++githubSetupSequence; renderGithubSetup();
    void pollGithubSetup(popup, typeof result.expiresAt === 'string' ? Date.parse(result.expiresAt) : result.expiresAt, sequence);
    show('The owner setup page is ready. Continue to GitHub there to create the App; no credentials are entered in SaveRift.');
  } catch (error) { popup?.close(); throw error; }
});
action('#verify-github-installation', async () => {
  if (githubSetup?.ownerSetupAvailable !== true && githubSetup?.canSetup !== true) throw Error('Only the verified owner can check this App installation.');
  await post('/github/setup/installation', {}); await refreshGithubSetup(); await refreshGithubConnection();
  if (project) await loadProject(project.id);
  show('Selected-repository installation checked against GitHub. Game enrollment, contributor identity and source review remain separate.');
});

try { const status = await api('/status'); $('#identity-state').textContent = status.xboxRequired === false ? 'Developer connected · no Xbox required' : 'Developer connected'; templates = (await call('template_list')).templates; renderTemplates(); await initializeProjects(); await refreshGithubConnection(); await refreshGithubSetup(); await reloadList(); const restored = sessionStorage.getItem('saverift-dev-workspace'); if (restored && [...$('#workspaces').options].some(o => o.value === restored)) { $('#workspaces').value = restored; await loadWorkspace(restored); } }
catch (error) { $('#identity-state').textContent = 'Developer sign-in required'; show(error.message, true); }
