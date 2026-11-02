// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Execute the actual browser module against a small DOM and API boundary. These
// exercise interaction/requests, not GitHub or hosted-account verification.
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
async function browser({configured = false, discoveryUnavailable = false, configure} = {}) {
  const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
  const nodes = new Map(), classNodes = new Map(), tabs = [], panels = [];
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
    const [, tag, attrs] = match, id = /\bid="([^"]+)"/.exec(attrs)?.[1], node = new Node(tag);
    node.hidden = /\bhidden\b/.test(attrs); node.disabled = /\bdisabled\b/.test(attrs);
    const value = /\bvalue="([^"]*)"/.exec(attrs)?.[1]; if (value !== undefined) node.value = value;
    const tab = /\bdata-tab="([^"]+)"/.exec(attrs)?.[1], panel = /\bdata-panel="([^"]+)"/.exec(attrs)?.[1];
    if (tab) { node.dataset.tab = tab; tabs.push(node); } if (panel) { node.dataset.panel = panel; panels.push(node); } if (id) nodes.set(id, node); const classes = /\bclass="([^"]+)"/.exec(attrs)?.[1]?.split(/\s+/) || []; for (const name of classes) if (!classNodes.has(name)) classNodes.set(name, node);
  }
  const document = {querySelector: selector => selector.startsWith('.') ? classNodes.get(selector.slice(1)) : nodes.get(selector.slice(1)), querySelectorAll: selector => selector === '[data-tab]' ? tabs : selector === '[data-panel]' ? panels : selector === '#file-list button' ? nodes.get('file-list').children : selector === '#fixture-list input' ? descendants(nodes.get('fixture-list')).filter(node=>node.tagName==='INPUT') : [], createElement: tag => new Node(tag), createTextNode: text => Object.assign(new Node('#text'), {_text: text})};
  const calls = [], storage = new Map(); let membership = {state: 'disabled', role: 'contributor', revision: 0};
  const project = {id: 'synthetic', displayName: 'Synthetic examples', packageId: 'example.synthetic-game', packageRoots: ['ecosystem/plugins/synthetic-game/'], capabilities: ['custom progression graph'], templateIds: ['synthetic-json'], license: 'Apache-2.0', repository: configured ? {id: '123', owner: 'example', name: 'ecosystem', url: 'https://github.com/example/ecosystem'} : null, maintainers: []};
  const discovery = {discoveryId: 'discovery-1', head: configured ? {sha: '1'.repeat(40)} : null, issues: configured ? [{number: 7, title: 'Add synthetic skills', state: 'open', url: 'https://github.com/example/ecosystem/issues/7'}] : [], workItems: [], contributors: [], draftPullRequests: [], github: {state: configured ? 'connected' : 'not_configured', canonical: configured}};
  const handlers = {
    template_list: () => ({templates: [{id: 'synthetic-json', title: 'Synthetic JSON game'}]}), project_list: () => ({projects: [project]}), project_discover: () => { if (discoveryUnavailable) throw Error('GitHub API unavailable'); return structuredClone(discovery); }, developer_enrollment_get: () => ({membership}), developer_enrollment_set: args => { assert.equal(args.expectedRevision, membership.revision); membership = {...membership, state: args.state, revision: membership.revision + 1}; return {membership}; }, workspace_list: () => ({workspaces: []}), workspace_create: () => ({workspace: {id: 'ws_test', name: 'Synthetic examples', gameId: 'synthetic', revision: 0, files: [], fixtures: [], jobs: []}}), workspace_status: () => ({workspace: {id: 'ws_test', name: 'Synthetic examples', gameId: 'synthetic', revision: 0, files: [], fixtures: [], jobs: []}}), work_claim: args => { const workItem = {gameId: args.gameId, issueNumber: args.issueNumber, featureKey: args.featureKey, revision: 3, state: 'active', collaborators: []}; discovery.workItems = [workItem]; return {status: 'already_claimed', workItem}; }, branch_workspace_create: () => { throw Error('No branch should be created by a claim.'); }
  };
  const routes = {'/github/status': () => ({configured, linked: configured, githubUser: configured ? {login: 'verified-contributor'} : null, commitIdentityReady: configured})};
  const popups = [], window = {open() { const popup = {closed: false, navigations: [], location: {replace(url) { popup.navigations.push(url); }}, focus() {}, close() { this.closed = true; }}; popups.push(popup); return popup; }};
  if (configure) configure({handlers, nodes, discovery, routes, popups});
  const fetch = async (url, options) => {
    if (url === '/api/developer/status') return {ok: true, json: async () => ({xboxRequired: false})};
    const route = url.replace('/api/developer', '');
    if (routes[route]) { const args = options?.body ? JSON.parse(options.body) : undefined; calls.push({name: route, args}); return {ok: true, json: async () => routes[route](args)}; }
    assert.equal(url, '/api/developer/call'); const body = JSON.parse(options.body), name = body.name.replace('saverift_', ''); calls.push({name, args: body.arguments}); assert.ok(handlers[name], `Unhandled UI method ${name}`); return {ok: true, json: async () => handlers[name](body.arguments)};
  };
  const source = (await readFile(new URL('../browser.mjs', import.meta.url), 'utf8')).replace(/^import .*;\n/m, '');
  await vm.runInNewContext(`(async () => {${source}\n})()`, {document, fetch, window, sessionStorage: {setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k)}, URL, console, setTimeout, clearTimeout, confirm: () => false, prompt: () => null});
  return {nodes, calls, discovery, handlers, routes, popups, async openWorkspace(id) { nodes.get('workspaces').value = id; await nodes.get('workspaces').onchange(); }, async enroll() { nodes.get('developer-opt-in').checked = true; await nodes.get('developer-opt-in').onchange(); }};
}

