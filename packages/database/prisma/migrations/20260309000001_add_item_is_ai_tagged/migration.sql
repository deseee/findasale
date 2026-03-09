-- B2: Add isAiTagged flag to Item
-- Tracks whether AI (Google Vision + Claude Haiku) generated this item's fields.
-- Used for organizer transparency disclosure and shopper-facing notices.

ALTER TABLE "Item" ADD COLUMN "isAiTagged" BOOLEAN NOT NULL DEFAULT false;
