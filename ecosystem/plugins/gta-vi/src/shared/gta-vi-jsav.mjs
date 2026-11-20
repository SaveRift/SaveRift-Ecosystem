// SPDX-License-Identifier: Apache-2.0
import {TextDecoder} from '../../../../sdk/text-encoding.mjs';
import {FIELD_NAMES} from './field-names.mjs';
const utf8=new TextDecoder('utf-8',{fatal:true});
const u32=(view,at)=>view.getUint32(at,true);
const viewOf=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
const textOf=(bytes,start,end)=>utf8.decode(bytes.subarray(start,end));
const fail=message=>{throw new Error(`This GTA VI save could not be inspected: ${message}`);};

const NUMBER_TOKEN=/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
function parseLosslessJson(text){
  const replacements=[];
  let previous=0,hasUnsafeIntegers=false;
  for(let i=0;i<text.length;i++){
    if(text[i]==='"'){
      for(i++;i<text.length;i++){
        if(text[i]==='\\'){i++;continue;}
        if(text[i]==='"')break;
      }
      continue;
    }
    if(text[i]!=='-'&&(text[i]<'0'||text[i]>'9'))continue;
    NUMBER_TOKEN.lastIndex=i;
    const match=NUMBER_TOKEN.exec(text);
    if(!match)continue;
    const token=match[0],end=NUMBER_TOKEN.lastIndex;
    const digits=token.replace(/^-/, '');
    const largeInteger=/^\d+$/.test(digits)
      ? digits.length>16||(digits.length===16&&digits>'9007199254740991')
      : Math.abs(Number(token))>Number.MAX_SAFE_INTEGER;
    if(largeInteger){
      replacements.push(text.slice(previous,i),JSON.stringify(token));
      previous=end;
      hasUnsafeIntegers=true;
    }
    i=end-1;
  }
  if(replacements.length)replacements.push(text.slice(previous));
  return {value:JSON.parse(replacements.length?replacements.join(''):text),hasUnsafeIntegers};
}

export function inspectGtaViJsav(memory,chives=new Uint8Array()){
  if(memory.length<48||textOf(memory,0,4)!=='JSAV')fail('memory.dat is not JSAV');
  const view=viewOf(memory),version=u32(view,4),codeCount=u32(view,8),scriptCount=u32(view,12),count=codeCount+scriptCount;
  if(version!==3||count<1||count>4096||16+count*20+8>=memory.length)fail('JSAV directory is unsupported');
  const start=16+count*20+8;
  if(memory.subarray(16+count*20,start).some(byte=>byte!==0))fail('JSAV directory padding changed');
  let end=memory.length;while(end>start&&memory[end-1]===0)end--;
  if(memory[start]!==123||memory[end-1]!==125)fail('JSAV JSON envelope is missing');
  let root,hasUnsafeIntegers;
  try{({value:root,hasUnsafeIntegers}=parseLosslessJson(textOf(memory,start,end)));}catch{fail('JSAV JSON is invalid');}
  if(root?.CodeSaveBlocks?.length!==codeCount||root?.ScriptSaveBlocks?.length!==scriptCount)fail('JSAV block counts do not match');
  const blocks=[];
  for(let i=0;i<count;i++){
    const p=16+i*20,hash=`$0x${u32(view,p).toString(16).padStart(8,'0')}`;
    const offset=u32(view,p+12),length=u32(view,p+16);
    if(u32(view,p+4)!==1||u32(view,p+8)!==0||!length||offset<start||offset+length>end||i&&offset<blocks[i-1].offset+blocks[i-1].length)fail('JSAV block index is invalid');
    const text=textOf(memory,offset,offset+length);
    let value,blockHasUnsafeIntegers;
    try{({value,hasUnsafeIntegers:blockHasUnsafeIntegers}=parseLosslessJson(text));}catch{fail('JSAV block JSON is invalid');}
    if(!text.includes(hash)||!value||typeof value!=='object')fail('JSAV block hash does not match');
    blocks.push({index:i,group:i<codeCount?'Code':'Script',hash,offset,length,text,value,hasUnsafeIntegers:blockHasUnsafeIntegers});
  }
  const found=new Map();
  function walk(value,path,block,depth){
    if(!value||typeof value!=='object'||depth>40)return;
    for(const [key,child] of Object.entries(value)){
      const here=`${path}/${key}`;
      if(FIELD_NAMES[key]){
        const row=found.get(key)||{hash:key,...FIELD_NAMES[key],values:[]};
        if(row.values.length<24)row.values.push({block:block.index,group:block.group,path:here,value:child});
        found.set(key,row);
      }
      if(child&&typeof child==='object')walk(child,here,block,depth+1);
    }
  }
  for(const block of blocks)walk(block.value,'',block,0);
  let completionPercent=null,saveTimestamp=null;
  if(chives.length>=34+0x170&&textOf(chives,0,7)==='SLAYER1'&&textOf(chives,34,38)==='ASAV'){
    const chivesView=viewOf(chives),progress=chivesView.getFloat32(34+0x158,true);
    if(Number.isFinite(progress)&&progress>=0&&progress<=100)completionPercent=progress;
    const seconds=u32(chivesView,34+0x20);
    if(seconds>946684800&&seconds<4102444800)saveTimestamp=new Date(seconds*1000).toISOString();
  }
  return {version,codeCount,scriptCount,blocks,fields:[...found.values()],completionPercent,saveTimestamp,hasUnsafeIntegers};
}

export const inspectGtaViPs5Jsav=inspectGtaViJsav;
