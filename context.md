# Dynamic Project Context
*Generated at 2026-03-29T11:57:31.618Z*
*Run `node scripts/update-context.js` on Windows to refresh.*

## Last Session
No recent session found in log.

## Health Status
Last scan: session-175-compaction-analysis-2026-03-15
See report for details.

## Environment
- GitHub CLI: ✗ not authenticated (not required when GitHub MCP is active — check MCP tools at session start)
- CLI tools: node
- Dev stack: native (backend/frontend/postgres run natively on Windows — no Docker)

## Signals
⚠ Env drift — in .env.example but missing from .env: 
⚠ 10+ TODO/FIXME markers in source (showing up to 5):
  /sessions/sweet-happy-franklin/mnt/FindaSale/packages/backend/src/controllers/appraisalController.ts:38:    // TODO: Add PAID_ADDON check if billing is wired
  /sessions/sweet-happy-franklin/mnt/FindaSale/packages/backend/src/controllers/authController.ts:422:    // TODO: Send email with reset link (non-blocking)
  /sessions/sweet-happy-franklin/mnt/FindaSale/packages/backend/src/controllers/heatmapController.ts:26:    // TODO: Validate lat/lng/zoom bounds if needed in Phase 2
  /sessions/sweet-happy-franklin/mnt/FindaSale/packages/backend/src/helpers/itemQueries.ts:43:// TODO: Make draftStatus String? (optional) or backfill NULLs before re-enabling.
  /sessions/sweet-happy-franklin/mnt/FindaSale/packages/backend/src/jobs/fraudDetectionJob.ts:23:    // TODO: Integrate with node-cron:

