import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import {
  generateOrGetAffiliateCode,
  getAffiliateCodeWithStats,
} from '../services/affiliateService';
import {
  createOrGetSaleLink,
  getCreatorAccess,
  getCreatorDashboard,
  listCreatorLinks,
  recordAffiliateClick,
} from '../services/creatorAffiliateService';
import { sendCreatorError } from './creatorAffiliateController';
import { getClientIp } from '../utils/getClientIp';

// Creator program access (2026-09-29): the per-sale link endpoints are gated by an ACTIVE
// CreatorProfile (self-serve opt-in, POST /api/affiliate/creator/join) with the legacy
// role === 'CREATOR' string kept as an OR. Previously nothing ever assigned that role, so these
// endpoints were 403 for every account. See services/creatorAffiliateService.ts.
const denyNonCreator = async (req: AuthRequest, res: Response): Promise<boolean> => {
  const access = await getCreatorAccess(req.user);
  if (access.allowed) return false;
  res.status(403).json({
    code: access.suspended ? 'CREATOR_SUSPENDED' : 'CREATOR_REQUIRED',
    message: access.suspended
      ? 'Your creator access is suspended. Contact support for details.'
      : 'Join the Creator Program to create affiliate links.',
  });
  return true;
};

// Generate affiliate link for a sale
export const generateAffiliateLink = async (req: AuthRequest, res: Response) => {
  try {
    if (await denyNonCreator(req, res)) return;
    const { link, url } = await createOrGetSaleLink(req.user.id, req.body?.saleId);
    res.json({
      message: 'Affiliate link generated successfully',
      link: url,
      affiliateLinkId: link.id,
    });
  } catch (error) {
    sendCreatorError(res, error, 'Failed to generate affiliate link');
  }
};

// Get creator's affiliate links
export const getAffiliateLinks = async (req: AuthRequest, res: Response) => {
  try {
    if (await denyNonCreator(req, res)) return;
    res.json(await listCreatorLinks(req.user.id, 50));
  } catch (error) {
    sendCreatorError(res, error, 'Failed to fetch affiliate links');
  }
};

// Track affiliate link click. Public (optionalAuthenticate): the frontend /affiliate/[id] page calls
// this, stores the attribution, then redirects to the sale. Counting rules live in
// recordAffiliateClick: one counted click per link per hashed IP per UTC day, no bots, no self-clicks.
export const trackAffiliateClick = async (req: AuthRequest, res: Response) => {
  try {
    const result = await recordAffiliateClick({
      idOrCode: String(req.params.id ?? ''),
      saleHint: typeof req.query.sale === 'string' ? req.query.sale : undefined,
      ip: getClientIp(req as Request),
      userAgent: req.headers['user-agent'],
      viewerUserId: req.user?.id ?? null,
    });

    if (!result) {
      return res.status(404).json({ message: 'Affiliate link not found' });
    }

    res.set('Cache-Control', 'no-store');
    // `saleId` keeps the original response contract; `affiliateLinkId` is set only when a purchase
    // made now should be credited (null for a suspended creator, an ended sale, or a self-click).
    res.json({ saleId: result.saleId, affiliateLinkId: result.affiliateLinkId, counted: result.counted });
  } catch (error) {
    console.error('Error tracking affiliate click:', error);
    res.status(500).json({ message: 'Failed to track affiliate click' });
  }
};

// Get creator stats (real totals; totalClicks/totalConversions/totalLinks kept for existing callers)
export const getCreatorStats = async (req: AuthRequest, res: Response) => {
  try {
    if (await denyNonCreator(req, res)) return;
    const dashboard = await getCreatorDashboard(req.user.id);
    res.json({
      totalClicks: dashboard.totals.clicks,
      totalConversions: dashboard.totals.conversions,
      totalLinks: dashboard.totals.links,
      ...dashboard.totals,
      program: dashboard.program,
    });
  } catch (error) {
    sendCreatorError(res, error, 'Failed to fetch creator stats');
  }
};

/**
 * Batch 1 Foundation Endpoint
 * GET /api/affiliate/me
 *
 * Returns current user's affiliate code + stats, or creates one if eligible.
 * This is the minimal foundation endpoint for Batch 1.
 *
 * Response:
 * - referralCode: unique code for sharing (e.g., "ORG_K9X2L4")
 * - shareUrl: full URL for signup referral link
 * - createdAt: when code was generated
 * - totalReferrals: count of all referred users
 * - qualifiedReferrals: count of referrals who completed first PAID sale
 * - totalEarned: lifetime earnings from PAID referrals (cents)
 * - unpaidEarnings: balance from QUALIFIED referrals awaiting payout (cents)
 */
