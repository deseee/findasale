-- AlterTable: add Hunt Pass Stripe billing fields to User
ALTER TABLE "User" ADD COLUMN "huntPassStripeCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN "huntPassStripeSubscriptionId" TEXT;
