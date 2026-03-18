# Fleet Self-Audit — Session 104
**Date:** 2026-03-09
**Auditor:** Cowork Power User (orchestrator)
**Scope:** All 17 installed skills — findasale-* fleet + utilities — plus scheduled tasks, cross-agent contracts, and ecosystem research
**Method:** Full SKILL.md read for every agent; comparison against CORE.md, STATE.md, CLAUDE.md, and conversation-defaults; scheduled task list pulled live
**Coverage:** 17/17 skills reviewed, 10/10 scheduled tasks reviewed, ecosystem research completed

---

## Executive Summary

The fleet is fundamentally sound but has accumulated drift in 5 agents and has a systemic gap: MESSAGE_BOARD wiring is absent from 15 of 17 agents. Three findings are P0 (could cause incorrect behavior in production): a stale MCP file limit in findasale-workflow, a stale migration count in findasale-ops, and a wrong session-log path in two agents. Two findings are P1 (structural gaps that degrade multi-agent coordination): no BUSINESS_PLAN.md awareness across the fleet, and new agents (Hacker/Pitchman/Advisory Board) missing PROJECT_ROOT setup sections.

---

## P0 — Must Fix Before Bug Blitz

### P0.1 — findasale-workflow: MCP file limit contradicts CORE.md
**Agent:** findasale-workflow
**Location:** "Cowork Environment Constraints" table
**Found:** `GitHub MCP ≤5 files / ≤25k tokens`
**Should be:** `GitHub MCP ≤3 files / ≤25k tokens`
**Authority:** CORE.md §10, CLAUDE.md §5 (both say ≤3 files since session 95)
**Risk:** Any session that follows workflow agent guidance will allow 5-file MCP pushes, which silently fail or crash. This directly contradicts the written rule and the self-healing entry for this pattern.
**Fix:** Single targeted edit — change "≤5" to "≤3" in workflow SKILL.md table.
**Route to:** findasale-records → Tier 1 change

---

### P0.2 — findasale-ops: Migration count is 28 migrations stale
**Agent:** findasale-ops
**Location:** "Production Infrastructure" table, Notes column
**Found:** `35 migrations applied as of 2026-03-06`
**Should be:** `63 migrations applied as of 2026-03-07`
**Authority:** STATE.md "Known Gotchas" (current truth)
**Risk:** Any ops session that checks the migration count will conclude 28 migrations haven't been applied when they have. In a production incident under pressure, this could cause unnecessary re-application attempts.
**Fix:** Update ops SKILL.md migration count and date.
**Route to:** findasale-records → Tier 2 update

---

### P0.3 — Wrong session-log path in two agents
**Agents:** findasale-workflow (Setup section), findasale-records (Session Wrap Protocol + Tier 2 list)
**Found:** `$PROJECT_ROOT/claude_docs/session-log.md`
**Should be:** `$PROJECT_ROOT/claude_docs/logs/session-log.md`
**Authority:** Actual filesystem (confirmed by reading session-log.md at the logs/ path this session)
**Risk:** When workflow or records agents run and try to read/update the session log, they'll silently fail or create a duplicate file at the wrong path. This breaks context continuity.
**Fix:** Targeted path correction in both SKILL.md files.
**Route to:** findasale-records → Tier 1 change (behavior-shaping)

---

## P1 — High Priority Structural Gaps

### P1.1 — MESSAGE_BOARD wiring absent from 15 of 17 agents
**Affected:** All agents EXCEPT findasale-hacker (Rule 5) and findasale-pitchman (Rule 5)
**Gap:** The inter-agent communication protocol (E4, session 96) requires agents to:
1. Read `claude_docs/operations/MESSAGE_BOARD.json` on start
2. Post status/findings during work
3. Post completion summary listing files changed

Only Hacker and Pitchman mention posting (not reading). The 15 remaining agents have no awareness of the board at all.

**Root cause:** The protocol was built during session 96 (orchestrator-only work). No live agent calls happened, so the wiring was never exercised. The board will only work in multi-agent sessions if agents are wired.

