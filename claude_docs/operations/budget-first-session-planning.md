# Budget-First Session Planning — Token Allocation Protocol

**Status:** Active | **Updated:** 2026-03-11

---

## Purpose

Prevent token waste by planning work against available budget before starting. Track estimation accuracy to improve forecasting over time.

---

## Session Init Checklist

Before dispatching any work:

1. **Establish available budget** — Patrick tells you the session context limit (typically 150–200k).
2. **List planned work items** — What needs to happen this session?
3. **Estimate tokens per category** (see categories below).
4. **Sum estimates** — Compare total to available budget.
5. **Flag if >80%** — If planned work ≥80% of budget, ask Patrick to prioritize or defer.

---

## Token Estimate Categories

- **Survey work** (read existing docs, audit file structure): 5–10k
- **Targeted file edit** (single file, focused change): 3–8k per file
- **File read batch** (scan 100 lines, document overview): 1–2k per 100 lines
- **Subagent dispatch** (one agent invocation + context): 5–15k per agent
- **MCP push** (staged commit via `mcp__github__push_files`): 2–5k per call
- **Decision doc creation** (e.g., decisions-log.md entry): 2–4k
- **Skill creation/update** (new or modified skill file): 8–12k

---

## Planning Template

```
## This Session Budget Plan

Available budget: [X]k tokens
Target threshold: 80% = [Y]k tokens

| Work Item | Category | Est. Tokens | Notes |
|-----------|----------|-------------|-------|
| [Item 1]  | [Cat]    | [#]k        | [brief context] |
| [Item 2]  | [Cat]    | [#]k        | ... |
| **Total** | | **[TOTAL]k** | [Flag if >Y] |

Cuts if needed: [defer which item?]
```

---

## Outcome-Bucketed Delta Tracking

After each session, compare actual vs. estimate and categorize:

- **succeeded-on-plan**: Actual tokens within ±20% of estimate → healthy
- **over-plan**: Actual >120% of estimate → investigate friction (unexpected deep reads, extra agent dispatches, tooling failures)
- **succeeded-after-retry**: Actual within 20% but required extra attempts → log what failed on first try
- **under-plan**: Actual <80% of estimate → document what was cut or why it was faster

Store deltas in `.checkpoint-manifest.json` under `sessionHistory[...].budgetDelta`:

```json
{
  "sessionId": "session-97",
  "budgetEstimate": 80000,
  "budgetActual": 78500,
  "budgetDelta": {
    "category": "succeeded-on-plan",
    "variance": -1.9,
    "note": "File reads took less time than expected — content well-organized"
  }
}
```

---

## Accuracy Target

- **Within 60 sessions:** ±10% accuracy (90th percentile of deltas within ±10 percentage points)
- **Feedback loop:** If accuracy drops below 70%, revisit category estimates
- **Seasonal adjustment:** Track variance by work type (deep dives vs. quick edits) and adjust estimates quarterly

---

## When to Abort & Defer

- Planned work estimate >90% of available budget → defer to next session
- Mid-session over-run (actual tokens burn >120% of planned) → stop, summarize what's done, defer remainder
- Patrick says budget is tight → ask what's P0; defer non-urgent items

