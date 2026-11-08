/**
 * POST /api/internal/intake-recheck service (2026-11-05): dry-run vs apply, organizer-edited fields respected, SOLD items
 * skipped, price never touched, no marketplace push, cost ceiling stops the run, and parameter validation.
 * axios (photo download + Haiku verify call) and prisma are mocked: no network, no paid call, no database.
 */
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
delete process.env.ANTHROPIC_MODEL;
delete process.env.AI_VERIFY_PASS_ENABLED;

const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock('axios', () => ({ __esModule: true, default: { post: (...a: unknown[]) => mockPost(...a), get: (...a: unknown[]) => mockGet(...a) } }));
const mockCeiling = jest.fn(async () => false);
jest.mock('../lib/aiCostTracker', () => ({
  estimateTokensForRequest: () => 100,
  isAICostCeilingExceeded: () => mockCeiling(),
  isAIDailyCallCapAvailable: async () => true,
  recordAnthropicUsageOrEstimate: jest.fn(async () => undefined),
  trackAICall: jest.fn(async () => undefined),
  computeAnthropicCostUsd: (_m: string, i: number, o: number) => (i * 1 + o * 5) / 1_000_000,
}));
jest.mock('../services/itemMarketplaceStatusService', () => ({
  EXTENSION_PLATFORMS: ['POSHMARK'],
  listedExtensionPlatformsByItemId: (rows: Array<{ itemId: string; platform: string }>) => {
    const m = new Map<string, Set<string>>();
    for (const r of rows) m.set(r.itemId, new Set([...(m.get(r.itemId) ?? []), r.platform]));
    return m;
  },
}));
const mockPrisma: any = {
  item: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn(async () => []) },
};
jest.mock('../lib/prisma', () => ({ __esModule: true, prisma: mockPrisma }));

const { runIntakeRecheck, parseIntakeRecheckParams, IntakeRecheckParamError, estimateRecheckCostUsd } = require('../services/intakeRecheckService');

const PHOTO = 'https://res.cloudinary.com/demo/image/upload/a.jpg';
const baseItem = (over: Record<string, unknown> = {}) => ({
  id: 'item-1',
  title: 'Jeff Cirillo #48 Pinnacle Baseball Card Card',
  description: '1997 Pinnacle card of Jeff Cirillo. Back of card not provided; set name cannot be confirmed.',
  brand: 'Pinnacle',
  condition: 'USED',
  category: 'Sports Mem, Cards & Fan Shop',
  tags: ['Baseball Card'],
  mpn: null,
  photoUrls: [PHOTO, PHOTO],
  status: 'AVAILABLE',
  deletedAt: null,
  userEditedFields: [],
  catalogSuggestions: { cardSuggestion: { keep: true } },
  packageWeightOz: null,
  packageConfirmedByOrganizer: false,
  ebayOfferId: null,
  ebayListingId: null,
  updatedAt: new Date('2026-11-01T00:00:00Z'),
  ...over,
});
const verifyAnswer = (body: unknown) => ({ data: { content: [{ text: JSON.stringify(body) }], usage: { input_tokens: 4000, output_tokens: 200 } } });
const params = (over: Record<string, unknown> = {}) => ({ ...parseIntakeRecheckParams({}), delayMs: 0, ...over });

