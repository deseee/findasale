-- Sentry NODEJS-10: discoveryService bounding box query (6298ms, 49x)
-- Composite index on status + endDate + lat + lng to support the geo bounding box filter in getPersonalizedFeed
CREATE INDEX IF NOT EXISTS "Sale_status_endDate_lat_lng_idx" ON "Sale"("status", "endDate", "lat", "lng");
