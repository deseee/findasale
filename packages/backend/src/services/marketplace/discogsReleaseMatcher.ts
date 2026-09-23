/**
 * discogsReleaseMatcher.ts -- ADR-132 section 3: Discogs release matcher v2.
 *
 * Pure scoring plus search orchestration. All Discogs I/O goes through an injected `search`
 * function (and optional `getRelease`), so the matcher runs against recorded fixtures in tests
 * and never calls the network itself.
 *
 * Tiers (stop at the first tier that produces an accepted candidate, else merge candidates):
 *   1 barcode=<UPC/EAN>          (checksum-valid only)
 *   2 catno=<catno>[&label=]     (retry once compacted / without label)
 *   3 artist+release_title+format
 *   4 artist+release_title       (candidate source only, never auto-accepted)
 *   5 q=<cleaned title>          (candidate source only, never auto-accepted)
 * Budget: at most 4 search calls per item.
 *
 * Hard vetoes (any veto blocks auto_high): format, script, artist (<0.6), title (<0.6).
 *
 * Accept rules for auto_high (no veto on the chosen candidate):
 *   A barcode hit, format consistent
 *   B catno match and (label >= 0.8 or artist >= 0.8)
 *   C artist >= 0.85, title >= 0.85, format known and equal, and artist/title NOT from
 *     'title_parse' alone
 * Several passing pressings of the SAME album with no disambiguating evidence: Patrick
 * decision D3 (relaxed, 2026-09-23) -- pick the most-collected pressing (community.have), still
 * auto_high, but flagged `autoSelectedPressing` so push is Draft-only until the organizer
 * confirms. Passing candidates from DIFFERENT albums -> needs_selection.
 */

import crypto from 'crypto';
import type { RecordIdentitySources, RecordIdentityValues, RecordFormat } from './recordIdentity';
import { scriptOf, labelBaseName } from './recordIdentity';

export const MATCHER_VERSION = 2;

export type DiscogsMatchStatus = 'auto_high' | 'needs_selection' | 'confirmed' | 'not_in_discogs';
export type DiscogsVeto = 'format' | 'script' | 'artist' | 'title';
export type DiscogsFormatClass = 'LP' | '7in' | '10in' | '12in_single' | 'CD' | 'Cassette' | 'Box' | null;
export type DiscogsAcceptRule = 'barcode' | 'catno' | 'structured';

export interface DiscogsCandidate {
  releaseId: number;
  masterId: number | null;
  artist: string;
  title: string;
  formats: string[];
  formatClass: DiscogsFormatClass;
  labels: string[];
  catno: string | null;
  year: number | null;
  country: string | null;
  thumb: string | null;
  uri: string;
  tier: 0 | 1 | 2 | 3 | 4 | 5;
  composite: number;
  fieldScores: {
    artist: number | null;
    title: number | null;
    catno: boolean;
    label: number | null;
    yearDelta: number | null;
  };
  vetoes: DiscogsVeto[];
  warnings: string[];
  community: { have: number; want: number } | null;
  /** D3 relaxed: this pressing was auto-picked as the most-collected among equivalent pressings. */
  autoSelectedPressing?: boolean;
  /** The release the organizer's LIVE Discogs listing currently uses (sweep / mismatch). */
  currentlyListed?: boolean;
  /** Added from an organizer-pasted release URL. */
  fromPastedUrl?: boolean;
}

export interface DiscogsMatchResult {
  status: 'auto_high' | 'needs_selection';
  releaseId: number | null;
  candidates: DiscogsCandidate[];
  reason: string;
  rule: DiscogsAcceptRule | null;
  autoSelectedPressing: boolean;
  searchCalls: number;
  searchErrors: number;
  matcherVersion: typeof MATCHER_VERSION;
}

export interface DiscogsMatchInput {
  identity: RecordIdentityValues;
  sources?: RecordIdentitySources;
  upc?: string | null;
  ean?: string | null;
  /** Item.title, used only for the tier-5 free-text fallback. */
  fallbackTitle?: string | null;
}

/** Search: returns the `results` array, or null when the request failed. */
export type DiscogsSearchFn = (params: Record<string, string>) => Promise<any[] | null>;

