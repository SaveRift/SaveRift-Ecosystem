// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, join, sep} from 'node:path';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {createOperationCatalog} from '../../../sdk/operation-catalog.mjs';
import {createDraft, editDraft} from '../../../sdk/draft.mjs';
import {createFrameDocument} from '../../../ui/frame-document.mjs';
import {buildAcShadowsPackage} from '../scripts/build.mjs';
import {editRequest, pendingValue} from '../ui/model.mjs';

const directory = fileURLToPath(new URL('../', import.meta.url));
const digest = 'a'.repeat(64);
const gear = {recordId: 'progression:120:18446744073709551614', characterId: '123', itemSettingsId: '2222222222222', instanceId: '18446744073709551614', displayName: 'Synthetic katana', level: 63, quantity: 1, editableFields: ['level']};
const stack = {...gear, recordId: 'progression:240:18446744073709551613', instanceId: '18446744073709551613', displayName: 'Synthetic resource', level: 0, quantity: 25, editableFields: ['quantity']};
const blank = () => createDraft({id: 'ac-ui-test', baseBundleDigest: digest, sourceRevision: digest, accountBindingDigest: digest, executionLockDigest: digest});
const catalog = async () => createOperationCatalog([{manifest: JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')), files: {'runtime/connector.mjs': 'export default {}'}}]);

test('UI stages exact typed IDs and replaces only its own matching field through shared draft CAS', async () => {
  const operationCatalog = await catalog();
  let draft = blank();
  const apply = (request, id) => editDraft(draft, {type: 'stageMany', ...request, operations: request.operations.map(op => ({...op, instanceId: id}))}, {expectedRevision: request.expectedRevision, operationCatalog, allowedOwners: ['saverift.ac-shadows']});
  let request = editRequest(draft, gear, 'level', 70, digest);
  assert.equal(request.operations[0].params.recordId, gear.recordId);
  draft = apply(request, 'level-first');
  draft = apply(editRequest(draft, stack, 'quantity', 45, digest), 'resource');
  assert.equal(pendingValue(draft, gear, 'level'), 70);
  request = editRequest(draft, gear, 'level', 80, digest);
  assert.deepEqual(request.removeInstanceIds, ['level-first']);
  assert.equal(request.operations[0].params.expectedLevel, 63);
  draft = apply(request, 'level-second');
  assert.equal(draft.operations[0].instanceId, 'resource');
  assert.equal(draft.operations.length, 2);
  const stale = editRequest(draft, gear, 'level', 81, digest);
  draft = apply(editRequest(draft, gear, 'level', 63, digest), 'unused');
  assert.equal(draft.operations.length, 1);
  assert.equal(pendingValue(draft, gear, 'level'), 63);
  assert.throws(() => apply(stale, 'stale'), {code: 'DRAFT_REVISION_CONFLICT'});
});

test('UI and host schemas reject unsupported fields, unbounded values and extra parameters', async () => {
  const operationCatalog = await catalog();
  assert.throws(() => editRequest(blank(), gear, 'quantity', 2, digest), /read-only/);
  assert.throws(() => editRequest(blank(), stack, 'level', 10, digest), /read-only/);
  for (const value of [0, 101, 2.5, NaN, '64']) assert.throws(() => editRequest(blank(), gear, 'level', value, digest));
  const op = editRequest(blank(), gear, 'level', 64, digest).operations[0], validate = operationCatalog.find(def => def.id === op.id).validate;
  assert.equal(validate(op.params), true);
  for (const change of [{recordId: 123}, {sourceSha256: 'bad'}, {level: 101}, {expectedLevel: '63'}, {unknown: true}]) assert.equal(validate({...op.params, ...change}), false);
});

test('rendered custom view presents supported forms and honest context-only scope', async () => {
  const tempRoot = resolve(directory, '../../.runtime'); await mkdir(tempRoot, {recursive: true});
  const temporary = await mkdtemp(join(tempRoot, 'ac-ui-'));
  try {
    const output = join(temporary, 'view.mjs');
    await build({entryPoints: [join(directory, 'ui/App.jsx')], outfile: output, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime'], logLevel: 'silent'});
    const {ShadowsEditor} = await import(pathToFileURL(output));
    const html = renderToString(createElement(ShadowsEditor, {client: {}, initialSummary: {inventoryCount: 2, sourceSha256: digest, format: 'native-progression-context'}, initialPage: {records: [gear, stack], total: 2, offset: 0, limit: 50}, initialDraft: blank()}));
    assert.match(html, /Synthetic katana/); assert.match(html, /id="edit-level"/); assert.doesNotMatch(html, /id="edit-quantity"/);
    assert.match(html, /Review changes/); assert.match(html, /No in-game or recovery acceptance is claimed/);
    assert.match(html, /needs the established PC save repacking workflow/);
    assert.match(html, /18446744073709551614/);
    const nativeHtml = renderToString(createElement(ShadowsEditor, {client: {}, initialSummary: {inventoryCount: 2, sourceSha256: digest, format: 'native-pc-stored-progression-v54', capabilities: {nativeWrappedSave: true}}, initialPage: {records: [gear, stack], total: 2, offset: 0, limit: 50}, initialDraft: blank()}));
    assert.match(nativeHtml, /PC save editor/); assert.match(nativeHtml, /native save candidate/);
    assert.match(nativeHtml, /has not been tested loading it in the game/);
    assert.doesNotMatch(nativeHtml, /download needs the established PC save repacking workflow/);
  } finally {
    const checked = resolve(temporary); assert.ok(checked.startsWith(resolve(tempRoot) + sep));
    await rm(checked, {recursive: true, force: true});
  }
});

test('compiled UI stays in the released opaque frame and package binds all schemas and notices', async () => {
  const pkg = await buildAcShadowsPackage({write: false});
  const frame = await createFrameDocument({script: pkg.files['ui/dist/entry.js'], css: pkg.files['ui/dist/style.css'], bodyHtml: pkg.files['ui/index.html'], hostOrigin: 'http://127.0.0.1:4174', instanceId: 'ac-package-ui'});
  assert.match(frame, /form-action &#39;none&#39;/); assert.match(frame, /connect-src &#39;none&#39;/);
  assert.ok(pkg.files['licenses/React-MIT.txt']);
  for (const name of ['App.jsx', 'index.jsx', 'model.mjs']) {
    const source = await readFile(join(directory, 'ui', name), 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|\b(?:localStorage|sessionStorage)\b|\/api\//);
  }
});
