/**
 * Creator Program service tests (2026-09-29): opt-in gate, click fraud rules, attribution validation,
 * commission ledger (idempotent, self-referral blocked, hold and reversal states).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 * Prisma is mocked, nothing here touches a database or a payment provider.
 */
const m = {
  creatorProfile: { findUnique: jest.fn(), create: jest.fn() },
  affiliateLink: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
  affiliateClick: { create: jest.fn() },
  affiliateConversion: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  purchase: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  sale: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('../lib/prisma', () => ({ prisma: m }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));

import {
  CreatorError,
  commissionStateOf,
  getCreatorAccess,
  isCreatorCode,
  isLikelyBot,
  joinCreatorProgram,
  listAdminCommissions,
  recordAffiliateClick,
  recordAffiliateConversion,
  resolveAffiliateAttribution,
  settleCommission,
} from '../services/creatorAffiliateService';
import { CREATOR_PROGRAM, calculateCreatorCommissionCents } from '../config/affiliateConfig';

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  jest.clearAllMocks();
  m.$transaction.mockImplementation(async (fn: any) => fn(m));
  m.affiliateLink.update.mockResolvedValue({});
  m.affiliateClick.create.mockResolvedValue({});
  m.purchase.update.mockResolvedValue({});
});

describe('calculateCreatorCommissionCents', () => {
  it('takes the configured share of the platform fee, rounded down', () => {
    expect(calculateCreatorCommissionCents(500)).toBe(50); // 10% of $5.00
    expect(calculateCreatorCommissionCents(333)).toBe(33); // 33.3 floors to 33
    expect(calculateCreatorCommissionCents(1, 1000)).toBe(0);
  });
  it('never pays on a zero or negative fee', () => {
    expect(calculateCreatorCommissionCents(0)).toBe(0);
    expect(calculateCreatorCommissionCents(-200)).toBe(0);
  });
});

