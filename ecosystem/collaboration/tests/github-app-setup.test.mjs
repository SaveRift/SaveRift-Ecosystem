// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, verify} from 'node:crypto';
import {createMemoryStore} from '../../workbench/storage.mjs';
import {createGithubAppSetup, createGithubAppSetupRouter} from '../github-app-setup.mjs';
import {GITHUB_API_VERSION} from '../github-provider.mjs';

const NOW = 1793620000000;
const origin = 'https://developer.example.test';
const actor = {id: 'trusted-owner', scopes: ['git:read', 'git:commit']};
const contributor = {id: 'other-contributor', scopes: ['git:read', 'git:commit'], owner: true};
const organization = {id: '351472929', login: 'SaveRift'};
const repository = {id: '1442896703', owner: 'SaveRift', name: 'SaveRift-Ecosystem'};
const callback = origin + '/api/developer/github/setup/callback';
const pair = generateKeyPairSync('rsa', {modulusLength: 2048});
const privateKey = pair.privateKey.export({format: 'pem', type: 'pkcs8'});
const permissions = {contents: 'write', issues: 'write', pull_requests: 'write', checks: 'read', metadata: 'read', emails: 'read'};
const secret = ['synthetic', 'backend', 'secret'].join('_');
const app = () => ({id: 777, slug: 'saverift-fixture-app', owner: {...organization, type: 'Organization'}, client_id: 'Iv1.fixture_client', client_secret: secret, webhook_secret: ['synthetic', 'webhook', 'secret'].join('_'), pem: privateKey, permissions: {...permissions}, events: [], html_url: 'https://github.com/apps/saverift-fixture-app', external_url: origin + '/developer'});
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});

function harness(options = {}) {
  const store = options.store || createMemoryStore(), queue = [], calls = [];
  let now = NOW, sequence = 0, enabled = true;
  const setup = createGithubAppSetup({store, origin, organization, repository, now: () => now, random: length => Buffer.alloc(length, ++sequence), authorizeOwner: async ({actor: principal}) => enabled && principal.id === actor.id, fetcher: async (url, init) => {
    calls.push({url, init}); const next = queue.shift(); assert.ok(next, 'Unexpected setup request'); assert.equal(url, next.url); return next.respond ? next.respond(init) : json(next.data, next.status);
  }, ...options});
  const callbackArgs = (state, code = 'manifest-code-one') => ({actor, state, code, url: callback + '?state=' + state + '&code=' + code});
  async function begin() { const value = await setup.begin({actor, origin}); return {...value, state: new URL(value.registrationPath, origin).searchParams.get('state')}; }
  async function complete() { const started = await begin(); queue.push({url: 'https://api.github.com/app-manifests/manifest-code-one/conversions', data: app(), status: 201}); const value = await setup.complete(callbackArgs(started.state)); return {started, value}; }
  return {setup, store, queue, calls, begin, complete, callbackArgs, advance: ms => {now += ms;}, revoke: () => {enabled = false;}};
}
function assertNoSecrets(value) {
  const text = JSON.stringify(value);
  for (const denied of [secret, privateKey, 'clientSecret', 'privateKey', 'webhookSecret', 'accessToken', 'client_secret', 'webhook_secret', 'codeDigest']) assert.ok(!text.includes(denied), denied + ' escaped');
}

test('owner begins a genuine organization manifest form with narrow inactive-hook configuration', async () => {
  const h = harness(), begin = await h.begin();
  assert.equal(begin.ownerOperated, true); assert.equal(h.calls.length, 0); assertNoSecrets(begin);
  const form = await h.setup.registrationForm({actor, state: begin.state});
  const target = new URL(form.action);
  assert.equal(target.origin, 'https://github.com'); assert.equal(target.pathname, '/organizations/SaveRift/settings/apps/new'); assert.equal(target.searchParams.get('state'), begin.state);
  assert.equal(form.manifest.public, false); assert.deepEqual(form.manifest.default_permissions, permissions); assert.deepEqual(form.manifest.default_events, []);
  assert.equal(form.manifest.hook_attributes.active, false); assert.equal(form.manifest.request_oauth_on_install, false);
  assert.equal(form.manifest.redirect_url, callback); assert.deepEqual(form.manifest.callback_urls, [origin + '/api/developer/github/callback']);
  assert.match(form.html, /<form method="post"/); assert.ok(!form.html.includes('<script')); assertNoSecrets(form);
  assert.equal((await h.setup.status({actor})).ownerSetupAvailable, true);
});

