// SPDX-License-Identifier: Apache-2.0
import {mkdir, readFile, writeFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, relative} from 'node:path';
import {build} from 'esbuild';
import {validatePackage} from '../../../sdk/contracts.mjs';
import {buildCustomUi} from '../../../ui/build-ui.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildAcShadowsPackage({write = true} = {}) {
  await buildCustomUi({entry: resolve(root, 'ui/index.jsx'), outputDirectory: resolve(root, 'ui/dist')});
  const compiled = await build({absWorkingDir: root, entryPoints: [resolve(root, 'connector.mjs')], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', legalComments: 'inline', treeShaking: true, metafile: true});
  const source = compiled.outputFiles[0].text;
  if (/(?:from\s*|import\s*\()['"](?:node:|https?:|\.{1,2}\/)/.test(source)) throw Error('The runtime bundle is not self-contained.');
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  const files = {'runtime/connector.mjs': source};
  for (const name of ['ui/index.html', 'ui/dist/entry.js', 'ui/dist/style.css']) files[name] = await readFile(resolve(root, name), 'utf8');
  files.LICENSE = await readFile(resolve(root, '../../LICENSE'), 'utf8');
  for (const name of ['NOTICE', 'README.md', 'DEVELOPER_API.md', 'FORMAT_SUPPORT.md']) {
    try { files[name] = await readFile(resolve(root, name), 'utf8'); } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  }
  try { for (const name of await readdir(resolve(root, 'licenses'))) files[`licenses/${name}`] = await readFile(resolve(root, 'licenses', name), 'utf8'); } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const checked = validatePackage({manifest, files});
  if (write) {
    await mkdir(resolve(root, 'runtime'), {recursive: true});
    await writeFile(resolve(root, 'runtime/connector.mjs'), source);
    await writeFile(resolve(root, 'package-lock.generated.json'), JSON.stringify({schema: 'saverift.package-build.v1', packageDigest: checked.packageDigest, byteLength: checked.byteLength, files: checked.descriptors, inputs: Object.keys(compiled.metafile.inputs).map(path => relative(root, resolve(root, path)).replaceAll('\\', '/')).sort()}, null, 2) + '\n');
  }
  return {manifest, files, packageDigest: checked.packageDigest};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = await buildAcShadowsPackage();
  process.stdout.write(JSON.stringify({id: pkg.manifest.id, packageDigest: pkg.packageDigest, files: Object.keys(pkg.files).length}) + '\n');
}
