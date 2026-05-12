# Architect Assessment: Feedback System Schema Design
**Date:** 2026-04-05
**Reviewer:** FindA.Sale Systems Architect
**For:** UX Team + Dev Lead (findasale-dev dispatch)
**Status:** Approved with recommendations

---

## Executive Summary

The proposed feedback system schema is **architecturally sound** and follows FindA.Sale patterns. The 10-survey system is implementable without risk to production.

**Recommendation:** Proceed to `findasale-dev` with the approved schema below and migration plan.

---

## Schema Assessment

### 1. FeedbackSuppression Table Design — APPROVED

**Proposed:**
```prisma
model FeedbackSuppression {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  surveyType  String   // e.g., "OG-1", "SH-2", "BOTH-1"
  suppressedAt DateTime @default(now())

  @@unique([userId, surveyType])
  @@index([userId])
}
```

**Why this is correct:**
- **Separate table vs. JSON column:** A separate table is the right choice. Reasons:
  - Lookups are fast: `SELECT surveyType FROM FeedbackSuppression WHERE userId = X AND surveyType = Y`
  - Query patterns (list all suppressions for a user, check a single suppression) are clean
  - Suppression cascades cleanly on user deletion (`onDelete: Cascade`)
  - Future: if we want to add `reEnabledAt` or audit trails, the table scales; JSON would require re-serialization
- **Composite unique constraint** prevents duplicate suppressions (one row per user-survey combo)
- **Index on userId** ensures quick lookups during survey-trigger checks
- **Not storing suppression reason/timestamp** is fine for now — the `suppressedAt` timestamp tells us when they suppressed it (useful for analytics: "how many users suppressed each survey within 30 days?")

**No soft deletes needed.** Suppression records are immutable facts — once created, they persist. Deleting them means "re-enable survey," which is explicitly not in scope per the spec ("no UI to re-enable"). If we ever add an admin UI to reset suppressions, use UPDATE (set a `reEnabledAt` field) not DELETE.

---

### 2. User Model Extensions — APPROVED with one clarification

**Proposed:**
```prisma
  feedbackSuppressions FeedbackSuppression[] @relation()
  firstSalePublished   Boolean @default(false)
  lastSurveyShownAt    DateTime?
```

**Assessment:**

#### `firstSalePublished` Boolean — KEEP on User model
- **Why:** It's the gate for OG-1 trigger. The spec says "Once ever (not per sale — use a `firstSalePublished` flag in User model)."
- **Alternative considered:** Derive from `SELECT EXISTS(SELECT 1 FROM Sale WHERE organizerId = X AND status = 'PUBLISHED')`
  - **Why we reject this:** Every OG-1 trigger check would require a DB query to Sales table. With ~1000 organizers doing first publishes, that's ~1000 extra queries per week. The boolean is cheaper.
- **Migration:** Set `firstSalePublished = true` for any user who already has a published sale (backfill query provided below)
- **Default:** `false` — safe, no action needed on user creation

#### `lastSurveyShownAt` DateTime — KEEP on User model, but clarify scope
- **Current spec:** "Max 1 survey per 24 hours" (rolling window). Check: `now() - lastSurveyShownAt >= 24 * 60 * 60 * 1000`
- **Type:** DateTime? is correct (nullable = user has never seen a survey)
- **Query pattern:** `SELECT * FROM User WHERE lastSurveyShownAt IS NULL OR lastSurveyShownAt < now() - interval '24 hours'` — simple, no join
- **Alternative considered:** Store per-survey cooldown (e.g., JSON `{surveyType: timestamp}`)
  - **Why we reject:** The spec says "max 1 per 24h" is a global cap (across all surveys), not per-survey. A single timestamp is correct.
  - **Exception:** The 30-minute cooldown between *any* surveys is session-level (frontend localStorage or React context), not DB-backed. This is fine — cooldown resets on page reload.

#### `feedbackSuppressions` Relation — KEEP as-is
- Declaring the reverse relation on User is correct Prisma hygiene. No performance concern.

---

### 3. Feedback Model — No Changes Needed

Current model:
```prisma
model Feedback {
  id        String   @id @default(cuid())
  userId    String?
  user      User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  rating    Int      // 1-5
  text      String?
  page      String?
  userAgent String?
  createdAt DateTime @default(now())
}
```

**What the spec adds:**
- Extend to store `surveyType` (e.g., "OG-1", "SH-2") so we can filter responses by survey
- Store device type (mobile vs. desktop) — useful for UX analysis
- Store user's tier at response time (organizer tier, shopper tier) — for segmentation

