/**
 * Creator Affiliate Service (per-sale affiliate links), finished 2026-09-29.
 *
 * Everything the creator program needs beyond the organizer-to-organizer referral code in
 * affiliateService.ts:
 *   - opt-in: any signed-in, email-verified account becomes a creator by accepting the program
 *     terms (CreatorProfile row + unique code). No role string is assigned; the old
 *     `role === 'CREATOR'` check is kept only as an OR for any legacy row.
 *   - per-sale links (public, published sales only, never your own sale)
 *   - click tracking with fraud basics (one counted click per link per hashed IP per UTC day,
 *     bots and self-clicks never counted)
 *   - attribution resolution used by the Square and legacy Stripe checkout paths
 *   - commission ledger (AffiliateConversion): idempotent per Purchase, no self-referral,
 *     reversal derived from Purchase.status. NOTHING is paid automatically.
 *   - dashboard aggregates with real numbers
 *
 * Attribution chain (spec: claude_docs/feature-notes/affiliate-program-spec-S544.md section 5.2):
 *   click -> frontend lib/affiliateAttribution.ts (storage) -> checkout request `affiliateLinkId`
 *   -> resolveAffiliateAttribution() (validates) -> Purchase.affiliateLinkId
 *   -> recordAffiliateConversion() (ledger row + AffiliateLink.conversions).
 */

import crypto from 'crypto';
import type { CreatorProfile } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  CREATOR_PROGRAM,
  calculateCreatorCommissionCents,
} from '../config/affiliateConfig';
import { createNotification } from './notificationService';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CreatorError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function frontendBaseUrl(): string {
  return (process.env.FRONTEND_URL || 'https://finda.sale').replace(/\/+$/, '');
}

export function buildAffiliateShareUrl(linkId: string): string {
  return `${frontendBaseUrl()}/affiliate/${linkId}`;
}

/** Creator code shape, e.g. CRT_K9X2L4. Used to tell a code apart from an AffiliateLink id (cuid). */
export function isCreatorCode(value: string): boolean {
  return /^CRT_[A-Z0-9]{4,12}$/i.test(value);
}

function generateCreatorCode(): string {
  // Unambiguous alphabet (no 0/O/1/I) so codes survive being read aloud or typed from a screenshot.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(CREATOR_PROGRAM.CODE_LENGTH);
  for (let i = 0; i < CREATOR_PROGRAM.CODE_LENGTH; i++) {
    out += chars.charAt(bytes[i] % chars.length);
  }
  return `${CREATOR_PROGRAM.CODE_PREFIX}${out}`;
}

function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Strip control characters, collapse whitespace, cap length.
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return cleaned.length > 0 ? cleaned : null;
}

export function hasLegacyCreatorRole(user: { role?: string; roles?: string[] } | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'CREATOR' || (Array.isArray(user.roles) && user.roles.includes('CREATOR'));
}

const isUniqueViolation = (err: any) => err?.code === 'P2002';

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export interface CreatorAccess {
  allowed: boolean;
  suspended: boolean;
  legacyRole: boolean;
  profile: CreatorProfile | null;
}

/**
 * Whether this user may use creator features. Gate is an ACTIVE CreatorProfile row; the legacy
 * CREATOR role string still works as an OR unless the profile has been suspended.
 */
export async function getCreatorAccess(user: { id: string; role?: string; roles?: string[] }): Promise<CreatorAccess> {
  const profile = await prisma.creatorProfile.findUnique({ where: { userId: user.id } });
  const legacyRole = hasLegacyCreatorRole(user);
  const suspended = profile?.status === 'SUSPENDED';
  const allowed = !suspended && (profile?.status === 'ACTIVE' || (!profile && legacyRole));
  return { allowed, suspended, legacyRole, profile };
}

// ---------------------------------------------------------------------------
// Opt-in
// ---------------------------------------------------------------------------

export interface JoinInput {
  acceptTerms?: unknown;
  termsVersion?: unknown;
  displayName?: unknown;
}

/**
 * Self-serve opt-in. Idempotent: an existing profile is returned unchanged.
 * Requires an email-verified account and explicit acceptance of the CURRENT terms version.
 */
export async function joinCreatorProgram(
  user: { id: string; emailVerified?: boolean | null },
  input: JoinInput
) {
  const existing = await prisma.creatorProfile.findUnique({ where: { userId: user.id } });
  if (existing) {
    if (existing.status === 'SUSPENDED') {
      throw new CreatorError('CREATOR_SUSPENDED', 403, 'Your creator access is suspended. Contact support for details.');
    }
    return existing;
  }

  if (input.acceptTerms !== true) {
    throw new CreatorError('TERMS_NOT_ACCEPTED', 400, 'You must accept the Creator Program terms to join.');
  }
  if (input.termsVersion !== CREATOR_PROGRAM.TERMS_VERSION) {
    throw new CreatorError(
      'TERMS_VERSION_MISMATCH',
      409,
      'The Creator Program terms were updated. Reload the page and review the current terms.'
    );
  }
  if (!user.emailVerified) {
    throw new CreatorError(
      'EMAIL_NOT_VERIFIED',
      403,
      'Please verify your email address before joining the Creator Program.'
    );
  }

  const displayName = cleanDisplayName(input.displayName);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.creatorProfile.create({
        data: {
          userId: user.id,
          code: generateCreatorCode(),
          displayName,
          termsVersion: CREATOR_PROGRAM.TERMS_VERSION,
          termsAcceptedAt: new Date(),
        },
      });
    } catch (err: any) {
      if (!isUniqueViolation(err)) throw err;
      // Either the code collided (retry with a new one) or a concurrent join for this user won.
      const raced = await prisma.creatorProfile.findUnique({ where: { userId: user.id } });
      if (raced) return raced;
    }
  }
  throw new CreatorError('CODE_GENERATION_FAILED', 500, 'Could not generate a creator code. Please try again.');
}

