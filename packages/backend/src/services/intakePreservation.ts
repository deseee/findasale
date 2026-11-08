/**
 * intakePreservation.ts -- keep what the earlier listing got right when an item is re-analyzed or rechecked (2026-11-05).
 *
 * Found in the 2026-11-05 baseball card re-analyze dry run:
 *   - "Jeff Cirillo Baseball Card Lot" (description "Lot of two 1997 Pinnacle cards") came back as a single card:
 *     re-analyze must never silently turn a lot into one item.
 *   - "Gregg Jefferies 1997 Skybox EX2000 ..." came back without "EX2000": set and subset names must survive.
 *
 * Pure string rules (no I/O, never throw). intakeReview applies the fixes to fields the organizer has not edited and
 * turns everything else into review notes.
 */
import { extractCounts } from './intakeConsistencyChecks';
import type { PrintedTextTranscription } from './intakeReviewTypes';

/** eBay's title limit. A fix that would push a title past it becomes a note instead. */
export const TITLE_MAX_LENGTH = 80;

export interface LotSignal {
  isLot: boolean;
  /** Unit count when the text states one ("lot of two" -> 2), else null. */
  count: number | null;
}

/** Lot / count signal in a piece of text: "Lot", "lot of two", "set of 3", "x2", "2x", "3 cards". Exported for tests. */
export function lotSignal(text: string | null | undefined): LotSignal {
  const t = String(text ?? '');
  if (!t.trim()) return { isLot: false, count: null };
  try {
    const counts = extractCounts(t);
    const multipliers: number[] = [];
    // "x2" / "x 2" / "2x" / "2 x" as a standalone token, never a dimension ("8x10") or a model ("X100").
    const xAfter = /(?:^|[\s(,])[x×]\s?(\d{1,2})(?=$|[\s),.;:])/gi;
    const xBefore = /(?:^|[\s(,])(\d{1,2})\s?[x×](?=$|[\s),.;:])/gi;
    for (const re of [xAfter, xBefore]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(t)) !== null) {
        const n = parseInt(m[1], 10);
        if (n > 1 && n <= 100) multipliers.push(n);
      }
    }
    const all = [...counts, ...multipliers];
    const lotWord = /\b(lot|lots|bundle|pair of)\b/i.test(t);
    if (all.length === 0 && !lotWord) return { isLot: false, count: null };
    return { isLot: true, count: all.length > 0 ? Math.max(...all) : null };
  } catch {
    return { isLot: false, count: null };
  }
}

export interface LotPreservation {
  /** New title when it was fixed (count put back), else undefined. */
  title?: string;
  /** New description when it was fixed, else undefined. */
  description?: string;
  /** The prior count that was kept (or would have been). */
  priorCount: number | null;
  /** The prior listing was a lot and the new title or description no longer says so. */
  dropped: boolean;
  /** The new text states a different count than the prior listing. */
  countChanged: boolean;
  newCount: number | null;
}

/**
 * When the prior title/description stated a lot or count and the new one drops it, puts the count back
 * ("Lot of 2 ..." in front of the title, "Lot of 2." after the description). Fields listed in `locked`
 * (organizer-edited) are never changed. A title fix that would pass 80 characters is not made. Exported for tests.
 */
export function preserveLotCount(args: {
  priorTitle?: string | null;
  priorDescription?: string | null;
  title: string;
  description: string;
  locked?: { title?: boolean; description?: boolean };
}): LotPreservation {
  const prior = lotSignal(`${args.priorTitle ?? ''}\n${args.priorDescription ?? ''}`);
  const out: LotPreservation = { priorCount: prior.count, dropped: false, countChanged: false, newCount: null };
  if (!prior.isLot) return out;
  const nowTitle = lotSignal(args.title);
  const nowDesc = lotSignal(args.description);
  const now = lotSignal(`${args.title}\n${args.description}`);
  out.newCount = now.count;
  if (now.isLot && prior.count != null && now.count != null && now.count !== prior.count) {
    out.countChanged = true;
    return out;
  }
  if (nowTitle.isLot && nowDesc.isLot) return out;
  out.dropped = true;
  const phrase = prior.count != null ? `Lot of ${prior.count}` : 'Lot';
  if (!nowTitle.isLot && !args.locked?.title) {
    const next = `${phrase} ${args.title.trim()}`.replace(/\s{2,}/g, ' ');
    if (next.length <= TITLE_MAX_LENGTH) out.title = next;
  }
  if (!nowDesc.isLot && !args.locked?.description && prior.count != null) {
    const d = args.description.trim();
    out.description = d ? `${d}${/[.!?]$/.test(d) ? '' : '.'} ${phrase}.` : `${phrase}.`;
  }
  return out;
}

// ---- Set and subset names (trading cards) --------------------------------------------------------------------

/**
 * Card set / subset / insert names seen on secondary-sale inventory. Matched case-insensitively with spaces and
 * hyphens ignored, so "Pro Motion" also matches "ProMotion" and "E-X2000" matches "EX2000". Only consulted for
 * trading cards, and only to keep a name the earlier listing or the printed text already had.
 */
