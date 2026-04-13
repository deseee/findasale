# Power User Improvement Sweep — 2026-03-23

**Conducted:** 2026-03-23 (automated Monday sweep)
**Review period:** Sessions 238–244
**Auditor:** cowork-power-user (scheduled task: findasale-power-user-sweep)

---

## Ecosystem Research

### New Cowork Features (Feb–March 2026)

**Dispatch** — Remote control of Cowork sessions from phone via QR code pairing. Creates a persistent conversation between the Claude mobile app and your desktop. Relevant for Patrick: overnight scheduled tasks (health-scout at 11pm, power-user at 3am) could be monitored/acknowledged from phone without opening a full session.

**Projects Feature** — Persistent context across sessions with local folder connection. Relevant: currently each session starts by re-reading STATE.md + session-log. Projects could hold persistent pointers to these files. Worth evaluating as a complement to (or eventual replacement for) the manual STATE.md warmup flow.

**Claude Sonnet 4.6 now default** — Already running this in Cowork sessions. No action needed.

**Microsoft 365 MCP Connector** — Single connector for Word, Excel, PowerPoint, OneDrive, SharePoint. Not applicable to FindA.Sale's stack.

### New MCP Connectors (Feb 2026 batch of 12)

| Connector | Relevance |
|-----------|-----------|
| Similarweb | ⭐ HIGH — real traffic/SEO data. Would upgrade findasale-competitor quality significantly (currently web-search-only). |
| Google Drive | LOW — Patrick uses local files, not Drive |
| Gmail | LOW — email handled by MailerLite/Resend |
| Google Calendar | LOW — no scheduling use case |
| DocuSign | LOW — no e-signature need yet |
| Apollo, Clay, Outreach | LOW — B2B sales automation, not applicable |
| LegalZoom | LOW — one-off need, can use ad hoc |
| FactSet, MSCI | LOW — financial data, not applicable |
| WordPress | LOW — not on WP stack |
| Harvey | LOW — AI legal, not at that scale yet |

**Top recommendation: Similarweb MCP** — competitor intel quality would jump from "search-based estimates" to verified traffic data on EstateSales.NET, EstateSales.org, GarageSaleFinder. Low setup effort. See Proposals section.

### Claude Agent SDK Updates (2026)

- Rebranded from Claude Code SDK → Claude Agent SDK. Broader task scope beyond coding.
- SDK MCP servers can now run in-process (Python), eliminating separate process overhead.
- MCP connector on Anthropic API now handles connection management automatically (no client code required).
- Claude Code Channels (Slack/Discord webhook messaging to running agents) — not applicable to Cowork workflow.

**No immediate changes needed** from SDK updates. Our existing skill/agent architecture already matches the recommended pattern.

---

## Skill Staleness Audit

### 🚨 CRITICAL BUG: findasale-dev — Wrong Payment Fees

**File:** `/sessions/*/mnt/.skills/skills/findasale-dev/SKILL.md` line 50
**Current text:** `"Payments: Stripe Connect Express (5% regular, 7% auction platform fee)"`
**Correct value:** 10% flat platform fee (locked at session 106, confirmed in STATE.md pricing model)

**Risk:** If Patrick dispatches findasale-dev to implement any billing/payment feature, the agent will hardcode the wrong fee (5%/7% instead of 10%). Could ship incorrect billing logic to production.

**Severity:** P1 — incorrect business logic will be implemented if fee-related code is written.

**Fix:** Update line 50 to: `"Payments: Stripe Connect Express (10% flat platform fee on all sale types)"`

---

### ⚠️ findasale-dev — Stale CORE.md Reference (Carry-Forward from S236)

**File:** findasale-dev SKILL.md line 37
**Current text:** `"Read $PROJECT_ROOT/claude_docs/CORE.md for behavior rules"`
**Issue:** CORE.md was retired S227 — rules merged into root CLAUDE.md.
**Risk:** Agent tries to read a file that no longer exists. Minor confusion, non-blocking.
**Fix:** Update to `"Behavior rules: see root CLAUDE.md (CORE.md retired S227)"`

*Note: This was flagged as Issue #2 in S236 power-user audit. Confirm whether findasale-records implemented the fix — if not, still outstanding.*

---

### All Other Skills: Healthy

