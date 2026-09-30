import { prisma } from '../lib/prisma';

/**
 * Loyalty + Sale Passport service (feature #29).
 *
 * TWO LAYERS, BOTH LIVE:
 *
 * 1. Sale Passport (2026-09-29 rebuild): the 12-stamp collectible passport from
 *    claude_docs/strategy/engagement-system-year1.md Decision 1. Dated, place-aware rows in
 *    ShopperPassportStamp. Every stamp is a pure function of source data (SaleCheckin, Purchase,
 *    Review, Favorite, UGCPhoto, BoostPurchase, ReferralReward) evaluated idempotently, so the
 *    stamps can be awarded from event hooks (check-in, purchase, review, referral) AND
 *    re-derived on read for actions whose controllers do not call us (favorites, hauls, guides,
 *    the reservation-flow check-in). A unique (userId, dedupeKey) makes every award safe to
 *    repeat. Milestones (Bronze 3 / Silver 6 / Gold 9 / Platinum 12 distinct stamps) are stored
 *    in StampMilestone with milestone = 3/6/9/12. All free for every rank. Design record:
 *    claude_docs/feature-notes/ADR-sale-passport-2026-09-29.md
 *
 * 2. Legacy lifetime-activity tally (ShopperStamp counters + StampMilestone 5/20/50): kept
 *    running so no production data or behavior is lost. Increments now follow the ADR-PHASE4
 *    spec (attend 1, purchase 2, review 1, refer 3) and can be made idempotent by passing a
 *    refId (ledger row with stampKey 'ACTIVITY').
 *
 * Everything here is fire-and-forget safe: no exported award function ever throws.
 */

// ---------------------------------------------------------------------------
// Legacy activity tally
// ---------------------------------------------------------------------------

const STAMP_MILESTONES: Record<number, string> = {
  5: 'BRONZE',
  20: 'SILVER',
  50: 'GOLD',
};

/** ADR-PHASE4-BRIEF #29 spec: ATTEND_SALE 1, MAKE_PURCHASE 2, WRITE_REVIEW 1, REFER_FRIEND 3 */
export const LEGACY_STAMP_INCREMENT: Record<string, number> = {
  ATTEND_SALE: 1,
  MAKE_PURCHASE: 2,
  WRITE_REVIEW: 1,
  REFER_FRIEND: 3,
};

// ---------------------------------------------------------------------------
// Sale Passport definitions
// ---------------------------------------------------------------------------

export type PassportStampKey =
  | 'FIRST_STEPS'
  | 'WEEKEND_WARRIOR'
  | 'ROAD_TRIPPER'
  | 'FIRST_FIND'
  | 'TREASURE_HUNTER'
  | 'LAKEFRONT_HAUL'
  | 'STORYTELLER'
  | 'ITEM_KEEPER'
  | 'HAUL_CURATOR'
  | 'FRIEND_FINDER'
  | 'COMMUNITY_GUIDE'
  | 'CROWD_FAVORITE';

export interface PassportStampDef {
  key: PassportStampKey;
  category: 'VISIT' | 'PURCHASE' | 'SHARE' | 'COMMUNITY';
  categoryLabel: string;
  name: string;
  icon: string;
  howToEarn: string;
  repeatable: boolean;
}

export const PASSPORT_STAMPS: PassportStampDef[] = [
  // Category 1: Visit & Explore
  { key: 'FIRST_STEPS', category: 'VISIT', categoryLabel: 'Visit & Explore', name: 'First Steps', icon: '🧭', repeatable: false,
    howToEarn: 'Check in at your first sale.' },
  { key: 'WEEKEND_WARRIOR', category: 'VISIT', categoryLabel: 'Visit & Explore', name: 'Weekend Warrior', icon: '🌳', repeatable: true,
    howToEarn: 'Check in at 5 different sales in one calendar month. Earn it again every month.' },
  { key: 'ROAD_TRIPPER', category: 'VISIT', categoryLabel: 'Visit & Explore', name: 'Road Tripper', icon: '🗺️', repeatable: true,
    howToEarn: 'Check in at sales in 3 different areas in one season. Earn it again every season.' },
  // Category 2: Purchase & Treasure
  { key: 'FIRST_FIND', category: 'PURCHASE', categoryLabel: 'Purchase & Treasure', name: 'First Find', icon: '🛍️', repeatable: false,
    howToEarn: 'Complete your first purchase.' },
  { key: 'TREASURE_HUNTER', category: 'PURCHASE', categoryLabel: 'Purchase & Treasure', name: 'Treasure Hunter', icon: '💎', repeatable: false,
    howToEarn: 'Complete 5 purchases.' },
  { key: 'LAKEFRONT_HAUL', category: 'PURCHASE', categoryLabel: 'Purchase & Treasure', name: 'Lakefront Haul', icon: '💰', repeatable: true,
    howToEarn: 'Spend $50 or more at a single sale. Earn it again at every sale you do it at.' },
  // Category 3: Share & Contribute
  { key: 'STORYTELLER', category: 'SHARE', categoryLabel: 'Share & Contribute', name: 'Storyteller', icon: '⭐', repeatable: false,
    howToEarn: 'Write your first sale review.' },
  { key: 'ITEM_KEEPER', category: 'SHARE', categoryLabel: 'Share & Contribute', name: 'Keeper', icon: '🎁', repeatable: false,
    howToEarn: 'Save 10 items to your favorites.' },
  { key: 'HAUL_CURATOR', category: 'SHARE', categoryLabel: 'Share & Contribute', name: 'Haul Curator', icon: '📸', repeatable: false,
    howToEarn: 'Get your first haul post approved on the haul feed.' },
  // Category 4: Community & Referrals
  { key: 'FRIEND_FINDER', category: 'COMMUNITY', categoryLabel: 'Community & Referrals', name: 'Friend Finder', icon: '👥', repeatable: true,
    howToEarn: 'Refer a friend who completes their first purchase. Earn it again for every friend.' },
  { key: 'COMMUNITY_GUIDE', category: 'COMMUNITY', categoryLabel: 'Community & Referrals', name: 'Community Guide', icon: '📖', repeatable: false,
    howToEarn: 'Publish a collection guide.' },
  { key: 'CROWD_FAVORITE', category: 'COMMUNITY', categoryLabel: 'Community & Referrals', name: 'Crowd Favorite', icon: '🏆', repeatable: false,
    howToEarn: 'Get 10 or more likes on one of your haul posts.' },
];

