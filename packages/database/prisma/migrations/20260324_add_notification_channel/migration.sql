-- Feature #73: Add channel field to Notification model to categorize notifications
-- "OPERATIONAL" = organizer alerts, payments, account events
-- "DISCOVERY" = sale recommendations, matches, wishlist alerts
ALTER TABLE "Notification" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'OPERATIONAL';

-- Create index for filtering by channel
CREATE INDEX "Notification_userId_channel_idx" ON "Notification"("userId", "channel");
