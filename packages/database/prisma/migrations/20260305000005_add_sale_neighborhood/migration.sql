-- Sprint U2: Add neighborhood slug to Sale for SEO landing pages
-- Nullable — existing sales get NULL, organizers fill in when editing

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "neighborhood" TEXT;

-- Index for the neighborhood landing page query
CREATE INDEX IF NOT EXISTS "Sale_neighborhood_status_idx" ON "Sale" ("neighborhood", "status");
