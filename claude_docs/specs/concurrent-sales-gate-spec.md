# Concurrent Sales Gate Specification
## Feature: Limit active concurrent sales by subscription tier

**Status:** Spec (not yet implemented)
**Decision:** S388 — Patrick approved gating SIMPLE tier to limited concurrent sales
**Author:** Systems Architect
**Date:** 2026-04-03

---

## 1. Overview

SIMPLE tier organizers are limited to a maximum number of concurrent active sales. Once the limit is reached, they cannot publish new sales until an active sale ends or they upgrade to PRO/TEAMS.

PRO and TEAMS tiers have higher or unlimited concurrent sales to incentivize upgrade path.

---

## 2. Proposed Tier Limits

| Tier | Max Concurrent Active Sales | Rationale |
|------|---------------------------|-----------|
| SIMPLE (free) | 1 | Entry tier; encourages focus & upgrade |
| PRO ($29/mo) | 3 | Serious organizers; modest lift over SIMPLE |
| TEAMS ($79/mo) | Unlimited | Team accounts need flexibility |
| ENTERPRISE | Unlimited | Custom contracts, no gatekeeping |

**Rationale for SIMPLE=1:**
- Estate sales typically run 1-3 days; allowing only one prevents queue buildup
- Reduces platform clutter (fewer abandoned/stale sales from free users)
- Clear upgrade incentive: "Go PRO to run 3 sales at once"
- Matches typical single-organizer workflow (estate per weekend)

---

## 3. What Counts as "Active"

An active sale is one with `status = 'PUBLISHED'` **AND** `endDate > now()`.

**Status values in schema:**
- `DRAFT` — not active (can create multiple drafts)
- `PUBLISHED` — active (counts toward limit)
- `ENDED` — not active (sale concluded)

**Edge cases:**
- **Scheduled sales (future startDate):** Count toward limit if `status = 'PUBLISHED'` and `endDate > now()`. Rationale: organizer has committed the slot; they can't double-book.
- **Sales in grace period (just ended):** Do not count. Once `endDate <= now()`, the status should transition to `ENDED` via job/cron or on query. Query should use `endDate > now()` to avoid counting expired-but-not-yet-ended sales.
- **Draft sales:** Do not count. Organizer can draft unlimited sales in SIMPLE tier; they just can't publish more than the limit concurrently.
- **Cancelled/aborted sales:** Clarification needed from Patrick — is there a `CANCELLED` status or do they transition directly to `ENDED`? For now, assume `CANCELLED` does not exist; all non-PUBLISHED sales do not count.

---

## 4. Implementation Points

### 4.1 Add maxConcurrentSales to tierLimits.ts

File: `packages/backend/src/constants/tierLimits.ts`

**Change:**
```
Add a new field: maxConcurrentSales: number
```

Structure:
```typescript
export const TIER_LIMITS: Record<SubscriptionTier, {
  itemsPerSale: number;
  photosPerItem: number;
  aiTagsPerMonth: number;
  batchOpsAllowed: boolean;
  multiUserAllowed: boolean;
  maxConcurrentSales: number;  // ← NEW FIELD
}> = {
  SIMPLE: { ..., maxConcurrentSales: 1 },
  PRO: { ..., maxConcurrentSales: 3 },
  TEAMS: { ..., maxConcurrentSales: Infinity },
};
```

### 4.2 Enforce the Gate in createSale Route

File: `packages/backend/src/controllers/saleController.ts`
Function: `createSale`
Location: After user validation (line ~346), before `prisma.sale.create()` (line ~368)

**Flow:**
1. Extract organizer's tier (from `Organizer.subscriptionTier` or `UserRoleSubscription.subscriptionTier` if dual-role)
2. Query active sales: count rows where `organizerId = user.organizerId AND status = 'PUBLISHED' AND endDate > NOW()`
3. Compare count against `getTierLimit(tier, 'maxConcurrentSales')`
4. If count >= limit, return 409 Conflict with error message and upgrade CTA
5. Otherwise, proceed with sale creation

**Error Response (409 Conflict):**
```json
{
  "message": "You've reached the maximum number of concurrent active sales for your SIMPLE tier.",
  "code": "TIER_LIMIT_EXCEEDED",
  "limit": 1,
  "current": 1,
  "tier": "SIMPLE",
  "upgradeUrl": "/pricing"
}
```

### 4.3 Related: updateSaleStatus (Publish Transition)

File: `packages/backend/src/controllers/saleController.ts`
Function: `updateSaleStatus`

**Current behavior:** Allows transition from `DRAFT` → `PUBLISHED`.

**Add gate:** Same concurrent sales check before allowing the transition. This catches:
- User creates sale in DRAFT (allowed, no limit)
- User waits and tries to publish when another sale is still active
- Gate prevents the publish

**No changes to other transitions** (PUBLISHED → ENDED, ENDED → PUBLISHED). These don't increase the active count.

---

## 5. Tier Resolution Logic

