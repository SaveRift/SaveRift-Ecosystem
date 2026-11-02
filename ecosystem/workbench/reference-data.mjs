// SPDX-License-Identifier: Apache-2.0
// Deployment-owned reference data is not workspace source or a player fixture.
import {validatePackage, logicalPath} from '../sdk/contracts.mjs';
import {createExecutionLock, verifyExecutionLock} from '../sdk/registry.mjs';
import {sha256, fail} from './storage.mjs';

const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const empty = () => ({referenceData: null, packages: [], artifacts: [], resources: []});

/** Recompute every package/resource pin; no manifest flag grants this attachment. */
export function referenceDataFor(primaryDigest, supplied, executionLock, expectedBaseExecutionLockDigest) {
  if (supplied === undefined || supplied === null) return empty();
  if (!hash(primaryDigest) || supplied.primaryDigest !== primaryDigest || !hash(supplied.baseExecutionLockDigest) || !Array.isArray(supplied.packages) || supplied.packages.length > 8) fail('REFERENCE_DATA_BINDING_INVALID', 'Managed reference data must bind this exact executable closure.');
  if (executionLock && (!verifyExecutionLock(executionLock) || executionLock.connector.digest !== primaryDigest)) fail('REFERENCE_DATA_LOCK_INVALID', 'Managed references require the verified execution lock.');
  if (expectedBaseExecutionLockDigest !== undefined && (!hash(expectedBaseExecutionLockDigest) || supplied.baseExecutionLockDigest !== expectedBaseExecutionLockDigest)) fail('REFERENCE_DATA_BINDING_INVALID', 'Managed reference approval belongs to another executable closure.');
  const packages = [], artifacts = [], resources = [], ids = new Set(), paths = new Set();
  for (const input of supplied.packages) {
    const checked = validatePackage(input), manifest = checked.manifest;
    if (manifest.kind !== 'data' || ids.has(manifest.id) || !Array.isArray(manifest.data?.resources)) fail('REFERENCE_DATA_INVALID', 'Managed references require distinct immutable data packages.');
    ids.add(manifest.id);
    const pin = {id: manifest.id, version: manifest.version, digest: checked.packageDigest};
    if (executionLock && !executionLock.dataPacks.some(value => value.id === pin.id && value.version === pin.version && value.digest === pin.digest)) fail('REFERENCE_DATA_LOCK_INVALID', 'Managed references are absent from the exact execution lock.');
    const localIds = new Set();
    for (const resource of manifest.data.resources) {
      if (!resource || typeof resource.id !== 'string' || !resource.id || resource.id.length > 200 || localIds.has(resource.id) || !hash(resource.sha256) || !Number.isSafeInteger(resource.byteLength) || resource.byteLength < 0) fail('REFERENCE_RESOURCE_INVALID', 'A managed resource needs a unique identifier and exact byte pin.');
      localIds.add(resource.id); logicalPath(resource.path);
      const bytes = checked.files.get(resource.path);
      if (!bytes || bytes.length !== resource.byteLength || sha256(bytes) !== resource.sha256) fail('REFERENCE_RESOURCE_MISMATCH', 'Managed resource bytes differ from the reviewed package manifest.');
      const id = 'managed_' + sha256(pin.digest + '\0' + resource.id).slice(0, 48), name = 'managed-reference/' + pin.digest.slice(0, 16) + '/' + resource.path;
      logicalPath(name);
      if (paths.has(name) || artifacts.some(value => value.id === id) || artifacts.length >= 128) fail('REFERENCE_RESOURCE_INVALID', 'Managed resource paths and handles must be bounded and unique.');
      paths.add(name);
      artifacts.push({id, name, role: 'reference-data', bytes});
      resources.push({artifactId: id, package: pin, resource: {...resource}});
    }
    packages.push({manifest, files: checked.files, packageDigest: checked.packageDigest});
  }
  const baseDigest = expectedBaseExecutionLockDigest ?? (executionLock && createExecutionLock({...executionLock, dataPacks: executionLock.dataPacks.filter(pin => !ids.has(pin.id))}).digest);
  if (!baseDigest || supplied.baseExecutionLockDigest !== baseDigest) fail('REFERENCE_DATA_BINDING_INVALID', 'Managed reference approval belongs to another executable closure.');
  return {referenceData: {primaryDigest, baseExecutionLockDigest: baseDigest, packages}, packages, artifacts, resources};
}

/** Only an exact method/id/selected handle resolves a managed resource. */
export function queryReferenceResource(resources, query) {
  if (!query || query.method !== 'saverift.data.resource' || typeof query.id !== 'string' || typeof query.artifactId !== 'string') fail('REFERENCE_RESOURCE_UNAVAILABLE', 'Select one exact managed resource.');
  const selected = resources.filter(value => value.resource.id === query.id && value.artifactId === query.artifactId);
  if (selected.length !== 1) fail('REFERENCE_RESOURCE_UNAVAILABLE', 'The requested managed resource is unavailable in this execution.');
  const {package: pin, resource} = selected[0];
  return {package: {...pin}, resource: {...resource}};
}
