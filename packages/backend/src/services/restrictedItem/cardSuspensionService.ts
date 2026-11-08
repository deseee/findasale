/**
 * Organizer card-payment suspension (2026-11-06). Admin-only writers of Organizer.cardPaymentsSuspended*.
 * Raw SQL because lib/prisma.ts strips these columns from every Prisma Organizer write (itemWriteHooks.ts).
 * Every set / clear writes a RestrictedItemAuditLog row (SUSPENSION_SET / SUSPENSION_CLEARED) in the same transaction.
 */
import type { RawSqlClient } from './restrictedClassStore';

export interface SuspensionTxClient extends RawSqlClient {
  $transaction<T>(fn: (tx: RawSqlClient) => Promise<T>): Promise<T>;
}

export interface SuspensionState {
  organizerId: string;
  cardPaymentsSuspendedAt: Date | null;
  cardPaymentsSuspendedReason: string | null;
  cardPaymentsSuspendedById: string | null;
}

export async function setOrganizerCardSuspension(
  db: SuspensionTxClient,
  params: { organizerId: string; suspend: boolean; reason: string; adminUserId: string },
): Promise<SuspensionState | null> {
  const reason = params.reason.slice(0, 500);
  return db.$transaction(async (tx) => {
    const before = await tx.$queryRaw<Array<{ cardPaymentsSuspendedAt: Date | null }>>`
      SELECT "cardPaymentsSuspendedAt" FROM "Organizer" WHERE "id" = ${params.organizerId} FOR UPDATE
    `;
    if (before.length === 0) return null;
    const wasSuspended = !!before[0].cardPaymentsSuspendedAt;
    if (params.suspend) {
      await tx.$executeRaw`
        UPDATE "Organizer" SET "cardPaymentsSuspendedAt" = COALESCE("cardPaymentsSuspendedAt", NOW()),
          "cardPaymentsSuspendedReason" = ${reason}, "cardPaymentsSuspendedById" = ${params.adminUserId}
        WHERE "id" = ${params.organizerId}
      `;
    } else {
      await tx.$executeRaw`
        UPDATE "Organizer" SET "cardPaymentsSuspendedAt" = NULL, "cardPaymentsSuspendedReason" = NULL,
          "cardPaymentsSuspendedById" = NULL
        WHERE "id" = ${params.organizerId}
      `;
    }
    const kind = params.suspend ? 'SUSPENSION_SET' : 'SUSPENSION_CLEARED';
    await tx.$executeRaw`
      INSERT INTO "RestrictedItemAuditLog" ("kind", "organizerId", "source", "actorUserId", "detail")
      VALUES (${kind}, ${params.organizerId}, 'ADMIN', ${params.adminUserId},
              ${JSON.stringify({ reason, wasSuspended })}::jsonb)
    `;
    const after = await tx.$queryRaw<SuspensionState[]>`
      SELECT "id" AS "organizerId", "cardPaymentsSuspendedAt", "cardPaymentsSuspendedReason", "cardPaymentsSuspendedById"
      FROM "Organizer" WHERE "id" = ${params.organizerId}
    `;
    return after[0] ?? null;
  });
}
