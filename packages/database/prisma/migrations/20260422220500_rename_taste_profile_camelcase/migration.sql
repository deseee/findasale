-- Rename User.taste_profile → tasteProfile to match Prisma field name.
-- User.tasteProfile has no @map, so the generated client queries "tasteProfile" (camelCase).
-- The prior migration (1776893245415_add_taste_profile_and_api_keys) originally created
-- the column as "taste_profile" (snake_case) and was already applied to Railway, so a
-- simple edit to that file cannot fix production — Prisma never re-runs applied migrations.
-- This migration is idempotent: it only renames if the snake_case column still exists.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'User'
          AND column_name = 'taste_profile'
    ) THEN
        ALTER TABLE "User" RENAME COLUMN "taste_profile" TO "tasteProfile";
    END IF;
END $$;
