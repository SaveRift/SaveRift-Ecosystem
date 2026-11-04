// SPDX-License-Identifier: Apache-2.0
// Read-only fingerprinting of the last compiled package and broad source template.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePackage, hash, digest} from '../ecosystem/sdk/contracts.mjs';
import {localTemplates} from '../ecosystem/workbench/local-templates.mjs';
import {packageFromSource} from '../ecosystem/workbench/execution.mjs';
const plugin = fileURLToPath(new URL('../ecosystem/plugins/ac-shadows/', import.meta.url));
const lock = JSON.parse(await readFile(resolve(plugin, 'package-lock.generated.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(plugin, 'manifest.json'), 'utf8'));
const files = {};
for (const entry of lock.files) {
  const bytes = new Uint8Array(await readFile(resolve(plugin, entry.path)));
  assert.equal(bytes.length, entry.byteLength, `Rebuild required: ${entry.path} length changed.`);
  assert.equal(hash(bytes), entry.sha256, `Rebuild required: ${entry.path} content changed.`);
  files[entry.path] = bytes;
}
const canonical = validatePackage({manifest, files});
assert.equal(canonical.packageDigest, lock.packageDigest, 'Rebuild required: manifest or compiled closure changed.');
const template = (await localTemplates()).find(t => t.id === 'plugin-saverift.ac-shadows');
assert.ok(template);
const source = packageFromSource(template.files), sourceCheck = validatePackage(source);
const canonicalPaths = new Set(canonical.descriptors.map(f => f.path));
const extraFiles = sourceCheck.descriptors.filter(f => !canonicalPaths.has(f.path));
const sharedFiles = canonical.descriptors.map(file => {
  const found = sourceCheck.descriptors.find(x => x.path === file.path);
  assert.ok(found && file.sha256 === found.sha256 && file.byteLength === found.byteLength, `Source template differs at canonical path: ${file.path}`);
  return file;
});
const report = {schema:'saverift.ac-shadows.fingerprints.v1', status:'passed',
  canonicalPackageDigest: canonical.packageDigest, canonicalPackageBytes: canonical.byteLength,
  canonicalFiles: sharedFiles, sourceTemplatePackageDigest: source.packageDigest,
  sourceTemplateBytes: sourceCheck.byteLength, sourceTreeDigest: digest(template.files), extraSourceTemplateFiles: extraFiles,
  explanation: 'Canonical package contains the compiled runtime/UI and licensed runtime documents. The discovered editable-source template additionally includes source modules, build scripts, package metadata/locks, generated build inventory and synthetic tests. Package hashes cover every file, so those closures intentionally have distinct hashes. Their shared executable/UI bytes are verified identical. node_modules, hidden directories and fixture/private/log directories are excluded by localTemplates; source exports and review bundles never include private workbench state.',
  publication:'not_performed'};
const output = process.env.SAVERIFT_AC_FINGERPRINT_OUTPUT;
if (output) await writeFile(output, JSON.stringify(report,null,2));
process.stdout.write(JSON.stringify({status:report.status,canonicalPackageDigest:report.canonicalPackageDigest,sourceTemplatePackageDigest:report.sourceTemplatePackageDigest,sharedFiles:sharedFiles.length,extraSourceTemplateFiles:extraFiles.length})+'\n');
