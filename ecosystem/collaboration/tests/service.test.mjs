// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryStore, sha256, fail} from '../../workbench/storage.mjs';
import {createGameAccess} from '../enrollment.mjs';
import {createCollaborationService} from '../service.mjs';
import {sourceDigest} from '../git-workspaces.mjs';

const root = 'ecosystem/plugins/synthetic-game/', a = {id: 'contributor-a', scopes: ['developer']}, b = {id: 'contributor-b', scopes: ['developer']};
const project = {id: 'synthetic', displayName: 'Synthetic game', packageId: 'example.synthetic-game', packageRoots: [root], templateIds: ['synthetic-json'], license: 'Apache-2.0', capabilities: ['existing inventory'], maintainers: ['maintainer'], repository: {id: '71234', owner: 'saverift-test', name: 'ecosystem', defaultBranch: 'main'}, enrollmentOpen: true};
const path = name => root + name;
const files = {[path('connector.mjs')]: 'export const schema = 1;\n', [path('README.md')]: 'Public source\n', [path('package-lock.json')]: '{"lockfileVersion":3}\n', [path('fixture.save')]: '{"synthetic":true}'};
function fakeGit() {
  let sequence = 0, unavailable = false;
  const commits = new Map(), branches = new Map(), calls = [], pullRequests = [], comments = [], issues = [{id: 201, number: 7, title: 'Add companion naming', state: 'open', labels: ['game:synthetic'], assignees: [{id: '1', login: 'known-contributor'}], htmlUrl: 'https://github.com/saverift-test/ecosystem/issues/7', updatedAt: '2026-11-02T10:00:00Z'}];
  function commit(source, author = 'external', parent = null) {const sha = sha256(JSON.stringify({sequence: ++sequence, source, author, parent})).slice(0, 40), treeSha = sha256(JSON.stringify(source)).slice(0, 40); commits.set(sha, {files: structuredClone(source), treeSha, author, parent}); return sha;}
  const initial = commit(files); branches.set('main', initial);
  function call(name, input) {if (unavailable) fail('GITHUB_UNAVAILABLE', 'Offline', 502); calls.push({name, input: structuredClone(input)});}
  const api = {
    calls, issues, pullRequests, comments, commits, branches, initial,
    setUnavailable(value) {unavailable = value;},
    externalCommit(branch, changes, author = 'external') {const head = branches.get(branch), source = {...commits.get(head).files}; for (const change of changes) if (change.content === null) delete source[change.path]; else source[change.path] = change.content; const next = commit(source, author, head); branches.set(branch, next); return next;},
    async getRepository(ctx) {call('getRepository', ctx); return {...project.repository, private: true, htmlUrl: 'https://github.com/saverift-test/ecosystem'};},
    async readHead(ctx) {call('readHead', ctx); const sha = branches.get(ctx.branch || 'main'); if (!sha) fail('GITHUB_REQUEST_FAILED', 'No ref', 404); return {branch: ctx.branch || 'main', sha, treeSha: commits.get(sha).treeSha};},
    async readTree(ctx) {call('readTree', ctx); const data = commits.get(ctx.commit); return {commitSha: ctx.commit, treeSha: data.treeSha, truncated: false, entries: Object.entries(data.files).map(([path, content]) => ({path, mode: '100644', type: 'blob', sha: sha256(content).slice(0, 40), size: Buffer.byteLength(content)}))};},
    async readSource(ctx) {call('readSource', ctx); const data = commits.get(ctx.commit), source = Object.fromEntries(Object.entries(data.files).filter(([path]) => !ctx.paths || ctx.paths.includes(path))); return {commitSha: ctx.commit, treeSha: data.treeSha, files: source};},
    async listIssues(ctx) {call('listIssues', ctx); return {issues: structuredClone(issues), hasMore: false};},
    async getIssue(ctx) {call('getIssue', ctx); return structuredClone(issues.find(issue => issue.number === ctx.number));},
    async listDraftPRs(ctx) {call('listDraftPRs', ctx); return {pullRequests: structuredClone(pullRequests), hasMore: false};},
    async getVerifiedAuthor(actor) {call('getVerifiedAuthor', {actor}); return {verified: true, githubUserId: actor.id === a.id ? '11' : '22', login: actor.id, name: actor.id, email: actor.id + '@contributors.invalid', publicEmailConsent: true};},
    async createBranch(ctx) {call('createBranch', ctx); if (branches.get(ctx.base || 'main') !== ctx.expectedBaseSha || branches.has(ctx.branch)) fail('GITHUB_HEAD_CHANGED', 'Race', 409); branches.set(ctx.branch, ctx.expectedBaseSha); return {branch: ctx.branch, headSha: ctx.expectedBaseSha, created: true};},
    async checkpoint(ctx) {call('checkpoint', ctx); if (branches.get(ctx.branch) !== ctx.expectedHead) fail('GITHUB_HEAD_CHANGED', 'Race', 409); if (ctx.verifiedAuthor.login !== ctx.actor.id) fail('GITHUB_AUTHOR_MISMATCH', 'Mismatch', 403); const source = {...commits.get(ctx.expectedHead).files}; for (const change of ctx.changes) if (change.content === null) delete source[change.path]; else source[change.path] = change.content; const next = commit(source, ctx.verifiedAuthor.login, ctx.expectedHead); branches.set(ctx.branch, next); return {branch: ctx.branch, headSha: next, commitSha: next, treeSha: commits.get(next).treeSha, attribution: 'verified-user-author; app-mediated-commit'};},
    async openDraftPR(ctx) {call('openDraftPR', ctx); if (branches.get(ctx.branch) !== ctx.expectedHead) fail('GITHUB_HEAD_CHANGED', 'Race', 409); const pr = {number: 40 + pullRequests.length, url: 'https://github.com/saverift-test/ecosystem/pull/' + (40 + pullRequests.length), state: 'open', draft: true, headSha: ctx.expectedHead, baseSha: branches.get(ctx.base), headRef: ctx.branch, baseRef: ctx.base}; pullRequests.push(pr); return pr;},
    async createIssue(ctx) {call('createIssue', ctx); const issue = {...issues[0], id: 202, number: 8, title: ctx.title, assignees: [], labels: [ctx.issueLabel]}; issues.push(issue); return issue;},
    async listIssueComments(ctx) {call('listIssueComments', ctx); return {comments: structuredClone(comments), hasMore: false};},
    async createIssueComment(ctx) {call('createIssueComment', ctx); const comment = {id: 1000 + comments.length, body: ctx.body, url: 'https://github.com/saverift-test/ecosystem/issues/' + ctx.number + '#issuecomment-' + (1000 + comments.length), author: {id: '800', login: 'saverift-bot'}, serviceAuthored: true}; comments.push(comment); return comment;}
  };
  return api;
}
async function fixture({configured = true, external = true, review = true} = {}) {
  const store = createMemoryStore(); let at = 1793613600000;
  const access = createGameAccess({store, projects: [{...project, repository: configured ? project.repository : null}], now: () => at});
  const git = fakeGit(), service = createCollaborationService({store, access, git, now: () => at, externalMutationsEnabled: external, reviewSource: review ? async input => ({approved: true, sourceDigest: input.sourceDigest, policyDigest: 'a'.repeat(64)}) : null});
  for (const actor of [a, b]) await access.enroll(actor, {gameId: 'synthetic', expectedRevision: 0});
  return {store, access, git, service, advance(ms) {at += ms;}};
}
const work = discovery => ({gameId: 'synthetic', discoveryId: discovery.discoveryId, issueNumber: 7, featureKey: 'companions.rename', expectedRevision: 0});
const target = workspace => ({gameId: 'synthetic', workspaceId: workspace.id, expectedRevision: workspace.revision, expectedGitHead: workspace.gitHead});
async function branchFor(f, actor = a) {
  const discovery = await f.service.discoverProject(actor, {gameId: 'synthetic'});
  let claimed = await f.service.claimWork(actor, work(discovery));
  if (claimed.status === 'already_claimed') claimed = await f.service.joinWork(actor, {...work(discovery), expectedRevision: claimed.workItem.revision});
  const created = await f.service.prepareBranchWorkspace(actor, {...work(discovery), expectedRevision: claimed.workItem.revision, expectedGitHead: discovery.head.sha});
  return created.workspace;
}
async function edit(f, actor, workspace, name = 'connector.mjs', content = 'export const schema = 2;\n') {return (await f.service.patchBranchWorkspace(actor, {...target(workspace), changes: [{path: path(name), content}]})).workspace;}
async function checkpoint(f, actor, workspace) {const prepared = await f.service.prepareCheckpoint(actor, target(workspace)); return f.service.checkpoint(actor, {...target(workspace), reviewId: prepared.review.id});}

