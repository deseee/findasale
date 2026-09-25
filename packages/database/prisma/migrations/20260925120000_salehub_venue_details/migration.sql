-- AlterTable: SaleHub venue details (2026-09-25)
-- Address/contact/hours were entirely absent from SaleHub before this migration --
-- the create-hub form already collected an address, but createHubSchema (Zod) had no
-- "address" key, so Zod silently stripped it before it ever reached Prisma. Nullable:
-- existing hubs have none of this today, and this is purely additive.
ALTER TABLE "SaleHub" ADD COLUMN     "address" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "hoursText" TEXT;