export async function updateCreatorSettings(
  userId: string,
  input: { displayName?: unknown; notifyOnCommission?: unknown; notifyWeeklySummary?: unknown }
) {
  const data: Record<string, unknown> = {};
  if (input.displayName !== undefined) data.displayName = cleanDisplayName(input.displayName);
  if (typeof input.notifyOnCommission === 'boolean') data.notifyOnCommission = input.notifyOnCommission;
  if (typeof input.notifyWeeklySummary === 'boolean') data.notifyWeeklySummary = input.notifyWeeklySummary;
  if (Object.keys(data).length === 0) {
    throw new CreatorError('NO_CHANGES', 400, 'No valid settings were provided.');
  }
  return prisma.creatorProfile.update({ where: { userId }, data });
}

// ---------------------------------------------------------------------------
// Per-sale links
// ---------------------------------------------------------------------------

/** Loads a sale and checks it can carry an affiliate link. Public statuses only, never your own sale. */
async function assertSaleLinkable(saleId: unknown, creatorUserId: string) {
  if (typeof saleId !== 'string' || !saleId.trim() || saleId.length > 64) {
    throw new CreatorError('INVALID_SALE', 400, 'A sale is required.');
  }
  const sale = await prisma.sale.findUnique({
    where: { id: saleId.trim() },
    select: { id: true, status: true, deletedAt: true, organizer: { select: { userId: true } } },
  });
  if (!sale || sale.deletedAt || sale.status !== 'PUBLISHED') {
    throw new CreatorError('SALE_NOT_FOUND', 404, 'That sale is not available for creator links.');
  }
  if (sale.organizer?.userId === creatorUserId) {
    throw new CreatorError('SELF_PROMOTION', 400, 'You cannot create an affiliate link for your own sale.');
  }
  return sale;
}

export async function createOrGetSaleLink(creatorUserId: string, saleId: unknown) {
  const sale = await assertSaleLinkable(saleId, creatorUserId);
  const link = await prisma.affiliateLink.upsert({
    where: { userId_saleId: { userId: creatorUserId, saleId: sale.id } },
    update: {},
    create: { userId: creatorUserId, saleId: sale.id },
  });
  return { link, url: buildAffiliateShareUrl(link.id) };
}

export async function listCreatorLinks(creatorUserId: string, take = 100) {
  const links = await prisma.affiliateLink.findMany({
    where: { userId: creatorUserId },
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      sale: { select: { title: true, city: true, state: true, startDate: true, endDate: true, status: true, isOngoing: true } },
    },
  });
  return links.map((l) => ({ ...l, url: buildAffiliateShareUrl(l.id) }));
}

/** Public, published, upcoming-or-live sales a creator can promote (own sales excluded). */
export async function listPromotableSales(creatorUserId: string, q: unknown, limit = 12) {
  const term = typeof q === 'string' ? q.trim().slice(0, 80) : '';
  const now = new Date();
  const sales = await prisma.sale.findMany({
    where: {
      status: 'PUBLISHED',
      deletedAt: null,
      organizer: { userId: { not: creatorUserId } },
      OR: [{ isOngoing: true }, { endDate: { gte: now } }],
      ...(term
        ? {
            AND: [
              {
                OR: [
                  { title: { contains: term, mode: 'insensitive' as const } },
                  { city: { contains: term, mode: 'insensitive' as const } },
                  { state: { equals: term.toUpperCase() } },
                ],
              },
            ],
          }
        : {}),
    },
    select: { id: true, title: true, city: true, state: true, startDate: true, endDate: true, isOngoing: true },
    orderBy: { startDate: 'asc' },
    take: Math.min(Math.max(limit, 1), 25),
  });
  return sales;
}

// ---------------------------------------------------------------------------
// Click tracking
// ---------------------------------------------------------------------------

const BOT_UA = /bot|crawl|spider|slurp|preview|headless|curl|wget|python-requests|httpclient|facebookexternalhit|monitor/i;

export function isLikelyBot(userAgent: string | undefined | null): boolean {
  if (!userAgent) return true; // a real browser always sends a user agent
  return BOT_UA.test(userAgent);
}