test('game discovery and enrollment precede hosted scaffolding; unconfigured Git stays unavailable', async () => {
  const b = await browser();
  assert.equal(b.nodes.get('project-portal').hidden, false);
  assert.equal(b.nodes.get('create-workspace').disabled, true);
  assert.equal(b.nodes.get('developer-opt-in').checked, false);
  assert.match(b.nodes.get('repository-state').textContent, /not configured/);
  await b.enroll();
  assert.equal(b.nodes.get('create-workspace').disabled, false);
  assert.equal(b.nodes.get('create-project-branch').disabled, true);
  assert.equal(b.nodes.get('commit-checkpoint').disabled, true);
  await b.nodes.get('create-workspace').click();
  const request = b.calls.find(c => c.name === 'workspace_create');
  assert.equal(request.args.gameId, 'synthetic'); assert.equal(request.args.discoveryId, 'discovery-1');
  assert.ok(b.calls.findIndex(c => c.name === 'project_discover') < b.calls.findIndex(c => c.name === 'workspace_create'));
  assert.ok(!b.calls.some(c => /checkpoint_commit|pr_open|branch_workspace_create/.test(c.name)));
});

test('an already claimed feature offers joining without silently creating another branch', async () => {
  const b = await browser({configured: true}); await b.enroll();
  b.nodes.get('work-issue').value = '7'; b.nodes.get('work-feature').value = 'skills.learn';
  await b.nodes.get('claim-work').click();
  const claim = b.calls.find(c => c.name === 'work_claim');
  assert.equal(claim.args.expectedRevision, 0); assert.equal(claim.args.discoveryId, 'discovery-1');
  assert.match(b.nodes.get('notice').textContent, /already has active work/);
  assert.match(b.nodes.get('active-work').textContent, /skills.learn/);
  assert.ok(!b.calls.some(c => c.name === 'branch_workspace_create'));
  b.nodes.get('developer-opt-in').checked = false; await b.nodes.get('developer-opt-in').onchange();
  assert.equal(b.nodes.get('create-workspace').disabled, true); assert.equal(b.nodes.get('join-work').disabled, true);
});


