-- Make HoldInvoice.reservationId optional to support cart-only invoices (no hold required)
ALTER TABLE "HoldInvoice" ALTER COLUMN "reservationId" DROP NOT NULL;

-- Change FK cascade from DELETE to SET NULL so deleting a reservation doesn't delete the invoice
ALTER TABLE "HoldInvoice" DROP CONSTRAINT IF EXISTS "HoldInvoice_reservationId_fkey";
ALTER TABLE "HoldInvoice" ADD CONSTRAINT "HoldInvoice_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "ItemReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