describe('small helpers', () => {
  it('recognises creator codes and rejects cuids', () => {
    expect(isCreatorCode('CRT_K9X2L4')).toBe(true);
    expect(isCreatorCode('crt_k9x2l4')).toBe(true);
    expect(isCreatorCode('cmabc123def456ghi789jkl0')).toBe(false);
  });
  it('treats missing and crawler user agents as bots', () => {
    expect(isLikelyBot(undefined)).toBe(true);
    expect(isLikelyBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isLikelyBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBe(false);
  });
});

describe('commissionStateOf', () => {
  const now = new Date('2026-10-20T00:00:00Z');
  const base = { payoutStatus: 'UNPAID', eligibleAt: new Date(now.getTime() + DAY), purchase: { status: 'PAID' } };
  it('is PENDING inside the hold window and APPROVED after it', () => {
    expect(commissionStateOf(base, now)).toBe('PENDING');
    expect(commissionStateOf({ ...base, eligibleAt: new Date(now.getTime() - DAY) }, now)).toBe('APPROVED');
  });
  it('is PAID once paid, and REVERSED for refunded, disputed or voided purchases', () => {
    expect(commissionStateOf({ ...base, payoutStatus: 'PAID' }, now)).toBe('PAID');
    expect(commissionStateOf({ ...base, purchase: { status: 'REFUNDED' } }, now)).toBe('REVERSED');
    expect(commissionStateOf({ ...base, purchase: { status: 'DISPUTED' } }, now)).toBe('REVERSED');
    expect(commissionStateOf({ ...base, payoutStatus: 'VOIDED' }, now)).toBe('REVERSED');
  });
  it('never pays out a reversed commission even if marked PAID and then refunded', () => {
    expect(commissionStateOf({ ...base, payoutStatus: 'PAID', purchase: { status: 'REFUNDED' } }, now)).toBe('REVERSED');
  });
});

describe('getCreatorAccess', () => {
  it('allows an ACTIVE profile without any role string', async () => {
    m.creatorProfile.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    expect((await getCreatorAccess({ id: 'u1', role: 'SHOPPER' })).allowed).toBe(true);
  });
  it('keeps the legacy CREATOR role as an OR when there is no profile', async () => {
    m.creatorProfile.findUnique.mockResolvedValue(null);
    expect((await getCreatorAccess({ id: 'u1', role: 'CREATOR' })).allowed).toBe(true);
    expect((await getCreatorAccess({ id: 'u1', role: 'SHOPPER' })).allowed).toBe(false);
  });
  it('a suspended profile blocks even the legacy role', async () => {
    m.creatorProfile.findUnique.mockResolvedValue({ status: 'SUSPENDED' });
    const access = await getCreatorAccess({ id: 'u1', role: 'CREATOR' });
    expect(access.allowed).toBe(false);
    expect(access.suspended).toBe(true);
  });
});

describe('joinCreatorProgram', () => {
  const okInput = { acceptTerms: true, termsVersion: CREATOR_PROGRAM.TERMS_VERSION, displayName: '  Thrift  Queen ' };

  it('returns an existing profile unchanged (idempotent)', async () => {
    const existing = { userId: 'u1', code: 'CRT_AAAAAA', status: 'ACTIVE' };
    m.creatorProfile.findUnique.mockResolvedValue(existing);
    await expect(joinCreatorProgram({ id: 'u1', emailVerified: true }, okInput)).resolves.toBe(existing);
    expect(m.creatorProfile.create).not.toHaveBeenCalled();
  });
  it('requires accepting the terms', async () => {
    m.creatorProfile.findUnique.mockResolvedValue(null);
    await expect(joinCreatorProgram({ id: 'u1', emailVerified: true }, { ...okInput, acceptTerms: false })).rejects.toMatchObject({
      code: 'TERMS_NOT_ACCEPTED',
    });
  });
  it('rejects a stale terms version', async () => {
    m.creatorProfile.findUnique.mockResolvedValue(null);
    await expect(joinCreatorProgram({ id: 'u1', emailVerified: true }, { ...okInput, termsVersion: '2000-01-01' })).rejects.toMatchObject({
      code: 'TERMS_VERSION_MISMATCH',
    });
  });
  it('requires a verified email', async () => {
    m.creatorProfile.findUnique.mockResolvedValue(null);
    await expect(joinCreatorProgram({ id: 'u1', emailVerified: false }, okInput)).rejects.toBeInstanceOf(CreatorError);
    expect(m.creatorProfile.create).not.toHaveBeenCalled();
  });
  it('creates a profile with a CRT_ code and a cleaned display name', async () => {
    m.creatorProfile.findUnique.mockResolvedValue(null);
    m.creatorProfile.create.mockImplementation(async ({ data }: any) => data);
    const profile: any = await joinCreatorProgram({ id: 'u1', emailVerified: true }, okInput);
    expect(profile.code).toMatch(/^CRT_[A-Z2-9]{6}$/);
    expect(profile.displayName).toBe('Thrift Queen');
    expect(profile.termsVersion).toBe(CREATOR_PROGRAM.TERMS_VERSION);
  });
  it('retries on a code collision', async () => {
    m.creatorProfile.findUnique.mockResolvedValue(null);
    m.creatorProfile.create
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockImplementationOnce(async ({ data }: any) => data);
    const profile: any = await joinCreatorProgram({ id: 'u1', emailVerified: true }, okInput);
    expect(profile.userId).toBe('u1');
    expect(m.creatorProfile.create).toHaveBeenCalledTimes(2);
  });
});

describe('recordAffiliateClick', () => {
  const link = { id: 'l1', userId: 'creator1', saleId: 's1' };
  const browser = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

  beforeEach(() => {
    m.affiliateLink.findUnique.mockResolvedValue(link);
    m.user.findUnique.mockResolvedValue({ id: 'creator1', role: 'SHOPPER', roles: [] });
    m.creatorProfile.findUnique.mockResolvedValue({ status: 'ACTIVE', userId: 'creator1' });
    m.sale.findUnique.mockResolvedValue({ id: 's1', status: 'PUBLISHED', deletedAt: null });
  });

  it('returns null for an unknown link', async () => {
    m.affiliateLink.findUnique.mockResolvedValue(null);
    expect(await recordAffiliateClick({ idOrCode: 'nope', ip: '1.1.1.1', userAgent: browser })).toBeNull();
  });
  it('counts a first click and attributes it', async () => {
    const r = await recordAffiliateClick({ idOrCode: 'l1', ip: '1.1.1.1', userAgent: browser });
    expect(r).toEqual({ saleId: 's1', affiliateLinkId: 'l1', counted: true });
    expect(m.affiliateClick.create).toHaveBeenCalledTimes(1);
    expect(m.affiliateLink.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { clicks: { increment: 1 } } });
  });
  it('stores a hashed IP, never the raw one', async () => {
    await recordAffiliateClick({ idOrCode: 'l1', ip: '203.0.113.9', userAgent: browser });
    const data = m.affiliateClick.create.mock.calls[0][0].data;
    expect(data.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(data)).not.toContain('203.0.113.9');
  });
  it('does not double count the same IP on the same day but still attributes', async () => {
    m.affiliateClick.create.mockRejectedValue({ code: 'P2002' });
    const r = await recordAffiliateClick({ idOrCode: 'l1', ip: '1.1.1.1', userAgent: browser });
    expect(r).toEqual({ saleId: 's1', affiliateLinkId: 'l1', counted: false });
    expect(m.affiliateLink.update).not.toHaveBeenCalled();
  });
  it('never counts bots', async () => {
    const r = await recordAffiliateClick({ idOrCode: 'l1', ip: '1.1.1.1', userAgent: 'Googlebot/2.1' });
    expect(r?.counted).toBe(false);
    expect(m.affiliateClick.create).not.toHaveBeenCalled();
  });
  it('a creator clicking their own link is neither counted nor attributed', async () => {
    const r = await recordAffiliateClick({ idOrCode: 'l1', ip: '1.1.1.1', userAgent: browser, viewerUserId: 'creator1' });
    expect(r).toEqual({ saleId: 's1', affiliateLinkId: null, counted: false });
    expect(m.affiliateClick.create).not.toHaveBeenCalled();
  });
  it('a link to a sale that is no longer public redirects but attributes nothing', async () => {
    m.sale.findUnique.mockResolvedValue({ id: 's1', status: 'ENDED', deletedAt: null });
    const r = await recordAffiliateClick({ idOrCode: 'l1', ip: '1.1.1.1', userAgent: browser });
    expect(r?.affiliateLinkId).toBeNull();
    expect(r?.counted).toBe(false);
  });
  it('a suspended creator earns no attribution', async () => {
    m.creatorProfile.findUnique.mockResolvedValue({ status: 'SUSPENDED', userId: 'creator1' });
    const r = await recordAffiliateClick({ idOrCode: 'l1', ip: '1.1.1.1', userAgent: browser });
    expect(r?.affiliateLinkId).toBeNull();
  });
});

