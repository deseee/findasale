# Opus Fleet Audit — 2026-03-06

## Fleet Design Assessment

### What Works Well

**Clear role separation with minimal overlap:**
- Development, QA, architecture, and operations are cleanly split with explicit "what not to do" boundaries
- Marketing, R&D, UX, and CX are distinct enough that Patrick will know which skill to trigger
- Records auditor is properly positioned as the single gating authority for all behavior-shaping changes
- Context-maintenance and health-scout are specialized utilities that don't conflict with operational agents

**Excellent documentation of triggering phrases:**
Each skill SKILL.md begins with 5+ specific trigger phrases in the description. Examples:
- findasale-dev: "implement this", "build the feature", "write the code", "fix this bug"
- findasale-qa: "test this", "does this work", "verify the feature"
- findasale-architect: "should we add this to the schema", "design this feature", "is this architecture sound"

These are specific and action-oriented — Patrick won't accidentally trigger a skill meant for another task.

**Workflow agent is crucial and thorough:**
findasale-workflow correctly identifies the meta-level problems (over-asking, context drift, wrong skill triggering, redundant reads). The "Know Patrick" section (bias toward action, momentum, non-technical language) is accurate and will prevent the fleet from devolving into excessive confirmation loops.

**Self-improvement loop is elegant:**
findasale-records establishes a proper gating mechanism where agents can propose improvements to their own SKILL.md files. This prevents silent workarounds while keeping the loop tight and formal. Tier 1/2/3 governance is sound.

**Records auditor has real authority:**
Tier 1 file gating (CLAUDE.md, CORE.md, SECURITY.md, all SKILL.md files, all scheduled tasks) prevents stale or contradictory rules from accumulating. The change record format (Previous/New/Risk/Patrick approved) is exactly right for high-stakes changes.

---

### Gaps and Missing Roles

**No dedicated "release/launch coordinator" — partially addressed but understaffed:**
- findasale-deploy exists and handles pre-deploy checklists
- findasale-ops handles infrastructure
- findasale-cx handles beta onboarding
- BUT: there's no single agent that owns "what's the beta launch checklist" or "what needs to happen before general availability"
- **Recommendation:** Keep findasale-deploy as-is, but add explicit beta launch orchestration to findasale-cx's responsibilities (or create minimal findasale-launch as a scheduler/tracker). Current state: findasale-cx knows onboarding, but doesn't own "are we ready to invite the next cohort?"

**No agent for "session summary / handoff writing":**
- context-maintenance owns context file updates
- findasale-records owns documentation
- BUT: Patrick needs a single agent that can, at session end, look at git history and write the session-log.md entry + next-session-prompt.md automatically
- **Current workaround:** context-maintenance skill has SESSION END PROTOCOL but it's prescriptive, not automated
- **Recommendation:** Low priority — context-maintenance skill already handles this, but it could be clearer that this is its responsibility and trigger-ability

**No dedicated "data quality / seed management" agent:**
- findasale-qa tests code
- findasale-ops runs migrations
- BUT: Patrick has no agent to call when he says "seed the database with realistic data for testing" or "is the data model consistent end-to-end?"
- **Impact:** Low — this is probably a rare task. But it exists.
- **Recommendation:** Add to findasale-qa's scope or create findasale-data as a lightweight agent focused on seed/test-data consistency

---

### Overlap/Confusion Risks

**findasale-architect vs. findasale-dev boundary is clear but high-stakes:**
- Architecture owns schema, cross-layer contracts, tech decisions
- Dev owns implementation
- **Risk:** If Patrick says "add a new field to the sale table", will he trigger architect or dev?
  - Correctly: architect (to approve the schema change)
  - Likely mistake: dev (to "just add it")
- **Mitigation:** findasale-workflow should proactively catch this — suggest adding to CORE.md: "Before any schema change, consult findasale-architect first"

