-- Migration: add_purchase_pos_fields
-- Adds Stripe Terminal POS support to the Purchase table.
-- All changes are purely additive / permissive — zero risk of data loss.
-- Existing ONLINE purchases remain fully valid (source defaults to 'ONLINE', userId still set).

-- 1. Make userId nullable (POS walk-in buyers have no FindA.Sale account)
ALTER TABLE "Purchase" ALTER COLUMN "userId" DROP NOT NULL;

-- 2. Add source discriminator (ONLINE | POS)
ALTER TABLE "Purchase" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'ONLINE';

-- 3. Add optional buyer email for POS receipt delivery
ALTER TABLE "Purchase" ADD COLUMN "buyerEmail" TEXT;
