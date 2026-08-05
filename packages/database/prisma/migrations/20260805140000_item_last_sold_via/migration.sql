-- Sold-channel observability: track which channel most recently marked an
-- Item SOLD (e.g. 'FB_NATIVE' for the Facebook-native-sold detection cascade
-- added in commit 571ad46f6, extensionController.ts markItemSoldOnFacebook).
--
-- Nullable, additive, no default -- purely observational metadata, not part
-- of the ADR-098 commitItemSale() atomic status guard. Existing rows get
-- NULL and remain unaffected. Currently only the FB-native-sold cascade
-- writes this field; other SOLD-transition call sites (POS, checkout, eBay
-- sync, manual mark-sold) intentionally left untouched in this change.

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "lastSoldVia" TEXT;