**Recommended fix (minimal):** Add a 3-line "Message Board" section to each agent SKILL.md:
```
## Message Board Protocol
On start: read `claude_docs/operations/MESSAGE_BOARD.json`
During work: post status updates if blocked or discovering cross-agent findings
On completion: post a status message listing all files changed
```

**Priority order for wiring (by usage frequency in bug blitz):**
1. findasale-dev (highest call frequency)
2. findasale-qa (pairs with dev every session)
3. findasale-architect (decision-point agent)
4. health-scout (produces findings for other agents)
5. Remaining agents (records, ops, ux, etc.)

**Route to:** findasale-records → Tier 1 change (behavior-shaping) for each skill update

---

### P1.2 — BUSINESS_PLAN.md invisible to the entire fleet
**Found:** BUSINESS_PLAN.md was created 2026-03-06 and locked in STATE.md as "Tier 1 Strategic Authority Document — all business strategy, market analysis, financial projections, competitive positioning, and go-to-market strategy defined here."

**NOT referenced in any agent SKILL.md.** The agents that most need it:

| Agent | Why it matters |
|-------|---------------|
| findasale-advisory-board | Investor and Strategist board members need the financial projections and competitive positioning |
| findasale-architect | Major architecture decisions should align with business plan priorities |
| findasale-rd | Competitor analysis and market research should be grounded in the business plan |
| findasale-marketing | All positioning claims should trace back to the business plan |
| findasale-legal | Compliance review scope is defined by what business plan says we do |

**Fix:** Add one line to each agent's Setup section: `Read $PROJECT_ROOT/claude_docs/BUSINESS_PLAN.md for business context, strategy, and competitive positioning.`
**Route to:** findasale-records → Tier 1 change

---

### P1.3 — New agents (Hacker, Pitchman, Advisory Board) have no Setup sections
**Agents:** findasale-hacker, findasale-pitchman, findasale-advisory-board
**Gap:** All three session-96 agents are missing the standard setup block:
```bash
PROJECT_ROOT=$(ls -d /sessions/*/mnt/FindaSale 2>/dev/null | head -1)
```
And missing the standard "Read before work" instructions (STATE.md, CORE.md).

**Impact:** When these agents are spawned, they don't know where the project lives and can't reliably read reference files. The `/sessions/*/` path prefix changes every session — agents must resolve it via glob, not hardcode.

**Also missing from Advisory Board:** No MESSAGE_BOARD Rules entry (Hacker and Pitchman have Rule 5 for this; Advisory Board has nothing).

**Fix:** Add standard Setup section + Read protocol + MESSAGE_BOARD Rules entry to all three.
**Route to:** findasale-records → Tier 1 change

---

## P2 — Medium Priority

### P2.1 — findasale-support routes bugs directly to dev, bypassing QA
**Found:** Issue classification table routes "Bug report" to: `Document and route to findasale-qa` ✅ (this is correct in the table) but the Pattern Detection Rule says "simultaneously notify Patrick and spawn findasale-qa" for systemic bugs — which is the right path.

However, the Account/login row says "flag to dev if systemic" — this bypasses QA. Any account/auth issue should route to QA before dev to ensure proper test coverage before fixing.

**Fix:** Change "flag to dev if systemic" to "flag to findasale-qa first, then dev".
**Route to:** findasale-records → Tier 1 change

---

### P2.2 — findasale-marketing doesn't reference MailerLite connector
**Found:** Roadmap confirms MailerLite MCP is connected. findasale-marketing has no awareness of this. The email campaign and outreach capabilities are significantly enhanced when the agent knows it can draft, schedule, and send emails directly via MailerLite rather than just writing copy.

**Fix:** Add to Setup section: `MailerLite MCP is connected — use it for drafting, scheduling, and sending email campaigns directly. API key in Railway (MAILERLITE_API_KEY).`
**Route to:** findasale-records → Tier 2 update

---

### P2.3 — findasale-deploy references stale env vars (Twilio, Ollama)
**Found:** Step 3 env var checklist includes `TWILIO_ACCOUNT_SID` (SMS reminders — "optional but warn if missing") and `OLLAMA_URL` ("OK to omit if AI photo feature disabled in prod"). Neither appears in recent sessions or STATE.md. Twilio has never appeared in any session context. Ollama was the original local AI approach before the Google Vision → Haiku chain was established.

