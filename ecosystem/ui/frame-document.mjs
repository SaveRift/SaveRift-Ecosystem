const htmlEscape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const base64 = bytes => { let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); };
async function hash(value) { return base64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }

/** Package code is bundled ahead of time. No executable dependency is fetched at runtime. */
export async function createFrameDocument({bodyHtml = '<div id="root"></div>', script, css = '', hostOrigin, instanceId, title = 'Game save editor'}) {
  if (typeof script !== 'string' || script.length > 8 * 1024 * 1024 || typeof css !== 'string' || css.length > 2 * 1024 * 1024 || typeof bodyHtml !== 'string' || bodyHtml.length > 128 * 1024) throw Error('The compiled UI package exceeds the frame limits.');
  const origin = new URL(hostOrigin);
  if (!['https:', 'http:'].includes(origin.protocol) || origin.origin !== hostOrigin || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(instanceId)) throw Error('A bound host origin and instance are required.');
  if (/<\/script/i.test(script) || /<\/style/i.test(css)) throw Error('Compile closing HTML tags as escaped JavaScript or CSS sequences.');
  const scriptHash = await hash(script), styleHash = await hash(css);
  // Inline style attributes preserve custom framework positioning. They cannot load
  // resources: all network/child contexts are blocked, and scripts remain exact-hash pinned.
  const csp = ["default-src 'none'", `script-src 'sha256-${scriptHash}'`, `style-src 'sha256-${styleHash}'`, "style-src-attr 'unsafe-inline'", "img-src data: blob:", "font-src data:", "media-src data: blob:", "connect-src 'none'", "worker-src 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; ');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + htmlEscape(csp) + '"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="saverift-host-origin" content="' + htmlEscape(hostOrigin) + '"><meta name="saverift-ui-instance" content="' + htmlEscape(instanceId) + '"><title>' + htmlEscape(title) + '</title><style>' + css + '</style></head><body>' + bodyHtml + '<script type="module">' + script + '</script></body></html>';
}

// Native submit/validation events must reach framework handlers. The enforced
// form-action 'none' policy still blocks every native form navigation.
export const PLUGIN_FRAME_SANDBOX = 'allow-scripts allow-forms';
export const PLUGIN_FRAME_PERMISSIONS = "accelerometer 'none'; autoplay 'none'; camera 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'; fullscreen 'none'; geolocation 'none'; gyroscope 'none'; hid 'none'; microphone 'none'; payment 'none'; publickey-credentials-get 'none'; serial 'none'; usb 'none'; xr-spatial-tracking 'none'";
