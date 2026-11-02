import {Buffer} from './buffer.mjs';
function validUtf8(bytes){
  for(let i=0;i<bytes.length;){const a=bytes[i++];if(a<0x80)continue;
    let needed,min,max;if(a>=0xc2&&a<=0xdf){needed=1;min=0x80;max=0xbf;}else if(a>=0xe0&&a<=0xef){needed=2;min=a===0xe0?0xa0:0x80;max=a===0xed?0x9f:0xbf;}else if(a>=0xf0&&a<=0xf4){needed=3;min=a===0xf0?0x90:0x80;max=a===0xf4?0x8f:0xbf;}else return false;
    if(i+needed>bytes.length||bytes[i]<min||bytes[i]>max)return false;i++;for(let j=1;j<needed;j++){if(bytes[i]<0x80||bytes[i]>0xbf)return false;i++;}
  }return true;
}
export class TextEncoder{
  get encoding(){return 'utf-8';}
  encode(text=''){return new Uint8Array(Buffer.from(String(text),'utf8'));}
}
export class TextDecoder{
  constructor(label='utf-8',{fatal=false,ignoreBOM=false}={}){if(!['utf-8','utf8','unicode-1-1-utf-8'].includes(String(label).trim().toLowerCase()))throw new RangeError('Only UTF-8 is supported.');this.fatal=Boolean(fatal);this.ignoreBOM=Boolean(ignoreBOM);}
  get encoding(){return 'utf-8';}
  decode(input=new Uint8Array(),{stream=false}={}){if(stream)throw new TypeError('Streaming UTF-8 decoding is not supported.');const bytes=ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):new Uint8Array(input);if(this.fatal&&!validUtf8(bytes))throw new TypeError('The encoded data is not valid UTF-8.');let text=Buffer.from(bytes).toString('utf8');if(!this.ignoreBOM&&text.charCodeAt(0)===0xfeff)text=text.slice(1);return text;}
}
export function installTextEncoding(){if(typeof globalThis.TextEncoder==='undefined')globalThis.TextEncoder=TextEncoder;if(typeof globalThis.TextDecoder==='undefined')globalThis.TextDecoder=TextDecoder;}
