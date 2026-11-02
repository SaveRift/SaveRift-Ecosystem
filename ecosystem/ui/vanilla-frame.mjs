import {bindPluginFrame} from '../sdk/ui-bridge.mjs';
import {createFrameDocument, PLUGIN_FRAME_SANDBOX, PLUGIN_FRAME_PERMISSIONS} from './frame-document.mjs';

const fail = code => { throw Object.assign(Error(code), {code}); };
const path = value => typeof value === 'string' && !value.startsWith('/') && !value.includes('\\') && value.split('/').every(part => part && part !== '.' && part !== '..') && !/[\u0000-\u001f:]/.test(value);
/** Read an explicit compiled UI descriptor, never discover scripts by parsing HTML. */
export function compileUiPackage({manifest, files}) {
  const ui = manifest?.ui;
  if (!ui || !path(ui.script) || !path(ui.css) || !path(ui.body)) fail('UI_COMPILED_ENTRY_REQUIRED');
  const read = name => {
    const value = files instanceof Map ? files.get(name) : files?.[name];
    if (typeof value === 'string') return value;
    if (value instanceof Uint8Array) return new TextDecoder('utf-8', {fatal: true}).decode(value);
    fail('UI_ENTRY_MISSING');
  };
  const bodyHtml = read(ui.body), script = read(ui.script), css = read(ui.css);
  if (/<\/?(?:script|style|meta|base|link|html|head)\b/i.test(bodyHtml)) fail('UI_BODY_UNBUNDLED');
  if (script.length > 8 * 1024 * 1024 || css.length > 2 * 1024 * 1024 || bodyHtml.length > 128 * 1024) fail('UI_PACKAGE_LIMIT');
  return {bodyHtml, script, css};
}

/** Framework-neutral counterpart to PluginFrame.jsx for the public local workbench. */
export async function mountPluginFrame({container, ui, packageIdentity, handlers, onReview = () => {}, onViolation = () => {}, onReady = () => {}, onClose = () => {}, hostOrigin = globalThis.location?.origin}) {
  const documentObject = container.ownerDocument, instanceId = crypto.randomUUID();
  const source = await createFrameDocument({...ui, hostOrigin, instanceId, title: packageIdentity.displayName || 'Game save editor'});
  const wrapper = documentObject.createElement('section'); wrapper.className = 'plugin-frame-shell';
  const chrome = documentObject.createElement('header'); chrome.className = 'plugin-frame-trust';
  const label = documentObject.createElement('span'); label.textContent = `${packageIdentity.displayName || packageIdentity.id} · ${packageIdentity.version} · by ${packageIdentity.author || 'Plugin author'}`;
  const trust = documentObject.createElement('span'); trust.textContent = 'Isolated game editor'; chrome.append(label, trust);
  const frame = documentObject.createElement('iframe'); frame.title = `${packageIdentity.displayName || 'Game'} custom editor`;
  frame.setAttribute('sandbox', PLUGIN_FRAME_SANDBOX); frame.setAttribute('allow', PLUGIN_FRAME_PERMISSIONS); frame.setAttribute('referrerpolicy', 'no-referrer'); frame.setAttribute('credentialless', '');
  frame.style.width = '100%'; frame.style.minHeight = '760px'; frame.style.border = '0';
  let binding, revoked = false, loads = 0;
  function showFault(error) {
    if (revoked) return; revoke('UI_FAILED');
    const message = documentObject.createElement('p'); message.className = 'plugin-frame-fault'; message.setAttribute('role', 'alert'); message.textContent = 'This game editor stopped. Your original and queued changes remain available.';
    wrapper.append(message); onViolation(error);
  }
  function revoke(reason = 'UI_REVOKED') { if (revoked) return; revoked = true; clearTimeout(timer); binding?.revoke(reason); frame.remove(); }
  // Set srcdoc before insertion so the initial document is the packaged one.
  frame.srcdoc = source;
  frame.addEventListener('load', () => { if (++loads > 1) showFault(Object.assign(Error('The plugin document navigated.'), {code: 'UI_NAVIGATED'})); });
  wrapper.append(chrome, frame); container.replaceChildren(wrapper);
  binding = bindPluginFrame({frameWindow: frame.contentWindow, eventTarget: documentObject.defaultView, instanceId, handlers: {...handlers, openReview: async params => { await onReview(params); return {opened: true}; }}, onViolation: showFault, onClose, onReady: host => {
    onReady(host);
  }});
  const timer = setTimeout(() => { if (!binding.connected) showFault(Object.assign(Error('Plugin handshake timed out.'), {code: 'UI_HANDSHAKE_TIMEOUT'})); }, 30000);
  return {revoke, notifyDraft(value) { if (!revoked && binding.connected) binding.host.notifyDraft(value); }, get connected() { return !revoked && binding.connected; }, element: wrapper};
}
