/**
 * intakeVerifyPass.ts -- second Haiku "verify" pass for item intake (2026-11-05).
 *
 * After pass 1 (cloudAIService getHaikuAnalysis / getHaikuAnalysisMultiImage) has produced title, description,
 * brand, condition, category, tags and weight, this makes ONE more call to the SAME model (ANTHROPIC_MODEL,
 * Haiku by default; never a stronger model) with the same, already-loaded photos plus the pass-1 JSON, and asks
 * it to check each field against the photos and the printed text. It returns a list of corrections.
 *
 *   - High-confidence corrections (>= AI_VERIFY_APPLY_THRESHOLD, default 0.85) are applied to the pass-1 result,
 *     but never to a field the organizer has edited (userEditedFields: organizer intent wins).
 *   - Everything else becomes a review note for the organizer.
 *
 * Cost controls (same gates as pass 1): AI cost ceiling, absolute daily call cap, real usage recorded through
 * recordAnthropicUsageOrEstimate + trackAICall. Images are capped (AI_VERIFY_MAX_IMAGES, default 4, best photos
 * first). Kill switch: AI_VERIFY_PASS_ENABLED=false. Never throws: any failure returns status 'failed' and the
 * pipeline continues with the pass-1 result unchanged.
 */
import axios from 'axios';
import { EBAY_L1_CATEGORIES } from '../config/ebayCategories';
import {
  estimateTokensForRequest,
  isAICostCeilingExceeded,
  isAIDailyCallCapAvailable,
  recordAnthropicUsageOrEstimate,
  trackAICall,
} from '../lib/aiCostTracker';
import { getCategoryFamilySpec, type CategoryFamily } from './intakeCategoryFamilies';
import { isShoutedWord, normalizeTitleCaps } from './titleCaps';
import type { AppliedIntakeCorrection, IntakeReviewNote, PrintedTextTranscription, VerifyPassStatus, VerifyPassUsage } from './intakeReviewTypes';

/** Pass-1 fields the verify pass may check and correct. */
export interface VerifiableResult {
  title: string;
  description: string;
  brand?: string;
  condition: string;
  category?: string;
  tags: string[];
  estimatedWeightOz?: number;
  detectedPrintedText?: string;
  printedText?: PrintedTextTranscription | null;
  mpn?: string;
}

export interface VerifyCorrection {
  field: string;
  old?: unknown;
  new: unknown;
  reason: string;
  confidence: number;
}

export interface VerifyPassOutput {
  status: VerifyPassStatus;
  corrections: VerifyCorrection[];
  /** Required-shot ids (from the family table) the model says are missing or unreadable. */
  missingShots: string[];
  /** Model says at least one photo is too blurry/dark to read fine detail. */
  photosUnclear: boolean;
  /** Why the pass did not run (status other than 'ran'): disabled, no api key, cost ceiling, daily cap, no images, error: ... */
  skipReason?: string;
  /** Token usage reported by the API when the pass ran. */
  usage?: VerifyPassUsage | null;
}

export function isVerifyPassEnabled(): boolean {
  return String(process.env.AI_VERIFY_PASS_ENABLED ?? '').trim().toLowerCase() !== 'false';
}

export function verifyApplyThreshold(): number {
  const n = parseFloat(process.env.AI_VERIFY_APPLY_THRESHOLD || '');
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.85;
}

export function verifyMaxImages(): number {
  const n = parseInt(process.env.AI_VERIFY_MAX_IMAGES || '', 10);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : 4;
}

const CONDITIONS = ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR'];

const FIELD_ALIASES: Record<string, string> = {
  title: 'title',
  description: 'description',
  brand: 'brand',
  condition: 'condition',
  category: 'category',
  tags: 'tags',
  estimatedweightoz: 'estimatedWeightOz',
  weight: 'estimatedWeightOz',
  weightoz: 'estimatedWeightOz',
  packageweightoz: 'estimatedWeightOz',
};

/** Field on the item that the organizer-edit gate checks for each correctable field. */
const USER_EDIT_KEY: Record<string, string> = {
  title: 'title',
  description: 'description',
  brand: 'brand',
  condition: 'condition',
  category: 'category',
  tags: 'tags',
  estimatedWeightOz: 'packageWeightOz',
};

const FIELD_LABEL: Record<string, string> = {
  title: 'title',
  description: 'description',
  brand: 'brand',
  condition: 'condition',
  category: 'category',
  tags: 'tags',
  estimatedWeightOz: 'shipping weight',
};

