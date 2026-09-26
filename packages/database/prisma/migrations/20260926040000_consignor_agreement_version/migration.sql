-- Consignor Agreement Versioning -- missing migration found (2026-09-26, session continuity audit)
--
-- The in-app consignor agreement feature (built 2026-09-25, "Add in-app consignor
-- agreement" commit) added ConsignorAgreementVersion and Consignor.agreementAcceptedAt/
-- agreementAcceptedVersion to schema.prisma, but no migration file was ever generated for
-- it -- confirmed by grepping every migrations/*/migration.sql for "ConsignorAgreementVersion"
-- (zero hits) and by a live query against production Postgres (relation does not exist,
-- to_regclass() returns NULL, information_schema.columns has no rows for the two Consignor
-- columns). consignorController.ts's getConsignorPortalData/acceptConsignorAgreement and
-- consignorAgreementService.ts's ensureCurrentAgreementVersion have been live in production
-- since that deploy and would throw P2021 (relation does not exist) the moment any real
-- consignor opened their portal page or tried to accept the agreement -- not yet observed
-- in Railway logs as of this fix (confirmed via get-logs, filter P2021/ConsignorAgreementVersion,
-- zero matches), but a live landmine with 2 real Consignor rows already in production.
--
-- SAFETY: additive only. New table, two new nullable columns on Consignor. No DROP, no
-- ALTER of an existing column's type, no backfill needed (NULL is the correct starting
-- state -- "no agreement version exists yet" / "not yet accepted").
--
-- Down migration (safe at any time -- no other table depends on these):
--   ALTER TABLE "Consignor" DROP COLUMN "agreementAcceptedVersion";
--   ALTER TABLE "Consignor" DROP COLUMN "agreementAcceptedAt";
--   DROP TABLE "ConsignorAgreementVersion";

-- CreateTable
CREATE TABLE "ConsignorAgreementVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsignorAgreementVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsignorAgreementVersion_workspaceId_version_key" ON "ConsignorAgreementVersion"("workspaceId", "version");
CREATE INDEX "ConsignorAgreementVersion_workspaceId_idx" ON "ConsignorAgreementVersion"("workspaceId");

-- AddForeignKey
ALTER TABLE "ConsignorAgreementVersion" ADD CONSTRAINT "ConsignorAgreementVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Consignor -- acceptance tracking (soft reference to a version number, no FK
-- by design, same as schema.prisma's own comment describes -- scoped by workspaceId, not
-- a strict relation)
ALTER TABLE "Consignor" ADD COLUMN     "agreementAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "agreementAcceptedVersion" INTEGER;
