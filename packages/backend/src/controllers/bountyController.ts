// V3: UGC Missing-listing bounties
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';
import { awardXp, spendXp, getSpendableXp, XP_AWARDS } from '../services/xpService';
import { getPlatformFeeRate, SubscriptionTier } from '../utils/feeCalculator'; // Fee-precedence bug fix (2026-08-24): this file had its OWN local getPlatformFeeRate
// shadow (hardcoded 0.10 for PRO/TEAMS too) that was never touched by the 2026-08-22 fee-precedence
// fix applied everywhere else (stripeController.ts, terminalController.ts, jobs/auctionJob.ts,
// services/cashFeeService.ts, services/nativeShippingSuggestionService.ts). Every bounty-fulfillment
// purchase by a PRO/TEAMS organizer was silently charged 10% instead of their contractual 8%. Now
// wired through the same shared resolver as every other charge path.
import {
  resolveOrganizerSquareAccessToken,
  SquareOnboardingIncompleteError,
  buildSquareIdempotencyKey,
  createSquareCharge,
} from '../services/squarePaymentService'; // Square migration Wave S2 #1 (2026-09-09): additive Square branch, see completeBountyPurchase
import { applyCashDebtToAppFee, settleCashDebtCollection } from '../services/cashFeeService'; // Stripe-removal cash-fee-debt recoupment (2026-09-12)
import { assertSaleCanAcceptPayment } from '../services/paymentEligibilityService'; // BUG FIX (2026-09-09, findasale-dev BUG MODE): completeBountyPurchase's Stripe branch was skipping this shared sale-status / Stripe-Connect-onboarding gate that createPaymentIntent/createCartCheckoutSession (stripeController.ts) already enforce (2026-08-27 carding incident). Stripe-specific fields -- used ONLY in the Stripe branch below. Square eligibility is governed separately (organizerHasSquare + resolveOrganizerSquareAccessToken), so this must not run for Square-onboarded organizers who have no live Stripe Connect account at all.
import { assertCheckoutAllowed, CheckoutGuardError } from '../services/checkoutGuard'; // S1072 Finding #4 collusion/wash-trade guard -- BUG FIX (2026-09-09): was missing from BOTH processor branches here. Identity-based (buyer vs. organizer fingerprints), not Stripe-specific, so added once, shared, before the Square/Stripe branch split.
import * as Sentry from '@sentry/node';
// BUG FIX (2026-09-09, findasale-dev BUG MODE): completeBountyPurchase's Square branch never
// marked the purchased Item SOLD or decremented its stock -- every other purchase path in this
// codebase (stripeController.ts Standard Purchase + the new BOUNTY_SUBMISSION webhook branch,
// posPaymentController.ts, squarePaymentController.ts, ebaySoldSyncCron.ts, etc.) calls
// sellItemUnits (itemStockService.ts) for exactly this. Same imports the generic Square/Stripe
// purchase flows already use for the fully-sold-out / partial-sale marketplace hooks, so a
// bounty-fulfillment Item is kept in sync with eBay/Shopify/Facebook exactly like any other Item.
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService';
import { markShopifyItemSold } from '../services/shopifyService';
import { endEbayListingIfExists } from './ebayController';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';


/**
 * POST /api/bounties
 * Authenticated shoppers submit a missing-listing request.
 *
 * Organizer-style: { saleId, description, offerPrice? }
 * Shopper-first: { itemName, category, maxBudget, radiusMiles }
 */
