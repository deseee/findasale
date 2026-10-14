/**
 * saleStatusService (2026-10-13 security): GET /api/sales/:id/status is public, so itemsRemaining must
 * only count publicly visible, non-embargoed items; and the live status push (which carries revenue)
 * goes to the private sale-status:<id> room, never the public sale:<id> feed room.
 */
const mockSaleFindUnique = jest.fn();
const mockPurchaseCount = jest.fn();
const mockPurchaseAggregate = jest.fn();
const mockHoldCount = jest.fn();
const mockItemCount = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    sale: { findUnique: (...a: any[]) => mockSaleFindUnique(...a) },
    purchase: {
      count: (...a: any[]) => mockPurchaseCount(...a),
      aggregate: (...a: any[]) => mockPurchaseAggregate(...a),
    },
    itemReservation: { count: (...a: any[]) => mockHoldCount(...a) },
    item: { count: (...a: any[]) => mockItemCount(...a) },
  },
}));

import { getSaleStatus, pushSaleStatus } from '../services/saleStatusService';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';

beforeEach(() => {
  jest.clearAllMocks();
  mockSaleFindUnique.mockResolvedValue({ id: 's1', startDate: new Date(), endDate: new Date() });
  mockPurchaseCount.mockResolvedValue(2);
  mockPurchaseAggregate.mockResolvedValue({ _sum: { amount: 55 } });
  mockHoldCount.mockResolvedValue(1);
  mockItemCount.mockResolvedValue(7);
});

describe('getSaleStatus itemsRemaining', () => {
  it('counts only public, non-embargoed AVAILABLE/RESERVED items', async () => {
    const status = await getSaleStatus('s1');
    expect(status.itemsRemaining).toBe(7);
    const where = mockItemCount.mock.calls[0][0].where;
    expect(where.saleId).toBe('s1');
    // status and the public filter are AND-ed so PUBLIC_ITEM_FILTER's own status key cannot replace it
    expect(where.status).toBeUndefined();
    const and = where.AND;
    expect(and[0]).toEqual({ status: { in: ['AVAILABLE', 'RESERVED'] } });
    const pub = and[1];
    expect(pub.AND[0]).toEqual(PUBLIC_ITEM_FILTER);
    const embargo = JSON.stringify(pub.AND[1]);
    expect(embargo).toContain('earlyAccessUntil');
    expect(embargo).toContain('legendaryVisibleAt');
    expect(embargo).toContain('LEGENDARY');
  });
});

describe('pushSaleStatus', () => {
  it('emits to the private sale-status room only', async () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    await pushSaleStatus({ to } as any, 's1');
    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith('sale-status:s1');
    expect(emit).toHaveBeenCalledWith('SALE_STATUS_UPDATE', expect.objectContaining({ revenueToday: 55 }));
  });
});
