# Trial & Rollback Protocol — Feature & Agent Validation

**Status:** Active | **Updated:** 2026-03-11

---

## Purpose

New agents and processes are risky. This protocol validates them with a bounded trial period and defines how to roll them back cleanly if they fail.

---

## Trial Setup

Every new agent or process change gets a **2-week trial period** starting from creation date.

At creation, document:
1. **What is being trialed** (agent name, process change, tool)
2. **Explicit rollback plan** — List exact files to delete/revert, commands to run
3. **Success metrics** — What counts as "working"? (no failed dispatches, measurable productivity gain, Patrick's confidence)
4. **Trial start date** and target end date

**Current Phase 2 Trial Roster** (all started 2026-03-11):
- `sales-ops` agent — 2-week trial
- `devils-advocate` agent — 2-week trial
- `steelman` agent — 2-week trial
- `investor` agent — 2-week trial
- `competitor` agent — 2-week trial

---

## Daily Friction Audit

The `findasale-workflow` skill runs daily and audits all active trials:

- Scans session logs for agent failures, errors, rework cycles
- Checks for Patrick complaints ("this isn't working")
- Summarizes trial health in operations log

---

## Rollback Triggers

Automatic rollback if:

1. **Agent causes ≥2 failed dispatches** (agent returns error or produces unusable output)
2. **Process adds overhead without measurable benefit** (e.g., new approval gate blocks 30% of decisions, no quality gain)
3. **Patrick explicitly says "this isn't working"** (anytime, override everything)

---

## Rollback Procedure

When rollback is triggered:

1. **findasale-records documents the failure:**
   - What was tried, how long (dates)
   - Specific failures observed
   - Why it didn't work

2. **findasale-dev reverts files:**
   - Delete agent from `packages/agents/`
   - Revert any config changes in STATE.md
   - Remove trial entry from `.checkpoint-manifest.json`

3. **Innovation receives post-mortem:**
   - File written to `claude_docs/operations/trial-rollback-YYYY-MM-DD.md`
   - Feeds into next innovation cycle planning

---

## Post-Mortem Template

```markdown
# Trial Rollback: [Agent/Process Name] — [Date]

**Trial period:** [Start] to [End] ([# days])

## What Was Tried
[Description of agent or process]

## Why It Failed
[Specific failure mode(s) — dispatches, overhead, friction]

## What We Learned
[Key insight from failure — what to avoid, what to try differently]

## What To Try Next
[Suggestion for iteration or alternative approach]
```

---

## Success = Promotion to Permanent

If trial completes without rollback:

- Remove trial flag from STATE.md
- Promote to permanent operations (same location, no config change)
- Log as "trial-to-production" in session log
- Celebrate — it worked!

