# Operations

How to run the platform. Dev environment, deployment, execution rules, and operational guidance.

## Contents

- **DEVELOPMENT.md** — Dev environment quickstart. Native Windows stack setup, dependency installation, running backend/frontend/database locally.
- **OPS.md** — Operational procedures. Stripe rotation, database backups, deployment checklists, incident response steps.
- **model-routing.md** — Claude model selection strategy. When to use Haiku vs Sonnet vs Opus. Cost-efficiency rules.
- **session-safeguards.md** — Hard limits on execution. Max fix attempts, rewrite budgets, error loop detection and escalation rules.
- **patrick-language-map.md** — Interpretation guide for Patrick's short commands ("check", "ok", "wrap", etc.). Command semantics and expected responses.
- **next-session-prompt.md** — Context handoff for the next session. Loaded at session start to provide continuity. Update at session wrap.

## Load Policy

Load when:
- Setting up dev environment or deploying to production
- Executing operations like Stripe management or database procedures
- Selecting models for sub-agents or new sessions
- Interpreting Patrick's short commands
- Preparing for next session handoff

## What Does NOT Belong Here

- Business strategy (that goes in strategy/)
- Historical logs or retrospectives (that goes in logs/)
- Completed audit reports (those go in archive/)
- Brand assets or documentation (those go in guides/)
