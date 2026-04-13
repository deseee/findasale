# FindA.Sale Fleet Redesign Proposal (v1)

**Date:** 2026-03-11 | **Session:** 141 (Planning)
**Status:** DRAFT — Requires Patrick sign-off
**Constraints:** Minimize token waste, minimize mid-session auto-compressions, maximize cross-session context awareness

---

## Executive Summary

After 140 sessions, the fleet has grown organically to 16 custom agents, 9 scheduled tasks, and dozens of plugin-skill mappings. The system works, but it carries the weight of every evolutionary step. This proposal asks: if we redesigned the fleet today with everything we've learned, what would it look like?

The core diagnosis is simple: **too many narrow agents, not enough structured communication, and no feedback loop between sessions.** The proposals below consolidate where overlap exists, create new roles where gaps exist, and establish the communication infrastructure that's been missing.

---

## Part 1: Fleet Restructure — The New Roster

### Tier 1: Core Agents (Always Available, High Frequency)

These are the agents that get invoked nearly every session. They stay as-is or get small scope adjustments.

| Agent | Current | Proposed Change |
|-------|---------|-----------------|
| **findasale-dev** | Senior Developer | **No change.** Workhorse agent. Well-scoped. |
| **findasale-architect** | Systems Architect | **No change.** Gate before dev on schema/cross-layer work. |
| **findasale-qa** | QA/QC | **No change.** Blocks bad code. Mandatory pre-deploy. |
| **findasale-ops** | Operations Manager | **No change.** Railway/Vercel/Neon. Infrastructure lane. |
| **findasale-records** | Documentation Gatekeeper | **No change.** Owns all .md files. Essential for context health. |

**Verdict: 5 agents. Zero changes. These are the engine.**

---

### Tier 2: Strategic Agents (Invoked Weekly or Per-Feature)

These agents are invoked less frequently but provide critical strategic value.

| Agent | Current | Proposed Change |
|-------|---------|-----------------|
| **findasale-ux** | UX & Product Designer | **No change.** Spec before dev on user-facing features. |
| **findasale-marketing** | Marketing | **No change.** Brand voice, campaigns, content. |
| **findasale-hacker** | Security Red Team | **No change.** Pen tests, threat models. Weekly health-scout covers routine scans. |
| **findasale-legal** | Legal & Compliance | **No change.** Low frequency but irreplaceable when needed. |

**Verdict: 4 agents. Zero changes.**

---

### Tier 3: Proposed Merges

#### MERGE 1: `findasale-cx` + `findasale-support` → `findasale-customer-champion`

**Current problem:** CX owns beta onboarding and retention. Support owns inbound tickets and responses. In practice, both deal with the same organizers, the same friction, and the same feedback. At our scale (pre-beta, 5-10 organizers), splitting these is overhead.

**Proposed scope for `findasale-customer-champion`:**

- Beta onboarding sequences and activation tracking (from CX)
- Inbound support responses and de-escalation (from Support)
- **NEW: Voice of the Customer role** — every interaction gets logged as a product signal. The Customer Champion maintains a running `customer-signals.md` file that Dev, UX, and Architect can reference. This is the "customer champion" concept: not just serving users, but ensuring their friction becomes the product roadmap.
- FAQ and help center content
- Feedback collection and synthesis

**Why this works at our stage:** One agent with full customer context is better than two agents with half the picture each. When we scale past 50 organizers, we can split again.

**Token savings:** ~2k fewer tokens in the skill roster per session (one less SKILL.md to list and route).

---

#### MERGE 2: `findasale-rd` + `findasale-pitchman` → `findasale-innovation`

**Current problem:** R&D researches feasibility. Pitchman generates blue-sky ideas. In practice, they share the same trigger conditions ("what if we built X?") and the handoff between them is unclear. Patrick often just wants "give me an idea and tell me if it's feasible" in one pass.

**Proposed scope for `findasale-innovation`:**

- Blue-sky ideation (from Pitchman) — unconstrained creative mode
- Feasibility research (from R&D) — technology evaluation, competitor analysis, market research
- **Two-phase output format:** Phase 1 = wild ideas (no constraints). Phase 2 = feasibility verdict on each idea (cost, complexity, timeline, risk). Always delivers both unless Patrick explicitly asks for just one.
- Technology scouting and "what's possible now" research

**Why this works:** The creative-then-evaluate loop is the natural flow. Separating it into two agents forces Patrick to dispatch twice for what's conceptually one task.

---

### Tier 4: Proposed New Agents

#### NEW: `findasale-sales-ops`

**Gap identified:** Nobody owns the organizer acquisition pipeline. Marketing creates content. CX onboards people who show up. But there's no agent that owns: who are we targeting, have we reached out, what happened, what did we learn?

