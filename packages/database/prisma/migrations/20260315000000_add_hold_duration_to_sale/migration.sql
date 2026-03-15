-- Feature #24: Holds-Only Item View — configurable hold duration per sale
-- Default 48h hold; organizer can change per sale
ALTER TABLE "Sale" ADD COLUMN "holdDurationHours" INTEGER NOT NULL DEFAULT 48;
