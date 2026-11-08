-- Restricted-item card blocking (2026-11-06, Finix restricted-item gate).
--
-- WHAT: Item restricted-class columns (classifier output, ratcheted stored class, admin override), Organizer card
-- suspension columns, the RestrictedItemAuditLog table, and two Item triggers:
--   "Item_restricted_class_invalidate" (BEFORE UPDATE): when a classifier input changes (title, description, category,
--     ebayCategoryName, tags, brand) and the same statement did not also write a fresh classification, it sets
--     restrictedClassifiedAt = NULL. Catches EVERY writer (Prisma, raw SQL, jobs, manual SQL). The payment gate
--     (cardPaymentGate.ts) reclassifies a NULL row before deciding, so a stale class can never reach a card decision.
--   "Item_restricted_class_audit" (AFTER UPDATE / AFTER INSERT): writes a RestrictedItemAuditLog CLASSIFICATION_CHANGE
--     row whenever restrictedClass or restrictedClassOverride changes (or an item is created restricted).
--
-- SAFETY: additive only. New enum, new nullable / defaulted columns, new table, new functions and triggers. No existing
-- data is changed: every existing Item gets restrictedClass = 'NONE' and restrictedClassifiedAt = NULL (stale), so the
-- gate classifies it on first payment, and packages/backend/scripts/backfillRestrictedItemClass.ts classifies the rest
-- in batches. ADD COLUMN with a constant DEFAULT is metadata-only on Postgres 11+ (no table rewrite).
-- Idempotent (IF NOT EXISTS / OR REPLACE / DO-block guarded enum).
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS "Item_restricted_class_audit_ins" ON "Item";
--   DROP TRIGGER IF EXISTS "Item_restricted_class_audit" ON "Item";
--   DROP TRIGGER IF EXISTS "Item_restricted_class_invalidate" ON "Item";
--   DROP FUNCTION IF EXISTS fas_item_restricted_class_audit(); DROP FUNCTION IF EXISTS fas_item_restricted_class_invalidate();
--   DROP TABLE IF EXISTS "RestrictedItemAuditLog";
--   ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "cardPaymentsSuspendedAt", DROP COLUMN IF EXISTS "cardPaymentsSuspendedReason",
--     DROP COLUMN IF EXISTS "cardPaymentsSuspendedById";
--   ALTER TABLE "Item" DROP COLUMN IF EXISTS "restrictedClass", ... (the ten restrictedClass* columns);
--   DROP INDEX IF EXISTS "Item_restrictedClassifiedAt_idx"; DROP TYPE IF EXISTS "RestrictedItemClass";
--   Then remove the matching lines from schema.prisma. No other data depends on these.

