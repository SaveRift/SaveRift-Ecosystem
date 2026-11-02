// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Actual browser-module interactions against a bounded DOM/API test boundary.
// These do not represent rendered-browser QA, live App setup or two real users.
class Node {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.dataset = {}; this.hidden = false; this.disabled = false; this.checked = false; this._value = undefined; this._text = ''; const classes = new Set(); this.classList = {add: (...values) => values.forEach(v => classes.add(v)), remove: (...values) => values.forEach(v => classes.delete(v)), toggle: (v, force) => { const enabled = force === undefined ? !classes.has(v) : force; enabled ? classes.add(v) : classes.delete(v); return enabled; }, contains: v => classes.has(v)}; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set value(value) { this._value = String(value); }
  get value() { return this._value ?? (this.tagName === 'SELECT' ? this.children.find(c => c.selected)?.value ?? this.children[0]?.value ?? '' : this.tagName === 'OPTION' ? this.textContent : ''); }
  get options() { return this.children; }
  get selectedOptions() { return this.children.filter(c => c.value === this.value); }
  get firstChild() { return this.children[0]; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = children; if (this.tagName === 'SELECT') this._value = undefined; }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  async click() { if (this.disabled) return; for (const handler of this.listeners.click || []) await handler(); if (this.onclick) await this.onclick(); }
  focus() { this.focused = true; }
}

function legacy({configured = false, canConfirm = true, failConfirm = false, conflicts = []} = {}) {
  const source = {id: 'workspace_legacy', name: 'Retained private source', gameId: null, packageId: null, revision: 5, files: [{path: 'README.md'}], fixtures: [], jobs: [], catalog: null, enrollmentState: 'unbound'};
  let current = structuredClone(source), reviewNumber = 0;
  const privateFixture = {id: 'fixture_private', name: 'private-test.json', byteLength: 43, role: 'main', aiAccess: false, synthetic: false};
  const branch = {id: 'bws_selected', gameId: 'synthetic', revision: 4, gitHead: '1'.repeat(40), baseCommit: '1'.repeat(40), packageRoots: ['ecosystem/plugins/synthetic-game/'], branch: 'saverift/synthetic/selected/issue-7', repository: {id: '123', owner: 'example', name: 'ecosystem'}, issueNumber: 7, featureKey: 'skills.learn', dirty: false};
  return {source, privateFixture, async open() {
    const b = await browser({configured, configure({handlers}) {
      handlers.workspace_list = () => ({workspaces: [structuredClone(current)]});
      handlers.workspace_status = () => { if (!current.gameId) throw Object.assign(Error('Migrate the project explicitly'), {code: 'WORKSPACE_PROJECT_UNBOUND'}); return {workspace: structuredClone(current)}; };
      handlers.workspace_export = args => ({files: {'README.md': 'My retained source'}, revision: args.migrationId ? 5 : current.revision, archived: Boolean(args.migrationId), excludesPrivateData: true});
      handlers.workspace_read = () => ({content: 'My retained source', totalLength: 18, workspaceRevision: current.revision});
      handlers.branch_workspace_status = args => { assert.equal(args.workspaceId, branch.id); return {workspace: structuredClone(branch)}; };
      handlers.workspace_migration_prepare = args => {
        assert.equal(args.workspaceId, source.id); assert.equal(args.expectedRevision, 5); assert.equal(args.gameId, 'synthetic'); assert.equal(args.templateId, 'synthetic-json');
        if (args.mode === 'branch') { assert.equal(args.branchWorkspaceId, branch.id); assert.equal(args.expectedBranchRevision, 4); assert.equal(args.expectedGitHead, branch.gitHead); }
        const resolved = Boolean(args.resolutions?.some(value => value.path === 'README.md' && value.choice === 'local'));
        return {status: 'needs_review', reviewId: 'migration_review_' + ++reviewNumber, canConfirm: canConfirm && (!conflicts.length || resolved), workspaceId: source.id, sourceRevision: 5, gameId: 'synthetic', packageId: 'example.synthetic', mode: args.mode, canonical: {templateId: 'synthetic-json', templateDigest: 'a'.repeat(64), repository: configured ? branch.repository : null, baseCommit: configured ? branch.baseCommit : null, gitHead: args.mode === 'branch' ? branch.gitHead : null, branch: args.mode === 'branch' ? branch.branch : null, branchWorkspaceId: args.mode === 'branch' ? branch.id : null}, diff: [{path: 'README.md', change: 'modified', conflict: conflicts.length > 0, ...(resolved ? {choice: 'local'} : {})}], conflicts: conflicts.map(value => ({...value, ...(resolved ? {choice: 'local'} : {})})), fixturePreservation: {count: 1, aiConsentUnchanged: true, ownershipUnchanged: true}, evidence: 'requires_rebuild', expiresAt: Date.now() + 60000};
      };
      handlers.workspace_migration_read = args => ({path: args.path, variant: args.variant, content: args.variant === 'canonical' ? 'Canonical source' : 'My retained source', totalLength: args.variant === 'canonical' ? 16 : 18, truncated: false, sourceRevision: 5});
      handlers.workspace_migration_confirm = args => {
        assert.equal(args.expectedRevision, 5); assert.match(args.reviewId, /^migration_review_/);
        if (failConfirm) throw Object.assign(Error('The source revision changed. Prepare a fresh review.'), {code: 'MIGRATION_SOURCE_CHANGED'});
        const preparation = b.calls.filter(call => call.name === 'workspace_migration_prepare').at(-1).args;
        current = {...current, gameId: 'synthetic', packageId: 'example.synthetic', revision: 6, enrollmentState: 'enabled', fixtures: [structuredClone(privateFixture)], jobs: [], migrationHistory: [{id: args.reviewId, sourceRevision: 5, targetRevision: 6, mode: preparation.mode}], gitBinding: preparation.mode === 'branch' ? {...branch, branchWorkspaceId: branch.id, packageRoot: 'ecosystem/plugins/synthetic-game/'} : null};
        return {status: 'passed', workspace: structuredClone(current), evidence: 'requires_rebuild'};
      };
    }});
    await b.openWorkspace(source.id); return b;
  }};
}
async function selectLegacyTarget(b) { await b.change('migration-game', 'synthetic'); await b.change('migration-template', 'synthetic-json'); }

