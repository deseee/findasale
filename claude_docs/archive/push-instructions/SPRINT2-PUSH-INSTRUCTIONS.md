# Sprint 2 Git Push Instructions
**Feature:** #65 Organizer Billing + Tier Enforcement
**Session:** S178
**Date:** 2026-03-16

---

## Files to Push (10 files modified, 5 files created)

**BACKEND CONTROLLERS:**
- `packages/backend/src/controllers/billingController.ts` (NEW)
- `packages/backend/src/routes/billing.ts` (NEW)
- `packages/backend/src/lib/syncTier.ts` (NEW)

**BACKEND ROUTES & MIDDLEWARE:**
- `packages/backend/src/index.ts` (MODIFIED)
- `packages/backend/src/routes/items.ts` (MODIFIED)
- `packages/backend/src/routes/export.ts` (MODIFIED)
- `packages/backend/src/routes/insights.ts` (MODIFIED)

**FRONTEND PAGES:**
- `packages/frontend/pages/organizer/upgrade.tsx` (NEW)
- `packages/frontend/pages/organizer/subscription.tsx` (NEW)
- `packages/frontend/pages/organizer/settings.tsx` (MODIFIED)

---

## PowerShell Push Instructions

Run these commands from the Repository Root (C:\Users\desee\ClaudeProjects\FindaSale):

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add packages/backend/src/controllers/billingController.ts
git add packages/backend/src/routes/billing.ts
git add packages/backend/src/lib/syncTier.ts
git add packages/backend/src/index.ts
git add packages/backend/src/routes/items.ts
git add packages/backend/src/routes/export.ts
git add packages/backend/src/routes/insights.ts
git add packages/frontend/pages/organizer/upgrade.tsx
git add packages/frontend/pages/organizer/subscription.tsx
git add packages/frontend/pages/organizer/settings.tsx

git commit -m "Sprint 2: Stripe billing endpoints + tier gating + subscription UI (close #65)"

.\push.ps1
```

---

## After Push

### 1. Set Railway Environment Variables

Navigate to Railway Dashboard → FindASale API Project → Variables:

```
STRIPE_PRO_MONTHLY_PRICE_ID=price_1TBZjpLTUdEUnHOTblzuy25L
STRIPE_PRO_ANNUAL_PRICE_ID=price_1TBZjuLTUdEUnHOT60xJgL4j
STRIPE_TEAMS_MONTHLY_PRICE_ID=price_1TBZjyLTUdEUnHOTVQyBVx0Q
STRIPE_TEAMS_ANNUAL_PRICE_ID=price_1TBZk1LTUdEUnHOTRAcyRJ10
STRIPE_TRIAL_COUPON_ID=btQhQIH2
STRIPE_WEBHOOK_SECRET=[Get from Stripe Dashboard]
```

**How to get STRIPE_WEBHOOK_SECRET:**
1. Log into Stripe Dashboard
2. Go to Developers → Webhooks
3. Click on the webhook endpoint for findasale-api
4. Copy the "Signing Secret" (starts with `whsec_`)
5. Paste into Railway

### 2. Verify Deployment

1. Railway should auto-deploy on commit merge
2. Wait for build to complete (usually 2-3 minutes)
3. Check health: `curl https://findasale-api.railway.app/`
   - Should return: `{ "message": "FindA.Sale API is running!" }`

### 3. QA Testing

Give these to findasale-qa team:

```
Test Cases:
1. Full upgrade flow: SIMPLE → PRO via Stripe test card (4242 4242 4242 4242)
2. Tier gating: SIMPLE user tries POST /api/items/bulk → should get 403
3. Tier gating: PRO user tries POST /api/items/bulk → should get 200 OK
4. Webhook test: Trigger customer.subscription.updated event via Stripe CLI
5. Subscription page: /organizer/subscription loads and shows current tier
6. Upgrade page: /organizer/upgrade shows tier comparison with toggle
7. Cancel flow: Test cancel subscription with grace period confirmation
8. Settings nav: Verify "Subscription" tab appears in organizer settings
```

### 4. Monitor

Watch these for 24 hours:
- Stripe Webhook Delivery Status (Dashboard → Webhooks → findasale-api)
- Railway Logs for errors containing "billing" or "stripe"
- User reports of tier gates not working (403 errors)

---

## Rollback (if needed)

If critical errors occur:

```powershell
git revert HEAD --no-edit
.\push.ps1
```

This will undo the commit and re-deploy the previous version.

---

## Success Criteria

✅ All 10 files committed and pushed to main
✅ Railway build succeeds (no compilation errors)
✅ Health check returns 200
✅ Can reach /organizer/upgrade without 404
✅ Can reach /organizer/subscription without 404
✅ Stripe webhook signature verification works (log shows "received: true")
✅ POST /api/items/bulk returns 403 for SIMPLE users
✅ POST /api/items/bulk returns 200 for PRO users

---

## Notes

- **Do NOT use `git push` directly.** Use `.\push.ps1` instead (handles index.lock cleanup + CRLF + fetch/merge)
- **Do NOT force push.** This is a simple forward commit.
- **Do NOT amend the last commit.** Create a new commit if you need changes.
- Webhook secret is sensitive — don't commit it or share in chat

---

**Expected Result After Push:**
- New organizers can click "Upgrade to PRO" and complete Stripe payment
- Payment unlocks batch operations, analytics, and exports
- Existing SIMPLE organizers see tier gates (403 errors) on premium endpoints
- Subscription page shows current plan, renewal date, and cancel option
- PRO tier is now monetizable (7-day trial, then $29/month or $290/year)

---

✅ Ready for production deployment.