**Data source options** (Patrick to confirm):

**Option A: From Organizer model**
- `Organizer.subscriptionTier` (single field, monolithic)
- Clean if all organizers have one subscription
- Query: `await prisma.organizer.findUnique({ where: { userId: req.user.id } })`
- Get tier from `organizer.subscriptionTier`

**Option B: From UserRoleSubscription (dual-role)**
- `UserRoleSubscription.subscriptionTier` filtered by `role = 'ORGANIZER'`
- Required if Patrick is building per-role subscriptions (Feature #72)
- Query: `await prisma.userRoleSubscription.findUnique({ where: { userId_role: { userId: req.user.id, role: 'ORGANIZER' } } })`
- Get tier from `roleSubscription.subscriptionTier`

**Recommendation:** Use Option A for now (Organizer.subscriptionTier). If Feature #72 (dual-role) is active, refactor to Option B.

---

## 6. Frontend UX — "Limit Reached" State

**Scenario:** SIMPLE tier user has 1 active sale, tries to publish a draft.

**Modal/Toast (409 response):**
```
Title:  "Limit Reached"
Body:   "You're currently running 1 active sale. SIMPLE tier allows 1 at a time.
         To run 3 sales concurrently, upgrade to PRO."
Button: "Upgrade to PRO ($29/mo)" → /pricing
Button: "Dismiss"
```

**Location options:**
- Toast + inline error if in edit form
- Modal if in dashboard "new sale" flow
- Inline banner on sale card ("Can't publish — limit reached")

**Messaging:** Keep it friendly, not punitive. Goal is upgrade, not frustration.

---

## 7. Edge Cases & Decisions Needed from Patrick

| Edge Case | Current Decision | Status |
|-----------|-----------------|--------|
| Organizer upgrades from SIMPLE → PRO while running 1 sale | No action needed; limit increases to 3; can publish 2 more | Confirmed |
| Organizer downgrades from PRO → SIMPLE while running 2 sales | 2 sales remain published; only restrict NEW publishes after tier downgrade | Needs clarification |
| Sale scheduled far in future (3 months out) but published now | Counts as active, takes up a slot | Confirmed |
| Organizer manually ends a sale early (PUBLISHED → ENDED) | Slot frees up immediately; can publish another | Confirmed |
| Admin creates a sale on behalf of organizer | Applies the same tier limit (organizer's tier, not admin's) | Confirmed |

---

## 8. Database Considerations

**Query performance:**
- Counting active sales per organizer is O(n) scans if no index
- Recommend index on `(organizerId, status, endDate)` in Sale table for fast filtering
- Or cluster by organizerId + status

**Current index status:** Unknown; dev to verify during implementation.

---

## 9. Implementation Checklist

- [ ] Read `packages/backend/src/constants/tierLimits.ts` (understand structure)
- [ ] Add `maxConcurrentSales` field to TIER_LIMITS object
- [ ] Update `getTierLimit()` helper if needed to expose new field
- [ ] Determine tier resolution logic: Organizer vs UserRoleSubscription (Patrick input)
- [ ] Implement gate in `createSale()` controller
- [ ] Implement gate in `updateSaleStatus()` for DRAFT → PUBLISHED
- [ ] Write TypeScript tests for gate logic (both positive and negative paths)
- [ ] Verify database index on (organizerId, status, endDate) exists or add it
- [ ] Design frontend error modal/toast UX
- [ ] Implement frontend 409 response handling
- [ ] Test with real SIMPLE, PRO, TEAMS accounts
- [ ] Test tier downgrade scenario (if applicable)
- [ ] Write release notes: "SIMPLE tier now limited to 1 active sale"

---

## 10. Rollout Strategy

**Phase 1 (immediate):**
- Implement backend gate
- Log warnings (don't enforce) for 3 days
- Monitor logs for affected organizers

**Phase 2 (soft launch):**
- Enforce gate; expect 5-10% SIMPLE users to hit limit
- Send email to affected users: "You've reached the limit; consider PRO"
- Monitor support tickets

**Phase 3 (optional):**
- Add "View & upgrade" CTA to command center dashboard if at limit
- A/B test upgrade messaging copy

---

## 11. Success Metrics

| Metric | Target |
|--------|--------|
| SIMPLE users hitting limit → upgrade within 7 days | 15% |
| SIMPLE users with persistent 2+ draft sales | <5% (indicates feature adoption working) |
| Support tickets about limit | <2/week |
| False positives (gate error when should allow) | 0 |

---

## References

- Schema: `packages/database/prisma/schema.prisma` (Sale model, status enum)
- Controller: `packages/backend/src/controllers/saleController.ts` (createSale, updateSaleStatus)
- Routes: `packages/backend/src/routes/sales.ts` (POST /sales, PATCH /sales/:id/status)
- Constants: `packages/backend/src/constants/tierLimits.ts` (TIER_LIMITS object)
- Decision: S388 concurrent sales gate decision

---

**End of Spec**
