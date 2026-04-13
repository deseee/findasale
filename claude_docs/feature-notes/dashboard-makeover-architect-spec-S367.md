# Dashboard Makeover + Settlement Hub — Complete Architecture Spec

**Status:** Architecture Phase Complete
**Architect Session:** S367
**Date:** 2026-04-01
**Scope:** Tier 1 & 2 feature set design
**Authority:** Systems Architect (findasale-architect)

---

## Executive Summary

This spec defines the complete technical architecture for the **Settlement Hub + Dashboard Makeover** initiative, comprising 10 interdependent features spanning Tier 1 (commission calculator + settlement flow) through Tier 2 (efficiency coaching, sale pulse, smart buyer intelligence, high-value item flagging, and auxiliary widgets).

The architecture is **sale-type-aware**: Settlement Hub schemas are optional-with-validation rather than forcing all sale types through identical required fields. Yard sales and flea markets have radically simpler settlement flows than estate sales or consignments.

**Key Design Constraints:**
- Settlement Hub is account-unlockable only (never transactional during sale — client payouts happen POST-SALE CLOSED)
- AI Comp Tool works independently (no settlement coupling)
- Dashboard is modular per-sale-type (adaptive layout via frontend config)
- All new endpoints are organizer-only (no shopper access to settlement, client payouts, or expense tracking)

---

## 1. Schema Changes (Prisma Models)

### 1.1 New Models

#### Model: `SaleSettlement` (primary settlement record)
```prisma
model SaleSettlement {
  id              String    @id @default(cuid())
  saleId          String    @unique
  sale            Sale      @relation(fields: [saleId], references: [id], onDelete: Cascade)

  // Lifecycle: When was settlement initiated and completed?
  lifecycleStage  String    @default("LEAD")    // LEAD | CONTRACTED | PREP | LIVE | POST_SALE | CLOSED
  settledAt       DateTime?                      // When settlement flow completed (client payout issued)

  // Top-level accounting
  totalRevenue    Decimal   @default(0)        // Sum of all sale purchases (before fees)
  platformFeeAmount Decimal @default(0)         // FindA.Sale 10% (deducted at payout)
  totalExpenses   Decimal   @default(0)         // Sum of all expense line items
  netProceeds     Decimal   @default(0)         // totalRevenue - platformFeeAmount - totalExpenses

  // Client/Consignor payout (ESTATE | CONSIGNMENT only; null for YARD | FLEA_MARKET)
  clientPayoutRequested DateTime?               // When organizer initiated payout to client
  clientPayoutStatus    String?                 // PENDING | PROCESSING | PAID | FAILED (null = not applicable)
  clientPayoutAmount    Decimal?                // How much goes to client (after platform fee + expenses)
  clientPayoutMethod    String?                 // STRIPE_CONNECT | ACH | CHECK (future)
  clientPayoutStripeTransferId String?          // Stripe Connect transfer ID for tracking
  clientPayoutFailureReason String?             // If FAILED: why

  // Commission/Split (ESTATE | CONSIGNMENT | AUCTION)
  commissionRate  Decimal?                      // estate/consignment: organizer's commission % (e.g., 0.35 = 35%)
  // Note: For consignment, consignor split is per-item in Item.consignmentSplitPct

  // Auction-specific
  buyerPremiumRate Decimal?                     // Auction: buyer premium % (e.g., 0.10 = 10%)
  buyerPremiumCollected Decimal?                // Auction: total buyer premium collected

  // Notes + metadata
  notes           String?
  settlementNotes String?                       // Organizer private notes on settlement
  internalNotes   String?                       // Admin notes (future use)

  // Soft delete
  deletedAt       DateTime?

  // Relations
  expenses        SaleExpense[]
  clientPayout    ClientPayout?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([saleId])
  @@index([lifecycleStage])
  @@index([clientPayoutStatus])
}
```

#### Model: `SaleExpense` (line items for organizer expenses)
```prisma
model SaleExpense {
  id              String    @id @default(cuid())
  settlementId    String
  settlement      SaleSettlement @relation(fields: [settlementId], references: [id], onDelete: Cascade)

  category        String                        // HAULING | ADVERTISING | STAFF | SUPPLIES | VENUE | OTHER
  description     String                        // "2-hour hauling service", "Facebook ad spend", etc.
  amount          Decimal

  // Optional reference to external vendor/receipt
  vendorName      String?                       // "Local Haulers Inc", "Facebook", etc.
  receiptUrl      String?                       // Cloudinary URL to receipt photo/PDF
  receiptDate     DateTime?                     // When the expense was incurred

  // Soft delete
  deletedAt       DateTime?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([settlementId])
  @@index([category])
}
```

#### Model: `ClientPayout` (the final payout record)
```prisma
model ClientPayout {
  id                String   @id @default(cuid())
  settlementId      String   @unique
  settlement        SaleSettlement @relation(fields: [settlementId], references: [id], onDelete: Cascade)

  // Client/consignor details (denormalized for auditability)
  clientName        String
  clientEmail       String?
  clientPhone       String?

  // Payout details
  amount            Decimal
  status            String   @default("PENDING") // PENDING | PROCESSING | PAID | FAILED
  method            String                        // STRIPE_CONNECT | ACH | CHECK

  // Stripe Connect transfer tracking
  stripeTransferId  String?  @unique
  stripeAccountId   String?  // Recipient's Stripe Connect account

  // Wire/ACH details (future)
  bankAccountLast4  String?
  bankRoutingNumber String?

  // Audit trail
  failureReason     String?
  processedAt       DateTime?
  paidAt            DateTime?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([settlementId])
  @@index([status])
}
```

#### Model: `SaleTransaction` (buyer transaction records for analytics/heatmap)
```prisma
model SaleTransaction {
  id              String    @id @default(cuid())
  saleId          String
  sale            Sale      @relation(fields: [saleId], references: [id], onDelete: Cascade)

  // Who and what
  buyerId         String?                       // Nullable: POS walk-in
  buyer           User?     @relation(fields: [buyerId], references: [id])
  itemId          String?                       // Nullable: whole-sale purchase (future)
  item            Item?     @relation(fields: [itemId], references: [id])

  // Transaction details
  amount          Decimal
  currency        String    @default("USD")
  paymentMethod   String                        // STRIPE_CARD | STRIPE_ACH | CASH | CHECK | POS_TERMINAL
  source          String    @default("ONLINE") // ONLINE | POS | PHONE

  // Status
  status          String    @default("COMPLETED") // COMPLETED | PENDING | FAILED | REFUNDED

  // For Sale Pulse analytics
  timestamp       DateTime  @default(now())

  createdAt       DateTime  @default(now())

  @@index([saleId, timestamp])
  @@index([buyerId])
  @@index([status])
}
```

