// SPDX-License-Identifier: Apache-2.0
// Fixed pure computation only. This module has no file, network, account-key or
// signing-service capability. Each runner session owns and destroys its state.
import {createHash} from './crypto.mjs';
import {fail} from './contracts.mjs';

export const FORMAT_SHA256_LIMITS = Object.freeze({streams: 8, chunkBytes: 65536, textAsciiCodeUnits: 65536, textBmpCodeUnits: 16384, totalBytes: 128 * 1024 * 1024});

export function createFormatSha256Host({check}) {
  if (typeof check !== 'function') throw TypeError('A trusted execution-budget check is required.');
  const nonce = new Uint8Array(16); globalThis.crypto.getRandomValues(nonce);
  const prefix = Array.from(nonce, value => value.toString(16).padStart(2, '0')).join(''); nonce.fill(0);
  const streams = new Map(); let counter = 0, totalBytes = 0, peakStreams = 0, closed = false;
  function guard() {check(); if (closed) fail('FORMAT_HASH_CLOSED', 'The format hash session has closed.');}
  function selected(id) {
    if (typeof id !== 'string' || id.length > 64 || !streams.has(id)) fail('FORMAT_HASH_SCOPE_DENIED', 'This format hash stream is unavailable.');
    return streams.get(id);
  }
  return {
    init() {
      guard(); if (streams.size >= FORMAT_SHA256_LIMITS.streams) fail('FORMAT_HASH_STREAM_LIMIT', 'Too many format hash streams are active.');
      const id = `${prefix}:${++counter}`; streams.set(id, createHash('sha256')); peakStreams = Math.max(peakStreams, streams.size); check(); return id;
    },
    update(id, bytes) {
      guard(); const state = selected(id);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > FORMAT_SHA256_LIMITS.chunkBytes) fail('FORMAT_HASH_CHUNK_LIMIT', 'Format hash chunks are limited to 64 KiB.');
      if (totalBytes + bytes.byteLength > FORMAT_SHA256_LIMITS.totalBytes) fail('FORMAT_HASH_BYTE_LIMIT', 'The format hash session byte budget is exhausted.');
      totalBytes += bytes.byteLength; state.update(bytes); check();
    },
    final(id) {
      guard(); const state = selected(id); streams.delete(id);
      let result; try {result = state.digest();} finally {state.destroy();}
      check(); return result;
    },
    abort(id) {guard(); const state = selected(id); streams.delete(id); state.destroy(); check();},
    metrics() {return {cryptoBytes: totalBytes, cryptoPeakStreams: peakStreams, cryptoLiveStreams: streams.size};},
    close() {if (closed) return; closed = true; for (const state of streams.values()) state.destroy(); streams.clear();}
  };
}
