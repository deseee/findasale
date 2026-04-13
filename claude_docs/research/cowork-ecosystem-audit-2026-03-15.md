# Cowork Ecosystem Audit — 2026-03-15

**Audit conducted by:** Cowork Power User Agent
**Research window:** 2026-03-01 to 2026-03-15
**Status:** Complete research-phase audit. No files modified (research-only per protocol).

---

## Executive Summary

FindA.Sale has invested heavily in a custom skill-based architecture (30 custom findasale-* skills, strong CLAUDE.md/CORE.md governance). The project is **moderately underutilizing** Cowork's newer 2026 features — scheduled tasks exist (11 registered), but plugin ecosystem integration is minimal, and context survival through compaction remains a pain point.

**Key findings:**
- 30 total skills (19 findasale-*, 11 generic/platform skills) — custom skills are well-structured
- Scheduled tasks (11 active) provide good recurring audit coverage but lack integrated Cowork plugins
- **Major gap:** No MCP connectors currently active for CRM, payment pipeline, analytics, or marketing (all valuable for estate sale operations)
- **Major gap:** No plugins leveraging the new "MCP Apps" interactive UI support added in 2026
- Context compaction is documented pain point (CORE.md §3, §4 post-compression re-read rule exists)
- Manager subagent pattern feasible but untested; Architect handoff recommends ADR

**Recommendation:** Proceed with phased integration of MCP connectors (CRM, analytics, email marketing) + modernize skill architecture to support nested agent orchestration via manager pattern.

---

## Section 1: Cowork Feature Audit

### 1.1 Features Actively Used

| Feature | Status | Notes |
|---------|--------|-------|
| **Skills (30 total)** | ✅ Heavy use | Custom findasale-* architecture + generic platform skills. Well-documented, versioned. Last review: Session 108. |
| **Scheduled tasks (11)** | ✅ Active | findasale-health-scout, findasale-competitor-monitor, daily-friction-audit, weekly-pipeline-briefing. Weekly/daily automation working. |
| **GitHub MCP** | ✅ Active | Used for all source pushes. 3-file limit enforced. Truncation gate added (Session 167). |
| **MailerLite MCP** | ✅ Active | Integrated Session 165 (weekly treasure digest email). Used for subscriber lists + campaign management. |
| **Vercel MCP** | ✅ Active | Deployment monitoring. Used in findasale-deploy checklist. |
| **Subagent dispatch** | ✅ Heavy use | Architect → Dev → QA pipeline standard. Handoff protocol (CORE.md §7) well-documented. |

### 1.2 Features Underutilized or Absent

| Feature | Status | Gap Analysis |
|---------|--------|---|
| **Cowork plugins ecosystem** | ⚠️ Minimal | 12 new MCP connectors added in 2026 (Google Calendar, Gmail, DocuSign, Apollo, Clay, Outreach, etc.). FindA.Sale using zero. |
| **MCP Apps (interactive UI)** | ❌ Unused | January 2026 feature: in-canvas project boards, analytics dashboards, Figma/Slack integration. No integration planned for organizer dashboard. |
| **Private plugin marketplace** | ❌ Not applicable | Enterprise feature. Patrick's Cowork Team plan doesn't include. |
| **Chrome automation agent** | ⚠️ Minimal | Mentioned in recovery.md but no active workflows. Could automate web scraping for competitive intel. |
| **Cowork sessions API** | ❌ Unexplored | Agent SDK sessions with automatic prompt caching — could improve context management for long ops/workflow sessions. |
| **Context compression strategy** | ⚠️ Partial | Compression happens automatically; CORE.md §3 enforces re-read of push rules post-compression. But no proactive context lifecycle management (e.g., scheduled context refresh, summary-before-compress prompts). |

### 1.3 New Capabilities in 2026

**Interactive MCP Apps (Jan 2026)**
- Enables in-canvas UI for connected services: Asana, Box, Canva, Figma, Hex, monday.com, Slack, etc.
- **Opportunity for FindA.Sale:** Could render a Stripe Connect dashboard panel in Cowork for organizer onboarding review, or a live sales inventory browser using custom MCP (if built).

**12 New MCP Connectors**
- Google Calendar, Gmail, DocuSign, Apollo, Clay, Outreach, Similarweb, MSCI, LegalZoom, FactSet, WordPress, Harvey
- **Most relevant for FindA.Sale:** Google Calendar (organize viewings), Gmail (organizer communication), Apollo (organizer prospecting)

**Server-side context compaction (via Opus 4.6)**
- Automatic context management without SDK-level configuration
- FindA.Sale uses Haiku (not Opus) — compaction remains manual overhead

