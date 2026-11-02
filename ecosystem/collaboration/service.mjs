// SPDX-License-Identifier: Apache-2.0
// Trusted collaboration coordinator. It has no Xbox transport, release, merge,
// registry-promotion, fixture or credential-entry capability.
import {randomUUID} from 'node:crypto';
import {sha256, fail} from '../workbench/storage.mjs';
import {accessDigest, developerKey} from './authorization.mjs';
import {createWorkItemStore, isWorkItemParticipant, workItemActorKey} from './work-items.mjs';
import {assertAllowedSourcePath, validateSourceFiles, sourceDigest, applySourceChanges, diffSourceFiles, threeWaySourceMerge, publicBranchWorkspace} from './git-workspaces.mjs';
import {COLLABORATION_ACTION_ARGUMENTS} from './tool-definitions.mjs';

export const BRANCH_WORKSPACE_SCHEMA = 'saverift.branch-workspace.v1';
const DISCOVERY_MS = 10 * 60000, REVIEW_MS = 10 * 60000;
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const identifier = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[a-f0-9]{32}$`).test(value);
const uid = prefix => `${prefix}_${randomUUID().replaceAll('-', '')}`;
const copy = value => structuredClone(value);
const feature = value => typeof value === 'string' && value.length >= 3 && value.length <= 120 && /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(value) && !['all', 'game', 'whole-game', 'entire-game'].includes(value);
const publicText = (value, max, multiline = false) => typeof value === 'string' && value.trim() && value.length <= max && !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value) && !/(?:Bearer\s+[a-z0-9._-]+|(?:password|access_token|refresh_token|session_token|client_secret)\s*[:=]|-----BEGIN [^-]*PRIVATE KEY-----)/i.test(value);
const repoFor = project => project.repository && {...project.repository, allowedRoots: project.packageRoots, packageRoots: project.packageRoots, branchPrefix: project.branchPrefix};
const digestProject = project => project.projectDigest || accessDigest(project);
const sourceBaseRef = project => project.baseRef || project.repository.defaultBranch;
const safeError = error => ({code: /^[A-Z0-9_]{1,100}$/.test(error?.code || '') ? error.code : 'GITHUB_UNAVAILABLE'});
const currentIssue = (issue, project) => issue && Number.isSafeInteger(issue.number) && issue.number > 0 && issue.state === 'open' && Array.isArray(issue.labels) && issue.labels.includes(project.issueLabel);
const publicIssue = issue => ({id: issue.id, number: issue.number, title: String(issue.title || '').slice(0, 500), state: issue.state, labels: issue.labels || [], assignees: (issue.assignees || []).map(a => ({id: a.id, login: a.login})), htmlUrl: issue.htmlUrl, updatedAt: issue.updatedAt});
const publicPR = pr => ({number: pr.number, title: String(pr.title || 'Draft contribution #' + pr.number).slice(0, 500), url: pr.url || pr.htmlUrl, state: pr.state, draft: pr.draft === true, headSha: pr.headSha, baseSha: pr.baseSha, headRef: pr.headRef, baseRef: pr.baseRef});
const locksFor = files => Object.fromEntries(Object.entries(files).filter(([path]) => /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|requirements\.lock)$/.test(path)).map(([path, content]) => [path, sha256(content)]));
const invalidEvidence = record => ({state: 'needs_run', sourceDigest: sourceDigest(record.files), commitSha: record.gitHead, treeSha: record.treeSha, dependencyLockDigests: locksFor(record.files), runnerVersion: null, fixtureReferences: [], reason: 'Source changes require exact-source validation; no game or merge verification is implied.'});

export function createCollaborationService({store, access, git = null, now = Date.now, externalMutationsEnabled = false, reviewSource = null, maxBranchWorkspaces = 24} = {}) {
  if (!store?.get || !store?.put || !store?.list || !access?.getProject || !access?.assertAccess || !access?.captureGrant || !access?.assertGrant || typeof now !== 'function' || !Number.isSafeInteger(maxBranchWorkspaces) || maxBranchWorkspaces < 1 || maxBranchWorkspaces > 64) throw Error('Collaboration requires a conditional private store, trusted game-access service and bounded workspace quota.');
  const items = createWorkItemStore({store, now});
  const stamp = () => {const at = now(); if (!Number.isSafeInteger(at) || at < 0) fail('COLLABORATION_CLOCK_INVALID', 'The collaboration clock is unavailable.', 503); return at;};
  const projectFor = gameId => access.getProject(gameId);
  const discoveryKey = (actor, project) => `collaboration/discovery/${sha256(project.id)}/${developerKey(actor)}`;
  const snapshotKey = project => `collaboration/snapshots/${sha256(project.id)}`;
  const workspaceKey = (actor, gameId, id) => `collaboration/branches/${sha256(gameId)}/${developerKey(actor)}/${id}`;
  const proposalKey = (actor, gameId, id) => `collaboration/proposals/${sha256(gameId)}/${developerKey(actor)}/${id}`;
  const reviewKey = (actor, id) => `collaboration/reviews/${developerKey(actor)}/${id}`;
  const branchLedgerKey = (actor, gameId) => `collaboration/branch-ledgers/${sha256(gameId)}/${developerKey(actor)}`;
  const workProjectionKey = (actor, gameId, workId) => `collaboration/work-projections/${sha256(gameId)}/${developerKey(actor)}/${workId}`;
  async function permitted(actor, gameId, action) { await access.assertAccess(actor, {gameId, action}); const grant = await access.captureGrant(actor, gameId); await access.assertGrant(actor, grant); return grant; }
  function configured(project) {if (!project.repository || !git) fail('GITHUB_NOT_CONFIGURED', 'This game has no approved ecosystem repository and GitHub App connection. Source tools remain available.', 503); return repoFor(project);}
  function external() {if (!externalMutationsEnabled) fail('GITHUB_MUTATIONS_DISABLED', 'GitHub writes are disabled until the owner approves the configured ecosystem destination.', 403);}
  const context = (actor, project, grant) => ({actor, grant, repository: configured(project)});
  async function save(key, value, row) {try {return await store.put(key, value, row ? {ifMatch: row.etag} : {ifAbsent: true});} catch (error) {if (error.code === 'REVISION_CONFLICT') fail('COLLABORATION_REVISION_CONFLICT', 'This source or coordination record changed. Refresh and compare before retrying.', 409); throw error;}}
  async function putLatest(key, value) { const prior = await store.get(key); return save(key, value, prior); }
  async function assertCurrent(actor, grant) {await access.assertGrant(actor, grant);}
  async function projectPublicCoordination(ctx, project, workItems, issues) {
    if (typeof git.listIssueComments !== 'function') return [];
    const numbers = [...new Set(workItems.map(item => item.issueNumber))].filter(number => issues.some(issue => issue.number === number)).slice(0, 16);
    const lists = new Map(await Promise.all(numbers.map(async number => [number, await git.listIssueComments({...ctx, number})]))), contributors = [];
    for (const item of workItems) {
      const list = lists.get(item.issueNumber); if (!list) continue;
      const records = [];
      for (const comment of list.comments) {
        if (comment.serviceAuthored !== true || typeof comment.body !== 'string') continue;
        const marker = /^<!-- saverift-work-intent:(work_[a-f0-9]{32}):([1-9][0-9]{0,15}):([a-f0-9]{16}) -->\n/.exec(comment.body);
        const intent = /\n@([A-Za-z0-9][A-Za-z0-9-]{0,38}) (claims|joins|releases) feature `([a-z0-9.-]+)` for game `([a-z0-9._-]+)`\.\n/.exec(comment.body);
        if (!marker || marker[1] !== item.id || !Number.isSafeInteger(Number(marker[2])) || !intent || intent[3] !== item.featureKey || intent[4] !== project.id) continue;
        records.push({id: comment.id, url: comment.url, login: intent[1], kind: {claims: 'claim', joins: 'join', releases: 'release'}[intent[2]], workRevision: Number(marker[2]), actorKeyPrefix: marker[3]});
        contributors.push({id: null, login: intent[1], source: 'app_verified_public_intent'});
      }
      const currentPublished = records.some(record => record.workRevision === item.revision || item.state === 'active' && record.kind === 'claim' && item.claimant?.startsWith(record.actorKeyPrefix));
      if (records.length) item.github = {authority: 'github', projection: currentPublished ? 'published' : 'stale', assignmentVerified: false, url: records.at(-1).url, records, checkedAt: stamp(), commentsTruncated: list.hasMore === true};
      else item.github = {authority: 'github', projection: 'pending', assignmentVerified: false, commentsTruncated: list.hasMore === true};
    }
    return contributors;
  }
  async function readPackageSource(ctx, commit, project) {
    const tree = await git.readTree({...ctx, commit});
    if (tree.commitSha !== commit || tree.truncated !== false || !sha(tree.treeSha) || !Array.isArray(tree.entries)) fail('GITHUB_SOURCE_BINDING_INVALID', 'A complete pinned source tree is required.', 409);
    const paths = [], excluded = [];
    for (const entry of tree.entries) {
      if (!project.packageRoots.some(root => typeof entry.path === 'string' && entry.path.startsWith(root))) continue;
      if (entry.type === 'tree' && entry.mode === '040000') continue;
      if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode) || !sha(entry.sha)) fail('GITHUB_UNSAFE_TREE_ENTRY', 'Symlinks and submodules are not accepted in contributor package roots.', 409);
      try {assertAllowedSourcePath(project, entry.path); paths.push(entry.path);}
      catch (error) {if (!['SOURCE_PATH_FORBIDDEN', 'PROJECT_PATH_FORBIDDEN'].includes(error.code)) throw error; excluded.push({path: entry.path, sha: entry.sha});}
    }
    const source = await git.readSource({...ctx, commit, paths});
    if (source.commitSha !== commit || source.treeSha !== tree.treeSha || Object.keys(source.files || {}).length !== paths.length || paths.some(path => !Object.hasOwn(source.files || {}, path))) fail('GITHUB_SOURCE_BINDING_INVALID', 'The returned editable source does not match the pinned tree.', 409);
    return {...source, files: validateSourceFiles(source.files, project), excluded};
  }
  function projection(workItem) {return {authority: 'github', assignmentVerified: false, state: 'private_intent', workItemId: workItem.id, revision: workItem.revision};}

  async function discoverProject(actor, {gameId} = {}) {
    const project = projectFor(gameId); developerKey(actor); await access.assertAccess(actor, {gameId, action: 'discovery'});
    const workItems = await items.list(gameId);
    for (const item of workItems) {const published = await store.get(workProjectionKey(actor, gameId, item.id)); if (published?.value.state === 'published' && published.value.workRevision === item.revision) item.github = {authority: 'github', projection: 'published', assignmentVerified: false, url: published.value.comment.url};}
    const base = {gameId, project: copy(project), capabilities: copy(project.capabilities || []), maintainers: copy(project.maintainers || []), workItems, contributors: [], issues: [], draftPullRequests: []};
    let snapshot;
    if (!project.repository || !git) snapshot = {...base, state: 'setup_required', github: {state: 'not_configured', canonical: false}, head: null, checkedAt: stamp(), projectDigest: digestProject(project)};
    else {
      const ctx = context(actor, project, null);
      try {
        const [repo, head, issueList, prList] = await Promise.all([git.getRepository(ctx), git.readHead({...ctx, branch: sourceBaseRef(project)}), git.listIssues({...ctx, issueLabel: project.issueLabel}), git.listDraftPRs(ctx)]);
        if (String(repo.id) !== String(project.repository.id) || repo.owner.toLowerCase() !== project.repository.owner.toLowerCase() || repo.name.toLowerCase() !== project.repository.name.toLowerCase() || repo.defaultBranch !== project.repository.defaultBranch || !sha(head.sha) || !sha(head.treeSha)) fail('GITHUB_REPOSITORY_MAPPING_STALE', 'The canonical repository or head no longer matches the approved project.', 409);
        const issues = issueList.issues.filter(issue => currentIssue(issue, project)).map(publicIssue);
        const publicContributors = await projectPublicCoordination(ctx, project, workItems, issues);
        const contributors = [...new Map([...issues.flatMap(issue => issue.assignees), ...publicContributors].map(person => [person.login.toLowerCase(), person])).values()];
        const prs = prList.pullRequests.filter(pr => pr.draft === true && typeof pr.headRef === 'string' && (pr.headRef.startsWith(project.branchPrefix) || pr.headRef === sourceBaseRef(project))).map(publicPR);
        snapshot = {...base, repository: repo, contributors, issues, draftPullRequests: prs, head, checkedAt: stamp(), projectDigest: digestProject(project), state: 'current', github: {state: 'connected', canonical: true, issuesTruncated: issueList.hasMore === true, pullRequestsTruncated: prList.hasMore === true}};
        // A cache is a projection only. Webhooks never edit this from event data.
        try {await putLatest(snapshotKey(project), snapshot);} catch (error) {if (error.code !== 'COLLABORATION_REVISION_CONFLICT') throw error;} // Two live readers may race a disposable cache.
      } catch (error) {
        const prior = await store.get(snapshotKey(project));
        return {...base, ...(prior?.value.projectDigest === digestProject(project) ? copy(prior.value) : {}), state: 'stale', github: {state: 'unavailable', canonical: false, error: safeError(error)}, discoveryId: null, discoveryExpiresAt: null, workItems: await items.list(gameId)};
      }
    }
    const token = {id: uid('discovery'), actor: developerKey(actor), gameId, projectDigest: digestProject(project), head: snapshot.head?.sha || null, snapshotDigest: accessDigest({head: snapshot.head, issues: snapshot.issues, prs: snapshot.draftPullRequests}), createdAt: stamp(), expiresAt: stamp() + DISCOVERY_MS};
    await putLatest(discoveryKey(actor, project), token);
    return {...snapshot, discoveryId: token.id, discoveryExpiresAt: token.expiresAt};
  }

  async function verifyDiscovery(actor, {gameId, discoveryId} = {}) {
    const project = projectFor(gameId); developerKey(actor);
    if (!identifier(discoveryId, 'discovery')) fail('PROJECT_DISCOVERY_REQUIRED', 'Review this game’s existing capabilities, issues, contributors and draft PRs first.', 409);
    const row = await store.get(discoveryKey(actor, project)), value = row?.value;
    if (!value || value.id !== discoveryId || value.actor !== developerKey(actor) || value.gameId !== gameId || value.projectDigest !== digestProject(project) || value.expiresAt <= stamp()) fail('PROJECT_DISCOVERY_STALE', 'The project overview changed or expired. Refresh existing work before creating a feature.', 409);
    return {gameId, projectDigest: value.projectDigest, discoveryId: value.id, head: value.head, expiresAt: value.expiresAt, githubConfigured: Boolean(project.repository && git)};
  }

  async function issueContext(actor, input, action) {
    const project = projectFor(input.gameId), grant = await permitted(actor, project.id, action);
    const discovery = await verifyDiscovery(actor, input); const ctx = context(actor, project, grant);
    if (!Number.isSafeInteger(input.issueNumber) || input.issueNumber < 1 || !feature(input.featureKey)) fail('WORK_ITEM_TARGET_INVALID', 'Select an open game issue and a small named feature.');
    const issue = await git.getIssue({...ctx, number: input.issueNumber}); await assertCurrent(actor, grant);
    if (!currentIssue(issue, project) || issue.number !== input.issueNumber) fail('CANONICAL_ISSUE_REQUIRED', 'Choose an open issue bearing this game’s trusted label.', 409);
    return {project, grant, discovery, ctx, issue};
  }
  async function changeWork(actor, input, method) {
    const selected = await issueContext(actor, input, method === 'join' ? 'join' : 'claim');
    await assertCurrent(actor, selected.grant);
    const result = await items[method](actor, input);
    // Coordination intent is private until explicitly projected to GitHub. It
    // does not claim that a GitHub assignment has been made atomically.
    return {...result, canonicalIssue: publicIssue(selected.issue), github: projection(result.workItem)};
  }

  async function publicationContext(actor, input) {
    const state = await issueContext(actor, input, 'claim'), workItem = await items.read(input);
    if (!workItem || workItem.revision !== input.expectedRevision) fail('WORK_ITEM_REVISION_CONFLICT', 'Review the current work intent before publishing it.', 409);
    const key = workProjectionKey(actor, state.project.id, workItem.id), row = await store.get(key), actorKey = workItemActorKey(actor, state.project.id);
    const kind = workItem.state === 'active' && workItem.claimant === actorKey ? 'claim' : workItem.state === 'active' && workItem.collaborators.includes(actorKey) ? 'join' : workItem.state === 'released' && ['claim', 'release'].includes(row?.value.kind) ? 'release' : null;
    if (!kind) fail('WORK_PUBLICATION_FORBIDDEN', 'Publish only your own claim, join or previously published claim release.', 403);
    if (row?.value.state === 'pending') fail('WORK_PUBLICATION_BUSY', 'The original GitHub coordination request is still active.', 409);
    return {...state, workItem, key, row, actorKey, kind};
  }
  const publicationView = value => ({state: value.state, workItemId: value.workItemId, workRevision: value.workRevision, kind: value.kind, assignmentVerified: false, comment: value.comment || null, error: value.error || null});
  async function prepareWorkPublication(actor, input) {
    const state = await publicationContext(actor, input);
    if (state.row?.value.state === 'needs_reconciliation') fail('WORK_PUBLICATION_OUTCOME_UNKNOWN', 'Reconcile the earlier coordination comment before preparing another.', 409);
    if (state.row?.value.state === 'published' && state.row.value.workRevision === state.workItem.revision) return {publication: publicationView(state.row.value), existing: true};
    const author = await git.getVerifiedAuthor(actor);
    if (author?.verified !== true || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(author.login || '')) fail('GITHUB_AUTHOR_NOT_VERIFIED', 'A verified GitHub contributor identity is required.', 403);
    const marker = `<!-- saverift-work-intent:${state.workItem.id}:${state.workItem.revision}:${state.actorKey.slice(0, 16)} -->`;
    const verb = {claim: 'claims', join: 'joins', release: 'releases'}[state.kind];
    const body = `${marker}\nSaveRift contribution intent\n\n@${author.login} ${verb} feature \`${state.workItem.featureKey}\` for game \`${state.project.id}\`.\n\nRelated issue: #${state.issue.number}\nWork item: \`${state.workItem.id}\` · revision \`${state.workItem.revision}\`\n\nThis records contribution intent. GitHub assignees, maintainer review, registry promotion and Xbox publication retain separate authority.`;
    const digest = sha256(body);
    const reviewed = typeof reviewSource === 'function' && await reviewSource({actor, gameId: state.project.id, kind: 'work_publication', publicRecord: {body, issueNumber: state.issue.number}, sourceDigest: digest});
    if (reviewed?.approved !== true || reviewed.sourceDigest !== digest) fail('SOURCE_REVIEW_REQUIRED', 'A trusted review of this exact public coordination record is required.', 403);
    await assertCurrent(actor, state.grant);
    const review = {id: uid('review'), kind: 'work_publication', actor: developerKey(actor), gameId: state.project.id, projectDigest: digestProject(state.project), grantDigest: accessDigest(state.grant), workItemId: state.workItem.id, workRevision: state.workItem.revision, featureKey: state.workItem.featureKey, issueNumber: state.issue.number, publicationKind: state.kind, publicAuthorId: String(author.githubUserId), publicAuthorLogin: author.login, marker, body, bodyDigest: digest, state: 'prepared', expiresAt: stamp() + REVIEW_MS};
    await save(reviewKey(actor, review.id), review, null);
    return {review: {id: review.id, kind: review.kind, expiresAt: review.expiresAt, revision: review.workRevision, sourceDigest: digest}, publicRecord: {body, issueNumber: state.issue.number, target: state.issue.htmlUrl}, workItem: state.workItem};
  }
  async function publishWork(actor, input) {
    const state = await publicationContext(actor, input); external();
    if (state.row?.value.state === 'published' && state.row.value.workRevision === state.workItem.revision) return {publication: publicationView(state.row.value), existing: true};
    if (state.row?.value.state === 'needs_reconciliation') fail('WORK_PUBLICATION_OUTCOME_UNKNOWN', 'Reconcile the earlier coordination comment; do not retry its write.', 409);
    if (!identifier(input.reviewId, 'review')) fail('SOURCE_REVIEW_REQUIRED', 'Review the public coordination comment first.', 409);
    const reviewKeyValue = reviewKey(actor, input.reviewId), reviewRow = await store.get(reviewKeyValue), review = reviewRow?.value;
    if (!review || review.kind !== 'work_publication' || review.state !== 'prepared' || review.actor !== developerKey(actor) || review.gameId !== state.project.id || review.projectDigest !== digestProject(state.project) || review.grantDigest !== accessDigest(state.grant) || review.workItemId !== state.workItem.id || review.workRevision !== state.workItem.revision || review.expiresAt <= stamp() || review.bodyDigest !== sha256(review.body)) fail('SOURCE_REVIEW_STALE', 'The work intent, identity or review changed. Prepare it again.', 409);
    const author = await git.getVerifiedAuthor(actor);
    if (author.verified !== true || String(author.githubUserId) !== review.publicAuthorId || author.login !== review.publicAuthorLogin) fail('GITHUB_AUTHOR_MISMATCH', 'The verified public identity changed after review.', 409);
    await assertCurrent(actor, state.grant);
    const pending = {id: uid('publication'), actor: developerKey(actor), actorKey: state.actorKey, gameId: state.project.id, workItemId: state.workItem.id, workRevision: state.workItem.revision, issueNumber: state.issue.number, kind: state.kind, state: 'pending', marker: review.marker, bodyDigest: review.bodyDigest, reviewId: review.id, comment: null, createdAt: stamp()};
    const locked = await save(state.key, pending, state.row);
    try {
      await save(reviewKeyValue, {...review, state: 'executing'}, reviewRow); await assertCurrent(actor, state.grant);
      const comment = await git.createIssueComment({...state.ctx, number: state.issue.number, body: review.body});
      if (String(comment.id || '') === '' || sha256(comment.body || '') !== review.bodyDigest || typeof comment.url !== 'string' || !comment.url.startsWith('https://github.com/')) fail('GITHUB_MUTATION_OUTCOME_UNKNOWN', 'GitHub did not return the exact coordination comment.', 502);
      await assertCurrent(actor, state.grant);
      const done = await save(state.key, {...pending, state: 'published', comment: {id: comment.id, url: comment.url}, updatedAt: stamp()}, locked);
      return {publication: publicationView(done.value), canonicalIssue: publicIssue(state.issue)};
    } catch (error) {await save(state.key, {...pending, state: 'needs_reconciliation', error: safeError(error), updatedAt: stamp()}, locked); throw error;}
  }
  async function reconcileWorkPublication(actor, input) {
    const state = await publicationContext(actor, input), value = state.row?.value;
    if (!value) return {publication: {state: 'not_published', assignmentVerified: false}};
    if (value.state === 'published') return {publication: publicationView(value)};
    const listed = await git.listIssueComments({...state.ctx, number: value.issueNumber}), matches = listed.comments.filter(comment => comment.serviceAuthored === true && typeof comment.body === 'string' && comment.body.startsWith(value.marker) && sha256(comment.body) === value.bodyDigest);
    await assertCurrent(actor, state.grant);
    if (matches.length !== 1) return {publication: publicationView(value), message: 'The exact app-authored coordination comment is not uniquely confirmed. Its write remains locked.'};
    const comment = matches[0], row = await save(state.key, {...value, state: 'published', comment: {id: comment.id, url: comment.url}, updatedAt: stamp()}, state.row);
    return {publication: publicationView(row.value)};
  }

  async function proposeWork(actor, input) {
    const project = projectFor(input.gameId), grant = await permitted(actor, project.id, 'propose');
    await verifyDiscovery(actor, input);
    if (input.expectedRevision !== 0 || !feature(input.featureKey) || !publicText(input.title, 200) || !publicText(input.summary, 5000, true)) fail('ISSUE_PROPOSAL_INVALID', 'Propose a small feature using a bounded public title and summary. Never include private saves, credentials or logs.');
    await assertCurrent(actor, grant);
    const proposal = {id: uid('proposal'), gameId: project.id, projectDigest: digestProject(project), owner: developerKey(actor), title: input.title.trim(), summary: input.summary.trim(), featureKey: input.featureKey, revision: 1, state: 'private_proposal', createdAt: stamp(), updatedAt: stamp()};
    await save(proposalKey(actor, project.id, proposal.id), proposal, null);
    const {owner, ...view} = proposal; return {proposal: view};
  }

  async function submitProposal(actor, input) {
    const project = projectFor(input.gameId), grant = await permitted(actor, project.id, 'propose');
    await verifyDiscovery(actor, input); const ctx = context(actor, project, grant); external();
    if (!identifier(input.proposalId, 'proposal')) fail('ISSUE_PROPOSAL_NOT_FOUND', 'This private proposal was not found.', 404);
    const key = proposalKey(actor, project.id, input.proposalId), row = await store.get(key), proposal = row?.value;
    if (!proposal || proposal.owner !== developerKey(actor) || proposal.projectDigest !== digestProject(project)) fail('ISSUE_PROPOSAL_NOT_FOUND', 'This private proposal was not found.', 404);
    if (proposal.revision !== input.expectedRevision || proposal.state !== 'private_proposal') fail('COLLABORATION_REVISION_CONFLICT', 'Review the current proposal before submission.', 409);
    const proposalDigest = accessDigest([proposal.title, proposal.summary]), proposalReview = typeof reviewSource === 'function' && await reviewSource({actor, gameId: project.id, kind: 'issue', title: proposal.title, summary: proposal.summary, sourceDigest: proposalDigest});
    if (proposalReview?.approved !== true || proposalReview.sourceDigest !== proposalDigest) fail('SOURCE_REVIEW_REQUIRED', 'A trusted public-source review is required before exporting this proposal.', 403);
    await assertCurrent(actor, grant);
    const locked = await save(key, {...proposal, revision: proposal.revision + 1, state: 'submitting', updatedAt: stamp()}, row);
    try {
      const issue = await git.createIssue({...ctx, title: proposal.title, body: proposal.summary + '\n\nFeature: `' + proposal.featureKey + '`', issueLabel: project.issueLabel});
      await assertCurrent(actor, grant);
      const done = await save(key, {...locked.value, revision: locked.value.revision + 1, state: 'submitted', issue: publicIssue(issue), updatedAt: stamp()}, locked);
      const {owner, ...view} = done.value; return {proposal: view, issue: publicIssue(issue)};
    } catch (error) { await save(key, {...locked.value, revision: locked.value.revision + 1, state: 'needs_reconciliation', error: safeError(error), updatedAt: stamp()}, locked); throw error; }
  }

  function expected(record, input, {allowOperation = false} = {}) {
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== record.revision || !sha(input.expectedGitHead) || input.expectedGitHead !== record.gitHead) fail('BRANCH_WORKSPACE_CONFLICT', 'The source revision or Git head changed. Compare the current source before retrying.', 409);
    if (record.revision >= Number.MAX_SAFE_INTEGER - 2) fail('BRANCH_WORKSPACE_REVISION_EXHAUSTED', 'This source workspace needs a fresh branch.', 409);
    if (record.operation && !allowOperation) fail('BRANCH_WORKSPACE_BUSY', 'A Git operation is pending. Reconcile its outcome before another mutation.', 409);
  }
  async function load(actor, input, {write = false, action = 'source.write'} = {}) {
    developerKey(actor);
    if (typeof input.gameId !== 'string' || !/^[a-z][a-z0-9._-]{0,79}$/.test(input.gameId)) fail('GAME_PROJECT_NOT_FOUND', 'This game project is unavailable.', 404);
    let project;
    try {project = projectFor(input.gameId);} catch (error) {if (write || error.code !== 'GAME_PROJECT_NOT_FOUND') throw error; project = null;}
    let grant = null;
    if (write) grant = await permitted(actor, project.id, action);
    else if (project) await access.assertAccess(actor, {gameId: project.id, action: 'source.export'});
    if (!identifier(input.workspaceId, 'bws')) fail('BRANCH_WORKSPACE_NOT_FOUND', 'This private source workspace was not found.', 404);
    const key = workspaceKey(actor, input.gameId, input.workspaceId), row = await store.get(key), record = row?.value;
    if (!record || record.schema !== BRANCH_WORKSPACE_SCHEMA || record.owner !== developerKey(actor) || record.gameId !== input.gameId || record.id !== input.workspaceId) fail('BRANCH_WORKSPACE_NOT_FOUND', 'This private source workspace was not found.', 404);
    if (write && record.projectDigest !== digestProject(project)) fail('PROJECT_MAPPING_CHANGED', 'The trusted repository/package mapping changed. Export your source and prepare a new pinned workspace.', 409);
    if (!sha(record.gitHead) || !sha(record.baseCommit) || !sha(record.treeSha) || !Number.isSafeInteger(record.revision) || record.revision < 1) fail('BRANCH_WORKSPACE_INVALID', 'This source binding could not be verified.', 409);
    // On opt-out/config change, only this owner’s already stored source can be
    // exported; never follow a stored URL or grant fixture access.
    return {project, grant, key, row, record};
  }
  function binding(record) {return {schema: 'saverift.source-binding.v1', branchWorkspaceId: record.id, gameId: record.gameId, repositoryId: String(record.repository.id), repository: copy(record.repository), packageId: record.packageId, packageRoots: copy(record.packageRoots), projectDigest: record.projectDigest, branch: record.branch, baseRef: record.baseRef || sourceBaseRef(projectFor(record.gameId)), baseCommit: record.baseCommit, gitHead: record.gitHead, treeSha: record.treeSha, sourceRevision: record.revision, sourceDigest: sourceDigest(record.files), dependencyLockDigests: locksFor(record.files), issueNumber: record.issueNumber};}
  async function readBranchWorkspace(actor, input) {const {record} = await load(actor, input); return {workspace: publicBranchWorkspace(record), files: copy(record.files), sourceDigest: sourceDigest(record.files), sourceBinding: binding(record)};}
  async function statusBranchWorkspace(actor, input) {const {record} = await load(actor, input); return {workspace: publicBranchWorkspace(record), sourceBinding: binding(record)};}
  async function previewChanges(actor, input) {const {record} = await load(actor, input); return {workspace: publicBranchWorkspace(record), diff: diffSourceFiles(record.baseFiles, record.files), contributionDiff: diffSourceFiles(record.originFiles, record.files), sourceBinding: binding(record)};}

  async function prepareBranchWorkspace(actor, input) {
    const {project, grant, discovery, ctx, issue} = await issueContext(actor, input, 'workspace.create'); external();
    const workItem = await items.read(input);
    if (!workItem || input.expectedRevision !== workItem.revision || !isWorkItemParticipant(actor, workItem)) fail('WORK_PARTICIPATION_REQUIRED', 'Claim or join this exact small feature at its current revision before creating a branch.', 409);
    if (!sha(input.expectedGitHead) || input.expectedGitHead !== discovery.head) fail('GITHUB_HEAD_CHANGED', 'Refresh the project overview before branching from its current head.', 409);
    const ledgerKey = branchLedgerKey(actor, project.id), ledgerRow = await store.get(ledgerKey), ledger = ledgerRow?.value || {owner: developerKey(actor), gameId: project.id, intents: {}}, intentKey = accessDigest([digestProject(project), input.issueNumber, input.featureKey]);
    if (ledger.owner !== developerKey(actor) || ledger.gameId !== project.id || !ledger.intents || typeof ledger.intents !== 'object' || Array.isArray(ledger.intents) || Object.keys(ledger.intents).length > maxBranchWorkspaces) fail('BRANCH_LEDGER_INVALID', 'The branch reservation ledger could not be verified.', 409);
    if (Object.hasOwn(ledger.intents, intentKey)) {
      const existingId = ledger.intents[intentKey], existing = await store.get(workspaceKey(actor, project.id, existingId));
      if (!existing?.value || existing.value.owner !== developerKey(actor) || existing.value.projectDigest !== digestProject(project)) fail('BRANCH_WORKSPACE_CREATION_PENDING', 'This feature already has a reserved branch workspace. Wait for its recorded creation outcome rather than creating another branch.', 409);
      await assertCurrent(actor, grant);
      return {workspace: publicBranchWorkspace(existing.value), sourceBinding: binding(existing.value), reused: true};
    }
    if (Object.keys(ledger.intents).length >= maxBranchWorkspaces) fail('BRANCH_WORKSPACE_QUOTA', 'This developer has reached the per-game branch-workspace limit. Continue an existing feature or request maintainer help.', 429);
    const head = await git.readHead({...ctx, branch: sourceBaseRef(project)});
    if (head.sha !== input.expectedGitHead) fail('GITHUB_HEAD_CHANGED', 'The upstream base changed. Refresh existing work before branching.', 409);
    const source = await readPackageSource(ctx, head.sha, project);
    if (source.commitSha !== head.sha || source.treeSha !== head.treeSha) fail('GITHUB_SOURCE_BINDING_INVALID', 'The returned source tree does not match the pinned base.', 409);
    const files = validateSourceFiles(source.files, project); const author = await git.getVerifiedAuthor(actor);
    if (author?.verified !== true) fail('GITHUB_AUTHOR_NOT_VERIFIED', 'Link and verify your GitHub identity before creating a contributor branch.', 403);
    await assertCurrent(actor, grant);
    const id = uid('bws'), branch = project.branchPrefix + workItemActorKey(actor, project.id).slice(0, 12) + '/issue-' + issue.number + '-' + sha256(input.featureKey).slice(0, 10) + '-' + id.slice(-8);
    // One reservation per actor/issue/feature makes repeated create requests
    // idempotent, and a CAS ledger bounds simultaneous different features.
    await save(ledgerKey, {...ledger, intents: {...ledger.intents, [intentKey]: id}}, ledgerRow);
    // Persist intent before the external write. An uncertain outcome is kept
    // for reconciliation, not automatically retried or deleted.
    let record = {schema: BRANCH_WORKSPACE_SCHEMA, id, owner: developerKey(actor), gameId: project.id, projectDigest: digestProject(project), packageId: project.packageId, packageRoots: copy(project.packageRoots), repository: copy(project.repository), issueNumber: issue.number, featureKey: input.featureKey, branch, baseRef: sourceBaseRef(project), baseCommit: head.sha, gitHead: head.sha, treeSha: head.treeSha, lastSynchronizedCommit: head.sha, revision: 1, files, baseFiles: copy(files), originFiles: copy(files), excludedSourceEntries: source.excluded, dirty: false, syncState: 'creating_branch', operation: {id: uid('operation'), kind: 'branch_create', state: 'pending', expectedHead: head.sha}, createdAt: stamp(), updatedAt: stamp()};
    record.evidenceState = invalidEvidence(record);
    const key = workspaceKey(actor, project.id, id); let row = await save(key, record, null);
    try {
      const result = await git.createBranch({...ctx, branch, expectedBaseSha: head.sha, base: sourceBaseRef(project)});
      if (result.headSha !== head.sha || result.branch !== branch || result.created !== true) fail('GITHUB_MUTATION_OUTCOME_UNKNOWN', 'The created branch could not be verified.', 502);
      await assertCurrent(actor, grant);
      record = {...record, revision: 2, operation: null, syncState: 'current', updatedAt: stamp()}; row = await save(key, record, row);
      return {workspace: publicBranchWorkspace(row.value), sourceBinding: binding(row.value)};
    } catch (error) {
      await save(key, {...record, revision: 2, operation: {...record.operation, state: 'needs_reconciliation', error: safeError(error)}, syncState: 'needs_reconciliation', updatedAt: stamp()}, row);
      error.workspaceId = id; throw error;
    }
  }

  async function patchBranchWorkspace(actor, input) {
    const state = await load(actor, input, {write: true}); expected(state.record, input);
    const files = applySourceChanges(state.record.files, input.changes, state.project);
    await assertCurrent(actor, state.grant);
    const record = {...state.record, files, revision: state.record.revision + 1, dirty: diffSourceFiles(state.record.baseFiles, files).length > 0, syncState: 'unchecked', updatedAt: stamp()}; record.evidenceState = invalidEvidence(record);
    const row = await save(state.key, record, state.row);
    return {workspace: publicBranchWorkspace(row.value), sourceBinding: binding(row.value)};
  }

  async function checkedHead(actor, state) {
    const ctx = context(actor, state.project, state.grant), head = await git.readHead({...ctx, branch: state.record.branch});
    await assertCurrent(actor, state.grant);
    if (head.sha !== state.record.gitHead) fail('GITHUB_HEAD_CHANGED', 'Another contributor changed this branch. Update from upstream to compare all three versions.', 409);
    return {ctx, head};
  }
  async function verifyBranchHead(actor, input) {
    const state = await load(actor, input, {write: true, action: 'git.read'});
    expected(state.record, input);
    const {head} = await checkedHead(actor, state);
    return {workspace: publicBranchWorkspace(state.record), sourceBinding: binding(state.record), head: {sha: head.sha, treeSha: head.treeSha}};
  }
  async function prepareReview(actor, input, kind) {
    const state = await load(actor, input, {write: true, action: kind === 'pull_request' ? 'pr.create' : 'git.write'}); expected(state.record, input);
    await checkedHead(actor, state);
    if (kind === 'pull_request' && (state.record.dirty || state.record.gitHead === state.record.baseCommit)) fail('CHECKPOINT_REQUIRED', 'Checkpoint the intended source changes before preparing a draft PR.', 409);
    const diff = diffSourceFiles(kind === 'pull_request' ? state.record.originFiles : state.record.baseFiles, state.record.files);
    if (!diff.length) fail('SOURCE_CHANGES_REQUIRED', 'There are no source changes to submit.', 409);
    const digest = sourceDigest(state.record.files);
    if (typeof reviewSource !== 'function') fail('SOURCE_REVIEW_REQUIRED', 'Configure the trusted public-source review before committing or opening a PR.', 403);
    const reviewResult = await reviewSource({actor, gameId: state.project.id, project: copy(state.project), kind, files: copy(state.record.files), diff: copy(diff), sourceDigest: digest});
    if (reviewResult?.approved !== true || reviewResult.sourceDigest !== digest) fail('SOURCE_REVIEW_REQUIRED', 'The intended source has not passed the trusted export review.', 403);
    await assertCurrent(actor, state.grant);
    const id = uid('review'), review = {id, kind, actor: developerKey(actor), workspaceId: state.record.id, gameId: state.project.id, projectDigest: digestProject(state.project), grantDigest: accessDigest(state.grant), revision: state.record.revision, gitHead: state.record.gitHead, sourceDigest: digest, diffDigest: accessDigest(diff), expiresAt: stamp() + REVIEW_MS, state: 'prepared', policyDigest: reviewResult.policyDigest || null};
    await save(reviewKey(actor, id), review, null);
    const {actor: _, grantDigest: __, ...view} = review; return {review: view, workspace: publicBranchWorkspace(state.record), diff, sourceBinding: binding(state.record)};
  }
  async function validateReview(actor, input, state, kind) {
    if (!identifier(input.reviewId, 'review')) fail('SOURCE_REVIEW_REQUIRED', 'Prepare and review this exact source action first.', 409);
    const key = reviewKey(actor, input.reviewId), row = await store.get(key), review = row?.value;
    const diff = diffSourceFiles(kind === 'pull_request' ? state.record.originFiles : state.record.baseFiles, state.record.files);
    if (!review || review.actor !== developerKey(actor) || review.workspaceId !== state.record.id || review.kind !== kind || review.gameId !== state.project.id || review.projectDigest !== digestProject(state.project) || review.grantDigest !== accessDigest(state.grant) || review.state !== 'prepared' || review.expiresAt <= stamp() || review.revision !== state.record.revision || review.gitHead !== state.record.gitHead || review.sourceDigest !== sourceDigest(state.record.files) || review.diffDigest !== accessDigest(diff)) fail('SOURCE_REVIEW_STALE', 'Source, membership, head or review changed. Prepare the action again.', 409);
    return {key, row, review, diff};
  }
  async function beginOperation(actor, input, state, reviewState, kind) {
    await assertCurrent(actor, state.grant);
    const operation = {id: uid('operation'), kind, reviewId: reviewState.review.id, state: 'pending', expectedHead: state.record.gitHead, sourceDigest: sourceDigest(state.record.files), startedAt: stamp()};
    // CAS source first: autosave cannot slip between review validation and Git.
    const row = await save(state.key, {...state.record, revision: state.record.revision + 1, operation, updatedAt: stamp()}, state.row);
    try {await save(reviewState.key, {...reviewState.review, state: 'executing'}, reviewState.row);} catch (error) {await save(state.key, {...row.value, revision: row.value.revision + 1, operation: null, updatedAt: stamp()}, row); throw error;}
    return row;
  }
  async function outcomeUnknown(state, row, error) {
    await save(state.key, {...row.value, revision: row.value.revision + 1, syncState: 'needs_reconciliation', operation: {...row.value.operation, state: 'needs_reconciliation', error: safeError(error)}, updatedAt: stamp()}, row);
  }
  async function checkpoint(actor, input) {
    const state = await load(actor, input, {write: true, action: 'git.write'}); expected(state.record, input); external();
    const reviewState = await validateReview(actor, input, state, 'checkpoint'), {ctx} = await checkedHead(actor, state);
    const author = await git.getVerifiedAuthor(actor); if (author?.verified !== true) fail('GITHUB_AUTHOR_NOT_VERIFIED', 'A currently verified GitHub identity is required.', 403);
    let row = await beginOperation(actor, input, state, reviewState, 'checkpoint');
    try {
      await assertCurrent(actor, state.grant);
      const result = await git.checkpoint({...ctx, branch: state.record.branch, expectedHead: state.record.gitHead, changes: reviewState.diff.map(({path, after}) => ({path, content: after})), verifiedAuthor: author, message: `Update ${state.project.displayName}: ${state.record.featureKey} (#${state.record.issueNumber})`});
      if (!sha(result.headSha) || !sha(result.treeSha) || result.commitSha !== result.headSha) fail('GITHUB_MUTATION_OUTCOME_UNKNOWN', 'The Git commit result could not be verified.', 502);
      await assertCurrent(actor, state.grant);
      const next = {...row.value, revision: row.value.revision + 1, gitHead: result.headSha, treeSha: result.treeSha, lastSynchronizedCommit: result.headSha, baseFiles: copy(state.record.files), dirty: false, operation: null, syncState: 'current', updatedAt: stamp(), attribution: result.attribution || 'verified-user-author; app-mediated-commit'}; next.evidenceState = invalidEvidence(next);
      row = await save(state.key, next, row);
      return {workspace: publicBranchWorkspace(row.value), sourceBinding: binding(row.value), commit: {sha: result.headSha, treeSha: result.treeSha, attribution: next.attribution}, validationRequired: true};
    } catch (error) {await outcomeUnknown(state, row, error); throw error;}
  }
  async function openPullRequest(actor, input) {
    const state = await load(actor, input, {write: true, action: 'pr.create'}); expected(state.record, input); external();
    const reviewState = await validateReview(actor, input, state, 'pull_request'), {ctx} = await checkedHead(actor, state);
    const issue = await git.getIssue({...ctx, number: state.record.issueNumber});
    if (!currentIssue(issue, state.project)) fail('CANONICAL_ISSUE_REQUIRED', 'The linked game issue must remain open before submission.', 409);
    let row = await beginOperation(actor, input, state, reviewState, 'pull_request');
    try {
      await assertCurrent(actor, state.grant);
      const title = `Update ${state.project.displayName}: ${state.record.featureKey}`;
      const body = `Related to #${state.record.issueNumber}\n\nSource commit: \`${state.record.gitHead}\`\nSource digest: \`${sourceDigest(state.record.files)}\`\n\nPublic package paths:\n${reviewState.diff.map(change => '- `' + change.path + '`').join('\n')}\n\nSubmitted through SaveRift. Maintainer review, registry promotion, game verification and Xbox publication remain separate gates. No private fixtures or hosted logs are included.`;
      const pr = await git.openDraftPR({...ctx, branch: state.record.branch, base: sourceBaseRef(state.project), expectedHead: state.record.gitHead, issueNumber: issue.number, title, body});
      if (pr.draft !== true || pr.headSha !== state.record.gitHead) fail('GITHUB_MUTATION_OUTCOME_UNKNOWN', 'The draft PR result does not match the reviewed source head.', 502);
      await assertCurrent(actor, state.grant);
      row = await save(state.key, {...row.value, revision: row.value.revision + 1, operation: null, pr: publicPR(pr), updatedAt: stamp()}, row);
      return {workspace: publicBranchWorkspace(row.value), pullRequest: publicPR(pr), sourceBinding: binding(row.value)};
    } catch (error) {await outcomeUnknown(state, row, error); throw error;}
  }

  async function updateFromUpstream(actor, input, {reconcile = false} = {}) {
    const state = await load(actor, input, {write: true, action: 'source:update'}); expected(state.record, input, {allowOperation: reconcile});
    if (state.record.operation?.state === 'pending') fail('BRANCH_WORKSPACE_BUSY', 'The original Git request is still active. Wait for its outcome before reconciliation.', 409);
    const ctx = context(actor, state.project, state.grant), [head, upstream] = await Promise.all([git.readHead({...ctx, branch: state.record.branch}), git.readHead({...ctx, branch: sourceBaseRef(state.project)})]);
    const source = await readPackageSource(ctx, head.sha, state.project);
    if (source.commitSha !== head.sha || source.treeSha !== head.treeSha) fail('GITHUB_SOURCE_BINDING_INVALID', 'The remote source no longer matches the branch head.', 409);
    const files = validateSourceFiles(source.files, state.project), merge = threeWaySourceMerge(state.record.baseFiles, state.record.files, files);
    await assertCurrent(actor, state.grant);
    if (state.record.operation?.kind === 'checkpoint' && head.sha === state.record.operation.expectedHead) return {state: 'needs_reconciliation', workspace: publicBranchWorkspace(state.record), remoteHead: head.sha, localPreserved: true, message: 'The remote head has not confirmed the uncertain commit. The write remains locked; no automatic retry is permitted.'};
    if (merge.conflicts.length) return {state: 'conflict', workspace: publicBranchWorkspace(state.record), remoteHead: head.sha, upstreamHead: upstream.sha, conflicts: merge.conflicts, diff: diffSourceFiles(state.record.baseFiles, files), localPreserved: true, validationRequired: true};
    // Reconcile commits pushed by a local contributor to this same branch. We
    // do not invent merge commits for a moving default branch, rebase someone
    // else’s commits, or attribute their code to the initiating contributor.
    if (head.sha === state.record.gitHead && !state.record.operation) return {state: upstream.sha === state.record.baseCommit ? 'current' : 'upstream_merge_required', workspace: publicBranchWorkspace(state.record), remoteHead: head.sha, upstreamHead: upstream.sha, localPreserved: true, validationRequired: upstream.sha !== state.record.baseCommit, message: upstream.sha === state.record.baseCommit ? 'No external branch changes.' : 'Merge or rebase the default branch through Git, then update this workspace to reconcile that contributor branch.'};
    let pr = state.record.pr;
    if (state.record.operation?.kind === 'pull_request') {
      const listed = await git.listDraftPRs(ctx), matches = listed.pullRequests.filter(item => item.headRef === state.record.branch && item.headSha === head.sha && item.draft === true);
      await assertCurrent(actor, state.grant);
      if (matches.length !== 1) return {state: 'needs_reconciliation', workspace: publicBranchWorkspace(state.record), localPreserved: true, message: 'The draft PR outcome is not yet uniquely confirmed by GitHub. Do not retry publication.'};
      pr = publicPR(matches[0]);
    }
    const record = {...state.record, revision: state.record.revision + 1, gitHead: head.sha, treeSha: head.treeSha, lastSynchronizedCommit: head.sha, files: merge.files, baseFiles: files, excludedSourceEntries: source.excluded, dirty: diffSourceFiles(files, merge.files).length > 0, syncState: 'current', operation: null, ...(pr ? {pr} : {}), updatedAt: stamp()}; record.evidenceState = invalidEvidence(record);
    const row = await save(state.key, record, state.row);
    return {state: 'updated', workspace: publicBranchWorkspace(row.value), sourceBinding: binding(row.value), remoteHead: head.sha, upstreamHead: upstream.sha, localPreserved: true, validationRequired: true};
  }

  async function dispatch(actor, action, args = {}) {
    const shape = COLLABORATION_ACTION_ARGUMENTS[action];
    if (!shape || !args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !Object.hasOwn(shape, key))) fail('COLLABORATION_ACTION_INVALID', 'Choose a supported bounded collaboration action.');
    return routes[action](actor, args);
  }
  const routes = {
    project_discover: discoverProject, project_reconcile: discoverProject, discovery_verify: verifyDiscovery,
    work_claim: (a, i) => changeWork(a, i, 'claim'), work_join: (a, i) => changeWork(a, i, 'join'), work_release: (a, i) => changeWork(a, i, 'release'),
    work_publish_prepare: prepareWorkPublication, work_publish: publishWork, work_publish_reconcile: reconcileWorkPublication,
    issue_propose: proposeWork, issue_submit: submitProposal,
    branch_workspace_create: prepareBranchWorkspace, branch_workspace_status: statusBranchWorkspace, branch_workspace_read: readBranchWorkspace, branch_workspace_export: readBranchWorkspace, branch_workspace_verify: verifyBranchHead,
    branch_workspace_patch: patchBranchWorkspace, branch_workspace_diff: previewChanges,
    checkpoint_prepare: (a, i) => prepareReview(a, i, 'checkpoint'), checkpoint_commit: checkpoint,
    workspace_update_upstream: updateFromUpstream, branch_workspace_reconcile: (a, i) => updateFromUpstream(a, i, {reconcile: true}), pr_prepare: (a, i) => prepareReview(a, i, 'pull_request'), pr_open: openPullRequest
  };
  return Object.freeze({dispatch, discoverProject, reconcileProject: discoverProject, verifyDiscovery, claimWork: routes.work_claim, joinWork: routes.work_join, releaseWork: routes.work_release, prepareWorkPublication, publishWork, reconcileWorkPublication, proposeWork, submitProposal, prepareBranchWorkspace, readBranchWorkspace, statusBranchWorkspace, patchBranchWorkspace, verifyBranchHead, previewChanges, prepareCheckpoint: routes.checkpoint_prepare, checkpoint, updateFromUpstream, reconcileBranchWorkspace: routes.branch_workspace_reconcile, preparePullRequest: routes.pr_prepare, openPullRequest});
}
