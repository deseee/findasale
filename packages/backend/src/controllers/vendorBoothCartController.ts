import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { BoothAuthRequest } from '../middleware/requireBoothAuth';
import { prisma } from '../lib/prisma';
import { getStripe } from '../utils/stripe';
import { assertBoothCartCheckoutAllowed, CheckoutGuardError } from '../services/checkoutGuard';
import { endEbayListingIfExists } from './ebayController';
import { markShopifyItemSold } from '../services/shopifyService';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService'; // ADR-087 Phase 4: revise-on-partial eBay quantity sync
import { generateReceipt, sendBoothCartReceiptEmail } from '../services/receiptService';

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
        vendorBooth: { select: { id: true, hubId: true, status: true, userId: true } },
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
      // findasale-hacker P0 fix, 2026-07-08: this cart is scoped to ONE hub
      // (:hubId in the route) -- every item added must be a CONFIRMED, claimed
      // VendorBooth item belonging to THIS SAME hub. Items with no vendorBoothId at
      // all (not a vendor-booth item), or whose booth belongs to a DIFFERENT hub,
      // are rejected with the SAME generic reason as the other checks below so no
      // distinct signal (cross-hub vs. non-booth vs. unclaimed) is ever leaked to
      // the caller.
      if (!item.vendorBoothId || !item.vendorBooth || item.vendorBooth.hubId !== hubId) {
        rejected.push({ itemId: item.id, reason: 'ITEM_NOT_AVAILABLE' });
        continue;
      }
      if (item.vendorBooth.status !== 'CONFIRMED') {
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
 * ADR-020 (2026-07-07, Patrick-approved same session): Standard-account migration.
 * Replaces the old single-PaymentIntent-per-cart model (`chargeBoothCart` /
 * `confirmBoothCart`, one Direct charge on the ORGANIZER's stripeConnectId, vendor
 * payouts settled later via Transfer) with a sequential per-booth model — one
 * PaymentIntent PER VENDOR BOOTH, each a Direct charge on THAT booth's own Standard
 * account (`stripeAccountId`). Terminal rail: authorize-all (one physical tap per
 * booth, `capture_method: 'manual'`), then capture-all together. QR/in-app rail:
 * one shared PaymentMethod (via a platform SetupIntent) cloned into each booth's
 * account and confirmed off_session, also `capture_method: 'manual'` so it can
 * converge on the SAME capture-all endpoint as the Terminal rail. Any leg that
 * can't be resolved cancels the whole cart (free, since nothing is captured until
 * every leg has authorized) — v1 behavior is whole-cart-cancel-and-restart, NOT
 * partial-capture/split-transaction (explicitly rejected by Patrick's sign-off).
 *
 * Cart-lock (checkoutGuard timing gap flagged in ADR-020): `assertBoothCartCheckoutAllowed`
 * runs exactly ONCE per cart, at the first leg's authorize call, inside
 * `beginCartCheckout` below. That same call atomically flips
 * `BoothCartTransaction.status` PENDING -> IN_PROGRESS via a conditional
 * `updateMany` (only matches a row still PENDING, so a race can't double-run the
 * guard or double-lock). `addBoothCartItems` above already rejects any cart whose
 * status isn't PENDING — so this status flip IS the cart lock; no separate schema
 * field was needed for it. `boothsRepresented` therefore can't change out from
 * under the guard's evaluation once charging starts.
 */

const isTerminalSimulated = () => process.env.STRIPE_TERMINAL_SIMULATED === 'true';

/**
 * Sum of RESERVED item prices, for THIS cart's boothsRepresented, belonging to one
 * specific vendor booth. Same ambiguity the original code documented (Item has no
 * direct cartTransactionId column — RESERVED + vendorBoothId-in-boothsRepresented is
 * the existing resolution mechanism, unchanged here, not a new gap introduced by
 * this rework): a production hardening item would add an explicit itemIds column on
 * BoothCartTransaction for full precision against a second concurrent cart on the
 * same hub.
 */
async function resolveBoothLegItems(cartTransactionId: string, boothsRepresented: string[], vendorBoothId: string) {
  if (!boothsRepresented.includes(vendorBoothId)) return [];
  return prisma.item.findMany({
    where: { status: 'RESERVED', vendorBoothId },
    select: { id: true, price: true, title: true, vendorBoothId: true },
  });
}

/**
 * Runs the checkout guard exactly once per cart (on the FIRST leg, whichever rail),
 * and atomically locks the cart (PENDING -> IN_PROGRESS) so `addBoothCartItems`
 * rejects further edits from this point on. Idempotent for subsequent legs of the
 * same cart: if the cart is already IN_PROGRESS, this is a no-op (guard already ran).
 * Throws CheckoutGuardError (caller must 403) or a plain Error for cart-state issues.
 */
async function beginCartCheckout(params: {
  cart: { id: string; hubId: string; status: string; boothsRepresented: string[] };
  hubId: string;
  buyerUserId?: string;
  cashierTeamMemberId?: string | null;
  cashierBoothId?: string | null;
  context: string;
}): Promise<void> {
  const { cart, hubId, buyerUserId, cashierTeamMemberId, cashierBoothId, context } = params;

  if (cart.status === 'IN_PROGRESS') return; // guard already ran for an earlier leg in this cart

  if (cart.status !== 'PENDING') {
    throw new Error(`CART_NOT_CHARGEABLE:${cart.status}`);
  }

  await assertBoothCartCheckoutAllowed({
    buyerUserId,
    hubId,
    cartTransactionId: cart.id,
    boothsRepresented: cart.boothsRepresented,
    cashierTeamMemberId,
    cashierBoothId,
    prisma,
    context,
  });

  // Conditional update — only matches a row still PENDING. A second concurrent
  // call (e.g. two legs racing in) either gets count 1 (it wins the lock, but the
  // guard above already ran redundantly for both — acceptable, guard is read-only
  // and idempotent) or count 0 (someone else already locked it — treat as success,
  // not an error, since the net effect — locked + guard passed — is the same).
  await prisma.boothCartTransaction.updateMany({
    where: { id: cart.id, status: 'PENDING' },
    data: { status: 'IN_PROGRESS' },
  });
}

/**
 * GET /api/organizer/hubs/:hubId/cart/:cartTransactionId/booth-summary
 * Per-booth subtotal breakdown for the cashier's sequential tap UI ("tap for
 * Booth A — $23.00", "tap for Booth B — $41.00", ...) and for the QR rail's
 * per-leg amount resolution. Also reports each booth's onboarding readiness
 * (stripeAccountType === 'standard' && stripeOnboarded) so the frontend can
 * surface a clear error before the cashier starts tapping.
 */
export const getBoothCartSummary = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });

    const booths = await prisma.vendorBooth.findMany({
      where: { id: { in: cart.boothsRepresented } },
      select: { id: true, vendorName: true, boothNumber: true, stripeAccountId: true, stripeAccountType: true, stripeOnboarded: true },
    });

    const legs = await prisma.boothCartLeg.findMany({ where: { cartTransactionId: cart.id } });
    const legsByBooth = new Map(legs.map((l) => [l.vendorBoothId, l]));

    const summary = await Promise.all(
      booths.map(async (booth) => {
        const items = await resolveBoothLegItems(cart.id, cart.boothsRepresented, booth.id);
        const subtotalCents = Math.round(items.reduce((sum, i) => sum + (i.price || 0), 0) * 100);
        const leg = legsByBooth.get(booth.id);
        return {
          vendorBoothId: booth.id,
          vendorName: booth.vendorName,
          boothNumber: booth.boothNumber,
          subtotalCents,
          itemCount: items.length,
          readyForStandardCharge: booth.stripeAccountType === 'standard' && booth.stripeOnboarded && !!booth.stripeAccountId,
          leg: leg ? { legId: leg.id, status: leg.status, rail: leg.rail } : null,
        };
      })
    );

    return res.status(200).json({ cartStatus: cart.status, booths: summary });
  } catch (error) {
    console.error('[getBoothCartSummary] Error:', error);
    return res.status(500).json({ error: 'Failed to load cart summary' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/terminal/connection-token
 * Body: { vendorBoothId }
 * Booth-scoped Terminal connection token — the physical reader needs a fresh token
 * scoped to EACH booth's own connected account before that booth's leg can be
 * tapped (mirrors terminalController.createConnectionToken, but per-booth instead
 * of per-organizer).
 */
export const createBoothCartTerminalConnectionToken = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    const { vendorBoothId } = req.body as { vendorBoothId?: string };
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });
    if (!vendorBoothId) return res.status(400).json({ error: 'vendorBoothId is required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!cart.boothsRepresented.includes(vendorBoothId)) {
      return res.status(400).json({ error: 'Booth is not represented in this cart' });
    }

    if (isTerminalSimulated()) {
      const token = await stripe().terminal.connectionTokens.create({});
      return res.status(200).json({ secret: token.secret });
    }

    const booth = await prisma.vendorBooth.findFirst({ where: { id: vendorBoothId, hubId } });
    if (!booth?.stripeAccountId) {
      return res.status(400).json({ error: 'This booth has not completed Stripe onboarding' });
    }

    const token = await stripe().terminal.connectionTokens.create({}, { stripeAccount: booth.stripeAccountId! });
    return res.status(200).json({ secret: token.secret });
  } catch (error) {
    console.error('[createBoothCartTerminalConnectionToken] Error:', error);
    return res.status(500).json({ error: 'Failed to create Terminal connection token' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/terminal/authorize
 * Body: { vendorBoothId, buyerUserId? }
 * ADR-020 step 3: creates a `card_present`, `capture_method: 'manual'`
 * PaymentIntent scoped to THIS booth's own `stripeAccountId` for THIS booth's
 * subtotal. The cashier taps the physical card against the reader for the
 * returned clientSecret next (client-side `collectPaymentMethod` +
 * `processPayment`, same SDK calls `pages/organizer/pos.tsx` already uses).
 * Runs the checkout guard + cart lock on the FIRST leg only (see beginCartCheckout).
 */
export const authorizeBoothCartTerminalLeg = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    const { vendorBoothId, buyerUserId } = req.body as { vendorBoothId?: string; buyerUserId?: string };
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });
    if (!vendorBoothId) return res.status(400).json({ error: 'vendorBoothId is required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!cart.boothsRepresented.includes(vendorBoothId)) {
      return res.status(400).json({ error: 'Booth is not represented in this cart' });
    }

    const existingLeg = await prisma.boothCartLeg.findFirst({
      where: { cartTransactionId: cart.id, vendorBoothId, status: { in: ['PENDING', 'REQUIRES_CAPTURE', 'CAPTURED'] } },
    });
    if (existingLeg) {
      return res.status(409).json({ error: 'This booth already has an active leg on this cart', legId: existingLeg.id, status: existingLeg.status });
    }

    try {
      await beginCartCheckout({
        cart,
        hubId,
        buyerUserId,
        cashierTeamMemberId: req.boothAuth.type === 'TEAM_MEMBER' ? req.boothAuth.teamMemberId : null,
        cashierBoothId: req.boothAuth.type === 'BOOTH' ? req.boothAuth.vendorBoothId : null,
        context: 'boothCartTerminalAuthorize',
      });
    } catch (guardError: any) {
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ error: guardError.message });
      }
      if (typeof guardError?.message === 'string' && guardError.message.startsWith('CART_NOT_CHARGEABLE:')) {
        return res.status(409).json({ error: `Cart cannot be charged (status: ${guardError.message.split(':')[1]})` });
      }
      throw guardError;
    }

    const booth = await prisma.vendorBooth.findFirst({ where: { id: vendorBoothId, hubId } });
    if (!booth) return res.status(404).json({ error: 'Booth not found' });
    if (!isTerminalSimulated()) {
      if (booth.stripeAccountType !== 'standard' || !booth.stripeOnboarded || !booth.stripeAccountId) {
        return res.status(400).json({ error: `Booth "${booth.vendorName}" has not completed Standard-account onboarding` });
      }
    }

    const items = await resolveBoothLegItems(cart.id, cart.boothsRepresented, vendorBoothId);
    const amountCents = Math.round(items.reduce((sum, i) => sum + (i.price || 0), 0) * 100);
    if (amountCents < 50) {
      return res.status(400).json({ error: `Booth "${booth.vendorName}"'s subtotal must be at least $0.50 to process payment` });
    }

    // Race-safe claim (findasale-hacker adversarial pass, 2026-07-08): the existingLeg
    // check above is a plain read and cannot close a TOCTOU window between two
    // concurrent authorize calls for the SAME booth on the SAME cart (e.g. a flaky
    // cashier UI double-firing the tap request) -- both could pass that read before
    // either creates its row, producing TWO PaymentIntents (and, once captured, TWO
    // Purchase rows) for the same booth's items. This claim leverages the EXISTING
    // @unique constraint on BoothCartLeg.stripePaymentIntentId as a compare-and-swap
    // primitive (no schema change): a deterministic key means only one concurrent
    // request's create() can win; the loser gets a Prisma P2002 and is rejected below,
    // BEFORE any Stripe call is made (so a losing request never creates a stray
    // PaymentIntent). The winner overwrites the placeholder with the real Stripe
    // PaymentIntent id once it's created.
    const claimKey = `claim_${cart.id}_${vendorBoothId}`;
    let claimedLeg;
    try {
      claimedLeg = await prisma.boothCartLeg.create({
        data: {
          cartTransactionId: cart.id,
          vendorBoothId,
          stripeAccountId: isTerminalSimulated() ? '' : booth.stripeAccountId!,
          stripePaymentIntentId: claimKey,
          amountCents,
          rail: 'TERMINAL',
          status: 'PENDING',
        },
      });
    } catch (claimErr: any) {
      if (claimErr?.code === 'P2002') {
        return res.status(409).json({ error: 'This booth already has an active leg on this cart (concurrent request)' });
      }
      throw claimErr;
    }

    const piParams = {
      amount: amountCents,
      currency: 'usd',
      payment_method_types: ['card_present'],
      capture_method: 'manual' as const,
      metadata: {
        source: 'booth_cart_leg',
        rail: 'TERMINAL',
        hubId,
        cartTransactionId: cart.id,
        vendorBoothId,
      },
    };

    let paymentIntent;
    try {
      paymentIntent = isTerminalSimulated()
        ? await stripe().paymentIntents.create(piParams)
        : await stripe().paymentIntents.create(piParams, { stripeAccount: booth.stripeAccountId! });
    } catch (err: any) {
      console.error('[authorizeBoothCartTerminalLeg] Failed to create PaymentIntent:', err);
      // Release the claim so a retry isn't permanently blocked by the deterministic key.
      await prisma.boothCartLeg.delete({ where: { id: claimedLeg.id } }).catch((delErr) =>
        console.error('[authorizeBoothCartTerminalLeg] Failed to release claim leg after Stripe error:', delErr)
      );
      return res.status(500).json({ error: 'Failed to create payment intent for this booth', details: err.message });
    }

    const leg = await prisma.boothCartLeg.update({
      where: { id: claimedLeg.id },
      data: { stripePaymentIntentId: paymentIntent.id },
    });

    return res.status(200).json({
      legId: leg.id,
      vendorBoothId,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents,
    });
  } catch (error) {
    console.error('[authorizeBoothCartTerminalLeg] Error:', error);
    return res.status(500).json({ error: 'Failed to authorize booth leg' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/qr/setup-intent
 * Body: { buyerUserId? }
 * ADR-020 QR/in-app rail, step 1: collect the shopper's card ONCE via a SetupIntent
 * on the PLATFORM account (not any single booth's account — this PaymentMethod
 * gets cloned to each booth next). Runs the checkout guard + cart lock on this
 * first call, same as the Terminal rail's authorize endpoint.
 */
export const createBoothCartQrSetupIntent = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    const { buyerUserId } = req.body as { buyerUserId?: string };
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });

    try {
      await beginCartCheckout({
        cart,
        hubId,
        buyerUserId,
        cashierTeamMemberId: req.boothAuth.type === 'TEAM_MEMBER' ? req.boothAuth.teamMemberId : null,
        cashierBoothId: req.boothAuth.type === 'BOOTH' ? req.boothAuth.vendorBoothId : null,
        context: 'boothCartQrSetupIntent',
      });
    } catch (guardError: any) {
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ error: guardError.message });
      }
      if (typeof guardError?.message === 'string' && guardError.message.startsWith('CART_NOT_CHARGEABLE:')) {
        return res.status(409).json({ error: `Cart cannot be charged (status: ${guardError.message.split(':')[1]})` });
      }
      throw guardError;
    }

    // Resolve or create the platform-level Stripe Customer this SetupIntent (and
    // the PaymentMethod-clone step after it) will hang off of. Reuse User.stripeCustomerId
    // when the buyer has an account; otherwise create an ad hoc platform Customer for
    // this walk-in cart (POS walk-in buyers legitimately have no FindA.Sale account —
    // Purchase.userId is already nullable for exactly this case).
    let platformCustomerId: string | undefined;
    let buyerEmail: string | undefined;
    if (buyerUserId) {
      const buyer = await prisma.user.findUnique({ where: { id: buyerUserId }, select: { stripeCustomerId: true, email: true } });
      buyerEmail = buyer?.email || undefined;
      if (buyer?.stripeCustomerId) {
        platformCustomerId = buyer.stripeCustomerId;
      }
    }
    if (!platformCustomerId) {
      const customer = await stripe().customers.create({
        email: buyerEmail,
        metadata: { source: 'booth_cart_qr', hubId, cartTransactionId: cart.id },
      });
      platformCustomerId = customer.id;
      if (buyerUserId) {
        await prisma.user.update({ where: { id: buyerUserId }, data: { stripeCustomerId: platformCustomerId } }).catch((err) =>
          console.warn('[createBoothCartQrSetupIntent] Failed to persist stripeCustomerId (non-fatal):', err)
        );
      }
    }

    const setupIntent = await stripe().setupIntents.create({
      customer: platformCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: { source: 'booth_cart_qr', hubId, cartTransactionId: cart.id },
    });

    return res.status(200).json({ clientSecret: setupIntent.client_secret, setupIntentId: setupIntent.id });
  } catch (error) {
    console.error('[createBoothCartQrSetupIntent] Error:', error);
    return res.status(500).json({ error: 'Failed to start QR/in-app checkout' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/qr/authorize
 * Body: { setupIntentId }
 * ADR-020 QR/in-app rail, step 2: after the shopper confirms the SetupIntent on
 * their own phone (Stripe.js `confirmCardSetup`), clone the resulting
 * PaymentMethod to EACH represented booth's Standard account
 * (docs.stripe.com/connect/direct-charges-multiple-accounts) and confirm one
 * `capture_method: 'manual'`, `off_session: true` PaymentIntent per booth — no
 * further shopper interaction. Converges on the same `captureBoothCart` endpoint
 * the Terminal rail uses once every leg has authorized. Partial-failure handling
 * mirrors the Terminal flow: if any leg fails to confirm, every already-authorized
 * (uncaptured) leg from this call is cancelled (free) and the whole cart fails —
 * same v1 whole-cart-cancel-and-restart policy as the Terminal rail, not
 * partial-capture/split-transaction.
 */
export const authorizeBoothCartQrLegs = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    const { setupIntentId } = req.body as { setupIntentId?: string };
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });
    if (!setupIntentId) return res.status(400).json({ error: 'setupIntentId is required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (cart.status !== 'IN_PROGRESS') {
      return res.status(409).json({ error: `Cart is not ready for QR authorization (status: ${cart.status})` });
    }

    let setupIntent;
    try {
      setupIntent = await stripe().setupIntents.retrieve(setupIntentId);
    } catch (err: any) {
      console.error('[authorizeBoothCartQrLegs] Failed to retrieve SetupIntent:', err);
      return res.status(400).json({ error: 'Could not verify card setup with Stripe' });
    }
    if (setupIntent.status !== 'succeeded') {
      return res.status(400).json({ error: `SetupIntent status is ${setupIntent.status}, expected succeeded` });
    }
    const platformCustomerId = typeof setupIntent.customer === 'string' ? setupIntent.customer : setupIntent.customer?.id;
    const platformPaymentMethodId = typeof setupIntent.payment_method === 'string' ? setupIntent.payment_method : setupIntent.payment_method?.id;
    if (!platformCustomerId || !platformPaymentMethodId) {
      return res.status(400).json({ error: 'SetupIntent is missing a customer or payment method' });
    }

    const booths = await prisma.vendorBooth.findMany({ where: { id: { in: cart.boothsRepresented } } });
    const alreadyLegged = await prisma.boothCartLeg.findMany({
      where: { cartTransactionId: cart.id, status: { in: ['PENDING', 'REQUIRES_CAPTURE', 'CAPTURED'] } },
      select: { vendorBoothId: true },
    });
    const alreadyLeggedIds = new Set(alreadyLegged.map((l) => l.vendorBoothId));
    const boothsToCharge = booths.filter((b) => !alreadyLeggedIds.has(b.id));

    const createdLegs: Array<{ legId: string; vendorBoothId: string; paymentIntentId: string }> = [];
    let failure: { vendorBoothId: string; vendorName: string; message: string } | null = null;

    for (const booth of boothsToCharge) {
      if (booth.stripeAccountType !== 'standard' || !booth.stripeOnboarded || !booth.stripeAccountId) {
        failure = { vendorBoothId: booth.id, vendorName: booth.vendorName, message: `Booth "${booth.vendorName}" has not completed Standard-account onboarding` };
        break;
      }

      const items = await resolveBoothLegItems(cart.id, cart.boothsRepresented, booth.id);
      const amountCents = Math.round(items.reduce((sum, i) => sum + (i.price || 0), 0) * 100);
      if (amountCents < 50) {
        failure = { vendorBoothId: booth.id, vendorName: booth.vendorName, message: `Booth "${booth.vendorName}"'s subtotal must be at least $0.50` };
        break;
      }

      // Race-safe claim (findasale-hacker adversarial pass, 2026-07-08): same
      // compare-and-swap technique as the Terminal rail's authorize endpoint -- the
      // alreadyLeggedIds snapshot computed above this loop is a plain read and can't
      // close a TOCTOU window against a second concurrent /qr/authorize call (e.g. a
      // double-submitted "Pay" tap on the shopper's phone) for the same booth on the
      // same cart. A losing concurrent request gets P2002 here and skips this booth
      // (its leg was already claimed by the winner) rather than creating a duplicate
      // PaymentMethod clone + PaymentIntent for the same items.
      const claimKey = `claim_${cart.id}_${booth.id}`;
      let claimedLeg;
      try {
        claimedLeg = await prisma.boothCartLeg.create({
          data: {
            cartTransactionId: cart.id,
            vendorBoothId: booth.id,
            stripeAccountId: booth.stripeAccountId!,
            stripePaymentIntentId: claimKey,
            amountCents,
            rail: 'QR',
            status: 'PENDING',
          },
        });
      } catch (claimErr: any) {
        if (claimErr?.code === 'P2002') {
          continue;
        }
        throw claimErr;
      }

      try {
        // Clone the platform PaymentMethod onto this booth's connected account —
        // Stripe's documented "share payment methods across multiple accounts for
        // direct charges" call. Returns a NEW PaymentMethod id valid only on this
        // connected account.
        const clonedPm = await stripe().paymentMethods.create(
          { customer: platformCustomerId, payment_method: platformPaymentMethodId },
          { stripeAccount: booth.stripeAccountId! }
        );

        const paymentIntent = await stripe().paymentIntents.create(
          {
            amount: amountCents,
            currency: 'usd',
            payment_method_types: ['card'],
            payment_method: clonedPm.id,
            capture_method: 'manual',
            confirm: true,
            off_session: true,
            metadata: {
              source: 'booth_cart_leg',
              rail: 'QR',
              hubId,
              cartTransactionId: cart.id,
              vendorBoothId: booth.id,
            },
          },
          { stripeAccount: booth.stripeAccountId! }
        );

        const leg = await prisma.boothCartLeg.update({
          where: { id: claimedLeg.id },
          data: {
            stripePaymentIntentId: paymentIntent.id,
            status: paymentIntent.status === 'requires_capture' ? 'REQUIRES_CAPTURE' : 'PENDING',
          },
        });
        createdLegs.push({ legId: leg.id, vendorBoothId: booth.id, paymentIntentId: paymentIntent.id });
      } catch (err: any) {
        console.error(`[authorizeBoothCartQrLegs] Failed to confirm leg for booth ${booth.id}:`, err);
        await prisma.boothCartLeg.delete({ where: { id: claimedLeg.id } }).catch((delErr) =>
          console.error(`[authorizeBoothCartQrLegs] Failed to release claim leg ${claimedLeg.id} after Stripe error:`, delErr)
        );
        failure = { vendorBoothId: booth.id, vendorName: booth.vendorName, message: err.message || 'Card was declined' };
        break;
      }
    }

    if (failure) {
      // Whole-cart-fail: cancel every leg this call just created (free — none are
      // captured yet), matching the Terminal rail's cancel policy.
      for (const created of createdLegs) {
        const legBooth = booths.find((b) => b.id === created.vendorBoothId);
        try {
          if (legBooth?.stripeAccountId) {
            await stripe().paymentIntents.cancel(created.paymentIntentId, {}, { stripeAccount: legBooth.stripeAccountId! });
          }
        } catch (cancelErr) {
          console.error(`[authorizeBoothCartQrLegs] Failed to cancel leg ${created.legId} during whole-cart-fail:`, cancelErr);
        }
        await prisma.boothCartLeg.update({ where: { id: created.legId }, data: { status: 'CANCELED' } }).catch(() => {});
      }
      return res.status(402).json({ error: failure.message, vendorBoothId: failure.vendorBoothId, vendorName: failure.vendorName });
    }

    return res.status(200).json({ legs: createdLegs });
  } catch (error) {
    console.error('[authorizeBoothCartQrLegs] Error:', error);
    return res.status(500).json({ error: 'Failed to authorize QR checkout legs' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/capture
 * ADR-020 step 5 (shared by BOTH rails): once every leg in the cart has
 * successfully authorized, capture all of them — a loop of per-PaymentIntent
 * `/capture` calls, each scoped to that leg's own booth `stripeAccount`. This is
 * the moment the sale actually completes: Purchase rows are created (one per
 * item, `stripePaymentIntentId` = that item's booth's REAL leg PaymentIntent id —
 * no more `${piId}_${itemId}` composite placeholder), items are marked SOLD, and
 * the itemized per-vendor receipt is sent.
 */
export const captureBoothCart = async (req: BoothAuthRequest, res: Response) => {
  // findasale-hacker adversarial pass, 2026-07-08: lockedCartId + releaseCaptureLock
  // are declared outside the try block so every exit path (including the outer catch)
  // can release the CAPTURING lock taken below. See the lock's own comment for why.
  let lockedCartId: string | null = null;
  const releaseCaptureLock = async () => {
    if (!lockedCartId) return;
    await prisma.boothCartTransaction
      .updateMany({ where: { id: lockedCartId, status: 'CAPTURING' }, data: { status: 'IN_PROGRESS' } })
      .catch((err) => console.error('[captureBoothCart] Failed to release capture lock (non-fatal):', err));
  };
  try {
    const { hubId, cartTransactionId } = req.params;
    const { buyerUserId } = req.body as { buyerUserId?: string };
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (cart.status === 'COMPLETED') {
      return res.status(200).json({ success: true, message: 'Cart already completed' });
    }
    if (cart.status !== 'IN_PROGRESS') {
      return res.status(409).json({ error: `Cart cannot be captured (status: ${cart.status})` });
    }

    // Race-safe capture lock (findasale-hacker adversarial pass, 2026-07-08): atomically
    // claim the IN_PROGRESS -> CAPTURING transition, same conditional-updateMany idiom
    // beginCartCheckout already uses for its PENDING -> IN_PROGRESS lock. Without this,
    // two concurrent /capture calls on the same cart could both pass the status check
    // above, both loop the SAME legs, and interleave captures across legs such that
    // EACH call's captureFailed array ends up non-empty (each racer fails on whichever
    // leg the OTHER racer captured first) -- meaning money gets captured but NEITHER
    // response path reaches the Finalize block that creates Purchase rows / marks items
    // SOLD / sends receipts. This lock ensures only one /capture call is ever inside the
    // capture loop for a given cart at a time. It is reverted back to IN_PROGRESS on
    // every non-success exit path below so legitimate retries after a genuine
    // (non-race) partial failure are never blocked.
    const captureLock = await prisma.boothCartTransaction.updateMany({
      where: { id: cart.id, status: 'IN_PROGRESS' },
      data: { status: 'CAPTURING' },
    });
    if (captureLock.count !== 1) {
      return res.status(409).json({ error: 'This cart is already being captured by another request' });
    }
    lockedCartId = cart.id;

    // Re-run the collusion guard against the buyerUserId that is ACTUALLY about to be
    // attributed to this capture's Purchase rows (findasale-hacker P0 finding,
    // 2026-07-08 -- see comment above). cashierTeamMemberId/cashierBoothId are read
    // from the cart row itself (persisted at startBoothCart), not from req.boothAuth,
    // since the cashier who opened the cart may differ from whoever calls /capture.
    try {
      await assertBoothCartCheckoutAllowed({
        buyerUserId,
        hubId,
        cartTransactionId: cart.id,
        boothsRepresented: cart.boothsRepresented,
        cashierTeamMemberId: cart.cashierTeamMemberId,
        cashierBoothId: cart.cashierBoothId,
        prisma,
        context: 'boothCartCapture',
      });
    } catch (guardError: any) {
      await releaseCaptureLock();
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ error: guardError.message });
      }
      throw guardError;
    }

    const legs = await prisma.boothCartLeg.findMany({
      where: { cartTransactionId: cart.id, status: { in: ['PENDING', 'REQUIRES_CAPTURE'] } },
    });
    if (legs.length === 0) {
      await releaseCaptureLock();
      return res.status(400).json({ error: 'No authorized legs to capture on this cart' });
    }

    // Re-verify every leg's LIVE status before capturing any of them — all-or-nothing,
    // never a partial capture. A leg still 'PENDING' here means its tap hasn't
    // succeeded yet (cashier called authorize but the physical tap didn't complete).
    const notReady: string[] = [];
    for (const leg of legs) {
      if (isTerminalSimulated() && leg.rail === 'TERMINAL') {
        // Simulated readers auto-succeed; trust the recorded status.
        if (leg.status !== 'REQUIRES_CAPTURE') notReady.push(leg.vendorBoothId);
        continue;
      }
      try {
        const pi = await stripe().paymentIntents.retrieve(leg.stripePaymentIntentId, { stripeAccount: leg.stripeAccountId });
        if (pi.status !== 'requires_capture') notReady.push(leg.vendorBoothId);
      } catch (err) {
        console.error(`[captureBoothCart] Failed to retrieve leg ${leg.id} for re-verification:`, err);
        notReady.push(leg.vendorBoothId);
      }
    }
    if (notReady.length > 0) {
      await releaseCaptureLock();
      return res.status(409).json({ error: 'Not every booth has authorized yet', vendorBoothIds: notReady });
    }

    // All legs verified requires_capture — capture every one. A capture failure at
    // this point is a genuine rare edge (Stripe outage / the 2-day authorization
    // window expired) — money already captured on earlier legs in this loop can't be
    // silently uncaptured, so this is reported for manual reconciliation rather than
    // pretending the whole cart rolled back (flagged in the dev report, not built
    // out further here — no reconciliation tooling in this pass).
    const captured: typeof legs = [];
    const captureFailed: Array<{ vendorBoothId: string; message: string }> = [];
    for (const leg of legs) {
      try {
        if (isTerminalSimulated() && leg.rail === 'TERMINAL') {
          await stripe().paymentIntents.capture(leg.stripePaymentIntentId);
        } else {
          await stripe().paymentIntents.capture(leg.stripePaymentIntentId, {}, { stripeAccount: leg.stripeAccountId });
        }
        await prisma.boothCartLeg.update({ where: { id: leg.id }, data: { status: 'CAPTURED' } });
        captured.push(leg);
      } catch (err: any) {
        console.error(`[captureBoothCart] Failed to capture leg ${leg.id}:`, err);
        captureFailed.push({ vendorBoothId: leg.vendorBoothId, message: err.message || 'Capture failed' });
      }
    }

    if (captureFailed.length > 0) {
      await releaseCaptureLock();
      return res.status(207).json({
        error: 'Some booths captured, others did not — needs manual reconciliation',
        captured: captured.map((l) => l.vendorBoothId),
        failed: captureFailed,
      });
    }

    // Finalize: create Purchase rows (real per-booth PaymentIntent id, no composite
    // placeholder), mark items SOLD, fire the same downstream hooks the old
    // confirmBoothCart ran.
    const purchaseIds: string[] = [];
    for (const leg of captured) {
      const items = await resolveBoothLegItems(cart.id, cart.boothsRepresented, leg.vendorBoothId);
      for (const item of items) {
        try {
          const purchase = await prisma.purchase.create({
            data: {
              userId: buyerUserId || null,
              itemId: item.id,
              amount: item.price || 0,
              stripePaymentIntentId: leg.stripePaymentIntentId,
              source: 'POS',
              status: 'PAID',
              boothCartTransactionId: cart.id,
            },
          });
          purchaseIds.push(purchase.id);

          // ADR-085 Track B Phase 1 Step 4: atomic, race-safe stock decrement replaces the
          // old unconditional status update. Downstream cross-channel-removal hooks only
          // fire once the item is actually fully sold out (stockSold reached stockTotal) --
          // previously they fired unconditionally on every sale regardless of remaining stock.
          let fullySoldOut: boolean;
          let remainingStock: number;
          try {
            ({ fullySoldOut, remainingStock } = await sellItemUnits(item.id, 1));
          } catch (stockErr: any) {
            if (stockErr instanceof InsufficientStockError) {
              console.error(`[captureBoothCart] Oversold race on item ${item.id} despite captured payment:`, stockErr.message);
            }
            throw stockErr;
          }

          if (fullySoldOut) {
            endEbayListingIfExists(item.id).catch((err) => console.error('[eBay] Failed to withdraw offer:', err));
            markShopifyItemSold(item.id).catch((err) => console.error('[Shopify] Failed to mark item sold:', err));
            notifyFacebookExportedItemSold(item.id).catch((err) =>
              console.warn(`[FB Nudge] failed for item ${item.id}:`, err.message)
            );
          } else {
            // ADR-087 Phase 4: partial sale — revise eBay listing quantity if linked.
            syncMarketplaceStock(item.id, { fullySoldOut: false, remainingStock }).catch((err) =>
              console.error('[eBay ReviseQty] sync failed for item', item.id, err)
            );
          }
          generateReceipt(purchase.id).catch((err) => console.error('[receipt] Failed to generate receipt:', err));
        } catch (err: any) {
          console.error(`[captureBoothCart] Failed to finalize item ${item.id}:`, err);
        }
      }
    }

    await prisma.boothCartTransaction.update({ where: { id: cart.id }, data: { status: 'COMPLETED' } });
    lockedCartId = null; // terminal state reached -- no lock left to release

    sendBoothCartReceiptEmail(cart.id).catch((err) =>
      console.error('[captureBoothCart] Failed to send itemized cart receipt email:', err)
    );

    return res.status(200).json({ success: true, itemsSold: purchaseIds.length, purchaseIds });
  } catch (error) {
    console.error('[captureBoothCart] Error:', error);
    await releaseCaptureLock();
    return res.status(500).json({ error: 'Failed to capture cart payment' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/cancel
 * ADR-020 step 6, Patrick-approved v1 behavior: whole-cart-cancel-and-restart (NOT
 * partial-capture/split-transaction — that was explicitly rejected). Cancels every
 * uncaptured leg (free — no charge ever appeared, matches Stripe's own Terminal
 * guidance) and releases the cart's reserved items back to AVAILABLE. The cashier
 * starts a NEW cart, omitting whichever vendor's items couldn't be resolved — this
 * endpoint does not attempt to auto-resume or retry the same cart.
 */
export const cancelBoothCart = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (cart.status === 'COMPLETED') {
      return res.status(409).json({ error: 'Cart is already completed — cannot cancel, use refund instead' });
    }
    if (cart.status === 'FAILED') {
      return res.status(200).json({ success: true, message: 'Cart already cancelled' });
    }
    if (cart.status === 'CAPTURING') {
      // findasale-hacker adversarial pass, 2026-07-08: without this check, a /cancel
      // call racing a concurrent /capture call could try to release/cancel legs the
      // capture loop is actively finalizing -- this closes that window for the entire
      // duration of a capture attempt (see captureBoothCart's capture lock).
      return res.status(409).json({ error: 'Cart is currently being captured — cannot cancel right now, try again shortly' });
    }

    const legs = await prisma.boothCartLeg.findMany({
      where: { cartTransactionId: cart.id, status: { in: ['PENDING', 'REQUIRES_CAPTURE'] } },
    });

    const cancelledLegIds: string[] = [];
    for (const leg of legs) {
      try {
        if (isTerminalSimulated() && leg.rail === 'TERMINAL') {
          await stripe().paymentIntents.cancel(leg.stripePaymentIntentId);
        } else {
          await stripe().paymentIntents.cancel(leg.stripePaymentIntentId, {}, { stripeAccount: leg.stripeAccountId });
        }
        await prisma.boothCartLeg.update({ where: { id: leg.id }, data: { status: 'CANCELED' } });
        cancelledLegIds.push(leg.id);
      } catch (err) {
        // Already-captured or already-expired legs will fail to cancel — log and
        // continue; this endpoint's job is best-effort cleanup, not a hard guarantee.
        console.error(`[cancelBoothCart] Failed to cancel leg ${leg.id}:`, err);
      }
    }

    // Release this cart's reserved items back to AVAILABLE.
    if (cart.boothsRepresented.length > 0) {
      await prisma.item.updateMany({
        where: { status: 'RESERVED', vendorBoothId: { in: cart.boothsRepresented } },
        data: { status: 'AVAILABLE' },
      });
    }

    await prisma.boothCartTransaction.update({ where: { id: cart.id }, data: { status: 'FAILED' } });

    return res.status(200).json({ success: true, cancelledLegIds });
  } catch (error) {
    console.error('[cancelBoothCart] Error:', error);
    return res.status(500).json({ error: 'Failed to cancel cart' });
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
