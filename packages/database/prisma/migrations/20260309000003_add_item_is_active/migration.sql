-- AlterTable: add isActive field to Item (default true — all existing items remain visible)
ALTER TABLE "Item" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
