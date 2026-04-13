# HANDOFF: Roadmap Batch D (#72–#75) to findasale-dev

**Dispatcher:** Systems Architect
**Date:** 2026-03-24
**Session:** S272+
**Batch Status:** READY FOR DEV

---

## Overview

Roadmap Batch D covers dual-role account management and tier-lapse state logic.

**Schema Status:** Phase 1 COMPLETE (all models exist)
**Architecture:** LOCKED (ADR approved, D2 decision final)
**Blockers:** D1 backfill (Patrick action), D3 legal copy (parallel Legal agent)

---

## Context

### What You're Building

1. **#72 — Phase 2 Auth Layer:** JWT payload with `roles[]` array + auth middleware (`hasRole()`, `getRoleSubscription()`, `requireRole()`)
2. **#73 — Notification Channels:** Add `notificationChannel` field (OPERATIONAL | DISCOVERY) to route alerts correctly.
3. **#74 — Consent Flow:** Dual opt-in checkboxes at signup; auto-backfill for existing organizers (D1 migration).
4. **#75 — Tier Lapse Logic:** When organizer subscription lapses: suspend PRO features only, keep SIMPLE features + all shopper features active.

### Key Decision: D2 (Tier Lapse Behavior)

**Architect has decided:** PARTIAL FREEZE + SIMPLE FALLBACK (not hard freeze, not read-only).

- **Lapse warning:** 7 days before expiry.
- **Fallback tier:** SIMPLE (organizer keeps core features, not blocked).
- **Shopper features:** Always available regardless of organizer tier status.
- **Resume:** Immediate re-activation when subscription reactivates.

See `claude_docs/feature-decisions/D2-tier-lapse-behavior.md` for full rationale.

### Locked Decisions (Do Not Change)

- **D1:** Auto-backfill UserRoleSubscription + RoleConsent from Organizer records using `createdAt`.
- **D2:** PARTIAL FREEZE (above).
- **D3:** Legal provides consent copy (your code uses `[LEGAL_COPY_PLACEHOLDER_*]` for now).

---

## Prerequisite: Patrick Action (D1 Backfill)

**Do not start dev until Patrick completes this.**

Patrick must run:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
npx prisma migrate deploy
npx prisma generate
```

This populates `UserRoleSubscription` and `RoleConsent` for all existing Organizer users.

---

## Dev Execution Order

### Phase 1: #72 Auth Layer (CRITICAL PATH)

**All other features depend on this.**

**Files to modify:**
- `packages/backend/src/middleware/auth.ts`
- `packages/backend/src/controllers/authController.ts`
- All 47 organizer/admin endpoint files (audit for `.role` references)

**Deliverables:**
1. JWT payload includes `roles[]` and `roleSubscriptions[]`.
2. Helpers: `hasRole()`, `getRoleSubscription()`, `requireRole()`.
3. All endpoints migrated from `.role` to new helpers.
4. Auth test suite passes (legacy JWT still works; new JWT enforces checks).

**Acceptance:**
- [ ] 0 TypeScript errors in auth + middleware.
- [ ] `requireRole('ORGANIZER', 'PRO')` gates PRO endpoints.
- [ ] Test: old single-role JWT is rejected (fallback to new auth).
- [ ] Test: new dual-role JWT passes, tier checks work.

**Estimated effort:** 6 hours

---

### Phase 2: QA Smoke Test #72

**Do not proceed to #73/#74/#75 until this passes.**

**Test script:**
1. Register new user with new consent checkboxes.
2. Verify JWT has `roles[]` and `roleSubscriptions[]`.
3. Call organizer endpoint (`/sales`) with new JWT → success.
4. Call PRO endpoint (`/batch-operations`) with SIMPLE tier → 403.
5. Call PRO endpoint with PRO tier → success.
6. Manually inspect login/logout flows for any regressions.

---

### Phase 3: #73 Notification Channels

**Depends on:** #72 passing QA

**Files to modify/create:**
- `packages/database/prisma/migrations/[timestamp]_add_notification_channel.sql`
- `packages/backend/src/services/notificationService.ts` (new methods: `getByChannel()`, `deriveChannel()`)

**Schema migration:**
```sql
ALTER TABLE "Notification"
ADD COLUMN "notificationChannel" VARCHAR(50) DEFAULT 'OPERATIONAL';

