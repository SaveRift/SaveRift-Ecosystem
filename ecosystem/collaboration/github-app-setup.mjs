// SPDX-License-Identifier: Apache-2.0
// Owner-operated registration. Secrets are consumed only by trusted host closures.
import {Buffer} from 'node:buffer';
import {randomBytes, createHash, createPrivateKey, sign} from 'node:crypto';
import {parseSchemaJson} from '../sdk/schema.mjs';
import {githubFail, GITHUB_API_VERSION} from './github-provider.mjs';
import {createGithubTokenBroker} from './github-identity.mjs';

const API = 'https://api.github.com';
const CONFIG_KEY = 'github/app-setup/configuration';
const CURRENT_KEY = 'github/app-setup/current';
const STATE_PREFIX = 'github/app-setup/states/';
const RECOVERY_PREFIX = 'github/app-setup/recovery/';
const TTL = 30 * 60 * 1000;
const PERMISSIONS = Object.freeze({contents: 'write', issues: 'write', pull_requests: 'write', checks: 'read', metadata: 'read', emails: 'read'});
const INSTALL_PERMISSIONS = Object.freeze({contents: 'read', issues: 'read', pull_requests: 'read', checks: 'read', metadata: 'read'});
const sha = value => createHash('sha256').update(value).digest('hex');
const b64 = value => Buffer.from(value).toString('base64url');
const validId = value => /^[1-9]\d{0,15}$/.test(String(value)) && Number.isSafeInteger(Number(value));
const safeState = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const safeCode = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,512}$/.test(value);
const token = value => typeof value === 'string' && value.length >= 8 && value.length <= 16384 && !/[\s\x00-\x1f\x7f]/.test(value);
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#39;');
const noStore = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'};
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function samePermissions(value, expected, {requireAll = true} = {}) {
  return plain(value) && Object.entries(value).every(([key, level]) => expected[key] === level) && (!requireAll || Object.entries(expected).every(([key, level]) => value[key] === level));
}
async function responseJson(response, limit = 128 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) githubFail('GITHUB_APP_RESPONSE_INVALID', 'GitHub returned no usable configuration.', 502);
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); githubFail('GITHUB_APP_RESPONSE_LIMIT', 'GitHub configuration exceeded its response limit.', 502); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return parseSchemaJson(bytes); }
  catch { githubFail('GITHUB_APP_RESPONSE_INVALID', 'GitHub returned no usable configuration.', 502); }
}

