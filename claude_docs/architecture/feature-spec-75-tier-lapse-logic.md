# Feature Spec #75: Tier Lapse State Logic

**Status:** Architecture Design (Ready for Dev Implementation)
**Date:** 2026-03-21
**Author:** Architect
**Feature ID:** #75
**Related:** ADR-065 (Subscription Tiers), Feature #23 (Pricing Page), Feature #72 (Schema Phase 2)

---

## 1. Overview

When a PRO or TEAMS subscription lapses (payment failure, expiration, or cancellation), gracefully downgrade the organizer to SIMPLE tier. Existing data remains intact but is locked for editing until the organizer resizes below SIMPLE tier limits. Organizer receives a clear "Your subscription has lapsed" banner on the dashboard.

**Goal:** Prevent data loss while enforcing tier limits. Ensure smooth grace period → enforcement → UX feedback flow.

---

## 2. Pricing Model (Locked)

From Feature #23 and ADR-065:

| Tier | Fee | Items/Sale | Photos/Item | AI Tags/Month | Multi-User | Price |
|------|-----|-----------|------------|--------------|-----------|-------|
| SIMPLE | 10% | 200 | 5 | 100 | ✗ | Free |
| PRO | 8% | 500 | 10 | 2,000 | ✗ | $29/mo |
| TEAMS | 8% | 2,000 | ∞ | ∞ | ✓ | $79/mo |

**Stripe Price IDs (Locked, from S224):**
- PRO monthly: `price_1TDUQsLTUdEUnHOTzG6cVDwu`
- TEAMS monthly: `price_1TDUQtLTUdEUnHOTCEoNL6oz`

---

## 3. Schema Changes

