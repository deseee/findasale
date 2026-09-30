-- Notify Me hardening (2026-09-29)
--
-- WHY (adversarial review, services/notifyMeSenderService.ts):
--   * armedAt: the sender matched items with "since: updatedAt". updatedAt is bumped by the sender's own
--     claim/release, so a retry after a failed send silently LOST the matches. armedAt is written only
--     when the alert is created or re-armed; the sender reads armedAt (falling back to createdAt).
--   * lastCheckedAt: the loader read "take: half ORDER BY createdAt ASC" with no cursor, so old entries
--     that never match starved every newer entry. The sender now examines oldest-checked first and stamps
--     lastCheckedAt.
--   * confirmedAt (SearchNotification only): anonymous email capture is now double opt-in. The sender only
--     emails confirmed entries. NO backfill on purpose: legacy rows were never verified (and the sender was
--     never enabled), so they must not be grandfathered into sending to third-party addresses. A legacy
--     subscriber simply re-submits the form and confirms. Logged-in waitlist entries need no column: they
--     are tied to the account email and confirmed by definition.
--   * expiredAt (SearchNotification only): entries age out after 90 days (deactivated, not deleted).
--     expiredAt separates "expired, the person may re-add" from an opt-out, which stays out.
--
-- SAFETY: additive only. Nullable columns, no DROP, no data rewrite, no backfill (armedAt is backfilled
-- lazily in code as COALESCE(armedAt, createdAt)). Fully idempotent: every statement uses IF NOT EXISTS,
-- so re-running is a no-op. Apply BEFORE deploying the code (the sender selects these columns).
--
-- Down migration (roll the code back first; it reads these columns):
--   DROP INDEX IF EXISTS "SearchNotification_active_confirmed_notified_checked_idx";
--   DROP INDEX IF EXISTS "ShopperWaitlistEntry_active_notified_checked_idx";
--   ALTER TABLE "SearchNotification" DROP COLUMN IF EXISTS "expiredAt", DROP COLUMN IF EXISTS "confirmedAt",
--     DROP COLUMN IF EXISTS "lastCheckedAt", DROP COLUMN IF EXISTS "armedAt";
--   ALTER TABLE "ShopperWaitlistEntry" DROP COLUMN IF EXISTS "lastCheckedAt", DROP COLUMN IF EXISTS "armedAt";

-- AlterTable: ShopperWaitlistEntry
ALTER TABLE "ShopperWaitlistEntry" ADD COLUMN IF NOT EXISTS "armedAt" TIMESTAMP(3);
ALTER TABLE "ShopperWaitlistEntry" ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP(3);

-- AlterTable: SearchNotification
ALTER TABLE "SearchNotification" ADD COLUMN IF NOT EXISTS "armedAt" TIMESTAMP(3);
ALTER TABLE "SearchNotification" ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP(3);
ALTER TABLE "SearchNotification" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);
ALTER TABLE "SearchNotification" ADD COLUMN IF NOT EXISTS "expiredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShopperWaitlistEntry_active_notified_checked_idx" ON "ShopperWaitlistEntry"("isActive", "notifiedAt", "lastCheckedAt");
CREATE INDEX IF NOT EXISTS "SearchNotification_active_confirmed_notified_checked_idx" ON "SearchNotification"("isActive", "confirmedAt", "notifiedAt", "lastCheckedAt");
