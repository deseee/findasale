# Next Session Prompt — S256

**Date:** 2026-03-23 (S255 complete)
**Status:** All S254 bugs resolved and QA verified. S248 bug/dark backlog fully cleared. S256 is UX + strategic work.

---

## Context

Read `claude_docs/STATE.md` — S255 completion block.
Read `claude_docs/S248-walkthrough-findings.md` — 41 UX items + 17 strategic items are the S256 work queue.
Last commits: `29e7418` (5 fixes), `cecc437` (bids photo placeholder)

Beta week is active — real users testing. Prioritize user-visible improvements.

---

## S256 PRIORITY 1 — UX Items from S248 (41 items)

Dispatch `findasale-ux` to:
1. Read `claude_docs/S248-walkthrough-findings.md` — extract all UX-category items
2. Group into logical batches (shopper flows, organizer flows, discovery/search, onboarding)
3. Spec each batch with acceptance criteria
4. Return grouped specs → main session batches into parallel `findasale-dev` dispatches

Do NOT send all 41 to dev at once — group by feature area, 8–12 items per dispatch.

---

## S256 PRIORITY 2 — Organizer Onboarding Flow

Current state: Two separate modals existed (welcome wizard + profile setup). Dashboard modal is now fixed to show only one at a time. But the full onboarding experience for a brand-new organizer has never been properly designed end-to-end.

Dispatch `findasale-ux` to:
- Map the current organizer onboarding path (what does a new user see from signup → first sale created?)
- Identify gaps, dead ends, and confusing steps
- Spec a clean single-flow onboarding experience
- Return spec → dispatch `findasale-dev` to implement

---

## S256 PRIORITY 3 — SD4: Streak and Points Show Nothing

From S248 walkthrough item SD4: Shopper dashboard streak and points display empty/zero even for user11 who has seed data.

Quick fix — dispatch `findasale-dev`:
- Check: does user11's seed data include UserStreaks + PointsTransactions?
- Check: does the frontend correctly query and display these fields?
- Fix whichever layer is empty

---

## S256 PRIORITY 4 — Strategic Items (17 items from S248)

Read `claude_docs/S248-walkthrough-findings.md` strategic section.
Route to appropriate agents:
- Product strategy decisions → `findasale-advisory-board`
- Feature ideas → `findasale-innovation`
- Competitive implications → `findasale-competitor`

Do not dispatch to dev without advisory/innovation review first.

---

## Test Accounts (Live on Neon)

All password: `password123`
- `user1@example.com` — ADMIN + SIMPLE organizer (Alice Johnson)
- `user2@example.com` — PRO organizer (Bob Smith)
- `user3@example.com` — TEAMS organizer
- `user11@example.com` — Shopper (Karen Anderson)

---

## Notes

- "Skip" button on shopper modal was found to already be correctly coded. If beta testers report it navigating to /login, the issue is in a different modal instance — dispatch findasale-dev to find the second instance.
- Persistent Inventory is in roadmap.md deferred section — do not build during beta.
- seed.ts has an uncommitted photoUrl fix — already discarded via `git restore`. No action needed.