**findasale-ux vs. findasale-cx overlap on "what should the onboarding look like?":**
- UX owns "how should this flow work" (task design, wireframes, spec)
- CX owns "how do we activate organizers" (onboarding sequences, help docs, feedback collection)
- **Risk:** Patrick says "improve organizer onboarding" — who gets triggered?
  - Correct answer: both, in order (UX first for flow design, then CX for activation/messaging)
  - Likely mistake: just CX (missing UX design pass)
- **Mitigation:** findasale-workflow should flag this pattern. Add to triggering clarity: "If it's about FLOW, start with findasale-ux. If it's about ACTIVATION or HELP, start with findasale-cx."

**findasale-rd vs. findasale-architect on "should we build this technology?":**
- R&D evaluates feasibility and recommends
- Architect decides whether it fits and how
- **Risk:** Low overlap — R&D produces a recommendation, Architect decides. Clear handoff.
- **Assessment:** This one actually works well.

**findasale-qa vs. findasale-support on "this feature broke for a user":**
- QA tests code before it ships
- Support handles inbound issues
- **Risk:** A shopper reports a bug. Is it a bug fix (QA → Dev) or a support issue (Support handles)?
  - Support correctly routes to QA if it's a systemic bug
  - But Support might start investigating before escalating
- **Mitigation:** findasale-support SKILL.md already has this (Bug Type → Route to findasale-qa). Solid.

**findasale-legal is lightweight and risk-free:**
- Legal doesn't compete with other agents — it's a guardrail
- Only triggers on specific compliance/risk questions
- **Assessment:** No confusion risk. Appropriate scope.

**findasale-marketing vs. findasale-cx on "what should we say to organizers?":**
- Marketing creates campaigns, brand voice, conversion copy
- CX creates personalized onboarding, help docs, feedback loops
- **Risk:** Patrick says "write a welcome email for new organizers" — who owns it?
  - Correct: CX (onboarding, personal touch)
  - But marketing might have input on brand voice
- **Mitigation:** CX owns it, but should consult marketing's brand voice guidelines. This is actually in CX's SKILL.md already (it references brand/voice). OK.

---

### Triggering Reliability Concerns

**findasale-dev description is long but clear:**
9 specific trigger phrases covering: implement, build, write code, fix bugs, add endpoints, create components, make this work. Will reliably trigger.

**findasale-qa description is strong:**
Test, verify, audit, code review, is this safe — all solid triggers.

**findasale-architect description is adequate:**
"Should we add to schema", "design this feature", "is this architecture sound" are clear. Will trigger.

**findasale-ops description is operational:**
"Server is down", "Railway isn't deploying", "run the migration", "set env var", "check logs" are all correct. Will trigger.

**findasale-records description is authoritative:**
"Update STATE.md", "log what we did", "update the docs", "run a doc audit" — all appropriate. Will trigger.

**findasale-marketing description is crystal clear:**
"Write a blog post", "social posts", "marketing copy", "draft press release" — all obvious. Will trigger.

**findasale-rd description is good but could be more specific:**
"Research this", "is there a better way", "evaluate this technology" — slightly generic. Could add: "analyze competitors", "research market opportunity" to make it sharper.

**findasale-ux description is clear:**
"Does this flow make sense", "review the UX", "how should this screen work", "design this feature" — will trigger.

**findasale-cx description is adequate:**
"Onboard this organizer", "write onboarding docs", "beta user isn't activating", "how do we collect feedback" — clear.

**findasale-legal description is appropriate:**
"Is this legal", "compliance check", "do we need a disclaimer", "review the terms" — will trigger on compliance questions.

**findasale-support description is strong:**
"An organizer emailed with a problem", "user can't log in", "write a support response", "add to the FAQ" — concrete and specific.

**findasale-workflow description is excellent:**
"Why is this taking so long", "Claude keeps asking me things", "the workflow feels broken", "Claude isn't triggering the right skills" — meta-level triggers that correctly identify workflow problems.

**health-scout description is appropriate:**
"Run a health check", "scan for bugs", "security audit" — will trigger, also runs weekly via scheduled task.

**context-maintenance description is clear:**
"Refresh context", "update docs", "wrap up session", "log what we did" — will trigger. Also has scheduled nightly task.

