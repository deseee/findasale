/**
 * Restricted reader for the TypeScript data files of the TCGdex cards-database repository.
 *
 * The repository stores every set and card as a small TypeScript module of the form
 *
 *   import { Card } from '../../../interfaces'
 *   import Set from '../Base Set'
 *   const card: Card = { name: { en: "Charizard" }, rarity: "Rare", set: Set, variants: [ ... ] }
 *   export default card
 *
 * This module reads the object literal WITHOUT executing anything. It is a hand written
 * recursive-descent reader for the literal subset those files use: objects, arrays, strings
 * (single, double, or backtick without interpolation), numbers, true / false / null / undefined,
 * comments, trailing commas, and bare identifiers (kept as inert reference markers, for example
 * `set: Set`). Anything else (calls, spread, arrow functions, template interpolation, operators
 * other than string concatenation, computed keys, shorthand properties) throws a
 * LiteralParseError and the caller skips that one file.
 *
 * Nothing here uses eval, Function, require or import() on downloaded content. The reader is
 * bounded: source size, nesting depth and node count are all capped.
 */

export class LiteralParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiteralParseError';
  }
}

/** An identifier used as a value (for example `set: Set`). Never resolved, never executed. */
export interface RefMarker {
  $ref: string;
}

export const MAX_LITERAL_SOURCE_CHARS = 256 * 1024;
export const MAX_LITERAL_DEPTH = 32;
export const MAX_LITERAL_NODES = 50000;

export function isRefMarker(value: unknown): value is RefMarker {
  return typeof value === 'object' && value !== null && typeof (value as RefMarker).$ref === 'string';
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !isRefMarker(value);
}

const BOM = String.fromCharCode(0xfeff);
const NBSP = String.fromCharCode(0xa0);

const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*/y;
const KEY_IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/y;
const NUMBER_RE = /[+-]?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;
const AS_RE = /\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*/y;

class Reader {
  private i: number;
  private nodes = 0;

  constructor(private readonly s: string, start: number) {
    this.i = start;
  }

  private fail(message: string): never {
    throw new LiteralParseError(`${message} at offset ${this.i}`);
  }

  private skipTrivia(): void {
    const s = this.s;
    for (;;) {
      const ch = s[this.i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === BOM || ch === NBSP) {
        this.i++;
      } else if (ch === '/' && s[this.i + 1] === '/') {
        const end = s.indexOf('\n', this.i);
        this.i = end < 0 ? s.length : end + 1;
      } else if (ch === '/' && s[this.i + 1] === '*') {
        const end = s.indexOf('*/', this.i + 2);
        if (end < 0) this.fail('Unterminated block comment');
        this.i = end + 2;
      } else {
        return;
      }
    }
  }

  parseValue(depth: number): unknown {
    if (depth > MAX_LITERAL_DEPTH) this.fail('Nesting too deep');
    if (++this.nodes > MAX_LITERAL_NODES) this.fail('Too many values');
    this.skipTrivia();
    const ch = this.s[this.i];
    let value: unknown;
    if (ch === '{') {
      value = this.parseObject(depth);
    } else if (ch === '[') {
      value = this.parseArray(depth);
    } else if (ch === '"' || ch === "'" || ch === '`') {
      value = this.parseStringWithConcat();
    } else if (ch !== undefined && (ch === '-' || ch === '+' || ch === '.' || (ch >= '0' && ch <= '9'))) {
      value = this.parseNumber();
    } else if (ch !== undefined && /[A-Za-z_$]/.test(ch)) {
      value = this.parseIdentifier();
    } else {
      this.fail(`Unexpected character ${JSON.stringify(ch ?? 'end of input')}`);
    }
    // Tolerate a trailing `as Type` assertion; it has no runtime meaning.
    AS_RE.lastIndex = this.i;
    const as = AS_RE.exec(this.s);
    if (as) this.i += as[0].length;
    return value;
  }

  private parseObject(depth: number): Record<string, unknown> {
    this.i++; // {
    const out: Record<string, unknown> = Object.create(null);
    for (;;) {
      this.skipTrivia();
      const ch = this.s[this.i];
      if (ch === '}') {
        this.i++;
        return out;
      }
      if (ch === undefined) this.fail('Unterminated object');
      let key: string;
      if (ch === '"' || ch === "'") {
        key = this.parseString();
      } else if (/[A-Za-z_$]/.test(ch)) {
        KEY_IDENT_RE.lastIndex = this.i;
        const m = KEY_IDENT_RE.exec(this.s);
        if (!m) this.fail('Bad key');
        key = m[0];
        this.i += key.length;
      } else if (ch >= '0' && ch <= '9') {
        NUMBER_RE.lastIndex = this.i;
        const m = NUMBER_RE.exec(this.s);
        if (!m) this.fail('Bad numeric key');
        key = m[0];
        this.i += key.length;
      } else {
        this.fail('Unsupported object member (spread, computed key or method)');
      }
      this.skipTrivia();
      if (this.s[this.i] !== ':') this.fail('Unsupported object member (shorthand or method)');
      this.i++;
      const value = this.parseValue(depth + 1);
      if (key !== '__proto__') out[key] = value;
      this.skipTrivia();
      const next = this.s[this.i];
      if (next === ',') {
        this.i++;
      } else if (next !== '}') {
        this.fail('Expected , or } in object');
      }
    }
  }

