/**
 * GET /sales/:id 410 SALE_GONE for removed sales (2026-11-19, GSC 404 cleanup).
 *  - Trusted ISR renderer (x-ssr-secret) gets 410 + citySlug for a pruned (tombstoned), soft-deleted or CANCELLED sale.
 *  - Anonymous callers keep the plain 404 (no existence signal), and an unknown id stays 404 for everyone.
 *  - ARCHIVED (restorable venue) and DRAFT keep their previous behavior.
 * Prisma is a mock.
 */
var mockPrisma: any;
jest.mock('../lib/prisma', () => {
  mockPrisma = {
    organizer: { findUnique: jest.fn() },
    sale: { findUnique: jest.fn() },
    prunedSaleTombstone: { findUnique: jest.fn() },
    review: { aggregate: jest.fn() },
    workspaceMember: { findFirst: jest.fn() },
  };
  return { prisma: mockPrisma };
});
jest.mock('@sentry/node', () => new Proxy({ __esModule: true }, { get: (t: any, k: string) => (k in t ? t[k] : jest.fn()) }));
jest.mock('../services/revalidationService', () => ({
  triggerSaleAndCityRevalidation: jest.fn(() => Promise.resolve()),
  triggerSaleTakedownRevalidation: jest.fn(() => Promise.resolve()),
  debouncedTriggerSaleAndCityRevalidation: jest.fn(),
  citySlugFromCityState: jest.fn(() => null),
}));
jest.mock('../services/commandCenterService', () => ({ invalidateCommandCenterCache: jest.fn(() => Promise.resolve()) }));

import { getSale } from '../controllers/saleController';
import { saleGoneBodyForRow, prunedSaleGoneBody } from '../utils/saleGone';

const SECRET = 'test-ssr-secret';
const ID = 'cmqf14g6x00t9bo1nibst4yk7';

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  res.send = jest.fn((b: unknown) => { res.body = b; return res; });
  res.setHeader = jest.fn();
  return res;
}

function saleRow(over: Record<string, any> = {}): any {
  return {
    id: ID, title: 'Maple Street Sale', description: 'Lots of lamps', status: 'PUBLISHED', deletedAt: null,
    organizerId: 'org_owner', address: '123 Maple St', city: 'Grand Rapids', state: 'MI', zip: '49503',
    startDate: new Date('2099-06-01T00:00:00Z'), endDate: new Date('2099-06-02T00:00:00Z'), updatedAt: new Date(),
    items: [],
    organizer: { id: 'org_owner', userId: 'owner_user', businessName: 'Maple Co', timezone: 'America/Detroit', user: { userBadges: [] } },
    ...over,
  };
}

async function run(trusted: boolean) {
  const res = makeRes();
  await getSale({ params: { id: ID }, headers: trusted ? { 'x-ssr-secret': SECRET } : {} } as any, res);
  return res;
}

