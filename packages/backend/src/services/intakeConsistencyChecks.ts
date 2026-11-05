/**
 * intakeConsistencyChecks.ts -- deterministic, zero-cost consistency checks on a tagged item (2026-11-05).
 *
 * Runs after the Haiku passes. Each check is a pure string rule built from a real defect class found in the
 * 2026-11 audit of 316 live items:
 *   - lot/set counts that disagree ("Lot of 10" title, "set of 7" description, "10 Diskettes" on the box)
 *   - condition NEW while the description says used/opened/worn/torn
 *   - brand field empty while packaging shows one, or a near-miss spelling between brand and title
 *   - test / do-not-publish markers ("[price book test]", "Do not publish") -> block automatic publishing
 *   - stray leading numbers or symbols at the start of the description ("60. Vintage ...")
 *   - duplicated words in the title
 * Never throws (any internal error yields no notes for that check). Output goes into the intake review notes.
 */
import type { IntakeReviewNote, PrintedTextTranscription } from './intakeReviewTypes';

export interface ConsistencyInput {
  title?: string | null;
  description?: string | null;
  condition?: string | null;
  brand?: string | null;
  tags?: string[] | null;
  detectedPrintedText?: string | null;
  printedText?: PrintedTextTranscription | null;
  /** Vision OCR text (joined), used as an extra count source. */
  ocrText?: string | null;
}

export interface ConsistencyResult {
  notes: IntakeReviewNote[];
  blockAutoPublish: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, dozen: 12, pair: 2,
};
const NUM = '(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';
// Countable nouns: plural forms only, so "1970s" or "12 inch" never count.
const UNIT_NOUNS = '(diskettes|disks|discs|records|albums|lps|comics|comic books|issues|cards|coins|books|cds|dvds|cassettes|tapes|games|cartridges|carts|figures|figurines|plates|bowls|cups|glasses|mugs|pieces|pcs|items|clubs|balls|bulbs|magazines|ornaments|spoons|forks|knives|manuals|bottles|jars|tins|toys|dolls|cars|patches|pins|buttons|stamps|postcards|photos|prints|tools|bits|blades|pens|pencils|markers|rolls|packs|boxes|units|sets)';

const MEASURE_WORDS = 'inch|inches|in|rpm|oz|ounce|ounces|lb|lbs|pound|pounds|mm|cm|ft|foot|feet|gauge|volt|volts|v|watt|watts|w|year|years|yr|month|months|day|days|degree|degrees';

function toNumber(raw: string): number | null {
  const lower = raw.toLowerCase();
  if (lower in NUMBER_WORDS) return NUMBER_WORDS[lower];
  const n = parseInt(lower, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Item counts stated in a piece of text: "lot of 10", "set of seven", "6-piece", "10 Diskettes", "#1-4" (4 issues),
 * "a dozen". Values of 1 and implausible values (over 500) are dropped. Exported for tests.
 */
export function extractCounts(text: string | null | undefined): number[] {
  if (!text) return [];
  const out = new Set<number>();
  try {
    const t = String(text);
    const patterns: RegExp[] = [
      new RegExp(`\\b(?:lot|set|pack|bundle|collection|group|box|case|run)\\s+of\\s+${NUM}\\b`, 'gi'),
      new RegExp(`\\b${NUM}[- ]?(?:piece|pc|pcs|count|ct|pack)\\b`, 'gi'),
      // One optional adjective between number and noun ("7 blank diskettes"), never a measurement ("12 inch records").
      new RegExp(`\\b${NUM}\\s+(?!(?:${MEASURE_WORDS})\\b)(?:[a-z-]+\\s+)?${UNIT_NOUNS}\\b`, 'gi'),
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(t)) !== null) {
        const n = m[1] ? toNumber(m[1].trim()) : null;
        if (n != null && n > 1 && n <= 500) out.add(n);
      }
    }
    if (/(?<!half[- ])\bdozen\b/i.test(t)) out.add(12);
    if (/\bhalf[- ]dozen\b/i.test(t)) out.add(6);
    // Issue ranges: "#1-4", "Issues 1 - 6", "#12 to #15".
    const range = /(?:#|\bissues?\s+|\bnos?\.?\s*)(\d{1,4})\s*(?:-|–|to|thru|through)\s*#?(\d{1,4})\b/gi;
    let r: RegExpExecArray | null;
    while ((r = range.exec(t)) !== null) {
      const a = parseInt(r[1], 10);
      const b = parseInt(r[2], 10);
      if (b > a && b - a + 1 <= 100) out.add(b - a + 1);
    }
  } catch {
    return [];
  }
  return [...out];
}

const TEST_MARKERS: RegExp[] = [
  /\bdo\s+not\s+(publish|list|sell|post)\b/i,
  /\bdon'?t\s+(publish|list|post)\b/i,
  /\[[^\]]*\btest\b[^\]]*\]/i,
  /\btest\s+(item|listing|only|product|post|entry|record)\b/i,
  /^\s*test\b(?!ed|er|ing)/i,
  /\b(price book test|lorem ipsum|placeholder item|dummy item|delete me|not for sale)\b/i,
];

