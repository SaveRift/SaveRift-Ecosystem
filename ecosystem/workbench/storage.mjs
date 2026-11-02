// SPDX-License-Identifier: Apache-2.0
// Object stores are private implementation dependencies, never MCP tools.
import {createHash, randomUUID} from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export class WorkbenchError extends Error {
  constructor(code, message, status = 400) { super(message); this.name = 'WorkbenchError'; this.code = code; this.status = status; }
}
export const fail = (code, message, status) => { throw new WorkbenchError(code, message, status); };
const clone = value => structuredClone(value);
const checkKey = key => {
  if (typeof key !== 'string' || key.length > 300 || !/^[a-z0-9_/-]+$/i.test(key) || key.split('/').some(p => !p || p === '.' || p === '..')) fail('INVALID_STORE_KEY', 'Invalid private object reference.');
};
const match = (prior, options) => {
  if (options.ifAbsent && prior || options.ifMatch !== undefined && prior?.etag !== options.ifMatch) fail('REVISION_CONFLICT', 'This object changed. Refresh before retrying.', 409);
};

export function createMemoryStore() {
  const rows = new Map();
  return {
    async get(key) { checkKey(key); return rows.has(key) ? clone(rows.get(key)) : null; },
    async put(key, value, options = {}) { checkKey(key); match(rows.get(key), options); const row = {value: clone(value), etag: randomUUID()}; rows.set(key, row); return clone(row); },
    async delete(key, options = {}) { checkKey(key); match(rows.get(key), options); rows.delete(key); },
    async list(prefix, limit = 100) { return [...rows].filter(([key]) => key.startsWith(prefix)).slice(0, limit).map(([key, row]) => ({key, ...clone(row)})); }
  };
}

// seal/unseal are supplied by the private host. Associated-data binding includes
// the namespaced object key, and conditional puts are enforced by R2 itself.
export function createR2Store({bucket, seal, unseal, prefix = 'developer-v1'}) {
  if (!bucket || typeof seal !== 'function' || typeof unseal !== 'function') throw Error('Encrypted R2 dependencies are required.');
  const keyFor = key => { checkKey(key); return `${prefix}/${key}`; };
  // Request-local parsed-text reuse. Every read still checks the current R2
  // etag; changed grants, consent, source and tombstones cannot hit old data.
  const cached = new Map(); let cachedBytes = 0;
  const forget = name => { const prior = cached.get(name); if (prior) cachedBytes -= prior.bytes; cached.delete(name); };
  function remember(name, etag, text) {
    forget(name); const bytes = text.length * 2;
    if (bytes < 16384 || bytes > 8 * 1024 * 1024) return;
    while (cached.size >= 16 || cachedBytes + bytes > 8 * 1024 * 1024) forget(cached.keys().next().value);
    cached.set(name, {etag, text, bytes}); cachedBytes += bytes;
  }
  async function get(key) {
    const name = keyFor(key), prior = cached.get(name), row = await bucket.get(name, prior ? {onlyIf: {etagDoesNotMatch: prior.etag}} : undefined);
    if (!row) { forget(name); return null; }
    try {
      if (typeof row.arrayBuffer !== 'function') {
        if (!prior || row.etag !== prior.etag) throw Error('Unexpected conditional object response.');
        return {etag: row.etag, value: JSON.parse(prior.text)};
      }
      forget(name);
      const text = new TextDecoder().decode(await unseal(new Uint8Array(await row.arrayBuffer()), name)), value = JSON.parse(text);
      remember(name, row.etag, text); return {etag: row.etag, value};
    }
    catch { fail('PRIVATE_OBJECT_INVALID', 'The private workspace object could not be verified.', 409); }
  }
  return {
    get,
    async put(key, value, options = {}) {
      const name = keyFor(key), bytes = new TextEncoder().encode(JSON.stringify(value));
      forget(name);
      const onlyIf = options.ifAbsent ? {etagDoesNotMatch: '*'} : options.ifMatch !== undefined ? {etagMatches: options.ifMatch} : undefined;
      const row = await bucket.put(name, await seal(bytes, name), {onlyIf, httpMetadata: {contentType: 'application/octet-stream'}});
      if (!row) fail('REVISION_CONFLICT', 'This workspace changed. Refresh before retrying.', 409);
      return {etag: row.etag, value: clone(value)};
    },
    async delete(key, options = {}) {
      // R2 delete has no conditional variant. Retain an encrypted tombstone so
      // fixture revocation/deletion cannot race a replacement of the same ID.
      return this.put(key, {deleted: true}, options);
    },
    async list(prefixKey, limit = 100) {
      const listingPrefix = prefixKey.endsWith('/') ? `${keyFor(prefixKey.slice(0, -1))}/` : keyFor(prefixKey);
      const listing = await bucket.list({prefix: listingPrefix, limit});
      const rows = await Promise.all(listing.objects.map(async o => ({key: o.key.slice(prefix.length + 1), ...await get(o.key.slice(prefix.length + 1))})));
      return rows.filter(row => !row.value?.deleted);
    }
  };
}