---

## Agent-by-Agent Notes

### findasale-dev
**Strengths:**
- Stack authority is comprehensive (TypeScript, Next.js 14, Express, Prisma, Railway, Vercel)
- Cross-layer contracts are explicit and well-explained
- Handoff summary format is structured and captures context checkpoint

**Concerns:**
- Dev is expected to know about Architect's decisions before starting — relies on Patrick consulting architect first
- No explicit mention of "when to reach out to QA" (assumes Patrick will trigger it)

**Suggestion:**
- Add a line: "If your change affects payments, auth, or user data, flag to QA before pushing"

---

### findasale-qa
**Strengths:**
- Review checklist is comprehensive (TS/build, logic, security, payments, frontend, API contracts)
- Verdict format is structured and includes severity definitions
- Correctly blocks bad code — treats findings as mandatory

**Concerns:**
- QA assumes Dev has already compiled with `pnpm tsc --noEmit` — what if it hasn't?
- Scan 5 (Prisma data safety) relies on grep to catch "include: true" — might miss nuanced safety issues

**Suggestion:**
- Add: "If TypeScript doesn't compile, FAIL immediately — do not review code that doesn't build"
- Keep the grep-based scans as heuristics, but add a note that these are starting points, not guarantees

---

### findasale-architect
**Strengths:**
- Locked decisions are clearly listed and won't be revisited
- Cross-layer contracts are well-documented
- ADR (Architecture Decision Record) format is appropriate
- Schema design principles are sound

**Concerns:**
- Architect is authoritative but might slow down rapid prototyping if every feature requires full architecture review
- No explicit timeline for how long an ADR should take (Patrick might wait for lengthy design docs)

**Suggestion:**
- Add: "ADRs should be concise and written in ~30 mins. If you're taking longer, break the decision into smaller pieces and consult Patrick."

---

### findasale-ops
**Strengths:**
- Gotchas section is comprehensive and addresses real Railway/Neon pain points
- Deployment checklist is thorough
- Incident response has a clear diagnostic flow

**Concerns:**
- Heavy on Railway/Vercel/Neon specifics — if infrastructure changes, this skill becomes stale
- No mention of rollback procedures (RECOVERY.md has them, but Ops should reference)

**Suggestion:**
- Add explicit reference: "For rollback procedures, see RECOVERY.md after incident diagnosis"

---

### findasale-records
**Strengths:**
- Tier 1/2/3 governance model is sound and prevents silent rule drift
- Self-improvement loop is elegant and well-gated
- Scheduled task governance table is explicit
- Session wrap protocol is comprehensive

**Concerns:**
- VERY heavy responsibility — this agent is a bottleneck for all behavior-shaping changes
- Tier 1 change record format requires 6 fields (Requested by, Reason, Previous, New, Risk, Patrick approved) — might slow down urgent fixes
- Patrick approval requirement means Tier 1 changes can't happen asynchronously

**Assessment:** This is intentional and appropriate. The bottleneck is a feature, not a bug — it prevents silent drift.

**Suggestion:**
- Add: "For urgent Tier 1 changes, use @critical urgency when routing to Patrick. He should approve within 1 session."

---

### findasale-marketing
**Strengths:**
- Brand voice is clear (warm, practical, local)
- Audience profiles are specific (organizers in West Michigan, shoppers hunting deals)
- Content checklist prevents advertising unshipped features

**Concerns:**
- No mention of what to do if marketing needs product input (e.g., "Can we say this feature is coming soon?")
- Context monitoring only triggers after 3+ pieces — might miss context bloat mid-session

**Suggestion:**
- Add: "Before creating marketing content about any feature, verify it's live in STATE.md or mark it clearly as 'Coming Soon'"

---

### findasale-rd
**Strengths:**
- Research standards are clear (cite sources, separate fact from inference, stay in scope, be opinionated)
- Feasibility memo format is practical
- Output structure guides toward actionable recommendations

