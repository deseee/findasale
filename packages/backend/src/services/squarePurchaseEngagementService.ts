/**
 * Square purchase engagement awards (2026-09-29, Sale Passport wiring).
 *
 * WHY THIS FILE EXISTS: the Square purchase-completion paths (squarePaymentController's single-item
 * and cart checkouts, squareWebhookController's payment-link settlement) recorded a PAID Purchase
 * but never ran the engagement side effects stripeController's payment_intent.succeeded path runs:
 * PURCHASE_COMPLETED XP, the first-purchase milestones, referral rewards, the OG Buyer badge, the
 * PURCHASE_MADE achievement and the Sale Passport / legacy stamp counter. This module is the single
 * shared implementation of that block for Square.
 *
 * GUARANTEES
 * - Never throws and never rejects. Every step is isolated in its own try/catch and logged, so a
 *   failing award can not fail, delay or roll back a payment response. Callers fire it AFTER the
 *   Purchase row is committed and do not await it on the response path (use fireSquarePurchaseEngagement).
 * - Idempotent per purchase. The webhook and the synchronous checkout response can both fire, and a
 *   webhook can be retried. Passport/legacy stamps dedupe on the passport ledger key
 *   ACT:MAKE_PURCHASE:<purchaseId>; awardXp has no dedupe of its own, so XP is deduped on the
 *   existing PointsTransaction (userId, type, purchaseId) reference fields.
 * - One award per Square payment, not per cart line. A cart pays once (one squarePaymentId, N Purchase
 *   rows). Stripe's cart path awards once per PaymentIntent, so this does too: the canonical purchase
 *   is the earliest PAID row sharing the squarePaymentId.
 * - Skips guests (no userId), test-transaction rows, POS rows that are not a verified shopper card payment
 *   (walk-up, cash, synthetic ids; see isVerifiedShopperCardPosRow), and anything not PAID at award time
 *   (a stock-race REFUNDING row earns nothing).
 */
import { prisma } from '../lib/prisma';
import { awardStamp, awardReferralStampForReferee } from './loyaltyService';
import { checkAndAward } from './achievementService';
import { awardXp, applyHuntPassMultiplier, XP_AWARDS } from './xpService';
import { checkAndAwardOgBuyer } from './badgeService';
import { referralTrancheService } from './referralTrancheService';
import { evaluateReferralFraud, getAccountAgeDays, MIN_ACCOUNT_AGE_DAYS } from './referralFraudService';

const HOLD_72H_MS = 72 * 60 * 60 * 1000;
const HOLD_24H_MS = 24 * 60 * 60 * 1000;

/** A payment under this total earns nothing (money review 2026-09-29): micro-purchases were XP farming. */
const MIN_ENGAGEMENT_PURCHASE_DOLLARS = 1;

const inFlight = new Map<string, Promise<void>>();

/**
 * POS rows are normally skipped: a walk-up sale has no shopper account, and an organizer-recorded cash
 * settlement (reservationController RECORD mode, cash_ ids) is not a verified payment, so rewarding it would
 * let an organizer farm engagement for a friend. The ONE POS shape that is a verified, shopper-linked card
 * payment is the QR / phone POS request the shopper confirms while logged in (posPaymentController): a real
 * Square payment id on a row that carries the shopper's userId. Synthetic ids (cash_, sq_test_, pos_) never count.
 */
const SYNTHETIC_PAYMENT_REF = /^(cash_|sq_test_|pos_)/;
function isVerifiedShopperCardPosRow(seed: { userId?: string | null; squarePaymentId?: string | null }): boolean {
  return !!seed.userId && typeof seed.squarePaymentId === 'string' && seed.squarePaymentId.length > 0 && !SYNTHETIC_PAYMENT_REF.test(seed.squarePaymentId);
}

/**
 * Cross-INSTANCE serialization for the award block (money review 2026-09-29). The in-process
 * `inFlight` map only stops two awards racing inside one Node process; the webhook and the synchronous
 * checkout response can land on different instances, and every dedupe below is check-then-write
 * (PointsTransaction has no unique key that could carry it), so two instances could both pass the
 * check and both award. A Postgres transaction-scoped advisory lock keyed by the canonical purchase id
 * makes the second instance wait until the first has finished writing, so its dedupe check then sees
 * the first instance's rows. The lock is released automatically when the transaction ends, on commit,
 * error or a dropped connection, so it can never be left held.
 *
 * Fails OPEN: if the transaction can not be started (pool pressure, a non-Postgres test double) the
 * block runs unlocked exactly as it did before, because an engagement award must never fail a payment.
 */
