# Next Session Prompt — S237

**Date:** 2026-03-22 (S235 wrap complete)
**Status:** All S235 doc work + pushes complete. Skills installed. Patrick still needs Prisma + Railway env vars.

---

## Session Start Checklist

1. Load `STATE.md` — reflects S235 completion
2. Review `patrick-dashboard.md` — one-pager of current status + pending Patrick actions
3. Check `INNOVATION_HANDOFF_2026-03-22.md` — 4 research topics, Print Kit + digital assets most actionable
4. Check Sentry (https://deseee.sentry.io) — S234 passkey/timeout fixes should continue reducing error volume

---

## Pending Patrick Actions (Must Complete Before S237 Starts)

**1. Run Prisma + Railway env vars (S234 — CRITICAL BLOCKER):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
npx prisma migrate deploy
npx prisma generate
```

Then in Railway dashboard, set these environment variables:
- `AI_COST_CEILING_USD=5.00`
- `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831`

(S235 skills already installed and deleted `updated-skills/` folder)

---

## S237 Work Queue (In Order)

**1. Frontend QA + UX audit** — parallel dispatch
   - Dispatch **findasale-qa:** Live audit of all organizer + shopper flows post-S233 bug fixes. Test all 24 fixed bugs live: messages, checkout, follow, favorites, edit dates, dark mode, etc. Full role × tier × operation matrix.
   - Dispatch **findasale-ux:** Polish audit — responsive, dark mode, mobile, accessibility pass. Use latest fixes from S233.

**2. Re-dispatch innovation agent** — corrected scope
   - Same 4 topics (Amazon/POD, BizBuySell, Joybird, digital assets)
   - Broader secondary sales framing (not estate-sales-only)
   - Skills now updated so output will be correct

**3. Passkey race condition audit** — findasale-hacker
   - S234 fix was code-reviewed clean but unverified live
   - Full end-to-end passkey flow test across concurrent sessions
   - Confirm Redis TTL + atomic getDel works under load

**4. Features #106–#109 if QA clears**
   - All code-verified S234
   - Rate limit burst (rate-limit-redis), DB pooling (directUrl), API timeout (30s), graceful degradation
   - Only proceed if QA gives GO

---

## Context Loading

- New files to load at session start: `claude_docs/patrick-dashboard.md` (Patrick's status), `claude_docs/operations/subagent-quick-ref.md` (agent entry points)
- Reference: `INNOVATION_HANDOFF_2026-03-22.md`, `claude_docs/operations/qa-audit-2026-03-22.md`
- Test accounts: Shopper `user11@example.com`, PRO Organizer `user2@example.com`, SIMPLE+ADMIN `user1@example.com`, TEAMS `user3@example.com` (all `password123`)

---

**Critical:** Prisma + Railway env vars must be applied before S237 QA dispatch can proceed. Without them, #73/#74/#75 runtime errors will block testing.
