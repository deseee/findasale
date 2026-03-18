# Power User Sweep — 2026-03-08

**Run by:** Cowork Power User (scheduled weekly)
**Project state:** Session 93 complete. Sprint 4b shipped. Sprint 5 (Seller Performance Dashboard) next. Beta status: GO.

---

## Ecosystem Research

### New Cowork/Claude Features (March 2026)

1. **Customize menu** — Anthropic added a unified Customize section in Claude Desktop grouping skills, plugins, and connectors. Already using this effectively.
2. **Plugin marketplace mature** — 11 official Anthropic Labs plugins now available (sales, legal, finance, marketing, data, engineering, etc.). FindA.Sale already has marketing, engineering, product-management, and others installed. Coverage is good.
3. **12 new MCP connectors (Feb 2026)** — Google Calendar, Google Drive, Gmail, DocuSign, Apollo, Clay, Outreach, Similarweb, WordPress, FactSet, MSCI, Harvey. **Google Calendar + Gmail could be useful** for beta organizer coordination and support email monitoring.
4. **Claude Marketplace (March 2026)** — Enterprise-focused partner marketplace (GitLab, Harvey, Replit, etc.). Not directly relevant to FindA.Sale's current scale.
5. **Worktree isolation for scheduled tasks** — Can now toggle worktree mode so scheduled runs don't interfere with manual work. Worth enabling for health-scout and UX spotcheck tasks.
6. **MCP server deduplication** — Duplicate MCP servers are now auto-skipped. No action needed.

### Connector/Plugin Scouting

- No estate-sale-specific connectors or plugins found in MCP registry or plugin marketplace.
- Google Calendar MCP could help track organizer onboarding milestones and beta scheduling.
- Gmail MCP could enable automated support email triage (route to findasale-support skill).

---

## Skill Audit

### Findings

| Skill | Status | Issue |
|-------|--------|-------|
| dev-environment | ✅ Clean | Docker references are correctly marked as RETIRED. No stale paths. |
| conversation-defaults | ✅ Clean | All 5 rules active and current. AskUserQuestion bug resolved note is accurate. |
| cowork-power-user | ✅ Clean | Dynamic path resolution (`ls -d /sessions/*/mnt/...`). No stale refs. |
| All 14 findasale-* skills | ✅ Spot-checked | No Docker references in active instructions. Some mention Docker only in "don't do this" context. |
| Core document skills (docx, pdf, pptx, xlsx) | ✅ N/A | Anthropic-maintained, not project-specific. |

### No staleness issues found in skill library this week.

---

## Scheduled Task Audit

### Active Tasks (9 total, 1 disabled)

| Task | Schedule | Status | Issue |
|------|----------|--------|-------|
| findasale-health-scout | Sunday 11pm | ✅ Running | OK |
| findasale-competitor-monitor | Monday 8am | ✅ Running | OK |
| findasale-ux-spotcheck | Wednesday 9am | ✅ Running | Last ran 3/4 |
| findasale-monthly-digest | 1st of month 9am | ✅ Running | Next: April 1 |
| findasale-session-warmup | Manual | ✅ Available | OK |
| findasale-session-wrap | Manual | ✅ Available | OK |
| findasale-workflow-retrospective | 8th of month 9am | ✅ Running | Ran today |
| context-freshness-check | Daily 8am | ✅ Running | Ran today |
| findasale-power-user-sweep | Sunday 10pm | ✅ Running | **⚠️ Stale paths** |
| weekly-industry-intel | Monday 9am | Disabled | Correctly merged into competitor-monitor |

### Issue Found: `findasale-power-user-sweep` has hardcoded stale session paths

The SKILL.md for this task references `/sessions/gracious-vigilant-gates/mnt/...` — an old session that no longer exists. The cowork-power-user skill itself correctly uses dynamic resolution (`ls -d /sessions/*/mnt/...`), but the scheduled task file bypasses the skill and hardcodes the old path.

**Fix:** Update the scheduled task prompt to use dynamic path resolution matching the skill's pattern, or simply instruct it to load the cowork-power-user skill instead of re-specifying paths.

---

## Research-to-Roadmap Gap Analysis

### Actionable items from research docs NOT yet on roadmap:

1. **Google Search Console MCP setup** — R&D handoff (3/7) recommended immediate GSC connection at zero cost. Not on Patrick's checklist or roadmap. **Impact: Medium.** Establishes SEO baseline before beta launch. **Effort: Quick win (20 min).**

2. **Live Scarcity Counter** — Feature brainstorm ranked #1 by impact-to-effort. Low effort, high impact on buyer engagement. Not on the roadmap feature pipeline. **Impact: High.** FOMO psychology drives conversions. **Effort: 1 sprint.**

3. **Local partnership outreach templates** — Growth channels doc identifies probate attorneys, senior living facilities, moving companies as highest-ROI non-product growth channels. No outreach templates exist yet. **Impact: High for beta recruitment.** **Effort: Quick win (findasale-marketing).**

4. **Google Business Profile** — On Patrick's checklist in roadmap but not checked off. R&D + growth channels docs both flag this as free visibility. Easy win.

---

## Improvement Batch

### Quick Wins (auto-executable)

**QW-1: Fix stale paths in power-user-sweep scheduled task**
- **Category:** Scheduled task maintenance
- **Impact:** Medium — prevents future sweep failures when session IDs rotate
- **Effort:** Quick win
- **Action:** Update `findasale-power-user-sweep` prompt to use dynamic path resolution
- **Route to:** Can be done directly via `update_scheduled_task`
- **Auto-executable:** Yes

### Proposals Needing Patrick's Input

**P-1: Connect Google Calendar + Gmail MCP connectors**
- **Category:** Ecosystem feature
- **Impact:** Medium — enables automated beta scheduling coordination and support email triage
- **Effort:** Session task (~30 min setup per connector)
- **Route to:** Patrick (connector auth requires manual OAuth)
- **Why now:** 12 new connectors dropped in Feb 2026 including these. Beta coordination is about to get busy.

**P-2: Add GSC MCP to establish SEO baseline**
- **Category:** Ecosystem feature (from R&D recommendation)
- **Impact:** Medium — free data on organic search before beta traffic arrives
- **Effort:** Quick win (20 min)
- **Route to:** Patrick (requires Google account auth)
- **Why now:** R&D recommended this on 3/7. Domain is 3 months old — baseline data is most valuable collected early.

**P-3: Commission local partnership outreach templates**
- **Category:** Autonomous work / marketing
- **Impact:** High — growth channels doc identifies these as highest-ROI non-product channels
- **Effort:** Session task (findasale-marketing)
- **Route to:** findasale-marketing
- **Why now:** Beta organizer recruitment is next. Templates for probate attorneys, senior living, and moving company outreach would accelerate recruitment.

### Research Needed

**R-1: Worktree isolation for scheduled tasks**
- Should health-scout, ux-spotcheck, and competitor-monitor run in isolated worktrees?
- Benefit: prevents scheduled runs from interfering with active work
- Need to verify: does Cowork scheduled tasks support the worktree toggle?

### Parking Lot

- **Live Scarcity Counter** — Ranked #1 in feature brainstorm by impact/effort. Not on roadmap yet. Revisit after Sprint 5 ships.
- **Weekly-industry-intel cleanup** — Disabled task. Could be fully deleted. Low priority.
- **Claude Marketplace** — Enterprise-only. Not relevant until FindA.Sale scales.

---

## Auto-Executed Quick Wins

### QW-1: Updating power-user-sweep scheduled task paths
Updating the prompt to use dynamic path resolution instead of hardcoded session paths. See update below.
