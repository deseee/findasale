# Next Session Resume Prompt
*Written: 2026-03-09 — Session 103 wrap*
*Session ended: normally*

## Resume From

Start **Session 104 — Fleet Self-Audit Loop**. Every subagent audits itself and the rest of the fleet. The goal is to make the agents smarter, tighter, and better coordinated before the Bug Blitz.

## Context

Session 103 was the evaluation checkpoint. Verdict: Option C. The loop delivered infrastructure and rules, but agents haven't stress-tested themselves against real usage. This session fixes that from the inside out.

## Session 104 Objective

**Each active subagent audits:**
1. **Themselves** — Is my SKILL.md accurate? Are my triggers right? Am I missing capabilities I should have? Am I claiming capabilities I don't actually have?
2. **Other agents** — Do handoff patterns between me and related agents make sense? Are there gaps where no agent owns a task type? Overlaps where two agents compete for the same trigger?
3. **Plugins** — Are the enabled generic plugins (marketing, engineering, product-management, etc.) competing with or complementing the FindA.Sale-specific agents? Are any plugins actively harmful (confusing triggers, duplicate outputs)?
4. **Scheduled tasks** — Are the current scheduled tasks still relevant? Are there tasks that SHOULD be scheduled but aren't?
5. **conversation-defaults** — Does anything in the 8 rules conflict with how you actually work? Suggest refinements.

## Execution Order

Run these as sequential Skill invocations. Each agent reads MESSAGE_BOARD.json before starting and posts findings on completion.

**Round 1 — Core agents self-audit (each produces a structured findings doc):**

1. `findasale-workflow` — audit self + conversation-defaults + CORE.md behavioral rules
2. `cowork-power-user` — audit self + all plugin categories (active/inactive/redundant)
3. `findasale-records` — audit self + all skill SKILL.md files for accuracy/staleness
4. `health-scout` — audit self + audit-coverage-checklist.md for completeness
5. `findasale-architect` — audit self + cross-agent contract gaps (who owns what)

**Round 2 — Specialist agents self-audit:**

6. `findasale-dev` — audit self + handoff patterns with qa, architect, ops
7. `findasale-qa` — audit self + handoff patterns with dev, health-scout
8. `findasale-hacker` — audit self (new agent — first real use) + red-team the agent fleet itself
9. `findasale-pitchman` — audit self (new agent — first real use) + identify fleet capability gaps as opportunities
10. `findasale-advisory-board` — audit self (new agent — first real use) + give cross-fleet verdict

**Round 3 — Synthesis (orchestrator, no skill):**

11. Compile all findings into `claude_docs/operations/fleet-self-audit-2026-03-09.md`
12. Produce ranked improvement list (P0–P3)
13. Update BACKLOG_2026-03-08.md with any new items from audit
14. Update individual SKILL.md files for any critical corrections found
15. Update next-session-prompt.md for Session 105 (Bug Blitz — now with better-calibrated team)

## What Each Agent Should Produce

Structured findings in this format:

```
## [Agent Name] Self-Audit

### What's Working
- [list]

### What's Stale or Wrong
- [specific text in my SKILL.md that needs fixing]
- [triggers that are too broad/narrow]
- [missing capabilities]

### Cross-Agent Observations
- [gaps between me and adjacent agents]
- [overlap/conflict with other agents]

### Plugin Assessment (if cowork-power-user)
- [plugin: keep/disable/modify + reason]

### Recommended Changes
- [specific edits to my SKILL.md]
- [specific edits to other agents]
- [new rules for conversation-defaults or CORE.md]
```

## Deliverables

1. `claude_docs/operations/fleet-self-audit-2026-03-09.md` — compiled findings from all 10 agents
2. Updated SKILL.md files for any P0/P1 corrections
3. Updated BACKLOG_2026-03-08.md — new improvement items added
4. Updated conversation-defaults if any rule refinements warranted
5. SESSION 105 next-session-prompt → Bug Blitz (now with calibrated fleet)

## After Session 104

- Session 105: Bug Blitz — P0 bugs (A3.1/A3.2 photo upload, A1.1/A1.2 map pins, A2.1 mobile menu, A3.6 server error, A3.7 camera) + A4.1 Dashboard audit

## Patrick Actions Still Pending

1. Install `conversation-defaults-updated.skill` (already presented in Session 103 chat)
2. Push session 96–103 files via `.\push.ps1`
3. Add `MAILERLITE_API_KEY` to Railway
4. Run Neon migration `20260310000001`
5. Optional: Connect Sentry MCP, GitHub Actions in Cowork settings
