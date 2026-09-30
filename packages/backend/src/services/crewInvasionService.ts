import { prisma } from '../lib/prisma';
import { getIO } from '../lib/socket';
import { awardXp, XP_AWARDS } from './xpService';
import { CREW_INVASION_MIN_ACCOUNT_AGE_DAYS, isQualifiedInvasionMember, filterQualifiedHolders } from './crewQualification';

export { CREW_INVASION_MIN_ACCOUNT_AGE_DAYS, isQualifiedInvasionMember };

// Feature #397: Crew Invasion — flash group discount when ≥4 crew members hold items at the same sale
// Locked spec: threshold=4, discount=10%, duration=45min, scope=held items only,
// organizer opt-in (crewInvasionEnabled), XP=75 per member, cooldown=one per crew per sale,
// code key=saleId+crewId composite, socket emit to all crew members holding at that sale.
//
// The discount itself is redeemed by services/crewInvasionRedemptionService.ts (wired into
// reservationController.markSoldAndCreateInvoice and posController.sendHoldInvoice).
//
// ANTI-ABUSE (2026-09-29). Before this, four throwaway accounts could join one crew, each hold
// one item at an opted-in sale, and collect 75 XP apiece plus a discount code, on repeat with
// fresh crews. XP is spendable (crew creation costs 500), so that is a farm. The trigger now
// only counts QUALIFIED holders and the payout is capped three ways:
//   1. A holder qualifies only if the account is at least CREW_INVASION_MIN_ACCOUNT_AGE_DAYS old,
//      is not flagged fraudSuspect, is not the sale's own organizer, and has at least one prior
//      NON-REFUNDED paid purchase OR a check-in, both at some OTHER sale (activity at the sale
//      being farmed does not count).
//   2. Holders must be distinct users, each with a distinct held item, and holds that the fraud
//      detector scored at or above CREW_INVASION_MAX_HOLD_FRAUD_SCORE do not count.
//   3. XP is paid once per crew per sale (the code row is unique per sale+crew), once per USER per
//      sale (across all their crews), and at most CREW_INVASION_MAX_XP_AWARDS_PER_USER_PER_DAY
//      per user per UTC day. Invasion XP also carries the same 72h spend hold purchases use.
// Non-qualifying holders are not paid XP, but they still get the notification and can use the
// crew discount (the crew already met the qualified threshold).

export const CREW_INVASION_THRESHOLD = 4;
export const CREW_INVASION_DURATION_MS = 45 * 60 * 1000; // 45 minutes
export const CREW_INVASION_DISCOUNT_PCT = 10;
export const CREW_INVASION_XP = 75;
// CREW_INVASION_MIN_ACCOUNT_AGE_DAYS, isQualifiedInvasionMember and filterQualifiedHolders now live in
// ./crewQualification (shared with crewService.checkCrewVisitBonus, which must not pull in socket/xp);
// they are re-exported below so every existing import keeps working.
export const CREW_INVASION_MAX_HOLD_FRAUD_SCORE = 0.85; // matches OrganizerHoldSettings.autoSuspendThreshold default
export const CREW_INVASION_MAX_XP_AWARDS_PER_USER_PER_DAY = 1;
export const CREW_INVASION_XP_HOLD_HOURS = 72; // same spend hold purchases carry (see PointsTransaction.holdUntil)

const DAY_MS = 24 * 60 * 60 * 1000;

function generateInvasionCode(saleId: string, crewId: string): string {
  const salt = Math.random().toString(36).slice(2, 6).toUpperCase();
  const saleTag = saleId.slice(-4).toUpperCase();
  const crewTag = crewId.slice(-4).toUpperCase();
  return `CREW10-${saleTag}${crewTag}-${salt}`;
}

/** Start of the UTC day containing `now`. */
export function startOfUtcDay(now: Date): Date {
  const d = new Date(now.getTime());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Called fire-and-forget from reservationController after a hold is created.
 * Checks if the placing user belongs to a crew that now has ≥4 qualified members holding
 * items at this sale simultaneously, and if so triggers the Crew Invasion.
 */
export async function checkCrewInvasion(saleId: string, triggerUserId: string): Promise<void> {
  try {
    // 1. Verify sale has crewInvasionEnabled
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, crewInvasionEnabled: true, organizer: { select: { userId: true } } },
    });
    if (!sale?.crewInvasionEnabled) return;
    const organizerUserId: string | null = sale.organizer?.userId ?? null;

    // 2. Find all crews the triggering user belongs to
    const userCrewMemberships = await prisma.crewMember.findMany({
      where: { userId: triggerUserId },
      select: { crewId: true },
    });
    if (userCrewMemberships.length === 0) return;

    // 3. For each crew, check if ≥4 qualified members are currently holding items at this sale
    for (const { crewId } of userCrewMemberships) {
      await evaluateCrew(saleId, crewId, organizerUserId);
    }
  } catch (err) {
    console.error('[crewInvasion] checkCrewInvasion error:', err);
  }
}

