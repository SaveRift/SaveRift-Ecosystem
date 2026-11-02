// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogSnapshot,importCatalog,queryCatalog,createCrosswalk,resolveCrosswalk,sanitizeSvg,createAssetSnapshot,transformCoordinates} from '../data.mjs';
const provenance={id:'source.synthetic',revision:'1',license:'CC0-1.0',attribution:'Synthetic test data',retrievalMethod:'generated test fixture'};
const header={catalogId:'example.reference',version:'1',gameBuildRange:'synthetic-v1',defaultLocale:'en',sources:[provenance]};
const entity=(id='example:item:sword',extra={})=>({id,type:'item',nativeId:'18446744073709551615',name:{en:'Sword'},sourceRef:provenance.id,requirements:{allOf:[]},attributes:{rarity:'common'},...extra});
const catalog=(entities=[entity()])=>createCatalogSnapshot({...header,entities});
const error=code=>value=>value.code===code;

test('catalog snapshots preserve arbitrary systems, high integer IDs and unknown versus empty requirements',()=>{
  const snapshot=catalog([entity(),entity('example:faction:river',{type:'community.faction',attributes:{reputation:-25,alignment:{state:'absent'}},requirements:undefined})].map(x=>{if(x.requirements===undefined)delete x.requirements;return x;}));
  assert.equal(snapshot.entities[0].nativeId,'18446744073709551615');
  assert.equal(snapshot.entities[1].type,'community.faction');assert.equal(Object.hasOwn(snapshot.entities[1],'requirements'),false);
  assert.equal(snapshot.digest,catalog(snapshot.entities).digest);assert.ok(Object.isFrozen(snapshot.entities[1].attributes));
  assert.throws(()=>catalog([entity('example:x',{nativeId:18446744073709551615})]),error('DATA_NUMBER_INVALID'));
  assert.throws(()=>catalog([entity(),entity()]),error('DATA_DUPLICATE_ID'));
});
test('catalog import rejects malformed JSON, prototype pollution, excessive input and unverified provenance',()=>{
  assert.throws(()=>importCatalog({format:'json',text:'{'}),error('DATA_JSON_INVALID'));
  assert.throws(()=>importCatalog({format:'json',text:'{"__proto__": {"polluted": true}}'}),error('DATA_KEY_INVALID'));
  assert.throws(()=>importCatalog({format:'json',text:' '.repeat(100)},{limits:{bytes:99}}),error('DATA_BYTE_LIMIT'));
  assert.throws(()=>createCatalogSnapshot({...header,sources:[],entities:[]}),error('DATA_PROVENANCE_REQUIRED'));
  assert.throws(()=>createCatalogSnapshot({...header,entities:[entity()],digest:'a'.repeat(64)}),error('DATA_DIGEST_INVALID'));
  assert.equal({}.polluted,undefined);
});
test('CSV parser handles quoted newlines and preserves custom data, rejects formulas and unsafe headers',()=>{
  const text='id,type,nativeId,name.en,attributes.description,sourceRef\r\nexample:item:a,item,18446744073709551615,"Sword, fine","Line one\nLine ""two""",source.synthetic';
  const result=importCatalog({format:'csv',text,header});assert.equal(result.entities[0].name.en,'Sword, fine');assert.equal(result.entities[0].attributes.description,'Line one\nLine "two"');
  assert.equal(result.entities[0].nativeId,'18446744073709551615');
  assert.throws(()=>importCatalog({format:'csv',text:'id,type,name.en,sourceRef\nexample:item:a,item,=HYPERLINK("evil"),source.synthetic',header}),error('DATA_CSV_INVALID'));
  assert.throws(()=>importCatalog({format:'csv',text:'id,type,name.en,sourceRef\nexample:item:a,item,+CMD,source.synthetic',header}),error('DATA_FORMULA_REJECTED'));
  assert.throws(()=>importCatalog({format:'csv',text:'id,type,name.en,sourceRef\nexample:item:a,item,"=HYPERLINK(""evil"")",source.synthetic',header}),error('DATA_FORMULA_REJECTED'));
  assert.throws(()=>importCatalog({format:'csv',text:'id,id\na,a',header}),error('DATA_CSV_INVALID'));
  assert.throws(()=>importCatalog({format:'csv',text:'id,__proto__\na,a',header}),error('DATA_CSV_INVALID'));
  assert.throws(()=>importCatalog({format:'csv',text:'id,type,name.en\na,item,"unterminated',header}),error('DATA_CSV_INVALID'));
});
test('raster asset dimensions come from the bounded file header, never an author claim',()=>{
  const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));
  const asset=createAssetSnapshot({id:'asset.pixel',path:'assets/pixel.png',mediaType:'image/png',bytes,source:provenance});assert.equal(asset.width,1);assert.equal(asset.height,1);
  assert.throws(()=>createAssetSnapshot({id:'asset.pixel',path:'assets/pixel.png',mediaType:'image/png',bytes,source:provenance,width:100,height:100}),error('ASSET_DIMENSION_MISMATCH'));
  const huge=bytes.slice();new DataView(huge.buffer).setUint32(16,1000000);assert.throws(()=>createAssetSnapshot({id:'asset.pixel',path:'assets/pixel.png',mediaType:'image/png',bytes:huge,source:provenance}),error('ASSET_DIMENSION_LIMIT'));
});
test('pagination is tied to immutable content and exact query',()=>{
  const snapshot=catalog([entity('example:item:a'),entity('example:item:b'),entity('example:item:c',{name:{en:'Axe'}})]);
  const first=queryCatalog(snapshot,{search:'sword',limit:1});assert.equal(first.total,2);assert.equal(first.entities.length,1);
  assert.equal(queryCatalog(snapshot,{search:'sword',limit:1,cursor:first.nextCursor}).entities[0].id,'example:item:b');
  assert.throws(()=>queryCatalog(snapshot,{search:'axe',cursor:first.nextCursor}),error('DATA_CURSOR_STALE'));
  assert.throws(()=>queryCatalog(catalog(),{search:'sword',cursor:first.nextCursor}),error('DATA_CURSOR_STALE'));
  assert.throws(()=>queryCatalog(snapshot,{limit:101}),error('DATA_QUERY_INVALID'));
});
test('crosswalks require exact provider IDs and catalog digests; names are never fuzzy-joined',()=>{
  const snapshot=catalog(),crosswalk=createCrosswalk({id:'example.crosswalk',version:'1',sourceNamespace:'provider.one',targetCatalogDigest:snapshot.digest,entries:[{sourceId:'item_0001',targetId:entity().id}],sourceRef:provenance.id});
  assert.equal(resolveCrosswalk(crosswalk,'item_0001',snapshot).state,'mapped');assert.equal(resolveCrosswalk(crosswalk,'Sword',snapshot).state,'unmapped');
  assert.throws(()=>resolveCrosswalk(crosswalk,'item_0001',catalog([entity('example:item:other')])),error('DATA_CROSSWALK_STALE'));
  assert.throws(()=>createCrosswalk({...crosswalk,entries:[{sourceId:'one',targetId:entity().id},{sourceId:'one',targetId:'example:item:two'}]}),error('DATA_CROSSWALK_INVALID'));
});
test('restricted neutral SVG assets exclude script, links, active CSS, entities and extra roots',()=>{
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>Item</title><path d="M0 0 L10 10" stroke="#fff"/></svg>';
  assert.equal(sanitizeSvg(svg),svg);
  const bytes=new TextEncoder().encode(svg),asset=createAssetSnapshot({id:'asset.synthetic',path:'assets/item.svg',mediaType:'image/svg+xml',bytes,source:provenance});assert.equal(asset.byteLength,bytes.length);assert.match(asset.sha256,/^[a-f0-9]{64}$/);
  for(const unsafe of ['<svg><script>alert(1)</script></svg>','<svg onload="alert(1)"/>','<svg><image href="https://evil"/></svg>','<!DOCTYPE svg><svg/>','<svg><path fill="url(https://evil)"/></svg>','<svg/><svg/>','<svg><title>&evil;</title></svg>'])assert.throws(()=>sanitizeSvg(unsafe),error('ASSET_SVG_REJECTED'));
  assert.throws(()=>createAssetSnapshot({id:'asset.synthetic',path:'assets/../private',mediaType:'image/svg+xml',bytes,source:provenance}),error('PACKAGE_PATH_INVALID'));
});
test('map transforms require verified anchors, explicit axes and never invent height',()=>{
  const frame={id:'map.synthetic',model:'affine2d',fieldId:'field-main',worldAxes:['x','z'],units:'metres',matrix:[2,0,0,-2,100,200],maxAnchorError:0,anchors:[{world:{x:0,z:0},map:{x:100,y:200},evidence:'synthetic'},{world:{x:1,z:0},map:{x:102,y:200},evidence:'synthetic'},{world:{x:0,z:1},map:{x:100,y:198},evidence:'synthetic'}]};
  const mapped=transformCoordinates(frame,{x:10,y:999,z:20});assert.equal(mapped.x,120);assert.equal(mapped.y,160);assert.equal(mapped.heightState,'not_inferred');assert.equal(Object.hasOwn(mapped,'z'),false);
  assert.throws(()=>transformCoordinates({...frame,anchors:[]},{x:0,z:0}),error('MAP_ANCHORS_REQUIRED'));
  assert.throws(()=>transformCoordinates({...frame,matrix:[2,0,0,-2,99,200]},{x:0,z:0}),error('MAP_ANCHOR_MISMATCH'));
  assert.throws(()=>transformCoordinates({...frame,model:'decorative-image'},{x:0,z:0}),error('MAP_TRANSFORM_UNSUPPORTED'));
});