export const getAffiliateMe = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    // Check ORGANIZER role
    if (!req.user.roles?.includes('ORGANIZER')) {
      return res.status(403).json({
        error: 'Only organizers can participate in the affiliate program',
      });
    }

    // Get stats (does not create code yet; that's Batch 2 POST /affiliate/generate-code)
    const stats = await getAffiliateCodeWithStats(userId);

    res.json({
      referralCode: stats.referralCode,
      shareUrl: stats.shareUrl,
      createdAt: stats.createdAt,
      stats: {
        totalReferrals: stats.totalReferrals,
        qualifiedReferrals: stats.qualifiedReferrals,
        totalEarned: stats.totalEarned, // cents
        unpaidEarnings: stats.unpaidEarnings, // cents
      },
      message: stats.referralCode
        ? 'Affiliate code found'
        : 'No affiliate code yet (generate one via POST /api/affiliate/generate-code)',
    });
  } catch (error) {
    console.error('Error fetching affiliate data:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate data' });
  }
};

/**
 * Batch 3: POST /api/affiliate/generate-code
 * Generate a unique affiliate referral code for the authenticated organizer.
 * Idempotent: returns existing code if one exists.
 *
 * Auth: ORGANIZER role + ≥1 PAID sale completed
 * Fraud gate: 7-day account age (checked in service)
 *
 * Response (201 or 200):
 * - referralCode: unique code (e.g., "ORG_K9X2L4")
 * - shareUrl: full signup referral URL
 * - createdAt: when code was generated
 */
export const generateAffiliateCode = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    // Check ORGANIZER role
    if (!req.user.roles?.includes('ORGANIZER')) {
      return res.status(403).json({
        error: 'Only organizers can generate affiliate codes',
      });
    }

    // Call service (handles eligibility check, idempotency, code generation)
    const result = await generateOrGetAffiliateCode(userId);

    res.status(200).json({
      referralCode: result.referralCode,
      shareUrl: result.shareUrl,
      createdAt: result.createdAt,
    });
  } catch (error: any) {
    console.error('Error generating affiliate code:', error);

    // Check if error is eligibility-based
    if (error.message.includes('Not eligible')) {
      return res.status(403).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to generate affiliate code' });
  }
};

/**
 * Batch 3: GET /api/affiliate/code
 * Retrieve the authenticated organizer's affiliate code without creating one.
 * If no code exists, returns null with instructive message.
 *
 * Auth: ORGANIZER role
 *
 * Response (200):
 * - referralCode: code if exists, null otherwise
 * - shareUrl: URL if code exists, null otherwise
 * - createdAt: timestamp if code exists, null otherwise
 * - message: instructive text if no code exists
 */
export const getAffiliateCode = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    // Check ORGANIZER role
    if (!req.user.roles?.includes('ORGANIZER')) {
      return res.status(403).json({
        error: 'Only organizers can view affiliate codes',
      });
    }

    // Get stats (does not create)
    const stats = await getAffiliateCodeWithStats(userId);

    res.json({
      referralCode: stats.referralCode,
      shareUrl: stats.shareUrl,
      createdAt: stats.createdAt,
      message: stats.referralCode
        ? 'Affiliate code found'
        : 'No affiliate code yet. Generate one via POST /api/affiliate/generate-code',
    });
  } catch (error) {
    console.error('Error fetching affiliate code:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate code' });
  }
};

/**
 * Batch 6: GET /api/affiliate/referrals
 * List all referrals for the authenticated affiliate with pagination and filtering.
 *
 * Auth: ORGANIZER role
 * Query params:
 * - status: PENDING|QUALIFIED|PAID|CANCELLED (optional filter)
 * - limit: 1-100 (default 25)
 * - offset: pagination offset (default 0)
 *
 * Response (200):
 * {
 *   "referrals": [
 *     {
 *       "id": "aff_ref_123",
 *       "referredUserName": "Margaret's Estate Sales",
 *       "referredUserEmail": "margaret@example.com",
 *       "referralCode": "ORG_K9X2L4",
 *       "status": "QUALIFIED",
 *       "payoutAmountCents": 10000,
 *       "qualifiedAt": "2026-04-20T12:30:00Z",
 *       "paidAt": null,
 *       "createdAt": "2026-04-15T08:00:00Z"
 *     }
 *   ],
 *   "pagination": { "total": 5, "limit": 25, "offset": 0 }
 * }
 */