export const PASSPORT_STAMP_KEYS: string[] = PASSPORT_STAMPS.map((s) => s.key);

export interface PassportMilestoneDef {
  milestone: number;
  badgeType: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  name: string;
  cosmetic: string;
}

/** Milestones count DISTINCT stamps collected (max 12), so repeatable stamps never inflate them. */
export const PASSPORT_MILESTONES: PassportMilestoneDef[] = [
  { milestone: 3, badgeType: 'BRONZE', name: 'Bronze Star', cosmetic: 'Bronze star badge' },
  { milestone: 6, badgeType: 'SILVER', name: 'Silver Compass', cosmetic: 'Silver compass badge' },
  { milestone: 9, badgeType: 'GOLD', name: 'Golden Compass', cosmetic: 'Golden compass badge' },
  { milestone: 12, badgeType: 'PLATINUM', name: 'Platinum Crown', cosmetic: 'Platinum crown badge' },
];

const PASSPORT_MILESTONE_VALUES = PASSPORT_MILESTONES.map((m) => m.milestone);

/** A stamp is "fresh" (toast-worthy) when it was earned within this window of being recorded. */
const FRESH_WINDOW_MS = 10 * 60 * 1000;

export const WEEKEND_WARRIOR_TARGET = 5;
export const ROAD_TRIPPER_TARGET = 3;
export const TREASURE_HUNTER_TARGET = 5;
export const LAKEFRONT_HAUL_TARGET_DOLLARS = 50;
export const ITEM_KEEPER_TARGET = 10;
export const CROWD_FAVORITE_TARGET = 10;

const PURCHASE_OK_STATUSES = ['PAID', 'COMPLETED'];

type EvalScope = 'attendance' | 'purchases' | 'reviews' | 'favorites' | 'hauls' | 'guides' | 'referrals';
const ALL_SCOPES: EvalScope[] = ['attendance', 'purchases', 'reviews', 'favorites', 'hauls', 'guides', 'referrals'];

const SCOPES_BY_LEGACY_TYPE: Record<string, EvalScope[]> = {
  ATTEND_SALE: ['attendance'],
  MAKE_PURCHASE: ['purchases'],
  WRITE_REVIEW: ['reviews'],
  REFER_FRIEND: ['referrals'],
};

// ---------------------------------------------------------------------------
// Small pure helpers (exported for tests)
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Calendar month key in UTC, e.g. "2026-09". */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/**
 * Meteorological season key in UTC, e.g. "2026-FALL". Winter is Dec-Feb and is keyed by the
 * year the December falls in, so Jan/Feb 2027 belong to "2026-WINTER".
 */
export function seasonKey(d: Date): string {
  const m = d.getUTCMonth(); // 0-11
  const y = d.getUTCFullYear();
  if (m >= 2 && m <= 4) return `${y}-SPRING`;
  if (m >= 5 && m <= 7) return `${y}-SUMMER`;
  if (m >= 8 && m <= 10) return `${y}-FALL`;
  return `${m === 11 ? y : y - 1}-WINTER`;
}

export interface PlaceInfo {
  cityKey: string | null;
  regionKey: string | null;
  placeLabel: string | null;
}

/**
 * Place keys from a sale's city/state/zip. Sale has no county column, so the "area" used by
 * Road Tripper is state + 3-digit ZIP prefix (a USPS sectional-center area, roughly a metro
 * or county cluster). Falls back to state + city when the ZIP is unusable.
 */
export function placeInfo(sale?: { city?: string | null; state?: string | null; zip?: string | null } | null): PlaceInfo {
  if (!sale) return { cityKey: null, regionKey: null, placeLabel: null };
  const city = (sale.city || '').trim();
  const state = (sale.state || '').trim().toUpperCase();
  if (!city && !state) return { cityKey: null, regionKey: null, placeLabel: null };
  const zip3 = (sale.zip || '').replace(/\D/g, '').slice(0, 3);
  return {
    cityKey: `${city.toLowerCase()}|${state}`,
    regionKey: zip3.length === 3 ? `${state}-${zip3}` : `${state}-${city.toLowerCase()}`,
    placeLabel: city && state ? `${city}, ${state}` : city || state,
  };
}

