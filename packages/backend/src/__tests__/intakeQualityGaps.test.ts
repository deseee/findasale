/**
 * Intake quality layer gaps found in the 2026-11-05 baseball card re-analyze dry run:
 *   duplicate adjacent title words (fixed, not just flagged), year consistency, lot preservation, set-name preservation,
 *   photo-count logic ("back not photographed" with 2 photos), observability (one log line, skip reasons, usage),
 *   and the multi-photo packed-weight estimate (parse + bounds).
 * axios is mocked (no network, no paid call, no database).
 */
process.env.GOOGLE_VISION_API_KEY = 'test-vision';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
delete process.env.ANTHROPIC_MODEL;

const mockPost = jest.fn();
jest.mock('axios', () => ({ __esModule: true, default: { post: (...a: unknown[]) => mockPost(...a), get: jest.fn() } }));
const mockCeiling = jest.fn(async () => false);
const mockDailyCap = jest.fn(async () => true);
jest.mock('../lib/aiCostTracker', () => ({
  trackAITokens: jest.fn(),
  estimateTokensForRequest: () => 100,
  isAICostCeilingExceeded: () => mockCeiling(),
  trackVisionCall: jest.fn(),
  webDetectionEnabled: () => false,
  isWebDetectionCeilingExceeded: async () => false,
  isWebDetectionDailyCapAvailable: async () => true,
  trackWebDetectionCall: jest.fn(),
  recordApiUsage: jest.fn(),
  ANTHROPIC_COST_PER_M_TOKENS: 1,
  recordAnthropicUsageOrEstimate: jest.fn(async () => undefined),
  isAIDailyCallCapAvailable: () => mockDailyCap(),
  trackAICall: jest.fn(async () => undefined),
}));
jest.mock('../services/imageMatchService', () => ({ findCatalogMatches: jest.fn(async () => null), buildCatalogMatchContext: () => '', isCatalogMatchEnabled: () => false }));
jest.mock('../services/ebayImageSearchService', () => ({ getEbayImageMatch: jest.fn(async () => null), buildEbayMatchContext: () => '' }));
jest.mock('../services/pricingEngine', () => ({ estimatePrice: jest.fn(async () => null) }));
jest.mock('../services/pricingEngine/adapters/discogs', () => ({ isAudioFormatMatch: () => false }));

const {
  dedupeAdjacentWords,
  extractYears,
  yearConsistencyNotes,
  runConsistencyChecks,
  stripPhotoAbsenceClaims,
  hasPhotoAbsenceClaim,
} = require('../services/intakeConsistencyChecks');
const { lotSignal, preserveLotCount, preserveSetNames } = require('../services/intakePreservation');
const { runIntakeQuality, applyDeterministicFixes, photoNotes, intakeQualityLogLine } = require('../services/intakeReview');
const { buildVerifyPrompt, runVerifyPass } = require('../services/intakeVerifyPass');
const { analyzeItemImages, normalizeMultiImagePackageEstimate } = require('../services/cloudAIService');

const answer = (body: unknown, usage = { input_tokens: 4200, output_tokens: 180 }) => ({ data: { content: [{ text: JSON.stringify(body) }], usage } });
const NO_CHANGES = { corrections: [], missingShots: [], photosUnclear: false };

