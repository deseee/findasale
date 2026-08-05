-- Feature #595: Saved-Search Desktop Deal Alerts (browser extension)
-- Tracks the last time each saved search was checked for new matches so the
-- extension's polling endpoint (GET /api/saved-searches/check-new) only surfaces
-- items created since the last check, instead of re-notifying the same matches.
ALTER TABLE "SavedSearch" ADD COLUMN "lastNotifiedAt" TIMESTAMP(3);
