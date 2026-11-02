import {useEffect, useState} from 'react';
import {useCrimsonServices} from './bridge.jsx';
const caches = new WeakMap();
function resolveImage(client, assetId) {
  let cache = caches.get(client); if (!cache) { cache = new Map(); caches.set(client, cache); }
  if (!cache.has(assetId)) cache.set(assetId, client.resolveAsset({assetId}).then(value => {
    if (value?.bytes instanceof Uint8Array && /^image\/(?:png|webp|jpeg|gif|svg\+xml)$/.test(value.mimeType)) {
      const url = URL.createObjectURL(new Blob([value.bytes], {type: value.mimeType}));
      addEventListener('pagehide', () => URL.revokeObjectURL(url), {once: true}); return url;
    }
    if (typeof value?.dataUrl === 'string' && /^data:image\/(?:png|webp|jpeg|gif|svg\+xml);base64,/.test(value.dataUrl)) return value.dataUrl;
    throw Error('A pinned image asset is unavailable.');
  }));
  return cache.get(assetId);
}

/** Resolve only a pinned host asset handle; never make a network request in-frame. */
export function PluginImage({src, onError, ...props}) {
  const {client} = useCrimsonServices(), [resolved, setResolved] = useState(null);
  useEffect(() => {
    let active = true; setResolved(null);
    if (!src) return;
    if (/^(?:data:image\/(?:png|webp|jpeg|gif|svg\+xml);|blob:)/.test(src)) { setResolved(src); return; }
    resolveImage(client, src).then(value => {
      if (!active) return;
      setResolved(value);
    }).catch(() => { if (active) onError?.({currentTarget: {hidden: false}}); });
    return () => { active = false; };
  }, [src, client]);
  return resolved ? <img {...props} src={resolved} onError={onError}/> : null;
}
