-- Feature #397: Crew Invasion — organizer opt-in field on Sale + CrewInvasionCode tracking table

ALTER TABLE "Sale" ADD COLUMN "crewInvasionEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "CrewInvasionCode" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "crewId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "discountPct" INTEGER NOT NULL DEFAULT 10,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrewInvasionCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrewInvasionCode_code_key" ON "CrewInvasionCode"("code");
CREATE UNIQUE INDEX "CrewInvasionCode_saleId_crewId_key" ON "CrewInvasionCode"("saleId", "crewId");
CREATE INDEX "CrewInvasionCode_saleId_idx" ON "CrewInvasionCode"("saleId");
CREATE INDEX "CrewInvasionCode_crewId_idx" ON "CrewInvasionCode"("crewId");

ALTER TABLE "CrewInvasionCode" ADD CONSTRAINT "CrewInvasionCode_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
