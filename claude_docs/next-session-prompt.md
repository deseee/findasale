# Next Session Prompt — S234

**Date:** 2026-03-22
**Status:** S233 COMPLETE — All 24 QA audit bugs + 11 Sentry production errors fixed and pushed. App is in significantly better shape. Beta blocker status improved.

---

## Session Start Checklist

1. Load `STATE.md`
2. Check Sentry (https://deseee.sentry.io) — verify the 11 errors from S233 are resolving after deploy
3. Verify Railway + Vercel build green after the two S233 pushes

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

## 1. Passkey Security Audit (Queued — dispatch immediately)

Dispatch `findasale-hacker` on the passkey concurrent session race condition flagged in S200 and never re-verified.

**Context for hacker dispatch:**
- Session S200 flagged a concurrent session race in `authenticateBegin` — a fixed key was used for the challenge, meaning two simultaneous login attempts could collide or allow replay.
- The fix was applied at S200 but never re-tested under concurrent conditions.
- This is a P0 security concern before any public beta with real users.
- Ask hacker to: read the passkey auth flow in full, model the threat, verify the fix holds under concurrent load, and flag any other passkey-related auth surface areas.

---

## 2. Features #106–#109 Pre-Beta Safety Batch

After passkey audit clears:

| # | Feature | Scope | Estimate |
|---|---------|-------|----------|
| #106 | Rate limit burst capacity | Redis, 429 fallback | M |
| #107 | Database connection pooling | Railway, Neon | M |
| #108 | API timeout guards | Backend, all routes | S |
| #109 | Graceful degradation on outages | Notification, email, AI | M |

Dispatch findasale-architect first for #107 (Neon pooling has specific config requirements — PgBouncer vs direct). Then findasale-dev for all four.

---

## 3. Beta Readiness Check (after #106–#109)

Run a fresh QA audit pass — the previous NO-GO verdict had 24 bugs, all now fixed. A clean pass would unlock beta recruitment.

Dispatch findasale-qa for a targeted re-audit focused on:
- P0/High areas that were fixed (messages thread, Stripe checkout, admin invites, follow system)
- Sentry errors that were fixed (verify they stop appearing after deploy)
- Any regressions from the large fix batch

---

## Reference

- Vercel: https://findasale-git-main-patricks-projects-f27190f8.vercel.app
- Backend: https://backend-production-153c9.up.railway.app
- Sentry: https://deseee.sentry.io/issues/errors-outages/
- Test accounts: Shopper `user11`, PRO `user2`, SIMPLE+ADMIN `user1`, TEAMS `user3` (all `password123`)
- QA audit (original): `claude_docs/operations/qa-audit-2026-03-22.md`
- Previous passkey audit: `claude_docs/audits/passkey-qa-audit-s200.md`

---

**Next Session Lead:** Verify deploys green → check Sentry errors resolving → dispatch hacker on passkey → features #106–#109 → re-audit for beta GO/NO-GO
