// SPDX-License-Identifier: Apache-2.0
// Original SaveRift reference-data tooling.
// Importers are deliberately offline: references never become fetch requests.
import {canonical, digest, fail, logicalPath} from './contracts.mjs';
import {hash} from './crypto.mjs';

export const DATA_LIMITS=Object.freeze({bytes:8*1024*1024,entities:100000,depth:20,fields:256,string:65536,query:100,assetBytes:4*1024*1024,svgBytes:65536});
const encoder=new TextEncoder();
const forbidden=new Set(['__proto__','constructor','prototype']);
const identity=/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/;
const pin=/^[0-9a-f]{64}$/;
const deepFreeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))deepFreeze(v);Object.freeze(value);}return value;};
export function validateDataId(value,{namespaced=false}={}){if(typeof value!=='string'||!identity.test(value)||(namespaced&&!/[.:]/.test(value)))fail('DATA_ID_INVALID','Data identifiers must be stable, namespaced strings.');return value;}
function checkedJson(value,limits=DATA_LIMITS,depth=0){
  if(depth>limits.depth)fail('DATA_DEPTH_LIMIT','Reference data nesting exceeds its limit.');
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='string'){if(value.length>limits.string)fail('DATA_STRING_LIMIT','A reference-data field exceeds its limit.');return value;}
  if(typeof value==='number'){if(!Number.isFinite(value)||(Number.isInteger(value)&&!Number.isSafeInteger(value)))fail('DATA_NUMBER_INVALID','Lossless integer identifiers must be decimal strings.');return value;}
  if(Array.isArray(value)){if(value.length>limits.entities)fail('DATA_ARRAY_LIMIT','A reference-data array exceeds its limit.');return value.map(v=>checkedJson(v,limits,depth+1));}
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('DATA_JSON_INVALID','Reference data must be plain JSON.');
  const entries=Object.entries(value);if(entries.length>limits.fields)fail('DATA_FIELD_LIMIT','An object contains too many fields.');
  const copy={};for(const [key,v] of entries){if(forbidden.has(key))fail('DATA_KEY_INVALID','Prototype-related keys are forbidden.');copy[key]=checkedJson(v,limits,depth+1);}return copy;
}
function parseJson(source,limits){
  if(typeof source!=='string')fail('DATA_INPUT_INVALID','Import input must be UTF-8 text.');
  if(encoder.encode(source).byteLength>limits.bytes)fail('DATA_BYTE_LIMIT','The reference-data import exceeds its byte limit.');
  try{return checkedJson(JSON.parse(source),limits);}catch(error){if(error.code)throw error;fail('DATA_JSON_INVALID','The reference-data JSON is invalid.');}
}
function source(value){
  if(!value||typeof value!=='object')fail('DATA_PROVENANCE_REQUIRED','Each source needs explicit provenance and permitted-use information.');
  validateDataId(value.id,{namespaced:true});
  for(const key of ['revision','license','attribution','retrievalMethod'])if(typeof value[key]!=='string'||!value[key].trim())fail('DATA_PROVENANCE_REQUIRED','Each source needs revision, license, attribution and retrieval method.');
  if(value.sha256!==undefined&&!pin.test(value.sha256))fail('DATA_DIGEST_INVALID','A source checksum is invalid.');
}
function validateRequirements(value){
  if(value===undefined)return; // Missing is unknown, never interpreted as base game.
  const visit=(node,depth=0)=>{if(depth>12||!node||typeof node!=='object'||Array.isArray(node))fail('DATA_REQUIREMENTS_INVALID','Content requirements must be explicit conditions.');
    const keys=Object.keys(node);if(keys.length!==1)fail('DATA_REQUIREMENTS_INVALID','A requirement condition needs exactly one operator.');
    if(keys[0]==='entitlement'){validateDataId(node.entitlement,{namespaced:true});return;}
    if(!['allOf','anyOf'].includes(keys[0])||!Array.isArray(node[keys[0]])||node[keys[0]].length>64)fail('DATA_REQUIREMENTS_INVALID','Unknown requirement condition.');
    for(const child of node[keys[0]])visit(child,depth+1);
  };visit(value);
}

