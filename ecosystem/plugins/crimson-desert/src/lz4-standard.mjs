// BSD-2-Clause kernel and upstream attribution are retained in sdk/lz4-block.mjs.
// This portable wrapper uses one fixed pure helper when the trusted host offers it.
import {Buffer} from '../../../sdk/buffer.mjs';
import {compressStandardLz4Block,STANDARD_LZ4_PROFILE} from '../../../sdk/lz4-block.mjs';
export {STANDARD_LZ4_PROFILE};
export function compressStandardLz4(data){
 if(!(data instanceof Uint8Array)||data.length<1||data.length>8*1024*1024)throw new RangeError('Standard LZ4 input must be 1 byte to 8 MiB.');
 if(typeof globalThis.__saveriftLz4Compress!=='function')return compressStandardLz4Block(data);
 const input=data.byteOffset===0&&data.byteLength===data.buffer.byteLength?data.buffer:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
 return Buffer.from(globalThis.__saveriftLz4Compress(input));
}
