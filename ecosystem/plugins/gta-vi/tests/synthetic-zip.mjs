// SPDX-License-Identifier: Apache-2.0
// Build tiny stored ZIPs for tests; never embeds a player save.
function crc32(bytes){
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}

export function makeStoredZip(files){
  const locals=[],central=[];
  let offset=0;
  for(const [name,value] of files){
    const data=Buffer.from(value),label=Buffer.from(name),crc=crc32(data);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);
    local.writeUInt32LE(crc,14);
    local.writeUInt32LE(data.length,18);
    local.writeUInt32LE(data.length,22);
    local.writeUInt16LE(label.length,26);
    locals.push(local,label,data);
    const entry=Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50,0);
    entry.writeUInt16LE(20,4);
    entry.writeUInt16LE(20,6);
    entry.writeUInt32LE(crc,16);
    entry.writeUInt32LE(data.length,20);
    entry.writeUInt32LE(data.length,24);
    entry.writeUInt16LE(label.length,28);
    entry.writeUInt32LE(offset,42);
    central.push(entry,label);
    offset+=local.length+label.length+data.length;
  }
  const centralBytes=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(files.length,8);
  end.writeUInt16LE(files.length,10);
  end.writeUInt32LE(centralBytes.length,12);
  end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,centralBytes,end]);
}
