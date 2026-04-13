-- Feature #11: Organizer Referral Reciprocal
-- Adds referralDiscountExpiry to Organizer so fee can be waived for 3 months
-- when a verified organizer refers another organizer who signs up and activates.

ALTER TABLE "Organizer" ADD COLUMN "referralDiscountExpiry" TIMESTAMP(3);
