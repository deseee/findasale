/**
 * Hunt Pass cancel / undo and the streak routes that used to fake success (2026-09-29).
 * Router handlers are pulled off the Express router and called directly; Prisma, the
 * notification service and the billing service are mocked. NO real billing calls: the
 * billing module is mocked, and nothing here charges, refunds, or changes an amount.
 *
 * NOT EXECUTED at authoring time (jest could not be run in the authoring environment).
 */

jest.mock('../middleware/auth', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/rateLimiter', () => ({
  paymentLimiter: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../services/streakService', () => ({
  recordVisit: jest.fn(),
  getStreak: jest.fn().mockResolvedValue({ currentStreak: 0, longestStreak: 0, earlyAccessUnlocked: false }),
}));
jest.mock('../services/squareBillingService', () => ({
  HUNT_PASS_PRICE_CENTS: 499,
  BILLING_INTERVAL_DAYS: 30,
  createPlatformBillingCard: jest.fn(),
  chargeStoredCard: jest.fn(),
}));
jest.mock('../lib/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue({}),
}));
jest.mock('../utils/stripe', () => ({
  getStripe: jest.fn(() => ({
    subscriptions: { update: jest.fn().mockResolvedValue({ current_period_end: 1893456000 }) },
  })),
}));
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    userStreak: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    visitStreak: { findMany: jest.fn() },
    favorite: { findFirst: jest.fn() },
    purchase: { findFirst: jest.fn() },
  },
}));

import { prisma } from '../lib/prisma';
import { createNotification } from '../lib/notificationService';
import router from '../routes/streaks';

const db = prisma as any;

