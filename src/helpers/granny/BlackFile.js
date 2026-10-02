'use strict';

// Reads EVE's "Black" files (.black), the binary form of the client's space object factory data: hulls, factions
// (a ship's look, and each SKIN's), materials and patterns. Worked out from the files themselves:
//
//   magic B1ACF11E, version (1), string table size, then the string table (a u16 count and that many NUL-terminated
//   strings: every class name, field name and string value in the file), a short prefix, then the root object.
//   An object is a u32 id, a u32 size (of everything after it), a u16 class name, then fields: a u16 field name and
//   its value. Values aren't tagged with their type, so the parser knows the types of the fields it needs (strings,
//   vectors) and recognises objects and lists by their headers; at a field it can't read it skips to the end of the
//   object, which the object's size makes safe.

const MAGIC = 0xb1acf11e;

// fields holding a string (as a string table index)
const STRING_FIELDS = new Set([
    'name', 'description', 'resPathInsert', 'material1', 'material2', 'material3', 'material4', 'textureName',
    'textureResFilePath', 'resFilePath', 'shader', 'geometryResFilePath', 'category', 'sofFactionName',
]);
// fields holding four floats
const VEC4_FIELDS = new Set(['value', 'color', 'coneColor', 'spriteColor', 'flareColor']);
// fields whose type depends on the class they're in: {class: {field: type}}, '*' for every field of the class
const CLASS_FIELDS = {
    EveSOFDataPatternLayer: {projectionTypeU: 'u32', projectionTypeV: 'u32', materialSource: 'u32'},
    EveSOFDataPatternTransform: {position: 'vec3', scaling: 'vec3', rotation: 'vec4', isMirrored: 'u8'},
    EveSOFDataFactionColorSet: {'*': 'vec4'},
};
const SIZES = {u8: 1, u32: 4, vec3: 12, vec4: 16};

export default class BlackFile {
    /**
     * @param {Uint8Array} bytes the .black file
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
        this.root = this.object(this.findRoot(tableEnd), bytes.length);
    }

    // The root object (id 1, running to the end of the file): usually 6 bytes after the string table, but some files
    // (hulls) have more in between, so it's looked for.
    findRoot(from) {
        for (let o = from; o + 10 <= this.bytes.length && o < from + (1 << 20); o++) {
            if (this.u32(o) === 1 && o + 8 + this.u32(o + 4) === this.bytes.length && this.isObject(o, this.bytes.length)) {
                return o;
            }
        }
        return from + 6;
    }

    u16(o) {
        return this.view.getUint16(o, true);
    }

    u32(o) {
        return this.view.getUint32(o, true);
    }

    // whether an object header starts at o and fits before end
    isObject(o, end) {
        if (o + 10 > end) {
            return false;
        }
        const size = this.u32(o + 4);
        const cls = this.strings[this.u16(o + 8)];
        return size >= 2 && o + 8 + size <= end && cls !== undefined && cls.startsWith('EveSOFData');
    }

    // {_class, ...fields} of the object at o (fields it couldn't read are left out), or undefined
    object(o, end) {
        if (!this.isObject(o, end)) {
            return undefined;
        }
        const objectEnd = o + 8 + this.u32(o + 4);
        const obj = {_class: this.strings[this.u16(o + 8)]};
        let p = o + 10;
        while (p + 2 <= objectEnd) {
            const name = this.strings[this.u16(p)];
            if (name === undefined) {
                break;
            }
            p += 2;
            const value = this.value(name, p, objectEnd, obj._class);
            if (value === undefined) {
                break;   // can't read this field: skip the rest of the object
            }
            obj[name] = value.value;
            p = value.next;
        }
        Object.defineProperty(obj, '_end', {value: objectEnd});
        return obj;
    }

    // {value, next} of a field's value at p, or undefined when its type can't be told
    value(name, p, end, cls) {
        const typed = CLASS_FIELDS[cls] && (CLASS_FIELDS[cls][name] || CLASS_FIELDS[cls]['*']);
        if (typed !== undefined && !this.isObject(p, end)) {
            const size = SIZES[typed];
            if (p + size > end) {
                return undefined;
            }
            if (typed === 'u8') {
                return {value: this.bytes[p], next: p + 1};
            }
            if (typed === 'u32') {
                return {value: this.u32(p), next: p + 4};
            }
            const f = i => this.view.getFloat32(p + i * 4, true);
            return {value: Array.from({length: size / 4}, (_, i) => f(i)), next: p + size};
        }
        if (STRING_FIELDS.has(name)) {
            return p + 2 <= end ? {value: this.strings[this.u16(p)], next: p + 2} : undefined;
        }
        if (VEC4_FIELDS.has(name)) {
            if (p + 16 > end) {
                return undefined;
            }
            const f = i => this.view.getFloat32(p + i * 4, true);
            return {value: [f(0), f(1), f(2), f(3)], next: p + 16};
        }
        // an object
        if (this.isObject(p, end)) {
            const obj = this.object(p, end);
            return {value: obj, next: obj._end};
        }
        // a list: a count, then that many objects
        if (p + 4 <= end) {
            const count = this.u32(p);
            let q = p + 4;
            if (count === 0) {
                return {value: [], next: q};
            }
            if (count < 100000 && this.isObject(q, end)) {
                const items = [];
                for (let i = 0; i < count && this.isObject(q, end); i++) {
                    const item = this.object(q, end);
                    items.push(item);
                    q = item._end;
                }
                if (items.length === count) {
                    return {value: items, next: q};
                }
            }
        }
        return undefined;
    }
}
