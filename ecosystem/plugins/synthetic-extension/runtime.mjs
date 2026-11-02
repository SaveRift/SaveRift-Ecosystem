// SPDX-License-Identifier: Apache-2.0
// An extension transforms intent, never final save bytes or cloud requests.
export const LEVEL_API = 'example.synthetic.document@0.1.0';
export const xpForLevel = level => (level - 1) ** 3 * 100;
function fail(code) { throw Object.assign(Error(code), {code}); }
export function describe() {
  return {extensionApi: LEVEL_API, views: [{id: 'example.level-tools.graph', kind: 'custom', title: 'Progression Workshop'}], operations: [{id: 'example.level-tools.setLevel', apiVersion: '0.1.0', writeDomains: [{path: 'progression', mode: 'ordered'}]}]};
}
export function expand({document, operation, priorOperations = []}) {
  if (operation?.id !== 'example.level-tools.setLevel' || operation.apiVersion !== '0.1.0' || !operation.params || Object.keys(operation.params).join(',') !== 'targetLevel') fail('LEVEL_OPERATION_INVALID');
  const target = operation.params.targetLevel;
  if (!Number.isSafeInteger(target) || target < 1 || target > 100) fail('LEVEL_TARGET_INVALID');
  const previous = [...priorOperations].reverse().find(value => value.id === 'example.synthetic.setProgression');
  const current = previous?.params || document?.progression;
  if (!current || !['level', 'xp', 'skillPoints'].every(key => Number.isSafeInteger(current[key]) && current[key] >= 0) || current.level < 1 || current.level > 100) fail('LEVEL_DOMAIN_REQUIRED');
  const skillPoints = current.skillPoints + (target - current.level) * 2;
  if (skillPoints < 0) fail('LEVEL_SPENT_SKILLS_CONFLICT');
  return {operations: [{id: 'example.synthetic.setProgression', apiVersion: '0.1.0', params: {level: target, xp: xpForLevel(target), skillPoints}}], writeDomains: ['progression'], summary: {before: current, after: {level: target, xp: xpForLevel(target), skillPoints}}};
}
export default {describe, expand};