test('contributor scopes and caller owner flags cannot create or inspect owner setup state', async () => {
  const h = harness();
  for (const action of [() => h.setup.status({actor: contributor}), () => h.setup.begin({actor: contributor, origin})]) await assert.rejects(action(), {code: 'GITHUB_APP_OWNER_REQUIRED'});
  const begin = await h.begin();
  await assert.rejects(h.setup.registrationForm({actor: contributor, state: begin.state}), {code: 'GITHUB_APP_OWNER_REQUIRED'});
  await assert.rejects(h.setup.complete({...h.callbackArgs(begin.state), actor: contributor}), {code: 'GITHUB_APP_OWNER_REQUIRED'});
  assert.equal(h.calls.length, 0);
});

test('state is actor-bound, expiring, generation-bound and never inferred from a callback', async () => {
  const h = harness(), first = await h.begin();
  await assert.rejects(h.setup.begin({actor, origin}), {code: 'GITHUB_APP_SETUP_RATE_LIMIT'});
  for (const url of [callback + '?code=wrong&state=' + first.state, callback + '?code=manifest-code-one&code=manifest-code-one&state=' + first.state, 'https://other.example.test/api/developer/github/setup/callback?code=manifest-code-one&state=' + first.state, callback + '?code=manifest-code-one&state=' + first.state + '#secret', callback + '?code=manifest-code-one&state=' + first.state + '&extra=1']) await assert.rejects(h.setup.complete({...h.callbackArgs(first.state), url}), {code: 'GITHUB_APP_SETUP_CALLBACK_REJECTED'});
  h.advance(60001); const second = await h.begin();
  await assert.rejects(h.setup.complete(h.callbackArgs(first.state)), {code: 'GITHUB_APP_SETUP_STATE_REJECTED'});
  h.advance(30 * 60 * 1000 + 1);
  await assert.rejects(h.setup.complete(h.callbackArgs(second.state)), {code: 'GITHUB_APP_SETUP_STATE_REJECTED'});
  assert.equal(h.calls.length, 0);
});

test('one-time conversion seals credentials but returns only safe app/installation metadata', async () => {
  const h = harness(), {started, value} = await h.complete();
  assert.equal(value.configured, true); assert.equal(value.appId, '777'); assert.equal(value.slug, 'saverift-fixture-app'); assert.equal(value.installation, null); assert.equal(value.webhookState, 'inactive_private_host'); assert.equal(value.publicSourcePublication, false);
  assert.equal(new URL(value.installationUrl).origin, 'https://github.com'); assert.equal(new URL(value.installationUrl).searchParams.get('suggested_target_id'), organization.id); assert.deepEqual(new URL(value.installationUrl).searchParams.getAll('repository_ids[]'), [repository.id]);
  assertNoSecrets(value); assertNoSecrets(await h.setup.status({actor}));
  const stored = await h.setup.withPrivateCredentials(value => ({hasKey: value.privateKey === privateKey, hasSecret: value.clientSecret === secret, appId: value.appId}));
  assert.deepEqual(stored, {hasKey: true, hasSecret: true, appId: '777'});
  const call = h.calls[0]; assert.equal(call.init.method, 'POST'); assert.equal(call.init.redirect, 'manual'); assert.equal(call.init.headers.Authorization, undefined); assert.equal(call.init.headers['X-GitHub-Api-Version'], GITHUB_API_VERSION);
  const records = await h.store.list('github/app-setup/recovery/'); assert.equal(records.length, 1); assert.equal(records[0].value.response, undefined);
  await assert.rejects(h.setup.complete(h.callbackArgs(started.state)), {code: 'GITHUB_APP_SETUP_STATE_REJECTED'});
  await assert.rejects(h.setup.begin({actor, origin}), {code: 'GITHUB_APP_ALREADY_CONFIGURED'});
  assert.equal(h.calls.length, 1);
});

test('conversion response is sealed before key validation so a runtime failure does not lose one-use credentials', async () => {
  const h = harness(), begin = await h.begin();
  h.queue.push({url: 'https://api.github.com/app-manifests/manifest-code-one/conversions', status: 201, data: {...app(), pem: 'invalid-key-for-fixture'}});
  await assert.rejects(h.setup.complete(h.callbackArgs(begin.state)), {code: 'GITHUB_APP_CONFIGURATION_UNVERIFIED'});
  const records = await h.store.list('github/app-setup/recovery/'); assert.equal(records.length, 1); assert.equal(records[0].value.response.client_secret, secret);
  assert.equal(await h.setup.withPrivateCredentials(value => value), null);
  const status = await h.setup.status({actor}); assert.equal(status.state, 'recovery_required'); assertNoSecrets(status);
  await assert.rejects(h.setup.begin({actor, origin}), {code: 'GITHUB_APP_SETUP_RECOVERY_REQUIRED'});
});

