// SPDX-License-Identifier: Apache-2.0
export const FIELD_OPERATIONS = Object.freeze({
  quantity: {id: 'acshadows.inventory.setQuantity', expected: 'expectedQuantity', label: 'Quantity', min: 1, max: 999999},
  level: {id: 'acshadows.inventory.setLevel', expected: 'expectedLevel', label: 'Item level', min: 1, max: 100},
});
export const isAcOperation = operation => Object.values(FIELD_OPERATIONS).some(field => field.id === operation.id);
export const fieldForOperation = operation => Object.keys(FIELD_OPERATIONS).find(field => FIELD_OPERATIONS[field].id === operation.id);
export function pendingValue(draft, record, field) {
  const id = FIELD_OPERATIONS[field]?.id;
  const operation = (draft?.operations || []).filter(op => op.id === id && op.params.recordId === record.recordId).at(-1);
  return operation ? operation.params[field] : record[field];
}
export function editRequest(draft, record, field, value, sourceSha256, maxOperations = 16) {
  const definition = FIELD_OPERATIONS[field];
  if (!definition || !record.editableFields?.includes(field)) throw Error('This field is read-only for this record.');
  if (!Number.isSafeInteger(draft?.revision)) throw Error('Reload the shared draft before editing.');
  if (!Number.isSafeInteger(value) || value < definition.min || value > definition.max) throw Error(`${definition.label} must be a whole number from ${definition.min} to ${definition.max}.`);
  if (typeof record.recordId !== 'string' || !/^[a-f0-9]{64}$/.test(sourceSha256)) throw Error('This selection is missing its source witness. Reopen it.');
  const removeInstanceIds = draft.operations.filter(op => op.id === definition.id && op.params.recordId === record.recordId).map(op => op.instanceId);
  const operations = value === record[field] ? [] : [{id: definition.id, apiVersion: '0.1.0', params: {recordId: record.recordId, [definition.expected]: record[field], [field]: value, sourceSha256}}];
  if (draft.operations.length - removeInstanceIds.length + operations.length > maxOperations) throw Error(`This connector supports ${maxOperations} changes per candidate. Review or remove changes before adding another.`);
  return {expectedRevision: draft.revision, operations, removeInstanceIds};
}
