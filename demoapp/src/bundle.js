(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';
// For more information about browser field, check out the browser field at https://github.com/substack/browserify-handbook#browser-field.

module.exports = {
    // Create a <link> tag with optional data attributes
    createLink: function(href, attributes) {
        var head = document.head || document.getElementsByTagName('head')[0];
        var link = document.createElement('link');

        link.href = href;
        link.rel = 'stylesheet';

        for (var key in attributes) {
            if ( ! attributes.hasOwnProperty(key)) {
                continue;
            }
            var value = attributes[key];
            link.setAttribute('data-' + key, value);
        }

        head.appendChild(link);
    },
    // Create a <style> tag with optional data attributes
    createStyle: function(cssText, attributes) {
        var head = document.head || document.getElementsByTagName('head')[0],
            style = document.createElement('style');

        style.type = 'text/css';

        for (var key in attributes) {
            if ( ! attributes.hasOwnProperty(key)) {
                continue;
            }
            var value = attributes[key];
            style.setAttribute('data-' + key, value);
        }
        
        if (style.sheet) { // for jsdom and IE9+
            style.innerHTML = cssText;
            style.sheet.cssText = cssText;
            head.appendChild(style);
        } else if (style.styleSheet) { // for IE8 and below
            head.appendChild(style);
            style.styleSheet.cssText = cssText;
        } else { // for Chrome, Firefox, and Safari
            style.appendChild(document.createTextNode(cssText));
            head.appendChild(style);
        }
    }
};

},{}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
(function (global){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Safari 5-7 lacks support for changing the `Object.prototype.constructor` property
 *     on objects.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
  ? global.TYPED_ARRAY_SUPPORT
  : (function () {
      function Bar () {}
      try {
        var arr = new Uint8Array(1)
        arr.foo = function () { return 42 }
        arr.constructor = Bar
        return arr.foo() === 42 && // typed array instances can be augmented
            arr.constructor === Bar && // constructor can be set
            typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
            arr.subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
      } catch (e) {
        return false
      }
    })()

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (arg) {
  if (!(this instanceof Buffer)) {
    // Avoid going through an ArgumentsAdaptorTrampoline in the common case.
    if (arguments.length > 1) return new Buffer(arg, arguments[1])
    return new Buffer(arg)
  }

  this.length = 0
  this.parent = undefined

  // Common case.
  if (typeof arg === 'number') {
    return fromNumber(this, arg)
  }

  // Slightly less common case.
  if (typeof arg === 'string') {
    return fromString(this, arg, arguments.length > 1 ? arguments[1] : 'utf8')
  }

  // Unusual.
  return fromObject(this, arg)
}

function fromNumber (that, length) {
  that = allocate(that, length < 0 ? 0 : checked(length) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < length; i++) {
      that[i] = 0
    }
  }
  return that
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') encoding = 'utf8'

  // Assumption: byteLength() return value is always < kMaxLength.
  var length = byteLength(string, encoding) | 0
  that = allocate(that, length)

  that.write(string, encoding)
  return that
}

function fromObject (that, object) {
  if (Buffer.isBuffer(object)) return fromBuffer(that, object)

  if (isArray(object)) return fromArray(that, object)

  if (object == null) {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (typeof ArrayBuffer !== 'undefined') {
    if (object.buffer instanceof ArrayBuffer) {
      return fromTypedArray(that, object)
    }
    if (object instanceof ArrayBuffer) {
      return fromArrayBuffer(that, object)
    }
  }

  if (object.length) return fromArrayLike(that, object)

  return fromJsonObject(that, object)
}

function fromBuffer (that, buffer) {
  var length = checked(buffer.length) | 0
  that = allocate(that, length)
  buffer.copy(that, 0, 0, length)
  return that
}

function fromArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Duplicate of fromArray() to keep fromArray() monomorphic.
function fromTypedArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  // Truncating the elements is probably not what people expect from typed
  // arrays with BYTES_PER_ELEMENT > 1 but it's compatible with the behavior
  // of the old Buffer constructor.
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayBuffer (that, array) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    array.byteLength
    that = Buffer._augment(new Uint8Array(array))
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromTypedArray(that, new Uint8Array(array))
  }
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Deserialize { type: 'Buffer', data: [1,2,3,...] } into a Buffer object.
// Returns a zero-length buffer for inputs that don't conform to the spec.
function fromJsonObject (that, object) {
  var array
  var length = 0

  if (object.type === 'Buffer' && isArray(object.data)) {
    array = object.data
    length = checked(array.length) | 0
  }
  that = allocate(that, length)

  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype
  Buffer.__proto__ = Uint8Array
}

function allocate (that, length) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = Buffer._augment(new Uint8Array(length))
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that.length = length
    that._isBuffer = true
  }

  var fromPool = length !== 0 && length <= Buffer.poolSize >>> 1
  if (fromPool) that.parent = rootParent

  return that
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  var i = 0
  var len = Math.min(x, y)
  while (i < len) {
    if (a[i] !== b[i]) break

    ++i
  }

  if (i !== len) {
    x = a[i]
    y = b[i]
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

  if (list.length === 0) {
    return new Buffer(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buf = new Buffer(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

function byteLength (string, encoding) {
  if (typeof string !== 'string') string = '' + string

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'binary':
      // Deprecated
      case 'raw':
      case 'raws':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

function slowToString (encoding, start, end) {
  var loweredCase = false

  start = start | 0
  end = end === undefined || end === Infinity ? this.length : end | 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

// `get` is deprecated
Buffer.prototype.get = function get (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` is deprecated
Buffer.prototype.set = function set (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    var swap = encoding
    encoding = offset
    offset = length | 0
    length = swap
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = value
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = value
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = value
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; i--) {
      target[i + targetStart] = this[i + start]
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), targetStart)
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function toArrayBuffer () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function _augment (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array set method before overwriting
  arr._set = arr.set

  // deprecated
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.indexOf = BP.indexOf
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUIntLE = BP.readUIntLE
  arr.readUIntBE = BP.readUIntBE
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readIntLE = BP.readIntLE
  arr.readIntBE = BP.readIntBE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUIntLE = BP.writeUIntLE
  arr.writeUIntBE = BP.writeUIntBE
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeIntLE = BP.writeIntLE
  arr.writeIntBE = BP.writeIntBE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00 | 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"base64-js":4,"ieee754":5,"is-array":6}],4:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],5:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],6:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}],7:[function(require,module,exports){
(function (global){
/*! https://mths.be/punycode v1.3.2 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports &&
		!exports.nodeType && exports;
	var freeModule = typeof module == 'object' && module &&
		!module.nodeType && module;
	var freeGlobal = typeof global == 'object' && global;
	if (
		freeGlobal.global === freeGlobal ||
		freeGlobal.window === freeGlobal ||
		freeGlobal.self === freeGlobal
	) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		var result = [];
		while (length--) {
			result[length] = fn(array[length]);
		}
		return result;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings or email
	 * addresses.
	 * @private
	 * @param {String} domain The domain name or email address.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		var parts = string.split('@');
		var result = '';
		if (parts.length > 1) {
			// In email addresses, only the domain name should be punycoded. Leave
			// the local part (i.e. everything up to `@`) intact.
			result = parts[0] + '@';
			string = parts[1];
		}
		// Avoid `split(regex)` for IE8 compatibility. See #17.
		string = string.replace(regexSeparators, '\x2E');
		var labels = string.split('.');
		var encoded = map(labels, fn).join('.');
		return result + encoded;
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
	 * Punycode string of ASCII-only symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name or an email address
	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
	 * it doesn't matter if you call it on a string that has already been
	 * converted to Unicode.
	 * @memberOf punycode
	 * @param {String} input The Punycoded domain name or email address to
	 * convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(input) {
		return mapDomain(input, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name or an email address to
	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
	 * i.e. it doesn't matter if you call it with a domain that's already in
	 * ASCII.
	 * @memberOf punycode
	 * @param {String} input The domain name or email address to convert, as a
	 * Unicode string.
	 * @returns {String} The Punycode representation of the given domain name or
	 * email address.
	 */
	function toASCII(input) {
		return mapDomain(input, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.3.2',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && freeModule) {
		if (module.exports == freeExports) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],8:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],9:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],10:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":8,"./encode":9}],11:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var punycode = require('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a puny coded representation of "domain".
      // It only converts the part of the domain name that
      // has non ASCII characters. I.e. it dosent matter if
      // you call it with a domain that already is in ASCII.
      var domainArray = this.hostname.split('.');
      var newOut = [];
      for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            'xn--' + punycode.encode(s) : s);
      }
      this.hostname = newOut.join('.');
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  Object.keys(this).forEach(function(k) {
    result[k] = this[k];
  }, this);

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    Object.keys(relative).forEach(function(k) {
      if (k !== 'protocol')
        result[k] = relative[k];
    });

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      Object.keys(relative).forEach(function(k) {
        result[k] = relative[k];
      });
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!isNull(result.pathname) || !isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!isNull(result.pathname) || !isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

function isString(arg) {
  return typeof arg === "string";
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isNull(arg) {
  return arg === null;
}
function isNullOrUndefined(arg) {
  return  arg == null;
}

},{"punycode":7,"querystring":10}],12:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
/**
 * Execute a callback for each element in an array.
 *
 * @param array - The array of values to iterate.
 *
 * @param callback - The callback to invoke for the array elements.
 *
 * @param fromIndex - The starting index for iteration.
 *
 * @param wrap - Whether iteration wraps around at the end of the array.
 *
 * @returns The first value returned by `callback` which is not
 *   equal to `undefined`, or `undefined` if the callback does
 *   not return a value or if the start index is out of range.
 *
 * #### Notes
 * It is not safe to modify the size of the array while iterating.
 *
 * #### Example
 * ```typescript
 * import * as arrays from 'phosphor-arrays';
 *
 * function logger(value: number): void {
 *   console.log(value);
 * }
 *
 * var data = [1, 2, 3, 4];
 * arrays.forEach(data, logger);           // logs 1, 2, 3, 4
 * arrays.forEach(data, logger, 2);        // logs 3, 4
 * arrays.forEach(data, logger, 2, true);  // logs 3, 4, 1, 2
 * arrays.forEach(data, (v, i) => {        // 2
 *   if (v === 3) return i;
 * });
 * ```
 *
 * **See also** [[rforEach]]
 */
function forEach(array, callback, fromIndex, wrap) {
    if (fromIndex === void 0) { fromIndex = 0; }
    if (wrap === void 0) { wrap = false; }
    var start = fromIndex | 0;
    if (start < 0 || start >= array.length) {
        return void 0;
    }
    if (wrap) {
        for (var i = 0, n = array.length; i < n; ++i) {
            var j = (start + i) % n;
            var result = callback(array[j], j);
            if (result !== void 0)
                return result;
        }
    }
    else {
        for (var i = start, n = array.length; i < n; ++i) {
            var result = callback(array[i], i);
            if (result !== void 0)
                return result;
        }
    }
    return void 0;
}
exports.forEach = forEach;
/**
 * Execute a callback for each element in an array, in reverse.
 *
 * @param array - The array of values to iterate.
 *
 * @param callback - The callback to invoke for the array elements.
 *
 * @param fromIndex - The starting index for iteration.
 *
 * @param wrap - Whether iteration wraps around at the end of the array.
 *
 * @returns The first value returned by `callback` which is not
 *   equal to `undefined`, or `undefined` if the callback does
 *   not return a value or if the start index is out of range.
 *
 * #### Notes
 * It is not safe to modify the size of the array while iterating.
 *
 * #### Example
 * ```typescript
 * import * as arrays from 'phosphor-arrays';
 *
 * function logger(value: number): void {
 *   console.log(value);
 * }
 *
 * var data = [1, 2, 3, 4];
 * arrays.rforEach(data, logger);           // logs 4, 3, 2, 1
 * arrays.rforEach(data, logger, 2);        // logs 3, 2, 1
 * arrays.rforEach(data, logger, 2, true);  // logs 3, 2, 1, 4
 * arrays.rforEach(data, (v, i) => {        // 2
 *   if (v === 3) return i;
 * });
 * ```
 * **See also** [[forEach]]
 */
function rforEach(array, callback, fromIndex, wrap) {
    if (fromIndex === void 0) { fromIndex = array.length - 1; }
    if (wrap === void 0) { wrap = false; }
    var start = fromIndex | 0;
    if (start < 0 || start >= array.length) {
        return void 0;
    }
    if (wrap) {
        for (var i = 0, n = array.length; i < n; ++i) {
            var j = (start - i + n) % n;
            var result = callback(array[j], j);
            if (result !== void 0)
                return result;
        }
    }
    else {
        for (var i = start; i >= 0; --i) {
            var result = callback(array[i], i);
            if (result !== void 0)
                return result;
        }
    }
    return void 0;
}
exports.rforEach = rforEach;
/**
 * Find the index of the first value which matches a predicate.
 *
 * @param array - The array of values to be searched.
 *
 * @param pred - The predicate function to apply to the values.
 *
 * @param fromIndex - The starting index of the search.
 *
 * @param wrap - Whether the search wraps around at the end of the array.
 *
 * @returns The index of the first matching value, or `-1` if no value
 *   matches the predicate or if the start index is out of range.
 *
 * #### Notes
 * It is not safe to modify the size of the array while iterating.
 *
 * #### Example
 * ```typescript
 * import * as arrays from 'phosphor-arrays';
 *
 * function isEven(value: number): boolean {
 *   return value % 2 === 0;
 * }
 *
 * var data = [1, 2, 3, 4, 3, 2, 1];
 * arrays.findIndex(data, isEven);           // 1
 * arrays.findIndex(data, isEven, 4);        // 5
 * arrays.findIndex(data, isEven, 6);        // -1
 * arrays.findIndex(data, isEven, 6, true);  // 1
 * ```
 *
 * **See also** [[rfindIndex]].
 */
function findIndex(array, pred, fromIndex, wrap) {
    if (fromIndex === void 0) { fromIndex = 0; }
    if (wrap === void 0) { wrap = false; }
    var start = fromIndex | 0;
    if (start < 0 || start >= array.length) {
        return -1;
    }
    if (wrap) {
        for (var i = 0, n = array.length; i < n; ++i) {
            var j = (start + i) % n;
            if (pred(array[j], j))
                return j;
        }
    }
    else {
        for (var i = start, n = array.length; i < n; ++i) {
            if (pred(array[i], i))
                return i;
        }
    }
    return -1;
}
exports.findIndex = findIndex;
/**
 * Find the index of the last value which matches a predicate.
 *
 * @param array - The array of values to be searched.
 *
 * @param pred - The predicate function to apply to the values.
 *
 * @param fromIndex - The starting index of the search.
 *
 * @param wrap - Whether the search wraps around at the front of the array.
 *
 * @returns The index of the last matching value, or `-1` if no value
 *   matches the predicate or if the start index is out of range.
 *
 * #### Notes
 * It is not safe to modify the size of the array while iterating.
 *
 * #### Example
 * ```typescript
 * import * as arrays from 'phosphor-arrays';
 *
 * function isEven(value: number): boolean {
 *   return value % 2 === 0;
 * }
 *
 * var data = [1, 2, 3, 4, 3, 2, 1];
 * arrays.rfindIndex(data, isEven);           // 5
 * arrays.rfindIndex(data, isEven, 4);        // 3
 * arrays.rfindIndex(data, isEven, 0);        // -1
 * arrays.rfindIndex(data, isEven, 0, true);  // 5
 * ```
 *
 * **See also** [[findIndex]].
 */
function rfindIndex(array, pred, fromIndex, wrap) {
    if (fromIndex === void 0) { fromIndex = array.length - 1; }
    if (wrap === void 0) { wrap = false; }
    var start = fromIndex | 0;
    if (start < 0 || start >= array.length) {
        return -1;
    }
    if (wrap) {
        for (var i = 0, n = array.length; i < n; ++i) {
            var j = (start - i + n) % n;
            if (pred(array[j], j))
                return j;
        }
    }
    else {
        for (var i = start; i >= 0; --i) {
            if (pred(array[i], i))
                return i;
        }
    }
    return -1;
}
exports.rfindIndex = rfindIndex;
/**
 * Find the first value which matches a predicate.
 *
 * @param array - The array of values to be searched.
 *
 * @param pred - The predicate function to apply to the values.
 *
 * @param fromIndex - The starting index of the search.
 *
 * @param wrap - Whether the search wraps around at the end of the array.
 *
 * @returns The first matching value, or `undefined` if no value matches
 *   the predicate or if the start index is out of range.
 *
 * #### Notes
 * It is not safe to modify the size of the array while iterating.
 *
 * #### Example
 * ```typescript
 * import * as arrays from 'phosphor-arrays';
 *
 * function isEven(value: number): boolean {
 *   return value % 2 === 0;
 * }
 *
 * var data = [1, 2, 3, 4, 3, 2, 1];
 * arrays.find(data, isEven);           // 2
 * arrays.find(data, isEven, 4);        // 2
 * arrays.find(data, isEven, 6);        // undefined
 * arrays.find(data, isEven, 6, true);  // 2
 * ```
 *
 * **See also** [[rfind]].
 */
function find(array, pred, fromIndex, wrap) {
    var i = findIndex(array, pred, fromIndex, wrap);
    return i !== -1 ? array[i] : void 0;
}
exports.find = find;
/**
 * Find the last value which matches a predicate.
 *
 * @param array - The array of values to be searched.
 *
 * @param pred - The predicate function to apply to the values.
 *
 * @param fromIndex - The starting index of the search.
 *
 * @param wrap - Whether the search wraps around at the front of the array.
 *
 * @returns The last matching value, or `undefined` if no value matches
 *   the predicate or if the start index is out of range.
 *
 * #### Notes
 * The range of visited indices is set before the first invocation of
 * `pred`. It is not safe for `pred` to change the length of `array`.
 *
 * #### Example
 * ```typescript
 * import * as arrays from 'phosphor-arrays';
 *
 * function isEven(value: number): boolean {
 *   return value % 2 === 0;
 * }
 *
 * var data = [1, 2, 3, 4, 3, 2, 1];
 * arrays.rfind(data, isEven);           // 2
 * arrays.rfind(data, isEven, 4);        // 4
 * arrays.rfind(data, isEven, 0);        // undefined
 * arrays.rfind(data, isEven, 0, true);  // 2
 * ```
 *
 * **See also** [[find]].
 */
function rfind(array, pred, fromIndex, wrap) {
    var i = rfindIndex(array, pred, fromIndex, wrap);
    return i !== -1 ? array[i] : void 0;
}
exports.rfind = rfind;
/**
 * Insert an element into an array at a specified index.
 *
 * @param array - The array of values to modify.
 *
 * @param index - The index at which to insert the value. This value
 *   is clamped to the bounds of the array.
 *
 * @param value - The value to insert into the array.
 *
 * @returns The index at which the value was inserted.
 *
 * #### Example
 * ```typescript
 * import * as arrays from 'phosphor-arrays';
 *
 * var data = [0, 1, 2, 3, 4];
 * arrays.insert(data, 0, 12);  // 0
 * arrays.insert(data, 3, 42);  // 3
 * arrays.insert(data, -9, 9);  // 0
 * arrays.insert(data, 12, 8);  // 8
 * console.log(data);           // [9, 12, 0, 1, 42, 2, 3, 4, 8]
 * ```
 *
 * **See also** [[removeAt]] and [[remove]]
 */
function insert(array, index, value) {
    var j = Math.max(0, Math.min(index | 0, array.length));
    for (var i = array.length; i > j; --i) {
        array[i] = array[i - 1];
    }
    array[j] = value;
    return j;
}
exports.insert = insert;
/**
 * Move an element in an array from one index to another.
 *
 * @param array - The array of values to modify.
 *
 * @param fromIndex - The index of the element to move.
 *
 * @param toIndex - The target index of the element.
 *
 * @returns `true` if the element was moved, or `false` if either
 *   index is out of range.
 *
 * #### Example
 * ```typescript
 * import * as arrays from 'phosphor-arrays';
 *
 * var data = [0, 1, 2, 3, 4];
 * arrays.move(data, 1, 2);   // true
 * arrays.move(data, -1, 0);  // false
 * arrays.move(data, 4, 2);   // true
 * arrays.move(data, 10, 0);  // false
 * console.log(data);         // [0, 2, 4, 1, 3]
 * ```
 */
function move(array, fromIndex, toIndex) {
    var j = fromIndex | 0;
    if (j < 0 || j >= array.length) {
        return false;
    }
    var k = toIndex | 0;
    if (k < 0 || k >= array.length) {
        return false;
    }
    var value = array[j];
    if (j > k) {
        for (var i = j; i > k; --i) {
            array[i] = array[i - 1];
        }
    }
    else if (j < k) {
        for (var i = j; i < k; ++i) {
            array[i] = array[i + 1];
        }
    }
    array[k] = value;
    return true;
}
exports.move = move;
/**
 * Remove an element from an array at a specified index.
 *
 * @param array - The array of values to modify.
 *
 * @param index - The index of the element to remove.
 *
 * @returns The removed value, or `undefined` if the index is out
 *   of range.
 *
 * #### Example
 * ```typescript
 * import * as arrays from 'phosphor-arrays';
 *
 * var data = [0, 1, 2, 3, 4];
 * arrays.removeAt(data, 1);   // 1
 * arrays.removeAt(data, 3);   // 4
 * arrays.removeAt(data, 10);  // undefined
 * console.log(data);          // [0, 2, 3]
 * ```
 *
 * **See also** [[remove]] and [[insert]]
 */
function removeAt(array, index) {
    var j = index | 0;
    if (j < 0 || j >= array.length) {
        return void 0;
    }
    var value = array[j];
    for (var i = j + 1, n = array.length; i < n; ++i) {
        array[i - 1] = array[i];
    }
    array.length -= 1;
    return value;
}
exports.removeAt = removeAt;
/**
 * Remove the first occurrence of a value from an array.
 *
 * @param array - The array of values to modify.
 *
 * @param value - The value to remove from the array.
 *
 * @returns The index where the value was located, or `-1` if the
 *   value is not the array.
 *
 * #### Example
 * ```typescript
 * import * as arrays from 'phosphor-arrays';
 *
 * var data = [0, 1, 2, 3, 4];
 * arrays.remove(data, 1);  // 1
 * arrays.remove(data, 3);  // 2
 * arrays.remove(data, 7);  // -1
 * console.log(data);       // [0, 2, 4]
 * ```
 *
 * **See also** [[removeAt]] and [[insert]]
 */
function remove(array, value) {
    var j = -1;
    for (var i = 0, n = array.length; i < n; ++i) {
        if (array[i] === value) {
            j = i;
            break;
        }
    }
    if (j === -1) {
        return -1;
    }
    for (var i = j + 1, n = array.length; i < n; ++i) {
        array[i - 1] = array[i];
    }
    array.length -= 1;
    return j;
}
exports.remove = remove;
/**
 * Reverse an array in-place subject to an optional range.
 *
 * @param array - The array to reverse.
 *
 * @param fromIndex - The index of the first element of the range.
 *   This value will be clamped to the array bounds.
 *
 * @param toIndex - The index of the last element of the range.
 *   This value will be clamped to the array bounds.
 *
 * @returns A reference to the original array.
 *
 * #### Example
 * ```typescript
 * import * as arrays from 'phosphor-arrays';
 *
 * var data = [0, 1, 2, 3, 4];
 * arrays.reverse(data, 1, 3);    // [0, 3, 2, 1, 4]
 * arrays.reverse(data, 3);       // [0, 3, 2, 4, 1]
 * arrays.reverse(data);          // [1, 4, 2, 3, 0]
 * ```
 *
 * **See also** [[rotate]]
 */
function reverse(array, fromIndex, toIndex) {
    if (fromIndex === void 0) { fromIndex = 0; }
    if (toIndex === void 0) { toIndex = array.length; }
    var i = Math.max(0, Math.min(fromIndex | 0, array.length - 1));
    var j = Math.max(0, Math.min(toIndex | 0, array.length - 1));
    if (j < i)
        i = j + (j = i, 0);
    while (i < j) {
        var tmpval = array[i];
        array[i++] = array[j];
        array[j--] = tmpval;
    }
    return array;
}
exports.reverse = reverse;
/**
 * Rotate the elements of an array by a positive or negative delta.
 *
 * @param array - The array to rotate.
 *
 * @param delta - The amount of rotation to apply to the elements. A
 *   positive delta will shift the elements to the left. A negative
 *   delta will shift the elements to the right.
 *
 * @returns A reference to the original array.
 *
 * #### Notes
 * This executes in `O(n)` time and `O(1)` space.
 *
 * #### Example
 * ```typescript
 * import * as arrays from 'phosphor-arrays';
 *
 * var data = [0, 1, 2, 3, 4];
 * arrays.rotate(data, 2);    // [2, 3, 4, 0, 1]
 * arrays.rotate(data, -2);   // [0, 1, 2, 3, 4]
 * arrays.rotate(data, 10);   // [0, 1, 2, 3, 4]
 * arrays.rotate(data, 9);    // [4, 0, 1, 2, 3]
 * ```
 *
 * **See also** [[reverse]]
 */
function rotate(array, delta) {
    var n = array.length;
    if (n <= 1) {
        return array;
    }
    var d = delta | 0;
    if (d > 0) {
        d = d % n;
    }
    else if (d < 0) {
        d = ((d % n) + n) % n;
    }
    if (d === 0) {
        return array;
    }
    reverse(array, 0, d - 1);
    reverse(array, d, n - 1);
    reverse(array, 0, n - 1);
    return array;
}
exports.rotate = rotate;
/**
 * Using a binary search, find the index of the first element in an
 * array which compares `>=` to a value.
 *
 * @param array - The array of values to be searched. It must be sorted
 *   in ascending order.
 *
 * @param value - The value to locate in the array.
 *
 * @param cmp - The comparison function which returns `true` if an
 *   array element is less than the given value.
 *
 * @returns The index of the first element in `array` which compares
 *   `>=` to `value`, or `array.length` if there is no such element.
 *
 * #### Notes
 * It is not safe for the comparison function to modify the array.
 *
 * #### Example
 * ```typescript
 * import * as arrays from 'phosphor-arrays';
 *
 * function numberCmp(a: number, b: number): boolean {
 *   return a < b;
 * }
 *
 * var data = [0, 3, 4, 7, 7, 9];
 * arrays.lowerBound(data, 0, numberCmp);   // 0
 * arrays.lowerBound(data, 6, numberCmp);   // 3
 * arrays.lowerBound(data, 7, numberCmp);   // 3
 * arrays.lowerBound(data, -1, numberCmp);  // 0
 * arrays.lowerBound(data, 10, numberCmp);  // 6
 * ```
 *
 * **See also** [[upperBound]]
 */
function lowerBound(array, value, cmp) {
    var begin = 0;
    var half;
    var middle;
    var n = array.length;
    while (n > 0) {
        half = n >> 1;
        middle = begin + half;
        if (cmp(array[middle], value)) {
            begin = middle + 1;
            n -= half + 1;
        }
        else {
            n = half;
        }
    }
    return begin;
}
exports.lowerBound = lowerBound;
/**
 * Using a binary search, find the index of the first element in an
 * array which compares `>` than a value.
 *
 * @param array - The array of values to be searched. It must be sorted
 *   in ascending order.
 *
 * @param value - The value to locate in the array.
 *
 * @param cmp - The comparison function which returns `true` if the
 *   the given value is less than an array element.
 *
 * @returns The index of the first element in `array` which compares
 *   `>` than `value`, or `array.length` if there is no such element.
 *
 * #### Notes
 * It is not safe for the comparison function to modify the array.
 *
 * #### Example
 * ```typescript
 * import * as arrays from 'phosphor-arrays';
 *
 * function numberCmp(a: number, b: number): number {
 *   return a < b;
 * }
 *
 * var data = [0, 3, 4, 7, 7, 9];
 * arrays.upperBound(data, 0, numberCmp);   // 1
 * arrays.upperBound(data, 6, numberCmp);   // 3
 * arrays.upperBound(data, 7, numberCmp);   // 5
 * arrays.upperBound(data, -1, numberCmp);  // 0
 * arrays.upperBound(data, 10, numberCmp);  // 6
 * ```
 *
 * **See also** [[lowerBound]]
 */
function upperBound(array, value, cmp) {
    var begin = 0;
    var half;
    var middle;
    var n = array.length;
    while (n > 0) {
        half = n >> 1;
        middle = begin + half;
        if (cmp(value, array[middle])) {
            n = half;
        }
        else {
            begin = middle + 1;
            n -= half + 1;
        }
    }
    return begin;
}
exports.upperBound = upperBound;

},{}],13:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
/**
 * The sizer object for the [[boxCalc]] function.
 *
 * A box sizer holds the geometry information for an object along the
 * layout orientation. An array of box sizers representing a line of
 * objects is passed to [[boxCalc]] along with the amount of space
 * available for layout. The algorithm will update the [[size]] of
 * each box sizer with its computed size.
 *
 * #### Notes
 * For best performance, this class should be treated as a raw data
 * struct. It should not typically be subclassed.
 */
var BoxSizer = (function () {
    function BoxSizer() {
        /**
         * The preferred size for the sizer.
         *
         * The sizer will be given this initial size subject to its size
         * bounds. The sizer will not deviate from this size unless such
         * deviation is required to fit into the available layout space.
         *
         * #### Notes
         * There is no limit to this value, but it will be clamped to the
         * bounds defined by [[minSize]] and [[maxSize]].
         *
         * The default value is `0`.
         */
        this.sizeHint = 0;
        /**
         * The minimum size of the sizer.
         *
         * The sizer will never be sized less than this value, even if
         * it means the sizer will overflow the available layout space.
         *
         * #### Notes
         * It is assumed that this value lies in the range `[0, Infinity)`
         * and that it is `<=` to [[maxSize]]. Failure to adhere to this
         * constraint will yield undefined results.
         *
         * The default value is `0`.
         */
        this.minSize = 0;
        /**
         * The maximum size of the sizer.
         *
         * The sizer will never be sized greater than this value, even if
         * it means the sizer will underflow the available layout space.
         *
         * #### Notes
         * It is assumed that this value lies in the range `[0, Infinity]`
         * and that it is `>=` to [[minSize]]. Failure to adhere to this
         * constraint will yield undefined results.
         *
         * The default value is `Infinity`.
         */
        this.maxSize = Infinity;
        /**
         * The stretch factor for the sizer.
         *
         * This controls how much the sizer stretches relative to its sibling
         * sizers when layout space is distributed. A stretch factor of zero
         * is special and will cause the sizer to only be resized after all
         * other sizers with a stretch factor greater than zero have been
         * resized to their limits.
         *
         * #### Notes
         * It is assumed that this value is an integer that lies in the range
         * `[0, Infinity)`. Failure to adhere to this constraint will yield
         * undefined results.
         *
         * The default value is `1`.
         */
        this.stretch = 1;
        /**
         * The computed size of the sizer.
         *
         * This value is the output of a call to [[boxCalc]]. It represents
         * the computed size for the object along the layout orientation,
         * and will always lie in the range `[minSize, maxSize]`.
         *
         * #### Notes
         * This value is output only. Changing the value will have no effect.
         */
        this.size = 0;
        /**
         * An internal storage property for the layout algorithm.
         *
         * #### Notes
         * This value is used as temporary storage by the layout algorithm.
         * Changing the value will have no effect.
         */
        this.done = false;
    }
    return BoxSizer;
})();
exports.BoxSizer = BoxSizer;
/**
 * Compute the optimal layout sizes for an array of box sizers.
 *
 * This distributes the available layout space among the box sizers
 * according to the following algorithm:
 *
 * 1. Initialize the sizers's size to its size hint and compute the
 *    sums for each of size hint, min size, and max size.
 *
 * 2. If the total size hint equals the available space, return.
 *
 * 3. If the available space is less than the total min size, set all
 *    sizers to their min size and return.
 *
 * 4. If the available space is greater than the total max size, set
 *    all sizers to their max size and return.
 *
 * 5. If the layout space is less than the total size hint, distribute
 *    the negative delta as follows:
 *
 *    a. Shrink each sizer with a stretch factor greater than zero by
 *       an amount proportional to the negative space and the sum of
 *       stretch factors. If the sizer reaches its min size, remove
 *       it and its stretch factor from the computation.
 *
 *    b. If after adjusting all stretch sizers there remains negative
 *       space, distribute the space equally among the sizers with a
 *       stretch factor of zero. If a sizer reaches its min size,
 *       remove it from the computation.
 *
 * 6. If the layout space is greater than the total size hint,
 *    distribute the positive delta as follows:
 *
 *    a. Expand each sizer with a stretch factor greater than zero by
 *       an amount proportional to the postive space and the sum of
 *       stretch factors. If the sizer reaches its max size, remove
 *       it and its stretch factor from the computation.
 *
 *    b. If after adjusting all stretch sizers there remains positive
 *       space, distribute the space equally among the sizers with a
 *       stretch factor of zero. If a sizer reaches its max size,
 *       remove it from the computation.
 *
 * 7. return
 *
 * @param sizers - The sizers for a particular layout line.
 *
 * @param space - The available layout space for the sizers.
 *
 * #### Notes
 * This function can be called at any time to recompute the layout
 * sizing for an existing array of sizers. The previously computed
 * results will have no effect on the new output. It is therefore
 * not necessary to create new sizers on each resize event.
 */
function boxCalc(sizers, space) {
    // Bail early if there is nothing to do.
    var count = sizers.length;
    if (count === 0) {
        return;
    }
    // Setup the size and stretch counters.
    var totalMin = 0;
    var totalMax = 0;
    var totalSize = 0;
    var totalStretch = 0;
    var stretchCount = 0;
    // Setup the sizers and compute the totals.
    for (var i = 0; i < count; ++i) {
        var sizer = sizers[i];
        initSizer(sizer);
        totalSize += sizer.size;
        totalMin += sizer.minSize;
        totalMax += sizer.maxSize;
        if (sizer.stretch > 0) {
            totalStretch += sizer.stretch;
            stretchCount++;
        }
    }
    // If the space is equal to the total size, return.
    if (space === totalSize) {
        return;
    }
    // If the space is less than the total min, minimize each sizer.
    if (space <= totalMin) {
        for (var i = 0; i < count; ++i) {
            var sizer = sizers[i];
            sizer.size = sizer.minSize;
        }
        return;
    }
    // If the space is greater than the total max, maximize each sizer.
    if (space >= totalMax) {
        for (var i = 0; i < count; ++i) {
            var sizer = sizers[i];
            sizer.size = sizer.maxSize;
        }
        return;
    }
    // The loops below perform sub-pixel precision sizing. A near zero
    // value is used for compares instead of zero to ensure that the
    // loop terminates when the subdivided space is reasonably small.
    var nearZero = 0.01;
    // A counter which is decremented each time a sizer is resized to
    // its limit. This ensures the loops terminate even if there is
    // space remaining to distribute.
    var notDoneCount = count;
    // Distribute negative delta space.
    if (space < totalSize) {
        // Shrink each stretchable sizer by an amount proportional to its
        // stretch factor. If a sizer reaches its min size it's marked as
        // done. The loop progresses in phases where each sizer is given
        // a chance to consume its fair share for the pass, regardless of
        // whether a sizer before it reached its limit. This continues
        // until the stretchable sizers or the free space is exhausted.
        var freeSpace = totalSize - space;
        while (stretchCount > 0 && freeSpace > nearZero) {
            var distSpace = freeSpace;
            var distStretch = totalStretch;
            for (var i = 0; i < count; ++i) {
                var sizer = sizers[i];
                if (sizer.done || sizer.stretch === 0) {
                    continue;
                }
                var amt = sizer.stretch * distSpace / distStretch;
                if (sizer.size - amt <= sizer.minSize) {
                    freeSpace -= sizer.size - sizer.minSize;
                    totalStretch -= sizer.stretch;
                    sizer.size = sizer.minSize;
                    sizer.done = true;
                    notDoneCount--;
                    stretchCount--;
                }
                else {
                    freeSpace -= amt;
                    sizer.size -= amt;
                }
            }
        }
        // Distribute any remaining space evenly among the non-stretchable
        // sizers. This progresses in phases in the same manner as above.
        while (notDoneCount > 0 && freeSpace > nearZero) {
            var amt = freeSpace / notDoneCount;
            for (var i = 0; i < count; ++i) {
                var sizer = sizers[i];
                if (sizer.done) {
                    continue;
                }
                if (sizer.size - amt <= sizer.minSize) {
                    freeSpace -= sizer.size - sizer.minSize;
                    sizer.size = sizer.minSize;
                    sizer.done = true;
                    notDoneCount--;
                }
                else {
                    freeSpace -= amt;
                    sizer.size -= amt;
                }
            }
        }
    }
    else {
        // Expand each stretchable sizer by an amount proportional to its
        // stretch factor. If a sizer reaches its max size it's marked as
        // done. The loop progresses in phases where each sizer is given
        // a chance to consume its fair share for the pass, regardless of
        // whether a sizer before it reached its limit. This continues
        // until the stretchable sizers or the free space is exhausted.
        var freeSpace = space - totalSize;
        while (stretchCount > 0 && freeSpace > nearZero) {
            var distSpace = freeSpace;
            var distStretch = totalStretch;
            for (var i = 0; i < count; ++i) {
                var sizer = sizers[i];
                if (sizer.done || sizer.stretch === 0) {
                    continue;
                }
                var amt = sizer.stretch * distSpace / distStretch;
                if (sizer.size + amt >= sizer.maxSize) {
                    freeSpace -= sizer.maxSize - sizer.size;
                    totalStretch -= sizer.stretch;
                    sizer.size = sizer.maxSize;
                    sizer.done = true;
                    notDoneCount--;
                    stretchCount--;
                }
                else {
                    freeSpace -= amt;
                    sizer.size += amt;
                }
            }
        }
        // Distribute any remaining space evenly among the non-stretchable
        // sizers. This progresses in phases in the same manner as above.
        while (notDoneCount > 0 && freeSpace > nearZero) {
            var amt = freeSpace / notDoneCount;
            for (var i = 0; i < count; ++i) {
                var sizer = sizers[i];
                if (sizer.done) {
                    continue;
                }
                if (sizer.size + amt >= sizer.maxSize) {
                    freeSpace -= sizer.maxSize - sizer.size;
                    sizer.size = sizer.maxSize;
                    sizer.done = true;
                    notDoneCount--;
                }
                else {
                    freeSpace -= amt;
                    sizer.size += amt;
                }
            }
        }
    }
}
exports.boxCalc = boxCalc;
/**
 * (Re)initialize a box sizer's data for a layout pass.
 */
function initSizer(sizer) {
    sizer.size = Math.max(sizer.minSize, Math.min(sizer.sizeHint, sizer.maxSize));
    sizer.done = false;
}

},{}],14:[function(require,module,exports){
var css = "/*-----------------------------------------------------------------------------\n| Copyright (c) 2014-2015, PhosphorJS Contributors\n|\n| Distributed under the terms of the BSD 3-Clause License.\n|\n| The full license is in the file LICENSE, distributed with this software.\n|----------------------------------------------------------------------------*/\n.p-BoxPanel {\n  position: relative;\n}\n.p-BoxPanel > .p-Widget {\n  position: absolute;\n}\n"; (require("browserify-css").createStyle(css, { "href": "node_modules/phosphor-boxpanel/lib/index.css"})); module.exports = css;
},{"browserify-css":1}],15:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var arrays = require('phosphor-arrays');
var phosphor_boxengine_1 = require('phosphor-boxengine');
var phosphor_messaging_1 = require('phosphor-messaging');
var phosphor_properties_1 = require('phosphor-properties');
var phosphor_widget_1 = require('phosphor-widget');
require('./index.css');
/**
 * `p-BoxPanel`: the class name added to BoxPanel instances.
 */
exports.BOX_PANEL_CLASS = 'p-BoxPanel';
/**
 * `p-mod-left-to-right`: the class name added to ltr box panels.
 */
exports.LTR_CLASS = 'p-mod-left-to-right';
/**
 * `p-mod-right-to-left`: the class name added to rtl box panels.
 */
exports.RTL_CLASS = 'p-mod-right-to-left';
/**
 * `p-mod-top-to-bottom`: the class name added to ttb box panels.
 */
exports.TTB_CLASS = 'p-mod-top-to-bottom';
/**
 * `p-mod-bottom-to-top`: the class name added to btt box panels.
 */
exports.BTT_CLASS = 'p-mod-bottom-to-top';
/**
 * The layout direction of a box panel.
 */
(function (Direction) {
    /**
     * Left to right direction.
     */
    Direction[Direction["LeftToRight"] = 0] = "LeftToRight";
    /**
     * Right to left direction.
     */
    Direction[Direction["RightToLeft"] = 1] = "RightToLeft";
    /**
     * Top to bottom direction.
     */
    Direction[Direction["TopToBottom"] = 2] = "TopToBottom";
    /**
     * Bottom to top direction.
     */
    Direction[Direction["BottomToTop"] = 3] = "BottomToTop";
})(exports.Direction || (exports.Direction = {}));
var Direction = exports.Direction;
/**
 * A widget which arranges its children in a single row or column.
 */
var BoxPanel = (function (_super) {
    __extends(BoxPanel, _super);
    /**
     * Construct a new box panel.
     */
    function BoxPanel() {
        _super.call(this);
        this._fixedSpace = 0;
        this._sizers = [];
        this.addClass(exports.BOX_PANEL_CLASS);
        this.addClass(exports.TTB_CLASS);
    }
    /**
     * Get the box panel stretch factor for the given widget.
     *
     * @param widget - The widget of interest.
     *
     * @returns The box panel stretch factor for the widget.
     *
     * #### Notes
     * This is a pure delegate to the [[stretchProperty]].
     */
    BoxPanel.getStretch = function (widget) {
        return BoxPanel.stretchProperty.get(widget);
    };
    /**
     * Set the box panel stretch factor for the given widget.
     *
     * @param widget - The widget of interest.
     *
     * @param value - The value for the stretch factor.
     *
     * #### Notes
     * This is a pure delegate to the [[stretchProperty]].
     */
    BoxPanel.setStretch = function (widget, value) {
        BoxPanel.stretchProperty.set(widget, value);
    };
    /**
     * Get the box panel size basis for the given widget.
     *
     * @param widget - The widget of interest.
     *
     * @returns The box panel size basis for the widget.
     *
     * #### Notes
     * This is a pure delegate to the [[sizeBasisProperty]].
     */
    BoxPanel.getSizeBasis = function (widget) {
        return BoxPanel.sizeBasisProperty.get(widget);
    };
    /**
     * Set the box panel size basis for the given widget.
     *
     * @param widget - The widget of interest.
     *
     * @param value - The value for the size basis.
     *
     * #### Notes
     * This is a pure delegate to the [[sizeBasisProperty]].
     */
    BoxPanel.setSizeBasis = function (widget, value) {
        BoxPanel.sizeBasisProperty.set(widget, value);
    };
    /**
     * Dispose of the resources held by the panel.
     */
    BoxPanel.prototype.dispose = function () {
        this._sizers.length = 0;
        _super.prototype.dispose.call(this);
    };
    Object.defineProperty(BoxPanel.prototype, "direction", {
        /**
         * Get the layout direction for the box panel.
         *
         * #### Notes
         * This is a pure delegate to the [[directionProperty]].
         */
        get: function () {
            return BoxPanel.directionProperty.get(this);
        },
        /**
         * Set the layout direction for the box panel.
         *
         * #### Notes
         * This is a pure delegate to the [[directionProperty]].
         */
        set: function (value) {
            BoxPanel.directionProperty.set(this, value);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(BoxPanel.prototype, "spacing", {
        /**
         * Get the inter-element spacing for the box panel.
         *
         * #### Notes
         * This is a pure delegate to the [[spacingProperty]].
         */
        get: function () {
            return BoxPanel.spacingProperty.get(this);
        },
        /**
         * Set the inter-element spacing for the box panel.
         *
         * #### Notes
         * This is a pure delegate to the [[spacingProperty]].
         */
        set: function (value) {
            BoxPanel.spacingProperty.set(this, value);
        },
        enumerable: true,
        configurable: true
    });
    /**
     * A message handler invoked on a `'child-added'` message.
     */
    BoxPanel.prototype.onChildAdded = function (msg) {
        phosphor_properties_1.Property.getChanged(msg.child).connect(this._onPropertyChanged, this);
        arrays.insert(this._sizers, msg.currentIndex, new phosphor_boxengine_1.BoxSizer());
        this.node.appendChild(msg.child.node);
        if (this.isAttached)
            phosphor_messaging_1.sendMessage(msg.child, phosphor_widget_1.MSG_AFTER_ATTACH);
        phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
    };
    /**
     * A message handler invoked on a `'child-removed'` message.
     */
    BoxPanel.prototype.onChildRemoved = function (msg) {
        phosphor_properties_1.Property.getChanged(msg.child).disconnect(this._onPropertyChanged, this);
        arrays.removeAt(this._sizers, msg.previousIndex);
        if (this.isAttached)
            phosphor_messaging_1.sendMessage(msg.child, phosphor_widget_1.MSG_BEFORE_DETACH);
        this.node.removeChild(msg.child.node);
        phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
        msg.child.clearOffsetGeometry();
    };
    /**
     * A message handler invoked on a `'child-moved'` message.
     */
    BoxPanel.prototype.onChildMoved = function (msg) {
        arrays.move(this._sizers, msg.previousIndex, msg.currentIndex);
        this.update();
    };
    /**
     * A message handler invoked on an `'after-show'` message.
     */
    BoxPanel.prototype.onAfterShow = function (msg) {
        this.update(true);
    };
    /**
     * A message handler invoked on an `'after-attach'` message.
     */
    BoxPanel.prototype.onAfterAttach = function (msg) {
        phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
    };
    /**
     * A message handler invoked on a `'child-shown'` message.
     */
    BoxPanel.prototype.onChildShown = function (msg) {
        phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
    };
    /**
     * A message handler invoked on a `'child-hidden'` message.
     */
    BoxPanel.prototype.onChildHidden = function (msg) {
        phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
    };
    /**
     * A message handler invoked on a `'resize'` message.
     */
    BoxPanel.prototype.onResize = function (msg) {
        if (this.isVisible) {
            if (msg.width < 0 || msg.height < 0) {
                var rect = this.offsetRect;
                this._layoutChildren(rect.width, rect.height);
            }
            else {
                this._layoutChildren(msg.width, msg.height);
            }
        }
    };
    /**
     * A message handler invoked on an `'update-request'` message.
     */
    BoxPanel.prototype.onUpdateRequest = function (msg) {
        if (this.isVisible) {
            var rect = this.offsetRect;
            this._layoutChildren(rect.width, rect.height);
        }
    };
    /**
     * A message handler invoked on a `'layout-request'` message.
     */
    BoxPanel.prototype.onLayoutRequest = function (msg) {
        if (this.isAttached) {
            this._setupGeometry();
        }
    };
    /**
     * Update the size constraints of the panel.
     */
    BoxPanel.prototype._setupGeometry = function () {
        // Compute the visible item count.
        var visibleCount = 0;
        for (var i = 0, n = this.childCount; i < n; ++i) {
            if (!this.childAt(i).hidden)
                visibleCount++;
        }
        // Update the fixed space for the visible items.
        this._fixedSpace = this.spacing * Math.max(0, visibleCount - 1);
        // Update the sizers and compute the new size limits.
        var minW = 0;
        var minH = 0;
        var maxW = Infinity;
        var maxH = Infinity;
        var dir = this.direction;
        if (dir === Direction.LeftToRight || dir === Direction.RightToLeft) {
            minW = this._fixedSpace;
            maxW = visibleCount > 0 ? minW : maxW;
            for (var i = 0, n = this.childCount; i < n; ++i) {
                var widget = this.childAt(i);
                var sizer = this._sizers[i];
                if (widget.hidden) {
                    sizer.minSize = 0;
                    sizer.maxSize = 0;
                    continue;
                }
                var limits = widget.sizeLimits;
                sizer.sizeHint = BoxPanel.getSizeBasis(widget);
                sizer.stretch = BoxPanel.getStretch(widget);
                sizer.minSize = limits.minWidth;
                sizer.maxSize = limits.maxWidth;
                minW += limits.minWidth;
                maxW += limits.maxWidth;
                minH = Math.max(minH, limits.minHeight);
                maxH = Math.min(maxH, limits.maxHeight);
            }
        }
        else {
            minH = this._fixedSpace;
            maxH = visibleCount > 0 ? minH : maxH;
            for (var i = 0, n = this.childCount; i < n; ++i) {
                var widget = this.childAt(i);
                var sizer = this._sizers[i];
                if (widget.hidden) {
                    sizer.minSize = 0;
                    sizer.maxSize = 0;
                    continue;
                }
                var limits = widget.sizeLimits;
                sizer.sizeHint = BoxPanel.getSizeBasis(widget);
                sizer.stretch = BoxPanel.getStretch(widget);
                sizer.minSize = limits.minHeight;
                sizer.maxSize = limits.maxHeight;
                minH += limits.minHeight;
                maxH += limits.maxHeight;
                minW = Math.max(minW, limits.minWidth);
                maxW = Math.min(maxW, limits.maxWidth);
            }
        }
        // Add the box sizing to the size constraints.
        var box = this.boxSizing;
        minW += box.horizontalSum;
        minH += box.verticalSum;
        maxW += box.horizontalSum;
        maxH += box.verticalSum;
        // Update the panel's size constraints.
        this.setSizeLimits(minW, minH, maxW, maxH);
        // Notifiy the parent that it should relayout.
        if (this.parent)
            phosphor_messaging_1.sendMessage(this.parent, phosphor_widget_1.MSG_LAYOUT_REQUEST);
        // Update the layout for the child widgets.
        this.update(true);
    };
    /**
     * Layout the children using the given offset width and height.
     */
    BoxPanel.prototype._layoutChildren = function (offsetWidth, offsetHeight) {
        // Bail early if their are no children to arrange.
        if (this.childCount === 0) {
            return;
        }
        // Compute the actual layout bounds adjusted for border and padding.
        var box = this.boxSizing;
        var top = box.paddingTop;
        var left = box.paddingLeft;
        var width = offsetWidth - box.horizontalSum;
        var height = offsetHeight - box.verticalSum;
        // Distribute the layout space and layout the items.
        var dir = this.direction;
        var spacing = this.spacing;
        if (dir === Direction.LeftToRight) {
            phosphor_boxengine_1.boxCalc(this._sizers, Math.max(0, width - this._fixedSpace));
            for (var i = 0, n = this.childCount; i < n; ++i) {
                var widget = this.childAt(i);
                if (widget.hidden) {
                    continue;
                }
                var size = this._sizers[i].size;
                widget.setOffsetGeometry(left, top, size, height);
                left += size + spacing;
            }
        }
        else if (dir === Direction.TopToBottom) {
            phosphor_boxengine_1.boxCalc(this._sizers, Math.max(0, height - this._fixedSpace));
            for (var i = 0, n = this.childCount; i < n; ++i) {
                var widget = this.childAt(i);
                if (widget.hidden) {
                    continue;
                }
                var size = this._sizers[i].size;
                widget.setOffsetGeometry(left, top, width, size);
                top += size + spacing;
            }
        }
        else if (dir === Direction.RightToLeft) {
            left += width;
            phosphor_boxengine_1.boxCalc(this._sizers, Math.max(0, width - this._fixedSpace));
            for (var i = 0, n = this.childCount; i < n; ++i) {
                var widget = this.childAt(i);
                if (widget.hidden) {
                    continue;
                }
                var size = this._sizers[i].size;
                widget.setOffsetGeometry(left - size, top, size, height);
                left -= size + spacing;
            }
        }
        else {
            top += height;
            phosphor_boxengine_1.boxCalc(this._sizers, Math.max(0, height - this._fixedSpace));
            for (var i = 0, n = this.childCount; i < n; ++i) {
                var widget = this.childAt(i);
                if (widget.hidden) {
                    continue;
                }
                var size = this._sizers[i].size;
                widget.setOffsetGeometry(left, top - size, width, size);
                top -= size + spacing;
            }
        }
    };
    /**
     * The change handler for the [[orientationProperty]].
     */
    BoxPanel.prototype._onDirectionChanged = function (old, value) {
        this.toggleClass(exports.LTR_CLASS, value === Direction.LeftToRight);
        this.toggleClass(exports.RTL_CLASS, value === Direction.RightToLeft);
        this.toggleClass(exports.TTB_CLASS, value === Direction.TopToBottom);
        this.toggleClass(exports.BTT_CLASS, value === Direction.BottomToTop);
        phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
    };
    /**
     * The handler for the child property changed signal.
     */
    BoxPanel.prototype._onPropertyChanged = function (sender, args) {
        switch (args.property) {
            case BoxPanel.stretchProperty:
            case BoxPanel.sizeBasisProperty:
                phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
        }
    };
    /**
     * A convenience alias of the `LeftToRight` [[Direction]].
     */
    BoxPanel.LeftToRight = Direction.LeftToRight;
    /**
     * A convenience alias of the `RightToLeft` [[Direction]].
     */
    BoxPanel.RightToLeft = Direction.RightToLeft;
    /**
     * A convenience alias of the `TopToBottom` [[Direction]].
     */
    BoxPanel.TopToBottom = Direction.TopToBottom;
    /**
     * A convenience alias of the `BottomToTop` [[Direction]].
     */
    BoxPanel.BottomToTop = Direction.BottomToTop;
    /**
     * The property descriptor for the box panel layout direction.
     *
     * The controls the arrangement of child widgets within the panel.
     * The default value is `TopToBottom`.
     *
     * **See also:** [[direction]]
     */
    BoxPanel.directionProperty = new phosphor_properties_1.Property({
        value: Direction.TopToBottom,
        changed: function (owner, old, value) { return owner._onDirectionChanged(old, value); },
    });
    /**
     * The property descriptor for the box panel spacing.
     *
     * The controls the fixed spacing between the child widgets, in
     * pixels. The default value is `8`.
     *
     * **See also:** [[spacing]]
     */
    BoxPanel.spacingProperty = new phosphor_properties_1.Property({
        value: 8,
        coerce: function (owner, value) { return Math.max(0, value | 0); },
        changed: function (owner) { return phosphor_messaging_1.postMessage(owner, phosphor_widget_1.MSG_LAYOUT_REQUEST); },
    });
    /**
     * The property descriptor for a widget stretch factor.
     *
     * This is an attached property which controls how much a child widget
     * stretches or shrinks relative to its siblings when the box panel is
     * resized. The default value is `0`.
     *
     * **See also:** [[getStretch]], [[setStretch]]
     */
    BoxPanel.stretchProperty = new phosphor_properties_1.Property({
        value: 0,
        coerce: function (owner, value) { return Math.max(0, value | 0); },
    });
    /**
     * The property descriptor for a widget size basis.
     *
     * This is an attached property which controls the preferred size of
     * a child widget. The widget will be initialized to this size before
     * being expanded or shrunk to fit the available layout space. The
     * default value is `0`.
     *
     * **See also:** [[getSizeBasis]], [[setSizeBasis]]
     */
    BoxPanel.sizeBasisProperty = new phosphor_properties_1.Property({
        value: 0,
        coerce: function (owner, value) { return Math.max(0, value | 0); },
    });
    return BoxPanel;
})(phosphor_widget_1.Widget);
exports.BoxPanel = BoxPanel;

},{"./index.css":14,"phosphor-arrays":12,"phosphor-boxengine":13,"phosphor-messaging":21,"phosphor-properties":23,"phosphor-widget":36}],16:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
/**
 * A disposable object which delegates to a callback.
 */
var DisposableDelegate = (function () {
    /**
     * Construct a new disposable delegate.
     *
     * @param callback - The function to invoke when the delegate is
     *   disposed.
     */
    function DisposableDelegate(callback) {
        this._callback = callback;
    }
    Object.defineProperty(DisposableDelegate.prototype, "isDisposed", {
        /**
         * Test whether the delegate has been disposed.
         *
         * #### Notes
         * This is a read-only property which is always safe to access.
         */
        get: function () {
            return !this._callback;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Dispose of the delegate and invoke its callback.
     *
     * #### Notes
     * If this method is called more than once, all calls made after the
     * first will be a no-op.
     */
    DisposableDelegate.prototype.dispose = function () {
        var callback = this._callback;
        this._callback = null;
        if (callback)
            callback();
    };
    return DisposableDelegate;
})();
exports.DisposableDelegate = DisposableDelegate;
/**
 * An object which manages a collection of disposable items.
 */
var DisposableSet = (function () {
    /**
     * Construct a new disposable set.
     *
     * @param items - The initial disposable items for the set.
     */
    function DisposableSet(items) {
        var _this = this;
        this._set = new Set();
        if (items)
            items.forEach(function (item) { return _this._set.add(item); });
    }
    Object.defineProperty(DisposableSet.prototype, "isDisposed", {
        /**
         * Test whether the set has been disposed.
         *
         * #### Notes
         * This is a read-only property which is always safe to access.
         */
        get: function () {
            return !this._set;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Dispose of the set and dispose the items it contains.
     *
     * #### Notes
     * Items are disposed in the order they are added to the set.
     *
     * It is unsafe to use the set after it has been disposed.
     *
     * If this method is called more than once, all calls made after the
     * first will be a no-op.
     */
    DisposableSet.prototype.dispose = function () {
        var set = this._set;
        this._set = null;
        if (set)
            set.forEach(function (item) { return item.dispose(); });
    };
    /**
     * Add a disposable item to the set.
     *
     * @param item - The disposable item to add to the set. If the item
     *   is already contained in the set, this is a no-op.
     *
     * @throws Will throw an error if the set has been disposed.
     */
    DisposableSet.prototype.add = function (item) {
        if (!this._set) {
            throw new Error('object is disposed');
        }
        this._set.add(item);
    };
    /**
     * Remove a disposable item from the set.
     *
     * @param item - The disposable item to remove from the set. If the
     *   item does not exist in the set, this is a no-op.
     *
     * @throws Will throw an error if the set has been disposed.
     */
    DisposableSet.prototype.remove = function (item) {
        if (!this._set) {
            throw new Error('object is disposed');
        }
        this._set.delete(item);
    };
    /**
     * Clear all disposable items from the set.
     *
     * @throws Will throw an error if the set has been disposed.
     */
    DisposableSet.prototype.clear = function () {
        if (!this._set) {
            throw new Error('object is disposed');
        }
        this._set.clear();
    };
    return DisposableSet;
})();
exports.DisposableSet = DisposableSet;

},{}],17:[function(require,module,exports){
var css = "/*-----------------------------------------------------------------------------\r\n| Copyright (c) 2014-2015, PhosphorJS Contributors\r\n|\r\n| Distributed under the terms of the BSD 3-Clause License.\r\n|\r\n| The full license is in the file LICENSE, distributed with this software.\r\n|----------------------------------------------------------------------------*/\n.p-DockTabPanel-overlay {\n  box-sizing: border-box;\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  z-index: 2;\n  transition: all 150ms ease;\n}\n.p-Tab.p-mod-docking {\n  position: absolute;\n}\n"; (require("browserify-css").createStyle(css, { "href": "node_modules/phosphor-dockpanel/lib/index.css"})); module.exports = css;
},{"browserify-css":1}],18:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var arrays = require('phosphor-arrays');
var phosphor_boxpanel_1 = require('phosphor-boxpanel');
var phosphor_domutil_1 = require('phosphor-domutil');
var phosphor_properties_1 = require('phosphor-properties');
var phosphor_splitpanel_1 = require('phosphor-splitpanel');
var phosphor_stackedpanel_1 = require('phosphor-stackedpanel');
var phosphor_tabs_1 = require('phosphor-tabs');
require('./index.css');
/**
 * `p-DockPanel`: the class name added to DockPanel instances.
 */
var DOCK_PANEL_CLASS = 'p-DockPanel';
/**
 * `p-DockSplitPanel`: the class name added to DockSplitPanel instances.
 */
var DOCK_SPLIT_PANEL_CLASS = 'p-DockSplitPanel';
/**
 * `p-DockTabPanel`: the class name added to DockTabPanel instances.
 */
var DOCK_TAB_PANEL_CLASS = 'p-DockTabPanel';
/**
 * `p-DockTabPanel-overlay`: the class name added to a DockTabPanel overlay.
 */
var OVERLAY_CLASS = 'p-DockTabPanel-overlay';
/**
 * The class name added to a tab which is being docked.
 */
var DOCKING_CLASS = 'p-mod-docking';
/**
 * An enum of docking modes for a dock panel.
 */
(function (DockMode) {
    /**
     * Insert the widget as a new split item above a reference.
     */
    DockMode[DockMode["SplitTop"] = 0] = "SplitTop";
    /**
     * Insert the widget as a new split item to the left of a reference.
     */
    DockMode[DockMode["SplitLeft"] = 1] = "SplitLeft";
    /**
     * Insert the widget as a new split item to the right of a reference.
     */
    DockMode[DockMode["SplitRight"] = 2] = "SplitRight";
    /**
     * Insert the widget as a new split item below a reference.
     */
    DockMode[DockMode["SplitBottom"] = 3] = "SplitBottom";
    /**
     * Insert the widget as a new tab before a reference.
     */
    DockMode[DockMode["TabBefore"] = 4] = "TabBefore";
    /**
     * Insert the widget as a new tab after a reference.
     */
    DockMode[DockMode["TabAfter"] = 5] = "TabAfter";
})(exports.DockMode || (exports.DockMode = {}));
var DockMode = exports.DockMode;
/**
 * A widget which provides a flexible docking panel for content widgets.
 *
 * #### Notes
 * Widgets should be added to a `DockPanel` using the [[addWidget]]
 * method, **not** the inherited `<prefix>Child` methods. There is
 * no corresponding `removeWidget` method; simply set the `parent`
 * of a widget to `null` to remove it from a `DockPanel`.
 */
var DockPanel = (function (_super) {
    __extends(DockPanel, _super);
    /**
     * Construct a new dock panel.
     */
    function DockPanel() {
        _super.call(this);
        this._ignoreRemoved = false;
        this._items = [];
        this._dragData = null;
        this.addClass(DOCK_PANEL_CLASS);
        this._root = this._createSplitPanel(phosphor_splitpanel_1.Orientation.Horizontal);
        this.addChild(this._root);
    }
    /**
     * Get the dock panel tab for the given widget.
     *
     * @param widget - The widget of interest.
     *
     * @returns The dock panel tab for the given widget.
     *
     * #### Notes
     * This is a pure delegate for the [[tabProperty]].
     */
    DockPanel.getTab = function (widget) {
        return DockPanel.tabProperty.get(widget);
    };
    /**
     * Set the dock panel tab for the given widget.
     *
     * @param widget - The widget of interest.
     *
     * @param tab - The tab to use for the widget in a dock panel.
     *
     * #### Notes
     * This is a pure delegate for the [[tabProperty]].
     */
    DockPanel.setTab = function (widget, tab) {
        DockPanel.tabProperty.set(widget, tab);
    };
    /**
     * Dispose of the resources held by the widget.
     */
    DockPanel.prototype.dispose = function () {
        this._abortDrag();
        this._root = null;
        this._items.length = 0;
        _super.prototype.dispose.call(this);
    };
    Object.defineProperty(DockPanel.prototype, "handleSize", {
        /**
         * Get the handle size of the dock split panels.
         *
         * #### Notes
         * This is a pure delegate to the [[handleSizeProperty]].
         */
        get: function () {
            return DockPanel.handleSizeProperty.get(this);
        },
        /**
         * Set the handle size of the dock split panels.
         *
         * #### Notes
         * This is a pure delegate to the [[handleSizeProperty]].
         */
        set: function (value) {
            DockPanel.handleSizeProperty.set(this, value);
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Add a widget to the dock panel according to the given dock mode.
     *
     * @param widget - The widget to add to the dock panel.
     *
     * @param mode - The insertion mode for the widget. This controls how
     *   the widget is inserted relative to the reference widget. If this
     *   is not provided, `DockMode.SplitLeft` is assumed.
     *
     * @param ref - The reference widget which controls the placement of
     *   the added widget. If this is not provided, or is not contained
     *   in the dock panel, the widget is inserted relative to the root.
     *
     * #### Notes
     * If the dock widget is already added to the panel, it will be moved
     * to the new location.
     *
     * The `DockPanel.tab` attached property **must** be set with the tab
     * to use for the widget, or an error will be thrown. This can be set
     * via `DockPanel.setTab`. This property is assumed to stay constant
     * while the widget is contained by the dock panel.
     *
     * If the `widget` and the `ref` are the same object, an error will
     * be thrown.
     */
    DockPanel.prototype.addWidget = function (widget, mode, ref) {
        if (widget === ref) {
            throw new Error('invalid ref widget');
        }
        if (!DockPanel.getTab(widget)) {
            throw new Error('`DockPanel.tab` property not set');
        }
        switch (mode) {
            case DockMode.SplitTop:
                this._splitWidget(widget, ref, phosphor_splitpanel_1.Orientation.Vertical, false);
                break;
            case DockMode.SplitLeft:
                this._splitWidget(widget, ref, phosphor_splitpanel_1.Orientation.Horizontal, false);
                break;
            case DockMode.SplitRight:
                this._splitWidget(widget, ref, phosphor_splitpanel_1.Orientation.Horizontal, true);
                break;
            case DockMode.SplitBottom:
                this._splitWidget(widget, ref, phosphor_splitpanel_1.Orientation.Vertical, true);
                break;
            case DockMode.TabBefore:
                this._tabifyWidget(widget, ref, false);
                break;
            case DockMode.TabAfter:
                this._tabifyWidget(widget, ref, true);
                break;
            default:
                this._addPanel(widget, phosphor_splitpanel_1.Orientation.Horizontal, false);
                break;
        }
    };
    /**
     * Handle the DOM events for the dock panel.
     *
     * @param event - The DOM event sent to the dock panel.
     *
     * #### Notes
     * This method implements the DOM `EventListener` interface and is
     * called in response to events on the dock panel's DOM node. It
     * should not be called directly by user code.
     */
    DockPanel.prototype.handleEvent = function (event) {
        switch (event.type) {
            case 'mousemove':
                this._evtMouseMove(event);
                break;
            case 'mouseup':
                this._evtMouseUp(event);
                break;
            case 'contextmenu':
                event.preventDefault();
                event.stopPropagation();
                break;
        }
    };
    /**
     * Add the dock widget as a new split panel next to the reference.
     */
    DockPanel.prototype._splitWidget = function (widget, ref, orientation, after) {
        var item = ref ? this._findItemByWidget(ref) : void 0;
        if (item) {
            this._splitPanel(item.panel, widget, orientation, after);
        }
        else {
            this._addPanel(widget, orientation, after);
        }
    };
    /**
     * Add the dock widget as a tab next to the reference.
     */
    DockPanel.prototype._tabifyWidget = function (widget, ref, after) {
        var item = ref ? this._findItemByWidget(ref) : void 0;
        if (item) {
            this._tabifyPanel(item, widget, after);
        }
        else {
            this._addPanel(widget, phosphor_splitpanel_1.Orientation.Horizontal, after);
        }
    };
    /**
     * Add a widget to a new tab panel along the given orientation.
     */
    DockPanel.prototype._addPanel = function (widget, orientation, after) {
        // Remove the widget from its current parent.
        widget.parent = null;
        // Create a new dock tab panel to host the widget.
        var panel = this._createTabPanel();
        // Create and add the dock item for the widget.
        var tab = DockPanel.getTab(widget);
        this._items.push({ tab: tab, widget: widget, panel: panel });
        // Add the widget to the tab panel.
        panel.stack.addChild(widget);
        panel.tabs.addTab(tab);
        // Ensure a proper root and add the new tab panel.
        this._ensureRoot(orientation);
        this._root.insertChild(after ? this._root.childCount : 0, panel);
    };
    /**
     * Split a dock item with a widget along the given orientation.
     */
    DockPanel.prototype._splitPanel = function (target, widget, orientation, after) {
        // Remove the widget from its current parent.
        widget.parent = null;
        // Create a new dock tab panel to host the widget.
        var panel = this._createTabPanel();
        // Create and add the dock item for the widget.
        var tab = DockPanel.getTab(widget);
        this._items.push({ tab: tab, widget: widget, panel: panel });
        // Add the widget to the tab panel.
        panel.stack.addChild(widget);
        panel.tabs.addTab(tab);
        // Add the new panel to the parent split panel. This may require
        // creating a new child split panel to adhere to the orientation
        // constraint. The split panel sizes are updated reasonably.
        var splitPanel = target.parent;
        if (splitPanel.orientation !== orientation) {
            if (splitPanel.childCount <= 1) {
                splitPanel.orientation = orientation;
                splitPanel.insertChild(+after, panel);
                splitPanel.setSizes([1, 1]);
            }
            else {
                var sizes = splitPanel.sizes();
                var i = splitPanel.childIndex(target);
                var childSplit = this._createSplitPanel(orientation);
                childSplit.addChild(target);
                childSplit.insertChild(+after, panel);
                splitPanel.insertChild(i, childSplit);
                splitPanel.setSizes(sizes);
                childSplit.setSizes([1, 1]);
            }
        }
        else {
            var i = splitPanel.childIndex(target);
            var sizes = splitPanel.sizes();
            var size = sizes[i] = sizes[i] / 2;
            splitPanel.insertChild(i + (+after), panel);
            arrays.insert(sizes, i + (+after), size);
            splitPanel.setSizes(sizes);
        }
    };
    /**
     * Add a widget to the tab panel of a given dock item.
     */
    DockPanel.prototype._tabifyPanel = function (item, widget, after) {
        // Remove the widget from its current parent.
        widget.parent = null;
        // Create and add the dock item for the widget.
        var tab = DockPanel.getTab(widget);
        this._items.push({ tab: tab, widget: widget, panel: item.panel });
        // Add the widget to the tab panel.
        var i = item.panel.stack.childIndex(item.widget);
        item.panel.stack.addChild(widget);
        item.panel.tabs.insertTab(i + (+after), tab);
    };
    /**
     * Handle the `'mousemove'` event for the dock panel.
     *
     * This is triggered on the document during a tab move operation.
     */
    DockPanel.prototype._evtMouseMove = function (event) {
        event.preventDefault();
        event.stopPropagation();
        var dragData = this._dragData;
        if (!dragData) {
            return;
        }
        // Hit test the panels using the current mouse position.
        var clientX = event.clientX;
        var clientY = event.clientY;
        var hitPanel = iterTabPanels(this._root, function (panel) {
            return phosphor_domutil_1.hitTest(panel.node, clientX, clientY) ? panel : void 0;
        });
        // If the last hit panel is not this hit panel, clear the overlay.
        if (dragData.lastHitPanel && dragData.lastHitPanel !== hitPanel) {
            dragData.lastHitPanel.hideOverlay();
        }
        // Clear the reference to the hit panel. It will be updated again
        // if the mouse is over a panel, but not over the panel's tab bar.
        dragData.lastHitPanel = null;
        // If the mouse is not over a tab panel, simply update the tab.
        var item = dragData.item;
        var tabStyle = item.tab.node.style;
        if (!hitPanel) {
            tabStyle.left = clientX + 'px';
            tabStyle.top = clientY + 'px';
            return;
        }
        // Handle the case where the mouse is not over a tab bar. This
        // saves a reference to the hit panel so that its overlay can be
        // hidden once the mouse leaves the panel, and shows the overlay
        // provided that the split target is not the current widget.
        if (!phosphor_domutil_1.hitTest(hitPanel.tabs.node, clientX, clientY)) {
            dragData.lastHitPanel = hitPanel;
            if (hitPanel !== item.panel || hitPanel.tabs.tabCount > 0) {
                hitPanel.showOverlay(clientX, clientY);
            }
            tabStyle.left = clientX + 'px';
            tabStyle.top = clientY + 'px';
            return;
        }
        // Otherwise the mouse is positioned over a tab bar. Hide the
        // overlay before attaching the tab to the new tab bar.
        hitPanel.hideOverlay();
        // If the hit panel is not the current owner, the current hit
        // panel and tab are saved so that they can be restored later.
        if (hitPanel !== item.panel) {
            dragData.tempPanel = hitPanel;
            dragData.tempTab = hitPanel.tabs.selectedTab;
        }
        // Reset the tab style before attaching the tab to the tab bar.
        item.tab.removeClass(DOCKING_CLASS);
        tabStyle.top = '';
        tabStyle.left = '';
        // Attach the tab to the hit tab bar.
        hitPanel.tabs.attachTab(item.tab, clientX);
        // The tab bar takes over movement of the tab. The dock panel still
        // listens for the mouseup event in order to complete the move.
        document.removeEventListener('mousemove', this, true);
    };
    /**
     * Handle the 'mouseup' event for the dock panel.
     *
     * This is triggered on the document during a tab move operation.
     */
    DockPanel.prototype._evtMouseUp = function (event) {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        document.removeEventListener('mouseup', this, true);
        document.removeEventListener('mousemove', this, true);
        document.removeEventListener('contextmenu', this, true);
        var dragData = this._dragData;
        if (!dragData) {
            return;
        }
        this._dragData = null;
        // Restore the application cursor and hide the overlay.
        dragData.cursorGrab.dispose();
        if (dragData.lastHitPanel) {
            dragData.lastHitPanel.hideOverlay();
        }
        // Fetch common variables.
        var item = dragData.item;
        var ownPanel = item.panel;
        var ownBar = ownPanel.tabs;
        var ownCount = ownBar.tabCount;
        var itemTab = item.tab;
        // If the tab was being temporarily borrowed by another panel,
        // make that relationship permanent by moving the dock widget.
        // If the original owner panel becomes empty, it is removed.
        // Otherwise, its current index is updated to the next widget.
        // The ignoreRemoved flag is set during the widget swap since
        // the widget is not actually being removed from the panel.
        if (dragData.tempPanel) {
            this._ignoreRemoved = true;
            item.panel = dragData.tempPanel;
            item.panel.stack.addChild(item.widget);
            item.panel.stack.currentWidget = item.widget;
            this._ignoreRemoved = false;
            if (ownPanel.stack.childCount === 0) {
                this._removePanel(ownPanel);
            }
            else {
                var i = ownBar.tabIndex(dragData.prevTab);
                if (i === -1)
                    i = Math.min(dragData.index, ownCount - 1);
                ownBar.selectedTab = ownBar.tabAt(i);
            }
            return;
        }
        // Snap the split mode before modifying the DOM with the tab insert.
        var mode = SplitMode.Invalid;
        var hitPanel = dragData.lastHitPanel;
        if (hitPanel && (hitPanel !== ownPanel || ownCount !== 0)) {
            mode = hitPanel.splitModeAt(event.clientX, event.clientY);
        }
        // If the mouse was not released over a panel, or if the hit panel
        // is the empty owner panel, restore the tab to its position.
        var tabStyle = itemTab.node.style;
        if (mode === SplitMode.Invalid) {
            if (ownBar.selectedTab !== itemTab) {
                itemTab.removeClass(DOCKING_CLASS);
                tabStyle.top = '';
                tabStyle.left = '';
                ownBar.insertTab(dragData.index, itemTab);
            }
            return;
        }
        // Remove the tab from the document body and reset its style.
        document.body.removeChild(itemTab.node);
        itemTab.removeClass(DOCKING_CLASS);
        tabStyle.top = '';
        tabStyle.left = '';
        // Split the target panel with the dock widget.
        var after = mode === SplitMode.Right || mode === SplitMode.Bottom;
        var horiz = mode === SplitMode.Left || mode === SplitMode.Right;
        var orientation = horiz ? phosphor_splitpanel_1.Orientation.Horizontal : phosphor_splitpanel_1.Orientation.Vertical;
        this._splitPanel(hitPanel, item.widget, orientation, after);
        var i = ownBar.tabIndex(dragData.prevTab);
        if (i === -1)
            i = Math.min(dragData.index, ownCount - 1);
        ownBar.selectedTab = ownBar.tabAt(i);
    };
    /**
     * Ensure the root split panel has the given orientation.
     */
    DockPanel.prototype._ensureRoot = function (orientation) {
        // This is a no-op if the root orientation is correct.
        if (this._root.orientation === orientation) {
            return;
        }
        // If the root has at most one child, update the orientation.
        if (this._root.childCount <= 1) {
            this._root.orientation = orientation;
            return;
        }
        // Otherwise, create a new root panel with the given orientation.
        // The existing root panel is added as a child of the new root.
        var panel = this._createSplitPanel(orientation);
        panel.addChild(this._root);
        this._root = panel;
        this.addChild(panel);
    };
    /**
     * Create a new dock tab panel and setup the signal handlers.
     */
    DockPanel.prototype._createTabPanel = function () {
        var panel = new DockTabPanel();
        panel.tabs.tabSelected.connect(this._onTabSelected, this);
        panel.tabs.tabCloseRequested.connect(this._onTabCloseRequested, this);
        panel.tabs.tabDetachRequested.connect(this._onTabDetachRequested, this);
        panel.stack.widgetRemoved.connect(this._onWidgetRemoved, this);
        return panel;
    };
    /**
     * Create a new dock split panel for the dock panel.
     */
    DockPanel.prototype._createSplitPanel = function (orientation) {
        var panel = new DockSplitPanel();
        panel.orientation = orientation;
        panel.handleSize = this.handleSize;
        return panel;
    };
    /**
     * Remove an empty dock tab panel from the hierarchy.
     *
     * This ensures that the hierarchy is kept consistent by merging an
     * ancestor split panel when it contains only a single child widget.
     */
    DockPanel.prototype._removePanel = function (panel) {
        // The parent of a tab panel is always a split panel.
        var splitPanel = panel.parent;
        // Dispose the panel to ensure its resources are released.
        panel.dispose();
        // If the split panel still has multiple children after removing
        // the target panel, nothing else needs to be done.
        if (splitPanel.childCount > 1) {
            return;
        }
        // If the split panel is the root panel and has a remaining child
        // which is a split panel, that child becomes the root.
        if (splitPanel === this._root) {
            if (splitPanel.childCount === 1) {
                var child = splitPanel.childAt(0);
                if (child instanceof DockSplitPanel) {
                    var sizes = child.sizes();
                    splitPanel.parent = null;
                    this._root = child;
                    this.addChild(child);
                    child.setSizes(sizes);
                    splitPanel.dispose();
                }
            }
            return;
        }
        // Non-root split panels always have a split panel parent and are
        // always created with 2 children, so the split panel is guaranteed
        // to have a single child at this point. Also, split panels always
        // have an orthogonal orientation to their parent, so a grandparent
        // and a grandchild split panel will have the same orientation. This
        // means the children of the grandchild can be merged as children of
        // the grandparent.
        var gParent = splitPanel.parent;
        var gSizes = gParent.sizes();
        var gChild = splitPanel.childAt(0);
        var index = gParent.childIndex(splitPanel);
        splitPanel.parent = null;
        if (gChild instanceof DockTabPanel) {
            gParent.insertChild(index, gChild);
        }
        else {
            var gcsp = gChild;
            var gcspSizes = gcsp.sizes();
            var sizeShare = arrays.removeAt(gSizes, index);
            for (var i = 0; gcsp.childCount !== 0; ++i) {
                gParent.insertChild(index + i, gcsp.childAt(0));
                arrays.insert(gSizes, index + i, sizeShare * gcspSizes[i]);
            }
        }
        gParent.setSizes(gSizes);
        splitPanel.dispose();
    };
    /**
     * Abort the tab drag operation if one is in progress.
     */
    DockPanel.prototype._abortDrag = function () {
        var dragData = this._dragData;
        if (!dragData) {
            return;
        }
        this._dragData = null;
        // Release the mouse grab and restore the application cursor.
        document.removeEventListener('mouseup', this, true);
        document.removeEventListener('mousemove', this, true);
        document.removeEventListener('contextmenu', this, true);
        dragData.cursorGrab.dispose();
        // Hide the overlay for the last hit panel.
        if (dragData.lastHitPanel) {
            dragData.lastHitPanel.hideOverlay();
        }
        // If the tab is borrowed by another tab bar, remove it from
        // that tab bar and restore that tab bar's previous tab.
        if (dragData.tempPanel) {
            var tabs = dragData.tempPanel.tabs;
            tabs.removeTab(tabs.selectedTab);
            tabs.selectedTab = dragData.tempTab;
        }
        // Restore the tab to its original location in its owner panel.
        var item = dragData.item;
        var ownBar = item.panel.tabs;
        if (ownBar.selectedTab !== item.tab) {
            var tabStyle = item.tab.node.style;
            item.tab.removeClass(DOCKING_CLASS);
            tabStyle.top = '';
            tabStyle.left = '';
            ownBar.insertTab(dragData.index, item.tab);
        }
    };
    /**
     * Find the dock item which contains the given tab.
     *
     * Returns `undefined` if there is no matching item.
     */
    DockPanel.prototype._findItemByTab = function (tab) {
        return arrays.find(this._items, function (item) { return item.tab === tab; });
    };
    /**
     * Find the dock item which contains the given widget.
     *
     * Returns `undefined` if there is no matching item.
     */
    DockPanel.prototype._findItemByWidget = function (widget) {
        return arrays.find(this._items, function (item) { return item.widget === widget; });
    };
    /**
     * The change handler for the [[handleSizeProperty]].
     */
    DockPanel.prototype._onHandleSizeChanged = function (old, value) {
        iterSplitPanels(this._root, function (panel) { panel.handleSize = value; });
    };
    /**
     * Handle the `tabSelected` signal from a tab bar.
     */
    DockPanel.prototype._onTabSelected = function (sender, args) {
        var item = this._findItemByTab(args.tab);
        if (item && item.panel.tabs === sender) {
            item.panel.stack.currentWidget = item.widget;
        }
    };
    /**
     * Handle the `tabCloseRequested` signal from a tab bar.
     */
    DockPanel.prototype._onTabCloseRequested = function (sender, args) {
        var item = this._findItemByTab(args.tab);
        if (item)
            item.widget.close();
    };
    /**
     * Handle the `tabDetachRequested` signal from the tab bar.
     */
    DockPanel.prototype._onTabDetachRequested = function (sender, args) {
        // Find the dock item for the detach operation.
        var item = this._findItemByTab(args.tab);
        if (!item) {
            return;
        }
        // Setup the initial drag data if it does not exist.
        if (!this._dragData) {
            this._dragData = {
                item: item,
                index: args.index,
                prevTab: sender.previousTab,
                lastHitPanel: null,
                cursorGrab: null,
                tempPanel: null,
                tempTab: null,
            };
        }
        // Grab the cursor for the drag operation.
        var dragData = this._dragData;
        dragData.cursorGrab = phosphor_domutil_1.overrideCursor('default');
        // The tab being detached will have one of two states:
        //
        // 1) The tab is being detached from its owner tab bar. The current
        //    index is unset before detaching the tab so that the content
        //    widget does not change during the drag operation.
        //
        // 2) The tab is being detached from a tab bar which was borrowing
        //    the tab temporarily. Its previously selected tab is restored.
        if (item.panel.tabs === sender) {
            sender.selectedTab = null;
            sender.removeTabAt(args.index);
        }
        else {
            sender.removeTabAt(args.index);
            sender.selectedTab = dragData.tempTab;
        }
        // Clear the temp panel and tab
        dragData.tempPanel = null;
        dragData.tempTab = null;
        // Setup the style and position for the floating tab.
        var style = args.tab.node.style;
        style.zIndex = '';
        style.top = args.clientY + 'px';
        style.left = args.clientX + 'px';
        args.tab.addClass(DOCKING_CLASS);
        // Add the tab to the document body.
        document.body.appendChild(args.tab.node);
        // Attach the necessary mouse event listeners.
        document.addEventListener('mouseup', this, true);
        document.addEventListener('mousemove', this, true);
        document.addEventListener('contextmenu', this, true);
    };
    /**
     * Handle the `widgetRemoved` signal from a stacked widget.
     */
    DockPanel.prototype._onWidgetRemoved = function (sender, args) {
        if (this._ignoreRemoved) {
            return;
        }
        var item = this._findItemByWidget(args.widget);
        if (!item) {
            return;
        }
        this._abortDrag();
        arrays.remove(this._items, item);
        item.panel.tabs.removeTab(item.tab);
        if (item.panel.stack.childCount === 0) {
            this._removePanel(item.panel);
        }
    };
    /**
     * A convenience alias of the `SplitTop` [[DockMode]].
     */
    DockPanel.SplitTop = DockMode.SplitTop;
    /**
     * A convenience alias of the `SplitLeft` [[DockMode]].
     */
    DockPanel.SplitLeft = DockMode.SplitLeft;
    /**
     * A convenience alias of the `SplitRight` [[DockMode]].
     */
    DockPanel.SplitRight = DockMode.SplitRight;
    /**
     * A convenience alias of the `SplitBottom` [[DockMode]].
     */
    DockPanel.SplitBottom = DockMode.SplitBottom;
    /**
     * A convenience alias of the `TabBefore` [[DockMode]].
     */
    DockPanel.TabBefore = DockMode.TabBefore;
    /**
     * A convenience alias of the `TabAfter` [[DockMode]].
     */
    DockPanel.TabAfter = DockMode.TabAfter;
    /**
     * The property descriptor for the `tab` attached property.
     *
     * This controls the tab used for a widget in a dock panel.
     *
     * #### Notes
     * If the tab for a widget is changed, the new tab will not be
     * reflected until the widget is re-inserted into the dock panel.
     * However, in-place changes to the tab's properties **will** be
     * reflected.
     *
     * **See also:** [[getTab]], [[setTab]]
     */
    DockPanel.tabProperty = new phosphor_properties_1.Property({
        value: null,
        coerce: function (owner, value) { return value || null; },
    });
    /**
     * The property descriptor for the dock panel handle size.
     *
     * The controls the size of the split handles placed between the
     * tabbed panel, in pixels. The default value is `3`.
     *
     * **See also:** [[handleSize]]
     */
    DockPanel.handleSizeProperty = new phosphor_properties_1.Property({
        value: 3,
        coerce: function (owner, value) { return Math.max(0, value | 0); },
        changed: function (owner, old, value) { return owner._onHandleSizeChanged(old, value); },
    });
    return DockPanel;
})(phosphor_boxpanel_1.BoxPanel);
exports.DockPanel = DockPanel;
/**
 * Iterate over the DockPanels starting with the given root split panel.
 *
 * Iteration stops when the callback returns anything but undefined.
 */
function iterTabPanels(root, cb) {
    for (var i = 0, n = root.childCount; i < n; ++i) {
        var result = void 0;
        var panel = root.childAt(i);
        if (panel instanceof DockTabPanel) {
            result = cb(panel);
        }
        else if (panel instanceof DockSplitPanel) {
            result = iterTabPanels(panel, cb);
        }
        if (result !== void 0) {
            return result;
        }
    }
    return void 0;
}
/**
 * Iterate over the DockSplitPanel starting with the given root panel.
 *
 * Iteration stops when the callback returns anything but `undefined`.
 */
function iterSplitPanels(root, cb) {
    var result = cb(root);
    if (result !== void 0) {
        return result;
    }
    for (var i = 0, n = root.childCount; i < n; ++i) {
        var panel = root.childAt(i);
        if (panel instanceof DockSplitPanel) {
            result = iterSplitPanels(panel, cb);
            if (result !== void 0) {
                return result;
            }
        }
    }
    return void 0;
}
/**
 * Create the overlay node for a dock tab panel.
 */
function createOverlay() {
    var overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.style.display = 'none';
    return overlay;
}
/**
 * The split modes used to indicate a dock panel split direction.
 */
var SplitMode;
(function (SplitMode) {
    SplitMode[SplitMode["Top"] = 0] = "Top";
    SplitMode[SplitMode["Left"] = 1] = "Left";
    SplitMode[SplitMode["Right"] = 2] = "Right";
    SplitMode[SplitMode["Bottom"] = 3] = "Bottom";
    SplitMode[SplitMode["Invalid"] = 4] = "Invalid";
})(SplitMode || (SplitMode = {}));
/**
 * A tabbed panel used by a DockPanel.
 *
 * This tab panel acts as a simple container for a tab bar and stacked
 * panel, plus a bit of logic to manage the docking overlay. The dock
 * panel manages the tab bar and stacked panel directly, as there is
 * not always a 1:1 association between a tab and panel.
 */
var DockTabPanel = (function (_super) {
    __extends(DockTabPanel, _super);
    /**
     * Construct a new dock tab panel.
     */
    function DockTabPanel() {
        _super.call(this);
        this._overlayTimer = 0;
        this._overlayHidden = true;
        this._tabs = new phosphor_tabs_1.TabBar();
        this._stack = new phosphor_stackedpanel_1.StackedPanel();
        this.addClass(DOCK_TAB_PANEL_CLASS);
        this.direction = phosphor_boxpanel_1.BoxPanel.TopToBottom;
        this.spacing = 0;
        phosphor_boxpanel_1.BoxPanel.setStretch(this._tabs, 0);
        phosphor_boxpanel_1.BoxPanel.setStretch(this._stack, 1);
        this.addChild(this._tabs);
        this.addChild(this._stack);
        this._overlay = createOverlay();
        this.node.appendChild(this._overlay);
    }
    /**
     * Dispose of the resources held by the widget.
     */
    DockTabPanel.prototype.dispose = function () {
        this._clearOverlayTimer();
        this._tabs = null;
        this._stack = null;
        this._overlay = null;
        _super.prototype.dispose.call(this);
    };
    Object.defineProperty(DockTabPanel.prototype, "tabs", {
        /**
         * Get the tab bar for the dock tab panel.
         */
        get: function () {
            return this._tabs;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(DockTabPanel.prototype, "stack", {
        /**
         * Get the stacked panel for the dock tab panel.
         */
        get: function () {
            return this._stack;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Compute the split mode for the given client position.
     */
    DockTabPanel.prototype.splitModeAt = function (clientX, clientY) {
        var rect = this.stack.node.getBoundingClientRect();
        var fracX = (clientX - rect.left) / rect.width;
        var fracY = (clientY - rect.top) / rect.height;
        if (fracX < 0.0 || fracX > 1.0 || fracY < 0.0 || fracY > 1.0) {
            return SplitMode.Invalid;
        }
        var mode;
        var normX = fracX > 0.5 ? 1 - fracX : fracX;
        var normY = fracY > 0.5 ? 1 - fracY : fracY;
        if (normX < normY) {
            mode = fracX <= 0.5 ? SplitMode.Left : SplitMode.Right;
        }
        else {
            mode = fracY <= 0.5 ? SplitMode.Top : SplitMode.Bottom;
        }
        return mode;
    };
    /**
     * Show the dock overlay for the given client position.
     *
     * If the overlay is already visible, it will be adjusted.
     */
    DockTabPanel.prototype.showOverlay = function (clientX, clientY) {
        this._clearOverlayTimer();
        var rect = this.node.getBoundingClientRect();
        var box = this.boxSizing;
        var top = box.paddingTop;
        var left = box.paddingLeft;
        var right = box.paddingRight;
        var bottom = box.paddingBottom;
        switch (this.splitModeAt(clientX, clientY)) {
            case SplitMode.Left:
                right = rect.width / 2;
                break;
            case SplitMode.Right:
                left = rect.width / 2;
                break;
            case SplitMode.Top:
                bottom = rect.height / 2;
                break;
            case SplitMode.Bottom:
                top = rect.height / 2;
                break;
        }
        // The first time the overlay is made visible, it is positioned at
        // the cursor with zero size before being displayed. This allows
        // for a nice transition to the normally computed size. Since the
        // elements starts with display: none, a restyle must be forced.
        var style = this._overlay.style;
        if (this._overlayHidden) {
            this._overlayHidden = false;
            style.top = clientY - rect.top + 'px';
            style.left = clientX - rect.left + 'px';
            style.right = rect.right - clientX + 'px';
            style.bottom = rect.bottom - clientY + 'px';
            style.display = '';
            this._overlay.offsetWidth; // force layout
        }
        style.opacity = '1';
        style.top = top + 'px';
        style.left = left + 'px';
        style.right = right + 'px';
        style.bottom = bottom + 'px';
    };
    /**
     * Hide the dock overlay.
     *
     * If the overlay is already hidden, this is a no-op.
     */
    DockTabPanel.prototype.hideOverlay = function () {
        var _this = this;
        if (this._overlayHidden) {
            return;
        }
        this._clearOverlayTimer();
        this._overlayHidden = true;
        this._overlay.style.opacity = '0';
        this._overlayTimer = setTimeout(function () {
            _this._overlayTimer = 0;
            _this._overlay.style.display = 'none';
        }, 150);
    };
    /**
     * Clear the overlay timer.
     */
    DockTabPanel.prototype._clearOverlayTimer = function () {
        if (this._overlayTimer) {
            clearTimeout(this._overlayTimer);
            this._overlayTimer = 0;
        }
    };
    return DockTabPanel;
})(phosphor_boxpanel_1.BoxPanel);
/**
 * A split panel used by a DockPanel.
 *
 * This class serves to differentiate a split panel used by a
 * dock panel from user provided split panel content widgets.
 */
var DockSplitPanel = (function (_super) {
    __extends(DockSplitPanel, _super);
    /**
     * Construct a new dock split panel.
     */
    function DockSplitPanel() {
        _super.call(this);
        this.addClass(DOCK_SPLIT_PANEL_CLASS);
    }
    return DockSplitPanel;
})(phosphor_splitpanel_1.SplitPanel);

},{"./index.css":17,"phosphor-arrays":12,"phosphor-boxpanel":15,"phosphor-domutil":20,"phosphor-properties":23,"phosphor-splitpanel":27,"phosphor-stackedpanel":29,"phosphor-tabs":31}],19:[function(require,module,exports){
var css = "/*-----------------------------------------------------------------------------\n| Copyright (c) 2014-2015, PhosphorJS Contributors\n|\n| Distributed under the terms of the BSD 3-Clause License.\n|\n| The full license is in the file LICENSE, distributed with this software.\n|----------------------------------------------------------------------------*/\nbody.p-mod-override-cursor * {\n  cursor: inherit !important;\n}\n"; (require("browserify-css").createStyle(css, { "href": "node_modules/phosphor-domutil/lib/index.css"})); module.exports = css;
},{"browserify-css":1}],20:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
var phosphor_disposable_1 = require('phosphor-disposable');
require('./index.css');
/**
 * `p-mod-override-cursor`: the class name added to the document body
 *   during cursor override.
 */
exports.OVERRIDE_CURSOR_CLASS = 'p-mod-override-cursor';
/**
 * The id for the active cursor override.
 */
var overrideID = 0;
/**
 * Override the cursor for the entire document.
 *
 * @param cursor - The string representing the cursor style.
 *
 * @returns A disposable which will clear the override when disposed.
 *
 * #### Notes
 * The most recent call to `overrideCursor` takes precendence. Disposing
 * an old override is a no-op and will not effect the current override.
 *
 * #### Example
 * ```typescript
 * import { overrideCursor } from 'phosphor-domutil';
 *
 * // force the cursor to be 'wait' for the entire document
 * var override = overrideCursor('wait');
 *
 * // clear the override by disposing the return value
 * override.dispose();
 * ```
 */
function overrideCursor(cursor) {
    var id = ++overrideID;
    var body = document.body;
    body.style.cursor = cursor;
    body.classList.add(exports.OVERRIDE_CURSOR_CLASS);
    return new phosphor_disposable_1.DisposableDelegate(function () {
        if (id === overrideID) {
            body.style.cursor = '';
            body.classList.remove(exports.OVERRIDE_CURSOR_CLASS);
        }
    });
}
exports.overrideCursor = overrideCursor;
/**
 * Test whether a client position lies within a node.
 *
 * @param node - The DOM node of interest.
 *
 * @param clientX - The client X coordinate of interest.
 *
 * @param clientY - The client Y coordinate of interest.
 *
 * @returns `true` if the node covers the position, `false` otherwise.
 *
 * #### Example
 * ```typescript
 * import { hitTest } from 'phosphor-domutil';
 *
 * var div = document.createElement('div');
 * div.style.position = 'absolute';
 * div.style.left = '0px';
 * div.style.top = '0px';
 * div.style.width = '100px';
 * div.style.height = '100px';
 * document.body.appendChild(div);
 *
 * hitTest(div, 50, 50);   // true
 * hitTest(div, 150, 150); // false
 * ```
 */
function hitTest(node, clientX, clientY) {
    var rect = node.getBoundingClientRect();
    return (clientX >= rect.left &&
        clientX < rect.right &&
        clientY >= rect.top &&
        clientY < rect.bottom);
}
exports.hitTest = hitTest;
/**
 * Compute the box sizing for a DOM node.
 *
 * @param node - The DOM node for which to compute the box sizing.
 *
 * @returns The box sizing data for the specified DOM node.
 *
 * #### Example
 * ```typescript
 * import { boxSizing } from 'phosphor-domutil';
 *
 * var div = document.createElement('div');
 * div.style.borderTop = 'solid 10px black';
 * document.body.appendChild(div);
 *
 * var sizing = boxSizing(div);
 * sizing.borderTop;    // 10
 * sizing.paddingLeft;  // 0
 * // etc...
 * ```
 */
function boxSizing(node) {
    var cstyle = window.getComputedStyle(node);
    var bt = parseInt(cstyle.borderTopWidth, 10) || 0;
    var bl = parseInt(cstyle.borderLeftWidth, 10) || 0;
    var br = parseInt(cstyle.borderRightWidth, 10) || 0;
    var bb = parseInt(cstyle.borderBottomWidth, 10) || 0;
    var pt = parseInt(cstyle.paddingTop, 10) || 0;
    var pl = parseInt(cstyle.paddingLeft, 10) || 0;
    var pr = parseInt(cstyle.paddingRight, 10) || 0;
    var pb = parseInt(cstyle.paddingBottom, 10) || 0;
    var hs = bl + pl + pr + br;
    var vs = bt + pt + pb + bb;
    return {
        borderTop: bt,
        borderLeft: bl,
        borderRight: br,
        borderBottom: bb,
        paddingTop: pt,
        paddingLeft: pl,
        paddingRight: pr,
        paddingBottom: pb,
        horizontalSum: hs,
        verticalSum: vs,
    };
}
exports.boxSizing = boxSizing;
/**
 * Compute the size limits for a DOM node.
 *
 * @param node - The node for which to compute the size limits.
 *
 * @returns The size limit data for the specified DOM node.
 *
 * #### Example
 * ```typescript
 * import { sizeLimits } from 'phosphor-domutil';
 *
 * var div = document.createElement('div');
 * div.style.minWidth = '90px';
 * document.body.appendChild(div);
 *
 * var limits = sizeLimits(div);
 * limits.minWidth;   // 90
 * limits.maxHeight;  // Infinity
 * // etc...
 * ```
 */
function sizeLimits(node) {
    var cstyle = window.getComputedStyle(node);
    return {
        minWidth: parseInt(cstyle.minWidth, 10) || 0,
        minHeight: parseInt(cstyle.minHeight, 10) || 0,
        maxWidth: parseInt(cstyle.maxWidth, 10) || Infinity,
        maxHeight: parseInt(cstyle.maxHeight, 10) || Infinity,
    };
}
exports.sizeLimits = sizeLimits;

},{"./index.css":19,"phosphor-disposable":16}],21:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
var phosphor_queue_1 = require('phosphor-queue');
/**
 * A mesage which can be sent or posted to a message handler.
 *
 * #### Notes
 * This class may be subclassed to create complex message types.
 *
 * **See Also** [[postMessage]] and [[sendMessage]].
 */
var Message = (function () {
    /**
     * Construct a new message.
     *
     * @param type - The type of the message. Consumers of a message will
     *   use this value to cast the message to the appropriately derived
     *   message type.
     */
    function Message(type) {
        this._type = type;
    }
    Object.defineProperty(Message.prototype, "type", {
        /**
         * Get the type of the message.
         */
        get: function () {
            return this._type;
        },
        enumerable: true,
        configurable: true
    });
    return Message;
})();
exports.Message = Message;
/**
 * Send a message to the message handler to process immediately.
 *
 * @param handler - The handler which should process the message.
 *
 * @param msg - The message to send to the handler.
 *
 * #### Notes
 * Unlike [[postMessage]], [[sendMessage]] delivers the message to
 * the handler immediately. The handler will not have the opportunity
 * to compress the message, however the message will still be sent
 * through any installed message filters.
 *
 * **See Also** [[postMessage]].
 */
function sendMessage(handler, msg) {
    getDispatcher(handler).sendMessage(handler, msg);
}
exports.sendMessage = sendMessage;
/**
 * Post a message to the message handler to process in the future.
 *
 * @param handler - The handler which should process the message.
 *
 * @param msg - The message to post to the handler.
 *
 * #### Notes
 * Unlike [[sendMessage]], [[postMessage]] will schedule the deliver of
 * the message for the next cycle of the event loop. The handler will
 * have the opportunity to compress the message in order to optimize
 * its handling of similar messages. The message will be sent through
 * any installed message filters before being delivered to the handler.
 *
 * **See Also** [[sendMessage]].
 */
function postMessage(handler, msg) {
    getDispatcher(handler).postMessage(handler, msg);
}
exports.postMessage = postMessage;
/**
 * Test whether a message handler has posted messages pending delivery.
 *
 * @param handler - The message handler of interest.
 *
 * @returns `true` if the handler has pending posted messages, `false`
 *   otherwise.
 *
 * **See Also** [[sendPendingMessage]].
 */
function hasPendingMessages(handler) {
    return getDispatcher(handler).hasPendingMessages();
}
exports.hasPendingMessages = hasPendingMessages;
/**
 * Send the first pending posted message to the message handler.
 *
 * @param handler - The message handler of interest.
 *
 * #### Notes
 * If the handler has no pending messages, this is a no-op.
 *
 * **See Also** [[hasPendingMessages]].
 */
function sendPendingMessage(handler) {
    getDispatcher(handler).sendPendingMessage(handler);
}
exports.sendPendingMessage = sendPendingMessage;
/**
 * Install a message filter for a message handler.
 *
 * A message filter is invoked before the message handler processes a
 * message. If the filter returns `true` from its [[filterMessage]] method,
 * no other filters will be invoked, and the message will not be delivered.
 *
 * The most recently installed message filter is executed first.
 *
 * @param handler - The handler whose messages should be filtered.
 *
 * @param filter - The filter to install for the handler.
 *
 * #### Notes
 * It is possible to install the same filter multiple times. If the
 * filter should be unique, call [[removeMessageFilter]] first.
 *
 * **See Also** [[removeMessageFilter]].
 */
function installMessageFilter(handler, filter) {
    getDispatcher(handler).installMessageFilter(filter);
}
exports.installMessageFilter = installMessageFilter;
/**
 * Remove a previously installed message filter for a message handler.
 *
 * @param handler - The handler for which the filter is installed.
 *
 * @param filter - The filter to remove.
 *
 * #### Notes
 * This will remove **all** occurrences of the filter. If the filter is
 * not installed, this is a no-op.
 *
 * It is safe to call this function while the filter is executing.
 *
 * **See Also** [[installMessageFilter]].
 */
function removeMessageFilter(handler, filter) {
    getDispatcher(handler).removeMessageFilter(filter);
}
exports.removeMessageFilter = removeMessageFilter;
/**
 * Clear all message data associated with the message handler.
 *
 * @param handler - The message handler for which to clear the data.
 *
 * #### Notes
 * This will remove all pending messages and filters for the handler.
 */
function clearMessageData(handler) {
    var dispatcher = dispatcherMap.get(handler);
    if (dispatcher)
        dispatcher.clear();
    dispatchQueue.removeAll(handler);
}
exports.clearMessageData = clearMessageData;
/**
 * The internal mapping of message handler to message dispatcher
 */
var dispatcherMap = new WeakMap();
/**
 * The internal queue of pending message handlers.
 */
var dispatchQueue = new phosphor_queue_1.Queue();
/**
 * The internal animation frame id for the message loop wake up call.
 */
var frameId = void 0;
/**
 * A local reference to an event loop hook.
 */
var raf;
if (typeof requestAnimationFrame === 'function') {
    raf = requestAnimationFrame;
}
else {
    raf = setImmediate;
}
/**
 * Get or create the message dispatcher for a message handler.
 */
function getDispatcher(handler) {
    var dispatcher = dispatcherMap.get(handler);
    if (dispatcher)
        return dispatcher;
    dispatcher = new MessageDispatcher();
    dispatcherMap.set(handler, dispatcher);
    return dispatcher;
}
/**
 * Wake up the message loop to process any pending dispatchers.
 *
 * This is a no-op if a wake up is not needed or is already pending.
 */
function wakeUpMessageLoop() {
    if (frameId === void 0 && !dispatchQueue.empty) {
        frameId = raf(runMessageLoop);
    }
}
/**
 * Run an iteration of the message loop.
 *
 * This will process all pending dispatchers in the queue. Dispatchers
 * which are added to the queue while the message loop is running will
 * be processed on the next message loop cycle.
 */
function runMessageLoop() {
    // Clear the frame id so the next wake up call can be scheduled.
    frameId = void 0;
    // If the queue is empty, there is nothing else to do.
    if (dispatchQueue.empty) {
        return;
    }
    // Add a null sentinel value to the end of the queue. The queue
    // will only be processed up to the first null value. This means
    // that messages posted during this cycle will execute on the next
    // cycle of the loop. If the last value in the array is null, it
    // means that an exception was thrown by a message handler and the
    // loop had to be restarted.
    if (dispatchQueue.back !== null) {
        dispatchQueue.push(null);
    }
    // The message dispatch loop. If the dispatcher is the null sentinel,
    // the processing of the current block of messages is complete and
    // another loop is scheduled. Otherwise, the pending message is
    // dispatched to the message handler.
    while (!dispatchQueue.empty) {
        var handler = dispatchQueue.pop();
        if (handler === null) {
            wakeUpMessageLoop();
            return;
        }
        dispatchMessage(dispatcherMap.get(handler), handler);
    }
}
/**
 * Safely process the pending handler message.
 *
 * If the message handler throws an exception, the message loop will
 * be restarted and the exception will be rethrown.
 */
function dispatchMessage(dispatcher, handler) {
    try {
        dispatcher.sendPendingMessage(handler);
    }
    catch (ex) {
        wakeUpMessageLoop();
        throw ex;
    }
}
/**
 * An internal class which manages message dispatching for a handler.
 */
var MessageDispatcher = (function () {
    function MessageDispatcher() {
        this._filters = null;
        this._messages = null;
    }
    /**
     * Send a message to the handler immediately.
     *
     * The message will first be sent through installed filters.
     */
    MessageDispatcher.prototype.sendMessage = function (handler, msg) {
        if (!this._filterMessage(handler, msg)) {
            handler.processMessage(msg);
        }
    };
    /**
     * Post a message for delivery in the future.
     *
     * The message will first be compressed if possible.
     */
    MessageDispatcher.prototype.postMessage = function (handler, msg) {
        if (!this._compressMessage(handler, msg)) {
            this._enqueueMessage(handler, msg);
        }
    };
    /**
     * Test whether the dispatcher has messages pending delivery.
     */
    MessageDispatcher.prototype.hasPendingMessages = function () {
        return !!(this._messages && !this._messages.empty);
    };
    /**
     * Send the first pending message to the message handler.
     */
    MessageDispatcher.prototype.sendPendingMessage = function (handler) {
        if (this._messages && !this._messages.empty) {
            this.sendMessage(handler, this._messages.pop());
        }
    };
    /**
     * Install a message filter for the dispatcher.
     */
    MessageDispatcher.prototype.installMessageFilter = function (filter) {
        this._filters = { next: this._filters, filter: filter };
    };
    /**
     * Remove all occurrences of a message filter from the dispatcher.
     */
    MessageDispatcher.prototype.removeMessageFilter = function (filter) {
        var link = this._filters;
        var prev = null;
        while (link !== null) {
            if (link.filter === filter) {
                link.filter = null;
            }
            else if (prev === null) {
                this._filters = link;
                prev = link;
            }
            else {
                prev.next = link;
                prev = link;
            }
            link = link.next;
        }
        if (!prev) {
            this._filters = null;
        }
        else {
            prev.next = null;
        }
    };
    /**
     * Clear all messages and filters from the dispatcher.
     */
    MessageDispatcher.prototype.clear = function () {
        if (this._messages) {
            this._messages.clear();
        }
        for (var link = this._filters; link !== null; link = link.next) {
            link.filter = null;
        }
        this._filters = null;
    };
    /**
     * Run the installed message filters for the handler.
     *
     * Returns `true` if the message was filtered, `false` otherwise.
     */
    MessageDispatcher.prototype._filterMessage = function (handler, msg) {
        for (var link = this._filters; link !== null; link = link.next) {
            if (link.filter && link.filter.filterMessage(handler, msg)) {
                return true;
            }
        }
        return false;
    };
    /**
     * Compress the mssage for the given handler.
     *
     * Returns `true` if the message was compressed, `false` otherwise.
     */
    MessageDispatcher.prototype._compressMessage = function (handler, msg) {
        if (!handler.compressMessage) {
            return false;
        }
        if (!this._messages || this._messages.empty) {
            return false;
        }
        return handler.compressMessage(msg, this._messages);
    };
    /**
     * Enqueue the message for future delivery to the handler.
     */
    MessageDispatcher.prototype._enqueueMessage = function (handler, msg) {
        (this._messages || (this._messages = new phosphor_queue_1.Queue())).push(msg);
        dispatchQueue.push(handler);
        wakeUpMessageLoop();
    };
    return MessageDispatcher;
})();

},{"phosphor-queue":24}],22:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
/**
 * A base class for creating objects which wrap a DOM node.
 */
var NodeWrapper = (function () {
    function NodeWrapper() {
        this._node = this.constructor.createNode();
    }
    /**
     * Create the DOM node for a new node wrapper instance.
     *
     * @returns The DOM node to use with the node wrapper instance.
     *
     * #### Notes
     * The default implementation creates an empty `<div>`.
     *
     * This may be reimplemented by a subclass to create a custom node.
     */
    NodeWrapper.createNode = function () {
        return document.createElement('div');
    };
    Object.defineProperty(NodeWrapper.prototype, "node", {
        /**
         * Get the DOM node managed by the wrapper.
         *
         * #### Notes
         * This property is read-only.
         */
        get: function () {
            return this._node;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NodeWrapper.prototype, "id", {
        /**
         * Get the id of the wrapper's DOM node.
         */
        get: function () {
            return this._node.id;
        },
        /**
         * Set the id of the wrapper's DOM node.
         */
        set: function (value) {
            this._node.id = value;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Test whether the wrapper's DOM node has the given class name.
     *
     * @param name - The class name of interest.
     *
     * @returns `true` if the node has the class, `false` otherwise.
     */
    NodeWrapper.prototype.hasClass = function (name) {
        return this._node.classList.contains(name);
    };
    /**
     * Add a class name to the wrapper's DOM node.
     *
     * @param name - The class name to add to the node.
     *
     * #### Notes
     * If the class name is already added to the node, this is a no-op.
     */
    NodeWrapper.prototype.addClass = function (name) {
        this._node.classList.add(name);
    };
    /**
     * Remove a class name from the wrapper's DOM node.
     *
     * @param name - The class name to remove from the node.
     *
     * #### Notes
     * If the class name is not yet added to the node, this is a no-op.
     */
    NodeWrapper.prototype.removeClass = function (name) {
        this._node.classList.remove(name);
    };
    /**
     * Toggle a class name on the wrapper's DOM node.
     *
     * @param name - The class name to toggle on the node.
     *
     * @param force - Whether to force add the class (`true`) or force
     *   remove the class (`false`). If not provided, the presence of
     *   the class will be toggled from its current state.
     *
     * @returns `true` if the class is now present, `false` otherwise.
     */
    NodeWrapper.prototype.toggleClass = function (name, force) {
        var present;
        if (force === true) {
            this.addClass(name);
            present = true;
        }
        else if (force === false) {
            this.removeClass(name);
            present = false;
        }
        else if (this.hasClass(name)) {
            this.removeClass(name);
            present = false;
        }
        else {
            this.addClass(name);
            present = true;
        }
        return present;
    };
    return NodeWrapper;
})();
exports.NodeWrapper = NodeWrapper;

},{}],23:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
var phosphor_signaling_1 = require('phosphor-signaling');
/**
 * A property descriptor for a property on an object.
 *
 * Properties descriptors can be used to expose a rich interface for an
 * object which encapsulates value creation, coercion, and notification.
 * They can also be used to extend the state of an object with semantic
 * data from another class.
 *
 * #### Example
 * ```typescript
 * import { Property } from 'phosphor-properties';
 *
 * class MyClass {
 *
 *   static myValueProperty = new Property<MyClass, number>({
 *      value: 0,
 *      coerce: (owner, value) => Math.max(0, value),
 *      changed: (owner, oldValue, newValue) => { console.log(newValue); },
 *   });
 *
 *   get myValue(): number {
 *     return MyClass.myValueProperty.get(this);
 *   }
 *
 *   set myValue(value: number) {
 *     MyClass.myValueProperty.set(this, value);
 *   }
 * }
 * ```
 */
var Property = (function () {
    /**
     * Construct a new property descriptor.
     *
     * @param options - The options for initializing the property.
     */
    function Property(options) {
        if (options === void 0) { options = {}; }
        this._pid = nextPID();
        this._value = options.value;
        this._create = options.create;
        this._coerce = options.coerce;
        this._compare = options.compare;
        this._changed = options.changed;
    }
    /**
     * Get a bound [[changedSignal]] for a given property owner.
     *
     * @param owner - The object to bind to the changed signal.
     *
     * @returns The bound changed signal for the owner.
     *
     * #### Notes
     * This signal will be emitted whenever any property value
     * for the specified owner is changed.
     */
    Property.getChanged = function (owner) {
        return Property.changedSignal.bind(owner);
    };
    /**
     * Get the current value of the property for a given owner.
     *
     * @param owner - The property owner of interest.
     *
     * @returns The current value of the property.
     *
     * #### Notes
     * If the value has not yet been set, the default value will be
     * computed and assigned as the current value of the property.
     */
    Property.prototype.get = function (owner) {
        var value;
        var hash = lookupHash(owner);
        if (this._pid in hash) {
            value = hash[this._pid];
        }
        else {
            value = hash[this._pid] = this._createValue(owner);
        }
        return value;
    };
    /**
     * Set the current value of the property for a given owner.
     *
     * @param owner - The property owner of interest.
     *
     * @param value - The value for the property.
     *
     * #### Notes
     * If this operation causes the property value to change, the
     * [[changedSignal]] will be emitted with the owner as sender.
     *
     * If the value has not yet been set, the default value will be
     * computed and used as the previous value for the comparison.
     */
    Property.prototype.set = function (owner, value) {
        var oldValue;
        var hash = lookupHash(owner);
        if (this._pid in hash) {
            oldValue = hash[this._pid];
        }
        else {
            oldValue = hash[this._pid] = this._createValue(owner);
        }
        var newValue = this._coerceValue(owner, value);
        this._maybeNotify(owner, oldValue, hash[this._pid] = newValue);
    };
    /**
     * Explicitly coerce the current property value for a given owner.
     *
     * @param owner - The property owner of interest.
     *
     * #### Notes
     * If this operation causes the property value to change, the
     * [[changedSignal]] will be emitted with the owner as sender.
     *
     * If the value has not yet been set, the default value will be
     * computed and used as the previous value for the comparison.
     */
    Property.prototype.coerce = function (owner) {
        var oldValue;
        var hash = lookupHash(owner);
        if (this._pid in hash) {
            oldValue = hash[this._pid];
        }
        else {
            oldValue = hash[this._pid] = this._createValue(owner);
        }
        var newValue = this._coerceValue(owner, oldValue);
        this._maybeNotify(owner, oldValue, hash[this._pid] = newValue);
    };
    /**
     * Get or create the default value for the given owner.
     */
    Property.prototype._createValue = function (owner) {
        var create = this._create;
        return create ? create(owner) : this._value;
    };
    /**
     * Coerce the value for the given owner.
     */
    Property.prototype._coerceValue = function (owner, value) {
        var coerce = this._coerce;
        return coerce ? coerce(owner, value) : value;
    };
    /**
     * Compare the old value and new value for equality.
     */
    Property.prototype._compareValue = function (oldValue, newValue) {
        var compare = this._compare;
        return compare ? compare(oldValue, newValue) : oldValue === newValue;
    };
    /**
     * Run the change notification if the given values are different.
     */
    Property.prototype._maybeNotify = function (owner, oldValue, newValue) {
        if (!this._compareValue(oldValue, newValue)) {
            var changed = this._changed;
            if (changed)
                changed(owner, oldValue, newValue);
            Property.getChanged(owner).emit(changedArgs(this, oldValue, newValue));
        }
    };
    /**
     * A signal emitted when a property value changes.
     *
     * #### Notes
     * This is an attached signal which will be emitted using the
     * owner of the property value as the sender.
     *
     * **See also:** [[getChanged]]
     */
    Property.changedSignal = new phosphor_signaling_1.Signal();
    return Property;
})();
exports.Property = Property;
/**
 * Clear the stored property data for the given property owner.
 *
 * @param owner - The property owner of interest.
 *
 * #### Notes
 * This will clear all property values for the owner, but it will
 * **not** emit any change notifications.
 */
function clearPropertyData(owner) {
    ownerData.delete(owner);
}
exports.clearPropertyData = clearPropertyData;
/**
 * A weak mapping of property owner to property hash.
 */
var ownerData = new WeakMap();
/**
 * A function which computes successive unique property ids.
 */
var nextPID = (function () { var id = 0; return function () { return 'pid-' + id++; }; })();
/**
 * Create the changed args for the given property and values.
 */
function changedArgs(property, oldValue, newValue) {
    return { property: property, oldValue: oldValue, newValue: newValue };
}
/**
 * Lookup the data hash for the property owner.
 *
 * This will create the hash if one does not already exist.
 */
function lookupHash(owner) {
    var hash = ownerData.get(owner);
    if (hash !== void 0)
        return hash;
    hash = Object.create(null);
    ownerData.set(owner, hash);
    return hash;
}

},{"phosphor-signaling":25}],24:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
/**
 * A generic FIFO queue data structure.
 *
 * #### Notes
 * This queue is implemented internally using a singly linked list and
 * can grow to arbitrary size.
 *
 * #### Example
 * ```typescript
 * var q = new Queue<number>([0, 1, 2]);
 * q.size;      // 3
 * q.empty;     // false
 * q.pop();     // 0
 * q.pop();     // 1
 * q.push(42);  // undefined
 * q.size;      // 2
 * q.pop();     // 2
 * q.pop();     // 42
 * q.pop();     // undefined
 * q.size;      // 0
 * q.empty;     // true
 * ```
 */
var Queue = (function () {
    /**
     * Construct a new queue.
     *
     * @param items - The initial items for the queue.
     */
    function Queue(items) {
        var _this = this;
        this._size = 0;
        this._front = null;
        this._back = null;
        if (items)
            items.forEach(function (item) { return _this.push(item); });
    }
    Object.defineProperty(Queue.prototype, "size", {
        /**
         * Get the number of elements in the queue.
         *
         * #### Notes
         * This has `O(1)` complexity.
         */
        get: function () {
            return this._size;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Queue.prototype, "empty", {
        /**
         * Test whether the queue is empty.
         *
         * #### Notes
         * This has `O(1)` complexity.
         */
        get: function () {
            return this._size === 0;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Queue.prototype, "front", {
        /**
         * Get the value at the front of the queue.
         *
         * #### Notes
         * This has `O(1)` complexity.
         *
         * If the queue is empty, this value will be `undefined`.
         */
        get: function () {
            return this._front !== null ? this._front.value : void 0;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Queue.prototype, "back", {
        /**
         * Get the value at the back of the queue.
         *
         * #### Notes
         * This has `O(1)` complexity.
         *
         * If the queue is empty, this value will be `undefined`.
         */
        get: function () {
            return this._back !== null ? this._back.value : void 0;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Push a value onto the back of the queue.
     *
     * @param value - The value to add to the queue.
     *
     * #### Notes
     * This has `O(1)` complexity.
     */
    Queue.prototype.push = function (value) {
        var link = { next: null, value: value };
        if (this._back === null) {
            this._front = link;
            this._back = link;
        }
        else {
            this._back.next = link;
            this._back = link;
        }
        this._size++;
    };
    /**
     * Pop and return the value at the front of the queue.
     *
     * @returns The value at the front of the queue.
     *
     * #### Notes
     * This has `O(1)` complexity.
     *
     * If the queue is empty, the return value will be `undefined`.
     */
    Queue.prototype.pop = function () {
        var link = this._front;
        if (link === null) {
            return void 0;
        }
        if (link.next === null) {
            this._front = null;
            this._back = null;
        }
        else {
            this._front = link.next;
        }
        this._size--;
        return link.value;
    };
    /**
     * Remove the first occurrence of a value from the queue.
     *
     * @param value - The value to remove from the queue.
     *
     * @returns `true` on success, `false` otherwise.
     *
     * #### Notes
     * This has `O(N)` complexity.
     */
    Queue.prototype.remove = function (value) {
        var link = this._front;
        var prev = null;
        while (link !== null) {
            if (link.value === value) {
                if (prev === null) {
                    this._front = link.next;
                }
                else {
                    prev.next = link.next;
                }
                if (link.next === null) {
                    this._back = prev;
                }
                this._size--;
                return true;
            }
            prev = link;
            link = link.next;
        }
        return false;
    };
    /**
     * Remove all occurrences of a value from the queue.
     *
     * @param value - The value to remove from the queue.
     *
     * @returns The number of occurrences removed.
     *
     * #### Notes
     * This has `O(N)` complexity.
     */
    Queue.prototype.removeAll = function (value) {
        var count = 0;
        var link = this._front;
        var prev = null;
        while (link !== null) {
            if (link.value === value) {
                count++;
                this._size--;
            }
            else if (prev === null) {
                this._front = link;
                prev = link;
            }
            else {
                prev.next = link;
                prev = link;
            }
            link = link.next;
        }
        if (!prev) {
            this._front = null;
            this._back = null;
        }
        else {
            prev.next = null;
            this._back = prev;
        }
        return count;
    };
    /**
     * Remove all values from the queue.
     *
     * #### Notes
     * This has `O(1)` complexity.
     */
    Queue.prototype.clear = function () {
        this._size = 0;
        this._front = null;
        this._back = null;
    };
    /**
     * Create an array from the values in the queue.
     *
     * @returns An array of all values in the queue.
     *
     * #### Notes
     * This has `O(N)` complexity.
     */
    Queue.prototype.toArray = function () {
        var result = new Array(this._size);
        for (var i = 0, link = this._front; link !== null; link = link.next, ++i) {
            result[i] = link.value;
        }
        return result;
    };
    /**
     * Test whether any value in the queue passes a predicate function.
     *
     * @param pred - The predicate to apply to the values.
     *
     * @returns `true` if any value in the queue passes the predicate,
     *   or `false` otherwise.
     *
     * #### Notes
     * This has `O(N)` complexity.
     *
     * It is **not** safe for the predicate to modify the queue while
     * iterating.
     */
    Queue.prototype.some = function (pred) {
        for (var i = 0, link = this._front; link !== null; link = link.next, ++i) {
            if (pred(link.value, i))
                return true;
        }
        return false;
    };
    /**
     * Test whether all values in the queue pass a predicate function.
     *
     * @param pred - The predicate to apply to the values.
     *
     * @returns `true` if all values in the queue pass the predicate,
     *   or `false` otherwise.
     *
     * #### Notes
     * This has `O(N)` complexity.
     *
     * It is **not** safe for the predicate to modify the queue while
     * iterating.
     */
    Queue.prototype.every = function (pred) {
        for (var i = 0, link = this._front; link !== null; link = link.next, ++i) {
            if (!pred(link.value, i))
                return false;
        }
        return true;
    };
    /**
     * Create an array of the values which pass a predicate function.
     *
     * @param pred - The predicate to apply to the values.
     *
     * @returns The array of values which pass the predicate.
     *
     * #### Notes
     * This has `O(N)` complexity.
     *
     * It is **not** safe for the predicate to modify the queue while
     * iterating.
     */
    Queue.prototype.filter = function (pred) {
        var result = [];
        for (var i = 0, link = this._front; link !== null; link = link.next, ++i) {
            if (pred(link.value, i))
                result.push(link.value);
        }
        return result;
    };
    /**
     * Create an array of mapped values for the values in the queue.
     *
     * @param callback - The map function to apply to the values.
     *
     * @returns The array of values returned by the map function.
     *
     * #### Notes
     * This has `O(N)` complexity.
     *
     * It is **not** safe for the callback to modify the queue while
     * iterating.
     */
    Queue.prototype.map = function (callback) {
        var result = new Array(this._size);
        for (var i = 0, link = this._front; link !== null; link = link.next, ++i) {
            result[i] = callback(link.value, i);
        }
        return result;
    };
    /**
     * Execute a callback for each value in the queue.
     *
     * @param callback - The function to apply to the values.
     *
     * @returns The first value returned by the callback which is not
     *   `undefined`.
     *
     * #### Notes
     * This has `O(N)` complexity.
     *
     * Iteration will terminate immediately if the callback returns any
     * value other than `undefined`.
     *
     * It is **not** safe for the callback to modify the queue while
     * iterating.
     */
    Queue.prototype.forEach = function (callback) {
        for (var i = 0, link = this._front; link !== null; link = link.next, ++i) {
            var result = callback(link.value, i);
            if (result !== void 0)
                return result;
        }
        return void 0;
    };
    return Queue;
})();
exports.Queue = Queue;

},{}],25:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
/**
 * An object used for type-safe inter-object communication.
 *
 * Signals provide a type-safe implementation of the publish-subscribe
 * pattern. An object (publisher) declares which signals it will emit,
 * and consumers connect callbacks (subscribers) to those signals. The
 * subscribers are invoked whenever the publisher emits the signal.
 *
 * A `Signal` object must be bound to a sender in order to be useful.
 * A common pattern is to declare a `Signal` object as a static class
 * member, along with a convenience getter which binds the signal to
 * the `this` instance on-demand.
 *
 * #### Example
 * ```typescript
 * import { ISignal, Signal } from 'phosphor-signaling';
 *
 * class MyClass {
 *
 *   static valueChangedSignal = new Signal<MyClass, number>();
 *
 *   constructor(name: string) {
 *     this._name = name;
 *   }
 *
 *   get valueChanged(): ISignal<MyClass, number> {
 *     return MyClass.valueChangedSignal.bind(this);
 *   }
 *
 *   get name(): string {
 *     return this._name;
 *   }
 *
 *   get value(): number {
 *     return this._value;
 *   }
 *
 *   set value(value: number) {
 *     if (value !== this._value) {
 *       this._value = value;
 *       this.valueChanged.emit(value);
 *     }
 *   }
 *
 *   private _name: string;
 *   private _value = 0;
 * }
 *
 * function logger(sender: MyClass, value: number): void {
 *   console.log(sender.name, value);
 * }
 *
 * var m1 = new MyClass('foo');
 * var m2 = new MyClass('bar');
 *
 * m1.valueChanged.connect(logger);
 * m2.valueChanged.connect(logger);
 *
 * m1.value = 42;  // logs: foo 42
 * m2.value = 17;  // logs: bar 17
 * ```
 */
var Signal = (function () {
    function Signal() {
    }
    /**
     * Bind the signal to a specific sender.
     *
     * @param sender - The sender object to bind to the signal.
     *
     * @returns The bound signal object which can be used for connecting,
     *   disconnecting, and emitting the signal.
     */
    Signal.prototype.bind = function (sender) {
        return new BoundSignal(this, sender);
    };
    return Signal;
})();
exports.Signal = Signal;
/**
 * Remove all connections where the given object is the sender.
 *
 * @param sender - The sender object of interest.
 *
 * #### Example
 * ```typescript
 * disconnectSender(someObject);
 * ```
 */
function disconnectSender(sender) {
    var list = senderMap.get(sender);
    if (!list) {
        return;
    }
    var conn = list.first;
    while (conn !== null) {
        removeFromSendersList(conn);
        conn.callback = null;
        conn.thisArg = null;
        conn = conn.nextReceiver;
    }
    senderMap.delete(sender);
}
exports.disconnectSender = disconnectSender;
/**
 * Remove all connections where the given object is the receiver.
 *
 * @param receiver - The receiver object of interest.
 *
 * #### Notes
 * If a `thisArg` is provided when connecting a signal, that object
 * is considered the receiver. Otherwise, the `callback` is used as
 * the receiver.
 *
 * #### Example
 * ```typescript
 * // disconnect a regular object receiver
 * disconnectReceiver(myObject);
 *
 * // disconnect a plain callback receiver
 * disconnectReceiver(myCallback);
 * ```
 */
function disconnectReceiver(receiver) {
    var conn = receiverMap.get(receiver);
    if (!conn) {
        return;
    }
    while (conn !== null) {
        var next = conn.nextSender;
        conn.callback = null;
        conn.thisArg = null;
        conn.prevSender = null;
        conn.nextSender = null;
        conn = next;
    }
    receiverMap.delete(receiver);
}
exports.disconnectReceiver = disconnectReceiver;
/**
 * Clear all signal data associated with the given object.
 *
 * @param obj - The object for which the signal data should be cleared.
 *
 * #### Notes
 * This removes all signal connections where the object is used as
 * either the sender or the receiver.
 *
 * #### Example
 * ```typescript
 * clearSignalData(someObject);
 * ```
 */
function clearSignalData(obj) {
    disconnectSender(obj);
    disconnectReceiver(obj);
}
exports.clearSignalData = clearSignalData;
/**
 * A concrete implementation of ISignal.
 */
var BoundSignal = (function () {
    /**
     * Construct a new bound signal.
     */
    function BoundSignal(signal, sender) {
        this._signal = signal;
        this._sender = sender;
    }
    /**
     * Connect a callback to the signal.
     */
    BoundSignal.prototype.connect = function (callback, thisArg) {
        return connect(this._sender, this._signal, callback, thisArg);
    };
    /**
     * Disconnect a callback from the signal.
     */
    BoundSignal.prototype.disconnect = function (callback, thisArg) {
        return disconnect(this._sender, this._signal, callback, thisArg);
    };
    /**
     * Emit the signal and invoke the connected callbacks.
     */
    BoundSignal.prototype.emit = function (args) {
        emit(this._sender, this._signal, args);
    };
    return BoundSignal;
})();
/**
 * A struct which holds connection data.
 */
var Connection = (function () {
    function Connection() {
        /**
         * The signal for the connection.
         */
        this.signal = null;
        /**
         * The callback connected to the signal.
         */
        this.callback = null;
        /**
         * The `this` context for the callback.
         */
        this.thisArg = null;
        /**
         * The next connection in the singly linked receivers list.
         */
        this.nextReceiver = null;
        /**
         * The next connection in the doubly linked senders list.
         */
        this.nextSender = null;
        /**
         * The previous connection in the doubly linked senders list.
         */
        this.prevSender = null;
    }
    return Connection;
})();
/**
 * The list of receiver connections for a specific sender.
 */
var ConnectionList = (function () {
    function ConnectionList() {
        /**
         * The ref count for the list.
         */
        this.refs = 0;
        /**
         * The first connection in the list.
         */
        this.first = null;
        /**
         * The last connection in the list.
         */
        this.last = null;
    }
    return ConnectionList;
})();
/**
 * A mapping of sender object to its receiver connection list.
 */
var senderMap = new WeakMap();
/**
 * A mapping of receiver object to its sender connection list.
 */
var receiverMap = new WeakMap();
/**
 * Create a connection between a sender, signal, and callback.
 */
function connect(sender, signal, callback, thisArg) {
    // Coerce a `null` thisArg to `undefined`.
    thisArg = thisArg || void 0;
    // Search for an equivalent connection and bail if one exists.
    var list = senderMap.get(sender);
    if (list && findConnection(list, signal, callback, thisArg)) {
        return false;
    }
    // Create a new connection.
    var conn = new Connection();
    conn.signal = signal;
    conn.callback = callback;
    conn.thisArg = thisArg;
    // Add the connection to the receivers list.
    if (!list) {
        list = new ConnectionList();
        list.first = conn;
        list.last = conn;
        senderMap.set(sender, list);
    }
    else if (list.last === null) {
        list.first = conn;
        list.last = conn;
    }
    else {
        list.last.nextReceiver = conn;
        list.last = conn;
    }
    // Add the connection to the senders list.
    var receiver = thisArg || callback;
    var head = receiverMap.get(receiver);
    if (head) {
        head.prevSender = conn;
        conn.nextSender = head;
    }
    receiverMap.set(receiver, conn);
    return true;
}
/**
 * Break the connection between a sender, signal, and callback.
 */
function disconnect(sender, signal, callback, thisArg) {
    // Coerce a `null` thisArg to `undefined`.
    thisArg = thisArg || void 0;
    // Search for an equivalent connection and bail if none exists.
    var list = senderMap.get(sender);
    if (!list) {
        return false;
    }
    var conn = findConnection(list, signal, callback, thisArg);
    if (!conn) {
        return false;
    }
    // Remove the connection from the senders list. It will be removed
    // from the receivers list the next time the signal is emitted.
    removeFromSendersList(conn);
    // Clear the connection data so it becomes a dead connection.
    conn.callback = null;
    conn.thisArg = null;
    return true;
}
/**
 * Emit a signal and invoke the connected callbacks.
 */
function emit(sender, signal, args) {
    var list = senderMap.get(sender);
    if (!list) {
        return;
    }
    list.refs++;
    try {
        var dirty = invokeList(list, sender, signal, args);
    }
    finally {
        list.refs--;
    }
    if (dirty && list.refs === 0) {
        cleanList(list);
    }
}
/**
 * Find a matching connection in the given connection list.
 *
 * Returns `null` if no matching connection is found.
 */
function findConnection(list, signal, callback, thisArg) {
    var conn = list.first;
    while (conn !== null) {
        if (conn.signal === signal &&
            conn.callback === callback &&
            conn.thisArg === thisArg) {
            return conn;
        }
        conn = conn.nextReceiver;
    }
    return null;
}
/**
 * Invoke the callbacks for the matching signals in the list.
 *
 * Connections added during dispatch will not be invoked. This returns
 * `true` if there are dead connections in the list, `false` otherwise.
 */
function invokeList(list, sender, signal, args) {
    var dirty = false;
    var last = list.last;
    var conn = list.first;
    while (conn !== null) {
        if (!conn.callback) {
            dirty = true;
        }
        else if (conn.signal === signal) {
            conn.callback.call(conn.thisArg, sender, args);
        }
        if (conn === last) {
            break;
        }
        conn = conn.nextReceiver;
    }
    return dirty;
}
/**
 * Remove the dead connections from the given connection list.
 */
function cleanList(list) {
    var prev;
    var conn = list.first;
    while (conn !== null) {
        var next = conn.nextReceiver;
        if (!conn.callback) {
            conn.nextReceiver = null;
        }
        else if (!prev) {
            list.first = conn;
            prev = conn;
        }
        else {
            prev.nextReceiver = conn;
            prev = conn;
        }
        conn = next;
    }
    if (!prev) {
        list.first = null;
        list.last = null;
    }
    else {
        prev.nextReceiver = null;
        list.last = prev;
    }
}
/**
 * Remove a connection from the doubly linked list of senders.
 */
function removeFromSendersList(conn) {
    var receiver = conn.thisArg || conn.callback;
    var prev = conn.prevSender;
    var next = conn.nextSender;
    if (prev === null && next === null) {
        receiverMap.delete(receiver);
    }
    else if (prev === null) {
        receiverMap.set(receiver, next);
        next.prevSender = null;
    }
    else if (next === null) {
        prev.nextSender = null;
    }
    else {
        prev.nextSender = next;
        next.prevSender = prev;
    }
    conn.prevSender = null;
    conn.nextSender = null;
}

},{}],26:[function(require,module,exports){
var css = "/*-----------------------------------------------------------------------------\n| Copyright (c) 2014-2015, PhosphorJS Contributors\n|\n| Distributed under the terms of the BSD 3-Clause License.\n|\n| The full license is in the file LICENSE, distributed with this software.\n|----------------------------------------------------------------------------*/\n.p-SplitPanel {\n  position: relative;\n}\n.p-SplitPanel > .p-Widget {\n  position: absolute;\n  z-index: 0;\n}\n.p-SplitHandle {\n  box-sizing: border-box;\n  position: absolute;\n  z-index: 1;\n}\n.p-SplitHandle.p-mod-hidden {\n  display: none;\n}\n.p-SplitHandle.p-mod-horizontal {\n  cursor: ew-resize;\n}\n.p-SplitHandle.p-mod-vertical {\n  cursor: ns-resize;\n}\n.p-SplitHandle-overlay {\n  box-sizing: border-box;\n  position: absolute;\n  top: 0;\n  left: 0;\n  width: 100%;\n  height: 100%;\n}\n.p-SplitHandle.p-mod-horizontal > .p-SplitHandle-overlay {\n  min-width: 7px;\n  left: 50%;\n  transform: translateX(-50%);\n}\n.p-SplitHandle.p-mod-vertical > .p-SplitHandle-overlay {\n  min-height: 7px;\n  top: 50%;\n  transform: translateY(-50%);\n}\n"; (require("browserify-css").createStyle(css, { "href": "node_modules/phosphor-splitpanel/lib/index.css"})); module.exports = css;
},{"browserify-css":1}],27:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var arrays = require('phosphor-arrays');
var phosphor_boxengine_1 = require('phosphor-boxengine');
var phosphor_domutil_1 = require('phosphor-domutil');
var phosphor_messaging_1 = require('phosphor-messaging');
var phosphor_nodewrapper_1 = require('phosphor-nodewrapper');
var phosphor_properties_1 = require('phosphor-properties');
var phosphor_widget_1 = require('phosphor-widget');
require('./index.css');
/**
 * `p-SplitPanel`: the class name added to SplitPanel instances.
 */
exports.SPLIT_PANEL_CLASS = 'p-SplitPanel';
/**
 * `p-SplitHandle`: the class name for a split handle.
 */
exports.SPLIT_HANDLE_CLASS = 'p-SplitHandle';
/**
 * `p-SplitHandle-overlay`: the class name for a split handle overlay.
 */
exports.OVERLAY_CLASS = 'p-SplitHandle-overlay';
/**
 * `p-mod-horizontal`: the class name added to horizontal panels and handles.
 */
exports.HORIZONTAL_CLASS = 'p-mod-horizontal';
/**
 * `p-mod-vertical`: the class name added to vertical panels and handles.
 */
exports.VERTICAL_CLASS = 'p-mod-vertical';
/**
 * `p-mod-hidden`: The class name added to hidden split handles.
 */
exports.HIDDEN_CLASS = 'p-mod-hidden';
/**
 * The layout orientation of a split panel.
 */
(function (Orientation) {
    /**
     * Left-to-right horizontal orientation.
     */
    Orientation[Orientation["Horizontal"] = 0] = "Horizontal";
    /**
     * Top-to-bottom vertical orientation.
     */
    Orientation[Orientation["Vertical"] = 1] = "Vertical";
})(exports.Orientation || (exports.Orientation = {}));
var Orientation = exports.Orientation;
/**
 * A widget which arranges its children into resizable sections.
 */
var SplitPanel = (function (_super) {
    __extends(SplitPanel, _super);
    /**
     * Construct a new split panel.
     */
    function SplitPanel() {
        _super.call(this);
        this._fixedSpace = 0;
        this._pendingSizes = false;
        this._sizers = [];
        this._pressData = null;
        this.addClass(exports.SPLIT_PANEL_CLASS);
        this.addClass(exports.HORIZONTAL_CLASS);
    }
    /**
     * Get the split panel stretch factor for the given widget.
     *
     * @param widget - The widget of interest.
     *
     * @returns The split panel stretch factor for the widget.
     *
     * #### Notes
     * This is a pure delegate to the [[stretchProperty]].
     */
    SplitPanel.getStretch = function (widget) {
        return SplitPanel.stretchProperty.get(widget);
    };
    /**
     * Set the split panel stretch factor for the given widget.
     *
     * @param widget - The widget of interest.
     *
     * @param value - The value for the stretch factor.
     *
     * #### Notes
     * This is a pure delegate to the [[stretchProperty]].
     */
    SplitPanel.setStretch = function (widget, value) {
        SplitPanel.stretchProperty.set(widget, value);
    };
    /**
     * Dispose of the resources held by the panel.
     */
    SplitPanel.prototype.dispose = function () {
        this._releaseMouse();
        this._sizers.length = 0;
        _super.prototype.dispose.call(this);
    };
    Object.defineProperty(SplitPanel.prototype, "orientation", {
        /**
         * Get the orientation of the split panel.
         *
         * #### Notes
         * This is a pure delegate to the [[orientationProperty]].
         */
        get: function () {
            return SplitPanel.orientationProperty.get(this);
        },
        /**
         * Set the orientation of the split panel.
         *
         * #### Notes
         * This is a pure delegate to the [[orientationProperty]].
         */
        set: function (value) {
            SplitPanel.orientationProperty.set(this, value);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SplitPanel.prototype, "handleSize", {
        /**
         * Get the size of the split handles.
         *
         * #### Notes
         * This is a pure delegate to the [[handleSizeProperty]].
         */
        get: function () {
            return SplitPanel.handleSizeProperty.get(this);
        },
        /**
         * Set the the size of the split handles.
         *
         * #### Notes
         * This is a pure delegate to the [[handleSizeProperty]].
         */
        set: function (size) {
            SplitPanel.handleSizeProperty.set(this, size);
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Get the normalized sizes of the widgets in the panel.
     *
     * @returns The normalized sizes of the widgets in the panel.
     */
    SplitPanel.prototype.sizes = function () {
        return normalize(this._sizers.map(function (sizer) { return sizer.size; }));
    };
    /**
     * Set the relative sizes for the child widgets in the panel.
     *
     * @param sizes - The relative sizes for the children in the panel.
     *   These values will be normalized to the available layout space.
     *
     * #### Notes
     * Extra values are ignored, too few will yield an undefined layout.
     */
    SplitPanel.prototype.setSizes = function (sizes) {
        var normed = normalize(sizes);
        for (var i = 0, n = this._sizers.length; i < n; ++i) {
            var hint = Math.max(0, normed[i] || 0);
            var sizer = this._sizers[i];
            sizer.sizeHint = hint;
            sizer.size = hint;
        }
        this._pendingSizes = true;
        this.update();
    };
    /**
     * Handle the DOM events for the split panel.
     *
     * @param event - The DOM event sent to the panel.
     *
     * #### Notes
     * This method implements the DOM `EventListener` interface and is
     * called in response to events on the panel's DOM node. It should
     * not be called directly by user code.
     */
    SplitPanel.prototype.handleEvent = function (event) {
        switch (event.type) {
            case 'mousedown':
                this._evtMouseDown(event);
                break;
            case 'mouseup':
                this._evtMouseUp(event);
                break;
            case 'mousemove':
                this._evtMouseMove(event);
                break;
        }
    };
    /**
     * A message handler invoked on a `'child-added'` message.
     */
    SplitPanel.prototype.onChildAdded = function (msg) {
        phosphor_properties_1.Property.getChanged(msg.child).connect(this._onPropertyChanged, this);
        var sizer = createSizer(averageSize(this._sizers));
        arrays.insert(this._sizers, msg.currentIndex, sizer);
        this.node.appendChild(msg.child.node);
        this.node.appendChild(getHandle(msg.child).node);
        if (this.isAttached)
            phosphor_messaging_1.sendMessage(msg.child, phosphor_widget_1.MSG_AFTER_ATTACH);
        phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
    };
    /**
     * A message handler invoked on a `'child-removed'` message.
     */
    SplitPanel.prototype.onChildRemoved = function (msg) {
        phosphor_properties_1.Property.getChanged(msg.child).disconnect(this._onPropertyChanged, this);
        arrays.removeAt(this._sizers, msg.previousIndex);
        if (this.isAttached)
            phosphor_messaging_1.sendMessage(msg.child, phosphor_widget_1.MSG_BEFORE_DETACH);
        this.node.removeChild(msg.child.node);
        this.node.removeChild(getHandle(msg.child).node);
        phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
        msg.child.clearOffsetGeometry();
    };
    /**
     * A message handler invoked on a `'child-moved'` message.
     */
    SplitPanel.prototype.onChildMoved = function (msg) {
        arrays.move(this._sizers, msg.previousIndex, msg.currentIndex);
        phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
    };
    /**
     * A message handler invoked on an `'after-show'` message.
     */
    SplitPanel.prototype.onAfterShow = function (msg) {
        this.update(true);
    };
    /**
     * A message handler invoked on an `'after-attach'` message.
     */
    SplitPanel.prototype.onAfterAttach = function (msg) {
        this.node.addEventListener('mousedown', this);
        phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
    };
    /**
     * A message handler invoked on a `'before-detach'` message.
     */
    SplitPanel.prototype.onBeforeDetach = function (msg) {
        this.node.removeEventListener('mousedown', this);
    };
    /**
     * A message handler invoked on a `'child-shown'` message.
     */
    SplitPanel.prototype.onChildShown = function (msg) {
        phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
    };
    /**
     * A message handler invoked on a `'child-hidden'` message.
     */
    SplitPanel.prototype.onChildHidden = function (msg) {
        phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
    };
    /**
     * A message handler invoked on a `'resize'` message.
     */
    SplitPanel.prototype.onResize = function (msg) {
        if (this.isVisible) {
            if (msg.width < 0 || msg.height < 0) {
                var rect = this.offsetRect;
                this._layoutChildren(rect.width, rect.height);
            }
            else {
                this._layoutChildren(msg.width, msg.height);
            }
        }
    };
    /**
     * A message handler invoked on an `'update-request'` message.
     */
    SplitPanel.prototype.onUpdateRequest = function (msg) {
        if (this.isVisible) {
            var rect = this.offsetRect;
            this._layoutChildren(rect.width, rect.height);
        }
    };
    /**
     * A message handler invoked on a `'layout-request'` message.
     */
    SplitPanel.prototype.onLayoutRequest = function (msg) {
        if (this.isAttached) {
            this._setupGeometry();
        }
    };
    /**
     * Update the size constraints of the panel.
     */
    SplitPanel.prototype._setupGeometry = function () {
        // Update the handles and track the visible widget count.
        var visibleCount = 0;
        var orientation = this.orientation;
        var lastVisibleHandle = null;
        for (var i = 0, n = this.childCount; i < n; ++i) {
            var widget = this.childAt(i);
            var handle = getHandle(widget);
            handle.hidden = widget.hidden;
            handle.orientation = orientation;
            if (!handle.hidden) {
                lastVisibleHandle = handle;
                visibleCount++;
            }
        }
        // Hide the last visible handle and update the fixed space.
        if (lastVisibleHandle)
            lastVisibleHandle.hidden = true;
        this._fixedSpace = this.handleSize * Math.max(0, visibleCount - 1);
        // Compute new size constraints for the split panel.
        var minW = 0;
        var minH = 0;
        var maxW = Infinity;
        var maxH = Infinity;
        if (orientation === Orientation.Horizontal) {
            minW = this._fixedSpace;
            maxW = visibleCount > 0 ? minW : maxW;
            for (var i = 0, n = this.childCount; i < n; ++i) {
                var widget = this.childAt(i);
                var sizer = this._sizers[i];
                if (sizer.size > 0) {
                    sizer.sizeHint = sizer.size;
                }
                if (widget.hidden) {
                    sizer.minSize = 0;
                    sizer.maxSize = 0;
                    continue;
                }
                var limits = widget.sizeLimits;
                sizer.stretch = SplitPanel.getStretch(widget);
                sizer.minSize = limits.minWidth;
                sizer.maxSize = limits.maxWidth;
                minW += limits.minWidth;
                maxW += limits.maxWidth;
                minH = Math.max(minH, limits.minHeight);
                maxH = Math.min(maxH, limits.maxHeight);
            }
        }
        else {
            minH = this._fixedSpace;
            maxH = visibleCount > 0 ? minH : maxH;
            for (var i = 0, n = this.childCount; i < n; ++i) {
                var widget = this.childAt(i);
                var sizer = this._sizers[i];
                if (sizer.size > 0) {
                    sizer.sizeHint = sizer.size;
                }
                if (widget.hidden) {
                    sizer.minSize = 0;
                    sizer.maxSize = 0;
                    continue;
                }
                var limits = widget.sizeLimits;
                sizer.stretch = SplitPanel.getStretch(widget);
                sizer.minSize = limits.minHeight;
                sizer.maxSize = limits.maxHeight;
                minH += limits.minHeight;
                maxH += limits.maxHeight;
                minW = Math.max(minW, limits.minWidth);
                maxW = Math.min(maxW, limits.maxWidth);
            }
        }
        // Add the box sizing to the size constraints.
        var box = this.boxSizing;
        minW += box.horizontalSum;
        minH += box.verticalSum;
        maxW += box.horizontalSum;
        maxH += box.verticalSum;
        // Update the panel's size constraints.
        this.setSizeLimits(minW, minH, maxW, maxH);
        // Notifiy the parent that it should relayout.
        if (this.parent)
            phosphor_messaging_1.sendMessage(this.parent, phosphor_widget_1.MSG_LAYOUT_REQUEST);
        // Update the layout for the child widgets.
        this.update(true);
    };
    /**
     * Layout the children using the given offset width and height.
     */
    SplitPanel.prototype._layoutChildren = function (offsetWidth, offsetHeight) {
        // Bail early if their are no children to arrange.
        if (this.childCount === 0) {
            return;
        }
        // Compute the actual layout bounds adjusted for border and padding.
        var box = this.boxSizing;
        var top = box.paddingTop;
        var left = box.paddingLeft;
        var width = offsetWidth - box.horizontalSum;
        var height = offsetHeight - box.verticalSum;
        // Fetch whether the orientation is horizontal.
        var horizontal = this.orientation === Orientation.Horizontal;
        // Update the sizer hints if there is a pending `setSizes`.
        if (this._pendingSizes) {
            var space = horizontal ? width : height;
            var adjusted = Math.max(0, space - this._fixedSpace);
            for (var i = 0, n = this._sizers.length; i < n; ++i) {
                this._sizers[i].sizeHint *= adjusted;
            }
            this._pendingSizes = false;
        }
        // Distribute the layout space and layout the items.
        var handleSize = this.handleSize;
        if (horizontal) {
            phosphor_boxengine_1.boxCalc(this._sizers, Math.max(0, width - this._fixedSpace));
            for (var i = 0, n = this.childCount; i < n; ++i) {
                var widget = this.childAt(i);
                if (widget.hidden) {
                    continue;
                }
                var size = this._sizers[i].size;
                var hStyle = getHandle(widget).node.style;
                widget.setOffsetGeometry(left, top, size, height);
                hStyle.top = top + 'px';
                hStyle.left = left + size + 'px';
                hStyle.width = handleSize + 'px';
                hStyle.height = height + 'px';
                left += size + handleSize;
            }
        }
        else {
            phosphor_boxengine_1.boxCalc(this._sizers, Math.max(0, height - this._fixedSpace));
            for (var i = 0, n = this.childCount; i < n; ++i) {
                var widget = this.childAt(i);
                if (widget.hidden) {
                    continue;
                }
                var size = this._sizers[i].size;
                var hStyle = getHandle(widget).node.style;
                widget.setOffsetGeometry(left, top, width, size);
                hStyle.top = top + size + 'px';
                hStyle.left = left + 'px';
                hStyle.width = width + 'px';
                hStyle.height = handleSize + 'px';
                top += size + handleSize;
            }
        }
    };
    /**
     * Handle the `'mousedown'` event for the split panel.
     */
    SplitPanel.prototype._evtMouseDown = function (event) {
        if (event.button !== 0) {
            return;
        }
        var index = this._findHandleIndex(event.target);
        if (index === -1) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        document.addEventListener('mouseup', this, true);
        document.addEventListener('mousemove', this, true);
        var delta;
        var node = getHandle(this.childAt(index)).node;
        if (this.orientation === Orientation.Horizontal) {
            delta = event.clientX - node.getBoundingClientRect().left;
        }
        else {
            delta = event.clientY - node.getBoundingClientRect().top;
        }
        var override = phosphor_domutil_1.overrideCursor(window.getComputedStyle(node).cursor);
        this._pressData = { index: index, delta: delta, override: override };
    };
    /**
     * Handle the `'mouseup'` event for the split panel.
     */
    SplitPanel.prototype._evtMouseUp = function (event) {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        this._releaseMouse();
    };
    /**
     * Handle the `'mousemove'` event for the split panel.
     */
    SplitPanel.prototype._evtMouseMove = function (event) {
        event.preventDefault();
        event.stopPropagation();
        var pos;
        var data = this._pressData;
        var rect = this.node.getBoundingClientRect();
        if (this.orientation === Orientation.Horizontal) {
            pos = event.clientX - data.delta - rect.left;
        }
        else {
            pos = event.clientY - data.delta - rect.top;
        }
        this._moveHandle(data.index, pos);
    };
    /**
     * Release the mouse grab for the split panel.
     */
    SplitPanel.prototype._releaseMouse = function () {
        if (!this._pressData) {
            return;
        }
        this._pressData.override.dispose();
        this._pressData = null;
        document.removeEventListener('mouseup', this, true);
        document.removeEventListener('mousemove', this, true);
    };
    /**
     * Move a splitter handle to the specified client position.
     */
    SplitPanel.prototype._moveHandle = function (index, pos) {
        // Bail if the handle is invalid or hidden.
        var widget = this.childAt(index);
        if (!widget) {
            return;
        }
        var handle = getHandle(widget);
        if (handle.hidden) {
            return;
        }
        // Compute the delta movement for the handle.
        var delta;
        if (this.orientation === Orientation.Horizontal) {
            delta = pos - handle.node.offsetLeft;
        }
        else {
            delta = pos - handle.node.offsetTop;
        }
        if (delta === 0) {
            return;
        }
        // Prevent item resizing unless needed.
        for (var i = 0, n = this._sizers.length; i < n; ++i) {
            var sizer = this._sizers[i];
            if (sizer.size > 0)
                sizer.sizeHint = sizer.size;
        }
        // Adjust the sizers to reflect the movement.
        if (delta > 0) {
            growSizer(this._sizers, index, delta);
        }
        else {
            shrinkSizer(this._sizers, index, -delta);
        }
        // Update the layout of the widget items. The message is posted
        // instead of sent because the mouse move event frequency can
        // outpace the browser's ability to layout, leading to choppy
        // handle movement, especially on IE. Posting ensures we don't
        // try to layout faster than the browser can handle.
        this.update();
    };
    /**
     * Find the index of the split handle which contains the given target.
     */
    SplitPanel.prototype._findHandleIndex = function (target) {
        for (var i = 0, n = this.childCount; i < n; ++i) {
            var handle = getHandle(this.childAt(i));
            if (handle.node.contains(target))
                return i;
        }
        return -1;
    };
    /**
     * The change handler for the [[orientationProperty]].
     */
    SplitPanel.prototype._onOrientationChanged = function (old, value) {
        this.toggleClass(exports.HORIZONTAL_CLASS, value === Orientation.Horizontal);
        this.toggleClass(exports.VERTICAL_CLASS, value === Orientation.Vertical);
        phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
    };
    /**
     * The handler for the child property changed signal.
     */
    SplitPanel.prototype._onPropertyChanged = function (sender, args) {
        if (args.property === SplitPanel.stretchProperty) {
            phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
        }
    };
    /**
     * A convenience alias of the `Horizontal` [[Orientation]].
     */
    SplitPanel.Horizontal = Orientation.Horizontal;
    /**
     * A convenience alias of the `Vertical` [[Orientation]].
     */
    SplitPanel.Vertical = Orientation.Vertical;
    /**
     * The property descriptor for the split panel orientation.
     *
     * The controls whether the child widgets are arranged lef-to-right
     * (`Horizontal` the default) or top-to-bottom (`Vertical`).
     *
     * **See also:** [[orientation]]
     */
    SplitPanel.orientationProperty = new phosphor_properties_1.Property({
        value: Orientation.Horizontal,
        changed: function (owner, old, value) { return owner._onOrientationChanged(old, value); },
    });
    /**
     * The property descriptor for the split panel handle size.
     *
     * The controls the size of the split handles placed between the
     * children of the panel, in pixels. The default value is `3`.
     *
     * **See also:** [[handleSize]]
     */
    SplitPanel.handleSizeProperty = new phosphor_properties_1.Property({
        value: 3,
        coerce: function (owner, value) { return Math.max(0, value | 0); },
        changed: function (owner) { return phosphor_messaging_1.postMessage(owner, phosphor_widget_1.MSG_LAYOUT_REQUEST); },
    });
    /**
     * The property descriptor for a widget stretch factor.
     *
     * This is an attached property which controls how much a child widget
     * stretches or shrinks relative to its siblings when the split panel
     * is resized. The default value is `0`.
     *
     * **See also:** [[getStretch]], [[setStretch]]
     */
    SplitPanel.stretchProperty = new phosphor_properties_1.Property({
        value: 0,
        coerce: function (owner, value) { return Math.max(0, value | 0); },
    });
    return SplitPanel;
})(phosphor_widget_1.Widget);
exports.SplitPanel = SplitPanel;
/**
 * A class which manages a handle node for a split panel.
 */
var SplitHandle = (function (_super) {
    __extends(SplitHandle, _super);
    /**
     * Construct a new split handle.
     */
    function SplitHandle() {
        _super.call(this);
        this._hidden = false;
        this._orientation = Orientation.Horizontal;
        this.addClass(exports.SPLIT_HANDLE_CLASS);
        this.addClass(exports.HORIZONTAL_CLASS);
    }
    /**
     * Create the DOM node for a split handle.
     */
    SplitHandle.createNode = function () {
        var node = document.createElement('div');
        var overlay = document.createElement('div');
        overlay.className = exports.OVERLAY_CLASS;
        node.appendChild(overlay);
        return node;
    };
    Object.defineProperty(SplitHandle.prototype, "hidden", {
        /**
         * Get whether the handle is hidden.
         */
        get: function () {
            return this._hidden;
        },
        /**
         * Set whether the handle is hidden.
         */
        set: function (hidden) {
            if (hidden === this._hidden) {
                return;
            }
            this._hidden = hidden;
            this.toggleClass(exports.HIDDEN_CLASS, hidden);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SplitHandle.prototype, "orientation", {
        /**
         * Get the orientation of the handle.
         */
        get: function () {
            return this._orientation;
        },
        /**
         * Set the orientation of the handle.
         */
        set: function (value) {
            if (value === this._orientation) {
                return;
            }
            this._orientation = value;
            this.toggleClass(exports.HORIZONTAL_CLASS, value === Orientation.Horizontal);
            this.toggleClass(exports.VERTICAL_CLASS, value === Orientation.Vertical);
        },
        enumerable: true,
        configurable: true
    });
    return SplitHandle;
})(phosphor_nodewrapper_1.NodeWrapper);
/**
 * A private attached property for the split handle for a widget.
 */
var splitHandleProperty = new phosphor_properties_1.Property({
    create: function (owner) { return new SplitHandle(); },
});
/**
 * Lookup the split handle for the given widget.
 */
function getHandle(widget) {
    return splitHandleProperty.get(widget);
}
/**
 * Create a new box sizer with the given size hint.
 */
function createSizer(size) {
    var sizer = new phosphor_boxengine_1.BoxSizer();
    sizer.sizeHint = size | 0;
    return sizer;
}
/**
 * Compute the average size of the given box sizers.
 */
function averageSize(sizers) {
    var sum = sizers.reduce(function (v, s) { return v + s.size; }, 0);
    return sum > 0 ? sum / sizers.length : 0;
}
/**
 * Grow a sizer to the right by a positive delta and adjust neighbors.
 */
function growSizer(sizers, index, delta) {
    var growLimit = 0;
    for (var i = 0; i <= index; ++i) {
        var sizer = sizers[i];
        growLimit += sizer.maxSize - sizer.size;
    }
    var shrinkLimit = 0;
    for (var i = index + 1, n = sizers.length; i < n; ++i) {
        var sizer = sizers[i];
        shrinkLimit += sizer.size - sizer.minSize;
    }
    delta = Math.min(delta, growLimit, shrinkLimit);
    var grow = delta;
    for (var i = index; i >= 0 && grow > 0; --i) {
        var sizer = sizers[i];
        var limit = sizer.maxSize - sizer.size;
        if (limit >= grow) {
            sizer.sizeHint = sizer.size + grow;
            grow = 0;
        }
        else {
            sizer.sizeHint = sizer.size + limit;
            grow -= limit;
        }
    }
    var shrink = delta;
    for (var i = index + 1, n = sizers.length; i < n && shrink > 0; ++i) {
        var sizer = sizers[i];
        var limit = sizer.size - sizer.minSize;
        if (limit >= shrink) {
            sizer.sizeHint = sizer.size - shrink;
            shrink = 0;
        }
        else {
            sizer.sizeHint = sizer.size - limit;
            shrink -= limit;
        }
    }
}
/**
 * Shrink a sizer to the left by a positive delta and adjust neighbors.
 */
function shrinkSizer(sizers, index, delta) {
    var growLimit = 0;
    for (var i = index + 1, n = sizers.length; i < n; ++i) {
        var sizer = sizers[i];
        growLimit += sizer.maxSize - sizer.size;
    }
    var shrinkLimit = 0;
    for (var i = 0; i <= index; ++i) {
        var sizer = sizers[i];
        shrinkLimit += sizer.size - sizer.minSize;
    }
    delta = Math.min(delta, growLimit, shrinkLimit);
    var grow = delta;
    for (var i = index + 1, n = sizers.length; i < n && grow > 0; ++i) {
        var sizer = sizers[i];
        var limit = sizer.maxSize - sizer.size;
        if (limit >= grow) {
            sizer.sizeHint = sizer.size + grow;
            grow = 0;
        }
        else {
            sizer.sizeHint = sizer.size + limit;
            grow -= limit;
        }
    }
    var shrink = delta;
    for (var i = index; i >= 0 && shrink > 0; --i) {
        var sizer = sizers[i];
        var limit = sizer.size - sizer.minSize;
        if (limit >= shrink) {
            sizer.sizeHint = sizer.size - shrink;
            shrink = 0;
        }
        else {
            sizer.sizeHint = sizer.size - limit;
            shrink -= limit;
        }
    }
}
/**
 * Normalize an array of positive values.
 */
function normalize(values) {
    var n = values.length;
    if (n === 0) {
        return [];
    }
    var sum = 0;
    for (var i = 0; i < n; ++i) {
        sum += values[i];
    }
    var result = new Array(n);
    if (sum === 0) {
        for (var i = 0; i < n; ++i) {
            result[i] = 1 / n;
        }
    }
    else {
        for (var i = 0; i < n; ++i) {
            result[i] = values[i] / sum;
        }
    }
    return result;
}

},{"./index.css":26,"phosphor-arrays":12,"phosphor-boxengine":13,"phosphor-domutil":20,"phosphor-messaging":21,"phosphor-nodewrapper":22,"phosphor-properties":23,"phosphor-widget":36}],28:[function(require,module,exports){
var css = "/*-----------------------------------------------------------------------------\n| Copyright (c) 2014-2015, PhosphorJS Contributors\n|\n| Distributed under the terms of the BSD 3-Clause License.\n|\n| The full license is in the file LICENSE, distributed with this software.\n|----------------------------------------------------------------------------*/\n.p-StackedPanel {\n  position: relative;\n}\n.p-StackedPanel > .p-Widget {\n  position: absolute;\n}\n"; (require("browserify-css").createStyle(css, { "href": "node_modules/phosphor-stackedpanel/lib/index.css"})); module.exports = css;
},{"browserify-css":1}],29:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var phosphor_messaging_1 = require('phosphor-messaging');
var phosphor_properties_1 = require('phosphor-properties');
var phosphor_signaling_1 = require('phosphor-signaling');
var phosphor_widget_1 = require('phosphor-widget');
require('./index.css');
/**
 * `p-StackedPanel`: the class name added to StackedPanel instances.
 */
exports.STACKED_PANEL_CLASS = 'p-StackedPanel';
/**
 * A layout widget where only one child widget is visible at a time.
 */
var StackedPanel = (function (_super) {
    __extends(StackedPanel, _super);
    /**
     * Construct a new stacked panel.
     */
    function StackedPanel() {
        _super.call(this);
        this.addClass(exports.STACKED_PANEL_CLASS);
    }
    Object.defineProperty(StackedPanel.prototype, "currentChanged", {
        /**
         * A signal emitted when the current widget is changed.
         *
         * #### Notes
         * This is a pure delegate to the [[currentChangedSignal]].
         */
        get: function () {
            return StackedPanel.currentChangedSignal.bind(this);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(StackedPanel.prototype, "widgetRemoved", {
        /**
         * A signal emitted when a widget is removed from the panel.
         *
         * #### Notes
         * This is a pure delegate to the [[widgetRemovedSignal]].
         */
        get: function () {
            return StackedPanel.widgetRemovedSignal.bind(this);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(StackedPanel.prototype, "currentWidget", {
        /**
         * Get the current panel widget.
         *
         * #### Notes
         * This is a pure delegate to the [[currentWidgetProperty]].
         */
        get: function () {
            return StackedPanel.currentWidgetProperty.get(this);
        },
        /**
         * Set the current panel widget.
         *
         * #### Notes
         * This is a pure delegate to the [[currentWidgetProperty]].
         */
        set: function (widget) {
            StackedPanel.currentWidgetProperty.set(this, widget);
        },
        enumerable: true,
        configurable: true
    });
    /**
     * A message handler invoked on a `'child-added'` message.
     */
    StackedPanel.prototype.onChildAdded = function (msg) {
        msg.child.hidden = true;
        this.node.appendChild(msg.child.node);
        if (this.isAttached)
            phosphor_messaging_1.sendMessage(msg.child, phosphor_widget_1.MSG_AFTER_ATTACH);
    };
    /**
     * A message handler invoked on a `'child-removed'` message.
     */
    StackedPanel.prototype.onChildRemoved = function (msg) {
        if (msg.child === this.currentWidget)
            this.currentWidget = null;
        if (this.isAttached)
            phosphor_messaging_1.sendMessage(msg.child, phosphor_widget_1.MSG_BEFORE_DETACH);
        this.node.removeChild(msg.child.node);
        msg.child.clearOffsetGeometry();
        this.widgetRemoved.emit({ index: msg.previousIndex, widget: msg.child });
    };
    /**
     * A message handler invoked on a `'child-moved'` message.
     */
    StackedPanel.prototype.onChildMoved = function (msg) { };
    /**
     * A message handler invoked on an `'after-show'` message.
     */
    StackedPanel.prototype.onAfterShow = function (msg) {
        this.update(true);
    };
    /**
     * A message handler invoked on an `'after-attach'` message.
     */
    StackedPanel.prototype.onAfterAttach = function (msg) {
        phosphor_messaging_1.postMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
    };
    /**
     * A message handler invoked on a `'resize'` message.
     */
    StackedPanel.prototype.onResize = function (msg) {
        if (this.isVisible) {
            if (msg.width < 0 || msg.height < 0) {
                var rect = this.offsetRect;
                this._layoutChildren(rect.width, rect.height);
            }
            else {
                this._layoutChildren(msg.width, msg.height);
            }
        }
    };
    /**
     * A message handler invoked on an `'update-request'` message.
     */
    StackedPanel.prototype.onUpdateRequest = function (msg) {
        if (this.isVisible) {
            var rect = this.offsetRect;
            this._layoutChildren(rect.width, rect.height);
        }
    };
    /**
     * A message handler invoked on a `'layout-request'` message.
     */
    StackedPanel.prototype.onLayoutRequest = function (msg) {
        if (this.isAttached) {
            this._setupGeometry();
        }
    };
    /**
     * Update the size constraints of the panel.
     */
    StackedPanel.prototype._setupGeometry = function () {
        // Compute the new size limits.
        var minW = 0;
        var minH = 0;
        var maxW = Infinity;
        var maxH = Infinity;
        var widget = this.currentWidget;
        if (widget) {
            var limits = widget.sizeLimits;
            minW = limits.minWidth;
            minH = limits.minHeight;
            maxW = limits.maxWidth;
            maxH = limits.maxHeight;
        }
        // Add the box sizing to the size constraints.
        var box = this.boxSizing;
        minW += box.horizontalSum;
        minH += box.verticalSum;
        maxW += box.horizontalSum;
        maxH += box.verticalSum;
        // Update the panel's size constraints.
        this.setSizeLimits(minW, minH, maxW, maxH);
        // Notifiy the parent that it should relayout.
        if (this.parent)
            phosphor_messaging_1.sendMessage(this.parent, phosphor_widget_1.MSG_LAYOUT_REQUEST);
        // Update the layout for the child widgets.
        this.update(true);
    };
    /**
     * Layout the children using the given offset width and height.
     */
    StackedPanel.prototype._layoutChildren = function (offsetWidth, offsetHeight) {
        // Bail early if there is no current widget.
        var widget = this.currentWidget;
        if (!widget) {
            return;
        }
        // Compute the actual layout bounds adjusted for border and padding.
        var box = this.boxSizing;
        var top = box.paddingTop;
        var left = box.paddingLeft;
        var width = offsetWidth - box.horizontalSum;
        var height = offsetHeight - box.verticalSum;
        // Update the current widget's layout geometry.
        widget.setOffsetGeometry(left, top, width, height);
    };
    /**
     * The change handler for the [[currentWidgetProperty]].
     */
    StackedPanel.prototype._onCurrentWidgetChanged = function (old, val) {
        if (old)
            old.hidden = true;
        if (val)
            val.hidden = false;
        // Ideally, the layout request would be posted in order to take
        // advantage of message compression, but some browsers repaint
        // before the message gets processed, resulting in jitter. So,
        // the layout request is sent and processed immediately.
        phosphor_messaging_1.sendMessage(this, phosphor_widget_1.MSG_LAYOUT_REQUEST);
        this.currentChanged.emit({ index: this.childIndex(val), widget: val });
    };
    /**
     * A signal emitted when the current widget is changed.
     *
     * **See also:** [[currentChanged]]
     */
    StackedPanel.currentChangedSignal = new phosphor_signaling_1.Signal();
    /**
     * A signal emitted when a widget is removed from the panel.
     *
     * **See also:** [[widgetRemoved]]
     */
    StackedPanel.widgetRemovedSignal = new phosphor_signaling_1.Signal();
    /**
     * The property descriptor for the current widget.
     *
     * This controls which child widget is visible.
     *
     * **See also:** [[currentWidget]]
     */
    StackedPanel.currentWidgetProperty = new phosphor_properties_1.Property({
        value: null,
        coerce: function (owner, val) { return (val && val.parent === owner) ? val : null; },
        changed: function (owner, old, val) { return owner._onCurrentWidgetChanged(old, val); },
    });
    return StackedPanel;
})(phosphor_widget_1.Widget);
exports.StackedPanel = StackedPanel;

},{"./index.css":28,"phosphor-messaging":21,"phosphor-properties":23,"phosphor-signaling":25,"phosphor-widget":36}],30:[function(require,module,exports){
var css = "/*-----------------------------------------------------------------------------\n| Copyright (c) 2014-2015, PhosphorJS Contributors\n|\n| Distributed under the terms of the BSD 3-Clause License.\n|\n| The full license is in the file LICENSE, distributed with this software.\n|----------------------------------------------------------------------------*/\n.p-TabBar {\n  position: relative;\n}\n.p-TabBar-header {\n  display: none;\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n  z-index: 0;\n}\n.p-TabBar-content {\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  z-index: 2;\n  display: flex;\n  flex-direction: row;\n}\n.p-TabBar-footer {\n  display: none;\n  position: absolute;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  z-index: 1;\n}\n.p-Tab {\n  display: flex;\n  flex-direction: row;\n  box-sizing: border-box;\n  overflow: hidden;\n}\n.p-Tab-icon,\n.p-Tab-close-icon {\n  flex: 0 0 auto;\n}\n.p-Tab-text {\n  flex: 1 1 auto;\n  overflow: hidden;\n  white-space: nowrap;\n}\n.p-TabBar.p-mod-dragging > .p-TabBar-content > .p-Tab {\n  position: relative;\n  left: 0;\n  transition: left 150ms ease;\n}\n.p-TabBar.p-mod-dragging > .p-TabBar-content > .p-Tab.p-mod-active {\n  transition: none;\n}\n"; (require("browserify-css").createStyle(css, { "href": "node_modules/phosphor-tabs/lib/index.css"})); module.exports = css;
},{"browserify-css":1}],31:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./tab'));
__export(require('./tabbar'));
__export(require('./tabpanel'));
require('./index.css');

},{"./index.css":30,"./tab":32,"./tabbar":33,"./tabpanel":34}],32:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var phosphor_nodewrapper_1 = require('phosphor-nodewrapper');
/**
 * `p-Tab`: the class name added to Tab instances.
 */
exports.TAB_CLASS = 'p-Tab';
/**
 * `p-Tab-text`: the class name assigned to a tab text node.
 */
exports.TEXT_CLASS = 'p-Tab-text';
/**
 * `p-Tab-icon`: the class name assigned to a tab icon node.
 */
exports.ICON_CLASS = 'p-Tab-icon';
/**
 * `p-Tab-close-icon`: the class name assigned to a tab close icon node.
 */
exports.CLOSE_ICON_CLASS = 'p-Tab-close-icon';
/**
 * `p-mod-selected`: the class name added to a selected tab.
 */
exports.SELECTED_CLASS = 'p-mod-selected';
/**
 * `p-mod-closable`: the class name added to a closable tab.
 */
exports.CLOSABLE_CLASS = 'p-mod-closable';
/**
 * An object which manages a node for a tab bar.
 */
var Tab = (function (_super) {
    __extends(Tab, _super);
    /**
     * Construct a new tab.
     *
     * @param text - The initial text for the tab.
     */
    function Tab(text) {
        _super.call(this);
        this.addClass(exports.TAB_CLASS);
        if (text)
            this.text = text;
    }
    /**
     * Create the DOM node for a tab.
     */
    Tab.createNode = function () {
        var node = document.createElement('div');
        var icon = document.createElement('span');
        var text = document.createElement('span');
        var closeIcon = document.createElement('span');
        icon.className = exports.ICON_CLASS;
        text.className = exports.TEXT_CLASS;
        closeIcon.className = exports.CLOSE_ICON_CLASS;
        node.appendChild(icon);
        node.appendChild(text);
        node.appendChild(closeIcon);
        return node;
    };
    Object.defineProperty(Tab.prototype, "text", {
        /**
         * Get the text for the tab.
         */
        get: function () {
            return this.node.children[1].textContent;
        },
        /**
         * Set the text for the tab.
         */
        set: function (text) {
            this.node.children[1].textContent = text;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Tab.prototype, "selected", {
        /**
         * Get whether the tab is selected.
         */
        get: function () {
            return this.hasClass(exports.SELECTED_CLASS);
        },
        /**
         * Set whether the tab is selected.
         */
        set: function (selected) {
            this.toggleClass(exports.SELECTED_CLASS, selected);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Tab.prototype, "closable", {
        /**
         * Get whether the tab is closable.
         */
        get: function () {
            return this.hasClass(exports.CLOSABLE_CLASS);
        },
        /**
         * Set whether the tab is closable.
         */
        set: function (closable) {
            this.toggleClass(exports.CLOSABLE_CLASS, closable);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Tab.prototype, "closeIconNode", {
        /**
         * Get the DOM node for the tab close icon.
         */
        get: function () {
            return this.node.lastChild;
        },
        enumerable: true,
        configurable: true
    });
    return Tab;
})(phosphor_nodewrapper_1.NodeWrapper);
exports.Tab = Tab;

},{"phosphor-nodewrapper":22}],33:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var arrays = require('phosphor-arrays');
var phosphor_domutil_1 = require('phosphor-domutil');
var phosphor_properties_1 = require('phosphor-properties');
var phosphor_signaling_1 = require('phosphor-signaling');
var phosphor_widget_1 = require('phosphor-widget');
/**
 * `p-TabBar`: the class name added to TabBar instances.
 */
exports.TAB_BAR_CLASS = 'p-TabBar';
/**
 * `p-TabBar-header`: the class name added to the tab bar header div.
 */
exports.HEADER_CLASS = 'p-TabBar-header';
/**
 * `p-TabBar-content`: the class name added to the tab bar content div.
 */
exports.CONTENT_CLASS = 'p-TabBar-content';
/**
 * `p-TabBar-footer`: the class name added to the tab bar footer div.
 */
exports.FOOTER_CLASS = 'p-TabBar-footer';
/**
 * `p-mod-dragging`: a class name added to the tab bar when dragging.
 */
exports.DRAGGING_CLASS = 'p-mod-dragging';
/**
 * `p-mod-active`: a class name added to the active drag tab.
 */
exports.ACTIVE_CLASS = 'p-mod-active';
/**
 * `p-mod-first`: a class name added to the first tab in the tab bar.
 */
exports.FIRST_CLASS = 'p-mod-first';
/**
 * `p-mod-last`: a class name adde to the last tab in the tab bar.
 */
exports.LAST_CLASS = 'p-mod-last';
/**
 * The start drag distance threshold.
 */
var DRAG_THRESHOLD = 5;
/**
 * The detach distance threshold.
 */
var DETACH_THRESHOLD = 20;
/**
 * The tab transition duration. Keep in sync with CSS.
 */
var TRANSITION_DURATION = 150;
/**
 * A widget which displays a row of tabs.
 *
 * #### Notes
 * A `TabBar` widget does not support child widgets. Adding children
 * to a `TabBar` will result in undefined behavior.
 */
var TabBar = (function (_super) {
    __extends(TabBar, _super);
    /**
     * Construct a new tab bar.
     */
    function TabBar() {
        _super.call(this);
        this._tabs = [];
        this._previousTab = null;
        this._dragData = null;
        this.addClass(exports.TAB_BAR_CLASS);
    }
    /**
     * Create the DOM node for a tab bar.
     */
    TabBar.createNode = function () {
        var node = document.createElement('div');
        var header = document.createElement('div');
        var content = document.createElement('div');
        var footer = document.createElement('div');
        header.className = exports.HEADER_CLASS;
        content.className = exports.CONTENT_CLASS;
        footer.className = exports.FOOTER_CLASS;
        node.appendChild(header);
        node.appendChild(content);
        node.appendChild(footer);
        return node;
    };
    /**
     * Dispose of the resources held by the widget.
     */
    TabBar.prototype.dispose = function () {
        this._releaseMouse();
        this._previousTab = null;
        this._tabs.length = 0;
        _super.prototype.dispose.call(this);
    };
    Object.defineProperty(TabBar.prototype, "tabMoved", {
        /**
         * A signal emitted when a tab is moved.
         *
         * #### Notes
         * This is a pure delegate to the [[tabMovedSignal]].
         */
        get: function () {
            return TabBar.tabMovedSignal.bind(this);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TabBar.prototype, "tabSelected", {
        /**
         * A signal emitted when a tab is selected.
         *
         * #### Notes
         * This is a pure delegate to the [[tabSelectedSignal]].
         */
        get: function () {
            return TabBar.tabSelectedSignal.bind(this);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TabBar.prototype, "tabCloseRequested", {
        /**
         * A signal emitted when the user clicks a tab close icon.
         *
         * #### Notes
         * This is a pure delegate to the [[tabCloseRequestedSignal]].
         */
        get: function () {
            return TabBar.tabCloseRequestedSignal.bind(this);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TabBar.prototype, "tabDetachRequested", {
        /**
         * A signal emitted when a tab is dragged beyond the detach threshold.
         *
         * #### Notes
         * This is a pure delegate to the [[tabDetachRequestedSignal]].
         */
        get: function () {
            return TabBar.tabDetachRequestedSignal.bind(this);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TabBar.prototype, "previousTab", {
        /**
         * Get the previously selected tab.
         *
         * #### Notes
         * This is a read-only property.
         *
         * This will be `null` if there is no valid previous tab.
         */
        get: function () {
            return this._previousTab;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TabBar.prototype, "selectedTab", {
        /**
         * Get the selected tab.
         *
         * #### Notes
         * This is a pure delegate to the [[selectedTabProperty]].
         */
        get: function () {
            return TabBar.selectedTabProperty.get(this);
        },
        /**
         * Set the selected tab.
         *
         * #### Notes
         * This is a pure delegate to the [[selectedTabProperty]].
         */
        set: function (value) {
            TabBar.selectedTabProperty.set(this, value);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TabBar.prototype, "tabsMovable", {
        /**
         * Get whether the tabs are movable by the user.
         *
         * #### Notes
         * This is a pure delegate to the [[tabsMovableProperty]].
         */
        get: function () {
            return TabBar.tabsMovableProperty.get(this);
        },
        /**
         * Set whether the tabs are movable by the user.
         *
         * #### Notes
         * This is a pure delegate to the [[tabsMovableProperty]].
         */
        set: function (value) {
            TabBar.tabsMovableProperty.set(this, value);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TabBar.prototype, "tabs", {
        /**
         * Get a shallow copy of the array of tabs.
         *
         * #### Notes
         * When only iterating over the tabs, it can be faster to use
         * the tab query methods, which do not perform a copy.
         *
         * **See also:** [[tabCount]], [[tabAt]]
         */
        get: function () {
            return this._tabs.slice();
        },
        /**
         * Set the tabs for the tab bar.
         *
         * #### Notes
         * This will clear the current tabs and add the specified tabs.
         * Depending on the desired outcome, it can be more efficient to
         * use one of the tab manipulation methods.
         *
         * **See also:** [[addTab]], [[insertTab]], [[removeTab]]
         */
        set: function (tabs) {
            var _this = this;
            this.clearTabs();
            tabs.forEach(function (tab) { return _this.addTab(tab); });
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TabBar.prototype, "tabCount", {
        /**
         * Get the number of tabs in the tab bar.
         *
         * #### Notes
         * This is a read-only property.
         *
         * **See also:** [[tabs]], [[tabAt]]
         */
        get: function () {
            return this._tabs.length;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Get the tab at a specific index.
     *
     * @param index - The index of the tab of interest.
     *
     * @returns The tab at the specified index, or `undefined` if the
     *   index is out of range.
     *
     * **See also:** [[tabCount]], [[tabIndex]]
     */
    TabBar.prototype.tabAt = function (index) {
        return this._tabs[index | 0];
    };
    /**
     * Get the index of a specific tab.
     *
     * @param tab - The tab of interest.
     *
     * @returns The index of the specified tab, or `-1` if the tab is
     *   not contained within the tab bar.
     *
     * **See also:** [[tabCount]], [[tabAt]]
     */
    TabBar.prototype.tabIndex = function (tab) {
        return this._tabs.indexOf(tab);
    };
    /**
     * Add a tab to the end of the tab bar.
     *
     * @param tab - The tab to add to the tab bar.
     *
     * @returns The new index of the tab.
     *
     * #### Notes
     * If the tab is already contained within the tab bar, it will first
     * be removed.
     *
     * The tab *must not* be contained by any other tab bar.
     *
     * **See also:** [[insertTab]], [[moveTab]]
     */
    TabBar.prototype.addTab = function (tab) {
        return this.insertTab(this._tabs.length, tab);
    };
    /**
     * Insert a tab into the tab bar at the given index.
     *
     * @param index - The index at which to insert the tab. This will be
     *   clamped to the bounds of the tabs.
     *
     * @param tab - The tab to add to the tab bar.
     *
     * @returns The new index of the tab.
     *
     * #### Notes
     * If the tab is already contained within the tab bar, it will first
     * be removed.
     *
     * The tab *must not* be contained by any other tab bar.
     *
     * **See also:** [[addTab]], [[moveTab]]
     */
    TabBar.prototype.insertTab = function (index, tab) {
        this.removeTab(tab);
        return this._insertTab(index, tab);
    };
    /**
     * Move a tab from one index to another.
     *
     * @param fromIndex - The index of the tab to move.
     *
     * @param toIndex - The target index of the tab.
     *
     * @returns `true` if the move was successful, or `false` if either
     *   index is out of range.
     *
     * #### Notes
     * This can be more efficient than re-inserting an existing tab.
     *
     * **See also:** [[addTab]], [[insertTab]]
     */
    TabBar.prototype.moveTab = function (fromIndex, toIndex) {
        this._releaseMouse();
        return this._moveTab(fromIndex, toIndex);
    };
    /**
     * Remove the tab at a specific index.
     *
     * @param index - The index of the tab of interest.
     *
     * @returns The removed tab, or `undefined` if the index is out
     *   of range.
     *
     * **See also:** [[removeTab]], [[clearTabs]]
     */
    TabBar.prototype.removeTabAt = function (index) {
        this._releaseMouse();
        return this._removeTab(index);
    };
    /**
     * Remove a specific tab from the tab bar.
     *
     * @param tab - The tab of interest.
     *
     * @returns The index occupied by the tab, or `-1` if the tab is
     *   not contained by the tab bar.
     *
     * **See also:** [[removeTabAt]], [[clearTabs]]
     */
    TabBar.prototype.removeTab = function (tab) {
        this._releaseMouse();
        var i = this._tabs.indexOf(tab);
        if (i !== -1)
            this._removeTab(i);
        return i;
    };
    /**
     * Remove all tabs from the tab bar.
     *
     * **See also:** [[removeTab]], [[removeTabAt]]
     */
    TabBar.prototype.clearTabs = function () {
        while (this._tabs.length > 0) {
            this.removeTabAt(this._tabs.length - 1);
        }
    };
    /**
     * Add a tab to the tab bar at the given client X position.
     *
     * @param tab - The tab to attach to the tab bar.
     *
     * @param clientX - The current client X mouse position.
     *
     * @returns `true` if the tab was attached, `false` otherwise.
     *
     * #### Notes
     * This method is intended for use by code which supports tear-off
     * tab interfaces. It will insert the tab at the specified location
     * and grab the mouse to continue the tab drag. It assumes that the
     * left mouse button is currently pressed.
     *
     * This is a no-op if the tab is already contained by the tab bar,
     * if the tabs are not movable, or if a tab drag is in progress.
     */
    TabBar.prototype.attachTab = function (tab, clientX) {
        // Bail if there is a drag in progress or the tabs aren't movable.
        if (this._dragData || !this.tabsMovable) {
            return false;
        }
        // Bail if the tab is already part of the tab bar.
        if (this._tabs.indexOf(tab) !== -1) {
            return false;
        }
        // Insert and select the new tab.
        var index = this._tabs.length;
        this._insertTab(index, tab);
        this.selectedTab = tab;
        // Setup the drag data object.
        var content = this.node.firstChild.nextSibling;
        var tabRect = tab.node.getBoundingClientRect();
        var data = this._dragData = new DragData();
        data.tab = tab;
        data.tabIndex = index;
        data.tabLeft = tab.node.offsetLeft;
        data.tabWidth = tabRect.width;
        data.pressX = tabRect.left + Math.floor(0.4 * tabRect.width);
        data.pressY = tabRect.top + (tabRect.height >> 1);
        data.tabPressX = Math.floor(0.4 * tabRect.width);
        data.tabLayout = snapTabLayout(this._tabs);
        data.contentRect = content.getBoundingClientRect();
        data.cursorGrab = phosphor_domutil_1.overrideCursor('default');
        data.dragActive = true;
        // Add the extra mouse event listeners.
        document.addEventListener('mouseup', this, true);
        document.addEventListener('mousemove', this, true);
        // Add the dragging style classes.
        tab.addClass(exports.ACTIVE_CLASS);
        this.addClass(exports.DRAGGING_CLASS);
        // Update the drag tab position.
        this._updateDragPosition(clientX);
        return true;
    };
    /**
     * Handle the DOM events for the tab bar.
     *
     * @param event - The DOM event sent to the tab bar.
     *
     * #### Notes
     * This method implements the DOM `EventListener` interface and is
     * called in response to events on the tab bar's DOM node. It should
     * not be called directly by user code.
     */
    TabBar.prototype.handleEvent = function (event) {
        switch (event.type) {
            case 'click':
                this._evtClick(event);
                break;
            case 'mousedown':
                this._evtMouseDown(event);
                break;
            case 'mousemove':
                this._evtMouseMove(event);
                break;
            case 'mouseup':
                this._evtMouseUp(event);
                break;
        }
    };
    /**
     * A message handler invoked on an `'after-attach'` message.
     */
    TabBar.prototype.onAfterAttach = function (msg) {
        this.node.addEventListener('mousedown', this);
        this.node.addEventListener('click', this);
    };
    /**
     * A message handler invoked on a `'before-dettach'` message.
     */
    TabBar.prototype.onBeforeDetach = function (msg) {
        this.node.removeEventListener('mousedown', this);
        this.node.removeEventListener('click', this);
    };
    /**
     * Handle the `'click'` event for the tab bar.
     */
    TabBar.prototype._evtClick = function (event) {
        // Do nothing if it's not a left click.
        if (event.button !== 0) {
            return;
        }
        // Do nothing if the click is not on a tab.
        var index = hitTestTabs(this._tabs, event.clientX, event.clientY);
        if (index < 0) {
            return;
        }
        // Clicking on a tab stops the event propagation.
        event.preventDefault();
        event.stopPropagation();
        // If the click was on a node contained by the close icon node
        // of a closable tab, emit the `tabCloseRequested` signal.
        var tab = this._tabs[index];
        var target = event.target;
        if (tab.closable && tab.closeIconNode.contains(target)) {
            this.tabCloseRequested.emit({ index: index, tab: tab });
        }
    };
    /**
     * Handle the `'mousedown'` event for the tab bar.
     */
    TabBar.prototype._evtMouseDown = function (event) {
        // Do nothing if it's not a left mouse press.
        if (event.button !== 0) {
            return;
        }
        // Bail if a previous drag is still transitioning.
        if (this._dragData) {
            return;
        }
        // Do nothing of the press is not on a tab.
        var index = hitTestTabs(this._tabs, event.clientX, event.clientY);
        if (index < 0) {
            return;
        }
        // Pressing on a tab stops the event propagation.
        event.preventDefault();
        event.stopPropagation();
        // Do nothing further if the press was on the tab close icon.
        var tab = this._tabs[index];
        if (tab.closeIconNode.contains(event.target)) {
            return;
        }
        // Setup the drag if the tabs are movable.
        if (this.tabsMovable) {
            var tabRect = tab.node.getBoundingClientRect();
            var data = this._dragData = new DragData();
            data.tab = tab;
            data.tabIndex = index;
            data.tabLeft = tab.node.offsetLeft;
            data.tabWidth = tabRect.width;
            data.pressX = event.clientX;
            data.pressY = event.clientY;
            data.tabPressX = event.clientX - tabRect.left;
            document.addEventListener('mouseup', this, true);
            document.addEventListener('mousemove', this, true);
        }
        // Update the selected tab to the pressed tab.
        this.selectedTab = tab;
    };
    /**
     * Handle the `'mousemove'` event for the tab bar.
     */
    TabBar.prototype._evtMouseMove = function (event) {
        // Mouse move events are never propagated since this handler
        // is only installed when during a left mouse drag operation.
        event.preventDefault();
        event.stopPropagation();
        // Bail if there is no drag in progress.
        if (!this._dragData) {
            return;
        }
        // Check to see if the drag threshold has been exceeded, and
        // start the tab drag operation the first time that occurrs.
        var data = this._dragData;
        if (!data.dragActive) {
            var dx = Math.abs(event.clientX - data.pressX);
            var dy = Math.abs(event.clientY - data.pressY);
            if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) {
                return;
            }
            // Fill in the remaining drag data.
            var content = this.node.firstChild.nextSibling;
            data.tabLayout = snapTabLayout(this._tabs);
            data.contentRect = content.getBoundingClientRect();
            data.cursorGrab = phosphor_domutil_1.overrideCursor('default');
            data.dragActive = true;
            // Add the dragging style classes.
            data.tab.addClass(exports.ACTIVE_CLASS);
            this.addClass(exports.DRAGGING_CLASS);
        }
        // Check to see if the detach threshold has been exceeded, and
        // emit the detach request signal the first time that occurrs.
        // If the drag data gets set to null, the mouse was released.
        if (!data.detachRequested && shouldDetach(data.contentRect, event)) {
            data.detachRequested = true;
            this.tabDetachRequested.emit({
                tab: data.tab,
                index: data.tabIndex,
                clientX: event.clientX,
                clientY: event.clientY,
            });
            if (!this._dragData) {
                return;
            }
        }
        // Update the drag tab position.
        this._updateDragPosition(event.clientX);
    };
    /**
     * Handle the `'mouseup'` event for the tab bar.
     */
    TabBar.prototype._evtMouseUp = function (event) {
        var _this = this;
        // Do nothing if the left mouse button is not released.
        if (event.button !== 0) {
            return;
        }
        // Mouse move events are never propagated since this handler
        // is only installed when during a left mouse drag operation.
        event.preventDefault();
        event.stopPropagation();
        // Bail if there is no drag in progress.
        if (!this._dragData) {
            return;
        }
        // Remove the extra mouse handlers.
        document.removeEventListener('mouseup', this, true);
        document.removeEventListener('mousemove', this, true);
        // Store a local reference to the drag data.
        var data = this._dragData;
        // If the drag is not active, clear the reference and bail.
        if (!data.dragActive) {
            this._dragData = null;
            return;
        }
        // Compute the approximate final relative tab offset.
        var idealLeft;
        if (data.tabTargetIndex === data.tabIndex) {
            idealLeft = 0;
        }
        else if (data.tabTargetIndex > data.tabIndex) {
            var tl = data.tabLayout[data.tabTargetIndex];
            idealLeft = tl.left + tl.width - data.tabWidth - data.tabLeft;
        }
        else {
            var tl = data.tabLayout[data.tabTargetIndex];
            idealLeft = tl.left - data.tabLeft;
        }
        // Position the tab to its final position, subject to limits.
        var maxLeft = data.contentRect.width - (data.tabLeft + data.tabWidth);
        var adjustedLeft = Math.max(-data.tabLeft, Math.min(idealLeft, maxLeft));
        data.tab.node.style.left = adjustedLeft + 'px';
        // Remove the active class from the tab so it can be transitioned.
        data.tab.removeClass(exports.ACTIVE_CLASS);
        // Complete the release on a timer to allow the tab to transition.
        setTimeout(function () {
            // Bail if the drag data has been changed or released.
            if (_this._dragData !== data) {
                return;
            }
            // Clear the drag data reference.
            _this._dragData = null;
            // Clear the relative tab positions.
            for (var i = 0, n = _this._tabs.length; i < n; ++i) {
                _this._tabs[i].node.style.left = '';
            }
            // Clear the cursor grab and drag styles.
            data.cursorGrab.dispose();
            data.tab.removeClass(exports.ACTIVE_CLASS);
            _this.removeClass(exports.DRAGGING_CLASS);
            // Finally, move the drag tab to its final index location.
            if (data.tabTargetIndex !== -1) {
                _this._moveTab(data.tabIndex, data.tabTargetIndex);
            }
        }, TRANSITION_DURATION);
    };
    /**
     * Update the drag tab position for the given mouse X position.
     *
     * This method is a no-op if an active drag is not in progress.
     */
    TabBar.prototype._updateDragPosition = function (clientX) {
        // Bail if there is not an active drag.
        var data = this._dragData;
        if (!data || !data.dragActive) {
            return;
        }
        // Compute the target bounds of the drag tab.
        var offsetLeft = clientX - data.contentRect.left;
        var targetLeft = offsetLeft - data.tabPressX;
        var targetRight = targetLeft + data.tabWidth;
        // Reset the target tab index.
        data.tabTargetIndex = data.tabIndex;
        // Update the non-drag tab positions and the tab target index.
        for (var i = 0, n = this._tabs.length; i < n; ++i) {
            var style = this._tabs[i].node.style;
            var layout = data.tabLayout[i];
            var threshold = layout.left + (layout.width >> 1);
            if (i < data.tabIndex && targetLeft < threshold) {
                style.left = data.tabWidth + data.tabLayout[i + 1].margin + 'px';
                data.tabTargetIndex = Math.min(data.tabTargetIndex, i);
            }
            else if (i > data.tabIndex && targetRight > threshold) {
                style.left = -data.tabWidth - layout.margin + 'px';
                data.tabTargetIndex = i;
            }
            else if (i !== data.tabIndex) {
                style.left = '';
            }
        }
        // Update the drag tab position
        var idealLeft = clientX - data.pressX;
        var maxLeft = data.contentRect.width - (data.tabLeft + data.tabWidth);
        var adjustedLeft = Math.max(-data.tabLeft, Math.min(idealLeft, maxLeft));
        data.tab.node.style.left = adjustedLeft + 'px';
    };
    /**
     * Release the mouse grab and restore the tab positions.
     */
    TabBar.prototype._releaseMouse = function () {
        // Bail early if there is no drag in progress.
        if (!this._dragData) {
            return;
        }
        // Remove the extra mouse listeners.
        document.removeEventListener('mouseup', this, true);
        document.removeEventListener('mousemove', this, true);
        // Clear the drag data reference.
        var data = this._dragData;
        this._dragData = null;
        // If the drag is not active, there's nothing left to do.
        if (!data.dragActive) {
            return;
        }
        // Reset the positions of the tabs.
        for (var i = 0, n = this._tabs.length; i < n; ++i) {
            this._tabs[i].node.style.left = '';
        }
        // Clear the cursor grab and drag styles.
        data.cursorGrab.dispose();
        data.tab.removeClass(exports.ACTIVE_CLASS);
        this.removeClass(exports.DRAGGING_CLASS);
    };
    /**
     * Insert a new tab into the tab bar at the given index.
     *
     * The tab should not already be contained in the tab bar.
     *
     * The mouse should be released before calling this method.
     */
    TabBar.prototype._insertTab = function (index, tab) {
        tab.selected = false;
        var i = arrays.insert(this._tabs, index, tab);
        var content = this.node.firstChild.nextSibling;
        content.appendChild(tab.node);
        if (!this.selectedTab) {
            this.selectedTab = tab;
        }
        else {
            this._updateTabOrdering();
        }
        return i;
    };
    /**
     * Move a tab to a new index in the tab bar.
     *
     * The mouse should be released before calling this method.
     */
    TabBar.prototype._moveTab = function (fromIndex, toIndex) {
        var i = fromIndex | 0;
        var j = toIndex | 0;
        if (!arrays.move(this._tabs, i, j)) {
            return false;
        }
        if (i === j) {
            return true;
        }
        this._updateTabOrdering();
        this.tabMoved.emit({ fromIndex: i, toIndex: j });
        return true;
    };
    /**
     * Remove and return the tab at the given index.
     *
     * The mouse should be released before calling this method.
     */
    TabBar.prototype._removeTab = function (index) {
        // Bail if the index is invalid.
        var i = index | 0;
        var tab = arrays.removeAt(this._tabs, i);
        if (!tab) {
            return void 0;
        }
        // Remove the tab from the DOM and reset its style.
        var content = this.node.firstChild.nextSibling;
        content.removeChild(tab.node);
        tab.selected = false;
        tab.node.style.left = '';
        tab.node.style.zIndex = '';
        tab.removeClass(exports.ACTIVE_CLASS);
        tab.removeClass(exports.FIRST_CLASS);
        tab.removeClass(exports.LAST_CLASS);
        // Update the selected tab. If the removed tab was the selected tab,
        // select the next best tab by starting with the previous tab, then
        // the next sibling, and finally the previous sibling. Otherwise,
        // update the state and tab ordering as appropriate.
        if (tab === this.selectedTab) {
            var next = this._previousTab || this._tabs[i] || this._tabs[i - 1];
            this.selectedTab = next;
            this._previousTab = null;
        }
        else if (tab === this._previousTab) {
            this._previousTab = null;
            this._updateTabOrdering();
        }
        else {
            this._updateTabOrdering();
        }
        return tab;
    };
    /**
     * Update the Z-index and flex order of the tabs.
     */
    TabBar.prototype._updateTabOrdering = function () {
        if (this._tabs.length === 0) {
            return;
        }
        var selectedTab = this.selectedTab;
        for (var i = 0, n = this._tabs.length, k = n - 1; i < n; ++i) {
            var tab = this._tabs[i];
            var style = tab.node.style;
            tab.removeClass(exports.FIRST_CLASS);
            tab.removeClass(exports.LAST_CLASS);
            style.order = i + '';
            if (tab === selectedTab) {
                style.zIndex = n + '';
            }
            else {
                style.zIndex = k-- + '';
            }
        }
        this._tabs[0].addClass(exports.FIRST_CLASS);
        this._tabs[n - 1].addClass(exports.LAST_CLASS);
    };
    /**
     * The change handler for the [[selectedTabProperty]].
     */
    TabBar.prototype._onSelectedTabChanged = function (old, tab) {
        if (old)
            old.selected = false;
        if (tab)
            tab.selected = true;
        this._previousTab = old;
        this._updateTabOrdering();
        this.tabSelected.emit({ index: this.tabIndex(tab), tab: tab });
    };
    /**
     * A signal emitted when a tab is moved.
     *
     * **See also:** [[tabMoved]]
     */
    TabBar.tabMovedSignal = new phosphor_signaling_1.Signal();
    /**
     * A signal emitted when a tab is selected.
     *
     * **See also:** [[tabSelected]]
     */
    TabBar.tabSelectedSignal = new phosphor_signaling_1.Signal();
    /**
     * A signal emitted when the user clicks a tab close icon.
     *
     * **See also:** [[tabCloseRequested]
     */
    TabBar.tabCloseRequestedSignal = new phosphor_signaling_1.Signal();
    /**
     * A signal emitted when a tab is dragged beyond the detach threshold.
     *
     * **See also:** [[tabDetachRequested]]
     */
    TabBar.tabDetachRequestedSignal = new phosphor_signaling_1.Signal();
    /**
     * The property descriptor for the selected tab.
     *
     * This controls which tab is selected in the tab bar.
     *
     * **See also:** [[selectedTab]]
     */
    TabBar.selectedTabProperty = new phosphor_properties_1.Property({
        value: null,
        coerce: function (owner, val) { return (val && owner.tabIndex(val) !== -1) ? val : null; },
        changed: function (owner, old, val) { return owner._onSelectedTabChanged(old, val); },
    });
    /**
     * The property descriptor for the tabs movable property
     *
     * THis controls whether tabs are movable by the user.
     *
     * **See also:** [[tabsMovable]]
     */
    TabBar.tabsMovableProperty = new phosphor_properties_1.Property({
        value: true,
    });
    return TabBar;
})(phosphor_widget_1.Widget);
exports.TabBar = TabBar;
/**
 * A struct which holds the drag data for a tab bar.
 */
var DragData = (function () {
    function DragData() {
        /**
         * The tab being dragged.
         */
        this.tab = null;
        /**
         * The offset left of the tab being dragged.
         */
        this.tabLeft = -1;
        /**
         * The offset width of the tab being dragged.
         */
        this.tabWidth = -1;
        /**
         * The index of the tab being dragged.
         */
        this.tabIndex = -1;
        /**
         * The orgian mouse X position in tab coordinates.
         */
        this.tabPressX = -1;
        /**
         * The tab target index upon mouse release.
         */
        this.tabTargetIndex = -1;
        /**
         * The array of tab layout objects snapped at drag start.
         */
        this.tabLayout = null;
        /**
         * The mouse press client X position.
         */
        this.pressX = -1;
        /**
         * The mouse press client Y position.
         */
        this.pressY = -1;
        /**
         * The bounding client rect of the tab bar content node.
         */
        this.contentRect = null;
        /**
         * The disposable to clean up the cursor override.
         */
        this.cursorGrab = null;
        /**
         * Whether the drag is currently active.
         */
        this.dragActive = false;
        /**
         * Whether the detach request signal has been emitted.
         */
        this.detachRequested = false;
    }
    return DragData;
})();
/**
 * Test if a mouse position lies outside the detach bound of a rect.
 */
function shouldDetach(rect, event) {
    return ((event.clientX < rect.left - DETACH_THRESHOLD) ||
        (event.clientX >= rect.right + DETACH_THRESHOLD) ||
        (event.clientY < rect.top - DETACH_THRESHOLD) ||
        (event.clientY >= rect.bottom + DETACH_THRESHOLD));
}
/**
 * Get the index of the tab which intersect the client point, or -1.
 */
function hitTestTabs(tabs, clientX, clientY) {
    for (var i = 0, n = tabs.length; i < n; ++i) {
        if (phosphor_domutil_1.hitTest(tabs[i].node, clientX, clientY)) {
            return i;
        }
    }
    return -1;
}
/**
 * Snap an array of the current tab layout values.
 */
function snapTabLayout(tabs) {
    var layout = new Array(tabs.length);
    for (var i = 0, n = tabs.length; i < n; ++i) {
        var node = tabs[i].node;
        var left = node.offsetLeft;
        var width = node.offsetWidth;
        var cstyle = window.getComputedStyle(tabs[i].node);
        var margin = parseInt(cstyle.marginLeft, 10) || 0;
        layout[i] = { margin: margin, left: left, width: width };
    }
    return layout;
}

},{"phosphor-arrays":12,"phosphor-domutil":20,"phosphor-properties":23,"phosphor-signaling":25,"phosphor-widget":36}],34:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var phosphor_boxpanel_1 = require('phosphor-boxpanel');
var phosphor_properties_1 = require('phosphor-properties');
var phosphor_signaling_1 = require('phosphor-signaling');
var phosphor_stackedpanel_1 = require('phosphor-stackedpanel');
var tabbar_1 = require('./tabbar');
/**
 * `p-TabPanel`: the class name added to TabPanel instances.
 */
exports.TAB_PANEL_CLASS = 'p-TabPanel';
/**
 * A panel which provides a tabbed layout for child widgets.
 *
 * The `TabPanel` provides a convenient combination of a `TabBar` and
 * a `StackedPanel` which allows the user to toggle between widgets by
 * selecting the tab associated with a widget.
 *
 * #### Notes
 * Widgets should be added to a `TabPanel` using the `<prefix>Widget`
 * methods, **not** the `<prefix>Child` methods. The children of a
 * `TabPanel` should **not** be manipulated directly by user code.
 */
var TabPanel = (function (_super) {
    __extends(TabPanel, _super);
    /**
     * Construct a new tab panel.
     */
    function TabPanel() {
        _super.call(this);
        this.addClass(exports.TAB_PANEL_CLASS);
        var tabs = new tabbar_1.TabBar();
        tabs.tabMoved.connect(this._onTabMoved, this);
        tabs.tabSelected.connect(this._onTabSelected, this);
        tabs.tabCloseRequested.connect(this._onTabCloseRequested, this);
        var stack = new phosphor_stackedpanel_1.StackedPanel();
        stack.currentChanged.connect(this._onCurrentChanged, this);
        stack.widgetRemoved.connect(this._onWidgetRemoved, this);
        phosphor_boxpanel_1.BoxPanel.setStretch(tabs, 0);
        phosphor_boxpanel_1.BoxPanel.setStretch(stack, 1);
        this.direction = phosphor_boxpanel_1.BoxPanel.TopToBottom;
        this.spacing = 0;
        this._tabs = tabs;
        this._stack = stack;
        this.addChild(tabs);
        this.addChild(stack);
    }
    /**
     * Get the tab for the given widget.
     *
     * @param widget - The widget of interest.
     *
     * @returns The tab for the given widget.
     *
     * #### Notes
     * This is a pure delegate for the [[tabProperty]].
     */
    TabPanel.getTab = function (widget) {
        return TabPanel.tabProperty.get(widget);
    };
    /**
     * Set the tab for the given widget.
     *
     * @param widget - The widget of interest.
     *
     * @param tab - The tab to use for the widget.
     *
     * #### Notes
     * This is a pure delegate for the [[tabProperty]].
     */
    TabPanel.setTab = function (widget, tab) {
        TabPanel.tabProperty.set(widget, tab);
    };
    /**
     * Dispose of the resources held by the widget.
     */
    TabPanel.prototype.dispose = function () {
        this._tabs = null;
        this._stack = null;
        _super.prototype.dispose.call(this);
    };
    Object.defineProperty(TabPanel.prototype, "currentChanged", {
        /**
         * A signal emitted when the current widget is changed.
         *
         * #### Notes
         * This is a pure delegate to the [[currentChangedSignal]].
         */
        get: function () {
            return TabPanel.currentChangedSignal.bind(this);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TabPanel.prototype, "currentWidget", {
        /**
         * Get the currently selected widget.
         */
        get: function () {
            return this._stack.currentWidget;
        },
        /**
         * Set the currently selected widget.
         */
        set: function (widget) {
            var i = this._stack.childIndex(widget);
            this._tabs.selectedTab = this._tabs.tabAt(i);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TabPanel.prototype, "tabsMovable", {
        /**
         * Get whether the tabs are movable by the user.
         */
        get: function () {
            return this._tabs.tabsMovable;
        },
        /**
         * Set whether the tabs are movable by the user.
         */
        set: function (movable) {
            this._tabs.tabsMovable = movable;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TabPanel.prototype, "widgets", {
        /**
         * Get a shallow copy of the array of widgets.
         *
         * #### Notes
         * When only iterating over the widgets, it can be faster to use
         * the widget query methods, which do not perform a copy.
         *
         * **See also:** [[widgetCount]], [[widgetAt]]
         */
        get: function () {
            return this._stack.children;
        },
        /**
         * Set the widgets for the tab panel.
         *
         * #### Notes
         * This will clear the current widgets and add the specified widgets.
         * Depending on the desired outcome, it can be more efficient to use
         * one of the widget manipulation methods.
         *
         * **See also:** [[addWidget]], [[insertWidget]], [[removeWidget]]
         */
        set: function (widgets) {
            var _this = this;
            this.clearWidgets();
            widgets.forEach(function (widget) { return _this.addWidget(widget); });
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TabPanel.prototype, "widgetCount", {
        /**
         * Get the number of widgets in the tab panel.
         *
         * #### Notes
         * This is a read-only property.
         *
         * **See also:** [[widgets]], [[widgetAt]]
         */
        get: function () {
            return this._stack.childCount;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Get the widget at a specific index.
     *
     * @param index - The index of the widget of interest.
     *
     * @returns The widget widget at the specified index, or `undefined`
     *   if the index is out of range.
     *
     * **See also:** [[widgetCount]], [[widgetIndex]]
     */
    TabPanel.prototype.widgetAt = function (index) {
        return this._stack.childAt(index);
    };
    /**
     * Get the index of a specific widget.
     *
     * @param widget - The widget of interest.
     *
     * @returns The index of the specified widget, or `-1` if the widget
     *   is not contained in the tab panel.
     *
     * **See also:** [[widgetCount]], [[widgetAt]]
     */
    TabPanel.prototype.widgetIndex = function (widget) {
        return this._stack.childIndex(widget);
    };
    /**
     * Add a widget to the end of the panel.
     *
     * @param widget - The widget to add to the panel.
     *
     * @returns The new index of the widget.
     *
     * #### Notes
     * If the widget already exists in the panel, it will first be
     * removed.
     *
     * The `TabPanel.tab` attached property *must* be set with the
     * tab to use for the widget, or an error will be thrown. This
     * can be set via `TabPanel.setTab`.
     *
     * The `TabPanel.tab` attached property is assumed to remain
     * constant while the widget is contained by the tab panel.
     *
     * **See also:** [[insertWidget]], [[moveWidget]]
     */
    TabPanel.prototype.addWidget = function (widget) {
        return this.insertWidget(this.widgetCount, widget);
    };
    /**
     * Insert a widget into the panel at the given index.
     *
     * @param index - The target index for the widget. This will be
     *   clamped to the bounds of the widgets.
     *
     * @param widget - The widget to insert into the panel.
     *
     * @returns The new index of the widget.
     *
     * #### Notes
     * If the widget already exists in the panel, it will first be
     * removed.
     *
     * The `TabPanel.tab` attached property *must* be set with the
     * tab to use for the widget, or an error will be thrown. This
     * can be set via `TabPanel.setTab`.
     *
     * The `TabPanel.tab` attached property is assumed to remain
     * constant while the widget is contained by the tab panel.
     *
     * **See also:** [[addWidget]], [[moveWidget]]
     */
    TabPanel.prototype.insertWidget = function (index, widget) {
        var tab = TabPanel.getTab(widget);
        if (!tab)
            throw new Error('`TabPanel.tab` property not set');
        var i = this._stack.insertChild(index, widget);
        return this._tabs.insertTab(i, tab);
    };
    /**
     * Move a widget from one index to another.
     *
     * @param fromIndex - The index of the widget of interest.
     *
     * @param toIndex - The target index for the widget.
     *
     * @returns 'true' if the widget was moved, or `false` if either
     *   of the given indices are out of range.
     *
     * #### Notes
     * This can be more efficient than re-inserting an existing widget.
     *
     * **See also:** [[addWidget]], [[insertWidget]]
     */
    TabPanel.prototype.moveWidget = function (fromIndex, toIndex) {
        return this._tabs.moveTab(fromIndex, toIndex);
    };
    /**
     * Remove the widget at a specific index.
     *
     * @param index - The index of the widget of interest.
     *
     * @returns The removed widget, or `undefined` if the index
     *   is out of range.
     *
     * **See also:** [[removeWidget]], [[clearWidgets]]
     */
    TabPanel.prototype.removeWidgetAt = function (index) {
        return this._stack.removeChildAt(index);
    };
    /**
     * Remove a specific widget from the panel.
     *
     * @param child - The widget of interest.
     *
     * @returns The index which the widget occupied, or `-1` if the
     *   widget is not contained in the tab panel.
     *
     * **See also:** [[removeWidgetAt]], [[clearWidgets]]
     */
    TabPanel.prototype.removeWidget = function (widget) {
        return this._stack.removeChild(widget);
    };
    /**
     * Remove all widgets from the tab panel.
     *
     * **See also:** [[removeWidget]], [[removeWidgetAt]]
     */
    TabPanel.prototype.clearWidgets = function () {
        this._stack.clearChildren();
    };
    /**
     * Handle the `tabMoved` signal from the tab bar.
     */
    TabPanel.prototype._onTabMoved = function (sender, args) {
        this._stack.moveChild(args.fromIndex, args.toIndex);
    };
    /**
     * Handle the `tabSelected` signal from the tab bar.
     */
    TabPanel.prototype._onTabSelected = function (sender, args) {
        this._stack.currentWidget = this._stack.childAt(args.index);
    };
    /**
     * Handle the `tabCloseRequested` signal from the tab bar.
     */
    TabPanel.prototype._onTabCloseRequested = function (sender, args) {
        this._stack.childAt(args.index).close();
    };
    /**
     * Handle the `currentChanged` signal from the stacked panel.
     */
    TabPanel.prototype._onCurrentChanged = function (sender, args) {
        this.currentChanged.emit(args);
    };
    /**
     * Handle the `widgetRemoved` signal from the stacked panel.
     */
    TabPanel.prototype._onWidgetRemoved = function (sender, args) {
        this._tabs.removeTabAt(args.index);
    };
    /**
     * A signal emitted when the current widget is changed.
     *
     * **See also:** [[currentChanged]]
     */
    TabPanel.currentChangedSignal = new phosphor_signaling_1.Signal();
    /**
     * The property descriptor for the tab attached property.
     *
     * This controls the tab used for a widget in a tab panel.
     *
     * #### Notes
     * If the tab for a widget is changed, the new tab will not be
     * reflected until the widget is re-inserted into the tab panel.
     * However, in-place changes to the tab's properties **will** be
     * reflected.
     *
     * **See also:** [[getTab]], [[setTab]]
     */
    TabPanel.tabProperty = new phosphor_properties_1.Property({
        value: null,
        coerce: function (owner, value) { return value || null; },
    });
    return TabPanel;
})(phosphor_boxpanel_1.BoxPanel);
exports.TabPanel = TabPanel;

},{"./tabbar":33,"phosphor-boxpanel":15,"phosphor-properties":23,"phosphor-signaling":25,"phosphor-stackedpanel":29}],35:[function(require,module,exports){
var css = "/*-----------------------------------------------------------------------------\n| Copyright (c) 2014-2015, PhosphorJS Contributors\n|\n| Distributed under the terms of the BSD 3-Clause License.\n|\n| The full license is in the file LICENSE, distributed with this software.\n|----------------------------------------------------------------------------*/\n.p-Widget {\n  box-sizing: border-box;\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n  overflow: hidden;\n  cursor: default;\n}\n.p-Widget.p-mod-hidden {\n  display: none;\n}\n"; (require("browserify-css").createStyle(css, { "href": "node_modules/phosphor-widget/lib/index.css"})); module.exports = css;
},{"browserify-css":1}],36:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var arrays = require('phosphor-arrays');
var phosphor_domutil_1 = require('phosphor-domutil');
var phosphor_messaging_1 = require('phosphor-messaging');
var phosphor_nodewrapper_1 = require('phosphor-nodewrapper');
var phosphor_properties_1 = require('phosphor-properties');
var phosphor_signaling_1 = require('phosphor-signaling');
require('./index.css');
/**
 * `p-Widget`: the class name added to Widget instances.
 */
exports.WIDGET_CLASS = 'p-Widget';
/**
 * `p-mod-hidden`: the class name added to hidden widgets.
 */
exports.HIDDEN_CLASS = 'p-mod-hidden';
/**
 * A singleton `'update-request'` message.
 *
 * #### Notes
 * This message can be dispatched to supporting widgets in order to
 * update their content. Not all widgets will respond to messages of
 * this type.
 *
 * This message is typically used to update the position and size of
 * a widget's children, or to update a widget's content to reflect the
 * current state of the widget.
 *
 * Messages of this type are compressed by default.
 *
 * **See also:** [[update]], [[onUpdateRequest]]
 */
exports.MSG_UPDATE_REQUEST = new phosphor_messaging_1.Message('update-request');
/**
 * A singleton `'layout-request'` message.
 *
 * #### Notes
 * This message can be dispatched to supporting widgets in order to
 * update their layout. Not all widgets will respond to messages of
 * this type.
 *
 * This message is typically used to update the size contraints of
 * a widget and to update the position and size of its children.
 *
 * Messages of this type are compressed by default.
 *
 * **See also:** [[onLayoutRequest]]
 */
exports.MSG_LAYOUT_REQUEST = new phosphor_messaging_1.Message('layout-request');
/**
 * A singleton `'close-request'` message.
 *
 * #### Notes
 * This message should be dispatched to a widget when it should close
 * and remove itself from the widget hierarchy.
 *
 * Messages of this type are compressed by default.
 *
 * **See also:** [[close]], [[onCloseRequest]]
 */
exports.MSG_CLOSE_REQUEST = new phosphor_messaging_1.Message('close-request');
/**
 * A singleton `'after-show'` message.
 *
 * #### Notes
 * This message is sent to a widget when it becomes visible.
 *
 * This message is **not** sent when the widget is attached.
 *
 * **See also:** [[isVisible]], [[onAfterShow]]
 */
exports.MSG_AFTER_SHOW = new phosphor_messaging_1.Message('after-show');
/**
 * A singleton `'before-hide'` message.
 *
 * #### Notes
 * This message is sent to a widget when it becomes not-visible.
 *
 * This message is **not** sent when the widget is detached.
 *
 * **See also:** [[isVisible]], [[onBeforeHide]]
 */
exports.MSG_BEFORE_HIDE = new phosphor_messaging_1.Message('before-hide');
/**
 * A singleton `'after-attach'` message.
 *
 * #### Notes
 * This message is sent to a widget after it is attached to the DOM.
 *
 * **See also:** [[isAttached]], [[onAfterAttach]]
 */
exports.MSG_AFTER_ATTACH = new phosphor_messaging_1.Message('after-attach');
/**
 * A singleton `'before-detach'` message.
 *
 * #### Notes
 * This message is sent to a widget before it is detached from the DOM.
 *
 * **See also:** [[isAttached]], [[onBeforeDetach]]
 */
exports.MSG_BEFORE_DETACH = new phosphor_messaging_1.Message('before-detach');
/**
 * The base class of the Phosphor widget hierarchy.
 *
 * #### Notes
 * This class will typically be subclassed in order to create a useful
 * widget. However, it can be used by itself to host foreign content
 * such as a React or Bootstrap component. Simply instantiate an empty
 * widget and add the content directly to its [[node]]. The widget and
 * its content can then be embedded within a Phosphor widget hierarchy.
 */
var Widget = (function (_super) {
    __extends(Widget, _super);
    /**
     * Construct a new widget.
     *
     * #### Notes
     * The [[WIDGET_CLASS]] is added to the widget during construction.
     */
    function Widget() {
        _super.call(this);
        this._flags = 0;
        this._parent = null;
        this._children = [];
        this._box = null;
        this._rect = null;
        this._limits = null;
        this.addClass(exports.WIDGET_CLASS);
    }
    /**
     * Dispose of the widget and its descendant widgets.
     *
     * #### Notes
     * It is generally unsafe to use the widget after it has been
     * disposed.
     *
     * If this method is called more than once, all calls made after
     * the first will be a no-op.
     */
    Widget.prototype.dispose = function () {
        if (this.isDisposed) {
            return;
        }
        this._flags |= WidgetFlag.IsDisposed;
        this.disposed.emit(void 0);
        if (this._parent) {
            this._parent.removeChild(this);
        }
        else if (this.isAttached) {
            detachWidget(this);
        }
        while (this._children.length > 0) {
            var child = this._children.pop();
            child._parent = null;
            child.dispose();
        }
        phosphor_signaling_1.clearSignalData(this);
        phosphor_messaging_1.clearMessageData(this);
        phosphor_properties_1.clearPropertyData(this);
    };
    Object.defineProperty(Widget.prototype, "disposed", {
        /**
         * A signal emitted when the widget is disposed.
         *
         * #### Notes
         * This is a pure delegate to the [[disposedSignal]].
         */
        get: function () {
            return Widget.disposedSignal.bind(this);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Widget.prototype, "isAttached", {
        /**
         * Test whether the widget's node is attached to the DOM.
         *
         * #### Notes
         * This is a read-only property which is always safe to access.
         *
         * **See also:** [[attachWidget]], [[detachWidget]]
         */
        get: function () {
            return (this._flags & WidgetFlag.IsAttached) !== 0;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Widget.prototype, "isDisposed", {
        /**
         * Test whether the widget has been disposed.
         *
         * #### Notes
         * This is a read-only property which is always safe to access.
         *
         * **See also:** [[disposed]]
         */
        get: function () {
            return (this._flags & WidgetFlag.IsDisposed) !== 0;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Widget.prototype, "isVisible", {
        /**
         * Test whether the widget is visible.
         *
         * #### Notes
         * A widget is visible when it is attached to the DOM, is not
         * explicitly hidden, and has no explicitly hidden ancestors.
         *
         * This is a read-only property which is always safe to access.
         *
         * **See also:** [[hidden]]
         */
        get: function () {
            return (this._flags & WidgetFlag.IsVisible) !== 0;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Widget.prototype, "hidden", {
        /**
         * Get whether the widget is explicitly hidden.
         *
         * #### Notes
         * This is a pure delegate to the [[hiddenProperty]].
         *
         * **See also:** [[isVisible]]
         */
        get: function () {
            return Widget.hiddenProperty.get(this);
        },
        /**
         * Set whether the widget is explicitly hidden.
         *
         * #### Notes
         * This is a pure delegate to the [[hiddenProperty]].
         *
         * **See also:** [[isVisible]]
         */
        set: function (value) {
            Widget.hiddenProperty.set(this, value);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Widget.prototype, "boxSizing", {
        /**
         * Get the box sizing for the widget's DOM node.
         *
         * #### Notes
         * This value is computed once and then cached in order to avoid
         * excessive style recomputations. The cache can be cleared via
         * [[clearBoxSizing]].
         *
         * Layout widgets rely on this property when computing their layout.
         * If a layout widget's box sizing changes at runtime, the box sizing
         * cache should be cleared and the layout widget should be posted a
         *`'layout-request'` message.
         *
         * This is a read-only property.
         *
         * **See also:** [[clearBoxSizing]]
         */
        get: function () {
            if (this._box)
                return this._box;
            return this._box = Object.freeze(phosphor_domutil_1.boxSizing(this.node));
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Widget.prototype, "sizeLimits", {
        /**
         * Get the size limits for the widget's DOM node.
         *
         * #### Notes
         * This value is computed once and then cached in order to avoid
         * excessive style recomputations. The cache can be cleared by
         * calling [[clearSizeLimits]].
         *
         * Layout widgets rely on this property of their child widgets when
         * computing the layout. If a child widget's size limits change at
         * runtime, the size limits should be cleared and the layout widget
         * should be posted a `'layout-request'` message.
         *
         * This is a read-only property.
         *
         * **See also:** [[setSizeLimits]], [[clearSizeLimits]]
         */
        get: function () {
            if (this._limits)
                return this._limits;
            return this._limits = Object.freeze(phosphor_domutil_1.sizeLimits(this.node));
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Widget.prototype, "offsetRect", {
        /**
         * Get the current offset geometry rect for the widget.
         *
         * #### Notes
         * If the widget geometry has been set using [[setOffsetGeometry]],
         * those values will be used to populate the rect, and no data will
         * be read from the DOM. Otherwise, the offset geometry of the node
         * **will** be read from the DOM, which may cause a reflow.
         *
         * This is a read-only property.
         *
         * **See also:** [[setOffsetGeometry]], [[clearOffsetGeometry]]
         */
        get: function () {
            if (this._rect)
                return cloneOffsetRect(this._rect);
            return getOffsetRect(this.node);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Widget.prototype, "parent", {
        /**
         * Get the parent of the widget.
         *
         * #### Notes
         * This will be `null` if the widget does not have a parent.
         */
        get: function () {
            return this._parent;
        },
        /**
         * Set the parent of the widget.
         *
         * @throws Will throw an error if the widget is the parent.
         *
         * #### Notes
         * If the specified parent is the current parent, this is a no-op.
         *
         * If the specified parent is `null`, this is equivalent to the
         * expression `widget.parent.removeChild(widget)`, otherwise it
         * is equivalent to the expression `parent.addChild(widget)`.
         *
         * **See also:** [[addChild]], [[insertChild]], [[removeChild]]
         */
        set: function (parent) {
            if (parent && parent !== this._parent) {
                parent.addChild(this);
            }
            else if (!parent && this._parent) {
                this._parent.removeChild(this);
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Widget.prototype, "children", {
        /**
         * Get a shallow copy of the array of child widgets.
         *
         * #### Notes
         * When only iterating over the children, it can be faster to use
         * the child query methods, which do not perform a copy.
         *
         * **See also:** [[childCount]], [[childAt]]
         */
        get: function () {
            return this._children.slice();
        },
        /**
         * Set the children of the widget.
         *
         * #### Notes
         * This will clear the current child widgets and add the specified
         * child widgets. Depending on the desired outcome, it can be more
         * efficient to use one of the child manipulation methods.
         *
         * **See also:** [[addChild]], [[insertChild]], [[removeChild]]
         */
        set: function (children) {
            var _this = this;
            this.clearChildren();
            children.forEach(function (child) { return _this.addChild(child); });
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Widget.prototype, "childCount", {
        /**
         * Get the number of children of the widget.
         *
         * #### Notes
         * This is a read-only property.
         *
         * **See also:** [[children]], [[childAt]]
         */
        get: function () {
            return this._children.length;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Get the child widget at a specific index.
     *
     * @param index - The index of the child of interest.
     *
     * @returns The child widget at the specified index, or `undefined`
     *  if the index is out of range.
     *
     * **See also:** [[childCount]], [[childIndex]]
     */
    Widget.prototype.childAt = function (index) {
        return this._children[index | 0];
    };
    /**
     * Get the index of a specific child widget.
     *
     * @param child - The child widget of interest.
     *
     * @returns The index of the specified child widget, or `-1` if
     *   the widget is not a child of this widget.
     *
     * **See also:** [[childCount]], [[childAt]]
     */
    Widget.prototype.childIndex = function (child) {
        return this._children.indexOf(child);
    };
    /**
     * Add a child widget to the end of the widget's children.
     *
     * @param child - The child widget to add to this widget.
     *
     * @returns The new index of the child.
     *
     * @throws Will throw an error if a widget is added to itself.
     *
     * #### Notes
     * The child will be automatically removed from its current parent
     * before being added to this widget.
     *
     * **See also:** [[insertChild]], [[moveChild]]
     */
    Widget.prototype.addChild = function (child) {
        return this.insertChild(this._children.length, child);
    };
    /**
     * Insert a child widget at a specific index.
     *
     * @param index - The target index for the widget. This will be
     *   clamped to the bounds of the children.
     *
     * @param child - The child widget to insert into the widget.
     *
     * @returns The new index of the child.
     *
     * @throws Will throw an error if a widget is inserted into itself.
     *
     * #### Notes
     * The child will be automatically removed from its current parent
     * before being added to this widget.
     *
     * **See also:** [[addChild]], [[moveChild]]
     */
    Widget.prototype.insertChild = function (index, child) {
        if (child === this) {
            throw new Error('invalid child widget');
        }
        if (child._parent) {
            child._parent.removeChild(child);
        }
        else if (child.isAttached) {
            detachWidget(child);
        }
        child._parent = this;
        var i = arrays.insert(this._children, index, child);
        phosphor_messaging_1.sendMessage(this, new ChildMessage('child-added', child, -1, i));
        return i;
    };
    /**
     * Move a child widget from one index to another.
     *
     * @param fromIndex - The index of the child of interest.
     *
     * @param toIndex - The target index for the child.
     *
     * @returns 'true' if the child was moved, or `false` if either
     *   of the given indices are out of range.
     *
     * #### Notes
     * This method can be more efficient than re-inserting an existing
     * child, as some widgets may be able to optimize child moves and
     * avoid making unnecessary changes to the DOM.
     *
     * **See also:** [[addChild]], [[insertChild]]
     */
    Widget.prototype.moveChild = function (fromIndex, toIndex) {
        var i = fromIndex | 0;
        var j = toIndex | 0;
        if (!arrays.move(this._children, i, j)) {
            return false;
        }
        if (i !== j) {
            var child = this._children[j];
            phosphor_messaging_1.sendMessage(this, new ChildMessage('child-moved', child, i, j));
        }
        return true;
    };
    /**
     * Remove the child widget at a specific index.
     *
     * @param index - The index of the child of interest.
     *
     * @returns The removed child widget, or `undefined` if the index
     *   is out of range.
     *
     * **See also:** [[removeChild]], [[clearChildren]]
     */
    Widget.prototype.removeChildAt = function (index) {
        var i = index | 0;
        var child = arrays.removeAt(this._children, i);
        if (child) {
            child._parent = null;
            phosphor_messaging_1.sendMessage(this, new ChildMessage('child-removed', child, i, -1));
        }
        return child;
    };
    /**
     * Remove a specific child widget from this widget.
     *
     * @param child - The child widget of interest.
     *
     * @returns The index which the child occupied, or `-1` if the
     *   child is not a child of this widget.
     *
     * **See also:** [[removeChildAt]], [[clearChildren]]
     */
    Widget.prototype.removeChild = function (child) {
        var i = this.childIndex(child);
        if (i !== -1)
            this.removeChildAt(i);
        return i;
    };
    /**
     * Remove all child widgets from the widget.
     *
     * #### Notes
     * This will continue to remove children until the `childCount`
     * reaches zero. It is therefore possible to enter an infinite
     * loop if a message handler causes a child widget to be added
     * in response to one being removed.
     *
     * **See also:** [[removeChild]], [[removeChildAt]]
     */
    Widget.prototype.clearChildren = function () {
        while (this.childCount > 0) {
            this.removeChildAt(this.childCount - 1);
        }
    };
    /**
     * Dispatch an `'update-request'` message to the widget.
     *
     * @param immediate - Whether to dispatch the message immediately
     *   (`true`) or in the future (`false`). The default is `false`.
     *
     * **See also:** [[MSG_UPDATE_REQUEST]], [[onUpdateRequest]]
     */
    Widget.prototype.update = function (immediate) {
        if (immediate === void 0) { immediate = false; }
        if (immediate) {
            phosphor_messaging_1.sendMessage(this, exports.MSG_UPDATE_REQUEST);
        }
        else {
            phosphor_messaging_1.postMessage(this, exports.MSG_UPDATE_REQUEST);
        }
    };
    /**
     * Dispatch a `'close-request'` message to the widget.
     *
     * @param immediate - Whether to dispatch the message immediately
     *   (`true`) or in the future (`false`). The default is `false`.
     *
     * **See also:** [[MSG_CLOSE_REQUEST]], [[onCloseRequest]]
     */
    Widget.prototype.close = function (immediate) {
        if (immediate === void 0) { immediate = false; }
        if (immediate) {
            phosphor_messaging_1.sendMessage(this, exports.MSG_CLOSE_REQUEST);
        }
        else {
            phosphor_messaging_1.postMessage(this, exports.MSG_CLOSE_REQUEST);
        }
    };
    /**
     * Clear the cached box sizing for the widget.
     *
     * #### Notes
     * This method does **not** read from the DOM.
     *
     * This method does **not** write to the DOM.
     *
     * **See also:** [[boxSizing]]
     */
    Widget.prototype.clearBoxSizing = function () {
        this._box = null;
    };
    /**
     * Set the size limits for the widget's DOM node.
     *
     * @param minWidth - The min width for the widget, in pixels.
     *
     * @param minHeight - The min height for the widget, in pixels.
     *
     * @param maxWidth - The max width for the widget, in pixels.
     *
     * @param maxHeight - The max height for the widget, in pixels.
     *
     * #### Notes
     * This method does **not** read from the DOM.
     *
     * **See also:** [[sizeLimits]], [[clearSizeLimits]]
     */
    Widget.prototype.setSizeLimits = function (minWidth, minHeight, maxWidth, maxHeight) {
        var minW = Math.max(0, minWidth);
        var minH = Math.max(0, minHeight);
        var maxW = Math.max(0, maxWidth);
        var maxH = Math.max(0, maxHeight);
        this._limits = Object.freeze({
            minWidth: minW,
            minHeight: minH,
            maxWidth: maxW,
            maxHeight: maxH,
        });
        var style = this.node.style;
        style.minWidth = minW + 'px';
        style.minHeight = minH + 'px';
        style.maxWidth = (maxW === Infinity) ? '' : maxW + 'px';
        style.maxHeight = (maxH === Infinity) ? '' : maxH + 'px';
    };
    /**
     * Clear the cached size limits for the widget.
     *
     * #### Notes
     * This method does **not** read from the DOM.
     *
     * **See also:** [[sizeLimits]], [[setSizeLimits]]
     */
    Widget.prototype.clearSizeLimits = function () {
        this._limits = null;
        var style = this.node.style;
        style.minWidth = '';
        style.maxWidth = '';
        style.minHeight = '';
        style.maxHeight = '';
    };
    /**
     * Set the offset geometry for the widget.
     *
     * @param left - The offset left edge of the widget, in pixels.
     *
     * @param top - The offset top edge of the widget, in pixels.
     *
     * @param width - The offset width of the widget, in pixels.
     *
     * @param height - The offset height of the widget, in pixels.
     *
     * #### Notes
     * This method is only useful when using absolute positioning to set
     * the layout geometry of the widget. It will update the inline style
     * of the widget with the specified values. If the width or height is
     * different from the previous value, a [[ResizeMessage]] will be sent
     * to the widget.
     *
     * This method does **not** take into account the size limits of the
     * widget. It is assumed that the specified width and height do not
     * violate the size constraints of the widget.
     *
     * This method does **not** read any data from the DOM.
     *
     * Code which uses this method to layout a widget is responsible for
     * calling [[clearOffsetGeometry]] when it is finished managing the
     * widget.
     *
     * **See also:** [[offsetRect]], [[clearOffsetGeometry]]
     */
    Widget.prototype.setOffsetGeometry = function (left, top, width, height) {
        var rect = this._rect || (this._rect = makeOffsetRect());
        var style = this.node.style;
        var resized = false;
        if (top !== rect.top) {
            rect.top = top;
            style.top = top + 'px';
        }
        if (left !== rect.left) {
            rect.left = left;
            style.left = left + 'px';
        }
        if (width !== rect.width) {
            resized = true;
            rect.width = width;
            style.width = width + 'px';
        }
        if (height !== rect.height) {
            resized = true;
            rect.height = height;
            style.height = height + 'px';
        }
        if (resized)
            phosphor_messaging_1.sendMessage(this, new ResizeMessage(width, height));
    };
    /**
     * Clear the offset geometry for the widget.
     *
     * #### Notes
     * This method is only useful when using absolute positioning to set
     * the layout geometry of the widget. It will reset the inline style
     * of the widget and clear the stored offset geometry values.
     *
     * This method will **not** dispatch a [[ResizeMessage]].
     *
     * This method does **not** read any data from the DOM.
     *
     * This method should be called by the widget's layout manager when
     * it no longer manages the widget. It allows the widget to be added
     * to another layout panel without conflict.
     *
     * **See also:** [[offsetRect]], [[setOffsetGeometry]]
     */
    Widget.prototype.clearOffsetGeometry = function () {
        if (!this._rect) {
            return;
        }
        this._rect = null;
        var style = this.node.style;
        style.top = '';
        style.left = '';
        style.width = '';
        style.height = '';
    };
    /**
     * Process a message sent to the widget.
     *
     * @param msg - The message sent to the widget.
     *
     * #### Notes
     * Subclasses may reimplement this method as needed.
     */
    Widget.prototype.processMessage = function (msg) {
        switch (msg.type) {
            case 'resize':
                this.onResize(msg);
                break;
            case 'update-request':
                this.onUpdateRequest(msg);
                break;
            case 'layout-request':
                this.onLayoutRequest(msg);
                break;
            case 'child-added':
                this.onChildAdded(msg);
                break;
            case 'child-removed':
                this.onChildRemoved(msg);
                break;
            case 'child-moved':
                this.onChildMoved(msg);
                break;
            case 'after-show':
                this._flags |= WidgetFlag.IsVisible;
                this.onAfterShow(msg);
                sendToShown(this._children, msg);
                break;
            case 'before-hide':
                this.onBeforeHide(msg);
                sendToShown(this._children, msg);
                this._flags &= ~WidgetFlag.IsVisible;
                break;
            case 'after-attach':
                var visible = !this.hidden && (!this._parent || this._parent.isVisible);
                if (visible)
                    this._flags |= WidgetFlag.IsVisible;
                this._flags |= WidgetFlag.IsAttached;
                this.onAfterAttach(msg);
                sendToAll(this._children, msg);
                break;
            case 'before-detach':
                this.onBeforeDetach(msg);
                sendToAll(this._children, msg);
                this._flags &= ~WidgetFlag.IsVisible;
                this._flags &= ~WidgetFlag.IsAttached;
                break;
            case 'child-shown':
                this.onChildShown(msg);
                break;
            case 'child-hidden':
                this.onChildHidden(msg);
                break;
            case 'close-request':
                this.onCloseRequest(msg);
                break;
        }
    };
    /**
     * Compress a message posted to the widget.
     *
     * @param msg - The message posted to the widget.
     *
     * @param pending - The queue of pending messages for the widget.
     *
     * @returns `true` if the message was compressed and should be
     *   dropped, or `false` if the message should be enqueued for
     *   delivery as normal.
     *
     * #### Notes
     * The default implementation compresses the following messages:
     * `'update-request'`, `'layout-request'`, and `'close-request'`.
     *
     * Subclasses may reimplement this method as needed.
     */
    Widget.prototype.compressMessage = function (msg, pending) {
        switch (msg.type) {
            case 'update-request':
            case 'layout-request':
            case 'close-request':
                return pending.some(function (other) { return other.type === msg.type; });
        }
        return false;
    };
    /**
     * A message handler invoked on a `'child-added'` message.
     *
     * #### Notes
     * The default implementation adds the child node to the widget
     * node at the proper location and dispatches an `'after-attach'`
     * message if appropriate.
     *
     * Subclasses may reimplement this method to control how the child
     * node is added, but they must dispatch an `'after-attach'` message
     * if appropriate.
     */
    Widget.prototype.onChildAdded = function (msg) {
        var next = this.childAt(msg.currentIndex + 1);
        this.node.insertBefore(msg.child.node, next && next.node);
        if (this.isAttached)
            phosphor_messaging_1.sendMessage(msg.child, exports.MSG_AFTER_ATTACH);
    };
    /**
     * A message handler invoked on a `'child-removed'` message.
     *
     * #### Notes
     * The default implementation removes the child node from the widget
     * node and dispatches a `'before-detach'` message if appropriate.
     *
     * Subclasses may reimplement this method to control how the child
     * node is removed, but they must  dispatch a `'before-detach'`
     * message if appropriate.
     */
    Widget.prototype.onChildRemoved = function (msg) {
        if (this.isAttached)
            phosphor_messaging_1.sendMessage(msg.child, exports.MSG_BEFORE_DETACH);
        this.node.removeChild(msg.child.node);
    };
    /**
     * A message handler invoked on a `'child-moved'` message.
     *
     * #### Notes
     * The default implementation moves the child node to the proper
     * location in the widget node and dispatches a `'before-detach'`
     * and `'after-attach'` message if appropriate.
     *
     * Subclasses may reimplement this method to control how the child
     * node is moved, but they must dispatch a `'before-detach'` and
     * `'after-attach'` message if appropriate.
     */
    Widget.prototype.onChildMoved = function (msg) {
        if (this.isAttached)
            phosphor_messaging_1.sendMessage(msg.child, exports.MSG_BEFORE_DETACH);
        var next = this.childAt(msg.currentIndex + 1);
        this.node.insertBefore(msg.child.node, next && next.node);
        if (this.isAttached)
            phosphor_messaging_1.sendMessage(msg.child, exports.MSG_AFTER_ATTACH);
    };
    /**
     * A message handler invoked on a `'resize'` message.
     *
     * #### Notes
     * The default implementation of this handler sends an [[UnknownSize]]
     * resize message to each child. This ensures that the resize messages
     * propagate through all widgets in the hierarchy.
     *
     * Subclasses may reimplement this method as needed, but they must
     * dispatch `'resize'` messages to their children as appropriate.
     */
    Widget.prototype.onResize = function (msg) {
        sendToAll(this._children, ResizeMessage.UnknownSize);
    };
    /**
     * A message handler invoked on an `'update-request'` message.
     *
     * #### Notes
     * The default implementation of this handler sends an [[UnknownSize]]
     * resize message to each child. This ensures that the resize messages
     * propagate through all widgets in the hierarchy.
     *
     * Subclass may reimplement this method as needed, but they should
     * dispatch `'resize'` messages to their children as appropriate.
     *
     * **See also:** [[update]], [[MSG_UPDATE_REQUEST]]
     */
    Widget.prototype.onUpdateRequest = function (msg) {
        sendToAll(this._children, ResizeMessage.UnknownSize);
    };
    /**
     * A message handler invoked on a `'close-request'` message.
     *
     * #### Notes
     * The default implementation of this handler will unparent or detach
     * the widget as appropriate. Subclasses may reimplement this handler
     * for custom close behavior.
     *
     * **See also:** [[close]], [[MSG_CLOSE_REQUEST]]
     */
    Widget.prototype.onCloseRequest = function (msg) {
        if (this._parent) {
            this._parent.removeChild(this);
        }
        else if (this.isAttached) {
            detachWidget(this);
        }
    };
    /**
     * A message handler invoked on a `'layout-request'` message.
     *
     * The default implementation of this handler is a no-op.
     *
     * **See also:** [[MSG_LAYOUT_REQUEST]]
     */
    Widget.prototype.onLayoutRequest = function (msg) { };
    /**
     * A message handler invoked on an `'after-show'` message.
     *
     * The default implementation of this handler is a no-op.
     *
     * **See also:** [[MSG_AFTER_SHOW]]
     */
    Widget.prototype.onAfterShow = function (msg) { };
    /**
     * A message handler invoked on a `'before-hide'` message.
     *
     * The default implementation of this handler is a no-op.
     *
     * **See also:** [[MSG_BEFORE_HIDE]]
     */
    Widget.prototype.onBeforeHide = function (msg) { };
    /**
     * A message handler invoked on an `'after-attach'` message.
     *
     * **See also:** [[MSG_AFTER_ATTACH]]
     */
    Widget.prototype.onAfterAttach = function (msg) { };
    /**
     * A message handler invoked on a `'before-detach'` message.
     *
     * **See also:** [[MSG_BEFORE_DETACH]]
     */
    Widget.prototype.onBeforeDetach = function (msg) { };
    /**
     * A message handler invoked on a `'child-shown'` message.
     *
     * The default implementation of this handler is a no-op.
     */
    Widget.prototype.onChildShown = function (msg) { };
    /**
     * A message handler invoked on a `'child-hidden'` message.
     *
     * The default implementation of this handler is a no-op.
     */
    Widget.prototype.onChildHidden = function (msg) { };
    /**
     * A signal emitted when the widget is disposed.
     *
     * **See also:** [[disposed]], [[isDisposed]]
     */
    Widget.disposedSignal = new phosphor_signaling_1.Signal();
    /**
     * A property descriptor which controls the hidden state of a widget.
     *
     * #### Notes
     * This property controls whether a widget is explicitly hidden.
     *
     * Hiding a widget will cause the widget and all of its descendants
     * to become not-visible.
     *
     * This property will toggle the presence of [[HIDDEN_CLASS]] on a
     * widget according to the property value. It will also dispatch
     * `'after-show'` and `'before-hide'` messages as appropriate.
     *
     * The default property value is `false`.
     *
     * **See also:** [[hidden]], [[isVisible]]
     */
    Widget.hiddenProperty = new phosphor_properties_1.Property({
        value: false,
        changed: onHiddenChanged,
    });
    return Widget;
})(phosphor_nodewrapper_1.NodeWrapper);
exports.Widget = Widget;
/**
 * Attach a widget to a host DOM node.
 *
 * @param widget - The widget to attach to the DOM.
 *
 * @param host - The node to use as the widget's host.
 *
 * @throws Will throw an error if the widget is not a root widget,
 *   if the widget is already attached to the DOM, or if the host
 *   is not attached to the DOM.
 *
 * #### Notes
 * This function ensures that an `'after-attach'` message is dispatched
 * to the hierarchy. It should be used in lieu of manual DOM attachment.
 */
function attachWidget(widget, host) {
    if (widget.parent) {
        throw new Error('only a root widget can be attached to the DOM');
    }
    if (widget.isAttached || document.body.contains(widget.node)) {
        throw new Error('widget is already attached to the DOM');
    }
    if (!document.body.contains(host)) {
        throw new Error('host is not attached to the DOM');
    }
    host.appendChild(widget.node);
    phosphor_messaging_1.sendMessage(widget, exports.MSG_AFTER_ATTACH);
}
exports.attachWidget = attachWidget;
/**
 * Detach a widget from its host DOM node.
 *
 * @param widget - The widget to detach from the DOM.
 *
 * @throws Will throw an error if the widget is not a root widget,
 *   or if the widget is not attached to the DOM.
 *
 * #### Notes
 * This function ensures that a `'before-detach'` message is dispatched
 * to the hierarchy. It should be used in lieu of manual DOM detachment.
 */
function detachWidget(widget) {
    if (widget.parent) {
        throw new Error('only a root widget can be detached from the DOM');
    }
    if (!widget.isAttached || !document.body.contains(widget.node)) {
        throw new Error('widget is not attached to the DOM');
    }
    phosphor_messaging_1.sendMessage(widget, exports.MSG_BEFORE_DETACH);
    widget.node.parentNode.removeChild(widget.node);
}
exports.detachWidget = detachWidget;
/**
 * A message class for child-related messages.
 */
var ChildMessage = (function (_super) {
    __extends(ChildMessage, _super);
    /**
     * Construct a new child message.
     *
     * @param type - The message type.
     *
     * @param child - The child widget for the message.
     *
     * @param previousIndex - The previous index of the child, if known.
     *   The default index is `-1` and indicates an unknown index.
     *
     * @param currentIndex - The current index of the child, if known.
     *   The default index is `-1` and indicates an unknown index.
     */
    function ChildMessage(type, child, previousIndex, currentIndex) {
        if (previousIndex === void 0) { previousIndex = -1; }
        if (currentIndex === void 0) { currentIndex = -1; }
        _super.call(this, type);
        this._child = child;
        this._currentIndex = currentIndex;
        this._previousIndex = previousIndex;
    }
    Object.defineProperty(ChildMessage.prototype, "child", {
        /**
         * The child widget for the message.
         *
         * #### Notes
         * This is a read-only property.
         */
        get: function () {
            return this._child;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ChildMessage.prototype, "currentIndex", {
        /**
         * The current index of the child.
         *
         * #### Notes
         * This will be `-1` if the current index is unknown.
         *
         * This is a read-only property.
         */
        get: function () {
            return this._currentIndex;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ChildMessage.prototype, "previousIndex", {
        /**
         * The previous index of the child.
         *
         * #### Notes
         * This will be `-1` if the previous index is unknown.
         *
         * This is a read-only property.
         */
        get: function () {
            return this._previousIndex;
        },
        enumerable: true,
        configurable: true
    });
    return ChildMessage;
})(phosphor_messaging_1.Message);
exports.ChildMessage = ChildMessage;
/**
 * A message class for 'resize' messages.
 */
var ResizeMessage = (function (_super) {
    __extends(ResizeMessage, _super);
    /**
     * Construct a new resize message.
     *
     * @param width - The **offset width** of the widget, or `-1` if
     *   the width is not known.
     *
     * @param height - The **offset height** of the widget, or `-1` if
     *   the height is not known.
     */
    function ResizeMessage(width, height) {
        _super.call(this, 'resize');
        this._width = width;
        this._height = height;
    }
    Object.defineProperty(ResizeMessage.prototype, "width", {
        /**
         * The offset width of the widget.
         *
         * #### Notes
         * This will be `-1` if the width is unknown.
         *
         * This is a read-only property.
         */
        get: function () {
            return this._width;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ResizeMessage.prototype, "height", {
        /**
         * The offset height of the widget.
         *
         * #### Notes
         * This will be `-1` if the height is unknown.
         *
         * This is a read-only property.
         */
        get: function () {
            return this._height;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * A singleton 'resize' message with an unknown size.
     */
    ResizeMessage.UnknownSize = new ResizeMessage(-1, -1);
    return ResizeMessage;
})(phosphor_messaging_1.Message);
exports.ResizeMessage = ResizeMessage;
/**
 * An enum of widget bit flags.
 */
var WidgetFlag;
(function (WidgetFlag) {
    /**
     * The widget is attached to the DOM.
     */
    WidgetFlag[WidgetFlag["IsAttached"] = 1] = "IsAttached";
    /**
     * The widget is visible.
     */
    WidgetFlag[WidgetFlag["IsVisible"] = 2] = "IsVisible";
    /**
     * The widget has been disposed.
     */
    WidgetFlag[WidgetFlag["IsDisposed"] = 4] = "IsDisposed";
})(WidgetFlag || (WidgetFlag = {}));
/**
 * Create a new offset rect full of NaN's.
 */
function makeOffsetRect() {
    return { top: NaN, left: NaN, width: NaN, height: NaN };
}
/**
 * Clone an offset rect object.
 */
function cloneOffsetRect(rect) {
    return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
    };
}
/**
 * Get the offset rect for a DOM node.
 */
function getOffsetRect(node) {
    return {
        top: node.offsetTop,
        left: node.offsetLeft,
        width: node.offsetWidth,
        height: node.offsetHeight,
    };
}
/**
 * The change handler for the [[hiddenProperty]].
 */
function onHiddenChanged(owner, old, hidden) {
    if (hidden) {
        if (owner.isAttached && (!owner.parent || owner.parent.isVisible)) {
            phosphor_messaging_1.sendMessage(owner, exports.MSG_BEFORE_HIDE);
        }
        owner.addClass(exports.HIDDEN_CLASS);
        if (owner.parent) {
            phosphor_messaging_1.sendMessage(owner.parent, new ChildMessage('child-hidden', owner));
        }
    }
    else {
        owner.removeClass(exports.HIDDEN_CLASS);
        if (owner.isAttached && (!owner.parent || owner.parent.isVisible)) {
            phosphor_messaging_1.sendMessage(owner, exports.MSG_AFTER_SHOW);
        }
        if (owner.parent) {
            phosphor_messaging_1.sendMessage(owner.parent, new ChildMessage('child-shown', owner));
        }
    }
}
/**
 * Send a message to all widgets in an array.
 */
function sendToAll(array, msg) {
    for (var i = 0; i < array.length; ++i) {
        phosphor_messaging_1.sendMessage(array[i], msg);
    }
}
/**
 * Send a message to all non-hidden widgets in an array.
 */
function sendToShown(array, msg) {
    for (var i = 0; i < array.length; ++i) {
        if (!array[i].hidden)
            phosphor_messaging_1.sendMessage(array[i], msg);
    }
}

},{"./index.css":35,"phosphor-arrays":12,"phosphor-domutil":20,"phosphor-messaging":21,"phosphor-nodewrapper":22,"phosphor-properties":23,"phosphor-signaling":25}],37:[function(require,module,exports){
module.exports = require('./lib/index.js');

},{"./lib/index.js":38}],38:[function(require,module,exports){
(function (Buffer,__dirname){
/**
 * term.js - an xterm emulator
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 * https://github.com/chjj/term.js
 */

function term(options) {
  return new term.Terminal(options);
}

term.middleware = function(options) {
  var url = require('url');

  options = options || {};
  options.path = options.path || '/term.js';

  return function(req, res, next) {
    if (url.parse(req.url).pathname !== options.path) {
      return next();
    }

    if (+new Date(req.headers['if-modified-since']) === term.last) {
      res.statusCode = 304;
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Content-Length': Buffer.byteLength(term.script),
      'Last-Modified': term.last
    });

    res.end(term.script);
  };
};

term.path = __dirname + '/../src/term.js';

term.__defineGetter__('script', function() {
  if (term._script) return term._script;
  term.last = +new Date;
  return term._script = require('fs').readFileSync(term.path, 'utf8');
});

term.__defineGetter__('Terminal', function() {
  if (term._Terminal) return term._Terminal;
  return term._Terminal = require('../src/term');
});

/**
 * Expose
 */

module.exports = term;

}).call(this,require("buffer").Buffer,"/node_modules/term.js/lib")
},{"../src/term":39,"buffer":3,"fs":2,"url":11}],39:[function(require,module,exports){
(function (global){
/**
 * term.js - an xterm emulator
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 * https://github.com/chjj/term.js
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * Originally forked from (with the author's permission):
 *   Fabrice Bellard's javascript vt100 for jslinux:
 *   http://bellard.org/jslinux/
 *   Copyright (c) 2011 Fabrice Bellard
 *   The original design remains. The terminal itself
 *   has been extended to include xterm CSI codes, among
 *   other features.
 */

;(function() {

/**
 * Terminal Emulation References:
 *   http://vt100.net/
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.txt
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 *   http://invisible-island.net/vttest/
 *   http://www.inwap.com/pdp10/ansicode.txt
 *   http://linux.die.net/man/4/console_codes
 *   http://linux.die.net/man/7/urxvt
 */

'use strict';

/**
 * Shared
 */

var window = this
  , document = this.document;

/**
 * EventEmitter
 */

function EventEmitter() {
  this._events = this._events || {};
}

EventEmitter.prototype.addListener = function(type, listener) {
  this._events[type] = this._events[type] || [];
  this._events[type].push(listener);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.removeListener = function(type, listener) {
  if (!this._events[type]) return;

  var obj = this._events[type]
    , i = obj.length;

  while (i--) {
    if (obj[i] === listener || obj[i].listener === listener) {
      obj.splice(i, 1);
      return;
    }
  }
};

EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

EventEmitter.prototype.removeAllListeners = function(type) {
  if (this._events[type]) delete this._events[type];
};

EventEmitter.prototype.once = function(type, listener) {
  function on() {
    var args = Array.prototype.slice.call(arguments);
    this.removeListener(type, on);
    return listener.apply(this, args);
  }
  on.listener = listener;
  return this.on(type, on);
};

EventEmitter.prototype.emit = function(type) {
  if (!this._events[type]) return;

  var args = Array.prototype.slice.call(arguments, 1)
    , obj = this._events[type]
    , l = obj.length
    , i = 0;

  for (; i < l; i++) {
    obj[i].apply(this, args);
  }
};

EventEmitter.prototype.listeners = function(type) {
  return this._events[type] = this._events[type] || [];
};

/**
 * Stream
 */

function Stream() {
  EventEmitter.call(this);
}

inherits(Stream, EventEmitter);

Stream.prototype.pipe = function(dest, options) {
  var src = this
    , ondata
    , onerror
    , onend;

  function unbind() {
    src.removeListener('data', ondata);
    src.removeListener('error', onerror);
    src.removeListener('end', onend);
    dest.removeListener('error', onerror);
    dest.removeListener('close', unbind);
  }

  src.on('data', ondata = function(data) {
    dest.write(data);
  });

  src.on('error', onerror = function(err) {
    unbind();
    if (!this.listeners('error').length) {
      throw err;
    }
  });

  src.on('end', onend = function() {
    dest.end();
    unbind();
  });

  dest.on('error', onerror);
  dest.on('close', unbind);

  dest.emit('pipe', src);

  return dest;
};

/**
 * States
 */

var normal = 0
  , escaped = 1
  , csi = 2
  , osc = 3
  , charset = 4
  , dcs = 5
  , ignore = 6
  , UDK = { type: 'udk' };

/**
 * Terminal
 */

function Terminal(options) {
  var self = this;

  if (!(this instanceof Terminal)) {
    return new Terminal(arguments[0], arguments[1], arguments[2]);
  }

  Stream.call(this);

  if (typeof options === 'number') {
    options = {
      cols: arguments[0],
      rows: arguments[1],
      handler: arguments[2]
    };
  }

  options = options || {};

  each(keys(Terminal.defaults), function(key) {
    if (options[key] == null) {
      options[key] = Terminal.options[key];
      // Legacy:
      if (Terminal[key] !== Terminal.defaults[key]) {
        options[key] = Terminal[key];
      }
    }
    self[key] = options[key];
  });

  if (options.colors.length === 8) {
    options.colors = options.colors.concat(Terminal._colors.slice(8));
  } else if (options.colors.length === 16) {
    options.colors = options.colors.concat(Terminal._colors.slice(16));
  } else if (options.colors.length === 10) {
    options.colors = options.colors.slice(0, -2).concat(
      Terminal._colors.slice(8, -2), options.colors.slice(-2));
  } else if (options.colors.length === 18) {
    options.colors = options.colors.slice(0, -2).concat(
      Terminal._colors.slice(16, -2), options.colors.slice(-2));
  }
  this.colors = options.colors;

  this.options = options;

  // this.context = options.context || window;
  // this.document = options.document || document;
  this.parent = options.body || options.parent
    || (document ? document.getElementsByTagName('body')[0] : null);

  this.cols = options.cols || options.geometry[0];
  this.rows = options.rows || options.geometry[1];

  // Act as though we are a node TTY stream:
  this.setRawMode;
  this.isTTY = true;
  this.isRaw = true;
  this.columns = this.cols;
  this.rows = this.rows;

  if (options.handler) {
    this.on('data', options.handler);
  }

  this.ybase = 0;
  this.ydisp = 0;
  this.x = 0;
  this.y = 0;
  this.cursorState = 0;
  this.cursorHidden = false;
  this.convertEol;
  this.state = 0;
  this.queue = '';
  this.scrollTop = 0;
  this.scrollBottom = this.rows - 1;

  // modes
  this.applicationKeypad = false;
  this.applicationCursor = false;
  this.originMode = false;
  this.insertMode = false;
  this.wraparoundMode = false;
  this.normal = null;

  // select modes
  this.prefixMode = false;
  this.selectMode = false;
  this.visualMode = false;
  this.searchMode = false;
  this.searchDown;
  this.entry = '';
  this.entryPrefix = 'Search: ';
  this._real;
  this._selected;
  this._textarea;

  // charset
  this.charset = null;
  this.gcharset = null;
  this.glevel = 0;
  this.charsets = [null];

  // mouse properties
  this.decLocator;
  this.x10Mouse;
  this.vt200Mouse;
  this.vt300Mouse;
  this.normalMouse;
  this.mouseEvents;
  this.sendFocus;
  this.utfMouse;
  this.sgrMouse;
  this.urxvtMouse;

  // misc
  this.element;
  this.children;
  this.refreshStart;
  this.refreshEnd;
  this.savedX;
  this.savedY;
  this.savedCols;

  // stream
  this.readable = true;
  this.writable = true;

  this.defAttr = (0 << 18) | (257 << 9) | (256 << 0);
  this.curAttr = this.defAttr;

  this.params = [];
  this.currentParam = 0;
  this.prefix = '';
  this.postfix = '';

  this.lines = [];
  var i = this.rows;
  while (i--) {
    this.lines.push(this.blankLine());
  }

  this.tabs;
  this.setupStops();
}

inherits(Terminal, Stream);

/**
 * Colors
 */

// Colors 0-15
Terminal.tangoColors = [
  // dark:
  '#2e3436',
  '#cc0000',
  '#4e9a06',
  '#c4a000',
  '#3465a4',
  '#75507b',
  '#06989a',
  '#d3d7cf',
  // bright:
  '#555753',
  '#ef2929',
  '#8ae234',
  '#fce94f',
  '#729fcf',
  '#ad7fa8',
  '#34e2e2',
  '#eeeeec'
];

Terminal.xtermColors = [
  // dark:
  '#000000', // black
  '#cd0000', // red3
  '#00cd00', // green3
  '#cdcd00', // yellow3
  '#0000ee', // blue2
  '#cd00cd', // magenta3
  '#00cdcd', // cyan3
  '#e5e5e5', // gray90
  // bright:
  '#7f7f7f', // gray50
  '#ff0000', // red
  '#00ff00', // green
  '#ffff00', // yellow
  '#5c5cff', // rgb:5c/5c/ff
  '#ff00ff', // magenta
  '#00ffff', // cyan
  '#ffffff'  // white
];

// Colors 0-15 + 16-255
// Much thanks to TooTallNate for writing this.
Terminal.colors = (function() {
  var colors = Terminal.tangoColors.slice()
    , r = [0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff]
    , i;

  // 16-231
  i = 0;
  for (; i < 216; i++) {
    out(r[(i / 36) % 6 | 0], r[(i / 6) % 6 | 0], r[i % 6]);
  }

  // 232-255 (grey)
  i = 0;
  for (; i < 24; i++) {
    r = 8 + i * 10;
    out(r, r, r);
  }

  function out(r, g, b) {
    colors.push('#' + hex(r) + hex(g) + hex(b));
  }

  function hex(c) {
    c = c.toString(16);
    return c.length < 2 ? '0' + c : c;
  }

  return colors;
})();

// Default BG/FG
Terminal.colors[256] = '#000000';
Terminal.colors[257] = '#f0f0f0';

Terminal._colors = Terminal.colors.slice();

Terminal.vcolors = (function() {
  var out = []
    , colors = Terminal.colors
    , i = 0
    , color;

  for (; i < 256; i++) {
    color = parseInt(colors[i].substring(1), 16);
    out.push([
      (color >> 16) & 0xff,
      (color >> 8) & 0xff,
      color & 0xff
    ]);
  }

  return out;
})();

/**
 * Options
 */

Terminal.defaults = {
  colors: Terminal.colors,
  convertEol: false,
  termName: 'xterm',
  geometry: [80, 24],
  cursorBlink: true,
  visualBell: false,
  popOnBell: false,
  scrollback: 1000,
  screenKeys: false,
  debug: false,
  useStyle: false
  // programFeatures: false,
  // focusKeys: false,
};

Terminal.options = {};

each(keys(Terminal.defaults), function(key) {
  Terminal[key] = Terminal.defaults[key];
  Terminal.options[key] = Terminal.defaults[key];
});

/**
 * Focused Terminal
 */

Terminal.focus = null;

Terminal.prototype.focus = function() {
  if (Terminal.focus === this) return;

  if (Terminal.focus) {
    Terminal.focus.blur();
  }

  if (this.sendFocus) this.send('\x1b[I');
  this.showCursor();

  // try {
  //   this.element.focus();
  // } catch (e) {
  //   ;
  // }

  // this.emit('focus');

  Terminal.focus = this;
};

Terminal.prototype.blur = function() {
  if (Terminal.focus !== this) return;

  this.cursorState = 0;
  this.refresh(this.y, this.y);
  if (this.sendFocus) this.send('\x1b[O');

  // try {
  //   this.element.blur();
  // } catch (e) {
  //   ;
  // }

  // this.emit('blur');

  Terminal.focus = null;
};

/**
 * Initialize global behavior
 */

Terminal.prototype.initGlobal = function() {
  var document = this.document;

  Terminal._boundDocs = Terminal._boundDocs || [];
  if (~indexOf(Terminal._boundDocs, document)) {
    return;
  }
  Terminal._boundDocs.push(document);

  Terminal.bindPaste(document);

  Terminal.bindKeys(document);

  Terminal.bindCopy(document);

  if (this.isMobile) {
    this.fixMobile(document);
  }

  if (this.useStyle) {
    Terminal.insertStyle(document, this.colors[256], this.colors[257]);
  }
};

/**
 * Bind to paste event
 */

Terminal.bindPaste = function(document) {
  // This seems to work well for ctrl-V and middle-click,
  // even without the contentEditable workaround.
  var window = document.defaultView;
  on(window, 'paste', function(ev) {
    var term = Terminal.focus;
    if (!term) return;
    if (ev.clipboardData) {
      term.send(ev.clipboardData.getData('text/plain'));
    } else if (term.context.clipboardData) {
      term.send(term.context.clipboardData.getData('Text'));
    }
    // Not necessary. Do it anyway for good measure.
    term.element.contentEditable = 'inherit';
    return cancel(ev);
  });
};

/**
 * Global Events for key handling
 */

Terminal.bindKeys = function(document) {
  // We should only need to check `target === body` below,
  // but we can check everything for good measure.
  on(document, 'keydown', function(ev) {
    if (!Terminal.focus) return;
    var target = ev.target || ev.srcElement;
    if (!target) return;
    if (target === Terminal.focus.element
        || target === Terminal.focus.context
        || target === Terminal.focus.document
        || target === Terminal.focus.body
        || target === Terminal._textarea
        || target === Terminal.focus.parent) {
      return Terminal.focus.keyDown(ev);
    }
  }, true);

  on(document, 'keypress', function(ev) {
    if (!Terminal.focus) return;
    var target = ev.target || ev.srcElement;
    if (!target) return;
    if (target === Terminal.focus.element
        || target === Terminal.focus.context
        || target === Terminal.focus.document
        || target === Terminal.focus.body
        || target === Terminal._textarea
        || target === Terminal.focus.parent) {
      return Terminal.focus.keyPress(ev);
    }
  }, true);

  // If we click somewhere other than a
  // terminal, unfocus the terminal.
  on(document, 'mousedown', function(ev) {
    if (!Terminal.focus) return;

    var el = ev.target || ev.srcElement;
    if (!el) return;

    do {
      if (el === Terminal.focus.element) return;
    } while (el = el.parentNode);

    Terminal.focus.blur();
  });
};

/**
 * Copy Selection w/ Ctrl-C (Select Mode)
 */

Terminal.bindCopy = function(document) {
  var window = document.defaultView;

  // if (!('onbeforecopy' in document)) {
  //   // Copies to *only* the clipboard.
  //   on(window, 'copy', function fn(ev) {
  //     var term = Terminal.focus;
  //     if (!term) return;
  //     if (!term._selected) return;
  //     var text = term.grabText(
  //       term._selected.x1, term._selected.x2,
  //       term._selected.y1, term._selected.y2);
  //     term.emit('copy', text);
  //     ev.clipboardData.setData('text/plain', text);
  //   });
  //   return;
  // }

  // Copies to primary selection *and* clipboard.
  // NOTE: This may work better on capture phase,
  // or using the `beforecopy` event.
  on(window, 'copy', function(ev) {
    var term = Terminal.focus;
    if (!term) return;
    if (!term._selected) return;
    var textarea = term.getCopyTextarea();
    var text = term.grabText(
      term._selected.x1, term._selected.x2,
      term._selected.y1, term._selected.y2);
    term.emit('copy', text);
    textarea.focus();
    textarea.textContent = text;
    textarea.value = text;
    textarea.setSelectionRange(0, text.length);
    setTimeout(function() {
      term.element.focus();
      term.focus();
    }, 1);
  });
};

/**
 * Fix Mobile
 */

Terminal.prototype.fixMobile = function(document) {
  var self = this;

  var textarea = document.createElement('textarea');
  textarea.style.position = 'absolute';
  textarea.style.left = '-32000px';
  textarea.style.top = '-32000px';
  textarea.style.width = '0px';
  textarea.style.height = '0px';
  textarea.style.opacity = '0';
  textarea.style.backgroundColor = 'transparent';
  textarea.style.borderStyle = 'none';
  textarea.style.outlineStyle = 'none';
  textarea.autocapitalize = 'none';
  textarea.autocorrect = 'off';

  document.getElementsByTagName('body')[0].appendChild(textarea);

  Terminal._textarea = textarea;

  setTimeout(function() {
    textarea.focus();
  }, 1000);

  if (this.isAndroid) {
    on(textarea, 'change', function() {
      var value = textarea.textContent || textarea.value;
      textarea.value = '';
      textarea.textContent = '';
      self.send(value + '\r');
    });
  }
};

/**
 * Insert a default style
 */

Terminal.insertStyle = function(document, bg, fg) {
  var style = document.getElementById('term-style');
  if (style) return;

  var head = document.getElementsByTagName('head')[0];
  if (!head) return;

  var style = document.createElement('style');
  style.id = 'term-style';

  // textContent doesn't work well with IE for <style> elements.
  style.innerHTML = ''
    + '.terminal {\n'
    + '  float: left;\n'
    + '  border: ' + bg + ' solid 5px;\n'
    + '  font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;\n'
    + '  font-size: 11px;\n'
    + '  color: ' + fg + ';\n'
    + '  background: ' + bg + ';\n'
    + '}\n'
    + '\n'
    + '.terminal-cursor {\n'
    + '  color: ' + bg + ';\n'
    + '  background: ' + fg + ';\n'
    + '}\n';

  // var out = '';
  // each(Terminal.colors, function(color, i) {
  //   if (i === 256) {
  //     out += '\n.term-bg-color-default { background-color: ' + color + '; }';
  //   }
  //   if (i === 257) {
  //     out += '\n.term-fg-color-default { color: ' + color + '; }';
  //   }
  //   out += '\n.term-bg-color-' + i + ' { background-color: ' + color + '; }';
  //   out += '\n.term-fg-color-' + i + ' { color: ' + color + '; }';
  // });
  // style.innerHTML += out + '\n';

  head.insertBefore(style, head.firstChild);
};

/**
 * Open Terminal
 */

Terminal.prototype.open = function(parent) {
  var self = this
    , i = 0
    , div;

  this.parent = parent || this.parent;

  if (!this.parent) {
    throw new Error('Terminal requires a parent element.');
  }

  // Grab global elements.
  this.context = this.parent.ownerDocument.defaultView;
  this.document = this.parent.ownerDocument;
  this.body = this.document.getElementsByTagName('body')[0];

  // Parse user-agent strings.
  if (this.context.navigator && this.context.navigator.userAgent) {
    this.isMac = !!~this.context.navigator.userAgent.indexOf('Mac');
    this.isIpad = !!~this.context.navigator.userAgent.indexOf('iPad');
    this.isIphone = !!~this.context.navigator.userAgent.indexOf('iPhone');
    this.isAndroid = !!~this.context.navigator.userAgent.indexOf('Android');
    this.isMobile = this.isIpad || this.isIphone || this.isAndroid;
    this.isMSIE = !!~this.context.navigator.userAgent.indexOf('MSIE');
  }

  // Create our main terminal element.
  this.element = this.document.createElement('div');
  this.element.className = 'terminal';
  this.element.style.outline = 'none';
  this.element.setAttribute('tabindex', 0);
  this.element.setAttribute('spellcheck', 'false');
  this.element.style.backgroundColor = this.colors[256];
  this.element.style.color = this.colors[257];

  // Create the lines for our terminal.
  this.children = [];
  for (; i < this.rows; i++) {
    div = this.document.createElement('div');
    this.element.appendChild(div);
    this.children.push(div);
  }
  this.parent.appendChild(this.element);

  // Draw the screen.
  this.refresh(0, this.rows - 1);

  if (!('useEvents' in this.options) || this.options.useEvents) {
    // Initialize global actions that
    // need to be taken on the document.
    this.initGlobal();
  }

  if (!('useFocus' in this.options) || this.options.useFocus) {
    // Ensure there is a Terminal.focus.
    this.focus();

    // Start blinking the cursor.
    this.startBlink();

    // Bind to DOM events related
    // to focus and paste behavior.
    on(this.element, 'focus', function() {
      self.focus();
      if (self.isMobile) {
        Terminal._textarea.focus();
      }
    });

    // This causes slightly funky behavior.
    // on(this.element, 'blur', function() {
    //   self.blur();
    // });

    on(this.element, 'mousedown', function() {
      self.focus();
    });

    // Clickable paste workaround, using contentEditable.
    // This probably shouldn't work,
    // ... but it does. Firefox's paste
    // event seems to only work for textareas?
    on(this.element, 'mousedown', function(ev) {
      var button = ev.button != null
        ? +ev.button
        : ev.which != null
          ? ev.which - 1
          : null;

      // Does IE9 do this?
      if (self.isMSIE) {
        button = button === 1 ? 0 : button === 4 ? 1 : button;
      }

      if (button !== 2) return;

      self.element.contentEditable = 'true';
      setTimeout(function() {
        self.element.contentEditable = 'inherit'; // 'false';
      }, 1);
    }, true);
  }

  if (!('useMouse' in this.options) || this.options.useMouse) {
    // Listen for mouse events and translate
    // them into terminal mouse protocols.
    this.bindMouse();
  }

  // this.emit('open');

  if (!('useFocus' in this.options) || this.options.useFocus) {
      // This can be useful for pasting,
      // as well as the iPad fix.
      setTimeout(function() {
        self.element.focus();
      }, 100);
  }

  // Figure out whether boldness affects
  // the character width of monospace fonts.
  if (Terminal.brokenBold == null) {
    Terminal.brokenBold = isBoldBroken(this.document);
  }

  this.emit('open');
};

Terminal.prototype.setRawMode = function(value) {
  this.isRaw = !!value;
};

// XTerm mouse events
// http://invisible-island.net/xterm/ctlseqs/ctlseqs.html#Mouse%20Tracking
// To better understand these
// the xterm code is very helpful:
// Relevant files:
//   button.c, charproc.c, misc.c
// Relevant functions in xterm/button.c:
//   BtnCode, EmitButtonCode, EditorButton, SendMousePosition
Terminal.prototype.bindMouse = function() {
  var el = this.element
    , self = this
    , pressed = 32;

  var wheelEvent = 'onmousewheel' in this.context
    ? 'mousewheel'
    : 'DOMMouseScroll';

  // mouseup, mousedown, mousewheel
  // left click: ^[[M 3<^[[M#3<
  // mousewheel up: ^[[M`3>
  function sendButton(ev) {
    var button
      , pos;

    // get the xterm-style button
    button = getButton(ev);

    // get mouse coordinates
    pos = getCoords(ev);
    if (!pos) return;

    sendEvent(button, pos);

    switch (ev.type) {
      case 'mousedown':
        pressed = button;
        break;
      case 'mouseup':
        // keep it at the left
        // button, just in case.
        pressed = 32;
        break;
      case wheelEvent:
        // nothing. don't
        // interfere with
        // `pressed`.
        break;
    }
  }

  // motion example of a left click:
  // ^[[M 3<^[[M@4<^[[M@5<^[[M@6<^[[M@7<^[[M#7<
  function sendMove(ev) {
    var button = pressed
      , pos;

    pos = getCoords(ev);
    if (!pos) return;

    // buttons marked as motions
    // are incremented by 32
    button += 32;

    sendEvent(button, pos);
  }

  // encode button and
  // position to characters
  function encode(data, ch) {
    if (!self.utfMouse) {
      if (ch === 255) return data.push(0);
      if (ch > 127) ch = 127;
      data.push(ch);
    } else {
      if (ch === 2047) return data.push(0);
      if (ch < 127) {
        data.push(ch);
      } else {
        if (ch > 2047) ch = 2047;
        data.push(0xC0 | (ch >> 6));
        data.push(0x80 | (ch & 0x3F));
      }
    }
  }

  // send a mouse event:
  // regular/utf8: ^[[M Cb Cx Cy
  // urxvt: ^[[ Cb ; Cx ; Cy M
  // sgr: ^[[ Cb ; Cx ; Cy M/m
  // vt300: ^[[ 24(1/3/5)~ [ Cx , Cy ] \r
  // locator: CSI P e ; P b ; P r ; P c ; P p & w
  function sendEvent(button, pos) {
    // self.emit('mouse', {
    //   x: pos.x - 32,
    //   y: pos.x - 32,
    //   button: button
    // });

    if (self.vt300Mouse) {
      // NOTE: Unstable.
      // http://www.vt100.net/docs/vt3xx-gp/chapter15.html
      button &= 3;
      pos.x -= 32;
      pos.y -= 32;
      var data = '\x1b[24';
      if (button === 0) data += '1';
      else if (button === 1) data += '3';
      else if (button === 2) data += '5';
      else if (button === 3) return;
      else data += '0';
      data += '~[' + pos.x + ',' + pos.y + ']\r';
      self.send(data);
      return;
    }

    if (self.decLocator) {
      // NOTE: Unstable.
      button &= 3;
      pos.x -= 32;
      pos.y -= 32;
      if (button === 0) button = 2;
      else if (button === 1) button = 4;
      else if (button === 2) button = 6;
      else if (button === 3) button = 3;
      self.send('\x1b['
        + button
        + ';'
        + (button === 3 ? 4 : 0)
        + ';'
        + pos.y
        + ';'
        + pos.x
        + ';'
        + (pos.page || 0)
        + '&w');
      return;
    }

    if (self.urxvtMouse) {
      pos.x -= 32;
      pos.y -= 32;
      pos.x++;
      pos.y++;
      self.send('\x1b[' + button + ';' + pos.x + ';' + pos.y + 'M');
      return;
    }

    if (self.sgrMouse) {
      pos.x -= 32;
      pos.y -= 32;
      self.send('\x1b[<'
        + ((button & 3) === 3 ? button & ~3 : button)
        + ';'
        + pos.x
        + ';'
        + pos.y
        + ((button & 3) === 3 ? 'm' : 'M'));
      return;
    }

    var data = [];

    encode(data, button);
    encode(data, pos.x);
    encode(data, pos.y);

    self.send('\x1b[M' + String.fromCharCode.apply(String, data));
  }

  function getButton(ev) {
    var button
      , shift
      , meta
      , ctrl
      , mod;

    // two low bits:
    // 0 = left
    // 1 = middle
    // 2 = right
    // 3 = release
    // wheel up/down:
    // 1, and 2 - with 64 added
    switch (ev.type) {
      case 'mousedown':
        button = ev.button != null
          ? +ev.button
          : ev.which != null
            ? ev.which - 1
            : null;

        if (self.isMSIE) {
          button = button === 1 ? 0 : button === 4 ? 1 : button;
        }
        break;
      case 'mouseup':
        button = 3;
        break;
      case 'DOMMouseScroll':
        button = ev.detail < 0
          ? 64
          : 65;
        break;
      case 'mousewheel':
        button = ev.wheelDeltaY > 0
          ? 64
          : 65;
        break;
    }

    // next three bits are the modifiers:
    // 4 = shift, 8 = meta, 16 = control
    shift = ev.shiftKey ? 4 : 0;
    meta = ev.metaKey ? 8 : 0;
    ctrl = ev.ctrlKey ? 16 : 0;
    mod = shift | meta | ctrl;

    // no mods
    if (self.vt200Mouse) {
      // ctrl only
      mod &= ctrl;
    } else if (!self.normalMouse) {
      mod = 0;
    }

    // increment to SP
    button = (32 + (mod << 2)) + button;

    return button;
  }

  // mouse coordinates measured in cols/rows
  function getCoords(ev) {
    var x, y, w, h, el;

    // ignore browsers without pageX for now
    if (ev.pageX == null) return;

    x = ev.pageX;
    y = ev.pageY;
    el = self.element;

    // should probably check offsetParent
    // but this is more portable
    while (el && el !== self.document.documentElement) {
      x -= el.offsetLeft;
      y -= el.offsetTop;
      el = 'offsetParent' in el
        ? el.offsetParent
        : el.parentNode;
    }

    // convert to cols/rows
    w = self.element.clientWidth;
    h = self.element.clientHeight;
    x = Math.round((x / w) * self.cols);
    y = Math.round((y / h) * self.rows);

    // be sure to avoid sending
    // bad positions to the program
    if (x < 0) x = 0;
    if (x > self.cols) x = self.cols;
    if (y < 0) y = 0;
    if (y > self.rows) y = self.rows;

    // xterm sends raw bytes and
    // starts at 32 (SP) for each.
    x += 32;
    y += 32;

    return {
      x: x,
      y: y,
      type: ev.type === wheelEvent
        ? 'mousewheel'
        : ev.type
    };
  }

  on(el, 'mousedown', function(ev) {
    if (!self.mouseEvents) return;

    // send the button
    sendButton(ev);

    // ensure focus
    self.focus();

    // fix for odd bug
    //if (self.vt200Mouse && !self.normalMouse) {
    // XXX This seems to break certain programs.
    // if (self.vt200Mouse) {
    //   sendButton({ __proto__: ev, type: 'mouseup' });
    //   return cancel(ev);
    // }

    // bind events
    if (self.normalMouse) on(self.document, 'mousemove', sendMove);

    // x10 compatibility mode can't send button releases
    if (!self.x10Mouse) {
      on(self.document, 'mouseup', function up(ev) {
        sendButton(ev);
        if (self.normalMouse) off(self.document, 'mousemove', sendMove);
        off(self.document, 'mouseup', up);
        return cancel(ev);
      });
    }

    return cancel(ev);
  });

  //if (self.normalMouse) {
  //  on(self.document, 'mousemove', sendMove);
  //}

  on(el, wheelEvent, function(ev) {
    if (!self.mouseEvents) return;
    if (self.x10Mouse
        || self.vt300Mouse
        || self.decLocator) return;
    sendButton(ev);
    return cancel(ev);
  });

  // allow mousewheel scrolling in
  // the shell for example
  on(el, wheelEvent, function(ev) {
    if (self.mouseEvents) return;
    if (self.applicationKeypad) return;
    if (ev.type === 'DOMMouseScroll') {
      self.scrollDisp(ev.detail < 0 ? -5 : 5);
    } else {
      self.scrollDisp(ev.wheelDeltaY > 0 ? -5 : 5);
    }
    return cancel(ev);
  });
};

/**
 * Destroy Terminal
 */

Terminal.prototype.close =
Terminal.prototype.destroySoon =
Terminal.prototype.destroy = function() {
  if (this.destroyed) {
    return;
  }

  if (this._blink) {
    clearInterval(this._blink);
    delete this._blink;
  }

  this.readable = false;
  this.writable = false;
  this.destroyed = true;
  this._events = {};

  this.handler = function() {};
  this.write = function() {};
  this.end = function() {};

  if (this.element.parentNode) {
    this.element.parentNode.removeChild(this.element);
  }

  this.emit('end');
  this.emit('close');
  this.emit('finish');
  this.emit('destroy');
};

/**
 * Rendering Engine
 */

// In the screen buffer, each character
// is stored as a an array with a character
// and a 32-bit integer.
// First value: a utf-16 character.
// Second value:
// Next 9 bits: background color (0-511).
// Next 9 bits: foreground color (0-511).
// Next 14 bits: a mask for misc. flags:
//   1=bold, 2=underline, 4=blink, 8=inverse, 16=invisible

Terminal.prototype.refresh = function(start, end) {
  var x
    , y
    , i
    , line
    , out
    , ch
    , width
    , data
    , attr
    , bg
    , fg
    , flags
    , row
    , parent;

  if (end - start >= this.rows / 2) {
    parent = this.element.parentNode;
    if (parent) parent.removeChild(this.element);
  }

  width = this.cols;
  y = start;

  if (end >= this.lines.length) {
    this.log('`end` is too large. Most likely a bad CSR.');
    end = this.lines.length - 1;
  }

  for (; y <= end; y++) {
    row = y + this.ydisp;

    line = this.lines[row];
    out = '';

    if (y === this.y
        && this.cursorState
        && (this.ydisp === this.ybase || this.selectMode)
        && !this.cursorHidden) {
      x = this.x;
    } else {
      x = -1;
    }

    attr = this.defAttr;
    i = 0;

    for (; i < width; i++) {
      data = line[i][0];
      ch = line[i][1];

      if (i === x) data = -1;

      if (data !== attr) {
        if (attr !== this.defAttr) {
          out += '</span>';
        }
        if (data !== this.defAttr) {
          if (data === -1) {
            out += '<span class="reverse-video terminal-cursor">';
          } else {
            out += '<span style="';

            bg = data & 0x1ff;
            fg = (data >> 9) & 0x1ff;
            flags = data >> 18;

            // bold
            if (flags & 1) {
              if (!Terminal.brokenBold) {
                out += 'font-weight:bold;';
              }
              // See: XTerm*boldColors
              if (fg < 8) fg += 8;
            }

            // underline
            if (flags & 2) {
              out += 'text-decoration:underline;';
            }

            // blink
            if (flags & 4) {
              if (flags & 2) {
                out = out.slice(0, -1);
                out += ' blink;';
              } else {
                out += 'text-decoration:blink;';
              }
            }

            // inverse
            if (flags & 8) {
              bg = (data >> 9) & 0x1ff;
              fg = data & 0x1ff;
              // Should inverse just be before the
              // above boldColors effect instead?
              if ((flags & 1) && fg < 8) fg += 8;
            }

            // invisible
            if (flags & 16) {
              out += 'visibility:hidden;';
            }

            // out += '" class="'
            //   + 'term-bg-color-' + bg
            //   + ' '
            //   + 'term-fg-color-' + fg
            //   + '">';

            if (bg !== 256) {
              out += 'background-color:'
                + this.colors[bg]
                + ';';
            }

            if (fg !== 257) {
              out += 'color:'
                + this.colors[fg]
                + ';';
            }

            out += '">';
          }
        }
      }

      switch (ch) {
        case '&':
          out += '&amp;';
          break;
        case '<':
          out += '&lt;';
          break;
        case '>':
          out += '&gt;';
          break;
        default:
          if (ch <= ' ') {
            out += '&nbsp;';
          } else {
            if (isWide(ch)) i++;
            out += ch;
          }
          break;
      }

      attr = data;
    }

    if (attr !== this.defAttr) {
      out += '</span>';
    }

    this.children[y].innerHTML = out;
  }

  if (parent) parent.appendChild(this.element);
};

Terminal.prototype._cursorBlink = function() {
  if (Terminal.focus !== this) return;
  this.cursorState ^= 1;
  this.refresh(this.y, this.y);
};

Terminal.prototype.showCursor = function() {
  if (!this.cursorState) {
    this.cursorState = 1;
    this.refresh(this.y, this.y);
  } else {
    // Temporarily disabled:
    // this.refreshBlink();
  }
};

Terminal.prototype.startBlink = function() {
  if (!this.cursorBlink) return;
  var self = this;
  this._blinker = function() {
    self._cursorBlink();
  };
  this._blink = setInterval(this._blinker, 500);
};

Terminal.prototype.refreshBlink = function() {
  if (!this.cursorBlink || !this._blink) return;
  clearInterval(this._blink);
  this._blink = setInterval(this._blinker, 500);
};

Terminal.prototype.scroll = function() {
  var row;

  if (++this.ybase === this.scrollback) {
    this.ybase = this.ybase / 2 | 0;
    this.lines = this.lines.slice(-(this.ybase + this.rows) + 1);
  }

  this.ydisp = this.ybase;

  // last line
  row = this.ybase + this.rows - 1;

  // subtract the bottom scroll region
  row -= this.rows - 1 - this.scrollBottom;

  if (row === this.lines.length) {
    // potential optimization:
    // pushing is faster than splicing
    // when they amount to the same
    // behavior.
    this.lines.push(this.blankLine());
  } else {
    // add our new line
    this.lines.splice(row, 0, this.blankLine());
  }

  if (this.scrollTop !== 0) {
    if (this.ybase !== 0) {
      this.ybase--;
      this.ydisp = this.ybase;
    }
    this.lines.splice(this.ybase + this.scrollTop, 1);
  }

  // this.maxRange();
  this.updateRange(this.scrollTop);
  this.updateRange(this.scrollBottom);
};

Terminal.prototype.scrollDisp = function(disp) {
  this.ydisp += disp;

  if (this.ydisp > this.ybase) {
    this.ydisp = this.ybase;
  } else if (this.ydisp < 0) {
    this.ydisp = 0;
  }

  this.refresh(0, this.rows - 1);
};

Terminal.prototype.write = function(data) {
  var l = data.length
    , i = 0
    , j
    , cs
    , ch;

  this.refreshStart = this.y;
  this.refreshEnd = this.y;

  if (this.ybase !== this.ydisp) {
    this.ydisp = this.ybase;
    this.maxRange();
  }

  // this.log(JSON.stringify(data.replace(/\x1b/g, '^[')));

  for (; i < l; i++, this.lch = ch) {
    ch = data[i];
    switch (this.state) {
      case normal:
        switch (ch) {
          // '\0'
          // case '\0':
          // case '\200':
          //   break;

          // '\a'
          case '\x07':
            this.bell();
            break;

          // '\n', '\v', '\f'
          case '\n':
          case '\x0b':
          case '\x0c':
            if (this.convertEol) {
              this.x = 0;
            }
            // TODO: Implement eat_newline_glitch.
            // if (this.realX >= this.cols) break;
            // this.realX = 0;
            this.y++;
            if (this.y > this.scrollBottom) {
              this.y--;
              this.scroll();
            }
            break;

          // '\r'
          case '\r':
            this.x = 0;
            break;

          // '\b'
          case '\x08':
            if (this.x > 0) {
              this.x--;
            }
            break;

          // '\t'
          case '\t':
            this.x = this.nextStop();
            break;

          // shift out
          case '\x0e':
            this.setgLevel(1);
            break;

          // shift in
          case '\x0f':
            this.setgLevel(0);
            break;

          // '\e'
          case '\x1b':
            this.state = escaped;
            break;

          default:
            // ' '
            if (ch >= ' ') {
              if (this.charset && this.charset[ch]) {
                ch = this.charset[ch];
              }

              if (this.x >= this.cols) {
                this.x = 0;
                this.y++;
                if (this.y > this.scrollBottom) {
                  this.y--;
                  this.scroll();
                }
              }

              this.lines[this.y + this.ybase][this.x] = [this.curAttr, ch];
              this.x++;
              this.updateRange(this.y);

              if (isWide(ch)) {
                j = this.y + this.ybase;
                if (this.cols < 2 || this.x >= this.cols) {
                  this.lines[j][this.x - 1] = [this.curAttr, ' '];
                  break;
                }
                this.lines[j][this.x] = [this.curAttr, ' '];
                this.x++;
              }
            }
            break;
        }
        break;
      case escaped:
        switch (ch) {
          // ESC [ Control Sequence Introducer ( CSI is 0x9b).
          case '[':
            this.params = [];
            this.currentParam = 0;
            this.state = csi;
            break;

          // ESC ] Operating System Command ( OSC is 0x9d).
          case ']':
            this.params = [];
            this.currentParam = 0;
            this.state = osc;
            break;

          // ESC P Device Control String ( DCS is 0x90).
          case 'P':
            this.params = [];
            this.prefix = '';
            this.currentParam = '';
            this.state = dcs;
            break;

          // ESC _ Application Program Command ( APC is 0x9f).
          case '_':
            this.state = ignore;
            break;

          // ESC ^ Privacy Message ( PM is 0x9e).
          case '^':
            this.state = ignore;
            break;

          // ESC c Full Reset (RIS).
          case 'c':
            this.reset();
            break;

          // ESC E Next Line ( NEL is 0x85).
          // ESC D Index ( IND is 0x84).
          case 'E':
            this.x = 0;
            ;
          case 'D':
            this.index();
            break;

          // ESC M Reverse Index ( RI is 0x8d).
          case 'M':
            this.reverseIndex();
            break;

          // ESC % Select default/utf-8 character set.
          // @ = default, G = utf-8
          case '%':
            //this.charset = null;
            this.setgLevel(0);
            this.setgCharset(0, Terminal.charsets.US);
            this.state = normal;
            i++;
            break;

          // ESC (,),*,+,-,. Designate G0-G2 Character Set.
          case '(': // <-- this seems to get all the attention
          case ')':
          case '*':
          case '+':
          case '-':
          case '.':
            switch (ch) {
              case '(':
                this.gcharset = 0;
                break;
              case ')':
                this.gcharset = 1;
                break;
              case '*':
                this.gcharset = 2;
                break;
              case '+':
                this.gcharset = 3;
                break;
              case '-':
                this.gcharset = 1;
                break;
              case '.':
                this.gcharset = 2;
                break;
            }
            this.state = charset;
            break;

          // Designate G3 Character Set (VT300).
          // A = ISO Latin-1 Supplemental.
          // Not implemented.
          case '/':
            this.gcharset = 3;
            this.state = charset;
            i--;
            break;

          // ESC N
          // Single Shift Select of G2 Character Set
          // ( SS2 is 0x8e). This affects next character only.
          case 'N':
            break;
          // ESC O
          // Single Shift Select of G3 Character Set
          // ( SS3 is 0x8f). This affects next character only.
          case 'O':
            break;
          // ESC n
          // Invoke the G2 Character Set as GL (LS2).
          case 'n':
            this.setgLevel(2);
            break;
          // ESC o
          // Invoke the G3 Character Set as GL (LS3).
          case 'o':
            this.setgLevel(3);
            break;
          // ESC |
          // Invoke the G3 Character Set as GR (LS3R).
          case '|':
            this.setgLevel(3);
            break;
          // ESC }
          // Invoke the G2 Character Set as GR (LS2R).
          case '}':
            this.setgLevel(2);
            break;
          // ESC ~
          // Invoke the G1 Character Set as GR (LS1R).
          case '~':
            this.setgLevel(1);
            break;

          // ESC 7 Save Cursor (DECSC).
          case '7':
            this.saveCursor();
            this.state = normal;
            break;

          // ESC 8 Restore Cursor (DECRC).
          case '8':
            this.restoreCursor();
            this.state = normal;
            break;

          // ESC # 3 DEC line height/width
          case '#':
            this.state = normal;
            i++;
            break;

          // ESC H Tab Set (HTS is 0x88).
          case 'H':
            this.tabSet();
            break;

          // ESC = Application Keypad (DECPAM).
          case '=':
            this.log('Serial port requested application keypad.');
            this.applicationKeypad = true;
            this.state = normal;
            break;

          // ESC > Normal Keypad (DECPNM).
          case '>':
            this.log('Switching back to normal keypad.');
            this.applicationKeypad = false;
            this.state = normal;
            break;

          default:
            this.state = normal;
            this.error('Unknown ESC control: %s.', ch);
            break;
        }
        break;

      case charset:
        switch (ch) {
          case '0': // DEC Special Character and Line Drawing Set.
            cs = Terminal.charsets.SCLD;
            break;
          case 'A': // UK
            cs = Terminal.charsets.UK;
            break;
          case 'B': // United States (USASCII).
            cs = Terminal.charsets.US;
            break;
          case '4': // Dutch
            cs = Terminal.charsets.Dutch;
            break;
          case 'C': // Finnish
          case '5':
            cs = Terminal.charsets.Finnish;
            break;
          case 'R': // French
            cs = Terminal.charsets.French;
            break;
          case 'Q': // FrenchCanadian
            cs = Terminal.charsets.FrenchCanadian;
            break;
          case 'K': // German
            cs = Terminal.charsets.German;
            break;
          case 'Y': // Italian
            cs = Terminal.charsets.Italian;
            break;
          case 'E': // NorwegianDanish
          case '6':
            cs = Terminal.charsets.NorwegianDanish;
            break;
          case 'Z': // Spanish
            cs = Terminal.charsets.Spanish;
            break;
          case 'H': // Swedish
          case '7':
            cs = Terminal.charsets.Swedish;
            break;
          case '=': // Swiss
            cs = Terminal.charsets.Swiss;
            break;
          case '/': // ISOLatin (actually /A)
            cs = Terminal.charsets.ISOLatin;
            i++;
            break;
          default: // Default
            cs = Terminal.charsets.US;
            break;
        }
        this.setgCharset(this.gcharset, cs);
        this.gcharset = null;
        this.state = normal;
        break;

      case osc:
        // OSC Ps ; Pt ST
        // OSC Ps ; Pt BEL
        //   Set Text Parameters.
        if ((this.lch === '\x1b' && ch === '\\') || ch === '\x07') {
          if (this.lch === '\x1b') {
            if (typeof this.currentParam === 'string') {
              this.currentParam = this.currentParam.slice(0, -1);
            } else if (typeof this.currentParam == 'number') {
              this.currentParam = (this.currentParam - ('\x1b'.charCodeAt(0) - 48)) / 10;
            }
          }

          this.params.push(this.currentParam);

          switch (this.params[0]) {
            case 0:
            case 1:
            case 2:
              if (this.params[1]) {
                this.title = this.params[1];
                this.handleTitle(this.title);
              }
              break;
            case 3:
              // set X property
              break;
            case 4:
            case 5:
              // change dynamic colors
              break;
            case 10:
            case 11:
            case 12:
            case 13:
            case 14:
            case 15:
            case 16:
            case 17:
            case 18:
            case 19:
              // change dynamic ui colors
              break;
            case 46:
              // change log file
              break;
            case 50:
              // dynamic font
              break;
            case 51:
              // emacs shell
              break;
            case 52:
              // manipulate selection data
              break;
            case 104:
            case 105:
            case 110:
            case 111:
            case 112:
            case 113:
            case 114:
            case 115:
            case 116:
            case 117:
            case 118:
              // reset colors
              break;
          }

          this.params = [];
          this.currentParam = 0;
          this.state = normal;
        } else {
          if (!this.params.length) {
            if (ch >= '0' && ch <= '9') {
              this.currentParam =
                this.currentParam * 10 + ch.charCodeAt(0) - 48;
            } else if (ch === ';') {
              this.params.push(this.currentParam);
              this.currentParam = '';
            }
          } else {
            this.currentParam += ch;
          }
        }
        break;

      case csi:
        // '?', '>', '!'
        if (ch === '?' || ch === '>' || ch === '!') {
          this.prefix = ch;
          break;
        }

        // 0 - 9
        if (ch >= '0' && ch <= '9') {
          this.currentParam = this.currentParam * 10 + ch.charCodeAt(0) - 48;
          break;
        }

        // '$', '"', ' ', '\''
        if (ch === '$' || ch === '"' || ch === ' ' || ch === '\'') {
          this.postfix = ch;
          break;
        }

        this.params.push(this.currentParam);
        this.currentParam = 0;

        // ';'
        if (ch === ';') break;

        this.state = normal;

        switch (ch) {
          // CSI Ps A
          // Cursor Up Ps Times (default = 1) (CUU).
          case 'A':
            this.cursorUp(this.params);
            break;

          // CSI Ps B
          // Cursor Down Ps Times (default = 1) (CUD).
          case 'B':
            this.cursorDown(this.params);
            break;

          // CSI Ps C
          // Cursor Forward Ps Times (default = 1) (CUF).
          case 'C':
            this.cursorForward(this.params);
            break;

          // CSI Ps D
          // Cursor Backward Ps Times (default = 1) (CUB).
          case 'D':
            this.cursorBackward(this.params);
            break;

          // CSI Ps ; Ps H
          // Cursor Position [row;column] (default = [1,1]) (CUP).
          case 'H':
            this.cursorPos(this.params);
            break;

          // CSI Ps J  Erase in Display (ED).
          case 'J':
            this.eraseInDisplay(this.params);
            break;

          // CSI Ps K  Erase in Line (EL).
          case 'K':
            this.eraseInLine(this.params);
            break;

          // CSI Pm m  Character Attributes (SGR).
          case 'm':
            if (!this.prefix) {
              this.charAttributes(this.params);
            }
            break;

          // CSI Ps n  Device Status Report (DSR).
          case 'n':
            if (!this.prefix) {
              this.deviceStatus(this.params);
            }
            break;

          /**
           * Additions
           */

          // CSI Ps @
          // Insert Ps (Blank) Character(s) (default = 1) (ICH).
          case '@':
            this.insertChars(this.params);
            break;

          // CSI Ps E
          // Cursor Next Line Ps Times (default = 1) (CNL).
          case 'E':
            this.cursorNextLine(this.params);
            break;

          // CSI Ps F
          // Cursor Preceding Line Ps Times (default = 1) (CNL).
          case 'F':
            this.cursorPrecedingLine(this.params);
            break;

          // CSI Ps G
          // Cursor Character Absolute  [column] (default = [row,1]) (CHA).
          case 'G':
            this.cursorCharAbsolute(this.params);
            break;

          // CSI Ps L
          // Insert Ps Line(s) (default = 1) (IL).
          case 'L':
            this.insertLines(this.params);
            break;

          // CSI Ps M
          // Delete Ps Line(s) (default = 1) (DL).
          case 'M':
            this.deleteLines(this.params);
            break;

          // CSI Ps P
          // Delete Ps Character(s) (default = 1) (DCH).
          case 'P':
            this.deleteChars(this.params);
            break;

          // CSI Ps X
          // Erase Ps Character(s) (default = 1) (ECH).
          case 'X':
            this.eraseChars(this.params);
            break;

          // CSI Pm `  Character Position Absolute
          //   [column] (default = [row,1]) (HPA).
          case '`':
            this.charPosAbsolute(this.params);
            break;

          // 141 61 a * HPR -
          // Horizontal Position Relative
          case 'a':
            this.HPositionRelative(this.params);
            break;

          // CSI P s c
          // Send Device Attributes (Primary DA).
          // CSI > P s c
          // Send Device Attributes (Secondary DA)
          case 'c':
            this.sendDeviceAttributes(this.params);
            break;

          // CSI Pm d
          // Line Position Absolute  [row] (default = [1,column]) (VPA).
          case 'd':
            this.linePosAbsolute(this.params);
            break;

          // 145 65 e * VPR - Vertical Position Relative
          case 'e':
            this.VPositionRelative(this.params);
            break;

          // CSI Ps ; Ps f
          //   Horizontal and Vertical Position [row;column] (default =
          //   [1,1]) (HVP).
          case 'f':
            this.HVPosition(this.params);
            break;

          // CSI Pm h  Set Mode (SM).
          // CSI ? Pm h - mouse escape codes, cursor escape codes
          case 'h':
            this.setMode(this.params);
            break;

          // CSI Pm l  Reset Mode (RM).
          // CSI ? Pm l
          case 'l':
            this.resetMode(this.params);
            break;

          // CSI Ps ; Ps r
          //   Set Scrolling Region [top;bottom] (default = full size of win-
          //   dow) (DECSTBM).
          // CSI ? Pm r
          case 'r':
            this.setScrollRegion(this.params);
            break;

          // CSI s
          //   Save cursor (ANSI.SYS).
          case 's':
            this.saveCursor(this.params);
            break;

          // CSI u
          //   Restore cursor (ANSI.SYS).
          case 'u':
            this.restoreCursor(this.params);
            break;

          /**
           * Lesser Used
           */

          // CSI Ps I
          // Cursor Forward Tabulation Ps tab stops (default = 1) (CHT).
          case 'I':
            this.cursorForwardTab(this.params);
            break;

          // CSI Ps S  Scroll up Ps lines (default = 1) (SU).
          case 'S':
            this.scrollUp(this.params);
            break;

          // CSI Ps T  Scroll down Ps lines (default = 1) (SD).
          // CSI Ps ; Ps ; Ps ; Ps ; Ps T
          // CSI > Ps; Ps T
          case 'T':
            // if (this.prefix === '>') {
            //   this.resetTitleModes(this.params);
            //   break;
            // }
            // if (this.params.length > 2) {
            //   this.initMouseTracking(this.params);
            //   break;
            // }
            if (this.params.length < 2 && !this.prefix) {
              this.scrollDown(this.params);
            }
            break;

          // CSI Ps Z
          // Cursor Backward Tabulation Ps tab stops (default = 1) (CBT).
          case 'Z':
            this.cursorBackwardTab(this.params);
            break;

          // CSI Ps b  Repeat the preceding graphic character Ps times (REP).
          case 'b':
            this.repeatPrecedingCharacter(this.params);
            break;

          // CSI Ps g  Tab Clear (TBC).
          case 'g':
            this.tabClear(this.params);
            break;

          // CSI Pm i  Media Copy (MC).
          // CSI ? Pm i
          // case 'i':
          //   this.mediaCopy(this.params);
          //   break;

          // CSI Pm m  Character Attributes (SGR).
          // CSI > Ps; Ps m
          // case 'm': // duplicate
          //   if (this.prefix === '>') {
          //     this.setResources(this.params);
          //   } else {
          //     this.charAttributes(this.params);
          //   }
          //   break;

          // CSI Ps n  Device Status Report (DSR).
          // CSI > Ps n
          // case 'n': // duplicate
          //   if (this.prefix === '>') {
          //     this.disableModifiers(this.params);
          //   } else {
          //     this.deviceStatus(this.params);
          //   }
          //   break;

          // CSI > Ps p  Set pointer mode.
          // CSI ! p   Soft terminal reset (DECSTR).
          // CSI Ps$ p
          //   Request ANSI mode (DECRQM).
          // CSI ? Ps$ p
          //   Request DEC private mode (DECRQM).
          // CSI Ps ; Ps " p
          case 'p':
            switch (this.prefix) {
              // case '>':
              //   this.setPointerMode(this.params);
              //   break;
              case '!':
                this.softReset(this.params);
                break;
              // case '?':
              //   if (this.postfix === '$') {
              //     this.requestPrivateMode(this.params);
              //   }
              //   break;
              // default:
              //   if (this.postfix === '"') {
              //     this.setConformanceLevel(this.params);
              //   } else if (this.postfix === '$') {
              //     this.requestAnsiMode(this.params);
              //   }
              //   break;
            }
            break;

          // CSI Ps q  Load LEDs (DECLL).
          // CSI Ps SP q
          // CSI Ps " q
          // case 'q':
          //   if (this.postfix === ' ') {
          //     this.setCursorStyle(this.params);
          //     break;
          //   }
          //   if (this.postfix === '"') {
          //     this.setCharProtectionAttr(this.params);
          //     break;
          //   }
          //   this.loadLEDs(this.params);
          //   break;

          // CSI Ps ; Ps r
          //   Set Scrolling Region [top;bottom] (default = full size of win-
          //   dow) (DECSTBM).
          // CSI ? Pm r
          // CSI Pt; Pl; Pb; Pr; Ps$ r
          // case 'r': // duplicate
          //   if (this.prefix === '?') {
          //     this.restorePrivateValues(this.params);
          //   } else if (this.postfix === '$') {
          //     this.setAttrInRectangle(this.params);
          //   } else {
          //     this.setScrollRegion(this.params);
          //   }
          //   break;

          // CSI s     Save cursor (ANSI.SYS).
          // CSI ? Pm s
          // case 's': // duplicate
          //   if (this.prefix === '?') {
          //     this.savePrivateValues(this.params);
          //   } else {
          //     this.saveCursor(this.params);
          //   }
          //   break;

          // CSI Ps ; Ps ; Ps t
          // CSI Pt; Pl; Pb; Pr; Ps$ t
          // CSI > Ps; Ps t
          // CSI Ps SP t
          // case 't':
          //   if (this.postfix === '$') {
          //     this.reverseAttrInRectangle(this.params);
          //   } else if (this.postfix === ' ') {
          //     this.setWarningBellVolume(this.params);
          //   } else {
          //     if (this.prefix === '>') {
          //       this.setTitleModeFeature(this.params);
          //     } else {
          //       this.manipulateWindow(this.params);
          //     }
          //   }
          //   break;

          // CSI u     Restore cursor (ANSI.SYS).
          // CSI Ps SP u
          // case 'u': // duplicate
          //   if (this.postfix === ' ') {
          //     this.setMarginBellVolume(this.params);
          //   } else {
          //     this.restoreCursor(this.params);
          //   }
          //   break;

          // CSI Pt; Pl; Pb; Pr; Pp; Pt; Pl; Pp$ v
          // case 'v':
          //   if (this.postfix === '$') {
          //     this.copyRectagle(this.params);
          //   }
          //   break;

          // CSI Pt ; Pl ; Pb ; Pr ' w
          // case 'w':
          //   if (this.postfix === '\'') {
          //     this.enableFilterRectangle(this.params);
          //   }
          //   break;

          // CSI Ps x  Request Terminal Parameters (DECREQTPARM).
          // CSI Ps x  Select Attribute Change Extent (DECSACE).
          // CSI Pc; Pt; Pl; Pb; Pr$ x
          // case 'x':
          //   if (this.postfix === '$') {
          //     this.fillRectangle(this.params);
          //   } else {
          //     this.requestParameters(this.params);
          //     //this.__(this.params);
          //   }
          //   break;

          // CSI Ps ; Pu ' z
          // CSI Pt; Pl; Pb; Pr$ z
          // case 'z':
          //   if (this.postfix === '\'') {
          //     this.enableLocatorReporting(this.params);
          //   } else if (this.postfix === '$') {
          //     this.eraseRectangle(this.params);
          //   }
          //   break;

          // CSI Pm ' {
          // CSI Pt; Pl; Pb; Pr$ {
          // case '{':
          //   if (this.postfix === '\'') {
          //     this.setLocatorEvents(this.params);
          //   } else if (this.postfix === '$') {
          //     this.selectiveEraseRectangle(this.params);
          //   }
          //   break;

          // CSI Ps ' |
          // case '|':
          //   if (this.postfix === '\'') {
          //     this.requestLocatorPosition(this.params);
          //   }
          //   break;

          // CSI P m SP }
          // Insert P s Column(s) (default = 1) (DECIC), VT420 and up.
          // case '}':
          //   if (this.postfix === ' ') {
          //     this.insertColumns(this.params);
          //   }
          //   break;

          // CSI P m SP ~
          // Delete P s Column(s) (default = 1) (DECDC), VT420 and up
          // case '~':
          //   if (this.postfix === ' ') {
          //     this.deleteColumns(this.params);
          //   }
          //   break;

          default:
            this.error('Unknown CSI code: %s.', ch);
            break;
        }

        this.prefix = '';
        this.postfix = '';
        break;

      case dcs:
        if ((this.lch === '\x1b' && ch === '\\') || ch === '\x07') {
          // Workarounds:
          if (this.prefix === 'tmux;\x1b') {
            // `DCS tmux; Pt ST` may contain a Pt with an ST
            // XXX Does tmux work this way?
            // if (this.lch === '\x1b' & data[i + 1] === '\x1b' && data[i + 2] === '\\') {
            //   this.currentParam += ch;
            //   continue;
            // }
            // Tmux only accepts ST, not BEL:
            if (ch === '\x07') {
              this.currentParam += ch;
              continue;
            }
          }

          if (this.lch === '\x1b') {
            if (typeof this.currentParam === 'string') {
              this.currentParam = this.currentParam.slice(0, -1);
            } else if (typeof this.currentParam == 'number') {
              this.currentParam = (this.currentParam - ('\x1b'.charCodeAt(0) - 48)) / 10;
            }
          }

          this.params.push(this.currentParam);

          var pt = this.params[this.params.length - 1];

          switch (this.prefix) {
            // User-Defined Keys (DECUDK).
            // DCS Ps; Ps| Pt ST
            case UDK:
              this.emit('udk', {
                clearAll: this.params[0] === 0,
                eraseBelow: this.params[0] === 1,
                lockKeys: this.params[1] === 0,
                dontLockKeys: this.params[1] === 1,
                keyList: (this.params[2] + '').split(';').map(function(part) {
                  part = part.split('/');
                  return {
                    keyCode: part[0],
                    hexKeyValue: part[1]
                  };
                })
              });
              break;

            // Request Status String (DECRQSS).
            // DCS $ q Pt ST
            // test: echo -e '\eP$q"p\e\\'
            case '$q':
              var valid = 0;

              switch (pt) {
                // DECSCA
                // CSI Ps " q
                case '"q':
                  pt = '0"q';
                  valid = 1;
                  break;

                // DECSCL
                // CSI Ps ; Ps " p
                case '"p':
                  pt = '61;0"p';
                  valid = 1;
                  break;

                // DECSTBM
                // CSI Ps ; Ps r
                case 'r':
                  pt = ''
                    + (this.scrollTop + 1)
                    + ';'
                    + (this.scrollBottom + 1)
                    + 'r';
                  valid = 1;
                  break;

                // SGR
                // CSI Pm m
                case 'm':
                  // TODO: Parse this.curAttr here.
                  // pt = '0m';
                  // valid = 1;
                  valid = 0; // Not implemented.
                  break;

                default:
                  this.error('Unknown DCS Pt: %s.', pt);
                  valid = 0; // unimplemented
                  break;
              }

              this.send('\x1bP' + valid + '$r' + pt + '\x1b\\');
              break;

            // Set Termcap/Terminfo Data (xterm, experimental).
            // DCS + p Pt ST
            case '+p':
              this.emit('set terminfo', {
                name: this.params[0]
              });
              break;

            // Request Termcap/Terminfo String (xterm, experimental)
            // Regular xterm does not even respond to this sequence.
            // This can cause a small glitch in vim.
            // DCS + q Pt ST
            // test: echo -ne '\eP+q6b64\e\\'
            case '+q':
              var valid = false;
              this.send('\x1bP' + +valid + '+r' + pt + '\x1b\\');
              break;

            // Implement tmux sequence forwarding is
            // someone uses term.js for a multiplexer.
            // DCS tmux; ESC Pt ST
            case 'tmux;\x1b':
              this.emit('passthrough', pt);
              break;

            default:
              this.error('Unknown DCS prefix: %s.', pt);
              break;
          }

          this.currentParam = 0;
          this.prefix = '';
          this.state = normal;
        } else {
          this.currentParam += ch;
          if (!this.prefix) {
            if (/^\d*;\d*\|/.test(this.currentParam)) {
              this.prefix = UDK;
              this.params = this.currentParam.split(/[;|]/).map(function(n) {
                if (!n.length) return 0;
                return +n;
              }).slice(0, -1);
              this.currentParam = '';
            } else if (/^[$+][a-zA-Z]/.test(this.currentParam)
                || /^\w+;\x1b/.test(this.currentParam)) {
              this.prefix = this.currentParam;
              this.currentParam = '';
            }
          }
        }
        break;

      case ignore:
        // For PM and APC.
        if ((this.lch === '\x1b' && ch === '\\') || ch === '\x07') {
          this.state = normal;
        }
        break;
    }
  }

  this.updateRange(this.y);
  this.refresh(this.refreshStart, this.refreshEnd);

  return true;
};

Terminal.prototype.writeln = function(data) {
  return this.write(data + '\r\n');
};

Terminal.prototype.end = function(data) {
  var ret = true;
  if (data) {
    ret = this.write(data);
  }
  this.destroySoon();
  return ret;
};

Terminal.prototype.resume = function() {
  ;
};

Terminal.prototype.pause = function() {
  ;
};

// Key Resources:
// https://developer.mozilla.org/en-US/docs/DOM/KeyboardEvent
Terminal.prototype.keyDown = function(ev) {
  var self = this
    , key;

  switch (ev.keyCode) {
    // backspace
    case 8:
      if (ev.altKey) {
        key = '\x17';
        break;
      }
      if (ev.shiftKey) {
        key = '\x08'; // ^H
        break;
      }
      key = '\x7f'; // ^?
      break;
    // tab
    case 9:
      if (ev.shiftKey) {
        key = '\x1b[Z';
        break;
      }
      key = '\t';
      break;
    // return/enter
    case 13:
      key = '\r';
      break;
    // escape
    case 27:
      key = '\x1b';
      break;
    // left-arrow
    case 37:
      if (this.applicationCursor) {
        key = '\x1bOD'; // SS3 as ^[O for 7-bit
        //key = '\x8fD'; // SS3 as 0x8f for 8-bit
        break;
      }
      if (ev.ctrlKey) {
        key = '\x1b[5D';
        break;
      }
      key = '\x1b[D';
      break;
    // right-arrow
    case 39:
      if (this.applicationCursor) {
        key = '\x1bOC';
        break;
      }
      if (ev.ctrlKey) {
        key = '\x1b[5C';
        break;
      }
      key = '\x1b[C';
      break;
    // up-arrow
    case 38:
      if (this.applicationCursor) {
        key = '\x1bOA';
        break;
      }
      if (ev.ctrlKey) {
        this.scrollDisp(-1);
        return cancel(ev);
      } else {
        key = '\x1b[A';
      }
      break;
    // down-arrow
    case 40:
      if (this.applicationCursor) {
        key = '\x1bOB';
        break;
      }
      if (ev.ctrlKey) {
        this.scrollDisp(1);
        return cancel(ev);
      } else {
        key = '\x1b[B';
      }
      break;
    // delete
    case 46:
      key = '\x1b[3~';
      break;
    // insert
    case 45:
      key = '\x1b[2~';
      break;
    // home
    case 36:
      if (this.applicationKeypad) {
        key = '\x1bOH';
        break;
      }
      key = '\x1bOH';
      break;
    // end
    case 35:
      if (this.applicationKeypad) {
        key = '\x1bOF';
        break;
      }
      key = '\x1bOF';
      break;
    // page up
    case 33:
      if (ev.shiftKey) {
        this.scrollDisp(-(this.rows - 1));
        return cancel(ev);
      } else {
        key = '\x1b[5~';
      }
      break;
    // page down
    case 34:
      if (ev.shiftKey) {
        this.scrollDisp(this.rows - 1);
        return cancel(ev);
      } else {
        key = '\x1b[6~';
      }
      break;
    // F1
    case 112:
      key = '\x1bOP';
      break;
    // F2
    case 113:
      key = '\x1bOQ';
      break;
    // F3
    case 114:
      key = '\x1bOR';
      break;
    // F4
    case 115:
      key = '\x1bOS';
      break;
    // F5
    case 116:
      key = '\x1b[15~';
      break;
    // F6
    case 117:
      key = '\x1b[17~';
      break;
    // F7
    case 118:
      key = '\x1b[18~';
      break;
    // F8
    case 119:
      key = '\x1b[19~';
      break;
    // F9
    case 120:
      key = '\x1b[20~';
      break;
    // F10
    case 121:
      key = '\x1b[21~';
      break;
    // F11
    case 122:
      key = '\x1b[23~';
      break;
    // F12
    case 123:
      key = '\x1b[24~';
      break;
    default:
      // a-z and space
      if (ev.ctrlKey) {
        if (ev.keyCode >= 65 && ev.keyCode <= 90) {
          // Ctrl-A
          if (this.screenKeys) {
            if (!this.prefixMode && !this.selectMode && ev.keyCode === 65) {
              this.enterPrefix();
              return cancel(ev);
            }
          }
          // Ctrl-V
          if (this.prefixMode && ev.keyCode === 86) {
            this.leavePrefix();
            return;
          }
          // Ctrl-C
          if ((this.prefixMode || this.selectMode) && ev.keyCode === 67) {
            if (this.visualMode) {
              setTimeout(function() {
                self.leaveVisual();
              }, 1);
            }
            return;
          }
          key = String.fromCharCode(ev.keyCode - 64);
        } else if (ev.keyCode === 32) {
          // NUL
          key = String.fromCharCode(0);
        } else if (ev.keyCode >= 51 && ev.keyCode <= 55) {
          // escape, file sep, group sep, record sep, unit sep
          key = String.fromCharCode(ev.keyCode - 51 + 27);
        } else if (ev.keyCode === 56) {
          // delete
          key = String.fromCharCode(127);
        } else if (ev.keyCode === 219) {
          // ^[ - escape
          key = String.fromCharCode(27);
        } else if (ev.keyCode === 221) {
          // ^] - group sep
          key = String.fromCharCode(29);
        }
      } else if (ev.altKey) {
        if (ev.keyCode >= 65 && ev.keyCode <= 90) {
          key = '\x1b' + String.fromCharCode(ev.keyCode + 32);
        } else if (ev.keyCode === 192) {
          key = '\x1b`';
        } else if (ev.keyCode >= 48 && ev.keyCode <= 57) {
          key = '\x1b' + (ev.keyCode - 48);
        }
      }
      break;
  }

  if (!key) return true;

  if (this.prefixMode) {
    this.leavePrefix();
    return cancel(ev);
  }

  if (this.selectMode) {
    this.keySelect(ev, key);
    return cancel(ev);
  }

  this.emit('keydown', ev);
  this.emit('key', key, ev);

  this.showCursor();
  this.handler(key);

  return cancel(ev);
};

Terminal.prototype.setgLevel = function(g) {
  this.glevel = g;
  this.charset = this.charsets[g];
};

Terminal.prototype.setgCharset = function(g, charset) {
  this.charsets[g] = charset;
  if (this.glevel === g) {
    this.charset = charset;
  }
};

Terminal.prototype.keyPress = function(ev) {
  var key;

  cancel(ev);

  if (ev.charCode) {
    key = ev.charCode;
  } else if (ev.which == null) {
    key = ev.keyCode;
  } else if (ev.which !== 0 && ev.charCode !== 0) {
    key = ev.which;
  } else {
    return false;
  }

  if (!key || ev.ctrlKey || ev.altKey || ev.metaKey) return false;

  key = String.fromCharCode(key);

  if (this.prefixMode) {
    this.leavePrefix();
    this.keyPrefix(ev, key);
    return false;
  }

  if (this.selectMode) {
    this.keySelect(ev, key);
    return false;
  }

  this.emit('keypress', key, ev);
  this.emit('key', key, ev);

  this.showCursor();
  this.handler(key);

  return false;
};

Terminal.prototype.send = function(data) {
  var self = this;

  if (!this.queue) {
    setTimeout(function() {
      self.handler(self.queue);
      self.queue = '';
    }, 1);
  }

  this.queue += data;
};

Terminal.prototype.bell = function() {
  this.emit('bell');
  if (!this.visualBell) return;
  var self = this;
  this.element.style.borderColor = 'white';
  setTimeout(function() {
    self.element.style.borderColor = '';
  }, 10);
  if (this.popOnBell) this.focus();
};

Terminal.prototype.log = function() {
  if (!this.debug) return;
  if (!this.context.console || !this.context.console.log) return;
  var args = Array.prototype.slice.call(arguments);
  this.context.console.log.apply(this.context.console, args);
};

Terminal.prototype.error = function() {
  if (!this.debug) return;
  if (!this.context.console || !this.context.console.error) return;
  var args = Array.prototype.slice.call(arguments);
  this.context.console.error.apply(this.context.console, args);
};

Terminal.prototype.resize = function(x, y) {
  var line
    , el
    , i
    , j
    , ch;

  if (x < 1) x = 1;
  if (y < 1) y = 1;

  // resize cols
  j = this.cols;
  if (j < x) {
    ch = [this.defAttr, ' ']; // does xterm use the default attr?
    i = this.lines.length;
    while (i--) {
      while (this.lines[i].length < x) {
        this.lines[i].push(ch);
      }
    }
  } else if (j > x) {
    i = this.lines.length;
    while (i--) {
      while (this.lines[i].length > x) {
        this.lines[i].pop();
      }
    }
  }
  this.setupStops(j);
  this.cols = x;
  this.columns = x;

  // resize rows
  j = this.rows;
  if (j < y) {
    el = this.element;
    while (j++ < y) {
      if (this.lines.length < y + this.ybase) {
        this.lines.push(this.blankLine());
      }
      if (this.children.length < y) {
        line = this.document.createElement('div');
        el.appendChild(line);
        this.children.push(line);
      }
    }
  } else if (j > y) {
    while (j-- > y) {
      if (this.lines.length > y + this.ybase) {
        this.lines.pop();
      }
      if (this.children.length > y) {
        el = this.children.pop();
        if (!el) continue;
        el.parentNode.removeChild(el);
      }
    }
  }
  this.rows = y;

  // make sure the cursor stays on screen
  if (this.y >= y) this.y = y - 1;
  if (this.x >= x) this.x = x - 1;

  this.scrollTop = 0;
  this.scrollBottom = y - 1;

  this.refresh(0, this.rows - 1);

  // it's a real nightmare trying
  // to resize the original
  // screen buffer. just set it
  // to null for now.
  this.normal = null;

  // Act as though we are a node TTY stream:
  this.emit('resize');
};

Terminal.prototype.updateRange = function(y) {
  if (y < this.refreshStart) this.refreshStart = y;
  if (y > this.refreshEnd) this.refreshEnd = y;
  // if (y > this.refreshEnd) {
  //   this.refreshEnd = y;
  //   if (y > this.rows - 1) {
  //     this.refreshEnd = this.rows - 1;
  //   }
  // }
};

Terminal.prototype.maxRange = function() {
  this.refreshStart = 0;
  this.refreshEnd = this.rows - 1;
};

Terminal.prototype.setupStops = function(i) {
  if (i != null) {
    if (!this.tabs[i]) {
      i = this.prevStop(i);
    }
  } else {
    this.tabs = {};
    i = 0;
  }

  for (; i < this.cols; i += 8) {
    this.tabs[i] = true;
  }
};

Terminal.prototype.prevStop = function(x) {
  if (x == null) x = this.x;
  while (!this.tabs[--x] && x > 0);
  return x >= this.cols
    ? this.cols - 1
    : x < 0 ? 0 : x;
};

Terminal.prototype.nextStop = function(x) {
  if (x == null) x = this.x;
  while (!this.tabs[++x] && x < this.cols);
  return x >= this.cols
    ? this.cols - 1
    : x < 0 ? 0 : x;
};

// back_color_erase feature for xterm.
Terminal.prototype.eraseAttr = function() {
  // if (this.is('screen')) return this.defAttr;
  return (this.defAttr & ~0x1ff) | (this.curAttr & 0x1ff);
};

Terminal.prototype.eraseRight = function(x, y) {
  var line = this.lines[this.ybase + y]
    , ch = [this.eraseAttr(), ' ']; // xterm


  for (; x < this.cols; x++) {
    line[x] = ch;
  }

  this.updateRange(y);
};

Terminal.prototype.eraseLeft = function(x, y) {
  var line = this.lines[this.ybase + y]
    , ch = [this.eraseAttr(), ' ']; // xterm

  x++;
  while (x--) line[x] = ch;

  this.updateRange(y);
};

Terminal.prototype.eraseLine = function(y) {
  this.eraseRight(0, y);
};

Terminal.prototype.blankLine = function(cur) {
  var attr = cur
    ? this.eraseAttr()
    : this.defAttr;

  var ch = [attr, ' ']
    , line = []
    , i = 0;

  for (; i < this.cols; i++) {
    line[i] = ch;
  }

  return line;
};

Terminal.prototype.ch = function(cur) {
  return cur
    ? [this.eraseAttr(), ' ']
    : [this.defAttr, ' '];
};

Terminal.prototype.is = function(term) {
  var name = this.termName;
  return (name + '').indexOf(term) === 0;
};

Terminal.prototype.handler = function(data) {
  this.emit('data', data);
};

Terminal.prototype.handleTitle = function(title) {
  this.emit('title', title);
};

/**
 * ESC
 */

// ESC D Index (IND is 0x84).
Terminal.prototype.index = function() {
  this.y++;
  if (this.y > this.scrollBottom) {
    this.y--;
    this.scroll();
  }
  this.state = normal;
};

// ESC M Reverse Index (RI is 0x8d).
Terminal.prototype.reverseIndex = function() {
  var j;
  this.y--;
  if (this.y < this.scrollTop) {
    this.y++;
    // possibly move the code below to term.reverseScroll();
    // test: echo -ne '\e[1;1H\e[44m\eM\e[0m'
    // blankLine(true) is xterm/linux behavior
    this.lines.splice(this.y + this.ybase, 0, this.blankLine(true));
    j = this.rows - 1 - this.scrollBottom;
    this.lines.splice(this.rows - 1 + this.ybase - j + 1, 1);
    // this.maxRange();
    this.updateRange(this.scrollTop);
    this.updateRange(this.scrollBottom);
  }
  this.state = normal;
};

// ESC c Full Reset (RIS).
Terminal.prototype.reset = function() {
  this.options.rows = this.rows;
  this.options.cols = this.cols;
  Terminal.call(this, this.options);
  this.refresh(0, this.rows - 1);
};

// ESC H Tab Set (HTS is 0x88).
Terminal.prototype.tabSet = function() {
  this.tabs[this.x] = true;
  this.state = normal;
};

/**
 * CSI
 */

// CSI Ps A
// Cursor Up Ps Times (default = 1) (CUU).
Terminal.prototype.cursorUp = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.y -= param;
  if (this.y < 0) this.y = 0;
};

// CSI Ps B
// Cursor Down Ps Times (default = 1) (CUD).
Terminal.prototype.cursorDown = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.y += param;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
};

// CSI Ps C
// Cursor Forward Ps Times (default = 1) (CUF).
Terminal.prototype.cursorForward = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.x += param;
  if (this.x >= this.cols) {
    this.x = this.cols - 1;
  }
};

// CSI Ps D
// Cursor Backward Ps Times (default = 1) (CUB).
Terminal.prototype.cursorBackward = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.x -= param;
  if (this.x < 0) this.x = 0;
};

// CSI Ps ; Ps H
// Cursor Position [row;column] (default = [1,1]) (CUP).
Terminal.prototype.cursorPos = function(params) {
  var row, col;

  row = params[0] - 1;

  if (params.length >= 2) {
    col = params[1] - 1;
  } else {
    col = 0;
  }

  if (row < 0) {
    row = 0;
  } else if (row >= this.rows) {
    row = this.rows - 1;
  }

  if (col < 0) {
    col = 0;
  } else if (col >= this.cols) {
    col = this.cols - 1;
  }

  this.x = col;
  this.y = row;
};

// CSI Ps J  Erase in Display (ED).
//     Ps = 0  -> Erase Below (default).
//     Ps = 1  -> Erase Above.
//     Ps = 2  -> Erase All.
//     Ps = 3  -> Erase Saved Lines (xterm).
// CSI ? Ps J
//   Erase in Display (DECSED).
//     Ps = 0  -> Selective Erase Below (default).
//     Ps = 1  -> Selective Erase Above.
//     Ps = 2  -> Selective Erase All.
Terminal.prototype.eraseInDisplay = function(params) {
  var j;
  switch (params[0]) {
    case 0:
      this.eraseRight(this.x, this.y);
      j = this.y + 1;
      for (; j < this.rows; j++) {
        this.eraseLine(j);
      }
      break;
    case 1:
      this.eraseLeft(this.x, this.y);
      j = this.y;
      while (j--) {
        this.eraseLine(j);
      }
      break;
    case 2:
      j = this.rows;
      while (j--) this.eraseLine(j);
      break;
    case 3:
      ; // no saved lines
      break;
  }
};

// CSI Ps K  Erase in Line (EL).
//     Ps = 0  -> Erase to Right (default).
//     Ps = 1  -> Erase to Left.
//     Ps = 2  -> Erase All.
// CSI ? Ps K
//   Erase in Line (DECSEL).
//     Ps = 0  -> Selective Erase to Right (default).
//     Ps = 1  -> Selective Erase to Left.
//     Ps = 2  -> Selective Erase All.
Terminal.prototype.eraseInLine = function(params) {
  switch (params[0]) {
    case 0:
      this.eraseRight(this.x, this.y);
      break;
    case 1:
      this.eraseLeft(this.x, this.y);
      break;
    case 2:
      this.eraseLine(this.y);
      break;
  }
};

// CSI Pm m  Character Attributes (SGR).
//     Ps = 0  -> Normal (default).
//     Ps = 1  -> Bold.
//     Ps = 4  -> Underlined.
//     Ps = 5  -> Blink (appears as Bold).
//     Ps = 7  -> Inverse.
//     Ps = 8  -> Invisible, i.e., hidden (VT300).
//     Ps = 2 2  -> Normal (neither bold nor faint).
//     Ps = 2 4  -> Not underlined.
//     Ps = 2 5  -> Steady (not blinking).
//     Ps = 2 7  -> Positive (not inverse).
//     Ps = 2 8  -> Visible, i.e., not hidden (VT300).
//     Ps = 3 0  -> Set foreground color to Black.
//     Ps = 3 1  -> Set foreground color to Red.
//     Ps = 3 2  -> Set foreground color to Green.
//     Ps = 3 3  -> Set foreground color to Yellow.
//     Ps = 3 4  -> Set foreground color to Blue.
//     Ps = 3 5  -> Set foreground color to Magenta.
//     Ps = 3 6  -> Set foreground color to Cyan.
//     Ps = 3 7  -> Set foreground color to White.
//     Ps = 3 9  -> Set foreground color to default (original).
//     Ps = 4 0  -> Set background color to Black.
//     Ps = 4 1  -> Set background color to Red.
//     Ps = 4 2  -> Set background color to Green.
//     Ps = 4 3  -> Set background color to Yellow.
//     Ps = 4 4  -> Set background color to Blue.
//     Ps = 4 5  -> Set background color to Magenta.
//     Ps = 4 6  -> Set background color to Cyan.
//     Ps = 4 7  -> Set background color to White.
//     Ps = 4 9  -> Set background color to default (original).

//   If 16-color support is compiled, the following apply.  Assume
//   that xterm's resources are set so that the ISO color codes are
//   the first 8 of a set of 16.  Then the aixterm colors are the
//   bright versions of the ISO colors:
//     Ps = 9 0  -> Set foreground color to Black.
//     Ps = 9 1  -> Set foreground color to Red.
//     Ps = 9 2  -> Set foreground color to Green.
//     Ps = 9 3  -> Set foreground color to Yellow.
//     Ps = 9 4  -> Set foreground color to Blue.
//     Ps = 9 5  -> Set foreground color to Magenta.
//     Ps = 9 6  -> Set foreground color to Cyan.
//     Ps = 9 7  -> Set foreground color to White.
//     Ps = 1 0 0  -> Set background color to Black.
//     Ps = 1 0 1  -> Set background color to Red.
//     Ps = 1 0 2  -> Set background color to Green.
//     Ps = 1 0 3  -> Set background color to Yellow.
//     Ps = 1 0 4  -> Set background color to Blue.
//     Ps = 1 0 5  -> Set background color to Magenta.
//     Ps = 1 0 6  -> Set background color to Cyan.
//     Ps = 1 0 7  -> Set background color to White.

//   If xterm is compiled with the 16-color support disabled, it
//   supports the following, from rxvt:
//     Ps = 1 0 0  -> Set foreground and background color to
//     default.

//   If 88- or 256-color support is compiled, the following apply.
//     Ps = 3 8  ; 5  ; Ps -> Set foreground color to the second
//     Ps.
//     Ps = 4 8  ; 5  ; Ps -> Set background color to the second
//     Ps.
Terminal.prototype.charAttributes = function(params) {
  // Optimize a single SGR0.
  if (params.length === 1 && params[0] === 0) {
    this.curAttr = this.defAttr;
    return;
  }

  var l = params.length
    , i = 0
    , flags = this.curAttr >> 18
    , fg = (this.curAttr >> 9) & 0x1ff
    , bg = this.curAttr & 0x1ff
    , p;

  for (; i < l; i++) {
    p = params[i];
    if (p >= 30 && p <= 37) {
      // fg color 8
      fg = p - 30;
    } else if (p >= 40 && p <= 47) {
      // bg color 8
      bg = p - 40;
    } else if (p >= 90 && p <= 97) {
      // fg color 16
      p += 8;
      fg = p - 90;
    } else if (p >= 100 && p <= 107) {
      // bg color 16
      p += 8;
      bg = p - 100;
    } else if (p === 0) {
      // default
      flags = this.defAttr >> 18;
      fg = (this.defAttr >> 9) & 0x1ff;
      bg = this.defAttr & 0x1ff;
      // flags = 0;
      // fg = 0x1ff;
      // bg = 0x1ff;
    } else if (p === 1) {
      // bold text
      flags |= 1;
    } else if (p === 4) {
      // underlined text
      flags |= 2;
    } else if (p === 5) {
      // blink
      flags |= 4;
    } else if (p === 7) {
      // inverse and positive
      // test with: echo -e '\e[31m\e[42mhello\e[7mworld\e[27mhi\e[m'
      flags |= 8;
    } else if (p === 8) {
      // invisible
      flags |= 16;
    } else if (p === 22) {
      // not bold
      flags &= ~1;
    } else if (p === 24) {
      // not underlined
      flags &= ~2;
    } else if (p === 25) {
      // not blink
      flags &= ~4;
    } else if (p === 27) {
      // not inverse
      flags &= ~8;
    } else if (p === 28) {
      // not invisible
      flags &= ~16;
    } else if (p === 39) {
      // reset fg
      fg = (this.defAttr >> 9) & 0x1ff;
    } else if (p === 49) {
      // reset bg
      bg = this.defAttr & 0x1ff;
    } else if (p === 38) {
      // fg color 256
      if (params[i + 1] === 2) {
        i += 2;
        fg = matchColor(
          params[i] & 0xff,
          params[i + 1] & 0xff,
          params[i + 2] & 0xff);
        if (fg === -1) fg = 0x1ff;
        i += 2;
      } else if (params[i + 1] === 5) {
        i += 2;
        p = params[i] & 0xff;
        fg = p;
      }
    } else if (p === 48) {
      // bg color 256
      if (params[i + 1] === 2) {
        i += 2;
        bg = matchColor(
          params[i] & 0xff,
          params[i + 1] & 0xff,
          params[i + 2] & 0xff);
        if (bg === -1) bg = 0x1ff;
        i += 2;
      } else if (params[i + 1] === 5) {
        i += 2;
        p = params[i] & 0xff;
        bg = p;
      }
    } else if (p === 100) {
      // reset fg/bg
      fg = (this.defAttr >> 9) & 0x1ff;
      bg = this.defAttr & 0x1ff;
    } else {
      this.error('Unknown SGR attribute: %d.', p);
    }
  }

  this.curAttr = (flags << 18) | (fg << 9) | bg;
};

// CSI Ps n  Device Status Report (DSR).
//     Ps = 5  -> Status Report.  Result (``OK'') is
//   CSI 0 n
//     Ps = 6  -> Report Cursor Position (CPR) [row;column].
//   Result is
//   CSI r ; c R
// CSI ? Ps n
//   Device Status Report (DSR, DEC-specific).
//     Ps = 6  -> Report Cursor Position (CPR) [row;column] as CSI
//     ? r ; c R (assumes page is zero).
//     Ps = 1 5  -> Report Printer status as CSI ? 1 0  n  (ready).
//     or CSI ? 1 1  n  (not ready).
//     Ps = 2 5  -> Report UDK status as CSI ? 2 0  n  (unlocked)
//     or CSI ? 2 1  n  (locked).
//     Ps = 2 6  -> Report Keyboard status as
//   CSI ? 2 7  ;  1  ;  0  ;  0  n  (North American).
//   The last two parameters apply to VT400 & up, and denote key-
//   board ready and LK01 respectively.
//     Ps = 5 3  -> Report Locator status as
//   CSI ? 5 3  n  Locator available, if compiled-in, or
//   CSI ? 5 0  n  No Locator, if not.
Terminal.prototype.deviceStatus = function(params) {
  if (!this.prefix) {
    switch (params[0]) {
      case 5:
        // status report
        this.send('\x1b[0n');
        break;
      case 6:
        // cursor position
        this.send('\x1b['
          + (this.y + 1)
          + ';'
          + (this.x + 1)
          + 'R');
        break;
    }
  } else if (this.prefix === '?') {
    // modern xterm doesnt seem to
    // respond to any of these except ?6, 6, and 5
    switch (params[0]) {
      case 6:
        // cursor position
        this.send('\x1b[?'
          + (this.y + 1)
          + ';'
          + (this.x + 1)
          + 'R');
        break;
      case 15:
        // no printer
        // this.send('\x1b[?11n');
        break;
      case 25:
        // dont support user defined keys
        // this.send('\x1b[?21n');
        break;
      case 26:
        // north american keyboard
        // this.send('\x1b[?27;1;0;0n');
        break;
      case 53:
        // no dec locator/mouse
        // this.send('\x1b[?50n');
        break;
    }
  }
};

/**
 * Additions
 */

// CSI Ps @
// Insert Ps (Blank) Character(s) (default = 1) (ICH).
Terminal.prototype.insertChars = function(params) {
  var param, row, j, ch;

  param = params[0];
  if (param < 1) param = 1;

  row = this.y + this.ybase;
  j = this.x;
  ch = [this.eraseAttr(), ' ']; // xterm

  while (param-- && j < this.cols) {
    this.lines[row].splice(j++, 0, ch);
    this.lines[row].pop();
  }
};

// CSI Ps E
// Cursor Next Line Ps Times (default = 1) (CNL).
// same as CSI Ps B ?
Terminal.prototype.cursorNextLine = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.y += param;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
  this.x = 0;
};

// CSI Ps F
// Cursor Preceding Line Ps Times (default = 1) (CNL).
// reuse CSI Ps A ?
Terminal.prototype.cursorPrecedingLine = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.y -= param;
  if (this.y < 0) this.y = 0;
  this.x = 0;
};

// CSI Ps G
// Cursor Character Absolute  [column] (default = [row,1]) (CHA).
Terminal.prototype.cursorCharAbsolute = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.x = param - 1;
};

// CSI Ps L
// Insert Ps Line(s) (default = 1) (IL).
Terminal.prototype.insertLines = function(params) {
  var param, row, j;

  param = params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;

  j = this.rows - 1 - this.scrollBottom;
  j = this.rows - 1 + this.ybase - j + 1;

  while (param--) {
    // test: echo -e '\e[44m\e[1L\e[0m'
    // blankLine(true) - xterm/linux behavior
    this.lines.splice(row, 0, this.blankLine(true));
    this.lines.splice(j, 1);
  }

  // this.maxRange();
  this.updateRange(this.y);
  this.updateRange(this.scrollBottom);
};

// CSI Ps M
// Delete Ps Line(s) (default = 1) (DL).
Terminal.prototype.deleteLines = function(params) {
  var param, row, j;

  param = params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;

  j = this.rows - 1 - this.scrollBottom;
  j = this.rows - 1 + this.ybase - j;

  while (param--) {
    // test: echo -e '\e[44m\e[1M\e[0m'
    // blankLine(true) - xterm/linux behavior
    this.lines.splice(j + 1, 0, this.blankLine(true));
    this.lines.splice(row, 1);
  }

  // this.maxRange();
  this.updateRange(this.y);
  this.updateRange(this.scrollBottom);
};

// CSI Ps P
// Delete Ps Character(s) (default = 1) (DCH).
Terminal.prototype.deleteChars = function(params) {
  var param, row, ch;

  param = params[0];
  if (param < 1) param = 1;

  row = this.y + this.ybase;
  ch = [this.eraseAttr(), ' ']; // xterm

  while (param--) {
    this.lines[row].splice(this.x, 1);
    this.lines[row].push(ch);
  }
};

// CSI Ps X
// Erase Ps Character(s) (default = 1) (ECH).
Terminal.prototype.eraseChars = function(params) {
  var param, row, j, ch;

  param = params[0];
  if (param < 1) param = 1;

  row = this.y + this.ybase;
  j = this.x;
  ch = [this.eraseAttr(), ' ']; // xterm

  while (param-- && j < this.cols) {
    this.lines[row][j++] = ch;
  }
};

// CSI Pm `  Character Position Absolute
//   [column] (default = [row,1]) (HPA).
Terminal.prototype.charPosAbsolute = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.x = param - 1;
  if (this.x >= this.cols) {
    this.x = this.cols - 1;
  }
};

// 141 61 a * HPR -
// Horizontal Position Relative
// reuse CSI Ps C ?
Terminal.prototype.HPositionRelative = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.x += param;
  if (this.x >= this.cols) {
    this.x = this.cols - 1;
  }
};

// CSI Ps c  Send Device Attributes (Primary DA).
//     Ps = 0  or omitted -> request attributes from terminal.  The
//     response depends on the decTerminalID resource setting.
//     -> CSI ? 1 ; 2 c  (``VT100 with Advanced Video Option'')
//     -> CSI ? 1 ; 0 c  (``VT101 with No Options'')
//     -> CSI ? 6 c  (``VT102'')
//     -> CSI ? 6 0 ; 1 ; 2 ; 6 ; 8 ; 9 ; 1 5 ; c  (``VT220'')
//   The VT100-style response parameters do not mean anything by
//   themselves.  VT220 parameters do, telling the host what fea-
//   tures the terminal supports:
//     Ps = 1  -> 132-columns.
//     Ps = 2  -> Printer.
//     Ps = 6  -> Selective erase.
//     Ps = 8  -> User-defined keys.
//     Ps = 9  -> National replacement character sets.
//     Ps = 1 5  -> Technical characters.
//     Ps = 2 2  -> ANSI color, e.g., VT525.
//     Ps = 2 9  -> ANSI text locator (i.e., DEC Locator mode).
// CSI > Ps c
//   Send Device Attributes (Secondary DA).
//     Ps = 0  or omitted -> request the terminal's identification
//     code.  The response depends on the decTerminalID resource set-
//     ting.  It should apply only to VT220 and up, but xterm extends
//     this to VT100.
//     -> CSI  > Pp ; Pv ; Pc c
//   where Pp denotes the terminal type
//     Pp = 0  -> ``VT100''.
//     Pp = 1  -> ``VT220''.
//   and Pv is the firmware version (for xterm, this was originally
//   the XFree86 patch number, starting with 95).  In a DEC termi-
//   nal, Pc indicates the ROM cartridge registration number and is
//   always zero.
// More information:
//   xterm/charproc.c - line 2012, for more information.
//   vim responds with ^[[?0c or ^[[?1c after the terminal's response (?)
Terminal.prototype.sendDeviceAttributes = function(params) {
  if (params[0] > 0) return;

  if (!this.prefix) {
    if (this.is('xterm')
        || this.is('rxvt-unicode')
        || this.is('screen')) {
      this.send('\x1b[?1;2c');
    } else if (this.is('linux')) {
      this.send('\x1b[?6c');
    }
  } else if (this.prefix === '>') {
    // xterm and urxvt
    // seem to spit this
    // out around ~370 times (?).
    if (this.is('xterm')) {
      this.send('\x1b[>0;276;0c');
    } else if (this.is('rxvt-unicode')) {
      this.send('\x1b[>85;95;0c');
    } else if (this.is('linux')) {
      // not supported by linux console.
      // linux console echoes parameters.
      this.send(params[0] + 'c');
    } else if (this.is('screen')) {
      this.send('\x1b[>83;40003;0c');
    }
  }
};

// CSI Pm d
// Line Position Absolute  [row] (default = [1,column]) (VPA).
Terminal.prototype.linePosAbsolute = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.y = param - 1;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
};

// 145 65 e * VPR - Vertical Position Relative
// reuse CSI Ps B ?
Terminal.prototype.VPositionRelative = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.y += param;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
};

// CSI Ps ; Ps f
//   Horizontal and Vertical Position [row;column] (default =
//   [1,1]) (HVP).
Terminal.prototype.HVPosition = function(params) {
  if (params[0] < 1) params[0] = 1;
  if (params[1] < 1) params[1] = 1;

  this.y = params[0] - 1;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }

  this.x = params[1] - 1;
  if (this.x >= this.cols) {
    this.x = this.cols - 1;
  }
};

// CSI Pm h  Set Mode (SM).
//     Ps = 2  -> Keyboard Action Mode (AM).
//     Ps = 4  -> Insert Mode (IRM).
//     Ps = 1 2  -> Send/receive (SRM).
//     Ps = 2 0  -> Automatic Newline (LNM).
// CSI ? Pm h
//   DEC Private Mode Set (DECSET).
//     Ps = 1  -> Application Cursor Keys (DECCKM).
//     Ps = 2  -> Designate USASCII for character sets G0-G3
//     (DECANM), and set VT100 mode.
//     Ps = 3  -> 132 Column Mode (DECCOLM).
//     Ps = 4  -> Smooth (Slow) Scroll (DECSCLM).
//     Ps = 5  -> Reverse Video (DECSCNM).
//     Ps = 6  -> Origin Mode (DECOM).
//     Ps = 7  -> Wraparound Mode (DECAWM).
//     Ps = 8  -> Auto-repeat Keys (DECARM).
//     Ps = 9  -> Send Mouse X & Y on button press.  See the sec-
//     tion Mouse Tracking.
//     Ps = 1 0  -> Show toolbar (rxvt).
//     Ps = 1 2  -> Start Blinking Cursor (att610).
//     Ps = 1 8  -> Print form feed (DECPFF).
//     Ps = 1 9  -> Set print extent to full screen (DECPEX).
//     Ps = 2 5  -> Show Cursor (DECTCEM).
//     Ps = 3 0  -> Show scrollbar (rxvt).
//     Ps = 3 5  -> Enable font-shifting functions (rxvt).
//     Ps = 3 8  -> Enter Tektronix Mode (DECTEK).
//     Ps = 4 0  -> Allow 80 -> 132 Mode.
//     Ps = 4 1  -> more(1) fix (see curses resource).
//     Ps = 4 2  -> Enable Nation Replacement Character sets (DECN-
//     RCM).
//     Ps = 4 4  -> Turn On Margin Bell.
//     Ps = 4 5  -> Reverse-wraparound Mode.
//     Ps = 4 6  -> Start Logging.  This is normally disabled by a
//     compile-time option.
//     Ps = 4 7  -> Use Alternate Screen Buffer.  (This may be dis-
//     abled by the titeInhibit resource).
//     Ps = 6 6  -> Application keypad (DECNKM).
//     Ps = 6 7  -> Backarrow key sends backspace (DECBKM).
//     Ps = 1 0 0 0  -> Send Mouse X & Y on button press and
//     release.  See the section Mouse Tracking.
//     Ps = 1 0 0 1  -> Use Hilite Mouse Tracking.
//     Ps = 1 0 0 2  -> Use Cell Motion Mouse Tracking.
//     Ps = 1 0 0 3  -> Use All Motion Mouse Tracking.
//     Ps = 1 0 0 4  -> Send FocusIn/FocusOut events.
//     Ps = 1 0 0 5  -> Enable Extended Mouse Mode.
//     Ps = 1 0 1 0  -> Scroll to bottom on tty output (rxvt).
//     Ps = 1 0 1 1  -> Scroll to bottom on key press (rxvt).
//     Ps = 1 0 3 4  -> Interpret "meta" key, sets eighth bit.
//     (enables the eightBitInput resource).
//     Ps = 1 0 3 5  -> Enable special modifiers for Alt and Num-
//     Lock keys.  (This enables the numLock resource).
//     Ps = 1 0 3 6  -> Send ESC   when Meta modifies a key.  (This
//     enables the metaSendsEscape resource).
//     Ps = 1 0 3 7  -> Send DEL from the editing-keypad Delete
//     key.
//     Ps = 1 0 3 9  -> Send ESC  when Alt modifies a key.  (This
//     enables the altSendsEscape resource).
//     Ps = 1 0 4 0  -> Keep selection even if not highlighted.
//     (This enables the keepSelection resource).
//     Ps = 1 0 4 1  -> Use the CLIPBOARD selection.  (This enables
//     the selectToClipboard resource).
//     Ps = 1 0 4 2  -> Enable Urgency window manager hint when
//     Control-G is received.  (This enables the bellIsUrgent
//     resource).
//     Ps = 1 0 4 3  -> Enable raising of the window when Control-G
//     is received.  (enables the popOnBell resource).
//     Ps = 1 0 4 7  -> Use Alternate Screen Buffer.  (This may be
//     disabled by the titeInhibit resource).
//     Ps = 1 0 4 8  -> Save cursor as in DECSC.  (This may be dis-
//     abled by the titeInhibit resource).
//     Ps = 1 0 4 9  -> Save cursor as in DECSC and use Alternate
//     Screen Buffer, clearing it first.  (This may be disabled by
//     the titeInhibit resource).  This combines the effects of the 1
//     0 4 7  and 1 0 4 8  modes.  Use this with terminfo-based
//     applications rather than the 4 7  mode.
//     Ps = 1 0 5 0  -> Set terminfo/termcap function-key mode.
//     Ps = 1 0 5 1  -> Set Sun function-key mode.
//     Ps = 1 0 5 2  -> Set HP function-key mode.
//     Ps = 1 0 5 3  -> Set SCO function-key mode.
//     Ps = 1 0 6 0  -> Set legacy keyboard emulation (X11R6).
//     Ps = 1 0 6 1  -> Set VT220 keyboard emulation.
//     Ps = 2 0 0 4  -> Set bracketed paste mode.
// Modes:
//   http://vt100.net/docs/vt220-rm/chapter4.html
Terminal.prototype.setMode = function(params) {
  if (typeof params === 'object') {
    var l = params.length
      , i = 0;

    for (; i < l; i++) {
      this.setMode(params[i]);
    }

    return;
  }

  if (!this.prefix) {
    switch (params) {
      case 4:
        this.insertMode = true;
        break;
      case 20:
        //this.convertEol = true;
        break;
    }
  } else if (this.prefix === '?') {
    switch (params) {
      case 1:
        this.applicationCursor = true;
        break;
      case 2:
        this.setgCharset(0, Terminal.charsets.US);
        this.setgCharset(1, Terminal.charsets.US);
        this.setgCharset(2, Terminal.charsets.US);
        this.setgCharset(3, Terminal.charsets.US);
        // set VT100 mode here
        break;
      case 3: // 132 col mode
        this.savedCols = this.cols;
        this.resize(132, this.rows);
        break;
      case 6:
        this.originMode = true;
        break;
      case 7:
        this.wraparoundMode = true;
        break;
      case 12:
        // this.cursorBlink = true;
        break;
      case 66:
        this.log('Serial port requested application keypad.');
        this.applicationKeypad = true;
        break;
      case 9: // X10 Mouse
        // no release, no motion, no wheel, no modifiers.
      case 1000: // vt200 mouse
        // no motion.
        // no modifiers, except control on the wheel.
      case 1002: // button event mouse
      case 1003: // any event mouse
        // any event - sends motion events,
        // even if there is no button held down.
        this.x10Mouse = params === 9;
        this.vt200Mouse = params === 1000;
        this.normalMouse = params > 1000;
        this.mouseEvents = true;
        this.element.style.cursor = 'default';
        this.log('Binding to mouse events.');
        break;
      case 1004: // send focusin/focusout events
        // focusin: ^[[I
        // focusout: ^[[O
        this.sendFocus = true;
        break;
      case 1005: // utf8 ext mode mouse
        this.utfMouse = true;
        // for wide terminals
        // simply encodes large values as utf8 characters
        break;
      case 1006: // sgr ext mode mouse
        this.sgrMouse = true;
        // for wide terminals
        // does not add 32 to fields
        // press: ^[[<b;x;yM
        // release: ^[[<b;x;ym
        break;
      case 1015: // urxvt ext mode mouse
        this.urxvtMouse = true;
        // for wide terminals
        // numbers for fields
        // press: ^[[b;x;yM
        // motion: ^[[b;x;yT
        break;
      case 25: // show cursor
        this.cursorHidden = false;
        break;
      case 1049: // alt screen buffer cursor
        //this.saveCursor();
        ; // FALL-THROUGH
      case 47: // alt screen buffer
      case 1047: // alt screen buffer
        if (!this.normal) {
          var normal = {
            lines: this.lines,
            ybase: this.ybase,
            ydisp: this.ydisp,
            x: this.x,
            y: this.y,
            scrollTop: this.scrollTop,
            scrollBottom: this.scrollBottom,
            tabs: this.tabs
            // XXX save charset(s) here?
            // charset: this.charset,
            // glevel: this.glevel,
            // charsets: this.charsets
          };
          this.reset();
          this.normal = normal;
          this.showCursor();
        }
        break;
    }
  }
};

// CSI Pm l  Reset Mode (RM).
//     Ps = 2  -> Keyboard Action Mode (AM).
//     Ps = 4  -> Replace Mode (IRM).
//     Ps = 1 2  -> Send/receive (SRM).
//     Ps = 2 0  -> Normal Linefeed (LNM).
// CSI ? Pm l
//   DEC Private Mode Reset (DECRST).
//     Ps = 1  -> Normal Cursor Keys (DECCKM).
//     Ps = 2  -> Designate VT52 mode (DECANM).
//     Ps = 3  -> 80 Column Mode (DECCOLM).
//     Ps = 4  -> Jump (Fast) Scroll (DECSCLM).
//     Ps = 5  -> Normal Video (DECSCNM).
//     Ps = 6  -> Normal Cursor Mode (DECOM).
//     Ps = 7  -> No Wraparound Mode (DECAWM).
//     Ps = 8  -> No Auto-repeat Keys (DECARM).
//     Ps = 9  -> Don't send Mouse X & Y on button press.
//     Ps = 1 0  -> Hide toolbar (rxvt).
//     Ps = 1 2  -> Stop Blinking Cursor (att610).
//     Ps = 1 8  -> Don't print form feed (DECPFF).
//     Ps = 1 9  -> Limit print to scrolling region (DECPEX).
//     Ps = 2 5  -> Hide Cursor (DECTCEM).
//     Ps = 3 0  -> Don't show scrollbar (rxvt).
//     Ps = 3 5  -> Disable font-shifting functions (rxvt).
//     Ps = 4 0  -> Disallow 80 -> 132 Mode.
//     Ps = 4 1  -> No more(1) fix (see curses resource).
//     Ps = 4 2  -> Disable Nation Replacement Character sets (DEC-
//     NRCM).
//     Ps = 4 4  -> Turn Off Margin Bell.
//     Ps = 4 5  -> No Reverse-wraparound Mode.
//     Ps = 4 6  -> Stop Logging.  (This is normally disabled by a
//     compile-time option).
//     Ps = 4 7  -> Use Normal Screen Buffer.
//     Ps = 6 6  -> Numeric keypad (DECNKM).
//     Ps = 6 7  -> Backarrow key sends delete (DECBKM).
//     Ps = 1 0 0 0  -> Don't send Mouse X & Y on button press and
//     release.  See the section Mouse Tracking.
//     Ps = 1 0 0 1  -> Don't use Hilite Mouse Tracking.
//     Ps = 1 0 0 2  -> Don't use Cell Motion Mouse Tracking.
//     Ps = 1 0 0 3  -> Don't use All Motion Mouse Tracking.
//     Ps = 1 0 0 4  -> Don't send FocusIn/FocusOut events.
//     Ps = 1 0 0 5  -> Disable Extended Mouse Mode.
//     Ps = 1 0 1 0  -> Don't scroll to bottom on tty output
//     (rxvt).
//     Ps = 1 0 1 1  -> Don't scroll to bottom on key press (rxvt).
//     Ps = 1 0 3 4  -> Don't interpret "meta" key.  (This disables
//     the eightBitInput resource).
//     Ps = 1 0 3 5  -> Disable special modifiers for Alt and Num-
//     Lock keys.  (This disables the numLock resource).
//     Ps = 1 0 3 6  -> Don't send ESC  when Meta modifies a key.
//     (This disables the metaSendsEscape resource).
//     Ps = 1 0 3 7  -> Send VT220 Remove from the editing-keypad
//     Delete key.
//     Ps = 1 0 3 9  -> Don't send ESC  when Alt modifies a key.
//     (This disables the altSendsEscape resource).
//     Ps = 1 0 4 0  -> Do not keep selection when not highlighted.
//     (This disables the keepSelection resource).
//     Ps = 1 0 4 1  -> Use the PRIMARY selection.  (This disables
//     the selectToClipboard resource).
//     Ps = 1 0 4 2  -> Disable Urgency window manager hint when
//     Control-G is received.  (This disables the bellIsUrgent
//     resource).
//     Ps = 1 0 4 3  -> Disable raising of the window when Control-
//     G is received.  (This disables the popOnBell resource).
//     Ps = 1 0 4 7  -> Use Normal Screen Buffer, clearing screen
//     first if in the Alternate Screen.  (This may be disabled by
//     the titeInhibit resource).
//     Ps = 1 0 4 8  -> Restore cursor as in DECRC.  (This may be
//     disabled by the titeInhibit resource).
//     Ps = 1 0 4 9  -> Use Normal Screen Buffer and restore cursor
//     as in DECRC.  (This may be disabled by the titeInhibit
//     resource).  This combines the effects of the 1 0 4 7  and 1 0
//     4 8  modes.  Use this with terminfo-based applications rather
//     than the 4 7  mode.
//     Ps = 1 0 5 0  -> Reset terminfo/termcap function-key mode.
//     Ps = 1 0 5 1  -> Reset Sun function-key mode.
//     Ps = 1 0 5 2  -> Reset HP function-key mode.
//     Ps = 1 0 5 3  -> Reset SCO function-key mode.
//     Ps = 1 0 6 0  -> Reset legacy keyboard emulation (X11R6).
//     Ps = 1 0 6 1  -> Reset keyboard emulation to Sun/PC style.
//     Ps = 2 0 0 4  -> Reset bracketed paste mode.
Terminal.prototype.resetMode = function(params) {
  if (typeof params === 'object') {
    var l = params.length
      , i = 0;

    for (; i < l; i++) {
      this.resetMode(params[i]);
    }

    return;
  }

  if (!this.prefix) {
    switch (params) {
      case 4:
        this.insertMode = false;
        break;
      case 20:
        //this.convertEol = false;
        break;
    }
  } else if (this.prefix === '?') {
    switch (params) {
      case 1:
        this.applicationCursor = false;
        break;
      case 3:
        if (this.cols === 132 && this.savedCols) {
          this.resize(this.savedCols, this.rows);
        }
        delete this.savedCols;
        break;
      case 6:
        this.originMode = false;
        break;
      case 7:
        this.wraparoundMode = false;
        break;
      case 12:
        // this.cursorBlink = false;
        break;
      case 66:
        this.log('Switching back to normal keypad.');
        this.applicationKeypad = false;
        break;
      case 9: // X10 Mouse
      case 1000: // vt200 mouse
      case 1002: // button event mouse
      case 1003: // any event mouse
        this.x10Mouse = false;
        this.vt200Mouse = false;
        this.normalMouse = false;
        this.mouseEvents = false;
        this.element.style.cursor = '';
        break;
      case 1004: // send focusin/focusout events
        this.sendFocus = false;
        break;
      case 1005: // utf8 ext mode mouse
        this.utfMouse = false;
        break;
      case 1006: // sgr ext mode mouse
        this.sgrMouse = false;
        break;
      case 1015: // urxvt ext mode mouse
        this.urxvtMouse = false;
        break;
      case 25: // hide cursor
        this.cursorHidden = true;
        break;
      case 1049: // alt screen buffer cursor
        ; // FALL-THROUGH
      case 47: // normal screen buffer
      case 1047: // normal screen buffer - clearing it first
        if (this.normal) {
          this.lines = this.normal.lines;
          this.ybase = this.normal.ybase;
          this.ydisp = this.normal.ydisp;
          this.x = this.normal.x;
          this.y = this.normal.y;
          this.scrollTop = this.normal.scrollTop;
          this.scrollBottom = this.normal.scrollBottom;
          this.tabs = this.normal.tabs;
          this.normal = null;
          // if (params === 1049) {
          //   this.x = this.savedX;
          //   this.y = this.savedY;
          // }
          this.refresh(0, this.rows - 1);
          this.showCursor();
        }
        break;
    }
  }
};

// CSI Ps ; Ps r
//   Set Scrolling Region [top;bottom] (default = full size of win-
//   dow) (DECSTBM).
// CSI ? Pm r
Terminal.prototype.setScrollRegion = function(params) {
  if (this.prefix) return;
  this.scrollTop = (params[0] || 1) - 1;
  this.scrollBottom = (params[1] || this.rows) - 1;
  this.x = 0;
  this.y = 0;
};

// CSI s
//   Save cursor (ANSI.SYS).
Terminal.prototype.saveCursor = function(params) {
  this.savedX = this.x;
  this.savedY = this.y;
};

// CSI u
//   Restore cursor (ANSI.SYS).
Terminal.prototype.restoreCursor = function(params) {
  this.x = this.savedX || 0;
  this.y = this.savedY || 0;
};

/**
 * Lesser Used
 */

// CSI Ps I
//   Cursor Forward Tabulation Ps tab stops (default = 1) (CHT).
Terminal.prototype.cursorForwardTab = function(params) {
  var param = params[0] || 1;
  while (param--) {
    this.x = this.nextStop();
  }
};

// CSI Ps S  Scroll up Ps lines (default = 1) (SU).
Terminal.prototype.scrollUp = function(params) {
  var param = params[0] || 1;
  while (param--) {
    this.lines.splice(this.ybase + this.scrollTop, 1);
    this.lines.splice(this.ybase + this.scrollBottom, 0, this.blankLine());
  }
  // this.maxRange();
  this.updateRange(this.scrollTop);
  this.updateRange(this.scrollBottom);
};

// CSI Ps T  Scroll down Ps lines (default = 1) (SD).
Terminal.prototype.scrollDown = function(params) {
  var param = params[0] || 1;
  while (param--) {
    this.lines.splice(this.ybase + this.scrollBottom, 1);
    this.lines.splice(this.ybase + this.scrollTop, 0, this.blankLine());
  }
  // this.maxRange();
  this.updateRange(this.scrollTop);
  this.updateRange(this.scrollBottom);
};

// CSI Ps ; Ps ; Ps ; Ps ; Ps T
//   Initiate highlight mouse tracking.  Parameters are
//   [func;startx;starty;firstrow;lastrow].  See the section Mouse
//   Tracking.
Terminal.prototype.initMouseTracking = function(params) {
  // Relevant: DECSET 1001
};

// CSI > Ps; Ps T
//   Reset one or more features of the title modes to the default
//   value.  Normally, "reset" disables the feature.  It is possi-
//   ble to disable the ability to reset features by compiling a
//   different default for the title modes into xterm.
//     Ps = 0  -> Do not set window/icon labels using hexadecimal.
//     Ps = 1  -> Do not query window/icon labels using hexadeci-
//     mal.
//     Ps = 2  -> Do not set window/icon labels using UTF-8.
//     Ps = 3  -> Do not query window/icon labels using UTF-8.
//   (See discussion of "Title Modes").
Terminal.prototype.resetTitleModes = function(params) {
  ;
};

// CSI Ps Z  Cursor Backward Tabulation Ps tab stops (default = 1) (CBT).
Terminal.prototype.cursorBackwardTab = function(params) {
  var param = params[0] || 1;
  while (param--) {
    this.x = this.prevStop();
  }
};

// CSI Ps b  Repeat the preceding graphic character Ps times (REP).
Terminal.prototype.repeatPrecedingCharacter = function(params) {
  var param = params[0] || 1
    , line = this.lines[this.ybase + this.y]
    , ch = line[this.x - 1] || [this.defAttr, ' '];

  while (param--) line[this.x++] = ch;
};

// CSI Ps g  Tab Clear (TBC).
//     Ps = 0  -> Clear Current Column (default).
//     Ps = 3  -> Clear All.
// Potentially:
//   Ps = 2  -> Clear Stops on Line.
//   http://vt100.net/annarbor/aaa-ug/section6.html
Terminal.prototype.tabClear = function(params) {
  var param = params[0];
  if (param <= 0) {
    delete this.tabs[this.x];
  } else if (param === 3) {
    this.tabs = {};
  }
};

// CSI Pm i  Media Copy (MC).
//     Ps = 0  -> Print screen (default).
//     Ps = 4  -> Turn off printer controller mode.
//     Ps = 5  -> Turn on printer controller mode.
// CSI ? Pm i
//   Media Copy (MC, DEC-specific).
//     Ps = 1  -> Print line containing cursor.
//     Ps = 4  -> Turn off autoprint mode.
//     Ps = 5  -> Turn on autoprint mode.
//     Ps = 1  0  -> Print composed display, ignores DECPEX.
//     Ps = 1  1  -> Print all pages.
Terminal.prototype.mediaCopy = function(params) {
  ;
};

// CSI > Ps; Ps m
//   Set or reset resource-values used by xterm to decide whether
//   to construct escape sequences holding information about the
//   modifiers pressed with a given key.  The first parameter iden-
//   tifies the resource to set/reset.  The second parameter is the
//   value to assign to the resource.  If the second parameter is
//   omitted, the resource is reset to its initial value.
//     Ps = 1  -> modifyCursorKeys.
//     Ps = 2  -> modifyFunctionKeys.
//     Ps = 4  -> modifyOtherKeys.
//   If no parameters are given, all resources are reset to their
//   initial values.
Terminal.prototype.setResources = function(params) {
  ;
};

// CSI > Ps n
//   Disable modifiers which may be enabled via the CSI > Ps; Ps m
//   sequence.  This corresponds to a resource value of "-1", which
//   cannot be set with the other sequence.  The parameter identi-
//   fies the resource to be disabled:
//     Ps = 1  -> modifyCursorKeys.
//     Ps = 2  -> modifyFunctionKeys.
//     Ps = 4  -> modifyOtherKeys.
//   If the parameter is omitted, modifyFunctionKeys is disabled.
//   When modifyFunctionKeys is disabled, xterm uses the modifier
//   keys to make an extended sequence of functions rather than
//   adding a parameter to each function key to denote the modi-
//   fiers.
Terminal.prototype.disableModifiers = function(params) {
  ;
};

// CSI > Ps p
//   Set resource value pointerMode.  This is used by xterm to
//   decide whether to hide the pointer cursor as the user types.
//   Valid values for the parameter:
//     Ps = 0  -> never hide the pointer.
//     Ps = 1  -> hide if the mouse tracking mode is not enabled.
//     Ps = 2  -> always hide the pointer.  If no parameter is
//     given, xterm uses the default, which is 1 .
Terminal.prototype.setPointerMode = function(params) {
  ;
};

// CSI ! p   Soft terminal reset (DECSTR).
// http://vt100.net/docs/vt220-rm/table4-10.html
Terminal.prototype.softReset = function(params) {
  this.cursorHidden = false;
  this.insertMode = false;
  this.originMode = false;
  this.wraparoundMode = false; // autowrap
  this.applicationKeypad = false; // ?
  this.applicationCursor = false;
  this.scrollTop = 0;
  this.scrollBottom = this.rows - 1;
  this.curAttr = this.defAttr;
  this.x = this.y = 0; // ?
  this.charset = null;
  this.glevel = 0; // ??
  this.charsets = [null]; // ??
};

// CSI Ps$ p
//   Request ANSI mode (DECRQM).  For VT300 and up, reply is
//     CSI Ps; Pm$ y
//   where Ps is the mode number as in RM, and Pm is the mode
//   value:
//     0 - not recognized
//     1 - set
//     2 - reset
//     3 - permanently set
//     4 - permanently reset
Terminal.prototype.requestAnsiMode = function(params) {
  ;
};

// CSI ? Ps$ p
//   Request DEC private mode (DECRQM).  For VT300 and up, reply is
//     CSI ? Ps; Pm$ p
//   where Ps is the mode number as in DECSET, Pm is the mode value
//   as in the ANSI DECRQM.
Terminal.prototype.requestPrivateMode = function(params) {
  ;
};

// CSI Ps ; Ps " p
//   Set conformance level (DECSCL).  Valid values for the first
//   parameter:
//     Ps = 6 1  -> VT100.
//     Ps = 6 2  -> VT200.
//     Ps = 6 3  -> VT300.
//   Valid values for the second parameter:
//     Ps = 0  -> 8-bit controls.
//     Ps = 1  -> 7-bit controls (always set for VT100).
//     Ps = 2  -> 8-bit controls.
Terminal.prototype.setConformanceLevel = function(params) {
  ;
};

// CSI Ps q  Load LEDs (DECLL).
//     Ps = 0  -> Clear all LEDS (default).
//     Ps = 1  -> Light Num Lock.
//     Ps = 2  -> Light Caps Lock.
//     Ps = 3  -> Light Scroll Lock.
//     Ps = 2  1  -> Extinguish Num Lock.
//     Ps = 2  2  -> Extinguish Caps Lock.
//     Ps = 2  3  -> Extinguish Scroll Lock.
Terminal.prototype.loadLEDs = function(params) {
  ;
};

// CSI Ps SP q
//   Set cursor style (DECSCUSR, VT520).
//     Ps = 0  -> blinking block.
//     Ps = 1  -> blinking block (default).
//     Ps = 2  -> steady block.
//     Ps = 3  -> blinking underline.
//     Ps = 4  -> steady underline.
Terminal.prototype.setCursorStyle = function(params) {
  ;
};

// CSI Ps " q
//   Select character protection attribute (DECSCA).  Valid values
//   for the parameter:
//     Ps = 0  -> DECSED and DECSEL can erase (default).
//     Ps = 1  -> DECSED and DECSEL cannot erase.
//     Ps = 2  -> DECSED and DECSEL can erase.
Terminal.prototype.setCharProtectionAttr = function(params) {
  ;
};

// CSI ? Pm r
//   Restore DEC Private Mode Values.  The value of Ps previously
//   saved is restored.  Ps values are the same as for DECSET.
Terminal.prototype.restorePrivateValues = function(params) {
  ;
};

// CSI Pt; Pl; Pb; Pr; Ps$ r
//   Change Attributes in Rectangular Area (DECCARA), VT400 and up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
//     Ps denotes the SGR attributes to change: 0, 1, 4, 5, 7.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.setAttrInRectangle = function(params) {
  var t = params[0]
    , l = params[1]
    , b = params[2]
    , r = params[3]
    , attr = params[4];

  var line
    , i;

  for (; t < b + 1; t++) {
    line = this.lines[this.ybase + t];
    for (i = l; i < r; i++) {
      line[i] = [attr, line[i][1]];
    }
  }

  // this.maxRange();
  this.updateRange(params[0]);
  this.updateRange(params[2]);
};

// CSI ? Pm s
//   Save DEC Private Mode Values.  Ps values are the same as for
//   DECSET.
Terminal.prototype.savePrivateValues = function(params) {
  ;
};

// CSI Ps ; Ps ; Ps t
//   Window manipulation (from dtterm, as well as extensions).
//   These controls may be disabled using the allowWindowOps
//   resource.  Valid values for the first (and any additional
//   parameters) are:
//     Ps = 1  -> De-iconify window.
//     Ps = 2  -> Iconify window.
//     Ps = 3  ;  x ;  y -> Move window to [x, y].
//     Ps = 4  ;  height ;  width -> Resize the xterm window to
//     height and width in pixels.
//     Ps = 5  -> Raise the xterm window to the front of the stack-
//     ing order.
//     Ps = 6  -> Lower the xterm window to the bottom of the
//     stacking order.
//     Ps = 7  -> Refresh the xterm window.
//     Ps = 8  ;  height ;  width -> Resize the text area to
//     [height;width] in characters.
//     Ps = 9  ;  0  -> Restore maximized window.
//     Ps = 9  ;  1  -> Maximize window (i.e., resize to screen
//     size).
//     Ps = 1 0  ;  0  -> Undo full-screen mode.
//     Ps = 1 0  ;  1  -> Change to full-screen.
//     Ps = 1 1  -> Report xterm window state.  If the xterm window
//     is open (non-iconified), it returns CSI 1 t .  If the xterm
//     window is iconified, it returns CSI 2 t .
//     Ps = 1 3  -> Report xterm window position.  Result is CSI 3
//     ; x ; y t
//     Ps = 1 4  -> Report xterm window in pixels.  Result is CSI
//     4  ;  height ;  width t
//     Ps = 1 8  -> Report the size of the text area in characters.
//     Result is CSI  8  ;  height ;  width t
//     Ps = 1 9  -> Report the size of the screen in characters.
//     Result is CSI  9  ;  height ;  width t
//     Ps = 2 0  -> Report xterm window's icon label.  Result is
//     OSC  L  label ST
//     Ps = 2 1  -> Report xterm window's title.  Result is OSC  l
//     label ST
//     Ps = 2 2  ;  0  -> Save xterm icon and window title on
//     stack.
//     Ps = 2 2  ;  1  -> Save xterm icon title on stack.
//     Ps = 2 2  ;  2  -> Save xterm window title on stack.
//     Ps = 2 3  ;  0  -> Restore xterm icon and window title from
//     stack.
//     Ps = 2 3  ;  1  -> Restore xterm icon title from stack.
//     Ps = 2 3  ;  2  -> Restore xterm window title from stack.
//     Ps >= 2 4  -> Resize to Ps lines (DECSLPP).
Terminal.prototype.manipulateWindow = function(params) {
  ;
};

// CSI Pt; Pl; Pb; Pr; Ps$ t
//   Reverse Attributes in Rectangular Area (DECRARA), VT400 and
//   up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
//     Ps denotes the attributes to reverse, i.e.,  1, 4, 5, 7.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.reverseAttrInRectangle = function(params) {
  ;
};

// CSI > Ps; Ps t
//   Set one or more features of the title modes.  Each parameter
//   enables a single feature.
//     Ps = 0  -> Set window/icon labels using hexadecimal.
//     Ps = 1  -> Query window/icon labels using hexadecimal.
//     Ps = 2  -> Set window/icon labels using UTF-8.
//     Ps = 3  -> Query window/icon labels using UTF-8.  (See dis-
//     cussion of "Title Modes")
Terminal.prototype.setTitleModeFeature = function(params) {
  ;
};

// CSI Ps SP t
//   Set warning-bell volume (DECSWBV, VT520).
//     Ps = 0  or 1  -> off.
//     Ps = 2 , 3  or 4  -> low.
//     Ps = 5 , 6 , 7 , or 8  -> high.
Terminal.prototype.setWarningBellVolume = function(params) {
  ;
};

// CSI Ps SP u
//   Set margin-bell volume (DECSMBV, VT520).
//     Ps = 1  -> off.
//     Ps = 2 , 3  or 4  -> low.
//     Ps = 0 , 5 , 6 , 7 , or 8  -> high.
Terminal.prototype.setMarginBellVolume = function(params) {
  ;
};

// CSI Pt; Pl; Pb; Pr; Pp; Pt; Pl; Pp$ v
//   Copy Rectangular Area (DECCRA, VT400 and up).
//     Pt; Pl; Pb; Pr denotes the rectangle.
//     Pp denotes the source page.
//     Pt; Pl denotes the target location.
//     Pp denotes the target page.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.copyRectangle = function(params) {
  ;
};

// CSI Pt ; Pl ; Pb ; Pr ' w
//   Enable Filter Rectangle (DECEFR), VT420 and up.
//   Parameters are [top;left;bottom;right].
//   Defines the coordinates of a filter rectangle and activates
//   it.  Anytime the locator is detected outside of the filter
//   rectangle, an outside rectangle event is generated and the
//   rectangle is disabled.  Filter rectangles are always treated
//   as "one-shot" events.  Any parameters that are omitted default
//   to the current locator position.  If all parameters are omit-
//   ted, any locator motion will be reported.  DECELR always can-
//   cels any prevous rectangle definition.
Terminal.prototype.enableFilterRectangle = function(params) {
  ;
};

// CSI Ps x  Request Terminal Parameters (DECREQTPARM).
//   if Ps is a "0" (default) or "1", and xterm is emulating VT100,
//   the control sequence elicits a response of the same form whose
//   parameters describe the terminal:
//     Ps -> the given Ps incremented by 2.
//     Pn = 1  <- no parity.
//     Pn = 1  <- eight bits.
//     Pn = 1  <- 2  8  transmit 38.4k baud.
//     Pn = 1  <- 2  8  receive 38.4k baud.
//     Pn = 1  <- clock multiplier.
//     Pn = 0  <- STP flags.
Terminal.prototype.requestParameters = function(params) {
  ;
};

// CSI Ps x  Select Attribute Change Extent (DECSACE).
//     Ps = 0  -> from start to end position, wrapped.
//     Ps = 1  -> from start to end position, wrapped.
//     Ps = 2  -> rectangle (exact).
Terminal.prototype.selectChangeExtent = function(params) {
  ;
};

// CSI Pc; Pt; Pl; Pb; Pr$ x
//   Fill Rectangular Area (DECFRA), VT420 and up.
//     Pc is the character to use.
//     Pt; Pl; Pb; Pr denotes the rectangle.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.fillRectangle = function(params) {
  var ch = params[0]
    , t = params[1]
    , l = params[2]
    , b = params[3]
    , r = params[4];

  var line
    , i;

  for (; t < b + 1; t++) {
    line = this.lines[this.ybase + t];
    for (i = l; i < r; i++) {
      line[i] = [line[i][0], String.fromCharCode(ch)];
    }
  }

  // this.maxRange();
  this.updateRange(params[1]);
  this.updateRange(params[3]);
};

// CSI Ps ; Pu ' z
//   Enable Locator Reporting (DECELR).
//   Valid values for the first parameter:
//     Ps = 0  -> Locator disabled (default).
//     Ps = 1  -> Locator enabled.
//     Ps = 2  -> Locator enabled for one report, then disabled.
//   The second parameter specifies the coordinate unit for locator
//   reports.
//   Valid values for the second parameter:
//     Pu = 0  <- or omitted -> default to character cells.
//     Pu = 1  <- device physical pixels.
//     Pu = 2  <- character cells.
Terminal.prototype.enableLocatorReporting = function(params) {
  var val = params[0] > 0;
  //this.mouseEvents = val;
  //this.decLocator = val;
};

// CSI Pt; Pl; Pb; Pr$ z
//   Erase Rectangular Area (DECERA), VT400 and up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.eraseRectangle = function(params) {
  var t = params[0]
    , l = params[1]
    , b = params[2]
    , r = params[3];

  var line
    , i
    , ch;

  ch = [this.eraseAttr(), ' ']; // xterm?

  for (; t < b + 1; t++) {
    line = this.lines[this.ybase + t];
    for (i = l; i < r; i++) {
      line[i] = ch;
    }
  }

  // this.maxRange();
  this.updateRange(params[0]);
  this.updateRange(params[2]);
};

// CSI Pm ' {
//   Select Locator Events (DECSLE).
//   Valid values for the first (and any additional parameters)
//   are:
//     Ps = 0  -> only respond to explicit host requests (DECRQLP).
//                (This is default).  It also cancels any filter
//   rectangle.
//     Ps = 1  -> report button down transitions.
//     Ps = 2  -> do not report button down transitions.
//     Ps = 3  -> report button up transitions.
//     Ps = 4  -> do not report button up transitions.
Terminal.prototype.setLocatorEvents = function(params) {
  ;
};

// CSI Pt; Pl; Pb; Pr$ {
//   Selective Erase Rectangular Area (DECSERA), VT400 and up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
Terminal.prototype.selectiveEraseRectangle = function(params) {
  ;
};

// CSI Ps ' |
//   Request Locator Position (DECRQLP).
//   Valid values for the parameter are:
//     Ps = 0 , 1 or omitted -> transmit a single DECLRP locator
//     report.

//   If Locator Reporting has been enabled by a DECELR, xterm will
//   respond with a DECLRP Locator Report.  This report is also
//   generated on button up and down events if they have been
//   enabled with a DECSLE, or when the locator is detected outside
//   of a filter rectangle, if filter rectangles have been enabled
//   with a DECEFR.

//     -> CSI Pe ; Pb ; Pr ; Pc ; Pp &  w

//   Parameters are [event;button;row;column;page].
//   Valid values for the event:
//     Pe = 0  -> locator unavailable - no other parameters sent.
//     Pe = 1  -> request - xterm received a DECRQLP.
//     Pe = 2  -> left button down.
//     Pe = 3  -> left button up.
//     Pe = 4  -> middle button down.
//     Pe = 5  -> middle button up.
//     Pe = 6  -> right button down.
//     Pe = 7  -> right button up.
//     Pe = 8  -> M4 button down.
//     Pe = 9  -> M4 button up.
//     Pe = 1 0  -> locator outside filter rectangle.
//   ``button'' parameter is a bitmask indicating which buttons are
//     pressed:
//     Pb = 0  <- no buttons down.
//     Pb & 1  <- right button down.
//     Pb & 2  <- middle button down.
//     Pb & 4  <- left button down.
//     Pb & 8  <- M4 button down.
//   ``row'' and ``column'' parameters are the coordinates of the
//     locator position in the xterm window, encoded as ASCII deci-
//     mal.
//   The ``page'' parameter is not used by xterm, and will be omit-
//   ted.
Terminal.prototype.requestLocatorPosition = function(params) {
  ;
};

// CSI P m SP }
// Insert P s Column(s) (default = 1) (DECIC), VT420 and up.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.insertColumns = function() {
  var param = params[0]
    , l = this.ybase + this.rows
    , ch = [this.eraseAttr(), ' '] // xterm?
    , i;

  while (param--) {
    for (i = this.ybase; i < l; i++) {
      this.lines[i].splice(this.x + 1, 0, ch);
      this.lines[i].pop();
    }
  }

  this.maxRange();
};

// CSI P m SP ~
// Delete P s Column(s) (default = 1) (DECDC), VT420 and up
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.deleteColumns = function() {
  var param = params[0]
    , l = this.ybase + this.rows
    , ch = [this.eraseAttr(), ' '] // xterm?
    , i;

  while (param--) {
    for (i = this.ybase; i < l; i++) {
      this.lines[i].splice(this.x, 1);
      this.lines[i].push(ch);
    }
  }

  this.maxRange();
};

/**
 * Prefix/Select/Visual/Search Modes
 */

Terminal.prototype.enterPrefix = function() {
  this.prefixMode = true;
};

Terminal.prototype.leavePrefix = function() {
  this.prefixMode = false;
};

Terminal.prototype.enterSelect = function() {
  this._real = {
    x: this.x,
    y: this.y,
    ydisp: this.ydisp,
    ybase: this.ybase,
    cursorHidden: this.cursorHidden,
    lines: this.copyBuffer(this.lines),
    write: this.write
  };
  this.write = function() {};
  this.selectMode = true;
  this.visualMode = false;
  this.cursorHidden = false;
  this.refresh(this.y, this.y);
};

Terminal.prototype.leaveSelect = function() {
  this.x = this._real.x;
  this.y = this._real.y;
  this.ydisp = this._real.ydisp;
  this.ybase = this._real.ybase;
  this.cursorHidden = this._real.cursorHidden;
  this.lines = this._real.lines;
  this.write = this._real.write;
  delete this._real;
  this.selectMode = false;
  this.visualMode = false;
  this.refresh(0, this.rows - 1);
};

Terminal.prototype.enterVisual = function() {
  this._real.preVisual = this.copyBuffer(this.lines);
  this.selectText(this.x, this.x, this.ydisp + this.y, this.ydisp + this.y);
  this.visualMode = true;
};

Terminal.prototype.leaveVisual = function() {
  this.lines = this._real.preVisual;
  delete this._real.preVisual;
  delete this._selected;
  this.visualMode = false;
  this.refresh(0, this.rows - 1);
};

Terminal.prototype.enterSearch = function(down) {
  this.entry = '';
  this.searchMode = true;
  this.searchDown = down;
  this._real.preSearch = this.copyBuffer(this.lines);
  this._real.preSearchX = this.x;
  this._real.preSearchY = this.y;

  var bottom = this.ydisp + this.rows - 1;
  for (var i = 0; i < this.entryPrefix.length; i++) {
    //this.lines[bottom][i][0] = (this.defAttr & ~0x1ff) | 4;
    //this.lines[bottom][i][1] = this.entryPrefix[i];
    this.lines[bottom][i] = [
      (this.defAttr & ~0x1ff) | 4,
      this.entryPrefix[i]
    ];
  }

  this.y = this.rows - 1;
  this.x = this.entryPrefix.length;

  this.refresh(this.rows - 1, this.rows - 1);
};

Terminal.prototype.leaveSearch = function() {
  this.searchMode = false;

  if (this._real.preSearch) {
    this.lines = this._real.preSearch;
    this.x = this._real.preSearchX;
    this.y = this._real.preSearchY;
    delete this._real.preSearch;
    delete this._real.preSearchX;
    delete this._real.preSearchY;
  }

  this.refresh(this.rows - 1, this.rows - 1);
};

Terminal.prototype.copyBuffer = function(lines) {
  var lines = lines || this.lines
    , out = [];

  for (var y = 0; y < lines.length; y++) {
    out[y] = [];
    for (var x = 0; x < lines[y].length; x++) {
      out[y][x] = [lines[y][x][0], lines[y][x][1]];
    }
  }

  return out;
};

Terminal.prototype.getCopyTextarea = function(text) {
  var textarea = this._copyTextarea
    , document = this.document;

  if (!textarea) {
    textarea = document.createElement('textarea');
    textarea.style.position = 'absolute';
    textarea.style.left = '-32000px';
    textarea.style.top = '-32000px';
    textarea.style.width = '0px';
    textarea.style.height = '0px';
    textarea.style.opacity = '0';
    textarea.style.backgroundColor = 'transparent';
    textarea.style.borderStyle = 'none';
    textarea.style.outlineStyle = 'none';

    document.getElementsByTagName('body')[0].appendChild(textarea);

    this._copyTextarea = textarea;
  }

  return textarea;
};

// NOTE: Only works for primary selection on X11.
// Non-X11 users should use Ctrl-C instead.
Terminal.prototype.copyText = function(text) {
  var self = this
    , textarea = this.getCopyTextarea();

  this.emit('copy', text);

  textarea.focus();
  textarea.textContent = text;
  textarea.value = text;
  textarea.setSelectionRange(0, text.length);

  setTimeout(function() {
    self.element.focus();
    self.focus();
  }, 1);
};

Terminal.prototype.selectText = function(x1, x2, y1, y2) {
  var ox1
    , ox2
    , oy1
    , oy2
    , tmp
    , x
    , y
    , xl
    , attr;

  if (this._selected) {
    ox1 = this._selected.x1;
    ox2 = this._selected.x2;
    oy1 = this._selected.y1;
    oy2 = this._selected.y2;

    if (oy2 < oy1) {
      tmp = ox2;
      ox2 = ox1;
      ox1 = tmp;
      tmp = oy2;
      oy2 = oy1;
      oy1 = tmp;
    }

    if (ox2 < ox1 && oy1 === oy2) {
      tmp = ox2;
      ox2 = ox1;
      ox1 = tmp;
    }

    for (y = oy1; y <= oy2; y++) {
      x = 0;
      xl = this.cols - 1;
      if (y === oy1) {
        x = ox1;
      }
      if (y === oy2) {
        xl = ox2;
      }
      for (; x <= xl; x++) {
        if (this.lines[y][x].old != null) {
          //this.lines[y][x][0] = this.lines[y][x].old;
          //delete this.lines[y][x].old;
          attr = this.lines[y][x].old;
          delete this.lines[y][x].old;
          this.lines[y][x] = [attr, this.lines[y][x][1]];
        }
      }
    }

    y1 = this._selected.y1;
    x1 = this._selected.x1;
  }

  y1 = Math.max(y1, 0);
  y1 = Math.min(y1, this.ydisp + this.rows - 1);

  y2 = Math.max(y2, 0);
  y2 = Math.min(y2, this.ydisp + this.rows - 1);

  this._selected = { x1: x1, x2: x2, y1: y1, y2: y2 };

  if (y2 < y1) {
    tmp = x2;
    x2 = x1;
    x1 = tmp;
    tmp = y2;
    y2 = y1;
    y1 = tmp;
  }

  if (x2 < x1 && y1 === y2) {
    tmp = x2;
    x2 = x1;
    x1 = tmp;
  }

  for (y = y1; y <= y2; y++) {
    x = 0;
    xl = this.cols - 1;
    if (y === y1) {
      x = x1;
    }
    if (y === y2) {
      xl = x2;
    }
    for (; x <= xl; x++) {
      //this.lines[y][x].old = this.lines[y][x][0];
      //this.lines[y][x][0] &= ~0x1ff;
      //this.lines[y][x][0] |= (0x1ff << 9) | 4;
      attr = this.lines[y][x][0];
      this.lines[y][x] = [
        (attr & ~0x1ff) | ((0x1ff << 9) | 4),
        this.lines[y][x][1]
      ];
      this.lines[y][x].old = attr;
    }
  }

  y1 = y1 - this.ydisp;
  y2 = y2 - this.ydisp;

  y1 = Math.max(y1, 0);
  y1 = Math.min(y1, this.rows - 1);

  y2 = Math.max(y2, 0);
  y2 = Math.min(y2, this.rows - 1);

  //this.refresh(y1, y2);
  this.refresh(0, this.rows - 1);
};

Terminal.prototype.grabText = function(x1, x2, y1, y2) {
  var out = ''
    , buf = ''
    , ch
    , x
    , y
    , xl
    , tmp;

  if (y2 < y1) {
    tmp = x2;
    x2 = x1;
    x1 = tmp;
    tmp = y2;
    y2 = y1;
    y1 = tmp;
  }

  if (x2 < x1 && y1 === y2) {
    tmp = x2;
    x2 = x1;
    x1 = tmp;
  }

  for (y = y1; y <= y2; y++) {
    x = 0;
    xl = this.cols - 1;
    if (y === y1) {
      x = x1;
    }
    if (y === y2) {
      xl = x2;
    }
    for (; x <= xl; x++) {
      ch = this.lines[y][x][1];
      if (ch === ' ') {
        buf += ch;
        continue;
      }
      if (buf) {
        out += buf;
        buf = '';
      }
      out += ch;
      if (isWide(ch)) x++;
    }
    buf = '';
    out += '\n';
  }

  // If we're not at the end of the
  // line, don't add a newline.
  for (x = x2, y = y2; x < this.cols; x++) {
    if (this.lines[y][x][1] !== ' ') {
      out = out.slice(0, -1);
      break;
    }
  }

  return out;
};

Terminal.prototype.keyPrefix = function(ev, key) {
  if (key === 'k' || key === '&') {
    this.destroy();
  } else if (key === 'p' || key === ']') {
    this.emit('request paste');
  } else if (key === 'c') {
    this.emit('request create');
  } else if (key >= '0' && key <= '9') {
    key = +key - 1;
    if (!~key) key = 9;
    this.emit('request term', key);
  } else if (key === 'n') {
    this.emit('request term next');
  } else if (key === 'P') {
    this.emit('request term previous');
  } else if (key === ':') {
    this.emit('request command mode');
  } else if (key === '[') {
    this.enterSelect();
  }
};

Terminal.prototype.keySelect = function(ev, key) {
  this.showCursor();

  if (this.searchMode || key === 'n' || key === 'N') {
    return this.keySearch(ev, key);
  }

  if (key === '\x04') { // ctrl-d
    var y = this.ydisp + this.y;
    if (this.ydisp === this.ybase) {
      // Mimic vim behavior
      this.y = Math.min(this.y + (this.rows - 1) / 2 | 0, this.rows - 1);
      this.refresh(0, this.rows - 1);
    } else {
      this.scrollDisp((this.rows - 1) / 2 | 0);
    }
    if (this.visualMode) {
      this.selectText(this.x, this.x, y, this.ydisp + this.y);
    }
    return;
  }

  if (key === '\x15') { // ctrl-u
    var y = this.ydisp + this.y;
    if (this.ydisp === 0) {
      // Mimic vim behavior
      this.y = Math.max(this.y - (this.rows - 1) / 2 | 0, 0);
      this.refresh(0, this.rows - 1);
    } else {
      this.scrollDisp(-(this.rows - 1) / 2 | 0);
    }
    if (this.visualMode) {
      this.selectText(this.x, this.x, y, this.ydisp + this.y);
    }
    return;
  }

  if (key === '\x06') { // ctrl-f
    var y = this.ydisp + this.y;
    this.scrollDisp(this.rows - 1);
    if (this.visualMode) {
      this.selectText(this.x, this.x, y, this.ydisp + this.y);
    }
    return;
  }

  if (key === '\x02') { // ctrl-b
    var y = this.ydisp + this.y;
    this.scrollDisp(-(this.rows - 1));
    if (this.visualMode) {
      this.selectText(this.x, this.x, y, this.ydisp + this.y);
    }
    return;
  }

  if (key === 'k' || key === '\x1b[A') {
    var y = this.ydisp + this.y;
    this.y--;
    if (this.y < 0) {
      this.y = 0;
      this.scrollDisp(-1);
    }
    if (this.visualMode) {
      this.selectText(this.x, this.x, y, this.ydisp + this.y);
    } else {
      this.refresh(this.y, this.y + 1);
    }
    return;
  }

  if (key === 'j' || key === '\x1b[B') {
    var y = this.ydisp + this.y;
    this.y++;
    if (this.y >= this.rows) {
      this.y = this.rows - 1;
      this.scrollDisp(1);
    }
    if (this.visualMode) {
      this.selectText(this.x, this.x, y, this.ydisp + this.y);
    } else {
      this.refresh(this.y - 1, this.y);
    }
    return;
  }

  if (key === 'h' || key === '\x1b[D') {
    var x = this.x;
    this.x--;
    if (this.x < 0) {
      this.x = 0;
    }
    if (this.visualMode) {
      this.selectText(x, this.x, this.ydisp + this.y, this.ydisp + this.y);
    } else {
      this.refresh(this.y, this.y);
    }
    return;
  }

  if (key === 'l' || key === '\x1b[C') {
    var x = this.x;
    this.x++;
    if (this.x >= this.cols) {
      this.x = this.cols - 1;
    }
    if (this.visualMode) {
      this.selectText(x, this.x, this.ydisp + this.y, this.ydisp + this.y);
    } else {
      this.refresh(this.y, this.y);
    }
    return;
  }

  if (key === 'v' || key === ' ') {
    if (!this.visualMode) {
      this.enterVisual();
    } else {
      this.leaveVisual();
    }
    return;
  }

  if (key === 'y') {
    if (this.visualMode) {
      var text = this.grabText(
        this._selected.x1, this._selected.x2,
        this._selected.y1, this._selected.y2);
      this.copyText(text);
      this.leaveVisual();
      // this.leaveSelect();
    }
    return;
  }

  if (key === 'q' || key === '\x1b') {
    if (this.visualMode) {
      this.leaveVisual();
    } else {
      this.leaveSelect();
    }
    return;
  }

  if (key === 'w' || key === 'W') {
    var ox = this.x;
    var oy = this.y;
    var oyd = this.ydisp;

    var x = this.x;
    var y = this.y;
    var yb = this.ydisp;
    var saw_space = false;

    for (;;) {
      var line = this.lines[yb + y];
      while (x < this.cols) {
        if (line[x][1] <= ' ') {
          saw_space = true;
        } else if (saw_space) {
          break;
        }
        x++;
      }
      if (x >= this.cols) x = this.cols - 1;
      if (x === this.cols - 1 && line[x][1] <= ' ') {
        x = 0;
        if (++y >= this.rows) {
          y--;
          if (++yb > this.ybase) {
            yb = this.ybase;
            x = this.x;
            break;
          }
        }
        continue;
      }
      break;
    }

    this.x = x, this.y = y;
    this.scrollDisp(-this.ydisp + yb);

    if (this.visualMode) {
      this.selectText(ox, this.x, oy + oyd, this.ydisp + this.y);
    }
    return;
  }

  if (key === 'b' || key === 'B') {
    var ox = this.x;
    var oy = this.y;
    var oyd = this.ydisp;

    var x = this.x;
    var y = this.y;
    var yb = this.ydisp;

    for (;;) {
      var line = this.lines[yb + y];
      var saw_space = x > 0 && line[x][1] > ' ' && line[x - 1][1] > ' ';
      while (x >= 0) {
        if (line[x][1] <= ' ') {
          if (saw_space && (x + 1 < this.cols && line[x + 1][1] > ' ')) {
            x++;
            break;
          } else {
            saw_space = true;
          }
        }
        x--;
      }
      if (x < 0) x = 0;
      if (x === 0 && (line[x][1] <= ' ' || !saw_space)) {
        x = this.cols - 1;
        if (--y < 0) {
          y++;
          if (--yb < 0) {
            yb++;
            x = 0;
            break;
          }
        }
        continue;
      }
      break;
    }

    this.x = x, this.y = y;
    this.scrollDisp(-this.ydisp + yb);

    if (this.visualMode) {
      this.selectText(ox, this.x, oy + oyd, this.ydisp + this.y);
    }
    return;
  }

  if (key === 'e' || key === 'E') {
    var x = this.x + 1;
    var y = this.y;
    var yb = this.ydisp;
    if (x >= this.cols) x--;

    for (;;) {
      var line = this.lines[yb + y];
      while (x < this.cols) {
        if (line[x][1] <= ' ') {
          x++;
        } else {
          break;
        }
      }
      while (x < this.cols) {
        if (line[x][1] <= ' ') {
          if (x - 1 >= 0 && line[x - 1][1] > ' ') {
            x--;
            break;
          }
        }
        x++;
      }
      if (x >= this.cols) x = this.cols - 1;
      if (x === this.cols - 1 && line[x][1] <= ' ') {
        x = 0;
        if (++y >= this.rows) {
          y--;
          if (++yb > this.ybase) {
            yb = this.ybase;
            break;
          }
        }
        continue;
      }
      break;
    }

    this.x = x, this.y = y;
    this.scrollDisp(-this.ydisp + yb);

    if (this.visualMode) {
      this.selectText(ox, this.x, oy + oyd, this.ydisp + this.y);
    }
    return;
  }

  if (key === '^' || key === '0') {
    var ox = this.x;

    if (key === '0') {
      this.x = 0;
    } else if (key === '^') {
      var line = this.lines[this.ydisp + this.y];
      var x = 0;
      while (x < this.cols) {
        if (line[x][1] > ' ') {
          break;
        }
        x++;
      }
      if (x >= this.cols) x = this.cols - 1;
      this.x = x;
    }

    if (this.visualMode) {
      this.selectText(ox, this.x, this.ydisp + this.y, this.ydisp + this.y);
    } else {
      this.refresh(this.y, this.y);
    }
    return;
  }

  if (key === '$') {
    var ox = this.x;
    var line = this.lines[this.ydisp + this.y];
    var x = this.cols - 1;
    while (x >= 0) {
      if (line[x][1] > ' ') {
        if (this.visualMode && x < this.cols - 1) x++;
        break;
      }
      x--;
    }
    if (x < 0) x = 0;
    this.x = x;
    if (this.visualMode) {
      this.selectText(ox, this.x, this.ydisp + this.y, this.ydisp + this.y);
    } else {
      this.refresh(this.y, this.y);
    }
    return;
  }

  if (key === 'g' || key === 'G') {
    var ox = this.x;
    var oy = this.y;
    var oyd = this.ydisp;
    if (key === 'g') {
      this.x = 0, this.y = 0;
      this.scrollDisp(-this.ydisp);
    } else if (key === 'G') {
      this.x = 0, this.y = this.rows - 1;
      this.scrollDisp(this.ybase);
    }
    if (this.visualMode) {
      this.selectText(ox, this.x, oy + oyd, this.ydisp + this.y);
    }
    return;
  }

  if (key === 'H' || key === 'M' || key === 'L') {
    var ox = this.x;
    var oy = this.y;
    if (key === 'H') {
      this.x = 0, this.y = 0;
    } else if (key === 'M') {
      this.x = 0, this.y = this.rows / 2 | 0;
    } else if (key === 'L') {
      this.x = 0, this.y = this.rows - 1;
    }
    if (this.visualMode) {
      this.selectText(ox, this.x, this.ydisp + oy, this.ydisp + this.y);
    } else {
      this.refresh(oy, oy);
      this.refresh(this.y, this.y);
    }
    return;
  }

  if (key === '{' || key === '}') {
    var ox = this.x;
    var oy = this.y;
    var oyd = this.ydisp;

    var line;
    var saw_full = false;
    var found = false;
    var first_is_space = -1;
    var y = this.y + (key === '{' ? -1 : 1);
    var yb = this.ydisp;
    var i;

    if (key === '{') {
      if (y < 0) {
        y++;
        if (yb > 0) yb--;
      }
    } else if (key === '}') {
      if (y >= this.rows) {
        y--;
        if (yb < this.ybase) yb++;
      }
    }

    for (;;) {
      line = this.lines[yb + y];

      for (i = 0; i < this.cols; i++) {
        if (line[i][1] > ' ') {
          if (first_is_space === -1) {
            first_is_space = 0;
          }
          saw_full = true;
          break;
        } else if (i === this.cols - 1) {
          if (first_is_space === -1) {
            first_is_space = 1;
          } else if (first_is_space === 0) {
            found = true;
          } else if (first_is_space === 1) {
            if (saw_full) found = true;
          }
          break;
        }
      }

      if (found) break;

      if (key === '{') {
        y--;
        if (y < 0) {
          y++;
          if (yb > 0) yb--;
          else break;
        }
      } else if (key === '}') {
        y++;
        if (y >= this.rows) {
          y--;
          if (yb < this.ybase) yb++;
          else break;
        }
      }
    }

    if (!found) {
      if (key === '{') {
        y = 0;
        yb = 0;
      } else if (key === '}') {
        y = this.rows - 1;
        yb = this.ybase;
      }
    }

    this.x = 0, this.y = y;
    this.scrollDisp(-this.ydisp + yb);

    if (this.visualMode) {
      this.selectText(ox, this.x, oy + oyd, this.ydisp + this.y);
    }
    return;
  }

  if (key === '/' || key === '?') {
    if (!this.visualMode) {
      this.enterSearch(key === '/');
    }
    return;
  }

  return false;
};

Terminal.prototype.keySearch = function(ev, key) {
  if (key === '\x1b') {
    this.leaveSearch();
    return;
  }

  if (key === '\r' || (!this.searchMode && (key === 'n' || key === 'N'))) {
    this.leaveSearch();

    var entry = this.entry;

    if (!entry) {
      this.refresh(0, this.rows - 1);
      return;
    }

    var ox = this.x;
    var oy = this.y;
    var oyd = this.ydisp;

    var line;
    var found = false;
    var wrapped = false;
    var x = this.x + 1;
    var y = this.ydisp + this.y;
    var yb, i;
    var up = key === 'N'
      ? this.searchDown
      : !this.searchDown;

    for (;;) {
      line = this.lines[y];

      while (x < this.cols) {
        for (i = 0; i < entry.length; i++) {
          if (x + i >= this.cols) break;
          if (line[x + i][1] !== entry[i]) {
            break;
          } else if (line[x + i][1] === entry[i] && i === entry.length - 1) {
            found = true;
            break;
          }
        }
        if (found) break;
        x += i + 1;
      }
      if (found) break;

      x = 0;

      if (!up) {
        y++;
        if (y > this.ybase + this.rows - 1) {
          if (wrapped) break;
          // this.setMessage('Search wrapped. Continuing at TOP.');
          wrapped = true;
          y = 0;
        }
      } else {
        y--;
        if (y < 0) {
          if (wrapped) break;
          // this.setMessage('Search wrapped. Continuing at BOTTOM.');
          wrapped = true;
          y = this.ybase + this.rows - 1;
        }
      }
    }

    if (found) {
      if (y - this.ybase < 0) {
        yb = y;
        y = 0;
        if (yb > this.ybase) {
          y = yb - this.ybase;
          yb = this.ybase;
        }
      } else {
        yb = this.ybase;
        y -= this.ybase;
      }

      this.x = x, this.y = y;
      this.scrollDisp(-this.ydisp + yb);

      if (this.visualMode) {
        this.selectText(ox, this.x, oy + oyd, this.ydisp + this.y);
      }
      return;
    }

    // this.setMessage("No matches found.");
    this.refresh(0, this.rows - 1);

    return;
  }

  if (key === '\b' || key === '\x7f') {
    if (this.entry.length === 0) return;
    var bottom = this.ydisp + this.rows - 1;
    this.entry = this.entry.slice(0, -1);
    var i = this.entryPrefix.length + this.entry.length;
    //this.lines[bottom][i][1] = ' ';
    this.lines[bottom][i] = [
      this.lines[bottom][i][0],
      ' '
    ];
    this.x--;
    this.refresh(this.rows - 1, this.rows - 1);
    this.refresh(this.y, this.y);
    return;
  }

  if (key.length === 1 && key >= ' ' && key <= '~') {
    var bottom = this.ydisp + this.rows - 1;
    this.entry += key;
    var i = this.entryPrefix.length + this.entry.length - 1;
    //this.lines[bottom][i][0] = (this.defAttr & ~0x1ff) | 4;
    //this.lines[bottom][i][1] = key;
    this.lines[bottom][i] = [
      (this.defAttr & ~0x1ff) | 4,
      key
    ];
    this.x++;
    this.refresh(this.rows - 1, this.rows - 1);
    this.refresh(this.y, this.y);
    return;
  }

  return false;
};

/**
 * Character Sets
 */

Terminal.charsets = {};

// DEC Special Character and Line Drawing Set.
// http://vt100.net/docs/vt102-ug/table5-13.html
// A lot of curses apps use this if they see TERM=xterm.
// testing: echo -e '\e(0a\e(B'
// The xterm output sometimes seems to conflict with the
// reference above. xterm seems in line with the reference
// when running vttest however.
// The table below now uses xterm's output from vttest.
Terminal.charsets.SCLD = { // (0
  '`': '\u25c6', // '◆'
  'a': '\u2592', // '▒'
  'b': '\u0009', // '\t'
  'c': '\u000c', // '\f'
  'd': '\u000d', // '\r'
  'e': '\u000a', // '\n'
  'f': '\u00b0', // '°'
  'g': '\u00b1', // '±'
  'h': '\u2424', // '\u2424' (NL)
  'i': '\u000b', // '\v'
  'j': '\u2518', // '┘'
  'k': '\u2510', // '┐'
  'l': '\u250c', // '┌'
  'm': '\u2514', // '└'
  'n': '\u253c', // '┼'
  'o': '\u23ba', // '⎺'
  'p': '\u23bb', // '⎻'
  'q': '\u2500', // '─'
  'r': '\u23bc', // '⎼'
  's': '\u23bd', // '⎽'
  't': '\u251c', // '├'
  'u': '\u2524', // '┤'
  'v': '\u2534', // '┴'
  'w': '\u252c', // '┬'
  'x': '\u2502', // '│'
  'y': '\u2264', // '≤'
  'z': '\u2265', // '≥'
  '{': '\u03c0', // 'π'
  '|': '\u2260', // '≠'
  '}': '\u00a3', // '£'
  '~': '\u00b7'  // '·'
};

Terminal.charsets.UK = null; // (A
Terminal.charsets.US = null; // (B (USASCII)
Terminal.charsets.Dutch = null; // (4
Terminal.charsets.Finnish = null; // (C or (5
Terminal.charsets.French = null; // (R
Terminal.charsets.FrenchCanadian = null; // (Q
Terminal.charsets.German = null; // (K
Terminal.charsets.Italian = null; // (Y
Terminal.charsets.NorwegianDanish = null; // (E or (6
Terminal.charsets.Spanish = null; // (Z
Terminal.charsets.Swedish = null; // (H or (7
Terminal.charsets.Swiss = null; // (=
Terminal.charsets.ISOLatin = null; // /A

/**
 * Helpers
 */

function on(el, type, handler, capture) {
  el.addEventListener(type, handler, capture || false);
}

function off(el, type, handler, capture) {
  el.removeEventListener(type, handler, capture || false);
}

function cancel(ev) {
  if (ev.preventDefault) ev.preventDefault();
  ev.returnValue = false;
  if (ev.stopPropagation) ev.stopPropagation();
  ev.cancelBubble = true;
  return false;
}

function inherits(child, parent) {
  function f() {
    this.constructor = child;
  }
  f.prototype = parent.prototype;
  child.prototype = new f;
}

// if bold is broken, we can't
// use it in the terminal.
function isBoldBroken(document) {
  var body = document.getElementsByTagName('body')[0];
  var terminal = document.createElement('div');
  terminal.className = 'terminal';
  var line = document.createElement('div');
  var el = document.createElement('span');
  el.innerHTML = 'hello world';
  line.appendChild(el);
  terminal.appendChild(line);
  body.appendChild(terminal);
  var w1 = el.scrollWidth;
  el.style.fontWeight = 'bold';
  var w2 = el.scrollWidth;
  body.removeChild(terminal);
  return w1 !== w2;
}

var String = this.String;
var setTimeout = this.setTimeout;
var setInterval = this.setInterval;

function indexOf(obj, el) {
  var i = obj.length;
  while (i--) {
    if (obj[i] === el) return i;
  }
  return -1;
}

function isWide(ch) {
  if (ch <= '\uff00') return false;
  return (ch >= '\uff01' && ch <= '\uffbe')
      || (ch >= '\uffc2' && ch <= '\uffc7')
      || (ch >= '\uffca' && ch <= '\uffcf')
      || (ch >= '\uffd2' && ch <= '\uffd7')
      || (ch >= '\uffda' && ch <= '\uffdc')
      || (ch >= '\uffe0' && ch <= '\uffe6')
      || (ch >= '\uffe8' && ch <= '\uffee');
}

function matchColor(r1, g1, b1) {
  var hash = (r1 << 16) | (g1 << 8) | b1;

  if (matchColor._cache[hash] != null) {
    return matchColor._cache[hash];
  }

  var ldiff = Infinity
    , li = -1
    , i = 0
    , c
    , r2
    , g2
    , b2
    , diff;

  for (; i < Terminal.vcolors.length; i++) {
    c = Terminal.vcolors[i];
    r2 = c[0];
    g2 = c[1];
    b2 = c[2];

    diff = matchColor.distance(r1, g1, b1, r2, g2, b2);

    if (diff === 0) {
      li = i;
      break;
    }

    if (diff < ldiff) {
      ldiff = diff;
      li = i;
    }
  }

  return matchColor._cache[hash] = li;
}

matchColor._cache = {};

// http://stackoverflow.com/questions/1633828
matchColor.distance = function(r1, g1, b1, r2, g2, b2) {
  return Math.pow(30 * (r1 - r2), 2)
    + Math.pow(59 * (g1 - g2), 2)
    + Math.pow(11 * (b1 - b2), 2);
};

function each(obj, iter, con) {
  if (obj.forEach) return obj.forEach(iter, con);
  for (var i = 0; i < obj.length; i++) {
    iter.call(con, obj[i], i, obj);
  }
}

function keys(obj) {
  if (Object.keys) return Object.keys(obj);
  var key, keys = [];
  for (key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Expose
 */

Terminal.EventEmitter = EventEmitter;
Terminal.Stream = Stream;
Terminal.inherits = inherits;
Terminal.on = on;
Terminal.off = off;
Terminal.cancel = cancel;

if (typeof module !== 'undefined') {
  module.exports = Terminal;
} else {
  this.Terminal = Terminal;
}

}).call(function() {
  return this || (typeof window !== 'undefined' ? window : global);
}());

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],40:[function(require,module,exports){
var css = "/*-----------------------------------------------------------------------------\n| Copyright (c) 2014-2015, PhosphorJS Contributors\n|\n| Distributed under the terms of the BSD 3-Clause License.\n|\n| The full license is in the file LICENSE, distributed with this software.\n|----------------------------------------------------------------------------*/\nbody {\n  margin: 0;\n  padding: 0;\n  background: #F5F6F7;\n}\n#main {\n  position: absolute;\n  top: 10px;\n  left: 10px;\n  right: 10px;\n  bottom: 10px;\n}\n.content {\n  border: 1px solid black;\n  min-width: 50px;\n  min-height: 50px;\n}\n.red {\n  background: #E74C3C;\n}\n.yellow {\n  background: #F1C40F;\n}\n.green {\n  background: #27AE60;\n}\n.blue {\n  background: #3498DB;\n}\n.p-DockTabPanel {\n  padding-right: 2px;\n  padding-bottom: 2px;\n}\n.p-DockTabPanel > .p-StackedPanel {\n  padding: 10px;\n  background: white;\n  border: 1px solid #C0C0C0;\n  border-top: none;\n  box-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);\n}\n.p-DockTabPanel-overlay {\n  background: rgba(255, 255, 255, 0.6);\n  border: 1px solid rgba(0, 0, 0, 0.6);\n}\n.p-TabBar {\n  min-height: 24px;\n}\n.p-TabBar-content {\n  bottom: 1px;\n  align-items: flex-end;\n}\n.p-TabBar-content > .p-Tab {\n  flex-basis: 125px;\n  max-height: 21px;\n  min-width: 35px;\n  margin-left: -1px;\n  border: 1px solid #C0C0C0;\n  border-bottom: none;\n  padding: 0px 10px;\n  background: #E5E5E5;\n  font: 12px Helvetica, Arial, sans-serif;\n}\n.p-TabBar-content > .p-Tab.p-mod-first {\n  margin-left: 0;\n}\n.p-TabBar-content > .p-Tab.p-mod-selected {\n  min-height: 24px;\n  background: white;\n  transform: translateY(1px);\n}\n.p-TabBar-content > .p-Tab:hover:not(.p-mod-selected) {\n  background: #F0F0F0;\n}\n.p-TabBar-content > .p-Tab > span {\n  line-height: 21px;\n}\n.p-TabBar-footer {\n  display: block;\n  height: 1px;\n  background: #C0C0C0;\n}\n.p-Tab.p-mod-closable > .p-Tab-close-icon {\n  margin-left: 4px;\n}\n.p-Tab.p-mod-closable > .p-Tab-close-icon:before {\n  content: '\\f00d';\n  font-family: FontAwesome;\n}\n.p-Tab.p-mod-docking {\n  font: 12px Helvetica, Arial, sans-serif;\n  height: 24px;\n  width: 125px;\n  padding: 0px 10px;\n  background: white;\n  box-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);\n  transform: translateX(-50px) translateY(-14px);\n}\n.p-Tab.p-mod-docking > span {\n  line-height: 21px;\n}\n"; (require("browserify-css").createStyle(css, { "href": "src/index.css"})); module.exports = css;
},{"browserify-css":1}],41:[function(require,module,exports){
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use-strict';
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var phosphor_dockpanel_1 = require('phosphor-dockpanel');
var phosphor_tabs_1 = require('phosphor-tabs');
var phosphor_widget_1 = require('phosphor-widget');
var term_js_1 = require('term.js');
require('./index.css');
//import Size = phosphor.utility.Size;
//import SizePolicy = phosphor.widgets.SizePolicy;
/**
 * A widget which manages a terminal session.
 */
var TerminalWidget = (function (_super) {
    __extends(TerminalWidget, _super);
    /*
    * Construct a new terminal.
    */
    function TerminalWidget(ws_url, config) {
        var _this = this;
        _super.call(this);
        this.addClass('p-TerminalWidget');
        this._ws = new WebSocket(ws_url);
        this._config = config || { useStyle: true };
        this._term = new term_js_1.Terminal(this._config);
        this._term.open(this.node);
        this._term.on('data', function (data) {
            _this._ws.send(JSON.stringify(['stdin', data]));
        });
        this._ws.onmessage = function (event) {
            var json_msg = JSON.parse(event.data);
            switch (json_msg[0]) {
                case "stdout":
                    _this._term.write(json_msg[1]);
                    break;
                case "disconnect":
                    _this._term.write("\r\n\r\n[Finished... Term Session]\r\n");
                    break;
            }
        };
        // create a dummy terminal to get row/column size
        this._dummy_term = document.createElement('div');
        this._dummy_term.style.visibility = "hidden";
        var pre = document.createElement('pre');
        var span = document.createElement('span');
        pre.appendChild(span);
        // 24 rows
        pre.innerHTML = "<br><br><br><br><br><br><br><br><br><br><br><br>" +
            "<br><br><br><br><br><br><br><br><br><br><br><br>";
        // 1 row + 80 columns
        span.innerHTML = "012345678901234567890123456789" +
            "012345678901234567890123456789" +
            "01234567890123456789";
        this._dummy_term.appendChild(pre);
        this._term.element.appendChild(this._dummy_term);
        //this.verticalSizePolicy = SizePolicy.Minimum;
    }
    /**
     * Dispose of the resources held by the widget.
     */
    TerminalWidget.prototype.dispose = function () {
        this._term.destroy();
        this._ws = null;
        this._term = null;
        _super.prototype.dispose.call(this);
    };
    Object.defineProperty(TerminalWidget.prototype, "config", {
        get: function () {
            return this._config;
        },
        /**
         * Set the configuration of the terminal.
         */
        set: function (options) {
            if (options.useStyle) {
                this._term.insertStyle(this._term.document, this._term.colors[256], this._term.colors[257]);
            }
            else if (options.useStyle === false) {
                var sheetToBeRemoved = document.getElementById('term-style');
                if (sheetToBeRemoved) {
                    var sheetParent = sheetToBeRemoved.parentNode;
                    sheetParent.removeChild(sheetToBeRemoved);
                }
            }
            if (options.useStyle !== null) {
                // invalidate terminal pixel size
                this._term_row_height = 0;
            }
            for (var key in options) {
                this._term.options[key] = options[key];
            }
            this._config = options;
            // this.resize_term(this.width, this.height);
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Handle resizing the terminal itself.
     */
    TerminalWidget.prototype.resize_term = function (width, height) {
        if (!this._term_row_height) {
            this._term_row_height = this._dummy_term.offsetHeight / 25;
            this._term_col_width = this._dummy_term.offsetWidth / 80;
        }
        var rows = Math.max(2, Math.floor(height / this._term_row_height) - 2);
        var cols = Math.max(3, Math.floor(width / this._term_col_width) - 2);
        rows = this._config.rows || rows;
        cols = this._config.cols || cols;
        this._term.resize(cols, rows);
    };
    /**
     * Handle resize event.
     */
    TerminalWidget.prototype.onResize = function (msg) {
        this.resize_term(msg.width, msg.height);
    };
    return TerminalWidget;
})(phosphor_widget_1.Widget);
exports.TerminalWidget = TerminalWidget;
function createContent(title) {
    var widget = new phosphor_widget_1.Widget();
    widget.addClass('content');
    widget.addClass(title.toLowerCase());
    var tab = new phosphor_tabs_1.Tab(title);
    tab.closable = true;
    phosphor_dockpanel_1.DockPanel.setTab(widget, tab);
    return widget;
}
/**
 * A widget which hosts a CodeMirror editor.
 */
var CodeMirrorWidget = (function (_super) {
    __extends(CodeMirrorWidget, _super);
    function CodeMirrorWidget(config) {
        _super.call(this);
        this.addClass('CodeMirrorWidget');
        this._editor = CodeMirror(this.node, config);
    }
    Object.defineProperty(CodeMirrorWidget.prototype, "editor", {
        get: function () {
            return this._editor;
        },
        enumerable: true,
        configurable: true
    });
    CodeMirrorWidget.prototype.loadTarget = function (target) {
        var doc = this._editor.getDoc();
        var xhr = new XMLHttpRequest();
        xhr.open('GET', target);
        xhr.onreadystatechange = function () { return doc.setValue(xhr.responseText); };
        xhr.send();
    };
    CodeMirrorWidget.prototype.onAfterAttach = function (msg) {
        this._editor.refresh();
    };
    CodeMirrorWidget.prototype.onResize = function (msg) {
        if (msg.width < 0 || msg.height < 0) {
            this._editor.refresh();
        }
        else {
            this._editor.setSize(msg.width, msg.height);
        }
    };
    return CodeMirrorWidget;
})(phosphor_widget_1.Widget);
// class NotebookWidget extends Widget {
//   constructor() {
//     super();
//     var ipynb: any = {
//       "metadata": {
//         "name": ""
//       },
//       "nbformat": 3,
//       "nbformat_minor": 0,
//       "worksheets": [
//         {
//           "cells": [
//             {
//               "cell_type": "code",
//               "collapsed": false,
//               "input": [],
//               "language": "python",
//               "metadata": {},
//               "outputs": []
//             }
//           ],
//           "metadata": {}
//         }
//       ]
//     };
//     var nbk = new nb();
//     var notebook = nbk.parse(ipynb);
//     var rendered = notebook.render();
//     this.node.appendChild(rendered);
//   }
// }
var NotebookWidget = (function (_super) {
    __extends(NotebookWidget, _super);
    function NotebookWidget() {
        _super.call(this);
        this._frame = document.createElement('iframe');
        this._frame.setAttribute("src", "http://localhost:8888/tree");
        this._frame.setAttribute("frameborder", "0");
        this.node.appendChild(this._frame);
    }
    NotebookWidget.prototype.onAfterAttach = function (msg) {
        this._frame.refresh();
    };
    NotebookWidget.prototype.onResize = function (msg) {
        if (msg.width < 0 || msg.height < 0) {
            this._frame.refresh();
        }
        else {
            this._frame.style.width = msg.width;
            this._frame.style.height = msg.height;
        }
    };
    return NotebookWidget;
})(phosphor_widget_1.Widget);
function main() {
    // Codemirror tab
    //
    var cm = new CodeMirrorWidget({
        mode: 'text/javascript',
        lineNumbers: true,
        tabSize: 2,
    });
    var cmTab = new phosphor_tabs_1.Tab('Codemirror');
    phosphor_dockpanel_1.DockPanel.setTab(cm, cmTab);
    // Text file tab
    var text = new CodeMirrorWidget({
        lineNumbers: false,
        tabSize: 4
    });
    var textTab = new phosphor_tabs_1.Tab('Text File 1');
    phosphor_dockpanel_1.DockPanel.setTab(text, textTab);
    // Terminal tab
    //
    var protocol = (window.location.protocol.indexOf("https") === 0) ? "wss" : "ws";
    var wsUrl = protocol + "://" + window.location.host + "/websocket";
    var term = new TerminalWidget(wsUrl);
    var termTab = new phosphor_tabs_1.Tab('Terminal');
    phosphor_dockpanel_1.DockPanel.setTab(term, termTab);
    // Notebook tab
    //
    var notebook = new NotebookWidget();
    var nbTab = new phosphor_tabs_1.Tab('Notebook');
    phosphor_dockpanel_1.DockPanel.setTab(notebook, nbTab);
    // Dummy content
    //
    var r1 = createContent('Red');
    var r2 = createContent('Red');
    var r3 = createContent('Red');
    var b1 = createContent('Blue');
    var b2 = createContent('Blue');
    var b3 = createContent('Blue');
    var g1 = createContent('Green');
    var g2 = createContent('Green');
    var g3 = createContent('Green');
    var y1 = createContent('Yellow');
    var y2 = createContent('Yellow');
    var y3 = createContent('Yellow');
    var panel = new phosphor_dockpanel_1.DockPanel();
    panel.id = 'main';
    panel.addWidget(r1);
    panel.addWidget(cm, phosphor_dockpanel_1.DockPanel.SplitRight, r1);
    //panel.addWidget(b1, DockPanel.SplitRight, r1);
    panel.addWidget(term, phosphor_dockpanel_1.DockPanel.SplitBottom, b1);
    //panel.addWidget(y1, DockPanel.SplitBottom, b1);
    panel.addWidget(text, phosphor_dockpanel_1.DockPanel.SplitLeft, y1);
    // panel.addWidget(g1, DockPanel.SplitLeft, y1);
    panel.addWidget(notebook, phosphor_dockpanel_1.DockPanel.SplitBottom);
    // panel.addWidget(b2, DockPanel.SplitBottom);
    // panel.addWidget(y2, DockPanel.TabBefore, r1);
    // panel.addWidget(b3, DockPanel.TabBefore, y2);
    // panel.addWidget(g2, DockPanel.TabBefore, b2);
    // panel.addWidget(y3, DockPanel.TabBefore, g2);
    // panel.addWidget(g3, DockPanel.TabBefore, y3);
    // panel.addWidget(r2, DockPanel.TabBefore, b1);
    // panel.addWidget(r3, DockPanel.TabBefore, y1);
    phosphor_widget_1.attachWidget(panel, document.body);
    window.onresize = function () { return panel.update(); };
}
window.onload = main;

},{"./index.css":40,"phosphor-dockpanel":18,"phosphor-tabs":31,"phosphor-widget":36,"term.js":37}]},{},[41]);
