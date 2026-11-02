// Browser-safe limits for an existing typed stack. The inventory group is a
// source identity, not a restriction to the constructor's default destination.
import {catalogItemAdditionDefinition} from './catalog-item-profile.mjs';
export const validInventoryKey=key=>Number.isSafeInteger(key)&&key>=0&&key<=65535;
const decimal=value=>typeof value==='string'&&/^[1-9]\d{0,19}$/.test(value)&&BigInt(value)<=0xffffffffffffffffn;
export function existingStackQuantityProfile(definitionKey,referenceMaxStack){
  const native=catalogItemAdditionDefinition(definitionKey);
  if(!native||!decimal(native.maxStack)||!decimal(referenceMaxStack)||BigInt(native.maxStack)<2n||BigInt(referenceMaxStack)<2n)return null;
  return {definitionKey,maximum:String(BigInt(native.maxStack)<BigInt(referenceMaxStack)?BigInt(native.maxStack):BigInt(referenceMaxStack)),uniqueBalance:native.uniqueBalance,limitSource:'native_and_pinned_catalog_minimum'};
}
