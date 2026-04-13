-- Feature #121: Per-sale holdsEnabled toggle
ALTER TABLE "Sale" ADD COLUMN "holdsEnabled" BOOLEAN NOT NULL DEFAULT true;
