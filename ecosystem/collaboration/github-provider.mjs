// SPDX-License-Identifier: Apache-2.0
// Trusted backend adapter. This module exposes no token, generic URL or merge/release endpoint.
import { createHash } from "node:crypto";
const API = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
class GithubError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "GithubError";
    this.code = code;
    this.status = status;
  }
}
const githubFail = (code, message = "The GitHub operation stopped at its scoped verification gate.", status = 409) => {
  throw new GithubError(code, message, status);
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const sha = (value) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const id = (value) => Number.isSafeInteger(value) && value > 0 || typeof value === "string" && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
const sameId = (a, b) => id(a) && id(b) && String(a) === String(b);
const encode = (value) => encodeURIComponent(value);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => JSON.stringify(value, (_, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v);
const forbiddenSegment = /^(?:\.git(?:hub)?|\.env(?:\..*)?|node_modules|private|fixtures?|backups?|captures?|logs?|consents?|snapshots?|autosaves?|player[-_]?data|user[-_]?data|credentials?|tokens?|sessions?|cookies?)$/i;
function githubSourcePath(value) {
  if (typeof value !== "string" || !value || value.length > 240 || value !== value.normalize("NFC") || value.startsWith("/") || /[\\:%\u0000-\u001f\u007f]/u.test(value) || value.split("/").some((s) => !s || s === "." || s === ".." || forbiddenSegment.test(s)) || /(?:^|\/)(?:CODEOWNERS|save(?:game)?(?:\.json)?|lobby(?:\.json)?|MicrosoftGame\.config)$/i.test(value) || /\.(?:save|sav|dat|bin|parc|har|zip|gz|tgz|bz2|xz|7z|rar|tar|xvd|msixvc2?|msix|appx|exe|dll|so|dylib|wasm|class|pyc|o|a|pdf|docx?|xlsx?|pptx?|png|jpe?g|webp|gif|avif|ico|svg|bmp|tiff?|mp[34]|m4[av]|mov|webm|avi|wav|ogg|flac|woff2?|ttf|otf|eot|pem|key|p12|pfx)$/i.test(value)) githubFail("GITHUB_PATH_REJECTED");
  return value;
}
function branchName(value) {
  if (typeof value !== "string" || !value || value.length > 180 || /[\s\\:~^?*\[\x00-\x1f\x7f]/.test(value) || value.includes("..") || value.includes("@{") || value.split("/").some((s) => !s || s.startsWith(".") || s.endsWith(".") || s.endsWith(".lock"))) githubFail("GITHUB_BRANCH_REJECTED");
  return value;
}
const policyPath = (path) => /^(?:ecosystem\/(?:sdk|registry|workbench|collaboration)|packages\/(?:sdk|mcp)|registry)(?:\/|$)/i.test(path);
function roots(mapping) {
  const values = mapping.allowedRoots || mapping.packageRoots;
  if (!Array.isArray(values) || !values.length || values.length > 16) githubFail("GITHUB_MAPPING_INVALID");
  return values.map((root) => githubSourcePath(root.replace(/\/$/, "")));
}
function scopedPath(path, mapping) {
  githubSourcePath(path);
  if (policyPath(path) || !roots(mapping).some((root) => path === root || path.startsWith(root + "/"))) githubFail("GITHUB_PATH_SCOPE_DENIED");
  return path;
}
function managedBranch(branch, mapping) {
  branchName(branch);
  if (branch === mapping.defaultBranch || typeof mapping.branchPrefix !== "string" || !mapping.branchPrefix.endsWith("/") || !branch.startsWith(mapping.branchPrefix) || branch.length === mapping.branchPrefix.length) githubFail("GITHUB_BRANCH_SCOPE_DENIED");
  return branch;
}
function safeText(value, max, code) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000\u007f]/.test(value)) githubFail(code);
  return value;
}
function safeSource(value) {
  if (typeof value !== "string" || Buffer.byteLength(value) > 1024 * 1024 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(value)) !== value || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{16,}|\bXBL3\.0 x=/i.test(value)) githubFail("GITHUB_SOURCE_REJECTED", "Source is invalid, oversized or contains credential-like material.");
  return value;
}
function authorRecord(value) {
  if (!value || value.verified !== true || !id(value.githubUserId) || typeof value.login !== "string" || !/^[A-Za-z0-9-]{1,100}$/.test(value.login) || typeof value.name !== "string" || !value.name || value.name.length > 200 || /[\r\n\u0000]/.test(value.name) || typeof value.email !== "string" || value.email.length > 254 || !value.email.includes("@") || /[\s<>\u0000]/.test(value.email) || value.publicEmailConsent !== true) githubFail("GITHUB_AUTHOR_NOT_VERIFIED", "Choose a verified public commit identity before committing.");
  return { githubUserId: String(value.githubUserId), login: value.login, name: value.name, email: value.email, verified: true, publicEmailConsent: true };
}
function issue(value) {
  if (!value || !id(value.number) || !id(value.id)) githubFail("GITHUB_RESPONSE_INVALID");
  return { id: value.id, number: value.number, title: String(value.title || "").slice(0, 500), state: value.state, labels: (value.labels || []).map((x) => typeof x === "string" ? x : x.name).filter((x) => typeof x === "string"), assignees: (value.assignees || []).filter((x) => id(x.id) && typeof x.login === "string").map(({ id: id2, login }) => ({ id: id2, login })), htmlUrl: typeof value.html_url === "string" ? value.html_url : null, updatedAt: typeof value.updated_at === "string" ? value.updated_at : null };
}
function pull(value) {
  if (!value || !id(value.number) || !sha(value.head?.sha) || !sha(value.base?.sha)) githubFail("GITHUB_RESPONSE_INVALID");
  return { number: value.number, title: String(value.title || "").slice(0, 500), url: value.html_url, htmlUrl: value.html_url, state: value.state, draft: value.draft === true, headSha: value.head.sha, baseSha: value.base.sha, headRef: value.head.ref, baseRef: value.base.ref, updatedAt: typeof value.updated_at === "string" ? value.updated_at : null, mergeable: value.mergeable ?? null };
}
function issueComment(value, provenance = {}) {
  if (!id(value?.id) || !id(value.user?.id) || typeof value.user.login !== "string" || typeof value.body !== "string") githubFail("GITHUB_RESPONSE_INVALID");
  return { id: value.id, body: value.body.slice(0, 65536), serviceAuthored: !!(id(provenance.coordinationAppId) && sameId(value.performed_via_github_app?.id, provenance.coordinationAppId) || id(provenance.coordinationBotUserId) && value.user?.type === "Bot" && sameId(value.user.id, provenance.coordinationBotUserId)), url: typeof value.html_url === "string" ? value.html_url : null, author: { id: String(value.user.id), login: value.user.login } };
}
function createGithubProvider({ fetcher = globalThis.fetch, request, tokenBroker, authorize, resolveAuthor, allowedRepositories = [], committer, coordinationAppId, coordinationBotUserId, now = Date.now, maxResponseBytes = 2 * 1024 * 1024 } = {}) {
  fetcher = request || fetcher;
  if (typeof fetcher !== "function" || typeof authorize !== "function") throw Error("A fixed GitHub transport and trusted authorization callback are required.");
  const approved = /* @__PURE__ */ new Map();
  for (const mapping2 of allowedRepositories) {
    if (!id(mapping2.id) || typeof mapping2.owner !== "string" || !/^[A-Za-z0-9-]{1,100}$/.test(mapping2.owner) || typeof mapping2.name !== "string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(mapping2.name) || mapping2.name === "." || mapping2.name === ".." || typeof mapping2.branchPrefix !== "string" || !mapping2.branchPrefix.endsWith("/")) githubFail("GITHUB_MAPPING_INVALID");
    branchName(mapping2.defaultBranch);
    branchName(mapping2.branchPrefix.slice(0, -1));
    const normalized = { ...clone(mapping2), id: String(mapping2.id), allowedRoots: roots(mapping2).sort() }, key = String(mapping2.id), list = approved.get(key) || [];
    if (list.some((value) => value.branchPrefix === normalized.branchPrefix)) githubFail("GITHUB_MAPPING_INVALID");
    list.push(normalized);
    approved.set(key, list);
  }
  function mapping(context) {
    const supplied = context?.repository, list = approved.get(String(supplied?.id));
    if (!list) githubFail("GITHUB_REPOSITORY_UNAPPROVED");
    const suppliedRoots = roots(supplied).sort(), known = list.find((value) => value.owner === supplied.owner && value.name === supplied.name && value.branchPrefix === supplied.branchPrefix && stable(value.allowedRoots) === stable(suppliedRoots));
    if (!known) githubFail("GITHUB_REPOSITORY_UNAPPROVED");
    return known;
  }
  async function permission(context, action, phase, extra = {}) {
    const repository = mapping(context);
    if (await authorize({ ...context, repository, action, phase, ...extra }) !== true) githubFail("GITHUB_ACTOR_DENIED", "This game or repository action is not authorized.", 403);
    return repository;
  }
  async function responseJson(response) {
    const reader = response.body?.getReader(), chunks = [];
    let length = 0;
    if (!reader) return null;
    try {
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxResponseBytes) {
          await reader.cancel();
          githubFail("GITHUB_RESPONSE_LIMIT", "GitHub returned more metadata than this operation permits.", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const all = Buffer.concat(chunks);
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all));
    } catch {
      githubFail("GITHUB_RESPONSE_INVALID");
    }
  }
  async function call(context, action, method, suffix, { body, permissions = { contents: "read" }, extra = {} } = {}) {
    const repository = await permission(context, action, "before_request", extra), path = `/repos/${encode(repository.owner)}/${encode(repository.name)}${suffix}`;
    if (typeof suffix !== "string" || suffix !== "" && !suffix.startsWith("/") || suffix.includes("://") || suffix.includes("#")) githubFail("GITHUB_REQUEST_SCOPE_DENIED");
    if (!tokenBroker || typeof tokenBroker.run !== "function") githubFail("GITHUB_APP_NOT_CONFIGURED", "The selected ecosystem repository and GitHub App must be configured before this action.", 503);
    return tokenBroker.run({ repository, permissions, actor: context.actor, grant: context.grant }, async (token) => {
      await permission(context, action, "before_dispatch", extra);
      let response;
      try {
        response = await fetcher(API + path, { method, redirect: "manual", signal: AbortSignal.timeout(3e4), headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": GITHUB_API_VERSION, "User-Agent": "SaveRift-Collaboration", "Authorization": "Bearer " + token, ...body === void 0 ? {} : { "Content-Type": "application/json" } }, ...body === void 0 ? {} : { body: JSON.stringify(body) } });
      } catch {
        githubFail(method === "GET" ? "GITHUB_UNAVAILABLE" : "GITHUB_MUTATION_OUTCOME_UNKNOWN", "The GitHub request did not return a verifiable outcome.", 502);
      }
      if (response.redirected || response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        githubFail("GITHUB_REPOSITORY_MAPPING_STALE", "The repository moved or redirected. Verify its canonical mapping before retrying.");
      }
      if (!response.ok) {
        await response.body?.cancel();
        const code = method !== "GET" && (response.status >= 500 || response.status === 408) ? "GITHUB_MUTATION_OUTCOME_UNKNOWN" : response.status === 401 ? "GITHUB_AUTHORIZATION_EXPIRED" : response.status === 403 ? "GITHUB_PERMISSION_OR_RATE_LIMIT" : response.status === 409 || response.status === 422 ? "GITHUB_CONFLICT" : "GITHUB_REQUEST_FAILED";
        const error = new GithubError(code, "GitHub rejected the scoped operation.", response.status);
        const retry = response.headers.get("retry-after");
        if (retry && /^\d{1,8}$/.test(retry)) error.retryAfterSeconds = Number(retry);
        throw error;
      }
      let data;
      try {
        data = response.status === 204 ? null : await responseJson(response);
        await permission(context, action, "after_response", extra);
      } catch (error) {
        if (method !== "GET") githubFail("GITHUB_MUTATION_OUTCOME_UNKNOWN", "GitHub may have accepted this operation. Reconcile before any retry.", 502);
        throw error;
      }
      return data;
    });
  }
  const get = async (context, action, path, options = {}) => call(context, action, "GET", path, options);
  async function readHead(context) {
    const branch = branchName(context.branch || mapping(context).defaultBranch), ref = await get(context, "read_head", "/git/ref/heads/" + branch.split("/").map(encode).join("/"));
    if (!sha(ref?.object?.sha) || ref.object.type !== "commit") githubFail("GITHUB_RESPONSE_INVALID");
    const commit = await get(context, "read_head", "/git/commits/" + ref.object.sha);
    if (commit?.sha !== ref.object.sha || !sha(commit.tree?.sha)) githubFail("GITHUB_RESPONSE_INVALID");
    return { branch, sha: commit.sha, treeSha: commit.tree.sha };
  }
  async function readTree(context) {
    if (!sha(context.commit)) githubFail("GITHUB_COMMIT_INVALID");
    const commit = await get(context, "read_tree", "/git/commits/" + context.commit);
    if (commit?.sha !== context.commit || !sha(commit.tree?.sha)) githubFail("GITHUB_RESPONSE_INVALID");
    const value = await get(context, "read_tree", "/git/trees/" + commit.tree.sha + "?recursive=1");
    if (value?.sha !== commit.tree.sha) githubFail("GITHUB_RESPONSE_INVALID");
    if (value?.truncated || !Array.isArray(value?.tree) || value.tree.length > 1e4) githubFail("GITHUB_TREE_INCOMPLETE");
    if (value.tree.some((x) => typeof x?.path !== "string" || !sha(x.sha))) githubFail("GITHUB_RESPONSE_INVALID");
    const entries = value.tree.map((x) => ({ path: x.path, mode: x.mode, type: x.type, sha: x.sha, ...Number.isSafeInteger(x.size) ? { size: x.size } : {} }));
    return { commitSha: context.commit, treeSha: commit.tree.sha, entries, truncated: false };
  }
  function selectedEntries(tree, repository) {
    const entries = tree.entries.filter((entry) => roots(repository).some((root) => entry.path === root || entry.path.startsWith(root + "/"))), seen = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      if (typeof entry.path !== "string") githubFail("GITHUB_RESPONSE_INVALID");
      const lower = entry.path.toLowerCase();
      if (seen.has(lower)) githubFail("GITHUB_PATH_COLLISION");
      seen.add(lower);
      if (entry.type === "tree" && entry.mode === "040000") continue;
      if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode) || !sha(entry.sha)) githubFail("GITHUB_UNSAFE_TREE_ENTRY", "Symlinks and submodules are not supported in contributor roots.");
    }
    return entries;
  }
  async function readSource(context) {
    const repository = mapping(context), tree = await readTree(context), entries = selectedEntries(tree, repository).filter((x) => x.type === "blob"), paths = context.paths || entries.map((x) => x.path);
    if (!Array.isArray(paths) || paths.length > 256 || paths.some((x) => typeof x !== "string") || new Set(paths.map((x) => x.toLowerCase())).size !== paths.length) githubFail("GITHUB_SOURCE_LIMIT");
    const files = {};
    let bytes = 0;
    for (const path of paths) {
      scopedPath(path, repository);
      const entry = entries.find((x) => x.path === path);
      if (!entry || entry.size > 1024 * 1024) githubFail("GITHUB_SOURCE_UNAVAILABLE");
      const value = await get(context, "read_source", "/git/blobs/" + entry.sha);
      if (value?.sha !== entry.sha || value.encoding !== "base64" || typeof value.content !== "string") githubFail("GITHUB_RESPONSE_INVALID");
      const encoded = value.content.replaceAll("\n", "");
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) githubFail("GITHUB_RESPONSE_INVALID");
      const raw = Buffer.from(encoded, "base64");
      if (raw.toString("base64") !== encoded || createHash("sha1").update(Buffer.from("blob " + raw.byteLength + "\0")).update(raw).digest("hex") !== entry.sha || value.size !== raw.byteLength) githubFail("GITHUB_BLOB_MISMATCH");
      bytes += raw.byteLength;
      if (raw.length > 1024 * 1024 || bytes > 4 * 1024 * 1024) githubFail("GITHUB_SOURCE_LIMIT");
      try {
        Object.defineProperty(files, path, { value: safeSource(new TextDecoder("utf-8", { fatal: true }).decode(raw)), enumerable: true });
      } catch (error) {
        if (error.code) throw error;
        githubFail("GITHUB_SOURCE_NOT_TEXT");
      }
    }
    return { ...tree, files, sourceDigest: digest(stable(files)) };
  }
  async function verifiedAuthor(actor) {
    if (typeof resolveAuthor !== "function") githubFail("GITHUB_AUTHOR_NOT_VERIFIED");
    return authorRecord(await resolveAuthor(actor));
  }
  function changesFor(input, repository) {
    if (!Array.isArray(input) || !input.length || input.length > 128) githubFail("GITHUB_CHANGES_INVALID");
    const seen = /* @__PURE__ */ new Set();
    let bytes = 0;
    return input.map((change) => {
      if (!change || typeof change !== "object" || Array.isArray(change)) githubFail("GITHUB_CHANGES_INVALID");
      const path = scopedPath(change.path, repository), lower = path.toLowerCase();
      if (seen.has(lower) || [...seen].some((other) => other.startsWith(lower + "/") || lower.startsWith(other + "/"))) githubFail("GITHUB_PATH_COLLISION");
      seen.add(lower);
      if (change.content !== null) {
        safeSource(change.content);
        bytes += Buffer.byteLength(change.content);
      }
      if (bytes > 4 * 1024 * 1024) githubFail("GITHUB_SOURCE_LIMIT");
      return { path, content: change.content };
    });
  }
  async function createBranch(context) {
    const repository = mapping(context), branch = managedBranch(context.branch, repository);
    if (!sha(context.expectedBaseSha)) githubFail("GITHUB_COMMIT_INVALID");
    if (context.base && context.base !== repository.defaultBranch) githubFail("GITHUB_BASE_BRANCH_REJECTED");
    const base = await readHead({ ...context, branch: context.base || repository.defaultBranch });
    if (base.sha !== context.expectedBaseSha) githubFail("GITHUB_HEAD_CHANGED");
    const data = await call(context, "create_branch", "POST", "/git/refs", { body: { ref: "refs/heads/" + branch, sha: base.sha }, permissions: { contents: "write" }, extra: { branch, expectedHead: base.sha } });
    if (data?.object?.sha !== base.sha || data.ref !== "refs/heads/" + branch) githubFail("GITHUB_MUTATION_OUTCOME_UNKNOWN");
    return { branch, headSha: base.sha, created: true };
  }
  async function checkpoint(context) {
    const repository = mapping(context), branch = managedBranch(context.branch, repository), changes = changesFor(context.changes, repository);
    if (!sha(context.expectedHead)) githubFail("GITHUB_COMMIT_INVALID");
    await permission(context, "checkpoint", "before_author", { branch, paths: changes.map((x) => x.path) });
    const author = await verifiedAuthor(context.actor);
    if ((context.verifiedAuthor || context.author) && stable(author) !== stable(authorRecord(context.verifiedAuthor || context.author))) githubFail("GITHUB_AUTHOR_MISMATCH");
    const head = await readHead({ ...context, branch });
    if (head.sha !== context.expectedHead) githubFail("GITHUB_HEAD_CHANGED");
    const tree = await readTree({ ...context, commit: head.sha }), entries = selectedEntries(tree, repository), lookup = new Map(entries.map((x) => [x.path, x]));
    for (const change of changes) {
      const folded = entries.find((x) => x.path.toLowerCase() === change.path.toLowerCase());
      if (folded && (folded.path !== change.path || folded.type !== "blob") || entries.some((x) => x.type === "blob" && (change.path.startsWith(x.path + "/") || x.path.startsWith(change.path + "/"))) || entries.some((x) => x.path.toLowerCase().startsWith(change.path.toLowerCase() + "/") && !x.path.startsWith(change.path + "/"))) githubFail("GITHUB_PATH_COLLISION");
      for (const prefix of change.path.split("/").slice(0, -1).map((_, i) => change.path.split("/").slice(0, i + 1).join("/"))) {
        const dir = entries.find((x) => x.path.toLowerCase() === prefix.toLowerCase());
        if (dir && (dir.path !== prefix || dir.type !== "tree")) githubFail("GITHUB_PATH_COLLISION");
      }
      if (change.content === null && !lookup.has(change.path)) githubFail("GITHUB_DELETE_MISSING");
    }
    const extra = { branch, expectedHead: head.sha, paths: changes.map((x) => x.path) }, nextTree = await call(context, "checkpoint", "POST", "/git/trees", { body: { base_tree: head.treeSha, tree: changes.map((change) => ({ path: change.path, mode: lookup.get(change.path)?.mode || "100644", type: "blob", ...change.content === null ? { sha: null } : { content: change.content } })) }, permissions: { contents: "write" }, extra });
    if (!sha(nextTree?.sha)) githubFail("GITHUB_RESPONSE_INVALID");
    const date = new Date(now()).toISOString(), body = { message: safeText(context.message || "Update contributor source via SaveRift", 5e3, "GITHUB_MESSAGE_INVALID"), tree: nextTree.sha, parents: [head.sha], author: { name: author.name, email: author.email, date }, ...committer ? { committer: { name: committer.name, email: committer.email, date } } : {} };
    const commit = await call(context, "checkpoint", "POST", "/git/commits", { body, permissions: { contents: "write" }, extra });
    if (!sha(commit?.sha)) githubFail("GITHUB_RESPONSE_INVALID");
    const current = await readHead({ ...context, branch });
    if (current.sha !== head.sha) githubFail("GITHUB_HEAD_CHANGED");
    const ref = await call(context, "checkpoint", "PATCH", "/git/refs/heads/" + branch.split("/").map(encode).join("/"), { body: { sha: commit.sha, force: false }, permissions: { contents: "write" }, extra });
    if (ref?.object?.sha !== commit.sha) githubFail("GITHUB_MUTATION_OUTCOME_UNKNOWN");
    return { branch, commitSha: commit.sha, headSha: commit.sha, treeSha: nextTree.sha, sourceDigest: digest(stable(changes)), author: { githubUserId: author.githubUserId, login: author.login }, attribution: "verified-user-author; app-mediated-commit" };
  }
  function pageNumber(value) {
    if (value !== void 0 && (!Number.isSafeInteger(value) || value < 1 || value > 1e3)) githubFail("GITHUB_PAGE_INVALID");
    return value || 1;
  }
  async function listIssues(context) {
    const query = new URLSearchParams({ state: "all", per_page: "100", page: String(pageNumber(context.page)), ...context.issueLabel ? { labels: context.issueLabel } : {} }), data = await get(context, "list_issues", "/issues?" + query, { permissions: { issues: "read" } });
    if (!Array.isArray(data)) githubFail("GITHUB_RESPONSE_INVALID");
    return { issues: data.filter((x) => !x.pull_request).map(issue), hasMore: data.length === 100 };
  }
  async function getIssue(context) {
    if (!id(context.number)) githubFail("GITHUB_ISSUE_INVALID");
    return issue(await get(context, "read_issue", "/issues/" + context.number, { permissions: { issues: "read" } }));
  }
  async function listIssueComments(context) {
    if (!id(context.number)) githubFail("GITHUB_ISSUE_INVALID");
    const data = await get(context, "list_issue_comments", "/issues/" + context.number + "/comments?per_page=100&page=" + pageNumber(context.page), { permissions: { issues: "read" } });
    if (!Array.isArray(data)) githubFail("GITHUB_RESPONSE_INVALID");
    return { comments: data.map((value) => issueComment(value, { coordinationAppId, coordinationBotUserId })), hasMore: data.length === 100 };
  }
  async function createIssueComment(context) {
    if (!id(context.number)) githubFail("GITHUB_ISSUE_INVALID");
    const body = safeText(context.body, 65536, "GITHUB_BODY_INVALID");
    safeSource(body);
    return issueComment(await call(context, "create_issue_comment", "POST", "/issues/" + context.number + "/comments", { body: { body }, permissions: { issues: "write" } }), { coordinationAppId, coordinationBotUserId });
  }
  async function listDraftPRs(context) {
    const data = await get(context, "list_pull_requests", "/pulls?state=open&per_page=100&page=" + encode(String(pageNumber(context.page))), { permissions: { pull_requests: "read" } });
    if (!Array.isArray(data)) githubFail("GITHUB_RESPONSE_INVALID");
    return { pullRequests: data.filter((x) => x.draft).map(pull), hasMore: data.length === 100 };
  }
  async function getPullRequest(context) {
    if (!id(context.number)) githubFail("GITHUB_PULL_REQUEST_INVALID");
    return pull(await get(context, "read_pull_request", "/pulls/" + context.number, { permissions: { pull_requests: "read" } }));
  }
  async function openDraftPR(context) {
    const repository = mapping(context), branch = managedBranch(context.branch, repository), base = branchName(context.base || repository.defaultBranch);
    if (base !== repository.defaultBranch) githubFail("GITHUB_BASE_BRANCH_REJECTED");
    const head = await readHead({ ...context, branch });
    if (context.expectedHead && head.sha !== context.expectedHead) githubFail("GITHUB_HEAD_CHANGED");
    const title = safeText(context.title, 500, "GITHUB_TITLE_INVALID"), body = safeText(context.body, 65536, "GITHUB_BODY_INVALID");
    safeSource(body);
    if (context.issueNumber) {
      const linked = await getIssue({ ...context, number: context.issueNumber });
      if (linked.state !== "open") githubFail("GITHUB_ISSUE_NOT_OPEN");
    }
    const prior = await get(context, "read_pull_request", "/pulls?state=open&head=" + encode(repository.owner + ":" + branch) + "&base=" + encode(base), { permissions: { pull_requests: "read" } });
    if (!Array.isArray(prior)) githubFail("GITHUB_RESPONSE_INVALID");
    if (prior.length) {
      if (prior.length !== 1 || prior[0].draft !== true) githubFail("GITHUB_PULL_REQUEST_CONFLICT");
      return { ...pull(prior[0]), existing: true };
    }
    const data = await call(context, "open_draft_pr", "POST", "/pulls", { body: { title, body, head: branch, base, draft: true, maintainer_can_modify: false }, permissions: { pull_requests: "write" }, extra: { branch, expectedHead: head.sha } });
    const result = pull(data);
    if (!result.draft || result.headSha !== head.sha) githubFail("GITHUB_MUTATION_OUTCOME_UNKNOWN");
    return { ...result, existing: false };
  }
  async function createIssue(context) {
    const title = safeText(context.title, 500, "GITHUB_TITLE_INVALID"), body = safeText(context.body, 65536, "GITHUB_BODY_INVALID");
    safeSource(body);
    return issue(await call(context, "create_issue", "POST", "/issues", { body: { title, body, ...context.issueLabel ? { labels: [context.issueLabel] } : {} }, permissions: { issues: "write" } }));
  }
  async function getCheckRuns(context) {
    if (!sha(context.commit)) githubFail("GITHUB_COMMIT_INVALID");
    const data = await get(context, "read_checks", "/commits/" + context.commit + "/check-runs?per_page=100", { permissions: { checks: "read" } });
    if (!Array.isArray(data?.check_runs)) githubFail("GITHUB_RESPONSE_INVALID");
    return { commitSha: context.commit, checks: data.check_runs.map((x) => ({ id: x.id, name: x.name, headSha: x.head_sha, status: x.status, conclusion: x.conclusion, detailsUrl: x.details_url })), hasMore: data.total_count > data.check_runs.length };
  }
  // Repository metadata uses the same fixed origin and strict id check.
  async function repo(context) {
    const repository = mapping(context), data = await get(context, "read_repository", "", { permissions: { metadata: "read" } });
    if (!sameId(data?.id, repository.id) || data.owner?.login?.toLowerCase() !== repository.owner.toLowerCase() || data.name?.toLowerCase() !== repository.name.toLowerCase()) githubFail("GITHUB_REPOSITORY_ID_CHANGED");
    return { id: String(data.id), owner: data.owner.login, name: data.name, defaultBranch: data.default_branch, private: data.private === true, htmlUrl: data.html_url };
  }
  return Object.freeze({ getRepository: repo, readRepo: repo, readHead, readTree, readSource, listIssues, getIssue, listIssueComments, createIssueComment, listDraftPRs, getPullRequest, getCheckRuns, createBranch, checkpoint, openDraftPR, createIssue, getVerifiedAuthor: verifiedAuthor });
}
export {
  GITHUB_API_VERSION,
  GithubError,
  createGithubProvider,
  githubFail,
  githubSourcePath
};