**Fix:** Remove `OLLAMA_URL` and `TWILIO_ACCOUNT_SID` from the required env var checklist. Add `MAILERLITE_API_KEY` (Railway, flagged as pending in STATE.md).
**Route to:** findasale-records → Tier 2 update

---

### P2.4 — findasale-deploy Step 8A (`vercel --prod`) likely stale
**Found:** Step 8 Option A says "From project root, run `vercel --prod`". But STATE.md and the deployment history show Vercel auto-deploys from main branch pushes. The `vercel --prod` CLI command is a manual override that requires the Vercel CLI installed — which may not be the current workflow.

**Fix:** Update Step 8A to reflect the actual workflow: "Push to main via `.\push.ps1` — Vercel auto-deploys. Monitor at vercel.com/dashboard." Keep the manual command as a note for emergency overrides only.
**Route to:** findasale-records → Tier 2 update

---

### P2.5 — findasale-records "known tasks" list is 60% stale
**Found:** The SKILL.md lists 4 "known tasks":
- `findasale-nightly-context`
- `findasale-session-wrap`
- `findasale-health-scout`
- `findasale-workflow-review`

**Actual registered tasks (10):**
- `findasale-health-scout` ✅ (weekly, Sunday 11pm)
- `findasale-competitor-monitor` ❌ MISSING (weekly, Monday 8am)
- `findasale-ux-spotcheck` ❌ MISSING (weekly, Wednesday 9am)
- `findasale-monthly-digest` ❌ MISSING (monthly, 1st)
- `findasale-session-warmup` ❌ MISSING (manual)
- `findasale-session-wrap` ✅
- `findasale-workflow-retrospective` ❌ MISSING (monthly, 8th — replaced "workflow-review")
- `weekly-industry-intel` ❌ MISSING (disabled — merged into competitor-monitor)
- `context-freshness-check` ❌ MISSING (daily, 8am)
- `findasale-power-user-sweep` ❌ MISSING (weekly, Sunday 10pm)
- `findasale-nightly-context` — NOT REGISTERED (may have been deleted/renamed?)

Also note: `findasale-workflow-review` is listed in the SKILL.md but has been superseded by `findasale-workflow-retrospective` (monthly instead of bi-weekly).

**Fix:** Replace the "known tasks" list with the full live roster.
**Route to:** findasale-records → Tier 1 change (owns scheduled tasks)

---

### P2.6 — model-routing.md predates E14 research findings
**Found:** The fleet-optimization-evaluation (Phase 1, Phase 5 recommendations) noted model-routing.md is dated 2026-03-05 and the E14 research was completed in sessions 97-102. The doc may not reflect the current Haiku/Sonnet/Opus routing recommendations that came from E14.

**Action:** Read model-routing.md and verify against `claude_docs/research/e14-model-selection-per-agent.md`. If out of sync, update.
**Route to:** findasale-records → Tier 2 update after verification

---

## P3 — Low Priority / Info

### P3.1 — Advisory Board missing Steelman context for B1 decision
The session-103 evaluation explicitly recommended: "Use Advisory Board for B1 decision (Session 105+) — the Sale Type → Item Type linchpin is exactly what it was built for." However, the Advisory Board SKILL.md has no reference to what B1 is or where to find the architectural decision context. The agent would need to read STACK.md and the relevant backlog section to understand what it's evaluating.

**Recommendation:** When invoking Advisory Board for B1, pass explicit context in the dispatch: "Review the B1 decision — Sale Type → Item Type architecture. Read claude_docs/STACK.md and claude_docs/BACKLOG_2026-03-08.md §B1."

---

### P3.2 — Health scout reports location vs. Tier 3 archive rule
CORE.md §16 says Tier 3 one-time artifacts go to `claude_docs/archive/`. Health scout saves reports to `claude_docs/health-reports/` which is NOT under archive/. CORE.md §9 references `claude_docs/health-reports/` as the canonical location.

