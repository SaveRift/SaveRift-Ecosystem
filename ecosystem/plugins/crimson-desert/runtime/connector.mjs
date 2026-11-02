var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../sdk/node_modules/base64-js/index.js
var require_base64_js = __commonJS({
  "../../sdk/node_modules/base64-js/index.js"(exports) {
    "use strict";
    exports.byteLength = byteLength;
    exports.toByteArray = toByteArray;
    exports.fromByteArray = fromByteArray;
    var lookup = [];
    var revLookup = [];
    var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
    var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (i = 0, len = code.length; i < len; ++i) {
      lookup[i] = code[i];
      revLookup[code.charCodeAt(i)] = i;
    }
    var i;
    var len;
    revLookup["-".charCodeAt(0)] = 62;
    revLookup["_".charCodeAt(0)] = 63;
    function getLens(b64) {
      var len2 = b64.length;
      if (len2 % 4 > 0) {
        throw new Error("Invalid string. Length must be a multiple of 4");
      }
      var validLen = b64.indexOf("=");
      if (validLen === -1) validLen = len2;
      var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
      return [validLen, placeHoldersLen];
    }
    function byteLength(b64) {
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function _byteLength(b64, validLen, placeHoldersLen) {
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function toByteArray(b64) {
      var tmp;
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
      var curByte = 0;
      var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
      var i2;
      for (i2 = 0; i2 < len2; i2 += 4) {
        tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
        arr[curByte++] = tmp >> 16 & 255;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 2) {
        tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 1) {
        tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      return arr;
    }
    function tripletToBase64(num) {
      return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
    }
    function encodeChunk(uint8, start, end) {
      var tmp;
      var output = [];
      for (var i2 = start; i2 < end; i2 += 3) {
        tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
        output.push(tripletToBase64(tmp));
      }
      return output.join("");
    }
    function fromByteArray(uint8) {
      var tmp;
      var len2 = uint8.length;
      var extraBytes = len2 % 3;
      var parts = [];
      var maxChunkLength = 16383;
      for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
        parts.push(encodeChunk(uint8, i2, i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength));
      }
      if (extraBytes === 1) {
        tmp = uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
        );
      } else if (extraBytes === 2) {
        tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
        );
      }
      return parts.join("");
    }
  }
});

// ../../sdk/node_modules/ieee754/index.js
var require_ieee754 = __commonJS({
  "../../sdk/node_modules/ieee754/index.js"(exports) {
    /*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
    exports.read = function(buffer, offset, isLE, mLen, nBytes) {
      var e, m;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var nBits = -7;
      var i = isLE ? nBytes - 1 : 0;
      var d = isLE ? -1 : 1;
      var s = buffer[offset + i];
      i += d;
      e = s & (1 << -nBits) - 1;
      s >>= -nBits;
      nBits += eLen;
      for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {
      }
      m = e & (1 << -nBits) - 1;
      e >>= -nBits;
      nBits += mLen;
      for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {
      }
      if (e === 0) {
        e = 1 - eBias;
      } else if (e === eMax) {
        return m ? NaN : (s ? -1 : 1) * Infinity;
      } else {
        m = m + Math.pow(2, mLen);
        e = e - eBias;
      }
      return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
    };
    exports.write = function(buffer, value2, offset, isLE, mLen, nBytes) {
      var e, m, c;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
      var i = isLE ? 0 : nBytes - 1;
      var d = isLE ? 1 : -1;
      var s = value2 < 0 || value2 === 0 && 1 / value2 < 0 ? 1 : 0;
      value2 = Math.abs(value2);
      if (isNaN(value2) || value2 === Infinity) {
        m = isNaN(value2) ? 1 : 0;
        e = eMax;
      } else {
        e = Math.floor(Math.log(value2) / Math.LN2);
        if (value2 * (c = Math.pow(2, -e)) < 1) {
          e--;
          c *= 2;
        }
        if (e + eBias >= 1) {
          value2 += rt / c;
        } else {
          value2 += rt * Math.pow(2, 1 - eBias);
        }
        if (value2 * c >= 2) {
          e++;
          c /= 2;
        }
        if (e + eBias >= eMax) {
          m = 0;
          e = eMax;
        } else if (e + eBias >= 1) {
          m = (value2 * c - 1) * Math.pow(2, mLen);
          e = e + eBias;
        } else {
          m = value2 * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
          e = 0;
        }
      }
      for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8) {
      }
      e = e << mLen | m;
      eLen += mLen;
      for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8) {
      }
      buffer[offset + i - d] |= s * 128;
    };
  }
});

// ../../sdk/node_modules/buffer/index.js
var require_buffer = __commonJS({
  "../../sdk/node_modules/buffer/index.js"(exports) {
    "use strict";
    /*!
     * The buffer module from node.js, for the browser.
     *
     * @author   Feross Aboukhadijeh <https://feross.org>
     * @license  MIT
     */
    var base64 = require_base64_js();
    var ieee754 = require_ieee754();
    var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
    exports.Buffer = Buffer3;
    exports.SlowBuffer = SlowBuffer;
    exports.INSPECT_MAX_BYTES = 50;
    var K_MAX_LENGTH = 2147483647;
    exports.kMaxLength = K_MAX_LENGTH;
    Buffer3.TYPED_ARRAY_SUPPORT = typedArraySupport();
    if (!Buffer3.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
      console.error(
        "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."
      );
    }
    function typedArraySupport() {
      try {
        const arr = new Uint8Array(1);
        const proto = { foo: function() {
          return 42;
        } };
        Object.setPrototypeOf(proto, Uint8Array.prototype);
        Object.setPrototypeOf(arr, proto);
        return arr.foo() === 42;
      } catch (e) {
        return false;
      }
    }
    Object.defineProperty(Buffer3.prototype, "parent", {
      enumerable: true,
      get: function() {
        if (!Buffer3.isBuffer(this)) return void 0;
        return this.buffer;
      }
    });
    Object.defineProperty(Buffer3.prototype, "offset", {
      enumerable: true,
      get: function() {
        if (!Buffer3.isBuffer(this)) return void 0;
        return this.byteOffset;
      }
    });
    function createBuffer(length) {
      if (length > K_MAX_LENGTH) {
        throw new RangeError('The value "' + length + '" is invalid for option "size"');
      }
      const buf = new Uint8Array(length);
      Object.setPrototypeOf(buf, Buffer3.prototype);
      return buf;
    }
    function Buffer3(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        if (typeof encodingOrOffset === "string") {
          throw new TypeError(
            'The "string" argument must be of type string. Received type number'
          );
        }
        return allocUnsafe(arg);
      }
      return from(arg, encodingOrOffset, length);
    }
    Buffer3.poolSize = 8192;
    function from(value2, encodingOrOffset, length) {
      if (typeof value2 === "string") {
        return fromString(value2, encodingOrOffset);
      }
      if (ArrayBuffer.isView(value2)) {
        return fromArrayView(value2);
      }
      if (value2 == null) {
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value2
        );
      }
      if (isInstance(value2, ArrayBuffer) || value2 && isInstance(value2.buffer, ArrayBuffer)) {
        return fromArrayBuffer(value2, encodingOrOffset, length);
      }
      if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value2, SharedArrayBuffer) || value2 && isInstance(value2.buffer, SharedArrayBuffer))) {
        return fromArrayBuffer(value2, encodingOrOffset, length);
      }
      if (typeof value2 === "number") {
        throw new TypeError(
          'The "value" argument must not be of type number. Received type number'
        );
      }
      const valueOf = value2.valueOf && value2.valueOf();
      if (valueOf != null && valueOf !== value2) {
        return Buffer3.from(valueOf, encodingOrOffset, length);
      }
      const b = fromObject(value2);
      if (b) return b;
      if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value2[Symbol.toPrimitive] === "function") {
        return Buffer3.from(value2[Symbol.toPrimitive]("string"), encodingOrOffset, length);
      }
      throw new TypeError(
        "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value2
      );
    }
    Buffer3.from = function(value2, encodingOrOffset, length) {
      return from(value2, encodingOrOffset, length);
    };
    Object.setPrototypeOf(Buffer3.prototype, Uint8Array.prototype);
    Object.setPrototypeOf(Buffer3, Uint8Array);
    function assertSize(size) {
      if (typeof size !== "number") {
        throw new TypeError('"size" argument must be of type number');
      } else if (size < 0) {
        throw new RangeError('The value "' + size + '" is invalid for option "size"');
      }
    }
    function alloc(size, fill, encoding) {
      assertSize(size);
      if (size <= 0) {
        return createBuffer(size);
      }
      if (fill !== void 0) {
        return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
      }
      return createBuffer(size);
    }
    Buffer3.alloc = function(size, fill, encoding) {
      return alloc(size, fill, encoding);
    };
    function allocUnsafe(size) {
      assertSize(size);
      return createBuffer(size < 0 ? 0 : checked(size) | 0);
    }
    Buffer3.allocUnsafe = function(size) {
      return allocUnsafe(size);
    };
    Buffer3.allocUnsafeSlow = function(size) {
      return allocUnsafe(size);
    };
    function fromString(string, encoding) {
      if (typeof encoding !== "string" || encoding === "") {
        encoding = "utf8";
      }
      if (!Buffer3.isEncoding(encoding)) {
        throw new TypeError("Unknown encoding: " + encoding);
      }
      const length = byteLength(string, encoding) | 0;
      let buf = createBuffer(length);
      const actual = buf.write(string, encoding);
      if (actual !== length) {
        buf = buf.slice(0, actual);
      }
      return buf;
    }
    function fromArrayLike(array) {
      const length = array.length < 0 ? 0 : checked(array.length) | 0;
      const buf = createBuffer(length);
      for (let i = 0; i < length; i += 1) {
        buf[i] = array[i] & 255;
      }
      return buf;
    }
    function fromArrayView(arrayView) {
      if (isInstance(arrayView, Uint8Array)) {
        const copy2 = new Uint8Array(arrayView);
        return fromArrayBuffer(copy2.buffer, copy2.byteOffset, copy2.byteLength);
      }
      return fromArrayLike(arrayView);
    }
    function fromArrayBuffer(array, byteOffset, length) {
      if (byteOffset < 0 || array.byteLength < byteOffset) {
        throw new RangeError('"offset" is outside of buffer bounds');
      }
      if (array.byteLength < byteOffset + (length || 0)) {
        throw new RangeError('"length" is outside of buffer bounds');
      }
      let buf;
      if (byteOffset === void 0 && length === void 0) {
        buf = new Uint8Array(array);
      } else if (length === void 0) {
        buf = new Uint8Array(array, byteOffset);
      } else {
        buf = new Uint8Array(array, byteOffset, length);
      }
      Object.setPrototypeOf(buf, Buffer3.prototype);
      return buf;
    }
    function fromObject(obj) {
      if (Buffer3.isBuffer(obj)) {
        const len = checked(obj.length) | 0;
        const buf = createBuffer(len);
        if (buf.length === 0) {
          return buf;
        }
        obj.copy(buf, 0, 0, len);
        return buf;
      }
      if (obj.length !== void 0) {
        if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
          return createBuffer(0);
        }
        return fromArrayLike(obj);
      }
      if (obj.type === "Buffer" && Array.isArray(obj.data)) {
        return fromArrayLike(obj.data);
      }
    }
    function checked(length) {
      if (length >= K_MAX_LENGTH) {
        throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
      }
      return length | 0;
    }
    function SlowBuffer(length) {
      if (+length != length) {
        length = 0;
      }
      return Buffer3.alloc(+length);
    }
    Buffer3.isBuffer = function isBuffer(b) {
      return b != null && b._isBuffer === true && b !== Buffer3.prototype;
    };
    Buffer3.compare = function compare2(a, b) {
      if (isInstance(a, Uint8Array)) a = Buffer3.from(a, a.offset, a.byteLength);
      if (isInstance(b, Uint8Array)) b = Buffer3.from(b, b.offset, b.byteLength);
      if (!Buffer3.isBuffer(a) || !Buffer3.isBuffer(b)) {
        throw new TypeError(
          'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
        );
      }
      if (a === b) return 0;
      let x = a.length;
      let y = b.length;
      for (let i = 0, len = Math.min(x, y); i < len; ++i) {
        if (a[i] !== b[i]) {
          x = a[i];
          y = b[i];
          break;
        }
      }
      if (x < y) return -1;
      if (y < x) return 1;
      return 0;
    };
    Buffer3.isEncoding = function isEncoding(encoding) {
      switch (String(encoding).toLowerCase()) {
        case "hex":
        case "utf8":
        case "utf-8":
        case "ascii":
        case "latin1":
        case "binary":
        case "base64":
        case "ucs2":
        case "ucs-2":
        case "utf16le":
        case "utf-16le":
          return true;
        default:
          return false;
      }
    };
    Buffer3.concat = function concat(list, length) {
      if (!Array.isArray(list)) {
        throw new TypeError('"list" argument must be an Array of Buffers');
      }
      if (list.length === 0) {
        return Buffer3.alloc(0);
      }
      let i;
      if (length === void 0) {
        length = 0;
        for (i = 0; i < list.length; ++i) {
          length += list[i].length;
        }
      }
      const buffer = Buffer3.allocUnsafe(length);
      let pos = 0;
      for (i = 0; i < list.length; ++i) {
        let buf = list[i];
        if (isInstance(buf, Uint8Array)) {
          if (pos + buf.length > buffer.length) {
            if (!Buffer3.isBuffer(buf)) buf = Buffer3.from(buf);
            buf.copy(buffer, pos);
          } else {
            Uint8Array.prototype.set.call(
              buffer,
              buf,
              pos
            );
          }
        } else if (!Buffer3.isBuffer(buf)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        } else {
          buf.copy(buffer, pos);
        }
        pos += buf.length;
      }
      return buffer;
    };
    function byteLength(string, encoding) {
      if (Buffer3.isBuffer(string)) {
        return string.length;
      }
      if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
        return string.byteLength;
      }
      if (typeof string !== "string") {
        throw new TypeError(
          'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof string
        );
      }
      const len = string.length;
      const mustMatch = arguments.length > 2 && arguments[2] === true;
      if (!mustMatch && len === 0) return 0;
      let loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "ascii":
          case "latin1":
          case "binary":
            return len;
          case "utf8":
          case "utf-8":
            return utf8ToBytes2(string).length;
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return len * 2;
          case "hex":
            return len >>> 1;
          case "base64":
            return base64ToBytes(string).length;
          default:
            if (loweredCase) {
              return mustMatch ? -1 : utf8ToBytes2(string).length;
            }
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    }
    Buffer3.byteLength = byteLength;
    function slowToString(encoding, start, end) {
      let loweredCase = false;
      if (start === void 0 || start < 0) {
        start = 0;
      }
      if (start > this.length) {
        return "";
      }
      if (end === void 0 || end > this.length) {
        end = this.length;
      }
      if (end <= 0) {
        return "";
      }
      end >>>= 0;
      start >>>= 0;
      if (end <= start) {
        return "";
      }
      if (!encoding) encoding = "utf8";
      while (true) {
        switch (encoding) {
          case "hex":
            return hexSlice(this, start, end);
          case "utf8":
          case "utf-8":
            return utf8Slice(this, start, end);
          case "ascii":
            return asciiSlice(this, start, end);
          case "latin1":
          case "binary":
            return latin1Slice(this, start, end);
          case "base64":
            return base64Slice(this, start, end);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return utf16leSlice(this, start, end);
          default:
            if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
            encoding = (encoding + "").toLowerCase();
            loweredCase = true;
        }
      }
    }
    Buffer3.prototype._isBuffer = true;
    function swap(b, n, m) {
      const i = b[n];
      b[n] = b[m];
      b[m] = i;
    }
    Buffer3.prototype.swap16 = function swap16() {
      const len = this.length;
      if (len % 2 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 16-bits");
      }
      for (let i = 0; i < len; i += 2) {
        swap(this, i, i + 1);
      }
      return this;
    };
    Buffer3.prototype.swap32 = function swap32() {
      const len = this.length;
      if (len % 4 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 32-bits");
      }
      for (let i = 0; i < len; i += 4) {
        swap(this, i, i + 3);
        swap(this, i + 1, i + 2);
      }
      return this;
    };
    Buffer3.prototype.swap64 = function swap64() {
      const len = this.length;
      if (len % 8 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 64-bits");
      }
      for (let i = 0; i < len; i += 8) {
        swap(this, i, i + 7);
        swap(this, i + 1, i + 6);
        swap(this, i + 2, i + 5);
        swap(this, i + 3, i + 4);
      }
      return this;
    };
    Buffer3.prototype.toString = function toString() {
      const length = this.length;
      if (length === 0) return "";
      if (arguments.length === 0) return utf8Slice(this, 0, length);
      return slowToString.apply(this, arguments);
    };
    Buffer3.prototype.toLocaleString = Buffer3.prototype.toString;
    Buffer3.prototype.equals = function equals(b) {
      if (!Buffer3.isBuffer(b)) throw new TypeError("Argument must be a Buffer");
      if (this === b) return true;
      return Buffer3.compare(this, b) === 0;
    };
    Buffer3.prototype.inspect = function inspect() {
      let str = "";
      const max = exports.INSPECT_MAX_BYTES;
      str = this.toString("hex", 0, max).replace(/(.{2})/g, "$1 ").trim();
      if (this.length > max) str += " ... ";
      return "<Buffer " + str + ">";
    };
    if (customInspectSymbol) {
      Buffer3.prototype[customInspectSymbol] = Buffer3.prototype.inspect;
    }
    Buffer3.prototype.compare = function compare2(target, start, end, thisStart, thisEnd) {
      if (isInstance(target, Uint8Array)) {
        target = Buffer3.from(target, target.offset, target.byteLength);
      }
      if (!Buffer3.isBuffer(target)) {
        throw new TypeError(
          'The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof target
        );
      }
      if (start === void 0) {
        start = 0;
      }
      if (end === void 0) {
        end = target ? target.length : 0;
      }
      if (thisStart === void 0) {
        thisStart = 0;
      }
      if (thisEnd === void 0) {
        thisEnd = this.length;
      }
      if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
        throw new RangeError("out of range index");
      }
      if (thisStart >= thisEnd && start >= end) {
        return 0;
      }
      if (thisStart >= thisEnd) {
        return -1;
      }
      if (start >= end) {
        return 1;
      }
      start >>>= 0;
      end >>>= 0;
      thisStart >>>= 0;
      thisEnd >>>= 0;
      if (this === target) return 0;
      let x = thisEnd - thisStart;
      let y = end - start;
      const len = Math.min(x, y);
      const thisCopy = this.slice(thisStart, thisEnd);
      const targetCopy = target.slice(start, end);
      for (let i = 0; i < len; ++i) {
        if (thisCopy[i] !== targetCopy[i]) {
          x = thisCopy[i];
          y = targetCopy[i];
          break;
        }
      }
      if (x < y) return -1;
      if (y < x) return 1;
      return 0;
    };
    function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
      if (buffer.length === 0) return -1;
      if (typeof byteOffset === "string") {
        encoding = byteOffset;
        byteOffset = 0;
      } else if (byteOffset > 2147483647) {
        byteOffset = 2147483647;
      } else if (byteOffset < -2147483648) {
        byteOffset = -2147483648;
      }
      byteOffset = +byteOffset;
      if (numberIsNaN(byteOffset)) {
        byteOffset = dir ? 0 : buffer.length - 1;
      }
      if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
      if (byteOffset >= buffer.length) {
        if (dir) return -1;
        else byteOffset = buffer.length - 1;
      } else if (byteOffset < 0) {
        if (dir) byteOffset = 0;
        else return -1;
      }
      if (typeof val === "string") {
        val = Buffer3.from(val, encoding);
      }
      if (Buffer3.isBuffer(val)) {
        if (val.length === 0) {
          return -1;
        }
        return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
      } else if (typeof val === "number") {
        val = val & 255;
        if (typeof Uint8Array.prototype.indexOf === "function") {
          if (dir) {
            return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
          } else {
            return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
          }
        }
        return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
      }
      throw new TypeError("val must be string, number or Buffer");
    }
    function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
      let indexSize = 1;
      let arrLength = arr.length;
      let valLength = val.length;
      if (encoding !== void 0) {
        encoding = String(encoding).toLowerCase();
        if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
          if (arr.length < 2 || val.length < 2) {
            return -1;
          }
          indexSize = 2;
          arrLength /= 2;
          valLength /= 2;
          byteOffset /= 2;
        }
      }
      function read(buf, i2) {
        if (indexSize === 1) {
          return buf[i2];
        } else {
          return buf.readUInt16BE(i2 * indexSize);
        }
      }
      let i;
      if (dir) {
        let foundIndex = -1;
        for (i = byteOffset; i < arrLength; i++) {
          if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
            if (foundIndex === -1) foundIndex = i;
            if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
          } else {
            if (foundIndex !== -1) i -= i - foundIndex;
            foundIndex = -1;
          }
        }
      } else {
        if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
        for (i = byteOffset; i >= 0; i--) {
          let found = true;
          for (let j = 0; j < valLength; j++) {
            if (read(arr, i + j) !== read(val, j)) {
              found = false;
              break;
            }
          }
          if (found) return i;
        }
      }
      return -1;
    }
    Buffer3.prototype.includes = function includes(val, byteOffset, encoding) {
      return this.indexOf(val, byteOffset, encoding) !== -1;
    };
    Buffer3.prototype.indexOf = function indexOf2(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
    };
    Buffer3.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
    };
    function hexWrite(buf, string, offset, length) {
      offset = Number(offset) || 0;
      const remaining = buf.length - offset;
      if (!length) {
        length = remaining;
      } else {
        length = Number(length);
        if (length > remaining) {
          length = remaining;
        }
      }
      const strLen = string.length;
      if (length > strLen / 2) {
        length = strLen / 2;
      }
      let i;
      for (i = 0; i < length; ++i) {
        const parsed = parseInt(string.substr(i * 2, 2), 16);
        if (numberIsNaN(parsed)) return i;
        buf[offset + i] = parsed;
      }
      return i;
    }
    function utf8Write(buf, string, offset, length) {
      return blitBuffer(utf8ToBytes2(string, buf.length - offset), buf, offset, length);
    }
    function asciiWrite(buf, string, offset, length) {
      return blitBuffer(asciiToBytes(string), buf, offset, length);
    }
    function base64Write(buf, string, offset, length) {
      return blitBuffer(base64ToBytes(string), buf, offset, length);
    }
    function ucs2Write(buf, string, offset, length) {
      return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
    }
    Buffer3.prototype.write = function write(string, offset, length, encoding) {
      if (offset === void 0) {
        encoding = "utf8";
        length = this.length;
        offset = 0;
      } else if (length === void 0 && typeof offset === "string") {
        encoding = offset;
        length = this.length;
        offset = 0;
      } else if (isFinite(offset)) {
        offset = offset >>> 0;
        if (isFinite(length)) {
          length = length >>> 0;
          if (encoding === void 0) encoding = "utf8";
        } else {
          encoding = length;
          length = void 0;
        }
      } else {
        throw new Error(
          "Buffer.write(string, encoding, offset[, length]) is no longer supported"
        );
      }
      const remaining = this.length - offset;
      if (length === void 0 || length > remaining) length = remaining;
      if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
        throw new RangeError("Attempt to write outside buffer bounds");
      }
      if (!encoding) encoding = "utf8";
      let loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "hex":
            return hexWrite(this, string, offset, length);
          case "utf8":
          case "utf-8":
            return utf8Write(this, string, offset, length);
          case "ascii":
          case "latin1":
          case "binary":
            return asciiWrite(this, string, offset, length);
          case "base64":
            return base64Write(this, string, offset, length);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return ucs2Write(this, string, offset, length);
          default:
            if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    };
    Buffer3.prototype.toJSON = function toJSON() {
      return {
        type: "Buffer",
        data: Array.prototype.slice.call(this._arr || this, 0)
      };
    };
    function base64Slice(buf, start, end) {
      if (start === 0 && end === buf.length) {
        return base64.fromByteArray(buf);
      } else {
        return base64.fromByteArray(buf.slice(start, end));
      }
    }
    function utf8Slice(buf, start, end) {
      end = Math.min(buf.length, end);
      const res = [];
      let i = start;
      while (i < end) {
        const firstByte = buf[i];
        let codePoint = null;
        let bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
        if (i + bytesPerSequence <= end) {
          let secondByte, thirdByte, fourthByte, tempCodePoint;
          switch (bytesPerSequence) {
            case 1:
              if (firstByte < 128) {
                codePoint = firstByte;
              }
              break;
            case 2:
              secondByte = buf[i + 1];
              if ((secondByte & 192) === 128) {
                tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                if (tempCodePoint > 127) {
                  codePoint = tempCodePoint;
                }
              }
              break;
            case 3:
              secondByte = buf[i + 1];
              thirdByte = buf[i + 2];
              if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                  codePoint = tempCodePoint;
                }
              }
              break;
            case 4:
              secondByte = buf[i + 1];
              thirdByte = buf[i + 2];
              fourthByte = buf[i + 3];
              if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                  codePoint = tempCodePoint;
                }
              }
          }
        }
        if (codePoint === null) {
          codePoint = 65533;
          bytesPerSequence = 1;
        } else if (codePoint > 65535) {
          codePoint -= 65536;
          res.push(codePoint >>> 10 & 1023 | 55296);
          codePoint = 56320 | codePoint & 1023;
        }
        res.push(codePoint);
        i += bytesPerSequence;
      }
      return decodeCodePointsArray(res);
    }
    var MAX_ARGUMENTS_LENGTH = 4096;
    function decodeCodePointsArray(codePoints) {
      const len = codePoints.length;
      if (len <= MAX_ARGUMENTS_LENGTH) {
        return String.fromCharCode.apply(String, codePoints);
      }
      let res = "";
      let i = 0;
      while (i < len) {
        res += String.fromCharCode.apply(
          String,
          codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
        );
      }
      return res;
    }
    function asciiSlice(buf, start, end) {
      let ret = "";
      end = Math.min(buf.length, end);
      for (let i = start; i < end; ++i) {
        ret += String.fromCharCode(buf[i] & 127);
      }
      return ret;
    }
    function latin1Slice(buf, start, end) {
      let ret = "";
      end = Math.min(buf.length, end);
      for (let i = start; i < end; ++i) {
        ret += String.fromCharCode(buf[i]);
      }
      return ret;
    }
    function hexSlice(buf, start, end) {
      const len = buf.length;
      if (!start || start < 0) start = 0;
      if (!end || end < 0 || end > len) end = len;
      let out = "";
      for (let i = start; i < end; ++i) {
        out += hexSliceLookupTable[buf[i]];
      }
      return out;
    }
    function utf16leSlice(buf, start, end) {
      const bytes2 = buf.slice(start, end);
      let res = "";
      for (let i = 0; i < bytes2.length - 1; i += 2) {
        res += String.fromCharCode(bytes2[i] + bytes2[i + 1] * 256);
      }
      return res;
    }
    Buffer3.prototype.slice = function slice(start, end) {
      const len = this.length;
      start = ~~start;
      end = end === void 0 ? len : ~~end;
      if (start < 0) {
        start += len;
        if (start < 0) start = 0;
      } else if (start > len) {
        start = len;
      }
      if (end < 0) {
        end += len;
        if (end < 0) end = 0;
      } else if (end > len) {
        end = len;
      }
      if (end < start) end = start;
      const newBuf = this.subarray(start, end);
      Object.setPrototypeOf(newBuf, Buffer3.prototype);
      return newBuf;
    };
    function checkOffset(offset, ext, length) {
      if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
      if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
    }
    Buffer3.prototype.readUintLE = Buffer3.prototype.readUIntLE = function readUIntLE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      let val = this[offset];
      let mul = 1;
      let i = 0;
      while (++i < byteLength2 && (mul *= 256)) {
        val += this[offset + i] * mul;
      }
      return val;
    };
    Buffer3.prototype.readUintBE = Buffer3.prototype.readUIntBE = function readUIntBE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        checkOffset(offset, byteLength2, this.length);
      }
      let val = this[offset + --byteLength2];
      let mul = 1;
      while (byteLength2 > 0 && (mul *= 256)) {
        val += this[offset + --byteLength2] * mul;
      }
      return val;
    };
    Buffer3.prototype.readUint8 = Buffer3.prototype.readUInt8 = function readUInt8(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 1, this.length);
      return this[offset];
    };
    Buffer3.prototype.readUint16LE = Buffer3.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      return this[offset] | this[offset + 1] << 8;
    };
    Buffer3.prototype.readUint16BE = Buffer3.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      return this[offset] << 8 | this[offset + 1];
    };
    Buffer3.prototype.readUint32LE = Buffer3.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
    };
    Buffer3.prototype.readUint32BE = Buffer3.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
    };
    Buffer3.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const lo = first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24;
      const hi = this[++offset] + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24;
      return BigInt(lo) + (BigInt(hi) << BigInt(32));
    });
    Buffer3.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const hi = first * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
      const lo = this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last;
      return (BigInt(hi) << BigInt(32)) + BigInt(lo);
    });
    Buffer3.prototype.readIntLE = function readIntLE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      let val = this[offset];
      let mul = 1;
      let i = 0;
      while (++i < byteLength2 && (mul *= 256)) {
        val += this[offset + i] * mul;
      }
      mul *= 128;
      if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
      return val;
    };
    Buffer3.prototype.readIntBE = function readIntBE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      let i = byteLength2;
      let mul = 1;
      let val = this[offset + --i];
      while (i > 0 && (mul *= 256)) {
        val += this[offset + --i] * mul;
      }
      mul *= 128;
      if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
      return val;
    };
    Buffer3.prototype.readInt8 = function readInt8(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 1, this.length);
      if (!(this[offset] & 128)) return this[offset];
      return (255 - this[offset] + 1) * -1;
    };
    Buffer3.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      const val = this[offset] | this[offset + 1] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer3.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      const val = this[offset + 1] | this[offset] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer3.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
    };
    Buffer3.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
    };
    Buffer3.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const val = this[offset + 4] + this[offset + 5] * 2 ** 8 + this[offset + 6] * 2 ** 16 + (last << 24);
      return (BigInt(val) << BigInt(32)) + BigInt(first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24);
    });
    Buffer3.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const val = (first << 24) + // Overflow
      this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
      return (BigInt(val) << BigInt(32)) + BigInt(this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last);
    });
    Buffer3.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return ieee754.read(this, offset, true, 23, 4);
    };
    Buffer3.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return ieee754.read(this, offset, false, 23, 4);
    };
    Buffer3.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 8, this.length);
      return ieee754.read(this, offset, true, 52, 8);
    };
    Buffer3.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 8, this.length);
      return ieee754.read(this, offset, false, 52, 8);
    };
    function checkInt(buf, value2, offset, ext, max, min) {
      if (!Buffer3.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
      if (value2 > max || value2 < min) throw new RangeError('"value" argument is out of bounds');
      if (offset + ext > buf.length) throw new RangeError("Index out of range");
    }
    Buffer3.prototype.writeUintLE = Buffer3.prototype.writeUIntLE = function writeUIntLE(value2, offset, byteLength2, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value2, offset, byteLength2, maxBytes, 0);
      }
      let mul = 1;
      let i = 0;
      this[offset] = value2 & 255;
      while (++i < byteLength2 && (mul *= 256)) {
        this[offset + i] = value2 / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeUintBE = Buffer3.prototype.writeUIntBE = function writeUIntBE(value2, offset, byteLength2, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value2, offset, byteLength2, maxBytes, 0);
      }
      let i = byteLength2 - 1;
      let mul = 1;
      this[offset + i] = value2 & 255;
      while (--i >= 0 && (mul *= 256)) {
        this[offset + i] = value2 / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeUint8 = Buffer3.prototype.writeUInt8 = function writeUInt8(value2, offset, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value2, offset, 1, 255, 0);
      this[offset] = value2 & 255;
      return offset + 1;
    };
    Buffer3.prototype.writeUint16LE = Buffer3.prototype.writeUInt16LE = function writeUInt16LE(value2, offset, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value2, offset, 2, 65535, 0);
      this[offset] = value2 & 255;
      this[offset + 1] = value2 >>> 8;
      return offset + 2;
    };
    Buffer3.prototype.writeUint16BE = Buffer3.prototype.writeUInt16BE = function writeUInt16BE(value2, offset, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value2, offset, 2, 65535, 0);
      this[offset] = value2 >>> 8;
      this[offset + 1] = value2 & 255;
      return offset + 2;
    };
    Buffer3.prototype.writeUint32LE = Buffer3.prototype.writeUInt32LE = function writeUInt32LE(value2, offset, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value2, offset, 4, 4294967295, 0);
      this[offset + 3] = value2 >>> 24;
      this[offset + 2] = value2 >>> 16;
      this[offset + 1] = value2 >>> 8;
      this[offset] = value2 & 255;
      return offset + 4;
    };
    Buffer3.prototype.writeUint32BE = Buffer3.prototype.writeUInt32BE = function writeUInt32BE(value2, offset, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value2, offset, 4, 4294967295, 0);
      this[offset] = value2 >>> 24;
      this[offset + 1] = value2 >>> 16;
      this[offset + 2] = value2 >>> 8;
      this[offset + 3] = value2 & 255;
      return offset + 4;
    };
    function wrtBigUInt64LE(buf, value2, offset, min, max) {
      checkIntBI(value2, min, max, buf, offset, 7);
      let lo = Number(value2 & BigInt(4294967295));
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      let hi = Number(value2 >> BigInt(32) & BigInt(4294967295));
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      return offset;
    }
    function wrtBigUInt64BE(buf, value2, offset, min, max) {
      checkIntBI(value2, min, max, buf, offset, 7);
      let lo = Number(value2 & BigInt(4294967295));
      buf[offset + 7] = lo;
      lo = lo >> 8;
      buf[offset + 6] = lo;
      lo = lo >> 8;
      buf[offset + 5] = lo;
      lo = lo >> 8;
      buf[offset + 4] = lo;
      let hi = Number(value2 >> BigInt(32) & BigInt(4294967295));
      buf[offset + 3] = hi;
      hi = hi >> 8;
      buf[offset + 2] = hi;
      hi = hi >> 8;
      buf[offset + 1] = hi;
      hi = hi >> 8;
      buf[offset] = hi;
      return offset + 8;
    }
    Buffer3.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(value2, offset = 0) {
      return wrtBigUInt64LE(this, value2, offset, BigInt(0), BigInt("0xffffffffffffffff"));
    });
    Buffer3.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(value2, offset = 0) {
      return wrtBigUInt64BE(this, value2, offset, BigInt(0), BigInt("0xffffffffffffffff"));
    });
    Buffer3.prototype.writeIntLE = function writeIntLE(value2, offset, byteLength2, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      if (!noAssert) {
        const limit3 = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value2, offset, byteLength2, limit3 - 1, -limit3);
      }
      let i = 0;
      let mul = 1;
      let sub = 0;
      this[offset] = value2 & 255;
      while (++i < byteLength2 && (mul *= 256)) {
        if (value2 < 0 && sub === 0 && this[offset + i - 1] !== 0) {
          sub = 1;
        }
        this[offset + i] = (value2 / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeIntBE = function writeIntBE(value2, offset, byteLength2, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      if (!noAssert) {
        const limit3 = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value2, offset, byteLength2, limit3 - 1, -limit3);
      }
      let i = byteLength2 - 1;
      let mul = 1;
      let sub = 0;
      this[offset + i] = value2 & 255;
      while (--i >= 0 && (mul *= 256)) {
        if (value2 < 0 && sub === 0 && this[offset + i + 1] !== 0) {
          sub = 1;
        }
        this[offset + i] = (value2 / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeInt8 = function writeInt8(value2, offset, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value2, offset, 1, 127, -128);
      if (value2 < 0) value2 = 255 + value2 + 1;
      this[offset] = value2 & 255;
      return offset + 1;
    };
    Buffer3.prototype.writeInt16LE = function writeInt16LE(value2, offset, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value2, offset, 2, 32767, -32768);
      this[offset] = value2 & 255;
      this[offset + 1] = value2 >>> 8;
      return offset + 2;
    };
    Buffer3.prototype.writeInt16BE = function writeInt16BE(value2, offset, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value2, offset, 2, 32767, -32768);
      this[offset] = value2 >>> 8;
      this[offset + 1] = value2 & 255;
      return offset + 2;
    };
    Buffer3.prototype.writeInt32LE = function writeInt32LE(value2, offset, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value2, offset, 4, 2147483647, -2147483648);
      this[offset] = value2 & 255;
      this[offset + 1] = value2 >>> 8;
      this[offset + 2] = value2 >>> 16;
      this[offset + 3] = value2 >>> 24;
      return offset + 4;
    };
    Buffer3.prototype.writeInt32BE = function writeInt32BE(value2, offset, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value2, offset, 4, 2147483647, -2147483648);
      if (value2 < 0) value2 = 4294967295 + value2 + 1;
      this[offset] = value2 >>> 24;
      this[offset + 1] = value2 >>> 16;
      this[offset + 2] = value2 >>> 8;
      this[offset + 3] = value2 & 255;
      return offset + 4;
    };
    Buffer3.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(value2, offset = 0) {
      return wrtBigUInt64LE(this, value2, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
    });
    Buffer3.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(value2, offset = 0) {
      return wrtBigUInt64BE(this, value2, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
    });
    function checkIEEE754(buf, value2, offset, ext, max, min) {
      if (offset + ext > buf.length) throw new RangeError("Index out of range");
      if (offset < 0) throw new RangeError("Index out of range");
    }
    function writeFloat(buf, value2, offset, littleEndian, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value2, offset, 4, 34028234663852886e22, -34028234663852886e22);
      }
      ieee754.write(buf, value2, offset, littleEndian, 23, 4);
      return offset + 4;
    }
    Buffer3.prototype.writeFloatLE = function writeFloatLE(value2, offset, noAssert) {
      return writeFloat(this, value2, offset, true, noAssert);
    };
    Buffer3.prototype.writeFloatBE = function writeFloatBE(value2, offset, noAssert) {
      return writeFloat(this, value2, offset, false, noAssert);
    };
    function writeDouble(buf, value2, offset, littleEndian, noAssert) {
      value2 = +value2;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value2, offset, 8, 17976931348623157e292, -17976931348623157e292);
      }
      ieee754.write(buf, value2, offset, littleEndian, 52, 8);
      return offset + 8;
    }
    Buffer3.prototype.writeDoubleLE = function writeDoubleLE(value2, offset, noAssert) {
      return writeDouble(this, value2, offset, true, noAssert);
    };
    Buffer3.prototype.writeDoubleBE = function writeDoubleBE(value2, offset, noAssert) {
      return writeDouble(this, value2, offset, false, noAssert);
    };
    Buffer3.prototype.copy = function copy2(target, targetStart, start, end) {
      if (!Buffer3.isBuffer(target)) throw new TypeError("argument should be a Buffer");
      if (!start) start = 0;
      if (!end && end !== 0) end = this.length;
      if (targetStart >= target.length) targetStart = target.length;
      if (!targetStart) targetStart = 0;
      if (end > 0 && end < start) end = start;
      if (end === start) return 0;
      if (target.length === 0 || this.length === 0) return 0;
      if (targetStart < 0) {
        throw new RangeError("targetStart out of bounds");
      }
      if (start < 0 || start >= this.length) throw new RangeError("Index out of range");
      if (end < 0) throw new RangeError("sourceEnd out of bounds");
      if (end > this.length) end = this.length;
      if (target.length - targetStart < end - start) {
        end = target.length - targetStart + start;
      }
      const len = end - start;
      if (this === target && typeof Uint8Array.prototype.copyWithin === "function") {
        this.copyWithin(targetStart, start, end);
      } else {
        Uint8Array.prototype.set.call(
          target,
          this.subarray(start, end),
          targetStart
        );
      }
      return len;
    };
    Buffer3.prototype.fill = function fill(val, start, end, encoding) {
      if (typeof val === "string") {
        if (typeof start === "string") {
          encoding = start;
          start = 0;
          end = this.length;
        } else if (typeof end === "string") {
          encoding = end;
          end = this.length;
        }
        if (encoding !== void 0 && typeof encoding !== "string") {
          throw new TypeError("encoding must be a string");
        }
        if (typeof encoding === "string" && !Buffer3.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
        if (val.length === 1) {
          const code = val.charCodeAt(0);
          if (encoding === "utf8" && code < 128 || encoding === "latin1") {
            val = code;
          }
        }
      } else if (typeof val === "number") {
        val = val & 255;
      } else if (typeof val === "boolean") {
        val = Number(val);
      }
      if (start < 0 || this.length < start || this.length < end) {
        throw new RangeError("Out of range index");
      }
      if (end <= start) {
        return this;
      }
      start = start >>> 0;
      end = end === void 0 ? this.length : end >>> 0;
      if (!val) val = 0;
      let i;
      if (typeof val === "number") {
        for (i = start; i < end; ++i) {
          this[i] = val;
        }
      } else {
        const bytes2 = Buffer3.isBuffer(val) ? val : Buffer3.from(val, encoding);
        const len = bytes2.length;
        if (len === 0) {
          throw new TypeError('The value "' + val + '" is invalid for argument "value"');
        }
        for (i = 0; i < end - start; ++i) {
          this[i + start] = bytes2[i % len];
        }
      }
      return this;
    };
    var errors = {};
    function E(sym, getMessage, Base) {
      errors[sym] = class NodeError extends Base {
        constructor() {
          super();
          Object.defineProperty(this, "message", {
            value: getMessage.apply(this, arguments),
            writable: true,
            configurable: true
          });
          this.name = `${this.name} [${sym}]`;
          this.stack;
          delete this.name;
        }
        get code() {
          return sym;
        }
        set code(value2) {
          Object.defineProperty(this, "code", {
            configurable: true,
            enumerable: true,
            value: value2,
            writable: true
          });
        }
        toString() {
          return `${this.name} [${sym}]: ${this.message}`;
        }
      };
    }
    E(
      "ERR_BUFFER_OUT_OF_BOUNDS",
      function(name) {
        if (name) {
          return `${name} is outside of buffer bounds`;
        }
        return "Attempt to access memory outside buffer bounds";
      },
      RangeError
    );
    E(
      "ERR_INVALID_ARG_TYPE",
      function(name, actual) {
        return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
      },
      TypeError
    );
    E(
      "ERR_OUT_OF_RANGE",
      function(str, range, input) {
        let msg = `The value of "${str}" is out of range.`;
        let received = input;
        if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
          received = addNumericalSeparator(String(input));
        } else if (typeof input === "bigint") {
          received = String(input);
          if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
            received = addNumericalSeparator(received);
          }
          received += "n";
        }
        msg += ` It must be ${range}. Received ${received}`;
        return msg;
      },
      RangeError
    );
    function addNumericalSeparator(val) {
      let res = "";
      let i = val.length;
      const start = val[0] === "-" ? 1 : 0;
      for (; i >= start + 4; i -= 3) {
        res = `_${val.slice(i - 3, i)}${res}`;
      }
      return `${val.slice(0, i)}${res}`;
    }
    function checkBounds(buf, offset, byteLength2) {
      validateNumber(offset, "offset");
      if (buf[offset] === void 0 || buf[offset + byteLength2] === void 0) {
        boundsError(offset, buf.length - (byteLength2 + 1));
      }
    }
    function checkIntBI(value2, min, max, buf, offset, byteLength2) {
      if (value2 > max || value2 < min) {
        const n = typeof min === "bigint" ? "n" : "";
        let range;
        if (byteLength2 > 3) {
          if (min === 0 || min === BigInt(0)) {
            range = `>= 0${n} and < 2${n} ** ${(byteLength2 + 1) * 8}${n}`;
          } else {
            range = `>= -(2${n} ** ${(byteLength2 + 1) * 8 - 1}${n}) and < 2 ** ${(byteLength2 + 1) * 8 - 1}${n}`;
          }
        } else {
          range = `>= ${min}${n} and <= ${max}${n}`;
        }
        throw new errors.ERR_OUT_OF_RANGE("value", range, value2);
      }
      checkBounds(buf, offset, byteLength2);
    }
    function validateNumber(value2, name) {
      if (typeof value2 !== "number") {
        throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value2);
      }
    }
    function boundsError(value2, length, type) {
      if (Math.floor(value2) !== value2) {
        validateNumber(value2, type);
        throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value2);
      }
      if (length < 0) {
        throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
      }
      throw new errors.ERR_OUT_OF_RANGE(
        type || "offset",
        `>= ${type ? 1 : 0} and <= ${length}`,
        value2
      );
    }
    var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
    function base64clean(str) {
      str = str.split("=")[0];
      str = str.trim().replace(INVALID_BASE64_RE, "");
      if (str.length < 2) return "";
      while (str.length % 4 !== 0) {
        str = str + "=";
      }
      return str;
    }
    function utf8ToBytes2(string, units) {
      units = units || Infinity;
      let codePoint;
      const length = string.length;
      let leadSurrogate = null;
      const bytes2 = [];
      for (let i = 0; i < length; ++i) {
        codePoint = string.charCodeAt(i);
        if (codePoint > 55295 && codePoint < 57344) {
          if (!leadSurrogate) {
            if (codePoint > 56319) {
              if ((units -= 3) > -1) bytes2.push(239, 191, 189);
              continue;
            } else if (i + 1 === length) {
              if ((units -= 3) > -1) bytes2.push(239, 191, 189);
              continue;
            }
            leadSurrogate = codePoint;
            continue;
          }
          if (codePoint < 56320) {
            if ((units -= 3) > -1) bytes2.push(239, 191, 189);
            leadSurrogate = codePoint;
            continue;
          }
          codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
        } else if (leadSurrogate) {
          if ((units -= 3) > -1) bytes2.push(239, 191, 189);
        }
        leadSurrogate = null;
        if (codePoint < 128) {
          if ((units -= 1) < 0) break;
          bytes2.push(codePoint);
        } else if (codePoint < 2048) {
          if ((units -= 2) < 0) break;
          bytes2.push(
            codePoint >> 6 | 192,
            codePoint & 63 | 128
          );
        } else if (codePoint < 65536) {
          if ((units -= 3) < 0) break;
          bytes2.push(
            codePoint >> 12 | 224,
            codePoint >> 6 & 63 | 128,
            codePoint & 63 | 128
          );
        } else if (codePoint < 1114112) {
          if ((units -= 4) < 0) break;
          bytes2.push(
            codePoint >> 18 | 240,
            codePoint >> 12 & 63 | 128,
            codePoint >> 6 & 63 | 128,
            codePoint & 63 | 128
          );
        } else {
          throw new Error("Invalid code point");
        }
      }
      return bytes2;
    }
    function asciiToBytes(str) {
      const byteArray = [];
      for (let i = 0; i < str.length; ++i) {
        byteArray.push(str.charCodeAt(i) & 255);
      }
      return byteArray;
    }
    function utf16leToBytes(str, units) {
      let c, hi, lo;
      const byteArray = [];
      for (let i = 0; i < str.length; ++i) {
        if ((units -= 2) < 0) break;
        c = str.charCodeAt(i);
        hi = c >> 8;
        lo = c % 256;
        byteArray.push(lo);
        byteArray.push(hi);
      }
      return byteArray;
    }
    function base64ToBytes(str) {
      return base64.toByteArray(base64clean(str));
    }
    function blitBuffer(src, dst, offset, length) {
      let i;
      for (i = 0; i < length; ++i) {
        if (i + offset >= dst.length || i >= src.length) break;
        dst[i + offset] = src[i];
      }
      return i;
    }
    function isInstance(obj, type) {
      return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
    }
    function numberIsNaN(obj) {
      return obj !== obj;
    }
    var hexSliceLookupTable = (function() {
      const alphabet = "0123456789abcdef";
      const table = new Array(256);
      for (let i = 0; i < 16; ++i) {
        const i16 = i * 16;
        for (let j = 0; j < 16; ++j) {
          table[i16 + j] = alphabet[i] + alphabet[j];
        }
      }
      return table;
    })();
    function defineBigIntMethod(fn) {
      return typeof BigInt === "undefined" ? BufferBigIntNotDefined : fn;
    }
    function BufferBigIntNotDefined() {
      throw new Error("BigInt not supported");
    }
  }
});

// ../../sdk/buffer.mjs
var import_buffer, portableCompare, portableIndexOf, nativeByteIndexOf;
var init_buffer = __esm({
  "../../sdk/buffer.mjs"() {
    import_buffer = __toESM(require_buffer(), 1);
    portableCompare = import_buffer.Buffer.compare;
    import_buffer.Buffer.compare = function compare(a, b) {
      if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return portableCompare(a, b);
      if (a === b) return 0;
      const length = Math.min(a.byteLength, b.byteLength);
      let at = 0;
      if (length >= 64) {
        const left = new DataView(a.buffer, a.byteOffset, a.byteLength), right = new DataView(b.buffer, b.byteOffset, b.byteLength);
        for (; at + 4 <= length; at += 4) if (left.getUint32(at) !== right.getUint32(at)) break;
      }
      for (; at < length; at++) if (a[at] !== b[at]) return a[at] < b[at] ? -1 : 1;
      return a.byteLength === b.byteLength ? 0 : a.byteLength < b.byteLength ? -1 : 1;
    };
    portableIndexOf = import_buffer.Buffer.prototype.indexOf;
    nativeByteIndexOf = Uint8Array.prototype.indexOf;
    import_buffer.Buffer.prototype.indexOf = function indexOf(needle, offset, encoding) {
      if (!import_buffer.Buffer.isBuffer(needle) || !needle.length || encoding !== void 0 || offset !== void 0 && (!Number.isInteger(offset) || offset > 2147483647 || offset < -2147483648)) return portableIndexOf.call(this, needle, offset, encoding);
      const start = offset === void 0 ? 0 : offset < 0 ? Math.max(0, this.length + offset) : offset, last = this.length - needle.length;
      for (let at = nativeByteIndexOf.call(this, needle[0], start); at >= 0 && at <= last; at = nativeByteIndexOf.call(this, needle[0], at + 1)) {
        let n = 1;
        while (n < needle.length && this[at + n] === needle[n]) n++;
        if (n === needle.length) return at;
      }
      return -1;
    };
  }
});

// ../../sdk/node_modules/@noble/hashes/esm/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data6) {
  if (typeof data6 === "string")
    data6 = utf8ToBytes(data6);
  abytes(data6);
  return data6;
}
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
var Hash, wrapConstructor;
var init_utils = __esm({
  "../../sdk/node_modules/@noble/hashes/esm/utils.js"() {
    /*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    Hash = class {
    };
    wrapConstructor = createHasher;
  }
});

// ../../sdk/node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value2, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value2, isLE);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value2 >> _32n & _u32_max);
  const wl = Number(value2 & _u32_max);
  const h = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD, SHA256_IV;
var init_md = __esm({
  "../../sdk/node_modules/@noble/hashes/esm/_md.js"() {
    init_utils();
    HashMD = class extends Hash {
      constructor(blockLen, outputLen, padOffset, isLE) {
        super();
        this.finished = false;
        this.length = 0;
        this.pos = 0;
        this.destroyed = false;
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE;
        this.buffer = new Uint8Array(blockLen);
        this.view = createView(this.buffer);
      }
      update(data6) {
        aexists(this);
        data6 = toBytes(data6);
        abytes(data6);
        const { view, buffer, blockLen } = this;
        const len = data6.length;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          if (take === blockLen) {
            const dataView = createView(data6);
            for (; blockLen <= len - pos; pos += blockLen)
              this.process(dataView, pos);
            continue;
          }
          buffer.set(data6.subarray(pos, pos + take), this.pos);
          this.pos += take;
          pos += take;
          if (this.pos === blockLen) {
            this.process(view, 0);
            this.pos = 0;
          }
        }
        this.length += data6.length;
        this.roundClean();
        return this;
      }
      digestInto(out) {
        aexists(this);
        aoutput(out, this);
        this.finished = true;
        const { buffer, view, blockLen, isLE } = this;
        let { pos } = this;
        buffer[pos++] = 128;
        clean(this.buffer.subarray(pos));
        if (this.padOffset > blockLen - pos) {
          this.process(view, 0);
          pos = 0;
        }
        for (let i = pos; i < blockLen; i++)
          buffer[i] = 0;
        setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
        this.process(view, 0);
        const oview = createView(out);
        const len = this.outputLen;
        if (len % 4)
          throw new Error("_sha2: outputLen should be aligned to 32bit");
        const outLen = len / 4;
        const state2 = this.get();
        if (outLen > state2.length)
          throw new Error("_sha2: outputLen bigger than state");
        for (let i = 0; i < outLen; i++)
          oview.setUint32(4 * i, state2[i], isLE);
      }
      digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
      }
      _cloneInto(to) {
        to || (to = new this.constructor());
        to.set(...this.get());
        const { blockLen, buffer, length, finished, destroyed, pos } = this;
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        if (length % blockLen)
          to.buffer.set(buffer);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
    };
    SHA256_IV = /* @__PURE__ */ Uint32Array.from([
      1779033703,
      3144134277,
      1013904242,
      2773480762,
      1359893119,
      2600822924,
      528734635,
      1541459225
    ]);
  }
});

// ../../sdk/node_modules/@noble/hashes/esm/sha2.js
var SHA256_K, SHA256_W, SHA256;
var init_sha2 = __esm({
  "../../sdk/node_modules/@noble/hashes/esm/sha2.js"() {
    init_md();
    init_utils();
    SHA256_K = /* @__PURE__ */ Uint32Array.from([
      1116352408,
      1899447441,
      3049323471,
      3921009573,
      961987163,
      1508970993,
      2453635748,
      2870763221,
      3624381080,
      310598401,
      607225278,
      1426881987,
      1925078388,
      2162078206,
      2614888103,
      3248222580,
      3835390401,
      4022224774,
      264347078,
      604807628,
      770255983,
      1249150122,
      1555081692,
      1996064986,
      2554220882,
      2821834349,
      2952996808,
      3210313671,
      3336571891,
      3584528711,
      113926993,
      338241895,
      666307205,
      773529912,
      1294757372,
      1396182291,
      1695183700,
      1986661051,
      2177026350,
      2456956037,
      2730485921,
      2820302411,
      3259730800,
      3345764771,
      3516065817,
      3600352804,
      4094571909,
      275423344,
      430227734,
      506948616,
      659060556,
      883997877,
      958139571,
      1322822218,
      1537002063,
      1747873779,
      1955562222,
      2024104815,
      2227730452,
      2361852424,
      2428436474,
      2756734187,
      3204031479,
      3329325298
    ]);
    SHA256_W = /* @__PURE__ */ new Uint32Array(64);
    SHA256 = class extends HashMD {
      constructor(outputLen = 32) {
        super(64, outputLen, 8, false);
        this.A = SHA256_IV[0] | 0;
        this.B = SHA256_IV[1] | 0;
        this.C = SHA256_IV[2] | 0;
        this.D = SHA256_IV[3] | 0;
        this.E = SHA256_IV[4] | 0;
        this.F = SHA256_IV[5] | 0;
        this.G = SHA256_IV[6] | 0;
        this.H = SHA256_IV[7] | 0;
      }
      get() {
        const { A, B, C, D, E, F, G, H } = this;
        return [A, B, C, D, E, F, G, H];
      }
      // prettier-ignore
      set(A, B, C, D, E, F, G, H) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
        this.E = E | 0;
        this.F = F | 0;
        this.G = G | 0;
        this.H = H | 0;
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4)
          SHA256_W[i] = view.getUint32(offset, false);
        for (let i = 16; i < 64; i++) {
          const W15 = SHA256_W[i - 15];
          const W2 = SHA256_W[i - 2];
          const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
          const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
          SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
        }
        let { A, B, C, D, E, F, G, H } = this;
        for (let i = 0; i < 64; i++) {
          const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
          const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
          const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
          const T2 = sigma0 + Maj(A, B, C) | 0;
          H = G;
          G = F;
          F = E;
          E = D + T1 | 0;
          D = C;
          C = B;
          B = A;
          A = T1 + T2 | 0;
        }
        A = A + this.A | 0;
        B = B + this.B | 0;
        C = C + this.C | 0;
        D = D + this.D | 0;
        E = E + this.E | 0;
        F = F + this.F | 0;
        G = G + this.G | 0;
        H = H + this.H | 0;
        this.set(A, B, C, D, E, F, G, H);
      }
      roundClean() {
        clean(SHA256_W);
      }
      destroy() {
        this.set(0, 0, 0, 0, 0, 0, 0, 0);
        clean(this.buffer);
      }
    };
  }
});

// ../../sdk/node_modules/@noble/hashes/esm/sha256.js
var SHA2562;
var init_sha256 = __esm({
  "../../sdk/node_modules/@noble/hashes/esm/sha256.js"() {
    init_sha2();
    SHA2562 = SHA256;
  }
});

// ../../sdk/node_modules/@noble/hashes/esm/hmac.js
var HMAC, hmac;
var init_hmac = __esm({
  "../../sdk/node_modules/@noble/hashes/esm/hmac.js"() {
    init_utils();
    HMAC = class extends Hash {
      constructor(hash2, _key) {
        super();
        this.finished = false;
        this.destroyed = false;
        ahash(hash2);
        const key = toBytes(_key);
        this.iHash = hash2.create();
        if (typeof this.iHash.update !== "function")
          throw new Error("Expected instance of class which extends utils.Hash");
        this.blockLen = this.iHash.blockLen;
        this.outputLen = this.iHash.outputLen;
        const blockLen = this.blockLen;
        const pad = new Uint8Array(blockLen);
        pad.set(key.length > blockLen ? hash2.create().update(key).digest() : key);
        for (let i = 0; i < pad.length; i++)
          pad[i] ^= 54;
        this.iHash.update(pad);
        this.oHash = hash2.create();
        for (let i = 0; i < pad.length; i++)
          pad[i] ^= 54 ^ 92;
        this.oHash.update(pad);
        clean(pad);
      }
      update(buf) {
        aexists(this);
        this.iHash.update(buf);
        return this;
      }
      digestInto(out) {
        aexists(this);
        abytes(out, this.outputLen);
        this.finished = true;
        this.iHash.digestInto(out);
        this.oHash.update(out);
        this.oHash.digestInto(out);
        this.destroy();
      }
      digest() {
        const out = new Uint8Array(this.oHash.outputLen);
        this.digestInto(out);
        return out;
      }
      _cloneInto(to) {
        to || (to = Object.create(Object.getPrototypeOf(this), {}));
        const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
        to = to;
        to.finished = finished;
        to.destroyed = destroyed;
        to.blockLen = blockLen;
        to.outputLen = outputLen;
        to.oHash = oHash._cloneInto(to.oHash);
        to.iHash = iHash._cloneInto(to.iHash);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
      destroy() {
        this.destroyed = true;
        this.oHash.destroy();
        this.iHash.destroy();
      }
    };
    hmac = (hash2, key, message) => new HMAC(hash2, key).update(message).digest();
    hmac.create = (hash2, key) => new HMAC(hash2, key);
  }
});

// ../../sdk/crypto.mjs
function hmacSha256(key, value2) {
  if (!hostSha256()) return import_buffer.Buffer.from(hmac(nobleSha256, bytes(key), bytes(value2)));
  let material = bytes(key), derived = false;
  if (material.length > 64) {
    material = createHash("sha256").update(material).digest();
    derived = true;
  }
  const innerPad = new Uint8Array(64).fill(54), outerPad = new Uint8Array(64).fill(92);
  for (let i = 0; i < material.length; i++) {
    innerPad[i] ^= material[i];
    outerPad[i] ^= material[i];
  }
  let inner, outer;
  try {
    inner = createHash("sha256");
    inner.update(innerPad).update(value2);
    const middle = inner.digest();
    outer = createHash("sha256");
    return outer.update(outerPad).update(middle).digest();
  } finally {
    inner?.destroy();
    outer?.destroy();
    innerPad.fill(0);
    outerPad.fill(0);
    if (derived) material.fill(0);
  }
}
function canonicalJson(value2) {
  const ancestors = /* @__PURE__ */ new Set();
  let nodes = 0;
  function visit(value3, depth) {
    if (depth > 64 || ++nodes > 1e5) throw new TypeError("Wire values exceed the nesting or node limit.");
    if (value3 === null || typeof value3 === "string" || typeof value3 === "boolean") return JSON.stringify(value3);
    if (typeof value3 === "number") {
      if (!Number.isFinite(value3) || Number.isInteger(value3) && !Number.isSafeInteger(value3)) throw new TypeError("Wire numbers must be finite and lossless.");
      return JSON.stringify(value3);
    }
    if (!value3 || typeof value3 !== "object" || !Array.isArray(value3) && Object.getPrototypeOf(value3) !== Object.prototype && Object.getPrototypeOf(value3) !== null) throw new TypeError("Wire values must use plain JSON.");
    if (ancestors.has(value3)) throw new TypeError("Wire values cannot contain cycles.");
    ancestors.add(value3);
    try {
      if (Array.isArray(value3)) {
        const entries = [];
        for (let i = 0; i < value3.length; i++) {
          if (!Object.hasOwn(value3, i)) throw new TypeError("Wire arrays cannot contain holes.");
          entries.push(visit(value3[i], depth + 1));
        }
        return "[" + entries.join(",") + "]";
      }
      return "{" + Object.keys(value3).sort().map((k) => {
        if (["__proto__", "prototype", "constructor"].includes(k)) throw new TypeError("Prototype keys are forbidden.");
        const property = Object.getOwnPropertyDescriptor(value3, k);
        if (!property || !Object.hasOwn(property, "value")) throw new TypeError("Wire values cannot contain accessors.");
        return JSON.stringify(k) + ":" + visit(property.value, depth + 1);
      }).join(",") + "}";
    } finally {
      ancestors.delete(value3);
    }
  }
  return visit(value2, 0);
}
function createHash(algorithm) {
  if (algorithm !== "sha256") throw new TypeError("Only SHA-256 is supported.");
  if (hostSha256()) {
    let binaryUpdate = function(data6) {
      if (!data6.length) update(id2, new ArrayBuffer(0));
      for (let offset = 0; offset < data6.length; offset += 65536) {
        const end = Math.min(data6.length, offset + 65536);
        update(id2, data6.buffer.slice(data6.byteOffset + offset, data6.byteOffset + end));
      }
    }, textUpdate = function(value2) {
      if (typeof value2 !== "string") throw TypeError("A primitive format-hash string is required.");
      if (finished2) throw new Error("Hash already finalized.");
      if (!value2.length) {
        updateText(id2, "");
        return api2;
      }
      for (let offset = 0; offset < value2.length; ) {
        let end = Math.min(value2.length, offset + 65536), chunk = value2.slice(offset, end);
        if (ascii.test(chunk)) {
          updateText(id2, chunk);
          offset = end;
          continue;
        }
        end = Math.min(value2.length, offset + 16384);
        const last = value2.charCodeAt(end - 1), next = value2.charCodeAt(end);
        if (last >= 55296 && last <= 56319 && next >= 56320 && next <= 57343) end--;
        chunk = value2.slice(offset, end);
        if (unsafeFfi.test(chunk)) binaryUpdate(bytes(chunk));
        else updateText(id2, chunk);
        offset = end;
      }
      return api2;
    };
    const init = globalThis.__saveriftSha256Init, update = globalThis.__saveriftSha256Update, final = globalThis.__saveriftSha256Final, abort = globalThis.__saveriftSha256Abort;
    const updateText = typeof globalThis.__saveriftSha256UpdateText === "function" ? globalThis.__saveriftSha256UpdateText : null;
    const id2 = init();
    let finished2 = false;
    const ascii = /^[\x01-\x7f]*$/, unsafeFfi = /[\u0000\ud800-\udfff\ufeff]/;
    const api2 = {
      update(value2) {
        if (finished2) throw new Error("Hash already finalized.");
        if (updateText && typeof value2 === "string") return textUpdate(value2);
        binaryUpdate(bytes(value2));
        return api2;
      },
      digest(encoding) {
        if (finished2) throw new Error("Hash already finalized.");
        finished2 = true;
        const out = import_buffer.Buffer.from(new Uint8Array(final(id2)));
        return encoding ? out.toString(encoding) : out;
      },
      destroy() {
        if (finished2) return;
        finished2 = true;
        abort(id2);
      }
    };
    if (updateText) api2.updateText = textUpdate;
    return api2;
  }
  const state2 = nobleSha256.create();
  let finished = false;
  const api = { update(value2) {
    if (finished) throw new Error("Hash already finalized.");
    state2.update(bytes(value2));
    return api;
  }, digest(encoding) {
    if (finished) throw new Error("Hash already finalized.");
    finished = true;
    const out = import_buffer.Buffer.from(state2.digest());
    return encoding ? out.toString(encoding) : out;
  }, destroy() {
    finished = true;
    state2.destroy();
  } };
  return api;
}
function randomBytes(length) {
  if (!Number.isSafeInteger(length) || length < 1 || length > 64) throw new RangeError("Random requests are limited to 64 bytes.");
  if (typeof globalThis.__saveriftRandom === "function") return import_buffer.Buffer.from(globalThis.__saveriftRandom(length));
  if (globalThis.crypto?.getRandomValues) return import_buffer.Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(length)));
  throw new Error("Secure runtime randomness is unavailable.");
}
function equal(a, b) {
  a = bytes(a);
  b = bytes(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
var SHA256_K2, InterpreterSHA256, nobleSha256, bytes, hostSha256, sha2562, hash, formatCrypto;
var init_crypto = __esm({
  "../../sdk/crypto.mjs"() {
    init_sha256();
    init_utils();
    init_hmac();
    init_buffer();
    SHA256_K2 = new Int32Array([
      1116352408,
      1899447441,
      3049323471,
      3921009573,
      961987163,
      1508970993,
      2453635748,
      2870763221,
      3624381080,
      310598401,
      607225278,
      1426881987,
      1925078388,
      2162078206,
      2614888103,
      3248222580,
      3835390401,
      4022224774,
      264347078,
      604807628,
      770255983,
      1249150122,
      1555081692,
      1996064986,
      2554220882,
      2821834349,
      2952996808,
      3210313671,
      3336571891,
      3584528711,
      113926993,
      338241895,
      666307205,
      773529912,
      1294757372,
      1396182291,
      1695183700,
      1986661051,
      2177026350,
      2456956037,
      2730485921,
      2820302411,
      3259730800,
      3345764771,
      3516065817,
      3600352804,
      4094571909,
      275423344,
      430227734,
      506948616,
      659060556,
      883997877,
      958139571,
      1322822218,
      1537002063,
      1747873779,
      1955562222,
      2024104815,
      2227730452,
      2361852424,
      2428436474,
      2756734187,
      3204031479,
      3329325298
    ]);
    InterpreterSHA256 = class extends SHA2562 {
      constructor() {
        super();
        this.words = new Int32Array(64);
      }
      process(view, offset) {
        const w = this.words;
        for (let i = 0; i < 16; i++, offset += 4) w[i] = view.getUint32(offset, false);
        for (let i = 16; i < 64; i++) {
          const x = w[i - 15], y = w[i - 2];
          const s0 = (x >>> 7 | x << 25) ^ (x >>> 18 | x << 14) ^ x >>> 3;
          const s1 = (y >>> 17 | y << 15) ^ (y >>> 19 | y << 13) ^ y >>> 10;
          w[i] = s1 + w[i - 7] + s0 + w[i - 16] | 0;
        }
        let a = this.A, b = this.B, c = this.C, d = this.D, e = this.E, f = this.F, g = this.G, h = this.H;
        for (let i = 0; i < 64; i++) {
          const s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
          const t1 = h + s1 + (e & f ^ ~e & g) + SHA256_K2[i] + w[i] | 0;
          const s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
          const t2 = s0 + (a & b ^ a & c ^ b & c) | 0;
          h = g;
          g = f;
          f = e;
          e = d + t1 | 0;
          d = c;
          c = b;
          b = a;
          a = t1 + t2 | 0;
        }
        this.A = this.A + a | 0;
        this.B = this.B + b | 0;
        this.C = this.C + c | 0;
        this.D = this.D + d | 0;
        this.E = this.E + e | 0;
        this.F = this.F + f | 0;
        this.G = this.G + g | 0;
        this.H = this.H + h | 0;
      }
      roundClean() {
        this.words.fill(0);
      }
      destroy() {
        super.destroy();
        this.words.fill(0);
      }
    };
    nobleSha256 = wrapConstructor(() => new InterpreterSHA256());
    bytes = (value2) => typeof value2 === "string" ? import_buffer.Buffer.from(value2) : value2 instanceof Uint8Array ? value2 : new Uint8Array(value2);
    hostSha256 = () => ["Init", "Update", "Final", "Abort"].every((name) => typeof globalThis["__saveriftSha256" + name] === "function");
    sha2562 = (value2) => hostSha256() ? createHash("sha256").update(value2).digest("hex") : import_buffer.Buffer.from(nobleSha256(bytes(value2))).toString("hex");
    hash = sha2562;
    formatCrypto = Object.freeze({
      getRandomValues(array) {
        const data6 = randomBytes(array.byteLength);
        array.set(data6);
        return array;
      },
      subtle: Object.freeze({
        async importKey(format, key, algorithm, _extractable, usages) {
          const hashName = typeof algorithm?.hash === "string" ? algorithm.hash : algorithm?.hash?.name;
          if (format !== "raw" || algorithm?.name !== "HMAC" || hashName !== "SHA-256" || !Array.isArray(usages) || usages.some((x) => x !== "sign" && x !== "verify")) throw new TypeError("Only raw format HMAC-SHA256 keys are supported.");
          return Object.freeze({ bytes: import_buffer.Buffer.from(bytes(key)), usages: [...usages] });
        },
        async sign(algorithm, key, value2) {
          if (algorithm !== "HMAC" || !key.usages.includes("sign")) throw new TypeError("Unsupported format signature.");
          const out = hmacSha256(key.bytes, value2);
          return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
        },
        async verify(algorithm, key, signature, value2) {
          if (algorithm !== "HMAC" || !key.usages.includes("verify")) throw new TypeError("Unsupported format signature.");
          return equal(hmacSha256(key.bytes, value2), signature);
        }
      })
    });
  }
});

// src/data-provider.mjs
function neutral(id2) {
  const zero = "0".repeat(64), manifest = { revision: "numeric-fallback.v1", effectiveSha256: zero, upstreamSha256: zero, recipeSha256: zero, catalogRevision: "numeric-fallback.v1:" + zero, compatibleSchemaSha256: [CURRENT], titleId: "1754076455", displayOnly: true, permission: "provider_unavailable" };
  const value2 = { schema: "saverift.missing-data-provider.v1", revision: "numeric-fallback.v1", manifest, items: [], equipment: [], companions: [], systemCharacters: [], entries: [], unavailable: [], balanceDefinitions: [], columns: [], runtimeRequirements: {}, source: { state: "provider_unavailable" }, nativeSchema: { schemaSha256: CURRENT, types: {} }, schemaSha256: CURRENT, templates: [], schemas: {}, nativeTypes: {}, newFieldsOmittedByType: {}, types: {}, targets: {}, selection: {}, assets: [], curatedAssets: [], coverage: {}, packs: [], presets: [], characters: [], chapterPairs: [], profiles: [], sourceType: "normalized_reference_summary", rawSaveIncluded: false, accountIdentifiersIncluded: false, titleId: "1754076455", starter: null };
  if (id2 === "crimson-adventure-display.json") value2.manifest = { ...manifest, skillOwnerMapping: "unverified", unlockMapping: "unverified", mapCoordinateMapping: "unverified" };
  return value2;
}
function getData(id2) {
  const stored = stores.get(id2);
  if (!stored) return neutral(id2);
  if (!stored.value) {
    const bytes2 = stored.bytes ?? import_buffer.Buffer.from(stored.read());
    if (bytes2.length !== stored.byteLength || !stored.verified && hash(bytes2) !== stored.sha256) throw Object.assign(new Error("Reference artifact bytes changed."), { code: "DATA_PROVIDER_DIGEST_MISMATCH" });
    stored.value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes2));
    stored.bytes = null;
    stored.read = null;
  }
  return stored.value;
}
function dataProviderStatus() {
  return { schema: "saverift.crimson-provider-status.v1", providers: [...stores].map(([id2, p]) => ({ id: id2, sha256: p.sha256, byteLength: p.byteLength, distribution: p.distribution })), fallback: !stores.size };
}
function configureDataProviders(providers = [], { expected = [], synthetic = false, verifiedArtifacts = [] } = {}) {
  if (installed) throw Object.assign(new Error("Data providers are immutable for this isolated session."), { code: "DATA_PROVIDER_ALREADY_BOUND" });
  const pins = new Map(expected.map((x) => [x.id, x]));
  for (const provider of providers) {
    const { id: id2 } = provider;
    if (typeof id2 !== "string" || !/^[a-z0-9-]+\.json$/.test(id2) || stores.has(id2)) throw Object.assign(new Error("Duplicate or invalid data provider."), { code: "DATA_PROVIDER_INVALID" });
    const bytes2 = provider.bytes ? import_buffer.Buffer.from(provider.bytes) : null, byteLength = bytes2?.length ?? provider.byteLength, verified = verifiedArtifacts.find((a) => a.id === provider.artifactId && a.sha256 === provider.sha256 && a.byteLength === byteLength), sha2563 = verified ? verified.sha256 : bytes2 ? hash(bytes2) : null, pin = pins.get(id2);
    if (!Number.isSafeInteger(byteLength) || byteLength > 4 * 1024 * 1024 || sha2563 !== provider.sha256 || !bytes2 && (!verified || typeof provider.read !== "function") || !synthetic && (!pin || pin.sha256 !== sha2563 || pin.byteLength !== byteLength)) throw Object.assign(new Error("The data provider does not match its immutable pin."), { code: "DATA_PROVIDER_DIGEST_MISMATCH" });
    stores.set(id2, { bytes: bytes2, read: provider.read, verified: Boolean(verified), value: null, sha256: sha2563, byteLength, distribution: synthetic ? "synthetic_test_only" : "restricted_pending_review" });
  }
  installed = true;
  return dataProviderStatus();
}
var CURRENT, stores, installed;
var init_data_provider = __esm({
  "src/data-provider.mjs"() {
    init_crypto();
    init_buffer();
    CURRENT = "8427f58057ea9bf6dac35bc139cba163ddb135cfe89d748a2d36b94eec88d668";
    stores = /* @__PURE__ */ new Map();
    installed = false;
  }
});

// src/source-binding.mjs
function verifyBackup(source) {
  if (verifiedSources.has(source)) return true;
  if (source?.schema !== "saverift.crimson-artifact-source.v1" || source.source !== "plugin_bundle" || !Array.isArray(source.containers) || source.containers.length > 128) return false;
  let total = 0, count2 = 0;
  const seen = /* @__PURE__ */ new Set();
  try {
    for (const c of source.containers) {
      if (typeof c.index?.fileName !== "string" || seen.has(c.index.fileName) || !Array.isArray(c.blobs)) return false;
      seen.add(c.index.fileName);
      const names = /* @__PURE__ */ new Set();
      for (const b of c.blobs) {
        const bytes2 = import_buffer.Buffer.from(b.data, "base64");
        if (names.has(b.name) || bytes2.length !== b.size || bytes2.length > 8 * 1024 * 1024 || bytes2.toString("base64") !== b.data || hash(bytes2) !== b.sha256) return false;
        names.add(b.name);
        total += bytes2.length;
        count2++;
      }
    }
  } catch {
    return false;
  }
  return total === source.totalBytes && count2 === source.blobCount && total <= 8 * 1024 * 1024;
}
function assertSourceBinding(source, metadata3, input) {
  if (!verifyBackup(source) || metadata3?.complete !== true || typeof metadata3.id !== "string" || !metadata3.id || !digest.test(metadata3.sha256 || "") || !digest.test(source.revision || "")) throw new ProbeError("Selected artifact bytes are incomplete or changed.", 409, "CRIMSON_ARTIFACT_SOURCE_INVALID");
  if (input && (input.backupSha256 !== metadata3.sha256 || input.backupRevision !== source.revision)) throw new ProbeError("The plan belongs to another artifact bundle.", 409, "CRIMSON_ARTIFACT_SOURCE_CHANGED");
  return source;
}
function assertOfflineDraftCapability({ schemaSha256, saveVersion, payload }) {
  if (!digest.test(schemaSha256 || "") || saveVersion !== 2 || payload !== "save") throw new ProbeError("This format cannot be compiled.", 409, "CRIMSON_FORMAT_CAPABILITY_UNSUPPORTED");
}
function sourceFromBundle(bundle, ctx, { lazy = false } = {}) {
  if (typeof bundle?.id !== "string" || !bundle.id || !digest.test(bundle.bundleDigest || "") || !Array.isArray(bundle.artifacts)) throw new ProbeError("Selected artifact bundle metadata is invalid.", 409, "CRIMSON_ARTIFACT_SOURCE_INVALID");
  const ids2 = /* @__PURE__ */ new Map(), selected2 = [];
  for (const entry of bundle.artifacts) {
    const artifact = Object.freeze({ ...entry });
    if (["reference-data", "preset-source"].includes(artifact.role)) continue;
    const parts = artifact.logicalPath.split("/"), name = artifact.role === "main" || artifact.role === "save" ? "save" : artifact.role === "sidecar" || artifact.role === "lobby" ? "lobby" : parts.at(-1);
    if (!["save", "lobby"].includes(name)) continue;
    const container = parts.length > 1 ? parts.slice(0, -1).join("/") : bundle.hints?.container || "slot100,savedgame", key = container + "/" + name;
    if (!/^slot\d{1,3},savedgame$/.test(container)) throw new ProbeError("The selected game file mapping is unsupported.", 409, "CRIMSON_CONTAINER_MAPPING_UNSUPPORTED");
    if (ids2.has(key) || !Number.isSafeInteger(artifact.byteLength) || artifact.byteLength < 0 || artifact.byteLength > 8 * 1024 * 1024 || !digest.test(artifact.sha256 || "")) throw new ProbeError("Selected artifact descriptors are incomplete or duplicate.", 409, "CRIMSON_ARTIFACT_SOURCE_INVALID");
    ids2.set(key, artifact);
    selected2.push({ artifact, container, name });
  }
  const metadata3 = Object.freeze({ id: bundle.id, complete: true, sha256: bundle.bundleDigest });
  let source;
  function materialize() {
    if (source) return source;
    const grouped = /* @__PURE__ */ new Map(), encoded = /* @__PURE__ */ new Map();
    let totalBytes = 0, blobCount = 0;
    for (const { artifact, container, name } of selected2) {
      const bytes2 = import_buffer.Buffer.from(ctx.readArtifact(artifact.id));
      if (bytes2.length !== artifact.byteLength || hash(bytes2) !== artifact.sha256) throw new ProbeError("Selected artifact bytes changed.", 409, "CRIMSON_ARTIFACT_SOURCE_CHANGED");
      encoded.set(container + "/" + name, bytes2);
      totalBytes += bytes2.length;
      blobCount++;
      if (totalBytes > 8 * 1024 * 1024) throw new ProbeError("Selected artifact bytes exceed the format-source limit.", 409, "CRIMSON_ARTIFACT_SOURCE_INVALID");
      let encodedText;
      const row = Object.freeze({ name, size: bytes2.length, get data() {
        return encodedText ??= bytes2.toString("base64");
      }, sha256: artifact.sha256, artifactId: artifact.id }), c = grouped.get(container) || { index: Object.freeze({ fileName: container }), blobs: [] };
      c.blobs.push(row);
      grouped.set(container, c);
    }
    if (grouped.size > 128) throw new ProbeError("Selected artifact containers exceed the format-source limit.", 409, "CRIMSON_ARTIFACT_SOURCE_INVALID");
    const containers = Object.freeze([...grouped.values()].map((c) => Object.freeze({ ...c, blobs: Object.freeze(c.blobs) })));
    const result2 = Object.freeze({ schema: "saverift.crimson-artifact-source.v1", source: "plugin_bundle", revision: metadata3.sha256, containers, totalBytes, blobCount });
    verifiedSources.add(result2);
    sourceContexts.set(result2, ctx);
    sourceBytes.set(result2, encoded);
    assertSourceBinding(result2, metadata3);
    source = result2;
    return source;
  }
  const result = { metadata: metadata3, ids: ids2, get source() {
    return materialize();
  } };
  if (!lazy) materialize();
  return result;
}
function bindPreparedSource(source, metadata3, { context, container, payload, payloadSha256, decoded, document, projection }) {
  assertSourceBinding(source, metadata3);
  const blob = source.containers.find((c) => c.index.fileName === container)?.blobs.find((b) => b.name === payload);
  if (!verifiedSources.has(source) || sourceContexts.get(source) !== context || !blob || blob.sha256 !== payloadSha256 || document?.plaintext !== decoded?.plaintext || !import_buffer.Buffer.isBuffer(decoded?.plaintext) || !import_buffer.Buffer.isBuffer(decoded?.header) || decoded.header.length !== 128 || !digest.test(document?.plaintextSha256 || "") || !digest.test(document?.schemaSha256 || "")) throw new ProbeError("Prepared format source is not this verified snapshot.", 409, "CRIMSON_PREPARED_SOURCE_INVALID");
  const encoded = sourceBytes.get(source)?.get(container + "/" + payload);
  if (!encoded || encoded.length !== blob.size) throw new ProbeError("Prepared format bytes are unavailable.", 409, "CRIMSON_PREPARED_SOURCE_INVALID");
  preparedSources.set(source, Object.freeze({ context, executionLock: context.executionLock, lockBinding: JSON.stringify(context.executionLock ?? null), lockDigest: context.executionLock?.digest, metadata: metadata3, revision: source.revision, container, payload, payloadSha256, encoded, decoded, document, projection, plaintextSha256: document.plaintextSha256, schemaSha256: document.schemaSha256, headerSha256: hash(decoded.header), version: decoded.version, flags: decoded.flags }));
}
function preparedSource(source, metadata3, input) {
  const snapshot = preparedSources.get(source);
  if (!snapshot) return null;
  assertSourceBinding(source, metadata3, input);
  if (!verifiedSources.has(source) || snapshot.context !== sourceContexts.get(source) || snapshot.executionLock !== snapshot.context.executionLock || snapshot.lockBinding !== JSON.stringify(snapshot.context.executionLock ?? null) || snapshot.lockDigest !== snapshot.context.executionLock?.digest || snapshot.revision !== source.revision || snapshot.container !== input.container || snapshot.payload !== input.payload || snapshot.payloadSha256 !== input.payloadSha256 || snapshot.document.plaintextSha256 !== snapshot.plaintextSha256 || snapshot.document.schemaSha256 !== snapshot.schemaSha256 || snapshot.plaintextSha256 !== input.plaintextSha256 || snapshot.schemaSha256 !== input.schemaSha256) throw new ProbeError("Prepared format source belongs to a different snapshot.", 409, "CRIMSON_PREPARED_SOURCE_CHANGED");
  return snapshot;
}
async function preparedSourceNativeParity(source, metadata3, input, decoded, encoded, encoder) {
  if (typeof encoder !== "function") throw TypeError("A native format encoder is required.");
  const snapshot = preparedSource(source, metadata3, input);
  const changed = () => {
    throw new ProbeError("The original format bytes changed before native verification.", 409, "CRIMSON_PREPARED_SOURCE_CHANGED");
  };
  function integrity() {
    if (!snapshot) assertSourceBinding(source, metadata3, input);
    if (!import_buffer.Buffer.isBuffer(encoded) || encoded.length < 128 || !import_buffer.Buffer.isBuffer(decoded?.plaintext) || !import_buffer.Buffer.isBuffer(decoded?.header) || decoded.header.length !== 128) changed();
    const encodedSha256 = hash(encoded), plaintextSha256 = hash(decoded.plaintext), headerSha256 = hash(decoded.header), version = decoded.version, flags = decoded.flags;
    if (encodedSha256 !== input.payloadSha256 || plaintextSha256 !== input.plaintextSha256 || !decoded.header.equals(encoded.subarray(0, 128)) || version !== decoded.header.readUInt16LE(4) || flags !== decoded.header.readUInt16LE(6)) changed();
    if (snapshot && (preparedSource(source, metadata3, input) !== snapshot || encodedSha256 !== snapshot.payloadSha256 || plaintextSha256 !== snapshot.plaintextSha256 || headerSha256 !== snapshot.headerSha256 || version !== snapshot.version || flags !== snapshot.flags)) changed();
    return { encodedSha256, plaintextSha256, headerSha256, version, flags };
  }
  const before = integrity(), cacheable = snapshot && snapshot.metadata === metadata3 && snapshot.decoded === decoded && snapshot.encoded === encoded && snapshot.document.plaintext === decoded.plaintext, witness = cacheable && nativeParityWitnesses.get(snapshot);
  if (witness && witness.encoder === encoder && Object.keys(before).every((key) => before[key] === witness[key])) return true;
  const result = await encoder(decoded.plaintext, decoded.header, { nonce: decoded.header.subarray(26, 42) });
  const after = integrity();
  if (Object.keys(before).some((key) => before[key] !== after[key])) changed();
  if (!import_buffer.Buffer.isBuffer(result) || !result.equals(encoded)) return false;
  if (cacheable) nativeParityWitnesses.set(snapshot, Object.freeze({ ...after, encoder }));
  return true;
}
var ProbeError, digest, verifiedSources, sourceContexts, sourceBytes, preparedSources, nativeParityWitnesses;
var init_source_binding = __esm({
  "src/source-binding.mjs"() {
    init_buffer();
    init_crypto();
    ProbeError = class extends Error {
      constructor(message, status = 409, code = "CRIMSON_SOURCE_INVALID") {
        super(message);
        this.name = "CrimsonOperationError";
        this.status = status;
        this.code = code;
      }
    };
    digest = /^[a-f0-9]{64}$/;
    verifiedSources = /* @__PURE__ */ new WeakSet();
    sourceContexts = /* @__PURE__ */ new WeakMap();
    sourceBytes = /* @__PURE__ */ new WeakMap();
    preparedSources = /* @__PURE__ */ new WeakMap();
    nativeParityWitnesses = /* @__PURE__ */ new WeakMap();
  }
});

// ../../sdk/lz4-block.mjs
function compressStandardLz4Block(data6) {
  if (!(data6 instanceof Uint8Array) || data6.length < 1 || data6.length > MAX_INPUT) throw new RangeError("Standard LZ4 input must be 1 byte to 8 MiB.");
  const size = data6.length, small = size < 65547, table = new Uint32Array(small ? 8192 : 4096);
  const input = import_buffer.Buffer.from(data6.buffer, data6.byteOffset, data6.byteLength), view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const out = import_buffer.Buffer.allocUnsafe(size + Math.floor(size / 255) + 16);
  let ip = 0, anchor = 0, op = 0;
  const read32 = (p) => view.getUint32(p, true);
  function positionHash(p) {
    const a = read32(p);
    if (small) return Math.imul(a, 2654435761) >>> 0 >>> 19;
    const a0 = a & 65535, a1 = a >>> 16, low = a0 * 56507, middle = a1 * 56507 + a0 * 7100 + (low >>> 16);
    const high = (middle >>> 16) + a1 * 7100;
    const highByte = high + (a0 & 255) * 207 + input[p + 4] * 187 & 255;
    return highByte << 4 | middle >>> 12 & 15;
  }
  function length(n) {
    while (n >= 255) {
      out[op++] = 255;
      n -= 255;
    }
    out[op++] = n;
  }
  function literals(end) {
    const count2 = end - anchor, token = op++;
    out[token] = Math.min(count2, 15) << 4;
    if (count2 >= 15) length(count2 - 15);
    out.set(input.subarray(anchor, end), op);
    op += count2;
    return token;
  }
  if (size >= 13) {
    table[positionHash(0)] = 0;
    ip = 1;
    let forwardHash = positionHash(ip);
    const searchLimit = size - 11, matchLimit = size - 5;
    main: for (; ; ) {
      let match, forward = ip, step = 1, searchCount = 64;
      for (; ; ) {
        const h = forwardHash, current = forward;
        match = table[h];
        ip = forward;
        forward += step;
        step = searchCount++ >>> 6;
        if (forward > searchLimit) break main;
        forwardHash = positionHash(forward);
        table[h] = current;
        if (current - match <= 65535 && read32(match) === read32(ip)) break;
      }
      while (ip > anchor && match > 0 && input[ip - 1] === input[match - 1]) {
        ip--;
        match--;
      }
      let token = literals(ip);
      for (; ; ) {
        const offset = ip - match;
        out[op++] = offset;
        out[op++] = offset >>> 8;
        let end = ip + 4, ref = match + 4;
        while (end < matchLimit && input[end] === input[ref]) {
          end++;
          ref++;
        }
        const matchCode = end - ip - 4;
        ip = end;
        out[token] += Math.min(matchCode, 15);
        if (matchCode >= 15) length(matchCode - 15);
        anchor = ip;
        if (ip >= searchLimit) break main;
        table[positionHash(ip - 2)] = ip - 2;
        const h = positionHash(ip);
        match = table[h];
        table[h] = ip;
        if (ip - match <= 65535 && read32(match) === read32(ip)) {
          token = op++;
          out[token] = 0;
          continue;
        }
        forwardHash = positionHash(++ip);
        break;
      }
    }
  }
  literals(size);
  if (op > out.length) throw new RangeError("Standard LZ4 output exceeded its bounded allocation.");
  return out.subarray(0, op);
}
var STANDARD_LZ4_PROFILE, MAX_INPUT;
var init_lz4_block = __esm({
  "../../sdk/lz4-block.mjs"() {
    init_buffer();
    STANDARD_LZ4_PROFILE = "lz4-standard-x64-le-acceleration1.v1";
    MAX_INPUT = 8 * 1024 * 1024;
  }
});

// src/lz4-standard.mjs
function compressStandardLz4(data6) {
  if (!(data6 instanceof Uint8Array) || data6.length < 1 || data6.length > 8 * 1024 * 1024) throw new RangeError("Standard LZ4 input must be 1 byte to 8 MiB.");
  if (typeof globalThis.__saveriftLz4Compress !== "function") return compressStandardLz4Block(data6);
  const input = data6.byteOffset === 0 && data6.byteLength === data6.buffer.byteLength ? data6.buffer : data6.buffer.slice(data6.byteOffset, data6.byteOffset + data6.byteLength);
  return import_buffer.Buffer.from(globalThis.__saveriftLz4Compress(input));
}
var init_lz4_standard = __esm({
  "src/lz4-standard.mjs"() {
    init_buffer();
    init_lz4_block();
  }
});

// ../../sdk/format-binary.mjs
function chacha20Block(data6, key, nonce) {
  key = import_buffer.Buffer.from(key.buffer, key.byteOffset, key.byteLength);
  nonce = import_buffer.Buffer.from(nonce.buffer, nonce.byteOffset, nonce.byteLength);
  if (key.length !== 32 || nonce.length !== 16) fail2("Invalid ChaCha20 key or nonce.");
  const state2 = new Uint32Array(16);
  state2.set([1634760805, 857760878, 2036477234, 1797285236]);
  for (let i = 0; i < 8; i++) state2[4 + i] = key.readUInt32LE(i * 4);
  for (let i = 0; i < 4; i++) state2[12 + i] = nonce.readUInt32LE(i * 4);
  const output = import_buffer.Buffer.alloc(data6.length), block = import_buffer.Buffer.alloc(64);
  for (let pos = 0; pos < data6.length; pos += 64) {
    let x0 = state2[0] | 0, x1 = state2[1] | 0, x2 = state2[2] | 0, x3 = state2[3] | 0, x4 = state2[4] | 0, x5 = state2[5] | 0, x6 = state2[6] | 0, x7 = state2[7] | 0, x8 = state2[8] | 0, x9 = state2[9] | 0, x10 = state2[10] | 0, x11 = state2[11] | 0, x12 = state2[12] | 0, x13 = state2[13] | 0, x14 = state2[14] | 0, x15 = state2[15] | 0;
    for (let i = 0; i < 10; i++) {
      x0 = x0 + x4 | 0;
      x12 ^= x0;
      x12 = x12 << 16 | x12 >>> 16 | 0;
      x8 = x8 + x12 | 0;
      x4 ^= x8;
      x4 = x4 << 12 | x4 >>> 20 | 0;
      x0 = x0 + x4 | 0;
      x12 ^= x0;
      x12 = x12 << 8 | x12 >>> 24 | 0;
      x8 = x8 + x12 | 0;
      x4 ^= x8;
      x4 = x4 << 7 | x4 >>> 25 | 0;
      x1 = x1 + x5 | 0;
      x13 ^= x1;
      x13 = x13 << 16 | x13 >>> 16 | 0;
      x9 = x9 + x13 | 0;
      x5 ^= x9;
      x5 = x5 << 12 | x5 >>> 20 | 0;
      x1 = x1 + x5 | 0;
      x13 ^= x1;
      x13 = x13 << 8 | x13 >>> 24 | 0;
      x9 = x9 + x13 | 0;
      x5 ^= x9;
      x5 = x5 << 7 | x5 >>> 25 | 0;
      x2 = x2 + x6 | 0;
      x14 ^= x2;
      x14 = x14 << 16 | x14 >>> 16 | 0;
      x10 = x10 + x14 | 0;
      x6 ^= x10;
      x6 = x6 << 12 | x6 >>> 20 | 0;
      x2 = x2 + x6 | 0;
      x14 ^= x2;
      x14 = x14 << 8 | x14 >>> 24 | 0;
      x10 = x10 + x14 | 0;
      x6 ^= x10;
      x6 = x6 << 7 | x6 >>> 25 | 0;
      x3 = x3 + x7 | 0;
      x15 ^= x3;
      x15 = x15 << 16 | x15 >>> 16 | 0;
      x11 = x11 + x15 | 0;
      x7 ^= x11;
      x7 = x7 << 12 | x7 >>> 20 | 0;
      x3 = x3 + x7 | 0;
      x15 ^= x3;
      x15 = x15 << 8 | x15 >>> 24 | 0;
      x11 = x11 + x15 | 0;
      x7 ^= x11;
      x7 = x7 << 7 | x7 >>> 25 | 0;
      x0 = x0 + x5 | 0;
      x15 ^= x0;
      x15 = x15 << 16 | x15 >>> 16 | 0;
      x10 = x10 + x15 | 0;
      x5 ^= x10;
      x5 = x5 << 12 | x5 >>> 20 | 0;
      x0 = x0 + x5 | 0;
      x15 ^= x0;
      x15 = x15 << 8 | x15 >>> 24 | 0;
      x10 = x10 + x15 | 0;
      x5 ^= x10;
      x5 = x5 << 7 | x5 >>> 25 | 0;
      x1 = x1 + x6 | 0;
      x12 ^= x1;
      x12 = x12 << 16 | x12 >>> 16 | 0;
      x11 = x11 + x12 | 0;
      x6 ^= x11;
      x6 = x6 << 12 | x6 >>> 20 | 0;
      x1 = x1 + x6 | 0;
      x12 ^= x1;
      x12 = x12 << 8 | x12 >>> 24 | 0;
      x11 = x11 + x12 | 0;
      x6 ^= x11;
      x6 = x6 << 7 | x6 >>> 25 | 0;
      x2 = x2 + x7 | 0;
      x13 ^= x2;
      x13 = x13 << 16 | x13 >>> 16 | 0;
      x8 = x8 + x13 | 0;
      x7 ^= x8;
      x7 = x7 << 12 | x7 >>> 20 | 0;
      x2 = x2 + x7 | 0;
      x13 ^= x2;
      x13 = x13 << 8 | x13 >>> 24 | 0;
      x8 = x8 + x13 | 0;
      x7 ^= x8;
      x7 = x7 << 7 | x7 >>> 25 | 0;
      x3 = x3 + x4 | 0;
      x14 ^= x3;
      x14 = x14 << 16 | x14 >>> 16 | 0;
      x9 = x9 + x14 | 0;
      x4 ^= x9;
      x4 = x4 << 12 | x4 >>> 20 | 0;
      x3 = x3 + x4 | 0;
      x14 ^= x3;
      x14 = x14 << 8 | x14 >>> 24 | 0;
      x9 = x9 + x14 | 0;
      x4 ^= x9;
      x4 = x4 << 7 | x4 >>> 25 | 0;
    }
    if (pos + 64 <= data6.length) {
      let word;
      word = x0 + state2[0] | 0;
      output[pos + 0] = data6[pos + 0] ^ word;
      output[pos + 1] = data6[pos + 1] ^ word >>> 8;
      output[pos + 2] = data6[pos + 2] ^ word >>> 16;
      output[pos + 3] = data6[pos + 3] ^ word >>> 24;
      word = x1 + state2[1] | 0;
      output[pos + 4] = data6[pos + 4] ^ word;
      output[pos + 5] = data6[pos + 5] ^ word >>> 8;
      output[pos + 6] = data6[pos + 6] ^ word >>> 16;
      output[pos + 7] = data6[pos + 7] ^ word >>> 24;
      word = x2 + state2[2] | 0;
      output[pos + 8] = data6[pos + 8] ^ word;
      output[pos + 9] = data6[pos + 9] ^ word >>> 8;
      output[pos + 10] = data6[pos + 10] ^ word >>> 16;
      output[pos + 11] = data6[pos + 11] ^ word >>> 24;
      word = x3 + state2[3] | 0;
      output[pos + 12] = data6[pos + 12] ^ word;
      output[pos + 13] = data6[pos + 13] ^ word >>> 8;
      output[pos + 14] = data6[pos + 14] ^ word >>> 16;
      output[pos + 15] = data6[pos + 15] ^ word >>> 24;
      word = x4 + state2[4] | 0;
      output[pos + 16] = data6[pos + 16] ^ word;
      output[pos + 17] = data6[pos + 17] ^ word >>> 8;
      output[pos + 18] = data6[pos + 18] ^ word >>> 16;
      output[pos + 19] = data6[pos + 19] ^ word >>> 24;
      word = x5 + state2[5] | 0;
      output[pos + 20] = data6[pos + 20] ^ word;
      output[pos + 21] = data6[pos + 21] ^ word >>> 8;
      output[pos + 22] = data6[pos + 22] ^ word >>> 16;
      output[pos + 23] = data6[pos + 23] ^ word >>> 24;
      word = x6 + state2[6] | 0;
      output[pos + 24] = data6[pos + 24] ^ word;
      output[pos + 25] = data6[pos + 25] ^ word >>> 8;
      output[pos + 26] = data6[pos + 26] ^ word >>> 16;
      output[pos + 27] = data6[pos + 27] ^ word >>> 24;
      word = x7 + state2[7] | 0;
      output[pos + 28] = data6[pos + 28] ^ word;
      output[pos + 29] = data6[pos + 29] ^ word >>> 8;
      output[pos + 30] = data6[pos + 30] ^ word >>> 16;
      output[pos + 31] = data6[pos + 31] ^ word >>> 24;
      word = x8 + state2[8] | 0;
      output[pos + 32] = data6[pos + 32] ^ word;
      output[pos + 33] = data6[pos + 33] ^ word >>> 8;
      output[pos + 34] = data6[pos + 34] ^ word >>> 16;
      output[pos + 35] = data6[pos + 35] ^ word >>> 24;
      word = x9 + state2[9] | 0;
      output[pos + 36] = data6[pos + 36] ^ word;
      output[pos + 37] = data6[pos + 37] ^ word >>> 8;
      output[pos + 38] = data6[pos + 38] ^ word >>> 16;
      output[pos + 39] = data6[pos + 39] ^ word >>> 24;
      word = x10 + state2[10] | 0;
      output[pos + 40] = data6[pos + 40] ^ word;
      output[pos + 41] = data6[pos + 41] ^ word >>> 8;
      output[pos + 42] = data6[pos + 42] ^ word >>> 16;
      output[pos + 43] = data6[pos + 43] ^ word >>> 24;
      word = x11 + state2[11] | 0;
      output[pos + 44] = data6[pos + 44] ^ word;
      output[pos + 45] = data6[pos + 45] ^ word >>> 8;
      output[pos + 46] = data6[pos + 46] ^ word >>> 16;
      output[pos + 47] = data6[pos + 47] ^ word >>> 24;
      word = x12 + state2[12] | 0;
      output[pos + 48] = data6[pos + 48] ^ word;
      output[pos + 49] = data6[pos + 49] ^ word >>> 8;
      output[pos + 50] = data6[pos + 50] ^ word >>> 16;
      output[pos + 51] = data6[pos + 51] ^ word >>> 24;
      word = x13 + state2[13] | 0;
      output[pos + 52] = data6[pos + 52] ^ word;
      output[pos + 53] = data6[pos + 53] ^ word >>> 8;
      output[pos + 54] = data6[pos + 54] ^ word >>> 16;
      output[pos + 55] = data6[pos + 55] ^ word >>> 24;
      word = x14 + state2[14] | 0;
      output[pos + 56] = data6[pos + 56] ^ word;
      output[pos + 57] = data6[pos + 57] ^ word >>> 8;
      output[pos + 58] = data6[pos + 58] ^ word >>> 16;
      output[pos + 59] = data6[pos + 59] ^ word >>> 24;
      word = x15 + state2[15] | 0;
      output[pos + 60] = data6[pos + 60] ^ word;
      output[pos + 61] = data6[pos + 61] ^ word >>> 8;
      output[pos + 62] = data6[pos + 62] ^ word >>> 16;
      output[pos + 63] = data6[pos + 63] ^ word >>> 24;
    } else {
      block.writeUInt32LE(x0 + state2[0] >>> 0, 0);
      block.writeUInt32LE(x1 + state2[1] >>> 0, 4);
      block.writeUInt32LE(x2 + state2[2] >>> 0, 8);
      block.writeUInt32LE(x3 + state2[3] >>> 0, 12);
      block.writeUInt32LE(x4 + state2[4] >>> 0, 16);
      block.writeUInt32LE(x5 + state2[5] >>> 0, 20);
      block.writeUInt32LE(x6 + state2[6] >>> 0, 24);
      block.writeUInt32LE(x7 + state2[7] >>> 0, 28);
      block.writeUInt32LE(x8 + state2[8] >>> 0, 32);
      block.writeUInt32LE(x9 + state2[9] >>> 0, 36);
      block.writeUInt32LE(x10 + state2[10] >>> 0, 40);
      block.writeUInt32LE(x11 + state2[11] >>> 0, 44);
      block.writeUInt32LE(x12 + state2[12] >>> 0, 48);
      block.writeUInt32LE(x13 + state2[13] >>> 0, 52);
      block.writeUInt32LE(x14 + state2[14] >>> 0, 56);
      block.writeUInt32LE(x15 + state2[15] >>> 0, 60);
      for (let i = 0; i < 64 && pos + i < data6.length; i++) output[pos + i] = data6[pos + i] ^ block[i];
    }
    state2[12] = state2[12] + 1 >>> 0;
    if (!state2[12]) state2[13] = state2[13] + 1 >>> 0;
  }
  return output;
}
function inflateLz4Block(input, size) {
  input = import_buffer.Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (!Number.isSafeInteger(size) || size < 1 || size > limit) fail2("The declared decompressed size exceeds the inspection limit.", "CRIMSON_SIZE_LIMIT");
  const out = import_buffer.Buffer.alloc(size);
  let ip = 0, op = 0;
  function length(base) {
    let n = base;
    if (base === 15) {
      let b;
      do {
        if (ip >= input.length) fail2("Truncated LZ4 length.");
        b = input[ip++];
        n += b;
        if (n > limit) fail2("LZ4 length exceeds the limit.", "CRIMSON_SIZE_LIMIT");
      } while (b === 255);
    }
    return n;
  }
  while (ip < input.length) {
    const token = input[ip++], literal = length(token >>> 4);
    if (ip + literal > input.length || op + literal > size) fail2("LZ4 literal exceeds its declared bounds.");
    input.copy(out, op, ip, ip + literal);
    ip += literal;
    op += literal;
    if (ip === input.length) break;
    if (ip + 2 > input.length) fail2("Truncated LZ4 match offset.");
    const offset = input.readUInt16LE(ip);
    ip += 2;
    if (!offset || offset > op) fail2("Invalid LZ4 match offset.");
    const match = length(token & 15) + 4;
    if (op + match > size) fail2("LZ4 match exceeds the declared output size.");
    for (let i = 0; i < match; i++) {
      out[op] = out[op - offset];
      op++;
    }
  }
  if (op !== size) fail2("LZ4 output length does not match the SAVE header.");
  return out;
}
var fail2, limit;
var init_format_binary = __esm({
  "../../sdk/format-binary.mjs"() {
    init_buffer();
    fail2 = (message) => {
      throw new RangeError(message);
    };
    limit = 32 * 1024 * 1024;
  }
});

// src/crimson-document.mjs
var crimson_document_exports = {};
__export(crimson_document_exports, {
  DECODER_REVISION: () => DECODER_REVISION,
  elements: () => elements,
  field: () => field,
  readDocument: () => readDocument,
  value: () => value
});
function readDocument(raw, { listLimit = 200, fieldListLimits = {}, captureTypes, scalarFields: scalarFields2, onScalar, onLocator, onObject, compareTo, hashPlaintext = true } = {}) {
  if (captureTypes !== void 0 && (!Array.isArray(captureTypes) || captureTypes.some((t) => typeof t !== "string"))) fail3("Invalid typed projection.");
  if (scalarFields2 !== void 0 && (!Array.isArray(scalarFields2) || scalarFields2.length > 1024 || scalarFields2.some((t) => typeof t !== "string" || !t.length || t.length > 256))) fail3("Invalid scalar projection.");
  if (typeof hashPlaintext !== "boolean") fail3("Invalid plaintext digest option.");
  if (!fieldListLimits || typeof fieldListLimits !== "object" || Array.isArray(fieldListLimits) || Object.values(fieldListLimits).some((n) => !Number.isInteger(n) || n < 0 || n > 1024)) fail3("Invalid field projection limit.");
  const schema = parcSchema(raw), audit = { objects: 0, fields: 0, absentScalars: 0, omittedListMarkers: 0, objectLists: 0, nonzeroListMetadata: 0, nonzeroListSamples: [], advisoryLocators: 0, unconsumedBytes: 0 }, blocks = [];
  const observed = scalarFields2 === void 0 ? null : new Set(scalarFields2), profiles = schema.types.map((type) => {
    const flags = new Uint8Array(type.fields.length), limits = [];
    type.fields.forEach((def, index) => {
      const t = def.type.toLowerCase(), n = def.size;
      const mode = t === "bool" && n === 1 ? 1 : t === "float3" && n === 12 ? 2 : (t === "float4" || t === "quaternion") && n === 16 ? 3 : t.includes("float") && n === 4 ? 4 : t.includes("float") && n === 8 ? 5 : n === 8 ? t.startsWith("int") ? 6 : 7 : [1, 2, 4].includes(n) ? t.startsWith("int") ? 8 : 9 : 0;
      flags[index] = mode | (def.kind === 4 || def.kind === 5 || def.kind === 6 || def.kind === 7 ? 16 : 0) | (onScalar && (!observed || observed.has(def.name) || observed.has(type.name + "." + def.name)) ? 32 : 0);
      limits.push(fieldListLimits[type.name + "." + def.name] ?? listLimit);
    });
    return { flags, limits };
  }), decoder = new TextDecoder("utf-8", { fatal: true });
  if (compareTo && compareTo.length !== raw.length) fail3("A decoded diff requires unchanged document length.");
  const rawView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), comparisonView = compareTo ? new DataView(compareTo.buffer, compareTo.byteOffset, compareTo.byteLength) : null;
  const decodedDiff = [];
  let comparedLeafFields = 0;
  let budget = 0, validateUnprojectedStrings = false;
  function need(pos, n, end) {
    if (!Number.isSafeInteger(n) || n < 0 || pos < 0 || pos + n > end || pos + n > raw.length) fail3(`Typed field exceeds its region at ${pos}.`);
  }
  const u163 = (p, e) => {
    need(p, 2, e);
    return raw.readUInt16LE(p);
  };
  const u323 = (p, e) => {
    need(p, 4, e);
    return raw.readUInt32LE(p);
  };
  function scalar(p, f, mode, source = raw) {
    const n = f.size, view = source === raw ? rawView : comparisonView;
    if (mode === 1) return source[p] !== 0;
    if (mode === 2) return [view.getFloat32(p, true), view.getFloat32(p + 4, true), view.getFloat32(p + 8, true)];
    if (mode === 3) return [view.getFloat32(p, true), view.getFloat32(p + 4, true), view.getFloat32(p + 8, true), view.getFloat32(p + 12, true)];
    if (mode === 4) return view.getFloat32(p, true);
    if (mode === 5) return view.getFloat64(p, true);
    if (mode === 6 || mode === 7) return (mode === 6 ? view.getBigInt64(p, true) : view.getBigUint64(p, true)).toString();
    if (mode === 8) return n === 1 ? view.getInt8(p) : n === 2 ? view.getInt16(p, true) : view.getInt32(p, true);
    if (mode === 9) return n === 1 ? view.getUint8(p) : n === 2 ? view.getUint16(p, true) : view.getUint32(p, true);
    return { encoding: "opaque", bytes: n, hex: source.subarray(p, p + n).toString("hex") };
  }
  function locator(start, end, path, capture, depth, kind = 4) {
    let p = start;
    if (kind === 5) {
      let found = false;
      for (let d = 0; d <= 8; d++) {
        if (p + d + 2 <= end) {
          const n = raw.readUInt16LE(p + d);
          if (n >= 1 && n <= 16) {
            p += d;
            found = true;
            break;
          }
        }
      }
      if (!found) fail3(`Unsupported pointer prefix at ${start}.`);
    }
    const count2 = u163(p, end);
    if (count2 < 1 || count2 > 16) fail3(`Invalid locator mask at ${p}.`);
    const maskStart = p + 2, typePos = maskStart + count2, wrapperEnd = typePos + 15;
    need(p, wrapperEnd - p, end);
    const typeIndex = u163(typePos, end), type = schema.types[typeIndex];
    if (!type) fail3(`Invalid child type at ${typePos}.`);
    const advertised = u323(typePos + 11, end);
    if (advertised !== wrapperEnd) audit.advisoryLocators++;
    onLocator?.({ path, wrapperStart: start, wrapperEnd, typeIndex, typeName: type.name, pointerOffset: typePos + 11, advertisedPayloadOffset: advertised });
    const child = object(type, raw.subarray(maskStart, typePos), wrapperEnd, end, path, capture, depth + 1, true);
    if (capture) Object.assign(child, { wrapperStart: start, wrapperEnd, advertisedPayloadOffset: advertised, wrapperBytes: raw.subarray(start, wrapperEnd) });
    return child;
  }
  function object(type, mask, start, end, path, capture, depth, inline) {
    if (depth > 48 || ++budget > 15e5) fail3("Typed document traversal limit exceeded.");
    audit.objects++;
    let p = start + 4;
    need(start, 4, end);
    const fields = capture ? {} : null, profile3 = profiles[type.index];
    for (let i = 0; i < type.fields.length; i++) {
      const def = type.fields[i], flags = profile3.flags[i], mode = flags & 15, watch = flags & 32, present = Boolean(mask[i >> 3] & 1 << (i & 7)), begin = p, fieldPath = present && (capture || watch || onScalar && flags & 16) ? path + "." + def.name : path, retainedLimit = capture ? profile3.limits[i] : listLimit;
      let value2 = null, count2;
      if (++audit.fields > 3e6) fail3("Typed field traversal limit exceeded.");
      if (!present) {
        if (def.kind === 3 || def.kind === 6 || def.kind === 7) {
          need(p, 1, end);
          if (raw[p] !== 1) fail3(`Missing omitted-list marker at ${path + "." + def.name} (${p}).`);
          p++;
          audit.omittedListMarkers++;
        } else audit.absentScalars++;
      } else if ((def.kind === 0 || def.kind === 2) && def.size > 0) {
        need(p, def.size, end);
        if (capture || watch) value2 = scalar(p, def, mode);
        p += def.size;
        if (watch) onScalar({ path: fieldPath, offset: begin, bytes: def.size, present: true, value: value2, type: def.type });
      } else if (def.kind === 1 && def.size > 0) {
        count2 = u323(p, end);
        p += 4;
        need(p, count2 * def.size, end);
        const isString = def.size === 1 && /string/i.test(def.type);
        if (isString && (capture || validateUnprojectedStrings)) {
          const decoded = decoder.decode(raw.subarray(p, p + count2)).replace(/\0+$/, "");
          if (capture) value2 = decoded;
        } else if (capture) value2 = { encoding: "opaque", count: count2, bytes: count2 * def.size };
        p += count2 * def.size;
      } else if (def.kind === 3 && def.size > 0) {
        need(p, 5, end);
        if (raw[p] !== 0) fail3(`Invalid dynamic-array tag at ${fieldPath}.`);
        count2 = u323(p + 1, end);
        p += 5;
        need(p, count2 * def.size, end);
        if (count2 > 1e5) fail3("Primitive array exceeds inspection limit.");
        if (capture) value2 = Array.from({ length: Math.min(count2, retainedLimit) }, (_, j) => scalar(p + j * def.size, def, mode));
        p += count2 * def.size;
      } else if (def.kind === 4 || def.kind === 5) {
        value2 = locator(p, end, fieldPath, capture, depth, def.kind);
        p = value2.end;
      } else if (def.kind === 6 || def.kind === 7) {
        need(p, 18, end);
        if (raw[p] !== 0) fail3(`Invalid object-list tag at ${fieldPath} (${p}).`);
        count2 = u323(p + 1, end);
        if (count2 > 1e5) fail3("Object list exceeds inspection limit.");
        const metadataStart = p + 5, meta = raw.subarray(metadataStart, p + 18);
        audit.objectLists++;
        if (meta.some((b) => b !== 0)) {
          audit.nonzeroListMetadata++;
          if (audit.nonzeroListSamples.length < 12) audit.nonzeroListSamples.push({ path: capture ? fieldPath : path + "." + def.name, offset: metadataStart, hex: meta.toString("hex") });
        }
        p += 18;
        const elements2 = capture ? [] : null;
        for (let j = 0; j < count2; j++) {
          const retain = capture && j < retainedLimit, child = locator(p, end, retain || onScalar ? fieldPath + "[" + j + "]" : fieldPath, retain, depth);
          p = child.end;
          if (retain) elements2.push(child);
        }
        value2 = capture ? { count: count2, elements: elements2, truncated: count2 > retainedLimit, metadataOffset: metadataStart, metadataBytes: meta } : null;
      } else fail3(`Unsupported field kind ${def.kind} at ${fieldPath}.`);
      if (compareTo && present && [0, 1, 2, 3].includes(def.kind)) {
        comparedLeafFields++;
        let differs = false;
        if (p - begin >= 64) differs = !raw.subarray(begin, p).equals(compareTo.subarray(begin, p));
        else for (let at = begin; at < p && !differs; at++) differs = raw[at] !== compareTo[at];
        if (differs) {
          if (decodedDiff.length >= 32) fail3("Decoded diff exceeds the narrow-edit limit.");
          const decode = (source) => [0, 2].includes(def.kind) ? scalar(begin, def, mode, source) : { bytes: p - begin, rawSha256: hash(source.subarray(begin, p)) };
          decodedDiff.push({ path: fieldPath === path ? path + "." + def.name : fieldPath, objectType: type.name, field: def.name, type: def.type, offset: begin, bytes: p - begin, present: true, before: decode(compareTo), after: decode(raw) });
        }
      }
      if (capture) fields[def.name] = { present, offset: begin, end: p, bytes: p - begin, type: def.type, kind: def.kind, value: value2, count: count2 };
    }
    if (inline) {
      if (u323(p, end) !== p - start) fail3(`Inline trailing size disagrees at ${path} (${p}).`);
      p += 4;
    } else if (p !== end) fail3(`Unconsumed bytes at ${path}: ${end - p}.`);
    onObject?.({ path, type: type.name, start, end: p, inline, trailerOffset: inline ? p - 4 : null });
    return { type: type.name, start, end: p, maskBytes: capture ? mask : void 0, fields };
  }
  let previous = schema.dataStart;
  for (let i = 0; i < schema.toc.length; i++) {
    const e = schema.toc[i], end = e.offset + e.bytes;
    if (e.offset !== previous) fail3("Non-contiguous or overlapping top-level blocks are unsupported.");
    previous = end;
    const maskCount = u163(e.offset, end);
    if (maskCount < 1 || maskCount > 16) fail3("Invalid root mask.");
    need(e.offset, 2 + maskCount + 4, end);
    const type = schema.types[e.classIndex], defaultCapture = selected.has(type.name) || /Player|Position|FieldContents|Friendly|Relation/.test(type.name), capture = captureTypes === void 0 ? defaultCapture : captureTypes.includes(type.name);
    validateUnprojectedStrings = captureTypes !== void 0 && defaultCapture;
    const block = object(type, raw.subarray(e.offset + 2, e.offset + 2 + maskCount), e.offset + 2 + maskCount, end, `$[${i}].${type.name}`, capture, 0, false);
    blocks.push(block);
  }
  if (previous !== raw.length) fail3("Unconsumed bytes after the final block.");
  return { revision: DECODER_REVISION, plaintext: raw, plaintextSha256: hashPlaintext ? hash(raw) : null, schemaSha256: hash(JSON.stringify(schema.types)), schema, audit, blocks, lossless: true, ...compareTo ? { decodedDiff, comparison: { comparedLeafFields, changedLeafFields: decodedDiff.length } } : {} };
}
var DECODER_REVISION, selected, fail3, field, value, elements;
var init_crimson_document = __esm({
  "src/crimson-document.mjs"() {
    init_buffer();
    init_crimson_codec();
    init_source_binding();
    DECODER_REVISION = "saveglass.parc-marker-reader.v2";
    selected = /* @__PURE__ */ new Set(["InventorySaveData", "EquipmentSaveData", "MercenaryClanSaveData", "KnowledgeSaveData", "QuestSaveData", "CharacterStatusSaveData", "PlayerSaveData", "SaveData", "GameSaveData", "ContentsMiscSaveData", "StoreSaveData", "FriendlySaveData", "TransformSaveData"]);
    fail3 = (message) => {
      throw new CodecError(message, "PARC_TYPED_INVALID");
    };
    field = (object, name) => object?.fields?.[name];
    value = (object, name) => field(object, name)?.present ? field(object, name).value : null;
    elements = (object, name) => value(object, name)?.elements || [];
  }
});

// src/crimson-policy.mjs
function quantityCapability(record, schemaSha256, saveVersion) {
  const r = FISH_QUANTITY_RULE;
  if (schemaSha256 !== r.schemaSha256 || saveVersion !== r.saveVersion) return "unsupported_schema";
  return record.inventoryKey === r.inventoryKey && record.definitionKey === r.definitionKey && record.quantity === r.expectedQuantity && record.quantityPresent && record.quantityBytes === r.fieldBytes && typeof record.instanceId === "string" && /^[1-9]\d*$/.test(record.instanceId) ? "offline_preview_available" : "unsupported_transition";
}
function quantityTarget(document, input) {
  const roots = document.blocks.filter((b) => b.type === "InventorySaveData");
  if (roots.length !== 1) return { error: "Inventory root is missing or ambiguous." };
  const list = field(roots[0], "_inventorylist");
  if (list?.value?.truncated) return { error: "The full bag list is required for this preview." };
  const bags = elements(roots[0], "_inventorylist");
  if (bags.some((b) => field(b, "_itemList")?.value?.truncated)) return { error: "The full inventory is required to check instance uniqueness." };
  const owners = bags.filter((b) => value(b, "_inventoryKey") === input.inventoryKey);
  if (owners.length !== 1) return { error: "The selected bag is missing or ambiguous." };
  const itemList = field(owners[0], "_itemList"), owned = elements(owners[0], "_itemList"), slots = owned.map((item2) => value(item2, "_slotNo"));
  if (!itemList?.present || itemList.value?.truncated || itemList.count !== owned.length || slots.some((slot) => !Number.isSafeInteger(slot) || slot < 0 || slot > 65535) || new Set(slots).size !== slots.length) return { error: "The selected inventory is incomplete or has ambiguous slots." };
  const occurrences = bags.flatMap((b) => elements(b, "_itemList")).filter((i) => value(i, "_itemNo") === input.instanceId);
  if (occurrences.length !== 1) return { error: "The item instance is missing or ambiguous." };
  const item = elements(owners[0], "_itemList").find((i) => i === occurrences[0] && value(i, "_itemKey") === input.definitionKey && value(i, "_slotNo") === input.slot);
  if (!item) return { error: "The instance, definition, bag or slot changed." };
  return { item, quantity: field(item, "_stackCount") };
}
var FISH_QUANTITY_RULE;
var init_crimson_policy = __esm({
  "src/crimson-policy.mjs"() {
    init_crimson_document();
    FISH_QUANTITY_RULE = Object.freeze({
      id: "crimson.fish-fillet.5-to-6.v1",
      operation: "inventory.setQuantity",
      saveVersion: 2,
      schemaSha256: "f73ef48c344a0a4e5ede5003d5296b586c473575bbff32e5a152cc58e45e4e7d",
      inventoryKey: 2,
      definitionKey: 1000730,
      expectedQuantity: "5",
      desiredQuantity: "6",
      fieldBytes: 8,
      referenceMaxStack: "50",
      limitStatus: "reference_only_not_game_engine_verified",
      workshopArchiveSha256: "8107ad0d900be25a64629f56f4ed7a0745bc1cd9b4a819349e35e5f51771a715"
    });
  }
});

// src/catalog/crimson-artwork-resolver.mjs
function exactItemArtwork(definitionKey, internalName) {
  if (!knownKey(definitionKey)) return null;
  const curated = curatedItems.get(definitionKey), local = localItemRows.get(definitionKey), row = itemRows.get(definitionKey);
  const canonical4 = curated?.[1] || local?.internalName || row?.[1];
  if (!canonical4 || !matches(canonical4, internalName)) return null;
  const category = categories[row?.[2]] || null;
  if (curated && localItemPath.test(curated[2])) return { definitionKey, internalName: canonical4, category, iconUrl: curated[2], sourceUrl: curated[3], source: "crimsondb_exact_curated" };
  if (local && localItemPath.test(local.localPath)) return { definitionKey, internalName: canonical4, category, iconUrl: local.localPath, sourceUrl: local.sourcePage, source: "thgl_exact_cached" };
  if (!row || row[1] !== canonical4) return null;
  return { definitionKey, internalName: canonical4, category, iconUrl: `https://cdn.th.gl/crimson-desert/icons/db/i${definitionKey}.webp`, sourceUrl: `https://crimsondesert.th.gl/db/${row[2]}/${row[3]}`, source: "thgl_exact_source_index" };
}
function exactCompanionArtwork(characterKey, internalName) {
  if (!knownKey(characterKey)) return null;
  const row = companionRows.get(characterKey);
  if (!row || !matches(row.internalName, internalName)) return null;
  const iconUrl = row.localPath && localCompanionPath.test(row.localPath) ? row.localPath : remoteCompanionPath.test(row.sourceUrl || "") ? row.sourceUrl : null;
  return iconUrl ? { characterKey, internalName: row.internalName, displayName: row.sourceName, classification: row.classification, iconUrl, sourceUrl: row.sourcePage, source: "crimsondb_exact_character_variant" } : null;
}
var itemIndex, localItems, companions, itemRows, curatedItems, localItemRows, companionRows, localItemPath, localCompanionPath, remoteCompanionPath, categories, knownKey, matches, artworkCoverage;
var init_crimson_artwork_resolver = __esm({
  "src/catalog/crimson-artwork-resolver.mjs"() {
    init_data_provider();
    itemIndex = getData("crimson-item-artwork-index.json");
    localItems = getData("crimson-content-artwork.json");
    companions = getData("crimson-companion-artwork.json");
    itemRows = new Map(itemIndex.entries.map((row) => [row[0], row]));
    curatedItems = new Map(itemIndex.curatedAssets.map((row) => [row[0], row]));
    localItemRows = new Map(localItems.assets.map((row) => [row.definitionKey, row]));
    companionRows = new Map(companions.assets.map((row) => [row.characterKey, row]));
    localItemPath = /^\/assets\/(?:crimsondb\/items\/[a-z_]+\/[a-f0-9]{8}|crimson-thgl\/items\/i\d+)\.webp$/;
    localCompanionPath = /^\/assets\/crimsondb\/(?:pets|vehicles\/portraits)\/[a-f0-9]{8}\.webp$/;
    remoteCompanionPath = /^https:\/\/crimsondb\.gg\/images\/(?:pets|vehicles\/portraits)\/[a-f0-9]{8}\.webp$/;
    categories = { materials: "Materials", consumables: "Consumables", documents: "Documents", equipment: "Equipment", miscellaneous: "Misc" };
    knownKey = (key) => Number.isSafeInteger(key) && key > 0;
    matches = (expected, supplied) => supplied === void 0 || supplied === null || supplied === "" || supplied === expected;
    artworkCoverage = Object.freeze({ items: itemIndex.coverage, companions: companions.coverage });
  }
});

// src/catalog/crimson-enrichment.mjs
function displayTaxonomy(internalName) {
  if (internalName.startsWith("Collection_Prop_") || internalName.startsWith("Collection_gemstone_")) return "Collectibles";
  if (internalName.startsWith("Quest_") || internalName.startsWith("NoticePaper_")) return "Quest items";
  if (internalName.startsWith("Item_Skill_AbyssGear_")) return "Abyss gear";
  if (internalName.startsWith("Trade_")) return "Trade goods";
  if (internalName.endsWith("_Seed")) return "Seeds";
  return null;
}
function broadCategory(category) {
  if (["Helmets", "Gloves", "Boots", "Cloaks", "Armor"].includes(category)) return "Armor";
  if (["One-Handed Swords", "Two-Handed Swords", "Spears", "Axes", "Maces", "Hammers", "Bows", "Rapiers", "Cannons", "Daggers", "Muskets", "Halberds", "Shotguns", "Pistols", "Crossbows"].includes(category)) return "Weapons";
  if (["Necklaces", "Rings", "Earrings"].includes(category)) return "Accessories";
  if (["Horse Equipment", "Pet Equipment", "Dragon Equipment", "ATAG Parts"].includes(category)) return "Companion gear";
  if (category === "Backpacks") return "Bags";
  if (category === "Lanterns") return "Tools";
  if (category === "Other Equipment") return "Equipment";
  return category;
}
function itemEnrichment(itemKey, internalName) {
  const native = nativeItems.get(itemKey);
  if (!native || !internalName || native.internalName !== internalName) return null;
  const curated = curatedItems2.get(itemKey), gear2 = equipment.get(itemKey);
  const matched = curated?.internalName === internalName ? curated : null;
  const gearMatch = gear2?.internalName === internalName ? gear2 : null;
  const taxonomy = displayTaxonomy(internalName);
  const artwork = exactItemArtwork(itemKey, internalName);
  if (!matched && !gearMatch && !taxonomy && !artwork) return null;
  const subcategory = matched?.category || gearMatch?.category || taxonomy || artwork?.category || native.category;
  return {
    category: broadCategory(subcategory),
    subcategory,
    categorySource: matched ? "crimsondb_curated_crosswalk" : gearMatch ? "workshop_exact_ItemKey_internalName" : taxonomy ? "pinned_internal_name_display_taxonomy" : artwork?.category ? "thgl_exact_item_category" : "pinned_numeric_catalog",
    iconUrl: matched?.iconUrl || artwork?.iconUrl || null,
    description: matched ? descriptions[matched.name] || null : null,
    sourceUrl: matched?.sourceUrl || artwork?.sourceUrl || null,
    referenceDefaultInventory: gearMatch?.sourceDefaultInventory ?? null,
    routingVerified: false
  };
}
function companionEnrichment(characterKey) {
  const entry = characters.get(characterKey);
  return entry ? { ...entry, displayName: entry.name, classificationSource: entry.classification === "system" ? "pinned_native_characterinfo" : "workshop_exact_CharacterKey", iconUrl: entry.iconUrl || null, sourceUrl: entry.sourceUrl || null } : null;
}
var data, pinned, enrichmentManifest, nativeItems, curatedItems2, equipment, descriptions, companionCatalog, characters;
var init_crimson_enrichment = __esm({
  "src/catalog/crimson-enrichment.mjs"() {
    init_data_provider();
    init_crimson_artwork_resolver();
    data = getData("crimson-enrichment.json");
    pinned = getData("crimson-items.json");
    enrichmentManifest = Object.freeze(data.manifest);
    nativeItems = new Map(pinned.items.map((i) => [i.key, i]));
    curatedItems2 = new Map(data.items.map((i) => [i.key, i]));
    equipment = new Map(data.equipment.map((i) => [i.key, i]));
    descriptions = {
      "Fish Fillet": "Fish prepared for cooking; obtained by cleaning fish.",
      "Apple": "A sweet, crisp fruit used in cooking.",
      "Sugar": "A sweet cooking ingredient sold by grocers.",
      "Fish Porridge": "A mild dish made with fish, grain and water.",
      "Wine": "A fermented fruit drink.",
      "Timber": "Wood used in processing, crafting and construction.",
      "Fishing Rod": "A tool for catching fish in rivers and the sea.",
      "Arrow": "Standard ammunition for bows.",
      "Copper": "Pywel\u2019s everyday currency.",
      "Balton Longsword": "A mass-produced longsword named in honor of Balton.",
      "Wild Rock Honey": "Honey gathered from hives in mountain rock crevices.",
      "Ferman Plate Helm": "A plate helm named after a Delesyian knight.",
      "Meat Skewers": "Grilled skewers of meat and vegetables.",
      "Poison Arrow": "Bow ammunition that inflicts poison.",
      "Pan-Fried Marinated Meat": "Thin meat marinated with fruit and quickly stir-fried.",
      "Iron Ore": "A common metal ore used for crafting and refinement.",
      "Cloth Piece": "A small fabric scrap for practical repairs and crafting.",
      "Garlic": "A pungent cooking ingredient cultivated in Delesyia.",
      "Grape": "Sweet fruit used in a variety of dishes.",
      "Cooking Oil": "Oil used for grilling and frying.",
      "Stone": "A basic material for building and processing.",
      "Wool": "An insulating fiber and trade good.",
      "Flour": "Milled wheat used in cooking and trade.",
      "Ceramic": "A fired-clay trade good.",
      "Grilled Meat": "Meat cooked over a flame.",
      "Water": "A basic ingredient sold by grocers.",
      "Logging Axe": "A tool for cutting timber.",
      "Dried Fish": "Preserved fish prepared for storage and travel.",
      "Jerky": "Dried meat preserved for travel.",
      "Grilled Fruit": "Slow-cooked fruit served as a sweet dish.",
      "Azurite": "A blue mineral used as a gemstone.",
      "Bloodstone": "A reddish mineral that requires care during processing.",
      "Orange": "A juicy citrus fruit cultivated in southern Delesyia.",
      "Bread": "A baked grain staple.",
      "Garnet": "A red gemstone used in jewelry and decoration.",
      "Small Bone": "A light crafting material obtained from animals.",
      "Thin Hide": "Flexible hide used for light armor and decoration.",
      "Fleece": "Soft sheep wool obtained at Greymane Camp.",
      "Raspberry": "A small berry used as a cooking ingredient.",
      "Rosemary": "An aromatic herb found in Hernand and Demeniss.",
      "Fruit Tea": "A drink made by steeping fruit and herbs.",
      "Bird Meat": "Tender meat obtained from birds or a butcher.",
      "Salt-Roasted Bird Meat": "Salt-seasoned bird meat cooked until crisp.",
      "Lentils": "A grain ingredient cultivated in Hernand.",
      "Glenmore Sword": "A sword made by House Glenmore of Hernand.",
      "Sydmon Bow": "A bow named for the blacksmith Sydmon.",
      "Warspike Spear": "A spear made for House Alfonso\u2019s soldiers.",
      "Bekker Large Shield": "A worn shield named for the warrior Bekker.",
      "Scarlet Blades Cloth Armor": "Red clothing worn by the Bleed Bandits."
    };
    companionCatalog = Object.freeze(data.companions.map((c) => Object.freeze({ ...c, ...exactCompanionArtwork(c.key, c.internalName), addStatus: "unverified_disabled" })));
    characters = new Map([...companionCatalog, ...data.systemCharacters].map((c) => [c.key, c]));
  }
});

// src/catalog/crimson-adventure.mjs
function observedChapter(mission, quest) {
  const mapped = observedChapterPairs.get(`${mission}:${quest}`);
  return mapped ? { ...mapped, label: `Chapter ${mapped.number}`, mapping: "owner_verified_menu_pair", sourceUrl: adventureManifest.chapterSource } : null;
}
function normalizeAdventure({ character = {}, companions: companions2 = [], quests = {} } = {}) {
  const activeKey = character._characterKey?.present ? character._characterKey.value : null;
  const state2 = (key) => character[key]?.present ? character[key] : { present: false, value: null };
  return {
    schema: "saveglass.crimson-adventure.v1",
    displayOnly: true,
    chapter: quests.lastCompletedMission?.present && quests.lastCompletedMainQuest?.present ? observedChapter(quests.lastCompletedMission.value, quests.lastCompletedMainQuest.value) : null,
    activeCharacterKey: activeKey,
    currentHp: state2("_currentHp"),
    currentMp: state2("_currentMp"),
    characters: playableCharacters.map((entry) => {
      const active = activeKey === entry.characterKey, matching = companions2.filter((c) => c.characterKey === entry.characterKey), stored = matching.length === 1 ? matching[0] : null;
      return {
        ...entry,
        active,
        recordState: active ? "active" : stored ? "recorded" : matching.length > 1 ? "ambiguous" : "not_recorded",
        available: active ? true : null,
        availabilitySource: active ? "active_character" : "quest_event_gate_unmapped",
        currentHp: active ? state2("_currentHp") : { present: Boolean(stored?.presence?._currentHp), value: stored?.presence?._currentHp ? stored.currentHp : null },
        currentMp: active ? state2("_currentMp") : { present: Boolean(stored?.presence?._currentMp), value: stored?.presence?._currentMp ? stored.currentMp : null },
        // SkillPointOwnerType 0/1/2 is not joined by row number or CharacterKey.
        skillPointsMapping: "unverified",
        sourceUrl: adventureManifest.guideSource
      };
    }),
    source: adventureManifest
  };
}
var display, adventureManifest, playableCharacters, observedChapterPairs;
var init_crimson_adventure = __esm({
  "src/catalog/crimson-adventure.mjs"() {
    init_data_provider();
    display = getData("crimson-adventure-display.json");
    adventureManifest = Object.freeze(display.manifest);
    playableCharacters = Object.freeze(display.characters);
    observedChapterPairs = new Map(display.chapterPairs);
  }
});

// src/crimson-domain.mjs
var crimson_domain_exports = {};
__export(crimson_domain_exports, {
  CATALOG_REVISION: () => CATALOG_REVISION,
  catalogItem: () => catalogItem,
  catalogManifest: () => catalogManifest,
  normalizeCrimson: () => normalizeCrimson
});
function ownedDefinitions(document) {
  const keys2 = /* @__PURE__ */ new Set();
  let complete = true;
  function visit(node) {
    if (!node?.fields) {
      complete = false;
      return;
    }
    if (node.type === "ItemSaveData" && field(node, "_itemKey")?.present) {
      const key = value(node, "_itemKey");
      if (Number.isSafeInteger(key) && key > 0) keys2.add(key);
      else complete = false;
    }
    for (const f of Object.values(node.fields)) {
      if (f.value?.elements) {
        if (f.value.truncated || f.count !== f.value.elements.length) complete = false;
        f.value.elements.forEach(visit);
      } else if (f.value?.fields) visit(f.value);
    }
  }
  for (const root of document.blocks) if (["InventorySaveData", "EquipmentSaveData"].includes(root.type)) visit(root);
  return { ownedDefinitionKeys: [...keys2].sort((a, b) => a - b), ownershipComplete: complete, ownershipScope: "inventory_and_equipment_ItemSaveData" };
}
function normalizeCrimson(document, { saveVersion } = {}) {
  const root = (name) => document.blocks.find((b) => b.type === name), inv = root("InventorySaveData"), merc = root("MercenaryClanSaveData"), knowledge2 = root("KnowledgeSaveData"), quests = root("QuestSaveData"), status = root("CharacterStatusSaveData"), transform = root("TransformSaveData"), misc = root("ContentsMiscSaveData"), equipment2 = root("EquipmentSaveData");
  const ownership = ownedDefinitions(document), records2 = [], bags = elements(inv, "_inventorylist").map((b) => {
    const inventoryKey = value(b, "_inventoryKey"), list = field(b, "_itemList");
    for (const item of elements(b, "_itemList")) {
      const definitionKey = value(item, "_itemKey"), instanceId = value(item, "_itemNo"), quantity = field(item, "_stackCount"), entry = items.get(definitionKey), enrichment = itemEnrichment(definitionKey, entry?.internalName);
      records2.push({ id: hash(`${document.plaintextSha256}:${inventoryKey}:${instanceId}:${definitionKey}:${item.start}`).slice(0, 24), inventoryKey, instanceId, definitionKey, slot: value(item, "_slotNo"), quantity: quantity?.present ? String(quantity.value) : null, quantityPresent: Boolean(quantity?.present), quantityBytes: quantity?.present ? quantity.bytes : null, enchantLevel: value(item, "_enchantLevel"), displayName: entry?.name || `Unknown item \xB7 ${definitionKey ?? "absent"}`, searchAliases: entry?.searchAliases || [], internalName: entry?.internalName || null, category: enrichment?.category || entry?.category || "Unmapped", subcategory: enrichment?.subcategory || null, iconUrl: enrichment?.iconUrl || null, description: enrichment?.description || null, sourceUrl: enrichment?.sourceUrl || null, categorySource: enrichment?.categorySource || "pinned_numeric_catalog", catalogMatched: Boolean(entry), referenceMaxStack: entry?.referenceMaxStack || null, capabilities: { read: "typed", setQuantity: quantityCapability({ inventoryKey, definitionKey, instanceId, quantity: quantity?.present ? String(quantity.value) : null, quantityPresent: Boolean(quantity?.present), quantityBytes: quantity?.bytes }, document.schemaSha256, saveVersion), add: "unsupported", publish: "disabled" } });
    }
    return { inventoryKey, itemRecordCount: list?.count ?? 0, itemListPresent: Boolean(list?.present), storedItemCount: list?.count ?? null, retainedRecords: list?.value?.elements.length ?? 0, expansionSlots: value(b, "_varyExpandSlotCount"), baseCapacity: inventoryKey === 2 ? 50 : null, totalCapacity: inventoryKey === 2 && Number.isInteger(value(b, "_varyExpandSlotCount")) ? 50 + value(b, "_varyExpandSlotCount") : null, capacitySource: inventoryKey === 2 ? "owner_reported_base_50" : null, truncated: Boolean(list?.value?.truncated) };
  });
  const keys2 = new Set(records2.map((r) => r.definitionKey)), unknown = [...keys2].filter((k) => !items.has(k));
  const companions2 = elements(merc, "_mercenaryDataList").map((c) => {
    const characterKey = value(c, "_characterKey"), enrichment = companionEnrichment(characterKey);
    return {
      characterKey,
      instanceId: value(c, "_mercenaryNo"),
      customName: value(c, "_mercenaryName"),
      displayName: enrichment?.displayName || null,
      internalName: enrichment?.internalName || null,
      classification: enrichment?.classification || null,
      classificationSource: enrichment?.classificationSource || null,
      iconUrl: enrichment?.iconUrl || null,
      sourceUrl: enrichment?.sourceUrl || null,
      owner: value(c, "_ownedCharacterKey"),
      level: value(value(c, "_levelData"), "_level"),
      currentHp: value(c, "_currentHp"),
      currentMp: value(c, "_currentMp"),
      maxHp: null,
      maxMp: null,
      summoned: value(c, "_lastSummoned"),
      fieldKey: value(c, "_spawnFieldInfoKey"),
      position: value(c, "_spawnPosition"),
      yaw: value(c, "_spawnYaw"),
      equipmentRecords: count(c, "_equipItemList"),
      inventoryRecords: count(c, "_inventoryItemList"),
      presence: Object.fromEntries(["_mercenaryName", "_ownedCharacterKey", "_currentHp", "_currentMp", "_lastSummoned", "_spawnPosition", "_spawnFieldInfoKey"].map((k) => [k, Boolean(field(c, k)?.present)])),
      capabilities: { read: "typed", classification: enrichment ? "exact_native_key_catalog" : "unmapped", edit: "unsupported", add: "unsupported" }
    };
  });
  const summaryFields = ["_stageStateData", "_missionStateList", "_questStateList", "_questGaugeStateList"];
  const progress = { character: scalarFields(status), knowledge: { recordCount: count(knowledge2, "_list"), followLearnRecordCount: count(knowledge2, "_learnedFollowLearnKnowledge"), sample: elements(knowledge2, "_list").slice(0, 50).map(scalarFields), sampleLimit: 50 }, skillPoints: elements(knowledge2, "_skillPointSaveDataList").map((s) => ({ ownerType: state(s, "_skillPointOwnerType"), current: state(s, "_currentSkillPoint"), elapsed: state(s, "_elapsedSkillPoint") })), quests: { counts: Object.fromEntries(summaryFields.map((k) => [k, count(quests, k)])), lastCompletedMission: state(quests, "_lastCompletedMissionKey"), lastCompletedMainQuest: state(quests, "_lastCompletedMainQuestKey"), sample: elements(quests, "_questStateList").slice(0, 50).map(scalarFields), sampleLimit: 50 }, capabilities: { read: "typed_record_state", unlock: "unsupported", complete: "unsupported" } };
  progress.adventure = normalizeAdventure({ character: progress.character, companions: companions2, quests: progress.quests });
  const location = { lastField: state(transform, "_lastfieldInfoKey"), transforms: elements(transform, "_fieldSaveDataList").map((t) => ({ fieldKey: state(t, "_fieldInfoKey"), fieldTimeRaw: state(t, "_fieldTimeRaw"), position: state(t, "_position"), rotation: state(t, "_rotation") })), pins: { recordCount: count(misc, "_pinMarkerDataList"), records: elements(misc, "_pinMarkerDataList").slice(0, 50).map(scalarFields) }, coordinateSystem: "game_world_unmapped", capabilities: { read: "typed", teleport: "unsupported" } };
  const activeTransforms = location.transforms.map((entry, index) => ({ entry, index })).filter(({ entry }) => location.lastField.present && entry.fieldKey.present && entry.fieldKey.value === location.lastField.value);
  location.activeTransformIndex = activeTransforms.length === 1 ? activeTransforms[0].index : null;
  location.mapProjection = { state: "unverified", verticalAxis: "unmapped", playerMarker: false };
  return { schema: "saveglass.crimson-domains.v1", decoderRevision: DECODER_REVISION, schemaSha256: document.schemaSha256, saveVersion: saveVersion ?? null, quantityRule: FISH_QUANTITY_RULE, plaintextSha256: document.plaintextSha256, structuralValidation: "full_strict_traversal", audit: document.audit, catalog: { ...catalogManifest, revisionId: CATALOG_REVISION, coverage: { recordCount: records2.length, namedRecords: records2.filter((r) => r.catalogMatched).length, uniqueDefinitions: keys2.size, namedDefinitions: keys2.size - unknown.length, unknownDefinitionKeys: unknown, enrichedRecords: records2.filter((r) => r.categorySource !== "pinned_numeric_catalog").length, artworkRecords: records2.filter((r) => r.iconUrl).length, artworkDefinitions: new Set(records2.filter((r) => r.iconUrl).map((r) => r.definitionKey)).size, completeInventory: !bags.some((b) => b.truncated) } }, inventory: { bagCount: field(inv, "_inventorylist")?.count ?? 0, recordCount: bags.reduce((n, b) => n + (b.itemRecordCount ?? 0), 0), bags, records: records2, ...ownership }, companions: companions2, progress, location, equipment: { equipmentRecords: count(equipment2, "_list"), reserveUseRecords: count(equipment2, "_useItemSaveList") }, relationships: { friendlyRecords: count(root("FriendlySaveData"), "_friendlyDataList"), affinityRecords: count(root("FriendlySaveData"), "_playAbleAffinityDataList") }, stores: { recordCount: count(root("StoreSaveData"), "_storeDataList") }, semanticSentinels: { farmUpdateDay: state(merc, "_currentFarmUpdateDay"), lastFocusCharacter: state(merc, "_lastFocusCharacterKey") }, gates: { read: "verified_structure", existingScalar: "source_bound_compiler", structuralAdditions: "source_bound_constructor", cloudPublication: "separate_reviewed_sender", gameAcceptance: "not_established_by_decode" }, previewScope: { status: "inspection_only", message: "This view does not change your save. Edits are compiled against the selected source and validated before review and sending." } };
}
var catalog, items, CATALOG_REVISION, catalogManifest, catalogItem, state, count, scalarFields;
var init_crimson_domain = __esm({
  "src/crimson-domain.mjs"() {
    init_data_provider();
    init_crimson_document();
    init_source_binding();
    init_crimson_policy();
    init_crimson_enrichment();
    init_crimson_adventure();
    catalog = getData("crimson-items.json");
    items = new Map(catalog.items.map((i) => [i.key, i]));
    CATALOG_REVISION = catalog.manifest.revision + ":" + (catalog.manifest.effectiveSha256 || catalog.manifest.upstreamSha256);
    catalogManifest = { ...catalog.manifest, crimsonDB: { ...enrichmentManifest, status: "permitted_curated_display_enrichment" } };
    catalogItem = (key) => items.get(key) || null;
    state = (o, k) => ({ present: Boolean(field(o, k)?.present), value: value(o, k) });
    count = (o, k) => field(o, k)?.present ? field(o, k).count : null;
    scalarFields = (o) => Object.fromEntries(Object.entries(o?.fields || {}).filter(([, f]) => f.kind === 0 || f.kind === 2 || f.kind === 1).map(([k, f]) => [k, { present: f.present, value: f.value }]));
  }
});

// src/crimson-codec.mjs
var crimson_codec_exports = {};
__export(crimson_codec_exports, {
  CodecError: () => CodecError,
  chacha20: () => chacha20,
  decodeSave: () => decodeSave,
  encodeSave: () => encodeSave,
  inflateLz4: () => inflateLz4,
  inspectCrimson: () => inspectCrimson,
  inventoryCandidates: () => inventoryCandidates,
  parcSchema: () => parcSchema
});
function saveKey(version) {
  const prefixes = { 1: '^Qgbrm/.#@`zsr]\\@rvfal#"', 2: "^Pearl--#Abyss__@!!" }, prefix = prefixes[version];
  if (!prefix) fail4("This SAVE version has no verified compatibility key.", "CRIMSON_VERSION_UNSUPPORTED");
  const base = import_buffer.Buffer.from("C41B8E730DF259A637CC04E9B12F9668DA107A853E61F9224DB80AD75C13EF90", "hex").subarray(0, 31), material = import_buffer.Buffer.from(prefix + "PRIVATE_HMAC_SECRET_CHECK"), key = import_buffer.Buffer.alloc(32);
  for (let i = 0; i < 31; i++) key[i] = base[i] ^ material[i];
  return key;
}
function chacha20(data6, key, nonce) {
  if (key.length !== 32 || nonce.length !== 16) fail4("Invalid ChaCha20 key or nonce.");
  if (typeof globalThis.__saveriftChaCha20 !== "function") return chacha20Block(data6, key, nonce);
  const view = (bytes2) => bytes2.byteOffset === 0 && bytes2.byteLength === bytes2.buffer.byteLength ? bytes2.buffer : bytes2.buffer.slice(bytes2.byteOffset, bytes2.byteOffset + bytes2.byteLength);
  return import_buffer.Buffer.from(globalThis.__saveriftChaCha20(view(data6), view(key), view(nonce)));
}
function inflateLz4(input, size) {
  if (!Number.isSafeInteger(size) || size < 1 || size > limit2) fail4("The declared decompressed size exceeds the inspection limit.", "CRIMSON_SIZE_LIMIT");
  if (typeof globalThis.__saveriftLz4Decompress !== "function") return inflateLz4Block(input, size);
  const bytes2 = input.byteOffset === 0 && input.byteLength === input.buffer.byteLength ? input.buffer : input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  return import_buffer.Buffer.from(globalThis.__saveriftLz4Decompress(bytes2, size));
}
async function hmacKey(key) {
  return formatCrypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function decodeSave(bytes2) {
  if (bytes2.length < 128 || bytes2.subarray(0, 4).toString() !== "SAVE") fail4("The payload is not a Crimson SAVE envelope.");
  const version = bytes2.readUInt16LE(4), flags = bytes2.readUInt16LE(6), uncompressedSize = bytes2.readUInt32LE(18), compressedSize = bytes2.readUInt32LE(22), key = saveKey(version);
  if (flags !== 128) fail4("The SAVE compression flags are not supported by this codec.", "CRIMSON_FLAGS_UNSUPPORTED");
  if (!compressedSize || compressedSize + 128 !== bytes2.length) fail4("SAVE payload length or trailing data is unsupported.");
  const compressed = chacha20(bytes2.subarray(128), key, bytes2.subarray(26, 42));
  if (!await formatCrypto.subtle.verify("HMAC", await hmacKey(key), bytes2.subarray(42, 74), compressed)) fail4("The SAVE HMAC did not verify. No decompression or edit was attempted.", "CRIMSON_HMAC_FAILED");
  return { version, flags, compressedSize, uncompressedSize, header: import_buffer.Buffer.from(bytes2.subarray(0, 128)), plaintext: inflateLz4(compressed, uncompressedSize) };
}
async function encodeSave(plaintext, header2, { nonce = randomBytes(16) } = {}) {
  if (plaintext.length > 8 * 1024 * 1024) fail4("Re-encoding exceeds the bounded round-trip limit.", "CRIMSON_ROUNDTRIP_SIZE_LIMIT");
  const copy2 = import_buffer.Buffer.from(header2), version = copy2.readUInt16LE(4), key = saveKey(version), compressed = compressStandardLz4(plaintext);
  copy2.writeUInt32LE(plaintext.length, 18);
  copy2.writeUInt32LE(compressed.length, 22);
  nonce.copy(copy2, 26);
  import_buffer.Buffer.from(await formatCrypto.subtle.sign("HMAC", await hmacKey(key), compressed)).copy(copy2, 42);
  return import_buffer.Buffer.concat([copy2, chacha20(compressed, key, nonce)]);
}
function parcSchema(raw) {
  let pos = 14;
  function need(n) {
    if (!Number.isSafeInteger(n) || n < 0 || pos + n > raw.length) fail4("PARC schema or table is truncated.", "PARC_BOUNDS_INVALID");
  }
  function u163() {
    need(2);
    const v = raw.readUInt16LE(pos);
    pos += 2;
    return v;
  }
  function u323() {
    need(4);
    const v = raw.readUInt32LE(pos);
    pos += 4;
    return v;
  }
  function string() {
    const n = u323();
    if (n > 2048) fail4("PARC name exceeds the inspection limit.");
    need(n);
    let v;
    try {
      v = new TextDecoder("utf-8", { fatal: true }).decode(raw.subarray(pos, pos + n));
    } catch {
      fail4("PARC schema contains invalid UTF-8.", "PARC_TEXT_INVALID");
    }
    pos += n;
    return v;
  }
  if (raw.length < 20 || raw.readUInt16LE(0) !== 65535) fail4("The decoded payload has no recognized PARC header.", "PARC_NOT_RECOGNIZED");
  const roots = u323(), count2 = u163(), types2 = [];
  let totalFields = 0;
  if (count2 > 4e3) fail4("PARC type count exceeds the inspection limit.");
  for (let i = 0; i < count2; i++) {
    const name = string(), fieldCount = u163(), fields = [];
    totalFields += fieldCount;
    if (totalFields > 5e4) fail4("PARC field count exceeds the inspection limit.");
    for (let j = 0; j < fieldCount; j++) {
      const fieldName = string(), type = string(), kind = u163(), size = u163(), aux = u323();
      fields.push({ name: fieldName, type, kind, size, aux });
    }
    types2.push({ index: i, name, fields });
  }
  const reserved = u323(), entries = u323(), streamSize = u323(), toc = [];
  if (entries > 1e4) fail4("PARC object count exceeds the inspection limit.");
  need(entries * 20);
  for (let i = 0; i < entries; i++) {
    const classIndex = u323(), sentinel1 = u323(), sentinel2 = u323(), offset = u323(), bytes2 = u323();
    if (classIndex >= types2.length || offset + bytes2 > raw.length) fail4("PARC object points outside its type table or payload.", "PARC_BOUNDS_INVALID");
    toc.push({ classIndex, sentinel1, sentinel2, offset, bytes: bytes2 });
  }
  for (const e of toc) if (e.offset < pos) fail4("PARC object overlaps its schema or table.", "PARC_BOUNDS_INVALID");
  return { roots, reserved, streamSize, types: types2, toc, dataStart: pos };
}
function inventoryCandidates(raw, parsed = parcSchema(raw)) {
  const itemType = parsed.types.find((t) => t.name === "ItemSaveData");
  const expected = ["_saveVersion", "_itemNo", "_itemKey", "_slotNo", "_stackCount"];
  if (!itemType || expected.some((name, i) => itemType.fields[i]?.name !== name)) return { status: "schema_unsupported", records: [], message: "The ItemSaveData field signature has not been mapped for this save." };
  const inventory = parsed.types.find((t) => t.name === "InventorySaveData"), records2 = [], seen = /* @__PURE__ */ new Set(), sourceHash = hash(raw);
  if (!inventory) return { status: "not_present", records: [] };
  for (const entry of parsed.toc.filter((e) => e.classIndex === inventory.index)) {
    for (let offset = entry.offset + 16; offset + 34 <= entry.offset + entry.bytes; offset++) {
      if (raw.readUInt32LE(offset) !== 1 || raw.readBigUInt64LE(offset - 16) !== 0xffffffffffffffffn || seen.has(offset)) continue;
      const itemNo = raw.readBigUInt64LE(offset + 4), itemKey = raw.readUInt32LE(offset + 12), slot = raw.readUInt16LE(offset + 16), quantity = raw.readBigUInt64LE(offset + 18);
      if (itemNo < 1n || itemNo > 999999n || !itemKey || itemKey > 2147483647 || slot > 200 || quantity < 1n || quantity > 99999n) continue;
      seen.add(offset);
      records2.push({ id: hash(`${sourceHash}:${offset}:${itemNo}:${itemKey}:${slot}`).slice(0, 24), offset, itemNo: Number(itemNo), itemKey, slot, quantity: Number(quantity) });
      if (records2.length >= 1e3) fail4("Inventory candidate limit exceeded.", "CRIMSON_INVENTORY_LIMIT");
    }
  }
  return { status: "candidates_only", method: "Pinned NattKh inventory signature scan with schema and block bounds checks; item names, limits and game semantics are not yet validated.", count: records2.length, records: records2 };
}
async function inspectCrimson(bytes2, { typedCache } = {}) {
  const result = { codec: "crimson-save-envelope-v1", sourceRevision: "96e7f78fcb00d6cb5615171a7f359f0c2de5b114", semanticValidation: "unverified", editingEnabled: false };
  try {
    const decoded = await decodeSave(bytes2);
    Object.assign(result, { status: "decoded", version: decoded.version, hmac: "verified", compressedBytes: decoded.compressedSize, decompressedBytes: decoded.uncompressedSize, plaintextSha256: hash(decoded.plaintext) });
    try {
      const parsed = parcSchema(decoded.plaintext);
      result.structure = { status: "schema_and_bounds_checked", typeCount: parsed.types.length, objectCount: parsed.toc.length, classes: parsed.types.map((t) => ({ name: t.name, fieldCount: t.fields.length, fields: t.fields.map((f) => f.name) })) };
      const inventory = inventoryCandidates(decoded.plaintext, parsed);
      result.inventory = { ...inventory, records: inventory.records.slice(0, 200) };
    } catch (e) {
      if (!(e instanceof CodecError)) throw e;
      result.structure = { status: "unsupported", code: e.code, message: e.message };
    }
    try {
      const { readDocument: readDocument2 } = await Promise.resolve().then(() => (init_crimson_document(), crimson_document_exports)), { normalizeCrimson: normalizeCrimson2 } = await Promise.resolve().then(() => (init_crimson_domain(), crimson_domain_exports));
      result.domains = typedCache?.get(result.plaintextSha256) || normalizeCrimson2(readDocument2(decoded.plaintext, { fieldListLimits: { "InventoryElementSaveData._itemList": 1024, "MercenaryClanSaveData._mercenaryDataList": 1e3 } }), { saveVersion: decoded.version });
      typedCache?.set(result.plaintextSha256, result.domains);
      result.typedValidation = { status: "passed", decoderRevision: result.domains.decoderRevision, unconsumedBytes: 0 };
    } catch (e) {
      if (!(e instanceof CodecError)) throw e;
      result.typedValidation = { status: "blocked", code: e.code, message: e.message };
    }
    try {
      const encoded = await encodeSave(decoded.plaintext, decoded.header), reopened = await decodeSave(encoded);
      if (!decoded.plaintext.equals(reopened.plaintext) || reopened.version !== decoded.version) fail4("Reopened plaintext did not match.");
      result.roundTrip = { status: "passed", kind: "Unmodified plaintext re-encoded with a new nonce, then HMAC verified and reopened. No game-engine load has been tested.", bytes: encoded.length, plaintextMatches: true, originalUnchanged: true };
    } catch (e) {
      if (!(e instanceof CodecError)) throw e;
      result.roundTrip = { status: "blocked", code: e.code, message: e.message };
    }
  } catch (e) {
    if (!(e instanceof CodecError)) throw e;
    Object.assign(result, { status: "blocked", code: e.code, message: e.message });
  }
  return result;
}
var CodecError, fail4, limit2;
var init_crimson_codec = __esm({
  "src/crimson-codec.mjs"() {
    init_buffer();
    init_crypto();
    init_source_binding();
    init_lz4_standard();
    init_format_binary();
    CodecError = class extends Error {
      constructor(message, code) {
        super(message);
        this.code = code;
      }
    };
    fail4 = (message, code = "CRIMSON_FORMAT_INVALID") => {
      throw new CodecError(message, code);
    };
    limit2 = 32 * 1024 * 1024;
  }
});

// src/catalog-item-profile.mjs
function catalogItemAdditionSupported(key, schemaSha256) {
  return rows.has(key) && (schemaSha256 === void 0 || schemaSha256 === CATALOG_ITEM_SCHEMA);
}
function catalogItemAdditionUnavailableReason(key) {
  return unavailable.get(key) || (rows.has(key) ? null : "catalog_definition_missing");
}
function catalogItemAdditionDefinition(key) {
  if (definitions.has(key)) return definitions.get(key);
  const row = rows.get(key);
  if (!row) return null;
  const definition = Object.freeze({ definitionKey: row[0], defaultInventory: row[1], maxStack: row[2], initialUnlockedSockets: row[3], endurance: row[4], maxCharge: row[5], characterEquipment: row[6], knowledgeKeys: row[7], discovery: row[8] === 1 || row[8] === 3 ? "explicit_pickup_link" : "explicit_no_pickup_discovery", discoverySource: row[8] < 2 ? "workshop_current_mapping" : "native_item_info", routingSource: row[9] ? "workshop_catalog" : "native_item_info", family: row[6] ? "equipment" : "item", refinement: 0, maxSocketCount: 5, chargedClock: "1", uniqueBalance: data2.balanceDefinitions.includes(key), runtimeRequirement: data2.runtimeRequirements[String(key)] || null });
  definitions.set(key, definition);
  return definition;
}
var data2, CATALOG_ITEM_SCHEMA, rows, definitions, catalogItemAdditionProfile, unavailable;
var init_catalog_item_profile = __esm({
  "src/catalog-item-profile.mjs"() {
    init_data_provider();
    data2 = getData("crimson-construction-items.json");
    CATALOG_ITEM_SCHEMA = "8427f58057ea9bf6dac35bc139cba163ddb135cfe89d748a2d36b94eec88d668";
    rows = /* @__PURE__ */ new Map();
    definitions = /* @__PURE__ */ new Map();
    for (const row of data2.entries) {
      Object.freeze(row[7]);
      Object.freeze(row);
      rows.set(row[0], row);
    }
    for (const row of data2.unavailable) Object.freeze(row);
    Object.freeze(data2.balanceDefinitions);
    Object.freeze(data2.entries);
    Object.freeze(data2.unavailable);
    Object.freeze(data2.columns);
    Object.freeze(data2.source);
    Object.freeze(data2.runtimeRequirements);
    catalogItemAdditionProfile = Object.freeze(data2);
    unavailable = new Map(data2.unavailable);
  }
});

// src/inventory-quantity-profile.mjs
function existingStackQuantityProfile(definitionKey, referenceMaxStack) {
  const native = catalogItemAdditionDefinition(definitionKey);
  if (!native || !decimal(native.maxStack) || !decimal(referenceMaxStack) || BigInt(native.maxStack) < 2n || BigInt(referenceMaxStack) < 2n) return null;
  return { definitionKey, maximum: String(BigInt(native.maxStack) < BigInt(referenceMaxStack) ? BigInt(native.maxStack) : BigInt(referenceMaxStack)), uniqueBalance: native.uniqueBalance, limitSource: "native_and_pinned_catalog_minimum" };
}
var validInventoryKey, decimal;
var init_inventory_quantity_profile = __esm({
  "src/inventory-quantity-profile.mjs"() {
    init_catalog_item_profile();
    validInventoryKey = (key) => Number.isSafeInteger(key) && key >= 0 && key <= 65535;
    decimal = (value2) => typeof value2 === "string" && /^[1-9]\d{0,19}$/.test(value2) && BigInt(value2) <= 0xffffffffffffffffn;
  }
});

// src/crimson-draft.mjs
var crimson_draft_exports = {};
__export(crimson_draft_exports, {
  CRIMSON_BAG_CAPACITY: () => CRIMSON_BAG_CAPACITY,
  CRIMSON_CURRENT_SCHEMA: () => CRIMSON_CURRENT_SCHEMA,
  CRIMSON_DRAFT_REVISION: () => CRIMSON_DRAFT_REVISION,
  CRIMSON_DRAFT_SCHEMAS: () => CRIMSON_DRAFT_SCHEMAS,
  compileCrimsonDraft: () => compileCrimsonDraft,
  createCrimsonDraftCompiler: () => createCrimsonDraftCompiler,
  createWorkbenchDraft: () => createWorkbenchDraft,
  scalarScopeWitness: () => scalarScopeWitness
});
function scalarScopeWitness(result, source, input) {
  const proof = scalarScopeWitnesses.get(result);
  if (!proof || !import_buffer.Buffer.isBuffer(source) || !import_buffer.Buffer.isBuffer(result?.encoded) || hash(source) !== proof.sourceSha256 || hash(result.encoded) !== proof.outputSha256 || hash(stableJson(input)) !== proof.intentSha256 || hash(stableJson(result.report)) !== proof.reportSha256) return null;
  return Object.freeze({ ...proof });
}
function canonical(value2) {
  if (Array.isArray(value2)) return value2.map(canonical);
  if (value2 && typeof value2 === "object") return Object.fromEntries(Object.keys(value2).sort().map((k) => [k, canonical(value2[k])]));
  return value2;
}
function validateInput(input) {
  if (!exact(input, PLAN_KEYS) || input.schema !== "saveglass.crimson-draft-plan.v1" || input.payload !== "save" || typeof input.container !== "string" || !/^slot\d{1,3},savedgame$/.test(input.container) || !["backupSha256", "backupRevision", "payloadSha256", "plaintextSha256", "schemaSha256"].every((k) => typeof input[k] === "string" && HASH.test(input[k])) || !Array.isArray(input.operations) || input.operations.length < 1 || input.operations.length > 8) fail5("CRIMSON_DRAFT_PLAN_INVALID", "Use a bound draft with one to eight supported existing-scalar operations.", 400);
  if (input.decoderRevision !== DECODER_REVISION || input.catalogRevision !== CATALOG_REVISION) fail5("CRIMSON_DRAFT_STALE", "Reopen the snapshot with the current decoder and catalog.");
  for (const op of input.operations) {
    const expansion = op?.operation === "inventory.setExpansionValue";
    if (!exact(op, expansion ? EXPANSION_KEYS : ITEM_KEYS) || !validInventoryKey(op.inventoryKey) || op.operation !== "inventory.setQuantity" && op.inventoryKey !== 2 || !["inventory.setQuantity", "inventory.setCopper", "inventory.setExpansionValue"].includes(op.operation) || !decimal2(op.expectedValue, 0xffffffffffffffffn) || !decimal2(op.desiredValue, 0xffffffffffffffffn) || op.expectedValue === op.desiredValue) fail5("CRIMSON_DRAFT_OPERATION_INVALID", "Use an existing inventory scalar with its exact inventory identity and decimal values.", 400);
    if (expansion) {
      if (BigInt(op.expectedValue) > 200n || BigInt(op.desiredValue) > 200n || BigInt(op.desiredValue) <= BigInt(op.expectedValue)) fail5("CRIMSON_DRAFT_EXPANSION_LIMIT", "Bag size may only increase, within the conservative total capacity of 50 to 250.", 400);
    } else {
      if (!Number.isSafeInteger(op.slot) || op.slot < 0 || op.slot > 65535 || !decimal2(op.instanceId, 0xffffffffffffffffn) || op.instanceId === "0" || !Number.isSafeInteger(op.definitionKey) || op.definitionKey < 1 || op.definitionKey > 4294967295) fail5("CRIMSON_DRAFT_TARGET_INVALID", "Select the existing record by its exact instance, definition, bag and slot.", 400);
      const item = catalogItem(op.definitionKey), profile3 = existingStackQuantityProfile(op.definitionKey, item?.referenceMaxStack);
      if (!profile3 || (op.operation === "inventory.setCopper" ? !profile3.uniqueBalance : profile3.uniqueBalance)) fail5("CRIMSON_DRAFT_TARGET_INVALID", "Only a known native stackable item or the existing Copper balance can be changed.", 400);
      const max = BigInt(profile3.maximum);
      if (BigInt(op.desiredValue) < 1n || BigInt(op.desiredValue) > max) fail5("CRIMSON_DRAFT_REFERENCE_LIMIT", "The desired quantity exceeds this offline reference bound; this is not a game-verified maximum.", 400);
    }
  }
}
function inventoryContext(document, pin) {
  if (document.audit.unconsumedBytes !== 0) fail5("CRIMSON_DRAFT_DOCUMENT_INVALID");
  const types2 = new Map(document.schema.types.map((t) => [t.name, t]));
  if (types2.size !== document.schema.types.length || document.schema.types.some((t) => new Set(t.fields.map((f) => f.name)).size !== t.fields.length)) fail5("CRIMSON_DRAFT_DOCUMENT_AMBIGUOUS");
  const roots = document.blocks.filter((b) => b.type === "InventorySaveData");
  if (roots.length !== 1) fail5("CRIMSON_DRAFT_INVENTORY_INCOMPLETE");
  const root = roots[0], list = field(root, "_inventorylist"), bags = elements(root, "_inventorylist");
  if (!list?.present || list.value?.truncated || list.value?.count !== bags.length || bags.some((b) => {
    const items2 = field(b, "_itemList");
    return !items2 || items2.present && (items2.value?.truncated || items2.value?.count !== items2.value?.elements?.length);
  })) fail5("CRIMSON_DRAFT_INVENTORY_INCOMPLETE");
  const owned = bags.filter((b) => value(b, "_inventoryKey") === 2);
  if (owned.length > 1) fail5("CRIMSON_DRAFT_INVENTORY_AMBIGUOUS");
  const bag2 = owned[0], itemType = types2.get("ItemSaveData"), quantity = { name: "_stackCount", type: "TStackCount", kind: 0, size: 8, aux: 0 };
  if (!itemType || itemType.fields.findIndex((f) => f.name === "_stackCount") !== 4 || !equal2(itemType.fields[4], quantity)) fail5("CRIMSON_DRAFT_DESCRIPTOR_UNSUPPORTED");
  let housing = null;
  if (pin.requiresHousing) {
    let visit = function(node) {
      if (!node || typeof node !== "object") return;
      if (node.fields) {
        if (node.type === "InventoryHousingGimmickSaveData") {
          count2++;
          if (!housingObjects.has(node)) fail5("CRIMSON_DRAFT_HOUSING_UNSUPPORTED");
        }
        for (const f of Object.values(node.fields)) visit(f.value);
      } else if (Array.isArray(node)) for (const child of node) visit(child);
      else if (Array.isArray(node.elements)) {
        if (node.truncated || node.count !== node.elements.length) fail5("CRIMSON_DRAFT_INVENTORY_INCOMPLETE");
        for (const child of node.elements) visit(child);
      }
    };
    const descriptor2 = { name: "_housingGimmickInfoKey", type: "GimmickInfoKey", kind: 0, size: 4, aux: 0 }, definition = types2.get("InventoryHousingGimmickSaveData"), branch = field(root, "_inventoryHousingGimmickSaveData");
    if (!definition || !equal2(definition.fields, [descriptor2]) || !branch?.present || ![6, 7].includes(branch.kind) || branch.type !== "ReflectObject" || branch.value?.truncated || !Number.isSafeInteger(branch.value?.count) || branch.value.count < 0 || branch.value.count > 200 || branch.value.count !== branch.value.elements?.length) fail5("CRIMSON_DRAFT_HOUSING_UNSUPPORTED");
    housing = branch;
    const housingObjects = new Set(branch.value.elements);
    for (const object of housingObjects) {
      const key = field(object, "_housingGimmickInfoKey");
      if (object.type !== "InventoryHousingGimmickSaveData" || !key?.present || key.kind !== 0 || key.type !== descriptor2.type || key.bytes !== 4 || !Number.isSafeInteger(key.value) || key.value < 0 || key.value > 4294967295) fail5("CRIMSON_DRAFT_HOUSING_UNSUPPORTED");
    }
    let count2 = 0;
    visit(root);
    if (count2 !== housingObjects.size || count2 !== branch.value.count) fail5("CRIMSON_DRAFT_HOUSING_UNSUPPORTED");
  }
  return { types: types2, root, bag: bag2, housing };
}
function resolveOperation(document, context, op) {
  let target, definition, objectType, fieldName, width, displayName;
  if (op.operation === "inventory.setExpansionValue") {
    if (!context.bag || !field(context.bag, "_itemList")?.present) fail5("CRIMSON_DRAFT_INVENTORY_INCOMPLETE");
    target = field(context.bag, "_varyExpandSlotCount");
    definition = context.types.get("InventoryElementSaveData")?.fields.find((f) => f.name === "_varyExpandSlotCount");
    objectType = "InventoryElementSaveData";
    fieldName = "_varyExpandSlotCount";
    width = 2;
    displayName = "Bag size";
    if (!equal2(definition, { name: fieldName, type: "TInventorySlotNo", kind: 0, size: 2, aux: 0 })) fail5("CRIMSON_DRAFT_DESCRIPTOR_UNSUPPORTED");
    const slots = elements(context.bag, "_itemList").map((i) => value(i, "_slotNo"));
    if (slots.some((slot) => !Number.isSafeInteger(slot) || slot < 0 || slot >= CRIMSON_BAG_CAPACITY.base + Number(op.desiredValue)) || new Set(slots).size !== slots.length) fail5("CRIMSON_DRAFT_CAPACITY_CONFLICT", "The bag size conflicts with existing occupied slots.");
  } else {
    const resolved = quantityTarget(document, op);
    if (resolved.error || resolved.item?.type !== "ItemSaveData") fail5("CRIMSON_DRAFT_TARGET_MISMATCH", "The selected item identity is missing, ambiguous or changed.");
    if (op.operation === "inventory.setCopper" && elements(context.bag, "_itemList").filter((i) => value(i, "_itemKey") === 1).length !== 1) fail5("CRIMSON_DRAFT_TARGET_MISMATCH", "Exactly one Bag 2 Copper record is required.");
    target = resolved.quantity;
    definition = context.types.get("ItemSaveData").fields[4];
    objectType = "ItemSaveData";
    fieldName = "_stackCount";
    width = 8;
    displayName = op.definitionKey === 1 ? "Copper" : catalogItem(op.definitionKey).name;
  }
  if (!target?.present) fail5("CRIMSON_DRAFT_STRUCTURAL_REQUIRED", "An absent field requires structural insertion, which is disabled.");
  if (target.kind !== 0 || target.type !== definition.type || target.bytes !== width || String(target.value) !== op.expectedValue) fail5("CRIMSON_DRAFT_EXPECTATION_MISMATCH", "The existing field descriptor or expected original value changed.");
  return { operation: op.operation, displayName, inventoryKey: op.inventoryKey, ...op.operation === "inventory.setExpansionValue" ? { beforeCapacity: 50 + Number(op.expectedValue), afterCapacity: 50 + Number(op.desiredValue) } : { definitionKey: op.definitionKey, instanceId: op.instanceId, slot: op.slot }, before: op.expectedValue, after: op.desiredValue, field: fieldName, objectType, offset: target.offset, fieldBytes: width, limitStatus: op.operation === "inventory.setExpansionValue" ? "conservative_capacity_bound_increase_only" : "native_and_pinned_catalog_minimum_not_game_verified" };
}
function createCrimsonDraftCompiler({ schemaPins = CRIMSON_DRAFT_SCHEMAS, assertCapability = assertOfflineDraftCapability } = {}) {
  if (!Array.isArray(schemaPins) || schemaPins.length < 1 || schemaPins.length > 3 || schemaPins.some((p) => !exact(p, ["schemaSha256", "requiresHousing"]) || !HASH.test(p.schemaSha256) || typeof p.requiresHousing !== "boolean")) throw Error("Invalid internal draft schema pins.");
  const pins = new Map(schemaPins.map((p) => [p.schemaSha256, { ...p }]));
  if (pins.size !== schemaPins.length) throw Error("Duplicate internal draft schema pin.");
  if (typeof assertCapability !== "function") throw Error("Invalid internal capability guard.");
  return async function compileCrimsonDraft2(backup, metadata3, input, { nonce, retainEncoded = false } = {}) {
    if (nonce !== void 0 && (!import_buffer.Buffer.isBuffer(nonce) || nonce.length !== 16) || typeof retainEncoded !== "boolean") throw Error("Invalid internal compiler options.");
    validateInput(input);
    assertSourceBinding(backup, metadata3, input);
    if (metadata3.sha256 !== input.backupSha256 || backup.revision !== input.backupRevision) fail5("CRIMSON_DRAFT_STALE", "The original snapshot binding changed.");
    const containers = backup.containers.filter((c) => c.index.fileName === input.container), blobs = containers.length === 1 ? containers[0].blobs.filter((b) => b.name === input.payload) : [];
    if (blobs.length !== 1 || blobs[0].sha256 !== input.payloadSha256) fail5("CRIMSON_DRAFT_STALE", "The original payload binding changed.");
    const prepared = preparedSource(backup, metadata3, input), source = prepared?.encoded || import_buffer.Buffer.from(blobs[0].data, "base64");
    if (source.length > 8 * 1024 * 1024 || !prepared && source.toString("base64") !== blobs[0].data) fail5("CRIMSON_DRAFT_PAYLOAD_INVALID");
    const decoded = prepared?.decoded || await decodeSave(source);
    if (decoded.version !== 2) fail5("CRIMSON_DRAFT_WRAPPER_UNSUPPORTED");
    const projection = prepared?.projection || { fieldListLimits: { "InventoryElementSaveData._itemList": 1024 } }, before = prepared?.document || readDocument(decoded.plaintext, projection), pin = pins.get(before.schemaSha256);
    if (!pin || input.schemaSha256 !== before.schemaSha256) fail5("CRIMSON_DRAFT_SCHEMA_UNSUPPORTED", "This snapshot schema is outside the reviewed offline composition pins.");
    if (input.plaintextSha256 !== before.plaintextSha256) fail5("CRIMSON_DRAFT_STALE", "The original plaintext binding changed.");
    assertCapability({ schemaSha256: before.schemaSha256, saveVersion: decoded.version, container: input.container, payload: input.payload });
    if (!await preparedSourceNativeParity(backup, metadata3, input, decoded, source, encodeSave)) fail5("CRIMSON_DRAFT_NATIVE_PARITY_FAILED", "The original save does not reproduce byte-for-byte with the native-compatible encoder.");
    const context = inventoryContext(before, pin), operations = input.operations.map((op) => resolveOperation(before, context, op)), ordered = [...operations].sort((a, b) => a.offset - b.offset);
    if (ordered.some((target, i) => i > 0 && target.offset < ordered[i - 1].offset + ordered[i - 1].fieldBytes)) fail5("CRIMSON_DRAFT_CONFLICT", "Two draft operations target the same or overlapping existing field.");
    const patched = import_buffer.Buffer.from(decoded.plaintext);
    for (const op of operations) {
      if (op.fieldBytes === 8) patched.writeBigUInt64LE(BigInt(op.after), op.offset);
      else patched.writeUInt16LE(Number(op.after), op.offset);
    }
    let changedBytes = 0, rangeEnd = 0;
    for (const op of ordered) {
      if (!patched.subarray(rangeEnd, op.offset).equals(decoded.plaintext.subarray(rangeEnd, op.offset))) fail5("CRIMSON_DRAFT_DIFF_FAILED");
      for (let at = op.offset; at < op.offset + op.fieldBytes; at++) if (patched[at] !== decoded.plaintext[at]) changedBytes++;
      rangeEnd = op.offset + op.fieldBytes;
    }
    if (!patched.subarray(rangeEnd).equals(decoded.plaintext.subarray(rangeEnd))) fail5("CRIMSON_DRAFT_DIFF_FAILED");
    const encoded = await encodeSave(patched, decoded.header, nonce === void 0 ? {} : { nonce });
    if (encoded.length > 8 * 1024 * 1024) fail5("CRIMSON_DRAFT_ENCODED_LIMIT");
    const reopened = await decodeSave(encoded);
    if (reopened.version !== decoded.version || reopened.flags !== decoded.flags || !reopened.plaintext.equals(patched)) fail5("CRIMSON_DRAFT_REOPEN_FAILED");
    if (!encoded.subarray(0, 22).equals(source.subarray(0, 22)) || !encoded.subarray(74, 128).equals(source.subarray(74, 128))) fail5("CRIMSON_DRAFT_HEADER_CHANGED");
    const after = readDocument(reopened.plaintext, { ...projection, compareTo: decoded.plaintext }), diff = after.decodedDiff;
    if (after.schemaSha256 !== before.schemaSha256 || !equal2(auditIdentity(after.audit), auditIdentity(before.audit)) || diff.length !== operations.length || diff.some((d) => !operations.some((op) => op.offset === d.offset && op.fieldBytes === d.bytes && op.field === d.field && op.objectType === d.objectType && String(d.before) === op.before && String(d.after) === op.after))) fail5("CRIMSON_DRAFT_DIFF_FAILED", "The full decoded comparison contains an unintended change.");
    const afterContext = inventoryContext(after, pin);
    const housingUnchanged = !context.housing || context.housing.offset === afterContext.housing.offset && context.housing.end === afterContext.housing.end && hash(decoded.plaintext.subarray(context.housing.offset, context.housing.end)) === hash(reopened.plaintext.subarray(afterContext.housing.offset, afterContext.housing.end));
    if (!housingUnchanged) fail5("CRIMSON_DRAFT_HOUSING_CHANGED");
    const manifest = operations.map((op) => ({ ...op, changedBytes: patched.subarray(op.offset, op.offset + op.fieldBytes).reduce((n, v, i) => n + (v !== decoded.plaintext[op.offset + i]), 0) }));
    const report = {
      schema: "saveglass.crimson-draft-preview.v1",
      compilerRevision: CRIMSON_DRAFT_REVISION,
      encoderRevision: STANDARD_LZ4_PROFILE,
      compression: "standard_lz4_block",
      source: "plugin_bundle",
      backupId: metadata3.id,
      backupSha256: metadata3.sha256,
      backupRevision: backup.revision,
      container: input.container,
      payload: input.payload,
      payloadSha256: blobs[0].sha256,
      schemaSha256: before.schemaSha256,
      decoderRevision: DECODER_REVISION,
      catalogRevision: CATALOG_REVISION,
      planSha256: hash(stableJson(input)),
      operations: manifest,
      decodedDiff: diff,
      changedBytes,
      beforePlaintextSha256: before.plaintextSha256,
      afterPlaintextSha256: after.plaintextSha256,
      encodedSha256: hash(encoded),
      encodedBytes: encoded.length,
      validation: { backupIntegrity: "verified", snapshotRevisionBinding: "verified", liveCloudRevisionCheck: "not_performed", originalNoOpByteParity: true, unknownHeaderBytesPreserved: true, fullDocumentReparsed: true, comparedLeafFields: after.comparison.comparedLeafFields, objectCount: after.audit.objects, unconsumedBytes: after.audit.unconsumedBytes, intendedDecodedFields: operations.length, allOtherPlaintextBytesUnchanged: true, allOtherDecodedValuesUnchanged: true, omittedListMarkersPreserved: after.audit.omittedListMarkers, nonzeroListMetadataPreserved: after.audit.nonzeroListMetadata, housingBranchBytesUnchanged: housingUnchanged, housingBranchPresent: Boolean(context.housing), housingRecords: context.housing?.value.count ?? 0, hmacReverified: true, encodedOutputReopened: true, encodingPasses: 1, noOpEncodingPasses: 1, gameAcceptance: "unverified" },
      draftOnly: true,
      originalBackupUnchanged: true,
      modifiedSaveStored: false,
      encodedBytesReturned: false,
      writesEnabled: false,
      publishEligible: false,
      gates: { structuralAdditions: "disabled", cloudPublication: "disabled", restore: "disabled", gameEngineAcceptance: "unverified" },
      message: "The combined draft passed intended-only comparison and native-compatible re-open checks. Publication requires the separate account, backup, revision and confirmation gates; game acceptance of this draft remains unverified."
    };
    if (!retainEncoded) return report;
    const result = { report, encoded };
    scalarScopeWitnesses.set(result, Object.freeze({ kind: "native-scalar-byte-proof", sourceSha256: hash(source), outputSha256: hash(encoded), intentSha256: hash(stableJson(input)), reportSha256: hash(stableJson(report)) }));
    return result;
  };
}
var PREVIOUS_HOUSING_SCHEMA, CRIMSON_DRAFT_REVISION, CRIMSON_CURRENT_SCHEMA, CRIMSON_BAG_CAPACITY, CRIMSON_DRAFT_SCHEMAS, PLAN_KEYS, ITEM_KEYS, EXPANSION_KEYS, HASH, exact, equal2, auditIdentity, fail5, decimal2, stableJson, scalarScopeWitnesses, compileCrimsonDraft, createWorkbenchDraft;
var init_crimson_draft = __esm({
  "src/crimson-draft.mjs"() {
    init_buffer();
    init_source_binding();
    init_crimson_codec();
    init_crimson_document();
    init_crimson_policy();
    init_crimson_domain();
    init_source_binding();
    init_lz4_standard();
    init_inventory_quantity_profile();
    PREVIOUS_HOUSING_SCHEMA = "606d393978b53c27a3e827fb6a592ce2a6c2e91f2de82dd063e5be93d0cfdedf";
    CRIMSON_DRAFT_REVISION = "saveglass.crimson-existing-scalars.v3";
    CRIMSON_CURRENT_SCHEMA = "8427f58057ea9bf6dac35bc139cba163ddb135cfe89d748a2d36b94eec88d668";
    CRIMSON_BAG_CAPACITY = Object.freeze({ base: 50, min: 50, max: 250, increaseOnly: true });
    CRIMSON_DRAFT_SCHEMAS = Object.freeze([
      Object.freeze({ schemaSha256: FISH_QUANTITY_RULE.schemaSha256, requiresHousing: false }),
      Object.freeze({ schemaSha256: PREVIOUS_HOUSING_SCHEMA, requiresHousing: true }),
      Object.freeze({ schemaSha256: CRIMSON_CURRENT_SCHEMA, requiresHousing: true })
    ]);
    PLAN_KEYS = ["schema", "container", "payload", "backupSha256", "backupRevision", "payloadSha256", "plaintextSha256", "schemaSha256", "decoderRevision", "catalogRevision", "operations"];
    ITEM_KEYS = ["operation", "inventoryKey", "definitionKey", "instanceId", "slot", "expectedValue", "desiredValue"];
    EXPANSION_KEYS = ["operation", "inventoryKey", "expectedValue", "desiredValue"];
    HASH = /^[a-f0-9]{64}$/;
    exact = (v, keys2) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys2.length && keys2.every((k) => Object.hasOwn(v, k));
    equal2 = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    auditIdentity = (a) => ({ ...a, nonzeroListSamples: a.nonzeroListSamples.map(({ path, ...sample }) => sample) });
    fail5 = (code, message = "The offline draft stopped at its reported validation gate.", status = 409) => {
      throw new ProbeError(message, status, code);
    };
    decimal2 = (v, max) => typeof v === "string" && /^(0|[1-9]\d{0,19})$/.test(v) && BigInt(v) <= max;
    stableJson = (value2) => JSON.stringify(canonical(value2));
    scalarScopeWitnesses = /* @__PURE__ */ new WeakMap();
    compileCrimsonDraft = createCrimsonDraftCompiler();
    createWorkbenchDraft = (backup, metadata3, input, { nonce } = {}) => compileCrimsonDraft(backup, metadata3, input, { nonce, retainEncoded: true });
  }
});

// src/scalar-digest.mjs
function createScalarDigest() {
  const state2 = createHash("sha256"), nativeText = typeof state2.updateText === "function", buffer = nativeText ? null : new Uint8Array(BUFFER_BYTES);
  let used = 0, count2 = 0, finished = false, textRows = [], textUnits = 0, textAscii = true;
  function flush() {
    if (used) {
      state2.update(used === BUFFER_BYTES ? buffer : buffer.subarray(0, used));
      used = 0;
    }
  }
  function write(text) {
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);
      if (code < 128) {
        buffer[used++] = code;
        if (used === BUFFER_BYTES) flush();
        continue;
      }
      if (code >= 55296 && code <= 56319) {
        const next = text.charCodeAt(i + 1);
        if (next >= 56320 && next <= 57343) {
          code = 65536 + (code - 55296 << 10) + (next - 56320);
          i++;
        } else code = 65533;
      } else if (code >= 56320 && code <= 57343) code = 65533;
      if (used > BUFFER_BYTES - 4) flush();
      if (code < 2048) {
        buffer[used++] = 192 | code >> 6;
        buffer[used++] = 128 | code & 63;
      } else if (code < 65536) {
        buffer[used++] = 224 | code >> 12;
        buffer[used++] = 128 | code >> 6 & 63;
        buffer[used++] = 128 | code & 63;
      } else {
        buffer[used++] = 240 | code >> 18;
        buffer[used++] = 128 | code >> 12 & 63;
        buffer[used++] = 128 | code >> 6 & 63;
        buffer[used++] = 128 | code & 63;
      }
      if (used === BUFFER_BYTES) flush();
    }
  }
  function flushText() {
    if (textUnits) {
      state2.updateText(textRows.join(""));
      textRows = [];
      textUnits = 0;
    }
  }
  function writeText(text) {
    const ascii = ASCII.test(text), limit3 = ascii ? BUFFER_BYTES : 16384;
    if (textUnits && textAscii !== ascii) flushText();
    textAscii = ascii;
    for (let offset = 0; offset < text.length; ) {
      let end = Math.min(text.length, offset + limit3 - textUnits);
      if (end < text.length && text.charCodeAt(end - 1) >= 55296 && text.charCodeAt(end - 1) <= 56319 && text.charCodeAt(end) >= 56320 && text.charCodeAt(end) <= 57343) end--;
      if (end === offset) {
        flushText();
        continue;
      }
      textRows.push(text.slice(offset, end));
      textUnits += end - offset;
      offset = end;
      if (textUnits === limit3) flushText();
    }
  }
  const api = {
    update(event) {
      if (finished) throw Error("Scalar digest already finalized.");
      const row = JSON.stringify([event.path, event.type, event.bytes, event.value]) + "\n";
      if (nativeText) writeText(row);
      else write(row);
      count2++;
      return api;
    },
    digest() {
      if (finished) throw Error("Scalar digest already finalized.");
      finished = true;
      if (nativeText) flushText();
      else flush();
      const sha2563 = state2.digest("hex");
      buffer?.fill(0);
      textRows = [];
      return { sha256: sha2563, count: count2 };
    }
  };
  return api;
}
var BUFFER_BYTES, ASCII;
var init_scalar_digest = __esm({
  "src/scalar-digest.mjs"() {
    init_crypto();
    BUFFER_BYTES = 64 * 1024;
    ASCII = /^[\x00-\x7f]*$/;
  }
});

// src/inventory-capacity.mjs
function planInventoryCapacity(domains, { additionalSlots = 0, inventoryKey = 2, ceiling = INVENTORY_CAPACITY_CEILING } = {}) {
  const fixed = {
    schema: "saveglass.inventory-capacity-plan.v1",
    inventoryKey,
    additionalSlots,
    ceiling,
    ceilingSource: "saveglass_product_guard_not_verified_engine_max",
    publicationEnabled: false
  };
  const rejected = (reason, warning) => ({ ...fixed, state: "unavailable", canFit: false, reason, warning, oldTotalCapacity: null, newTotalCapacity: null, requiredExpansionSlots: null, automaticExpansionRequired: false });
  if (inventoryKey !== 2 || ceiling !== INVENTORY_CAPACITY_CEILING || !Number.isSafeInteger(additionalSlots) || additionalSlots < 0 || additionalSlots > 1e9) return rejected("CAPACITY_REQUEST_UNSUPPORTED", "Inventory space could not be checked for this request.");
  const inventory = domains?.inventory, bags = inventory?.bags?.filter((b) => b.inventoryKey === inventoryKey), records2 = inventory?.records?.filter((r) => r.inventoryKey === inventoryKey), bag2 = bags?.[0];
  if (bags?.length !== 1 || !Array.isArray(records2) || bag2.itemListPresent !== true || bag2.truncated !== false || bag2.itemRecordCount !== records2.length || !Number.isSafeInteger(bag2.expansionSlots) || bag2.expansionSlots < 0 || bag2.expansionSlots > ceiling - INVENTORY_BASE_CAPACITY) return rejected("CAPACITY_SOURCE_UNSUPPORTED", "Inventory space needs a complete supported bag inspection.");
  const oldTotalCapacity = INVENTORY_BASE_CAPACITY + bag2.expansionSlots, slots = records2.map((r) => r.slot), ids2 = records2.map((r) => r.instanceId);
  if (slots.some((slot) => !Number.isSafeInteger(slot) || slot < 0 || slot >= oldTotalCapacity) || new Set(slots).size !== slots.length || ids2.some((value2) => !id(value2)) || new Set(ids2).size !== ids2.length) return rejected("CAPACITY_SOURCE_AMBIGUOUS", "Inventory slots or item identities are ambiguous. Nothing will be added automatically.");
  const occupiedSlots = slots.length, freeSlots = oldTotalCapacity - occupiedSlots, requiredTotalCapacity = occupiedSlots + additionalSlots, newTotalCapacity = Math.max(oldTotalCapacity, Math.min(ceiling, requiredTotalCapacity)), canFit = requiredTotalCapacity <= ceiling;
  return {
    ...fixed,
    state: canFit ? "planned" : "limit_reached",
    canFit,
    reason: canFit ? null : "CAPACITY_LIMIT",
    occupiedSlots,
    freeSlots,
    oldTotalCapacity,
    newTotalCapacity,
    requiredTotalCapacity,
    requiredExpansionSlots: newTotalCapacity - INVENTORY_BASE_CAPACITY,
    automaticExpansionRequired: canFit && newTotalCapacity > oldTotalCapacity,
    warning: canFit ? null : "Not every new item will fit within SaveRift\u2019s 250-slot limit. Remove items or choose fewer additions.",
    allocation: "first_free_slots_within_verified_capacity",
    existingItemsPreserved: true,
    partialDeliveryEnabled: false
  };
}
var INVENTORY_BASE_CAPACITY, INVENTORY_CAPACITY_CEILING, id;
var init_inventory_capacity = __esm({
  "src/inventory-capacity.mjs"() {
    INVENTORY_BASE_CAPACITY = 50;
    INVENTORY_CAPACITY_CEILING = 250;
    id = (value2) => typeof value2 === "string" && /^[1-9]\d{0,19}$/.test(value2) && BigInt(value2) <= 0xffffffffffffffffn;
  }
});

// src/crimson-structural-layout.mjs
function traceStructuralDocument(raw, { skipStart = -1, skipEnd = -1, captureRelocation = true, captureTypes, listLimit, hashPlaintext = true } = {}) {
  let locatorValues = [], objectValues = [];
  const identities = [];
  const document = readDocument(raw, { captureTypes, listLimit, hashPlaintext, onLocator: captureRelocation ? (e) => locatorValues.push(e.pointerOffset, e.advertisedPayloadOffset) : void 0, onObject: captureRelocation ? (e) => {
    if (e.inline) objectValues.push(e.start, e.trailerOffset);
  } : void 0, scalarFields: ["_itemNo", "_mercenaryNo"], onScalar: captureRelocation ? (e) => {
    if (captureRelocation && /\._(?:itemNo|mercenaryNo)$/.test(e.path) && e.bytes === 8 && typeof e.value === "string" && /^[1-9]\d{0,19}$/.test(e.value) && BigInt(e.value) <= MAX_ID) identities.push({ offset: e.offset, value: e.value });
  } : void 0 });
  const originalHash = document.plaintextSha256 || hash(raw);
  let fingerprint;
  function scalarProof() {
    if (hash(raw) !== originalHash) fail6("CRIMSON_STRUCTURAL_SOURCE_CHANGED");
    if (!fingerprint) {
      const digest4 = createScalarDigest();
      readDocument(raw, { captureTypes: [], listLimit: 0, hashPlaintext: false, onScalar: (e) => {
        if (e.offset >= skipStart && e.offset < skipEnd) return;
        digest4.update(e);
      } });
      fingerprint = digest4.digest();
    }
    return fingerprint;
  }
  const state2 = { locatorWords: new Uint32Array(locatorValues), objectWords: new Uint32Array(objectValues), locators: null, objects: null };
  locatorValues = objectValues = null;
  state2.locatorsGetter = () => state2.locators ??= Array.from({ length: state2.locatorWords.length / 2 }, (_, i) => ({ pointerOffset: state2.locatorWords[i * 2], advertisedPayloadOffset: state2.locatorWords[i * 2 + 1] }));
  state2.objectsGetter = () => state2.objects ??= Array.from({ length: state2.objectWords.length / 2 }, (_, i) => ({ inline: true, start: state2.objectWords[i * 2], trailerOffset: state2.objectWords[i * 2 + 1] }));
  const result = { document, get locators() {
    return state2.locatorsGetter();
  }, get objects() {
    return state2.objectsGetter();
  }, identities, projection: { captureTypes, listLimit, hashPlaintext }, get scalarDigest() {
    return scalarProof().sha256;
  }, get scalarCount() {
    return scalarProof().count;
  } };
  state2.locatorsDescriptor = Object.getOwnPropertyDescriptor(result, "locators").get;
  state2.objectsDescriptor = Object.getOwnPropertyDescriptor(result, "objects").get;
  if (captureRelocation) {
    let visit = function(node) {
      if (!node?.fields) return;
      for (const f of Object.values(node.fields)) {
        if (f.present && [6, 7].includes(f.kind) && f.value) lists.set(f.offset, { end: f.end, count: f.count });
        if (f.value?.elements) f.value.elements.forEach(visit);
        else if (f.value?.fields) visit(f.value);
      }
    };
    const lists = /* @__PURE__ */ new Map();
    document.blocks.forEach(visit);
    const before = { plaintext: raw, schemaSha256: document.schemaSha256, schema: { streamSize: document.schema.streamSize, dataStart: document.schema.dataStart, toc: document.schema.toc.map((e) => Object.freeze({ ...e })) }, audit: { advisoryLocators: document.audit.advisoryLocators, unconsumedBytes: document.audit.unconsumedBytes } };
    Object.assign(state2, { raw, originalHash, before, lists });
    nativeTraces.set(result, state2);
  }
  return result;
}
function nativeTrace(trace, list) {
  const proof = nativeTraces.get(trace);
  if (!proof || proof.consumed) return null;
  if (trace.document.plaintext !== proof.raw || hash(proof.raw) !== proof.originalHash) fail6("CRIMSON_STRUCTURAL_SOURCE_CHANGED");
  if (!list || ![Object.prototype, null].includes(Object.getPrototypeOf(list)) || Object.values(Object.getOwnPropertyDescriptors(list)).some((d) => d.get || d.set) || !list.value || ![Object.prototype, null].includes(Object.getPrototypeOf(list.value)) || Object.values(Object.getOwnPropertyDescriptors(list.value)).some((d) => d.get || d.set)) return null;
  const nativeList = proof.lists.get(list.offset);
  if (Object.getOwnPropertyDescriptor(trace, "locators")?.get !== proof.locatorsDescriptor || Object.getOwnPropertyDescriptor(trace, "objects")?.get !== proof.objectsDescriptor || !nativeList || nativeList.end !== list.end || nativeList.count !== list.value?.count || proof.locators && (proof.locators.length * 2 !== proof.locatorWords.length || !proof.locators.every((v, i) => v.pointerOffset === proof.locatorWords[i * 2] && v.advertisedPayloadOffset === proof.locatorWords[i * 2 + 1])) || proof.objects && (proof.objects.length * 2 !== proof.objectWords.length || !proof.objects.every((v, i) => v.inline === true && v.start === proof.objectWords[i * 2] && v.trailerOffset === proof.objectWords[i * 2 + 1]))) return null;
  return { ...proof, list: { offset: list.offset, end: nativeList.end, present: list.present, value: { count: nativeList.count, truncated: list.value.truncated } } };
}
function releaseStructuralTrace(trace) {
  const state2 = nativeTraces.get(trace);
  if (!state2) return;
  state2.locators = state2.objects = [];
  state2.locatorWords = state2.objectWords = new Uint32Array(0);
  state2.lists.clear();
  state2.before = null;
  state2.raw = null;
  trace.identities.length = 0;
  nativeTraces.delete(trace);
}
function allocateStructuralItemId(trace) {
  const raw = trace.document.plaintext;
  let next = trace.identities.reduce((m, i) => BigInt(i.value) !== MAX_ID && BigInt(i.value) > m ? BigInt(i.value) : m, 0n) + 1n, attempts = 0;
  for (; ; ) {
    if (next > MAX_ID || attempts++ >= 4096) fail6("CRIMSON_STRUCTURAL_ID_EXHAUSTED");
    const b = import_buffer.Buffer.alloc(8);
    b.writeBigUInt64LE(next);
    if (!raw.includes(b)) return next;
    next++;
  }
}
function insertTypedRecords(trace, list, records2) {
  if (!Array.isArray(records2) || records2.length < 1 || records2.length > 512 || records2.some((r) => !import_buffer.Buffer.isBuffer(r) || r.length < 24 || r.length > 16384)) fail6("CRIMSON_STRUCTURAL_LAYOUT_UNSUPPORTED");
  const proof = nativeTrace(trace, list), target = proof?.list || list, before = proof?.before || trace.document, raw = before.plaintext, schema = before.schema, insert = target.end, record = import_buffer.Buffer.concat(records2), delta = record.length;
  if (delta > 32768 || raw.length + delta > 8 * 1024 * 1024 || schema.streamSize !== raw.length || before.audit.advisoryLocators !== 0 || before.audit.unconsumedBytes !== 0 || !target.present || target.value?.truncated || !Number.isSafeInteger(target.value?.count) || target.value.count + records2.length > 1e5 || raw[target.offset] !== 0 || raw.readUInt32LE(target.offset + 1) !== target.value.count) fail6("CRIMSON_STRUCTURAL_LAYOUT_UNSUPPORTED");
  const position = (at) => at >= insert ? at + delta : at, patched = import_buffer.Buffer.concat([raw.subarray(0, insert), record, raw.subarray(insert)]), patches = /* @__PURE__ */ new Map();
  function patch(offset, after2, reason) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + 4 > raw.length || !Number.isSafeInteger(after2) || after2 < 0 || after2 > 4294967295 || offset < insert && offset + 4 > insert) fail6("CRIMSON_STRUCTURAL_PATCH_BOUNDS");
    const prior = patches.get(offset);
    if (prior && prior.after !== after2) fail6("CRIMSON_STRUCTURAL_PATCH_CONFLICT");
    const original = raw.readUInt32LE(offset);
    if (original === after2) return;
    patches.set(offset, { offset, before: original, after: after2, reason });
    patched.writeUInt32LE(after2, position(offset));
  }
  patch(target.offset + 1, target.value.count + records2.length, "list_count");
  const tocStart = schema.dataStart - schema.toc.length * 20;
  patch(tocStart - 4, raw.length + delta, "stream_size");
  let containing = 0;
  schema.toc.forEach((entry, i) => {
    if (entry.offset <= target.offset && target.offset < entry.offset + entry.bytes) {
      if (insert > entry.offset + entry.bytes) fail6("CRIMSON_STRUCTURAL_LAYOUT_UNSUPPORTED");
      containing++;
      patch(tocStart + i * 20 + 16, entry.bytes + delta, "containing_toc_size");
    } else if (entry.offset >= insert) patch(tocStart + i * 20 + 12, entry.offset + delta, "following_toc_offset");
  });
  if (containing !== 1) fail6("CRIMSON_STRUCTURAL_LAYOUT_UNSUPPORTED");
  if (proof) {
    for (let i = 0; i < proof.locatorWords.length; i += 2) if (proof.locatorWords[i + 1] >= insert) patch(proof.locatorWords[i], proof.locatorWords[i + 1] + delta, "typed_locator_relocation");
    for (let i = 0; i < proof.objectWords.length; i += 2) if (proof.objectWords[i] < insert && insert <= proof.objectWords[i + 1]) patch(proof.objectWords[i + 1], raw.readUInt32LE(proof.objectWords[i + 1]) + delta, "containing_inline_size");
  } else {
    for (const l of trace.locators) if (l.advertisedPayloadOffset >= insert) patch(l.pointerOffset, l.advertisedPayloadOffset + delta, "typed_locator_relocation");
    for (const o of trace.objects) if (o.inline && o.start < insert && insert <= o.trailerOffset) patch(o.trailerOffset, raw.readUInt32LE(o.trailerOffset) + delta, "containing_inline_size");
  }
  for (const p of patches.values()) patched.writeUInt32LE(p.before, position(p.offset));
  const reverseEqual = patched.subarray(0, insert).equals(raw.subarray(0, insert)) && patched.subarray(insert + delta).equals(raw.subarray(insert));
  for (const p of patches.values()) patched.writeUInt32LE(p.after, position(p.offset));
  if (!reverseEqual) fail6("CRIMSON_STRUCTURAL_UNRELATED_BYTES_CHANGED");
  if (proof && hash(raw) !== proof.originalHash) fail6("CRIMSON_STRUCTURAL_SOURCE_CHANGED");
  const after = traceStructuralDocument(patched, { ...trace.projection, skipStart: insert, skipEnd: insert + delta, captureRelocation: false });
  if (after.document.schemaSha256 !== before.schemaSha256 || after.document.audit.advisoryLocators !== 0 || after.document.audit.unconsumedBytes !== 0 || !proof && (after.scalarDigest !== trace.scalarDigest || after.scalarCount !== trace.scalarCount)) fail6("CRIMSON_STRUCTURAL_SEMANTIC_DIFF");
  if (proof) nativeTraces.get(trace).consumed = true;
  const patchCounts = {};
  for (const p of patches.values()) patchCounts[p.reason] = (patchCounts[p.reason] || 0) + 1;
  return { raw: patched, trace: after, insert, delta, patchCounts, reverseStructuralByteParity: true, conservationProof: proof ? "native_metadata_reverse_bytes" : "full_scalar_stream" };
}
var MAX_ID, nativeTraces, fail6;
var init_crimson_structural_layout = __esm({
  "src/crimson-structural-layout.mjs"() {
    init_buffer();
    init_scalar_digest();
    init_crimson_codec();
    init_crimson_document();
    init_source_binding();
    MAX_ID = 0xffffffffffffffffn;
    nativeTraces = /* @__PURE__ */ new WeakMap();
    fail6 = (code) => {
      throw new CodecError("The offline structural layout check stopped.", code);
    };
  }
});

// src/normal-item-profile.mjs
function normalItemAdditionDefinition(key) {
  return definitions2.get(key) || null;
}
function normalItemAdditionSupported(key, schemaSha256) {
  return Boolean(definitions2.has(key) && (schemaSha256 === void 0 || schemaSha256 === NORMAL_ITEM_SCHEMA));
}
var data3, NORMAL_ITEM_SCHEMA, normalItemAdditionProfile, definitions2;
var init_normal_item_profile = __esm({
  "src/normal-item-profile.mjs"() {
    init_data_provider();
    data3 = getData("crimson-normal-items.json");
    NORMAL_ITEM_SCHEMA = "8427f58057ea9bf6dac35bc139cba163ddb135cfe89d748a2d36b94eec88d668";
    for (const entry of data3.entries) {
      Object.freeze(entry.knowledgeKeys);
      Object.freeze(entry);
    }
    Object.freeze(data3.entries);
    normalItemAdditionProfile = Object.freeze(data3);
    definitions2 = new Map(data3.entries.map((entry) => [entry.definitionKey, entry]));
  }
});

// src/crimson-item-addition.mjs
var crimson_item_addition_exports = {};
__export(crimson_item_addition_exports, {
  buildCatalogItemAddition: () => buildCatalogItemAddition,
  buildCatalogItemAdditions: () => buildCatalogItemAdditions,
  buildNormalItemAddition: () => buildNormalItemAddition,
  buildNormalItemAdditions: () => buildNormalItemAdditions,
  createCatalogItemAddition: () => createCatalogItemAddition,
  createNormalItemAddition: () => createNormalItemAddition,
  itemScopeWitness: () => itemScopeWitness,
  normalItemAdditionDefinition: () => normalItemAdditionDefinition,
  normalItemAdditionProfile: () => normalItemAdditionProfile,
  normalItemAdditionSupported: () => normalItemAdditionSupported
});
function itemScopeWitness(result, source, inputs) {
  const proof = itemScopeWitnesses.get(result);
  if (!proof || !import_buffer.Buffer.isBuffer(source) || !import_buffer.Buffer.isBuffer(result?.encoded) || hash(source) !== proof.sourceSha256 || hash(result.encoded) !== proof.outputSha256 || hash(scopeJson(inputs)) !== proof.intentSha256 || hash(scopeJson(result.report)) !== proof.reportSha256) return null;
  return Object.freeze({ ...proof });
}
function prune(document) {
  for (const root of document.blocks) if (!["InventorySaveData", "KnowledgeSaveData"].includes(root.type)) root.fields = null;
  return document;
}
function header(type, mask, start) {
  return import_buffer.Buffer.concat([u16(mask.length), mask, u16(type.index), import_buffer.Buffer.from([0]), import_buffer.Buffer.alloc(8, 255), u32(start + 17 + mask.length)]);
}
function verifyTypes(schema) {
  const types2 = new Map(schema.types.map((t) => [t.name, t]));
  for (const [name, pin] of Object.entries({ ...gear.nativeSchema.types, ...nexus.nativeSchema.types })) if (!types2.has(name) || hash(JSON.stringify(types2.get(name).fields)) !== (pin.signature || pin.sha256)) fail7("CRIMSON_ITEM_DESCRIPTOR_UNSUPPORTED");
  return types2;
}
function freshItem(types2, { start, itemNo, slot, key, quantity, definition }) {
  const type = types2.get("ItemSaveData"), socket = types2.get("ItemSocketSaveData");
  const values = /* @__PURE__ */ new Map([["_saveVersion", [1n, 4]], ["_itemNo", [itemNo, 8]], ["_itemKey", [BigInt(key), 4]], ["_slotNo", [BigInt(slot), 2]], ["_stackCount", [quantity, 8]], ["_enchantLevel", [0n, 2]], ["_endurance", [BigInt(definition?.endurance ?? 65535), 2]], ["_maxSocketCount", [5n, 1]], ["_validSocketCount", [BigInt(definition?.initialUnlockedSockets ?? 0), 1]], ["_transferredItemKey", [BigInt(key), 4]], ["_maxChargeUseableCount", [BigInt(definition?.maxCharge ?? 1), 4]], ["_chargedUseableCount", [1n, 8]], ["_isNewMark", [1n, 1]]]);
  const present = /* @__PURE__ */ new Set([...values.keys(), "_socketSaveDataList"]), mask = import_buffer.Buffer.alloc(Math.ceil(type.fields.length / 8));
  type.fields.forEach((f, i) => {
    if (present.has(f.name)) mask[i >> 3] |= 1 << (i & 7);
  });
  const chunks = [header(type, mask, start), import_buffer.Buffer.alloc(4)];
  let length = chunks.reduce((n, b) => n + b.length, 0), payload = chunks[0].length;
  const append = (b) => {
    chunks.push(b);
    length += b.length;
  };
  for (const f of type.fields) {
    if (values.has(f.name)) {
      const [v, width] = values.get(f.name);
      if (f.kind !== 0 || f.size !== width) fail7("CRIMSON_ITEM_DESCRIPTOR_UNSUPPORTED");
      const b = import_buffer.Buffer.alloc(width);
      width === 8 ? b.writeBigUInt64LE(v) : b.writeUIntLE(Number(v), 0, width);
      append(b);
    } else if (f.name === "_socketSaveDataList") {
      append(import_buffer.Buffer.concat([import_buffer.Buffer.from([0]), u32(5), import_buffer.Buffer.alloc(13)]));
      for (let i = 0; i < 5; i++) {
        append(header(socket, import_buffer.Buffer.alloc(Math.ceil(socket.fields.length / 8)), start + length));
        append(import_buffer.Buffer.alloc(4));
        append(u32(4));
      }
    } else if ([3, 6, 7].includes(f.kind)) append(import_buffer.Buffer.from([1]));
  }
  append(u32(length - payload));
  return import_buffer.Buffer.concat(chunks);
}
function freshKnowledge(type, start, key, time) {
  const b = import_buffer.Buffer.alloc(43);
  b.writeUInt16LE(1);
  b[2] = 15;
  b.writeUInt16LE(type.index, 3);
  b.fill(255, 6, 14);
  b.writeUInt32LE(start + 18, 14);
  b.writeUInt32LE(key, 22);
  b.writeUInt32LE(1, 26);
  b.writeBigUInt64LE(BigInt(time), 30);
  b[38] = 1;
  b.writeUInt32LE(21, 39);
  return b;
}
function knowledge(raw) {
  const rows2 = /* @__PURE__ */ new Map(), document = prune(readDocument(raw, { ...KNOWLEDGE_PROJECTION, scalarFields: ["_key", "_level", "_learnedFieldTime", "_isNewMark"], onScalar: (e) => {
    const m = /\.KnowledgeSaveData\._list\[(\d+)\]\.(_key|_level|_learnedFieldTime|_isNewMark)$/.exec(e.path);
    if (m) {
      const row = rows2.get(+m[1]) || { index: +m[1], fields: {} };
      row.fields[m[2]] = { value: e.value, type: e.type, bytes: e.bytes, offset: e.offset };
      rows2.set(row.index, row);
    }
  } }));
  const roots = document.blocks.filter((b) => b.type === "KnowledgeSaveData"), list = roots.length === 1 ? field(roots[0], "_list") : null;
  if (!list?.present || list.kind !== 6 || !Number.isSafeInteger(list.count) || list.count < 1 || list.count > 1e4 || rows2.size !== list.count) fail7("CRIMSON_ITEM_KNOWLEDGE_INCOMPLETE");
  const byKey = /* @__PURE__ */ new Map();
  for (let i = 0; i < list.count; i++) {
    const row = rows2.get(i), key = row?.fields._key;
    if (!key || key.bytes !== 4 || key.type !== "KnowledgeKey" || !Number.isSafeInteger(key.value) || key.value <= 0 || byKey.has(key.value)) fail7("CRIMSON_ITEM_KNOWLEDGE_AMBIGUOUS");
    row.key = key.value;
    byKey.set(row.key, row);
  }
  return { document, list, rows: [...rows2.values()], byKey };
}
function applyDiscovery(raw, definition, types2) {
  if (!definition.knowledgeKeys.length) return { raw, decodedDiff: [], reverseStructuralByteParity: true };
  const before = knowledge(raw), patch = import_buffer.Buffer.from(raw), diff = [];
  for (const key of definition.knowledgeKeys) {
    const row = before.byKey.get(key);
    if (row) {
      const level = row.fields._level;
      if (level?.bytes !== 4 || level.type !== "TLevel" || !Number.isSafeInteger(level.value) || level.value < 0) fail7("CRIMSON_ITEM_KNOWLEDGE_LEVEL_UNSUPPORTED");
      if (level.value < 1) {
        patch.writeUInt32LE(1, level.offset);
        diff.push({ operation: "knowledge.setLevel", key, field: "_level", beforeLevel: level.value, afterLevel: 1 });
      }
    }
  }
  const missing = definition.knowledgeKeys.filter((key) => !before.byKey.has(key));
  let output = patch, reverse = true;
  if (missing.length) {
    const template = before.rows.find((r) => r.fields._level?.value >= 1 && r.fields._learnedFieldTime?.bytes === 8 && r.fields._isNewMark?.bytes === 1);
    if (!template || !/^\d{1,20}$/.test(String(template.fields._learnedFieldTime.value))) fail7("CRIMSON_ITEM_KNOWLEDGE_TEMPLATE_REQUIRED");
    const trace = traceStructuralDocument(patch, KNOWLEDGE_PROJECTION);
    prune(trace.document);
    let at = before.list.end;
    const records2 = missing.map((key) => {
      const b = freshKnowledge(types2.get("KnowledgeElementSaveData"), at, key, template.fields._learnedFieldTime.value);
      at += b.length;
      diff.push({ operation: "knowledge.add", key, objectType: "KnowledgeElementSaveData", before: null, after: { _key: key, _level: 1, _learnedFieldTime: template.fields._learnedFieldTime.value, _isNewMark: true } });
      return b;
    });
    const edit = insertTypedRecords(trace, { ...before.list, value: { count: before.list.count, truncated: false } }, records2);
    output = edit.raw;
    reverse = edit.reverseStructuralByteParity;
    edit.trace = null;
  }
  const after = knowledge(output);
  if (after.list.count !== before.list.count + missing.length) fail7("CRIMSON_ITEM_KNOWLEDGE_DIFF");
  for (const row of before.rows) {
    const next = after.byKey.get(row.key);
    if (!next) fail7("CRIMSON_ITEM_KNOWLEDGE_DIFF");
    for (const [name, old] of Object.entries(row.fields)) {
      const n = next.fields[name], changed = name === "_level" && diff.some((d) => d.operation === "knowledge.setLevel" && d.key === row.key);
      if (!n || n.type !== old.type || n.bytes !== old.bytes || n.value !== (changed ? 1 : old.value)) fail7("CRIMSON_ITEM_KNOWLEDGE_DIFF");
    }
  }
  for (const key of definition.knowledgeKeys) if (!after.byKey.has(key) || after.byKey.get(key).fields._level?.value < 1) fail7("CRIMSON_ITEM_KNOWLEDGE_DIFF");
  for (const change of diff.filter((d) => d.operation === "knowledge.add")) {
    const row = after.byKey.get(change.key);
    for (const [name, expected] of Object.entries(change.after)) if (row?.fields[name]?.value !== expected) fail7("CRIMSON_ITEM_KNOWLEDGE_DIFF");
  }
  return { raw: output, decodedDiff: diff, reverseStructuralByteParity: reverse, audit: after.document.audit };
}
function bag(document, inventoryKey = 2) {
  const roots = document.blocks.filter((b) => b.type === "InventorySaveData");
  if (roots.length !== 1) fail7("CRIMSON_ITEM_INVENTORY_AMBIGUOUS");
  const bags = elements(roots[0], "_inventorylist").filter((b) => value(b, "_inventoryKey") === inventoryKey);
  if (bags.length !== 1) fail7("CRIMSON_ITEM_INVENTORY_AMBIGUOUS");
  return bags[0];
}
function verifyItem(item, expected, definition) {
  const values = { _saveVersion: 1, _itemNo: expected.instanceId, _itemKey: expected.definitionKey, _slotNo: expected.slot, _stackCount: expected.quantity, _enchantLevel: 0, _endurance: definition?.endurance ?? 65535, _maxSocketCount: 5, _validSocketCount: definition?.initialUnlockedSockets ?? 0, _transferredItemKey: expected.definitionKey, _maxChargeUseableCount: definition?.maxCharge ?? 1, _chargedUseableCount: "1", _isNewMark: true };
  for (const [name, v] of Object.entries(values)) if (!field(item, name)?.present || value(item, name) !== v) fail7("CRIMSON_ITEM_INSERTED_VALUE_MISMATCH");
  const sockets = elements(item, "_socketSaveDataList");
  if (sockets.length !== 5 || sockets.some((s) => Object.values(s.fields).some((f) => f.present))) fail7("CRIMSON_ITEM_INSERTED_SOCKET_MISMATCH");
  for (const [name, f] of Object.entries(item.fields)) if (f.present && !Object.hasOwn(values, name) && name !== "_socketSaveDataList") fail7("CRIMSON_ITEM_INHERITED_STATE");
}
function createItemAddition({ schemaPins, definitionFor, profile: profile3, inventoryProjection, reportSchema, allowOwned = false }) {
  if (!Array.isArray(schemaPins) || !schemaPins.length || schemaPins.length > 3 || schemaPins.some((s) => !/^[a-f0-9]{64}$/.test(s))) throw Error("Invalid internal item schema pins.");
  const buildMany = async function(source, inputs, { nonce } = {}) {
    if (!import_buffer.Buffer.isBuffer(source) || source.length < 128 || source.length > MAX || !Array.isArray(inputs) || !inputs.length || inputs.length > 16 || nonce !== void 0 && (!import_buffer.Buffer.isBuffer(nonce) || nonce.length !== 16)) fail7("CRIMSON_ITEM_INPUT_INVALID");
    if (hash(JSON.stringify(profile3.entries)) !== profile3.entriesSha256) fail7("CRIMSON_ITEM_PROFILE_INVALID");
    const requested = /* @__PURE__ */ new Set(), definitions4 = inputs.map((input) => {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 2 || !Object.hasOwn(input, "definitionKey") || !Object.hasOwn(input, "quantity") || !Number.isSafeInteger(input.definitionKey) || typeof input.quantity !== "string" || !/^[1-9]\d{0,8}$/.test(input.quantity) || requested.has(input.definitionKey)) fail7("CRIMSON_ITEM_INPUT_INVALID");
      requested.add(input.definitionKey);
      const definition = definitionFor(input.definitionKey);
      if (!definition) fail7("CRIMSON_ITEM_FAMILY_UNSUPPORTED");
      const total = BigInt(input.quantity), maxStack = BigInt(definition.maxStack);
      return { input, definition, total, maxStack, required: Number((total + maxStack - 1n) / maxStack) };
    });
    const required = definitions4.reduce((n, d) => n + d.required, 0);
    if (required > 64) fail7("CRIMSON_ITEM_BATCH_LIMIT");
    const definitionByKey = new Map(definitions4.map((d) => [d.input.definitionKey, d.definition]));
    const discoveryDefinition = { knowledgeKeys: [...new Set(definitions4.flatMap((d) => d.definition.knowledgeKeys))].sort((a, b) => a - b) };
    const sourceHash = hash(source), decoded = await decodeSave(source), trace = traceStructuralDocument(decoded.plaintext, inventoryProjection), before = prune(trace.document), types2 = verifyTypes(before.schema);
    if (decoded.version !== 2 || !schemaPins.includes(before.schemaSha256) || before.audit.advisoryLocators || before.audit.unconsumedBytes) fail7("CRIMSON_ITEM_SCHEMA_UNSUPPORTED");
    if (!(await encodeSave(decoded.plaintext, decoded.header, { nonce: decoded.header.subarray(26, 42) })).equals(source)) fail7("CRIMSON_ITEM_NATIVE_PARITY_FAILED");
    const groups = /* @__PURE__ */ new Map();
    for (const definition of definitions4) {
      const key = definition.definition.defaultInventory;
      const rows2 = groups.get(key) || [];
      rows2.push(definition);
      groups.set(key, rows2);
    }
    let raw = decoded.plaintext;
    const decodedDiff = [], plans = [];
    for (const [inventoryKey, rows2] of groups) {
      const inventory = bag(before, inventoryKey), list = field(inventory, "_itemList"), items2 = elements(inventory, "_itemList");
      if (!list?.present) fail7("CRIMSON_ITEM_DESTINATION_LIST_MISSING");
      if (list.value?.truncated || list.value.count !== items2.length) fail7("CRIMSON_ITEM_INVENTORY_INCOMPLETE");
      const balances = rows2.filter((r) => r.definition.uniqueBalance);
      if (balances.some((r) => r.required !== 1 || items2.some((i) => value(i, "_itemKey") === r.input.definitionKey))) fail7("CRIMSON_ITEM_CURRENCY_BALANCE", "Use Quick Changes \u2192 Copper to update the existing balance instead of adding another currency record.");
      const keys2 = new Set(rows2.map((r) => r.input.definitionKey));
      if (!allowOwned && items2.some((i) => keys2.has(value(i, "_itemKey")))) fail7("CRIMSON_ITEM_ALREADY_OWNED");
      const count2 = rows2.reduce((n, row) => n + row.required, 0), slots = new Set(items2.map((i) => value(i, "_slotNo")));
      if (slots.size !== items2.length || [...slots].some((slot) => !Number.isSafeInteger(slot) || slot < 0 || slot > 65535)) fail7("CRIMSON_ITEM_CAPACITY_AMBIGUOUS");
      let oldCapacity = null, newCapacity = null;
      if (inventoryKey === 2) {
        const expansion = field(inventory, "_varyExpandSlotCount");
        if (!expansion?.present || expansion.bytes !== 2 || !Number.isSafeInteger(expansion.value) || expansion.value < 0 || expansion.value > 200) fail7("CRIMSON_ITEM_INVENTORY_INCOMPLETE");
        oldCapacity = 50 + expansion.value;
        if ([...slots].some((slot) => slot >= oldCapacity)) fail7("CRIMSON_ITEM_CAPACITY_AMBIGUOUS");
        newCapacity = Math.max(oldCapacity, items2.length + count2);
        if (newCapacity > 250) fail7("CRIMSON_ITEM_CAPACITY_LIMIT");
        if (newCapacity > oldCapacity) {
          if (raw === decoded.plaintext) raw = import_buffer.Buffer.from(decoded.plaintext);
          raw.writeUInt16LE(newCapacity - 50, expansion.offset);
          decodedDiff.push({ operation: "inventory.setExpansionValue", inventoryKey: 2, before: expansion.value, after: newCapacity - 50, beforeBagSize: oldCapacity, afterBagSize: newCapacity });
        }
      } else if (items2.length + count2 > 65536) fail7("CRIMSON_ITEM_CAPACITY_LIMIT");
      plans.push({ inventoryKey, rows: rows2, originalCount: items2.length, slots, before: oldCapacity, after: newCapacity, additionalSlots: count2, automaticExpansion: newCapacity !== oldCapacity, ceiling: inventoryKey === 2 ? 250 : null, slotIndexCeiling: 65535 });
    }
    let next = allocateStructuralItemId(trace), workingRaw = raw, preservationProof = true;
    const inserted = [];
    let firstPlan = true, strictAudit;
    for (const plan of plans) {
      const working = firstPlan && workingRaw.equals(decoded.plaintext) ? trace : traceStructuralDocument(workingRaw, inventoryProjection);
      firstPlan = false;
      if (working !== trace) releaseStructuralTrace(trace);
      prune(working.document);
      const list = field(bag(working.document, plan.inventoryKey), "_itemList");
      let at = list.end, slot = 0;
      const records2 = [], batch = [];
      for (const { input, definition, total, maxStack, required: countRequired } of plan.rows) {
        let left = total;
        for (let n = 0; n < countRequired; n++) {
          while (plan.slots.has(slot)) slot++;
          if (slot > 65535 || plan.inventoryKey === 2 && slot >= plan.after) fail7("CRIMSON_ITEM_CAPACITY_LIMIT");
          for (let tries = 0; ; tries++) {
            if (next > MAX_ID2 || tries > 4096) fail7("CRIMSON_ITEM_ID_EXHAUSTED");
            const b = import_buffer.Buffer.alloc(8);
            b.writeBigUInt64LE(next);
            if (!workingRaw.includes(b)) break;
            next++;
          }
          const count2 = left > maxStack ? maxStack : left, record = freshItem(types2, { start: at, itemNo: next, slot, key: input.definitionKey, quantity: count2, definition }), row = { definitionKey: input.definitionKey, inventoryKey: plan.inventoryKey, instanceId: String(next), slot, quantity: String(count2) };
          records2.push(record);
          batch.push(row);
          plan.slots.add(slot);
          next++;
          at += record.length;
          left -= count2;
        }
      }
      const edit = insertTypedRecords(working, list, records2);
      releaseStructuralTrace(working);
      prune(edit.trace.document);
      strictAudit = edit.trace.document.audit;
      const afterItems = elements(bag(edit.trace.document, plan.inventoryKey), "_itemList");
      if (afterItems.length !== plan.originalCount + plan.additionalSlots) fail7("CRIMSON_ITEM_INSERTION_COUNT");
      for (const row of batch) {
        const found = afterItems.filter((i) => String(value(i, "_itemNo")) === row.instanceId);
        if (found.length !== 1) fail7("CRIMSON_ITEM_INSERTION_COUNT");
        verifyItem(found[0], row, definitionByKey.get(row.definitionKey));
        decodedDiff.push({ operation: "inventory.addItem", objectType: "ItemSaveData", before: null, after: row, ...row });
      }
      preservationProof = preservationProof && edit.reverseStructuralByteParity;
      inserted.push(...batch);
      workingRaw = edit.raw;
      edit.trace = null;
    }
    const discovery = applyDiscovery(workingRaw, discoveryDefinition, types2);
    decodedDiff.push(...discovery.decodedDiff);
    const encoded = await encodeSave(discovery.raw, decoded.header, nonce === void 0 ? {} : { nonce }), reopened = await decodeSave(encoded);
    preservationProof = preservationProof && discovery.reverseStructuralByteParity;
    if (!preservationProof) fail7("CRIMSON_ITEM_UNRELATED_BYTES_CHANGED");
    if (!reopened.plaintext.equals(discovery.raw)) fail7("CRIMSON_ITEM_REOPEN_FAILED");
    const finalAudit = discovery.audit || strictAudit;
    if (!finalAudit || finalAudit.nonzeroListMetadata !== before.audit.nonzeroListMetadata || finalAudit.advisoryLocators || finalAudit.unconsumedBytes) fail7("CRIMSON_ITEM_REOPEN_FAILED");
    if (!(await encodeSave(reopened.plaintext, reopened.header, { nonce: reopened.header.subarray(26, 42) })).equals(encoded)) fail7("CRIMSON_ITEM_NATIVE_PARITY_FAILED");
    if (!reopened.plaintext.equals(discovery.raw) || !encoded.subarray(0, 18).equals(source.subarray(0, 18)) || !encoded.subarray(74, 128).equals(source.subarray(74, 128)) || hash(source) !== sourceHash) fail7("CRIMSON_ITEM_REOPEN_FAILED");
    const perInventory = plans.map(({ inventoryKey, before: before2, after, additionalSlots, automaticExpansion, ceiling, slotIndexCeiling }) => ({ inventoryKey, before: before2, after, additionalSlots, automaticExpansion, ceiling, slotIndexCeiling })), bag2 = perInventory.find((p) => p.inventoryKey === 2), capacity = bag2 ? { before: bag2.before, after: bag2.after, additionalSlots: bag2.additionalSlots, automaticExpansion: bag2.automaticExpansion, ceiling: 250 } : { before: null, after: null, additionalSlots: 0, automaticExpansion: false, ceiling: 250 };
    const result = { encoded, report: { schema: reportSchema, revision: profile3.revision, sourceSha256: sourceHash, outputSha256: hash(encoded), schemaSha256: before.schemaSha256, outputEncodedBytes: encoded.length, inserted, decodedDiff, discovery: { status: definitions4.length === 1 ? definitions4[0].definition.discovery : "explicit_combined_pickup_mapping", knowledgeKeys: discoveryDefinition.knowledgeKeys, changes: discovery.decodedDiff }, capacity, perInventory, runtimeRequirements: definitions4.filter((d) => d.definition.runtimeRequirement).map((d) => ({ definitionKey: d.input.definitionKey, message: d.definition.runtimeRequirement })), validation: { nativeNoOpByteParity: true, nativeOutputNoOpByteParity: true, fullTypedReparse: true, intendedOnly: true, allOtherOriginalScalarValuesUnchanged: true, originalOpaqueBytesPreserved: true, existingInventoryRecordsUnchanged: true, existingInventoryAndActiveEquipmentUnchanged: true, reverseStructuralByteParity: preservationProof, noInheritedDonorState: true, knownDescriptorFingerprintMatched: true, discoveryMappingExplicit: true, hmacReverified: true, encodedOutputReopened: true, unknownHeaderBytesPreserved: true, nonzeroListMetadataBefore: before.audit.nonzeroListMetadata, nonzeroListMetadataAfter: finalAudit.nonzeroListMetadata }, cloudRequests: 0, structuralPublicationEnabled: false, gameAcceptance: "source_backed_catalog_constructor_per_item_game_behavior_not_guaranteed", catalogWideSupport: profile3 === catalogItemAdditionProfile } };
    itemScopeWitnesses.set(result, Object.freeze({ kind: "native-item-structural-byte-proof", sourceSha256: sourceHash, outputSha256: hash(encoded), plaintextSha256: hash(reopened.plaintext), schemaSha256: before.schemaSha256, nonzeroListMetadata: finalAudit.nonzeroListMetadata, intentSha256: hash(scopeJson(inputs)), reportSha256: hash(scopeJson(result.report)) }));
    return result;
  };
  const build = (source, input, options) => buildMany(source, [input], options);
  Object.defineProperty(build, "many", { value: buildMany });
  return build;
}
function createNormalItemAddition({ schemaPins = [NORMAL_ITEM_SCHEMA] } = {}) {
  return createItemAddition({ schemaPins, definitionFor: normalItemAdditionDefinition, profile: normalItemAdditionProfile, inventoryProjection: INVENTORY_PROJECTION, reportSchema: "saveglass.normal-item-addition.v1" });
}
function createCatalogItemAddition({ schemaPins = [CATALOG_ITEM_SCHEMA] } = {}) {
  return createItemAddition({ schemaPins, definitionFor: catalogItemAdditionDefinition, profile: catalogItemAdditionProfile, inventoryProjection: { captureTypes: ["InventorySaveData"], listLimit: 1024, hashPlaintext: false }, reportSchema: "saveglass.catalog-item-addition.v1", allowOwned: true });
}
var gear, nexus, itemScopeWitnesses, scopeJson, MAX, MAX_ID2, INVENTORY_PROJECTION, KNOWLEDGE_PROJECTION, fail7, u16, u32, buildNormalItemAddition, buildNormalItemAdditions, buildCatalogItemAddition, buildCatalogItemAdditions;
var init_crimson_item_addition = __esm({
  "src/crimson-item-addition.mjs"() {
    init_buffer();
    init_crimson_codec();
    init_crimson_document();
    init_crimson_structural_layout();
    init_data_provider();
    init_normal_item_profile();
    init_source_binding();
    init_crypto();
    init_catalog_item_profile();
    init_normal_item_profile();
    gear = getData("crimson-gear-control.json");
    nexus = getData("crimson-abyss-nexus.json");
    itemScopeWitnesses = /* @__PURE__ */ new WeakMap();
    scopeJson = (value2) => canonicalJson(JSON.parse(JSON.stringify(value2)));
    MAX = 8 * 1024 * 1024;
    MAX_ID2 = 0xffffffffffffffffn;
    INVENTORY_PROJECTION = { captureTypes: ["InventorySaveData"], listLimit: 250, hashPlaintext: false };
    KNOWLEDGE_PROJECTION = { captureTypes: ["KnowledgeSaveData"], listLimit: 0, hashPlaintext: false };
    fail7 = (code, message = "This item addition stopped at its compatibility check.") => {
      throw new CodecError(message, code);
    };
    u16 = (n) => {
      const b = import_buffer.Buffer.alloc(2);
      b.writeUInt16LE(n);
      return b;
    };
    u32 = (n) => {
      const b = import_buffer.Buffer.alloc(4);
      b.writeUInt32LE(n);
      return b;
    };
    buildNormalItemAddition = createNormalItemAddition();
    buildNormalItemAdditions = buildNormalItemAddition.many;
    buildCatalogItemAddition = createCatalogItemAddition();
    buildCatalogItemAdditions = buildCatalogItemAddition.many;
  }
});

// src/companion-addition-profile.mjs
var data4, COMPANION_ADDITION_SCHEMA, companionAdditionProfile, definitions3, companionAdditionDefinition, companionAdditionSupported;
var init_companion_addition_profile = __esm({
  "src/companion-addition-profile.mjs"() {
    init_data_provider();
    data4 = getData("crimson-companion-additions.json");
    for (const entry of data4.entries) {
      Object.freeze(entry.templateVariants);
      Object.freeze(entry);
    }
    Object.freeze(data4.entries);
    COMPANION_ADDITION_SCHEMA = data4.schemaSha256;
    companionAdditionProfile = Object.freeze(data4);
    definitions3 = new Map(data4.entries.map((entry) => [entry.characterKey, entry]));
    companionAdditionDefinition = (key) => definitions3.get(key) || null;
    companionAdditionSupported = (key, schemaSha256) => definitions3.get(key)?.supported === true && (schemaSha256 === void 0 || schemaSha256 === COMPANION_ADDITION_SCHEMA);
  }
});

// src/structural-publication-profile.mjs
var MAX_STRUCTURAL_OPERATIONS, MAX_STRUCTURAL_ITEM_INTENTS, MAX_STRUCTURAL_SCALAR_OPERATIONS, MAX_COMPANION_ADDITIONS, MAX_STRUCTURAL_NEW_ITEM_STACKS, STRUCTURAL_PLAN_SCHEMA, STRUCTURAL_SCHEMA_SHA256, structuralSchemaSupported, structuralItemFamily, structuralCompanionFamily;
var init_structural_publication_profile = __esm({
  "src/structural-publication-profile.mjs"() {
    init_companion_addition_profile();
    init_catalog_item_profile();
    MAX_STRUCTURAL_OPERATIONS = 16;
    MAX_STRUCTURAL_ITEM_INTENTS = 16;
    MAX_STRUCTURAL_SCALAR_OPERATIONS = 8;
    MAX_COMPANION_ADDITIONS = 16;
    MAX_STRUCTURAL_NEW_ITEM_STACKS = 64;
    STRUCTURAL_PLAN_SCHEMA = "saveglass.structural-draft-plan.v1";
    STRUCTURAL_SCHEMA_SHA256 = "8427f58057ea9bf6dac35bc139cba163ddb135cfe89d748a2d36b94eec88d668";
    structuralSchemaSupported = (schemaSha256, version = 2) => schemaSha256 === STRUCTURAL_SCHEMA_SHA256 && version === 2;
    structuralItemFamily = (key) => catalogItemAdditionSupported(key) ? "catalog_item" : null;
    structuralCompanionFamily = (key) => companionAdditionSupported(key) ? "catalog_companion" : null;
  }
});

// src/crimson-companion-addition.mjs
var crimson_companion_addition_exports = {};
__export(crimson_companion_addition_exports, {
  buildCompanionAdditions: () => buildCompanionAdditions,
  companionAdditionDefinition: () => companionAdditionDefinition,
  companionAdditionProfile: () => companionAdditionProfile,
  companionAdditionSupported: () => companionAdditionSupported,
  createCompanionAdditions: () => createCompanionAdditions
});
function sourceTree(template, key) {
  const raw = import_buffer.Buffer.from(template.record, "base64");
  if (hash(raw) !== template.sha256 || raw.length < 24 || raw.length > 16384) fail8("CRIMSON_COMPANION_TEMPLATE_INVALID");
  const locators = new Map(template.locators.map((l) => [l.pointerOffset + 4, l])), identities = new Map(template.identities.map((i) => [i.offset, i.kind]));
  let visited = 0, identityCount = 0;
  function object(start) {
    if (start < 0 || start + 23 > raw.length) fail8("CRIMSON_COMPANION_TEMPLATE_INVALID");
    const width = raw.readUInt16LE(start), mask = raw.subarray(start + 2, start + 2 + width), typeOffset = start + 2 + width, payload = typeOffset + 15, loc = locators.get(payload), schema = templates.schemas[loc?.type];
    if (width < 1 || width > 16 || !schema || !loc || loc.typeOffset !== typeOffset || loc.pointerOffset !== typeOffset + 11 || raw.readUInt32LE(loc.pointerOffset) !== payload || raw[typeOffset + 2] !== 0 || !raw.subarray(typeOffset + 3, typeOffset + 11).equals(import_buffer.Buffer.alloc(8, 255))) fail8("CRIMSON_COMPANION_TEMPLATE_INVALID");
    const node = { type: loc.type, schema, fields: /* @__PURE__ */ new Map(), reserved: import_buffer.Buffer.from(raw.subarray(payload, payload + 4)) };
    let at = payload + 4;
    visited++;
    for (let i = 0; i < schema.length; i++) {
      const [name, , kind, size] = schema[i], present = Boolean(mask[i >> 3] & 1 << (i & 7));
      if (!present) {
        if ([3, 6, 7].includes(kind) && raw[at++] !== 1) fail8("CRIMSON_COMPANION_TEMPLATE_INVALID");
        continue;
      }
      if (kind === 0) {
        if (size < 1 || at + size > raw.length) fail8("CRIMSON_COMPANION_TEMPLATE_INVALID");
        const identity = identities.get(at);
        if (identity) {
          if (size !== 8 || !["companion", "item"].includes(identity) || raw.readBigUInt64LE(at) !== 0n || (identity === "companion" ? name !== "_mercenaryNo" : name !== "_itemNo")) fail8("CRIMSON_COMPANION_TEMPLATE_IDENTITY");
          identityCount++;
        }
        node.fields.set(name, { bytes: import_buffer.Buffer.from(raw.subarray(at, at + size)), identity });
        at += size;
      } else if (kind === 4) {
        const child = object(at);
        node.fields.set(name, { node: child.node });
        at = child.end;
      } else if (kind === 6 || kind === 7) {
        if (raw[at] !== 0 || at + 18 > raw.length) fail8("CRIMSON_COMPANION_TEMPLATE_INVALID");
        const count2 = raw.readUInt32LE(at + 1), metadata3 = import_buffer.Buffer.from(raw.subarray(at + 5, at + 18)), children = [];
        if (count2 > 64) fail8("CRIMSON_COMPANION_TEMPLATE_INVALID");
        at += 18;
        for (let j = 0; j < count2; j++) {
          const child = object(at);
          children.push(child.node);
          at = child.end;
        }
        node.fields.set(name, { list: children, metadata: metadata3 });
      } else fail8("CRIMSON_COMPANION_TEMPLATE_FIELD_UNSUPPORTED");
    }
    if (at + 4 > raw.length || raw.readUInt32LE(at) !== at - payload) fail8("CRIMSON_COMPANION_TEMPLATE_INVALID");
    return { node, end: at + 4 };
  }
  const result = object(0);
  if (result.end !== raw.length || visited !== template.locators.length || identityCount !== template.identities.length || result.node.type !== "MercenarySaveData" || result.node.fields.get("_characterKey")?.bytes.readUInt32LE() !== key) fail8("CRIMSON_COMPANION_TEMPLATE_INVALID");
  return result.node;
}
function encodeTree(tree, schema, start, allocate) {
  const kinds = new Map(schema.types.map((t) => [t.name, t])), assigned = [];
  function object(node, at) {
    const type = kinds.get(node.type), pin = templates.nativeTypes[node.type];
    if (!type || !pin || hash(JSON.stringify(type.fields)) !== (pin.signature || pin.sha256) || node.schema.some((f) => !type.fields.some((n) => JSON.stringify(descriptor(n)) === JSON.stringify(f)))) fail8("CRIMSON_COMPANION_DESCRIPTOR_UNSUPPORTED");
    const oldOrder = node.schema.map((f) => type.fields.findIndex((n) => JSON.stringify(descriptor(n)) === JSON.stringify(f)));
    if (oldOrder.some((n, i) => i > 0 && n <= oldOrder[i - 1])) fail8("CRIMSON_COMPANION_DESCRIPTOR_UNSUPPORTED");
    const extra = type.fields.filter((f) => !node.schema.some((o) => o[0] === f.name)).map((f) => f.name);
    if (JSON.stringify(extra) !== JSON.stringify(templates.newFieldsOmittedByType[node.type] || [])) fail8("CRIMSON_COMPANION_DESCRIPTOR_UNSUPPORTED");
    const mask = import_buffer.Buffer.alloc(Math.ceil(type.fields.length / 8));
    type.fields.forEach((f, i) => {
      if (node.fields.has(f.name)) mask[i >> 3] |= 1 << (i & 7);
    });
    const head = import_buffer.Buffer.concat([u162(mask.length), mask, u162(type.index), import_buffer.Buffer.from([0]), import_buffer.Buffer.alloc(8, 255), u322(at + 17 + mask.length)]), parts = [head, node.reserved];
    let length = head.length + 4;
    const append = (b) => {
      parts.push(b);
      length += b.length;
    };
    for (const f of type.fields) {
      const data6 = node.fields.get(f.name);
      if (data6?.bytes) {
        const b = import_buffer.Buffer.from(data6.bytes);
        if (data6.identity) {
          const id2 = allocate();
          b.writeBigUInt64LE(id2);
          data6.outputIdentity = id2.toString();
          assigned.push({ kind: data6.identity, instanceId: id2.toString() });
        }
        append(b);
      } else if (data6?.node) append(object(data6.node, at + length));
      else if (data6?.list) {
        append(import_buffer.Buffer.concat([import_buffer.Buffer.from([0]), u322(data6.list.length), data6.metadata]));
        for (const child of data6.list) append(object(child, at + length));
      } else if ([3, 6, 7].includes(f.kind)) append(import_buffer.Buffer.from([1]));
    }
    append(u322(length - head.length));
    return import_buffer.Buffer.concat(parts);
  }
  return { record: object(tree, start), identities: assigned };
}
function verifyTree(record, tree, raw) {
  if (record.type !== tree.type) fail8("CRIMSON_COMPANION_INSERTED_DIFF");
  for (const [name, f] of Object.entries(record.fields)) {
    const expected = tree.fields.get(name);
    if (Boolean(f.present) !== Boolean(expected)) fail8("CRIMSON_COMPANION_INSERTED_DIFF");
    if (!expected) continue;
    if (expected.bytes) {
      const bytes2 = import_buffer.Buffer.from(expected.bytes);
      if (expected.identity) bytes2.writeBigUInt64LE(BigInt(expected.outputIdentity));
      if (!raw.subarray(f.offset, f.end).equals(bytes2)) fail8("CRIMSON_COMPANION_INSERTED_DIFF");
    } else if (expected.node) verifyTree(f.value, expected.node, raw);
    else if (expected.list) {
      const children = elements(record, name);
      if (f.value?.truncated || f.value.count !== expected.list.length || children.length !== expected.list.length || !f.value.metadataBytes.equals(expected.metadata)) fail8("CRIMSON_COMPANION_INSERTED_DIFF");
      children.forEach((child, i) => verifyTree(child, expected.list[i], raw));
    }
  }
}
function treeCount(node, type) {
  return Number(node.type === type) + [...node.fields.values()].reduce((n, f) => n + (f.node ? treeCount(f.node, type) : f.list ? f.list.reduce((m, c) => m + treeCount(c, type), 0) : 0), 0);
}
function createCompanionAdditions({ schemaPins = [COMPANION_ADDITION_SCHEMA] } = {}) {
  if (!Array.isArray(schemaPins) || !schemaPins.length || schemaPins.length > 3 || schemaPins.some((s) => !/^[a-f0-9]{64}$/.test(s))) throw Error("Invalid internal companion schema pins.");
  return async function build(source, inputs, { nonce } = {}) {
    if (!import_buffer.Buffer.isBuffer(source) || source.length < 128 || source.length > MAX2 || !Array.isArray(inputs) || !inputs.length || inputs.length > 16 || inputs.some((o) => !o || typeof o !== "object" || Array.isArray(o) || Object.keys(o).length !== 1 || !Number.isSafeInteger(o.characterKey) || !companionAdditionSupported(o.characterKey)) || nonce !== void 0 && (!import_buffer.Buffer.isBuffer(nonce) || nonce.length !== 16)) fail8("CRIMSON_COMPANION_INPUT_INVALID", "Choose companions with a known clean game record.");
    if (hash(JSON.stringify(companionAdditionProfile.entries)) !== companionAdditionProfile.entriesSha256 || hash(JSON.stringify(templates.templates)) !== templates.templatesSha256) fail8("CRIMSON_COMPANION_PROFILE_INVALID");
    const sourceHash = hash(source), decoded = await decodeSave(source), trace = traceStructuralDocument(decoded.plaintext, { captureTypes: ["MercenaryClanSaveData"], listLimit: 1e3, hashPlaintext: false }), before = trace.document;
    if (decoded.version !== 2 || !schemaPins.includes(before.schemaSha256) || before.audit.advisoryLocators || before.audit.unconsumedBytes) fail8("CRIMSON_COMPANION_SCHEMA_UNSUPPORTED");
    if (!(await encodeSave(decoded.plaintext, decoded.header, { nonce: decoded.header.subarray(26, 42) })).equals(source)) fail8("CRIMSON_COMPANION_NATIVE_PARITY_FAILED");
    const roots = before.blocks.filter((b) => b.type === "MercenaryClanSaveData");
    if (roots.length !== 1) fail8("CRIMSON_COMPANION_CLAN_AMBIGUOUS");
    const list = field(roots[0], "_mercenaryDataList"), rows2 = elements(roots[0], "_mercenaryDataList");
    if (!list?.present || list.value?.truncated || list.value.count !== rows2.length || rows2.length < 1 || rows2.length + inputs.length > 1e3 || rows2.some((r) => r.type !== "MercenarySaveData")) fail8("CRIMSON_COMPANION_CLAN_INCOMPLETE");
    const ownedGroups = new Set(rows2.map((r) => groupFor(value(r, "_characterKey")))), selectedGroups = /* @__PURE__ */ new Set();
    for (const row of rows2) {
      const key = value(row, "_characterKey");
      if (value(row, "_isMainMercenary") === true && value(row, "_ownedCharacterKey") === 1) {
        const definition = companionAdditionDefinition(key);
        if (definition) selectedGroups.add(definition.category);
        else if (companionEnrichment(key)?.classification !== "system") fail8("CRIMSON_COMPANION_SELECTION_UNMAPPED");
      }
    }
    const ids2 = rows2.map((r) => value(r, "_mercenaryNo"));
    if (ids2.some((id2) => typeof id2 !== "string" || !/^[1-9]\d*$/.test(id2)) || new Set(ids2).size !== ids2.length) fail8("CRIMSON_COMPANION_IDENTITIES_AMBIGUOUS");
    let next = allocateStructuralItemId(trace), position = list.end;
    const allocated = /* @__PURE__ */ new Set(), records2 = [], inserted = [], trees = [];
    function allocate() {
      for (let tries = 0; ; tries++) {
        if (next > MAX_ID3 || tries > 4096) fail8("CRIMSON_COMPANION_ID_EXHAUSTED");
        const n = next++, b = import_buffer.Buffer.alloc(8);
        b.writeBigUInt64LE(n);
        if (!decoded.plaintext.includes(b) && !allocated.has(n.toString())) {
          allocated.add(n.toString());
          return n;
        }
      }
    }
    for (const input of inputs) {
      const definition = companionAdditionDefinition(input.characterKey), group = groupFor(input.characterKey);
      if (ownedGroups.has(group)) fail8("CRIMSON_COMPANION_ALREADY_OWNED", "This companion or another variant using its ownership slot is already owned or queued.");
      ownedGroups.add(group);
      const selected2 = !selectedGroups.has(definition.category), state2 = selected2 ? "selected" : "idle", tree = sourceTree(templates.templates[String(input.characterKey)][state2], input.characterKey);
      if (definition.category === "pets" && treeCount(tree, "ItemSaveData")) fail8("CRIMSON_COMPANION_PET_EQUIPMENT_INVALID");
      const built = encodeTree(tree, before.schema, position, allocate), identity = built.identities.find((id2) => id2.kind === "companion");
      if (!identity || built.identities.filter((id2) => id2.kind === "companion").length !== 1) fail8("CRIMSON_COMPANION_TEMPLATE_IDENTITY");
      records2.push(built.record);
      trees.push(tree);
      inserted.push({ characterKey: input.characterKey, displayName: definition.name, category: definition.category, ownershipGroup: group, instanceId: identity.instanceId, selectedInCategory: selected2, templateVariant: state2, runtimeRequirement: definition.runtimeRequirement, recordBytes: built.record.length, embeddedItems: treeCount(tree, "ItemSaveData"), identities: built.identities });
      position += built.record.length;
      if (selected2) selectedGroups.add(definition.category);
    }
    const edit = insertTypedRecords(trace, list, records2), after = edit.trace.document, afterRows = elements(after.blocks.find((b) => b.type === "MercenaryClanSaveData"), "_mercenaryDataList");
    if (afterRows.length !== rows2.length + inputs.length) fail8("CRIMSON_COMPANION_INSERTION_COUNT");
    inserted.forEach((entry, i) => {
      const row = afterRows[rows2.length + i];
      if (value(row, "_characterKey") !== entry.characterKey || value(row, "_mercenaryNo") !== entry.instanceId || Boolean(value(row, "_isMainMercenary")) !== entry.selectedInCategory || entry.selectedInCategory && value(row, "_ownedCharacterKey") !== 1) fail8("CRIMSON_COMPANION_INSERTED_DIFF");
      verifyTree(row, trees[i], edit.raw);
    });
    const typedIds = traceStructuralDocument(edit.raw, { captureRelocation: true, captureTypes: [], listLimit: 0, hashPlaintext: false }).identities.map((i) => i.value);
    if ([...allocated].some((id2) => typedIds.filter((v) => v === id2).length !== 1) || allocated.size !== inserted.reduce((n, r) => n + r.identities.length, 0)) fail8("CRIMSON_COMPANION_IDENTITY_COLLISION");
    const encoded = await encodeSave(edit.raw, decoded.header, nonce === void 0 ? {} : { nonce }), reopened = await decodeSave(encoded);
    if (!reopened.plaintext.equals(edit.raw) || !encoded.subarray(0, 18).equals(source.subarray(0, 18)) || !encoded.subarray(74, 128).equals(source.subarray(74, 128)) || hash(source) !== sourceHash || !(await encodeSave(reopened.plaintext, reopened.header, { nonce: reopened.header.subarray(26, 42) })).equals(encoded)) fail8("CRIMSON_COMPANION_REOPEN_FAILED");
    if (after.audit.nonzeroListMetadata !== before.audit.nonzeroListMetadata) fail8("CRIMSON_COMPANION_METADATA_CHANGED");
    return { encoded, report: { schema: "saverift.companion-addition.v1", revision: companionAdditionProfile.revision, sourceSha256: sourceHash, outputSha256: hash(encoded), schemaSha256: before.schemaSha256, inserted, decodedDiff: inserted.map((r) => ({ operation: "companions.add", ...r })), validation: { nativeNoOpByteParity: true, nativeOutputNoOpByteParity: true, fullTypedReparse: true, originalScalarValuesUnchanged: true, allOtherOriginalScalarValuesUnchanged: true, reverseStructuralByteParity: edit.reverseStructuralByteParity, sourceTemplateLogicalValuesPreserved: true, existingInventoryAndCompanionsUnchanged: true, existingSelectionPreserved: true, newSelectionOnlyWhenCategoryEmpty: true, knownDescriptorFingerprintsMatched: true, globalIdentitiesUnique: true, knowledgeUnchanged: true, hmacReverified: true, encodedOutputReopened: true, unknownHeaderBytesPreserved: true, nonzeroListMetadataBefore: before.audit.nonzeroListMetadata, nonzeroListMetadataAfter: after.audit.nonzeroListMetadata }, cloudRequests: 0, structuralPublicationEnabled: false, gameAcceptance: "known_clean_record_structure_no_per_definition_console_gate" } };
  };
}
var templates, MAX2, MAX_ID3, fail8, u162, u322, descriptor, groupFor, buildCompanionAdditions;
var init_crimson_companion_addition = __esm({
  "src/crimson-companion-addition.mjs"() {
    init_buffer();
    init_data_provider();
    init_companion_addition_profile();
    init_crimson_enrichment();
    init_crimson_codec();
    init_crimson_document();
    init_crimson_structural_layout();
    init_source_binding();
    templates = getData("crimson-companion-templates.json");
    MAX2 = 8 * 1024 * 1024;
    MAX_ID3 = 0xffffffffffffffffn;
    fail8 = (code, message = "This companion record does not match the available game format.") => {
      throw new CodecError(message, code);
    };
    u162 = (n) => {
      const b = import_buffer.Buffer.alloc(2);
      b.writeUInt16LE(n);
      return b;
    };
    u322 = (n) => {
      const b = import_buffer.Buffer.alloc(4);
      b.writeUInt32LE(n);
      return b;
    };
    descriptor = (f) => [f.name, f.type, f.kind, f.size, f.aux];
    groupFor = (key) => companionAdditionDefinition(key)?.ownershipGroup || `character:${key}`;
    buildCompanionAdditions = createCompanionAdditions();
  }
});

// src/structural-draft.mjs
var structural_draft_exports = {};
__export(structural_draft_exports, {
  assertStructuralPlan: () => assertStructuralPlan,
  compileStructuralDraft: () => compileStructuralDraft,
  createStructuralDraftCompiler: () => createStructuralDraftCompiler,
  createStructuralWorkbenchDraft: () => createStructuralWorkbenchDraft,
  prepareStructuralDocument: () => prepareStructuralDocument,
  structuralDraftDigest: () => structuralDraftDigest,
  structuralSourcePayload: () => structuralSourcePayload
});
function assertStructuralPlan(input, { allowScalarOnly = false, schemaPins = [CRIMSON_CURRENT_SCHEMA] } = {}) {
  if (!exact2(input, common) || input.schema !== STRUCTURAL_PLAN_SCHEMA || input.payload !== "save" || !/^slot\d{1,3},savedgame$/.test(input.container || "") || !common.filter((k) => k.endsWith("Sha256") || k === "backupRevision").every((k) => typeof input[k] === "string" && digest2.test(input[k])) || !Array.isArray(input.operations) || input.operations.length < 1 || input.operations.length > MAX_STRUCTURAL_OPERATIONS) fail9("STRUCTURAL_PLAN_INVALID", void 0, 400);
  if (input.decoderRevision !== DECODER_REVISION || input.catalogRevision !== CATALOG_REVISION) fail9("STRUCTURAL_PLAN_STALE");
  if (!schemaPins.includes(input.schemaSha256)) fail9("STRUCTURAL_SCHEMA_UNSUPPORTED", "This save layout is not supported for additions yet. Choose another save.");
  let scalars = 0, items2 = 0, pets = 0, newSlots = 0;
  const identities = /* @__PURE__ */ new Set();
  for (const op of input.operations) {
    if (scalarNames.includes(op?.operation)) {
      const keys2 = op.operation === "inventory.setExpansionValue" ? ["operation", "inventoryKey", "expectedValue", "desiredValue"] : ["operation", "inventoryKey", "definitionKey", "instanceId", "slot", "expectedValue", "desiredValue"];
      if (!exact2(op, keys2) || (!Number.isSafeInteger(op.inventoryKey) || op.inventoryKey < 0 || op.inventoryKey > 65535 || op.operation !== "inventory.setQuantity" && op.inventoryKey !== 2) || typeof op.expectedValue !== "string" || typeof op.desiredValue !== "string" || !/^\d{1,20}$/.test(op.expectedValue) || !/^\d{1,20}$/.test(op.desiredValue)) fail9("STRUCTURAL_OPERATION_INVALID", void 0, 400);
      scalars++;
      continue;
    }
    if (op?.operation === "inventory.addItem" && exact2(op, ["operation", "definitionKey", "quantity"]) && structuralItemFamily(op.definitionKey) && typeof op.quantity === "string" && /^[1-9]\d{0,8}$/.test(op.quantity)) {
      const max = BigInt(catalogItemAdditionDefinition(op.definitionKey).maxStack);
      if ((BigInt(op.quantity) + max - 1n) / max > BigInt(MAX_STRUCTURAL_NEW_ITEM_STACKS)) fail9("STRUCTURAL_QUANTITY_UNSUPPORTED", "Choose a smaller quantity for this item.", 400);
      newSlots += Number((BigInt(op.quantity) + max - 1n) / max);
      items2++;
      if (identities.has("item:" + op.definitionKey)) fail9("STRUCTURAL_OPERATION_DUPLICATE");
      identities.add("item:" + op.definitionKey);
      continue;
    }
    if (op?.operation === "companions.add" && exact2(op, ["operation", "characterKey"]) && structuralCompanionFamily(op.characterKey)) {
      pets++;
      if (identities.has("pet:" + op.characterKey)) fail9("STRUCTURAL_OPERATION_DUPLICATE");
      identities.add("pet:" + op.characterKey);
      continue;
    }
    fail9("STRUCTURAL_OPERATION_UNSUPPORTED", "This catalog entry is missing a required clean record template or native field definition.", 400);
  }
  if (!allowScalarOnly && !items2 && !pets || scalars > MAX_STRUCTURAL_SCALAR_OPERATIONS || items2 > MAX_STRUCTURAL_ITEM_INTENTS || pets > MAX_COMPANION_ADDITIONS || newSlots > MAX_STRUCTURAL_NEW_ITEM_STACKS) fail9("STRUCTURAL_SCOPE_UNSUPPORTED", void 0, 400);
  return input;
}
function records(document, type) {
  const out = [];
  function visit(o) {
    if (!o?.fields) return;
    if (o.type === type) out.push(o);
    for (const f of Object.values(o.fields)) {
      if (f.value?.elements) f.value.elements.forEach(visit);
      else if (f.value?.fields) visit(f.value);
    }
  }
  document.blocks.forEach(visit);
  return out;
}
function one(rows2, select, code = "STRUCTURAL_SOURCE_AMBIGUOUS") {
  const a = rows2.filter(select);
  if (a.length !== 1) fail9(code);
  return a[0];
}
function scalarDigest(raw, { paths = /* @__PURE__ */ new Set(), ranges = [] } = {}) {
  const d = createScalarDigest();
  readDocument(raw, { captureTypes: [], listLimit: 0, hashPlaintext: false, onScalar: (e) => {
    if (paths.has(e.path) || ranges.some((r) => e.offset >= r.wrapperStart && e.offset < r.end)) return;
    d.update(e);
  } });
  return d.digest();
}
function structuralSourcePayload(backup, metadata3, input) {
  assertSourceBinding(backup, metadata3, input);
  const c = one(backup.containers, (c2) => c2.index?.fileName === input.container), blob = one(c.blobs, (b) => b.name === "save");
  if (c.blobs.length !== 2 || !c.blobs.some((b) => b.name === "lobby") || blob.sha256 !== input.payloadSha256) fail9("STRUCTURAL_SOURCE_CHANGED");
  const prepared = preparedSource(backup, metadata3, input), bytes2 = prepared?.encoded || import_buffer.Buffer.from(blob.data, "base64");
  if (bytes2.length < 128 || bytes2.length > 8 * 1024 * 1024 || bytes2.length !== blob.size || !prepared && (bytes2.toString("base64") !== blob.data || hash(bytes2) !== blob.sha256)) fail9("STRUCTURAL_SOURCE_CHANGED");
  return { bytes: bytes2, blob, prepared };
}
function semanticIndex(raw, { hashPlaintext = true, scalarLocators = false, knowledgeDetails = true, companionDetails = true } = {}) {
  const knowledge2 = /* @__PURE__ */ new Map(), knowledgePaths = /* @__PURE__ */ new Map(), identities = /* @__PURE__ */ new Map(), scalarPaths = /* @__PURE__ */ new Map();
  let itemCount = 0, petCount = 0, knowledgeCount = 0;
  const document = readDocument(raw, { captureTypes: ["InventorySaveData", ...companionDetails ? ["MercenaryClanSaveData"] : []], listLimit: 1024, hashPlaintext, scalarFields: ["_itemNo", "_mercenaryNo", "_key", ...knowledgeDetails ? ["_level", "_learnedFieldTime", "_isNewMark"] : [], ...scalarLocators ? ["_stackCount", "_varyExpandSlotCount"] : []], onScalar: (e) => {
    if (scalarLocators && /\.(?:_stackCount|_varyExpandSlotCount)$/.test(e.path)) {
      if (scalarPaths.has(e.offset)) fail9("STRUCTURAL_SCALAR_BINDING_FAILED");
      scalarPaths.set(e.offset, e);
    }
    if (/\.(_itemNo|_mercenaryNo)$/.test(e.path)) {
      const id2 = String(e.value);
      identities.set(id2, (identities.get(id2) || 0) + 1);
    }
    const m = /^(.*\.KnowledgeSaveData\._list\[(\d+)\])\.(_key|_level|_learnedFieldTime|_isNewMark)$/.exec(e.path);
    if (m) {
      if (knowledgeDetails) {
        const row = knowledgePaths.get(m[1]) || { path: m[1], index: Number(m[2]), fields: {} };
        row.fields[m[3]] = e;
        knowledgePaths.set(m[1], row);
      } else if (m[3] === "_key") {
        if (!Number.isSafeInteger(e.value) || knowledge2.has(e.value)) fail9("STRUCTURAL_KNOWLEDGE_AMBIGUOUS");
        knowledge2.set(e.value, { key: e.value });
      }
    }
  }, onObject: (e) => {
    if (e.type === "ItemSaveData") itemCount++;
    if (e.type === "MercenarySaveData") petCount++;
    if (e.type === "KnowledgeElementSaveData") {
      knowledgeCount++;
      if (knowledgeDetails) {
        const row = knowledgePaths.get(e.path);
        if (row) row.range = { wrapperStart: e.start, end: e.end };
      }
    }
  } });
  for (const row of knowledgePaths.values()) {
    const key = row.fields._key?.value;
    if (!Number.isSafeInteger(key) || knowledge2.has(key)) fail9("STRUCTURAL_KNOWLEDGE_AMBIGUOUS");
    row.key = key;
    knowledge2.set(key, row);
  }
  if (!knowledgeDetails && knowledge2.size !== knowledgeCount) fail9("STRUCTURAL_KNOWLEDGE_AMBIGUOUS");
  return { document, knowledge: knowledge2, identities, itemCount, petCount, scalarPaths };
}
function projectionDigest(document) {
  const { plaintext, ...projection } = document;
  return hash(JSON.stringify(projection));
}
function prepareStructuralDocument(raw, operations) {
  const knowledgeDetails = operations.some((o) => o.operation === "inventory.addItem" && catalogItemAdditionDefinition(o.definitionKey)?.knowledgeKeys.length), companionDetails = operations.some((o) => o.operation === "companions.add");
  const index = semanticIndex(raw, { scalarLocators: true, knowledgeDetails, companionDetails });
  structuralSnapshots.set(index.document, { index, knowledgeDetails, companionDetails, digest: projectionDigest(index.document) });
  return index.document;
}
function preparedStructuralIndex(prepared, { knowledgeDetails, companionDetails }) {
  const snapshot = structuralSnapshots.get(prepared?.document);
  if (!snapshot || snapshot.knowledgeDetails !== knowledgeDetails || snapshot.companionDetails !== companionDetails) return null;
  if (prepared.document.plaintext !== prepared.decoded.plaintext || projectionDigest(prepared.document) !== snapshot.digest) fail9("STRUCTURAL_SOURCE_CHANGED");
  return { ...snapshot.index };
}
function permittedKnowledgeChanges(sourceIndex, addItems) {
  const changes = /* @__PURE__ */ new Map();
  for (const op of addItems) {
    for (const key of catalogItemAdditionDefinition(op.definitionKey).knowledgeKeys) {
      const old = sourceIndex.knowledge.get(key);
      if (!old) changes.set(key, { operation: "knowledge.add", key });
      else if (old.fields._level?.value < 1) changes.set(key, { operation: "knowledge.setLevel", key, beforeLevel: old.fields._level.value, afterLevel: 1, path: old.fields._level.path });
    }
  }
  return changes;
}
function createStructuralDraftCompiler({ schemaPins = [CRIMSON_CURRENT_SCHEMA], itemCompiler = buildCatalogItemAdditions, companionCompiler = buildCompanionAdditions2, scalarCompiler = createWorkbenchDraft } = {}) {
  if (!Array.isArray(schemaPins) || !schemaPins.length || schemaPins.length > 3 || schemaPins.some((s) => !/^[a-f0-9]{64}$/.test(s)) || [itemCompiler, companionCompiler, scalarCompiler].some((fn) => typeof fn !== "function")) throw Error("Invalid internal structural compiler configuration.");
  return async function compileStructuralDraft2(backup, metadata3, input, { nonce, retainEncoded = false } = {}) {
    assertStructuralPlan(input, { schemaPins });
    if (nonce !== void 0 && (!import_buffer.Buffer.isBuffer(nonce) || nonce.length !== 16)) fail9("STRUCTURAL_NONCE_INVALID");
    const addItems = input.operations.filter((o) => o.operation === "inventory.addItem"), addPets = input.operations.filter((o) => o.operation === "companions.add"), scalarOps = input.operations.filter((o) => scalarNames.includes(o.operation)).map((o) => ({ ...o })), knowledgeDetails = addItems.some((op) => catalogItemAdditionDefinition(op.definitionKey).knowledgeKeys.length > 0);
    const { bytes: source, blob, prepared } = structuralSourcePayload(backup, metadata3, input), decoded = prepared?.decoded || await decodeSave(source), sourceIndex = preparedStructuralIndex(prepared, { knowledgeDetails, companionDetails: addPets.length > 0 }) || semanticIndex(decoded.plaintext, { scalarLocators: true, knowledgeDetails, companionDetails: addPets.length > 0 });
    let before = sourceIndex.document;
    if (decoded.version !== 2 || !schemaPins.includes(before.schemaSha256) || before.schemaSha256 !== input.schemaSha256 || before.plaintextSha256 !== input.plaintextSha256 || before.audit.advisoryLocators || before.audit.unconsumedBytes) fail9("STRUCTURAL_SOURCE_CHANGED");
    if (!await preparedSourceNativeParity(backup, metadata3, input, decoded, source, encodeSave)) fail9("STRUCTURAL_NATIVE_PARITY_FAILED");
    const stackCount = (op) => {
      const max = BigInt(catalogItemAdditionDefinition(op.definitionKey).maxStack);
      return Number((BigInt(op.quantity) + max - 1n) / max);
    }, totalStacks = addItems.reduce((n, op) => n + stackCount(op), 0), slotsNeeded = addItems.filter((op) => catalogItemAdditionDefinition(op.definitionKey).defaultInventory === 2).reduce((n, op) => n + stackCount(op), 0);
    if (totalStacks > MAX_STRUCTURAL_NEW_ITEM_STACKS) fail9("STRUCTURAL_OPERATION_LIMIT", "Send fewer item stacks together.");
    let capacity = null;
    if (slotsNeeded || scalarOps.some((op) => op.inventoryKey === 2)) {
      const bag2 = one(elements(one(before.blocks, (b) => b.type === "InventorySaveData"), "_inventorylist"), (b) => value(b, "_inventoryKey") === 2), list = field(bag2, "_itemList"), rows2 = elements(bag2, "_itemList"), expansion = field(bag2, "_varyExpandSlotCount");
      if (!list?.present || list.value?.truncated || list.count !== rows2.length || !expansion?.present || expansion.kind !== 0 || expansion.bytes !== 2) fail9("STRUCTURAL_INVENTORY_INCOMPLETE");
      capacity = planInventoryCapacity({ inventory: { bags: [{ inventoryKey: 2, itemListPresent: true, truncated: false, itemRecordCount: rows2.length, expansionSlots: expansion.value }], records: rows2.map((r) => ({ inventoryKey: 2, slot: value(r, "_slotNo"), instanceId: value(r, "_itemNo") })) } }, { additionalSlots: slotsNeeded });
      if (!capacity.canFit) fail9("STRUCTURAL_INVENTORY_FULL", capacity.warning);
      const capacityOp = scalarOps.find((o) => o.operation === "inventory.setExpansionValue");
      if (capacity.automaticExpansionRequired) {
        if (capacityOp) capacityOp.desiredValue = String(Math.max(Number(capacityOp.desiredValue), capacity.requiredExpansionSlots));
        else scalarOps.push({ operation: "inventory.setExpansionValue", inventoryKey: 2, expectedValue: String(expansion.value), desiredValue: String(capacity.requiredExpansionSlots) });
      }
    }
    if (scalarOps.length > MAX_STRUCTURAL_SCALAR_OPERATIONS) fail9("STRUCTURAL_OPERATION_LIMIT", "Send fewer changes together so inventory space can be checked.");
    const nonzero = before.audit.nonzeroListMetadata, originalSchema = before.schemaSha256, knowledgeChanges = permittedKnowledgeChanges(sourceIndex, addItems);
    before = null;
    sourceIndex.document = null;
    let working = source, scalarReport = null, nativeScope = true;
    const scopeProofs = [], scopeChecks = [], stages = [], paths = new Set([...knowledgeChanges.values()].filter((d) => d.path).map((d) => d.path));
    if (scalarOps.length) {
      const scalarPlan = { ...input, schema: "saveglass.crimson-draft-plan.v1", operations: scalarOps }, r = await scalarCompiler(backup, metadata3, scalarPlan, { nonce });
      working = r.encoded;
      scalarReport = r.report;
      const proof = scalarScopeWitness(r, source, scalarPlan);
      nativeScope = Boolean(proof);
      if (proof) {
        scopeProofs.push(proof);
        scopeChecks.push(() => Boolean(scalarScopeWitness(r, source, scalarPlan)));
      }
      if (scalarReport.operations.length !== scalarOps.length) fail9("STRUCTURAL_SCALAR_BINDING_FAILED");
      for (const op of scalarReport.operations) {
        const e = sourceIndex.scalarPaths.get(op.offset);
        if (!e || e.bytes !== op.fieldBytes || String(e.value) !== op.before || !e.path.endsWith("." + op.field) || paths.has(e.path)) fail9("STRUCTURAL_SCALAR_BINDING_FAILED");
        paths.add(e.path);
      }
    }
    try {
      const requests = [...addItems.length ? [{ operation: "inventory.addItem", family: "catalog_item", items: addItems }] : [], ...addPets.length ? [{ operation: "companions.add", family: "catalog_companion", companions: addPets }] : []];
      for (const op of requests) {
        const item = op.operation === "inventory.addItem", stageSource = working;
        const r = item ? await itemCompiler(working, op.items.map((o) => ({ definitionKey: o.definitionKey, quantity: o.quantity })), { nonce }) : await companionCompiler(working, op.companions.map((o) => ({ characterKey: o.characterKey })), { nonce });
        const proof = item ? itemScopeWitness(r, stageSource, op.items.map((o) => ({ definitionKey: o.definitionKey, quantity: o.quantity }))) : null;
        nativeScope = nativeScope && Boolean(proof);
        if (proof) {
          scopeProofs.push(proof);
          scopeChecks.push(() => Boolean(itemScopeWitness(r, stageSource, op.items.map((o) => ({ definitionKey: o.definitionKey, quantity: o.quantity })))));
        }
        const flags = ["fullTypedReparse", "reverseStructuralByteParity", "hmacReverified", "encodedOutputReopened", "unknownHeaderBytesPreserved", "allOtherOriginalScalarValuesUnchanged"];
        if (r.report.sourceSha256 !== hash(working) || r.report.cloudRequests !== 0 || !flags.every((k) => r.report.validation[k] === true)) fail9("STRUCTURAL_STAGE_VALIDATION_FAILED");
        stages.push({ operation: op.operation, family: op.family, revision: r.report.revision, sourceSha256: r.report.sourceSha256, outputSha256: r.report.outputSha256, inserted: Array.isArray(r.report.inserted) ? r.report.inserted : [r.report.inserted], decodedDiff: r.report.decodedDiff || [], perInventory: r.report.perInventory || [], runtimeRequirements: r.report.runtimeRequirements || r.report.inserted.filter((r2) => r2.runtimeRequirement).map((r2) => ({ characterKey: r2.characterKey, message: r2.runtimeRequirement })), validation: r.report.validation });
        working = r.encoded;
      }
    } catch (error) {
      if (error instanceof CodecError) {
        const messages = { CRIMSON_COMPANION_ALREADY_OWNED: "This save already has this companion.", CRIMSON_ITEM_ALREADY_OWNED: "This item is already in your bag. Change its existing stack instead.", CRIMSON_GEAR_ALREADY_OWNED: "This gear is already owned in this save." };
        throw new ProbeError(messages[error.code] || error.message, 409, error.code);
      }
      throw error;
    }
    const actualKnowledge = stages.flatMap((s) => s.decodedDiff.filter((d) => d.operation === "knowledge.add" || d.operation === "knowledge.setLevel"));
    const nativeItemUnion = nativeScope && !knowledgeDetails && !addPets.length;
    const reopened = await decodeSave(working);
    let after, afterPlaintextSha256, original = null;
    if (nativeItemUnion) {
      const proof = scopeProofs.at(-1), entries = stages.flatMap((s) => s.inserted), ids2 = /* @__PURE__ */ new Set(), totals = /* @__PURE__ */ new Map();
      afterPlaintextSha256 = hash(reopened.plaintext);
      if (proof?.kind !== "native-item-structural-byte-proof" || proof.outputSha256 !== hash(working) || proof.plaintextSha256 !== afterPlaintextSha256 || proof.schemaSha256 !== originalSchema || proof.nonzeroListMetadata !== nonzero || actualKnowledge.length || entries.length !== totalStacks) fail9("STRUCTURAL_UNINTENDED_CHANGE");
      for (const entry of entries) {
        const definition = catalogItemAdditionDefinition(entry.definitionKey);
        if (!addItems.some((o) => o.definitionKey === entry.definitionKey) || entry.inventoryKey !== definition.defaultInventory || sourceIndex.identities.has(entry.instanceId) || ids2.has(entry.instanceId) || !/^[1-9]\d{0,19}$/.test(entry.quantity) || BigInt(entry.quantity) > BigInt(definition.maxStack)) fail9("STRUCTURAL_FINAL_IDENTITY_CHANGED");
        ids2.add(entry.instanceId);
        totals.set(entry.definitionKey, (totals.get(entry.definitionKey) || 0n) + BigInt(entry.quantity));
      }
      if (addItems.some((o) => totals.get(o.definitionKey) !== BigInt(o.quantity))) fail9("STRUCTURAL_FINAL_QUANTITY_CHANGED");
      after = { schemaSha256: proof.schemaSha256, audit: { nonzeroListMetadata: proof.nonzeroListMetadata, advisoryLocators: 0, unconsumedBytes: 0 } };
    } else {
      const finalIndex = semanticIndex(reopened.plaintext, { hashPlaintext: false, knowledgeDetails, companionDetails: addPets.length > 0 });
      after = finalIndex.document;
      const afterItems = records(after, "ItemSaveData"), afterPets = records(after, "MercenarySaveData"), inserted = [], newIds = [];
      const requestedItems = new Map(addItems.map((op) => [op.definitionKey, op])), requestedPets = new Set(addPets.map((op) => op.characterKey)), itemTotals = /* @__PURE__ */ new Map(), itemBags = /* @__PURE__ */ new Map();
      for (const bag2 of elements(after.blocks.find((b) => b.type === "InventorySaveData"), "_inventorylist")) for (const r of elements(bag2, "_itemList")) itemBags.set(value(r, "_itemNo"), value(bag2, "_inventoryKey"));
      let insertedItems = 0, insertedPets = 0, embeddedItems = 0;
      for (const stage2 of stages) {
        const pet = stage2.operation === "companions.add";
        for (const entry of stage2.inserted) {
          const r = one(pet ? afterPets : afterItems, (o) => String(value(o, pet ? "_mercenaryNo" : "_itemNo")) === entry.instanceId);
          inserted.push(r);
          if (pet) {
            if (!requestedPets.has(entry.characterKey)) fail9("STRUCTURAL_FINAL_IDENTITY_CHANGED");
            const nestedItems = records({ blocks: [r] }, "ItemSaveData"), actualIds = [{ kind: "companion", instanceId: value(r, "_mercenaryNo") }, ...nestedItems.map((i) => ({ kind: "item", instanceId: value(i, "_itemNo") }))], sortIds = (ids2) => ids2.map((i) => i.kind + ":" + i.instanceId).sort();
            if (nestedItems.length !== (entry.embeddedItems || 0) || JSON.stringify(sortIds(actualIds)) !== JSON.stringify(sortIds(entry.identities || []))) fail9("STRUCTURAL_FINAL_IDENTITY_CHANGED");
            insertedPets++;
            embeddedItems += nestedItems.length;
            newIds.push(...actualIds.map((i) => i.instanceId));
          } else {
            const request = requestedItems.get(entry.definitionKey), definition = catalogItemAdditionDefinition(entry.definitionKey);
            if (!request || entry.inventoryKey !== definition.defaultInventory || itemBags.get(entry.instanceId) !== definition.defaultInventory || value(r, "_slotNo") !== entry.slot || !/^[1-9]\d{0,19}$/.test(entry.quantity) || BigInt(entry.quantity) > BigInt(definition.maxStack)) fail9("STRUCTURAL_FINAL_IDENTITY_CHANGED");
            itemTotals.set(entry.definitionKey, (itemTotals.get(entry.definitionKey) || 0n) + BigInt(entry.quantity));
            insertedItems++;
            newIds.push(entry.instanceId);
          }
          if (value(r, pet ? "_characterKey" : "_itemKey") !== (pet ? entry.characterKey : entry.definitionKey) || !pet && String(value(r, "_stackCount")) !== entry.quantity) fail9("STRUCTURAL_FINAL_IDENTITY_CHANGED");
        }
      }
      if (actualKnowledge.length !== knowledgeChanges.size || new Set(actualKnowledge.map((d) => d.key)).size !== actualKnowledge.length) fail9("STRUCTURAL_DISCOVERY_DIFF");
      let addedKnowledge = 0;
      for (const change of actualKnowledge) {
        const allowed = knowledgeChanges.get(change.key), old = sourceIndex.knowledge.get(change.key), row = finalIndex.knowledge.get(change.key);
        if (!allowed || allowed.operation !== change.operation || !row || row.fields._level?.value !== 1) fail9("STRUCTURAL_DISCOVERY_DIFF");
        if (change.operation === "knowledge.add") {
          if (old || !row.range || row.index < sourceIndex.knowledge.size || Object.entries(change.after || {}).some(([key, expected]) => row.fields[key]?.value !== expected)) fail9("STRUCTURAL_DISCOVERY_DIFF");
          inserted.push(row.range);
          addedKnowledge++;
        } else if (change.beforeLevel !== old.fields._level.value || change.afterLevel !== 1 || row.fields._level.path !== allowed.path) fail9("STRUCTURAL_DISCOVERY_DIFF");
      }
      if (addItems.some((op) => itemTotals.get(op.definitionKey) !== BigInt(op.quantity))) fail9("STRUCTURAL_FINAL_QUANTITY_CHANGED");
      original = nativeScope ? null : scalarDigest(decoded.plaintext, { paths });
      if (finalIndex.knowledge.size !== sourceIndex.knowledge.size + addedKnowledge || newIds.some((id2) => sourceIndex.identities.has(id2) || finalIndex.identities.get(id2) !== 1) || new Set(newIds).size !== newIds.length || insertedItems !== totalStacks || insertedPets !== addPets.length || finalIndex.itemCount !== sourceIndex.itemCount + insertedItems + embeddedItems || finalIndex.petCount !== sourceIndex.petCount + insertedPets || after.schemaSha256 !== originalSchema || after.audit.nonzeroListMetadata !== nonzero || after.audit.advisoryLocators || after.audit.unconsumedBytes || !nativeScope && JSON.stringify(scalarDigest(reopened.plaintext, { paths, ranges: inserted })) !== JSON.stringify(original)) fail9("STRUCTURAL_UNINTENDED_CHANGE");
      if (scalarReport) {
        for (const op of scalarReport.operations) {
          const target = op.operation === "inventory.setExpansionValue" ? one(elements(one(after.blocks, (b) => b.type === "InventorySaveData"), "_inventorylist"), (b) => value(b, "_inventoryKey") === 2) : one(afterItems, (o) => String(value(o, "_itemNo")) === op.instanceId);
          if (String(value(target, op.field)) !== op.after || op.operation !== "inventory.setExpansionValue" && itemBags.get(op.instanceId) !== op.inventoryKey) fail9("STRUCTURAL_SCALAR_CHANGED");
        }
      }
    }
    if (nativeScope && !scopeChecks.every((check) => check())) fail9("STRUCTURAL_STAGE_VALIDATION_FAILED");
    if (!working.subarray(0, 18).equals(source.subarray(0, 18)) || !working.subarray(74, 128).equals(source.subarray(74, 128)) || !nativeItemUnion && !(await encodeSave(reopened.plaintext, reopened.header, { nonce: reopened.header.subarray(26, 42) })).equals(working) || hash(source) !== blob.sha256) fail9("STRUCTURAL_REOPEN_FAILED");
    const beforePlaintextSha256 = hash(decoded.plaintext);
    if (beforePlaintextSha256 !== input.plaintextSha256) fail9("STRUCTURAL_SOURCE_CHANGED");
    afterPlaintextSha256 ??= hash(reopened.plaintext);
    const operations = [...scalarReport?.operations || [], ...stages.flatMap((s) => s.inserted.map((entry) => ({ operation: s.operation, ...entry }))), ...actualKnowledge];
    const report = { schema: "saveglass.structural-draft-preview.v1", revision: "saverift.source-backed-construction.2026-11-01.v2", decoderRevision: DECODER_REVISION, catalogRevision: CATALOG_REVISION, source: "plugin_bundle", backupId: metadata3.id, backupSha256: metadata3.sha256, backupRevision: backup.revision, container: input.container, payload: "save", payloadSha256: blob.sha256, schemaSha256: originalSchema, beforePlaintextSha256, afterPlaintextSha256, planSha256: structuralDraftDigest(input), encodedSha256: hash(working), encodedBytes: working.length, operations, decodedDiff: operations, capacity, stages, runtimeRequirements: stages.flatMap((s) => s.runtimeRequirements), validation: { nativeNoOpByteParity: true, nativeLz4NoOpByteParity: true, originalNoOpByteParity: true, fullDocumentReparsed: true, fullTypedReparse: true, allOtherDecodedValuesUnchanged: true, originalScalarValuesUnchanged: true, ...original ? { originalScalarDigest: original.sha256, originalScalarCount: original.count } : { conservationProof: { format: "native-stage-witnesses.v1", stages: scopeProofs } }, stagewiseReverseStructuralByteParity: true, distinctGlobalNewIdentities: true, discoveryIntendedOnly: true, hmacReverified: true, encodedOutputReopened: true, unknownHeaderBytesPreserved: true, nonzeroListMetadataPreserved: after.audit.nonzeroListMetadata === nonzero, nonzeroListMetadataBefore: nonzero, nonzeroListMetadataAfter: after.audit.nonzeroListMetadata }, gameAcceptance: "known_record_structure_no_per_definition_console_gate", draftOnly: true, originalBackupUnchanged: true, modifiedSaveStored: false, writesEnabled: false, publishEligible: false };
    return retainEncoded ? { report, encoded: working } : report;
  };
}
var common, scalarNames, digest2, structuralSnapshots, buildCompanionAdditions2, exact2, canonical2, structuralDraftDigest, fail9, compileStructuralDraft, createStructuralWorkbenchDraft;
var init_structural_draft = __esm({
  "src/structural-draft.mjs"() {
    init_buffer();
    init_scalar_digest();
    init_source_binding();
    init_crimson_codec();
    init_crimson_document();
    init_crimson_draft();
    init_crimson_domain();
    init_inventory_capacity();
    init_crimson_item_addition();
    init_catalog_item_profile();
    init_structural_publication_profile();
    common = ["schema", "container", "payload", "backupSha256", "backupRevision", "payloadSha256", "plaintextSha256", "schemaSha256", "decoderRevision", "catalogRevision", "operations"];
    scalarNames = ["inventory.setQuantity", "inventory.setCopper", "inventory.setExpansionValue"];
    digest2 = /^[a-f0-9]{64}$/;
    structuralSnapshots = /* @__PURE__ */ new WeakMap();
    buildCompanionAdditions2 = async (...args) => (await Promise.resolve().then(() => (init_crimson_companion_addition(), crimson_companion_addition_exports))).buildCompanionAdditions(...args);
    exact2 = (o, keys2) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length === keys2.length && keys2.every((k) => Object.hasOwn(o, k));
    canonical2 = (o) => Array.isArray(o) ? o.map(canonical2) : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, canonical2(o[k])])) : o;
    structuralDraftDigest = (input) => hash(JSON.stringify(canonical2(input)));
    fail9 = (code, message = "This addition does not match this save\u2019s known record format. Reopen your save and review the changes.", status = 409) => {
      throw new ProbeError(message, status, code);
    };
    compileStructuralDraft = createStructuralDraftCompiler();
    createStructuralWorkbenchDraft = (backup, metadata3, input, { nonce } = {}) => compileStructuralDraft(backup, metadata3, input, { nonce, retainEncoded: true });
  }
});

// src/crimson-nexus-discoveries.mjs
function scan(raw) {
  const rows2 = /* @__PURE__ */ new Map(), document = readDocument(raw, { onScalar: (e) => {
    const m = rowPattern.exec(e.path);
    if (!m) return;
    const row = rows2.get(+m[1]) || { index: +m[1], fields: {} };
    row.fields[m[2]] = { type: e.type, bytes: e.bytes, value: e.value };
    rows2.set(row.index, row);
  } });
  const roots = document.schema.toc.filter((e) => document.schema.types[e.classIndex]?.name === ROOT);
  if (roots.length !== 1) fail10("CRIMSON_NEXUS_DISCOVERY_AMBIGUOUS");
  for (const [name, pin] of Object.entries(profile.types)) {
    const t = document.schema.types.find((t2) => t2.name === name);
    if (!t || hash(JSON.stringify(t.fields)) !== pin.sha256) fail10("CRIMSON_NEXUS_DISCOVERY_DESCRIPTOR_UNSUPPORTED");
  }
  const root = roots[0], offset = root.offset + 11, end = root.offset + root.bytes;
  if (raw.readUInt16LE(root.offset) !== 1 || raw[root.offset + 2] !== 3 || raw.readUInt32LE(root.offset + 7) !== 1 || raw[offset] !== 0 || offset + 18 > end) fail10("CRIMSON_NEXUS_DISCOVERY_LAYOUT_UNSUPPORTED");
  const count2 = raw.readUInt32LE(offset + 1);
  if (count2 > 1e4 || rows2.size !== count2) fail10("CRIMSON_NEXUS_DISCOVERY_INCOMPLETE");
  const byUuid = /* @__PURE__ */ new Map();
  for (let i = 0; i < count2; i++) {
    const row = rows2.get(i), f = row?.fields, key = f?._levelGimmickSceneObjectInfoKey, uuid = f?._sceneObjectUuid;
    if (!key || key.type !== "LevelGimmickSceneObjectInfoKey" || key.bytes !== 4 || !Number.isSafeInteger(key.value) || key.value <= 0 || uuid?.type !== "uint4" || uuid.bytes !== 16 || !/^[a-f0-9]{32}$/.test(uuid.value?.hex) || byUuid.has(uuid.value.hex)) fail10("CRIMSON_NEXUS_DISCOVERY_AMBIGUOUS");
    row.uuid = uuid.value.hex;
    row.key = key.value;
    byUuid.set(row.uuid, row);
  }
  for (const b of document.blocks) b.fields = null;
  return { document, rows: [...rows2.values()], byUuid, list: { present: true, offset, end, value: { count: count2, truncated: false }, count: count2 } };
}
function checkedProfile() {
  if (profile.entries.length !== 213 || new Set(profile.entries.map((e) => e.uuid)).size !== 213 || profile.selection.key !== 1000001 || hash(JSON.stringify(profile.entries)) !== profile.contentSha256 || profile.entries.some((e) => e.key !== 1000001 || !/^[a-f0-9]{32}$/.test(e.uuid) || !Array.isArray(e.fogPivotPosition) || e.fogPivotPosition.length !== 3 || e.fogPivotPosition.some((v) => !Number.isFinite(v) || Math.abs(v) > 100))) fail10("CRIMSON_NEXUS_DISCOVERY_PROFILE_INVALID");
}
function freshRecord(type, start, e) {
  const b = import_buffer.Buffer.alloc(58);
  b.writeUInt16LE(1, 0);
  b[2] = 7;
  b.writeUInt16LE(type.index, 3);
  b[5] = 0;
  b.fill(255, 6, 14);
  b.writeUInt32LE(start + 18, 14);
  b.writeUInt32LE(e.key, 22);
  import_buffer.Buffer.from(e.uuid, "hex").copy(b, 26);
  e.fogPivotPosition.forEach((v, i) => b.writeFloatLE(v, 42 + i * 4));
  b.writeUInt32LE(36, 54);
  return b;
}
function fogPreserved(trace, after, insert, delta) {
  const before = trace.document, schema = before.schema, old = schema.toc.filter((e) => schema.types[e.classIndex]?.name === "FogSaveData"), next = after.schema.toc.filter((e) => after.schema.types[e.classIndex]?.name === "FogSaveData");
  return old.length === next.length && old.every((e, i) => {
    if (e.bytes !== next[i].bytes) return false;
    const expected = import_buffer.Buffer.from(before.plaintext.subarray(e.offset, e.offset + e.bytes));
    for (const l of trace.locators) if (l.pointerOffset >= e.offset && l.pointerOffset + 4 <= e.offset + e.bytes && l.advertisedPayloadOffset >= insert) expected.writeUInt32LE(l.advertisedPayloadOffset + delta, l.pointerOffset - e.offset);
    return expected.equals(after.plaintext.subarray(next[i].offset, next[i].offset + next[i].bytes));
  });
}
function addNexusDiscoveries(raw) {
  checkedProfile();
  const before = scan(raw), missing = profile.entries.filter((e) => !before.byUuid.has(e.uuid));
  for (const entry of profile.entries) {
    const row = before.byUuid.get(entry.uuid);
    if (row && row.key !== entry.key) fail10("CRIMSON_NEXUS_DISCOVERY_ID_CONFLICT");
  }
  const coverage = { knownFieldNexusLocations: 213, discoveredLocationsPresentBefore: 213 - missing.length, discoveredLocationsAdded: missing.length, beforeDiscoveryRecords: before.list.count, afterDiscoveryRecords: before.list.count + missing.length };
  if (!missing.length) return { raw, decodedDiff: [], coverage, validation: { unrelatedDiscoveriesPreserved: true, existingDiscoveryCoordinatesPreserved: true, fogBytesUnchanged: true, discoveryReverseStructuralByteParity: true }, source: profile.source };
  const type = before.document.schema.types.find((t) => t.name === TYPE), trace = traceStructuralDocument(raw);
  for (const b of trace.document.blocks) b.fields = null;
  let cursor = before.list.end;
  const records2 = missing.map((e) => {
    const record = freshRecord(type, cursor, e);
    cursor += record.length;
    return record;
  }), edit = insertTypedRecords(trace, before.list, records2);
  edit.trace = null;
  const after = scan(edit.raw);
  if (after.list.count !== coverage.afterDiscoveryRecords || after.document.audit.nonzeroListMetadata !== before.document.audit.nonzeroListMetadata || after.document.schemaSha256 !== before.document.schemaSha256) fail10("CRIMSON_NEXUS_DISCOVERY_REPARSE_FAILED");
  for (const old of before.rows) {
    const next = after.byUuid.get(old.uuid);
    if (!next || JSON.stringify(old.fields) !== JSON.stringify(next.fields)) fail10("CRIMSON_NEXUS_DISCOVERY_UNRELATED_CHANGE");
  }
  for (const e of missing) {
    const f = after.byUuid.get(e.uuid)?.fields;
    if (!f || Object.keys(f).length !== 3 || f._levelGimmickSceneObjectInfoKey.value !== e.key || JSON.stringify(f._fogPivotPosition?.value) !== JSON.stringify(e.fogPivotPosition)) fail10("CRIMSON_NEXUS_DISCOVERY_INSERTED_MISMATCH");
  }
  if (!fogPreserved(trace, after.document, edit.insert, edit.delta)) fail10("CRIMSON_NEXUS_FOG_CHANGED");
  return { raw: edit.raw, decodedDiff: missing.map((e) => ({ operation: "nexus.discovery.add", objectType: TYPE, key: e.key, uuid: e.uuid, before: null, after: { _levelGimmickSceneObjectInfoKey: e.key, _sceneObjectUuid: e.uuid, _fogPivotPosition: e.fogPivotPosition } })), coverage, validation: { unrelatedDiscoveriesPreserved: true, existingDiscoveryCoordinatesPreserved: true, fogBytesUnchanged: true, discoveryReverseStructuralByteParity: edit.reverseStructuralByteParity }, source: profile.source };
}
var profile, nexusDiscoveryProfile, ROOT, TYPE, rowPattern, fail10;
var init_crimson_nexus_discoveries = __esm({
  "src/crimson-nexus-discoveries.mjs"() {
    init_buffer();
    init_data_provider();
    init_crimson_codec();
    init_crimson_document();
    init_source_binding();
    init_crimson_structural_layout();
    profile = getData("crimson-nexus-discoveries.json");
    nexusDiscoveryProfile = Object.freeze(profile);
    ROOT = "DiscoveredLevelGimmickSceneObjectSaveData";
    TYPE = "LevelGimmickSceneObjectElementSaveData";
    rowPattern = /\.DiscoveredLevelGimmickSceneObjectSaveData\._discoveredLevelGimmickSceneObjectSaveDataList\[(\d+)\]\.(_levelGimmickSceneObjectInfoKey|_sceneObjectUuid|_fogPivotPosition|_isCompleted|_isDiscoverd)$/;
    fail10 = (code) => {
      throw new CodecError("The Nexus discovery check stopped at its compatibility check.", code);
    };
  }
});

// src/crimson-abyss-nexus.mjs
var crimson_abyss_nexus_exports = {};
__export(crimson_abyss_nexus_exports, {
  ABYSS_NEXUS_REVISION: () => ABYSS_NEXUS_REVISION,
  abyssNexusProfile: () => abyssNexusProfile,
  createAbyssNexusPreview: () => createAbyssNexusPreview,
  previewAbyssNexus: () => previewAbyssNexus
});
function retainKnowledgeProjection(document) {
  for (const root of document.blocks) if (root.type !== "KnowledgeSaveData") root.fields = null;
  return document;
}
function scanKnowledge(raw) {
  const rows2 = /* @__PURE__ */ new Map();
  const document = readDocument(raw, { onScalar: (e) => {
    const m = pathPattern.exec(e.path);
    if (!m) return;
    const index = Number(m[2]), row = rows2.get(index) || { index, fields: {} };
    row.fields[m[3]] = { value: e.value, offset: e.offset, bytes: e.bytes, type: e.type };
    rows2.set(index, row);
  } });
  const roots = document.blocks.filter((b) => b.type === "KnowledgeSaveData");
  if (roots.length !== 1) fail11("CRIMSON_NEXUS_KNOWLEDGE_AMBIGUOUS");
  const list = field(roots[0], "_list");
  if (!list?.present || list.kind !== 6 || !Number.isSafeInteger(list.count) || list.count < 1 || list.count > 1e4 || rows2.size !== list.count) fail11("CRIMSON_NEXUS_KNOWLEDGE_INCOMPLETE");
  const byKey = /* @__PURE__ */ new Map();
  for (let i = 0; i < list.count; i++) {
    const row = rows2.get(i), key = row?.fields?._key;
    if (!key || key.type !== "KnowledgeKey" || key.bytes !== 4 || !Number.isSafeInteger(key.value) || key.value <= 0 || byKey.has(key.value)) fail11("CRIMSON_NEXUS_KNOWLEDGE_AMBIGUOUS");
    row.key = key.value;
    byKey.set(row.key, row);
  }
  retainKnowledgeProjection(document);
  return { document, list, rows: [...rows2.values()].sort((a, b) => a.index - b.index), byKey };
}
function checkedProfile2(schema) {
  if (profile2.minimumLevel !== 1 || profile2.entries.length !== 305 || keys.size !== 305 || hash(JSON.stringify(profile2.entries)) !== profile2.contentSha256 || profile2.targets.nexusLocationKnowledge !== 303 || profile2.targets.supportingKnowledge !== 2 || profile2.entries.filter((e) => e.internalName.startsWith("Knowledge_AbyssRuins_")).length !== 303 || profile2.entries.some((e) => !e.internalName.startsWith("Knowledge_AbyssRuins_") && ![1000363, 1001031].includes(e.key))) fail11("CRIMSON_NEXUS_PROFILE_INVALID");
  for (const [name, pin] of Object.entries(profile2.nativeSchema.types)) {
    const type = schema.types.find((t) => t.name === name);
    if (!type || hash(JSON.stringify(type.fields)) !== pin.sha256) fail11("CRIMSON_NEXUS_DESCRIPTOR_UNSUPPORTED");
  }
  return schema.types.find((t) => t.name === "KnowledgeElementSaveData");
}
function freshKnowledge2(type, start, key, time) {
  const b = import_buffer.Buffer.alloc(43);
  b.writeUInt16LE(1, 0);
  b[2] = 15;
  b.writeUInt16LE(type.index, 3);
  b[5] = 0;
  b.fill(255, 6, 14);
  b.writeUInt32LE(start + 18, 14);
  b.writeUInt32LE(0, 18);
  b.writeUInt32LE(key, 22);
  b.writeUInt32LE(1, 26);
  b.writeBigUInt64LE(BigInt(time), 30);
  b[38] = 1;
  b.writeUInt32LE(21, 39);
  return b;
}
function sameFields(a, b, { level = false } = {}) {
  const names = /* @__PURE__ */ new Set([...Object.keys(a.fields), ...Object.keys(b.fields)]);
  for (const name of names) {
    if (level && name === "_level") continue;
    const x = a.fields[name], y = b.fields[name];
    if (!x || !y || x.type !== y.type || x.bytes !== y.bytes || x.value !== y.value) return false;
  }
  return true;
}
function fogPreserved2(before, after, insert, delta) {
  const types2 = before.document.schema.types, original = before.document.schema.toc.filter((e) => types2[e.classIndex]?.name === "FogSaveData"), updated = after.schema.toc.filter((e) => after.schema.types[e.classIndex]?.name === "FogSaveData");
  if (original.length !== updated.length) return false;
  return original.every((e, i) => {
    const next = updated[i];
    if (e.bytes !== next.bytes) return false;
    const expected = import_buffer.Buffer.from(before.document.plaintext.subarray(e.offset, e.offset + e.bytes));
    for (const loc of before.locators) if (loc.pointerOffset >= e.offset && loc.pointerOffset + 4 <= e.offset + e.bytes && loc.advertisedPayloadOffset >= insert) expected.writeUInt32LE(loc.advertisedPayloadOffset + delta, loc.pointerOffset - e.offset);
    return expected.equals(after.plaintext.subarray(next.offset, next.offset + next.bytes));
  });
}
function createAbyssNexusPreview({ schemaPins = [profile2.nativeSchema.schemaSha256] } = {}) {
  if (!Array.isArray(schemaPins) || !schemaPins.length || schemaPins.length > 4 || schemaPins.some((s) => !/^[a-f0-9]{64}$/.test(s))) throw Error("Invalid internal Nexus schema pins.");
  return async function preview(source, { nonce } = {}) {
    if (!import_buffer.Buffer.isBuffer(source) || source.length < 128 || source.length > MAX3 || nonce !== void 0 && (!import_buffer.Buffer.isBuffer(nonce) || nonce.length !== 16)) fail11("CRIMSON_NEXUS_INPUT_INVALID");
    const sourceHash = hash(source), decoded = await decodeSave(source), before = scanKnowledge(decoded.plaintext), type = checkedProfile2(before.document.schema);
    if (decoded.version !== 2 || !schemaPins.includes(before.document.schemaSha256) || before.document.audit.advisoryLocators !== 0 || before.document.audit.unconsumedBytes !== 0) fail11("CRIMSON_NEXUS_SCHEMA_UNSUPPORTED");
    if (!(await encodeSave(decoded.plaintext, decoded.header, { nonce: decoded.header.subarray(26, 42) })).equals(source)) fail11("CRIMSON_NEXUS_NATIVE_PARITY_FAILED");
    const missing = [], changes = [], levelPatches = [];
    let alreadySatisfied = 0, presentBefore = 0;
    for (const entry of profile2.entries) {
      const row = before.byKey.get(entry.key);
      if (!row) {
        missing.push(entry);
        changes.push({ operation: "knowledge.add", key: entry.key, internalName: entry.internalName, displayName: entry.displayName, beforeLevel: null, afterLevel: 1 });
        continue;
      }
      presentBefore++;
      const level = row.fields._level;
      if (!level || level.type !== "TLevel" || level.bytes !== 4 || !Number.isSafeInteger(level.value) || level.value < 0) fail11("CRIMSON_NEXUS_TARGET_LEVEL_UNSUPPORTED");
      if (level.value >= 1) {
        alreadySatisfied++;
        continue;
      }
      levelPatches.push({ key: entry.key, offset: level.offset, before: level.value, after: 1 });
      changes.push({ operation: "knowledge.setLevel", key: entry.key, internalName: entry.internalName, displayName: entry.displayName, beforeLevel: level.value, afterLevel: 1 });
    }
    const patched = import_buffer.Buffer.from(decoded.plaintext);
    for (const p of levelPatches) patched.writeUInt32LE(1, p.offset);
    const restored = import_buffer.Buffer.from(patched);
    for (const p of levelPatches) restored.writeUInt32LE(p.before, p.offset);
    if (!restored.equals(decoded.plaintext)) fail11("CRIMSON_NEXUS_UNRELATED_BYTES_CHANGED");
    const traced = traceStructuralDocument(patched);
    retainKnowledgeProjection(traced.document);
    let raw = patched, edit = null, template = null;
    if (missing.length) {
      template = before.rows.find((r) => keys.has(r.key) && r.fields._level?.value >= 1 && r.fields._learnedFieldTime?.bytes === 8 && r.fields._isNewMark?.bytes === 1) || before.rows.find((r) => r.fields._level?.value >= 1 && r.fields._learnedFieldTime?.bytes === 8 && r.fields._isNewMark?.bytes === 1);
      if (!template || !/^\d{1,20}$/.test(String(template.fields._learnedFieldTime.value))) fail11("CRIMSON_NEXUS_NATIVE_TEMPLATE_REQUIRED");
      let cursor = before.list.end;
      const records2 = missing.map((e) => {
        const b = freshKnowledge2(type, cursor, e.key, template.fields._learnedFieldTime.value);
        cursor += b.length;
        return b;
      });
      const completeList = { ...before.list, value: { count: before.list.count, truncated: false } };
      edit = insertTypedRecords(traced, completeList, records2);
      raw = edit.raw;
      edit.trace = null;
    }
    const after = scanKnowledge(raw);
    if (after.list.count !== before.list.count + missing.length || after.document.schemaSha256 !== before.document.schemaSha256 || after.document.audit.advisoryLocators !== 0 || after.document.audit.unconsumedBytes !== 0 || after.document.audit.nonzeroListMetadata !== before.document.audit.nonzeroListMetadata) fail11("CRIMSON_NEXUS_REPARSE_FAILED");
    for (const row of before.rows) {
      const next = after.byKey.get(row.key), changed2 = levelPatches.some((p) => p.key === row.key);
      if (!next || !sameFields(row, next, { level: changed2 }) || changed2 && next.fields._level?.value !== 1) fail11("CRIMSON_NEXUS_SEMANTIC_DIFF");
    }
    for (const entry of profile2.entries) {
      const row = after.byKey.get(entry.key);
      if (!row || row.fields._level?.value < 1) fail11("CRIMSON_NEXUS_TARGET_MISSING");
    }
    for (const entry of missing) {
      const row = after.byKey.get(entry.key);
      if (row.fields._level?.value !== 1 || row.fields._learnedFieldTime?.value !== template.fields._learnedFieldTime.value || row.fields._isNewMark?.value !== true || Object.keys(row.fields).length !== 4) fail11("CRIMSON_NEXUS_INSERTED_DEFAULT_MISMATCH");
    }
    if (!fogPreserved2(traced, after.document, edit?.insert ?? raw.length, edit?.delta ?? 0)) fail11("CRIMSON_NEXUS_FOG_CHANGED");
    const discoveries = addNexusDiscoveries(raw);
    raw = discoveries.raw;
    const changed = changes.length + discoveries.decodedDiff.length;
    const encoded = changed ? await encodeSave(raw, decoded.header, nonce === void 0 ? {} : { nonce }) : import_buffer.Buffer.from(source), reopened = await decodeSave(encoded);
    if (!reopened.plaintext.equals(raw) || !encoded.subarray(0, 18).equals(source.subarray(0, 18)) || !encoded.subarray(74, 128).equals(source.subarray(74, 128)) || hash(source) !== sourceHash) fail11("CRIMSON_NEXUS_REOPEN_FAILED");
    if (!(await encodeSave(reopened.plaintext, reopened.header, { nonce: reopened.header.subarray(26, 42) })).equals(encoded)) fail11("CRIMSON_NEXUS_NATIVE_PARITY_FAILED");
    const decodedDiff = changes.map((change) => change.operation === "knowledge.add" ? { ...change, objectType: "KnowledgeElementSaveData", before: null, after: { _key: change.key, _level: 1, _learnedFieldTime: template.fields._learnedFieldTime.value, _isNewMark: true } } : { ...change, objectType: "KnowledgeElementSaveData", field: "_level" });
    return { encoded, report: { schema: ABYSS_NEXUS_REVISION, revision: "crimson-abyss-nexus-knowledge-discovery.v2", status: changed ? "preview_ready" : "already_satisfied", scope: "nexus_knowledge_and_missing_field_discoveries", sourceSha256: sourceHash, beforePlaintextSha256: hash(decoded.plaintext), afterPlaintextSha256: hash(raw), schemaSha256: before.document.schemaSha256, outputSha256: hash(encoded), encodedBytes: encoded.length, targets: profile2.targets, coverage: { presentBefore, missingBefore: missing.length, levelsBelowMinimum: levelPatches.length, alreadySatisfied, addedRecords: missing.length, updatedLevels: levelPatches.length, beforeKnowledgeRecords: before.list.count, afterKnowledgeRecords: after.list.count, ...discoveries.coverage }, decodedDiff: [...decodedDiff, ...discoveries.decodedDiff], source: profile2.source, discoverySource: discoveries.source, selection: profile2.selection, template: template ? { source: "same_save_native_knowledge_record", key: template.key, learnedFieldTime: "preserved_same_save_template", newMark: true } : null, validation: { nativeNoOpByteParity: true, fullTypedReparse: true, intendedKnowledgeOnly: false, intendedNexusOnly: true, ...discoveries.validation, unrelatedKnowledgePreserved: true, existingHigherLevelsPreserved: true, fogBytesUnchanged: true, originalOpaqueBytesPreserved: true, unknownHeaderBytesPreserved: true, hmacReverified: true, encodedOutputReopened: true, reverseStructuralByteParity: !missing.length || edit.reverseStructuralByteParity, nonzeroListMetadataBefore: before.document.audit.nonzeroListMetadata, nonzeroListMetadataAfter: after.document.audit.nonzeroListMetadata }, sourceSaveUnchanged: true, canSend: false, cloudRequests: 0, publicationEnabled: false, gameAcceptance: "unverified_nexus_discovery_recipe", mapFogReveal: false, questProgressChanged: false, inventoryChanged: false } };
  };
}
var profile2, ABYSS_NEXUS_REVISION, abyssNexusProfile, MAX3, keys, fail11, pathPattern, previewAbyssNexus;
var init_crimson_abyss_nexus = __esm({
  "src/crimson-abyss-nexus.mjs"() {
    init_buffer();
    init_data_provider();
    init_crimson_codec();
    init_crimson_document();
    init_source_binding();
    init_crimson_structural_layout();
    init_crimson_nexus_discoveries();
    profile2 = getData("crimson-abyss-nexus.json");
    ABYSS_NEXUS_REVISION = "saveglass.abyss-nexus-preview.v1";
    abyssNexusProfile = Object.freeze(profile2);
    MAX3 = 8 * 1024 * 1024;
    keys = new Map(profile2.entries.map((e) => [e.key, e]));
    fail11 = (code) => {
      throw new CodecError("The Abyss Nexus preview stopped at its compatibility check.", code);
    };
    pathPattern = /^(\$\[\d+\]\.KnowledgeSaveData\._list\[(\d+)\])\.(_key|_level|_learnedFieldTime|_isNewMark)$/;
    previewAbyssNexus = createAbyssNexusPreview();
  }
});

// src/crimson-map-reveal.mjs
var crimson_map_reveal_exports = {};
__export(crimson_map_reveal_exports, {
  MAP_REVEAL_REVISION: () => MAP_REVEAL_REVISION,
  createMapRevealPreview: () => createMapRevealPreview,
  mapOutputWitness: () => mapOutputWitness,
  mapRevealProfile: () => mapRevealProfile,
  previewMapReveal: () => previewMapReveal
});
function mapOutputWitness(result, source) {
  const proof = mapOutputWitnesses.get(result);
  if (!proof || !import_buffer.Buffer.isBuffer(source) || !import_buffer.Buffer.isBuffer(result?.encoded) || hash(source) !== proof.sourceSha256 || hash(result.encoded) !== proof.outputSha256 || hash(JSON.stringify(result.report)) !== proof.reportSha256) return null;
  return Object.freeze({ ...proof });
}
function metadata(raw, { compareTo } = {}) {
  const d = readDocument(raw, { captureTypes: ["FogSaveData"], listLimit: 0, hashPlaintext: false, ...compareTo ? { compareTo } : {} });
  for (const root of d.blocks) root.fields = null;
  return d;
}
function locateFog(raw, schema) {
  for (const [name, pin] of Object.entries(mapRevealProfile.types)) {
    const type2 = schema.types.find((t) => t.name === name);
    if (!type2 || hash(JSON.stringify(type2.fields)) !== pin.sha256) fail12("CRIMSON_MAP_DESCRIPTOR_UNSUPPORTED");
  }
  const roots = schema.toc.map((entry2, index2) => ({ entry: entry2, index: index2 })).filter(({ entry: entry2 }) => schema.types[entry2.classIndex]?.name === "FogSaveData");
  if (!roots.length) fail12("CRIMSON_MAP_FOG_UNAVAILABLE");
  if (roots.length !== 1) fail12("CRIMSON_MAP_FOG_AMBIGUOUS");
  const { entry, index } = roots[0], end = entry.offset + entry.bytes;
  if (raw.readUInt16LE(entry.offset) !== 1 || raw[entry.offset + 2] !== 1) fail12("CRIMSON_MAP_FOG_UNAVAILABLE");
  let p = entry.offset + 7;
  if (raw.readUInt16LE(p) !== 1 || raw[p + 2] !== 7) fail12("CRIMSON_MAP_RLE_UNSUPPORTED");
  const typeAt = p + 3, type = schema.types[raw.readUInt16LE(typeAt)], payload = typeAt + 15;
  if (type?.name !== "SimpleRunLengthEncodingSaveData" || raw[typeAt + 2] !== 0 || !raw.subarray(typeAt + 3, typeAt + 11).equals(import_buffer.Buffer.alloc(8, 255)) || raw.readUInt32LE(typeAt + 11) !== payload) fail12("CRIMSON_MAP_RLE_UNSUPPORTED");
  p = payload + 4;
  const arrays = {};
  for (const def of type.fields) {
    if (p + 5 > end || raw[p] !== 0) fail12("CRIMSON_MAP_RLE_UNSUPPORTED");
    const count2 = raw.readUInt32LE(p + 1), start = p + 5, stop = start + count2 * def.size;
    if (count2 < 1 || count2 > mapRevealProfile.maximumCodeCount || !Number.isSafeInteger(stop) || stop > end) fail12("CRIMSON_MAP_RLE_BOUNDS");
    arrays[def.name] = { tagOffset: p, count: count2, start, end: stop, bytes: stop - start };
    p = stop;
  }
  if (p + 4 !== end || raw.readUInt32LE(p) !== p - payload || arrays._codeList.count !== arrays._lengthList.count) fail12("CRIMSON_MAP_RLE_UNSUPPORTED");
  return { entry, index, arrays, code: arrays._codeList, path: `$[${index}].FogSaveData._fogRLESaveData._codeList` };
}
function createMapRevealPreview({ schemaPins = [mapRevealProfile.schemaSha256] } = {}) {
  if (!Array.isArray(schemaPins) || !schemaPins.length || schemaPins.length > 4 || schemaPins.some((s) => !/^[a-f0-9]{64}$/.test(s))) throw Error("Invalid internal map schema pins.");
  return async function preview(source, { nonce } = {}) {
    if (!import_buffer.Buffer.isBuffer(source) || source.length < 128 || source.length > 8 * 1024 * 1024 || nonce !== void 0 && (!import_buffer.Buffer.isBuffer(nonce) || nonce.length !== 16)) fail12("CRIMSON_MAP_INPUT_INVALID");
    const sourceHash = hash(source), decoded = await decodeSave(source), before = metadata(decoded.plaintext);
    if (decoded.version !== 2 || !schemaPins.includes(before.schemaSha256) || before.audit.advisoryLocators !== 0 || before.audit.unconsumedBytes !== 0) fail12("CRIMSON_MAP_SCHEMA_UNSUPPORTED");
    const fog = locateFog(decoded.plaintext, before.schema), original = decoded.plaintext.subarray(fog.code.start, fog.code.end);
    if (!(await encodeSave(decoded.plaintext, decoded.header, { nonce: decoded.header.subarray(26, 42) })).equals(source)) fail12("CRIMSON_MAP_NATIVE_PARITY_FAILED");
    let alreadyRevealed = 0;
    for (const byte of original) if (byte === 255) alreadyRevealed++;
    const changed = fog.code.count - alreadyRevealed, raw = import_buffer.Buffer.from(decoded.plaintext);
    if (changed) raw.fill(255, fog.code.start, fog.code.end);
    if (!raw.subarray(0, fog.code.start).equals(decoded.plaintext.subarray(0, fog.code.start)) || !raw.subarray(fog.code.end).equals(decoded.plaintext.subarray(fog.code.end))) fail12("CRIMSON_MAP_UNRELATED_BYTES_CHANGED");
    const after = metadata(raw, { compareTo: decoded.plaintext }), typed = after.decodedDiff;
    if (after.schemaSha256 !== before.schemaSha256 || after.audit.advisoryLocators !== 0 || after.audit.unconsumedBytes !== 0 || after.audit.nonzeroListMetadata !== before.audit.nonzeroListMetadata || typed.length !== (changed ? 1 : 0) || typed.some((d) => d.path !== fog.path || d.objectType !== "SimpleRunLengthEncodingSaveData" || d.field !== "_codeList" || d.offset !== fog.code.tagOffset || d.bytes !== fog.code.count + 5)) fail12("CRIMSON_MAP_INTENDED_DIFF_FAILED");
    for (const name of ["_jumpingTable", "_lengthList"]) {
      const a = fog.arrays[name];
      if (!raw.subarray(a.start, a.end).equals(decoded.plaintext.subarray(a.start, a.end))) fail12("CRIMSON_MAP_RLE_METADATA_CHANGED");
    }
    const encoded = changed ? await encodeSave(raw, decoded.header, nonce === void 0 ? {} : { nonce }) : import_buffer.Buffer.from(source), reopened = await decodeSave(encoded);
    if (!reopened.plaintext.equals(raw) || !encoded.subarray(0, 18).equals(source.subarray(0, 18)) || !encoded.subarray(74, 128).equals(source.subarray(74, 128)) || hash(source) !== sourceHash) fail12("CRIMSON_MAP_REOPEN_FAILED");
    if (!(await encodeSave(reopened.plaintext, reopened.header, { nonce: reopened.header.subarray(26, 42) })).equals(encoded)) fail12("CRIMSON_MAP_NATIVE_PARITY_FAILED");
    const result = { encoded, report: { schema: MAP_REVEAL_REVISION, revision: mapRevealProfile.revision, status: changed ? "preview_ready" : "already_revealed", scope: mapRevealProfile.scope, sourceSha256: sourceHash, beforePlaintextSha256: hash(decoded.plaintext), afterPlaintextSha256: hash(raw), schemaSha256: before.schemaSha256, outputSha256: hash(encoded), encodedBytes: encoded.length, coverage: { encodedFogSegments: fog.code.count, fullyRevealedSegmentsBefore: alreadyRevealed, segmentsToReveal: changed, fullyRevealedSegmentsAfter: fog.code.count }, decodedDiff: changed ? [{ operation: "fog.revealMap", path: fog.path, objectType: "SimpleRunLengthEncodingSaveData", field: "_codeList", bytes: fog.code.count, changedBytes: changed, beforeSha256: hash(original), afterSha256: hash(raw.subarray(fog.code.start, fog.code.end)), fillValue: 255 }] : [], source: mapRevealProfile.source, validation: { nativeNoOpByteParity: true, fullTypedReparse: true, intendedFogArrayOnly: true, bytesOutsideFogRangeUnchanged: true, rleJumpingAndLengthsUnchanged: true, knowledgeUnchanged: true, discoveriesUnchanged: true, treasureStateUnchanged: true, questsUnchanged: true, inventoryCompanionsUnchanged: true, unknownHeaderBytesPreserved: true, hmacReverified: true, encodedOutputReopened: true, nonzeroListMetadataBefore: before.audit.nonzeroListMetadata, nonzeroListMetadataAfter: after.audit.nonzeroListMetadata }, sourceSaveUnchanged: true, canSend: false, cloudRequests: 0, publicationEnabled: false, gameAcceptance: "unverified_map_recipe", nexusUnlock: false, treasureReveal: false, modifiedDataStored: false } };
    mapOutputWitnesses.set(result, Object.freeze({ kind: "native-map-byte-proof", sourceSha256: sourceHash, outputSha256: result.report.outputSha256, plaintextSha256: result.report.afterPlaintextSha256, schemaSha256: before.schemaSha256, audit: Object.freeze({ advisoryLocators: after.audit.advisoryLocators, unconsumedBytes: after.audit.unconsumedBytes, nonzeroListMetadata: after.audit.nonzeroListMetadata }), reportSha256: hash(JSON.stringify(result.report)) }));
    return result;
  };
}
var mapOutputWitnesses, fogFields, rleFields, MAP_REVEAL_REVISION, mapRevealProfile, fail12, previewMapReveal;
var init_crimson_map_reveal = __esm({
  "src/crimson-map-reveal.mjs"() {
    init_buffer();
    init_crimson_codec();
    init_crimson_document();
    init_source_binding();
    mapOutputWitnesses = /* @__PURE__ */ new WeakMap();
    fogFields = [{ name: "_fogRLESaveData", type: "ReflectObject", kind: 4, size: 8, aux: 8 }];
    rleFields = [{ name: "_jumpingTable", type: "uint32", kind: 3, size: 4, aux: 4096 }, { name: "_codeList", type: "uint8", kind: 3, size: 1, aux: 4096 }, { name: "_lengthList", type: "uint8", kind: 3, size: 1, aux: 4096 }];
    MAP_REVEAL_REVISION = "saveglass.map-reveal-preview.v1";
    mapRevealProfile = Object.freeze({
      revision: "crimson-map-fog-ff.v1",
      schemaSha256: "8427f58057ea9bf6dac35bc139cba163ddb135cfe89d748a2d36b94eec88d668",
      types: { FogSaveData: { fields: fogFields, sha256: hash(JSON.stringify(fogFields)) }, SimpleRunLengthEncodingSaveData: { fields: rleFields, sha256: hash(JSON.stringify(rleFields)) } },
      source: { repository: "NattKh/CRIMSON-DESERT-SAVE-EDITOR-AND-GAME-MODS", commit: "96e7f78fcb00d6cb5615171a7f359f0c2de5b114", file: "CrimsonSaveEditor/gui.py", methods: ["_debug_reveal_map", "_set_fog"], attribution: "NattKh", permission: "owner_supplied_permission" },
      scope: "fog_rle_code_array_only",
      fillValue: 255,
      maximumCodeCount: 1e5
    });
    fail12 = (code) => {
      throw new CodecError("The map-reveal preview stopped at its compatibility check.", code);
    };
    previewMapReveal = createMapRevealPreview();
  }
});

// src/mixed-draft.mjs
var mixed_draft_exports = {};
__export(mixed_draft_exports, {
  MIXED_PLAN_SCHEMA: () => MIXED_PLAN_SCHEMA,
  MIXED_PUBLICATION_PROFILE: () => MIXED_PUBLICATION_PROFILE,
  assertMixedPlan: () => assertMixedPlan,
  compileMixedDraft: () => compileMixedDraft,
  createMixedDraftCompiler: () => createMixedDraftCompiler,
  createMixedWorkbenchDraft: () => createMixedWorkbenchDraft,
  mixedPlanDigest: () => mixedPlanDigest
});
function assertMixedPlan(input, { schemaPins = [CRIMSON_CURRENT_SCHEMA] } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== common2.length || !common2.every((k) => Object.hasOwn(input, k)) || input.schema !== MIXED_PLAN_SCHEMA || input.payload !== "save" || !/^slot\d{1,3},savedgame$/.test(input.container || "") || !common2.filter((k) => k.endsWith("Sha256") || k === "backupRevision").every((k) => typeof input[k] === "string" && /^[a-f0-9]{64}$/.test(input[k])) || input.decoderRevision !== DECODER_REVISION || input.catalogRevision !== CATALOG_REVISION || !Array.isArray(input.operations) || !input.operations.length || input.operations.length > MAX_STRUCTURAL_OPERATIONS) fail13("MIXED_PLAN_INVALID", "Choose up to sixteen supported changes for one save.", 400);
  if (!schemaPins.includes(input.schemaSha256)) fail13("MIXED_SCHEMA_UNSUPPORTED", "This save layout cannot combine these changes yet.");
  const recipes = input.operations.filter((op) => cartography.includes(op?.operation)), other = input.operations.filter((op) => !cartography.includes(op?.operation));
  if (!recipes.length || recipes.some((op) => Object.keys(op).length !== 1) || new Set(recipes.map((op) => op.operation)).size !== recipes.length) fail13("MIXED_RECIPE_INVALID", "Choose each supported Cartography change once.", 400);
  if (other.length) assertStructuralPlan({ ...input, schema: STRUCTURAL_PLAN_SCHEMA, operations: other }, { allowScalarOnly: true, schemaPins });
  return input;
}
function metadata2(raw) {
  const d = readDocument(raw, { captureTypes: [], listLimit: 0 });
  return { schemaSha256: d.schemaSha256, plaintextSha256: d.plaintextSha256, audit: d.audit };
}
function checkMap(report) {
  const v = report.validation;
  return report.schema === "saveglass.map-reveal-preview.v1" && v.bytesOutsideFogRangeUnchanged === true && v.knowledgeUnchanged === true && v.discoveriesUnchanged === true && v.rleJumpingAndLengthsUnchanged === true && report.nexusUnlock === false && report.treasureReveal === false && report.decodedDiff.every((d) => d.operation === "fog.revealMap") && report.decodedDiff.length <= 1;
}
function checkNexus(report) {
  const v = report.validation;
  return report.schema === "saveglass.abyss-nexus-preview.v1" && v.intendedNexusOnly === true && v.unrelatedDiscoveriesPreserved === true && v.fogBytesUnchanged === true && v.unrelatedKnowledgePreserved === true && v.originalOpaqueBytesPreserved === true && report.mapFogReveal === false && report.questProgressChanged === false && report.inventoryChanged === false && report.decodedDiff.every((d) => ["knowledge.add", "knowledge.setLevel", "nexus.discovery.add"].includes(d.operation));
}
function createMixedDraftCompiler({ schemaPins = [CRIMSON_CURRENT_SCHEMA], structuralCompiler = createStructuralWorkbenchDraft, scalarCompiler = createWorkbenchDraft, nexusCompiler = previewAbyssNexus, mapCompiler = previewMapReveal } = {}) {
  if (!Array.isArray(schemaPins) || !schemaPins.length || schemaPins.length > 3 || schemaPins.some((s) => !/^[a-f0-9]{64}$/.test(s)) || [structuralCompiler, scalarCompiler, nexusCompiler, mapCompiler].some((fn) => typeof fn !== "function")) throw Error("Invalid internal mixed compiler configuration.");
  return async function compile(backup, ownedMetadata, suppliedInput, { nonce, retainEncoded = false } = {}) {
    assertMixedPlan(suppliedInput, { schemaPins });
    const input = structuredClone(suppliedInput), requestedPlanSha256 = mixedPlanDigest(input);
    if (nonce !== void 0 && (!import_buffer.Buffer.isBuffer(nonce) || nonce.length !== 16) || typeof retainEncoded !== "boolean") fail13("MIXED_OPTIONS_INVALID");
    const { bytes: source, prepared } = structuralSourcePayload(backup, ownedMetadata, input), decoded = prepared?.decoded || await decodeSave(source), before = prepared?.document || metadata2(decoded.plaintext);
    if (decoded.version !== 2 || before.schemaSha256 !== input.schemaSha256 || before.plaintextSha256 !== input.plaintextSha256 || before.audit.advisoryLocators || before.audit.unconsumedBytes) fail13("MIXED_SOURCE_CHANGED");
    const nonCart = input.operations.filter((op) => !cartography.includes(op.operation)), structural = nonCart.some((op) => ["inventory.addItem", "companions.add"].includes(op.operation));
    const nativeChild = nonCart.length && (structural ? structuralCompiler === createStructuralWorkbenchDraft : scalarCompiler === createWorkbenchDraft);
    if (!nativeChild && !await preparedSourceNativeParity(backup, ownedMetadata, input, decoded, source, encodeSave)) fail13("MIXED_NATIVE_PARITY_FAILED");
    let working = source, plainHash = before.plaintextSha256, finalMap;
    const stages = [], diff = [];
    async function accept(domain, result, { operations = false, structural: structural2 = false, expectedPlanSha256, expectedBindings } = {}) {
      const { encoded, report: report2 } = result || {}, v = report2?.validation;
      if (!import_buffer.Buffer.isBuffer(encoded) || encoded.length < 128 || encoded.length > 8 * 1024 * 1024 || !report2 || !v || !Array.isArray(report2.decodedDiff)) fail13("MIXED_STAGE_CHAIN_INVALID");
      const reopened2 = await decodeSave(encoded), sourceSha256 = hash(working), outputSha256 = hash(encoded);
      if (report2.schemaSha256 !== input.schemaSha256 || report2.beforePlaintextSha256 !== plainHash || (operations ? report2.payloadSha256 : report2.sourceSha256) !== sourceSha256 || (report2.encodedSha256 || report2.outputSha256) !== outputSha256 || report2.afterPlaintextSha256 !== hash(reopened2.plaintext) || v.hmacReverified !== true || v.encodedOutputReopened !== true || v.unknownHeaderBytesPreserved !== true) fail13("MIXED_STAGE_CHAIN_INVALID");
      if (operations) {
        if (report2.planSha256 !== expectedPlanSha256 || Object.entries(expectedBindings).some(([key, value2]) => report2[key] !== value2) || report2.schema !== (structural2 ? "saveglass.structural-draft-preview.v1" : "saveglass.crimson-draft-preview.v1")) fail13("MIXED_STAGE_INTENT_INVALID");
        if (report2.originalBackupUnchanged !== true || v.allOtherDecodedValuesUnchanged !== true || v.originalNoOpByteParity !== true || structural2 && v.stagewiseReverseStructuralByteParity !== true || !structural2 && v.allOtherPlaintextBytesUnchanged !== true) fail13("MIXED_STAGE_SCOPE_INVALID");
      } else if (report2.sourceSaveUnchanged !== true || report2.cloudRequests !== 0 || report2.canSend !== false || v.nativeNoOpByteParity !== true || (domain === "unlock-nexus" ? !checkNexus(report2) : !checkMap(report2))) fail13("MIXED_STAGE_SCOPE_INVALID");
      finalMap = domain === "reveal-map" ? { result, source: working } : null;
      stages.push({ domain, compilerRevision: report2.revision || report2.compilerRevision || report2.schema, sourceSha256, beforePlaintextSha256: plainHash, outputSha256, afterPlaintextSha256: report2.afterPlaintextSha256, decodedDiffRecords: report2.decodedDiff.length, decodedDiffSha256: hash(JSON.stringify(canonical3(report2.decodedDiff))), validation: v, runtimeRequirements: report2.runtimeRequirements || [] });
      diff.push(...report2.decodedDiff);
      working = encoded;
      plainHash = report2.afterPlaintextSha256;
    }
    try {
      if (nonCart.length) {
        const structural2 = nonCart.some((op) => ["inventory.addItem", "companions.add"].includes(op.operation)), plan = structuredClone({ ...input, schema: structural2 ? STRUCTURAL_PLAN_SCHEMA : "saveglass.crimson-draft-plan.v1", operations: nonCart }), expectedPlanSha256 = mixedPlanDigest(plan), expectedBindings = { backupId: ownedMetadata.id, ...Object.fromEntries(["backupSha256", "backupRevision", "container", "payload", "payloadSha256", "schemaSha256", "decoderRevision", "catalogRevision"].map((key) => [key, input[key]])) };
        await accept("save-edits", await (structural2 ? structuralCompiler : scalarCompiler)(backup, ownedMetadata, plan, { nonce }), { operations: true, structural: structural2, expectedPlanSha256, expectedBindings });
      }
      for (const operation of cartography) if (input.operations.some((op) => op.operation === operation)) {
        const nexus2 = operation === "cartography.unlock-nexus";
        await accept(nexus2 ? "unlock-nexus" : "reveal-map", await (nexus2 ? nexusCompiler : mapCompiler)(working, nonce === void 0 ? {} : { nonce }));
      }
    } catch (error) {
      if (error instanceof CodecError) throw new ProbeError(error.message, 409, error.code);
      throw error;
    }
    if (mixedPlanDigest(input) !== requestedPlanSha256 || mixedPlanDigest(suppliedInput) !== requestedPlanSha256) fail13("MIXED_INTENT_CHANGED");
    if (!diff.length) fail13("MIXED_ALREADY_SATISFIED", "These changes are already present in the selected save.");
    const reopened = await decodeSave(working), proof = finalMap && mapOutputWitness(finalMap.result, finalMap.source), encodedSha256 = hash(working);
    const after = proof ? { schemaSha256: proof.schemaSha256, plaintextSha256: hash(reopened.plaintext), audit: proof.audit } : metadata2(reopened.plaintext);
    if (proof && (after.plaintextSha256 !== proof.plaintextSha256 || encodedSha256 !== proof.outputSha256) || after.schemaSha256 !== before.schemaSha256 || after.plaintextSha256 !== plainHash || after.audit.advisoryLocators || after.audit.unconsumedBytes || after.audit.nonzeroListMetadata !== before.audit.nonzeroListMetadata || !working.subarray(0, 18).equals(source.subarray(0, 18)) || !working.subarray(74, 128).equals(source.subarray(74, 128)) || hash(source) !== input.payloadSha256 || !proof && !(await encodeSave(reopened.plaintext, reopened.header, { nonce: reopened.header.subarray(26, 42) })).equals(working)) fail13("MIXED_REOPEN_FAILED");
    const fullDigest = hash(JSON.stringify(canonical3(diff))), summary2 = () => [...new Set(diff.map((d) => d.operation))].sort().map((operation) => {
      const rows2 = diff.filter((d) => d.operation === operation);
      return { operation, records: rows2.length, recordsSha256: hash(JSON.stringify(canonical3(rows2))) };
    });
    const report = { schema: "saveglass.mixed-draft-preview.v1", revision: "saverift.mixed-stage-union.2026-11-01.v1", source: "plugin_bundle", backupId: ownedMetadata.id, backupSha256: ownedMetadata.sha256, backupRevision: backup.revision, container: input.container, payload: "save", payloadSha256: input.payloadSha256, schemaSha256: before.schemaSha256, decoderRevision: DECODER_REVISION, catalogRevision: CATALOG_REVISION, beforePlaintextSha256: before.plaintextSha256, afterPlaintextSha256: after.plaintextSha256, encodedSha256, encodedBytes: working.length, planSha256: requestedPlanSha256, operations: input.operations, decodedDiff: retainEncoded ? summary2() : diff, fullDecodedDiffSha256: fullDigest, fullDecodedDiffRecords: diff.length, decodedDiffDetail: retainEncoded ? "digest_bound_stage_union" : "full_stage_union", stages, runtimeRequirements: stages.flatMap((s) => s.runtimeRequirements), validation: { allOtherDecodedValuesUnchanged: true, stagewiseIntendedOnlyUnion: true, stageEncodedAndPlaintextChainVerified: true, originalNoOpByteParity: true, nativeLz4NoOpByteParity: true, hmacReverified: true, encodedOutputReopened: true, unknownHeaderBytesPreserved: true, nonzeroListMetadataPreserved: true, nonzeroListMetadataBefore: before.audit.nonzeroListMetadata, nonzeroListMetadataAfter: after.audit.nonzeroListMetadata, originalBackupUnchanged: true, finalTypedDocumentReparsed: true, finalValidation: proof ? "native-map-byte-proof" : "fresh-final-document" }, pairedLobbyUnchanged: true, originalBackupUnchanged: true, modifiedSaveStored: false, cloudRequests: 0, draftOnly: true, writesEnabled: false, publishEligible: false };
    return retainEncoded ? { report, encoded: working } : report;
  };
}
var MIXED_PLAN_SCHEMA, MIXED_PUBLICATION_PROFILE, common2, cartography, canonical3, mixedPlanDigest, fail13, compileMixedDraft, createMixedWorkbenchDraft;
var init_mixed_draft = __esm({
  "src/mixed-draft.mjs"() {
    init_buffer();
    init_source_binding();
    init_crimson_codec();
    init_crimson_document();
    init_crimson_domain();
    init_crimson_draft();
    init_structural_draft();
    init_structural_publication_profile();
    init_crimson_abyss_nexus();
    init_crimson_map_reveal();
    init_source_binding();
    MIXED_PLAN_SCHEMA = "saveglass.mixed-draft-plan.v1";
    MIXED_PUBLICATION_PROFILE = "saveglass-crimson-mixed107.v1";
    common2 = ["schema", "container", "payload", "backupSha256", "backupRevision", "payloadSha256", "plaintextSha256", "schemaSha256", "decoderRevision", "catalogRevision", "operations"];
    cartography = ["cartography.unlock-nexus", "cartography.reveal-map"];
    canonical3 = (v) => Array.isArray(v) ? v.map(canonical3) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical3(v[k])])) : v;
    mixedPlanDigest = (input) => hash(JSON.stringify(canonical3(input)));
    fail13 = (code, message = "The combined changes could not be validated together. Your original save is unchanged.", status = 409) => {
      throw new ProbeError(message, status, code);
    };
    compileMixedDraft = createMixedDraftCompiler();
    createMixedWorkbenchDraft = (backup, metadata3, input, { nonce } = {}) => compileMixedDraft(backup, metadata3, input, { nonce, retainEncoded: true });
  }
});

// src/inventory-placement.mjs
function getInventoryPlacement(item) {
  const key = item?.definitionKey ?? item?.key, profile3 = catalogItemAdditionDefinition(key);
  return profile3 ? Object.freeze({ definitionKey: key, internalName: item?.internalName ?? null, defaultInventory: profile3.defaultInventory, referenceMaxStack: profile3.maxStack, source: "pinned_catalog_native_defaults", sourceSha256: catalogItemAdditionProfile.entriesSha256, currentGameAcceptance: "source_backed_constructor", runtimeRequirement: profile3.runtimeRequirement }) : null;
}
function otherInventorySpace(domains, inventoryKey, additionalSlots) {
  const bags = domains?.inventory?.bags?.filter((b) => b.inventoryKey === inventoryKey), records2 = domains?.inventory?.records?.filter((r) => r.inventoryKey === inventoryKey), bag2 = bags?.[0];
  const fixed = { inventoryKey, additionalSlots, automaticExpansionRequired: false, existingItemsPreserved: true, allocation: "first_free_uint16_slots", capacitySource: "native_slot_address_space_not_physical_bag_capacity" };
  if (bags?.length !== 1 || !Array.isArray(records2) || bag2.itemListPresent !== true || bag2.truncated !== false || bag2.itemRecordCount !== records2.length) return { ...fixed, canFit: false, reason: "DESTINATION_INVENTORY_MISSING", warning: `This save does not contain a complete destination inventory ${inventoryKey}. No new inventory group will be created.` };
  const slots = records2.map((r) => r.slot), ids2 = records2.map((r) => r.instanceId);
  if (slots.some((n) => !Number.isSafeInteger(n) || n < 0 || n > 65535) || new Set(slots).size !== slots.length || ids2.some((id2) => !positive(id2)) || new Set(ids2).size !== ids2.length) return { ...fixed, canFit: false, reason: "DESTINATION_INVENTORY_AMBIGUOUS", warning: `Destination inventory ${inventoryKey} has ambiguous slots or identities.` };
  const canFit = records2.length + additionalSlots <= 65536;
  return { ...fixed, canFit, occupiedSlots: records2.length, reason: canFit ? null : "DESTINATION_SLOT_LIMIT", warning: canFit ? null : `Destination inventory ${inventoryKey} has no unused native slots.` };
}
function planItemAdditionsSpace(domains, additions, drafts = []) {
  const unmapped = [], grouped = /* @__PURE__ */ new Map();
  let additionalSlots = 0;
  for (const entry of additions) {
    const placement = getInventoryPlacement(entry), quantity = String(entry.quantity ?? entry.targetQuantity ?? "");
    if (!placement || !positive(quantity) || !positive(placement.referenceMaxStack)) {
      unmapped.push(entry.displayName || String(entry.definitionKey));
      continue;
    }
    const slots = Number((BigInt(quantity) + BigInt(placement.referenceMaxStack) - 1n) / BigInt(placement.referenceMaxStack));
    if (!Number.isSafeInteger(slots) || slots > MAX_STRUCTURAL_NEW_ITEM_STACKS) {
      unmapped.push(entry.displayName || String(entry.definitionKey));
      continue;
    }
    additionalSlots += slots;
    grouped.set(placement.defaultInventory, (grouped.get(placement.defaultInventory) || 0) + slots);
  }
  const size = drafts.find((d) => d.operation === "inventory.setExpansionValue" && d.schema === "saveglass.crimson-staged-operation.v1"), inventory = domains?.inventory;
  const plannedInventory = Array.isArray(inventory?.bags) ? { ...inventory, bags: inventory.bags.map((b) => b.inventoryKey === 2 && size && /^\d+$/.test(size.desiredValue) && Number(size.desiredValue) >= b.expansionSlots && Number(size.desiredValue) <= 200 ? { ...b, expansionSlots: Number(size.desiredValue) } : b) } : null;
  const main = planInventoryCapacity({ inventory: plannedInventory }, { additionalSlots: grouped.get(2) || 0 });
  const perInventory = [...grouped].map(([key, slots]) => key === 2 ? { ...main, additionalSlots: slots } : otherInventorySpace(domains, key, slots));
  const failed = perInventory.find((p) => !p.canFit), batchOver = additionalSlots > MAX_STRUCTURAL_NEW_ITEM_STACKS;
  const canFit = unmapped.length === 0 && !failed && !batchOver && (additions.length > 0 || main.canFit);
  return {
    ...main,
    inventoryKey: grouped.size === 1 ? [...grouped.keys()][0] : 2,
    additionalSlots,
    newItemDefinitions: additions.length,
    perInventory,
    placementComplete: unmapped.length === 0,
    unmappedContents: unmapped,
    state: canFit ? "planned" : "unavailable",
    canFit,
    automaticExpansionRequired: Boolean(grouped.has(2) && main.automaticExpansionRequired),
    reason: unmapped.length ? "PLACEMENT_UNMAPPED" : batchOver ? "CONSTRUCTOR_BATCH_LIMIT" : failed?.reason ?? (additions.length ? null : main.reason),
    warning: unmapped.length ? `Placement or quantity metadata is missing for ${unmapped.length} ${unmapped.length === 1 ? "item" : "items"}. No destination is chosen automatically.` : batchOver ? `A transfer can add at most ${MAX_STRUCTURAL_NEW_ITEM_STACKS} new item stacks.` : failed?.warning ?? (additions.length ? null : main.warning),
    structuralDeliveryEnabled: true
  };
}
function planPackInventorySpace(recipe, entries, domains, drafts = [], { deliveryOnly = false } = {}) {
  const additions = deliveryOnly ? drafts.filter((d) => d.schema === "saveglass.item-addition-intent.v1" && d.operation === "inventory.addItem") : entries.filter((e) => e.reasonCode === "STRUCTURAL_ADDITION_REQUIRED").map((e) => recipe.contents.find((c) => c.definitionKey === e.definitionKey && c.internalName === e.internalName)).filter(Boolean);
  return { ...planItemAdditionsSpace(domains, additions, drafts), structuralDeliveryEnabled: deliveryOnly };
}
var positive;
var init_inventory_placement = __esm({
  "src/inventory-placement.mjs"() {
    init_catalog_item_profile();
    init_inventory_capacity();
    init_structural_publication_profile();
    positive = (value2) => typeof value2 === "string" && /^[1-9]\d{0,19}$/.test(value2) && BigInt(value2) <= 0xffffffffffffffffn;
  }
});

// src/catalog/crimson-packs.mjs
var crimson_packs_exports = {};
__export(crimson_packs_exports, {
  PACK_REVISION: () => PACK_REVISION,
  PackError: () => PackError,
  getPackCatalog: () => getPackCatalog,
  getPackRecipe: () => getPackRecipe,
  previewPack: () => previewPack,
  stagePack: () => stagePack
});
function freeze(v) {
  if (v && typeof v === "object") {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v;
}
function additionDefinition(key) {
  const profile3 = catalogItemAdditionDefinition(key), item = itemDefinitions.get(key);
  return profile3 && item ? { definitionKey: key, displayName: item.name, internalName: item.internalName, referenceMaxStack: profile3.maxStack, inventoryKey: profile3.defaultInventory, runtimeRequirement: profile3.runtimeRequirement, uniqueBalance: profile3.uniqueBalance } : null;
}
function additionOperation(definition, quantity) {
  return { schema: "saveglass.item-addition-intent.v1", operation: "inventory.addItem", ...definition, quantity: String(quantity), status: "awaiting_combined_validation", publishEligible: false };
}
function additionQuantitySupported(definition, quantity) {
  return typeof quantity === "string" && /^[1-9]\d{0,8}$/.test(quantity) && decimal3(definition.referenceMaxStack) && BigInt(definition.referenceMaxStack) > 0n && (!definition.uniqueBalance || BigInt(quantity) <= BigInt(definition.referenceMaxStack)) && (BigInt(quantity) + BigInt(definition.referenceMaxStack) - 1n) / BigInt(definition.referenceMaxStack) <= BigInt(MAX_STRUCTURAL_NEW_ITEM_STACKS);
}
function getPackCatalog() {
  return catalog2;
}
function getPackRecipe(id2) {
  return byId.get(id2) || null;
}
function stage(operation, record, desired) {
  const capacity = operation === "inventory.setExpansionValue";
  return { schema: "saveglass.crimson-staged-operation.v1", operation, displayName: capacity ? "Bag size" : record.displayName, inventoryKey: record.inventoryKey, expectedValue: String(capacity ? record.expansionSlots : record.quantity), desiredValue: String(desired), ...capacity ? {} : { definitionKey: record.definitionKey, instanceId: record.instanceId, slot: record.slot }, status: "awaiting_combined_validation", publishEligible: false };
}
function basicRecord(r, domains) {
  if (!validInventoryKey(r.inventoryKey) || r.catalogMatched !== true || r.quantityPresent !== true || r.quantityBytes !== 8 || !decimal3(r.quantity) || !decimal3(r.instanceId) || r.instanceId === "0" || !Number.isSafeInteger(r.slot) || r.slot < 0 || r.slot > 65535 || !existingStackQuantityProfile(r.definitionKey, r.referenceMaxStack)) return false;
  const bags = domains.inventory.bags.filter((b) => b.inventoryKey === r.inventoryKey), records2 = domains.inventory.records.filter((item) => item.inventoryKey === r.inventoryKey), slots = records2.map((item) => item.slot);
  return bags.length === 1 && bags[0].itemListPresent === true && bags[0].truncated === false && bags[0].itemRecordCount === records2.length && slots.every((slot) => Number.isSafeInteger(slot) && slot >= 0 && slot <= 65535) && new Set(slots).size === slots.length;
}
function sourceCheck(domains) {
  if (!domains || domains.schema !== "saveglass.crimson-domains.v1" || domains.catalog?.revisionId !== catalog2.catalogRevision || domains.saveVersion !== 2 || !catalog2.compatibleSchemaSha256.includes(domains.schemaSha256) || domains.structuralValidation !== "full_strict_traversal" || domains.audit?.unconsumedBytes !== 0 || domains.catalog?.coverage?.completeInventory !== true || !Array.isArray(domains.inventory?.records) || !Array.isArray(domains.inventory?.bags)) return "This save needs a supported, complete inspection before a pack can be staged.";
  if (domains.inventory.records.length > 1e4 || domains.inventory.bags.length > 128) return "This inventory exceeds the bounded pack preview.";
  const list = domains.inventory.records, ids2 = list.map((r) => r.instanceId).filter((id2) => id2 !== null && id2 !== void 0);
  if (ids2.some((id2) => !decimal3(id2) || id2 === "0") || new Set(ids2).size !== ids2.length) return "The save has ambiguous item identities. No pack will be applied.";
  const bags = domains.inventory.bags.filter((b) => b.inventoryKey === 2), owned = list.filter((r) => r.inventoryKey === 2), slots = owned.map((r) => r.slot);
  if (bags.length !== 1 || bags[0].truncated || bags[0].itemListPresent !== true || bags[0].itemRecordCount !== owned.length || slots.some((n) => !Number.isSafeInteger(n) || n < 0 || n > 65535) || new Set(slots).size !== slots.length) return "The editable inventory is incomplete or its occupied slots are ambiguous.";
  return null;
}
function normalizeDrafts(domains, drafts) {
  if (!Array.isArray(drafts) || drafts.length > MAX4) failure("PACK_DRAFT_CONFLICT", `Keep the combined draft within ${MAX4} changes.`);
  const out = [], targets = /* @__PURE__ */ new Set(), companionGroups = /* @__PURE__ */ new Set(), records2 = domains.inventory.records;
  for (const d of drafts) {
    if (d?.schema === "saveglass.cartography-staged.v1") {
      const names = { "reveal-map": "Reveal Map", "unlock-nexus": "Nexus Unlock" };
      if (!structuralSchemaSupported(domains.schemaSha256, domains.saveVersion) || !Object.hasOwn(names, d.recipe) || d.operation !== "cartography." + d.recipe || targets.has(d.operation)) failure("PACK_DRAFT_CONFLICT", "Choose each supported Cartography change once for this save.");
      targets.add(d.operation);
      out.push({ schema: d.schema, operation: d.operation, recipe: d.recipe, displayName: names[d.recipe], status: "awaiting_bound_validation", publishEligible: false });
      continue;
    }
    if (d?.schema === "saveglass.item-addition-intent.v1" && d.operation === "inventory.addItem") {
      const definition = additionDefinition(d.definitionKey), family = additionFamily(d.definitionKey, domains);
      if (definition?.uniqueBalance && ownsDefinition(domains, d.definitionKey)) failure("PACK_DRAFT_CONFLICT", "Use Copper in Quick changes to change your existing balance.");
      if (!definition || !family || !additionQuantitySupported(definition, d.quantity)) failure("PACK_DRAFT_CONFLICT", "An item addition is missing native constructor metadata or exceeds its stack limit.");
      const normalized2 = additionOperation(definition, d.quantity), target2 = keyOf(normalized2);
      if (targets.has(target2)) failure("PACK_DRAFT_CONFLICT", "Two draft entries target the same addition.");
      targets.add(target2);
      out.push(normalized2);
      continue;
    }
    if (d?.schema === "saveglass.companion-addition-intent.v1" && d.operation === "companions.add") {
      const definition = companionAdditionDefinition(d.characterKey), group = definition?.ownershipGroup, groupOf = (key) => companionAdditionDefinition(key)?.ownershipGroup || `character:${key}`;
      if (!structuralSchemaSupported(domains.schemaSha256, domains.saveVersion) || !companionAdditionSupported(d.characterKey, domains.schemaSha256) || d.quantity !== "1" || !Array.isArray(domains.companions) || domains.companions.some((c) => groupOf(c.characterKey) === group) || companionGroups.has(group)) failure("PACK_DRAFT_CONFLICT", "This companion is already owned or queued, or its clean save record is unavailable.");
      const normalized2 = { schema: "saveglass.companion-addition-intent.v1", operation: "companions.add", characterKey: d.characterKey, displayName: definition.name, classification: definition.category === "pets" ? "pet" : definition.category === "camp" ? "camp" : "mount", quantity: "1", status: "awaiting_combined_validation", publishEligible: false }, target2 = keyOf(normalized2);
      if (targets.has(target2)) failure("PACK_DRAFT_CONFLICT", "Two draft entries target the same companion.");
      targets.add(target2);
      companionGroups.add(group);
      out.push(normalized2);
      continue;
    }
    if (!d || d.schema !== "saveglass.crimson-staged-operation.v1" || !validInventoryKey(d.inventoryKey) || d.operation !== "inventory.setQuantity" && d.inventoryKey !== 2 || !decimal3(d.expectedValue) || !decimal3(d.desiredValue) || d.expectedValue === d.desiredValue) failure("PACK_DRAFT_CONFLICT", "Remove changes whose inventory identity or original value cannot be validated before applying a pack.");
    let record, desired = BigInt(d.desiredValue), normalized;
    if (d.operation === "inventory.setExpansionValue") {
      const bags = domains.inventory.bags.filter((b) => b.inventoryKey === 2);
      record = bags[0];
      if (bags.length !== 1 || !Number.isSafeInteger(record.expansionSlots) || String(record.expansionSlots) !== d.expectedValue || desired <= BigInt(d.expectedValue) || desired > 200n) failure("PACK_DRAFT_CONFLICT", "The staged bag size no longer matches this save.");
      normalized = stage(d.operation, record, d.desiredValue);
    } else {
      const matches2 = records2.filter((r) => r.inventoryKey === d.inventoryKey && r.definitionKey === d.definitionKey && r.instanceId === d.instanceId && r.slot === d.slot);
      record = matches2[0];
      if (matches2.length !== 1 || !basicRecord(record, domains) || record.quantity !== d.expectedValue || !["inventory.setQuantity", "inventory.setCopper"].includes(d.operation) || d.operation === "inventory.setCopper" !== existingStackQuantityProfile(record.definitionKey, record.referenceMaxStack)?.uniqueBalance || desired < 1n || desired > BigInt(existingStackQuantityProfile(record.definitionKey, record.referenceMaxStack).maximum)) failure("PACK_DRAFT_CONFLICT", "An existing staged item no longer matches its exact source record or native stack limit.");
      normalized = stage(d.operation, record, d.desiredValue);
    }
    const target = keyOf(normalized);
    if (targets.has(target)) failure("PACK_DRAFT_CONFLICT", "Two draft entries target the same field.");
    targets.add(target);
    out.push(normalized);
  }
  return out;
}
function unavailable2(row, reasonCode, reason) {
  return { ...row, status: "unavailable", reasonCode, reason, operation: null };
}
function conflicting(row, reasonCode, reason) {
  return { ...row, status: "conflict", reasonCode, reason, operation: null };
}
function resolveAddition(row, content, domains, pending) {
  if (!structuralSchemaSupported(domains.schemaSha256, domains.saveVersion)) return unavailable2({ ...row, current: "0", effective: "0", after: "0" }, "ADDITION_SCHEMA_UNSUPPORTED", "New item additions are not supported for this save layout yet. Owned stack upgrades can still be reviewed.");
  const family = additionFamily(content.definitionKey, domains), definition = additionDefinition(content.definitionKey), target = content.targetQuantity;
  if (!family || !definition) return unavailable2({ ...row, current: "0", effective: "0", after: "0" }, "CONSTRUCTOR_METADATA_MISSING", catalogItemAdditionUnavailableReason(content.definitionKey) === "embedded_subitem_defaults_required" ? "This item requires embedded contents metadata that is not available yet." : "Native constructor metadata is missing for this item.");
  if (definition.internalName !== content.internalName || itemDefinitions.get(content.definitionKey)?.referenceMaxStack !== content.referenceMaxStack) return unavailable2(row, "CATALOG_IDENTITY_MISMATCH", "This recipe does not match the exact pinned catalog identity and reference limit.");
  if (!additionQuantitySupported(definition, target)) return unavailable2(row, "REFERENCE_LIMIT", "This recipe exceeds the constructor stack budget.");
  const p = pending.get(`addition:item:${content.definitionKey}`);
  if (p) return BigInt(p.quantity) >= BigInt(target) ? { ...row, current: "0", effective: p.quantity, after: p.quantity, status: "satisfied", reasonCode: "MINIMUM_ALREADY_MET", reason: "This item is already covered by your staged addition." } : conflicting({ ...row, current: "0", effective: p.quantity, after: p.quantity }, "PENDING_EDIT_CONFLICT", "A smaller addition is already staged for this item. Review or remove it before applying this pack.");
  return { ...row, current: "0", effective: "0", after: target, status: "ready", reasonCode: "REVIEWED_ITEM_ADDITION", reason: "Add a fresh item using the reviewed constructor. Existing records stay unchanged.", requiredCapability: "insert_item", constructorFamily: family, operation: additionOperation(definition, target) };
}
function resolveItem(recipe, content, domains, pending) {
  const all = domains.inventory.records.filter((r) => r.definitionKey === content.definitionKey);
  const row = { kind: "item", definitionKey: content.definitionKey, internalName: content.internalName, displayName: content.displayName, iconUrl: content.iconUrl, target: content.targetQuantity, current: null, effective: null, after: null, status: "unavailable", reasonCode: null, reason: null, operation: null, requiredCapability: recipe.delivery === "missing_only" ? "insert_item" : "edit_existing" };
  if (all.some((r) => r.catalogMatched !== true || r.internalName !== content.internalName)) return unavailable2(row, "CATALOG_IDENTITY_MISMATCH", "The exact item definition could not be matched in this save.");
  if (recipe.delivery === "missing_only") {
    if (all.length) return { ...row, current: String(all.length), effective: String(all.length), after: String(all.length), status: "satisfied", reasonCode: "ALREADY_OWNED", reason: "Already owned. Existing gear is kept as it is.", ownedInstances: all.length };
    if (ownsDefinition(domains, content.definitionKey)) return { ...row, current: "1", effective: "1", after: "1", status: "satisfied", reasonCode: "ALREADY_OWNED", reason: "Already owned or equipped. Existing gear is kept as it is.", ownershipLocation: "equipped_or_other_saved_item" };
    return resolveAddition(row, content, domains, pending);
  }
  const profile3 = existingStackQuantityProfile(content.definitionKey, content.referenceMaxStack), records2 = [...all].sort((a, b) => Number(a.inventoryKey !== 2) - Number(b.inventoryKey !== 2) || a.inventoryKey - b.inventoryKey || a.slot - b.slot || (BigInt(a.instanceId) < BigInt(b.instanceId) ? -1 : 1));
  const fresh = pending.get(`addition:item:${content.definitionKey}`);
  if (!records2.length && fresh) return resolveAddition(row, content, domains, pending);
  if (!records2.length) {
    if (!all.length && !ownsDefinition(domains, content.definitionKey)) return resolveAddition(row, content, domains, pending);
    const observed = all.length && all.every((r) => decimal3(r.quantity)) ? String(all.reduce((n, r) => n + BigInt(r.quantity), 0n)) : null;
    return unavailable2({ ...row, current: observed, effective: observed, after: observed, ownedInstances: all.length || null }, "NONEDITABLE_OWNED_RECORD", "This owned or equipped item is outside the editable inventory. It will be preserved.");
  }
  if (profile3?.uniqueBalance && (records2.length !== 1 || records2[0].inventoryKey !== 2)) return unavailable2({ ...row, ownedInstances: records2.length }, "COPPER_IDENTITY_AMBIGUOUS", "Exactly one Copper balance in the main inventory is required. No currency value will be chosen automatically.");
  if (!profile3 || records2.some((r) => !basicRecord(r, domains) || r.referenceMaxStack !== content.referenceMaxStack)) return unavailable2({ ...row, ownedInstances: records2.length }, "EXISTING_FIELD_UNSUPPORTED", "This saved record has no complete, supported quantity field or its inventory is ambiguous. It will be preserved.");
  const target = BigInt(content.targetQuantity), maximum = BigInt(profile3.maximum);
  if (target < 1n || target > maximum) return unavailable2(row, "REFERENCE_LIMIT", "This recipe exceeds the pinned reference stack limit.");
  const quantities = records2.map((r) => ({ r, current: BigInt(r.quantity), effective: BigInt(pending.get(keyOf(stage(content.definitionKey === 1 ? "inventory.setCopper" : "inventory.setQuantity", r, r.quantity)))?.desiredValue ?? r.quantity) }));
  const current = quantities.reduce((n, x) => n + x.current, 0n), effective = quantities.reduce((n, x) => n + x.effective, 0n) + (fresh ? BigInt(fresh.quantity) : 0n), after = effective < target ? target : effective;
  const known = { ...row, current: String(current), effective: String(effective), after: String(after), ownedInstances: records2.length };
  if (quantities.some((x) => x.effective < x.current)) return conflicting({ ...known, after: String(effective) }, "PENDING_EDIT_CONFLICT", "An existing change reduces this item. Remove that change before applying this pack.");
  if (effective >= target) return { ...known, status: "satisfied", reasonCode: "MINIMUM_ALREADY_MET", reason: effective !== current ? "This minimum is already covered by your staged changes." : "Already at or above this target. Nothing is removed." };
  const first = quantities.find((x) => !pending.has(keyOf(stage(content.definitionKey === 1 ? "inventory.setCopper" : "inventory.setQuantity", x.r, x.r.quantity))));
  if (!first) return conflicting({ ...known, after: String(effective) }, "PENDING_EDIT_CONFLICT", "A different quantity is already staged for this item. Remove that change before applying this pack.");
  const desired = first.effective + (target - effective);
  if (desired > maximum) return unavailable2(known, "STACK_CAPACITY_REQUIRED", "This refill would need a new stack. It has not been partially applied.");
  const operation = stage(content.definitionKey === 1 ? "inventory.setCopper" : "inventory.setQuantity", first.r, String(desired));
  return { ...known, status: "ready", reasonCode: "EXISTING_STACK_TOP_UP", reason: records2.length > 1 ? "Top up one existing stack; all sibling stacks stay unchanged." : "Top up the existing stack.", operation };
}
function resolveCapacity(content, domains, pending) {
  const row = { kind: "capacity", displayName: "Bag size", definitionKey: null, iconUrl: null, target: String(content.targetCapacity), current: null, effective: null, after: null, operation: null, requiredCapability: "edit_capacity" };
  const bags = domains.inventory.bags.filter((b) => b.inventoryKey === 2), bag2 = bags[0];
  if (bags.length !== 1 || !Number.isSafeInteger(bag2.expansionSlots) || bag2.expansionSlots < 0 || bag2.expansionSlots > 200) return unavailable2(row, "CAPACITY_FIELD_UNSUPPORTED", "Bag size is unavailable for this snapshot.");
  const current = 50 + bag2.expansionSlots, p = pending.get("capacity:2"), effective = p ? 50 + Number(p.desiredValue) : current, after = Math.max(effective, content.targetCapacity);
  const known = { ...row, current: String(current), effective: String(effective), after: String(after) };
  if (after < 50 || after > 250 || domains.inventory.records.filter((r) => r.inventoryKey === 2).some((r) => r.slot >= after)) return unavailable2(known, "CAPACITY_CONFLICT", "The requested bag size conflicts with the supported range or occupied slots.");
  if (effective >= content.targetCapacity) return { ...known, status: "satisfied", reasonCode: "MINIMUM_ALREADY_MET", reason: "Your bag already has at least this much room." };
  if (p) return conflicting({ ...known, after: String(effective) }, "PENDING_EDIT_CONFLICT", "A different bag size is already staged. Remove that change before applying this pack.");
  return { ...known, status: "ready", reasonCode: "EXISTING_CAPACITY_INCREASE", reason: "Increase the existing bag size; all stored items stay in place.", operation: stage("inventory.setExpansionValue", bag2, String(after - 50)) };
}
function previewPack(packId, { domains, drafts = [] } = {}) {
  const recipe = getPackRecipe(packId);
  if (!recipe) failure("PACK_NOT_FOUND", "Choose a pack from the current catalog.", 404);
  const sourceProblem = sourceCheck(domains);
  let conflict = recipe.paused ? "This pack is paused while its compatibility is reviewed." : sourceProblem, normalized = [];
  if (!conflict) try {
    normalized = normalizeDrafts(domains, drafts);
  } catch (error) {
    conflict = error.message;
  }
  const pending = new Map(normalized.map((d) => [keyOf(d), d]));
  let entries;
  if (sourceProblem) entries = recipe.contents.map((c) => ({ ...c, target: c.targetQuantity ?? String(c.targetCapacity), current: null, effective: null, after: null, status: "unavailable", reasonCode: "SNAPSHOT_UNSUPPORTED", reason: conflict, operation: null }));
  else entries = recipe.contents.map((c) => c.kind === "capacity" ? resolveCapacity(c, domains, pending) : resolveItem(recipe, c, domains, pending));
  const combine = (rows2) => {
    const combined2 = [...normalized];
    for (const operation of rows2.filter((e) => e.operation).map((e) => e.operation)) {
      const i = combined2.findIndex((d) => keyOf(d) === keyOf(operation));
      if (i < 0) combined2.push(operation);
      else combined2[i] = operation;
    }
    return combined2;
  };
  let combined = combine(entries), inventorySpace = planPackInventorySpace(recipe, entries, domains, combined, { deliveryOnly: true });
  if (inventorySpace.newItemDefinitions > 0 && !inventorySpace.canFit) {
    const packAdditions = entries.filter((e) => e.operation?.operation === "inventory.addItem").length, failedDestinations = new Map(inventorySpace.perInventory?.filter((p) => !p.canFit).map((p) => [p.inventoryKey, p]) || []), allAdditionsBlocked = !inventorySpace.placementComplete || inventorySpace.reason === "CONSTRUCTOR_BATCH_LIMIT";
    entries = entries.map((e) => {
      const destination = failedDestinations.get(e.operation?.inventoryKey);
      return e.operation?.operation === "inventory.addItem" && (allAdditionsBlocked || destination) ? unavailable2(e, destination?.reason || "INVENTORY_CAPACITY_LIMIT", destination?.warning || inventorySpace.warning || "There is not enough verified inventory space for this addition.") : e;
    });
    combined = combine(entries);
    if (!packAdditions || normalized.some((d) => d.operation === "inventory.addItem") && !planPackInventorySpace(recipe, entries, domains, normalized, { deliveryOnly: true }).canFit) conflict = inventorySpace.warning || "An existing staged addition does not fit in this inventory.";
  }
  const stagedOperations = entries.filter((e) => e.operation).map((e) => e.operation);
  const newSlots = combined.filter((d) => d.operation === "inventory.addItem").reduce((n, d) => n + Number((BigInt(d.quantity) + BigInt(d.referenceMaxStack) - 1n) / BigInt(d.referenceMaxStack)), 0);
  if (newSlots > MAX_STRUCTURAL_NEW_ITEM_STACKS) conflict = `Choose fewer new items. A transfer can add at most ${MAX_STRUCTURAL_NEW_ITEM_STACKS} new item stacks at once.`;
  const itemAdditions = combined.filter((d) => d.operation === "inventory.addItem").length, companions2 = combined.filter((d) => d.operation === "companions.add").length, cartography2 = combined.filter((d) => d.operation.startsWith("cartography.")).length, scalars = combined.length - itemAdditions - companions2 - cartography2, limit3 = itemAdditions || companions2 || cartography2 ? MAX4 : MAX_STRUCTURAL_SCALAR_OPERATIONS;
  if (itemAdditions > MAX_STRUCTURAL_ITEM_INTENTS) conflict = `Add at most ${MAX_STRUCTURAL_ITEM_INTENTS} different items in one transfer.`;
  if (companions2 > MAX_COMPANION_ADDITIONS) conflict = `Add at most ${MAX_COMPANION_ADDITIONS} companions in one transfer.`;
  if (scalars > MAX_STRUCTURAL_SCALAR_OPERATIONS) conflict = "This pack would exceed eight existing-field changes. Remove another change or choose a smaller pack.";
  if (combined.length > limit3) conflict = limit3 === MAX_STRUCTURAL_SCALAR_OPERATIONS ? "This pack would exceed eight combined changes. Remove another change or choose a smaller pack." : `This pack would exceed ${limit3} combined changes. Remove another change or choose a smaller pack.`;
  const omitted = entries.filter((e) => e.status === "unavailable" || e.status === "conflict"), ready = stagedOperations.length;
  const summary2 = { changes: ready, alreadySatisfied: entries.filter((e) => e.status === "satisfied").length, unavailable: entries.filter((e) => e.status === "unavailable").length, conflicts: entries.filter((e) => e.status === "conflict").length + (conflict ? 1 : 0), total: entries.length, combinedChanges: combined.length };
  return {
    schema: "saveglass.crimson-pack-preview.v1",
    recipeRevision: PACK_REVISION,
    catalogRevision: catalog2.catalogRevision,
    recipe,
    entries,
    stagedOperations,
    combinedDrafts: combined,
    omitted,
    summary: summary2,
    inventorySpace,
    canStageFull: ready > 0 && omitted.length === 0 && !conflict,
    canStageAvailable: ready > 0 && !conflict,
    alreadyComplete: ready === 0 && omitted.length === 0 && !conflict,
    mergeConflict: conflict,
    partialApplicationRequiresExplicitChoice: omitted.length > 0 && ready > 0,
    structuralAdditionsEnabled: !sourceProblem && structuralSchemaSupported(domains?.schemaSha256, domains?.saveVersion),
    commercialDeliveryEnabled: false,
    originalPreserved: true,
    message: conflict || (omitted.length ? "Some contents are unavailable. Only an explicit available-contents selection can stage the supported changes listed here." : ready ? "Review these exact changes before staging them." : "This save already meets every target in the pack.")
  };
}
function stagePack(packId, { domains, drafts = [], selection = "full" } = {}) {
  if (!["full", "available"].includes(selection)) failure("PACK_SELECTION_INVALID", "Choose the complete pack or explicitly select its available contents.", 400);
  const preview = previewPack(packId, { domains, drafts });
  if (selection === "full" && !preview.canStageFull) failure("PACK_NOT_FULLY_ELIGIBLE", preview.mergeConflict || "This pack cannot be staged in full. Review the unavailable contents.");
  if (selection === "available" && !preview.canStageAvailable) failure("PACK_NOT_ELIGIBLE", preview.mergeConflict || "This pack has no supported changes to stage.");
  return { preview, stagedOperations: preview.stagedOperations, combinedDrafts: preview.combinedDrafts, omitted: selection === "available" ? preview.omitted : [] };
}
var data5, itemCatalogData, PACK_REVISION, MAX4, U64, decimal3, keyOf, packs, catalog2, byId, itemDefinitions, additionFamily, ownsDefinition, PackError, failure;
var init_crimson_packs = __esm({
  "src/catalog/crimson-packs.mjs"() {
    init_data_provider();
    init_inventory_placement();
    init_structural_publication_profile();
    init_catalog_item_profile();
    init_companion_addition_profile();
    init_inventory_quantity_profile();
    data5 = getData("crimson-packs.json");
    itemCatalogData = getData("crimson-items.json");
    PACK_REVISION = data5.manifest.revision + ":" + data5.manifest.recipeSha256;
    MAX4 = MAX_STRUCTURAL_OPERATIONS;
    U64 = 0xffffffffffffffffn;
    decimal3 = (v) => typeof v === "string" && /^(0|[1-9]\d{0,19})$/.test(v) && BigInt(v) <= U64;
    keyOf = (d) => d.operation.startsWith("cartography.") ? d.operation : d.operation === "inventory.setExpansionValue" ? `capacity:${d.inventoryKey}` : d.operation === "inventory.addItem" ? `addition:item:${d.definitionKey}` : d.operation === "companions.add" ? `addition:companion:${d.characterKey}` : `item:${d.inventoryKey}:${d.definitionKey}:${d.instanceId}:${d.slot}`;
    packs = freeze(data5.packs.map((p) => ({ ...p, recipeRevision: PACK_REVISION, catalogRevision: data5.manifest.catalogRevision })));
    catalog2 = freeze({ ...data5.manifest, revision: PACK_REVISION, packs });
    byId = new Map(packs.map((p) => [p.id, p]));
    itemDefinitions = new Map(itemCatalogData.items.map((item) => [item.key, item]));
    additionFamily = (key, domains) => structuralSchemaSupported(domains.schemaSha256, domains.saveVersion) && catalogItemAdditionSupported(key, domains.schemaSha256) ? "catalog_item" : null;
    ownsDefinition = (domains, key) => domains.inventory.ownedDefinitionKeys?.includes(key) || domains.inventory.records.some((r) => r.definitionKey === key);
    PackError = class extends Error {
      constructor(code, message, status = 409) {
        super(message);
        this.name = "PackError";
        this.code = code;
        this.status = status;
      }
    };
    failure = (code, message, status) => {
      throw new PackError(code, message, status);
    };
  }
});

// src/crimson-packs.mjs
var crimson_packs_exports2 = {};
__export(crimson_packs_exports2, {
  previewCrimsonPack: () => previewCrimsonPack
});
function validate(backup, metadata3, input) {
  if (!exact3(input, ["container", "payload", "packId", "recipeRevision", "selection", "drafts"]) || !/^slot\d{1,3},savedgame$/.test(input.container || "") || input.payload !== "save" || typeof input.packId !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.packId) || !["review", "full", "available"].includes(input.selection) || !Array.isArray(input.drafts) || input.drafts.length > MAX_STRUCTURAL_OPERATIONS) fail14("PACK_INPUT_INVALID", `Choose a current pack and one source save, with at most ${MAX_STRUCTURAL_OPERATIONS} reviewed changes.`, 400);
  if (input.recipeRevision !== PACK_REVISION) fail14("PACK_RECIPE_STALE", "The pack recipe changed. Reopen the pack before staging it.");
  if (!getPackRecipe(input.packId)) fail14("PACK_NOT_FOUND", "Choose a pack from the current catalog.", 404);
  assertSourceBinding(backup, metadata3);
}
function inputPlan(backup, metadata3, payload, domains, container, drafts) {
  return {
    schema: drafts.some((d) => d.operation.startsWith("cartography.")) ? MIXED_PLAN_SCHEMA : drafts.some((d) => ["inventory.addItem", "companions.add"].includes(d.operation)) ? STRUCTURAL_PLAN_SCHEMA : "saveglass.crimson-draft-plan.v1",
    container,
    payload: "save",
    backupSha256: metadata3.sha256,
    backupRevision: backup.revision,
    payloadSha256: payload.sha256,
    plaintextSha256: domains.plaintextSha256,
    schemaSha256: domains.schemaSha256,
    decoderRevision: DECODER_REVISION,
    catalogRevision: CATALOG_REVISION,
    operations: drafts.map(({ operation, inventoryKey, expectedValue, desiredValue, definitionKey, instanceId, slot, quantity, characterKey }) => operation.startsWith("cartography.") ? { operation } : operation === "inventory.addItem" ? { operation, definitionKey, quantity } : operation === "companions.add" ? { operation, characterKey } : { operation, inventoryKey, expectedValue, desiredValue, ...operation === "inventory.setExpansionValue" ? {} : { definitionKey, instanceId, slot } })
  };
}
async function previewCrimsonPack(backup, metadata3, input) {
  validate(backup, metadata3, input);
  const containers = backup.containers.filter((c) => c.index.fileName === input.container), payloads = containers.length === 1 ? containers[0].blobs.filter((p) => p.name === input.payload) : [];
  if (payloads.length !== 1) fail14("PACK_SOURCE_MISSING", "The selected save is missing or ambiguous in this snapshot.");
  const payload = payloads[0], bytes2 = import_buffer.Buffer.from(payload.data, "base64");
  if (bytes2.length > 8 * 1024 * 1024 || bytes2.toString("base64") !== payload.data || !HASH2.test(payload.sha256 || "")) fail14("PACK_SOURCE_INVALID", "The selected payload could not be verified.");
  const decoded = await decodeSave(bytes2), domains = normalizeCrimson(readDocument(decoded.plaintext, { fieldListLimits: { "InventoryElementSaveData._itemList": 1024, "MercenaryClanSaveData._mercenaryDataList": 1e3 } }), { saveVersion: decoded.version });
  let preview, stagedOperations = [], combinedDrafts = [], plan = null, validationReport = null;
  try {
    if (input.selection === "review") preview = previewPack(input.packId, { domains, drafts: input.drafts });
    else {
      const staged = stagePack(input.packId, { domains, drafts: input.drafts, selection: input.selection });
      preview = staged.preview;
      stagedOperations = staged.stagedOperations;
      combinedDrafts = staged.combinedDrafts;
      plan = inputPlan(backup, metadata3, payload, domains, input.container, combinedDrafts);
      validationReport = await (plan.schema === MIXED_PLAN_SCHEMA ? compileMixedDraft : plan.schema === STRUCTURAL_PLAN_SCHEMA ? compileStructuralDraft : compileCrimsonDraft)(backup, metadata3, plan);
    }
  } catch (error) {
    if (error instanceof PackError) fail14(error.code, error.message, error.status);
    throw error;
  }
  const protectedReference = input.container === "slot108,savedgame";
  if (protectedReference) preview = { ...preview, canStageFull: false, canStageAvailable: false, mergeConflict: "This clean reference save is protected. Choose another save to stage a pack.", protectedReference: true };
  return {
    schema: "saveglass.crimson-pack-resolution.v1",
    source: "plugin_bundle",
    backupId: metadata3.id,
    backupSha256: metadata3.sha256,
    backupRevision: backup.revision,
    container: input.container,
    payload: input.payload,
    payloadSha256: payload.sha256,
    recipeRevision: PACK_REVISION,
    selection: input.selection,
    preview,
    stagedOperations,
    combinedDrafts,
    inputPlan: plan,
    validationReport,
    originalBackupUnchanged: true,
    modifiedSaveStored: false,
    encodedBytesReturned: false,
    cloudRequests: 0,
    cloudWritesEnabled: false,
    structuralAdditionsEnabled: preview.structuralAdditionsEnabled,
    commercialDeliveryEnabled: false,
    message: validationReport ? "The exact combined draft passed intended-only comparison and encrypted re-open validation. Use the separate Send to Xbox review to publish it." : "Pack contents and eligibility were resolved against the selected original. No changes have been staged or sent by this review."
  };
}
var HASH2, exact3, fail14;
var init_crimson_packs2 = __esm({
  "src/crimson-packs.mjs"() {
    init_buffer();
    init_source_binding();
    init_crimson_codec();
    init_crimson_document();
    init_crimson_domain();
    init_crimson_draft();
    init_structural_draft();
    init_structural_publication_profile();
    init_mixed_draft();
    init_crimson_packs();
    HASH2 = /^[a-f0-9]{64}$/;
    exact3 = (v, keys2) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys2.length && keys2.every((k) => Object.hasOwn(v, k));
    fail14 = (code, message, status = 409) => {
      throw new ProbeError(message, status, code);
    };
  }
});

// src/preset-library.mjs
var preset_library_exports = {};
__export(preset_library_exports, {
  presetCatalog: () => presetCatalog,
  presetPreview: () => presetPreview
});
function confirmedStartSmart(preset) {
  return Boolean(START_SMART_REFERENCE) && preset.id === "starter-all-nexus" && preset.source.saveSha256 === START_SMART_REFERENCE.save.sha256 && preset.source.lobbySha256 === START_SMART_REFERENCE.lobby.sha256 && preset.source.schemaSha256 === START_SMART_REFERENCE.save.schemaSha256;
}
function validateReferences() {
  if (references.schema !== "saveglass.crimson-reference-presets.v1" || references.sourceType !== "normalized_reference_summary" || references.rawSaveIncluded !== false || references.accountIdentifiersIncluded !== false || references.titleId !== "1754076455" || references.presets.length !== 3) fail15();
  const seen = /* @__PURE__ */ new Set();
  for (const p of references.presets) {
    if (!ids.has(p.id) || seen.has(p.id) || !["starter", "midgame", "endgame"].includes(p.stage) || p.source?.permission !== "owner_granted_reference_use_2026-10-31" || ["archiveSha256", "saveSha256", "lobbySha256", "schemaSha256"].some((k) => !digest3.test(p.source[k] || "")) || p.source.saveVersion !== 2) fail15();
    seen.add(p.id);
    if (p.validation?.hmacVerified !== true || p.validation.fullTypedTraversal !== true || p.validation.advisoryLocators !== 0 || p.validation.unconsumedBytes !== 0) fail15();
    const { inventory, companions: companions2, progress } = p.domains || {};
    if (!inventory || !Array.isArray(inventory.records) || inventory.records.length !== p.summary.inventoryRecords || inventory.recordCount !== inventory.records.length || inventory.records.length > 5e3 || !Array.isArray(companions2) || companions2.length !== p.summary.companions || companions2.length > 1e3 || !progress) fail15();
    for (const row of inventory.records) if (!Number.isSafeInteger(row.definitionKey) || row.definitionKey < 0 || !Number.isSafeInteger(row.inventoryKey) || !Number.isSafeInteger(row.slot) || row.quantity !== null && !/^(0|[1-9]\d{0,19})$/.test(row.quantity)) fail15();
    if (inventory.records.filter((r) => r.inventoryKey === 2).length !== p.summary.carriedInventoryRecords || progress.knowledgeRecords !== p.summary.knowledgeRecords || progress.questRecords !== p.summary.questRecords) fail15();
    if (companions2.some((c) => !Number.isSafeInteger(c.characterKey) || c.characterKey < 0) || companions2.filter((c) => c.classification === "pet").length !== p.summary.pets || companions2.filter((c) => c.classification === "mount").length !== p.summary.mounts) fail15();
  }
}
function publication(preset) {
  const confirmed = confirmedStartSmart(preset), reasons = copy(confirmed ? startSmartReleaseReasons : importReasons);
  if (preset.validation.encoderLimitExceeded) reasons.push({ code: "DECODED_ENCODER_LIMIT", label: "This reference exceeds the current 8 MiB decoded encoder limit." });
  return {
    enabled: false,
    mode: "full_adventure_replacement",
    reasons,
    protectedSave9: true,
    automaticRetry: false,
    automaticRollback: false,
    acceptance: confirmed ? { source: "owner_reported_console_observation", gameLoad: "confirmed", newSlotCreation: "confirmed", scope: "exact_pinned_pair_in_empty_manual_save_2", testedAccountCount: 1, saveRelaunch: "not_reported", overwrite: "unverified", grantsNewWritePermission: false } : null
  };
}
function card(preset) {
  return { ...copy(Object.fromEntries(["id", "name", "stage", "description", "source", "claimedFeatures", "summary", "validation"].map((k) => [k, preset[k]]))), publication: publication(preset) };
}
function presetCatalog() {
  return { schema: "saveglass.preset-library.v1", revision: references.revision, titleId: references.titleId, source: "licensed_reference_preset", readonly: true, replacesAdventure: true, presets: references.presets.map(card), rawSaveIncluded: false, accountIdentifiersIncluded: false, cloudWritesEnabled: false };
}
function presetPreview(presetId) {
  if (typeof presetId !== "string" || !ids.has(presetId)) throw new ProbeError("Choose a listed reference preset.", 404, "PRESET_NOT_FOUND");
  const preset = references.presets.find((p) => p.id === presetId);
  if (!preset) throw new ProbeError("This reference provider is unavailable.", 503, "PRESET_PROVIDER_UNAVAILABLE");
  const domains = copy(preset.domains);
  domains.inventory.records = domains.inventory.records.map((row) => {
    const item = catalogItem(row.definitionKey), enriched = itemEnrichment(row.definitionKey, item?.internalName);
    return { ...row, displayName: item?.name || row.displayName, internalName: item?.internalName || row.internalName, category: enriched?.category || item?.category || row.category, iconUrl: enriched?.iconUrl || row.iconUrl, catalogMatched: Boolean(item) };
  });
  domains.companions = domains.companions.map((row) => {
    const enriched = companionEnrichment(row.characterKey);
    return { ...row, displayName: enriched?.displayName || row.displayName, classification: enriched?.classification || row.classification, iconUrl: enriched?.iconUrl || row.iconUrl };
  });
  return { schema: "saveglass.preset-preview.v1", revision: references.revision, source: "licensed_reference_preset", readonly: true, replacesAdventure: true, preset: card(preset), domains, displayCatalogRevision: CATALOG_REVISION, publication: publication(preset), rawSaveIncluded: false, accountIdentifiersIncluded: false, liveAccountModified: false, loadedIntoLiveDraft: false };
}
var references, START_SMART_REFERENCE, ids, digest3, fail15, copy, importReasons, startSmartReleaseReasons;
var init_preset_library = __esm({
  "src/preset-library.mjs"() {
    init_data_provider();
    init_crimson_domain();
    init_crimson_enrichment();
    init_source_binding();
    references = getData("crimson-save-presets.json");
    START_SMART_REFERENCE = getData("crimson-preset-reference-pins.json").starter || null;
    ids = /* @__PURE__ */ new Set(["starter-all-nexus", "midgame-hernand-100", "endgame-20001"]);
    digest3 = /^[0-9a-f]{64}$/;
    fail15 = () => {
      throw new ProbeError("The reference preset could not be verified.", 503, "PRESET_REFERENCE_INVALID");
    };
    copy = (value2) => structuredClone(value2);
    importReasons = Object.freeze([
      Object.freeze({ code: "RECIPIENT_SCHEMA_NOT_VALIDATED", label: "Xbox recipient schema compatibility needs validation." }),
      Object.freeze({ code: "RECIPIENT_IDENTITY_MAPPING_REQUIRED", label: "Recipient identity and account-bound fields need review." }),
      Object.freeze({ code: "LOBBY_BINDING_REVIEW_REQUIRED", label: "The paired lobby and destination bindings need validation." }),
      Object.freeze({ code: "RECIPIENT_GAME_ROUND_TRIP_REQUIRED", label: "A recipient game-load, save and relaunch test is required." })
    ]);
    startSmartReleaseReasons = Object.freeze([
      Object.freeze({ code: "PRESET_PROVIDER_DELIVERY_NOT_RELEASED", label: "Private delivery of the pinned reference pair to the normal import flow is not released." }),
      Object.freeze({ code: "PRESET_DESTINATION_RELEASE_REQUIRED", label: "The verified creation used an empty Save 2. Other destinations and overwrites remain separately gated." }),
      Object.freeze({ code: "PRESET_REVIEW_SEND_INTEGRATION_REQUIRED", label: "Repeatable preset import needs its normal review, destination and readback checks." })
    ]);
    if (references.presets.length) validateReferences();
  }
});

// src/uploaded-save.mjs
var uploaded_save_exports = {};
__export(uploaded_save_exports, {
  UPLOADED_SAVE_LIMITS: () => UPLOADED_SAVE_LIMITS,
  UploadedSaveError: () => UploadedSaveError,
  inspectUploadedSaves: () => inspectUploadedSaves,
  validateUploadedSaveInput: () => validateUploadedSaveInput
});
function validateUploadedSaveInput(input) {
  if (!exact4(input, ["game", "files"]) || input.game !== "crimson-desert") fail16("SAVE_UPLOAD_GAME_UNSUPPORTED", "Choose Crimson Desert for this upload check.");
  if (!Array.isArray(input.files) || input.files.length < 1 || input.files.length > UPLOADED_SAVE_LIMITS.maxFiles) fail16("SAVE_UPLOAD_FILE_COUNT", "Choose one or two native save files.");
  let total = 0;
  const names = /* @__PURE__ */ new Set();
  return input.files.map((file) => {
    if (!exact4(file, ["name", "dataBase64"]) || typeof file.name !== "string" || file.name.length < 1 || file.name.length > 180 || /[\u0000-\u001f\u007f/\\]/.test(file.name) || /^\.+$/.test(file.name)) fail16("SAVE_UPLOAD_NAME_INVALID", "Use a file name without folders or control characters.");
    const name = file.name.normalize("NFC");
    if (names.has(name.toLowerCase())) fail16("SAVE_UPLOAD_DUPLICATE_NAME", "Choose files with different names.");
    names.add(name.toLowerCase());
    if (typeof file.dataBase64 !== "string" || file.dataBase64.length < 4 || file.dataBase64.length % 4 !== 0 || file.dataBase64.length > Math.ceil(UPLOADED_SAVE_LIMITS.maxTotalBytes / 3) * 4 || !canonicalBase64.test(file.dataBase64)) fail16("SAVE_UPLOAD_DATA_INVALID", "The uploaded file data is not valid base64.");
    const bytes2 = import_buffer.Buffer.from(file.dataBase64, "base64");
    if (!bytes2.length || bytes2.toString("base64") !== file.dataBase64) fail16("SAVE_UPLOAD_DATA_INVALID", "The uploaded file data is not valid base64.");
    total += bytes2.length;
    if (total > UPLOADED_SAVE_LIMITS.maxTotalBytes) fail16("SAVE_UPLOAD_SIZE_LIMIT", "Choose files totaling no more than 4 MiB.", 413);
    return { name, bytes: bytes2 };
  });
}
function detectedFormat(bytes2) {
  if (bytes2.length >= 4 && bytes2.subarray(0, 4).equals(import_buffer.Buffer.from("SAVE"))) return "crimson-save";
  if (bytes2.length >= 4 && bytes2[0] === 80 && bytes2[1] === 75 && [[3, 4], [5, 6], [7, 8]].some(([a, b]) => bytes2[2] === a && bytes2[3] === b)) return "zip-archive";
  if (bytes2.length >= 2 && bytes2.readUInt16LE(0) === 65535) return "decoded-parc";
  return "unrecognized";
}
function baseReport(file) {
  return { name: file.name, bytes: file.bytes.length, sha256: hash(file.bytes), status: "unsupported", format: detectedFormat(file.bytes), role: "unknown", summary: "This file format is not supported by the Crimson Desert checker.", checks: { integrity: null, structure: null, roundTrip: null, plaintextUnchanged: null } };
}
function fileName(name) {
  const safe = name.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/^\.+/, "").replace(/\.[^.]*$/, "").slice(0, 100) || "save";
  return "native-" + safe + ".save";
}
function scalarMetadata() {
  const values = /* @__PURE__ */ new Map();
  return { collect(event) {
    const match = /^\$\[\d+\]\.([^.\[\]]+)\.([^.\[\]]+)$/.exec(event.path);
    if (!match || !metadataFields.has(match[2]) || !["number", "string"].includes(typeof event.value) || typeof event.value === "number" && !Number.isSafeInteger(event.value) || typeof event.value === "string" && !/^\d{1,20}$/.test(event.value)) return;
    const key = match[1] + "." + match[2], old = values.get(key);
    values.set(key, old === void 0 ? String(event.value) : null);
  }, get(type, field2) {
    return values.get(type + "." + field2) ?? null;
  } };
}
function identify(document, metadata3) {
  const roots = document.schema.toc.map((entry) => document.schema.types[entry.classIndex]);
  const lobbyRoots = roots.filter((type) => lobbyFields.every((name) => type.fields.some((field2) => field2.name === name) && metadata3.get(type.name, name) !== null));
  const inventoryRoots = roots.filter((type) => type.name === "InventorySaveData").length;
  if (lobbyRoots.length === 1 && inventoryRoots === 0) {
    const type = lobbyRoots[0].name;
    return { role: "lobby", quest: metadata3.get(type, "_slotDisplayNameMissionKey"), mainQuest: metadata3.get(type, "_slotDisplayNameMainQuestKey"), gameSaveVersion: metadata3.get(type, "_gameSaveVersion"), generateNo: metadata3.get(type, "_generateNo") };
  }
  if (inventoryRoots === 1 && !lobbyRoots.length) return { role: "save", quest: metadata3.get("QuestSaveData", "_lastCompletedMissionKey"), mainQuest: metadata3.get("QuestSaveData", "_lastCompletedMainQuestKey"), gameSaveVersion: null, generateNo: null };
  return { role: "unknown", quest: null, mainQuest: null, gameSaveVersion: null, generateNo: null };
}
async function inspectFile(file, remainingNativeBytes) {
  const result = baseReport(file);
  let failedCheck = "integrity";
  if (result.format === "zip-archive") {
    result.summary = "This is an archive. Choose its original save file and companion lobby file; archives are not extracted.";
    return { result };
  }
  if (result.format === "decoded-parc") {
    result.summary = "This is a decoded payload. Its original SAVE header is required; the checker will not invent one.";
    return { result };
  }
  if (result.format !== "crimson-save") return { result };
  try {
    if (file.bytes.length < 128) throw new CodecError("Truncated SAVE envelope.", "CRIMSON_FORMAT_INVALID");
    const declared = file.bytes.readUInt32LE(18);
    if (declared < 1 || declared > UPLOADED_SAVE_LIMITS.maxDecodedBytes) {
      result.code = "SAVE_UPLOAD_DECODED_SIZE_LIMIT";
      result.summary = "The decoded save exceeds this checker\u2019s 8 MiB limit.";
      return { result };
    }
    const decoded = await decodeSave(file.bytes);
    result.checks.integrity = true;
    failedCheck = "structure";
    const metadata3 = scalarMetadata(), document = readDocument(decoded.plaintext, { captureTypes: [], listLimit: 0, onScalar: metadata3.collect });
    if (document.audit.unconsumedBytes !== 0 || document.audit.advisoryLocators !== 0) throw new CodecError("Unsupported typed document locations.", "PARC_TYPED_INVALID");
    const identity = identify(document, metadata3);
    result.checks.structure = true;
    result.role = identity.role;
    failedCheck = "roundTrip";
    const native = await encodeSave(decoded.plaintext, decoded.header, { nonce: decoded.header.subarray(26, 42) });
    if (native.length > UPLOADED_SAVE_LIMITS.maxNativeFileBytes || native.length > remainingNativeBytes) throw new CodecError("Native copy exceeds the output budget.", "SAVE_UPLOAD_NATIVE_SIZE_LIMIT");
    const reopened = await decodeSave(native);
    if (reopened.version !== decoded.version || reopened.flags !== decoded.flags || !decoded.plaintext.equals(reopened.plaintext) || !preservedHeader(decoded.header, reopened.header)) throw new CodecError("Unchanged native copy did not reopen.", "SAVE_UPLOAD_ROUNDTRIP_FAILED");
    result.status = "validated";
    result.checks.roundTrip = true;
    result.checks.plaintextUnchanged = true;
    result.summary = "Native SAVE integrity, structure and unchanged-data re-open checks passed. Xbox transfer is not verified.";
    result.details = { saveVersion: decoded.version, decodedBytes: decoded.plaintext.length, typeCount: document.schema.types.length, rootCount: document.schema.toc.length, schemaSha256: document.schemaSha256, omittedListMarkers: document.audit.omittedListMarkers, nonzeroListMetadata: document.audit.nonzeroListMetadata, opaqueHeaderPreserved: true, nativeLz4: true };
    result.nativeCopy = { filename: fileName(file.name), bytes: native.length, sha256: hash(native), dataBase64: native.toString("base64") };
    return { result, identity };
  } catch (error) {
    result.status = error instanceof CodecError && unsupportedCodecCodes.has(error.code) ? "unsupported" : "invalid";
    result.code = error instanceof CodecError && /^[A-Z][A-Z0-9_]{1,79}$/.test(error.code || "") ? error.code : "SAVE_UPLOAD_CHECK_FAILED";
    result.checks[failedCheck] = result.status === "unsupported" ? null : false;
    result.summary = result.code === "SAVE_UPLOAD_NATIVE_SIZE_LIMIT" ? "The native copy exceeds the 4 MiB per-file or 8 MiB combined output limit. No copy was returned." : result.status === "unsupported" ? "This SAVE version, compression or size is not supported by the checker." : failedCheck === "integrity" ? "The native SAVE integrity or envelope check did not pass. No repair was attempted." : failedCheck === "structure" ? "The decoded structure is not supported by this checker. No native copy was created." : "The unchanged native copy did not pass re-open validation.";
    return { result };
  }
}
function pairReport(files) {
  if (files.some((file) => file.result.status !== "validated")) return { state: "unverified", message: "Every supplied file must pass its individual checks before companion metadata can be compared." };
  const saves = files.filter((file) => file.identity?.role === "save"), lobbies = files.filter((file) => file.identity?.role === "lobby");
  if (saves.length !== 1 || lobbies.length !== 1) return { state: files.length === 1 ? "companion_missing" : "ambiguous", message: files.length === 1 ? "Choose the matching save and lobby files to compare their companion metadata." : "A unique main save and lobby pair was not identified from the decoded contents." };
  const main = saves[0].identity, lobby = lobbies[0].identity;
  if (main.quest === null || main.mainQuest === null) return { state: "unverified", message: "Both native payloads were recognized, but their quest correspondence could not be established." };
  if (main.quest !== lobby.quest || main.mainQuest !== lobby.mainQuest) return { state: "mismatch", message: "The main save and lobby quest metadata do not agree. Do not use them as a pair." };
  return { state: "partial_match", message: "The main save and lobby quest labels agree. Account, slot, game-version and in-game compatibility remain unverified." };
}
async function inspectUploadedSaves(input) {
  const files = validateUploadedSaveInput(input), inspected = [];
  let remainingNativeBytes = UPLOADED_SAVE_LIMITS.maxNativeTotalBytes;
  for (const file of files) {
    const checked = await inspectFile(file, remainingNativeBytes);
    remainingNativeBytes -= checked.result.nativeCopy?.bytes || 0;
    inspected.push(checked);
  }
  return { schema: "saverift.uploaded-save-report.v1", game: "crimson-desert", source: "user_upload", files: inspected.map((file) => file.result), pair: pairReport(inspected), xboxTransfer: { state: "not_verified", canSend: false, message: "These checks do not establish PC-to-Xbox compatibility. Uploading to an Xbox slot is not enabled for user files." }, originalsUnchanged: true, stored: false, cloudRequests: 0, xboxMutations: 0 };
}
var UPLOADED_SAVE_LIMITS, UploadedSaveError, fail16, exact4, canonicalBase64, lobbyFields, metadataFields, unsupportedCodecCodes, preservedHeader;
var init_uploaded_save = __esm({
  "src/uploaded-save.mjs"() {
    init_buffer();
    init_source_binding();
    init_crimson_codec();
    init_crimson_document();
    UPLOADED_SAVE_LIMITS = Object.freeze({ maxFiles: 2, maxTotalBytes: 4 * 1024 * 1024, maxJsonBytes: 6 * 1024 * 1024, maxDecodedBytes: 8 * 1024 * 1024, maxNativeFileBytes: 4 * 1024 * 1024, maxNativeTotalBytes: 8 * 1024 * 1024 });
    UploadedSaveError = class extends Error {
      constructor(code, message, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
      }
    };
    fail16 = (code, message, status = 400) => {
      throw new UploadedSaveError(code, message, status);
    };
    exact4 = (value2, keys2) => value2 && typeof value2 === "object" && !Array.isArray(value2) && Object.keys(value2).length === keys2.length && keys2.every((key) => Object.hasOwn(value2, key));
    canonicalBase64 = /^[A-Za-z0-9+/]*={0,2}$/;
    lobbyFields = ["_slotDisplayNameMissionKey", "_slotDisplayNameMainQuestKey", "_gameSaveVersion", "_generateNo"];
    metadataFields = /* @__PURE__ */ new Set([...lobbyFields, "_lastCompletedMissionKey", "_lastCompletedMainQuestKey"]);
    unsupportedCodecCodes = /* @__PURE__ */ new Set(["CRIMSON_VERSION_UNSUPPORTED", "CRIMSON_FLAGS_UNSUPPORTED", "CRIMSON_SIZE_LIMIT", "CRIMSON_ROUNDTRIP_SIZE_LIMIT", "SAVE_UPLOAD_NATIVE_SIZE_LIMIT"]);
    preservedHeader = (before, after) => before.every((value2, index) => index >= 18 && index < 74 || value2 === after[index]);
  }
});

// src/preset-pair.mjs
var preset_pair_exports = {};
__export(preset_pair_exports, {
  validateReferencePair: () => validateReferencePair
});
async function validateReferencePair(pair, reference) {
  const fail19 = (code) => {
    throw Object.assign(new Error("The preset pair stopped at its validation gate."), { code });
  };
  if (!pair || Object.keys(pair).sort().join(",") !== "lobby,save" || !reference) fail19("PRESET_REFERENCE_PROVIDER_REQUIRED");
  const payloads = {}, decoded = {};
  for (const name of ["save", "lobby"]) {
    const bytes2 = import_buffer.Buffer.from(pair[name]), pin = reference[name];
    if (!pin || bytes2.length !== pin.bytes || hash(bytes2) !== pin.sha256) fail19("PRESET_REFERENCE_MISMATCH");
    const state2 = await decodeSave(bytes2), scalars = [], document = readDocument(state2.plaintext, { onScalar: (e) => {
      if (name === "lobby") scalars.push({ path: e.path, value: e.value });
    } });
    if (state2.version !== 2 || state2.flags !== 128 || document.schemaSha256 !== pin.schemaSha256 || document.audit.advisoryLocators || document.audit.unconsumedBytes || !(await encodeSave(state2.plaintext, state2.header, { nonce: state2.header.subarray(26, 42) })).equals(bytes2)) fail19("PRESET_REFERENCE_REOPEN_FAILED");
    const reopened = await decodeSave(bytes2);
    if (!reopened.plaintext.equals(state2.plaintext)) fail19("PRESET_REFERENCE_REOPEN_FAILED");
    payloads[name] = { bytes: bytes2.length, sha256: hash(bytes2), plaintextSha256: hash(state2.plaintext), schemaSha256: document.schemaSha256, saveVersion: state2.version, nonzeroListMetadata: document.audit.nonzeroListMetadata, omittedListMarkers: document.audit.omittedListMarkers };
    decoded[name] = name === "save" ? { missionKey: value(document.blocks.find((b) => b.type === "QuestSaveData"), "_lastCompletedMissionKey"), mainQuestKey: value(document.blocks.find((b) => b.type === "QuestSaveData"), "_lastCompletedMainQuestKey") } : Object.fromEntries(scalars.map((e) => [e.path.split(".").at(-1), e.value]));
  }
  const main = decoded.save, lobby = decoded.lobby;
  if (main.missionKey !== reference.missionKey || main.mainQuestKey !== reference.mainQuestKey || lobby._slotDisplayNameMissionKey !== main.missionKey || lobby._slotDisplayNameMainQuestKey !== main.mainQuestKey || lobby._gameSaveVersion !== reference.gameSaveVersion || lobby._generateNo !== reference.generateNo) fail19("PRESET_PAIRED_METADATA_MISMATCH");
  return { payloads, main, lobby, total: pair.save.length + pair.lobby.length };
}
var init_preset_pair = __esm({
  "src/preset-pair.mjs"() {
    init_buffer();
    init_source_binding();
    init_crimson_codec();
    init_crimson_document();
  }
});

// src/document-api.mjs
var document_api_exports = {};
__export(document_api_exports, {
  describeDocument: () => describeDocument,
  patchFixedWidth: () => patchFixedWidth,
  queryDocumentBytes: () => queryDocumentBytes,
  queryDocumentFields: () => queryDocumentFields,
  queryDocumentSchema: () => queryDocumentSchema
});
function describeDocument(document, { typeOffset = 0, typeLimit = 100, rootOffset = 0, rootLimit = 100 } = {}) {
  if ([typeOffset, rootOffset].some((n) => !Number.isSafeInteger(n) || n < 0) || [typeLimit, rootLimit].some((n) => !Number.isSafeInteger(n) || n < 1 || n > 100)) fail17("CRIMSON_DOCUMENT_QUERY_INVALID");
  return { api: "crimson.document", apiVersion: "0.1.0", plaintextSha256: document.plaintextSha256, schemaSha256: document.schemaSha256, byteLength: document.plaintext.length, audit: document.audit, typeCount: document.schema.types.length, types: document.schema.types.slice(typeOffset, typeOffset + typeLimit).map((t) => ({ index: t.index, name: t.name, fieldCount: t.fields.length })), typeOffset, typeLimit, rootCount: document.blocks.length, roots: document.blocks.slice(rootOffset, rootOffset + rootLimit).map((b) => ({ type: b.type, start: b.start, end: b.end })), rootOffset, rootLimit, preservation: "original_bytes_are_authoritative", researchWrites: "experimental_fixed_width_only", hostedAuthorization: "independent_host_validation_required" };
}
function queryDocumentSchema(document, { typeIndex, offset = 0, limit: limit3 = 100 } = {}) {
  if (!Number.isSafeInteger(typeIndex) || !document.schema.types[typeIndex] || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit3) || limit3 < 1 || limit3 > 100) fail17("CRIMSON_DOCUMENT_QUERY_INVALID");
  const type = document.schema.types[typeIndex];
  return { api: "crimson.document.schema", apiVersion: "0.1.0", schemaSha256: document.schemaSha256, typeIndex, name: type.name, fields: type.fields.slice(offset, offset + limit3), offset, limit: limit3, total: type.fields.length, hasMore: offset + limit3 < type.fields.length };
}
function queryDocumentFields(document, { prefix = "", offset = 0, limit: limit3 = 100 } = {}) {
  if (typeof prefix !== "string" || prefix.length > 512 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit3) || limit3 < 1 || limit3 > 100) fail17("CRIMSON_DOCUMENT_QUERY_INVALID");
  const records2 = [];
  let total = 0;
  readDocument(document.plaintext, { captureTypes: [], listLimit: 0, onScalar: (event) => {
    if (!event.path.startsWith(prefix)) return;
    const index = total++;
    if (index >= offset && records2.length < limit3) records2.push({ path: event.path, offset: event.offset, byteLength: event.bytes, type: event.type, present: true, value: event.value, sha256: hash(document.plaintext.subarray(event.offset, event.offset + event.bytes)) });
  } });
  return { api: "crimson.document.fields", apiVersion: "0.1.0", plaintextSha256: document.plaintextSha256, schemaSha256: document.schemaSha256, records: records2, offset, limit: limit3, total, hasMore: offset + records2.length < total };
}
function queryDocumentBytes(document, { offset = 0, length = 256 } = {}) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > 4096 || offset + length > document.plaintext.length) fail17("CRIMSON_DOCUMENT_QUERY_INVALID");
  return { api: "crimson.document.bytes", apiVersion: "0.1.0", plaintextSha256: document.plaintextSha256, schemaSha256: document.schemaSha256, offset, byteLength: length, hex: document.plaintext.subarray(offset, offset + length).toString("hex") };
}
async function patchFixedWidth(encoded, params, { originalDocument, nonce } = {}) {
  if (!exact5(params, ["plaintextSha256", "schemaSha256", "patches"]) || params.plaintextSha256 !== originalDocument?.plaintextSha256 || params.schemaSha256 !== originalDocument?.schemaSha256 || !Array.isArray(params.patches) || params.patches.length < 1 || params.patches.length > 16) fail17("CRIMSON_DOCUMENT_PATCH_BINDING_INVALID");
  const requested = /* @__PURE__ */ new Map(), ranges = [];
  for (const p of params.patches) {
    if (!exact5(p, ["path", "offset", "expectedHex", "replacementHex"]) || typeof p.path !== "string" || !p.path || p.path.length > 512 || requested.has(p.path) || !Number.isSafeInteger(p.offset) || p.offset < 0 || typeof p.expectedHex !== "string" || !/^(?:[a-f0-9]{2}){1,4096}$/.test(p.expectedHex) || typeof p.replacementHex !== "string" || p.replacementHex.length !== p.expectedHex.length || !/^[a-f0-9]+$/.test(p.replacementHex) || p.expectedHex === p.replacementHex) fail17("CRIMSON_DOCUMENT_PATCH_INVALID");
    const end = p.offset + p.expectedHex.length / 2;
    if (ranges.some((r) => p.offset < r.end && end > r.start)) fail17("CRIMSON_DOCUMENT_PATCH_OVERLAP");
    ranges.push({ start: p.offset, end });
    requested.set(p.path, p);
  }
  function checkLocators(raw) {
    const matched = /* @__PURE__ */ new Set();
    readDocument(raw, { captureTypes: [], listLimit: 0, onScalar: (event) => {
      const p = requested.get(event.path);
      if (!p) return;
      if (matched.has(p.path) || event.offset !== p.offset || event.bytes * 2 !== p.expectedHex.length || raw.subarray(event.offset, event.offset + event.bytes).toString("hex") !== p.expectedHex) fail17("CRIMSON_DOCUMENT_PATCH_LOCATOR_CHANGED");
      matched.add(p.path);
    } });
    if (matched.size !== requested.size) fail17("CRIMSON_DOCUMENT_PATCH_NOT_PRESENT_FIXED_SCALAR");
  }
  checkLocators(originalDocument.plaintext);
  const before = await decodeSave(encoded), document = readDocument(before.plaintext, { captureTypes: [], listLimit: 0, onScalar: () => {
  } });
  if (document.schemaSha256 !== params.schemaSha256) fail17("CRIMSON_DOCUMENT_PATCH_SCHEMA_CHANGED");
  checkLocators(before.plaintext);
  const noOp = await encodeSave(before.plaintext, before.header, { nonce: before.header.subarray(26, 42) });
  if (!noOp.equals(encoded)) fail17("CRIMSON_DOCUMENT_PATCH_NATIVE_PARITY_FAILED");
  const patched = import_buffer.Buffer.from(before.plaintext);
  for (const p of requested.values()) import_buffer.Buffer.from(p.replacementHex, "hex").copy(patched, p.offset);
  for (let at = 0; at < patched.length; at++) if (patched[at] !== before.plaintext[at] && !ranges.some((r) => at >= r.start && at < r.end)) fail17("CRIMSON_DOCUMENT_PATCH_UNINTENDED_BYTES");
  const after = readDocument(patched, { captureTypes: [], listLimit: 0, compareTo: before.plaintext, onScalar: () => {
  } });
  if (after.schemaSha256 !== document.schemaSha256 || JSON.stringify(after.audit) !== JSON.stringify(document.audit) || after.decodedDiff.length !== requested.size || after.decodedDiff.some((d) => !params.patches.some((p) => p.path === d.path && p.offset === d.offset && p.expectedHex.length === d.bytes * 2))) fail17("CRIMSON_DOCUMENT_PATCH_UNINTENDED_VALUES");
  const output = await encodeSave(patched, before.header, nonce ? { nonce } : {}), reopened = await decodeSave(output);
  if (!reopened.plaintext.equals(patched)) fail17("CRIMSON_DOCUMENT_PATCH_REOPEN_FAILED");
  readDocument(reopened.plaintext, { captureTypes: [], listLimit: 0 });
  if (!reopened.header.subarray(0, 18).equals(before.header.subarray(0, 18)) || !reopened.header.subarray(74, 128).equals(before.header.subarray(74, 128))) fail17("CRIMSON_DOCUMENT_PATCH_HEADER_CHANGED");
  return { encoded: output, report: { schema: "saverift.crimson-fixed-width-patch.v1", apiVersion: "0.1.0", experimental: true, sourceSha256: hash(encoded), outputSha256: hash(output), beforePlaintextSha256: document.plaintextSha256, afterPlaintextSha256: after.plaintextSha256, schemaSha256: document.schemaSha256, decodedDiff: after.decodedDiff, validation: { matchedPresentTypedScalars: true, allOtherPlaintextBytesUnchanged: true, fullTypedTraversal: true, nativeNoOpByteParity: true, unknownHeaderBytesPreserved: true, hmacReverified: true, encodedOutputReopened: true, omittedListMarkersPreserved: true, nonzeroListMetadataPreserved: true }, entitlementEffects: "unreviewed", requiresIndependentHostInspector: true, gameAcceptance: "unverified", cloudRequests: 0, writesEnabled: false } };
}
var fail17, exact5;
var init_document_api = __esm({
  "src/document-api.mjs"() {
    init_buffer();
    init_source_binding();
    init_crimson_codec();
    init_crimson_document();
    fail17 = (code) => {
      throw new CodecError("The typed document research operation stopped at its reported check.", code);
    };
    exact5 = (v, keys2) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys2.length && keys2.every((k) => Object.hasOwn(v, k));
  }
});

// connector.mjs
init_buffer();
init_crypto();

// ../../sdk/text-encoding.mjs
init_buffer();
function validUtf8(bytes2) {
  for (let i = 0; i < bytes2.length; ) {
    const a = bytes2[i++];
    if (a < 128) continue;
    let needed, min, max;
    if (a >= 194 && a <= 223) {
      needed = 1;
      min = 128;
      max = 191;
    } else if (a >= 224 && a <= 239) {
      needed = 2;
      min = a === 224 ? 160 : 128;
      max = a === 237 ? 159 : 191;
    } else if (a >= 240 && a <= 244) {
      needed = 3;
      min = a === 240 ? 144 : 128;
      max = a === 244 ? 143 : 191;
    } else return false;
    if (i + needed > bytes2.length || bytes2[i] < min || bytes2[i] > max) return false;
    i++;
    for (let j = 1; j < needed; j++) {
      if (bytes2[i] < 128 || bytes2[i] > 191) return false;
      i++;
    }
  }
  return true;
}
var TextEncoder2 = class {
  get encoding() {
    return "utf-8";
  }
  encode(text = "") {
    return new Uint8Array(import_buffer.Buffer.from(String(text), "utf8"));
  }
};
var TextDecoder2 = class {
  constructor(label = "utf-8", { fatal = false, ignoreBOM = false } = {}) {
    if (!["utf-8", "utf8", "unicode-1-1-utf-8"].includes(String(label).trim().toLowerCase())) throw new RangeError("Only UTF-8 is supported.");
    this.fatal = Boolean(fatal);
    this.ignoreBOM = Boolean(ignoreBOM);
  }
  get encoding() {
    return "utf-8";
  }
  decode(input = new Uint8Array(), { stream = false } = {}) {
    if (stream) throw new TypeError("Streaming UTF-8 decoding is not supported.");
    const bytes2 = ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);
    if (bytes2.byteLength >= 4096 && bytes2.byteLength <= 8 * 1024 * 1024 && typeof globalThis.__saveriftUtf8Decode === "function") {
      const literal = globalThis.__saveriftUtf8Decode(bytes2.slice().buffer, this.fatal ? 1 : 0, this.ignoreBOM ? 1 : 0);
      if (literal === null) throw new TypeError("The encoded data is not valid UTF-8.");
      return JSON.parse(literal);
    }
    if (this.fatal && !validUtf8(bytes2)) throw new TypeError("The encoded data is not valid UTF-8.");
    let text = import_buffer.Buffer.from(bytes2).toString("utf8");
    if (!this.ignoreBOM && text.charCodeAt(0) === 65279) text = text.slice(1);
    return text;
  }
};
function installTextEncoding() {
  if (typeof globalThis.TextEncoder === "undefined") globalThis.TextEncoder = TextEncoder2;
  if (typeof globalThis.TextDecoder === "undefined") globalThis.TextDecoder = TextDecoder2;
}

// ../../sdk/schema.mjs
init_crypto();
init_buffer();
var SCHEMA_LIMITS = Object.freeze({ schemaBytes: 128 * 1024, schemaNodes: 4096, schemaDepth: 32, inputBytes: 128 * 1024, inputNodes: 1e4, inputDepth: 32, stringChars: 16384, steps: 2e5, patternChars: 256, patternNodes: 128, patternDepth: 16, patternRepeat: 8192, patternStates: 32768, branches: 16 });
var SchemaError = class extends Error {
  constructor(code) {
    super(code);
    this.name = "SchemaError";
    this.code = code;
  }
};
var fail = (code) => {
  throw new SchemaError(code);
};
var own = (value2, key) => Object.hasOwn(value2, key);
var plain = (value2) => value2 !== null && typeof value2 === "object" && !Array.isArray(value2) && (Object.getPrototypeOf(value2) === Object.prototype || Object.getPrototypeOf(value2) === null);
var types = /* @__PURE__ */ new Set(["null", "boolean", "object", "array", "number", "integer", "string"]);
var keywords = /* @__PURE__ */ new Set(["$schema", "$comment", "$defs", "definitions", "$ref", "title", "description", "default", "examples", "deprecated", "readOnly", "writeOnly", "type", "const", "enum", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern", "format", "minItems", "maxItems", "uniqueItems", "items", "prefixItems", "minProperties", "maxProperties", "required", "properties", "additionalProperties", "dependentRequired", "allOf", "anyOf", "oneOf", "not"]);
function limitsFrom(input = {}) {
  const limits = { ...SCHEMA_LIMITS };
  for (const [key, value2] of Object.entries(input)) {
    if (!own(limits, key) || !Number.isSafeInteger(value2) || value2 < 1 || value2 > limits[key]) fail("SCHEMA_LIMITS_INVALID");
    limits[key] = value2;
  }
  return limits;
}
function boundedJson(input, { bytes: bytes2, nodes, depth, strings }, code) {
  const ancestors = /* @__PURE__ */ new Set();
  let count2 = 0;
  function walk(value2, level) {
    if (++count2 > nodes || level > depth) fail(code + "_LIMIT");
    if (value2 === null || typeof value2 === "boolean") return;
    if (typeof value2 === "string") {
      if (value2.length > bytes2 || strings && Array.from(value2).length > strings) fail(code + "_LIMIT");
      return;
    }
    if (typeof value2 === "number") {
      if (!Number.isFinite(value2) || Number.isInteger(value2) && !Number.isSafeInteger(value2)) fail(code + "_INVALID");
      return;
    }
    if (!Array.isArray(value2) && !plain(value2)) fail(code + "_INVALID");
    if (ancestors.has(value2)) fail(code + "_INVALID");
    ancestors.add(value2);
    try {
      const keys2 = Object.keys(value2);
      if (keys2.length > nodes) fail(code + "_LIMIT");
      if (Array.isArray(value2) && keys2.length !== value2.length) fail(code + "_INVALID");
      for (const key of keys2) {
        if (["__proto__", "constructor", "prototype"].includes(key)) fail(code + "_INVALID");
        const descriptor2 = Object.getOwnPropertyDescriptor(value2, key);
        if (!descriptor2 || !own(descriptor2, "value")) fail(code + "_INVALID");
        walk(descriptor2.value, level + 1);
      }
    } finally {
      ancestors.delete(value2);
    }
  }
  walk(input, 0);
  let text;
  try {
    text = canonicalJson(input);
  } catch {
    fail(code + "_INVALID");
  }
  if (import_buffer.Buffer.byteLength(text) > bytes2) fail(code + "_LIMIT");
  return { copy: JSON.parse(text), text };
}
var unsigned = (text, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!text || text.length > 16 || text.length > 1 && text[0] === "0") return null;
  let value2 = 0;
  for (const c of text) {
    if (c < "0" || c > "9") return null;
    value2 = value2 * 10 + c.charCodeAt(0) - 48;
    if (value2 > max) return null;
  }
  return value2 >= min ? value2 : null;
};
function compilePattern(pattern, limits) {
  if (typeof pattern !== "string" || pattern.length > limits.patternChars || pattern[0] !== "^" || pattern[pattern.length - 1] !== "$") fail("SCHEMA_PATTERN_UNSUPPORTED");
  const source = Array.from(pattern.slice(1, -1));
  let cursor = 0, nodeCount = 0;
  const node = (value2) => {
    if (++nodeCount > limits.patternNodes) fail("SCHEMA_PATTERN_LIMIT");
    return { ...value2, id: nodeCount };
  };
  function character(inside = false) {
    const c = source[cursor++];
    if (c === void 0) fail("SCHEMA_PATTERN_UNSUPPORTED");
    if (c !== "\\") return c;
    const escaped = source[cursor++];
    if (escaped === void 0 || !"^$|?{}()[]-\\.".includes(escaped)) fail("SCHEMA_PATTERN_UNSUPPORTED");
    return escaped;
  }
  function atom(depth) {
    if (depth > limits.patternDepth) fail("SCHEMA_PATTERN_LIMIT");
    const c = source[cursor];
    if (c === "(") {
      cursor++;
      if (source[cursor] === "?") {
        if (source[cursor + 1] !== ":") fail("SCHEMA_PATTERN_UNSUPPORTED");
        cursor += 2;
      }
      const value2 = choice(depth + 1);
      if (source[cursor++] !== ")") fail("SCHEMA_PATTERN_UNSUPPORTED");
      return value2;
    }
    if (c === "[") {
      cursor++;
      const ranges = [];
      if (source[cursor] === "^") fail("SCHEMA_PATTERN_UNSUPPORTED");
      while (cursor < source.length && source[cursor] !== "]") {
        const first = character(true);
        if (first.codePointAt(0) > 127) fail("SCHEMA_PATTERN_UNSUPPORTED");
        let last = first;
        if (source[cursor] === "-" && source[cursor + 1] !== "]") {
          cursor++;
          last = character(true);
          if (last.codePointAt(0) > 127 || last < first) fail("SCHEMA_PATTERN_UNSUPPORTED");
        }
        ranges.push([first.codePointAt(0), last.codePointAt(0)]);
        if (ranges.length > 64) fail("SCHEMA_PATTERN_LIMIT");
      }
      if (source[cursor++] !== "]" || !ranges.length) fail("SCHEMA_PATTERN_UNSUPPORTED");
      return node({ kind: "char", ranges });
    }
    if (c === void 0 || "^$|?{}[])*+.".includes(c)) fail("SCHEMA_PATTERN_UNSUPPORTED");
    const literal = character();
    return node({ kind: "char", ranges: [[literal.codePointAt(0), literal.codePointAt(0)]] });
  }
  function term(depth) {
    let value2 = atom(depth);
    if (source[cursor] === "?") {
      cursor++;
      value2 = node({ kind: "repeat", child: value2, min: 0, max: 1 });
    } else if (source[cursor] === "{") {
      cursor++;
      let first = "";
      while (cursor < source.length && source[cursor] >= "0" && source[cursor] <= "9") first += source[cursor++];
      let last = first;
      if (source[cursor] === ",") {
        cursor++;
        last = "";
        while (cursor < source.length && source[cursor] >= "0" && source[cursor] <= "9") last += source[cursor++];
      }
      const min = unsigned(first, 0, limits.patternRepeat), max = unsigned(last, 0, limits.patternRepeat);
      if (source[cursor++] !== "}" || min === null || max === null || min > max) fail("SCHEMA_PATTERN_UNSUPPORTED");
      value2 = node({ kind: "repeat", child: value2, min, max });
    }
    if (["*", "+", "?", "{"].includes(source[cursor])) fail("SCHEMA_PATTERN_UNSUPPORTED");
    return value2;
  }
  function sequence(depth) {
    const children = [];
    while (cursor < source.length && source[cursor] !== ")" && source[cursor] !== "|") children.push(term(depth));
    return node({ kind: "sequence", children });
  }
  function choice(depth) {
    const children = [sequence(depth)];
    while (source[cursor] === "|") {
      cursor++;
      children.push(sequence(depth));
      if (children.length > limits.branches) fail("SCHEMA_PATTERN_LIMIT");
    }
    return children.length === 1 ? children[0] : node({ kind: "choice", children });
  }
  const root = choice(0);
  if (cursor !== source.length) fail("SCHEMA_PATTERN_UNSUPPORTED");
  return (text, state2) => {
    const chars = Array.from(text), memo = /* @__PURE__ */ new Map();
    function add(set, value2) {
      state2.tick();
      set.add(value2);
    }
    function ends(n, position) {
      state2.tick();
      const key = n.id + ":" + position;
      if (memo.has(key)) return memo.get(key);
      if (memo.size >= limits.patternStates) fail("SCHEMA_WORK_LIMIT");
      const out = /* @__PURE__ */ new Set();
      memo.set(key, out);
      if (n.kind === "char") {
        const point = chars[position]?.codePointAt(0);
        if (point !== void 0 && n.ranges.some(([a, b]) => point >= a && point <= b)) add(out, position + 1);
      } else if (n.kind === "choice") {
        for (const child of n.children) for (const end of ends(child, position)) add(out, end);
      } else if (n.kind === "sequence") {
        let positions = /* @__PURE__ */ new Set([position]);
        for (const child of n.children) {
          const next = /* @__PURE__ */ new Set();
          for (const start of positions) for (const end of ends(child, start)) add(next, end);
          positions = next;
          if (!positions.size) break;
        }
        for (const end of positions) add(out, end);
      } else {
        let positions = /* @__PURE__ */ new Set([position]);
        if (n.min === 0) add(out, position);
        for (let count2 = 1; count2 <= n.max && positions.size; count2++) {
          state2.tick();
          const next = /* @__PURE__ */ new Set();
          for (const start of positions) for (const end of ends(n.child, start)) add(next, end);
          positions = next;
          if (count2 >= n.min) for (const end of positions) add(out, end);
        }
      }
      return out;
    }
    return ends(root, 0).has(chars.length);
  };
}
function formatValidator(format) {
  const hex = (char) => char >= "0" && char <= "9" || char >= "a" && char <= "f";
  const decimal4 = (value2, signed = false) => {
    let text = value2;
    if (signed && text[0] === "-") {
      text = text.slice(1);
      if (text === "0") return false;
    }
    if (!text || text.length > 128 || text.length > 1 && text[0] === "0") return false;
    for (const c of text) if (c < "0" || c > "9") return false;
    return true;
  };
  if (format === "sha256") return (value2) => value2.length === 64 && [...value2].every(hex);
  if (format === "hex") return (value2) => value2.length > 0 && value2.length % 2 === 0 && [...value2].every(hex);
  if (format === "decimal-integer") return (value2) => decimal4(value2, true);
  if (format === "uint64") return (value2) => decimal4(value2) && value2.length <= 20 && BigInt(value2) <= 18446744073709551615n;
  if (format === "int64") return (value2) => decimal4(value2, true) && value2.length <= 20 && BigInt(value2) >= -9223372036854775808n && BigInt(value2) <= 9223372036854775807n;
  if (format === "uuid") return (value2) => value2.length === 36 && [...value2.toLowerCase()].every((c, i) => [8, 13, 18, 23].includes(i) ? c === "-" : hex(c));
  fail("SCHEMA_FORMAT_UNSUPPORTED");
}
function compileSchema(schema, { limits: requestedLimits } = {}) {
  const limits = limitsFrom(requestedLimits), { copy: root, text } = boundedJson(schema, { bytes: limits.schemaBytes, nodes: limits.schemaNodes, depth: limits.schemaDepth }, "SCHEMA"), compiled = /* @__PURE__ */ new Map(), active = /* @__PURE__ */ new Set();
  const bound = (value2, defaultValue) => {
    if (value2 === void 0) return defaultValue;
    if (!Number.isSafeInteger(value2) || value2 < 0) fail("SCHEMA_INVALID");
    return value2;
  };
  const finite = (value2) => {
    if (typeof value2 !== "number" || !Number.isFinite(value2) || Number.isInteger(value2) && !Number.isSafeInteger(value2)) fail("SCHEMA_INVALID");
    return value2;
  };
  function pointer(ref) {
    if (typeof ref !== "string" || ref.length > 512 || !(ref === "#" || ref.startsWith("#/"))) fail("SCHEMA_REF_UNSUPPORTED");
    let node = root;
    if (ref === "#") return node;
    for (const encoded of ref.slice(2).split("/")) {
      let key = "";
      for (let i = 0; i < encoded.length; i++) {
        if (encoded[i] !== "~") key += encoded[i];
        else {
          const next = encoded[++i];
          if (next !== "0" && next !== "1") fail("SCHEMA_REF_UNSUPPORTED");
          key += next === "0" ? "~" : "/";
        }
      }
      if (!node || typeof node !== "object" || !own(node, key)) fail("SCHEMA_REF_UNRESOLVED");
      node = node[key];
    }
    return node;
  }
  function compile(node, depth = 0) {
    if (depth > limits.schemaDepth) fail("SCHEMA_LIMIT");
    if (typeof node === "boolean") return (_value, state2) => {
      state2.tick();
      return node;
    };
    if (!plain(node)) fail("SCHEMA_INVALID");
    if (active.has(node)) fail("SCHEMA_REF_CYCLE");
    if (compiled.has(node)) return compiled.get(node);
    active.add(node);
    for (const key of Object.keys(node)) if (!keywords.has(key)) fail("SCHEMA_KEYWORD_UNSUPPORTED");
    if (own(node, "$schema") && !["https://json-schema.org/draft/2020-12/schema", "http://json-schema.org/draft/2020-12/schema"].includes(node.$schema)) fail("SCHEMA_DIALECT_UNSUPPORTED");
    for (const key of ["$comment", "title", "description"]) if (own(node, key) && typeof node[key] !== "string") fail("SCHEMA_INVALID");
    for (const key of ["deprecated", "readOnly", "writeOnly"]) if (own(node, key) && typeof node[key] !== "boolean") fail("SCHEMA_INVALID");
    if (own(node, "examples") && !Array.isArray(node.examples)) fail("SCHEMA_INVALID");
    for (const key of ["$defs", "definitions"]) if (own(node, key)) {
      if (!plain(node[key])) fail("SCHEMA_INVALID");
      for (const child of Object.values(node[key])) compile(child, depth + 1);
    }
    const typeList = own(node, "type") ? Array.isArray(node.type) ? node.type : [node.type] : null;
    if (typeList && (!typeList.length || typeList.length > 7 || new Set(typeList).size !== typeList.length || typeList.some((type) => !types.has(type)))) fail("SCHEMA_INVALID");
    const reference = own(node, "$ref") ? compile(pointer(node.$ref), depth + 1) : null;
    let enumeration = null;
    if (own(node, "enum")) {
      if (!Array.isArray(node.enum) || !node.enum.length || node.enum.length > 128) fail("SCHEMA_INVALID");
      enumeration = new Set(node.enum.map(canonicalJson));
      if (enumeration.size !== node.enum.length) fail("SCHEMA_INVALID");
    }
    const constant = own(node, "const") ? canonicalJson(node.const) : null, pattern = own(node, "pattern") ? compilePattern(node.pattern, limits) : null, format = own(node, "format") ? formatValidator(node.format) : null;
    for (const key of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]) if (own(node, key)) finite(node[key]);
    if (own(node, "multipleOf") && (!Number.isSafeInteger(node.multipleOf) || node.multipleOf <= 0)) fail("SCHEMA_MULTIPLE_UNSUPPORTED");
    const minLength = bound(node.minLength, 0), maxLength = bound(node.maxLength, Infinity), minItems = bound(node.minItems, 0), maxItems = bound(node.maxItems, Infinity), minProperties = bound(node.minProperties, 0), maxProperties = bound(node.maxProperties, Infinity);
    if (minLength > maxLength || minItems > maxItems || minProperties > maxProperties) fail("SCHEMA_INVALID");
    const properties = /* @__PURE__ */ new Map();
    if (own(node, "properties")) {
      if (!plain(node.properties) || Object.keys(node.properties).length > 128) fail("SCHEMA_INVALID");
      for (const [key, child] of Object.entries(node.properties)) properties.set(key, compile(child, depth + 1));
    }
    const additional = own(node, "additionalProperties") ? compile(node.additionalProperties, depth + 1) : null;
    function names(value2) {
      if (!Array.isArray(value2) || value2.length > 128 || new Set(value2).size !== value2.length || value2.some((x) => typeof x !== "string" || !x || x.length > 128)) fail("SCHEMA_INVALID");
      return value2;
    }
    const required = own(node, "required") ? names(node.required) : [], dependencies = /* @__PURE__ */ new Map();
    if (own(node, "dependentRequired")) {
      if (!plain(node.dependentRequired)) fail("SCHEMA_INVALID");
      for (const [key, value2] of Object.entries(node.dependentRequired)) dependencies.set(key, names(value2));
    }
    const items2 = own(node, "items") ? compile(node.items, depth + 1) : null, prefix = [];
    if (own(node, "prefixItems")) {
      if (!Array.isArray(node.prefixItems) || node.prefixItems.length > 128) fail("SCHEMA_INVALID");
      for (const child of node.prefixItems) prefix.push(compile(child, depth + 1));
    }
    if (own(node, "uniqueItems") && typeof node.uniqueItems !== "boolean") fail("SCHEMA_INVALID");
    const branches = {};
    for (const key of ["allOf", "anyOf", "oneOf"]) if (own(node, key)) {
      if (!Array.isArray(node[key]) || !node[key].length || node[key].length > limits.branches) fail("SCHEMA_INVALID");
      branches[key] = node[key].map((child) => compile(child, depth + 1));
    }
    const not = own(node, "not") ? compile(node.not, depth + 1) : null;
    const result = (value2, state2) => {
      state2.tick();
      if (reference && !reference(value2, state2)) return false;
      if (typeList && !typeList.some((type) => type === "null" ? value2 === null : type === "array" ? Array.isArray(value2) : type === "object" ? plain(value2) : type === "integer" ? typeof value2 === "number" && Number.isSafeInteger(value2) : typeof value2 === type)) return false;
      if ((constant !== null || enumeration) && !state2.matches(value2, constant, enumeration)) return false;
      if (typeof value2 === "number") {
        if (own(node, "minimum") && value2 < node.minimum || own(node, "maximum") && value2 > node.maximum || own(node, "exclusiveMinimum") && value2 <= node.exclusiveMinimum || own(node, "exclusiveMaximum") && value2 >= node.exclusiveMaximum || own(node, "multipleOf") && value2 % node.multipleOf !== 0) return false;
      }
      if (typeof value2 === "string") {
        const length = Array.from(value2).length;
        state2.tick(length);
        if (length < minLength || length > maxLength || pattern && !pattern(value2, state2) || format && !format(value2)) return false;
      }
      if (Array.isArray(value2)) {
        if (value2.length < minItems || value2.length > maxItems) return false;
        const unique = node.uniqueItems ? /* @__PURE__ */ new Set() : null;
        for (let i = 0; i < value2.length; i++) {
          state2.tick();
          if (unique) {
            const key = state2.fingerprint(value2[i]);
            if (unique.has(key)) return false;
            unique.add(key);
          }
          const child = i < prefix.length ? prefix[i] : items2;
          if (child && !child(value2[i], state2)) return false;
        }
      } else if (plain(value2)) {
        const keys2 = Object.keys(value2);
        if (keys2.length < minProperties || keys2.length > maxProperties || required.some((key) => !own(value2, key))) return false;
        for (const [key, names2] of dependencies) if (own(value2, key) && names2.some((name) => !own(value2, name))) return false;
        for (const key of keys2) {
          state2.tick();
          const child = properties.get(key) || additional;
          if (child && !child(value2[key], state2)) return false;
        }
      }
      if (branches.allOf && !branches.allOf.every((child) => child(value2, state2))) return false;
      if (branches.anyOf && !branches.anyOf.some((child) => child(value2, state2))) return false;
      if (branches.oneOf) {
        let matched = 0;
        for (const child of branches.oneOf) if (child(value2, state2) && ++matched > 1) return false;
        if (matched !== 1) return false;
      }
      if (not && not(value2, state2)) return false;
      return true;
    };
    active.delete(node);
    compiled.set(node, result);
    return result;
  }
  const check = compile(root), schemaDigest = sha2562(text);
  function validate2(value2) {
    const { copy: copy2 } = boundedJson(value2, { bytes: limits.inputBytes, nodes: limits.inputNodes, depth: limits.inputDepth, strings: limits.stringChars }, "SCHEMA_INPUT");
    let steps = 0;
    const objects = /* @__PURE__ */ new WeakMap(), state2 = { tick(cost = 1) {
      steps += cost;
      if (steps > limits.steps) fail("SCHEMA_WORK_LIMIT");
    }, fingerprint(value3) {
      if (value3 && typeof value3 === "object" && objects.has(value3)) return objects.get(value3);
      const text2 = canonicalJson(value3);
      state2.tick(text2.length);
      if (value3 && typeof value3 === "object") objects.set(value3, text2);
      return text2;
    }, matches(value3, constant, enumeration) {
      const key = state2.fingerprint(value3);
      return (constant === null || key === constant) && (!enumeration || enumeration.has(key));
    } };
    return check(copy2, state2);
  }
  return Object.freeze({ schemaDigest, validate: validate2, assert(value2) {
    if (!validate2(value2)) fail("SCHEMA_VALUE_INVALID");
    return value2;
  } });
}

// manifest.json
var manifest_default = {
  manifestVersion: "0.1",
  id: "saverift.crimson-desert",
  kind: "game",
  version: "0.1.0-dev.1",
  displayName: "Crimson Desert",
  license: "MPL-2.0 AND BSD-2-Clause AND BSD-3-Clause AND MIT AND Apache-2.0",
  hostApi: ">=0.1.0 <0.2.0",
  entrypoints: {
    runtime: "runtime/connector.mjs",
    runtimeProfile: "isolated-js-v1",
    ui: "ui/index.html"
  },
  uiMode: "custom",
  gameTargets: [
    {
      platform: "xbox",
      identityRef: "1754076455",
      saveFamilies: [
        "crimson-save-parc"
      ]
    }
  ],
  extensionApis: {
    "crimson.document": "0.1.0"
  },
  permissions: [
    "bundle.read-selected",
    "draft.transform-selected",
    "ui.register-views",
    "ui.request-file-import",
    "ui.request-download"
  ],
  operations: [
    {
      id: "crimson.inventory.setQuantity",
      apiVersion: "0.1.0",
      inputSchema: {
        type: "object",
        required: [
          "inventoryKey",
          "definitionKey",
          "instanceId",
          "slot",
          "expectedValue",
          "desiredValue"
        ],
        additionalProperties: false,
        properties: {
          inventoryKey: {
            type: "integer",
            minimum: 0,
            maximum: 65535
          },
          definitionKey: {
            type: "integer",
            minimum: 1,
            maximum: 4294967295
          },
          instanceId: {
            type: "string",
            pattern: "^[1-9][0-9]{0,19}$"
          },
          slot: {
            type: "integer",
            minimum: 0,
            maximum: 65535
          },
          expectedValue: {
            type: "string",
            pattern: "^(0|[1-9][0-9]{0,19})$"
          },
          desiredValue: {
            type: "string",
            pattern: "^(0|[1-9][0-9]{0,19})$"
          }
        }
      },
      writeDomains: [
        {
          path: "inventory",
          mode: "ordered"
        }
      ]
    },
    {
      id: "crimson.inventory.setCopper",
      apiVersion: "0.1.0",
      inputSchema: {
        type: "object",
        required: [
          "inventoryKey",
          "definitionKey",
          "instanceId",
          "slot",
          "expectedValue",
          "desiredValue"
        ],
        additionalProperties: false,
        properties: {
          inventoryKey: {
            type: "integer",
            minimum: 0,
            maximum: 65535
          },
          definitionKey: {
            type: "integer",
            minimum: 1,
            maximum: 4294967295
          },
          instanceId: {
            type: "string",
            pattern: "^[1-9][0-9]{0,19}$"
          },
          slot: {
            type: "integer",
            minimum: 0,
            maximum: 65535
          },
          expectedValue: {
            type: "string",
            pattern: "^(0|[1-9][0-9]{0,19})$"
          },
          desiredValue: {
            type: "string",
            pattern: "^(0|[1-9][0-9]{0,19})$"
          }
        }
      },
      writeDomains: [
        {
          path: "inventory",
          mode: "ordered"
        }
      ]
    },
    {
      id: "crimson.inventory.setExpansionValue",
      apiVersion: "0.1.0",
      inputSchema: {
        type: "object",
        required: [
          "inventoryKey",
          "expectedValue",
          "desiredValue"
        ],
        additionalProperties: false,
        properties: {
          inventoryKey: {
            const: 2
          },
          expectedValue: {
            type: "string",
            pattern: "^(0|[1-9][0-9]{0,19})$"
          },
          desiredValue: {
            type: "string",
            pattern: "^(0|[1-9][0-9]{0,19})$"
          }
        }
      },
      writeDomains: [
        {
          path: "inventory",
          mode: "ordered"
        }
      ]
    },
    {
      id: "crimson.inventory.addItem",
      apiVersion: "0.1.0",
      inputSchema: {
        type: "object",
        required: [
          "definitionKey",
          "quantity"
        ],
        additionalProperties: false,
        properties: {
          definitionKey: {
            type: "integer",
            minimum: 1,
            maximum: 4294967295
          },
          quantity: {
            type: "string",
            pattern: "^[1-9][0-9]{0,19}$"
          }
        }
      },
      writeDomains: [
        {
          path: "inventory",
          mode: "ordered"
        }
      ]
    },
    {
      id: "crimson.companions.add",
      apiVersion: "0.1.0",
      inputSchema: {
        type: "object",
        required: [
          "characterKey"
        ],
        additionalProperties: false,
        properties: {
          characterKey: {
            type: "integer",
            minimum: 1,
            maximum: 4294967295
          }
        }
      },
      writeDomains: [
        {
          path: "companions",
          mode: "ordered"
        }
      ]
    },
    {
      id: "crimson.cartography.reveal-map",
      apiVersion: "0.1.0",
      inputSchema: {
        type: "object",
        required: [],
        additionalProperties: false,
        properties: {}
      },
      writeDomains: [
        {
          path: "cartography",
          mode: "ordered"
        }
      ]
    },
    {
      id: "crimson.cartography.unlock-nexus",
      apiVersion: "0.1.0",
      inputSchema: {
        type: "object",
        required: [],
        additionalProperties: false,
        properties: {}
      },
      writeDomains: [
        {
          path: "cartography",
          mode: "ordered"
        }
      ]
    },
    {
      id: "crimson.preset.replaceAdventure",
      apiVersion: "0.1.0",
      inputSchema: {
        type: "object",
        required: [
          "presetId",
          "saveArtifactId",
          "lobbyArtifactId"
        ],
        additionalProperties: false,
        properties: {
          presetId: {
            type: "string",
            maxLength: 100
          },
          saveArtifactId: {
            type: "string",
            maxLength: 128
          },
          lobbyArtifactId: {
            type: "string",
            maxLength: 128
          }
        }
      },
      writeDomains: [
        {
          path: "preset",
          mode: "ordered"
        }
      ]
    },
    {
      id: "crimson.document.patchFixedWidth",
      apiVersion: "0.1.0",
      inputSchema: {
        type: "object",
        required: [
          "plaintextSha256",
          "schemaSha256",
          "patches"
        ],
        additionalProperties: false,
        properties: {
          plaintextSha256: {
            type: "string",
            pattern: "^[a-f0-9]{64}$"
          },
          schemaSha256: {
            type: "string",
            pattern: "^[a-f0-9]{64}$"
          },
          patches: {
            type: "array",
            minItems: 1,
            maxItems: 16,
            items: {
              type: "object",
              required: [
                "path",
                "offset",
                "expectedHex",
                "replacementHex"
              ],
              additionalProperties: false,
              properties: {
                path: {
                  type: "string",
                  minLength: 1,
                  maxLength: 512
                },
                offset: {
                  type: "integer",
                  minimum: 0,
                  maximum: 8388608
                },
                expectedHex: {
                  type: "string",
                  pattern: "^(?:[a-f0-9]{2}){1,4096}$"
                },
                replacementHex: {
                  type: "string",
                  pattern: "^(?:[a-f0-9]{2}){1,4096}$"
                }
              }
            }
          }
        }
      },
      writeDomains: [
        {
          path: "document",
          mode: "ordered"
        }
      ],
      experimental: true,
      entitlementEffects: "unreviewed",
      requiresIndependentHostInspector: true
    }
  ],
  entitlementPolicy: "host-enforced-no-bypass",
  dataDistribution: "external-provider-required-pending-rights-review",
  migrationState: "offline-shadow-control-live-canary-pending",
  workbench: {
    defaultQuery: {
      method: "crimson.inspect"
    },
    inputOnlyRoles: [
      "reference-data",
      "preset-source"
    ]
  },
  ui: {
    script: "ui/dist/entry.js",
    css: "ui/dist/style.css",
    body: "ui/index.html"
  },
  views: [
    {
      id: "crimson.explorer",
      title: "Your adventure, your way.",
      kind: "custom",
      entrypoint: "ui/index.html"
    },
    {
      id: "crimson.presets",
      title: "Another way into Pywel.",
      kind: "custom",
      entrypoint: "ui/index.html"
    },
    {
      id: "crimson.import",
      title: "Bring your save along.",
      kind: "custom",
      entrypoint: "ui/index.html",
      advancedOnly: true
    }
  ],
  extensionApiDefinitions: {
    "crimson.document": {
      apiVersion: "0.1.0",
      queries: [
        "crimson.document",
        "crimson.document.schema",
        "crimson.document.fields",
        "crimson.document.bytes"
      ],
      operation: "crimson.document.patchFixedWidth",
      scope: "selected immutable typed PARC document",
      stability: "experimental typed locator API; save schema is not stable",
      publication: "independent trusted host validation required"
    }
  }
};

// connector.mjs
init_data_provider();
init_source_binding();
installTextEncoding();
if (typeof globalThis.structuredClone !== "function") globalThis.structuredClone = (value2) => JSON.parse(JSON.stringify(value2));
var fail18 = (code, message = code) => {
  throw Object.assign(new Error(message), { code });
};
var states = /* @__PURE__ */ new Map();
var initialized = false;
var runtime;
var cachedOpen;
var operationValidators = /* @__PURE__ */ new Map();
var operationNames = ["inventory.setQuantity", "inventory.setCopper", "inventory.setExpansionValue", "inventory.addItem", "companions.add", "cartography.reveal-map", "cartography.unlock-nexus", "preset.replaceAdventure", "document.patchFixedWidth"];
async function load(bundle, ctx) {
  if (!initialized) {
    const providers = [], expected = [];
    for (const a of bundle.artifacts.filter((a2) => a2.role === "reference-data")) {
      const id2 = a.logicalPath.split("/").at(-1), descriptor2 = ctx.catalogQuery({ method: "saverift.data.resource", id: id2, artifactId: a.id }), pin = (ctx.executionLock.dataPacks || []).find((p) => p.id === descriptor2?.package?.id && p.version === descriptor2.package.version && p.digest === descriptor2.package.digest);
      if (!pin || descriptor2.resource?.sha256 !== a.sha256 || descriptor2.resource?.byteLength !== a.byteLength || descriptor2.resource?.id !== id2) fail18("DATA_PROVIDER_LOCK_REQUIRED", "Every reference provider must resolve from a data package pinned by the execution lock.");
      providers.push({ id: id2, artifactId: a.id, sha256: a.sha256, byteLength: a.byteLength, read: () => ctx.readArtifact(a.id) });
      expected.push({ id: id2, sha256: a.sha256, byteLength: a.byteLength });
    }
    configureDataProviders(providers, { expected, verifiedArtifacts: bundle.artifacts });
    initialized = true;
  }
  if (!runtime) {
    const [codec, document] = await Promise.all([Promise.resolve().then(() => (init_crimson_codec(), crimson_codec_exports)), Promise.resolve().then(() => (init_crimson_document(), crimson_document_exports))]);
    runtime = { ...codec, ...document };
  }
  return runtime;
}
async function subsystem(name) {
  const imports = { domain: () => Promise.resolve().then(() => (init_crimson_domain(), crimson_domain_exports)), operations: () => Promise.resolve().then(() => (init_mixed_draft(), mixed_draft_exports)), packs: () => Promise.resolve().then(() => (init_crimson_packs2(), crimson_packs_exports2)), recipes: () => Promise.resolve().then(() => (init_crimson_packs(), crimson_packs_exports)), presets: () => Promise.resolve().then(() => (init_preset_library(), preset_library_exports)), upload: () => Promise.resolve().then(() => (init_uploaded_save(), uploaded_save_exports)), pair: () => Promise.resolve().then(() => (init_preset_pair(), preset_pair_exports)), document: () => Promise.resolve().then(() => (init_document_api(), document_api_exports)) };
  const module = await imports[name]();
  Object.assign(runtime, module);
  return runtime;
}
async function inspectUploadedBundle(bundle, ctx) {
  await load(bundle, ctx);
  const files = bundle.artifacts.filter((a) => !["reference-data", "preset-source"].includes(a.role)).map((a) => ({ name: a.logicalPath.split("/").at(-1), dataBase64: import_buffer.Buffer.from(ctx.readArtifact(a.id)).toString("base64") })), report = await (await subsystem("upload")).inspectUploadedSaves({ game: "crimson-desert", files });
  for (let index = 0; index < report.files.length; index++) {
    const file = report.files[index], copy2 = file.nativeCopy;
    if (!copy2) continue;
    if (file.status !== "validated" || typeof copy2.dataBase64 !== "string") fail18("CRIMSON_IMPORT_EXPORT_INVALID");
    const bytes2 = import_buffer.Buffer.from(copy2.dataBase64, "base64");
    if (bytes2.length !== copy2.bytes || bytes2.toString("base64") !== copy2.dataBase64 || hash(bytes2) !== copy2.sha256 || !/^native-[A-Za-z0-9._ -]+\.save$/.test(copy2.filename)) fail18("CRIMSON_IMPORT_EXPORT_INVALID");
    const artifact = ctx.writeArtifact({ logicalPath: `exports/${index + 1}-${copy2.filename}`, role: "native-export" }, bytes2);
    if (artifact.byteLength !== copy2.bytes || artifact.sha256 !== copy2.sha256 || artifact.role !== "native-export") fail18("CRIMSON_IMPORT_EXPORT_INVALID");
    file.nativeCopy = { filename: copy2.filename, bytes: copy2.bytes, sha256: copy2.sha256, artifact };
  }
  return { ...report, nativeCopyDelivery: "binary_artifact" };
}
async function compilerFor(document, operations) {
  const kind = operations.some((o) => o.operation.startsWith("cartography.")) ? "mixed" : operations.some((o) => ["inventory.addItem", "companions.add"].includes(o.operation)) ? "structural" : "scalar", profiles = getData("crimson-schema-profiles.json").profiles, matching = profiles?.filter((p) => p.schemaSha256 === document.schemaSha256) || [], scalar = await Promise.resolve().then(() => (init_crimson_draft(), crimson_draft_exports));
  const schemas = { mixed: "saveglass.mixed-draft-plan.v1", structural: "saveglass.structural-draft-plan.v1", scalar: "saveglass.crimson-draft-plan.v1" };
  if (matching.length > 1 || matching.length === 1 && (typeof matching[0].requiresHousing !== "boolean" || !["synthetic_conformance", "offline_reviewed"].includes(matching[0].evidence))) fail18("CRIMSON_SCHEMA_PROFILE_INVALID");
  const pin = matching[0], scalarBase = pin ? scalar.createCrimsonDraftCompiler({ schemaPins: [{ schemaSha256: pin.schemaSha256, requiresHousing: pin.requiresHousing }] }) : null, scalarCompiler = scalarBase ? (b, m, p, o) => scalarBase(b, m, p, { ...o, retainEncoded: true }) : scalar.createWorkbenchDraft;
  if (kind === "scalar") return { schema: schemas.scalar, compile: scalarCompiler };
  const structure = await Promise.resolve().then(() => (init_structural_draft(), structural_draft_exports));
  if (!pin) {
    if (kind === "mixed") await subsystem("operations");
    return { schema: schemas[kind], compile: kind === "mixed" ? runtime.createMixedWorkbenchDraft : structure.createStructuralWorkbenchDraft };
  }
  const schemaPins = [pin.schemaSha256], item = await Promise.resolve().then(() => (init_crimson_item_addition(), crimson_item_addition_exports)), items2 = item.createCatalogItemAddition({ schemaPins }), companions2 = async (...args) => (await Promise.resolve().then(() => (init_crimson_companion_addition(), crimson_companion_addition_exports))).createCompanionAdditions({ schemaPins })(...args), structuralBase = structure.createStructuralDraftCompiler({ schemaPins, scalarCompiler, itemCompiler: items2.many, companionCompiler: companions2 }), structuralCompiler = (b, m, p, o) => structuralBase(b, m, p, { ...o, retainEncoded: true });
  if (kind === "structural") return { schema: schemas.structural, compile: structuralCompiler };
  const [map, nexus2] = await Promise.all([Promise.resolve().then(() => (init_crimson_map_reveal(), crimson_map_reveal_exports)), Promise.resolve().then(() => (init_crimson_abyss_nexus(), crimson_abyss_nexus_exports))]);
  await subsystem("operations");
  const mixed = runtime.createMixedDraftCompiler({ schemaPins, scalarCompiler, structuralCompiler, mapCompiler: map.createMapRevealPreview({ schemaPins }), nexusCompiler: nexus2.createAbyssNexusPreview({ schemaPins }) });
  return { schema: schemas.mixed, compile: (b, m, p, o) => mixed(b, m, p, { ...o, retainEncoded: true }) };
}
function mainArtifact(bundle) {
  const explicit = bundle.artifacts.filter((a) => ["main", "save"].includes(a.role)), rows2 = explicit.length ? explicit : bundle.artifacts.filter((a) => !["reference-data", "preset-source"].includes(a.role) && a.logicalPath.split("/").at(-1) === "save");
  if (rows2.length !== 1) fail18("CRIMSON_MAIN_AMBIGUOUS", "Select exactly one main save.");
  return rows2[0];
}
async function opened(bundle, ctx) {
  const binding = canonicalJson(bundle);
  if (cachedOpen?.context === ctx && cachedOpen.binding === binding) return cachedOpen.value;
  cachedOpen = null;
  const r = await load(bundle, ctx), mapped = sourceFromBundle(bundle, ctx, { lazy: true }), a = mainArtifact(bundle), decoded = await r.decodeSave(import_buffer.Buffer.from(ctx.readArtifact(a.id))), document = r.readDocument(decoded.plaintext, { fieldListLimits: { "InventoryElementSaveData._itemList": 1024, "MercenaryClanSaveData._mercenaryDataList": 1e3 } }), domains = (await subsystem("domain")).normalizeCrimson(document, { saveVersion: decoded.version }), container = [...mapped.ids].find(([, d]) => d.id === a.id)?.[0].replace(/\/save$/, "");
  const value2 = { bundle, metadata: mapped.metadata, ids: mapped.ids, get source() {
    return mapped.source;
  }, artifact: a, container, decoded, document, domains };
  cachedOpen = { context: ctx, binding, value: value2 };
  return value2;
}
async function compilerSnapshot(bundle, ctx, operations) {
  const r = await load(bundle, ctx), mapped = sourceFromBundle(bundle, ctx, { lazy: true }), artifact = mainArtifact(bundle), decoded = await r.decodeSave(import_buffer.Buffer.from(ctx.readArtifact(artifact.id))), structural = operations.some((o) => ["inventory.addItem", "companions.add"].includes(o.operation)), projection = { captureTypes: ["InventorySaveData", ...operations.some((o) => o.operation === "companions.add") ? ["MercenaryClanSaveData"] : []], fieldListLimits: { "InventoryElementSaveData._itemList": 1024 } }, document = structural ? (await Promise.resolve().then(() => (init_structural_draft(), structural_draft_exports))).prepareStructuralDocument(decoded.plaintext, operations) : r.readDocument(decoded.plaintext, projection), container = [...mapped.ids].find(([, d]) => d.id === artifact.id)?.[0].replace(/\/save$/, "");
  await subsystem("domain");
  return { metadata: mapped.metadata, get source() {
    return mapped.source;
  }, artifact, container, decoded, document, projection };
}
async function checkedEnvelope(bundle, ctx) {
  sourceFromBundle(bundle, ctx, { lazy: true });
  const r = await load(bundle, ctx), artifact = mainArtifact(bundle), bytes2 = import_buffer.Buffer.from(ctx.readArtifact(artifact.id)), decoded = await r.decodeSave(bytes2), document = r.readDocument(decoded.plaintext, { captureTypes: [], listLimit: 0, hashPlaintext: false });
  return { artifact, bytes: bytes2, decoded, schemaSha256: document.schemaSha256 };
}
async function originalWitness(bundle, ctx) {
  const source = await checkedEnvelope(bundle, ctx);
  return { header: source.decoded.header, schemaSha256: source.schemaSha256 };
}
var page = (rows2, q = {}) => {
  const offset = Number.isSafeInteger(q.offset) && q.offset >= 0 ? q.offset : 0, limit3 = Number.isSafeInteger(q.limit) ? Math.max(1, Math.min(q.limit, 100)) : 35;
  return { records: rows2.slice(offset, offset + limit3), offset, limit: limit3, total: rows2.length, hasMore: offset + limit3 < rows2.length };
};
function summary(s) {
  return { schema: "saverift.crimson-open.v1", id: s.bundle.bundleDigest, container: s.container, artifact: s.artifact, saveVersion: s.decoded.version, schemaSha256: s.document.schemaSha256, plaintextSha256: s.document.plaintextSha256, decoderRevision: s.domains.decoderRevision, catalogRevision: s.domains.catalog.revisionId, inventoryRecords: s.domains.inventory.recordCount, companions: s.domains.companions.length, providers: dataProviderStatus(), liveAccount: false };
}
function stateFor(handle) {
  const s = states.get(handle?.id);
  if (!s) fail18("CRIMSON_DOCUMENT_CLOSED", "Open this save in the current isolated session.");
  return s;
}
function plainOperation(op) {
  if (op?.apiVersion !== "0.1.0" || typeof op.id !== "string" || !op.id.startsWith("crimson.") || !operationNames.includes(op.id.slice(8)) || !op.params || typeof op.params !== "object" || Array.isArray(op.params) || Object.hasOwn(op.params, "operation")) fail18("CRIMSON_OPERATION_UNSUPPORTED");
  let validator = operationValidators.get(op.id);
  if (!validator) {
    const definition = manifest_default.operations.find((d) => d.id === op.id && d.apiVersion === op.apiVersion);
    if (!definition?.inputSchema) fail18("CRIMSON_OPERATION_SCHEMA_MISSING");
    validator = compileSchema(definition.inputSchema);
    operationValidators.set(op.id, validator);
  }
  if (!validator.validate(op.params)) fail18("CRIMSON_OPERATION_PARAMS_INVALID");
  return { operation: op.id.slice(8), ...op.params };
}
var inspectChecks = () => [{ checkId: "crimson.integrity", result: "passed", required: true }, { checkId: "crimson.full-typed-traversal", result: "passed", required: true }, { checkId: "crimson.native-encode-reopen", result: "passed", required: true }];
var connector_default = {
  async detect(bundle, ctx) {
    if (bundle.hints?.gameIdentity && !["crimson-desert", "1754076455", "xbox.1754076455"].includes(bundle.hints.gameIdentity)) return { state: "not_a_match" };
    let a;
    try {
      a = mainArtifact(bundle);
    } catch (e) {
      return { state: "recognized_unsupported", reason: e.code };
    }
    const head = import_buffer.Buffer.from(ctx.readArtifact(a.id, { offset: 0, length: Math.min(128, a.byteLength) }));
    if (head.subarray(0, 4).toString() !== "SAVE") return { state: "not_a_match" };
    try {
      const s = await opened(bundle, ctx);
      return { state: "supported", family: "crimson-save-parc", saveVersion: s.decoded.version, schemaSha256: s.document.schemaSha256, requiredRoles: ["main", "sidecar"], mutationCompatibility: "operation_and_schema_specific" };
    } catch (e) {
      return { state: "recognized_unsupported", reason: e.code || "CRIMSON_FORMAT_INVALID" };
    }
  },
  async open(bundle, ctx) {
    const s = await opened(bundle, ctx);
    states.set(bundle.bundleDigest, s);
    return summary(s);
  },
  describe() {
    return { domainApis: { "crimson.document": "0.1.0" }, operations: operationNames.map((n) => ({ id: "crimson." + n, apiVersion: "0.1.0", writeDomains: [{ path: n.split(".")[0], mode: "ordered" }], ...n.startsWith("document.") ? { experimental: true, entitlementEffects: "unreviewed", requiresIndependentHostInspector: true } : {} })), documentQueries: ["crimson.document", "crimson.document.schema", "crimson.document.fields", "crimson.document.bytes"], views: [{ id: "upgrades", mode: "custom" }, { id: "inventory", mode: "custom" }, { id: "companions", mode: "custom" }, { id: "cartography", mode: "custom" }, { id: "progress", mode: "custom" }, { id: "presets", mode: "custom" }, { id: "advanced-import", mode: "custom", advanced: true }], unavailable: ["treasure-reveal", "teleport", "story-edit"], publication: "trusted-host-only" };
  },
  async query(handle, q, ctx) {
    if (q?.method === "crimson.import.inspect" && Array.isArray(handle?.artifacts)) return inspectUploadedBundle(handle, ctx);
    const s = stateFor(handle), r = runtime, p = q?.params || q?.args || q || {};
    if (q.method === "crimson.document") return (await subsystem("document")).describeDocument(s.document, p);
    if (q.method === "crimson.document.schema") return (await subsystem("document")).queryDocumentSchema(s.document, p);
    if (q.method === "crimson.document.fields") return (await subsystem("document")).queryDocumentFields(s.document, p);
    if (q.method === "crimson.document.bytes") return (await subsystem("document")).queryDocumentBytes(s.document, p);
    if (q.method === "crimson.inspect") return { schema: "saverift.crimson-inspection.v1", ...summary(s), domains: s.domains };
    if (q.method === "crimson.explorer") return { game: { titleId: "1754076455", name: "Crimson Desert", key: "1754076455" }, backup: { id: s.bundle.id, sha256: s.bundle.bundleDigest, complete: true }, report: { schema: "saveglass.backup-inspection.v1", backupId: s.bundle.id, backupSha256: s.bundle.bundleDigest, backupRevision: s.bundle.bundleDigest, payloads: [{ container: s.container, name: "save", sha256: s.artifact.sha256, bytes: s.artifact.byteLength, format: "crimson-save", crimson: { status: "decoded", version: s.decoded.version, domains: s.domains, typedValidation: { status: "passed", decoderRevision: r.DECODER_REVISION } } }] }, initialContainer: s.container };
    if (q.method === "crimson.inventory") {
      let rows2 = s.domains.inventory.records;
      if (p.category) rows2 = rows2.filter((x) => x.category === p.category);
      if (p.search) {
        const search = String(p.search).toLowerCase();
        rows2 = rows2.filter((x) => [x.displayName, x.internalName, x.definitionKey, ...x.searchAliases || []].join(" ").toLowerCase().includes(search));
      }
      return { ...page(rows2, p), bags: s.domains.inventory.bags, ownershipComplete: s.domains.inventory.ownershipComplete };
    }
    if (q.method === "crimson.companions") return page(s.domains.companions.filter((x) => !p.kind || x.classification === p.kind), p);
    if (q.method === "crimson.progress") return s.domains.progress;
    if (q.method === "crimson.location") return s.domains.location;
    if (q.method === "crimson.capabilities") {
      const supported = s.decoded.version === 2 && s.document.schemaSha256 === "8427f58057ea9bf6dac35bc139cba163ddb135cfe89d748a2d36b94eec88d668", record = (available, reason) => ({ available, reason, state: available ? "format_supported" : "unavailable" });
      return { schema: "saverift.plugin-capabilities.v1", payloads: [{ container: s.container, name: "save", capabilities: { decode: record(true, "The complete typed document was read."), preview: record(true, "Candidate validation is separate from game acceptance."), edit_existing: record(supported, "Existing scalar edits require a matching schema and definition."), edit_capacity: record(supported, "Bag capacity is calculated from the saved expansion field."), insert_item: record(supported && getData("crimson-construction-items.json").entries.length > 0, "A matching pinned construction provider is required."), edit_companion: record(supported && getData("crimson-companion-additions.json").entries.length > 0, "A matching pinned template provider is required."), publish: record(false, "Only the trusted host can approve and transfer a candidate."), restore: record(false, "Restoration is a separately verified host operation.") } }] };
    }
    if (q.method === "crimson.catalog.items") {
      const rows2 = getData("crimson-items.json").items, search = String(p.search || "").toLowerCase();
      return page(rows2.filter((x) => !search || [x.name, x.internalName, x.key, ...x.searchAliases || []].join(" ").toLowerCase().includes(search)), p);
    }
    if (q.method === "crimson.catalog.companions") {
      const rows2 = getData("crimson-enrichment.json").companions, search = String(p.search || "").toLowerCase();
      return page(rows2.filter((x) => !search || JSON.stringify(x).toLowerCase().includes(search)), p);
    }
    if (q.method === "crimson.packs") return (await subsystem("recipes")).getPackCatalog();
    if (q.method === "crimson.pack-preview") return (await subsystem("packs")).previewCrimsonPack(s.source, s.metadata, { container: s.container, payload: "save", ...p });
    if (q.method === "crimson.presets") return (await subsystem("presets")).presetCatalog();
    if (q.method === "crimson.preset-preview") return (await subsystem("presets")).presetPreview(p.presetId);
    if (q.method === "crimson.map-preview" || q.method === "crimson.nexus-preview") {
      const mod = await Promise.resolve().then(() => (init_crimson_map_reveal(), crimson_map_reveal_exports)), nexus2 = await Promise.resolve().then(() => (init_crimson_abyss_nexus(), crimson_abyss_nexus_exports));
      return (await (q.method === "crimson.map-preview" ? mod.previewMapReveal : nexus2.previewAbyssNexus)(import_buffer.Buffer.from(ctx.readArtifact(s.artifact.id)))).report;
    }
    if (q.method === "crimson.import.inspect") return inspectUploadedBundle(s.bundle, ctx);
    fail18("CRIMSON_QUERY_UNSUPPORTED");
  },
  async plan(bundle, { operations, operationDigest }, ctx) {
    if (!Array.isArray(operations) || operations.length > 16 || !/^[a-f0-9]{64}$/.test(operationDigest || "")) fail18("CRIMSON_OPERATION_LOG_INVALID");
    const ops = operations.map(plainOperation), ordinary = ops.length && ops.every((o) => o.operation !== "document.patchFixedWidth" && o.operation !== "preset.replaceAdventure"), s = !ops.length ? await checkedEnvelope(bundle, ctx) : ordinary ? await compilerSnapshot(bundle, ctx, ops) : await opened(bundle, ctx), r = runtime, research = ops.filter((o) => o.operation === "document.patchFixedWidth"), known = ops.filter((o) => o.operation !== "document.patchFixedWidth");
    if (research.reduce((n, o) => n + (o.patches?.length || 0), 0) > 16) fail18("CRIMSON_DOCUMENT_PATCH_LIMIT");
    let output = s.artifact, report = { operations: [], validation: { originalBackupUnchanged: true } }, outputs = bundle.artifacts.filter((a) => !["reference-data", "preset-source"].includes(a.role)), retained = outputs.map((a) => a.id);
    if (ops.some((o) => o.operation === "preset.replaceAdventure")) {
      if (ops.length !== 1) fail18("CRIMSON_PRESET_REPLACEMENT_EXCLUSIVE");
      await subsystem("pair");
      const op = ops[0], reference = getData("crimson-preset-reference-pins.json")[op.presetId];
      if (!reference) fail18("PRESET_REFERENCE_PROVIDER_REQUIRED");
      const pair = {};
      for (const name of ["save", "lobby"]) {
        const a = bundle.artifacts.find((a2) => a2.id === op[name + "ArtifactId"]);
        if (!a || a.role !== "preset-source") fail18("PRESET_REFERENCE_ARTIFACT_REQUIRED");
        pair[name] = import_buffer.Buffer.from(ctx.readArtifact(a.id));
      }
      report = await r.validateReferencePair(pair, reference);
      outputs = ["save", "lobby"].map((name) => ctx.writeArtifact({ logicalPath: s.container + "/" + name, role: name === "save" ? "main" : "sidecar" }, pair[name]));
      retained = [];
    } else if (known.length) {
      const selectedCompiler = await compilerFor(s.document, known), source = s.source;
      bindPreparedSource(source, s.metadata, { context: ctx, container: s.container, payload: "save", payloadSha256: s.artifact.sha256, decoded: s.decoded, document: s.document, projection: s.projection });
      const plan = { schema: selectedCompiler.schema, container: s.container, payload: "save", backupSha256: s.metadata.sha256, backupRevision: s.source.revision, payloadSha256: s.artifact.sha256, plaintextSha256: s.document.plaintextSha256, schemaSha256: s.document.schemaSha256, decoderRevision: r.DECODER_REVISION, catalogRevision: r.CATALOG_REVISION, operations: known };
      const result = await selectedCompiler.compile(source, s.metadata, plan, { nonce: import_buffer.Buffer.from(ctx.randomBytes(16)) });
      report = result.report;
      output = ctx.writeArtifact({ logicalPath: s.artifact.logicalPath, role: s.artifact.role }, result.encoded);
      outputs = outputs.map((a) => a.id === s.artifact.id ? output : a);
      retained = retained.filter((id2) => id2 !== s.artifact.id);
    } else {
      const copy2 = await r.encodeSave(s.decoded.plaintext, s.decoded.header, { nonce: s.decoded.header.subarray(26, 42) });
      if (!copy2.equals(import_buffer.Buffer.from(ctx.readArtifact(s.artifact.id)))) fail18("CRIMSON_CANDIDATE_NATIVE_PARITY_FAILED");
    }
    for (const op of research) {
      const { operation, ...params } = op, stage2 = await (await subsystem("document")).patchFixedWidth(import_buffer.Buffer.from(ctx.readArtifact(output.id)), params, { originalDocument: s.document, nonce: import_buffer.Buffer.from(ctx.randomBytes(16)) }), prior = report;
      report = { schema: "saverift.crimson-research-composition.v1", stages: [prior, stage2.report], validation: stage2.report.validation, decodedDiff: stage2.report.decodedDiff, experimental: true, entitlementEffects: "unreviewed", requiresIndependentHostInspector: true };
      output = ctx.writeArtifact({ logicalPath: s.artifact.logicalPath, role: s.artifact.role }, stage2.encoded);
      outputs = outputs.map((a) => a.logicalPath === s.artifact.logicalPath ? output : a);
      retained = retained.filter((id2) => id2 !== s.artifact.id);
    }
    const reportArtifact = ctx.writeArtifact({ logicalPath: "reports/crimson-changes.json", role: "change-summary" }, import_buffer.Buffer.from(JSON.stringify(report)));
    return { id: "candidate:crimson:" + hash(canonicalJson({ bundle: bundle.bundleDigest, operationDigest })).slice(0, 24), inputBundleDigest: bundle.bundleDigest, executionLockDigest: ctx.executionLock.digest, operationDigest, outputs, retainedInputArtifacts: retained, changeSummaryRef: reportArtifact.id, requirements: { changedDomains: [...new Set(ops.map((o) => o.operation.split(".")[0]))], additions: ops.filter((o) => ["inventory.addItem", "companions.add"].includes(o.operation)), runtimeRequirements: report.runtimeRequirements || [], entitlementClassification: "host_independent_review_required", ...research.length ? { experimentalFixedWidthPatch: true, entitlementEffects: "unreviewed", requiresIndependentHostInspector: true } : {}, gameAcceptance: "unverified_for_this_candidate" }, validation: { checks: inspectChecks() } };
  },
  async validate(original, candidate, ctx) {
    const r = await load(original, ctx), artifact = mainArtifact(original);
    if (candidate.inputBundleDigest !== original.bundleDigest || candidate.executionLockDigest !== ctx.executionLock.digest) fail18("CRIMSON_CANDIDATE_BINDING_CHANGED");
    const inputs = original.artifacts.filter((a) => !["reference-data", "preset-source"].includes(a.role));
    if (candidate.outputs.length !== inputs.length || new Set(candidate.outputs.map((a) => a.logicalPath)).size !== inputs.length || candidate.outputs.some((a) => !inputs.some((i) => i.logicalPath === a.logicalPath))) fail18("CRIMSON_CANDIDATE_OUTPUT_SCOPE_CHANGED");
    const out = candidate.outputs.filter((a) => a.role === "main" || a.role === "save" || a.logicalPath === artifact.logicalPath);
    if (out.length !== 1) fail18("CRIMSON_CANDIDATE_MAIN_AMBIGUOUS");
    const bytes2 = import_buffer.Buffer.from(ctx.readArtifact(out[0].id));
    if (hash(bytes2) !== out[0].sha256 || bytes2.length !== out[0].byteLength) fail18("CRIMSON_CANDIDATE_DIGEST_CHANGED");
    const unchanged = out[0].sha256 === artifact.sha256 && out[0].byteLength === artifact.byteLength;
    let originalHeader, originalSchema;
    if (!unchanged) {
      const witness = await originalWitness(original, ctx);
      originalHeader = witness.header;
      originalSchema = witness.schemaSha256;
    }
    const decoded = await r.decodeSave(bytes2), document = r.readDocument(decoded.plaintext, { captureTypes: [], listLimit: 0, hashPlaintext: false }), reencoded = await r.encodeSave(decoded.plaintext, decoded.header, { nonce: decoded.header.subarray(26, 42) });
    if (!reencoded.equals(bytes2)) fail18("CRIMSON_CANDIDATE_NATIVE_PARITY_FAILED");
    let replaced = false;
    for (const a of inputs.filter((a2) => a2.id !== artifact.id)) {
      const kept = candidate.outputs.find((x) => x.logicalPath === a.logicalPath);
      if (!kept) fail18("CRIMSON_CANDIDATE_SIDECAR_MISSING");
      if (kept.sha256 !== a.sha256) {
        if (a.role !== "sidecar" && a.role !== "lobby") fail18("CRIMSON_CANDIDATE_SIDECAR_CHANGED");
        const pins = Object.values(getData("crimson-preset-reference-pins.json")).filter((x) => x && typeof x === "object" && x.save?.sha256 === out[0].sha256 && x.lobby?.sha256 === kept.sha256);
        if (pins.length !== 1) fail18("CRIMSON_CANDIDATE_PRESET_UNVERIFIED");
        await subsystem("pair");
        await r.validateReferencePair({ save: bytes2, lobby: import_buffer.Buffer.from(ctx.readArtifact(kept.id)) }, pins[0]);
        replaced = true;
      }
    }
    if (!replaced && !unchanged && (!decoded.header.subarray(0, 18).equals(originalHeader.subarray(0, 18)) || !decoded.header.subarray(74, 128).equals(originalHeader.subarray(74, 128)) || document.schemaSha256 !== originalSchema)) fail18("CRIMSON_CANDIDATE_UNKNOWN_HEADER_CHANGED");
    return { checks: [...inspectChecks(), { checkId: replaced ? "crimson.preset-pair-validated" : "crimson.sidecars-preserved", result: "passed", required: true }], schemaSha256: document.schemaSha256, entitlements: "not_established_by_format_validation", gameAcceptance: "unverified" };
  },
  close(handle) {
    if (handle?.id) states.delete(handle.id);
    else states.clear();
    if (!handle?.id || cachedOpen?.value.bundle.bundleDigest === handle.id) cachedOpen = null;
    return null;
  }
};
export {
  connector_default as default
};
