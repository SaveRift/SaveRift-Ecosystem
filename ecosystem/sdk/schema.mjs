// SPDX-License-Identifier: Apache-2.0
// Deliberately closed, bounded JSON Schema subset. This is an interpreter:
// schemas and patterns never become host JavaScript or native RegExp objects.
import {canonicalJson,sha256} from './crypto.mjs';
import {Buffer} from './buffer.mjs';
import {TextDecoder} from './text-encoding.mjs';

export const SCHEMA_LIMITS=Object.freeze({schemaBytes:128*1024,schemaNodes:4096,schemaDepth:32,inputBytes:128*1024,inputNodes:10000,inputDepth:32,stringChars:16384,steps:200000,patternChars:256,patternNodes:128,patternDepth:16,patternRepeat:8192,patternStates:32768,branches:16});
export class SchemaError extends Error{constructor(code){super(code);this.name='SchemaError';this.code=code;}}
const fail=code=>{throw new SchemaError(code);};
const own=(value,key)=>Object.hasOwn(value,key);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const types=new Set(['null','boolean','object','array','number','integer','string']);
const keywords=new Set(['$schema','$comment','$defs','definitions','$ref','title','description','default','examples','deprecated','readOnly','writeOnly','type','const','enum','minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minLength','maxLength','pattern','format','minItems','maxItems','uniqueItems','items','prefixItems','minProperties','maxProperties','required','properties','additionalProperties','dependentRequired','allOf','anyOf','oneOf','not']);
function limitsFrom(input={}){const limits={...SCHEMA_LIMITS};for(const [key,value]of Object.entries(input)){if(!own(limits,key)||!Number.isSafeInteger(value)||value<1||value>limits[key])fail('SCHEMA_LIMITS_INVALID');limits[key]=value;}return limits;}
export function parseSchemaJson(input){
  let text;try{if(typeof input==='string')text=input;else if(input instanceof Uint8Array){if(input.byteLength>SCHEMA_LIMITS.schemaBytes)fail('SCHEMA_LIMIT');text=new TextDecoder('utf-8',{fatal:true}).decode(input);}else fail('SCHEMA_JSON_INVALID');}catch(error){if(error instanceof SchemaError)throw error;fail('SCHEMA_JSON_INVALID');}
  if(text.length>SCHEMA_LIMITS.schemaBytes||Buffer.byteLength(text)>SCHEMA_LIMITS.schemaBytes)fail('SCHEMA_LIMIT');let cursor=0,nodes=0;
  const skip=()=>{while([' ','\n','\r','\t'].includes(text[cursor]))cursor++;};
  function string(){if(text[cursor]!=='"')fail('SCHEMA_JSON_INVALID');const start=cursor++;while(cursor<text.length){const c=text[cursor++];if(c==='\\'){cursor++;continue;}if(c==='"'){try{return JSON.parse(text.slice(start,cursor));}catch{fail('SCHEMA_JSON_INVALID');}}}fail('SCHEMA_JSON_INVALID');}
  function value(depth){if(depth>SCHEMA_LIMITS.schemaDepth||++nodes>SCHEMA_LIMITS.schemaNodes)fail('SCHEMA_LIMIT');skip();const c=text[cursor];
    if(c==='"'){string();return;}if(c==='{'){cursor++;skip();const keys=new Set();if(text[cursor]==='}'){cursor++;return;}for(;;){skip();const key=string();if(keys.has(key))fail('SCHEMA_DUPLICATE_KEY');keys.add(key);skip();if(text[cursor++]!==':')fail('SCHEMA_JSON_INVALID');value(depth+1);skip();const separator=text[cursor++];if(separator==='}')return;if(separator!==',')fail('SCHEMA_JSON_INVALID');}}
    if(c==='['){cursor++;skip();if(text[cursor]===']'){cursor++;return;}for(;;){value(depth+1);skip();const separator=text[cursor++];if(separator===']')return;if(separator!==',')fail('SCHEMA_JSON_INVALID');}}
    const start=cursor;while(cursor<text.length&&![' ', '\n','\r','\t',',',']','}'].includes(text[cursor]))cursor++;if(cursor===start)fail('SCHEMA_JSON_INVALID');
  }
  value(0);skip();if(cursor!==text.length)fail('SCHEMA_JSON_INVALID');try{return JSON.parse(text);}catch{fail('SCHEMA_JSON_INVALID');}
}
function boundedJson(input,{bytes,nodes,depth,strings},code){
  const ancestors=new Set();let count=0;
  function walk(value,level){if(++count>nodes||level>depth)fail(code+'_LIMIT');
    if(value===null||typeof value==='boolean')return;
    if(typeof value==='string'){if(value.length>bytes||strings&&Array.from(value).length>strings)fail(code+'_LIMIT');return;}
    if(typeof value==='number'){if(!Number.isFinite(value)||(Number.isInteger(value)&&!Number.isSafeInteger(value)))fail(code+'_INVALID');return;}
    if(!Array.isArray(value)&&!plain(value))fail(code+'_INVALID');if(ancestors.has(value))fail(code+'_INVALID');ancestors.add(value);
    try{const keys=Object.keys(value);if(keys.length>nodes)fail(code+'_LIMIT');if(Array.isArray(value)&&keys.length!==value.length)fail(code+'_INVALID');for(const key of keys){if(['__proto__','constructor','prototype'].includes(key))fail(code+'_INVALID');const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!own(descriptor,'value'))fail(code+'_INVALID');walk(descriptor.value,level+1);}}finally{ancestors.delete(value);}
  }
  walk(input,0);let text;try{text=canonicalJson(input);}catch{fail(code+'_INVALID');}if(Buffer.byteLength(text)>bytes)fail(code+'_LIMIT');return {copy:JSON.parse(text),text};
}
const unsigned=(text,min=0,max=Number.MAX_SAFE_INTEGER)=>{if(!text||text.length>16||text.length>1&&text[0]==='0')return null;let value=0;for(const c of text){if(c<'0'||c>'9')return null;value=value*10+c.charCodeAt(0)-48;if(value>max)return null;}return value>=min?value:null;};

