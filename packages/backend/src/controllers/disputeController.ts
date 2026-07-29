import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { executeVerifiedRefund, RefundError, sendRefundConfirmationEmail } from '../services/refundService'; // P1 fix (2026-07-29): dispute-triggered refunds now actually call Stripe via the shared executeVerifiedRefund path. applyFirstMonthRefundCap/logRefundProcessing no longer used here — see the cap-removal comment below.

// POST /api/disputes — authenticated buyer creates dispute
export const createDispute = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, saleId, itemId, reason, description } = req.body;
    const buyerId = req.user?.id;

    if (!buyerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Validate required fields
    if (!orderId || !saleId || !itemId || !reason || !description) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate reason enum
    const validReasons = ['condition_mismatch', 'item_missing', 'wrong_item', 'other'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ message: 'Invalid reason' });
    }

    // Validate description length
    if (description.length < 50) {
      return res.status(400).json({ message: 'Description must be at least 50 characters' });
    }

    // Get the sale to find seller
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Get the organizer user
    const organizer = await prisma.organizer.findUnique({
      where: { id: sale.organizerId },
      select: { userId: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Create the dispute
    const dispute = await prisma.dispute.create({
      data: {
        orderId,
        buyerId,
        sellerId: organizer.userId,
        saleId,
        itemId,
        reason,
        description,
        status: 'open',
      },
      include: {
        buyer: {
          select: { id: true, name: true, email: true },
        },
        seller: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.status(201).json({
      message: 'Dispute created successfully',
      dispute,
    });
  } catch (error) {
    console.error('Error creating dispute:', error);
    res.status(500).json({ message: 'Failed to create dispute' });
  }
};

// GET /api/disputes/my — buyer sees their disputes
export const getMyDisputes = async (req: AuthRequest, res: Response) => {
  try {
    const buyerId = req.user?.id;

    if (!buyerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    const where: any = { buyerId };
    if (status) {
      where.status = status;
    }

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        include: {
          buyer: {
            select: { id: true, name: true, email: true },
          },
          seller: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dispute.count({ where }),
    ]);

    res.json({
      disputes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching buyer disputes:', error);
    res.status(500).json({ message: 'Failed to fetch disputes' });
  }
};

// GET /api/disputes/seller — organizer sees disputes against them
export const getSellerDisputes = async (req: AuthRequest, res: Response) => {
  try {
    const sellerId = req.user?.id;

    if (!sellerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    const where: any = { sellerId };
    if (status) {
      where.status = status;
    }

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        include: {
          buyer: {
            select: { id: true, name: true, email: true },
          },
          seller: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dispute.count({ where }),
    ]);

    res.json({
      disputes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching seller disputes:', error);
    res.status(500).json({ message: 'Failed to fetch disputes' });
  }
};

// PATCH /api/disputes/:id/status — admin only
export const updateDisputeStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, resolution, refundAmount } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }

    // Validate status
    const validStatuses = ['open', 'under_review', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Fetch dispute to get buyer information for refund cap check
    const existingDispute = await prisma.dispute.findUnique({
      where: { id },
      include: { buyer: { select: { id: true, createdAt: true } } }
    });

    if (!existingDispute) {
      return res.status(404).json({ message: 'Dispute not found' });
    }

    let finalRefundAmount = refundAmount;
    let refundCapApplied = false;

    // P1 fix (2026-07-29): a dispute resolved with a refundAmount used to only WRITE a
    // resolution note claiming a refund happened — refundService.ts had ZERO Stripe calls,
    // so no money ever moved and buyers were told they'd been refunded when they hadn't.
    // These three carry the outcome of the real refund (if one runs) out of this block so
    // the dispute is only ever marked 'resolved' after Stripe actually confirms it.
    let actualRefundedAmount: number | undefined;
    let refundedItemId: string | null | undefined;
    let refundConfirmationParams:
      | { toEmail?: string | null; buyerName?: string | null; itemTitle?: string | null; organizerBusinessName?: string | null }
      | undefined;

    // Platform Safety #100 cap REMOVED for this path (2026-07-29, Patrick decision):
    // resolving a dispute with a refund is an ADMIN-initiated refund, not buyer self-service —
    // the first-month cap exists to blunt new-account fraud from whoever is REQUESTING a
    // refund, which doesn't apply when the platform is the one choosing to issue it. Confirmed
    // live 2026-07-29: this cap silently halved a legitimate refund for a genuine double-sale
    // (buyer owed $12, got $6, no warning shown anywhere in the UI) before this was caught and
    // fixed with a manual top-up. applyFirstMonthRefundCap/logRefundProcessing are kept in
    // refundService.ts for a possible future BUYER-initiated self-service refund flow, but are
    // no longer called from this seller/admin-initiated path (or createRefund's). Leaving
    // finalRefundAmount at its declared value (= refundAmount, uncapped) below.
    if (status === 'resolved' && refundAmount && refundAmount > 0) {
      // SECURITY (IDOR guard): Dispute.orderId is a free-text String field with NO Prisma
      // relation to Purchase (schema.prisma: "references Order or transaction ID") — it is
      // accepted verbatim from the BUYER's own request body at dispute-creation time with
      // zero validation that it names a real Purchase. Before any money moves, it must be
      // resolved to an actual Purchase AND ownership-verified against THIS dispute's buyer,
      // or a spoofed/mismatched orderId could trigger a refund against someone else's
      // purchase (or a purchase that doesn't exist at all).
      const purchase = await prisma.purchase.findUnique({ where: { id: existingDispute.orderId } });
      if (!purchase) {
        return res.status(400).json({
          message: "This dispute's orderId does not correspond to a real purchase — cannot process refund, needs manual investigation.",
        });
      }
      if (
        purchase.userId !== existingDispute.buyerId ||
        (purchase.saleId && purchase.saleId !== existingDispute.saleId) ||
        (purchase.itemId && purchase.itemId !== existingDispute.itemId)
      ) {
        return res.status(400).json({
          message: "This dispute's orderId does not match the dispute's buyer/sale/item — refusing to refund, needs manual investigation.",
        });
      }

      // Actually move the money — the SAME Stripe path (TOCTOU claim, idempotency key,
      // booth-cart vs destination-charge branching, hub-owner reversal) the organizer/admin
      // refund endpoint uses. If this throws, the dispute is NOT updated below — an admin
      // sees an error and can retry, instead of the dispute silently flipping to 'resolved'
      // over a refund that never happened.
      try {
        const { refundedAmount, purchase: refundedPurchase } = await executeVerifiedRefund(purchase.id, finalRefundAmount);
        actualRefundedAmount = refundedAmount;
        refundedItemId = refundedPurchase.itemId;
        refundConfirmationParams = {
          toEmail: refundedPurchase.user?.email,
          buyerName: refundedPurchase.user?.name,
          itemTitle: refundedPurchase.item?.title,
          organizerBusinessName: refundedPurchase.sale?.organizer?.businessName,
        };
      } catch (refundErr) {
        if (refundErr instanceof RefundError) {
          return res.status(refundErr.statusCode).json({ message: refundErr.message, ...(refundErr.details || {}) });
        }
        console.error('Error processing dispute refund:', refundErr);
        return res.status(500).json({ message: 'Failed to issue refund' });
      }
    }

    // Update dispute with optional refund cap note
    const updateData: any = {
      status,
      ...(resolution && { resolution })
    };

    // Add refund cap note to resolution if applicable
    if (refundCapApplied && finalRefundAmount !== refundAmount) {
      updateData.resolution = `${resolution || ''} [REFUND CAPPED: Original $${refundAmount.toFixed(2)} → $${finalRefundAmount.toFixed(2)} (Platform Safety #100: First-month account)]`.trim();
    }

    // Update dispute — for a refund-triggering resolution, only reached once Stripe has
    // actually confirmed the refund above (any failure returned early without updating,
    // so the dispute never flips to 'resolved' over a refund that didn't happen).
    const dispute = await prisma.dispute.update({
      where: { id },
      data: updateData,
      include: {
        buyer: {
          select: { id: true, name: true, email: true },
        },
        seller: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Restore the item to AVAILABLE and send the buyer their real refund confirmation —
    // matching what the organizer/admin refund endpoint (POST /api/stripe/refund/:purchaseId)
    // already does — so a dispute-triggered refund is not a silent, second-class one.
    if (actualRefundedAmount !== undefined) {
      if (refundedItemId) {
        await prisma.item.update({
          where: { id: refundedItemId },
          data: { status: 'AVAILABLE' }
        }).catch((err: unknown) => console.error(`[updateDisputeStatus] Failed to restore item ${refundedItemId} to AVAILABLE (non-fatal):`, err));
      }
      if (refundConfirmationParams) {
        sendRefundConfirmationEmail({
          ...refundConfirmationParams,
          refundAmount: actualRefundedAmount,
          wasCapped: refundCapApplied,
        });
      }
    }

    res.json({
      message: 'Dispute status updated',
      dispute,
      ...(refundCapApplied && { refundCapApplied: true, originalAmount: refundAmount, cappedAmount: finalRefundAmount }),
      ...(actualRefundedAmount !== undefined && { refundedAmount: actualRefundedAmount }),
    });
  } catch (error) {
    console.error('Error updating dispute status:', error);
    if ((error as any).code === 'P2025') {
      return res.status(404).json({ message: 'Dispute not found' });
    }
    res.status(500).json({ message: 'Failed to update dispute' });
  }
};

// GET /api/disputes/admin — admin only, all disputes with filters
export const getAdminDisputes = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }

    const status = req.query.status as string | undefined;
    const reason = req.query.reason as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (reason) {
      where.reason = reason;
    }

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        include: {
          buyer: {
            select: { id: true, name: true, email: true },
          },
          seller: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dispute.count({ where }),
    ]);

    res.json({
      disputes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching admin disputes:', error);
    res.status(500).json({ message: 'Failed to fetch disputes' });
  }
};

// GET /api/disputes/:id — get single dispute by ID
export const getDisputeById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: {
        buyer: {
          select: { id: true, name: true, email: true },
        },
        seller: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!dispute) {
      return res.status(404).json({ message: 'Dispute not found' });
    }

    // Check authorization: user must be admin, buyer, or seller
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const isAuthorized =
      user?.role === 'ADMIN' ||
      dispute.buyerId === userId ||
      dispute.sellerId === userId;

    if (!isAuthorized) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json(dispute);
  } catch (error) {
    console.error('Error fetching dispute:', error);
    res.status(500).json({ message: 'Failed to fetch dispute' });
  }
};
