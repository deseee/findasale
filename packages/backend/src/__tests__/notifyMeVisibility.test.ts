/**
 * Notify Me sender: an alert only ever surfaces items/sales a signed-out shopper could see.
 *
 * Prisma is mocked with a tiny in-memory evaluator of the real `where` objects the service builds, run
 * over fixture rows. So these tests exercise the actual filters (PUBLIC_ITEM_FILTER,
 * notEmbargoedForPublicWhere, sale publish/visibility rules), not hand-picked mock returns.
 * No DB, no email (dry run, send is mocked and asserted unused), no network.
 */
const mockSearch = { findMany: jest.fn(), updateMany: jest.fn() };
const mockWait = { findMany: jest.fn(), updateMany: jest.fn() };
const mockItem = { findMany: jest.fn() };
const mockSale = { findMany: jest.fn() };
const mockSend = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: { searchNotification: mockSearch, shopperWaitlistEntry: mockWait, item: mockItem, sale: mockSale },
}));
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: (...a: any[]) => mockSend(...a) } },
}));
jest.mock('../services/suppressionService', () => ({
  suppressionService: { isSuppressed: async () => false },
  isEmailDomainBlocked: () => false,
}));

import { runNotifyMeSender, buildItemWhere, NotifyTarget } from '../services/notifyMeSenderService';

// ---------------------------------------------------------------------------------------------
// Minimal Prisma where evaluator (SQL null semantics: comparisons / not / notIn against NULL are false)
// ---------------------------------------------------------------------------------------------
const OPS = new Set(['equals', 'not', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'contains', 'mode']);
const isPlain = (v: any) => v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v);
const val = (v: any) => (v instanceof Date ? v.getTime() : v);

function fieldMatches(actual: any, cond: any): boolean {
  if (cond === null) return actual == null;
  if (!isPlain(cond)) return actual != null && val(actual) === val(cond);
  return Object.entries(cond).every(([op, arg]) => {
    if (op === 'mode') return true;
    if (op === 'not') return isPlain(arg) ? !fieldMatches(actual, arg) : actual != null && val(actual) !== val(arg);
    if (actual == null) return op === 'equals' && arg === null;
    switch (op) {
      case 'equals': return val(actual) === val(arg);
      case 'in': return (arg as any[]).map(val).includes(val(actual));
      case 'notIn': return !(arg as any[]).map(val).includes(val(actual));
      case 'gt': return val(actual) > val(arg);
      case 'gte': return val(actual) >= val(arg);
      case 'lt': return val(actual) < val(arg);
      case 'lte': return val(actual) <= val(arg);
      case 'contains':
        return cond.mode === 'insensitive'
          ? String(actual).toLowerCase().includes(String(arg).toLowerCase())
          : String(actual).includes(String(arg));
      default: throw new Error(`evaluator: unsupported operator ${op}`);
    }
  });
}

function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'AND') return (Array.isArray(cond) ? cond : [cond]).every((c: any) => matches(row, c));
    if (k === 'OR') return (cond as any[]).some((c) => matches(row, c));
    if (k === 'NOT') return (Array.isArray(cond) ? cond : [cond]).every((c: any) => !matches(row, c));
    const actual = row[k];
    // Relation filter (e.g. item.sale): nested where, not an operator object.
    if (isPlain(cond) && !Object.keys(cond as object).every((o) => OPS.has(o))) return actual != null && matches(actual, cond);
    return fieldMatches(actual, cond);
  });
}

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------
const NOW = new Date('2026-10-13T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600000);
const ARMED = new Date('2026-10-01T00:00:00Z');

const publicSale = {
  title: 'Maple Street Sale', city: 'Kalamazoo', state: 'MI', description: '',
  status: 'PUBLISHED', deletedAt: null, isInventoryContainer: false,
  isOngoing: false, endDate: new Date('2026-10-20T00:00:00Z'), publishedAt: new Date('2026-10-02T00:00:00Z'),
};

function item(id: string, over: Record<string, any> = {}, saleOver: Record<string, any> = {}) {
  return {
    id, title: 'Brass lamp', description: 'Vintage brass table lamp', category: 'Lighting', price: 25,
    status: 'AVAILABLE', isActive: true, draftStatus: 'PUBLISHED', moderationStatus: 'APPROVED', listingType: 'FIXED',
    rarity: 'COMMON', earlyAccessUntil: null, isLegendary: false, legendaryVisibleAt: null,
    createdAt: hoursAgo(48),
    sale: { ...publicSale, ...saleOver },
    ...over,
  };
}

const PUBLIC = item('public');
const EXCLUDED: Record<string, any> = {
  earlyAccessUntilFuture: item('earlyAccess', { earlyAccessUntil: new Date(NOW.getTime() + 24 * 3600000) }),
  legendaryRarityUnder12h: item('legendary2h', { rarity: 'LEGENDARY', createdAt: hoursAgo(2) }),
  rareRarityUnder6h: item('rare3h', { rarity: 'RARE', createdAt: hoursAgo(3) }),
  legendaryNotYetVisible: item('legendaryFlag', { isLegendary: true, legendaryVisibleAt: new Date(NOW.getTime() + 4 * 3600000) }),
  draftSale: item('draftSale', {}, { status: 'DRAFT' }),
  saleNotYetPublished: item('earlySale', {}, { publishedAt: new Date(NOW.getTime() + 24 * 3600000) }),
  deletedSale: item('deletedSale', {}, { deletedAt: hoursAgo(1) }),
  endedSale: item('endedSale', {}, { endDate: hoursAgo(24) }),
  draftItem: item('draftItem', { draftStatus: 'DRAFT' }),
  pendingReviewItem: item('pendingReview', { draftStatus: 'PENDING_REVIEW' }),
  hiddenItem: item('hidden', { isActive: false }),
  soldItem: item('sold', { status: 'SOLD' }),
  graceLockedItem: item('graceLocked', { status: 'GRACE_LOCKED' }),
  consignorTagItem: item('consignorTag', { listingType: 'CONSIGNOR_TAG' }),
  rejectedItem: item('rejected', { moderationStatus: 'REJECTED' }),
};

let itemRows: any[] = [];
let saleRows: any[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NOTIFY_ME_SENDER_ENABLED = 'true';
  process.env.NOTIFY_ME_DRY_RUN = 'true';
  mockSearch.findMany.mockImplementation(async (a: any) =>
    a?.where?.notifiedAt === null
      ? [{ id: 'n1', email: 'shopper@example.com', searchQuery: 'brass lamp', city: null, createdAt: ARMED, armedAt: ARMED, confirmedAt: ARMED }]
      : []
  );
  mockWait.findMany.mockResolvedValue([]);
  mockSearch.updateMany.mockResolvedValue({ count: 0 });
  mockWait.updateMany.mockResolvedValue({ count: 0 });
  mockItem.findMany.mockImplementation(async (a: any) => itemRows.filter((r) => matches(r, a.where)));
  mockSale.findMany.mockImplementation(async (a: any) => saleRows.filter((r) => matches(r, a.where)));
  itemRows = [];
  saleRows = [];
});

