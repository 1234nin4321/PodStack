'use strict';

// Reads Granny 2 (.gr2) files, the format of EVE's ship models: the sections (decompressed with our own BitKnit 2
// decoder), the pointer fixups that link them, and any structure in them by walking its type definition. Only what
// EVE's files use is supported: little-endian, 32-bit pointers, format revision 7, uncompressed or BitKnit 2 sections.
//
// The file layout follows libbg3's Granny reader (MIT, https://github.com/eiz/libbg3) and opengr2's documentation
// (https://github.com/arves100/opengr2/wiki/File-Format-documentation).

import {decompress} from './BitKnit';

const MAGIC_LE32 = [0x29, 0xde, 0x6c, 0xc0, 0xba, 0xa4, 0x53, 0x2b, 0x25, 0xf5, 0xb7, 0xa5, 0xf6, 0x66, 0xe2, 0xee];
const INFO = 32;               // file info follows the 16-byte magic and its 16-byte header
const SECTION_HEADER = 44;
const MEMBER_SIZE = 32;        // a member definition with 32-bit pointers
const COMPRESSION_NONE = 0;
const COMPRESSION_BITKNIT2 = 4;

// member types
export const T = {
    END: 0, INLINE: 1, REFERENCE: 2, REF_TO_ARRAY: 3, ARRAY_OF_REFS: 4, VARIANT_REF: 5, REF_TO_VARIANT_ARRAY: 7,
    STRING: 8, TRANSFORM: 9, REAL32: 10, INT8: 11, UINT8: 12, BINORMAL_INT8: 13, NORMAL_UINT8: 14, INT16: 15,
    UINT16: 16, BINORMAL_INT16: 17, NORMAL_UINT16: 18, INT32: 19, UINT32: 20, REAL16: 21, EMPTY: 22,
};

const SCALAR_SIZE = {
    [T.REAL32]: 4, [T.INT8]: 1, [T.UINT8]: 1, [T.BINORMAL_INT8]: 1, [T.NORMAL_UINT8]: 1, [T.INT16]: 2, [T.UINT16]: 2,
    [T.BINORMAL_INT16]: 2, [T.NORMAL_UINT16]: 2, [T.INT32]: 4, [T.UINT32]: 4, [T.REAL16]: 2, [T.EMPTY]: 0,
};
const FIELD_SIZE = {
    [T.REFERENCE]: 4, [T.REF_TO_ARRAY]: 8, [T.ARRAY_OF_REFS]: 8, [T.VARIANT_REF]: 8, [T.REF_TO_VARIANT_ARRAY]: 12,
    [T.STRING]: 4, [T.TRANSFORM]: 68,
};

function halfToFloat(h) {
    const s = h & 0x8000 ? -1 : 1;
    const e = (h >> 10) & 0x1f;
    const f = h & 0x3ff;
    if (e === 0) {
        return s * 2 ** -14 * (f / 1024);
    }
    if (e === 31) {
        return f ? NaN : s * Infinity;
    }
    return s * 2 ** (e - 15) * (1 + f / 1024);
}

