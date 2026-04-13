-- Add CheckoutAttempt table for abandoned checkout recovery
CREATE TABLE "CheckoutAttempt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "paymentIntent" TEXT NOT NULL,
  "recoveryEmailSent" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CheckoutAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CheckoutAttempt_paymentIntent_key" ON "CheckoutAttempt"("paymentIntent");
CREATE INDEX "CheckoutAttempt_completedAt_recoveryEmailSent_idx" ON "CheckoutAttempt"("completedAt", "recoveryEmailSent");

ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
