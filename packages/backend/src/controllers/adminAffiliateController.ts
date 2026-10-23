import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { listAdminCommissions, settleCommission } from '../services/creatorAffiliateService';
import { sendCreatorError } from './creatorAffiliateController';
import { reviewReferral } from '../services/affiliateService';
import { getCreditBalance } from '../services/subscriptionCreditService';

// GET /api/admin/affiliate/creators
// Returns paginated list of users who have an AffiliateCode or at least one AffiliateLink,
// along with their stats: totalClicks, totalConversions, totalReferrals, convertedReferrals,
// totalEarnings (payoutAmountCents sum), affiliateCode, joinedAt
export const getCreators = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '25', 10)));
    const search = ((req.query.search as string) || '').trim();
    const offset = (page - 1) * limit;

    // Build search condition
    const searchCondition = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    // Find userIds who have an AffiliateCode
    const codeUserIds = await prisma.affiliateCode
      .findMany({ select: { userId: true } })
      .then((rows) => rows.map((r) => r.userId));

    // Base where: has AffiliateCode OR has at least one AffiliateLink
    const baseWhere: any = {
      ...searchCondition,
      OR: [
        { affiliateLinks: { some: {} } },
        { id: { in: codeUserIds } },
      ],
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: baseWhere,
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          affiliateLinks: {
            select: {
              clicks: true,
              conversions: true,
            },
          },
          affiliateReferralsGiven: {
            select: {
              id: true,
              status: true,
              qualifiedAt: true,
              payoutAmountCents: true,
              paidAt: true,
              referredUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  createdAt: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.user.count({ where: baseWhere }),
    ]);

    // Fetch affiliate codes for these users in one query
    const userIds = users.map((u) => u.id);
    const affiliateCodes = await prisma.affiliateCode.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, code: true },
    });
    const codeByUserId = new Map(affiliateCodes.map((c) => [c.userId, c.code]));

    // Compute aggregate stats per user
    const creators = users.map((u) => {
      const totalClicks = u.affiliateLinks.reduce((sum, l) => sum + l.clicks, 0);
      const totalConversions = u.affiliateLinks.reduce((sum, l) => sum + l.conversions, 0);
      const totalReferrals = u.affiliateReferralsGiven.length;
      const convertedReferrals = u.affiliateReferralsGiven.filter(
        (r) => r.status === 'QUALIFIED' || r.status === 'PAID'
      ).length;
      const totalEarningsCents = u.affiliateReferralsGiven.reduce(
        (sum, r) => sum + (r.payoutAmountCents ?? 0),
        0
      );

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        joinedAt: u.createdAt,
        affiliateCode: codeByUserId.get(u.id) ?? null,
        totalClicks,
        totalConversions,
        totalReferrals,
        convertedReferrals,
        totalEarningsCents,
        referrals: u.affiliateReferralsGiven.map((r) => ({
          id: r.id,
          status: r.status,
          qualifiedAt: r.qualifiedAt,
          payoutAmountCents: r.payoutAmountCents,
          paidAt: r.paidAt,
          referredUser: r.referredUser,
        })),
      };
    });

    // Summary stats across all creators (not just current page)
    const [allLinksAgg, allReferralsAgg] = await Promise.all([
      prisma.affiliateLink.aggregate({
        _sum: { clicks: true, conversions: true },
      }),
      prisma.affiliateReferral.groupBy({
        by: ['status'],
        _count: true,
        _sum: { payoutAmountCents: true },
      }),
    ]);

    const totalAllClicks = allLinksAgg._sum.clicks ?? 0;
    const totalAllConversions = allLinksAgg._sum.conversions ?? 0;
    const totalAllReferrals = allReferralsAgg.reduce((sum, r) => sum + r._count, 0);
    const totalAllConverted = allReferralsAgg
      .filter((r) => r.status === 'QUALIFIED' || r.status === 'PAID')
      .reduce((sum, r) => sum + r._count, 0);

    res.json({
      creators,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      summary: {
        totalCreators: total,
        totalClicks: totalAllClicks,
        totalConversions: totalAllConversions,
        totalReferrals: totalAllReferrals,
        convertedReferrals: totalAllConverted,
      },
    });
  } catch (error) {
    console.error('Error fetching creators:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/admin/affiliate/commissions?state=ALL|PENDING|APPROVED|PAID|REVERSED&page=&limit=&cursor=
// Creator Program commission ledger with derived state and totals. Read only. The whole ledger is read
// (no fixed row window any more); page with `page`, or pass the previous response's `nextCursor` as
// `cursor` to continue from where it stopped. Rows flagged clawbackDue were already paid to the creator
// and their purchase was later refunded or disputed: clawing that back is a manual process.
export const getCommissions = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listAdminCommissions(req.query));
  } catch (err) {
    sendCreatorError(res, err, 'Failed to load commissions');
  }
};

// POST /api/admin/affiliate/commissions/:id/mark-paid { note? }
// Records that an admin paid this creator OUTSIDE the app. Only valid for APPROVED commissions.
// No money moves here and no job calls this: payouts are a deliberate manual step.
export const markCommissionPaid = async (req: AuthRequest, res: Response) => {
  try {
    console.info(`[admin-affiliate] mark-paid commission=${req.params.id} admin=${req.user?.id}`);
    res.json(await settleCommission(req.params.id, 'PAID', req.body?.note));
  } catch (err) {
    sendCreatorError(res, err, 'Failed to mark commission paid');
  }
};

