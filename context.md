# Dynamic Project Context
*Generated at 2026-05-03T08:13:35.928Z*
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
⚠ Env drift — in .env.example but missing from .env: MAILERLITE_SHOPPERS_GROUP_ID, CLOUDINARY_AVG_IMAGE_SIZE_KB, AI_COST_CEILING_USD, OLLAMA_URL, OLLAMA_VISION_MODEL, GOOGLE_PLACES_API_KEY, EBAY_DELETION_ENDPOINT_URL, EBAY_VERIFICATION_TOKEN, OSRM_API_URL, RATE_LIMIT_WHITELIST_IPS
⚠ 10+ TODO/FIXME markers in source (showing up to 5):
  /sessions/determined-festive-thompson/mnt/FindaSale/packages/backend/src/controllers/bountyController.ts:261:      // TODO: implement distance sorting once Sales have consistent lat/lng
  /sessions/determined-festive-thompson/mnt/FindaSale/packages/backend/src/controllers/bountyController.ts:269:        // TODO: add category filter if needed
  /sessions/determined-festive-thompson/mnt/FindaSale/packages/backend/src/controllers/bountyController.ts:296:      distance: null, // TODO: calculate if lat/lng available
  /sessions/determined-festive-thompson/mnt/FindaSale/packages/backend/src/controllers/bountyController.ts:514:        checkoutUrl: null, // TODO: integrate Stripe
  /sessions/determined-festive-thompson/mnt/FindaSale/packages/backend/src/controllers/citiesController.ts:111:    // TODO: Phase 2 — implement nightly cron job

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
│       ├── agent-ada8ad64/
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
│       ├── busy-ramanujan-e5866d/
│       │   ├── .claude/
│       │   │   ├── hooks/ (1 files)
│       │   │   ├── settings.json
│       │   │   └── settings.local.json
│       │   ├── .env.example
│       │   ├── .gitattributes
│       │   ├── .githooks/
│       │   │   ├── pre-commit
│       │   │   └── pre-push
│       │   ├── .gitignore
│       │   ├── CLAUDE.md
│       │   ├── Organizer_Acquisition_Playbook.md
│       │   ├── README.md
│       │   ├── ai-config/
│       │   │   └── global-instructions.md
│       │   ├── camera-mode-mockup.jsx
│       │   ├── claude_docs/
│       │   │   ├── ARCHITECT_ASSESSMENT_FEEDBACK_SCHEMA.md
│       │   │   ├── ARCHITECT_PATRICK_SUMMARY.md
│       │   │   ├── COMPLETED_PHASES.md
│       │   │   ├── CORE.md
│       │   │   ├── FEEDBACK_DEV_QUICKSTART.md
│       │   │   ├── FEEDBACK_SURVEY_MAPPING.md
│       │   │   ├── FEEDBACK_SYSTEM_HANDOFF.md
│       │   │   ├── FEEDBACK_SYSTEM_SPEC.md
│       │   │   ├── PRICING_PAGE_UX_SPEC_S392.md
│       │   │   ├── RECOVERY.md
│       │   │   ├── S248-walkthrough-findings.md
│       │   │   ├── SECURITY.md
│       │   │   ├── STACK.md
│       │   │   ├── STATE.md
│       │   │   ├── UX/
│       │   │   │   ├── SHOPPER_DASHBOARD_RETHINK_UX_SPEC.md
│       │   │   │   └── purchase-history-consolidation-spec.md
│       │   │   ├── UX_MODERNIZATION_SPEC.md
│       │   │   ├── UX_SPECS/
│       │   │   │   ├── save-wishlist-item-card.md
│       │   │   │   └── shopper_to_organizer_conversion_flow.md
│       │   │   ├── architecture/
│       │   │   │   ├── ADR-012-DEV-CHECKLIST.md
│       │   │   │   ├── ADR-012-SUMMARY.md
│       │   │   │   ├── ADR-013-060-TEAMS-BUNDLE-SPEC.md
│       │   │   │   ├── ADR-013-auction-overhaul.md
│       │   │   │   ├── ADR-014-hubs-flea-market-repurpose.md
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
│       │   │   │   ├── ADR-EXPLORER_GUILD_RANK_ARCHITECTURE.md
│       │   │   │   ├── ADR-EXPLORER_GUILD_RANK_DEV_CHECKLIST.md
│       │   │   │   ├── ADR-PHASE4-BRIEF.md
│       │   │   │   ├── ADR-holds-to-cart-invoice.md
│       │   │   │   ├── ADR-roadmap-batch-d-72-75.md
│       │   │   │   ├── AUCTION_WIN_SPEC.md
│       │   │   │   ├── BATCH-D-SUMMARY.md
│       │   │   │   ├── ItemCard-Unification-Spec.md
│       │   │   │   ├── POS_IN_APP_PAYMENT_REQUEST_ADR.md
│       │   │   │   ├── POS_IN_APP_PAYMENT_REQUEST_SUMMARY.md
│       │   │   │   ├── POS_IN_APP_TECHNICAL_REFERENCE.md
│       │   │   │   ├── adr-072-dual-role-account-schema.md
│       │   │   │   ├── adr-073-two-channel-notification-system.md
│       │   │   │   ├── feature-spec-73-notifications.md
│       │   │   │   ├── feature-spec-75-tier-lapse-logic.md
│       │   │   │   ├── feature-specs-26-29-favorites-messages.md
│       │   │   │   └── subagent-doc-recommendations-2026-03-22.md
│       │   │   ├── archive/ (34 files)
│       │   │   ├── audits/
│       │   │   │   ├── CHROME-AUDIT-SESSION-208-SUMMARY.md
│       │   │   │   ├── INDEX-2026-03-20.md
│       │   │   │   ├── QUICK-REFERENCE-QA-2026-03-20.md
│       │   │   │   ├── README-QA-SESSION-2026-03-20.md
│       │   │   │   ├── accessibility-audit-2026-03-18.md
│       │   │   │   ├── brand-drift-2026-03-24.md
│       │   │   │   ├── brand-drift-2026-03-31.md
│       │   │   │   ├── brand-drift-2026-04-07.md
│       │   │   │   ├── brand-drift-2026-04-14.md
│       │   │   │   ├── business-plan-brand-review-2026-03-19.md
│       │   │   │   ├── chrome-audit-2026-03-20-roadmap-updates.md
│       │   │   │   ├── chrome-audit-2026-03-20.md
│       │   │   │   ├── chrome-audit-comprehensive-S211.md
│       │   │   │   ├── chrome-live-audit-2026-03-20-CHECKLIST.md
│       │   │   │   ├── chrome-live-audit-2026-03-20.md
│       │   │   │   ├── chrome-secondary-routes-s216.md
│       │   │   │   ├── create-sale-verify-s216.md
│       │   │   │   ├── daily-friction-audit-2026-04-03.md
│       │   │   │   ├── design-critique-2026-03-18.md
│       │   │   │   ├── doc-structure-audit-2026-03-22.md
│       │   │   │   ├── organizer-happy-path-s216.md
│       │   │   │   ├── passkey-qa-audit-s200.md
│       │   │   │   ├── periodic-docs-audit-2026-03-18.md
│       │   │   │   ├── qa-audit-S236-live.md
│       │   │   │   ├── qa-findings-B2-organizer-profile-20260325.md
│       │   │   │   ├── qa-findings-B3-item-management-20260325.md
│       │   │   │   ├── qa-findings-C4-public-pages-20260325.md
│       │   │   │   ├── qa-findings-D1-priority-retests-20260325.md
│       │   │   │   ├── qa-findings-D3-shopper-discovery-20260325.md
│       │   │   │   ├── qa-round2-S288-20260325.md
│       │   │   │   ├── qa-round3-S288-20260325.md
│       │   │   │   ├── qa-round4-S288-20260325.md
│       │   │   │   ├── records-audit-2026-03-22.md
│       │   │   │   ├── roadmap-audit-S294.md
│       │   │   │   ├── s222-qa-audit.md
│       │   │   │   ├── s227-qa-audit.md
│       │   │   │   ├── s290-qa-retroaudit-s285-s289.md
│       │   │   │   ├── ux-audit-nav-overload-2026-03-18.md
│       │   │   │   ├── weekly-audit-2026-03-22.md
│       │   │   │   ├── weekly-audit-2026-03-26.md
│       │   │   │   ├── weekly-audit-2026-04-02.md
│       │   │   │   └── weekly-audit-2026-04-09.md
│       │   │   ├── beta-launch/ (5 files)
│       │   │   ├── brand/ (11 files)
│       │   │   ├── brand-voice/
│       │   │   │   └── COLLECTORS_GUILD_BRAND_VOICE.md
│       │   │   ├── competitor-intel/ (5 files)
│       │   │   ├── decisions-log.md
│       │   │   ├── design/
│       │   │   │   ├── PRICE_RESEARCH_CARD_UX_SPEC.md
│       │   │   │   ├── RANK_PERKS_DISPLAY_SPEC.md
│       │   │   │   ├── SHOPPER_DASHBOARD_RETHINK_UX_SPEC.md
│       │   │   │   └── SHOPPER_DASHBOARD_VISUAL_DIRECTIVE.md
│       │   │   ├── escalation-log.md
│       │   │   ├── feature-decisions/
│       │   │   │   ├── CAMERA_WORKFLOW_V2_ARCHITECTURE.md
│       │   │   │   ├── CASH_FEE_COLLECTION_ARCHITECTURE.md
│       │   │   │   ├── CASH_FEE_COLLECTION_SUMMARY.md
│       │   │   │   ├── D2-tier-lapse-behavior.md
│       │   │   │   ├── FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md
│       │   │   │   ├── GAMIFICATION_IMPLEMENTATION_CHECKLIST_PHASE1.md
│       │   │   │   ├── MANAGER_SUBAGENT_ARCHITECTURE.md
│       │   │   │   ├── PUSH_COORDINATOR_DELIVERY_SUMMARY.md
│       │   │   │   ├── PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md
│       │   │   │   ├── advisory-board-S236-print-kit-etsy.md
│       │   │   │   ├── demo-readiness-plan-S236.md
│       │   │   │   └── ebay-quick-list-spec.md
│       │   │   ├── feature-notes/ (49 files)
│       │   │   ├── feature-specs/
│       │   │   │   └── EXPLORER_GUILD_RANK_PERKS_SPEC.md
│       │   │   ├── guides/ (1 files)
│       │   │   ├── handoffs/
│       │   │   │   └── 125_csv_export_handoff.md
│       │   │   ├── health-reports/ (13 files)
│       │   │   ├── human-QA-walkthrough-findings.md
│       │   │   ├── improvement-memos/ (5 files)
│       │   │   ├── innovation-shopper-engagement-ideas.md
│       │   │   ├── legal-hold-to-pay-risk-review.md
│       │   │   ├── logs/ (3 files)
│       │   │   ├── marketing/
│       │   │   │   └── content-pipeline/
│       │   │   │       ├── content-2026-03-23.md
│       │   │   │       ├── content-2026-03-26.md
│       │   │   │       ├── content-2026-04-02.md
│       │   │   │       └── content-2026-04-09.md
│       │   │   ├── monthly-digest-2026-04.md
│       │   │   ├── next-session-brief.md
│       │   │   ├── next-session-prompt.md
│       │   │   ├── operations/ (72 files)
│       │   │   ├── patrick-dashboard.md
│       │   │   ├── patrick-walkthrough-S248.md
│       │   │   ├── research/ (45 files)
│       │   │   ├── self-healing/ (1 files)
│       │   │   ├── session-log.md
│       │   │   ├── skill-updates/
│       │   │   │   ├── findasale-dev-SKILL.md
│       │   │   │   └── findasale-qa-SKILL.md
│       │   │   ├── skills-package/ (30 files)
│       │   │   ├── specs/
│       │   │   │   ├── concurrent-sales-gate-spec.md
│       │   │   │   ├── ebay-listing-reconciliation-spec.md
│       │   │   │   ├── explorers-guild-master-spec.md
│       │   │   │   ├── pos-upgrade-architecture-spec.md
│       │   │   │   └── pos-upgrade-ux-flows.md
│       │   │   ├── strategy/ (32 files)
│       │   │   ├── ux-audits/
│       │   │   │   └── explorer-guild-phase2-audit.md
│       │   │   ├── ux-shopper-engagement-ecosystem.md
│       │   │   ├── ux-spotchecks/
│       │   │   │   ├── 2026-03-25.md
│       │   │   │   ├── 2026-04-01.md
│       │   │   │   ├── 2026-04-08.md
│       │   │   │   ├── PROMOTE_PAGE_UX_SPEC.md
│       │   │   │   ├── S256-UX-HANDOFF.md
│       │   │   │   ├── S256-UX-SPECS-41-items-onboarding.md
│       │   │   │   ├── add-items-ux-audit-2026-03-15.md
│       │   │   │   ├── comprehensive-frontend-audit-2026-03-20.md
│       │   │   │   ├── dashboard-redesign-brief-s350.md
│       │   │   │   ├── design-polish-vision-2026-03-19.md
│       │   │   │   ├── findasale-ux-eval-review.html
│       │   │   │   ├── nav-dashboard-consolidation-2026-03-20.md
│       │   │   │   ├── organizer-guidance-spec-s350.md
│       │   │   │   ├── photo-capture-protocol-s350.md
│       │   │   │   ├── review-card-layout-spec.md
│       │   │   │   ├── smart-photo-crop-ux-spec.md
│       │   │   │   └── ux-audit-S236.md
│       │   │   └── workflow-retrospectives/ (4 files)
│       │   ├── orphaned-pages-audit-s380.html
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
│       │   │   │   │   │   ├── auctionClosing.integration.ts
│       │   │   │   │   │   ├── auth.integration.ts
│       │   │   │   │   │   ├── emailReminders.e2e.ts
│       │   │   │   │   │   ├── payment.integration.ts
│       │   │   │   │   │   ├── reservation.integration.ts
│       │   │   │   │   │   ├── stripe.e2e.ts
│       │   │   │   │   │   └── weeklyDigest.e2e.ts
│       │   │   │   │   ├── _triggerDigest.ts
│       │   │   │   │   ├── config/
│       │   │   │   │   │   └── regionConfig.ts
│       │   │   │   │   ├── constants/
│       │   │   │   │   │   └── tierLimits.ts
│       │   │   │   │   ├── controllers/ (119 files)
│       │   │   │   │   ├── helpers/
│       │   │   │   │   │   └── itemQueries.ts
│       │   │   │   │   ├── index.ts
│       │   │   │   │   ├── instrument.ts
│       │   │   │   │   ├── jobs/ (27 files)
│       │   │   │   │   ├── lib/ (17 files)
│       │   │   │   │   ├── middleware/ (13 files)
│       │   │   │   │   ├── models/ (1 files)
│       │   │   │   │   ├── routes/ (106 files)
│       │   │   │   │   ├── services/ (63 files)
│       │   │   │   │   ├── types/ (2 files)
│       │   │   │   │   └── utils/ (12 files)
│       │   │   │   └── tsconfig.json
│       │   │   ├── database/
│       │   │   │   ├── .env.example
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── index.ts
│       │   │   │   ├── package.json
│       │   │   │   ├── prisma/
│       │   │   │   │   ├── EXPLORER_PROFILE_DECISION.md
│       │   │   │   │   ├── fix-seed-city.ts
│       │   │   │   │   ├── migrations/ (198 migrations)
│       │   │   │   │   ├── schema.prisma
│       │   │   │   │   ├── seed.ts
│       │   │   │   │   └── survivor-seed.ts
│       │   │   │   └── tsconfig.json
│       │   │   ├── frontend/
│       │   │   │   ├── .env.local.example
│       │   │   │   ├── .gitignore
│       │   │   │   ├── CLAUDE.md
│       │   │   │   ├── Dockerfile
│       │   │   │   ├── FEATURE_33_OG_META_WIRING.md
│       │   │   │   ├── components/ (224 files)
│       │   │   │   ├── context/ (2 files)
│       │   │   │   ├── contexts/ (3 files)
│       │   │   │   ├── hooks/ (65 files)
│       │   │   │   ├── lib/ (13 files)
│       │   │   │   ├── next-env.d.ts
│       │   │   │   ├── next-sitemap.config.js
│       │   │   │   ├── next.config.js
│       │   │   │   ├── package.json
│       │   │   │   ├── pages/ (67 files)
│       │   │   │   ├── postcss.config.js
│       │   │   │   ├── public/ (10 files)
│       │   │   │   ├── sentry.client.config.ts
│       │   │   │   ├── sentry.edge.config.ts
│       │   │   │   ├── sentry.server.config.ts
│       │   │   │   ├── styles/ (3 files)
│       │   │   │   ├── tailwind.config.js
│       │   │   │   ├── tsconfig.json
│       │   │   │   ├── types/ (5 files)
│       │   │   │   └── utils/ (2 files)
│       │   │   └── shared/
│       │   │       ├── CLAUDE.md
│       │   │       ├── package.json
│       │   │       ├── src/
│       │   │       │   ├── cloudinaryUtils.ts
│       │   │       │   ├── constants/
│       │   │       │   │   ├── ebayCategories.ts
│       │   │       │   │   └── tagVocabulary.ts
│       │   │       │   ├── index.ts
│       │   │       │   ├── tierGate.ts
│       │   │       │   ├── types/ (7 files)
│       │   │       │   └── utils/ (1 files)
│       │   │       └── tsconfig.json
│       │   ├── pnpm-workspace.yaml
│       │   ├── push.ps1
│       │   ├── railway.toml
│       │   └── scripts/
│       │       ├── fix-seed-city.ts
│       │       ├── health-check.ts
│       │       ├── package-skill.sh
│       │       ├── session-wrap-check.ps1
│       │       ├── session-wrap-check.sh
│       │       ├── statusline-token-usage.sh
│       │       ├── stress-test.js
│       │       └── update-context.js
│       └── suspicious-jennings-e3a9d9/
│           ├── .claude/
│           │   ├── hooks/ (1 files)
│           │   ├── settings.json
│           │   └── settings.local.json
│           ├── .env.example
│           ├── .gitattributes
│           ├── .githooks/
│           │   ├── pre-commit
│           │   └── pre-push
│           ├── .gitignore
│           ├── CLAUDE.md
│           ├── Organizer_Acquisition_Playbook.md
│           ├── README.md
│           ├── ai-config/
│           │   └── global-instructions.md
│           ├── camera-mode-mockup.jsx
│           ├── claude_docs/
│           │   ├── ARCHITECT_ASSESSMENT_FEEDBACK_SCHEMA.md
│           │   ├── ARCHITECT_PATRICK_SUMMARY.md
│           │   ├── COMPLETED_PHASES.md
│           │   ├── CORE.md
│           │   ├── FEEDBACK_DEV_QUICKSTART.md
│           │   ├── FEEDBACK_SURVEY_MAPPING.md
│           │   ├── FEEDBACK_SYSTEM_HANDOFF.md
│           │   ├── FEEDBACK_SYSTEM_SPEC.md
│           │   ├── PRICING_PAGE_UX_SPEC_S392.md
│           │   ├── RECOVERY.md
│           │   ├── S248-walkthrough-findings.md
│           │   ├── SECURITY.md
│           │   ├── STACK.md
│           │   ├── STATE.md
│           │   ├── UX/
│           │   │   ├── SHOPPER_DASHBOARD_RETHINK_UX_SPEC.md
│           │   │   └── purchase-history-consolidation-spec.md
│           │   ├── UX_MODERNIZATION_SPEC.md
│           │   ├── UX_SPECS/
│           │   │   ├── save-wishlist-item-card.md
│           │   │   └── shopper_to_organizer_conversion_flow.md
│           │   ├── architecture/
│           │   │   ├── ADR-012-DEV-CHECKLIST.md
│           │   │   ├── ADR-012-SUMMARY.md
│           │   │   ├── ADR-013-060-TEAMS-BUNDLE-SPEC.md
│           │   │   ├── ADR-013-auction-overhaul.md
│           │   │   ├── ADR-014-hubs-flea-market-repurpose.md
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
│           │   │   ├── ADR-EXPLORER_GUILD_RANK_ARCHITECTURE.md
│           │   │   ├── ADR-EXPLORER_GUILD_RANK_DEV_CHECKLIST.md
│           │   │   ├── ADR-PHASE4-BRIEF.md
│           │   │   ├── ADR-holds-to-cart-invoice.md
│           │   │   ├── ADR-roadmap-batch-d-72-75.md
│           │   │   ├── AUCTION_WIN_SPEC.md
│           │   │   ├── BATCH-D-SUMMARY.md
│           │   │   ├── ItemCard-Unification-Spec.md
│           │   │   ├── POS_IN_APP_PAYMENT_REQUEST_ADR.md
│           │   │   ├── POS_IN_APP_PAYMENT_REQUEST_SUMMARY.md
│           │   │   ├── POS_IN_APP_TECHNICAL_REFERENCE.md
│           │   │   ├── adr-072-dual-role-account-schema.md
│           │   │   ├── adr-073-two-channel-notification-system.md
│           │   │   ├── feature-spec-73-notifications.md
│           │   │   ├── feature-spec-75-tier-lapse-logic.md
│           │   │   ├── feature-specs-26-29-favorites-messages.md
│           │   │   └── subagent-doc-recommendations-2026-03-22.md
│           │   ├── archive/ (34 files)
│           │   ├── audits/
│           │   │   ├── CHROME-AUDIT-SESSION-208-SUMMARY.md
│           │   │   ├── INDEX-2026-03-20.md
│           │   │   ├── QUICK-REFERENCE-QA-2026-03-20.md
│           │   │   ├── README-QA-SESSION-2026-03-20.md
│           │   │   ├── accessibility-audit-2026-03-18.md
│           │   │   ├── brand-drift-2026-03-24.md
│           │   │   ├── brand-drift-2026-03-31.md
│           │   │   ├── brand-drift-2026-04-07.md
│           │   │   ├── brand-drift-2026-04-14.md
│           │   │   ├── business-plan-brand-review-2026-03-19.md
│           │   │   ├── chrome-audit-2026-03-20-roadmap-updates.md
│           │   │   ├── chrome-audit-2026-03-20.md
│           │   │   ├── chrome-audit-comprehensive-S211.md
│           │   │   ├── chrome-live-audit-2026-03-20-CHECKLIST.md
│           │   │   ├── chrome-live-audit-2026-03-20.md
│           │   │   ├── chrome-secondary-routes-s216.md
│           │   │   ├── create-sale-verify-s216.md
│           │   │   ├── daily-friction-audit-2026-04-03.md
│           │   │   ├── design-critique-2026-03-18.md
│           │   │   ├── doc-structure-audit-2026-03-22.md
│           │   │   ├── organizer-happy-path-s216.md
│           │   │   ├── passkey-qa-audit-s200.md
│           │   │   ├── periodic-docs-audit-2026-03-18.md
│           │   │   ├── qa-audit-S236-live.md
│           │   │   ├── qa-findings-B2-organizer-profile-20260325.md
│           │   │   ├── qa-findings-B3-item-management-20260325.md
│           │   │   ├── qa-findings-C4-public-pages-20260325.md
│           │   │   ├── qa-findings-D1-priority-retests-20260325.md
│           │   │   ├── qa-findings-D3-shopper-discovery-20260325.md
│           │   │   ├── qa-round2-S288-20260325.md
│           │   │   ├── qa-round3-S288-20260325.md
│           │   │   ├── qa-round4-S288-20260325.md
│           │   │   ├── records-audit-2026-03-22.md
│           │   │   ├── roadmap-audit-S294.md
│           │   │   ├── s222-qa-audit.md
│           │   │   ├── s227-qa-audit.md
│           │   │   ├── s290-qa-retroaudit-s285-s289.md
│           │   │   ├── ux-audit-nav-overload-2026-03-18.md
│           │   │   ├── weekly-audit-2026-03-22.md
│           │   │   ├── weekly-audit-2026-03-26.md
│           │   │   ├── weekly-audit-2026-04-02.md
│           │   │   └── weekly-audit-2026-04-09.md
│           │   ├── beta-launch/ (5 files)
│           │   ├── brand/ (11 files)
│           │   ├── brand-voice/
│           │   │   └── COLLECTORS_GUILD_BRAND_VOICE.md
│           │   ├── competitor-intel/ (5 files)
│           │   ├── decisions-log.md
│           │   ├── design/
│           │   │   ├── PRICE_RESEARCH_CARD_UX_SPEC.md
│           │   │   ├── RANK_PERKS_DISPLAY_SPEC.md
│           │   │   ├── SHOPPER_DASHBOARD_RETHINK_UX_SPEC.md
│           │   │   └── SHOPPER_DASHBOARD_VISUAL_DIRECTIVE.md
│           │   ├── escalation-log.md
│           │   ├── feature-decisions/
│           │   │   ├── CAMERA_WORKFLOW_V2_ARCHITECTURE.md
│           │   │   ├── CASH_FEE_COLLECTION_ARCHITECTURE.md
│           │   │   ├── CASH_FEE_COLLECTION_SUMMARY.md
│           │   │   ├── D2-tier-lapse-behavior.md
│           │   │   ├── FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md
│           │   │   ├── GAMIFICATION_IMPLEMENTATION_CHECKLIST_PHASE1.md
│           │   │   ├── MANAGER_SUBAGENT_ARCHITECTURE.md
│           │   │   ├── PUSH_COORDINATOR_DELIVERY_SUMMARY.md
│           │   │   ├── PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md
│           │   │   ├── advisory-board-S236-print-kit-etsy.md
│           │   │   ├── demo-readiness-plan-S236.md
│           │   │   └── ebay-quick-list-spec.md
│           │   ├── feature-notes/ (49 files)
│           │   ├── feature-specs/
│           │   │   └── EXPLORER_GUILD_RANK_PERKS_SPEC.md
│           │   ├── guides/ (1 files)
│           │   ├── handoffs/
│           │   │   └── 125_csv_export_handoff.md
│           │   ├── health-reports/ (13 files)
│           │   ├── human-QA-walkthrough-findings.md
│           │   ├── improvement-memos/ (5 files)
│           │   ├── innovation-shopper-engagement-ideas.md
│           │   ├── legal-hold-to-pay-risk-review.md
│           │   ├── logs/ (3 files)
│           │   ├── marketing/
│           │   │   └── content-pipeline/
│           │   │       ├── content-2026-03-23.md
│           │   │       ├── content-2026-03-26.md
│           │   │       ├── content-2026-04-02.md
│           │   │       └── content-2026-04-09.md
│           │   ├── monthly-digest-2026-04.md
│           │   ├── next-session-brief.md
│           │   ├── next-session-prompt.md
│           │   ├── operations/ (72 files)
│           │   ├── patrick-dashboard.md
│           │   ├── patrick-walkthrough-S248.md
│           │   ├── research/ (45 files)
│           │   ├── self-healing/ (1 files)
│           │   ├── session-log.md
│           │   ├── skill-updates/
│           │   │   ├── findasale-dev-SKILL.md
│           │   │   └── findasale-qa-SKILL.md
│           │   ├── skills-package/ (30 files)
│           │   ├── specs/
│           │   │   ├── concurrent-sales-gate-spec.md
│           │   │   ├── ebay-listing-reconciliation-spec.md
│           │   │   ├── explorers-guild-master-spec.md
│           │   │   ├── pos-upgrade-architecture-spec.md
│           │   │   └── pos-upgrade-ux-flows.md
│           │   ├── strategy/ (32 files)
│           │   ├── ux-audits/
│           │   │   └── explorer-guild-phase2-audit.md
│           │   ├── ux-shopper-engagement-ecosystem.md
│           │   ├── ux-spotchecks/
│           │   │   ├── 2026-03-25.md
│           │   │   ├── 2026-04-01.md
│           │   │   ├── 2026-04-08.md
│           │   │   ├── PROMOTE_PAGE_UX_SPEC.md
│           │   │   ├── S256-UX-HANDOFF.md
│           │   │   ├── S256-UX-SPECS-41-items-onboarding.md
│           │   │   ├── add-items-ux-audit-2026-03-15.md
│           │   │   ├── comprehensive-frontend-audit-2026-03-20.md
│           │   │   ├── dashboard-redesign-brief-s350.md
│           │   │   ├── design-polish-vision-2026-03-19.md
│           │   │   ├── findasale-ux-eval-review.html
│           │   │   ├── nav-dashboard-consolidation-2026-03-20.md
│           │   │   ├── organizer-guidance-spec-s350.md
│           │   │   ├── photo-capture-protocol-s350.md
│           │   │   ├── review-card-layout-spec.md
│           │   │   ├── smart-photo-crop-ux-spec.md
│           │   │   └── ux-audit-S236.md
│           │   └── workflow-retrospectives/ (4 files)
│           ├── orphaned-pages-audit-s380.html
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
│           │   │   │   │   ├── auctionClosing.integration.ts
│           │   │   │   │   ├── auth.integration.ts
│           │   │   │   │   ├── emailReminders.e2e.ts
│           │   │   │   │   ├── payment.integration.ts
│           │   │   │   │   ├── reservation.integration.ts
│           │   │   │   │   ├── stripe.e2e.ts
│           │   │   │   │   └── weeklyDigest.e2e.ts
│           │   │   │   ├── _triggerDigest.ts
│           │   │   │   ├── config/
│           │   │   │   │   └── regionConfig.ts
│           │   │   │   ├── constants/
│           │   │   │   │   └── tierLimits.ts
│           │   │   │   ├── controllers/ (119 files)
│           │   │   │   ├── helpers/
│           │   │   │   │   └── itemQueries.ts
│           │   │   │   ├── index.ts
│           │   │   │   ├── instrument.ts
│           │   │   │   ├── jobs/ (27 files)
│           │   │   │   ├── lib/ (17 files)
│           │   │   │   ├── middleware/ (13 files)
│           │   │   │   ├── models/ (1 files)
│           │   │   │   ├── routes/ (106 files)
│           │   │   │   ├── services/ (63 files)
│           │   │   │   ├── types/ (2 files)
│           │   │   │   └── utils/ (12 files)
│           │   │   └── tsconfig.json
│           │   ├── database/
│           │   │   ├── .env.example
│           │   │   ├── CLAUDE.md
│           │   │   ├── index.ts
│           │   │   ├── package.json
│           │   │   ├── prisma/
│           │   │   │   ├── EXPLORER_PROFILE_DECISION.md
│           │   │   │   ├── fix-seed-city.ts
│           │   │   │   ├── migrations/ (198 migrations)
│           │   │   │   ├── schema.prisma
│           │   │   │   ├── seed.ts
│           │   │   │   └── survivor-seed.ts
│           │   │   └── tsconfig.json
│           │   ├── frontend/
│           │   │   ├── .env.local.example
│           │   │   ├── .gitignore
│           │   │   ├── CLAUDE.md
│           │   │   ├── Dockerfile
│           │   │   ├── FEATURE_33_OG_META_WIRING.md
│           │   │   ├── components/ (224 files)
│           │   │   ├── context/ (2 files)
│           │   │   ├── contexts/ (3 files)
│           │   │   ├── hooks/ (65 files)
│           │   │   ├── lib/ (13 files)
│           │   │   ├── next-env.d.ts
│           │   │   ├── next-sitemap.config.js
│           │   │   ├── next.config.js
│           │   │   ├── package.json
│           │   │   ├── pages/ (67 files)
│           │   │   ├── postcss.config.js
│           │   │   ├── public/ (10 files)
│           │   │   ├── sentry.client.config.ts
│           │   │   ├── sentry.edge.config.ts
│           │   │   ├── sentry.server.config.ts
│           │   │   ├── styles/ (3 files)
│           │   │   ├── tailwind.config.js
│           │   │   ├── tsconfig.json
│           │   │   ├── types/ (5 files)
│           │   │   └── utils/ (2 files)
│           │   └── shared/
│           │       ├── CLAUDE.md
│           │       ├── package.json
│           │       ├── src/
│           │       │   ├── cloudinaryUtils.ts
│           │       │   ├── constants/
│           │       │   │   ├── ebayCategories.ts
│           │       │   │   └── tagVocabulary.ts
│           │       │   ├── index.ts
│           │       │   ├── tierGate.ts
│           │       │   ├── types/ (7 files)
│           │       │   └── utils/ (1 files)
│           │       └── tsconfig.json
│           ├── pnpm-workspace.yaml
│           ├── push.ps1
│           ├── railway.toml
│           └── scripts/
│               ├── fix-seed-city.ts
│               ├── health-check.ts
│               ├── package-skill.sh
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
├── .github/
│   └── workflows/
│       ├── enrich-backfill.yml
│       ├── scrape-craigslist.yml
│       ├── scrape-estatesalesnet.yml
│       ├── scrape-eventbrite.yml
│       ├── scrape-facebook-events.yml
│       ├── scrape-foursquare.yml
│       ├── scrape-google-places.yml
│       ├── scrape-here-places.yml
│       ├── scrape-newspaper-rss.yml
│       ├── scrape-osm-overpass.yml
│       └── test-esn-api-access.yml
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
├── GROUP5_CHANGED_FILES.txt
├── IMPLEMENTATION_SUMMARY_GROUP5.md
├── Organizer_Acquisition_Playbook.md
├── Organizer_Acquisition_Playbook_v2.md
├── PRICING_ENGINE_UPDATES_SUMMARY.txt
├── README.md
├── _tmp_12034_96456959b134e08fba2df36ea5362975
├── _tmp_12034_b018432cc2b0cc046a430f468ee2aa42
├── _tmp_266_23b4c6599e6bebb58a6d92b6ad3cd9cc
├── _tmp_266_2b64b5f2ab50c4e15d9a647354017e45
├── _tmp_54577_dea014a3f4913a1d30dd66ce32ea163c
├── _tmp_54577_ef088b5284d29d06908a35fbb3fd0501
├── ai-config/
│   └── global-instructions.md
├── brand/ (2 files)
├── camera-mode-mockup.jsx
├── cart-mockup.html
├── claude_docs/
│   ├── .last-wrap
│   ├── ARCHITECT_ASSESSMENT_FEEDBACK_SCHEMA.md
│   ├── ARCHITECT_PATRICK_SUMMARY.md
│   ├── COMPLETED_PHASES.md
│   ├── CORE.md
│   ├── FEEDBACK_DEV_QUICKSTART.md
│   ├── FEEDBACK_SURVEY_MAPPING.md
│   ├── FEEDBACK_SYSTEM_HANDOFF.md
│   ├── FEEDBACK_SYSTEM_SPEC.md
│   ├── PRICING_PAGE_UX_SPEC_S392.md
│   ├── RECOVERY.md
│   ├── S248-walkthrough-findings.md
│   ├── SECURITY.md
│   ├── STACK.md
│   ├── STATE.md
│   ├── UX/
│   │   ├── SHOPPER_DASHBOARD_RETHINK_UX_SPEC.md
│   │   └── purchase-history-consolidation-spec.md
│   ├── UX_MODERNIZATION_SPEC.md
│   ├── UX_SPECS/
│   │   ├── save-wishlist-item-card.md
│   │   └── shopper_to_organizer_conversion_flow.md
│   ├── architecture/
│   │   ├── ADR-012-DEV-CHECKLIST.md
│   │   ├── ADR-012-SUMMARY.md
│   │   ├── ADR-013-060-TEAMS-BUNDLE-SPEC.md
│   │   ├── ADR-013-auction-overhaul.md
│   │   ├── ADR-014-hubs-flea-market-repurpose.md
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
│   │   ├── ADR-069-BURST-CLUSTERING-PRICING-WIRING.md
│   │   ├── ADR-069-PHASE2-PHOTO-ROLE-AWARENESS.md
│   │   ├── ADR-070-MARKSOLD-POS-INVOICE.md
│   │   ├── ADR-071-ETSY-COMP-FETCH.md
│   │   ├── ADR-072-IN-APP-QR-SCANNER.md
│   │   ├── ADR-073-DIRECTORY-SCRAPER.md
│   │   ├── ADR-074-METRO-AUTO-CONTENT.md
│   │   ├── ADR-075-SEO-CONTENT-MOAT.md
│   │   ├── ADR-076-GITHUB-ACTIONS-SCRAPER.md
│   │   ├── ADR-EXPLORER_GUILD_RANK_ARCHITECTURE.md
│   │   ├── ADR-EXPLORER_GUILD_RANK_DEV_CHECKLIST.md
│   │   ├── ADR-PHASE4-BRIEF.md
│   │   ├── ADR-holds-to-cart-invoice.md
│   │   ├── ADR-roadmap-batch-d-72-75.md
│   │   ├── AUCTION_WIN_SPEC.md
│   │   ├── BATCH-D-SUMMARY.md
│   │   ├── ItemCard-Unification-Spec.md
│   │   ├── POS_IN_APP_PAYMENT_REQUEST_ADR.md
│   │   ├── POS_IN_APP_PAYMENT_REQUEST_SUMMARY.md
│   │   ├── POS_IN_APP_TECHNICAL_REFERENCE.md
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
│   │   ├── brand-drift-2026-03-31.md
│   │   ├── brand-drift-2026-04-07.md
│   │   ├── brand-drift-2026-04-14.md
│   │   ├── brand-drift-2026-04-21.md
│   │   ├── brand-drift-2026-05-02.md
│   │   ├── business-plan-brand-review-2026-03-19.md
│   │   ├── chrome-audit-2026-03-20-roadmap-updates.md
│   │   ├── chrome-audit-2026-03-20.md
│   │   ├── chrome-audit-comprehensive-S211.md
│   │   ├── chrome-live-audit-2026-03-20-CHECKLIST.md
│   │   ├── chrome-live-audit-2026-03-20.md
│   │   ├── chrome-secondary-routes-s216.md
│   │   ├── create-sale-verify-s216.md
│   │   ├── daily-friction-audit-2026-04-03.md
│   │   ├── design-critique-2026-03-18.md
│   │   ├── doc-structure-audit-2026-03-22.md
│   │   ├── ebay-sync-audit-S590.md
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
│   │   ├── weekly-audit-2026-03-26.md
│   │   ├── weekly-audit-2026-04-02.md
│   │   ├── weekly-audit-2026-04-09.md
│   │   ├── weekly-audit-2026-04-16.md
│   │   ├── weekly-audit-2026-04-23.md
│   │   └── weekly-audit-2026-05-02.md
│   ├── beta-launch/ (5 files)
│   ├── brand/ (11 files)
│   ├── brand-voice/
│   │   └── COLLECTORS_GUILD_BRAND_VOICE.md
│   ├── competitor-intel/ (6 files)
│   ├── content/
│   │   └── city-tips/
│   │       ├── README.md
│   │       └── grand-rapids-mi.md
│   ├── decisions-log.md
│   ├── design/
│   │   ├── PRICE_RESEARCH_CARD_UX_SPEC.md
│   │   ├── RANK_PERKS_DISPLAY_SPEC.md
│   │   ├── SHOPPER_DASHBOARD_RETHINK_UX_SPEC.md
│   │   └── SHOPPER_DASHBOARD_VISUAL_DIRECTIVE.md
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
│   │   ├── demo-readiness-plan-S236.md
│   │   └── ebay-quick-list-spec.md
│   ├── feature-notes/ (60 files)
│   ├── feature-specs/
│   │   └── EXPLORER_GUILD_RANK_PERKS_SPEC.md
│   ├── guides/ (2 files)
│   ├── handoffs/
│   │   └── 125_csv_export_handoff.md
│   ├── health-reports/ (17 files)
│   ├── human-QA-walkthrough-findings.md
│   ├── improvement-memos/ (7 files)
│   ├── innovation-shopper-engagement-ideas.md
│   ├── legal/
│   │   └── rvm-tcpa-compliance-review.md
│   ├── legal-hold-to-pay-risk-review.md
│   ├── logs/ (3 files)
│   ├── marketing/
│   │   ├── DEMAND_GEN_SUMMARY.md
│   │   ├── advisory-outreach-drafts.md
│   │   ├── content-pipeline/
│   │   │   ├── content-2026-03-23.md
│   │   │   ├── content-2026-03-26.md
│   │   │   ├── content-2026-04-02.md
│   │   │   ├── content-2026-04-09.md
│   │   │   ├── content-2026-04-16.md
│   │   │   ├── content-2026-04-23.md
│   │   │   └── content-2026-05-02.md
│   │   ├── demand-gen-playbook-organizer-acquisition.md
│   │   ├── landing-page-html-template.html
│   │   ├── peer-conversation-scripts.md
│   │   └── video-asset-brief.md
│   ├── monthly-digest-2026-04.md
│   ├── next-session-brief.md
│   ├── next-session-prompt.md
│   ├── operations/ (84 files)
│   ├── patrick-dashboard.md
│   ├── patrick-walkthrough-S248.md
│   ├── payment-testing-content-package.md
│   ├── pre-sale-payment-testing-guide.md
│   ├── pricing-data-sources-research.md
│   ├── reports/
│   │   └── monthly-digest-2026-05.md
│   ├── research/ (51 files)
│   ├── security/
│   │   ├── CRAWL_AUDIT_EXEC_SUMMARY.md
│   │   ├── CRAWL_IMPLEMENTATION_PRIORITY.md
│   │   ├── CRAWL_PRELAUNCH_CHECKLIST.md
│   │   ├── CRAWL_SYSTEM_SECURITY_AUDIT.md
│   │   ├── README_CRAWL_AUDIT.md
│   │   └── scraping-threat-model.md
│   ├── self-healing/ (1 files)
│   ├── session-log.md
│   ├── skill-updates/
│   │   ├── findasale-dev-SKILL.md
│   │   └── findasale-qa-SKILL.md
│   ├── skills-package/ (52 files)
│   ├── specs/
│   │   ├── concurrent-sales-gate-spec.md
│   │   ├── ebay-listing-reconciliation-spec.md
│   │   ├── explorers-guild-master-spec.md
│   │   ├── pos-upgrade-architecture-spec.md
│   │   └── pos-upgrade-ux-flows.md
│   ├── strategy/ (60 files)
│   ├── ux-audits/
│   │   └── explorer-guild-phase2-audit.md
│   ├── ux-shopper-engagement-ecosystem.md
│   ├── ux-spotchecks/
│   │   ├── 2026-03-25.md
│   │   ├── 2026-04-01.md
│   │   ├── 2026-04-08.md
│   │   ├── 2026-04-15.md
│   │   ├── 2026-04-22.md
│   │   ├── 2026-05-02.md
│   │   ├── PROMOTE_PAGE_UX_SPEC.md
│   │   ├── S256-UX-HANDOFF.md
│   │   ├── S256-UX-SPECS-41-items-onboarding.md
│   │   ├── add-items-ux-audit-2026-03-15.md
│   │   ├── comprehensive-frontend-audit-2026-03-20.md
│   │   ├── dashboard-redesign-brief-s350.md
│   │   ├── design-polish-vision-2026-03-19.md
│   │   ├── findasale-ux-eval-review.html
│   │   ├── nav-dashboard-consolidation-2026-03-20.md
│   │   ├── organizer-guidance-spec-s350.md
│   │   ├── photo-capture-protocol-s350.md
│   │   ├── review-card-layout-spec.md
│   │   ├── share-promote-overhaul-2026-04-19.md
│   │   ├── share-promote-redesign-brief-S522.md
│   │   ├── share-promote-template-research-S522.md
│   │   ├── share-promote-visual-brief-S522.md
│   │   ├── smart-photo-crop-ux-spec.md
│   │   ├── teams-card-reader-hardware-section-S524.md
│   │   └── ux-audit-S236.md
│   └── workflow-retrospectives/ (4 files)
├── cleanup-system-organizer-sales.sql
├── conversation-defaults-SKILL-v8.md.tmp.35852.1773930503120
├── findasale-pin-logo.svg
├── frontend-pages-inventory-S294.html
├── icon-preview-v3.html
├── icon-preview-v4.html
├── icon-preview.html
├── label-sheet-composer-dev-prompt.md
├── next
├── orphaned-pages-audit-s380.html
├── package-lock.json
├── package.json
├── packages/
│   ├── backend/
│   │   ├── .env
│   │   ├── .env.example
│   │   ├── C:\Users\desee\AppData\Local\Temp/
│   │   │   └── node-compile-cache/
│   │   │       └── v22.22.0-x64-9de703df-1629/
│   │   │           ├── 0014c7b4
│   │   │           ├── 00279342
│   │   │           ├── 010ca46c
│   │   │           ├── 01b7386d
│   │   │           ├── 025cf00f
│   │   │           ├── 02ef88e8
│   │   │           ├── 03f36f82
│   │   │           ├── 046957ae
│   │   │           ├── 04d9d011
│   │   │           ├── 057f0d84
│   │   │           ├── 05d88ffa
│   │   │           ├── 05fec450
│   │   │           ├── 06f773c7
│   │   │           ├── 0755c7a8
│   │   │           ├── 079d197c
│   │   │           ├── 084167c6
│   │   │           ├── 091ce0e2
│   │   │           ├── 09275b59
│   │   │           ├── 094e6b9e
│   │   │           ├── 09615a35
│   │   │           ├── 09a834fe
│   │   │           ├── 09dde953
│   │   │           ├── 0a1fa128
│   │   │           ├── 0a70f056
│   │   │           ├── 0aa851b3
│   │   │           ├── 0c5232a3
│   │   │           ├── 0d9f97b3
│   │   │           ├── 0da04cf5
│   │   │           ├── 0dc96296
│   │   │           ├── 0df25c63
│   │   │           ├── 0e0176ca
│   │   │           ├── 0f063766
│   │   │           ├── 0f0a7988
│   │   │           ├── 0f0c8433
│   │   │           ├── 0fd0b3f1
│   │   │           ├── 0fdd5abd
│   │   │           ├── 0fef87ad
│   │   │           ├── 100692d9
│   │   │           ├── 10123dee
│   │   │           ├── 1029d9b0
│   │   │           ├── 102ef5fd
│   │   │           ├── 10d84fd3
│   │   │           ├── 1148d269
│   │   │           ├── 1172e634
│   │   │           ├── 11cb2a80
│   │   │           ├── 11e1e7e1
│   │   │           ├── 11f1577f
│   │   │           ├── 12940077
│   │   │           ├── 12d6085e
│   │   │           ├── 13bd6df4
│   │   │           ├── 140a0144
│   │   │           ├── 140d3cf2
│   │   │           ├── 1449be6d
│   │   │           ├── 149ec42e
│   │   │           ├── 158a58e3
│   │   │           ├── 15dac900
│   │   │           ├── 164dc688
│   │   │           ├── 16ad2109
│   │   │           ├── 16b76a41
│   │   │           ├── 16e14a72
│   │   │           ├── 17793a2e
│   │   │           ├── 17bea670
│   │   │           ├── 17fb02de
│   │   │           ├── 181f3303
│   │   │           ├── 1827c055
│   │   │           ├── 18997b58
│   │   │           ├── 1978cd64
│   │   │           ├── 1a0b6a98
│   │   │           ├── 1a1a92fe
│   │   │           ├── 1a6b3ce5
│   │   │           ├── 1a80b874
│   │   │           ├── 1a9d421b
│   │   │           ├── 1ac49b5c
│   │   │           ├── 1b2a3a2a
│   │   │           ├── 1b6d87f9
│   │   │           ├── 1b8f0d0a
│   │   │           ├── 1b98654c
│   │   │           ├── 1bbb6102
│   │   │           ├── 1c575097
│   │   │           ├── 1e2212b8
│   │   │           ├── 1e79468d
│   │   │           ├── 1e880b66
│   │   │           ├── 1f186a71
│   │   │           ├── 1f4b8cdd
│   │   │           ├── 1f9b0e5c
│   │   │           ├── 204d30cc
│   │   │           ├── 207c7dae
│   │   │           ├── 20995dbb
│   │   │           ├── 214ffcb5
│   │   │           ├── 221af82a
│   │   │           ├── 22a111e0
│   │   │           ├── 232bb390
│   │   │           ├── 23a412ce
│   │   │           ├── 23c95ffc
│   │   │           ├── 23ea36aa
│   │   │           ├── 2442c1f5
│   │   │           ├── 24d32a8d
│   │   │           ├── 250f9c68
│   │   │           ├── 25cb1a0e
│   │   │           ├── 263f0e14
│   │   │           ├── 26489bb3
│   │   │           ├── 269c56d8
│   │   │           ├── 27141edb
│   │   │           ├── 2745aa53
│   │   │           ├── 27f07a12
│   │   │           ├── 27f09283
│   │   │           ├── 284df1ba
│   │   │           ├── 288dc48f
│   │   │           ├── 28cd767f
│   │   │           ├── 298138b1
│   │   │           ├── 29ae7849
│   │   │           ├── 2a432b43
│   │   │           ├── 2a8813f8
│   │   │           ├── 2bc0d199
│   │   │           ├── 2bdcf063
│   │   │           ├── 2c66374b
│   │   │           ├── 2ca3585d
│   │   │           ├── 2cbb34c0
│   │   │           ├── 2cc9283b
│   │   │           ├── 2d96951b
│   │   │           ├── 2dfc3763
│   │   │           ├── 2e55c3a5
│   │   │           ├── 2ecc8411
│   │   │           ├── 2fcd57fe
│   │   │           ├── 3029e332
│   │   │           ├── 304a34e9
│   │   │           ├── 30b81987
│   │   │           ├── 311bad02
│   │   │           ├── 32c3690e
│   │   │           ├── 336958ec
│   │   │           ├── 33ab5973
│   │   │           ├── 357ecf82
│   │   │           ├── 35ecf28e
│   │   │           ├── 35ff1778
│   │   │           ├── 373ef455
│   │   │           ├── 378d679f
│   │   │           ├── 37b3f1ce
│   │   │           ├── 382de301
│   │   │           ├── 38c12c3f
│   │   │           ├── 38c4fc01
│   │   │           ├── 391c424a
│   │   │           ├── 397a78c4
│   │   │           ├── 39c3aa58
│   │   │           ├── 3a2a3a4b
│   │   │           ├── 3a521e90
│   │   │           ├── 3a9df0e4
│   │   │           ├── 3beeef42
│   │   │           ├── 3c07ab31
│   │   │           ├── 3c2aa808
│   │   │           ├── 3c39e184
│   │   │           ├── 3c3fb401
│   │   │           ├── 3c96dce2
│   │   │           ├── 3ce37815
│   │   │           ├── 3cf102a9
│   │   │           ├── 3dcf6415
│   │   │           ├── 3e64441e
│   │   │           ├── 3e9f585a
│   │   │           ├── 3ef86212
│   │   │           ├── 3f3308c6
│   │   │           ├── 3f92d689
│   │   │           ├── 3fb014f3
│   │   │           ├── 3fbc5c53
│   │   │           ├── 40429bd2
│   │   │           ├── 422eb790
│   │   │           ├── 42dc0d32
│   │   │           ├── 4337c5df
│   │   │           ├── 436e0990
│   │   │           ├── 437deda3
│   │   │           ├── 43890356
│   │   │           ├── 4390ba1e
│   │   │           ├── 442e1715
│   │   │           ├── 45efdcd8
│   │   │           ├── 465030ee
│   │   │           ├── 4652bac2
│   │   │           ├── 468005ea
│   │   │           ├── 470228aa
│   │   │           ├── 4744f7d7
│   │   │           ├── 475bb660
│   │   │           ├── 47c80c91
│   │   │           ├── 47dd1147
│   │   │           ├── 47e91824
│   │   │           ├── 47ede548
│   │   │           ├── 48aa5edb
│   │   │           ├── 48d1f1c8
│   │   │           ├── 49430d8e
│   │   │           ├── 49d1006b
│   │   │           ├── 4a2f7337
│   │   │           ├── 4a31a215
│   │   │           ├── 4a7f67b1
│   │   │           ├── 4b9ee3ed
│   │   │           ├── 4bbd7e97
│   │   │           ├── 4c47dc52
│   │   │           ├── 4c58a332
│   │   │           ├── 4cdf50fd
│   │   │           ├── 4d01bffb
│   │   │           ├── 4d2f83f7
│   │   │           ├── 4d78a390
│   │   │           ├── 4ed315c8
│   │   │           ├── 4f340aea
│   │   │           ├── 4f7636c4
│   │   │           ├── 4fe1f8a6
│   │   │           ├── 5014837f
│   │   │           ├── 50685dce
│   │   │           ├── 5088a5b2
│   │   │           ├── 50a7b1d6
│   │   │           ├── 50af67dd
│   │   │           ├── 50b941b1
│   │   │           ├── 518e6db2
│   │   │           ├── 5191235d
│   │   │           ├── 52059bbd
│   │   │           ├── 52a098ea
│   │   │           ├── 52fc01a1
│   │   │           ├── 53cddb52
│   │   │           ├── 5467f56d
│   │   │           ├── 54709ba1
│   │   │           ├── 54d30845
│   │   │           ├── 5556610b
│   │   │           ├── 55920610
│   │   │           ├── 559ad2c2
│   │   │           ├── 559b7e2b
│   │   │           ├── 563aaba5
│   │   │           ├── 563c5a5b
│   │   │           ├── 564b27ae
│   │   │           ├── 573ba778
│   │   │           ├── 57fc9d6b
│   │   │           ├── 59813190
│   │   │           ├── 59c632ba
│   │   │           ├── 5a2bad40
│   │   │           ├── 5b85805a
│   │   │           ├── 5c70eb54
│   │   │           ├── 5cadfe3f
│   │   │           ├── 5d4f31d2
│   │   │           ├── 5d92a678
│   │   │           ├── 5dca1a77
│   │   │           ├── 5e15371f
│   │   │           ├── 5edebc65
│   │   │           ├── 5f601d93
│   │   │           ├── 5f7ac527
│   │   │           ├── 5f7e7acf
│   │   │           ├── 5f919d1b
│   │   │           ├── 601a6a86
│   │   │           ├── 61f7bb7b
│   │   │           ├── 622b33b0
│   │   │           ├── 636599f0
│   │   │           ├── 63c4d173
│   │   │           ├── 65cde378
│   │   │           ├── 660988f2
│   │   │           ├── 66226d6a
│   │   │           ├── 664fec96
│   │   │           ├── 66718a50
│   │   │           ├── 67ae60c6
│   │   │           ├── 6824ca7e
│   │   │           ├── 684322c8
│   │   │           ├── 6843e15f
│   │   │           ├── 68ab12e6
│   │   │           ├── 694ec7e6
│   │   │           ├── 699cd661
│   │   │           ├── 6c301b7e
│   │   │           ├── 6c53203c
│   │   │           ├── 6d6d5f1c
│   │   │           ├── 6e21950d
│   │   │           ├── 6f06e5c8
│   │   │           ├── 70ea9bd2
│   │   │           ├── 712742d6
│   │   │           ├── 71bde3a2
│   │   │           ├── 71c316ce
│   │   │           ├── 72205076
│   │   │           ├── 72440b2a
│   │   │           ├── 7264f2d9
│   │   │           ├── 73ce854c
│   │   │           ├── 73dc70c8
│   │   │           ├── 73e61496
│   │   │           ├── 744355f7
│   │   │           ├── 74a37e35
│   │   │           ├── 753fef06
│   │   │           ├── 755cf1aa
│   │   │           ├── 7566a99c
│   │   │           ├── 7573aac0
│   │   │           ├── 758cf23f
│   │   │           ├── 75fcfd8c
│   │   │           ├── 761b3b68
│   │   │           ├── 764f1fcf
│   │   │           ├── 76532a09
│   │   │           ├── 7718e016
│   │   │           ├── 77f31fbb
│   │   │           ├── 7836a2db
│   │   │           ├── 78b374bb
│   │   │           ├── 78e935bf
│   │   │           ├── 78ec12fe
│   │   │           ├── 79562d72
│   │   │           ├── 7a29d76e
│   │   │           ├── 7aabfff5
│   │   │           ├── 7b81fa86
│   │   │           ├── 7ba1b446
│   │   │           ├── 7bbd0f9a
│   │   │           ├── 7c63e190
│   │   │           ├── 7c68ef6e
│   │   │           ├── 7c6cbfd7
│   │   │           ├── 7d2c66fe
│   │   │           ├── 7d43326e
│   │   │           ├── 7d8c3875
│   │   │           ├── 7d9fc342
│   │   │           ├── 7e5dbf8a
│   │   │           ├── 7e5ffa7b
│   │   │           ├── 7f8f0416
│   │   │           ├── 7faaa2b7
│   │   │           ├── 7fc846f5
│   │   │           ├── 7fe03be4
│   │   │           ├── 804cf119
│   │   │           ├── 80623fd1
│   │   │           ├── 8070252a
│   │   │           ├── 80b2e423
│   │   │           ├── 80cea747
│   │   │           ├── 80d419f1
│   │   │           ├── 80e0f000
│   │   │           ├── 8166bce3
│   │   │           ├── 8235ed93
│   │   │           ├── 828a1323
│   │   │           ├── 828ac9b3
│   │   │           ├── 82f17b98
│   │   │           ├── 83412358
│   │   │           ├── 844075b3
│   │   │           ├── 8480710b
│   │   │           ├── 857c6f29
│   │   │           ├── 85ee96ac
│   │   │           ├── 86d3f244
│   │   │           ├── 86f038a4
│   │   │           ├── 875d5b8b
│   │   │           ├── 877034f0
│   │   │           ├── 87d3f31a
│   │   │           ├── 8840590a
│   │   │           ├── 88d80057
│   │   │           ├── 88e0f645
│   │   │           ├── 88f715d0
│   │   │           ├── 89a78b27
│   │   │           ├── 8a650fbd
│   │   │           ├── 8aa2de4d
│   │   │           ├── 8b0142f4
│   │   │           ├── 8bb67756
│   │   │           ├── 8c431d24
│   │   │           ├── 8cee33a3
│   │   │           ├── 8cef7c80
│   │   │           ├── 8d72fcbe
│   │   │           ├── 8d7dc634
│   │   │           ├── 8f0d912a
│   │   │           ├── 8f360549
│   │   │           ├── 8fbef8ee
│   │   │           ├── 8fd2d67a
│   │   │           ├── 90925e8d
│   │   │           ├── 90a63966
│   │   │           ├── 90e6985d
│   │   │           ├── 90f34124
│   │   │           ├── 9222b63d
│   │   │           ├── 923b43eb
│   │   │           ├── 92e8e3a2
│   │   │           ├── 94439c59
│   │   │           ├── 9451c10a
│   │   │           ├── 94cd4d86
│   │   │           ├── 952b4cd6
│   │   │           ├── 954df96b
│   │   │           ├── 95847940
│   │   │           ├── 961a3019
│   │   │           ├── 963c3aee
│   │   │           ├── 973c40c2
│   │   │           ├── 97ea8261
│   │   │           ├── 9858c0ef
│   │   │           ├── 98f34ccb
│   │   │           ├── 992bebce
│   │   │           ├── 99757a15
│   │   │           ├── 99b6a49a
│   │   │           ├── 9a9f2251
│   │   │           ├── 9af85e0f
│   │   │           ├── 9b798567
│   │   │           ├── 9bd978ff
│   │   │           ├── 9c2a21eb
│   │   │           ├── 9c51850e
│   │   │           ├── 9c667eb9
│   │   │           ├── 9c6a3dce
│   │   │           ├── 9c8ecb47
│   │   │           ├── 9ccf5632
│   │   │           ├── 9d00c3f3
│   │   │           ├── 9d887cbe
│   │   │           ├── 9e25568a
│   │   │           ├── 9e3468c3
│   │   │           ├── 9e724a52
│   │   │           ├── 9ecfc170
│   │   │           ├── 9eee9b90
│   │   │           ├── 9f8fd60b
│   │   │           ├── 9f9db43a
│   │   │           ├── 9fa0bb5f
│   │   │           ├── a089927c
│   │   │           ├── a0a2d7c3
│   │   │           ├── a0e6c283
│   │   │           ├── a23e6884
│   │   │           ├── a339d434
│   │   │           ├── a490d57b
│   │   │           ├── a5bdcdc2
│   │   │           ├── a5d5052b
│   │   │           ├── a6305dfb
│   │   │           ├── a6a586d8
│   │   │           ├── a7e7dec4
│   │   │           ├── a873b209
│   │   │           ├── a98da92f
│   │   │           ├── a98e7733
│   │   │           ├── a9a31f40
│   │   │           ├── a9aa2ee8
│   │   │           ├── aa742600
│   │   │           ├── aa862e85
│   │   │           ├── aaff74f9
│   │   │           ├── ab3e95b6
│   │   │           ├── ab50a3c6
│   │   │           ├── ab7b7616
│   │   │           ├── abaad1bb
│   │   │           ├── ac2bd971
│   │   │           ├── ac609b63
│   │   │           ├── acddb56f
│   │   │           ├── acfd8818
│   │   │           ├── ad4a0ba9
│   │   │           ├── ae2aa98b
│   │   │           ├── ae5cd13f
│   │   │           ├── ae7303a9
│   │   │           ├── ae901c44
│   │   │           ├── ae965f4a
│   │   │           ├── af2048bf
│   │   │           ├── afe7f086
│   │   │           ├── b09df284
│   │   │           ├── b18f607b
│   │   │           ├── b20aa54b
│   │   │           ├── b23acf1c
│   │   │           ├── b26e8818
│   │   │           ├── b39cf02e
│   │   │           ├── b3c6e157
│   │   │           ├── b3cb61ef
│   │   │           ├── b4119dfa
│   │   │           ├── b414a5eb
│   │   │           ├── b5f81263
│   │   │           ├── b694a736
│   │   │           ├── b7e509a4
│   │   │           ├── b8ae7f8d
│   │   │           ├── b924c91d
│   │   │           ├── b9b788a7
│   │   │           ├── ba2d0e84
│   │   │           ├── bbc5b65c
│   │   │           ├── bca0268c
│   │   │           ├── bd1f064f
│   │   │           ├── be6e04a6
│   │   │           ├── be8e3c53
│   │   │           ├── bec154b0
│   │   │           ├── bf0ed511
│   │   │           ├── bf397f20
│   │   │           ├── bfc63af7
│   │   │           ├── bfd470c5
│   │   │           ├── c0aebe56
│   │   │           ├── c0c83417
│   │   │           ├── c191be05
│   │   │           ├── c295ee47
│   │   │           ├── c29f3de2
│   │   │           ├── c317d524
│   │   │           ├── c3e8235b
│   │   │           ├── c45def14
│   │   │           ├── c4aca27d
│   │   │           ├── c4b054d3
│   │   │           ├── c4b5657f
│   │   │           ├── c4e533e3
│   │   │           ├── c4ff2d84
│   │   │           ├── c5596213
│   │   │           ├── c5e63953
│   │   │           ├── c616432e
│   │   │           ├── c7e3c3b3
│   │   │           ├── c81e7cd4
│   │   │           ├── c82abdcb
│   │   │           ├── c9835781
│   │   │           ├── c9b05194
│   │   │           ├── c9b3658c
│   │   │           ├── c9c40a43
│   │   │           ├── ca71db21
│   │   │           ├── ca9c17ec
│   │   │           ├── cb39fc8b
│   │   │           ├── cc425018
│   │   │           ├── ccf37203
│   │   │           ├── cdcb9a3a
│   │   │           ├── cdf290ee
│   │   │           ├── ce41917b
│   │   │           ├── ce5f8bd8
│   │   │           ├── ce8bdb2c
│   │   │           ├── cf5fe6cc
│   │   │           ├── d01939e4
│   │   │           ├── d11ca801
│   │   │           ├── d1388c4a
│   │   │           ├── d149043c
│   │   │           ├── d1a24e6b
│   │   │           ├── d1beec17
│   │   │           ├── d1dce9a7
│   │   │           ├── d1e7c37a
│   │   │           ├── d2049875
│   │   │           ├── d245b2d1
│   │   │           ├── d2a639cd
│   │   │           ├── d2e353eb
│   │   │           ├── d2e71ea6
│   │   │           ├── d2fb1e9b
│   │   │           ├── d3c7f8b9
│   │   │           ├── d3ce9c60
│   │   │           ├── d3ef2551
│   │   │           ├── d449cc90
│   │   │           ├── d4a49a25
│   │   │           ├── d53d817d
│   │   │           ├── d5b339ce
│   │   │           ├── d626981b
│   │   │           ├── d630c505
│   │   │           ├── d688117d
│   │   │           ├── d6ef2e5f
│   │   │           ├── d77112d2
│   │   │           ├── d7ca2a2a
│   │   │           ├── d86b1b2a
│   │   │           ├── d8be5a18
│   │   │           ├── d90c912c
│   │   │           ├── da16af9a
│   │   │           ├── db79065b
│   │   │           ├── dc400b2c
│   │   │           ├── ddb123a1
│   │   │           ├── de16f5cb
│   │   │           ├── de2f4222
│   │   │           ├── dec7abb3
│   │   │           ├── dfd0d2ba
│   │   │           ├── dfe9ea14
│   │   │           ├── e05c5b1d
│   │   │           ├── e083bc25
│   │   │           ├── e14957ef
│   │   │           ├── e15a74c2
│   │   │           ├── e1787d1f
│   │   │           ├── e2d2db5c
│   │   │           ├── e3019385
│   │   │           ├── e3592d17
│   │   │           ├── e3f73ed5
│   │   │           ├── e4445f1f
│   │   │           ├── e45fd827
│   │   │           ├── e49015d8
│   │   │           ├── e4b4257f
│   │   │           ├── e66acb74
│   │   │           ├── e674a16c
│   │   │           ├── e6d3bb65
│   │   │           ├── e8dcb3aa
│   │   │           ├── e90dd27f
│   │   │           ├── eb2a18ff
│   │   │           ├── eb553518
│   │   │           ├── ebac0d45
│   │   │           ├── ecc4bf5b
│   │   │           ├── ed0a1bdd
│   │   │           ├── ed4d3f5c
│   │   │           ├── edaaaf57
│   │   │           ├── edd17ecf
│   │   │           ├── ee175f50
│   │   │           ├── ee42ba44
│   │   │           ├── ee820e7a
│   │   │           ├── ee985d54
│   │   │           ├── eeae78b4
│   │   │           ├── ef36498f
│   │   │           ├── ef6ee7db
│   │   │           ├── ef7cf0c4
│   │   │           ├── f0fa33bb
│   │   │           ├── f217bb8a
│   │   │           ├── f23718ea
│   │   │           ├── f26a34bf
│   │   │           ├── f2ce6811
│   │   │           ├── f3b1ca10
│   │   │           ├── f544413c
│   │   │           ├── f603b453
│   │   │           ├── f60c892d
│   │   │           ├── f6b8fa96
│   │   │           ├── f6e911ee
│   │   │           ├── f71f6d82
│   │   │           ├── f7923593
│   │   │           ├── f8e05e04
│   │   │           ├── f994d10f
│   │   │           ├── fa210d92
│   │   │           ├── fa606627
│   │   │           ├── fa7b1e5e
│   │   │           ├── fa91102b
│   │   │           ├── fa91e12e
│   │   │           ├── fabf3bdc
│   │   │           ├── fadf1a38
│   │   │           ├── fbc173a0
│   │   │           ├── fbe433f3
│   │   │           ├── fc486bc8
│   │   │           ├── fc5c650e
│   │   │           ├── fc62d5d5
│   │   │           ├── fc8d3fab
│   │   │           ├── fce51f1c
│   │   │           ├── fe33d933
│   │   │           ├── fe6cb72e
│   │   │           ├── fe6e8df3
│   │   │           ├── fef23548
│   │   │           ├── ffbe5609
│   │   │           └── ffd896a0
│   │   ├── CLAUDE.md
│   │   ├── Dockerfile
│   │   ├── Dockerfile.production
│   │   ├── dist/
│   │   │   ├── _triggerDigest.js
│   │   │   ├── config/
│   │   │   │   ├── affiliateConfig.js
│   │   │   │   └── regionConfig.js
│   │   │   ├── constants/
│   │   │   │   ├── cheatsheet.js
│   │   │   │   └── tierLimits.js
│   │   │   ├── controllers/ (128 files)
│   │   │   ├── helpers/
│   │   │   │   └── itemQueries.js
│   │   │   ├── index.js
│   │   │   ├── instrument.js
│   │   │   ├── jobs/ (29 files)
│   │   │   ├── lib/ (17 files)
│   │   │   ├── middleware/ (13 files)
│   │   │   ├── models/ (1 files)
│   │   │   ├── routes/ (113 files)
│   │   │   ├── services/ (68 files)
│   │   │   ├── types/ (2 files)
│   │   │   └── utils/ (13 files)
│   │   ├── docs/
│   │   │   └── EMAIL_SMS_REMINDERS.md
│   │   ├── nodemon.json
│   │   ├── package-lock.json
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── __tests__/
│   │   │   │   ├── auctionClosing.integration.ts
│   │   │   │   ├── auth.integration.ts
│   │   │   │   ├── emailReminders.e2e.ts
│   │   │   │   ├── payment.integration.ts
│   │   │   │   ├── reservation.integration.ts
│   │   │   │   ├── stripe.e2e.ts
│   │   │   │   └── weeklyDigest.e2e.ts
│   │   │   ├── _triggerDigest.ts
│   │   │   ├── config/
│   │   │   │   ├── affiliateConfig.ts
│   │   │   │   └── regionConfig.ts
│   │   │   ├── constants/
│   │   │   │   ├── cheatsheet.ts
│   │   │   │   └── tierLimits.ts
│   │   │   ├── controllers/ (139 files)
│   │   │   ├── helpers/
│   │   │   │   └── itemQueries.ts
│   │   │   ├── index.ts
│   │   │   ├── instrument.ts
│   │   │   ├── jobs/ (40 files)
│   │   │   ├── lib/ (17 files)
│   │   │   ├── middleware/ (13 files)
│   │   │   ├── models/ (1 files)
│   │   │   ├── routes/ (120 files)
│   │   │   ├── scripts/
│   │   │   │   ├── run-craigslist.ts
│   │   │   │   ├── run-estatesalesnet.ts
│   │   │   │   ├── run-eventbrite.ts
│   │   │   │   ├── run-foursquare-places.ts
│   │   │   │   ├── run-google-places.ts
│   │   │   │   ├── run-here-places.ts
│   │   │   │   ├── run-newspaper-rss.ts
│   │   │   │   ├── run-osm-overpass.ts
│   │   │   │   ├── run-search-facebook-events.ts
│   │   │   │   └── seed-crawl-queue.ts
│   │   │   ├── services/ (73 files)
│   │   │   ├── types/ (2 files)
│   │   │   └── utils/ (14 files)
│   │   └── tsconfig.json
│   ├── database/
│   │   ├── .env
│   │   ├── .env.example
│   │   ├── CLAUDE.md
│   │   ├── index.ts
│   │   ├── package-lock.json
│   │   ├── package.json
│   │   ├── prisma/
│   │   │   ├── EXPLORER_PROFILE_DECISION.md
│   │   │   ├── fix-seed-city.ts
│   │   │   ├── migrations/ (246 migrations)
│   │   │   ├── schema.prisma
│   │   │   ├── schema.prisma.backup
│   │   │   ├── schema.prisma.edit
│   │   │   ├── schema.prisma.working
│   │   │   ├── seed.ts
│   │   │   ├── seedEncyclopedia.ts
│   │   │   ├── seedWikidata.ts
│   │   │   └── survivor-seed.ts
│   │   └── tsconfig.json
│   ├── frontend/
│   │   ├── .env.local
│   │   ├── .env.local.example
│   │   ├── .gitignore
│   │   ├── C:\Users\desee\AppData\Local\Temp/
│   │   │   └── node-compile-cache/
│   │   │       └── v22.22.0-x64-9de703df-1629/
│   │   │           ├── 0014c7b4
│   │   │           ├── 00279342
│   │   │           ├── 010ca46c
│   │   │           ├── 01b7386d
│   │   │           ├── 025cf00f
│   │   │           ├── 02ef88e8
│   │   │           ├── 03f36f82
│   │   │           ├── 046957ae
│   │   │           ├── 04d9d011
│   │   │           ├── 057f0d84
│   │   │           ├── 05d88ffa
│   │   │           ├── 05fec450
│   │   │           ├── 06f773c7
│   │   │           ├── 0755c7a8
│   │   │           ├── 079d197c
│   │   │           ├── 084167c6
│   │   │           ├── 091ce0e2
│   │   │           ├── 09275b59
│   │   │           ├── 094e6b9e
│   │   │           ├── 09615a35
│   │   │           ├── 09a834fe
│   │   │           ├── 09dde953
│   │   │           ├── 0a1fa128
│   │   │           ├── 0a70f056
│   │   │           ├── 0aa851b3
│   │   │           ├── 0c5232a3
│   │   │           ├── 0d9f97b3
│   │   │           ├── 0da04cf5
│   │   │           ├── 0dc96296
│   │   │           ├── 0df25c63
│   │   │           ├── 0e0176ca
│   │   │           ├── 0f063766
│   │   │           ├── 0f0a7988
│   │   │           ├── 0f0c8433
│   │   │           ├── 0fd0b3f1
│   │   │           ├── 0fdd5abd
│   │   │           ├── 0fef87ad
│   │   │           ├── 100692d9
│   │   │           ├── 10123dee
│   │   │           ├── 1029d9b0
│   │   │           ├── 102ef5fd
│   │   │           ├── 10d84fd3
│   │   │           ├── 1148d269
│   │   │           ├── 1172e634
│   │   │           ├── 11cb2a80
│   │   │           ├── 11e1e7e1
│   │   │           ├── 11f1577f
│   │   │           ├── 12940077
│   │   │           ├── 12d6085e
│   │   │           ├── 13bd6df4
│   │   │           ├── 140a0144
│   │   │           ├── 140d3cf2
│   │   │           ├── 1449be6d
│   │   │           ├── 149ec42e
│   │   │           ├── 158a58e3
│   │   │           ├── 15dac900
│   │   │           ├── 164dc688
│   │   │           ├── 16ad2109
│   │   │           ├── 16b76a41
│   │   │           ├── 16e14a72
│   │   │           ├── 17793a2e
│   │   │           ├── 17bea670
│   │   │           ├── 17fb02de
│   │   │           ├── 181f3303
│   │   │           ├── 1827c055
│   │   │           ├── 18997b58
│   │   │           ├── 1978cd64
│   │   │           ├── 1a0b6a98
│   │   │           ├── 1a1a92fe
│   │   │           ├── 1a6b3ce5
│   │   │           ├── 1a80b874
│   │   │           ├── 1a9d421b
│   │   │           ├── 1ac49b5c
│   │   │           ├── 1b2a3a2a
│   │   │           ├── 1b6d87f9
│   │   │           ├── 1b8f0d0a
│   │   │           ├── 1b98654c
│   │   │           ├── 1bbb6102
│   │   │           ├── 1c575097
│   │   │           ├── 1e2212b8
│   │   │           ├── 1e79468d
│   │   │           ├── 1e880b66
│   │   │           ├── 1f186a71
│   │   │           ├── 1f4b8cdd
│   │   │           ├── 1f9b0e5c
│   │   │           ├── 204d30cc
│   │   │           ├── 207c7dae
│   │   │           ├── 20995dbb
│   │   │           ├── 214ffcb5
│   │   │           ├── 221af82a
│   │   │           ├── 22a111e0
│   │   │           ├── 232bb390
│   │   │           ├── 23a412ce
│   │   │           ├── 23c95ffc
│   │   │           ├── 23ea36aa
│   │   │           ├── 2442c1f5
│   │   │           ├── 24d32a8d
│   │   │           ├── 250f9c68
│   │   │           ├── 25cb1a0e
│   │   │           ├── 263f0e14
│   │   │           ├── 26489bb3
│   │   │           ├── 269c56d8
│   │   │           ├── 27141edb
│   │   │           ├── 2745aa53
│   │   │           ├── 27f07a12
│   │   │           ├── 27f09283
│   │   │           ├── 284df1ba
│   │   │           ├── 288dc48f
│   │   │           ├── 28cd767f
│   │   │           ├── 298138b1
│   │   │           ├── 29ae7849
│   │   │           ├── 2a432b43
│   │   │           ├── 2a8813f8
│   │   │           ├── 2bc0d199
│   │   │           ├── 2bdcf063
│   │   │           ├── 2c66374b
│   │   │           ├── 2ca3585d
│   │   │           ├── 2cbb34c0
│   │   │           ├── 2cc9283b
│   │   │           ├── 2d96951b
│   │   │           ├── 2dfc3763
│   │   │           ├── 2e55c3a5
│   │   │           ├── 2ecc8411
│   │   │           ├── 2fcd57fe
│   │   │           ├── 3029e332
│   │   │           ├── 304a34e9
│   │   │           ├── 30b81987
│   │   │           ├── 311bad02
│   │   │           ├── 32c3690e
│   │   │           ├── 336958ec
│   │   │           ├── 33ab5973
│   │   │           ├── 357ecf82
│   │   │           ├── 35ecf28e
│   │   │           ├── 35ff1778
│   │   │           ├── 373ef455
│   │   │           ├── 378d679f
│   │   │           ├── 37b3f1ce
│   │   │           ├── 382de301
│   │   │           ├── 38c12c3f
│   │   │           ├── 38c4fc01
│   │   │           ├── 391c424a
│   │   │           ├── 397a78c4
│   │   │           ├── 39c3aa58
│   │   │           ├── 3a2a3a4b
│   │   │           ├── 3a521e90
│   │   │           ├── 3a9df0e4
│   │   │           ├── 3beeef42
│   │   │           ├── 3c07ab31
│   │   │           ├── 3c2aa808
│   │   │           ├── 3c39e184
│   │   │           ├── 3c3fb401
│   │   │           ├── 3c96dce2
│   │   │           ├── 3ce37815
│   │   │           ├── 3cf102a9
│   │   │           ├── 3dcf6415
│   │   │           ├── 3e64441e
│   │   │           ├── 3e9f585a
│   │   │           ├── 3ef86212
│   │   │           ├── 3f3308c6
│   │   │           ├── 3f92d689
│   │   │           ├── 3fb014f3
│   │   │           ├── 3fbc5c53
│   │   │           ├── 40429bd2
│   │   │           ├── 422eb790
│   │   │           ├── 42dc0d32
│   │   │           ├── 4337c5df
│   │   │           ├── 436e0990
│   │   │           ├── 437deda3
│   │   │           ├── 43890356
│   │   │           ├── 4390ba1e
│   │   │           ├── 442e1715
│   │   │           ├── 45efdcd8
│   │   │           ├── 465030ee
│   │   │           ├── 4652bac2
│   │   │           ├── 468005ea
│   │   │           ├── 470228aa
│   │   │           ├── 4744f7d7
│   │   │           ├── 475bb660
│   │   │           ├── 47c80c91
│   │   │           ├── 47dd1147
│   │   │           ├── 47e91824
│   │   │           ├── 47ede548
│   │   │           ├── 48aa5edb
│   │   │           ├── 48d1f1c8
│   │   │           ├── 49430d8e
│   │   │           ├── 49d1006b
│   │   │           ├── 4a2f7337
│   │   │           ├── 4a31a215
│   │   │           ├── 4a7f67b1
│   │   │           ├── 4b9ee3ed
│   │   │           ├── 4bbd7e97
│   │   │           ├── 4c47dc52
│   │   │           ├── 4c58a332
│   │   │           ├── 4cdf50fd
│   │   │           ├── 4d01bffb
│   │   │           ├── 4d2f83f7
│   │   │           ├── 4d78a390
│   │   │           ├── 4ed315c8
│   │   │           ├── 4f340aea
│   │   │           ├── 4f7636c4
│   │   │           ├── 4fe1f8a6
│   │   │           ├── 5014837f
│   │   │           ├── 50685dce
│   │   │           ├── 5088a5b2
│   │   │           ├── 50a7b1d6
│   │   │           ├── 50af67dd
│   │   │           ├── 50b941b1
│   │   │           ├── 518e6db2
│   │   │           ├── 5191235d
│   │   │           ├── 52059bbd
│   │   │           ├── 52a098ea
│   │   │           ├── 52fc01a1
│   │   │           ├── 53cddb52
│   │   │           ├── 5467f56d
│   │   │           ├── 54709ba1
│   │   │           ├── 54d30845
│   │   │           ├── 5556610b
│   │   │           ├── 55920610
│   │   │           ├── 559ad2c2
│   │   │           ├── 559b7e2b
│   │   │           ├── 563aaba5
│   │   │           ├── 563c5a5b
│   │   │           ├── 564b27ae
│   │   │           ├── 573ba778
│   │   │           ├── 57fc9d6b
│   │   │           ├── 59813190
│   │   │           ├── 59c632ba
│   │   │           ├── 5a2bad40
│   │   │           ├── 5b85805a
│   │   │           ├── 5c70eb54
│   │   │           ├── 5cadfe3f
│   │   │           ├── 5d4f31d2
│   │   │           ├── 5d92a678
│   │   │           ├── 5dca1a77
│   │   │           ├── 5e15371f
│   │   │           ├── 5edebc65
│   │   │           ├── 5f601d93
│   │   │           ├── 5f7ac527
│   │   │           ├── 5f7e7acf
│   │   │           ├── 5f919d1b
│   │   │           ├── 601a6a86
│   │   │           ├── 61f7bb7b
│   │   │           ├── 622b33b0
│   │   │           ├── 636599f0
│   │   │           ├── 63c4d173
│   │   │           ├── 65cde378
│   │   │           ├── 660988f2
│   │   │           ├── 66226d6a
│   │   │           ├── 664fec96
│   │   │           ├── 66718a50
│   │   │           ├── 67ae60c6
│   │   │           ├── 6824ca7e
│   │   │           ├── 684322c8
│   │   │           ├── 6843e15f
│   │   │           ├── 68ab12e6
│   │   │           ├── 694ec7e6
│   │   │           ├── 699cd661
│   │   │           ├── 6c301b7e
│   │   │           ├── 6c53203c
│   │   │           ├── 6d6d5f1c
│   │   │           ├── 6e21950d
│   │   │           ├── 6f06e5c8
│   │   │           ├── 70ea9bd2
│   │   │           ├── 712742d6
│   │   │           ├── 71bde3a2
│   │   │           ├── 71c316ce
│   │   │           ├── 72205076
│   │   │           ├── 72440b2a
│   │   │           ├── 7264f2d9
│   │   │           ├── 73ce854c
│   │   │           ├── 73dc70c8
│   │   │           ├── 73e61496
│   │   │           ├── 744355f7
│   │   │           ├── 74a37e35
│   │   │           ├── 753fef06
│   │   │           ├── 755cf1aa
│   │   │           ├── 7566a99c
│   │   │           ├── 7573aac0
│   │   │           ├── 758cf23f
│   │   │           ├── 75fcfd8c
│   │   │           ├── 761b3b68
│   │   │           ├── 764f1fcf
│   │   │           ├── 76532a09
│   │   │           ├── 7718e016
│   │   │           ├── 77f31fbb
│   │   │           ├── 7836a2db
│   │   │           ├── 78b374bb
│   │   │           ├── 78e935bf
│   │   │           ├── 78ec12fe
│   │   │           ├── 79562d72
│   │   │           ├── 7a29d76e
│   │   │           ├── 7aabfff5
│   │   │           ├── 7b81fa86
│   │   │           ├── 7ba1b446
│   │   │           ├── 7bbd0f9a
│   │   │           ├── 7c63e190
│   │   │           ├── 7c68ef6e
│   │   │           ├── 7c6cbfd7
│   │   │           ├── 7d2c66fe
│   │   │           ├── 7d43326e
│   │   │           ├── 7d8c3875
│   │   │           ├── 7d9fc342
│   │   │           ├── 7e5dbf8a
│   │   │           ├── 7e5ffa7b
│   │   │           ├── 7f8f0416
│   │   │           ├── 7faaa2b7
│   │   │           ├── 7fc846f5
│   │   │           ├── 7fe03be4
│   │   │           ├── 804cf119
│   │   │           ├── 80623fd1
│   │   │           ├── 8070252a
│   │   │           ├── 80b2e423
│   │   │           ├── 80cea747
│   │   │           ├── 80d419f1
│   │   │           ├── 80e0f000
│   │   │           ├── 8166bce3
│   │   │           ├── 8235ed93
│   │   │           ├── 828a1323
│   │   │           ├── 828ac9b3
│   │   │           ├── 82f17b98
│   │   │           ├── 83412358
│   │   │           ├── 844075b3
│   │   │           ├── 8480710b
│   │   │           ├── 857c6f29
│   │   │           ├── 85ee96ac
│   │   │           ├── 86d3f244
│   │   │           ├── 86f038a4
│   │   │           ├── 875d5b8b
│   │   │           ├── 877034f0
│   │   │           ├── 87d3f31a
│   │   │           ├── 8840590a
│   │   │           ├── 88d80057
│   │   │           ├── 88e0f645
│   │   │           ├── 88f715d0
│   │   │           ├── 89a78b27
│   │   │           ├── 8a650fbd
│   │   │           ├── 8aa2de4d
│   │   │           ├── 8b0142f4
│   │   │           ├── 8bb67756
│   │   │           ├── 8c431d24
│   │   │           ├── 8cee33a3
│   │   │           ├── 8cef7c80
│   │   │           ├── 8d72fcbe
│   │   │           ├── 8d7dc634
│   │   │           ├── 8f0d912a
│   │   │           ├── 8f360549
│   │   │           ├── 8fbef8ee
│   │   │           ├── 8fd2d67a
│   │   │           ├── 90925e8d
│   │   │           ├── 90a63966
│   │   │           ├── 90e6985d
│   │   │           ├── 90f34124
│   │   │           ├── 9222b63d
│   │   │           ├── 923b43eb
│   │   │           ├── 92e8e3a2
│   │   │           ├── 94439c59
│   │   │           ├── 9451c10a
│   │   │           ├── 94cd4d86
│   │   │           ├── 952b4cd6
│   │   │           ├── 954df96b
│   │   │           ├── 95847940
│   │   │           ├── 961a3019
│   │   │           ├── 963c3aee
│   │   │           ├── 973c40c2
│   │   │           ├── 97ea8261
│   │   │           ├── 9858c0ef
│   │   │           ├── 98f34ccb
│   │   │           ├── 992bebce
│   │   │           ├── 99757a15
│   │   │           ├── 99b6a49a
│   │   │           ├── 9a9f2251
│   │   │           ├── 9af85e0f
│   │   │           ├── 9b798567
│   │   │           ├── 9bd978ff
│   │   │           ├── 9c2a21eb
│   │   │           ├── 9c51850e
│   │   │           ├── 9c667eb9
│   │   │           ├── 9c6a3dce
│   │   │           ├── 9c8ecb47
│   │   │           ├── 9ccf5632
│   │   │           ├── 9d00c3f3
│   │   │           ├── 9d887cbe
│   │   │           ├── 9e25568a
│   │   │           ├── 9e3468c3
│   │   │           ├── 9e724a52
│   │   │           ├── 9ecfc170
│   │   │           ├── 9eee9b90
│   │   │           ├── 9f8fd60b
│   │   │           ├── 9f9db43a
│   │   │           ├── 9fa0bb5f
│   │   │           ├── a089927c
│   │   │           ├── a0a2d7c3
│   │   │           ├── a0e6c283
│   │   │           ├── a23e6884
│   │   │           ├── a339d434
│   │   │           ├── a490d57b
│   │   │           ├── a5bdcdc2
│   │   │           ├── a5d5052b
│   │   │           ├── a6305dfb
│   │   │           ├── a6a586d8
│   │   │           ├── a7e7dec4
│   │   │           ├── a873b209
│   │   │           ├── a98da92f
│   │   │           ├── a98e7733
│   │   │           ├── a9a31f40
│   │   │           ├── a9aa2ee8
│   │   │           ├── aa742600
│   │   │           ├── aa862e85
│   │   │           ├── aaff74f9
│   │   │           ├── ab3e95b6
│   │   │           ├── ab50a3c6
│   │   │           ├── ab7b7616
│   │   │           ├── abaad1bb
│   │   │           ├── ac2bd971
│   │   │           ├── ac609b63
│   │   │           ├── acddb56f
│   │   │           ├── acfd8818
│   │   │           ├── ad4a0ba9
│   │   │           ├── ae2aa98b
│   │   │           ├── ae5cd13f
│   │   │           ├── ae7303a9
│   │   │           ├── ae901c44
│   │   │           ├── ae965f4a
│   │   │           ├── af2048bf
│   │   │           ├── afe7f086
│   │   │           ├── b09df284
│   │   │           ├── b18f607b
│   │   │           ├── b20aa54b
│   │   │           ├── b23acf1c
│   │   │           ├── b26e8818
│   │   │           ├── b39cf02e
│   │   │           ├── b3c6e157
│   │   │           ├── b3cb61ef
│   │   │           ├── b4119dfa
│   │   │           ├── b414a5eb
│   │   │           ├── b5f81263
│   │   │           ├── b694a736
│   │   │           ├── b7e509a4
│   │   │           ├── b8ae7f8d
│   │   │           ├── b924c91d
│   │   │           ├── b9b788a7
│   │   │           ├── ba2d0e84
│   │   │           ├── bbc5b65c
│   │   │           ├── bca0268c
│   │   │           ├── bd1f064f
│   │   │           ├── be6e04a6
│   │   │           ├── be8e3c53
│   │   │           ├── bec154b0
│   │   │           ├── bf0ed511
│   │   │           ├── bf397f20
│   │   │           ├── bfc63af7
│   │   │           ├── bfd470c5
│   │   │           ├── c0aebe56
│   │   │           ├── c0c83417
│   │   │           ├── c191be05
│   │   │           ├── c295ee47
│   │   │           ├── c29f3de2
│   │   │           ├── c317d524
│   │   │           ├── c3e8235b
│   │   │           ├── c45def14
│   │   │           ├── c4aca27d
│   │   │           ├── c4b054d3
│   │   │           ├── c4b5657f
│   │   │           ├── c4e533e3
│   │   │           ├── c4ff2d84
│   │   │           ├── c5596213
│   │   │           ├── c5e63953
│   │   │           ├── c616432e
│   │   │           ├── c7e3c3b3
│   │   │           ├── c81e7cd4
│   │   │           ├── c82abdcb
│   │   │           ├── c9835781
│   │   │           ├── c9b05194
│   │   │           ├── c9b3658c
│   │   │           ├── c9c40a43
│   │   │           ├── ca71db21
│   │   │           ├── ca9c17ec
│   │   │           ├── cb39fc8b
│   │   │           ├── cc425018
│   │   │           ├── ccf37203
│   │   │           ├── cdcb9a3a
│   │   │           ├── cdf290ee
│   │   │           ├── ce41917b
│   │   │           ├── ce5f8bd8
│   │   │           ├── ce8bdb2c
│   │   │           ├── cf5fe6cc
│   │   │           ├── d01939e4
│   │   │           ├── d11ca801
│   │   │           ├── d1388c4a
│   │   │           ├── d149043c
│   │   │           ├── d1a24e6b
│   │   │           ├── d1beec17
│   │   │           ├── d1dce9a7
│   │   │           ├── d1e7c37a
│   │   │           ├── d2049875
│   │   │           ├── d245b2d1
│   │   │           ├── d2a639cd
│   │   │           ├── d2e353eb
│   │   │           ├── d2e71ea6
│   │   │           ├── d2fb1e9b
│   │   │           ├── d3c7f8b9
│   │   │           ├── d3ce9c60
│   │   │           ├── d3ef2551
│   │   │           ├── d449cc90
│   │   │           ├── d4a49a25
│   │   │           ├── d53d817d
│   │   │           ├── d5b339ce
│   │   │           ├── d626981b
│   │   │           ├── d630c505
│   │   │           ├── d688117d
│   │   │           ├── d6ef2e5f
│   │   │           ├── d77112d2
│   │   │           ├── d7ca2a2a
│   │   │           ├── d86b1b2a
│   │   │           ├── d8be5a18
│   │   │           ├── d90c912c
│   │   │           ├── da16af9a
│   │   │           ├── db79065b
│   │   │           ├── dc400b2c
│   │   │           ├── ddb123a1
│   │   │           ├── de16f5cb
│   │   │           ├── de2f4222
│   │   │           ├── dec7abb3
│   │   │           ├── dfd0d2ba
│   │   │           ├── dfe9ea14
│   │   │           ├── e05c5b1d
│   │   │           ├── e083bc25
│   │   │           ├── e14957ef
│   │   │           ├── e15a74c2
│   │   │           ├── e1787d1f
│   │   │           ├── e2d2db5c
│   │   │           ├── e3019385
│   │   │           ├── e3592d17
│   │   │           ├── e3f73ed5
│   │   │           ├── e4445f1f
│   │   │           ├── e45fd827
│   │   │           ├── e49015d8
│   │   │           ├── e4b4257f
│   │   │           ├── e66acb74
│   │   │           ├── e674a16c
│   │   │           ├── e6d3bb65
│   │   │           ├── e8dcb3aa
│   │   │           ├── e90dd27f
│   │   │           ├── eb2a18ff
│   │   │           ├── eb553518
│   │   │           ├── ebac0d45
│   │   │           ├── ecc4bf5b
│   │   │           ├── ed0a1bdd
│   │   │           ├── ed4d3f5c
│   │   │           ├── edaaaf57
│   │   │           ├── edd17ecf
│   │   │           ├── ee175f50
│   │   │           ├── ee42ba44
│   │   │           ├── ee820e7a
│   │   │           ├── ee985d54
│   │   │           ├── eeae78b4
│   │   │           ├── ef36498f
│   │   │           ├── ef6ee7db
│   │   │           ├── ef7cf0c4
│   │   │           ├── f0fa33bb
│   │   │           ├── f217bb8a
│   │   │           ├── f23718ea
│   │   │           ├── f26a34bf
│   │   │           ├── f2ce6811
│   │   │           ├── f3b1ca10
│   │   │           ├── f544413c
│   │   │           ├── f603b453
│   │   │           ├── f60c892d
│   │   │           ├── f6b8fa96
│   │   │           ├── f6e911ee
│   │   │           ├── f7923593
│   │   │           ├── f8e05e04
│   │   │           ├── f994d10f
│   │   │           ├── fa210d92
│   │   │           ├── fa606627
│   │   │           ├── fa7b1e5e
│   │   │           ├── fa91102b
│   │   │           ├── fa91e12e
│   │   │           ├── fabf3bdc
│   │   │           ├── fadf1a38
│   │   │           ├── fbc173a0
│   │   │           ├── fbe433f3
│   │   │           ├── fc486bc8
│   │   │           ├── fc5c650e
│   │   │           ├── fc62d5d5
│   │   │           ├── fc8d3fab
│   │   │           ├── fce51f1c
│   │   │           ├── fe33d933
│   │   │           ├── fe6cb72e
│   │   │           ├── fe6e8df3
│   │   │           ├── fef23548
│   │   │           ├── ffbe5609
│   │   │           └── ffd896a0
│   │   ├── CLAUDE.md
│   │   ├── Dockerfile
│   │   ├── FEATURE_33_OG_META_WIRING.md
│   │   ├── claude_docs/
│   │   │   └── audits/
│   │   │       └── public-browse-audit-S604.md
│   │   ├── components/ (255 files)
│   │   ├── context/ (2 files)
│   │   ├── contexts/ (3 files)
│   │   ├── data/
│   │   │   ├── seo-pages/
│   │   │   │   ├── BUILD_GUIDE.md
│   │   │   │   ├── generate-seo-content.js
│   │   │   │   ├── generate.js
│   │   │   │   └── index.json
│   │   │   └── us-cities-3000.json
│   │   ├── hooks/ (70 files)
│   │   ├── lib/ (18 files)
│   │   ├── next-env.d.ts
│   │   ├── next-sitemap.config.js
│   │   ├── next.config.js
│   │   ├── package.json
│   │   ├── pages/ (70 files)
│   │   ├── postcss.config.js
│   │   ├── public/ (87 files)
│   │   ├── scripts/
│   │   │   ├── generate-seo-index.ts
│   │   │   └── generate-us-cities.ts
│   │   ├── sentry.client.config.ts
│   │   ├── sentry.edge.config.ts
│   │   ├── sentry.server.config.ts
│   │   ├── styles/ (3 files)
│   │   ├── tailwind.config.js
│   │   ├── tsconfig.json
│   │   ├── types/ (5 files)
│   │   └── utils/ (3 files)
│   ├── package-lock.json
│   ├── package.json
│   └── shared/
│       ├── CLAUDE.md
│       ├── imageProxyUtil.ts
│       ├── package.json
│       ├── src/
│       │   ├── cloudinaryUtils.ts
│       │   ├── constants/
│       │   │   ├── ebayCategories.ts
│       │   │   └── tagVocabulary.ts
│       │   ├── index.ts
│       │   ├── tierGate.ts
│       │   ├── types/ (7 files)
│       │   └── utils/ (1 files)
│       └── tsconfig.json
├── pnpm
├── pnpm-workspace.yaml
├── push.ps1
├── query.sql
├── railway.toml
├── reset-artifact-verification.js
├── rvm-a2p-10dlc-package.md
├── rvm-scripts-v1.md
├── rvm-scripts-v2.md
├── sale-progress-prototype.html
├── sale-progress-prototype.jsx
├── scripts/
│   ├── fix-seed-city.ts
│   ├── health-check.ts
│   ├── package-skill.sh
│   ├── session-wrap-check.ps1
│   ├── session-wrap-check.sh
│   ├── statusline-token-usage.sh
│   ├── stress-test.js
│   ├── test-archive-ph.mjs
│   ├── test-archive-scrape.mjs
│   ├── test-proxy-rotation.mjs
│   └── update-context.js
├── test-import.csv
├── updated-skills/
└── verify-ts.ps1

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
