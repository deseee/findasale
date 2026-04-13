-- Feature #249: Concurrent Sales Gate — index for active sales query optimization
CREATE INDEX IF NOT EXISTS "Sale_organizerId_status_endDate_idx" ON "Sale"("organizerId", "status", "endDate");
