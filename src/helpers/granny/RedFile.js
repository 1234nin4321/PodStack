'use strict';

// Reads the EVE client's effect files (.red: the scene objects a hull adds for some looks, e.g. a SKIN's holograms
// and glowing trails). They're stored in the same binary "Black" form as the space object factory files (see
// BlackFile.js), but hold the client's general scene classes (EveChildContainer, EveChildMesh, Tr2Mesh, Tr2Effect,
// ...), whose field types this reader doesn't know in advance. Worked out from the files themselves:
//
//   an object is a u32 id, a u32 size (of everything after it), a u16 class name, then fields: a u16 field name and its
//   value. A value is a string (u16 index), a number or vector (1, 2, 3, 4 or 16 floats), a byte, an object, a list of
//   objects (a u32 count, then the objects), or a typed array (a u32 count, a u16 element size, then the elements:
//   name/value string pairs for an effect's options, a name and four floats for its constant parameters).
//
// Values aren't tagged with their type, so each field's value is tried as each type in turn, keeping the first reading
// with which the rest of the object's fields read through exactly to its recorded end.

const MAGIC = 0xb1acf11e;
const FLOAT_COUNTS = [1, 3, 4, 2, 16];

export default class RedFile {
    /**
     * @param {Uint8Array} bytes the .red file
     */
    constructor(bytes) {
        this.bytes = bytes;
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (this.view.getUint32(0, true) !== MAGIC) {
            throw new Error('Not a Black file');
        }
        const tableEnd = 12 + this.view.getUint32(8, true);
        const count = this.view.getUint16(12, true);
        this.strings = [];
        let o = 14;
        for (let i = 0; i < count && o < tableEnd; i++) {
            let e = o;
            while (e < tableEnd && bytes[e] !== 0) {
                e++;
            }
            let s = '';
            for (let k = o; k < e; k++) {
                s += String.fromCharCode(bytes[k]);
            }
            this.strings.push(s);
            o = e + 1;
        }
        // the readings of the fields from a position to an object's end, worked out once each (null: none)
        this.memo = new Map();
        // steps tried, so a file this reader misjudges can't take forever
        this.budget = 200000;
        const root = this.findRoot(tableEnd);
        this.root = root !== undefined ? this.object(root).value : undefined;
    }

    // the root object (id 1, running to the end of the file): usually 6 bytes after the string table
    findRoot(from) {
        for (let o = from; o + 10 <= this.bytes.length && o < from + 4096; o++) {
            if (this.u32(o) === 1 && o + 8 + this.u32(o + 4) === this.bytes.length && this.isObject(o, this.bytes.length)) {
                return o;
            }
        }
        return undefined;
    }

    u16(o) {
        return this.view.getUint16(o, true);
    }

    u32(o) {
        return this.view.getUint32(o, true);
    }

    // a field name: camelCase letters and digits
    isField(index) {
        const s = this.strings[index];
        return s !== undefined && /^[a-z][A-Za-z0-9_]*$/.test(s);
    }

    // whether an object header (a class name: CapitalCase) starts at o and fits before end
    isObject(o, end) {
        if (o + 10 > end) {
            return false;
        }
        const size = this.u32(o + 4);
        const cls = this.strings[this.u16(o + 8)];
        return size >= 2 && o + 8 + size <= end && cls !== undefined && /^[A-Z][A-Za-z0-9_]*$/.test(cls);
    }

    // {value: {_class, ...fields}, next} of the object at o; fields it couldn't read are left out, with _unparsed set
    object(o) {
        const end = o + 8 + this.u32(o + 4);
        const value = {_class: this.strings[this.u16(o + 8)]};
        const fields = this.fields(o + 10, end);
        if (fields === undefined) {
            value._unparsed = true;
        } else {
            Object.assign(value, fields);
        }
        return {value, next: end};
    }

    // the fields from p to exactly end, or undefined when no reading of them gets there
    fields(p, end) {
        if (p === end) {
            return {};
        }
        if (p + 2 > end || !this.isField(this.u16(p)) || --this.budget < 0) {
            return undefined;
        }
        const key = p * 0x100000000 + end;
        if (this.memo.has(key)) {
            return this.memo.get(key) || undefined;
        }
        const name = this.strings[this.u16(p)];
        let found = null;
        for (const candidate of this.candidates(p + 2, end)) {
            const rest = this.fields(candidate.next, end);
            if (rest !== undefined) {
                found = {[name]: candidate.value, ...rest};
                break;
            }
        }
        this.memo.set(key, found);
        return found || undefined;
    }

    // the possible readings ({value, next}) of a value at q, most likely first; readings holding an object that didn't
    // read through come last, as they're usually something else that happens to look like an object
    * candidates(q, end) {
        const doubtful = [];
        for (const candidate of this.readings(q, end)) {
            if (RedFile.whole(candidate.value)) {
                yield candidate;
            } else {
                doubtful.push(candidate);
            }
        }
        yield* doubtful;
    }

    // whether a value (an object, or a list of them) read through completely
    static whole(value) {
        if (Array.isArray(value)) {
            return value.every(v => RedFile.whole(v));
        }
        return !(value && typeof value === 'object' && value._unparsed);
    }

    * readings(q, end) {
        if (this.isObject(q, end)) {
            yield this.object(q);
        }
        if (q + 4 <= end) {
            const n = this.u32(q);
            if (n > 0 && n < 10000 && this.isObject(q + 4, end)) {
                const items = [];
                let r = q + 4;
                let ok = true;
                for (let i = 0; i < n; i++) {
                    if (!this.isObject(r, end)) {
                        ok = false;
                        break;
                    }
                    const item = this.object(r);
                    items.push(item.value);
                    r = item.next;
                }
                if (ok) {
                    yield {value: items, next: r};
                }
            }
            if (n === 0) {
                yield {value: [], next: q + 4};
            }
        }
        if (q + 6 <= end) {
            const n = this.u32(q);
            const size = this.u16(q + 4);
            if (n > 0 && n < 5000 && size > 0 && size <= 256 && q + 6 + n * size <= end) {
                yield {value: this.array(q + 6, n, size), next: q + 6 + n * size};
            }
        }
        // (a string value can look like a field name, e.g. an effect called "mf4_t1_northern_fx")
        if (q + 2 <= end && this.u16(q) < this.strings.length) {
            yield {value: this.strings[this.u16(q)], next: q + 2};
        }
        for (const n of FLOAT_COUNTS) {
            if (q + n * 4 <= end) {
                yield {value: Array.from({length: n}, (_, i) => this.view.getFloat32(q + i * 4, true)), next: q + n * 4};
            }
        }
        if (q + 1 <= end) {
            yield {value: this.bytes[q], next: q + 1};
        }
    }

    // a typed array's elements: [key, value] string pairs (16 bytes), [name, x, y, z, w] (a name, then four floats
    // at its end), or else the raw bytes
    array(p, count, size) {
        const string = i => (i < this.strings.length ? this.strings[i] : i);
        const items = [];
        for (let i = 0; i < count; i++) {
            const e = p + i * size;
            if (size === 16 && this.u32(e + 4) === 0 && this.u32(e + 12) === 0) {
                items.push([string(this.u32(e)), string(this.u32(e + 8))]);
            } else if (size >= 20) {
                const f = k => this.view.getFloat32(e + size - 16 + k * 4, true);
                items.push([string(this.u32(e)), f(0), f(1), f(2), f(3)]);
            } else {
                items.push(this.bytes.slice(e, e + size));
            }
        }
        return items;
    }
}