describe('resolveAffiliateAttribution', () => {
  const link = {
    id: 'l1',
    userId: 'creator1',
    saleId: 's1',
    user: { email: 'creator@example.com', role: 'SHOPPER', roles: [] },
    sale: { organizer: { userId: 'org1' } },
  };
  beforeEach(() => {
    m.affiliateLink.findUnique.mockResolvedValue(link);
    m.creatorProfile.findUnique.mockResolvedValue({ status: 'ACTIVE' });
  });

  it('returns the id for a valid link on the right sale', async () => {
    expect(await resolveAffiliateAttribution({ affiliateLinkId: 'l1', saleId: 's1', buyerUserId: 'buyer1' })).toBe('l1');
  });
  it('ignores garbage input without touching the database', async () => {
    expect(await resolveAffiliateAttribution({ affiliateLinkId: 42, saleId: 's1' })).toBeNull();
    expect(await resolveAffiliateAttribution({ affiliateLinkId: '', saleId: 's1' })).toBeNull();
    expect(await resolveAffiliateAttribution({ affiliateLinkId: 'l1', saleId: null })).toBeNull();
    expect(m.affiliateLink.findUnique).not.toHaveBeenCalled();
  });
  it('rejects a link for a different sale', async () => {
    expect(await resolveAffiliateAttribution({ affiliateLinkId: 'l1', saleId: 'other' })).toBeNull();
  });
  it('blocks self-referral by account, email and sale ownership', async () => {
    expect(await resolveAffiliateAttribution({ affiliateLinkId: 'l1', saleId: 's1', buyerUserId: 'creator1' })).toBeNull();
    expect(await resolveAffiliateAttribution({ affiliateLinkId: 'l1', saleId: 's1', buyerEmail: ' Creator@Example.com ' })).toBeNull();
    m.affiliateLink.findUnique.mockResolvedValue({ ...link, sale: { organizer: { userId: 'creator1' } } });
    expect(await resolveAffiliateAttribution({ affiliateLinkId: 'l1', saleId: 's1', buyerUserId: 'buyer1' })).toBeNull();
  });
  it('never throws: a database error means no attribution', async () => {
    m.affiliateLink.findUnique.mockRejectedValue(new Error('db down'));
    await expect(resolveAffiliateAttribution({ affiliateLinkId: 'l1', saleId: 's1' })).resolves.toBeNull();
  });
});