## Project File Tree
```
├── .checkpoint-manifest.json
├── .claude/
│   ├── hooks/ (1 files)
│   ├── settings.json
│   └── worktrees/
│       ├── agent-a149904c/
│       │   ├── .checkpoint-manifest.json
│       │   ├── .claude/
│       │   ├── .env.example
│       │   ├── .gitattributes
│       │   ├── .githooks/
│       │   │   ├── pre-commit
│       │   │   └── pre-push
│       │   ├── .gitignore
│       │   ├── .skills/
│       │   │   └── skills/
│       │   │       ├── conversation-defaults/
│       │   │       │   └── SKILL.md
│       │   │       ├── dev-environment/
│       │   │       │   └── SKILL.md
│       │   │       └── skill-creator/
│       │   │           └── SKILL.md
│       │   ├── CLAUDE.md
│       │   ├── INSTALL-conversation-defaults-SKILL.md
│       │   ├── INSTALL-push-coordinator-SKILL.md
│       │   ├── MESSAGE_BOARD.json
│       │   ├── README.md
│       │   ├── ai-config/
│       │   │   └── global-instructions.md
│       │   ├── camera-mode-mockup.jsx
│       │   ├── claude_docs/
│       │   │   ├── .last-wrap
│       │   │   ├── CORE.md
│       │   │   ├── RECOVERY.md
│       │   │   ├── SECURITY.md
│       │   │   ├── STACK.md
│       │   │   ├── STATE.md
│       │   │   ├── architecture/
│       │   │   │   ├── ADR-013-060-TEAMS-BUNDLE-SPEC.md
│       │   │   │   ├── ADR-017-019-BID-BOT-PASSKEY-SPEC.md
│       │   │   │   ├── ADR-030-046-069-AI-OFFLINE-SPEC.md
│       │   │   │   ├── ADR-040-044-048-HUBS-TRAIL-SPEC.md
│       │   │   │   ├── ADR-052-053-054-ENCYCLOPEDIA-AGGREGATOR-APPRAISAL-SPEC.md
│       │   │   │   ├── ADR-052-053-054-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-065-IMPLEMENTATION-PLAN.md
│       │   │   │   ├── ADR-065-PATRICK-DECISIONS.md
│       │   │   │   ├── ADR-065-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-068-COMMAND-CENTER-DASHBOARD.md
│       │   │   │   ├── ADR-068-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-068-SPRINT1-IMPLEMENTATION-SPEC.md
│       │   │   │   └── ADR-PHASE4-BRIEF.md
│       │   │   ├── archive/ (14 files)
│       │   │   ├── beta-launch/ (4 files)
│       │   │   ├── brand/ (9 files)
│       │   │   ├── competitor-intel/ (1 files)
│       │   │   ├── decisions-log.md
│       │   │   ├── escalation-log.md
│       │   │   ├── feature-decisions/
│       │   │   │   ├── FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md
│       │   │   │   ├── MANAGER_SUBAGENT_ARCHITECTURE.md
│       │   │   │   ├── PUSH_COORDINATOR_DELIVERY_SUMMARY.md
│       │   │   │   └── PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md
│       │   │   ├── feature-notes/ (14 files)
│       │   │   ├── health-reports/ (2 files)
│       │   │   ├── logs/ (2 files)
│       │   │   ├── next-session-brief.md
│       │   │   ├── next-session-prompt.md
│       │   │   ├── operations/ (28 files)
│       │   │   ├── research/ (5 files)
│       │   │   ├── self-healing/ (1 files)
│       │   │   ├── self_healing_skills.md
│       │   │   ├── session-log-archive.md
│       │   │   ├── session-log.md
│       │   │   ├── skills-package/ (27 files)
│       │   │   ├── strategy/ (5 files)
│       │   │   ├── ux-spotchecks/
│       │   │   │   └── add-items-ux-audit-2026-03-15.md
│       │   │   └── workflow-retrospectives/ (1 files)
│       │   ├── package.json
│       │   ├── packages/
│       │   │   ├── backend/
│       │   │   │   ├── .env.example
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── Dockerfile
│       │   │   │   ├── Dockerfile.production
│       │   │   │   ├── docs/
│       │   │   │   │   └── EMAIL_SMS_REMINDERS.md
│       │   │   │   ├── nodemon.json
│       │   │   │   ├── package.json
│       │   │   │   ├── src/
│       │   │   │   │   ├── __tests__/
│       │   │   │   │   │   ├── emailReminders.e2e.ts
│       │   │   │   │   │   ├── stripe.e2e.ts
│       │   │   │   │   │   └── weeklyDigest.e2e.ts
│       │   │   │   │   ├── _triggerDigest.ts
│       │   │   │   │   ├── config/
│       │   │   │   │   │   └── regionConfig.ts
│       │   │   │   │   ├── controllers/ (92 files)
│       │   │   │   │   ├── helpers/
│       │   │   │   │   │   └── itemQueries.ts
│       │   │   │   │   ├── index.ts
│       │   │   │   │   ├── instrument.ts
│       │   │   │   │   ├── jobs/ (13 files)
│       │   │   │   │   ├── lib/ (7 files)
│       │   │   │   │   ├── middleware/ (5 files)
│       │   │   │   │   ├── models/ (1 files)
│       │   │   │   │   ├── routes/ (91 files)
│       │   │   │   │   ├── services/ (45 files)
│       │   │   │   │   ├── types/ (1 files)
│       │   │   │   │   └── utils/ (4 files)
│       │   │   │   └── tsconfig.json
│       │   │   ├── database/
│       │   │   │   ├── .env.example
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── index.ts
│       │   │   │   ├── package.json
│       │   │   │   ├── prisma/
│       │   │   │   │   ├── migrations/ (105 migrations)
│       │   │   │   │   ├── schema.prisma
│       │   │   │   │   └── seed.ts
│       │   │   │   └── tsconfig.json
│       │   │   ├── frontend/
│       │   │   │   ├── .env.local.example
│       │   │   │   ├── .gitignore
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── Dockerfile
│       │   │   │   ├── components/ (144 files)
│       │   │   │   ├── context/ (1 files)
│       │   │   │   ├── contexts/ (2 files)
│       │   │   │   ├── hooks/ (37 files)
│       │   │   │   ├── lib/ (8 files)
│       │   │   │   ├── next-env.d.ts
│       │   │   │   ├── next-sitemap.config.js
│       │   │   │   ├── next.config.js
│       │   │   │   ├── package.json
│       │   │   │   ├── pages/ (52 files)
│       │   │   │   ├── postcss.config.js
│       │   │   │   ├── public/ (6 files)
│       │   │   │   ├── sentry.client.config.ts
│       │   │   │   ├── sentry.edge.config.ts
│       │   │   │   ├── sentry.server.config.ts
│       │   │   │   ├── styles/ (2 files)
│       │   │   │   ├── tailwind.config.js
│       │   │   │   ├── tsconfig.json
│       │   │   │   ├── types/ (5 files)
│       │   │   │   └── utils/ (1 files)
│       │   │   └── shared/
│       │   │       ├── CLAUDE.md
│       │   │       ├── package.json
│       │   │       ├── src/
│       │   │       │   ├── constants/
│       │   │       │   │   └── tagVocabulary.ts
│       │   │       │   ├── index.ts
│       │   │       │   ├── tierGate.ts
│       │   │       │   └── types/ (1 files)
│       │   │       └── tsconfig.json
│       │   ├── pnpm-workspace.yaml
│       │   ├── push.ps1
│       │   ├── railway.toml
│       │   └── scripts/
│       │       ├── health-check.ts
│       │       ├── session-wrap-check.ps1
│       │       ├── session-wrap-check.sh
│       │       ├── statusline-token-usage.sh
│       │       ├── stress-test.js
│       │       └── update-context.js
│       ├── agent-a29f7731/
│       │   ├── .checkpoint-manifest.json
│       │   ├── .claude/
│       │   ├── .env.example
│       │   ├── .gitattributes
│       │   ├── .githooks/
│       │   │   ├── pre-commit
│       │   │   └── pre-push
│       │   ├── .gitignore
│       │   ├── .skills/
│       │   │   └── skills/
│       │   │       ├── conversation-defaults/
│       │   │       │   └── SKILL.md
│       │   │       ├── dev-environment/
│       │   │       │   └── SKILL.md
│       │   │       └── skill-creator/
│       │   │           └── SKILL.md
│       │   ├── CLAUDE.md
│       │   ├── INSTALL-conversation-defaults-SKILL.md
│       │   ├── INSTALL-push-coordinator-SKILL.md
│       │   ├── MESSAGE_BOARD.json
│       │   ├── README.md
│       │   ├── ai-config/
│       │   │   └── global-instructions.md
│       │   ├── camera-mode-mockup.jsx
│       │   ├── claude_docs/
│       │   │   ├── .last-wrap
│       │   │   ├── CORE.md
│       │   │   ├── RECOVERY.md
│       │   │   ├── SECURITY.md
│       │   │   ├── STACK.md
│       │   │   ├── STATE.md
│       │   │   ├── architecture/
│       │   │   │   ├── ADR-013-060-TEAMS-BUNDLE-SPEC.md
│       │   │   │   ├── ADR-017-019-BID-BOT-PASSKEY-SPEC.md
│       │   │   │   ├── ADR-030-046-069-AI-OFFLINE-SPEC.md
│       │   │   │   ├── ADR-040-044-048-HUBS-TRAIL-SPEC.md
│       │   │   │   ├── ADR-052-053-054-ENCYCLOPEDIA-AGGREGATOR-APPRAISAL-SPEC.md
│       │   │   │   ├── ADR-052-053-054-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-065-IMPLEMENTATION-PLAN.md
│       │   │   │   ├── ADR-065-PATRICK-DECISIONS.md
│       │   │   │   ├── ADR-065-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-068-COMMAND-CENTER-DASHBOARD.md
│       │   │   │   ├── ADR-068-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-068-SPRINT1-IMPLEMENTATION-SPEC.md
│       │   │   │   └── ADR-PHASE4-BRIEF.md
│       │   │   ├── archive/ (14 files)
│       │   │   ├── beta-launch/ (4 files)
│       │   │   ├── brand/ (9 files)
│       │   │   ├── competitor-intel/ (1 files)
│       │   │   ├── decisions-log.md
│       │   │   ├── escalation-log.md
│       │   │   ├── feature-decisions/
│       │   │   │   ├── FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md
│       │   │   │   ├── MANAGER_SUBAGENT_ARCHITECTURE.md
│       │   │   │   ├── PUSH_COORDINATOR_DELIVERY_SUMMARY.md
│       │   │   │   └── PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md
│       │   │   ├── feature-notes/ (14 files)
│       │   │   ├── health-reports/ (2 files)
│       │   │   ├── logs/ (2 files)
│       │   │   ├── next-session-brief.md
│       │   │   ├── next-session-prompt.md
│       │   │   ├── operations/ (28 files)
│       │   │   ├── research/ (5 files)
│       │   │   ├── self-healing/ (1 files)
│       │   │   ├── self_healing_skills.md
│       │   │   ├── session-log-archive.md
│       │   │   ├── session-log.md
│       │   │   ├── skills-package/ (27 files)
│       │   │   ├── strategy/ (5 files)
│       │   │   ├── ux-spotchecks/
│       │   │   │   └── add-items-ux-audit-2026-03-15.md
│       │   │   └── workflow-retrospectives/ (1 files)
│       │   ├── package.json
│       │   ├── packages/
│       │   │   ├── backend/
│       │   │   │   ├── .env.example
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── Dockerfile
│       │   │   │   ├── Dockerfile.production
│       │   │   │   ├── docs/
│       │   │   │   │   └── EMAIL_SMS_REMINDERS.md
│       │   │   │   ├── nodemon.json
│       │   │   │   ├── package.json
│       │   │   │   ├── src/
│       │   │   │   │   ├── __tests__/
│       │   │   │   │   │   ├── emailReminders.e2e.ts
│       │   │   │   │   │   ├── stripe.e2e.ts
│       │   │   │   │   │   └── weeklyDigest.e2e.ts
│       │   │   │   │   ├── _triggerDigest.ts
│       │   │   │   │   ├── config/
│       │   │   │   │   │   └── regionConfig.ts
│       │   │   │   │   ├── controllers/ (91 files)
│       │   │   │   │   ├── helpers/
│       │   │   │   │   │   └── itemQueries.ts
│       │   │   │   │   ├── index.ts
│       │   │   │   │   ├── instrument.ts
│       │   │   │   │   ├── jobs/ (13 files)
│       │   │   │   │   ├── lib/ (7 files)
│       │   │   │   │   ├── middleware/ (5 files)
│       │   │   │   │   ├── models/ (1 files)
│       │   │   │   │   ├── routes/ (90 files)
│       │   │   │   │   ├── services/ (45 files)
│       │   │   │   │   ├── types/ (1 files)
│       │   │   │   │   └── utils/ (4 files)
│       │   │   │   └── tsconfig.json
│       │   │   ├── database/
│       │   │   │   ├── .env.example
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── index.ts
│       │   │   │   ├── package.json
│       │   │   │   ├── prisma/
│       │   │   │   │   ├── migrations/ (105 migrations)
│       │   │   │   │   ├── schema.prisma
│       │   │   │   │   └── seed.ts
│       │   │   │   └── tsconfig.json
│       │   │   ├── frontend/
│       │   │   │   ├── .env.local.example
│       │   │   │   ├── .gitignore
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── Dockerfile
│       │   │   │   ├── components/ (142 files)
│       │   │   │   ├── context/ (1 files)
│       │   │   │   ├── contexts/ (2 files)
│       │   │   │   ├── hooks/ (36 files)
│       │   │   │   ├── lib/ (5 files)
│       │   │   │   ├── next-env.d.ts
│       │   │   │   ├── next-sitemap.config.js
│       │   │   │   ├── next.config.js
│       │   │   │   ├── package.json
│       │   │   │   ├── pages/ (52 files)
│       │   │   │   ├── postcss.config.js
│       │   │   │   ├── public/ (5 files)
│       │   │   │   ├── sentry.client.config.ts
│       │   │   │   ├── sentry.edge.config.ts
│       │   │   │   ├── sentry.server.config.ts
│       │   │   │   ├── styles/ (2 files)
│       │   │   │   ├── tailwind.config.js
│       │   │   │   ├── tsconfig.json
│       │   │   │   ├── types/ (5 files)
│       │   │   │   └── utils/ (1 files)
│       │   │   └── shared/
│       │   │       ├── CLAUDE.md
│       │   │       ├── package.json
│       │   │       ├── src/
│       │   │       │   ├── constants/
│       │   │       │   │   └── tagVocabulary.ts
│       │   │       │   ├── index.ts
│       │   │       │   ├── tierGate.ts
│       │   │       │   └── types/ (1 files)
│       │   │       └── tsconfig.json
│       │   ├── pnpm-workspace.yaml
│       │   ├── push.ps1
│       │   ├── railway.toml
│       │   └── scripts/
│       │       ├── health-check.ts
│       │       ├── session-wrap-check.ps1
│       │       ├── session-wrap-check.sh
│       │       ├── statusline-token-usage.sh
│       │       ├── stress-test.js
│       │       └── update-context.js
│       ├── agent-a2b4ad92/
│       │   ├── .checkpoint-manifest.json
│       │   ├── .claude/
│       │   ├── .env.example
│       │   ├── .gitattributes
│       │   ├── .githooks/
│       │   │   ├── pre-commit
│       │   │   └── pre-push
│       │   ├── .gitignore
│       │   ├── .skills/
│       │   │   └── skills/
│       │   │       ├── conversation-defaults/
│       │   │       │   └── SKILL.md
│       │   │       ├── dev-environment/
│       │   │       │   └── SKILL.md
│       │   │       └── skill-creator/
│       │   │           └── SKILL.md
│       │   ├── CLAUDE.md
│       │   ├── INSTALL-conversation-defaults-SKILL.md
│       │   ├── INSTALL-push-coordinator-SKILL.md
│       │   ├── MESSAGE_BOARD.json
│       │   ├── README.md
│       │   ├── ai-config/
│       │   │   └── global-instructions.md
│       │   ├── camera-mode-mockup.jsx
│       │   ├── claude_docs/
│       │   │   ├── .last-wrap
│       │   │   ├── CORE.md
│       │   │   ├── RECOVERY.md
│       │   │   ├── SECURITY.md
│       │   │   ├── STACK.md
│       │   │   ├── STATE.md
│       │   │   ├── architecture/
│       │   │   │   ├── ADR-013-060-TEAMS-BUNDLE-SPEC.md
│       │   │   │   ├── ADR-017-019-BID-BOT-PASSKEY-SPEC.md
│       │   │   │   ├── ADR-030-046-069-AI-OFFLINE-SPEC.md
│       │   │   │   ├── ADR-040-044-048-HUBS-TRAIL-SPEC.md
│       │   │   │   ├── ADR-052-053-054-ENCYCLOPEDIA-AGGREGATOR-APPRAISAL-SPEC.md
│       │   │   │   ├── ADR-052-053-054-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-065-IMPLEMENTATION-PLAN.md
│       │   │   │   ├── ADR-065-PATRICK-DECISIONS.md
│       │   │   │   ├── ADR-065-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-068-COMMAND-CENTER-DASHBOARD.md
│       │   │   │   ├── ADR-068-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-068-SPRINT1-IMPLEMENTATION-SPEC.md
│       │   │   │   └── ADR-PHASE4-BRIEF.md
│       │   │   ├── archive/ (14 files)
│       │   │   ├── beta-launch/ (4 files)
│       │   │   ├── brand/ (9 files)
│       │   │   ├── competitor-intel/ (1 files)
│       │   │   ├── decisions-log.md
│       │   │   ├── escalation-log.md
│       │   │   ├── feature-decisions/
│       │   │   │   ├── FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md
│       │   │   │   ├── MANAGER_SUBAGENT_ARCHITECTURE.md
│       │   │   │   ├── PUSH_COORDINATOR_DELIVERY_SUMMARY.md
│       │   │   │   └── PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md
│       │   │   ├── feature-notes/ (14 files)
│       │   │   ├── health-reports/ (2 files)
│       │   │   ├── logs/ (2 files)
│       │   │   ├── next-session-brief.md
│       │   │   ├── next-session-prompt.md
│       │   │   ├── operations/ (28 files)
│       │   │   ├── research/ (5 files)
│       │   │   ├── self-healing/ (1 files)
│       │   │   ├── self_healing_skills.md
│       │   │   ├── session-log-archive.md
│       │   │   ├── session-log.md
│       │   │   ├── skills-package/ (27 files)
│       │   │   ├── strategy/ (5 files)
│       │   │   ├── ux-spotchecks/
│       │   │   │   └── add-items-ux-audit-2026-03-15.md
│       │   │   └── workflow-retrospectives/ (1 files)
│       │   ├── package.json
│       │   ├── packages/
│       │   │   ├── backend/
│       │   │   │   ├── .env.example
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── Dockerfile
│       │   │   │   ├── Dockerfile.production
│       │   │   │   ├── docs/
│       │   │   │   │   └── EMAIL_SMS_REMINDERS.md
│       │   │   │   ├── nodemon.json
│       │   │   │   ├── package.json
│       │   │   │   ├── src/
│       │   │   │   │   ├── __tests__/
│       │   │   │   │   │   ├── emailReminders.e2e.ts
│       │   │   │   │   │   ├── stripe.e2e.ts
│       │   │   │   │   │   └── weeklyDigest.e2e.ts
│       │   │   │   │   ├── _triggerDigest.ts
│       │   │   │   │   ├── config/
│       │   │   │   │   │   └── regionConfig.ts
│       │   │   │   │   ├── controllers/ (91 files)
│       │   │   │   │   ├── helpers/
│       │   │   │   │   │   └── itemQueries.ts
│       │   │   │   │   ├── index.ts
│       │   │   │   │   ├── instrument.ts
│       │   │   │   │   ├── jobs/ (13 files)
│       │   │   │   │   ├── lib/ (7 files)
│       │   │   │   │   ├── middleware/ (5 files)
│       │   │   │   │   ├── models/ (1 files)
│       │   │   │   │   ├── routes/ (90 files)
│       │   │   │   │   ├── services/ (45 files)
│       │   │   │   │   ├── types/ (1 files)
│       │   │   │   │   └── utils/ (4 files)
│       │   │   │   └── tsconfig.json
│       │   │   ├── database/
│       │   │   │   ├── .env.example
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── index.ts
│       │   │   │   ├── package.json
│       │   │   │   ├── prisma/
│       │   │   │   │   ├── migrations/ (105 migrations)
│       │   │   │   │   ├── schema.prisma
│       │   │   │   │   └── seed.ts
│       │   │   │   └── tsconfig.json
│       │   │   ├── frontend/
│       │   │   │   ├── .env.local.example
│       │   │   │   ├── .gitignore
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── Dockerfile
│       │   │   │   ├── components/ (142 files)
│       │   │   │   ├── context/ (1 files)
│       │   │   │   ├── contexts/ (2 files)
│       │   │   │   ├── hooks/ (36 files)
│       │   │   │   ├── lib/ (5 files)
│       │   │   │   ├── next-env.d.ts
│       │   │   │   ├── next-sitemap.config.js
│       │   │   │   ├── next.config.js
│       │   │   │   ├── package.json
│       │   │   │   ├── pages/ (52 files)
│       │   │   │   ├── postcss.config.js
│       │   │   │   ├── public/ (5 files)
│       │   │   │   ├── sentry.client.config.ts
│       │   │   │   ├── sentry.edge.config.ts
│       │   │   │   ├── sentry.server.config.ts
│       │   │   │   ├── styles/ (2 files)
│       │   │   │   ├── tailwind.config.js
│       │   │   │   ├── tsconfig.json
│       │   │   │   ├── types/ (5 files)
│       │   │   │   └── utils/ (1 files)
│       │   │   └── shared/
│       │   │       ├── CLAUDE.md
│       │   │       ├── package.json
│       │   │       ├── src/
│       │   │       │   ├── constants/
│       │   │       │   │   └── tagVocabulary.ts
│       │   │       │   ├── index.ts
│       │   │       │   ├── tierGate.ts
│       │   │       │   └── types/ (1 files)
│       │   │       └── tsconfig.json
│       │   ├── pnpm-workspace.yaml
│       │   ├── push.ps1
│       │   ├── railway.toml
│       │   └── scripts/
│       │       ├── health-check.ts
│       │       ├── session-wrap-check.ps1
│       │       ├── session-wrap-check.sh
│       │       ├── statusline-token-usage.sh
│       │       ├── stress-test.js
│       │       └── update-context.js
│       ├── agent-a39344c2/
│       │   ├── .checkpoint-manifest.json
│       │   ├── .claude/
│       │   ├── .env.example
│       │   ├── .gitattributes
│       │   ├── .githooks/
│       │   │   ├── pre-commit
│       │   │   └── pre-push
│       │   ├── .gitignore
│       │   ├── .skills/
│       │   │   └── skills/
│       │   │       ├── conversation-defaults/
│       │   │       │   └── SKILL.md
│       │   │       ├── dev-environment/
│       │   │       │   └── SKILL.md
│       │   │       └── skill-creator/
│       │   │           └── SKILL.md
│       │   ├── CLAUDE.md
│       │   ├── INSTALL-conversation-defaults-SKILL.md
│       │   ├── INSTALL-push-coordinator-SKILL.md
│       │   ├── MESSAGE_BOARD.json
│       │   ├── README.md
│       │   ├── ai-config/
│       │   │   └── global-instructions.md
│       │   ├── camera-mode-mockup.jsx
│       │   ├── claude_docs/
│       │   │   ├── .last-wrap
│       │   │   ├── CORE.md
│       │   │   ├── RECOVERY.md
│       │   │   ├── SECURITY.md
│       │   │   ├── STACK.md
│       │   │   ├── STATE.md
│       │   │   ├── architecture/
│       │   │   │   ├── ADR-013-060-TEAMS-BUNDLE-SPEC.md
│       │   │   │   ├── ADR-017-019-BID-BOT-PASSKEY-SPEC.md
│       │   │   │   ├── ADR-030-046-069-AI-OFFLINE-SPEC.md
│       │   │   │   ├── ADR-040-044-048-HUBS-TRAIL-SPEC.md
│       │   │   │   ├── ADR-052-053-054-ENCYCLOPEDIA-AGGREGATOR-APPRAISAL-SPEC.md
│       │   │   │   ├── ADR-052-053-054-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-065-IMPLEMENTATION-PLAN.md
│       │   │   │   ├── ADR-065-PATRICK-DECISIONS.md
│       │   │   │   ├── ADR-065-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-068-COMMAND-CENTER-DASHBOARD.md
│       │   │   │   ├── ADR-068-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-068-SPRINT1-IMPLEMENTATION-SPEC.md
│       │   │   │   └── ADR-PHASE4-BRIEF.md
│       │   │   ├── archive/ (14 files)
│       │   │   ├── beta-launch/ (4 files)
│       │   │   ├── brand/ (9 files)
│       │   │   ├── competitor-intel/ (1 files)
│       │   │   ├── decisions-log.md
│       │   │   ├── escalation-log.md
│       │   │   ├── feature-decisions/
│       │   │   │   ├── FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md
│       │   │   │   ├── MANAGER_SUBAGENT_ARCHITECTURE.md
│       │   │   │   ├── PUSH_COORDINATOR_DELIVERY_SUMMARY.md
│       │   │   │   └── PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md
│       │   │   ├── feature-notes/ (14 files)
│       │   │   ├── health-reports/ (2 files)
│       │   │   ├── logs/ (2 files)
│       │   │   ├── next-session-brief.md
│       │   │   ├── next-session-prompt.md
│       │   │   ├── operations/ (28 files)
│       │   │   ├── research/ (5 files)
│       │   │   ├── self-healing/ (1 files)
│       │   │   ├── self_healing_skills.md
│       │   │   ├── session-log-archive.md
│       │   │   ├── session-log.md
│       │   │   ├── skills-package/ (27 files)
│       │   │   ├── strategy/ (5 files)
│       │   │   ├── ux-spotchecks/
│       │   │   │   └── add-items-ux-audit-2026-03-15.md
│       │   │   └── workflow-retrospectives/ (1 files)
│       │   ├── package.json
│       │   ├── packages/
│       │   │   ├── backend/
│       │   │   │   ├── .env.example
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── Dockerfile
│       │   │   │   ├── Dockerfile.production
│       │   │   │   ├── docs/
│       │   │   │   │   └── EMAIL_SMS_REMINDERS.md
│       │   │   │   ├── nodemon.json
│       │   │   │   ├── package.json
│       │   │   │   ├── src/
│       │   │   │   │   ├── __tests__/
│       │   │   │   │   │   ├── emailReminders.e2e.ts
│       │   │   │   │   │   ├── stripe.e2e.ts
│       │   │   │   │   │   └── weeklyDigest.e2e.ts
│       │   │   │   │   ├── _triggerDigest.ts
│       │   │   │   │   ├── config/
│       │   │   │   │   │   └── regionConfig.ts
│       │   │   │   │   ├── controllers/ (91 files)
│       │   │   │   │   ├── helpers/
│       │   │   │   │   │   └── itemQueries.ts
│       │   │   │   │   ├── index.ts
│       │   │   │   │   ├── instrument.ts
│       │   │   │   │   ├── jobs/ (13 files)
│       │   │   │   │   ├── lib/ (7 files)
│       │   │   │   │   ├── middleware/ (5 files)
│       │   │   │   │   ├── models/ (1 files)
│       │   │   │   │   ├── routes/ (90 files)
│       │   │   │   │   ├── services/ (45 files)
│       │   │   │   │   ├── types/ (1 files)
│       │   │   │   │   └── utils/ (4 files)
│       │   │   │   └── tsconfig.json
│       │   │   ├── database/
│       │   │   │   ├── .env.example
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── index.ts
│       │   │   │   ├── package.json
│       │   │   │   ├── prisma/
│       │   │   │   │   ├── migrations/ (105 migrations)
│       │   │   │   │   ├── schema.prisma
│       │   │   │   │   └── seed.ts
│       │   │   │   └── tsconfig.json
│       │   │   ├── frontend/
│       │   │   │   ├── .env.local.example
│       │   │   │   ├── .gitignore
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── Dockerfile
│       │   │   │   ├── components/ (142 files)
│       │   │   │   ├── context/ (1 files)
│       │   │   │   ├── contexts/ (2 files)
│       │   │   │   ├── hooks/ (36 files)
│       │   │   │   ├── lib/ (5 files)
│       │   │   │   ├── next-env.d.ts
│       │   │   │   ├── next-sitemap.config.js
│       │   │   │   ├── next.config.js
│       │   │   │   ├── package.json
│       │   │   │   ├── pages/ (52 files)
│       │   │   │   ├── postcss.config.js
│       │   │   │   ├── public/ (5 files)
│       │   │   │   ├── sentry.client.config.ts
│       │   │   │   ├── sentry.edge.config.ts
│       │   │   │   ├── sentry.server.config.ts
│       │   │   │   ├── styles/ (2 files)
│       │   │   │   ├── tailwind.config.js
│       │   │   │   ├── tsconfig.json
│       │   │   │   ├── types/ (5 files)
│       │   │   │   └── utils/ (1 files)
│       │   │   └── shared/
│       │   │       ├── CLAUDE.md
│       │   │       ├── package.json
│       │   │       ├── src/
│       │   │       │   ├── constants/
│       │   │       │   │   └── tagVocabulary.ts
│       │   │       │   ├── index.ts
│       │   │       │   ├── tierGate.ts
│       │   │       │   └── types/ (1 files)
│       │   │       └── tsconfig.json
│       │   ├── pnpm-workspace.yaml
│       │   ├── push.ps1
│       │   ├── railway.toml
│       │   └── scripts/
│       │       ├── health-check.ts
│       │       ├── session-wrap-check.ps1
│       │       ├── session-wrap-check.sh
│       │       ├── statusline-token-usage.sh
│       │       ├── stress-test.js
│       │       └── update-context.js
│       ├── agent-ad41a56d/
│       │   ├── .checkpoint-manifest.json
│       │   ├── .claude/
│       │   ├── .env.example
│       │   ├── .gitattributes
│       │   ├── .githooks/
│       │   │   ├── pre-commit
│       │   │   └── pre-push
│       │   ├── .gitignore
│       │   ├── .skills/
│       │   │   └── skills/
│       │   │       ├── conversation-defaults/
│       │   │       │   └── SKILL.md
│       │   │       ├── dev-environment/
│       │   │       │   └── SKILL.md
│       │   │       └── skill-creator/
│       │   │           └── SKILL.md
│       │   ├── CLAUDE.md
│       │   ├── INSTALL-conversation-defaults-SKILL.md
│       │   ├── INSTALL-push-coordinator-SKILL.md
│       │   ├── MESSAGE_BOARD.json
│       │   ├── README.md
│       │   ├── ai-config/
│       │   │   └── global-instructions.md
│       │   ├── camera-mode-mockup.jsx
│       │   ├── claude_docs/
│       │   │   ├── .last-wrap
│       │   │   ├── CORE.md
│       │   │   ├── RECOVERY.md
│       │   │   ├── SECURITY.md
│       │   │   ├── STACK.md
│       │   │   ├── STATE.md
│       │   │   ├── architecture/
│       │   │   │   ├── ADR-013-060-TEAMS-BUNDLE-SPEC.md
│       │   │   │   ├── ADR-017-019-BID-BOT-PASSKEY-SPEC.md
│       │   │   │   ├── ADR-030-046-069-AI-OFFLINE-SPEC.md
│       │   │   │   ├── ADR-040-044-048-HUBS-TRAIL-SPEC.md
│       │   │   │   ├── ADR-052-053-054-ENCYCLOPEDIA-AGGREGATOR-APPRAISAL-SPEC.md
│       │   │   │   ├── ADR-052-053-054-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-065-IMPLEMENTATION-PLAN.md
│       │   │   │   ├── ADR-065-PATRICK-DECISIONS.md
│       │   │   │   ├── ADR-065-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-068-COMMAND-CENTER-DASHBOARD.md
│       │   │   │   ├── ADR-068-QUICK-REFERENCE.md
│       │   │   │   ├── ADR-068-SPRINT1-IMPLEMENTATION-SPEC.md
│       │   │   │   └── ADR-PHASE4-BRIEF.md
│       │   │   ├── archive/ (14 files)
│       │   │   ├── beta-launch/ (4 files)
│       │   │   ├── brand/ (9 files)
│       │   │   ├── competitor-intel/ (1 files)
│       │   │   ├── decisions-log.md
│       │   │   ├── escalation-log.md
│       │   │   ├── feature-decisions/
│       │   │   │   ├── FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md
│       │   │   │   ├── MANAGER_SUBAGENT_ARCHITECTURE.md
│       │   │   │   ├── PUSH_COORDINATOR_DELIVERY_SUMMARY.md
│       │   │   │   └── PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md
│       │   │   ├── feature-notes/ (14 files)
│       │   │   ├── health-reports/ (2 files)
│       │   │   ├── logs/ (2 files)
│       │   │   ├── next-session-brief.md
│       │   │   ├── next-session-prompt.md
│       │   │   ├── operations/ (28 files)
│       │   │   ├── research/ (5 files)
│       │   │   ├── self-healing/ (1 files)
│       │   │   ├── self_healing_skills.md
│       │   │   ├── session-log-archive.md
│       │   │   ├── session-log.md
│       │   │   ├── skills-package/ (27 files)
│       │   │   ├── strategy/ (5 files)
│       │   │   ├── ux-spotchecks/
│       │   │   │   └── add-items-ux-audit-2026-03-15.md
│       │   │   └── workflow-retrospectives/ (1 files)
│       │   ├── package.json
│       │   ├── packages/
│       │   │   ├── backend/
│       │   │   │   ├── .env.example
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── Dockerfile
│       │   │   │   ├── Dockerfile.production
│       │   │   │   ├── docs/
│       │   │   │   │   └── EMAIL_SMS_REMINDERS.md
│       │   │   │   ├── nodemon.json
│       │   │   │   ├── package.json
│       │   │   │   ├── src/
│       │   │   │   │   ├── __tests__/
│       │   │   │   │   │   ├── emailReminders.e2e.ts
│       │   │   │   │   │   ├── stripe.e2e.ts
│       │   │   │   │   │   └── weeklyDigest.e2e.ts
│       │   │   │   │   ├── _triggerDigest.ts
│       │   │   │   │   ├── config/
│       │   │   │   │   │   └── regionConfig.ts
│       │   │   │   │   ├── controllers/ (91 files)
│       │   │   │   │   ├── helpers/
│       │   │   │   │   │   └── itemQueries.ts
│       │   │   │   │   ├── index.ts
│       │   │   │   │   ├── instrument.ts
│       │   │   │   │   ├── jobs/ (13 files)
│       │   │   │   │   ├── lib/ (7 files)
│       │   │   │   │   ├── middleware/ (5 files)
│       │   │   │   │   ├── models/ (1 files)
│       │   │   │   │   ├── routes/ (90 files)
│       │   │   │   │   ├── services/ (45 files)
│       │   │   │   │   ├── types/ (1 files)
│       │   │   │   │   └── utils/ (4 files)
│       │   │   │   └── tsconfig.json
│       │   │   ├── database/
│       │   │   │   ├── .env.example
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── index.ts
│       │   │   │   ├── package.json
│       │   │   │   ├── prisma/
│       │   │   │   │   ├── migrations/ (105 migrations)
│       │   │   │   │   ├── schema.prisma
│       │   │   │   │   └── seed.ts
│       │   │   │   └── tsconfig.json
│       │   │   ├── frontend/
│       │   │   │   ├── .env.local.example
│       │   │   │   ├── .gitignore
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── Dockerfile
│       │   │   │   ├── components/ (142 files)
│       │   │   │   ├── context/ (1 files)
│       │   │   │   ├── contexts/ (2 files)
│       │   │   │   ├── hooks/ (36 files)
│       │   │   │   ├── lib/ (5 files)
│       │   │   │   ├── next-env.d.ts
│       │   │   │   ├── next-sitemap.config.js
│       │   │   │   ├── next.config.js
│       │   │   │   ├── package.json
│       │   │   │   ├── pages/ (52 files)
│       │   │   │   ├── postcss.config.js
│       │   │   │   ├── public/ (5 files)
│       │   │   │   ├── sentry.client.config.ts
│       │   │   │   ├── sentry.edge.config.ts
│       │   │   │   ├── sentry.server.config.ts
│       │   │   │   ├── styles/ (2 files)
│       │   │   │   ├── tailwind.config.js
│       │   │   │   ├── tsconfig.json
│       │   │   │   ├── types/ (5 files)
│       │   │   │   └── utils/ (1 files)
│       │   │   └── shared/
│       │   │       ├── CLAUDE.md
│       │   │       ├── package.json
│       │   │       ├── src/
│       │   │       │   ├── constants/
│       │   │       │   │   └── tagVocabulary.ts
│       │   │       │   ├── index.ts
│       │   │       │   ├── tierGate.ts
│       │   │       │   └── types/ (1 files)
│       │   │       └── tsconfig.json
│       │   ├── pnpm-workspace.yaml
│       │   ├── push.ps1
│       │   ├── railway.toml
│       │   └── scripts/
│       │       ├── health-check.ts
│       │       ├── session-wrap-check.ps1
│       │       ├── session-wrap-check.sh
│       │       ├── statusline-token-usage.sh
│       │       ├── stress-test.js
│       │       └── update-context.js
│       └── agent-ada8ad64/
│           ├── .checkpoint-manifest.json
│           ├── .claude/
│           ├── .env.example
│           ├── .gitattributes
│           ├── .githooks/
│           │   ├── pre-commit
│           │   └── pre-push
│           ├── .gitignore
│           ├── .skills/
│           │   └── skills/
│           │       ├── conversation-defaults/
│           │       │   └── SKILL.md
│           │       ├── dev-environment/
│           │       │   └── SKILL.md
│           │       └── skill-creator/
│           │           └── SKILL.md
│           ├── CLAUDE.md
│           ├── INSTALL-conversation-defaults-SKILL.md
│           ├── INSTALL-push-coordinator-SKILL.md
│           ├── MESSAGE_BOARD.json
│           ├── README.md
│           ├── ai-config/
│           │   └── global-instructions.md
│           ├── camera-mode-mockup.jsx
│           ├── claude_docs/
│           │   ├── .last-wrap
│           │   ├── CORE.md
│           │   ├── RECOVERY.md
│           │   ├── SECURITY.md
│           │   ├── STACK.md
│           │   ├── STATE.md
│           │   ├── architecture/
│           │   │   ├── ADR-013-060-TEAMS-BUNDLE-SPEC.md
│           │   │   ├── ADR-017-019-BID-BOT-PASSKEY-SPEC.md
│           │   │   ├── ADR-030-046-069-AI-OFFLINE-SPEC.md
│           │   │   ├── ADR-040-044-048-HUBS-TRAIL-SPEC.md
│           │   │   ├── ADR-052-053-054-ENCYCLOPEDIA-AGGREGATOR-APPRAISAL-SPEC.md
│           │   │   ├── ADR-052-053-054-QUICK-REFERENCE.md
│           │   │   ├── ADR-065-IMPLEMENTATION-PLAN.md
│           │   │   ├── ADR-065-PATRICK-DECISIONS.md
│           │   │   ├── ADR-065-QUICK-REFERENCE.md
│           │   │   ├── ADR-068-COMMAND-CENTER-DASHBOARD.md
│           │   │   ├── ADR-068-QUICK-REFERENCE.md
│           │   │   ├── ADR-068-SPRINT1-IMPLEMENTATION-SPEC.md
│           │   │   └── ADR-PHASE4-BRIEF.md
│           │   ├── archive/ (14 files)
│           │   ├── beta-launch/ (4 files)
│           │   ├── brand/ (9 files)
│           │   ├── competitor-intel/ (1 files)
│           │   ├── decisions-log.md
│           │   ├── escalation-log.md
│           │   ├── feature-decisions/
│           │   │   ├── FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md
│           │   │   ├── MANAGER_SUBAGENT_ARCHITECTURE.md
│           │   │   ├── PUSH_COORDINATOR_DELIVERY_SUMMARY.md
│           │   │   └── PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md
│           │   ├── feature-notes/ (14 files)
│           │   ├── health-reports/ (2 files)
│           │   ├── logs/ (2 files)
│           │   ├── next-session-brief.md
│           │   ├── next-session-prompt.md
│           │   ├── operations/ (28 files)
│           │   ├── research/ (5 files)
│           │   ├── self-healing/ (1 files)
│           │   ├── self_healing_skills.md
│           │   ├── session-log-archive.md
│           │   ├── session-log.md
│           │   ├── skills-package/ (27 files)
│           │   ├── strategy/ (5 files)
│           │   ├── ux-spotchecks/
│           │   │   └── add-items-ux-audit-2026-03-15.md
│           │   └── workflow-retrospectives/ (1 files)
│           ├── package.json
│           ├── packages/
│           │   ├── backend/
│           │   │   ├── .env.example
│           │   │   ├── CLAUDE.md
│           │   │   ├── Dockerfile
│           │   │   ├── Dockerfile.production
│           │   │   ├── docs/
│           │   │   │   └── EMAIL_SMS_REMINDERS.md
│           │   │   ├── nodemon.json
│           │   │   ├── package.json
│           │   │   ├── src/
│           │   │   │   ├── __tests__/
│           │   │   │   │   ├── emailReminders.e2e.ts
│           │   │   │   │   ├── stripe.e2e.ts
│           │   │   │   │   └── weeklyDigest.e2e.ts
│           │   │   │   ├── _triggerDigest.ts
│           │   │   │   ├── config/
│           │   │   │   │   └── regionConfig.ts
│           │   │   │   ├── controllers/ (91 files)
│           │   │   │   ├── helpers/
│           │   │   │   │   └── itemQueries.ts
│           │   │   │   ├── index.ts
│           │   │   │   ├── instrument.ts
│           │   │   │   ├── jobs/ (13 files)
│           │   │   │   ├── lib/ (7 files)
│           │   │   │   ├── middleware/ (5 files)
│           │   │   │   ├── models/ (1 files)
│           │   │   │   ├── routes/ (90 files)
│           │   │   │   ├── services/ (45 files)
│           │   │   │   ├── types/ (1 files)
│           │   │   │   └── utils/ (4 files)
│           │   │   └── tsconfig.json
│           │   ├── database/
│           │   │   ├── .env.example
│           │   │   ├── CLAUDE.md
│           │   │   ├── index.ts
│           │   │   ├── package.json
│           │   │   ├── prisma/
│           │   │   │   ├── migrations/ (105 migrations)
│           │   │   │   ├── schema.prisma
│           │   │   │   └── seed.ts
│           │   │   └── tsconfig.json
│           │   ├── frontend/
│           │   │   ├── .env.local.example
│           │   │   ├── .gitignore
│           │   │   ├── CLAUDE.md
│           │   │   ├── Dockerfile
│           │   │   ├── components/ (142 files)
│           │   │   ├── context/ (1 files)
│           │   │   ├── contexts/ (2 files)
│           │   │   ├── hooks/ (36 files)
│           │   │   ├── lib/ (5 files)
│           │   │   ├── next-env.d.ts
│           │   │   ├── next-sitemap.config.js
│           │   │   ├── next.config.js
│           │   │   ├── package.json
│           │   │   ├── pages/ (52 files)
│           │   │   ├── postcss.config.js
│           │   │   ├── public/ (5 files)
│           │   │   ├── sentry.client.config.ts
│           │   │   ├── sentry.edge.config.ts
│           │   │   ├── sentry.server.config.ts
│           │   │   ├── styles/ (2 files)
│           │   │   ├── tailwind.config.js
│           │   │   ├── tsconfig.json
│           │   │   ├── types/ (5 files)
│           │   │   └── utils/ (1 files)
│           │   └── shared/
│           │       ├── CLAUDE.md
│           │       ├── package.json
│           │       ├── src/
│           │       │   ├── constants/
│           │       │   │   └── tagVocabulary.ts
│           │       │   ├── index.ts
│           │       │   ├── tierGate.ts
│           │       │   └── types/ (1 files)
│           │       └── tsconfig.json
│           ├── pnpm-workspace.yaml
│           ├── push.ps1
│           ├── railway.toml
│           └── scripts/
│               ├── health-check.ts
│               ├── session-wrap-check.ps1
│               ├── session-wrap-check.sh
│               ├── statusline-token-usage.sh
│               ├── stress-test.js
│               └── update-context.js
├── .env
├── .env.example
├── .gitattributes
├── .githooks/
│   ├── pre-commit
│   └── pre-push
├── .gitignore
├── .last-wrap
├── .skills/
│   ├── findasale-customer-champion/
│   │   └── SKILL.md
│   └── skills/
│       ├── conversation-defaults/
│       │   └── SKILL.md
│       ├── dev-environment/
│       │   └── SKILL.md
│       └── skill-creator/
│           └── SKILL.md
├── CLAUDE.md
├── README.md
├── _tmp_17008_08453a9272e81ddede29e697bc75df3b
├── _tmp_17008_68e99a0b6f56ac76db24afa22668ce8e
├── _tmp_19825_1b42f7f27018650a050acda6c56bb042
├── _tmp_19825_d4fa5d4bb5bbcc3577cc4308c8740ea3
├── _tmp_19859_73093acdfd3598bc12b5fbdbe206ea00
├── _tmp_19859_fde55055970563788e18f4d50f97d1b2
├── _tmp_20883_8b5e2c736d8eacfe7cfb63163610dc51
├── _tmp_20883_a5422550ee8c28a338c754488ad81595
├── _tmp_22214_a1f14e2eec910bab06aff6790baa32c2
├── _tmp_22214_b17ce583c13a1091e6e17065b84fc332
├── _tmp_23454_136d73c317eecddad0c5d2f0cd4d8b31
├── _tmp_23454_a4243f91b2825e163c03ddc29f0c635d
├── _tmp_79153_b78de4bad81704a77606cd957038642b
├── _tmp_79153_dd2c0afeeac46b8dda065f928d380dee
├── ai-config/
│   └── global-instructions.md
├── camera-mode-mockup.jsx
├── claude_docs/
│   ├── .last-wrap
│   ├── CORE.md
│   ├── RECOVERY.md
│   ├── S248-walkthrough-findings.md
│   ├── SECURITY.md
│   ├── STACK.md
│   ├── STATE.md
│   ├── UX_MODERNIZATION_SPEC.md
│   ├── UX_SPECS/
│   │   ├── save-wishlist-item-card.md
│   │   └── shopper_to_organizer_conversion_flow.md
│   ├── architecture/
│   │   ├── ADR-013-060-TEAMS-BUNDLE-SPEC.md
│   │   ├── ADR-017-019-BID-BOT-PASSKEY-SPEC.md
│   │   ├── ADR-030-046-069-AI-OFFLINE-SPEC.md
│   │   ├── ADR-040-044-048-HUBS-TRAIL-SPEC.md
│   │   ├── ADR-052-053-054-ENCYCLOPEDIA-AGGREGATOR-APPRAISAL-SPEC.md
│   │   ├── ADR-052-053-054-QUICK-REFERENCE.md
│   │   ├── ADR-065-IMPLEMENTATION-PLAN.md
│   │   ├── ADR-065-PATRICK-DECISIONS.md
│   │   ├── ADR-065-QUICK-REFERENCE.md
│   │   ├── ADR-068-COMMAND-CENTER-DASHBOARD.md
│   │   ├── ADR-068-QUICK-REFERENCE.md
│   │   ├── ADR-068-SPRINT1-IMPLEMENTATION-SPEC.md
│   │   ├── ADR-PHASE4-BRIEF.md
│   │   ├── ADR-roadmap-batch-d-72-75.md
│   │   ├── BATCH-D-SUMMARY.md
│   │   ├── ItemCard-Unification-Spec.md
│   │   ├── adr-072-dual-role-account-schema.md
│   │   ├── adr-073-two-channel-notification-system.md
│   │   ├── feature-spec-73-notifications.md
│   │   ├── feature-spec-75-tier-lapse-logic.md
│   │   ├── feature-specs-26-29-favorites-messages.md
│   │   └── subagent-doc-recommendations-2026-03-22.md
│   ├── archive/ (35 files)
│   ├── audits/
│   │   ├── CHROME-AUDIT-SESSION-208-SUMMARY.md
│   │   ├── INDEX-2026-03-20.md
│   │   ├── QUICK-REFERENCE-QA-2026-03-20.md
│   │   ├── README-QA-SESSION-2026-03-20.md
│   │   ├── accessibility-audit-2026-03-18.md
│   │   ├── brand-drift-2026-03-24.md
│   │   ├── business-plan-brand-review-2026-03-19.md
│   │   ├── chrome-audit-2026-03-20-roadmap-updates.md
│   │   ├── chrome-audit-2026-03-20.md
│   │   ├── chrome-audit-comprehensive-S211.md
│   │   ├── chrome-live-audit-2026-03-20-CHECKLIST.md
│   │   ├── chrome-live-audit-2026-03-20.md
│   │   ├── chrome-secondary-routes-s216.md
│   │   ├── create-sale-verify-s216.md
│   │   ├── design-critique-2026-03-18.md
│   │   ├── doc-structure-audit-2026-03-22.md
│   │   ├── frontend-pages-inventory-S294.html
│   │   ├── organizer-happy-path-s216.md
│   │   ├── passkey-qa-audit-s200.md
│   │   ├── periodic-docs-audit-2026-03-18.md
│   │   ├── qa-audit-S236-live.md
│   │   ├── qa-findings-B2-organizer-profile-20260325.md
│   │   ├── qa-findings-B3-item-management-20260325.md
│   │   ├── qa-findings-C4-public-pages-20260325.md
│   │   ├── qa-findings-D1-priority-retests-20260325.md
│   │   ├── qa-findings-D3-shopper-discovery-20260325.md
│   │   ├── qa-round2-S288-20260325.md
│   │   ├── qa-round3-S288-20260325.md
│   │   ├── qa-round4-S288-20260325.md
│   │   ├── records-audit-2026-03-22.md
│   │   ├── roadmap-audit-S294.md
│   │   ├── s222-qa-audit.md
│   │   ├── s227-qa-audit.md
│   │   ├── s290-qa-retroaudit-s285-s289.md
│   │   ├── ux-audit-nav-overload-2026-03-18.md
│   │   ├── weekly-audit-2026-03-22.md
│   │   └── weekly-audit-2026-03-26.md
│   ├── beta-launch/ (5 files)
│   ├── brand/ (11 files)
│   ├── brand-voice/
│   │   └── COLLECTORS_GUILD_BRAND_VOICE.md
│   ├── competitor-intel/ (4 files)
│   ├── decisions-log.md
│   ├── escalation-log.md
│   ├── feature-decisions/
│   │   ├── CAMERA_WORKFLOW_V2_ARCHITECTURE.md
│   │   ├── CASH_FEE_COLLECTION_ARCHITECTURE.md
│   │   ├── CASH_FEE_COLLECTION_SUMMARY.md
│   │   ├── D2-tier-lapse-behavior.md
│   │   ├── FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md
│   │   ├── GAMIFICATION_IMPLEMENTATION_CHECKLIST_PHASE1.md
│   │   ├── MANAGER_SUBAGENT_ARCHITECTURE.md
│   │   ├── PUSH_COORDINATOR_DELIVERY_SUMMARY.md
│   │   ├── PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md
│   │   ├── advisory-board-S236-print-kit-etsy.md
│   │   └── demo-readiness-plan-S236.md
│   ├── feature-notes/ (21 files)
│   ├── guides/ (1 files)
│   ├── handoffs/
│   │   └── 125_csv_export_handoff.md
│   ├── health-reports/ (9 files)
│   ├── human-QA-walkthrough-findings.md
│   ├── improvement-memos/ (2 files)
│   ├── logs/ (3 files)
│   ├── marketing/
│   │   └── content-pipeline/
│   │       ├── content-2026-03-23.md
│   │       └── content-2026-03-26.md
│   ├── next-session-brief.md
│   ├── next-session-prompt.md
│   ├── operations/ (61 files)
│   ├── patrick-dashboard.md
│   ├── patrick-walkthrough-S248.md
│   ├── research/ (37 files)
│   ├── self-healing/ (1 files)
│   ├── session-log.md
│   ├── skill-updates/
│   │   ├── findasale-dev-SKILL.md
│   │   └── findasale-qa-SKILL.md
│   ├── skills-package/ (49 files)
│   ├── strategy/ (19 files)
│   ├── ux-audits/
│   │   └── explorer-guild-phase2-audit.md
│   ├── ux-spotchecks/
│   │   ├── 2026-03-25.md
│   │   ├── PROMOTE_PAGE_UX_SPEC.md
│   │   ├── S256-UX-HANDOFF.md
│   │   ├── S256-UX-SPECS-41-items-onboarding.md
│   │   ├── add-items-ux-audit-2026-03-15.md
│   │   ├── comprehensive-frontend-audit-2026-03-20.md
│   │   ├── design-polish-vision-2026-03-19.md
│   │   ├── nav-dashboard-consolidation-2026-03-20.md
│   │   └── ux-audit-S236.md
│   └── workflow-retrospectives/ (3 files)
├── conversation-defaults-SKILL-v8.md.tmp.35852.1773930503120
├── frontend-pages-inventory-S294.html
├── next
├── package-lock.json
├── package.json
├── packages/
│   ├── backend/
│   │   ├── .env
│   │   ├── .env.example
│   │   ├── CLAUDE.md
│   │   ├── Dockerfile
│   │   ├── Dockerfile.production
│   │   ├── dist/
│   │   │   ├── _triggerDigest.js
│   │   │   ├── config/
│   │   │   │   └── regionConfig.js
│   │   │   ├── constants/
│   │   │   │   └── tierLimits.js
│   │   │   ├── controllers/ (105 files)
│   │   │   ├── helpers/
│   │   │   │   └── itemQueries.js
│   │   │   ├── index.js
│   │   │   ├── instrument.js
│   │   │   ├── jobs/ (19 files)
│   │   │   ├── lib/ (12 files)
│   │   │   ├── middleware/ (12 files)
│   │   │   ├── models/ (1 files)
│   │   │   ├── routes/ (98 files)
│   │   │   ├── services/ (56 files)
│   │   │   ├── types/ (1 files)
│   │   │   └── utils/ (5 files)
│   │   ├── docs/
│   │   │   └── EMAIL_SMS_REMINDERS.md
│   │   ├── nodemon.json
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── __tests__/
│   │   │   │   ├── emailReminders.e2e.ts
│   │   │   │   ├── stripe.e2e.ts
│   │   │   │   ├── typologyClassifier.integration.ts
│   │   │   │   └── weeklyDigest.e2e.ts
│   │   │   ├── _triggerDigest.ts
│   │   │   ├── config/
│   │   │   │   └── regionConfig.ts
│   │   │   ├── constants/
│   │   │   │   └── tierLimits.ts
│   │   │   ├── controllers/ (105 files)
│   │   │   ├── helpers/
│   │   │   │   └── itemQueries.ts
│   │   │   ├── index.ts
│   │   │   ├── instrument.ts
│   │   │   ├── jobs/ (19 files)
│   │   │   ├── lib/ (12 files)
│   │   │   ├── middleware/ (12 files)
│   │   │   ├── models/ (1 files)
│   │   │   ├── routes/ (99 files)
│   │   │   ├── services/ (56 files)
│   │   │   ├── types/ (1 files)
│   │   │   └── utils/ (5 files)
│   │   └── tsconfig.json
│   ├── database/
│   │   ├── .env
│   │   ├── .env.example
│   │   ├── CLAUDE.md
│   │   ├── index.ts
│   │   ├── package-lock.json
│   │   ├── package.json
│   │   ├── prisma/
│   │   │   ├── fix-seed-city.ts
│   │   │   ├── migrations/ (138 migrations)
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── test-query.cjs
│   │   └── tsconfig.json
│   ├── frontend/
│   │   ├── .env.local
│   │   ├── .env.local.example
│   │   ├── .gitignore
│   │   ├── CLAUDE.md
│   │   ├── Dockerfile
│   │   ├── FEATURE_33_OG_META_WIRING.md
│   │   ├── components/ (178 files)
│   │   ├── context/ (1 files)
│   │   ├── contexts/ (3 files)
│   │   ├── hooks/ (60 files)
│   │   ├── lib/ (10 files)
│   │   ├── next-env.d.ts
│   │   ├── next-sitemap.config.js
│   │   ├── next.config.js
│   │   ├── package.json
│   │   ├── pages/ (63 files)
│   │   ├── postcss.config.js
│   │   ├── public/ (14 files)
│   │   ├── sentry.client.config.ts
│   │   ├── sentry.edge.config.ts
│   │   ├── sentry.server.config.ts
│   │   ├── styles/ (3 files)
│   │   ├── tailwind.config.js
│   │   ├── tsconfig.json
│   │   ├── types/ (5 files)
│   │   └── utils/ (1 files)
│   └── shared/
│       ├── CLAUDE.md
│       ├── package.json
│       ├── src/
│       │   ├── cloudinaryUtils.ts
│       │   ├── constants/
│       │   │   └── tagVocabulary.ts
│       │   ├── index.ts
│       │   ├── tierGate.ts
│       │   └── types/ (4 files)
│       └── tsconfig.json
├── pnpm
├── pnpm-workspace.yaml
├── push.ps1
├── query.sql
├── railway.toml
├── scripts/
│   ├── fix-seed-city.ts
│   ├── health-check.ts
│   ├── package-skill.sh
│   ├── session-wrap-check.ps1
│   ├── session-wrap-check.sh
│   ├── statusline-token-usage.sh
│   ├── stress-test.js
│   └── update-context.js
├── test_item.jpg
├── updated-skills/
├── ziSe4sNr
├── zisZbNTx
└── zixqMWik

```