export function hashClickIp(ip: string): string {
  const salt = process.env.AFFILIATE_IP_SALT || process.env.JWT_SECRET || 'findasale-affiliate';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

export interface ClickInput {
  /** AffiliateLink id, or a creator code (CRT_XXXXXX) paired with `saleHint`. */
  idOrCode: string;
  saleHint?: string;
  ip?: string;
  userAgent?: string;
  /** Signed-in visitor, if any. A creator clicking their own link is never counted or attributed. */
  viewerUserId?: string | null;
}

export interface ClickResult {
  saleId: string;
  /** Present only when a purchase made now should be credited to this link. */
  affiliateLinkId: string | null;
  /** True when this call added to the click count. */
  counted: boolean;
}

export async function recordAffiliateClick(input: ClickInput): Promise<ClickResult | null> {
  const idOrCode = (input.idOrCode || '').trim();
  if (!idOrCode || idOrCode.length > 64) return null;

  let link: { id: string; userId: string; saleId: string } | null = null;

  if (isCreatorCode(idOrCode)) {
    // Short share format: /affiliate/CRT_XXXXXX?sale=<saleId>. Resolves (creating on first use) the
    // creator's link for that sale, subject to the same public-sale and not-your-own-sale rules.
    const saleHint = (input.saleHint || '').trim();
    if (!saleHint) return null;
    const profile = await prisma.creatorProfile.findUnique({ where: { code: idOrCode.toUpperCase() } });
    if (!profile) return null;
    try {
      const { link: created } = await createOrGetSaleLink(profile.userId, saleHint);
      link = { id: created.id, userId: created.userId, saleId: created.saleId };
    } catch (err) {
      if (err instanceof CreatorError) return null;
      throw err;
    }
  } else {
    link = await prisma.affiliateLink.findUnique({
      where: { id: idOrCode },
      select: { id: true, userId: true, saleId: true },
    });
    if (!link) return null;
  }

  // Attribution requires: creator still allowed, sale still public, visitor is not the creator.
  const [creator, sale] = await Promise.all([
    prisma.user.findUnique({ where: { id: link.userId }, select: { id: true, role: true, roles: true } }),
    prisma.sale.findUnique({ where: { id: link.saleId }, select: { id: true, status: true, deletedAt: true } }),
  ]);
  const access = creator ? await getCreatorAccess(creator as any) : null;
  const salePublic = !!sale && !sale.deletedAt && sale.status === 'PUBLISHED';
  const selfClick = !!input.viewerUserId && input.viewerUserId === link.userId;
  const attributable = !!access?.allowed && salePublic && !selfClick;

  let counted = false;
  if (attributable && !isLikelyBot(input.userAgent) && input.ip && input.ip !== 'unknown') {
    const day = new Date().toISOString().slice(0, 10);
    try {
      await prisma.affiliateClick.create({
        data: { affiliateLinkId: link.id, ipHash: hashClickIp(input.ip), day },
      });
      counted = true;
    } catch (err) {
      // Same link + same IP + same day already recorded: a refresh or repeat visit, not a new click.
      if (!isUniqueViolation(err)) throw err;
    }
    if (counted) {
      await prisma.affiliateLink
        .update({ where: { id: link.id }, data: { clicks: { increment: 1 } } })
        .catch((err: unknown) => console.warn('[affiliate] click counter increment failed:', err));
    }
  }

  return { saleId: link.saleId, affiliateLinkId: attributable ? link.id : null, counted };
}

// ---------------------------------------------------------------------------
// Attribution at checkout
// ---------------------------------------------------------------------------

export interface AttributionInput {
  /** Raw value from the checkout request body or payment metadata. Never trusted. */
  affiliateLinkId: unknown;
  /** The sale the purchase is actually for. The link must be for this same sale. */
  saleId: string | null | undefined;
  buyerUserId?: string | null;
  buyerEmail?: string | null;
}

/**
 * Validates a client-supplied affiliate link id and returns it only if it may be stored on the
 * Purchase. Returns null (never throws) for anything else, so a bad or stale id can never fail a
 * checkout whose charge already went through. Blocks self-referral by account, email and sale
 * ownership; the card fingerprint check runs later in recordAffiliateConversion (the fingerprint
 * only exists after the charge).
 */
export async function resolveAffiliateAttribution(input: AttributionInput): Promise<string | null> {
  try {
    const raw = input.affiliateLinkId;
    if (typeof raw !== 'string' || !raw.trim() || raw.length > 64 || !input.saleId) return null;

    const link = await prisma.affiliateLink.findUnique({
      where: { id: raw.trim() },
      select: {
        id: true,
        userId: true,
        saleId: true,
        user: { select: { email: true, role: true, roles: true } },
        sale: { select: { organizer: { select: { userId: true } } } },
      },
    });
    if (!link || link.saleId !== input.saleId) return null;

    const access = await getCreatorAccess({ id: link.userId, role: link.user?.role, roles: link.user?.roles as string[] });
    if (!access.allowed) return null;

    if (input.buyerUserId && input.buyerUserId === link.userId) return null;
    if (link.sale?.organizer?.userId === link.userId) return null;
    const creatorEmail = link.user?.email?.trim().toLowerCase();
    const buyerEmail = input.buyerEmail?.trim().toLowerCase();
    if (creatorEmail && buyerEmail && creatorEmail === buyerEmail) return null;

    return link.id;
  } catch (err) {
    console.warn('[affiliate] attribution resolve failed (ignored, purchase proceeds unattributed):', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Conversion ledger
// ---------------------------------------------------------------------------

export interface ConversionOutcome {
  recorded: boolean;
  reason?: string;
  commissionCents?: number;
}

/**
 * Writes the commission ledger row for a PAID purchase that carries an affiliateLinkId.
 * Idempotent: purchaseId is unique, so Stripe webhook retries and idempotent Square retries
 * record exactly one row and bump AffiliateLink.conversions exactly once. Never throws.
 */
export async function recordAffiliateConversion(purchaseId: string): Promise<ConversionOutcome> {
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      select: {
        id: true,
        status: true,
        amount: true,
        platformFeeAmount: true,
        cashDebtCollectedAmount: true,
        isTestTransaction: true,
        userId: true,
        buyerEmail: true,
        buyerCardFingerprint: true,
        saleId: true,
        affiliateLinkId: true,
        createdAt: true,
        sale: { select: { title: true, organizer: { select: { userId: true } } } },
      },
    });
    if (!purchase) return { recorded: false, reason: 'PURCHASE_NOT_FOUND' };
    if (!purchase.affiliateLinkId) return { recorded: false, reason: 'NO_AFFILIATE_LINK' };
    if (purchase.status !== 'PAID') return { recorded: false, reason: 'NOT_PAID' };
    if (purchase.isTestTransaction) return { recorded: false, reason: 'TEST_TRANSACTION' };

    const link = await prisma.affiliateLink.findUnique({
      where: { id: purchase.affiliateLinkId },
      select: {
        id: true,
        userId: true,
        user: { select: { id: true, email: true, role: true, roles: true, stripeCardFingerprint: true } },
      },
    });
    if (!link) return { recorded: false, reason: 'LINK_NOT_FOUND' };

    const access = await getCreatorAccess({ id: link.userId, role: link.user?.role, roles: link.user?.roles as string[] });
    if (!access.allowed) return { recorded: false, reason: 'CREATOR_NOT_ALLOWED' };

    // Self-referral: the creator (or the sale's own organizer, or the same card) buying through their own link.
    const creatorEmail = link.user?.email?.trim().toLowerCase();
    const buyerEmail = purchase.buyerEmail?.trim().toLowerCase();
    const selfReferral =
      (purchase.userId && purchase.userId === link.userId) ||
      purchase.sale?.organizer?.userId === link.userId ||
      (!!creatorEmail && !!buyerEmail && creatorEmail === buyerEmail) ||
      (!!purchase.buyerCardFingerprint &&
        !!link.user?.stripeCardFingerprint &&
        purchase.buyerCardFingerprint === link.user.stripeCardFingerprint);
    if (selfReferral) {
      console.warn(`[affiliate][self-referral-blocked] purchase=${purchase.id} link=${link.id} creator=${link.userId}`);
      await prisma.purchase
        .update({ where: { id: purchase.id }, data: { affiliateLinkId: null } })
        .catch((err: unknown) => console.warn('[affiliate] failed to clear self-referral attribution:', err));
      return { recorded: false, reason: 'SELF_REFERRAL' };
    }

    const purchaseAmountCents = Math.round((purchase.amount ?? 0) * 100);
    const platformFeeCents = Math.max(
      0,
      Math.round(((purchase.platformFeeAmount ?? 0) - (purchase.cashDebtCollectedAmount ?? 0)) * 100)
    );
    const commissionCents = calculateCreatorCommissionCents(platformFeeCents);
    const eligibleAt = new Date(purchase.createdAt.getTime() + CREATOR_PROGRAM.HOLD_DAYS * 24 * 60 * 60 * 1000);

    // Cheap idempotency pre-check (retries are the common case); the unique index on purchaseId is
    // the real guarantee if two calls race past it.
    const already = await prisma.affiliateConversion.findUnique({
      where: { purchaseId: purchase.id },
      select: { id: true },
    });
    if (already) return { recorded: false, reason: 'ALREADY_RECORDED' };

    try {
      await prisma.$transaction(async (tx) => {
        await tx.affiliateConversion.create({
          data: {
            purchaseId: purchase.id,
            affiliateLinkId: link.id,
            creatorUserId: link.userId,
            saleId: purchase.saleId,
            purchaseAmountCents,
            platformFeeCents,
            commissionRateBps: CREATOR_PROGRAM.COMMISSION_RATE_BPS,
            commissionCents,
            eligibleAt,
          },
        });
        // Same transaction as the ledger row, so the counter and the ledger can never disagree.
        await tx.affiliateLink.update({ where: { id: link.id }, data: { conversions: { increment: 1 } } });
      });
    } catch (err) {
      if (isUniqueViolation(err)) return { recorded: false, reason: 'ALREADY_RECORDED' };
      throw err;
    }

    // In-app notification, only if the creator has not turned it off.
    const profile = access.profile;
    if (!profile || profile.notifyOnCommission) {
      const dollars = (commissionCents / 100).toFixed(2);
      createNotification(
        link.userId,
        'creator_commission',
        'A purchase came through your link',
        `A shopper bought from ${purchase.sale?.title ?? 'a sale'} using your link. You earned $${dollars} in commission, which becomes approved after ${CREATOR_PROGRAM.HOLD_DAYS} days if the purchase stands.`,
        '/creator/dashboard'
      ).catch(() => {});
    }

    return { recorded: true, commissionCents };
  } catch (err) {
    console.warn('[affiliate] recordAffiliateConversion failed (non-fatal):', err);
    return { recorded: false, reason: 'ERROR' };
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** Purchase statuses whose commission must be treated as reversed. */
export const REVERSED_PURCHASE_STATUSES = ['REFUNDED', 'REFUNDING', 'DISPUTED', 'DISPUTE_LOST', 'FAILED'];

export type CommissionState = 'PENDING' | 'APPROVED' | 'PAID' | 'REVERSED';

/** The purchase fields commission proration needs. All optional so a caller that does not select them sees "never refunded". */
export interface CommissionPurchaseShape {
  status: string;
  amount?: number | null;
  refundedAmount?: number | null;
}

/** What to select from Purchase wherever a commission amount is computed (status for state, the rest for proration). */
const PURCHASE_COMMISSION_SELECT = { status: true, amount: true, refundedAmount: true } as const;

/**
 * Commission after a PARTIAL refund (2026-09-30). A creator's commission is a share of the platform fee on
 * the purchase, and a partial refund returns that fee in proportion (Square refunds the app fee
 * proportionally), so the commission is prorated by (1 - refunded / amount) in integer cents, floored so
 * it can never round up and is never negative. Unrefunded purchases return the stored commission
 * untouched. A fully refunded purchase prorates to 0 (and its status already reads as reversed).
 */
export function proratedCommissionCents(c: {
  commissionCents: number;
  purchaseAmountCents?: number;
  purchase: CommissionPurchaseShape | null;
}): number {
  const refundedDollars = Number(c.purchase?.refundedAmount);
  if (!c.purchase || !Number.isFinite(refundedDollars) || refundedDollars <= 0) return c.commissionCents;
  const purchaseDollars = Number(c.purchase.amount);
  const amountCents = Number.isFinite(purchaseDollars) && purchaseDollars > 0 ? Math.round(purchaseDollars * 100) : Number(c.purchaseAmountCents) || 0;
  if (amountCents <= 0) return c.commissionCents;
  const refundedCents = Math.min(amountCents, Math.round(refundedDollars * 100));
  const keptCents = amountCents - refundedCents;
  return Math.max(0, Math.min(c.commissionCents, Math.floor((c.commissionCents * keptCents) / amountCents)));
}

/** Markers settleCommission writes into payoutNote so the paid / clawed-back amounts survive without a schema change. */
const PAID_CENTS_MARKER = /\[paid-cents:(\d+)\]/g;
const CLAWBACK_CENTS_MARKER = /\[clawback-cents:(\d+)\]/g;
function sumMarker(note: string | null | undefined, re: RegExp, mode: 'last' | 'sum'): number | null {
  if (!note) return null;
  let found: number | null = null;
  for (const m of note.matchAll(new RegExp(re.source, 'g'))) {
    const n = parseInt(m[1], 10);
    found = mode === 'sum' ? (found ?? 0) + n : n;
  }
  return found;
}

/**
 * Cents already PAID to the creator that the purchase's refunds now make excess: paid amount (the amount in
 * the [paid-cents:N] marker, else the full stored commission for a row paid before the marker existed)
 * minus what the commission is worth now (0 once the purchase is reversed) minus clawbacks already
 * recorded. 0 unless the row is PAID. This is what a clawback must recover; nothing here moves money.
 */
export function clawbackExcessCents(c: {
  payoutStatus: string;
  payoutNote?: string | null;
  commissionCents: number;
  purchaseAmountCents?: number;
  purchase: CommissionPurchaseShape | null;
}): number {
  if (c.payoutStatus !== 'PAID' || !c.purchase) return 0;
  const paid = sumMarker(c.payoutNote, PAID_CENTS_MARKER, 'last') ?? c.commissionCents;
  const worthNow = REVERSED_PURCHASE_STATUSES.includes(c.purchase.status) ? 0 : proratedCommissionCents(c);
  const clawed = sumMarker(c.payoutNote, CLAWBACK_CENTS_MARKER, 'sum') ?? 0;
  return Math.max(0, paid - worthNow - clawed);
}

export function commissionStateOf(c: {
  payoutStatus: string;
  eligibleAt: Date;
  purchase: CommissionPurchaseShape | null;
  commissionCents?: number;
  purchaseAmountCents?: number;
}, now: Date = new Date()): CommissionState {
  if (c.payoutStatus === 'VOIDED') return 'REVERSED';
  if (!c.purchase || REVERSED_PURCHASE_STATUSES.includes(c.purchase.status)) return 'REVERSED';
  // A partial refund that leaves nothing of the commission (prorated to 0) is reversed too.
  if (typeof c.commissionCents === 'number' && c.commissionCents > 0 && proratedCommissionCents({ commissionCents: c.commissionCents, purchaseAmountCents: c.purchaseAmountCents, purchase: c.purchase }) === 0) return 'REVERSED';
  if (c.payoutStatus === 'PAID') return 'PAID';
  return c.eligibleAt.getTime() <= now.getTime() ? 'APPROVED' : 'PENDING';
}

export async function getCreatorDashboard(creatorUserId: string, now: Date = new Date()) {
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [links, conversions, clicksLast30] = await Promise.all([
    prisma.affiliateLink.findMany({
      where: { userId: creatorUserId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        sale: { select: { title: true, city: true, state: true, startDate: true, endDate: true, status: true, isOngoing: true } },
      },
    }),
    prisma.affiliateConversion.findMany({
      where: { creatorUserId },
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: {
        id: true,
        affiliateLinkId: true,
        saleId: true,
        purchaseAmountCents: true,
        commissionCents: true,
        payoutStatus: true,
        eligibleAt: true,
        createdAt: true,
        purchase: { select: PURCHASE_COMMISSION_SELECT },
        affiliateLink: { select: { sale: { select: { title: true } } } },
      },
    }),
    prisma.affiliateClick.count({
      where: { affiliateLink: { userId: creatorUserId }, createdAt: { gte: since30 } },
    }),
  ]);

  const totals = { pendingCents: 0, approvedCents: 0, paidCents: 0, reversedCents: 0, grossSalesCents: 0, activeConversions: 0 };
  const perLink = new Map<string, { commissionCents: number; conversions: number }>();
  const recent: Array<{
    id: string;
    saleTitle: string | null;
    purchaseAmountCents: number;
    commissionCents: number;
    state: CommissionState;
    createdAt: Date;
    eligibleAt: Date;
  }> = [];

  for (const c of conversions) {
    const state = commissionStateOf(c, now);
    // Partial refunds (2026-09-30): count only the commission that survives the refund; the refunded
    // share is reported as reversed.
    const kept = state === 'REVERSED' ? 0 : proratedCommissionCents(c);
    if (state === 'PENDING') totals.pendingCents += kept;
    else if (state === 'APPROVED') totals.approvedCents += kept;
    else if (state === 'PAID') totals.paidCents += kept;
    else totals.reversedCents += c.commissionCents;
    if (state !== 'REVERSED') totals.reversedCents += c.commissionCents - kept;
    if (state !== 'REVERSED') {
      totals.grossSalesCents += c.purchaseAmountCents;
      totals.activeConversions += 1;
      if (c.affiliateLinkId) {
        const cur = perLink.get(c.affiliateLinkId) ?? { commissionCents: 0, conversions: 0 };
        cur.commissionCents += kept;
        cur.conversions += 1;
        perLink.set(c.affiliateLinkId, cur);
      }
    }
    if (recent.length < 10) {
      recent.push({
        id: c.id,
        saleTitle: c.affiliateLink?.sale?.title ?? null,
        purchaseAmountCents: c.purchaseAmountCents,
        commissionCents: state === 'REVERSED' ? c.commissionCents : proratedCommissionCents(c),
        state,
        createdAt: c.createdAt,
        eligibleAt: c.eligibleAt,
      });
    }
  }

  const totalClicks = links.reduce((sum, l) => sum + l.clicks, 0);

  return {
    totals: {
      clicks: totalClicks,
      clicksLast30Days: clicksLast30,
      links: links.length,
      conversions: totals.activeConversions,
      grossSalesCents: totals.grossSalesCents,
      commissionPendingCents: totals.pendingCents,
      commissionApprovedCents: totals.approvedCents,
      commissionPaidCents: totals.paidCents,
      commissionReversedCents: totals.reversedCents,
    },
    links: links.map((l) => ({
      id: l.id,
      saleId: l.saleId,
      url: buildAffiliateShareUrl(l.id),
      clicks: l.clicks,
      conversions: perLink.get(l.id)?.conversions ?? 0,
      commissionCents: perLink.get(l.id)?.commissionCents ?? 0,
      createdAt: l.createdAt,
      sale: l.sale,
    })),
    recentConversions: recent,
    program: {
      commissionRatePercent: CREATOR_PROGRAM.COMMISSION_RATE_BPS / 100,
      holdDays: CREATOR_PROGRAM.HOLD_DAYS,
      termsVersion: CREATOR_PROGRAM.TERMS_VERSION,
    },
  };
}

// ---------------------------------------------------------------------------
// Admin ledger: view commissions, settle them by hand. NOTHING here runs on a schedule and
// nothing moves money: "mark paid" only records that an admin paid the creator outside the app.
// ---------------------------------------------------------------------------

// Money review (2026-09-29): the ledger used to be read through a hard `take: 2000`, so once it grew
// past that the older rows silently vanished from the admin totals and payout review. It is now read
// in keyset batches until exhausted (bounded by ADMIN_LEDGER_MAX_SCAN so a runaway table can not
// exhaust memory; `truncated: true` is returned if that bound is ever hit) and paged either by
// `page` (unchanged) or by an opaque `cursor` (the id of the last row of the previous page).
const ADMIN_LEDGER_BATCH = 1000;
const ADMIN_LEDGER_MAX_SCAN = 100000;

export async function listAdminCommissions(
  opts: { state?: unknown; page?: unknown; limit?: unknown; cursor?: unknown },
  now: Date = new Date()
) {
  const page = Math.max(1, parseInt(String(opts.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(opts.limit ?? '25'), 10) || 25));
  const wanted = typeof opts.state === 'string' ? opts.state.toUpperCase() : 'ALL';
  const cursorId = typeof opts.cursor === 'string' && opts.cursor.trim() ? opts.cursor.trim() : null;

  // Commission state is derived (hold window, purchase status), so filter after the read.
  const rows: Array<Awaited<ReturnType<typeof readLedgerBatch>>[number]> = [];
  let after: string | null = null;
  let truncated = false;
  for (;;) {
    const batch = await readLedgerBatch(after);
    rows.push(...batch);
    if (batch.length < ADMIN_LEDGER_BATCH) break;
    after = batch[batch.length - 1].id;
    if (rows.length >= ADMIN_LEDGER_MAX_SCAN) {
      truncated = true;
      break;
    }
  }

  const totals: Record<CommissionState, number> = { PENDING: 0, APPROVED: 0, PAID: 0, REVERSED: 0 };
  let clawbackDueCents = 0;
  const decorated = rows.map((r) => {
    const state = commissionStateOf(r, now);
    // Partial refunds (2026-09-30): a live commission counts at its prorated value; the refunded share is REVERSED.
    const keptCents = state === 'REVERSED' ? r.commissionCents : proratedCommissionCents(r);
    totals[state] += keptCents;
    if (state !== 'REVERSED' && keptCents < r.commissionCents) totals.REVERSED += r.commissionCents - keptCents;
    // A commission that was ALREADY paid out to the creator and whose purchase was later refunded or
    // lost to a dispute. commissionStateOf reports it as REVERSED (the purchase is), which hides that
    // real money left the building. Clawing it back from the creator is a manual process (nothing
    // here moves money); recordCommissionClawback (settleCommission action 'CLAWBACK') records it.
    // Also true for a PARTIAL refund of a paid commission: the excess over the prorated commission is owed back.
    const rowClawbackCents = clawbackExcessCents(r);
    const clawbackDue = rowClawbackCents > 0;
    if (clawbackDue) clawbackDueCents += rowClawbackCents;
    return { row: r, state, clawbackDue, rowClawbackCents, keptCents };
  });
  const matches = (d: { state: CommissionState }) => wanted === 'ALL' || d.state === wanted;
  const filtered = decorated.filter(matches);

  let pageSource: typeof decorated;
  let hasMore: boolean;
  if (cursorId) {
    const at = decorated.findIndex((d) => d.row.id === cursorId);
    const candidates = at >= 0 ? decorated.slice(at + 1).filter(matches) : filtered;
    pageSource = candidates.slice(0, limit);
    hasMore = candidates.length > limit;
  } else {
    pageSource = filtered.slice((page - 1) * limit, page * limit);
    hasMore = filtered.length > page * limit;
  }
  const pageRows = pageSource.map(({ row, state, clawbackDue, rowClawbackCents, keptCents }) => ({
    id: row.id,
    createdAt: row.createdAt,
    eligibleAt: row.eligibleAt,
    state,
    clawbackDue,
    clawbackDueCents: rowClawbackCents,
    // The commission that stands after any partial refund; originalCommissionCents is what was first recorded.
    commissionCents: keptCents,
    originalCommissionCents: row.commissionCents,
    commissionRateBps: row.commissionRateBps,
    purchaseAmountCents: row.purchaseAmountCents,
    platformFeeCents: row.platformFeeCents,
    payoutStatus: row.payoutStatus,
    paidAt: row.paidAt,
    payoutNote: row.payoutNote,
    saleTitle: row.affiliateLink?.sale?.title ?? null,
    creator: {
      id: row.creator.id,
      name: row.creator.name,
      email: row.creator.email,
      code: row.creator.creatorProfile?.code ?? null,
    },
  }));

  return {
    commissions: pageRows,
    // Pass back as `cursor` to fetch the next page without recomputing offsets. null on the last page.
    nextCursor: hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1].id : null,
    truncated,
    pagination: { page, limit, total: filtered.length, pages: Math.max(1, Math.ceil(filtered.length / limit)), hasMore },
    totalsCents: {
      pending: totals.PENDING,
      approved: totals.APPROVED,
      paid: totals.PAID,
      reversed: totals.REVERSED,
      // Already paid to creators but since reversed: owed back, a manual process (see clawbackDue).
      clawbackDue: clawbackDueCents,
    },
  };
}

function readLedgerBatch(after: string | null) {
  return prisma.affiliateConversion.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: ADMIN_LEDGER_BATCH,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      eligibleAt: true,
      commissionCents: true,
      commissionRateBps: true,
      purchaseAmountCents: true,
      platformFeeCents: true,
      payoutStatus: true,
      paidAt: true,
      payoutNote: true,
      purchase: { select: PURCHASE_COMMISSION_SELECT },
      affiliateLink: { select: { sale: { select: { title: true } } } },
      creator: { select: { id: true, name: true, email: true, creatorProfile: { select: { code: true } } } },
    },
  });
}

