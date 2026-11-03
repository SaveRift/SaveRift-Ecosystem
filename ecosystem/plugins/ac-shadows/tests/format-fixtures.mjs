// SPDX-License-Identifier: Apache-2.0
// Invented scalar values assembled with the documented native typed encoding.
// This is not a player save and must never be presented as game acceptance.
import {HASH} from '../src/typed-context.mjs';
import {seededCrc,transformPayload} from '../src/native-container.mjs';
const concat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,b)=>n+b.length,0));let p=0;for(const b of parts){out.set(b,p);p+=b.length;}return out;};
const uint=n=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);return b;};
const uint64=n=>{const b=new Uint8Array(8);new DataView(b.buffer).setBigUint64(0,BigInt(n),true);return b;};
export function field(name,storage,value,arrayStorage=0){return concat(uint(value.length+13),uint(name),uint64((BigInt(storage)<<48n)|(BigInt(arrayStorage)<<55n)),new Uint8Array([11]),value);}
export function object(type,fields){const content=concat(...fields),header=new Uint8Array(22);new DataView(header.buffer).setUint32(14,type,true);new DataView(header.buffer).setUint32(18,content.length+8,true);return concat(header,uint(content.length),content,uint(0));}
const array=items=>concat(new Uint8Array([1]),uint(items.length),...items);
export function syntheticProgression({quantity=12,level=63,character='2134361901830',withoutPlayer=false,duplicateTarget=null}={}){
  const record=(id,lev,q)=>{const itemFields=[field(HASH.settings,18,uint64(id)),field(HASH.instance,7,uint(Number(id)%10000)),field(HASH.level,7,uint(lev)),field(314159,7,uint(0x12345678))],at=['settings','instance','level'].indexOf(duplicateTarget);if(at>=0)itemFields.push(itemFields[at]);const fields=[field(HASH.itemField,22,object(HASH.item,itemFields)),field(HASH.quantity,7,uint(q)),field(987654,7,uint(0xabcdef))];if(duplicateTarget==='item')fields.push(fields[0]);if(duplicateTarget==='quantity')fields.push(fields[1]);return object(HASH.itemData,fields);};
  const inventory=object(HASH.inventory,[field(HASH.data,22,object(HASH.bag,[field(HASH.data,23,array([record('901001',0,quantity),record('901002',level,1)]),22)])),field(1375707530,22,object(HASH.bag,[field(HASH.data,23,array([record('901003',50,1)]),22)]))]);
  const playerFields=[field(1014117087,23,array([inventory]),22),field(HASH.character,18,uint64(character))];if(duplicateTarget==='character')playerFields.push(playerFields[1]);const player=withoutPlayer?inventory:object(HASH.player,playerFields);
  return object(HASH.root,[field(3095320012,23,array([player]),22),field(876543,7,uint(456789))]);
}
export function syntheticNativeSave(options={}){
  const plain=syntheticProgression(options),records=[];
  for(let i=0;i<13;i++){
    const r=new Uint8Array(16+15+5+plain.length),v=new DataView(r.buffer);v.setUint32(0,i+1,true);v.setUint32(8,r.length-12,true);v.setUint32(12,plain.length,true);r.set([0x33,0xaa,0xfb,0x57,0x99,0xfa,4,0x10,3,0,5,0,0,4,0],16);v.setUint32(32,plain.length,true);r.set(plain,36);records.push(r);
  }
  const decoded=concat(new Uint8Array(20),...records,new Uint8Array(4)),view=new DataView(decoded.buffer);view.setUint32(0,0xfedbac,true);view.setUint32(4,54,true);view.setUint32(8,4,true);view.setUint32(12,55,true);view.setUint32(16,seededCrc(decoded,20,decoded.length-4),true);view.setUint32(decoded.length-4,seededCrc(decoded,0,decoded.length-4,0x82f63b78),true);
  const header=new Uint8Array(40),key=Uint8Array.from({length:16},(_,i)=>i+1);new DataView(header.buffer).setUint32(0,36,true);
  return {bytes:concat(header,transformPayload(decoded,key)),key,decoded,plain};
}
