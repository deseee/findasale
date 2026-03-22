# Next Session Prompt — S229

**Date:** 2026-03-21
**Status:** S228 COMPLETE — Awaiting Patrick push + Prisma actions

---

## Immediate Actions

### 1. Verify S228 Rebuild (Railway + Vercel)
Patrick must push S228 commit first (11 files). After push:
- Check Railway backend build logs — should show successful rebuild
- Check Vercel frontend build logs — should show successful rebuild
- Test `/api/sales` endpoint (200 OK expected)
- Test Stripe checkout flow (`/pricing` → select tier → Stripe modal)
- Confirm pricing.tsx double `/api/` path is fixed (commit af096e0 already pushed)

### 2. Patrick Manual Actions (Blocking #73/#74/#75 Features)
**CRITICAL: Must be completed before any feature can be tested:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
npx prisma migrate deploy   # applies new migrations to Neon (RoleConsent, tierLapsedAt, etc)
npx prisma generate         # regenerates TypeScript client with new fields
```

Without these, the following will FAIL at runtime:
- Feature #73 notifications won't compile (missing fields in Prisma client)
- Feature #74 RoleConsent records won't save (table doesn't exist in runtime)
- Feature #75 tierLapsedAt timestamp won't work (field doesn't exist in runtime)

---

## Next Features: #106–#109 Pre-Beta Safety Batch

Work queue for S229+:

| # | Feature | Scope | Estimate | Notes |
|---|---------|-------|----------|-------|
| #106 | Rate limit burst capacity | Redis, 429 fallback | M | Detect spike patterns, allow temporary overages with backoff |
| #107 | Database connection pooling | Railway, Neon | M | Prevent connection exhaustion under heavy load |
| #108 | API timeout guards | Backend, all routes | S | 30s timeout on all external calls (Stripe, Resend, AI) |
| #109 | Graceful degradation on outages | Notification, email, AI | M | Queue fallback when external services timeout |

All 4 are pre-beta safety features. Estimate: 2 sessions if back-to-back.

---

## Outstanding Configuration

**Railway Environment Variables (Still Missing):**
- `AI_COST_CEILING_USD` — Daily spend limit for Claude API calls (used in Feature #104, already implemented). Default recommended: `5.00`
- `MAILERLITE_SHOPPERS_GROUP_ID` — MailerLite segment ID for onboarded shoppers (for feature #105 email campaigns). Value: `182012431062533831`

Both needed for:
- Feature #104 (AI cost tracking) to enforce ceiling
- Feature #105 (Cloudinary bandwidth tracking) to trigger alerts

**Set these in Railway Variables tab, then redeploy backend:**
```
AI_COST_CEILING_USD=5.00
MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831
```

---

## S228 Summary

Three major features completed (code ready, awaiting Prisma actions):
- **#73 (Two-Channel Notifications)** — In-app DB + Resend email, fail-open pattern
- **#74 (Role-Aware Consent)** — Inline checkboxes on registration, role-conditional
- **#75 (Tier Lapse Logic)** — Subscription.deleted/payment_failed webhooks, 403 guard on item create, lapse banner on dashboard

Plus P1 pricing.tsx fix (double `/api/` path) — already pushed (commit af096e0).

---

## Files Changed (S228)

11 files pending Patrick push (see session-log.md S228 entry for git commands).

---

## Decision Log (Locked — S228)

- **#75 Tier Lapse:** When subscription ends or payment fails, itemController 403s attempts to create items beyond tier limit. Dashboard shows lapse banner. No soft-delete — data stays intact, user can re-upgrade.
- **#74 Consent:** Role-based inline checkboxes. Shopper always free, no consent needed. ORGANIZER/ADMIN email consent unchecked by default. All roles must agree to `/terms`.
- **#73 Notifications:** Dual-channel (DB + Resend). Fail-open: if Resend times out, DB write succeeds anyway. In-app visible at `/messages`, email asynchronous.

---

## Blockers

None. Code is ready. Waiting on Patrick for push + Prisma actions.

---

## Reference

- Vercel URL: https://findasale-git-main-patricks-projects-f27190f8.vercel.app
- Test accounts:
  - Shopper: user11@example.com / password123
  - Organizer PRO: user2@example.com / password123
  - Admin/SIMPLE: user1@example.com / password123
- CLAUDE.md v5.0 is the single authority
- Scheduled tasks: 11 active (see findasale-records SKILL.md for full list)

---

**Next Session Lead:** findasale-records (rebuild verification) / findasale-dev (feature #106–#109 dispatch if ready)
