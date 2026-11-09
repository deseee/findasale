/**
 * Title safety for the verify pass and the inventory recheck (2026-11-08). Replicates the bad changes a live no-save
 * recheck of 212 items proposed, next to the good corrections that must keep applying:
 *   - "Antique Cast Iron Frog Doorstop" -> "Antique Cast Iron Decorative Carving" (core noun replaced)
 *   - "Neo Geo MVS" -> "Mvs", "Amtrol THERM-X-TROL" -> "Therm-X-Trol" (caps normalization on acronyms / trademarks)
 *   - "Storm at Sunup ... Vinyl LP" -> "Lot of 2 Storm at Sunup ..." (lot invented from the photo count)
 *   - McGwire "... Milestone #BC-9" dropped "Baseball Card"
 *   - 51 of 212 items skipped with "photo download failed" (eBay-imported photos on i.ebayimg.com)
 * Pure functions plus the recheck service with axios/prisma mocked: no network, no paid call, no database.
 */
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
delete process.env.ANTHROPIC_MODEL;
delete process.env.AI_VERIFY_PASS_ENABLED;
delete process.env.SAFE_FETCH_ALLOWED_HOSTS;

const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock('axios', () => ({ __esModule: true, default: { post: (...a: unknown[]) => mockPost(...a), get: (...a: unknown[]) => mockGet(...a) } }));
jest.mock('../lib/aiCostTracker', () => ({
  estimateTokensForRequest: () => 100,
  isAICostCeilingExceeded: async () => false,
  isAIDailyCallCapAvailable: async () => true,
  recordAnthropicUsageOrEstimate: jest.fn(async () => undefined),
  trackAICall: jest.fn(async () => undefined),
  computeAnthropicCostUsd: (_m: string, i: number, o: number) => (i * 1 + o * 5) / 1_000_000,
}));
jest.mock('../services/itemMarketplaceStatusService', () => ({
  EXTENSION_PLATFORMS: ['POSHMARK'],
  listedExtensionPlatformsByItemId: () => new Map(),
}));
const mockPrisma: any = {
  item: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn(async () => []) },
};
jest.mock('../lib/prisma', () => ({ __esModule: true, prisma: mockPrisma }));

const {
  applyVerifyCorrections,
  normalizeCorrections,
  guardTitleCorrection,
  guardTitleCorrectionDetailed,
  droppedProductTypes,
} = require('../services/intakeVerifyPass');
const { applyDeterministicFixes } = require('../services/intakeReview');
const { normalizeTitleCaps, isHyphenTrademark } = require('../services/titleCaps');
const { normalizeTaggedText } = require('../services/textHomoglyphs');
const { runIntakeRecheck, parseIntakeRecheckParams } = require('../services/intakeRecheckService');
const { downloadItemPhotos, describePhotoFailures } = require('../utils/itemPhotoDownload');
const { isSafeItemPhotoUrl, isSafeFetchUrl } = require('../utils/safeFetchUrl');

const item = (title: string, over: Record<string, unknown> = {}) => ({
  title,
  description: `${title}. Shows normal wear for its age.`,
  brand: undefined as string | undefined,
  condition: 'USED',
  category: 'Collectibles',
  tags: [] as string[],
  ...over,
});
const fix = (r: any, newTitle: string, opts: Record<string, unknown> = {}, confidence = 0.95) =>
  applyVerifyCorrections(r, normalizeCorrections([{ field: 'title', new: newTitle, reason: 'from the photos', confidence }]), { threshold: 0.85, ...opts });

