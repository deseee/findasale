# ADR-072: Dual-Role Account Schema — User as Both Organizer & Shopper

**Status:** APPROVED FOR MIGRATION
**Decision Date:** 2026-03-20
**Scope:** Feature #72 (gate for #73, #74, #75)
**Risk Level:** 🔴 HIGH — schema change, requires zero-downtime migration
**Owner:** Architect + findasale-dev

---

## 1. Problem Statement

### Current State: Single Role Per User

Today, `User.role` is a string enum: `USER` (shopper) | `ORGANIZER` | `ADMIN`.

**A user can only hold one role at a time.** This creates three critical problems:

#### Problem 1A: Identity Fragmentation
An organizer who wants to browse and purchase items from other organizers must either:
- Switch accounts (poor UX, duplicate auth)
- Stay logged in as ORGANIZER, losing shopper-specific features (wishlists, favorites, hunter badges, stamp passport)

**Result:** Organizer-shoppers lose engagement; duplicate accounts pollute analytics.

#### Problem 1B: Notification Channel Chaos
Feature #73 (Two-Channel Notifications) requires distinct channels:
- **Organizer channel:** sale metrics, tier updates, lapse warnings
- **Shopper channel:** item arrivals, flash deals, wishlist alerts, badge unlocks

With a single `role`, we can't address both without either:
- Sending organizer emails to shopper inboxes (noise)
- Sending shopper alerts to organizer inboxes (alerts buried)
- Introducing complex preference trees (unmaintainable)

**Result:** Notification UX breaks for dual-role users.

#### Problem 1C: Consent & Tier State Fragmentation
Feature #74 (Role-Aware Registration Consent) needs separate consent records:
- Organizer consent: TERMS, PAYMENT_METHOD, BUSINESS_VERIFICATION
- Shopper consent: TERMS, MARKETING (optional)

Feature #75 (Tier Lapse State Logic) tracks subscription tier per role:
- Organizers have tiers (SIMPLE, PRO, TEAMS) with active/trialing/past_due/canceled states
- Shoppers have tier-gated features (hunter passport, treasure trails, appraisal voting)
- A user can be PRO organizer + STANDARD shopper simultaneously

With a single `role`, tier state is ambiguous: which role's tier applies to which feature?

**Result:** Tier lapse emails go to wrong role; features unlock/lock unpredictably.

#### Problem 1D: Data Integrity & Auth Ambiguity
- JWT claims use single `role` — unclear whether claim applies to organizer actions or shopper actions
- Ownership checks (`item.sale.organizer.id === user.id`) fail for dual-role users
- Shopper referral rewards accidentally awarded when role is ORGANIZER

**Result:** Silent bugs; data corruption in referral and tier systems.

---

## 2. Proposed Solution: Role Array + Dual Subscription Model

### 2.1 Schema Changes

#### New `User.roles` Field
Replace `User.role` (String, single value) with `User.roles` (String[]):

```prisma
model User {
  id            String     @id @default(cuid())
  email         String     @unique
  // ... existing fields ...

  // OLD: role String @default("USER")  // USER, ORGANIZER, ADMIN
  // NEW:
  roles         String[]   @default(["USER"]) // ["USER"], ["USER", "ORGANIZER"], ["USER", "ORGANIZER", "ADMIN"]

  // ... rest of relations unchanged ...
}
```

**Semantics:**
- Every user has `["USER"]` (shopper).
- Organizers add `"ORGANIZER"` → `["USER", "ORGANIZER"]`.
- Admins add `"ADMIN"` → `["USER", "ORGANIZER", "ADMIN"]` (rare, but possible for support staff who test as organizers).
- No user should have `["ORGANIZER"]` alone — all must be able to shop.

#### New `UserRoleSubscription` Table
Track per-role subscription state, tier, and consent:

