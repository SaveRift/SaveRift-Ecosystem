// SPDX-License-Identifier: Apache-2.0
const caches = new WeakMap();
const imageMimes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
const validAssetId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:/-]{1,240}$/.test(value) &&
  !value.includes('://') && !/^(?:data|blob):/i.test(value) && !value.split('/').some(part => part === '..');

/** Only the host can turn an immutable asset handle into verified image bytes. */
export async function resolveCatalogImage(client, assetId) {
  if (!validAssetId(assetId)) throw Error('A pinned image asset is required.');
  let cache = caches.get(client);
  if (!cache) { cache = new Map(); caches.set(client, cache); }
  if (!cache.has(assetId)) {
    const pending = Promise.resolve().then(() => client.resolveAsset({assetId})).then(asset => {
      if (asset?.id !== assetId || !imageMimes.has(asset.mimeType) || !(asset.bytes instanceof Uint8Array) ||
          asset.bytes.byteLength === 0 || asset.bytes.byteLength > 4 * 1024 * 1024 || asset.byteLength !== asset.bytes.byteLength) throw Error('The pinned preview is unavailable.');
      return {bytes: new Uint8Array(asset.bytes), mimeType: asset.mimeType};
    });
    cache.set(assetId, pending);
    pending.catch(() => { if (cache.get(assetId) === pending) cache.delete(assetId); });
  }
  const asset = await cache.get(assetId);
  const url = URL.createObjectURL(new Blob([asset.bytes], {type: asset.mimeType}));
  return {url, dispose: () => URL.revokeObjectURL(url)};
}
