import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {setTimeout as pause} from 'node:timers/promises';
import {readFile} from 'node:fs/promises';
import {UI_PROTOCOL, UI_METHODS, assertUiJson, createUiPortHost, createUiPortClient, bindPluginFrame, connectPluginUi, createUiAsset} from '../sdk/ui-bridge.mjs';
import {createFrameDocument, PLUGIN_FRAME_SANDBOX, PLUGIN_FRAME_PERMISSIONS} from '../ui/frame-document.mjs';

function pair(handlers = {}, options = {}) {
  const channel = new MessageChannel(), instanceId = 'test-instance';
  const violations = [];
  const host = createUiPortHost({port: channel.port1, instanceId, handlers, onViolation: error => violations.push(error), ...options});
  const client = createUiPortClient({port: channel.port2, instanceId, limits: {timeoutMs: 200}});
  return {host, client, violations, close() { host.close(); client.close(); }};
}

test('custom UI queries arbitrary game domains and stages intent with CAS, never publication', async () => {
  const draft = {revision: 'r1', baseBundleDigest: 'base', executionLockDigest: 'lock', operations: []};
  const p = pair({getContext: () => ({game: {identity: 'synthetic'}, theme: 'emerald'}), query: input => ({method: input.method, factions: [{id: 'guild', reputation: 8}]}), stage: params => { assert.equal(params.expectedRevision, 'r1'); draft.operations.push({instanceId: 'op1', operation: params.operation}); return {...draft, revision: 'r2'}; }, getDraft: () => draft, subscribeDraft: () => draft});
  try {
    assert.equal((await p.client.query({method: 'community.factions.inspect', args: {limit: 20}})).factions[0].id, 'guild');
    const next = await p.client.stage({expectedRevision: 'r1', operation: {id: 'community.factions.change', apiVersion: '0.1.0', params: {value: 20}}});
    assert.equal(next.revision, 'r2');
    assert.equal(next.operations[0].operation.id, 'community.factions.change');
    await assert.rejects(p.client.request('publish', {}), {code: 'UI_METHOD_UNAVAILABLE'});
    assert.ok(!UI_METHODS.some(name => /send|token|fetch|publish|write/i.test(name)));
  } finally { p.close(); }
});

test('strict JSON bounds reject nonfinite, binary, prototypes, depth and oversized payloads', () => {
  for (const value of [Infinity, undefined, 1n, new Date(), new Uint8Array(4), {nested: NaN}, JSON.parse('{"__proto__":{}}')]) assert.throws(() => assertUiJson(value), /JSON|keys/);
  let nested = {}; for (let i = 0; i < 30; i++) nested = {nested};
  assert.throws(() => assertUiJson(nested), {code: 'UI_MESSAGE_LIMIT'});
  assert.throws(() => assertUiJson({value: 'a'.repeat(129 * 1024)}), {code: 'UI_MESSAGE_LIMIT'});
  assert.throws(() => assertUiJson(Object.defineProperty({}, 'value', {enumerable: true, get() { throw Error('getter must not run'); }})), /accessors/);
});

test('port instance mismatch, replay and unauthorized writer method revoke without dispatch', async () => {
  for (const mutate of [value => ({...value, instanceId: 'stale'}), value => ({...value, sequence: 2}), value => ({...value, method: 'cloud.write'})]) {
    const channel = new MessageChannel(), violations = []; let calls = 0;
    const host = createUiPortHost({port: channel.port1, instanceId: 'bound', handlers: {query: () => calls++}, onViolation: error => violations.push(error)});
    channel.port2.postMessage(mutate({protocol: UI_PROTOCOL, instanceId: 'bound', sequence: 1, type: 'request', requestId: 'r1', method: 'query', params: {}}));
    await pause(15); assert.equal(calls, 0); assert.equal(host.closed, true); assert.equal(violations.length, 1); channel.port2.close();
  }
});

test('a repeated request id revokes even with a fresh sequence number', async () => {
  const channel = new MessageChannel(); let calls = 0;
  const host = createUiPortHost({port: channel.port1, instanceId: 'bound', handlers: {query: () => { calls++; return {}; }}});
  const message = {protocol: UI_PROTOCOL, instanceId: 'bound', sequence: 1, type: 'request', requestId: 'r1', method: 'query', params: {}};
  channel.port2.postMessage(message); await pause(10);
  channel.port2.postMessage({...message, sequence: 2}); await pause(10);
  assert.equal(calls, 1); assert.equal(host.closed, true); channel.port2.close();
});

