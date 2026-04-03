-- Migration: Remove unused arrivalRank field from SaleCheckin
-- Approved in S384 audit: field was never read or written by any live code
ALTER TABLE "SaleCheckin" DROP COLUMN IF EXISTS "arrivalRank";
