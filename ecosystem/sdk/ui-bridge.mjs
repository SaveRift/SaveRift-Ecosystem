/** Framework-neutral, capability-limited custom-view bridge. No cloud or account API. */
export const UI_PROTOCOL = 'saverift.ui.v1';
export const UI_METHODS = Object.freeze(['getContext', 'query', 'stage', 'removeOperation', 'reorderOperations', 'getDraft', 'subscribeDraft', 'catalogQuery', 'resolveAsset', 'openReview', 'requestFileImport', 'requestDownload', 'resize', 'announce']);
export const UI_LIMITS = Object.freeze({maxBytes: 128 * 1024, maxDepth: 24, maxNodes: 12000, maxInflight: 16, timeoutMs: 30000, maxAssetBytes: 4 * 1024 * 1024, maxAssetTotalBytes: 8 * 1024 * 1024});
const methodSet = new Set(UI_METHODS);
const assetTag = Symbol('saverift-ui-asset');
const assetMimes = new Set(['application/json', 'text/plain', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
const digestHex = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
const validAssetId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:/-]{1,240}$/.test(value) && !value.includes('://') && !value.split('/').some(part => part === '..');
/** Host-side: only call for an asset already resolved from the immutable lock. */
export async function createUiAsset({id, mimeType, bytes, sha256}) {
  if (!validAssetId(id) || !assetMimes.has(mimeType) || !(bytes instanceof Uint8Array) || bytes.byteLength > UI_LIMITS.maxAssetBytes) throw failure('UI_ASSET_INVALID', 'The pinned asset is unavailable or exceeds its limit.');
  const copy = new Uint8Array(bytes), actual = await digestHex(copy);
  if (sha256 && sha256 !== actual) throw failure('UI_ASSET_DIGEST', 'The pinned asset digest does not match.');
  return {[assetTag]: true, asset: {id, mimeType, byteLength: copy.byteLength, sha256: actual}, bytes: copy};
}
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exactKeys = (value, keys) => record(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const safeFileName = value => typeof value === 'string' && value.length > 0 && value.length <= 180 && !/[\u0000-\u001f\u007f/\\]/.test(value) && !/^\.+$/.test(value);
const logicalFile = value => typeof value === 'string' && value.length > 0 && value.length <= 240 && !value.startsWith('/') && !/[\u0000-\u001f\u007f\\:]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
const sha256Value = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** File dialogs are trusted-host actions with exact descriptor-only contracts. */
export function assertUiMethodParams(method, params) {
  if (method === 'requestFileImport' && (!exactKeys(params, ['purpose', 'maxFiles', 'maxTotalBytes']) || params.purpose !== 'native-save-inspection' || !Number.isSafeInteger(params.maxFiles) || params.maxFiles < 1 || params.maxFiles > 2 || !Number.isSafeInteger(params.maxTotalBytes) || params.maxTotalBytes < 1 || params.maxTotalBytes > 4 * 1024 * 1024)) throw failure('UI_FILE_IMPORT_INVALID', 'Choose one or two native files totaling no more than 4 MiB.');
  if (method === 'requestDownload' && (!exactKeys(params, ['artifactId', 'filename', 'expectedSha256', 'expectedByteLength', 'purpose']) || params.purpose !== 'native-format-copy' || !validAssetId(params.artifactId) || !safeFileName(params.filename) || !sha256Value(params.expectedSha256) || !Number.isSafeInteger(params.expectedByteLength) || params.expectedByteLength < 1 || params.expectedByteLength > 4 * 1024 * 1024)) throw failure('UI_DOWNLOAD_INVALID', 'Only a checked native artifact can be downloaded.');
  return params;
}
function assertFileResult(method, result, params) {
  if (method === 'requestFileImport') {
    if (result === null) return;
    if (!exactKeys(result, ['schema', 'source', 'importId', 'files', 'retained']) || result.schema !== 'saverift.file-import.v1' || result.source !== 'user_upload' || !validAssetId(result.importId) || result.retained !== false || !Array.isArray(result.files) || result.files.length < 1 || result.files.length > params.maxFiles) throw failure('UI_FILE_IMPORT_RESULT_INVALID', 'The host did not return a scoped file selection.');
    let total = 0; const ids = new Set(), names = new Set();
    for (const file of result.files) {
      if (!exactKeys(file, ['id', 'logicalPath', 'byteLength', 'sha256']) || !validAssetId(file.id) || !logicalFile(file.logicalPath) || !Number.isSafeInteger(file.byteLength) || file.byteLength < 1 || !sha256Value(file.sha256) || ids.has(file.id) || names.has(file.logicalPath.toLowerCase())) throw failure('UI_FILE_IMPORT_RESULT_INVALID', 'The host returned invalid file descriptors.');
      ids.add(file.id); names.add(file.logicalPath.toLowerCase()); total += file.byteLength;
    }
    if (total > params.maxTotalBytes) throw failure('UI_FILE_IMPORT_RESULT_INVALID', 'The selected files exceed the import budget.');
  }
  if (method === 'requestDownload' && (!exactKeys(result, ['state']) || !['downloaded', 'cancelled', 'unavailable'].includes(result.state))) throw failure('UI_DOWNLOAD_RESULT_INVALID', 'The host did not confirm the artifact download.');
}

export class UiBridgeError extends Error {
  constructor(code, message) { super(message); this.name = 'UiBridgeError'; this.code = code; }
}
const failure = (code, message) => new UiBridgeError(code, message);

/** Validate structured-clone input before JSON encoding; reject binary and exotic values. */
export function assertUiJson(value, overrides = {}) {
  const limits = {...UI_LIMITS, ...overrides};
  let nodes = 0;
  const seen = new Set();
  function visit(item, depth) {
    if (++nodes > limits.maxNodes || depth > limits.maxDepth) throw failure('UI_MESSAGE_LIMIT', 'The plugin message exceeds the allowed shape.');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (!Array.isArray(item) && !record(item)) throw failure('UI_MESSAGE_INVALID', 'The plugin message must contain JSON values.');
    if (seen.has(item)) throw failure('UI_MESSAGE_INVALID', 'The plugin message must not contain cycles.');
    seen.add(item);
    if (Array.isArray(item)) { for (let i = 0; i < item.length; i++) { if (!(i in item)) throw failure('UI_MESSAGE_INVALID', 'Sparse arrays are not supported.'); visit(item[i], depth + 1); } }
    else for (const key of Object.keys(item)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw failure('UI_MESSAGE_INVALID', 'Unsafe object keys are not supported.');
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !('value' in descriptor)) throw failure('UI_MESSAGE_INVALID', 'Object accessors are not supported.');
      visit(descriptor.value, depth + 1);
    }
    seen.delete(item);
  }
  visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > limits.maxBytes) throw failure('UI_MESSAGE_LIMIT', 'The plugin message exceeds the byte limit.');
  return value;
}

