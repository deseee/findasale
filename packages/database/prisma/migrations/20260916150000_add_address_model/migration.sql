-- ADR-126 (2026-09-16): Address -- a real, reusable, editable saved address, owned by a
-- User, separate from any one order. Purely additive: one brand-new table, one new
-- back-relation on User (no column added to User itself). No change to Purchase,
-- HoldInvoice, Sale, or Organizer in this migration, and no backfill -- every existing
-- User starts with zero Address rows, exactly as if the feature had always existed but
-- nobody had used it yet (same "nullable, no backfill, deliberate" posture this codebase
-- already uses on Purchase's FEE SNAPSHOT / SHIPPING DESTINATION blocks). Zero breaking
-- changes: every current checkout/invoice/label-purchase code path keeps working
-- completely unmodified until the app-layer autofill/save logic built on top of this
-- table (squarePaymentController.ts, guestInvoiceController.ts, the new address routes)
-- is deployed. See claude_docs/architecture/ADR-126-shipping-address-data-model.md §7.
CREATE TABLE "Address" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "label"         TEXT,
  "recipientName" TEXT NOT NULL,
  "line1"         TEXT NOT NULL,
  "line2"         TEXT,
  "city"          TEXT NOT NULL,
  "state"         TEXT NOT NULL,
  "zip"           TEXT NOT NULL,
  "country"       TEXT NOT NULL DEFAULT 'US',
  "phone"         TEXT,
  "role"          TEXT NOT NULL DEFAULT 'SHIP_TO',
  "isDefault"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Address_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Address_userId_role_idx" ON "Address"("userId", "role");
