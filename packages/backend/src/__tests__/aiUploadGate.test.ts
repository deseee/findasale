/**
 * Paid AI upload gate: organizer role, sale ownership, monthly Smart-tag quota, SSRF guard.
 * Prisma and the quota tracker are jest mocks; no network, no paid API call.
 * (Written 2026-09-29 without being executed: jest cannot run on the authoring machine.)
 */

const mockPrisma = {
  organizer: { findUnique: jest.fn() },
  sale: { findUnique: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

const mockReserveAiTags = jest.fn();
const mockRefundAiTags = jest.fn();
const mockIncrementAiTagCount = jest.fn();
jest.mock('../lib/aiTagsQuotaTracker', () => ({
  ...jest.requireActual('../lib/aiTagsQuotaTracker'),
  reserveAiTags: (...a: unknown[]) => mockReserveAiTags(...a),
  refundAiTags: (...a: unknown[]) => mockRefundAiTags(...a),
  incrementAiTagCount: (...a: unknown[]) => mockIncrementAiTagCount(...a),
}));

import {
  requireOrganizerRole,
  organizerAiGate,
  recordAiUsage,
  getAiGate,
  resolveTier,
  isAllowedImageUrl,
  validateBatchImageUrls,
  MAX_BATCH_ANALYZE_IMAGES,
} from '../middleware/aiUploadGate';

function mockRes() {
  const res: any = { locals: {}, listeners: {} as Record<string, Array<() => void>> };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.once = jest.fn((evt: string, cb: () => void) => {
    (res.listeners[evt] = res.listeners[evt] || []).push(cb);
    return res;
  });
  res.emit = (evt: string) => (res.listeners[evt] || []).forEach((cb: () => void) => cb());
  return res;
}
/** The reservation result the tracker returns when the atomic UPDATE succeeded. */
const reserved = (units: number, used = 10, limit = 100) => ({ ok: true, reserved: units, used: used + units, limit, remaining: limit - used - units });
const denied = (over: Record<string, unknown> = {}) => ({ ok: false, reserved: 0, used: 100, limit: 100, remaining: 0, exceeded: true, ...over });
const organizerReq = (extra: Record<string, unknown> = {}) =>
  ({ user: { id: 'u1', roles: ['ORGANIZER'] }, body: {}, query: {}, ...extra } as any);

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'SIMPLE' });
  mockPrisma.sale.findUnique.mockResolvedValue({ organizerId: 'org1' });
  mockReserveAiTags.mockImplementation(async (_org: string, _tier: string, units: number) => reserved(units));
  mockRefundAiTags.mockResolvedValue(undefined);
  mockIncrementAiTagCount.mockResolvedValue(11);
});