function parseConfidence(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.min(1, v > 1 ? v / 100 : v));
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'high') return 0.9;
  if (s === 'medium') return 0.6;
  if (s === 'low') return 0.3;
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n > 1 ? n / 100 : n)) : 0;
}

/** Validates/normalizes the model's raw corrections array. Bad entries are dropped. Exported for tests. */
export function normalizeCorrections(raw: unknown): VerifyCorrection[] {
  if (!Array.isArray(raw)) return [];
  const out: VerifyCorrection[] = [];
  for (const entry of raw.slice(0, 20)) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const field = FIELD_ALIASES[String(e.field ?? '').replace(/[^a-z]/gi, '').toLowerCase()];
    if (!field) continue;
    const next = e.new ?? e.newValue ?? e.suggested;
    if (next === undefined) continue;
    out.push({
      field,
      old: e.old ?? e.oldValue ?? e.current,
      new: next,
      reason: String(e.reason ?? '').slice(0, 300),
      confidence: parseConfidence(e.confidence),
    });
  }
  return out;
}

function normText(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Value validation per field. Returns the cleaned value, or undefined when the value is not usable. */
function cleanValue(field: string, value: unknown): unknown {
  switch (field) {
    case 'title': {
      const s = typeof value === 'string' ? value.trim() : '';
      return s.length >= 3 && s.length <= 200 ? s : undefined;
    }
    case 'description': {
      const s = typeof value === 'string' ? value.trim() : '';
      return s.length >= 10 && s.length <= 2000 ? s : undefined;
    }
    case 'brand': {
      if (value === null) return null;
      const s = typeof value === 'string' ? value.trim() : '';
      if (!s || /^(none|null|n\/a|unknown)$/i.test(s)) return null;
      return s.length <= 80 ? s : undefined;
    }
    case 'condition': {
      const s = String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
      return CONDITIONS.includes(s) ? s : undefined;
    }
    case 'category': {
      const s = String(value ?? '').trim().toLowerCase();
      return EBAY_L1_CATEGORIES.find((c) => c.toLowerCase() === s);
    }
    case 'tags': {
      const arr = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
      const tags = arr.map((t) => String(t ?? '').trim()).filter((t) => t.length > 0 && t.length <= 60).slice(0, 12);
      return tags.length > 0 ? tags : undefined;
    }
    case 'estimatedWeightOz': {
      const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
      return Number.isFinite(n) && n >= 0.5 && n <= 2400 ? Math.round(n * 10) / 10 : undefined;
    }
    default:
      return undefined;
  }
}

function display(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.join(', ').slice(0, 300);
  return String(v).slice(0, 300);
}

export interface ApplyVerifyOptions {
  userEditedFields?: readonly string[] | null;
  threshold?: number;
  /** Vision OCR text for the item; with the pass-1 printedText it is the evidence a name-spelling change needs. */
  ocrText?: string | null;
}

// ---------------------------------------------------------------------------------------------------------------
// Safety guards (2026-11-08). Live incident: the verify pass returned {field:"description", new:"<short fragment>"}
// ("Card back is visible in photo 2.") and the fragment replaced the whole description; it also "corrected" a right
// title spelling ("Paul O'Neill") to a hallucinated one in ALL CAPS ("Paulo O'NEILL"). These guards run on every
// high-confidence correction before it is applied (intake and the inventory recheck both go through here). A
// correction that fails a guard is never applied; it becomes a review note instead.
// ---------------------------------------------------------------------------------------------------------------

/** A current description shorter than this may be replaced outright (nothing worth keeping to lose). */
export const DESC_VERY_SHORT = 40;
/** Max length of a fragment that may be appended as a sentence. */
export const DESC_APPEND_MAX = 220;

/** Distinct lowercase words longer than 3 characters (a trailing plural "s" is dropped so Card/Cards match). */
export function significantTokens(text: unknown): Set<string> {
  const out = new Set<string>();
  for (const raw of String(text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length <= 3) continue;
    out.add(raw.length > 4 && raw.endsWith('s') ? raw.slice(0, -1) : raw);
  }
  return out;
}

/** Share of `base`'s significant tokens that are still present in `next` (1 when base has none). */
export function tokenRetention(base: unknown, next: unknown): number {
  const a = significantTokens(base);
  if (a.size === 0) return 1;
  const b = significantTokens(next);
  let kept = 0;
  for (const t of a) if (b.has(t)) kept += 1;
  return kept / a.size;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const PHOTO_REF = /\b(photos?|pictures?|pictured|images?|shown|visible|scans?)\b/i;
const GRADING_REF = /\b(raw|ungraded|graded|grade|psa|bgs|sgc|cgc|slab|slabbed|encapsulated)\b/i;
const CONDITION_REF = /\b(mint|excellent|good|fair|poor|wear|worn|damaged?|creases?|creased|scratch(es|ed)?|chip(s|ped)?|stains?|stained|tears?|torn|sealed|unused|dings?|corners?|centering|condition)\b/i;

export type DescriptionGuard =
  | { action: 'replace'; value: string }
  | { action: 'append'; value: string }
  | { action: 'note'; why: string };

/**
 * Decides what to do with a high-confidence description correction. Exported for tests.
 *   - replace: the current description is empty/very short, or `next` is a plausible FULL rewrite (at least 70% of the
 *     current length, at least 60 chars when the current is 60+, and it keeps at least 60% of the current description's
 *     distinct words longer than 3 characters).
 *   - append (safe addition): `next` is a short new sentence (<= 220 chars) that adds a fact (e.g. "The card is raw.")
 *     without overlapping the existing text, does not talk about the photos, and cannot contradict what is already
 *     there: it is not appended when both mention grading, both mention condition, or it carries a year the
 *     description does not have. It is added as a sentence at the end; nothing existing is removed.
 *   - note: anything else (a partial rewrite or fragment). No change; the organizer sees the suggestion.
 */
export function guardDescriptionCorrection(current: unknown, next: string): DescriptionGuard {
  const cur = String(current ?? '').trim();
  const nxt = next.trim();
  if (cur.length < DESC_VERY_SHORT) return { action: 'replace', value: nxt };
  const lengthOk = nxt.length >= cur.length * 0.7 && (cur.length < 60 || nxt.length >= 60);
  const retention = tokenRetention(cur, nxt);
  if (lengthOk && retention >= 0.6) return { action: 'replace', value: nxt };
  // Not a full rewrite. Consider appending it as a new sentence.
  if (nxt.length > DESC_APPEND_MAX) return { action: 'note', why: 'it would drop most of the current description' };
  if (PHOTO_REF.test(nxt)) return { action: 'note', why: 'it describes the photos, not the item' };
  if (cur.toLowerCase().includes(nxt.toLowerCase().replace(/[.!?]+$/, ''))) return { action: 'note', why: 'the description already says this' };
  const overlap = tokenRetention(nxt, cur); // share of the fragment's words the description already has
  if (overlap > 0.5) return { action: 'note', why: 'it is a partial rewrite that would drop the rest of the description' };
  if (GRADING_REF.test(nxt) && GRADING_REF.test(cur)) return { action: 'note', why: 'the description already covers grading' };
  if (CONDITION_REF.test(nxt) && CONDITION_REF.test(cur)) return { action: 'note', why: 'the description already covers condition' };
  const years = nxt.match(/\b(1[89]\d\d|20\d\d)\b/g) || [];
  if (years.some((y) => !cur.includes(y))) return { action: 'note', why: 'it adds a year the description does not have' };
  const joined = `${cur.replace(/\s+$/, '')}${/[.!?]$/.test(cur) ? '' : '.'} ${nxt}${/[.!?]$/.test(nxt) ? '' : '.'}`;
  if (joined.length > 2000) return { action: 'note', why: 'the description would be too long' };
  return { action: 'append', value: joined };
}

function wordsOf(text: string): string[] {
  return text.split(/\s+/).map((w) => w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')).filter(Boolean);
}

/** Evidence text for spelling: OCR plus everything pass 1 transcribed from the item. */
export function spellingEvidence(result: VerifiableResult, ocrText?: string | null): string {
  const pt = result.printedText;
  const parts: unknown[] = [ocrText, result.detectedPrintedText];
  if (pt && typeof pt === 'object') {
    parts.push(pt.brand, ...(pt.modelNumbers || []), ...(pt.catalogNumbers || []), ...(pt.credits || []), ...(pt.counts || []), ...(pt.other || []));
  }
  return parts.filter((p) => typeof p === 'string' && p.trim()).join(' \n ').toLowerCase();
}

/**
 * Word-level spelling changes between `from` and `to`: a new word (4+ letters) that replaces a removed word sharing its
 * first two letters within 2 edits ("Paul" -> "Paulo", "Jefferies" -> "Jeffries"). Exported for tests.
 */
export function spellingChanges(from: string, to: string): Array<{ from: string; to: string }> {
  const fromWords = wordsOf(from);
  const toWords = wordsOf(to);
  const fromLower = new Set(fromWords.map((w) => w.toLowerCase()));
  const toLower = new Set(toWords.map((w) => w.toLowerCase()));
  const removed = fromWords.filter((w) => !toLower.has(w.toLowerCase()) && !/\d/.test(w));
  const out: Array<{ from: string; to: string }> = [];
  for (const w of toWords) {
    const lw = w.toLowerCase();
    if (fromLower.has(lw) || /\d/.test(w) || lw.replace(/[^a-z]/g, '').length < 4) continue;
    const match = removed.find((r) => {
      const lr = r.toLowerCase();
      if (lr + 's' === lw || lw + 's' === lr || lr + 'es' === lw || lw + 'es' === lr) return false; // plural, not spelling
      return lr.slice(0, 2) === lw.slice(0, 2) && levenshtein(lr, lw) <= 2;
    });
    if (match) out.push({ from: match, to: w });
  }
  return out;
}

/**
 * Title guard. Returns null when the title correction is safe to apply, or the reason it is not. Exported for tests.
 *   (a) it drops more than 40% of the current title's significant words;
 *   (b) it introduces an ALL-CAPS word (3+ letters) the current title did not have in caps (codes with digits and
 *       known acronyms are fine);
 *   (c) it changes the spelling of a word (a name) and the OCR / printed text does not contain the new spelling.
 */
export function guardTitleCorrection(current: unknown, next: string, evidence: string): string | null {
  const cur = String(current ?? '');
  if (cur.trim()) {
    if (tokenRetention(cur, next) < 0.6) return 'it would drop too much of the current title';
    const curCaps = new Set(cur.split(/\s+/).filter((w) => isShoutedWord(w)).map((w) => w.replace(/[^A-Za-z]/g, '')));
    const newCaps = next.split(/\s+/).filter((w) => isShoutedWord(w) && !curCaps.has(w.replace(/[^A-Za-z]/g, '')));
    if (newCaps.length > 0) return `it puts "${newCaps[0]}" in capitals`;
    const unsupported = spellingChanges(cur, next).find((c) => !evidence || !evidence.includes(c.to.toLowerCase()));
    if (unsupported) return `the text read from the photos does not show the spelling "${unsupported.to}"`;
  }
  return null;
}

/** Brand guard: a spelling change to the brand needs OCR / printed-text support. */
export function guardBrandCorrection(current: unknown, next: unknown, evidence: string): string | null {
  if (typeof current !== 'string' || !current.trim() || typeof next !== 'string' || !next.trim()) return null;
  const a = current.trim().toLowerCase();
  const b = next.trim().toLowerCase();
  if (a === b) return null;
  if (levenshtein(a, b) <= 2 && (!evidence || !evidence.includes(b))) return `the text read from the photos does not show the spelling "${next.trim()}"`;
  return null;
}

/**
 * Pure merge: applies high-confidence corrections to `result` in place, skipping organizer-edited fields, and
 * returns what was applied plus review notes for everything that was not. Never throws.
 */
export function applyVerifyCorrections<T extends VerifiableResult>(
  result: T,
  corrections: VerifyCorrection[],
  opts: ApplyVerifyOptions = {}
): { applied: AppliedIntakeCorrection[]; notes: IntakeReviewNote[] } {
  const applied: AppliedIntakeCorrection[] = [];
  const notes: IntakeReviewNote[] = [];
  const threshold = opts.threshold ?? verifyApplyThreshold();
  const edited = new Set((opts.userEditedFields || []).map((f) => String(f)));
  const touched = new Set<string>();
  let evidenceCache: string | null = null;
  const evidence = (): string => (evidenceCache ??= spellingEvidence(result, opts.ocrText));
  try {
    for (const c of corrections) {
      try {
        const field = c.field;
        if (edited.has(USER_EDIT_KEY[field] ?? field) || edited.has(field)) continue; // organizer intent wins: not even a note
        if (touched.has(field)) continue; // one correction per field per pass
        const current = (result as unknown as Record<string, unknown>)[field];
        const cleaned = cleanValue(field, c.new);
        if (cleaned === undefined) continue;
        // Nothing to change.
        if (normText(display(current)) === normText(display(cleaned))) continue;
        // Weight: only adjust an estimate that exists (pass 1 gated it on its own package confidence).
        if (field === 'estimatedWeightOz' && (current == null || !Number.isFinite(Number(current)))) continue;
        // Stale "old" value (the model quoted something that is not in the field): treat as advisory only.
        const oldText = normText(display(c.old));
        const staleOld = typeof c.old === 'string' && oldText.length > 0 && !normText(display(current)).includes(oldText);
        const label = FIELD_LABEL[field] || field;
        const reason = c.reason ? c.reason.replace(/\u2014/g, ',') : '';
        // Safety guards: decide the value to write, or why it must stay a note.
        let finalValue: unknown = cleaned;
        let blockedWhy: string | null = null;
        let appendedDesc = false;
        if (c.confidence >= threshold && !staleOld) {
          if (field === 'description' && typeof cleaned === 'string') {
            const g = guardDescriptionCorrection(current, cleaned);
            if (g.action === 'note') blockedWhy = g.why;
            else {
              finalValue = g.value;
              appendedDesc = g.action === 'append';
            }
          } else if (field === 'title' && typeof cleaned === 'string') {
            blockedWhy = guardTitleCorrection(current, cleaned, evidence());
            if (!blockedWhy) finalValue = normalizeTitleCaps(cleaned, [typeof result.brand === 'string' ? result.brand : null]);
          } else if (field === 'brand') {
            blockedWhy = guardBrandCorrection(current, cleaned, evidence());
          }
          if (!blockedWhy && normText(display(current)) === normText(display(finalValue))) continue;
        }
        if (c.confidence >= threshold && !staleOld && !blockedWhy) {
          (result as unknown as Record<string, unknown>)[field] = field === 'brand' && finalValue === null ? undefined : finalValue;
          touched.add(field);
          applied.push({ field, from: current ?? null, to: finalValue, reason: appendedDesc ? `${reason}${reason ? ' ' : ''}(added to the description)` : reason, confidence: c.confidence, source: 'verify' });
          notes.push({
            code: 'VERIFY_APPLIED',
            severity: 'info',
            source: 'verify',
            field,
            message: appendedDesc
              ? `Added a sentence to the description${reason ? `: ${reason}` : '.'}`
              : `Updated the ${label} to match the photos${reason ? `: ${reason}` : '.'}`,
            current: display(current),
            suggested: display(finalValue),
            confidence: c.confidence,
          });
        } else {
          touched.add(field);
          if (blockedWhy) console.warn(`[intakeVerify] ${field} correction not applied (${blockedWhy})`);
          notes.push({
            code: 'VERIFY_SUGGESTION',
            severity: c.confidence >= 0.5 ? 'medium' : 'low',
            source: 'verify',
            field,
            message: `Check the ${label}${reason ? `: ${reason}` : '.'}${blockedWhy ? ` (Not changed automatically: ${blockedWhy}.)` : ''}`,
            current: display(current),
            suggested: display(cleaned),
            confidence: c.confidence,
          });
        }
      } catch {
        // one bad correction never stops the others
      }
    }
  } catch {
    // never throws
  }
  return { applied, notes };
}

export interface RunVerifyPassArgs {
  imageBase64Array: string[];
  mimeTypes: string[];
  pass1: VerifiableResult;
  /** Vision OCR text for the item (tokens or full block). */
  ocrText?: string | null;
  family: CategoryFamily | null;
  /** Re-analyze / recheck: the listing as it was before this run (may carry a lot count or set name pass 1 dropped). */
  priorTitle?: string | null;
  priorDescription?: string | null;
  /** Total photos the item has (the call may send fewer, capped by AI_VERIFY_MAX_IMAGES). */
  totalPhotoCount?: number;
}

/** Builds the verify prompt. Exported for tests. */
export function buildVerifyPrompt(args: Omit<RunVerifyPassArgs, 'imageBase64Array' | 'mimeTypes'>, imageCount: number): string {
  const p = args.pass1;
  const pass1Json = JSON.stringify({
    title: p.title,
    description: String(p.description ?? '').slice(0, 1200),
    brand: p.brand ?? null,
    condition: p.condition,
    category: p.category ?? null,
    tags: p.tags ?? [],
    estimatedWeightOz: p.estimatedWeightOz ?? null,
    printedText: p.printedText ?? null,
    detectedPrintedText: p.detectedPrintedText ?? null,
    mpn: p.mpn ?? null,
  });
  const spec = getCategoryFamilySpec(args.family);
  const shots = spec && spec.requiredShots.length > 0
    ? `\nThis looks like a ${spec.label.toLowerCase()}. Required photos: ${spec.requiredShots.map((s) => `"${s.id}" = ${s.label}`).join('; ')}. List in "missingShots" the ids of any required photo that is not among these ${imageCount} photo(s), or is too blurry or dark to read.`
    : '\nSet "missingShots" to [].';
  const facts = spec ? `\nFor this kind of item the description must state: ${spec.requiredFacts.map((f) => f.promptHint).join('; ')}. If one of these is wrong in the description, correct the description; if it cannot be read from the photos, the description should say so.` : '';
  const ocr = args.ocrText ? `\nText read from the photos by OCR (verbatim, use as spelling evidence): ${String(args.ocrText).slice(0, 1200)}` : '';
  const total = Math.max(imageCount, args.totalPhotoCount ?? imageCount);
  const photos = total > 1
    ? `\nPhotos: you are given ${imageCount} photo(s)${total > imageCount ? ` of the ${total} the item has` : ''}, in order (photo 1 to photo ${imageCount}). A second photo is very often the back of the same card or label, or a second item of a lot. Look at every photo before deciding a view is missing. The description must never say a view (for example the back of a card) is "not photographed", "not provided" or "not shown" when one of the photos shows it; if it does, correct the description.`
    : '\nPhotos: you are given 1 photo.';
  const priorText = [args.priorTitle, args.priorDescription].filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
  const prior = priorText.length > 0
    ? `\nEarlier listing for this same item (written or checked before): title "${String(args.priorTitle ?? '').slice(0, 200)}"${args.priorDescription ? `, description "${String(args.priorDescription).slice(0, 400)}"` : ''}. If it states a lot or count ("Lot", "lot of two", "set of 3", "x2"), the draft must keep that count unless the photos clearly show a different number. If it names a set or subset that the photos support, the draft must keep it.`
    : '';
  return `You are checking a draft listing for an item at a secondary sale (yard sales, auctions, flea markets, consignment). Compare every field of the draft with what is actually visible in the ${imageCount} photo(s) and the printed text, and report fields that are wrong.${ocr}

Draft (JSON): ${pass1Json}
${photos}${prior}${facts}${shots}

A correction replaces the WHOLE field. For "description", "new" must be the COMPLETE corrected description: keep every existing fact (player, year, set, card number, condition, and so on) and change only the part that is wrong or missing. Never return a fragment or a single added sentence as "new" for the description. Never mention the photos ("photo 2", "shown", "visible") in a description. For "title", "new" must be the complete corrected title in Title Case (never ALL CAPS names), keeping every correct word.

Check, field by field:
- Printed text: brand, model numbers, catalog numbers, credits/names and titles must be spelled EXACTLY as printed on the item. Never "correct" a printed spelling to a more familiar word and never invent text. Only change the spelling of a name when the OCR text above shows the new spelling; otherwise leave it.
- Counts: the number of pieces in the title and description must match the number of pieces you can see. If packaging prints a different number than what is present, the description must say so. A lot stays a lot: never turn a lot of several items into a single item.
- Years: every year in the title, the description and the tags must be the same year, read from the item itself (the card front or back, the copyright line, the label). If the title and the description disagree, correct the one that does not match what is printed.
- Set names: for trading cards the set name AND any subset or insert name printed on the card (for example "EX2000", "Xpress", "Pro Motion", "Highlights") belong in the title. Never drop one that is printed or that the draft or earlier listing already had.
- Duplicate words: the title must not repeat a word ("Card Card").
- Condition: NEW only when there is evidence it is sealed or unused (factory seal, tags attached). Torn or opened packaging, wear, or "used" wording means USED. The description must not contradict the condition.
- Facts: US coins are silver only by date and mint (dimes, quarters and halves dated 1964 or earlier are 90% silver; 1965-1970 halves are 40% silver; Eisenhower dollars are copper-nickel clad unless S mint silver issues; cents are never silver). A reproduction or replica is never "Antiques". Tags must describe the item itself, never a related device it is used with.
- Weight: estimatedWeightOz is the packed shipping weight in ounces; correct it only if it is clearly implausible for what is shown.
- Category: must be one of: ${EBAY_L1_CATEGORIES.join(', ')}.

Only report a correction when the photos or printed text clearly show the draft is wrong. Confidence 0.0-1.0: use 0.9 or higher only when the photo leaves no doubt. Respond with ONLY valid JSON (no markdown):
{"corrections":[{"field":"title|description|brand|condition|category|tags|estimatedWeightOz","old":"current value","new":"corrected value","reason":"short reason","confidence":0.9}],"missingShots":[],"photosUnclear":false}
If everything is right, return {"corrections":[],"missingShots":[],"photosUnclear":false}.`;
}

/**
 * Runs the verify pass. Never throws. Returns status 'disabled' / 'gated' without any network call when the
 * kill switch is off, the API key is missing, the monthly AI cost ceiling is reached or the daily call cap is used up.
 */
export async function runVerifyPass(args: RunVerifyPassArgs): Promise<VerifyPassOutput> {
  const empty = (status: VerifyPassStatus, skipReason: string): VerifyPassOutput => ({ status, corrections: [], missingShots: [], photosUnclear: false, skipReason, usage: null });
  try {
    if (!isVerifyPassEnabled()) return empty('disabled', 'disabled');
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return empty('disabled', 'no api key');
    if (!Array.isArray(args.imageBase64Array) || args.imageBase64Array.length === 0) return empty('not-run', 'no images');
    if (await isAICostCeilingExceeded()) {
      console.warn('[intakeVerify] AI cost ceiling exceeded, skipping verify pass');
      return empty('gated', 'cost ceiling');
    }
    if (!(await isAIDailyCallCapAvailable())) {
      console.warn('[intakeVerify] AI daily call cap reached (AI_DAILY_CALL_CAP), skipping verify pass');
      return empty('gated', 'daily cap');
    }

    const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
    const cap = verifyMaxImages();
    const images = args.imageBase64Array.slice(0, cap);
    const prompt = buildVerifyPrompt({ ...args, totalPhotoCount: args.totalPhotoCount ?? args.imageBase64Array.length }, images.length);
    const content: unknown[] = images.map((data, idx) => ({
      type: 'image',
      source: { type: 'base64', media_type: args.mimeTypes[idx] || 'image/jpeg', data },
    }));
    content.push({ type: 'text', text: prompt });
    const estimatedTokens = estimateTokensForRequest(prompt, true) + Math.max(0, images.length - 1) * 1500;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model, max_tokens: 700, messages: [{ role: 'user', content }] },
      {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        timeout: 30000,
      }
    );

    const text: string = response?.data?.content?.[0]?.text ?? '';
    const rawUsage = response?.data?.usage;
    const usage: VerifyPassUsage | null =
      rawUsage && Number.isFinite(Number(rawUsage.input_tokens)) && Number.isFinite(Number(rawUsage.output_tokens))
        ? { inputTokens: Number(rawUsage.input_tokens), outputTokens: Number(rawUsage.output_tokens) }
        : null;
    try {
      await recordAnthropicUsageOrEstimate('anthropic:cloud_ai_verify_pass', model, response?.data?.usage, estimatedTokens + Math.ceil(text.length / 4) + 50);
      await trackAICall();
    } catch (trackErr) {
      console.warn('[intakeVerify] usage tracking failed (ignored):', trackErr instanceof Error ? trackErr.message : trackErr);
    }

    const raw = text.replace(/```json\n?|\n?```/g, '').trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw) as Record<string, unknown>;
    const spec = getCategoryFamilySpec(args.family);
    const validShots = new Set((spec?.requiredShots || []).map((s) => s.id));
    const missingShots = Array.isArray(parsed.missingShots)
      ? [...new Set(parsed.missingShots.map((s) => String(s)).filter((s) => validShots.has(s)))]
      : [];
    return {
      status: 'ran',
      corrections: normalizeCorrections(parsed.corrections),
      missingShots,
      photosUnclear: parsed.photosUnclear === true,
      usage,
    };
  } catch (err) {
    console.warn('[intakeVerify] verify pass failed (pipeline continues with pass-1 result):', err instanceof Error ? err.message : err);
    return empty('failed', `error: ${String(err instanceof Error ? err.message : err).slice(0, 120)}`);
  }
}
