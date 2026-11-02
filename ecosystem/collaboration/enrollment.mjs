// SPDX-License-Identifier: Apache-2.0
import {randomUUID} from 'node:crypto';
import {accessCopy, accessFail, developerKey, GAME_ROLES, normalizeGameAction, roleAllows} from './authorization.mjs';
import {createProjectRegistry, DEFAULT_GAME_PROJECTS} from './projects.mjs';

export const MEMBERSHIP_SCHEMA = 'saverift.game-enrollment.v1';
const LEDGER_SCHEMA = 'saverift.game-enrollment-ledger.v1';
const states = ['disabled', 'enabled', 'suspended'];
const revision = value => Number.isSafeInteger(value) && value >= 0;
const exact = (value, keys) => value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Object.keys(value).every(key => !Object.getOwnPropertyDescriptor(value, key)?.get && !Object.getOwnPropertyDescriptor(value, key)?.set) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
function expected(input) { if (!revision(input?.expectedRevision)) accessFail('MEMBERSHIP_REVISION_REQUIRED', 'Refresh the enrollment before changing it.', 400); }
function publicMembership(gameId, record) { return {schema: MEMBERSHIP_SCHEMA, gameId, state: record?.state || 'disabled', role: record?.role || 'contributor', revision: record?.revision || 0, updatedAt: record?.updatedAt ?? null, authoringEnabled: record?.state === 'enabled'}; }

