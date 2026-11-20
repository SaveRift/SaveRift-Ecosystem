// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectGtaViJsav} from '../src/shared/gta-vi-jsav.mjs';
import {makeSyntheticJsav} from './synthetic-jsav.mjs';

test('shared JSAV reader identifies observed fields from a synthetic save',()=>{
  const inspected=inspectGtaViJsav(makeSyntheticJsav());
  assert.equal(inspected.codeCount,1);
  assert.equal(inspected.scriptCount,1);
  assert.equal(inspected.fields.find(field=>field.name==='fHealth').values[0].value,130);
});

test('shared JSAV reader preserves large integer tokens exactly',()=>{
  const inspected=inspectGtaViJsav(makeSyntheticJsav({healthToken:'9007199254740993'}));
  assert.equal(inspected.hasUnsafeIntegers,true);
  assert.equal(inspected.blocks[0].hasUnsafeIntegers,true);
  assert.equal(inspected.fields.find(field=>field.name==='fHealth').values[0].value,'9007199254740993');
  assert.match(inspected.blocks[0].text,/9007199254740993/);
});