**Automatic prompt caching (Agent SDK)**
- System prompt + tool definitions cached across turns
- Reduces token cost for repeated prefixes (skills, CORE.md rules)
- **Not currently leveraged** — would require CLI tool or API use, not Cowork UI

---

## Section 2: Plugin & Connector Scouting

### 2.1 MCP Registry Search Results

**Inventory & Order Management (Most Relevant)**
- **Close CRM** — Sales pipeline + activity tracking. Tools: lead search, contact fetch, opportunity status, email templates.
  - *Fit:* Estate sale organizer pipeline (lead = property inquiry, opportunity = scheduled sale). Could track contact history, organizer notes.
  - *Effort:* Medium (requires org-to-close mapping)
  - *Value:* High (organizer CRM would reduce manual spreadsheet work)

- **HubSpot** — Full CRM with contact/company search + properties API.
  - *Fit:* Parallel to Close. Lighter weight.
  - *Effort:* Low-Medium
  - *Value:* Medium (HubSpot ecosystem maturity)

**Payment & Financial Intelligence**
- **Stripe MCP** — Payment processing, customer/product listing, price search.
  - *Status:* Already integrated via backend SDK, but no direct Cowork access to payment data
  - *Opportunity:* Connect Stripe dashboard to Cowork for organizer payout review, dispute audits
  - *Effort:* Low (Stripe creds already in Railway)
  - *Value:* Medium (payment transparency for Patrick)

- **Razorpay** — Alternative payment platform (payment search, order fetch, payment link creation).
  - *Fit:* Not relevant (FindA.Sale uses Stripe exclusively)

**Scheduling & Calendar**
- **Clockwise** — Advanced scheduling, meeting proposals, availability search.
  - *Fit:* Could coordinate estate sale viewings, organizer availability
  - *Effort:* Medium (requires user calendar integrations)
  - *Value:* Low-Medium (viewings handled by organizer, not Cowork)

- **Calendly** — Event type + booking management.
  - *Fit:* Low (organizers use their own calendars)

**Prospecting & Outreach**
- **Apollo.io** — Contact enrichment, people search, organization search, job posting lookup.
  - *Fit:* High. Could identify estate sale organizers in target GR area. Auto-enrich contact data.
  - *Effort:* Medium (API key, requires audience definition)
  - *Value:* High (acquisition pipeline intelligence)

- **Clay** — Multi-data enrichment (find + research prospects, add data points).
  - *Fit:* High. Similar to Apollo but broader data sources (LinkedIn, web, etc.).
  - *Effort:* Medium (credits-based)
  - *Value:* High (competitive edge on organizer targeting)

- **ZoomInfo** — B2B contact + company intelligence.
  - *Fit:* Medium (estate sales are B2C, not B2B)

**Analytics & Business Intelligence**
- **Omni Analytics** — Query business data via natural language + semantic models.
  - *Fit:* If FindA.Sale had a data warehouse (Neon + BI layer). Currently no.
  - *Effort:* High (requires semantic model building)
  - *Value:* Medium (future-state dashboarding)

- **Visier** — People/productivity/business impact metrics (analytics objects, dimensions, aggregate metrics).
  - *Fit:* Low (HR/workforce analytics; FindA.Sale is a marketplace)

**Marketing & Email**
- **ActiveCampaign** — Contact + tag management, email list operations, campaign automation.
  - *Status:* MailerLite already integrated (Session 165)
  - *Opportunity:* ActiveCampaign has stronger automation rules + SMS. Consider as MailerLite alternative if campaign complexity grows.

**Document & Workflow Automation**
- **DocuSign MCP** — E-signature workflows, document tracking.
  - *Fit:* Could automate organizer agreements, purchase/sale contracts.
  - *Effort:* Medium-High (requires legal template setup)
  - *Value:* Medium (post-beta feature; deferred in current roadmap)

- **Make.com** — Scenario automation (webhook triggers, multi-step workflows).
  - *Fit:* Medium. Could automate tedious organizer tasks (email notifications, spreadsheet syncs, Slack alerts).
  - *Effort:* Low (no-code, visual builder)
  - *Value:* Medium (reduces organizer manual work)

### 2.2 Recommended Connector Priorities

