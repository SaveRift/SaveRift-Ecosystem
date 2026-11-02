// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../contracts.mjs';
import {createExecutionLock} from '../registry.mjs';
import {createEntitlementPolicy,verifyEntitlementEvidence} from '../entitlements.mjs';
const hex=value=>value.repeat(64),time=Date.parse('2026-11-02T12:00:00Z');
const lock=createExecutionLock({connector:{id:'test.game',version:'1',digest:hex('a')},dataPacks:[{id:'test.data',version:'1',digest:hex('b')}]});
const input={original:{bundleDigest:hex('c')},candidate:{candidateDigest:hex('d')},executionLock:lock,accountBindingDigest:hex('e'),destinationBindingDigest:hex('f'),product:'synthetic-game',platform:'synthetic',purpose:'publish'};
const restricted={recordId:'item-instance-1',change:'added',classification:'restricted',requirements:{entitlement:'test.dlc'}};
function inspector(changes=[],extra={}){return {id:'test.reviewed-inspector',digest:hex('1'),connectorDigest:lock.connector.digest,catalogDigests:[hex('b')],reviewed:true,inspectTransition:async({original,candidate})=>({originalDigest:original.bundleDigest,candidateDigest:digest(candidate),coverage:'complete_transition',complete:true,changes,unchangedRestricted:[{recordId:'old-dlc-instance'}],...extra})};}
function fact(state='allowed',extra={}){return {entitlement:'test.dlc',state,accountBindingDigest:input.accountBindingDigest,destinationBindingDigest:input.destinationBindingDigest,product:input.product,platform:input.platform,observedAt:new Date(time-1000).toISOString(),expiresAt:new Date(time+60000).toISOString(),providerRef:'provider-private-receipt-ref',...extra};}
const provider=(facts,trust='authoritative')=>({id:'trusted.provider',trust,lookup:async()=>facts});
const policy=(changes=[],options={})=>createEntitlementPolicy({classifiers:[inspector(changes)],now:()=>time,...options});

