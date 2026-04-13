# Sprint 2 — #65 Organizer Billing Implementation Dispatch
**Session:** S178
**Feature:** #65 Organizer Mode Tiers (Sprint 2)
**Status:** Dispatched to findasale-dev
**Date:** 2026-03-16

---

## Overview

This dispatch describes the complete implementation of Sprint 2 for feature #65. Sprint 1 (tier infrastructure) is already complete in production. Sprint 2 adds Stripe billing endpoints, gating on protected routes, and UI for upgrade/subscription management.

**Authority:** ADR-065-IMPLEMENTATION-PLAN.md (§6.2 — S177 Sprint Breakdown)
**Context:** See ADR-065-QUICK-REFERENCE.md for tier overview

---

## What's Already Built (Sprint 1)

✅ Schema migration applied (Organizer subscriptionTier, stripeCustomerId, stripeSubscriptionId fields)
✅ `packages/shared/src/tierGate.ts` — feature flag utility + TIER_RANK + hasAccess()
✅ `packages/backend/src/middleware/requireTier.ts` — Express middleware factory
✅ `packages/backend/src/middleware/auth.ts` — attaches organizerProfile to req.user
✅ authController JWT embeds subscriptionTier (all 3 auth paths)
✅ Stripe products created in test mode:
  - Pro Monthly: price_1TBZjpLTUdEUnHOTblzuy25L
  - Pro Annual: price_1TBZjuLTUdEUnHOT60xJgL4j
  - Teams Monthly: price_1TBZjyLTUdEUnHOTVQyBVx0Q
  - Teams Annual: price_1TBZk1LTUdEUnHOTRAcyRJ10
  - 7-day trial coupon: btQhQIH2

---

## Task 1: Stripe Billing Endpoints

**Location:** Create `packages/backend/src/controllers/billingController.ts`

### Endpoint 1: POST /api/billing/checkout
**Auth:** Required (via authenticate middleware)
**Body:**
```json
{
  "priceId": "price_1TBZjpLTUdEUnHOTblzuy25L",
  "billingInterval": "monthly"
}
```

**Logic:**
1. Retrieve authenticated organizer from DB (query by req.user.id)
2. Check valid priceId against env vars:
   - STRIPE_PRO_MONTHLY_PRICE_ID
   - STRIPE_PRO_ANNUAL_PRICE_ID
   - STRIPE_TEAMS_MONTHLY_PRICE_ID
   - STRIPE_TEAMS_ANNUAL_PRICE_ID
3. Fetch or create Stripe customer:
   - If organizer.stripeCustomerId exists → retrieve that customer
   - Else → create new customer with email from user.email, metadata { organizerId }
   - Update organizer.stripeCustomerId in DB
4. Check if organizer is new subscriber (organizer.stripeCustomerId was null before step 3):
   - If yes → apply trial coupon (process.env.STRIPE_TRIAL_COUPON_ID) with coupon: { discount: { coupon: trioCouponId } }
   - If no → no coupon
5. Create Stripe Checkout Session:
   ```
   stripe.checkout.sessions.create({
     customer: customer.id,
     line_items: [{ price: priceId, quantity: 1 }],
     mode: 'subscription',
     success_url: `${process.env.FRONTEND_URL}/organizer/upgrade?success=true`,
     cancel_url: `${process.env.FRONTEND_URL}/organizer/upgrade?canceled=true`,
     discounts: [{ coupon: trioCouponId }] (only if new subscriber),
   })
   ```
6. Return `{ url: session.url }`

**Error handling:**
- Invalid priceId → 400 { message: 'Invalid price ID' }
- Stripe API error → log + return 500

---

### Endpoint 2: POST /api/billing/webhook
**Auth:** NO auth — signature verified with STRIPE_WEBHOOK_SECRET
**Header:** stripe-signature (Stripe signs the request)
**Body:** Raw JSON (not parsed by express.json yet)

