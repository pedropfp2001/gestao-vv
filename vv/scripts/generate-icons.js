import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPngBuffer(width, height, r, g, b, textType) {
  // Simple PNG encoder in pure Node.js
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // RGBA color type
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw image data with filter byte (0) before each scanline
  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(height * scanlineLength);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = width * 0.44;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;

      // Circle shape with smooth border or rounded rectangle
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Deep Blue theme (#1e3a8a -> 30, 58, 138)
      let pr = r;
      let pg = g;
      let pb = b;
      let pa = 255;

      // Draw stylized 'T' in the center
      const inTStem = Math.abs(x - centerX) < width * 0.08 && y > centerY - height * 0.22 && y < centerY + height * 0.28;
      const inTTop = Math.abs(y - (centerY - height * 0.22)) < height * 0.06 && Math.abs(x - centerX) < width * 0.28;
      const inAccentDot = Math.abs(x - (centerX + width * 0.22)) < width * 0.05 && Math.abs(y - (centerY + height * 0.24)) < height * 0.05;

      if (inTStem || inTTop) {
        // Crisp White letter T
        pr = 255;
        pg = 255;
        pb = 255;
      } else if (inAccentDot) {
        // Emerald Green accent dot (#10b981)
        pr = 16;
        pg = 185;
        pb = 129;
      }

      rawData[pixelOffset] = pr;
      rawData[pixelOffset + 1] = pg;
      rawData[pixelOffset + 2] = pb;
      rawData[pixelOffset + 3] = pa;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(length + 12);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = calculateCrc(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  chunk.writeUInt32BE(crc, length + 8);
  return chunk;
}

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function calculateCrc(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Brand SVG
const brandSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="traviuGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e3a8a" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#traviuGrad)"/>
  <!-- Stylized T -->
  <path d="M 140 160 L 372 160 L 372 220 L 286 220 L 286 380 L 226 380 L 226 220 L 140 220 Z" fill="#ffffff" />
  <!-- Emerald check dot -->
  <circle cx="360" cy="360" r="28" fill="#10b981" />
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), brandSvg);
console.log('Created public/icon.svg');

// Generate 192x192, 512x512, maskable 512x512, and apple-touch-icon 180x180
const p192 = createPngBuffer(192, 192, 30, 58, 138, 'normal');
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), p192);

const p512 = createPngBuffer(512, 512, 30, 58, 138, 'normal');
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), p512);

const pMask = createPngBuffer(512, 512, 30, 58, 138, 'maskable');
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pMask);

const pApple = createPngBuffer(180, 180, 30, 58, 138, 'apple');
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), pApple);

console.log('Created all PWA icons successfully in public/');
