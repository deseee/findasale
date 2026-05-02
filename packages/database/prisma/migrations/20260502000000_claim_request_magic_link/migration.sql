-- Feature #361: Magic link email verification for claim requests
ALTER TABLE "ClaimRequest" ADD COLUMN "verificationToken" TEXT;
ALTER TABLE "ClaimRequest" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "ClaimRequest" ADD COLUMN "reviewedBy" TEXT;
CREATE UNIQUE INDEX "ClaimRequest_verificationToken_key" ON "ClaimRequest"("verificationToken");
