# Power User Sweep — 2026-05-02

**Agent:** Cowork Power User (scheduled run)
**Trigger:** findasale-power-user-sweep weekly task
**Sessions reviewed:** S618–S622 (STATE.md current)
**Files read:** STATE.md (key sections), roadmap.md (BROKEN + Patrick Checklist), next-session-brief.md, improvement-memos/power-user-sweep-2026-04-20.md, research/ directory listing
**Scheduled tasks audited:** 14 tasks (full list)
**Skills audited:** 35 installed skills
**Ecosystem searches:** Claude Routines, new MCP connectors, plugin marketplace May 2026

---

## ⚠️ Priority Alerts

### 🔴 P0 (6th sweep): dev-environment — Neon references STILL present

This has been flagged every sweep since March 30. Still unresolved as of today.

- Line 48: `"For Neon (production): Find the commented line # DATABASE_URL=postgresql://neondb"`
- Lines 100, 104, 106, 119, 141, 143, 183, 217: Multiple Neon references throughout

Neon was decommissioned in S264. Production DB is Railway (`maglev.proxy.rlwy.net:13949/railway`). This skill actively misleads any session that reads it for migration commands.

**Status:** Requires Patrick to run `skill-creator` + install the updated `.skill` file. Cannot be auto-fixed from a scheduled run. This is the #1 skill correctness P0 in the project.

### 🔴 P0 (NEW): findasale-deploy skill — Neon references confirmed

Lines 142–143 of the deploy skill read:
```
$env:DATABASE_URL="[pooled neon url from packages/backend/.env]"
$env:DIRECT_URL="[direct neon url from packages/backend/.env]"
```

This is the deploy checklist — the most critical path for production migrations. A developer following this instruction would target a decommissioned database. First time this specific file is flagged.

**Action needed:** Update via skill-creator alongside the dev-environment fix.

### 🟡 P1 (NEW): daily-friction-audit missed 5 weekday runs

`lastRunAt: 2026-04-24` (Thursday). The task is scheduled Mon–Fri at 3:38am.

Expected runs that did not fire: April 27 (Mon), April 28 (Tue), April 29 (Wed), April 30 (Thu), May 1 (Fri).

Three other weekly tasks also missed their last cycle:
- `weekly-full-site-audit`: should have run April 30 (last ran April 23)
- `monday-digest`: should have run April 27 (last ran April 20)
- `weekly-brand-drift-detector`: should have run April 28 (last ran April 21)