/** Separate from transport scopes, GitHub identity, fixture consent and release authority. */
export function createGameAccess({store, projects = DEFAULT_GAME_PROJECTS, now = Date.now, isPlatformAdmin = async () => false, maxEnabledGames = 16, maxMemberships = 64} = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function' || typeof now !== 'function' || typeof isPlatformAdmin !== 'function' || !Number.isSafeInteger(maxEnabledGames) || maxEnabledGames < 1 || maxEnabledGames > 64 || !Number.isSafeInteger(maxMemberships) || maxMemberships < maxEnabledGames || maxMemberships > 128) accessFail('GAME_ACCESS_CONFIGURATION_INVALID', 'A trusted enrollment store and bounded quotas are required.', 500);
  const registry = createProjectRegistry(projects), key = principal => `collaboration/enrollments/${developerKey(principal)}`;
  function stamp() { const value = now(); if (!Number.isSafeInteger(value) || value < 0) accessFail('ENROLLMENT_CLOCK_INVALID', 'The enrollment clock is unavailable.', 503); return value; }
  function checked(row, principal) {
    if (!row) return {schema: LEDGER_SCHEMA, developer: developerKey(principal), revision: 0, memberships: {}};
    const value = row.value;
    if (!exact(value, ['schema', 'developer', 'revision', 'memberships']) || value.schema !== LEDGER_SCHEMA || value.developer !== developerKey(principal) || !revision(value.revision) || !value.memberships || typeof value.memberships !== 'object' || Array.isArray(value.memberships) || Object.keys(value.memberships).length > maxMemberships) accessFail('ENROLLMENT_RECORD_INVALID', 'The enrollment record could not be verified.', 409);
    for (const [id, record] of Object.entries(value.memberships)) if (!exact(record, ['gameId', 'state', 'role', 'revision', 'epoch', 'updatedAt']) || id !== record.gameId || !states.includes(record.state) || !GAME_ROLES.includes(record.role) || !revision(record.revision) || !record.revision || record.revision > value.revision || typeof record.epoch !== 'string' || !/^[a-f0-9-]{36}$/.test(record.epoch) || !Number.isSafeInteger(record.updatedAt) || record.updatedAt < 0) accessFail('ENROLLMENT_RECORD_INVALID', 'The enrollment record could not be verified.', 409);
    return value;
  }
  async function current(principal, gameId) { registry.get(gameId); const row = await store.get(key(principal)), ledger = checked(row, principal); return {row, ledger, record: Object.hasOwn(ledger.memberships, gameId) ? ledger.memberships[gameId] : null}; }
  async function save(principal, gameId, input, update) {
    expected(input); const project = registry.get(gameId), {row, ledger, record} = await current(principal, gameId);
    if (input.expectedRevision !== (record?.revision || 0)) accessFail('MEMBERSHIP_REVISION_CONFLICT', 'Enrollment changed. Refresh it before retrying.', 409);
    const changes = update(record, project);
    if (changes === null) return publicMembership(gameId, record);
    if (ledger.revision === Number.MAX_SAFE_INTEGER || (record?.revision || 0) === Number.MAX_SAFE_INTEGER) accessFail('MEMBERSHIP_REVISION_EXHAUSTED', 'Enrollment needs administrator review.', 409);
    if (!record && Object.keys(ledger.memberships).length >= maxMemberships) accessFail('MEMBERSHIP_QUOTA', 'This developer has reached the project enrollment limit.', 429);
    const next = accessCopy(ledger); next.revision++; next.memberships[gameId] = {gameId, ...changes, revision: (record?.revision || 0) + 1, epoch: randomUUID(), updatedAt: stamp()};
    if (Object.values(next.memberships).filter(value => value.state === 'enabled').length > maxEnabledGames) accessFail('MEMBERSHIP_QUOTA', 'This developer has reached the active project limit.', 429);
    try { await store.put(key(principal), next, row ? {ifMatch: row.etag} : {ifAbsent: true}); }
    catch (error) { if (error.code === 'REVISION_CONFLICT') accessFail('MEMBERSHIP_REVISION_CONFLICT', 'Enrollment changed concurrently. Refresh it before retrying.', 409); throw error; }
    return publicMembership(gameId, next.memberships[gameId]);
  }
  async function ensureAdmin(actor) { developerKey(actor); if (await isPlatformAdmin(actor) !== true) accessFail('PLATFORM_ADMIN_REQUIRED', 'Only separately authorized platform administration can change game roles.'); }
  const access = {
    listProjects() { return registry.list(); },
    getProject(gameId) { return registry.get(gameId); },
    async getMembership(principal, gameId) { const {record} = await current(principal, gameId); return publicMembership(gameId, record); },
    async listMemberships(principal) { const row = await store.get(key(principal)), ledger = checked(row, principal); return Object.values(ledger.memberships).map(record => publicMembership(record.gameId, record)); },
    async enroll(principal, input) {
      if (!exact(input, ['gameId', 'expectedRevision'])) accessFail('ENROLLMENT_INPUT_INVALID', 'Choose one game and its current enrollment revision.', 400);
      return save(principal, input.gameId, input, (record, project) => {
        if (!project.enrollmentOpen) accessFail('GAME_ENROLLMENT_CLOSED', 'Enrollment for this game is closed.');
        if (record?.state === 'suspended') accessFail('MEMBERSHIP_SUSPENDED', 'Hosted developer access is suspended for this game.');
        return record?.state === 'enabled' ? null : {state: 'enabled', role: 'contributor'};
      });
    },
    async optOut(principal, input) {
      if (!exact(input, ['gameId', 'expectedRevision'])) accessFail('ENROLLMENT_INPUT_INVALID', 'Choose one game and its current enrollment revision.', 400);
      return save(principal, input.gameId, input, record => !record || record.state !== 'enabled' ? null : {state: 'disabled', role: record.role});
    },
    async assertAccess(principal, {gameId, action, capturedGrant} = {}) {
      const normalized = normalizeGameAction(action), project = registry.get(gameId);
      if (normalized === 'project:read') return {gameId, action: normalized, projectDigest: project.projectDigest, public: true};
      developerKey(principal);
      if (normalized === 'source:export') return {gameId, action: normalized, ownSourceOnly: true, fixturesAllowed: false};
      const {record} = await current(principal, gameId);
      if (!record || record.state !== 'enabled') accessFail(record?.state === 'suspended' ? 'MEMBERSHIP_SUSPENDED' : 'GAME_ENROLLMENT_REQUIRED', 'Enable developer tools for this game before using hosted resources.');
      if (!roleAllows(record.role, normalized)) accessFail('GAME_ROLE_REQUIRED', 'This action requires a separately assigned game role.');
      if (capturedGrant) {
        if (capturedGrant.gameId !== gameId) accessFail('GAME_GRANT_REVOKED', 'This operation belongs to a different game project.');
        await access.assertGrant(principal, capturedGrant);
      }
      return {gameId, action: normalized, role: record.role, membershipRevision: record.revision, projectDigest: project.projectDigest};
    },
    async captureGrant(principal, gameId) {
      await access.assertAccess(principal, {gameId, action: 'workspace:write'});
      const {record} = await current(principal, gameId), project = registry.get(gameId);
      // Re-check after the second read; revocation during an await cannot create a grant.
      if (!record || record.state !== 'enabled') accessFail('GAME_ENROLLMENT_REQUIRED', 'Enable developer tools for this game.');
      return Object.freeze({schema: 'saverift.game-access-grant.v1', developer: developerKey(principal), gameId, membershipRevision: record.revision, epoch: record.epoch, role: record.role, projectDigest: project.projectDigest});
    },
    async assertGrant(principal, grant) {
      if (!exact(grant, ['schema', 'developer', 'gameId', 'membershipRevision', 'epoch', 'role', 'projectDigest']) || grant.schema !== 'saverift.game-access-grant.v1' || grant.developer !== developerKey(principal)) accessFail('GAME_GRANT_REVOKED', 'This operation no longer has developer authorization.');
      const {record} = await current(principal, grant.gameId), project = registry.get(grant.gameId);
      if (!record || record.state !== 'enabled' || record.revision !== grant.membershipRevision || record.epoch !== grant.epoch || record.role !== grant.role || project.projectDigest !== grant.projectDigest) accessFail('GAME_GRANT_REVOKED', 'Developer access changed. Prepare the operation again.');
      return true;
    },
    // Trusted host methods. Deliberately absent from browser/MCP tool definitions.
    async setState(actor, principal, input) {
      await ensureAdmin(actor);
      if (!exact(input, ['gameId', 'expectedRevision', 'state']) || !states.includes(input.state)) accessFail('ENROLLMENT_INPUT_INVALID', 'Choose a valid membership state.', 400);
      return save(principal, input.gameId, input, record => ({state: input.state, role: record?.role || 'contributor'}));
    },
    async assignRole(actor, principal, input) {
      await ensureAdmin(actor);
      if (!exact(input, ['gameId', 'expectedRevision', 'role']) || !GAME_ROLES.includes(input.role)) accessFail('ENROLLMENT_INPUT_INVALID', 'Choose a valid game role.', 400);
      return save(principal, input.gameId, input, record => ({state: record?.state || 'disabled', role: input.role}));
    }
  };
  return Object.freeze(access);
}
