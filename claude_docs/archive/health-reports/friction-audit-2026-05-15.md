# Friction Audit — 2026-05-15

**Run by:** daily-friction-audit (automated, 3:38am)
**Session context:** S730 just wrapped — sale wizard cleanup complete

---

## Doc Freshness — PASS

STATE.md and patrick-dashboard.md both updated at S730 wrap (2026-05-15). CONTEXT.md present at project root. decisions-log.md last updated S687 (2026-05-08) — within 2-week window. No stale sections detected.

---

## Critical Doc Audit — PASS WITH NOTE

- CLAUDE.md: references to file paths spot-checked — decisions-log.md, RECOVERY.md, SECURITY.md, STACK.md all confirmed present.
- DECISIONS.md: `claude_docs/brand/DECISIONS.md` is a brand-only file. Main decisions log lives at `claude_docs/decisions-log.md` — both exist, no breakage.
- No TODO/FIXME markers in active claude_docs root (only archives and spotchecks contain them).

---

## Findings

### P1 — QA Ceiling Rule Triggered (Next S731 Must Be QA-Only)

STATE.md Blocked Queue has **15 active items** (13 non-"DONE", including 5 features FIXED but awaiting Chrome QA). CLAUDE.md §4 mandates: "If the Blocked/Unverified Queue has ≥8 items, the next session MUST be a dedicated QA session. No new feature dev without Patrick explicit sign-off." This rule has been locked for 3 consecutive months and is now mandatory.

Recommended S731 opening: run Chrome QA on the 5 Chrome-QA-ready items first (comp tiles, Condition Rating XP, OAuth amber banner, isOnlineOnly/line-queue, Venmo/Zelle POS+holds), then tackle eBay push flow end-to-end.

### P1 — Three Pending Migrations Undeployed (Patrick Action Required)

STATE.md "Next Session" shows S730 push block has not been run. Three migrations are pending:
- `20260515180000` — email verification token expiry (P0 security fix, S726)
- `20260515000000` — eBay store URL field (S728)
- `20260515200000` — return window to organizer settings (S730)

Features that depend on these fields are silently broken in production until Patrick deploys. Deploy block is in STATE.md §Next Session and patrick-dashboard.md.

### P2 — Hardcoded "24 hours" Hold Copy — FIXED THIS RUN

Two files contained user-facing copy claiming holds last "24 hours," which became inaccurate after S730 changed hold duration to rank-based (30–90 minutes). Both fixed inline:

- **support.tsx line 194** — FAQ "How long do holds last?" answer rewritten: now accurately states rank-based 30–90 min range, removed false claim about "customizing in sale settings."
- **shopper/holds.tsx line 118** — Active holds banner updated from "24 hours from placement" to "Hold duration depends on your Explorer rank (30–90 minutes)."

These two files must be added to the S731 push block (already added to STATE.md §Next Session).

### P3 — STATE.md Duplicate Entry — FIXED THIS RUN

Lines 96–98 had the S712 organizer seeding note duplicated verbatim. Removed the duplicate.

---

## Codebase TODOs

31 TODO occurrences across 20 backend `.ts` files. Spot-checked: xpService, stripeConnectService, snoozeService, bountyController, scraper sources. All pre-existing context notes or deferred stubs — no owner-less blockers introduced recently. No action needed.

---

## Skill Health

Skills directory not traversed in this run (requires VM path resolution outside automated context). No skill file regressions observed in recent session logs. No `.skill` files pending packaging flagged in claude_docs.

---

## Actions Taken This Run

| Action | Severity | Status |
|--------|----------|--------|
| Fixed "24 hours" → rank copy in support.tsx | P2 | ✅ Done |
| Fixed "24 hours" → rank copy in shopper/holds.tsx | P2 | ✅ Done |
| Removed duplicate STATE.md paragraph (S712 seeding note) | P3 | ✅ Done |
| Added support.tsx + holds.tsx to S731 push block in STATE.md | housekeeping | ✅ Done |
| Flagged QA ceiling rule + pending migrations for S731 | P1 | 📋 Report only |

---

**Next audit:** 2026-05-16 (automated)
