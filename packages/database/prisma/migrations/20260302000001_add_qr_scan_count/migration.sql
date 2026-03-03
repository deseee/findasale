-- Migration: add qrScanCount to Sale
-- Phase 10 / Issue #6: QR scan analytics

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "qrScanCount" INTEGER NOT NULL DEFAULT 0;
