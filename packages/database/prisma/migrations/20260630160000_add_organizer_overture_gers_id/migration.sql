-- AddColumn: Organizer.overtureGersId — Overture Places GERS id (CDLA Permissive 2.0)
-- overtureEnrichmentJob monthly re-sync idempotency key. Nullable, unique.
ALTER TABLE "Organizer" ADD COLUMN "overtureGersId" TEXT;
CREATE UNIQUE INDEX "Organizer_overtureGersId_key" ON "Organizer"("overtureGersId");
