/**
 * POST /api/pos/payment-links/email (sendPaymentLinkEmail), payment review finding 1 (2026-09-30).
 * The endpoint used to email ANY address a caller-supplied URL and amount from the platform sender (an open
 * phishing relay). It now emails only the organizer's OWN active POSPaymentLink, looked up server side by id
 * (scoped to the organizer and its sale), with the STORED url and amount, a validated recipient, a per-organizer
 * hourly cap, and escaped HTML. Prisma, email and Redis are mocks: nothing is really sent.
 */

jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));

var mockPrisma: any = { pOSPaymentLink: { findFirst: jest.fn() } };
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

var mockResolveActor = jest.fn();
jest.mock('../utils/posAuth', () => ({
  resolveOrganizerOrTeamMember: (...args: any[]) => mockResolveActor(...args),
}));

var mockRedisIncr = jest.fn();
jest.mock('../middleware/rateLimitShared', () => ({
  ...jest.requireActual('../middleware/rateLimitShared'),
  redisIncrWithWindow: (...args: any[]) => mockRedisIncr(...args),
}));

var mockSend = jest.fn();
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: (...a: any[]) => mockSend(...a) } },
}));

jest.mock('../services/workspacePermissionService', () => ({ checkPermission: jest.fn() }));
jest.mock('../lib/socket', () => ({ getIO: jest.fn(() => ({})) }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/holdInvoicePaymentRecorder', () => ({ markHoldInvoicePaid: jest.fn() }));
jest.mock('../services/squareCheckoutLinkService', () => ({ createSquareCheckoutLink: jest.fn(), deleteSquareCheckoutLink: jest.fn() }));

import {
  sendPaymentLinkEmail,
  isPlainEmailAddress,
  PAYMENT_LINK_EMAIL_MAX_PER_HOUR,
  __resetPaymentLinkEmailLimiterForTests,
} from '../controllers/posController';

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const makeReq = (body: any) => ({ body, user: { id: 'org-user-1' } } as any);

const STORED_URL = 'https://square.link/u/stored123';
const linkRow = (over: any = {}) => ({
  id: 'link-1',
  organizerId: 'org-1',
  saleId: 'sale-1',
  processor: 'SQUARE',
  status: 'ACTIVE',
  amount: 4250,
  expiresAt: null,
  squarePaymentLinkUrl: STORED_URL,
  stripePaymentLinkUrl: null,
  sale: { title: 'Spring Sale', organizerId: 'org-1' },
  ...over,
});
let LINKS: any[] = [];

/** A tiny in-memory findFirst that honors the fields the controller filters on. */
function installFindFirst() {
  mockPrisma.pOSPaymentLink.findFirst.mockImplementation(async ({ where }: any) =>
    LINKS.find((l) => {
      if (where.id !== undefined && l.id !== where.id) return false;
      if (where.organizerId !== undefined && l.organizerId !== where.organizerId) return false;
      if (where.sale?.organizerId !== undefined && l.sale.organizerId !== where.sale.organizerId) return false;
      if (where.status !== undefined && l.status !== where.status) return false;
      if (where.OR && !where.OR.some((c: any) => (c.squarePaymentLinkUrl && l.squarePaymentLinkUrl === c.squarePaymentLinkUrl) || (c.stripePaymentLinkUrl && l.stripePaymentLinkUrl === c.stripePaymentLinkUrl))) return false;
      return true;
    }) ?? null
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetPaymentLinkEmailLimiterForTests();
  mockResolveActor.mockReset();
  mockResolveActor.mockResolvedValue({ id: 'org-1', ownerUserId: 'org-user-1', actorKind: 'ORGANIZER', actingUserId: 'org-user-1' });
  mockRedisIncr.mockReset();
  mockRedisIncr.mockResolvedValue(1);
  mockSend.mockReset();
  mockSend.mockResolvedValue({ sent: true });
  LINKS = [
    linkRow(),
    linkRow({ id: 'link-other', organizerId: 'org-2', squarePaymentLinkUrl: 'https://square.link/u/theirs', sale: { title: 'Other', organizerId: 'org-2' } }),
  ];
  installFindFirst();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('sendPaymentLinkEmail: the stored link is what gets emailed', () => {
  it('emails the STORED url and amount for the organizer\'s own link', async () => {
    const res = makeRes();
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: 'shopper@example.com' }), res);
    expect(res.json).toHaveBeenCalledWith({ status: 'SENT' });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const mail = mockSend.mock.calls[0][0];
    expect(mail.to).toBe('shopper@example.com');
    expect(mail.subject).toContain('$42.50');
    expect(mail.html).toContain(STORED_URL);
    expect(mail.html).toContain('$42.50');
  });

  it('ignores a caller-supplied url and amount when a linkId is present (no phishing relay)', async () => {
    const res = makeRes();
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: 'v@example.com', paymentLinkUrl: 'https://evil.example/pay', amount: 1 }), res);
    const mail = mockSend.mock.calls[0][0];
    expect(mail.html).toContain(STORED_URL);
    expect(mail.html).not.toContain('evil.example');
    expect(mail.subject).toContain('$42.50');
    expect(mail.subject).not.toContain('$1.00');
  });

  it('scopes the lookup to the requesting organizer AND its own sale', async () => {
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: 'v@example.com' }), makeRes());
    const where = mockPrisma.pOSPaymentLink.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 'link-1', organizerId: 'org-1', sale: { organizerId: 'org-1' } });
  });

  it('another organizer\'s link id is a 404 and nothing is sent', async () => {
    const res = makeRes();
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-other', buyerEmail: 'v@example.com' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].code).toBe('PAYMENT_LINK_NOT_FOUND');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a link that is not ACTIVE, or has expired, is a 409 and nothing is sent', async () => {
    LINKS = [linkRow({ status: 'COMPLETED' })];
    let res = makeRes();
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: 'v@example.com' }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('PAYMENT_LINK_NOT_ACTIVE');

    LINKS = [linkRow({ expiresAt: new Date(Date.now() - 1000) })];
    res = makeRes();
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: 'v@example.com' }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('PAYMENT_LINK_EXPIRED');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a stored url that is not plain https is refused', async () => {
    LINKS = [linkRow({ squarePaymentLinkUrl: 'javascript:alert(1)' })];
    const res = makeRes();
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: 'v@example.com' }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('sendPaymentLinkEmail: legacy { paymentLinkUrl, buyerEmail, amount } callers', () => {
  it('is accepted ONLY when the url is exactly an active link of this organizer, and still sends the stored amount', async () => {
    const res = makeRes();
    await sendPaymentLinkEmail(makeReq({ paymentLinkUrl: STORED_URL, buyerEmail: 'v@example.com', amount: 999999 }), res);
    expect(res.json).toHaveBeenCalledWith({ status: 'SENT' });
    expect(mockSend.mock.calls[0][0].subject).toContain('$42.50');
  });

  it('an arbitrary url is ignored: 404, nothing sent', async () => {
    const res = makeRes();
    await sendPaymentLinkEmail(makeReq({ paymentLinkUrl: 'https://evil.example/pay', buyerEmail: 'v@example.com', amount: 50 }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('another organizer\'s real link url does not match for this organizer', async () => {
    const res = makeRes();
    await sendPaymentLinkEmail(makeReq({ paymentLinkUrl: 'https://square.link/u/theirs', buyerEmail: 'v@example.com' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a request with neither a link id nor a url is a 400', async () => {
    const res = makeRes();
    await sendPaymentLinkEmail(makeReq({ buyerEmail: 'v@example.com' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('PAYMENT_LINK_REQUIRED');
  });
});

describe('sendPaymentLinkEmail: recipient validation', () => {
  it.each([
    'not-an-email',
    'a@b',
    'one@example.com, two@example.com',
    'a b@example.com',
    'victim@example.com\r\nBcc: attacker@example.com',
    '<x@example.com>',
    '"quoted"@example.com',
    '',
    12345,
    null,
  ])('rejects %p with a 400 and sends nothing', async (bad) => {
    const res = makeRes();
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: bad }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('INVALID_EMAIL');
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockPrisma.pOSPaymentLink.findFirst).not.toHaveBeenCalled();
  });

  it('accepts ordinary addresses and trims surrounding spaces', async () => {
    expect(isPlainEmailAddress('first.last+tag@sub.example.co')).toBe(true);
    const res = makeRes();
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: '  v@example.com ' }), res);
    expect(mockSend.mock.calls[0][0].to).toBe('v@example.com');
  });
});

describe('sendPaymentLinkEmail: per-organizer hourly cap', () => {
  it('uses the organizer id in the Redis window and allows up to the cap', async () => {
    mockRedisIncr.mockResolvedValue(PAYMENT_LINK_EMAIL_MAX_PER_HOUR);
    const res = makeRes();
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: 'v@example.com' }), res);
    expect(mockRedisIncr).toHaveBeenCalledWith('rl:pos-link-email:org-1', 3600);
    expect(res.json).toHaveBeenCalledWith({ status: 'SENT' });
  });

  it('is a 429 with a stable code past the cap, and nothing is sent', async () => {
    mockRedisIncr.mockResolvedValue(PAYMENT_LINK_EMAIL_MAX_PER_HOUR + 1);
    const res = makeRes();
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: 'v@example.com' }), res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json.mock.calls[0][0].code).toBe('RATE_LIMITED');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('the cap is 20 per hour', () => {
    expect(PAYMENT_LINK_EMAIL_MAX_PER_HOUR).toBe(20);
  });

  it('falls back to a per-process window when Redis is unavailable, and still caps', async () => {
    mockRedisIncr.mockResolvedValue(null);
    for (let i = 0; i < PAYMENT_LINK_EMAIL_MAX_PER_HOUR; i++) {
      const ok = makeRes();
      await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: 'v@example.com' }), ok);
      expect(ok.json).toHaveBeenCalledWith({ status: 'SENT' });
    }
    const blocked = makeRes();
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: 'v@example.com' }), blocked);
    expect(blocked.status).toHaveBeenCalledWith(429);
    expect(mockSend).toHaveBeenCalledTimes(PAYMENT_LINK_EMAIL_MAX_PER_HOUR);
  });

  it('a different organizer has its own allowance', async () => {
    mockRedisIncr.mockResolvedValue(null);
    for (let i = 0; i < PAYMENT_LINK_EMAIL_MAX_PER_HOUR + 1; i++) {
      await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: 'v@example.com' }), makeRes());
    }
    mockResolveActor.mockResolvedValue({ id: 'org-2', ownerUserId: 'u2', actorKind: 'ORGANIZER', actingUserId: 'u2' });
    const res = makeRes();
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-other', buyerEmail: 'v@example.com' }), res);
    expect(res.json).toHaveBeenCalledWith({ status: 'SENT' });
  });
});

describe('sendPaymentLinkEmail: output safety', () => {
  it('HTML-escapes the sale title', async () => {
    LINKS = [linkRow({ sale: { title: '<script>alert(1)</script>', organizerId: 'org-1' } })];
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: 'v@example.com' }), makeRes());
    const html = mockSend.mock.calls[0][0].html;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('a send failure is a generic 500 with a stable code and never leaks the provider message', async () => {
    mockSend.mockRejectedValue(new Error('smtp auth failed for user=secret-account'));
    const res = makeRes();
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: 'v@example.com' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to send email', code: 'EMAIL_SEND_FAILED' });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('secret-account');
  });

  it('when the actor cannot be resolved, nothing is looked up or sent', async () => {
    mockResolveActor.mockResolvedValue(null);
    await sendPaymentLinkEmail(makeReq({ linkId: 'link-1', buyerEmail: 'v@example.com' }), makeRes());
    expect(mockPrisma.pOSPaymentLink.findFirst).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