**Concerns:**
- R&D doesn't own competitive intelligence — findasale-workflow agent exists but is separate
- No explicit statement about "when do we research vs. when do we just build?"

**Suggestion:**
- Add: "If a decision is time-sensitive or the answer is obvious, recommend DEFER research and just build"

---

### findasale-ux
**Strengths:**
- UX principles are user-centric and non-technical (don't optimize for what's easy, optimize for what users understand)
- Flow spec format is practical and includes edge cases
- Mobile-first mindset is explicit

**Concerns:**
- UX audit protocol assumes designs are already shipped — no mention of pre-ship UX review before Dev starts coding
- "Do not write code" rule is appropriate but might create confusion if Dev and UX need to iterate

**Suggestion:**
- Add: "For new features, consult findasale-ux BEFORE findasale-dev starts implementation. UX spec prevents rework."

---

### findasale-cx
**Strengths:**
- Beta program structure is clear (5–10 organizers, weekly check-ins, success criteria)
- Feedback triage table routes issues appropriately
- Onboarding sequence is practical

**Concerns:**
- CX doesn't own "should we enable this feature for beta users" — that's findasale-qa/dev territory
- Feedback collection relies on Patrick doing personal outreach — not scalable post-beta

**Suggestion:**
- Add: "As we scale beyond 10 beta organizers, this agent should also own in-app feedback collection (surveys, feature flags)"

---

### findasale-legal
**Strengths:**
- Compliance areas are comprehensive (Stripe, consumer protection, privacy, estate sale specifics)
- Pre-ship checklist prevents shipping without basic legal review
- "Ask an attorney" triggers are clearly identified

**Concerns:**
- Legal is advisory only — agent never blocks features, only recommends
- No mention of what to do if attorney recommendations conflict with business goals

**Suggestion:**
- This is OK as-is. Legal flags, Patrick decides. Appropriate for an AI agent.

---

### findasale-support
**Strengths:**
- Support voice is empathetic and actionable
- Issue classification routes problems to the right agents
- KB entry format is practical

**Concerns:**
- Support doesn't own "should we change this feature because 3 users complained?" — that's findasale-cx/records territory
- Escalation protocol is clear but might miss patterns if support only handles one or two issues per session

**Suggestion:**
- Add: "If you handle 3+ issues of the same type, route to findasale-cx for trend analysis and possible feature backlog impact"

---

### findasale-workflow
**Strengths:**
- "Know Patrick" section is brutally accurate (action bias, momentum, non-technical language)
- Common anti-patterns are identified with fixes (over-asking, context drift, wrong skill triggering)
- Audit protocol is thorough (session logs, skill descriptions, CLAUDE.md, context docs, gaps)

**Concerns:**
- This agent is heavy on analysis and light on action — it proposes changes but doesn't implement them
- "Don't audit workflow mid-feature-build" rule might prevent catching problems when they matter most

**Assessment:** Intentional design. Workflow is a meta-analyst, not an operator. Appropriate.

**Suggestion:**
- Add: "If findasale-workflow detects a blocker during an active session (e.g., wrong skill triggered), flag to Patrick immediately rather than waiting for the audit"

---

### context-maintenance
**Strengths:**
- SESSION START and SESSION END protocols are comprehensive
- Dirty-session detection is clever (checks .last-wrap timestamp vs. last commit)
- Maintenance workflow steps are well-documented
- Two-tier memory system (hot + deep store) is token-efficient

**Concerns:**
- Very heavy script — Session End Protocol has 5+ steps plus archive check
- PATH resolution relies on glob — if path structure changes, this breaks
- `update-context.js` might generate stale context if new files are added outside the script's knowledge

**Suggestion:**
- Add: "If context.md seems out of date after `update-context.js` runs, check if new packages or directories were added to the project. The script may need updating."

---

### health-scout
**Strengths:**
- Scan sequence is methodical and covers the most critical areas (secrets, auth, code quality)
- LLM-as-judge verification prevents false positives
- Finding routing (to health-reports/) and self-healing reference is good

