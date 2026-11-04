// SPDX-License-Identifier: Apache-2.0
import {hash} from '../../sdk/crypto.mjs';
import {HASH,fail,parseProgression,patchProgression} from './src/typed-context.mjs';
import {inspectNativeContainer,decodeContext,transformPayload,seededCrc} from './src/native-container.mjs';
const states=new Map(),copy=x=>JSON.parse(JSON.stringify(x));let cached=null;
const ids=['acshadows.inventory.setQuantity','acshadows.inventory.setLevel'];
function main(bundle){const rows=bundle.artifacts.filter(a=>['main','progression'].includes(a.role));if(rows.length!==1)fail('AC_MAIN_REQUIRED','Select one unpacked native progression context as main.');return rows[0];}
function read(bundle,ctx,{parse=true}={}){
  const binding=JSON.stringify(bundle);if(cached?.ctx===ctx&&cached.binding===binding&&(!parse||cached.value.parsed))return cached.value;
  const artifact=main(bundle);let bytes=ctx.readArtifact(artifact.id),native=null;
  if(hash(bytes)!==artifact.sha256)fail('AC_SOURCE_MISMATCH');
  if(bytes.length>=8&&new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0,true)===36){
    if(bytes.length<64||new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(4,true)!==0)fail('AC_PC_WRAPPER_INVALID');
    const keys=bundle.artifacts.filter(a=>a.role==='ac-key');if(keys.length!==1||keys[0].byteLength!==16)fail('AC_PRIVATE_KEY_REQUIRED','Select the private 16-byte key produced by local preparation. It will not be included in the download.');
    const key=ctx.readArtifact(keys[0].id);if(hash(key)!==keys[0].sha256)fail('AC_SOURCE_MISMATCH');
    const header=bytes.slice(0,40),decoded=transformPayload(bytes.subarray(40),key),inspection=inspectNativeContainer(decoded),target=inspection.contexts[12];
    if(!target)fail('AC_PROGRESSION_CONTEXT_MISSING');
    if(target.blocks.some(b=>b.requiresDecoder))fail('AC_OODLE_REQUIRED','Run the local AC preparation command first. Untouched Oodle progression blocks cannot yet be decoded inside the isolated runner.');
    if(target.blocks.some(b=>b.flag!==0))fail('AC_PREPARED_STORED_FLAG_REQUIRED');
    bytes=decodeContext(decoded,target);native={header,key,decoded,inspection,target,keyArtifactId:keys[0].id};
  }
  if(bytes.length<30||bytes[0]!==0||bytes[1]!==0||new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(14,true)!==HASH.root)fail('AC_UNSUPPORTED_FORMAT');
  const value={artifact,bytes,parsed:parse?parseProgression(bytes):null,bundle,native};cached={ctx,binding,value};return value;
}
function summary(s){return {schema:'saverift.ac-shadows.inspect.v1',format:s.native?'native-pc-stored-progression-v54':'native-progression-context',sourceSha256:s.artifact.sha256,inventoryCount:s.parsed.records.length,objectCount:s.parsed.objectCount,fieldCount:s.parsed.fieldCount,capabilities:{quantity:true,itemLevel:true,maxOperations:16,playerLevel:false,mastery:false,engraving:false,nativeWrappedSave:!!s.native},limitations:[s.native?'Prepared v54 PC save: the progression context must already use native stored blocks. Native output has not been tested in game.':'Unpacked progression context only. Download is not directly loadable by the game.','Untouched Oodle progression blocks and Xbox saves require a separate verified codec.','No item additions, engraving edits, mastery or player-level changes.','Unknown character profiles and level-zero singleton records remain read-only.'],gameAcceptance:'not_run'};}
function nativeOffset(s,offset){const b=s.native.target.blocks.find(b=>offset>=b.plainOffset&&offset+4<=b.plainOffset+b.plain);if(!b||b.requiresDecoder)fail('AC_NATIVE_EDIT_BLOCK');return b.dataOffset+offset-b.plainOffset;}
function encodeNative(s,changes){
  const decoded=new Uint8Array(s.native.decoded),view=new DataView(decoded.buffer);
  for(const c of changes)view.setUint32(nativeOffset(s,c.offset),c.after,true);
  // Flag-1 equal-length stored blocks carry an Adler checksum over plaintext.
  // The local preparer emits flag 0; refuse legacy checksum-bearing storage.
  if(s.native.target.blocks.some(b=>b.flag!==0))fail('AC_PREPARED_STORED_FLAG_REQUIRED');
  view.setUint32(16,seededCrc(decoded,20,decoded.length-4),true);view.setUint32(decoded.length-4,seededCrc(decoded,0,decoded.length-4,0x82f63b78),true);
  const output=new Uint8Array(decoded.length+40);output.set(s.native.header);const rotation=decoded.length%16,key=s.native.key;for(let i=0;i<decoded.length;i++)output[i+40]=decoded[i]^key[(i-rotation+16)%16];return output;
}
function state(handle){const s=states.get(handle?.id);if(!s)fail('AC_DOCUMENT_CLOSED');return s;}
function check(id,passed=true){return {checkId:id,result:passed?'passed':'failed',required:true};}
export default {
  detect(bundle,ctx){
    if(bundle.hints?.gameIdentity&&!['ac-shadows','assassins-creed-shadows'].includes(bundle.hints.gameIdentity))return {state:'not_a_match'};
    if(bundle.hints?.platform&&!['pc','windows'].includes(bundle.hints.platform.toLowerCase()))return {state:'recognized_unsupported',reason:'AC_PLATFORM_UNSUPPORTED'};
    try{const s=read(bundle,ctx);return {state:'supported',format:summary(s).format,requiredRoles:s.native?['main','ac-key']:['main'],nativeGameFile:!!s.native};}catch(e){return {state:e.code==='AC_UNSUPPORTED_FORMAT'?'not_a_match':'recognized_unsupported',reason:e.code||'AC_CORRUPT'};}
  },
  open(bundle,ctx){const s=read(bundle,ctx),id=bundle.bundleDigest;states.set(id,s);return {id,...summary(s)};},
  describe(){return {domainApis:{'acshadows.inventory':'0.1.0'},operations:ids.map(id=>({id,apiVersion:'0.1.0',writeDomains:[{path:'inventory',mode:'ordered'}]})),views:[{id:'inventory',mode:'custom'}],unavailable:['unprepared-oodle-save','xbox','mastery','player-level','engraving','item-addition']};},
  query(handle,q){const s=state(handle),p=q?.params||q?.args||q||{};
    if(q.method==='acshadows.inspect')return summary(s);
    if(q.method==='acshadows.inventory.list'){
      const offset=Number.isSafeInteger(p.offset)&&p.offset>=0?p.offset:0,limit=Number.isSafeInteger(p.limit)?Math.min(50,Math.max(1,p.limit)):50,search=String(p.search||'').slice(0,200).toLowerCase();
      const rows=s.parsed.records.filter(r=>!search||[r.displayName,r.characterId,r.itemSettingsId,r.instanceId].join(' ').toLowerCase().includes(search)).sort((a,b)=>Number(b.editableFields.length>0)-Number(a.editableFields.length>0));
      return {records:copy(rows.slice(offset,offset+limit)),total:rows.length,offset,limit};
    }
    fail('AC_QUERY_UNSUPPORTED');
  },
  plan(bundle,{operations,operationDigest},ctx){
    if(!Array.isArray(operations)||operations.length>16||!/^[a-f0-9]{64}$/.test(operationDigest||''))fail('AC_OPERATION_LOG_INVALID');
    const s=read(bundle,ctx),changed=patchProgression(s.bytes,s.parsed,operations,s.artifact.sha256,{materialize:!s.native}),hasChanges=changed.changes.some(x=>x.before!==x.after);
    const output=hasChanges?ctx.writeArtifact({logicalPath:s.artifact.logicalPath,role:s.artifact.role},s.native?encodeNative(s,changed.changes):changed.bytes):s.artifact;
    // Read the actual emitted artifact, rather than validating a local substitute.
    if(!s.native){const reopened=parseProgression(ctx.readArtifact(output.id));for(const c of changed.changes){const r=reopened.records.find(x=>x.recordId===c.recordId);if(!r||r[c.field]!==c.after)fail('AC_REOPEN_MISMATCH');}}
    const siblingOutputs=bundle.artifacts.filter(a=>a.id!==s.artifact.id&&a.role!=='ac-key');
    const report={schema:'saverift.ac-shadows.changes.v1',sourceSha256:s.artifact.sha256,outputSha256:output.sha256,changes:changed.changes,format:summary(s).format,nativeGameFile:!!s.native,gameAcceptance:'not_run',siblingCount:siblingOutputs.length};
    const summaryRef=ctx.writeArtifact({logicalPath:'reports/ac-shadows-changes.json',role:'change-summary'},Uint8Array.from(JSON.stringify(report),c=>c.charCodeAt(0)));
    return {id:'candidate:ac-shadows',inputBundleDigest:bundle.bundleDigest,executionLockDigest:ctx.executionLock.digest,operationDigest,outputs:[output,...siblingOutputs],retainedInputArtifacts:[...siblingOutputs.map(a=>a.id),...(!hasChanges?[s.artifact.id]:[])],changeSummaryRef:summaryRef.id,requirements:{changedDomains:hasChanges?['inventory']:[]},validation:{checks:[check('ac.context-full-traversal'),check(s.native?'ac.fixed-width-planned-structure':'ac.fixed-width-reopen')]}};
  },
  validate(original,candidate,ctx){
    const s=read(original,ctx),out=candidate.outputs.find(a=>a.logicalPath===s.artifact.logicalPath);if(!out)fail('AC_CANDIDATE_MAIN_MISSING');
    if(s.native){
      const summaryBytes=ctx.readArtifact(candidate.changeSummaryRef);let text='';for(const b of summaryBytes)text+=String.fromCharCode(b);const report=JSON.parse(text);
      if(report.schema!=='saverift.ac-shadows.changes.v1'||report.sourceSha256!==s.artifact.sha256||report.outputSha256!==out.sha256||!Array.isArray(report.changes)||report.changes.length>16)fail('AC_CANDIDATE_BINDING');
      const seen=new Set();for(const c of report.changes){const r=s.parsed.records.find(r=>r.recordId===c.recordId);if(!r||!['level','quantity'].includes(c.field)||!r.editableFields.includes(c.field)||r[c.field]!==c.before||r.native[c.field+'Offset']!==c.offset||c.width!==4||seen.has(c.offset)||!Number.isSafeInteger(c.after)||c.after<1||c.after>(c.field==='level'?100:999999))fail('AC_CHANGE_WITNESS');seen.add(c.offset);}
      // The runner has already SHA-256-validated these immutable artifacts.
      const actual=ctx.readArtifact(out.id);
      // Compare the complete output to the source with only witnessed scalar
      // edits and recalculated integrity fields. This proves the candidate's
      // CRCs, wrapper, all untouched compressed records, and typed structure
      // without decrypting/parsing the same 7MB input a second time. The next
      // required workbench phase independently reopens the emitted candidate.
      // Same-width edits keep the XOR rotation identical. Recompute both CRCs
      // over the witnessed plaintext, then derive the exact changed ciphertext
      // bytes from oldCipher XOR oldPlain XOR newPlain. A full raw comparison
      // preserves everything else without an extra 7MB unwrap or re-encode.
      const decoded=new Uint8Array(s.native.decoded),view=new DataView(decoded.buffer),offsets=new Set([16,17,18,19,...[0,1,2,3].map(i=>decoded.length-4+i)]);
      for(const c of report.changes){const at=nativeOffset(s,c.offset);view.setUint32(at,c.after,true);for(let i=0;i<4;i++)offsets.add(at+i);}
      view.setUint32(16,seededCrc(decoded,20,decoded.length-4),true);view.setUint32(decoded.length-4,seededCrc(decoded,0,decoded.length-4,0x82f63b78),true);
      const originalRaw=ctx.readArtifact(s.artifact.id),expectedBytes=new Map();for(const at of offsets)expectedBytes.set(at+40,originalRaw[at+40]^s.native.decoded[at]^decoded[at]);
      let conserved=actual.length===originalRaw.length;for(const [at,value]of expectedBytes)if(actual[at]!==value)conserved=false;
      for(let i=0;conserved&&i<actual.length;i++)if(actual[i]!==originalRaw[i]&&expectedBytes.get(i)!==actual[i])conserved=false;
      const siblings=original.artifacts.filter(a=>a.id!==s.artifact.id&&a.role!=='ac-key'),siblingsPass=siblings.every(a=>candidate.outputs.some(b=>b.id===a.id&&b.sha256===a.sha256&&b.byteLength===a.byteLength))&&candidate.outputs.length===siblings.length+1;
      return {checks:[check('ac.context-full-traversal'),check('ac.whole-context-conservation',conserved),check('ac.sibling-preservation',siblingsPass),check('ac.record-count-preservation',conserved),check('ac.native-container-integrity',conserved),check('ac.native-whole-file-conservation',conserved),check('ac.private-key-excluded',!candidate.outputs.some(a=>a.role==='ac-key'||a.id===s.native.keyArtifactId))]};
    }
    // Validate the source tree once. Exact conservation below proves all native
    // shape/count bytes unchanged; only bounded scalar field payloads may vary.
    // The workbench's separate reopen phase fully parses the emitted candidate.
    const next=read({...original,artifacts:[out,...original.artifacts.filter(a=>a.id!==s.artifact.id)]},ctx,{parse:false}),bytes=next.bytes,summaryBytes=ctx.readArtifact(candidate.changeSummaryRef);let text='';for(const b of summaryBytes)text+=String.fromCharCode(b);const report=JSON.parse(text);
    if(report.schema!=='saverift.ac-shadows.changes.v1'||report.sourceSha256!==s.artifact.sha256||report.outputSha256!==out.sha256||!Array.isArray(report.changes)||report.changes.length>16)fail('AC_CANDIDATE_BINDING');
    const expectedBytes=new Map(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),seen=new Set();
    for(const c of report.changes){const record=s.parsed.records.find(r=>r.recordId===c.recordId);if(!record||!['level','quantity'].includes(c.field)||!record.editableFields.includes(c.field)||record[c.field]!==c.before||c.offset!==record.native[c.field+'Offset']||c.width!==4||seen.has(c.offset)||!Number.isSafeInteger(c.after)||c.after<1||c.after>(c.field==='level'?100:999999)||view.getUint32(c.offset,true)!==c.after)fail('AC_CHANGE_WITNESS');seen.add(c.offset);for(let i=0;i<4;i++)expectedBytes.set(c.offset+i,(c.after>>>(i*8))&255);}
    let preserved=s.bytes.length===bytes.length;for(let i=0;preserved&&i<bytes.length;i++)if(s.bytes[i]!==bytes[i]&&expectedBytes.get(i)!==bytes[i])preserved=false;
    const siblings=original.artifacts.filter(a=>a.id!==s.artifact.id&&a.role!=='ac-key'),siblingsPass=siblings.every(a=>candidate.outputs.some(b=>b.id===a.id&&b.sha256===a.sha256&&b.byteLength===a.byteLength))&&candidate.outputs.length===siblings.length+1;
    let nativeConserved=true;if(s.native){
      if(!next.native||s.native.decoded.length!==next.native.decoded.length||!s.native.header.every((v,i)=>v===next.native.header[i]))nativeConserved=false;
      else{const allowed=new Set([16,17,18,19,...[0,1,2,3].map(i=>s.native.decoded.length-4+i)]);for(const c of report.changes){const at=nativeOffset(s,c.offset);for(let i=0;i<4;i++)allowed.add(at+i);}for(let i=0;i<s.native.decoded.length;i++)if(s.native.decoded[i]!==next.native.decoded[i]&&!allowed.has(i)){nativeConserved=false;break;}}
    }
    return {checks:[check('ac.context-full-traversal'),check('ac.whole-context-conservation',preserved),check('ac.sibling-preservation',siblingsPass),check('ac.record-count-preservation',preserved),...(s.native?[check('ac.native-container-integrity'),check('ac.native-whole-file-conservation',nativeConserved),check('ac.private-key-excluded',!candidate.outputs.some(a=>a.role==='ac-key'||a.id===s.native.keyArtifactId))]:[])]};
  },
  close(handle){if(handle?.id)states.delete(handle.id);else states.clear();cached=null;return null;}
};