```prisma
model UserRoleSubscription {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  role              String   // "ORGANIZER" | "SHOPPER" (always paired with a User.roles entry)

  // Subscription state (ORGANIZER role only; SHOPPER is always active)
  subscriptionTier  SubscriptionTier @default(SIMPLE) // SIMPLE | PRO | TEAMS
  subscriptionStatus String?          // active, trialing, past_due, canceled, null
  trialEndsAt       DateTime?
  stripeCustomerId  String?
  stripeSubscriptionId String?

  // Tier expiry (Feature #75 gate)
  tierLapseWarning  DateTime?  // When to send tier-lapse warning email (e.g., 7 days before trialEndsAt)
  tierLapsedAt      DateTime?  // When tier actually lapsed (SIMPLE fallback or canceled)
  tierResumedAt     DateTime?  // When user reactivated subscription

  // Token version for tier JWT (SECURITY FIX P0-1)
  tokenVersion      Int       @default(0) // Increment on tier upgrade

  // ORGANIZER ONLY: Stripe Connect (for payouts)
  stripeConnectId   String?

  // ORGANIZER ONLY: Reputation tier (Feature #71)
  reputationTier    String    @default("NEW") // NEW, TRUSTED, ESTATE_CURATOR
  verificationStatus String   @default("NONE") // NONE | PENDING | VERIFIED | REJECTED
  verifiedAt        DateTime?

  // Feature #74: Role-specific consent
  consentRecord     RoleConsent?

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@unique([userId, role]) // One subscription per role per user
}

model RoleConsent {
  id                String   @id @default(cuid())
  subscriptionId    String   @unique
  roleSubscription  UserRoleSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  role              String   // "ORGANIZER" | "SHOPPER"

  // Consent timestamps: null = not yet consented
  termsAcceptedAt   DateTime?
  privacyAcceptedAt DateTime?
  businessVerificationAcceptedAt DateTime? // ORGANIZER only
  paymentMethodAcceptedAt DateTime?        // ORGANIZER only
  marketingOptInAt  DateTime?              // SHOPPER only

  // Marketing email opt-out per role
  emailOptOut       Boolean   @default(false)

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```

#### Denormalization: Organizer Model Cleanup (Phase 2)
Move organizer-specific tier/consent fields to `UserRoleSubscription`:
- `Organizer.subscriptionTier` → `UserRoleSubscription.subscriptionTier` (where role="ORGANIZER")
- `Organizer.subscriptionStatus`, `trialEndsAt`, etc. → `UserRoleSubscription`
- `Organizer.verificationStatus`, `verifiedAt` → `UserRoleSubscription`
- `Organizer.tier` (reputation) → `UserRoleSubscription.reputationTier`

**Note:** `Organizer` model stays (1:1 relation to User) for business metadata (businessName, address, bio, etc.). Only subscription/tier state moves.

#### JWT Payload Expansion
Current JWT (organizer auth):
```json
{
  "userId": "cuid",
  "roles": ["USER", "ORGANIZER"],
  "role": "ORGANIZER", // Redundant, deprecated
  "tier": "PRO",
  "tokenVersion": 5
}
```

New JWT (multi-role auth):
```json
{
  "userId": "cuid",
  "roles": ["USER", "ORGANIZER"],
  "subscriptions": {
    "ORGANIZER": {
      "tier": "PRO",
      "status": "active",
      "tokenVersion": 5,
      "stripeConnectId": "acct_..."
    },
    "SHOPPER": {
      "tier": "STANDARD", // Implicit, future feature
      "status": "active",
      "tokenVersion": 1
    }
  }
}
```

---

### 2.2 Migration Path: Zero-Downtime Approach

#### Phase 1: Schema Deploy (No Auth Breaking)
1. Add `User.roles` column (STRING[] in PostgreSQL, default `["USER"]`)
2. Add `UserRoleSubscription` table (empty, no constraints yet)
3. Add `RoleConsent` table (empty)
4. Keep `User.role` column (will backfill in Phase 2)
5. Backfill all existing users:
   - If `User.role == "ADMIN"` → `User.roles = ["USER", "ORGANIZER", "ADMIN"]`
   - If `User.role == "ORGANIZER"` → `User.roles = ["USER", "ORGANIZER"]`
   - If `User.role == "USER"` → `User.roles = ["USER"]`

#### Phase 1b: Backfill UserRoleSubscription
For each user with an Organizer record:
```sql
INSERT INTO UserRoleSubscription (userId, role, subscriptionTier, subscriptionStatus, strialEndsAt, stripeCustomerId, stripeSubscriptionId, stripeConnectId, reputationTier, verificationStatus, verifiedAt, tokenVersion, createdAt, updatedAt)
SELECT
  u.id,
  'ORGANIZER',
  o.subscriptionTier,
  o.subscriptionStatus,
  o.trialEndsAt,
  o.stripeCustomerId,
  o.stripeSubscriptionId,
  o.stripeConnectId,
  o.reputationTier,
  o.verificationStatus,
  o.verifiedAt,
  o.tokenVersion,
  o.createdAt,
  o.updatedAt
FROM "User" u
JOIN "Organizer" o ON u.id = o.userId;
```