test('discovery is actor-bound and shows canonical existing capabilities, issues, contributors and drafts before scaffolding', async () => {
  const f = await fixture(), discovery = await f.service.dispatch(a, 'project_discover', {gameId: 'synthetic'});
  assert.equal(discovery.state, 'current'); assert.deepEqual(discovery.capabilities, ['existing inventory']); assert.equal(discovery.issues[0].number, 7); assert.equal(discovery.contributors[0].login, 'known-contributor');
  await assert.rejects(f.service.claimWork(b, work(discovery)), {code: 'PROJECT_DISCOVERY_STALE'});
  await assert.rejects(f.service.claimWork(a, {...work(discovery), discoveryId: undefined}), {code: 'PROJECT_DISCOVERY_REQUIRED'});
  f.advance(600001); await assert.rejects(f.service.verifyDiscovery(a, {gameId: 'synthetic', discoveryId: discovery.discoveryId}), {code: 'PROJECT_DISCOVERY_STALE'});
});
test('unconfigured repository permits discovered local source tools and returns honest branch blocker', async () => {
  const f = await fixture({configured: false}), discovery = await f.service.discoverProject(a, {gameId: 'synthetic'});
  assert.equal(discovery.state, 'setup_required'); assert.equal(discovery.head, null); assert.equal((await f.service.verifyDiscovery(a, {gameId: 'synthetic', discoveryId: discovery.discoveryId})).githubConfigured, false);
  await assert.rejects(f.service.claimWork(a, work(discovery)), {code: 'GITHUB_NOT_CONFIGURED'}); assert.equal(f.git.calls.length, 0);
});
test('two contributors racing for a small canonical feature see existing work and can join without a whole-game lock', async () => {
  const f = await fixture(), [da, db] = await Promise.all([f.service.discoverProject(a, {gameId: 'synthetic'}), f.service.discoverProject(b, {gameId: 'synthetic'})]);
  const results = await Promise.all([f.service.claimWork(a, work(da)), f.service.claimWork(b, work(db))]);
  assert.deepEqual(results.map(result => result.status).sort(), ['already_claimed', 'claimed']);
  const loser = results[0].status === 'already_claimed' ? a : b, discovery = loser === a ? da : db;
  const joined = await f.service.joinWork(loser, {...work(discovery), expectedRevision: 1}); assert.equal(joined.status, 'joined'); assert.equal(joined.workItem.collaborators.length, 1); assert.equal(joined.github.assignmentVerified, false);
  assert.equal(f.git.calls.some(call => ['createBranch', 'createIssue'].includes(call.name)), false);
  await assert.rejects(f.service.claimWork(a, {...work(da), featureKey: 'whole-game'}), {code: 'WORK_ITEM_TARGET_INVALID'});
});
test('canonical issue reread blocks stale closed or differently labelled game work', async () => {
  const f = await fixture(), discovery = await f.service.discoverProject(a, {gameId: 'synthetic'});
  f.git.issues[0].labels = ['game:other']; await assert.rejects(f.service.claimWork(a, work(discovery)), {code: 'CANONICAL_ISSUE_REQUIRED'});
  f.git.issues[0].labels = ['game:synthetic']; f.git.issues[0].state = 'closed'; await assert.rejects(f.service.claimWork(a, work(discovery)), {code: 'CANONICAL_ISSUE_REQUIRED'});
});
test('two joined contributors get independent pinned branches and private source stays owner-isolated', async () => {
  const f = await fixture(), wa = await branchFor(f, a), wb = await branchFor(f, b);
  assert.notEqual(wa.branch, wb.branch); assert.equal(wa.baseCommit, wb.baseCommit); assert.equal(wa.repository.id, '71234'); assert.equal(wa.packageRoots[0], root);
  const own = await f.service.readBranchWorkspace(a, {gameId: 'synthetic', workspaceId: wa.id}); assert.equal(own.files[path('connector.mjs')], files[path('connector.mjs')]); assert.equal(Object.hasOwn(own.files, path('fixture.save')), false);
  assert.match(own.sourceBinding.sourceDigest, /^[a-f0-9]{64}$/); assert.equal(own.sourceBinding.treeSha, wa.treeSha);
  await assert.rejects(f.service.readBranchWorkspace(b, {gameId: 'synthetic', workspaceId: wa.id}), {code: 'BRANCH_WORKSPACE_NOT_FOUND'});
  await assert.rejects(f.service.patchBranchWorkspace(a, {...target(wa), changes: [{path: '.github/workflows/ci.yml', content: 'bad'}]}), {code: 'PROJECT_PATH_FORBIDDEN'});
  await assert.rejects(f.service.dispatch(a, 'branch_workspace_patch', {...target(wa), author: 'forged', changes: []}), {code: 'COLLABORATION_ACTION_INVALID'});
});
test('private source autosave uses revision and exact head CAS without publishing keystrokes', async () => {
  const f = await fixture(), original = await branchFor(f), before = f.git.calls.length;
  const concurrent = await Promise.allSettled([edit(f, a, original, 'connector.mjs', 'one'), edit(f, a, original, 'connector.mjs', 'two')]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1); assert.equal(concurrent.find(result => result.status === 'rejected').reason.code, 'COLLABORATION_REVISION_CONFLICT'); assert.equal(f.git.calls.length, before);
  const current = (await f.service.readBranchWorkspace(a, {gameId: 'synthetic', workspaceId: original.id})).workspace;
  await assert.rejects(f.service.patchBranchWorkspace(a, {...target(current), expectedGitHead: '0'.repeat(40), changes: []}), {code: 'BRANCH_WORKSPACE_CONFLICT'});
});
test('explicit reviewed checkpoint preserves verified author and original excluded fixture with no merge or Xbox authority', async () => {
  const f = await fixture(), edited = await edit(f, a, await branchFor(f)), result = await checkpoint(f, a, edited);
  assert.equal(result.workspace.dirty, false); assert.equal(result.validationRequired, true); assert.notEqual(result.workspace.gitHead, result.workspace.baseCommit);
  const committed = f.git.commits.get(result.workspace.gitHead); assert.equal(committed.author, a.id); assert.equal(committed.files[path('fixture.save')], files[path('fixture.save')]);
  assert.equal(f.git.calls.find(call => call.name === 'checkpoint').input.expectedHead, edited.gitHead);
  assert.equal(typeof f.service.publishXbox, 'undefined'); assert.equal(typeof f.service.merge, 'undefined');
  const reviewed = await f.service.preparePullRequest(a, target(result.workspace)); const opened = await f.service.openPullRequest(a, {...target(result.workspace), reviewId: reviewed.review.id});
  assert.equal(opened.pullRequest.draft, true); const request = f.git.calls.find(call => call.name === 'openDraftPR').input; assert.equal(request.body.includes('fixture.save'), false); assert.equal(request.body.includes('Public source\n'), false); assert.equal(request.body.includes('No private fixtures'), true);
});
test('external writes and absent trusted review fail explicitly rather than pretending GitHub success', async () => {
  const disabled = await fixture({external: false}), discovery = await disabled.service.discoverProject(a, {gameId: 'synthetic'}), claimed = await disabled.service.claimWork(a, work(discovery));
  await assert.rejects(disabled.service.prepareBranchWorkspace(a, {...work(discovery), expectedRevision: claimed.workItem.revision, expectedGitHead: discovery.head.sha}), {code: 'GITHUB_MUTATIONS_DISABLED'});
  assert.equal(disabled.git.calls.some(call => call.name === 'createBranch'), false);
  const noReview = await fixture({review: false}), workspace = await edit(noReview, a, await branchFor(noReview)); await assert.rejects(noReview.service.prepareCheckpoint(a, target(workspace)), {code: 'SOURCE_REVIEW_REQUIRED'});
});
test('membership revocation and re-enrollment invalidate prepared source review while own source export remains available', async () => {
  const f = await fixture(), workspace = await edit(f, a, await branchFor(f)), review = await f.service.prepareCheckpoint(a, target(workspace));
  await f.access.optOut(a, {gameId: 'synthetic', expectedRevision: 1});
  await assert.rejects(f.service.checkpoint(a, {...target(workspace), reviewId: review.review.id}), {code: 'GAME_ENROLLMENT_REQUIRED'});
  const exported = await f.service.readBranchWorkspace(a, {gameId: 'synthetic', workspaceId: workspace.id}); assert.equal(exported.files[path('connector.mjs')], 'export const schema = 2;\n');
  await f.access.enroll(a, {gameId: 'synthetic', expectedRevision: 2}); await assert.rejects(f.service.checkpoint(a, {...target(workspace), reviewId: review.review.id}), {code: 'SOURCE_REVIEW_STALE'});
  assert.equal(f.git.calls.some(call => call.name === 'checkpoint'), false);
});
test('remote branch edits expose three-way conflict with local source retained; independent file edits reconcile with evidence invalidated', async () => {
  const f = await fixture(), workspace = await edit(f, a, await branchFor(f), 'connector.mjs', 'local');
  f.git.externalCommit(workspace.branch, [{path: path('connector.mjs'), content: 'remote'}], b.id);
  const conflict = await f.service.updateFromUpstream(a, target(workspace)); assert.equal(conflict.state, 'conflict'); assert.equal(conflict.localPreserved, true); assert.deepEqual(conflict.conflicts, [{path: path('connector.mjs'), base: files[path('connector.mjs')], local: 'local', remote: 'remote'}]);
  assert.equal((await f.service.readBranchWorkspace(a, {gameId: 'synthetic', workspaceId: workspace.id})).files[path('connector.mjs')], 'local');
  const clean = await branchFor(f, b), local = await edit(f, b, clean, 'connector.mjs', 'own'), pushed = f.git.externalCommit(clean.branch, [{path: path('README.md'), content: 'external-readme'}], 'local-contributor');
  const updated = await f.service.updateFromUpstream(b, target(local)); assert.equal(updated.state, 'updated'); assert.equal(updated.workspace.gitHead, pushed); assert.equal(updated.validationRequired, true);
  const source = await f.service.readBranchWorkspace(b, {gameId: 'synthetic', workspaceId: clean.id}); assert.equal(source.files[path('connector.mjs')], 'own'); assert.equal(source.files[path('README.md')], 'external-readme');
  const result = await checkpoint(f, b, updated.workspace); assert.equal(f.git.commits.get(result.workspace.gitHead).parent, pushed); assert.equal(f.git.commits.get(pushed).author, 'local-contributor');
});
test('moving main requires a normal Git merge and never silently rewrites contributor history or player candidates', async () => {
  const f = await fixture(), workspace = await branchFor(f), original = f.git.branches.get(workspace.branch), upstream = f.git.externalCommit('main', [{path: path('README.md'), content: 'upstream'}]);
  const result = await f.service.updateFromUpstream(a, target(workspace)); assert.equal(result.state, 'upstream_merge_required'); assert.equal(result.upstreamHead, upstream); assert.equal(f.git.branches.get(workspace.branch), original); assert.equal(result.localPreserved, true);
});
test('GitHub outage yields stale discovery and an uncertain accepted checkpoint is reconciled without retrying the write', async () => {
  const f = await fixture(), workspace = await edit(f, a, await branchFor(f)), review = await f.service.prepareCheckpoint(a, target(workspace));
  const originalCheckpoint = f.git.checkpoint; f.git.checkpoint = async ctx => {await originalCheckpoint(ctx); fail('GITHUB_MUTATION_OUTCOME_UNKNOWN', 'Lost response', 502);};
  await assert.rejects(f.service.checkpoint(a, {...target(workspace), reviewId: review.review.id}), {code: 'GITHUB_MUTATION_OUTCOME_UNKNOWN'});
  const pending = (await f.service.statusBranchWorkspace(a, {gameId: 'synthetic', workspaceId: workspace.id})).workspace; assert.equal(pending.syncState, 'needs_reconciliation');
  await assert.rejects(edit(f, a, pending), {code: 'BRANCH_WORKSPACE_BUSY'});
  const result = await f.service.reconcileBranchWorkspace(a, target(pending)); assert.equal(result.state, 'updated'); assert.equal(result.workspace.dirty, false); assert.equal(result.workspace.operation, null); assert.equal(f.git.calls.filter(call => call.name === 'checkpoint').length, 1);
  f.git.setUnavailable(true); const discovery = await f.service.discoverProject(a, {gameId: 'synthetic'}); assert.equal(discovery.state, 'stale'); assert.equal(discovery.discoveryId, null);
});
test('source changes after review invalidate the prepared action and review input cannot impersonate a maintainer', async () => {
  const f = await fixture(), workspace = await edit(f, a, await branchFor(f)), review = await f.service.prepareCheckpoint(a, target(workspace)), changed = await edit(f, a, workspace, 'README.md', 'newer');
  await assert.rejects(f.service.checkpoint(a, {...target(changed), reviewId: review.review.id}), {code: 'SOURCE_REVIEW_STALE'});
  await assert.rejects(f.service.dispatch(a, 'pr_open', {...target(changed), reviewId: review.review.id, approved: true}), {code: 'COLLABORATION_ACTION_INVALID'});
});
test('private feature proposals require discovery and explicit reviewed submission before a canonical GitHub issue exists', async () => {
  const f = await fixture(), discovery = await f.service.discoverProject(a, {gameId: 'synthetic'});
  const proposed = await f.service.proposeWork(a, {gameId: 'synthetic', discoveryId: discovery.discoveryId, expectedRevision: 0, featureKey: 'pets.nickname', title: 'Add pet nickname UI', summary: 'A small public source feature.'});
  assert.equal(proposed.proposal.state, 'private_proposal'); assert.equal(f.git.issues.length, 1);
  const submitted = await f.service.submitProposal(a, {gameId: 'synthetic', discoveryId: discovery.discoveryId, proposalId: proposed.proposal.id, expectedRevision: proposed.proposal.revision}); assert.equal(submitted.issue.number, 8); assert.equal(submitted.proposal.state, 'submitted'); assert.deepEqual(f.git.issues[1].labels, ['game:synthetic']);
});

