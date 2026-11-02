import type {Digest,JsonValue} from './contracts.mjs';
export type JsonSchema=boolean|{[keyword:string]:JsonValue};
export const SCHEMA_LIMITS:Readonly<Record<string,number>>;
export class SchemaError extends Error{code:string;constructor(code:string)}
export interface CompiledSchema{readonly schemaDigest:Digest;validate(value:JsonValue):boolean;assert<T extends JsonValue>(value:T):T}
export function parseSchemaJson(input:string|Uint8Array):JsonSchema;
export function compileSchema(schema:JsonSchema,options?:{limits?:Partial<typeof SCHEMA_LIMITS>}):CompiledSchema;
