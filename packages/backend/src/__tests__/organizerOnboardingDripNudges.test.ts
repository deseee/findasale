/**
 * organizerOnboardingDripJob activation nudges v2 (2026-10-23, activation-funnel-2026-10-23.md):
 * - three states (live with no items, draft with items, dates passed), each mailed at most once per sale,
 * - no 14-day window any more (long-stuck organizers are covered once),
 * - at most one activation email per organizer per 7 days (pre-2026-10-23 nudge keys count too),
 * - never mail @findasale.test / @system.finda.sale / @example.com,
 * - suppressed recipients are logged and never retried; failed sends are retried,
 * - planActivationNudges never sends.
 *
 * prisma is a small in-memory fake: sale.findMany maps the job's where clause to a state by its status
 * filter, and emailAutomationLog.findFirst honours the OR / startsWith / endsWith / sentAt filters the job uses.
 */
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));
jest.mock('../utils/bulkEmailGate', () => ({ bulkEmailEnabled: jest.fn(() => true) }));
jest.mock('../services/suppressionService', () => ({ suppressionService: { isSuppressed: jest.fn(async () => false) } }));
jest.mock('../services/onboardingEmailService', () => ({
  sendOnboardingEmail5a: jest.fn(async () => undefined),
  sendOnboardingEmail5b: jest.fn(async () => undefined),
  sendOnboardingEmail5c: jest.fn(async () => undefined),
  sendEmptySaleNudge: jest.fn(async () => 'sent'),
  sendDraftReadyNudge: jest.fn(async () => 'sent'),
  sendStaleDatesNudge: jest.fn(async () => 'sent'),
}));

type State = 'EMPTY_PUBLISHED' | 'DRAFT_UNPUBLISHED' | 'STALE_DATES';
type FakeSale = { id: string; title: string; state: State; status: string; items: number; userId: string; email?: string };
type FakeLog = { userId: string; automationKey: string; sentAt: Date };

const fake = { sales: [] as FakeSale[], logs: [] as FakeLog[] };

function stateOfWhere(where: any): State {
  if (where.status === 'PUBLISHED') return 'EMPTY_PUBLISHED';
  if (where.status === 'DRAFT') return 'DRAFT_UNPUBLISHED';
  return 'STALE_DATES';
}

function keyMatches(key: string, f: any): boolean {
  if (typeof f === 'string') return key === f;
  if (f.startsWith && !key.startsWith(f.startsWith)) return false;
  if (f.endsWith && !key.endsWith(f.endsWith)) return false;
  return true;
}

function logMatches(l: FakeLog, where: any): boolean {
  if (where.userId && l.userId !== where.userId) return false;
  if (where.sentAt?.gte && l.sentAt.getTime() < where.sentAt.gte.getTime()) return false;
  if (where.automationKey && !keyMatches(l.automationKey, where.automationKey)) return false;
  if (where.OR && !where.OR.some((o: any) => logMatches(l, o))) return false;
  return true;
}

jest.mock('../lib/prisma', () => ({
  prisma: {
    organizer: { findMany: jest.fn(async () => []) },
    sale: {
      findMany: jest.fn(async ({ where }: any) =>
        fake.sales
          .filter((s) => s.state === stateOfWhere(where))
          .map((s) => ({
            id: s.id,
            title: s.title,
            status: s.status,
            endDate: new Date('2026-10-11T20:00:00Z'),
            organizer: { id: `org-${s.userId}`, userId: s.userId, user: { email: s.email ?? `${s.userId}@gmail.com`, name: 'Pat Organizer' } },
            _count: { items: s.items },
          }))
      ),
    },
    emailAutomationLog: {
      findFirst: jest.fn(async ({ where }: any) => (fake.logs.find((l) => logMatches(l, where)) ? { id: 'log' } : null)),
      create: jest.fn(async ({ data }: any) => {
        fake.logs.push({ userId: data.userId, automationKey: data.automationKey, sentAt: new Date() });
        return { id: 'new' };
      }),
    },
  },
}));

import { prisma } from '../lib/prisma';
import {
  runActivationNudges,
  planActivationNudges,
  runOrganizerOnboardingDrip,
  activationStateWhere,
  activationKey,
  isNeverEmailAddress,
  parseActivationKey,
  KEY_EMPTY_SALE_PREFIX,
} from '../jobs/organizerOnboardingDripJob';
import { sendEmptySaleNudge, sendDraftReadyNudge, sendStaleDatesNudge } from '../services/onboardingEmailService';
import { suppressionService } from '../services/suppressionService';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';

