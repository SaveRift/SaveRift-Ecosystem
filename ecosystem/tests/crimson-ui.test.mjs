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
import {buildCrimsonPackage} from '../plugins/crimson-desert/scripts/build.mjs';
import {createOperationCatalog} from '../sdk/operation-catalog.mjs';
import {createDraft, editDraft} from '../sdk/draft.mjs';
import {additionPreview, stagedScalar} from '../plugins/crimson-desert/ui/components/inventory-tools.mjs';
import {stagedCartography} from '../plugins/crimson-desert/ui/components/cartography-plan.mjs';

let catalogPromise;
const gameCatalog = () => catalogPromise ??= buildCrimsonPackage({write: false}).then(pkg => createOperationCatalog([pkg]));
const emptyDraft = () => createDraft({id: 'synthetic-ui', baseBundleDigest: 'a'.repeat(64), sourceRevision: 'b'.repeat(64), accountBindingDigest: 'c'.repeat(64), executionLockDigest: 'd'.repeat(64)});

test('actual UI intents for all seven legacy families pass the packaged catalog and stage together', async () => {
  const record = {inventoryKey: 8, definitionKey: 720004, instanceId: '18446744073709551614', slot: 27, quantity: '50', quantityPresent: true, displayName: 'Synthetic ore'};
  const domains = {inventory: {records: [], bags: []}};
  const intents = [
    stagedScalar('inventory.setQuantity', record, '49'),
    stagedScalar('inventory.setCopper', {...record, inventoryKey: 2, definitionKey: 1}, '20'),
    stagedScalar('inventory.setExpansionValue', {inventoryKey: 2, expansionSlots: 43}, '44'),
    additionPreview({key: 14101, name: 'Synthetic armor', internalName: 'Synthetic_Armor'}, '1', domains, [], {definitionKey: 14101, internalName: 'Synthetic_Armor', defaultInventory: 2, referenceMaxStack: '1', source: 'synthetic-placement'}),
    // Same intent shape as CompanionPreview.stage; quantity is display metadata.
    {schema: 'saveglass.companion-addition-intent.v1', operation: 'companions.add', characterKey: 1000315, displayName: 'Synthetic cat', classification: 'pet', quantity: '1', status: 'awaiting_combined_validation', canApply: false, publishEligible: false},
    {...stagedCartography('reveal-map'), container: 'synthetic-main', payloadSha256: 'e'.repeat(64)},
    stagedCartography('unlock-nexus'),
  ];
  const original = structuredClone(intents), catalog = await gameCatalog();
  assert.equal(intents[3].inventoryKey, 2); assert.ok(intents[3].capacityPlan);
  const operations = publicOperations(intents);
  for (const operation of operations) assert.equal(catalog.find(d => d.id === operation.id && d.apiVersion === operation.apiVersion)?.validate(operation.params), true, operation.id);
  assert.deepEqual(operations.map(o => o.params), [
    {inventoryKey: 8, definitionKey: 720004, instanceId: '18446744073709551614', slot: 27, expectedValue: '50', desiredValue: '49'},
    {inventoryKey: 2, definitionKey: 1, instanceId: '18446744073709551614', slot: 27, expectedValue: '50', desiredValue: '20'},
    {inventoryKey: 2, expectedValue: '43', desiredValue: '44'},
    {definitionKey: 14101, quantity: '1'}, {characterKey: 1000315}, {}, {},
  ]);
  const staged = editDraft(emptyDraft(), {type: 'stageMany', operations: operations.map((op, i) => ({...op, instanceId: 'synthetic-ui-' + i})), removeInstanceIds: []}, {expectedRevision: 0, operationCatalog: catalog, allowedOwners: ['saverift.crimson-desert']});
  assert.equal(staged.operations.length, 7); assert.equal(staged.revision, 1);
  const recovered = legacyDrafts({operations: [...operations, {id: 'community.vehicle.boost', params: {fuel: 8}}]});
  assert.equal(recovered.length, 7); assert.equal(recovered[0].desiredValue, '49'); assert.equal(recovered[3].schema, 'saveglass.item-addition-intent.v1'); assert.equal(recovered[4].schema, 'saveglass.companion-addition-intent.v1');
  assert.deepEqual(publicOperations(recovered), operations); assert.deepEqual(intents, original);
  assert.equal(isCrimsonUiOperation({id: 'crimson.community.customSystem'}), false);
  assert.throws(() => publicOperations([{operation: 'cloud.write'}]), /registered Crimson/);
});