UPDATE "Notification"
SET "notificationChannel" = 'OPERATIONAL'
WHERE type IN ('purchase', 'message', 'system');

UPDATE "Notification"
SET "notificationChannel" = 'DISCOVERY'
WHERE type IN ('sale_alert', 'flash_deal', 'badge');

CREATE INDEX idx_notification_channel_userid ON "Notification"(userId, "notificationChannel");
```

**Backend logic:**
- Auto-route notifications to correct channel based on `type`.
- API endpoint: `GET /notifications?channel=OPERATIONAL` (filters by channel).

**Frontend logic:**
- Organizer inbox: filter `channel === 'OPERATIONAL'`.
- Shopper inbox: filter `channel === 'DISCOVERY'`.

**Acceptance:**
- [ ] Migration runs without errors.
- [ ] All existing Notification records have `notificationChannel` set.
- [ ] New notifications auto-route correctly.
- [ ] API test: `GET /notifications?channel=DISCOVERY` returns only DISCOVERY.

**Estimated effort:** 4 hours

---

### Phase 4: #74 Role-Aware Consent Flow

**Depends on:** #72 passing, D1 backfill complete

**Files to create/modify:**
- `packages/frontend/pages/auth/register.tsx` (new UI with dual checkboxes)
- `packages/backend/src/controllers/authController.ts` (update registerUser to create dual UserRoleSubscription + RoleConsent)
- `packages/database/prisma/migrations/[timestamp]_backfill_role_consent.sql` (D1 backfill)

**Frontend changes:**
```
[x] I agree to the Terms of Service
[x] I agree to the Privacy Policy

--- ORGANIZER (Sale Management) ---
[ ] I want to receive alerts about my sales
    [LEGAL_COPY_PLACEHOLDER_ORGANIZER_ALERTS]

--- SHOPPER (Discovery) ---
[ ] I want to discover nearby sales and special offers
    [LEGAL_COPY_PLACEHOLDER_SHOPPER_DISCOVERY]
