import { prisma } from '../lib/prisma';

interface ReceiptItem {
  itemTitle: string;
  photoUrl?: string;
  price: number;
}

export const generateReceipt = async (purchaseId: string): Promise<void> => {
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        item: {
          select: {
            title: true,
            photoUrls: true,
            price: true,
          },
        },
        sale: {
          select: {
            id: true,
            title: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!purchase) {
      console.warn(`[receipt] Purchase not found: ${purchaseId}`);
      return;
    }

    // Check if receipt already exists
    const existingReceipt = await prisma.digitalReceipt.findUnique({
      where: { purchaseId },
    });

    if (existingReceipt) {
      console.warn(`[receipt] Receipt already exists for purchase ${purchaseId}`);
      return;
    }

    // Build items array for receipt
    const receiptItems: ReceiptItem[] = [];
    if (purchase.item) {
      receiptItems.push({
        itemTitle: purchase.item.title,
        photoUrl: purchase.item.photoUrls?.[0] || undefined,
        price: purchase.item.price || 0,
      });
    }

    // Create digital receipt
    await prisma.digitalReceipt.create({
      data: {
        purchaseId,
        items: receiptItems as any,
        total: purchase.amount,
      },
    });

    console.log(`[receipt] Generated receipt for purchase ${purchaseId}`);
  } catch (error) {
    console.error(`[receipt] Failed to generate receipt for purchase ${purchaseId}:`, error);
  }
};

/**
 * ADR-020 (2026-07-07): Vendor Booth cart itemized receipt email.
 *
 * A booth-cart checkout now produces N separate Stripe charges (one per vendor
 * booth's own Standard account) instead of one combined charge — the shopper's
 * card statement will show N separate lines. This groups the cart's Purchase
 * rows by vendorBoothId and emails one itemized receipt showing each booth's
 * subtotal (e.g. "Booth A: $23.00, Booth B: $41.00") so the multiple statement
 * lines make sense, instead of looking like duplicate/erroneous charges.
 *
 * Fire-and-forget, called from vendorBoothCartController.captureBoothCart after
 * all legs are captured and Purchase rows exist. Per-item DigitalReceipt rows
 * are generated separately via generateReceipt() (unchanged) so the existing
 * shopper "My Receipts" view keeps working; this function is the NEW itemized
 * cart-level summary, not a replacement for the per-item receipt.
 */
export const sendBoothCartReceiptEmail = async (cartTransactionId: string): Promise<void> => {
  try {
    const cart = await prisma.boothCartTransaction.findUnique({
      where: { id: cartTransactionId },
      include: {
        hub: { select: { name: true } },
        purchases: {
          select: {
            id: true,
            amount: true,
            userId: true,
            buyerEmail: true,
            item: {
              select: {
                title: true,
                vendorBooth: { select: { id: true, vendorName: true, boothNumber: true } },
              },
            },
          },
        },
      },
    });

    if (!cart || cart.purchases.length === 0) {
      console.warn(`[receipt] sendBoothCartReceiptEmail: no cart or purchases for ${cartTransactionId}`);
      return;
    }

    // Resolve recipient email: buyerEmail on any purchase, else the buyer's User.email.
    let recipientEmail: string | null = cart.purchases.find((p) => p.buyerEmail)?.buyerEmail ?? null;
    if (!recipientEmail) {
      const buyerUserId = cart.purchases.find((p) => p.userId)?.userId;
      if (buyerUserId) {
        const buyer = await prisma.user.findUnique({ where: { id: buyerUserId }, select: { email: true } });
        recipientEmail = buyer?.email ?? null;
      }
    }
    if (!recipientEmail) {
      // No email on file for this walk-in — nothing to send, not an error.
      return;
    }

    // Group purchases by vendor booth for the itemized breakdown.
    const byBooth = new Map<string, { boothName: string; boothNumber: string; items: Array<{ title: string; amount: number }>; subtotal: number }>();
    let grandTotal = 0;
    for (const p of cart.purchases) {
      const boothId = p.item?.vendorBooth?.id ?? 'unknown';
      const boothName = p.item?.vendorBooth?.vendorName ?? 'Booth';
      const boothNumber = p.item?.vendorBooth?.boothNumber ?? '';
      const group = byBooth.get(boothId) ?? { boothName, boothNumber, items: [], subtotal: 0 };
      group.items.push({ title: p.item?.title ?? 'Item', amount: p.amount });
      group.subtotal += p.amount;
      byBooth.set(boothId, group);
      grandTotal += p.amount;
    }

    const boothSectionsHtml = Array.from(byBooth.values())
      .map((group) => {
        const itemsHtml = group.items.map((i) => `<li>${i.title} — $${i.amount.toFixed(2)}</li>`).join('');
        return `<div style="margin-bottom:16px;"><strong>${group.boothName}${group.boothNumber ? ` (Booth ${group.boothNumber})` : ''}: $${group.subtotal.toFixed(2)}</strong><ul>${itemsHtml}</ul></div>`;
      })
      .join('');

    const { buildEmail } = await import('./emailTemplateService');
    const { transactionalEmailService } = await import('../lib/transactionalEmailService');

    const html = buildEmail({
      preheader: 'Your itemized receipt from FindA.Sale',
      headline: 'Your receipt from FindA.Sale',
      body: `<p>Thank you for your purchase${cart.hub?.name ? ` at ${cart.hub.name}` : ''}! Your cart included items from ${byBooth.size} vendor booth${byBooth.size === 1 ? '' : 's'} — each is billed separately, so your card statement will show ${byBooth.size} separate line${byBooth.size === 1 ? '' : 's'} matching the breakdown below.</p>${boothSectionsHtml}<p><strong>Total: $${grandTotal.toFixed(2)}</strong></p>`,
      ctaText: 'View your purchases',
      ctaUrl: `${process.env.FRONTEND_URL || 'https://finda.sale'}/shopper/purchases`,
    });

    await transactionalEmailService.emails.send({
      to: recipientEmail,
      subject: `Receipt: Your purchase from ${byBooth.size} vendor${byBooth.size === 1 ? '' : 's'}`,
      html,
    });
  } catch (error) {
    console.error(`[receipt] Failed to send booth cart receipt email for cart ${cartTransactionId}:`, error);
  }
};