test('wrong organization, broadened permissions and enabled events are quarantined without configuring adapters', async () => {
  for (const change of [value => {value.owner.id = 9;}, value => {value.owner.type = 'User';}, value => {value.permissions.administration = 'write';}, value => {delete value.permissions.emails;}, value => {value.events = ['push'];}, value => {value.html_url = 'https://other.example.test/apps/saverift';}]) {
    const h = harness(), begin = await h.begin(), value = app(); change(value);
    h.queue.push({url: 'https://api.github.com/app-manifests/manifest-code-one/conversions', status: 201, data: value});
    await assert.rejects(h.setup.complete(h.callbackArgs(begin.state)), {code: 'GITHUB_APP_CONFIGURATION_UNVERIFIED'});
    assert.equal(await h.setup.withPrivateCredentials(value => value), null); assert.equal((await h.setup.status({actor})).state, 'recovery_required');
  }
});

test('ambiguous conversion is never replayed or automatically retried', async () => {
  const h = harness(), begin = await h.begin();
  h.queue.push({url: 'https://api.github.com/app-manifests/manifest-code-one/conversions', respond() {throw Error('network may have accepted the request');}});
  await assert.rejects(h.setup.complete(h.callbackArgs(begin.state)), {code: 'GITHUB_APP_SETUP_OUTCOME_UNKNOWN'});
  await assert.rejects(h.setup.complete(h.callbackArgs(begin.state)), {code: 'GITHUB_APP_SETUP_STATE_REJECTED'});
  await assert.rejects(h.setup.begin({actor, origin}), {code: 'GITHUB_APP_SETUP_RECOVERY_REQUIRED'});
  assert.equal(h.calls.length, 1); assert.equal((await h.setup.status({actor})).state, 'recovery_required');
});

test('owner revocation during conversion prevents verified credentials from reaching adapters', async () => {
  const h = harness(), begin = await h.begin();
  h.queue.push({url: 'https://api.github.com/app-manifests/manifest-code-one/conversions', respond() {h.revoke(); return json(app(), 201);}});
  await assert.rejects(h.setup.complete(h.callbackArgs(begin.state)), {code: 'GITHUB_APP_OWNER_REQUIRED'});
  assert.equal(await h.setup.withPrivateCredentials(value => value), null);
  assert.equal((await h.store.list('github/app-setup/recovery/')).length, 1);
});

test('concurrent setup callbacks consume the state once', async () => {
  const h = harness(), begin = await h.begin();
  h.queue.push({url: 'https://api.github.com/app-manifests/manifest-code-one/conversions', data: app(), status: 201});
  const results = await Promise.allSettled([h.setup.complete(h.callbackArgs(begin.state)), h.setup.complete(h.callbackArgs(begin.state))]);
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1); assert.equal(h.calls.length, 1);
});

function queueInstallation(h, {selection = 'selected', repoPrivate = true} = {}) {
  h.queue.push({url: 'https://api.github.com/repos/SaveRift/SaveRift-Ecosystem/installation', data: {id: 123, app_id: 777, account: {...organization, type: 'Organization'}, repository_selection: selection, permissions: Object.fromEntries(Object.entries(permissions).filter(([key]) => key !== 'emails')), suspended_at: null}, respond: selection === 'selected' ? init => {
    const bearer = init.headers.Authorization.slice('Bearer '.length), [header, payload, signature] = bearer.split('.');
    assert.equal(verify('RSA-SHA256', Buffer.from(header + '.' + payload), pair.publicKey, Buffer.from(signature, 'base64url')), true); assert.equal(JSON.parse(Buffer.from(payload, 'base64url')).iss, '777');
    return json({id: 123, app_id: 777, account: {...organization, type: 'Organization'}, repository_selection: selection, permissions: Object.fromEntries(Object.entries(permissions).filter(([key]) => key !== 'emails')), suspended_at: null});
  } : undefined});
  if (selection !== 'selected') return;
  const reduced = {contents: 'read', issues: 'read', pull_requests: 'read', checks: 'read', metadata: 'read'};
  h.queue.push({url: 'https://api.github.com/app/installations/123/access_tokens', respond(init) {
    const body = JSON.parse(init.body); assert.deepEqual(body.repository_ids, [1442896703]); assert.deepEqual(body.permissions, reduced);
    return json({token: ['ghs', 'fixture_scoped_only'].join('_'), expires_at: new Date(NOW + 3600000).toISOString(), permissions: reduced, repositories: [{id: 1442896703}]}, 201);
  }});
  h.queue.push({url: 'https://api.github.com/repos/SaveRift/SaveRift-Ecosystem', data: {id: 1442896703, owner: {login: 'SaveRift'}, name: 'SaveRift-Ecosystem', private: repoPrivate}});
}