export interface DiscogsMatcherDeps {
  search: DiscogsSearchFn;
}

// ─── Normalization / similarity ───────────────────────────────────────────────

export function norm(s: string | null | undefined): string {
  if (!s) return '';
  let t = s.normalize('NFKC').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  t = t.replace(/\*/g, '').trim().replace(/\s*\(\d+\)$/, '');
  t = t
    .replace(/^the\s+/, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

function bigrams(s: string): string[] {
  const chars = Array.from(s);
  const out: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]);
  return out;
}

/** Bigram Dice coefficient on already-normalized strings. */
export function diceNormalized(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 || B.length === 0) return 0;
  const remaining = new Map<string, number>();
  for (const bg of B) remaining.set(bg, (remaining.get(bg) || 0) + 1);
  let matches = 0;
  for (const bg of A) {
    const c = remaining.get(bg) || 0;
    if (c > 0) {
      matches++;
      remaining.set(bg, c - 1);
    }
  }
  return (2 * matches) / (A.length + B.length);
}

export function dice(a: string | null | undefined, b: string | null | undefined): number {
  return diceNormalized(norm(a), norm(b));
}

export function normalizeCatno(s: string | null | undefined): string {
  return (s || '').toUpperCase().replace(/[\s\-._/]/g, '');
}

function normalizeLabel(s: string | null | undefined): string {
  return norm(labelBaseName(s || ''));
}

// ─── Format classification ────────────────────────────────────────────────────

