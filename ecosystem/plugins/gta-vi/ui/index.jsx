// SPDX-License-Identifier: Apache-2.0
import {createRoot} from 'react-dom/client';
import {connectPluginUi} from '../../../sdk/ui-bridge.mjs';
import {GtaViExplorer} from './App.jsx';
import './style.css';

const root = createRoot(document.getElementById('root'));
root.render(<main className="gta-shell"><p role="status">Opening your GTA VI selection...</p></main>);

try {
  const client = await connectPluginUi();
  const [summary, fields, catalog] = await Promise.all([
    client.query({method: 'gtavi.inspect', args: {}}),
    client.query({method: 'gtavi.fields.list', args: {offset: 0, limit: 50}}),
    client.query({method: 'gtavi.catalog.categories', args: {}}),
  ]);
  root.render(<GtaViExplorer client={client} summary={summary} initialFields={fields} initialCatalog={catalog}/>);
  addEventListener('pagehide', () => client.close(), {once: true});
} catch (error) {
  root.render(<main className="gta-shell gta-error"><p className="eyebrow">GTA VI · DEVELOPER PREVIEW</p><h1>This selection could not be opened</h1><p role="alert">{error.message || 'Select a supported, decoded GTA VI save.'}</p><p>The public connector currently inspects a decoded Xbox or PS5 JSAV file. Console transfer and game-layer decoding happen in SaveRift's trusted flow.</p></main>);
}