/**
 * Admin action: record that a commission was paid (only when APPROVED), voided (only while UNPAID), or
 * that a clawback of an already-paid, since-reversed commission was handled ('CLAWBACK').
 *
 * Race safe (money review 2026-09-29): every eligibility rule is part of the SINGLE conditional
 * updateMany, not just a pre-read. Mark-paid only matches while the row is still UNPAID, past its hold
 * window AND its purchase is not refunded / refunding / disputed, so a refund that lands between the
 * read and the write can no longer be paid out anyway. The read that precedes it only produces the
 * precise error message; when the write matches nothing the row is re-read to explain why.
 *
 * CLAWBACK is a manual process: nothing here takes money back from the creator. This only records that
 * an admin did, so a paid-then-reversed commission stops showing as outstanding.
 */
export async function settleCommission(
  id: string,
  action: 'PAID' | 'VOIDED' | 'CLAWBACK',
  note: unknown,
  now: Date = new Date()
) {
  const noteText = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  if (action === 'VOIDED' && !noteText) {
    throw new CreatorError('NOTE_REQUIRED', 400, 'Add a note explaining why this commission is being voided.');
  }
  if (action === 'CLAWBACK' && !noteText) {
    throw new CreatorError('NOTE_REQUIRED', 400, 'Add a note recording how the clawback was handled with the creator.');
  }

  const select = {
    id: true,
    creatorUserId: true,
    commissionCents: true,
    payoutStatus: true,
    payoutNote: true,
    eligibleAt: true,
    purchaseAmountCents: true,
    purchase: { select: PURCHASE_COMMISSION_SELECT },
  } as const;
  const row = await prisma.affiliateConversion.findUnique({ where: { id }, select });
  if (!row) throw new CreatorError('NOT_FOUND', 404, 'Commission not found.');

  const notPayableError = (state: CommissionState) =>
    new CreatorError(
      'NOT_PAYABLE',
      409,
      state === 'PENDING'
        ? 'This commission is still inside its hold window.'
        : `This commission is ${state.toLowerCase()} and cannot be marked paid.`
    );

  const state = commissionStateOf(row, now);
  if (action === 'PAID' && state !== 'APPROVED') {
    throw notPayableError(state);
  }
  if (action === 'VOIDED' && row.payoutStatus !== 'UNPAID') {
    throw new CreatorError('NOT_VOIDABLE', 409, 'Only an unpaid commission can be voided.');
  }
  if (action === 'CLAWBACK') {
    if (row.payoutStatus !== 'PAID') {
      throw new CreatorError('NOT_CLAWBACKABLE', 409, 'Only a commission that was already paid can have a clawback recorded.');
    }
    if (clawbackExcessCents(row) <= 0) {
      throw new CreatorError('NOT_REVERSED', 409, 'This purchase has not been refunded or lost to a dispute, or the commission already paid is not more than what still stands, so there is nothing to claw back.');
    }
  }
  const rowReversed = !!row.purchase && REVERSED_PURCHASE_STATUSES.includes(row.purchase.status);
  const clawbackCents = action === 'CLAWBACK' ? clawbackExcessCents(row) : 0;
  const payableCents = proratedCommissionCents(row);

  const where =
    action === 'PAID'
      ? {
          id,
          payoutStatus: 'UNPAID',
          eligibleAt: { lte: now },
          purchase: { is: { status: { notIn: REVERSED_PURCHASE_STATUSES } } },
        }
      : action === 'VOIDED'
        ? { id, payoutStatus: 'UNPAID' }
        : rowReversed
          ? {
              id,
              payoutStatus: 'PAID',
              purchase: { is: { status: { in: REVERSED_PURCHASE_STATUSES } } },
            }
          : {
              // PARTIAL-refund excess: the row stays PAID (more refunds can follow), so pin the note this call
              // read; a concurrent clawback record changes it and this then matches nothing.
              id,
              payoutStatus: 'PAID',
              payoutNote: row.payoutNote ?? null,
              purchase: { is: { status: { notIn: REVERSED_PURCHASE_STATUSES } } },
            };
  // payoutNote is capped at 1000 characters; machine-readable markers ride at the END of the text that is
  // kept, so trimming drops the oldest free text, never a marker.
  const joinNote = (prev: string | null, add: string) => {
    const room = Math.max(0, 1000 - add.length - 3);
    const kept = prev ? prev.slice(-room) : '';
    return [kept, add].filter(Boolean).join(' | ').slice(-1000);
  };
  const data =
    action === 'CLAWBACK'
      ? {
          payoutStatus: rowReversed ? 'CLAWBACK_RECORDED' : 'PAID',
          // Fully reversed: terminal CLAWBACK_RECORDED and the note reads exactly as it always did. A PARTIAL-refund
          // excess keeps the row PAID and records the recovered cents in a marker so a later refund's excess is exact.
          payoutNote: rowReversed
            ? [row.payoutNote, `Clawback recorded: ${noteText}`].filter(Boolean).join(' | ').slice(0, 1000)
            : joinNote(row.payoutNote, `Partial-refund clawback recorded: ${noteText} [clawback-cents:${clawbackCents}]`),
        }
      : action === 'PAID'
        ? {
            payoutStatus: 'PAID',
            // A commission prorated for a partial refund records the cents actually payable, so a later refund's
            // excess is exact; an unrefunded one is written exactly as before (the full stored commission is implied).
            payoutNote:
              payableCents < row.commissionCents
                ? joinNote(null, `${noteText ? `${noteText} ` : ''}[paid-cents:${payableCents}]`.trim())
                : noteText || null,
            paidAt: now,
          }
        : {
            payoutStatus: action,
            payoutNote: noteText || null,
          };

  const result = await prisma.affiliateConversion.updateMany({ where, data });
  if (result.count === 0) {
    // Lost a race, or the purchase was refunded after the read above. Re-read to say which.
    const fresh = await prisma.affiliateConversion.findUnique({ where: { id }, select });
    if (action === 'PAID' && fresh && fresh.payoutStatus === 'UNPAID') {
      const freshState = commissionStateOf(fresh, now);
      if (freshState !== 'APPROVED') throw notPayableError(freshState);
    }
    throw new CreatorError('ALREADY_SETTLED', 409, 'This commission was already settled.');
  }

  if (action === 'PAID') {
    createNotification(
      row.creatorUserId,
      'creator_commission_paid',
      'Your commission was paid',
      `A commission of $${(payableCents / 100).toFixed(2)} was marked as paid. Details are on your creator dashboard.`,
      '/creator/dashboard'
    ).catch(() => {});
  }

  return { id, payoutStatus: action === 'CLAWBACK' ? (rowReversed ? 'CLAWBACK_RECORDED' : 'PAID') : action };
}

