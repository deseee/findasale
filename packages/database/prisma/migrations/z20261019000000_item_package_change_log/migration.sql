-- Package change log (2026-10-19): record every change to an item's weight, dimensions, package type, confirmed flag and estimate source.
--
-- WHY: Patrick's Jones Smoke Shop sign showed no weight or dimensions although he had weighed and measured it, and nothing in the
-- system could say when or what cleared them. A database trigger catches every writer (API, jobs, scripts, manual SQL), so a lost
-- weight is traceable to a time and a statement.
--
-- SAFETY: additive. New table, new function, new trigger. No existing data changes. Idempotent (IF NOT EXISTS / OR REPLACE).
CREATE TABLE IF NOT EXISTS "ItemPackageChangeLog" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "itemId" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "oldValues" JSONB,
  "newValues" JSONB,
  "dbUser" TEXT,
  "statement" TEXT,
  CONSTRAINT "ItemPackageChangeLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ItemPackageChangeLog_itemId_changedAt_idx" ON "ItemPackageChangeLog"("itemId", "changedAt");
CREATE INDEX IF NOT EXISTS "ItemPackageChangeLog_changedAt_idx" ON "ItemPackageChangeLog"("changedAt");

CREATE OR REPLACE FUNCTION fas_log_item_package_change() RETURNS trigger AS $$
BEGIN
  IF (OLD."packageWeightOz" IS DISTINCT FROM NEW."packageWeightOz"
   OR OLD."packageLengthIn" IS DISTINCT FROM NEW."packageLengthIn"
   OR OLD."packageWidthIn" IS DISTINCT FROM NEW."packageWidthIn"
   OR OLD."packageHeightIn" IS DISTINCT FROM NEW."packageHeightIn"
   OR OLD."packageType" IS DISTINCT FROM NEW."packageType"
   OR OLD."packageConfirmedByOrganizer" IS DISTINCT FROM NEW."packageConfirmedByOrganizer"
   OR OLD."packageEstimateSource" IS DISTINCT FROM NEW."packageEstimateSource") THEN
    INSERT INTO "ItemPackageChangeLog" ("itemId", "oldValues", "newValues", "dbUser", "statement")
    VALUES (
      NEW."id",
      jsonb_build_object('weightOz', OLD."packageWeightOz", 'lengthIn', OLD."packageLengthIn", 'widthIn', OLD."packageWidthIn", 'heightIn', OLD."packageHeightIn", 'packageType', OLD."packageType", 'confirmed', OLD."packageConfirmedByOrganizer", 'source', OLD."packageEstimateSource"),
      jsonb_build_object('weightOz', NEW."packageWeightOz", 'lengthIn', NEW."packageLengthIn", 'widthIn', NEW."packageWidthIn", 'heightIn', NEW."packageHeightIn", 'packageType', NEW."packageType", 'confirmed', NEW."packageConfirmedByOrganizer", 'source', NEW."packageEstimateSource"),
      session_user,
      left(current_query(), 400)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Item_package_change_log" ON "Item";
CREATE TRIGGER "Item_package_change_log"
  AFTER UPDATE OF "packageWeightOz", "packageLengthIn", "packageWidthIn", "packageHeightIn", "packageType", "packageConfirmedByOrganizer", "packageEstimateSource"
  ON "Item" FOR EACH ROW EXECUTE FUNCTION fas_log_item_package_change();
