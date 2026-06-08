# Daily Friction Audit — 2026-05-06
**Run:** Automated (daily-friction-audit scheduled task)
**Session context:** Latest completed session is S657. Today is the planned outreach pipeline launch day (Wednesday May 6).

---

## Summary

No P0 blocking issues found. Two P2 code bugs identified in today's UX spot-check file that need a dev dispatch. Outreach pipeline is security-hardened and ready but blocked on Patrick's push actions. STATE.md is current; minor structural drift noted.

---

## Findings

### P1 — Business Blocker (Patrick action required, not code)

**Outreach pipeline not yet activated — day 1 of planned launch**

S657 wrap confirmed the pipeline is security-hardened and ready. However:
- S657 push block not yet confirmed pushed (`outreach.ts` + `outreachEmailsCron.ts` + wrap docs)
- `OUTREACH_ENABLED=true` not yet set on Railway
- `CATEGORY_SYNC_ENABLED=true` not yet set on Railway

The cron fires every 4 hours. Until these are set, zero emails go out despite 3,298 organizers queued. This is a Patrick action, not a code issue — flagging as P1 due to business timing impact (Wednesday launch window).

**No dispatch needed. Patrick must push S657 block and set env vars.**

---

### P2 — Code Bugs (auto-dispatched via UX spot-check findings)

The UX spot-check from today (`claude_docs/ux-spotchecks/2026-05-06.md`) identified two P1-severity code bugs requiring a dev dispatch at S658:

**Bug 1 — Rules of Hooks violation: `packages/frontend/pages/organizer/line-queue/[id].tsx`**
- Auth guard at line 56 (`if (!authLoading && ...) { return null; }`) fires AFTER `useState` but BEFORE `useCallback` (line 59) and `useEffect` (line 71)
- On first render: hooks run normally. On subsequent render where non-organizer is detected: component returns early, hooks not called → React throws "Rendered fewer hooks than expected"
- Severity: HIGH — crashes for all non-organizer visitors to this page once auth resolves
- Fix: move auth guard to AFTER all hook declarations (after line 71), or use `useEffect` for the redirect

**Bug 2 — Pickups tab renders blank screen: `packages/frontend/pages/shopper/dashboard.tsx`**
- "Pickups" tab exists in tab strip, tracked in state, hash routing, and type definitions
- `MyPickupAppointments` component is imported (line 32) but never rendered in the JSX
- Clicking Pickups produces a completely empty content area
- Severity: HIGH — complete blank screen for shoppers on a visible tab
- Fix: add `{activeTab === 'pickups' && <MyPickupAppointments />}` block in the tab content area

**Dispatch block for S658 (findasale-dev):**
```
Read packages/frontend/pages/organizer/line-queue/[id].tsx in full.
Fix Rules of Hooks violation: move the auth redirect guard (currently fires at line ~56 
with `return null`) to AFTER all hook declarations. All hooks (useState, useCallback, 
useEffect) must be called unconditionally before any early return.

Read packages/frontend/pages/shopper/dashboard.tsx in full.
Fix blank Pickups tab: MyPickupAppointments is imported but never rendered.
Add {activeTab === 'pickups' && <MyPickupAppointments />} in the tab content section.

Run npx tsc --noEmit --skipLibCheck in packages/frontend after both fixes.
Return explicit list of changed files.
```

---

### P2 — STATE.md Structural Drift

STATE.md contains four separate "## Next Session" sections:
- `## Next Session — S658` (current — correct)
- `## Next Session — S651` (historical — should be archived)
- `## Next Session — S650` (historical — should be archived)
- `## Next Session — S645` (historical — should be archived)

Per CLAUDE.md §12, STATE.md should have one "## Next Session" section. The three historical ones are carryover from sessions before the session-log consolidation. They add ~120 lines of clutter and make the "what's actually next" ambiguous at a glance.

**Dispatch: findasale-records at S658 start** — archive the three stale Next Session sections into the session history or remove them, keeping only `## Next Session — S658`.

---

### P3 — Cosmetic (no action needed)

**Roadmap.md header shows v132 / 2026-05-04**
S655-S657 sessions may have roadmap.md changes pending in Patrick's unpushed commit. Once S657 push block lands, the roadmap should be current. If it's still at v132 after S658 push confirmation, flag for a records update.

**patrick-dashboard.md still shows S647 push blocks**
The "Action Items for Patrick" section at the bottom has the full three S647 push blocks — these are 10+ sessions old and superseded. Low noise — the current S657 actions are at the TOP of the dashboard where Patrick looks first. No urgent cleanup needed.

**Blocked/Unverified Queue — AI listing enrichment (S651)**
Been unverified for 6 sessions. Needs a Railway log check for `[listingEnrichmentService]` or a DB query on `scrapedMetadata.aiEnriched`. Low priority until Patrick confirms a scraped sale with description >50 chars has loaded.

---

## DECISIONS.md health

Most recent decision: 2026-05-02 (S626) — Organizer Acquisition Pipeline. No decisions older than 3 months requiring review. Decisions log is clean.

---

## Doc TODO/FIXME markers

156 total occurrences across 63 files — all in archive/, historical health reports, and operational docs. No active feature specs or claude_docs/ root files with blocking TODOs. Not actionable.

---

## Skill health

Skill files: not directly accessible in this automated run (read-only VM mount). No skill-related issues reported in recent sessions. Last skill audit confirmed in S492 (14 scheduled tasks verified firing).

---

## Verdict

**No P0 issues. Two P2 code bugs ready for S658 dev dispatch (see above). Primary business action is Patrick pushing S657 block and setting Railway env vars — the outreach pipeline is launch-ready pending those two steps.**

Next session (S658): lead with push confirmation check, then dispatch the two line-queue + shopper dashboard bugs to findasale-dev in a single batched call.