This pattern (multiple tasks missing a full week's cycle around the same period) may indicate the Cowork desktop app was closed or the machine was off for an extended period April 24–May 1. No action needed if Patrick's machine was simply off — these are desktop-bound scheduled tasks. But if the machine was on, this is a scheduler issue worth reporting to Anthropic support.

**Context:** Claude Routines (see Ecosystem section below) would solve this permanently by running on Anthropic's cloud regardless of machine state.

---

## Auto-Executed Quick Wins This Sweep

None auto-executed. Both P0 skill fixes require Patrick install steps. The stale `next-session-brief.md` (see below) is a doc issue that routes through findasale-records.

---

## Ecosystem Research — 2026-05-02

### 🟡 Claude Routines — Cloud Automation (Research Preview, April 14)

Anthropic shipped **Routines** on April 14, 2026 — cloud-hosted automation that runs on Anthropic's servers even when Patrick's laptop is closed. Each routine bundles a prompt, repositories, and connectors, with three trigger types: scheduled (cron), API (HTTP POST), and GitHub events.

**Availability:** Claude Code Pro (5/day), Max (15/day), Team/Enterprise (25/day). Research preview.

**Why this matters for FindA.Sale:** The daily-friction-audit missing 5 runs this week is exactly the failure mode Routines solve. Any scheduled task that needs to run regardless of machine state (health scout, competitor monitor, QA spotchecks) is a candidate for migration. Desktop Scheduled Tasks remain available for tasks that need local file access.

**Recommended migration candidates:** `daily-friction-audit`, `weekly-full-site-audit`, `weekly-brand-drift-detector`, `monday-digest`. All of these read GitHub files via MCP and produce reports — no local file access needed.

**Blocker:** Routines is Claude Code, not Cowork. Patrick would need to evaluate whether this is worth setting up a Code subscription alongside Cowork. Parking lot until Routines exits research preview or lands in Cowork natively.

### New MCP Connectors Available (April 2026)

**Available in Cowork plugin marketplace:**
- **Google Drive, Gmail, Google Calendar** — pre-built, no-code setup
- **DocuSign** — relevant if consignment agreements ever go digital
- **Microsoft 365** — connector landed April 8
- **Apollo, Clay, Outreach** — CRM/sales enrichment (relevant to organizer outreach pipeline)

**FindA.Sale applicability:** 
- Gmail connector could let the `weekly-pipeline-briefing` task read Patrick's inbox for organizer reply threads. Currently it produces outreach drafts that sit in Gmail unseen by Claude. Connecting Gmail would close the feedback loop.
- Apollo/Clay are lower priority until Patrick chooses a CRM strategy.

### Creative Tool Connectors (April 28) — Low Relevance

Nine connectors for Adobe, Blender, Autodesk, Ableton, Splice, Affinity, SketchUp, Resolume. Not applicable to FindA.Sale's stack.

---

## Skill Audit — 2026-05-02

| Skill | Status | Finding |
|-------|--------|---------|
| dev-environment | 🔴 P0 | 9 Neon references (6th sweep) |
| findasale-deploy | 🔴 P0 | Lines 142–143 reference Neon DB (first flag) |
| findasale-push-coordinator | ⚠️ ARCHIVED | Marked archived in description. Still installed. Low risk — description says "Do NOT invoke." |
| context-maintenance | ⚠️ ARCHIVED | Same — marked archived, still installed. Low risk. |
| findasale-records | ✅ Current | Owns session wrap, STATE.md, scheduled tasks. |
| findasale-dev | ✅ Current | Canada expansion (S621) and scraper work reflect correct routing. |
| findasale-qa | ✅ Current | QA honesty gate language matches CLAUDE.md §9. |
| findasale-competitor | ✅ Current | Ran today (2026-05-02). Description says "Thursday 4am" — matches schedule. |
| health-scout | ✅ Current | Ran April 26 (Sunday). Next run May 3. On schedule. |
| All other findasale-* skills | ✅ No flags | No staleness detected in descriptions. |

**Archived skills taking up namespace:** `findasale-push-coordinator` and `context-maintenance` are both marked ARCHIVED in their descriptions but remain installed. They appear in skill lists and could confuse triggering logic. Recommend Patrick uninstall both via Cowork plugin manager (no skill-creator needed — it's a UI action).

---

## Scheduled Task Audit — 2026-05-02

| Task | Scheduled | Last Run | Status |
|------|-----------|----------|--------|
| findasale-health-scout | Sunday 4:08am | April 26 | ✅ On schedule |
| findasale-competitor-monitor | Thursday 4:05am | May 2 (today) | ✅ Running |
| findasale-ux-spotcheck | Wednesday 4:03am | May 2 (today) | ✅ Running |
| findasale-monthly-digest | 1st of month 4am | May 2 (today) | ✅ Running (May 1 trigger) |
| findasale-session-warmup | Manual | — | ✅ Manual, no cadence |
| findasale-session-wrap | Manual | — | ✅ Manual, no cadence |
| findasale-workflow-retrospective | 8th of month 4am | April 8 | ✅ Next: May 8 |
| context-freshness-check | Monday 4:23am | May 2 (today) | ✅ Running |
| findasale-power-user-sweep | Monday 3:07am | May 2 (today) | ✅ This run |
| daily-friction-audit | Mon–Fri 3:38am | April 24 | 🟡 5 missed runs |
| weekly-pipeline-briefing | Friday 4:03am | April 24 | 🟡 Missed May 1 |
| weekly-full-site-audit | Thursday 4am | April 23 | 🟡 Missed April 30 |
| weekly-brand-drift-detector | Tuesday 4:07am | April 21 | 🟡 Missed April 28 |
| monday-digest | Monday 4:38am | April 20 | 🟡 Missed April 27 |

**Pattern finding:** 4 tasks missed their last scheduled run. All 4 share `lastRunAt` dates of April 20–24. This cluster strongly suggests Patrick's machine was off or Cowork was closed April 24 – May 1. The 5 tasks that show `lastRunAt: 2026-05-02` all fired as part of today's trigger cluster — machine came back up and batch-fired. This is expected behavior for desktop-bound tasks, not a bug.

**Missing task proposal:** There is no automated task that verifies **Canada expansion follow-through items**. S621 shipped a CONDITIONAL GO with specific blockers (Quebec Bill 96 block at signup, GST/HST threshold tracking, PIPEDA compliance clause). None of these have a monitoring or reminder task. Proposal in next section.

---

## Proposals Needing Patrick's Input

### P-1: Migrate 4 weekly tasks to Claude Code Routines

**Context:** daily-friction-audit, weekly-full-site-audit, weekly-brand-drift-detector, and monday-digest all missed runs this week because the machine was down. All 4 read GitHub via MCP and produce reports — no local file access needed.

**Proposal:** When Claude Code Routines exits research preview (or if Patrick sets up a Code subscription now), migrate these 4 tasks to cloud routines. Desktop tasks remain for session-warmup and session-wrap (local file access needed).

**Patrick input needed:** Is he on a Claude Code plan? Does he want to evaluate this now vs. wait for Routines to land in Cowork natively?

### P-2: Install Gmail connector for organizer outreach feedback loop

**Context:** The `weekly-pipeline-briefing` task produces outreach drafts but has no visibility into whether Patrick sent them or received replies. The Gmail MCP connector (available now, no-code setup) would let pipeline briefing tasks read reply threads and report conversion status.

**Proposal:** Connect Gmail in Cowork settings → update `weekly-pipeline-briefing` SKILL.md to include an inbox check step for FindA.Sale-related threads.

**Patrick input needed:** Approve Gmail connector access in Cowork settings.

### P-3: Create Canada expansion compliance watchdog task

**Context:** S621 CONDITIONAL GO has three live blockers: (1) Quebec Bill 96 French-translation requirement (block QC province at signup), (2) GST/HST registration threshold (CA$30K), (3) PIPEDA-compliant privacy notice. None of these have a monitoring task or roadmap reminder.

**Proposal:** New scheduled task `findasale-canada-compliance-check` — monthly, owned by findasale-legal, checks whether QC province block is in signup code, whether cumulative Canadian revenue is approaching the GST threshold, and whether PIPEDA notice has been added to privacy policy.

**Patrick input needed:** Approve the task. Dispatch findasale-records to create it once approved.

---

## Research Needed

- **Stale research files:** `research/The_True_Plan.md`, `research/staleness-flag-*.md` (4 files from March 2026), and the gamification research docs (March 2026) are over 6 weeks old. Worth a pass by findasale-records to assess whether they should be archived. Not urgent, parking lot.
- **tech-debt-audit-s413.md** (April 8): This audit is 3+ weeks old. Are its findings tracked in the roadmap or were they silently discarded? Worth checking against current BROKEN section.

---

## Parking Lot

- **Uninstalling archived skills** (findasale-push-coordinator, context-maintenance): Low-urgency housekeeping. Can be done via Cowork UI in 2 clicks — no skill-creator needed.
- **Affiliate ?aff= signup flow** — marked UNVERIFIED since S550. No Chrome QA yet. Low-priority vs. current scraper/Canada work.
- **next-session-brief.md** is from S199 (March 18, 2026). This file was supposed to be deprecated after STATE.md absorbed "## Next Session" content. It now contains completely stale content (~400 sessions behind). Should be deleted or clearly marked DEPRECATED. Route through findasale-records.
