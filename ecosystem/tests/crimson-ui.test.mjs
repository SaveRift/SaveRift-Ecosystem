import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm, mkdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {build} from 'esbuild';
import {publicOperations, legacyDrafts, isCrimsonUiOperation} from '../plugins/crimson-desert/ui/components/draft-adapter.mjs';
import {buildCustomUi} from '../ui/build-ui.mjs';
import {createFrameDocument} from '../ui/frame-document.mjs';

test('all existing Crimson UI intention families map to registered canonical operations', () => {
  const intents = [
    {schema: 'saveglass.crimson-staged-operation.v1', operation: 'inventory.setQuantity', inventoryKey: 2, definitionKey: 101, instanceId: '18446744073709551614', slot: 4, expectedValue: '5', desiredValue: '6', displayName: 'Synthetic fish', publishEligible: false},
    {operation: 'inventory.setCopper', inventoryKey: 2, definitionKey: 1, desiredValue: '20'},
    {operation: 'inventory.setExpansionValue', inventoryKey: 2, desiredValue: '43'},
    {operation: 'inventory.addItem', definitionKey: 1001, inventoryKey: 2, quantity: '1', displayName: 'Synthetic armor'},
    {operation: 'companions.add', characterKey: 2001, quantity: '1'},
    {operation: 'cartography.reveal-map', recipe: 'reveal-map'},
    {operation: 'cartography.unlock-nexus', recipe: 'unlock-nexus'},
  ];
  const operations = publicOperations(intents);
  assert.equal(operations.length, 7); assert.ok(operations.every(operation => operation.id.startsWith('crimson.') && operation.apiVersion === '0.1.0'));
  assert.equal(operations[0].params.instanceId, '18446744073709551614'); assert.ok(!('displayName' in operations[0].params)); assert.ok(!('publishEligible' in operations[0].params));
  const recovered = legacyDrafts({operations: [...operations, {id: 'community.vehicle.boost', params: {fuel: 8}}]});
  assert.equal(recovered.length, 7); assert.equal(recovered[0].desiredValue, '6'); assert.equal(recovered[3].schema, 'saveglass.item-addition-intent.v1'); assert.equal(recovered[4].schema, 'saveglass.companion-addition-intent.v1');
  assert.equal(isCrimsonUiOperation({id: 'crimson.community.customSystem'}), false);
  assert.throws(() => publicOperations([{operation: 'cloud.write'}]), /registered Crimson/);
});

test('extracted polished controls render through the public bridge with synthetic data', async () => {
  const root = resolve(import.meta.dirname, '..'), temporary = resolve(import.meta.dirname, '../.runtime'); await mkdir(temporary, {recursive: true});
  const out = await mkdtemp(join(temporary, 'public-ui-test-'));
  try {
    await build({stdin: {contents: "export {CrimsonBridgeProvider} from './plugins/crimson-desert/ui/components/bridge.jsx';export {CrimsonExplorer,QueuedInventoryCard,CompanionCard,AddCompanionCard} from './plugins/crimson-desert/ui/components/CrimsonExplorer.jsx';", resolveDir: root, loader: 'jsx'}, outfile: join(out, 'entry.mjs'), bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'react-dom/*', '@phosphor-icons/react'], logLevel: 'silent'});
    const {CrimsonBridgeProvider, CrimsonExplorer, QueuedInventoryCard, CompanionCard, AddCompanionCard} = await import(pathToFileURL(join(out, 'entry.mjs')));
    const client = {getDraft: async () => ({revision: 0, operations: []}), onDraft: () => () => {}, subscribeDraft: async () => {}, query: async () => ({}), openReview: async () => ({opened: true}), resolveAsset: async () => { throw Error('No synthetic asset'); }};
    const wrap = element => renderToString(createElement(CrimsonBridgeProvider, {client, initialDraft: {revision: 0, operations: []}}, element));
    const item = wrap(createElement(QueuedInventoryCard, {item: {displayName: 'Synthetic armor', quantity: '1', category: 'Armor'}, onRemove() {}}));
    assert.match(item, /owned-item queued-addition/); assert.match(item, /Remove queued Synthetic armor/); assert.match(item, />Queued</);
    const pet = wrap(createElement(CompanionCard, {companion: {displayName: 'Synthetic cat', classification: 'pet'}, queued: true, onRemove() {}}));
    assert.match(pet, /companion-card queued-addition/); assert.match(pet, /Synthetic cat/); assert.match(pet, />Queued</);
    assert.match(wrap(createElement(AddCompanionCard, {kind: 'pet', onOpen() {}})), /aria-label="Add companion"/);
    const oldMatch = globalThis.matchMedia; globalThis.matchMedia = () => ({matches: false});
    try {
      const domains = {inventory: {bagCount: 1, recordCount: 0, records: [], bags: [{inventoryKey: 2, itemRecordCount: 0, expansionSlots: 43}]}, companions: [], catalog: {coverage: {}}, progress: {}, location: {}};
      const html = wrap(createElement(CrimsonExplorer, {game: {name: 'Crimson Desert'}, backup: {id: 'synthetic-bundle'}, report: {payloads: [{container: 'artifact:main', name: 'save', sha256: 'a'.repeat(64), crimson: {domains}}]}}));
      assert.match(html, /Your adventure, your way/); assert.match(html, />Upgrades</); assert.match(html, />Inventory</); assert.match(html, />Companions</); assert.match(html, />Cartography</); assert.match(html, /View Progress/);
      assert.doesNotMatch(html, /send-workbench|Save to<select|Send reviewed save/);
    } finally { globalThis.matchMedia = oldMatch; }
  } finally { await rm(out, {recursive: true, force: true}); }
});

test('public game UI has no private endpoint, account storage or publisher imports', async () => {
  for (const name of ['CrimsonExplorer.jsx', 'InventoryTools.jsx', 'PackBrowser.jsx', 'AbyssNexusPreview.jsx', 'CrimsonAdventure.jsx', 'SavePresets.jsx', 'SnapshotCapabilities.jsx', 'bridge.jsx']) {
    const source = await readFile(new URL(`../plugins/crimson-desert/ui/components/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /['"](?:\.\/api\.mjs|\.\/SendToXbox\.jsx|\.\/usePersistentDraftQueue\.jsx)|\/api\/|\bfetch\s*\(|\b(?:localStorage|sessionStorage)\b/);
  }
});

test('the actual browser UI bundle includes the automatic JSX runtime and fits the isolated frame', async () => {
  const temporary = resolve(import.meta.dirname, '../.runtime'); await mkdir(temporary, {recursive: true});
  const out = await mkdtemp(join(temporary, 'browser-ui-build-'));
  try {
    const ui = await buildCustomUi({entry: resolve(import.meta.dirname, '../plugins/crimson-desert/ui/index.jsx'), outputDirectory: out});
    assert.ok(ui.script.length > 100000); assert.ok(ui.css.includes('.owned-item-grid')); assert.ok(ui.css.includes('.companion-card'));
    assert.doesNotMatch(ui.script, /\bReact\.createElement\b/);
    assert.doesNotMatch(ui.script, /\bimport\s*\(\s*['"](?:\.|https?:)|\bfrom\s*['"](?:\.|https?:)/);
    const document = await createFrameDocument({...ui, hostOrigin: 'https://saverift.com', instanceId: 'browser-build'});
    assert.match(document, /connect-src &#39;none&#39;/); assert.ok(document.includes('saverift-ui-instance'));
  } finally { await rm(out, {recursive: true, force: true}); }
});
