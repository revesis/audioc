"use strict";

function _classPrivateMethodInitSpec(obj, privateSet) { _checkPrivateRedeclaration(obj, privateSet); privateSet.add(obj); }
function _checkPrivateRedeclaration(obj, privateCollection) { if (privateCollection.has(obj)) { throw new TypeError("Cannot initialize the same private elements twice on an object"); } }
function _classPrivateMethodGet(receiver, privateSet, fn) { if (!privateSet.has(receiver)) { throw new TypeError("attempted to get private field on non-instance"); } return fn; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
/**
 * Different modes imply different block sizes:
 * modes = MR475, MR515, MR59, MR67, MR74, MR795, MR102, MR122, MRSID
 * indexes =   0,     1,    2,    3,    4,     5,     6,     7,     8
 * bits =     12,      13,   15,   17,   19,    20,    26,    31,     5
 * samples =  160
 */
var AMRDecoder = /*#__PURE__*/function () {
  function AMRDecoder(params) {
    _classCallCheck(this, AMRDecoder);
    !params && (params = {});
    this.params = params;
    this.block_size = 20;
    this.frame_size = 160;
  }
  _createClass(AMRDecoder, [{
    key: "init",
    value: function init() {
      // Create decoder
      this.state = AMRNB.Decoder_Interface_init();

      // 'XXX' - change to parameters

      // Input Buffer
      this.input = AMRNB.allocate(new Int8Array(20), 0);

      // Buffer to store the audio samples
      this.buffer = AMRNB.allocate(new Int16Array(160), 0);
    }
  }, {
    key: "validate",
    value: function validate(magic) {
      var is_str = magic.constructor === String.prototype.constructor;
      if (is_str) {
        return magic === AMR.MAGIC_NUMBER_STRING;
      }
      for (var i = -1; ++i < 6;) {
        if (AMR.MAGIC_NUMBER[i] !== magic[i]) {
          return false;
        }
      }
      return true;
    }
  }, {
    key: "read",
    value: function read(offset, data) {
      // block_size = 31 ==> [mode(1):frames(30)]
      var is_str = data.constructor === String.prototype.constructor,
        dec_mode = is_str ? Binary.toUint8(data[0]) : data[0];
      var nb = AMR.modes[dec_mode >> 3 & 0x000F];
      var input_addr = this.input,
        len = offset + nb > data.length ? data.length - offset : nb;
      for (var m = offset - 1, k = 0, bits; ++m < offset + len; k += 1) {
        bits = !is_str ? data[m] : Binary.toUint8(data[m]);
        AMRNB.setValue(input_addr + k, bits, 'i8');
      }
      return len;
    }
  }, {
    key: "process",
    value: function process(data) {
      var is_str = data.constructor === String.prototype.constructor,
        head = is_str ? data.substring(0, 6) : data.subarray(0, 6);
      if (!this.validate(head)) return;
      data = is_str ? data.substring(6) : data.subarray(6);
      var benchmark = !!this.params.benchmark;
      benchmark && console.time('decode');
      var output_offset = 0,
        offset = 0,
        len;

      // Varies from quality
      var total_packets = Math.ceil(data.length / this.block_size),
        estimated_size = this.frame_size * total_packets,
        tot = 0;
      var input_addr = this.input,
        buffer_addr = this.buffer,
        state_addr = this.state;
      if (!this.output || this.output.length < estimated_size) {
        this.output = new Float32Array(estimated_size);
      }
      while (offset < data.length) {
        // Benchmarking
        benchmark && console.time('decode_packet_offset_' + offset);

        // Read bits
        len = this.read(offset, data);

        // Decode the data
        AMRNB.Decoder_Interface_Decode(state_addr, input_addr, buffer_addr, 0);

        // Write the samples to the output buffer
        this.write(output_offset, this.frame_size, buffer_addr);

        // Benchmarking
        benchmark && console.timeEnd('decode_packet_offset_' + offset);
        offset += len + 1;
        output_offset += this.frame_size;
        ++tot;
      }
      benchmark && console.timeEnd('decode');
      return this.output.subarray(0, output_offset);
    }
  }, {
    key: "write",
    value: function write(offset, nframes, addr) {
      for (var m = 0, k = offset - 1; ++k < offset + nframes; m += 2) {
        this.output[k] = AMRNB.getValue(addr + m, "i16") / 32768;
      }
    }
  }, {
    key: "close",
    value: function close() {
      AMRNB.Decoder_Interface_exit(this.state);
    }
  }]);
  return AMRDecoder;
}();
var AMREncoder = /*#__PURE__*/function () {
  function AMREncoder(params) {
    _classCallCheck(this, AMREncoder);
    !params && (params = {});
    this.params = params;
    this.mode = params.mode || 5; // MR795 by default
    this.frame_size = 160;
    this.block_size = AMR.modes[this.mode];
    this.dtx = params.dtx + 0 || 0;
  }
  _createClass(AMREncoder, [{
    key: "init",
    value: function init() {
      // Create Encoder
      this.state = AMRNB.Encoder_Interface_init(this.dtx);
      this.input = AMRNB.allocate(new Int16Array(this.frame_size), 0);
      this.buffer = AMRNB.allocate(new Int8Array(this.block_size), 0);
    }
  }, {
    key: "read",
    value: function read(offset, length, data) {
      var input_addr = this.input,
        len = offset + length > data.length ? data.length - offset : length;
      for (var m = offset - 1, k = 0; ++m < offset + len; k += 2) {
        AMRNB.setValue(input_addr + k, data[m], 'i16');
      }
      return len;
    }
  }, {
    key: "write",
    value: function write(offset, nb, addr) {
      for (var m = 0, k = offset - 1; ++k < offset + nb; m += 1) {
        this.output[k] = AMRNB.getValue(addr + m, 'i8');
      }
    }
  }, {
    key: "process",
    value: function process(pcmdata) {
      var benchmark = this.params.benchmark;
      benchmark && console.time('encode');
      var output_offset = 0,
        offset = 0,
        len,
        nb,
        err,
        tm_str,
        total_packets = Math.ceil(pcmdata.length / this.frame_size),
        estimated_size = this.block_size + total_packets;
      if (!this.output || this.output.length < estimated_size) {
        this.output = new Uint8Array(estimated_size + 6);
      }
      for (var i = -1; ++i < 6;) {
        this.output[i] = AMR.MAGIC_NUMBER[i];
      }
      output_offset += 6;
      var input_addr = this.input,
        buffer_addr = this.buffer;
      while (offset < pcmdata.length) {
        benchmark && console.time('encode_packet_offset_' + offset);

        // Frames to the input buffer
        len = this.read(offset, this.frame_size, pcmdata);

        // Encode the frame
        nb = AMRNB.Encoder_Interface_Encode(this.state, this.mode, input_addr, buffer_addr, 0);

        // Write the size and frame
        this.write(output_offset, nb, buffer_addr);
        benchmark && console.timeEnd('encode_packet_offset_' + offset);
        output_offset += nb;
        offset += len;
      }
      benchmark && console.timeEnd('encode');
      return this.output.subarray(0, output_offset);
    }
  }, {
    key: "close",
    value: function close() {
      AMRNB.Encoder_Interface_exit(this.state);
    }
  }]);
  return AMREncoder;
}();
var AMR = /*#__PURE__*/function () {
  function AMR(params) {
    _classCallCheck(this, AMR);
    !params && (params = {});
    this.params = params;
    this.frame_size = 320 || params.frame_size;
    this.ring_size = 2304 || params.ring_size;
    this.linoffset = 0;
    this.ringoffset = 0;
    this.modoffset = 0;
    this.linbuf = new Int16Array(this.frame_size);
    this.ring = new Int16Array(this.ring_size * 2);
    this.modframes = new Int16Array(this.frame_size);
    this.framesbuf = [];
    this.decoder = new AMRDecoder(params);
    this.encoder = new AMREncoder(params);
    this.init();
  }
  _createClass(AMR, [{
    key: "init",
    value: function init() {
      this.decoder.init();
      this.encoder.init();
    }
  }, {
    key: "encode",
    value: function encode(data, isFile) {
      if (!!isFile) {
        return this.encoder.process(data);
      }
      // ring spin
      for (var i = -1, j = this.ringoffset; ++i < data.length; ++j) {
        this.ring[j] = data[i];
      }
      this.ringoffset += data.length;
      // has enough to decode
      if (this.ringoffset > this.linoffset && this.ringoffset - this.linoffset < this.frame_size) {
        return;
      }
      // buffer fill
      for (var _i = -1; ++_i < this.linbuf.length;) {
        this.linbuf[_i] = this.ring[this.linoffset + _i];
      }
      this.linoffset += this.linbuf.length;
      this.framesbuf = this.encoder.process(this.linbuf);
      if (this.ringoffset > this.ring_size) {
        this.modoffset = this.ringoffset % this.ring_size;
        this.ringoffset = 0;
      }
      if (this.linoffset > this.ring_size) {
        this.linoffset = 0;
      }
      return this.framesbuf;
    }
  }, {
    key: "decode",
    value: function decode(bitstream) {
      return this.decoder.process(bitstream);
    }
  }, {
    key: "close",
    value: function close() {
      this.encoder.close();
      this.decoder.close();
    }
  }, {
    key: "onerror",
    value: function onerror(message, code) {
      console.error("AMR Error " + code + ": " + message);
    }
  }]);
  return AMR;
}();
_defineProperty(AMR, "modes", {
  0: 12,
  1: 13,
  2: 15,
  3: 17,
  4: 19,
  5: 20,
  6: 26,
  7: 31,
  8: 5
});
_defineProperty(AMR, "MAGIC_NUMBER", [35, 33, 65, 77, 82, 10]);
_defineProperty(AMR, "MAGIC_NUMBER_STRING", "#!AMR\n");
var CBuffer = /*#__PURE__*/function () {
  function CBuffer() {
    _classCallCheck(this, CBuffer);
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    // if no arguments, then nothing needs to be set
    if (0 === args.length) {
      throw "Missing Argument: You must pass a valid buffer length";
    }
    // this is the same in either scenario
    this.size = this.start = 0;
    // set to callback fn if data is about to be overwritten
    this.overflow = null;
    // emulate Array based on passed arguments
    if (1 < args.length || 'number' != typeof args[0]) {
      this.data = new Float32Array(args.length);
      this.end = (this.length = args.length) - 1;
      this.push.apply(this, args);
    } else {
      this.data = new Float32Array(args[0]);
      this.end = (this.length = args[0]) - 1;
    }
  }

  /* mutator methods */

  // pop last item
  _createClass(CBuffer, [{
    key: "pop",
    value: function pop() {
      var item;
      if (0 === this.size) return;
      item = this.data[this.end];
      // remove the reference to the object so it can be garbage collected
      delete this.data[this.end];
      this.end = (this.end - 1 + this.length) % this.length;
      --this.size;
      return item;
    }

    // push item to the end
  }, {
    key: "push",
    value: function push() {
      // check if overflow is set, and if data is about to be overwritten
      if (this.overflow && this.length < this.size + arguments.length) {
        // call overflow function and send data that's about to be overwritten
        for (var i = -1; ++i < this.size + arguments.length - this.length;) {
          this.overflow(this.data[(this.end + i + 1) % this.length], this);
        }
      }
      // push items to the end, wrapping and erasing existing items
      // using arguments variable directly to reduce gc footprint
      for (var _i2 = -1; ++_i2 < arguments.length;) {
        this.data[(this.end + _i2 + 1) % this.length] = _i2 < 0 || arguments.length <= _i2 ? undefined : arguments[_i2];
      }
      // recalculate size
      if (this.length > this.size) {
        if (this.length < this.size + arguments.length) this.size = this.length;else this.size += arguments.length;
      }
      // recalculate end
      this.end = (this.end + arguments.length) % this.length;
      // recalculate start
      this.start = (this.length + this.end - this.size + 1) % this.length;
      // return number current number of items in CBuffer
      return this.size;
    }
  }, {
    key: "reverse",
    value: function reverse() {
      for (var i = -1; ++i < ~~(this.size >> 1);) {
        var tmp = this.data[(this.start + i) % this.length];
        this.data[(this.start + i) % this.length] = this.data[(this.start + (this.size - i - 1)) % this.length];
        this.data[(this.start + (this.size - i - 1)) % this.length] = tmp;
      }
      return this;
    }

    // rotate buffer to the left by cntr, or by 1
  }, {
    key: "rotateLeft",
    value: function rotateLeft(cntr) {
      if (void 0 === cntr) cntr = 1;
      if ('number' != typeof cntr) throw "Argument must be a number";
      while (0 <= --cntr) {
        this.push(this.shift());
      }
      return this;
    }

    // rotate buffer to the right by cntr, or by 1
  }, {
    key: "rotateRight",
    value: function rotateRight(cntr) {
      if (void 0 === cntr) cntr = 1;
      if ('number' != typeof cntr) throw "Argument must be a number";
      while (0 <= --cntr) {
        this.unshift(this.pop());
      }
      return this;
    }

    // remove and return first item
  }, {
    key: "shift",
    value: function shift() {
      var item;
      // check if there are any items in CBuff
      if (0 === this.size) return;
      // store first item for return
      item = this.data[this.start];
      // recalculate start of CBuffer
      this.start = (this.start + 1) % this.length;
      // decrement size
      --this.size;
      return item;
    }

    // add item to beginning of buffer
  }, {
    key: "unshift",
    value: function unshift() {
      // check if overflow is set, and if data is about to be overwritten
      if (this.overflow && this.length < this.size + arguments.length) {
        // call overflow function and send data that's about to be overwritten
        for (var i = -1; ++i < this.size + arguments.length;) {
          this.overflow(this.data[this.end - i % this.length], this);
        }
      }
      for (var _i3 = -1; ++_i3 < arguments.length;) {
        this.data[(this.length + this.start - _i3 % this.length - 1) % this.length] = _i3 < 0 || arguments.length <= _i3 ? undefined : arguments[_i3];
      }
      if (0 > this.length - this.size) {
        this.end += this.length - this.size - arguments.length;
        if (0 > this.end) this.end = this.length + this.end % this.length;
      }
      if (this.length > this.size) {
        if (this.length < this.size + arguments.length) this.size = this.length;else this.size += arguments.length;
      }
      this.start -= arguments.length;
      if (0 > this.start) this.start = this.length + this.start % this.length;
      return this.size;
    }

    /* accessor methods */

    // return index of first metched element
  }, {
    key: "indexOf",
    value: function indexOf(arg, idx) {
      if (void 0 === idx) idx = 0;
      for (var i = idx - 1; ++i < this.size;) {
        if (arg === this.data[(this.start + idx) % this.length]) return idx;
      }
      return -1;
    }

    // return last index of the first match
  }, {
    key: "lastIndexOf",
    value: function lastIndexOf(arg, idx) {
      if (void 0 === idx) idx = this.size - 1;
      for (var i = idx + 1; --i > -1;) {
        if (arg === this.data[(this.start + idx) % this.length]) return idx;
      }
      return -1;
    }

    // return the index an item would be inserted to if this
    // is a sorted circular buffer
  }, {
    key: "sortedIndex",
    value: function sortedIndex(value, comparitor, context) {
      comparitor = comparitor || function (a, b) {
        return a === b ? 0 : a > b ? 1 : -1;
      };
      var low = this.start;
      var high = this.size - 1;

      // Tricky part is finding if its before or after the pivot
      // we can get this info by checking if the target is less than
      // the last item. After that it's just a typical binary search
      if (low && 0 < comparitor.call(context, value, this.data[high])) {
        low = 0;
        high = this.end;
      }
      while (high > low) {
        var mid = low + high >>> 1;
        if (0 < comparitor.call(context, value, this.data[mid])) low = mid + 1;else high = mid;
      }
      return ((low - this.start) % this.size + this.size) % this.size;
    }

    /* iteration methods */

    // check every item in the array against a test
  }, {
    key: "every",
    value: function every(callback, context) {
      for (var i = -1; ++i < this.size;) {
        if (!callback.call(context, this.data[(this.start + i) % this.length], i, this)) return false;
      }
      return true;
    }

    // loop through each item in buffer
    // TODO: figure out how to emulate Array use better
  }, {
    key: "forEach",
    value: function forEach(callback, context) {
      for (var i = -1; ++i < this.size;) {
        callback.call(context, this.data[(this.start + i) % this.length], i, this);
      }
    }

    // check items agains test until one returns true
    // TODO: figure out how to emuldate Array use better
  }, {
    key: "some",
    value: function some(callback, context) {
      for (var i = -1; ++i < this.size;) {
        if (callback.call(context, this.data[(this.start + i) % this.length], i, this)) return true;
      }
      return false;
    }

    // calculate the average value of a circular buffer
  }, {
    key: "avg",
    value: function avg() {
      return 0 === this.size ? 0 : this.sum() / this.size;
    }

    // loop through each item in buffer and calculate sum
  }, {
    key: "sum",
    value: function sum() {
      var index = this.size;
      var s = 0;
      while (--index) s += this.data[index];
      return s;
    }

    // loop through each item in buffer and calculate median
  }, {
    key: "median",
    value: function median() {
      if (0 === this.size) return 0;
      var values = this.slice().sort(function (a, b) {
        return a === b ? 0 : a > b ? 1 : -1;
      });
      var half = Math.floor(values.length >> 1);
      if (values.length % 2) return values[half];else return (values[half - 1] + values[half]) / 2.0;
    }

    /* utility methods */
    // reset pointers to buffer with zero items
    // note: this will not remove values in cbuffer, so if for security values
    //       need to be overwritten, run .fill(null).empty()
  }, {
    key: "empty",
    value: function empty() {
      this.size = this.start = 0;
      this.end = this.length - 1;
      return this;
    }

    // fill all places with passed value or function
  }, {
    key: "fill",
    value: function fill(arg) {
      if ('function' == typeof arg) {
        for (var i = -1; ++i < this.length;) {
          this.data[i] = arg();
        }
      } else {
        for (var _i4 = -1; ++_i4 < this.length;) {
          this.data[_i4] = arg;
        }
      }
      // reposition start / end
      this.start = 0;
      this.end = this.length - 1;
      this.size = this.length;
      return this;
    }

    // return first item in buffer
  }, {
    key: "first",
    value: function first() {
      return this.data[this.start];
    }

    // return last item in buffer
  }, {
    key: "last",
    value: function last() {
      return this.data[this.end];
    }

    // return specific index in buffer
  }, {
    key: "get",
    value: function get(arg) {
      return this.data[(this.start + arg) % this.length];
    }
  }, {
    key: "isFull",
    value: function isFull() {
      return this.length === this.size;
    }

    // set value at specified index
  }, {
    key: "set",
    value: function set(idx, arg) {
      return this.data[(this.start + idx) % this.length] = arg;
    }

    // return clean array of values
  }, {
    key: "toArray",
    value: function toArray() {
      return this.slice();
    }

    // slice the buffer to an array
  }, {
    key: "slice",
    value: function slice(start, end) {
      var length = this.size;
      start = +start || 0;
      if (0 > start) {
        if (end <= start) return [];
        start = -start > length ? 0 : length + start;
      }
      if (null === end || length < end) {
        end += length;
      } else if (0 > end) {
        end += length;
      } else {
        end = +end || 0;
      }
      length = end > start ? end - start : 0;
      var result = Array(length);
      for (var i = 0; ++i < length;) {
        result[i] = this.data[(this.start + start + i) % this.length];
      }
      return result;
    }
  }]);
  return CBuffer;
}();
var FFT = /*#__PURE__*/function () {
  function FFT(bufferSize) {
    _classCallCheck(this, FFT);
    this.bufferSize = bufferSize;
    this.real = new Float64Array(bufferSize);
    this.imag = new Float64Array(bufferSize);
    this.rbo = new Uint32Array(bufferSize);
    for (var limit = 1, bit = bufferSize >> 1; bufferSize > limit; limit <<= 1, bit >>= 1) {
      for (var i = -1, offset = limit; ++i < limit; ++offset) {
        this.rbo[offset] = this.rbo[i] + bit;
      }
    }
    this.treal = new Float64Array(bufferSize >> 1);
    this.timag = new Float64Array(bufferSize >> 1);
    for (var _i5 = -1, n = bufferSize >> 1; ++_i5 < n;) {
      this.treal[_i5] = +Math.cos(Math.PI * _i5 / n);
      this.timag[_i5] = -Math.sin(Math.PI * _i5 / n);
    }
  }
  _createClass(FFT, [{
    key: "forward",
    value: function forward(buffer) {
      var bufferSize = this.bufferSize;
      var rbo = this.rbo;
      var real = this.real;
      var imag = this.imag;

      // let k = Math.floor(Math.log(bufferSize) / Math.LN2);

      // if (Math.pow(2, k) !== bufferSize) { throw "Invalid buffer size, must be a power of 2." };
      if (!!(bufferSize & bufferSize - 1)) {
        throw "Invalid buffer size, must be a power of 2.";
      }
      if (buffer.length !== bufferSize) {
        throw "Supplied buffer is not the same size as defined FFT. FFT Size: " + bufferSize + " Buffer Size: " + buffer.length;
      }
      for (var i = -1; ++i < bufferSize;) {
        real[i] = buffer[rbo[i]];
        imag[i] = 0;
      }
      this.transform(real, imag, 1);
    }
  }, {
    key: "inverse",
    value: function inverse(real, imag, buffer) {
      var bufferSize = this.bufferSize;
      var rbo = this.rbo;
      real = real || this.real;
      imag = imag || this.imag;
      var revReal = new Float64Array(bufferSize);
      var revImag = new Float64Array(bufferSize);
      for (var i = -1; ++i < real.length;) {
        revReal[i] = real[rbo[i]];
        revImag[i] = imag[rbo[i]];
      }
      real = revReal;
      imag = revImag;
      this.transform(real, imag, -1);
      for (var _i6 = -1; ++_i6 < bufferSize;) {
        buffer[_i6] = real[_i6] / bufferSize;
      }
    }
  }, {
    key: "transform",
    value: function transform(real, imag, conj) {
      var bufferSize = this.bufferSize;
      var treal = this.treal;
      var timag = this.timag;
      for (var layer = 1, order = 1, N = bufferSize; order < N; order <<= 1, layer += 1) {
        for (var group = 0, factor = N >> layer; group < order; group += 1) {
          for (var bf = group, radix = group * factor; bf < N; bf += order << 1) {
            var bfr = bf + order;
            var tr = treal[radix] * real[bfr] - conj * timag[radix] * imag[bfr];
            var ti = treal[radix] * imag[bfr] + conj * timag[radix] * real[bfr];
            real[bfr] = real[bf] - tr;
            imag[bfr] = imag[bf] - ti;
            real[bf] = real[bf] + tr;
            imag[bf] = imag[bf] + ti;
          }
        }
      }
    }
  }]);
  return FFT;
}();
var PhaseVocoder = /*#__PURE__*/function () {
  function PhaseVocoder(winSize) {
    _classCallCheck(this, PhaseVocoder);
    this.winSize = winSize;
    this.ha = this.hs = Math.round(winSize >> 2);
    this.omega = Array.apply(null, Array(winSize >> 1 + 1)).map(function (x, i) {
      return 2 * Math.PI * i / winSize;
    });
    this.prevInputPhase = this._create_constant_array(winSize >> 1, 0);
    this.prevOutputPhase = this._create_constant_array(winSize >> 1, 0);
    this.overlapBuffers = new CBuffer(winSize).fill(0);
    this.owOverlapBuffers = new CBuffer(winSize).fill(0);
    this.framingWindow = Array.apply(null, Array(winSize)).map(function (x, i) {
      return Math.pow(Math.sin(Math.PI * i / winSize), 1);
    });
    this.squaredFramingWindow = this.framingWindow.map(function (x, i) {
      return x * x;
    });
    this.fft = new FFT(winSize);
    var hlfSize = Math.round(winSize >> 1) + 1;
    this.processObj = {
      fftObj: {
        real: new Float32Array(hlfSize),
        imag: new Float32Array(hlfSize),
        magnitude: new Float32Array(hlfSize),
        phase: new Float32Array(hlfSize)
      },
      pvObj: {
        real: this._create_constant_array(winSize, 0, Float32Array),
        imag: this._create_constant_array(winSize, 0, Float32Array),
        magnitude: this._create_constant_array(winSize, 0, Float32Array),
        phase: this._create_constant_array(winSize, 0, Float32Array)
      },
      processedFrame: new Float32Array(winSize)
    };
    this.pvStepObj = {
      phTh: new Float32Array(hlfSize)
    };
  }
  _createClass(PhaseVocoder, [{
    key: "_create_constant_array",
    value: function _create_constant_array(size, constant, T) {
      var arr = new (!T ? Array : T)(size);
      for (var i = -1; ++i < size;) {
        arr[i] = constant;
      }
      return arr;
    }
  }, {
    key: "process",
    value: function process(inputArray, outputArray) {
      // ----------------------------------
      // ----------ANALYSIS STEP-----------
      // ----------------------------------

      var fftObj = this.processObj.fftObj;
      var pvObj = this.processObj.pvObj;
      var processedFrame = this.processObj.processedFrame;
      // FOR SOME REASON, IF I DON'T CREATE A NEW "phase" ARHaY, I GET ARTIFACTS.
      var framingWindow = this.framingWindow;
      this.stft(inputArray, framingWindow, processedFrame, fftObj);
      var prevInputPhase = this.prevInputPhase;
      var prevOutputPhase = this.prevOutputPhase;
      var omega = this.omega;
      this.pv_step(fftObj, prevInputPhase, prevOutputPhase, omega, pvObj);
      this.prevOutputPhase = pvObj.phase;
      this.prevInputPhase = new Float32Array(fftObj.phase);
      this.istft(pvObj.real, pvObj.imag, processedFrame);

      // ----------------------------------
      // ------OVERLAP AND SLIDE STEP------
      // ----------------------------------

      var squaredFramingWindow = this.squaredFramingWindow;
      var overlapBuffers = this.overlapBuffers;
      var owOverBuffers = this.owOverlapBuffers;
      this.overlap_and_slide(processedFrame, squaredFramingWindow, overlapBuffers, owOverBuffers, outputArray);
    }
  }, {
    key: "pv_step",
    value: function pv_step(fftObj, prevInputPhase, prevOutputPhase, omega, pvObj) {
      var hs = this.hs;
      var ha = this.ha;
      var phase = fftObj.phase;
      var mag = fftObj.magnitude;
      var phTh = this.pvStepObj.phTh;
      for (var i = -1, index = 0, prevPeak = 0, prevRegStart = 0, prevInstPhaseAdv = 0; ++i < omega.length;) {
        var expectedPhaseAdv = omega[i] * ha;
        var auxHeterodynedPhaseIncr = phase[i] - prevInputPhase[i] - expectedPhaseAdv;
        var heterodynedPhaseIncr = auxHeterodynedPhaseIncr - 2 * Math.PI * Math.round(auxHeterodynedPhaseIncr / (2 * Math.PI));
        var instPhaseAdvPerSampleHop = omega[i] + heterodynedPhaseIncr / ha;
        var instPhaseAdv = instPhaseAdvPerSampleHop * hs;
        if (Math.max(mag[i - 2] | 0, mag[i - 1] | 0, mag[i + 1] | 0, mag[i + 2] | 0) < mag[i]) {
          var peak = i;
          var regStart = Math.ceil(prevPeak + peak >> 1) | 0;
          var reg = Math.max(0, regStart - prevRegStart);
          prevRegStart = regStart;
          for (var j = 0; j < reg; ++j, ++index) {
            phTh[index] = prevOutputPhase[prevPeak] + prevInstPhaseAdv - phase[prevPeak];
          }
          prevPeak = peak;
          prevInstPhaseAdv = instPhaseAdv;
        }
      }
      for (var _i7 = -1; ++_i7 < phTh.length;) {
        var theta = phTh[_i7];
        var phThRe = Math.cos(theta);
        var phThIm = Math.sin(theta);
        pvObj.real[_i7] = phThRe * fftObj.real[_i7] - phThIm * fftObj.imag[_i7];
        pvObj.imag[_i7] = phThRe * fftObj.imag[_i7] + phThIm * fftObj.real[_i7];
        pvObj.phase[_i7] = Math.atan2(pvObj.imag[_i7], pvObj.real[_i7]);
      }
    }
  }, {
    key: "overlap_and_slide",
    value: function overlap_and_slide(processedFrame, squaredFramingWindow, overlapBuffers, owOverlapBuffers, outputArray) {
      var hs = this.hs;
      var winSize = this.winSize;
      for (var i = -1; ++i < hs;) {
        var owSample = owOverlapBuffers.shift() || 0;
        var oSample = overlapBuffers.shift() || 0;
        outputArray.push(oSample / (owSample < 10e-3 ? 1 : owSample));
        overlapBuffers.push(0);
        owOverlapBuffers.push(0);
      }
      for (var _i8 = -1; ++_i8 < winSize;) {
        var _oSample = overlapBuffers.shift();
        var _owSample = owOverlapBuffers.shift();
        overlapBuffers.push(processedFrame[_i8] + _oSample);
        owOverlapBuffers.push(squaredFramingWindow[_i8] + _owSample);
      }
    }
  }, {
    key: "stft",
    value: function stft(inputFrame, windowFrame, processedFrame, fftObj) {
      var winSize = this.winSize;
      var fft = this.fft;
      var hlfSize = Math.round(winSize >> 1) + 1;
      for (var i = -1; ++i < winSize;) {
        processedFrame[i] = inputFrame[i] * windowFrame[i];
      }
      fft.forward(processedFrame);
      fftObj.real = fft.real;
      fftObj.imag = fft.imag;
      var real = fftObj.real,
        imag = fftObj.imag;
      var mag = fftObj.magnitude,
        phase = fftObj.phase;
      for (var _i9 = -1, n = winSize >> 1; ++_i9 < n;) {
        mag[_i9] = 2 * Math.sqrt(real[_i9] * real[_i9] + imag[_i9] * imag[_i9]) * 500;
        phase[_i9] = Math.atan2(imag[_i9], real[_i9]);
      }
    }
  }, {
    key: "istft",
    value: function istft(real, imag, timeFrame) {
      var fft = this.fft;
      fft.inverse(real, imag, timeFrame);
    }
  }, {
    key: "get_analysis_hop",
    value: function get_analysis_hop() {
      return this.ha;
    }
  }, {
    key: "get_synthesis_hop",
    value: function get_synthesis_hop() {
      return this.hs;
    }
  }, {
    key: "get_alpha",
    value: function get_alpha() {
      return Math.round(this.hs / this.ha * 10) / 10;
    }
  }, {
    key: "get_framing_window",
    value: function get_framing_window() {
      return this.framingWindow;
    }
  }, {
    key: "get_squared_framing_window",
    value: function get_squared_framing_window() {
      return this.squaredFramingWindow;
    }
  }, {
    key: "set_alpha",
    value: function set_alpha(alpha) {
      var winSize = this.winSize;
      this.ha = Math.round(winSize >> 2);
      this.hs = Math.round(alpha * this.ha);
    }
  }, {
    key: "get_alpha_step",
    value: function get_alpha_step() {
      return 1 / this.ha;
    }
  }, {
    key: "set_hops",
    value: function set_hops(ha, hs) {
      this.ha = ha;
      this.hs = hs;
    }
  }]);
  return PhaseVocoder;
}();
var BPV = /*#__PURE__*/function () {
  function BPV(buffer, frameSize) {
    _classCallCheck(this, BPV);
    this.frameSize = frameSize = frameSize || 4096;
    this.pvL = new PhaseVocoder(frameSize);
    this.pvR = new PhaseVocoder(frameSize);
    this.buffer = buffer;
    this.pos = 0;
    this.alpha = 1;
    this.midBufL = new CBuffer(Math.round(frameSize << 1));
    this.midBufR = new CBuffer(Math.round(frameSize << 1));
  }
  _createClass(BPV, [{
    key: "process",
    value: function process(outputBuffer) {
      var buffer = this.buffer;
      var frameSize = this.frameSize;
      var midBufL = this.midBufL;
      var midBufR = this.midBufR;
      if (!buffer) return;
      var sampleCounter = 0;

      // console.log(buffer.numberOfChannels);
      var il = buffer.getChannelData(0);
      var ir = buffer.getChannelData(1 < buffer.numberOfChannels ? 1 : 0);
      var ol = outputBuffer.getChannelData(0);
      var or = outputBuffer.getChannelData(1);
      while (0 < midBufR.size && sampleCounter < outputBuffer.length) {
        var index = sampleCounter++;
        ol[index] = midBufL.shift();
        or[index] = midBufR.shift();
      }
      if (outputBuffer.length === sampleCounter) return;
      do {
        var bufL = il.subarray(this.pos, this.pos + frameSize);
        var bufR = ir.subarray(this.pos, this.pos + frameSize);
        if (void 0 !== this.alpha && this.pvL.get_alpha() !== this.alpha && this.pvR.get_alpha() !== this.alpha) {
          this.pvL.set_alpha(this.alpha);
          this.pvR.set_alpha(this.alpha);
          this.alpha = void 0;
        }

        /* LEFT */
        this.pvL.process(bufL, midBufL);
        this.pvR.process(bufR, midBufR);
        for (var i = sampleCounter - 1; ++i < outputBuffer.length && this.midBufL.size > 0;) {
          ol[i] = midBufL.shift();
          or[i] = midBufR.shift();
        }
        sampleCounter += this.pvL.get_synthesis_hop();
        this.pos += this.pvL.get_analysis_hop();
      } while (outputBuffer.length > sampleCounter);
    }
  }, {
    key: "get_pos",
    value: function get_pos() {
      return this.pos;
    }
  }, {
    key: "set_pos",
    value: function set_pos(pos) {
      this.pos = pos;
    }
  }, {
    key: "get_alpha",
    value: function get_alpha() {
      return this.alpha;
    }
  }, {
    key: "set_alpha",
    value: function set_alpha(alpha) {
      this.alpha = alpha;
    }
  }]);
  return BPV;
}();
var _wait = /*#__PURE__*/new WeakSet();
var _createAudio = /*#__PURE__*/new WeakSet();
var _encodeWAVData = /*#__PURE__*/new WeakSet();
var _decodeBuffer = /*#__PURE__*/new WeakSet();
var _destory = /*#__PURE__*/new WeakSet();
var _start = /*#__PURE__*/new WeakSet();
var _resume = /*#__PURE__*/new WeakSet();
var _suspend = /*#__PURE__*/new WeakSet();
var AudioC = /*#__PURE__*/function () {
  function AudioC() {
    _classCallCheck(this, AudioC);
    _classPrivateMethodInitSpec(this, _suspend);
    _classPrivateMethodInitSpec(this, _resume);
    _classPrivateMethodInitSpec(this, _start);
    _classPrivateMethodInitSpec(this, _destory);
    _classPrivateMethodInitSpec(this, _decodeBuffer);
    _classPrivateMethodInitSpec(this, _encodeWAVData);
    _classPrivateMethodInitSpec(this, _createAudio);
    _classPrivateMethodInitSpec(this, _wait);
    this.sampleRate = 44100;
    this.bufferSize = 1024; // STFT帧移
    this.pos = 0;
    this.playbackRate = 1.0;
    this.gainValue = 1.5;

    // create web audio api context
    var _AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
    if (!(this.ctx = new _AudioContext())) {
      throw new Error('Web Audio API is Unsupported.');
    }
    // this.ctxLoadStart = new Date();
    // window.inter = (window.inter && clearInterval(window.inter)) || setInterval(() => {
    //     console.log(this.ctx.currentTime)
    // }, 1000);
    // Create AMR
    this.amr = new AMR({
      benchmark: false
    });
    if (!(this.ac = new AbortController())) {
      throw new Error('AbortController API is Unsupported.');
    }
    this.rawData = null;
    this.buffer = null;
    this.source = null;
    this.processor = null;
    this.analyser = null;
    this.gain = null;
    this.srcSec = 0;
    this.waitTime = 1000;
    this.totalTime = 0;
    this.onended = null;
  }
  _createClass(AudioC, [{
    key: "loadBlob",
    value: function loadBlob(blob) {
      var _this = this;
      return new Promise(function (resolve) {
        var reader = new window.FileReader();
        reader.onload = function (event) {
          var target = event.target;
          return resolve(target.result);
        };
        reader.readAsArrayBuffer(blob);
      }).then(function (data) {
        return _classPrivateMethodGet(_this, _decodeBuffer, _decodeBuffer2).call(_this, data);
      });
    }
  }, {
    key: "loadUrl",
    value: function loadUrl(url) {
      var _this2 = this;
      return new Promise(function (resolve, reject) {
        var xhr = new window.XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Access-Control-Allow-Headers', '*');
        xhr.setRequestHeader('Access-Control-Allow-Origin', '*');
        xhr.responseType = "arraybuffer";
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) return resolve(xhr.response);
        };
        xhr.onerror = function (event) {
          return reject(new Error("Failed to fetch ".concat(url)));
        };
        xhr.send();
      }).then(function (data) {
        return _classPrivateMethodGet(_this2, _decodeBuffer, _decodeBuffer2).call(_this2, data);
      });
    }
  }, {
    key: "playAudio",
    value: function playAudio() {
      _classPrivateMethodGet(this, _start, _start2).call(this);
    }
  }, {
    key: "stopAudio",
    value: function stopAudio() {
      _classPrivateMethodGet(this, _destory, _destory2).call(this);
    }
  }, {
    key: "resumeAudio",
    value: function resumeAudio() {
      _classPrivateMethodGet(this, _resume, _resume2).call(this);
    }
  }, {
    key: "suspendAudio",
    value: function suspendAudio() {
      _classPrivateMethodGet(this, _suspend, _suspend2).call(this);
    }
  }, {
    key: "skipAudio",
    value: function skipAudio(offset) {
      var buffer = this.buffer;
      this.srcSec = offset;
      this.pos = Math.round(this.srcSec * buffer.length / buffer.duration);
      // (function rec(self) {
      //     ++self.srcSec;
      //     self.#wait(self.waitTime).then(() => rec(self));
      // })(this);
      this.ac.abort();
      (function rec() {
        var _this3 = this;
        ++this.srcSec;
        _classPrivateMethodGet(this, _wait, _wait2).call(this, this.waitTime).then(function () {
          return rec.bind(_this3)();
        });
      }).bind(this)();
    }
  }, {
    key: "setPlaybackRate",
    value: function setPlaybackRate(value) {
      this.playbackRate = value;
      this.waitTime = Math.ceil(1000 / value);
    }
  }, {
    key: "setGainValue",
    value: function setGainValue(value) {
      this.gainValue = Math.max(0, Math.min(Math.round(value * 10) / 10, 1.5));
    }
  }, {
    key: "getTotalTime",
    value: function getTotalTime() {
      return this.totalTime;
    }
  }, {
    key: "getCurrentTime",
    value: function getCurrentTime() {
      return this.srcSec || 0;
    }
  }, {
    key: "getState",
    value: function getState() {
      return this.ctx.state;
    }
  }, {
    key: "onEnded",
    value: function onEnded(cb) {
      this.onended = cb;
    }
  }, {
    key: "getRawData",
    value: function getRawData() {
      return this.rawData;
    }
  }, {
    key: "getWavData",
    value: function getWavData(buffer) {
      var audioBuffer = buffer || this.buffer;
      var numberOfChannels = audioBuffer.numberOfChannels;
      var sampleRate = audioBuffer.sampleRate;
      var channelLength = audioBuffer.length;
      var totalLength = numberOfChannels * channelLength;
      var data = new Float32Array(totalLength);
      for (var i = -1, dst = 0; ++i < channelLength; dst += numberOfChannels) {
        for (var j = -1; ++j < numberOfChannels;) {
          data[j + dst] = audioBuffer.getChannelData(j)[i];
        }
      }
      var dataBuffer = data.buffer;
      return _classPrivateMethodGet(this, _encodeWAVData, _encodeWAVData2).call(this, dataBuffer, numberOfChannels, sampleRate);
    }
  }]);
  return AudioC;
}();
function _wait2(ms) {
  return new Promise(function (resolve) {
    var _this4 = this;
    var controller = this.ac = new AbortController();
    var signal = controller.signal;
    this.timer = this.timer && clearTimeout(this.timer) || setTimeout(resolve, ms);
    signal.addEventListener("abort", function () {
      _this4.timer && clearTimeout(_this4.timer);
    });
  }.bind(this));
}
function _createAudio2() {
  // create BufferSourceNode and Analyser and Gain
  this.source = this.ctx.createBufferSource();
  this.processor = this.ctx.createScriptProcessor(this.bufferSize, 1, 2);
  this.analyser = this.ctx.createAnalyser();
  this.gain = this.ctx.createGain();
  // connect source to analyser to gain node to speakers
  this.source.connect(this.processor);
  this.processor.connect(this.analyser);
  this.analyser.connect(this.gain);
  this.gain.connect(this.ctx.destination);
}
function _encodeWAVData2(buffer, numberOfChannels, sampleRate) {
  var dataBuffer = buffer;
  var numFrames = dataBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT;
  // wav header
  var bytesPerSample = 4,
    format = 3;
  var blockAlign = numberOfChannels * bytesPerSample;
  var byteRate = sampleRate * blockAlign;
  var dataSize = numFrames * blockAlign;
  var headBuffer = new ArrayBuffer(44);
  var dv = new DataView(headBuffer);
  var p = 0;
  function writeString(s) {
    for (var i = -1; ++i < s.length;) {
      dv.setUint8(p + i, s.charCodeAt(i));
    }
    p += s.length;
  }
  function writeUint32(d) {
    dv.setUint32(p, d, true);
    p += 4;
  }
  function writeUint16(d) {
    dv.setUint16(p, d, true);
    p += 2;
  }
  writeString('RIFF'); // ChunkID
  writeUint32(dataSize + 36); // ChunkSize
  writeString('WAVE'); // Format
  writeString('fmt '); // Subchunk1ID
  writeUint32(16); // Subchunk1Size
  writeUint16(format); // AudioFormat https://i.stack.imgur.com/BuSmb.png
  writeUint16(numberOfChannels); // NumChannels
  writeUint32(sampleRate); // SampleRate
  writeUint32(byteRate); // ByteRate
  writeUint16(blockAlign); // BlockAlign
  writeUint16(bytesPerSample * 8); // BitsPerSample
  writeString('data'); // Subchunk2ID
  writeUint32(dataSize); // Subchunk2Size

  var headerArray = new Uint8Array(headBuffer);
  var wavArray = new Uint8Array(headerArray.length + dataBuffer.byteLength);

  // prepend header, then add pcmBytes
  wavArray.set(headerArray, 0);
  wavArray.set(new Uint8Array(dataBuffer), headerArray.length);
  return wavArray;
}
function _decodeBuffer2(audioData) {
  var _this5 = this;
  _classPrivateMethodGet(this, _destory, _destory2).call(this);
  return new Promise(function (resolve) {
    var decodedData = _this5.amr.decode(new Uint8Array(_this5.rawData = audioData));
    if (!decodedData) {
      return resolve();
    }
    // let buf = this.ctx.createBuffer(1, decodedData.length, 8000);
    // (buf && buf.copyToChannel) ? buf.copyToChannel(decodedData, 0, 0): buf.getChannelData(0).set(decodedData);
    // console.log(buf);
    var wavData = _classPrivateMethodGet(_this5, _encodeWAVData, _encodeWAVData2).call(_this5, decodedData.buffer, 1, 8000);
    var AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
    if (!(_this5.ctx = new AudioContext({
      sampleRate: 8000
    }))) {
      throw new Error('Web Audio API is Unsupported.');
    }
    // console.log(this.ctx.sampleRate);
    var buffer = _this5.ctx.decodeAudioData(wavData.buffer);
    return resolve(buffer);
  }).then(function (buffer) {
    if (!!buffer) return buffer;
    var AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
    if (!(_this5.ctx = new AudioContext({
      sampleRate: 44100
    }))) {
      throw new Error('Web Audio API is Unsupported.');
    }
    // console.log(this.ctx.sampleRate);

    return _this5.ctx.decodeAudioData(_this5.rawData = audioData);
  }).then(function (buffer) {
    if (!buffer) {
      throw new Error("unsupported audio format");
    }
    // this.bufferLoadOffset = (new Date() - this.ctxLoadStart) / 1000;
    _this5.sampleRate = buffer.sampleRate;
    _this5.buffer = buffer;
    _this5.totalTime = buffer.duration;
    _this5.srcSec = 0 && ++_this5.srcSec;
    // this.interID && clearInterval(this.interID);
    // this.waitID && clearTimeout(this.waitID);
    _this5.ac.abort();
    return buffer;
  })["catch"](function (e) {
    console.error("Failed to decode: ".concat(e.message));
  });
}
function _destory2() {
  this.gain && this.gain.disconnect(this.ctx.destination);
  this.analyser && this.analyser.disconnect(this.gain);
  this.processor && this.processor.disconnect(this.analyser);
  this.source && this.source.disconnect(this.processor);
  this.source = this.processor = this.analyser = this.gain = null;
}
function _start2() {
  // const self = this;
  var buffer = this.buffer;
  this.source = this.ctx.createBufferSource();
  this.processor = this.ctx.createScriptProcessor(this.bufferSize, 1, 2);
  this.analyser = this.ctx.createAnalyser();
  this.gain = this.ctx.createGain();
  this.source.connect(this.processor);
  this.processor.connect(this.analyser);
  this.analyser.connect(this.gain);
  this.gain.connect(this.ctx.destination);

  // const sampleRate = buffer.sampleRate;
  var windowSize = 1024; // STFT帧长
  // const hopSize = 512 || windowSize / 4; // STFT帧移

  this.pv = new BPV(this.buffer, windowSize);
  this.processor.onaudioprocess = function (event) {
    var inputBuffer = event.inputBuffer;
    var outputBuffer = event.outputBuffer;
    var gainValue = this.gainValue;
    var playbackRate = this.playbackRate;
    var pos = this.pos;
    var buffer = this.buffer;
    if (void 0 !== gainValue) {
      this.gain.gain.value = gainValue;
      this.gainValue = void 0;
    }
    if (void 0 !== playbackRate) {
      this.pv.set_alpha(Math.round(1 / playbackRate * 10) / 10); // stretchFactor 倍速播放
      this.playbackRate = void 0;
    }
    if (void 0 !== pos) {
      this.pv.set_pos(pos);
      this.pos = void 0;
    }
    // console.log(buffer.length, Math.round(self.srcSec * buffer.length / buffer.duration))
    if (buffer.length < Math.round((this.srcSec - 1) * buffer.length / buffer.duration)) {
      this.ac.abort();
      _classPrivateMethodGet(this, _destory, _destory2).call(this);
    } else {
      this.pv.process(outputBuffer);
      var averageArray = outputBuffer.getChannelData(0);
      if (2 === outputBuffer.numberOfChannels) {
        var arrR = outputBuffer.getChannelData(1);
        for (var i = -1; ++i < arrR.length;) {
          averageArray[i] = (averageArray[i] + arrR[i]) / 2;
        }
      }
      inputBuffer.copyToChannel(averageArray, 0, 0);
    }
  }.bind(this);
  this.gain && (this.gain.gain.value = 1.5);
  this.source && (this.source.onended = this.onended);
  // start the source playing
  this.source && this.source.start(0, this.srcSec = 0);
  this.ac.abort();
  // ++this.srcSec;
  // this.interID = (this.interID && clearInterval(this.interID)) || setInterval(() => ++this.srcSec, 1000);
  // (function rec(self) {
  //     ++self.srcSec;
  //     self.#wait(self.waitTime).then(() => rec(self));
  // })(this);
  (function rec() {
    var _this6 = this;
    ++this.srcSec;
    _classPrivateMethodGet(this, _wait, _wait2).call(this, this.waitTime).then(function () {
      return rec.bind(_this6)();
    });
  }).bind(this)();
}
function _resume2() {
  this.ctx && this.ctx.resume();
  // this.interID = (this.interID && clearInterval(this.interID)) || setInterval(() => ++this.srcSec, 1000);
  // (function rec(self) {
  //     ++self.srcSec;
  //     self.#wait(self.waitTime).then(() => rec(self));
  // })(this);
  this.ac.abort();
  (function rec() {
    var _this7 = this;
    ++this.srcSec;
    _classPrivateMethodGet(this, _wait, _wait2).call(this, this.waitTime).then(function () {
      return rec.bind(_this7)();
    });
  }).bind(this)();
}
function _suspend2() {
  // const self = this;
  this.ctx && this.ctx.suspend();
  // this.interID && clearInterval(this.interID);
  // self.waitID && clearTimeout(self.waitID);
  this.ac.abort();
}
