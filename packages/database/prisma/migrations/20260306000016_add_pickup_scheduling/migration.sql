-- CreateTable PickupSlot
CREATE TABLE "PickupSlot" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PickupSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable PickupBooking
CREATE TABLE "PickupBooking" (
  "id" TEXT NOT NULL,
  "slotId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PickupBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex PickupBooking unique constraint
CREATE UNIQUE INDEX "PickupBooking_slotId_userId_key" ON "PickupBooking"("slotId", "userId");

-- AddForeignKey PickupSlot.saleId
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey PickupBooking.slotId
ALTER TABLE "PickupBooking" ADD CONSTRAINT "PickupBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "PickupSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey PickupBooking.userId
ALTER TABLE "PickupBooking" ADD CONSTRAINT "PickupBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
