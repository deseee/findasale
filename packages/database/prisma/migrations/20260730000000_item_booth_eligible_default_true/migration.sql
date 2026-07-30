-- Item.boothEligible default flip false -> true (2026-07-30), per Patrick's decision.
--
-- Context: S1178 (2026-07-29) added boothEligible as a required opt-in gate in
-- addBoothCartItems (vendorBoothCartController.ts) -- no UI or backfill ever set it true,
-- so it blocked every item from every booth cart in practice. Patrick reviewed and
-- decided the gate was unnecessary fluff: ownership + hub-match + item-status checks in
-- the same loop already do the real eligibility work, so the boothEligible `if` block was
-- deleted from addBoothCartItems in this same session. This migration only changes the
-- column's DEFAULT so new rows get true going forward; it does NOT backfill existing rows
-- (their value is now inert since nothing reads it for gating) and does NOT touch the
-- column's type, nullability, or existence -- the field is being kept, not dropped.

ALTER TABLE "Item" ALTER COLUMN "boothEligible" SET DEFAULT true;