| Skill | Version | Status | Notes |
|-------|---------|--------|-------|
| findasale-qa | v2 (rewritten S242) | ✅ CURRENT | Chrome-first methodology, P0–P3 system |
| findasale-records | v3 (S227 merge) | ✅ CURRENT | Scope load high but performing |
| findasale-dev | v2 (2026-03-18) | ⚠️ SEE ABOVE | Fee bug + CORE.md ref |
| findasale-architect | — | ✅ CURRENT | No stale refs detected |
| findasale-marketing | — | ✅ CURRENT | Secondary sales framing correct (S235 update) |
| findasale-innovation | — | ✅ CURRENT | Secondary sales framing correct |
| cowork-power-user | — | ✅ CURRENT | This audit running correctly |
| findasale-health-scout | — | ✅ CURRENT | Ran this morning (2026-03-23) |
| findasale-competitor | — | ✅ CURRENT | Trigger words correct; scope fine |
| findasale-customer-champion | — | ✅ CURRENT | Minor: still says "estate sale" in some places. Non-blocking. |
| dev-environment | — | ✅ CURRENT | Docker retired correctly noted |
| conversation-defaults | — | ✅ CURRENT | Rules aligned with CLAUDE.md |
| context-maintenance | ⚠️ ARCHIVED | — | Still in skills dir. Cosmetic. |
| findasale-push-coordinator | ⚠️ ARCHIVED | — | Still in skills dir. Cosmetic. |

**2 archived skills (context-maintenance, findasale-push-coordinator) remain installed** but their descriptions correctly label them as archived. No functional impact — agents will not trigger them. Patrick can uninstall if desired.

---

## Scheduled Task Health

All 14 tasks reviewed. No misconfigurations or stale tasks found.

| Task | Last Run | Next Run | Status |
|------|----------|----------|--------|
| findasale-health-scout | 2026-03-23 | 2026-03-30 | ✅ |
| findasale-competitor-monitor | 2026-03-16 | Today | ✅ |
| findasale-ux-spotcheck | 2026-03-18 | 2026-03-25 | ✅ |
| findasale-monthly-digest | (1st/month) | 2026-04-01 | ✅ |
| findasale-session-warmup | Manual | — | ✅ |
| findasale-session-wrap | Manual | — | ✅ |
| findasale-workflow-retrospective | 2026-03-08 | 2026-04-08 | ✅ (monthly cadence) |
| context-freshness-check | 2026-03-21 | Today | ✅ |
| findasale-power-user-sweep | Today | 2026-03-30 | ✅ (this run) |
| daily-friction-audit | 2026-03-20 | Today | ✅ |
| weekly-pipeline-briefing | 2026-03-16 | Today | ✅ |
| weekly-full-site-audit | 2026-03-23 | 2026-03-30 | ✅ |
| weekly-brand-drift-detector | — | Today | ✅ |
| monday-digest | — | Today | ✅ |

**One scheduling note:** `monday-digest` and `context-freshness-check` both run Monday 8am (jitter keeps them ~8 minutes apart). No conflict — different tasks, different outputs.

**Missing task identified:** No beta-period feedback triage task exists. With real beta testers evaluating this week (per next-session-prompt S245 Priority 4), a Mon–Fri daily task to scan for and route incoming feedback would reduce the risk of Patrick missing a critical organizer report. See Proposals.

---

## Work Discovery

### Carry-Forward Items Requiring Attention (from STATE.md)

| Item | Status | Action |
|------|--------|--------|
| H3: MAILERLITE_API_KEY missing from .env | Pending Patrick | Patrick must add to Railway env vars |
| M3: DEFAULT_* region vars missing | Pending Patrick | Patrick must add to Railway env vars |
| Message reply end-to-end test | S245 Priority 2 | Verify organizer→shopper reply in Chrome MCP |
| L-002: Mobile viewport test | Long-running defer | Skip or use Chrome DevTools 375px |

### Roadmap Items That May Be Unblocked

**Feature #72 (Dual-Role JWT + Auth Middleware)** — Still listed as the top priority gate (unlocks notification channel, consent flow, tier lapse). Sessions S238–S244 were focused on QA/polish/dark mode fixes. This feature hasn't been touched. Worth scheduling for S245 or S246 if beta feedback doesn't dominate.

**Brand Voice Session** — Still unchecked on Patrick's checklist (roadmap line 82). The `marketing:brand-voice` plugin is installed. This is a 1-session task that would finalize documented voice, tone, and messaging pillars before deeper beta outreach.

**Print Kit (Printful POD)** — Research complete (INNOVATION_HANDOFF_2026-03-22.md). Advisory board deferred to "templates approach" (Q2 2026). Prerequisite noted: negotiate Printful discount this week. No session scheduled. Could be unblocked now if Patrick makes the Printful contact.

### Research-to-Roadmap Gaps

From INNOVATION_HANDOFF_2026-03-22.md Priority 2 (Print Kit): "Prerequisite: Negotiate Printful partnership discount (this week)." This was written 2026-03-22 — one day ago. If Patrick hasn't contacted Printful yet, the window is still open.

---

## Improvement Batch

---

### Quick Wins (auto-executable — no Patrick input needed)

**QW-1: Fix findasale-dev skill — Wrong payment fees**
- **Found by:** Skill staleness audit
- **Category:** Skill fix
- **Impact:** HIGH — prevents wrong billing logic being shipped to production
- **Effort:** Quick win — 1 line change
- **Proposal:** Update findasale-dev SKILL.md line 50: `5% regular, 7% auction` → `10% flat platform fee on all sale types`
- **Route to:** findasale-records (Tier 1 skill change)
- **Auto-executable:** Yes — factual correction, no ambiguity

