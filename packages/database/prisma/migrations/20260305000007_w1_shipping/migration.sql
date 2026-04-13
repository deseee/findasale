-- W1: Shipping workflow — add shippingAvailable + shippingPrice to Item

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "shippingAvailable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "shippingPrice"     DOUBLE PRECISION;