let logSpy: jest.SpyInstance;
let quiet: jest.SpyInstance[] = [];
beforeEach(() => {
  mockPost.mockReset();
  mockCeiling.mockReset().mockResolvedValue(false);
  mockDailyCap.mockReset().mockResolvedValue(true);
  delete process.env.AI_VERIFY_PASS_ENABLED;
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  quiet = (['warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => {
  logSpy.mockRestore();
  quiet.forEach((s) => s.mockRestore());
});

describe('duplicate adjacent title words are fixed deterministically', () => {
  it('removes "Card Card" and keeps real reduplicated names and printed doubles', () => {
    expect(dedupeAdjacentWords('Jeff Cirillo #48 Pinnacle Baseball Card Card')).toEqual({ title: 'Jeff Cirillo #48 Pinnacle Baseball Card', removed: ['Card'] });
    expect(dedupeAdjacentWords('the The Beatles Record').title).toBe('the Beatles Record');
    expect(dedupeAdjacentWords('Duran Duran Rio Vinyl LP').removed).toEqual([]);
    expect(dedupeAdjacentWords('Bora Bora Postcard').removed).toEqual([]);
    expect(dedupeAdjacentWords('Hush Hush Single', ['HUSH HUSH']).removed).toEqual([]); // printed on the item
    expect(dedupeAdjacentWords('Lot of 2 2 Cards').removed).toEqual([]); // numbers are left alone
  });

  it('runIntakeQuality fixes the title when it is not organizer-edited, and only notes it when it is', async () => {
    process.env.AI_VERIFY_PASS_ENABLED = 'false';
    const r1: any = { title: 'Jeff Cirillo #48 Pinnacle Baseball Card Card', description: 'Pinnacle card.', condition: 'USED', tags: [] };
    const review1 = await runIntakeQuality(r1, { imageBase64Array: ['a'], mimeTypes: ['image/jpeg'] });
    expect(r1.title).toBe('Jeff Cirillo #48 Pinnacle Baseball Card');
    expect(review1.appliedCorrections).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'title', source: 'consistency' })]));
    expect(review1.notes.map((n: any) => n.code)).toContain('TITLE_DUPLICATE_FIXED');

    const r2: any = { title: 'Jeff Cirillo Baseball Card Card', description: 'Pinnacle card.', condition: 'USED', tags: [] };
    const review2 = await runIntakeQuality(r2, { imageBase64Array: ['a'], mimeTypes: ['image/jpeg'], userEditedFields: ['title'] });
    expect(r2.title).toBe('Jeff Cirillo Baseball Card Card');
    expect(review2.notes.map((n: any) => n.code)).toContain('TITLE_DUPLICATE_WORD');
  });
});

describe('year consistency', () => {
  it('extracts 4-digit years but not decades, card numbers or serial numbering', () => {
    expect(extractYears('1996 Leaf Gold Rookie #211')).toEqual([1996]);
    expect(extractYears('1990s style, #1997, 12/1999, 2001-02 season')).toEqual([2001]);
    expect(extractYears('copyright 1995 Donruss')).toEqual([1995]);
  });

  it('flags the Jeter case: title 1996, description 1995', () => {
    const notes = yearConsistencyNotes({ title: '1996 Leaf Gold Rookie Derek Jeter #211 Baseball Card', description: '1995 Leaf Gold Rookie card of Derek Jeter.', printedText: { other: ['1996 Leaf'] } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ code: 'YEAR_MISMATCH', severity: 'high', suggested: 1996 });
    expect(notes[0].message).not.toMatch(/\u2014/);
  });

  it('flags a title year the printed text does not show, and stays quiet when all agree', () => {
    expect(yearConsistencyNotes({ title: '1997 Skybox Card', description: 'Skybox card.', detectedPrintedText: '1996 SKYBOX' })[0]).toMatchObject({ code: 'YEAR_NOT_PRINTED' });
    expect(yearConsistencyNotes({ title: '1996 Leaf Jeter', description: '1996 Leaf card.', detectedPrintedText: '1996 Leaf' })).toEqual([]);
    expect(runConsistencyChecks({ title: '1996 Leaf Jeter', description: '1995 Leaf card.' }).notes.map((n: any) => n.code)).toContain('YEAR_MISMATCH');
  });

  it('the verify prompt tells the model to resolve the year from the card or label', () => {
    const prompt = buildVerifyPrompt({ pass1: { title: 't', description: 'd', condition: 'USED', tags: [] }, family: 'TRADING_CARD' }, 2);
    expect(prompt).toMatch(/Years: every year in the title, the description and the tags must be the same year, read from the item itself/);
  });
});

