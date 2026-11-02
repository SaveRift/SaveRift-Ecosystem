// SPDX-License-Identifier: Apache-2.0
import {readdir, readFile} from 'node:fs/promises';
import {TEMPLATES} from './templates.mjs';
import {validatePackage} from '../sdk/contracts.mjs';

// Discover connector source already present in the clean public checkout. This
// is file reading only, with no plugin execution and no customer fixture import.
export async function localTemplates(directory = new URL('../plugins/', import.meta.url)) {
  const templates = [...TEMPLATES]; let entries;
  try { entries = await readdir(directory, {withFileTypes: true}); } catch (error) { if (error.code === 'ENOENT') return templates; throw error; }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const base = new URL(`${entry.name}/`, directory); let manifest;
    try { manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8')); } catch { continue; }
    if (!['game', 'extension'].includes(manifest.kind)) continue;
    const files = {};
    async function scan(relative = '') {
      for (const child of await readdir(new URL(relative || './', base), {withFileTypes: true})) {
        if (child.name.startsWith('.') || /^(?:node_modules|fixtures?|private|logs?)$/i.test(child.name)) continue;
        const path = `${relative}${child.name}`;
        if (child.isDirectory()) await scan(`${path}/`);
        else if (child.isFile() && (/\.(?:mjs|js|jsx|ts|tsx|json|html|css|md|txt)$/i.test(child.name) || /^(?:LICENSE|NOTICE|COPYING)$/.test(child.name))) files[path] = await readFile(new URL(path, base), 'utf8');
      }
    }
    await scan();
    // Source distributions may keep the canonical runtime at the connector
    // root and map it to its packaged entrypoint during a controlled build.
    if (!files[manifest.entrypoints?.runtime] && files['connector.mjs']) files[manifest.entrypoints.runtime] = files['connector.mjs'];
    const checked = validatePackage({manifest, files: Object.fromEntries(Object.entries(files).filter(([path]) => path !== 'manifest.json'))});
    templates.push({id: `plugin-${manifest.id}`, title: `${manifest.displayName || manifest.id} reference`, description: `Fork the local ${manifest.id}@${manifest.version} connector source. No player fixture is imported.`, runtimeProfile: manifest.entrypoints.runtimeProfile, packageDigest: checked.packageDigest, files});
  }
  return templates;
}