describe('requireOrganizerRole', () => {
  it('rejects a shopper with 403 before any body parsing', () => {
    const res = mockRes();
    const next = jest.fn();
    requireOrganizerRole({ user: { id: 's1', roles: ['USER'] } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it('rejects an anonymous request', () => {
    const res = mockRes();
    const next = jest.fn();
    requireOrganizerRole({} as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it('passes an organizer (roles array or legacy role string)', () => {
    const next = jest.fn();
    requireOrganizerRole({ user: { id: 'u', roles: ['ORGANIZER'] } } as any, mockRes(), next);
    requireOrganizerRole({ user: { id: 'u', role: 'ORGANIZER' } } as any, mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});

describe('organizerAiGate', () => {
  it('attaches the gate context and calls next when everything checks out', async () => {
    const res = mockRes();
    const next = jest.fn();
    await organizerAiGate()(organizerReq({ body: { saleId: 'sale1' } }), res, next);
    expect(next).toHaveBeenCalled();
    expect(getAiGate(res)).toMatchObject({ organizerId: 'org1', tier: 'SIMPLE', saleId: 'sale1', reserved: 1 });
    expect(typeof getAiGate(res)!.settle).toBe('function');
    expect(mockReserveAiTags).toHaveBeenCalledWith('org1', 'SIMPLE', 1);
  });

  it('settle(used) keeps what was spent and refunds the rest, exactly once', async () => {
    const res = mockRes();
    await organizerAiGate({ units: () => 5 })(organizerReq(), res, jest.fn());
    const gate = getAiGate(res)!;
    await gate.settle(2);
    await gate.settle(0); // idempotent: the second call is ignored
    expect(mockRefundAiTags).toHaveBeenCalledTimes(1);
    expect(mockRefundAiTags).toHaveBeenCalledWith('org1', 3);
  });

  it('settle(all) refunds nothing; settle clamps out-of-range values', async () => {
    const res = mockRes();
    await organizerAiGate({ units: () => 3 })(organizerReq(), res, jest.fn());
    await getAiGate(res)!.settle(99);
    expect(mockRefundAiTags).not.toHaveBeenCalled();
    const res2 = mockRes();
    await organizerAiGate({ units: () => 3 })(organizerReq(), res2, jest.fn());
    await getAiGate(res2)!.settle(NaN);
    expect(mockRefundAiTags).toHaveBeenCalledWith('org1', 3);
  });

  it('refunds the whole reservation when the response finishes without the handler settling', async () => {
    const res = mockRes();
    await organizerAiGate({ units: () => 4 })(organizerReq(), res, jest.fn());
    res.emit('finish');
    await Promise.resolve();
    await Promise.resolve();
    expect(mockRefundAiTags).toHaveBeenCalledWith('org1', 4);
  });

  it('a settled call is not refunded again by the finish safety net', async () => {
    const res = mockRes();
    await organizerAiGate({ units: () => 4 })(organizerReq(), res, jest.fn());
    await getAiGate(res)!.settle(4);
    res.emit('finish');
    await Promise.resolve();
    expect(mockRefundAiTags).not.toHaveBeenCalled();
  });

  it('does not refund on a client disconnect (close is deliberately not a refund trigger)', async () => {
    const res = mockRes();
    await organizerAiGate({ units: () => 4 })(organizerReq(), res, jest.fn());
    res.emit('close');
    await Promise.resolve();
    expect(mockRefundAiTags).not.toHaveBeenCalled();
  });

  it('concurrent requests cannot collectively overspend: the atomic reserve is what limits them', async () => {
    let used = 0;
    mockReserveAiTags.mockImplementation(async (_o: string, _t: string, units: number) => {
      if (used + units > 5) return denied({ used, remaining: 5 - used, exceeded: false });
      used += units;
      return reserved(units, used - units, 5);
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const res = mockRes();
        const next = jest.fn();
        await organizerAiGate()(organizerReq(), res, next);
        return next.mock.calls.length === 1;
      })
    );
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it('403s a sale that belongs to another organizer and never checks quota', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({ organizerId: 'someone-else' });
    const res = mockRes();
    const next = jest.fn();
    await organizerAiGate()(organizerReq({ body: { saleId: 'sale1' } }), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(mockReserveAiTags).not.toHaveBeenCalled();
  });

  it('404s an unknown sale', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await organizerAiGate()(organizerReq({ body: { saleId: 'nope' } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('403s a user with no organizer profile', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await organizerAiGate()(organizerReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('requires saleId when requireSaleId is set, and rejects a non-string saleId', async () => {
    const res1 = mockRes();
    await organizerAiGate({ requireSaleId: true })(organizerReq(), res1, jest.fn());
    expect(res1.status).toHaveBeenCalledWith(400);
    const res2 = mockRes();
    await organizerAiGate()(organizerReq({ body: { saleId: { $ne: 1 } } }), res2, jest.fn());
    expect(res2.status).toHaveBeenCalledWith(400);
  });

  it('allows a missing saleId when it is optional (no ownership lookup)', async () => {
    const next = jest.fn();
    await organizerAiGate()(organizerReq(), mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(mockPrisma.sale.findUnique).not.toHaveBeenCalled();
  });

  it('429s AI_QUOTA_EXCEEDED when the monthly quota is used up', async () => {
    mockReserveAiTags.mockResolvedValue(denied());
    const res = mockRes();
    const next = jest.fn();
    await organizerAiGate()(organizerReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json.mock.calls[0][0].code).toBe('AI_QUOTA_EXCEEDED');
    expect(next).not.toHaveBeenCalled();
  });

  it('429s when the call needs more Smart tags than remain', async () => {
    mockReserveAiTags.mockResolvedValue(denied({ exceeded: false, used: 97, remaining: 3 }));
    const res = mockRes();
    await organizerAiGate({ units: () => 8 })(organizerReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json.mock.calls[0][0].remaining).toBe(3);
  });

  it('Organizer.subscriptionTier is the truth: a lapse flag on the user does NOT downgrade PRO (decisions D1/D2)', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'PRO' });
    const res = mockRes();
    await organizerAiGate()(organizerReq({ user: { id: 'u1', roles: ['ORGANIZER'], subscriptionLapsed: true } }), res, jest.fn());
    expect(mockReserveAiTags).toHaveBeenCalledWith('org1', 'PRO', 1);
  });

  it('serialises an unlimited (Infinity) TEAMS quota without leaking Infinity', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'TEAMS' });
    mockReserveAiTags.mockResolvedValue(denied({ used: 5, limit: Infinity, remaining: Infinity }));
    const res = mockRes();
    await organizerAiGate()(organizerReq(), res, jest.fn());
    const body = res.json.mock.calls[0][0];
    expect(body.limit).toBeNull();
    expect(body.remaining).toBeNull();
  });

  it('fails closed with 500 when a lookup throws', async () => {
    mockPrisma.organizer.findUnique.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    const next = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await organizerAiGate()(organizerReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('recordAiUsage', () => {
  it('increments the organizer counter and ignores non-positive counts', () => {
    recordAiUsage('org1', 2);
    recordAiUsage('org1', 0);
    recordAiUsage('', 1);
    expect(mockIncrementAiTagCount).toHaveBeenCalledTimes(1);
    expect(mockIncrementAiTagCount).toHaveBeenCalledWith('org1', 2);
  });
});

describe('batch-analyze SSRF guard', () => {
  const okUrl = 'https://res.cloudinary.com/demo/image/upload/v1/findasale/a.jpg';
  it('accepts https Cloudinary delivery URLs only', () => {
    expect(isAllowedImageUrl(okUrl)).toBe(true);
    expect(isAllowedImageUrl('http://res.cloudinary.com/demo/image/upload/a.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedImageUrl('https://localhost/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://res.cloudinary.com.evil.example/a.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://user:pw@res.cloudinary.com/demo/a.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://res.cloudinary.com:8443/demo/a.jpg')).toBe(false);
    expect(isAllowedImageUrl('not a url')).toBe(false);
    expect(isAllowedImageUrl(42)).toBe(false);
  });

  it('pins the path to our own cloud when CLOUDINARY_CLOUD_NAME is set', () => {
    const prev = process.env.CLOUDINARY_CLOUD_NAME;
    process.env.CLOUDINARY_CLOUD_NAME = 'mycloud';
    try {
      expect(isAllowedImageUrl('https://res.cloudinary.com/mycloud/image/upload/a.jpg')).toBe(true);
      expect(isAllowedImageUrl('https://res.cloudinary.com/othercloud/image/upload/a.jpg')).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
      else process.env.CLOUDINARY_CLOUD_NAME = prev;
    }
  });

  it('validateBatchImageUrls 400s a bad url, an oversize batch, and passes non-array bodies through', () => {
    const bad = mockRes();
    const nextBad = jest.fn();
    validateBatchImageUrls({ body: { imageUrls: [okUrl, 'https://internal.example.local/x'] } } as any, bad, nextBad);
    expect(bad.status).toHaveBeenCalledWith(400);
    expect(nextBad).not.toHaveBeenCalled();

    const big = mockRes();
    validateBatchImageUrls({ body: { imageUrls: Array(MAX_BATCH_ANALYZE_IMAGES + 1).fill(okUrl) } } as any, big, jest.fn());
    expect(big.status).toHaveBeenCalledWith(400);

    const good = jest.fn();
    validateBatchImageUrls({ body: { imageUrls: [okUrl] } } as any, mockRes(), good);
    expect(good).toHaveBeenCalled();

    const passThrough = jest.fn();
    validateBatchImageUrls({ body: {} } as any, mockRes(), passThrough);
    expect(passThrough).toHaveBeenCalled();
  });
});

describe('resolveTier (shared by the rapidfire quota lookup)', () => {
  it('an unknown tier is SIMPLE; a valid tier is kept even when a legacy lapse flag is passed (no lapse downgrade)', () => {
    expect(resolveTier('PRO', true)).toBe('PRO');
    expect(resolveTier('NOT_A_TIER', false)).toBe('SIMPLE');
    expect(resolveTier(undefined, false)).toBe('SIMPLE');
    expect(resolveTier('PRO', false)).toBe('PRO');
    expect(resolveTier('TEAMS', false)).toBe('TEAMS');
  });
});

describe('batch-analyze quota pre-check counts one Smart tag per photo', () => {
  it('429s when the batch has more photos than tags remaining, and passes when enough remain', async () => {
    const urls = Array(12).fill('https://res.cloudinary.com/demo/image/upload/a.jpg');
    const gate = organizerAiGate({ requireSaleId: true, units: (req: any) => (Array.isArray(req.body?.imageUrls) ? req.body.imageUrls.length : 1) });

    mockReserveAiTags.mockResolvedValueOnce(denied({ exceeded: false, used: 95, remaining: 5 }));
    const tooMany = mockRes();
    await gate(organizerReq({ body: { saleId: 'sale1', imageUrls: urls } }), tooMany, jest.fn());
    expect(tooMany.status).toHaveBeenCalledWith(429);

    const next = jest.fn();
    await gate(organizerReq({ body: { saleId: 'sale1', imageUrls: urls } }), mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(mockReserveAiTags).toHaveBeenLastCalledWith('org1', 'SIMPLE', 12);
  });
});
