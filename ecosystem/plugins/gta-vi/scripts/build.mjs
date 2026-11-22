// SPDX-License-Identifier: Apache-2.0
import {mkdir, readFile, writeFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, relative, dirname} from 'node:path';
import {build} from 'esbuild';
import {LIMITS, validatePackage} from '../../../sdk/contracts.mjs';
import {buildCustomUi} from '../../../ui/build-ui.mjs';
import {validateCatalogPresentations} from '../src/shared/gta-vi-details.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function assertSourceLimit(name, source) {
  const bytes = Buffer.byteLength(source, 'utf8');
  if (bytes > LIMITS.sourceBytes) throw Object.assign(new Error(`${name} is ${bytes} bytes; the SDK module limit is ${LIMITS.sourceBytes}.`), {code: 'SOURCE_LIMIT'});
}

async function catalogModules() {
  const header = JSON.parse(await readFile(resolve(root, 'data/catalog.json'), 'utf8'));
  const categories = header.categories;
  if (!Array.isArray(categories) || !categories.length || new Set(categories).size !== categories.length ||
      categories.some(category => typeof category !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(category))) throw Error('Catalog categories must be unique safe module names.');
  const files = {}, paths = new Map(), inputs = [], documents = {};
  for (const category of categories) {
    const input = `data/entities/${category}.json`;
    const document = JSON.parse(await readFile(resolve(root, input), 'utf8'));
    if (document.category !== category || !Array.isArray(document.entries)) throw Error(`The ${category} catalog has an invalid category or entries array.`);
    documents[category] = document;
    const name = `runtime/catalog/${category}.mjs`;
    // Complete JSON values, with no filtering or witness truncation. The
    // immutable package also retains the original JSON and its provenance.
    const source = `export default ${JSON.stringify(document)};\n`;
    assertSourceLimit(name, source);
    files[name] = source;
    paths.set(resolve(root, input), `./catalog/${category}.mjs`);
    inputs.push(input);
  }
  const presentations = {};
  for (const category of ['vehicles', 'weapons', 'items']) {
    presentations[category] = JSON.parse(await readFile(resolve(root, `data/details/${category}.json`), 'utf8'));
  }
  const sources = JSON.parse(await readFile(resolve(root, 'data/details/sources.json'), 'utf8'));
  validateCatalogPresentations(documents, presentations, sources);
  for (const [category, document] of Object.entries({...presentations, sources})) {
    const input = `data/details/${category}.json`, name = `runtime/details/${category}.mjs`;
    const source = `export default ${JSON.stringify(document)};\n`;
    assertSourceLimit(name, source);
    files[name] = source;
    paths.set(resolve(root, input), `./details/${category}.mjs`);
    inputs.push(input);
  }
  return {files, paths, inputs};
}

async function includeTree(files, directory) {
  for (const entry of await readdir(resolve(root, directory), {withFileTypes: true})) {
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await includeTree(files, name);
    else if (entry.isFile()) files[name] = await readFile(resolve(root, name));
  }
}

export async function buildGtaViPackage({write = true} = {}) {
  const catalogs = await catalogModules();
  await buildCustomUi({entry: resolve(root, 'ui/index.jsx'), outputDirectory: resolve(root, 'ui/dist')});
  const compiled = await build({
    absWorkingDir: root,
    entryPoints: [resolve(root, 'connector.mjs')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    legalComments: 'inline',
    treeShaking: true,
    minifyWhitespace: true,
    metafile: true,
    plugins: [{name: 'gta-vi-packaged-catalogs', setup(api) {
      api.onResolve({filter: /\.json$/}, args => {
        const module = catalogs.paths.get(resolve(args.resolveDir, args.path));
        return module ? {path: module, external: true} : undefined;
      });
    }}]
  });
  const source = compiled.outputFiles[0].text;
  assertSourceLimit('runtime/connector.mjs', source);
  const allowedImports = new Set(catalogs.paths.values());
  const imports = Object.values(compiled.metafile.outputs).flatMap(output => output.imports || []);
  if (imports.some(item => item.external !== true || item.kind !== 'import-statement' || !allowedImports.has(item.path)) ||
      new Set(imports.map(item => item.path)).size !== allowedImports.size) throw Error('The runtime may import only its complete generated catalog and detail modules.');
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  const runtimeFiles = {'runtime/connector.mjs': source, ...catalogs.files};
  const files = {...runtimeFiles};
  for (const name of ['ui/index.html', 'ui/dist/entry.js', 'ui/dist/style.css']) files[name] = await readFile(resolve(root, name), 'utf8');
  for (const name of ['NOTICE', 'README.md', 'DEVELOPER_API.md']) files[name] = await readFile(resolve(root, name), 'utf8');
  files.LICENSE = await readFile(resolve(root, '../../LICENSE'), 'utf8');
  try { await includeTree(files, 'data'); } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const checked = validatePackage({manifest, files});
  if (write) {
    for (const [name, content] of Object.entries(runtimeFiles)) {
      await mkdir(dirname(resolve(root, name)), {recursive: true});
      await writeFile(resolve(root, name), content);
    }
    await writeFile(resolve(root, 'package-lock.generated.json'), JSON.stringify({
      schema: 'saverift.package-build.v1',
      packageDigest: checked.packageDigest,
      byteLength: checked.byteLength,
      files: checked.descriptors,
      inputs: [...new Set([...Object.keys(compiled.metafile.inputs).map(path => relative(root, resolve(root, path)).replaceAll('\\', '/')), ...catalogs.inputs])].sort()
    }, null, 2) + '\n');
  }
  return {manifest, files, packageDigest: checked.packageDigest};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = await buildGtaViPackage();
  process.stdout.write(JSON.stringify({id: pkg.manifest.id, packageDigest: pkg.packageDigest, files: Object.keys(pkg.files).length}) + '\n');
}
