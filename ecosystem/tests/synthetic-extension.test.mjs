import test from 'node:test';
import assert from 'node:assert/strict';
import {expand, xpForLevel} from '../plugins/synthetic-extension/runtime.mjs';
const op = targetLevel => ({id: 'example.level-tools.setLevel', apiVersion: '0.1.0', params: {targetLevel}});
test('independent extension emits linked domain intent, not serialized output', () => {
  const original = {progression: {level: 4, xp: 2700, skillPoints: 3}, vehicle: {fuel: 17}, unknownBranch: {kept: true}};
  const result = expand({document: original, operation: op(10)});
  assert.deepEqual(result.operations, [{id: 'example.synthetic.setProgression', apiVersion: '0.1.0', params: {level: 10, xp: xpForLevel(10), skillPoints: 15}}]);
  assert.ok(!('outputs' in result)); assert.equal(original.progression.level, 4); assert.deepEqual(original.unknownBranch, {kept: true});
});
test('ordered extension operations use prior linked progression and reject spent point loss', () => {
  const first = expand({document: {progression: {level: 4, xp: 2700, skillPoints: 3}}, operation: op(10)});
  const second = expand({document: {progression: {level: 4, xp: 2700, skillPoints: 3}}, operation: op(12), priorOperations: first.operations});
  assert.equal(second.operations[0].params.skillPoints, 19);
  assert.throws(() => expand({document: {progression: {level: 10, xp: 72900, skillPoints: 0}}, operation: op(1)}), {code: 'LEVEL_SPENT_SKILLS_CONFLICT'});
});
test('extension requires actual domain data and bounded typed parameters', () => {
  for (const target of [0, 101, '10', NaN]) assert.throws(() => expand({document: {progression: {level: 1, xp: 0, skillPoints: 0}}, operation: op(target)}));
  assert.throws(() => expand({document: {}, operation: op(10)}), {code: 'LEVEL_DOMAIN_REQUIRED'});
});
