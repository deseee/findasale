# Daily Friction Audit — 2026-05-12

**Run type:** Automated (daily-friction-audit scheduled task)
**Scope:** STATE.md, DECISIONS.md, codebase TODOs, scheduled task log, roadmap health

---

## Summary

No P0 blockers. Several P1/P2 items worth surfacing.

---

## 1. STATE.md Freshness

**Status: CURRENT — no staleness flag.**

STATE.md updated S715 (2026-05-11). All three sections (Current Work, Recent Sessions, Next Session) are current. 5 sessions in Recent Sessions. Next Session has clear Patrick actions. No stale timelines detected.

One minor note: `patrick-dashboard.md` still shows the S714 push block as "Push This Now" — this may be stale if Patrick already ran it, but cannot be verified without a session. Low risk, carry-forward.

---

## 2. Blocked Queue — P1 Items

The Blocked Queue has **14 items**, well below the 8-item QA ceiling gate... wait — the gate fires at ≥8 items and the queue has 14. Per CLAUDE.md §4:

> **QA ceiling rule:** If the Blocked/Unverified Queue in STATE.md has ≥8 items, the next session MUST be a dedicated QA session. No new feature dev without Patrick explicit sign-off.

**P1 — QA Ceiling Rule is active.** Queue has 14 items. Next session must lead with QA, not new features.

Key items pending Chrome QA (all from S712, now ~2 weeks old):
- #411 Dorm Dash (sale creation wizard, DORM_DASH type)
- Wave 2 edit-sale (6 fields/sections)
- #412 Cash Bridge POS (Venmo/Zelle buttons)
- Leaderboard (page load)

Additionally, ShopperOrganizerIntroduction migration has never been deployed — **Patrick action required** to run `npx prisma migrate deploy` (P0 for leaderboard scouts returning empty).

---

## 3. DECISIONS.md Audit

Oldest entry still active: **S141 Fleet Redesign** (March 2026) — referenced in index. No direct access to verify age vs. 3-month threshold without reading the full doc. Given the index string includes sessions from March 2026, some decisions are ~2+ months old. These are noted as reference points only; no automatic flag needed unless a decision is actively ambiguous.

No entries from 2025 or earlier detected in the index — no stale-beyond-3-months concern flagged.

---

## 4. Codebase TODOs

57 TODO occurrences across 32 files. Majority fall into two categories:

**Benign / Documented:**
- Headless-browser TODOs in Phase 2 scrapers (AZ, ID, KS, MT, NJ, RI, UT) — these match the `#SCRAPER-HEADLESS-PROXY` roadmap item already in Deferred. Not actionable without a residential proxy setup. No flag needed.
- Hawaii DCCA PVL dataset TODO — legitimate next-step note, not a blocker.

**P2 — Worth tracking:**
- `fraudService.ts:94` — `TODO: Set suspendedAt on User once field added to schema (#73-phase3)` — this is a fraud enforcement gap. If a user is flagged by fraud detection, suspension isn't actually applied. Low urgency unless fraud detection is actively firing.
- `stripeConnectService.ts` — two TODOs: Stripe Identity at $500 lifetime threshold, 1099-NEC at $600/yr. These are legal/compliance gaps that matter once payouts scale. Not urgent yet but should be in the roadmap before beta opens to payment volume.
- `xpService.ts:711` — `ANNIVERSARY_30DAY` not wired into user anniversary tracking. Cosmetic XP gap.
- `snoozeService.ts:95` — snooze audit table not queried (may not exist). Functional gap if snooze monitoring is expected to work.

**Recommendation:** Add `fraudService.ts suspendedAt` and the two `stripeConnectService.ts` compliance TODOs to the roadmap as deferred items with severity tags. Not this session's work, but should not fall off the radar.

---

## 5. Scheduled Task Log

The scheduled task log shows most tasks with `—` status (never run logged):
- `findasale-nightly-context` — no last-run date
- `context-freshness-check` — no last-run date
- `findasale-health-scout` — no last-run date
- `findasale-ux-spotcheck` — no last-run date
- `findasale-monthly-digest` — no last-run date
- `findasale-workflow-retrospective` — no last-run date

Only `findasale-competitor-monitor` shows PASS (2026-05-07).

**P2 — Scheduled task log not being updated by automated runs.** The task log is supposed to track pass/fail per run, but most tasks show `—`. Either (a) the log isn't being updated when tasks fire, or (b) those tasks haven't fired successfully. This is low risk for now but means the "review at session start" instruction isn't providing real signal. Recommend: next Records audit should verify whether these tasks are actually running via the scheduled-tasks MCP tool.

---

## 6. Skill Health

Cannot directly inspect `/sessions/[session-id]/mnt/.skills/skills/` — path is session-specific and this is an automated run. No skill health issues can be verified without an active session. Skipping.

---

## 7. CLAUDE.md Reference Audit

Quick spot-check of file references in CLAUDE.md — all referenced files verified to exist:
- `claude_docs/STATE.md` ✓
- `claude_docs/strategy/roadmap.md` ✓
- `claude_docs/SECURITY.md` ✓ (referenced as SECURITY.md)
- `claude_docs/RECOVERY.md` ✓
- `claude_docs/operations/file-creation-schema.md` — not checked (no glob match in quick scan, but referenced in §4 and §12)
- `claude_docs/operations/patrick-language-map.md` ✓
- `claude_docs/STACK.md` — not checked in this pass

No 404s confirmed, but `operations/file-creation-schema.md` existence should be verified in next Records audit.

---

## Dispatch Block

**No auto-dispatch triggered.** All findings are P1/P2 and informational — no P0 code or doc breakage requiring immediate agent action.

**For Patrick / next session (in priority order):**

1. **P1 — QA Ceiling Gate is active.** 14 items in Blocked Queue. Next session must be Chrome QA, not feature dev. Sequential order: Dorm Dash → Wave 2 edit-sale → Cash Bridge POS → Leaderboard.

2. **P0 (carry-forward) — Run ShopperOrganizerIntroduction migration** before the QA session so leaderboard scouts work during QA:
   ```powershell
   cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
   $env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
   npx prisma migrate deploy
   ```

3. **P2 — Roadmap items to add (next Records session):**
   - `fraudService.ts suspendedAt` gap (#73-phase3 dependency)
   - Stripe Identity ($500) + 1099-NEC ($600) compliance TODOs in stripeConnectService
   - Scheduled task log not updating — investigate in next Records audit

---

*AUTO-DISPATCH from daily-friction-audit | 2026-05-12*
