
  /**
   * Different modes imply different block sizes:
   * modes    = MR475, MR515, MR59, MR67, MR74, MR795, MR102, MR122, MRSID
   * indexes  = 0,     1,     2,    3,    4,    5,     6,     7,     8
   * bits     = 12,    13,    15,   17,   19,   20,    26,    31,    5
   * samples  = 160
   */
  class AMRDecoder {
    constructor(params) {
      !params && (params = {});
      this.params = params;
      this.block_size = AMR.modes[5]; // MR795 by default
      this.frame_size = 160;
      this.params.benchmark;
    }

    init() {
      // Create decoder
      this.state = AMRNB.Decoder_Interface_init();

      // 'XXX' - change to parameters

      // Input Buffer
      this.input = AMRNB.allocate(new Int8Array(this.block_size + 1), 0);

      // Buffer to store the audio samples
      this.buffer = AMRNB.allocate(new Int16Array(this.frame_size), 0);
    }

    close() {
      AMRNB.Decoder_Interface_exit(this.state);
    }

    validate(magic) {
      let is_str = magic.constructor === String.prototype.constructor;
      if (is_str) {
        return (magic === AMR.MAGIC_NUMBER_STRING);
      }

      for (let i = -1; ++i < 6;) {
        if (AMR.MAGIC_NUMBER[i] !== magic[i]) {
          return false;
        }
      }

      return true;
    }

    read(offset, data) {
      // block_size = 31 ==> [mode(1):frames(30)]
      let is_str = data.constructor === String.prototype.constructor;
      //    dec_mode = is_str ? Binary.toUint8(data[0]) : data[0];

      // dec_mode = (dec_mode >> 3) & 0x000F;
      // let packet_size = AMR.modes[dec_mode] + 1;
      let packet_size = this.block_size + 1;
      let input_addr = this.input;
      let len = offset + packet_size > data.length ? data.length - offset + 1 : packet_size;

      for (let m = offset - 1, k = 0, bits; ++m < offset + len; k += 1) {
        bits = !is_str ? data[m] : Binary.toUint8(data[m]);
        AMRNB.setValue(input_addr + k, bits, 'i8');
      }

      return len;
    }

    write(offset, nframes, addr) {
      for (let m = 0, k = offset - 1; ++k < offset + nframes; m += 2) {
        this.output[k] = AMRNB.getValue(addr + m, "i16") / 32768;
      }
    }

    process(data) {
      let is_str = data.constructor === String.prototype.constructor,
          head = is_str ? data.substring(0, 6) : data.subarray(0, 6);
      if (!this.validate(head)) return;

      data = is_str ? data.substring(6) : data.subarray(6);
      let benchmark = !!this.params.benchmark;
      benchmark && console.time('decode');
      let output_offset = 0,
          offset = 0,
          len = 0;

      // Varies from quality
      let dec_mode = is_str ? Binary.toUint8(data[0]) : data[0];
      dec_mode = (dec_mode >> 3) & 0x000F;
      if (this.block_size != dec_mode) {
        this.block_size = AMR.modes[dec_mode]; // fix block_size error
        this.input = AMRNB.allocate(new Int8Array(this.block_size + 1), 0);
      }
      let total_packets = Math.ceil(data.length / this.block_size);
      let estimated_size = this.frame_size * total_packets;

      let input_addr = this.input;
      let buffer_addr = this.buffer;
      let state_addr = this.state;

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

        offset += len;
        output_offset += this.frame_size;
      }
      
      benchmark && console.timeEnd('decode');
      return new Float32Array(this.output.subarray(0, output_offset));
    }
  }

  class AMREncoder {
    constructor(params) {
      !params && (params = {});
      this.params = params;
      this.mode = params.mode || 5; // MR795 by default
      this.frame_size = 160;
      this.block_size = AMR.modes[this.mode];
      this.dtx = (params.dtx + 0) || 0;
    }

    init() {
      // Create Encoder
      this.state = AMRNB.Encoder_Interface_init(this.dtx);

      this.input = AMRNB.allocate(new Int16Array(this.frame_size), 0);
      this.buffer = AMRNB.allocate(new Int8Array(this.block_size + 1), 0);
    }

    read(offset, length, data) {
      let input_addr = this.input,
        len = offset + length > data.length ? data.length - offset : length;

      for (let m = offset - 1, k = 0; ++m < offset + len; k += 2) {
        AMRNB.setValue(input_addr + k, data[m], 'i16');
      }

      return len;
    }

    write(offset, nb, addr) {
      for (let m = 0, k = offset - 1; ++k < offset + nb; m += 1) {
        this.output[k] = AMRNB.getValue(addr + m, 'i8');
      }
    }

    process(pcmdata) {
      let benchmark = this.params.benchmark;
      benchmark && console.time('encode');
      let output_offset = 0,
        offset = 0,
        len, nb, err, tm_str,
        total_packets = Math.ceil(pcmdata.length / this.frame_size),
        estimated_size = this.block_size + total_packets;

      if (!this.output || this.output.length < estimated_size) {
        this.output = new Uint8Array(estimated_size + 6);
      }

      for (let i = -1; ++i < 6;) {
        this.output[i] = AMR.MAGIC_NUMBER[i];
      }
      output_offset += 6;

      let input_addr = this.input,
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

      return new Uint8Array(this.output.subarray(0, output_offset));
    }

    close() {
      AMRNB.Encoder_Interface_exit(this.state);
    }
  }

  class AMR {
    static modes = [12, 13, 15, 17, 19, 20, 26, 31, 5, 0, 0, 0, 0, 0, 0, 0];
    static MAGIC_NUMBER = [35, 33, 65, 77, 82, 10]
    static MAGIC_NUMBER_STRING = "#!AMR\n"

    constructor(params) {
      !params && (params = {});
      this.params = params;
      this.frame_size = params.frame_size || 320;

      this.ring_size = params.ring_size || 2304;

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

    init() {
      this.decoder.init();
      this.encoder.init();
    }

    encode(data, isFile) {
      if (!!isFile) {
        return this.encoder.process(data);
      }
      // ring spin
      for (let i = -1, j = this.ringoffset; ++i < data.length; ++j) {
        this.ring[j] = data[i];
      }
      this.ringoffset += data.length;
      // has enough to decode
      if ((this.ringoffset > this.linoffset) &&
        (this.ringoffset - this.linoffset < this.frame_size)) {
        return;
      }
      // buffer fill
      for (let i = -1; ++i < this.linbuf.length;) {
        this.linbuf[i] = this.ring[this.linoffset + i];
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

    decode(bitstream) {
      return this.decoder.process(bitstream);
    }

    close() {
      this.encoder.close();
      this.decoder.close();
    }

    onerror(message, code) {
      console.error("AMR Error " + code + ": " + message);
    }
  }

  class CBuffer {
    constructor(...args) {
      // if no arguments, then nothing needs to be set
      if (0 === args.length) {
        throw "Missing Argument: You must pass a valid buffer length"
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
    pop() {
      let item;
      if (0 === this.size) return;
      item = this.data[this.end];
      // remove the reference to the object so it can be garbage collected
      delete this.data[this.end];
      this.end = (this.end - 1 + this.length) % this.length;
      --this.size;
      return item;
    }

    // push item to the end
    push(...args) {
      // check if overflow is set, and if data is about to be overwritten
      if (this.overflow && this.length < this.size + args.length) {
        // call overflow function and send data that's about to be overwritten
        for (let i = -1; ++i < this.size + args.length - this.length;) {
          this.overflow(this.data[(this.end + i + 1) % this.length], this);
        }
      }
      // push items to the end, wrapping and erasing existing items
      // using arguments variable directly to reduce gc footprint
      for (let i = -1; ++i < args.length;) {
        this.data[(this.end + i + 1) % this.length] = args[i];
      }
      // recalculate size
      if (this.length > this.size) {
        if (this.length < this.size + args.length) this.size = this.length;
        else this.size += args.length;
      }
      // recalculate end
      this.end = (this.end + args.length) % this.length;
      // recalculate start
      this.start = (this.length + this.end - this.size + 1) % this.length;
      // return number current number of items in CBuffer
      return this.size;
    }

    reverse() {
      for (let i = -1; ++i < ~~(this.size >> 1);) {
        let tmp = this.data[(this.start + i) % this.length];
        this.data[(this.start + i) % this.length] = this.data[(this.start + (this.size - i - 1)) % this.length];
        this.data[(this.start + (this.size - i - 1)) % this.length] = tmp;
      }
      return this;
    }

    // rotate buffer to the left by cntr, or by 1
    rotateLeft(cntr) {
      if (void 0 === cntr) cntr = 1;
      if ('number' != typeof cntr) throw "Argument must be a number";
      while (0 <= --cntr) {
        this.push(this.shift());
      }
      return this;
    }

    // rotate buffer to the right by cntr, or by 1
    rotateRight(cntr) {
      if (void 0 === cntr) cntr = 1;
      if ('number' != typeof cntr) throw "Argument must be a number";
      while (0 <= --cntr) {
        this.unshift(this.pop());
      }
      return this;
    }

    // remove and return first item
    shift() {
      let item;
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
    unshift(...args) {
      // check if overflow is set, and if data is about to be overwritten
      if (this.overflow && this.length < this.size + args.length) {
        // call overflow function and send data that's about to be overwritten
        for (let i = -1; ++i < this.size + args.length;) {
          this.overflow(this.data[this.end - (i % this.length)], this);
        }
      }
      for (let i = -1; ++i < args.length;) {
        this.data[(this.length + this.start - (i % this.length) - 1) % this.length] = args[i];
      }
      if (0 > this.length - this.size) {
        this.end += this.length - this.size - args.length;
        if (0 > this.end) this.end = this.length + (this.end % this.length);
      }
      if (this.length > this.size) {
        if (this.length < this.size + args.length) this.size = this.length;
        else this.size += args.length;
      }
      this.start -= args.length;
      if (0 > this.start) this.start = this.length + (this.start % this.length);
      return this.size;
    }

    /* accessor methods */

    // return index of first metched element
    indexOf(arg, idx) {
      if (void 0 === idx) idx = 0;
      for (let i = idx - 1; ++i < this.size;) {
        if (arg === this.data[(this.start + idx) % this.length]) return idx;
      }
      return -1;
    }

    // return last index of the first match
    lastIndexOf(arg, idx) {
      if (void 0 === idx) idx = this.size - 1;
      for (let i = idx + 1; --i > -1;) {
        if (arg === this.data[(this.start + idx) % this.length]) return idx;
      }
      return -1;
    }

    // return the index an item would be inserted to if this
    // is a sorted circular buffer
    sortedIndex(value, comparitor, context) {
      comparitor = comparitor || ((a, b) => {
        return a === b ? 0 : a > b ? 1 : -1
      });
      let low = this.start;
      let high = this.size - 1;

      // Tricky part is finding if its before or after the pivot
      // we can get this info by checking if the target is less than
      // the last item. After that it's just a typical binary search
      if (low && 0 < comparitor.call(context, value, this.data[high])) {
        low = 0;
        high = this.end;
      }

      while (high > low) {
        let mid = (low + high) >>> 1;
        if (0 < comparitor.call(context, value, this.data[mid])) low = mid + 1;
        else high = mid;
      }
      return (((low - this.start) % this.size) + this.size) % this.size;
    }

    /* iteration methods */

    // check every item in the array against a test
    every(callback, context) {
      for (let i = -1; ++i < this.size;) {
        if (!callback.call(context, this.data[(this.start + i) % this.length], i, this)) return false;
      }
      return true;
    }

    // loop through each item in buffer
    // TODO: figure out how to emulate Array use better
    forEach(callback, context) {
      for (let i = -1; ++i < this.size;) {
        callback.call(context, this.data[(this.start + i) % this.length], i, this);
      }
    }

    // check items agains test until one returns true
    // TODO: figure out how to emuldate Array use better
    some(callback, context) {
      for (let i = -1; ++i < this.size;) {
        if (callback.call(context, this.data[(this.start + i) % this.length], i, this)) return true;
      }
      return false;
    }

    // calculate the average value of a circular buffer
    avg() {
      return 0 === this.size ? 0 : (this.sum() / this.size);
    }

    // loop through each item in buffer and calculate sum
    sum() {
      let index = this.size;
      let s = 0;
      while (--index) s += this.data[index];
      return s;
    }

    // loop through each item in buffer and calculate median
    median() {
      if (0 === this.size) return 0;
      let values = this.slice().sort((a, b) => {
        return a === b ? 0 : a > b ? 1 : -1
      });
      let half = Math.floor(values.length >> 1);
      if (values.length % 2) return values[half];
      else return (values[half - 1] + values[half]) / 2.0;
    }

    /* utility methods */
    // reset pointers to buffer with zero items
    // note: this will not remove values in cbuffer, so if for security values
    //       need to be overwritten, run .fill(null).empty()
    empty() {
      this.size = this.start = 0;
      this.end = this.length - 1;
      return this;
    }

    // fill all places with passed value or function
    fill(arg) {
      if ('function' == typeof arg) {
        for (let i = -1; ++i < this.length;) {
          this.data[i] = arg();
        }
      } else {
        for (let i = -1; ++i < this.length;) {
          this.data[i] = arg;
        }
      }
      // reposition start / end
      this.start = 0;
      this.end = this.length - 1;
      this.size = this.length;
      return this;
    }

    // return first item in buffer
    first() {
      return this.data[this.start];
    }

    // return last item in buffer
    last() {
      return this.data[this.end];
    }

    // return specific index in buffer
    get(arg) {
      return this.data[(this.start + arg) % this.length];
    }

    isFull() {
      return this.length === this.size;
    }

    // set value at specified index
    set(idx, arg) {
      return this.data[(this.start + idx) % this.length] = arg;
    }

    // return clean array of values
    toArray() {
      return this.slice();
    }

    // slice the buffer to an array
    slice(start, end) {
      let length = this.size;
      start = +start || 0;

      if (0 > start) {
        if (end <= start) return [];
        start = (-start > length) ? 0 : length + start;
      }

      if (null === end || length < end) {
        end += length;
      } else if (0 > end) {
        end += length;
      } else {
        end = +end || 0;
      }

      length = end > start ? end - start : 0;

      let result = Array(length);
      for (let i = 0; ++i < length;) {
        result[i] = this.data[(this.start + start + i) % this.length];
      }
      return result;
    }
  }

  class FFT {
    constructor(bufferSize) {
      this.bufferSize = bufferSize;

      this.real = new Float64Array(bufferSize);
      this.imag = new Float64Array(bufferSize);

      this.rbo = new Uint32Array(bufferSize);
      for (let limit = 1, bit = bufferSize >> 1; bufferSize > limit; limit <<= 1, bit >>= 1) {
        for (let i = -1, offset = limit; ++i < limit; ++offset) {
          this.rbo[offset] = this.rbo[i] + bit;
        }
      }

      this.treal = new Float64Array(bufferSize >> 1);
      this.timag = new Float64Array(bufferSize >> 1);
      for (let i = -1, n = bufferSize >> 1; ++i < n;) {
        this.treal[i] = +Math.cos((Math.PI * i) / n);
        this.timag[i] = -Math.sin((Math.PI * i) / n);
      }
    }

    forward(buffer) {
      const bufferSize = this.bufferSize;
      const rbo = this.rbo;
      const real = this.real;
      const imag = this.imag;

      // let k = Math.floor(Math.log(bufferSize) / Math.LN2);

      // if (Math.pow(2, k) !== bufferSize) { throw "Invalid buffer size, must be a power of 2." };
      if (!!(bufferSize & (bufferSize - 1))) {
        throw "Invalid buffer size, must be a power of 2."
      }
      if (buffer.length !== bufferSize) {
        throw "Supplied buffer is not the same size as defined FFT. FFT Size: " + bufferSize + " Buffer Size: " + buffer.length;
      }

      for (let i = -1; ++i < bufferSize;) {
        real[i] = buffer[rbo[i]];
        imag[i] = 0;
      }

      this.transform(real, imag, 1);
    }

    inverse(real, imag, buffer) {
      const bufferSize = this.bufferSize;
      const rbo = this.rbo;

      real = real || this.real;
      imag = imag || this.imag;

      let revReal = new Float64Array(bufferSize);
      let revImag = new Float64Array(bufferSize);

      for (let i = -1; ++i < real.length;) {
        revReal[i] = real[rbo[i]];
        revImag[i] = imag[rbo[i]];
      }

      real = revReal;
      imag = revImag;

      this.transform(real, imag, -1);

      for (let i = -1; ++i < bufferSize;) {
        buffer[i] = real[i] / bufferSize;
      }
    }

    transform(real, imag, conj) {
      const bufferSize = this.bufferSize;
      const treal = this.treal;
      const timag = this.timag;

      for (let layer = 1, order = 1, N = bufferSize; order < N; order <<= 1, layer += 1) {
        for (let group = 0, factor = N >> layer; group < order; group += 1) {
          for (let bf = group, radix = group * factor; bf < N; bf += order << 1) {
            let bfr = bf + order;
            let tr = (treal[radix] * real[bfr]) - (conj * timag[radix] * imag[bfr]);
            let ti = (treal[radix] * imag[bfr]) + (conj * timag[radix] * real[bfr]);

            real[bfr] = real[bf] - tr;
            imag[bfr] = imag[bf] - ti;
            real[bf] = real[bf] + tr;
            imag[bf] = imag[bf] + ti;
          }
        }
      }
    }
  }

  class PhaseVocoder {
    constructor(winSize) {
      const hlfSize = (winSize >> 1) + 1;

      this.winSize = winSize;
      this.ha = this.hs = Math.round(winSize >> 2);
      this.omega = new Float64Array(hlfSize);
      for (let i = -1, n = hlfSize; ++i < n; ) {
	this.omega[i] = Math.PI * i / n;
      }

      this.prevInputPhase = this._create_constant_array(winSize >> 1, 0, Float64Array);
      this.prevOutputPhase = this._create_constant_array(winSize >> 1, 0, Float64Array);

      this.overlapBuffers = new CBuffer(winSize).fill(0);
      this.owOverlapBuffers = new CBuffer(winSize).fill(0);

      // Hann Window
      this.framingWindow = new Float64Array(winSize);
      for (let i = -1, N = winSize; ++i < N; ) {
	this.framingWindow[i] = Math.pow(Math.sin(Math.PI * i / (N - 1)), 2);
      }

      this.fft = new FFT(winSize);


      this.processObj = {
        fftObj: {
          real: new Float64Array(hlfSize),
          imag: new Float64Array(hlfSize),
          magnitude: new Float64Array(hlfSize),
          phase: new Float64Array(hlfSize)
        },
        pvObj: {
          real: this._create_constant_array(winSize, 0, Float32Array),
          imag: this._create_constant_array(winSize, 0, Float32Array),
          magnitude: this._create_constant_array(winSize, 0, Float32Array),
          phase: this._create_constant_array(winSize, 0, Float32Array)
        },
        processedFrame: new Float64Array(winSize)
      }
      this.pvStepObj = {
        phTh: new Float64Array(hlfSize)
      }
    }

    _create_constant_array(size, constant, T) {
      let arr = new((!T) ? Array : T)(size);
      for (let i = -1; ++i < size;) {
        arr[i] = constant;
      }
      return arr;
    }

    process(inputArray, outputArray) {
      // ----------------------------------
      // ----------ANALYSIS STEP-----------
      // ----------------------------------
      const fftObj = this.processObj.fftObj;
      const pvObj = this.processObj.pvObj;
      const processedFrame = this.processObj.processedFrame;
      // FOR SOME REASON, IF I DON'T CREATE A NEW "phase" ARHaY, I GET ARTIFACTS.
      this.stft(inputArray, processedFrame, fftObj);
      const prevInputPhase = this.prevInputPhase;
      const prevOutputPhase = this.prevOutputPhase;
      const omega = this.omega;
      this.pv_step(fftObj, prevInputPhase, prevOutputPhase, omega, pvObj);
      this.prevOutputPhase = pvObj.phase;
      this.prevInputPhase = new Float32Array(fftObj.phase);
      this.istft(pvObj.real, pvObj.imag, processedFrame);

      // ----------------------------------
      // ------OVERLAP AND SLIDE STEP------
      // ----------------------------------
      const overlapBuffers = this.overlapBuffers;
      const owOverlapBuffers = this.owOverlapBuffers;
      this.overlap_and_slide(processedFrame, overlapBuffers, owOverlapBuffers, outputArray);
    }

    pv_step(fftObj, prevInputPhase, prevOutputPhase, omega, pvObj) {
      const hs = this.hs;
      const ha = this.ha;
      let phase = fftObj.phase;
      let mag = fftObj.magnitude;
      let phTh = this.pvStepObj.phTh;

      for (let i = -1, index = 0, prevPeak = 0, prevRegStart = 0, prevInstPhaseAdv = 0; ++i < omega.length;) {
        let expectedPhaseAdv = omega[i] * ha;

        let auxHeterodynedPhaseIncr = (phase[i] - prevInputPhase[i]) - expectedPhaseAdv;
        let heterodynedPhaseIncr = auxHeterodynedPhaseIncr - (2 * Math.PI) * Math.round(auxHeterodynedPhaseIncr / (2 * Math.PI));

        let instPhaseAdvPerSampleHop = omega[i] + heterodynedPhaseIncr / ha;

        let instPhaseAdv = instPhaseAdvPerSampleHop * hs;

        if (Math.max((mag[i - 2] | 0), (mag[i - 1] | 0), (mag[i + 1] | 0), (mag[i + 2] | 0)) < mag[i]) {
          let peak = i;
          let regStart = Math.ceil((prevPeak + peak) >> 1) | 0;
          let reg = Math.max(0, regStart - prevRegStart);
          prevRegStart = regStart;
          for (let j = 0; j < reg; ++j, ++index) {
            phTh[index] = prevOutputPhase[prevPeak] + prevInstPhaseAdv - phase[prevPeak];
          }
          prevPeak = peak;
          prevInstPhaseAdv = instPhaseAdv;
        }
      }

      for (let i = -1; ++i < phTh.length;) {
        let theta = phTh[i];

        let phThRe = Math.cos(theta);
        let phThIm = Math.sin(theta);

        pvObj.real[i] = phThRe * fftObj.real[i] - phThIm * fftObj.imag[i];
        pvObj.imag[i] = phThRe * fftObj.imag[i] + phThIm * fftObj.real[i];
        pvObj.phase[i] = Math.atan2(pvObj.imag[i], pvObj.real[i]);
      }
    }

    overlap_and_slide(processedFrame, overlapBuffers, owOverlapBuffers, outputArray) {
      const hs = this.hs;
      const winSize = this.winSize;
      const framingWindow = this.framingWindow;

      for (let i = -1; ++i < hs;) {
        let oSample = overlapBuffers.shift() || 0;
        let owSample = owOverlapBuffers.shift() || 1;

        outputArray.push(oSample / Math.max(10e-3, owSample));
        // outputArray.push(oSample);

        overlapBuffers.push(0);
        owOverlapBuffers.push(0);
      }

      for (let i = -1; ++i < winSize;) {
        let oSample = overlapBuffers.shift();
        let owSample = owOverlapBuffers.shift();

        overlapBuffers.push(processedFrame[i] + oSample);
        owOverlapBuffers.push(framingWindow[i] + owSample);
      }
    }

    stft(inputFrame, processedFrame, fftObj) {
      const winSize = this.winSize;
      const fft = this.fft;
      const hlfSize = Math.round(winSize >> 1) + 1;
      const framingWindow = this.framingWindow;

      for (let i = -1; ++i < winSize;) {
        processedFrame[i] = inputFrame[i] * framingWindow[i];
      }

      fft.forward(processedFrame);
      fftObj.real = fft.real;
      fftObj.imag = fft.imag;

      let real = fftObj.real, imag = fftObj.imag;
      let mag = fftObj.magnitude, phase = fftObj.phase;

      for (let i = -1, n = winSize >> 1; ++i < n; ) {
        mag[i] = 2 * Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        phase[i] = Math.atan2(imag[i], real[i]);
      }
    }

    istft(real, imag, timeFrame) {
      const fft = this.fft;

      fft.inverse(real, imag, timeFrame);
    }

    get_analysis_hop() {
      return this.ha;
    }

    get_synthesis_hop() {
      return this.hs;
    }

    get_alpha() {
      return Math.round(this.hs / this.ha * 10) / 10;
    }

    get_framing_window() {
      return this.framingWindow;
    }

    get_squared_framing_window() {
      return this.squaredFramingWindow;
    }

    set_alpha(alpha) {
      const winSize = this.winSize;

      this.ha = Math.round(winSize >> 2);
      this.hs = Math.round(alpha * this.ha);
    }

    get_alpha_step() {
      return 1 / this.ha;
    }

    set_hops(ha, hs) {
      this.ha = ha;
      this.hs = hs;
    }
  }

  class BPV {
    constructor(buffer, frameSize) {
      this.frameSize = frameSize = frameSize || 4096;
      this.pvL = new PhaseVocoder(frameSize);
      this.pvR = new PhaseVocoder(frameSize);
      this.buffer = buffer;
      this.pos = 0;
      this.alpha = 1;

      this.midBufL = new CBuffer(Math.round(frameSize << 1));
      this.midBufR = new CBuffer(Math.round(frameSize << 1));
    }

    process(outputBuffer) {
      const buffer = this.buffer;
      const frameSize = this.frameSize;
      const midBufL = this.midBufL;
      const midBufR = this.midBufR;
      if (!buffer) return;
      let sampleCounter = 0;

      // console.log(buffer.numberOfChannels);
      const il = buffer.getChannelData(0);
      const ir = buffer.getChannelData(1 < buffer.numberOfChannels ? 1 : 0);
      const ol = outputBuffer.getChannelData(0);
      const or = outputBuffer.getChannelData(1);

      while (0 < midBufR.size && sampleCounter < outputBuffer.length) {
        let index = sampleCounter++;
        ol[index] = midBufL.shift();
        or[index] = midBufR.shift();
      }

      if (outputBuffer.length === sampleCounter) return;

      do {
        const bufL = il.subarray(this.pos, this.pos + frameSize);
        const bufR = ir.subarray(this.pos, this.pos + frameSize);

        if (void 0 !== this.alpha &&
          (
            this.pvL.get_alpha() !== this.alpha &&
            this.pvR.get_alpha() !== this.alpha
          )) {
          this.pvL.set_alpha(this.alpha);
          this.pvR.set_alpha(this.alpha);
          this.alpha = void 0;
        }

        /* LEFT */
        this.pvL.process(bufL, midBufL);
        this.pvR.process(bufR, midBufR);

        for (let i = sampleCounter - 1; ++i < outputBuffer.length && this.midBufL.size > 0;) {
          ol[i] = midBufL.shift();
          or[i] = midBufR.shift();
        }

        sampleCounter += this.pvL.get_synthesis_hop();
        this.pos += this.pvL.get_analysis_hop();
      } while (outputBuffer.length > sampleCounter);
    }

    get_pos() {
      return this.pos;
    }

    set_pos(pos) {
      this.pos = pos;
    }

    get_alpha() {
      return this.alpha;
    }

    set_alpha(alpha) {
      this.alpha = alpha;
    }
  }

  class AudioC {
    constructor() {
      this.sampleRate = 44100;
      this.bufferSize = 1024; // STFT帧移
      this.pos = 0;
      this.playbackRate = 1.0;
      this.gainValue = 1.5;

      /*
      // create web audio api context
      const AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
      if (!(this.ctx = new AudioContext())) {
        throw new Error('Web Audio API is Unsupported.');
      }
      */
      // this.ctxLoadStart = new Date();
      // window.inter = (window.inter && clearInterval(window.inter)) || setInterval(() => {
      //     console.log(this.ctx.currentTime)
      // }, 1000);
      // Create AMR
      this.amr = new AMR({benchmark: false});
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
      // this.waitTime = 1000;
      this.totalTime = 0;

      this.onended = null;

      this.paused = false;
    }

    #wait(ms) {
      return new Promise(function(resolve) {
        const controller = this.ac = new AbortController();
        const signal = controller.signal;
        this.timer = (this.timer && clearTimeout(this.timer)) || setTimeout(resolve, ms);

        signal.addEventListener("abort", () => {
          this.timer && clearTimeout(this.timer);
        });
      }.bind(this));
    }

    /*
    #createAudio() {
      // create web audio api context
      const AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
      if (!(this.ctx = new AudioContext())) {
        throw new Error('Web Audio API is Unsupported.');
      }
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
    */

    #encodeWAVData(buffer, numberOfChannels, sampleRate) {
      const dataBuffer = buffer;
      const numFrames = dataBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT;
      // wav header
      const bytesPerSample = 4, format = 3;
      const blockAlign = numberOfChannels * bytesPerSample;
      const byteRate = sampleRate * blockAlign;
      const dataSize = numFrames * blockAlign;
      const headBuffer = new ArrayBuffer(44);
      const dv = new DataView(headBuffer);

      let p = 0;

      function writeString(s) {
        for (let i = -1; ++i < s.length;) {
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

      writeString('RIFF') // ChunkID
      writeUint32(dataSize + 36) // ChunkSize
      writeString('WAVE') // Format
      writeString('fmt ') // Subchunk1ID
      writeUint32(16) // Subchunk1Size
      writeUint16(format) // AudioFormat https://i.stack.imgur.com/BuSmb.png
      writeUint16(numberOfChannels) // NumChannels
      writeUint32(sampleRate) // SampleRate
      writeUint32(byteRate) // ByteRate
      writeUint16(blockAlign) // BlockAlign
      writeUint16(bytesPerSample * 8) // BitsPerSample
      writeString('data') // Subchunk2ID
      writeUint32(dataSize) // Subchunk2Size

      const headerArray = new Uint8Array(headBuffer);
      const wavArray = new Uint8Array(headerArray.length + dataBuffer.byteLength);

      // prepend header, then add pcmBytes
      wavArray.set(headerArray, 0);
      wavArray.set(new Uint8Array(dataBuffer), headerArray.length);

      return wavArray;
    }

    #decodeBuffer(audioData) {
      this.#destroy();
      return new Promise(resolve => {
        const decodedData = this.amr.decode(new Uint8Array(this.rawData = audioData));
        if (!decodedData) {
          return resolve();
        }
        // create web audio api context
	      const AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
	      if (!(this.ctx = new AudioContext({sampleRate: 8000}))) {
	        throw new Error('Web Audio API is Unsupported.');
	      }
        // console.time('buffer_1')
	      let buf = this.ctx.createBuffer(1, decodedData.length, 8000);
	      (buf && buf.copyToChannel) ? buf.copyToChannel(decodedData, 0, 0): buf.getChannelData(0).set(decodedData);
	      // console.log(buf);
        // console.timeEnd('buffer_1')
        /*
        console.time('buffer_2')
	      let wavData = this.#encodeWAVData(decodedData.buffer, 1, 8000);
	      // console.log(this.ctx.sampleRate);
	      let buffer = this.ctx.decodeAudioData(wavData.buffer);
        console.timeEnd('buffer_2')
        */

        return resolve(buf);
      }).then(buffer => {
        if (!!buffer) return buffer;
        // create web audio api context
	      const AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
	      if (!(this.ctx = new AudioContext({sampleRate: 44100}))) {
	        throw new Error('Web Audio API is Unsupported.');
	      }
	      // console.log(this.ctx.sampleRate);

        return this.ctx.decodeAudioData(this.rawData = audioData);
      }).then(buffer => {
        if (!buffer) {
          throw new Error("unsupported audio format");
        }
        // this.bufferLoadOffset = (new Date() - this.ctxLoadStart) / 1000;
        this.sampleRate = buffer.sampleRate;
        this.buffer = buffer;
        this.totalTime = buffer.duration;
        this.srcSec = 0;
        // this.interID && clearInterval(this.interID);
        // this.waitID && clearTimeout(this.waitID);
        // this.ac.abort();

	      return buffer;
      }).catch((e) => {
        console.error(`Failed to decode: ${e.message}`);
      });
    }

    loadBlob(blob) {
      return new Promise(resolve => {
        const reader = new window.FileReader();
        reader.onload = function(event) {
          const target = event.target;
          return resolve(target.result);
        };
        reader.readAsArrayBuffer(blob);
      }).then(data => {
        return this.#decodeBuffer(data);
      });
    }

    loadUrl(url) {
      return new Promise((resolve, reject) => {
        const xhr = new window.XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Access-Control-Allow-Headers', '*');
        xhr.setRequestHeader('Access-Control-Allow-Origin', '*');
        xhr.responseType = "arraybuffer";
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) return resolve(xhr.response);
        }
        xhr.onerror = function(event) {
          return reject(new Error(`Failed to fetch ${url}`));
        }
        xhr.send();
      }).then(data => {
        return this.#decodeBuffer(data);
      });
    }

    loadDataUrl(dataUrl) {
      return new Promise((resolve, reject) => {
      });
    }

    #destroy() {
      this.gain && this.gain.disconnect(this.ctx.destination);
      this.analyser && this.analyser.disconnect(this.gain);
      this.processor && this.processor.disconnect(this.analyser);
      this.source && this.source.disconnect(this.processor);
      // this.ctx && this.ctx.close();

      // this.source = this.processor = this.analyser = this.gain = null;
      this.source = this.processor = this.analyser = this.gain = null;

      this.paused = true;
    }

    #start() {
      // const self = this;
      const buffer = this.buffer;

      this.source = this.ctx.createBufferSource();
      this.processor = this.ctx.createScriptProcessor(this.bufferSize, 1, 2);
      this.analyser = this.ctx.createAnalyser();
      this.gain = this.ctx.createGain();

      this.source.connect(this.processor);
      this.processor.connect(this.analyser);
      this.analyser.connect(this.gain);
      this.gain.connect(this.ctx.destination);

      // const sampleRate = buffer.sampleRate;
      const windowSize = 1024; // STFT帧长
      // const hopSize = 512 || windowSize / 4; // STFT帧移

      this.pv = new BPV(this.buffer, windowSize);

      const bufferSize = buffer.length;
      this.processor.onaudioprocess = function(event) {
        const inputBuffer = event.inputBuffer;
        const outputBuffer = event.outputBuffer;

        let gainValue = this.gainValue;
        let playbackRate = this.playbackRate;
        let pos = this.pos;
        const buffer = this.buffer;

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
        if (bufferSize > Math.round((this.srcSec) * bufferSize / buffer.duration)) {
          // console.log(this.pv.pos, bufferSize);
          this.srcSec = this.pv.pos / bufferSize * buffer.duration;
          // console.log(this.srcSec);
          this.pv.process(outputBuffer);
          let averageArray = outputBuffer.getChannelData(0);
          if (2 === outputBuffer.numberOfChannels) {
            let arrR = outputBuffer.getChannelData(1);
            for (let i = -1; ++i < arrR.length;) {
              averageArray[i] = (averageArray[i] + arrR[i]) / 2;
            }
          }
          inputBuffer.copyToChannel(averageArray, 0, 0);
        } else {
	        // this.ac.abort();
          this.#destroy();
          this.onended && this.onended(); // call ended method
        }
      }.bind(this);
      this.gain && (this.gain.gain.value = 1.5);

      // this.source && (this.source.onended = this.onended); // Deprecated
      // start the source playing
      this.source && this.source.start(0, this.srcSec = 0);
      // this.ac.abort();
      // ++this.srcSec;
      // this.interID = (this.interID && clearInterval(this.interID)) || setInterval(() => ++this.srcSec, 1000);
      // (function rec(self) {
      //     ++self.srcSec;
      //     self.#wait(self.waitTime).then(() => rec(self));
      // })(this);
      /*
      (function rec() {
        ++this.srcSec;
        this.#wait(this.waitTime).then(() => rec.bind(this)());
      }.bind(this))();
      */
    }

    #resume() {
      const self = this;
      let p = this.ctx && this.ctx.resume();
      // this.interID = (this.interID && clearInterval(this.interID)) || setInterval(() => ++this.srcSec, 1000);
      // (function rec(self) {
      //     ++self.srcSec;
      //     self.#wait(self.waitTime).then(() => rec(self));
      // })(this);
      return p.then(() => {
        /*
        self.ac.abort();
        (function rec() {
          ++this.srcSec;
          this.#wait(this.waitTime).then(() => rec.bind(this)());
        }.bind(self))();
        */
      });
    }

    #suspend() {
      const self = this;
      let p = self.ctx && self.ctx.suspend();
      // this.interID && clearInterval(this.interID);
      // self.waitID && clearTimeout(self.waitID);
      return p.then(() => {
        // self.ac.abort();
      });
    }

    play() {
      if (!!this.source || 'suspended' === this.ctx.state) {
        this.#resume();
      }
      if (!this.source) {
        this.#start();
      }
      this.paused = false;
    }

    pause() {
      this.#suspend();
      this.paused = true;
    }

    skip(offset) {
      const buffer = this.buffer;

      this.srcSec = offset;
      this.pos = Math.round(this.srcSec * buffer.length / buffer.duration);
      // (function rec(self) {
      //     ++self.srcsec;
      //     self.#wait(self.waittime).then(() => rec(self));
      // })(this);
      /*
      this.ac.abort();
      (function rec() {
        ++this.srcSec;
        this.#wait(this.waitTime).then(() => rec.bind(this)());
      }.bind(this))();
      */
    }

    onEnded(callback) {
      this.onended = callback;
    }

    getCurrentTime() {
      return this.srcSec || 0;
    }

    getTotalTime() {
      return this.totalTime;
    }

    setGainValue(value) {
      this.gainValue = Math.max(0, Math.min(Math.round(value * 10) / 10, 1.5));
    }

    setPlaybackRate(value) {
      this.playbackRate = value;
      // this.waitTime = Math.ceil(1000 / value);
    }

    isPaused() {
      return this.paused;
    }

    getWavData() {
      const audioBuffer = buffer || this.buffer;
      const numberOfChannels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const channelLength = audioBuffer.length;
      const totalLength = numberOfChannels * channelLength;
      const data = new Float32Array(totalLength);
      for (let i = -1, dst = 0; ++i < channelLength; dst += numberOfChannels) {
	      for (let j = -1; ++j < numberOfChannels;) {
	        data[j + dst] = audioBuffer.getChannelData(j)[i];
	      }
      }
      const dataBuffer = data.buffer;
      
      return this.#encodeWAVData(dataBuffer, numberOfChannels, sampleRate);
    }
  }
