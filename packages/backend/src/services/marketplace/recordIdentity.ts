/**
 * recordIdentity.ts -- ADR-132 section 2: structured record identity (artist, release title,
 * label, catalog number, year, format, script) for audio-media items, stored in the single
 * `Item.recordIdentity Json?` column (Patrick decision D6).
 *
 * Stored shape (per-field provenance):
 *   { artist: { value, source }, releaseTitle: {...}, label, catalogNumber, year, format, script,
 *     extractedAt }
 * where source is 'ai' | 'ocr' | 'organizer' | 'title_parse'. Organizer values always win.
 *
 * deriveRecordIdentityFromText() is a PURE, deterministic parser over data FindA.Sale already
 * has (title, description, tags, brand). No AI call of any kind (Patrick decision D5). Every
 * value it produces carries source 'title_parse', which the matcher never treats as sufficient
 * on its own for an artist+title (rule C) auto-match -- see discogsReleaseMatcher.ts.
 */

export type RecordIdentitySource = 'ai' | 'ocr' | 'organizer' | 'title_parse';
export type RecordFormat = 'LP' | '7in' | '10in' | '12in_single' | 'CD' | 'Cassette' | 'Box' | 'Other';
export type RecordScript = 'latin' | 'cjk' | 'cyrillic' | 'other';

export const RECORD_FORMATS: RecordFormat[] = ['LP', '7in', '10in', '12in_single', 'CD', 'Cassette', 'Box', 'Other'];
export const RECORD_SCRIPTS: RecordScript[] = ['latin', 'cjk', 'cyrillic', 'other'];

export interface RecordIdentityField<T> {
  value: T | null;
  source: RecordIdentitySource;
}

export interface RecordIdentity {
  artist?: RecordIdentityField<string> | null;
  releaseTitle?: RecordIdentityField<string> | null;
  label?: RecordIdentityField<string> | null;
  catalogNumber?: RecordIdentityField<string> | null;
  year?: RecordIdentityField<number> | null;
  format?: RecordIdentityField<RecordFormat> | null;
  script?: RecordIdentityField<RecordScript> | null;
  extractedAt?: string;
}

export interface RecordIdentityValues {
  artist: string | null;
  releaseTitle: string | null;
  label: string | null;
  catalogNumber: string | null;
  year: number | null;
  format: RecordFormat | null;
  script: RecordScript | null;
}

export type RecordIdentityKey = keyof RecordIdentityValues;
export const RECORD_IDENTITY_KEYS: RecordIdentityKey[] = [
  'artist', 'releaseTitle', 'label', 'catalogNumber', 'year', 'format', 'script',
];

export type RecordIdentitySources = Partial<Record<RecordIdentityKey, RecordIdentitySource>>;

/** Shape the AI tagging call returns (cloudAIService AITagResult.recordIdentity). */
export interface AIRecordIdentity {
  artist?: string | null;
  releaseTitle?: string | null;
  label?: string | null;
  catalogNumber?: string | null;
  year?: number | null;
  format?: string | null;
  script?: string | null;
}

export interface RecordIdentityTextInput {
  title?: string | null;
  description?: string | null;
  brand?: string | null;
  tags?: string[] | null;
}

// ─── Script detection (shared with the matcher) ───────────────────────────────

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const CYRILLIC_RE = /\p{Script=Cyrillic}/u;
const LATIN_RE = /\p{Script=Latin}/u;
const LETTER_RE = /\p{L}/u;

/** Dominant script of a string. A string is 'cjk'/'cyrillic' when at least 30% of its letters
 * are in that script (so "Babe = ベイブ" counts as cjk -- a bilingual Japanese-pressing title). */
export function scriptOf(s: string | null | undefined): RecordScript | null {
  if (!s) return null;
  let letters = 0, cjk = 0, cyr = 0, latin = 0;
  for (const ch of Array.from(s)) {
    if (!LETTER_RE.test(ch)) continue;
    letters++;
    if (CJK_RE.test(ch)) cjk++;
    else if (CYRILLIC_RE.test(ch)) cyr++;
    else if (LATIN_RE.test(ch)) latin++;
  }
  if (letters === 0) return null;
  if (cjk / letters >= 0.3) return 'cjk';
  if (cyr / letters >= 0.3) return 'cyrillic';
  if (latin / letters > 0.5) return 'latin';
  return 'other';
}

