# D2 Decision: Tier Lapse Behavior for PRO/TEAMS Organizers

**Architect Decision** | 2026-03-24 | Systems Architect

**Question:** When a PRO or TEAMS organizer's subscription lapses, how should the platform behave?

**Decision:** PARTIAL FREEZE + SIMPLE FALLBACK

---

## The Decision

### Timeline
- **T-7 days before expiry:** Send warning email. Message: "Your PRO subscription expires in 7 days. All PRO features will be suspended if you don't renew."
- **T-0 (expiry):** Subscription lapses. Set `UserRoleSubscription.tierLapsedAt = now()`. Organizer falls back to SIMPLE tier.
- **T+0 onward:** Organizer retains SIMPLE-tier features only. PRO features show "Upgrade Required" gates.
- **Resume:** When organizer re-subscribes, set `tierResumedAt = now()`. All PRO features unlock immediately. No manual action needed.

### What Stays Available (SIMPLE Tier)
- Create/edit/publish sales
- Add items (without library/batch ops)
- View sales dashboard (without advanced analytics)
- Item holds and reservations
- Basic payout transparency
- Weekly email digest
- **All shopper features** (browse, bid, favorite, review, notifications) — NOT affected

### What Gets Suspended (PRO-Tier Only)
- Item Library (consignment rack)
- Voice-to-Tag
- Flip Report
- Batch Operations Toolkit
- Advanced Analytics Dashboard
- CSV/JSON exports
- Data Open Export (ZIP)
- Photo filters + advanced tagging

### Why This Behavior?

| Option | Behavior | Outcome | Decision |
|--------|----------|---------|----------|
| **HARD FREEZE** | Block all organizer features. Can't view sales, add items, or access dashboard. | Panic. Immediate churn. High recovery friction. | ❌ Rejected |
| **SOFT READ-ONLY** | Allow read-only access to all features. Can view but not modify. | Incomplete user experience. Confusing what's locked. | ❌ Rejected |
| **PARTIAL FREEZE** (chosen) | Suspend PRO features only. Keep SIMPLE features + all shopper features. | Clear upgrade funnel. Organizer retains core tools. Retention-friendly. | ✅ Selected |

---

## Implementation Details

### Database Fields (Already Built)
```prisma
model UserRoleSubscription {
  tierLapseWarning  DateTime?  // When to send warning (7 days before)
  tierLapsedAt      DateTime?  // When tier actually lapsed
  tierResumedAt     DateTime?  // When subscription reactivated
}
```

### Cron Job
- **Frequency:** Daily at 2 AM UTC
- **Logic:**
  1. Find subscriptions expiring in 7 days (and not yet warned) → send warning email
  2. Find subscriptions that have expired → set `tierLapsedAt`
  3. No action on active subscriptions

### Frontend Gating
Every PRO feature page checks:
```typescript
if (subscription.tierLapsedAt && !['PRO', 'TEAMS'].includes(subscription.subscriptionTier)) {
  // Show "Upgrade Required" gate
}
```

### Shopper Features Are NEVER Gated by Organizer Tier
If an organizer-user's tier lapses, they can still:
- Browse sales
- Bid and purchase
- Favorite items
- Leave reviews
- Receive discovery notifications

Organizer tier is independent of shopper tier (which is always FREE).

---

## Rationale: 7-Day Warning

- **Too early (14 days):** Users ignore the warning noise.
- **Too late (1 day):** Insufficient time to act; drives churn.
- **Optimal (7 days):** Standard SaaS practice. Gives organizer time to decide without panic.

---

## Customer Retention Impact

**Partial Freeze is retention-friendly because:**
1. Organizer doesn't panic (can still run sales).
2. Clear upgrade funnel (PRO features = "Upgrade now" buttons).
3. Existing friction reduced (no need to re-enable account).
4. Shopper experience unaffected (cross-sell opportunity).

**Example: Organizer in T+7 to T+30 window:**
- Can list items, publish sales, view dashboard
- Clicks "View Item Library" → sees gate → clicks "Upgrade Now"
- Tier immediately restored, Item Library unlocked

---

## Locked. No Changes Without Architect Approval.