**Assessment:** This is a deliberate exception — health reports are referenced by the findasale-deploy skill and need a predictable, non-archived location. The Tier 3 rule applies to feature audit reports, rebrand tables, etc., not to ongoing operational scan outputs. No change needed — but the exception should be noted in CORE.md §16 or a comment in the findasale-records Tier 3 definition.

---

### P3.3 — conversation-defaults Rule 3 still narrates "session start signal"
Rule 3 says Patrick's short openers should trigger automatic session start. This rule is correct. However, the current session started with "start the self improvement loop by having each subagent audit themselves..." — a full-length command, not a short opener. The rule is well-scoped and not causing problems. No change needed.

---

## Cross-Agent Contract Assessment

| Contract | Status | Issue |
|----------|--------|-------|
| Dev → QA escalation for payment/auth | ✅ | QA escalation rule present in findasale-dev |
| QA → Dev bug handoff | ✅ | Verdict format routes blockers to dev |
| Architect → Dev spec handoff | ✅ | Handoff format clearly defined |
| Dev → Records for doc changes | ✅ | "What Not To Do" section explicit |
| Records → Patrick for Tier 1 approval | ✅ | Change record format complete |
| Marketing → Records for roadmap feedback | ✅ | Not in marketing skill, but CX handles feedback routing |
| Support → QA for systemic bugs | ⚠️ | Partial — Account/login row bypasses QA |
| CX → Records for roadmap updates | ✅ | Explicit in CX "What Not To Do" |
| Health-scout → all agents for routing | ✅ | Routing Summary block well defined |
| Power User → Records for improvements | ✅ | This document follows that protocol |
| Hacker → Dev for fixes | ✅ | Collaboration Protocol explicit |
| Pitchman → RD for feasibility | ✅ | Collaboration Protocol explicit |
| Any agent → MESSAGE_BOARD | ❌ | 15 of 17 agents unaware |
| Any agent → BUSINESS_PLAN.md | ❌ | 0 of 17 agents reference it |

---

## Scheduled Task Audit

| Task | Schedule | Status | Notes |
|------|----------|--------|-------|
| findasale-health-scout | Sunday 11pm | ✅ Active | Last ran: 2026-03-09 (this morning) |
| findasale-competitor-monitor | Monday 8am | ✅ Active | Next run: today 12:05 |
| findasale-ux-spotcheck | Wednesday 9am | ✅ Active | Last ran: 2026-03-04 |
| findasale-monthly-digest | Monthly, 1st | ✅ Active | Next: 2026-04-01 |
| findasale-session-warmup | Manual | ✅ Active | On-demand only |
| findasale-session-wrap | Manual | ✅ Active | On-demand only |
| findasale-workflow-retrospective | Monthly, 8th | ✅ Active | Last ran: 2026-03-08 |
| weekly-industry-intel | Monday 9am | 🚫 Disabled | Correctly merged into competitor-monitor |
| context-freshness-check | Daily 8am | ✅ Active | Last ran: 2026-03-08 |
| findasale-power-user-sweep | Sunday 10pm | ✅ Active | Last ran: 2026-03-09 (this morning) |

**Gap found:** `findasale-nightly-context` listed in findasale-records SKILL.md does not exist in the registered tasks. May have been merged into `context-freshness-check` or deleted. Records agent should reconcile.

**No gaps in coverage.** Weekly health, UX, competitor intel, and daily context freshness are all running. Monthly digest and retrospective are on appropriate cadences.

---

## Ecosystem Research — 2026-03-09

### New Cowork capabilities since last audit

**New MCP connectors available:**
- Google Workspace (Calendar, Drive, Gmail) — high relevance: could give Claude access to Patrick's actual calendar for meeting prep
- DocuSign — potential future use for organizer agreements
- Apollo, Clay, Outreach — sales/CRM use case, not relevant for Patrick's scale
- Harvey (legal AI) — interesting complement to findasale-legal for escalations

**Platform features:**
- **Private plugin marketplaces** — enterprise feature, not relevant at Patrick's scale
- **"Customize" admin controls** — org-specific plugin config via Q&A setup wizard
- **OpenTelemetry support** — usage tracking and cost monitoring across sessions. **This is highly relevant for E12.5 (token-per-goal metric)** — OpenTelemetry could provide actual token counts rather than estimates.
- **Cross-app Excel ↔ PowerPoint workflows** — not relevant for Patrick