describe('lot preservation', () => {
  it('reads lot signals: Lot, lot of two, set of N, x2, 2x, N cards; never dimensions', () => {
    expect(lotSignal('Lot of two 1997 Pinnacle cards')).toEqual({ isLot: true, count: 2 });
    expect(lotSignal('Jeff Cirillo Baseball Card Lot, 1997 Pinnacle')).toEqual({ isLot: true, count: null });
    expect(lotSignal('Pyrex bowls x3')).toEqual({ isLot: true, count: 3 });
    expect(lotSignal('2x Hot Wheels cars')).toMatchObject({ isLot: true });
    expect(lotSignal('Set of 4 mugs')).toEqual({ isLot: true, count: 4 });
    expect(lotSignal('8x10 photo print')).toEqual({ isLot: false, count: null });
    expect(lotSignal('Jeff Cirillo #48 Pinnacle Baseball Card')).toEqual({ isLot: false, count: null });
  });

  it('keeps the count when re-analyze turns the Cirillo lot into one card', () => {
    const out = preserveLotCount({
      priorTitle: 'Jeff Cirillo Baseball Card Lot, 1997 Pinnacle',
      priorDescription: 'Lot of two 1997 Pinnacle cards',
      title: 'Jeff Cirillo #48 Pinnacle Baseball Card',
      description: 'Jeff Cirillo Pinnacle card.',
    });
    expect(out).toMatchObject({ dropped: true, priorCount: 2, title: 'Lot of 2 Jeff Cirillo #48 Pinnacle Baseball Card', description: 'Jeff Cirillo Pinnacle card. Lot of 2.' });
  });

  it('flags instead of fixing organizer-edited fields, and flags a changed count', () => {
    const locked = preserveLotCount({ priorTitle: 'Lot of 3 Spoons', title: 'Silver Spoon', description: 'Spoon.', locked: { title: true, description: true } });
    expect(locked).toMatchObject({ dropped: true });
    expect(locked.title).toBeUndefined();
    expect(locked.description).toBeUndefined();
    const changed = preserveLotCount({ priorTitle: 'Lot of 3 Spoons', title: 'Lot of 2 Spoons', description: 'Two spoons.' });
    expect(changed).toMatchObject({ countChanged: true, newCount: 2, priorCount: 3 });
    expect(preserveLotCount({ priorTitle: 'Brass Lamp', title: 'Brass Table Lamp', description: 'Lamp.' })).toMatchObject({ dropped: false });
  });

  it('runIntakeQuality applies it end to end and notes when a field is locked', async () => {
    process.env.AI_VERIFY_PASS_ENABLED = 'false';
    const r: any = { title: 'Jeff Cirillo #48 Pinnacle Baseball Card Card', description: 'Jeff Cirillo card.', condition: 'USED', tags: [] };
    const review = await runIntakeQuality(r, {
      imageBase64Array: ['a', 'b'], mimeTypes: [],
      priorTitle: 'Jeff Cirillo Baseball Card Lot, 1997 Pinnacle', priorDescription: 'Lot of two 1997 Pinnacle cards',
      userEditedFields: ['description'],
    });
    expect(r.title).toBe('Lot of 2 Jeff Cirillo #48 Pinnacle Baseball Card');
    expect(r.description).toBe('Jeff Cirillo card.');
    const codes = review.notes.map((n: any) => n.code);
    expect(codes).toEqual(expect.arrayContaining(['TITLE_DUPLICATE_FIXED', 'LOT_COUNT_KEPT', 'LOT_COUNT_DROPPED']));
  });
});

