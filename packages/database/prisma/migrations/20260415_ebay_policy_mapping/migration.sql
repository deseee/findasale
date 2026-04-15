-- CreateTable
CREATE TABLE "EbayPolicyMapping" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "defaultFulfillmentPolicyId" TEXT,
    "defaultReturnPolicyId" TEXT,
    "defaultPaymentPolicyId" TEXT,
    "defaultDescriptionHtml" TEXT,
    "weightTierMappings" JSONB NOT NULL DEFAULT '[]'::JSONB,
    "categoryOverrides" JSONB NOT NULL DEFAULT '[]'::JSONB,
    "heavyOversizedPolicyId" TEXT,
    "fragilePolicyId" TEXT,
    "unknownPolicyId" TEXT,
    "pushAsDraft" BOOLEAN NOT NULL DEFAULT false,
    "merchantLocationSource" TEXT NOT NULL DEFAULT 'SALE_ADDRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EbayPolicyMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EbayPolicyMapping_organizerId_key" ON "EbayPolicyMapping"("organizerId");

-- CreateIndex
CREATE INDEX "EbayPolicyMapping_organizerId_idx" ON "EbayPolicyMapping"("organizerId");

-- AddForeignKey
ALTER TABLE "EbayPolicyMapping" ADD CONSTRAINT "EbayPolicyMapping_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