function compilePattern(pattern,limits){
  if(typeof pattern!=='string'||pattern.length>limits.patternChars||pattern[0]!=='^'||pattern[pattern.length-1]!=='$')fail('SCHEMA_PATTERN_UNSUPPORTED');
  const source=Array.from(pattern.slice(1,-1));let cursor=0,nodeCount=0;
  const node=value=>{if(++nodeCount>limits.patternNodes)fail('SCHEMA_PATTERN_LIMIT');return {...value,id:nodeCount};};
  function character(inside=false){const c=source[cursor++];if(c===undefined)fail('SCHEMA_PATTERN_UNSUPPORTED');if(c!=='\\')return c;
    const escaped=source[cursor++];if(escaped===undefined||!'^$|?{}()[]-\\.'.includes(escaped))fail('SCHEMA_PATTERN_UNSUPPORTED');return escaped;
  }
  function atom(depth){if(depth>limits.patternDepth)fail('SCHEMA_PATTERN_LIMIT');const c=source[cursor];
    if(c==='('){cursor++;if(source[cursor]==='?'){if(source[cursor+1]!==':')fail('SCHEMA_PATTERN_UNSUPPORTED');cursor+=2;}const value=choice(depth+1);if(source[cursor++]!==')')fail('SCHEMA_PATTERN_UNSUPPORTED');return value;}
    if(c==='['){cursor++;const ranges=[];if(source[cursor]==='^')fail('SCHEMA_PATTERN_UNSUPPORTED');while(cursor<source.length&&source[cursor]!==']'){
      const first=character(true);if(first.codePointAt(0)>127)fail('SCHEMA_PATTERN_UNSUPPORTED');let last=first;
      if(source[cursor]==='-'&&source[cursor+1]!==']'){cursor++;last=character(true);if(last.codePointAt(0)>127||last<first)fail('SCHEMA_PATTERN_UNSUPPORTED');}
      ranges.push([first.codePointAt(0),last.codePointAt(0)]);if(ranges.length>64)fail('SCHEMA_PATTERN_LIMIT');}
      if(source[cursor++]!==']'||!ranges.length)fail('SCHEMA_PATTERN_UNSUPPORTED');return node({kind:'char',ranges});}
    if(c===undefined||'^$|?{}[])*+.'.includes(c))fail('SCHEMA_PATTERN_UNSUPPORTED');const literal=character();return node({kind:'char',ranges:[[literal.codePointAt(0),literal.codePointAt(0)]]});
  }
  function term(depth){let value=atom(depth);if(source[cursor]==='?'){cursor++;value=node({kind:'repeat',child:value,min:0,max:1});}
    else if(source[cursor]==='{'){cursor++;let first='';while(cursor<source.length&&source[cursor]>='0'&&source[cursor]<='9')first+=source[cursor++];let last=first;
      if(source[cursor]===','){cursor++;last='';while(cursor<source.length&&source[cursor]>='0'&&source[cursor]<='9')last+=source[cursor++];}
      const min=unsigned(first,0,limits.patternRepeat),max=unsigned(last,0,limits.patternRepeat);if(source[cursor++]!=='}'||min===null||max===null||min>max)fail('SCHEMA_PATTERN_UNSUPPORTED');value=node({kind:'repeat',child:value,min,max});}
    if(['*','+','?','{'].includes(source[cursor]))fail('SCHEMA_PATTERN_UNSUPPORTED');return value;
  }
  function sequence(depth){const children=[];while(cursor<source.length&&source[cursor]!==')'&&source[cursor]!=='|')children.push(term(depth));return node({kind:'sequence',children});}
  function choice(depth){const children=[sequence(depth)];while(source[cursor]==='|'){cursor++;children.push(sequence(depth));if(children.length>limits.branches)fail('SCHEMA_PATTERN_LIMIT');}return children.length===1?children[0]:node({kind:'choice',children});}
  const root=choice(0);if(cursor!==source.length)fail('SCHEMA_PATTERN_UNSUPPORTED');
  return (text,state)=>{
    const chars=Array.from(text),memo=new Map();
    function add(set,value){state.tick();set.add(value);}
    function ends(n,position){state.tick();const key=n.id+':'+position;if(memo.has(key))return memo.get(key);if(memo.size>=limits.patternStates)fail('SCHEMA_WORK_LIMIT');const out=new Set();memo.set(key,out);
      if(n.kind==='char'){const point=chars[position]?.codePointAt(0);if(point!==undefined&&n.ranges.some(([a,b])=>point>=a&&point<=b))add(out,position+1);}
      else if(n.kind==='choice'){for(const child of n.children)for(const end of ends(child,position))add(out,end);}
      else if(n.kind==='sequence'){let positions=new Set([position]);for(const child of n.children){const next=new Set();for(const start of positions)for(const end of ends(child,start))add(next,end);positions=next;if(!positions.size)break;}for(const end of positions)add(out,end);}
      else{let positions=new Set([position]);if(n.min===0)add(out,position);for(let count=1;count<=n.max&&positions.size;count++){state.tick();const next=new Set();for(const start of positions)for(const end of ends(n.child,start))add(next,end);positions=next;if(count>=n.min)for(const end of positions)add(out,end);}}
      return out;
    }
    return ends(root,0).has(chars.length);
  };
}
function formatValidator(format){
  const hex=char=>char>='0'&&char<='9'||char>='a'&&char<='f';
  const decimal=(value,signed=false)=>{let text=value;if(signed&&text[0]==='-'){text=text.slice(1);if(text==='0')return false;}if(!text||text.length>128||text.length>1&&text[0]==='0')return false;for(const c of text)if(c<'0'||c>'9')return false;return true;};
  if(format==='sha256')return value=>value.length===64&&[...value].every(hex);
  if(format==='hex')return value=>value.length>0&&value.length%2===0&&[...value].every(hex);
  if(format==='decimal-integer')return value=>decimal(value,true);
  if(format==='uint64')return value=>decimal(value)&&value.length<=20&&BigInt(value)<=18446744073709551615n;
  if(format==='int64')return value=>decimal(value,true)&&value.length<=20&&BigInt(value)>=-9223372036854775808n&&BigInt(value)<=9223372036854775807n;
  if(format==='uuid')return value=>value.length===36&&[...value.toLowerCase()].every((c,i)=>[8,13,18,23].includes(i)?c==='-':hex(c));
  fail('SCHEMA_FORMAT_UNSUPPORTED');
}

