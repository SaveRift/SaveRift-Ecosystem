// SPDX-License-Identifier: Apache-2.0
// Internal projection controls never suppress strict format traversal.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from '../../../sdk/buffer.mjs';
import {readDocument} from '../src/crimson-document.mjs';
import {traceStructuralDocument} from '../src/crimson-structural-layout.mjs';
import {typedParcFixture,quantityParcFixture,u16,u32,u64} from './synthetic-parc.mjs';

test('filtered scalar observation retains full paths, schema, audit and traversal checks',()=>{
 const f=quantityParcFixture(),all=[],selected=[];
 const full=readDocument(f.raw,{captureTypes:[],onScalar:e=>all.push(e)}),limited=readDocument(f.raw,{captureTypes:[],scalarFields:['ItemSaveData._itemNo'],onScalar:e=>selected.push(e)});
 assert.deepEqual(selected,all.filter(e=>e.path.endsWith('._itemNo')));
 const named=[];readDocument(f.raw,{captureTypes:[],scalarFields:['_itemNo'],onScalar:e=>named.push(e)});assert.deepEqual(named,selected);
 assert.equal(selected.length,1);assert.match(selected[0].path,/\._inventorylist\[0\]\._itemList\[0\]\._itemNo$/);
 assert.deepEqual(limited.audit,full.audit);assert.equal(limited.schemaSha256,full.schemaSha256);assert.equal(limited.plaintextSha256,full.plaintextSha256);
 const broken=typedParcFixture();broken.raw[broken.markerOffset]=0;
 assert.throws(()=>readDocument(broken.raw,{captureTypes:[],scalarFields:[],onScalar(){throw Error('No selected scalar may run.');}}),{code:'PARC_TYPED_INVALID'});
 assert.throws(()=>readDocument(f.raw,{scalarFields:'not-an-array'}),{code:'PARC_TYPED_INVALID'});
});

test('an unobserved fixed-width change still receives a complete independent decoded diff',()=>{
 const f=quantityParcFixture(),events=[];readDocument(f.raw,{captureTypes:[],onScalar:e=>events.push(e)});
 const target=events.find(e=>e.path.endsWith('._stackCount')),patched=Buffer.from(f.raw);patched.writeBigUInt64LE(6n,target.offset);
 const d=readDocument(patched,{captureTypes:[],scalarFields:['ItemSaveData._itemNo'],onScalar(){},compareTo:f.raw});
 assert.equal(d.decodedDiff.length,1);assert.equal(d.decodedDiff[0].path,target.path);assert.equal(d.decodedDiff[0].before,'5');assert.equal(d.decodedDiff[0].after,'6');
});

test('omitting an unused plaintext digest retains the complete structural and scalar proofs',()=>{
 const f=typedParcFixture(),full=traceStructuralDocument(f.raw),scoped=traceStructuralDocument(f.raw,{hashPlaintext:false});
 for(const name of ['scalarDigest','scalarCount','locators','objects','identities'])assert.deepEqual(scoped[name],full[name],name);
 assert.deepEqual(scoped.document.audit,full.document.audit);assert.equal(scoped.document.schemaSha256,full.document.schemaSha256);assert.equal(scoped.document.plaintextSha256,null);assert.match(full.document.plaintextSha256,/^[a-f0-9]{64}$/);
 const changed=Buffer.from(f.raw);changed[f.markerOffset]=0;assert.throws(()=>traceStructuralDocument(changed,{hashPlaintext:false}),{code:'PARC_TYPED_INVALID'});
});

test('schema-precomputed scalar decoders retain signed, wide, float, vector and opaque values',()=>{
 const str=s=>Buffer.concat([u32(Buffer.byteLength(s)),Buffer.from(s)]),signed=(n,v)=>{const b=Buffer.alloc(n);n===8?b.writeBigInt64LE(BigInt(v)):b.writeIntLE(v,0,n);return b;},float=(n,v)=>{const b=Buffer.alloc(n);n===4?b.writeFloatLE(v):b.writeDoubleLE(v);return b;};
 const rows=[['bool','bool',Buffer.from([255]),true],['signed1','int8',signed(1,-11),-11],['signed2','int16',signed(2,-1234),-1234],['signed4','int32',signed(4,-1234567),-1234567],['signed8','int64',signed(8,'-9007199254740993'),'-9007199254740993'],['unsigned1','uint8',Buffer.from([230]),230],['unsigned2','uint16',u16(65500),65500],['unsigned4','uint32',u32(4294967290),4294967290],['unsigned8','uint64',u64('18446744073709551615'),'18446744073709551615'],['float','float',float(4,1.25),1.25],['double','float64',float(8,-9.5),-9.5],['negativeZero','float',float(4,-0),-0],['floatNaN','float',float(4,NaN),NaN],['infinity','float64',float(8,Infinity),Infinity],['vec','float3',Buffer.concat([float(4,1),float(4,2),float(4,3)]),[1,2,3]],['quat','quaternion',Buffer.concat([-1,0,0.5,1].map(n=>float(4,n))),[-1,0,0.5,1]],['opaque','Unmapped',Buffer.from([1,2,3]),{encoding:'opaque',bytes:3,hex:'010203'}],['array','float',Buffer.concat([Buffer.from([0]),u32(3),float(4,1),float(4,2),float(4,3)]),[1,2,3],3,4]];
 const schema=Buffer.concat([u32(1),u16(1),str('InventorySaveData'),u16(rows.length),...rows.map(([name,type,bytes,,kind=0,size=bytes.length])=>Buffer.concat([str(name),str(type),u16(kind),u16(size),u32(0)]))]),prefix=Buffer.alloc(14);prefix.writeUInt16LE(65535);prefix.writeUInt16LE(4,2);
 const start=14+schema.length+32,mask=Buffer.alloc(Math.ceil(rows.length/8),255),block=Buffer.concat([u16(mask.length),mask,u32(17),...rows.map(r=>r[2])]),raw=Buffer.concat([prefix,schema,u32(0),u32(1),u32(block.length),u32(0),u32(0),u32(0),u32(start),u32(block.length),block]);
 const d=readDocument(raw);for(const [name,,bytes,expected]of rows){assert.deepEqual(d.blocks[0].fields[name].value,expected,name);assert.equal(d.blocks[0].fields[name].bytes,bytes.length);}
 assert.equal(d.audit.unconsumedBytes,0);
 const changed=Buffer.from(raw),target=d.blocks[0].fields.double;changed.writeDoubleLE(7.25,target.offset);const compared=readDocument(changed,{compareTo:raw,captureTypes:[]});assert.equal(compared.decodedDiff.length,1);assert.equal(compared.decodedDiff[0].before,-9.5);assert.equal(compared.decodedDiff[0].after,7.25);
});
