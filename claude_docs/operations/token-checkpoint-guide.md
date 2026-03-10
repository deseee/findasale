# Token Checkpoint Guide

**Date created:** 2026-03-09 (Session 116)
**Implemented from:** `operations/token-tracking-feasibility.md`

---

## Why This Exists

Context window surprise-compressions cost ~20% of session tokens. Checkpoint
logging costs ~30 tokens per session (0.015%). The math is clear.

---

## Session Budget

| Threshold | Tokens | Action |
|-----------|--------|--------|
| Window size | 200,000 | Total available |
| Init overhead | ~5,000 | CORE.md + CLAUDE.md + context files |
| Available for work | ~195,000 | Announce at session start |
| Warning threshold | 170,000 used | Pause and plan wrap |
| Hard stop | 190,000 used | Wrap immediately, no new tasks |

---

## Checkpoint Format

```
[CHECKPOINT — Turn N]
  Files read: X (est. Yk tokens)
  Tool calls: Z (est. Wk tokens)
  Session total: ~Vk / 200k (P%)
  Next: [subagent batch / wrap / continue]
```

---

## When to Log

- After any file read batch (3+ files)
- After each subagent dispatch (5k baseline per agent)
- At Turn 5 (early calibration)
- Before session wrap (final burn)
- When burn rate feels high

---

## Token Estimation Formulas

| Operation | Estimate |
|-----------|----------|
| File read (per 100 lines) | 15 tokens |
| Grep result | 5 tokens per match |
| GitHub API response | 2k min + 500 per file |
| Subagent output | 5k baseline |
| System/instruction overhead | ~5k (constant per session) |

---

## Subagent Capacity Rule

Keep ≤4 agents per parallel batch. Token cost per agent varies 1k–15k depending
on scope. If remaining budget is below 100k, limit to 2 agents per batch.

---

## Session Wrap — Log Format

Add to session-log.md entry:

```
**Token burn:** ~Xk tokens used (Y checkpoints logged)
```

---

## Opt-Out

Can be disabled per-session if Patrick is in a time crunch. Say "skip checkpoints
this session" and Claude will omit them. Budget briefing at init is still included.
