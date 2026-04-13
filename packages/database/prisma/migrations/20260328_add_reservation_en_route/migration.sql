-- Feature #121: En route grace flag on ItemReservation
ALTER TABLE "ItemReservation" ADD COLUMN "enRoute" BOOLEAN NOT NULL DEFAULT false;
