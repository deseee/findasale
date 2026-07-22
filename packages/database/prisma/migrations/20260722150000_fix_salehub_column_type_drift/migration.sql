-- S1149-CORRECTED: fix genuine schema drift on "SaleHub" introduced by the
-- original hand-authored migration (20260317002000_add_sale_hubs). That
-- migration's raw CREATE TABLE declared "isActive" as INTEGER DEFAULT 1 and
-- "lat"/"lng"/"radiusKm" as REAL, but schema.prisma has always declared
-- isActive Boolean @default(true) and lat/lng/radiusKm Float (Float maps to
-- DOUBLE PRECISION by default, not REAL). The live Postgres column types
-- never matched the Prisma schema. This type mismatch is the confirmed root
-- cause of the "insufficient data left in message" (08P01) wire-protocol
-- errors on prisma.saleHub.create() and prisma.saleHub.findMany() -- Prisma's
-- query engine binds parameters using the *schema-declared* Postgres type
-- (bool / float8), and Postgres rejects/misreads them against the actual
-- column type (int4 / float4), corrupting the binary parameter buffer.
--
-- This supersedes adr-s1149's "Prisma 5.22 / Postgres 18 incompatibility"
-- theory, which is very likely NOT the real cause -- no other Boolean or
-- Float column anywhere else in the schema shows this error, and this app
-- performs boolean-parameterized queries successfully elsewhere in
-- production today. The bug is isolated to these three drifted columns on
-- this one table.
--
-- Additive/corrective only. No data loss: existing INTEGER 0/1 values convert
-- cleanly to boolean; REAL values widen cleanly to DOUBLE PRECISION.
--
-- Rollback:
--   ALTER TABLE "SaleHub" ALTER COLUMN "isActive" TYPE INTEGER USING ("isActive"::int),
--     ALTER COLUMN "isActive" SET DEFAULT 1;
--   ALTER TABLE "SaleHub" ALTER COLUMN "lat" TYPE REAL,
--     ALTER COLUMN "lng" TYPE REAL,
--     ALTER COLUMN "radiusKm" TYPE REAL,
--     ALTER COLUMN "radiusKm" SET DEFAULT 5.0;
--   (Only roll back if the type fix itself is found to cause a NEW regression
--   -- it should not, since it brings the DB in line with the schema that has
--   always been declared in schema.prisma.)

ALTER TABLE "SaleHub"
  ALTER COLUMN "isActive" DROP DEFAULT,
  ALTER COLUMN "isActive" TYPE BOOLEAN USING ("isActive" <> 0),
  ALTER COLUMN "isActive" SET DEFAULT true;

ALTER TABLE "SaleHub"
  ALTER COLUMN "lat" TYPE DOUBLE PRECISION,
  ALTER COLUMN "lng" TYPE DOUBLE PRECISION;

ALTER TABLE "SaleHub"
  ALTER COLUMN "radiusKm" DROP DEFAULT,
  ALTER COLUMN "radiusKm" TYPE DOUBLE PRECISION,
  ALTER COLUMN "radiusKm" SET DEFAULT 5.0;