**Proposed scope:**

- Organizer outreach tracking — who was contacted, when, response status
- Pipeline review — trial signups, activation status, conversion signals
- Outreach drafting — personalized emails to prospective organizers using local market knowledge (Grand Rapids estate sales, yard sales, auctions, flea markets)
- Post-interaction insight capture — structured notes from every organizer conversation Patrick has
- Weekly pipeline briefing — who's warm, who's cold, who needs a follow-up
- **Plugin skill delegation:** sales:draft-outreach, sales:pipeline-review, sales:account-research, sales:daily-briefing, customer-support:customer-research, data:explore-data

**Why this is needed now:** Beta launch is imminent. The difference between a successful beta and a dead one is whether 5-10 organizers actually use the platform. That requires structured outreach, not ad-hoc emails.

---

#### NEW: `findasale-devils-advocate`

**Current problem:** The Devil's Advocate and Steelman live inside the Advisory Board ensemble. They fire when Patrick explicitly asks for "advisory board" or "poke holes." But contrarian thinking is most valuable when it's *automatic* — when it catches a bad decision before it ships, not after Patrick remembers to ask. The board is the right tool for big strategic reviews, but it's heavyweight for everyday decisions. The standalone agents give the main session a quick, focused version it can use without convening all 12 board seats.

**Relationship to the board:** These agents do NOT replace the board seats. The board keeps its Devil's Advocate and Steelman for full-ensemble reviews. These standalone agents are a lighter-weight tool the main session manager can invoke on its own for routine decision-making.

**RESOLVED — Scope & Trigger:** DA (and Steelman) are scoped to challenge *decisions about direction* — "should we" questions, not "how should we" questions. They do NOT fire on purely technical implementation choices (which library, which query pattern, which component structure). The trigger mechanism is an internalized preflight checklist embedded in conversation-defaults. Fleet consensus confirmed this approach in round 2 review. One addition from Hacker: the checklist includes "Does this change our attack surface or external API contract?" to catch technical decisions that carry strategic weight.

**Proposed scope:**

- Challenges strategic and product decisions that are expensive to reverse
- Produces a structured `## Risks & Challenges` block with concrete failure scenarios
- Always includes a `## What I'd Need to See to Be Wrong` section — so it's constructive, not just skeptical
- Can be invoked standalone: "devil's advocate this"

**Trigger — Internalized Preflight Checklist:** Rather than vague auto-trigger heuristics, the DA internalizes a preflight checklist. The main session runs this checklist before executing any non-routine decision:

```
DA Preflight Checklist:
□ Does this change our fee structure or pricing model?
□ Does this alter how organizers perceive or interact with the platform?
□ Does this commit us to a new market, audience, or partnership?
□ Does this change a locked decision or contradict an existing policy?
□ Does this involve data deletion, API contract changes, or schema migrations that affect external consumers?
□ Does this involve public-facing content that represents the brand?
□ Does this change our attack surface or external API contract?
□ Is this decision expensive to reverse (>1 sprint to undo)?
```

If any box is checked AND the decision is about direction/strategy (not purely technical implementation), dispatch DA + Steelman. The checklist lives in conversation-defaults so the main session always has it.

**Security integration (from Hacker review):** Decisions that touch security config, auth flows, or attack surface use a two-tier system:

- **Orange (review before merge):** Fee changes, public content, new integrations, API contract changes. DA + Steelman weigh in; Patrick decides.
- **Red (blocks until sign-off):** Auth flow changes, payment processing changes, data deletion logic, security config. Requires DA + Steelman + Architect or Hacker sign-off before proceeding.

---

#### NEW: `findasale-steelman`

**Trigger scope (shared with DA):** Same preflight checklist, same "should we not how should we" scoping, same Orange/Red security tiers. Steelman always fires alongside DA — never alone, never on purely technical implementation. Where DA asks "what could go wrong," Steelman asks "what's the strongest case this works."

**Proposed scope:**

- Counterpart to the Devil's Advocate — argues the strongest case FOR a proposal
- Co-triggers with Devil's Advocate via the shared preflight checklist
- Produces a `## Strongest Case` block with the best arguments, evidence, and precedent
- Includes `## Conditions for Success` — what needs to be true for this to work
- Prevents over-caution and analysis paralysis — equally dangerous as recklessness

**Output contract:** When both fire, the main session presents their outputs side-by-side and lets Patrick decide. Neither agent has veto power. They inform; Patrick decides.

---

#### NEW: `findasale-investor`

**Rationale for standalone:** The manager faces ROI and cost-benefit questions constantly that don't warrant a full board: "is this feature worth the sprint?" "should we pay for this service?" "what's the unit economics impact of changing our fee?" Currently these get answered with no financial lens, or Patrick has to remember to call the board.