// ---------------------------------------------------------------------------
// Weekly summary (in-app notification), invoked by jobs/creatorWeeklySummaryJob.ts
// ---------------------------------------------------------------------------

export async function sendCreatorWeeklySummaries(now: Date = new Date()): Promise<{ sent: number }> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const profiles = await prisma.creatorProfile.findMany({
    where: {
      status: 'ACTIVE',
      notifyWeeklySummary: true,
      OR: [{ lastSummarySentAt: null }, { lastSummarySentAt: { lte: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000) } }],
    },
    select: { id: true, userId: true },
    take: 1000,
  });

  let sent = 0;
  for (const profile of profiles) {
    try {
      const [clicks, conversions] = await Promise.all([
        prisma.affiliateClick.count({ where: { affiliateLink: { userId: profile.userId }, createdAt: { gte: weekAgo } } }),
        prisma.affiliateConversion.findMany({
          where: { creatorUserId: profile.userId, createdAt: { gte: weekAgo } },
          select: { commissionCents: true, purchaseAmountCents: true, purchase: { select: PURCHASE_COMMISSION_SELECT } },
        }),
      ]);
      const active = conversions.filter((c) => !REVERSED_PURCHASE_STATUSES.includes(c.purchase?.status ?? ''));
      const commission = active.reduce((sum, c) => sum + proratedCommissionCents(c), 0);
      // Quiet weeks stay quiet: nothing to report means no notification.
      if (clicks > 0 || active.length > 0) {
        await createNotification(
          profile.userId,
          'creator_weekly_summary',
          'Your creator week',
          `Last 7 days: ${clicks} link ${clicks === 1 ? 'click' : 'clicks'}, ${active.length} ${active.length === 1 ? 'purchase' : 'purchases'}, $${(commission / 100).toFixed(2)} in commission earned.`,
          '/creator/dashboard'
        );
        sent += 1;
      }
      await prisma.creatorProfile.update({ where: { id: profile.id }, data: { lastSummarySentAt: now } });
    } catch (err) {
      console.warn('[creatorWeeklySummary] failed for creator', profile.userId, err);
    }
  }
  return { sent };
}