test('reviewed base edit may proceed with unknown DLC ownership; unchanged restricted records are preserved without proving ownership',async()=>{
  const result=await policy([{recordId:'base-item',classification:'base',change:'modified'}]).evaluate(input);
  assert.equal(result.publishAllowed,true);assert.deepEqual(result.facts,[]);assert.equal(result.inspections.length,1);assert.equal(result.readAllowed,true);
});
test('new restricted content requires current authoritative destination-specific evidence',async()=>{
  const service=policy([restricted],{provider:provider([fact()])}),result=await service.evaluate(input);
  assert.equal(result.publishAllowed,true);assert.equal(result.facts[0].state,'allowed');assert.equal(result.facts[0].providerRef,'trusted.provider');
  assert.equal(JSON.stringify(result).includes('provider-private-receipt-ref'),false);
  const binding={originalDigest:input.original.bundleDigest,candidateDigest:digest(input.candidate),executionLockDigest:lock.digest,accountBindingDigest:input.accountBindingDigest,destinationBindingDigest:input.destinationBindingDigest,product:input.product,platform:input.platform,now:time};
  assert.equal(service.verify(result,binding),true);
  assert.equal(service.verify(result,{...binding,destinationBindingDigest:hex('0')}),false);
  assert.equal(service.verify(result,{...binding,now:time+61000}),false);
  assert.equal(verifyEntitlementEvidence(result,binding),false,'a public content digest is not host authority');
  assert.equal(service.verify(JSON.parse(JSON.stringify(result)),binding),false,'an attacker cannot resubmit a report as locally issued evidence');
});
test('denied, unknown, unavailable and expired content evidence blocks only publication',async t=>{
  for(const state of ['not_entitled','unknown','unavailable','expired'])await t.test(state,async()=>{
    const result=await policy([restricted],{provider:provider([fact(state)])}).evaluate(input);assert.equal(result.publishAllowed,false);assert.equal(result.readAllowed,true);assert.equal(result.exportAllowed,true);assert.ok(result.reasons.some(x=>['ENTITLEMENT_DENIED','ENTITLEMENT_UNRESOLVED'].includes(x.code)));
  });
  const result=await policy([restricted]).evaluate({...input,purpose:'export'});assert.equal(result.decision,'read_only');assert.equal(result.exportAllowed,true);
});
test('manual, preset, import, custom byte and MCP entry points cannot supply their own entitlement decision',async()=>{
  for(const route of ['manual','preset','import','raw-byte','mcp','upgrade']){
    const result=await policy([restricted]).evaluate({...input,route,entitled:true,entitlementOverride:true,requirements:{allOf:[]},pluginReport:{safe:true,entitled:true}});
    assert.equal(result.publishAllowed,false,route);assert.equal(result.facts[0].state,'unavailable');
  }
});
test('host classification wins when a contributor marks restricted data as base game',async()=>{
  const result=await policy([restricted]).evaluate({...input,candidate:{...input.candidate,pluginRequirements:{allOf:[]},catalog:{dlc:false}}});assert.equal(result.publishAllowed,false);
  const unknown=await policy([{recordId:'unclassified-effect',change:'activated',classification:'unknown'}]).evaluate(input);assert.equal(unknown.reasons[0].code,'ENTITLEMENT_EFFECT_UNKNOWN');
});
test('purchase, license and ownership modifications stay forbidden even when content is owned',async()=>{
  const result=await policy([{recordId:'license-flag',change:'modified',classification:'ownership'}],{provider:provider([fact()])}).evaluate(input);assert.equal(result.publishAllowed,false);assert.equal(result.reasons[0].code,'ENTITLEMENT_RECORD_PROTECTED');
});
test('unknown transition scope or missing/wrong inspector pins fails closed',async()=>{
  for(const extra of [{complete:false},{coverage:'inventory-only'},{candidateDigest:hex('0')},{changes:[{...restricted,requirements:{allOf:[]}}]}]){
    const service=createEntitlementPolicy({classifiers:[inspector([restricted],extra)],now:()=>time});assert.equal((await service.evaluate(input)).publishAllowed,false);
  }
  for(const changed of [createExecutionLock({...lock,connector:{...lock.connector,digest:hex('0')}}),createExecutionLock({...lock,dataPacks:[]})])assert.equal((await policy().evaluate({...input,executionLock:changed})).reasons[0].code,'ENTITLEMENT_INSPECTOR_UNAVAILABLE');
});
test('synthetic providers are usable locally but can never authorize hosted restricted writes',async()=>{
  const host=await policy([restricted],{provider:provider([fact()],'synthetic')}).evaluate(input);assert.equal(host.publishAllowed,false);
  const local=await policy([restricted],{provider:provider([fact()],'synthetic'),mode:'local'}).evaluate(input);assert.equal(local.publishAllowed,true);assert.equal(local.mode,'local');
});
test('evidence cannot cross accounts, products, platforms, destinations, or freshness windows',async()=>{
  for(const extra of [{accountBindingDigest:hex('0')},{destinationBindingDigest:hex('0')},{product:'another'},{platform:'another'},{observedAt:new Date(time+1000).toISOString()},{observedAt:new Date(time-600000).toISOString()},{expiresAt:new Date(time-1).toISOString()}])assert.equal((await policy([restricted],{provider:provider([fact('allowed',extra)])}).evaluate(input)).publishAllowed,false);
  assert.equal((await policy([restricted],{provider:provider([fact(),fact()])}).evaluate(input)).publishAllowed,false,'ambiguous duplicate facts are rejected');
});
test('nested edition, subscription and sharing conditions evaluate the complete requirement',async()=>{
  const change={...restricted,requirements:{allOf:[{entitlement:'test.dlc'},{anyOf:[{entitlement:'test.subscription'},{entitlement:'test.sharing'}]}]}};
  const facts=[fact(),fact('not_entitled',{entitlement:'test.subscription'}),fact('allowed',{entitlement:'test.sharing'})];
  assert.equal((await policy([change],{provider:provider(facts)}).evaluate(input)).publishAllowed,true);
  assert.equal((await policy([change],{provider:provider(facts.slice(0,2))}).evaluate(input)).publishAllowed,false);
});
test('provider and inspector failures yield bounded reasons without leaking receipts or exception details',async()=>{
  const service=policy([restricted],{provider:{id:'trusted.provider',trust:'authoritative',lookup:async()=>{throw new Error('private-token-secret');}}});
  const result=await service.evaluate(input);assert.equal(result.publishAllowed,false);assert.equal(JSON.stringify(result).includes('private-token-secret'),false);
  const bad=inspector();bad.inspectTransition=async()=>{throw new Error('private-save-details');};const failed=await createEntitlementPolicy({classifiers:[bad],now:()=>time}).evaluate(input);assert.equal(failed.publishAllowed,false);assert.equal(JSON.stringify(failed).includes('private-save-details'),false);
});
test('host integrations are cancellable and bounded; no timeout becomes approval',async()=>{
  const never={id:'bounded.provider',trust:'authoritative',lookup:async()=>new Promise(()=>{})};
  const timeout=await policy([restricted],{provider:never,timeoutMs:5}).evaluate(input);assert.equal(timeout.publishAllowed,false);
  const controller=new AbortController(),pending=policy([restricted],{provider:never}).evaluate({...input,signal:controller.signal});controller.abort();await assert.rejects(pending,{code:'POLICY_CANCELLED'});
});
