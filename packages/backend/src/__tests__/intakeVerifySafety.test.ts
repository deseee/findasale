/**
 * Verify-pass safety guards (2026-11-08). Replicates the live re-analyze incident on 6 baseball cards:
 *   - description "corrections" that were short fragments replaced the whole description (Jeter, Bernie Williams, Jefferies)
 *   - a correct title spelling ("Paul O'Neill") was overridden by a hallucinated ALL-CAPS one ("Paulo O'NEILL")
 * and keeps the good fixes applying (McGwire "Baseball Mark", "Phumotion" -> "Pro Motion", Cirillo lot).
 * Pure functions plus the recheck service with axios/prisma mocked: no network, no paid call, no database.
 */
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
delete process.env.ANTHROPIC_MODEL;
delete process.env.AI_VERIFY_PASS_ENABLED;

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
  guardDescriptionCorrection,
  guardTitleCorrection,
  spellingChanges,
  buildVerifyPrompt,
} = require('../services/intakeVerifyPass');
const { applyDeterministicFixes } = require('../services/intakeReview');
const { normalizeTitleCaps } = require('../services/titleCaps');
const { normalizeTaggedText } = require('../services/textHomoglyphs');
const { runIntakeRecheck, parseIntakeRecheckParams } = require('../services/intakeRecheckService');

const card = (over: Record<string, unknown> = {}) => ({
  title: '1997 Upper Deck Derek Jeter #123 Baseball Card',
  description: '1997 Upper Deck Derek Jeter #123 baseball card, New York Yankees shortstop. Card shows light wear on the corners and edges; the surface is clean.',
  brand: 'Upper Deck',
  condition: 'USED',
  category: 'Sports Mem, Cards & Fan Shop',
  tags: ['Baseball Card', 'Derek Jeter'],
  ...over,
});
const apply = (r: any, corrections: unknown[], opts: Record<string, unknown> = {}) =>
  applyVerifyCorrections(r, normalizeCorrections(corrections), { threshold: 0.85, ...opts });