export function createCatalogSnapshot(input,{limits={}}={}){
  const bounds={...DATA_LIMITS,...limits},catalog=checkedJson(input,bounds);
  if(encoder.encode(canonical(catalog)).byteLength>bounds.bytes)fail('DATA_BYTE_LIMIT','The catalog exceeds its byte limit.');
  validateDataId(catalog.catalogId,{namespaced:true});
  for(const key of ['version','defaultLocale','gameBuildRange'])if(typeof catalog[key]!=='string'||!catalog[key])fail('DATA_HEADER_INVALID','Catalog version, locale and explicit build range are required.');
  if(!Array.isArray(catalog.entities)||catalog.entities.length>bounds.entities)fail('DATA_ENTITY_LIMIT','Catalog entity count exceeds its limit.');
  if(!Array.isArray(catalog.sources)||!catalog.sources.length)fail('DATA_PROVENANCE_REQUIRED','Catalog sources must be recorded separately from code licenses.');
  const sources=new Map();for(const s of catalog.sources){source(s);if(sources.has(s.id))fail('DATA_DUPLICATE_ID','Source IDs must be unique.');sources.set(s.id,s);}
  const ids=new Set();for(const entity of catalog.entities){
    validateDataId(entity.id,{namespaced:true});if(ids.has(entity.id))fail('DATA_DUPLICATE_ID','Entity IDs must be unique.');ids.add(entity.id);
    validateDataId(entity.type);if(entity.nativeId!==undefined&&(typeof entity.nativeId!=='string'||!entity.nativeId))fail('DATA_NATIVE_ID_INVALID','Native identifiers must be lossless strings.');
    if(!entity.name||typeof entity.name!=='object'||Array.isArray(entity.name)||!Object.values(entity.name).every(v=>typeof v==='string'))fail('DATA_NAME_INVALID','Names are localization maps, never record identities.');
    if(!sources.has(entity.sourceRef))fail('DATA_SOURCE_MISSING','An entity has no matching provenance source.');
    validateRequirements(entity.requirements);
    for(const id of Object.values(entity.assets||{}))validateDataId(id,{namespaced:true});
    for(const link of entity.links||[]){validateDataId(link.relation);validateDataId(link.targetId,{namespaced:true});}
  }
  for(const entity of catalog.entities){
    if(entity.parentId&&!ids.has(entity.parentId))fail('DATA_REFERENCE_MISSING','An entity parent does not exist in this snapshot.');
    for(const link of entity.links||[])if(!ids.has(link.targetId)&&link.external!==true)fail('DATA_REFERENCE_MISSING','An internal entity link does not exist.');
  }
  const snapshot={...catalog,schema:'saverift.catalog.v1'};delete snapshot.digest;
  const snapshotDigest=digest(snapshot);if(catalog.digest!==undefined&&catalog.digest!==snapshotDigest)fail('DATA_DIGEST_INVALID','The claimed catalog digest does not match its content.');
  return deepFreeze({...snapshot,digest:snapshotDigest});
}