function isUniqueViolation(err: any): boolean {
  return !!err && (err.code === 'P2002' || /Unique constraint/i.test(String(err.message || '')));
}

// ---------------------------------------------------------------------------
// Evaluators: derive candidate stamps from source-of-truth data
// ---------------------------------------------------------------------------

interface Candidate {
  stampKey: PassportStampKey;
  dedupeKey: string;
  earnedAt: Date;
  saleId?: string | null;
  place?: PlaceInfo | null;
}

export interface ProgressInfo {
  current: number;
  target: number;
  label: string;
}

interface EvalOutput {
  candidates: Candidate[];
  progress: Partial<Record<PassportStampKey, ProgressInfo>>;
}

async function evalAttendance(userId: string, now: Date): Promise<EvalOutput> {
  const out: EvalOutput = { candidates: [], progress: {} };
  const checkins: any[] = await prisma.saleCheckin.findMany({
    where: { userId },
    orderBy: { checkinAt: 'asc' },
    take: 2000,
    select: { saleId: true, checkinAt: true, sale: { select: { city: true, state: true, zip: true } } },
  });

  if (checkins.length > 0) {
    const first = checkins[0];
    out.candidates.push({
      stampKey: 'FIRST_STEPS',
      dedupeKey: 'FIRST_STEPS',
      earnedAt: first.checkinAt,
      saleId: first.saleId,
      place: placeInfo(first.sale),
    });
  }

  const salesByMonth = new Map<string, Set<string>>();
  const regionsBySeason = new Map<string, Set<string>>();
  const monthDone = new Set<string>();
  const seasonDone = new Set<string>();

  for (const c of checkins) {
    const when: Date = c.checkinAt;
    const place = placeInfo(c.sale);

    const mk = monthKey(when);
    if (!salesByMonth.has(mk)) salesByMonth.set(mk, new Set());
    salesByMonth.get(mk)!.add(c.saleId);
    if (salesByMonth.get(mk)!.size >= WEEKEND_WARRIOR_TARGET && !monthDone.has(mk)) {
      monthDone.add(mk);
      out.candidates.push({ stampKey: 'WEEKEND_WARRIOR', dedupeKey: `WEEKEND_WARRIOR:${mk}`, earnedAt: when, saleId: c.saleId, place });
    }

    if (place.regionKey) {
      const sk = seasonKey(when);
      if (!regionsBySeason.has(sk)) regionsBySeason.set(sk, new Set());
      regionsBySeason.get(sk)!.add(place.regionKey);
      if (regionsBySeason.get(sk)!.size >= ROAD_TRIPPER_TARGET && !seasonDone.has(sk)) {
        seasonDone.add(sk);
        out.candidates.push({ stampKey: 'ROAD_TRIPPER', dedupeKey: `ROAD_TRIPPER:${sk}`, earnedAt: when, saleId: c.saleId, place });
      }
    }
  }

  out.progress.WEEKEND_WARRIOR = {
    current: Math.min(salesByMonth.get(monthKey(now))?.size ?? 0, WEEKEND_WARRIOR_TARGET),
    target: WEEKEND_WARRIOR_TARGET,
    label: 'different sales this month',
  };
  out.progress.ROAD_TRIPPER = {
    current: Math.min(regionsBySeason.get(seasonKey(now))?.size ?? 0, ROAD_TRIPPER_TARGET),
    target: ROAD_TRIPPER_TARGET,
    label: 'different areas this season',
  };
  return out;
}

async function evalPurchases(userId: string): Promise<EvalOutput> {
  const out: EvalOutput = { candidates: [], progress: {} };
  const rows: any[] = await prisma.purchase.findMany({
    where: {
      userId,
      status: { in: PURCHASE_OK_STATUSES },
      isTestTransaction: false,
      source: { not: 'POS' },
    },
    orderBy: { createdAt: 'asc' },
    take: 2000,
    select: {
      id: true,
      saleId: true,
      amount: true,
      createdAt: true,
      stripePaymentIntentId: true,
      squarePaymentId: true,
      sale: { select: { city: true, state: true, zip: true, organizer: { select: { userId: true } } } },
    },
  });

  const orders = new Set<string>();
  const spendBySale = new Map<string, number>();
  const lakefrontDone = new Set<string>();
  let treasureDone = false;
  let bestSpend = 0;

  for (const r of rows) {
    // A shopper buying from their own organizer account must not farm stamps.
    if (r.sale?.organizer?.userId && r.sale.organizer.userId === userId) continue;

    const place = placeInfo(r.sale);
    const orderKey: string = r.stripePaymentIntentId || r.squarePaymentId || r.id;
    const isNewOrder = !orders.has(orderKey);
    orders.add(orderKey);

    if (orders.size === 1 && isNewOrder) {
      out.candidates.push({ stampKey: 'FIRST_FIND', dedupeKey: 'FIRST_FIND', earnedAt: r.createdAt, saleId: r.saleId, place });
    }
    if (orders.size >= TREASURE_HUNTER_TARGET && !treasureDone) {
      treasureDone = true;
      out.candidates.push({ stampKey: 'TREASURE_HUNTER', dedupeKey: 'TREASURE_HUNTER', earnedAt: r.createdAt, saleId: r.saleId, place });
    }

    if (r.saleId) {
      const total = (spendBySale.get(r.saleId) ?? 0) + (Number(r.amount) || 0);
      spendBySale.set(r.saleId, total);
      if (total > bestSpend) bestSpend = total;
      if (total >= LAKEFRONT_HAUL_TARGET_DOLLARS && !lakefrontDone.has(r.saleId)) {
        lakefrontDone.add(r.saleId);
        out.candidates.push({ stampKey: 'LAKEFRONT_HAUL', dedupeKey: `LAKEFRONT_HAUL:${r.saleId}`, earnedAt: r.createdAt, saleId: r.saleId, place });
      }
    }
  }

  out.progress.TREASURE_HUNTER = {
    current: Math.min(orders.size, TREASURE_HUNTER_TARGET),
    target: TREASURE_HUNTER_TARGET,
    label: 'purchases',
  };
  out.progress.LAKEFRONT_HAUL = {
    current: Math.min(Math.floor(bestSpend), LAKEFRONT_HAUL_TARGET_DOLLARS),
    target: LAKEFRONT_HAUL_TARGET_DOLLARS,
    label: 'dollars at your biggest sale',
  };
  return out;
}

