/**
 * organizerOnboardingDripJob activation nudges (2026-10-12, activation-empty-sale-root-cause audit):
 * - a PUBLISHED sale with zero shopper-visible items gets ONE "add your items" email,
 * - a DRAFT sale with items from a never-published organizer gets ONE "publish your sale" email,
 * - sales whose qualifying state is older than 14 days are never mailed (no backfill burst),
 * - a sale already logged in EmailAutomationLog is never mailed again.
 *
 * prisma is a small in-memory fake. sale.findMany honours the parts of the job's where clause
 * that decide eligibility (status, publishedAt/createdAt window, items none/some) so the
 * 14-day window is exercised for real, not just asserted.
 */
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));
jest.mock('../utils/bulkEmailGate', () => ({ bulkEmailEnabled: jest.fn(() => true) }));
jest.mock('../services/onboardingEmailService', () => ({
  sendOnboardingEmail5a: jest.fn(async () => undefined),
  sendOnboardingEmail5b: jest.fn(async () => undefined),
  sendOnboardingEmail5c: jest.fn(async () => undefined),
  sendEmptySaleNudge: jest.fn(async () => undefined),
  sendDraftReadyNudge: jest.fn(async () => undefined),
}));

type FakeSale = {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ENDED';
  publishedAt: Date | null;
  createdAt: Date;
  visibleItems: number; // items matching PUBLIC_ITEM_FILTER
  draftItems: number; // items matching the draft-sale item filter
  userId: string;
};

const fake = {
  sales: [] as FakeSale[],
  logs: [] as Array<{ userId: string; automationKey: string }>,
};

function inWindow(value: Date | null, w: { gte: Date; lte: Date } | undefined): boolean {
  if (!w) return true;
  if (!value) return false;
  return value.getTime() >= w.gte.getTime() && value.getTime() <= w.lte.getTime();
}

jest.mock('../lib/prisma', () => ({
  prisma: {
    organizer: { findMany: jest.fn(async () => []) },
    sale: {
      findMany: jest.fn(async ({ where }: any) =>
        fake.sales
          .filter((s) => s.status === where.status)
          .filter((s) => inWindow(s.publishedAt, where.publishedAt))
          .filter((s) => inWindow(s.createdAt, where.createdAt))
          .filter((s) => (where.items?.none ? s.visibleItems === 0 : true))
          .filter((s) => (where.items?.some ? s.draftItems > 0 : true))
          .map((s) => ({
            id: s.id,
            title: s.title,
            organizer: { id: `org-${s.userId}`, userId: s.userId, user: { email: `${s.userId}@example.com`, name: 'Pat Organizer' } },
            _count: { items: s.draftItems },
          }))
      ),
    },
    emailAutomationLog: {
      findFirst: jest.fn(async ({ where }: any) =>
        fake.logs.find((l) => l.userId === where.userId && l.automationKey === where.automationKey) ? { id: 'log' } : null
      ),
      create: jest.fn(async ({ data }: any) => {
        fake.logs.push({ userId: data.userId, automationKey: data.automationKey });
        return { id: 'new' };
      }),
    },
  },
}));

import { prisma } from '../lib/prisma';
import {
  runEmptySaleNudge,
  runDraftReadyNudge,
  runOrganizerOnboardingDrip,
  KEY_EMPTY_SALE_PREFIX,
  KEY_DRAFT_READY_PREFIX,
} from '../jobs/organizerOnboardingDripJob';
import { sendEmptySaleNudge, sendDraftReadyNudge } from '../services/onboardingEmailService';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';

const emptyNudge = sendEmptySaleNudge as unknown as jest.Mock;
const draftNudge = sendDraftReadyNudge as unknown as jest.Mock;
const saleFindMany = (prisma as any).sale.findMany as jest.Mock;

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

