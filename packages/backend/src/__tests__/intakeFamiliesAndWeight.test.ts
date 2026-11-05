/**
 * Intake category-family table (required facts, required shots) and packed-weight bounds (2026-11-05).
 * Pure functions; no network, no database.
 */
import {
  CATEGORY_FAMILY_TABLE,
  buildCategoryFactsPrompt,
  detectCategoryFamily,
  findMissingFacts,
  getCategoryFamilySpec,
  isCollectibleFamily,
  weightBoundsFor,
} from '../services/intakeCategoryFamilies';
import { applyWeightBounds, normalizePrintedText, photoNotes, readIntakeReview, storedWeightNote, withIntakeReview, isAutoPublishBlocked } from '../services/intakeReview';

describe('detectCategoryFamily', () => {
  it.each([
    [{ title: 'Fleetwood Mac Rumours Vinyl LP Record', category: 'Music' }, 'VINYL_RECORD'],
    [{ title: 'Rumours', category: 'Music', recordIdentity: { format: 'LP' } }, 'VINYL_RECORD'],
    [{ title: 'Charizard Pokemon Card 4/102', category: 'Toys & Hobbies' }, 'TRADING_CARD'],
    [{ title: 'Lightning Bolt', card: { game: 'MTG' } }, 'TRADING_CARD'],
    [{ title: '1972 Eisenhower Dollar', category: 'Coins & Paper Money' }, 'COIN_CURRENCY'],
    [{ title: 'Amazing Spider-Man #129 Comic Book', category: 'Collectibles' }, 'COMIC'],
    [{ title: 'Samurai Shodown MVS Cart', category: 'Video Games & Consoles' }, 'VIDEO_GAME'],
    [{ title: 'Ping G410 7 Iron Golf Club', category: 'Sporting Goods' }, 'GOLF_CLUB'],
    [{ title: 'The Hobbit Hardcover', category: 'Books & Magazines' }, 'BOOK'],
    [{ title: "Levi's 501 Jeans", category: 'Clothing, Shoes & Accessories' }, 'CLOTHING_SHOES'],
    [{ title: 'Sony Walkman WM-F45', category: 'Consumer Electronics' }, 'ELECTRONICS'],
  ])('%o -> %s', (input, expected) => {
    expect(detectCategoryFamily(input as any)).toBe(expected);
  });

  it('does not mistake accessories and fixtures for the family', () => {
    expect(detectCategoryFamily({ title: 'Record Player Turntable', category: 'Consumer Electronics' })).toBe('ELECTRONICS');
    expect(detectCategoryFamily({ title: 'Coin Purse, Leather', category: 'Clothing, Shoes & Accessories' })).toBe('CLOTHING_SHOES');
    expect(detectCategoryFamily({ title: 'H-Rack Grid Hanger Brackets', category: 'Clothing, Shoes & Accessories' })).toBeNull();
    expect(detectCategoryFamily({ title: 'Folding Card Table', category: 'Home & Garden' })).toBeNull();
    expect(detectCategoryFamily({})).toBeNull();
  });
});

