-- Migration: add_taste_profile_and_api_keys
-- Features: Pre-wire tasteProfile for Agentic AI Scout, ApiKey model for third-party integrations
-- Session: Current
-- Purpose: Add two pre-wire fields for future features (taste profile learning + API key management)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add tasteProfile to User model
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN "taste_profile" JSONB;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create ApiKey model
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "api_keys" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "keyHash"     TEXT NOT NULL,
    "prefix"      TEXT NOT NULL,
    "scopes"      TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt"  TIMESTAMP(3),
    "expiresAt"   TIMESTAMP(3),
    "revokedAt"   TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");
CREATE INDEX "api_keys_keyHash_idx" ON "api_keys"("keyHash");