**Recommendation:** Extend Feedback model:
```prisma
model Feedback {
  id        String   @id @default(cuid())
  userId    String?
  user      User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  rating    Int?     // 1-5 (nullable: some surveys use text answers only)
  text      String?
  page      String?
  userAgent String?

  // NEW: Feedback context
  surveyType    String?    // "OG-1", "SH-2", null for legacy static form
  deviceType    String?    // "mobile", "desktop"
  userTierAtTime String?   // e.g., "SIMPLE", "PRO", null if not applicable

  createdAt DateTime @default(now())

  // Optional: for analytics speed
  @@index([surveyType, createdAt])
  @@index([userId, surveyType])
}
```

**Why:**
- `surveyType` lets you query "all responses for OG-1" and spot patterns
- `deviceType` answers "do mobile users skip surveys more often?"
- `userTierAtTime` answers "do PRO tier organizers feel differently about photo uploads than SIMPLE tier?"
- Indexes make dashboard queries fast (no seq scans on 100k+ feedback rows)

---

### 4. Migration Plan — APPROVED

**Scope:** 3 new columns on User, 1 new table, 1 enhanced model.

**Migration file name:** `20260405_add_feedback_system.sql`

**Steps (in order):**

```sql
-- Step 1: Create FeedbackSuppression table
CREATE TABLE "FeedbackSuppression" (
  id VARCHAR(255) PRIMARY KEY,
  "userId" VARCHAR(255) NOT NULL,
  "surveyType" VARCHAR(255) NOT NULL,
  "suppressedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId", "surveyType"),
  FOREIGN KEY("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

-- Create index for fast lookups during trigger checks
CREATE INDEX "FeedbackSuppression_userId_idx" ON "FeedbackSuppression"("userId");

-- Step 2: Add columns to User table
ALTER TABLE "User" ADD COLUMN "firstSalePublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lastSurveyShownAt" TIMESTAMP;

-- Step 3: Backfill firstSalePublished = true for organizers with published sales
UPDATE "User"
SET "firstSalePublished" = true
WHERE id IN (
  SELECT DISTINCT "organizerId"
  FROM "Sale"
  WHERE status = 'PUBLISHED'
    AND "deletedAt" IS NULL
);

-- Step 4: Extend Feedback model with new columns
ALTER TABLE "Feedback"
  ADD COLUMN "surveyType" VARCHAR(255),
  ADD COLUMN "deviceType" VARCHAR(50),
  ADD COLUMN "userTierAtTime" VARCHAR(255),
  ALTER COLUMN "rating" DROP NOT NULL;  -- rating is now optional (some surveys use text only)

-- Step 5: Create indexes for analytics queries
CREATE INDEX "Feedback_surveyType_createdAt_idx" ON "Feedback"("surveyType", "createdAt" DESC);
CREATE INDEX "Feedback_userId_surveyType_idx" ON "Feedback"("userId", "surveyType");
```

**Execution:**
- Architect reviews SQL syntax (done here)
- Dev adds Prisma migration file via `prisma migrate create`
- Dev tests on Railway staging before prod
- Patrick runs via `prisma migrate deploy` (with DATABASE_URL override per CLAUDE.md §6)

---

## Frequency & Frequency Caps — Data Volume Check

### 10 Surveys × N Users = DB Load?

**Assumptions:**
- Beta: ~500 organizers, ~2000 shoppers
- Launch: ~5000 organizers, ~20000 shoppers
- Each organizer publishes ~2 sales/year (2026: 1 per launch month)
- Each shopper makes ~1 purchase/month

**Survey fire volume (launch scale):**
- OG-1 (first publish): 5000 organizers × 1 = ~5000 responses/year (14/day)
- OG-2 (10th item): ~3000 organizers × 1 = ~3000/year (8/day)
- OG-3 (item sold): ~2000 organizers × ~10 = ~20000/year (55/day)
- OG-4 (first POS): ~500 organizers × 1 = ~500/year (1.4/day)
- OG-5 (first settings): ~3000 organizers × 1 = ~3000/year (8/day)
- SH-1 (first purchase): ~15000 shoppers × 1 = ~15000/year (41/day)
- SH-2 (first favorite): ~5000 shoppers × 1 = ~5000/year (14/day)
- SH-3 (first bid): ~1000 shoppers × 1 = ~1000/year (2.7/day)
- SH-4 (first haul): ~500 shoppers × 1 = ~500/year (1.4/day)
- SH-5 (first follow): ~10000 shoppers × 1 = ~10000/year (27/day)

**Total:** ~64000 feedback responses/year = ~175/day

**DB Impact:**
- FeedbackSuppression table: ~10 entries per user (one per survey type max) = ~500 + 2000 = 2500 rows (tiny)
- Feedback table: 175 inserts/day × 365 days = ~64k rows/year (currently has unknown volume already, but adding survey context is 4 new columns = negligible storage)
- Query load: Trigger checks hit FeedbackSuppression index + User.lastSurveyShownAt (both fast)

**Conclusion:** No database scaling concern. Load is trivial at launch scale and beyond.