test('declared invalid values remain unchanged and the actual host catalog rejects them', async () => {
  const catalog = await gameCatalog();
  const valid = {operation: 'inventory.setQuantity', inventoryKey: 8, definitionKey: 720004, instanceId: '18446744073709551614', slot: 27, expectedValue: '50', desiredValue: '49'};
  const invalid = [
    {...valid, desiredValue: 49}, {...valid, instanceId: 123}, {...valid, slot: '27'}, {...valid, expectedValue: undefined},
    {operation: 'inventory.setExpansionValue', inventoryKey: 8, expectedValue: '43', desiredValue: '44'},
    {operation: 'inventory.addItem', definitionKey: '14101', quantity: '1'},
    {operation: 'inventory.addItem', definitionKey: 14101, quantity: 1},
    {operation: 'inventory.addItem', definitionKey: 14101, quantity: '01'},
    {operation: 'companions.add', characterKey: '1000315'},
  ];
  for (const [i, intent] of invalid.entries()) {
    const operation = publicOperations([intent])[0];
    for (const [key, value] of Object.entries(operation.params)) assert.equal(value, intent[key]);
    assert.throws(() => editDraft(emptyDraft(), {type: 'stage', operation: {...operation, instanceId: 'invalid-' + i}}, {expectedRevision: 0, operationCatalog: catalog}), {code: 'OPERATION_PARAMS_INVALID'});
  }
  for (const [operation, extra] of [['inventory.addItem', {inventoryKey: 2}], ['companions.add', {quantity: '1'}], ['cartography.reveal-map', {recipe: 'reveal-map'}], ['cartography.unlock-nexus', {container: 'synthetic-main'}]]) {
    const params = operation === 'inventory.addItem' ? {definitionKey: 14101, quantity: '1'} : operation === 'companions.add' ? {characterKey: 1000315} : {};
    assert.equal(catalog.find(d => d.id === 'crimson.' + operation).validate({...params, ...extra}), false, operation);
  }
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
      const domains = {inventory: {bagCount: 1, recordCount: 0, records: [], bags: [{inventoryKey: 2, itemRecordCount: 0, expansionSlots: 43}]}, companions: [], catalog: {coverage: {}, revision: 'synthetic', upstreamSha256: 'b'.repeat(64), source: 'https://example.invalid/catalog'}, audit: {objects: 0, omittedListMarkers: 0, nonzeroListMetadata: 0}, progress: {}, location: {}};
      const props = {game: {name: 'Crimson Desert'}, backup: {id: 'synthetic-bundle'}, report: {payloads: [{container: 'artifact:main', name: 'save', sha256: 'a'.repeat(64), crimson: {domains}}]}};
      const html = wrap(createElement(CrimsonExplorer, props));
      assert.match(html, /Your adventure, your way/); assert.match(html, />Upgrades</); assert.match(html, />Inventory</); assert.match(html, />Companions</); assert.match(html, />Cartography</); assert.match(html, /View Progress/);
      assert.doesNotMatch(html, /send-workbench|Save to<select|Send reviewed save/);
      for (const structure of [undefined, {}, {typeCount: null}, {typeCount: -1}]) {
        const advanced = wrap(createElement(CrimsonExplorer, {...props, advanced: true, report: {payloads: [{...props.report.payloads[0], crimson: {domains, structure}}]}}));
        assert.match(advanced, /aria-label="Advanced snapshot slot"/); assert.match(advanced, />artifact:main<\/option>/); assert.doesNotMatch(advanced, /undefined types|null types|-1 types/);
      }
      const counted = wrap(createElement(CrimsonExplorer, {...props, advanced: true, report: {payloads: [{...props.report.payloads[0], crimson: {domains, structure: {typeCount: 4}}}]}}));
      assert.match(counted, /artifact:main.* · 4 types/);
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