export const CARD_SET_TERMS: readonly string[] = [
  'EX2000', 'EX2001', 'E-X', 'Xpress', 'Pro Motion', 'Highlights', 'Gold Leaf', 'Leaf Limited', 'Leaf Gold', 'Gold Rookie',
  'Chrome', 'Refractor', 'Finest', 'Prizm', 'Optic', 'Mosaic', 'Select', 'Stadium Club', 'Heritage', 'Bowman', "Bowman's Best",
  'Ultra', 'Flair', 'Showcase', 'Metal', 'Zenith', 'Studio', "Collector's Choice", 'Diamond Kings', 'Rated Rookie', 'Elite',
  'Certified', 'Pinnacle Inside', 'Sportflics', 'Spectra', 'Black Gold', 'Gold Label', 'Crown Royale', 'Revolution',
  'Paramount', 'Pristine', 'Archives', 'Gallery', 'Gypsy Queen', 'Allen & Ginter', 'SP Authentic', 'Traded', 'Update',
  'Opening Day', 'Signature Series', 'Fleer Tradition', 'Circa', 'Tek', 'Platinum', 'Tiffany', 'Desert Shield',
  'Rookie Debut', 'Electric Diamond', 'Silver Signature', 'Gold Signature', 'Press Proof', 'Artist\'s Proof',
  'Masterpiece', 'Holo', 'Reverse Holo', '1st Edition', 'Shadowless', 'Unlimited',
];

const normSetText = (s: string): string => s.toLowerCase().replace(/[\s\-_.'’]+/g, '');

/** Alphanumeric set codes like "EX2000" or "T206": letters then 3-4 digits as one token. */
const SET_CODE_TOKEN = /\b([A-Za-z]{1,4}-?\d{3,4})\b/g;

function setTermsIn(text: string): string[] {
  const found: string[] = [];
  const norm = normSetText(text);
  for (const term of CARD_SET_TERMS) {
    const n = normSetText(term);
    if (!n) continue;
    // Word-ish boundary check on the raw text for short single words ("Tek", "Holo"), substring on the normalized form for the rest.
    if (n.length <= 5) {
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]*')}\\b`, 'i');
      if (re.test(text)) found.push(term);
    } else if (norm.includes(n)) {
      found.push(term);
    }
  }
  let m: RegExpExecArray | null;
  const re = new RegExp(SET_CODE_TOKEN.source, 'g');
  while ((m = re.exec(text)) !== null) {
    const token = m[1];
    if (/^(19|20)\d{2}$/.test(token)) continue;
    if (!found.some((f) => normSetText(f) === normSetText(token))) found.push(token);
  }
  // A longer term already covers a shorter one inside it ("Leaf Limited" covers "Limited"): keep the longest.
  return found.filter((f) => !found.some((g) => g !== f && normSetText(g).includes(normSetText(f)) && normSetText(g).length > normSetText(f).length));
}

export interface SetNamePreservation {
  /** New title when names were put back, else undefined. */
  title?: string;
  /** Set / subset names the prior listing or printed text had and the new title lacks. */
  dropped: string[];
  /** Names that were put back into the title. */
  restored: string[];
}

/** Inserts `term` after the brand (when the title contains it), else after the leading year, else at the end. */
function insertSetTerm(title: string, term: string, brand?: string | null): string {
  const t = title.trim();
  if (brand && brand.trim()) {
    const idx = t.toLowerCase().indexOf(brand.trim().toLowerCase());
    if (idx >= 0) {
      const end = idx + brand.trim().length;
      return `${t.slice(0, end)} ${term}${t.slice(end)}`.replace(/\s{2,}/g, ' ');
    }
  }
  const year = t.match(/^((?:19|20)\d{2})\b/);
  if (year) return `${year[1]} ${term}${t.slice(year[1].length)}`.replace(/\s{2,}/g, ' ');
  return `${t} ${term}`;
}

/**
 * Trading cards only: set / subset names that were in the prior title or the printed text but are missing from the new
 * title are put back (after the brand), unless the title is organizer-edited or the fix would pass 80 characters.
 * Exported for tests.
 */
export function preserveSetNames(args: {
  priorTitle?: string | null;
  printedText?: PrintedTextTranscription | null;
  detectedPrintedText?: string | null;
  cardSetName?: string | null;
  title: string;
  description?: string | null;
  brand?: string | null;
  locked?: boolean;
}): SetNamePreservation {
  const out: SetNamePreservation = { dropped: [], restored: [] };
  try {
    const sources = [
      args.priorTitle ?? '',
      args.detectedPrintedText ?? '',
      args.cardSetName ?? '',
      ...(args.printedText ? [args.printedText.brand ?? '', ...(args.printedText.other || []), ...(args.printedText.catalogNumbers || [])] : []),
    ].filter((s) => typeof s === 'string' && s.trim().length > 0);
    if (sources.length === 0) return out;
    const candidates = new Map<string, string>();
    for (const src of sources) {
      for (const term of setTermsIn(src)) {
        const key = normSetText(term);
        if (!candidates.has(key)) candidates.set(key, term);
      }
    }
    const titleNorm = normSetText(args.title);
    for (const [key, term] of candidates) {
      if (!titleNorm.includes(key)) out.dropped.push(term);
    }
    if (out.dropped.length === 0 || args.locked) return out;
    let next = args.title;
    for (const term of out.dropped) {
      const attempt = insertSetTerm(next, term, args.brand);
      if (attempt.length > TITLE_MAX_LENGTH) continue;
      next = attempt;
      out.restored.push(term);
    }
    if (out.restored.length > 0) out.title = next;
  } catch {
    return { dropped: [], restored: [] };
  }
  return out;
}