**Proposed scope:**

- Quick cost-benefit analysis on feature proposals, vendor decisions, and build-vs-buy tradeoffs
- Unit economics checks — how does this change affect revenue per organizer, cost per sale, platform take rate?
- Pricing model evaluation — standalone or alongside sales-ops for fee structure decisions
- Resource investment framing — "this will cost X dev-hours; here's what we get back"
- Can be invoked standalone: "investor lens on this" or "is this worth it"

**Relationship to the board:** Stays on the board as a full seat for strategic ensemble reviews. The standalone version handles everyday "worth the investment?" questions.

---

#### NEW: `findasale-competitor`

**Rationale for standalone:** Competitive questions come up in clusters — beta outreach prep, feature differentiation decisions, marketing positioning. Between clusters it sits idle for weeks, but when needed, the manager shouldn't have to convene 12 seats for "how does EstateSales.net handle this?"

**Proposed scope:**

- Active competitive research — "how do we compare to X on Y" on demand
- Structured comparison outputs: feature matrix, pricing comparison, UX differentiation
- Feeds into marketing (positioning), sales-ops (outreach talking points), and innovation (gap analysis)
- Complements the weekly competitor-monitor scheduled task, which handles passive scanning
- **Plugin skill delegation (unified):** All three competitive-analysis plugins (sales:competitive-intelligence, marketing:competitive-analysis, product-management:competitive-analysis) route through this single agent. Other agents (marketing, sales-ops, innovation) request competitive data from findasale-competitor rather than invoking plugins directly. One agent, one competitive lens, consistent output format.
- Can be invoked standalone: "competitive check on this" or "what's [competitor] doing for [feature]"

**Relationship to the board:** Stays on the board as The Competitive Strategist for ensemble reviews. The standalone handles ad-hoc competitive questions.

---

### Tier 5: The Advisory Board (Restructured)

**Current board members:** Investor, Devil's Advocate, User Champion, Competitive Strategist, Market Researcher, Steelman

