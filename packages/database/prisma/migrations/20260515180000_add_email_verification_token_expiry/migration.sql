-- P0-3: Add expiry field for email verification tokens
-- Tokens now expire 24 hours after generation; enforced in authController.ts verifyEmail handler.
ALTER TABLE "User" ADD COLUMN "emailVerificationTokenExpiry" TIMESTAMP(3);