export const getAffiliateReferrals = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    // Check ORGANIZER role
    if (!req.user.roles?.includes('ORGANIZER')) {
      return res.status(403).json({
        error: 'Only organizers can view referrals',
      });
    }

    // Parse query params
    const status = req.query.status as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    // Validate status if provided
    const validStatuses = ['PENDING', 'QUALIFIED', 'PAID', 'CANCELLED'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    // Build where clause
    const where: any = { referrerId: userId };
    if (status) {
      where.status = status;
    }

    // Get total count for pagination
    const total = await prisma.affiliateReferral.count({ where });

    // Fetch referrals with referred user details
    const referrals = await prisma.affiliateReferral.findMany({
      where,
      include: {
        referredUser: {
          select: { name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // Format response
    const formattedReferrals = referrals.map((r) => ({
      id: r.id,
      referredUserName: r.referredUser.name,
      referredUserEmail: r.referredUser.email,
      referralCode: r.referralCode,
      status: r.status,
      payoutAmountCents: r.payoutAmountCents,
      qualifiedAt: r.qualifiedAt,
      paidAt: r.paidAt,
      createdAt: r.createdAt,
    }));

    res.json({
      referrals: formattedReferrals,
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error fetching affiliate referrals:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate referrals' });
  }
};

/**
 * Batch 6: GET /api/affiliate/earnings-summary
 * Organizer dashboard widget showing affiliate earnings summary.
 *
 * Auth: ORGANIZER role
 *
 * Response (200):
 * {
 *   "totalEarned": 50000,      // cents (PAID referrals only)
 *   "unpaidBalance": 15000,    // cents (QUALIFIED but not PAID)
 *   "thisMonthEarnings": 20000, // cents (qualified this month)
 *   "referralCode": "ORG_K9X2L4",
 *   "shareUrl": "https://finda.sale/register?aff=ORG_K9X2L4",
 *   "recentPayouts": [         // last 5 PAID referrals
 *     {
 *       "amount": 50000,
 *       "paidAt": "2026-04-20T14:00:00Z",
 *       "stripeTransferId": "tr_1ABC"
 *     }
 *   ]
 * }
 */
export const getEarningsSummary = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    // Check ORGANIZER role
    if (!req.user.roles?.includes('ORGANIZER')) {
      return res.status(403).json({
        error: 'Only organizers can view earnings',
      });
    }

    // Get all referrals for this affiliate
    const referrals = await prisma.affiliateReferral.findMany({
      where: { referrerId: userId },
      select: {
        status: true,
        payoutAmountCents: true,
        qualifiedAt: true,
        paidAt: true,
        stripeTransferId: true,
      },
    });

    // Calculate totals
    const totalEarned = referrals
      .filter((r) => r.status === 'PAID' && r.payoutAmountCents)
      .reduce((sum, r) => sum + (r.payoutAmountCents || 0), 0);

    const unpaidBalance = referrals
      .filter((r) => r.status === 'QUALIFIED' && r.payoutAmountCents)
      .reduce((sum, r) => sum + (r.payoutAmountCents || 0), 0);

    // Calculate this month earnings (QUALIFIED in current month)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEarnings = referrals
      .filter(
        (r) =>
          r.status === 'QUALIFIED' &&
          r.qualifiedAt &&
          r.qualifiedAt >= monthStart &&
          r.payoutAmountCents
      )
      .reduce((sum, r) => sum + (r.payoutAmountCents || 0), 0);

    // Get recent payouts (last 5 PAID referrals)
    const recentPayouts = referrals
      .filter((r) => r.status === 'PAID' && r.paidAt)
      .sort((a, b) => (b.paidAt?.getTime() || 0) - (a.paidAt?.getTime() || 0))
      .slice(0, 5)
      .map((r) => ({
        amount: r.payoutAmountCents,
        paidAt: r.paidAt,
        stripeTransferId: r.stripeTransferId,
      }));

    // Get user's affiliate code and share URL
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { affiliateReferralCode: true },
    });

    const referralCode = user?.affiliateReferralCode || null;
    // 2026-08-08 fix (roadmap #318): was /auth/register?ref= -- wrong path + wrong param,
    // see affiliateService.ts for the same fix and full explanation.
    const shareUrl = referralCode
      ? `${process.env.FRONTEND_URL}/register?aff=${referralCode}`
      : null;

    res.json({
      totalEarned,
      unpaidBalance,
      thisMonthEarnings,
      referralCode,
      shareUrl,
      recentPayouts,
    });
  } catch (error) {
    console.error('Error fetching earnings summary:', error);
    res.status(500).json({ error: 'Failed to fetch earnings summary' });
  }
};