// ─── Parser helpers ───────────────────────────────────────────────────────────

const KNOWN_LABELS = [
  'Columbia', 'Atlantic', 'Asylum', 'Epic', 'RCA', 'RCA Victor', 'Capitol', 'A&M', 'Arista', 'Mercury',
  'MCA', 'Warner Bros', 'Elektra', 'Motown', 'Casablanca', 'ABC', 'ABC Dunhill', 'Sire', 'Polydor', 'Decca',
  'London', 'Chrysalis', 'Island', 'Reprise', 'Geffen', 'United Artists', 'UA', 'Liberty', 'Command',
  'Ampex', 'Amherst', 'MGM', 'Swan Song', 'Rondo', 'Delta', 'Grace Note', 'Dunhill', 'Imperial', 'Dot',
  'Philips', 'Vanguard', 'Verve', 'Blue Note', 'Stax', 'Chess', 'Apple', 'EMI', 'Harvest', 'Parlophone',
];
const KNOWN_LABELS_NORM = new Set(KNOWN_LABELS.map(l => l.toLowerCase()));

const LABEL_WORD_RE = /\b(records?|recordings?|disques|schallplatten|label)\b/i;

const NOISE_WORDS = [
  'vinyl lp record', 'lp record', 'debut album', 'promotional copy', 'long playing', 'long-playing',
  'self-titled', 'self titled', 'vinyl', 'lp', 'lps', 'record', 'records', 'album', 'albums', 'stereo',
  'mono', 'promo', 'gatefold', '2-lp', '2lp', 'hi-fidelity', 'hi-fi', '33', '45', 'rpm', 'cd', 'cassette',
];
const NOISE_RE = new RegExp(
  `(^|[\\s,(])(${NOISE_WORDS.map(w => w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})(?=$|[\\s,)!.])`,
  'gi'
);

const ENSEMBLE_RE = /\b(choir|choirs|chorus|chorale|orchestra|band|singers|ensemble|quartet|trio|symphony|philharmonic|glee club|chorister|choristers)\b/i;

const LABEL_PREFIX_CATNO_RE =
  /\b(SD|ST|SW|SKAO|SMAS|PC|KC|JC|FC|AFL1|APL1|LSP|SP|AL|AB|BS|BSK|MS|SR|SRM|SRK|KE|PE|JE|FE|UA-LA|ABCD|AA|DJM|CS|RS|SE|ASD|SIE|AK|BXL1|AYL1|AQL1|CPL1|ARL1|LPM)[\s-]?(\d{3,6}[A-Z]{0,2})\b/;

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function letterCount(s: string | null | undefined): number {
  if (!s) return 0;
  return (s.match(/\p{L}/gu) || []).length;
}

