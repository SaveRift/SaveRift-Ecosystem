import React, {Component, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {connectPluginUi} from '../../../sdk/ui-bridge.mjs';
import {CrimsonBridgeProvider} from './components/bridge.jsx';
import {configureDataProviders} from '../src/data-provider.mjs';
import './components/base.css';
import './components/crimson-explorer.css';

class EditorBoundary extends Component {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() { return this.state.failed ? <p className="plugin-game-status" role="alert">This part of the editor could not open. Your original save and saved changes are preserved.</p> : this.props.children; }
}
function App({client, bootstrap, initialDraft}) {
  const [context, setContext] = useState(bootstrap.context), [screens, setScreens] = useState(null);
  useEffect(() => client.onContext?.(next => setContext(previous => {
    if (previous?.viewId === 'crimson.import' && (!next?.advanced || next.viewId !== previous.viewId || next.bundleDigest !== previous.bundleDigest || next.executionLockDigest !== previous.executionLockDigest)) client.close('UI_IMPORT_CONTEXT_CHANGED');
    return next;
  })), [client]);
  useEffect(() => { let active = true; Promise.all([import('./components/CrimsonExplorer.jsx'), import('./components/SavePresets.jsx'), import('./components/SaveUpload.jsx')]).then(([explorer, presets, upload]) => { if (active) setScreens({Explorer: explorer.CrimsonExplorer, Presets: presets.SavePresets, Upload: upload.SaveUpload}); }); return () => { active = false; }; }, []);
  const importView = context?.viewId === 'crimson.import';
  return <EditorBoundary><CrimsonBridgeProvider client={client} initialDraft={initialDraft} draftEnabled={!importView}>{screens ? importView ? context?.advanced ? <screens.Upload key={`${context.bundleDigest || ''}:${context.executionLockDigest || ''}`} game={context.game || bootstrap.explorer?.game} contextKey={`${context.bundleDigest || ''}:${context.executionLockDigest || ''}`} advanced inline/> : <p className="plugin-game-status" role="status">Enable Advanced to check a file from your computer.</p> : context?.viewId === 'crimson.presets' ? <screens.Presets {...bootstrap.explorer} advanced={Boolean(context?.advanced)}/> : <screens.Explorer {...bootstrap.explorer} advanced={Boolean(context?.advanced)} inline/> : <p className="plugin-game-status" role="status">Opening your adventure…</p>}</CrimsonBridgeProvider></EditorBoundary>;
}

const root = createRoot(document.getElementById('root'));
root.render(<p className="plugin-game-status" role="status">Opening your adventure…</p>);
try {
  const client = await connectPluginUi();
  const context = await client.getContext();
  let providerIndex;
  try { providerIndex = context.viewId === 'crimson.import' ? {providers: []} : await client.catalogQuery({catalogId: 'crimson.ui.providers', limit: 32}); }
  catch (error) { if (error.code !== 'UI_METHOD_UNAVAILABLE' && error.code !== 'CATALOG_UNAVAILABLE' && error.code !== 'UI_REQUEST_FAILED') throw error; providerIndex = {providers: []}; }
  const pins = providerIndex?.providers || [];
  if (!Array.isArray(pins) || pins.length > 32 || pins.some(pin => !Number.isSafeInteger(pin.byteLength) || pin.byteLength < 0 || !/^[a-f0-9]{64}$/.test(pin.sha256)) || pins.reduce((total, pin) => total + pin.byteLength, 0) > 8 * 1024 * 1024) throw Error('The pinned UI providers exceed their transfer budget.');
  const providers = [];
  for (const pin of pins) {
    const asset = await client.resolveAsset({assetId: pin.assetId});
    if (asset.mimeType !== 'application/json' || asset.sha256 !== pin.sha256 || asset.byteLength !== pin.byteLength) throw Error('The UI provider does not match the execution lock.');
    providers.push({id: pin.id, bytes: asset.bytes, sha256: pin.sha256});
  }
  configureDataProviders(providers, {expected: pins});
  const [explorer, initialDraft] = context.viewId === 'crimson.import' ? [{game: context.game}, null] : await Promise.all([client.query({method: 'crimson.explorer', args: {}}), client.getDraft()]);
  root.render(<App client={client} bootstrap={{context, explorer}} initialDraft={initialDraft}/>);
  addEventListener('pagehide', () => client.close(), {once: true});
} catch (error) { root.render(<p className="plugin-game-status" role="alert">{error.message || 'This save could not be opened.'}</p>); }