test('legacy source can be exported and explicitly reviewed without auto-enrollment or inferred Git binding', async () => {
  const b = await legacy().open();
  assert.equal(b.nodes.get('workspace-migration').hidden, false);
  assert.equal(b.nodes.get('migration-game').value, '');
  assert.equal(b.nodes.get('prepare-migration').disabled, true);
  assert.ok(!b.calls.some(call => call.name === 'workspace_migration_prepare' || call.name === 'developer_enrollment_set'));
  await b.nodes.get('export-source').click();
  assert.ok(b.calls.some(call => call.name === 'workspace_export'));
  await selectLegacyTarget(b);
  assert.equal(b.nodes.get('prepare-migration').disabled, true);
  await b.enroll();
  await b.nodes.get('prepare-migration').click();
  const request = b.calls.find(call => call.name === 'workspace_migration_prepare').args;
  assert.equal(request.mode, 'project'); assert.equal(request.branchWorkspaceId, undefined); assert.equal(request.expectedGitHead, undefined);
  assert.equal(b.nodes.get('migration-review').hidden, false);
  assert.match(b.nodes.get('migration-preview').textContent, /"branch": null/);
  assert.match(b.nodes.get('migration-fixture-state').textContent, /AI-inspection consent remain unchanged/);
  assert.equal(b.nodes.get('confirm-migration').disabled, false);
  assert.ok(!b.calls.some(call => call.name === 'workspace_migration_confirm' || call.name === 'branch_workspace_create'));
});