export function compileSchema(schema,{limits:requestedLimits}={}){
  const limits=limitsFrom(requestedLimits),{copy:root,text}=boundedJson(schema,{bytes:limits.schemaBytes,nodes:limits.schemaNodes,depth:limits.schemaDepth},'SCHEMA'),compiled=new Map(),active=new Set();
  const bound=(value,defaultValue)=>{if(value===undefined)return defaultValue;if(!Number.isSafeInteger(value)||value<0)fail('SCHEMA_INVALID');return value;};
  const finite=value=>{if(typeof value!=='number'||!Number.isFinite(value)||Number.isInteger(value)&&!Number.isSafeInteger(value))fail('SCHEMA_INVALID');return value;};
  function pointer(ref){if(typeof ref!=='string'||ref.length>512||!(ref==='#'||ref.startsWith('#/')))fail('SCHEMA_REF_UNSUPPORTED');let node=root;if(ref==='#')return node;
    for(const encoded of ref.slice(2).split('/')){let key='';for(let i=0;i<encoded.length;i++){if(encoded[i]!=='~')key+=encoded[i];else{const next=encoded[++i];if(next!=='0'&&next!=='1')fail('SCHEMA_REF_UNSUPPORTED');key+=next==='0'?'~':'/';}}if(!node||typeof node!=='object'||!own(node,key))fail('SCHEMA_REF_UNRESOLVED');node=node[key];}return node;}
  function compile(node,depth=0){if(depth>limits.schemaDepth)fail('SCHEMA_LIMIT');if(typeof node==='boolean')return (_value,state)=>{state.tick();return node;};if(!plain(node))fail('SCHEMA_INVALID');if(active.has(node))fail('SCHEMA_REF_CYCLE');if(compiled.has(node))return compiled.get(node);active.add(node);
    for(const key of Object.keys(node))if(!keywords.has(key))fail('SCHEMA_KEYWORD_UNSUPPORTED');
    if(own(node,'$schema')&&!['https://json-schema.org/draft/2020-12/schema','http://json-schema.org/draft/2020-12/schema'].includes(node.$schema))fail('SCHEMA_DIALECT_UNSUPPORTED');
    for(const key of ['$comment','title','description'])if(own(node,key)&&typeof node[key]!=='string')fail('SCHEMA_INVALID');
    for(const key of ['deprecated','readOnly','writeOnly'])if(own(node,key)&&typeof node[key]!=='boolean')fail('SCHEMA_INVALID');if(own(node,'examples')&&!Array.isArray(node.examples))fail('SCHEMA_INVALID');
    for(const key of ['$defs','definitions'])if(own(node,key)){if(!plain(node[key]))fail('SCHEMA_INVALID');for(const child of Object.values(node[key]))compile(child,depth+1);}
    const typeList=own(node,'type')?(Array.isArray(node.type)?node.type:[node.type]):null;if(typeList&&(!typeList.length||typeList.length>7||new Set(typeList).size!==typeList.length||typeList.some(type=>!types.has(type))))fail('SCHEMA_INVALID');
    const reference=own(node,'$ref')?compile(pointer(node.$ref),depth+1):null;
    let enumeration=null;if(own(node,'enum')){if(!Array.isArray(node.enum)||!node.enum.length||node.enum.length>128)fail('SCHEMA_INVALID');enumeration=new Set(node.enum.map(canonicalJson));if(enumeration.size!==node.enum.length)fail('SCHEMA_INVALID');}
    const constant=own(node,'const')?canonicalJson(node.const):null,pattern=own(node,'pattern')?compilePattern(node.pattern,limits):null,format=own(node,'format')?formatValidator(node.format):null;
    for(const key of ['minimum','maximum','exclusiveMinimum','exclusiveMaximum'])if(own(node,key))finite(node[key]);if(own(node,'multipleOf')&&(!Number.isSafeInteger(node.multipleOf)||node.multipleOf<=0))fail('SCHEMA_MULTIPLE_UNSUPPORTED');
    const minLength=bound(node.minLength,0),maxLength=bound(node.maxLength,Infinity),minItems=bound(node.minItems,0),maxItems=bound(node.maxItems,Infinity),minProperties=bound(node.minProperties,0),maxProperties=bound(node.maxProperties,Infinity);if(minLength>maxLength||minItems>maxItems||minProperties>maxProperties)fail('SCHEMA_INVALID');
    const properties=new Map();if(own(node,'properties')){if(!plain(node.properties)||Object.keys(node.properties).length>128)fail('SCHEMA_INVALID');for(const [key,child]of Object.entries(node.properties))properties.set(key,compile(child,depth+1));}
    const additional=own(node,'additionalProperties')?compile(node.additionalProperties,depth+1):null;
    function names(value){if(!Array.isArray(value)||value.length>128||new Set(value).size!==value.length||value.some(x=>typeof x!=='string'||!x||x.length>128))fail('SCHEMA_INVALID');return value;}
    const required=own(node,'required')?names(node.required):[],dependencies=new Map();if(own(node,'dependentRequired')){if(!plain(node.dependentRequired))fail('SCHEMA_INVALID');for(const [key,value]of Object.entries(node.dependentRequired))dependencies.set(key,names(value));}
    const items=own(node,'items')?compile(node.items,depth+1):null,prefix=[];if(own(node,'prefixItems')){if(!Array.isArray(node.prefixItems)||node.prefixItems.length>128)fail('SCHEMA_INVALID');for(const child of node.prefixItems)prefix.push(compile(child,depth+1));}if(own(node,'uniqueItems')&&typeof node.uniqueItems!=='boolean')fail('SCHEMA_INVALID');
    const branches={};for(const key of ['allOf','anyOf','oneOf'])if(own(node,key)){if(!Array.isArray(node[key])||!node[key].length||node[key].length>limits.branches)fail('SCHEMA_INVALID');branches[key]=node[key].map(child=>compile(child,depth+1));}const not=own(node,'not')?compile(node.not,depth+1):null;
    const result=(value,state)=>{state.tick();if(reference&&!reference(value,state))return false;if(typeList&&!typeList.some(type=>type==='null'?value===null:type==='array'?Array.isArray(value):type==='object'?plain(value):type==='integer'?typeof value==='number'&&Number.isSafeInteger(value):typeof value===type))return false;
      if((constant!==null||enumeration)&&!state.matches(value,constant,enumeration))return false;
      if(typeof value==='number'){if(own(node,'minimum')&&value<node.minimum||own(node,'maximum')&&value>node.maximum||own(node,'exclusiveMinimum')&&value<=node.exclusiveMinimum||own(node,'exclusiveMaximum')&&value>=node.exclusiveMaximum||own(node,'multipleOf')&&value%node.multipleOf!==0)return false;}
      if(typeof value==='string'){const length=Array.from(value).length;state.tick(length);if(length<minLength||length>maxLength||pattern&&!pattern(value,state)||format&&!format(value))return false;}
      if(Array.isArray(value)){if(value.length<minItems||value.length>maxItems)return false;const unique=node.uniqueItems?new Set():null;for(let i=0;i<value.length;i++){state.tick();if(unique){const key=state.fingerprint(value[i]);if(unique.has(key))return false;unique.add(key);}const child=i<prefix.length?prefix[i]:items;if(child&&!child(value[i],state))return false;}}
      else if(plain(value)){const keys=Object.keys(value);if(keys.length<minProperties||keys.length>maxProperties||required.some(key=>!own(value,key)))return false;for(const [key,names]of dependencies)if(own(value,key)&&names.some(name=>!own(value,name)))return false;for(const key of keys){state.tick();const child=properties.get(key)||additional;if(child&&!child(value[key],state))return false;}}
      if(branches.allOf&&!branches.allOf.every(child=>child(value,state)))return false;if(branches.anyOf&&!branches.anyOf.some(child=>child(value,state)))return false;if(branches.oneOf){let matched=0;for(const child of branches.oneOf)if(child(value,state)&&++matched>1)return false;if(matched!==1)return false;}if(not&&not(value,state))return false;return true;
    };
    active.delete(node);compiled.set(node,result);return result;
  }
  const check=compile(root),schemaDigest=sha256(text);
  function validate(value){const {copy}=boundedJson(value,{bytes:limits.inputBytes,nodes:limits.inputNodes,depth:limits.inputDepth,strings:limits.stringChars},'SCHEMA_INPUT');let steps=0;const objects=new WeakMap(),state={tick(cost=1){steps+=cost;if(steps>limits.steps)fail('SCHEMA_WORK_LIMIT');},fingerprint(value){if(value&&typeof value==='object'&&objects.has(value))return objects.get(value);const text=canonicalJson(value);state.tick(text.length);if(value&&typeof value==='object')objects.set(value,text);return text;},matches(value,constant,enumeration){const key=state.fingerprint(value);return (constant===null||key===constant)&&(!enumeration||enumeration.has(key));}};return check(copy,state);}
  return Object.freeze({schemaDigest,validate,assert(value){if(!validate(value))fail('SCHEMA_VALUE_INVALID');return value;}});
}
