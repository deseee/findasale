# Next Session Prompt — S258

**Date:** 2026-03-23 (S257 complete)
**Status:** Rate limit whitelist live (commit ea77e26). S256 smoke test PASS — all 12 items verified. No blockers. Ready for new work.

---

## MANDATORY FIRST — Live QA Check (Quick)

S256 smoke test passed. One optional P3 to decide on before UX work begins:

- shopper/dashboard H1 says "My Dashboard" — nav label says "Shopper Dashboard" (mismatch)
- /profile H1 says "My Profile" — cosmetic inconsistency with nav

**Action:** Dispatch `findasale-dev` to fix both H1s in <20 lines (single targeted edit, inline acceptable). Or defer — these are P3, no user task is blocked.

---

## S258 PRIORITY 1 — Tier 2+ UX Batches

UX specs are ready in `claude_docs/ux-spotchecks/S256-UX-SPECS-41-items-onboarding.md`.

Tier 1 was completed in S256 (12 items). Read the spec, identify all Tier 2+ batches, and dispatch in parallel to `findasale-dev`. Target 8–12 items per dispatch.

---

## S258 PRIORITY 2 — Organizer Onboarding Flow

Spec exists in `claude_docs/ux-spotchecks/S256-UX-SPECS-41-items-onboarding.md` (5-step onboarding flow section at the bottom).

Dispatch `findasale-dev` to implement. Reference the spec for acceptance criteria.

---

## S258 PRIORITY 3 — Strategic Items (17 items from S248)

Read `claude_docs/S248-walkthrough-findings.md` strategic section.
Route to:
- Product strategy decisions → `findasale-advisory-board`
- Feature ideas → `findasale-innovation`
- Competitive implications → `findasale-competitor`

Do not dispatch to dev without advisory/innovation review first.

---

## Context

Last commits: `ea77e26` (rate limit whitelist), `af48ac2` (Tier 1 UX polish batch), `6dafd59` (nav labels + shopper settings), `b7b05c3` (SD4 streaks fix)

Beta week is active — real users testing. Prioritize user-visible fixes and flows.

Rate limit whitelist: `RATE_LIMIT_WHITELIST_IPS` env var on Railway. Add IPs comma-separated. Currently Patrick's IP is whitelisted.

---

## Test Accounts (Live on Neon)

All password: `password123`
- `user1@example.com` — ADMIN + SIMPLE organizer
- `user2@example.com` — PRO organizer (Stripe connected)
- `user3@example.com` — TEAMS organizer (Stripe connected)
- `user11@example.com` — Shopper with full activity (9 bids, 6 purchases, streaks, points)
