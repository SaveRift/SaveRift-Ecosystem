// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rename, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {localTemplates} from '../local-templates.mjs';
import {LIMITS} from '../../sdk/contracts.mjs';

test('local discovery keeps build inputs, excludes research receipts, and still bounds runnable payloads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saverift-template-discovery-'));
  const plugin = join(directory, 'example');
  const manifest = {manifestVersion: '0.1', kind: 'game', id: 'example.discovery', version: '1.0.0', license: 'Apache-2.0', entrypoints: {runtime: 'runtime/connector.mjs', runtimeProfile: 'isolated-js-v1'}};
  const source = {
    'manifest.json': JSON.stringify(manifest),
    'runtime/connector.mjs': 'export default {};\n',
    'src/connector.mjs': 'export default {};\n',
    'scripts/build.mjs': '// Retained authoring input.\n',
    'data/catalog.json': '{"entries":[]}\n',
    'ui/App.jsx': 'export default function App() { return null; }\n',
    'README.md': 'Build instructions.\n',
    'DEVELOPER_API.md': 'Public API.\n',
    'NOTICE': 'License notices.\n',
    'LICENSE': 'License text.\n',
    'docs/README.md': 'Ordinary documentation is retained.\n',
  };
  try {
    for (const [path, content] of Object.entries(source)) {
      await mkdir(dirname(join(plugin, path)), {recursive: true});
      await writeFile(join(plugin, path), content);
    }
    const research = join(plugin, 'docs/research/large.json');
    await mkdir(dirname(research), {recursive: true});
    await writeFile(research, ' '.repeat(LIMITS.packageBytes) + '{}');
    const directoryUrl = pathToFileURL(directory + '/');
    const templates = await localTemplates(directoryUrl);
    const selected = templates.find(value => value.id === 'plugin-example.discovery');
    assert.ok(selected);
    for (const [path, content] of Object.entries(source)) assert.equal(selected.files[path], content);
    assert.ok(!Object.keys(selected.files).some(path => path.startsWith('docs/research/')));
    await rename(research, join(plugin, 'data/large.json'));
    await assert.rejects(localTemplates(directoryUrl), {code: 'PACKAGE_LIMIT'});
  } finally { await rm(directory, {recursive: true, force: true}); }
});
