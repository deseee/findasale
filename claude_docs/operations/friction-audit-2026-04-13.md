# Friction Audit — 2026-04-13

Automated run. Daily friction audit. Patrick not present.

---

## Summary

2 actionable findings. 1 is P1 (production risk, needs architect dispatch). 1 is P2 (doc staleness). No merge conflicts, no skill health issues detected.

---

## P1 — Auction Double-Cron Confirmed Active

**Category:** code-quality / production-risk
**Severity:** P1
**Status:** Not resolved — still flagged in STATE.md from S437, never dispatched.

**Finding:**

Both `auctionJob.ts` (line 172 of `index.ts`) and `auctionAutoCloseCron.ts` (line 188 of `index.ts`) are wired and running in production.

```
172: import './jobs/auctionJob';           // auto-registers cron.schedule('*/5 * * * *', endAuctions)
188: import { scheduleAuctionAutoCloseCron } from './jobs/auctionAutoCloseCron';
538: scheduleAuctionAutoCloseCron();        // setInterval every 5 minutes
```

Both jobs query:
```
WHERE listingType = 'AUCTION' AND auctionClosed = false AND auctionEndTime < now
```

- `auctionJob.ts` handles: reserve checks, Stripe payment intents, XP awards, Resend emails, Purchase record creation, sets `auctionClosed: true`
- `auctionAutoCloseCron.ts` handles: sets `auctionClosed: true`, winner notification, organizer notification

In the same 5-minute window, both crons can pick up the same auction before either has set `auctionClosed: true`. This means: duplicate Stripe payment intents, double XP, double winner emails, double organizer notifications.

`auctionCloseCron.ts` is correctly marked DEPRECATED and not wired — that's the one the S436 "cron audit cleared" was about. The S433 (ADR-013 Phase 2) addition of `auctionAutoCloseCron.ts` post-dates that audit clearance. The STATE.md "⚠️ Auction cron audit needed" flag at S437 is accurate and unresolved.

**Dispatch:** `findasale-architect` — audit both files, determine if `auctionAutoCloseCron.ts` logic is fully covered by `auctionJob.ts`, and if so, remove the `scheduleAuctionAutoCloseCron()` call and import from `index.ts`. If not covered, merge the notification logic into `auctionJob.ts` and remove `auctionAutoCloseCron.ts`.

**Context files:**
- `packages/backend/src/index.ts` (lines 172, 188, 538)
- `packages/backend/src/jobs/auctionJob.ts`
- `packages/backend/src/jobs/auctionAutoCloseCron.ts`
- `claude_docs/STATE.md` (S437 + S436 auction cron audit notes)

**Tag:** AUTO-DISPATCH from daily-friction-audit

---

## P2 — STACK.md Fee Section Stale (10% flat vs tier-aware)

**Category:** doc-staleness
**Severity:** P2

**Finding:**

STACK.md Fee Structure section (line 74) reads:
> Rate: 10% flat — all item types (FIXED, AUCTION, REVERSE_AUCTION, LIVE_DROP, POS)

S437 shipped `feeCalculator.ts` with tier-aware fees: **10% SIMPLE, 8% PRO/TEAMS**. Applied to `payoutController.ts`, `stripeController.ts`, `terminalController.ts`, and `earningsPdfController.ts`. The STACK.md rate is now wrong for PRO/TEAMS organizers.

Any session reading STACK.md as authority on fee rates will generate incorrect numbers.

**Dispatch:** `findasale-records` — update STACK.md Fee Structure section to reflect tier-aware rates (10% SIMPLE, 8% PRO/TEAMS). Reference `feeCalculator.ts` as implementation source.

**Context files:**
- `claude_docs/STACK.md` (Fee Structure section, ~line 74)
- `packages/backend/src/utils/feeCalculator.ts`

**Tag:** AUTO-DISPATCH from daily-friction-audit

---

## P3 — STATE.md "Next Session Priority" Label Points to Completed Session

**Category:** doc-staleness (cosmetic)
**Severity:** P3 (low)

**Finding:**

The "Next Session Priority" section in STATE.md is labeled `### Immediate (S443) — Shopper Page Strategic UX Exploration`. S443 is already completed (2026-04-11). The label should read S444. No action needed this session — will self-correct at next session wrap.

---

## No Issues Found

- Typology files: confirmed deleted (S437 cleanup completed)
- DECISIONS.md: no entries >3 months old (oldest is 2026-03-10 fee lock, within range for April 13)
- auctionCloseCron.ts: confirmed deprecated stub, not wired — no issue
- CLAUDE.md file references: no obvious 404s detected
- Merge conflicts: none detected
- Skills health: not assessed (no `.skills/` directory accessible from VM)

---

## Action Required

Patrick: On next session start, have Claude dispatch **findasale-architect** with the P1 auction double-cron brief above before any other work. The race condition is live in production on every auction that closes.