#### Model: `SaleWaiver` (digital waiver signatures)
```prisma
model SaleWaiver {
  id              String    @id @default(cuid())
  saleId          String
  sale            Sale      @relation(fields: [saleId], references: [id], onDelete: Cascade)

  // Shopper who signed
  shopperId       String
  shopper         User      @relation(fields: [shopperId], references: [id], onDelete: Cascade)

  // Waiver content
  waiverType      String                        // LIABILITY | RETURN_POLICY | OTHER
  waiverText      String
  waiverVersion   String                        // "1.0", "2.0" for tracking changes

  // Signature proof
  signedAt        DateTime  @default(now())
  signatureData   String?                       // Base64 or SVG signature (future)
  ipAddress       String?                       // For compliance audit

  createdAt       DateTime  @default(now())

  @@unique([saleId, shopperId, waiverType])
  @@index([saleId])
  @@index([shopperId])
}
```

#### Model: `SaleDonation` (items donated to charity)
```prisma
model SaleDonation {
  id              String    @id @default(cuid())
  saleId          String
  sale            Sale      @relation(fields: [saleId], references: [id], onDelete: Cascade)

  // Items donated
  itemIds         String[]                      // Array of Item IDs donated (stored as JSON in DB)
  itemCount       Int

  // Charity info
  charityName     String
  charityEin      String?                       // Optional EIN for tax receipt
  charityContact  String?                       // Email or phone
  pickupDate      DateTime?
  pickupLocation  String?

  // Valuation for tax purposes
  estimatedValue  Decimal?                      // For tax deduction
  donationStatus  String    @default("PENDING") // PENDING | COMPLETED | RECEIPT_GENERATED

  taxReceiptUrl   String?                       // Link to generated tax receipt
  generatedAt     DateTime?

  notes           String?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([saleId])
  @@index([donationStatus])
}
```

#### Model: `TaxReceipt` (generated tax receipts for donations)
```prisma
model TaxReceipt {
  id              String    @id @default(cuid())
  donationId      String    @unique
  donation        SaleDonation @relation(fields: [donationId], references: [id], onDelete: Cascade)

  // Receipt details
  receiptNumber   String    @unique                          // Sequential: TAX-2026-0001, etc.
  organizerName   String
  organizerEin    String?
  organizerAddress String?

  charityName     String
  charityEin      String?

  itemDescription String                        // Human-readable list of donated items
  itemCount       Int
  estimatedValue  Decimal

  // Receipt file
  pdfUrl          String?                       // Cloudinary PDF link
  generatedAt     DateTime  @default(now())

  createdAt       DateTime  @default(now())

  @@index([organizerEin])
  @@index([charityEin])
}
```

