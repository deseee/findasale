import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { cnpSurchargeReceiptFields } from '../services/cnpSurcharge'; // CNP surcharge (2026-09-30): own receipt line + refunded share

export const getMyReceipts = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Query Purchase directly — DigitalReceipt records are not auto-created
    // for all purchase types (auction wins, hold invoices). Purchase is the
    // source of truth for what a shopper has bought.
    // isTestTransaction exclusion (2026-08-29): test-transaction rows must never count as a real sale here
    const purchases = await prisma.purchase.findMany({
      where: {
        userId: req.user.id,
        status: 'PAID',
        isTestTransaction: false,
      },
      select: {
        id: true,
        amount: true,
        createdAt: true,
        stripePaymentIntentId: true,
        // Square migration Wave 1 #1 (Checkout, 2026-09-07): needed to group a Square
        // multi-item cart purchase into one receipt card -- see getBasePIId's comment
        // below for why the Stripe-only PI-suffix-stripping trick doesn't apply to Square.
        processor: true,
        squarePaymentId: true,
        boothCartTransactionId: true,
        // Card-not-present surcharge (2026-09-30): charged on top of `amount`, shown as its own receipt
        // line; the refund columns let the receipt show how much of it has been returned.
        status: true,
        cnpSurchargeCents: true,
        cashLegAmount: true,
        refundedAmount: true,
        refundCashPortion: true,
        sale: {
          select: {
            id: true,
            title: true,
            organizer: {
              select: {
                id: true,
                businessName: true,
              },
            },
          },
        },
        item: {
          select: {
            id: true,
            title: true,
            vendorBooth: { select: { vendorName: true, boothNumber: true } },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Group per-item POS purchases into a single receipt card per transaction.
    // Per-item purchases store stripePaymentIntentId as "{piId}_{itemId}" or "{piId}_misc".
    // We strip the suffix to get the base PI ID and group by it.
    const getBasePIId = (piId: string | null): string | null => {
      if (!piId) return null;
      const lastUnderscore = piId.lastIndexOf('_');
      if (lastUnderscore > 0) {
        const suffix = piId.substring(lastUnderscore + 1);
        // cuid item IDs start with 'cm' and are ~25 chars; 'misc' is the misc-remainder marker
        if ((suffix.startsWith('cm') && suffix.length >= 20) || suffix === 'misc') {
          return piId.substring(0, lastUnderscore);
        }
      }
      return piId;
    };

    // Square migration Wave 1 #1 (Checkout, 2026-09-07): squarePaymentController.ts's
    // createSquareCartPayment creates one Purchase row PER ITEM but they all share the
    // SAME real squarePaymentId verbatim (no "{piId}_{itemId}" composite the way the
    // Stripe POS path uses -- Square's Purchase.squarePaymentId is unique only in
    // combination with itemId, see migration 20260907010000_square_migration_wave0_schema,
    // so no suffix-stripping trick is needed or correct here). getBasePIId would return a
    // Square payment id UNCHANGED (it never matches the cuid-suffix or '_misc' pattern),
    // which already happens to group correctly by accident for single-item Square
    // purchases -- but WITHOUT this branch, a routing bug elsewhere could silently key a
    // group on a stripePaymentIntentId value for a Square row that also happens to be
    // null, colliding two unrelated Square carts. Keying explicitly on
    // (processor, squarePaymentId) removes any doubt and makes a Square multi-item cart
    // purchase group correctly instead of silently receipting as N separate single-item
    // receipts (the bug this fix closes).
    const getSquareGroupKey = (p: (typeof purchases)[number]): string | null =>
      p.processor === 'SQUARE' && p.squarePaymentId ? `square:${p.squarePaymentId}` : null;

    // ADR-020: booth-cart purchases now each carry a REAL, distinct per-booth
    // PaymentIntent id (no more shared "{cartPiId}_{itemId}" composite to strip),
    // so grouping by stripePaymentIntentId alone would split one cart into N
    // separate receipt cards (one per vendor booth actually charged) — technically
    // accurate to the N separate statement charges, but the receipt UI still wants
    // ONE card per cart/checkout moment. Group by boothCartTransactionId FIRST when
    // present (spans every booth in that cart); then the Square cart key (if this is a
    // Square row); fall back to the existing Stripe PI-suffix-stripping grouping for
    // everything else, unchanged.
    const transactionGroups = new Map<string, typeof purchases>();
    for (const p of purchases) {
      const key = p.boothCartTransactionId ?? getSquareGroupKey(p) ?? getBasePIId(p.stripePaymentIntentId) ?? p.id;
      const group = transactionGroups.get(key) ?? [];
      group.push(p);
      transactionGroups.set(key, group);
    }

    // Shape response to match ReceiptCard component expectations
    const receipts = Array.from(transactionGroups.values()).map((group) => {
      const first = group[0];
      const total = group.reduce((sum, p) => sum + p.amount, 0);
      // Card-not-present surcharge (2026-09-30): summed in whole cents across the group's rows. `total`
      // stays the sale principal (the surcharge is not sale revenue); totalCharged is what the card was
      // actually run for.
      let cnpSurchargeCents = 0;
      let cnpSurchargeRefundedCents = 0;
      for (const p of group) {
        const f = cnpSurchargeReceiptFields(p);
        cnpSurchargeCents += Math.round(f.cnpSurchargeAmount * 100);
        cnpSurchargeRefundedCents += Math.round(f.cnpSurchargeRefundedAmount * 100);
      }
      return {
        id: first.id,
        issuedAt: first.createdAt,
        total,
        ...(cnpSurchargeCents > 0
          ? {
              cnpSurchargeAmount: cnpSurchargeCents / 100,
              cnpSurchargeRefundedAmount: cnpSurchargeRefundedCents / 100,
              totalCharged: Math.round(total * 100 + cnpSurchargeCents) / 100,
            }
          : {}),
        items: group.map((p) => ({
          itemTitle: p.item?.title ?? (p.sale?.title ? `${p.sale.title} Purchase` : 'POS Purchase'),
          photoUrl: undefined,
          price: p.amount,
          // ADR-020: itemized per-vendor label so a multi-booth cart receipt shows
          // "Booth A (Booth 3)" under each item, matching the N separate statement
          // charges instead of looking like one undifferentiated total.
          vendorBoothName: p.item?.vendorBooth
            ? `${p.item.vendorBooth.vendorName}${p.item.vendorBooth.boothNumber ? ` (Booth ${p.item.vendorBooth.boothNumber})` : ''}`
            : undefined,
        })),
        purchase: first,
      };
    });

    res.json({ receipts });
  } catch (error) {
    console.error('getMyReceipts error:', error);
    res.status(500).json({ message: 'Failed to fetch receipts' });
  }
};

export const getReceipt = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;

    const receipt = await prisma.digitalReceipt.findUnique({
      where: { id: parseInt(id) },
      include: {
        purchase: {
          select: {
            id: true,
            userId: true,
            amount: true,
            createdAt: true,
            // Card-not-present surcharge (2026-09-30)
            status: true,
            cnpSurchargeCents: true,
            cashLegAmount: true,
            refundedAmount: true,
            refundCashPortion: true,
            sale: {
              select: {
                id: true,
                title: true,
                address: true,
                city: true,
                state: true,
                zip: true,
                organizer: {
                  select: {
                    businessName: true,
                    phone: true,
                  },
                },
              },
            },
            item: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    });

    if (!receipt) {
      return res.status(404).json({ message: 'Receipt not found' });
    }

    if (receipt.purchase.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Card-not-present surcharge (2026-09-30): its own receipt line, plus the refunded share. Zeros when
    // the purchase carried none.
    res.json({ receipt: { ...receipt, ...cnpSurchargeReceiptFields(receipt.purchase) } });
  } catch (error) {
    console.error('getReceipt error:', error);
    res.status(500).json({ message: 'Failed to fetch receipt' });
  }
};