describe('category table lookup', () => {
  it('has required facts and shots for each audited family', () => {
    expect(getCategoryFamilySpec('VINYL_RECORD')!.requiredFacts.map((f) => f.id)).toEqual(['vinyl_grade', 'jacket_grade', 'label_catalog', 'play_tested']);
    expect(getCategoryFamilySpec('VINYL_RECORD')!.requiredShots.map((s) => s.id)).toEqual(['vinyl_disc', 'vinyl_label']);
    expect(getCategoryFamilySpec('TRADING_CARD')!.requiredShots.map((s) => s.id)).toEqual(['card_back']);
    expect(getCategoryFamilySpec('COIN_CURRENCY')!.needsSharpPhotos).toBe(true);
    expect(getCategoryFamilySpec('GOLF_CLUB')!.requiredFacts.map((f) => f.id)).toContain('golf_hand');
    expect(getCategoryFamilySpec('CLOTHING_SHOES')!.requiredFacts.map((f) => f.id)).toEqual(['clothing_size', 'clothing_measurements']);
    expect(getCategoryFamilySpec(null)).toBeNull();
    expect(Object.keys(CATEGORY_FAMILY_TABLE)).toHaveLength(9);
  });

  it('marks collectible families for eBay routing', () => {
    expect(isCollectibleFamily('COMIC')).toBe(true);
    expect(isCollectibleFamily('VIDEO_GAME')).toBe(true);
    expect(isCollectibleFamily('CLOTHING_SHOES')).toBe(false);
    expect(isCollectibleFamily(null)).toBe(false);
  });

  it('builds a pass-1 prompt block that names every family and marks the hint', () => {
    const block = buildCategoryFactsPrompt('GOLF_CLUB');
    expect(block).toContain('Golf club (the photos look like this kind of item)');
    expect(block).toContain('right or left handed');
    expect(block).toContain('separate grade for the vinyl');
    expect(block).not.toMatch(/\u2014/);
  });

  it('finds missing facts from title + description', () => {
    expect(findMissingFacts('GOLF_CLUB', 'Ping 7 Iron', 'Right handed, stiff steel shaft.')).toEqual([]);
    expect(findMissingFacts('GOLF_CLUB', 'Ping 7 Iron', 'Steel shaft.').map((f) => f.id)).toEqual(['golf_hand']);
    expect(findMissingFacts('CLOTHING_SHOES', 'Rain Jacket', 'Blue rain jacket.').map((f) => f.id)).toEqual(['clothing_size', 'clothing_measurements']);
    expect(findMissingFacts('COIN_CURRENCY', '1972 Eisenhower Dollar', 'Copper-nickel clad, 1972-D.').map((f) => f.id)).toEqual([]);
    expect(findMissingFacts('COIN_CURRENCY', '1970s coin', 'A coin.').map((f) => f.id)).toEqual(expect.arrayContaining(['coin_mint']));
    expect(findMissingFacts(null, 'x', 'y')).toEqual([]);
  });
});

describe('photo notes', () => {
  it('uses the verify pass when it ran, and a photo-count floor always', () => {
    const vinylOnePhoto = photoNotes('VINYL_RECORD', { photoCount: 1, verifyStatus: 'failed', missingShots: [], photosUnclear: false });
    expect(vinylOnePhoto.map((n) => n.current)).toEqual(['vinyl_disc', 'vinyl_label']);
    const cardVerified = photoNotes('TRADING_CARD', { photoCount: 3, verifyStatus: 'ran', missingShots: ['card_back'], photosUnclear: false });
    expect(cardVerified.map((n) => n.code)).toEqual(['MISSING_PHOTO']);
    const cardOk = photoNotes('TRADING_CARD', { photoCount: 2, verifyStatus: 'ran', missingShots: [], photosUnclear: false, qualityScores: [0.95, 0.9] });
    expect(cardOk).toEqual([]);
  });
  it('flags a blurry coin from Vision quality or the verify pass, ignoring unknown scores', () => {
    expect(photoNotes('COIN_CURRENCY', { photoCount: 2, verifyStatus: 'ran', missingShots: [], photosUnclear: false, qualityScores: [0.4, 0.9] }).map((n) => n.code)).toEqual(['PHOTO_NOT_SHARP']);
    expect(photoNotes('COIN_CURRENCY', { photoCount: 2, verifyStatus: 'ran', missingShots: [], photosUnclear: true }).map((n) => n.code)).toEqual(['PHOTO_NOT_SHARP']);
    expect(photoNotes('COIN_CURRENCY', { photoCount: 2, verifyStatus: 'ran', missingShots: [], photosUnclear: false, qualityScores: [null, 0] })).toEqual([]);
    expect(photoNotes('BOOK', { photoCount: 1, verifyStatus: 'ran', missingShots: [], photosUnclear: true })).toEqual([]);
  });
});