function looseNorm(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function labelBaseName(label: string): string {
  return collapse(label.replace(/\b(records?|recordings?|record co\.?|inc\.?|ltd\.?|co\.?|company)\b/gi, ' '));
}

function isLabelLike(s: string | null | undefined): boolean {
  if (!s) return false;
  if (LABEL_WORD_RE.test(s)) return true;
  return KNOWN_LABELS_NORM.has(s.trim().toLowerCase());
}

/** Format detection over free text. Returns null when only "vinyl" is known (size unknown). */
export function detectFormatFromText(text: string): RecordFormat | null {
  if (!text) return null;
  if (/\bbox(ed)?[\s-]set\b/i.test(text)) return 'Box';
  if (/\bLPs?\b/.test(text) || /\blong[\s-]playing\b/i.test(text) || /\b33\s?(1\/3|⅓)/.test(text)) return 'LP';
  if (/\bvinyl\b/i.test(text) && /\balbum\b/i.test(text)) return 'LP';
  if (/\b12["”″]\s*(single|maxi)/i.test(text) || /\b12[\s-]inch\s+single\b/i.test(text)) return '12in_single';
  if (/(^|\s)7["”″]/.test(text) || /\b7[\s-]inch\b/i.test(text) || /\b45\s?rpm\b/i.test(text)) return '7in';
  if (/(^|\s)10["”″]/.test(text) || /\b10[\s-]inch\b/i.test(text)) return '10in';
  if (/\bcassette\b/i.test(text)) return 'Cassette';
  if (/\bCDs?\b/.test(text) || /\bcompact disc\b/i.test(text)) return 'CD';
  return null;
}

/** Extract a catalog number that is literally present in the text. */
export function extractCatalogNumber(text: string): string | null {
  if (!text) return null;

  // (a) explicit "catalog 34165" / "catalog number SIE-13 ST X" / "(catalog C 31044)" / "cat. no. X"
  const explicit = text.match(/\bcat(?:alog(?:ue)?)?\.?\s*(?:number|no\.?|#)?\s*[:#]?\s+(.+)$/i);
  if (explicit) {
    const tokens = explicit[1].split(/\s+/);
    const out: string[] = [];
    for (const raw of tokens) {
      const stripped = raw.replace(/[),;.:]+$/, '');
      if (!stripped || !/^[A-Z0-9][A-Z0-9\-./]*$/.test(stripped)) break;
      out.push(stripped);
      if (raw !== stripped || out.length >= 3) break;
    }
    const joined = out.join(' ');
    if (/\d/.test(joined) && (joined.match(/[A-Z0-9]/g) || []).length >= 3) return joined;
  }

  // (b) parenthesized label-style catalog number, e.g. "(SD 7293)", "(RS 900SD)"
  const paren = text.match(/\(([A-Z]{1,5}[\s-]?\d{2,6}[A-Z]{0,3})\)/);
  if (paren) return collapse(paren[1]);

  // (c) known label prefixes anywhere in the text (case-sensitive), e.g. "RS 900SD"
  const prefixed = text.match(LABEL_PREFIX_CATNO_RE);
  if (prefixed) return `${prefixed[1]} ${prefixed[2]}`;

  return null;
}

function extractYear(title: string, description: string): number | null {
  const fromTitle = title.match(/\b(19[4-9]\d|20[0-2]\d)\b/);
  if (fromTitle) return Number(fromTitle[1]);
  const released = description.match(/\breleased\b[^.]{0,40}?\b(19[4-9]\d|20[0-2]\d)\b/i);
  if (released) return Number(released[1]);
  const any = description.match(/\b(19[4-9]\d|20[0-2]\d)\b/);
  return any ? Number(any[1]) : null;
}

function extractLabel(brand: string | null, title: string, description: string): string | null {
  if (brand && isLabelLike(brand)) return collapse(brand);
  for (const text of [title, description]) {
    const m = text.match(/\b((?:[A-Z][\w&'.-]*\s){0,2}[A-Z][\w&'.-]*)\s+(Records|Recordings)\b/);
    if (m) return collapse(`${m[1]} ${m[2]}`);
  }
  return null;
}

function extractQuotedTitle(description: string): string | null {
  const dbl = description.match(/["“]([^"”]{2,80})["”]/);
  if (dbl) return collapse(dbl[1].replace(/[,.;:]+$/, ''));
  const sgl = description.match(/(?:^|\s)['‘]([^'’]{2,80}?)['’](?=[\s,.;:)]|$)/);
  if (sgl) return collapse(sgl[1].replace(/[,.;:]+$/, ''));
  return null;
}

function extractArtistFromDescription(description: string): string | null {
  // "Julian Lennon's debut album", "Mr. Mister's 1985 debut"
  const poss = description.match(/^((?:[A-Z][\w.&-]*\s){0,4}[A-Z][\w.&-]*)['’]s\b/);
  if (poss) return collapse(poss[1]);
  const by = description.match(/\b(?:album|LP|record|recording)\s+by\s+((?:[A-Z][\w.&'-]*\s?){1,5})/);
  if (by) return collapse(by[1].replace(/\s(titled|on|from|with|released)\b.*$/i, ''));
  return null;
}

function containsNorm(haystack: string, needle: string): boolean {
  const h = looseNorm(haystack);
  const n = looseNorm(needle);
  return n.length > 0 && (` ${h} `).includes(` ${n} `);
}

function removeNorm(haystack: string, needle: string): string {
  const escaped = needle.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '\\s+');
  return collapse(haystack.replace(new RegExp(escaped, 'i'), ' ').replace(/^[\s,:\-–—]+|[\s,:\-–—]+$/g, ''));
}

function stripNoise(segment: string, label: string | null, catno: string | null): string {
  let s = segment;
  if (catno) s = s.replace(new RegExp(catno.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '[\\s-]?'), 'g'), ' ');
  if (label) {
    s = s.replace(new RegExp(label.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi'), ' ');
  }
  s = s.replace(/\((album|lp|vinyl|record)\)/gi, ' ');
  s = s.replace(/\b(19[4-9]\d|20[0-2]\d)s?\b/g, ' ');
  s = s.replace(/\b\d{4}s\b/g, ' ');
  // Run twice: adjacent noise words ("Vinyl LP Record") share separators.
  s = s.replace(NOISE_RE, '$1 ').replace(NOISE_RE, '$1 ');
  s = collapse(s).replace(/^[\s,:\-–—]+|[\s,:\-–—]+$/g, '');
  if (label) {
    const base = labelBaseName(label);
    if (base && looseNorm(s) === looseNorm(base)) return '';
  }
  if (KNOWN_LABELS_NORM.has(s.toLowerCase())) return '';
  return s;
}

/**
 * Deterministic parser: derive record identity from FindA.Sale data we already have.
 * Pure function -- no I/O, no AI. Every returned field is a 'title_parse' value.
 */
export function deriveRecordIdentityFromText(input: RecordIdentityTextInput): RecordIdentityValues {
  const title = collapse(input.title || '');
  const description = collapse(input.description || '');
  const brand = input.brand ? collapse(input.brand) : null;
  const tagsText = (input.tags || []).join(', ');

  const format = detectFormatFromText(title) ?? detectFormatFromText(`${description} ${tagsText}`);
  const catalogNumber = extractCatalogNumber(description) ?? extractCatalogNumber(title);
  const year = extractYear(title, description);
  const label = extractLabel(brand, title, description);
  const brandIsArtist = !!brand && !isLabelLike(brand);
  const quoted = extractQuotedTitle(description);
  const selfTitled = /\bself[\s-]titled\b/i.test(`${title} ${description}`);

  let artist: string | null = null;
  let releaseTitle: string | null = null;

  // "Title by Artist"
  const byMatch = title.split(',')[0].match(/^(.+?)\s+by\s+(.+)$/i);
  // "Artist - Title" / "Artist – Title" / "Artist: Title"
  const dashMatch = title.match(/^(.+?)\s+[-–—]\s+(.+)$/) || title.match(/^([^:]+?):\s+(.+)$/);

  if (byMatch) {
    releaseTitle = stripNoise(byMatch[1], label, catalogNumber) || null;
    artist = stripNoise(byMatch[2], label, catalogNumber) || null;
  } else if (dashMatch) {
    artist = stripNoise(dashMatch[1], label, catalogNumber) || null;
    releaseTitle = stripNoise(dashMatch[2].split(',')[0], label, catalogNumber) || null;
  } else {
    const segments = title
      .split(',')
      .map(seg => stripNoise(seg, label, catalogNumber))
      .filter(seg => letterCount(seg) >= 2);

    if (segments.length >= 2) {
      const [s0, s1] = segments;
      let artistIdx: 0 | 1 = 0;
      if (quoted && (containsNorm(s1, quoted) || containsNorm(quoted, s1))) artistIdx = 0;
      else if (quoted && (containsNorm(s0, quoted) || containsNorm(quoted, s0))) artistIdx = 1;
      else if (brandIsArtist && looseNorm(brand!) === looseNorm(s1)) artistIdx = 1;
      else if (brandIsArtist && looseNorm(brand!) === looseNorm(s0)) artistIdx = 0;
      else if (ENSEMBLE_RE.test(s1) && !ENSEMBLE_RE.test(s0)) artistIdx = 1;
      else if (ENSEMBLE_RE.test(s0) && !ENSEMBLE_RE.test(s1)) artistIdx = 0;
      else if (new RegExp(`\\bby\\s+(the\\s+)?${s1.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'i').test(description)) artistIdx = 1;
      artist = artistIdx === 0 ? s0 : s1;
      releaseTitle = artistIdx === 0 ? s1 : s0;
    } else if (segments.length === 1) {
      const s = segments[0];
      if (quoted && containsNorm(s, quoted)) {
        releaseTitle = quoted;
        const rest = removeNorm(s, quoted);
        artist = letterCount(rest) >= 2 ? rest : null;
      } else if (brandIsArtist && containsNorm(s, brand!)) {
        artist = brand!;
        const rest = removeNorm(s, brand!);
        releaseTitle = letterCount(rest) >= 2 ? rest : selfTitled ? brand! : null;
      } else {
        const descArtist = extractArtistFromDescription(description);
        if (descArtist && containsNorm(s, descArtist)) {
          artist = descArtist;
          const rest = removeNorm(s, descArtist);
          releaseTitle = letterCount(rest) >= 2 ? rest : selfTitled ? descArtist : null;
        } else if (selfTitled) {
          artist = s;
          releaseTitle = s;
        } else if (quoted) {
          releaseTitle = quoted;
          artist = descArtist ?? (brandIsArtist ? brand : null);
        } else {
          releaseTitle = s;
          artist = descArtist ?? (brandIsArtist ? brand : null);
        }
      }
    }
  }

  if (!artist && brandIsArtist) artist = brand;
  if (/^various( artists)?$/i.test(artist || '')) artist = 'Various';

  return {
    artist: artist ? collapse(artist) : null,
    releaseTitle: releaseTitle ? collapse(releaseTitle) : null,
    label,
    catalogNumber,
    year,
    format,
    script: scriptOf(releaseTitle || title),
  };
}

// ─── Stored-shape helpers ─────────────────────────────────────────────────────

function isField(v: any): v is RecordIdentityField<any> {
  return v != null && typeof v === 'object' && 'source' in v;
}

/** Read a stored Item.recordIdentity JSON defensively (unknown/malformed input -> {}). */
export function readStoredRecordIdentity(raw: unknown): RecordIdentity {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: RecordIdentity = {};
  const src = raw as Record<string, any>;
  for (const key of RECORD_IDENTITY_KEYS) {
    if (isField(src[key])) (out as any)[key] = { value: src[key].value ?? null, source: src[key].source };
  }
  if (typeof src.extractedAt === 'string') out.extractedAt = src.extractedAt;
  return out;
}

/**
 * Combine the stored identity with a fresh deterministic parse. Non-'title_parse' stored fields
 * (organizer / ai / ocr) are kept verbatim; 'title_parse' fields are recomputed from current
 * item text so organizer title/description edits flow through.
 */
export function effectiveRecordIdentity(
  storedRaw: unknown,
  derived: RecordIdentityValues
): { identity: RecordIdentity; values: RecordIdentityValues; sources: RecordIdentitySources } {
  const stored = readStoredRecordIdentity(storedRaw);
  const identity: RecordIdentity = {};
  const values: any = {};
  const sources: RecordIdentitySources = {};
  for (const key of RECORD_IDENTITY_KEYS) {
    const s = (stored as any)[key] as RecordIdentityField<any> | undefined;
    if (s && s.source !== 'title_parse') {
      (identity as any)[key] = s;
      values[key] = s.value ?? null;
      sources[key] = s.source;
    } else if ((derived as any)[key] != null) {
      (identity as any)[key] = { value: (derived as any)[key], source: 'title_parse' };
      values[key] = (derived as any)[key];
      sources[key] = 'title_parse';
    } else {
      values[key] = null;
    }
  }
  identity.extractedAt = stored.extractedAt ?? new Date().toISOString();
  return { identity, values: values as RecordIdentityValues, sources };
}

function cleanString(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const t = collapse(v).slice(0, max);
  return t.length > 0 ? t : null;
}

function cleanYear(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1880 || n > 2100) return null;
  return n;
}

function cleanFormat(v: unknown): RecordFormat | null {
  return typeof v === 'string' && (RECORD_FORMATS as string[]).includes(v) ? (v as RecordFormat) : null;
}

function cleanScript(v: unknown): RecordScript | null {
  return typeof v === 'string' && (RECORD_SCRIPTS as string[]).includes(v) ? (v as RecordScript) : null;
}

/**
 * Merge an AI tagging result's recordIdentity into the stored identity. Organizer fields always
 * win. catalogNumber/label are only kept under low confidence when they appear verbatim in the
 * Vision OCR text (ADR-132 section 2.1).
 */
export function mergeAiRecordIdentity(
  storedRaw: unknown,
  ai: AIRecordIdentity | null | undefined,
  opts: { confidence?: number | null; ocrText?: string[] | null } = {}
): RecordIdentity | null {
  if (!ai || typeof ai !== 'object') return null;
  const stored = readStoredRecordIdentity(storedRaw);
  const lowConfidence = typeof opts.confidence === 'number' && opts.confidence < 0.6;
  const ocrBlob = (opts.ocrText || []).join(' ').toLowerCase();
  const verbatimInOcr = (v: string | null) => !!v && ocrBlob.includes(v.toLowerCase());

  const incoming: Partial<RecordIdentityValues> = {
    artist: cleanString(ai.artist),
    releaseTitle: cleanString(ai.releaseTitle),
    label: cleanString(ai.label),
    catalogNumber: cleanString(ai.catalogNumber, 60),
    year: cleanYear(ai.year),
    format: cleanFormat(ai.format),
    script: cleanScript(ai.script),
  };
  if (lowConfidence) {
    incoming.artist = null;
    incoming.releaseTitle = null;
    incoming.year = null;
    incoming.format = null;
    if (!verbatimInOcr(incoming.catalogNumber ?? null)) incoming.catalogNumber = null;
    if (!verbatimInOcr(incoming.label ?? null)) incoming.label = null;
  }

  const out: RecordIdentity = { ...stored };
  let changed = false;
  for (const key of RECORD_IDENTITY_KEYS) {
    const existing = (stored as any)[key] as RecordIdentityField<any> | undefined;
    if (existing && existing.source === 'organizer') continue;
    const v = (incoming as any)[key];
    if (v == null) continue;
    const source: RecordIdentitySource =
      (key === 'catalogNumber' || key === 'label') && lowConfidence ? 'ocr' : 'ai';
    (out as any)[key] = { value: v, source };
    changed = true;
  }
  if (!changed) return null;
  out.extractedAt = new Date().toISOString();
  return out;
}

/**
 * Validate an organizer edit (PUT record-identity). Only the listed keys are accepted; a key
 * present with null/'' pins the field as "unknown" (organizer source), a missing key keeps the
 * stored value. Returns { identity } or { error }.
 */
export function applyOrganizerRecordIdentity(
  storedRaw: unknown,
  body: Record<string, unknown>
): { identity: RecordIdentity } | { error: string } {
  const stored = readStoredRecordIdentity(storedRaw);
  const out: RecordIdentity = { ...stored };
  const allowed = new Set<string>(RECORD_IDENTITY_KEYS.filter(k => k !== 'script'));
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) return { error: `Unknown field: ${key}` };
  }
  for (const key of allowed) {
    if (!(key in body)) continue;
    const raw = body[key];
    let value: any = null;
    if (raw === null || raw === '') value = null;
    else if (key === 'year') {
      value = cleanYear(raw);
      if (value == null) return { error: 'year must be an integer between 1880 and 2100' };
    } else if (key === 'format') {
      value = cleanFormat(raw);
      if (value == null) return { error: `format must be one of ${RECORD_FORMATS.join(', ')}` };
    } else {
      value = cleanString(raw, key === 'catalogNumber' ? 60 : 200);
      if (typeof raw !== 'string') return { error: `${key} must be a string` };
    }
    (out as any)[key] = { value, source: 'organizer' };
  }
  if (out.releaseTitle?.value) out.script = { value: scriptOf(out.releaseTitle.value), source: 'organizer' };
  out.extractedAt = new Date().toISOString();
  return { identity: out };
}