test('confirmed migration reopens the same private source and keeps fixture consent off while clearing built evidence', async () => {
  const fixture = legacy(), b = await fixture.open(); await selectLegacyTarget(b); await b.enroll();
  await b.nodes.get('prepare-migration').click(); await b.nodes.get('confirm-migration').click();
  assert.equal(b.nodes.get('source-editor').value, 'My retained source');
  assert.equal(b.nodes.get('workspace-migration').hidden, true);
  assert.equal(b.nodes.get('source-editor').disabled, false);
  assert.match(b.nodes.get('artifact-state').textContent, /Build and test this exact source again/);
  const card = b.nodes.get('fixture-list').children[0], consent = card.children.find(child => child.tagName === 'LABEL').children.find(child => child.tagName === 'INPUT');
  assert.equal(consent.checked, false); assert.equal(fixture.privateFixture.aiAccess, false);
  assert.equal(b.calls.filter(call => call.name === 'workspace_migration_confirm').length, 1);
  assert.ok(!b.calls.some(call => call.name === 'job_status' || /consent/.test(call.name)));
  assert.equal(b.nodes.get('source-version-label').hidden, false);
  await b.change('source-version', 'migration_review_1'); await b.nodes.get('export-source').click();
  assert.equal(b.calls.filter(call => call.name === 'workspace_export').at(-1).args.migrationId, 'migration_review_1');
  assert.match(b.nodes.get('notice').textContent, /preserved pre-migration source downloaded/);
});

test('branch migration uses an explicitly selected owned branch and requires a re-reviewed conflict choice', async () => {
  const b = await legacy({configured: true, conflicts: [{path: 'README.md'}]}).open(); await selectLegacyTarget(b); await b.enroll();
  await b.change('migration-mode', 'branch'); await b.input('migration-branch-id', 'bws_selected'); await b.change('migration-package-root', 'ecosystem/plugins/synthetic-game/');
  await b.nodes.get('prepare-migration').click();
  assert.equal(b.nodes.get('confirm-migration').disabled, true);
  const row = b.nodes.get('migration-source-diff').children[0], views = row.children.find(node => node.className === 'actions');
  await views.children.find(node => node.textContent === 'Canonical source').click();
  assert.equal(b.nodes.get('migration-file-content').textContent, 'Canonical source');
  const resolve = row.children.find(node => node.tagName === 'LABEL').children.find(node => node.tagName === 'SELECT');
  resolve.value = 'local'; resolve.onchange();
  assert.equal(b.nodes.get('confirm-migration').disabled, true);
  await b.nodes.get('prepare-migration').click();
  const request = b.calls.filter(call => call.name === 'workspace_migration_prepare').at(-1).args;
  assert.deepEqual(request.resolutions, [{path: 'README.md', choice: 'local'}]);
  assert.equal(request.expectedBranchRevision, 4); assert.equal(request.expectedGitHead, '1'.repeat(40));
  await b.nodes.get('confirm-migration').click();
  assert.match(b.nodes.get('git-binding').textContent, /saverift\/synthetic\/selected\/issue-7/);
  assert.ok(!b.calls.some(call => call.name === 'branch_workspace_create' || call.name === 'checkpoint_commit'));
});

test('source conflicts or enrollment revocation clear confirmation without silently retrying migration', async () => {
  const b = await legacy({failConfirm: true}).open(); await selectLegacyTarget(b); await b.enroll();
  await b.nodes.get('prepare-migration').click(); await b.nodes.get('confirm-migration').click();
  assert.match(b.nodes.get('notice').textContent, /source revision changed/);
  assert.equal(b.nodes.get('migration-review').hidden, true);
  assert.equal(b.calls.filter(call => call.name === 'workspace_migration_confirm').length, 1);
  await b.nodes.get('prepare-migration').click();
  b.nodes.get('developer-opt-in').checked = false; await b.nodes.get('developer-opt-in').onchange();
  assert.equal(b.nodes.get('migration-review').hidden, true); assert.equal(b.nodes.get('prepare-migration').disabled, true);
  assert.equal(b.calls.filter(call => call.name === 'workspace_migration_confirm').length, 1);
});