test('revocation during trusted author lookup prevents the pending checkpoint from dispatching', async () => {
  const f = await fixture(), workspace = await edit(f, a, await branchFor(f)), review = await f.service.prepareCheckpoint(a, target(workspace)), original = f.git.getVerifiedAuthor;
  f.git.getVerifiedAuthor = async actor => {const author = await original(actor); await f.access.optOut(actor, {gameId: 'synthetic', expectedRevision: 1}); return author;};
  await assert.rejects(f.service.checkpoint(a, {...target(workspace), reviewId: review.review.id}), {code: 'GAME_GRANT_REVOKED'});
  assert.equal(f.git.calls.filter(call => call.name === 'checkpoint').length, 0);
  assert.equal((await f.service.statusBranchWorkspace(a, {gameId: 'synthetic', workspaceId: workspace.id})).workspace.operation, null);
});

test('reconciliation cannot unlock a live Git operation or an unknown unchanged-head commit', async () => {
  const f = await fixture(), workspace = await edit(f, a, await branchFor(f)), review = await f.service.prepareCheckpoint(a, target(workspace));
  let entered, finish;
  const dispatched = new Promise(resolve => {entered = resolve;}), gate = new Promise(resolve => {finish = resolve;});
  f.git.checkpoint = async () => {entered(); await gate; fail('GITHUB_MUTATION_OUTCOME_UNKNOWN', 'No response', 502);};
  const pendingWrite = f.service.checkpoint(a, {...target(workspace), reviewId: review.review.id});
  await dispatched;
  const live = (await f.service.statusBranchWorkspace(a, {gameId: 'synthetic', workspaceId: workspace.id})).workspace;
  assert.equal(live.operation.state, 'pending');
  await assert.rejects(f.service.reconcileBranchWorkspace(a, target(live)), {code: 'BRANCH_WORKSPACE_BUSY'});
  finish(); await assert.rejects(pendingWrite, {code: 'GITHUB_MUTATION_OUTCOME_UNKNOWN'});
  const uncertain = (await f.service.statusBranchWorkspace(a, {gameId: 'synthetic', workspaceId: workspace.id})).workspace, unchanged = await f.service.reconcileBranchWorkspace(a, target(uncertain));
  assert.equal(unchanged.state, 'needs_reconciliation'); assert.equal(unchanged.workspace.operation.state, 'needs_reconciliation');
  assert.equal(unchanged.workspace.revision, uncertain.revision); assert.equal((await f.service.readBranchWorkspace(a, {gameId: 'synthetic', workspaceId: workspace.id})).files[path('connector.mjs')], 'export const schema = 2;\n');
});