/** True when the text carries a test / do-not-publish marker. Exported for the sale publish readiness check. */
export function hasTestMarker(...texts: Array<string | null | undefined>): boolean {
  return texts.some((t) => typeof t === 'string' && TEST_MARKERS.some((re) => re.test(t)));
}

// Used-condition words. "unused", "never used", "not used", "like new" do not count.
const USED_WORDS = /(?<!\b(?:never|not|barely|no|without|zero|any|free of|nothing)\s)\b(used|pre-?owned|worn|opened|open box|play[- ]?tested|signs of (use|wear)|scuffs?|scratch(es|ed)?|torn|tears?|stain(s|ed)?|missing|ring ?wear|seam split|creas(e|es|ed)|fading|faded|wear)\b/i;
const NEW_WORDS = /\b(brand new|factory sealed|still sealed|sealed in (original )?(box|package|plastic)|new in box|nib|new with tags|nwt|never opened|unopened)\b/i;

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function editDistance(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const TITLE_STOPWORDS = new Set(['with', 'and', 'the', 'for', 'from', 'set', 'lot', 'vintage', 'new', 'used', 'of', 'a', 'in', 'on', 'to', 'or']);

export function runConsistencyChecks(input: ConsistencyInput): ConsistencyResult {
  const notes: IntakeReviewNote[] = [];
  let blockAutoPublish = false;
  const title = (input.title || '').trim();
  const description = (input.description || '').trim();

  // 1. Lot / set count agreement.
  try {
    const titleCounts = extractCounts(title);
    const descCounts = extractCounts(description);
    const printedSources = [
      ...(input.printedText?.counts || []),
      input.detectedPrintedText || '',
      input.ocrText || '',
    ].filter((s): s is string => typeof s === 'string' && s.length > 0);
    const printedCounts = [...new Set(printedSources.flatMap((s) => extractCounts(s)))];
    if (titleCounts.length > 0 && descCounts.length > 0 && !titleCounts.some((n) => descCounts.includes(n))) {
      notes.push({
        code: 'LOT_COUNT_MISMATCH',
        severity: 'high',
        source: 'consistency',
        field: 'title',
        message: `The title says ${titleCounts.join(' or ')} but the description says ${descCounts.join(' or ')}. Count what is actually included and fix both.`,
        current: titleCounts[0],
        suggested: descCounts[0],
      });
    }
    const listed = [...new Set([...titleCounts, ...descCounts])];
    if (printedCounts.length > 0 && listed.length > 0 && !printedCounts.some((n) => listed.includes(n))) {
      notes.push({
        code: 'PACKAGE_COUNT_MISMATCH',
        severity: 'medium',
        source: 'consistency',
        field: 'description',
        message: `The packaging shows ${printedCounts.join(' or ')} but the listing says ${listed.join(' or ')}. If some are missing, say how many are actually included.`,
        current: listed[0],
        suggested: printedCounts[0],
      });
    }
  } catch { /* never block tagging */ }

  // 2. Condition vs description wording.
  try {
    const cond = String(input.condition || '').toUpperCase();
    // Drop negated clauses first ("No scratches or wear", "without tears") so they never read as damage.
    const affirmed = description.replace(/\b(no|without|free of|never|zero)\s+[^.;,]*/gi, ' ');
    if (cond === 'NEW' && USED_WORDS.test(affirmed)) {
      const word = (affirmed.match(USED_WORDS) || [])[0] || 'used';
      notes.push({
        code: 'CONDITION_CONTRADICTION',
        severity: 'high',
        source: 'consistency',
        field: 'condition',
        message: `Condition is set to New but the description says "${word}". Use New only for sealed or unused items.`,
        current: 'NEW',
        suggested: 'USED',
      });
    } else if (cond === 'USED' && NEW_WORDS.test(description) && !/\b(like new|as new|open(ed)? box)\b/i.test(description)) {
      const word = (description.match(NEW_WORDS) || [])[0] || 'sealed';
      notes.push({
        code: 'CONDITION_CONTRADICTION',
        severity: 'medium',
        source: 'consistency',
        field: 'condition',
        message: `Condition is set to Used but the description says "${word}". Check which one is right.`,
        current: 'USED',
        suggested: 'NEW',
      });
    }
  } catch { /* ignore */ }

  // 3. Brand field vs printed brand and title.
  try {
    const brand = (input.brand || '').trim();
    const printedBrand = (input.printedText?.brand || '').trim();
    if (!brand && printedBrand) {
      notes.push({
        code: 'BRAND_MISSING',
        severity: 'medium',
        source: 'consistency',
        field: 'brand',
        message: `The brand field is empty but the label shows "${printedBrand}".`,
        suggested: printedBrand,
      });
    }
    if (brand && printedBrand && normalizeWord(brand) !== normalizeWord(printedBrand)) {
      const d = editDistance(normalizeWord(brand), normalizeWord(printedBrand));
      if (d > 0 && d <= 3) {
        notes.push({
          code: 'BRAND_SPELLING',
          severity: 'high',
          source: 'consistency',
          field: 'brand',
          message: `The brand is "${brand}" but the label reads "${printedBrand}". Copy the spelling from the label.`,
          current: brand,
          suggested: printedBrand,
        });
      }
    }
    if (brand && title) {
      const brandNorm = normalizeWord(brand);
      const titleWords = title.split(/\s+/).map((w) => w.replace(/[^A-Za-z0-9'&-]/g, '')).filter((w) => w.length >= 4);
      const titleHasBrand = normalizeWord(title).includes(brandNorm);
      if (!titleHasBrand && brandNorm.length >= 4) {
        const near = titleWords.find((w) => {
          const d = editDistance(normalizeWord(w), brandNorm);
          return d > 0 && d <= 2;
        });
        if (near) {
          notes.push({
            code: 'BRAND_TITLE_MISMATCH',
            severity: 'high',
            source: 'consistency',
            field: 'title',
            message: `The title says "${near}" but the brand field says "${brand}". One of them is misspelled.`,
            current: near,
            suggested: brand,
          });
        }
      }
    }
  } catch { /* ignore */ }

  // 4. Test / do-not-publish markers.
  try {
    if (hasTestMarker(title, description)) {
      blockAutoPublish = true;
      notes.push({
        code: 'TEST_MARKER',
        severity: 'high',
        source: 'consistency',
        field: 'title',
        message: 'This looks like a test or do-not-publish item, so it will not be published automatically. Remove the marker if it should go live.',
      });
    }
  } catch { /* ignore */ }

  // 5. Stray numbers or symbols at the start of the description.
  try {
    const stray = description.match(/^\s*(\d{1,4}\s*[.):\]-]+|[^A-Za-z0-9"'(\[#$\s]+)\s*(?=\S)/);
    if (stray && stray[0].trim().length > 0) {
      notes.push({
        code: 'DESCRIPTION_LEADING_GARBAGE',
        severity: 'medium',
        source: 'consistency',
        field: 'description',
        message: `The description starts with "${stray[0].trim()}", which looks like a stray number or symbol.`,
        current: stray[0].trim(),
      });
    }
  } catch { /* ignore */ }

  // 6. Duplicated words in the title.
  try {
    const consecutive = title.match(/\b([A-Za-z0-9']+)\s+\1\b/i);
    if (consecutive && !/^\d+$/.test(consecutive[1])) {
      notes.push({
        code: 'TITLE_DUPLICATE_WORD',
        severity: 'medium',
        source: 'consistency',
        field: 'title',
        message: `The title repeats "${consecutive[1]}".`,
        current: consecutive[1],
      });
    } else {
      const seen = new Map<string, number>();
      for (const w of title.split(/[\s,/]+/)) {
        const n = normalizeWord(w);
        if (n.length < 4 || TITLE_STOPWORDS.has(n) || /^\d+$/.test(n)) continue;
        seen.set(n, (seen.get(n) || 0) + 1);
      }
      const dup = [...seen.entries()].find(([, c]) => c > 1);
      if (dup) {
        notes.push({
          code: 'TITLE_DUPLICATE_WORD',
          severity: 'low',
          source: 'consistency',
          field: 'title',
          message: `The title uses "${dup[0]}" more than once. Use the space for another search word.`,
          current: dup[0],
        });
      }
    }
  } catch { /* ignore */ }

  return { notes, blockAutoPublish };
}
