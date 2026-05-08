# Power User Sweep — 2026-05-04 (S638 prep)

**Run date:** Monday May 4, 2026  
**Previous sweep:** 2026-05-02  
**Session context:** S637 complete (Email pipeline: 1.4%→31% hit rate). S638 next: email cron wiring.

---

## Summary

Two P0s remain unfixed for 7 and 2 sweeps respectively. A new P1 was identified: three consecutive sessions (S633–S635) have outstanding push blocks per STATE.md — if Patrick has not run them, Railway is running code that's up to 3 sessions stale. This should be confirmed before S638 email cron dispatch. All scheduled tasks are now healthy (machine was back up May 2; missed-run cluster from April 24–May 1 was machine-off, not scheduler bug).

---

## Critical Carryover (P0 — Unresolved from Prior Sweeps)

### 🔴 P0: dev-environment skill — Neon references (7th consecutive sweep)

Still unfixed. SKILLS_DIR was not accessible in this VM session (no mounted skills path found), confirming this can't be auto-patched — requires skill-creator dispatch + Patrick install from Cowork UI.

**Impact:** Every session that runs a shell, Prisma, or DB command and loads this skill gets incorrect `DATABASE_URL` instructions pointing to a decommissioned Neon database. This is the #1 cause of "migration ran against wrong DB" incidents.

**Fix:** Dispatch skill-creator with instruction to find and replace all Neon references (`ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech`, `@neon.tech`) with the Railway URL (`maglev.proxy.rlwy.net:13949/railway`). Then Patrick installs via Cowork.

**Note:** This has appeared on 7 consecutive sweeps (March 10 → May 4). If it remains unfixed at next sweep, recommend Patrick simply uninstall + reinstall the dev-environment skill as a nuclear option.

### 🔴 P0: findasale-deploy skill — Neon references (2nd consecutive sweep)

Lines 142–143 of the deploy checklist reference `[pooled neon url from packages/backend/.env]` and `[direct neon url]`. The deploy checklist is the most critical path for production migrations — a developer (or Claude session) following it would target a decommissioned database.

**Fix:** Same skill-creator dispatch as above, bundled with dev-environment fix into one install.

---

## New Finding This Sweep (P1)

### 🟡 P1: S633/S634/S635 push blocks may be unexecuted

STATE.md "Next Session → S638" block says:
> "All S635/634/633 push blocks still outstanding if not yet done"

S635 changed 7 files (schema.prisma + migration 20260628). S634 changed 7 files (foursquarePlaces.ts, scraper/index.ts, etc.). S633 changed 10 files (8 GH Actions workflows, schema.prisma, migration 20260503100000) and required `git rm test-esn-api-access.yml`.

If these three push blocks have not been run, Railway is running code from before S633. The email cron dispatch in S638 builds on top of S634/S635 — dispatching into an unsynced codebase risks failed deploys.

**Recommended verification step for S638 session start:** Run GitHub MCP `mcp__github__list_commits` on `deseee/findasale` and confirm commits from S633, S634, and S635 are in `main`. If any are missing, surface the push blocks to Patrick before new work.

---

## Carryover Proposals (Not Yet Actioned)

### P1: Canada compliance watchdog task

Proposed 2 sweeps ago. Still not created. S621 shipped Canada CONDITIONAL GO with 3 live blockers (Quebec Bill 96 French gate, GST/HST $30K threshold, PIPEDA privacy notice). None have automated monitoring.

**Proposal:** New scheduled task `findasale-canada-compliance-check` — monthly, owned by findasale-legal, checks:
1. QC province block present in signup code
2. Cumulative Canadian revenue approaching CA$30K GST threshold
3. PIPEDA-compliant notice in privacy policy

**Patrick input needed:** Approve. Then dispatch findasale-records to create the task.

### P2: Gmail connector — organizer outreach feedback loop

Proposed 2 sweeps ago. With S638 building the email cron to send outreach, having no visibility into whether emails landed/bounced/got replies is a growing gap. Gmail connector is available in Cowork (no-code setup).

**Proposal:** Connect Gmail → update `weekly-pipeline-briefing` to include inbox scan for organizer reply threads.

**Patrick input needed:** Approve Gmail connector access in Cowork settings.

---

## Scheduled Task Audit — 2026-05-04

