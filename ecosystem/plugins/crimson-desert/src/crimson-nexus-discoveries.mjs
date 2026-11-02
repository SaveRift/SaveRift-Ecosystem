// Fixed field-Nexus discovery union from the licensed, game-loaded Start Smart
// reference. No donor progress, challenge/treasure records or fog is copied.
import {Buffer} from '../../../sdk/buffer.mjs';
import {getData} from './data-provider.mjs';
const profile=getData('crimson-nexus-discoveries.json');
import {CodecError} from './crimson-codec.mjs';
import {readDocument} from './crimson-document.mjs';
import {hash} from './source-binding.mjs';
import {traceStructuralDocument,insertTypedRecords} from './crimson-structural-layout.mjs';
export const nexusDiscoveryProfile=Object.freeze(profile);
const ROOT='DiscoveredLevelGimmickSceneObjectSaveData',LIST='_discoveredLevelGimmickSceneObjectSaveDataList',TYPE='LevelGimmickSceneObjectElementSaveData';
const rowPattern=/\.DiscoveredLevelGimmickSceneObjectSaveData\._discoveredLevelGimmickSceneObjectSaveDataList\[(\d+)\]\.(_levelGimmickSceneObjectInfoKey|_sceneObjectUuid|_fogPivotPosition|_isCompleted|_isDiscoverd)$/;
const fail=code=>{throw new CodecError('The Nexus discovery check stopped at its compatibility check.',code);};
function scan(raw){
 const rows=new Map(),document=readDocument(raw,{onScalar:e=>{const m=rowPattern.exec(e.path);if(!m)return;const row=rows.get(+m[1])||{index:+m[1],fields:{}};row.fields[m[2]]={type:e.type,bytes:e.bytes,value:e.value};rows.set(row.index,row);}});
 const roots=document.schema.toc.filter(e=>document.schema.types[e.classIndex]?.name===ROOT);if(roots.length!==1)fail('CRIMSON_NEXUS_DISCOVERY_AMBIGUOUS');
 for(const [name,pin]of Object.entries(profile.types)){const t=document.schema.types.find(t=>t.name===name);if(!t||hash(JSON.stringify(t.fields))!==pin.sha256)fail('CRIMSON_NEXUS_DISCOVERY_DESCRIPTOR_UNSUPPORTED');}
 const root=roots[0],offset=root.offset+11,end=root.offset+root.bytes;
 if(raw.readUInt16LE(root.offset)!==1||raw[root.offset+2]!==3||raw.readUInt32LE(root.offset+7)!==1||raw[offset]!==0||offset+18>end)fail('CRIMSON_NEXUS_DISCOVERY_LAYOUT_UNSUPPORTED');
 const count=raw.readUInt32LE(offset+1);if(count>10000||rows.size!==count)fail('CRIMSON_NEXUS_DISCOVERY_INCOMPLETE');
 const byUuid=new Map();for(let i=0;i<count;i++){const row=rows.get(i),f=row?.fields,key=f?._levelGimmickSceneObjectInfoKey,uuid=f?._sceneObjectUuid;
  if(!key||key.type!=='LevelGimmickSceneObjectInfoKey'||key.bytes!==4||!Number.isSafeInteger(key.value)||key.value<=0||uuid?.type!=='uint4'||uuid.bytes!==16||!/^[a-f0-9]{32}$/.test(uuid.value?.hex)||byUuid.has(uuid.value.hex))fail('CRIMSON_NEXUS_DISCOVERY_AMBIGUOUS');
  row.uuid=uuid.value.hex;row.key=key.value;byUuid.set(row.uuid,row);
 }
 for(const b of document.blocks)b.fields=null;
 return {document,rows:[...rows.values()],byUuid,list:{present:true,offset,end,value:{count,truncated:false},count}};
}
function checkedProfile(){
 if(profile.entries.length!==213||new Set(profile.entries.map(e=>e.uuid)).size!==213||profile.selection.key!==1000001||hash(JSON.stringify(profile.entries))!==profile.contentSha256||profile.entries.some(e=>e.key!==1000001||!/^[a-f0-9]{32}$/.test(e.uuid)||!Array.isArray(e.fogPivotPosition)||e.fogPivotPosition.length!==3||e.fogPivotPosition.some(v=>!Number.isFinite(v)||Math.abs(v)>100)))fail('CRIMSON_NEXUS_DISCOVERY_PROFILE_INVALID');
}
function freshRecord(type,start,e){
 const b=Buffer.alloc(58);b.writeUInt16LE(1,0);b[2]=7;b.writeUInt16LE(type.index,3);b[5]=0;b.fill(255,6,14);b.writeUInt32LE(start+18,14);b.writeUInt32LE(e.key,22);Buffer.from(e.uuid,'hex').copy(b,26);e.fogPivotPosition.forEach((v,i)=>b.writeFloatLE(v,42+i*4));b.writeUInt32LE(36,54);return b;
}
function fogPreserved(trace,after,insert,delta){
 const before=trace.document,schema=before.schema,old=schema.toc.filter(e=>schema.types[e.classIndex]?.name==='FogSaveData'),next=after.schema.toc.filter(e=>after.schema.types[e.classIndex]?.name==='FogSaveData');
 return old.length===next.length&&old.every((e,i)=>{if(e.bytes!==next[i].bytes)return false;const expected=Buffer.from(before.plaintext.subarray(e.offset,e.offset+e.bytes));for(const l of trace.locators)if(l.pointerOffset>=e.offset&&l.pointerOffset+4<=e.offset+e.bytes&&l.advertisedPayloadOffset>=insert)expected.writeUInt32LE(l.advertisedPayloadOffset+delta,l.pointerOffset-e.offset);return expected.equals(after.plaintext.subarray(next[i].offset,next[i].offset+next[i].bytes));});
}
export function addNexusDiscoveries(raw){
 checkedProfile();const before=scan(raw),missing=profile.entries.filter(e=>!before.byUuid.has(e.uuid));
 for(const entry of profile.entries){const row=before.byUuid.get(entry.uuid);if(row&&row.key!==entry.key)fail('CRIMSON_NEXUS_DISCOVERY_ID_CONFLICT');}
 const coverage={knownFieldNexusLocations:213,discoveredLocationsPresentBefore:213-missing.length,discoveredLocationsAdded:missing.length,beforeDiscoveryRecords:before.list.count,afterDiscoveryRecords:before.list.count+missing.length};
 if(!missing.length)return {raw,decodedDiff:[],coverage,validation:{unrelatedDiscoveriesPreserved:true,existingDiscoveryCoordinatesPreserved:true,fogBytesUnchanged:true,discoveryReverseStructuralByteParity:true},source:profile.source};
 const type=before.document.schema.types.find(t=>t.name===TYPE),trace=traceStructuralDocument(raw);for(const b of trace.document.blocks)b.fields=null;
 let cursor=before.list.end;const records=missing.map(e=>{const record=freshRecord(type,cursor,e);cursor+=record.length;return record;}),edit=insertTypedRecords(trace,before.list,records);edit.trace=null;
 const after=scan(edit.raw);if(after.list.count!==coverage.afterDiscoveryRecords||after.document.audit.nonzeroListMetadata!==before.document.audit.nonzeroListMetadata||after.document.schemaSha256!==before.document.schemaSha256)fail('CRIMSON_NEXUS_DISCOVERY_REPARSE_FAILED');
 for(const old of before.rows){const next=after.byUuid.get(old.uuid);if(!next||JSON.stringify(old.fields)!==JSON.stringify(next.fields))fail('CRIMSON_NEXUS_DISCOVERY_UNRELATED_CHANGE');}
 for(const e of missing){const f=after.byUuid.get(e.uuid)?.fields;if(!f||Object.keys(f).length!==3||f._levelGimmickSceneObjectInfoKey.value!==e.key||JSON.stringify(f._fogPivotPosition?.value)!==JSON.stringify(e.fogPivotPosition))fail('CRIMSON_NEXUS_DISCOVERY_INSERTED_MISMATCH');}
 if(!fogPreserved(trace,after.document,edit.insert,edit.delta))fail('CRIMSON_NEXUS_FOG_CHANGED');
 return {raw:edit.raw,decodedDiff:missing.map(e=>({operation:'nexus.discovery.add',objectType:TYPE,key:e.key,uuid:e.uuid,before:null,after:{_levelGimmickSceneObjectInfoKey:e.key,_sceneObjectUuid:e.uuid,_fogPivotPosition:e.fogPivotPosition}})),coverage,validation:{unrelatedDiscoveriesPreserved:true,existingDiscoveryCoordinatesPreserved:true,fogBytesUnchanged:true,discoveryReverseStructuralByteParity:edit.reverseStructuralByteParity},source:profile.source};
}
