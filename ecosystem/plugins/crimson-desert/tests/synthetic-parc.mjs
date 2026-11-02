import {Buffer} from '../../../sdk/buffer.mjs';
// Invented records only; never contains an account snapshot.
export const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
export const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
export const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const str=s=>Buffer.concat([u32(Buffer.byteLength(s)),Buffer.from(s)]);
export function typedParcFixture(){
  const types=[{name:'InventorySaveData',fields:[['absentScalar','uint32',0,4],['absentArray','uint32',3,4],['absentObjects','ReflectObject',6,0],['after','uint32',0,4],['list','ReflectObject',6,0],['zero','uint64',0,8],['wide','uint64',0,8]]},{name:'SyntheticChild',fields:[['noArray','uint32',3,4],['noList','ReflectObject',7,0],['hp','uint64',0,8],['flag','bool',0,1],['unmapped','Unknown',0,3]]}];
  const schema=Buffer.concat([u32(1),u16(types.length),...types.flatMap(t=>[str(t.name),u16(t.fields.length),...t.fields.map(([n,t,k,s])=>Buffer.concat([str(n),str(t),u16(k),u16(s),u32(0)]))])]);
  const prefix=Buffer.alloc(14);prefix.writeUInt16LE(65535);prefix.writeUInt16LE(4,2);
  const start=14+schema.length+32,meta=Buffer.from([0,9,0,0,0,0,0,0,0,0,0,0,0]),list=Buffer.concat([Buffer.from([0]),u32(1),meta]);
  const head=Buffer.concat([u16(1),Buffer.from([0x78]),u32(37),Buffer.from([1,1]),u32(10),list]);
  const wrapperStart=start+head.length,wrapperEnd=wrapperStart+18;
  const childPayload=Buffer.concat([u32(123),Buffer.from([1,1]),u64(7),Buffer.from([255,4,5,6])]);
  const wrapper=Buffer.concat([u16(1),Buffer.from([0x1c]),u16(1),Buffer.from([23]),u32(0xffffffff),u32(0xffffffff),u32(wrapperEnd)]);
  const block=Buffer.concat([head,wrapper,childPayload,u32(childPayload.length),u64(0),u64('9007199254740993')]);
  return {raw:Buffer.concat([prefix,schema,u32(0),u32(1),u32(block.length),u32(0),u32(0),u32(0),u32(start),u32(block.length),block]),markerOffset:start+7,meta,metaOffset:start+18,wrapperEnd};
}

export function quantityParcFixture({quantity='5',quantityPresent=true,duplicateInstance=false,instanceId='9007199254740993'}={}){
  const types=[{name:'InventorySaveData',fields:[['_inventorylist','ReflectObject',6,0],['_absentArray','uint32',3,4],['_guard','uint64',0,8]]},{name:'InventoryElementSaveData',fields:[['_inventoryKey','InventoryKey',0,2],['_varyExpandSlotCount','uint16',0,2],['_itemList','ReflectObject',6,0]]},{name:'ItemSaveData',fields:[['_saveVersion','uint32',0,4],['_itemNo','ItemNo',0,8],['_itemKey','ItemKey',0,4],['_slotNo','TItemSlotNo',0,2],['_stackCount','TStackCount',0,8],['_absentList','ReflectObject',6,0],['_guardHp','uint64',0,8],['_flag','bool',0,1],['_opaque','Unknown',0,3]]}];
  const schema=Buffer.concat([u32(1),u16(types.length),...types.flatMap(t=>[str(t.name),u16(t.fields.length),...t.fields.map(([n,t,k,s])=>Buffer.concat([str(n),str(t),u16(k),u16(s),u32(0)]))])]),prefix=Buffer.alloc(14);prefix.writeUInt16LE(65535);prefix.writeUInt16LE(4,2);
  const base=14+schema.length+32,chunks=[];let pos=base;
  const emit=b=>{chunks.push(b);pos+=b.length;};
  function object(typeIndex,mask,build){const mb=Buffer.from(mask);emit(u16(mb.length));emit(mb);emit(u16(typeIndex));emit(Buffer.from([0]));emit(u32(0xffffffff));emit(u32(0xffffffff));emit(u32(pos+4));const payload=pos;emit(u32(17));build();emit(u32(pos-payload));}
  function list(count,build){emit(Buffer.from([0]));emit(u32(count));emit(Buffer.from([0,9,0,0,0,0,0,0,0,0,0,0,0]));for(let i=0;i<count;i++)build(i);}
  emit(u16(1));emit(Buffer.from([5]));emit(u32(99));
  list(1,()=>object(1,[5],()=>{emit(u16(2));list(duplicateInstance?2:1,i=>object(2,[quantityPresent?0xdf:0xcf,1],()=>{emit(u32(1));emit(u64(instanceId));emit(u32(1000730));emit(u16(i));if(quantityPresent)emit(u64(quantity));emit(Buffer.from([1]));emit(u64(777));emit(Buffer.from([255,8,9,10]));}));}));emit(Buffer.from([1]));emit(u64(123456));
  const block=Buffer.concat(chunks),raw=Buffer.concat([prefix,schema,u32(0),u32(1),u32(block.length),u32(0),u32(0),u32(0),u32(base),u32(block.length),block]);return {raw,instanceId};
}
