# E6: Steelman Method — Autonomous Execution Pattern

Created: Session 96 (2026-03-09)
Status: Active (available as workflow option)
Backlog ref: E6

---

## What Is It

A community-tested workflow for getting complex projects done in one shot
with minimal human intervention. Reported results: 30-minute uninterrupted
runs that one-shot complex projects.

## The 8-Step Process

### Phase 1: Planning (with Patrick)

1. **Brainstorm** — Discuss the problem space, not solutions. What needs to happen?
2. **Claude writes the build plan** — Detailed step-by-step execution plan.
3. **Iterate on the plan** — Patrick reviews, adjusts scope, confirms approach.

### Phase 2: Self-Review (Claude alone)

4. **Convert to autonomous instructions** — Rewrite the plan as self-contained
   execution instructions. Assume no human interaction during execution.
5. **Self-review** — Claude reads its own instructions and lists every issue,
   ambiguity, missing dependency, and potential failure point. (Typically
   surfaces 10-15 issues.)
6. **Steelman** — Claude argues AGAINST its own criticism. For each issue,
   ask: "Is this a real problem or a false alarm?" Kills ~50% of flagged issues.
7. **Apply surviving fixes** — Update the instructions with fixes for the
   real issues. Discard the false alarms.

### Phase 3: Execution

8. **Execute in a fresh context** — Start a new session (or `/clear`), load
   only the refined instructions, and run autonomously. No interruptions.

Optional: Run the steelman step a second time after fixes for extra rigor.

## When to Use It

- Large features spanning multiple files (Sprint-level work)
- Architecture changes affecting multiple packages
- Any task expected to take 20+ tool calls
- Pre-deploy verification sequences

## When NOT to Use It

- Quick bug fixes (< 5 tool calls)
- Documentation-only sessions
- Research tasks (inherently exploratory)
- Tasks where Patrick wants to stay in the loop

## Integration with Our Fleet

The steelman method can be combined with our agent fleet:

1. **Planning phase:** Use `findasale-architect` for the build plan.
2. **Self-review:** Use `findasale-qa` to review the plan for issues.
3. **Steelman:** Parent session argues against QA's findings.
4. **Execution:** Use `findasale-dev` with the refined plan.

## Model Selection Note

From forum advice: "Have Claude Opus 4.6 create a plan for each agent. Specify
the model for each agent — for some, Sonnet or Haiku is more than enough."

When steelmanning, always use the highest-quality model (Opus) for planning
and review. Execution can potentially use a lighter model. See E14 research
for model routing details.

## Template

When Patrick says "steelman this" or "use the steelman method":

```
Step 1: I'll write the execution plan.
Step 2: I'll self-review and list all issues.
Step 3: I'll argue against each issue (steelman).
Step 4: I'll apply surviving fixes.
Step 5: Ready for autonomous execution — confirm?
```
