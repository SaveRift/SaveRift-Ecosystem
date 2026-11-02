// SPDX-License-Identifier: Apache-2.0
// Original SaveRift composable preset tooling.
import {canonical, digest, fail, validateOperation} from './contracts.mjs';
import {verifyExecutionLock} from './registry.mjs';

const PIN=/^[0-9a-f]{64}$/;
const safeCopy=value=>JSON.parse(canonical(value));
const deepFreeze=value=>{if(value&&typeof value==='object'){for(const item of Object.values(value))deepFreeze(item);Object.freeze(value);}return value;};
function checkId(value){if(typeof value!=='string'||!value.includes('.')||value.length>200)fail('PRESET_ID_INVALID','Preset and operation IDs must be namespaced.');}
function exactPins(pins,lock){
  const installed=new Map([lock.connector,...(lock.extensions||[]),...(lock.dataPacks||[])].filter(Boolean).map(x=>[x.id,x]));
  if(!Array.isArray(pins))fail('PRESET_DEPENDENCIES_INVALID','Preset dependencies must be pinned explicitly.');
  for(const dependency of pins){const found=installed.get(dependency.id);if(!PIN.test(dependency.digest||'')||!found||found.digest!==dependency.digest||found.version!==dependency.version)fail('PRESET_DEPENDENCY_MISMATCH','A preset dependency is not installed at its exact version and digest.');}
}

/** Presets produce operations, never saves, ownership facts, or publication authority. */
export function composePreset({presetId,presets,executionLock,operations,extensionApis={},parameters={}}){
  checkId(presetId);if(!Array.isArray(presets)||presets.length>1000||!Array.isArray(operations)||!verifyExecutionLock(executionLock))fail('PRESET_INPUT_INVALID','Pinned presets, operation declarations and a valid execution lock are required.');
  const declarations=new Map();for(const operation of operations){checkId(operation.id);if(declarations.has(operation.id))fail('PRESET_OPERATION_AMBIGUOUS','Operation IDs must have a single provider.');declarations.set(operation.id,operation);}
  const byId=new Map();for(const preset of presets){checkId(preset.id);if(byId.has(preset.id)||!PIN.test(preset.digest||'')||preset.digest!==digest(Object.fromEntries(Object.entries(preset).filter(([key])=>key!=='digest'))))fail('PRESET_DIGEST_INVALID','Preset identities must be unique and content digests must match.');byId.set(preset.id,preset);}
  const stack=[],result=[],requirements=[],used=[],conflicts=new Map();
  const expand=(id)=>{
    if(stack.includes(id)||stack.length>=16)fail('PRESET_CYCLE','Preset composition contains a cycle or excessive nesting.');
    const preset=byId.get(id);if(!preset)fail('PRESET_MISSING','A referenced preset is unavailable.');stack.push(id);exactPins(preset.dependencies,executionLock);
    for(const [api,version] of Object.entries(preset.extensionApis||{}))if(extensionApis[api]!==version)fail('PRESET_API_MISMATCH','A preset needs a different connector-domain API.');
    if(preset.entitlementOverride!==undefined||preset.entitled!==undefined||preset.publish!==undefined)fail('PRESET_AUTHORITY_INVALID','A preset cannot provide entitlement or publication authority.');
    if(!Array.isArray(preset.steps)||preset.steps.length>256)fail('PRESET_STEP_LIMIT','Preset steps must be bounded.');
    used.push({id:preset.id,version:preset.version,digest:preset.digest});if(preset.requirements!==undefined)requirements.push(safeCopy(preset.requirements));
    for(const step of preset.steps){
      if(step.preset){if(Object.keys(step).length!==1)fail('PRESET_STEP_INVALID','Nested presets have no authority or parameter overrides.');expand(step.preset);continue;}
      if(result.length>=1024)fail('PRESET_OPERATION_LIMIT','The composed preset has too many operations.');
      const operation=validateOperation({id:step.id,apiVersion:step.apiVersion,params:substitute(step.params,parameters)}),declaration=declarations.get(operation.id);
      if(!declaration||declaration.apiVersion!==operation.apiVersion)fail('PRESET_OPERATION_UNAVAILABLE','An operation or its exact API version is unavailable.');
      if(!declaration.owner||!PIN.test(declaration.owner.digest||''))fail('PRESET_OPERATION_UNPINNED','An operation provider must be pinned.');exactPins([declaration.owner],executionLock);
      if(typeof declaration.validateParams==='function'&&declaration.validateParams(operation.params)!==true)fail('PRESET_PARAMS_INVALID','Preset parameters failed the registered operation validator.');
      const domains=declaration.writeDomains||[];if(!Array.isArray(domains))fail('PRESET_OPERATION_INVALID','Write-domain declarations must be explicit arrays.');
      for(const domain of domains){if(typeof domain!=='string')fail('PRESET_OPERATION_INVALID','Write domains must be strings.');const previous=conflicts.get(domain);if(previous&&previous.id!==operation.id&&(!Array.isArray(declaration.orderedAfter)||!declaration.orderedAfter.includes(previous.id)))fail('PRESET_OPERATION_CONFLICT','Preset operations overlap without an explicit reviewed ordering.');conflicts.set(domain,operation);}
      result.push(operation);
    }
    stack.pop();
  };
  expand(presetId);
  const content={schema:'saverift.preset-composition.v1',presetId,executionLockDigest:executionLock.digest,parameters:safeCopy(parameters),presets:used,operations:result,declaredRequirements:requirements,requirementsState:'requires_independent_complete_candidate_inspection'};
  return deepFreeze({...content,operationDigest:digest(result),compositionDigest:digest(content)});
}
function substitute(value,parameters,depth=0){
  if(depth>20)fail('PRESET_PARAMS_INVALID','Preset parameter nesting exceeds its limit.');
  if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&Object.hasOwn(value,'$parameter')){
    const name=value.$parameter;if(typeof name!=='string'||!Object.hasOwn(parameters,name))fail('PRESET_PARAMETER_MISSING','A required preset parameter is missing.');return safeCopy(parameters[name]);
  }
  if(Array.isArray(value))return value.map(item=>substitute(item,parameters,depth+1));
  if(value&&typeof value==='object'){const result={};for(const [key,item] of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))fail('PRESET_PARAMS_INVALID','Prototype-related keys are forbidden.');result[key]=substitute(item,parameters,depth+1);}return result;}
  return value;
}
