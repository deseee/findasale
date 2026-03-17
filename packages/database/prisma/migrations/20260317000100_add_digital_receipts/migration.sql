-- #62: Digital Receipt + Returns
CREATE TYPE "ReturnStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

ALTER TABLE "Sale" ADD COLUMN "returnWindowHours" INTEGER;

CREATE TABLE "DigitalReceipt" (
    "id" SERIAL NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigitalReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DigitalReceipt_purchaseId_key" ON "DigitalReceipt"("purchaseId");

CREATE TABLE "ReturnRequest" (
    "id" SERIAL NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DigitalReceipt" ADD CONSTRAINT "DigitalReceipt_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE;

ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE;
