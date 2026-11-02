// SPDX-License-Identifier: Apache-2.0
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,relative} from 'node:path';
import {build} from 'esbuild';
import {validatePackage} from '../../../sdk/contracts.mjs';
import {buildCustomUi} from '../../../ui/build-ui.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
let uiBuild;
export async function buildCrimsonPackage({write=true}={}){
 uiBuild??=buildCustomUi({entry:resolve(root,'ui/index.jsx'),outputDirectory:resolve(root,'ui/dist')});await uiBuild;
 const compiled=await build({absWorkingDir:root,entryPoints:[resolve(root,'connector.mjs')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',legalComments:'inline',treeShaking:true,metafile:true});
 const source=compiled.outputFiles[0].text;if(/(?:from\s*|import\s*\()['"](?:node:|https?:|\.{1,2}\/)/.test(source))throw Error('The runtime bundle is not self-contained.');
 const manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8')),files={'runtime/connector.mjs':source};
 for(const name of await readdir(resolve(root,'licenses')))files['licenses/'+name]=await readFile(resolve(root,'licenses',name),'utf8');
 for(const name of ['NOTICE','README.md','DEVELOPER_API.md','data/provider-requirements.json'])files[name]=await readFile(resolve(root,name),'utf8');
 for(const name of ['ui/index.html','ui/dist/entry.js','ui/dist/style.css']){
  try{files[name]=await readFile(resolve(root,name),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;throw Error('Build the public Crimson custom UI before packaging: missing '+name);}
 }
 const pkg=validatePackage({manifest,files});
 if(write){await mkdir(resolve(root,'runtime'),{recursive:true});await writeFile(resolve(root,'runtime/connector.mjs'),source);await writeFile(resolve(root,'package-lock.generated.json'),JSON.stringify({schema:'saverift.package-build.v1',packageDigest:pkg.packageDigest,byteLength:pkg.byteLength,files:pkg.descriptors,inputs:Object.keys(compiled.metafile.inputs).map(p=>relative(root,resolve(root,p))).sort()},null,2)+'\n');}
 return {manifest,files,packageDigest:pkg.packageDigest};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const p=await buildCrimsonPackage();process.stdout.write(JSON.stringify({id:p.manifest.id,packageDigest:p.packageDigest,files:Object.keys(p.files).length})+'\n');}
