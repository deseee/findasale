import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { BoothAuthRequest } from '../middleware/requireBoothAuth';
import { prisma } from '../lib/prisma';
import { getStripe } from '../utils/stripe';
import { assertBoothCartCheckoutAllowed, CheckoutGuardError } from '../services/checkoutGuard';
import { endEbayListingIfExists } from './ebayController';
import { markShopifyItemSold } from '../services/shopifyService';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';

const stripe = () => getStripe();

/**
 * Vendor Booth Payments — Roaming Multi-Booth Cart (2026-07-07)
 * ADR-015 (base cart mechanic, clones posPaymentController.confirmPaymentRequest's
 * Stripe pattern) + ADR-016 (distributed vendor payouts happen at settlement time,
 * not at charge time — the cart charge itself is unchanged: one PaymentIntent on
 * the organizer's stripeConnectId) + ADR-017 (assertBoothCartCheckoutAllowed guard,
 * server-side PaymentIntent re-verification before creating completion rows).
 *
 * Decision log 2026-07-07: add-items REJECTS both non-CONFIRMED booths AND
 * unclaimed (userId IS NULL) booths — the cheapest fix for the wash-trade blind
 * spot an unclaimed booth otherwise represents.
 */

/**
 * POST /api/organizer/hubs/:hubId/cart/start
 * Cashier (TeamMember JWT or X-Booth-Token) opens a BoothCartTransaction.
 * requireBoothTokenOrTeamMember() must run before this and populate req.boothAuth.
 */
