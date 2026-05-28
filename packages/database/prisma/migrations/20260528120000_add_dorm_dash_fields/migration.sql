-- Feature #411: Dorm Dash Phase 2 — add dorm-specific fields to Sale
ALTER TABLE "Sale" ADD COLUMN "dormBuilding" TEXT;
ALTER TABLE "Sale" ADD COLUMN "moveOutDate" TIMESTAMP(3);
