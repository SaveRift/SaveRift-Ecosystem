// SPDX-License-Identifier: Apache-2.0
// Source-only three-way migration. Fixture bytes and consent never enter here.
import {sha256, fail} from './storage.mjs';

const own = (files, path) => Object.hasOwn(files, path);
const value = (files, path) => own(files, path) ? files[path] : null;
const hash = content => content === null ? null : sha256(content);
const action = (before, after) => before === null ? 'added' : after === null ? 'removed' : 'changed';
export function migrationSourceDiff(base, local, canonical = base, resolutions = []) {
  const selected = new Map();
  for (const resolution of resolutions) {
    if (selected.has(resolution.path) || !['local', 'canonical'].includes(resolution.choice)) fail('MIGRATION_RESOLUTION_INVALID', 'Choose each conflicting source path only once.');
    selected.set(resolution.path, resolution.choice);
  }
  const files = structuredClone(canonical), diff = [], conflicts = [], applied = new Set();
  for (const path of [...new Set([...Object.keys(base), ...Object.keys(local)])].sort()) {
    const before = value(base, path), ours = value(local, path), theirs = value(canonical, path);
    if (before === ours) continue;
    const conflict = theirs !== before && theirs !== ours;
    const choice = conflict ? selected.get(path) || null : null;
    if (selected.has(path) && !conflict) fail('MIGRATION_RESOLUTION_INVALID', 'A resolution belongs to a conflicting path only.');
    if (choice) applied.add(path);
    const after = choice === 'canonical' ? theirs : ours;
    const row = {path, change: action(before, ours), beforeSha256: hash(before), localSha256: hash(ours), canonicalSha256: hash(theirs), proposedSha256: hash(after), conflict, choice};
    diff.push(row);
    if (conflict && !choice) conflicts.push(row);
    if (after === null) delete files[path]; else files[path] = after;
  }
  if ([...selected.keys()].some(path => !applied.has(path))) fail('MIGRATION_RESOLUTION_INVALID', 'A resolution no longer belongs to the reviewed source diff.');
  const changes = [...new Set([...Object.keys(canonical), ...Object.keys(files)])].sort().flatMap(path => value(canonical, path) === value(files, path) ? [] : [{path, content: value(files, path)}]);
  return {files, diff, conflicts, changes};
}

export function migrationFixtureMetadata(record) {
  return {id: record.id, workspaceId: record.workspaceId, name: record.name, role: record.role, byteLength: record.byteLength, sha256: record.sha256, aiAccess: record.aiAccess === true, synthetic: record.synthetic === true, createdAt: record.createdAt, expiresAt: record.expiresAt};
}
