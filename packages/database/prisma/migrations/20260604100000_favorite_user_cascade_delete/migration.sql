-- Fix: orphaned Favorite rows crash getSaleActivity when userId points to deleted user
-- Root cause: Favorite.userId FK had no ON DELETE action — deleted users left dangling rows
-- Fix: add CASCADE so deleting a User automatically deletes their Favorites

-- Step 1: Clean up any existing orphaned rows before adding the constraint
DELETE FROM "Favorite" WHERE "userId" NOT IN (SELECT "id" FROM "User");

-- Step 2: Drop the old FK constraint (no cascade)
ALTER TABLE "Favorite" DROP CONSTRAINT IF EXISTS "Favorite_userId_fkey";

-- Step 3: Re-add with ON DELETE CASCADE
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
