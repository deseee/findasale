-- Outward Email Automations: Post-Sale Recap, Review/Testimonial Request, Referral wiring

-- Idempotency guards on existing tables
ALTER TABLE "Sale" ADD COLUMN "recapSentAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "testimonialAskSentAt" TIMESTAMP(3);
ALTER TABLE "Purchase" ADD COLUMN "reviewAskSentAt" TIMESTAMP(3);

-- Testimonial capture model
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizerId" TEXT,
    "saleId" TEXT,
    "rating" INTEGER,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Testimonial_organizerId_idx" ON "Testimonial"("organizerId");
CREATE INDEX "Testimonial_saleId_idx" ON "Testimonial"("saleId");
CREATE INDEX "Testimonial_userId_idx" ON "Testimonial"("userId");
CREATE INDEX "Testimonial_status_idx" ON "Testimonial"("status");

ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Per-user automation throttle log
CREATE TABLE "EmailAutomationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "automationKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAutomationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailAutomationLog_userId_automationKey_sentAt_idx" ON "EmailAutomationLog"("userId", "automationKey", "sentAt");

ALTER TABLE "EmailAutomationLog" ADD CONSTRAINT "EmailAutomationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