test('discovery failure is shown as unknown work rather than an empty project or a sign-in failure', async () => {
  const b = await browser({configured: true, discoveryUnavailable: true});
  assert.match(b.nodes.get('project-summary').textContent, /synchronization is unavailable/);
  assert.match(b.nodes.get('project-issues').textContent, /not an empty-work confirmation/);
  assert.match(b.nodes.get('identity-state').textContent, /Developer connected/);
  await b.enroll();
  assert.equal(b.nodes.get('create-workspace').disabled, true);
  assert.equal(b.nodes.get('create-project-branch').disabled, true);
  assert.ok(!b.calls.some(c => c.name === 'workspace_create'));
});


test('an opted-out owner can reach source export without loading private fixtures or jobs', async () => {
  const listed = {id: 'ws_disabled', name: 'Retained source', gameId: 'synthetic', revision: 9, files: [{path: 'README.md'}], fixtures: [], jobs: [], catalog: null, enrollmentState: 'disabled'};
  const b = await browser({configure({handlers}) {
    handlers.workspace_list = () => ({workspaces: [listed]});
    handlers.workspace_status = () => { throw Object.assign(Error('Hosted tools are disabled'), {code: 'GAME_ENROLLMENT_REQUIRED'}); };
  }});
  await b.openWorkspace(listed.id);
  assert.equal(b.nodes.get('export-source').disabled, false);
  assert.equal(b.nodes.get('save-file').disabled, true);
  assert.equal(b.nodes.get('source-editor').disabled, true);
  assert.match(b.nodes.get('workspace-meta').textContent, /Source export only/);
  assert.equal(b.nodes.get('fixture-list').children.length, 0);
  assert.ok(!b.calls.some(c => c.name === 'workspace_read' || c.name === 'job_status'));
});

test('bound source edits carry the exact Git head and reviewed checkpoints refresh the private build copy', async () => {
  const head = '1'.repeat(40), nextHead = '2'.repeat(40);
  let content = 'Original source', branch = {id: 'bws_private', gameId: 'synthetic', revision: 2, gitHead: head, baseCommit: head, packageRoots: ['ecosystem/plugins/synthetic-game/'], branch: 'saverift/synthetic/contributor/issue-7', repository: {id: '123', owner: 'example', name: 'ecosystem'}, issueNumber: 7, featureKey: 'skills.learn', dirty: false};
  let source = {id: 'ws_bound', name: 'Bound source', gameId: 'synthetic', revision: 1, files: [{path: 'README.md'}], fixtures: [], jobs: [], gitBinding: {...branch, branchWorkspaceId: branch.id}};
  const b = await browser({configured: true, configure({handlers}) {
    handlers.workspace_list = () => ({workspaces: [source]}); handlers.workspace_status = () => ({workspace: structuredClone(source)});
    handlers.workspace_read = () => ({content, totalLength: content.length, workspaceRevision: source.revision});
    handlers.branch_workspace_status = () => ({workspace: structuredClone(branch)});
    handlers.workspace_patch = args => { assert.equal(args.expectedGitHead, head); assert.equal(args.expectedRevision, source.revision); content = args.edits[0].content; branch = {...branch, revision: 3, dirty: true}; source = {...source, revision: 2, gitBinding: {...branch, branchWorkspaceId: branch.id}}; return {workspace: structuredClone(source)}; };
    handlers.checkpoint_prepare = args => { assert.equal(args.expectedGitHead, head); assert.equal(args.expectedRevision, 3); return {workspace: structuredClone(branch), review: {id: 'review_exact', revision: 3, gitHead: head}, diff: [{path: 'README.md', type: 'modified'}]}; };
    handlers.checkpoint_commit = args => { assert.equal(args.reviewId, 'review_exact'); assert.equal(args.expectedGitHead, head); assert.equal(args.expectedRevision, 3); branch = {...branch, revision: 5, gitHead: nextHead, dirty: false}; return {workspace: structuredClone(branch)}; };
    handlers.workspace_sync_from_branch = args => { assert.equal(args.workspaceId, source.id); assert.equal(args.expectedRevision, 2); assert.equal(args.expectedBranchRevision, 5); assert.equal(args.expectedGitHead, nextHead); source = {...source, revision: 3, gitBinding: {...branch, branchWorkspaceId: branch.id}}; return {workspace: structuredClone(source)}; };
  }});
  await b.enroll(); await b.openWorkspace(source.id);
  b.nodes.get('source-editor').value = 'Reviewed edited source'; await b.nodes.get('save-file').click();
  await b.nodes.get('prepare-checkpoint').click();
  assert.equal(b.nodes.get('commit-checkpoint').hidden, false);
  await b.nodes.get('commit-checkpoint').click();
  assert.ok(b.calls.some(c => c.name === 'workspace_sync_from_branch'));
  assert.equal(b.nodes.get('source-editor').value, 'Reviewed edited source');
  assert.match(b.nodes.get('artifact-state').textContent, /Build and test this exact revision/);
  assert.equal(b.nodes.get('commit-checkpoint').hidden, true);
});


