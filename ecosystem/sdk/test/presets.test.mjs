// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../contracts.mjs';
import {createExecutionLock} from '../registry.mjs';
import {composePreset} from '../presets.mjs';
const owner={id:'example.game',version:'1',digest:'a'.repeat(64)},extension={id:'example.level-tools',version:'1',digest:'b'.repeat(64)},data={id:'example.data',version:'1',digest:'c'.repeat(64)};
const lock=createExecutionLock({connector:owner,extensions:[extension],dataPacks:[data]});
const quantity={id:'example.game.quantity',apiVersion:'1',owner,writeDomains:['inventory'],validateParams:x=>Number.isInteger(x.quantity)&&x.quantity>0};
const level={id:'example.level-tools.level',apiVersion:'1',owner:extension,writeDomains:['progression']};
const preset=(id,steps,extra={})=>{const value={id,version:'1',dependencies:[owner,data],extensionApis:{'example.document':'1'},steps,...extra};return {...value,digest:digest(value)};};
const one=preset('example.supplies',[{id:quantity.id,apiVersion:'1',params:{quantity:{$parameter:'quantity'}}}]);
const config={presetId:one.id,presets:[one],executionLock:lock,operations:[quantity,level],extensionApis:{'example.document':'1'},parameters:{quantity:5}};
const error=code=>value=>value.code===code;
test('presets expand only exact pinned operations and preserve host-policy requirement state',()=>{
  const result=composePreset(config);assert.equal(result.operations[0].params.quantity,5);assert.equal(result.operationDigest,digest(result.operations));assert.equal(result.requirementsState,'requires_independent_complete_candidate_inspection');assert.ok(Object.isFrozen(result.operations));
  assert.throws(()=>composePreset({...config,parameters:{quantity:0}}),error('PRESET_PARAMS_INVALID'));
  assert.throws(()=>composePreset({...config,parameters:{}}),error('PRESET_PARAMETER_MISSING'));
});
test('nested composition adds an arbitrary progression domain without core inventory schema',()=>{
  const two=preset('example.adventure',[{preset:one.id},{id:level.id,apiVersion:'1',params:{character:'hero',targetLevel:5}}],{dependencies:[owner,data,extension]});
  const result=composePreset({...config,presetId:two.id,presets:[one,two]});assert.equal(result.operations.length,2);assert.equal(result.operations[1].params.targetLevel,5);
});
test('dependency, data, API, operation and preset substitutions invalidate the composition',()=>{
  assert.throws(()=>composePreset({...config,executionLock:createExecutionLock({...lock,dataPacks:[{...data,digest:'d'.repeat(64)}]})}),error('PRESET_DEPENDENCY_MISMATCH'));
  assert.throws(()=>composePreset({...config,extensionApis:{'example.document':'2'}}),error('PRESET_API_MISMATCH'));
  assert.throws(()=>composePreset({...config,operations:[]}),error('PRESET_OPERATION_UNAVAILABLE'));
  assert.throws(()=>composePreset({...config,presets:[{...one,version:'modified'}]}),error('PRESET_DIGEST_INVALID'));
});
test('cycles, authority overrides, ambiguous providers and overlapping extensions fail closed',()=>{
  const cycle=preset('example.cycle',[{preset:'example.cycle'}]);assert.throws(()=>composePreset({...config,presetId:cycle.id,presets:[cycle]}),error('PRESET_CYCLE'));
  const override=preset('example.override',[],{entitled:true});assert.throws(()=>composePreset({...config,presetId:override.id,presets:[override]}),error('PRESET_AUTHORITY_INVALID'));
  assert.throws(()=>composePreset({...config,operations:[quantity,quantity]}),error('PRESET_OPERATION_AMBIGUOUS'));
  const other={...level,writeDomains:['inventory']},both=preset('example.conflict',[...one.steps,{id:other.id,apiVersion:'1',params:{target:5}}],{dependencies:[owner,data,extension]});
  assert.throws(()=>composePreset({...config,presetId:both.id,presets:[both],operations:[quantity,other]}),error('PRESET_OPERATION_CONFLICT'));
  assert.equal(composePreset({...config,presetId:both.id,presets:[both],operations:[quantity,{...other,orderedAfter:[quantity.id]}]}).operations.length,2);
});
