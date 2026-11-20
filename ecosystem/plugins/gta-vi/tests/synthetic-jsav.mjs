// SPDX-License-Identifier: Apache-2.0
// Synthetic fixture only. No player save bytes are checked into this repository.
export function makeSyntheticJsav({healthToken='130'}={}){
  const code=`{"$0x7a47cb05":{"$0x0834e1d0":${healthToken}}}`;
  const script='{"$0x24d043f2":{"$0x818f6f6d":0}}';
  const prefix='{"CodeSaveBlocks":[\r\n';
  const middle='],"ScriptSaveBlocks":[\r\n';
  const suffix=']}';
  const start=16+2*20+8;
  const codeAt=start+Buffer.byteLength(prefix);
  const scriptAt=codeAt+Buffer.byteLength(code+middle);
  const document=Buffer.from(prefix+code+middle+script+suffix);
  const bytes=Buffer.alloc(start+document.length+16);
  bytes.write('JSAV');
  bytes.writeUInt32LE(3,4);
  bytes.writeUInt32LE(1,8);
  bytes.writeUInt32LE(1,12);
  bytes.writeUInt32LE(0x0834e1d0,16);
  bytes.writeUInt32LE(1,20);
  bytes.writeUInt32LE(codeAt,28);
  bytes.writeUInt32LE(Buffer.byteLength(code),32);
  bytes.writeUInt32LE(0x818f6f6d,36);
  bytes.writeUInt32LE(1,40);
  bytes.writeUInt32LE(scriptAt,48);
  bytes.writeUInt32LE(Buffer.byteLength(script),52);
  document.copy(bytes,start);
  return bytes;
}