  private parseArray(depth: number): unknown[] {
    this.i++; // [
    const out: unknown[] = [];
    for (;;) {
      this.skipTrivia();
      const ch = this.s[this.i];
      if (ch === ']') {
        this.i++;
        return out;
      }
      if (ch === undefined) this.fail('Unterminated array');
      if (ch === ',') this.fail('Array holes are not supported');
      out.push(this.parseValue(depth + 1));
      this.skipTrivia();
      const next = this.s[this.i];
      if (next === ',') {
        this.i++;
      } else if (next !== ']') {
        this.fail('Expected , or ] in array');
      }
    }
  }

  private parseStringWithConcat(): string {
    let text = this.parseString();
    for (;;) {
      const save = this.i;
      this.skipTrivia();
      if (this.s[this.i] === '+') {
        this.i++;
        this.skipTrivia();
        const q = this.s[this.i];
        if (q === '"' || q === "'" || q === '`') {
          text += this.parseString();
          if (text.length > MAX_LITERAL_SOURCE_CHARS) this.fail('String too long');
          continue;
        }
        this.fail('Only string concatenation is supported');
      }
      this.i = save;
      return text;
    }
  }

  private parseString(): string {
    const quote = this.s[this.i];
    this.i++;
    let out = '';
    for (;;) {
      const ch = this.s[this.i];
      if (ch === undefined) this.fail('Unterminated string');
      if (ch === quote) {
        this.i++;
        return out;
      }
      if (ch === '\n' && quote !== '`') this.fail('Newline in string');
      if (quote === '`' && ch === '$' && this.s[this.i + 1] === '{') this.fail('Template interpolation is not supported');
      if (ch === '\\') {
        this.i++;
        const e = this.s[this.i];
        if (e === undefined) this.fail('Unterminated escape');
        this.i++;
        switch (e) {
          case 'n': out += '\n'; break;
          case 't': out += '\t'; break;
          case 'r': out += '\r'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'v': out += '\v'; break;
          case '0': out += '\0'; break;
          case '\n': break;
          case '\r':
            if (this.s[this.i] === '\n') this.i++;
            break;
          case 'x': {
            const hex = this.s.slice(this.i, this.i + 2);
            if (!/^[0-9a-fA-F]{2}$/.test(hex)) this.fail('Bad \\x escape');
            out += String.fromCharCode(parseInt(hex, 16));
            this.i += 2;
            break;
          }
          case 'u': {
            if (this.s[this.i] === '{') {
              const end = this.s.indexOf('}', this.i);
              const hex = end < 0 ? '' : this.s.slice(this.i + 1, end);
              if (!/^[0-9a-fA-F]{1,6}$/.test(hex)) this.fail('Bad \\u{} escape');
              const code = parseInt(hex, 16);
              if (code > 0x10ffff) this.fail('Bad \\u{} escape');
              out += String.fromCodePoint(code);
              this.i = end + 1;
            } else {
              const hex = this.s.slice(this.i, this.i + 4);
              if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('Bad \\u escape');
              out += String.fromCharCode(parseInt(hex, 16));
              this.i += 4;
            }
            break;
          }
          default:
            out += e;
        }
      } else {
        out += ch;
        this.i++;
      }
      if (out.length > MAX_LITERAL_SOURCE_CHARS) this.fail('String too long');
    }
  }

  private parseNumber(): number {
    NUMBER_RE.lastIndex = this.i;
    const m = NUMBER_RE.exec(this.s);
    if (!m) this.fail('Bad number');
    const n = Number(m[0]);
    if (!Number.isFinite(n)) this.fail('Bad number');
    this.i += m[0].length;
    return n;
  }

  private parseIdentifier(): unknown {
    IDENT_RE.lastIndex = this.i;
    const m = IDENT_RE.exec(this.s);
    if (!m) this.fail('Bad identifier');
    const name = m[0];
    this.i += name.length;
    if (name === 'true') return true;
    if (name === 'false') return false;
    if (name === 'null') return null;
    if (name === 'undefined') return undefined;
    return { $ref: name } as RefMarker;
  }
}

const DECLARATION_RE = /\b(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*(?::[^=\n]*)?=\s*(?=\{)/;
const EXPORT_DEFAULT_RE = /\bexport\s+default\s*(?=\{)/;

/** Offset of the `{` that opens the data object, or -1 when the file has no such object. */
function findObjectStart(source: string): number {
  const candidates: number[] = [];
  const decl = DECLARATION_RE.exec(source);
  if (decl) candidates.push(decl.index + decl[0].length);
  const exp = EXPORT_DEFAULT_RE.exec(source);
  if (exp) candidates.push(exp.index + exp[0].length);
  return candidates.length === 0 ? -1 : Math.min(...candidates);
}

/**
 * Parses the data object of one TCGdex set or card file. Throws LiteralParseError when the file
 * does not follow the literal subset. The returned objects have no prototype.
 */
export function parseTcgdexDataFile(source: string): Record<string, unknown> {
  if (typeof source !== 'string') throw new LiteralParseError('Source is not text');
  if (source.length > MAX_LITERAL_SOURCE_CHARS) throw new LiteralParseError('Source file too large');
  const start = findObjectStart(source);
  if (start < 0) throw new LiteralParseError('No data object found');
  const value = new Reader(source, start).parseValue(0);
  if (!isPlainRecord(value)) throw new LiteralParseError('Data object is not an object literal');
  return value;
}
