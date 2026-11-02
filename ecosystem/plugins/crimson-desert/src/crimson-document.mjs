// MPL-2.0. Saveglass strict, read-only PARC walker.
// Format references: NattKh 96e7f78 (MPL-2.0), bbfox0703/crimson-rs
// 10b137d (MIT). See docs/crimson-domain-audit.md and THIRD_PARTY_NOTICES.md.
import {Buffer} from '../../../sdk/buffer.mjs';
import {CodecError,parcSchema} from './crimson-codec.mjs';
import {hash} from './source-binding.mjs';
export const DECODER_REVISION='saveglass.parc-marker-reader.v2';
const selected=new Set(['InventorySaveData','EquipmentSaveData','MercenaryClanSaveData','KnowledgeSaveData','QuestSaveData','CharacterStatusSaveData','PlayerSaveData','SaveData','GameSaveData','ContentsMiscSaveData','StoreSaveData','FriendlySaveData','TransformSaveData']);
const fail=(message)=>{throw new CodecError(message,'PARC_TYPED_INVALID');};

// Original plaintext is the lossless document. All slices, including unknown
// scalars, flags, masks and all 13 list metadata bytes, retain their original
// bytes and absolute offsets here. UI projections are deliberately not writers.
export function readDocument(raw,{listLimit=200,fieldListLimits={},captureTypes,scalarFields,onScalar,onLocator,onObject,compareTo,hashPlaintext=true}={}){
  // Internal projection control only: every field is still strictly walked.
  if(captureTypes!==undefined&&(!Array.isArray(captureTypes)||captureTypes.some(t=>typeof t!=='string')))fail('Invalid typed projection.');
  if(scalarFields!==undefined&&(!Array.isArray(scalarFields)||scalarFields.length>1024||scalarFields.some(t=>typeof t!=='string'||!t.length||t.length>256)))fail('Invalid scalar projection.');
  if(typeof hashPlaintext!=='boolean')fail('Invalid plaintext digest option.');
  if(!fieldListLimits||typeof fieldListLimits!=='object'||Array.isArray(fieldListLimits)||Object.values(fieldListLimits).some(n=>!Number.isInteger(n)||n<0||n>1024))fail('Invalid field projection limit.');
  const schema=parcSchema(raw),audit={objects:0,fields:0,absentScalars:0,omittedListMarkers:0,objectLists:0,nonzeroListMetadata:0,nonzeroListSamples:[],advisoryLocators:0,unconsumedBytes:0},blocks=[];
  // Descriptor decisions belong to the schema, not every repeated scalar.
  // Keep this metadata separate: schema fingerprints retain the original DTO.
  const observed=scalarFields===undefined?null:new Set(scalarFields),profiles=schema.types.map(type=>{
   const flags=new Uint8Array(type.fields.length),limits=[];
   type.fields.forEach((def,index)=>{
    const t=def.type.toLowerCase(),n=def.size;
    const mode=t==='bool'&&n===1?1:t==='float3'&&n===12?2:(t==='float4'||t==='quaternion')&&n===16?3:t.includes('float')&&n===4?4:t.includes('float')&&n===8?5:n===8?t.startsWith('int')?6:7:[1,2,4].includes(n)?t.startsWith('int')?8:9:0;
    // Low four bits select the decoder; the remaining bits control projection.
    // Typed flags avoid retaining one object per descriptor on repeated walks.
    flags[index]=mode|((def.kind===4||def.kind===5||def.kind===6||def.kind===7)?16:0)|(onScalar&&(!observed||observed.has(def.name)||observed.has(type.name+'.'+def.name))?32:0);
    limits.push(fieldListLimits[type.name+'.'+def.name]??listLimit);
   });return {flags,limits};
  }),decoder=new TextDecoder('utf-8',{fatal:true});
  if(compareTo&&compareTo.length!==raw.length)fail('A decoded diff requires unchanged document length.');
  const rawView=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),comparisonView=compareTo?new DataView(compareTo.buffer,compareTo.byteOffset,compareTo.byteLength):null;
  const decodedDiff=[];let comparedLeafFields=0;
  let budget=0,validateUnprojectedStrings=false;
  function need(pos,n,end){if(!Number.isSafeInteger(n)||n<0||pos<0||pos+n>end||pos+n>raw.length)fail(`Typed field exceeds its region at ${pos}.`);}
  const u16=(p,e)=>{need(p,2,e);return raw.readUInt16LE(p);};
  const u32=(p,e)=>{need(p,4,e);return raw.readUInt32LE(p);};
  function scalar(p,f,mode,source=raw){
    // Every caller already bounds this exact fixed scalar or complete array.
    const n=f.size,view=source===raw?rawView:comparisonView;
    if(mode===1)return source[p]!==0;
    if(mode===2)return [view.getFloat32(p,true),view.getFloat32(p+4,true),view.getFloat32(p+8,true)];
    if(mode===3)return [view.getFloat32(p,true),view.getFloat32(p+4,true),view.getFloat32(p+8,true),view.getFloat32(p+12,true)];
    if(mode===4)return view.getFloat32(p,true);
    if(mode===5)return view.getFloat64(p,true);
    if(mode===6||mode===7)return (mode===6?view.getBigInt64(p,true):view.getBigUint64(p,true)).toString();
    if(mode===8)return n===1?view.getInt8(p):n===2?view.getInt16(p,true):view.getInt32(p,true);
    if(mode===9)return n===1?view.getUint8(p):n===2?view.getUint16(p,true):view.getUint32(p,true);
    return {encoding:'opaque',bytes:n,hex:source.subarray(p,p+n).toString('hex')};
  }
  function locator(start,end,path,capture,depth,kind=4){
    let p=start;
    if(kind===5){let found=false;for(let d=0;d<=8;d++){if(p+d+2<=end){const n=raw.readUInt16LE(p+d);if(n>=1&&n<=16){p+=d;found=true;break;}}}if(!found)fail(`Unsupported pointer prefix at ${start}.`);}
    const count=u16(p,end);if(count<1||count>16)fail(`Invalid locator mask at ${p}.`);
    const maskStart=p+2,typePos=maskStart+count,wrapperEnd=typePos+15;need(p,wrapperEnd-p,end);
    const typeIndex=u16(typePos,end),type=schema.types[typeIndex];if(!type)fail(`Invalid child type at ${typePos}.`);
    const advertised=u32(typePos+11,end);if(advertised!==wrapperEnd)audit.advisoryLocators++;
    // Optional metadata-only tracing for isolated structural controls. Never
    // retain these events in ordinary inspection projections.
    onLocator?.({path,wrapperStart:start,wrapperEnd,typeIndex,typeName:type.name,pointerOffset:typePos+11,advertisedPayloadOffset:advertised});
    const child=object(type,raw.subarray(maskStart,typePos),wrapperEnd,end,path,capture,depth+1,true);
    if(capture)Object.assign(child,{wrapperStart:start,wrapperEnd,advertisedPayloadOffset:advertised,wrapperBytes:raw.subarray(start,wrapperEnd)});
    return child;
  }
  function object(type,mask,start,end,path,capture,depth,inline){
    if(depth>48||++budget>1500000)fail('Typed document traversal limit exceeded.');
    audit.objects++;let p=start+4;need(start,4,end);const fields=capture?{}:null,profile=profiles[type.index];
    for(let i=0;i<type.fields.length;i++){
      const def=type.fields[i],flags=profile.flags[i],mode=flags&15,watch=flags&32,present=Boolean(mask[i>>3]&(1<<(i&7))),begin=p,fieldPath=present&&(capture||watch||onScalar&&(flags&16))?path+'.'+def.name:path,retainedLimit=capture?profile.limits[i]:listLimit;let value=null,count;
      if(++audit.fields>3000000)fail('Typed field traversal limit exceeded.');
      if(!present){
        if(def.kind===3||def.kind===6||def.kind===7){need(p,1,end);if(raw[p]!==1)fail(`Missing omitted-list marker at ${path+'.'+def.name} (${p}).`);p++;audit.omittedListMarkers++;}
        else audit.absentScalars++;
      }else if((def.kind===0||def.kind===2)&&def.size>0){
        need(p,def.size,end);if(capture||watch)value=scalar(p,def,mode);p+=def.size;if(watch)onScalar({path:fieldPath,offset:begin,bytes:def.size,present:true,value,type:def.type});
      }else if(def.kind===1&&def.size>0){
        count=u32(p,end);p+=4;need(p,count*def.size,end);
        const isString=def.size===1&&/string/i.test(def.type);
        if(isString&&(capture||validateUnprojectedStrings)){const decoded=decoder.decode(raw.subarray(p,p+count)).replace(/\0+$/,'');if(capture)value=decoded;}else if(capture)value={encoding:'opaque',count,bytes:count*def.size};p+=count*def.size;
      }else if(def.kind===3&&def.size>0){
        need(p,5,end);if(raw[p]!==0)fail(`Invalid dynamic-array tag at ${fieldPath}.`);count=u32(p+1,end);p+=5;need(p,count*def.size,end);
        if(count>100000)fail('Primitive array exceeds inspection limit.');
        if(capture)value=Array.from({length:Math.min(count,retainedLimit)},(_,j)=>scalar(p+j*def.size,def,mode));p+=count*def.size;
      }else if(def.kind===4||def.kind===5){
        value=locator(p,end,fieldPath,capture,depth,def.kind);p=value.end;
      }else if(def.kind===6||def.kind===7){
        need(p,18,end);if(raw[p]!==0)fail(`Invalid object-list tag at ${fieldPath} (${p}).`);
        count=u32(p+1,end);if(count>100000)fail('Object list exceeds inspection limit.');
        const metadataStart=p+5,meta=raw.subarray(metadataStart,p+18);audit.objectLists++;
        if(meta.some(b=>b!==0)){audit.nonzeroListMetadata++;if(audit.nonzeroListSamples.length<12)audit.nonzeroListSamples.push({path:capture?fieldPath:path+'.'+def.name,offset:metadataStart,hex:meta.toString('hex')});}
        p+=18;const elements=capture?[]:null;
        for(let j=0;j<count;j++){const retain=capture&&j<retainedLimit,child=locator(p,end,retain||onScalar?fieldPath+'['+j+']':fieldPath,retain,depth);p=child.end;if(retain)elements.push(child);}
        value=capture?{count,elements,truncated:count>retainedLimit,metadataOffset:metadataStart,metadataBytes:meta}:null;
      }else fail(`Unsupported field kind ${def.kind} at ${fieldPath}.`);
      if(compareTo&&present&&[0,1,2,3].includes(def.kind)){
        comparedLeafFields++;let differs=false;for(let at=begin;at<p&&!differs;at++)differs=raw[at]!==compareTo[at];
        if(differs){
          if(decodedDiff.length>=32)fail('Decoded diff exceeds the narrow-edit limit.');
          const decode=source=>[0,2].includes(def.kind)?scalar(begin,def,mode,source):{bytes:p-begin,rawSha256:hash(source.subarray(begin,p))};
          decodedDiff.push({path:fieldPath===path?path+'.'+def.name:fieldPath,objectType:type.name,field:def.name,type:def.type,offset:begin,bytes:p-begin,present:true,before:decode(compareTo),after:decode(raw)});
        }
      }
      if(capture)fields[def.name]={present,offset:begin,end:p,bytes:p-begin,type:def.type,kind:def.kind,value,count};
    }
    if(inline){if(u32(p,end)!==p-start)fail(`Inline trailing size disagrees at ${path} (${p}).`);p+=4;}
    else if(p!==end)fail(`Unconsumed bytes at ${path}: ${end-p}.`);
    onObject?.({path,type:type.name,start,end:p,inline,trailerOffset:inline?p-4:null});
    return {type:type.name,start,end:p,maskBytes:capture?mask:undefined,fields};
  }
  let previous=schema.dataStart;
  for(let i=0;i<schema.toc.length;i++){
    const e=schema.toc[i],end=e.offset+e.bytes;if(e.offset!==previous)fail('Non-contiguous or overlapping top-level blocks are unsupported.');previous=end;
    const maskCount=u16(e.offset,end);if(maskCount<1||maskCount>16)fail('Invalid root mask.');need(e.offset,2+maskCount+4,end);
    const type=schema.types[e.classIndex],defaultCapture=selected.has(type.name)||/Player|Position|FieldContents|Friendly|Relation/.test(type.name),capture=captureTypes===undefined?defaultCapture:captureTypes.includes(type.name);
    // Suppressing a projection must not suppress existing UTF-8 validation.
    validateUnprojectedStrings=captureTypes!==undefined&&defaultCapture;
    const block=object(type,raw.subarray(e.offset+2,e.offset+2+maskCount),e.offset+2+maskCount,end,`$[${i}].${type.name}`,capture,0,false);blocks.push(block);
  }
  if(previous!==raw.length)fail('Unconsumed bytes after the final block.');
  return {revision:DECODER_REVISION,plaintext:raw,plaintextSha256:hashPlaintext?hash(raw):null,schemaSha256:hash(JSON.stringify(schema.types)),schema,audit,blocks,lossless:true,...(compareTo?{decodedDiff,comparison:{comparedLeafFields,changedLeafFields:decodedDiff.length}}:{})};
}
export const field=(object,name)=>object?.fields?.[name];
export const value=(object,name)=>field(object,name)?.present?field(object,name).value:null;
export const elements=(object,name)=>value(object,name)?.elements||[];