function listen(port, listener) {
  const wrapped = event => listener(event.data);
  port.addEventListener('message', wrapped);
  port.start?.();
  return () => port.removeEventListener('message', wrapped);
}
function envelope(data, instanceId, previousSequence, limits) {
  assertUiJson(data, limits);
  if (!record(data) || data.protocol !== UI_PROTOCOL || data.instanceId !== instanceId || !Number.isSafeInteger(data.sequence) || data.sequence !== previousSequence + 1) throw failure('UI_MESSAGE_BINDING', 'The plugin message is stale or belongs to another view.');
}
function safeError(error) {
  return {code: typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code) ? error.code : 'UI_REQUEST_FAILED', message: error?.publicMessage || (error instanceof UiBridgeError ? error.message : 'This plugin request could not be completed.')};
}

/** Bind a private MessagePort to an explicit host handler allowlist. */
export function createUiPortHost({port, instanceId, handlers = {}, limits = {}, onViolation = () => {}, onClose = () => {}}) {
  if (!validId(instanceId)) throw failure('UI_INSTANCE_INVALID', 'A bound plugin instance is required.');
  const cap = {...UI_LIMITS, ...limits}, active = new Map(), usedIds = new Set();
  let closed = false, incoming = 0, outgoing = 0, assetBytes = 0;
  function send(value) {
    if (closed) return;
    const message = {...value, protocol: UI_PROTOCOL, instanceId, sequence: outgoing + 1};
    assertUiJson(message, cap); outgoing++; port.postMessage(message);
  }
  function close(reason = 'UI_CLOSED') {
    if (closed) return;
    try { send({type: 'revoked', reason}); } catch {}
    closed = true; stop();
    for (const controller of active.values()) controller.abort(reason);
    active.clear(); usedIds.clear(); port.close(); onClose(reason);
  }
  const stop = listen(port, data => {
    if (closed) return;
    try {
      envelope(data, instanceId, incoming, cap); incoming = data.sequence;
      if (data.type === 'close') { close('UI_CLIENT_CLOSED'); return; }
      if (data.type === 'cancel') {
        if (!validId(data.requestId)) throw failure('UI_REQUEST_INVALID', 'An exact request identifier is required.');
        active.get(data.requestId)?.abort('UI_CANCELLED'); return;
      }
      if (data.type !== 'request' || !validId(data.requestId) || usedIds.has(data.requestId) || !methodSet.has(data.method) || !record(data.params)) throw failure('UI_REQUEST_INVALID', 'The plugin requested an unavailable method or replayed a request.');
      assertUiMethodParams(data.method, data.params);
      usedIds.add(data.requestId);
      if (usedIds.size > 100000) throw failure('UI_SESSION_LIMIT', 'Reopen this view to continue.');
      if (active.size >= cap.maxInflight) { send({type: 'response', requestId: data.requestId, ok: false, error: {code: 'UI_BUSY', message: 'Wait for the current plugin requests to finish.'}}); return; }
      const controller = new AbortController(); active.set(data.requestId, controller);
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw failure('UI_CANCELLED', 'The plugin request was cancelled.');
        if (typeof handlers[data.method] !== 'function') throw failure('UI_METHOD_UNAVAILABLE', 'This host does not provide that plugin method.');
        return handlers[data.method](data.params, {signal: controller.signal, instanceId, requestId: data.requestId});
      }).then(result => {
        if (closed || controller.signal.aborted) return;
        assertFileResult(data.method, result ?? null, data.params);
        if (result?.[assetTag] === true) {
          if (data.method !== 'resolveAsset' || result.asset.byteLength > cap.maxAssetBytes || assetBytes + result.asset.byteLength > cap.maxAssetTotalBytes) throw failure('UI_ASSET_LIMIT', 'The asset transfer budget was reached.');
          const message = {type: 'asset', requestId: data.requestId, asset: result.asset, protocol: UI_PROTOCOL, instanceId, sequence: outgoing + 1};
          assertUiJson(message, cap); assetBytes += result.asset.byteLength; outgoing++;
          const bytes = result.bytes.buffer; port.postMessage({...message, bytes}, [bytes]); return;
        }
        send({type: 'response', requestId: data.requestId, ok: true, result: result ?? null});
      }).catch(error => {
        if (!closed && !controller.signal.aborted) { try { send({type: 'response', requestId: data.requestId, ok: false, error: safeError(error)}); } catch (cause) { onViolation(cause); close(cause.code); } }
      }).finally(() => active.delete(data.requestId));
    } catch (error) { onViolation(error); close(error.code || 'UI_MESSAGE_INVALID'); }
  });
  return {
    close,
    notifyDraft(value) { send({type: 'event', event: 'draft', value}); },
    notifyContext(value) { send({type: 'event', event: 'context', value}); },
    get closed() { return closed; },
  };
}

