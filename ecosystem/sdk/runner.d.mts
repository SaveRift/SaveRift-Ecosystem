import type {PackageInput,SaveBundle,ExecutionLock,JsonValue,Digest,ProgressEvent,Candidate,PlanInput,QueryRequest} from './contracts.mjs';
export interface RunOptions{package:PackageInput;bundle?:SaveBundle;artifacts?:Map<string,Uint8Array>|Record<string,Uint8Array>;executionLock:ExecutionLock;limits?:Record<string,number>;signal?:AbortSignal;clock?:number}
export interface RunnerMetrics{runner:string;engine:string;packageDigest:Digest;executionLockDigest:Digest;inputBytes:number;outputBytes:number;interrupts:number;hostCalls:number;elapsedMs:number;memoryBytes:number;contextsCreated:number;cryptoBytes?:number;cryptoPeakStreams?:number;cryptoLiveStreams?:number;disposalFailed?:boolean}
export interface HostAdapter{wasmModule?:WebAssembly.Module;instantiateModule?:(variant:unknown)=>Promise<unknown>;onProgress?:(event:ProgressEvent)=>void;catalogQuery?:(query:JsonValue,context:{executionLock:ExecutionLock})=>JsonValue}
export type RuntimeArgument=JsonValue|SaveBundle|Candidate|PlanInput|QueryRequest;
export interface PluginSession{packageDigest:Digest;executionLock:ExecutionLock;bundle:SaveBundle;call(method:string,args?:RuntimeArgument[]):Promise<JsonValue>;artifacts():Map<string,Uint8Array>;metrics():RunnerMetrics;close():void}
export function createExecutionLock(input:PackageInput):ExecutionLock;
export function createPluginSession(options:RunOptions,host?:HostAdapter):Promise<PluginSession>;
export function runPlugin(options:RunOptions&{method:string;args?:RuntimeArgument[];input?:JsonValue},host?:HostAdapter):Promise<{result:JsonValue;artifacts:Map<string,Uint8Array>;metrics:RunnerMetrics;executionLock:ExecutionLock}>;