```

**Backend changes:**
- Create User with `roles: ['USER', 'ORGANIZER', 'SHOPPER']`.
- Create UserRoleSubscription for ORGANIZER (tier SIMPLE) and SHOPPER (tier FREE).
- Create RoleConsent for both, with checkboxes mapped to `marketingOptInAt`.

**Backfill migration (runs before dev ships this):**
- For each existing Organizer without RoleConsent, create one with `termsAcceptedAt = User.createdAt`.

**Acceptance:**
- [ ] New user signup creates 2 UserRoleSubscription + 2 RoleConsent records.
- [ ] Legal copy placeholders are in place (Legal fills in later).
- [ ] Existing organizers (D1) have RoleConsent records.
- [ ] Email service respects `marketingOptInAt` for both roles.

**Estimated effort:** 5 hours

---

### Phase 5: #75 Tier Lapse Logic

**Depends on:** #72 passing, D2 decision understood

**Files to create/modify:**
- `packages/backend/src/services/tierLapseService.ts` (NEW: lapse detection + email)
- `packages/backend/src/jobs/tierLapseCron.ts` (NEW: cron registration)
- `packages/backend/src/index.ts` (register cron at startup)
- 8+ PRO feature pages in `packages/frontend/pages/organizer/` (add lapse gate)
- `packages/frontend/hooks/useFeatureAccess.ts` (NEW: helper to check tier)

**Core logic:**

1. **Cron job (daily 2 AM UTC):**
   - Find subscriptions expiring in 7 days (not yet warned) → send warning email, set `tierLapseWarning = now()`.
   - Find subscriptions where `subscriptionStatus = 'canceled'` or `trialEndsAt <= now()` and `tierLapsedAt = null` → set `tierLapsedAt = now()`, send lapse notification.

2. **Feature gating:**
   - Item Library page: if `tierLapsedAt` is set, show "Upgrade Required" gate.
   - Batch Operations, Voice-to-Tag, Flip Report, Analytics, CSV Export, ZIP Export → same gate.

3. **Resume flow:**
   - Stripe webhook `invoice.payment_succeeded` → set `subscriptionStatus = 'active'`, `tierResumedAt = now()`, clear `tierLapsedAt`.
   - JWT refresh includes tier state → frontend automatically unlocks features.

4. **Shopper features unaffected:**
   - Organizer's shopper tier (always FREE) remains active.
   - No cross-role lapse; only ORGANIZER role is gated.

**Acceptance:**
- [ ] Cron job runs, detects lapsed subscriptions.
- [ ] Warning emails sent 7 days before expiry.
- [ ] Lapse emails sent on expiry.
- [ ] 8 PRO feature pages show gate when `tierLapsedAt` is set.
- [ ] Shopper can still browse/bid/purchase when organizer tier lapses.
- [ ] Resume: reactivate subscription → PRO features unlock immediately.
- [ ] QA: Full end-to-end lapse + resume flow with Stripe mock.

**Estimated effort:** 8 hours

---

## File Manifest

### Migrations to Create

```
packages/database/prisma/migrations/[timestamp]_add_notification_channel.sql
packages/database/prisma/migrations/[timestamp]_backfill_role_consent.sql (D1)
```

### Backend Files to Modify

```
packages/backend/src/middleware/auth.ts (substantial changes)
packages/backend/src/controllers/authController.ts (registerUser rewrite)
packages/backend/src/index.ts (add cron registration)
packages/backend/src/services/notificationService.ts (add routing logic)
```

### Backend Files to Create

```
packages/backend/src/services/tierLapseService.ts (new)
packages/backend/src/jobs/tierLapseCron.ts (new)
```

### Frontend Files to Modify

```
packages/frontend/pages/auth/register.tsx (dual consent UI)
packages/frontend/pages/notifications.tsx (add channel filtering)
packages/frontend/pages/organizer/item-library.tsx (add lapse gate)
packages/frontend/pages/organizer/voice-to-tag.tsx (add lapse gate)
packages/frontend/pages/organizer/flip-report.tsx (add lapse gate)
packages/frontend/pages/organizer/batch-operations.tsx (add lapse gate)
packages/frontend/pages/organizer/analytics.tsx (add lapse gate)
packages/frontend/pages/organizer/exports.tsx (add lapse gate)
packages/frontend/pages/organizer/data-export.tsx (add lapse gate)
packages/frontend/pages/organizer/advanced-tagging.tsx (add lapse gate)
```

### Frontend Files to Create

```
packages/frontend/hooks/useFeatureAccess.ts (new)
```

### Tests to Create/Update

```
packages/backend/tests/services/tierLapseService.test.ts (new)
packages/backend/tests/middleware/auth.test.ts (update)
packages/frontend/__tests__/pages/register.test.tsx (new)
```

---

## Schema Pre-Flight Checklist

Before starting any code:

- [x] User model has `roles[]` array ✅ (already in schema)
- [x] UserRoleSubscription table exists ✅ (already in schema)
- [x] RoleConsent table exists ✅ (already in schema)
- [x] Notification model exists ✅ (needs `notificationChannel` field)
- [x] Organizer model has tier fields ✅ (already in schema)

---

## Notes for Dev

1. **Auth is critical path.** All other features depend on #72 passing. QA immediately after.

2. **Do not assume JWT structure.** Always read the full payload (it will have both roles and roleSubscriptions arrays). Use helpers, not direct field access.

3. **Tier lapse is independent of tier upgrade logic.** Tier upgrade (already in system) changes `subscriptionTier`. Tier lapse (this batch) sets `tierLapsedAt` but does NOT change subscriptionTier. The cron job detects lapse by checking `subscriptionStatus` + expiry dates.

4. **Shopper tier is always FREE and never lapses.** Only ORGANIZER subscriptions are checked for lapse. A user cannot be barred from shopping because their organizer subscription expired.

5. **Legal copy is blocked.** Use exact placeholders: `[LEGAL_COPY_PLACEHOLDER_ORGANIZER_ALERTS]` and `[LEGAL_COPY_PLACEHOLDER_SHOPPER_DISCOVERY]`. Legal will replace these strings in a follow-up PR.

6. **Test with Stripe mock.** Use Stripe test mode events to simulate subscription renewal/lapse. Do not test against live Stripe data.

7. **Token version is critical.** When tier changes (upgrade or lapse), increment `UserRoleSubscription.tokenVersion`. This invalidates old JWT claims. The system will re-fetch tier state on next request.

---

## Acceptance Criteria (All Phases)

**By end of dev session, all must be green:**

### #72 Auth Layer
- [ ] 0 TS errors in `auth.ts` and all modified endpoints.
- [ ] `requireRole('ORGANIZER')` middleware works.
- [ ] `requireRole('ORGANIZER', 'PRO')` gates PRO features.
- [ ] JWT test: new dual-role payload passes; legacy single-role rejected.
- [ ] All 47 endpoints migrated from `.role` to `hasRole()`.

### #73 Notifications
- [ ] Migration runs without errors.
- [ ] All Notifications have `notificationChannel` set.
- [ ] `GET /notifications?channel=OPERATIONAL` filters correctly.
- [ ] New notifications auto-route to correct channel.

### #74 Consent
- [ ] New signup creates dual UserRoleSubscription + RoleConsent.
- [ ] D1 backfill ran: all existing organizers have RoleConsent.
- [ ] Email service respects consent prefs.
- [ ] Legal placeholders in place.

### #75 Tier Lapse
- [ ] Cron job runs, detects lapsed subscriptions.
- [ ] Warning emails sent 7 days before expiry.
- [ ] PRO feature pages show gate when `tierLapsedAt` is set.
- [ ] Shopper features still work when organizer tier lapses.
- [ ] Resume: tier reactivation → features unlock immediately.
- [ ] End-to-end QA: lapse + resume flow passes.

---

## QA Dispatch (After Dev Returns)

Orchestrator will write focused QA scenarios for:

1. Dual-role JWT payload verification (auth layer)
2. Notification channel routing (all channels)
3. Signup consent flow (organizer + shopper opt-in variants)
4. Tier lapse + resume (with Stripe mock)

Expected QA effort: 12–16 hours (full role × tier × operation matrix).

---

## Timeline

| Phase | Task | Owner | Duration | Dependency |
|-------|------|-------|----------|------------|
| 0 | Patrick runs D1 backfill | Patrick | 0.5h | None |
| 1 | #72 Auth Layer | Dev | 6h | Phase 0 |
| 1.5 | QA #72 smoke test | QA | 2h | Phase 1 |
| 2 | #73 Notifications | Dev | 4h | Phase 1.5 ✅ |
| 3 | #74 Consent Flow | Dev | 5h | Phase 1.5 ✅ + Phase 0 |
| 4 | #75 Tier Lapse | Dev | 8h | Phase 1.5 ✅ |
| 5 | Full Batch D QA | QA | 16h | Phase 2/3/4 |
| **Total** | | | **41.5h** | |

---

## Success Criteria (Session End)

- All code merged to `main`.
- Railway builds ✅ (no errors).
- 0 TypeScript errors across all phases.
- All acceptance criteria above marked ✅.
- QA results: PASS (all role × tier combinations tested).

---

## Questions for Orchestrator Before Starting

- [ ] Any data migration concerns for existing users?
- [ ] Should legacy single-role JWT support be a full session (not part of this batch)?
- [ ] Should QA use Stripe test mode or mock responses?

(Orchestrator will address these in kickoff message.)

---

**Ready to dispatch. Awaiting Patrick D1 completion signal.**
