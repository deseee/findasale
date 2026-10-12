/**
 * eBay comp relevance filter (2026-10-11). Pure, deterministic, no I/O: exported for unit tests.
 *
 * The Browse API returns whatever eBay's search ranks, so a "Mouse Trap Board Game, Milton Bradley 2005" query
 * brings back 2016 Hasbro editions and parts lots, and a $5 item can come back with a $250 bulk lot. This module
 * cleans the comp list BEFORE it reaches the weighted median. It is applied only when the pricing request opts in
 * (PricingRequest.compRelevanceFilter, set by the shadow-mode Market estimate); the audio-format path never sets it,
 * so its behavior is unchanged.
 *
 * Three stages, in order:
 *   1. Token overlap. Item and comp titles are lowercased, split on non-alphanumerics, light-stemmed (trailing "s"),
 *      and stopwords + generic words (vintage, used, new, lot, ...) are removed. A comp must contain at least
 *      needed = (n <= 2 ? n : max(2, ceil(0.4 * n))) of the item's n distinctive tokens. 40% is deliberately loose:
 *      sellers drop brand and year words, but a comp sharing under 40% of the item's words is a different product.
 *   2. Exclusions. A comp is dropped when its title matches a parts / incomplete / replacement / manual-only
 *      pattern that the ITEM title does not itself match (an item titled "for parts" keeps parts comps). Also dropped:
 *      a comp that names a 4-digit year (1900-2099) when the item names a year and the comp does not name it
 *      (different edition / printing, e.g. 2005 vs 2016). Comps with no year are kept.
 *   3. Price outlier trim. Only when at least 3 comps survive stages 1-2: keep prices within
 *      [0.4 x median, 2.5 x median] of the surviving set (median of the sorted prices, mean of the middle two for an
 *      even count). With fewer than 3 there is no robust median, so nothing is trimmed.
 *
 * Dispersion (2026-10-11, second pass): the trim above keeps a band up to 6.25x wide, so a junk set can survive it
 * (saloon doors: $19-$1,144, median $450, kept 6, engine said $382 vs a true ~$130). `spreadRatio` is therefore measured
 * on the relevant set BEFORE the trim: p75/p25 (interquartile ratio, linear interpolation). Quartiles are used instead
 * of min/max or p90/p10 so a single bulk-lot outlier among otherwise tight comps (which the trim is meant to absorb)
 * does not condemn the set, while a genuinely mixed set (several cheap AND several expensive listings) does.
 * Callers reject the estimate when the ratio exceeds MAX_SPREAD_RATIO (3).
 *
 * Fewer than MIN_RELEVANT_COMPS (3) kept comps is flagged via `sparse` so callers can log it. The result is never
 * back-filled with the unfiltered set; callers' compsFound is the post-filter count.
 */

export const MIN_RELEVANT_COMPS = 3;
export const OUTLIER_LOW_RATIO = 0.4;
export const OUTLIER_HIGH_RATIO = 2.5;
export const TOKEN_OVERLAP_RATIO = 0.4;
/** Max allowed p75/p25 of the pre-trim relevant comp prices; above this the comp set is too mixed to price from. */
export const MAX_SPREAD_RATIO = 3;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'with', 'in', 'on', 'at', 'to', 'by', 'from', 'as', 'is', 'are',
  'w', 'x', 'set', 'pair', 'only', 'free', 'shipping', 'ship', 'fast', 'nice', 'great', 'good', 'rare',
]);

const GENERIC_WORDS = new Set([
  'vintage', 'antique', 'used', 'new', 'lot', 'lots', 'bundle', 'estate', 'sale', 'staff', 'pick', 'picks',
  'preowned', 'pre', 'owned', 'old', 'classic', 'unique', 'item', 'items', 'original', 'authentic', 'genuine',
  'collectible', 'collectable', 'nib', 'nwt', 'euc', 'guc', 'vgc',
]);

/** Parts / incomplete / replacement / manual-only listing patterns. Dropped unless the item title matches the same one. */
export const EXCLUSION_PATTERNS: RegExp[] = [
  /\bfor parts\b/i,
  /\bparts only\b/i,
  /\bparts (or|and|&) (repair|not working)\b/i,
  /\bnot working\b/i,
  /\bbroken\b/i,
  /\bincomplete\b/i,
  /\bmissing\b/i,
  /\breplacement\b/i,
  /\bspare\b/i,
  /\b(manual|instructions?|booklet|rulebook|rules) only\b/i,
  /\b(box|case|cover|lid|insert|tray) only\b/i,
  /\bempty (box|case)\b/i,
];

export interface RelevanceComp {
  title: string;
  price: number;
}

export interface RelevanceStats {
  input: number;
  afterOverlap: number;
  afterExclusions: number;
  kept: number;
  /** True when fewer than MIN_RELEVANT_COMPS comps survived. */
  sparse: boolean;
  /** p75/p25 of the relevant prices before the outlier trim; null when fewer than 3 relevant comps. */
  spreadRatio: number | null;
}

export interface RelevanceResult<T extends RelevanceComp> {
  kept: T[];
  stats: RelevanceStats;
}

/** Lowercase, split on non-alphanumerics, light stem, drop stopwords/generic words/single letters. De-duplicated. */
export function tokenizeTitle(title: string | null | undefined): string[] {
  if (typeof title !== 'string') return [];
  const out = new Set<string>();
  for (const raw of title.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw) continue;
    const t = raw.length > 3 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw;
    if (t.length < 2 && !/^\d$/.test(t)) continue;
    if (STOPWORDS.has(t) || GENERIC_WORDS.has(t) || STOPWORDS.has(raw) || GENERIC_WORDS.has(raw)) continue;
    out.add(t);
  }
  return [...out];
}

