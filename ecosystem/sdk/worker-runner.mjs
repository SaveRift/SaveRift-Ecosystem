// Attached as a fixed, reviewed static Wasm module by the Worker build.
import wasmModule from '@jitl/quickjs-wasmfile-release-sync/wasm';
import {runPlugin,createPluginSession} from './runner.mjs';
export const runPluginWorker=(options,host={})=>runPlugin(options,{onProgress:host.onProgress,catalogQuery:host.catalogQuery,wasmModule});
export const createPluginSessionWorker=(options,host={})=>createPluginSession(options,{onProgress:host.onProgress,catalogQuery:host.catalogQuery,wasmModule});
