-- Convert role column from ENUM to TEXT to match Prisma schema (role String)
-- This resolves the type mismatch that caused INSERT failures

-- Drop the default first (it references the enum type)
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

-- Convert the column to TEXT using explicit CAST
ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING "role"::TEXT;

-- Restore a plain-text default
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';

-- Drop the now-unused enum type
DROP TYPE IF EXISTS "Role";
