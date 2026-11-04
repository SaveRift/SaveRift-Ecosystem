var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
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
    exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
      var e, m, c;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
      var i = isLE ? 0 : nBytes - 1;
      var d = isLE ? 1 : -1;
      var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
      value = Math.abs(value);
      if (isNaN(value) || value === Infinity) {
        m = isNaN(value) ? 1 : 0;
        e = eMax;
      } else {
        e = Math.floor(Math.log(value) / Math.LN2);
        if (value * (c = Math.pow(2, -e)) < 1) {
          e--;
          c *= 2;
        }
        if (e + eBias >= 1) {
          value += rt / c;
        } else {
          value += rt * Math.pow(2, 1 - eBias);
        }
        if (value * c >= 2) {
          e++;
          c /= 2;
        }
        if (e + eBias >= eMax) {
          m = 0;
          e = eMax;
        } else if (e + eBias >= 1) {
          m = (value * c - 1) * Math.pow(2, mLen);
          e = e + eBias;
        } else {
          m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
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
    function from(value, encodingOrOffset, length) {
      if (typeof value === "string") {
        return fromString(value, encodingOrOffset);
      }
      if (ArrayBuffer.isView(value)) {
        return fromArrayView(value);
      }
      if (value == null) {
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
        );
      }
      if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof value === "number") {
        throw new TypeError(
          'The "value" argument must not be of type number. Received type number'
        );
      }
      const valueOf = value.valueOf && value.valueOf();
      if (valueOf != null && valueOf !== value) {
        return Buffer3.from(valueOf, encodingOrOffset, length);
      }
      const b = fromObject(value);
      if (b) return b;
      if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") {
        return Buffer3.from(value[Symbol.toPrimitive]("string"), encodingOrOffset, length);
      }
      throw new TypeError(
        "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
      );
    }
    Buffer3.from = function(value, encodingOrOffset, length) {
      return from(value, encodingOrOffset, length);
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
      function read2(buf, i2) {
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
          if (read2(arr, i) === read2(val, foundIndex === -1 ? 0 : i - foundIndex)) {
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
            if (read2(arr, i + j) !== read2(val, j)) {
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
    function checkInt(buf, value, offset, ext, max, min) {
      if (!Buffer3.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
      if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
      if (offset + ext > buf.length) throw new RangeError("Index out of range");
    }
    Buffer3.prototype.writeUintLE = Buffer3.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value, offset, byteLength2, maxBytes, 0);
      }
      let mul = 1;
      let i = 0;
      this[offset] = value & 255;
      while (++i < byteLength2 && (mul *= 256)) {
        this[offset + i] = value / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeUintBE = Buffer3.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value, offset, byteLength2, maxBytes, 0);
      }
      let i = byteLength2 - 1;
      let mul = 1;
      this[offset + i] = value & 255;
      while (--i >= 0 && (mul *= 256)) {
        this[offset + i] = value / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeUint8 = Buffer3.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer3.prototype.writeUint16LE = Buffer3.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      return offset + 2;
    };
    Buffer3.prototype.writeUint16BE = Buffer3.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
      this[offset] = value >>> 8;
      this[offset + 1] = value & 255;
      return offset + 2;
    };
    Buffer3.prototype.writeUint32LE = Buffer3.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
      this[offset + 3] = value >>> 24;
      this[offset + 2] = value >>> 16;
      this[offset + 1] = value >>> 8;
      this[offset] = value & 255;
      return offset + 4;
    };
    Buffer3.prototype.writeUint32BE = Buffer3.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
      this[offset] = value >>> 24;
      this[offset + 1] = value >>> 16;
      this[offset + 2] = value >>> 8;
      this[offset + 3] = value & 255;
      return offset + 4;
    };
    function wrtBigUInt64LE(buf, value, offset, min, max) {
      checkIntBI(value, min, max, buf, offset, 7);
      let lo = Number(value & BigInt(4294967295));
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      let hi = Number(value >> BigInt(32) & BigInt(4294967295));
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      return offset;
    }
    function wrtBigUInt64BE(buf, value, offset, min, max) {
      checkIntBI(value, min, max, buf, offset, 7);
      let lo = Number(value & BigInt(4294967295));
      buf[offset + 7] = lo;
      lo = lo >> 8;
      buf[offset + 6] = lo;
      lo = lo >> 8;
      buf[offset + 5] = lo;
      lo = lo >> 8;
      buf[offset + 4] = lo;
      let hi = Number(value >> BigInt(32) & BigInt(4294967295));
      buf[offset + 3] = hi;
      hi = hi >> 8;
      buf[offset + 2] = hi;
      hi = hi >> 8;
      buf[offset + 1] = hi;
      hi = hi >> 8;
      buf[offset] = hi;
      return offset + 8;
    }
    Buffer3.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(value, offset = 0) {
      return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
    });
    Buffer3.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(value, offset = 0) {
      return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
    });
    Buffer3.prototype.writeIntLE = function writeIntLE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        const limit = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value, offset, byteLength2, limit - 1, -limit);
      }
      let i = 0;
      let mul = 1;
      let sub = 0;
      this[offset] = value & 255;
      while (++i < byteLength2 && (mul *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
          sub = 1;
        }
        this[offset + i] = (value / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeIntBE = function writeIntBE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        const limit = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value, offset, byteLength2, limit - 1, -limit);
      }
      let i = byteLength2 - 1;
      let mul = 1;
      let sub = 0;
      this[offset + i] = value & 255;
      while (--i >= 0 && (mul *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
          sub = 1;
        }
        this[offset + i] = (value / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
      if (value < 0) value = 255 + value + 1;
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer3.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      return offset + 2;
    };
    Buffer3.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
      this[offset] = value >>> 8;
      this[offset + 1] = value & 255;
      return offset + 2;
    };
    Buffer3.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      this[offset + 2] = value >>> 16;
      this[offset + 3] = value >>> 24;
      return offset + 4;
    };
    Buffer3.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
      if (value < 0) value = 4294967295 + value + 1;
      this[offset] = value >>> 24;
      this[offset + 1] = value >>> 16;
      this[offset + 2] = value >>> 8;
      this[offset + 3] = value & 255;
      return offset + 4;
    };
    Buffer3.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(value, offset = 0) {
      return wrtBigUInt64LE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
    });
    Buffer3.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(value, offset = 0) {
      return wrtBigUInt64BE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
    });
    function checkIEEE754(buf, value, offset, ext, max, min) {
      if (offset + ext > buf.length) throw new RangeError("Index out of range");
      if (offset < 0) throw new RangeError("Index out of range");
    }
    function writeFloat(buf, value, offset, littleEndian, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value, offset, 4, 34028234663852886e22, -34028234663852886e22);
      }
      ieee754.write(buf, value, offset, littleEndian, 23, 4);
      return offset + 4;
    }
    Buffer3.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
      return writeFloat(this, value, offset, true, noAssert);
    };
    Buffer3.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
      return writeFloat(this, value, offset, false, noAssert);
    };
    function writeDouble(buf, value, offset, littleEndian, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value, offset, 8, 17976931348623157e292, -17976931348623157e292);
      }
      ieee754.write(buf, value, offset, littleEndian, 52, 8);
      return offset + 8;
    }
    Buffer3.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
      return writeDouble(this, value, offset, true, noAssert);
    };
    Buffer3.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
      return writeDouble(this, value, offset, false, noAssert);
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
        set code(value) {
          Object.defineProperty(this, "code", {
            configurable: true,
            enumerable: true,
            value,
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
    function checkIntBI(value, min, max, buf, offset, byteLength2) {
      if (value > max || value < min) {
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
        throw new errors.ERR_OUT_OF_RANGE("value", range, value);
      }
      checkBounds(buf, offset, byteLength2);
    }
    function validateNumber(value, name) {
      if (typeof value !== "number") {
        throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value);
      }
    }
    function boundsError(value, length, type) {
      if (Math.floor(value) !== value) {
        validateNumber(value, type);
        throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value);
      }
      if (length < 0) {
        throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
      }
      throw new errors.ERR_OUT_OF_RANGE(
        type || "offset",
        `>= ${type ? 1 : 0} and <= ${length}`,
        value
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

// ../../sdk/node_modules/@noble/hashes/esm/utils.js
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
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
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
var Hash = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
var wrapConstructor = createHasher;

// ../../sdk/node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
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
var HashMD = class extends Hash {
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
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
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
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// ../../sdk/node_modules/@noble/hashes/esm/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
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
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA256 = class extends HashMD {
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

// ../../sdk/node_modules/@noble/hashes/esm/sha256.js
var SHA2562 = SHA256;

// ../../sdk/node_modules/@noble/hashes/esm/hmac.js
var HMAC = class extends Hash {
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
var hmac = (hash2, key, message) => new HMAC(hash2, key).update(message).digest();
hmac.create = (hash2, key) => new HMAC(hash2, key);

// ../../sdk/buffer.mjs
var import_buffer = __toESM(require_buffer(), 1);
var portableCompare = import_buffer.Buffer.compare;
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
var portableIndexOf = import_buffer.Buffer.prototype.indexOf;
var nativeByteIndexOf = Uint8Array.prototype.indexOf;
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

// ../../sdk/crypto.mjs
var SHA256_K2 = new Int32Array([
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
var InterpreterSHA256 = class extends SHA2562 {
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
var nobleSha256 = wrapConstructor(() => new InterpreterSHA256());
var bytes = (value) => typeof value === "string" ? import_buffer.Buffer.from(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
var hostSha256 = () => ["Init", "Update", "Final", "Abort"].every((name) => typeof globalThis["__saveriftSha256" + name] === "function");
var sha2562 = (value) => hostSha256() ? createHash("sha256").update(value).digest("hex") : import_buffer.Buffer.from(nobleSha256(bytes(value))).toString("hex");
var hash = sha2562;
function hmacSha256(key, value) {
  if (!hostSha256()) return import_buffer.Buffer.from(hmac(nobleSha256, bytes(key), bytes(value)));
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
    inner.update(innerPad).update(value);
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
function createHash(algorithm) {
  if (algorithm !== "sha256") throw new TypeError("Only SHA-256 is supported.");
  if (hostSha256()) {
    let binaryUpdate = function(data) {
      if (!data.length) update(id, new ArrayBuffer(0));
      for (let offset = 0; offset < data.length; offset += 65536) {
        const end = Math.min(data.length, offset + 65536);
        update(id, data.buffer.slice(data.byteOffset + offset, data.byteOffset + end));
      }
    }, textUpdate = function(value) {
      if (typeof value !== "string") throw TypeError("A primitive format-hash string is required.");
      if (finished2) throw new Error("Hash already finalized.");
      if (!value.length) {
        updateText(id, "");
        return api2;
      }
      for (let offset = 0; offset < value.length; ) {
        let end = Math.min(value.length, offset + 65536), chunk = value.slice(offset, end);
        if (ascii.test(chunk)) {
          updateText(id, chunk);
          offset = end;
          continue;
        }
        end = Math.min(value.length, offset + 16384);
        const last = value.charCodeAt(end - 1), next = value.charCodeAt(end);
        if (last >= 55296 && last <= 56319 && next >= 56320 && next <= 57343) end--;
        chunk = value.slice(offset, end);
        if (unsafeFfi.test(chunk)) binaryUpdate(bytes(chunk));
        else updateText(id, chunk);
        offset = end;
      }
      return api2;
    };
    const init = globalThis.__saveriftSha256Init, update = globalThis.__saveriftSha256Update, final = globalThis.__saveriftSha256Final, abort = globalThis.__saveriftSha256Abort;
    const updateText = typeof globalThis.__saveriftSha256UpdateText === "function" ? globalThis.__saveriftSha256UpdateText : null;
    const id = init();
    let finished2 = false;
    const ascii = /^[\x01-\x7f]*$/, unsafeFfi = /[\u0000\ud800-\udfff\ufeff]/;
    const api2 = {
      update(value) {
        if (finished2) throw new Error("Hash already finalized.");
        if (updateText && typeof value === "string") return textUpdate(value);
        binaryUpdate(bytes(value));
        return api2;
      },
      digest(encoding) {
        if (finished2) throw new Error("Hash already finalized.");
        finished2 = true;
        const out = import_buffer.Buffer.from(new Uint8Array(final(id)));
        return encoding ? out.toString(encoding) : out;
      },
      destroy() {
        if (finished2) return;
        finished2 = true;
        abort(id);
      }
    };
    if (updateText) api2.updateText = textUpdate;
    return api2;
  }
  const state2 = nobleSha256.create();
  let finished = false;
  const api = { update(value) {
    if (finished) throw new Error("Hash already finalized.");
    state2.update(bytes(value));
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
var formatCrypto = Object.freeze({
  getRandomValues(array) {
    const data = randomBytes(array.byteLength);
    array.set(data);
    return array;
  },
  subtle: Object.freeze({
    async importKey(format, key, algorithm, _extractable, usages) {
      const hashName = typeof algorithm?.hash === "string" ? algorithm.hash : algorithm?.hash?.name;
      if (format !== "raw" || algorithm?.name !== "HMAC" || hashName !== "SHA-256" || !Array.isArray(usages) || usages.some((x) => x !== "sign" && x !== "verify")) throw new TypeError("Only raw format HMAC-SHA256 keys are supported.");
      return Object.freeze({ bytes: import_buffer.Buffer.from(bytes(key)), usages: [...usages] });
    },
    async sign(algorithm, key, value) {
      if (algorithm !== "HMAC" || !key.usages.includes("sign")) throw new TypeError("Unsupported format signature.");
      const out = hmacSha256(key.bytes, value);
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    },
    async verify(algorithm, key, signature, value) {
      if (algorithm !== "HMAC" || !key.usages.includes("verify")) throw new TypeError("Unsupported format signature.");
      return equal(hmacSha256(key.bytes, value), signature);
    }
  })
});

// src/typed-context.mjs
var HASH = Object.freeze({ root: 1868920887, player: 583660524, inventory: 197282326, bag: 680103110, itemData: 2466120828, item: 2024968992, character: 1650900319, data: 230775901, itemField: 3207170592, settings: 2065161794, instance: 2302317199, level: 1529602839, quantity: 1720022112 });
var fail = (code, message = code) => {
  throw Object.assign(new Error(message), { code });
};
var scalarWidths = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 4, 7: 4, 8: 8, 9: 8, 10: 4, 11: 8, 12: 12, 13: 16, 14: 16, 15: 36, 16: 64, 17: 8, 18: 8, 30: 8 };
function parseProgression(bytes2, { contextId = "progression" } = {}) {
  if (!(bytes2 instanceof Uint8Array) || bytes2.length < 30 || bytes2.length > 8 * 1024 * 1024) fail("AC_CONTEXT_SIZE");
  const view = new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength), records = [];
  let objectCount = 0, fieldCount = 0;
  const bounds = (p, n, end2 = bytes2.length) => {
    if (!Number.isSafeInteger(p) || n < 0 || p < 0 || p + n > end2) fail("AC_TRUNCATED_FIELD");
  };
  const u322 = (p) => {
    bounds(p, 4);
    return view.getUint32(p, true);
  };
  const u64 = (p) => {
    bounds(p, 8);
    return (BigInt(u322(p + 4)) * 4294967296n + BigInt(u322(p))).toString();
  };
  function object(p, limit, depth, env) {
    bounds(p, 22, limit);
    if (depth > 90 || ++objectCount > 25e4) fail("AC_CONTEXT_BUDGET");
    if (bytes2[p] !== 0 || bytes2[p + 1] !== 0) fail("AC_OBJECT_PREFIX");
    const type = u322(p + 14), length = u322(p + 18), end2 = p + 22 + length;
    if (length < 8 || end2 > limit) fail("AC_OBJECT_LENGTH");
    const isPlayer = type === HASH.player, frame = isPlayer ? { character: null, records: [] } : env.frame;
    const node = { type, offset: p, fields: [] };
    let pos = p + 22;
    while (pos < end2) {
      bounds(pos, 4, end2);
      const groupEnd = pos + 4 + u322(pos);
      pos += 4;
      if (groupEnd > end2) fail("AC_GROUP_LENGTH");
      while (pos < groupEnd) {
        bounds(pos, 17, groupEnd);
        const size = u322(pos), fend = pos + 4 + size;
        if (size < 13 || fend > groupEnd || ++fieldCount > 1e6) fail("AC_FIELD_LENGTH");
        const name = u322(pos + 4), storage = bytes2[pos + 14] & 127, arrayStorage = (bytes2[pos + 14] >>> 7 | bytes2[pos + 15] << 1) & 127;
        if (bytes2[pos + 16] !== 11) fail("AC_FIELD_MARKER");
        const owned = type === HASH.inventory ? name === HASH.data : env.owned;
        const [value, used] = read2(storage, arrayStorage, pos + 17, fend, depth + 1, { frame, owned, parentType: type });
        if (used !== fend) fail("AC_FIELD_CONSUMPTION");
        if ([HASH.itemData, HASH.item, HASH.player].includes(type)) node.fields.push({ name, storage, offset: pos + 17, length: size - 13, value });
        pos = fend;
      }
      if (pos !== groupEnd) fail("AC_GROUP_CONSUMPTION");
    }
    if (pos !== end2) fail("AC_OBJECT_CONSUMPTION");
    const field = (name) => {
      const rows = node.fields.filter((f) => f.name === name);
      if (rows.length > 1) fail("AC_AMBIGUOUS_PROPERTY");
      return rows[0];
    };
    if (type === HASH.itemData && env.owned && env.parentType === HASH.bag) {
      const item = field(HASH.itemField)?.value, q = field(HASH.quantity);
      if (item?.type !== HASH.item || !q || q.storage !== 7 || q.length !== 4) fail("AC_ITEM_LAYOUT");
      const f = (name) => {
        const rows = item.fields.filter((x) => x.name === name);
        if (rows.length > 1) fail("AC_AMBIGUOUS_PROPERTY");
        return rows[0];
      }, s = f(HASH.settings), id = f(HASH.instance), l = f(HASH.level);
      if (!s || s.storage !== 18 || s.length !== 8 || !id || id.storage !== 7 || id.length !== 4 || !l || l.storage !== 7 || l.length !== 4) fail("AC_ITEM_LAYOUT");
      const record = { recordId: `${contextId}:${p}:${id.value}`, characterId: frame?.character || "shared", itemSettingsId: s.value, instanceId: String(id.value), level: l.value, quantity: q.value, displayName: `Item ${s.value}`, editableFields: [] };
      if (l.value >= 1 && l.value <= 100 && q.value === 1) record.editableFields.push("level");
      if (l.value === 0 && q.value > 1 && q.value <= 999999) record.editableFields.push("quantity");
      if (!frame) record.editableFields = [];
      Object.defineProperty(record, "native", { value: { recordOffset: p, recordBytes: end2 - p, levelOffset: l.offset, quantityOffset: q.offset }, enumerable: false });
      records.push(record);
      if (frame) frame.records.push(record);
    }
    if (isPlayer) {
      const f = field(HASH.character);
      if (!f || f.storage !== 18 || f.length !== 8) fail("AC_CHARACTER_LAYOUT");
      frame.character = f.value;
      for (const r of frame.records) {
        r.characterId = f.value;
        if (!["2108411092570", "2134361901830"].includes(f.value)) r.editableFields = [];
      }
    }
    return [node, end2];
  }
  function read2(t, a, p, end2, depth, env) {
    if (depth > 90) fail("AC_CONTEXT_BUDGET");
    if ([19, 20, 21, 22].includes(t)) {
      if (t === 20 || t === 21) {
        bounds(p, 1, end2);
        const marker = bytes2[p++];
        if (marker === 2 || marker === 3) return [null, p];
        if (marker !== 0) fail("AC_POINTER_MARKER");
      }
      return object(p, end2, depth, env);
    }
    if ([23, 24, 29].includes(t)) {
      bounds(p, 5, end2);
      const count = u322(p + 1);
      if (bytes2[p] !== 1 || count > 1e5) fail("AC_ARRAY_HEADER");
      let pos = p + 5;
      for (let i = 0; i < count; i++) [, pos] = read2(a, 0, pos, end2, depth + 1, env);
      return [null, pos];
    }
    if (t === 28) {
      bounds(p, 1, end2);
      const marker = bytes2[p];
      if (marker === 1) {
        bounds(p, 9, end2);
        return [u64(p + 1), p + 9];
      }
      if (marker === 2 || marker === 3) return [null, p + 1];
      fail("AC_REFERENCE_MARKER");
    }
    if (t === 25 || t === 31) {
      const n2 = t === 25 ? 8 : 24;
      bounds(p, n2, end2);
      return [view.getInt32(p, true), p + n2];
    }
    if (t === 26 || t === 27) {
      bounds(p, 4, end2);
      const n2 = u322(p);
      bounds(p + 4, n2, end2);
      const finish = p + 4 + n2;
      if (finish >= end2 || bytes2[finish] !== 0) fail("AC_STRING_UNSUPPORTED");
      return [null, finish + 1];
    }
    const n = scalarWidths[t];
    if (n === void 0) fail("AC_STORAGE_UNSUPPORTED", `Unsupported progression storage ${t}`);
    bounds(p, n, end2);
    if (t === 7) return [u322(p), p + 4];
    if (t === 6) return [view.getInt32(p, true), p + 4];
    if (t === 18 || t === 17 || t === 8 || t === 9 || t === 30) return [u64(p), p + 8];
    if (t === 0 && bytes2[p] > 1) fail("AC_BOOLEAN_VALUE");
    return [null, p + n];
  }
  const [root, end] = object(0, bytes2.length, 0, { owned: false, frame: null, parentType: null });
  if (root.type !== HASH.root) fail("AC_PROGRESSION_ROOT");
  if (end !== bytes2.length) fail("AC_CONTEXT_TRAILING_BYTES");
  if (new Set(records.map((x) => x.recordId)).size !== records.length) fail("AC_DUPLICATE_RECORD");
  return { records, objectCount, fieldCount, rootType: root.type };
}
function patchProgression(source, parsed, operations, sourceSha256, { materialize = true } = {}) {
  const next = materialize ? new Uint8Array(source) : null, view = next ? new DataView(next.buffer) : null, changes = [], targets = /* @__PURE__ */ new Set();
  for (const op of operations) {
    if (op?.apiVersion !== "0.1.0" || !op.params || Array.isArray(op.params)) fail("AC_OPERATION_INVALID");
    const isLevel = op.id === "acshadows.inventory.setLevel", isQuantity = op.id === "acshadows.inventory.setQuantity";
    if (!isLevel && !isQuantity) fail("AC_OPERATION_UNSUPPORTED");
    const field = isLevel ? "level" : "quantity", expectedKey = isLevel ? "expectedLevel" : "expectedQuantity", p = op.params;
    if (Object.keys(p).sort().join(",") !== ["recordId", expectedKey, field, "sourceSha256"].sort().join(",")) fail("AC_OPERATION_INVALID");
    if (p.sourceSha256 !== sourceSha256) fail("AC_SOURCE_MISMATCH");
    const record = parsed.records.find((x) => x.recordId === p.recordId);
    if (!record) fail("AC_RECORD_NOT_FOUND");
    if (!record.editableFields.includes(field)) fail("AC_FIELD_READ_ONLY");
    if (record[field] !== p[expectedKey]) fail("AC_PRECONDITION_MISMATCH");
    if (!Number.isSafeInteger(p[field]) || p[field] < 1 || p[field] > (isLevel ? 100 : 999999)) fail("AC_RANGE");
    const offset = record.native[field + "Offset"];
    if (targets.has(offset)) fail("AC_DUPLICATE_EDIT");
    targets.add(offset);
    if (view) view.setUint32(offset, p[field], true);
    changes.push({ recordId: record.recordId, field, offset, width: 4, before: record[field], after: p[field] });
  }
  return { bytes: next, changes };
}

// src/native-container.mjs
var MAGIC = new Uint8Array([51, 170, 251, 87, 153, 250, 4, 16]);
var INFO = new Uint8Array([3, 0, 5, 0, 0, 4, 0]);
var tables = /* @__PURE__ */ new Map();
function crcTable(polynomial) {
  let table = tables.get(polynomial);
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c >>> 1 ^ (c & 1 ? polynomial : 0);
      table[i] = c >>> 0;
    }
    tables.set(polynomial, table);
  }
  return table;
}
function seededCrc(bytes2, start = 0, end = bytes2.length, polynomial = 3988292384) {
  const table = crcTable(polynomial);
  let crc = (4106467490 ^ 4294967295) >>> 0;
  for (let i = start; i < end; i++) crc = (table[(crc ^ bytes2[i]) & 255] ^ crc >>> 8) >>> 0;
  return (crc ^ 4294967295) >>> 0;
}
function crcPair(bytes2) {
  const regular = crcTable(3988292384), castagnoli = crcTable(2197175160);
  let a = (4106467490 ^ 4294967295) >>> 0, b = a;
  for (let i = 0; i < 20; i++) b = (castagnoli[(b ^ bytes2[i]) & 255] ^ b >>> 8) >>> 0;
  for (let i = 20; i < bytes2.length - 4; i++) {
    const v = bytes2[i];
    a = (regular[(a ^ v) & 255] ^ a >>> 8) >>> 0;
    b = (castagnoli[(b ^ v) & 255] ^ b >>> 8) >>> 0;
  }
  return [(a ^ 4294967295) >>> 0, (b ^ 4294967295) >>> 0];
}
function adlerZero(bytes2) {
  let a = 0, b = 0;
  for (const x of bytes2) {
    a = (a + x) % 65521;
    b = (b + a) % 65521;
  }
  return (b << 16 | a) >>> 0;
}
var same = (bytes2, offset, wanted) => wanted.every((v, i) => bytes2[offset + i] === v);
var join = (parts) => {
  const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    b.set(p, at);
    at += p.length;
  }
  return b;
};
var u32 = (bytes2, p) => new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength).getUint32(p, true);
function inspectNativeContainer(bytes2) {
  if (!(bytes2 instanceof Uint8Array) || bytes2.length < 24 || bytes2.length > 24 * 1024 * 1024) fail("AC_NATIVE_SIZE");
  if (u32(bytes2, 0) !== 16702380) fail("AC_NATIVE_MAGIC");
  if (u32(bytes2, 4) !== 54 || u32(bytes2, 8) !== 4) fail("AC_NATIVE_VERSION_UNSUPPORTED");
  const [payloadCrc, outerCrc] = crcPair(bytes2);
  if (payloadCrc !== u32(bytes2, 16)) fail("AC_NATIVE_PAYLOAD_CRC");
  if (outerCrc !== u32(bytes2, bytes2.length - 4)) fail("AC_NATIVE_OUTER_CRC");
  const contexts = [];
  let p = 20, totalPlain = 0;
  while (p < bytes2.length - 4) {
    if (p + 31 > bytes2.length - 4 || contexts.length >= 256) fail("AC_NATIVE_CONTEXT_BOUNDS");
    const start = p, magic = p + 16, size = u32(bytes2, p + 8), plainSize = u32(bytes2, p + 12), end = magic + size - 4;
    if (size < 24 || end > bytes2.length - 4 || plainSize < 30 || plainSize > 8 * 1024 * 1024) fail("AC_NATIVE_CONTEXT_LENGTH");
    if (!same(bytes2, magic, MAGIC) || !same(bytes2, magic + 8, INFO)) fail("AC_NATIVE_COMPRESSION_UNSUPPORTED");
    p = magic + 15;
    const blocks = [];
    let sum = 0;
    while (p < end) {
      if (p + 5 > end) fail("AC_NATIVE_BLOCK_HEADER");
      const offset = p, flag = bytes2[p], packed = u32(bytes2, p + 1);
      let plain = packed, checksum = null;
      p += 5;
      if (flag === 1) {
        if (p + 8 > end) fail("AC_NATIVE_BLOCK_HEADER");
        plain = u32(bytes2, p);
        checksum = u32(bytes2, p + 4);
        p += 8;
      } else if (flag !== 0) fail("AC_NATIVE_BLOCK_FLAG");
      if (packed < 1 || packed > 262144 || plain < 1 || plain > 262144 || p + packed > end || sum + plain > plainSize) fail("AC_NATIVE_BLOCK_LENGTH");
      if (flag === 1 && adlerZero(bytes2.subarray(p, p + packed)) !== checksum) fail("AC_NATIVE_BLOCK_ADLER");
      blocks.push({ offset, dataOffset: p, end: p + packed, flag, packed, plain, plainOffset: sum, checksum, requiresDecoder: flag === 1 && packed !== plain });
      sum += plain;
      p += packed;
    }
    if (p !== end || sum !== plainSize) fail("AC_NATIVE_CONTEXT_CONSUMPTION");
    totalPlain += plainSize;
    if (totalPlain > 64 * 1024 * 1024) fail("AC_NATIVE_TOTAL_PLAIN_LIMIT");
    contexts.push({ index: contexts.length, start, magic, end, plainSize, blocks });
  }
  if (p !== bytes2.length - 4 || !contexts.length) fail("AC_NATIVE_TRAILING_BYTES");
  return { version: 54, contexts, totalPlain, compressedBlocks: contexts.reduce((n, c) => n + c.blocks.filter((b) => b.requiresDecoder).length, 0) };
}
function decodeContext(container, context, decoder) {
  const parts = [];
  for (const b of context.blocks) {
    const packed = container.subarray(b.dataOffset, b.end);
    let plain;
    if (b.requiresDecoder) {
      if (typeof decoder !== "function") fail("AC_OODLE_REQUIRED");
      plain = decoder(packed, b.plain);
    } else plain = packed;
    if (!(plain instanceof Uint8Array) || plain.length !== b.plain) fail("AC_DECODE_LENGTH");
    parts.push(plain);
  }
  return join(parts);
}
function transformPayload(bytes2, baseKey) {
  if (!(baseKey instanceof Uint8Array) || baseKey.length !== 16) fail("AC_PRIVATE_KEY_REQUIRED");
  const rotation = bytes2.length % 16, out = new Uint8Array(bytes2.length);
  for (let i = 0; i < out.length; i++) out[i] = bytes2[i] ^ baseKey[(i - rotation + 16) % 16];
  return out;
}

// connector.mjs
var states = /* @__PURE__ */ new Map();
var copy = (x) => JSON.parse(JSON.stringify(x));
var cached = null;
var ids = ["acshadows.inventory.setQuantity", "acshadows.inventory.setLevel"];
function main(bundle) {
  const rows = bundle.artifacts.filter((a) => ["main", "progression"].includes(a.role));
  if (rows.length !== 1) fail("AC_MAIN_REQUIRED", "Select one unpacked native progression context as main.");
  return rows[0];
}
function read(bundle, ctx, { parse = true } = {}) {
  const binding = JSON.stringify(bundle);
  if (cached?.ctx === ctx && cached.binding === binding && (!parse || cached.value.parsed)) return cached.value;
  const artifact = main(bundle);
  let bytes2 = ctx.readArtifact(artifact.id), native = null;
  if (hash(bytes2) !== artifact.sha256) fail("AC_SOURCE_MISMATCH");
  if (bytes2.length >= 8 && new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength).getUint32(0, true) === 36) {
    if (bytes2.length < 64 || new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength).getUint32(4, true) !== 0) fail("AC_PC_WRAPPER_INVALID");
    const keys = bundle.artifacts.filter((a) => a.role === "ac-key");
    if (keys.length !== 1 || keys[0].byteLength !== 16) fail("AC_PRIVATE_KEY_REQUIRED", "Select the private 16-byte key produced by local preparation. It will not be included in the download.");
    const key = ctx.readArtifact(keys[0].id);
    if (hash(key) !== keys[0].sha256) fail("AC_SOURCE_MISMATCH");
    const header = bytes2.slice(0, 40), decoded = transformPayload(bytes2.subarray(40), key), inspection = inspectNativeContainer(decoded), target = inspection.contexts[12];
    if (!target) fail("AC_PROGRESSION_CONTEXT_MISSING");
    if (target.blocks.some((b) => b.requiresDecoder)) fail("AC_OODLE_REQUIRED", "Run the local AC preparation command first. Untouched Oodle progression blocks cannot yet be decoded inside the isolated runner.");
    if (target.blocks.some((b) => b.flag !== 0)) fail("AC_PREPARED_STORED_FLAG_REQUIRED");
    bytes2 = decodeContext(decoded, target);
    native = { header, key, decoded, inspection, target, keyArtifactId: keys[0].id };
  }
  if (bytes2.length < 30 || bytes2[0] !== 0 || bytes2[1] !== 0 || new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength).getUint32(14, true) !== HASH.root) fail("AC_UNSUPPORTED_FORMAT");
  const value = { artifact, bytes: bytes2, parsed: parse ? parseProgression(bytes2) : null, bundle, native };
  cached = { ctx, binding, value };
  return value;
}
function summary(s) {
  return { schema: "saverift.ac-shadows.inspect.v1", format: s.native ? "native-pc-stored-progression-v54" : "native-progression-context", sourceSha256: s.artifact.sha256, inventoryCount: s.parsed.records.length, objectCount: s.parsed.objectCount, fieldCount: s.parsed.fieldCount, capabilities: { quantity: true, itemLevel: true, maxOperations: 16, playerLevel: false, mastery: false, engraving: false, nativeWrappedSave: !!s.native }, limitations: [s.native ? "Prepared v54 PC save: the progression context must already use native stored blocks. Native output has not been tested in game." : "Unpacked progression context only. Download is not directly loadable by the game.", "Untouched Oodle progression blocks and Xbox saves require a separate verified codec.", "No item additions, engraving edits, mastery or player-level changes.", "Unknown character profiles and level-zero singleton records remain read-only."], gameAcceptance: "not_run" };
}
function nativeOffset(s, offset) {
  const b = s.native.target.blocks.find((b2) => offset >= b2.plainOffset && offset + 4 <= b2.plainOffset + b2.plain);
  if (!b || b.requiresDecoder) fail("AC_NATIVE_EDIT_BLOCK");
  return b.dataOffset + offset - b.plainOffset;
}
function encodeNative(s, changes) {
  const decoded = new Uint8Array(s.native.decoded), view = new DataView(decoded.buffer);
  for (const c of changes) view.setUint32(nativeOffset(s, c.offset), c.after, true);
  if (s.native.target.blocks.some((b) => b.flag !== 0)) fail("AC_PREPARED_STORED_FLAG_REQUIRED");
  view.setUint32(16, seededCrc(decoded, 20, decoded.length - 4), true);
  view.setUint32(decoded.length - 4, seededCrc(decoded, 0, decoded.length - 4, 2197175160), true);
  const output = new Uint8Array(decoded.length + 40);
  output.set(s.native.header);
  const rotation = decoded.length % 16, key = s.native.key;
  for (let i = 0; i < decoded.length; i++) output[i + 40] = decoded[i] ^ key[(i - rotation + 16) % 16];
  return output;
}
function state(handle) {
  const s = states.get(handle?.id);
  if (!s) fail("AC_DOCUMENT_CLOSED");
  return s;
}
function check(id, passed = true) {
  return { checkId: id, result: passed ? "passed" : "failed", required: true };
}
var connector_default = {
  detect(bundle, ctx) {
    if (bundle.hints?.gameIdentity && !["ac-shadows", "assassins-creed-shadows"].includes(bundle.hints.gameIdentity)) return { state: "not_a_match" };
    if (bundle.hints?.platform && !["pc", "windows"].includes(bundle.hints.platform.toLowerCase())) return { state: "recognized_unsupported", reason: "AC_PLATFORM_UNSUPPORTED" };
    try {
      const s = read(bundle, ctx);
      return { state: "supported", format: summary(s).format, requiredRoles: s.native ? ["main", "ac-key"] : ["main"], nativeGameFile: !!s.native };
    } catch (e) {
      return { state: e.code === "AC_UNSUPPORTED_FORMAT" ? "not_a_match" : "recognized_unsupported", reason: e.code || "AC_CORRUPT" };
    }
  },
  open(bundle, ctx) {
    const s = read(bundle, ctx), id = bundle.bundleDigest;
    states.set(id, s);
    return { id, ...summary(s) };
  },
  describe() {
    return { domainApis: { "acshadows.inventory": "0.1.0" }, operations: ids.map((id) => ({ id, apiVersion: "0.1.0", writeDomains: [{ path: "inventory", mode: "ordered" }] })), views: [{ id: "inventory", mode: "custom" }], unavailable: ["unprepared-oodle-save", "xbox", "mastery", "player-level", "engraving", "item-addition"] };
  },
  query(handle, q) {
    const s = state(handle), p = q?.params || q?.args || q || {};
    if (q.method === "acshadows.inspect") return summary(s);
    if (q.method === "acshadows.inventory.list") {
      const offset = Number.isSafeInteger(p.offset) && p.offset >= 0 ? p.offset : 0, limit = Number.isSafeInteger(p.limit) ? Math.min(50, Math.max(1, p.limit)) : 50, search = String(p.search || "").slice(0, 200).toLowerCase();
      const rows = s.parsed.records.filter((r) => !search || [r.displayName, r.characterId, r.itemSettingsId, r.instanceId].join(" ").toLowerCase().includes(search)).sort((a, b) => Number(b.editableFields.length > 0) - Number(a.editableFields.length > 0));
      return { records: copy(rows.slice(offset, offset + limit)), total: rows.length, offset, limit };
    }
    fail("AC_QUERY_UNSUPPORTED");
  },
  plan(bundle, { operations, operationDigest }, ctx) {
    if (!Array.isArray(operations) || operations.length > 16 || !/^[a-f0-9]{64}$/.test(operationDigest || "")) fail("AC_OPERATION_LOG_INVALID");
    const s = read(bundle, ctx), changed = patchProgression(s.bytes, s.parsed, operations, s.artifact.sha256, { materialize: !s.native }), hasChanges = changed.changes.some((x) => x.before !== x.after);
    const output = hasChanges ? ctx.writeArtifact({ logicalPath: s.artifact.logicalPath, role: s.artifact.role }, s.native ? encodeNative(s, changed.changes) : changed.bytes) : s.artifact;
    if (!s.native) {
      const reopened = parseProgression(ctx.readArtifact(output.id));
      for (const c of changed.changes) {
        const r = reopened.records.find((x) => x.recordId === c.recordId);
        if (!r || r[c.field] !== c.after) fail("AC_REOPEN_MISMATCH");
      }
    }
    const siblingOutputs = bundle.artifacts.filter((a) => a.id !== s.artifact.id && a.role !== "ac-key");
    const report = { schema: "saverift.ac-shadows.changes.v1", sourceSha256: s.artifact.sha256, outputSha256: output.sha256, changes: changed.changes, format: summary(s).format, nativeGameFile: !!s.native, gameAcceptance: "not_run", siblingCount: siblingOutputs.length };
    const summaryRef = ctx.writeArtifact({ logicalPath: "reports/ac-shadows-changes.json", role: "change-summary" }, Uint8Array.from(JSON.stringify(report), (c) => c.charCodeAt(0)));
    return { id: "candidate:ac-shadows", inputBundleDigest: bundle.bundleDigest, executionLockDigest: ctx.executionLock.digest, operationDigest, outputs: [output, ...siblingOutputs], retainedInputArtifacts: [...siblingOutputs.map((a) => a.id), ...!hasChanges ? [s.artifact.id] : []], changeSummaryRef: summaryRef.id, requirements: { changedDomains: hasChanges ? ["inventory"] : [] }, validation: { checks: [check("ac.context-full-traversal"), check(s.native ? "ac.fixed-width-planned-structure" : "ac.fixed-width-reopen")] } };
  },
  validate(original, candidate, ctx) {
    const s = read(original, ctx), out = candidate.outputs.find((a) => a.logicalPath === s.artifact.logicalPath);
    if (!out) fail("AC_CANDIDATE_MAIN_MISSING");
    if (s.native) {
      const summaryBytes2 = ctx.readArtifact(candidate.changeSummaryRef);
      let text2 = "";
      for (const b of summaryBytes2) text2 += String.fromCharCode(b);
      const report2 = JSON.parse(text2);
      if (report2.schema !== "saverift.ac-shadows.changes.v1" || report2.sourceSha256 !== s.artifact.sha256 || report2.outputSha256 !== out.sha256 || !Array.isArray(report2.changes) || report2.changes.length > 16) fail("AC_CANDIDATE_BINDING");
      const seen2 = /* @__PURE__ */ new Set();
      for (const c of report2.changes) {
        const r = s.parsed.records.find((r2) => r2.recordId === c.recordId);
        if (!r || !["level", "quantity"].includes(c.field) || !r.editableFields.includes(c.field) || r[c.field] !== c.before || r.native[c.field + "Offset"] !== c.offset || c.width !== 4 || seen2.has(c.offset) || !Number.isSafeInteger(c.after) || c.after < 1 || c.after > (c.field === "level" ? 100 : 999999)) fail("AC_CHANGE_WITNESS");
        seen2.add(c.offset);
      }
      const actual = ctx.readArtifact(out.id);
      const decoded = new Uint8Array(s.native.decoded), view2 = new DataView(decoded.buffer), offsets = /* @__PURE__ */ new Set([16, 17, 18, 19, ...[0, 1, 2, 3].map((i) => decoded.length - 4 + i)]);
      for (const c of report2.changes) {
        const at = nativeOffset(s, c.offset);
        view2.setUint32(at, c.after, true);
        for (let i = 0; i < 4; i++) offsets.add(at + i);
      }
      view2.setUint32(16, seededCrc(decoded, 20, decoded.length - 4), true);
      view2.setUint32(decoded.length - 4, seededCrc(decoded, 0, decoded.length - 4, 2197175160), true);
      const originalRaw = ctx.readArtifact(s.artifact.id), expectedBytes2 = /* @__PURE__ */ new Map();
      for (const at of offsets) expectedBytes2.set(at + 40, originalRaw[at + 40] ^ s.native.decoded[at] ^ decoded[at]);
      let conserved = actual.length === originalRaw.length;
      for (const [at, value] of expectedBytes2) if (actual[at] !== value) conserved = false;
      for (let i = 0; conserved && i < actual.length; i++) if (actual[i] !== originalRaw[i] && expectedBytes2.get(i) !== actual[i]) conserved = false;
      const siblings2 = original.artifacts.filter((a) => a.id !== s.artifact.id && a.role !== "ac-key"), siblingsPass2 = siblings2.every((a) => candidate.outputs.some((b) => b.id === a.id && b.sha256 === a.sha256 && b.byteLength === a.byteLength)) && candidate.outputs.length === siblings2.length + 1;
      return { checks: [check("ac.context-full-traversal"), check("ac.whole-context-conservation", conserved), check("ac.sibling-preservation", siblingsPass2), check("ac.record-count-preservation", conserved), check("ac.native-container-integrity", conserved), check("ac.native-whole-file-conservation", conserved), check("ac.private-key-excluded", !candidate.outputs.some((a) => a.role === "ac-key" || a.id === s.native.keyArtifactId))] };
    }
    const next = read({ ...original, artifacts: [out, ...original.artifacts.filter((a) => a.id !== s.artifact.id)] }, ctx, { parse: false }), bytes2 = next.bytes, summaryBytes = ctx.readArtifact(candidate.changeSummaryRef);
    let text = "";
    for (const b of summaryBytes) text += String.fromCharCode(b);
    const report = JSON.parse(text);
    if (report.schema !== "saverift.ac-shadows.changes.v1" || report.sourceSha256 !== s.artifact.sha256 || report.outputSha256 !== out.sha256 || !Array.isArray(report.changes) || report.changes.length > 16) fail("AC_CANDIDATE_BINDING");
    const expectedBytes = /* @__PURE__ */ new Map(), view = new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength), seen = /* @__PURE__ */ new Set();
    for (const c of report.changes) {
      const record = s.parsed.records.find((r) => r.recordId === c.recordId);
      if (!record || !["level", "quantity"].includes(c.field) || !record.editableFields.includes(c.field) || record[c.field] !== c.before || c.offset !== record.native[c.field + "Offset"] || c.width !== 4 || seen.has(c.offset) || !Number.isSafeInteger(c.after) || c.after < 1 || c.after > (c.field === "level" ? 100 : 999999) || view.getUint32(c.offset, true) !== c.after) fail("AC_CHANGE_WITNESS");
      seen.add(c.offset);
      for (let i = 0; i < 4; i++) expectedBytes.set(c.offset + i, c.after >>> i * 8 & 255);
    }
    let preserved = s.bytes.length === bytes2.length;
    for (let i = 0; preserved && i < bytes2.length; i++) if (s.bytes[i] !== bytes2[i] && expectedBytes.get(i) !== bytes2[i]) preserved = false;
    const siblings = original.artifacts.filter((a) => a.id !== s.artifact.id && a.role !== "ac-key"), siblingsPass = siblings.every((a) => candidate.outputs.some((b) => b.id === a.id && b.sha256 === a.sha256 && b.byteLength === a.byteLength)) && candidate.outputs.length === siblings.length + 1;
    let nativeConserved = true;
    if (s.native) {
      if (!next.native || s.native.decoded.length !== next.native.decoded.length || !s.native.header.every((v, i) => v === next.native.header[i])) nativeConserved = false;
      else {
        const allowed = /* @__PURE__ */ new Set([16, 17, 18, 19, ...[0, 1, 2, 3].map((i) => s.native.decoded.length - 4 + i)]);
        for (const c of report.changes) {
          const at = nativeOffset(s, c.offset);
          for (let i = 0; i < 4; i++) allowed.add(at + i);
        }
        for (let i = 0; i < s.native.decoded.length; i++) if (s.native.decoded[i] !== next.native.decoded[i] && !allowed.has(i)) {
          nativeConserved = false;
          break;
        }
      }
    }
    return { checks: [check("ac.context-full-traversal"), check("ac.whole-context-conservation", preserved), check("ac.sibling-preservation", siblingsPass), check("ac.record-count-preservation", preserved), ...s.native ? [check("ac.native-container-integrity"), check("ac.native-whole-file-conservation", nativeConserved), check("ac.private-key-excluded", !candidate.outputs.some((a) => a.role === "ac-key" || a.id === s.native.keyArtifactId))] : []] };
  },
  close(handle) {
    if (handle?.id) states.delete(handle.id);
    else states.clear();
    cached = null;
    return null;
  }
};
export {
  connector_default as default
};
