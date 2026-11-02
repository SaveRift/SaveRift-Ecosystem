// Private, stateless inspection of user-supplied native game payloads. This is
// not an Xbox container importer and has no account, storage or network access.
import {Buffer} from '../../../sdk/buffer.mjs';
import {hash} from './source-binding.mjs';
import {CodecError,decodeSave,encodeSave} from './crimson-codec.mjs';
import {readDocument} from './crimson-document.mjs';

export const UPLOADED_SAVE_LIMITS=Object.freeze({maxFiles:2,maxTotalBytes:4*1024*1024,maxJsonBytes:6*1024*1024,maxDecodedBytes:8*1024*1024,maxNativeFileBytes:4*1024*1024,maxNativeTotalBytes:8*1024*1024});
export class UploadedSaveError extends Error{
 constructor(code,message,status=400){super(message);this.code=code;this.status=status;}
}
const fail=(code,message,status=400)=>{throw new UploadedSaveError(code,message,status);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const canonicalBase64=/^[A-Za-z0-9+/]*={0,2}$/;
const lobbyFields=['_slotDisplayNameMissionKey','_slotDisplayNameMainQuestKey','_gameSaveVersion','_generateNo'];
const metadataFields=new Set([...lobbyFields,'_lastCompletedMissionKey','_lastCompletedMainQuestKey']);
const unsupportedCodecCodes=new Set(['CRIMSON_VERSION_UNSUPPORTED','CRIMSON_FLAGS_UNSUPPORTED','CRIMSON_SIZE_LIMIT','CRIMSON_ROUNDTRIP_SIZE_LIMIT','SAVE_UPLOAD_NATIVE_SIZE_LIMIT']);

export function validateUploadedSaveInput(input){
 if(!exact(input,['game','files'])||input.game!=='crimson-desert')fail('SAVE_UPLOAD_GAME_UNSUPPORTED','Choose Crimson Desert for this upload check.');
 if(!Array.isArray(input.files)||input.files.length<1||input.files.length>UPLOADED_SAVE_LIMITS.maxFiles)fail('SAVE_UPLOAD_FILE_COUNT','Choose one or two native save files.');
 let total=0;const names=new Set();
 return input.files.map(file=>{
  if(!exact(file,['name','dataBase64'])||typeof file.name!=='string'||file.name.length<1||file.name.length>180||/[\u0000-\u001f\u007f/\\]/.test(file.name)||/^\.+$/.test(file.name))fail('SAVE_UPLOAD_NAME_INVALID','Use a file name without folders or control characters.');
  const name=file.name.normalize('NFC');if(names.has(name.toLowerCase()))fail('SAVE_UPLOAD_DUPLICATE_NAME','Choose files with different names.');names.add(name.toLowerCase());
  if(typeof file.dataBase64!=='string'||file.dataBase64.length<4||file.dataBase64.length%4!==0||file.dataBase64.length>Math.ceil(UPLOADED_SAVE_LIMITS.maxTotalBytes/3)*4||!canonicalBase64.test(file.dataBase64))fail('SAVE_UPLOAD_DATA_INVALID','The uploaded file data is not valid base64.');
  const bytes=Buffer.from(file.dataBase64,'base64');if(!bytes.length||bytes.toString('base64')!==file.dataBase64)fail('SAVE_UPLOAD_DATA_INVALID','The uploaded file data is not valid base64.');
  total+=bytes.length;if(total>UPLOADED_SAVE_LIMITS.maxTotalBytes)fail('SAVE_UPLOAD_SIZE_LIMIT','Choose files totaling no more than 4 MiB.',413);
  return {name,bytes};
 });
}

function detectedFormat(bytes){
 if(bytes.length>=4&&bytes.subarray(0,4).equals(Buffer.from('SAVE')))return 'crimson-save';
 if(bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b&&[[3,4],[5,6],[7,8]].some(([a,b])=>bytes[2]===a&&bytes[3]===b))return 'zip-archive';
 if(bytes.length>=2&&bytes.readUInt16LE(0)===0xffff)return 'decoded-parc';
 return 'unrecognized';
}
function baseReport(file){return {name:file.name,bytes:file.bytes.length,sha256:hash(file.bytes),status:'unsupported',format:detectedFormat(file.bytes),role:'unknown',summary:'This file format is not supported by the Crimson Desert checker.',checks:{integrity:null,structure:null,roundTrip:null,plaintextUnchanged:null}};}
function fileName(name){const safe=name.replace(/[^A-Za-z0-9._ -]/g,'_').replace(/^\.+/,'').replace(/\.[^.]*$/,'').slice(0,100)||'save';return 'native-'+safe+'.save';}
function scalarMetadata(){
 const values=new Map();
 return {collect(event){
  const match=/^\$\[\d+\]\.([^.\[\]]+)\.([^.\[\]]+)$/.exec(event.path);
  if(!match||!metadataFields.has(match[2])||!['number','string'].includes(typeof event.value)||typeof event.value==='number'&&!Number.isSafeInteger(event.value)||typeof event.value==='string'&&!/^\d{1,20}$/.test(event.value))return;
  const key=match[1]+'.'+match[2],old=values.get(key);values.set(key,old===undefined?String(event.value):null);
 },get(type,field){return values.get(type+'.'+field)??null;}};
}
function identify(document,metadata){
 const roots=document.schema.toc.map(entry=>document.schema.types[entry.classIndex]);
 const lobbyRoots=roots.filter(type=>lobbyFields.every(name=>type.fields.some(field=>field.name===name)&&metadata.get(type.name,name)!==null));
 const inventoryRoots=roots.filter(type=>type.name==='InventorySaveData').length;
 if(lobbyRoots.length===1&&inventoryRoots===0){const type=lobbyRoots[0].name;return {role:'lobby',quest:metadata.get(type,'_slotDisplayNameMissionKey'),mainQuest:metadata.get(type,'_slotDisplayNameMainQuestKey'),gameSaveVersion:metadata.get(type,'_gameSaveVersion'),generateNo:metadata.get(type,'_generateNo')};}
 if(inventoryRoots===1&&!lobbyRoots.length)return {role:'save',quest:metadata.get('QuestSaveData','_lastCompletedMissionKey'),mainQuest:metadata.get('QuestSaveData','_lastCompletedMainQuestKey'),gameSaveVersion:null,generateNo:null};
 return {role:'unknown',quest:null,mainQuest:null,gameSaveVersion:null,generateNo:null};
}
const preservedHeader=(before,after)=>before.every((value,index)=>index>=0x12&&index<0x4a||value===after[index]);
async function inspectFile(file,remainingNativeBytes){
 const result=baseReport(file);let failedCheck='integrity';
 if(result.format==='zip-archive'){result.summary='This is an archive. Choose its original save file and companion lobby file; archives are not extracted.';return {result};}
 if(result.format==='decoded-parc'){result.summary='This is a decoded payload. Its original SAVE header is required; the checker will not invent one.';return {result};}
 if(result.format!=='crimson-save')return {result};
 try{
  if(file.bytes.length<128)throw new CodecError('Truncated SAVE envelope.','CRIMSON_FORMAT_INVALID');
  const declared=file.bytes.readUInt32LE(0x12);
  if(declared<1||declared>UPLOADED_SAVE_LIMITS.maxDecodedBytes){result.code='SAVE_UPLOAD_DECODED_SIZE_LIMIT';result.summary='The decoded save exceeds this checker’s 8 MiB limit.';return {result};}
  const decoded=await decodeSave(file.bytes);result.checks.integrity=true;failedCheck='structure';
  const metadata=scalarMetadata(),document=readDocument(decoded.plaintext,{captureTypes:[],listLimit:0,onScalar:metadata.collect});
  if(document.audit.unconsumedBytes!==0||document.audit.advisoryLocators!==0)throw new CodecError('Unsupported typed document locations.','PARC_TYPED_INVALID');
  const identity=identify(document,metadata);result.checks.structure=true;result.role=identity.role;failedCheck='roundTrip';
  const native=await encodeSave(decoded.plaintext,decoded.header,{nonce:decoded.header.subarray(0x1a,0x2a)});
  if(native.length>UPLOADED_SAVE_LIMITS.maxNativeFileBytes||native.length>remainingNativeBytes)throw new CodecError('Native copy exceeds the output budget.','SAVE_UPLOAD_NATIVE_SIZE_LIMIT');
  const reopened=await decodeSave(native);
  if(reopened.version!==decoded.version||reopened.flags!==decoded.flags||!decoded.plaintext.equals(reopened.plaintext)||!preservedHeader(decoded.header,reopened.header))throw new CodecError('Unchanged native copy did not reopen.','SAVE_UPLOAD_ROUNDTRIP_FAILED');
  result.status='validated';result.checks.roundTrip=true;result.checks.plaintextUnchanged=true;
  result.summary='Native SAVE integrity, structure and unchanged-data re-open checks passed. Xbox transfer is not verified.';
  result.details={saveVersion:decoded.version,decodedBytes:decoded.plaintext.length,typeCount:document.schema.types.length,rootCount:document.schema.toc.length,schemaSha256:document.schemaSha256,omittedListMarkers:document.audit.omittedListMarkers,nonzeroListMetadata:document.audit.nonzeroListMetadata,opaqueHeaderPreserved:true,nativeLz4:true};
  result.nativeCopy={filename:fileName(file.name),bytes:native.length,sha256:hash(native),dataBase64:native.toString('base64')};
  return {result,identity};
 }catch(error){
  // Parser details can include user-provided schema names; expose only a safe
  // fixed outcome and a bounded machine code, never arbitrary exception text.
  result.status=error instanceof CodecError&&unsupportedCodecCodes.has(error.code)?'unsupported':'invalid';
  result.code=error instanceof CodecError&&/^[A-Z][A-Z0-9_]{1,79}$/.test(error.code||'')?error.code:'SAVE_UPLOAD_CHECK_FAILED';
  result.checks[failedCheck]=result.status==='unsupported'?null:false;
  result.summary=result.code==='SAVE_UPLOAD_NATIVE_SIZE_LIMIT'?'The native copy exceeds the 4 MiB per-file or 8 MiB combined output limit. No copy was returned.':result.status==='unsupported'?'This SAVE version, compression or size is not supported by the checker.':failedCheck==='integrity'?'The native SAVE integrity or envelope check did not pass. No repair was attempted.':failedCheck==='structure'?'The decoded structure is not supported by this checker. No native copy was created.':'The unchanged native copy did not pass re-open validation.';
  return {result};
 }
}
function pairReport(files){
 if(files.some(file=>file.result.status!=='validated'))return {state:'unverified',message:'Every supplied file must pass its individual checks before companion metadata can be compared.'};
 const saves=files.filter(file=>file.identity?.role==='save'),lobbies=files.filter(file=>file.identity?.role==='lobby');
 if(saves.length!==1||lobbies.length!==1)return {state:files.length===1?'companion_missing':'ambiguous',message:files.length===1?'Choose the matching save and lobby files to compare their companion metadata.':'A unique main save and lobby pair was not identified from the decoded contents.'};
 const main=saves[0].identity,lobby=lobbies[0].identity;
 if(main.quest===null||main.mainQuest===null)return {state:'unverified',message:'Both native payloads were recognized, but their quest correspondence could not be established.'};
 if(main.quest!==lobby.quest||main.mainQuest!==lobby.mainQuest)return {state:'mismatch',message:'The main save and lobby quest metadata do not agree. Do not use them as a pair.'};
 return {state:'partial_match',message:'The main save and lobby quest labels agree. Account, slot, game-version and in-game compatibility remain unverified.'};
}
export async function inspectUploadedSaves(input){
 const files=validateUploadedSaveInput(input),inspected=[];let remainingNativeBytes=UPLOADED_SAVE_LIMITS.maxNativeTotalBytes;
 // Keep parsing sequential so two decoded documents never need to be retained
 // together. Only small metadata and the bounded native-copy bytes survive.
 for(const file of files){const checked=await inspectFile(file,remainingNativeBytes);remainingNativeBytes-=checked.result.nativeCopy?.bytes||0;inspected.push(checked);}
 return {schema:'saverift.uploaded-save-report.v1',game:'crimson-desert',source:'user_upload',files:inspected.map(file=>file.result),pair:pairReport(inspected),xboxTransfer:{state:'not_verified',canSend:false,message:'These checks do not establish PC-to-Xbox compatibility. Uploading to an Xbox slot is not enabled for user files.'},originalsUnchanged:true,stored:false,cloudRequests:0,xboxMutations:0};
}