beforeEach(() => {
  fake.sales = [];
  fake.logs = [];
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('empty published sale nudge', () => {
  it('sends once for a published sale with zero visible items, linking that sale', async () => {
    fake.sales = [
      { id: 's1', title: 'Side table', status: 'PUBLISHED', publishedAt: daysAgo(3), createdAt: daysAgo(3), visibleItems: 0, draftItems: 0, userId: 'u1' },
    ];
    expect(await runEmptySaleNudge()).toBe(1);
    expect(emptyNudge).toHaveBeenCalledTimes(1);
    expect(emptyNudge.mock.calls[0][0]).toMatchObject({ userId: 'u1', saleId: 's1', saleTitle: 'Side table', email: 'u1@example.com' });
    expect(fake.logs).toEqual([{ userId: 'u1', automationKey: `${KEY_EMPTY_SALE_PREFIX}s1` }]);
  });

  it('does not resend once the sale is logged', async () => {
    fake.sales = [
      { id: 's1', title: 'Side table', status: 'PUBLISHED', publishedAt: daysAgo(3), createdAt: daysAgo(3), visibleItems: 0, draftItems: 0, userId: 'u1' },
    ];
    await runEmptySaleNudge();
    await runEmptySaleNudge();
    expect(emptyNudge).toHaveBeenCalledTimes(1);
  });

  it('never mails a sale published more than 14 days ago, or less than 24h ago', async () => {
    fake.sales = [
      { id: 'old', title: 'Old', status: 'PUBLISHED', publishedAt: daysAgo(20), createdAt: daysAgo(20), visibleItems: 0, draftItems: 0, userId: 'u1' },
      { id: 'fresh', title: 'Fresh', status: 'PUBLISHED', publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), createdAt: daysAgo(0), visibleItems: 0, draftItems: 0, userId: 'u2' },
    ];
    expect(await runEmptySaleNudge()).toBe(0);
    expect(emptyNudge).not.toHaveBeenCalled();
  });

  it('skips a published sale that has shopper-visible items', async () => {
    fake.sales = [
      { id: 's1', title: 'Moving sale', status: 'PUBLISHED', publishedAt: daysAgo(3), createdAt: daysAgo(3), visibleItems: 5, draftItems: 5, userId: 'u1' },
    ];
    expect(await runEmptySaleNudge()).toBe(0);
  });

  it('queries with PUBLIC_ITEM_FILTER, real organizers only, and excludes organizers with any sale that has visible items', async () => {
    await runEmptySaleNudge();
    const where = saleFindMany.mock.calls[0][0].where;
    expect(where.items).toEqual({ none: PUBLIC_ITEM_FILTER });
    expect(where.deletedAt).toBeNull();
    expect(where.organizer).toMatchObject({ isClaimed: true, isUnmanagedListing: false });
    expect(where.organizer.NOT.sales.some.items).toEqual({ some: PUBLIC_ITEM_FILTER });
    expect(where.publishedAt.gte.getTime()).toBeGreaterThanOrEqual(Date.now() - 14 * DAY - 5000);
  });
});

describe('draft with items nudge', () => {
  it('sends once for a draft sale with items, with the item count', async () => {
    fake.sales = [
      { id: 'd1', title: 'Boutique', status: 'DRAFT', publishedAt: null, createdAt: daysAgo(4), visibleItems: 0, draftItems: 14, userId: 'u3' },
    ];
    expect(await runDraftReadyNudge()).toBe(1);
    expect(draftNudge.mock.calls[0][0]).toMatchObject({ userId: 'u3', saleId: 'd1', itemCount: 14 });
    expect(fake.logs).toEqual([{ userId: 'u3', automationKey: `${KEY_DRAFT_READY_PREFIX}d1` }]);
  });

  it('does not resend once the sale is logged', async () => {
    fake.sales = [
      { id: 'd1', title: 'Boutique', status: 'DRAFT', publishedAt: null, createdAt: daysAgo(4), visibleItems: 0, draftItems: 14, userId: 'u3' },
    ];
    await runDraftReadyNudge();
    await runDraftReadyNudge();
    expect(draftNudge).toHaveBeenCalledTimes(1);
  });

  it('never mails a draft created more than 14 days ago', async () => {
    fake.sales = [
      { id: 'd-old', title: 'Old draft', status: 'DRAFT', publishedAt: null, createdAt: daysAgo(30), visibleItems: 0, draftItems: 3, userId: 'u3' },
    ];
    expect(await runDraftReadyNudge()).toBe(0);
    expect(draftNudge).not.toHaveBeenCalled();
  });

  it('skips a draft sale with no items', async () => {
    fake.sales = [
      { id: 'd1', title: 'Empty draft', status: 'DRAFT', publishedAt: null, createdAt: daysAgo(4), visibleItems: 0, draftItems: 0, userId: 'u3' },
    ];
    expect(await runDraftReadyNudge()).toBe(0);
  });

  it('only targets organizers who have never published', async () => {
    await runDraftReadyNudge();
    const where = saleFindMany.mock.calls[0][0].where;
    expect(where.organizer.NOT).toEqual({ sales: { some: { status: { in: ['PUBLISHED', 'ENDED'] }, deletedAt: null } } });
  });
});

describe('full run', () => {
  it('sends at most one email per organizer per run', async () => {
    fake.sales = [
      { id: 's1', title: 'Live empty', status: 'PUBLISHED', publishedAt: daysAgo(2), createdAt: daysAgo(2), visibleItems: 0, draftItems: 0, userId: 'u1' },
      { id: 's2', title: 'Second live empty', status: 'PUBLISHED', publishedAt: daysAgo(5), createdAt: daysAgo(5), visibleItems: 0, draftItems: 0, userId: 'u1' },
      { id: 'd1', title: 'Draft', status: 'DRAFT', publishedAt: null, createdAt: daysAgo(3), visibleItems: 0, draftItems: 2, userId: 'u1' },
    ];
    await runOrganizerOnboardingDrip();
    expect(emptyNudge).toHaveBeenCalledTimes(1);
    expect(draftNudge).not.toHaveBeenCalled();
  });
});
