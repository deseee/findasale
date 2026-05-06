-- P0-L1: COPPA Compliance — Add age verification field to User model
ALTER TABLE "User" ADD COLUMN "ageVerifiedAt" TIMESTAMP(3);