async function withPurchaseAdvisoryLock(key: string, fn: () => Promise<void>): Promise<void> {
  let started = false;
  try {
    await prisma.$transaction(
      async (tx: any) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
        started = true;
        await fn();
      },
      { timeout: 60000, maxWait: 10000 }
    );
  } catch (err) {
    if (started) {
      // fn never throws (every step is isolated), so this is the transaction ending badly AFTER the
      // awards ran. Nothing to redo; do not run them a second time.
      console.warn(`[squareEngagement] advisory-lock transaction ended with an error after the awards ran (non-fatal):`, err);
      return;
    }
    console.warn(`[squareEngagement] could not take the advisory lock for ${key}; running unlocked (non-fatal):`, err);
    await fn();
  }
}

async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.warn(`[squareEngagement] ${label} failed (non-fatal, payment already recorded):`, err);
  }
}

/** True when a PointsTransaction of this type already exists for one of the purchase ids. */
async function xpAlreadyAwarded(userId: string, type: string, purchaseIds: string[]): Promise<boolean> {
  const existing = await prisma.pointsTransaction.findFirst({
    where: { userId, type, purchaseId: { in: purchaseIds } },
    select: { id: true },
  });
  return !!existing;
}

/**
 * Award every engagement side effect for a completed Square (or reclaimed Stripe) purchase. Safe to call any number of
 * times for the same purchase or the same Square payment. Never throws.
 */
export async function awardSquarePurchaseEngagement(purchaseId: string): Promise<void> {
  try {
    if (!purchaseId) return;

    const seed: any = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      select: {
        id: true,
        userId: true,
        status: true,
        source: true,
        isTestTransaction: true,
        squarePaymentId: true,
        stripePaymentIntentId: true,
        amount: true,
      },
    });
    if (!seed || !seed.userId) return; // guest checkout or unknown purchase
    if (seed.isTestTransaction) return;
    if (seed.source === 'POS' && !isVerifiedShopperCardPosRow(seed)) return;

    // Resolve the canonical PAID purchase (and its siblings) for this Square payment.
    let siblingIds: string[] = [seed.id];
    let canonicalId: string = seed.id;
    // What this payment was worth in dollars (PAID rows only, summed across a cart). Unknown (a row with
    // no amount) is never treated as "too small".
    let paymentTotalDollars: number | null = Number.isFinite(Number(seed.amount)) && seed.amount !== null && seed.amount !== undefined ? Number(seed.amount) : null;
    // Wave 2 (2026-09-29): purchaseExpiryJob's Stripe stranded-PAID reclaim also calls this module (a
    // Stripe cart shares one PaymentIntent across N Purchase rows, exactly as a Square cart shares one
    // squarePaymentId), so the sibling group is keyed by whichever processor reference the row carries.
    const siblingKey: Record<string, string> | null = seed.squarePaymentId
      ? { squarePaymentId: seed.squarePaymentId }
      : seed.stripePaymentIntentId
        ? { stripePaymentIntentId: seed.stripePaymentIntentId }
        : null;
    if (siblingKey) {
      const siblings: any[] = await prisma.purchase.findMany({
        where: { ...siblingKey, userId: seed.userId, isTestTransaction: false },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, status: true, amount: true },
      });
      if (siblings.length > 0) {
        siblingIds = siblings.map((s) => s.id);
        const firstPaid = siblings.find((s) => s.status === 'PAID');
        if (!firstPaid) return; // nothing settled (stock-race REFUNDING, refunded, pending)
        canonicalId = firstPaid.id;
        const paidRows = siblings.filter((s) => s.status === 'PAID');
        if (paidRows.every((s) => s.amount !== null && s.amount !== undefined && Number.isFinite(Number(s.amount)))) {
          paymentTotalDollars = paidRows.reduce((sum, s) => sum + Number(s.amount), 0);
        }
      }
    } else if (seed.status !== 'PAID') {
      return;
    }

    // In-process guard: the sync checkout response and the webhook can land in the same process at
    // the same instant; the DB dedupe checks below are check-then-write, so serialize per purchase.
    const running = inFlight.get(canonicalId);
    if (running) {
      await running;
      return;
    }
    // Anti-farming: a payment under $1 earns nothing (checked before taking any lock).
    if (paymentTotalDollars !== null && paymentTotalDollars < MIN_ENGAGEMENT_PURCHASE_DOLLARS) return;
    const job = withPurchaseAdvisoryLock(`sqeng:${canonicalId}`, () => awardForCanonical(canonicalId, siblingIds)).finally(() => inFlight.delete(canonicalId));
    inFlight.set(canonicalId, job);
    await job;
  } catch (err) {
    console.warn(`[squareEngagement] awardSquarePurchaseEngagement(${purchaseId}) failed (non-fatal):`, err);
  }
}