**Logic:**
1. Construct Stripe event from raw body:
   ```typescript
   const sig = req.headers['stripe-signature'] as string;
   const event = stripe.webhooks.constructEvent(
     req.body,
     sig,
     process.env.STRIPE_WEBHOOK_SECRET!
   );
   ```
2. Check idempotency:
   ```typescript
   const exists = await prisma.processedWebhookEvent.findUnique({
     where: { eventId: event.id },
   });
   if (exists) return res.json({ received: true });
   ```
3. Handle these events:
   - `customer.subscription.created` → call syncTier(organizerId, 'active', priceId)
   - `customer.subscription.updated` → call syncTier(organizerId, subscription.status, priceId)
   - `customer.subscription.deleted` → call syncTier(organizerId, 'canceled', null)
   - `invoice.payment_failed` → log warning (DO NOT downgrade yet), optionally trigger email
   - `invoice.payment_succeeded` → call syncTier(organizerId, 'active', priceId)
4. Create ProcessedWebhookEvent record to mark as processed
5. Return `{ received: true }`

**Error handling:**
- Signature verification fails → return 400
- Event type not recognized → log + return 200 (don't block)
- DB error → log + return 500 (Stripe will retry)

---

### Endpoint 3: GET /api/billing/subscription
**Auth:** Required
**Query Params:** None
**Returns:**
```json
{
  "tier": "PRO",
  "status": "active",
  "currentPeriodEnd": "2026-04-16T00:00:00Z",
  "cancelAtPeriodEnd": false,
  "priceId": "price_1TBZjpLTUdEUnHOTblzuy25L",
  "billingInterval": "monthly"
}
```

**Logic:**
1. Get authenticated organizer
2. If organizer.stripeSubscriptionId is null → return tier: "SIMPLE", status: null, others null
3. Else → fetch from Stripe:
   ```typescript
   const sub = await stripe.subscriptions.retrieve(organizer.stripeSubscriptionId);
   ```
4. Extract data from subscription object:
   - tier: map priceId to PRO or TEAMS via FEATURE_TIERS lookup
   - status: sub.status
   - currentPeriodEnd: new Date(sub.current_period_end * 1000)
   - cancelAtPeriodEnd: sub.cancel_at_period_end
   - priceId: sub.items.data[0].price.id
   - billingInterval: sub.items.data[0].price.recurring.interval
5. Return the object

**Error handling:**
- Stripe API error → return organizer's DB tier as fallback (degrade gracefully)

---

### Endpoint 4: POST /api/billing/cancel
**Auth:** Required
**Body:** None
**Returns:** Updated subscription object (same structure as GET /api/billing/subscription)

**Logic:**
1. Get authenticated organizer
2. If organizer.stripeSubscriptionId is null → return 400 { message: 'No active subscription' }
3. Update Stripe subscription:
   ```typescript
   const sub = await stripe.subscriptions.update(
     organizer.stripeSubscriptionId,
     { cancel_at_period_end: true }
   );
   ```
4. Update organizer in DB:
   ```typescript
   await prisma.organizer.update({
     where: { id: organizer.id },
     data: {
       subscriptionStatus: 'scheduled_for_cancellation',
       subscriptionEndsAt: new Date(sub.current_period_end * 1000),
     },
   });
   ```
5. Return subscription info (same as GET /api/billing/subscription response)

**Error handling:**
- Stripe API error → log + return 500

---

## Task 2: syncTier Utility

**Location:** Create `packages/backend/src/lib/syncTier.ts`

**Signature:**
```typescript
export async function syncTier(
  organizerId: string,
  status: string,
  priceId: string | null
): Promise<void>
```

**Logic:**
1. Map priceId to tier:
   - STRIPE_PRO_MONTHLY_PRICE_ID or STRIPE_PRO_ANNUAL_PRICE_ID → PRO
   - STRIPE_TEAMS_MONTHLY_PRICE_ID or STRIPE_TEAMS_ANNUAL_PRICE_ID → TEAMS
   - null → SIMPLE
2. Determine subscriptionStatus:
   - If status === 'canceled' → 'canceled'
   - Else → use status as-is (active, past_due, trialing, etc.)
3. Update organizer:
   ```typescript
   await prisma.organizer.update({
     where: { id: organizerId },
     data: {
       subscriptionTier: tier,
       subscriptionStatus: status === 'canceled' ? 'canceled' : status,
       subscriptionEndsAt: status === 'canceled' ? new Date() : null,
     },
   });
   ```
4. Create or update Subscription record (if subscription exists):
   - Query: `prisma.subscription.findUnique({ where: { organizerId } })`
   - If exists → update status
   - If not → create new (if tier !== SIMPLE)

**Error handling:**
- DB error → log + throw (webhook handler will catch and retry)
- Invalid organizerId → log warning, return (don't crash webhook)

---

## Task 3: Route Registration

**Location:** Create `packages/backend/src/routes/billing.ts`

**Routes:**
```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createCheckoutSession,
  getSubscription,
  cancelSubscription,
} from '../controllers/billingController';

const router = Router();

// Protected routes (require auth)
router.post('/checkout', authenticate, createCheckoutSession);
router.get('/subscription', authenticate, getSubscription);
router.post('/cancel', authenticate, cancelSubscription);

// Webhook (no auth, signature verified in controller)
router.post('/webhook', handleStripeWebhook);

export default router;
```

**Register in `packages/backend/src/index.ts`:**
```typescript
// Add this import at top with other route imports
import billingRoutes from './routes/billing';

// Add this line in the routes section (around line 210–250)
// IMPORTANT: Raw body middleware MUST come before json() for this specific route
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use('/api/billing', billingRoutes);
```

---

## Task 4: Wire requireTier() Middleware to Protected Routes

**Locations to modify:** These route files already exist; add middleware to specific endpoints

### Endpoint 1: POST /api/items/bulk (Batch Operations)
**File:** `packages/backend/src/routes/items.ts`
**Change:** Find the `POST /bulk` handler and add `requireTier('PRO')` middleware
```typescript
router.post('/bulk', authenticate, requireTier('PRO'), bulkUpdateController);
```

### Endpoint 2: GET /api/organizer/export (Data Export)
**File:** `packages/backend/src/routes/export.ts`
**Change:** Add `requireTier('PRO')` to the export endpoint
```typescript
router.get('/', authenticate, requireTier('PRO'), exportController);
```

### Endpoint 3: Analytics Endpoints
**File:** `packages/backend/src/routes/analytics.ts` (if exists; check first)
**Change:** Add `requireTier('PRO')` to all analytics endpoints
```typescript
router.get('/', authenticate, requireTier('PRO'), analyticsController);
```

### Endpoint 4: Brand Kit Endpoints (if they exist)
**File:** `packages/backend/src/routes/brandkit.ts` or similar
**Change:** Add `requireTier('TEAMS')` to brand kit endpoints
```typescript
router.get('/', authenticate, requireTier('TEAMS'), getBrandKit);
router.put('/', authenticate, requireTier('TEAMS'), updateBrandKit);
```

**Import pattern (if not already imported):**
```typescript
import { requireTier } from '../middleware/requireTier';
```

---

## Task 5: Upgrade UI Page

**Location:** Create `packages/frontend/pages/organizer/upgrade.tsx`

**Design Spec:**
- Page title: "Choose Your Plan"
- Three columns: SIMPLE (free), PRO ($29/mo or $290/yr), TEAMS ($79/mo or $790/yr)
- Each column shows:
  - Plan name
  - Price (with annual savings % if applicable)
  - Key features list (from ADR-065-QUICK-REFERENCE.md features for each tier)
  - CTA button

**Column 1: SIMPLE**
- "Free"
- "Current Plan" badge if organizer already on SIMPLE
- No CTA button (they're already on it)
- Features:
  - Create sales & manage inventory
  - Item uploads (up to 100/sale)
  - Email reminders
  - POS integration
  - AI-powered item tags
  - Holds/reservations (24-48 hours)

**Column 2: PRO**
- "$29/month" or "$290/year" (toggle between monthly/annual)
- Show annual savings: "$58/year" (20% discount)
- "Start Free Trial" button if organizer is new subscriber (stripeSubscriptionId === null)
- "Upgrade" button if organizer is on SIMPLE
- "Upgrade to PRO" is disabled/hidden if already PRO
- Features:
  - Everything in SIMPLE
  - Batch operations (edit 100s of items at once)
  - Sales analytics & performance insights
  - Data export (CSV/ZIP)
  - Brand kit (custom colors, logo, domain)
  - Advanced coupons & promotions
  - Social templates for marketing

**Column 3: TEAMS**
- "$79/month" or "$790/year"
- Show annual savings (if applicable)
- "Contact Sales" button (links to mailto: patrick@finda.sale)
- Features:
  - Everything in PRO
  - Multi-user team management
  - API access & webhooks
  - White-label customization (Q4 2026+)

**Query Param Handling:**
- If `?success=true` → show toast: "Welcome to PRO! Your subscription is active."
- If `?canceled=true` → show toast: "Checkout canceled. Feel free to upgrade anytime."

**Current Tier Detection:**
- Read from auth context (JWT has subscriptionTier)
- Show current tier badge on that column

**CTA Click Behavior:**
1. On "Start Free Trial" or "Upgrade" button click:
   - Determine priceId based on selected interval:
     - monthly + PRO → STRIPE_PRO_MONTHLY_PRICE_ID
     - annual + PRO → STRIPE_PRO_ANNUAL_PRICE_ID
     - monthly + TEAMS → STRIPE_TEAMS_MONTHLY_PRICE_ID
     - annual + TEAMS → STRIPE_TEAMS_ANNUAL_PRICE_ID
   - POST /api/billing/checkout { priceId, billingInterval }
   - Get back { url: session.url }
   - Redirect to session.url (Stripe Checkout modal opens)
2. After payment completes:
   - User redirected to /organizer/upgrade?success=true
   - Toast shown
   - Page reads new JWT to update currentTier

**Design Notes:**
- Use existing Tailwind + sage-green palette (check `pages/organizer/dashboard.tsx` or component library)
- Use Fraunces for headings, Inter for body
- Keep it clean and simple — conversion page
- Mobile-responsive (3-column layout stacks to 1-column on mobile)
- Trial callout: "7-day free trial — no credit card charged until day 8"

---

## Task 6: Subscription Management Page

**Location:** Create `packages/frontend/pages/organizer/subscription.tsx`

**Design Spec:**
- Page title: "Subscription Settings"
- If SIMPLE tier:
  - Message: "You're on the free plan"
  - Upgrade CTA link to /organizer/upgrade
  - No management options

- If PRO or TEAMS tier:
  - Section 1: Current Plan
    - Plan name (PRO or TEAMS)
    - Billing interval (monthly or annual)
    - Next billing date: "Your subscription renews on [date]"
    - Amount that will be charged: "$29/month" or "$290/year"
  - Section 2: Payment Method
    - Last 4 digits of card (fetched from Stripe subscription object)
    - "Update Payment Method" button → opens Stripe modal (or redirects to Stripe billing portal)
  - Section 3: Actions
    - "Change Plan" link → /organizer/upgrade
    - "Cancel Subscription" button:
      - On click: confirmation modal "Your plan will remain active until [end date]. You can reactivate anytime."
      - On confirm: POST /api/billing/cancel
      - Update UI to show "Subscription scheduled to end on [date]"
    - "Manage in Stripe" link (for debugging; optional but useful)

**Data Source:**
- GET /api/billing/subscription on page load
- Parse response to display tier, status, currentPeriodEnd, priceId, billingInterval

**Navigation Update:**
- Add "Subscription" link to the organizer nav
- Check `packages/frontend/components/` for OrganizerNav or Sidebar component
- Add link: `<a href="/organizer/subscription">Subscription</a>` (or similar)
- Link should only show for authenticated users who are organizers

---

## TypeScript Compilation

After all code is written, run these to verify no TS errors:
```bash
cd /sessions/inspiring-practical-faraday/mnt/FindaSale
pnpm --filter @findasale/backend tsc --noEmit
pnpm --filter @findasale/frontend tsc --noEmit
```

Fix any TS errors before handing off to main session.

---

## Key Implementation Notes

1. **Stripe Client Init:** Use existing `getStripe()` from `packages/backend/src/utils/stripe.ts` — do NOT create a second instance
2. **Raw Body Middleware:** The webhook endpoint REQUIRES raw body to verify signature. In `index.ts`, add:
   ```typescript
   app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
   ```
   This MUST come BEFORE the json parser.
3. **Env Vars Expected on Railway:** (Patrick to set these before this deploys)
   - STRIPE_PRO_MONTHLY_PRICE_ID
   - STRIPE_PRO_ANNUAL_PRICE_ID
   - STRIPE_TEAMS_MONTHLY_PRICE_ID
   - STRIPE_TEAMS_ANNUAL_PRICE_ID
   - STRIPE_TRIAL_COUPON_ID
   - STRIPE_WEBHOOK_SECRET
4. **Frontend Auth Context:** The frontend already has JWT decode in place. Verify that `subscriptionTier` is read from JWT and passed to components.
5. **Error Responses:** All 403 tier gate errors should follow this pattern:
   ```json
   {
     "message": "This feature requires the PRO plan or higher.",
     "requiredTier": "PRO",
     "currentTier": "SIMPLE",
     "upgradeUrl": "/organizer/upgrade"
   }
   ```

---

## QA Escalation

Flag this to findasale-qa when complete:
1. **Payment flows:** Full upgrade flow in Stripe test mode (valid test cards: 4242 4242 4242 4242)
2. **Auth middleware:** Verify requireTier() correctly blocks SIMPLE users from PRO endpoints
3. **Webhook idempotency:** Simulate duplicate webhook events; verify only one DB write happens
4. **Subscription retrieval:** Test GET /api/billing/subscription for all tier states
5. **UI flows:** Test upgrade page with monthly/annual toggle, test subscription page with cancel

---

## Files to Create (8 total)

**Backend:**
1. `packages/backend/src/controllers/billingController.ts` (4 endpoint handlers)
2. `packages/backend/src/routes/billing.ts` (route definitions)
3. `packages/backend/src/lib/syncTier.ts` (utility function)

**Frontend:**
4. `packages/frontend/pages/organizer/upgrade.tsx` (tier comparison page)
5. `packages/frontend/pages/organizer/subscription.tsx` (subscription management page)

**Docs (if not already present):**
6. None required (ADR-065 docs already exist)

## Files to Modify (2 total)

**Backend:**
1. `packages/backend/src/index.ts` (add billing route + raw body middleware)
2. `packages/backend/src/routes/items.ts` (add requireTier('PRO') to POST /bulk)

**Frontend:**
3. `packages/frontend/pages/organizer/dashboard.tsx` or nav component (add "Subscription" link)

## Files to Check/Review (conditional)

- `packages/backend/src/routes/export.ts` — add requireTier('PRO')
- `packages/backend/src/routes/analytics.ts` (if exists) — add requireTier('PRO')
- `packages/backend/src/routes/brandkit.ts` (if exists) — add requireTier('TEAMS')

---

## Handoff Format

When complete, return:
1. List of all files created/modified with brief descriptions
2. Any TypeScript compilation errors (with line numbers)
3. Any blocking issues or questions
4. Confirmation that all 4 tasks are complete

**Do NOT commit or push.** Return files changed to main session for batched MCP push or Patrick's PowerShell push.

---

**Authority:** CLAUDE.md §11 (subagent-first implementation gate)
**Dispatch Date:** 2026-03-16
**Dispatched by:** Senior Dev (Main Session)
