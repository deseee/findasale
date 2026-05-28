import { prisma } from '../lib/prisma';
import { getIO } from '../lib/socket';
import { awardXp, XP_AWARDS } from './xpService';

// Feature #397: Crew Invasion — flash group discount when ≥4 crew members hold items at the same sale
// Locked spec: threshold=4, discount=10%, duration=45min, scope=held items only,
// organizer opt-in (crewInvasionEnabled), XP=75 per member, cooldown=one per crew per sale,
// code key=saleId+crewId composite, socket emit to all crew members holding at that sale.

const CREW_INVASION_THRESHOLD = 4;
const CREW_INVASION_DURATION_MS = 45 * 60 * 1000; // 45 minutes
const CREW_INVASION_DISCOUNT_PCT = 10;
const CREW_INVASION_XP = 75;

function generateInvasionCode(saleId: string, crewId: string): string {
  const salt = Math.random().toString(36).slice(2, 6).toUpperCase();
  const saleTag = saleId.slice(-4).toUpperCase();
  const crewTag = crewId.slice(-4).toUpperCase();
  return `CREW10-${saleTag}${crewTag}-${salt}`;
}

/**
 * Called fire-and-forget from reservationController after a hold is created.
 * Checks if the placing user belongs to a crew that now has ≥4 members holding
 * items at this sale simultaneously, and if so triggers the Crew Invasion.
 */
export async function checkCrewInvasion(saleId: string, triggerUserId: string): Promise<void> {
  try {
    // 1. Verify sale has crewInvasionEnabled
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, crewInvasionEnabled: true },
    });
    if (!sale?.crewInvasionEnabled) return;

    // 2. Find all crews the triggering user belongs to
    const userCrewMemberships = await prisma.crewMember.findMany({
      where: { userId: triggerUserId },
      select: { crewId: true },
    });
    if (userCrewMemberships.length === 0) return;

    // 3. For each crew, check if ≥4 members are currently holding items at this sale
    for (const { crewId } of userCrewMemberships) {
      await evaluateCrew(saleId, crewId, triggerUserId);
    }
  } catch (err) {
    console.error('[crewInvasion] checkCrewInvasion error:', err);
  }
}

async function evaluateCrew(saleId: string, crewId: string, triggerUserId: string): Promise<void> {
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

  // Count crew members with active holds at this sale
  const activeHolders = await prisma.itemReservation.findMany({
    where: {
      item: { saleId },
      userId: { in: crewUserIds },
      status: { in: ['PENDING', 'CONFIRMED'] },
      expiresAt: { gt: new Date() },
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  if (activeHolders.length < CREW_INVASION_THRESHOLD) return;

  // Threshold met — generate invasion code
  const expiresAt = new Date(Date.now() + CREW_INVASION_DURATION_MS);
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

  const holderUserIds = activeHolders.map((h) => h.userId);

  // Award XP and emit socket event to each crew member holding at this sale
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
      // Award 75 XP per spec
      try {
        await awardXp(userId, 'CREW_INVASION', CREW_INVASION_XP, { saleId, crewId });
      } catch (xpErr) {
        console.error(`[crewInvasion] XP award failed for user ${userId}:`, xpErr);
      }

      // Emit to user's personal socket room
      io.to(`user:${userId}`).emit('CREW_INVASION_TRIGGERED', payload);
    })
  );

  console.log(
    `[crewInvasion] Triggered for sale=${saleId} crew=${crewId} — ` +
    `${holderUserIds.length} members notified, code=${code}, expires=${expiresAt.toISOString()}`
  );
}