#### Model: `SaleCheckin` (GPS-based check-ins for hold validation — already in schema, verify it exists)
Pre-existing in schema (Feature #121). Verification only — no changes needed.

---

### 1.2 Schema Additions to Existing Models

#### Sale Model Additions
```prisma
model Sale {
  // ... existing fields ...

  // Feature #: Settlement Hub integration
  settlementHub   SaleSettlement?               // One-to-one: every sale gets zero or one settlement record
  transactions    SaleTransaction[]             // Analytics transactions for this sale
  waivers         SaleWaiver[]                  // Digital waivers signed by shoppers
  donations       SaleDonation[]                // Charity donations from this sale

  // Lifecycle stage (parallel to status, for settlement flow)
  lifecycleStage  String    @default("LEAD")   // LEAD | CONTRACTED | PREP | LIVE | POST_SALE | CLOSED

  // Commission tracking (ESTATE | CONSIGNMENT | AUCTION only; null for others)
  commissionRate  Decimal?                      // e.g., 0.35 = 35% (organizer takes 35%)

  // High-value threshold for flagging
  highValueThreshold Decimal?                   // e.g., 500.00 = flag items >= $500

  // Organizer notes visible in settlement
  settlementNotes String?                       // Private notes about this sale's settlement

  // Soft delete
  deletedAt       DateTime?

  @@index([lifecycleStage])
  @@index([highValueThreshold])
}
```

#### Item Model Additions
```prisma
model Item {
  // ... existing fields ...

  // High-value item tracking
  isHighValue     Boolean   @default(false)    // Flagged by organizer or threshold
  highValueThreshold Decimal?                   // Threshold at which this item was flagged
  estimatedValue  Decimal?                      // Organizer's estimate for settlement/insurance

  // AI Comp Tool results
  aiSuggestedPrice Decimal?                     // Claude + eBay data → suggested price
  aiCompConfidence Float?                       // 0.0–1.0 confidence in suggestion
  aiCompSource    String?                       // "ebay_sold", "comparables", etc.
  aiCompLastUpdated DateTime?                   // When comp was last generated

  // Charity close integration
  donatedAt       DateTime?                     // When item was marked for donation
  donationRecipient String?                     // Charity name or ID
  donationStatus  String?                       // PENDING | COMPLETED

  // Soft delete (already exists, verify)
  deletedAt       DateTime?
}
```

#### Organizer Model Additions
```prisma
model Organizer {
  // ... existing fields ...

  // Efficiency tracking (for coaching widget)
  avgPhotoToPublishMinutes Float?               // Denormalized: avg time from capture to publication
  avgSellThroughRate      Float?                // Denormalized: % of items sold
  totalSalesCompleted     Int     @default(0)  // Count of closed sales for benchmarking

  // High-value thresholds per organizer (defaults override global)
  defaultHighValueThreshold Decimal?            // org-level default (applied to new items)

  // Settlement settings
  settlementAutoCalcExpenses Boolean @default(false) // Enable auto-calculation (future)

  @@index([avgSellThroughRate])
}
```

---

### 1.3 Enums

```prisma
enum LifecycleStage {
  LEAD              // Pre-contract
  CONTRACTED        // Contract signed, not yet operational
  PREP              // Operational but not yet live (staff setup, logistics)
  LIVE              // Sale is currently running
  POST_SALE         // Sale ended, settlement in progress
  CLOSED            // Settlement complete, archived
}

enum ExpenseCategory {
  HAULING           // Removal/hauling services
  ADVERTISING       // Paid ads, marketing materials
  STAFF             // Labor costs for setup/breakdown
  SUPPLIES          // Containers, tags, packaging
  VENUE             // Rental, utilities, permits
  OTHER             // Misc
}

enum PayoutStatus {
  PENDING           // Created but not processed
  PROCESSING        // Stripe transfer initiated
  PAID              // Transfer completed
  FAILED            // Transfer failed, needs retry
}

enum DonationStatus {
  PENDING           // Donation scheduled, not yet executed
  COMPLETED         // Items picked up by charity
  RECEIPT_GENERATED // Tax receipt generated and sent
}

enum HighValueStatus {
  FLAGGED           // Item meets high-value threshold
  REVIEWED          // Organizer reviewed the flag
  SOLD              // Item was sold
  RESERVED          // Item held in reserve for special handling
}
```

---

## 2. Migration Plan

### Migration Filename
`20260401-settlement-hub-schema.sql`

### DDL Operations (in order)

**Step 1: Create enum types (PostgreSQL)**
```sql
CREATE TYPE public."LifecycleStage" AS ENUM ('LEAD', 'CONTRACTED', 'PREP', 'LIVE', 'POST_SALE', 'CLOSED');
CREATE TYPE public."ExpenseCategory" AS ENUM ('HAULING', 'ADVERTISING', 'STAFF', 'SUPPLIES', 'VENUE', 'OTHER');
CREATE TYPE public."PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');
CREATE TYPE public."DonationStatus" AS ENUM ('PENDING', 'COMPLETED', 'RECEIPT_GENERATED');
CREATE TYPE public."HighValueStatus" AS ENUM ('FLAGGED', 'REVIEWED', 'SOLD', 'RESERVED');
```

**Step 2: Create SaleSettlement table**
```sql
CREATE TABLE "SaleSettlement" (
  id TEXT NOT NULL,
  saleId TEXT NOT NULL,
  lifecycleStage TEXT NOT NULL DEFAULT 'LEAD',
  settledAt TIMESTAMP(3),
  totalRevenue DECIMAL(65, 30) NOT NULL DEFAULT 0,
  platformFeeAmount DECIMAL(65, 30) NOT NULL DEFAULT 0,
  totalExpenses DECIMAL(65, 30) NOT NULL DEFAULT 0,
  netProceeds DECIMAL(65, 30) NOT NULL DEFAULT 0,
  clientPayoutRequested TIMESTAMP(3),
  clientPayoutStatus TEXT,
  clientPayoutAmount DECIMAL(65, 30),
  clientPayoutMethod TEXT,
  clientPayoutStripeTransferId TEXT,
  clientPayoutFailureReason TEXT,
  commissionRate DECIMAL(65, 30),
  buyerPremiumRate DECIMAL(65, 30),
  buyerPremiumCollected DECIMAL(65, 30),
  notes TEXT,
  settlementNotes TEXT,
  internalNotes TEXT,
  deletedAt TIMESTAMP(3),
  createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE(saleId),
  FOREIGN KEY (saleId) REFERENCES "Sale"(id) ON DELETE CASCADE
);
CREATE INDEX "SaleSettlement_saleId_idx" ON "SaleSettlement"(saleId);
CREATE INDEX "SaleSettlement_lifecycleStage_idx" ON "SaleSettlement"(lifecycleStage);
CREATE INDEX "SaleSettlement_clientPayoutStatus_idx" ON "SaleSettlement"(clientPayoutStatus);
```

**Step 3: Create SaleExpense table**
```sql
CREATE TABLE "SaleExpense" (
  id TEXT NOT NULL,
  settlementId TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(65, 30) NOT NULL,
  vendorName TEXT,
  receiptUrl TEXT,
  receiptDate TIMESTAMP(3),
  deletedAt TIMESTAMP(3),
  createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (settlementId) REFERENCES "SaleSettlement"(id) ON DELETE CASCADE
);
CREATE INDEX "SaleExpense_settlementId_idx" ON "SaleExpense"(settlementId);
CREATE INDEX "SaleExpense_category_idx" ON "SaleExpense"(category);
```

**Step 4: Create ClientPayout table**
```sql
CREATE TABLE "ClientPayout" (
  id TEXT NOT NULL,
  settlementId TEXT NOT NULL,
  clientName TEXT NOT NULL,
  clientEmail TEXT,
  clientPhone TEXT,
  amount DECIMAL(65, 30) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  method TEXT NOT NULL,
  stripeTransferId TEXT UNIQUE,
  stripeAccountId TEXT,
  bankAccountLast4 TEXT,
  bankRoutingNumber TEXT,
  failureReason TEXT,
  processedAt TIMESTAMP(3),
  paidAt TIMESTAMP(3),
  createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE(settlementId),
  FOREIGN KEY (settlementId) REFERENCES "SaleSettlement"(id) ON DELETE CASCADE
);
CREATE INDEX "ClientPayout_settlementId_idx" ON "ClientPayout"(settlementId);
CREATE INDEX "ClientPayout_status_idx" ON "ClientPayout"(status);
```

**Step 5: Create SaleTransaction table**
```sql
CREATE TABLE "SaleTransaction" (
  id TEXT NOT NULL,
  saleId TEXT NOT NULL,
  buyerId TEXT,
  itemId TEXT,
  amount DECIMAL(65, 30) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  paymentMethod TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ONLINE',
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  timestamp TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (saleId) REFERENCES "Sale"(id) ON DELETE CASCADE,
  FOREIGN KEY (buyerId) REFERENCES "User"(id),
  FOREIGN KEY (itemId) REFERENCES "Item"(id)
);
CREATE INDEX "SaleTransaction_saleId_timestamp_idx" ON "SaleTransaction"(saleId, timestamp);
CREATE INDEX "SaleTransaction_buyerId_idx" ON "SaleTransaction"(buyerId);
CREATE INDEX "SaleTransaction_status_idx" ON "SaleTransaction"(status);
```

**Step 6: Create SaleWaiver table**
```sql
CREATE TABLE "SaleWaiver" (
  id TEXT NOT NULL,
  saleId TEXT NOT NULL,
  shopperId TEXT NOT NULL,
  waiverType TEXT NOT NULL,
  waiverText TEXT NOT NULL,
  waiverVersion TEXT NOT NULL,
  signedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  signatureData TEXT,
  ipAddress TEXT,
  createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE(saleId, shopperId, waiverType),
  FOREIGN KEY (saleId) REFERENCES "Sale"(id) ON DELETE CASCADE,
  FOREIGN KEY (shopperId) REFERENCES "User"(id) ON DELETE CASCADE
);
CREATE INDEX "SaleWaiver_saleId_idx" ON "SaleWaiver"(saleId);
CREATE INDEX "SaleWaiver_shopperId_idx" ON "SaleWaiver"(shopperId);
```

**Step 7: Create SaleDonation table**
```sql
CREATE TABLE "SaleDonation" (
  id TEXT NOT NULL,
  saleId TEXT NOT NULL,
  itemIds TEXT[],
  itemCount INTEGER NOT NULL,
  charityName TEXT NOT NULL,
  charityEin TEXT,
  charityContact TEXT,
  pickupDate TIMESTAMP(3),
  pickupLocation TEXT,
  estimatedValue DECIMAL(65, 30),
  donationStatus TEXT NOT NULL DEFAULT 'PENDING',
  taxReceiptUrl TEXT,
  generatedAt TIMESTAMP(3),
  notes TEXT,
  createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (saleId) REFERENCES "Sale"(id) ON DELETE CASCADE
);
CREATE INDEX "SaleDonation_saleId_idx" ON "SaleDonation"(saleId);
CREATE INDEX "SaleDonation_donationStatus_idx" ON "SaleDonation"(donationStatus);
```

**Step 8: Create TaxReceipt table**
```sql
CREATE TABLE "TaxReceipt" (
  id TEXT NOT NULL,
  donationId TEXT NOT NULL,
  receiptNumber TEXT NOT NULL UNIQUE,
  organizerName TEXT NOT NULL,
  organizerEin TEXT,
  organizerAddress TEXT,
  charityName TEXT NOT NULL,
  charityEin TEXT,
  itemDescription TEXT NOT NULL,
  itemCount INTEGER NOT NULL,
  estimatedValue DECIMAL(65, 30) NOT NULL,
  pdfUrl TEXT,
  generatedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE(donationId),
  FOREIGN KEY (donationId) REFERENCES "SaleDonation"(id) ON DELETE CASCADE
);
CREATE INDEX "TaxReceipt_organizerEin_idx" ON "TaxReceipt"(organizerEin);
CREATE INDEX "TaxReceipt_charityEin_idx" ON "TaxReceipt"(charityEin);
```

**Step 9: Alter Sale table**
```sql
ALTER TABLE "Sale"
ADD COLUMN "lifecycleStage" TEXT NOT NULL DEFAULT 'LEAD',
ADD COLUMN "commissionRate" DECIMAL(65, 30),
ADD COLUMN "highValueThreshold" DECIMAL(65, 30),
ADD COLUMN "settlementNotes" TEXT,
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Sale_lifecycleStage_idx" ON "Sale"(lifecycleStage);
CREATE INDEX "Sale_highValueThreshold_idx" ON "Sale"(highValueThreshold);
CREATE INDEX "Sale_deletedAt_idx" ON "Sale"(deletedAt);
```

**Step 10: Alter Item table**
```sql
ALTER TABLE "Item"
ADD COLUMN "isHighValue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "highValueThreshold" DECIMAL(65, 30),
ADD COLUMN "estimatedValue" DECIMAL(65, 30),
ADD COLUMN "aiSuggestedPrice" DECIMAL(65, 30),
ADD COLUMN "aiCompConfidence" REAL,
ADD COLUMN "aiCompSource" TEXT,
ADD COLUMN "aiCompLastUpdated" TIMESTAMP(3),
ADD COLUMN "donatedAt" TIMESTAMP(3),
ADD COLUMN "donationRecipient" TEXT,
ADD COLUMN "donationStatus" TEXT;

CREATE INDEX "Item_isHighValue_idx" ON "Item"(isHighValue);
CREATE INDEX "Item_donationStatus_idx" ON "Item"(donationStatus);
```

**Step 11: Alter Organizer table**
```sql
ALTER TABLE "Organizer"
ADD COLUMN "avgPhotoToPublishMinutes" REAL,
ADD COLUMN "avgSellThroughRate" REAL,
ADD COLUMN "totalSalesCompleted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "defaultHighValueThreshold" DECIMAL(65, 30),
ADD COLUMN "settlementAutoCalcExpenses" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Organizer_avgSellThroughRate_idx" ON "Organizer"(avgSellThroughRate);
```

### Rollback Plan

```
## Rollback: 20260401-settlement-hub-schema.sql

Down migration (reverse operations):
1. DROP INDEX IF EXISTS "Organizer_avgSellThroughRate_idx";
2. ALTER TABLE "Organizer" DROP COLUMN IF EXISTS avgPhotoToPublishMinutes, avgSellThroughRate, totalSalesCompleted, defaultHighValueThreshold, settlementAutoCalcExpenses;
3. DROP INDEX IF EXISTS "Item_donationStatus_idx", "Item_isHighValue_idx";
4. ALTER TABLE "Item" DROP COLUMN IF EXISTS isHighValue, highValueThreshold, estimatedValue, aiSuggestedPrice, aiCompConfidence, aiCompSource, aiCompLastUpdated, donatedAt, donationRecipient, donationStatus;
5. DROP INDEX IF EXISTS "Sale_deletedAt_idx", "Sale_highValueThreshold_idx", "Sale_lifecycleStage_idx";
6. ALTER TABLE "Sale" DROP COLUMN IF EXISTS lifecycleStage, commissionRate, highValueThreshold, settlementNotes, deletedAt;
7. DROP TABLE IF EXISTS "TaxReceipt" CASCADE;
8. DROP TABLE IF EXISTS "SaleDonation" CASCADE;
9. DROP TABLE IF EXISTS "SaleWaiver" CASCADE;
10. DROP TABLE IF EXISTS "SaleTransaction" CASCADE;
11. DROP TABLE IF EXISTS "ClientPayout" CASCADE;
12. DROP TABLE IF EXISTS "SaleExpense" CASCADE;
13. DROP TABLE IF EXISTS "SaleSettlement" CASCADE;
14. DROP TYPE IF EXISTS "HighValueStatus";
15. DROP TYPE IF EXISTS "DonationStatus";
16. DROP TYPE IF EXISTS "PayoutStatus";
17. DROP TYPE IF EXISTS "ExpenseCategory";
18. DROP TYPE IF EXISTS "LifecycleStage";

Playbook: If deploy fails during this migration (e.g., at step 4 ALTER TABLE Item), Railway will have rolled back automatically. Verify schema consistency with `npx prisma db execute --stdin < verify-schema.sql` before retrying deploy.

If post-deploy QA finds corrupted data, run: `npx prisma migrate reset --force && npx prisma migrate deploy` to re-apply from clean slate.
```

---

## 3. TypeScript Interfaces

All interfaces go in `packages/shared/src/types/settlement.ts` (new file).

```typescript
// ============================================================================
// SETTLEMENT HUB TYPES
// ============================================================================

export interface SaleSettlementRecord {
  id: string;
  saleId: string;
  lifecycleStage: 'LEAD' | 'CONTRACTED' | 'PREP' | 'LIVE' | 'POST_SALE' | 'CLOSED';
  settledAt: Date | null;

  totalRevenue: number;
  platformFeeAmount: number;
  totalExpenses: number;
  netProceeds: number;

  clientPayoutRequested: Date | null;
  clientPayoutStatus: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | null;
  clientPayoutAmount: number | null;
  clientPayoutMethod: 'STRIPE_CONNECT' | 'ACH' | 'CHECK' | null;
  clientPayoutStripeTransferId: string | null;
  clientPayoutFailureReason: string | null;

  commissionRate: number | null; // estate/consignment only
  buyerPremiumRate: number | null; // auction only
  buyerPremiumCollected: number | null;

  notes: string | null;
  settlementNotes: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface SettlementWithDetails extends SaleSettlementRecord {
  sale: {
    id: string;
    title: string;
    saleType: string; // ESTATE | YARD | AUCTION | FLEA_MARKET | CONSIGNMENT
    status: string;
    startDate: Date;
    endDate: Date;
  };
  expenses: SaleExpenseRecord[];
  clientPayout: ClientPayoutRecord | null;
}

export interface SaleExpenseRecord {
  id: string;
  settlementId: string;
  category: 'HAULING' | 'ADVERTISING' | 'STAFF' | 'SUPPLIES' | 'VENUE' | 'OTHER';
  description: string;
  amount: number;
  vendorName: string | null;
  receiptUrl: string | null;
  receiptDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaleExpenseInput {
  category: 'HAULING' | 'ADVERTISING' | 'STAFF' | 'SUPPLIES' | 'VENUE' | 'OTHER';
  description: string;
  amount: number;
  vendorName?: string;
  receiptUrl?: string;
  receiptDate?: Date;
}

export interface ClientPayoutRecord {
  id: string;
  settlementId: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  amount: number;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';
  method: 'STRIPE_CONNECT' | 'ACH' | 'CHECK';
  stripeTransferId: string | null;
  stripeAccountId: string | null;
  bankAccountLast4: string | null;
  bankRoutingNumber: string | null;
  failureReason: string | null;
  processedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientPayoutRequest {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  payoutMethod: 'STRIPE_CONNECT' | 'ACH' | 'CHECK';
  stripeAccountId?: string;
  bankAccountLast4?: string;
  bankRoutingNumber?: string;
}

export interface SaleTransactionRecord {
  id: string;
  saleId: string;
  buyerId: string | null;
  itemId: string | null;
  amount: number;
  currency: string;
  paymentMethod: 'STRIPE_CARD' | 'STRIPE_ACH' | 'CASH' | 'CHECK' | 'POS_TERMINAL';
  source: 'ONLINE' | 'POS' | 'PHONE';
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'REFUNDED';
  timestamp: Date;
  createdAt: Date;
}

export interface SaleTransactionSummary {
  totalTransactions: number;
  totalAmount: number;
  averageTransactionSize: number;
  lastTransactionAt: Date | null;
  paymentMethods: Record<string, number>; // { 'STRIPE_CARD': 45, 'CASH': 12 }
  sources: Record<string, number>; // { 'ONLINE': 40, 'POS': 17 }
}

// ============================================================================
// HIGH-VALUE ITEM TRACKER
// ============================================================================

export interface HighValueItemAlert {
  id: string;
  itemId: string;
  itemTitle: string;
  itemPrice: number;
  estimatedValue: number | null;
  highValueThreshold: number;
  flaggedAt: Date;
  status: 'FLAGGED' | 'REVIEWED' | 'SOLD' | 'RESERVED';
  organiserNote?: string;
}

export interface HighValueItemBatch {
  items: HighValueItemAlert[];
  saleId: string;
  totalCount: number;
  estimatedTotalValue: number;
}

// ============================================================================
// SALE PULSE WIDGET (Real-time Engagement)
// ============================================================================

export interface SalePulseData {
  saleId: string;
  pageViews: number;
  pageViewsTrend: number; // % change from yesterday
  saveCount: number;
  saveTrend: number;
  questionCount: number;
  questionTrend: number;
  estimatedBuyerCount: number;
  overallEngagementScore: number; // 0–100 (composite score)
  scoreBreakdown: {
    viewsScore: number; // weighted
    savesScore: number;
    questionsScore: number;
    conversionsScore: number; // % of viewers who purchased
  };
  peakActivityTime: string; // HH:MM in organizer's timezone
  lastUpdated: Date;
}

// ============================================================================
// ORGANIZER EFFICIENCY COACHING
// ============================================================================

export interface OrganizerEfficiencyStats {
  organizerId: string;

  // Photo-to-publish pipeline
  avgPhotoToPublishMinutes: number;
  medianPhotoToPublishMinutes: number;

  // Sell-through rate
  avgSellThroughRate: number; // 0–1 (65% = 0.65)

  // Benchmarking (percentile vs similar organizers)
  photoToPublishPercentile: number; // 1–100 (75 = you're faster than 75% of peers)
  sellThroughPercentile: number;

  // Comparison to similar organizers (same sale type, same region)
  peerMedianPhotoToPublishMinutes: number;
  peerMedianSellThroughRate: number;

  // Volume
  totalSalesCompleted: number;
  avgItemsPerSale: number;

  // Recommendation
  coachingMessage: string; // "You're in the top 10% for speed! Keep it up." or "Try batch processing photos — peers publish 30% faster."

  lastCalculated: Date;
}

// ============================================================================
// AI COMP TOOL
// ============================================================================

export interface ItemCompRequest {
  itemId: string;
  itemTitle: string;
  itemDescription: string;
  photoUrls: string[];
}

export interface ItemCompResult {
  itemId: string;
  suggestedPrice: number;
  confidence: number; // 0.0–1.0
  source: 'ebay_sold' | 'comparables' | 'category_average';
  comparables: {
    title: string;
    soldPrice: number;
    soldDate: Date;
    url: string;
  }[];
  reasoning: string; // "Based on 7 similar items sold on eBay in the last 30 days..."
  generatedAt: Date;
}

// ============================================================================
// SMART BUYER INTELLIGENCE (Shopper XP Data)
// ============================================================================

export interface SmartBuyerAlert {
  buyerId: string;
  buyerName: string;
  explorerRank: string; // INITIATE | COLLECTOR | CURATOR | SAGE | LUMINARY
  guildXp: number;
  previousPurchases: number;
  averageOrderValue: number;
  lastPurchaseDate: Date | null;
  estimatedLikelihood: number; // 0–1 (0.85 = likely to buy)
  predictedSpend: number; // Expected amount for this sale
  topCategoryInterests: string[]; // ['furniture', 'vintage']
}

export interface SaleSmartBuyers {
  saleId: string;
  expectedBuyers: SmartBuyerAlert[];
  totalExpectedBuyers: number;
  aggregateExpectedRevenue: number;
  lastUpdated: Date;
}

// ============================================================================
// DASHBOARD CONFIGURATION (Sale-Type Adaptive)
// ============================================================================

export interface DashboardWidgetConfig {
  id: string;
  title: string;
  description: string;
  component: string; // React component name
  order: number;
  saleTypes: string[]; // Which sale types show this widget
  isOptional: boolean;
  requiresSettlement: boolean; // Only show if settlement is LIVE or POST_SALE
}

export interface DashboardLayoutConfig {
  saleType: 'ESTATE' | 'YARD' | 'AUCTION' | 'FLEA_MARKET' | 'CONSIGNMENT';
  widgets: DashboardWidgetConfig[];
  layout: 'grid' | 'stacked';
  primaryColor?: string;
  priorityWidgets: string[]; // Top-left widgets for mobile
}

// ============================================================================
// WEATHER INTEGRATION
// ============================================================================

export interface WeatherForecast {
  saleId: string;
  saleDate: Date;
  date: Date;
  tempHigh: number;
  tempLow: number;
  condition: string; // 'sunny' | 'cloudy' | 'rainy' | 'snow'
  precipitationChance: number; // 0–1
  windSpeed: number;
  humidity: number;
  recommendation: string; // "Great day! 75°F and sunny." or "Rainy day — expect lower traffic."
}

// ============================================================================
// CHARITY CLOSE (Donation Flow)
// ============================================================================

export interface DonationCloseRequest {
  itemIds: string[];
  charityName: string;
  charityEin?: string;
  charityContact?: string;
  pickupDate?: Date;
  pickupLocation?: string;
  estimatedValue?: number;
  notes?: string;
}

export interface DonationRecord {
  id: string;
  saleId: string;
  itemIds: string[];
  itemCount: number;
  charityName: string;
  charityEin: string | null;
  charityContact: string | null;
  pickupDate: Date | null;
  pickupLocation: string | null;
  estimatedValue: number | null;
  donationStatus: 'PENDING' | 'COMPLETED' | 'RECEIPT_GENERATED';
  taxReceiptUrl: string | null;
  generatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaxReceiptData {
  id: string;
  donationId: string;
  receiptNumber: string;
  organizerName: string;
  organizerEin: string | null;
  charityName: string;
  charityEin: string | null;
  itemCount: number;
  itemDescription: string;
  estimatedValue: number;
  pdfUrl: string | null;
  generatedAt: Date;
}

// ============================================================================
// POST-SALE MOMENTUM
// ============================================================================

export interface PostSaleMomentumPrompt {
  saleId: string;
  previousSaleTitle: string;
  previousSaleStats: {
    itemsListed: number;
    itemsSold: number;
    revenue: number;
    avgItemPrice: number;
    sellThroughRate: number;
  };
  ctaText: string; // "You sold 87% of items! Start your next sale?"
  ctaUrl: string; // `/organizer/create-sale`
  estimatedSetupTime: number; // minutes
}
```

---

## 4. API Contracts

All endpoints are organizer-only (require JWT with ORGANIZER role).

### 4.1 Settlement Hub Endpoints

#### GET `/api/sales/:saleId/settlement`
**Purpose:** Fetch complete settlement record with expenses and payout

**Auth:** JWT (ORGANIZER role, sale.organizerId must match)

**Response:**
```typescript
{
  settlement: SettlementWithDetails;
  calculatedNetProceeds: number;
  estimatedPlatformFee: number;
  readyForPayout: boolean;
}
```

**File:** `packages/backend/src/routes/settlement.ts` (new)
**Controller:** `settlementController.ts` (new)

---

#### POST `/api/sales/:saleId/settlement`
**Purpose:** Initialize settlement record (called once per sale, after it closes)

**Auth:** JWT (ORGANIZER role)

**Request Body:**
```typescript
{
  lifecycleStage: 'POST_SALE'; // Initializing at close
}
```

**Response:**
```typescript
{
  id: string;
  saleId: string;
  message: "Settlement initialized. Add expenses and request payout.";
}
```

**File:** `packages/backend/src/routes/settlement.ts`
**Controller:** `settlementController.ts`

---

#### PATCH `/api/sales/:saleId/settlement`
**Purpose:** Update settlement record (notes, lifecycle stage)

**Auth:** JWT (ORGANIZER role)

**Request Body:**
```typescript
{
  lifecycleStage?: 'LIVE' | 'POST_SALE' | 'CLOSED';
  settlementNotes?: string;
  commissionRate?: number; // if estate/consignment
}
```

**Response:** `SaleSettlementRecord`

---

#### POST `/api/sales/:saleId/settlement/expenses`
**Purpose:** Add a single expense line item

**Auth:** JWT (ORGANIZER role)

**Request Body:**
```typescript
{
  category: 'HAULING' | 'ADVERTISING' | 'STAFF' | 'SUPPLIES' | 'VENUE' | 'OTHER';
  description: string;
  amount: number;
  vendorName?: string;
  receiptUrl?: string;
  receiptDate?: Date;
}
```

**Response:**
```typescript
{
  expense: SaleExpenseRecord;
  updatedSettlementTotals: {
    totalExpenses: number;
    netProceeds: number;
  };
}
```

---

#### DELETE `/api/sales/:saleId/settlement/expenses/:expenseId`
**Purpose:** Remove an expense line item (soft delete)

**Auth:** JWT (ORGANIZER role)

**Response:**
```typescript
{
  success: boolean;
  updatedSettlementTotals: {
    totalExpenses: number;
    netProceeds: number;
  };
}
```

---

#### POST `/api/sales/:saleId/settlement/payout`
**Purpose:** Initiate client payout via Stripe Connect

**Auth:** JWT (ORGANIZER role)

**Request Body:** `ClientPayoutRequest`

**Response:**
```typescript
{
  payoutId: string;
  status: 'PENDING' | 'PROCESSING';
  stripeTransferId: string | null;
  amount: number;
  message: "Payout initiated. Client will receive funds in 1-2 business days.";
}
```

**Notes:**
- Calls Stripe Connect API to initiate transfer
- Records transfer ID in ClientPayout.stripeTransferId
- Webhooks update status as transfer progresses

---

#### GET `/api/sales/:saleId/settlement/receipt`
**Purpose:** Generate and return PDF settlement receipt

**Auth:** JWT (ORGANIZER role)

**Query Params:** `format=pdf` or `format=csv`

**Response:** PDF file (application/pdf) or CSV file
**Fallback:** JSON with downloadUrl

---

### 4.2 Dashboard Widget Endpoints

#### GET `/api/organizers/sale-pulse/:saleId`
**Purpose:** Fetch engagement score and activity for Sale Pulse widget

**Auth:** JWT (ORGANIZER role)

**Response:** `SalePulseData`

**File:** `packages/backend/src/routes/dashboard.ts` (new)
**Controller:** `dashboardController.ts` (new)

---

#### GET `/api/organizers/efficiency-stats`
**Purpose:** Fetch organizer efficiency benchmarking data

**Auth:** JWT (ORGANIZER role)

**Query Params:** `saleType=ESTATE&region=MI`

**Response:** `OrganizerEfficiencyStats`

---

#### GET `/api/organizers/smart-buyers/:saleId`
**Purpose:** Fetch buyer intelligence for upcoming sale (XP/rank data)

**Auth:** JWT (ORGANIZER role)

**Query Params:** `limit=20&minRank=CURATOR` (optional filters)

**Response:** `SaleSmartBuyers`

---

### 4.3 Item Comp Tool Endpoints

#### POST `/api/items/:itemId/request-comp`
**Purpose:** Trigger AI comp tool (Claude + eBay data lookup)

**Auth:** JWT (ORGANIZER role)

**Request Body:**
```typescript
{
  // Item data already on server; just trigger analysis
}
```

**Response:**
```typescript
{
  compId: string;
  status: 'QUEUED'; // Async job
  estimatedTime: '30 seconds';
}
```

**File:** `packages/backend/src/routes/items.ts` (extend)
**Controller:** `itemController.ts` (extend)

---

#### GET `/api/items/:itemId/comp-result`
**Purpose:** Poll for comp result (or subscribe via SSE/WebSocket)

**Auth:** JWT (ORGANIZER role)

**Response:**
```typescript
{
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  result?: ItemCompResult;
  error?: string;
}
```

---

#### PATCH `/api/items/:itemId/high-value`
**Purpose:** Flag/unflag item as high-value

**Auth:** JWT (ORGANIZER role)

**Request Body:**
```typescript
{
  isHighValue: boolean;
  estimatedValue?: number;
}
```

**Response:** Item with `isHighValue` and `estimatedValue` updated

---

### 4.4 Charity Close Endpoints

#### POST `/api/sales/:saleId/charity-close`
**Purpose:** Initiate charity donation flow for unsold items

**Auth:** JWT (ORGANIZER role)

**Request Body:** `DonationCloseRequest`

**Response:**
```typescript
{
  donationId: string;
  itemsMarkedForDonation: number;
  charityName: string;
  message: "Donation scheduled. Items will be marked unavailable for purchase.";
}
```

**File:** `packages/backend/src/routes/sales.ts` (extend)
**Controller:** `saleController.ts` (extend)

---

#### POST `/api/sales/:saleId/charity-close/generate-receipt`
**Purpose:** Generate tax receipt PDF for donation

**Auth:** JWT (ORGANIZER role)

**Request Body:**
```typescript
{
  donationId: string;
}
```

**Response:** PDF file or JSON with receiptUrl

---

#### PATCH `/api/sales/:saleId/lifecycle`
**Purpose:** Update sale lifecycle stage

**Auth:** JWT (ORGANIZER role)

**Request Body:**
```typescript
{
  lifecycleStage: 'LEAD' | 'CONTRACTED' | 'PREP' | 'LIVE' | 'POST_SALE' | 'CLOSED';
}
```

**Response:**
```typescript
{
  saleId: string;
  lifecycleStage: string;
  settlingHubAvailable: boolean;
}
```

---

## 5. Implementation Sequence

Developers implement in this order (dependency chain):

### Phase 1: Schema & Data Layer (Day 1)
1. Run migration: `npx prisma migrate deploy`
2. Verify all tables created: `npx prisma db execute --stdin < verify-tables.sql`
3. Generate Prisma client: `npx prisma generate`

### Phase 2: Backend API Layer (Days 2–3)
4. Create `packages/backend/src/routes/settlement.ts` with 6 endpoints (GET, POST, PATCH settlement; POST/DELETE expenses; POST payout)
5. Create `packages/backend/src/controllers/settlementController.ts` with business logic
6. Create `packages/backend/src/routes/dashboard.ts` with 3 endpoints (sale-pulse, efficiency-stats, smart-buyers)
7. Create `packages/backend/src/controllers/dashboardController.ts` with analytics logic
8. Extend `packages/backend/src/routes/items.ts` with comp endpoints (POST/GET)
9. Extend `packages/backend/src/controllers/itemController.ts` with AI comp logic
10. Extend `packages/backend/src/routes/sales.ts` with charity-close endpoints
11. Extend `packages/backend/src/controllers/saleController.ts` with donation logic
12. Update auth middleware to gate all `/api/organizers/*` and settlement endpoints to ORGANIZER role only
13. Run TypeScript check: `cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules` → zero errors required

### Phase 3: Shared Types (Day 2 parallel)
14. Create `packages/shared/src/types/settlement.ts` with all interfaces listed in §3
15. Export types from `packages/shared/src/index.ts`
16. Run TypeScript check in shared: `cd packages/shared && npx tsc --noEmit --skipLibCheck`

### Phase 4: Frontend Widget Components (Days 4–5)
17. Create `packages/frontend/components/SettlementHub/SettlementSummary.tsx`
18. Create `packages/frontend/components/SettlementHub/ExpenseTracker.tsx`
19. Create `packages/frontend/components/SettlementHub/ClientPayoutFlow.tsx`
20. Create `packages/frontend/components/Dashboard/SalePulseWidget.tsx`
21. Create `packages/frontend/components/Dashboard/EfficiencyCoachingWidget.tsx`
22. Create `packages/frontend/components/Dashboard/SmartBuyerAlert.tsx`
23. Create `packages/frontend/components/Dashboard/HighValueItemTracker.tsx`
24. Create `packages/frontend/components/Modals/CharityCloseModal.tsx`
25. Create `packages/frontend/components/Modals/CompToolModal.tsx`

### Phase 5: Frontend Pages (Days 5–6)
26. Create `packages/frontend/pages/organizer/settlement/[saleId].tsx` (main settlement page)
27. Extend `packages/frontend/pages/organizer/dashboard.tsx` with new widgets (conditionally rendered per sale type)
28. Update `packages/frontend/pages/sales/[id].tsx` if adding charity close flow UI

### Phase 6: QA & Verification (Day 6–7)
29. Run frontend TypeScript check: `cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules` → zero errors required
30. Manual Chrome QA:
    - Estate sale: Create settlement, add expenses, request payout
    - Yard sale: Verify settlement hub is collapsed (minimal fields)
    - Flea market: Verify vendor-only fields hidden
    - Test charity close flow on unsold items
    - Test AI comp tool on 3 items
31. Test responsive on mobile (375px viewport, 768px tablet)
32. Test dark mode on all new components

---

## 6. Sale-Type Command Center Architecture

### 6.1 Frontend Configuration

Create `packages/frontend/lib/dashboard-config.ts`:

```typescript
type SaleType = 'ESTATE' | 'YARD' | 'AUCTION' | 'FLEA_MARKET' | 'CONSIGNMENT';

export const dashboardWidgetsByType: Record<SaleType, string[]> = {
  ESTATE: [
    'sale-header',
    'settlement-summary', // ← unique to ESTATE
    'sale-pulse',
    'efficiency-coaching',
    'smart-buyers', // ← useful for estate (high-value buyers)
    'high-value-tracker',
    'metrics-overview',
    'recent-activity',
    'post-sale-momentum', // ← after CLOSED
  ],
  YARD: [
    'sale-header',
    'settlement-simple', // ← minimal: cash reconciliation only
    'sale-pulse',
    'high-value-tracker', // optional
    'metrics-overview',
    'quick-actions',
  ],
  AUCTION: [
    'sale-header',
    'settlement-summary', // ← includes buyer premium tracking
    'live-bidding-status',
    'auction-metrics',
    'sale-pulse',
    'smart-buyers',
    'high-value-tracker',
    'recent-activity',
  ],
  FLEA_MARKET: [
    'sale-header',
    'vendor-summary', // ← vendor payouts, not client payouts
    'vendor-list',
    'booth-fee-tracking',
    'sale-pulse',
    'quick-actions',
  ],
  CONSIGNMENT: [
    'sale-header',
    'settlement-summary', // ← includes per-item consignor splits
    'consignor-earnings',
    'sale-pulse',
    'efficiency-coaching',
    'smart-buyers',
    'high-value-tracker',
    'recent-activity',
  ],
};

export const getWidgetLabel = (widget: string, saleType: SaleType): string => {
  const labels: Record<string, string> = {
    'settlement-summary': 'Settlement Hub',
    'settlement-simple': 'Sale Summary',
    'smart-buyers': saleType === 'FLEA_MARKET' ? 'Vendor Management' : 'Buyer Intelligence',
    // ... others
  };
  return labels[widget] || widget;
};

export const shouldRenderWidget = (
  widget: string,
  saleType: SaleType,
  lifecycleStage: string
): boolean => {
  // Rules: when to show/hide per sale type and lifecycle
  if (widget === 'post-sale-momentum' && lifecycleStage !== 'CLOSED') return false;
  if (widget === 'settlement-summary' && !['ESTATE', 'AUCTION', 'CONSIGNMENT'].includes(saleType)) return false;
  return dashboardWidgetsByType[saleType].includes(widget);
};
```

### 6.2 Frontend Component Conditional Rendering

In `packages/frontend/pages/organizer/dashboard.tsx`:

```typescript
<>
  {dashboardWidgetsByType[sale.saleType].map((widget) => (
    shouldRenderWidget(widget, sale.saleType, sale.lifecycleStage) && (
      <div key={widget} className="widget-wrapper">
        {widget === 'settlement-summary' && <SettlementSummary saleId={sale.id} />}
        {widget === 'settlement-simple' && <SettlementSimple saleId={sale.id} />}
        {widget === 'sale-pulse' && <SalePulseWidget saleId={sale.id} />}
        {widget === 'efficiency-coaching' && <EfficiencyCoachingWidget />}
        {widget === 'smart-buyers' && <SmartBuyerAlert saleId={sale.id} />}
        {widget === 'high-value-tracker' && <HighValueItemTracker saleId={sale.id} />}
        {/* ... others ... */}
      </div>
    )
  ))}
</>
```

### 6.3 Widget Appearance Matrix

| Widget | ESTATE | YARD | AUCTION | FLEA_MARKET | CONSIGNMENT | Lifecycle Gate |
|--------|--------|------|---------|-------------|-------------|-----------------|
| Settlement Hub | ✅ Full | ❌ (Simple summary) | ✅ Full | ❌ (Vendor mgmt) | ✅ Full | POST_SALE+ |
| Sale Pulse | ✅ | ✅ | ✅ | ✅ | ✅ | LIVE+ |
| Efficiency Coaching | ✅ | ⚠️ (optional) | ✅ | ❌ | ✅ | LIVE+ |
| Smart Buyers | ✅ | ❌ | ✅ | ❌ | ✅ | LIVE+ |
| High-Value Tracker | ✅ | ⚠️ (optional) | ✅ | ❌ | ✅ | PREP+ |
| Post-Sale Momentum | ✅ (after CLOSED) | ✅ | ✅ | ✅ | ✅ | CLOSED |

---

## 7. Key Design Decisions

### D1: Settlement Hub Initialization
**Decision:** Settlement records are created POST-SALE, not at sale creation. This prevents organizers from seeing unfinished settlement data during active sales.

**Rationale:** Settlement is a post-sale flow. Creating it at sale close signals to the organizer that payout is now available.

---

### D2: Sale-Type Optionality (Not Polymorphism)
**Decision:** All settlement fields are optional with sale-type-aware validation, rather than creating separate Settlement models per sale type.

**Rationale:** Single query, simpler schema, easier to maintain. Validation rules differ but the schema doesn't. A YARD sale settlement.commissionRate is simply null.

---

### D3: Expense Tracking is Organizer-Only
**Decision:** Expense tracking is never visible to shoppers or in any shopper-facing API. It's purely for organizer post-sale accounting.

**Rationale:** Operational transparency ≠ shopper transparency. Expenses are not relevant to buyers.

---

### D4: Client Payout is Async
**Decision:** Stripe Connect transfers are initiated asynchronously. Status updates via webhook, not blocking the POST response.

**Rationale:** Prevents timeout issues. Transfers can take 1–2 business days; don't block the organizer's request.

---

### D5: AI Comp Tool is Standalone
**Decision:** Comp tool works independently of settlement. An organizer can use comp without initiating settlement.

**Rationale:** Pricing intelligence is useful throughout the sale lifecycle, not just at settlement.

---

### D6: No Automatic Expense Calculation
**Decision:** Organizers manually add expenses. No "auto-infer" logic (e.g., calculating fees from transactions).

**Rationale:** Organizer oversight is critical for compliance. Manual entry ensures accuracy and auditability.

---

## 8. Patrick Decision Points

1. **Charity Close Tax Receipts:** Should PDF receipts be auto-mailed to the organizer and charity, or just stored for download?
   - Decision needed by Dev before implementing TaxReceipt generation.

2. **Flea Market Vendor Settlement:** The current spec treats flea markets as "simple" (no commission tracking). Should we build vendor-split settlement (each vendor pays their booth fee + organizer gets % of their sales)?
   - If yes: add `vendorId` FK to SaleTransaction + different settlement contract.
   - If no: vendor management is Phase 2.

3. **Commission Rate Input:** Should commission rates be organizer-configurable per sale, or locked per organizer tier (default from Organizer model)?
   - If per-sale: add UI to edit before settlement initiates.
   - If per-organizer: use Organizer.commissionRate or derive from subscriptionTier.

4. **Shopper-Facing Donations:** Should shoppers see a "Donate unsold items" prompt during checkout, or is this purely organizer-admin?
   - If shopper-facing: add UX spec.
   - If organizer-only: spec is complete.

5. **Real-Time Efficiency Benchmarking:** "Organizer Efficiency Coaching" widget updates how often?
   - Every page load (fresh data, more queries)?
   - Every 1 hour (cached, less load)?
   - Manual refresh button?

---

## 9. Risk Assessment

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| Schema migration blocks Railway build | Medium | Test migration locally first; rollback plan in place |
| Stripe Connect transfer failures | Low | Webhook retry logic; manual retry UI for organizer |
| Organizer confusion on settlement lifecycle | Medium | Clear modal at POST_SALE transition explaining next steps |
| Performance: efficiency stats query slow | Low | Denormalize avgSellThroughRate to Organizer model; index on it |
| Tax receipt PDF generation fails | Low | Store PDF URL in DB; async job with error retry |

---

## 10. Integration Points with Existing Systems

1. **Purchases table:** SaleTransaction mirrors Purchase data. Ensure no duplication — SaleTransaction is read-only analytics snapshot.
2. **Item status transitions:** When item.status = SOLD, it should not appear in high-value tracker or charity close flow.
3. **Platform fee calculation:** Settlement.platformFeeAmount must match Purchase.platformFeeAmount totals. Add validation query.
4. **Notifications:** When settlement is initiated (POST_SALE), send organizer email: "Your sale settlement is ready. Review expenses and request payout."

---

## Appendix: File Creation Checklist

**New Files to Create:**
- `packages/backend/src/routes/settlement.ts`
- `packages/backend/src/routes/dashboard.ts`
- `packages/backend/src/controllers/settlementController.ts`
- `packages/backend/src/controllers/dashboardController.ts`
- `packages/shared/src/types/settlement.ts`
- `packages/frontend/components/SettlementHub/SettlementSummary.tsx`
- `packages/frontend/components/SettlementHub/ExpenseTracker.tsx`
- `packages/frontend/components/SettlementHub/ClientPayoutFlow.tsx`
- `packages/frontend/components/Dashboard/SalePulseWidget.tsx`
- `packages/frontend/components/Dashboard/EfficiencyCoachingWidget.tsx`
- `packages/frontend/components/Dashboard/SmartBuyerAlert.tsx`
- `packages/frontend/components/Dashboard/HighValueItemTracker.tsx`
- `packages/frontend/components/Modals/CharityCloseModal.tsx`
- `packages/frontend/components/Modals/CompToolModal.tsx`
- `packages/frontend/pages/organizer/settlement/[saleId].tsx`
- `packages/frontend/lib/dashboard-config.ts`

**Files to Extend:**
- `packages/backend/src/routes/items.ts` (+ comp endpoints)
- `packages/backend/src/routes/sales.ts` (+ charity-close)
- `packages/backend/src/controllers/itemController.ts` (+ comp logic)
- `packages/backend/src/controllers/saleController.ts` (+ donation logic)
- `packages/frontend/pages/organizer/dashboard.tsx` (+ widget rendering)
- `packages/shared/src/index.ts` (+ settlement type exports)

**Migration File:**
- `packages/database/prisma/migrations/[timestamp]-settlement-hub-schema/migration.sql`

---

**Status:** Ready for Dev handoff
**Architect:** S367 findasale-architect
**QA Dependencies:** All schema changes must be validated; API contract must be tested end-to-end before production merge.