test('cancellation reaches the handler and a late response cannot settle the request', async () => {
  let aborted = false;
  const p = pair({query: (_, {signal}) => new Promise(resolve => { signal.addEventListener('abort', () => { aborted = true; resolve({late: true}); }); })});
  const abort = new AbortController();
  try {
    const pending = p.client.query({method: 'example.slow', args: {}}, {signal: abort.signal});
    await pause(10); abort.abort();
    await assert.rejects(pending, {code: 'UI_CANCELLED'}); await pause(10); assert.equal(aborted, true);
  } finally { p.close(); }
});

test('revocation rejects pending requests and prevents stale completion', async () => {
  const p = pair({query: () => new Promise(() => {})});
  const pending = p.client.query({method: 'example.slow', args: {}});
  p.host.close('UI_SELECTION_CHANGED');
  await assert.rejects(pending, {code: 'UI_REVOKED'});
  await assert.rejects(p.client.getDraft(), {code: 'UI_CLOSED'}); p.close();
});

test('draft subscriptions are scoped and listener removal works', async () => {
  const p = pair({subscribeDraft: () => ({revision: 'r1'})}), values = [];
  try {
    const unsubscribe = p.client.onDraft(value => values.push(value.revision));
    await p.client.subscribeDraft(); p.host.notifyDraft({revision: 'r2'}); await pause(10);
    unsubscribe(); p.host.notifyDraft({revision: 'r3'}); await pause(10);
    assert.deepEqual(values, ['r2']);
  } finally { p.close(); }
});