**Status:** ALREADY PRESENT (Feature #72 Phase 2)

The schema already has tier lapse fields on the `Organizer` model (lines 219–221):

```prisma
// Tier expiry (Feature #75 gate)
tierLapseWarning   DateTime?  // When to send tier-lapse warning email (e.g., 7 days before trialEndsAt)
tierLapsedAt       DateTime?  // When tier actually lapsed (SIMPLE fallback or canceled)
tierResumedAt      DateTime?  // When user reactivated subscription
```

**Additions needed:** None for schema. Logic is all in webhook handlers and enforcement middleware.

---

## 4. Webhook Handling

### 4.1 Events to Handle

Add handlers in `packages/backend/src/controllers/stripeController.ts` to the existing `webhookHandler` switch statement.

**Required events:**

| Event | Trigger | Action |
|-------|---------|--------|
| `customer.subscription.deleted` | Canceled or expired | Set `subscriptionTier = SIMPLE`, `tierLapsedAt = now`, `subscriptionStatus = 'canceled'` |
| `invoice.payment_failed` | Payment failure | Set `subscriptionStatus = 'past_due'`, trigger 7-day grace period. Send "Payment Failed" email with retry link. |
| `invoice.payment_action_required` | Requires SCA/3DS | Notify organizer to complete payment auth. No tier change yet. |

**Existing events (no changes required):**
- `customer.subscription.updated`: Already handled for upgrades. Will detect downgrades to SIMPLE; treat as lapse.
- `payment_intent.succeeded`: Already handled for purchase payments. No change.

### 4.2 Implementation Detail: `customer.subscription.deleted`

```typescript
case 'customer.subscription.deleted': {
  const subscription = event.data.object;

  // Find organizer by stripeCustomerId
  const organizer = await prisma.organizer.findUnique({
    where: { stripeCustomerId: subscription.customer }
  });

  if (!organizer) {
    console.warn(`[webhook] Subscription deleted for unknown customer ${subscription.customer}`);
    break;
  }

  // Downgrade to SIMPLE, record lapse time
  await prisma.organizer.update({
    where: { id: organizer.id },
    data: {
      subscriptionTier: 'SIMPLE',
      subscriptionStatus: 'canceled',
      stripeSubscriptionId: null,
      tierLapsedAt: new Date(),
      tokenVersion: organizer.tokenVersion + 1, // Invalidate stale JWT tier claims
    }
  });

  // Fire async job: send "Tier Lapsed" email
  setImmediate(() => {
    sendTierLapsedEmail(organizer).catch(err =>
      console.warn('[tier-lapse] Failed to send lapse email:', err)
    );
  });

  break;
}
```

### 4.3 Implementation Detail: `invoice.payment_failed`

```typescript
case 'invoice.payment_failed': {
  const invoice = event.data.object;

  const organizer = await prisma.organizer.findUnique({
    where: { stripeCustomerId: invoice.customer }
  });

  if (!organizer) {
    console.warn(`[webhook] Payment failed for unknown customer ${invoice.customer}`);
    break;
  }

  // Mark subscription as past_due but do NOT downgrade yet
  await prisma.organizer.update({
    where: { id: organizer.id },
    data: {
      subscriptionStatus: 'past_due',
      // tierLapsedAt remains null until grace period expires
    }
  });

  // Fire async job: send "Payment Failed" email with retry link
  setImmediate(() => {
    sendPaymentFailedEmail(organizer, invoice).catch(err =>
      console.warn('[payment-failed] Email send failed:', err)
    );
  });

  break;
}
```

**Grace Period Logic:** A separate cron job (or on-demand check) runs every 6 hours. If `subscriptionStatus = 'past_due'` AND last payment attempt > 7 days ago, downgrade to SIMPLE and set `tierLapsedAt`.

---

## 5. Enforcement Layer

### 5.1 Where Limits Are Enforced

**A. On Item Creation/Update** (`packages/backend/src/controllers/itemController.ts`)
- **Guardian:** Middleware that checks sale's item count against organizer's tier limit
- **Action if over limit:** Return `403 Forbidden` with message: "You have {N} items in this sale. SIMPLE tier allows 200 items. Upgrade to continue."
- **Does NOT block reads** — organizer can see all items but cannot add/edit until resized

**B. On Photo Upload** (`packages/backend/src/controllers/photoController.ts` or image upload endpoint)
- **Guardian:** Check item's existing photo count against tier limit
- **Action if at limit:** Return `403 Forbidden` with message: "This item has 5 photos. SIMPLE tier allows 5 photos per item. Upgrade to add more."

**C. On AI Tag Request** (AI tagging routes)
- **Guardian:** Check month's tag usage in `AIOrganizerQuotaUsage` table (if exists) or real-time count
- **Action if over limit:** Return `403 Forbidden` with message: "You have used 100 of 100 monthly AI tags. Upgrade to SIMPLE or wait until next month."

**D. On Batch Operations** (brand kit, bulk edits, etc. — if implemented)
- Require `requireTier('PRO')` middleware (already exists)
- Return 403 if tier has lapsed and `subscriptionStatus` is 'canceled' or 'past_due'

### 5.2 New Enforcement Constants

Create `packages/backend/src/constants/tierLimits.ts`:

```typescript
export type SubscriptionTier = 'SIMPLE' | 'PRO' | 'TEAMS';

export const TIER_LIMITS: Record<SubscriptionTier, {
  itemsPerSale: number;
  photosPerItem: number;
  aiTagsPerMonth: number;
  batchOpsAllowed: boolean;
  multiUserAllowed: boolean;
}> = {
  SIMPLE: {
    itemsPerSale: 200,
    photosPerItem: 5,
    aiTagsPerMonth: 100,
    batchOpsAllowed: false,
    multiUserAllowed: false,
  },
  PRO: {
    itemsPerSale: 500,
    photosPerItem: 10,
    aiTagsPerMonth: 2000,
    batchOpsAllowed: true,
    multiUserAllowed: false,
  },
  TEAMS: {
    itemsPerSale: 2000,
    photosPerItem: Infinity,
    aiTagsPerMonth: Infinity,
    batchOpsAllowed: true,
    multiUserAllowed: true,
  },
};

export function getTierLimit(tier: SubscriptionTier, resource: keyof TIER_LIMITS[SubscriptionTier]) {
  return TIER_LIMITS[tier][resource];
}
```

### 5.3 Helper: Check Organizer Over-Limit Status

Create `packages/backend/src/lib/tierEnforcement.ts`:

```typescript
export async function checkSaleOverLimit(saleId: string, tier: SubscriptionTier): Promise<{
  isOverLimit: boolean;
  itemCount: number;
  limit: number;
  message?: string;
}> {
  const itemCount = await prisma.item.count({ where: { saleId } });
  const limit = TIER_LIMITS[tier].itemsPerSale;

  return {
    isOverLimit: itemCount > limit,
    itemCount,
    limit,
    message: isOverLimit ? `Sale has ${itemCount} items (limit: ${limit})` : undefined,
  };
}

export async function checkItemOverPhotoLimit(itemId: string, tier: SubscriptionTier): Promise<{
  isOverLimit: boolean;
  photoCount: number;
  limit: number;
  message?: string;
}> {
  const photoCount = await prisma.itemPhoto.count({ where: { itemId } });
  const limit = TIER_LIMITS[tier].photosPerItem;

  return {
    isOverLimit: photoCount >= limit,
    photoCount,
    limit,
    message: isOverLimit ? `Item has ${photoCount} photos (limit: ${limit})` : undefined,
  };
}
```

---

## 6. Grace Period (RECOMMENDED: 3 days)

**After `invoice.payment_failed` fires:**
- Day 0–3: Subscription status = `'past_due'`. Organizer can still add/edit items. Send daily reminder email with retry link.
- Day 3: Cron job detects expired grace period. Downgrade to SIMPLE, set `tierLapsedAt`, increment `tokenVersion` (invalidate JWTs).
- Day 3+: Organizer sees "Your subscription has lapsed" banner. Items above SIMPLE limits become read-only.

**Rationale:** 3 days matches SaaS best practice and gives time for legitimate payment issues (bank blocks, auth failures). Longer grace (7+ days) creates support burden; shorter (<1 day) too harsh.

---

## 7. Frontend Changes

### 7.1 Dashboard Banner

Location: `packages/frontend/pages/organizer/dashboard.tsx`

Add at top of dashboard (above main content):

```tsx
{organizer?.tierLapsedAt && (
  <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
    <div className="flex">
      <div className="flex-shrink-0">
        <AlertTriangleIcon className="h-5 w-5 text-red-400" />
      </div>
      <div className="ml-3">
        <h3 className="text-sm font-medium text-red-800">
          Your subscription has lapsed
        </h3>
        <div className="mt-2 text-sm text-red-700">
          <p>You've been downgraded to SIMPLE tier.
            {saleOverLimit && (
              <> You have sales with more than 200 items — those items are read-only until you resize or upgrade.</>
            )}
          </p>
        </div>
        <div className="mt-4">
          <button
            onClick={() => router.push('/organizer/billing')}
            className="text-sm font-medium text-red-600 hover:text-red-500"
          >
            Upgrade now →
          </button>
        </div>
      </div>
    </div>
  </div>
)}
```

### 7.2 Item Card / Add Item Page (Read-Only State)

When organizer is lapsed AND sale is over SIMPLE item limit:

```tsx
{isLapsed && saleOverLimit ? (
  <div className="opacity-60 pointer-events-none">
    <button disabled className="...">Add Item</button>
  </div>
) : (
  <button onClick={openAddItemModal} className="...">Add Item</button>
)}
```

Show tooltip on hover: "This sale exceeds the SIMPLE tier item limit. Upgrade to continue."

### 7.3 Photo Upload (Similar Lock)

When organizer is lapsed AND item is at photo limit:

```tsx
{isLapsed && photoCountAtLimit ? (
  <div className="text-gray-400 text-sm">
    <p>This item has reached the 5-photo SIMPLE tier limit.
      <Link href="/organizer/billing">Upgrade to PRO</Link> for 10 photos per item.
    </p>
  </div>
) : (
  <PhotoUploadWidget />
)}
```

### 7.4 Upgrade Button Text on `/pricing`

Update button labels (from S227 WARN finding):
- For unauthenticated shoppers: "Sign up for PRO" (not "Upgrade")
- For organizers with lapsed tier: "Reactivate PRO" or "Upgrade Now"
- For active SIMPLE: "Upgrade to PRO"

---

## 8. Email Templates

Create `packages/backend/src/services/tierLapseEmailService.ts`:

### 8.1 Tier Lapsed Email

**Sent:** When `customer.subscription.deleted` fires

**Content:**
```
Subject: Your FindA.Sale PRO subscription has been canceled

Hi [Organizer Name],

Your FindA.Sale PRO subscription has been canceled as of [date].

You've been downgraded to SIMPLE tier:
- 10% platform fee (vs. 8% for PRO)
- 200 items per sale (vs. 500 for PRO)
- 5 photos per item (vs. 10 for PRO)
- 100 AI tags per month (vs. 2,000 for PRO)

[IF APPLICABLE]:
You have sales with more than 200 items. Those items are now read-only.
To edit them, either:
1. Delete items to get below 200, or
2. Upgrade back to PRO

[CTA BUTTON]: Reactivate PRO ($29/month)

Questions? Reply to this email.

— FindA.Sale Team
```

### 8.2 Payment Failed Email

**Sent:** When `invoice.payment_failed` fires

**Content:**
```
Subject: Action required: Your FindA.Sale payment failed

Hi [Organizer Name],

Your recent payment for FindA.Sale PRO failed. Your subscription is at risk.

Please update your payment method or contact your bank:
[Link to update payment / Stripe portal]

You have 3 days to retry. If we don't receive payment by [date],
you'll be downgraded to SIMPLE tier.

[CTA BUTTON]: Update Payment

Questions? Reply to this email.

— FindA.Sale Team
```

---

## 9. Cron Job: Grace Period Expiry Check

Location: `packages/backend/src/services/subscriptionService.ts` or existing cron handler

**Frequency:** Every 6 hours

**Logic:**
```typescript
export async function checkPastDueExpiry() {
  const organizers = await prisma.organizer.findMany({
    where: {
      subscriptionStatus: 'past_due',
      subscriptionTier: { in: ['PRO', 'TEAMS'] },
      // Last payment attempt > 3 days ago (approximate — could refine with DB timestamp)
    }
  });

  for (const org of organizers) {
    // Fetch subscription from Stripe to get exact status
    const stripeSubscription = await stripe().subscriptions.retrieve(org.stripeSubscriptionId);

    if (stripeSubscription.status === 'past_due') {
      const daysSinceFail = (Date.now() - new Date(stripeSubscription.current_period_start).getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceFail >= 3) {
        // Grace period expired — downgrade to SIMPLE
        await prisma.organizer.update({
          where: { id: org.id },
          data: {
            subscriptionTier: 'SIMPLE',
            tierLapsedAt: new Date(),
            tokenVersion: org.tokenVersion + 1,
          }
        });

        // Send "Grace Period Expired" email
        await sendGracePeriodExpiredEmail(org);
      }
    }
  }
}
```

---

## 10. Migration Requirement

**No migration needed.** Schema already has `tierLapsedAt`, `tierLapseWarning`, `tierResumedAt` fields.

If they don't exist in your schema, Patrick must first apply Feature #72 Phase 2 migration.

---

## 11. Locked Decisions (Dev Must Not Deviate)

1. **Tier downgrade happens in Stripe webhooks, not frontend.** Frontend reads the state; webhooks write it.
2. **`tierLapsedAt = null` means subscription is active.** Use this to determine if lapsed.
3. **`tokenVersion` increments on lapse.** All existing JWTs become invalid. Organizers must re-login for new claims.
4. **Grace period is 3 days max.** Can be extended later, but 3 is the initial gate.
5. **No data deletion on lapse.** Only lock editing. Organizer must manually delete items to downsize.
6. **Over-limit items are read-only, not hidden.** Organizer can still view and understand what's over the limit.
7. **Email templates use Resend service** (already in use for receipts, alerts).
8. **Stripe test mode:** Test with test events in Stripe dashboard. Use test subscription and test payment methods.

---

## 12. Risk & Open Questions

### Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Organizer unaware of lapse | MEDIUM | Banner on dashboard + email notifications (2 emails: fail + lapse). Consider SMS as P1 future. |
| Over-limit data locks mid-sale | HIGH | Send warning email 7 days before expiry. Grace period + clear enforcement message. |
| JWT invalidation causes logout loop | MEDIUM | TokenVersion increment is standard auth pattern. Organizer logs in once, gets new JWT. Test in staging. |
| Stripe webhook not idempotent | LOW | Existing webhook handler already deduplicates by `event.id` in DB. Safe to re-run. |
| Missed `customer.subscription.updated` event | LOW | Fall back to cron job checking subscription status daily. Can be added if webhook alone feels insufficient. |

### Open Questions for Patrick

1. **SMS notifications?** Currently only email. Should we add SMS for payment failures? (Recommend: defer to Phase 2)
2. **Partial downgrade?** If PRO → payment fails → should they get a "temporary SIMPLE mode" before full downgrade? Or immediate downgrade? (Recommend: immediate, cleaner)
3. **Reactivation flow?** When organizer upgrades from SIMPLE back to PRO, should items automatically unlock? (Recommend: yes, instant unlock on payment success webhook)
4. **Custom grace period per region?** Different grace for Grand Rapids vs. other regions? (Recommend: global 3 days for now)

---

## 13. Test Scenarios (for QA dispatch)

### Developer Testing (Before QA Dispatch)

1. **Payment failure webhook:**
   - Create test subscription in Stripe test mode
   - Trigger `invoice.payment_failed` via Stripe test events
   - Verify: `subscriptionStatus = 'past_due'`, tier unchanged, email sent
   - Verify: `tierLapsedAt = null` (not yet downgraded)

2. **Subscription deleted webhook:**
   - Trigger `customer.subscription.deleted` via Stripe test events
   - Verify: `subscriptionTier = 'SIMPLE'`, `tierLapsedAt = now`, `tokenVersion` incremented
   - Verify: "Tier Lapsed" email sent
   - Verify: Organizer can no longer add items to sales > 200 items (403 returned)

3. **Grace period expiry:**
   - Manually invoke cron job (or wait 6 hours)
   - Verify: Past-due subscriptions older than 3 days are downgraded
   - Verify: Downgrade email sent

4. **JWT invalidation:**
   - Log in as organizer with active PRO
   - Trigger tier lapse webhook
   - Verify: Next API call receives 401 (JWT invalid due to tokenVersion mismatch)
   - Verify: Re-login flow works, new JWT issued with updated tokenVersion

### QA Test Plan

Will dispatch as separate QA batch with role × tier × data scenarios.

---

## 14. Implementation Checklist

- [ ] **Schema:** Verify `tierLapsedAt`, `tierLapseWarning`, `tierResumedAt` exist on Organizer model (Feature #72 prerequisite)
- [ ] **Webhooks:** Add `customer.subscription.deleted` and `invoice.payment_failed` cases to stripeController
- [ ] **Grace period:** Implement cron job for 3-day past_due check
- [ ] **Tier limits constants:** Create `tierLimits.ts` with SIMPLE/PRO/TEAMS limits
- [ ] **Enforcement:** Add checks in itemController (create/update) and photoController
- [ ] **Emails:** Create tierLapseEmailService with "Lapsed" and "Payment Failed" templates
- [ ] **Dashboard banner:** Add lapse banner to organizer dashboard
- [ ] **Item UI:** Lock add/edit buttons when over limit
- [ ] **Photo UI:** Lock upload button when at limit
- [ ] **Pricing page:** Fix button text for authenticated/unauthenticated states
- [ ] **Testing:** Run developer webhook tests in Stripe test mode
- [ ] **Staging:** Deploy to Railway staging, run end-to-end test
- [ ] **Production:** Deploy to Railway production (via `.\push.ps1`)

---

## 15. Files Modified (Dev Reference)

### Backend
- `packages/backend/src/controllers/stripeController.ts` — Add webhook cases
- `packages/backend/src/constants/tierLimits.ts` — New file, tier limits
- `packages/backend/src/lib/tierEnforcement.ts` — New file, enforcement helpers
- `packages/backend/src/services/subscriptionService.ts` — Grace period cron job
- `packages/backend/src/services/tierLapseEmailService.ts` — New file, email templates
- `packages/backend/src/controllers/itemController.ts` — Add item count check
- `packages/backend/src/controllers/photoController.ts` — Add photo count check

### Frontend
- `packages/frontend/pages/organizer/dashboard.tsx` — Add lapse banner
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — Lock UI for over-limit sales
- `packages/frontend/pages/pricing.tsx` — Fix button text (upgrade/signup/reactivate)
- `packages/frontend/components/ItemCard.tsx` or equivalent — Show read-only state

### Database
- No schema changes needed (Feature #72 prerequisite already includes fields)

---

**End of Spec**

Ready for Dev implementation. Questions? Escalate to Architect.
