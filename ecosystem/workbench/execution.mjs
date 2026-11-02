// SPDX-License-Identifier: Apache-2.0
import {canonical, validatePackage} from '../sdk/contracts.mjs';
import {createExecutionLock, validateExecutionPackages} from '../sdk/registry.mjs';
import {fail} from './storage.mjs';
import {referenceDataFor} from './reference-data.mjs';

// Source editors keep a manifest.json file for authoring. The immutable package
// represents the manifest separately, exactly like canonical release builders.
export function packageFromSource(source) {
  let manifest; try { manifest = JSON.parse(source['manifest.json']); } catch { fail('MANIFEST_INVALID', 'A valid manifest.json is required.'); }
  const files = Object.fromEntries(Object.entries(source).filter(([path]) => path !== 'manifest.json'));
  const checked = validatePackage({manifest, files});
  return {manifest, files, packageDigest: checked.packageDigest};
}

export function templateFromPackage(pkg, {id = `plugin-${pkg.manifest.id}`, title = `${pkg.manifest.displayName || pkg.manifest.id} reference`, description = 'Fork this exact package. No player fixtures are imported.'} = {}) {
  const checked = validatePackage(pkg), files = {};
  for (const [path, bytes] of checked.files) {
    if (path === 'manifest.json') fail('CANONICAL_MANIFEST_DUPLICATE', 'Canonical package files must not duplicate the separate manifest.');
    try { files[path] = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
    catch { fail('TEMPLATE_BINARY_SOURCE_UNSUPPORTED', 'The text workspace cannot import this binary source file.'); }
  }
  return {id, title, description, runtimeProfile: checked.manifest.entrypoints?.runtimeProfile, packageDigest: checked.packageDigest, files: {...files, 'manifest.json': JSON.stringify(checked.manifest, null, 2)}};
}

export function catalogPackage(snapshot) {
  const pkg = {manifest: {manifestVersion: '0.1', kind: 'data', id: snapshot.catalogId, version: snapshot.version, hostApi: '>=0.1.0 <0.2.0', license: 'LicenseRef-Developer-Provided', data: {catalogDigest: snapshot.digest}}, files: {'catalog.json': canonical(snapshot)}};
  return {...pkg, packageDigest: validatePackage(pkg).packageDigest};
}

export function composeExecution(primary, extensions = [], referenceData) {
  if (primary.manifest.kind !== 'game') fail('CONNECTOR_KIND_INVALID', 'Choose a game connector as the primary artifact.');
  if (extensions.some(artifact => artifact.manifest.kind !== 'extension')) fail('EXTENSION_KIND_INVALID', 'Dependencies must be built extension packages.');
  const artifacts = [primary, ...extensions], packages = artifacts.map(a => ({manifest: a.manifest, files: a.files, packageDigest: a.digest}));
  const catalogs = artifacts.filter(a => a.catalog?.snapshot).map(a => a.catalog.snapshot), catalogPackages = catalogs.map(catalogPackage);
  if (new Set(catalogs.map(c => c.catalogId)).size !== catalogs.length) fail('CATALOG_ID_CONFLICT', 'Selected packages have conflicting reference-data IDs. Rename or select one explicit data source.');
  const pin = artifact => ({id: artifact.manifest.id, version: artifact.manifest.version, digest: artifact.digest});
  const baseExecutionLock = createExecutionLock({connector: pin(primary), extensions: extensions.map(pin), dataPacks: catalogPackages.map(pkg => ({id: pkg.manifest.id, version: pkg.manifest.version, digest: pkg.packageDigest}))});
  const managed = referenceDataFor(primary.digest, referenceData, undefined, baseExecutionLock.digest), dataPackages = [...catalogPackages, ...managed.packages];
  const executionLock = createExecutionLock({connector: pin(primary), extensions: extensions.map(pin), dataPacks: dataPackages.map(pkg => ({id: pkg.manifest.id, version: pkg.manifest.version, digest: pkg.packageDigest}))});
  validateExecutionPackages(executionLock, [...packages, ...dataPackages]);
  return {primary, extensions, packages, dataPackages, catalogs, executionLock, referenceData: managed.referenceData, referenceArtifacts: managed.artifacts};
}