/** store must be encrypted, account-private, conditional storage in production. */
export function createGithubAppSetup({store, authorizeOwner, origin, organization, repository, fetcher = globalThis.fetch, now = Date.now, random = randomBytes, appName = 'SaveRift Developer Preview'} = {}) {
  if (!store?.get || !store?.put || typeof authorizeOwner !== 'function' || typeof fetcher !== 'function' || typeof now !== 'function' || typeof random !== 'function') throw Error('Trusted private storage and owner authorization are required.');
  let hosted;
  try { hosted = new URL(origin); if (hosted.protocol !== 'https:' || hosted.username || hosted.password || hosted.pathname !== '/' || hosted.search || hosted.hash) throw Error(); }
  catch { githubFail('GITHUB_APP_HOST_INVALID', 'An exact trusted HTTPS origin is required.', 500); }
  if (!validId(organization?.id) || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(organization?.login || '') || !validId(repository?.id) || repository.owner !== organization.login || !/^[A-Za-z0-9_.-]{1,100}$/.test(repository.name || '') || typeof appName !== 'string' || !appName || appName.length > 80 || /[\x00-\x1f\x7f]/.test(appName)) githubFail('GITHUB_APP_TARGET_INVALID', 'Pin the owner organization and selected ecosystem repository.', 500);
  const target = Object.freeze({id: String(repository.id), owner: repository.owner, name: repository.name});
  const targetOrg = Object.freeze({id: String(organization.id), login: organization.login});
  const basePath = '/api/developer/github/setup';
  const callbackUrl = hosted.origin + basePath + '/callback';
  const actorKey = actor => {
    if (typeof actor?.id !== 'string' || !actor.id || actor.id.length > 300 || /[\x00-\x1f\x7f]/.test(actor.id)) githubFail('GITHUB_APP_OWNER_REQUIRED', 'The trusted owner must operate GitHub App setup.', 403);
    return sha('saverift.github-app-owner\0' + actor.id);
  };
  async function permitted(actor, action) {
    actorKey(actor);
    if (await authorizeOwner({actor, action, repository: target, organization: targetOrg}) !== true) githubFail('GITHUB_APP_OWNER_REQUIRED', 'The trusted owner must operate GitHub App setup.', 403);
  }
  function exactOrigin(value) { if (value !== hosted.origin) githubFail('GITHUB_APP_SETUP_ORIGIN_REJECTED', 'Use the trusted owner workbench.', 403); }
  const stateKey = state => STATE_PREFIX + sha(state);
  const headers = extra => ({Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': GITHUB_API_VERSION, 'User-Agent': 'SaveRift-App-Setup', ...extra});
  function safeConfiguration(value) {
    const installationUrl = new URL(`https://github.com/apps/${value.slug}/installations/new/permissions`);
    installationUrl.searchParams.set('suggested_target_id', targetOrg.id);
    installationUrl.searchParams.append('repository_ids[]', target.id);
    return {ownerSetupAvailable: true, configured: true, appId: value.appId, slug: value.slug, appUrl: value.appUrl, organization: {...targetOrg}, repository: {...target}, installation: value.installation || null, installationUrl: installationUrl.href, webhookState: 'inactive_private_host', pollingAvailable: true, publicSourcePublication: false};
  }
  function manifest() {
    return {name: appName, url: hosted.origin + '/developer', description: 'Game-scoped SaveRift source collaboration. Player saves and Xbox publication remain separate.', public: false, redirect_url: callbackUrl, callback_urls: [hosted.origin + '/api/developer/github/callback'], setup_url: hosted.origin + '/developer?githubApp=installed', setup_on_update: true, request_oauth_on_install: false, default_permissions: {...PERMISSIONS}, default_events: [], hook_attributes: {url: hosted.origin + '/api/developer/github/webhook', active: false}};
  }
  async function checkedState(actor, state) {
    if (!safeState(state)) githubFail('GITHUB_APP_SETUP_STATE_REJECTED', 'This setup attempt is invalid or expired.', 409);
    const row = await store.get(stateKey(state)), current = await store.get(CURRENT_KEY);
    if (!row || row.value.actor !== actorKey(actor) || row.value.expiresAt <= now() || row.value.status !== 'pending' || !current || current.value.generation !== row.value.generation || current.value.status !== 'pending') githubFail('GITHUB_APP_SETUP_STATE_REJECTED', 'This setup attempt is invalid or expired.', 409);
    return {row, current};
  }
  async function recovery(current, code = 'GITHUB_APP_SETUP_RECOVERY_REQUIRED') {
    const latest = await store.get(CURRENT_KEY);
    if (latest?.etag === current.etag) {
      try { await store.put(CURRENT_KEY, {...latest.value, status: 'recovery_required', code, finishedAt: now()}, {ifMatch: latest.etag}); }
      catch (error) { if (error.code !== 'REVISION_CONFLICT') throw error; }
    }
  }
  function checkApp(data) {
    if (!plain(data) || !validId(data.id) || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(data.slug || '') || String(data.owner?.id) !== targetOrg.id || data.owner?.login?.toLowerCase() !== targetOrg.login.toLowerCase() || data.owner?.type !== 'Organization' || !token(data.client_id) || !token(data.client_secret) || !token(data.webhook_secret) || typeof data.pem !== 'string' || data.pem.length > 16384 || !samePermissions(data.permissions, PERMISSIONS) || !Array.isArray(data.events) || data.events.length || data.html_url !== `https://github.com/apps/${data.slug}` || data.external_url !== hosted.origin + '/developer') githubFail('GITHUB_APP_CONFIGURATION_UNVERIFIED', 'The created App does not match the approved organization and permissions.', 409);
    try { const key = createPrivateKey(data.pem); if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails?.modulusLength < 2048) throw Error(); }
    catch { githubFail('GITHUB_APP_CONFIGURATION_UNVERIFIED', 'The created App key is unusable.', 409); }
    return {schema: 'saverift.github-app-configuration.v1', appId: String(data.id), slug: data.slug, appUrl: data.html_url, clientId: data.client_id, clientSecret: data.client_secret, privateKey: data.pem, webhookSecret: data.webhook_secret, owner: {...targetOrg}, repository: {...target}, installation: null, createdAt: now(), webhookState: 'inactive_private_host'};
  }
  function jwt(config) {
    const issued = Math.floor(now() / 1000) - 30;
    const unsigned = b64(JSON.stringify({alg: 'RS256', typ: 'JWT'})) + '.' + b64(JSON.stringify({iat: issued, exp: issued + 540, iss: config.appId}));
    return unsigned + '.' + sign('RSA-SHA256', Buffer.from(unsigned), createPrivateKey(config.privateKey)).toString('base64url');
  }
  return Object.freeze({
    async status({actor}) {
      await permitted(actor, 'github_app_setup_status');
      const row = await store.get(CONFIG_KEY);
      if (row?.value?.schema === 'saverift.github-app-configuration.v1') return safeConfiguration(row.value);
      const current = await store.get(CURRENT_KEY);
      return {ownerSetupAvailable: true, configured: false, state: current?.value.status || 'not_started', organization: {...targetOrg}, repository: {...target}, webhookState: 'inactive_private_host'};
    },
    async begin({actor, origin: requestOrigin}) {
      exactOrigin(requestOrigin); await permitted(actor, 'github_app_setup_begin');
      if (await store.get(CONFIG_KEY)) githubFail('GITHUB_APP_ALREADY_CONFIGURED', 'An App already exists; do not silently replace it.', 409);
      const prior = await store.get(CURRENT_KEY);
      if (prior?.value.status === 'converting' || prior?.value.status === 'recovery_required') githubFail('GITHUB_APP_SETUP_RECOVERY_REQUIRED', 'Resolve the previous setup result before creating another App.', 409);
      if ((prior?.value.startedAt || 0) + 60000 > now()) githubFail('GITHUB_APP_SETUP_RATE_LIMIT', 'Wait before starting another setup attempt.', 429);
      const state = b64(random(32)), generation = b64(random(32)), expiresAt = now() + TTL;
      if (!safeState(state) || !safeState(generation)) githubFail('GITHUB_APP_SETUP_RANDOM_INVALID', 'Secure setup state is unavailable.', 500);
      const row = {actor: actorKey(actor), generation, status: 'pending', expiresAt, createdAt: now()};
      await store.put(stateKey(state), row, {ifAbsent: true});
      await permitted(actor, 'github_app_setup_begin');
      await store.put(CURRENT_KEY, {generation, actor: row.actor, status: 'pending', startedAt: now(), expiresAt}, prior ? {ifMatch: prior.etag} : {ifAbsent: true});
      return {registrationPath: basePath + '/register?state=' + state, expiresAt, organization: {...targetOrg}, repository: {...target}, ownerOperated: true, passwordEntry: 'github_only'};
    },
    async registrationForm({actor, state}) {
      await permitted(actor, 'github_app_setup_form'); await checkedState(actor, state);
      const action = `https://github.com/organizations/${targetOrg.login}/settings/apps/new?state=${state}`;
      return {action, manifest: manifest(), html: '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set up SaveRift GitHub App</title></head><body><main><h1>Set up SaveRift’s GitHub App</h1><p>Continue on GitHub to create an organization-owned private App. Install it only on ' + escapeHtml(target.owner + '/' + target.name) + '.</p><p>Player saves, fixture consent, releases and Xbox publication are separate. Webhooks remain inactive while this workbench is private.</p><form method="post" action="' + escapeHtml(action) + '"><input type="hidden" name="manifest" value="' + escapeHtml(JSON.stringify(manifest())) + '"><button type="submit">Continue to GitHub</button></form></main></body></html>'};
    },
    async complete({actor, state, code, url}) {
      await permitted(actor, 'github_app_setup_complete');
      let actual;
      try { actual = new URL(url); }
      catch { githubFail('GITHUB_APP_SETUP_CALLBACK_REJECTED', 'The App setup callback is invalid.', 400); }
      if (actual.href.split('#')[0] !== actual.href || actual.username || actual.password || actual.origin + actual.pathname !== callbackUrl || actual.searchParams.getAll('code').length !== 1 || actual.searchParams.getAll('state').length !== 1 || [...actual.searchParams.keys()].some(key => !['code', 'state'].includes(key)) || actual.searchParams.get('state') !== state || actual.searchParams.get('code') !== code || !safeCode(code)) githubFail('GITHUB_APP_SETUP_CALLBACK_REJECTED', 'The App setup callback is invalid.', 400);
      const {row, current} = await checkedState(actor, state);
      await store.put(stateKey(state), {actor: row.value.actor, generation: row.value.generation, status: 'consumed', codeDigest: sha(code), consumedAt: now()}, {ifMatch: row.etag});
      const locked = await store.put(CURRENT_KEY, {...current.value, status: 'converting', codeDigest: sha(code)}, {ifMatch: current.etag});
      try {
        await permitted(actor, 'github_app_setup_complete');
        let response;
        try { response = await fetcher(API + '/app-manifests/' + code + '/conversions', {method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000), headers: headers()}); }
        catch { githubFail('GITHUB_APP_SETUP_OUTCOME_UNKNOWN', 'The configuration exchange needs owner recovery; it will not be retried automatically.', 502); }
        if (response.status !== 201 || response.redirected) { await response.body?.cancel(); githubFail('GITHUB_APP_SETUP_CONVERSION_REJECTED', 'GitHub did not confirm the App configuration exchange.', 502); }
        const returned = await responseJson(response);
        // GitHub returns these credentials once. Seal the bounded response in
        // a host-only recovery object before runtime-dependent key validation.
        // Unverified recovery records are never an adapter credential source.
        const recoveryKey = RECOVERY_PREFIX + row.value.generation;
        const sealed = await store.put(recoveryKey, {schema: 'saverift.github-app-recovery.v1', status: 'unverified_conversion', generation: row.value.generation, actor: row.value.actor, expectedOrganization: {...targetOrg}, expectedRepository: {...target}, receivedAt: now(), response: returned}, {ifAbsent: true});
        const config = checkApp(returned);
        await permitted(actor, 'github_app_setup_complete');
        const pending = await store.get(CURRENT_KEY);
        if (pending?.etag !== locked.etag || pending.value.generation !== row.value.generation) githubFail('GITHUB_APP_SETUP_STATE_REJECTED', 'The setup generation changed.', 409);
        await store.put(CONFIG_KEY, config, {ifAbsent: true});
        await store.put(CURRENT_KEY, {...locked.value, status: 'configured', finishedAt: now()}, {ifMatch: locked.etag});
        // Best effort only after the verified credential record is durable.
        // Failure keeps a sealed recovery copy, never a public result.
        try { await store.put(recoveryKey, {schema: 'saverift.github-app-recovery.v1', status: 'configured', generation: row.value.generation, appId: config.appId, finishedAt: now()}, {ifMatch: sealed.etag}); } catch {}
        return safeConfiguration(config);
      } catch (error) { await recovery(locked); throw error; }
    },
    async verifyInstallation({actor, origin: requestOrigin}) {
      exactOrigin(requestOrigin); await permitted(actor, 'github_app_installation_verify');
      const row = await store.get(CONFIG_KEY), config = row?.value;
      if (!config) githubFail('GITHUB_APP_NOT_CONFIGURED', 'Create the organization App first.', 503);
      let response;
      try { response = await fetcher(`${API}/repos/${target.owner}/${target.name}/installation`, {method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30000), headers: headers({Authorization: 'Bearer ' + jwt(config)})}); }
      catch { githubFail('GITHUB_APP_INSTALLATION_UNAVAILABLE', 'The selected installation could not be checked.', 502); }
      if (!response.ok || response.redirected) { await response.body?.cancel(); githubFail('GITHUB_APP_INSTALLATION_REQUIRED', 'Install this App only on the selected ecosystem repository, then verify it.', 409); }
      const installation = await responseJson(response);
      const expectedRepoPermissions = Object.fromEntries(Object.entries(PERMISSIONS).filter(([key]) => key !== 'emails'));
      if (!validId(installation.id) || String(installation.app_id) !== config.appId || String(installation.account?.id) !== targetOrg.id || installation.account?.login?.toLowerCase() !== targetOrg.login.toLowerCase() || installation.account?.type !== 'Organization' || installation.repository_selection !== 'selected' || !samePermissions(installation.permissions, expectedRepoPermissions) || installation.suspended_at) githubFail('GITHUB_APP_INSTALLATION_UNVERIFIED', 'The App installation does not match the approved organization, selection or permissions.', 409);
      await permitted(actor, 'github_app_installation_verify');
      const broker = createGithubTokenBroker({appId: config.appId, privateKey: config.privateKey, fetcher, now, allowedRepositoryIds: [target.id], authorize: async () => { await permitted(actor, 'github_app_installation_verify'); return true; }});
      await broker.run({actor, repository: {...target, installationId: String(installation.id)}, permissions: INSTALL_PERMISSIONS}, async credential => {
        let proof;
        try { proof = await fetcher(`${API}/repos/${target.owner}/${target.name}`, {method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30000), headers: headers({Authorization: 'Bearer ' + credential})}); }
        catch { githubFail('GITHUB_APP_INSTALLATION_UNAVAILABLE', 'The scoped repository check did not complete.', 502); }
        if (!proof.ok || proof.redirected) { await proof.body?.cancel(); githubFail('GITHUB_APP_INSTALLATION_UNVERIFIED', 'The scoped installation cannot read the selected repository.', 409); }
        const repo = await responseJson(proof);
        if (String(repo.id) !== target.id || repo.owner?.login !== target.owner || repo.name !== target.name || repo.private !== true) githubFail('GITHUB_APP_INSTALLATION_UNVERIFIED', 'The selected private repository could not be verified.', 409);
      });
      await permitted(actor, 'github_app_installation_verify');
      const safe = {id: String(installation.id), repositoryId: target.id, accountId: targetOrg.id, repositorySelection: 'selected', scopedTokenRepositoryCount: 1, verifiedAt: now()};
      const next = {...config, installation: safe};
      await store.put(CONFIG_KEY, next, {ifMatch: row.etag});
      return safeConfiguration(next);
    },
    // Trusted host function only: never expose this callback method in a tool or HTTP JSON dispatcher.
    async withPrivateCredentials(callback) {
      if (typeof callback !== 'function') githubFail('GITHUB_APP_PRIVATE_CALLBACK_REQUIRED', 'A trusted host callback is required.', 500);
      const row = await store.get(CONFIG_KEY);
      if (!row?.value?.appId) return callback(null);
      return callback({...row.value});
    }
  });
}

