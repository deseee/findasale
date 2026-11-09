/**
 * titleCaps.ts -- title capitalization guard for the intake pipeline (2026-11-08).
 *
 * Haiku sometimes copies a printed name in ALL CAPS into the title ("Paulo O'NEILL"), because trading cards and
 * labels print names that way. Marketplace titles read better (and search the same) in Title Case, so ALL-CAPS name
 * words the model introduced are converted (rules: shoutedTokenIndexes), keeping:
 *   - tokens that contain a digit (model codes, set codes: EX2000, BC-9, 1997)
 *   - known acronyms (LP, NFL, MLB, USA, PSA ...), clothing sizes and roman numerals
 *   - words of 2 letters or fewer (UK, TV, LP), and 3-4 letter acronym-like words unless they sit in a run of names
 *   - words already in caps in the prior title, and hyphen-joined trademarks (THERM-X-TROL)
 *   - any extra words the caller passes in `keep` (e.g. the brand when the brand itself is all caps)
 */

export const KNOWN_TITLE_ACRONYMS: ReadonlySet<string> = new Set([
  // sports leagues / organizations
  'NFL', 'MLB', 'NBA', 'NHL', 'NCAA', 'WNBA', 'MLS', 'PGA', 'LPGA', 'UFC', 'WWE', 'WWF', 'WCW', 'AEW', 'NASCAR', 'FIFA', 'USA', 'USSR',
  // grading / collectibles
  'PSA', 'BGS', 'SGC', 'CGC', 'CSG', 'HGA', 'NGC', 'PCGS', 'ANACS', 'RC', 'SP', 'SSP', 'TCG', 'CCG', 'MTG', 'COA', 'JSA', 'UDA',
  // media / formats / tech
  'LP', 'EP', 'RPM', 'CD', 'DVD', 'VHS', 'HD', 'UHD', 'BLU', 'NES', 'SNES', 'GBA', 'PSP', 'PC', 'TV', 'LED', 'LCD', 'USB', 'HDMI', 'AC', 'DC',
  'MVS', 'SNK', 'BCW', 'AM', 'FM', 'GPS', 'RAM', 'SSD', 'HDD', 'CPU', 'GPU', 'MP3', 'AAA', 'RCA', 'JVC', 'JBL', 'IBM', 'HP', 'AMD', 'BMW', 'GM', 'GE', 'LG', 'NEC',
  // brands commonly styled in caps
  'IKEA', 'LEGO', 'NASA', 'ASICS', 'SEGA', 'ATARI', 'BIC', 'DKNY', 'GAP', 'UGG', 'MAC', 'OXO', 'KISS', 'AC/DC', 'ACDC', 'ABBA', 'REM', 'INXS',
  // listing words that are conventionally caps
  'NIB', 'NWT', 'NWOT', 'NOS', 'OEM', 'OOAK', 'UK', 'EU', 'US', 'XL', 'XXL', 'XXXL', 'XS', 'XXS', 'SM', 'MD', 'LG', 'OZ', 'MM', 'CM',
]);

const ROMAN = /^(?:I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XV|XVI{1,3}|XIX|XX)$/;

function lettersOf(word: string): string {
  return word.replace(/[^A-Za-z]/g, '');
}

/** True when the word is an ALL-CAPS word of 3+ letters that is not a code, acronym, size or roman numeral. */
export function isShoutedWord(word: string, keep?: ReadonlySet<string>): boolean {
  if (!word || /\d/.test(word)) return false;
  const letters = lettersOf(word);
  if (letters.length < 3) return false;
  if (letters !== letters.toUpperCase()) return false;
  const bare = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').toUpperCase();
  if (KNOWN_TITLE_ACRONYMS.has(bare) || KNOWN_TITLE_ACRONYMS.has(letters.toUpperCase())) return false;
  if (ROMAN.test(bare)) return false;
  if (keep && (keep.has(bare) || keep.has(letters.toUpperCase()))) return false;
  return true;
}

