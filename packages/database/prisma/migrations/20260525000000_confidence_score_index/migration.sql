-- Feature #458: Index for minConfidence filter on Organizer.directoryConfidenceScore
-- Columns already exist from 20260519100000_geo_demand_waitlist_confidence
CREATE INDEX IF NOT EXISTS "Organizer_directoryConfidenceScore_idx"
  ON "Organizer"("directoryConfidenceScore");
