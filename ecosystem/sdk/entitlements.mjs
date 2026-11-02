// SPDX-License-Identifier: Apache-2.0
// Original SaveRift hosted-service policy boundary.
// This is not a license restriction on use of the open SDK.
import {canonical, digest, fail} from './contracts.mjs';
import {verifyExecutionLock} from './registry.mjs';

const HEX=/^[0-9a-f]{64}$/;
const states=new Set(['allowed','not_entitled','unknown','unavailable','expired']);
const frozen=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))frozen(v);Object.freeze(value);}return value;};
const copy=value=>JSON.parse(canonical(value));
function requirePin(value,label){if(!HEX.test(value||''))fail('POLICY_BINDING_INVALID',`${label} must be an exact immutable digest.`);return value;}
function requirement(node,depth=0){
  if(depth>12||!node||typeof node!=='object'||Array.isArray(node)||Object.keys(node).length!==1)fail('ENTITLEMENT_REQUIREMENT_INVALID','A requirement needs one bounded condition.');
  if(Object.hasOwn(node,'entitlement')){if(typeof node.entitlement!=='string'||!/[.:]/.test(node.entitlement)||node.entitlement.length>200)fail('ENTITLEMENT_REQUIREMENT_INVALID','Entitlement identifiers must be namespaced.');return;}
  const operator=Object.keys(node)[0];if(!['allOf','anyOf'].includes(operator)||!Array.isArray(node[operator])||node[operator].length>64||(operator==='anyOf'&&!node[operator].length))fail('ENTITLEMENT_REQUIREMENT_INVALID','Unknown or empty alternative entitlement condition.');
  node[operator].forEach(x=>requirement(x,depth+1));
}
function collect(node,out=new Set()){if(node.entitlement)out.add(node.entitlement);else for(const value of node.allOf||node.anyOf)collect(value,out);return out;}
function condition(node,facts){
  if(node.entitlement){const fact=facts.get(node.entitlement);return {allowed:fact?.state==='allowed',states:[{entitlement:node.entitlement,state:fact?.state||'unknown'}]};}
  const children=(node.allOf||node.anyOf).map(x=>condition(x,facts));return {allowed:node.allOf?children.every(x=>x.allowed):children.some(x=>x.allowed),states:children.flatMap(x=>x.states)};
}
function bundleDigest(value,label){const valueDigest=value?.bundleDigest||value?.candidateDigest||value?.digest;return requirePin(valueDigest,label);}
function redactFact(fact){return {entitlement:fact.entitlement,state:fact.state,providerRef:fact.providerRef,observedAt:fact.observedAt,expiresAt:fact.expiresAt};}

/**
 * Only a trusted host constructs this object. `inspectTransition` is an admitted,
 * digest-pinned independent inspector; plugin reports are never accepted here.
 * The provider is likewise a host integration, not a callable plugin capability.
 */