test('installation is independently verified with an App JWT and one-repository reduced token', async () => {
  const h = harness(); await h.complete(); queueInstallation(h);
  const value = await h.setup.verifyInstallation({actor, origin});
  assert.equal(value.installation.id, '123'); assert.equal(value.installation.repositoryId, repository.id); assert.equal(value.installation.scopedTokenRepositoryCount, 1); assert.equal(value.installation.repositorySelection, 'selected'); assertNoSecrets(value);
  assert.equal((await h.setup.withPrivateCredentials(value => value.installation.id)), '123');
  assert.equal(h.calls.length, 4);
});

test('all-repository selection and public repo proof fail before installation is recorded', async () => {
  const h = harness(); await h.complete(); queueInstallation(h, {selection: 'all'});
  await assert.rejects(h.setup.verifyInstallation({actor, origin}), {code: 'GITHUB_APP_INSTALLATION_UNVERIFIED'});
  assert.equal((await h.setup.status({actor})).installation, null); assert.equal(h.calls.length, 2);
  const h2 = harness(); await h2.complete(); queueInstallation(h2, {repoPrivate: false});
  await assert.rejects(h2.setup.verifyInstallation({actor, origin}), {code: 'GITHUB_APP_INSTALLATION_UNVERIFIED'});
  assert.equal((await h2.setup.status({actor})).installation, null);
});

function router(h) { return createGithubAppSetupRouter({setup: h.setup, authenticate: request => request.headers.get('fixture-owner') === 'yes' ? actor : request.headers.get('fixture-contributor') === 'yes' ? contributor : null, allowedHosts: ['developer.example.test'], allowedOrigins: [origin]}); }
const request = (path, {method = 'GET', body, headers = {}} = {}) => new Request(origin + '/api/developer/github/setup' + path, {method, headers: {'fixture-owner': 'yes', ...(body === undefined ? {} : {'Content-Type': 'application/json', Origin: origin}), ...headers}, ...(body === undefined ? {} : {body})});

test('owner HTTP routes return a genuine form and safe same-origin callback redirect', async () => {
  const h = harness(), route = router(h);
  const start = await route(request('/begin', {method: 'POST', body: '{}'})); assert.equal(start.status, 200); const begin = await start.json();
  const state = new URL(begin.registrationPath, origin).searchParams.get('state');
  const form = await route(request('/register?state=' + state)); assert.equal(form.status, 200); assert.match(form.headers.get('content-security-policy'), /form-action https:\/\/github.com/); assertNoSecrets(await form.text());
  h.queue.push({url: 'https://api.github.com/app-manifests/manifest-code-one/conversions', data: app(), status: 201});
  const done = await route(request('/callback?code=manifest-code-one&state=' + state, {headers: {'sec-fetch-site': 'cross-site'}}));
  assert.equal(done.status, 303); assert.equal(done.headers.get('Location'), origin + '/developer?githubApp=created'); assert.equal(done.headers.get('Referrer-Policy'), 'no-referrer');
});

test('HTTP owner gate, cross-site checks, methods and bounded unique input cannot be bypassed', async () => {
  const h = harness(), route = router(h);
  assert.equal((await route(request('/status', {headers: {'fixture-owner': 'no'}}))).status, 401);
  assert.equal((await route(request('/status', {headers: {'fixture-owner': 'no', 'fixture-contributor': 'yes'}}))).status, 403);
  assert.equal((await route(request('/begin', {method: 'POST', body: '{}', headers: {Origin: 'https://other.example.test'}}))).status, 403);
  assert.equal((await route(request('/begin', {method: 'POST', body: '{}', headers: {'sec-fetch-site': 'cross-site'}}))).status, 403);
  for (const body of ['{"actor":"owner"}', '{"x":1,"x":2}', '[]', 'null']) assert.equal((await route(request('/begin', {method: 'POST', body}))).status, 400);
  assert.equal((await route(request('/begin', {method: 'POST', body: ' '.repeat(513)}))).status, 413);
  assert.equal((await route(request('/begin'))).status, 405);
  assert.equal((await route(new Request('https://other.example.test/api/developer/github/setup/status', {headers: {'fixture-owner': 'yes'}}))).status, 403);
  assert.equal(await route(new Request(origin + '/api/developer/github/status')), null); assert.equal(h.calls.length, 0);
});

test('HTTP failures are bounded and never return provider errors or credential-bearing URLs', async () => {
  const h = harness(), route = router(h), start = await route(request('/begin', {method: 'POST', body: '{}'}));
  const state = new URL((await start.json()).registrationPath, origin).searchParams.get('state');
  h.queue.push({url: 'https://api.github.com/app-manifests/manifest-code-one/conversions', respond() {throw Error(secret + privateKey);}});
  const response = await route(request('/callback?code=manifest-code-one&state=' + state));
  assert.equal(response.status, 502); const value = await response.json(); assert.equal(value.code, 'GITHUB_APP_SETUP_OUTCOME_UNKNOWN'); assertNoSecrets(value); assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert.ok(!JSON.stringify(value).includes('manifest-code-one'));
});