| Task | Scheduled | Last Run | Status |
|------|-----------|----------|--------|
| findasale-health-scout | Sunday 4:08am | **May 3** | ✅ On schedule (caught up) |
| findasale-competitor-monitor | Thursday 4:05am | May 2 | ✅ Next: May 7 |
| findasale-ux-spotcheck | Wednesday 4:03am | May 2 | ✅ Next: May 6 |
| findasale-monthly-digest | 1st of month 4am | May 2 | ✅ Fired on May 1, next June 1 |
| findasale-workflow-retrospective | 8th of month 4am | April 8 | ⚠️ **Next: May 8 (Thursday)** — confirm it fires |
| context-freshness-check | Monday 4:23am | May 2 | ✅ Due today (fires after this sweep) |
| findasale-power-user-sweep | Monday 3:07am | Today | ✅ This run |
| daily-friction-audit | Mon–Fri 3:38am | May 2 | ✅ Fires today at 3:38am (after this sweep) |
| weekly-pipeline-briefing | Friday 4:03am | May 2 | ✅ Next: May 8 |
| weekly-full-site-audit | Thursday 4am | May 2 | ✅ Next: May 7 |
| weekly-brand-drift-detector | Tuesday 4:07am | May 2 | ✅ Next: May 5 |
| monday-digest | Monday 4:38am | May 2 | ✅ Fires today at 4:38am |
| findasale-session-warmup | Manual | — | ✅ Manual |
| findasale-session-wrap | Manual | — | ✅ Manual |

**Missed-run cluster from April 24–May 1 fully resolved.** All 5 tasks that were flagged last sweep fired on May 2. Machine was clearly back up and triggered the full backlog. No scheduler bug. No action needed.

**One upcoming event:** `findasale-workflow-retrospective` fires May 8 (Thursday). Last run: April 8. This is a monthly meta-audit — with the workflow retrospective due, the CLAUDE.md §0 friction gate improvements from S634, and the 3 sessions of possibly-missing pushes, this should be a rich run. No action needed, just flagging it's coming.

---

## Skill Audit — 2026-05-04

SKILLS_DIR was not mounted in this VM session, so skills cannot be read directly. Audit is based on description fields from active skill list + last sweep findings.

| Skill | Status | Finding |
|-------|--------|---------|
| dev-environment | 🔴 P0 | Neon refs (7th sweep). Skills dir not accessible — can't re-verify in place. Fix via skill-creator. |
| findasale-deploy | 🔴 P0 | Neon refs (2nd sweep). Same fix path. |
| findasale-push-coordinator | ⚠️ ARCHIVED | Still installed. Description says "Do NOT invoke." No fix needed — low risk. |
| context-maintenance | ⚠️ ARCHIVED | Still installed. Same status as above. |
| findasale-dev | ✅ Current | S637 email pipeline work confirms correct dispatch routing. |
| findasale-records | ✅ Current | Session wrap and STATE.md management confirmed working in S637. |
| All other findasale-* | ✅ No flags | No staleness detected. |

---

## Ecosystem Research — 2026-05-04

### Claude Code Routines — Still Research Preview (No Change)

Routines remain in research preview on Claude Code (Pro: 5/day, Max: 15/day, Team/Enterprise: 25/day). Still not in Cowork natively. The recommendation from last sweep stands: candidate migration tasks are `daily-friction-audit`, `weekly-full-site-audit`, `weekly-brand-drift-detector`, `monday-digest`. Hold until Patrick decides on a Claude Code subscription or Routines land in Cowork.

### New MCP Connectors Available

Since last sweep, new connectors identified: **freee** (accounting), **Threads** (social posts), **TMUX** (terminal), **Cointracker/aiwyn** (tax). None are immediately relevant to the email acquisition pipeline focus of S638.

**Threads connector** is tangentially interesting — FindA.Sale has a social sharing feature (#135 Social Templates Expansion) that includes Threads as a tab. The connector would let Claude post on behalf of users, not just generate links. Low priority vs. current acquisition work.

**freee accounting connector** — out of scope for current roadmap priorities.

---

## Auto-Executed Quick Wins This Sweep

None. Both P0 skill fixes require skill-creator dispatch + Patrick install steps, which cannot be auto-executed by the sweep task. The S633/634/635 push verification cannot be auto-executed (would require Patrick's PowerShell). No doc-only fixes identified this sweep.

---

## Research Needed

- **tech-debt-audit-s413.md** (April 8, now 26 days old): Are its findings tracked in the roadmap? Flag for findasale-records review at next session.
- **Stale gamification research** (March 2026, 6+ weeks): `research/gamification-*.md` files. Low priority — gamification system is stable per roadmap. Archive candidate for findasale-records.

---

## Parking Lot

- Uninstall archived skills (findasale-push-coordinator, context-maintenance): Patrick UI action, 2 clicks. Low urgency.
- Affiliate `?aff=` signup flow: UNVERIFIED since S550. Still no Chrome QA. Deferred vs. acquisition pipeline.
- next-session-brief.md from S199 (March 18): Still stale, still not deprecated/deleted. Route through findasale-records when convenient.
- Trademark filing (#82): Decisions Needed, no movement.
