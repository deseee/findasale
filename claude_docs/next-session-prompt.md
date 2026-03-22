# Next Session Prompt — S237

**Date:** 2026-03-22 (S235 wrap complete → S236 active)
**Status:** All S235 doc work + pushes complete. Skills installed. Prisma migrate deploy + Railway env vars CONFIRMED DONE (S234). No blocking Patrick actions.

---

## Session Start Checklist

1. Load `STATE.md` — reflects S235 completion
2. Review `patrick-dashboard.md` — one-pager of current status + pending Patrick actions
3. Check `INNOVATION_HANDOFF_2026-03-22.md` — 4 research topics, Print Kit + digital assets most actionable
4. Check Sentry (https://deseee.sentry.io) — S234 passkey/timeout fixes should continue reducing error volume

---

## Pending Patrick Actions

No blocking Patrick actions. Prisma + Railway env vars confirmed done (S234). All S235 skills installed.

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
