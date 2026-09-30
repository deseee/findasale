/**
 * Guest email double opt-in (2026-09-30). Prisma, the transactional email rail and the limiter store are mocks;
 * nothing is sent. Covers: pending row + confirmation email, identical answers (no oracle), per-address throttle,
 * suppression, re-arm after opt-out, single-use / expiring confirm token, the HMAC opt-out token, the public
 * controller endpoints, and the route / CSRF wiring.
 */
import fs from 'fs';
import path from 'path';

const mockSale = { findUnique: jest.fn() };
const mockSub = { findFirst: jest.fn(), findUnique: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() };
jest.mock('../lib/prisma', () => ({ prisma: { sale: mockSale, saleSubscriber: mockSub } }));

const mockSend = jest.fn();
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: (...a: any[]) => mockSend(...a) } },
}));
const mockSuppressed = jest.fn();
jest.mock('../services/suppressionService', () => ({
  suppressionService: { isSuppressed: (...a: any[]) => mockSuppressed(...a) },
  isEmailDomainBlocked: (e: string) => e.endsWith('@blocked.example'),
}));
function mockCounterStore() {
  const counts = new Map<string, number>();
  return {
    init: () => undefined,
    increment: async (k: string) => {
      const n = (counts.get(k) ?? 0) + 1;
      counts.set(k, n);
      return { totalHits: n, resetTime: new Date(Date.now() + 86400000) };
    },
  };
}
jest.mock('../middleware/rateLimitShared', () => ({ createRateLimitStore: () => mockCounterStore() }));

import {
  requestGuestEmailSubscription,
  confirmGuestEmailSubscription,
  hashGuestConfirmToken,
  signGuestReminderUnsubToken,
  verifyGuestReminderUnsubToken,
  unsubscribeGuestReminderEmail,
  buildGuestSubscriptionConfirmEmail,
  GUEST_SUBSCRIBE_PENDING_MESSAGE,
  GUEST_EMAIL_CONFIRM_TTL_MS,
  MAX_GUEST_CONFIRMATION_EMAILS_PER_EMAIL_PER_DAY,
} from '../services/guestSaleSubscriptionService';
import {
  subscribeGuestToSale,
  confirmGuestSubscription,
  guestUnsubscribePage,
  guestUnsubscribeOneClick,
} from '../controllers/guestSubscriptionController';
import { isCsrfExemptPath } from '../middleware/csrf';

const NOW = new Date('2026-09-30T12:00:00Z');
const PUBLISHED = { id: 'sale1', title: 'Maple Street Sale', status: 'PUBLISHED', deletedAt: null };

function mockRes() {
  const res: any = { statusCode: 200, body: undefined, html: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: any) => { res.body = b; return res; });
  res.type = jest.fn(() => res);
  res.send = jest.fn((h: string) => { res.html = h; return res; });
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret-not-real';
  delete process.env.NOTIFY_ME_UNSUB_SECRET;
  process.env.FRONTEND_URL = 'https://site.example.test';
  mockSale.findUnique.mockResolvedValue(PUBLISHED);
  mockSuppressed.mockResolvedValue(false);
  mockSub.findFirst.mockResolvedValue(null);
  mockSub.count.mockResolvedValue(0);
  mockSub.create.mockResolvedValue({ id: 'sub1' });
  mockSub.update.mockResolvedValue({ id: 'sub1' });
  mockSend.mockResolvedValue({ sent: true });
});

