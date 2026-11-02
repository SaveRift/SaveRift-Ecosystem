// SPDX-License-Identifier: Apache-2.0
// Generated native saves only: no player bytes, account data or Xbox calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,createCipheriv} from 'node:crypto';
import {Buffer} from '../../../sdk/buffer.mjs';
import {hash} from '../../../sdk/crypto.mjs';
import {createSaveBundle} from '../../../sdk/contracts.mjs';
import {createExecutionLock,createPluginSession,runPlugin} from '../../../sdk/runner.mjs';
import {encodeSave,decodeSave} from '../src/crimson-codec.mjs';
import {readDocument} from '../src/crimson-document.mjs';
import {buildCrimsonPackage} from '../scripts/build.mjs';
import {checkedUploadReport} from '../ui/components/upload-report.mjs';
import {quantityParcFixture,u16,u32} from './synthetic-parc.mjs';
const text=value=>Buffer.concat([u32(Buffer.byteLength(value)),Buffer.from(value)]);
function opaqueFixture(length){
 const random=Buffer.alloc(length);let state=0x6d2b79f5;for(let i=0;i<length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;random[i]=state&255;}
 const schema=Buffer.concat([u32(1),u16(1),text('InventorySaveData'),u16(1),text('_syntheticOpaquePayload'),text('ByteBuffer'),u16(1),u16(1),u32(0)]),prefix=Buffer.alloc(14);prefix.writeUInt16LE(65535);prefix.writeUInt16LE(4,2);
 const dataStart=14+schema.length+32,block=Buffer.concat([u16(1),Buffer.from([1]),u32(0x1234),u32(random.length),random]);
 return Buffer.concat([prefix,schema,u32(0),u32(1),u32(dataStart+block.length),u32(0),u32(0x1234),u32(0x5678),u32(dataStart),u32(block.length),block]);
}
async function selectedUpload(raw,{cloudMapping=false}={}){
 const header=Buffer.alloc(128);header.write('SAVE');header.writeUInt16LE(2,4);header.writeUInt16LE(128,6);header[0x70]=37;header[0x7f]=90;
 const bytes=await encodeSave(raw,header,{nonce:Buffer.alloc(16,9)}),bundle=createSaveBundle([{id:'uploaded-save',logicalPath:cloudMapping?'slot100,savedgame/save':'uploads/generated.save',role:'main',byteLength:bytes.length,sha256:hash(bytes)}],{id:'generated-upload',hints:{gameIdentity:'crimson-desert'}}),pkg=await buildCrimsonPackage({write:false});return {package:pkg,executionLock:createExecutionLock(pkg),bundle,artifacts:new Map([['uploaded-save',bytes]]),bytes,raw};
}
async function verifyNativeExport(report,artifacts,source){
 assert.equal(checkedUploadReport(report,source.bundle.artifacts),true);assert.equal(report.nativeCopyDelivery,'binary_artifact');assert.equal(report.source,'user_upload');assert.equal(report.originalsUnchanged,true);assert.equal(report.stored,false);assert.equal(report.cloudRequests,0);assert.equal(report.xboxMutations,0);assert.equal(report.xboxTransfer.canSend,false);assert.equal(report.xboxTransfer.state,'not_verified');
 const file=report.files[0],copy=file.nativeCopy;assert.equal(file.status,'validated');assert.equal(file.checks.integrity,true);assert.equal(file.checks.structure,true);assert.equal(file.checks.roundTrip,true);assert.equal(file.checks.plaintextUnchanged,true);assert.equal(Object.hasOwn(copy,'dataBase64'),false);assert.equal(copy.artifact.role,'native-export');assert.equal(copy.artifact.byteLength,copy.bytes);assert.equal(copy.artifact.sha256,copy.sha256);assert.match(copy.artifact.logicalPath,/^exports\/1-native-/);
 const bytes=Buffer.from(artifacts.get(copy.artifact.id));assert.equal(bytes.length,copy.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),copy.sha256);
 // Independent OpenSSL crypto verifies the returned artifact, rather than
 // trusting only the in-guest inspector's checksum and integrity assertions.
 const key=Buffer.from('9a4beb127f9e748b148d6690c25cc9379a315bd56c28af6319fd559f1152ac00','hex'),compressed=createCipheriv('chacha20',key,bytes.subarray(0x1a,0x2a)).update(bytes.subarray(128));assert.equal(createHmac('sha256',key).update(compressed).digest('hex'),bytes.subarray(0x2a,0x4a).toString('hex'));
 const reopened=await decodeSave(bytes);assert.equal(reopened.plaintext.equals(source.raw),true);assert.equal(reopened.header[0x70],37);assert.equal(reopened.header[0x7f],90);assert.equal(readDocument(reopened.plaintext,{captureTypes:[],listLimit:0}).audit.unconsumedBytes,0);assert.equal(hash(source.artifacts.get('uploaded-save')),hash(source.bytes));
 const json=JSON.stringify(report);assert.equal(json.includes('dataBase64'),false);assert.ok(Buffer.byteLength(json)<16*1024);return {copy,bytes,json};
}
test('Advanced import emits a native-copy artifact and a small report for an already opened synthetic save',async()=>{
 const source=await selectedUpload(quantityParcFixture().raw,{cloudMapping:true}),session=await createPluginSession(source);try{const handle=await session.call('open',[source.bundle]),report=await session.call('query',[handle,{method:'crimson.import.inspect'}]);await verifyNativeExport(report,session.artifacts(),source);}finally{session.close();}
});
test('a native copy larger than the JSON wire limit crosses the isolated binary channel and independently reopens',async t=>{
 const source=await selectedUpload(opaqueFixture(300*1024));assert.ok(source.bytes.length>256*1024);
 const result=await runPlugin({...source,method:'query',args:[source.bundle,{method:'crimson.import.inspect'}]}),checked=await verifyNativeExport(result.result,result.artifacts,source);
 assert.ok(checked.bytes.length>256*1024);assert.ok(Buffer.byteLength(checked.json)<256*1024);assert.equal(result.artifacts.size,1);t.diagnostic(`Generated native copy: ${checked.copy.bytes} bytes; JSON report: ${Buffer.byteLength(checked.json)} bytes.`);
});
test('an invalid upload retains its integrity rejection and creates no native-export artifact',async()=>{
 const source=await selectedUpload(quantityParcFixture().raw),bytes=Buffer.from(source.bytes);bytes[bytes.length-1]^=1;const original=source.bundle.artifacts[0],bundle=createSaveBundle([{...original,sha256:hash(bytes)}],{id:source.bundle.id,hints:source.bundle.hints}),result=await runPlugin({...source,bundle,artifacts:new Map([[original.id,bytes]]),method:'query',args:[bundle,{method:'crimson.import.inspect'}]});
 assert.equal(result.result.files[0].status,'invalid');assert.equal(result.result.files[0].code,'CRIMSON_HMAC_FAILED');assert.equal(Object.hasOwn(result.result.files[0],'nativeCopy'),false);assert.equal(result.artifacts.size,0);assert.equal(result.result.xboxTransfer.canSend,false);assert.equal(result.result.xboxMutations,0);
});
