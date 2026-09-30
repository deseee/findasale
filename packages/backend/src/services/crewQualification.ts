import { prisma } from '../lib/prisma';

// Crew account-qualification rules shared by Crew Invasion (crewInvasionService) and the crew
// check-in bonus (crewService.checkCrewVisitBonus). Kept in its own module, depending on Prisma
// only, so crewService does not have to import the socket/xp stack. Extracted verbatim from
// crewInvasionService.ts on 2026-09-29; crewInvasionService re-exports the public names.

export const CREW_INVASION_MIN_ACCOUNT_AGE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure qualification rule for one holder (see ANTI-ABUSE above). Exported for tests and for crewService.checkCrewVisitBonus.
 * `hasPriorActivity` = a non-refunded paid purchase OR a check-in at a DIFFERENT sale.
 */
export function isQualifiedInvasionMember(params: {
  accountCreatedAt: Date;
  now: Date;
  fraudSuspect: boolean;
  isSaleOrganizer: boolean;
  hasPriorActivity: boolean;
}): boolean {
  if (params.fraudSuspect || params.isSaleOrganizer || !params.hasPriorActivity) return false;
  const ageMs = params.now.getTime() - params.accountCreatedAt.getTime();
  return ageMs >= CREW_INVASION_MIN_ACCOUNT_AGE_DAYS * DAY_MS;
}

/**
 * Of the users currently holding, return those that qualify (account age, no fraud flag, not the
 * organizer, prior real activity elsewhere). Two batched queries, no per-user round trips.
 */
export async function filterQualifiedHolders(
  holderUserIds: string[],
  saleId: string,
  organizerUserId: string | null,
  now: Date
): Promise<Set<string>> {
  if (holderUserIds.length === 0) return new Set();

  const users = await prisma.user.findMany({
    where: { id: { in: holderUserIds } },
    select: { id: true, createdAt: true, fraudSuspect: true },
  });

  const otherSale = { OR: [{ saleId: null }, { saleId: { not: saleId } }] };
  const paid = await prisma.purchase.findMany({
    where: { userId: { in: holderUserIds }, status: 'PAID', refundedAt: null, ...otherSale },
    select: { userId: true },
    distinct: ['userId'],
  });
  const checkedIn = await prisma.saleCheckin.findMany({
    where: { userId: { in: holderUserIds }, saleId: { not: saleId } },
    select: { userId: true },
    distinct: ['userId'],
  });
  const active = new Set<string>();
  for (const r of paid) if (r.userId) active.add(r.userId);
  for (const r of checkedIn) active.add(r.userId);

  const qualified = new Set<string>();
  for (const u of users) {
    if (
      isQualifiedInvasionMember({
        accountCreatedAt: u.createdAt,
        now,
        fraudSuspect: !!u.fraudSuspect,
        isSaleOrganizer: !!organizerUserId && u.id === organizerUserId,
        hasPriorActivity: active.has(u.id),
      })
    ) {
      qualified.add(u.id);
    }
  }
  return qualified;
}