describe('recordAffiliateConversion', () => {
  const created = new Date('2026-10-01T00:00:00Z');
  const purchase = {
    id: 'p1',
    status: 'PAID',
    amount: 100,
    platformFeeAmount: 5,
    cashDebtCollectedAmount: 0,
    isTestTransaction: false,
    userId: 'buyer1',
    buyerEmail: 'buyer@example.com',
    buyerCardFingerprint: 'fp_buyer',
    saleId: 's1',
    affiliateLinkId: 'l1',
    createdAt: created,
    sale: { title: 'Big Sale', organizer: { userId: 'org1' } },
  };
  const link = {
    id: 'l1',
    userId: 'creator1',
    user: { id: 'creator1', email: 'creator@example.com', role: 'SHOPPER', roles: [], stripeCardFingerprint: 'fp_creator' },
  };

  beforeEach(() => {
    m.purchase.findUnique.mockResolvedValue(purchase);
    m.affiliateLink.findUnique.mockResolvedValue(link);
    m.creatorProfile.findUnique.mockResolvedValue({ status: 'ACTIVE', notifyOnCommission: true });
    m.affiliateConversion.findUnique.mockResolvedValue(null);
    m.affiliateConversion.create.mockResolvedValue({});
  });

  it('writes the ledger row with the commission on the platform fee and a 30 day hold', async () => {
    const r = await recordAffiliateConversion('p1');
    expect(r).toEqual({ recorded: true, commissionCents: 50 });
    const data = m.affiliateConversion.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      purchaseId: 'p1',
      affiliateLinkId: 'l1',
      creatorUserId: 'creator1',
      purchaseAmountCents: 10000,
      platformFeeCents: 500,
      commissionRateBps: CREATOR_PROGRAM.COMMISSION_RATE_BPS,
      commissionCents: 50,
    });
    expect(data.eligibleAt.getTime()).toBe(created.getTime() + CREATOR_PROGRAM.HOLD_DAYS * DAY);
    expect(m.affiliateLink.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { conversions: { increment: 1 } } });
  });
  it('excludes fee collected against cash debt from the commission base', async () => {
    m.purchase.findUnique.mockResolvedValue({ ...purchase, cashDebtCollectedAmount: 3 });
    const r = await recordAffiliateConversion('p1');
    expect(r.commissionCents).toBe(20); // (5.00 - 3.00) * 10%
  });
  it('is idempotent: a retry records nothing and does not bump the counter', async () => {
    m.affiliateConversion.findUnique.mockResolvedValue({ id: 'c1' });
    expect(await recordAffiliateConversion('p1')).toEqual({ recorded: false, reason: 'ALREADY_RECORDED' });
    expect(m.affiliateConversion.create).not.toHaveBeenCalled();
    expect(m.affiliateLink.update).not.toHaveBeenCalled();
  });
  it('treats a unique violation from a concurrent call as already recorded', async () => {
    m.$transaction.mockRejectedValue({ code: 'P2002' });
    expect(await recordAffiliateConversion('p1')).toEqual({ recorded: false, reason: 'ALREADY_RECORDED' });
  });
  it('skips purchases that are not PAID, are test transactions, or carry no link', async () => {
    m.purchase.findUnique.mockResolvedValue({ ...purchase, status: 'PENDING' });
    expect((await recordAffiliateConversion('p1')).reason).toBe('NOT_PAID');
    m.purchase.findUnique.mockResolvedValue({ ...purchase, isTestTransaction: true });
    expect((await recordAffiliateConversion('p1')).reason).toBe('TEST_TRANSACTION');
    m.purchase.findUnique.mockResolvedValue({ ...purchase, affiliateLinkId: null });
    expect((await recordAffiliateConversion('p1')).reason).toBe('NO_AFFILIATE_LINK');
    expect(m.affiliateConversion.create).not.toHaveBeenCalled();
  });
  it('blocks self-referral (same account, same email, sale organizer, same card) and clears the attribution', async () => {
    const cases = [
      { ...purchase, userId: 'creator1' },
      { ...purchase, buyerEmail: 'CREATOR@example.com' },
      { ...purchase, sale: { title: 'x', organizer: { userId: 'creator1' } } },
      { ...purchase, buyerCardFingerprint: 'fp_creator' },
    ];
    for (const p of cases) {
      m.purchase.update.mockClear();
      m.purchase.findUnique.mockResolvedValue(p);
      expect((await recordAffiliateConversion('p1')).reason).toBe('SELF_REFERRAL');
      expect(m.purchase.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { affiliateLinkId: null } });
    }
    expect(m.affiliateConversion.create).not.toHaveBeenCalled();
  });
  it('does not credit a creator who is no longer allowed', async () => {
    m.creatorProfile.findUnique.mockResolvedValue({ status: 'SUSPENDED' });
    expect((await recordAffiliateConversion('p1')).reason).toBe('CREATOR_NOT_ALLOWED');
  });
  it('never throws', async () => {
    m.purchase.findUnique.mockRejectedValue(new Error('db down'));
    await expect(recordAffiliateConversion('p1')).resolves.toEqual({ recorded: false, reason: 'ERROR' });
  });
});