const emptyNudge = sendEmptySaleNudge as unknown as jest.Mock;
const draftNudge = sendDraftReadyNudge as unknown as jest.Mock;
const staleNudge = sendStaleDatesNudge as unknown as jest.Mock;
const isSuppressed = (suppressionService as any).isSuppressed as jest.Mock;

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  fake.sales = [];
  fake.logs = [];
  jest.clearAllMocks();
  emptyNudge.mockResolvedValue('sent');
  draftNudge.mockResolvedValue('sent');
  staleNudge.mockResolvedValue('sent');
  isSuppressed.mockResolvedValue(false);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('state queries', () => {
  const now = new Date('2026-10-23T12:00:00Z');

  it('live with no items: published, not over, zero visible items, 24h old, in-app sale, not-yet-activated organizer', () => {
    const w: any = activationStateWhere('EMPTY_PUBLISHED', now);
    expect(w.status).toBe('PUBLISHED');
    expect(w.endDate).toEqual({ gte: now });
    expect(w.items).toEqual({ none: PUBLIC_ITEM_FILTER });
    expect(w.OR[0].publishedAt.lte.getTime()).toBe(now.getTime() - DAY);
    expect(w).toMatchObject({ deletedAt: null, isInventoryContainer: false, isOngoing: false, sourceUrl: null, sourceName: null });
    expect(w.organizer).toMatchObject({ isClaimed: true, isUnmanagedListing: false, user: { deletedAt: null, suspendedAt: null, fraudSuspect: false } });
    expect(w.organizer.NOT.sales.some.items).toEqual({ some: PUBLIC_ITEM_FILTER });
    // No upper age bound any more (the old 14-day window is gone).
    expect(w.publishedAt).toBeUndefined();
  });

  it('draft with items: draft, not over, has items, created 24h+ ago, no upper age bound', () => {
    const w: any = activationStateWhere('DRAFT_UNPUBLISHED', now);
    expect(w.status).toBe('DRAFT');
    expect(w.items.some).toBeDefined();
    expect(w.createdAt).toEqual({ lte: new Date(now.getTime() - DAY) });
  });

  it('dates passed: draft or live, ended 24h+ ago, nothing sold', () => {
    const w: any = activationStateWhere('STALE_DATES', now);
    expect(w.status).toEqual({ in: ['DRAFT', 'PUBLISHED'] });
    expect(w.endDate).toEqual({ lt: new Date(now.getTime() - DAY) });
    expect(w.items).toEqual({ none: { status: 'SOLD' } });
  });
});