#### Phase 1c: Backfill RoleConsent
For each organizer subscription, assume they've accepted all required consents (they already onboarded):
```sql
INSERT INTO RoleConsent (subscriptionId, role, termsAcceptedAt, privacyAcceptedAt, businessVerificationAcceptedAt, paymentMethodAcceptedAt, createdAt, updatedAt)
SELECT
  urs.id,
  'ORGANIZER',
  u.createdAt, -- Assume terms accepted at signup
  u.createdAt,
  CASE WHEN urs.verificationStatus IN ('VERIFIED', 'REJECTED', 'PENDING') THEN u.createdAt ELSE NULL END,
  CASE WHEN urs.stripeConnectId IS NOT NULL THEN u.createdAt ELSE NULL END,
  u.createdAt,
  u.updatedAt
FROM "UserRoleSubscription" urs
JOIN "User" u ON urs.userId = u.id
WHERE urs.role = 'ORGANIZER';
```

#### Phase 2: Auth Layer Update (Backward Compatible)
1. Update JWT generation to include new `subscriptions` object
2. Support old `role` claim (read from first ORGANIZER subscription, or "USER" if none)
3. Add utility: `hasRole(user, "ORGANIZER")` → checks `user.roles.includes("ORGANIZER")`
4. Add utility: `getSubscriptionForRole(user, "ORGANIZER")` → returns `UserRoleSubscription` record
5. Auth middleware: Accept JWTs with old or new format; re-issue with new format if old

#### Phase 3: Remove Old Columns (Deferred, Post-Cleanup)
After all code uses new `User.roles` and `UserRoleSubscription`:
- Drop `User.role` column (3–6 months post-Phase-1)
- Remove `Organizer.subscriptionTier`, `subscriptionStatus`, etc. (move to `UserRoleSubscription`)
- Retire old JWT format acceptance (force re-auth, ~2-minute window)

---

### 2.3 Data Consistency Rules

**Invariants:**
1. Every user must have at least one role: `"USER"` is always present.
2. If `"ORGANIZER"` in `User.roles`, there must be exactly one `UserRoleSubscription` record with `role="ORGANIZER"`.
3. If user is shopping, there is an implicit `"USER"` role (no subscription table, features are free tier).
4. All consents must be recorded in `RoleConsent` before unlocking role-specific features.

**Queries:**
```typescript
// Get user's organizer subscription
const orgSubscription = await prisma.userRoleSubscription.findUnique({
  where: { userId_role: { userId, role: "ORGANIZER" } },
});

// List all roles a user holds
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: { subscriptions: true }, // NEW relation
});

// Check if user is organizer
const isOrganizer = user.roles.includes("ORGANIZER");

// Get user's organizer tier
const tier = orgSubscription?.subscriptionTier ?? "SIMPLE"; // Fallback if no subscription
```

---

## 3. Implementation Order for #73, #74, #75

### Dependency Graph

```
ADR-072 (Dual-Role Schema)
├─ Phase 1: Schema Deploy
│  └─ Phase 1b: Backfill UserRoleSubscription
│     └─ Phase 1c: Backfill RoleConsent
│
├─→ Feature #74 (Role-Aware Registration Consent)
│   Depends on: RoleConsent table (Phase 1c)
│   Deliverables: Consent flow for new ORGANIZER signups
│   Can start: After Phase 1c
│
├─→ Feature #75 (Tier Lapse State Logic)
│   Depends on: UserRoleSubscription table + tierLapseWarning field
│   Deliverables: Cron job monitoring tier expirations, email triggers
│   Can start: After Phase 1b
│
└─→ Feature #73 (Two-Channel Notifications)
    Depends on: UserRoleSubscription + RoleConsent (for opt-out tracking)
    Deliverables: Separate notification queues per role
    Can start: After Phase 1 (but better after #74 consent is enforced)
```

### Recommended Timeline

| Task | Sprint | Duration | Blocker? | Notes |
|------|--------|----------|----------|-------|
| **Phase 1: Schema Deploy** | S1 | 1 day | Yes | Deploy to Neon, backfill, health-check queries |
| **Phase 1b: Backfill UserRoleSubscription** | S1 | 2 hours | Yes | SQL bulk insert, verify counts |
| **Phase 1c: Backfill RoleConsent** | S1 | 2 hours | Yes | Assume existing organizers consented at signup |
| **Phase 2: Auth Update** | S1 | 1 day | Partial | JWT generation + backward-compat middleware, no breaking change |
| **Feature #74 (Registration Consent)** | S2 | 2 days | No | Consent UI + API validation, new organizer signups only |
| **Feature #75 (Tier Lapse)** | S2 | 2 days | No | Cron job + email service, run in parallel with #74 |
| **Feature #73 (Two-Channel Notifications)** | S3 | 3 days | No | Notification queue refactor, can run after #74 & #75 |