async function evalReviews(userId: string): Promise<EvalOutput> {
  const out: EvalOutput = { candidates: [], progress: {} };
  // Only APPROVED reviews count: RAPID/BULK-flagged reviews wait in PENDING moderation.
  const r: any = await prisma.review.findFirst({
    where: { userId, moderationStatus: 'APPROVED' },
    orderBy: { createdAt: 'asc' },
    select: { saleId: true, createdAt: true, sale: { select: { city: true, state: true, zip: true } } },
  });
  if (r) {
    out.candidates.push({ stampKey: 'STORYTELLER', dedupeKey: 'STORYTELLER', earnedAt: r.createdAt, saleId: r.saleId, place: placeInfo(r.sale) });
  }
  return out;
}

async function evalFavorites(userId: string): Promise<EvalOutput> {
  const out: EvalOutput = { candidates: [], progress: {} };
  const where = { userId, itemId: { not: null } };
  const count: number = await prisma.favorite.count({ where });
  out.progress.ITEM_KEEPER = { current: Math.min(count, ITEM_KEEPER_TARGET), target: ITEM_KEEPER_TARGET, label: 'saved items' };
  if (count >= ITEM_KEEPER_TARGET) {
    const tenth: any = await prisma.favorite.findFirst({
      where,
      orderBy: { createdAt: 'asc' },
      skip: ITEM_KEEPER_TARGET - 1,
      select: { createdAt: true },
    });
    out.candidates.push({ stampKey: 'ITEM_KEEPER', dedupeKey: 'ITEM_KEEPER', earnedAt: tenth?.createdAt ?? new Date() });
  }
  return out;
}

async function evalHauls(userId: string): Promise<EvalOutput> {
  const out: EvalOutput = { candidates: [], progress: {} };
  const hauls: any[] = await prisma.uGCPhoto.findMany({
    where: { userId, isHaulPost: true, status: 'APPROVED' },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: { saleId: true, likesCount: true, createdAt: true, updatedAt: true },
  });
  if (hauls.length > 0) {
    out.candidates.push({ stampKey: 'HAUL_CURATOR', dedupeKey: 'HAUL_CURATOR', earnedAt: hauls[0].createdAt, saleId: hauls[0].saleId });
  }
  const best = hauls.reduce((m, h) => Math.max(m, h.likesCount || 0), 0);
  out.progress.CROWD_FAVORITE = { current: Math.min(best, CROWD_FAVORITE_TARGET), target: CROWD_FAVORITE_TARGET, label: 'likes on your top haul' };
  const popular = hauls.find((h) => (h.likesCount || 0) >= CROWD_FAVORITE_TARGET);
  if (popular) {
    out.candidates.push({ stampKey: 'CROWD_FAVORITE', dedupeKey: 'CROWD_FAVORITE', earnedAt: popular.updatedAt ?? popular.createdAt, saleId: popular.saleId });
  }
  return out;
}