class Events {
  listeners = new Set();
  addEventListener(type, fn) { if (type === 'message') this.listeners.add(fn); }
  removeEventListener(type, fn) { this.listeners.delete(fn); }
  emit(event) { for (const listener of [...this.listeners]) listener(event); }
}
test('opaque-origin handshake binds the exact frame source and is one-use', () => {
  const events = new Events(), transfers = [], violations = [], frame = {postMessage: (...args) => transfers.push(args)};
  const binding = bindPluginFrame({frameWindow: frame, eventTarget: events, instanceId: 'frame1', MessageChannelClass: MessageChannel, handlers: {}, onViolation: error => violations.push(error)});
  const ready = {protocol: UI_PROTOCOL, instanceId: 'frame1', type: 'ready'};
  events.emit({source: {}, origin: 'null', data: ready}); assert.equal(transfers.length, 0);
  events.emit({source: frame, origin: 'null', data: ready}); assert.equal(transfers.length, 1); assert.equal(transfers[0][2].length, 1); assert.equal(binding.connected, true);
  events.emit({source: frame, origin: 'null', data: ready}); assert.equal(binding.connected, false); assert.equal(violations[0].code, 'UI_HANDSHAKE_REPLAY');
  transfers[0][2][0].close(); binding.revoke();
});
test('same-origin frame configuration is rejected instead of trusting origin null from any sender', () => {
  const events = new Events(), frame = {postMessage: () => assert.fail('must not transfer')};
  const binding = bindPluginFrame({frameWindow: frame, eventTarget: events, instanceId: 'frame1', handlers: {}});
  events.emit({source: frame, origin: 'https://saverift.com', data: {protocol: UI_PROTOCOL, instanceId: 'frame1', type: 'ready'}});
  assert.equal(binding.connected, false); assert.equal(events.listeners.size, 0);
});
test('child accepts a port only from its exact parent and configured host origin', async () => {
  const child = new Events(), parent = {postMessage() {}}, channel = new MessageChannel(); child.parent = parent;
  const pending = connectPluginUi({windowObject: child, hostOrigin: 'https://saverift.com', instanceId: 'frame1', timeoutMs: 200});
  const message = {data: {protocol: UI_PROTOCOL, instanceId: 'frame1', type: 'connect'}, ports: [channel.port2]};
  child.emit({...message, source: {}, origin: 'https://saverift.com'});
  child.emit({...message, source: parent, origin: 'https://attacker.invalid'});
  assert.equal(child.listeners.size, 1);
  child.emit({...message, source: parent, origin: 'https://saverift.com'});
  const client = await pending; client.close(); channel.port1.close(); assert.equal(child.listeners.size, 0);
});
test('frame content pins executable hashes and has no same-origin or network permissions', async () => {
  const document = await createFrameDocument({script: "document.querySelector('#root').textContent='Custom game graph';", css: 'body{background:#081113}', hostOrigin: 'https://saverift.com', instanceId: 'frame1'});
  assert.equal(PLUGIN_FRAME_SANDBOX, 'allow-scripts');
  assert.match(document, /script-src &#39;sha256-/); assert.match(document, /connect-src &#39;none&#39;/); assert.match(document, /worker-src &#39;none&#39;/); assert.match(document, /base-uri &#39;none&#39;/);
  assert.ok(!/allow-same-origin|allow-forms|allow-popups|unsafe-eval/.test(document)); assert.match(PLUGIN_FRAME_PERMISSIONS, /camera 'none'/);
  await assert.rejects(createFrameDocument({script: '</script><script>bad()</script>', hostOrigin: 'https://saverift.com', instanceId: 'frame1'}));
});

test('pinned binary assets use the dedicated port without base64 and verify the digest', async () => {
  const original = new TextEncoder().encode('{"items":[{"id":"example"}]}');
  const p = pair({resolveAsset: ({assetId}) => { assert.equal(assetId, 'catalog:example'); return createUiAsset({id: assetId, mimeType: 'application/json', bytes: original}); }});
  try { const asset = await p.client.resolveAsset({assetId: 'catalog:example'}); assert.deepEqual(asset.bytes, original); assert.equal(asset.byteLength, original.length); assert.equal(asset.mimeType, 'application/json'); assert.equal(original.byteLength, 28); }
  finally { p.close(); }
});
test('binary response wrong digest, byte length, MIME, sequence or unrelated correlation revokes', async () => {
  for (const mutate of [message => ({...message, asset: {...message.asset, sha256: '0'.repeat(64)}}), message => ({...message, asset: {...message.asset, byteLength: 999}}), message => ({...message, asset: {...message.asset, mimeType: 'text/html'}}), message => ({...message, sequence: 2}), message => ({...message, requestId: 'unknown'})]) {
    const channel = new MessageChannel(), client = createUiPortClient({port: channel.port2, instanceId: 'asset-test', limits: {timeoutMs: 200}});
    channel.port1.addEventListener('message', async event => {
      const request = event.data; if (request.type !== 'request') return;
      const asset = await createUiAsset({id: 'catalog:example', mimeType: 'application/json', bytes: new TextEncoder().encode('{}')});
      const bytes = new Uint8Array([123, 125]).buffer;
      channel.port1.postMessage(mutate({protocol: UI_PROTOCOL, instanceId: 'asset-test', sequence: 1, type: 'asset', requestId: request.requestId, asset: asset.asset, bytes}));
    }); channel.port1.start();
    await assert.rejects(client.resolveAsset({assetId: 'catalog:example'}), error => ['UI_ASSET_INVALID', 'UI_ASSET_DIGEST', 'UI_MESSAGE_BINDING'].includes(error.code)); client.close(); channel.port1.close();
  }
});
test('binary host enforces whole-session budget and never emits assets for query methods', async () => {
  const make = () => createUiAsset({id: 'asset:icon', mimeType: 'image/png', bytes: new Uint8Array(20)});
  const p = pair({resolveAsset: make, query: make}, {limits: {maxAssetBytes: 30, maxAssetTotalBytes: 30}});
  try {
    assert.equal((await p.client.resolveAsset({assetId: 'asset:icon'})).byteLength, 20);
    await assert.rejects(p.client.resolveAsset({assetId: 'asset:other'}), {code: 'UI_ASSET_LIMIT'});
    await assert.rejects(p.client.query({method: 'wrong.asset', args: {}}), {code: 'UI_ASSET_LIMIT'});
  } finally { p.close(); }
});

test('trusted file import and download carry exact scoped descriptors without URLs or file bytes', async () => {
  const descriptor = {id: 'import:file1', logicalPath: 'upload/save.save', byteLength: 128, sha256: 'a'.repeat(64)};
  const p = pair({requestFileImport: params => { assert.deepEqual(params, {purpose: 'native-save-inspection', maxFiles: 2, maxTotalBytes: 4 * 1024 * 1024}); return {schema: 'saverift.file-import.v1', source: 'user_upload', importId: 'import:scope1', files: [descriptor], retained: false}; }, requestDownload: params => { assert.equal(params.artifactId, 'export:copy1'); assert.equal(params.expectedSha256, 'b'.repeat(64)); return {state: 'downloaded'}; }});
  try {
    const selected = await p.client.requestFileImport({purpose: 'native-save-inspection', maxFiles: 2, maxTotalBytes: 4 * 1024 * 1024});
    assert.deepEqual(selected.files, [descriptor]);
    const result = await p.client.requestDownload({artifactId: 'export:copy1', filename: 'native-save.save', expectedSha256: 'b'.repeat(64), expectedByteLength: 128, purpose: 'native-format-copy'});
    assert.equal(result.state, 'downloaded');
    await assert.rejects(p.client.requestFileImport({purpose: 'native-save-inspection', maxFiles: 3, maxTotalBytes: 1}), {code: 'UI_FILE_IMPORT_INVALID'});
    await assert.rejects(p.client.requestDownload({artifactId: 'https://files.example/save', filename: 'copy.save', expectedSha256: 'b'.repeat(64), expectedByteLength: 128, purpose: 'native-format-copy'}), {code: 'UI_DOWNLOAD_INVALID'});
    await assert.rejects(p.client.requestDownload({artifactId: 'export:copy1', filename: '../copy.save', expectedSha256: 'b'.repeat(64), expectedByteLength: 128, purpose: 'native-format-copy'}), {code: 'UI_DOWNLOAD_INVALID'});
  } finally { p.close(); }
});
test('host import result cannot smuggle raw file bytes or claim a live Xbox source', async () => {
  for (const result of [{schema: 'saverift.file-import.v1', source: 'live', importId: 'import:one', files: [], retained: false}, {schema: 'saverift.file-import.v1', source: 'user_upload', importId: 'import:one', files: [{id: 'file:1', logicalPath: 'save.save', byteLength: 128, sha256: 'a'.repeat(64), dataBase64: 'AAAA'}], retained: false}]) {
    const p = pair({requestFileImport: () => result});
    try { await assert.rejects(p.client.requestFileImport({purpose: 'native-save-inspection', maxFiles: 2, maxTotalBytes: 4194304}), {code: 'UI_FILE_IMPORT_RESULT_INVALID'}); } finally { p.close(); }
  }
});
test('file-dialog methods default to explicit unavailable and closing the UI aborts host work', async () => {
  const absent = pair();
  try { await assert.rejects(absent.client.requestFileImport({purpose: 'native-save-inspection', maxFiles: 2, maxTotalBytes: 4194304}), {code: 'UI_METHOD_UNAVAILABLE'}); } finally { absent.close(); }
  let aborted = false;
  const p = pair({requestFileImport: (_, {signal}) => new Promise(() => { signal.addEventListener('abort', () => { aborted = true; }); })});
  const pending = p.client.requestFileImport({purpose: 'native-save-inspection', maxFiles: 2, maxTotalBytes: 4194304});
  await pause(10); p.client.close(); await assert.rejects(pending, {code: 'UI_CLOSED'}); await pause(10);
  assert.equal(aborted, true); assert.equal(p.host.closed, true); p.close();
});
test('React renderer installs the exact frame binding during layout before child message tasks', async () => {
  const source = await readFile(new URL('../ui/PluginFrame.jsx', import.meta.url), 'utf8');
  assert.match(source, /useLayoutEffect\(\(\) => \{\s*if \(!state\.document \|\| !frame\.current\) return;/);
  const binding = source.slice(source.indexOf('useLayoutEffect(() =>'), source.indexOf('}, [state.document, state.instanceId]'));
  assert.match(binding, /const bound = bindPluginFrame\(\{frameWindow: frame\.current\.contentWindow/); assert.match(binding, /bound\.revoke\('UI_UNMOUNTED'\)/); assert.doesNotMatch(binding, /useLayoutEffect\(async|requestAnimationFrame|setTimeout\([^)]*bindPluginFrame/);
});
