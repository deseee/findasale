-- ADR-069 Phase 2: Photo Role Awareness
-- Add photoRole enum type and update Photo table

CREATE TYPE "PhotoRole" AS ENUM ('FRONT', 'BACK_STAMP', 'DETAIL_DAMAGE', 'LABEL_BRAND', 'MULTI_ANGLE', 'UNKNOWN');

-- Drop existing photoRole column if it exists as String (backward compat)
ALTER TABLE "Photo" DROP COLUMN IF EXISTS "photoRole";

-- Add new photoRole column as enum with default UNKNOWN
ALTER TABLE "Photo" ADD COLUMN "photoRole" "PhotoRole" NOT NULL DEFAULT 'UNKNOWN';

-- Add roleReasoning column for Haiku's explanation
ALTER TABLE "Photo" ADD COLUMN "roleReasoning" TEXT;

-- Create index for role-based queries
CREATE INDEX "idx_Photo_photoRole" ON "Photo"("photoRole");
