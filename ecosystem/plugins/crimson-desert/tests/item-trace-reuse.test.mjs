// SPDX-License-Identifier: Apache-2.0
// Invented catalog, schema and saves exercise both unchanged and patched traces.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Buffer} from '../../../sdk/buffer.mjs';
import {hash} from '../../../sdk/crypto.mjs';
import {configureDataProviders} from '../src/data-provider.mjs';
import {encodeSave,decodeSave} from '../src/crimson-codec.mjs';
import {readDocument,value,elements} from '../src/crimson-document.mjs';
import {u16,u32,u64} from './synthetic-parc.mjs';

const entries=[[4242,2,'50',0,100,5,false,[],0,0],[4243,3,'50',0,100,5,false,[],0,0],[4244,2,'50',0,100,5,false,[9],1,0]],data={entries,entriesSha256:hash(JSON.stringify(entries)),unavailable:[],balanceDefinitions:[],columns:[],source:{},runtimeRequirements:{}};
const catalog={manifest:{revision:'synthetic.v1',effectiveSha256:'0'.repeat(64)},items:[{key:4242,name:'Synthetic stack',internalName:'Synthetic_Stack',category:'Test',referenceMaxStack:'50'}]};
configureDataProviders([['crimson-construction-items.json',data],['crimson-items.json',catalog]].map(([id,data])=>{const bytes=Buffer.from(JSON.stringify(data));return{id,bytes,sha256:hash(bytes)};}),{synthetic:true});
const {createCatalogItemAddition}=await import('../src/crimson-item-addition.mjs');
const str=s=>Buffer.concat([u32(Buffer.byteLength(s)),Buffer.from(s)]);
const fields=[['_saveVersion','uint32',0,4],['_itemNo','ItemNo',0,8],['_itemKey','ItemKey',0,4],['_slotNo','TItemSlotNo',0,2],['_stackCount','TStackCount',0,8],['_enchantLevel','uint16',0,2],['_endurance','uint16',0,2],['_maxSocketCount','uint8',0,1],['_validSocketCount','uint8',0,1],['_transferredItemKey','ItemKey',0,4],['_maxChargeUseableCount','uint32',0,4],['_chargedUseableCount','uint64',0,8],['_isNewMark','bool',0,1],['_socketSaveDataList','ReflectObject',6,0]];
function fixture({count=1,quantity='5',secondBag=false,ownedKey=101,knowledgeCount=1}={}){
 const types=[['InventorySaveData',[['_inventorylist','ReflectObject',6,0]]],['InventoryElementSaveData',[['_inventoryKey','InventoryKey',0,2],['_varyExpandSlotCount','TInventorySlotNo',0,2],['_itemList','ReflectObject',6,0]]],['ItemSaveData',fields],['ItemSocketSaveData',[['_invented','uint32',0,4]]],['KnowledgeSaveData',[['_list','ReflectObject',6,0]]],['KnowledgeElementSaveData',[['_key','KnowledgeKey',0,4],['_level','TLevel',0,4],['_learnedFieldTime','uint64',0,8],['_isNewMark','bool',0,1]]]];
 const schema=Buffer.concat([u32(1),u16(types.length),...types.flatMap(([name,defs])=>[str(name),u16(defs.length),...defs.map(([name,type,kind,size])=>Buffer.concat([str(name),str(type),u16(kind),u16(size),u32(0)]))])]),prefix=Buffer.alloc(14);prefix.writeUInt16LE(65535);prefix.writeUInt16LE(4,2);
 const base=14+schema.length+12+40,chunks=[];let pos=base;
 const emit=b=>{chunks.push(b);pos+=b.length;};
 function object(index,mask,build){emit(u16(mask.length));emit(Buffer.from(mask));emit(u16(index));emit(Buffer.from([0]));emit(Buffer.alloc(8,255));emit(u32(pos+4));const start=pos;emit(u32(17));build();emit(u32(pos-start));}
 function list(count,build){emit(Buffer.from([0]));emit(u32(count));emit(Buffer.from([0,9,0,0,0,0,0,0,0,0,0,0,0]));for(let i=0;i<count;i++)build(i);}
 emit(u16(1));emit(Buffer.from([1]));emit(u32(17));list(secondBag?2:1,b=>object(1,[7],()=>{emit(u16(b?3:2));emit(u16(0));list(b?0:count,i=>object(2,[31,0],()=>{emit(u32(1));emit(u64(100+i));emit(u32(ownedKey));emit(u16(i));emit(u64(quantity));emit(Buffer.from([1]));}));}));
 const firstBytes=pos-base,secondStart=pos;emit(u16(1));emit(Buffer.from([1]));emit(u32(17));list(knowledgeCount,()=>object(5,[15],()=>{emit(u32(9));emit(u32(1));emit(u64(123));emit(Buffer.from([1]));}));
 const block=Buffer.concat(chunks),raw=Buffer.concat([prefix,schema,u32(0),u32(2),u32(pos),u32(0),u32(0),u32(0),u32(base),u32(firstBytes),u32(4),u32(0),u32(0),u32(secondStart),u32(pos-secondStart),block]);
 return raw;
}
async function add(options,inputs){
 const raw=fixture(options),document=readDocument(raw),header=Buffer.alloc(128);header.write('SAVE');header.writeUInt16LE(2,4);header.writeUInt16LE(128,6);header[0x70]=37;
 const encoded=await encodeSave(raw,header,{nonce:Buffer.alloc(16,7)}),sourceCopy=Buffer.from(encoded),compiler=createCatalogItemAddition({schemaPins:[document.schemaSha256]}),result=await compiler.many(encoded,inputs,{nonce:Buffer.alloc(16,8)}),after=readDocument((await decodeSave(result.encoded)).plaintext),bags=elements(after.blocks.find(b=>b.type==='InventorySaveData'),'_inventorylist');
 assert.equal(encoded.equals(sourceCopy),true);assert.equal(result.report.validation.reverseStructuralByteParity,true);assert.equal(result.report.validation.allOtherOriginalScalarValuesUnchanged,true);assert.equal(result.report.validation.nonzeroListMetadataBefore,result.report.validation.nonzeroListMetadataAfter);assert.equal(result.report.validation.nativeOutputNoOpByteParity,true);
 for(const bag of bags)for(const item of elements(bag,'_itemList').filter(i=>value(i,'_itemKey')===101))assert.equal(value(item,'_stackCount'),options.quantity||'5');
 return {result,bags,after,source:sourceCopy,inputs};
}

