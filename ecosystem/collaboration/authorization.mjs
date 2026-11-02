// SPDX-License-Identifier: Apache-2.0
import {createHash} from 'node:crypto';

export class CollaborationAccessError extends Error {
  constructor(code, message, status = 403) { super(message); this.name = 'CollaborationAccessError'; this.code = code; this.status = status; }
}
export function accessFail(code, message, status) { throw new CollaborationAccessError(code, message, status); }
export const accessDigest = value => createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
export function stableJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return '{' + Object.keys(value).sort().map(key => {
      if (['__proto__', 'prototype', 'constructor'].includes(key) || Object.getOwnPropertyDescriptor(value, key)?.get || Object.getOwnPropertyDescriptor(value, key)?.set) accessFail('COLLABORATION_VALUE_INVALID', 'Only plain bounded JSON values are supported.', 400);
      return JSON.stringify(key) + ':' + stableJson(value[key]);
    }).join(',') + '}';
  }
  accessFail('COLLABORATION_VALUE_INVALID', 'Only plain bounded JSON values are supported.', 400);
}
export const accessCopy = value => JSON.parse(stableJson(value));
export function developerKey(principal) {
  if (!principal || typeof principal.id !== 'string' || !principal.id || principal.id.length > 300 || /[\u0000-\u001f\u007f]/.test(principal.id) || !Array.isArray(principal.scopes) || principal.scopes.length > 100 || principal.scopes.some(value => typeof value !== 'string' || value.length > 100)) accessFail('DEVELOPER_SIGN_IN_REQUIRED', 'Sign in to use hosted developer resources.', 401);
  return accessDigest('saverift.developer.enrollment.v1\0' + principal.id);
}

export const GAME_ROLES = Object.freeze(['contributor', 'reviewer', 'maintainer']);
const actions = {
  'workspace:create': 'contributor', 'workspace:read': 'contributor', 'workspace:write': 'contributor',
  'fixture:upload': 'contributor', 'fixture:inspect': 'contributor', 'fixture:delete': 'contributor', 'fixture:consent': 'contributor',
  'catalog:import': 'contributor', 'catalog:query': 'contributor', 'job:run': 'contributor', 'job:read': 'contributor', 'job:cancel': 'contributor',
  'preview:create': 'contributor', 'preview:read': 'contributor', 'draft:read': 'contributor', 'draft:write': 'contributor',
  'git:read': 'contributor', 'git:branch': 'contributor', 'git:commit': 'contributor', 'git:pull-request': 'contributor', 'git:update': 'contributor',
  'issue:read': 'contributor', 'issue:claim': 'contributor', 'issue:join': 'contributor', 'issue:propose': 'contributor',
  'release:prepare': 'contributor', 'registry:submit': 'contributor', 'trial:request': 'contributor',
  'contribution:review': 'reviewer', 'issue:triage': 'reviewer', 'contribution:merge': 'maintainer', 'project:maintain': 'maintainer'
};
export const GAME_ACTIONS = Object.freeze({...actions});
const aliases = {
  discovery: 'project:read', 'project.read': 'project:read', 'issue.read': 'issue:read', claim: 'issue:claim', join: 'issue:join', propose: 'issue:propose',
  'workspace.create': 'workspace:create', 'workspace.read': 'workspace:read', 'workspace.write': 'workspace:write', 'source.read': 'workspace:read', 'source.write': 'workspace:write',
  'source.export': 'source:export', 'workspace:export': 'source:export', 'workspace.export': 'source:export',
  'git.read': 'git:read', 'git.write': 'git:commit', 'git:write': 'git:commit', 'pr.create': 'git:pull-request', 'pr:write': 'git:pull-request',
  'source:checkpoint': 'git:commit', 'source:update': 'git:update', 'preview.read': 'preview:read', 'preview.create': 'preview:create'
};
export function normalizeGameAction(action) {
  const normalized = aliases[action] || action;
  if (!Object.hasOwn(actions, normalized) && !['project:read', 'source:export'].includes(normalized)) accessFail('GAME_ACTION_FORBIDDEN', 'This game role does not grant that action.');
  return normalized;
}
export function roleAllows(role, action) {
  const normalized = normalizeGameAction(action), required = actions[normalized];
  return !required || GAME_ROLES.indexOf(role) >= GAME_ROLES.indexOf(required) && GAME_ROLES.includes(role);
}
export function normalizeProjectPath(value, {directory = false} = {}) {
  if (typeof value !== 'string' || !value || value.length > 240 || value !== value.normalize('NFC') || value.startsWith('/') || /[\\:%\u0000-\u001f\u007f]/.test(value)) accessFail('PROJECT_PATH_REJECTED', 'Use a canonical relative project path.', 400);
  const path = directory && value.endsWith('/') ? value.slice(0, -1) : value;
  if (path.split('/').some(part => !part || part === '.' || part === '..')) accessFail('PROJECT_PATH_REJECTED', 'Project paths cannot escape their package.', 400);
  return directory ? path + '/' : path;
}
export function assertProjectPath(project, value) {
  const path = normalizeProjectPath(value);
  const denied = /(?:^|\/)(?:\.git|\.github|node_modules|private|fixtures?|backups?|captures?|logs?)(?:\/|$)|(?:^|\/)(?:CODEOWNERS|\.env(?:\..*)?|credentials?(?:\..*)?|tokens?(?:\..*)?|sessions?(?:\..*)?|cookies?(?:\..*)?)$/i;
  const hostPolicy = /^(?:ecosystem\/(?:sdk|registry|workbench|collaboration)|packages\/(?:sdk|mcp)|registry)(?:\/|$)/i;
  if (denied.test(path) || hostPolicy.test(path) || !project?.packageRoots?.some(root => path.startsWith(root))) accessFail('PROJECT_PATH_FORBIDDEN', 'This contribution path is outside the authorized package or is protected.');
  return path;
}
