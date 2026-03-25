-- Feature #84: Approach Notes — notification tracking for day-of sale alerts

CREATE TABLE IF NOT EXISTS "PushNotificationLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushNotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PushNotificationLog_userId_idx" ON "PushNotificationLog"("userId");
CREATE INDEX IF NOT EXISTS "PushNotificationLog_sentAt_idx" ON "PushNotificationLog"("sentAt");

ALTER TABLE "PushNotificationLog" ADD CONSTRAINT "PushNotificationLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
