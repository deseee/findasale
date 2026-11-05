/**
 * Intake deterministic consistency checks (2026-11-05). Pure string rules, no network, no database.
 * Cases are the real defect classes from the 2026-11 audit of 316 live items.
 */
import { extractCounts, hasTestMarker, runConsistencyChecks } from '../services/intakeConsistencyChecks';
import { itemNotReadyReasons } from '../services/salePublishReadinessService';

const codes = (r: { notes: { code: string }[] }) => r.notes.map((n) => n.code);

describe('extractCounts', () => {
  it('reads lot/set counts, piece counts, noun counts and issue ranges', () => {
    expect(extractCounts('Lot of 10 Diskettes')).toEqual(expect.arrayContaining([10]));
    expect(extractCounts('Set of seven blank diskettes')).toEqual([7]);
    expect(extractCounts('6-piece Pyrex bowl set')).toEqual([6]);
    expect(extractCounts('Includes 7 blank diskettes')).toEqual([7]);
    expect(extractCounts('Spider-Man comic lot #1-4')).toEqual([4]);
    expect(extractCounts('a half dozen eggs cups')).toEqual(expect.arrayContaining([6]));
  });
  it('ignores decades, measurements and single units', () => {
    expect(extractCounts('1970s 12 inch records')).toEqual([]);
    expect(extractCounts('33 rpm albums')).toEqual([]);
    expect(extractCounts('1 record')).toEqual([]);
    expect(extractCounts(null)).toEqual([]);
  });
});