describe('weight bounds', () => {
  it('per family, scaled for lots', () => {
    expect(weightBoundsFor('COMIC')).toEqual({ min: 3, max: 8 });
    expect(weightBoundsFor('COMIC', 6)).toEqual({ min: 3, max: 48 });
    expect(weightBoundsFor('VINYL_RECORD')).toEqual({ min: 12, max: 24 });
    expect(weightBoundsFor('VINYL_RECORD', 1, { recordFormat: '7in' })).toEqual({ min: 3, max: 10 });
    expect(weightBoundsFor('TRADING_CARD')).toEqual({ min: 1, max: 3 });
    expect(weightBoundsFor('TRADING_CARD', 1, { slabbed: true })).toEqual({ min: 2, max: 8 });
    expect(weightBoundsFor('ELECTRONICS')).toBeNull();
    expect(weightBoundsFor(null)).toBeNull();
  });

  it('clamps an out-of-range estimate and notes it (single comic at 16 oz)', () => {
    const r: any = { title: 'Amazing Spider-Man #129', description: '', condition: 'USED', tags: [], estimatedWeightOz: 16 };
    const out = applyWeightBounds(r, 'COMIC');
    expect(r.estimatedWeightOz).toBe(8);
    expect(out.applied).toMatchObject({ field: 'estimatedWeightOz', from: 16, to: 8, source: 'weight' });
    expect(out.note!.code).toBe('WEIGHT_OUT_OF_RANGE');
    expect(out.note!.message).not.toMatch(/\u2014|\bAI\b/);
  });

  it('raises a too-low estimate to the minimum and leaves in-range values alone', () => {
    const low: any = { title: 'Pink Floyd LP', description: '', condition: 'USED', tags: [], estimatedWeightOz: 4 };
    applyWeightBounds(low, 'VINYL_RECORD');
    expect(low.estimatedWeightOz).toBe(12);
    const ok: any = { title: 'Pink Floyd LP', description: '', condition: 'USED', tags: [], estimatedWeightOz: 18 };
    expect(applyWeightBounds(ok, 'VINYL_RECORD')).toEqual({});
    expect(ok.estimatedWeightOz).toBe(18);
  });

  it('never touches an organizer-set weight', () => {
    const r: any = { title: 'Comic', description: '', condition: 'USED', tags: [], estimatedWeightOz: 16 };
    expect(applyWeightBounds(r, 'COMIC', { organizerWeightSet: true })).toEqual({});
    expect(applyWeightBounds(r, 'COMIC', { userEditedFields: ['packageWeightOz'] })).toEqual({});
    expect(r.estimatedWeightOz).toBe(16);
  });

  it('allows a lot to weigh more', () => {
    const r: any = { title: 'Comic Lot of 6', description: '', condition: 'USED', tags: [], estimatedWeightOz: 30 };
    expect(applyWeightBounds(r, 'COMIC')).toEqual({});
  });

  it('stored-weight note is note-only', () => {
    expect(storedWeightNote('COMIC', 16, 'X-Men #1')!.suggested).toBe(8);
    expect(storedWeightNote('COMIC', 6, 'X-Men #1')).toBeNull();
    expect(storedWeightNote('ELECTRONICS', 999, 'Amp')).toBeNull();
  });
});

describe('persistence helpers', () => {
  const review: any = { version: 1, generatedAt: 'now', family: 'COMIC', blockAutoPublish: true, notes: [], appliedCorrections: [], preferredMarketplaces: ['EBAY'], verifyPass: 'ran' };
  it('keeps other catalogSuggestions keys and reads the review back', () => {
    const existing = { fields: { isbn: { value: '1' } }, cardSuggestion: { conditionCode: 'NM' } };
    const next = withIntakeReview(existing, undefined, review) as any;
    expect(next.fields).toEqual(existing.fields);
    expect(next.cardSuggestion).toEqual(existing.cardSuggestion);
    expect(readIntakeReview(next)).toBe(review);
    expect(isAutoPublishBlocked(next)).toBe(true);
    expect(withIntakeReview(existing, null, review)).toEqual({ intakeReview: review });
    expect(withIntakeReview(existing, undefined, null)).toBeUndefined();
    expect(readIntakeReview(null)).toBeNull();
  });
  it('sanitizes the printedText block', () => {
    expect(normalizePrintedText({ brand: ' Kalan ', counts: ['10 Diskettes', '10 Diskettes', 5], credits: 'Althea Waites' })).toEqual({
      brand: 'Kalan', modelNumbers: [], catalogNumbers: [], credits: ['Althea Waites'], counts: ['10 Diskettes'], other: [],
    });
    expect(normalizePrintedText({ brand: 'null' })).toBeNull();
    expect(normalizePrintedText('x')).toBeNull();
  });
});
