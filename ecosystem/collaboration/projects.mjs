// SPDX-License-Identifier: Apache-2.0
import {accessCopy, accessDigest, accessFail, normalizeProjectPath} from './authorization.mjs';

const ID = /^[a-z][a-z0-9._-]{0,79}$/;
const validId = value => typeof value === 'string' && ID.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
const PIN = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
function text(value, max = 120) { return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value); }
function repository(value) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || value.privateProduction === true || value.purpose === 'production' || !/^[1-9][0-9]{0,19}$/.test(String(value.id || '')) || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value.owner || '') || !/^[A-Za-z0-9_.-]{1,100}$/.test(value.name || '') || !text(value.defaultBranch, 120) || /(?:\.\.|[\\\s~^:?*\[\]])/.test(value.defaultBranch) || value.defaultBranch.startsWith('/') || value.defaultBranch.endsWith('/')) accessFail('PROJECT_REPOSITORY_INVALID', 'Configure an exact ecosystem repository and branch.', 400);
  return {id: String(value.id), owner: value.owner, name: value.name, defaultBranch: value.defaultBranch, provider: 'github', url: `https://github.com/${value.owner}/${value.name}`};
}

export const DEFAULT_GAME_PROJECTS = Object.freeze([
  {id: 'crimson-desert', displayName: 'Crimson Desert', packageId: 'saverift.crimson-desert', packageRoots: ['ecosystem/plugins/crimson-desert/'], templateIds: ['plugin-saverift.crimson-desert'], license: 'MPL-2.0 AND BSD-2-Clause AND BSD-3-Clause AND MIT AND Apache-2.0', packageDigest: '8fd6680c1f65ec9c3564acf082f2000836fd5f8848d1c3a00a293c8cad1a7a20', capabilities: ['inventory inspection', 'quantity/currency/capacity editing', 'item and companion additions', 'Cartography', 'presets', 'Advanced import'], repository: null, maintainers: [], enrollmentOpen: true},
  {id: 'synthetic', displayName: 'Synthetic examples', packageId: 'example.synthetic-game', packageRoots: ['ecosystem/plugins/synthetic-game/', 'ecosystem/plugins/synthetic-extension/'], templateIds: ['synthetic-json', 'blank', 'plugin-example.synthetic-game', 'plugin-example.level-tools'], license: 'Apache-2.0', capabilities: ['public synthetic fixtures', 'custom progression graph', 'separate extension example'], repository: null, maintainers: [], enrollmentOpen: true}
]);

export function normalizeProject(input) {
  if (!input || typeof input !== 'object' || !validId(input.id) || !text(input.displayName) || !text(input.packageId, 160) || !input.packageId.includes('.') || !Array.isArray(input.packageRoots) || !input.packageRoots.length || input.packageRoots.length > 12 || !Array.isArray(input.templateIds) || input.templateIds.length > 30 || input.templateIds.some(value => !validId(value)) || !text(input.license, 240)) accessFail('PROJECT_CONFIGURATION_INVALID', 'A trusted project/package mapping is required.', 400);
  const roots = input.packageRoots.map(root => normalizeProjectPath(root, {directory: true}));
  if (new Set(roots).size !== roots.length || roots.some(root => /(?:^|\/)(?:\.git|\.github|private|node_modules)(?:\/|$)/i.test(root))) accessFail('PROJECT_CONFIGURATION_INVALID', 'Project roots must be distinct source package directories.', 400);
  if (input.packageDigest != null && !PIN.test(input.packageDigest) || input.baseCommit != null && !COMMIT.test(input.baseCommit)) accessFail('PROJECT_CONFIGURATION_INVALID', 'Source and package references must use exact digests.', 400);
  if (input.capabilities !== undefined && (!Array.isArray(input.capabilities) || input.capabilities.length > 128 || input.capabilities.some(value => !text(value, 240)))) accessFail('PROJECT_CONFIGURATION_INVALID', 'Capabilities must use bounded public labels.', 400);
  if (input.maintainers !== undefined && (!Array.isArray(input.maintainers) || input.maintainers.length > 30 || input.maintainers.some(value => !text(value, 80)))) accessFail('PROJECT_CONFIGURATION_INVALID', 'Maintainer labels must be public and bounded.', 400);
  const issueLabel = input.issueLabel || `game:${input.id}`, branchPrefix = input.branchPrefix || `saverift/${input.id}/`;
  if (!text(issueLabel, 100) || !/^[A-Za-z0-9][A-Za-z0-9 ._:-]{0,99}$/.test(issueLabel) || !branchPrefix.startsWith('saverift/') || branchPrefix.length > 140 || /(?:\.\.|[\\\s~^:?*\[\]])/.test(branchPrefix) || !branchPrefix.endsWith('/')) accessFail('PROJECT_CONFIGURATION_INVALID', 'Issue and branch mappings are invalid.', 400);
  const result = {id: input.id, displayName: input.displayName, packageId: input.packageId, packageRoots: roots, templateIds: [...input.templateIds], license: input.license, repository: repository(input.repository), packageDigest: input.packageDigest ?? null, baseCommit: input.baseCommit ?? null, maintainers: [...(input.maintainers || [])], capabilities: [...(input.capabilities || [])], issueLabel, branchPrefix, enrollmentOpen: input.enrollmentOpen !== false};
  return Object.freeze({...result, projectDigest: accessDigest(result), repositoryState: result.repository ? 'configured' : 'unconfigured'});
}

export function createProjectRegistry(input = DEFAULT_GAME_PROJECTS) {
  const list = input instanceof Map ? [...input.values()] : Array.isArray(input) ? input : Object.values(input || {});
  if (!list.length || list.length > 128) accessFail('PROJECT_CONFIGURATION_INVALID', 'Configure a bounded project list.', 400);
  const map = new Map();
  for (const value of list) { const project = normalizeProject(value); if (map.has(project.id)) accessFail('PROJECT_CONFIGURATION_INVALID', 'Project identifiers must be unique.', 400); map.set(project.id, project); }
  return Object.freeze({get(gameId) { const project = map.get(gameId); if (!project) accessFail('GAME_PROJECT_NOT_FOUND', 'This game project is unavailable.', 404); return accessCopy(project); }, list() { return [...map.values()].map(accessCopy); }});
}