const savedSecret = process.env.REVALIDATE_SECRET;
beforeAll(() => { process.env.REVALIDATE_SECRET = SECRET; });
afterAll(() => { process.env.REVALIDATE_SECRET = savedSecret; });
beforeEach(() => {
  for (const m of Object.values(mockPrisma) as any[]) for (const fn of Object.values(m) as any[]) (fn as jest.Mock).mockReset();
  mockPrisma.prunedSaleTombstone.findUnique.mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /sales/:id for a pruned (hard-deleted) sale', () => {
  it('answers the trusted renderer 410 SALE_GONE with the tombstone city slug', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(null);
    mockPrisma.prunedSaleTombstone.findUnique.mockResolvedValue({ citySlug: 'grand-rapids-mi' });
    const res = await run(true);
    expect(res.statusCode).toBe(410);
    expect(res.body).toEqual({ message: 'Sale removed', code: 'SALE_GONE', citySlug: 'grand-rapids-mi' });
    expect(mockPrisma.prunedSaleTombstone.findUnique).toHaveBeenCalledWith({ where: { id: ID }, select: { citySlug: true } });
  });

  it('answers 410 with citySlug null for a tombstone written before citySlug existed', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(null);
    mockPrisma.prunedSaleTombstone.findUnique.mockResolvedValue({ citySlug: null });
    const res = await run(true);
    expect(res.statusCode).toBe(410);
    expect(res.body.citySlug).toBeNull();
  });

  it('keeps a plain 404 for anonymous callers and never queries the tombstone table for them', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(null);
    mockPrisma.prunedSaleTombstone.findUnique.mockResolvedValue({ citySlug: 'grand-rapids-mi' });
    const res = await run(false);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Sale not found' });
    expect(mockPrisma.prunedSaleTombstone.findUnique).not.toHaveBeenCalled();
  });

  it('keeps 404 for an id that was never a sale, even for the trusted renderer', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(null);
    const res = await run(true);
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /sales/:id for a soft-deleted or cancelled sale', () => {
  it('soft-deleted: trusted renderer gets 410 with the canonical slug of the sale city', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(saleRow({ deletedAt: new Date(), city: 'St. Louis', state: 'MO' }));
    const res = await run(true);
    expect(res.statusCode).toBe(410);
    expect(res.body).toEqual({ message: 'Sale removed', code: 'SALE_GONE', citySlug: 'st-louis-mo' });
    expect(mockPrisma.prunedSaleTombstone.findUnique).not.toHaveBeenCalled();
  });

  it('soft-deleted: anonymous callers keep the plain 404', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(saleRow({ deletedAt: new Date() }));
    const res = await run(false);
    expect(res.statusCode).toBe(404);
  });

  it('CANCELLED: trusted renderer gets 410, anonymous callers 404', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(saleRow({ status: 'CANCELLED' }));
    expect((await run(true)).statusCode).toBe(410);
    mockPrisma.sale.findUnique.mockResolvedValue(saleRow({ status: 'CANCELLED' }));
    expect((await run(false)).statusCode).toBe(404);
  });

  it('ARCHIVED (restorable venue) keeps the plain 404 even for the trusted renderer', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(saleRow({ status: 'ARCHIVED' }));
    const res = await run(true);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Sale not found' });
  });

  it('DRAFT keeps SALE_NOT_PUBLIC for the trusted renderer', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(saleRow({ status: 'DRAFT' }));
    const res = await run(true);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('SALE_NOT_PUBLIC');
  });
});

describe('utils/saleGone', () => {
  it('saleGoneBodyForRow is null for a live sale and drops a city that cannot form a slug', () => {
    expect(saleGoneBodyForRow({ deletedAt: null, status: 'PUBLISHED', city: 'Grand Rapids', state: 'MI' })).toBeNull();
    expect(saleGoneBodyForRow({ deletedAt: null, status: 'ENDED', city: 'Grand Rapids', state: 'MI' })).toBeNull();
    expect(saleGoneBodyForRow({ deletedAt: new Date(), status: 'ENDED', city: null, state: 'MI' })).toEqual(
      { message: 'Sale removed', code: 'SALE_GONE', citySlug: null });
  });

  it('prunedSaleGoneBody ignores a stored slug that is not a valid city slug', async () => {
    mockPrisma.prunedSaleTombstone.findUnique.mockResolvedValue({ citySlug: '../admin' });
    expect(await prunedSaleGoneBody(ID)).toEqual({ message: 'Sale removed', code: 'SALE_GONE', citySlug: null });
  });

  it('prunedSaleGoneBody skips the lookup for an empty or oversized id', async () => {
    expect(await prunedSaleGoneBody('')).toBeNull();
    expect(await prunedSaleGoneBody('x'.repeat(65))).toBeNull();
    expect(mockPrisma.prunedSaleTombstone.findUnique).not.toHaveBeenCalled();
  });
});