let quiet: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  quiet = (['log', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => quiet.forEach((s) => s.mockRestore()));

describe('description corrections are never applied as a fragment', () => {
  it('Jeter: "raw (not graded)" fragment does not wipe the description', () => {
    const r = card();
    const before = r.description;
    const { applied, notes } = apply(r, [{
      field: 'description',
      new: 'Card shows light to moderate wear on corners and edges. The card is raw (not graded).',
      reason: 'Description should explicitly state whether the card is graded or raw',
      confidence: 0.9,
    }]);
    expect(r.description).toContain('Derek Jeter');
    expect(r.description).toContain('1997 Upper Deck');
    // overlaps the existing condition sentence: noted, not replaced or appended
    expect(r.description).toBe(before);
    expect(applied).toEqual([]);
    expect(notes[0]).toMatchObject({ code: 'VERIFY_SUGGESTION', field: 'description' });
  });

  it('Bernie Williams: "1997 Upper Deck Pro Motion insert card" does not replace the description', () => {
    const r = card({
      title: '1997 Upper Deck Bernie Williams Pro Motion Insert Baseball Card',
      description: '1997 Upper Deck Bernie Williams Pro Motion insert baseball card, New York Yankees outfielder. Light corner wear, centering looks good. Raw card, not graded.',
    });
    const before = r.description;
    const { applied, notes } = apply(r, [{ field: 'description', new: '1997 Upper Deck Pro Motion insert card', reason: 'Name the insert set', confidence: 0.92 }]);
    expect(r.description).toBe(before);
    expect(applied).toEqual([]);
    expect(notes[0]).toMatchObject({ code: 'VERIFY_SUGGESTION', field: 'description' });
  });

  it('Jefferies: "Card back is visible in photo 2." is never written into a listing', () => {
    const r = card({
      title: '1997 Score Gregg Jefferies #210 Baseball Card',
      description: '1997 Score Gregg Jefferies #210 baseball card, Philadelphia Phillies. Light edge wear; raw card.',
    });
    const before = r.description;
    const { applied, notes } = apply(r, [{
      field: 'description', new: 'Card back is visible in photo 2.',
      reason: 'The description should acknowledge that the back of the card is shown in photo 2', confidence: 0.95,
    }]);
    expect(r.description).toBe(before);
    expect(applied).toEqual([]);
    expect(notes[0].message).toMatch(/Not changed automatically/);
  });

  it('a short, new, non-conflicting fact is appended as a sentence (nothing removed)', () => {
    const r = card({ description: '1997 Pinnacle Jeff Cirillo #48 baseball card, Milwaukee Brewers third baseman' });
    const { applied } = apply(r, [{ field: 'description', new: 'The card is raw (not graded).', reason: 'state raw or graded', confidence: 0.9 }]);
    expect(r.description).toBe('1997 Pinnacle Jeff Cirillo #48 baseball card, Milwaukee Brewers third baseman. The card is raw (not graded).');
    expect(applied[0]).toMatchObject({ field: 'description', source: 'verify' });
    expect(applied[0].reason).toMatch(/added to the description/);
  });

  it('a full rewrite that keeps the facts still replaces (Phumotion -> Pro Motion in the description)', () => {
    const r = card({
      description: '1997 Upper Deck Bernie Williams Phumotion insert baseball card, New York Yankees outfielder. Light corner wear, raw card.',
    });
    apply(r, [{
      field: 'description',
      new: '1997 Upper Deck Bernie Williams Pro Motion insert baseball card, New York Yankees outfielder. Light corner wear, raw card.',
      reason: 'insert is printed Pro Motion', confidence: 0.93,
    }]);
    expect(r.description).toContain('Pro Motion');
    expect(r.description).toContain('Bernie Williams');
  });

  it('an empty / very short description may be replaced outright', () => {
    expect(guardDescriptionCorrection('Card.', '1997 Pinnacle Jeff Cirillo #48 baseball card.')).toMatchObject({ action: 'replace' });
    expect(guardDescriptionCorrection('', 'Anything longer than ten')).toMatchObject({ action: 'replace' });
  });

  it('a fragment that conflicts on grading or a year is noted', () => {
    const cur = '1997 Pinnacle Jeff Cirillo #48 baseball card, PSA 8 slab, Milwaukee Brewers.';
    expect(guardDescriptionCorrection(cur, 'The card is raw (not graded).')).toMatchObject({ action: 'note' });
    expect(guardDescriptionCorrection('Jeff Cirillo baseball card from the Milwaukee Brewers team set.', 'Printed 1998 on the back.')).toMatchObject({ action: 'note' });
  });

  it('the prompt asks for the COMPLETE description and Title Case titles', () => {
    const prompt = buildVerifyPrompt({ pass1: card(), family: 'TRADING_CARD' }, 2);
    expect(prompt).toMatch(/COMPLETE corrected description/);
    expect(prompt).toMatch(/Never return a fragment/);
    expect(prompt).toMatch(/Title Case/);
  });
});

describe('title corrections', () => {
  const oneill = () => card({ title: "1997 Upper Deck Paul O'Neill Baseball Card", description: "1997 Upper Deck Paul O'Neill baseball card, New York Yankees right fielder. Light wear." });

  it("O'Neill: a hallucinated ALL-CAPS respelling is not applied", () => {
    const r = oneill();
    const { applied, notes } = apply(r, [{ field: 'title', new: "1997 Upper Deck Paulo O'NEILL Baseball Card", reason: "printed as 'Paulo O'NEILL' on the card", confidence: 0.95 }],
      { ocrText: 'UPPER DECK 1997 YANKEES OUTFIELD' });
    expect(r.title).toBe("1997 Upper Deck Paul O'Neill Baseball Card");
    expect(applied).toEqual([]);
    expect(notes[0]).toMatchObject({ code: 'VERIFY_SUGGESTION', field: 'title' });
  });

  it("O'Neill: a respelling without caps still needs the OCR / printed text to show it", () => {
    const r = oneill();
    apply(r, [{ field: 'title', new: "1997 Upper Deck Paulo O'Neill Baseball Card", reason: 'printed', confidence: 0.95 }], { ocrText: 'UPPER DECK 1997' });
    expect(r.title).toBe("1997 Upper Deck Paul O'Neill Baseball Card");
    expect(guardTitleCorrection("Paul O'Neill Card", "Paulo O'Neill Card", '')).toMatch(/does not show the spelling "Paulo"/);
    // printedText from pass 1 counts as evidence
    const r2 = oneill();
    (r2 as any).printedText = { credits: ["PAULO O'NEILL"] };
    apply(r2, [{ field: 'title', new: "1997 Upper Deck Paulo O'Neill Baseball Card", reason: 'printed', confidence: 0.95 }]);
    expect(r2.title).toBe("1997 Upper Deck Paulo O'Neill Baseball Card");
  });

  it('a title correction that drops most of the title is noted', () => {
    const r = oneill();
    apply(r, [{ field: 'title', new: 'Baseball Card Lot', reason: 'x', confidence: 0.99 }]);
    expect(r.title).toBe("1997 Upper Deck Paul O'Neill Baseball Card");
  });

  it('McGwire: "Baseball Mark" -> "Baseball Card BC-9" applies', () => {
    const r = card({ title: '1999 Topps Mark McGwire Baseball Mark' });
    const { applied } = apply(r, [{ field: 'title', new: '1999 Topps Mark McGwire Baseball Card BC-9', reason: 'card number BC-9', confidence: 0.92 }]);
    expect(r.title).toBe('1999 Topps Mark McGwire Baseball Card BC-9');
    expect(applied).toHaveLength(1);
  });

  it('"Phumotion" -> "Pro Motion" applies (not a name respelling)', () => {
    const r = card({ title: '1997 Upper Deck Bernie Williams Phumotion Baseball Card' });
    apply(r, [{ field: 'title', new: '1997 Upper Deck Bernie Williams Pro Motion Baseball Card', reason: 'printed Pro Motion', confidence: 0.9 }]);
    expect(r.title).toBe('1997 Upper Deck Bernie Williams Pro Motion Baseball Card');
  });

  it('Cirillo lot: "Lot of 2 ... 1997 Pinnacle Baseball Cards #48" applies (Card -> Cards is a plural, not a respelling)', () => {
    const r = card({ title: 'Jeff Cirillo #48 Pinnacle Baseball Card' });
    apply(r, [{ field: 'title', new: 'Lot of 2 Jeff Cirillo 1997 Pinnacle Baseball Cards #48', reason: 'two cards shown', confidence: 0.9 }]);
    expect(r.title).toBe('Lot of 2 Jeff Cirillo 1997 Pinnacle Baseball Cards #48');
    expect(spellingChanges('Baseball Card', 'Baseball Cards')).toEqual([]);
  });

  it('EX2000 and other digit codes / acronyms are not treated as capitals', () => {
    const r = card({ title: '1999 Fleer Derek Jeter Baseball Card' });
    apply(r, [{ field: 'title', new: '1999 Fleer EX2000 Derek Jeter Baseball Card MLB', reason: 'subset EX2000', confidence: 0.9 }]);
    expect(r.title).toBe('1999 Fleer EX2000 Derek Jeter Baseball Card MLB');
  });
});

describe('ALL-CAPS normalization of titles', () => {
  it('converts name words, keeps codes, acronyms, sizes and roman numerals', () => {
    expect(normalizeTitleCaps("1997 Upper Deck Paulo O'NEILL Baseball Card")).toBe("1997 Upper Deck Paulo O'Neill Baseball Card");
    expect(normalizeTitleCaps('MARK MCGWIRE 1999 Topps BC-9 EX2000 NFL MLB USA UK LP XL Part II')).toBe('Mark McGwire 1999 Topps BC-9 EX2000 NFL MLB USA UK LP XL Part II');
    expect(normalizeTitleCaps('VINTAGE PYREX Bowl', ['PYREX'])).toBe('Vintage PYREX Bowl');
  });

  it('pass 1 output is normalized (normalizeTaggedText runs on every pass-1 result)', () => {
    const r = normalizeTaggedText({ title: "1997 Upper Deck PAUL O'NEILL EX2000 Card", description: 'PAUL O\'NEILL card' }, 'test');
    expect(r.title).toBe("1997 Upper Deck Paul O'Neill EX2000 Card");
    expect(r.description).toBe("PAUL O'NEILL card"); // descriptions are left as written
  });

  it('the intake fixes normalize caps (also covers the recheck path) but never an organizer-edited title', () => {
    const r: any = card({ title: "1997 Upper Deck PAUL O'NEILL Baseball Card" });
    const { applied, notes } = applyDeterministicFixes(r, { family: 'TRADING_CARD', photoCount: 1 });
    expect(r.title).toBe("1997 Upper Deck Paul O'Neill Baseball Card");
    expect(applied.find((a: any) => a.field === 'title')).toBeTruthy();
    expect(notes.find((n: any) => n.code === 'TITLE_CAPS_FIXED')).toBeTruthy();
    const locked: any = card({ title: "PAUL O'NEILL Card" });
    applyDeterministicFixes(locked, { family: 'TRADING_CARD', photoCount: 1, userEditedFields: ['title'] });
    expect(locked.title).toBe("PAUL O'NEILL Card");
  });
});

describe('inventory recheck (apply=true) uses the same guards', () => {
  const PHOTO = 'https://res.cloudinary.com/demo/image/upload/a.jpg';
  const item = {
    id: 'item-1',
    title: "1997 Upper Deck Paul O'Neill Baseball Card",
    description: '1997 Score Gregg Jefferies #210 baseball card, Philadelphia Phillies. Light edge wear; raw card.',
    brand: 'Upper Deck', condition: 'USED', category: 'Sports Mem, Cards & Fan Shop', tags: ['Baseball Card'], mpn: null,
    photoUrls: [PHOTO, PHOTO], status: 'AVAILABLE', deletedAt: null, userEditedFields: [], catalogSuggestions: {},
    packageWeightOz: null, packageConfirmedByOrganizer: false, ebayOfferId: null, ebayListingId: null,
    updatedAt: new Date('2026-11-01T00:00:00Z'),
  };

  it('a fragment description and an unsupported respelling are not written', async () => {
    mockGet.mockResolvedValue({ data: Buffer.from('img'), headers: { 'content-type': 'image/jpeg' } });
    mockPost.mockResolvedValue({ data: { content: [{ text: JSON.stringify({ corrections: [
      { field: 'description', new: 'Card back is visible in photo 2.', reason: 'back shown', confidence: 0.95 },
      { field: 'title', new: "1997 Upper Deck Paulo O'NEILL Baseball Card", reason: 'printed', confidence: 0.95 },
    ], missingShots: [], photosUnclear: false }) }], usage: { input_tokens: 4000, output_tokens: 200 } } });
    mockPrisma.item.findMany.mockResolvedValue([item]);
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
    const out = await runIntakeRecheck({ ...parseIntakeRecheckParams({}), delayMs: 0, apply: true });
    expect(out.items[0].changes).toEqual({});
    const writes = mockPrisma.item.updateMany.mock.calls.map((c: any) => c[0].data);
    for (const d of writes) {
      expect(d.title).toBeUndefined();
      expect(d.description).toBeUndefined();
    }
    const codes = out.items[0].noteCodes;
    expect(codes.filter((c: string) => c === 'VERIFY_SUGGESTION')).toHaveLength(2);
  });
});
