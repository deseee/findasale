/**
 * descriptionMerger.ts — Item Description Authoring Contract
 *
 * Pure functions for atomic merge of voice + auto-generated item descriptions.
 * No Prisma dependencies — safe for unit tests and reuse across handlers/jobs.
 *
 * Rules (architect-locked, Patrick-signed off 2026-05-12):
 * - Voice content always appears BEFORE auto-generated content
 * - Voice writes always append (organizer may intentionally re-record)
 * - Auto writes use novelty check to prevent duplication on re-analyze
 * - Sentinel string separates the two blocks and is visible to shoppers
 * - Source enum is "VOICE" | "AUTO" (D-006: never "AI" in API surfaces)
 */

export const SENTINEL = '\n\n— Item details —\n\n'; // em-dash U+2014
export const MAX_DESCRIPTION_LENGTH = 5000;

export type DescriptionSource = 'VOICE' | 'AUTO';

export interface ComposeResult {
  description: string;
  appended: boolean;
  reason?: 'empty' | 'too_long' | 'duplicate';
}

/**
 * Split a stored description into [voiceBlock, autoBlock] using the SENTINEL.
 * Legacy items written before this endpoint existed have no sentinel —
 * treat their entire contents as autoBlock so the next voice append produces
 * the correct organizer-first ordering.
 */
export function splitOnSentinel(current: string | null | undefined): { voiceBlock: string; autoBlock: string } {
  const text = (current ?? '').trim();
  if (!text) return { voiceBlock: '', autoBlock: '' };

  const idx = text.indexOf(SENTINEL);
  if (idx === -1) {
    return { voiceBlock: '', autoBlock: text };
  }
  return {
    voiceBlock: text.slice(0, idx).trim(),
    autoBlock: text.slice(idx + SENTINEL.length).trim(),
  };
}

/**
 * Returns true if `needle` is meaningfully novel relative to `haystack`.
 * Used only for AUTO source to dedupe re-analyzed AI output.
 *
 * Algorithm:
 * - <12 chars: too short to dedup reliably, always novel
 * - Exact normalized substring match: duplicate
 * - 30-char sliding window with 10-char stride: if >=60% of needle's chars
 *   overlap with windows already in haystack, treat as rephrase (duplicate)
 */
export function isNovel(haystack: string, needle: string): boolean {
  const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const h = norm(haystack);
  const n = norm(needle);

  if (n.length < 12) return true;
  if (h.includes(n)) return false;

  let matched = 0;
  for (let i = 0; i + 30 <= n.length; i += 10) {
    const window = n.slice(i, i + 30);
    if (h.includes(window)) matched += 10;
  }
  return matched / n.length < 0.6;
}

/**
 * Append a string with sentence-aware separator.
 * - Empty block: just the new text
 * - Block ending in [.!?]: single space separator
 * - Otherwise: '. ' separator (joins fragments into prose)
 */
function appendWithSeparator(block: string, incoming: string): string {
  const trimmed = block.trim();
  if (!trimmed) return incoming;
  if (/[.!?]$/.test(trimmed)) {
    return trimmed + ' ' + incoming;
  }
  return trimmed + '. ' + incoming;
}

/**
 * Strip weight and dimension phrases from a voice-note transcript when those
 * values have already been captured in the item's structured fields.
 *
 * Only strips patterns for the dimensions that were actually extracted
 * (controlled by the `has*` flags). After stripping, cleans up orphaned
 * punctuation and collapses extra whitespace.
 *
 * Examples removed when hasWeight=true:
 *   "weighs about 3 pounds" / "it's 48 ounces" / "3 lbs total"
 *   "2 lb 4 oz" / "2 lb and 4 oz" / "2 lb, 4 oz"
 * Examples removed when hasDimensions=true:
 *   "12 by 8 by 4 inches" / "measures 10 x 6 x 3" / "dimensions are 12 by 8 by 4"
 *   "10 inches wide" / "6 inches tall"
 */