**Concerns:**
- Scan 7 (env vars) relies on .env.example existing — what if it doesn't?
- "Suppress findings that are clearly false positives" is guidance, but different sessions might suppress different things

**Suggestion:**
- Add: ".env.example is required for this scan. If it doesn't exist, scan will fail with a clear message."

---

## Governance Model Assessment (findasale-records)

### Is the Tier 1/2/3 Model Sound?

**YES, with caveats.**

**Tier 1 (Behavior-shaping) — Correct files:**
- CLAUDE.md files (project + global)
- CORE.md, SECURITY.md
- self_healing_skills.md, session-safeguards.md, patrick-language-map.md
- All skill SKILL.md files
- All scheduled tasks

These files directly influence how Claude thinks. Tier 1 gating prevents silent rule drift and is appropriate.

**Tier 2 (Operational) — Correct files:**
- STATE.md, STACK.md, OPS.md, DEVELOPMENT.md, RECOVERY.md
- session-log.md, roadmap.md, BETA_CHECKLIST.md, migration-runbook.md
- context.md, next-session-prompt.md

These change frequently as the project evolves. Tier 2 doesn't require Patrick approval but requires announcement. Correct.

**Tier 3 (Reference) — Correct files:**
- feature-notes/, guides/, COMPLETED_PHASES.md
- health-reports/, research/, ux-spotchecks/, brand/, competitor-intel/, monthly-digests/

These are outputs and reference material. Free to update. Correct.

### Risks

**Single Bottleneck Risk:**
findasale-records is the gate for ALL Tier 1 changes. If records is slow or unavailable, behavioral changes can't happen.

**Mitigation:** This is acceptable. The point of the gate is to prevent silent drift. Slowness is a feature, not a bug.

**Tier 1 Change Record Overhead:**
Tier 1 changes require full change records (6 fields). For a simple fix like "typo in CLAUDE.md", this is heavy.

**Mitigation:** Correct. Tier 1 is important enough to justify the overhead. Typos should be rare.

**Patrick Approval Bottleneck:**
Patrick must approve every Tier 1 change. In an active session, this creates back-and-forth.

**Mitigation:** Acceptable. Patrick should approve behavioral rules. If approval is slow, route to findasale-workflow to identify friction.

### Self-Improvement Loop

**How it works:**
1. Agent notices gap in its own SKILL.md during actual work
2. Agent writes self-improvement proposal in handoff summary
3. Proposal routes to findasale-records as Tier 1 change request
4. Records reviews: accurate? conflicts? real trigger or one-off?
5. Records presents to Patrick with recommendation
6. Patrick approves → Records packages → Patrick installs

**Is it sound?**
YES. This prevents agents from silently working around their own gaps. Improvements become permanent and available to future sessions.

**Risk:**
Agents might not propose improvements if they're busy. No mechanism to detect "this agent keeps hitting the same gap."

**Suggestion:**
- During findasale-workflow monthly review, add: "Check each agent's recent handoffs for self-improvement proposals. Proactively route to findasale-records any patterns of under-specification."

### Scheduled Task Governance

**Current tasks (11 total):**
1. findasale-nightly-context — daily at 2am (refresh context.md)
2. findasale-health-scout — weekly Sunday 11pm (security scan)
3. findasale-competitor-monitor — weekly Monday 8am (competitive intel)
4. findasale-changelog-tracker — weekly Tuesday 8am (library updates)
5. findasale-ux-spotcheck — weekly Wednesday 9am (code review)
6. findasale-monthly-digest — monthly 1st at 9am (feature digest)
7. findasale-session-warmup — manual only (Docker health check)
8. findasale-session-wrap — manual only (session wrap)
9. findasale-workflow-retrospective — monthly 8th at 9am (meta-audit)
10. weekly-industry-intel — weekly Monday 9am (research scan)
11. context-freshness-check — daily 8am (drift detection)
12. findasale-workflow-review — bi-weekly 1st + 15th at 9am (workflow review)