test('GitHub setup is independent from the ChatGPT connector and does not simulate linking', async () => {
  const b = await browser();
  assert.match(b.nodes.get('github-state').textContent, /App setup is not configured/);
  assert.equal(b.nodes.get('link-github').disabled, true);
  assert.equal(b.nodes.get('github-commit-identity').hidden, true);
  assert.equal(b.nodes.get('create-project-branch').disabled, true);
  assert.equal(b.popups.length, 0);
  assert.ok(!b.calls.some(call => call.name === '/github/begin'));
});

test('GitHub linking navigates only to the server authorization URL and requires explicit public commit-email consent', async () => {
  let state = {configured: true, linked: false, githubUser: null, commitIdentityReady: false};
  const authorizationUrl = 'https://github.com/login/oauth/authorize?client_id=public-app-id&state=one-use-state';
  const b = await browser({configured: true, configure({routes}) {
    routes['/github/status'] = () => ({...state});
    routes['/github/begin'] = () => { state = {configured: true, linked: true, githubUser: {id: '1234', login: 'verified-author'}, commitIdentityReady: false}; return {authorizationUrl, expiresAt: Date.now() + 60000}; };
    routes['/github/identity'] = args => { assert.equal(args.email, 'verified-author@example.test'); state.commitIdentityReady = true; return {status: 'passed'}; };
    routes['/github/unlink'] = () => { state = {configured: true, linked: false, githubUser: null, commitIdentityReady: false}; return {status: 'passed'}; };
  }});
  await b.nodes.get('link-github').click(); await new Promise(setImmediate);
  assert.deepEqual(b.popups[0].navigations, [authorizationUrl]); assert.equal(b.popups[0].opener, null);
  assert.match(b.nodes.get('github-state').textContent, /verified-author/);
  assert.equal(b.nodes.get('github-commit-identity').hidden, false);
  b.nodes.get('github-email').value = 'verified-author@example.test';
  for (const handler of b.nodes.get('github-email').listeners.input || []) handler();
  assert.equal(b.nodes.get('set-github-identity').disabled, true);
  assert.ok(!b.calls.some(call => call.name === '/github/identity'));
  b.nodes.get('github-email-consent').checked = true;
  for (const handler of b.nodes.get('github-email-consent').listeners.change || []) handler();
  await b.nodes.get('set-github-identity').click();
  assert.match(b.nodes.get('github-state').textContent, /Commit identity ready/);
  assert.equal(b.nodes.get('github-commit-identity').hidden, true);
  await b.nodes.get('unlink-github').click();
  assert.match(b.nodes.get('github-state').textContent, /Link directly on GitHub/);
  assert.match(b.nodes.get('notice').textContent, /Microsoft connection and game enrollment are unchanged/);
});

test('an unexpected authorization host cannot receive the GitHub popup or expose a fallback link', async () => {
  const b = await browser({configured: true, configure({routes}) {
    routes['/github/status'] = () => ({configured: true, linked: false, githubUser: null, commitIdentityReady: false});
    routes['/github/begin'] = () => ({authorizationUrl: 'https://example.invalid/login/oauth/authorize?client_id=app&state=state', expiresAt: Date.now() + 60000});
  }});
  await b.nodes.get('link-github').click();
  assert.deepEqual(b.popups[0].navigations, []); assert.equal(b.popups[0].closed, true);
  assert.equal(b.nodes.get('github-authorization-link').hidden, true);
  assert.match(b.nodes.get('notice').textContent, /genuine GitHub authorization URL/);
});