**QW-2: Fix findasale-dev skill — CORE.md stale reference**
- **Found by:** Skill staleness audit (carry-forward from S236)
- **Category:** Skill fix
- **Impact:** MEDIUM — prevents agent confusion on setup
- **Effort:** Quick win — 1 line change
- **Proposal:** Update reference from CORE.md to root CLAUDE.md
- **Route to:** findasale-records (Tier 1 skill change)
- **Auto-executable:** Yes — factual correction

---

### Proposals Needing Patrick's Input

**P-1: Add Similarweb MCP Connector**
- **Category:** Ecosystem connector
- **Impact:** MEDIUM — elevates findasale-competitor from search estimates to verified traffic/SEO data on EstateSales.NET and EstateSales.org
- **Effort:** Quick win — 15 min setup (connect via Cowork Connectors panel)
- **Proposal:** Install Similarweb MCP connector. Configure findasale-competitor skill to call it for traffic data on top 3 competitors. Would give real monthly visit counts, bounce rates, keyword rankings.
- **Route to:** Patrick (install connector), then findasale-records (update competitor skill to reference it)
- **Note:** No cost cited — verify pricing before enabling

**P-2: Evaluate Cowork Projects for session continuity**
- **Category:** Cowork configuration
- **Impact:** MEDIUM — could reduce session startup time and context drift
- **Effort:** Low (1 session to evaluate and configure)
- **Proposal:** Try linking the FindaSale project folder via Cowork Projects. Persistent context would mean STATE.md + session-log don't need to be manually re-read each session. If it works cleanly with our existing file-based context approach, adopt it.
- **Route to:** Patrick decides → cowork-power-user evaluates implementation

**P-3: Add beta-period feedback triage scheduled task**
- **Category:** New automation
- **Impact:** HIGH — ensures incoming beta organizer feedback is caught and routed within 24 hours
- **Effort:** Quick win — ~30 min to create task via findasale-records
- **Proposal:** Create `beta-feedback-triage` daily task (Mon–Fri, during beta period). Scans MailerLite unsubscribes, Stripe test transactions, and any flagged contact form entries. Routes critical findings to findasale-customer-champion. Auto-expires when beta ends.
- **Route to:** findasale-records (owns scheduled tasks)

**P-4: Cowork Dispatch for overnight task monitoring**
- **Category:** Cowork feature adoption
- **Impact:** LOW-MEDIUM — lets Patrick check in on health-scout, power-user results from phone
- **Effort:** 5 min setup (QR code pairing)
- **Proposal:** Enable Cowork Dispatch by scanning QR code from Claude mobile app. Patrick can then receive task completion summaries on his phone without opening a full laptop session.
- **Route to:** Patrick (self-serve, no agent work needed)

---

### Research Needed

**R-1: Verify CORE.md reference fix from S236 was actually applied to installed skill**
- S236 audit flagged this. Need to confirm whether findasale-records implemented the fix post-S236. The skill file still shows the stale reference — likely not applied yet.

**R-2: Printful partnership contact status**
- INNOVATION_HANDOFF_2026-03-22.md notes "negotiate Printful discount this week" as Print Kit prerequisite. Verify if Patrick has made contact. If not, this is a time-sensitive item.

---

### Parking Lot

| Item | Notes | Revisit |
|------|-------|---------|
| findasale-customer-champion secondary sales framing | "estate sale organizers" still in skill body. Not causing issues. | S250+ |
| Archived skill cleanup (context-maintenance, push-coordinator) | Still installed, correctly labeled archived. Patrick can uninstall when convenient. | Any time |
| Feature #72 Dual-Role JWT | Top priority on roadmap, untouched since S234. Gets bumped when beta QA doesn't dominate sessions. | S245/S246 |
| Interactive Room Planner 2D MVP | Research complete in INNOVATION_HANDOFF. Board hasn't reviewed. | Q2 2026 |

---

## Top 3 Summary for Patrick

1. **🚨 P1 Skill Bug: findasale-dev has wrong payment fees** — Auto-executing fix now (route to findasale-records). The skill says 5%/7% but your locked fee is 10% flat. Any billing code written by dev would use the wrong rate.

2. **⭐ New Connector: Similarweb** — Free-tier competitor traffic data via MCP (added Feb 2026). Would make weekly competitor reports significantly more accurate. 15 min to connect.

3. **📋 Beta Triage Task** — Real organizers evaluating this week. Recommend adding a daily beta-feedback-triage automated task to catch incoming signals before they fall through the cracks.

---

**Memo saved:** `claude_docs/improvement-memos/power-user-sweep-2026-03-23.md`
**Next sweep:** 2026-03-30 (Monday 3am)