describe('set and subset names are kept (trading cards)', () => {
  it('puts EX2000 back after the brand when the new title dropped it', () => {
    const out = preserveSetNames({
      priorTitle: 'Gregg Jefferies 1997 Skybox EX2000 Baseball Card #88',
      title: '1997 Skybox Gregg Jefferies #88 Baseball Card',
      brand: 'Skybox',
    });
    expect(out.dropped).toEqual(['EX2000']);
    expect(out.title).toBe('1997 Skybox EX2000 Gregg Jefferies #88 Baseball Card');
  });

  it('uses printed text too, matches spacing variants, and leaves a correct title alone', () => {
    expect(preserveSetNames({ printedText: { other: ['PINNACLE XPRESS'] }, title: '1997 Pinnacle Paul O\'Neill #43', brand: 'Pinnacle' }).title).toBe('1997 Pinnacle Xpress Paul O\'Neill #43');
    expect(preserveSetNames({ priorTitle: '1997 Upper Deck ProMotion Bernie Williams', title: '1997 Upper Deck Pro Motion Bernie Williams #26' }).dropped).toEqual([]);
    expect(preserveSetNames({ priorTitle: 'Derek Jeter 1996 Leaf Gold Rookie #211', title: '1996 Leaf Gold Rookie Derek Jeter #211 Baseball Card' }).dropped).toEqual([]);
  });

  it('never fixes a locked title or one that would pass 80 characters', () => {
    const lockedSet = preserveSetNames({ priorTitle: 'Skybox EX2000 Card', title: 'Skybox Card', locked: true });
    expect(lockedSet.dropped).toEqual(['EX2000']);
    expect(lockedSet.title).toBeUndefined();
    const long = 'A'.repeat(76);
    expect(preserveSetNames({ priorTitle: 'Skybox EX2000 Card', title: long }).title).toBeUndefined();
  });

  it('the pass-1 and verify prompts require set and subset names for cards', () => {
    const prompt = buildVerifyPrompt({ pass1: { title: 't', description: 'd', condition: 'USED', tags: [] }, family: 'TRADING_CARD' }, 2);
    expect(prompt).toContain('subset or insert name printed on the card');
  });
});

describe('photo count logic', () => {
  it('drops a "back not photographed" sentence only when the item has 2+ photos', () => {
    expect(hasPhotoAbsenceClaim('Card back not photographed.')).toBe(true);
    expect(hasPhotoAbsenceClaim('Back of card not provided; set name cannot be confirmed.')).toBe(true);
    expect(hasPhotoAbsenceClaim('Sharp corners, clean back.')).toBe(false);
    expect(stripPhotoAbsenceClaims('1997 Skybox card of Gregg Jefferies. Card back not photographed.')).toBe('1997 Skybox card of Gregg Jefferies.');
    expect(stripPhotoAbsenceClaims('Card back not photographed.')).toBeNull(); // nothing would be left

    const two: any = { title: '1997 Skybox EX2000 Gregg Jefferies #88', description: '1997 Skybox card of Gregg Jefferies. Card back not photographed.', condition: 'USED', tags: [] };
    const fixes2 = applyDeterministicFixes(two, { family: 'TRADING_CARD', photoCount: 2 });
    expect(two.description).toBe('1997 Skybox card of Gregg Jefferies.');
    expect(fixes2.notes.map((n: any) => n.code)).toContain('PHOTO_CLAIM_REMOVED');

    const one: any = { ...two, description: '1997 Skybox card. Card back not photographed.' };
    applyDeterministicFixes(one, { family: 'TRADING_CARD', photoCount: 1 });
    expect(one.description).toBe('1997 Skybox card. Card back not photographed.');
  });

  it('a verify "missing back" claim becomes a check note when enough photos exist, a missing note when not', () => {
    const withTwo = photoNotes('TRADING_CARD', { photoCount: 2, verifyStatus: 'ran', missingShots: ['card_back'], photosUnclear: false });
    expect(withTwo.map((n: any) => [n.code, n.severity])).toEqual([['CHECK_PHOTO', 'medium']]);
    const withOne = photoNotes('TRADING_CARD', { photoCount: 1, verifyStatus: 'ran', missingShots: [], photosUnclear: false });
    expect(withOne.map((n: any) => [n.code, n.severity])).toEqual([['MISSING_PHOTO', 'high']]);
  });

  it('the verify prompt states the photo count and what photo 2 usually is', () => {
    const prompt = buildVerifyPrompt({ pass1: { title: 't', description: 'd', condition: 'USED', tags: [] }, family: 'TRADING_CARD', totalPhotoCount: 2 }, 2);
    expect(prompt).toContain('you are given 2 photo(s)');
    expect(prompt).toContain('A second photo is very often the back of the same card');
    expect(prompt).not.toMatch(/\u2014/);
  });
});

