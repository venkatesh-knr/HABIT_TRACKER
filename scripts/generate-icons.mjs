// Generates simple solid-color placeholder PNG icons for the PWA manifest.
// Run with: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makeIcon(size, [r, g, b]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk('IHDR', ihdrData);

  // Raw pixel data: one filter byte (0) + RGB per pixel, per row
  const rowBytes = 1 + size * 3;
  const raw = Buffer.alloc(rowBytes * size);
  const margin = Math.round(size * 0.22);
  const barWidth = Math.max(2, Math.round(size * 0.1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filter type none
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
    // simple checkmark-ish accent: two diagonal bars forming a check, in a lighter tone
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 3;
      const inLeftStroke = Math.abs((x - margin) - (y - size * 0.55)) < barWidth && x > margin - barWidth && x < size * 0.45 && y > size * 0.35 && y < size * 0.75;
      const inRightStroke = Math.abs((x - (size - margin)) + (y - size * 0.3)) < barWidth && x > size * 0.4 && x < size - margin + barWidth && y > size * 0.25 && y < size * 0.75;
      if (inLeftStroke || inRightStroke) {
        raw[px] = 245;
        raw[px + 1] = 246;
        raw[px + 2] = 242;
      }
    }
  }

  const idatData = deflateSync(raw);
  const idat = chunk('IDAT', idatData);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

const GREEN = [0x3f, 0x6c, 0x51];

writeFileSync(new URL('../public/icon-192.png', import.meta.url), makeIcon(192, GREEN));
writeFileSync(new URL('../public/icon-512.png', import.meta.url), makeIcon(512, GREEN));

console.log('Wrote public/icon-192.png and public/icon-512.png');
