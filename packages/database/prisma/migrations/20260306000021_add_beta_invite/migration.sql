-- CreateTable for BetaInvite
CREATE TABLE "BetaInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,

    CONSTRAINT "BetaInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for unique code
CREATE UNIQUE INDEX "BetaInvite_code_key" ON "BetaInvite"("code");

-- CreateIndex for unique usedById (one-to-one relationship)
CREATE UNIQUE INDEX "BetaInvite_usedById_key" ON "BetaInvite"("usedById");

-- AddForeignKey for BetaInvite to User
ALTER TABLE "BetaInvite" ADD CONSTRAINT "BetaInvite_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add betaInviteUsed relation to User
ALTER TABLE "User" ADD COLUMN "betaInviteUsed" TEXT;
