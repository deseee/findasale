-- Add EmailSuppression table
CREATE TABLE "EmailSuppression" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "emailAddress" TEXT NOT NULL UNIQUE,
  "bounceHard" BOOLEAN NOT NULL DEFAULT false,
  "bounceSoft" TIMESTAMP(3),
  "complaintEmail" TIMESTAMP(3),
  "optedOut" TIMESTAMP(3),
  "suppressionReason" TEXT,
  "suppressedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "relatedOrganizerId" TEXT,
  "relatedTouchNumber" INTEGER,
  "resendEventId" TEXT,
  "resendTimestamp" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "EmailSuppression_suppressedAt_idx" ON "EmailSuppression"("suppressedAt");
CREATE INDEX "EmailSuppression_bounceHard_idx" ON "EmailSuppression"("bounceHard");
CREATE INDEX "EmailSuppression_complaintEmail_idx" ON "EmailSuppression"("complaintEmail");
CREATE INDEX "EmailSuppression_optedOut_idx" ON "EmailSuppression"("optedOut");

ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch1SentAt" TIMESTAMP(3);
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch1Opened" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch1OpenedAt" TIMESTAMP(3);
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch1Clicked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch1ClickedAt" TIMESTAMP(3);
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch2SentAt" TIMESTAMP(3);
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch2Opened" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch2OpenedAt" TIMESTAMP(3);
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch2Clicked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch2ClickedAt" TIMESTAMP(3);
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch3SentAt" TIMESTAMP(3);
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch3Opened" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch3OpenedAt" TIMESTAMP(3);
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch3Clicked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch3ClickedAt" TIMESTAMP(3);
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch4SentAt" TIMESTAMP(3);
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch4Opened" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch4OpenedAt" TIMESTAMP(3);
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch4Clicked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "touch4ClickedAt" TIMESTAMP(3);
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "trackingPixelId" TEXT UNIQUE;
ALTER TABLE "DirectoryClaimEmail" ADD COLUMN "trackingToken" TEXT UNIQUE;

CREATE INDEX "DirectoryClaimEmail_emailAddress_idx" ON "DirectoryClaimEmail"("emailAddress");
CREATE INDEX "DirectoryClaimEmail_touch1_tracking_idx" ON "DirectoryClaimEmail"("touch1SentAt", "touch1Opened", "touch1Clicked");
CREATE INDEX "DirectoryClaimEmail_touch4_idx" ON "DirectoryClaimEmail"("touch4SentAt");
