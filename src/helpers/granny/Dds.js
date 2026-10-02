'use strict';

// Reads DirectDraw Surface (.dds) textures as EVE's ships use them: block-compressed BC1/BC3/BC4/BC5/BC7 with a full
// mip chain, from either the legacy header (FourCC DXT1/DXT5/ATI1/ATI2) or the DX10 extension header. BC4 and BC5
// are also decoded here, so single-channel maps and normal maps can be repacked into ordinary RGBA textures.

const DXGI = {71: 'BC1', 72: 'BC1', 77: 'BC3', 78: 'BC3', 80: 'BC4', 81: 'BC4', 83: 'BC5', 84: 'BC5', 98: 'BC7', 99: 'BC7'};
const FOURCC = {DXT1: 'BC1', DXT5: 'BC3', ATI1: 'BC4', BC4U: 'BC4', ATI2: 'BC5', BC5U: 'BC5'};
const BLOCK_BYTES = {BC1: 8, BC3: 16, BC4: 8, BC5: 16, BC7: 16};

/**
 * @param {Uint8Array} bytes the .dds file
 * @returns {{format: string, width: number, height: number, mips: Array<{width, height, data: Uint8Array}>}}
 */
export function parseDds(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x20534444) {   // "DDS "
        throw new Error('Not a DDS file');
    }
    const height = view.getUint32(12, true);
    const width = view.getUint32(16, true);
    const mipCount = Math.max(1, view.getUint32(28, true));
    const fourCC = String.fromCharCode(bytes[84], bytes[85], bytes[86], bytes[87]);

    let format;
    let offset = 128;
    if (fourCC === 'DX10') {
        format = DXGI[view.getUint32(128, true)];
        offset += 20;
    } else {
        format = FOURCC[fourCC];
    }
    if (format === undefined) {
        throw new Error(`Unsupported DDS format ${fourCC === 'DX10' ? view.getUint32(128, true) : fourCC}`);
    }

    const mips = [];
    let w = width;
    let h = height;
    for (let i = 0; i < mipCount && offset < bytes.length; i++) {
        const size = Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4)) * BLOCK_BYTES[format];
        mips.push({width: w, height: h, data: bytes.subarray(offset, offset + size)});
        offset += size;
        w = Math.max(1, w >> 1);
        h = Math.max(1, h >> 1);
    }
    return {format, width, height, mips};
}

// one BC4 block's 16 values (0-255) into out[outOffset + y * stride + x * step]
function decodeBc4Block(data, o, out, outOffset, stride, step) {
    const a = data[o];
    const b = data[o + 1];
    const palette = [a, b];
    if (a > b) {
        for (let i = 1; i < 7; i++) {
            palette.push(((7 - i) * a + i * b) / 7 | 0);
        }
    } else {
        for (let i = 1; i < 5; i++) {
            palette.push(((5 - i) * a + i * b) / 5 | 0);
        }
        palette.push(0, 255);
    }
    // 16 three-bit indices in the next 6 bytes
    let lo = data[o + 2] | (data[o + 3] << 8) | (data[o + 4] << 16);
    let hi = data[o + 5] | (data[o + 6] << 8) | (data[o + 7] << 16);
    for (let i = 0; i < 16; i++) {
        let index;
        if (i < 8) {
            index = lo & 7;
            lo >>= 3;
        } else {
            index = hi & 7;
            hi >>= 3;
        }
        out[outOffset + (i >> 2) * stride + (i & 3) * step] = palette[index];
    }
}

/**
 * Decodes one mip of a BC4 (one channel) or BC5 (two channels) texture into `channels` of an RGBA buffer.
 *
 * @param {object} mip {width, height, data}
 * @param {string} format 'BC4' or 'BC5'
 * @param {Uint8Array} rgba width * height * 4 bytes to write into
 * @param {number[]} channels the RGBA channel (0-3) for the first and, for BC5, second value
 */
export function decodeInto(mip, format, rgba, channels) {
    const blockBytes = BLOCK_BYTES[format];
    const blocksX = Math.max(1, Math.ceil(mip.width / 4));
    const blocksY = Math.max(1, Math.ceil(mip.height / 4));
    const stride = mip.width * 4;
    const block = new Uint8Array(16 * 4);

    for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
            const o = (by * blocksX + bx) * blockBytes;
            decodeBc4Block(mip.data, o, block, channels[0], 16, 4);
            if (format === 'BC5') {
                decodeBc4Block(mip.data, o + 8, block, channels[1], 16, 4);
            }
            // copy the 4x4 block into place (clipped at the edges of small mips)
            for (let y = 0; y < 4 && by * 4 + y < mip.height; y++) {
                for (let x = 0; x < 4 && bx * 4 + x < mip.width; x++) {
                    const src = y * 16 + x * 4;
                    const dst = (by * 4 + y) * stride + (bx * 4 + x) * 4;
                    for (const c of channels) {
                        rgba[dst + c] = block[src + c];
                    }
                }
            }
        }
    }
}
