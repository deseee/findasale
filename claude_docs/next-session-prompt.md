# Next Session Prompt — S233

**Date:** 2026-03-22
**Status:** S232 COMPLETE — Live QA audit done. 24 bugs found. NO-GO verdict. S231 Patrick push still pending.

---

## First: Complete the S231 Manual Push (Still Pending)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

# Step 1 — Commit local copies of MCP-pushed files to sync git
git add packages/frontend/components/AvatarDropdown.tsx
git add packages/frontend/components/Layout.tsx
git add packages/frontend/components/FavoriteButton.tsx
git add packages/frontend/components/OnboardingModal.tsx
git add packages/backend/src/controllers/favoriteController.ts
git commit -m "S231: Local sync for MCP-pushed files (AvatarDropdown, Layout, BUG #31/#32/#33)"

# Step 2 — Add remaining locally-changed files not yet on GitHub
git add packages/frontend/pages/sales/[id].tsx
git add packages/backend/src/controllers/authController.ts
git add packages/backend/src/controllers/eventController.ts
git add packages/backend/src/controllers/holdController.ts
git add packages/backend/src/controllers/itemController.ts
git add packages/backend/src/controllers/notificationController.ts
git add packages/backend/src/controllers/organizerController.ts
git add packages/backend/src/controllers/paymentController.ts
git add packages/backend/src/controllers/pointsController.ts
git add packages/backend/src/controllers/saleController.ts
git add packages/backend/src/controllers/searchController.ts
git add packages/backend/src/controllers/subscriptionController.ts
git add packages/backend/src/controllers/userController.ts
git add packages/backend/src/controllers/webhookController.ts
git add packages/backend/src/routes/items.ts
git add packages/backend/src/routes/organizers.ts
git add packages/backend/src/routes/users.ts
git commit -m "S231: BUG #30 (Follow button organizer.id) + BUG #22 sweep (54 inline role checks, 24 files) + sale page dark mode fixes"

# Step 3 — S232 wrap docs
git add claude_docs/operations/qa-audit-2026-03-22.md
git add claude_docs/STATE.md
git add claude_docs/logs/session-log.md
git add claude_docs/next-session-prompt.md
git add claude_docs/.last-wrap
git commit -m "S232 wrap: live QA audit (24 bugs, NO-GO verdict), STATE, session-log"

# Step 4
.\push.ps1
```

---

## Still-Pending Patrick Actions

**Prisma (CRITICAL — blocking #73/#74/#75 runtime):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
npx prisma migrate deploy
npx prisma generate
```

**Railway Environment Variables (still missing):**
```
AI_COST_CEILING_USD=5.00
MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831
```

---

## 1. Priority Bug Fixes (from qa-audit-2026-03-22.md)

Dispatch findasale-dev with the QA audit report. Fix in this order:

| # | Bug | Severity | Fix hint |
|---|-----|----------|----------|
| BUG-01 | Messages thread blank page | P0 | Add `flex: 1` to thread component (replaces `min-h-screen`) |
| BUG-02 | Stripe checkout → 404 | P0 | Create/verify `/api/billing/checkout` Next.js API route |
| BUG-03 | Manage Plan dead-end (no portal) | High | Wire Stripe Customer Portal link for PRO users |
| BUG-04 | `/admin/invites` crashes | High | Destructure `response.invites` (not `response.map(...)`) |
| BUG-06 | Broken Picsum images | Medium | Add `fastly.picsum.photos` to `next.config.js` images.domains |
| BUG-07/08 | Edit Sale dates + Edit Item category not pre-populated | Medium | Seed form state from fetched data on mount |
| BUG-15 | Billing section hardcoded light theme | Medium | Full `dark:` pass on `/organizer/premium` + `/organizer/upgrade` |
| BUG-17/18 | Raw unicode `\u25cf` / `\u2014` in badges | Low | Replace with actual characters or HTML entities |

Full report: `claude_docs/operations/qa-audit-2026-03-22.md`

---

## 2. After Bug Fixes: Features #106–#109 Pre-Beta Safety Batch

| # | Feature | Scope | Estimate |
|---|---------|-------|----------|
| #106 | Rate limit burst capacity | Redis, 429 fallback | M |
| #107 | Database connection pooling | Railway, Neon | M |
| #108 | API timeout guards | Backend, all routes | S |
| #109 | Graceful degradation on outages | Notification, email, AI | M |

---

## Reference

- Vercel URL: https://findasale-git-main-patricks-projects-f27190f8.vercel.app
- Backend: https://backend-production-153c9.up.railway.app
- Test accounts: Shopper user11, PRO user2, SIMPLE+ADMIN user1, TEAMS user3 (all password123)
- QA audit: `claude_docs/operations/qa-audit-2026-03-22.md`
- CLAUDE.md v5.0 is single authority

---

**Next Session Lead:** Complete S231+S232 push → dispatch findasale-dev for BUG-01 + BUG-02 (P0s) → verify Stripe checkout live → work down bug queue
