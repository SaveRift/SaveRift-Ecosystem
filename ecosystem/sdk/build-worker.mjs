// Trusted build tool. No package scripts or workspace code execute here.
import {build} from 'esbuild';
import {copyFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function buildWorkerRunner({entrypoint,outdir,external=[]}){
  if(!Array.isArray(external)||external.some(name=>!['node:crypto','node:buffer'].includes(name)))throw new Error('Only explicit trusted Worker host crypto/buffer imports may remain external.');
  await mkdir(outdir,{recursive:true});
  await build({entryPoints:[entrypoint],outfile:path.join(outdir,'index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',conditions:['workerd','browser'],external,legalComments:'eof',plugins:[{name:'fixed-quickjs-wasm',setup(api){api.onResolve({filter:/^@jitl\/quickjs-wasmfile-release-sync\/wasm$/},()=>({path:'./quickjs.wasm',external:true}));}}]});
  await copyFile(fileURLToPath(import.meta.resolve('@jitl/quickjs-wasmfile-release-sync/wasm')),path.join(outdir,'quickjs.wasm'));
  await writeFile(path.join(outdir,'config.capnp'),`using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [(name = "main", worker = (
    compatibilityDate = "2026-11-02",
    modules = [(name = "index.js", esModule = embed "index.js"), (name = "quickjs.wasm", wasm = embed "quickjs.wasm")]
  ))],
  sockets = [(name = "http", address = "127.0.0.1:8080", http = (), service = "main")]
);
`);
  return {script:path.join(outdir,'index.js'),wasm:path.join(outdir,'quickjs.wasm'),config:path.join(outdir,'config.capnp')};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [entrypoint,outdir]=process.argv.slice(2);if(!entrypoint||!outdir)throw new Error('Usage: node build-worker.mjs <entrypoint> <outdir>');await buildWorkerRunner({entrypoint:path.resolve(entrypoint),outdir:path.resolve(outdir)});
}