test('private claims require a separate reviewed public post and uncertain outcomes reconcile without a second write', async () => {
  let posts = 0;
  const b = await browser({configured: true, configure({handlers}) {
    handlers.work_publish_prepare = args => ({review: {id: 'review_public', revision: args.expectedRevision}, publicRecord: {issueNumber: args.issueNumber, body: '@verified-author claims `skills.learn`. No player data.'}});
    handlers.work_publish = () => { posts++; throw Object.assign(Error('The exact outcome is not yet confirmed'), {code: 'GITHUB_MUTATION_OUTCOME_UNKNOWN'}); };
    handlers.work_publish_reconcile = () => ({publication: {state: 'published', assignmentVerified: false, comment: {id: 'comment_7', url: 'https://github.com/example/ecosystem/issues/7#issuecomment-7'}}});
  }});
  await b.enroll(); b.nodes.get('work-issue').value = '7'; b.nodes.get('work-feature').value = 'skills.learn';
  await b.nodes.get('claim-work').click();
  assert.equal(posts, 0); assert.ok(!b.calls.some(call => call.name === 'work_publish_prepare'));
  await b.nodes.get('prepare-work-publication').click();
  assert.equal(posts, 0); assert.equal(b.nodes.get('publish-work').hidden, false);
  assert.match(b.nodes.get('work-publication-preview').textContent, /No player data/);
  await b.nodes.get('publish-work').click();
  assert.equal(posts, 1); assert.equal(b.nodes.get('publish-work').hidden, true);
  assert.equal(b.nodes.get('prepare-work-publication').disabled, true);
  assert.equal(b.nodes.get('reconcile-work-publication').hidden, false);
  assert.match(b.nodes.get('work-publication-state').textContent, /needs reconciliation/);
  await b.nodes.get('reconcile-work-publication').click();
  assert.equal(posts, 1); assert.equal(b.nodes.get('reconcile-work-publication').hidden, true);
  assert.match(b.nodes.get('work-publication-state').textContent, /Published to the canonical GitHub issue/);
});

test('pending consent prevents a misleading checkbox or workspace selection before its stored response',async()=>{
 const fixture={id:'fixture_synthetic',name:'invented.json',role:'main',byteLength:2,synthetic:false,aiAccess:false},workspace={id:'ws_test',name:'Synthetic consent test',gameId:'synthetic',revision:1,files:[],fixtures:[fixture],jobs:[]};
 let accept,started;const ready=new Promise(resolve=>started=resolve);
 const b=await browser({configure({handlers,routes}){
  handlers.workspace_status=()=>({workspace:structuredClone(workspace)});
  routes['/fixtures/fixture_synthetic/consent']=args=>new Promise(resolve=>{accept=()=>{fixture.aiAccess=args.aiAccess;workspace.revision++;resolve({status:'passed'});};started();});
 }});
 await b.enroll();await b.openWorkspace(workspace.id);
 const checkbox=b.nodes.get('fixture-list').firstChild.children.find(node=>node.tagName==='LABEL').firstChild;
 assert.equal(checkbox.disabled,false);assert.equal(checkbox.checked,false);
 checkbox.checked=true;const saving=checkbox.onchange();await ready;assert.equal(checkbox.disabled,true);
 b.nodes.get('workspaces').value='ws_other';await b.nodes.get('workspaces').onchange();assert.equal(b.nodes.get('workspaces').value,workspace.id);
 assert.ok(!b.calls.some(call=>call.name==='workspace_status'&&call.args.workspaceId==='ws_other'));
 accept();await saving;
 const stored=b.nodes.get('fixture-list').firstChild.children.find(node=>node.tagName==='LABEL').firstChild;
 assert.equal(stored.checked,true);assert.equal(stored.disabled,false);assert.match(b.nodes.get('notice').textContent,/available for bounded AI inspection/);
});