test('unsaved source blocks switching to another workspace or opening migration', async () => {
  const b = await legacy().open(); await selectLegacyTarget(b); await b.enroll(); await b.nodes.get('prepare-migration').click(); await b.nodes.get('confirm-migration').click();
  b.nodes.get('source-editor').value = 'Unsaved editor text';
  await b.nodes.get('migrate-workspace').click();
  assert.match(b.nodes.get('notice').textContent, /Save the current source file/);
  assert.equal(b.nodes.get('source-editor').value, 'Unsaved editor text');
  assert.equal(b.nodes.get('workspace-migration').hidden, true);
  await b.nodes.get('create-workspace').click();
  assert.ok(!b.calls.some(call => call.name === 'workspace_create'));
  assert.equal(b.nodes.get('source-editor').value, 'Unsaved editor text');
});

test('owner App setup stays hidden for an ordinary contributor and cannot begin from enrollment alone', async () => {
  const b = await browser(); await b.enroll();
  assert.equal(b.nodes.get('github-owner-setup').hidden, true);
  await b.nodes.get('begin-github-setup').click();
  assert.ok(!b.calls.some(call => call.name === '/github/setup/begin'));
  assert.match(b.nodes.get('notice').textContent, /Only the verified owner/);
});

test('owner App registration opens only the trusted setup form and verifies selected repository separately', async () => {
  const organization = {id: '351472929', login: 'SaveRift'};
  let setup = {ownerSetupAvailable: true, configured: false, state: 'not_started', organization, repository: {id: '1442896703'}, webhookState: 'inactive_private_host'};
  const b = await browser({configure({routes}) {
    routes['/github/setup/status'] = () => structuredClone(setup);
    routes['/github/setup/begin'] = () => { setup = {...setup, configured: true, slug: 'saverift-private-preview', installation: null, installationUrl: 'https://github.com/apps/saverift-private-preview/installations/new/permissions?suggested_target_id=351472929&repository_ids%5B%5D=1442896703'}; return {registrationPath: '/api/developer/github/setup/register?state=owner-one-use-state', expiresAt: Date.now() + 60000}; };
    routes['/github/setup/installation'] = () => { setup.installation = {id: '7788', repositoryId: '1442896703', verifiedAt: Date.now()}; return structuredClone(setup); };
  }});
  assert.equal(b.nodes.get('github-owner-setup').hidden, false);
  assert.ok(!b.calls.some(call => call.name === '/github/setup/begin' || call.name === '/github/setup/installation'));
  await b.nodes.get('begin-github-setup').click(); await new Promise(setImmediate);
  assert.deepEqual(b.popups[0].navigations, ['https://workbench.example.test/api/developer/github/setup/register?state=owner-one-use-state']);
  assert.equal(b.popups[0].opener, null);
  assert.equal(b.nodes.get('github-installation-link').href, setup.installationUrl);
  assert.equal(b.nodes.get('verify-github-installation').hidden, false);
  assert.ok(!b.calls.some(call => call.name === '/github/setup/installation' || call.name === '/github/begin'));
  await b.nodes.get('verify-github-installation').click();
  assert.match(b.nodes.get('github-setup-state').textContent, /selected ecosystem repository verified/);
  assert.equal(b.nodes.get('verify-github-installation').hidden, true);
  assert.match(b.nodes.get('github-webhook-state').textContent, /inactive on this private host/);
});

test('owner setup rejects offsite form paths and an unexpected installation target', async () => {
  const b = await browser({configure({routes}) {
    routes['/github/setup/status'] = () => ({ownerSetupAvailable: true, configured: false, state: 'not_started'});
    routes['/github/setup/begin'] = () => ({registrationPath: 'https://example.invalid/register?state=state', expiresAt: Date.now() + 60000});
  }});
  await b.nodes.get('begin-github-setup').click();
  assert.deepEqual(b.popups[0].navigations, []); assert.equal(b.popups[0].closed, true);
  assert.equal(b.nodes.get('github-registration-link').hidden, true);
  assert.match(b.nodes.get('notice').textContent, /trusted owner setup page/);
  b.routes['/github/setup/status'] = () => ({ownerSetupAvailable: true, configured: true, slug: 'saverift-private-preview', organization: {id: '351472929'}, repository: {id: '1442896703'}, installationUrl: 'https://github.com/apps/saverift-private-preview/installations/new/permissions?suggested_target_id=999&repository_ids%5B%5D=1442896703'});
  await b.nodes.get('refresh-github-setup').click();
  assert.equal(b.nodes.get('github-installation-link').hidden, true);
});