/** Client usable by React, canvas, vanilla JS, or a contributor's own framework. */
export function createUiPortClient({port, instanceId, limits = {}, onViolation = () => {}}) {
  if (!validId(instanceId)) throw failure('UI_INSTANCE_INVALID', 'A bound plugin instance is required.');
  const cap = {...UI_LIMITS, ...limits}, pending = new Map(), draftListeners = new Set(), contextListeners = new Set();
  let incoming = 0, outgoing = 0, closed = false, nextId = 0, assetBytes = 0;
  function send(value) {
    if (closed) throw failure('UI_CLOSED', 'This plugin view is closed.');
    const message = {...value, protocol: UI_PROTOCOL, instanceId, sequence: outgoing + 1};
    assertUiJson(message, cap); outgoing++; port.postMessage(message);
  }
  function close(reason = 'UI_CLOSED') {
    if (closed) return;
    try { send({type: 'close'}); } catch {}
    closed = true; stop(); port.close();
    for (const item of pending.values()) { clearTimeout(item.timer); item.detach(); item.reject(failure(reason, 'This plugin view is closed.')); }
    pending.clear(); draftListeners.clear(); contextListeners.clear();
  }
  const stop = listen(port, data => {
    if (closed) return;
    try {
      if (data?.type === 'asset') {
        const {bytes, ...metadata} = data;
        envelope(metadata, instanceId, incoming, cap); incoming = data.sequence;
        const item = pending.get(data.requestId), asset = data.asset;
        if (!item || item.receivingAsset || item.method !== 'resolveAsset' || !(bytes instanceof ArrayBuffer) || !record(asset) || !validAssetId(asset.id) || !assetMimes.has(asset.mimeType) || !Number.isSafeInteger(asset.byteLength) || asset.byteLength !== bytes.byteLength || asset.byteLength > cap.maxAssetBytes || assetBytes + asset.byteLength > cap.maxAssetTotalBytes || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw failure('UI_ASSET_INVALID', 'The asset response is invalid or unbound.');
        item.receivingAsset = true;
        assetBytes += asset.byteLength;
        digestHex(bytes).then(actual => {
          if (closed || pending.get(data.requestId) !== item) return;
          if (actual !== asset.sha256) { onViolation(failure('UI_ASSET_DIGEST', 'The asset digest does not match.')); close('UI_ASSET_DIGEST'); return; }
          pending.delete(data.requestId); clearTimeout(item.timer); item.detach(); item.resolve({...asset, bytes: new Uint8Array(bytes)});
        }).catch(() => close('UI_ASSET_INVALID'));
        return;
      }
      envelope(data, instanceId, incoming, cap); incoming = data.sequence;
      if (data.type === 'revoked') { close('UI_REVOKED'); return; }
      if (data.type === 'event' && ['draft', 'context'].includes(data.event)) {
        const listeners = data.event === 'draft' ? draftListeners : contextListeners;
        for (const listener of listeners) { try { listener(data.value); } catch {} } return;
      }
      if (data.type !== 'response' || !validId(data.requestId) || typeof data.ok !== 'boolean') throw failure('UI_RESPONSE_INVALID', 'The host response is invalid.');
      const item = pending.get(data.requestId);
      // A late response to a timed-out or cancelled request has no authority.
      if (!item) return;
      pending.delete(data.requestId); clearTimeout(item.timer); item.detach();
      if (data.ok) item.resolve(data.result);
      else item.reject(failure(data.error?.code || 'UI_REQUEST_FAILED', data.error?.message || 'This plugin request failed.'));
    } catch (error) { onViolation(error); close(error.code || 'UI_RESPONSE_INVALID'); }
  });
  function request(method, params = {}, {signal, timeoutMs = cap.timeoutMs} = {}) {
    if (!methodSet.has(method)) return Promise.reject(failure('UI_METHOD_UNAVAILABLE', 'The UI bridge cannot perform that method.'));
    try { assertUiMethodParams(method, params); } catch (error) { return Promise.reject(error); }
    if (closed) return Promise.reject(failure('UI_CLOSED', 'This plugin view is closed.'));
    if (signal?.aborted) return Promise.reject(failure('UI_CANCELLED', 'The plugin request was cancelled.'));
    if (pending.size >= cap.maxInflight) return Promise.reject(failure('UI_BUSY', 'Wait for the current plugin requests to finish.'));
    const requestId = `ui-${++nextId}`;
    return new Promise((resolve, reject) => {
      const cancel = code => {
        const item = pending.get(requestId); if (!item) return;
        pending.delete(requestId); clearTimeout(item.timer); item.detach();
        try { send({type: 'cancel', requestId}); } catch {}
        reject(failure(code, code === 'UI_TIMEOUT' ? 'The plugin request timed out.' : 'The plugin request was cancelled.'));
      };
      const abort = () => cancel('UI_CANCELLED');
      const timer = setTimeout(() => cancel('UI_TIMEOUT'), Math.max(1, Math.min(timeoutMs, cap.timeoutMs)));
      const detach = () => signal?.removeEventListener('abort', abort);
      pending.set(requestId, {resolve, reject, timer, detach, method}); signal?.addEventListener('abort', abort, {once: true});
      try { send({type: 'request', requestId, method, params}); } catch (error) { pending.delete(requestId); clearTimeout(timer); detach(); reject(error); }
    });
  }
  const client = {request, close, onDraft(listener) { draftListeners.add(listener); return () => draftListeners.delete(listener); }, onContext(listener) { contextListeners.add(listener); return () => contextListeners.delete(listener); }};
  for (const method of UI_METHODS) client[method] = (params, options) => request(method, params, options);
  return client;
}

/** One-use source/origin-bound handshake, including opaque sandbox origins. */
export function bindPluginFrame({frameWindow, eventTarget = globalThis.window, instanceId, expectedOrigin = 'null', handlers, MessageChannelClass = globalThis.MessageChannel, onViolation, onReady = () => {}, onClose = () => {}}) {
  if (!frameWindow || !validId(instanceId) || !eventTarget) throw failure('UI_FRAME_INVALID', 'A plugin frame binding is required.');
  let host = null, revoked = false, connected = false;
  function revoke(reason = 'UI_REVOKED') { if (revoked) return; revoked = true; eventTarget.removeEventListener('message', receive); host?.close(reason); }
  function receive(event) {
    if (revoked || event.source !== frameWindow) return;
    const data = event.data;
    if (event.origin !== expectedOrigin || !record(data) || data.protocol !== UI_PROTOCOL || data.instanceId !== instanceId || data.type !== 'ready') { onViolation?.(failure('UI_HANDSHAKE_INVALID', 'The plugin frame handshake does not match.')); revoke('UI_HANDSHAKE_INVALID'); return; }
    if (connected) { onViolation?.(failure('UI_HANDSHAKE_REPLAY', 'The plugin frame handshake was replayed.')); revoke('UI_HANDSHAKE_REPLAY'); return; }
    try { assertUiJson(data, {maxBytes: 1024, maxDepth: 2}); } catch (error) { onViolation?.(error); revoke(error.code); return; }
    connected = true;
    const channel = new MessageChannelClass();
    host = createUiPortHost({port: channel.port1, instanceId, handlers, onViolation, onClose: reason => { revoke(reason); onClose(reason); }});
    // Opaque sandbox origins cannot be addressed with a concrete targetOrigin.
    // This port is sent to the already source-bound frame, never a broadcast.
    frameWindow.postMessage({protocol: UI_PROTOCOL, instanceId, type: 'connect'}, '*', [channel.port2]);
    onReady(host);
  }
  eventTarget.addEventListener('message', receive);
  return {revoke, get host() { return host; }, get connected() { return connected && !revoked; }};
}

export function connectPluginUi({windowObject = globalThis.window, hostOrigin, instanceId, timeoutMs = UI_LIMITS.timeoutMs} = {}) {
  const meta = name => windowObject?.document?.querySelector(`meta[name="${name}"]`)?.content;
  hostOrigin ||= meta('saverift-host-origin'); instanceId ||= meta('saverift-ui-instance');
  if (!windowObject || !validId(instanceId) || !/^https?:\/\/[^/]+$/.test(hostOrigin || '')) return Promise.reject(failure('UI_CONTEXT_INVALID', 'Open this plugin through a SaveRift workbench.'));
  return new Promise((resolve, reject) => {
    let settled = false;
    function finish(error, client) { if (settled) return; settled = true; clearTimeout(timer); clearInterval(retry); windowObject.removeEventListener('message', receive); error ? reject(error) : resolve(client); }
    function receive(event) {
      const data = event.data;
      if (event.source !== windowObject.parent || event.origin !== hostOrigin) return;
      if (!record(data) || data.protocol !== UI_PROTOCOL || data.instanceId !== instanceId || data.type !== 'connect' || event.ports?.length !== 1) return;
      finish(null, createUiPortClient({port: event.ports[0], instanceId}));
    }
    const timer = setTimeout(() => finish(failure('UI_HANDSHAKE_TIMEOUT', 'The plugin host did not connect.')), timeoutMs);
    const ready = () => windowObject.parent.postMessage({protocol: UI_PROTOCOL, type: 'ready', instanceId}, hostOrigin);
    const retry = setInterval(ready, 250);
    windowObject.addEventListener('message', receive);
    ready();
  });
}
