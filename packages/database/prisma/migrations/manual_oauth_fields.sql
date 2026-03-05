-- Phase 31: OAuth / NextAuth social login schema additions
-- This file documents the migration that Prisma will generate.

-- Make password optional for OAuth users
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

-- Add OAuth provider field
ALTER TABLE "User" ADD COLUMN "oauthProvider" TEXT;

-- Add OAuth ID field
ALTER TABLE "User" ADD COLUMN "oauthId" TEXT;

-- Create unique constraint to prevent duplicate OAuth accounts from same provider
ALTER TABLE "User" ADD CONSTRAINT "User_oauthProvider_oauthId_key" UNIQUE ("oauthProvider", "oauthId");
