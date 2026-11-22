// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCatalogImage} from '../ui/catalog-image.mjs';

test('previews resolve only immutable host handles and reuse verified bytes for repeated selections', async () => {
  let calls = 0;
  const client = {async resolveAsset({assetId}) { calls++; return {id: assetId, bytes: new Uint8Array([1, 2, 3]), byteLength: 3, mimeType: 'image/png'}; }};
  const first = await resolveCatalogImage(client, 'catalog:synthetic/icon'), second = await resolveCatalogImage(client, 'catalog:synthetic/icon');
  try { assert.equal(calls, 1); assert.match(first.url, /^blob:/); assert.match(second.url, /^blob:/); assert.notEqual(first.url, second.url); }
  finally { first.dispose(); second.dispose(); }
});

test('source image URLs and raw data URLs never become preview requests', async () => {
  let calls = 0; const client = {resolveAsset() { calls++; throw Error('Unexpected host call'); }};
  for (const id of ['https://example.invalid/image.webp', 'data:image/png;base64,YQ==', 'blob:arbitrary', 'asset/../private', null]) await assert.rejects(resolveCatalogImage(client, id));
  assert.equal(calls, 0);
});

test('a transient host image failure can recover on a later selection', async () => {
  let calls = 0;
  const client = {async resolveAsset({assetId}) {
    if (++calls === 1) throw Error('Temporarily unavailable');
    return {id: assetId, bytes: new Uint8Array([1]), byteLength: 1, mimeType: 'image/png'};
  }};
  await assert.rejects(resolveCatalogImage(client, 'asset:retry'));
  const image = await resolveCatalogImage(client, 'asset:retry');
  try { assert.equal(calls, 2); assert.match(image.url, /^blob:/); } finally { image.dispose(); }
});

test('preview resolver rejects a foreign ID, nonimage MIME, incorrect length or empty bytes', async () => {
  const base = {id: 'asset:icon', bytes: new Uint8Array([1]), byteLength: 1, mimeType: 'image/webp'};
  for (const change of [{id: 'asset:other'}, {mimeType: 'application/json'}, {byteLength: 2}, {bytes: new Uint8Array(), byteLength: 0}]) {
    await assert.rejects(resolveCatalogImage({resolveAsset: async () => ({...base, ...change})}, 'asset:icon'));
  }
});
