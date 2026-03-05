-- X1: Zapier webhook registrations

CREATE TABLE "Webhook" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "url"       TEXT         NOT NULL,
  "events"    TEXT[]       NOT NULL DEFAULT '{}',
  "secret"    TEXT         NOT NULL,
  "isActive"  BOOLEAN      NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Webhook"
  ADD CONSTRAINT "Webhook_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Webhook_userId_isActive_idx" ON "Webhook"("userId", "isActive");
