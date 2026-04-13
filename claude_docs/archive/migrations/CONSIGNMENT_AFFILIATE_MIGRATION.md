# Schema Pre-Wire: Consignment + Affiliate (Migration 20260320191632)

## Summary

Added nullable fields to pre-wire consignment and affiliate features into the schema with zero risk to existing data. All changes are additive-only — no existing columns modified, no data migration required.

## Files Changed

1. **packages/database/prisma/schema.prisma** — Updated
   - Added `consignorId` and `consignmentSplitPct` to Item model
   - Added `affiliateReferralCode` to User model
   - Added `affiliatePayoutsGiven` and `affiliatePayoutsReceived` relations to User model
   - Added new `AffiliatePayout` model

2. **packages/database/prisma/migrations/20260320191632_prewire_consignment_affiliate/migration.sql** — Created

## Schema Changes Detail

### Item Model (Consignment)
```prisma
// Feature #70: Consignment — operator-consigned items with split payout
consignorId      String?                       // Optional: consignor user ID (nullable for future Consignor table)
consignmentSplitPct Decimal?                   // Optional: percentage split for consignor (e.g., 0.70 = 70%)
```

**Rationale:**
- `consignorId`: Stores the consignor's user ID (nullable now; can reference a future Consignor table later)
- `consignmentSplitPct`: Decimal(5,2) — stores split percentage (e.g., 0.70 = consignor gets 70%, organizer gets 30%)
- Both nullable — existing items unaffected

### User Model (Affiliate)
```prisma
// Feature #72: Affiliate Program — referral code and payouts
affiliateReferralCode String?              @unique  // Unique code for affiliate referral tracking
affiliatePayoutsGiven   AffiliatePayout[]  @relation("AffiliatePayoutsGiven")
affiliatePayoutsReceived AffiliatePayout[] @relation("AffiliatePayoutsReceived")
```

**Rationale:**
- `affiliateReferralCode`: Unique referral code for tracking affiliate signups/purchases
- Relations: User can have many affiliate payouts as both referrer and referee

### AffiliatePayout Table (New)
```sql
CREATE TABLE "AffiliatePayout" (
    "id" TEXT PRIMARY KEY,
    "referrerId" TEXT NOT NULL FK → User.id,
    "referredUserId" TEXT FK → User.id (nullable),
    "saleId" TEXT FK → Sale.id (nullable),
    "amount" DECIMAL(15,2),
    "status" TEXT DEFAULT 'PENDING', // PENDING | PAID | CANCELLED
    "paidAt" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT now(),
    "updatedAt" TIMESTAMP
);
```

**Indexes:**
- `AffiliatePayout_referrerId_idx` — Track payouts by affiliate
- `AffiliatePayout_referredUserId_idx` — Find who referred this user
- `AffiliatePayout_saleId_idx` — Link payout to sale (campaign-specific or sale-specific)
- `AffiliatePayout_status_idx` — Query by status (PENDING, PAID, CANCELLED)

## Rollback Plan

If needed to rollback this migration (not recommended unless migration fails), execute in PostgreSQL:

```sql
-- Drop AffiliatePayout table
DROP TABLE IF EXISTS "AffiliatePayout" CASCADE;

-- Remove User columns
ALTER TABLE "User" DROP COLUMN IF EXISTS "affiliateReferralCode";

-- Remove Item columns
ALTER TABLE "Item" DROP COLUMN IF EXISTS "consignmentSplitPct";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "consignorId";
```

Then in schema.prisma, remove:
- `affiliateReferralCode`, `affiliatePayoutsGiven`, `affiliatePayoutsReceived` from User model
- `consignorId`, `consignmentSplitPct` from Item model
- Entire `AffiliatePayout` model

Finally:
```bash
npx prisma migrate resolve --rolled-back 20260320191632_prewire_consignment_affiliate
```

## Deploy Instructions (Patrick Manual Actions)

### 1. Apply migration to Neon (production database)

Open PowerShell and run:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
npx prisma migrate deploy
```

**CRITICAL:** Use the non-pooled Neon hostname (without `-pooler`). Do NOT use localhost connection string — it will apply to the wrong database.

### 2. Regenerate Prisma client

```powershell
npx prisma generate
```

This updates TypeScript types in `@findasale/database` with the new fields.

### 3. Deploy backend to Railway

Push the schema changes via GitHub (main branch):

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260320191632_prewire_consignment_affiliate/migration.sql
git commit -m "Schema pre-wire: consignment + affiliate program (feature #70, #72)"
.\push.ps1
```

Railway will auto-detect the new commit and redeploy the backend. The migration is not auto-run by Railway — only the migration deploy step above applies it to Neon.

### 4. Verify

- Check Neon dashboard that new columns/table exist
- Verify Vercel/Railway builds succeed
- No code changes required yet — features are gated behind config flags

## Zero-Risk Deployment

- **Backwards compatible:** Existing items/users continue to work unchanged
- **No data transformation:** No UPDATE statements, no recalculation
- **Idempotent migration:** Can be applied multiple times safely (Prisma tracks it)
- **Nullable fields:** Default behavior is "no consignment" and "no affiliate"
- **Safe rollback:** If migration fails, rollback is clean (just drop new columns/table)

## Future Work

Once data is live:
1. Create feature flag for `CONSIGNMENT_ENABLED` and `AFFILIATE_PROGRAM_ENABLED`
2. Add consignment fee logic to Stripe payout splitting
3. Implement affiliate link tracking in frontend
4. Add affiliate dashboard for tracking referrals and payouts
5. Create job queue for processing affiliate payouts (weekly/monthly)

No schema changes needed beyond this pre-wire.
