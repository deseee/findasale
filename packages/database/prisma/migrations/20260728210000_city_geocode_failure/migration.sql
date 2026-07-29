-- CityGeocodeFailure: negative cache for city slugs that cannot be geocoded to a centroid.
-- Consumed by packages/backend/src/jobs/cityCoordinateBackfillJob.ts so hopeless slugs
-- (Sale.city typos such as "Burnabt, BC") stop consuming rate-limited Nominatim requests.
CREATE TABLE IF NOT EXISTS "CityGeocodeFailure" (
    "slug" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "permanent" BOOLEAN NOT NULL DEFAULT false,
    "lastReason" TEXT,
    "firstFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CityGeocodeFailure_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX IF NOT EXISTS "CityGeocodeFailure_permanent_idx" ON "CityGeocodeFailure"("permanent");