**Skill ecosystem:**
- Skills are now described broadly as "the killer feature nobody talks about enough" — the FindA.Sale fleet is well ahead of common adoption patterns
- No new skill packaging formats discovered; `.md` files in `.skills/` remain the standard

### Recommendations

| Item | Relevance | Recommendation |
|------|-----------|----------------|
| Google Workspace connector | Medium | Consider for session startup — Claude could check Patrick's calendar to know if a meeting is coming that needs prep. Low value now; high value post-beta when Patrick has organizer meetings. |
| OpenTelemetry | High | Research whether Anthropic exposes token counts via OpenTelemetry in Cowork. If yes, this solves the E12.5 data capture problem (currently we estimate TER). Route to findasale-rd for feasibility check. |
| Harvey (legal AI) | Low | Potential escalation tool for findasale-legal when attorney referral is needed. Interesting but adds complexity. Park for post-beta. |

---

## Improvement Batch Summary

### Quick Wins (auto-executable — route to findasale-records)

| # | Change | File | Priority | Effort |
|---|--------|------|----------|--------|
| QW1 | Fix MCP file limit: 5→3 | findasale-workflow/SKILL.md | P0 | 1 line |
| QW2 | Fix session-log path | findasale-workflow/SKILL.md + findasale-records/SKILL.md | P0 | 2 lines |
| QW3 | Fix migration count: 35→63 | findasale-ops/SKILL.md | P0 | 1 line |
| QW4 | Add PROJECT_ROOT setup sections | findasale-hacker, findasale-pitchman, findasale-advisory-board | P1 | ~10 lines each |
| QW5 | Fix bug routing path | findasale-support/SKILL.md | P2 | 1 line |
| QW6 | Remove Twilio/Ollama, add MailerLite | findasale-deploy/SKILL.md | P2 | 3 lines |
| QW7 | Update deploy Step 8A | findasale-deploy/SKILL.md | P2 | 2 lines |
| QW8 | Update scheduled tasks registry | findasale-records/SKILL.md | P2 | ~10 lines |
| QW9 | Add MailerLite reference | findasale-marketing/SKILL.md | P2 | 2 lines |

### Needs Patrick Input

| # | Proposal | Decision Needed |
|---|----------|----------------|
| PI1 | Add BUSINESS_PLAN.md reference to 5 agents | Approve adding to Architect, Advisory Board, Marketing, Legal, R&D setup sections |
| PI2 | Wire MESSAGE_BOARD into all 15 missing agents | Approve the 3-line addition pattern; Records can batch-apply once approved |
| PI3 | OpenTelemetry for token tracking | Should we research whether Cowork exposes token data via OpenTelemetry? (Assign to R&D) |
| PI4 | Google Workspace connector | Want calendar/email access? Would enable session prep and organizer email drafting |

### Parking Lot (good ideas, not urgent)

- Harvey legal AI connector — revisit post-beta
- Advisory Board: add BUSINESS_PLAN.md load into the Review template itself (not just setup)
- health-scout: add a `claude_docs/` Tier 3 archive rule exception note to CORE.md §16

---

## Session 104 Deliverables

- [x] Fleet audit complete — 17/17 agents reviewed
- [x] Scheduled task audit — 10/10 tasks reviewed
- [x] Ecosystem research — findings and recommendations documented
- [x] This report saved to `claude_docs/improvement-memos/fleet-self-audit-2026-03-09.md`

**Files to stage for Patrick's push:**
- `claude_docs/improvement-memos/fleet-self-audit-2026-03-09.md` (this file — new)

**Next step:** Route QW1–QW9 to findasale-records for implementation. Get Patrick's input on PI1–PI4.

---

*Coverage: All 17 SKILL.md files, 10 scheduled tasks, 1 MESSAGE_BOARD.json, CORE.md, STATE.md, roadmap.md, session-log.md, fleet-optimization-evaluation-2026-03-09.md, and ecosystem research. Coverage: ~100% of fleet.*