afterAll(() => {
  delete process.env.NOTIFY_ME_SENDER_ENABLED;
  delete process.env.NOTIFY_ME_DRY_RUN;
});

describe('Notify Me matching respects public visibility (dry run)', () => {
  it('a published, publicly visible matching item produces wouldEmail = 1 and nothing is claimed or sent', async () => {
    itemRows = [PUBLIC];
    const r = await runNotifyMeSender(NOW);
    expect(r.dryRun).toBe(true);
    expect(r.aborted).toBeNull();
    expect(r.wouldEmail).toBe(1);
    expect(r.emailed).toBe(0);
    expect(r.skippedNoMatch).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockSearch.updateMany).not.toHaveBeenCalled();
  });

  it.each(Object.keys(EXCLUDED))('%s does not match (wouldEmail = 0)', async (key) => {
    itemRows = [EXCLUDED[key]];
    const r = await runNotifyMeSender(NOW);
    expect(r.wouldEmail).toBe(0);
    expect(r.skippedNoMatch).toBe(1);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('with every fixture present, only the public item is returned by the item query', async () => {
    itemRows = [PUBLIC, ...Object.values(EXCLUDED)];
    const r = await runNotifyMeSender(NOW);
    expect(r.wouldEmail).toBe(1);
    const returned = await mockItem.findMany.mock.results[0].value;
    expect(returned.map((i: any) => i.id)).toEqual(['public']);
  });

  it('embargoes lift on schedule: the same rarity items match once their window has passed', async () => {
    itemRows = [
      item('legendary13h', { rarity: 'LEGENDARY', createdAt: hoursAgo(13) }),
      item('rare7h', { rarity: 'RARE', createdAt: hoursAgo(7) }),
      item('earlyAccessOver', { earlyAccessUntil: hoursAgo(1) }),
      item('legendaryVisibleNow', { isLegendary: true, legendaryVisibleAt: hoursAgo(1) }),
    ];
    const r = await runNotifyMeSender(NOW);
    expect(r.wouldEmail).toBe(1);
    const returned = await mockItem.findMany.mock.results[0].value;
    expect(returned.map((i: any) => i.id).sort()).toEqual(['earlyAccessOver', 'legendary13h', 'legendaryVisibleNow', 'rare7h']);
  });

  it('a sale-level match only counts when the sale is published and publicly open', async () => {
    const saleMatch = { ...publicSale, id: 's1', title: 'Brass lamp collection sale', createdAt: hoursAgo(24) };
    saleRows = [
      { ...saleMatch, id: 'draft', status: 'DRAFT' },
      { ...saleMatch, id: 'notYet', publishedAt: new Date(NOW.getTime() + 3600000) },
      { ...saleMatch, id: 'container', isInventoryContainer: true },
    ];
    let r = await runNotifyMeSender(NOW);
    expect(r.wouldEmail).toBe(0);

    saleRows.push(saleMatch);
    r = await runNotifyMeSender(NOW);
    expect(r.wouldEmail).toBe(1);
  });

  it('the item where clause embeds the shared public filter and the embargo filter', () => {
    const target: NotifyTarget = { source: 'SEARCH', id: 'n1', email: 'a@example.com', term: 'brass', city: null, since: ARMED, armedAt: ARMED };
    const where = buildItemWhere(target, NOW);
    const json = JSON.stringify(where);
    expect(json).toContain('"listingType":{"not":"CONSIGNOR_TAG"}');
    expect(json).toContain('"GRACE_LOCKED"');
    expect(json).toContain('"earlyAccessUntil"');
    expect(json).toContain('"legendaryVisibleAt"');
  });
});
