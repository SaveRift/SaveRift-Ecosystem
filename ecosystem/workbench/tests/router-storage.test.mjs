// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';
import {mkdtemp, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMemoryStore, createR2Store} from '../storage.mjs';
import {createDirectoryStore} from '../directory-store.mjs';
import {createWorkspaceService} from '../service.mjs';
import {createWorkbenchRouter} from '../router.mjs';
import {DEFAULT_SCOPES} from '../tool-definitions.mjs';

const alice = {id: 'private-developer', scopes: [...DEFAULT_SCOPES]}, bob = {...alice, id: 'other-developer'};
function mockR2() {
  const rows = new Map(); let serial = 0;
  return {rows, async get(key) { const row = rows.get(key); return row ? {etag: row.etag, arrayBuffer: async () => new Uint8Array(row.bytes).buffer} : null; }, async put(key, bytes, {onlyIf} = {}) { const prior = rows.get(key); if (onlyIf?.etagDoesNotMatch === '*' && prior || onlyIf?.etagMatches !== undefined && onlyIf.etagMatches !== prior?.etag) return null; const etag = String(++serial); rows.set(key, {bytes: new Uint8Array(bytes), etag}); return {etag}; }, async list({prefix, limit}) { return {objects: [...rows.keys()].filter(key => key.startsWith(prefix)).slice(0, limit).map(key => ({key}))}; }};
}
function codec() {
  const secret = randomBytes(32);
  return {
    async seal(bytes, aad) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', secret, iv); cipher.setAAD(Buffer.from(aad)); return Buffer.concat([iv, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]); },
    async unseal(bytes, aad) { const data = Buffer.from(bytes), decipher = createDecipheriv('aes-256-gcm', secret, data.subarray(0, 12)); decipher.setAAD(Buffer.from(aad)); decipher.setAuthTag(data.subarray(-16)); return Buffer.concat([decipher.update(data.subarray(12, -16)), decipher.final()]); }
  };
}

test('encrypted R2 store lists account-prefixed workspaces and rejects stale CAS / moved ciphertext', async () => {
  const bucket = mockR2(), store = createR2Store({bucket, ...codec()});
  const service = createWorkspaceService({store});
  const created = await service.dispatch(alice, 'saverift_workspace_create', {template: 'synthetic-json', name: 'Encrypted workspace'});
  assert.equal((await service.dispatch(alice, 'saverift_workspace_list', {})).workspaces[0].id, created.workspace.id);
  assert.deepEqual((await service.dispatch(bob, 'saverift_workspace_list', {})).workspaces, []);
  assert.ok([...bucket.rows.values()].every(row => !Buffer.from(row.bytes).includes(Buffer.from('Encrypted workspace'))));
  const a = await store.put('test/object', {value: 1}, {ifAbsent: true});
  await store.put('test/object', {value: 2}, {ifMatch: a.etag});
  await assert.rejects(store.put('test/object', {value: 3}, {ifMatch: a.etag}), {code: 'REVISION_CONFLICT'});
  bucket.rows.set('developer-v1/test/moved', bucket.rows.get('developer-v1/test/object'));
  await assert.rejects(store.get('test/moved'), {code: 'PRIVATE_OBJECT_INVALID'});
});

test('conditional R2 reuse always rechecks storage and immediately observes replaced consent and tombstones', async () => {
  const bucket = mockR2(), read = bucket.get.bind(bucket), crypt = codec(); let bodyReads = 0, decryptions = 0, reads = 0;
  bucket.get = async (key, options) => { reads++; const row = bucket.rows.get(key); if (row && options?.onlyIf?.etagDoesNotMatch === row.etag) return {etag: row.etag}; bodyReads++; return read(key); };
  const options = {bucket, seal: crypt.seal, unseal: async (...args) => {decryptions++; return crypt.unseal(...args);}}, a = createR2Store(options), b = createR2Store(options);
  await a.put('test/owned', {aiAccess: true, source: 'x'.repeat(20000)});
  const first = await a.get('test/owned'); first.value.aiAccess = false;
  assert.equal((await a.get('test/owned')).value.aiAccess, true);
  assert.equal(reads, 2); assert.equal(bodyReads, 1); assert.equal(decryptions, 1);
  await b.put('test/owned', {aiAccess: false, source: 'y'.repeat(20000)});
  assert.equal((await a.get('test/owned')).value.aiAccess, false);
  assert.equal(decryptions, 2);
  await b.delete('test/owned'); assert.equal((await a.get('test/owned')).value.deleted, true);
  await a.put('test/original', {data: 'z'.repeat(20000)}); await a.get('test/original');
  bucket.rows.set('developer-v1/test/owned', bucket.rows.get('developer-v1/test/original'));
  await assert.rejects(a.get('test/owned'), {code: 'PRIVATE_OBJECT_INVALID'});
  bucket.rows.delete('developer-v1/test/original'); assert.equal(await a.get('test/original'), null);
  const c = createR2Store({...options, bucket: {...bucket, get: async () => ({etag: 'unexpected-without-body'})}});
  await assert.rejects(c.get('test/owned'), {code: 'PRIVATE_OBJECT_INVALID'});
});

