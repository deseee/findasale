# Next Session Prompt — S249

**Date:** 2026-03-23 (S248 wrap complete)
**Status:** Removal gate fully implemented. 114-item walkthrough documented. Ready to start fixing.

---

## FIRST TASK — Verify S248 push landed

Confirm CLAUDE.md, DECISIONS.md, and S248-walkthrough-findings.md are on GitHub main. Check Vercel is still GREEN.

---

## S249 Priority 1 — Fix BUGs from Walkthrough (29 items)

Work from `claude_docs/S248-walkthrough-findings.md`. Fix all items tagged BUG — these are broken functionality that needs no strategic decision:

**High-impact bugs (fix first):**
- H4: Search doesn't find items or organizer names
- L8: Clicking organizer on leaderboard → "organizer not found"
- C2: Contact form send button does nothing
- SD3: Overview tries to load "sales near you" then fails
- SD6: Dashboard buttons (purchases, watchlist, saved, points) don't click anywhere
- SD9: Following a seller doesn't work
- TR1: Trails completely broken
- OP1: Start Verification 404s
- OS2/OS3: Workspace doesn't load, links to findasale.com, 404s
- IL1: Item library broken
- FR1: Flip reports error
- PI1: Print inventory tries to print whole page

**Quick fixes (batch together):**
- I2, CP3, LY11, AL5, TR2, S3: 2 footers on 6 pages
- F1, F2, F3: Special characters displaying literally on FAQ
- P1: Shopper showing "Free organizer tier already chosen"
- P7: Access denied with no helpful message when shopper hits organizer/dashboard

---

## S249 Priority 2 — Dark Mode Fixes (8 items)

All items tagged DARK in the walkthrough doc. Mechanical fixes — add `dark:` variants:
- SD2, SD8, M4, AL2, TY1, PY1, ST1, H13

---

## Carry-Forward: Seed Data Overhaul (14 DATA items)

After bugs and dark mode are fixed, the next blocker is test data. Nearly every feature is untestable because seed data lacks realistic state. This needs an architect + dev session to redesign the seed script.

---

## STRATEGIC SESSION (schedule when Patrick is ready)

These 17+ items require Patrick decisions — not code fixes:
1. **Gamification spec** (L2-L7, LY1-LY2, OV1, RE3, PR4): What do points, badges, stamps, milestones, leaderboard actually mean? Tied to Hunt Pass?
2. **Feature overlap** (AL1, FV1, PR5): Favorites vs wishlists vs alerts vs sale interests — consolidate?
3. **Support tier reality** (P3): What does "priority email support" or "dedicated account manager" mean for solo founder?
4. **Page consolidation** (PSU1-PSU4, S2, PF1): premium/subscription/upgrade/pricing overlap, settings vs profile overlap
5. **Shopper/organizer parity** (OD3, OS1): Settings features comparison
6. **Homepage redesign** (H2, H3): UX review needed
7. **Plan a Sale visibility** (PL1): Public-facing or organizer-only?

---

## Patrick Action Items (from S248)

- [ ] Run push block (CLAUDE.md + DECISIONS.md + walkthrough doc)
- [ ] Install findasale-dev.skill via Cowork UI (adds §17 Removal Gate)
- [ ] Install findasale-qa.skill via Cowork UI (adds Decision Point Protocol)

---

## Context Loading

- Read `claude_docs/S248-walkthrough-findings.md` — the work queue
- Read `claude_docs/brand/DECISIONS.md` — includes D-010 (removal gate)
- Test accounts: Shopper `user11@example.com`, PRO Organizer `user2@example.com`, SIMPLE+ADMIN `user1@example.com`, TEAMS `user3@example.com` (all `password123`)