async function evalGuides(userId: string): Promise<EvalOutput> {
  const out: EvalOutput = { candidates: [], progress: {} };
  // The guide-publication sink (100 XP or $1) is recorded as a BoostPurchase; there is no
  // separate guide table, so a non-refunded GUIDE_PUBLICATION purchase is the publication.
  const g: any = await prisma.boostPurchase.findFirst({
    where: { userId, boostType: 'GUIDE_PUBLICATION', refundedAt: null, status: { notIn: ['REFUNDED', 'FAILED', 'PENDING'] as any } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (g) out.candidates.push({ stampKey: 'COMMUNITY_GUIDE', dedupeKey: 'COMMUNITY_GUIDE', earnedAt: g.createdAt });
  return out;
}

async function evalReferrals(userId: string): Promise<EvalOutput> {
  const out: EvalOutput = { candidates: [], progress: {} };
  const rewards: any[] = await prisma.referralReward.findMany({
    where: { referrerId: userId, fraudReviewStatus: { in: ['CLEAR', 'APPROVED'] } },
    select: { referredUserId: true },
    take: 500,
  });
  for (const rw of rewards) {
    if (!rw.referredUserId || rw.referredUserId === userId) continue;
    const first: any = await prisma.purchase.findFirst({
      where: {
        userId: rw.referredUserId,
        status: { in: PURCHASE_OK_STATUSES },
        isTestTransaction: false,
        source: { not: 'POS' },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, saleId: true },
    });
    if (first) {
      out.candidates.push({
        stampKey: 'FRIEND_FINDER',
        dedupeKey: `FRIEND_FINDER:${rw.referredUserId}`,
        earnedAt: first.createdAt,
        saleId: first.saleId,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Apply: idempotently persist candidates, then advance milestones
// ---------------------------------------------------------------------------

export interface UnlockedStamp {
  id: string;
  key: string;
  name: string;
  icon: string;
  earnedAt: Date;
  placeLabel: string | null;
  saleId: string | null;
}

export interface UnlockedMilestone {
  milestone: number;
  badgeType: string;
  name: string;
  cosmetic: string;
}

export interface EvaluationResult {
  newStamps: UnlockedStamp[];
  newMilestones: UnlockedMilestone[];
  progress: Partial<Record<PassportStampKey, ProgressInfo>>;
}

const EMPTY_RESULT: EvaluationResult = { newStamps: [], newMilestones: [], progress: {} };

function defFor(key: string): PassportStampDef | undefined {
  return PASSPORT_STAMPS.find((s) => s.key === key);
}

/**
 * Evaluate the requested scopes and persist any stamp that is earned but not yet recorded.
 * Never throws (returns an empty result on failure).
 */
export async function evaluatePassport(userId: string, scopes: EvalScope[] | 'all' = 'all'): Promise<EvaluationResult> {
  try {
    const now = new Date();
    const wanted = new Set<EvalScope>(scopes === 'all' ? ALL_SCOPES : scopes);

    const runs: Promise<EvalOutput>[] = [];
    if (wanted.has('attendance')) runs.push(evalAttendance(userId, now));
    if (wanted.has('purchases')) runs.push(evalPurchases(userId));
    if (wanted.has('reviews')) runs.push(evalReviews(userId));
    if (wanted.has('favorites')) runs.push(evalFavorites(userId));
    if (wanted.has('hauls')) runs.push(evalHauls(userId));
    if (wanted.has('guides')) runs.push(evalGuides(userId));
    if (wanted.has('referrals')) runs.push(evalReferrals(userId));

    // One failing evaluator must not block the others.
    const settled = await Promise.allSettled(runs);
    const candidates: Candidate[] = [];
    const progress: EvaluationResult['progress'] = {};
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        candidates.push(...s.value.candidates);
        Object.assign(progress, s.value.progress);
      } else {
        console.error(`[loyalty] Sale Passport evaluator failed for user ${userId}:`, s.reason);
      }
    }

    const existingStamps: any[] = await prisma.shopperPassportStamp.findMany({
      where: { userId },
      select: { stampKey: true, dedupeKey: true },
    });
    const existingKeys = new Set<string>(existingStamps.map((r) => r.dedupeKey));
    const collected = new Set<string>(
      existingStamps.map((r) => r.stampKey).filter((k) => PASSPORT_STAMP_KEYS.includes(k))
    );

    const newStamps: UnlockedStamp[] = [];
    let anyFresh = false;
    for (const c of candidates) {
      if (existingKeys.has(c.dedupeKey)) continue;
      existingKeys.add(c.dedupeKey);
      const fresh = now.getTime() - c.earnedAt.getTime() <= FRESH_WINDOW_MS;
      try {
        const row: any = await prisma.shopperPassportStamp.create({
          data: {
            userId,
            stampKey: c.stampKey,
            dedupeKey: c.dedupeKey,
            saleId: c.saleId ?? null,
            cityKey: c.place?.cityKey ?? null,
            regionKey: c.place?.regionKey ?? null,
            placeLabel: c.place?.placeLabel ?? null,
            earnedAt: c.earnedAt,
            // Retroactive stamps appear in the grid silently; only fresh ones raise a toast.
            seenAt: fresh ? null : now,
          },
        });
        collected.add(c.stampKey);
        if (fresh) anyFresh = true;
        const def = defFor(c.stampKey);
        newStamps.push({
          id: row?.id ?? '',
          key: c.stampKey,
          name: def?.name ?? c.stampKey,
          icon: def?.icon ?? '•',
          earnedAt: c.earnedAt,
          placeLabel: c.place?.placeLabel ?? null,
          saleId: c.saleId ?? null,
        });
      } catch (err) {
        // A concurrent request already recorded it: that is exactly the idempotent outcome.
        if (!isUniqueViolation(err)) throw err;
      }
    }

    const newMilestones = await advancePassportMilestones(userId, collected.size, anyFresh);
    return { newStamps, newMilestones, progress };
  } catch (error) {
    console.error(`[loyalty] Sale Passport evaluation failed for user ${userId}:`, error);
    return { ...EMPTY_RESULT };
  }
}

async function advancePassportMilestones(userId: string, distinctCollected: number, fresh: boolean): Promise<UnlockedMilestone[]> {
  const existing: any[] = await prisma.stampMilestone.findMany({
    where: { userId, milestone: { in: PASSPORT_MILESTONE_VALUES } },
    select: { milestone: true },
  });
  const have = new Set<number>(existing.map((m) => m.milestone));
  const created: UnlockedMilestone[] = [];
  const now = new Date();
  for (const def of PASSPORT_MILESTONES) {
    if (distinctCollected < def.milestone || have.has(def.milestone)) continue;
    try {
      await prisma.stampMilestone.create({
        data: { userId, milestone: def.milestone, badgeType: def.badgeType, seenAt: fresh ? null : now },
      });
      created.push({ milestone: def.milestone, badgeType: def.badgeType, name: def.name, cosmetic: def.cosmetic });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// Award entry points (event hooks call these)
// ---------------------------------------------------------------------------

/**
 * Award a stamp for an action (ATTEND_SALE, MAKE_PURCHASE, WRITE_REVIEW, REFER_FRIEND) and
 * return what it unlocked in the Sale Passport. Never throws.
 *
 * refId (optional but recommended): a stable id for this exact action (purchase id, sale id,
 * review id, referred user id). When given, the legacy counter increment is idempotent, so a
 * webhook retry cannot double-count. Without it the legacy counter behaves as before.
 */
export async function awardStampDetailed(
  userId: string,
  type: string,
  saleId?: string,
  refId?: string
): Promise<EvaluationResult> {
  try {
    let counted = true;
    if (refId) {
      counted = await recordActivityLedger(userId, type, refId, saleId);
    }
    if (counted) {
      const inc = LEGACY_STAMP_INCREMENT[type] ?? 1;
      await prisma.shopperStamp.upsert({
        where: { userId_type: { userId, type } },
        update: { count: { increment: inc } },
        create: { userId, type, count: inc },
      });
      await checkAndAwardMilestone(userId);
    }
    const scopes = SCOPES_BY_LEGACY_TYPE[type];
    if (!scopes) return { ...EMPTY_RESULT };
    return await evaluatePassport(userId, scopes);
  } catch (error) {
    console.error(`Error awarding stamp to user ${userId}:`, error);
    // Fire-and-forget: don't throw, log and continue
    return { ...EMPTY_RESULT };
  }
}

/**
 * Backward-compatible wrapper (existing call site: stripeController purchase confirmation).
 */
export async function awardStamp(
  userId: string,
  type: string,
  saleId?: string,
  refId?: string
): Promise<void> {
  await awardStampDetailed(userId, type, saleId, refId);
}

/** Returns true when this action was newly recorded, false when it was already counted. */
async function recordActivityLedger(userId: string, type: string, refId: string, saleId?: string): Promise<boolean> {
  try {
    const now = new Date();
    await prisma.shopperPassportStamp.create({
      data: {
        userId,
        stampKey: 'ACTIVITY',
        dedupeKey: `ACT:${type}:${refId}`,
        saleId: saleId ?? null,
        earnedAt: now,
        seenAt: now,
      },
    });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

/**
 * When a referred shopper completes a purchase, credit their referrer's Friend Finder stamp
 * (and the legacy REFER_FRIEND tally). Only counts referrals that passed the fraud gate
 * (fraudReviewStatus CLEAR or APPROVED). Idempotent. Never throws.
 */
export async function awardReferralStampForReferee(referredUserId: string): Promise<void> {
  try {
    const reward: any = await prisma.referralReward.findFirst({
      where: { referredUserId, fraudReviewStatus: { in: ['CLEAR', 'APPROVED'] } },
      select: { referrerId: true },
    });
    if (!reward || !reward.referrerId || reward.referrerId === referredUserId) return;

    const purchase: any = await prisma.purchase.findFirst({
      where: {
        userId: referredUserId,
        status: { in: PURCHASE_OK_STATUSES },
        isTestTransaction: false,
        source: { not: 'POS' },
      },
      select: { id: true },
    });
    if (!purchase) return;

    await awardStampDetailed(reward.referrerId, 'REFER_FRIEND', undefined, referredUserId);
  } catch (error) {
    console.error(`[loyalty] Referral stamp failed for referee ${referredUserId}:`, error);
  }
}

/**
 * Legacy check: lifetime activity tiers (5 / 20 / 50 activity stamps).
 */
async function checkAndAwardMilestone(userId: string): Promise<void> {
  const stamps = await prisma.shopperStamp.findMany({
    where: { userId },
  });

  const totalStamps = stamps.reduce((sum, s) => sum + s.count, 0);

  // Check milestones in order (5, 20, 50)
  const milestoneValues = [5, 20, 50];
  for (const milestone of milestoneValues) {
    if (totalStamps >= milestone) {
      const existingMilestone = await prisma.stampMilestone.findUnique({
        where: { userId_milestone: { userId, milestone } },
      });

      if (!existingMilestone) {
        // Award new milestone
        const badgeType = STAMP_MILESTONES[milestone];
        await prisma.stampMilestone.create({
          data: {
            userId,
            milestone,
            badgeType,
            // Legacy tiers never raise a toast (the Sale Passport tiers do).
            seenAt: new Date(),
          },
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

interface PassportData {
  // Legacy fields (unchanged shape, GET /api/loyalty/passport stays backward compatible)
  stamps: { type: string; count: number }[];
  milestones: { milestone: number; badgeType: string; earnedAt: Date }[];
  totalStamps: number;
  nextMilestone: string;
  stampsToNextMilestone: number;
  // Sale Passport (2026-09-29)
  passport: SalePassport;
}

export interface SalePassport {
  name: string;
  totalSlots: number;
  earnedSlots: number;
  slots: PassportSlot[];
  milestones: PassportMilestoneView[];
  next: { milestone: number; badgeType: string; name: string; stampsToGo: number } | null;
  history: {
    id: string;
    key: string;
    name: string;
    icon: string;
    earnedAt: Date;
    placeLabel: string | null;
    saleId: string | null;
  }[];
  unseen: { stamps: UnlockedStamp[]; milestones: UnlockedMilestone[] };
  activity: { total: number; tier: string | null; nextTierAt: number | null };
}

export interface PassportSlot {
  key: string;
  category: string;
  categoryLabel: string;
  name: string;
  icon: string;
  howToEarn: string;
  repeatable: boolean;
  earned: boolean;
  timesEarned: number;
  firstEarnedAt: Date | null;
  lastEarnedAt: Date | null;
  latestPlaceLabel: string | null;
  latestSaleId: string | null;
  unseen: boolean;
  progress: ProgressInfo | null;
}

export interface PassportMilestoneView {
  milestone: number;
  badgeType: string;
  name: string;
  cosmetic: string;
  earned: boolean;
  earnedAt: Date | null;
  unseen: boolean;
}

/** Throttle for "sync on load" so the global unlock watcher cannot hammer the database. */
const lastFullSync = new Map<string, number>();
const SYNC_TTL_MS = 5 * 60 * 1000;

/**
 * Get shopper's loyalty passport data. Runs a full idempotent evaluation first so stamps for
 * actions with no award hook (favorites, hauls, guides, reservation-flow check-ins) appear.
 */
export async function getPassport(userId: string): Promise<PassportData> {
  const evaluation = await evaluatePassport(userId, 'all');
  lastFullSync.set(userId, Date.now());

  const stamps = await prisma.shopperStamp.findMany({
    where: { userId },
  });

  const milestoneRows: any[] = await prisma.stampMilestone.findMany({
    where: { userId },
    orderBy: { milestone: 'asc' },
  });

  const totalStamps = stamps.reduce((sum, s) => sum + s.count, 0);

  // Legacy next-tier math (5 / 20 / 50)
  const nextMilestoneValue = [5, 20, 50].find((m) => totalStamps < m) || 50;
  const nextMilestone = STAMP_MILESTONES[nextMilestoneValue] || 'GOLD';
  const stampsToNextMilestone = Math.max(0, nextMilestoneValue - totalStamps);

  const stampRows: any[] = await prisma.shopperPassportStamp.findMany({
    where: { userId, stampKey: { in: PASSPORT_STAMP_KEYS } },
    orderBy: { earnedAt: 'asc' },
    take: 1000,
  });

  const slots: PassportSlot[] = PASSPORT_STAMPS.map((def) => {
    const rows = stampRows.filter((r) => r.stampKey === def.key);
    const last = rows.length ? rows[rows.length - 1] : null;
    const progress = evaluation.progress[def.key] ?? null;
    return {
      key: def.key,
      category: def.category,
      categoryLabel: def.categoryLabel,
      name: def.name,
      icon: def.icon,
      howToEarn: def.howToEarn,
      repeatable: def.repeatable,
      earned: rows.length > 0,
      timesEarned: rows.length,
      firstEarnedAt: rows.length ? rows[0].earnedAt : null,
      lastEarnedAt: last ? last.earnedAt : null,
      latestPlaceLabel: last ? last.placeLabel ?? null : null,
      latestSaleId: last ? last.saleId ?? null : null,
      unseen: rows.some((r) => !r.seenAt),
      progress: progress && (rows.length === 0 || def.repeatable) ? progress : null,
    };
  });

  const earnedSlots = slots.filter((s) => s.earned).length;

  const passportMilestoneRows = milestoneRows.filter((m) => PASSPORT_MILESTONE_VALUES.includes(m.milestone));
  const milestoneViews: PassportMilestoneView[] = PASSPORT_MILESTONES.map((def) => {
    const row = passportMilestoneRows.find((m) => m.milestone === def.milestone);
    return {
      milestone: def.milestone,
      badgeType: def.badgeType,
      name: def.name,
      cosmetic: def.cosmetic,
      earned: !!row,
      earnedAt: row ? row.earnedAt : null,
      unseen: !!row && !row.seenAt,
    };
  });

  const nextDef = PASSPORT_MILESTONES.find((m) => earnedSlots < m.milestone) ?? null;

  const history = [...stampRows]
    .sort((a, b) => b.earnedAt.getTime() - a.earnedAt.getTime())
    .slice(0, 24)
    .map((r) => ({
      id: r.id,
      key: r.stampKey,
      name: defFor(r.stampKey)?.name ?? r.stampKey,
      icon: defFor(r.stampKey)?.icon ?? '•',
      earnedAt: r.earnedAt,
      placeLabel: r.placeLabel ?? null,
      saleId: r.saleId ?? null,
    }));

  const legacyTierRows = milestoneRows.filter((m) => !PASSPORT_MILESTONE_VALUES.includes(m.milestone));
  const legacyTier = legacyTierRows.length ? legacyTierRows[legacyTierRows.length - 1].badgeType : null;
  const nextLegacyTier = [5, 20, 50].find((m) => totalStamps < m) ?? null;

  const passport: SalePassport = {
    name: 'Sale Passport',
    totalSlots: PASSPORT_STAMPS.length,
    earnedSlots,
    slots,
    milestones: milestoneViews,
    next: nextDef
      ? { milestone: nextDef.milestone, badgeType: nextDef.badgeType, name: nextDef.name, stampsToGo: nextDef.milestone - earnedSlots }
      : null,
    history,
    unseen: buildUnseen(stampRows, passportMilestoneRows),
    activity: { total: totalStamps, tier: legacyTier, nextTierAt: nextLegacyTier },
  };

  return {
    stamps: stamps.map((s) => ({ type: s.type, count: s.count })),
    milestones: milestoneRows
      .filter((m) => !PASSPORT_MILESTONE_VALUES.includes(m.milestone))
      .map((m) => ({
        milestone: m.milestone,
        badgeType: m.badgeType,
        earnedAt: m.earnedAt,
      })),
    totalStamps,
    nextMilestone,
    stampsToNextMilestone,
    passport,
  };
}

function buildUnseen(stampRows: any[], milestoneRows: any[]): { stamps: UnlockedStamp[]; milestones: UnlockedMilestone[] } {
  return {
    stamps: stampRows
      .filter((r) => !r.seenAt)
      .map((r) => ({
        id: r.id,
        key: r.stampKey,
        name: defFor(r.stampKey)?.name ?? r.stampKey,
        icon: defFor(r.stampKey)?.icon ?? '•',
        earnedAt: r.earnedAt,
        placeLabel: r.placeLabel ?? null,
        saleId: r.saleId ?? null,
      })),
    milestones: milestoneRows
      .filter((m) => !m.seenAt)
      .map((m) => {
        const def = PASSPORT_MILESTONES.find((d) => d.milestone === m.milestone);
        return {
          milestone: m.milestone,
          badgeType: m.badgeType,
          name: def?.name ?? m.badgeType,
          cosmetic: def?.cosmetic ?? '',
        };
      }),
  };
}

/**
 * Lightweight read for the global unlock watcher: stamps/milestones earned but not yet
 * shown as a toast. With sync=true it first re-evaluates (throttled to once per 5 minutes
 * per user) so unlocks from actions with no hook still surface.
 */
export async function getUnseenUnlocks(
  userId: string,
  opts: { sync?: boolean } = {}
): Promise<{ stamps: UnlockedStamp[]; milestones: UnlockedMilestone[] }> {
  try {
    if (opts.sync) {
      const last = lastFullSync.get(userId) ?? 0;
      if (Date.now() - last > SYNC_TTL_MS) {
        lastFullSync.set(userId, Date.now());
        await evaluatePassport(userId, 'all');
      }
    }
    const stampRows: any[] = await prisma.shopperPassportStamp.findMany({
      where: { userId, stampKey: { in: PASSPORT_STAMP_KEYS }, seenAt: null },
      orderBy: { earnedAt: 'asc' },
      take: 50,
    });
    const milestoneRows: any[] = await prisma.stampMilestone.findMany({
      where: { userId, milestone: { in: PASSPORT_MILESTONE_VALUES }, seenAt: null },
      orderBy: { milestone: 'asc' },
    });
    return buildUnseen(stampRows, milestoneRows);
  } catch (error) {
    console.error(`[loyalty] getUnseenUnlocks failed for user ${userId}:`, error);
    return { stamps: [], milestones: [] };
  }
}

/**
 * Mark unlock toasts as shown. Scoped to userId so one shopper can never touch another's rows.
 */
export async function markPassportSeen(
  userId: string,
  input: { all?: boolean; stampIds?: string[]; milestones?: number[] }
): Promise<{ stampsMarked: number; milestonesMarked: number }> {
  const now = new Date();
  const stampWhere: any = { userId, seenAt: null };
  const milestoneWhere: any = { userId, seenAt: null, milestone: { in: PASSPORT_MILESTONE_VALUES } };

  if (!input.all) {
    const ids = Array.isArray(input.stampIds) ? input.stampIds.filter((x) => typeof x === 'string').slice(0, 100) : [];
    const ms = Array.isArray(input.milestones)
      ? input.milestones.filter((x) => PASSPORT_MILESTONE_VALUES.includes(x))
      : [];
    stampWhere.id = { in: ids };
    milestoneWhere.milestone = { in: ms };
  }

  const stampsRes: any = await prisma.shopperPassportStamp.updateMany({ where: stampWhere, data: { seenAt: now } });
  const msRes: any = await prisma.stampMilestone.updateMany({ where: milestoneWhere, data: { seenAt: now } });
  return { stampsMarked: stampsRes?.count ?? 0, milestonesMarked: msRes?.count ?? 0 };
}

/**
 * Check if user has active Hunt Pass and if item is within early access embargo
 */
export async function checkEarlyAccess(userId: string, itemId: string): Promise<boolean> {
  // If item has no early access embargo, it's publicly visible
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { earlyAccessUntil: true },
  });

  if (!item?.earlyAccessUntil) {
    return true; // Item is not embargoed, visible to all
  }

  // Check if current time is before embargo end
  const now = new Date();
  if (now >= item.earlyAccessUntil) {
    return true; // Embargo expired, item is publicly visible
  }

  // Item is embargoed; check if user has active Hunt Pass
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { huntPassActive: true, huntPassExpiry: true },
  });

  if (!user) {
    return false;
  }

  // User has early access if Hunt Pass is active and not expired
  return user.huntPassActive && (!user.huntPassExpiry || user.huntPassExpiry > now);
}