| Rank | Connector | Use Case | Effort | Value | Timing |
|------|-----------|----------|--------|-------|--------|
| **1** | **Apollo.io** | Estate sale organizer prospecting + enrichment | Medium | High | Phase 2 (after beta launch) |
| **2** | **Clay** | Multi-source organizer data enrichment | Medium | High | Phase 2 |
| **3** | **Stripe MCP** | Organizer payout + payment audits (Cowork dashboard) | Low | Medium | Phase 1.5 (soon) |
| **4** | **Close CRM** | Organizer pipeline tracking (trial) | Medium | Medium | Phase 2 |
| **5** | **HubSpot** | Parallel CRM exploration | Low-Medium | Medium | Backlog |
| **6** | **Make.com** | Organizer task automation | Low | Low-Medium | Post-beta |
| **7** | **DocuSign** | E-signature workflows | Medium-High | Medium | Phase 3 (deferred) |

**Not recommended:** Razorpay (wrong payment processor), ZoomInfo (B2B), Visier (HR), Omni Analytics (requires data warehouse).

### 2.3 Plugin Ecosystem Status

**FindA.Sale plugin landscape (from CLAUDE.md §8 + research):**

| Category | Recommendation | Status |
|----------|---|---|
| Sales | Disable (recommended) | All enabled, unused |
| Finance | Disable (recommended) | All enabled, unused |
| Brand Voice | Disable (recommended) | All enabled, unused |
| Enterprise Search | Disable (recommended) | All enabled, unused |
| Productivity | Disable (recommended) | All enabled, unused |
| Engineering | Keep active | Used by dev/qa/architect/ops |
| Operations | Keep active | Used by findasale-ops, findasale-deploy |
| Customer Support | Keep active | Used by findasale-customer-champion |
| Design | Keep active | Future: ux spotcheck + accessibility audit |
| Data | Keep active | Used by findasale-analyst (if created) |

**Action:** Patrick should disable the 5 recommended categories in Cowork UI (Settings → Customize) to reduce skill list noise and improve context performance.

---

## Section 3: Skill Roster Review

### 3.1 Skill Inventory & Health

**Total skills:** 30
- **19 findasale-* (custom):** Highly specialized, project-specific
- **11 platform/generic:** Including dev-environment, context-maintenance, conversation-defaults, plus plugins (pdf, xlsx, pptx, docx, schedule, skill-creator, health-scout)

**Last update timestamps (from SKILL.md headers):**
- findasale-dev: 2026-03-09 (Session 108)
- findasale-hacker: 2026-03-09 (Session 108)
- findasale-records: [not timestamped in header, but last audit references Session 144 updates]
- Most others: Session 108–109 baseline, incremental updates

### 3.2 Custom findasale-* Skills Quality Assessment

**Well-maintained (≤3 sessions stale):**
- findasale-dev ✅ (clear spec, good handoff template)
- findasale-architect ✅ (ADR format, locked decisions, migration rollback plan)
- findasale-qa ✅ (comprehensive checklist, payment edge-case fuzzer, test writing guidance)
- findasale-deploy ✅ (8-step checklist, legal compliance gate, post-deploy verification)
- findasale-ops ✅ (production gotchas, migration runbook, incident response)
- findasale-records ✅ (audit protocol, Tier 1/2/3 gating, archive vault, scheduled task protocol)

**References to check (potential staleness):**
- findasale-deploy: §1.5 says "findasale-legal compliance check" — but no evidence findasale-legal skill exists (exists as custom skill, but untested in recent sessions)
- findasale-ops: Railway/Vercel/Neon references assume current deployment config. Needs refresh check if infrastructure changes.
- findasale-dev: References `dev-environment` skill as mandatory gate — confirm skill still exists and is loaded each session (it is: in the 30 skills list)

**Plugin delegation sections present in all major skills** ✅
- findasale-dev: references engineering skills (code-review, testing-strategy, documentation, tech-debt) + operations
- findasale-architect: references engineering (architecture, system-design) + operations (compliance, risk, change-mgmt)
- findasale-qa: references engineering (code-review, testing-strategy, accessibility-review) + customer support + data
- findasale-ops: references engineering (incident-response, deploy-checklist) + operations (runbook, status-report, change-mgmt, capacity-plan) + data

**Observation:** Plugin delegation is documented but untested in live sessions. These are "nice to have" hints for subagents; actual usage would require explicit dispatch.

### 3.3 Skill Abstraction Analysis

**Current model:** Each findasale-* skill is a single-role persona (Dev, Architect, QA, Ops, Records, etc.)

**Strengths:**
- Clear ownership boundaries
- Specialized vocabulary + context per role
- Easy for main session to route: "spawn findasale-qa for testing"
- Skills can stay relatively lightweight