export function stripShippingPhrases(
  text: string,
  opts: { hasWeight?: boolean; hasDimensions?: boolean }
): string {
  let t = text;

  if (opts.hasWeight) {
    // weightUnit: all unit spellings, dot suffix optional (oz, oz., lb, lb., lbs, lbs., etc.)
    const weightUnit = '(?:pounds?|ounces?|lbs?\\.?|ozs?\\.?)';
    // weightVal: a single NUMBER UNIT pair
    const weightVal  = `\\d+(?:\\.\\d+)?\\s*${weightUnit}`;
    // weightExpr: one or more NUMBER UNIT pairs joined by optional "and" or ","
    // Consumes compound weights ("2 lb 4 oz", "2 lb and 4 oz", "2 lb, 4 oz")
    // in a single match so no leading number or connector is left behind.
    const weightExpr = `${weightVal}(?:\\s*(?:and|,)?\\s*${weightVal})*`;

    // "weighs [about|approximately|around]? <weightExpr>"
    t = t.replace(
      new RegExp(`\\bweigh(?:s|ed|ing)?\\s+(?:about|approximately|around|~)?\\s*${weightExpr}`, 'gi'),
      ''
    );
    // "it('s| is| weighs) [about|~]? <weightExpr>"
    t = t.replace(
      new RegExp(`\\bit(?:'s| is| weighs)\\s+(?:about|approximately|around|~)?\\s*${weightExpr}`, 'gi'),
      ''
    );
    // Standalone "<weightExpr> (in weight|heavy|total|net|gross)?"
    t = t.replace(
      new RegExp(`\\b${weightExpr}\\s*(?:in weight|total|net|heavy|gross)?\\b`, 'gi'),
      ''
    );
  }

  if (opts.hasDimensions) {
    const num = '\\d+(?:[./]\\d+)?';
    const sep = '\\s*(?:by|x|×|and)\\s*';
    const unit = '(?:inches?|in\\.?|")?';

    // "dimensions are X by Y by Z [inches]"
    t = t.replace(
      new RegExp(`\\bdimensions?\\s+(?:are|is|:)?\\s*${num}\\s*${unit}\\s*${sep}${num}\\s*${unit}\\s*${sep}${num}\\s*${unit}`, 'gi'),
      ''
    );
    // "measures X by Y by Z [inches]"
    t = t.replace(
      new RegExp(`\\bmeasures?\\s+${num}\\s*${unit}\\s*${sep}${num}\\s*${unit}\\s*${sep}${num}\\s*${unit}`, 'gi'),
      ''
    );
    // Bare "X by Y by Z [inches]" — three-part dimension string
    t = t.replace(
      new RegExp(`\\b${num}\\s*${unit}\\s*${sep}${num}\\s*${unit}\\s*${sep}${num}\\s*${unit}`, 'gi'),
      ''
    );
    // "X inches [wide|tall|long|deep|in width|in height|in length]"
    t = t.replace(
      /\b\d+(?:[./]\d+)?\s*(?:inches?|in\.?|")\s*(?:wide|tall|long|deep|in width|in height|in length|by|x)?\b/gi,
      ''
    );
  }

  // Clean up orphaned connectors, empty parens, punctuation, and extra whitespace
  t = t
    .replace(/\(\s*\)/g, '')                              // empty parens "()"
    .replace(/\s+\band\b\s+/gi, ' ')                    // orphaned "and" between spaces
    .replace(/\s+\bor\b\s+/gi, ' ')                     // orphaned "or" between spaces
    .replace(/[,;]\s*[,;]/g, ',')                          // doubled commas/semicolons
    .replace(/\s+([,;.!?])/g, (_m, p: string) => p)         // space before punctuation
    .replace(/^[,;.\s]+/, '')                              // leading junk
    .replace(/[,;\s]+$/, '.')                              // trailing junk → period
    .replace(/\s{2,}/g, ' ')                               // collapse multiple spaces
    .trim();

  return t;
}

/**
 * Compose the new description state from the current value + incoming text.
 *
 * @param current   existing item.description (null/empty allowed)
 * @param incoming  new text to merge in
 * @param source    'VOICE' for organizer voice transcripts (always appends),
 *                  'AUTO' for AI-generated content (skipped if duplicate)
 * @returns         composed string + whether the append happened + skip reason
 */
export function composeDescription(
  current: string | null | undefined,
  incoming: string,
  source: DescriptionSource
): ComposeResult {
  const trimmed = (incoming ?? '').trim();

  if (!trimmed) {
    return { description: current ?? '', appended: false, reason: 'empty' };
  }

  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return { description: current ?? '', appended: false, reason: 'too_long' };
  }

  const { voiceBlock, autoBlock } = splitOnSentinel(current);

  if (source === 'AUTO') {
    // Check novelty against BOTH blocks (avoid re-adding text that was already spoken)
    const combined = (autoBlock + ' ' + voiceBlock).trim();
    if (!isNovel(combined, trimmed)) {
      return { description: current ?? '', appended: false, reason: 'duplicate' };
    }
    const newAuto = appendWithSeparator(autoBlock, trimmed);
    const composed = voiceBlock && newAuto
      ? voiceBlock + SENTINEL + newAuto
      : (voiceBlock || newAuto);
    return { description: composed, appended: true };
  }

  // VOICE: always append, no novelty check
  const newVoice = appendWithSeparator(voiceBlock, trimmed);
  const composed = newVoice && autoBlock
    ? newVoice + SENTINEL + autoBlock
    : (newVoice || autoBlock);
  return { description: composed, appended: true };
}
