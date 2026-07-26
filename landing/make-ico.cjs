#!/usr/bin/env node
/* Packs the 16/32/48px PNGs into a single favicon.ico.

   A .ico is just a small header followed by the image blobs, and every
   browser since Vista accepts PNG payloads inside one — so no image library
   is needed. Browsers request /favicon.ico by path regardless of the <link>
   tags, so shipping a real one avoids a guaranteed 404 on every page view. */
const fs = require('fs');
const path = require('path');

const SIZES = [16, 32, 48];
const imgs = SIZES.map(s => ({
  size: s,
  data: fs.readFileSync(path.join(__dirname, 'img', `icon-${s}.png`)),
}));

const HEADER = 6, ENTRY = 16;
const head = Buffer.alloc(HEADER + ENTRY * imgs.length);
head.writeUInt16LE(0, 0);            // reserved
head.writeUInt16LE(1, 2);            // 1 = icon
head.writeUInt16LE(imgs.length, 4);

let offset = head.length;
imgs.forEach((img, i) => {
  const p = HEADER + i * ENTRY;
  head.writeUInt8(img.size === 256 ? 0 : img.size, p);      // width
  head.writeUInt8(img.size === 256 ? 0 : img.size, p + 1);  // height
  head.writeUInt8(0, p + 2);          // palette size (0 = truecolour)
  head.writeUInt8(0, p + 3);          // reserved
  head.writeUInt16LE(1, p + 4);       // colour planes
  head.writeUInt16LE(32, p + 6);      // bits per pixel
  head.writeUInt32LE(img.data.length, p + 8);
  head.writeUInt32LE(offset, p + 12);
  offset += img.data.length;
});

const out = path.join(__dirname, 'img', 'favicon.ico');
fs.writeFileSync(out, Buffer.concat([head, ...imgs.map(i => i.data)]));
console.log(`wrote favicon.ico: ${SIZES.join('/')}px, ${fs.statSync(out).size} bytes`);
