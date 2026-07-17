// Rebuilds the downloadable browser-extension zip from the repo-root extension/ folder
// so /downloads/findasale-marketplace-extension.zip is never stale. Zero dependencies
// (Node zlib only) — runs in the frontend build before `next build`.
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { deflateRawSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT_DIR = resolve(__dirname, '../../../extension');
const OUT_DIR = resolve(__dirname, '../public/downloads');
const OUT_FILE = process.env.EXT_ZIP_OUT || join(OUT_DIR, 'findasale-marketplace-extension.zip');

if (!existsSync(EXT_DIR)) {
  console.warn(`[zip-extension] extension dir not found at ${EXT_DIR} — skipping (keeping any committed zip).`);
  process.exit(0);
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function collect(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === '.DS_Store') continue;
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collect(full, rel));
    else out.push({ rel, data: readFileSync(full) });
  }
  return out;
}

const files = collect(EXT_DIR);
const localChunks = [];
const centralChunks = [];
let offset = 0;

for (const f of files) {
  const nameBuf = Buffer.from(f.rel, 'utf8');
  const comp = deflateRawSync(f.data);
  const crc = crc32(f.data);

  const lfh = Buffer.alloc(30);
  lfh.writeUInt32LE(0x04034b50, 0);
  lfh.writeUInt16LE(20, 4);
  lfh.writeUInt16LE(0, 6);
  lfh.writeUInt16LE(8, 8);
  lfh.writeUInt16LE(0, 10);
  lfh.writeUInt16LE(0x21, 12);
  lfh.writeUInt32LE(crc, 14);
  lfh.writeUInt32LE(comp.length, 18);
  lfh.writeUInt32LE(f.data.length, 22);
  lfh.writeUInt16LE(nameBuf.length, 26);
  lfh.writeUInt16LE(0, 28);
  localChunks.push(lfh, nameBuf, comp);

  const cdr = Buffer.alloc(46);
  cdr.writeUInt32LE(0x02014b50, 0);
  cdr.writeUInt16LE(20, 4);
  cdr.writeUInt16LE(20, 6);
  cdr.writeUInt16LE(0, 8);
  cdr.writeUInt16LE(8, 10);
  cdr.writeUInt16LE(0, 12);
  cdr.writeUInt16LE(0x21, 14);
  cdr.writeUInt32LE(crc, 16);
  cdr.writeUInt32LE(comp.length, 20);
  cdr.writeUInt32LE(f.data.length, 24);
  cdr.writeUInt16LE(nameBuf.length, 28);
  cdr.writeUInt16LE(0, 30);
  cdr.writeUInt16LE(0, 32);
  cdr.writeUInt16LE(0, 34);
  cdr.writeUInt16LE(0, 36);
  cdr.writeUInt32LE(0, 38);
  cdr.writeUInt32LE(offset, 42);
  centralChunks.push(cdr, nameBuf);

  offset += lfh.length + nameBuf.length + comp.length;
}

const central = Buffer.concat(centralChunks);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(central.length, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, Buffer.concat([...localChunks, central, eocd]));
console.log(`[zip-extension] wrote ${OUT_FILE} (${files.length} files)`);
