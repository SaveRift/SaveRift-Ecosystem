// SPDX-License-Identifier: Apache-2.0
// Private claim intents coordinate work on canonical GitHub issues. They are
// neither GitHub assignments nor an independently editable public task board.
import {sha256, fail} from '../workbench/storage.mjs';

export const WORK_ITEM_SCHEMA = 'saverift.collaboration-work-item.v1';
const MAX_COLLABORATORS = 32;
const gamePattern = /^[a-z0-9][a-z0-9._-]{0,119}$/;
const featurePattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const actorPattern = /^[a-f0-9]{64}$/;
const clone = value => structuredClone(value);
const revisionValid = value => Number.isSafeInteger(value) && value >= 0;

function target(input) {
  const {gameId, issueNumber, featureKey} = input || {};
  if (typeof gameId !== 'string' || !gamePattern.test(gameId) || !Number.isSafeInteger(issueNumber) || issueNumber < 1 || issueNumber > 2147483647 || typeof featureKey !== 'string' || featureKey.length < 3 || featureKey.length > 120 || !featurePattern.test(featureKey) || ['all', 'game', 'whole-game', 'entire-game'].includes(featureKey)) fail('WORK_ITEM_TARGET_INVALID', 'Choose a canonical issue and a small, named feature.');
  return {gameId, issueNumber, featureKey};
}
const keyFor = value => `collaboration/work-items/${sha256(value.gameId)}/${sha256(JSON.stringify([value.issueNumber, value.featureKey]))}`;
const sameTarget = (a, b) => a.gameId === b.gameId && a.issueNumber === b.issueNumber && a.featureKey === b.featureKey;

export function workItemActorKey(principal, gameId) {
  if (!principal || typeof principal.id !== 'string' || !principal.id || principal.id.length > 300 || !gamePattern.test(gameId || '')) fail('DEVELOPER_SIGN_IN_REQUIRED', 'A verified developer identity is required.', 401);
  return sha256(`saverift.work-item.actor.v1\0${gameId}\0${principal.id}`);
}

export function isWorkItemParticipant(principal, workItem) {
  if (!principal || typeof principal.id !== 'string' || !principal.id || principal.id.length > 300 || !workItem || workItem.state !== 'active' || !gamePattern.test(workItem.gameId || '')) return false;
  const actor = workItemActorKey(principal, workItem.gameId);
  return workItem.claimant === actor || Array.isArray(workItem.collaborators) && workItem.collaborators.includes(actor);
}