/** Of `userIds`, those still allowed invasion XP: none yet at this sale, under the daily cap. */
async function filterXpEligible(userIds: string[], saleId: string, now: Date): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const alreadyAtSale = await prisma.pointsTransaction.findMany({
    where: { userId: { in: userIds }, type: 'CREW_INVASION', saleId },
    select: { userId: true },
  });
  const blocked = new Set<string>(alreadyAtSale.map((r) => r.userId));

  const today = await prisma.pointsTransaction.findMany({
    where: { userId: { in: userIds }, type: 'CREW_INVASION', createdAt: { gte: startOfUtcDay(now) } },
    select: { userId: true },
  });
  const perUserToday = new Map<string, number>();
  for (const r of today) perUserToday.set(r.userId, (perUserToday.get(r.userId) ?? 0) + 1);

  const eligible = new Set<string>();
  for (const id of userIds) {
    if (blocked.has(id)) continue;
    if ((perUserToday.get(id) ?? 0) >= CREW_INVASION_MAX_XP_AWARDS_PER_USER_PER_DAY) continue;
    eligible.add(id);
  }
  return eligible;
}

async function evaluateCrew(saleId: string, crewId: string, organizerUserId: string | null): Promise<void> {
  // Check cooldown: one Crew Invasion per crew per sale, full stop
  const existingCode = await prisma.crewInvasionCode.findUnique({
    where: { saleId_crewId: { saleId, crewId } },
  });
  if (existingCode) return; // Already triggered for this crew+sale pair

  // Find all members of this crew
  const crewMembers = await prisma.crewMember.findMany({
    where: { crewId },
    select: { userId: true },
  });
  const crewUserIds = crewMembers.map((m) => m.userId);

  const now = new Date();

  // Active holds at this sale by crew members. Holds the fraud detector flagged do not count.
  const activeHolds = await prisma.itemReservation.findMany({
    where: {
      item: { saleId },
      userId: { in: crewUserIds },
      status: { in: ['PENDING', 'CONFIRMED'] },
      expiresAt: { gt: now },
      fraudScore: { lt: CREW_INVASION_MAX_HOLD_FRAUD_SCORE },
    },
    select: { userId: true, itemId: true },
  });

  // Distinct users, each with a distinct held item (the schema already makes a hold's item unique;
  // this also guards against the same item being counted for two users).
  const seenItems = new Set<string>();
  const holderSet = new Set<string>();
  for (const h of activeHolds) {
    if (organizerUserId && h.userId === organizerUserId) continue;
    if (seenItems.has(h.itemId)) continue;
    seenItems.add(h.itemId);
    holderSet.add(h.userId);
  }
  const holderUserIds = Array.from(holderSet);

  // Cheap pre-check: fewer distinct holders than the threshold can never qualify.
  if (holderUserIds.length < CREW_INVASION_THRESHOLD) return;

  const qualified = await filterQualifiedHolders(holderUserIds, saleId, organizerUserId, now);
  if (qualified.size < CREW_INVASION_THRESHOLD) return;

  // Threshold met — generate invasion code
  const expiresAt = new Date(now.getTime() + CREW_INVASION_DURATION_MS);
  const code = generateInvasionCode(saleId, crewId);

  try {
    await prisma.crewInvasionCode.create({
      data: {
        saleId,
        crewId,
        code,
        discountPct: CREW_INVASION_DISCOUNT_PCT,
        expiresAt,
      },
    });
  } catch (err: any) {
    // Unique constraint violation = another request beat us to it (race condition)
    if (err?.code === 'P2002') return;
    throw err;
  }

  // XP goes only to qualified holders that have not been paid at this sale and are under the daily cap.
  const xpEligible = await filterXpEligible(Array.from(qualified), saleId, now);
  const xpHoldUntil = new Date(now.getTime() + CREW_INVASION_XP_HOLD_HOURS * 60 * 60 * 1000);

  // Emit to each crew member holding at this sale (they can all benefit from the discount)
  const io = getIO();
  const payload = {
    saleId,
    crewId,
    code,
    discountPct: CREW_INVASION_DISCOUNT_PCT,
    expiresAt: expiresAt.toISOString(),
    memberCount: holderUserIds.length,
  };

  await Promise.allSettled(
    holderUserIds.map(async (userId) => {
      const getsXp = xpEligible.has(userId);
      if (getsXp) {
        try {
          await awardXp(userId, 'CREW_INVASION', CREW_INVASION_XP, {
            saleId,
            holdUntil: xpHoldUntil,
            description: 'Crew Invasion',
          });
        } catch (xpErr) {
          console.error(`[crewInvasion] XP award failed for user ${userId}:`, xpErr);
        }
      }

      // Emit to user's personal socket room
      io.to(`user:${userId}`).emit('CREW_INVASION_TRIGGERED', { ...payload, xpAwarded: getsXp });
    })
  );

  console.log(
    `[crewInvasion] Triggered for sale=${saleId} crew=${crewId} — ` +
    `${holderUserIds.length} members notified (${qualified.size} qualified, ${xpEligible.size} paid XP), ` +
    `code=${code}, expires=${expiresAt.toISOString()}`
  );
}