export default class GrannyFile {
    /**
     * @param {Uint8Array} bytes the whole .gr2 file
     */
    constructor(bytes) {
        this.bytes = bytes;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const u32 = o => view.getUint32(o, true);

        if (!MAGIC_LE32.every((b, i) => bytes[i] === b)) {
            throw new Error('Not a little-endian 32-bit Granny 2 file');
        }
        if (u32(INFO) !== 7) {
            throw new Error(`Unsupported Granny format revision ${u32(INFO)}`);
        }

        const sectionTable = INFO + u32(INFO + 12);
        const count = u32(INFO + 16);
        this.rootType = [u32(INFO + 20), u32(INFO + 24)];
        this.rootObject = [u32(INFO + 28), u32(INFO + 32)];

        this.sections = [];
        this.views = [];
        this.pointers = [];
        const headers = [];
        for (let i = 0; i < count; i++) {
            const h = sectionTable + i * SECTION_HEADER;
            headers.push({
                compression: u32(h), offset: u32(h + 4), size: u32(h + 8), decompressedSize: u32(h + 12),
                fixupsOffset: u32(h + 28), fixupCount: u32(h + 32),
            });
        }

        headers.forEach((h, i) => {
            let data;
            if (h.compression === COMPRESSION_NONE) {
                data = bytes.slice(h.offset, h.offset + h.decompressedSize);
            } else if (h.compression === COMPRESSION_BITKNIT2) {
                data = h.size > 0 ? decompress(bytes.subarray(h.offset, h.offset + h.size), h.decompressedSize) :
                    new Uint8Array(h.decompressedSize);
            } else {
                throw new Error(`Unsupported Granny compression ${h.compression} in section ${i}`);
            }
            this.sections.push(data);
            this.views.push(new DataView(data.buffer, data.byteOffset, data.byteLength));
        });

        // pointer fixups: where in a section a pointer is, and the section and offset it points to
        headers.forEach((h, i) => {
            const map = new Map();
            if (h.fixupCount > 0) {
                let fixups;
                if (h.compression === COMPRESSION_BITKNIT2) {
                    const length = u32(h.fixupsOffset);
                    fixups = decompress(bytes.subarray(h.fixupsOffset + 4, h.fixupsOffset + 4 + length), h.fixupCount * 12);
                } else {
                    fixups = bytes.subarray(h.fixupsOffset, h.fixupsOffset + h.fixupCount * 12);
                }
                const fv = new DataView(fixups.buffer, fixups.byteOffset, fixups.byteLength);
                for (let k = 0; k < h.fixupCount; k++) {
                    map.set(fv.getUint32(k * 12, true), [fv.getUint32(k * 12 + 4, true), fv.getUint32(k * 12 + 8, true)]);
                }
            }
            this.pointers.push(map);
        });
    }

    // the location a pointer at [section, offset] points to, or undefined for a null pointer
    deref([section, offset]) {
        return this.pointers[section].get(offset);
    }

    string(loc) {
        if (loc === undefined) {
            return undefined;
        }
        const data = this.sections[loc[0]];
        let end = loc[1];
        while (end < data.length && data[end] !== 0) {
            end++;
        }
        let s = '';
        for (let i = loc[1]; i < end; i++) {
            s += String.fromCharCode(data[i]);
        }
        return s;
    }

    // [{type, name, ref (type location), width, offset}] of the type at loc, with each member's offset in the struct
    members(typeLoc) {
        this.typeCache = this.typeCache || new Map();
        const key = typeLoc.join(':');
        if (this.typeCache.has(key)) {
            return this.typeCache.get(key);
        }

        const view = this.views[typeLoc[0]];
        const members = [];
        let offset = 0;
        for (let k = 0; ; k++) {
            const m = typeLoc[1] + k * MEMBER_SIZE;
            const type = view.getUint32(m, true);
            if (type === T.END) {
                break;
            }
            const member = {
                type,
                name: this.string(this.deref([typeLoc[0], m + 4])),
                ref: this.deref([typeLoc[0], m + 8]),
                width: view.getInt32(m + 12, true),
                offset,
            };
            members.push(member);
            offset += this.memberSize(member);
        }
        members.size = offset;
        this.typeCache.set(key, members);
        return members;
    }

    memberSize(member) {
        const count = Math.max(1, member.width);
        if (member.type === T.INLINE) {
            return this.members(member.ref).size * count;
        }
        const size = FIELD_SIZE[member.type] !== undefined ? FIELD_SIZE[member.type] : SCALAR_SIZE[member.type];
        if (size === undefined) {
            throw new Error(`Unknown Granny member type ${member.type}`);
        }
        return size * count;
    }

    scalar(type, view, offset) {
        switch (type) {
            case T.REAL32: return view.getFloat32(offset, true);
            case T.INT8: case T.BINORMAL_INT8: return view.getInt8(offset);
            case T.UINT8: case T.NORMAL_UINT8: return view.getUint8(offset);
            case T.INT16: case T.BINORMAL_INT16: return view.getInt16(offset, true);
            case T.UINT16: case T.NORMAL_UINT16: return view.getUint16(offset, true);
            case T.INT32: return view.getInt32(offset, true);
            case T.UINT32: return view.getUint32(offset, true);
            case T.REAL16: return halfToFloat(view.getUint16(offset, true));
            default: return undefined;
        }
    }

    /**
     * The structure of type typeLoc at loc, as an object whose fields are read when first used: scalars (arrays of
     * them for array members), strings, nested objects for references and inline members, arrays of objects for the
     * array types, and {type, count, loc} for variant arrays (see vertexArray).
     */
    object(typeLoc, loc) {
        if (typeLoc === undefined || loc === undefined) {
            return undefined;
        }
        const obj = {};
        // where it came from, for numberArray
        Object.defineProperty(obj, '$type', {value: typeLoc});
        Object.defineProperty(obj, '$loc', {value: loc});
        for (const member of this.members(typeLoc)) {
            Object.defineProperty(obj, member.name, {
                enumerable: true,
                get: () => this.field(member, [loc[0], loc[1] + member.offset]),
            });
        }
        return obj;
    }

