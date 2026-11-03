// SPDX-License-Identifier: Apache-2.0
// Explicit LOCAL authoring utility, not a workbench host or plugin primitive.
// Consumes a previously obtained external extraction. No DLL, game code,
// credentials, network transport or proprietary decompressor is distributed.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,relative,sep,basename,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inspectNativeContainer,seededCrc,transformPayload,decodeContext} from '../src/native-container.mjs';
import {parseProgression} from '../src/typed-context.mjs';

const args=process.argv.slice(2),opts={};
for(let i=0;i<args.length;i+=2){if(!['--input','--decoded','--contexts','--output-dir'].includes(args[i])||!args[i+1]||opts[args[i]])throw Error('Usage: node prepare-native.mjs --input original.save --decoded extraction.bin --contexts contexts.json --output-dir PRIVATE_NEW_DIRECTORY');opts[args[i]]=args[i+1];}
if(Object.keys(opts).length!==4)throw Error('All four arguments are required. Extraction files must come from your authorized, independently verified source.');
const checkout=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
const outside=p=>{p=resolve(p);const r=relative(checkout,p);if(r!=='..'&&!r.startsWith(`..${sep}`)&&!isAbsolute(r))throw Error('Private inputs and outputs must be outside the source checkout.');return p;};
const input=outside(opts['--input']),decodedPath=outside(opts['--decoded']),manifestPath=outside(opts['--contexts']),out=outside(opts['--output-dir']);
if(await stat(out).then(()=>true,()=>false))throw Error('Output directory already exists; refusing to overwrite.');
const original=new Uint8Array(await readFile(input)),decoded=new Uint8Array(await readFile(decodedPath));
const sha=b=>createHash('sha256').update(b).digest('hex');
if(original.length!==decoded.length+40||new DataView(original.buffer).getBigUint64(0,true)!==36n)throw Error('Unsupported original wrapper/extraction size.');
const inspection=inspectNativeContainer(decoded),target=inspection.contexts[12];
if(!target)throw Error('Progression context missing.');
// Establish the exact source pairing without reading or logging account IDs.
const baseKey=new Uint8Array(16),rotation=decoded.length%16;
for(let i=0;i<16;i++)baseKey[(i-rotation+16)%16]=original[40+i]^decoded[i];
const paired=transformPayload(original.subarray(40),baseKey);
if(!paired.every((b,i)=>b===decoded[i]))throw Error('Extraction does not belong to the selected original file.');
const manifest=JSON.parse((await readFile(manifestPath,'utf8')).replace(/^\uFEFF/,''));
const rows=manifest.filter(r=>r.context===12&&r.magic_offset===target.magic&&r.end_offset===target.end);
if(rows.length!==1)throw Error('Ambiguous or mismatched extraction manifest.');
const row=rows[0],plain=new Uint8Array(await readFile(outside(row.output)));
if(row.bytes!==target.plainSize||plain.length!==target.plainSize||sha(plain)!==row.sha256||row.blocks.length!==target.blocks.length)throw Error('Extraction metadata mismatch.');
for(let i=0;i<target.blocks.length;i++){const b=target.blocks[i],r=row.blocks[i];if(r.offset!==b.offset||r.uncompressed!==b.plain||r.compressed!==b.packed||r.flag!==b.flag||r.sha256!==sha(plain.subarray(b.plainOffset,b.plainOffset+b.plain)))throw Error('Extraction block binding mismatch.');}
const parsed=parseProgression(plain),parts=[decoded.subarray(target.start,target.magic+15)];
for(const b of target.blocks){const head=new Uint8Array(5);new DataView(head.buffer).setUint32(1,b.plain,true);parts.push(head,plain.subarray(b.plainOffset,b.plainOffset+b.plain));}
const join=parts=>{const b=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let p=0;for(const a of parts){b.set(a,p);p+=a.length;}return b;};
const record=join(parts);new DataView(record.buffer).setUint32(8,record.length-12,true);
const prepared=join([decoded.subarray(0,target.start),record,decoded.subarray(target.end)]),v=new DataView(prepared.buffer);
v.setUint32(16,seededCrc(prepared,20,prepared.length-4),true);v.setUint32(prepared.length-4,seededCrc(prepared,0,prepared.length-4,0x82f63b78),true);
const checked=inspectNativeContainer(prepared),reopened=decodeContext(prepared,checked.contexts[12]);
if(!reopened.every((b,i)=>b===plain[i]))throw Error('Stored-context mismatch.');
for(let i=0;i<inspection.contexts.length;i++){if(i===12)continue;const a=inspection.contexts[i],b=checked.contexts[i];if(sha(decoded.subarray(a.start,a.end))!==sha(prepared.subarray(b.start,b.end)))throw Error('Unrelated native record changed.');}
const output=join([original.subarray(0,40),transformPayload(prepared,baseKey)]);
if(output.length>8*1024*1024)throw Error('Prepared save exceeds the default isolated artifact limit; no output written.');
await mkdir(out,{recursive:true});
await writeFile(resolve(out,basename(input)),output,{flag:'wx'});
await writeFile(resolve(out,'private-transform.ac-key'),baseKey,{flag:'wx',mode:0o600});
const receipt={schema:'saverift.ac-shadows.local-preparation.v1',originalSha256:sha(original),preparedSha256:sha(output),originalBytes:original.length,preparedBytes:output.length,version:54,contextIndex:12,contexts:inspection.contexts.length,inventoryRecords:parsed.records.length,progressionSha256:sha(plain),unrelatedContextBytesPreserved:true,wrapperPreserved:true,inventoryPlaintextPreserved:true,externalDecompression:'selected prior extraction; independent Oodle oracle still required',runtimeRequirement:'Select prepared save as main and private-transform.ac-key as ac-key; key must never be published',inGame:'not_run',recovery:'not_run'};
await writeFile(resolve(out,'preparation-receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
process.stdout.write(JSON.stringify(receipt)+'\n');
