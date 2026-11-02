// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryStore} from '../../workbench/storage.mjs';
import {createWorkItemStore, workItemActorKey, isWorkItemParticipant} from '../work-items.mjs';

const alice = {id: 'private-alice-identity'}, bob = {id: 'private-bob-identity'};
const selected = {gameId: 'synthetic-frontier', issueNumber: 42, featureKey: 'companions.rename'};
const setup = () => { let now = 1000; const store = createMemoryStore(), claims = createWorkItemStore({store, now: () => now}); return {store, claims, advance: value => { now += value; }}; };

test('two simultaneous claims have one winner; the second sees active work instead of duplicating it', async () => {
  const {claims} = setup();
  const results = await Promise.all([claims.claim(alice, {...selected, expectedRevision: 0}), claims.claim(bob, {...selected, expectedRevision: 0})]);
  assert.equal(results.filter(result => result.status === 'claimed').length, 1);
  assert.equal(results.filter(result => result.status === 'already_claimed').length, 1);
  assert.equal(results[0].workItem.id, results[1].workItem.id);
  assert.equal(results[0].workItem.claimant, results[1].workItem.claimant);
  assert.equal(results[0].workItem.revision, 1);
  assert.deepEqual(results[0].workItem.github, {authority: 'github', projection: 'pending', assignmentVerified: false});
  assert.ok(!JSON.stringify(results).includes(alice.id));
  assert.ok(!JSON.stringify(results).includes(bob.id));
});

test('joining is explicit and revision checked; claimants and collaborators are distinct', async () => {
  const {claims} = setup(); await claims.claim(alice, {...selected, expectedRevision: 0});
  await assert.rejects(claims.join(bob, {...selected, expectedRevision: 0}), {code: 'WORK_ITEM_REVISION_CONFLICT'});
  const joined = await claims.join(bob, {...selected, expectedRevision: 1});
  assert.equal(joined.status, 'joined'); assert.equal(joined.workItem.revision, 2);
  assert.deepEqual(joined.workItem.collaborators, [workItemActorKey(bob, selected.gameId)]);
  assert.equal(isWorkItemParticipant(alice, joined.workItem), true);
  assert.equal(isWorkItemParticipant(bob, joined.workItem), true);
  assert.equal(isWorkItemParticipant({id: 'charlie'}, joined.workItem), false);
  assert.equal(isWorkItemParticipant(null, joined.workItem), false);
  assert.equal((await claims.join(alice, {...selected, expectedRevision: 2})).status, 'already_joined');
  assert.equal((await claims.join(bob, {...selected, expectedRevision: 2})).status, 'already_joined');
  assert.equal((await claims.read(selected)).revision, 2);
});

test('stale activity is a hint and never an automatic reassignment', async () => {
  const {claims, advance} = setup(); await claims.claim(alice, {...selected, expectedRevision: 0}); advance(15 * 86400000);
  const existing = await claims.claim(bob, {...selected, expectedRevision: 1});
  assert.equal(existing.status, 'already_claimed'); assert.equal(existing.workItem.stale, true); assert.equal(existing.workItem.revision, 1);
  await assert.rejects(claims.release(bob, {...selected, expectedRevision: 1}), {code: 'WORK_ITEM_RELEASE_FORBIDDEN'});
  assert.equal((await claims.read(selected)).claimant, workItemActorKey(alice, selected.gameId));
});

test('release preserves a tombstone so stale writes cannot resurrect a prior claim', async () => {
  const {claims} = setup(); await claims.claim(alice, {...selected, expectedRevision: 0});
  const released = await claims.release(alice, {...selected, expectedRevision: 1}); assert.equal(released.workItem.state, 'released'); assert.equal(released.workItem.revision, 2);
  await assert.rejects(claims.claim(bob, {...selected, expectedRevision: 0}), {code: 'WORK_ITEM_REVISION_CONFLICT'});
  const reclaimed = await claims.claim(bob, {...selected, expectedRevision: 2}); assert.equal(reclaimed.status, 'claimed'); assert.equal(reclaimed.workItem.revision, 3);
  assert.equal(reclaimed.workItem.claimant, workItemActorKey(bob, selected.gameId));
  assert.equal((await claims.claim(alice, {...selected, expectedRevision: 1})).status, 'already_claimed');
});

test('game, issue and feature boundaries are independent; global game claims are rejected', async () => {
  const {claims} = setup();
  await claims.claim(alice, {...selected, expectedRevision: 0});
  await claims.claim(bob, {...selected, issueNumber: 43, expectedRevision: 0});
  await claims.claim(bob, {...selected, gameId: 'another-game', expectedRevision: 0});
  await claims.claim(bob, {...selected, featureKey: 'companions.health', expectedRevision: 0});
  assert.equal((await claims.list(selected.gameId)).length, 3); assert.equal((await claims.list('another-game')).length, 1);
  for (const featureKey of ['all', 'game', 'whole-game', '../escape', 'Companions Rename']) await assert.rejects(claims.claim(alice, {...selected, featureKey, expectedRevision: 0}), {code: 'WORK_ITEM_TARGET_INVALID'});
  assert.notEqual(workItemActorKey(alice, 'another-game'), workItemActorKey(alice, selected.gameId));
});

test('a lost CAS on join preserves the other collaborator and does not silently retry', async () => {
  const {claims} = setup(); await claims.claim(alice, {...selected, expectedRevision: 0});
  const results = await Promise.allSettled([claims.join(bob, {...selected, expectedRevision: 1}), claims.join({id: 'charlie'}, {...selected, expectedRevision: 1})]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'WORK_ITEM_REVISION_CONFLICT');
  assert.equal((await claims.read(selected)).collaborators.length, 1);
});

test('release ends feature participation without deleting history; projections contain only metadata', async () => {
  const {claims, store} = setup(); await claims.claim(alice, {...selected, expectedRevision: 0});
  await claims.join(bob, {...selected, expectedRevision: 1});
  const rows = await store.list('collaboration/work-items/');
  const row = rows[0]; await store.put(row.key, {...row.value, extraPrivateField: 'do-not-project'}, {ifMatch: row.etag});
  const current = await claims.read(selected);
  assert.equal('extraPrivateField' in current, false);
  const released = await claims.release(alice, {...selected, expectedRevision: 2});
  assert.equal(released.workItem.revision, 3); assert.equal(released.workItem.state, 'released');
  assert.deepEqual(released.workItem.collaborators, []);
  assert.equal(isWorkItemParticipant(alice, released.workItem), false);
  assert.equal(isWorkItemParticipant(bob, released.workItem), false);
  assert.equal((await claims.list(selected.gameId)).length, 1);
});