/** 4-digit years 1900-2099 named in a title. */
export function extractYears(title: string | null | undefined): string[] {
  if (typeof title !== 'string') return [];
  return title.match(/\b(?:19|20)\d{2}\b/g) ?? [];
}

/** Minimum number of the item's distinctive tokens a comp must contain. */
export function requiredOverlap(itemTokenCount: number): number {
  if (itemTokenCount <= 2) return itemTokenCount;
  return Math.max(2, Math.ceil(TOKEN_OVERLAP_RATIO * itemTokenCount));
}

/** True when the comp title shares enough distinctive tokens with the item. An item with no distinctive tokens accepts nothing. */
export function passesTokenOverlap(itemTitle: string, compTitle: string): boolean {
  const itemTokens = tokenizeTitle(itemTitle);
  if (itemTokens.length === 0) return false;
  const compTokens = new Set(tokenizeTitle(compTitle));
  let hits = 0;
  for (const t of itemTokens) if (compTokens.has(t)) hits++;
  return hits >= requiredOverlap(itemTokens.length);
}

/** True when the comp is a parts/incomplete/replacement/manual-only/other-edition listing the item title does not itself describe. */
export function isExcludedComp(itemTitle: string, compTitle: string): boolean {
  const item = typeof itemTitle === 'string' ? itemTitle : '';
  const comp = typeof compTitle === 'string' ? compTitle : '';
  for (const re of EXCLUSION_PATTERNS) {
    if (re.test(comp) && !re.test(item)) return true;
  }
  const itemYears = extractYears(item);
  const compYears = extractYears(comp);
  if (itemYears.length > 0 && compYears.length > 0 && !compYears.some(y => itemYears.includes(y))) return true;
  return false;
}

/** Median of numbers (mean of the middle two when even). NaN for an empty list. */
export function medianOf(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Linear-interpolated percentile (p in [0,1]) of numbers. NaN for an empty list. */
export function percentileOf(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(Math.max(p, 0), 1) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/** Interquartile price ratio p75/p25. Null with fewer than MIN_RELEVANT_COMPS positive finite prices. */
export function priceSpreadRatio(prices: number[]): number | null {
  const ok = (Array.isArray(prices) ? prices : []).filter(p => typeof p === 'number' && isFinite(p) && p > 0);
  if (ok.length < MIN_RELEVANT_COMPS) return null;
  const q1 = percentileOf(ok, 0.25);
  const q3 = percentileOf(ok, 0.75);
  if (!(q1 > 0) || !isFinite(q3)) return null;
  return q3 / q1;
}

/** True when a measured spread ratio is above MAX_SPREAD_RATIO. A missing / non-finite ratio is not judged (false). */
export function isSpreadTooWide(ratio: number | null | undefined): boolean {
  return typeof ratio === 'number' && isFinite(ratio) && ratio > MAX_SPREAD_RATIO;
}

/**
 * Stable eBay query for a RE-ANALYZED item (title drift guard). The model rewrites the title on every run and can
 * invent details ("Set of 2"). When the item already had a title, the query keeps only the distinctive tokens of the
 * NEW title that also appear in the PRIOR title, in the new title's order. Fewer than 2 common tokens means the
 * identification genuinely changed, so the new title is used as is. No prior title, or nothing to drop: new title as is.
 */
export function stableShadowQuery(newTitle: string, priorTitle?: string | null): string {
  const fresh = typeof newTitle === 'string' ? newTitle : '';
  if (typeof priorTitle !== 'string' || priorTitle.trim() === '') return fresh;
  const prior = new Set(tokenizeTitle(priorTitle));
  const freshTokens = tokenizeTitle(fresh);
  const common = freshTokens.filter(t => prior.has(t));
  if (common.length < 2 || common.length === freshTokens.length) return fresh;
  return common.join(' ');
}

/** Keep prices within [0.4 x median, 2.5 x median]. Fewer than 3 comps: returned untouched (no robust median). */
export function trimPriceOutliers<T extends { price: number }>(comps: T[]): T[] {
  if (comps.length < MIN_RELEVANT_COMPS) return comps;
  const med = medianOf(comps.map(c => c.price));
  if (!isFinite(med) || med <= 0) return comps;
  const lo = med * OUTLIER_LOW_RATIO;
  const hi = med * OUTLIER_HIGH_RATIO;
  return comps.filter(c => c.price >= lo && c.price <= hi);
}

/** Full filter: relevance, exclusions, then price outlier trim. Comps with a non-positive / non-finite price are dropped. */
export function filterRelevantComps<T extends RelevanceComp>(itemTitle: string, comps: T[]): RelevanceResult<T> {
  const list = Array.isArray(comps) ? comps : [];
  const priced = list.filter(c => c && typeof c.price === 'number' && isFinite(c.price) && c.price > 0);
  const overlapped = priced.filter(c => passesTokenOverlap(itemTitle, c.title));
  const clean = overlapped.filter(c => !isExcludedComp(itemTitle, c.title));
  const kept = trimPriceOutliers(clean);
  return {
    kept,
    stats: {
      input: list.length,
      afterOverlap: overlapped.length,
      afterExclusions: clean.length,
      kept: kept.length,
      sparse: kept.length < MIN_RELEVANT_COMPS,
      spreadRatio: priceSpreadRatio(clean.map(c => c.price)),
    },
  };
}