    field(member, loc) {
        const view = this.views[loc[0]];
        switch (member.type) {
            case T.INLINE:
                return this.object(member.ref, loc);
            case T.REFERENCE:
                return this.object(member.ref, this.deref(loc));
            case T.STRING:
                return this.string(this.deref(loc));
            case T.REF_TO_ARRAY: {
                const count = view.getInt32(loc[1], true);
                const items = this.deref([loc[0], loc[1] + 4]);
                const size = this.members(member.ref).size;
                return items === undefined ? [] :
                    Array.from({length: count}, (_, i) => this.object(member.ref, [items[0], items[1] + i * size]));
            }
            case T.ARRAY_OF_REFS: {
                const count = view.getInt32(loc[1], true);
                const items = this.deref([loc[0], loc[1] + 4]);
                return items === undefined ? [] :
                    Array.from({length: count}, (_, i) => this.object(member.ref, this.deref([items[0], items[1] + i * 4])));
            }
            case T.VARIANT_REF:
                return this.object(this.deref(loc), this.deref([loc[0], loc[1] + 4]));
            case T.REF_TO_VARIANT_ARRAY:
                return {
                    type: this.deref(loc),
                    count: view.getInt32(loc[1] + 4, true),
                    loc: this.deref([loc[0], loc[1] + 8]),
                };
            case T.TRANSFORM: {
                const f = i => view.getFloat32(loc[1] + 4 + i * 4, true);
                return {
                    flags: view.getUint32(loc[1], true),
                    position: [f(0), f(1), f(2)],
                    orientation: [f(3), f(4), f(5), f(6)],
                    scaleShear: [f(7), f(8), f(9), f(10), f(11), f(12), f(13), f(14), f(15)],
                };
            }
            default: {
                const size = SCALAR_SIZE[member.type];
                if (member.width > 0) {
                    return Array.from({length: member.width}, (_, i) => this.scalar(member.type, view, loc[1] + i * size));
                }
                return this.scalar(member.type, view, loc[1]);
            }
        }
    }

    /**
     * An array member whose items are a single number each (e.g. a topology's Indices or Indices16), read straight
     * into a typed array instead of one object per item.
     */
    numberArray(obj, name) {
        const member = this.members(obj.$type).find(m => m.name === name);
        if (member === undefined || member.type !== T.REF_TO_ARRAY) {
            return new Uint32Array(0);
        }
        const loc = [obj.$loc[0], obj.$loc[1] + member.offset];
        const count = this.views[loc[0]].getInt32(loc[1], true);
        const items = this.deref([loc[0], loc[1] + 4]);
        const item = this.members(member.ref);
        if (items === undefined || count <= 0 || item.length === 0) {
            return new Uint32Array(0);
        }
        const view = this.views[items[0]];
        const out = new Uint32Array(count);
        for (let i = 0; i < count; i++) {
            out[i] = this.scalar(item[0].type, view, items[1] + i * item.size);
        }
        return out;
    }

    root() {
        return this.object(this.rootType, this.rootObject);
    }

    /**
     * A variant array of plain records (e.g. vertices) unpacked into one Float32Array per member:
     * {count, fields: {name: {components, data}}}.
     */
    vertexArray(variant) {
        if (variant === undefined || variant.type === undefined || variant.loc === undefined) {
            return {count: 0, fields: {}};
        }
        const members = this.members(variant.type);
        const view = this.views[variant.loc[0]];
        const fields = {};
        for (const member of members) {
            const size = SCALAR_SIZE[member.type];
            if (size === undefined || size === 0) {
                continue;   // only plain numbers are vertex data
            }
            const components = Math.max(1, member.width);
            const data = new Float32Array(variant.count * components);
            for (let v = 0; v < variant.count; v++) {
                const base = variant.loc[1] + v * members.size + member.offset;
                for (let c = 0; c < components; c++) {
                    data[v * components + c] = this.scalar(member.type, view, base + c * size);
                }
            }
            fields[member.name] = {components, type: member.type, data};
        }
        return {count: variant.count, fields};
    }
}
