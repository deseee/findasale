## ADR — Lucky Roll: Schema, API Contracts, and Migration Plan — 2026-04-08
**Session:** S419  
**Status:** LOCKED — Ready for dev dispatch  
**Game design authority:** `gamedesign-decisions-2026-04-08.md` Section 4 (all decisions locked)

---

## Decision

Lucky Roll is an XP-only weekly gacha mechanic with a 7-outcome reward table, two-layer pity counter, hidden streak protection, and full regulatory transparency. No cash rail, ever.

This ADR defines the **schema additions**, **migration plan**, **API contracts**, and **dev implementation sequence**. Game design decisions (reward table, pity rules, RNG algorithm, regulatory requirements) are in the gamedesign doc and are not re-stated here except as constraints.

---

## Schema Changes

### 1. User model additions (4 new fields)

Add to the User model after the `boostPurchases` line (line ~195 in schema.prisma):

```prisma
  // Phase 2b: Lucky Roll — weekly XP gacha
  luckyRollPityCount  Int       @default(0)  // Consecutive consolation-outcome roll count (0, 1, 2; layer-1 pity fires at 2)
  luckyRollPityYear   Int       @default(0)  // Cumulative roll count this calendar year (layer-2 jackpot guarantee fires every 10)
  luckyRollLastRolledAt DateTime?            // Most recent roll timestamp — enforces weekly cap
  luckyRollStreakBad  Int       @default(0)  // Hidden: consecutive below-break-even count (consolation or 50 XP); streak protection doubles jackpot% at 5
```

**Field notes:**
- `luckyRollPityYear` resets to 0 on January 1 UTC as part of the existing seasonal reset job.
- `luckyRollStreakBad` is never exposed to the user. It is an internal anti-frustration counter only.
- `luckyRollLastRolledAt` is the only field needed to determine weekly eligibility. Do not add a separate `luckyRollWeeklyCount` field — derive it from comparing the last roll date to the Sunday 23:59:59 UTC weekly reset boundary.

### 2. LuckyRoll event log model (new model)

```prisma
// Phase 2b: Lucky Roll — audit log of all rolls
model LuckyRoll {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  outcome     LuckyRollOutcome
  xpAwarded   Int?                // null for COUPON_1 and COSMETIC_RARE outcomes
  xpSpent     Int      @default(100)
  seedHash    String              // SHA256(raw seed bytes) — verifiable, not reversible
  rollNumber  Int                 // user's annual roll sequence number (for pity-year tracking)
  pityFired   Boolean  @default(false)  // true if layer-1 or layer-2 pity modified this roll
  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([userId, createdAt])
}

enum LuckyRollOutcome {
  CONSOLATION    // 10 XP back (35%)
  XP_50          // 50 XP (28%)
  XP_100         // 100 XP break-even (15%)
  XP_200         // 200 XP (10%)
  COUPON_1       // $1-off coupon, $10+ min purchase (7%)
  XP_500         // 500 XP jackpot (4%)
  COSMETIC_RARE  // Rare frame badge or username color (1%)
}
```

### 3. User model relation backlink

Add `luckyRolls LuckyRoll[]` to User model (after `boostPurchases BoostPurchase[]`).

---

## Migration Plan

**File:** `packages/database/prisma/migrations/20260408_add_lucky_roll_schema/migration.sql`

```sql
-- Phase 2b: Lucky Roll schema additions

-- 1. Add Lucky Roll tracking fields to User
ALTER TABLE "User" ADD COLUMN "luckyRollPityCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "luckyRollPityYear" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "luckyRollLastRolledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "luckyRollStreakBad" INTEGER NOT NULL DEFAULT 0;

-- 2. Create LuckyRollOutcome enum
CREATE TYPE "LuckyRollOutcome" AS ENUM (
  'CONSOLATION', 'XP_50', 'XP_100', 'XP_200', 'COUPON_1', 'XP_500', 'COSMETIC_RARE'
);

-- 3. Create LuckyRoll event log table
CREATE TABLE "LuckyRoll" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "outcome"     "LuckyRollOutcome" NOT NULL,
  "xpAwarded"   INTEGER,
  "xpSpent"     INTEGER NOT NULL DEFAULT 100,
  "seedHash"    TEXT NOT NULL,
  "rollNumber"  INTEGER NOT NULL,
  "pityFired"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LuckyRoll_pkey" PRIMARY KEY ("id")
);

-- 4. FK and indexes
ALTER TABLE "LuckyRoll" ADD CONSTRAINT "LuckyRoll_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "LuckyRoll_userId_idx" ON "LuckyRoll"("userId");
CREATE INDEX "LuckyRoll_userId_createdAt_idx" ON "LuckyRoll"("userId", "createdAt");
```

