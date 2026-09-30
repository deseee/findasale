/**
 * Virtual line texts and SMS rate limiters (2026-09-29). lineController used to text any stored number with no
 * consent, STOP list, quiet hours, prefix/footer, cap or log, and getLineStatus leaked shoppers' phone numbers.
 * Now every text goes through services/compliantSms.ts. Prisma is an in-memory fake (plus a tiny lineEntry
 * table), Twilio is a mock. No network, no real text.
 */
let mockFake: any;
jest.mock('../lib/prisma', () => {
  mockFake = require('./__fixtures__/smsFakePrisma').makeFakePrisma();
  return { prisma: mockFake.prisma };
});
const mockCreate = jest.fn();
jest.mock('twilio', () => ({ __esModule: true, default: jest.fn(() => ({ messages: { create: (...a: unknown[]) => mockCreate(...a) } })) }));
jest.mock('../controllers/userController', () => ({ handleEarlyBirdBadge: jest.fn(), handleExplorerBadge: jest.fn() }));

import { startLine, callNext, getLineStatus, broadcastPositionUpdates, joinLine } from '../controllers/lineController';

const DAY_NOON = new Date('2026-09-30T15:00:00Z'); // 10:00 AM CDT
const NIGHT = new Date('2026-09-30T07:00:00Z'); // 2:00 AM CDT
const CONSENT = new Date('2026-09-01T00:00:00Z');

const mkRes = () => {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: any) {
      this.body = b;
      return this;
    },
  };
  return res;
};
const mkReq = (userId: string, saleId = 's1') => ({ user: { id: userId }, params: { saleId }, body: {}, headers: {} }) as any;
const allLogged = () =>
  [...(console.log as jest.Mock).mock.calls, ...(console.info as jest.Mock).mock.calls, ...(console.warn as jest.Mock).mock.calls, ...(console.error as jest.Mock).mock.calls].map((c) => c.join(' ')).join('\n');

// Minimal lineEntry table (the shared fake does not model it).
let lineRows: any[] = [];
const attachLineTable = () => {
  const match = (r: any, w: any = {}) =>
    Object.entries(w).every(([k, v]: [string, any]) => {
      if (k === 'saleId_userId') return r.saleId === v.saleId && r.userId === v.userId;
      if (v && typeof v === 'object' && 'in' in v) return v.in.includes(r[k]);
      return r[k] === v;
    });
  mockFake.prisma.lineEntry = {
    deleteMany: async ({ where }: any) => {
      lineRows = lineRows.filter((r) => !match(r, where));
      return {};
    },
    create: async ({ data }: any) => {
      const row = { id: `le${lineRows.length + 1}`, ...data };
      lineRows.push(row);
      return { ...row };
    },
    findFirst: async ({ where, orderBy }: any) => {
      let out = lineRows.filter((r) => match(r, where));
      if (orderBy?.position) out = [...out].sort((a, b) => (orderBy.position === 'asc' ? a.position - b.position : b.position - a.position));
      return out[0] ?? null;
    },
    findUnique: async ({ where }: any) => lineRows.find((r) => match(r, where)) ?? null,
    findMany: async ({ where, include }: any) =>
      lineRows
        .filter((r) => match(r, where))
        .map((r) => ({
          ...r,
          ...(include?.user ? { user: (mockFake.prisma.user.rows.find((u: any) => u.id === r.userId) ?? null) && { name: 'Pat', phone: mockFake.prisma.user.rows.find((u: any) => u.id === r.userId).phone } } : {}),
        })),
    update: async ({ where, data }: any) => {
      const r = lineRows.find((x) => x.id === where.id);
      Object.assign(r, data);
      return { ...r };
    },
  };
};

const seedSubscriber = (userId: string, phone: string | null, consent: Date | null, extra: Record<string, unknown> = {}) =>
  mockFake.prisma.saleSubscriber.insert({ saleId: 's1', userId, phone, smsConsentAt: consent, ...extra });