describe('observability', () => {
  it('records skip reasons and token usage, and logs one line per item', async () => {
    mockCeiling.mockResolvedValueOnce(true);
    expect(await runVerifyPass({ imageBase64Array: ['a'], mimeTypes: [], pass1: { title: 't', description: 'd', condition: 'USED', tags: [] }, family: null })).toMatchObject({ status: 'gated', skipReason: 'cost ceiling' });
    mockDailyCap.mockResolvedValueOnce(false);
    expect(await runVerifyPass({ imageBase64Array: ['a'], mimeTypes: [], pass1: { title: 't', description: 'd', condition: 'USED', tags: [] }, family: null })).toMatchObject({ status: 'gated', skipReason: 'daily cap' });
    expect(await runVerifyPass({ imageBase64Array: [], mimeTypes: [], pass1: { title: 't', description: 'd', condition: 'USED', tags: [] }, family: null })).toMatchObject({ status: 'not-run', skipReason: 'no images' });

    mockPost.mockResolvedValueOnce(answer({ corrections: [
      { field: 'title', old: '1996', new: '1996 Leaf Gold Rookie Derek Jeter #211 Baseball Card', reason: 'card front', confidence: 0.95 },
      { field: 'tags', new: ['Derek Jeter', 'Leaf'], reason: 'tags', confidence: 0.4 },
    ], missingShots: [], photosUnclear: false }));
    const r: any = { title: '1996 Leaf Gold Rookie Derek Jeter #211', description: '1995 Leaf Gold Rookie card.', condition: 'USED', tags: ['Jeter'] };
    logSpy.mockClear();
    const review = await runIntakeQuality(r, { imageBase64Array: ['a', 'b'], mimeTypes: [], logLabel: 'item=jeter' });
    expect(review.verifyPass).toBe('ran');
    expect(review.verifyUsage).toEqual({ inputTokens: 4200, outputTokens: 180 });
    const lines = logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[intakeQuality]'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[intakeQuality\] item=jeter family=\S+ verify=ran applied=1 noted=1 fixes=0 flags=\d+ tokens=4200\/180/);
    expect(review.notes.map((n: any) => n.code)).toContain('YEAR_MISMATCH');

    process.env.AI_VERIFY_PASS_ENABLED = 'false';
    const disabled = await runIntakeQuality({ title: 'x', description: 'y', condition: 'USED', tags: [] } as any, { imageBase64Array: ['a'], mimeTypes: [] });
    expect(intakeQualityLogLine(disabled, 'item=z')).toContain('verify=skipped(disabled)');
  });
});