export const startBoothCart = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId } = req.params;
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const hub = await prisma.saleHub.findUnique({ where: { id: hubId }, select: { id: true } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const cart = await prisma.boothCartTransaction.create({
      data: {
        hubId,
        cashierTeamMemberId: req.boothAuth.type === 'TEAM_MEMBER' ? req.boothAuth.teamMemberId : null,
        cashierBoothId: req.boothAuth.type === 'BOOTH' ? req.boothAuth.vendorBoothId : null,
        status: 'PENDING',
        boothsRepresented: [],
      },
    });

    return res.status(201).json(cart);
  } catch (error) {
    console.error('[startBoothCart] Error:', error);
    return res.status(500).json({ error: 'Failed to start cart' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/items
 * Add item(s) to the cart. Server resolves each item's vendorBoothId — cart can
 * span any booths in the hub. Rejects items whose status !== 'AVAILABLE', OR
 * whose booth status !== 'CONFIRMED', OR whose booth is unclaimed (userId IS NULL)
 * — per the 2026-07-07 decision log, unclaimed booths are hard-blocked from
 * checkout (not just a wash-trade-guard skip; a full reject at add-items).
 * Body: { itemIds: string[] }
 */
export const addBoothCartItems = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    const { itemIds } = req.body as { itemIds?: string[] };
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds is required and must be a non-empty array' });
    }

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (cart.status !== 'PENDING') {
      return res.status(409).json({ error: `Cart is not open for edits (status: ${cart.status})` });
    }

    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true, title: true, price: true, status: true, vendorBoothId: true,
        vendorBooth: { select: { id: true, status: true, userId: true } },
      },
    });

    if (items.length !== itemIds.length) {
      return res.status(400).json({ error: 'One or more items not found' });
    }

    const rejected: Array<{ itemId: string; reason: string }> = [];
    const accepted: typeof items = [];

    for (const item of items) {
      if (item.status !== 'AVAILABLE') {
        rejected.push({ itemId: item.id, reason: 'ITEM_NOT_AVAILABLE' });
        continue;
      }
      if (item.vendorBoothId) {
        if (!item.vendorBooth || item.vendorBooth.status !== 'CONFIRMED') {
          rejected.push({ itemId: item.id, reason: 'BOOTH_NOT_CONFIRMED' });
          continue;
        }
        // Decision log 2026-07-07: unclaimed booths (userId IS NULL) are BLOCKED
        // from checkout entirely — generic reason, never leak "unclaimed" as a
        // distinct signal that invites probing.
        if (!item.vendorBooth.userId) {
          rejected.push({ itemId: item.id, reason: 'ITEM_NOT_AVAILABLE' });
          continue;
        }
      }
      accepted.push(item);
    }

    if (accepted.length === 0) {
      return res.status(409).json({ error: 'No items could be added to the cart', rejected });
    }

    const newBoothIds = Array.from(
      new Set(accepted.map((i) => i.vendorBoothId).filter((id): id is string => !!id))
    );
    const mergedBoothsRepresented = Array.from(new Set([...cart.boothsRepresented, ...newBoothIds]));

    const newTotal = accepted.reduce((sum, i) => sum + (i.price || 0), 0) + Number(cart.totalAmount);

    const updated = await prisma.boothCartTransaction.update({
      where: { id: cart.id },
      data: {
        boothsRepresented: mergedBoothsRepresented,
        totalAmount: newTotal,
      },
    });

    // Reserve items against this cart so a second concurrent cart can't also grab them.
    await prisma.item.updateMany({
      where: { id: { in: accepted.map((i) => i.id) } },
      data: { status: 'RESERVED' },
    });

    return res.status(200).json({
      cart: updated,
      accepted: accepted.map((i) => ({ itemId: i.id, title: i.title, price: i.price })),
      rejected,
    });
  } catch (error) {
    console.error('[addBoothCartItems] Error:', error);
    return res.status(500).json({ error: 'Failed to add items to cart' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/charge
 * Creates the single PaymentIntent on the organizer's stripeConnectId (direct
 * charge, matching posPaymentController's pattern). Calls
 * assertBoothCartCheckoutAllowed BEFORE creating the PaymentIntent (hard gate,
 * not optional hardening, per ADR-017).
 * Body: { buyerUserId? } — walk-in POS carts may have no buyer account (matches
 * Purchase.userId's existing nullable-for-POS-walk-in shape); when buyerUserId is
 * provided, the wash-trade guard runs against it.
 */
export const chargeBoothCart = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    const { buyerUserId } = req.body as { buyerUserId?: string };
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (cart.status !== 'PENDING') {
      return res.status(409).json({ error: `Cart cannot be charged (status: ${cart.status})` });
    }
    if (cart.boothsRepresented.length === 0 && Number(cart.totalAmount) === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const hub = await prisma.saleHub.findUnique({
      where: { id: hubId },
      select: { organizer: { select: { stripeConnectId: true } } },
    });
    if (!hub?.organizer?.stripeConnectId) {
      return res.status(400).json({ error: 'Organizer has not set up payment processing' });
    }

    // Hard gate — must run before PaymentIntent creation, not optional hardening.
    if (buyerUserId) {
      try {
        await assertBoothCartCheckoutAllowed({
          buyerUserId,
          hubId,
          cartTransactionId,
          boothsRepresented: cart.boothsRepresented,
          cashierTeamMemberId: req.boothAuth.type === 'TEAM_MEMBER' ? req.boothAuth.teamMemberId : null,
          cashierBoothId: req.boothAuth.type === 'BOOTH' ? req.boothAuth.vendorBoothId : null,
          prisma,
          context: 'boothCartCharge',
        });
      } catch (guardError) {
        if (guardError instanceof CheckoutGuardError) {
          return res.status(403).json({ error: guardError.message });
        }
        throw guardError;
      }
    }

    const amountCents = Math.round(Number(cart.totalAmount) * 100);
    if (amountCents < 50) {
      return res.status(400).json({ error: 'Cart total must be at least $0.50 to process payment' });
    }

    let paymentIntent;
    try {
      paymentIntent = await stripe().paymentIntents.create(
        {
          amount: amountCents,
          currency: 'usd',
          payment_method_types: ['card'],
          metadata: {
            source: 'booth_cart',
            hubId,
            cartTransactionId: cart.id,
          },
        },
        { stripeAccount: hub.organizer.stripeConnectId }
      );
    } catch (err: any) {
      console.error('[chargeBoothCart] Failed to create PaymentIntent:', err);
      return res.status(500).json({ error: 'Failed to create payment intent', details: err.message });
    }

    await prisma.boothCartTransaction.update({
      where: { id: cart.id },
      data: { stripePaymentIntentId: paymentIntent.id },
    });

    return res.status(200).json({
      cartTransactionId: cart.id,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents,
    });
  } catch (error) {
    console.error('[chargeBoothCart] Error:', error);
    return res.status(500).json({ error: 'Failed to charge cart' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/confirm
 * Client-triggered after stripe.confirmCardPayment() succeeds. Server-side
 * re-verifies the PaymentIntent via retrieval before creating any Purchase/
 * BoothCartTransaction completion rows (ADR-017 corrects ADR-016's
 * "webhook-confirmed" language — confirmPaymentRequest is actually
 * client-triggered WITH server-side re-verification, not webhook-driven).
 * Body: { paymentIntentId: string, buyerUserId?: string }
 */
export const confirmBoothCart = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    const { paymentIntentId, buyerUserId } = req.body as { paymentIntentId?: string; buyerUserId?: string };
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });
    if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId is required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });

    if (cart.status === 'COMPLETED') {
      return res.status(200).json({ success: true, message: 'Cart already completed' });
    }
    if (cart.stripePaymentIntentId !== paymentIntentId) {
      return res.status(400).json({ error: 'PaymentIntent does not match this cart' });
    }

    const hub = await prisma.saleHub.findUnique({
      where: { id: hubId },
      select: { organizer: { select: { stripeConnectId: true } } },
    });
    if (!hub?.organizer?.stripeConnectId) {
      return res.status(400).json({ error: 'Organizer Stripe account not configured' });
    }

    // Server-side re-verification — never trust the client's "it succeeded" alone.
    let paymentIntent;
    try {
      paymentIntent = await stripe().paymentIntents.retrieve(paymentIntentId, {
        stripeAccount: hub.organizer.stripeConnectId,
      });
    } catch (err: any) {
      console.error('[confirmBoothCart] Failed to retrieve PaymentIntent:', err);
      return res.status(400).json({ error: 'Could not verify payment with Stripe' });
    }

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ error: `Payment intent status is ${paymentIntent.status}, expected succeeded` });
    }

    // Look up the RESERVED items that belong to booths in this cart AND were reserved
    // for this specific cart. Since Item has no direct cartTransactionId column, we
    // resolve via the accepted-items list recorded implicitly by RESERVED status +
    // vendorBoothId membership in boothsRepresented. To avoid ambiguity with OTHER
    // concurrent reservations, the add-items step must be the only writer of RESERVED
    // for booth-cart items; a production hardening item (see Blocked/Flagged) would add
    // an explicit itemIds column on BoothCartTransaction for full precision.
    const cartItems = await prisma.item.findMany({
      where: {
        status: 'RESERVED',
        OR: [
          { vendorBoothId: { in: cart.boothsRepresented.length > 0 ? cart.boothsRepresented : ['__none__'] } },
        ],
      },
      select: { id: true, price: true, vendorBoothId: true },
    });

    for (const item of cartItems) {
      try {
        await prisma.purchase.create({
          data: {
            userId: buyerUserId || null,
            itemId: item.id,
            amount: item.price || 0,
            stripePaymentIntentId: `${paymentIntent.id}_${item.id}`,
            source: 'POS',
            status: 'PAID',
            boothCartTransactionId: cart.id,
          },
        });

        await prisma.item.update({ where: { id: item.id }, data: { status: 'SOLD' } });

        endEbayListingIfExists(item.id).catch((err) => console.error('[eBay] Failed to withdraw offer:', err));
        markShopifyItemSold(item.id).catch((err) => console.error('[Shopify] Failed to mark item sold:', err));
        notifyFacebookExportedItemSold(item.id).catch((err) =>
          console.warn(`[FB Nudge] failed for item ${item.id}:`, err.message)
        );
      } catch (err: any) {
        console.error(`[confirmBoothCart] Failed to finalize item ${item.id}:`, err);
      }
    }

    await prisma.boothCartTransaction.update({
      where: { id: cart.id },
      data: { status: 'COMPLETED' },
    });

    return res.status(200).json({ success: true, itemsSold: cartItems.length });
  } catch (error) {
    console.error('[confirmBoothCart] Error:', error);
    return res.status(500).json({ error: 'Failed to confirm cart payment' });
  }
};

/**
 * GET /api/organizer/hubs/:hubId/cart-transactions
 * Organizer-only audit view: cashier, timestamp, booths represented, total.
 */
export const listBoothCartTransactions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId } = req.params;

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ error: 'Organizer profile not found' });

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const transactions = await prisma.boothCartTransaction.findMany({
      where: { hubId },
      select: {
        id: true, totalAmount: true, boothsRepresented: true, status: true, createdAt: true,
        cashierTeamMemberId: true, cashierBoothId: true, stripePaymentIntentId: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(
      transactions.map((t) => ({ ...t, totalAmount: t.totalAmount.toString() }))
    );
  } catch (error) {
    console.error('[listBoothCartTransactions] Error:', error);
    return res.status(500).json({ error: 'Failed to list cart transactions' });
  }
};