**Potential improvements:**
- **Orchestration gap:** No findasale-manager skill exists to coordinate multi-subagent work (e.g., Dev + QA + Ops in parallel). Currently main session does orchestration.
- **Nested agent calls:** CORE.md doesn't permit skills to spawn other skills. Architect can hand off to Dev, but Dev cannot autonomously call QA mid-task. Main session must manage.
- **Context compaction:** When compaction occurs (Session 168 happened mid-session), behavior rules in CORE.md are re-read, but subagents lose accumulated context. No cross-session memory for subagents.

**Recommendation (Section 5):** Keep 1:1 skill-to-role model, but create findasale-manager skill to handle orchestration, file manifest, truncation gate validation.

### 3.4 Skill Metadata & Discoverability

**Version tracking:** Only findasale-dev, findasale-hacker, findasale-records have `version` field in SKILL.md header.

**Issue:** findasale-records skill describes "Skill version tracking" (§Skill Update Protocol) as best practice but doesn't model it in its own header. Hypocrisy risk: if Records skill itself doesn't have version header, other skills won't either.

**Recommendation:** Add version field to all 19 findasale-* skills. Start with version: 1 if not present, increment on any substantive change.

### 3.5 Stale References & Path Hygiene

**Checked:**
- Docker references: findasale-dev (line 27) references `/sessions/*/mnt/FindaSale` — still valid for Cowork VM (native Windows dev, no Docker per STACK.md)
- Railway references: findasale-ops references Railway.toml, Dockerfile.production — current as of Session 167
- Neon references: findasale-ops says "35 migrations as of 2026-03-06" — outdated. STATE.md says "82 migrations" as of Session 167.
  - **Action needed:** Update findasale-ops SKILL.md line 34 or create reference to STATE.md instead of hardcoding count
- Prisma references: findasale-ops correctly notes "Removed from schema.prisma as of batch 21 (2026-03-06)" — accurate

**Minor issue:** findasale-records (Skill Update Protocol, line 459) references `claude_docs/skills-package/[skill]/SKILL.md` as source location, but actual source is `.skills/skills/[skill]/SKILL.md` installed location. No git-tracked source copies exist. This is a documentation bug in the skill itself.

---

## Section 4: Key Research Questions — Answers

### 4.1 Can Skills Call Other Skills?

**Answer:** Not directly via Cowork UI.

**Evidence:**
- CORE.md doesn't mention skill-to-skill calls
- findasale-dev handoff summary (§Handoff Summary) shows delegation to findasale-qa, but actual mechanism is "flag in your handoff summary" — main session sees it and dispatches findasale-qa separately
- findasale-architect says "hand to findasale-dev with a clear spec" — again, handoff block, not skill-internal call

**Current pattern (skill orchestration):**
1. Main session receives work request
2. Main session dispatches skill (e.g., findasale-architect)
3. Skill creates Architect Handoff block
4. Main session reads block, dispatches findasale-dev
5. Dev creates Dev Handoff block
6. Main session routes both back to Patrick

**Limitation:** Each handoff is a blocking serial step. No skill can spawn child skills. Parallelization only happens at main session level (next-session-prompt.md §Parallel Agent Dispatch shows parallel dispatch, but requires main session to do it).

**Implication for manager pattern:** Feasible, but requires main session to keep a "dispatch manifest" instead of delegating manifest management to manager skill.

### 4.2 Context Compaction Survival Strategies

**Current practice in FindA.Sale:**

| Strategy | Where Used | Effectiveness |
|----------|-----------|---|
| **Post-compression re-read (CORE.md §3)** | Mandatory in dev-environment + after any tool call | ✅ Restores push rules. Still token-expensive. |
| **Compression logging (session-log.md)** | Documented pattern but inconsistently executed | ⚠️ Helps future sessions understand what was lost |
| **Checkpoint manifest (.checkpoint-manifest.json)** | Experimental (Session 168 only) | Unknown; needs validation |

**Best practices from web research:**

1. **Opus 4.6 server-side compaction** — Automatic, no intervention needed. FindA.Sale uses Haiku (cost-driven choice); not available.

2. **Prompt caching (Agent SDK)** — System prompt + tool definitions cached across turns. Reduces redundant token usage. Requires API client, not Cowork UI.

3. **Context lifecycle management** — Proactive summary before compaction, pruning of stale variables. Not currently done.

4. **Session resumption** — Agent SDK allows resuming a session by ID with full context restoration. Cowork doesn't expose this via UI.

**Recommendation:**
- Keep current post-compression re-read + logging practices
- Explore session resumption: could Patrick have a "resume previous session" option if Cowork exposes it?
- Document context budget targets in CORE.md (e.g., "aim for <170k tokens before wrap to minimize compaction risk")