let quiet: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  quiet = (['log', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => quiet.forEach((s) => s.mockRestore()));

describe('a title correction may not replace the item noun', () => {
  it('Frog Doorstop -> Decorative Carving is noted, not applied', () => {
    const r = item('Antique Cast Iron Frog Doorstop');
    const { applied, notes } = fix(r, 'Antique Cast Iron Decorative Carving');
    expect(r.title).toBe('Antique Cast Iron Frog Doorstop');
    expect(applied).toEqual([]);
    expect(notes[0]).toMatchObject({ code: 'VERIFY_SUGGESTION', field: 'title', suggested: 'Antique Cast Iron Decorative Carving' });
    expect(notes[0].message).toMatch(/Not changed automatically: it replaces "(frog|doorstop)"/);
  });

  it('the same change applies when the printed / OCR text shows the new words', () => {
    const r = item('Antique Cast Iron Frog Doorstop');
    fix(r, 'Antique Cast Iron Decorative Carving', { ocrText: 'DECORATIVE CARVING made in USA' });
    expect(r.title).toBe('Antique Cast Iron Decorative Carving');
  });

  it('swapping 2+ significant words for different ones is noted even outside the head noun', () => {
    expect(guardTitleCorrection('Hand Painted Floral Ceramic Vase With Handles', 'Large Glazed Floral Ceramic Vase With Handles', ''))
      .toMatch(/swaps the words/);
  });

  it.each([
    ['The Smoker You After', 'The Smoker You Drink'],
    ['Are Hits', 'Smash Hits'],
    ['A Blue Point of The', 'A Blue Point of View'],
    ['1999 Topps Mark McGwire Baseball Mark', '1999 Topps Mark McGwire Baseball Card BC-9'],
    ['1997 Upper Deck Bernie Williams Phumotion Baseball Card', '1997 Upper Deck Bernie Williams Promotion Baseball Card'],
    ['1997 Upper Deck Bernie Williams Phumotion Baseball Card', '1997 Upper Deck Bernie Williams Pro Motion Baseball Card'],
  ])('good correction "%s" -> "%s" still applies', (from, to) => {
    const r = item(from);
    const { applied } = fix(r, to);
    expect(r.title).toBe(to);
    expect(applied).toHaveLength(1);
  });
});

describe('product-type words are kept', () => {
  it('McGwire: "... Milestone #BC-9" that lost "Baseball Card" gets it back', () => {
    const r = item('1999 Topps Mark McGwire Baseball Card');
    const { applied, notes } = fix(r, '1999 Topps Mark McGwire Milestone #BC-9');
    expect(r.title).toBe('1999 Topps Mark McGwire Milestone #BC-9 Baseball Card');
    expect(applied[0].reason).toMatch(/kept "Baseball Card"/);
    expect(notes[0].message).toMatch(/Kept "Baseball Card" in the title/);
  });

  it('"Vinyl LP" and "Record" are detected; a moved modifier with the head word kept is fine', () => {
    expect(droppedProductTypes('Storm at Sunup, Gino Vannelli, 1975 Vinyl LP', 'Storm at Sunup Gino Vannelli 1975')).toEqual(['Vinyl LP']);
    expect(droppedProductTypes('Elvis Presley 45 RPM Record', 'Elvis Presley 45 RPM Single')).toEqual(['Record']);
    expect(droppedProductTypes('1990 Fleer Baseball Card', '1990 Fleer Card #12')).toEqual([]);
    expect(droppedProductTypes('Hallmark Postcard', 'Hallmark Card')).toEqual(['Postcard']);
  });

  it('when putting the word back would pass 80 characters the correction is noted', () => {
    const cur = '1999 Topps Mark McGwire Home Run Record Chase Milestone Baseball Card';
    const next = '1999 Topps Mark McGwire Home Run Record Chase Milestone Insert Subset #BC-9 Gold';
    const g = guardTitleCorrectionDetailed(cur, next, { evidence: '' });
    expect(g.ok).toBe(false);
    expect(g.why).toMatch(/drops "Baseball Card"/);
  });
});

describe('"Lot of N" only from the earlier text, never from the photo count', () => {
  it('Storm at Sunup: an invented "Lot of 2" is noted', () => {
    const r = item('Storm at Sunup, Gino Vannelli, 1975 Vinyl LP', { description: 'Gino Vannelli Storm at Sunup, 1975 A&M Records vinyl LP. Sleeve shows ring wear.' });
    const { applied, notes } = fix(r, 'Lot of 2 Storm at Sunup, Gino Vannelli, 1975 Vinyl LP');
    expect(r.title).toBe('Storm at Sunup, Gino Vannelli, 1975 Vinyl LP');
    expect(applied).toEqual([]);
    expect(notes[0].message).toMatch(/adds a lot or count/);
  });

  it('Coin tubes: "Lot of 4" needs the earlier text to say lot / 4', () => {
    const title = 'Coin tubes for Quarters, Dimes, Nickels, and Pennies';
    const next = 'Lot of 4 Coin tubes for Quarters, Dimes, Nickels, and Pennies';
    const r1 = item(title, { description: 'Plastic coin storage tubes for quarters, dimes, nickels and pennies.' });
    fix(r1, next);
    expect(r1.title).toBe(title);

    const r2 = item(title, { description: 'Plastic coin storage tubes.' });
    fix(r2, next, { priorDescription: 'Set of 4 coin tubes, one for each coin size.' });
    expect(r2.title).toBe(next);

    const r3 = item(title, { description: 'Lot of coin tubes.' });
    fix(r3, next);
    expect(r3.title).toBe(next); // a lot without a count: the count may be filled in

    const r4 = item(title, { description: 'Plastic coin storage tubes.' });
    fix(r4, next, { priorTitle: 'Lot of 3 coin tubes' });
    expect(r4.title).toBe(title); // the earlier listing said 3
  });
});

describe('caps normalization only touches words the model newly put in caps', () => {
  it('Neo Geo MVS and THERM-X-TROL already in the title stay as they are (recheck deterministic fix)', () => {
    const r: any = item('World Heroes Neo Geo MVS Arcade Cartridge');
    applyDeterministicFixes(r, { family: null, photoCount: 2, priorTitle: 'World Heroes Neo Geo MVS Arcade Cartridge' });
    expect(r.title).toBe('World Heroes Neo Geo MVS Arcade Cartridge');
    const t: any = item('Amtrol THERM-X-TROL Expansion Tank', { brand: 'Amtrol' });
    applyDeterministicFixes(t, { family: null, photoCount: 1, priorTitle: 'Amtrol THERM-X-TROL Expansion Tank' });
    expect(t.title).toBe('Amtrol THERM-X-TROL Expansion Tank');
  });

  it('short acronyms and hyphen trademarks are kept even with no earlier title (fresh intake)', () => {
    expect(normalizeTitleCaps('World Heroes Neo Geo MVS Arcade Cartridge SNK')).toBe('World Heroes Neo Geo MVS Arcade Cartridge SNK');
    expect(normalizeTitleCaps('Amtrol THERM-X-TROL Expansion Tank')).toBe('Amtrol THERM-X-TROL Expansion Tank');
    expect(normalizeTitleCaps('BCW Card Sleeves NES Cartridge LED USB CD DVD VHS')).toBe('BCW Card Sleeves NES Cartridge LED USB CD DVD VHS');
    expect(isHyphenTrademark('THERM-X-TROL')).toBe(true);
    expect(isHyphenTrademark('JEAN-PAUL')).toBe(false);
    expect(normalizeTaggedText({ title: 'World Heroes Neo Geo MVS Cartridge', description: 'x' }, 'test').title).toBe('World Heroes Neo Geo MVS Cartridge');
  });

  it("a verify correction keeps MVS / THERM-X-TROL and still converts a new O'NEILL / MCGWIRE", () => {
    const r = item('World Heroes Neo Geo MVS Cartridge');
    fix(r, 'World Heroes 2 Neo Geo MVS Arcade Cartridge');
    expect(r.title).toBe('World Heroes 2 Neo Geo MVS Arcade Cartridge');
    const t = item('Amtrol THERM-X-TROL Tank', { brand: 'Amtrol' });
    fix(t, 'Amtrol THERM-X-TROL ST-5 Expansion Tank');
    expect(t.title).toBe('Amtrol THERM-X-TROL ST-5 Expansion Tank');
    expect(normalizeTitleCaps("1997 Upper Deck Paul O'NEILL Baseball Card", [], { priorText: ["1997 Upper Deck Paul O'Neill Baseball Card"] }))
      .toBe("1997 Upper Deck Paul O'Neill Baseball Card");
    expect(normalizeTitleCaps('1999 Topps Mark MCGWIRE Card')).toBe('1999 Topps Mark McGwire Card');
  });

  it('a 5+ letter word already in caps in the earlier title is left alone; printed caps do not protect a name', () => {
    expect(normalizeTitleCaps('PYREX Mixing Bowl', [], { priorText: ['PYREX Mixing Bowl'] })).toBe('PYREX Mixing Bowl');
    expect(normalizeTitleCaps("Paul O'NEILL Card", [], { printedText: ["PAUL O'NEILL YANKEES"] })).toBe("Paul O'Neill Card");
    // a short word printed in caps stays even next to a converted name
    expect(normalizeTitleCaps('MARK MCGWIRE Card', [], { printedText: ['MARK MCGWIRE'] })).toBe('MARK McGwire Card');
  });

  it("intake fix keeps O'Neill working without a prior title", () => {
    const r: any = item("1997 Upper Deck PAUL O'NEILL Baseball Card");
    applyDeterministicFixes(r, { family: 'TRADING_CARD', photoCount: 1 });
    expect(r.title).toBe("1997 Upper Deck Paul O'Neill Baseball Card");
  });
});

describe('photo download (recheck and re-analyze share one routine)', () => {
  const EBAY = 'https://i.ebayimg.com/images/g/abcAAOSw123/s-l1600.jpg';
  const CLOUD = 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg';

  it('eBay picture CDN photos (eBay-imported items) are allowed; internal hosts and http are not', () => {
    expect(isSafeItemPhotoUrl(EBAY)).toBe(true);
    expect(isSafeFetchUrl(EBAY)).toBe(false); // the general guard is unchanged
    expect(isSafeItemPhotoUrl('http://i.ebayimg.com/x.jpg')).toBe(false);
    expect(isSafeItemPhotoUrl('https://169.254.169.254/latest')).toBe(false);
    expect(isSafeItemPhotoUrl('https://evil.i.ebayimg.com.attacker.net/x.jpg')).toBe(false);
  });

  it('downloads trimmed URLs, never follows redirects, and reports why a URL failed', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url.includes('missing')) throw Object.assign(new Error('Request failed'), { response: { status: 404 } });
      return { data: Buffer.from('img'), headers: { 'content-type': 'image/webp' } };
    });
    const d = await downloadItemPhotos([` ${EBAY} `, 'https://res.cloudinary.com/demo/missing.jpg', 'https://internal.example/a.jpg']);
    expect(d.buffers).toHaveLength(1);
    expect(d.mimeTypes).toEqual(['image/webp']);
    expect(mockGet.mock.calls[0][0]).toBe(EBAY);
    expect(mockGet.mock.calls[0][1]).toEqual(expect.objectContaining({ maxRedirects: 0, responseType: 'arraybuffer' }));
    expect(describePhotoFailures(d.failures)).toBe('http 404 (res.cloudinary.com), host not allowed (internal.example)');
  });

  const recheckItem = (photoUrls: string[]) => ({
    id: 'item-ebay', title: 'Antique Cast Iron Frog Doorstop', description: 'Antique cast iron frog doorstop, painted green. Paint loss on the back.',
    brand: null, condition: 'USED', category: 'Antiques', tags: ['Doorstop'], mpn: null,
    photoUrls, status: 'AVAILABLE', deletedAt: null, userEditedFields: [], catalogSuggestions: {},
    packageWeightOz: null, packageConfirmedByOrganizer: false, ebayOfferId: 'o1', ebayListingId: '123', updatedAt: new Date('2026-11-01T00:00:00Z'),
  });

  it('recheck reads an eBay-imported item photo and the noun-replacing title stays a note (apply=false)', async () => {
    mockGet.mockResolvedValue({ data: Buffer.from('img'), headers: { 'content-type': 'image/jpeg' } });
    mockPost.mockResolvedValue({ data: { content: [{ text: JSON.stringify({ corrections: [
      { field: 'title', new: 'Antique Cast Iron Decorative Carving', reason: 'carving', confidence: 0.95 },
    ], missingShots: [], photosUnclear: false }) }], usage: { input_tokens: 3000, output_tokens: 100 } } });
    mockPrisma.item.findMany.mockResolvedValue([recheckItem([EBAY])]);
    const out = await runIntakeRecheck({ ...parseIntakeRecheckParams({}), delayMs: 0 });
    expect(mockGet).toHaveBeenCalledWith(EBAY, expect.objectContaining({ maxRedirects: 0 }));
    expect(out.items[0].status).toBe('no-change');
    expect(out.items[0].changes).toEqual({});
    expect(out.items[0].noteCodes).toContain('VERIFY_SUGGESTION');
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('when no photo is readable the skip reason says why', async () => {
    mockPrisma.item.findMany.mockResolvedValue([recheckItem(['https://internal.example/a.jpg', 'http://res.cloudinary.com/x.jpg'])]);
    const out = await runIntakeRecheck({ ...parseIntakeRecheckParams({}), delayMs: 0 });
    expect(out.items[0]).toMatchObject({ status: 'skipped' });
    expect(out.items[0].reason).toBe('photo download failed: host not allowed (internal.example), host not allowed (res.cloudinary.com)');
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });
});