test('conditional R2 reuse evicts bounded text and cannot reuse an unexpected metadata version', async () => {
  const bucket = mockR2(), read = bucket.get.bind(bucket), crypt = codec(); let bodyReads = 0, wrongMetadata = false;
  bucket.get = async (key, options) => { const row = bucket.rows.get(key); if (row && options?.onlyIf?.etagDoesNotMatch === row.etag) return {etag: wrongMetadata ? 'unexpected' : row.etag}; bodyReads++; return read(key); };
  const store = createR2Store({bucket, ...crypt});
  for(let i=0;i<5;i++){await store.put('large/row'+i,{text:'x'.repeat(1024*1024)});await store.get('large/row'+i);}
  const before = bodyReads; await store.get('large/row0'); assert.equal(bodyReads, before+1);
  wrongMetadata = true; await assert.rejects(store.get('large/row0'), {code: 'PRIVATE_OBJECT_INVALID'});
});

test('directory store persists source privately and serializes conditional writes without caller filesystem paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saverift-directory-'));
  try { const store = await createDirectoryStore(directory), row = await store.put('test/object', {hello: 'persisted'}, {ifAbsent: true});
    const reopened = await createDirectoryStore(directory); assert.equal((await reopened.get('test/object')).value.hello, 'persisted');
    const results = await Promise.allSettled([store.put('test/object', {hello: 'a'}, {ifMatch: row.etag}), reopened.put('test/object', {hello: 'b'}, {ifMatch: row.etag})]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    // Windows exposes synthesized POSIX mode bits; chmod is checked on Unix.
    if(process.platform!=='win32')assert.equal((await stat(directory)).mode & 0o777, 0o700);
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test('browser router requires verified identity and same-origin owner consent; preview draft route is distinct from preview source', async () => {
  const tasks = [], service = createWorkspaceService({store: createMemoryStore(), schedule: p => tasks.push(p)});
  const router = createWorkbenchRouter({service, authenticate: async request => request.headers.get('authorization') === 'Bearer owner' ? alice : null, allowedHosts: ['studio.test'], allowedOrigins: ['https://studio.test']});
  const request = (path, body, options = {}) => router(new Request(`https://studio.test/api/developer${path}`, {method: body ? 'POST' : 'GET', headers: {Authorization: 'Bearer owner', ...(body ? {Origin: 'https://studio.test', 'Content-Type': 'application/json'} : {}), ...options.headers}, ...(body ? {body: JSON.stringify(body)} : {}), ...options}));
  const anon = await router(new Request('https://studio.test/api/developer/status', {headers: {'oai-authenticated-user-id': alice.id}})); assert.equal(anon.status, 401);
  const forgedOrigin = await router(new Request('https://studio.test/api/developer/call', {method: 'POST', headers: {Authorization: 'Bearer owner', Origin: 'https://evil.test'}, body: '{}'})); assert.equal(forgedOrigin.status, 403);
  const ws = (await service.dispatch(alice, 'saverift_workspace_create', {template: 'synthetic-json', name: 'Router fixture'})).workspace;
  const job = await service.dispatch(alice, 'saverift_plugin_build', {workspaceId: ws.id, expectedRevision: ws.revision}); await Promise.all(tasks);
  const status = await service.dispatch(alice, 'saverift_job_status', {workspaceId: ws.id, jobId: job.jobId});
  const preview = await service.dispatch(alice, 'saverift_preview_open', {workspaceId: ws.id, artifactId: status.job.result.artifactId, fixtureIds: ws.fixtures.map(f => f.id)});
  const source = await (await request(`/previews/${preview.previewId}`)).json(); assert.ok(source.package.files['ui/entry.js']);
  const initial = await (await request(`/previews/${preview.previewId}/draft`)).json(); assert.equal(initial.draft.revision, 0); assert.equal(initial.package, undefined);
  const staged = await (await request(`/previews/${preview.previewId}/draft`, {method: 'stage', params: {expectedRevision: 0, operations: [{id: 'synthetic.level.set', apiVersion: '0.1.0', params: {level: 15}}]}})).json(); assert.equal(staged.draft.revision, 1);
  const stale = await request(`/previews/${preview.previewId}/draft`, {method: 'stage', params: {expectedRevision: 0, operations: [{id: 'synthetic.level.set', apiVersion: '0.1.0', params: {level: 18}}]}}); assert.equal(stale.status, 400);
  const again = await service.readPreviewDraft(alice, preview.previewId); assert.equal(again.operations[0].params.level, 15);
});
