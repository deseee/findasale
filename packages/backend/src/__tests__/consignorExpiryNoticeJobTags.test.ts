/**
 * consignorExpiryNoticeJob and consignor price tags.
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 *
 * A minted tag item is SOLD from birth, so the job's AVAILABLE filter already leaves it alone; the explicit listingType filter is the belt to that
 * brace (a POS price-tag sale is never unclaimed or expiring inventory). Prisma cannot run here, so the contract tested is the WHERE clause of both
 * candidate queries (window-open and mid-window reminder), plus that an ordinary item still gets its notice.
 */
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: unknown, fn: unknown) => fn }));
jest.mock('../lib/prisma', () => ({ prisma: { item: { findMany: jest.fn(), update: jest.fn() } } }));
jest.mock('../services/consignorEmailService', () => ({ sendConsignorPickupWindowReminder: jest.fn() }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn() }));

import { prisma } from '../lib/prisma';
import { sendConsignorPickupWindowReminder } from '../services/consignorEmailService';
import { createNotification } from '../services/notificationService';
import { processConsignorExpiryNotices } from '../jobs/consignorExpiryNoticeJob';

const db = prisma as any;
const flushImmediates = () => new Promise<void>((resolve) => setImmediate(() => setImmediate(resolve)));

function overdueItem(over: Record<string, unknown> = {}) {
  return {
    id: 'item1',
    title: 'Oak Chair',
    saleId: 'sale1',
    createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
    consignor: {
      id: 'con1',
      name: 'Pat',
      email: 'pat@example.com',
      unsoldItemDisposition: 'RETURN',
      returnPeriodDays: 90,
      workspace: { settings: { intakeLinkEnabled: false, intakeLinkToken: null } },
    },
    sale: { title: 'Spring', organizer: { userId: 'u1', user: { email: 'org@example.com', name: 'Org' } } },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.item.findMany.mockResolvedValue([]);
  db.item.update.mockResolvedValue({});
  (sendConsignorPickupWindowReminder as jest.Mock).mockResolvedValue(undefined);
  (createNotification as jest.Mock).mockResolvedValue(undefined);
});

describe('processConsignorExpiryNotices', () => {
  it('excludes CONSIGNOR_TAG items from BOTH candidate queries (window open and mid-window reminder)', async () => {
    await processConsignorExpiryNotices();
    expect(db.item.findMany).toHaveBeenCalledTimes(2);
    for (const [args] of db.item.findMany.mock.calls) {
      expect(args.where).toMatchObject({
        consignorId: { not: null },
        status: 'AVAILABLE',
        listingType: { not: 'CONSIGNOR_TAG' },
      });
    }
    // first query is the window-open pool, second the mid-window pool
    expect(db.item.findMany.mock.calls[0][0].where.pickupWindowStartedAt).toBeNull();
    expect(db.item.findMany.mock.calls[1][0].where.pickupReminder2SentAt).toBeNull();
  });

  it('still opens the pickup window and notifies for an ordinary overdue RETURN item', async () => {
    db.item.findMany.mockResolvedValueOnce([overdueItem()]).mockResolvedValueOnce([]);
    await processConsignorExpiryNotices();
    await flushImmediates();
    expect(db.item.update).toHaveBeenCalledWith({ where: { id: 'item1' }, data: { pickupWindowStartedAt: expect.any(Date) } });
    expect(sendConsignorPickupWindowReminder).toHaveBeenCalledWith(expect.objectContaining({ itemName: 'Oak Chair', reminderNumber: 1 }));
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('does not touch an item whose consignor disposition is not RETURN', async () => {
    db.item.findMany.mockResolvedValueOnce([overdueItem({ consignor: { ...overdueItem().consignor, unsoldItemDisposition: 'DONATE' } })]).mockResolvedValueOnce([]);
    await processConsignorExpiryNotices();
    await flushImmediates();
    expect(db.item.update).not.toHaveBeenCalled();
    expect(sendConsignorPickupWindowReminder).not.toHaveBeenCalled();
  });
});
