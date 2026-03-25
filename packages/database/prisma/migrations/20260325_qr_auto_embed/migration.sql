-- Feature #136: QR Code Auto-Embedding in Photo Exports
-- Add qrEmbedEnabled boolean field to Item table with default true

ALTER TABLE "Item" ADD COLUMN "qrEmbedEnabled" BOOLEAN NOT NULL DEFAULT true;
