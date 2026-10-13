/**
 * Minimal streaming tar reader for the TCGdex ingest (no new dependency).
 *
 * GitHub's codeload service serves `git archive` output: a gzip stream of POSIX tar (ustar) with a
 * global PAX header first and PAX extended headers for paths that are long or not plain ASCII.
 * This reader understands exactly that: ustar headers (with the prefix field), PAX 'x' records
 * (path), PAX 'g' (ignored), GNU 'L' long names, regular files, and skips everything else
 * (directories, links). It never writes anything to disk and never interprets entry content: the
 * caller receives the bytes of the entries it asked for and nothing else.
 *
 * Bounds: the whole archive is capped (maxTotalBytes, counted after decompression), and an
 * individual wanted entry larger than maxEntryBytes is skipped, not buffered.
 */

export interface TarLimits {
  /** Maximum decompressed bytes read from the source before the reader gives up. */
  maxTotalBytes: number;
  /** Largest entry that will be buffered and yielded; larger wanted entries are skipped. */
  maxEntryBytes: number;
}

export const DEFAULT_TAR_LIMITS: TarLimits = {
  maxTotalBytes: 3 * 1024 * 1024 * 1024,
  maxEntryBytes: 256 * 1024,
};

export interface TarFile {
  path: string;
  data: Buffer;
}

const BLOCK = 512;
const MAX_PAX_BYTES = 1024 * 1024;

class ByteQueue {
  private chunks: Buffer[] = [];
  private length = 0;
  private ended = false;
  private consumed = 0;
  private readonly it: AsyncIterator<Buffer | string>;

  constructor(source: AsyncIterable<Buffer | string>, private readonly maxTotalBytes: number) {
    this.it = source[Symbol.asyncIterator]();
  }

  private async fill(n: number): Promise<void> {
    while (this.length < n && !this.ended) {
      const r = await this.it.next();
      if (r.done) {
        this.ended = true;
        break;
      }
      const b = typeof r.value === 'string' ? Buffer.from(r.value, 'utf8') : r.value;
      if (b.length === 0) continue;
      this.chunks.push(b);
      this.length += b.length;
    }
  }

  private take(n: number): Buffer {
    const joined = this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks);
    const out = joined.subarray(0, n);
    const rest = joined.subarray(n);
    this.chunks = rest.length > 0 ? [rest] : [];
    this.length = rest.length;
    this.consumed += n;
    if (this.consumed > this.maxTotalBytes) throw new Error('Archive is larger than the allowed size');
    return out;
  }

  /** Exactly n bytes, or null when the stream ended cleanly before the first byte. Throws on a partial read. */
  async read(n: number): Promise<Buffer | null> {
    if (n === 0) return Buffer.alloc(0);
    await this.fill(n);
    if (this.length === 0) return null;
    if (this.length < n) throw new Error('Unexpected end of archive');
    return this.take(n);
  }

  async readExact(n: number): Promise<Buffer> {
    const b = await this.read(n);
    if (b === null) throw new Error('Unexpected end of archive');
    return b;
  }

  async skip(n: number): Promise<void> {
    let remaining = n;
    while (remaining > 0) {
      await this.fill(1);
      if (this.length === 0) throw new Error('Unexpected end of archive');
      const step = Math.min(remaining, this.length);
      this.take(step);
      remaining -= step;
    }
  }
}

function cString(buf: Buffer, start: number, length: number): string {
  let end = start;
  const limit = start + length;
  while (end < limit && buf[end] !== 0) end++;
  return buf.toString('utf8', start, end);
}

function isZeroBlock(buf: Buffer): boolean {
  for (let i = 0; i < buf.length; i++) if (buf[i] !== 0) return false;
  return true;
}

function parseSize(header: Buffer): number {
  if ((header[124] & 0x80) !== 0) {
    // GNU base-256 encoding.
    let n = 0;
    for (let i = 125; i < 136; i++) n = n * 256 + header[i];
    if (!Number.isSafeInteger(n)) throw new Error('Bad tar entry size');
    return n;
  }
  const text = cString(header, 124, 12).trim();
  if (text === '') return 0;
  if (!/^[0-7]+$/.test(text)) throw new Error('Bad tar entry size');
  return parseInt(text, 8);
}

/** Parses PAX extended header records ("<len> <key>=<value>\n") and returns the key/value pairs. */
export function parsePaxRecords(body: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let pos = 0;
  while (pos < body.length) {
    const space = body.indexOf(0x20, pos);
    if (space < 0) break;
    const len = parseInt(body.toString('ascii', pos, space), 10);
    if (!Number.isInteger(len) || len <= space - pos + 1 || pos + len > body.length) break;
    const record = body.toString('utf8', space + 1, pos + len - 1);
    const eq = record.indexOf('=');
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
    pos += len;
  }
  return out;
}

/**
 * Streams the entries of a (decompressed) tar archive and yields the regular files for which
 * `wants(path, size)` returns true and whose size is at most limits.maxEntryBytes. Paths are
 * returned exactly as stored in the archive (including the leading `<repo>-<ref>/` folder).
 */
export async function* iterateTar(
  source: AsyncIterable<Buffer | string>,
  wants: (path: string, size: number) => boolean,
  limits: TarLimits = DEFAULT_TAR_LIMITS,
): AsyncGenerator<TarFile> {
  const q = new ByteQueue(source, limits.maxTotalBytes);
  let paxPath: string | null = null;
  let gnuLongName: string | null = null;

  for (;;) {
    const header = await q.read(BLOCK);
    if (header === null) return;
    if (header.length < BLOCK) throw new Error('Unexpected end of archive');
    if (isZeroBlock(header)) return;

    const typeByte = header[156];
    const typeflag = typeByte === 0 ? '0' : String.fromCharCode(typeByte);
    const size = parseSize(header);
    const padded = Math.ceil(size / BLOCK) * BLOCK;
    let name = cString(header, 0, 100);
    if (header.toString('latin1', 257, 262) === 'ustar') {
      const prefix = cString(header, 345, 155);
      if (prefix) name = `${prefix}/${name}`;
    }

    if (typeflag === 'x' || typeflag === 'L') {
      if (size > MAX_PAX_BYTES) throw new Error('Oversized tar extension header');
      const body = await q.readExact(size);
      await q.skip(padded - size);
      if (typeflag === 'x') {
        const rec = parsePaxRecords(body);
        if (typeof rec.path === 'string' && rec.path) paxPath = rec.path;
      } else {
        const text = cString(body, 0, body.length);
        if (text) gnuLongName = text;
      }
      continue;
    }
    if (typeflag === 'g') {
      await q.skip(padded);
      continue;
    }

    const entryPath = paxPath ?? gnuLongName ?? name;
    paxPath = null;
    gnuLongName = null;

    if ((typeflag === '0' || typeflag === '7') && size <= limits.maxEntryBytes && wants(entryPath, size)) {
      const data = await q.readExact(size);
      await q.skip(padded - size);
      yield { path: entryPath, data };
    } else {
      await q.skip(padded);
    }
  }
}