describe('runConsistencyChecks', () => {
  it('flags a title count that disagrees with the description (Lot of 10 vs set of 7)', () => {
    const r = runConsistencyChecks({
      title: 'Lot of 10 Maxell 3.5 Diskettes',
      description: 'Set of 7 Maxell floppy diskettes in the original box.',
      condition: 'USED',
    });
    expect(codes(r)).toContain('LOT_COUNT_MISMATCH');
    expect(r.notes.find((n) => n.code === 'LOT_COUNT_MISMATCH')!.severity).toBe('high');
  });

  it('flags a comic issue range that disagrees with the description', () => {
    const r = runConsistencyChecks({ title: 'Spider-Man Comic Lot #1-4', description: 'Six comics in bags and boards.', condition: 'USED' });
    expect(codes(r)).toContain('LOT_COUNT_MISMATCH');
  });

  it('flags packaging counts that differ from the listing', () => {
    const r = runConsistencyChecks({
      title: 'Maxell Diskettes, Set of 7',
      description: 'Seven diskettes.',
      condition: 'USED',
      printedText: { counts: ['10 Diskettes'] },
    });
    expect(codes(r)).toContain('PACKAGE_COUNT_MISMATCH');
    expect(codes(r)).not.toContain('LOT_COUNT_MISMATCH');
  });

  it('does not flag agreeing counts', () => {
    const r = runConsistencyChecks({ title: 'Lot of 7 Diskettes', description: 'Seven diskettes, 7 in total.', condition: 'USED', printedText: { counts: ['7 Diskettes'] } });
    expect(codes(r)).not.toContain('LOT_COUNT_MISMATCH');
    expect(codes(r)).not.toContain('PACKAGE_COUNT_MISMATCH');
  });

  it('flags NEW condition with used wording, but not negated wording', () => {
    expect(codes(runConsistencyChecks({ title: 'Lamp', description: 'Used condition, works well.', condition: 'NEW' }))).toContain('CONDITION_CONTRADICTION');
    expect(codes(runConsistencyChecks({ title: 'Lamp', description: 'Box is torn on one corner.', condition: 'NEW' }))).toContain('CONDITION_CONTRADICTION');
    expect(codes(runConsistencyChecks({ title: 'Lamp', description: 'Factory sealed. No scratches or wear.', condition: 'NEW' }))).not.toContain('CONDITION_CONTRADICTION');
    expect(codes(runConsistencyChecks({ title: 'Lamp', description: 'Unused, never opened.', condition: 'NEW' }))).not.toContain('CONDITION_CONTRADICTION');
  });

  it('flags USED condition with sealed wording', () => {
    const r = runConsistencyChecks({ title: 'Game', description: 'Factory sealed copy.', condition: 'USED' });
    expect(r.notes.find((n) => n.code === 'CONDITION_CONTRADICTION')!.suggested).toBe('NEW');
  });

  it('flags brand spelling differing from the label, an empty brand, and a near-miss in the title', () => {
    expect(codes(runConsistencyChecks({ title: 'Kalan Ukulele', description: 'Soprano ukulele.', condition: 'USED', brand: 'Kalani', printedText: { brand: 'Kalan' } })))
      .toEqual(expect.arrayContaining(['BRAND_SPELLING', 'BRAND_TITLE_MISMATCH']));
    expect(codes(runConsistencyChecks({ title: 'Jacket', description: 'Rain jacket.', condition: 'USED', brand: '', printedText: { brand: 'Connect IT' } })))
      .toContain('BRAND_MISSING');
    expect(codes(runConsistencyChecks({ title: 'Kalan Ukulele', description: 'x', condition: 'USED', brand: 'Kalan', printedText: { brand: 'Kalan' } })))
      .not.toEqual(expect.arrayContaining(['BRAND_SPELLING']));
  });

  it('blocks automatic publishing on test / do-not-publish markers', () => {
    const a = runConsistencyChecks({ title: 'Brass Lamp [price book test]', description: 'Lamp.', condition: 'USED' });
    expect(a.blockAutoPublish).toBe(true);
    expect(codes(a)).toContain('TEST_MARKER');
    const b = runConsistencyChecks({ title: 'Brass Lamp', description: 'Do not publish. Lamp.', condition: 'USED' });
    expect(b.blockAutoPublish).toBe(true);
    const c = runConsistencyChecks({ title: 'Tested working radio', description: 'Play tested, sounds great.', condition: 'USED' });
    expect(c.blockAutoPublish).toBe(false);
    expect(hasTestMarker('Test item please ignore')).toBe(true);
    expect(hasTestMarker('Tester multimeter')).toBe(false);
  });

  it('flags stray leading numbers or symbols at the start of the description', () => {
    expect(codes(runConsistencyChecks({ title: 'Vase', description: '60. Vintage glass vase.', condition: 'USED' }))).toContain('DESCRIPTION_LEADING_GARBAGE');
    expect(codes(runConsistencyChecks({ title: 'Vase', description: '** Vintage glass vase.', condition: 'USED' }))).toContain('DESCRIPTION_LEADING_GARBAGE');
    expect(codes(runConsistencyChecks({ title: 'Vase', description: '1960s glass vase.', condition: 'USED' }))).not.toContain('DESCRIPTION_LEADING_GARBAGE');
    expect(codes(runConsistencyChecks({ title: 'Vase', description: '"Blue" glass vase.', condition: 'USED' }))).not.toContain('DESCRIPTION_LEADING_GARBAGE');
  });

  it('flags duplicate words in the title', () => {
    expect(codes(runConsistencyChecks({ title: 'Brass Brass Lamp', description: 'Lamp.', condition: 'USED' }))).toContain('TITLE_DUPLICATE_WORD');
    expect(codes(runConsistencyChecks({ title: 'Pyrex Bowl, Pyrex Lid', description: 'Bowl.', condition: 'USED' }))).toContain('TITLE_DUPLICATE_WORD');
    expect(codes(runConsistencyChecks({ title: 'Brass Floor Lamp', description: 'Lamp.', condition: 'USED' }))).not.toContain('TITLE_DUPLICATE_WORD');
  });

  it('never throws on empty input and writes no em dashes or the word AI in messages', () => {
    expect(runConsistencyChecks({})).toEqual({ notes: [], blockAutoPublish: false });
    const r = runConsistencyChecks({ title: 'Lot of 10 [test] Brass Brass', description: '60. Used.', condition: 'NEW', brand: 'Kalani', printedText: { brand: 'Kalan', counts: ['12 pieces'] } });
    for (const n of r.notes) {
      expect(n.message).not.toMatch(/\u2014/);
      expect(n.message).not.toMatch(/\bAI\b/);
    }
  });
});

describe('sale publish readiness honours test markers', () => {
  const READY = { id: 'i1', title: 'Brass Lamp', price: 12, photoUrls: ['https://res.cloudinary.com/x.jpg'], isActive: true };
  it('keeps marked items out of the automatic sale publish', () => {
    expect(itemNotReadyReasons(READY)).toEqual([]);
    expect(itemNotReadyReasons({ ...READY, title: 'Brass Lamp [price book test]' })).toEqual(['TEST_MARKER']);
    expect(itemNotReadyReasons({ ...READY, description: 'Do not publish' })).toEqual(['TEST_MARKER']);
    expect(itemNotReadyReasons({ ...READY, catalogSuggestions: { intakeReview: { notes: [], blockAutoPublish: true } } })).toEqual(['TEST_MARKER']);
  });
});
