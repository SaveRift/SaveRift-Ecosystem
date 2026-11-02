// MPL-2.0. Fixed public format math extracted from the attributed Crimson codec.
// References: NattKh 96e7f78fcb00d6cb5615171a7f359f0c2de5b114 (MPL-2.0),
// Python cryptography's original ChaCha20 64-bit counter/nonce convention.
// No parsing, account keys, I/O, save serialization or publication authority.
import {Buffer} from './buffer.mjs';
const fail=message=>{throw new RangeError(message);};
const limit=32*1024*1024;
export function chacha20Block(data,key,nonce){
  key=Buffer.from(key.buffer,key.byteOffset,key.byteLength);nonce=Buffer.from(nonce.buffer,nonce.byteOffset,nonce.byteLength);
  if(key.length!==32||nonce.length!==16)fail('Invalid ChaCha20 key or nonce.');
  const state=new Uint32Array(16);state.set([0x61707865,0x3320646e,0x79622d32,0x6b206574]);
  for(let i=0;i<8;i++)state[4+i]=key.readUInt32LE(i*4);
  for(let i=0;i<4;i++)state[12+i]=nonce.readUInt32LE(i*4);
  const output=Buffer.alloc(data.length),block=Buffer.alloc(64);
  for(let pos=0;pos<data.length;pos+=64){
    let x0=state[0]|0,x1=state[1]|0,x2=state[2]|0,x3=state[3]|0,x4=state[4]|0,x5=state[5]|0,x6=state[6]|0,x7=state[7]|0,x8=state[8]|0,x9=state[9]|0,x10=state[10]|0,x11=state[11]|0,x12=state[12]|0,x13=state[13]|0,x14=state[14]|0,x15=state[15]|0;
    for(let i=0;i<10;i++){
      x0=(x0+x4)|0;x12^=x0;x12=((x12<<16)|(x12>>>16))|0;
      x8=(x8+x12)|0;x4^=x8;x4=((x4<<12)|(x4>>>20))|0;
      x0=(x0+x4)|0;x12^=x0;x12=((x12<<8)|(x12>>>24))|0;
      x8=(x8+x12)|0;x4^=x8;x4=((x4<<7)|(x4>>>25))|0;
      x1=(x1+x5)|0;x13^=x1;x13=((x13<<16)|(x13>>>16))|0;
      x9=(x9+x13)|0;x5^=x9;x5=((x5<<12)|(x5>>>20))|0;
      x1=(x1+x5)|0;x13^=x1;x13=((x13<<8)|(x13>>>24))|0;
      x9=(x9+x13)|0;x5^=x9;x5=((x5<<7)|(x5>>>25))|0;
      x2=(x2+x6)|0;x14^=x2;x14=((x14<<16)|(x14>>>16))|0;
      x10=(x10+x14)|0;x6^=x10;x6=((x6<<12)|(x6>>>20))|0;
      x2=(x2+x6)|0;x14^=x2;x14=((x14<<8)|(x14>>>24))|0;
      x10=(x10+x14)|0;x6^=x10;x6=((x6<<7)|(x6>>>25))|0;
      x3=(x3+x7)|0;x15^=x3;x15=((x15<<16)|(x15>>>16))|0;
      x11=(x11+x15)|0;x7^=x11;x7=((x7<<12)|(x7>>>20))|0;
      x3=(x3+x7)|0;x15^=x3;x15=((x15<<8)|(x15>>>24))|0;
      x11=(x11+x15)|0;x7^=x11;x7=((x7<<7)|(x7>>>25))|0;
      x0=(x0+x5)|0;x15^=x0;x15=((x15<<16)|(x15>>>16))|0;
      x10=(x10+x15)|0;x5^=x10;x5=((x5<<12)|(x5>>>20))|0;
      x0=(x0+x5)|0;x15^=x0;x15=((x15<<8)|(x15>>>24))|0;
      x10=(x10+x15)|0;x5^=x10;x5=((x5<<7)|(x5>>>25))|0;
      x1=(x1+x6)|0;x12^=x1;x12=((x12<<16)|(x12>>>16))|0;
      x11=(x11+x12)|0;x6^=x11;x6=((x6<<12)|(x6>>>20))|0;
      x1=(x1+x6)|0;x12^=x1;x12=((x12<<8)|(x12>>>24))|0;
      x11=(x11+x12)|0;x6^=x11;x6=((x6<<7)|(x6>>>25))|0;
      x2=(x2+x7)|0;x13^=x2;x13=((x13<<16)|(x13>>>16))|0;
      x8=(x8+x13)|0;x7^=x8;x7=((x7<<12)|(x7>>>20))|0;
      x2=(x2+x7)|0;x13^=x2;x13=((x13<<8)|(x13>>>24))|0;
      x8=(x8+x13)|0;x7^=x8;x7=((x7<<7)|(x7>>>25))|0;
      x3=(x3+x4)|0;x14^=x3;x14=((x14<<16)|(x14>>>16))|0;
      x9=(x9+x14)|0;x4^=x9;x4=((x4<<12)|(x4>>>20))|0;
      x3=(x3+x4)|0;x14^=x3;x14=((x14<<8)|(x14>>>24))|0;
      x9=(x9+x14)|0;x4^=x9;x4=((x4<<7)|(x4>>>25))|0;
    }
    if(pos+64<=data.length){
      let word;
      word=(x0+state[0])|0;output[pos+0]=data[pos+0]^(word);output[pos+1]=data[pos+1]^(word>>>8);output[pos+2]=data[pos+2]^(word>>>16);output[pos+3]=data[pos+3]^(word>>>24);
      word=(x1+state[1])|0;output[pos+4]=data[pos+4]^(word);output[pos+5]=data[pos+5]^(word>>>8);output[pos+6]=data[pos+6]^(word>>>16);output[pos+7]=data[pos+7]^(word>>>24);
      word=(x2+state[2])|0;output[pos+8]=data[pos+8]^(word);output[pos+9]=data[pos+9]^(word>>>8);output[pos+10]=data[pos+10]^(word>>>16);output[pos+11]=data[pos+11]^(word>>>24);
      word=(x3+state[3])|0;output[pos+12]=data[pos+12]^(word);output[pos+13]=data[pos+13]^(word>>>8);output[pos+14]=data[pos+14]^(word>>>16);output[pos+15]=data[pos+15]^(word>>>24);
      word=(x4+state[4])|0;output[pos+16]=data[pos+16]^(word);output[pos+17]=data[pos+17]^(word>>>8);output[pos+18]=data[pos+18]^(word>>>16);output[pos+19]=data[pos+19]^(word>>>24);
      word=(x5+state[5])|0;output[pos+20]=data[pos+20]^(word);output[pos+21]=data[pos+21]^(word>>>8);output[pos+22]=data[pos+22]^(word>>>16);output[pos+23]=data[pos+23]^(word>>>24);
      word=(x6+state[6])|0;output[pos+24]=data[pos+24]^(word);output[pos+25]=data[pos+25]^(word>>>8);output[pos+26]=data[pos+26]^(word>>>16);output[pos+27]=data[pos+27]^(word>>>24);
      word=(x7+state[7])|0;output[pos+28]=data[pos+28]^(word);output[pos+29]=data[pos+29]^(word>>>8);output[pos+30]=data[pos+30]^(word>>>16);output[pos+31]=data[pos+31]^(word>>>24);
      word=(x8+state[8])|0;output[pos+32]=data[pos+32]^(word);output[pos+33]=data[pos+33]^(word>>>8);output[pos+34]=data[pos+34]^(word>>>16);output[pos+35]=data[pos+35]^(word>>>24);
      word=(x9+state[9])|0;output[pos+36]=data[pos+36]^(word);output[pos+37]=data[pos+37]^(word>>>8);output[pos+38]=data[pos+38]^(word>>>16);output[pos+39]=data[pos+39]^(word>>>24);
      word=(x10+state[10])|0;output[pos+40]=data[pos+40]^(word);output[pos+41]=data[pos+41]^(word>>>8);output[pos+42]=data[pos+42]^(word>>>16);output[pos+43]=data[pos+43]^(word>>>24);
      word=(x11+state[11])|0;output[pos+44]=data[pos+44]^(word);output[pos+45]=data[pos+45]^(word>>>8);output[pos+46]=data[pos+46]^(word>>>16);output[pos+47]=data[pos+47]^(word>>>24);
      word=(x12+state[12])|0;output[pos+48]=data[pos+48]^(word);output[pos+49]=data[pos+49]^(word>>>8);output[pos+50]=data[pos+50]^(word>>>16);output[pos+51]=data[pos+51]^(word>>>24);
      word=(x13+state[13])|0;output[pos+52]=data[pos+52]^(word);output[pos+53]=data[pos+53]^(word>>>8);output[pos+54]=data[pos+54]^(word>>>16);output[pos+55]=data[pos+55]^(word>>>24);
      word=(x14+state[14])|0;output[pos+56]=data[pos+56]^(word);output[pos+57]=data[pos+57]^(word>>>8);output[pos+58]=data[pos+58]^(word>>>16);output[pos+59]=data[pos+59]^(word>>>24);
      word=(x15+state[15])|0;output[pos+60]=data[pos+60]^(word);output[pos+61]=data[pos+61]^(word>>>8);output[pos+62]=data[pos+62]^(word>>>16);output[pos+63]=data[pos+63]^(word>>>24);
    }else{
      block.writeUInt32LE((x0+state[0])>>>0,0);
      block.writeUInt32LE((x1+state[1])>>>0,4);
      block.writeUInt32LE((x2+state[2])>>>0,8);
      block.writeUInt32LE((x3+state[3])>>>0,12);
      block.writeUInt32LE((x4+state[4])>>>0,16);
      block.writeUInt32LE((x5+state[5])>>>0,20);
      block.writeUInt32LE((x6+state[6])>>>0,24);
      block.writeUInt32LE((x7+state[7])>>>0,28);
      block.writeUInt32LE((x8+state[8])>>>0,32);
      block.writeUInt32LE((x9+state[9])>>>0,36);
      block.writeUInt32LE((x10+state[10])>>>0,40);
      block.writeUInt32LE((x11+state[11])>>>0,44);
      block.writeUInt32LE((x12+state[12])>>>0,48);
      block.writeUInt32LE((x13+state[13])>>>0,52);
      block.writeUInt32LE((x14+state[14])>>>0,56);
      block.writeUInt32LE((x15+state[15])>>>0,60);
      for(let i=0;i<64&&pos+i<data.length;i++)output[pos+i]=data[pos+i]^block[i];
    }
    state[12]=(state[12]+1)>>>0;if(!state[12])state[13]=(state[13]+1)>>>0;
  }
  return output;
}
export function inflateLz4Block(input,size){
  input=Buffer.from(input.buffer,input.byteOffset,input.byteLength);
  if(!Number.isSafeInteger(size)||size<1||size>limit)fail('The declared decompressed size exceeds the inspection limit.','CRIMSON_SIZE_LIMIT');
  const out=Buffer.alloc(size);let ip=0,op=0;
  function length(base){let n=base;if(base===15){let b;do{if(ip>=input.length)fail('Truncated LZ4 length.');b=input[ip++];n+=b;if(n>limit)fail('LZ4 length exceeds the limit.','CRIMSON_SIZE_LIMIT');}while(b===255);}return n;}
  while(ip<input.length){
    const token=input[ip++],literal=length(token>>>4);
    if(ip+literal>input.length||op+literal>size)fail('LZ4 literal exceeds its declared bounds.');
    input.copy(out,op,ip,ip+literal);ip+=literal;op+=literal;
    if(ip===input.length)break;
    if(ip+2>input.length)fail('Truncated LZ4 match offset.');const offset=input.readUInt16LE(ip);ip+=2;
    if(!offset||offset>op)fail('Invalid LZ4 match offset.');const match=length(token&15)+4;
    if(op+match>size)fail('LZ4 match exceeds the declared output size.');
    for(let i=0;i<match;i++){out[op]=out[op-offset];op++;}
  }
  if(op!==size)fail('LZ4 output length does not match the SAVE header.');return out;
}