export function createWorkItemStore({store, now = Date.now, staleAfterMs = 14 * 86400000} = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function' || typeof store.list !== 'function' || typeof now !== 'function' || !Number.isSafeInteger(staleAfterMs) || staleAfterMs < 60000) throw Error('A conditional private store and bounded work-item clock policy are required.');
  function stamp() { const value = now(); if (!Number.isSafeInteger(value) || value < 0) fail('WORK_ITEM_CLOCK_INVALID', 'The coordination clock is unavailable.', 503); return value; }
  function checked(row, selected) {
    if (!row) return null;
    const value = row.value;
    if (!value || value.schema !== WORK_ITEM_SCHEMA || !sameTarget(value, selected) || !/^work_[a-f0-9]{32}$/.test(value.id || '') || !revisionValid(value.revision) || value.revision < 1 || !['active', 'released'].includes(value.state) || !Array.isArray(value.collaborators) || value.collaborators.length > MAX_COLLABORATORS || value.collaborators.some(a => !actorPattern.test(a)) || new Set(value.collaborators).size !== value.collaborators.length || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0 || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < value.createdAt || value.state === 'active' && (!actorPattern.test(value.claimant || '') || value.collaborators.includes(value.claimant)) || value.state === 'released' && (value.claimant !== null || value.collaborators.length)) fail('WORK_ITEM_STORED_INVALID', 'This coordination record could not be verified.', 409);
    return row;
  }
  async function readRow(selected) { return checked(await store.get(keyFor(selected)), selected); }
  function view(row) {
    if (!row) return null;
    const value = row.value;
    // Project only coordination metadata, even if storage contains extra fields.
    const {schema, id, gameId, issueNumber, featureKey, revision, state, claimant, collaborators, createdAt, updatedAt} = value;
    return {schema, id, gameId, issueNumber, featureKey, revision, state, claimant, collaborators: clone(collaborators), createdAt, updatedAt, github: projection(), stale: state === 'active' && stamp() - updatedAt >= staleAfterMs};
  }
  function expected(input, row) {
    if (!revisionValid(input.expectedRevision) || input.expectedRevision !== (row?.value.revision || 0)) fail('WORK_ITEM_REVISION_CONFLICT', 'This feature changed. Review its current collaborators before retrying.', 409);
    if (input.expectedRevision === Number.MAX_SAFE_INTEGER) fail('WORK_ITEM_REVISION_EXHAUSTED', 'This feature needs a new coordination record.', 409);
  }
  async function save(selected, row, value) {
    try { return await store.put(keyFor(selected), value, row ? {ifMatch: row.etag} : {ifAbsent: true}); }
    catch (error) { if (error.code === 'REVISION_CONFLICT') fail('WORK_ITEM_REVISION_CONFLICT', 'This feature changed. Review its current collaborators before retrying.', 409); throw error; }
  }
  const projection = () => ({authority: 'github', projection: 'pending', assignmentVerified: false});

  return Object.freeze({
    async read(input) { const selected = target(input); return view(await readRow(selected)); },
    async list(gameId, {limit = 100} = {}) {
      if (!gamePattern.test(gameId || '') || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) fail('WORK_ITEM_LIST_INVALID', 'Use a valid project and bounded list.');
      const rows = await store.list(`collaboration/work-items/${sha256(gameId)}/`, limit);
      return rows.map(row => { const selected = target(row.value); if (selected.gameId !== gameId) fail('WORK_ITEM_STORED_INVALID', 'This coordination record could not be verified.', 409); return view(checked(row, selected)); }).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    },
    async claim(principal, input) {
      const selected = target(input), actor = workItemActorKey(principal, selected.gameId), row = await readRow(selected);
      if (!revisionValid(input.expectedRevision)) fail('WORK_ITEM_REVISION_CONFLICT', 'An exact coordination revision is required.', 409);
      // Existing work is shown, including stale work; it is never silently stolen.
      if (row?.value.state === 'active') return {status: 'already_claimed', workItem: view(row)};
      expected(input, row); const at = Math.max(stamp(), row?.value.updatedAt || 0);
      const value = {schema: WORK_ITEM_SCHEMA, id: row?.value.id || `work_${sha256(JSON.stringify(selected)).slice(0, 32)}`, ...selected, revision: input.expectedRevision + 1, state: 'active', claimant: actor, collaborators: [], createdAt: row?.value.createdAt ?? at, updatedAt: at, github: projection()};
      try { return {status: 'claimed', workItem: view(await save(selected, row, value))}; }
      catch (error) {
        if (error.code !== 'WORK_ITEM_REVISION_CONFLICT') throw error;
        const current = await readRow(selected);
        if (current?.value.state === 'active') return {status: 'already_claimed', workItem: view(current)};
        throw error;
      }
    },
    async join(principal, input) {
      const selected = target(input), actor = workItemActorKey(principal, selected.gameId), row = await readRow(selected); expected(input, row);
      if (row?.value.state !== 'active') fail('WORK_ITEM_NOT_CLAIMED', 'Choose active work to join.', 409);
      if (row.value.claimant === actor || row.value.collaborators.includes(actor)) return {status: 'already_joined', workItem: view(row)};
      if (row.value.collaborators.length >= MAX_COLLABORATORS) fail('WORK_ITEM_COLLABORATOR_LIMIT', 'This feature has reached its collaborator limit.', 409);
      const value = {...row.value, revision: input.expectedRevision + 1, collaborators: [...row.value.collaborators, actor], updatedAt: Math.max(stamp(), row.value.updatedAt), github: projection()};
      return {status: 'joined', workItem: view(await save(selected, row, value))};
    },
    async release(principal, input) {
      const selected = target(input), actor = workItemActorKey(principal, selected.gameId), row = await readRow(selected); expected(input, row);
      if (row?.value.state !== 'active' || row.value.claimant !== actor) fail('WORK_ITEM_RELEASE_FORBIDDEN', 'Only the current claimant can release this feature.', 403);
      const value = {...row.value, revision: input.expectedRevision + 1, state: 'released', claimant: null, collaborators: [], updatedAt: Math.max(stamp(), row.value.updatedAt), github: projection()};
      // A released tombstone preserves monotonic revisions after opt-out/reclaim.
      return {status: 'released', workItem: view(await save(selected, row, value))};
    }
  });
}
