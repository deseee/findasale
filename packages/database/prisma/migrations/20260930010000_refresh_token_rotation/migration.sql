-- Refresh-token rotation with reuse detection (2026-09-30, auth hardening)
--
-- WHY: refresh tokens were stateless 30-day JWTs. A stolen one kept minting access tokens for 30 days and could not
-- be revoked short of bumping User.tokenVersion (which logs out every device). RefreshToken records each issued
-- token (by SHA-256 of its random jti, never the token) in a rotation family. /auth/refresh consumes the presented
-- row and issues the next one; presenting an already-used row revokes the whole family; logout and password
-- change/reset revoke families. Tokens issued before this deploy have no row and are accepted ONCE (upgraded into a
-- new family) for AUTH_LEGACY_REFRESH_GRACE_DAYS (default 14), then refused.
--
-- SAFETY: additive only. One new table, its indexes and one foreign key. No existing table or column is touched, no
-- data is rewritten. Fully idempotent: every statement is guarded (IF NOT EXISTS / duplicate_object handler), so
-- re-running is a no-op. Apply manually. The app degrades safely if this is not applied yet: issuing a refresh token
-- logs an error and falls back to the old stateless token, and legacy tokens keep working during the grace window.
--
-- Down migration (safe at any time; the app then falls back to stateless refresh tokens):
--   DROP TABLE IF EXISTS "RefreshToken";

-- CreateTable
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "replacedById" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