test('owner controls disappear when the server revokes setup access', async () => {
  const b = await browser({configure({routes}) {
    routes['/github/setup/status'] = () => ({ownerSetupAvailable: true, configured: false, state: 'not_started'});
  }});
  assert.equal(b.nodes.get('github-owner-setup').hidden, false);
  b.routes['/github/setup/status'] = () => { throw Object.assign(Error('Owner access was revoked'), {code: 'GITHUB_APP_OWNER_REQUIRED', status: 403}); };
  await b.nodes.get('refresh-github-setup').click();
  assert.equal(b.nodes.get('github-owner-setup').hidden, true);
  await b.nodes.get('begin-github-setup').click();
  assert.ok(!b.calls.some(call => call.name === '/github/setup/begin'));
});
test('completed failed jobs display their durable report after reopening without creating another job', async () => {
  const workspace = {id: 'ws_test', gameId: 'synthetic', name: 'Synthetic job recovery', revision: 2, files: [], fixtures: [], jobs: [{id: 'job_failed', type: 'tests'}, {id: 'job_build', type: 'build'}]};
  const b = await browser({configure({handlers}) {
    handlers.workspace_list = () => ({workspaces: [workspace]});
    handlers.workspace_status = () => ({workspace});
    handlers.job_status = args => args.jobId === 'job_build' ? {status: 'passed', job: {result: {artifactId: 'artifact_built', sourceRevision: 1}}} : {status: 'failed', job: {id: args.jobId, type: 'tests', status: 'failed', result: {code: 'CPU_LIMIT', error: 'The bounded phase expired.'}}};
  }});
  await b.enroll(); await b.openWorkspace(workspace.id); await b.change('job-history', 'job_failed');
  await b.nodes.get('open-job').click();
  assert.equal(JSON.parse(b.nodes.get('job-results').textContent).job.id, 'job_failed');
  assert.match(b.nodes.get('job-results').textContent, /CPU_LIMIT/);
  assert.match(b.nodes.get('notice').textContent, /CPU_LIMIT: The bounded phase expired/);
  assert.ok(!b.calls.some(call => ['tests_run', 'candidate_prepare', 'plugin_build'].includes(call.name)));
  b.nodes.get('job-history').value = 'job_unlisted'; await b.nodes.get('open-job').click();
  assert.ok(!b.calls.some(call => call.name === 'job_status' && call.args.jobId === 'job_unlisted'));
});

test('new conformance failures keep their actual report visible instead of the previous running result', async () => {
  const workspace = {id: 'ws_test', gameId: 'synthetic', name: 'Synthetic conformance', revision: 2, files: [], fixtures: [], jobs: [{id: 'job_build', type: 'build'}]};
  const b = await browser({configure({handlers}) {
    handlers.workspace_status = () => ({workspace});
    handlers.tests_run = () => ({jobId: 'job_new'});
    handlers.job_status = args => args.jobId === 'job_build' ? {status: 'passed', job: {result: {artifactId: 'artifact_built', sourceRevision: 1}}} : {status: 'failed', job: {id: args.jobId, result: {code: 'MEMORY_LIMIT', error: 'The guest memory limit was reached.'}}};
  }});
  await b.enroll(); await b.openWorkspace(workspace.id); await b.nodes.get('run-tests').click();
  assert.equal(JSON.parse(b.nodes.get('job-results').textContent).status, 'failed');
  assert.match(b.nodes.get('notice').textContent, /MEMORY_LIMIT/);
  assert.equal(b.calls.filter(call => call.name === 'tests_run').length, 1);
});

