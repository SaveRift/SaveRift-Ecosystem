// SPDX-License-Identifier: Apache-2.0
// Field identities and wire widths recovered in the authorized September 2026
// AC Shadows investigation. No fixture bytes, private keys, or account IDs.
export const HASH = Object.freeze({root:1868920887,player:583660524,inventory:197282326,bag:680103110,itemData:2466120828,item:2024968992,character:1650900319,data:230775901,itemField:3207170592,settings:2065161794,instance:2302317199,level:1529602839,quantity:1720022112});
export const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const scalarWidths={0:1,1:1,2:1,3:1,4:2,5:2,6:4,7:4,8:8,9:8,10:4,11:8,12:12,13:16,14:16,15:36,16:64,17:8,18:8,30:8};

/** Fully walk the progression context while retaining only editable projections.
 * Opaque fields in this context are rejected, never skipped as known values.
 * Ancestor ownership matters: cached, gained and loadout copies are read-only.
 */
export function parseProgression(bytes,{contextId='progression'}={}) {
  if(!(bytes instanceof Uint8Array)||bytes.length<30||bytes.length>8*1024*1024)fail('AC_CONTEXT_SIZE');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),records=[];
  let objectCount=0,fieldCount=0;
  const bounds=(p,n,end=bytes.length)=>{if(!Number.isSafeInteger(p)||n<0||p<0||p+n>end)fail('AC_TRUNCATED_FIELD');};
  const u32=p=>{bounds(p,4);return view.getUint32(p,true);};
  const u64=p=>{bounds(p,8);return (BigInt(u32(p+4))*4294967296n+BigInt(u32(p))).toString();};
  function object(p,limit,depth,env){
    bounds(p,22,limit);if(depth>90||++objectCount>250000)fail('AC_CONTEXT_BUDGET');
    if(bytes[p]!==0||bytes[p+1]!==0)fail('AC_OBJECT_PREFIX');
    const type=u32(p+14),length=u32(p+18),end=p+22+length;
    if(length<8||end>limit)fail('AC_OBJECT_LENGTH');
    const isPlayer=type===HASH.player,frame=isPlayer?{character:null,records:[]}:env.frame;
    const node={type,offset:p,fields:[]};let pos=p+22;
    while(pos<end){
      bounds(pos,4,end);const groupEnd=pos+4+u32(pos);pos+=4;if(groupEnd>end)fail('AC_GROUP_LENGTH');
      while(pos<groupEnd){
        bounds(pos,17,groupEnd);const size=u32(pos),fend=pos+4+size;
        if(size<13||fend>groupEnd||++fieldCount>1000000)fail('AC_FIELD_LENGTH');
        const name=u32(pos+4),storage=bytes[pos+14]&127,arrayStorage=((bytes[pos+14]>>>7)|(bytes[pos+15]<<1))&127;
        if(bytes[pos+16]!==11)fail('AC_FIELD_MARKER');
        const owned=type===HASH.inventory?name===HASH.data:env.owned;
        const [value,used]=read(storage,arrayStorage,pos+17,fend,depth+1,{frame,owned,parentType:type});
        if(used!==fend)fail('AC_FIELD_CONSUMPTION');
        if([HASH.itemData,HASH.item,HASH.player].includes(type))node.fields.push({name,storage,offset:pos+17,length:size-13,value});
        pos=fend;
      }
      if(pos!==groupEnd)fail('AC_GROUP_CONSUMPTION');
    }
    if(pos!==end)fail('AC_OBJECT_CONSUMPTION');
    const field=name=>{const rows=node.fields.filter(f=>f.name===name);if(rows.length>1)fail('AC_AMBIGUOUS_PROPERTY');return rows[0];};
    if(type===HASH.itemData&&env.owned&&env.parentType===HASH.bag){
      const item=field(HASH.itemField)?.value,q=field(HASH.quantity);
      if(item?.type!==HASH.item||!q||q.storage!==7||q.length!==4)fail('AC_ITEM_LAYOUT');
      const f=name=>{const rows=item.fields.filter(x=>x.name===name);if(rows.length>1)fail('AC_AMBIGUOUS_PROPERTY');return rows[0];},s=f(HASH.settings),id=f(HASH.instance),l=f(HASH.level);
      if(!s||s.storage!==18||s.length!==8||!id||id.storage!==7||id.length!==4||!l||l.storage!==7||l.length!==4)fail('AC_ITEM_LAYOUT');
      const record={recordId:`${contextId}:${p}:${id.value}`,characterId:frame?.character||'shared',itemSettingsId:s.value,instanceId:String(id.value),level:l.value,quantity:q.value,displayName:`Item ${s.value}`,editableFields:[]};
      if(l.value>=1&&l.value<=100&&q.value===1)record.editableFields.push('level');
      if(l.value===0&&q.value>1&&q.value<=999999)record.editableFields.push('quantity');
      if(!frame)record.editableFields=[];
      Object.defineProperty(record,'native',{value:{recordOffset:p,recordBytes:end-p,levelOffset:l.offset,quantityOffset:q.offset},enumerable:false});
      records.push(record);if(frame)frame.records.push(record);
    }
    if(isPlayer){
      const f=field(HASH.character);if(!f||f.storage!==18||f.length!==8)fail('AC_CHARACTER_LAYOUT');
      frame.character=f.value;for(const r of frame.records){r.characterId=f.value;if(!['2108411092570','2134361901830'].includes(f.value))r.editableFields=[];}
    }
    return [node,end];
  }
  function read(t,a,p,end,depth,env){
    if(depth>90)fail('AC_CONTEXT_BUDGET');
    if([19,20,21,22].includes(t)){
      if(t===20||t===21){bounds(p,1,end);const marker=bytes[p++];if(marker===2||marker===3)return [null,p];if(marker!==0)fail('AC_POINTER_MARKER');}
      return object(p,end,depth,env);
    }
    if([23,24,29].includes(t)){
      bounds(p,5,end);const count=u32(p+1);if(bytes[p]!==1||count>100000)fail('AC_ARRAY_HEADER');let pos=p+5;
      for(let i=0;i<count;i++)[,pos]=read(a,0,pos,end,depth+1,env);
      return [null,pos];
    }
    if(t===28){bounds(p,1,end);const marker=bytes[p];if(marker===1){bounds(p,9,end);return [u64(p+1),p+9];}if(marker===2||marker===3)return [null,p+1];fail('AC_REFERENCE_MARKER');}
    if(t===25||t===31){const n=t===25?8:24;bounds(p,n,end);return [view.getInt32(p,true),p+n];}
    if(t===26||t===27){bounds(p,4,end);const n=u32(p);bounds(p+4,n,end);const finish=p+4+n;if(finish>=end||bytes[finish]!==0)fail('AC_STRING_UNSUPPORTED');return [null,finish+1];}
    const n=scalarWidths[t];if(n===undefined)fail('AC_STORAGE_UNSUPPORTED',`Unsupported progression storage ${t}`);bounds(p,n,end);
    if(t===7)return [u32(p),p+4];if(t===6)return [view.getInt32(p,true),p+4];
    if(t===18||t===17||t===8||t===9||t===30)return [u64(p),p+8];
    if(t===0&&bytes[p]>1)fail('AC_BOOLEAN_VALUE');
    return [null,p+n];
  }
  const [root,end]=object(0,bytes.length,0,{owned:false,frame:null,parentType:null});
  if(root.type!==HASH.root)fail('AC_PROGRESSION_ROOT');if(end!==bytes.length)fail('AC_CONTEXT_TRAILING_BYTES');
  if(new Set(records.map(x=>x.recordId)).size!==records.length)fail('AC_DUPLICATE_RECORD');
  return {records,objectCount,fieldCount,rootType:root.type};
}