function titleCaseSegment(seg: string): string {
  if (!seg) return seg;
  const lower = seg.toLowerCase();
  // "MCGWIRE" -> "McGwire", "MACDONALD" is left as "Macdonald" (Mac is ambiguous).
  if (/^mc[a-z]{2,}$/.test(lower)) return `Mc${lower.charAt(2).toUpperCase()}${lower.slice(3)}`;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** "O'NEILL" -> "O'Neill", "JEAN-PAUL" -> "Jean-Paul", "MCGWIRE" -> "McGwire". */
export function titleCaseWord(word: string): string {
  return word.replace(/[A-Za-z]+/g, (seg) => titleCaseSegment(seg));
}

/** Builds the keep-set from words the caller wants to keep as they are (brand etc.). */
export function capsKeepSet(words: Array<string | null | undefined>): Set<string> {
  const keep = new Set<string>();
  for (const w of words) {
    if (typeof w !== 'string') continue;
    for (const tok of w.split(/\s+/)) {
      const letters = lettersOf(tok);
      if (letters.length >= 2 && letters === letters.toUpperCase()) keep.add(letters.toUpperCase());
    }
  }
  return keep;
}

export interface TitleCapsContext {
  /**
   * Text the title had BEFORE this change (the stored title on a recheck / re-analyze). An ALL-CAPS word that was
   * already in caps there is never touched: only words the model newly put in caps are converted.
   */
  priorText?: Array<string | null | undefined>;
  /**
   * Text printed on the item (OCR / pass-1 transcription). A 2-4 letter ALL-CAPS word or a hyphen-joined trademark
   * ("THERM-X-TROL") printed in caps is kept. Longer name words are still converted (cards print names in caps).
   */
  printedText?: Array<string | null | undefined>;
}

/** Hyphen-joined trademark: an ALL-CAPS token with a hyphen and a 1-2 letter segment ("THERM-X-TROL", "E-Z-GO"). */
export function isHyphenTrademark(word: string): boolean {
  if (!/[A-Za-z]-[A-Za-z]/.test(word)) return false;
  const segs = word.split('-').map(lettersOf).filter(Boolean);
  return segs.length >= 2 && segs.some((s) => s.length <= 2);
}

function capsTokensOf(texts: Array<string | null | undefined> | undefined): Set<string> {
  const out = new Set<string>();
  for (const t of texts || []) {
    if (typeof t !== 'string') continue;
    for (const tok of t.split(/[\s,;:/()]+/)) {
      const letters = lettersOf(tok);
      if (letters.length >= 2 && letters === letters.toUpperCase()) {
        out.add(letters.toUpperCase());
      }
    }
  }
  return out;
}

/**
 * Indexes of the whitespace tokens of `title` that normalizeTitleCaps converts. Rules (2026-11-08, live recheck: "Neo Geo
 * MVS" became "Mvs" and "Amtrol THERM-X-TROL" became "Therm-X-Trol"):
 *   - only ALL-CAPS words the model newly introduced are converted: a word already in caps in `priorText` (or the
 *     keep list, e.g. an all-caps brand) stays as it is
 *   - a hyphen-joined trademark ("THERM-X-TROL") is never converted
 *   - a 2-4 letter word is never converted on its own (acronym-like: MVS, SNK, BCW, NES). It is converted only as part
 *     of a run of shouted name words next to a converted 5+ letter word ("MARK MCGWIRE" -> "Mark McGwire"), and never
 *     when the printed text shows it in caps
 *   - a 5+ letter name-like word ("O'NEILL", "MCGWIRE") is converted
 */
export function shoutedTokenIndexes(title: string, keepAsIs?: Array<string | null | undefined>, ctx: TitleCapsContext = {}): Set<number> {
  const out = new Set<number>();
  if (typeof title !== 'string' || !title) return out;
  const keep = keepAsIs && keepAsIs.length > 0 ? capsKeepSet(keepAsIs) : undefined;
  const prior = capsTokensOf(ctx.priorText);
  const printed = capsTokensOf(ctx.printedText);
  const toks = title.split(/\s+/).filter(Boolean);
  const kind: Array<'strong' | 'short' | null> = toks.map((tok) => {
    if (!isShoutedWord(tok, keep)) return null;
    const letters = lettersOf(tok).toUpperCase();
    if (prior.has(letters)) return null;
    if (isHyphenTrademark(tok)) return null;
    if (/-/.test(tok) && printed.has(letters)) return null;
    if (letters.length >= 5) return 'strong';
    if (printed.has(letters)) return null;
    return 'short';
  });
  // A short word joins a run that touches a strong word ("MARK MCGWIRE", "PAUL O'NEILL").
  for (let i = 0; i < toks.length; i++) if (kind[i] === 'strong') out.add(i);
  for (let i = 0; i < toks.length; i++) {
    if (kind[i] !== 'strong') continue;
    for (const dir of [-1, 1]) {
      let j = i + dir;
      while (j >= 0 && j < toks.length && (kind[j] === 'short' || kind[j] === 'strong')) {
        out.add(j);
        j += dir;
      }
    }
  }
  return out;
}

/**
 * Converts ALL-CAPS name words in a title to Title Case. Pure; returns the input unchanged when nothing applies.
 * `keepAsIs` lists words (e.g. an all-caps brand) to leave untouched; `ctx` carries the prior title and printed text
 * (see shoutedTokenIndexes for the rules).
 */
export function normalizeTitleCaps(title: string, keepAsIs?: Array<string | null | undefined>, ctx: TitleCapsContext = {}): string {
  if (typeof title !== 'string' || !title) return title;
  const idx = shoutedTokenIndexes(title, keepAsIs, ctx);
  if (idx.size === 0) return title;
  let n = -1;
  return title.replace(/\S+/g, (tok) => {
    n += 1;
    return idx.has(n) ? titleCaseWord(tok) : tok;
  });
}
