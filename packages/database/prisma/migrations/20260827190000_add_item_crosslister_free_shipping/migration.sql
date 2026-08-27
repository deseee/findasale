-- Crosslister shipping-payer toggle (2026-08-27)
--
-- WHY: a real Mercari listing published with Mercari's own "Offer buyers free shipping?"
-- control left on its default ("Yes" -- seller absorbs cost), costing real money before
-- Patrick manually corrected it (extension/fas-mercari.js had no code touching that
-- control at all). An emergency fix hardcoded every Mercari listing to "No" (buyer pays);
-- this column lets an organizer opt a specific item INTO free shipping instead, per-item,
-- reusable across every crosslister marketplace (Mercari now, Poshmark/Grailed/Vinted
-- later), separate from Item.shippingAvailable/shippingPrice (FindA.Sale's own native-
-- checkout shipping, unrelated to crosslister marketplace listings).
--
-- SAFETY: additive, NOT NULL with a DEFAULT (false -- never default to giving shipping
-- away, same posture as EbayPolicyMapping.freeShippingOptIn), no backfill needed, no
-- existing row affected in behavior.

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "crosslisterFreeShipping" BOOLEAN NOT NULL DEFAULT false;