**Assessment:**
- Too many scheduled tasks for a solo-Claude workflow
- Some overlap: findasale-workflow-retrospective (monthly 8th) + findasale-workflow-review (bi-weekly 1st + 15th) both audit workflow
- findasale-competitor-monitor + weekly-industry-intel have similar triggers (Monday mornings)

**Risks:**
- Scheduled tasks run without Patrick in the loop — if a task generates a report with wrong recommendations, Patrick won't see it immediately
- Some tasks are "nice to have" (competitor-monitor, changelog-tracker) but consume scheduled task slots
- If a scheduled task encounters missing context (e.g., .env.example doesn't exist for health-scout), it might fail silently

**Recommendations:**
1. **Consolidate workflow reviews:** Merge findasale-workflow-review (bi-weekly) and findasale-workflow-retrospective (monthly) into a single monthly task. Remove bi-weekly. This prevents duplicated effort.
2. **Consolidate research tasks:** Merge findasale-competitor-monitor + weekly-industry-intel into a single "Weekly Market & Tech Intelligence" task. Runs once per week, covers both.
3. **Add error notification:** All scheduled tasks should append results to a "recent-task-runs.md" file with pass/fail status. If a task fails, Patrick sees it at session start.
4. **Reduce frequency:** 11 tasks per week is aggressive. Consider disabling findasale-changelog-tracker (can be on-demand) to reduce background load.

---

## Workflow Audit

### Docs That Need Updating

**CORE.md:**
- Reference the 12-agent fleet early
- Add: "When to trigger which agent" quick reference table
- Add: "This skill doesn't trigger my problem" troubleshooting guide

**CLAUDE.md (project root):**
- Add explicit reference to findasale-records' Tier 1/2/3 governance
- Add: "If you're changing behavior rules, route through findasale-records"

**DEVELOPMENT.md:**
- Currently mentions Docker removal — this is done, but file is brief. OK to leave as-is.

**Roadmap.md:**
- Reference the fleet in "How we work" section
- Clarify when an agent-backed task will be triggered vs. direct implementation

**Next-session-prompt.md:**
- Template should include "Which agents were used last session?" as a hint

**STACK.md:**
- Add: "For tech decisions that touch multiple layers, consult findasale-architect first"

---

### Workflow Changes Recommended

**1. (HIGH) Add agent triggering to CORE.md**
Create a quick-reference table:

| When You Want To | Trigger This Agent | Key Phrases |
|---|---|---|
| Write code | findasale-dev | implement, build, fix bug, add endpoint |
| Test code | findasale-qa | test, verify, QA, is this safe? |
| Plan architecture | findasale-architect | design feature, schema change, tech decision |
| ... | ... | ... |

**Rationale:** Patrick shouldn't have to scan 12 skill descriptions to find the right agent.

**2. (HIGH) Add "findasale-records is the gate" to CLAUDE.md**
New section: "Behavioral Rules — Change Protocol"
Explain Tier 1/2/3 and where to route changes.

**Rationale:** Currently Patrick might not know that CORE.md changes require Records review.

**3. (MEDIUM) Reduce scheduled task load**
Recommendations:
- Consolidate findasale-workflow-review (bi-weekly) + findasale-workflow-retrospective (monthly) into one monthly task on the 8th
- Merge findasale-competitor-monitor + weekly-industry-intel into "Weekly Market Intel" (Monday 8am)
- Disable findasale-changelog-tracker (make it on-demand via findasale-rd skill instead)

**Rationale:** 11 scheduled tasks is overhead. Better to run fewer, higher-value scans.

**4. (MEDIUM) Create "agent troubleshooting" guide**
Add to CLAUDE.md: "If I'm not triggering the right agent..."
- "I want to change how Claude behaves" → findasale-records
- "I want to improve a skill" → findasale-workflow
- "I'm not sure which agent to use" → findasale-workflow

**Rationale:** Meta-problem solving should go to findasale-workflow, not directly to other agents.

**5. (LOW) Add scheduled task result tracking**
Create a lightweight "scheduled-task-log.md" file that records pass/fail for each automated task. Patrick sees it at session start.

**Rationale:** Prevents silent task failures.

---

### Most Underused Agents (and How to Fix)

**1. findasale-rd (Research & Development)**
- **Why underused:** Patrick probably doesn't naturally think "I need an R&D report" — he thinks "I need to decide if we should build X"
- **Fix:** Add to findasale-workflow's "Know Patrick" section: "When Patrick says 'should we add this feature', trigger findasale-rd for a feasibility memo before findasale-architect designs it"
- **Trigger improvement:** Rename description triggers to include: "what would it take to build", "is this feasible", "how long would this take"

**2. findasale-legal (Legal & Compliance)**
- **Why underused:** Patrick might not think of legal review until post-ship
- **Fix:** Add to findasale-deploy checklist: "Before shipping anything to beta, run findasale-legal compliance check"
- **Trigger improvement:** Add to CORE.md: "Any feature involving payments, user data, or public communication should get findasale-legal review"

**3. findasale-support (Customer Support)**
- **Why underused:** Support only triggers when there's actual inbound issues. In pre-beta, rare.
- **Fix:** Post-beta, support will become active. Current scope is correct.
- **Assessment:** Not underused, just dormant until beta launches.

**4. findasale-cx (Customer Success & Beta Coordinator)**
- **Why underused:** Only relevant during beta. Won't activate until Patrick starts onboarding organizers.
- **Fix:** Once beta is live, findasale-cx becomes a high-frequency agent
- **Assessment:** Correctly scoped for future use.

---

### Single Most Important Change

**Add a one-page "How to Work with the Fleet" cheat sheet to the project root or link from CLAUDE.md.**

The fleet is comprehensive, but Patrick needs a fast way to say "I need an agent" without reading 12 SKILL.md files.

**Cheat sheet should include:**
1. **Agent quick-reference table** (task type → agent name + top trigger phrase)
2. **When NOT to use an agent** (i.e., when to just do it yourself)
3. **When to use multiple agents** (e.g., findasale-ux THEN findasale-dev for new features)
4. **Meta-agents** (findasale-records, findasale-workflow, context-maintenance, health-scout)
5. **Scheduled tasks** that run automatically (no trigger needed)

**Example structure:**
```
# Quick Agent Reference

## Feature Development
→ findasale-ux (design) → findasale-architect (architecture) → findasale-dev (code) → findasale-qa (test)

## Operations
→ findasale-ops (troubleshooting) | findasale-deploy (pre-ship checklist)

## Growth & Marketing
→ findasale-rd (research) → findasale-marketing (content) → findasale-cx (activation)

## Meta & Governance
→ findasale-records (docs & rules) | findasale-workflow (efficiency) | health-scout (proactive scan)
```

This saves Patrick from having to remember which agent owns what.

---

## Concrete Recommendations

### Immediate (next session)

**1. Create "Quick Agent Reference" cheat sheet**
- File: `AGENT_QUICK_REFERENCE.md` or add to top of CLAUDE.md
- Include table mapping task types → agents
- Include "when to trigger multiple agents" patterns
- **Owner:** findasale-records (Tier 2 file)
- **Priority:** HIGH
- **Effort:** 15 minutes

**2. Update CORE.md to reference the fleet**
- Add "Agent Fleet" section early in the file
- Link to each agent's description with key trigger phrases
- Add troubleshooting: "If you're not sure which agent to use..."
- **Owner:** findasale-records (Tier 1 file)
- **Priority:** HIGH
- **Effort:** 30 minutes

**3. Consolidate findasale-workflow-review and findasale-workflow-retrospective**
- Merge into single monthly task on the 8th
- Remove bi-weekly task
- **Owner:** findasale-records (Tier 1 change — scheduled task governance)
- **Priority:** MEDIUM
- **Effort:** 10 minutes

### Near-term (within 2 sessions)

**4. Create "Scheduled Task Status Log"**
- File: `claude_docs/scheduled-task-log.md`
- Track pass/fail for each automated task
- Patrick sees it at session start
- **Owner:** context-maintenance (update SESSION START PROTOCOL)
- **Priority:** MEDIUM
- **Effort:** 30 minutes

**5. Add findasale-legal to pre-deploy checklist**
- findasale-deploy should trigger findasale-legal before shipping beta features
- Add to deployment checklist: "☐ findasale-legal compliance review passed"
- **Owner:** findasale-deploy (skill SKILL.md edit)
- **Priority:** MEDIUM
- **Effort:** 15 minutes

**6. Consolidate market intelligence scheduled tasks**
- Merge findasale-competitor-monitor + weekly-industry-intel into one
- Run once per week (Monday 8am)
- **Owner:** findasale-records (scheduled task governance)
- **Priority:** LOW
- **Effort:** 10 minutes

### Future (post-beta or next month)

**7. Add agent self-improvement detection to findasale-workflow**
- Monthly workflow review should scan each agent's recent handoffs
- Flag any patterns of repeated gaps (e.g., "I keep hitting this issue but have no guidance")
- Proactively propose findasale-records Tier 1 change
- **Owner:** findasale-workflow
- **Priority:** LOW (pattern detection; high value when activated)
- **Effort:** 30 minutes

**8. Create in-app feedback collection for findasale-cx**
- Currently relies on manual outreach — doesn't scale post-beta
- Consider lightweight survey/NPS collection
- **Owner:** findasale-cx (future scope expansion)
- **Priority:** LOW (post-beta)
- **Effort:** Architectural decision needed

**9. Add "data quality & seed" agent (optional)**
- findasale-data (lightweight) for test data consistency
- Lower priority — rare use case
- **Owner:** findasale-records (if approved)
- **Priority:** LOW
- **Effort:** 1-2 hours to spec + package

---

## Final Assessment

### Overall Fleet Health: A-

**Strengths:**
- Role separation is clear and logical
- Triggering descriptions are specific and action-oriented
- Governance model (Tier 1/2/3) prevents silent rule drift
- Self-improvement loop ensures skills stay current
- findasale-workflow encodes Patrick's real working style

**Weaknesses:**
- 11 scheduled tasks is overhead; can be consolidated
- Cheat sheet missing (Patrick has to scan 12 files to find the right agent)
- Some agents underused until features activate (findasale-support, findasale-cx) — this is OK, but should be noted
- findasale-records is a single bottleneck (intentional, but worth monitoring)

**Risks:**
- If Patrick doesn't know about a specific agent, he'll do the work directly instead of triggering it
- Scheduled tasks run without supervision; a bad recommendation might not be caught immediately
- Fleet is optimized for high-activity sessions; lighter sessions might not get enough agent involvement

**Mitigation:**
- Quick reference cheat sheet solves the "which agent?" problem
- Scheduled task logging reveals silent failures
- findasale-workflow proactively audits for underuse and recommends triggering

### Readiness for Beta Launch

The fleet is **ready to support beta launch** with one caveat:

- **Current state:** All operational/development agents are tuned and ready (findasale-dev, findasale-qa, findasale-architect, findasale-ops)
- **Ready to activate:** findasale-cx (onboarding), findasale-support (support), findasale-legal (compliance review)
- **Nice to have:** findasale-workflow (meta-optimization) — can run weekly but not critical to launch

Recommendation: Launch beta with the core 6 agents (dev, qa, architect, ops, records, deploy). Activate findasale-cx when the first organizers arrive. Keep findasale-workflow running monthly to continuously improve the system.

---

## Summary

The 12-agent subagent fleet is **well-designed, comprehensive, and ready for production use.** The greatest immediate value will come from making the fleet **discoverable** — adding a one-page cheat sheet so Patrick doesn't have to scan 12 SKILL.md files to know which agent to trigger. The Tier 1/2/3 governance model is elegant and prevents drift. The self-improvement loop ensures skills stay current as the project evolves.

The single most important next step: **Publish the agent quick-reference cheat sheet.** This removes friction and ensures the fleet is actually used as designed.

