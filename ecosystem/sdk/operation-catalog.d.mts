import type {PackageInput,Digest,JsonValue} from './contracts.mjs';
export interface PinnedOperationDefinition{id:string;apiVersion:string;owner:string;packageDigest:Digest;schemaDigest:Digest;writeDomains:{path:string;mode:'exclusive'|'ordered'}[];requires:string[];validate(value:JsonValue):boolean}
export function createOperationCatalog(packages:readonly PackageInput[]):PinnedOperationDefinition[];
