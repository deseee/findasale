-- AddColumn: CCPA opt-out flag for California users (Platform Safety #100)
ALTER TABLE "User" ADD COLUMN "ccpaOptOut" BOOLEAN NOT NULL DEFAULT false;