function handlerFor(path: string, method: 'get' | 'post') {
  const layer = (router as any).stack.find((l: any) => l.route && l.route.path === path && l.route.methods[method]);
  if (!layer) throw new Error(`route not found: ${method} ${path}`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle as (req: any, res: any) => Promise<any>;
}

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
const req = (body: any = {}) => ({ user: { id: 'u1' }, body });

beforeEach(() => {
  jest.clearAllMocks();
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.user.update.mockResolvedValue({});
  db.userStreak.findMany.mockResolvedValue([]);
});

describe('POST /streaks/cancel-huntpass', () => {
  const cancel = handlerFor('/cancel-huntpass', 'post');

  it('schedules cancel at period end, keeps access, confirms with the end date, and notifies once', async () => {
    db.user.findUnique.mockResolvedValue({
      huntPassBillingProcessor: 'square',
      huntPassActive: true,
      huntPassExpiry: future,
      huntPassCancelAtPeriodEnd: false,
      huntPassStripeSubscriptionId: null,
    });
    const res = mockRes();
    await cancel(req(), res);

    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', huntPassActive: true, huntPassCancelAtPeriodEnd: false },
      data: { huntPassCancelAtPeriodEnd: true },
    });
    // access is NOT cut: huntPassActive is never set false here
    expect(JSON.stringify(db.user.updateMany.mock.calls)).not.toContain('"huntPassActive":false');
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ cancelAtPeriodEnd: true, alreadyCancelled: false, expiresAt: future.toISOString() });
    expect(body.message).toMatch(/until/);
    expect(body.message).not.toMatch(/—/);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect((createNotification as jest.Mock).mock.calls[0][0]).toMatchObject({ userId: 'u1', type: 'huntpass_cancel_scheduled', sendEmail: true });
  });

  it('is idempotent: a second cancel changes nothing and sends no second confirmation', async () => {
    db.user.findUnique.mockResolvedValue({
      huntPassBillingProcessor: 'square',
      huntPassActive: true,
      huntPassExpiry: future,
      huntPassCancelAtPeriodEnd: true,
    });
    db.user.updateMany.mockResolvedValue({ count: 0 });
    const res = mockRes();
    await cancel(req(), res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ cancelAtPeriodEnd: true, alreadyCancelled: true });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('400 when there is no active subscription', async () => {
    db.user.findUnique.mockResolvedValue({
      huntPassBillingProcessor: 'square',
      huntPassActive: false,
      huntPassExpiry: null,
      huntPassCancelAtPeriodEnd: false,
    });
    const res = mockRes();
    await cancel(req(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('401 without a user, and only ever touches req.user.id', async () => {
    const res = mockRes();
    await cancel({ user: undefined, body: { userId: 'someone-else' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);

    db.user.findUnique.mockResolvedValue({
      huntPassBillingProcessor: 'square',
      huntPassActive: true,
      huntPassExpiry: future,
      huntPassCancelAtPeriodEnd: false,
    });
    await cancel({ user: { id: 'u1' }, body: { userId: 'someone-else' } }, mockRes());
    expect(db.user.findUnique.mock.calls[0][0].where).toEqual({ id: 'u1' });
    expect(db.user.updateMany.mock.calls[0][0].where.id).toBe('u1');
  });
});

describe('POST /streaks/resume-huntpass (undo)', () => {
  const resume = handlerFor('/resume-huntpass', 'post');

  it('clears the scheduled cancel while the paid period is running, with no charge and no expiry change', async () => {
    db.user.findUnique.mockResolvedValue({
      huntPassBillingProcessor: 'square',
      huntPassActive: true,
      huntPassExpiry: future,
      huntPassCancelAtPeriodEnd: true,
    });
    const res = mockRes();
    await resume(req(), res);
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', huntPassActive: true, huntPassCancelAtPeriodEnd: true },
      data: { huntPassCancelAtPeriodEnd: false },
    });
    expect(res.json.mock.calls[0][0]).toMatchObject({ cancelAtPeriodEnd: false, alreadyActive: false, expiresAt: future.toISOString() });
  });

  it('is a no-op success when nothing was scheduled', async () => {
    db.user.findUnique.mockResolvedValue({
      huntPassBillingProcessor: 'square',
      huntPassActive: true,
      huntPassExpiry: future,
      huntPassCancelAtPeriodEnd: false,
    });
    const res = mockRes();
    await resume(req(), res);
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ cancelAtPeriodEnd: false, alreadyActive: true });
  });

  it('400 PASS_ENDED once the pass is inactive or the canceled period has ended', async () => {
    db.user.findUnique.mockResolvedValue({
      huntPassBillingProcessor: 'square',
      huntPassActive: false,
      huntPassExpiry: null,
      huntPassCancelAtPeriodEnd: false,
    });
    const res = mockRes();
    await resume(req(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('PASS_ENDED');

    db.user.findUnique.mockResolvedValue({
      huntPassBillingProcessor: 'square',
      huntPassActive: true,
      huntPassExpiry: new Date(Date.now() - 1000),
      huntPassCancelAtPeriodEnd: true,
    });
    const res2 = mockRes();
    await resume(req(), res2);
    expect(res2.status).toHaveBeenCalledWith(400);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('streak routes no longer fake success', () => {
  it('POST /save records nothing (and says so) when there was no save today', async () => {
    db.favorite.findFirst.mockResolvedValue(null);
    const res = mockRes();
    await handlerFor('/save', 'post')(req(), res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ recorded: false, reason: 'NO_SAVE_TODAY' });
    expect(db.userStreak.create).not.toHaveBeenCalled();
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('Save recorded!');
  });

  it('POST /save starts a real daily streak from a real save, once per day', async () => {
    db.favorite.findFirst.mockResolvedValue({ id: 'f1' });
    db.userStreak.findUnique.mockResolvedValue(null);
    db.userStreak.create.mockResolvedValue({ currentStreak: 1, longestStreak: 1 });
    const res = mockRes();
    await handlerFor('/save', 'post')(req(), res);
    expect(db.userStreak.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', type: 'save', currentStreak: 1 });
    expect(res.json.mock.calls[0][0]).toMatchObject({ recorded: true, streak: { current: 1, longest: 1 } });

    // same day again: no write
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    db.userStreak.findUnique.mockResolvedValue({ currentStreak: 1, longestStreak: 1, lastActivityDate: today });
    db.userStreak.update.mockClear();
    const res2 = mockRes();
    await handlerFor('/save', 'post')(req(), res2);
    expect(db.userStreak.update).not.toHaveBeenCalled();
    expect(res2.json.mock.calls[0][0]).toMatchObject({ recorded: false, alreadyRecordedToday: true });
  });

  it('POST /save extends yesterday\'s streak and restarts after a gap', async () => {
    db.favorite.findFirst.mockResolvedValue({ id: 'f1' });
    const day = 24 * 60 * 60 * 1000;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    db.userStreak.findUnique.mockResolvedValue({ currentStreak: 4, longestStreak: 9, lastActivityDate: new Date(todayStart.getTime() - day) });
    db.userStreak.update.mockResolvedValue({ currentStreak: 5, longestStreak: 9 });
    await handlerFor('/save', 'post')(req(), mockRes());
    expect(db.userStreak.update.mock.calls[0][0].data).toMatchObject({ currentStreak: 5, longestStreak: 9 });

    db.userStreak.findUnique.mockResolvedValue({ currentStreak: 4, longestStreak: 9, lastActivityDate: new Date(todayStart.getTime() - 3 * day) });
    db.userStreak.update.mockResolvedValue({ currentStreak: 1, longestStreak: 9 });
    await handlerFor('/save', 'post')(req(), mockRes());
    expect(db.userStreak.update.mock.calls[1][0].data).toMatchObject({ currentStreak: 1, longestStreak: 9 });
  });

  it('POST /purchase requires a real paid non-test purchase today', async () => {
    db.purchase.findFirst.mockResolvedValue(null);
    const res = mockRes();
    await handlerFor('/purchase', 'post')(req(), res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ recorded: false, reason: 'NO_PURCHASE_TODAY' });
    const where = db.purchase.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: 'u1', isTestTransaction: false, status: { in: ['PAID', 'COMPLETED'] } });
  });

  it('GET /leaderboard returns real live streaks with short names (opted-in members only), and an honest empty flag', async () => {
    const optedIn = { showNameInGoingList: true };
    db.visitStreak.findMany.mockResolvedValue([
      { currentStreak: 6, longestStreak: 8, user: { name: 'Patricia Anne Johnson', explorerRank: 'RANGER', huntPassActive: true, notificationPrefs: optedIn } },
      { currentStreak: 3, longestStreak: 3, user: { name: 'Sam', explorerRank: 'SCOUT', huntPassActive: false, notificationPrefs: optedIn } },
    ]);
    const res = mockRes();
    await handlerFor('/leaderboard', 'get')({}, res);
    const body = res.json.mock.calls[0][0];
    expect(body.empty).toBe(false);
    expect(body.leaderboard[0]).toMatchObject({ position: 1, displayName: 'Patricia J.', currentStreak: 6 });
    expect(body.leaderboard[1]).toMatchObject({ position: 2, displayName: 'Sam' });
    const where = db.visitStreak.findMany.mock.calls[0][0].where;
    expect(where.currentStreak).toEqual({ gt: 0 });
    expect(where.user).toEqual({ fraudSuspect: false });

    // no opt-in (or an email address as the account name): never shown by name
    db.visitStreak.findMany.mockResolvedValue([
      { currentStreak: 5, longestStreak: 5, user: { name: 'Pat Smith', explorerRank: 'SCOUT', huntPassActive: false, notificationPrefs: {} } },
      { currentStreak: 4, longestStreak: 4, user: { name: 'pat@example.com', explorerRank: 'SCOUT', huntPassActive: false, notificationPrefs: optedIn } },
    ]);
    const resHidden = mockRes();
    await handlerFor('/leaderboard', 'get')({}, resHidden);
    const hidden = resHidden.json.mock.calls[0][0].leaderboard;
    expect(hidden[0].displayName).toBe('Explorer');
    expect(hidden[1].displayName).toBe('Explorer');
    expect(JSON.stringify(hidden)).not.toMatch(/pat@example\.com|Pat Smith/);

    db.visitStreak.findMany.mockResolvedValue([]);
    const res2 = mockRes();
    await handlerFor('/leaderboard', 'get')({}, res2);
    expect(res2.json.mock.calls[0][0]).toMatchObject({ leaderboard: [], empty: true });
  });
});
