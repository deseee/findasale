/**
 * titleCaps.ts -- title capitalization guard for the intake pipeline (2026-11-08).
 *
 * Haiku sometimes copies a printed name in ALL CAPS into the title ("Paulo O'NEILL"), because trading cards and
 * labels print names that way. Marketplace titles read better (and search the same) in Title Case, so any ALL-CAPS
 * word of 3+ letters is converted, keeping:
 *   - tokens that contain a digit (model codes, set codes: EX2000, BC-9, 1997)
 *   - known acronyms (LP, NFL, MLB, USA, PSA ...), clothing sizes and roman numerals
 *   - words of 2 letters or fewer (UK, TV, LP)
 *   - any extra words the caller passes in `keep` (e.g. the brand when the brand itself is all caps)
 */

export const KNOWN_TITLE_ACRONYMS: ReadonlySet<string> = new Set([
  // sports leagues / organizations
  'NFL', 'MLB', 'NBA', 'NHL', 'NCAA', 'WNBA', 'MLS', 'PGA', 'LPGA', 'UFC', 'WWE', 'WWF', 'WCW', 'AEW', 'NASCAR', 'FIFA', 'USA', 'USSR',
  // grading / collectibles
  'PSA', 'BGS', 'SGC', 'CGC', 'CSG', 'HGA', 'NGC', 'PCGS', 'ANACS', 'RC', 'SP', 'SSP', 'TCG', 'CCG', 'MTG', 'COA', 'JSA', 'UDA',
  // media / formats / tech
  'LP', 'EP', 'RPM', 'CD', 'DVD', 'VHS', 'HD', 'UHD', 'BLU', 'NES', 'SNES', 'GBA', 'PSP', 'PC', 'TV', 'LED', 'LCD', 'USB', 'HDMI', 'AC', 'DC',
  'AM', 'FM', 'GPS', 'RAM', 'SSD', 'HDD', 'CPU', 'GPU', 'MP3', 'AAA', 'RCA', 'JVC', 'JBL', 'IBM', 'HP', 'AMD', 'BMW', 'GM', 'GE', 'LG', 'NEC',
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

/**
 * Converts ALL-CAPS name words in a title to Title Case. Pure; returns the input unchanged when nothing applies.
 * `keepAsIs` lists words (e.g. an all-caps brand) to leave untouched.
 */
export function normalizeTitleCaps(title: string, keepAsIs?: Array<string | null | undefined>): string {
  if (typeof title !== 'string' || !title) return title;
  const keep = keepAsIs && keepAsIs.length > 0 ? capsKeepSet(keepAsIs) : undefined;
  return title.replace(/\S+/g, (tok) => (isShoutedWord(tok, keep) ? titleCaseWord(tok) : tok));
}
