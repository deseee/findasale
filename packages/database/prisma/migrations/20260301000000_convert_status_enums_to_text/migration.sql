-- Convert Sale.status from SaleStatus ENUM to TEXT
ALTER TABLE "Sale" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Sale" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "Sale" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- Convert Item.status from ItemStatus ENUM to TEXT
ALTER TABLE "Item" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Item" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "Item" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';

-- Convert Purchase.status from PurchaseStatus ENUM to TEXT
ALTER TABLE "Purchase" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Purchase" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "Purchase" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- Drop the old ENUM types
DROP TYPE IF EXISTS "SaleStatus";
DROP TYPE IF EXISTS "ItemStatus";
DROP TYPE IF EXISTS "PurchaseStatus";
