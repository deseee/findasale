/**
 * checkNewMatches (2026-10-13 security): `status: 'AVAILABLE'` was overwritten by a later
 * `...PUBLIC_ITEM_FILTER` spread (which carries its own `status` key), so SOLD items could be announced
 * as new matches. Every condition is now AND-ed.
 */
const mockSearchFindMany = jest.fn();
const mockSearchUpdate = jest.fn();
const mockItemFindMany = jest.fn();
jest.mock('../index', () => ({
  prisma: {
    savedSearch: {
      findMany: (...a: any[]) => mockSearchFindMany(...a),
      update: (...a: any[]) => mockSearchUpdate(...a),
    },
    item: { findMany: (...a: any[]) => mockItemFindMany(...a) },
  },
}));
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../middleware/auth', () => ({}));

import { checkNewMatches } from '../controllers/savedSearchController';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchFindMany.mockResolvedValue([
    { id: 'ss1', name: 'Lamps', filters: { q: 'lamp' }, lastNotifiedAt: null, createdAt: new Date('2026-10-01') },
  ]);
  mockSearchUpdate.mockResolvedValue({});
  mockItemFindMany.mockResolvedValue([]);
});

describe('checkNewMatches item filter', () => {
  it('keeps status AVAILABLE alongside the public filter (not overwritten)', async () => {
    await checkNewMatches({ user: { id: 'u1' } } as any, mockRes());
    const where = mockItemFindMany.mock.calls[0][0].where;
    // no top-level status key that a spread could have replaced
    expect(where.status).toBeUndefined();
    expect(where.AND).toEqual(expect.arrayContaining([PUBLIC_ITEM_FILTER, { status: 'AVAILABLE' }]));
    expect(JSON.stringify(where.AND)).toContain('earlyAccessUntil');
    expect(where.sale).toEqual(expect.objectContaining({ status: 'PUBLISHED' }));
    expect(where.OR).toBeDefined(); // the text query still applies
  });

  it('AVAILABLE and the public filter are both present, so a SOLD item cannot satisfy the where', async () => {
    await checkNewMatches({ user: { id: 'u1' } } as any, mockRes());
    const and: any[] = mockItemFindMany.mock.calls[0][0].where.AND;
    const statusClauses = and.filter((c) => c && c.status !== undefined).map((c) => c.status);
    expect(statusClauses).toEqual(expect.arrayContaining(['AVAILABLE', { notIn: ['GRACE_LOCKED'] }]));
  });
});