export function createEntitlementPolicy({classifiers,provider,now=()=>Date.now(),mode='hosted',maxEvidenceAgeMs=5*60*1000,timeoutMs=5000}={}){
  if(!Array.isArray(classifiers)||classifiers.length>32||!['hosted','local'].includes(mode)||!Number.isSafeInteger(maxEvidenceAgeMs)||maxEvidenceAgeMs<1000||maxEvidenceAgeMs>3600000||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)fail('POLICY_CONFIG_INVALID','Trusted inspectors, execution mode and bounded evidence age are required.');
  const admitted=classifiers.map(item=>{
    if(typeof item.id!=='string'||typeof item.inspectTransition!=='function'||item.reviewed!==true)fail('POLICY_CONFIG_INVALID','An inspector must be independently admitted by the host.');
    requirePin(item.digest,'Inspector');requirePin(item.connectorDigest,'Inspector connector');if(!Array.isArray(item.catalogDigests)||item.catalogDigests.some(x=>!HEX.test(x)))fail('POLICY_CONFIG_INVALID','Inspector catalog pins are required.');
    return Object.freeze({...item,catalogDigests:Object.freeze([...item.catalogDigests].sort())});
  });
  if(new Set(admitted.map(x=>x.id)).size!==admitted.length)fail('POLICY_CONFIG_INVALID','Inspector identities must be unique.');
  if(provider&&(!['authoritative','synthetic'].includes(provider.trust)||typeof provider.lookup!=='function'||typeof provider.id!=='string'))fail('POLICY_CONFIG_INVALID','The host provider configuration is invalid.');
  const issued=new WeakSet();
  return Object.freeze({
    async evaluate(input){
      const {original,candidate,executionLock,accountBindingDigest,destinationBindingDigest,purpose='publish',product,platform,signal}=input||{};
      if(signal?.aborted)fail('POLICY_CANCELLED','The candidate policy check was cancelled.');
      if(!['publish','export','inspect'].includes(purpose))fail('POLICY_PURPOSE_INVALID','Unknown policy evaluation purpose.');
      const originalDigest=bundleDigest(original,'Original bundle');if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))fail('POLICY_BINDING_INVALID','The complete candidate must be present.');
      // Hash the complete immutable candidate; a plugin-provided digest field
      // must never select the object covered by this host policy proof.
      const candidateDigest=digest(candidate);
      if(!verifyExecutionLock(executionLock))fail('POLICY_BINDING_INVALID','The execution lock is invalid or has changed.');
      const connectorDigest=requirePin(executionLock?.connector?.digest,'Execution connector');
      const catalogDigests=(executionLock?.dataPacks||[]).map(x=>requirePin(x.digest,'Catalog')).sort();
      const executionLockDigest=executionLock.digest;requirePin(accountBindingDigest,'Destination account');requirePin(destinationBindingDigest,'Destination');
      if(typeof product!=='string'||!product||typeof platform!=='string'||!platform)fail('POLICY_BINDING_INVALID','Product and platform must be bound by the host.');
      const checkedAt=now();if(!Number.isFinite(checkedAt))fail('POLICY_CLOCK_INVALID','The policy clock is unavailable.');
      const binding={accountBindingDigest,destinationBindingDigest,originalDigest,candidateDigest,executionLockDigest,product,platform};
      const eligible=admitted.filter(x=>x.connectorDigest===connectorDigest&&canonical(x.catalogDigests)===canonical(catalogDigests));
      const reports=[],reasons=[],changes=[];
      if(!eligible.length)reasons.push({code:'ENTITLEMENT_INSPECTOR_UNAVAILABLE',message:'No reviewed complete-candidate inspector matches these exact package and data versions.'});
      for(const inspector of eligible){
        let report;try{report=copy(await boundedCall(childSignal=>inspector.inspectTransition({original,candidate,executionLock,signal:childSignal}),signal,timeoutMs));}catch{if(signal?.aborted)fail('POLICY_CANCELLED','The candidate policy check was cancelled.');reasons.push({code:'ENTITLEMENT_INSPECTION_FAILED',inspectorId:inspector.id,message:'The independent candidate inspection did not complete.'});continue;}
        if(report.originalDigest!==originalDigest||report.candidateDigest!==candidateDigest||report.coverage!=='complete_transition'||report.complete!==true||!Array.isArray(report.changes)||report.changes.length>100000){reasons.push({code:'ENTITLEMENT_COVERAGE_INCOMPLETE',inspectorId:inspector.id,message:'Candidate effects could not be classified completely.'});continue;}
        const seen=new Set();let valid=true;
        for(const change of report.changes){
          if(typeof change.recordId!=='string'||!change.recordId||change.recordId.length>256||seen.has(change.recordId)||!['base','restricted','unknown','ownership'].includes(change.classification)||!['added','modified','activated','removed'].includes(change.change)){valid=false;break;}seen.add(change.recordId);
          if(change.classification==='restricted'){try{requirement(change.requirements);if(!collect(change.requirements).size){valid=false;break;}}catch{valid=false;break;}}
          if(change.classification==='base'&&change.requirements!==undefined){try{requirement(change.requirements);if(collect(change.requirements).size){valid=false;break;}}catch{valid=false;break;}}
        }
        if(!valid){reasons.push({code:'ENTITLEMENT_REPORT_INVALID',inspectorId:inspector.id,message:'The reviewed inspector returned an invalid classification report.'});continue;}
        reports.push({inspectorId:inspector.id,inspectorDigest:inspector.digest,reportDigest:digest(report)});
        for(const change of report.changes)changes.push({...change,inspectorId:inspector.id});
      }
      const needed=new Set();for(const change of changes){
        if(change.classification==='unknown')reasons.push({code:'ENTITLEMENT_EFFECT_UNKNOWN',recordId:change.recordId,message:'An affected record has unknown content requirements.'});
        if(change.classification==='ownership')reasons.push({code:'ENTITLEMENT_RECORD_PROTECTED',recordId:change.recordId,message:'Purchase, license and ownership records cannot be modified.'});
        if(change.classification==='restricted')collect(change.requirements,needed);
      }
      let rawFacts=[];
      if(needed.size&&provider&&(mode==='local'||provider.trust==='authoritative')){
        try{const result=await boundedCall(childSignal=>provider.lookup({accountBindingDigest,destinationBindingDigest,product,platform,requirements:[...needed].sort(),now:checkedAt,signal:childSignal}),signal,timeoutMs);if(Array.isArray(result)&&result.length<=needed.size)rawFacts=result;}catch{if(signal?.aborted)fail('POLICY_CANCELLED','The candidate policy check was cancelled.');rawFacts=[];}
      }
      const facts=new Map();
      for(const entitlement of needed){
        const matching=rawFacts.filter(x=>x?.entitlement===entitlement);let state=provider?'unknown':'unavailable';let fact=null;
        if(matching.length===1){const value=matching[0];const observedAt=Date.parse(value.observedAt),expiresAt=Date.parse(value.expiresAt);
          if(states.has(value.state)&&value.accountBindingDigest===accountBindingDigest&&value.destinationBindingDigest===destinationBindingDigest&&value.product===product&&value.platform===platform&&typeof value.providerRef==='string'&&value.providerRef&&Number.isFinite(observedAt)&&Number.isFinite(expiresAt)&&observedAt<=checkedAt&&expiresAt>observedAt){
            state=expiresAt<=checkedAt||checkedAt-observedAt>maxEvidenceAgeMs?'expired':value.state;fact={entitlement,state,providerRef:provider.id,observedAt:value.observedAt,expiresAt:value.expiresAt};
          }
        }
        if(mode==='hosted'&&provider?.trust==='synthetic')state='unknown';
        facts.set(entitlement,fact||{entitlement,state,providerRef:provider?.id||'none',observedAt:null,expiresAt:null});
      }
      for(const change of changes.filter(x=>x.classification==='restricted')){
        const result=condition(change.requirements,facts);if(!result.allowed)reasons.push({code:result.states.some(x=>x.state==='not_entitled')?'ENTITLEMENT_DENIED':'ENTITLEMENT_UNRESOLVED',recordId:change.recordId,message:'Required content access is denied or has no fresh authoritative evidence.',requirements:result.states});
      }
      const publishAllowed=reasons.length===0;
      const expiry=Math.min(checkedAt+maxEvidenceAgeMs,...[...facts.values()].filter(x=>x.state==='allowed').flatMap(x=>[Date.parse(x.expiresAt),Date.parse(x.observedAt)+maxEvidenceAgeMs]));
      const evidence={schema:'saverift.entitlement-evidence.v1',policyVersion:'0.1.0',mode,purpose,...binding,checkedAt:new Date(checkedAt).toISOString(),expiresAt:new Date(expiry).toISOString(),decision:publishAllowed?'allow':purpose==='publish'?'block':'read_only',publishAllowed,readAllowed:true,exportAllowed:true,inspections:reports,facts:[...facts.values()].map(redactFact),reasons};
      const result=frozen({...evidence,evidenceDigest:digest(evidence)});issued.add(result);return result;
    },
    verify(evidence,binding){return verifyEntitlementEvidence(evidence,{...binding,mode,isTrustedEvidence:value=>issued.has(value)});}
  });
}
async function boundedCall(run,signal,timeoutMs){
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)fail('POLICY_CONFIG_INVALID','Policy integrations need a bounded timeout.');
  if(signal?.aborted)fail('POLICY_CANCELLED','The candidate policy check was cancelled.');
  const controller=new AbortController();let timer,abort;
  const stopped=new Promise((_,reject)=>{abort=()=>{controller.abort();reject(new Error('cancelled'));};timer=setTimeout(abort,timeoutMs);signal?.addEventListener('abort',abort,{once:true});});
  try{return await Promise.race([Promise.resolve().then(()=>run(controller.signal)),stopped]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

/**
 * Integrity is not authority. Hosts persisting evidence must supply a callback
 * that verifies its provenance in their account-bound trusted store. Merely
 * recomputing this public digest can never authenticate a plugin's own report.
 */
export function verifyEntitlementEvidence(evidence,{originalDigest,candidateDigest,executionLockDigest,accountBindingDigest,destinationBindingDigest,product,platform,now=Date.now(),mode='hosted',isTrustedEvidence=()=>false}={}){
  if(!evidence||evidence.schema!=='saverift.entitlement-evidence.v1')return false;
  if(typeof isTrustedEvidence!=='function'||isTrustedEvidence(evidence)!==true)return false;
  const {evidenceDigest,...content}=evidence;
  const expiresAt=Date.parse(evidence.expiresAt),checkedAt=Date.parse(evidence.checkedAt);
  if(!Number.isFinite(now)||!Number.isFinite(expiresAt)||!Number.isFinite(checkedAt)||expiresAt<=checkedAt||evidenceDigest!==digest(content)||evidence.publishAllowed!==true||evidence.decision!=='allow'||evidence.mode!==mode||evidence.purpose!=='publish'||expiresAt<=now||checkedAt>now)return false;
  return Object.entries({originalDigest,candidateDigest,executionLockDigest,accountBindingDigest,destinationBindingDigest,product,platform}).every(([key,value])=>value!==undefined&&evidence[key]===value);
}