export function patchProgression(source,parsed,operations,sourceSha256,{materialize=true}={}){
  const next=materialize?new Uint8Array(source):null,view=next?new DataView(next.buffer):null,changes=[],targets=new Set();
  for(const op of operations){
    if(op?.apiVersion!=='0.1.0'||!op.params||Array.isArray(op.params))fail('AC_OPERATION_INVALID');
    const isLevel=op.id==='acshadows.inventory.setLevel',isQuantity=op.id==='acshadows.inventory.setQuantity';
    if(!isLevel&&!isQuantity)fail('AC_OPERATION_UNSUPPORTED');
    const field=isLevel?'level':'quantity',expectedKey=isLevel?'expectedLevel':'expectedQuantity',p=op.params;
    if(Object.keys(p).sort().join(',')!==['recordId',expectedKey,field,'sourceSha256'].sort().join(','))fail('AC_OPERATION_INVALID');
    if(p.sourceSha256!==sourceSha256)fail('AC_SOURCE_MISMATCH');
    const record=parsed.records.find(x=>x.recordId===p.recordId);if(!record)fail('AC_RECORD_NOT_FOUND');
    if(!record.editableFields.includes(field))fail('AC_FIELD_READ_ONLY');
    if(record[field]!==p[expectedKey])fail('AC_PRECONDITION_MISMATCH');
    if(!Number.isSafeInteger(p[field])||p[field]<1||p[field]>(isLevel?100:999999))fail('AC_RANGE');
    const offset=record.native[field+'Offset'];if(targets.has(offset))fail('AC_DUPLICATE_EDIT');targets.add(offset);
    if(view)view.setUint32(offset,p[field],true);changes.push({recordId:record.recordId,field,offset,width:4,before:record[field],after:p[field]});
  }
  // The serializer is a bounded patch, never a re-creation of the typed tree.
  return {bytes:next,changes};
}