export const createBounty = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId, description, offerPrice, itemName, category, maxBudget, radiusMiles, xpReward, referenceUrl } = req.body;
    const userId = req.user.id;

    // Determine if organizer-style (with saleId) or shopper-first (without saleId)
    const isOrganizerStyle = !!saleId;
    const isShopperFirst = !saleId && itemName && category;

    if (!isOrganizerStyle && !isShopperFirst) {
      return res.status(400).json({
        message: 'Either provide saleId + description (organizer) or itemName + category + maxBudget + radiusMiles (shopper-first).',
      });
    }

    // Organizer-style bounty validation
    if (isOrganizerStyle) {
      if (!description?.trim()) {
        return res.status(400).json({ message: 'description is required for organizer-style bounties.' });
      }

      const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { id: true, status: true } });
      if (!sale) return res.status(404).json({ message: 'Sale not found.' });
      if (sale.status === 'ENDED') {
        return res.status(400).json({ message: 'Cannot submit a bounty for an ended sale.' });
      }

      // One open bounty per user per sale (dedup)
      const existing = await prisma.missingListingBounty.findFirst({
        where: { saleId, userId, status: 'OPEN' },
      });
      if (existing) {
        return res.status(409).json({ message: 'You already have an open bounty for this sale.' });
      }
    }

    // Shopper-first bounty validation
    if (isShopperFirst) {
      if (!itemName?.trim() || !category?.trim()) {
        return res.status(400).json({ message: 'itemName and category are required for shopper-first bounties.' });
      }
      if (maxBudget == null || radiusMiles == null) {
        return res.status(400).json({ message: 'maxBudget and radiusMiles are required for shopper-first bounties.' });
      }
    }

    // Validate xpReward if provided
    const finalXpReward = xpReward != null ? Math.max(50, Number(xpReward)) : 25;

    const bounty = await prisma.missingListingBounty.create({
      data: {
        saleId: saleId || null,
        userId,
        description: description?.trim() || null,
        offerPrice: offerPrice != null ? Number(offerPrice) : null,
        itemName: itemName?.trim() || null,
        category: category?.trim() || null,
        maxBudget: maxBudget != null ? Number(maxBudget) : null,
        radiusMiles: radiusMiles != null ? Number(radiusMiles) : null,
        xpReward: finalXpReward,
        referenceUrl: referenceUrl?.trim() || null,
      },
      include: { user: { select: { name: true } } },
    });

    return res.status(201).json(bounty);
  } catch (error) {
    console.error('createBounty error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/bounties/sale/:saleId
 * Organizers view all bounties for their sale.
 */
export const getSaleBounties = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;

    // Verify organizer owns this sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: { select: { userId: true } } },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found.' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }

    const bounties = await prisma.missingListingBounty.findMany({
      where: { saleId },
      include: {
        user: { select: { name: true, email: true } },
        item: { select: { id: true, title: true, price: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });

    return res.json(bounties);
  } catch (error) {
    console.error('getSaleBounties error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/bounties/my
 * Authenticated buyers view their own bounties.
 */
export const getMyBounties = async (req: AuthRequest, res: Response) => {
  try {
    const bounties = await prisma.missingListingBounty.findMany({
      where: { userId: req.user.id },
      include: {
        sale: { select: { id: true, title: true, address: true } },
        item: { select: { id: true, title: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.json(bounties);
  } catch (error) {
    console.error('getMyBounties error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * PATCH /api/bounties/:id/fulfill
 * Organizer marks a bounty as fulfilled, optionally linking the listed item.
 * Body: { itemId?: string }
 */
export const fulfillBounty = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { itemId } = req.body;

    const bounty = await prisma.missingListingBounty.findUnique({
      where: { id },
      include: { sale: { include: { organizer: { select: { userId: true } } } } },
    });
    if (!bounty) return res.status(404).json({ message: 'Bounty not found.' });
    if (!bounty.sale) return res.status(400).json({ message: 'This bounty is not linked to a sale.' });
    if (bounty.sale!.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }
    if (bounty.status !== 'OPEN') {
      return res.status(400).json({ message: 'Bounty is already closed.' });
    }

    // Optionally verify the item belongs to the same sale
    if (itemId) {
      const item = await prisma.item.findUnique({ where: { id: itemId }, select: { saleId: true } });
      if (!item || !item.saleId || item.saleId !== bounty.saleId) {
        return res.status(400).json({ message: 'Item does not belong to this sale.' });
      }
    }

    const updated = await prisma.missingListingBounty.update({
      where: { id },
      data: { status: 'FULFILLED', itemId: itemId || null },
      include: { item: { select: { id: true, title: true, price: true } } },
    });

    // Notify the shopper that their bounty has been fulfilled
    const itemLink = updated.item ? `/items/${updated.item.id}` : undefined;
    await createNotification(
      bounty.userId,
      'BOUNTY_FULFILLED',
      'Good news!',
      'Good news! An organizer found what you were looking for.',
      itemLink,
      'OPERATIONAL'
    );

    // Award XP to the bounty creator (shopper) for the bounty being fulfilled
    // Only applies to shopper-first bounties (no saleId), which don't pay cash rewards
    if (!bounty.saleId) {
      awardXp(bounty.userId, 'BOUNTY_FULFILLMENT_SHOPPER', XP_AWARDS.BOUNTY_FULFILLMENT_SHOPPER, {
        description: 'Bounty fulfilled'
      }).catch(err => console.error('[bountyController] XP award failed:', err));
    }

    return res.json(updated);
  } catch (error) {
    console.error('fulfillBounty error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * DELETE /api/bounties/:id
 * Shopper cancels their own open bounty.
 */
export const cancelBounty = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const bounty = await prisma.missingListingBounty.findUnique({ where: { id } });
    if (!bounty) return res.status(404).json({ message: 'Bounty not found.' });
    if (bounty.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your bounty.' });
    }
    if (bounty.status !== 'OPEN') {
      return res.status(400).json({ message: 'Bounty is already closed.' });
    }

    await prisma.missingListingBounty.update({ where: { id }, data: { status: 'CANCELLED' } });
    return res.json({ message: 'Bounty cancelled.' });
  } catch (error) {
    console.error('cancelBounty error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/bounties/local
 * Browse local bounties (ORGANIZER auth)
 * For MVP: returns all OPEN bounties not from this organizer's sales, sorted by newest.
 * Distance filtering skipped (sales may not have lat/lng yet).
 */
export const getLocalBounties = async (req: AuthRequest, res: Response) => {
  try {
    // Verify organizer
    if (!req.user?.id) return res.status(401).json({ message: 'Authentication required' });

    const { distance, category, offset, limit, sort } = req.query;
    const offsetNum = Math.max(0, parseInt(offset as string) || 0);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const sortBy = (sort as string) || 'newest_first';

    // Get organizer's sales to exclude bounties from their own sales
    const organizerSales = await prisma.sale.findMany({
      where: { organizer: { userId: req.user.id } },
      select: { id: true },
    });
    const organizerSaleIds = organizerSales.map((s: any) => s.id);

    // Build query for OPEN bounties not from organizer's sales
    let orderBy: any = { createdAt: 'desc' };
    if (sortBy === 'offer_price_desc') {
      orderBy = { offerPrice: 'desc' };
    } else if (sortBy === 'distance_asc') {
      // NOTE (deferred): implement distance sorting once Sales have consistent lat/lng
      orderBy = { createdAt: 'desc' };
    }

    const bounties = await prisma.missingListingBounty.findMany({
      where: {
        status: 'OPEN',
        saleId: { notIn: organizerSaleIds },
        // NOTE (deferred): add category filter if needed
      },
      include: {
        user: { select: { id: true, name: true, roles: true } },
        sale: { select: { id: true, title: true, startDate: true, lat: true, lng: true } },
        submissions: { where: { organizerId: req.user.id } },
      },
      orderBy,
      skip: offsetNum,
      take: limitNum,
    });

    // Count total
    const total = await prisma.missingListingBounty.count({
      where: {
        status: 'OPEN',
        saleId: { notIn: organizerSaleIds },
      },
    });

    // Format response
    const formattedBounties = bounties.map((b: any) => ({
      id: b.id,
      description: b.description,
      offerPrice: b.offerPrice,
      user: b.user,
      sale: b.sale,
      distance: null, // NOTE (deferred): calculate if lat/lng available
      createdAt: b.createdAt,
      submissionCount: b.submissions.length,
      yourSubmission: b.submissions.length > 0 ? b.submissions[0] : null,
    }));

    return res.json({
      bounties: formattedBounties,
      total,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    console.error('getLocalBounties error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * POST /api/bounties/:id/submissions
 * Submit item to bounty (ORGANIZER auth)
 */
export const submitBountySubmission = async (req: AuthRequest, res: Response) => {
  try {
    const { id: bountyId } = req.params;
    const { itemId, message } = req.body;
    const organizerId = req.user?.id;

    if (!organizerId) return res.status(401).json({ message: 'Authentication required' });
    if (!itemId) return res.status(400).json({ message: 'itemId is required.' });

    // Fetch bounty
    const bounty = await prisma.missingListingBounty.findUnique({
      where: { id: bountyId },
      include: { sale: true },
    });
    if (!bounty) return res.status(404).json({ message: 'Bounty not found.' });
    if (bounty.status !== 'OPEN') {
      return res.status(400).json({ message: 'Bounty is not open.' });
    }

    // Fetch item
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: { include: { organizer: { select: { userId: true } } } } },
    });
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    if (item.sale!.organizer?.userId !== organizerId) {
      return res.status(403).json({ message: 'Item does not belong to you.' });
    }
    if (item.status === 'DRAFT') {
      return res.status(400).json({ message: 'Item must be published.' });
    }

    // Check for existing pending submission by this organizer for this bounty
    const existingSubmission = await prisma.bountySubmission.findFirst({
      where: {
        bountyId,
        organizerId,
        status: { in: ['PENDING_REVIEW', 'APPROVED'] },
      },
    });
    if (existingSubmission) {
      return res.status(409).json({ message: 'You already have a pending submission for this bounty.' });
    }

    // Create submission with 3-day expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3);

    const submission = await prisma.bountySubmission.create({
      data: {
        bountyId,
        organizerId,
        itemId,
        status: 'PENDING_REVIEW',
        shopperMessage: message || null,
        expiresAt,
      },
    });

    // Notify shopper
    await createNotification(
      bounty.userId,
      'BOUNTY_SUBMISSION',
      'New Submission',
      `Someone found an item matching your request!`,
      `/bounties/submissions/${submission.id}`,
      'OPERATIONAL'
    );

    return res.status(201).json(submission);
  } catch (error) {
    console.error('submitBountySubmission error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/bounties/submissions
 * Shopper view their submissions (auth required)
 * Returns submissions for bounties owned by the authenticated user
 */
export const getMySubmissions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const { status, sort, limit } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

    let orderBy: any = { submittedAt: 'desc' };
    if (sort === 'expiring_soonest') {
      orderBy = { expiresAt: 'asc' };
    }

    const submissions = await prisma.bountySubmission.findMany({
      where: {
        bounty: { userId },
        ...(status ? { status: status as string } : {}),
      },
      include: {
        bounty: { select: { id: true, description: true, offerPrice: true, createdAt: true } },
        item: {
          select: {
            id: true,
            title: true,
            price: true,
            saleId: true,
            photoUrls: true,
            // Square migration Wave S2 #1 follow-up (2026-09-09): the frontend needs to know
            // BEFORE opening CheckoutModal whether this bounty's organizer is Square-onboarded,
            // so it can tokenize via the Web Payments SDK first instead of the blind
            // call-purchase-then-open-Stripe-Elements sequence the Stripe path uses. Same
            // relation path (item.sale.organizer) completeBountyPurchase itself gates on --
            // NOT the top-level BountySubmission.organizer below, which is a User record with
            // no Square columns of its own (see schema.prisma Organizer model).
            sale: {
              select: {
                organizer: {
                  select: { squareOnboarded: true, squareMerchantId: true, squareLocationId: true },
                },
              },
            },
          },
        },
        organizer: { select: { id: true, name: true } },
      },
      orderBy,
      take: limitNum,
    });

    // Count unreviewed (PENDING_REVIEW)
    const unreviewed = await prisma.bountySubmission.count({
      where: {
        bounty: { userId },
        status: 'PENDING_REVIEW',
      },
    });

    const total = await prisma.bountySubmission.count({
      where: {
        bounty: { userId },
        ...(status ? { status: status as string } : {}),
      },
    });

    // Format response
    const formattedSubmissions = submissions.map((s: any) => ({
      id: s.id,
      bounty: s.bounty,
      item: s.item,
      organizer: s.organizer,
      message: s.shopperMessage,
      status: s.status,
      submittedAt: s.submittedAt,
      expiresAt: s.expiresAt,
      xpCost: s.bounty.xpReward ? s.bounty.xpReward * 2 : 50,
    }));

    return res.json({
      submissions: formattedSubmissions,
      total,
      unreviewed,
    });
  } catch (error) {
    console.error('getMySubmissions error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * PATCH /api/bounties/submissions/:id
 * Shopper approve/decline submission (auth required, owner of bounty)
 */
export const approveDeclineSubmission = async (req: AuthRequest, res: Response) => {
  try {
    const { id: submissionId } = req.params;
    const { action } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    if (!action || !['APPROVE', 'DECLINE'].includes(action)) {
      return res.status(400).json({ message: 'action must be APPROVE or DECLINE.' });
    }

    // Fetch submission with bounty to verify ownership
    const submission = await prisma.bountySubmission.findUnique({
      where: { id: submissionId },
      include: { bounty: true },
    });
    if (!submission) return res.status(404).json({ message: 'Submission not found.' });
    if (submission.bounty.userId !== userId) {
      return res.status(403).json({ message: 'Not your bounty.' });
    }
    if (!['PENDING_REVIEW', 'APPROVED'].includes(submission.status)) {
      return res.status(400).json({ message: 'Submission cannot be reviewed.' });
    }

    if (action === 'APPROVE') {
      // Mark as approved
      const updated = await prisma.bountySubmission.update({
        where: { id: submissionId },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
        },
      });

      return res.json({
        id: updated.id,
        status: updated.status,
        checkoutUrl: null, // NOTE (deferred): integrate Stripe
      });
    } else {
      // DECLINE: reject but keep bounty open
      const updated = await prisma.bountySubmission.update({
        where: { id: submissionId },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
        },
      });

      // Notify organizer
      await createNotification(
        submission.organizerId,
        'BOUNTY_DECLINED',
        'Submission Declined',
        'A shopper declined your submission. Keep looking!',
        `/bounties/submissions`,
        'OPERATIONAL'
      );

      return res.json({
        id: updated.id,
        status: updated.status,
        message: 'Bounty remains open',
      });
    }
  } catch (error) {
    console.error('approveDecllineSubmission error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Haversine distance calculation (miles)
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * POST /api/bounties/match
 * Auto-match item against bounties (ORGANIZER auth)
 * Improved scoring algorithm per spec §1:
 * - Category match: +30 points
 * - Title keyword overlap: +20 points per matching word (cap at 40)
 * - Tag overlap: +10 points per matching tag (cap at 20)
 * - Within 25mi radius: +10 points; outside 25mi: skip entirely
 * - Recency bonus (bounty posted <7 days): +5 points
 * - Confidence threshold: 60 points minimum
 */
export const matchItemToBounties = async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.body;
    const organizerId = req.user?.id;

    if (!organizerId) return res.status(401).json({ message: 'Authentication required' });
    if (!itemId) return res.status(400).json({ message: 'itemId is required.' });

    // Fetch item with full details
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: { select: { id: true, lat: true, lng: true, organizerId: true, organizer: { select: { userId: true } } } } },
    });
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    if (!item.sale || item.sale.organizer?.userId !== organizerId) {
      return res.status(403).json({ message: 'Item does not belong to you.' });
    }

    const itemLat = item.sale.lat;
    const itemLng = item.sale.lng;

    // Query for OPEN bounties within 90 days, not from organizer's own sales, with non-ended sales
    const candidateBounties = await prisma.missingListingBounty.findMany({
      where: {
        status: 'OPEN',
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        sale: {
          status: { not: 'ENDED' },
          organizer: { userId: { not: organizerId } }, // Exclude organizer's own bounties
        },
      },
      include: {
        user: { select: { id: true, name: true } },
        sale: { select: { id: true, lat: true, lng: true } },
      },
    });

    // Score each bounty
    const scoredMatches = candidateBounties
      .map((bounty: any) => {
        let score = 0;

        // Only include bounties within 25 miles (skip entirely if outside)
        if (itemLat && itemLng && bounty.sale?.lat && bounty.sale?.lng) {
          const distance = haversineDistance(itemLat, itemLng, bounty.sale.lat, bounty.sale.lng);
          if (distance > 25) {
            return null; // Skip bounties outside 25 mile radius
          }
          score += 10; // Within 25mi: +10 points
        }

        // Category match: +30 points (if both have category)
        if (item.category && bounty.category && item.category.toLowerCase() === bounty.category.toLowerCase()) {
          score += 30;
        }

        // Title keyword overlap: +20 points per matching word (cap at 40)
        const itemTitleWords = (item.title || '')
          .toLowerCase()
          .split(/\s+/)
          .filter((w: any) => w.length > 2);
        const bountyDescriptionWords = (bounty.description || '')
          .toLowerCase()
          .split(/\s+/)
          .filter((w: any) => w.length > 2);
        const titleOverlapCount = itemTitleWords.filter((w: any) => bountyDescriptionWords.includes(w)).length;
        score += Math.min(titleOverlapCount * 20, 40);

        // Tag overlap: +10 points per matching tag (cap at 20)
        if (item.tags && item.tags.length > 0 && bounty.category) {
          const itemTagsLower = item.tags.map((t: string) => t.toLowerCase());
          const bountyTagsLower = bounty.category.toLowerCase().split(/\s+/);
          const tagOverlapCount = itemTagsLower.filter((t: string) => bountyTagsLower.some((bt: string) => t.includes(bt))).length;
          score += Math.min(tagOverlapCount * 10, 20);
        }

        // Recency bonus: +5 points if bounty posted <7 days ago
        const daysSinceCreation = (Date.now() - bounty.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation < 7) {
          score += 5;
        }

        const confidence = score / 100; // Convert to 0–1 scale for display

        return {
          bountyId: bounty.id,
          title: bounty.description,
          reward: bounty.xpReward,
          shopperName: bounty.user.name,
          score,
          confidence: Math.round(confidence * 100) / 100, // Display as percentage (0.0–1.0)
        };
      })
      .filter((m: any) => m !== null && m.score >= 60) // Filter by threshold (60 points)
      .sort((a: any, b: any) => b.score - a.score) // Sort descending by score
      .slice(0, 5); // Top 5

    return res.json({ matches: scoredMatches });
  } catch (error) {
    console.error('matchItemToBounties error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/bounties/community
 * Browse community bounties (shopper-created, no saleId)
 * Filter by category and radius
 */
export const getCommunityBounties = async (req: AuthRequest, res: Response) => {
  try {
    const { category, radiusMiles, offset = '0', limit = '20' } = req.query;

    const where: any = { saleId: null, status: 'OPEN' };

    if (category && category !== '') {
      where.category = category as string;
    }

    if (radiusMiles) {
      where.radiusMiles = { lte: Number(radiusMiles) };
    }

    const [bounties, total] = await Promise.all([
      prisma.missingListingBounty.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: Number(offset),
        take: Math.min(100, Number(limit) || 20),
      }),
      prisma.missingListingBounty.count({ where }),
    ]);

    // Map to include all fields including referenceUrl
    const formattedBounties = bounties.map((b: any) => ({
      id: b.id,
      itemName: b.itemName,
      description: b.description,
      category: b.category,
      maxBudget: b.maxBudget,
      radiusMiles: b.radiusMiles,
      xpReward: b.xpReward,
      referenceUrl: b.referenceUrl,
      status: b.status,
      user: b.user,
      createdAt: b.createdAt,
    }));

    return res.json({
      bounties: formattedBounties,
      total,
      limit: Math.min(100, Number(limit) || 20),
      offset: Number(offset),
    });
  } catch (error) {
    console.error('getCommunityBounties error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * POST /api/bounties/submissions/:id/purchase
 * Complete bounty purchase (auth required, owner of bounty)
 *
 * Flow (BUG FIX 2026-09-09, findasale-dev BUG MODE -- Gap 1 & Gap 2, see bottom note):
 * 1. Validate submission ownership and status
 * 2. S1072 collusion/wash-trade guard (assertCheckoutAllowed) -- shared, both processors
 * 3. Check shopper has ≥50 XP (BOUNTY_FULFILLMENT cost) -- eligibility pre-check only
 * 4. Charge the item price -- SQUARE (organizer.squareOnboarded && squareMerchantId, synchronous
 *    CreatePayment, requires `sourceId` in the request body) or STRIPE (PaymentIntent flow,
 *    gated first by assertSaleCanAcceptPayment -- sale-status / Stripe-Connect-onboarding)
 *    depending on which processor the organizer has completed onboarding for.
 *    Square migration Wave S2 #1 (2026-09-09): additive branch, see organizerHasSquare below.
 * 5. ONLY AFTER a confirmed charge: deduct 50 XP from shopper, award 25 XP to organizer,
 *    update BountySubmission.status → PURCHASED, create/finalize the Purchase record
 *    (Purchase.processor discriminates STRIPE/SQUARE), notify the organizer.
 *    SQUARE's charge is synchronous, so all of this runs inline right after chargeResult.ok.
 *    STRIPE's confirmation is asynchronous, so this endpoint only creates a PENDING Purchase
 *    row + PaymentIntent here; the payment_intent.succeeded webhook (stripeController.ts,
 *    metadata.type === 'BOUNTY_SUBMISSION') runs the rest once Stripe actually confirms.
 * 6. Response shape differs by processor: STRIPE returns a clientSecret for the frontend to
 *    confirm client-side (submission status in the response is NOT yet PURCHASED); SQUARE's
 *    charge is already complete synchronously, so it returns squarePaymentId/status directly
 *    with no further client-side confirmation step.
 *
 * Prior to this fix, Steps "deduct/award XP, flip status, notify" ran unconditionally BEFORE
 * any charge was attempted on either processor, with no rollback on a cancelled/declined
 * Stripe payment, and neither processor branch enforced the sale-status/Connect-onboarding
 * gate or the S1072 collusion guard that the generic single-item checkout endpoints
 * (stripeController.ts createPaymentIntent/createCartCheckoutSession) already enforce.
 */
export const completeBountyPurchase = async (req: AuthRequest, res: Response) => {
  try {
    const { id: submissionId } = req.params;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    // Fetch submission with bounty, item, and organizer
    const submission = await prisma.bountySubmission.findUnique({
      where: { id: submissionId },
      include: {
        bounty: true,
        item: { include: { sale: { select: { id: true, status: true, paymentsHeldAt: true, organizerId: true, organizer: { select: { stripeConnectId: true, stripeOnboarded: true, subscriptionTier: true, squareMerchantId: true, squareOnboarded: true, squareLocationId: true } } } } } },
        organizer: true,
      },
    });
    if (!submission) return res.status(404).json({ message: 'Submission not found.' });
    if (submission.bounty.userId !== userId) {
      return res.status(403).json({ message: 'Not your bounty.' });
    }
    if (!['PENDING_REVIEW', 'APPROVED'].includes(submission.status)) {
      return res.status(400).json({ message: 'Submission cannot be purchased.' });
    }

    // S1072 Finding #4: collusion/wash-trade guard -- BUG FIX (2026-09-09). Identity-grade
    // device/card fingerprint match between this shopper and the submission's sale organizer.
    // Runs BEFORE the Square/Stripe branch split (and before any XP mutation) so both
    // processors get the same coverage and there is no charge-of-any-kind before this point.
    try {
      await assertCheckoutAllowed({
        buyerUserId: userId,
        saleId: submission.item.sale!.id,
        itemId: submission.itemId,
        prisma,
        context: 'completeBountyPurchase',
      });
    } catch (guardError) {
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ message: guardError.message });
      }
      throw guardError;
    }

    // XP Constants for Bounty Fulfillment
    const XP_BOUNTY_COST = 50;           // Shopper pays 50 XP
    const XP_ORGANIZER_REWARD = 25;      // Organizer earns 25 XP

    // Step 1: Check shopper has sufficient spendable XP (eligibility pre-check only -- the
    // actual deduction no longer happens here, see BUG FIX note below).
    const spendableXp = await getSpendableXp(userId);
    if (spendableXp < XP_BOUNTY_COST) {
      return res.status(402).json({
        message: 'Insufficient XP to complete this bounty purchase',
        requiredXp: XP_BOUNTY_COST,
        availableXp: spendableXp,
      });
    }

    // BUG FIX (Gap 1, 2026-09-09, findasale-dev BUG MODE): Steps 2-3 (spendXp the shopper,
    // awardXp the organizer) used to run HERE, unconditionally, before either processor branch
    // and before any charge was even attempted -- a cancelled/declined Stripe payment left both
    // XP mutations applied with no rollback, and (found during this fix, contrary to this
    // function's own dispatch context) the Square branch had the identical bug: its charge
    // happens further below, AFTER this point, so XP was moving before money too. Both
    // mutations now happen ONLY after a confirmed charge: inline, right after
    // chargeResult.ok, in the Square branch below; in the webhook (payment_intent.succeeded,
    // stripeController.ts, metadata.type === 'BOUNTY_SUBMISSION') for the Stripe branch, since
    // Stripe confirmation is asynchronous. See the Square branch and the Stripe branch's
    // Purchase-creation comment below for exactly where each now happens.

    // Step 4: Prepare Stripe PaymentIntent for the item price
    const itemPrice = submission.item.price || 0;
    if (itemPrice <= 0) {
      return res.status(400).json({ message: 'Item has invalid price.' });
    }

    const priceCents = Math.round(itemPrice * 100);
    const minPrice = 50; // $0.50 minimum
    if (priceCents < minPrice) {
      return res.status(400).json({ message: 'Item price must be at least $0.50.' });
    }

    const { stripeConnectId, subscriptionTier, squareMerchantId, squareOnboarded, squareLocationId } = submission.item.sale!.organizer;

    // Square migration Wave S2 #1 (2026-09-09): additive branch, mirrors squarePaymentController.ts's
    // createSquarePayment single-item real-time-charge shape exactly (resolveOrganizerSquareAccessToken +
    // buildSquareIdempotencyKey + createSquareCharge -- same seam, same conventions, same error handling).
    // Processor selection here is server-determined from the organizer's OWN onboarding state
    // (squarePaymentEligibilityService.ts's own gate uses the identical signal: squareOnboarded &&
    // squareMerchantId) rather than a client-supplied `processor` field like posPaymentController.ts's
    // payment-request flow -- this endpoint has no existing frontend convention for the caller to pick a
    // processor (see KNOCK-ON note in the dispatch handoff), and Stripe's platform account is permanently
    // closed, so a Square-onboarded organizer's bounty purchases must route to Square automatically, not
    // optionally. Existing Stripe-only organizers (squareOnboarded stays false/squareMerchantId stays null
    // until an organizer actually completes Square Connect onboarding) fall through to the untouched Stripe
    // branch below -- zero behavior change for them, same as every pre-2026-09-07 organizer row.
    const organizerHasSquare = squareOnboarded === true && !!squareMerchantId;

    if (organizerHasSquare) {
      const { sourceId, verificationToken } = req.body as { sourceId?: string; verificationToken?: string };
      if (!sourceId || typeof sourceId !== 'string' || !sourceId.trim()) {
        return res.status(400).json({ message: 'A tokenized payment source is required.' });
      }

      // Same shared resolver every other charge path in this file's fee math ultimately traces
      // back to (utils/feeCalculator.ts) -- computed independently of the Stripe branch's own
      // platformFeeAmount below since this if-block returns before that line is ever reached.
      const squarePlatformFeeAmount = Math.round(priceCents * getPlatformFeeRate(subscriptionTier as SubscriptionTier));

      let organizerAccessToken: string;
      try {
        organizerAccessToken = await resolveOrganizerSquareAccessToken({
          id: submission.item.sale!.organizerId,
          squareMerchantId,
          squareOnboarded,
        });
      } catch (err) {
        if (err instanceof SquareOnboardingIncompleteError) {
          return res.status(409).json({
            message: "This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your purchase.",
            code: 'SELLER_PAYMENTS_UNAVAILABLE',
          });
        }
        throw err;
      }

      // Idempotency-key length note (Square caps at 45 chars, see squarePaymentService.ts) --
      // hashed, not the literal `bounty-${submissionId}-${userId}` string the Stripe branch below uses.
      const idempotencyKey = buildSquareIdempotencyKey(['bounty', submissionId, userId]);

      // Cash-fee-debt recoupment (2026-09-12): pad this card sale's appFeeMoney with whatever
      // room exists to collect outstanding Organizer.cashFeeBalance -- see cashFeeService.ts.
      const { appFeeCents: squareAppFeeCents, debtAppliedCents: squareDebtAppliedCents } = await applyCashDebtToAppFee({
        organizerId: submission.item.sale!.organizerId,
        baseAppFeeCents: squarePlatformFeeAmount,
        saleAmountCents: priceCents,
      });

      const chargeResult = await createSquareCharge({
        organizerAccessToken,
        idempotencyKey,
        sourceId,
        amountCents: priceCents,
        appFeeCents: squareAppFeeCents,
        locationId: squareLocationId,
        referenceId: submission.itemId,
        note: submission.item.title ? submission.item.title.slice(0, 80) : undefined,
        verificationToken: typeof verificationToken === 'string' ? verificationToken : undefined,
      });

      if (!chargeResult.ok) {
        return res.status(402).json({ message: chargeResult.message, code: 'SQUARE_PAYMENT_DECLINED' });
      }

      // Only settle after Square confirms success -- no idempotent-retry double-fire risk on
      // this path (see the comment on the Purchase.create call below: a retry would fail
      // Square's own idempotency check before reaching here again).
      await settleCashDebtCollection({ organizerId: submission.item.sale!.organizerId, debtAppliedCents: squareDebtAppliedCents });

      // BUG FIX (Gap 1, 2026-09-09): XP deduct/award now happen HERE -- immediately after the
      // Square charge is confirmed successful -- instead of unconditionally before any charge
      // was even attempted (the pre-existing bug this fix closes; see the removed Steps 2-3
      // comment above). Best-effort / non-blocking: Square has already captured real money by
      // this line, so a rare XP-balance race must never strand a paying buyer without their
      // item -- same posture as this file's other fire-and-forget XP awards (e.g.
      // fulfillBounty above).
      await spendXp(
        userId,
        XP_BOUNTY_COST,
        'BOUNTY_FULFILLMENT',
        { description: `Bounty submission purchase: ${submission.item.title}` }
      ).catch(err => console.error(`[completeBountyPurchase][square] spendXp failed (non-fatal, charge already succeeded) for user ${userId}:`, err));
      await awardXp(
        submission.organizerId,
        'BOUNTY_FULFILLMENT',
        XP_ORGANIZER_REWARD,
        { description: `Earned from bounty submission: ${submission.item.title}` }
      ).catch(err => console.error(`[completeBountyPurchase][square] awardXp failed (non-fatal, charge already succeeded) for organizer ${submission.organizerId}:`, err));

      // Step 5 (Square): Update submission status to PURCHASED -- identical to the Stripe
      // branch's Step 5 below, just reached from this earlier return.
      const squareUpdatedSubmission = await prisma.bountySubmission.update({
        where: { id: submissionId },
        data: {
          status: 'PURCHASED',
          purchasedAt: new Date(),
        },
      });

      // Step 6 (Square): Create Purchase record linked to bounty submission. chargeType/
      // stripeAccountId are deliberately left unset -- those are Stripe-specific concepts
      // refundService.ts's DIRECT/DESTINATION routing depends on, same posture
      // squarePaymentController.ts's own Purchase.create calls already follow for SQUARE rows.
      // status is 'PAID' immediately (not 'PENDING' like the Stripe branch) because Square's
      // CreatePayment above is synchronous -- a successful chargeResult means the charge is
      // already done, there is no separate client-side confirmation step to wait on.
      const squarePurchase = await prisma.purchase.create({
        data: {
          userId,
          itemId: submission.itemId,
          saleId: submission.item.sale!.id,
          amount: itemPrice,
          platformFeeAmount: squareAppFeeCents / 100,
          cashDebtCollectedAmount: squareDebtAppliedCents > 0 ? squareDebtAppliedCents / 100 : undefined,
          // FEE SNAPSHOT (2026-08-17): commission-only, same as the Stripe branch below -- a
          // bounty fulfillment is a fixed-price purchase, never an auction lot.
          buyerPremiumAmount: 0,
          buyerPremiumRate: 0,
          commissionAmount: squarePlatformFeeAmount / 100,
          commissionRate: getPlatformFeeRate(subscriptionTier as SubscriptionTier),
          organizerAbsorbedPremium: false,
          processor: 'SQUARE',
          squarePaymentId: chargeResult.paymentId,
          status: 'PAID',
          buyerCardFingerprint: chargeResult.cardFingerprint ?? undefined,
        },
      });

      // BUG FIX (2026-09-09, findasale-dev BUG MODE, Item.status SOLD gap): the purchased Item
      // was never marked SOLD or its stock decremented -- charge succeeded and the submission
      // flipped to PURCHASED above, but Item.status/stockSold never moved, so the item stayed
      // visible/available everywhere else in the app. Placed AFTER the Square charge succeeded
      // AND the submission was already flipped to PURCHASED (this function only runs once per
      // request -- Square's charge itself is idempotency-keyed above via buildSquareIdempotencyKey,
      // so a client retry after a successful charge would fail Square's own idempotency check
      // before ever reaching this line again; there is no webhook-retry double-fire risk here the
      // way the async Stripe branch has, which is why that branch's guard is the bountySubmission
      // .status === 'PURCHASED' check instead). InsufficientStockError is caught non-fatal
      // (mirrors every other sellItemUnits call site, e.g. squarePaymentController.ts): Square has
      // already captured real money by this point, so a rare stock race must never surface as a
      // 500 to a buyer who already paid.
      let bountyFullySoldOut = false;
      let bountyRemainingStock: number | undefined;
      try {
        ({ fullySoldOut: bountyFullySoldOut, remainingStock: bountyRemainingStock } = await sellItemUnits(submission.itemId, 1));
      } catch (stockErr: any) {
        if (stockErr instanceof InsufficientStockError) {
          console.error(`[completeBountyPurchase][square] Stock race on item ${submission.itemId}: Square payment ${chargeResult.paymentId} captured but item already sold out -- needs manual review.`, stockErr.message);
          try {
            Sentry.captureMessage(
              `[completeBountyPurchase][square] Stock race needs review: paymentId=${chargeResult.paymentId} itemId=${submission.itemId} submissionId=${submissionId}`,
              'error'
            );
          } catch {
            // Sentry may not be initialized
          }
        } else {
          throw stockErr;
        }
      }

      // Mirrors the generic purchase flows' fully-sold-out / partial-sale marketplace hooks -- a
      // bounty-fulfillment item is a regular Item row and can be cross-listed on eBay/Shopify
      // exactly like any other, so it must be removed/revised there too once sold via this path.
      if (bountyFullySoldOut) {
        markShopifyItemSold(submission.itemId).catch(err =>
          console.error('[completeBountyPurchase][square] Shopify markSold failed:', err)
        );
        endEbayListingIfExists(submission.itemId).catch(err =>
          console.error('[completeBountyPurchase][square] eBay withdraw failed:', err)
        );
        notifyFacebookExportedItemSold(submission.itemId).catch(err =>
          console.warn(`[completeBountyPurchase][square] FB nudge failed for item ${submission.itemId}:`, err.message)
        );
      } else if (bountyRemainingStock !== undefined) {
        syncMarketplaceStock(submission.itemId, { fullySoldOut: false, remainingStock: bountyRemainingStock }).catch(err =>
          console.error('[completeBountyPurchase][square] eBay ReviseQty sync failed for item', submission.itemId, err)
        );
      }

      // Step 7 (Square): Notify organizer of purchase -- identical call to the Stripe branch's
      // Step 7 below.
      await createNotification(
        submission.organizerId,
        'BOUNTY_PURCHASED',
        'Bounty Purchased!',
        `Your submission was purchased! You earned ${XP_ORGANIZER_REWARD} XP.`,
        `/bounties/submissions`,
        'OPERATIONAL'
      );

      return res.json({
        squarePaymentId: chargeResult.paymentId,
        amount: priceCents,
        currency: 'usd',
        submissionId: squareUpdatedSubmission.id,
        bountyId: submission.bountyId,
        purchaseId: squarePurchase.id,
        status: squareUpdatedSubmission.status,
        xpDeducted: XP_BOUNTY_COST,
        organizerXpAwarded: XP_ORGANIZER_REWARD,
        processor: 'SQUARE',
      });
    }

    // BUG FIX (Gap 2, 2026-09-09): shared sale-status / Stripe-Connect-onboarding gate that
    // createPaymentIntent/createCartCheckoutSession (stripeController.ts) already enforce
    // (2026-08-27 carding incident) -- this endpoint skipped it entirely. Same response
    // shape/status codes as the generic endpoints (SELLER_PAYMENTS_UNAVAILABLE /
    // SALE_NOT_ACTIVE / SALE_PAYMENTS_HELD), placed before any Stripe charge attempt. Stripe-
    // Connect-specific fields -- correctly scoped to this branch only (a Square-onboarded
    // organizer has no live stripeConnectId/stripeOnboarded and must not be blocked by this).
    const bountyPaymentEligibility = await assertSaleCanAcceptPayment({
      prisma,
      sale: {
        id: submission.item.sale!.id,
        status: submission.item.sale!.status,
        paymentsHeldAt: submission.item.sale!.paymentsHeldAt,
      },
      organizerStripeConnectId: stripeConnectId,
      organizerStripeOnboarded: submission.item.sale!.organizer.stripeOnboarded,
    });
    if (bountyPaymentEligibility.blocked) {
      return res.status(bountyPaymentEligibility.status).json(bountyPaymentEligibility.body);
    }

    // Stripe removal (2026-09-12): this organizer has no Square account connected, and
    // the platform's Stripe account is permanently closed -- there is no processor left to
    // charge this bounty purchase against. The Stripe PaymentIntent path that used to live
    // here is guaranteed to fail against a dead account, so it is removed rather than left
    // to hard-fail unpredictably. Fail closed with the same SquareOnboardingIncompleteError/
    // SELLER_PAYMENTS_UNAVAILABLE shape every other Square-gated endpoint uses.
    throw new SquareOnboardingIncompleteError(submission.item.sale!.organizerId);
  } catch (error) {
    if (error instanceof SquareOnboardingIncompleteError) {
      return res.status(409).json({
        message: "This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your purchase.",
        code: 'SELLER_PAYMENTS_UNAVAILABLE',
      });
    }
    console.error('completeBountyPurchase error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/bounties/organizer/submissions
 * Organizer view their bounty submissions (past 30 days)
 * Returns submissions for items that belong to the organizer's sales
 */
export const getOrganizerSubmissions = async (req: AuthRequest, res: Response) => {
  try {
    const organizerId = req.user?.id;
    if (!organizerId) return res.status(401).json({ message: 'Authentication required' });

    // Calculate 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Query submissions where the item belongs to one of the organizer's sales
    const submissions = await prisma.bountySubmission.findMany({
      where: {
        organizerId,
        submittedAt: { gte: thirtyDaysAgo },
      },
      include: {
        bounty: {
          select: {
            id: true,
            description: true,
            offerPrice: true,
            xpReward: true,
            createdAt: true,
          },
        },
        item: {
          select: {
            id: true,
            title: true,
            price: true,
            photoUrls: true,
            saleId: true,
          },
        },
        organizer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
      take: 100,
    });

    // Count total submissions in the same criteria
    const total = await prisma.bountySubmission.count({
      where: {
        organizerId,
        submittedAt: { gte: thirtyDaysAgo },
      },
    });

    // Format response to match frontend expectations
    const formattedSubmissions = submissions.map((s: any) => ({
      id: s.id,
      bounty: s.bounty,
      item: s.item,
      organizer: s.organizer,
      message: s.shopperMessage,
      status: s.status,
      submittedAt: s.submittedAt,
      expiresAt: s.expiresAt,
      xpCost: s.bounty.xpReward ? s.bounty.xpReward * 2 : 50,
    }));

    return res.json({
      submissions: formattedSubmissions,
      total,
    });
  } catch (error) {
    console.error('getOrganizerSubmissions error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};