**Critical Path:** Phase 1 → Phase 2 → parallel (#74, #75) → #73.

---

## 4. Decision & Rationale

### Why Not a Simpler Alternative?

#### Alternative A: Keep Single Role, Use Separate "ShopperProfile" Table
**Problem:** Auth logic becomes bifurcated. Organizers login as ORGANIZER but need to "switch" to shopper context. JWT claims stay single. Notification channels remain ambiguous.
**Rejected:** Adds cognitive load without solving the core problem (identity fragmentation).

#### Alternative B: Allow `User.role = "ORGANIZER_SHOPPER"` Enum
**Problem:** Tier state is still ambiguous (which tier applies to which role?). Consent is implicit. Doesn't scale to future roles (e.g., "AFFILIATE", "RESELLER").
**Rejected:** Inflexible; doesn't address #74 consent or #75 tier lapse.

#### Alternative C: Single Subscription Table, Nullable Role Field
**Problem:** Harder to index and query. Still ambiguous which subscription is "active" for a user with multiple roles.
**Rejected:** Complexity without benefit.

### Why This Solution?

✅ **Solves all three problems:**
- Identity: Users have clear, persistent roles; can act in both contexts simultaneously.
- Notifications: Separate `RoleConsent` records allow per-role opt-outs and channel configuration.
- Tier state: Each role has its own subscription, tier, and lapse tracking.

✅ **Backward compatible:**
- Old `User.role` column stays during Phase 1–2 (no forced re-auth).
- JWT generation supports both old and new formats.
- Existing auth middleware works unchanged.

✅ **Scales to future roles:**
- Adding "RESELLER" or "AFFILIATE" only requires a new `UserRoleSubscription` record.
- No schema overhaul needed.

✅ **Data integrity:**
- Unique constraint on `(userId, role)` prevents duplicates.
- Explicit consent tracking prevents accidental feature unlock.

---

## 5. Risks & Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Migration locks DB during backfill** | 🔴 HIGH | Backfill in batches; use `LIMIT 10000` per transaction; schedule during low traffic (11 PM PST). Monitor `pg_stat_activity` for locks. |
| **JWT bloat (subscriptions object large)** | 🟡 MEDIUM | Compress subscriptions object; Redis cache for token validation; issue shorter TTL (30 min instead of 7 days) initially. |
| **Auth bug: users locked out after Phase 2 deploy** | 🔴 HIGH | Deploy Phase 2 behind feature flag. Test old JWT acceptance with production data (staging snapshot). Rollback plan: revert code; old JWTs still work. |
| **Organizer tier state lost during migration** | 🔴 CRITICAL | Backfill verified in staging. Verify totals before/after: `SELECT COUNT(*) FROM Organizer` vs `SELECT COUNT(*) FROM UserRoleSubscription WHERE role='ORGANIZER'` (must match). |
| **Shopper features accidentally gated on organizer tier** | 🟠 MEDIUM-HIGH | Code review all tier checks; add test: `assert(user.roles.includes("USER"))` before allowing shopper features. Feature flag new tier checks until validated in staging. |
| **Notification preference logic breaks for dual-role users** | 🟠 MEDIUM | Query `RoleConsent.emailOptOut` per role, not per user. Validate against existing organizer email preferences; migrate to per-role settings in Phase 2. |

---

## 6. Rollback Plan

### If Migration Fails During Phase 1 Backfill

**Immediate (< 5 min):**
1. Stop all app instances (Railway scale to 0).
2. Kill any long-running backfill transaction: `SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE query LIKE '%INSERT INTO UserRoleSubscription%';`
3. Neon: Revert to backup taken before migration (Neon retains 7-day backup window).

**Full Rollback (if backup restore succeeds):**
1. Restore Neon to pre-migration point.
2. Drop new columns: `ALTER TABLE "User" DROP COLUMN roles; DROP TABLE IF EXISTS "UserRoleSubscription", "RoleConsent";`
3. Restart app instances with old code (commit hash before Phase 1).
4. Verify: `SELECT COUNT(*) FROM "User" WHERE role IS NOT NULL;` (should match baseline).
5. Manually run `npx prisma migrate resolve --rolled-back <migration-name>` to mark migration as rolled back in `_prisma_migrations`.

**Partial Rollback (if backfill succeeded but Phase 2 auth fails):**
1. App code: revert auth changes (still accept old `role` claim).
2. Keep new schema (Organizer → UserRoleSubscription backfill is safe).
3. Restart; old JWTs still valid; regenerate with new code over 24–48 hours.

### Validation Before Declaring Success
```sql
-- Phase 1 Success Checklist
-- 1. All users have roles array:
SELECT COUNT(*) FROM "User" WHERE roles IS NULL OR array_length(roles, 1) = 0; -- Should be 0

-- 2. All organizers have UserRoleSubscription:
SELECT COUNT(*) FROM "Organizer" o WHERE NOT EXISTS (
  SELECT 1 FROM "UserRoleSubscription" WHERE userId = o.userId AND role = 'ORGANIZER'
); -- Should be 0

-- 3. No duplicate subscriptions per role:
SELECT userId, role, COUNT(*) FROM "UserRoleSubscription" GROUP BY userId, role HAVING COUNT(*) > 1; -- Should be 0 rows

-- 4. All tier data migrated:
SELECT COUNT(*) FROM "UserRoleSubscription" WHERE subscriptionTier IS NULL; -- Should be 0 (or acceptable count)
```

---

## 7. Appendix: SQL Migration File Reference

### `packages/database/prisma/migrations/[timestamp]_add_dual_role_schema.sql`

```sql
-- Step 1: Add User.roles array column
ALTER TABLE "User" ADD COLUMN roles TEXT[] DEFAULT ARRAY['USER']::TEXT[];

-- Step 2: Create UserRoleSubscription table
CREATE TABLE "UserRoleSubscription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "subscriptionTier" TEXT NOT NULL DEFAULT 'SIMPLE',
  "subscriptionStatus" TEXT,
  "trialEndsAt" TIMESTAMP(3),
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "tierLapseWarning" TIMESTAMP(3),
  "tierLapsedAt" TIMESTAMP(3),
  "tierResumedAt" TIMESTAMP(3),
  "tokenVersion" INTEGER NOT NULL DEFAULT 0,
  "stripeConnectId" TEXT,
  "reputationTier" TEXT NOT NULL DEFAULT 'NEW',
  "verificationStatus" TEXT NOT NULL DEFAULT 'NONE',
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserRoleSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "UserRoleSubscription_userId_role_key" UNIQUE ("userId", "role")
);

-- Step 3: Create RoleConsent table
CREATE TABLE "RoleConsent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "subscriptionId" TEXT NOT NULL UNIQUE,
  "role" TEXT NOT NULL,
  "termsAcceptedAt" TIMESTAMP(3),
  "privacyAcceptedAt" TIMESTAMP(3),
  "businessVerificationAcceptedAt" TIMESTAMP(3),
  "paymentMethodAcceptedAt" TIMESTAMP(3),
  "marketingOptInAt" TIMESTAMP(3),
  "emailOptOut" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoleConsent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "UserRoleSubscription" ("id") ON DELETE CASCADE
);

-- Step 4: Backfill User.roles from User.role
UPDATE "User"
SET roles = ARRAY['USER', 'ORGANIZER']::TEXT[]
WHERE role = 'ORGANIZER';

UPDATE "User"
SET roles = ARRAY['USER', 'ORGANIZER', 'ADMIN']::TEXT[]
WHERE role = 'ADMIN';

-- (All other users default to ['USER'])

-- Step 5: Create indexes for performance
CREATE INDEX "UserRoleSubscription_userId_idx" ON "UserRoleSubscription" ("userId");
CREATE INDEX "UserRoleSubscription_role_idx" ON "UserRoleSubscription" ("role");
CREATE INDEX "RoleConsent_subscriptionId_idx" ON "RoleConsent" ("subscriptionId");

-- Step 6: Backfill UserRoleSubscription (Run as separate batch transaction with monitoring)
-- This is done in application code (Prisma seed or migration script) to avoid long locks
```

---

## 8. Approval & Sign-Off

**Schema Authority:** Architect (approved)
**Security Review:** P0-1 token version increments confirmed; JWT expansion validated
**Deployment Approval:** Patrick (pending Phase 1 staging test)
**Go/No-Go Criteria:**
- ✅ Staging migration completes without locks (< 5 min)
- ✅ Backfill verify queries pass (counts match baseline)
- ✅ Old JWT format still accepted; new JWTs can be issued
- ✅ Zero login failures during deployment window
- ✅ Rollback tested in staging; < 10 min execution time

---

**Document Version:** 1.0
**Last Updated:** 2026-03-20
**Next Review:** Post-Phase-1 deployment (gather migration metrics)