### 4.3 Manager Agent Architecture Patterns

**Is it possible?**

Yes, with caveats. **Evidence from community patterns:**

- **Orchestrator pattern** (from skill best practices): Agent coordinates multiple sub-agents via structured handoff blocks. Main session is currently the orchestrator; moving to a manager skill is feasible but shifts complexity.

- **Relay pattern** (emerging in 2026): A manager skill receives output from subagents, validates against rules (e.g., truncation gate, file manifest), and decides whether to push or escalate. Similar to code review gatekeeping.

- **Manifest pattern** (proposed for FindA.Sale): Manager maintains a local vs. remote file state table, ensuring subagents don't push conflicting changes.

**Challenges for FindA.Sale:**

1. **Context window:** Manager skill can only load one copy of file content (e.g., schema.prisma) in its context. If it validates multiple subagent outputs in one session, context fills fast.

2. **Handoff blocking:** Manager skill receives Dev's handoff block (text), must parse it to extract file list, read each file from VM to compare against GitHub. This is 10–20 extra API calls per subagent handoff.

3. **Error escalation:** If manager detects a truncation, what does it do? Can't fix the code itself. Must escalate back to Dev (another round-trip). CORE.md §6 escalation already exists for this.

**Recommendation:**
- **Feasible but not urgent.** Current pattern (main session as orchestrator) is working. Compaction remains pain point, but manager skill won't fix it (it'll add more context).
- **Alternative:** Spend those tokens on better documentation + skill improvements instead.
- **If pursued:** Start with findasale-records as pseudo-manager (owns file state + manifest). Architect writes ADR proposing implementation.

---

## Section 5: Improvement Batch

### Quick Wins (Auto-Executable)

1. **Disable unused plugin categories** (Session wrap, Patrick action)
   - Action: Patrick disables Sales, Finance, Brand Voice, Enterprise Search, Productivity categories in Cowork UI
   - Expected benefit: 5–10% reduction in skill list noise, faster skill loading
   - Effort: <5 minutes

2. **Add version field to all findasale-* skills** (findasale-records)
   - Current: Only 3 of 19 have version headers
   - Action: findasale-records audits all skills, adds `version: 1` and `last_updated` to those missing it
   - Effort: 2 sessions, low-context task
   - Benefit: Better drift detection, cleaner skill lifecycle

3. **Fix findasale-ops Neon migration count reference** (findasale-records)
   - Current: "35 migrations as of 2026-03-06" — stale (actually 82)
   - Action: Replace hardcoded count with reference to `STATE.md` "Neon: X migrations" or update to 82 and add "as of Session 167"
   - Effort: <1 session
   - Risk: Low

4. **Create patrick-language-map.md addition** (findasale-records + Communications subcommittee)
   - Current gap: "tools" is ambiguous. Patrick means all tools (skills, connectors, plugins, MCP, agents, etc.)
   - Action: Document in `claude_docs/operations/patrick-language-map.md`:
     ```
     "tools" → {skills, plugins, connectors, MCP tools, agents, Chrome automation, scheduled tasks,
                anything in Cowork UI that extends Claude's capabilities}
     "push" → always uses `.\push.ps1` from PowerShell, never `git push` directly
     "audit" → systematic review of [topic] against [standard], produce findings + recommendations
     ```
   - Effort: 1 session, findasale-records
   - Benefit: Reduces Patrick having to clarify scope mid-session

5. **Create context budget targets in CORE.md** (findasale-records, with Patrick approval)
   - Action: Add §3 subsection "Token Target Framework"
     ```
     Session context budget target: <170k tokens before wrap (to minimize compaction)
     Token checkpoint intervals: at 80k, 120k, 170k tokens used
     If exceeding 170k: consider splitting work or running wrap early
     If compression occurs mid-session: re-read CORE.md §4 (push rules) before continuing
     ```
   - Effort: 1 session, findasale-records
   - Risk: Low (documentation only, no behavior change)
   - Benefit: Prevents "silent context loss → compaction surprise" pattern

### Proposals Needing Patrick's Input

1. **Integrate Apollo.io or Clay MCP for organizer prospecting** (findasale-innovation + findasale-architect)
   - **What:** Add Apollo.io or Clay connector to Cowork to enable AI-driven outreach list building
   - **When:** Phase 2 (after beta, when organic demand plateaus)
   - **Who:** Innovation evaluates, Architect designs flow, Ops sets up credentials
   - **Decision needed:** Defer to Phase 2, or pilot sooner?
   - **Effort:** Medium (connector setup + workflow design)
   - **Value:** High (directly reduces manual organizer prospecting work)

