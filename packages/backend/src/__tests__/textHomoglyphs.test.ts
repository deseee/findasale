/**
 * Unit tests for services/textHomoglyphs.ts (2026-10-27 live incident: Cyrillic "т" inside "Planetwaves").
 * Pure module: no database, no network.
 */
import { normalizeLatinHomoglyphs, hasLatinHomoglyphs, normalizeTextField, normalizeTaggedText } from '../services/textHomoglyphs';

const CYR_TE = 'т'; // т
const LIVE_TITLE = `D'Addario Plane${CYR_TE}waves Acoustic Quick-Release Guitar Strap System`;

describe('normalizeLatinHomoglyphs: mixed words are fixed', () => {
  it('fixes the live title (Cyrillic te inside "Planetwaves")', () => {
    expect(normalizeLatinHomoglyphs(LIVE_TITLE)).toBe("D'Addario Planetwaves Acoustic Quick-Release Guitar Strap System");
    expect(hasLatinHomoglyphs(LIVE_TITLE)).toBe(true);
  });

  it.each([
    ['а', 'a'], ['е', 'e'], ['о', 'o'], ['р', 'p'], ['с', 'c'], ['у', 'y'], ['х', 'x'],
    ['т', 't'], ['к', 'k'], ['м', 'm'], ['н', 'h'], ['в', 'b'], ['і', 'i'], ['ј', 'j'],
    ['ѕ', 's'],
    ['ο', 'o'], ['α', 'a'], ['ν', 'v'], ['ρ', 'p'], ['τ', 't'], ['ι', 'i'], ['κ', 'k'],
  ])('lowercase lookalike %s becomes %s inside a Latin word', (glyph, latin) => {
    expect(normalizeLatinHomoglyphs(`ab${glyph}cd`)).toBe(`ab${latin}cd`);
  });

  it.each([
    ['А', 'A'], ['В', 'B'], ['Е', 'E'], ['К', 'K'], ['М', 'M'], ['Н', 'H'], ['О', 'O'],
    ['Р', 'P'], ['С', 'C'], ['Т', 'T'], ['Х', 'X'], ['У', 'Y'], ['І', 'I'], ['Ј', 'J'],
    ['Ѕ', 'S'],
    ['Α', 'A'], ['Β', 'B'], ['Ε', 'E'], ['Η', 'H'], ['Ι', 'I'], ['Κ', 'K'], ['Μ', 'M'],
    ['Ν', 'N'], ['Ο', 'O'], ['Ρ', 'P'], ['Τ', 'T'], ['Υ', 'Y'], ['Χ', 'X'], ['Ζ', 'Z'],
  ])('uppercase lookalike %s becomes %s at the start of a Latin word', (glyph, latin) => {
    expect(normalizeLatinHomoglyphs(`${glyph}ools`)).toBe(`${latin}ools`);
  });

  it('fixes several lookalikes in one word and several words in one string', () => {
    // "Pyrex" with Cyrillic Р and у; "Bowl" with Cyrillic о
    expect(normalizeLatinHomoglyphs('Руrex Mixing Bоwl')).toBe('Pyrex Mixing Bowl');
  });

  it('a 50/50 word (two Latin, two lookalike letters) is treated as Latin', () => {
    expect(normalizeLatinHomoglyphs('Тоol')).toBe('Tool');
  });

  it('keeps punctuation, digits, accents and spacing exactly', () => {
    expect(normalizeLatinHomoglyphs('Café Chаir, 1950s -- 3 pcs!')).toBe('Café Chair, 1950s -- 3 pcs!');
  });

  it('leaves an unmapped non-Latin letter in a Latin word in place (only lookalikes are swapped)', () => {
    // Greek mu in "10 μm" style units: no Latin twin, stays.
    expect(normalizeLatinHomoglyphs('μm')).toBe('μm');
  });
});

describe('normalizeLatinHomoglyphs: genuine Cyrillic/Greek words are left alone', () => {
  it.each([
    ['Russian word', 'Матрёшка'], // Матрёшка
    ['Russian word made only of lookalike letters', 'Мама'], // Мама
    ['Russian phrase', 'Сделано в СССР'], // Сделано в СССР
    ['Greek word', 'Καλημέρα'], // Καλημέρα
  ])('%s stays unchanged', (_label, text) => {
    expect(normalizeLatinHomoglyphs(text)).toBe(text);
    expect(hasLatinHomoglyphs(text)).toBe(false);
  });

  it('a mostly-Cyrillic word with one Latin letter is left alone', () => {
    const w = 'Приветx'; // Приветx
    expect(normalizeLatinHomoglyphs(w)).toBe(w);
  });

  it('English and Russian words in one title: only the mixed word changes', () => {
    const t = `Vintage Soviet Poster СССР Plane${CYR_TE}`;
    expect(normalizeLatinHomoglyphs(t)).toBe('Vintage Soviet Poster СССР Planet');
  });

  it('plain ASCII and plain Latin text is returned as the same string', () => {
    const s = 'Brass Floor Lamp, Art Deco Style';
    expect(normalizeLatinHomoglyphs(s)).toBe(s);
    expect(normalizeLatinHomoglyphs('')).toBe('');
  });
});

describe('zero-width stripping', () => {
  it.each([['ZWSP', '​'], ['ZWNJ', '‌'], ['ZWJ', '‍'], ['word joiner', '⁠'], ['BOM', '﻿']])(
    '%s is removed, inside and between words',
    (_label, zw) => {
      expect(normalizeLatinHomoglyphs(`Gui${zw}tar${zw} Strap`)).toBe('Guitar Strap');
      expect(normalizeLatinHomoglyphs(`${zw}Lamp`)).toBe('Lamp');
    }
  );

  it('a zero-width char inside a Cyrillic word is removed, the word stays Cyrillic', () => {
    expect(normalizeLatinHomoglyphs('Ма​ма')).toBe('Мама');
  });

  it('a zero-width char splitting a mixed word does not stop the homoglyph fix', () => {
    expect(normalizeLatinHomoglyphs(`Plane​${CYR_TE}waves`)).toBe('Planetwaves');
  });
});

describe('normalizeTextField / normalizeTaggedText', () => {
  let logSpy: jest.SpyInstance;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it('returns non-strings unchanged and does not log', () => {
    expect(normalizeTextField(undefined, 'x')).toBeUndefined();
    expect(normalizeTextField(null, 'x')).toBeNull();
    expect(normalizeTextField(5 as unknown, 'x')).toBe(5);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs only when the text changed', () => {
    expect(normalizeTextField('Clean title', 'ctx')).toBe('Clean title');
    expect(logSpy).not.toHaveBeenCalled();
    expect(normalizeTextField(LIVE_TITLE, 'ctx')).toContain('Planetwaves');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(String(logSpy.mock.calls[0][0])).toContain('[homoglyphs] ctx');
  });

  it('normalizeTaggedText fixes title and description in place and leaves other fields', () => {
    const r: any = { title: LIVE_TITLE, description: `Grеat strap​.`, brand: `D'Addario`, tags: [`plane${CYR_TE}waves`] };
    const out = normalizeTaggedText(r, 'test');
    expect(out).toBe(r);
    expect(r.title).toBe("D'Addario Planetwaves Acoustic Quick-Release Guitar Strap System");
    expect(r.description).toBe('Great strap.');
    expect(r.tags).toEqual([`plane${CYR_TE}waves`]);
  });

  it('normalizeTaggedText tolerates missing fields', () => {
    expect(normalizeTaggedText({ title: undefined, description: null } as any, 't')).toEqual({ title: undefined, description: null });
  });
});
