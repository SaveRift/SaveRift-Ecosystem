// SPDX-License-Identifier: Apache-2.0
// A deliberately unlike-Crimson, wholly invented format. No game compatibility claim.
const MAGIC='RIFT-SYNTHETIC/1\n';
const error=code=>{throw Object.assign(new Error(code),{code});};
const copy=v=>JSON.parse(JSON.stringify(v));
function ascii(bytes){if(bytes.length>65536)error('FORMAT_LIMIT');let s='';for(const b of bytes){if(b>127)error('CORRUPT_INPUT');s+=String.fromCharCode(b);}return s;}
function bytes(value){const text=(MAGIC+JSON.stringify(value)).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));return Uint8Array.from(text,c=>c.charCodeAt(0));}
function read(bundle,ctx){if(bundle.artifacts.length!==1||bundle.artifacts[0].role!=='world')error('MISSING_ARTIFACT');const raw=ascii(ctx.readArtifact(bundle.artifacts[0].id));if(!raw.startsWith(MAGIC))error('UNSUPPORTED_FORMAT');const doc=JSON.parse(raw.slice(MAGIC.length));if(doc.format!==1||!doc.progression||!Array.isArray(doc.factions)||!doc.vehicle||!doc.camp)error('CORRUPT_INPUT');check(doc);return doc;}
function check(doc){const p=doc.progression;if(!Number.isSafeInteger(p.level)||p.level<1||p.level>1000||!Number.isSafeInteger(p.xp)||p.xp<0||!Number.isSafeInteger(p.skillPoints)||p.skillPoints<0||!Number.isFinite(doc.vehicle.fuel)||doc.vehicle.fuel<0||doc.vehicle.fuel>100)error('INVALID_CANDIDATE');}
function apply(doc,op){
 if(op.apiVersion!=='0.1.0')error('DEPENDENCY_MISMATCH');const p=op.params;
 if(op.id==='example.synthetic.setProgression'){if(!p||Object.keys(p).sort().join(',')!=='level,skillPoints,xp')error('OPERATION_INVALID');doc.progression=copy(p);}
 else if(op.id==='example.synthetic.setFaction'){if(typeof p?.id!=='string'||!Number.isSafeInteger(p.reputation)||Math.abs(p.reputation)>1000)error('OPERATION_INVALID');const f=doc.factions.find(f=>f.id===p.id);if(!f)error('OPERATION_INVALID');f.reputation=p.reputation;}
 else if(op.id==='example.synthetic.setVehicleFuel'){if(Object.keys(p||{}).join(',')!=='fuel')error('OPERATION_INVALID');doc.vehicle.fuel=p.fuel;}
 else error('OPERATION_UNSUPPORTED');check(doc);
}
export default {
 detect(bundle,ctx){if(bundle.hints?.gameIdentity&&bundle.hints.gameIdentity!=='synthetic.frontier')return {state:'not_a_match'};try{read(bundle,ctx);return {state:'supported',format:'rift-synthetic-1',requiredRoles:['world']};}catch(e){return {state:e.code==='UNSUPPORTED_FORMAT'?'not_a_match':'recognized_unsupported',reason:e.code||'corrupt_input'};}},
 open(bundle,ctx){return read(bundle,ctx);},
 describe(){return {domainApis:{'example.synthetic.document':'0.1.0'},operations:[{id:'example.synthetic.setProgression',apiVersion:'0.1.0',writeDomains:['progression']},{id:'example.synthetic.setFaction',apiVersion:'0.1.0',writeDomains:['factions']},{id:'example.synthetic.setVehicleFuel',apiVersion:'0.1.0',writeDomains:['vehicle']}],views:[{id:'world',mode:'generated',fields:['camp','vehicle','factions']},{id:'progression-graph',mode:'custom',provider:'example.level-tools'}]};},
 query(doc,query){if(['example.synthetic.document','example.level-tools.inspect'].includes(query.method))return copy(doc);if(query.method==='example.synthetic.world')return copy({camp:doc.camp,vehicle:doc.vehicle,factions:doc.factions});error('QUERY_UNSUPPORTED');},
 plan(bundle,{operations,operationDigest},ctx){
  const original=read(bundle,ctx),next=copy(original);if(!Array.isArray(operations)||operations.length>128)error('OPERATION_INVALID');for(const op of operations)apply(next,op);
  const output=operations.length?ctx.writeArtifact({logicalPath:bundle.artifacts[0].logicalPath,role:'world'},bytes(next)):bundle.artifacts[0];
  const reopened=operations.length?JSON.parse(ascii(ctx.readArtifact(output.id)).slice(MAGIC.length)):original;if(JSON.stringify(reopened)!==JSON.stringify(next))error('REOPEN_FAILED');
  const summary=ctx.writeArtifact({logicalPath:'reports/changes.json',role:'change-summary'},Uint8Array.from(JSON.stringify({operations,changed:operations.length>0}),c=>c.charCodeAt(0)));
  return {id:'candidate:synthetic',inputBundleDigest:bundle.bundleDigest,executionLockDigest:ctx.executionLock.digest,operationDigest,outputs:[output],retainedInputArtifacts:operations.length?[]:[output.id],changeSummaryRef:summary.id,requirements:{changedDomains:[...new Set(operations.map(o=>o.id))]},validation:{checks:[{checkId:'synthetic.reopen',result:'passed',required:true}]}};
 },
 validate(original,candidate,ctx){const old=read(original,ctx),a=candidate.outputs[0],next=JSON.parse(ascii(ctx.readArtifact(a.id)).slice(MAGIC.length));check(next);return {checks:[{checkId:'synthetic.structure',result:'passed',required:true},{checkId:'synthetic.unknown-preserved',result:JSON.stringify(old.unknownBranch)===JSON.stringify(next.unknownBranch)?'passed':'failed',required:true}]};},
 close(){return null;}
};