**Proposed new board (Devil's Advocate and Steelman RETAINED, plus new seats):**

**Important clarification:** The Devil's Advocate and Steelman remain on the board as full seats. The standalone agents (Proposal 4 & 5) are *additional* lightweight tools the main session can use for everyday decision-making without convening the full board. Think of it as: the board has the ensemble version, the standalones have the focused version.

| Seat | Perspective | Mapped From |
|------|-------------|-------------|
| **The Investor** | ROI, unit economics, payback period | Existing (also standalone — see Tier 4) |
| **The Devil's Advocate** | Risks, failure scenarios, what could go wrong | Existing (also standalone — see Tier 4) |
| **The Steelman** | Strongest case for, conditions for success | Existing (also standalone — see Tier 4) |
| **The User Champion** | Organizer UX, adoption friction, real-world usage | Existing |
| **The Competitive Strategist** | Market positioning, differentiation, moats | Existing (also standalone — see Tier 4) |
| **The Market Researcher** | Data, evidence, market trends | Existing (board-only — see rationale below) |
| **The Security Advisor** | Risk exposure, attack surface, compliance | NEW — from `findasale-hacker` |
| **The Systems Thinker** | Fleet health, skill efficiency, automation gaps, workflow patterns | NEW — from `cowork-power-user` |
| **The Legal Counsel** | Regulatory risk, liability, compliance gaps | NEW — from `findasale-legal` |
| **The Marketing Strategist** | Brand risk, messaging alignment, audience perception | NEW — from `findasale-marketing` |
| **The Technical Architect** | Scalability, tech debt implications, system constraints | NEW — from `findasale-architect` |
| **The QA Gatekeeper** | Quality risk, test coverage, regression exposure | NEW — from `findasale-qa` |

**Why no Governance Auditor or Ecosystem Optimizer seats?** Those were originally proposed but are redundant with their source agents. Records *is* the governance enforcer — it doesn't need an advisory hat because its value is enforcement and accuracy, not strategic opinion. Power User's strategic lens is better captured as **The Systems Thinker** — the broadest cross-fleet perspective on the board, focused on how changes ripple through the whole system.

**Why Market Researcher stays board-only:** Market research at our stage is almost always in service of another agent's task — innovation needs market data, marketing needs audience insights, sales-ops needs local intelligence. A standalone researcher without a requesting agent produces research that sits unread. Market research is a *capability* other agents invoke (via data and web search plugins), not a standalone role. If we scale past beta into new markets or verticals, it earns standalone status.

**How it works:** The board fires when explicitly invoked ("advisory board," "stress test this") and now draws from 12 seats instead of 6. Four seats (Investor, Devil's Advocate, Steelman, Competitive Strategist) also exist as standalone agents for everyday use. The board is the full ensemble; the standalones are the quick-draw versions.

**Token impact:** The board skill itself doesn't grow much — each seat is still 2-3 sentences. But the quality improves dramatically because seats are grounded in actual project knowledge rather than generic personas.

#### Board Subcommittees

The full 12-seat board is the right tool for big strategic reviews. But many decisions only need 3-4 targeted perspectives. Subcommittees give the manager a middle gear — faster than the full board, more comprehensive than a single standalone agent.

| Subcommittee | Seats | Trigger |
|--------------|-------|---------|
| **Ship-Ready** | QA Gatekeeper, Technical Architect, Security Advisor | Pre-deploy or pre-merge on critical paths. "Is this safe to ship?" |
| **Risk** | Devil's Advocate, Legal Counsel, Security Advisor | Liability, compliance, or attack-surface implications. |
| **Go-to-Market** | Marketing Strategist, User Champion, Competitive Strategist, Investor | Launch decisions, pricing changes, outreach strategy, brand-facing moves. |
| **Governance** | Systems Thinker, Legal Counsel, QA Gatekeeper | Process health, doc drift, skill bloat, compliance gaps. Power User's weekly sweep can auto-convene. |
| **Growth** | User Champion, Investor, Market Researcher, Competitive Strategist | "Should we build this?" and "Is this worth the investment?" decisions. |

| **Future Vision** | Competitive Strategist, Investor, User Champion, Systems Thinker | Quarterly big-bet decisions. "Where should we be in 6 months?" New markets, major pivots, platform bets. |

**How the manager uses them:** The main session picks the committee by context — it doesn't require Patrick to name one. Patrick can always override and call the full board or a specific standalone agent. Subcommittees are a routing optimization, not a constraint.

**Subcommittee routing rules (to be added to conversation-defaults):**

```
If decision touches deploy/merge on critical path → Ship-Ready
If decision has liability/compliance/security implications → Risk
If decision affects how organizers perceive the platform → Go-to-Market
If decision affects process health, docs, or fleet structure → Governance
If decision is "should we build this / invest in this" → Growth
If decision is about long-term direction or quarterly planning → Future Vision
If ambiguous or spans multiple categories → Err toward subcommittee; Patrick can escalate to full board
If purely technical implementation (after direction is locked) → No committee (Architect + QA handle)
```

---

## Part 2: Communication Infrastructure

### Proposal: Subagent-to-Patrick Escalation Channel

**Current problem:** Subagents can only report back to the main session. If the main session is managing poorly — wrong prioritization, missed context, ignoring a subagent's findings — the subagent has no recourse.

**Proposed mechanism:** Any subagent may include a `## Patrick Direct` section in its output when it believes the main session is:

1. Ignoring a P0/P1 finding
2. Dispatching work that contradicts a locked decision
3. Operating on stale context that the subagent has detected
4. Burning tokens on a path the subagent believes is wrong

**Guardrails (from fleet review consensus):**

- **Evidence required:** Every `## Patrick Direct` block must cite specific evidence — file names, decision references, or concrete data. "I have a bad feeling" is not sufficient. "STATE.md §In Progress lists this as blocked but main session is dispatching Dev to build on it" is.
- **Cooldown:** One `## Patrick Direct` per agent per session. If an agent has already escalated and been overruled, it does not escalate again on the same topic in the same session.
- **Auto-logging:** All `## Patrick Direct` blocks are auto-appended to `escalation-log.md` (new file, append-only, pruned monthly by Records). The daily friction audit checks this log — if escalations are being suppressed or ignored, it surfaces in the friction report.
- **No manipulation vector:** Escalation blocks cannot request actions — they can only flag concerns. The block says "I believe X is wrong because Y" — it never says "do Z instead." Patrick decides the action.

**How it works in practice:**

- The subagent writes a `## Patrick Direct` block in its response with cited evidence
- The main session is **required** to surface this block to Patrick verbatim — no summarizing, no filtering
- The block is simultaneously auto-logged to `escalation-log.md`
- Patrick decides whether the concern is valid
- If the main session suppresses a `## Patrick Direct` block, that's a CORE.md violation detectable in the daily friction audit

**Why this matters:** It's a safety valve. The main session is a single point of failure for judgment. This gives subagents a voice without undermining the hierarchy — Patrick still decides, but he sees the raw signal.

---

### Proposal: Inter-Agent Handoff Protocol

**Current problem:** Agent handoffs are ad-hoc. Architect says "Dev should implement this" but Dev doesn't get the Architect's full context — just a summary filtered through the main session. Context degrades at every handoff.

**Proposed protocol:**

When Agent A's work creates a task for Agent B, Agent A writes a structured handoff file:

```
## Handoff: [Architect] → [Dev]
**Timestamp:** 2026-03-11T14:30:00
**Source agent:** findasale-architect
**Task:** Implement the earnings export endpoint
**Context files:** STACK.md §payments, earningsPdfController.ts
**Decisions already made:** 10% flat fee, Stripe fees estimated not pulled
**Constraints:** No new dependencies, diff-only on existing controller
**Acceptance criteria:** QA can verify the output matches the spec
**Cited file versions:** earningsPdfController.ts@commit:7aed203f
```

**Integrity rules (from Hacker review):**

- Handoff files include metadata: timestamp, source agent, and cited file versions (commit hash or "current" if uncommitted)
- The main session passes handoff files as-is — **no editing, no summarizing**. The main session is a pass-through, not a translator.
- If the receiving agent detects a conflict between the handoff and current file state, it raises a `## Patrick Direct` escalation rather than silently resolving it.

---

### Proposal: Async Decision Voting (from Pitchman)

For decisions that don't need real-time deliberation, agents can register a lightweight +1/−1 vote with a one-line rationale before Patrick decides. This works for non-urgent choices where the manager dispatches multiple agents in parallel and wants a quick signal before committing.

**Format:**
```
## Vote: [Agent Name] — [+1 or −1]
One-line rationale.
```

The main session collects votes and presents the tally to Patrick. Not a replacement for DA/Steelman on high-stakes decisions — this is for lower-stakes calls where quick consensus-checking saves a full deliberation cycle.

**Guardrails (from round 2 review):**
- Voting is reserved for non-reversible decisions or decisions with clear success metrics — prevents vote-spam on trivial choices
- Dissenting votes (−1) are always surfaced verbatim to Patrick — a lone −1 probably caught something the majority missed

---

### Proposal: Trial/Rollback Protocol (from Pitchman)

For revocable decisions, pair the decision with an explicit rollback plan and a review trigger:

```
## Trial: [Decision description]
**Duration:** 2 weeks / 5 sessions / until [condition]
**Success signal:** [What we'd see if this is working]
**Rollback trigger:** [What we'd see if this is failing]
**Rollback steps:** [Exactly how to undo]
```

The daily friction audit checks active trials against their rollback triggers. If a trigger fires, the friction report surfaces it as a P1 item. This lets us ship faster by making reversibility explicit rather than hoping we'll remember to check.

**Rollback post-mortems (from Pitchman):** When a trial fails and rolls back, the post-mortem feeds back to Innovation so failed experiments inform future ideation rather than being forgotten.

---

### Proposal: Cross-Agent Feedback Loops (from Pitchman, round 2)

Three information flows that close gaps between agents:

1. **Rollback → Innovation:** Failed trial post-mortems feed into Innovation's knowledge base so the same idea doesn't get re-proposed without addressing what went wrong.
2. **Customer Champion → Sales-Ops:** Customer Champion's `customer-signals.md` wires into the weekly pipeline briefing. Sales-Ops sees what existing organizers struggle with before writing outreach to new ones.
3. **Competitor → Innovation:** Competitor's research is an optional input to Innovation's blue-sky phase. When ideating on market-facing features, Innovation can request a competitive landscape snapshot first.

These are lightweight — no new files, just routing rules in the relevant SKILL.md files that say "before producing output, check if [source agent] has recent data."

---

### Proposal: Escalation Evidence Standard (from Hacker, round 2)

Tightening on the `## Patrick Direct` channel: escalations claiming "stale context" must cite a specific file version delta (e.g., "STATE.md was updated in session 140 but main session is referencing session 138 state"). Feelings and hunches are not evidence. This prevents the escalation channel from becoming a noise generator.

---

### Proposal: Security Enforcement Mechanisms (from Hacker)

Three mechanisms to close security gaps in the new fleet structure:

1. **Escalation audit + cooldown:** All `## Patrick Direct` blocks auto-log to `escalation-log.md`. Max one per agent per session. Daily friction audit checks for suppressed escalations. (Already incorporated in escalation channel above.)

2. **Handoff integrity metadata:** All handoff files include timestamp, source agent, and cited file versions. Main session passes through without editing. Receiving agent raises escalation on conflicts. (Already incorporated in handoff protocol above.)

3. **Red-flag veto gate:** Changes touching auth flows, payment processing, data deletion, or security config require sign-off from Architect or Hacker before the main session dispatches Dev. This is not a bureaucratic gate — it's a 2-minute "does this look safe?" check that prevents the kind of incident we saw in session 120 (Dev agent replacing a 563-line file with a stub).

---

## Part 3: Session & Context Architecture

### Proposal: Daily Workflow Friction Audit (Scheduled Task)

**What:** A daily scheduled task (8:30am, before Patrick's first session) that reviews the previous day's session log and produces a `friction-report.md`.

**What it checks:**

1. **Compression events** — did any session hit auto-compression? What was lost?
2. **Repair loops** — did any agent redo work another agent already did?
3. **Stale context incidents** — did any agent operate on outdated information?
4. **Subagent dispatch efficiency** — were agents dispatched that could have been avoided?
5. **Patrick wait time** — how many times did Patrick have to answer questions that the system should have known?
6. **Token burn per outcome** — qualitative assessment of tokens spent vs. value delivered

**Output:** A short friction report (aim for <500 tokens) with:

- Top 3 frictions from yesterday
- Proposed fix for each (skill edit, doc update, new rule, or "needs discussion")
- Running 7-day friction trend (are we getting better or worse?)

**Who runs it:** The `findasale-workflow` agent, via scheduled task. The Power User agent reviews the friction report weekly during its Sunday sweep and proposes structural fixes.

**Proposed schedule:** Daily at 8:30am, Monday–Friday. Skip weekends unless Patrick worked Saturday.

---

### Proposal: Context Window Budget Architecture

**Current approach:** CORE.md §3 has checkpoint format and warns at 170k/190k. But the budget isn't *planned* at session start — it's monitored reactively.

**Proposed approach — Budget-First Sessions:**

At session start, after loading context, the main session produces a **session budget plan:**

```
Session 141 Budget Plan:
- Init overhead: ~8k (STATE + CORE + session-log + conversation-defaults)
- Task 1: Fleet redesign proposal (~15k estimated — research + writing)
- Task 2: Implement sales-ops agent (~25k estimated — skill creation + testing)
- Reserve: 20k (compression buffer + unexpected work)
- Total planned: ~68k / 195k available
- Compression risk: LOW
```

This makes token usage intentional rather than reactive. If a session plan would exceed 150k, the main session should split it across two sessions proactively.

**RESOLVED — Budget Learning Mechanism:** Fleet consensus: yes, track estimates vs. actuals to improve accuracy over time. Approach (from Pitchman, endorsed by Architect): don't track per-task-category — instead bucket by outcome type (succeeded-on-plan / over-plan / succeeded-after-retry). Log the delta in session wrap (Records already writes wraps, so zero new overhead): `estimated: 15k, actual: 17.2k, delta: +14%, bucket: over-plan`. Over 30 sessions, patterns emerge and become standing calibration multipliers (e.g., "skill creation runs 1.8x estimate"). The daily friction audit flags sessions that blew budget by >40% for review. Target: ±30% → ±15% within 30 sessions, ±10% within 60.

---

### Proposal: Cross-Session Memory Enhancement

**Current approach:** session-log.md (last 5 entries), STATE.md, next-session-prompt.md, .checkpoint-manifest.json

**What's missing:** Decisions made in session N often get lost by session N+3. The session log captures what was done but not *why decisions were made*.

**Proposed addition: `decisions-log.md`**

A lean, append-only file that captures:

```
## 2026-03-11 — Session 141
- DECIDED: Merge CX + Support into Customer Champion. Reason: pre-beta scale doesn't justify split. Revisit at 50 organizers.
- DECIDED: Daily friction audit scheduled task. Reason: incremental improvement requires daily measurement.
- DEFERRED: Steelman/Devil's Advocate auto-trigger. Reason: needs more thought on trigger heuristics.
```

Rules: max 3 lines per decision. Oldest entries pruned after 30 days. Only decisions that affect future sessions — not implementation details.

**Token cost:** ~500 tokens to load at session start. Saves thousands in avoided "wait, didn't we decide X already?" loops.

---

## Part 4: Scheduled Task Changes

### Current Tasks (9 total)

| Task | Frequency | Verdict |
|------|-----------|---------|
| context-freshness-check | Daily 8am | **KEEP** — essential |
| findasale-health-scout | Weekly Sunday 11pm | **KEEP** — catches code issues |
| findasale-competitor-monitor | Weekly Monday 8am | **KEEP** — market awareness |
| findasale-ux-spotcheck | Weekly Wednesday 9am | **KEEP** — catches regressions |
| findasale-monthly-digest | Monthly 1st | **KEEP** — changelog + stale item detection |
| findasale-workflow-retrospective | Monthly 8th | **MERGE** into daily friction audit (see below) |
| findasale-power-user-sweep | Weekly Sunday 10pm | **KEEP** — ecosystem improvements |
| findasale-session-warmup | Manual | **KEEP** |
| findasale-session-wrap | Manual | **KEEP** |

### Proposed New Tasks

| Task | Frequency | Owner |
|------|-----------|-------|
| **daily-friction-audit** | Daily 8:30am Mon–Fri | findasale-workflow |
| **weekly-pipeline-briefing** | Weekly Monday 9am | findasale-sales-ops (new) |

### Proposed Removal

| Task | Reason |
|------|--------|
| findasale-workflow-retrospective (monthly) | Replaced by daily friction audit + weekly Power User synthesis. Monthly is too infrequent for actionable improvement. |

---

## Part 5: Final Fleet Roster

### Agents (16 → 16, with 2 merges, 6 new, −4 eliminated, net 0)

**Tier 1 — Core (every session)**

| # | Agent | Status | Notes |
|---|-------|--------|-------|
| 1 | findasale-dev | KEEP | No change |
| 2 | findasale-architect | KEEP | No change |
| 3 | findasale-qa | KEEP | No change |
| 4 | findasale-ops | KEEP | No change |
| 5 | findasale-records | KEEP | No change |

**Tier 2 — Strategic (weekly / per-feature)**

| # | Agent | Status | Notes |
|---|-------|--------|-------|
| 6 | findasale-ux | KEEP | No change |
| 7 | findasale-marketing | KEEP | No change |
| 8 | findasale-hacker | KEEP | No change |
| 9 | findasale-legal | KEEP | No change |

**Tier 3 — Merged**

| # | Agent | Status | Notes |
|---|-------|--------|-------|
| 10 | findasale-customer-champion | **NEW (merge)** | CX + Support combined. Adds Voice of Customer role. |
| 11 | findasale-innovation | **NEW (merge)** | R&D + Pitchman combined. Two-phase ideate→evaluate output. |

**Tier 4 — New Agents**

| # | Agent | Status | Notes |
|---|-------|--------|-------|
| 12 | findasale-sales-ops | **NEW** | Organizer pipeline, outreach, trial conversion insights. |
| 13 | findasale-devils-advocate | **NEW** | Standalone from board. Auto-triggers on high-stakes decisions. |
| 14 | findasale-steelman | **NEW** | Standalone from board. Counterbalances Devil's Advocate. |
| 15 | findasale-investor | **NEW** | Standalone from board. Quick ROI/cost-benefit analysis. |
| 16 | findasale-competitor | **NEW** | Standalone from board. Ad-hoc competitive research. |

**Eliminated:**
- `findasale-cx` → merged into customer-champion
- `findasale-support` → merged into customer-champion
- `findasale-rd` → merged into innovation
- `findasale-pitchman` → merged into innovation

**Net change:** 16 → 16 agents (−4 eliminated, +6 new/merged, net 0). But composition shifts: fewer overlapping narrow agents, more purpose-built advisory and pipeline roles.

### Meta-Agents (unchanged)

| Agent | Role |
|-------|------|
| findasale-workflow | Session efficiency, daily friction audit |
| cowork-power-user | Ecosystem optimization, weekly improvement sweep, Systems Thinker board seat |
| findasale-advisory-board | Multi-perspective stress testing (restructured to 12 seats + 5 subcommittees) |
| findasale-deploy | Pre-deploy checklist |
| conversation-defaults | Session behavior rules |
| context-maintenance | Doc freshness |
| health-scout | Code health scanning |
| dev-environment | Environment reference |

---

## Part 6: Token Impact Analysis

| Change | Token Impact |
|--------|-------------|
| 2 agent merges (CX+Support, R&D+Pitchman) | **−4k/session** (2 fewer SKILL.md files in roster) |
| 4 new standalone advisory agents | **+0/session base** (only cost tokens when invoked; not in roster permanently) |
| 1 new pipeline agent (sales-ops) | **+1.5k/session** (when invoked; 0 if not) |
| Daily friction audit | **+2k/day** (automated, not in-session) |
| decisions-log.md at init | **+0.5k/session** |
| Budget-first session planning | **+0.2k/session** (negligible) |
| Inter-agent handoff protocol | **+0.3k/handoff** (saves more in avoided re-reads) |
| Restructured advisory board (12 seats + subcommittees) | **0 base** (only fires on explicit invocation; subcommittees are cheaper than full board) |

**Net per-session:** Slightly positive. Saves ~2.5k from merges, spends ~2k on better context infrastructure. The standalone advisory agents are zero-cost until invoked, and subcommittees actively save tokens vs. full board calls. The real ROI comes from fewer repair loops, fewer stale-context incidents, and fewer wasted subagent dispatches — which the daily friction audit is designed to measure.

---

## Decision Required

Patrick, this proposal has 22 decisions. All open questions have been resolved through two rounds of fleet review. You can approve, reject, or modify each independently.

**Fleet Structure:**
1. **Merge CX + Support → Customer Champion** (with Voice of Customer role)
2. **Merge R&D + Pitchman → Innovation** (two-phase ideate→evaluate)
3. **Create findasale-sales-ops** (organizer pipeline agent)
4. **Create findasale-devils-advocate** (standalone from board, scoped to direction/strategy, internalized preflight checklist, shared Orange/Red security tiers)
5. **Create findasale-steelman** (standalone from board, matching trigger scope, co-fires with DA)
6. **Create findasale-investor** (standalone from board, quick ROI/cost-benefit)
7. **Create findasale-competitor** (standalone from board, unified competitive plugin routing)

**Advisory Board:**
8. **Restructure Advisory Board to 12 seats** (drop Governance Auditor + Ecosystem Optimizer, add Systems Thinker from Power User, retain all 4 standalone seats on board)
9. **Board subcommittees** (Ship-Ready, Risk, Go-to-Market, Governance, Growth, Future Vision) with explicit routing rules in conversation-defaults

**Communication & Safety:**
10. **Subagent-to-Patrick escalation channel** (with guardrails: evidence required, cooldown, auto-logging, stale-context claims must cite file version deltas)
11. **Inter-agent handoff protocol** (structured files with integrity metadata, no-edit pass-through)
12. **Red-flag veto gate** (Architect/Hacker sign-off required on auth, payments, data deletion, security changes)
13. **Async decision voting** (lightweight +1/−1, non-reversible decisions only, dissenting votes always surfaced)
14. **Cross-agent feedback loops** (rollback→Innovation, Customer Champion→Sales-Ops, Competitor→Innovation)

**Session & Context:**
15. **Daily friction audit scheduled task** (replacing monthly retrospective)
16. **Budget-first session planning** (with learning mechanism: outcome-bucketed delta tracking, target ±10% within 60 sessions)
17. **decisions-log.md** (cross-session decision memory)
18. **Trial/rollback protocol** (explicit rollback plans, checked by friction audit, post-mortems feed Innovation)

**Scheduled Tasks:**
19. **Add daily-friction-audit** (daily 8:30am Mon–Fri, owned by workflow)
20. **Add weekly-pipeline-briefing** (weekly Monday 9am, owned by sales-ops)

**Rollout (Power User's phased approach):**
21. **Phase 1 (immediate):** Merges (1-2) + escalation channel (10) + handoff protocol (11) + veto gate (12)
22. **Phase 2 (two weeks):** Board restructure (8-9) + new standalone agents (4-7) + sales-ops (3) + context infrastructure (15-18) + scheduled tasks (19-20) + feedback loops (14) + voting (13)

---

## Appendix: Phased Rollout Plan (Power User recommendation, Patrick-approved)

**Phase 1 — Immediate (next session)**
Ship the lowest-risk, highest-ROI changes first. These are foundational infrastructure that makes everything else work better.

| Item | Work Required | Parallel? |
|------|--------------|-----------|
| Merge CX + Support → Customer Champion | Create new SKILL.md, delete old two | Yes |
| Merge R&D + Pitchman → Innovation | Create new SKILL.md, delete old two | Yes |
| Escalation channel | Add rules to CORE.md + conversation-defaults, create escalation-log.md | Yes |
| Handoff protocol | Add template to CORE.md + conversation-defaults | Yes |
| Red-flag veto gate | Add to CORE.md §security | Yes |
| decisions-log.md | Create file, add to session-init checklist | Yes |

All six items are independent — dispatch in parallel via subagents.

**Phase 2 — Two weeks after Phase 1 stabilizes**
New agents, board restructure, and context infrastructure. Depends on Phase 1 being stable (verified by daily friction audit).

| Item | Work Required | Dependencies |
|------|--------------|--------------|
| Create findasale-sales-ops | New SKILL.md + plugin routing | None |
| Create findasale-devils-advocate | New SKILL.md + preflight checklist in conversation-defaults | conversation-defaults updated in Phase 1 |
| Create findasale-steelman | New SKILL.md (shares DA trigger scope) | DA skill created first |
| Create findasale-investor | New SKILL.md | None |
| Create findasale-competitor | New SKILL.md + unified plugin routing | None |
| Restructure advisory board | Update board SKILL.md (12 seats + subcommittees + routing rules) | Standalone agents created first |
| Budget-first session planning | Add to conversation-defaults + session-init | None |
| Trial/rollback protocol | Add to CORE.md | None |
| Cross-agent feedback loops | Add routing notes to relevant SKILL.md files | Merged agents created in Phase 1 |
| Async decision voting | Add to CORE.md | None |
| Daily friction audit task | Create scheduled task | Workflow skill exists |
| Weekly pipeline briefing task | Create scheduled task | Sales-ops created first |
