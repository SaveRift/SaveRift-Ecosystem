// SPDX-License-Identifier: Apache-2.0
import {validatePackage,logicalPath,fail} from './contracts.mjs';
import {compileSchema,parseSchemaJson} from './schema.mjs';
/** Resolve only exact packaged schemas. The host, never the UI, supplies these packages. */
export function createOperationCatalog(packages){
 if(!Array.isArray(packages)||packages.length>32)fail('OPERATION_CATALOG_INVALID','A bounded exact package list is required.');
 const seen=new Set(),out=[];
 for(const input of packages){
  const pkg=validatePackage(input);const declarations=pkg.manifest.operations||[];
  if(!Array.isArray(declarations)||declarations.length>1024)fail('OPERATION_CATALOG_INVALID','The operation declaration count exceeds the limit.');
  for(const op of declarations){
   if(!op||typeof op!=='object'||typeof op.id!=='string'||typeof op.apiVersion!=='string'||!Array.isArray(op.writeDomains)||!op.writeDomains.length||!Object.hasOwn(op,'inputSchema'))fail('OPERATION_SCHEMA_REQUIRED','Stageable operations need a pinned schema, domain and API version.');
   const key=op.id+'@'+op.apiVersion;if(seen.has(key))fail('OPERATION_OWNER_AMBIGUOUS','Two packages declare the same operation.');seen.add(key);
   let schema=op.inputSchema;
   if(typeof schema==='string'){
    const path=logicalPath(schema),bytes=pkg.files.get(path);if(!bytes||bytes.byteLength>128*1024)fail('OPERATION_SCHEMA_UNAVAILABLE','The pinned operation schema is missing or too large.');
    schema=parseSchemaJson(bytes);
   }
   const compiled=compileSchema(schema);
   out.push({id:op.id,apiVersion:op.apiVersion,owner:pkg.manifest.id,packageDigest:pkg.packageDigest,schemaDigest:compiled.schemaDigest,writeDomains:op.writeDomains.map(x=>({...x})),requires:op.requires||[],validate:compiled.validate});
   if(out.length>1024)fail('OPERATION_CATALOG_INVALID','The combined operation catalog exceeds the limit.');
  }
 }
 return out;
}
