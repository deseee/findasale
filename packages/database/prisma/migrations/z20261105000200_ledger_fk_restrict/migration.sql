-- Ledger foreign keys: RESTRICT instead of CASCADE (2026-11-05, database schema review 2026-11-04 items #3, #4).
--
-- WHAT: deleting a parent row (user, sale, consignor, workspace, booth, hub, settlement) must never silently delete
-- money records. These FKs become ON DELETE RESTRICT; HoldInvoice.shopperUserId becomes ON DELETE SET NULL (the
-- invoice is kept when a shopper deletes their account; the column is already nullable).
--   HoldInvoice.shopperUserId -> User            CASCADE -> SET NULL
--   HoldInvoice.organizerUserId -> User          CASCADE -> RESTRICT
--   HoldInvoice.saleId -> Sale                   CASCADE -> RESTRICT
--   ConsignorPayout.consignorId -> Consignor     CASCADE -> RESTRICT
--   ConsignorPayoutItem.consignorId -> Consignor CASCADE -> RESTRICT
--   ConsignorSettlementBatch.workspaceId -> OrganizerWorkspace CASCADE -> RESTRICT
--   VendorBoothPayout.vendorBoothId -> VendorBooth            CASCADE -> RESTRICT
--   VendorBoothFeeCharge.vendorBoothId -> VendorBooth         CASCADE -> RESTRICT
--   BoothCartTransaction.hubId -> SaleHub        CASCADE -> RESTRICT
--   HubOwnerShareManualPayout.hubId -> SaleHub   CASCADE -> RESTRICT
--   SaleSettlement.saleId -> Sale                CASCADE -> RESTRICT
--   ClientPayout.settlementId -> SaleSettlement  CASCADE -> RESTRICT
--   SaleTransaction.saleId -> Sale               CASCADE -> RESTRICT
-- ON UPDATE actions are unchanged (NO ACTION on HoldInvoice, CASCADE elsewhere: what schema.prisma already declares).
--
-- CODE THAT SHIPS WITH THIS (same commit): every hard-delete path that could reach these rows was audited.
-- userController.deleteAccount and adminController.purgeUser now refuse cleanly (services/ledgerDeletionGuards.ts)
-- instead of hitting a raw FK error; workspaceController.deleteWorkspace also checks settlement batches;
-- jobs/pruneScrapedSales.ts skips any sale holding an invoice, settlement, sale transaction or donation.
-- Sale, consignor, booth and hub deletes are already soft deletes or already guarded.
--
-- LOCKING: each ALTER briefly takes a lock on the table and its parent; re-adding the FK validates existing rows,
-- which all already satisfy it (same columns, same parents). Tables are small.
--
-- PRE-CHECK (production): confirm the constraint names this migration drops exist (13 rows expected):
--   SELECT conrelid::regclass, conname, confdeltype FROM pg_constraint WHERE contype = 'f' AND conname IN (
--     'HoldInvoice_shopperUserId_fkey','HoldInvoice_organizerUserId_fkey','HoldInvoice_saleId_fkey',
--     'ConsignorPayout_consignorId_fkey','ConsignorPayoutItem_consignorId_fkey','ConsignorSettlementBatch_workspaceId_fkey',
--     'VendorBoothPayout_vendorBoothId_fkey','VendorBoothFeeCharge_vendorBoothId_fkey','BoothCartTransaction_hubId_fkey',
--     'HubOwnerShareManualPayout_hubId_fkey','SaleSettlement_saleId_fkey','ClientPayout_settlementId_fkey','SaleTransaction_saleId_fkey');
--
-- ROLLBACK: re-run the same DROP/ADD pairs with ON DELETE CASCADE (and revert schema.prisma + the guard code).

ALTER TABLE "HoldInvoice" DROP CONSTRAINT IF EXISTS "HoldInvoice_shopperUserId_fkey";
ALTER TABLE "HoldInvoice" ADD CONSTRAINT "HoldInvoice_shopperUserId_fkey" FOREIGN KEY ("shopperUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "HoldInvoice" DROP CONSTRAINT IF EXISTS "HoldInvoice_organizerUserId_fkey";
ALTER TABLE "HoldInvoice" ADD CONSTRAINT "HoldInvoice_organizerUserId_fkey" FOREIGN KEY ("organizerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "HoldInvoice" DROP CONSTRAINT IF EXISTS "HoldInvoice_saleId_fkey";
ALTER TABLE "HoldInvoice" ADD CONSTRAINT "HoldInvoice_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "ConsignorPayout" DROP CONSTRAINT IF EXISTS "ConsignorPayout_consignorId_fkey";
ALTER TABLE "ConsignorPayout" ADD CONSTRAINT "ConsignorPayout_consignorId_fkey" FOREIGN KEY ("consignorId") REFERENCES "Consignor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsignorPayoutItem" DROP CONSTRAINT IF EXISTS "ConsignorPayoutItem_consignorId_fkey";
ALTER TABLE "ConsignorPayoutItem" ADD CONSTRAINT "ConsignorPayoutItem_consignorId_fkey" FOREIGN KEY ("consignorId") REFERENCES "Consignor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsignorSettlementBatch" DROP CONSTRAINT IF EXISTS "ConsignorSettlementBatch_workspaceId_fkey";
ALTER TABLE "ConsignorSettlementBatch" ADD CONSTRAINT "ConsignorSettlementBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorBoothPayout" DROP CONSTRAINT IF EXISTS "VendorBoothPayout_vendorBoothId_fkey";
ALTER TABLE "VendorBoothPayout" ADD CONSTRAINT "VendorBoothPayout_vendorBoothId_fkey" FOREIGN KEY ("vendorBoothId") REFERENCES "VendorBooth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorBoothFeeCharge" DROP CONSTRAINT IF EXISTS "VendorBoothFeeCharge_vendorBoothId_fkey";
ALTER TABLE "VendorBoothFeeCharge" ADD CONSTRAINT "VendorBoothFeeCharge_vendorBoothId_fkey" FOREIGN KEY ("vendorBoothId") REFERENCES "VendorBooth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BoothCartTransaction" DROP CONSTRAINT IF EXISTS "BoothCartTransaction_hubId_fkey";
ALTER TABLE "BoothCartTransaction" ADD CONSTRAINT "BoothCartTransaction_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "SaleHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HubOwnerShareManualPayout" DROP CONSTRAINT IF EXISTS "HubOwnerShareManualPayout_hubId_fkey";
ALTER TABLE "HubOwnerShareManualPayout" ADD CONSTRAINT "HubOwnerShareManualPayout_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "SaleHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleSettlement" DROP CONSTRAINT IF EXISTS "SaleSettlement_saleId_fkey";
ALTER TABLE "SaleSettlement" ADD CONSTRAINT "SaleSettlement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientPayout" DROP CONSTRAINT IF EXISTS "ClientPayout_settlementId_fkey";
ALTER TABLE "ClientPayout" ADD CONSTRAINT "ClientPayout_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "SaleSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleTransaction" DROP CONSTRAINT IF EXISTS "SaleTransaction_saleId_fkey";
ALTER TABLE "SaleTransaction" ADD CONSTRAINT "SaleTransaction_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