describe('sending', () => {
  it('sends one stale-dates email for a long-stuck draft with items, with the item count, and logs it', async () => {
    fake.sales = [{ id: 'abt', title: 'Boutique', state: 'STALE_DATES', status: 'DRAFT', items: 14, userId: 'u1' }];
    const r = await runActivationNudges();
    expect(r.sent).toBe(1);
    expect(staleNudge.mock.calls[0][0]).toMatchObject({ userId: 'u1', saleId: 'abt', itemCount: 14, saleStatus: 'DRAFT' });
    expect(fake.logs.map((l) => l.automationKey)).toEqual([activationKey('STALE_DATES', 'abt', 'sent')]);
  });

  it('each state is mailed at most once per sale', async () => {
    fake.sales = [{ id: 's1', title: 'Side table', state: 'EMPTY_PUBLISHED', status: 'PUBLISHED', items: 0, userId: 'u1' }];
    await runActivationNudges();
    // Even with the 7-day limit out of the way, the same state and sale is never mailed again.
    fake.logs.forEach((l) => (l.sentAt = new Date(Date.now() - 30 * DAY)));
    await runActivationNudges();
    expect(emptyNudge).toHaveBeenCalledTimes(1);
  });

  it('a pre-2026-10-23 nudge key counts as already nudged for its state', async () => {
    fake.logs = [{ userId: 'u1', automationKey: `${KEY_EMPTY_SALE_PREFIX}s1`, sentAt: new Date(Date.now() - 40 * DAY) }];
    fake.sales = [{ id: 's1', title: 'Side table', state: 'EMPTY_PUBLISHED', status: 'PUBLISHED', items: 0, userId: 'u1' }];
    await runActivationNudges();
    expect(emptyNudge).not.toHaveBeenCalled();
  });

  it('at most one activation email per organizer per 7 days, across states and sales', async () => {
    fake.sales = [{ id: 's2', title: 'Second', state: 'STALE_DATES', status: 'PUBLISHED', items: 0, userId: 'u1' }];
    fake.logs = [{ userId: 'u1', automationKey: activationKey('EMPTY_PUBLISHED', 's1', 'sent'), sentAt: new Date(Date.now() - 3 * DAY) }];
    await runActivationNudges();
    expect(staleNudge).not.toHaveBeenCalled();
    fake.logs[0].sentAt = new Date(Date.now() - 8 * DAY);
    await runActivationNudges();
    expect(staleNudge).toHaveBeenCalledTimes(1);
  });

  it('a suppressed log row does not count toward the 7-day limit', async () => {
    fake.sales = [{ id: 's2', title: 'Second', state: 'STALE_DATES', status: 'PUBLISHED', items: 0, userId: 'u1' }];
    fake.logs = [{ userId: 'u1', automationKey: activationKey('EMPTY_PUBLISHED', 's1', 'suppressed'), sentAt: new Date() }];
    await runActivationNudges();
    expect(staleNudge).toHaveBeenCalledTimes(1);
  });

  it('one email per organizer per run, draft-with-items first', async () => {
    fake.sales = [
      { id: 'stale', title: 'Old', state: 'STALE_DATES', status: 'PUBLISHED', items: 0, userId: 'u1' },
      { id: 'live', title: 'Live', state: 'EMPTY_PUBLISHED', status: 'PUBLISHED', items: 0, userId: 'u1' },
      { id: 'draft', title: 'Draft', state: 'DRAFT_UNPUBLISHED', status: 'DRAFT', items: 3, userId: 'u1' },
    ];
    await runOrganizerOnboardingDrip();
    expect(draftNudge).toHaveBeenCalledTimes(1);
    expect(emptyNudge).not.toHaveBeenCalled();
    expect(staleNudge).not.toHaveBeenCalled();
  });

  it.each(['qa@findasale.test', 'scraper+x@system.finda.sale', 'zztest@example.com', 'a@sub.example.com', 'not-an-email'])(
    'never emails %s',
    async (email) => {
      fake.sales = [{ id: 's1', title: 'T', state: 'STALE_DATES', status: 'DRAFT', items: 0, userId: 'u1', email }];
      await runActivationNudges();
      expect(staleNudge).not.toHaveBeenCalled();
      expect(fake.logs).toEqual([]);
    }
  );

  it('suppressed recipients get nothing, are logged as suppressed and never retried', async () => {
    isSuppressed.mockResolvedValue(true);
    fake.sales = [{ id: 's1', title: 'T', state: 'STALE_DATES', status: 'DRAFT', items: 0, userId: 'u1' }];
    const r = await runActivationNudges();
    expect(staleNudge).not.toHaveBeenCalled();
    expect(r.suppressed).toBe(1);
    expect(fake.logs.map((l) => l.automationKey)).toEqual([activationKey('STALE_DATES', 's1', 'suppressed')]);
    isSuppressed.mockResolvedValue(false);
    await runActivationNudges();
    expect(staleNudge).not.toHaveBeenCalled();
  });

  it('a failed send is not logged, so the next run retries it', async () => {
    staleNudge.mockResolvedValueOnce('failed');
    fake.sales = [{ id: 's1', title: 'T', state: 'STALE_DATES', status: 'DRAFT', items: 0, userId: 'u1' }];
    const first = await runActivationNudges();
    expect(first.failed).toBe(1);
    expect(fake.logs).toEqual([]);
    await runActivationNudges();
    expect(staleNudge).toHaveBeenCalledTimes(2);
    expect(fake.logs).toHaveLength(1);
  });

  it('planActivationNudges never sends or logs', async () => {
    fake.sales = [
      { id: 'a', title: 'A', state: 'DRAFT_UNPUBLISHED', status: 'DRAFT', items: 2, userId: 'u1' },
      { id: 'b', title: 'B', state: 'STALE_DATES', status: 'PUBLISHED', items: 0, userId: 'u2' },
      { id: 'c', title: 'C', state: 'STALE_DATES', status: 'PUBLISHED', items: 0, userId: 'u1' },
    ];
    const plan = await planActivationNudges();
    expect(plan.map((p) => [p.saleId, p.decision, p.reason])).toEqual([
      ['a', 'send', 'will_send'],
      ['b', 'send', 'will_send'],
      ['c', 'skip', 'one_email_per_run'],
    ]);
    expect(emptyNudge).not.toHaveBeenCalled();
    expect(draftNudge).not.toHaveBeenCalled();
    expect(staleNudge).not.toHaveBeenCalled();
    expect((prisma as any).emailAutomationLog.create).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('isNeverEmailAddress', () => {
    expect(isNeverEmailAddress('lucy@gmail.com')).toBe(false);
    expect(isNeverEmailAddress('QA@FINDASALE.TEST')).toBe(true);
    expect(isNeverEmailAddress('')).toBe(true);
  });

  it('parseActivationKey reads new and legacy keys', () => {
    expect(parseActivationKey(activationKey('STALE_DATES', 'sale1', 'sent'))).toEqual({ state: 'STALE_DATES', saleId: 'sale1', outcome: 'sent' });
    expect(parseActivationKey('onboarding_draft_ready:sale2')).toEqual({ state: 'DRAFT_UNPUBLISHED', saleId: 'sale2', outcome: 'sent' });
    expect(parseActivationKey('onboarding_5a')).toBeNull();
  });
});