## Rollback: 20260408_add_lucky_roll_schema

**Down migration:**
```sql
DROP TABLE IF EXISTS "LuckyRoll";
DROP TYPE IF EXISTS "LuckyRollOutcome";
ALTER TABLE "User" DROP COLUMN IF EXISTS "luckyRollPityCount";
ALTER TABLE "User" DROP COLUMN IF EXISTS "luckyRollPityYear";
ALTER TABLE "User" DROP COLUMN IF EXISTS "luckyRollLastRolledAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "luckyRollStreakBad";
```

**Playbook:** "If Railway deploy fails after this migration, run the down migration via psql against the Railway DB. This migration only adds columns and a new table — existing data is unaffected. No data loss risk."

---

## API Contracts

### GET /api/lucky-roll/eligibility
Public (auth optional). Returns roll availability and the full transparent odds table (regulatory requirement).

**Response:**
```json
{
  "canRoll": true,
  "rollsRemainingThisWeek": 1,
  "weeklyLimit": 1,
  "nextRollAt": null,
  "xpCost": 100,
  "userXpBalance": 450,
  "canAfford": true,
  "rewardTable": [
    { "outcome": "CONSOLATION",   "probability": 35, "description": "10 XP back",         "xpValue": 10 },
    { "outcome": "XP_50",         "probability": 28, "description": "50 XP",               "xpValue": 50 },
    { "outcome": "XP_100",        "probability": 15, "description": "100 XP",              "xpValue": 100 },
    { "outcome": "XP_200",        "probability": 10, "description": "200 XP",              "xpValue": 200 },
    { "outcome": "COUPON_1",      "probability": 7,  "description": "$1 coupon ($10+ min)","xpValue": null },
    { "outcome": "XP_500",        "probability": 4,  "description": "500 XP jackpot",      "xpValue": 500 },
    { "outcome": "COSMETIC_RARE", "probability": 1,  "description": "Rare cosmetic",       "xpValue": null }
  ],
  "legalNotice": "No real-money purchase required. XP cannot be exchanged for cash."
}
```

**When canRoll is false** (weekly cap hit):
```json
{
  "canRoll": false,
  "rollsRemainingThisWeek": 0,
  "nextRollAt": "2026-04-13T23:59:59.000Z",
  ...
}
```

---

### POST /api/lucky-roll/roll
**Auth required.** Authenticated shopper only. No request body needed.

**Server-side flow (in order):**
1. Load user, verify: `guildXp >= 100`, account age >= 30 days, weekly rolls remaining > 0
2. Apply pity counter adjustments to probability weights:
   - Layer 1: if `luckyRollPityCount >= 2`, remove CONSOLATION from table, redistribute its 35% proportionally
   - Layer 2: if `(luckyRollPityYear + 1) % 10 === 0`, force outcome to one of: XP_200, COUPON_1, XP_500, COSMETIC_RARE (pick via sub-RNG from those 4 only)
   - Streak protection: if `luckyRollStreakBad >= 5`, double XP_500 weight from 4% to 8% for this roll only (not disclosed to user)
3. Generate 4 bytes via `crypto.randomBytes(4)`, read as uint32, mod 10000, bucket lookup
4. Open `prisma.$transaction`:
   a. Deduct 100 XP via `xpService.spendXp`
   b. Award outcome (awardXp for XP outcomes, generateShopperCoupon for COUPON_1, cosmetic grant for COSMETIC_RARE)
   c. Increment `luckyRollPityYear` by 1
   d. Update `luckyRollPityCount`: 0 if non-consolation, +1 if consolation (capped at 3 for safety)
   e. Update `luckyRollStreakBad`: 0 if outcome >= XP_100, +1 if consolation or XP_50
   f. Set `luckyRollLastRolledAt = now()`
   g. Create `LuckyRoll` audit log row
5. Return result