let quiet: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  mockCeiling.mockReset().mockResolvedValue(false);
  mockGet.mockResolvedValue({ data: Buffer.from('img'), headers: { 'content-type': 'image/jpeg' } });
  mockPost.mockResolvedValue(verifyAnswer({ corrections: [
    { field: 'condition', old: 'USED', new: 'NEW', reason: 'sealed sleeve', confidence: 0.95 },
    { field: 'brand', old: 'Pinnacle', new: 'Pinnacle Brands', reason: 'maybe', confidence: 0.5 },
  ], missingShots: [], photosUnclear: false }));
  mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([]);
  quiet = (['log', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => quiet.forEach((s) => s.mockRestore()));

describe('parameters', () => {
  it('defaults: limit 25, apply false, live unsold statuses; limit capped at 100', () => {
    expect(parseIntakeRecheckParams({})).toMatchObject({ limit: 25, apply: false, statuses: ['AVAILABLE', 'RESERVED'], delayMs: 750 });
    expect(parseIntakeRecheckParams({ limit: 500 }).limit).toBe(100);
    expect(parseIntakeRecheckParams({ apply: 'true' }).apply).toBe(false); // only a real boolean true applies
  });
  it('refuses SOLD / DONATED statuses and bad shapes', () => {
    expect(() => parseIntakeRecheckParams({ statuses: ['SOLD'] })).toThrow(IntakeRecheckParamError);
    expect(() => parseIntakeRecheckParams({ statuses: ['AVAILABLE', 'DONATED'] })).toThrow(/not allowed/);
    expect(() => parseIntakeRecheckParams({ itemIds: 'abc' })).toThrow(IntakeRecheckParamError);
  });
});

describe('runIntakeRecheck', () => {
  it('queries only non-deleted, non-SOLD items with the requested scope', async () => {
    mockPrisma.item.findMany.mockResolvedValue([]);
    await runIntakeRecheck(params({ organizerId: 'org-1', limit: 10 }));
    const arg = mockPrisma.item.findMany.mock.calls[0][0];
    expect(arg.where.deletedAt).toBeNull();
    expect(arg.where.status).toEqual({ in: ['AVAILABLE', 'RESERVED'], notIn: ['SOLD', 'DONATED'] });
    expect(arg.where.OR).toEqual([{ organizerId: 'org-1' }, { sale: { organizerId: 'org-1' } }]);
    expect(arg.take).toBe(10);
    expect(arg.select.price).toBeUndefined(); // price is not even read
  });

  it('dry run: reports what it would change, writes nothing, never re-runs pass 1', async () => {
    mockPrisma.item.findMany.mockResolvedValue([baseItem()]);
    const out = await runIntakeRecheck(params());
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledTimes(1); // the verify pass only
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    const s = out.items[0];
    expect(s.status).toBe('would-change');
    expect(s.changes.title).toEqual({ from: 'Jeff Cirillo #48 Pinnacle Baseball Card Card', to: 'Jeff Cirillo #48 Pinnacle Baseball Card' });
    expect(s.changes.condition).toEqual({ from: 'USED', to: 'NEW' });
    expect(s.changes.description.to).toBe('1997 Pinnacle card of Jeff Cirillo.');
    expect(s.changes.brand).toBeUndefined(); // low confidence: note only
    expect(s.noteCodes).toContain('VERIFY_SUGGESTION');
    expect(s.costUsd).toBeCloseTo((4000 + 200 * 5) / 1e6, 8);
    expect(out.marketplaceSync).toBe('none');
    expect(out.totals).toMatchObject({ considered: 1, checked: 1, changed: 1, applied: 0, verifyRan: 1 });
  });

  it('apply: writes only allowed, non-organizer fields plus the notes; never price; no marketplace push', async () => {
    mockPrisma.item.findMany.mockResolvedValue([baseItem({ userEditedFields: ['condition'] })]);
    const out = await runIntakeRecheck(params({ apply: true }));
    expect(mockPrisma.item.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = mockPrisma.item.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({ id: 'item-1', deletedAt: null, status: { notIn: ['SOLD', 'DONATED'] } });
    expect(where.updatedAt).toEqual(new Date('2026-11-01T00:00:00Z')); // optimistic lock
    expect(Object.keys(data).sort()).toEqual(['catalogSuggestions', 'description', 'title']);
    expect(data.condition).toBeUndefined(); // organizer-edited: left alone
    for (const k of ['price', 'aiSuggestedPrice', 'packageWeightOz', 'aiPackageWeightOz']) expect(data[k]).toBeUndefined();
    expect(data.catalogSuggestions.cardSuggestion).toEqual({ keep: true });
    expect(data.catalogSuggestions.intakeReview.verifyPass).toBe('ran');
    expect(out.items[0]).toMatchObject({ status: 'applied', protectedFields: [] });
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
    // only the Haiku verify call went out: no eBay / marketplace request of any kind
    expect(mockPost.mock.calls.every((c) => String(c[0]).startsWith('https://api.anthropic.com/'))).toBe(true);
  });

  it('apply on an eBay-listed item marks the local edit (ebayContentDirtyAt) and reports where it is listed', async () => {
    mockPrisma.item.findMany.mockResolvedValue([baseItem({ ebayOfferId: 'offer-9' })]);
    mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([{ itemId: 'item-1', platform: 'POSHMARK', action: 'POST', status: 'POSTED', createdAt: new Date() }]);
    const out = await runIntakeRecheck(params({ apply: true }));
    const { data } = mockPrisma.item.updateMany.mock.calls[0][0];
    expect(data.ebayContentDirtyAt).toBeInstanceOf(Date);
    expect(out.items[0]).toMatchObject({ ebayContentMarkedDirty: true, listedOn: { ebay: true, extension: ['POSHMARK'] } });
  });

  it('SOLD items are skipped even when asked for by id; nothing is fetched or written for them', async () => {
    mockPrisma.item.findMany.mockResolvedValue([]); // the query excludes SOLD
    const out = await runIntakeRecheck(params({ itemIds: ['sold-1'], apply: true }));
    expect(out.items).toEqual([expect.objectContaining({ itemId: 'sold-1', status: 'skipped' })]);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();

    // Belt and braces: a SOLD row that somehow comes back is still skipped.
    mockPrisma.item.findMany.mockResolvedValue([baseItem({ id: 'sold-2', status: 'SOLD' })]);
    const out2 = await runIntakeRecheck(params({ apply: true }));
    expect(out2.items[0]).toMatchObject({ itemId: 'sold-2', status: 'skipped' });
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('an item edited or sold during the run is not written (optimistic lock)', async () => {
    mockPrisma.item.findMany.mockResolvedValue([baseItem()]);
    mockPrisma.item.updateMany.mockResolvedValue({ count: 0 });
    const out = await runIntakeRecheck(params({ apply: true }));
    expect(out.items[0]).toMatchObject({ status: 'skipped', changes: {} });
  });

  it('stops at the cost ceiling and skips the rest without calling the API', async () => {
    mockPrisma.item.findMany.mockResolvedValue([baseItem({ id: 'a' }), baseItem({ id: 'b' }), baseItem({ id: 'c' })]);
    mockCeiling.mockResolvedValueOnce(false).mockResolvedValue(true);
    const out = await runIntakeRecheck(params());
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(out.items.map((i: any) => i.status)).toEqual(['would-change', 'would-change', 'skipped']);
    expect(out.items[1].verifyPass).toBe('gated');
    expect(out.stoppedEarly).toMatch(/cost ceiling/);
  });

  it('items without photos are skipped; organizer weight is never changed; stored weight only noted', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      baseItem({ id: 'nophoto', photoUrls: [] }),
      baseItem({ id: 'heavy', packageWeightOz: 40 }),
    ]);
    const out = await runIntakeRecheck(params({ apply: true }));
    expect(out.items[0]).toMatchObject({ itemId: 'nophoto', status: 'skipped', reason: 'no photos' });
    expect(out.items[1].noteCodes).toContain('WEIGHT_OUT_OF_RANGE');
    const { data } = mockPrisma.item.updateMany.mock.calls[0][0];
    expect(data.packageWeightOz).toBeUndefined();
  });

  it('per-item cost estimate stays around a cent for 4 photos on Haiku', () => {
    process.env.AI_VERIFY_MAX_IMAGES = '4';
    const four = estimateRecheckCostUsd(4);
    expect(four).toBeCloseTo((4 * 1600 + 1400 + 400 * 5) / 1e6, 8);
    delete process.env.AI_VERIFY_MAX_IMAGES;
  });
});
