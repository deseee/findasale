# Friction Audit — 2026-04-10

**Run by:** daily-friction-audit (automated)
**Scope:** STATE.md freshness, critical docs, codebase health, skill health

---

## Summary

3 non-cosmetic findings: 1 P1 (critical), 1 P1 (structural risk), 1 P2 (ops gap). Auto-dispatching records agent for P1.

---

## P1 — STATE.md Exceeds Read Tool Size Limit (§11 T5 Violation)

**Category:** doc-staleness / token-efficiency
**Severity:** P1

STATE.md is 2,712 lines / 256KB. The Read tool's maximum file size is 256KB — the file now returns an error when read without offset/limit parameters. Sessions loading STATE.md at init are silently receiving a truncated view.

§11 T5 rule: "If >250 lines, archive oldest completed-features section." The file is 10x that threshold.

**Context files:**
- `claude_docs/STATE.md` (cannot be read in full — this is the problem)
- `claude_docs/COMPLETED_PHASES.md` (exists — archive target)

**Suggested action:** findasale-records should:
1. Read STATE.md in paginated chunks (offset/limit)
2. Identify sessions older than S425 (roughly pre-2026-04-09) that are complete with no open QA or Patrick actions
3. Move those session blocks to COMPLETED_PHASES.md
4. Keep: Current Work, Next Session Priority, QA QUEUE, Blocked/Unverified Queue, and the 5 most recent completed sessions
5. Update patrick-dashboard.md with a note that STATE.md was compacted
6. Provide pushblock with both files

**AUTO-DISPATCH from daily-friction-audit**

---

## P1 — Three Auction Cron Files — Possible Conflict

**Category:** code-quality / architectural clarity
**Severity:** P1

Three auction job files exist in `packages/backend/src/jobs/`:
- `auctionCloseCron.ts` — deprecated stub (S415, "auctionJob.ts is authoritative")
- `auctionJob.ts` — declared authoritative in S415 (has reserve price, XP awards, Stripe PaymentIntent)
- `auctionAutoCloseCron.ts` — NEW from S433 (5-min auto-close cron with winner + organizer notification)

S433 created a NEW auto-close cron without referencing the S415 deprecation decision. It's unclear whether:
- `auctionAutoCloseCron.ts` fully replaces `auctionJob.ts`, or
- Both are wired in `index.ts` (running duplicate close logic), or
- `auctionJob.ts` handles close + awards while `auctionAutoCloseCron.ts` handles close + notifications

**Context files:**
- `packages/backend/src/jobs/auctionCloseCron.ts`
- `packages/backend/src/jobs/auctionJob.ts`
- `packages/backend/src/jobs/auctionAutoCloseCron.ts`
- `packages/backend/src/index.ts` (to see which jobs are actually wired)

**Suggested action:** findasale-architect to audit all three files + index.ts wiring and return a verdict: consolidate into one authoritative cron or document the separation of concerns clearly. Flag if both `auctionJob.ts` and `auctionAutoCloseCron.ts` are doing close logic (would fire twice on same auction).

**AUTO-DISPATCH from daily-friction-audit**

---

## P2 — Stripe Connect Webhook for POS Payments Unresolved (S421, 2026-04-08)

**Category:** ops-gap
**Severity:** P2

STATE.md line 2306 shows "Patrick Action First — Stripe Connect webhook" still in the Blocked/Unverified Queue. This Stripe Dashboard configuration step has been pending since S421 (2026-04-08). Without it, items sold via POS are NOT marked SOLD and Purchase records are NOT created after card payment.

**What's needed:**
- Patrick configures Connect webhook in Stripe Dashboard: URL `https://backend-production-153c9.up.railway.app/api/webhooks/stripe`, event `payment_intent.succeeded` on Connected accounts, copy secret → Railway env `STRIPE_CONNECT_WEBHOOK_SECRET`

**Not auto-dispatched** — this requires Patrick's Stripe Dashboard access. Flagging for visibility.

---

## P3 — QA Backlog Spanning 6+ Sessions

**Category:** qa-debt
**Severity:** P3

The QA QUEUE in STATE.md covers S419–S431. Items postponed due to usage limits include: Yahoo spam test (S430), iOS geo (S430), auction Buy Now gate (S430), print label (S430), photo upload (S430), full invoice flow (S427), Send to Phone end-to-end (S421), Lucky Roll page (S420), Custom Map Pin (S420), Showcase Slot unlock (S420), Treasure Trail XP gate (S420), trail detail page (S431).

S434 focus is auction QA (S433). After that, a dedicated QA sweep session for the backlog is overdue.

**Not auto-dispatched** — Patrick-scheduled QA work, not a codebase defect.

---

## P3 — 15 Active TODOs in packages/

**Category:** code-quality
**Severity:** P3

15 TODO/FIXME markers found across backend + frontend (excluding tests and deprecated stubs). Notable:
- `AvatarDropdown.tsx:219` — rank badge not wired to real XP data
- `ShopperCartDrawer.tsx:212` — hold-to-pay flow not wired
- `luckyRollController.ts:94` — notification not sent on lucky roll win
- `itemQueries.ts:43` — draftStatus backfill deferred

These are tracked development debt, not blocking bugs. No immediate action required.

---

## P3 — Friction Audit Files Accumulating (14 files, no archive policy)

**Category:** doc-hygiene
**Severity:** P3

14 friction audit files in `claude_docs/operations/` spanning 2026-03-23 to 2026-04-07. No archiving policy is defined for these files. Today's run (2026-04-10) adds #15. Files older than 2 weeks could be moved to `claude_docs/archive/` when convenient.

**Not auto-dispatched** — cosmetic, no operational impact.

---

## No Issues Found

- STACK.md: matches current package structure ✓
- CLAUDE.md reference files: all exist in `claude_docs/operations/` ✓
- DECISIONS.md: exists at `claude_docs/brand/DECISIONS.md` ✓
- session-log.md / next-session-prompt.md: correctly consolidated into STATE.md ✓
- Skill files: `claude_docs/operations/conversation-defaults.skill` present ✓
- S433 migration (`20260410_add_max_bid_by_user`): present in migrations folder ✓
- S420 migration (`20260408_add_xp_sinks_showcase_mappin`): present in migrations folder ✓

---

*Next run: 2026-04-14 (Mon) 03:38 AM*