// POST /api/admin/affiliate/commissions/:id/void { note } (note required)
// Cancels an unpaid commission, e.g. suspected fraud found after review.
export const voidCommission = async (req: AuthRequest, res: Response) => {
  try {
    console.info(`[admin-affiliate] void commission=${req.params.id} admin=${req.user?.id}`);
    res.json(await settleCommission(req.params.id, 'VOIDED', req.body?.note));
  } catch (err) {
    sendCreatorError(res, err, 'Failed to void commission');
  }
};

// POST /api/admin/affiliate/commissions/:id/record-clawback { note } (note required)
// Records that an admin handled the clawback of a commission that was ALREADY paid to the creator and
// whose purchase was later refunded or lost to a dispute. Nothing here takes money back: the clawback
// itself is manual, this only stops the row showing as outstanding. NEEDS A ROUTE (routes/adminAffiliate.ts, not
// edited by this pass): router.post('/commissions/:id/record-clawback', recordCommissionClawback).
export const recordCommissionClawback = async (req: AuthRequest, res: Response) => {
  try {
    console.info(`[admin-affiliate] record-clawback commission=${req.params.id} admin=${req.user?.id}`);
    res.json(await settleCommission(req.params.id, 'CLAWBACK', req.body?.note));
  } catch (err) {
    sendCreatorError(res, err, 'Failed to record commission clawback');
  }
};

// ---------------------------------------------------------------------------
// Roadmap #661 (2026-10-23): organizer referral credit review queue (ADR-119 admin appeal path)
// ---------------------------------------------------------------------------

const REVIEW_FILTERS = ['PENDING_REVIEW', 'BLOCKED', 'APPROVED', 'REJECTED', 'CLEAR'];

// GET /api/admin/affiliate/referrals?review=PENDING_REVIEW|BLOCKED|APPROVED|REJECTED|CLEAR|OPEN (default OPEN = PENDING_REVIEW + BLOCKED)
// Referrals with their fraud signals and the credit they have earned (usable / held). Read only.
export const getReferralReviewQueue = async (req: AuthRequest, res: Response) => {
  try {
    const review = typeof req.query.review === 'string' ? req.query.review.toUpperCase() : 'OPEN';
    const statuses = review === 'OPEN' ? ['PENDING_REVIEW', 'BLOCKED'] : REVIEW_FILTERS.includes(review) ? [review] : null;
    if (!statuses) return res.status(400).json({ message: 'Invalid review filter' });
    const take = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
    const referrals = await prisma.affiliateReferral.findMany({
      where: { fraudReviewStatus: { in: statuses } },
      orderBy: { updatedAt: 'desc' },
      take,
      select: {
        id: true,
        status: true,
        fraudReviewStatus: true,
        fraudCompositeScore: true,
        deviceFraudFlag: true,
        cardFraudFlag: true,
        qualifiedAt: true,
        holdUntil: true,
        reviewedAt: true,
        createdAt: true,
        payoutAmountCents: true,
        referrer: { select: { id: true, name: true, email: true } },
        referredUser: { select: { id: true, name: true, email: true } },
        fraudSignals: { select: { signalType: true, confidenceScore: true, flags: true, purchaseId: true, reviewOutcome: true, createdAt: true } },
        creditEntries: { where: { kind: { in: ['REFERRAL_EARNED', 'REFERRAL_ADJUSTMENT'] } }, select: { amountCents: true, status: true } },
      },
    });
    res.json({
      referrals: referrals.map(({ creditEntries, ...r }) => ({
        ...r,
        creditActiveCents: creditEntries.filter((e) => e.status === 'ACTIVE').reduce((s, e) => s + e.amountCents, 0),
        creditHeldCents: creditEntries.filter((e) => e.status === 'HELD').reduce((s, e) => s + e.amountCents, 0),
      })),
    });
  } catch (err) {
    console.error('[admin-affiliate] referral review queue failed:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/admin/affiliate/referrals/:id/review { decision: 'APPROVE' | 'REJECT', note }
// APPROVE releases the referral's held credit; REJECT cancels the referral and voids its credit. Note required on REJECT.
export const reviewReferralHandler = async (req: AuthRequest, res: Response) => {
  try {
    const decision = typeof req.body?.decision === 'string' ? req.body.decision.toUpperCase() : '';
    if (decision !== 'APPROVE' && decision !== 'REJECT') return res.status(400).json({ message: 'decision must be APPROVE or REJECT' });
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (decision === 'REJECT' && !note) return res.status(400).json({ message: 'A note is required to reject a referral' });
    console.info(`[admin-affiliate] review referral=${req.params.id} decision=${decision} admin=${req.user?.id}`);
    const result = await reviewReferral({ referralId: req.params.id, decision, adminUserId: req.user.id, note });
    res.json(result);
  } catch (err) {
    if ((err as Error)?.message === 'REFERRAL_NOT_FOUND') return res.status(404).json({ message: 'Referral not found' });
    console.error('[admin-affiliate] referral review failed:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/admin/affiliate/credit/:userId -- one account's subscription credit balance and ledger (latest 100 rows).
export const getUserCreditLedger = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.userId;
    const [balance, entries] = await Promise.all([
      getCreditBalance(userId),
      prisma.subscriptionCreditEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, amountCents: true, kind: true, status: true, availableAt: true, sourcePurchaseId: true, affiliateReferralId: true, billingChargeId: true, netFeeCents: true, commissionRateBps: true, note: true, createdAt: true },
      }),
    ]);
    res.json({ userId, balance, entries });
  } catch (err) {
    console.error('[admin-affiliate] credit ledger failed:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
