-- AddIndex
-- Missing index for tierGraceCronJob slow query (FINDASALE-NODEJS-33)
-- schema.prisma declares @@index([graceEndAt, graceTierBefore]) but no prior migration created it.
-- This index makes the daily 2am WHERE graceEndAt <= now AND graceTierBefore IS NOT NULL fast.
CREATE INDEX IF NOT EXISTS "Organizer_graceEndAt_graceTierBefore_idx" ON "Organizer"("graceEndAt", "graceTierBefore");