test('repeated branch creation reuses one actor-feature reservation and per-game branch quota is enforced', async () => {
  const f = await fixture(), workspace = await branchFor(f), discovery = await f.service.discoverProject(a, {gameId: 'synthetic'});
  const reused = await f.service.prepareBranchWorkspace(a, {...work(discovery), expectedRevision: 1, expectedGitHead: discovery.head.sha});
  assert.equal(reused.reused, true); assert.equal(reused.workspace.id, workspace.id); assert.equal(f.git.calls.filter(call => call.name === 'createBranch').length, 1);
  const restricted = createCollaborationService({store: f.store, access: f.access, git: f.git, externalMutationsEnabled: true, maxBranchWorkspaces: 1});
  const selected = await restricted.discoverProject(a, {gameId: 'synthetic'}), claimed = await restricted.claimWork(a, {...work(selected), featureKey: 'pets.nickname'});
  await assert.rejects(restricted.prepareBranchWorkspace(a, {...work(selected), featureKey: 'pets.nickname', expectedRevision: claimed.workItem.revision, expectedGitHead: selected.head.sha}), {code: 'BRANCH_WORKSPACE_QUOTA'});
  assert.equal(f.git.calls.filter(call => call.name === 'createBranch').length, 1);
});

test('claim intent reaches canonical GitHub only through explicit reviewed publication with verified identity', async () => {
  const f = await fixture(), discovery = await f.service.discoverProject(a, {gameId: 'synthetic'}), claimed = await f.service.claimWork(a, work(discovery)), input = {...work(discovery), expectedRevision: claimed.workItem.revision};
  assert.equal(f.git.comments.length, 0);
  const reviewed = await f.service.prepareWorkPublication(a, input); assert.match(reviewed.publicRecord.body, /@contributor-a claims feature `companions.rename`/); assert.equal(reviewed.publicRecord.body.includes('fixture.save'), false);
  const published = await f.service.publishWork(a, {...input, reviewId: reviewed.review.id}); assert.equal(published.publication.state, 'published'); assert.equal(published.publication.assignmentVerified, false); assert.equal(f.git.comments.length, 1);
  assert.equal((await f.service.publishWork(a, {...input, reviewId: reviewed.review.id})).existing, true); assert.equal(f.git.comments.length, 1);
  assert.equal((await f.service.discoverProject(a, {gameId: 'synthetic'})).workItems[0].github.projection, 'published');
  const otherView = await f.service.discoverProject(b, {gameId: 'synthetic'}); assert.equal(otherView.workItems[0].github.projection, 'published'); assert.equal(otherView.workItems[0].github.url, published.publication.comment.url); assert.equal(otherView.contributors.some(person => person.login === a.id), true);
});