describe('multi-photo packed weight', () => {
  it('parse keeps a confident estimate and refuses a low-confidence one', () => {
    expect(normalizeMultiImagePackageEstimate({ estimatedWeightOz: 3, estimatedDimensionsIn: { length: 6, width: 4, height: 1 }, estimatedPackageType: 'PACKAGE_THICK_ENVELOPE', packageConfidence: 0.8 }))
      .toMatchObject({ estimatedWeightOz: 3, packageConfidence: 0.8, estimatedPackageType: 'PACKAGE_THICK_ENVELOPE' });
    expect(normalizeMultiImagePackageEstimate({ estimatedWeightOz: 3, estimatedDimensionsIn: { length: 6, width: 4, height: 1 }, packageConfidence: 0.3 }))
      .toMatchObject({ estimatedWeightOz: undefined, estimatedDimensionsIn: undefined });
    expect(normalizeMultiImagePackageEstimate({ estimatedWeightOz: null, packageConfidence: 0.9 } as any)).toMatchObject({ estimatedWeightOz: undefined });
  });

  it('multi-image prompt asks for the estimate; the result runs through the weight bounds', async () => {
    let calls = 0;
    mockPost.mockImplementation(async (url: string) => {
      if (!String(url).includes('anthropic.com')) throw new Error('vision unavailable in tests');
      calls += 1;
      if (calls === 1) {
        return answer({
          title: '1997 Skybox EX2000 Gregg Jefferies #88 Baseball Card', description: 'Raw card, sharp corners. Card #88.', category: 'Sports Mem, Cards & Fan Shop',
          condition: 'USED', tags: ['Baseball Card'], confidence: 0.9, brand: 'Skybox',
          card: { game: 'OTHER', cardName: 'Gregg Jefferies', setName: 'EX2000' },
          estimatedWeightOz: 16, estimatedDimensionsIn: { length: 6, width: 4, height: 1 }, estimatedPackageType: 'PACKAGE_THICK_ENVELOPE', packageConfidence: 0.7,
        });
      }
      return answer(NO_CHANGES);
    });
    const result = await analyzeItemImages([Buffer.from('a'), Buffer.from('b')], ['image/jpeg', 'image/jpeg'], undefined, undefined, { userEditedFields: [], logLabel: 'item=w' });
    const anthropic = mockPost.mock.calls.filter((c) => String(c[0]).includes('anthropic.com'));
    const pass1Text = anthropic[0][1].messages[0].content.find((c: any) => c.type === 'text').text as string;
    expect(pass1Text).toContain('Shipping package: Estimate the PACKED shipping weight');
    expect(pass1Text).toContain('"packageConfidence"');
    expect(pass1Text).toContain('there are 2 photos');
    expect(pass1Text).toContain('A second photo is very often the back of the same card');
    // A single raw card is 1-3 oz packed: 16 oz is clamped to 3 and noted.
    expect(result.intakeReview.family).toBe('TRADING_CARD');
    expect(result.estimatedWeightOz).toBe(3);
    expect(result.packageConfidence).toBe(0.7);
    expect(result.intakeReview.notes.map((n: any) => n.code)).toContain('WEIGHT_OUT_OF_RANGE');
  });

  it('organizer-set weight: the estimate is not clamped (stored only as the AI estimate by callers)', async () => {
    let calls = 0;
    mockPost.mockImplementation(async (url: string) => {
      if (!String(url).includes('anthropic.com')) throw new Error('vision unavailable in tests');
      calls += 1;
      if (calls === 1) {
        return answer({ title: 'Derek Jeter Baseball Card', description: 'Raw card.', category: 'Sports Mem, Cards & Fan Shop', condition: 'USED', tags: [], confidence: 0.9,
          card: { game: 'OTHER' }, estimatedWeightOz: 16, packageConfidence: 0.9 });
      }
      return answer(NO_CHANGES);
    });
    const result = await analyzeItemImages([Buffer.from('a'), Buffer.from('b')], [], undefined, undefined, { userEditedFields: ['packageWeightOz'], organizerWeightSet: true });
    expect(result.estimatedWeightOz).toBe(16);
    expect(result.intakeReview.notes.map((n: any) => n.code)).not.toContain('WEIGHT_OUT_OF_RANGE');
  });

  it('passes the prior listing into the multi-photo prompt and the verify pass (re-analyze)', async () => {
    let calls = 0;
    mockPost.mockImplementation(async (url: string) => {
      if (!String(url).includes('anthropic.com')) throw new Error('vision unavailable in tests');
      calls += 1;
      if (calls === 1) return answer({ title: 'Jeff Cirillo #48 Pinnacle Baseball Card Card', description: 'Pinnacle card. Back of card not provided; set name cannot be confirmed.', category: 'Sports Mem, Cards & Fan Shop', condition: 'USED', tags: ['Baseball Card'], confidence: 0.9 });
      return answer(NO_CHANGES);
    });
    const result = await analyzeItemImages([Buffer.from('a'), Buffer.from('b')], [], undefined, undefined, {
      priorTitle: 'Jeff Cirillo Baseball Card Lot, 1997 Pinnacle', priorDescription: 'Lot of two 1997 Pinnacle cards', userEditedFields: [],
    });
    const anthropic = mockPost.mock.calls.filter((c) => String(c[0]).includes('anthropic.com'));
    const pass1Text = anthropic[0][1].messages[0].content.find((c: any) => c.type === 'text').text as string;
    const verifyText = anthropic[1][1].messages[0].content.find((c: any) => c.type === 'text').text as string;
    expect(pass1Text).toContain('Earlier listing for this same item: title "Jeff Cirillo Baseball Card Lot, 1997 Pinnacle"');
    expect(verifyText).toContain('lot of two 1997 Pinnacle cards'.replace('lot', 'Lot'));
    expect(result.title).toBe('Lot of 2 Jeff Cirillo #48 Pinnacle Baseball Card');
    expect(result.description).toBe('Pinnacle card. Lot of 2.');
  });
});