test('structural scope witnesses reject clones and changed bytes, intent or reports',async()=>{
 const {itemScopeWitness}=await import('../src/crimson-item-addition.mjs'),f=await add({},[{definitionKey:4242,quantity:'2'}]);
 assert.equal(itemScopeWitness(f.result,f.source,f.inputs).kind,'native-item-structural-byte-proof');
 assert.equal(itemScopeWitness({...f.result},f.source,f.inputs),null);
 assert.equal(itemScopeWitness(f.result,f.source,[{definitionKey:4242,quantity:'3'}]),null);
 const changed=Buffer.from(f.source);changed[128]^=1;assert.equal(itemScopeWitness(f.result,changed,f.inputs),null);
 f.result.report.validation.claimedByCaller=true;assert.equal(itemScopeWitness(f.result,f.source,f.inputs),null);delete f.result.report.validation.claimedByCaller;
 const original=f.result.encoded[128];f.result.encoded[128]^=1;assert.equal(itemScopeWitness(f.result,f.source,f.inputs),null);f.result.encoded[128]=original;
 assert.ok(itemScopeWitness(f.result,f.source,f.inputs));
});

test('native relocation metadata proves exact bytes and forged locator arrays retain scalar checks',async()=>{
 const {traceStructuralDocument,insertTypedRecords}=await import('../src/crimson-structural-layout.mjs'),f=await add({},[{definitionKey:4242,quantity:'2'}]),raw=(await decodeSave(f.source)).plaintext;
 const added=elements(elements(f.after.blocks.find(b=>b.type==='InventorySaveData'),'_inventorylist')[0],'_itemList').find(i=>value(i,'_itemKey')===4242),record=f.after.plaintext.subarray(added.wrapperStart,added.end);
 const make=()=>{const trace=traceStructuralDocument(Buffer.from(raw),{captureTypes:['InventorySaveData'],listLimit:1024}),bag=elements(trace.document.blocks[0],'_inventorylist')[0];return{trace,list:bag.fields._itemList,scalar:elements(bag,'_itemList')[0].fields._stackCount.offset};};
 const native=make(),changed=insertTypedRecords(native.trace,native.list,[record]);
 assert.equal(changed.conservationProof,'native_metadata_reverse_bytes');assert.equal(changed.raw.equals(f.after.plaintext),true);
 const copied=make(),legacy=insertTypedRecords({...copied.trace},copied.list,[record]);
 assert.equal(legacy.conservationProof,'full_scalar_stream');assert.equal(legacy.raw.equals(changed.raw),true);
 const forged=make();forged.trace.locators.push({pointerOffset:forged.scalar,advertisedPayloadOffset:forged.list.end});
 assert.throws(()=>insertTypedRecords(forged.trace,forged.list,[record]),{code:'CRIMSON_STRUCTURAL_SEMANTIC_DIFF'});
 const mutated=make();mutated.trace.document.plaintext[mutated.scalar]^=1;
 assert.throws(()=>insertTypedRecords(mutated.trace,mutated.list,[record]),{code:'CRIMSON_STRUCTURAL_SOURCE_CHANGED'});
});
test('an explicit item with no pickup discovery preserves an empty valid knowledge list',async()=>{
 const {result,after}=await add({knowledgeCount:0},[{definitionKey:4242,quantity:'2'}]);
 const list=after.blocks.find(b=>b.type==='KnowledgeSaveData').fields._list;
 assert.equal(list.count,0);assert.equal(list.value.elements.length,0);assert.equal(list.value.metadataBytes[1],9);
 assert.deepEqual(result.report.discovery.changes,[]);assert.ok(result.report.decodedDiff.every(change=>change.operation==='inventory.addItem'));
});