## Tool & Skill Tree
MCP tools are injected at session start — check active tools before assuming availability.
```
MCP Connectors (check at session start):
├── mcp__github__*          — GitHub file push, PR, issues (repo: deseee/findasale)
├── mcp__Claude_in_Chrome__ — Browser automation, screenshots, form filling
├── mcp__scheduled-tasks__  — Cron scheduling for recurring tasks
├── mcp__cowork__           — File access, directory requests, file presentation
├── mcp__afd283e9__*        — Stripe (payments, subscriptions, customers)
└── mcp__mcp-registry__     — Search/suggest additional connectors

Skills (loaded on demand — full fleet in Cowork sidebar):
├── conversation-defaults   — Session behavior rules (always active)
├── dev-environment         — Env/DB/Prisma reference (load before shell commands)
├── context-maintenance     — Session wrap protocol (load at session end)
├── health-scout            — Code scanning (load before deploys)
├── findasale-{dev,architect,qa,ops,deploy,records,workflow} — Core dev fleet
├── findasale-{marketing,cx,support,legal,ux,rd} — Business fleet
├── skill-creator / cowork-power-user — Meta skills
└── docx / xlsx / pptx / pdf / schedule — Document + task skills

Self-Healing Skills: see `claude_docs/self-healing/self_healing_skills.md`
```

## On-Demand References
Read these files only when the task requires them — they are not loaded by default.
- Schema: `packages/database/prisma/schema.prisma`
- Dependencies: `packages/*/package.json` (and root `package.json`)
- Env vars: `packages/*/.env.example`
- Stack decisions: `claude_docs/STACK.md`
- Project state: `claude_docs/STATE.md`
- Security rules: `claude_docs/SECURITY.md`
- Ops procedures: `claude_docs/operations/OPS.md`
- Session history: `claude_docs/logs/session-log.md`
- Self-healing: `claude_docs/self-healing/self_healing_skills.md`