beforeEach(() => {
  mockFake.reset();
  attachLineTable();
  lineRows = [];
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({ sid: 'SM1' });
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_AUTH_TOKEN = 'token';
  process.env.TWILIO_PHONE_NUMBER = '+18885550100';
  delete process.env.SMS_DAILY_CAP_PER_ORGANIZER;
  mockFake.prisma.organizer.insert({ id: 'org1', userId: 'ou', businessName: 'Oak Street Estates', timezone: 'America/Chicago', subscriptionTier: 'PRO' });
  mockFake.prisma.sale.insert({ id: 's1', title: 'Oak Street Sale', organizerId: 'org1', status: 'PUBLISHED' });
  mockFake.prisma.user.insert({ id: 'shopper1', phone: '(269) 555-0142' });
  jest.useFakeTimers({ now: DAY_NOON });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('startLine', () => {
  it('opens the line for everyone but texts ONLY subscribers with confirmed consent, with prefix and footer', async () => {
    seedSubscriber('a', '+12695550101', CONSENT);
    seedSubscriber('b', '+12695550102', null); // never confirmed
    seedSubscriber('c', '+12695550103', null, { smsConsentPendingAt: new Date() }); // pending only
    seedSubscriber('d', '+12695550104', CONSENT);
    mockFake.prisma.smsOptOut.insert({ phone: '+12695550104' }); // STOP list beats consent
    const res = mkRes();
    await startLine(mkReq('ou'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.lineCount).toBe(4);
    expect(res.body.sms).toMatchObject({ sent: 1, skippedNoConsent: 2, skippedOptedOut: 1 });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const sent = mockCreate.mock.calls[0][0];
    expect(sent.to).toBe('+12695550101');
    expect(sent.body.startsWith('Oak Street Estates via FindA.Sale: ')).toBe(true);
    expect(sent.body.endsWith('Reply STOP to opt out.')).toBe(true);
    expect(mockFake.prisma.smsSendLog.rows).toHaveLength(1); // audit row
  });

  it('does not text during quiet hours but still opens the line, and says why', async () => {
    jest.setSystemTime(NIGHT);
    seedSubscriber('a', '+12695550101', CONSENT);
    const res = mkRes();
    await startLine(mkReq('ou'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.lineCount).toBe(1);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(res.body.sms.blocked).toBe('quiet_hours');
    expect(res.body.smsNote).toMatch(/8:00 AM to 9:00 PM/);
  });

  it('a free (SIMPLE) organizer texts nobody', async () => {
    mockFake.prisma.organizer.rows[0].subscriptionTier = 'SIMPLE';
    seedSubscriber('a', '+12695550101', CONSENT);
    const res = mkRes();
    await startLine(mkReq('ou'), res);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(res.body.sms.blocked).toBe('tier');
  });

  it('403 for someone who does not run the sale', async () => {
    mockFake.prisma.organizer.insert({ id: 'org2', userId: 'other' });
    const res = mkRes();
    await startLine(mkReq('other'), res);
    expect(res.statusCode).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('never logs a full phone number and never returns one', async () => {
    seedSubscriber('a', '+12695550101', CONSENT);
    const res = mkRes();
    await startLine(mkReq('ou'), res);
    expect(allLogged()).not.toContain('2695550101');
    expect(JSON.stringify(res.body.sms)).not.toContain('2695550101');
  });

  it('an unexpected Twilio failure does not break opening the line', async () => {
    mockCreate.mockRejectedValue(new Error('twilio down'));
    seedSubscriber('a', '+12695550101', CONSENT);
    const res = mkRes();
    await startLine(mkReq('ou'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.sms.failed).toBe(1);
  });
});

describe('callNext', () => {
  const queue = () => {
    lineRows.push({ id: 'le1', saleId: 's1', userId: 'a', position: 1, status: 'WAITING' });
  };

  it('texts the next shopper only with confirmed consent, even outside business hours (real-time one-to-one)', async () => {
    jest.setSystemTime(NIGHT);
    seedSubscriber('a', '+12695550101', CONSENT);
    queue();
    const res = mkRes();
    await callNext(mkReq('ou'), res);
    expect(res.body.smsOutcome).toBe('sent');
    expect(mockCreate.mock.calls[0][0].body).toContain('Reply STOP to opt out.');
  });

  it('a number with no confirmed consent is not texted', async () => {
    seedSubscriber('a', '+12695550101', null);
    queue();
    const res = mkRes();
    await callNext(mkReq('ou'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.smsOutcome).toBe('skipped_no_consent');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('a STOP-listed number is not texted', async () => {
    seedSubscriber('a', '+12695550101', CONSENT);
    mockFake.prisma.smsOptOut.insert({ phone: '+12695550101' });
    queue();
    const res = mkRes();
    await callNext(mkReq('ou'), res);
    expect(res.body.smsOutcome).toBe('skipped_opted_out');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('reports skipped_tier for a SIMPLE organizer', async () => {
    mockFake.prisma.organizer.rows[0].subscriptionTier = 'SIMPLE';
    seedSubscriber('a', '+12695550101', CONSENT);
    queue();
    const res = mkRes();
    await callNext(mkReq('ou'), res);
    expect(res.body.smsOutcome).toBe('skipped_tier');
  });

  it('404 when nobody is waiting', async () => {
    const res = mkRes();
    await callNext(mkReq('ou'), res);
    expect(res.statusCode).toBe(404);
  });
});

describe('getLineStatus', () => {
  it('returns masked phone numbers only', async () => {
    lineRows.push({ id: 'le1', saleId: 's1', userId: 'shopper1', position: 1, status: 'WAITING' });
    const res = mkRes();
    await getLineStatus(mkReq('ou'), res);
    expect(res.statusCode).toBe(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('5550142');
    expect(json).toContain('0142');
    expect(res.body[0].user.phone).toMatch(/^\*+-?0142$|^\*\*\*-0142$/);
  });
});

describe('broadcastPositionUpdates', () => {
  const wait = (n: number) => {
    for (let i = 0; i < n; i++) {
      lineRows.push({ id: `le${i}`, saleId: 's1', userId: `u${i}`, position: i + 1, status: 'WAITING' });
      seedSubscriber(`u${i}`, `+1269555${String(3000 + i)}`, i === 0 ? null : CONSENT);
    }
  };

  it('texts consenting waiting shoppers and reports counts only', async () => {
    wait(4);
    const res = mkRes();
    await broadcastPositionUpdates(mkReq('ou'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ smsSent: 3, totalWaiting: 4 });
    expect(res.body.sms.skippedNoConsent).toBe(1);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['quiet hours', () => jest.setSystemTime(NIGHT), 422, 'QUIET_HOURS'],
    ['tier', () => (mockFake.prisma.organizer.rows[0].subscriptionTier = 'SIMPLE'), 403, 'TIER'],
    ['cap', () => {
      process.env.SMS_DAILY_CAP_PER_ORGANIZER = '1';
      mockFake.prisma.smsSendLog.insert({ organizerId: 'org1', saleId: 's1', sentCount: 1, status: 'COMPLETE', createdAt: new Date(Date.now() - 3600 * 1000) });
    }, 429, 'CAP_REACHED'],
    ['in progress', () => mockFake.prisma.smsSendLog.insert({ organizerId: 'org1', saleId: 's1', sentCount: 5, status: 'RESERVED', createdAt: new Date(Date.now() - 60 * 1000) }), 409, 'IN_PROGRESS'],
  ])('%s: refuses with the right status and sends nothing', async (_n, setup, status, code) => {
    wait(3);
    (setup as () => void)();
    const res = mkRes();
    await broadcastPositionUpdates(mkReq('ou'), res);
    expect(res.statusCode).toBe(status);
    expect(res.body.code).toBe(code);
    expect(res.body.smsSent).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('joinLine', () => {
  it('confirms by text only with confirmed consent', async () => {
    seedSubscriber('shopper1', '+12695550142', CONSENT);
    const res = mkRes();
    await joinLine(mkReq('shopper1'), res);
    expect(res.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].body).toContain('Reply STOP to opt out.');
  });

  it('joining the line is NOT consent: a stored number without confirmed consent gets no text but the join still works', async () => {
    seedSubscriber('shopper1', '+12695550142', null, { smsConsentPendingAt: new Date() });
    const res = mkRes();
    await joinLine(mkReq('shopper1'), res);
    expect(res.statusCode).toBe(201);
    expect(res.body.position).toBe(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