---

## Architectural Decisions Locked

1. **Separate `FeedbackSuppression` table** (not JSON column on User)
   - Reason: Fast queries, scalable, audit-trail ready
2. **`firstSalePublished` on User** (not derived from Sales table)
   - Reason: Avoids extra query on every OG-1 trigger check
3. **`lastSurveyShownAt` as single timestamp** (not per-survey)
   - Reason: Spec requires global 24h cap, not per-survey cap
   - Exception: 30-min cooldown is session-level (frontend state)
4. **DB-backed suppression, not localStorage**
   - Reason: Survives browser clears, consistent across devices, auditable
5. **Portal-based modals** (from frontend spec)
   - Reason: Avoids z-index hell (lessons from prior FindA.Sale modal bugs)
6. **Trigger pattern: after-action, not page-load**
   - Reason: User completes the action first; don't distract during action

---

## Edge Cases & Handling

| Case | Handler | DB Impact |
|------|---------|-----------|
| User suppresses all 10 surveys | Only static settings link remains; no DB burden | N/A |
| User deletes account | `FeedbackSuppression` CASCADE deleted; Feedback fk becomes NULL | Clean |
| User unsubscribes organizer role, later re-subscribes | `firstSalePublished` remains true (correct — they DID publish once) | No action |
| Rapid-fire same trigger (e.g., mark 3 items sold in 10 sec) | Session lock prevents multiple surveys; only first fires | No DB side effect |
| User goes offline during survey submit | Frontend retries; POST idempotent (ok if duplicate Feedback rows) | Acceptable |
| Browser localStorage cleared, but DB suppression exists | User suppressed survey in DB; page reload → suppression still active | Correct behavior |

---

## Tier Gating Check (OG-4 Special Case)

**OG-4 (First POS checkout)** fires only for SIMPLE+ tier organizers.

**Implementation:**
- Backend endpoint `POST /api/feedback` receives `surveyType` in body
- Backend checks: `SELECT subscriptionTier FROM UserRoleSubscription WHERE userId=X AND role='ORGANIZER'`
- If tier is FREE → reject survey (return 403 or silently drop)
- If tier is SIMPLE/PRO/TEAMS → accept

**Alternative:** Frontend checks tier before calling survey. Both work; backend gate is safer (prevents client-side bypass).

---

## Testing Strategy (For QA Dispatch)

**Before findasale-dev ships:**
1. Schema compiles via `npx prisma validate`
2. Migration runs on staging Railway DB without errors
3. Prisma client regenerates with new fields

**QA scenarios (after dev build):**
1. Suppression persists: user suppresses OG-1 → reload → OG-1 doesn't fire again
2. Cooldown works: OG-3 fires → 30 min passes → OG-5 can fire
3. 24h cap: OG-1 fires → user immediately publishes another sale → OG-2 doesn't fire within 24h
4. Tier gate: FREE tier organizer adds item 10 → no survey; SIMPLE+ adds → survey fires
5. Backfill correct: existing organizers with published sales show `firstSalePublished = true`

---

## Questions for Dev (findasale-dev prompt)

1. **Feedback model `rating` field:** Should this remain NOT NULL for backwards compatibility, or can we make it nullable (some surveys are text-only)? I recommend nullable.
2. **Feedback indexes:** Approve the two indexes I recommended for analytics queries?
3. **Tier lookup:** Does `UserRoleSubscription` have a direct index on userId for fast lookups? Confirm so OG-4 tier gate doesn't cause N+1.
4. **Migration order:** Run backfill for `firstSalePublished` on a non-prod DB first, confirm row counts match expectations (should match `SELECT COUNT(DISTINCT organizerId) FROM Sale WHERE status = 'PUBLISHED'`).

---

## Red Flags: None

- No schema conflicts with existing patterns
- No data-loss risk
- No backward-incompatibility
- Load is trivial
- Migration is straightforward

---

## Patrick Flags

**None.** The system is ready. Once dev completes:
1. Code review (findasale-dev returns PR)
2. QA smoke test (findasale-qa tests triggers, suppressions, tier gates)
3. Staging rollout (5% of users, monitor response rates)
4. Full ship (if metrics look good)

The UX spec is complete and locked. Dev has everything needed.

---

## Files to Hand to Dev

- `FEEDBACK_SYSTEM_SPEC.md` (full detailed spec with all 10 surveys, trigger patterns, component specs)
- `FEEDBACK_SURVEY_MAPPING.md` (quick reference table)
- `FEEDBACK_DEV_QUICKSTART.md` (quickstart for implementation)
- This assessment document (architecture decisions + migration SQL)

---

**Status:** APPROVED for dev dispatch
**Risk Level:** 🟢 LOW (schema only; no data migration risk, no existing feature changes)
**Next Step:** Hand off to `findasale-dev` with full spec
