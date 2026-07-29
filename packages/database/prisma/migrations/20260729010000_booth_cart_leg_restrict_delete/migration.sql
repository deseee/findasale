-- S1178 Bug 3: BoothCartLeg.vendorBooth was ON DELETE CASCADE -- a hard-deleted
-- VendorBooth silently destroyed every BoothCartLeg row it ever rang up, including
-- platformFeeCents, hubOwnerShareAmount, stripeTransferId, and the
-- hubOwnerReversalOwedCents/DoneCents compare-and-swap state. No code path in this
-- repo currently performs a hard delete (the only deletion path, deleteVendorBooth,
-- is already a soft delete via deletedAt/status), so this closes a dormant landmine
-- rather than an active incident. See claude_docs/feature-notes/ADR-booth-deletion-ledger-restrict-S1178.md.
--
-- NOT YET APPLIED to Railway or any database -- pending a combined go/no-go with
-- Patrick alongside the 20260729000000_item_booth_eligible migration.

ALTER TABLE "BoothCartLeg" DROP CONSTRAINT "BoothCartLeg_vendorBoothId_fkey";
ALTER TABLE "BoothCartLeg" ADD CONSTRAINT "BoothCartLeg_vendorBoothId_fkey"
  FOREIGN KEY ("vendorBoothId") REFERENCES "VendorBooth"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
