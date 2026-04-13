-- Migration: Add POS Cart Multi-Source Invoice Support
-- Date: 2026-04-09
-- Purpose: Enable split cash payment, invoice mode selection, and cart session tracking for POS invoices

-- Add new columns to HoldInvoice table
ALTER TABLE "HoldInvoice"
ADD COLUMN IF NOT EXISTS "invoiceMode" TEXT NOT NULL DEFAULT 'QUICK',
ADD COLUMN IF NOT EXISTS "cashAmountCents" INTEGER,
ADD COLUMN IF NOT EXISTS "cardAmountCents" INTEGER,
ADD COLUMN IF NOT EXISTS "cartSessionId" TEXT;

-- Create index for cart session lookups
CREATE INDEX IF NOT EXISTS "HoldInvoice_cartSessionId_idx" ON "HoldInvoice"("cartSessionId");

-- Add optional foreign key constraint from HoldInvoice.cartSessionId to POSSession.id
-- This is done with ON DELETE SET NULL to avoid cascading deletes if session expires
ALTER TABLE "HoldInvoice"
ADD CONSTRAINT "HoldInvoice_cartSessionId_fkey"
FOREIGN KEY ("cartSessionId")
REFERENCES "POSSession"("id")
ON DELETE SET NULL;