test('unknown coordination publication is not retried and untrusted copied markers cannot satisfy reconciliation', async () => {
  const f = await fixture(), discovery = await f.service.discoverProject(a, {gameId: 'synthetic'}), claimed = await f.service.claimWork(a, work(discovery)), input = {...work(discovery), expectedRevision: claimed.workItem.revision}, reviewed = await f.service.prepareWorkPublication(a, input);
  let attempted = 0;
  f.git.createIssueComment = async () => {attempted++; fail('GITHUB_MUTATION_OUTCOME_UNKNOWN', 'Lost response', 502);};
  await assert.rejects(f.service.publishWork(a, {...input, reviewId: reviewed.review.id}), {code: 'GITHUB_MUTATION_OUTCOME_UNKNOWN'});
  await assert.rejects(f.service.publishWork(a, {...input, reviewId: reviewed.review.id}), {code: 'WORK_PUBLICATION_OUTCOME_UNKNOWN'});
  const otherDiscovery = await f.service.discoverProject(b, {gameId: 'synthetic'}), joined = await f.service.joinWork(b, {...work(otherDiscovery), expectedRevision: 1}), latestInput = {...input, expectedRevision: joined.workItem.revision};
  f.git.comments.push({id: 999, body: reviewed.publicRecord.body, url: 'https://github.com/saverift-test/ecosystem/issues/7#issuecomment-999', serviceAuthored: false});
  assert.equal((await f.service.reconcileWorkPublication(a, latestInput)).publication.state, 'needs_reconciliation');
  f.git.comments.push({id: 1000, body: reviewed.publicRecord.body, url: 'https://github.com/saverift-test/ecosystem/issues/7#issuecomment-1000', serviceAuthored: true});
  assert.equal((await f.service.reconcileWorkPublication(a, latestInput)).publication.state, 'published'); assert.equal(attempted, 1);
});

test('own licensed source export survives removal of a hosted game project without granting new hosted or cross-owner access', async () => {
  const f = await fixture(), workspace = await edit(f, a, await branchFor(f));
  const removedAccess = createGameAccess({store: f.store, projects: [{...project, id: 'other', packageId: 'example.other', packageRoots: ['ecosystem/plugins/other/']}]});
  const service = createCollaborationService({store: f.store, access: removedAccess, git: f.git});
  const exported = await service.readBranchWorkspace(a, {gameId: 'synthetic', workspaceId: workspace.id}); assert.equal(exported.files[path('connector.mjs')], 'export const schema = 2;\n');
  await assert.rejects(service.readBranchWorkspace(b, {gameId: 'synthetic', workspaceId: workspace.id}), {code: 'BRANCH_WORKSPACE_NOT_FOUND'});
  await assert.rejects(service.patchBranchWorkspace(a, {...target(workspace), changes: []}), {code: 'GAME_PROJECT_NOT_FOUND'});
});

export {fakeGit, fixture, branchFor, target};