describe('requestGuestEmailSubscription', () => {
  it('stores a PENDING row holding only the token hash and sends one confirmation email', async () => {
    const r = await requestGuestEmailSubscription({ saleId: 'sale1', email: '  New@Example.TEST ' }, NOW);
    expect(r).toEqual({ ok: true, message: GUEST_SUBSCRIBE_PENDING_MESSAGE });
    expect(mockSub.create).toHaveBeenCalledTimes(1);
    const data = mockSub.create.mock.calls[0][0].data;
    expect(data.email).toBe('new@example.test');
    expect(data.userId).toBeNull();
    expect(data.emailConfirmedAt).toBeNull();
    expect(data.emailConfirmExpiresAt.getTime()).toBe(NOW.getTime() + GUEST_EMAIL_CONFIRM_TTL_MS);
    expect(data.emailConfirmTokenHash).toMatch(/^[0-9a-f]{64}$/);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const mail = mockSend.mock.calls[0][0];
    expect(mail.to).toBe('new@example.test');
    const tokenInLink = decodeURIComponent(/confirm-subscription\?token=([^"\s]+)/.exec(mail.text)![1]);
    // the raw token is only in the email; the row holds its hash
    expect(hashGuestConfirmToken(tokenInLink)).toBe(data.emailConfirmTokenHash);
    expect(JSON.stringify(data)).not.toContain(tokenInLink);
    // opt-out link in the body and headers
    expect(mail.text).toContain('/api/notifications/guest-unsubscribe?token=');
    expect(mail.html).toContain('guest-unsubscribe?token=');
    expect(mail.headers['List-Unsubscribe']).toMatch(/^<https:\/\/site\.example\.test\/api\/notifications\/guest-unsubscribe\?token=/);
    expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('rejects bad input and missing or unpublished sales without storing anything', async () => {
    expect(await requestGuestEmailSubscription({ saleId: '', email: 'a@b.test' }, NOW)).toMatchObject({ ok: false, status: 400, code: 'SALE_ID_REQUIRED' });
    expect(await requestGuestEmailSubscription({ saleId: 'sale1', email: 'nope' }, NOW)).toMatchObject({ ok: false, status: 400, code: 'INVALID_EMAIL' });
    mockSale.findUnique.mockResolvedValueOnce(null);
    expect(await requestGuestEmailSubscription({ saleId: 'x', email: 'a@b.test' }, NOW)).toMatchObject({ ok: false, status: 404, code: 'SALE_NOT_FOUND' });
    mockSale.findUnique.mockResolvedValueOnce({ ...PUBLISHED, status: 'DRAFT' });
    expect(await requestGuestEmailSubscription({ saleId: 'sale1', email: 'a@b.test' }, NOW)).toMatchObject({ ok: false, status: 404 });
    expect(mockSub.create).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('gives the identical answer for new, pending, confirmed, suppressed and blocked addresses (no oracle)', async () => {
    const answers: unknown[] = [];
    answers.push(await requestGuestEmailSubscription({ saleId: 'sale1', email: 'new@example.test' }, NOW));
    mockSub.findFirst.mockResolvedValueOnce({ id: 's', emailConfirmedAt: null, emailOptOutAt: null });
    answers.push(await requestGuestEmailSubscription({ saleId: 'sale1', email: 'pending@example.test' }, NOW));
    mockSub.findFirst.mockResolvedValueOnce({ id: 's', emailConfirmedAt: NOW, emailOptOutAt: null });
    answers.push(await requestGuestEmailSubscription({ saleId: 'sale1', email: 'confirmed@example.test' }, NOW));
    mockSuppressed.mockResolvedValueOnce(true);
    answers.push(await requestGuestEmailSubscription({ saleId: 'sale1', email: 'supp@example.test' }, NOW));
    answers.push(await requestGuestEmailSubscription({ saleId: 'sale1', email: 'x@blocked.example' }, NOW));
    for (const a of answers) expect(a).toEqual({ ok: true, message: GUEST_SUBSCRIBE_PENDING_MESSAGE });
  });

  it('sends nothing for a confirmed-and-active, suppressed or blocked address', async () => {
    mockSub.findFirst.mockResolvedValueOnce({ id: 's', emailConfirmedAt: NOW, emailOptOutAt: null });
    await requestGuestEmailSubscription({ saleId: 'sale1', email: 'confirmed@example.test' }, NOW);
    mockSuppressed.mockResolvedValueOnce(true);
    await requestGuestEmailSubscription({ saleId: 'sale1', email: 'supp@example.test' }, NOW);
    await requestGuestEmailSubscription({ saleId: 'sale1', email: 'x@blocked.example' }, NOW);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockSub.create).not.toHaveBeenCalled();
    expect(mockSub.update).not.toHaveBeenCalled();
  });

  it('re-arms a pending or opted-out row as PENDING with a fresh token (opt-out cleared only with the confirmation)', async () => {
    mockSub.findFirst.mockResolvedValueOnce({ id: 'old', emailConfirmedAt: NOW, emailOptOutAt: NOW });
    await requestGuestEmailSubscription({ saleId: 'sale1', email: 'back@example.test' }, NOW);
    expect(mockSub.update).toHaveBeenCalledTimes(1);
    const arg = mockSub.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'old' });
    expect(arg.data.emailConfirmedAt).toBeNull();
    expect(arg.data.emailOptOutAt).toBeNull();
    expect(arg.data.emailConfirmTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('caps confirmation emails per address per day but keeps answering the same', async () => {
    for (let i = 0; i < MAX_GUEST_CONFIRMATION_EMAILS_PER_EMAIL_PER_DAY + 2; i++) {
      const r = await requestGuestEmailSubscription({ saleId: 'sale1', email: 'spam@example.test' }, NOW);
      expect(r).toEqual({ ok: true, message: GUEST_SUBSCRIBE_PENDING_MESSAGE });
    }
    expect(mockSend).toHaveBeenCalledTimes(MAX_GUEST_CONFIRMATION_EMAILS_PER_EMAIL_PER_DAY);
  });

  it('stops creating rows once an address already holds the pending-row cap', async () => {
    mockSub.count.mockResolvedValue(10);
    await requestGuestEmailSubscription({ saleId: 'sale1', email: 'many@example.test' }, NOW);
    expect(mockSub.create).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does not surface a send or database failure', async () => {
    mockSend.mockRejectedValueOnce(new Error('provider down'));
    const a = await requestGuestEmailSubscription({ saleId: 'sale1', email: 'a@example.test' }, NOW);
    mockSub.create.mockRejectedValueOnce(new Error('db down'));
    const b = await requestGuestEmailSubscription({ saleId: 'sale1', email: 'b@example.test' }, NOW);
    expect(a).toEqual({ ok: true, message: GUEST_SUBSCRIBE_PENDING_MESSAGE });
    expect(b).toEqual({ ok: true, message: GUEST_SUBSCRIBE_PENDING_MESSAGE });
  });

  it('sends nothing when no opt-out secret is configured', async () => {
    delete process.env.JWT_SECRET;
    await requestGuestEmailSubscription({ saleId: 'sale1', email: 'nosecret@example.test' }, NOW);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('confirmGuestEmailSubscription', () => {
  const TOKEN = 'a'.repeat(43);

  it('confirms once: conditional update on hash, unconfirmed, not opted out, unexpired; clears the token', async () => {
    mockSub.findUnique.mockResolvedValue({ id: 'r1', saleId: 'sale1', sale: { title: 'Maple Street Sale' } });
    mockSub.updateMany.mockResolvedValue({ count: 1 });
    const r = await confirmGuestEmailSubscription(TOKEN, NOW);
    expect(r).toEqual({ ok: true, saleId: 'sale1', saleTitle: 'Maple Street Sale' });
    expect(mockSub.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { emailConfirmTokenHash: hashGuestConfirmToken(TOKEN) } }));
    const arg = mockSub.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      id: 'r1',
      emailConfirmTokenHash: hashGuestConfirmToken(TOKEN),
      emailConfirmedAt: null,
      emailOptOutAt: null,
      emailConfirmExpiresAt: { gt: NOW },
    });
    expect(arg.data).toEqual({ emailConfirmedAt: NOW, emailConfirmTokenHash: null, emailConfirmExpiresAt: null });
  });

  it('a second use, an expired link or a lost race is refused', async () => {
    mockSub.findUnique.mockResolvedValue({ id: 'r1', saleId: 'sale1', sale: { title: 'T' } });
    mockSub.updateMany.mockResolvedValue({ count: 0 });
    expect(await confirmGuestEmailSubscription(TOKEN, NOW)).toEqual({ ok: false });
    mockSub.findUnique.mockResolvedValue(null); // token was cleared by the first use
    expect(await confirmGuestEmailSubscription(TOKEN, NOW)).toEqual({ ok: false });
  });

  it('rejects non-string and out-of-range tokens without touching the database', async () => {
    for (const t of [undefined, null, 42, '', 'short', 'x'.repeat(201)]) {
      expect(await confirmGuestEmailSubscription(t, NOW)).toEqual({ ok: false });
    }
    expect(mockSub.findUnique).not.toHaveBeenCalled();
  });
});

describe('guest opt-out token', () => {
  it('round-trips a lowercased address and rejects tampering, other secrets and malformed input', () => {
    const t = signGuestReminderUnsubToken(' Guest@Example.TEST ')!;
    expect(verifyGuestReminderUnsubToken(t)).toBe('guest@example.test');
    const [payload, sig] = t.split('.');
    const other = Buffer.from('victim@example.test').toString('base64url');
    expect(verifyGuestReminderUnsubToken(`${other}.${sig}`)).toBeNull();
    expect(verifyGuestReminderUnsubToken(`${payload}.${sig}x`)).toBeNull();
    expect(verifyGuestReminderUnsubToken('garbage')).toBeNull();
    expect(verifyGuestReminderUnsubToken('')).toBeNull();
    process.env.JWT_SECRET = 'a-different-secret';
    expect(verifyGuestReminderUnsubToken(t)).toBeNull();
  });

  it('does not accept a token signed for a different purpose', () => {
    const crypto = require('crypto');
    const payload = Buffer.from('guest@example.test').toString('base64url');
    const sig = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`other-purpose:${payload}`).digest('base64url');
    expect(verifyGuestReminderUnsubToken(`${payload}.${sig}`)).toBeNull();
  });

  it('opts out every guest row of the address', async () => {
    mockSub.updateMany.mockResolvedValue({ count: 3 });
    expect(await unsubscribeGuestReminderEmail(' Guest@Example.TEST ', NOW)).toBe(3);
    expect(mockSub.updateMany).toHaveBeenCalledWith({
      where: { userId: null, email: 'guest@example.test', emailOptOutAt: null },
      data: { emailOptOutAt: NOW },
    });
  });
});

describe('confirmation email content', () => {
  it('escapes the sale title, names the confirm action and carries the opt-out link; no dashes-as-em, no banned words', () => {
    const m = buildGuestSubscriptionConfirmEmail({ saleTitle: '<b>Rug & Lamp</b>', confirmUrl: 'https://x.test/c?t=1&u=2', unsubUrl: 'https://x.test/u?token=abc' });
    expect(m.html).not.toContain('<b>Rug');
    expect(m.html).toContain('&lt;b&gt;Rug');
    expect(m.html).toContain('https://x.test/u?token=abc');
    expect(m.text).toContain('https://x.test/c?t=1&u=2');
    for (const s of [m.subject, m.html, m.text]) {
      expect(s).not.toMatch(/—|–/);
      expect(s).not.toMatch(/estate sale/i);
      expect(s).not.toMatch(/\bAI\b/);
    }
  });
});

describe('guest controller endpoints', () => {
  it('subscribe-guest: 200 pending, 400 on bad input, never a 5xx detail', async () => {
    const ok = mockRes();
    await subscribeGuestToSale({ body: { saleId: 'sale1', email: 'a@example.test' } } as any, ok);
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toEqual({ status: 'pending_confirmation', message: GUEST_SUBSCRIBE_PENDING_MESSAGE });
    const bad = mockRes();
    await subscribeGuestToSale({ body: { saleId: 'sale1', email: 'nope' } } as any, bad);
    expect(bad.statusCode).toBe(400);
    expect(bad.body.code).toBe('INVALID_EMAIL');
    const none = mockRes();
    await subscribeGuestToSale({} as any, none);
    expect(none.statusCode).toBe(400);
  });

  it('confirm-email-subscription: confirms, then a repeat is a 400 CONFIRM_LINK_INVALID', async () => {
    mockSub.findUnique.mockResolvedValueOnce({ id: 'r1', saleId: 'sale1', sale: { title: 'T' } });
    mockSub.updateMany.mockResolvedValueOnce({ count: 1 });
    const ok = mockRes();
    await confirmGuestSubscription({ body: { token: 'b'.repeat(43) } } as any, ok);
    expect(ok.body).toEqual({ status: 'confirmed', saleId: 'sale1', saleTitle: 'T' });
    mockSub.findUnique.mockResolvedValueOnce(null);
    const again = mockRes();
    await confirmGuestSubscription({ body: { token: 'b'.repeat(43) } } as any, again);
    expect(again.statusCode).toBe(400);
    expect(again.body.code).toBe('CONFIRM_LINK_INVALID');
  });

  it('unsubscribe page (GET) and one-click (POST) opt the address out; invalid tokens do nothing', async () => {
    const token = signGuestReminderUnsubToken('guest@example.test')!;
    mockSub.updateMany.mockResolvedValue({ count: 1 });
    const page = mockRes();
    await guestUnsubscribePage({ query: { token } } as any, page);
    expect(page.statusCode).toBe(200);
    expect(page.html).toContain('You are unsubscribed');
    const one = mockRes();
    await guestUnsubscribeOneClick({ query: { token } } as any, one);
    expect(one.statusCode).toBe(200);
    expect(mockSub.updateMany).toHaveBeenCalledTimes(2);

    mockSub.updateMany.mockClear();
    const badPage = mockRes();
    await guestUnsubscribePage({ query: { token: 'nope' } } as any, badPage);
    expect(badPage.statusCode).toBe(400);
    const badOne = mockRes();
    await guestUnsubscribeOneClick({ query: {} } as any, badOne);
    expect(badOne.statusCode).toBe(400);
    expect(mockSub.updateMany).not.toHaveBeenCalled();
  });
});

describe('wiring', () => {
  const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  it('the one-click unsubscribe and the confirm endpoint are CSRF-exempt by exact path; subscribe-guest is not', () => {
    expect(isCsrfExemptPath('/api/notifications/guest-unsubscribe')).toBe(true);
    expect(isCsrfExemptPath('/api/notifications/confirm-email-subscription')).toBe(true);
    expect(isCsrfExemptPath('/api/notifications/guest-unsubscribe/extra')).toBe(false);
    expect(isCsrfExemptPath('/api/notifications/subscribe-guest')).toBe(false);
  });

  it('routes/notifications.ts registers the four public endpoints behind searchLimiter', () => {
    const r = src('routes/notifications.ts');
    expect(r).toMatch(/router\.post\('\/subscribe-guest', searchLimiter, subscribeGuestToSale\)/);
    expect(r).toMatch(/router\.post\('\/confirm-email-subscription', searchLimiter, confirmGuestSubscription\)/);
    expect(r).toMatch(/router\.get\('\/guest-unsubscribe', searchLimiter, guestUnsubscribePage\)/);
    expect(r).toMatch(/router\.post\('\/guest-unsubscribe', searchLimiter, guestUnsubscribeOneClick\)/);
  });
});