test('no-discovery items still reject malformed knowledge during full typed traversal',async()=>{
 const raw=fixture({knowledgeCount:0}),document=readDocument(raw),header=Buffer.alloc(128);header.write('SAVE');header.writeUInt16LE(2,4);header.writeUInt16LE(128,6);
 raw[document.schema.toc[1].offset+7]=2;
 const source=await encodeSave(raw,header,{nonce:Buffer.alloc(16,7)});
 await assert.rejects(createCatalogItemAddition({schemaPins:[document.schemaSha256]}).many(source,[{definitionKey:4242,quantity:'2'}],{nonce:Buffer.alloc(16,8)}),{code:'PARC_TYPED_INVALID'});
});

test('unchanged first working inventory reuses its complete original scalar and locator proof',async()=>{
 const {result,bags}=await add({},[{definitionKey:4242,quantity:'2'}]);assert.equal(elements(bags[0],'_itemList').length,2);assert.equal(result.report.capacity.automaticExpansion,false);assert.equal(value(elements(bags[0],'_itemList')[1],'_stackCount'),'2');
});

test('combined scalar and item compiler binds fused scalar locators and preserves the independent tuple digest',async()=>{
 const {sourceFromBundle}=await import('../src/source-binding.mjs'),{createStructuralDraftCompiler}=await import('../src/structural-draft.mjs'),{STRUCTURAL_PLAN_SCHEMA}=await import('../src/structural-publication-profile.mjs'),{createCrimsonDraftCompiler}=await import('../src/crimson-draft.mjs'),{DECODER_REVISION}=await import('../src/crimson-document.mjs'),{CATALOG_REVISION}=await import('../src/crimson-domain.mjs');
 const raw=fixture({ownedKey:4242}),document=readDocument(raw),header=Buffer.alloc(128);header.write('SAVE');header.writeUInt16LE(2,4);header.writeUInt16LE(128,6);header[0x70]=37;
 const encoded=await encodeSave(raw,header,{nonce:Buffer.alloc(16,7)}),lobby=Buffer.from('invented immutable pair'),files=new Map([['main',encoded],['sidecar',lobby]]),bundle={id:'combined-synthetic',bundleDigest:hash('combined-synthetic'),artifacts:[...files].map(([id,bytes])=>({id,logicalPath:'slot100,savedgame/'+(id==='main'?'save':'lobby'),role:id==='main'?'main':'sidecar',byteLength:bytes.length,sha256:hash(bytes)}))},bound=sourceFromBundle(bundle,{readArtifact:id=>files.get(id)}),plan={schema:STRUCTURAL_PLAN_SCHEMA,container:'slot100,savedgame',payload:'save',backupSha256:bundle.bundleDigest,backupRevision:bundle.bundleDigest,payloadSha256:hash(encoded),plaintextSha256:document.plaintextSha256,schemaSha256:document.schemaSha256,decoderRevision:DECODER_REVISION,catalogRevision:CATALOG_REVISION,operations:[{operation:'inventory.setQuantity',inventoryKey:2,definitionKey:4242,instanceId:'100',slot:0,expectedValue:'5',desiredValue:'6'},{operation:'inventory.addItem',definitionKey:4244,quantity:'2'}]};
 const scalarDraft=createCrimsonDraftCompiler({schemaPins:[{schemaSha256:document.schemaSha256,requiresHousing:false}]}),scalarCompiler=(b,m,p,options)=>scalarDraft(b,m,p,{...options,retainEncoded:true}),options={schemaPins:[document.schemaSha256],itemCompiler:createCatalogItemAddition({schemaPins:[document.schemaSha256]}).many,scalarCompiler},compile=createStructuralDraftCompiler(options),result=await compile(bound.source,bound.metadata,plan,{nonce:Buffer.alloc(16,8),retainEncoded:true}),after=readDocument((await decodeSave(result.encoded)).plaintext),items=elements(elements(after.blocks[0],'_inventorylist')[0],'_itemList'),original=items.find(i=>value(i,'_itemNo')==='100'),added=items.find(i=>value(i,'_itemKey')===4244);
 assert.equal(value(original,'_stackCount'),'6');assert.equal(value(added,'_stackCount'),'2');
 const offset=result.report.operations.find(o=>o.operation==='inventory.setQuantity').offset,target=[];readDocument(raw,{captureTypes:[],onScalar:e=>{if(e.offset===offset)target.push(e.path);}});assert.equal(target.length,1);
 function tupleDigest(bytes,range){const h=createHash('sha256');let count=0;readDocument(bytes,{captureTypes:[],onScalar:e=>{if(e.path===target[0]||range&&e.offset>=range.wrapperStart&&e.offset<range.end)return;h.update(JSON.stringify([e.path,e.type,e.bytes,e.value])+'\n','utf8');count++;}});return{sha256:h.digest('hex'),count};}
 const beforeDigest=tupleDigest(raw),afterDigest=tupleDigest(after.plaintext,added);assert.deepEqual(afterDigest,beforeDigest);
 const proof=result.report.validation.conservationProof;assert.equal(proof.format,'native-stage-witnesses.v1');assert.equal(proof.stages.length,2);assert.equal(proof.stages[0].sourceSha256,hash(encoded));assert.equal(proof.stages[0].outputSha256,proof.stages[1].sourceSha256);assert.equal(proof.stages[1].outputSha256,hash(result.encoded));
 const lightPlan={...plan,operations:[plan.operations[0],{operation:'inventory.addItem',definitionKey:4242,quantity:'2'}]},light=await compile(bound.source,bound.metadata,lightPlan,{nonce:Buffer.alloc(16,8),retainEncoded:true}),lightDocument=readDocument((await decodeSave(light.encoded)).plaintext);
 assert.equal(light.report.validation.conservationProof.stages.length,2);assert.equal(value(elements(lightDocument.blocks.find(b=>b.type==='KnowledgeSaveData'),'_list')[0],'_level'),1);
 // Cloning a real native result or copying its serialized proof cannot claim
 // the opaque fast path. The independent legacy digest remains available.
 const fallback=createStructuralDraftCompiler({...options,scalarCompiler:async(...args)=>({...await scalarCompiler(...args)}),itemCompiler:async(...args)=>({...await options.itemCompiler(...args)})});
 const cloned=await fallback(bound.source,bound.metadata,plan,{nonce:Buffer.alloc(16,8),retainEncoded:true});
 assert.equal(cloned.encoded.equals(result.encoded),true);assert.equal(cloned.report.validation.originalScalarDigest,beforeDigest.sha256);assert.equal(cloned.report.validation.originalScalarCount,beforeDigest.count);assert.equal(cloned.report.validation.conservationProof,undefined);
 const hostile=createStructuralDraftCompiler({...options,itemCompiler:async(...args)=>{
  const native=await options.itemCompiler(...args),decoded=await decodeSave(native.encoded),doc=readDocument(decoded.plaintext),level=elements(doc.blocks.find(b=>b.type==='KnowledgeSaveData'),'_list')[0].fields._level;
  decoded.plaintext.writeUInt32LE(2,level.offset);native.encoded=await encodeSave(decoded.plaintext,decoded.header,{nonce:decoded.header.subarray(0x1a,0x2a)});native.report.outputSha256=hash(native.encoded);native.scopeProof=proof;
  return native;
 }});
 await assert.rejects(hostile(bound.source,bound.metadata,plan,{nonce:Buffer.alloc(16,8),retainEncoded:true}),{code:'STRUCTURAL_UNINTENDED_CHANGE'});
 const invalid=createStructuralDraftCompiler({...options,scalarCompiler:async(...args)=>{const r=await scalarCompiler(...args);r.report.operations[0].fieldBytes++;return r;}});
 await assert.rejects(invalid(bound.source,bound.metadata,plan,{nonce:Buffer.alloc(16,8),retainEncoded:true}),{code:'STRUCTURAL_SCALAR_BINDING_FAILED'});
 const {prepareStructuralDocument}=await import('../src/structural-draft.mjs'),{bindPreparedSource}=await import('../src/source-binding.mjs'),context={readArtifact:id=>files.get(id)},preparedBound=sourceFromBundle(bundle,context),decoded=await decodeSave(encoded),preparedDocument=prepareStructuralDocument(decoded.plaintext,plan.operations);
 bindPreparedSource(preparedBound.source,preparedBound.metadata,{context,container:plan.container,payload:'save',payloadSha256:plan.payloadSha256,decoded,document:preparedDocument,projection:{captureTypes:['InventorySaveData'],fieldListLimits:{'InventoryElementSaveData._itemList':1024}}});
 const reused=await compile(preparedBound.source,preparedBound.metadata,plan,{nonce:Buffer.alloc(16,8),retainEncoded:true});assert.equal(reused.encoded.equals(result.encoded),true);
 const changedOriginal=createStructuralDraftCompiler({...options,itemCompiler:async(...args)=>{
  const r=await options.itemCompiler(...args);decoded.plaintext[decoded.plaintext.length-1]^=1;return r;
 }});
 await assert.rejects(changedOriginal(preparedBound.source,preparedBound.metadata,plan,{nonce:Buffer.alloc(16,8),retainEncoded:true}),{code:'STRUCTURAL_SOURCE_CHANGED'});
 decoded.plaintext[decoded.plaintext.length-1]^=1;
 elements(elements(preparedDocument.blocks[0],'_inventorylist')[0],'_itemList')[0].fields._stackCount.value='999';
 await assert.rejects(compile(preparedBound.source,preparedBound.metadata,plan,{nonce:Buffer.alloc(16,8),retainEncoded:true}),{code:'STRUCTURAL_SOURCE_CHANGED'});
});
test('capacity patches receive a fresh strict trace before insertion',async()=>{
 const {result,bags}=await add({count:50},[{definitionKey:4242,quantity:'1'}]);assert.equal(result.report.capacity.before,50);assert.equal(result.report.capacity.after,51);assert.equal(result.report.capacity.automaticExpansion,true);assert.equal(value(bags[0],'_varyExpandSlotCount'),1);assert.equal(elements(bags[0],'_itemList').length,51);
});
test('changed scalar input and a later bag insertion retain their own current strict proofs',async()=>{
 const {result,bags}=await add({quantity:'6',secondBag:true},[{definitionKey:4242,quantity:'1'},{definitionKey:4243,quantity:'3'}]);assert.equal(result.report.inserted.length,2);assert.equal(elements(bags[0],'_itemList').length,2);assert.equal(elements(bags[1],'_itemList').length,1);assert.equal(value(elements(bags[1],'_itemList')[0],'_stackCount'),'3');
});
