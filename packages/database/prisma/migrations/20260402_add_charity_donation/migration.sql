-- Feature #235: Charity Close + Tax Receipt PDF

-- Create SaleDonation table
CREATE TABLE "SaleDonation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "charityName" TEXT NOT NULL,
    "charityEin" TEXT,
    "charityAddress" TEXT,
    "donationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalEstimatedValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "receiptUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SaleDonation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleDonation_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create DonatedItem table
CREATE TABLE "DonatedItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "donationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "estimatedValue" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DonatedItem_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "SaleDonation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DonatedItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX "SaleDonation_saleId_idx" ON "SaleDonation"("saleId");
CREATE INDEX "SaleDonation_organizerId_idx" ON "SaleDonation"("organizerId");
CREATE INDEX "DonatedItem_donationId_idx" ON "DonatedItem"("donationId");
CREATE INDEX "DonatedItem_itemId_idx" ON "DonatedItem"("itemId");