describe('admin ledger', () => {
  const now = new Date('2026-10-20T00:00:00Z');
  const row = (over: Record<string, any> = {}) => ({
    id: 'c1',
    createdAt: new Date(now.getTime() - 40 * DAY),
    eligibleAt: new Date(now.getTime() - 10 * DAY),
    commissionCents: 50,
    commissionRateBps: 1000,
    purchaseAmountCents: 10000,
    platformFeeCents: 500,
    payoutStatus: 'UNPAID',
    paidAt: null,
    payoutNote: null,
    purchase: { status: 'PAID' },
    affiliateLink: { sale: { title: 'Big Sale' } },
    creator: { id: 'creator1', name: 'Cee', email: 'cee@example.com', creatorProfile: { code: 'CRT_AAAAAA' } },
    ...over,
  });

  it('lists with derived states, totals and a state filter', async () => {
    m.affiliateConversion.findMany.mockResolvedValue([
      row({ id: 'a' }), // approved
      row({ id: 'b', eligibleAt: new Date(now.getTime() + DAY) }), // pending
      row({ id: 'c', payoutStatus: 'PAID' }), // paid
      row({ id: 'd', purchase: { status: 'REFUNDED' } }), // reversed
    ]);
    const all = await listAdminCommissions({}, now);
    expect(all.totalsCents).toEqual({ pending: 50, approved: 50, paid: 50, reversed: 50, clawbackDue: 0 });
    expect(all.pagination.total).toBe(4);
    const approved = await listAdminCommissions({ state: 'approved' }, now);
    expect(approved.commissions.map((c) => c.id)).toEqual(['a']);
    expect(approved.commissions[0].creator.code).toBe('CRT_AAAAAA');
  });

  it('marks an approved commission paid, conditionally on it still being unpaid', async () => {
    m.affiliateConversion.findUnique.mockResolvedValue(row({ creatorUserId: 'creator1' }));
    m.affiliateConversion.updateMany.mockResolvedValue({ count: 1 });
    await expect(settleCommission('c1', 'PAID', ' Venmo 123 ', now)).resolves.toEqual({ id: 'c1', payoutStatus: 'PAID' });
    // Atomic mark-paid (money review P2): every eligibility rule is in the ONE conditional write, so a
    // refund landing between the read and the write cannot be paid out.
    expect(m.affiliateConversion.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'c1',
        payoutStatus: 'UNPAID',
        eligibleAt: { lte: now },
        purchase: { is: { status: { notIn: ['REFUNDED', 'REFUNDING', 'DISPUTED', 'DISPUTE_LOST', 'FAILED'] } } },
      },
      data: { payoutStatus: 'PAID', payoutNote: 'Venmo 123', paidAt: now },
    });
  });
  it('a refund that lands after the read is not paid: the conditional write matches nothing and the reason is reported', async () => {
    m.affiliateConversion.findUnique
      .mockResolvedValueOnce(row()) // looked payable at read time
      .mockResolvedValueOnce(row({ purchase: { status: 'REFUNDED' } })); // refunded before the write
    m.affiliateConversion.updateMany.mockResolvedValue({ count: 0 });
    await expect(settleCommission('c1', 'PAID', '', now)).rejects.toMatchObject({ code: 'NOT_PAYABLE', status: 409 });
  });
  it('refuses to pay a commission still in its hold window, reversed, or already paid', async () => {
    m.affiliateConversion.findUnique.mockResolvedValue(row({ eligibleAt: new Date(now.getTime() + DAY) }));
    await expect(settleCommission('c1', 'PAID', '', now)).rejects.toMatchObject({ code: 'NOT_PAYABLE', status: 409 });
    m.affiliateConversion.findUnique.mockResolvedValue(row({ purchase: { status: 'DISPUTED' } }));
    await expect(settleCommission('c1', 'PAID', '', now)).rejects.toMatchObject({ code: 'NOT_PAYABLE' });
    m.affiliateConversion.findUnique.mockResolvedValue(row({ payoutStatus: 'PAID' }));
    await expect(settleCommission('c1', 'PAID', '', now)).rejects.toMatchObject({ code: 'NOT_PAYABLE' });
    expect(m.affiliateConversion.updateMany).not.toHaveBeenCalled();
  });
  it('reports a lost race as already settled', async () => {
    m.affiliateConversion.findUnique.mockResolvedValue(row());
    m.affiliateConversion.updateMany.mockResolvedValue({ count: 0 });
    await expect(settleCommission('c1', 'PAID', '', now)).rejects.toMatchObject({ code: 'ALREADY_SETTLED' });
  });
  it('voiding requires a note and only works on unpaid commissions', async () => {
    await expect(settleCommission('c1', 'VOIDED', '   ', now)).rejects.toMatchObject({ code: 'NOTE_REQUIRED' });
    m.affiliateConversion.findUnique.mockResolvedValue(row({ payoutStatus: 'PAID' }));
    await expect(settleCommission('c1', 'VOIDED', 'fraud', now)).rejects.toMatchObject({ code: 'NOT_VOIDABLE' });
    m.affiliateConversion.findUnique.mockResolvedValue(row());
    m.affiliateConversion.updateMany.mockResolvedValue({ count: 1 });
    await expect(settleCommission('c1', 'VOIDED', 'fraud', now)).resolves.toEqual({ id: 'c1', payoutStatus: 'VOIDED' });
  });
  it('404s for an unknown commission', async () => {
    m.affiliateConversion.findUnique.mockResolvedValue(null);
    await expect(settleCommission('nope', 'PAID', '', now)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('admin ledger, clawback and pagination (money review P2)', () => {
  const now = new Date('2026-10-20T00:00:00Z');
  const row = (over: Record<string, any> = {}) => ({
    id: 'c1',
    createdAt: new Date(now.getTime() - 40 * DAY),
    eligibleAt: new Date(now.getTime() - 10 * DAY),
    commissionCents: 50,
    commissionRateBps: 1000,
    purchaseAmountCents: 10000,
    platformFeeCents: 500,
    payoutStatus: 'UNPAID',
    paidAt: null,
    payoutNote: null,
    purchase: { status: 'PAID' },
    affiliateLink: { sale: { title: 'Big Sale' } },
    creator: { id: 'creator1', name: 'Cee', email: 'cee@example.com', creatorProfile: { code: 'CRT_AAAAAA' } },
    ...over,
  });
  const many = (n: number) => Array.from({ length: n }, (_, i) => row({ id: `r${String(i).padStart(4, '0')}` }));

  it('reads past the old 2000-row cap in batches instead of dropping the rest', async () => {
    const all = many(2500);
    m.affiliateConversion.findMany.mockImplementation(async (args: any) => {
      const start = args.cursor ? all.findIndex((r) => r.id === args.cursor.id) + 1 : 0;
      return all.slice(start, start + args.take);
    });
    const res = await listAdminCommissions({ limit: 100 }, now);
    expect(res.pagination.total).toBe(2500);
    expect(res.truncated).toBe(false);
    expect(res.totalsCents.approved).toBe(2500 * 50);
    expect(m.affiliateConversion.findMany.mock.calls.length).toBeGreaterThan(1);
  });

  it('pages with an opaque cursor: each page starts after the last id of the previous one, ends with a null cursor', async () => {
    m.affiliateConversion.findMany.mockResolvedValue(many(5));
    const first = await listAdminCommissions({ limit: 2 }, now);
    expect(first.commissions.map((c) => c.id)).toEqual(['r0000', 'r0001']);
    expect(first.nextCursor).toBe('r0001');
    const second = await listAdminCommissions({ limit: 2, cursor: first.nextCursor }, now);
    expect(second.commissions.map((c) => c.id)).toEqual(['r0002', 'r0003']);
    const third = await listAdminCommissions({ limit: 2, cursor: second.nextCursor }, now);
    expect(third.commissions.map((c) => c.id)).toEqual(['r0004']);
    expect(third.nextCursor).toBeNull();
  });

  it('flags a commission already PAID whose purchase was later refunded as clawbackDue and totals it', async () => {
    m.affiliateConversion.findMany.mockResolvedValue([
      row({ id: 'a', payoutStatus: 'PAID', purchase: { status: 'REFUNDED' } }),
      row({ id: 'b', payoutStatus: 'UNPAID', purchase: { status: 'REFUNDED' } }),
    ]);
    const res = await listAdminCommissions({}, now);
    expect(res.commissions.find((c) => c.id === 'a')).toMatchObject({ state: 'REVERSED', clawbackDue: true });
    expect(res.commissions.find((c) => c.id === 'b')).toMatchObject({ state: 'REVERSED', clawbackDue: false });
    expect(res.totalsCents.clawbackDue).toBe(50);
  });

  it('records a clawback only for a paid commission whose purchase was reversed, with a note', async () => {
    await expect(settleCommission('c1', 'CLAWBACK', '  ', now)).rejects.toMatchObject({ code: 'NOTE_REQUIRED' });
    m.affiliateConversion.findUnique.mockResolvedValue(row({ payoutStatus: 'UNPAID', purchase: { status: 'REFUNDED' } }));
    await expect(settleCommission('c1', 'CLAWBACK', 'asked creator to repay', now)).rejects.toMatchObject({ code: 'NOT_CLAWBACKABLE' });
    m.affiliateConversion.findUnique.mockResolvedValue(row({ payoutStatus: 'PAID', purchase: { status: 'PAID' } }));
    await expect(settleCommission('c1', 'CLAWBACK', 'asked creator to repay', now)).rejects.toMatchObject({ code: 'NOT_REVERSED' });
    expect(m.affiliateConversion.updateMany).not.toHaveBeenCalled();

    m.affiliateConversion.findUnique.mockResolvedValue(row({ payoutStatus: 'PAID', payoutNote: 'Venmo 1', purchase: { status: 'REFUNDED' } }));
    m.affiliateConversion.updateMany.mockResolvedValue({ count: 1 });
    await expect(settleCommission('c1', 'CLAWBACK', 'asked creator to repay', now)).resolves.toEqual({ id: 'c1', payoutStatus: 'CLAWBACK_RECORDED' });
    const call = m.affiliateConversion.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: 'c1', payoutStatus: 'PAID' });
    expect(call.data.payoutStatus).toBe('CLAWBACK_RECORDED');
    expect(call.data.payoutNote).toBe('Venmo 1 | Clawback recorded: asked creator to repay');
  });
});