export function createGithubAppSetupRouter({setup, authenticate, allowedHosts, allowedOrigins = [], basePath = '/api/developer/github/setup'} = {}) {
  if (!setup || typeof authenticate !== 'function' || !Array.isArray(allowedHosts) || !allowedHosts.length || basePath !== '/api/developer/github/setup') throw Error('A trusted owner setup service and exact hosted routes are required.');
  const json = (value, status = 200) => Response.json(value, {status, headers: noStore});
  return async request => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(basePath + '/')) return null;
    const path = url.pathname.slice(basePath.length), callback = path === '/callback' && request.method === 'GET', origin = request.headers.get('origin');
    if (url.protocol !== 'https:' || url.username || url.password || !allowedHosts.includes(url.host) || !callback && (request.headers.get('sec-fetch-site') === 'cross-site' || origin && !allowedOrigins.includes(origin) || request.method !== 'GET' && (!origin || !allowedOrigins.includes(origin)))) return json({code: 'GITHUB_APP_SETUP_ORIGIN_REJECTED', error: 'Use the trusted owner workbench.'}, 403);
    try {
      const actor = await authenticate(request);
      if (!actor) githubFail('DEVELOPER_SIGN_IN_REQUIRED', 'Sign in to the owner workbench.', 401);
      if (path === '/status' && request.method === 'GET') return json(await setup.status({actor}));
      if (path === '/register' && request.method === 'GET') {
        if (url.searchParams.getAll('state').length !== 1 || [...url.searchParams.keys()].some(key => key !== 'state')) githubFail('GITHUB_APP_SETUP_STATE_REJECTED', 'Invalid setup state.', 400);
        const form = await setup.registrationForm({actor, state: url.searchParams.get('state')});
        return new Response(form.html, {headers: {...noStore, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; form-action https://github.com; frame-ancestors 'none'; base-uri 'none'"}});
      }
      if (callback) {
        await setup.complete({actor, state: url.searchParams.get('state'), code: url.searchParams.get('code'), url: url.href});
        return new Response(null, {status: 303, headers: {...noStore, Location: new URL('/developer?githubApp=created', url.origin).href}});
      }
      if (!['/begin', '/installation'].includes(path)) githubFail('GITHUB_APP_SETUP_ROUTE_NOT_FOUND', 'This App setup route is unavailable.', 404);
      if (request.method !== 'POST') githubFail('GITHUB_APP_SETUP_METHOD_REJECTED', 'This App setup method is unavailable.', 405);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) githubFail('GITHUB_APP_SETUP_INPUT_INVALID', 'Expected an empty JSON object.', 400);
      const bytes = await readSetupBody(request);
      let value; try { value = parseSchemaJson(bytes); } catch { githubFail('GITHUB_APP_SETUP_INPUT_INVALID', 'Expected an empty JSON object.', 400); }
      if (!plain(value) || Object.keys(value).length) githubFail('GITHUB_APP_SETUP_INPUT_INVALID', 'Expected an empty JSON object.', 400);
      return json(await setup[path === '/begin' ? 'begin' : 'verifyInstallation']({actor, origin}));
    } catch (error) {
      const code = /^[A-Z0-9_]{1,100}$/.test(error?.code || '') ? error.code : 'GITHUB_APP_SETUP_FAILED';
      return json({code, error: 'GitHub App setup could not be completed. No credentials are returned here.'}, Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 400);
    }
  };
}
async function readSetupBody(request) {
  const reader = request.body?.getReader(); if (!reader) githubFail('GITHUB_APP_SETUP_INPUT_INVALID', 'Expected an empty JSON object.', 400);
  const chunks = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 512) { await reader.cancel(); githubFail('GITHUB_APP_SETUP_INPUT_LIMIT', 'Setup input exceeds its limit.', 413); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; } return result;
}
