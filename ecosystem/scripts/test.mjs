// SPDX-License-Identifier: Apache-2.0
import {readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
export async function findPublicTests(root){
 const files=[],folders=['sdk/test','sdk/tests','workbench/test','workbench/tests','collaboration/test','collaboration/tests','ui/test','ui/tests','registry/test','registry/tests','tests'];
 let plugins=[];try{plugins=await readdir(resolve(root,'plugins'),{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
 for(const plugin of plugins)if(plugin.isDirectory()&&!plugin.name.startsWith('.'))for(const suffix of ['test','tests'])folders.push('plugins/'+plugin.name+'/'+suffix);
 async function collect(path){let entries;try{entries=await readdir(path,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}for(const item of entries){if(item.name.startsWith('.')||['node_modules','dist'].includes(item.name))continue;const child=resolve(path,item.name);if(item.isDirectory())await collect(child);else if(item.isFile()&&item.name.endsWith('.test.mjs'))files.push(relative(root,child));}}
 for(const folder of folders)await collect(resolve(root,folder));return [...new Set(files)].sort();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('..',import.meta.url)),files=await findPublicTests(root);if(!files.length)throw Error('No public ecosystem tests were found.');
 const result=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});if(result.error)throw result.error;process.exitCode=result.status??1;
}