export function formatClass(formats: string[] | null | undefined): DiscogsFormatClass {
  if (!formats || formats.length === 0) return null;
  const f = formats
    .flatMap(x => String(x).split(','))
    .map(x => x.trim().toLowerCase().replace(/^\d+\s*[x×]\s*/, ''))
    .filter(Boolean);
  const has = (re: RegExp) => f.some(x => re.test(x));
  if (has(/^box set$/)) return 'Box';
  if (has(/^cd(r|-r)?$/) && !has(/^vinyl$/)) return 'CD';
  if (has(/^cassette$/)) return 'Cassette';
  if (has(/^7"$/)) return '7in';
  if (has(/^10"$/)) return '10in';
  if (has(/^12"$/) && has(/single|maxi/)) return '12in_single';
  if (has(/^lp$/)) return 'LP';
  if (has(/^album$/) && (has(/^vinyl$/) || has(/^12"$/))) return 'LP';
  if (has(/^vinyl$/) && has(/^12"$/)) return 'LP';
  if (has(/^vinyl$/) && has(/single|45 rpm/)) return '7in';
  return null;
}

function formatsCompatible(itemFormat: RecordFormat | null, cand: DiscogsFormatClass): boolean | null {
  if (!itemFormat || itemFormat === 'Other' || !cand) return null; // unknown
  return itemFormat === cand;
}

// ─── Barcode ──────────────────────────────────────────────────────────────────

/** Returns the digit string when it is a checksum-valid UPC-A (12) or EAN-13 (13), else null. */
export function validBarcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[\s-]/g, '');
  if (!/^\d{12,13}$/.test(digits)) return null;
  const nums = digits.split('').map(Number);
  const check = nums.pop()!;
  let sum = 0;
  for (let i = nums.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += nums[i] * w;
  return (10 - (sum % 10)) % 10 === check ? digits : null;
}

// ─── Candidate construction ───────────────────────────────────────────────────

const GENERIC_TITLES = new Set([
  'christmas', 'greatest hits', 'hits', 'songs', 'music', 'vinyl', 'record', 'album', 'untitled', 'lp',
  'best of', 'the best of',
].map(norm));

function splitArtistTitle(full: string): { artist: string; title: string } {
  const idx = full.indexOf(' - ');
  if (idx === -1) return { artist: '', title: full.trim() };
  return { artist: full.slice(0, idx).trim(), title: full.slice(idx + 3).trim() };
}

function variants(s: string): string[] {
  const parts = s.split(/\s+=\s+/).map(x => x.trim()).filter(Boolean);
  const out = new Set<string>(parts.length ? parts : [s]);
  for (const p of Array.from(out)) {
    const noParen = p.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    if (noParen) out.add(noParen);
  }
  return Array.from(out);
}

/** Only accept Discogs CDN image URLs for thumbnails; anything else becomes null. */
const DISCOGS_THUMB_RE = /^https:\/\/(i|img)\.discogs\.com\//;
function safeThumb(v: any): string | null {
  if (!v) return null;
  const s = String(v);
  return DISCOGS_THUMB_RE.test(s) ? s : null;
}

function toInt(v: any): number | null {
  const n = typeof v === 'string' ? parseInt(v, 10) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

interface RawCandidate {
  releaseId: number;
  masterId: number | null;
  artist: string;
  title: string;
  formats: string[];
  labels: string[];
  catno: string | null;
  year: number | null;
  country: string | null;
  thumb: string | null;
  community: { have: number; want: number } | null;
}

/** From a /database/search result row. */
export function rawFromSearchResult(r: any): RawCandidate | null {
  const releaseId = toInt(r?.id);
  if (!releaseId || !r?.title) return null;
  const { artist, title } = splitArtistTitle(String(r.title));
  return {
    releaseId,
    masterId: toInt(r.master_id),
    artist,
    title,
    formats: Array.isArray(r.format) ? r.format.map(String) : [],
    labels: Array.isArray(r.label) ? Array.from(new Set(r.label.map(String))) as string[] : [],
    catno: r.catno ? String(r.catno) : null,
    year: toInt(r.year),
    country: r.country ? String(r.country) : null,
    thumb: safeThumb(r.thumb) ?? safeThumb(r.cover_image),
    community: r.community
      ? { have: Number(r.community.have) || 0, want: Number(r.community.want) || 0 }
      : null,
  };
}

/** From a GET /releases/{id} response (used for pasted URLs). */
export function rawFromRelease(r: any): RawCandidate | null {
  const releaseId = toInt(r?.id);
  if (!releaseId) return null;
  const artists: any[] = Array.isArray(r.artists) ? r.artists : [];
  const artist = r.artists_sort
    ? String(r.artists_sort)
    : artists.map(a => String(a?.name ?? '')).filter(Boolean).join(' & ');
  const formats: string[] = [];
  for (const f of Array.isArray(r.formats) ? r.formats : []) {
    if (f?.name) formats.push(String(f.name));
    for (const d of Array.isArray(f?.descriptions) ? f.descriptions : []) formats.push(String(d));
  }
  const labels: any[] = Array.isArray(r.labels) ? r.labels : [];
  return {
    releaseId,
    masterId: toInt(r.master_id),
    artist,
    title: String(r.title ?? ''),
    formats,
    labels: Array.from(new Set(labels.map(l => String(l?.name ?? '')).filter(Boolean))),
    catno: labels[0]?.catno ? String(labels[0].catno) : null,
    year: toInt(r.year),
    country: r.country ? String(r.country) : null,
    thumb: safeThumb(r.thumb),
    community: r.community ? { have: Number(r.community.have) || 0, want: Number(r.community.want) || 0 } : null,
  };
}

/** From the `release` object embedded in GET /marketplace/listings/{id}. */
export function rawFromListingRelease(rel: any): RawCandidate | null {
  const releaseId = toInt(rel?.id);
  if (!releaseId) return null;
  let artist = rel.artist ? String(rel.artist) : '';
  let title = rel.title ? String(rel.title) : '';
  if ((!artist || !title) && rel.description) {
    const split = splitArtistTitle(String(rel.description));
    artist = artist || split.artist;
    title = title || split.title;
  }
  return {
    releaseId,
    masterId: null,
    artist,
    title,
    formats: rel.format ? String(rel.format).split(',').map((x: string) => x.trim()).filter(Boolean) : [],
    labels: rel.label ? [String(rel.label)] : [],
    catno: rel.catalog_number ? String(rel.catalog_number) : null,
    year: toInt(rel.year),
    country: rel.country ? String(rel.country) : null,
    thumb: safeThumb(rel.thumbnail),
    community: null,
  };
}

/** Score one raw candidate against the item identity. Pure. */
export function scoreCandidate(
  raw: RawCandidate,
  identity: RecordIdentityValues,
  tier: DiscogsCandidate['tier'],
  fallbackTitle?: string | null
): DiscogsCandidate {
  const artistVariants = variants(raw.artist);
  const titleVariants = variants(raw.title);

  let artistSim: number | null = null;
  if (identity.artist) {
    const itemIsVarious = /^various( artists)?$/i.test(identity.artist.trim());
    const candIsVarious = artistVariants.some(v => /^various$/i.test(norm(v)));
    if (itemIsVarious || candIsVarious) artistSim = itemIsVarious && candIsVarious ? 1 : 0;
    else artistSim = Math.max(0, ...artistVariants.map(v => dice(identity.artist, v)));
  }
  let titleSim: number | null = null;
  if (identity.releaseTitle) {
    titleSim = Math.max(0, ...titleVariants.map(v => dice(identity.releaseTitle, v)));
  }

  const fClass = formatClass(raw.formats);
  const fmtOk = formatsCompatible(identity.format, fClass);
  const itemCatno = normalizeCatno(identity.catalogNumber);
  const catnoMatch =
    !!itemCatno && !!raw.catno && raw.catno.split(',').some(c => normalizeCatno(c) === itemCatno);
  let labelSim: number | null = null;
  if (identity.label && raw.labels.length) {
    const il = normalizeLabel(identity.label);
    labelSim = Math.max(0, ...raw.labels.map(l => diceNormalized(il, normalizeLabel(l))));
  }
  const yearDelta = identity.year && raw.year ? Math.abs(identity.year - raw.year) : null;

  const vetoes: DiscogsVeto[] = [];
  if (fmtOk === false) vetoes.push('format');
  const itemScript = identity.script ?? scriptOf(identity.releaseTitle || fallbackTitle || '');
  const candScript = scriptOf(`${raw.artist} ${raw.title}`);
  if (itemScript === 'latin' && (candScript === 'cjk' || candScript === 'cyrillic')) vetoes.push('script');
  if (artistSim != null && artistSim < 0.6) vetoes.push('artist');
  if (titleSim != null && titleSim < 0.6) vetoes.push('title');

  const warnings: string[] = [];
  if (vetoes.includes('format') && fClass) warnings.push(`Different format: ${fClass}`);
  if (vetoes.includes('script')) warnings.push(raw.country ? `${raw.country} pressing (non-Latin title)` : 'Non-Latin title');
  if (vetoes.includes('artist')) warnings.push('Different artist');
  if (vetoes.includes('title')) warnings.push('Different title');
  if (labelSim != null && labelSim < 0.5) warnings.push('Different label');
  if (yearDelta != null && yearDelta > 5) warnings.push(`Year differs by ${yearDelta}`);

  let composite =
    0.4 * (titleSim ?? 0) +
    0.35 * (artistSim ?? 0) +
    0.1 * (fmtOk === true ? 1 : fmtOk === null ? 0.5 : 0) +
    0.1 * (catnoMatch ? 1 : 0) +
    0.05 * (labelSim != null && labelSim >= 0.8 ? 1 : 0);
  if (yearDelta != null && yearDelta <= 1) composite += 0.03;
  if (yearDelta != null && yearDelta > 5) composite -= 0.05;

  return {
    releaseId: raw.releaseId,
    masterId: raw.masterId,
    artist: raw.artist,
    title: raw.title,
    formats: raw.formats,
    formatClass: fClass,
    labels: raw.labels,
    catno: raw.catno,
    year: raw.year,
    country: raw.country,
    thumb: raw.thumb,
    uri: `https://www.discogs.com/release/${raw.releaseId}`,
    tier,
    composite: Math.round(composite * 1000) / 1000,
    fieldScores: {
      artist: artistSim == null ? null : Math.round(artistSim * 1000) / 1000,
      title: titleSim == null ? null : Math.round(titleSim * 1000) / 1000,
      catno: catnoMatch,
      label: labelSim == null ? null : Math.round(labelSim * 1000) / 1000,
      yearDelta,
    },
    vetoes,
    warnings,
    community: raw.community,
  };
}

// ─── Ranking / acceptance ─────────────────────────────────────────────────────

export function rankCandidates(cands: DiscogsCandidate[]): DiscogsCandidate[] {
  return [...cands].sort((a, b) => {
    const av = a.vetoes.length > 0 ? 1 : 0;
    const bv = b.vetoes.length > 0 ? 1 : 0;
    if (av !== bv) return av - bv;
    if (b.composite !== a.composite) return b.composite - a.composite;
    const ah = a.community?.have ?? 0;
    const bh = b.community?.have ?? 0;
    if (bh !== ah) return bh - ah;
    return a.releaseId - b.releaseId;
  });
}

function passesRule(
  c: DiscogsCandidate,
  identity: RecordIdentityValues,
  sources: RecordIdentitySources | undefined
): DiscogsAcceptRule | null {
  if (c.vetoes.length > 0) return null;
  if (c.tier > 3) return null;
  const fmt = formatsCompatible(identity.format, c.formatClass);
  if (c.tier === 1 && fmt !== false) return 'barcode';
  const artist = c.fieldScores.artist ?? 0;
  const label = c.fieldScores.label ?? 0;
  if (c.fieldScores.catno && (label >= 0.8 || artist >= 0.8)) return 'catno';
  const structuredSourcesOk =
    !!sources &&
    sources.artist != null && sources.artist !== 'title_parse' &&
    sources.releaseTitle != null && sources.releaseTitle !== 'title_parse';
  if (
    artist >= 0.85 &&
    (c.fieldScores.title ?? 0) >= 0.85 &&
    fmt === true &&
    structuredSourcesOk
  ) {
    return 'structured';
  }
  return null;
}

function sameAlbum(cands: DiscogsCandidate[]): boolean {
  const masters = new Set(cands.map(c => c.masterId));
  if (!masters.has(null)) return masters.size === 1;
  const known = Array.from(masters).filter(m => m != null);
  if (known.length > 1) return false;
  const keys = new Set(cands.map(c => `${norm(variants(c.artist)[0])}|${norm(variants(c.title)[0])}`));
  return keys.size === 1;
}

interface Decision {
  releaseId: number;
  rule: DiscogsAcceptRule;
  reason: string;
  autoSelectedPressing: boolean;
}

function decide(
  pool: DiscogsCandidate[],
  identity: RecordIdentityValues,
  sources: RecordIdentitySources | undefined
): Decision | { ambiguousAlbum: true } | null {
  const passing: Array<{ c: DiscogsCandidate; rule: DiscogsAcceptRule }> = [];
  for (const c of pool) {
    const rule = passesRule(c, identity, sources);
    if (rule) passing.push({ c, rule });
  }
  if (passing.length === 0) return null;
  const ruleRank: Record<DiscogsAcceptRule, number> = { barcode: 0, catno: 1, structured: 2 };
  passing.sort((a, b) => ruleRank[a.rule] - ruleRank[b.rule]);
  const bestRule = passing[0].rule;
  let set = passing.filter(p => p.rule === bestRule).map(p => p.c);
  const reasonBase = bestRule === 'barcode' ? 'barcode' : bestRule === 'catno' ? 'catno_label' : 'artist_title_format';

  if (set.length === 1) {
    return { releaseId: set[0].releaseId, rule: bestRule, reason: reasonBase, autoSelectedPressing: false };
  }
  if (!sameAlbum(set)) return { ambiguousAlbum: true };

  // Evidence narrowing: catno -> label -> exact year.
  const narrow = (pred: (c: DiscogsCandidate) => boolean) => {
    const next = set.filter(pred);
    if (next.length > 0) set = next;
  };
  narrow(c => c.fieldScores.catno);
  narrow(c => (c.fieldScores.label ?? 0) >= 0.8);
  narrow(c => c.fieldScores.yearDelta === 0);
  if (set.length === 1) {
    return { releaseId: set[0].releaseId, rule: bestRule, reason: `${reasonBase}_evidence`, autoSelectedPressing: false };
  }

  // D3 (relaxed): most-collected pressing, Draft-only until the organizer confirms.
  const pick = [...set].sort((a, b) => {
    const d = (b.community?.have ?? 0) - (a.community?.have ?? 0);
    return d !== 0 ? d : a.releaseId - b.releaseId;
  })[0];
  return { releaseId: pick.releaseId, rule: bestRule, reason: 'most_collected_pressing', autoSelectedPressing: true };
}

// ─── Orchestration ────────────────────────────────────────────────────────────

const FORMAT_WORDS_RE = /\b(LP|Vinyl|Record|Records|Album|CD|EP|45|Cassette|Disc)\b/gi;

export function cleanFallbackQuery(title: string | null | undefined): string {
  if (!title) return '';
  return (title.split(',')[0] ?? '').replace(FORMAT_WORDS_RE, ' ').replace(/\s+/g, ' ').trim();
}

function letters(s: string | null | undefined): number {
  return s ? (s.match(/\p{L}/gu) || []).length : 0;
}

function formatSearchParam(f: RecordFormat | null): string | null {
  switch (f) {
    case 'LP':
    case '7in':
    case '10in':
    case '12in_single':
      return 'Vinyl';
    case 'CD':
      return 'CD';
    case 'Cassette':
      return 'Cassette';
    case 'Box':
      return 'Box Set';
    default:
      return null;
  }
}

const MAX_SEARCH_CALLS = 4;

export async function matchDiscogsRelease(
  input: DiscogsMatchInput,
  deps: DiscogsMatcherDeps
): Promise<DiscogsMatchResult> {
  const identity = input.identity;
  const barcode = validBarcode(input.upc) ?? validBarcode(input.ean);
  const catno =
    identity.catalogNumber && (identity.catalogNumber.match(/[A-Za-z0-9]/g) || []).length >= 3
      ? identity.catalogNumber
      : null;
  const titleOk = letters(identity.releaseTitle) >= 2 && !GENERIC_TITLES.has(norm(identity.releaseTitle));
  const structuredOk = letters(identity.artist) >= 2 && titleOk;
  const fallbackQ = cleanFallbackQuery(input.fallbackTitle);
  const fallbackOk = letters(fallbackQ) >= 3 && !GENERIC_TITLES.has(norm(fallbackQ));

  let searchCalls = 0;
  let searchErrors = 0;
  const result = (partial: Partial<DiscogsMatchResult> & Pick<DiscogsMatchResult, 'status' | 'reason'>): DiscogsMatchResult => ({
    releaseId: null,
    candidates: [],
    rule: null,
    autoSelectedPressing: false,
    searchCalls,
    searchErrors,
    matcherVersion: MATCHER_VERSION,
    ...partial,
  });

  if (!barcode && !catno && !structuredOk && !fallbackOk) {
    return result({ status: 'needs_selection', reason: 'query_too_weak' });
  }

  const pool = new Map<number, DiscogsCandidate>();
  const runSearch = async (tier: DiscogsCandidate['tier'], params: Record<string, string>): Promise<DiscogsCandidate[]> => {
    if (searchCalls >= MAX_SEARCH_CALLS) return [];
    searchCalls++;
    const rows = await deps.search({ ...params, type: 'release', per_page: '25' });
    if (rows == null) {
      searchErrors++;
      return [];
    }
    const out: DiscogsCandidate[] = [];
    for (const row of rows) {
      const raw = rawFromSearchResult(row);
      if (!raw) continue;
      const existing = pool.get(raw.releaseId);
      if (existing && existing.tier <= tier) {
        out.push(existing);
        continue;
      }
      const scored = scoreCandidate(raw, identity, tier, input.fallbackTitle);
      pool.set(raw.releaseId, scored);
      out.push(scored);
    }
    return out;
  };

  const finish = (d: Decision): DiscogsMatchResult => {
    const ranked = rankCandidates(Array.from(pool.values()));
    const chosen = pool.get(d.releaseId)!;
    const chosenCopy: DiscogsCandidate = { ...chosen, ...(d.autoSelectedPressing ? { autoSelectedPressing: true } : {}) };
    const rest = ranked.filter(c => c.releaseId !== d.releaseId).slice(0, 2);
    return result({
      status: 'auto_high',
      releaseId: d.releaseId,
      candidates: [chosenCopy, ...rest],
      reason: d.reason,
      rule: d.rule,
      autoSelectedPressing: d.autoSelectedPressing,
    });
  };

  let ambiguousAlbum = false;
  const tryDecide = (): DiscogsMatchResult | null => {
    const d = decide(Array.from(pool.values()), identity, input.sources);
    if (d && 'ambiguousAlbum' in d) {
      ambiguousAlbum = true;
      return null;
    }
    return d ? finish(d) : null;
  };

  // Tier 1: barcode
  if (barcode) {
    await runSearch(1, { barcode });
    const r = tryDecide();
    if (r) return r;
  }

  // Tier 2: catalog number (+label), one retry compacted / without label
  if (catno) {
    const labelParam = identity.label ? labelBaseName(identity.label) : '';
    const first = await runSearch(2, labelParam ? { catno, label: labelParam } : { catno });
    if (first.length === 0) {
      const compact = catno.replace(/[\s\-.]/g, '');
      await runSearch(2, { catno: compact });
    }
    const r = tryDecide();
    if (r) return r;
  }

  // Tier 3 / 4: structured artist + release_title
  if (structuredOk) {
    const fmt = formatSearchParam(identity.format);
    if (fmt) {
      await runSearch(3, { artist: identity.artist!, release_title: identity.releaseTitle!, format: fmt });
      const r = tryDecide();
      if (r) return r;
    }
    await runSearch(4, { artist: identity.artist!, release_title: identity.releaseTitle! });
  }

  // Tier 5: legacy free-text (candidate source only)
  if ((pool.size === 0 || !structuredOk) && fallbackOk) {
    await runSearch(5, { q: fallbackQ });
  }

  const ranked = rankCandidates(Array.from(pool.values())).slice(0, 3);
  let reason: string;
  if (searchCalls > 0 && searchErrors === searchCalls) reason = 'search_failed';
  else if (ranked.length === 0) reason = 'no_candidates';
  else if (ambiguousAlbum) reason = 'ambiguous_album';
  else if (!structuredOk && !barcode && !catno) reason = 'title_only';
  else if (ranked.every(c => c.vetoes.length > 0)) reason = 'all_candidates_vetoed';
  else reason = 'needs_confirmation';
  return result({ status: 'needs_selection', candidates: ranked, reason });
}

// ─── Hash / URL parsing ───────────────────────────────────────────────────────

export function computeMatchInputHash(
  identity: RecordIdentityValues,
  item: { title?: string | null; upc?: string | null; ean?: string | null }
): string {
  const payload = JSON.stringify({
    v: MATCHER_VERSION,
    a: identity.artist, t: identity.releaseTitle, l: identity.label, c: identity.catalogNumber,
    y: identity.year, f: identity.format, s: identity.script,
    title: item.title ?? null, upc: item.upc ?? null, ean: item.ean ?? null,
  });
  return crypto.createHash('sha1').update(payload).digest('hex');
}

export type ParsedReleaseUrl = { releaseId: number } | { error: 'master_url' | 'invalid_url' };

/**
 * Strictly parse a pasted Discogs release URL into a numeric release id. Only discogs.com hosts,
 * only /release/<digits> paths (optionally locale- or slug-prefixed). Master URLs are rejected
 * with 'master_url'. The URL itself is never fetched.
 */
export function parseDiscogsReleaseUrl(input: unknown): ParsedReleaseUrl {
  if (typeof input !== 'string') return { error: 'invalid_url' };
  const s = input.trim();
  if (!s || s.length > 500) return { error: 'invalid_url' };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return { error: 'invalid_url' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'invalid_url' };
  if (u.username || u.password || u.port) return { error: 'invalid_url' };
  const host = u.hostname.toLowerCase();
  if (host !== 'discogs.com' && host !== 'www.discogs.com') return { error: 'invalid_url' };
  const path = u.pathname;
  if (/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:[^/]+\/)?master\/\d+/i.test(path)) return { error: 'master_url' };
  const m = path.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:[^/]+\/)?release\/(\d{1,10})(?:-[^/]*)?\/?$/i);
  if (!m) return { error: 'invalid_url' };
  const id = Number(m[1]);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) return { error: 'invalid_url' };
  return { releaseId: id };
}
