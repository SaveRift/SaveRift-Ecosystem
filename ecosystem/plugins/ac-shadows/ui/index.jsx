// SPDX-License-Identifier: Apache-2.0
import {createRoot} from 'react-dom/client';
import {connectPluginUi} from '../../../sdk/ui-bridge.mjs';
import {ShadowsEditor} from './App.jsx';
import './style.css';
const root = createRoot(document.getElementById('root'));
root.render(<p role="status" className="opening">Opening your Shadows inventory…</p>);
try {
  const client = await connectPluginUi();
  const [initialSummary, initialPage, initialDraft] = await Promise.all([
    client.query({method: 'acshadows.inspect', args: {}}),
    client.query({method: 'acshadows.inventory.list', args: {search: '', offset: 0, limit: 50}}),
    client.getDraft(),
  ]);
  root.render(<ShadowsEditor client={client} initialSummary={initialSummary} initialPage={initialPage} initialDraft={initialDraft}/>);
  addEventListener('pagehide', () => client.close(), {once: true});
} catch (error) {
  root.render(<main className="shadows-editor"><h1>This selection could not be opened</h1><p role="alert">{error.message || 'The selected format is not supported.'}</p><p>Choose a prepared PC save with its private format-key input, or a validated decoded inventory context. Compressed progression payloads require the local preparation step.</p></main>);
}