test('failed replacement clears old candidate links and reopening a passed job restores only its own downloads',async()=>{
 const workspace={id:'ws_test',gameId:'synthetic',name:'Candidate recovery',revision:2,files:[],fixtures:[],jobs:[{id:'job_saved',type:'candidate'},{id:'job_failed',type:'candidate'},{id:'job_build',type:'build'}]};
 const b=await browser({configure({handlers,routes}){
  handlers.workspace_status=()=>({workspace});
  handlers.job_status=args=>args.jobId==='job_build'?{status:'passed',job:{result:{artifactId:'artifact_built',sourceRevision:1}}}:args.jobId==='job_saved'?{status:'passed',job:{id:'job_saved',type:'candidate',status:'passed',result:{candidateDownloadPath:'/api/developer/candidates/job_saved'}}}:{status:'failed',job:{id:'job_failed',type:'candidate',status:'failed',result:{code:'MEMORY_LIMIT',error:'No candidate was produced.'}}};
  handlers.candidate_prepare=()=>{throw Error('Platform deadline');};
  routes['/candidates/job_saved']=()=>({artifacts:[{logicalPath:'save',downloadPath:'/api/developer/candidates/job_saved/file_one'}]});
 }});
 await b.enroll();await b.openWorkspace(workspace.id);b.nodes.get('candidate-downloads').append(new Node('a'));
 await b.change('job-history','job_failed');await b.nodes.get('open-job').click();assert.equal(b.nodes.get('candidate-downloads').children.length,0);
 await b.change('job-history','job_saved');await b.nodes.get('open-job').click();assert.equal(b.nodes.get('candidate-downloads').children.length,1);assert.equal(b.nodes.get('candidate-downloads').firstChild.href,'/api/developer/candidates/job_saved/file_one');
 b.nodes.get('operations').value='[]';await b.nodes.get('prepare-candidate').click();assert.equal(b.nodes.get('candidate-downloads').children.length,0);assert.equal(b.nodes.get('job-results').textContent,'Starting offline validation…');assert.match(b.nodes.get('notice').textContent,/Platform deadline/);
 assert.equal(b.calls.filter(c=>c.name==='/candidates/job_saved').length,1);
});

