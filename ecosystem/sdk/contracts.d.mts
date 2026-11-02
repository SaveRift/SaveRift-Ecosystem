export type JsonValue=null|boolean|number|string|readonly JsonValue[]|{[key:string]:JsonValue};
export type JsonObject={[key:string]:JsonValue};
export type Digest=string;
export type DecimalInteger=string;
export type ArtifactId=string;
export type DocumentHandle=string|JsonObject;
export type Presence<T>={state:'present';value:T}|{state:'absent'}|{state:'unknown';reason:string};
export interface SaveArtifact{id:ArtifactId;logicalPath:string;role:string;byteLength:number;sha256:Digest}
export interface SaveBundle{id:string;bundleDigest:Digest;artifacts:readonly SaveArtifact[];hints:{gameIdentity?:string;platform?:string;build?:string;locale?:string}}
export interface Operation{id:string;apiVersion:string;params:JsonValue}
export interface PlanInput{operations:readonly Operation[];operationDigest:Digest}
export interface QueryRequest{method:string;args:JsonObject}
export interface ValidationCheck{id:string;result:'passed'|'failed'|'not_run'|'not_applicable';required?:boolean;details?:JsonValue}
export interface ValidationReport{schema:string;checks:readonly ValidationCheck[];[key:string]:JsonValue|readonly ValidationCheck[]}
export interface Candidate{id:string;inputBundleDigest:Digest;executionLockDigest:Digest;operationDigest:Digest;outputs:readonly SaveArtifact[];retainedInputArtifacts:readonly ArtifactId[];changeSummaryRef:ArtifactId;validationReportRef:ArtifactId;requirementsRef:ArtifactId}
export interface PackagePin{id:string;version:string;digest:Digest}
export interface ExecutionLock{schema:'saverift.execution-lock.v1';connector:PackagePin;extensions:readonly PackagePin[];dataPacks:readonly PackagePin[];hostApi:'0.1.0';runnerProfile:'isolated-js-v1';digest:Digest}
export interface OperationDescription{id:string;apiVersion:string;inputSchema:JsonObject;writeDomains:readonly string[];[key:string]:JsonValue}
export interface FeatureDescription{operations:readonly OperationDescription[];queries:readonly string[];views:readonly JsonObject[];extensionApis:{[name:string]:string};[key:string]:JsonValue|readonly OperationDescription[]|readonly JsonObject[]}
export interface DetectionResult{state:'supported'|'recognized_unsupported'|'not_a_match'|'ambiguous';evidence:JsonObject;requiredRoles:readonly string[];[key:string]:JsonValue}
export interface ProgressEvent{phase:string;completed:number;total?:number}
export interface PluginContext{
  readArtifact(id:ArtifactId,options?:{offset?:number;length?:number}):Uint8Array;
  writeArtifact(metadata:{logicalPath:string;role?:string},bytes:Uint8Array):SaveArtifact;
  randomBytes(length:number):Uint8Array;
  reportProgress(event:ProgressEvent):void;
  checkCancelled():void;
  clock():number;
  catalogQuery(query:JsonObject):JsonValue;
  executionLock:ExecutionLock;
  bundleDigest:Digest;
}
export interface GameConnector{
  detect(bundle:SaveBundle,ctx:PluginContext):Promise<DetectionResult>|DetectionResult;
  open(bundle:SaveBundle,ctx:PluginContext):Promise<DocumentHandle>|DocumentHandle;
  describe(document:DocumentHandle,ctx:PluginContext):Promise<FeatureDescription>|FeatureDescription;
  query(document:DocumentHandle,query:QueryRequest,ctx:PluginContext):Promise<JsonValue>|JsonValue;
  plan(bundle:SaveBundle,input:PlanInput,ctx:PluginContext):Promise<Candidate>|Candidate;
  validate(original:SaveBundle,candidate:Candidate,ctx:PluginContext):Promise<ValidationReport>|ValidationReport;
  close(document:DocumentHandle,ctx:PluginContext):Promise<void>|void;
}
export interface PackageManifest{manifestVersion:'0.1';id:string;kind?:'game'|'extension'|'data'|'assets'|'preset'|'ui';version:string;entrypoints?:{runtime?:string;runtimeProfile?:'isolated-js-v1';ui?:string};methods?:readonly string[];[key:string]:JsonValue|undefined}
export interface PackageInput{manifest:PackageManifest;files:Map<string,string|Uint8Array>|Record<string,string|Uint8Array>;packageDigest?:Digest}
export interface ValidatedPackage{manifest:Readonly<PackageManifest>;files:Map<string,Uint8Array>;packageDigest:Digest;descriptors:readonly {path:string;byteLength:number;sha256:Digest}[];byteLength:number}
export const SDK_VERSION:'0.1.0';
export const RUNTIME_PROFILE:'isolated-js-v1';
export const LIFECYCLE:readonly string[];
export const LIMITS:Readonly<Record<string,number>>;
export class PluginError extends Error{code:string;constructor(code:string,message:string)}
export function canonical(value:JsonValue):string;
export function digest(value:JsonValue):Digest;
export function hash(value:Uint8Array|string):Digest;
export function jsonCopy<T extends JsonValue>(value:T,max?:number):T;
export function logicalPath(path:string):string;
export function artifactBytes(value:Uint8Array):Uint8Array;
export function validateOperation(value:Operation):Operation;
export function validatePackage(input:PackageInput,limits?:Readonly<Record<string,number>>):ValidatedPackage;
export function createSaveBundle(artifacts:readonly SaveArtifact[],options?:{id?:string;hints?:SaveBundle['hints']}):SaveBundle;
