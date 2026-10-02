'use strict';

// BitKnit 2 decompressor (RAD's compressor for Granny 2 sections, used by EVE's ship models).
//
// Written from the format description in libbg3's docs/bitknit2.txt (MIT, https://github.com/eiz/libbg3), without
// reference to any other implementation. In short: LZ-style literals and copies, entropy coded with two interleaved
// rANS streams (32-bit states, 15-bit probabilities) and adaptive models that are rebuilt every 1024 symbols. The
// output is decoded in 64 KiB "quanta", each with its own rANS state; the models carry over between quanta.

const MAGIC = 0x75b1;
const QUANTUM = 0x10000;
const PROB_BITS = 15;
const PROB_ONE = 1 << PROB_BITS;
const ADAPT_INTERVAL = 1024;

// An adaptive frequency model over `size` symbols, the last `minProbable` of which start at the minimum probability.
class Model {
    constructor(size, minProbable = 0) {
        this.size = size;
        this.cdf = new Int32Array(size + 1);
        const equal = size - minProbable;
        for (let i = 0; i <= size; i++) {
            this.cdf[i] = i < equal ? Math.floor((PROB_ONE - minProbable) * i / equal) : PROB_ONE - size + i;
        }
        this.freq = new Int32Array(size).fill(1);
        this.count = 0;
        this.increment = Math.floor((PROB_ONE - size) / ADAPT_INTERVAL);
        this.lastIncrement = PROB_ONE + 1 - size - ADAPT_INTERVAL * this.increment;
    }

    // the symbol whose range holds code (0 <= code < 2^15)
    find(code) {
        let lo = 0;
        let hi = this.size - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (this.cdf[mid] <= code) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        return lo;
    }

    update(symbol) {
        this.freq[symbol] += this.increment;
        if (++this.count < ADAPT_INTERVAL) {
            return;
        }
        this.count = 0;
        this.freq[symbol] += this.lastIncrement;

        // move the distribution halfway towards the observed frequencies
        let sum = 0;
        for (let i = 0; i <= this.size; i++) {
            this.cdf[i] += (sum - this.cdf[i]) >> 1;
            if (i < this.size) {
                sum += this.freq[i];
            }
        }
        this.freq.fill(1);
    }
}

class Decoder {
    constructor(src, dst) {
        this.src = src;   // Uint8Array
        this.dst = dst;   // Uint8Array, its length is the decompressed size
        this.srcPos = 0;
        this.dstPos = 0;

        this.commandModels = [0, 1, 2, 3].map(() => new Model(300, 36));
        this.cacheModels = [0, 1, 2, 3].map(() => new Model(40));
        this.offsetLengthModel = new Model(21);
        this.offsetCache = [1, 1, 1, 1, 1, 1, 1, 1];
        this.lastOffset = 1;
        this.state1 = 0;
        this.state2 = 0;
    }

    word() {
        if (this.srcPos + 2 > this.src.length) {
            throw new Error('BitKnit: compressed data ended early');
        }
        const w = this.src[this.srcPos] | (this.src[this.srcPos + 1] << 8);
        this.srcPos += 2;
        return w;
    }

    renormalize() {
        if (this.state1 < 0x10000) {
            this.state1 = this.state1 * 0x10000 + this.word();
        }
        const t = this.state1;
        this.state1 = this.state2;
        this.state2 = t;
    }

    bits(count) {
        const p = 2 ** count;
        const value = this.state1 % p;
        this.state1 = Math.floor(this.state1 / p);
        this.renormalize();
        return value;
    }

    symbol(model) {
        const code = this.state1 % PROB_ONE;
        const s = model.find(code);
        const lo = model.cdf[s];
        const freq = model.cdf[s + 1] - lo;
        this.state1 = freq * Math.floor(this.state1 / PROB_ONE) + code - lo;
        this.renormalize();
        model.update(s);
        return s;
    }

    initState() {
        const i0 = this.word();
        const i1 = this.word();
        let init = Math.floor((i0 * 0x10000 + i1) / 16);
        const highBits = i1 % 16;
        if (init < 0x10000) {
            init = init * 0x10000 + this.word();
        }
        this.state1 = Math.floor(init / 2 ** highBits);
        if (this.state1 < 0x10000) {
            this.state1 = this.state1 * 0x10000 + this.word();
        }
        const span = 2 ** (16 + highBits);
        this.state2 = span + (init * 0x10000 + this.word()) % span;
    }

    command() {
        const pos = this.dstPos;
        const v = this.symbol(this.commandModels[pos % 4]);
        if (v < 256) {
            this.dst[pos] = (v + this.dst[pos - this.lastOffset]) & 0xff;
            this.dstPos++;
            return;
        }

        let length;
        if (v < 288) {
            length = v - 254;
        } else {
            const b = v - 287;
            length = 2 ** b + this.bits(b) + 32;
        }

        const ref = this.symbol(this.cacheModels[pos % 4]);
        let offset;
        if (ref < 8) {
            offset = this.offsetCache[ref];
            this.offsetCache.splice(ref, 1);
            this.offsetCache.unshift(offset);
        } else {
            const b = this.symbol(this.offsetLengthModel);
            let l = this.bits(b % 16);
            if (b >= 16) {
                l = l * 0x10000 + this.word();
            }
            offset = 2 ** (5 + b) + 32 * l + ref - 39;
            this.offsetCache[7] = this.offsetCache[6];
            this.offsetCache[6] = offset;
        }

        if (offset > pos || pos + length > this.dst.length) {
            throw new Error(`BitKnit: copy out of range at ${pos} (offset ${offset}, length ${length})`);
        }
        for (let i = 0; i < length; i++) {
            this.dst[pos + i] = this.dst[pos + i - offset];
        }
        this.dstPos += length;
        this.lastOffset = offset;
    }

    quantum() {
        const end = Math.min(this.dst.length, this.dstPos + QUANTUM - (this.dstPos % QUANTUM));

        // a stored (uncompressed) quantum is flagged by a zero word
        if (this.srcPos + 2 <= this.src.length && this.src[this.srcPos] === 0 && this.src[this.srcPos + 1] === 0) {
            this.srcPos += 2;
            const n = end - this.dstPos;
            this.dst.set(this.src.subarray(this.srcPos, this.srcPos + n), this.dstPos);
            this.srcPos += n;
            this.dstPos += n;
            return;
        }

        this.initState();
        while (this.dstPos < end) {
            if (this.dstPos === 0) {
                this.dst[0] = this.bits(8);
                this.dstPos = 1;
            } else {
                this.command();
            }
        }
        if (this.state1 !== 0x10000 || this.state2 !== 0x10000) {
            throw new Error(`BitKnit: bad final state at ${this.dstPos}`);
        }
    }

    run() {
        if (this.dst.length === 0) {
            return this.dst;
        }
        if (this.word() !== MAGIC) {
            throw new Error('BitKnit: bad magic');
        }
        while (this.dstPos < this.dst.length) {
            if (this.srcPos >= this.src.length) {
                throw new Error('BitKnit: compressed data ended early');
            }
            this.quantum();
        }
        return this.dst;
    }
}

/**
 * Decompresses a BitKnit 2 stream.
 *
 * @param {Uint8Array} src the compressed stream
 * @param {number} size the decompressed size
 * @returns {Uint8Array}
 */
export function decompress(src, size) {
    return new Decoder(src, new Uint8Array(size)).run();
}