async function browser({configured = false, discoveryUnavailable = false, configure} = {}) {
  const nodes = new Map(), classNodes = new Map(), tabs = [], panels = [];
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
    const [, tag, attrs] = match, id = /\bid="([^"]+)"/.exec(attrs)?.[1], node = new Node(tag);
    node.hidden = /\bhidden\b/.test(attrs); node.disabled = /\bdisabled\b/.test(attrs);
    const value = /\bvalue="([^"]*)"/.exec(attrs)?.[1]; if (value !== undefined) node.value = value;
    const tab = /\bdata-tab="([^"]+)"/.exec(attrs)?.[1], panel = /\bdata-panel="([^"]+)"/.exec(attrs)?.[1];
    if (tab) { node.dataset.tab = tab; tabs.push(node); } if (panel) { node.dataset.panel = panel; panels.push(node); } if (id) nodes.set(id, node); const classes = /\bclass="([^"]+)"/.exec(attrs)?.[1]?.split(/\s+/) || []; for (const name of classes) if (!classNodes.has(name)) classNodes.set(name, node);
  }
  const document = {baseURI: 'https://workbench.example.test/developer', querySelector: selector => selector.startsWith('.') ? classNodes.get(selector.slice(1)) : nodes.get(selector.slice(1)), querySelectorAll: selector => selector === '[data-tab]' ? tabs : selector === '[data-panel]' ? panels : selector === '#file-list button' ? nodes.get('file-list').children : [], createElement: tag => new Node(tag), createTextNode: text => Object.assign(new Node('#text'), {_text: text})};
  const calls = [], storage = new Map(); let membership = {state: 'disabled', role: 'contributor', revision: 0};
  const project = {id: 'synthetic', displayName: 'Synthetic examples', packageId: 'example.synthetic-game', packageRoots: ['ecosystem/plugins/synthetic-game/'], capabilities: ['custom progression graph'], templateIds: ['synthetic-json'], license: 'Apache-2.0', repository: configured ? {id: '123', owner: 'example', name: 'ecosystem', url: 'https://github.com/example/ecosystem'} : null, maintainers: []};
  const discovery = {discoveryId: 'discovery-1', head: configured ? {sha: '1'.repeat(40)} : null, issues: configured ? [{number: 7, title: 'Add synthetic skills', state: 'open', url: 'https://github.com/example/ecosystem/issues/7'}] : [], workItems: [], contributors: [], draftPullRequests: [], github: {state: configured ? 'connected' : 'not_configured', canonical: configured}};
  const handlers = {
    template_list: () => ({templates: [{id: 'synthetic-json', title: 'Synthetic JSON game'}]}), project_list: () => ({projects: [project]}), project_discover: () => { if (discoveryUnavailable) throw Error('GitHub API unavailable'); return structuredClone(discovery); }, developer_enrollment_get: () => ({membership}), developer_enrollment_set: args => { assert.equal(args.expectedRevision, membership.revision); membership = {...membership, state: args.state, revision: membership.revision + 1}; return {membership}; }, workspace_list: () => ({workspaces: []}), workspace_create: () => ({workspace: {id: 'ws_test', name: 'Synthetic examples', gameId: 'synthetic', revision: 0, files: [], fixtures: [], jobs: []}}), workspace_status: () => ({workspace: {id: 'ws_test', name: 'Synthetic examples', gameId: 'synthetic', revision: 0, files: [], fixtures: [], jobs: []}}), work_claim: args => { const workItem = {gameId: args.gameId, issueNumber: args.issueNumber, featureKey: args.featureKey, revision: 3, state: 'active', collaborators: []}; discovery.workItems = [workItem]; return {status: 'already_claimed', workItem}; }, branch_workspace_create: () => { throw Error('No branch should be created by a claim.'); }
  };
  const routes = {'/github/setup/status': () => { throw Object.assign(Error('Owner setup unavailable'), {code: 'GITHUB_APP_SETUP_OWNER_REQUIRED'}); }, '/github/status': () => ({configured, linked: configured, githubUser: configured ? {login: 'verified-contributor'} : null, commitIdentityReady: configured})};
  const popups = [], window = {open() { const popup = {closed: false, navigations: [], location: {replace(url) { popup.navigations.push(url); }}, focus() {}, close() { this.closed = true; }}; popups.push(popup); return popup; }};
  if (configure) configure({handlers, nodes, discovery, routes, popups});
  const fetch = async (url, options) => {
    if (url === '/api/developer/status') return {ok: true, json: async () => ({xboxRequired: false})};
    const route = url.replace('/api/developer', '');
    if (routes[route]) { const args = options?.body ? JSON.parse(options.body) : undefined; calls.push({name: route, args}); return {ok: true, json: async () => routes[route](args)}; }
    assert.equal(url, '/api/developer/call'); const body = JSON.parse(options.body), name = body.name.replace('saverift_', ''); calls.push({name, args: body.arguments}); assert.ok(handlers[name], `Unhandled UI method ${name}`); return {ok: true, json: async () => handlers[name](body.arguments)};
  };
  const source = (await readFile(new URL('../browser.mjs', import.meta.url), 'utf8')).replace(/^import .*;\n/m, '');
  await vm.runInNewContext(`(async () => {${source}\n})()`, {document, fetch, window, sessionStorage: {setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k)}, URL, Blob, console, setTimeout, clearTimeout, confirm: () => false, prompt: () => null});
  return {nodes, calls, discovery, handlers, routes, popups, async change(id, value) { const node = nodes.get(id); if (value !== undefined) node.value = value; for (const listener of node.listeners.change || []) await listener(); if (node.onchange) await node.onchange(); }, async input(id, value) { const node = nodes.get(id); node.value = value; for (const listener of node.listeners.input || []) await listener(); }, async openWorkspace(id) { nodes.get('workspaces').value = id; await nodes.get('workspaces').onchange(); }, async enroll() { nodes.get('developer-opt-in').checked = true; await nodes.get('developer-opt-in').onchange(); }};
}