async function awardForCanonical(canonicalId: string, siblingIds: string[]): Promise<void> {
  try {
    const purchase: any = await prisma.purchase.findUnique({
      where: { id: canonicalId },
      include: {
        sale: { select: { id: true, organizer: { select: { userId: true } } } },
      },
    });
    if (!purchase || !purchase.userId || purchase.status !== 'PAID') return;

    // Self-purchase guard (money review 2026-09-29): an organizer buying from their OWN sale earns no XP,
    // milestones, referral rewards, badges or stamps. Without this the platform paid out engagement
    // rewards for an organizer round-tripping a payment to themselves.
    if (purchase.sale?.organizer?.userId && purchase.sale.organizer.userId === purchase.userId) return;

    const userId: string = purchase.userId;
    const saleId: string | undefined = purchase.saleId ?? undefined;

    // 1. PURCHASE_COMPLETED XP (flat per payment, 72h chargeback hold, Hunt Pass multiplier).
    await step('purchase XP', async () => {
      if (await xpAlreadyAwarded(userId, 'PURCHASE_COMPLETED', siblingIds)) return;
      const multipliedXp = await applyHuntPassMultiplier(userId, XP_AWARDS.PURCHASE);
      await awardXp(userId, 'PURCHASE_COMPLETED', multipliedXp, {
        itemId: purchase.itemId ?? undefined,
        saleId,
        purchaseId: purchase.id,
        holdUntil: new Date(Date.now() + HOLD_72H_MS),
        preMultipliedHuntPassXp: true,
      });
    });

    // 2. First-purchase milestone, org-signup XP, referral tranche and referral reward.
    await step('first-purchase milestones', async () => {
      const otherPaid = await prisma.purchase.count({
        where: { userId, status: 'PAID', isTestTransaction: false, id: { notIn: siblingIds } },
      });
      if (otherPaid > 0) return; // not the shopper's first purchase
      if (await xpAlreadyAwarded(userId, 'FIRST_PURCHASE_EVER', siblingIds)) return;
      const everAwarded = await prisma.pointsTransaction.findFirst({
        where: { userId, type: 'FIRST_PURCHASE_EVER' },
        select: { id: true },
      });
      if (everAwarded) return;

      await step('FIRST_PURCHASE_EVER XP', async () => {
        await awardXp(userId, 'FIRST_PURCHASE_EVER', XP_AWARDS.FIRST_PURCHASE_EVER, {
          saleId,
          purchaseId: purchase.id,
          description: 'First purchase milestone',
        });
      });

      await step('referral tranche', async () => {
        await referralTrancheService.recordFirstPurchase(userId, purchase.id);
        const buyerReferral = await prisma.referral.findUnique({ where: { referredUserId: userId } });
        if (buyerReferral) await referralTrancheService.recordOwnReferralSuccess(userId);
      });

      await step('ORG_SHOPPER_SIGNUP XP', async () => {
        const orgUserId: string | undefined = purchase.sale?.organizer?.userId;
        if (!orgUserId) return;
        if (await xpAlreadyAwarded(orgUserId, 'ORG_SHOPPER_SIGNUP', siblingIds)) return;
        await awardXp(orgUserId, 'ORG_SHOPPER_SIGNUP', XP_AWARDS.ORG_SHOPPER_SIGNUP, {
          saleId,
          purchaseId: purchase.id,
          description: `New shopper first purchase at sale ${purchase.saleId}`,
        });
      });

      await step('referral reward', async () => {
        const referralReward: any = await prisma.referralReward.findFirst({ where: { referredUserId: userId } });
        if (!referralReward) return;
        const referrer = await prisma.user.findUnique({ where: { id: referralReward.referrerId } });
        if (!referrer) return;

        await evaluateReferralFraud(referralReward.referrerId, userId, referralReward.id);

        const buyer = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
        const ageDays = getAccountAgeDays(buyer?.createdAt || new Date());

        if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
          const deferUntil = new Date();
          deferUntil.setDate(deferUntil.getDate() + (MIN_ACCOUNT_AGE_DAYS - ageDays));
          await prisma.referralReward.update({
            where: { id: referralReward.id },
            data: { deferredUntil: deferUntil, deferredReason: 'ACCOUNT_AGE_GATE' },
          });
          return;
        }
        if (referralReward.fraudReviewStatus !== 'CLEAR') return; // fraud review pending, defer
        if (await xpAlreadyAwarded(referralReward.referrerId, 'REFERRAL_FIRST_PURCHASE', siblingIds)) return;
        await awardXp(referralReward.referrerId, 'REFERRAL_FIRST_PURCHASE', XP_AWARDS.REFERRAL_FIRST_PURCHASE, {
          saleId,
          purchaseId: purchase.id,
          holdUntil: new Date(new Date(purchase.createdAt).getTime() + HOLD_24H_MS),
          description: 'First purchase referral bonus',
        });
      });
    });

    // 3. Referred organizer completed an external purchase: credit the referring organizer once.
    await step('organizer referral', async () => {
      const organizerReferral: any = await prisma.organizerReferral.findUnique({ where: { refereeId: userId } });
      if (!organizerReferral || organizerReferral.status !== 'PENDING') return;
      const externalPurchaseCount = await prisma.purchase.count({
        where: {
          userId,
          status: 'PAID',
          isTestTransaction: false,
          sale: { organizer: { userId: { not: organizerReferral.referrerId } } },
        },
      });
      if (externalPurchaseCount < 1) return;
      // Status flip first is the idempotency gate; only the caller that flips it awards.
      const flipped = await prisma.organizerReferral.updateMany({
        where: { refereeId: userId, status: 'PENDING' },
        data: { status: 'CREDITED' },
      });
      if (!flipped || flipped.count < 1) return;
      await awardXp(organizerReferral.referrerId, 'ORGANIZER_REFERRAL_PURCHASE', XP_AWARDS.ORGANIZER_REFERRAL_PURCHASE, {
        saleId,
        purchaseId: purchase.id,
        holdUntil: new Date(Date.now() + HOLD_72H_MS),
        description: 'Referred organizer completed external purchase',
      });
    });

    // 4. OG Buyer badge (first 100 purchasers at a sale; idempotent per user+sale).
    if (saleId) {
      await step('OG Buyer badge', async () => {
        await checkAndAwardOgBuyer(userId, saleId, purchase.id);
      });
    }

    // 5. Achievement, Sale Passport stamp (+ legacy counter) and Friend Finder stamp.
    await step('achievement', async () => {
      await checkAndAward(userId, 'PURCHASE_MADE');
    });
    await step('passport stamp', async () => {
      await awardStamp(userId, 'MAKE_PURCHASE', saleId, purchase.id);
    });
    await step('referral stamp', async () => {
      await awardReferralStampForReferee(userId);
    });
  } catch (err) {
    console.warn(`[squareEngagement] awardForCanonical(${canonicalId}) failed (non-fatal):`, err);
  }
}

/**
 * Fire-and-forget wrapper for payment paths: schedules the award off the response path and swallows
 * every error. Call it AFTER the Purchase row is committed. Never throws.
 */
export function fireSquarePurchaseEngagement(purchaseId: string | null | undefined): void {
  if (!purchaseId) return;
  try {
    setImmediate(() => {
      awardSquarePurchaseEngagement(purchaseId).catch((err) =>
        console.warn(`[squareEngagement] fire(${purchaseId}) failed (non-fatal):`, err)
      );
    });
  } catch (err) {
    console.warn('[squareEngagement] could not schedule purchase engagement (non-fatal):', err);
  }
}
