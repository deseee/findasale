/**
 * Streaming spreadsheet reader for the card intake (ADR-134 sections 4.4 and 4.5, batch B4).
 *
 * Nothing here loads a whole file: the sha256 is computed by streaming the file, the delimiter is
 * sniffed from the first 64 KB, and records are parsed one at a time with csv-parse in streaming
 * mode. Header matching is case-insensitive and trimmed, the byte-order mark is stripped, and the
 * delimiter is auto-detected among comma, semicolon and tab.
 *
 * Deviation from the ADR text (which lists delimiter: [',', ';', '\t'] on the parser): the delimiter
 * is chosen once from the header line and then fixed, because an array delimiter would also split
 * on a semicolon or tab inside an unquoted comma-separated card name.
 *
 * `row` numbers match a spreadsheet: the header is row 1 and the first card is row 2 (the physical
 * line where the record ends, counting blank lines).
 */
import { createHash } from 'crypto';
import fs from 'fs';
import { parse } from 'csv-parse';
import type { SourceRecord } from './types';
import { MAX_ROW_CHARS } from './config';

export class IntakeFileError extends Error {
  constructor(
    readonly code: 'NOT_A_CSV_FILE' | 'PARSE_ERROR' | 'EMPTY_FILE' | 'TOO_MANY_ROWS',
    readonly status: number,
    message: string,
    readonly detail: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'IntakeFileError';
    Object.setPrototypeOf(this, IntakeFileError.prototype);
  }
}

export function isIntakeFileError(err: unknown): err is IntakeFileError {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'IntakeFileError';
}

export function sha256OfFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

const SNIFF_BYTES = 64 * 1024;

async function readHead(filePath: string): Promise<Buffer> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await handle.read(buf, 0, SNIFF_BYTES, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** True when the first bytes are a zip container (XLSX renamed to .csv) or contain NUL bytes (UTF-16, binary). */
export function looksBinary(head: Buffer): boolean {
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return true;
  const probe = head.subarray(0, 8192);
  return probe.includes(0);
}

/** Picks comma, semicolon or tab by counting each outside double quotes on the first line. */
export function sniffDelimiter(head: Buffer): ',' | ';' | '\t' {
  let text = head.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === '\n' || ch === '\r') break;
      if (ch in counts) counts[ch] += 1;
    }
  }
  let best: ',' | ';' | '\t' = ',';
  let bestCount = counts[','];
  for (const d of [';', '\t'] as const) {
    if (counts[d] > bestCount) {
      best = d;
      bestCount = counts[d];
    }
  }
  return best;
}

export interface StreamedRecord {
  row: number;
  record: SourceRecord;
  /** True when the record's text was longer than MAX_ROW_CHARS (the record was truncated). */
  tooLong: boolean;
}

export interface StreamOptions {
  onHeader?: (headers: string[], delimiter: string) => void;
  /** Stop with TOO_MANY_ROWS as soon as this many rows have been exceeded. */
  maxRows?: number;
}

/**
 * Yields the records of the file one at a time. Throws IntakeFileError for a binary file, a file
 * csv-parse cannot read, or a file over maxRows.
 */
export async function* streamRecords(filePath: string, options: StreamOptions = {}): AsyncGenerator<StreamedRecord> {
  const head = await readHead(filePath);
  if (looksBinary(head)) {
    throw new IntakeFileError('NOT_A_CSV_FILE', 400, 'not a text file');
  }
  const delimiter = sniffDelimiter(head);
  let headers: string[] = [];
  const parser = parse({
    columns: (header: string[]) => {
      headers = header.map((h) => String(h));
      options.onHeader?.(headers, delimiter);
      return headers;
    },
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
    info: true,
    delimiter,
    max_record_size: 2 * 1024 * 1024,
  });
  const input = fs.createReadStream(filePath);
  input.on('error', (err) => parser.destroy(err));
  input.pipe(parser);

  let count = 0;
  try {
    for await (const item of parser as AsyncIterable<{ record: Record<string, unknown>; info: { lines: number } }>) {
      count += 1;
      if (options.maxRows !== undefined && count > options.maxRows) {
        throw new IntakeFileError('TOO_MANY_ROWS', 413, 'too many rows', { limit: options.maxRows });
      }
      const record: SourceRecord = {};
      let chars = 0;
      let tooLong = false;
      for (const key of headers) {
        const raw = item.record[key];
        const value = typeof raw === 'string' ? raw : '';
        chars += value.length;
        record[key] = value;
      }
      if (chars > MAX_ROW_CHARS) {
        tooLong = true;
        for (const key of headers) record[key] = record[key].slice(0, 200);
      }
      yield { row: item.info.lines, record, tooLong };
    }
  } catch (err) {
    if (isIntakeFileError(err)) throw err;
    const e = err as { code?: string; lines?: number; message?: string };
    throw new IntakeFileError('PARSE_ERROR', 400, e?.message ?? 'parse error', { line: e?.lines ?? null, parserCode: e?.code ?? null });
  } finally {
    input.destroy();
    parser.destroy();
  }
}

export interface FileShape {
  headers: string[];
  delimiter: string;
  rowCount: number;
}

/** Cheap first pass: header, delimiter and row count. Aborts with TOO_MANY_ROWS above maxRows. */
export async function inspectFile(filePath: string, maxRows: number): Promise<FileShape> {
  let headers: string[] = [];
  let delimiter = ',';
  let rowCount = 0;
  for await (const _ of streamRecords(filePath, {
    maxRows,
    onHeader: (h, d) => {
      headers = h;
      delimiter = d;
    },
  })) {
    rowCount += 1;
  }
  if (headers.length === 0 || rowCount === 0) {
    // An empty file never reaches the header callback; a header-only file has headers but no rows.
    throw new IntakeFileError('EMPTY_FILE', 400, 'no rows');
  }
  return { headers, delimiter, rowCount };
}
