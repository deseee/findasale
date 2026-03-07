# Logs & Context

Reference-only documents that track project state and session activity. These are secondary records — the primary source of truth is the codebase and active STATE.md.

## Contents

- **session-log.md** — Session-by-session activity log. Completed work, files changed, key decisions, blockers. Append-only historical record.
- **scheduled-task-log.md** — History of scheduled task runs (health checks, workflow reviews, etc.). Tracks automation execution.
- **BETA_CHECKLIST.md** — Pre-launch readiness items. Reference when preparing beta or major release (status: GO as of session 85).
- **SEED_SUMMARY.md** — Original project seeding notes and setup history. Reference for understanding initial architecture decisions.

## Load Policy

Load on demand only — NOT at session start (keep Tier 1 context lean):
- When debugging what happened in a past session
- When preparing handoff context for the next session
- When investigating historical decisions or blockers
- When tracking task automation history

Never treat these as source of truth. The codebase is authoritative.

## What Does NOT Belong Here

- Active operational guidance (that goes in operations/)
- Business strategy (that goes in strategy/)
- One-time audit reports (those go in archive/)
- Real-time project state (that goes in STATE.md, Tier 1)
