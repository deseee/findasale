-- Add holdDurationMinutes to ItemReservation to snapshot duration at creation time
ALTER TABLE "ItemReservation" ADD COLUMN "holdDurationMinutes" integer NOT NULL DEFAULT 30;