**Success response:**
```json
{
  "outcome": "XP_200",
  "xpAwarded": 200,
  "couponCode": null,
  "description": "Nice roll! +200 XP",
  "celebrationTier": "WIN",
  "rollNumber": 3,
  "pityFired": false,
  "newXpBalance": 550,
  "nextRollAt": "2026-04-13T23:59:59.000Z",
  "rollsRemainingThisWeek": 0
}
```

**celebrationTier values** (drives frontend animation):
- `JACKPOT` — XP_500 or COSMETIC_RARE
- `WIN` — XP_200 or COUPON_1
- `BREAK_EVEN` — XP_100
- `CONSOLATION` — XP_50 or CONSOLATION

**Error responses:**
- `400` — insufficient XP: `{ message: "Lucky Roll costs 100 XP. You have N XP." }`
- `400` — weekly cap: `{ message: "You've already rolled this week. Next roll available [date].", nextRollAt: "..." }`
- `400` — account too new: `{ message: "Account must be at least 30 days old to roll." }`
- `401` — not authenticated

---

### Weekly reset boundary
Sunday 23:59:59 UTC. Server checks: "has the user rolled since last Sunday 23:59:59 UTC?" If `luckyRollLastRolledAt` is null or before last reset boundary → eligible for another roll (up to weekly limit).

Hunt Pass eligibility: check `user.huntPassActive === true && user.huntPassExpiry > now()`. Weekly limit = 2 for Hunt Pass, 1 for base.

---

## Dev Implementation Sequence

1. **schema.prisma** — add 4 User fields + LuckyRoll model + LuckyRollOutcome enum
2. **migration.sql** — create the file above at `20260408_add_lucky_roll_schema/`
3. **`packages/backend/src/services/luckyRollService.ts`** (new) — core roll logic:
   - `buildProbabilityTable(user)` — applies pity adjustments, returns bucketed int ranges
   - `performRoll(userId)` — full transactional roll (steps 1–5 above)
   - `getEligibility(userId)` — checks weekly cap and XP balance
4. **`packages/backend/src/controllers/luckyRollController.ts`** (new) — `getEligibility`, `roll` handlers
5. **`packages/backend/src/routes/lucky-roll.ts`** (new) — `GET /eligibility` (public), `POST /roll` (auth)
6. **`packages/backend/src/index.ts`** — wire `app.use('/api/lucky-roll', luckyRollRouter)`
7. **`packages/frontend/pages/shopper/lucky-roll.tsx`** (new) — shopper-facing roll UI:
   - Transparency: full odds table always visible
   - Roll button / countdown timer
   - Celebration animation tiers (CONSOLATION/BREAK_EVEN/WIN/JACKPOT)
   - Legal notice on page
8. **Hunt Pass page** — add Lucky Roll sink row to the "Spend Your XP" section (1 roll/week or 2/week Hunt Pass)

**Order constraint:** Steps 1–2 must deploy before steps 3–6 (migration before code). Steps 3–6 can deploy together. Step 7–8 can deploy after step 6.

---

## COSMETIC_RARE award implementation note

The `COSMETIC_RARE` outcome grants one of: Custom Frame Badge OR Custom Username Color (randomly selected 50/50 at award time). Implementation: create a `CosmeticGrant` record or flag it via a `PointsTransaction` row with `source: 'LUCKY_ROLL_COSMETIC'` and zero XP value. The rendering system for profile cosmetics must check for `LUCKY_ROLL_COSMETIC` grants in addition to XP-purchased cosmetics. **Flag to Dev:** this is the most complex award branch — implement last, stub out in first pass with a simple XP fallback (award 150 XP instead) and complete the cosmetic system in the next sprint if cosmetic rendering isn't already wired.

---

## Consequences

- Lucky Roll is now a permanent weekly ritual for active shoppers — drives return visits
- The pity counter requires 4 DB fields on User; they are cheap but must be included in seasonal reset
- `luckyRollPityYear` resets to 0 in the seasonal reset cron job (January 1 UTC)
- `LuckyRoll` table will grow ~52 rows/year per active Hunt Pass shopper — not a scaling concern at current userbase
- No cash rail decision is locked per game design — do not revisit

## Constraints Added

- **HARD RULE:** Lucky Roll XP cost is 100 XP. Do not change without game designer sign-off.
- **HARD RULE:** All RNG is server-side via `crypto.randomBytes`. No client-side randomness.
- **HARD RULE:** Full odds table must be visible on the roll page at all times (regulatory).
- **HARD RULE:** `luckyRollPityYear` resets annually — include in seasonal reset job.
