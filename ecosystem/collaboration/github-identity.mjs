// SPDX-License-Identifier: Apache-2.0
// Credentials stay in the private host store/closures. None of these APIs is a token-output MCP tool.
import { randomBytes, createHash, createPrivateKey, sign } from "node:crypto";
import { githubFail, GITHUB_API_VERSION } from "./github-provider.mjs";
const API = "https://api.github.com";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const b64 = (value) => Buffer.from(value).toString("base64url");
const validId = (value) => Number.isSafeInteger(value) && value > 0 || typeof value === "string" && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
const safeToken = (value) => typeof value === "string" && value.length >= 8 && value.length <= 16384 && !/[\s\x00-\x1f\x7f]/.test(value);
async function json(response, max = 128 * 1024) {
  const reader = response.body?.getReader(), chunks = [];
  let length = 0;
  if (!reader) githubFail("GITHUB_RESPONSE_INVALID");
  try {
    for (; ; ) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > max) {
        await reader.cancel();
        githubFail("GITHUB_RESPONSE_LIMIT");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    githubFail("GITHUB_RESPONSE_INVALID");
  }
}
function createGithubTokenBroker({ appId, privateKey, fetcher = globalThis.fetch, now = Date.now, allowedRepositoryIds = [], authorize = async () => false } = {}) {
  const allowed = new Set(allowedRepositoryIds.map(String)), cache = /* @__PURE__ */ new Map();
  let generation = 0;
  async function mint({ repository, permissions, actor, grant }) {
    if (!validId(repository?.id) || !validId(repository?.installationId) || !allowed.has(String(repository.id)) || await authorize({ repository, permissions, actor, grant }) !== true) githubFail("GITHUB_INSTALLATION_SCOPE_DENIED");
    if (!appId || !privateKey) githubFail("GITHUB_APP_NOT_CONFIGURED", "A scoped GitHub App installation is not configured.", 503);
    const supported = /* @__PURE__ */ new Set(["metadata", "contents", "issues", "pull_requests", "checks"]);
    if (!permissions || Object.entries(permissions).some(([key2, value]) => !supported.has(key2) || !["read", "write"].includes(value) || key2 === "checks" && value === "write" || key2 === "metadata" && value !== "read")) githubFail("GITHUB_INSTALLATION_PERMISSION_DENIED");
    const tokenGeneration = generation, key = JSON.stringify([repository.id, repository.installationId, Object.entries(permissions).sort()]), cached = cache.get(key);
    if (cached?.expiresAt > now() + 6e4 && cached.generation === generation) return { token: cached.token, generation: cached.generation };
    const issued = Math.floor(now() / 1e3) - 30, payload = { iat: issued, exp: issued + 540, iss: String(appId) }, header = { alg: "RS256", typ: "JWT" }, unsigned = b64(JSON.stringify(header)) + "." + b64(JSON.stringify(payload));
    let jwt;
    try {
      jwt = unsigned + "." + sign("RSA-SHA256", Buffer.from(unsigned), createPrivateKey(privateKey)).toString("base64url");
    } catch {
      githubFail("GITHUB_APP_KEY_INVALID", "The trusted GitHub App key is not configured correctly.", 503);
    }
    let response;
    try {
      response = await fetcher(`${API}/app/installations/${repository.installationId}/access_tokens`, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(3e4), headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": GITHUB_API_VERSION, "User-Agent": "SaveRift-Collaboration", Authorization: "Bearer " + jwt, "Content-Type": "application/json" }, body: JSON.stringify({ repository_ids: [Number(repository.id)], permissions }) });
    } catch {
      githubFail("GITHUB_TOKEN_UNAVAILABLE", "GitHub installation authorization is unavailable.", 502);
    }
    if (!response.ok || response.redirected) {
      await response.body?.cancel();
      githubFail("GITHUB_INSTALLATION_AUTHORIZATION_FAILED", "GitHub refused the selected installation or permissions.", response.status);
    }
    const data = await json(response), expiresAt = Date.parse(data.expires_at);
    if (!safeToken(data.token) || !Number.isFinite(expiresAt) || expiresAt <= now() || expiresAt > now() + 366e4 || !Array.isArray(data.repositories) || data.repositories.length !== 1 || String(data.repositories[0].id) !== String(repository.id) || Object.entries(permissions).some(([key2, value]) => data.permissions?.[key2] !== value) || Object.entries(data.permissions || {}).some(([key2, value]) => key2 !== "metadata" && (!Object.hasOwn(permissions, key2) || permissions[key2] === "read" && value === "write"))) githubFail("GITHUB_TOKEN_SCOPE_UNVERIFIED");
    if (tokenGeneration !== generation || await authorize({ repository, permissions, actor, grant }) !== true) githubFail("GITHUB_INSTALLATION_SCOPE_DENIED");
    cache.set(key, { token: data.token, expiresAt, generation: tokenGeneration });
    return { token: data.token, generation: tokenGeneration };
  }
  return Object.freeze({ async run(input, callback) {
    if (typeof callback !== "function") githubFail("GITHUB_TOKEN_CALLBACK_REQUIRED");
    const requestGeneration = generation, credential = await mint(input);
    if (requestGeneration !== generation || credential.generation !== generation || await authorize(input) !== true) githubFail("GITHUB_INSTALLATION_SCOPE_DENIED");
    return callback(credential.token);
  }, invalidate() {
    generation++;
    cache.clear();
  } });
}
/** The store MUST be encrypted and private in a hosted deployment (memory is for tests). */
function createGithubIdentityService({ store, clientId, clientSecret, callbackUrl, allowedOrigins = [], fetcher = globalThis.fetch, now = Date.now, random = (length) => randomBytes(length), authorize = async () => false } = {}) {
  if (!store || typeof authorize !== "function") throw Error("A private identity store and host authorization adapter are required.");
  let callback;
  try {
    callback = new URL(callbackUrl);
    if (callback.protocol !== "https:" || callback.username || callback.password || callback.search || callback.hash) throw Error();
  } catch {
    githubFail("GITHUB_CALLBACK_CONFIGURATION_INVALID");
  }
  const actorKey = (actor) => {
    if (typeof actor?.id !== "string" || !actor.id || actor.id.length > 300) githubFail("GITHUB_IDENTITY_REQUIRED");
    return sha(actor.id);
  };
  const key = (actor) => "github/identities/" + actorKey(actor);
  const stateKey = (state) => "github/states/" + sha(state);
  const safeState = (state) => typeof state === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(state);
  async function limited(actor, action, max) {
    const recordKey = "github/rates/" + actorKey(actor) + "/" + action + "/" + Math.floor(now() / 6e5);
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await store.get(recordKey), count = row?.value.count || 0;
      if (count >= max) githubFail("GITHUB_IDENTITY_RATE_LIMIT", "Wait before starting another GitHub authorization attempt.", 429);
      try {
        await store.put(recordKey, { count: count + 1 }, row ? { ifMatch: row.etag } : { ifAbsent: true });
        return;
      } catch (error) {
        if (error.code !== "REVISION_CONFLICT") throw error;
      }
    }
    githubFail("GITHUB_IDENTITY_RATE_LIMIT", "Authorization attempts are already in progress.", 429);
  }
  async function permitted(actor, action, extra = {}) {
    actorKey(actor);
    if (await authorize({ actor, action, ...extra }) !== true) githubFail("GITHUB_IDENTITY_DENIED", "This GitHub identity action is not authorized.", 403);
  }
  function origin(value) {
    if (!allowedOrigins.includes(value)) githubFail("GITHUB_IDENTITY_ORIGIN_DENIED");
  }
  function configured() {
    if (typeof clientId !== "string" || !clientId || typeof clientSecret !== "string" || !clientSecret) githubFail("GITHUB_APP_NOT_CONFIGURED", "GitHub identity linking requires the registered app and callback.", 503);
  }
  async function tokenRequest(body) {
    let response;
    try {
      response = await fetcher("https://github.com/login/oauth/access_token", { method: "POST", redirect: "manual", signal: AbortSignal.timeout(3e4), headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }).toString() });
    } catch {
      githubFail("GITHUB_IDENTITY_EXCHANGE_FAILED");
    }
    if (!response.ok || response.redirected) {
      await response.body?.cancel();
      githubFail("GITHUB_IDENTITY_EXCHANGE_FAILED");
    }
    const data = await json(response);
    if (data.error || !safeToken(data.access_token) || data.refresh_token !== void 0 && !safeToken(data.refresh_token)) githubFail("GITHUB_IDENTITY_EXCHANGE_FAILED", "GitHub authorization did not return a usable user session.");
    return data;
  }
  async function userRequest(token, path) {
    let response;
    try {
      response = await fetcher(API + path, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(3e4), headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": GITHUB_API_VERSION, "User-Agent": "SaveRift-Collaboration", Authorization: "Bearer " + token } });
    } catch {
      githubFail("GITHUB_IDENTITY_UNAVAILABLE");
    }
    if (!response.ok || response.redirected) {
      await response.body?.cancel();
      githubFail("GITHUB_IDENTITY_UNAVAILABLE", "GitHub identity or verified-email access is unavailable.", response.status);
    }
    return json(response);
  }
  const status = (link) => ({ configured: !!(clientId && clientSecret), ...link?.enabled ? { linked: true, githubUser: { id: link.githubUser.id, login: link.githubUser.login, name: link.githubUser.name }, githubUserId: link.githubUser.id, login: link.githubUser.login, name: link.githubUser.name, commitIdentityReady: !!link.author, linkedAt: link.linkedAt } : { linked: false, githubUser: null, commitIdentityReady: false } });
  async function credential(actor) {
    const row = await store.get(key(actor));
    if (!row?.value.enabled) githubFail("GITHUB_IDENTITY_NOT_LINKED");
    if (row.value.expiresAt > now() + 6e4) return row;
    if (!safeToken(row.value.refreshToken)) githubFail("GITHUB_IDENTITY_RECONNECT_REQUIRED");
    const token = await tokenRequest({ grant_type: "refresh_token", refresh_token: row.value.refreshToken });
    const expires = Number(token.expires_in);
    if (!Number.isSafeInteger(expires) || expires < 1 || expires > 28800) githubFail("GITHUB_IDENTITY_EXCHANGE_FAILED");
    const next = { ...row.value, accessToken: token.access_token, refreshToken: token.refresh_token || row.value.refreshToken, expiresAt: now() + expires * 1e3 };
    try {
      return await store.put(key(actor), next, { ifMatch: row.etag });
    } catch (error) {
      if (error.code !== "REVISION_CONFLICT") throw error;
      const latest = await store.get(key(actor));
      if (!latest?.value.enabled || latest.value.expiresAt <= now()) githubFail("GITHUB_IDENTITY_RECONNECT_REQUIRED");
      return latest;
    }
  }
  return Object.freeze({
    async begin({ actor, origin: requestOrigin }) {
      origin(requestOrigin);
      await permitted(actor, "github_link_begin");
      configured();
      await limited(actor, "begin", 5);
      const identity = await store.get(key(actor));
      const state = b64(random(32)), verifier = b64(random(48)), expiresAt = now() + 10 * 6e4;
      await store.put(stateKey(state), { actor: actorKey(actor), verifier, expiresAt, consumed: false, identityEtag: identity?.etag || null }, { ifAbsent: true });
      const url = new URL("https://github.com/login/oauth/authorize");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", callback.href);
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", b64(createHash("sha256").update(verifier).digest()));
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("scope", "offline_access");
      return { authorizationUrl: url.href, expiresAt, provider: "github", passwordEntry: "github_only" };
    },
    async complete({ actor, state, code, url }) {
      await permitted(actor, "github_link_complete");
      configured();
      await limited(actor, "complete", 15);
      let actual;
      try {
        actual = new URL(url);
      } catch {
        githubFail("GITHUB_CALLBACK_REJECTED");
      }
      if (actual.username || actual.password || actual.origin !== callback.origin || actual.pathname !== callback.pathname || actual.hash || actual.searchParams.getAll("code").length !== 1 || actual.searchParams.getAll("state").length !== 1 || actual.searchParams.get("code") !== code || actual.searchParams.get("state") !== state || !safeState(state) || typeof code !== "string" || !code || code.length > 1024) githubFail("GITHUB_CALLBACK_REJECTED");
      const saved = await store.get(stateKey(state));
      if (!saved || saved.value.actor !== actorKey(actor) || saved.value.expiresAt <= now() || saved.value.consumed) githubFail("GITHUB_OAUTH_STATE_REJECTED");
      await store.put(stateKey(state), { actor: saved.value.actor, expiresAt: saved.value.expiresAt, consumed: true }, { ifMatch: saved.etag });
      const tokens = await tokenRequest({ code, redirect_uri: callback.href, code_verifier: saved.value.verifier }), user = await userRequest(tokens.access_token, "/user");
      if (!validId(user?.id) || typeof user.login !== "string" || !user.login) githubFail("GITHUB_IDENTITY_UNVERIFIED");
      await permitted(actor, "github_link_complete");
      const expires = Number(tokens.expires_in);
      if (!Number.isSafeInteger(expires) || expires < 1 || expires > 28800) githubFail("GITHUB_IDENTITY_EXCHANGE_FAILED");
      const link = { enabled: true, githubUser: { id: String(user.id), login: user.login, name: user.name || user.login }, accessToken: tokens.access_token, refreshToken: tokens.refresh_token || null, expiresAt: now() + expires * 1e3, linkedAt: new Date(now()).toISOString(), author: null };
      await store.put(key(actor), link, saved.value.identityEtag ? { ifMatch: saved.value.identityEtag } : { ifAbsent: true });
      return status(link);
    },
    async status({ actor }) {
      await permitted(actor, "github_link_status");
      return status((await store.get(key(actor)))?.value);
    },
    async selectCommitIdentity({ actor, origin: requestOrigin, email }) {
      origin(requestOrigin);
      await permitted(actor, "github_commit_identity", { email });
      if (typeof email !== "string" || email.length > 254) githubFail("GITHUB_AUTHOR_NOT_VERIFIED");
      const row = await credential(actor), user = await userRequest(row.value.accessToken, "/user");
      if (String(user.id) !== row.value.githubUser.id) githubFail("GITHUB_IDENTITY_CHANGED");
      const emails = await userRequest(row.value.accessToken, "/user/emails");
      if (!Array.isArray(emails) || !emails.some((value2) => value2.email === email && value2.verified === true)) githubFail("GITHUB_AUTHOR_EMAIL_UNVERIFIED");
      await permitted(actor, "github_commit_identity", { email });
      const author = { githubUserId: String(user.id), login: user.login, name: user.name || user.login, email, verified: true, publicEmailConsent: true }, value = { ...row.value, author };
      await store.put(key(actor), value, { ifMatch: row.etag });
      return { githubUserId: author.githubUserId, login: author.login, commitIdentityReady: true };
    },
    async getVerifiedAuthor(actor) {
      await permitted(actor, "github_commit_author");
      const row = await credential(actor);
      if (!row.value.author) githubFail("GITHUB_AUTHOR_NOT_VERIFIED");
      const user = await userRequest(row.value.accessToken, "/user");
      if (String(user.id) !== row.value.githubUser.id) githubFail("GITHUB_IDENTITY_CHANGED");
      await permitted(actor, "github_commit_author");
      return clone(row.value.author);
    },
    async unlink({ actor, origin: requestOrigin }) {
      origin(requestOrigin);
      await permitted(actor, "github_unlink");
      const row = await store.get(key(actor));
      await store.put(key(actor), { enabled: false, unlinkedAt: new Date(now()).toISOString() }, row ? { ifMatch: row.etag } : { ifAbsent: true });
      return { linked: false, publicHistoryDeleted: false };
    }
  });
}
const clone = (value) => JSON.parse(JSON.stringify(value));
export {
  createGithubIdentityService,
  createGithubTokenBroker
};
