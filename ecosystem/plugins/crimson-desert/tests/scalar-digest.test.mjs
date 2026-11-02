// SPDX-License-Identifier: Apache-2.0
// Public synthetic controls; independent Node crypto is the stream oracle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {createScalarDigest} from '../src/scalar-digest.mjs';

const row=e=>JSON.stringify([e.path,e.type,e.bytes,e.value])+'\n';
const oracle=events=>({sha256:createHash('sha256').update(events.map(row).join(''),'utf8').digest('hex'),count:events.length});
const event=(value,path='$[0].SyntheticSaveData._list[0]._value')=>({path,type:'SyntheticScalar',bytes:8,value});

test('buffered scalar stream matches the legacy tuple bytes for empty and mixed scalar values',()=>{
 for(const events of [[],[event(null)],[event(undefined)],[event('18446744073709551615'),event(-0),event(true),event({encoding:'opaque',bytes:3,hex:'010203'}),event([1.25,-3,0]),event('猫🐈\u0000\"\\\n','$[0].猫._list[0].🐈'),event('\ud800 lone \udfff')]]){
  const digest=createScalarDigest();for(const e of events)assert.equal(digest.update(e),digest);
  assert.deepEqual(digest.digest(),oracle(events));
 }
});

test('scalar stream preserves UTF-8 across buffer boundaries and records larger than the buffer',()=>{
 const events=[];
 for(let i=0;i<300;i++)events.push(event('x'.repeat((i*173)%1200)+'猫🐈é\u0800',`$[0].Boundary._list[${i}]._value`));
 events.push(event('猫🐈é\u0800'.repeat(20000)),event('tail'));
 const digest=createScalarDigest();for(const e of events)digest.update(e);
 assert.deepEqual(digest.digest(),oracle(events));
});

test('a multibyte scalar ending exactly at the buffer boundary preserves its following JSON bytes',()=>{
 const e=event(''),prefix=JSON.stringify([e.path,e.type,e.bytes,'']).slice(0,-2),prefixBytes=Buffer.byteLength(prefix,'utf8');
 for(const tail of ['é','猫','🐈'])for(const multiple of [1,2]){
  const events=[event('x'.repeat(65536*multiple-prefixBytes-Buffer.byteLength(tail,'utf8'))+tail),event('next')],digest=createScalarDigest();
  for(const value of events)digest.update(value);
  assert.deepEqual(digest.digest(),oracle(events));
 }
});

test('independent scalar streams do not share pending bytes or finalization state',()=>{
 const a=[event('a'.repeat(65500)),event('猫')],b=[event('b'),event('🐈'.repeat(17000))],left=createScalarDigest(),right=createScalarDigest();
 left.update(a[0]);right.update(b[0]);left.update(a[1]);
 assert.deepEqual(left.digest(),oracle(a));right.update(b[1]);assert.deepEqual(right.digest(),oracle(b));
 assert.throws(()=>left.update(event(1)),/already finalized/);assert.throws(()=>left.digest(),/already finalized/);
});

test('a tuple serialization error contributes neither partial bytes nor a scalar count',()=>{
 const valid=event('after rejected value'),digest=createScalarDigest();
 assert.throws(()=>digest.update(event(1n)),TypeError);
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>digest.update(event(cyclic)),TypeError);
 digest.update(valid);assert.deepEqual(digest.digest(),oracle([valid]));
});
