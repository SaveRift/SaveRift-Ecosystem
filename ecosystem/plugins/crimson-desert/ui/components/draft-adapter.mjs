// The public plugin owns this compatibility mapping, not the generic host.
const names = new Set(['inventory.setQuantity', 'inventory.setCopper', 'inventory.setExpansionValue', 'inventory.addItem', 'companions.add', 'cartography.reveal-map', 'cartography.unlock-nexus']);
const omitted = new Set(['schema', 'operation', 'status', 'publishEligible', 'canApply', 'displayName', 'classification', 'internalName', 'referenceMaxStack', 'capacityPlan', 'automaticSpaceExpansion', 'placementSource', 'runtimeRequirement']);
export const isCrimsonUiOperation = value => names.has(value?.id?.replace(/^crimson\./, ''));
export function publicOperations(intents) {
  if (!Array.isArray(intents) || intents.length > 128) throw Error('Too many queued changes.');
  return intents.map(intent => {
    if (!names.has(intent?.operation)) throw Error('This intention has no registered Crimson operation.');
    return {id: 'crimson.' + intent.operation, apiVersion: '0.1.0', params: Object.fromEntries(Object.entries(intent).filter(([key, value]) => !omitted.has(key) && value !== undefined))};
  });
}
export function legacyDrafts(canonical) {
  return (canonical?.operations || []).filter(isCrimsonUiOperation).map(value => {
    const operation = value.id.slice('crimson.'.length), params = value.params;
    const schema = operation === 'inventory.addItem' ? 'saveglass.item-addition-intent.v1' : operation === 'companions.add' ? 'saveglass.companion-addition-intent.v1' : operation.startsWith('cartography.') ? 'saveglass.cartography-staged.v1' : 'saveglass.crimson-staged-operation.v1';
    return {...params, schema, operation, ...(operation.startsWith('cartography.') ? {recipe: operation.slice('cartography.'.length), displayName: operation.endsWith('reveal-map') ? 'Reveal Map' : 'Nexus Unlock'} : {}), status: 'awaiting_combined_validation', publishEligible: false};
  });
}
