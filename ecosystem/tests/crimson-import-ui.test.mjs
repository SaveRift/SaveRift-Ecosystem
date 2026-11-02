import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {checkedFileSelection, checkedUploadReport} from '../plugins/crimson-desert/ui/components/upload-report.mjs';
const originalHash = 'a'.repeat(64), nativeHash = 'b'.repeat(64);
const selection = () => ({schema: 'saverift.file-import.v1', source: 'user_upload', importId: 'import:owned1', retained: false, files: [{id: 'file:main', logicalPath: 'uploads/save.save', byteLength: 256, sha256: originalHash}]});
const report = () => ({schema: 'saverift.uploaded-save-report.v1', source: 'user_upload', game: 'crimson-desert', nativeCopyDelivery: 'binary_artifact', originalsUnchanged: true, stored: false, cloudRequests: 0, xboxMutations: 0, pair: {state: 'companion_missing', message: 'Choose the matching save and lobby files to compare their companion metadata.'}, xboxTransfer: {state: 'not_verified', canSend: false, message: 'These checks do not establish PC-to-Xbox compatibility.'}, files: [{name: 'save.save', bytes: 256, sha256: originalHash, format: 'crimson-save', role: 'save', status: 'validated', summary: 'Synthetic result: native SAVE integrity and unchanged-data re-open checks passed.', checks: {integrity: true, structure: true, roundTrip: true, plaintextUnchanged: true}, nativeCopy: {filename: 'native-save.save', bytes: 240, sha256: nativeHash, artifact: {id: 'export:native1', logicalPath: 'exports/1-native-save.save', role: 'native-export', byteLength: 240, sha256: nativeHash}}}]});

test('Advanced intake accepts immutable uploaded descriptors and binary output references', () => {
  assert.equal(checkedFileSelection(selection()), true); assert.equal(checkedUploadReport(report(), selection().files), true);
  const archive = selection(); archive.files[0].logicalPath = 'uploads/save.zip'; assert.equal(checkedFileSelection(archive), false);
  const live = selection(); live.source = 'live'; assert.equal(checkedFileSelection(live), false);
  const mismatch = report(); mismatch.files[0].sha256 = nativeHash; assert.equal(checkedUploadReport(mismatch, selection().files), false);
  const raw = report(); raw.files[0].nativeCopy.dataBase64 = 'AAAA'; assert.equal(checkedUploadReport(raw, selection().files), false);
  const wrongHash = report(); wrongHash.files[0].nativeCopy.artifact.sha256 = originalHash; assert.equal(checkedUploadReport(wrongHash, selection().files), false);
  const write = report(); write.xboxTransfer.canSend = true; assert.equal(checkedUploadReport(write, selection().files), false);
  const missingCheck = report(); missingCheck.files[0].checks.integrity = false; assert.equal(checkedUploadReport(missingCheck, selection().files), false);
});

test('public Advanced upload/result controls render original labels without native file or download authority', async () => {
  const root = resolve(import.meta.dirname, '..'), temporary = join(root, '.runtime'); await mkdir(temporary, {recursive: true}); const out = await mkdtemp(join(temporary, 'intake-ui-'));
  try {
    await build({stdin: {contents: "export {CrimsonBridgeProvider} from './plugins/crimson-desert/ui/components/bridge.jsx';export {SaveUpload,SaveUploadResults} from './plugins/crimson-desert/ui/components/SaveUpload.jsx';", resolveDir: root, loader: 'jsx'}, outfile: join(out, 'entry.mjs'), bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'react-dom/*', '@phosphor-icons/react'], logLevel: 'silent'});
    const {CrimsonBridgeProvider, SaveUpload, SaveUploadResults} = await import(pathToFileURL(join(out, 'entry.mjs')));
    const wrap = element => renderToString(createElement(CrimsonBridgeProvider, {client: {}, draftEnabled: false}, element));
    const hidden = wrap(createElement(SaveUpload, {advanced: false})); assert.match(hidden, /Enable Advanced/); assert.doesNotMatch(hidden, /Choose save files/);
    const shown = wrap(createElement(SaveUpload, {advanced: true}));
    assert.match(shown, /Bring your save along/); assert.match(shown, /Uploaded files · Separate from your Xbox saves/); assert.match(shown, /Choose save files/); assert.match(shown, /This tool does not retain uploaded files/); assert.doesNotMatch(shown, /type="file"|href=|dataBase64|Send to Xbox/);
    const result = wrap(createElement(SaveUploadResults, {report: report()}));
    assert.match(result, /Integrity checked/); assert.match(result, /Native copy reopened/); assert.match(result, /Content unchanged/); assert.match(result, /Download native copy/); assert.match(result, /PC-to-Xbox compatibility/); assert.match(result, /No Xbox save was sent or replaced/); assert.doesNotMatch(result, /dataBase64|href=|export:native1/);
  } finally { await rm(out, {recursive: true, force: true}); }
});

test('intake source is host-dialog only and clears state when Advanced or source changes', async () => {
  const source = await readFile(new URL('../plugins/crimson-desert/ui/components/SaveUpload.jsx', import.meta.url), 'utf8');
  assert.match(source, /requestFileImport\(/); assert.match(source, /requestDownload\(/); assert.match(source, /\[gameKey, advanced\]/); assert.match(source, /inFlight\.current\?\.abort\(/);
  assert.doesNotMatch(source, /\/api\/|\bfetch\s*\(|type="file"|dataBase64|\b(?:atob|btoa)\s*\(|URL\.createObjectURL|\b(?:localStorage|sessionStorage)\b/);
  const entry = await readFile(new URL('../plugins/crimson-desert/ui/index.jsx', import.meta.url), 'utf8');
  assert.match(entry, /UI_IMPORT_CONTEXT_CHANGED/); assert.match(entry, /context\?\.advanced \? <screens\.Upload/);
  const manifest = JSON.parse(await readFile(new URL('../plugins/crimson-desert/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.views.find(view => view.id === 'crimson.import').advancedOnly, true);
});