function csvRows(text,limits){
  if(typeof text!=='string'||encoder.encode(text).byteLength>limits.bytes)fail('DATA_BYTE_LIMIT','The CSV import exceeds its byte limit.');
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  const pushCell=()=>{if(cell.length>limits.string)fail('DATA_STRING_LIMIT','A CSV cell exceeds its limit.');row.push(cell);cell='';closed=false;if(row.length>limits.fields)fail('DATA_FIELD_LIMIT','The CSV has too many columns.');};
  const pushRow=()=>{pushCell();if(row.some(x=>x!==''))rows.push(row);row=[];if(rows.length>limits.entities+1)fail('DATA_ENTITY_LIMIT','The CSV has too many rows.');};
  for(let i=0;i<text.length;i++){
    const char=text[i];if(quoted){if(char==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=char;continue;}
    if(char==='"'){if(cell!==''||closed)fail('DATA_CSV_INVALID','A CSV quote must start a field.');quoted=true;continue;}
    if(char===','){pushCell();continue;}if(char==='\n'||char==='\r'){if(char==='\r'&&text[i+1]==='\n')i++;pushRow();continue;}
    if(closed)fail('DATA_CSV_INVALID','Unexpected characters follow a quoted CSV field.');cell+=char;
  }
  if(quoted)fail('DATA_CSV_INVALID','The CSV has an unterminated quoted field.');if(cell!==''||row.length||closed)pushRow();return rows;
}
function rejectFormula(value){if(/^\s*[=@+]/.test(value)||/^\s*-\s*[A-Za-z(]/.test(value)||/[\u0000]/.test(value))fail('DATA_FORMULA_REJECTED','Spreadsheet formulas and NUL fields are not imported.');}
export function importCatalog({format,text,header},{limits={}}={}){
  const bounds={...DATA_LIMITS,...limits};
  if(format==='json')return createCatalogSnapshot(parseJson(text,bounds),{limits:bounds});
  if(format!=='csv')fail('DATA_FORMAT_UNSUPPORTED','Only bounded CSV and JSON imports are implemented.');
  const rows=csvRows(text,bounds);if(!rows.length)fail('DATA_CSV_INVALID','The CSV needs a header row.');
  const columns=rows.shift();if(new Set(columns).size!==columns.length||columns.some(x=>!x||forbidden.has(x)||/[\/\\]/.test(x)))fail('DATA_CSV_INVALID','CSV column names must be unique safe fields.');
  const entities=rows.map(row=>{if(row.length!==columns.length)fail('DATA_CSV_INVALID','CSV rows must match the column count.');const entity={name:{},attributes:{}};
    row.forEach((value,i)=>{rejectFormula(value);const key=columns[i];if(key.startsWith('name.')){const locale=key.slice(5);if(!/^[A-Za-z0-9-]{2,30}$/.test(locale))fail('DATA_CSV_INVALID','Invalid localization column.');entity.name[locale]=value;}
      else if(key.startsWith('attributes.')){const field=key.slice(11);if(!identity.test(field)||forbidden.has(field))fail('DATA_KEY_INVALID','Invalid attribute column.');entity.attributes[field]=value;}
      else if(['requirements','links','assets','applicability'].includes(key)){if(value!=='')entity[key]=parseJson(value,bounds);}
      else if(['id','nativeId','type','sourceRef','parentId'].includes(key)){if(value!=='')entity[key]=value;}
      else fail('DATA_CSV_INVALID','Unknown CSV field. Use attributes.<name> for custom fields.');
    });return entity;
  });
  return createCatalogSnapshot({...checkedJson(header,bounds),entities},{limits:bounds});
}

export function queryCatalog(snapshot,{type,search='',locale=snapshot.defaultLocale,cursor=null,limit=50,ids}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>DATA_LIMITS.query||typeof search!=='string'||search.length>200)fail('DATA_QUERY_INVALID','The catalog query is outside its bounds.');
  const query={type:type??null,search:search.toLocaleLowerCase(),locale,ids:ids??null},queryDigest=digest(query);let offset=0;
  if(ids&&(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string')))fail('DATA_QUERY_INVALID','ID queries are bounded.');
  if(cursor!==null){if(!cursor||cursor.snapshotDigest!==snapshot.digest||cursor.queryDigest!==queryDigest||!Number.isSafeInteger(cursor.offset)||cursor.offset<0)fail('DATA_CURSOR_STALE','The cursor does not match this immutable catalog query.');offset=cursor.offset;}
  const wanted=ids?new Set(ids):null,filtered=snapshot.entities.filter(entity=>(!type||entity.type===type)&&(!wanted||wanted.has(entity.id))&&(!query.search||`${entity.id} ${entity.name[locale]||entity.name[snapshot.defaultLocale]||''}`.toLocaleLowerCase().includes(query.search)));
  return {snapshotDigest:snapshot.digest,entities:filtered.slice(offset,offset+limit),total:filtered.length,nextCursor:offset+limit<filtered.length?{snapshotDigest:snapshot.digest,queryDigest,offset:offset+limit}:null};
}
export function createCrosswalk({id,version,sourceNamespace,targetCatalogDigest,entries,sourceRef}){
  validateDataId(id,{namespaced:true});validateDataId(sourceNamespace,{namespaced:true});if(!pin.test(targetCatalogDigest)||typeof version!=='string'||!sourceRef||!Array.isArray(entries)||entries.length>DATA_LIMITS.entities)fail('DATA_CROSSWALK_INVALID','Crosswalk provenance, exact target digest and entries are required.');
  const seen=new Set();for(const item of entries){if(typeof item.sourceId!=='string'||!item.sourceId||seen.has(item.sourceId))fail('DATA_CROSSWALK_INVALID','A provider ID must have exactly one explicit mapping.');seen.add(item.sourceId);validateDataId(item.targetId,{namespaced:true});}
  const content=checkedJson({id,version,sourceNamespace,targetCatalogDigest,entries,sourceRef});return deepFreeze({...content,digest:digest(content)});
}
export function resolveCrosswalk(crosswalk,providerId,snapshot){if(snapshot.digest!==crosswalk.targetCatalogDigest)fail('DATA_CROSSWALK_STALE','The crosswalk targets a different catalog snapshot.');const row=crosswalk.entries.find(x=>x.sourceId===providerId);if(!row)return {state:'unmapped',providerId};const entity=snapshot.entities.find(x=>x.id===row.targetId);if(!entity)fail('DATA_REFERENCE_MISSING','The mapped target is absent.');return {state:'mapped',entity,crosswalkDigest:crosswalk.digest};}

export function sanitizeSvg(text){
  if(typeof text!=='string'||encoder.encode(text).byteLength>DATA_LIMITS.svgBytes||/[&<!]/.test(text.replace(/<\/?[A-Za-z][^>]*>/g,'')))fail('ASSET_SVG_REJECTED','SVG declarations, entities and malformed markup are forbidden.');
  const tags=new Set(['svg','g','path','circle','rect','line','polyline','polygon','ellipse','title','desc','defs','linearGradient','radialGradient','stop','clipPath']);
  const attrs=new Set(['xmlns','viewBox','width','height','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','d','points','fill','fill-rule','stroke','stroke-width','stroke-linecap','stroke-linejoin','opacity','fill-opacity','stroke-opacity','transform','id','offset','stop-color','stop-opacity','clip-path','gradientUnits','gradientTransform','fx','fy']);
  const stack=[];let count=0,end=0;const token=/<(\/?)([A-Za-z][A-Za-z0-9]*)([^<>]*?)(\/?)>/g;let match;
  while((match=token.exec(text))){if(++count>2048)fail('ASSET_SVG_REJECTED','SVG complexity exceeds its limit.');const between=text.slice(end,match.index);if(between.trim()&&!['title','desc'].includes(stack.at(-1)))fail('ASSET_SVG_REJECTED','SVG text is only permitted in title and description.');end=token.lastIndex;
    const [,closing,tag,raw,self]=match;if(!tags.has(tag))fail('ASSET_SVG_REJECTED','SVG element is not in the neutral-vector allowlist.');
    if(closing){if(raw.trim()||self||stack.pop()!==tag)fail('ASSET_SVG_REJECTED','SVG element nesting is invalid.');continue;}
    if((count===1&&tag!=='svg')||(count>1&&stack.length===0))fail('ASSET_SVG_REJECTED','SVG needs exactly one svg root.');let consumed=0;const seen=new Set();const attribute=/\s+([A-Za-z][A-Za-z0-9-]*)\s*=\s*("[^"]*"|'[^']*')/g;let a;
    while((a=attribute.exec(raw))){if(raw.slice(consumed,a.index).trim()||!attrs.has(a[1])||seen.has(a[1]))fail('ASSET_SVG_REJECTED','SVG attribute is not allowed.');consumed=attribute.lastIndex;seen.add(a[1]);const value=a[2].slice(1,-1);
      if(/[<>&\u0000-\u001f]/.test(value)||/javascript:|data:|@import|expression/i.test(value)||(a[1]!=='xmlns'&&/https?:/i.test(value))||(/url\(/i.test(value)&&!/^url\(#[A-Za-z0-9_-]+\)$/.test(value)))fail('ASSET_SVG_REJECTED','SVG external references and active values are forbidden.');
      if(a[1]==='xmlns'&&value!=='http://www.w3.org/2000/svg')fail('ASSET_SVG_REJECTED','Invalid SVG namespace.');
    }
    if(raw.slice(consumed).trim())fail('ASSET_SVG_REJECTED','SVG attributes must be quoted.');if(!self)stack.push(tag);
  }
  if(!count||stack.length||text.slice(end).trim())fail('ASSET_SVG_REJECTED','SVG document is incomplete.');return text.trim();
}
export function createAssetSnapshot({id,path,mediaType,bytes,source:provenance,width,height}){
  validateDataId(id,{namespaced:true});logicalPath(path);if(!path.startsWith('assets/'))fail('ASSET_PATH_INVALID','Assets must have a logical assets/ path.');source(provenance);
  if(!(bytes instanceof Uint8Array)||bytes.length>DATA_LIMITS.assetBytes)fail('ASSET_BYTE_LIMIT','Asset bytes exceed their limit.');
  if(mediaType==='image/svg+xml')sanitizeSvg(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  else {
    const b=bytes,ok=mediaType==='image/png'?b.length>=24&&b[0]===137&&String.fromCharCode(...b.slice(1,4))==='PNG':mediaType==='image/jpeg'?b.length>=4&&b[0]===255&&b[1]===216&&b[b.length-2]===255&&b[b.length-1]===217:mediaType==='image/webp'?b.length>=12&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP':false;
    if(!ok)fail('ASSET_FORMAT_REJECTED','Only inspected PNG, JPEG, WebP and restricted SVG assets are accepted.');
    const dimensions=rasterDimensions(mediaType,b);if(width!==undefined&&(dimensions.width!==width||dimensions.height!==height))fail('ASSET_DIMENSION_MISMATCH','Raster metadata does not match the image header.');({width,height}=dimensions);
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>8192||height>8192||width*height>16777216)fail('ASSET_DIMENSION_LIMIT','Raster assets require bounded decoded dimensions.');
  }
  return deepFreeze({schema:'saverift.asset.v1',id,path,mediaType,byteLength:bytes.length,sha256:hash(bytes),source:checkedJson(provenance),...(width?{width,height}:{})});
}
function rasterDimensions(type,b){
  const view=new DataView(b.buffer,b.byteOffset,b.byteLength),need=(offset,length)=>{if(offset+length>b.length)fail('ASSET_FORMAT_REJECTED','The image header is truncated.');};
  if(type==='image/png'){need(0,33);if(String.fromCharCode(...b.slice(12,16))!=='IHDR'||view.getUint32(8)!==13)fail('ASSET_FORMAT_REJECTED','The PNG needs a valid IHDR header.');return {width:view.getUint32(16),height:view.getUint32(20)};}
  if(type==='image/jpeg'){
    let offset=2;while(offset<b.length-2){need(offset,2);if(b[offset++]!==255)fail('ASSET_FORMAT_REJECTED','Malformed JPEG header.');while(b[offset]===255)offset++;const marker=b[offset++];if(marker===0xd9||marker===0xda)break;if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;need(offset,2);const length=view.getUint16(offset);if(length<2)fail('ASSET_FORMAT_REJECTED','Invalid JPEG segment length.');need(offset,length);
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){if(length<8)fail('ASSET_FORMAT_REJECTED','Truncated JPEG frame.');return {height:view.getUint16(offset+3),width:view.getUint16(offset+5)};}offset+=length;
    }fail('ASSET_FORMAT_REJECTED','JPEG dimensions are unavailable.');
  }
  const tag=String.fromCharCode(...b.slice(12,16));need(0,30);if(view.getUint32(4,true)+8!==b.length)fail('ASSET_FORMAT_REJECTED','WebP RIFF length does not match.');
  if(tag==='VP8X')return {width:1+b[24]+256*b[25]+65536*b[26],height:1+b[27]+256*b[28]+65536*b[29]};
  if(tag==='VP8 '){if(b[23]!==0x9d||b[24]!==0x01||b[25]!==0x2a)fail('ASSET_FORMAT_REJECTED','Invalid WebP frame header.');return {width:view.getUint16(26,true)&0x3fff,height:view.getUint16(28,true)&0x3fff};}
  if(tag==='VP8L'){if(b[20]!==0x2f)fail('ASSET_FORMAT_REJECTED','Invalid WebP lossless header.');return {width:1+b[21]+((b[22]&0x3f)<<8),height:1+(b[22]>>6)+(b[23]<<2)+((b[24]&0x0f)<<10)};}
  fail('ASSET_FORMAT_REJECTED','Unsupported WebP dimension header.');
}
export function validateCoordinateFrame(frame){
  validateDataId(frame.id,{namespaced:true});if(frame.model!=='affine2d')fail('MAP_TRANSFORM_UNSUPPORTED','This SDK supports only explicitly anchored affine2d transforms.');
  if(!Array.isArray(frame.worldAxes)||frame.worldAxes.length!==2||new Set(frame.worldAxes).size!==2||frame.worldAxes.some(x=>!['x','y','z'].includes(x))||typeof frame.units!=='string'||!frame.units||typeof frame.fieldId!=='string'||!Array.isArray(frame.matrix)||frame.matrix.length!==6||!frame.matrix.every(Number.isFinite))fail('MAP_FRAME_INVALID','Coordinate axes, units, field and transform are required.');
  const [a,b,c,d]=frame.matrix;if(Math.abs(a*d-b*c)<1e-12)fail('MAP_FRAME_INVALID','A coordinate transform must be invertible.');
  if(!Array.isArray(frame.anchors)||frame.anchors.length<3||frame.anchors.length>100||!Number.isFinite(frame.maxAnchorError)||frame.maxAnchorError<0)fail('MAP_ANCHORS_REQUIRED','At least three verified anchors and an explicit error tolerance are required.');
  for(const anchor of frame.anchors){const point=project(frame,anchor.world);if(!anchor.evidence||!Number.isFinite(anchor.map?.x)||!Number.isFinite(anchor.map?.y)||Math.hypot(point.x-anchor.map.x,point.y-anchor.map.y)>frame.maxAnchorError)fail('MAP_ANCHOR_MISMATCH','A coordinate anchor is missing evidence or does not match.');}
  const points=frame.anchors.map(anchor=>frame.worldAxes.map(axis=>anchor.world[axis])),first=points[0],second=points.find(point=>Math.hypot(point[0]-first[0],point[1]-first[1])>1e-8);
  if(!second||!points.some(point=>Math.abs((second[0]-first[0])*(point[1]-first[1])-(second[1]-first[1])*(point[0]-first[0]))>1e-8))fail('MAP_ANCHORS_REQUIRED','Transform anchors must include three independent non-collinear positions.');
  return true;
}
function project(frame,point){const u=point?.[frame.worldAxes[0]],v=point?.[frame.worldAxes[1]];if(!Number.isFinite(u)||!Number.isFinite(v))fail('MAP_POINT_INVALID','World coordinates must be finite.');const [a,b,c,d,e,f]=frame.matrix;return {x:a*u+c*v+e,y:b*u+d*v+f};}
export function transformCoordinates(frame,point){validateCoordinateFrame(frame);return {...project(frame,point),fieldId:frame.fieldId,frameId:frame.id,frameDigest:digest(frame),heightState:'not_inferred'};}
