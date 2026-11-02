// SPDX-License-Identifier: MPL-2.0
// Experimental format research API. It does not name unknown gameplay fields
// or establish entitlement safety, engine behavior, or publication authority.
import {Buffer} from '../../../sdk/buffer.mjs';
import {hash} from './source-binding.mjs';
import {decodeSave,encodeSave,CodecError} from './crimson-codec.mjs';
import {readDocument} from './crimson-document.mjs';
const fail=code=>{throw new CodecError('The typed document research operation stopped at its reported check.',code);};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function describeDocument(document,{typeOffset=0,typeLimit=100,rootOffset=0,rootLimit=100}={}){
 if([typeOffset,rootOffset].some(n=>!Number.isSafeInteger(n)||n<0)||[typeLimit,rootLimit].some(n=>!Number.isSafeInteger(n)||n<1||n>100))fail('CRIMSON_DOCUMENT_QUERY_INVALID');
 return {api:'crimson.document',apiVersion:'0.1.0',plaintextSha256:document.plaintextSha256,schemaSha256:document.schemaSha256,byteLength:document.plaintext.length,audit:document.audit,typeCount:document.schema.types.length,types:document.schema.types.slice(typeOffset,typeOffset+typeLimit).map(t=>({index:t.index,name:t.name,fieldCount:t.fields.length})),typeOffset,typeLimit,rootCount:document.blocks.length,roots:document.blocks.slice(rootOffset,rootOffset+rootLimit).map(b=>({type:b.type,start:b.start,end:b.end})),rootOffset,rootLimit,preservation:'original_bytes_are_authoritative',researchWrites:'experimental_fixed_width_only',hostedAuthorization:'independent_host_validation_required'};
}
export function queryDocumentSchema(document,{typeIndex,offset=0,limit=100}={}){
 if(!Number.isSafeInteger(typeIndex)||!document.schema.types[typeIndex]||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('CRIMSON_DOCUMENT_QUERY_INVALID');const type=document.schema.types[typeIndex];return {api:'crimson.document.schema',apiVersion:'0.1.0',schemaSha256:document.schemaSha256,typeIndex,name:type.name,fields:type.fields.slice(offset,offset+limit),offset,limit,total:type.fields.length,hasMore:offset+limit<type.fields.length};
}
export function queryDocumentFields(document,{prefix='',offset=0,limit=100}={}){
 if(typeof prefix!=='string'||prefix.length>512||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('CRIMSON_DOCUMENT_QUERY_INVALID');
 const records=[];let total=0;
 readDocument(document.plaintext,{captureTypes:[],listLimit:0,onScalar:event=>{if(!event.path.startsWith(prefix))return;const index=total++;if(index>=offset&&records.length<limit)records.push({path:event.path,offset:event.offset,byteLength:event.bytes,type:event.type,present:true,value:event.value,sha256:hash(document.plaintext.subarray(event.offset,event.offset+event.bytes))});}});
 return {api:'crimson.document.fields',apiVersion:'0.1.0',plaintextSha256:document.plaintextSha256,schemaSha256:document.schemaSha256,records,offset,limit,total,hasMore:offset+records.length<total};
}
export function queryDocumentBytes(document,{offset=0,length=256}={}){
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<1||length>4096||offset+length>document.plaintext.length)fail('CRIMSON_DOCUMENT_QUERY_INVALID');
 return {api:'crimson.document.bytes',apiVersion:'0.1.0',plaintextSha256:document.plaintextSha256,schemaSha256:document.schemaSha256,offset,byteLength:length,hex:document.plaintext.subarray(offset,offset+length).toString('hex')};
}
export async function patchFixedWidth(encoded,params,{originalDocument,nonce}={}){
 if(!exact(params,['plaintextSha256','schemaSha256','patches'])||params.plaintextSha256!==originalDocument?.plaintextSha256||params.schemaSha256!==originalDocument?.schemaSha256||!Array.isArray(params.patches)||params.patches.length<1||params.patches.length>16)fail('CRIMSON_DOCUMENT_PATCH_BINDING_INVALID');
 const requested=new Map(),ranges=[];
 for(const p of params.patches){
  if(!exact(p,['path','offset','expectedHex','replacementHex'])||typeof p.path!=='string'||!p.path||p.path.length>512||requested.has(p.path)||!Number.isSafeInteger(p.offset)||p.offset<0||typeof p.expectedHex!=='string'||!/^(?:[a-f0-9]{2}){1,4096}$/.test(p.expectedHex)||typeof p.replacementHex!=='string'||p.replacementHex.length!==p.expectedHex.length||!/^[a-f0-9]+$/.test(p.replacementHex)||p.expectedHex===p.replacementHex)fail('CRIMSON_DOCUMENT_PATCH_INVALID');
  const end=p.offset+p.expectedHex.length/2;if(ranges.some(r=>p.offset<r.end&&end>r.start))fail('CRIMSON_DOCUMENT_PATCH_OVERLAP');ranges.push({start:p.offset,end});requested.set(p.path,p);
 }
 function checkLocators(raw){const matched=new Set();readDocument(raw,{captureTypes:[],listLimit:0,onScalar:event=>{const p=requested.get(event.path);if(!p)return;if(matched.has(p.path)||event.offset!==p.offset||event.bytes*2!==p.expectedHex.length||raw.subarray(event.offset,event.offset+event.bytes).toString('hex')!==p.expectedHex)fail('CRIMSON_DOCUMENT_PATCH_LOCATOR_CHANGED');matched.add(p.path);}});if(matched.size!==requested.size)fail('CRIMSON_DOCUMENT_PATCH_NOT_PRESENT_FIXED_SCALAR');}
 checkLocators(originalDocument.plaintext);
 const before=await decodeSave(encoded),document=readDocument(before.plaintext,{captureTypes:[],listLimit:0,onScalar:()=>{}});if(document.schemaSha256!==params.schemaSha256)fail('CRIMSON_DOCUMENT_PATCH_SCHEMA_CHANGED');checkLocators(before.plaintext);
 const noOp=await encodeSave(before.plaintext,before.header,{nonce:before.header.subarray(0x1a,0x2a)});if(!noOp.equals(encoded))fail('CRIMSON_DOCUMENT_PATCH_NATIVE_PARITY_FAILED');
 const patched=Buffer.from(before.plaintext);for(const p of requested.values())Buffer.from(p.replacementHex,'hex').copy(patched,p.offset);
 for(let at=0;at<patched.length;at++)if(patched[at]!==before.plaintext[at]&&!ranges.some(r=>at>=r.start&&at<r.end))fail('CRIMSON_DOCUMENT_PATCH_UNINTENDED_BYTES');
 const after=readDocument(patched,{captureTypes:[],listLimit:0,compareTo:before.plaintext,onScalar:()=>{}});if(after.schemaSha256!==document.schemaSha256||JSON.stringify(after.audit)!==JSON.stringify(document.audit)||after.decodedDiff.length!==requested.size||after.decodedDiff.some(d=>!params.patches.some(p=>p.path===d.path&&p.offset===d.offset&&p.expectedHex.length===d.bytes*2)))fail('CRIMSON_DOCUMENT_PATCH_UNINTENDED_VALUES');
 const output=await encodeSave(patched,before.header,nonce?{nonce}:{}),reopened=await decodeSave(output);if(!reopened.plaintext.equals(patched))fail('CRIMSON_DOCUMENT_PATCH_REOPEN_FAILED');readDocument(reopened.plaintext,{captureTypes:[],listLimit:0});
 if(!reopened.header.subarray(0,0x12).equals(before.header.subarray(0,0x12))||!reopened.header.subarray(0x4a,128).equals(before.header.subarray(0x4a,128)))fail('CRIMSON_DOCUMENT_PATCH_HEADER_CHANGED');
 return {encoded:output,report:{schema:'saverift.crimson-fixed-width-patch.v1',apiVersion:'0.1.0',experimental:true,sourceSha256:hash(encoded),outputSha256:hash(output),beforePlaintextSha256:document.plaintextSha256,afterPlaintextSha256:after.plaintextSha256,schemaSha256:document.schemaSha256,decodedDiff:after.decodedDiff,validation:{matchedPresentTypedScalars:true,allOtherPlaintextBytesUnchanged:true,fullTypedTraversal:true,nativeNoOpByteParity:true,unknownHeaderBytesPreserved:true,hmacReverified:true,encodedOutputReopened:true,omittedListMarkersPreserved:true,nonzeroListMetadataPreserved:true},entitlementEffects:'unreviewed',requiresIndependentHostInspector:true,gameAcceptance:'unverified',cloudRequests:0,writesEnabled:false}};
}