DO $$ BEGIN
  CREATE TYPE "RestrictedItemClass" AS ENUM ('NONE', 'WEAPON', 'FIREARM_RELATED', 'KNIFE', 'COIN_BULLION_PRECIOUS_METAL', 'JEWELRY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Item"
  ADD COLUMN IF NOT EXISTS "restrictedClass" "RestrictedItemClass" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "restrictedClassAuto" "RestrictedItemClass" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "restrictedClassSource" TEXT,
  ADD COLUMN IF NOT EXISTS "restrictedClassActorId" TEXT,
  ADD COLUMN IF NOT EXISTS "restrictedClassifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "restrictedClassifierVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "restrictedClassOverride" "RestrictedItemClass",
  ADD COLUMN IF NOT EXISTS "restrictedClassOverrideReason" TEXT,
  ADD COLUMN IF NOT EXISTS "restrictedClassOverrideById" TEXT,
  ADD COLUMN IF NOT EXISTS "restrictedClassOverrideAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Item_restrictedClassifiedAt_idx" ON "Item"("restrictedClassifiedAt");

ALTER TABLE "Organizer"
  ADD COLUMN IF NOT EXISTS "cardPaymentsSuspendedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cardPaymentsSuspendedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "cardPaymentsSuspendedById" TEXT;

CREATE TABLE IF NOT EXISTS "RestrictedItemAuditLog" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "kind" TEXT NOT NULL,
  "itemId" TEXT,
  "organizerId" TEXT,
  "oldClass" TEXT,
  "newClass" TEXT,
  "source" TEXT,
  "actorUserId" TEXT,
  "processor" TEXT,
  "itemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "classes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "buyerUserId" TEXT,
  "sessionRef" TEXT,
  "cardAmountCents" INTEGER,
  "cashAmountCents" INTEGER,
  "detail" JSONB,
  CONSTRAINT "RestrictedItemAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RestrictedItemAuditLog_itemId_createdAt_idx" ON "RestrictedItemAuditLog"("itemId", "createdAt");
CREATE INDEX IF NOT EXISTS "RestrictedItemAuditLog_organizerId_createdAt_idx" ON "RestrictedItemAuditLog"("organizerId", "createdAt");
CREATE INDEX IF NOT EXISTS "RestrictedItemAuditLog_kind_createdAt_idx" ON "RestrictedItemAuditLog"("kind", "createdAt");

CREATE OR REPLACE FUNCTION fas_item_restricted_class_invalidate() RETURNS trigger AS $$
BEGIN
  IF (OLD."title" IS DISTINCT FROM NEW."title"
   OR OLD."description" IS DISTINCT FROM NEW."description"
   OR OLD."category" IS DISTINCT FROM NEW."category"
   OR OLD."ebayCategoryName" IS DISTINCT FROM NEW."ebayCategoryName"
   OR OLD."tags" IS DISTINCT FROM NEW."tags"
   OR OLD."brand" IS DISTINCT FROM NEW."brand")
   -- A statement that wrote a fresh classification together with the input change keeps it.
   AND NEW."restrictedClassifiedAt" IS NOT DISTINCT FROM OLD."restrictedClassifiedAt" THEN
    NEW."restrictedClassifiedAt" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Item_restricted_class_invalidate" ON "Item";
CREATE TRIGGER "Item_restricted_class_invalidate"
  BEFORE UPDATE OF "title", "description", "category", "ebayCategoryName", "tags", "brand"
  ON "Item" FOR EACH ROW EXECUTE FUNCTION fas_item_restricted_class_invalidate();

CREATE OR REPLACE FUNCTION fas_item_restricted_class_audit() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."restrictedClass" <> 'NONE' OR NEW."restrictedClassOverride" IS NOT NULL THEN
      INSERT INTO "RestrictedItemAuditLog" ("kind", "itemId", "organizerId", "oldClass", "newClass", "source", "actorUserId", "detail")
      VALUES ('CLASSIFICATION_CHANGE', NEW."id", NEW."organizerId", NULL, NEW."restrictedClass"::text,
              COALESCE(NEW."restrictedClassSource", 'CREATE'), NEW."restrictedClassActorId",
              jsonb_build_object('auto', NEW."restrictedClassAuto"::text, 'override', NEW."restrictedClassOverride"::text,
                                 'version', NEW."restrictedClassifierVersion"));
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."restrictedClass" IS DISTINCT FROM NEW."restrictedClass"
   OR OLD."restrictedClassOverride" IS DISTINCT FROM NEW."restrictedClassOverride" THEN
    INSERT INTO "RestrictedItemAuditLog" ("kind", "itemId", "organizerId", "oldClass", "newClass", "source", "actorUserId", "detail")
    VALUES ('CLASSIFICATION_CHANGE', NEW."id", NEW."organizerId",
            COALESCE(OLD."restrictedClassOverride", OLD."restrictedClass")::text,
            COALESCE(NEW."restrictedClassOverride", NEW."restrictedClass")::text,
            COALESCE(NEW."restrictedClassSource", 'UNKNOWN'), NEW."restrictedClassActorId",
            jsonb_build_object('storedOld', OLD."restrictedClass"::text, 'storedNew', NEW."restrictedClass"::text,
                               'overrideOld', OLD."restrictedClassOverride"::text, 'overrideNew', NEW."restrictedClassOverride"::text,
                               'auto', NEW."restrictedClassAuto"::text, 'version', NEW."restrictedClassifierVersion"));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Item_restricted_class_audit" ON "Item";
CREATE TRIGGER "Item_restricted_class_audit"
  AFTER UPDATE OF "restrictedClass", "restrictedClassOverride"
  ON "Item" FOR EACH ROW EXECUTE FUNCTION fas_item_restricted_class_audit();

DROP TRIGGER IF EXISTS "Item_restricted_class_audit_ins" ON "Item";
CREATE TRIGGER "Item_restricted_class_audit_ins"
  AFTER INSERT ON "Item" FOR EACH ROW EXECUTE FUNCTION fas_item_restricted_class_audit();
