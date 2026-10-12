/**
 * vintedBundleController.ts -- tests for the manual Vinted bundle reconciliation endpoints (2026-10-12).
 */

const mockPrisma: any = { organizer: { findUnique: jest.fn() } };
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
const mockMarkSold = jest.fn();
jest.mock('../../services/vintedSoldDetectionService', () => ({
  markItemsSoldOnVinted: (...a: any[]) => mockMarkSold(...a),
  sanitizeManualSoldItemIds: (raw: unknown) => (Array.isArray(raw) ? raw.filter((v) => typeof v === 'string' && v) : []),
  VINTED_MANUAL_SOLD_MAX_ITEMS: 50,
}));
const mockAck = jest.fn();
const mockNotices = jest.fn();
const mockOptions = jest.fn();
jest.mock('../../services/vintedBundleSaleService', () => ({
  acknowledgeVintedBundleSale: (...a: any[]) => mockAck(...a),
  listPendingVintedBundleNotices: (...a: any[]) => mockNotices(...a),
  listVintedBundleSelectionOptions: (...a: any[]) => mockOptions(...a),
}));

import { getVintedBundleOptions, markVintedBundleItemsSold } from '../vintedBundleController';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org_1' });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('markVintedBundleItemsSold', () => {
  it('requires authentication and an organizer profile', async () => {
    let res = mockRes();
    await markVintedBundleItemsSold({ body: { itemIds: ['a'] } } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
    mockPrisma.organizer.findUnique.mockResolvedValue(null);
    res = mockRes();
    await markVintedBundleItemsSold({ user: { id: 'u1' }, body: { itemIds: ['a'] } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockMarkSold).not.toHaveBeenCalled();
  });

  it('rejects a non-array, an empty selection and more than 50 items', async () => {
    for (const body of [{ itemIds: 'a' }, { itemIds: [] }, { itemIds: Array.from({ length: 51 }, (_, i) => `i${i}`) }, {}]) {
      const res = mockRes();
      await markVintedBundleItemsSold({ user: { id: 'u1' }, body } as any, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockMarkSold).not.toHaveBeenCalled();
  });

  it('scopes to the caller organizer, returns per-item results and acknowledges the notification when something sold', async () => {
    mockMarkSold.mockResolvedValue([
      { itemId: 'a', result: 'sold' },
      { itemId: 'b', result: 'notFound' },
    ]);
    const res = mockRes();
    await markVintedBundleItemsSold({ user: { id: 'u1' }, body: { itemIds: ['a', 'b'] } } as any, res);
    expect(mockMarkSold).toHaveBeenCalledWith('org_1', ['a', 'b']);
    expect(mockAck).toHaveBeenCalledWith('u1');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, summary: expect.objectContaining({ sold: 1, notFound: 1 }) }));
  });

  it('treats an already-sold item as reconciled, but does not acknowledge when nothing sold or everything failed', async () => {
    mockMarkSold.mockResolvedValue([{ itemId: 'a', result: 'alreadySold' }]);
    await markVintedBundleItemsSold({ user: { id: 'u1' }, body: { itemIds: ['a'] } } as any, mockRes());
    expect(mockAck).toHaveBeenCalledTimes(1);
    mockAck.mockClear();
    mockMarkSold.mockResolvedValue([{ itemId: 'a', result: 'error' }]);
    await markVintedBundleItemsSold({ user: { id: 'u1' }, body: { itemIds: ['a'] } } as any, mockRes());
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('answers 500 without leaking details when the service throws', async () => {
    mockMarkSold.mockRejectedValue(new Error('secret db detail'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = mockRes();
    await markVintedBundleItemsSold({ user: { id: 'u1' }, body: { itemIds: ['a'] } } as any, res);
    err.mockRestore();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret');
  });
});

describe('getVintedBundleOptions', () => {
  it('returns notices plus tracked and other options for the caller organizer only', async () => {
    mockNotices.mockResolvedValue([{ id: 'n1', title: 't', body: 'b', createdAt: new Date(0) }]);
    mockOptions.mockResolvedValue({ tracked: [{ itemId: 'a', title: 'A' }], other: [{ itemId: 'b', title: 'B' }] });
    const res = mockRes();
    await getVintedBundleOptions({ user: { id: 'u1' } } as any, res);
    expect(mockOptions).toHaveBeenCalledWith('org_1');
    expect(mockNotices).toHaveBeenCalledWith('u1');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ tracked: [{ itemId: 'a', title: 'A' }], maxSelectable: 50 }));
  });
});
