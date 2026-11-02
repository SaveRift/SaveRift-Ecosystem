import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSchema,parseSchemaJson,SchemaError} from '../schema.mjs';

test('pinned operation params validate nested arbitrary domains, required fields, additional keys and numeric bounds',()=>{
  const schema={type:'object',required:['vehicle','pilots'],additionalProperties:false,properties:{vehicle:{type:'object',required:['fuel','faction'],additionalProperties:false,properties:{fuel:{type:'integer',minimum:0,maximum:500},faction:{enum:['river','mountain']}}},pilots:{type:'array',minItems:1,maxItems:3,uniqueItems:true,items:{type:'string',minLength:1,maxLength:20}}}},validator=compileSchema(schema);
  assert.equal(validator.validate({vehicle:{fuel:100,faction:'river'},pilots:['hero']}),true);
  for(const input of [{vehicle:{fuel:'100',faction:'river'},pilots:['hero']},{vehicle:{fuel:501,faction:'river'},pilots:['hero']},{vehicle:{fuel:10,faction:'river',paidOverride:true},pilots:['hero']},{vehicle:{fuel:10,faction:'other'},pilots:['hero']},{vehicle:{fuel:10,faction:'river'},pilots:[]},{vehicle:{fuel:10,faction:'river'},pilots:['same','same']},{vehicle:{fuel:10,faction:'river'},pilots:['hero'],publish:true}])assert.equal(validator.validate(input),false);
  assert.throws(()=>validator.assert({}),e=>e.code==='SCHEMA_VALUE_INVALID');
});
test('no constraints are ignored: unknown keywords, unresolved or remote refs and unsupported dialects/formats fail at compile',()=>{
  for(const schema of [{type:'integer',minumum:1},{type:'string',format:'date-time'},{$ref:'https://evil.example/schema'},{$ref:'other.json#/$defs/x'},{$ref:'#/$defs/missing'},{$schema:'https://evil.example/schema'},{$id:'nested-resource'},{type:'array',items:[]},{multipleOf:0.1},{patternProperties:{'.*':{type:'string'}}}])assert.throws(()=>compileSchema(schema),SchemaError);
  assert.throws(()=>compileSchema({$defs:{ignored:{unsupported:true}},type:'string'}),e=>e.code==='SCHEMA_KEYWORD_UNSUPPORTED');
});
test('local JSON pointer refs, booleans and combination branches have exact validation behavior',()=>{
  const validator=compileSchema({$defs:{'a/b':{type:'integer',minimum:1,maximum:9}},type:'object',required:['points'],properties:{points:{$ref:'#/$defs/a~1b'},tag:{oneOf:[{const:'starter'},{type:'integer',minimum:3}]}},additionalProperties:false});
  assert.equal(validator.validate({points:3,tag:'starter'}),true);assert.equal(validator.validate({points:3,tag:4}),true);assert.equal(validator.validate({points:10}),false);assert.equal(validator.validate({points:3,tag:'other'}),false);
  assert.equal(compileSchema({allOf:[{type:'integer',minimum:2},{maximum:8}],not:{const:5}}).validate(5),false);
  assert.equal(compileSchema({anyOf:[{const:'a'},{type:'integer',minimum:3}]}).validate(4),true);
  assert.equal(compileSchema({oneOf:[{type:'number'},{type:'integer'}]}).validate(4),false);
  assert.equal(compileSchema(false).validate({anything:true}),false);assert.equal(compileSchema(true).validate({anything:true}),true);
  assert.throws(()=>compileSchema({$defs:{loop:{$ref:'#/$defs/loop'}},$ref:'#/$defs/loop'}),e=>e.code==='SCHEMA_REF_CYCLE');
});
test('array tuple prefix, schema additional properties and dependent required preserve structure',()=>{
  const tuple=compileSchema({type:'array',prefixItems:[{const:'position'},{type:'number'}],items:false,minItems:2});assert.equal(tuple.validate(['position',1.5]),true);assert.equal(tuple.validate(['position',1,2]),false);
  const dictionary=compileSchema({type:'object',properties:{kind:{const:'camp'}},dependentRequired:{kind:['owner']},additionalProperties:{type:'string'},minProperties:1,maxProperties:3});assert.equal(dictionary.validate({kind:'camp',owner:'hero',custom:'yes'}),true);assert.equal(dictionary.validate({kind:'camp'}),false);assert.equal(dictionary.validate({custom:1}),false);
});
test('canonical decimal strings preserve high IDs; integer fields reject unsafe or non-JSON values',()=>{
  const unsigned=compileSchema({type:'string',format:'uint64'});assert.equal(unsigned.validate('18446744073709551615'),true);assert.equal(unsigned.validate('18446744073709551616'),false);assert.equal(unsigned.validate('01'),false);
  const signed=compileSchema({type:'string',format:'int64'});assert.equal(signed.validate('-9223372036854775808'),true);assert.equal(signed.validate('-9223372036854775809'),false);assert.equal(signed.validate('-0'),false);
  for(const input of [NaN,Infinity,9007199254740992,undefined,{value:undefined},JSON.parse('{"__proto__":{"admin":true}}')])assert.throws(()=>compileSchema(true).validate(input),SchemaError);
  assert.equal(compileSchema({type:'string',format:'sha256'}).validate('ab'.repeat(32)),true);assert.equal(compileSchema({type:'string',format:'sha256'}).validate('AB'.repeat(32)),false);
});
test('anchored patterns are interpreted without host RegExp, including existing Crimson decimal and fixed-width byte patterns',()=>{
  const saved=globalThis.RegExp;globalThis.RegExp=()=>{throw Error('Host RegExp must never be constructed.');};
  try{const decimal=compileSchema({type:'string',pattern:'^(0|[1-9][0-9]{0,19})$'});assert.equal(decimal.validate('0'),true);assert.equal(decimal.validate('18446744073709551615'),true);for(const text of ['01','-1','1x','1'.repeat(21),''])assert.equal(decimal.validate(text),false);
    const hex=compileSchema({type:'string',pattern:'^(?:[a-f0-9]{2}){1,4096}$'});assert.equal(hex.validate('ab'.repeat(4096)),true);assert.equal(hex.validate('abc'),false);assert.equal(hex.validate('AZ'),false);
    assert.equal(compileSchema({pattern:'^[A-Za-z0-9_.:-]{1,100}$'}).validate('camp:mountain-v1'),true);
  }finally{globalThis.RegExp=saved;}
});
test('dangerous regex constructs and ReDoS patterns fail closed instead of reaching native regex',()=>{
  for(const pattern of ['(a+)+','^(a+)+$','^a*$','^a{1,}$','^(?=a)a$','^(a)\\1$','^.$','^[^x]{1,5}$','^a{8193}$','^a{02}$','^\\d{1,5}$','^a{1,5}?$'])assert.throws(()=>compileSchema({pattern}),e=>e.code==='SCHEMA_PATTERN_UNSUPPORTED'||e.code==='SCHEMA_PATTERN_LIMIT');
});
test('schema/input depth, bytes, nodes, branch counts and evaluation work are separately bounded',()=>{
  let schema={type:'string'};for(let i=0;i<40;i++)schema={properties:{next:schema}};assert.throws(()=>compileSchema(schema),e=>e.code==='SCHEMA_LIMIT');
  assert.throws(()=>compileSchema({allOf:Array.from({length:17},()=>true)}),e=>e.code==='SCHEMA_INVALID');
  const schemaLimit=compileSchema(true,{limits:{inputBytes:20}});assert.throws(()=>schemaLimit.validate('x'.repeat(21)),e=>e.code==='SCHEMA_INPUT_LIMIT');
  assert.throws(()=>compileSchema(true).validate('x'.repeat(16385)),e=>e.code==='SCHEMA_INPUT_LIMIT');
  assert.throws(()=>compileSchema({type:'array',items:{type:'string'}},{limits:{steps:4}}).validate(['a','b','c']),e=>e.code==='SCHEMA_WORK_LIMIT');
  assert.throws(()=>compileSchema({pattern:'^(?:a{0,8192}){0,8192}$'},{limits:{steps:1000}}).validate('a'.repeat(100)),e=>e.code==='SCHEMA_WORK_LIMIT');
});
test('compilation pins a private schema copy and does not execute accessor properties',()=>{
  const input={type:'integer',minimum:1},validator=compileSchema(input);input.minimum=-100;assert.equal(validator.validate(0),false);assert.equal(validator.schemaDigest.length,64);
  const malicious={};Object.defineProperty(malicious,'type',{enumerable:true,get(){throw Error('This getter must not run.');}});assert.throws(()=>compileSchema(malicious),e=>e.code==='SCHEMA_INVALID');
});
test('pinned schema JSON rejects duplicate escaped keys, malformed UTF8, oversized or deeply nested text',()=>{
  assert.deepEqual(parseSchemaJson(new TextEncoder().encode('{"type":"object","properties":{"camp":{"type":"string"}}}')),{type:'object',properties:{camp:{type:'string'}}});
  for(const text of ['{"type":"integer","type":"string"}','{"type":"integer","\\u0074ype":"string"}','{"properties":{"camp":{"type":"string","type":"integer"}}}'])assert.throws(()=>parseSchemaJson(text),e=>e.code==='SCHEMA_DUPLICATE_KEY');
  for(const text of ['', '{"type":}', '[,]', '{"type":"string",}', 'true false', '{"title":"\\q"}'])assert.throws(()=>parseSchemaJson(text),e=>e.code==='SCHEMA_JSON_INVALID');
  assert.throws(()=>parseSchemaJson(new Uint8Array([0x22,0xc0,0x80,0x22])),e=>e.code==='SCHEMA_JSON_INVALID');
  assert.throws(()=>parseSchemaJson('['.repeat(40)+'true'+']'.repeat(40)),e=>e.code==='SCHEMA_LIMIT');
});
