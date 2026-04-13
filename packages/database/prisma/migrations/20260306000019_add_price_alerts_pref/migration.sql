-- Add price alerts to notification preferences
-- Existing notificationPrefs records will default to priceAlerts: true
-- This is a data migration that updates the JSON column with a new field

UPDATE "User"
SET "notificationPrefs" = CASE
  WHEN "notificationPrefs" IS NULL THEN '{"priceAlerts": true}'::jsonb
  ELSE "notificationPrefs" || '{"priceAlerts": true}'::jsonb
END
WHERE "notificationPrefs" IS NULL OR ("notificationPrefs"->>'priceAlerts') IS NULL;