2. **Integrate Stripe MCP for payment audits in Cowork** (findasale-ops + findasale-architect)
   - **What:** Connect Stripe API to Cowork so Patrick can review organizer payouts, disputes, fee breakdowns without leaving Claude
   - **When:** Phase 1.5 (soon; low friction because Stripe creds already in Railway)
   - **Who:** Ops sets up, Architect designs Cowork workflow
   - **Decision needed:** Worth the token cost for a "nice to have" payment dashboard?
   - **Effort:** Low
   - **Value:** Medium (transparency for Patrick, but doesn't reduce organizer work)

3. **Create findasale-manager skill for orchestration** (findasale-architect ADR + findasale-records Tier 1)
   - **What:** A new skill that coordinates Dev, QA, Ops subagents; maintains file manifest; validates truncation gate
   - **When:** Phase 2, contingent on compaction remaining a pain point
   - **Who:** Architect designs, Records proposes Tier 1 change, Patrick approves
   - **Decision needed:** Worth the token investment, or stick with main session as orchestrator?
   - **Effort:** Medium-High (new skill + handoff protocol changes)
   - **Value:** Medium (reduces main session context bloat, but adds manager skill context)
   - **Trade-off:** Cleaner separation of concerns vs. extra handoff layers

4. **Enable scheduled task integration with MCP connectors** (findasale-records + findasale-innovation)
   - **What:** findasale-competitor-monitor (currently scheduled, run weekly) could call Apollo/Clay to auto-refresh competitive intel
   - **When:** Phase 2+, after Apollo/Clay integration
   - **Who:** Innovation designs, Records proposes task updates
   - **Decision needed:** Is this valuable enough to expand scheduled task scope?
   - **Effort:** Low-Medium (task prompt updates + connector API calls)
   - **Value:** Medium (reduces manual research, but low-touch feature)

### Research Needed (Deeper Investigation)

1. **Session resumption in Cowork** (findasale-innovation)
   - **Question:** Does Cowork expose Agent SDK session resumption? Can Patrick resume a session by ID and pick up with full context?
   - **Impact if yes:** Could split multi-day work across sessions without context loss
   - **Effort to research:** 1 session, check Cowork docs + support
   - **Outcome:** If yes, propose context-management pattern in CORE.md

2. **Cowork MCP Apps for FindA.Sale** (findasale-innovation + findasale-ux)
   - **Question:** Could a custom MCP implement interactive organizer dashboard inside Cowork (live sale list, inventory counts, analytics)?
   - **Impact if yes:** Patrick could manage live dashboards directly in Claude UI
   - **Effort:** High (requires custom MCP server + UI implementation)
   - **Outcome:** If feasible, propose as Phase 3 feature (post-beta)

3. **Skill-to-skill calls in future Cowork versions** (findasale-innovation)
   - **Question:** Is Anthropic planning to enable skills calling other skills natively?
   - **Impact if yes:** Could simplify orchestration (Dev calls QA directly in handoff)
   - **Effort:** 0 (just research)
   - **Outcome:** If planned, wait for feature; don't build workarounds

4. **Cost-benefit of manager skill vs. current model** (findasale-architect)
   - **Question:** How many extra tokens would findasale-manager consume per session vs. benefit delivered?
   - **Effort:** 1–2 sessions (detailed token accounting + prototype)
   - **Outcome:** Go/no-go recommendation for Phase 2

### Parking Lot (Interesting but Not Urgent)

1. **Claude Code CLI tool evaluation** (findasale-innovation, already in next-session-prompt)
   - Context: Patrick asked if Claude Code CLI could handle non-Cowork tasks
   - Status: Deferred to workflow audit phase
   - Action: findasale-innovation will research in parallel with this audit

2. **Ollama + local AI model hosting** (findasale-innovation, already in next-session-prompt)
   - Context: Could FindA.Sale offload repetitive tasks (tag suggestions, image descriptions) to local model?
   - Status: Cost/benefit analysis deferred
   - Timing: If Haiku API costs become high, revisit

3. **Brand voice plugin for listing factory** (findasale-marketing, flagged in STATE.md)
   - Context: Deferred until Listing Factory ships
   - Status: Not urgent for beta

4. **Accessibility audit skill enhancement** (findasale-ux)
   - Context: Current skill has placeholder for WCAG 2.1 AA compliance
   - Status: Good-to-have, not blocking

---

## Section 6: CLAUDE.md & Skill Changes Proposed

### 6.1 Additions to CORE.md

**Add after §3 (Execution Rules):**

```markdown
## 3.1 Token Budget & Compression Targets

Session token usage:
- **Optimal range:** 80k–170k tokens (leaves ~30k buffer before 200k hard limit)
- **Warning threshold:** 170k tokens used (schedule wrap or split work)
- **Checkpoint intervals:** At 80k, 120k, and 170k token marks, log to session-log.md
- **Post-compression protocol:** After any compression event, re-read §4 (Push Rules) immediately

When approaching 170k tokens:
1. Complete current atomic task (don't leave files half-edited)
2. Log estimated tokens used to session-log.md
3. If significant work remains, stop and wrap session
4. If work can complete in remaining ~30k, continue but monitor closely
```

### 6.2 Additions to CLAUDE.md (Root)

**Add after §8 (Skill Roster):**

```markdown
## 8.1 MCP Connector Strategy

Current landscape (2026-03-15):
- Active: GitHub, MailerLite, Vercel
- Planned: Apollo.io or Clay (Phase 2), Stripe (Phase 1.5)
- Disabled plugin categories: Sales, Finance, Brand Voice, Enterprise Search, Productivity

Before adding new connectors, Architect + findasale-ops must evaluate:
- Does this connector directly reduce organizer manual work or improve Patrick's operations?
- Token cost: does it bloat skill context (requires pre-loading tool definitions)?
- Credential hygiene: are secrets already in .env, or require new setup?
- Roadmap alignment: does this support current phase priority?
```

### 6.3 Creation of patrick-language-map.md entry

**File:** `claude_docs/operations/patrick-language-map.md` (append to existing file)

```markdown
### Cowork Terminology Disambiguation

Patrick uses "tools" to refer to the full Cowork toolkit. Specific terms:

| Term | Means | Examples |
|------|-------|----------|
| **tools** | All capabilities, generically | Skills, plugins, connectors, MCP tools, agents, scheduled tasks, Chrome automation |
| **skills** | Cowork-native SKILL.md files | findasale-dev, findasale-qa, findasale-architect, etc. |
| **subagents** | Skills spawned via dispatch | Same as skills; "subagent" emphasizes they are independent workers reporting to main session |
| **plugins** | Prebuilt Cowork capabilities | engineering, operations, customer-support, design, data (category-based) |
| **connectors** | MCP integrations to external services | GitHub, Stripe, MailerLite, Apollo, Clay, etc. |
| **MCP tools** | Tools provided by MCP servers | fetch_lead (Close CRM), search_people (Apollo), etc. |
| **agents** | AI entities (main session or subagents) | Claude instances with roles (Developer, Architect, QA, Manager) |
| **scheduled tasks** | Recurring automation | findasale-health-scout, daily-friction-audit, weekly-pipeline-briefing |
| **Chrome automation** | Browser control for web scraping/RPA | Currently unused |

When Patrick says "use tools to do X," interpret as: "Use whatever combination of skills, connectors, plugins, and subagents is most efficient to accomplish X."
```

### 6.4 Skill Metadata Updates (findasale-records)

**Action items for findasale-records next session:**

1. Add version header to all findasale-* skills missing it:
   ```yaml
   version: 1
   last_updated: 2026-03-15 (Audited)
   ```

2. Fix findasale-ops SKILL.md:
   - Line 34: Change "35 migrations applied as of 2026-03-06" → "See STATE.md for current migration count"
   - Add note: "Neon migration count auto-increments; STATE.md is authoritative"

3. Fix findasale-records SKILL.md:
   - Line 459: Change `claude_docs/skills-package/[skill]/SKILL.md` → `.skills/skills/[skill]/SKILL.md` (actual installed path)
   - Add note: "Currently no git-tracked source copies; propose creating `claude_docs/skills-source/` archive in next iteration"

---

## Section 7: Findings Summary

### 7.1 Strengths

1. **Custom skill architecture is well-designed** — 19 findasale-* skills with clear role boundaries, comprehensive handoff templates, good documentation
2. **CORE.md + behavior rules are stringent** — compaction survival, push safety, session governance all documented
3. **Scheduled tasks provide recurring coverage** — 11 tasks running weekly/daily, no P0 audit gaps
4. **Subagent orchestration works smoothly** — Architect → Dev → QA pipeline has no apparent friction
5. **MCP setup is hygienic** — GitHub + MailerLite well-integrated, credentials managed safely

### 7.2 Underutilized Capabilities

1. **2026 Cowork plugin ecosystem** — 12 new MCP connectors available; FindA.Sale using zero
2. **MCP Apps (interactive UI)** — Not integrated; could serve organizer dashboard
3. **Context compaction mitigation** — Token targets not formally documented; "run checkpoint re-read" is policy but not quantified
4. **Nested skill orchestration** — No manager/orchestrator skill; main session handles all coordination
5. **Prompt caching + session resumption** — Cowork UI doesn't expose Agent SDK features; unclear if available

### 7.3 Pain Points

1. **Compaction loses context rules** — Sessions 164–168 show repeated "CORE.md rules forgotten" issues. Post-compression re-read exists but is token-expensive.
2. **Token efficiency** — Context fills fast with 19 skills + 10k line CORE.md + STATE.md. Compaction inevitable for long sessions.
3. **Skill-to-skill coordination** — No direct calls; handoffs are serial, blocking steps. Parallelization only at main session level.
4. **Drift in documentation** — findasale-ops says "35 migrations" but actual is 82. findasale-records says source skills live in `claude_docs/skills-package/` but they don't.
5. **Plugin discovery** — Plugins are discoverable but not actively routed to. No workflow exists to say "use engineering:code-review for this code review."

### 7.4 Recommendations Ranked by Priority

| Priority | Recommendation | Type | Effort | Benefit | Timing |
|----------|---|---|---|---|---|
| **P0** | Disable unused plugin categories | Quick Win | <5 min | +5-10% speed | Session wrap |
| **P0** | Document token budget targets in CORE.md | Quick Win | 1 session | Prevents silent loss | This session |
| **P0** | Add version headers to all findasale-* skills | Quick Win | 2 sessions | Better drift detection | Next 3 sessions |
| **P1** | Fix stale references (Neon count, skills-package paths) | Quick Win | 1 session | Documentation accuracy | This session |
| **P1** | Create patrick-language-map.md entry | Quick Win | 1 session | Clearer communication | This session |
| **P2** | Integrate Apollo.io/Clay for prospecting | Proposal | Medium | High (acquisition) | Phase 2 |
| **P2** | Integrate Stripe MCP for payment audits | Proposal | Low | Medium (transparency) | Phase 1.5 |
| **P3** | Research manager skill architecture | Research | 1–2 sessions | Medium (refactor, not urgent) | Phase 2 planning |
| **P3** | Research Cowork session resumption feature | Research | 1 session | Medium (if available) | Next audit |
| **Backlog** | Create findasale-manager orchestration skill | Proposal | Medium-High | Medium (complex) | Phase 3 |

---

## Section 8: Glossary & References

**Cowork features (2026):**
- **Skills** — filesystem-based instruction packages (SKILL.md + resources)
- **Plugins** — curated skill collections (engineering, operations, etc.)
- **MCP** — Model Context Protocol (standardized tool connection framework)
- **Connectors** — MCP integrations to external services (GitHub, Stripe, etc.)
- **MCP Apps** — Interactive UI for connectors (in-canvas dashboards, boards, etc.)
- **Scheduled tasks** — Recurring automations with cron schedules
- **Subagents** — Skills spawned to complete work (Dev, QA, Architect, etc.)

**FindA.Sale key files:**
- `claude_docs/CORE.md` — behavioral rules + push safety
- `claude_docs/CLAUDE.md` — project execution contract
- `claude_docs/STATE.md` — active sprint state + known gotchas
- `.skills/skills/findasale-*/` — 19 custom skills
- `claude_docs/operations/patrick-language-map.md` — terminology clarification

**External references:**
- Cowork help: https://support.claude.com/en/articles/13345190-get-started-with-cowork
- Agent Skills docs: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- MCP connector registry: (browsable in Cowork UI)

---

## Appendix: Session Log

**Sessions analyzed for context trends:**
- Session 164: #24 Holds-Only Item View (full pipeline: 3 MCP pushes, no compaction)
- Session 165: #36 Weekly Treasure Digest (email + MailerLite integration, 2 MCP pushes)
- Session 166: Production unblock (MCP truncation incident, schema.prisma lost 500 lines)
- Session 167: CORE.md v4.1 + itemController restore (post-incident, 4 MCP safety rules added)
- Session 168: Sprint 2 watermark + export (Cloudinary + export routes, context compaction mid-session)

**Pattern observed:** Longer sessions (160–170 min active work) trigger compaction. Post-compaction, CORE.md push rules are re-read but at token cost. No proactive budget management documented.

---

**Audit complete. No files modified (research-only per protocol).**
**Report ready for distribution to Patrick + subagent dispatch (findasale-records, findasale-architect, findasale-innovation).**
