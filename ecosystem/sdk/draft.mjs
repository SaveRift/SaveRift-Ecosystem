// SPDX-License-Identifier: Apache-2.0
import {sha256,canonicalJson} from './crypto.mjs';
import {verifyExecutionLock} from './registry.mjs';
import {createOperationCatalog} from './operation-catalog.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const clone=v=>JSON.parse(canonicalJson(v));
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const boundedId=v=>typeof v==='string'&&/^[a-zA-Z0-9._:-]{1,160}$/.test(v);
export const operationDigest=operations=>sha256(canonicalJson(operations));
export function createDraft({id,baseBundleDigest,sourceRevision,accountBindingDigest,executionLockDigest}){
 if(!boundedId(id)||![baseBundleDigest,sourceRevision,accountBindingDigest,executionLockDigest].every(digest))fail('DRAFT_BINDING_INVALID');
 return {schema:'saverift.draft.v1',id,revision:0,baseBundleDigest,sourceRevision,accountBindingDigest,executionLockDigest,operations:[],status:'editing',prepared:null};
}
function definitions(catalog){
 if(!Array.isArray(catalog)||catalog.length>1024)fail('OPERATION_CATALOG_INVALID');
 const defs=new Map();for(const d of catalog){const key=d?.id+'@'+d?.apiVersion;if(!boundedId(d?.id)||!d.id.includes('.')||typeof d.apiVersion!=='string'||!boundedId(d.owner)||!Array.isArray(d.writeDomains)||d.writeDomains.some(x=>!boundedId(x.path)||!['exclusive','ordered'].includes(x.mode))||typeof d.validate!=='function'||defs.has(key))fail('OPERATION_CATALOG_INVALID');defs.set(key,d);}return defs;
}
function validateLog(log,defs){
 if(log.length>128||new TextEncoder().encode(canonicalJson(log)).byteLength>128*1024)fail('DRAFT_LIMIT');
 const seen=new Set(),effects=new Map(),completed=new Set();
 for(const op of log){
  if(!boundedId(op?.instanceId)||seen.has(op.instanceId)||Object.keys(op).sort().join(',')!=='apiVersion,id,instanceId,params')fail('OPERATION_INVALID');seen.add(op.instanceId);
  const d=defs.get(op.id+'@'+op.apiVersion);if(!d)fail('OPERATION_UNREGISTERED');
  if(d.validate(clone(op.params))!==true)fail('OPERATION_PARAMS_INVALID');
  if((d.requires||[]).some(id=>!completed.has(id)))fail('OPERATION_DEPENDENCY_MISSING');
  for(const domain of d.writeDomains){for(const [path,previous] of effects){const overlaps=path==='*'||domain.path==='*'||path===domain.path||path.startsWith(domain.path+'.')||domain.path.startsWith(path+'.');if(overlaps&&previous.some(prev=>prev.owner!==d.owner&&(domain.mode==='exclusive'||prev.mode==='exclusive')))fail('OPERATION_CONFLICT');}effects.set(domain.path,[...(effects.get(domain.path)||[]),{owner:d.owner,mode:domain.mode}]);}
  completed.add(op.id);
 }
}
/** Pure intent editing; every mutation discards prepared output and confirmation. */
export function editDraft(draft,edit,{expectedRevision,operationCatalog,allowedOwners}={}){
 if(draft?.schema!=='saverift.draft.v1'||!Number.isSafeInteger(draft.revision)||draft.revision<0||draft.revision===Number.MAX_SAFE_INTEGER)fail('DRAFT_INVALID');
 if(expectedRevision!==draft.revision)fail('DRAFT_REVISION_CONFLICT');
 if(['committing','reconcile','committed'].includes(draft.status))fail('DRAFT_TRANSACTION_ACTIVE');
 const next=clone(draft),defs=definitions(operationCatalog);
 if(allowedOwners!==undefined&&(!Array.isArray(allowedOwners)||!allowedOwners.length||allowedOwners.some(v=>!boundedId(v))))fail('OPERATION_SCOPE_INVALID');
 const allowed=allowedOwners===undefined?null:new Set(allowedOwners);
 const canEdit=op=>!allowed||allowed.has(defs.get(op.id+'@'+op.apiVersion)?.owner);
 if(allowed){
  const adding=edit?.type==='stage'?[edit.operation]:edit?.type==='stageMany'?edit.operations:[];
  if(!Array.isArray(adding)||adding.some(op=>!canEdit(op)))fail('OPERATION_SCOPE_DENIED');
  const removing=edit?.type==='remove'?[edit.instanceId]:edit?.type==='stageMany'?edit.removeInstanceIds:[];
  if(!Array.isArray(removing)||removing.some(id=>{const op=next.operations.find(o=>o.instanceId===id);return op&&!canEdit(op);}))fail('OPERATION_SCOPE_DENIED');
  // A package may reorder its own entries without moving another package's slots.
  if(edit?.type==='reorder'&&(!Array.isArray(edit.instanceIds)||next.operations.some((op,index)=>!canEdit(op)&&edit.instanceIds[index]!==op.instanceId)))fail('OPERATION_SCOPE_DENIED');
 }
 if(edit?.type==='stage'){next.operations.push(clone(edit.operation));}
 else if(edit?.type==='stageMany'){
  if(!Array.isArray(edit.operations)||!Array.isArray(edit.removeInstanceIds)||edit.operations.length>128||edit.removeInstanceIds.length>128||new Set(edit.removeInstanceIds).size!==edit.removeInstanceIds.length||edit.removeInstanceIds.some(id=>!next.operations.some(o=>o.instanceId===id)))fail('DRAFT_BATCH_INVALID');
  next.operations=next.operations.filter(o=>!edit.removeInstanceIds.includes(o.instanceId));next.operations.push(...clone(edit.operations));
 }
 else if(edit?.type==='remove'){const i=next.operations.findIndex(o=>o.instanceId===edit.instanceId);if(i<0)fail('OPERATION_NOT_FOUND');next.operations.splice(i,1);}
 else if(edit?.type==='reorder'){if(!Array.isArray(edit.instanceIds)||edit.instanceIds.length!==next.operations.length||new Set(edit.instanceIds).size!==next.operations.length)fail('OPERATION_ORDER_INVALID');const lookup=new Map(next.operations.map(o=>[o.instanceId,o]));next.operations=edit.instanceIds.map(id=>{const o=lookup.get(id);if(!o)fail('OPERATION_ORDER_INVALID');return o;});}
 else fail('DRAFT_EDIT_INVALID');
 validateLog(next.operations,defs);next.revision++;next.status='editing';next.prepared=null;return next;
}
export function candidateDigest(candidate){return sha256(canonicalJson(candidate));}
/** Run extensions through the isolated runner, then invoke exactly one serializer. */
export async function compileOperationLog({bundle,operations,executionLock,connector,extensions=[],document,run,signal}){
 if(!verifyExecutionLock(executionLock)||typeof run!=='function')fail('EXECUTION_LOCK_INVALID');
 const packages=[connector.package,...extensions.map(e=>e.package)],catalog=createOperationCatalog(packages);validateLog(operations,definitions(catalog));
 const apis={};for(const pkg of packages)for(const [name,version]of Object.entries(pkg.manifest.extensionApis||{})){if(Object.hasOwn(apis,name))fail('DOMAIN_API_AMBIGUOUS');apis[name]=version;}
 for(const ext of extensions)for(const [name,version]of Object.entries(ext.package.manifest.dependencies||{}))if(apis[name]!==version)fail('DOMAIN_API_MISMATCH');
 const owners=new Map(extensions.map(e=>[e.package.manifest.id,e]));
 const expanded=[];
 for(const op of operations){
  const matches=extensions.filter(e=>(e.package.manifest.operations||[]).some(d=>(typeof d==='string'?d:d.id)===op.id));
  if(matches.length>1)fail('OPERATION_OWNER_AMBIGUOUS');
  const owner=matches[0]?.package.manifest.id||connector.package.manifest.id;
  if(owner===connector.package.manifest.id){expanded.push(clone(op));continue;}
  const extension=owners.get(owner);if(!extension)fail('EXTENSION_UNAVAILABLE');
  const value=await run({...extension,bundle,executionLock,method:'expand',input:{...(document?{document:clone(document)}:{}),operation:op,priorOperations:clone(expanded)},signal});
  if(!Array.isArray(value.result?.operations)||value.result.operations.length>128)fail('EXTENSION_RESULT_INVALID');
  const declared=catalog.find(d=>d.id===op.id&&d.apiVersion===op.apiVersion),connectorDefs=catalog.filter(d=>d.owner===connector.package.manifest.id);
  for(const produced of value.result.operations){const target=connectorDefs.find(d=>d.id===produced.id&&d.apiVersion===produced.apiVersion);if(!target||!target.validate(produced.params)||target.writeDomains.some(domain=>!declared.writeDomains.some(allowed=>allowed.path===domain.path||domain.path.startsWith(allowed.path+'.'))))fail('EXTENSION_SCOPE_INVALID');}
  expanded.push(...clone(value.result.operations));if(expanded.length>128)fail('DRAFT_LIMIT');
 }
 // Extensions cannot return final output bytes, replace the serializer or install new dependencies.
 return run({...connector,bundle,executionLock,method:'plan',args:[bundle,{operations:expanded,operationDigest:operationDigest(operations)}],signal});
}
export function bindPreparedDraft(draft,{candidate,validation,policy,executionLock}){
 if(!verifyExecutionLock(executionLock)||executionLock.digest!==draft.executionLockDigest||candidate?.inputBundleDigest!==draft.baseBundleDigest||candidate.executionLockDigest!==draft.executionLockDigest||candidate.operationDigest!==operationDigest(draft.operations))fail('CANDIDATE_BINDING_INVALID');
 if(!Array.isArray(validation?.checks)||!validation.checks.length||validation.checks.some(c=>c.required!==false&&c.result!=='passed'))fail('CANDIDATE_VALIDATION_REQUIRED');
 if(policy?.decision!=='allow'||!digest(policy.evidenceDigest))fail('CANDIDATE_POLICY_REQUIRED');
 return {...clone(draft),status:'prepared',prepared:{candidateDigest:candidateDigest(candidate),operationDigest:candidate.operationDigest,validationDigest:sha256(canonicalJson(validation)),policyDigest:policy.evidenceDigest,revision:draft.revision}};
}
