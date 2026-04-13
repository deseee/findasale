# Daily Friction Audit — 2026-04-01

**Automated run. Patrick not present.**
**Session in progress:** S365 (Camera UI polish + zoom/autofocus dispatch)

---

## Findings

### P1 — Pending Patrick Pushes (2 blocks outstanding)

**Feature #121 wiring** (since S364, 2026-03-31)
Files: `LeaveSaleWarning.tsx`, `OrganizerHoldsPanel.tsx`, `organizer/dashboard.tsx`, `sales/[id].tsx`, `STATE.md`, `patrick-dashboard.md`, `roadmap.md`
Push block is in both STATE.md "Current Work" and patrick-dashboard.md. Marked NOT YET PUSHED.

**#37 Sale Alerts — notifications.tsx** (since S359, 2026-03-31)
File: `packages/frontend/pages/shopper/notifications.tsx`
Tab styling fix. Has been carried through S360, S361, S362, S363, S364 — 6 sessions without being pushed.

These are blocking because QA of #37 Sale Alerts (full browser verify) is blocked until notifications.tsx is on Vercel.

**Dispatch:** Surfaced in Next Session patrick-dashboard.md. No new dispatch needed — already documented. Flag only.

---

### P1 — Railway Not Deployed: #153 + #41 (since S357)

STATE.md S356 carry-over section:
- ⏳ **#153 Organizer Profile social fields** — code on GitHub (a60e912 + cache-bust 994ba10), Railway not deployed
- ⏳ **#41 Flip Report ownership** — code on GitHub (9ec5ea1), Railway not deployed

These were first flagged in S357 (2026-03-31) and have persisted through S365 with no Railway deploy confirmation. These are Express backend changes — they require Railway to pick up the new deployment to work live.

**Root cause:** Railway deploys auto-trigger on push, but Railway transient errors (e.g., Dockerfile cache issues, null bytes) have blocked builds repeatedly. No confirmation of successful Railway build for these commits was logged.

**Dispatch:** Flag for Patrick — confirm Railway shows green for these commits at `backend-production-153c9.up.railway.app`. If stuck, cache-bust `Dockerfile.production`.

---

### P2 — STATE.md Exceeds 250-Line T5 Gate

STATE.md is 340 lines. CLAUDE.md §11 T5 states: "If >250 lines, archive oldest completed-features section."

The Recent Sessions section extends back to S332 (2026-03-28). Sessions S332–S349 are all marked COMPLETE and represent resolved work. These can be archived to `claude_docs/archive/` at next session wrap.

**Dispatch:** findasale-records at next session wrap — archive sessions S332–S349 from STATE.md to trim below 250 lines.

---

### P2 — QA Backlog Accumulation (6 features, 4+ sessions)

The following features have been carried in "Next Session" priorities since S361 without verification:

| Feature | Unverified Since |
|---------|-----------------|
| #37 Sale Alerts (full verify) | S359 (blocked on notifications.tsx push) |
| #199 User Profile dark mode | S359 |
| #58 Achievement Badges | S346 |
| #29 Loyalty Passport | S346 |
| #213 Hunt Pass CTA | S347 |
| #131 Share Templates | S347 |

None of these are in the Blocked/Unverified Queue yet. They are listed in "Next Session" notes but have not been formally queued. At 4+ sessions they should either be added to the Blocked/Unverified Queue (with reason) or dispatched for QA.

**Dispatch:** findasale-records — move these 6 items to the Blocked/Unverified Queue table with reason "QA deferred — camera work took priority S361–S365" and session added.

---

### P2 — CLAUDE.md T4 Rule References Non-Existent File

CLAUDE.md §11 T4:
> "Session-log rotation: Keep 3 most recent entries. Move oldest to `claude_docs/session-log-archive.md`."

`claude_docs/session-log-archive.md` does not exist. This rule predates the S264 consolidation (session-log.md → STATE.md). The T4 rule is now stale — session rotation happens inside STATE.md "## Recent Sessions" (keep 5 most recent), not a separate file.

**Impact:** Low (rule is rarely invoked), but the 404 reference will confuse future sessions.

**Dispatch:** findasale-records — update CLAUDE.md §11 T4 to remove the session-log-archive.md reference and replace with: "Session entries in STATE.md ## Recent Sessions: keep 5 most recent. Archive oldest to claude_docs/archive/ when section exceeds 10 entries."

---

### P3 — Friction Audit Files Not Archived

Per file-creation-schema.md (Tier 3 One-Time Artifacts): "Must be archived on completion."

The following friction audit files are in `claude_docs/operations/` but should have been moved to `claude_docs/archive/` after completion:
- `friction-audit-2026-03-24.md`
- `friction-audit-2026-03-26.md`
- `friction-audit-2026-03-27.md`
- `friction-audit-2026-03-30.md`
- `friction-audit-2026-03-31.md`

These are completed artifacts. Today's audit (`friction-audit-2026-04-01.md`) will need to be archived after its findings are actioned.

**Dispatch:** findasale-records at next wrap — batch move completed friction audits to `claude_docs/archive/`.

---

### P3 — S362 "NOT YET COMMITTED" Note Appears Stale

STATE.md Recent Sessions has S362 files listed as "NOT YET COMMITTED." However, git log shows extensive camera commits from S363+ that clearly include these files (RapidCapture.tsx, RapidCarousel.tsx, imageUtils.ts, ItemCard.tsx, etc.). The stale language in S362's block is confusing.

**Impact:** Low — cosmetic confusion in historical context only.
**Dispatch:** findasale-records — update S362 entry in STATE.md to remove "NOT YET COMMITTED" block and note "Committed via S363 recovery push."

---

## Summary

| Severity | Finding | Action |
|----------|---------|--------|
| P1 | 2 Patrick push blocks outstanding (#121 + #37 notifications) | Already in patrick-dashboard.md — flag |
| P1 | #153 + #41 Railway may not be deployed | Patrick to verify Railway build |
| P2 | STATE.md 340 lines, exceeds 250-line T5 gate | findasale-records at wrap |
| P2 | QA backlog: 6 features unverified 4+ sessions | findasale-records to queue them |
| P2 | CLAUDE.md T4 references non-existent session-log-archive.md | findasale-records to fix |
| P3 | Friction audit files not archived per Tier 3 rule | findasale-records at next wrap |
| P3 | S362 stale "NOT YET COMMITTED" note in STATE.md | findasale-records to clean |

**No code-level blockers detected. No merge conflicts. No TypeScript build errors triggered by docs.**

S365 camera work is not blocked by any of the above findings.
