/**
 * Latin homoglyph normalization (2026-10-27).
 *
 * Live incident: item cmv9kmvn90921110qzo01j5b4 was titled "D'Addario Planeтwaves ..." -- a Cyrillic
 * "т" (U+0442) inside an otherwise Latin word, produced by the photo-tagging model. The title was posted to
 * marketplaces as-is, where it breaks search and title matching (the word no longer matches "Planetwaves").
 *
 * normalizeLatinHomoglyphs() fixes that class of defect and nothing else:
 *  - Inside a word whose letters are mostly Latin, each Cyrillic/Greek lookalike letter is replaced by its
 *    Latin twin (а->a, т->t, ο->o, ...). Non-lookalike letters are left as they are.
 *  - A word that is genuinely Cyrillic or Greek (no Latin letters, or more non-Latin letters than Latin
 *    ones) is left untouched, so real Russian/Greek text survives.
 *  - Zero-width characters (U+200B..U+200D, U+2060, U+FEFF) are stripped everywhere.
 *
 * Pure: no I/O, no env, no imports. normalizeTextField() is the logging wrapper for write paths.
 */

/** Cyrillic and Greek letters that render the same as a Latin letter in common fonts. */
const LOOKALIKE_TO_LATIN: Readonly<Record<string, string>> = {
  // Cyrillic lowercase
  'а': 'a', // а
  'е': 'e', // е
  'о': 'o', // о
  'р': 'p', // р
  'с': 'c', // с
  'у': 'y', // у
  'х': 'x', // х
  'т': 't', // т
  'к': 'k', // к
  'м': 'm', // м
  'н': 'h', // н
  'в': 'b', // в
  'і': 'i', // і
  'ј': 'j', // ј
  'ѕ': 's', // ѕ
  'ԁ': 'd', // ԁ
  'һ': 'h', // һ
  'ӏ': 'l', // ӏ
  'ԛ': 'q', // ԛ
  'ԝ': 'w', // ԝ
  // Cyrillic uppercase
  'А': 'A', // А
  'В': 'B', // В
  'Е': 'E', // Е
  'К': 'K', // К
  'М': 'M', // М
  'Н': 'H', // Н
  'О': 'O', // О
  'Р': 'P', // Р
  'С': 'C', // С
  'Т': 'T', // Т
  'У': 'Y', // У
  'Х': 'X', // Х
  'І': 'I', // І
  'Ј': 'J', // Ј
  'Ѕ': 'S', // Ѕ
  'Ү': 'Y', // Ү
  'Ԛ': 'Q', // Ԛ
  'Ԝ': 'W', // Ԝ
  // Greek lowercase
  'ο': 'o', // ο omicron
  'α': 'a', // α alpha
  'ν': 'v', // ν nu
  'ρ': 'p', // ρ rho
  'τ': 't', // τ tau
  'ι': 'i', // ι iota
  'κ': 'k', // κ kappa
  // Greek uppercase
  'Α': 'A', // Α
  'Β': 'B', // Β
  'Ε': 'E', // Ε
  'Ζ': 'Z', // Ζ
  'Η': 'H', // Η
  'Ι': 'I', // Ι
  'Κ': 'K', // Κ
  'Μ': 'M', // Μ
  'Ν': 'N', // Ν
  'Ο': 'O', // Ο
  'Ρ': 'P', // Ρ
  'Τ': 'T', // Τ
  'Υ': 'Y', // Υ
  'Χ': 'X', // Χ
};

const ZERO_WIDTH_RE = /[​‌‍⁠﻿]/g;
/** A "word": a run of letters and combining marks (digits, spaces and punctuation separate words). */
const WORD_RE = /[\p{L}\p{M}]+/gu;
const LATIN_LETTER_RE = /\p{Script=Latin}/u;
const CYRILLIC_OR_GREEK_RE = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;
/** Fast pre-check: nothing to do unless the text has a zero-width char or a Cyrillic/Greek letter. */
const NEEDS_WORK_RE = /[​‌‍⁠﻿\p{Script=Cyrillic}\p{Script=Greek}]/u;

function normalizeWord(word: string): string {
  let latin = 0;
  let foreign = 0;
  for (const ch of word) {
    if (LATIN_LETTER_RE.test(ch)) latin++;
    else if (CYRILLIC_OR_GREEK_RE.test(ch)) foreign++;
  }
  // Pure Latin, or a genuinely Cyrillic/Greek word (no Latin letters, or a non-Latin majority): leave it.
  if (foreign === 0 || latin === 0 || foreign > latin) return word;
  let out = '';
  for (const ch of word) out += LOOKALIKE_TO_LATIN[ch] ?? ch;
  return out;
}

/** Replace Cyrillic/Greek lookalikes inside otherwise-Latin words and strip zero-width characters. */
export function normalizeLatinHomoglyphs(s: string): string {
  if (typeof s !== 'string' || s === '' || !NEEDS_WORK_RE.test(s)) return s;
  return s.replace(ZERO_WIDTH_RE, '').replace(WORD_RE, normalizeWord);
}

/** True when normalizeLatinHomoglyphs would change the text. */
export function hasLatinHomoglyphs(s: string | null | undefined): boolean {
  return typeof s === 'string' && normalizeLatinHomoglyphs(s) !== s;
}

/**
 * Write-path wrapper: normalizes a string field and logs when it changed anything. Any non-string value
 * (undefined, null, numbers from a malformed body) is returned unchanged, so callers keep their
 * "absent means not provided" semantics.
 */
export function normalizeTextField<T>(value: T, context: string): T {
  if (typeof value !== 'string') return value;
  const next = normalizeLatinHomoglyphs(value);
  if (next !== value) {
    console.log(`[homoglyphs] ${context}: normalized mixed-script text`, {
      before: JSON.stringify(value).slice(0, 200),
      after: JSON.stringify(next).slice(0, 200),
    });
  }
  return next as unknown as T;
}

/**
 * Normalizes the title and description of an AI tagging result in place (photo-tagging pipeline).
 * Returns the same object for chaining.
 */
export function normalizeTaggedText<R extends { title?: string | null; description?: string | null }>(result: R, context: string): R {
  if (!result) return result;
  const r = result as { title?: string | null; description?: string | null };
  if (typeof r.title === 'string') r.title = normalizeTextField(r.title, `${context} title`);
  if (typeof r.description === 'string') r.description = normalizeTextField(r.description, `${context} description`);
  return result;
}
