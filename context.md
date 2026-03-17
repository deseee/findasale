# Dynamic Project Context
*Generated at 2026-03-17T15:26:21.076Z*
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
⚠ Env drift — in .env.example but missing from .env: MAILERLITE_API_KEY, DEFAULT_CITY, DEFAULT_STATE, DEFAULT_STATE_ABBREV, DEFAULT_LAT, DEFAULT_LNG, DEFAULT_RADIUS_MILES, DEFAULT_COUNTY, DEFAULT_TIMEZONE
⚠ 5+ TODO/FIXME markers in source (showing up to 5):
  /sessions/nifty-compassionate-dijkstra/mnt/FindaSale/packages/backend/src/controllers/heatmapController.ts:26:    // TODO: Validate lat/lng/zoom bounds if needed in Phase 2
  /sessions/nifty-compassionate-dijkstra/mnt/FindaSale/packages/backend/src/controllers/itemController.ts:1026:        description: null, // TODO: Add description to schema if needed
  /sessions/nifty-compassionate-dijkstra/mnt/FindaSale/packages/backend/src/routes/items.ts:25:// TODO: Once shared is properly set up as a workspace dep with path aliases, import from '@findasale/shared'
  /sessions/nifty-compassionate-dijkstra/mnt/FindaSale/packages/backend/src/services/snoozeService.ts:96:  // TODO: Query Prisma for a snooze audit table (if implemented) to find expired snoozed subscribers
  /sessions/nifty-compassionate-dijkstra/mnt/FindaSale/packages/frontend/pages/organizer/add-items/[saleId].tsx:161:// TODO: Implement face detection with @tensorflow-models/coco-ssd

## Project File Tree
```
├── .checkpoint-manifest.json
├── .env
├── .env.example
├── .gitattributes
├── .githooks/
│   ├── pre-commit
│   └── pre-push
├── .gitignore
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
├── FEATURE25_AUDIT.txt
├── FEATURE_54_COMPLETION.md
├── IMPLEMENTATION_FINAL_REPORT.md
├── IMPLEMENTATION_SUMMARY.md
├── INSTALL-conversation-defaults-SKILL.md
├── INSTALL-conversation-defaults-rule27.md
├── INSTALL-push-coordinator-SKILL.md
├── MESSAGE_BOARD.json
├── README.md
├── S184-PUSH-INSTRUCTIONS.md
├── SPRINT2-PUSH-INSTRUCTIONS.md
├── TASK_18_COMPLETION_SUMMARY.md
├── TASK_18_HANDOFF.md
├── _tmp_79153_b78de4bad81704a77606cd957038642b
├── _tmp_79153_dd2c0afeeac46b8dda065f928d380dee
├── ai-config/
│   └── global-instructions.md
├── camera-mode-mockup.jsx
├── claude_docs/
│   ├── .last-wrap
│   ├── CORE.md
│   ├── RECOVERY.md
│   ├── SECURITY.md
│   ├── STACK.md
│   ├── STATE.md
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
│   │   └── ADR-PHASE4-BRIEF.md
│   ├── archive/ (14 files)
│   ├── beta-launch/ (5 files)
│   ├── brand/ (9 files)
│   ├── competitor-intel/ (2 files)
│   ├── decisions-log.md
│   ├── escalation-log.md
│   ├── feature-decisions/
│   │   ├── CAMERA_WORKFLOW_V2_ARCHITECTURE.md
│   │   ├── CASH_FEE_COLLECTION_ARCHITECTURE.md
│   │   ├── CASH_FEE_COLLECTION_SUMMARY.md
│   │   ├── FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md
│   │   ├── MANAGER_SUBAGENT_ARCHITECTURE.md
│   │   ├── PUSH_COORDINATOR_DELIVERY_SUMMARY.md
│   │   └── PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md
│   ├── feature-notes/ (18 files)
│   ├── guides/ (0 files)
│   ├── health-reports/ (4 files)
│   ├── improvement-memos/ (1 files)
│   ├── logs/ (2 files)
│   ├── marketing/
│   │   └── content-pipeline/
│   │       └── content-2026-03-16.md
│   ├── next-session-brief.md
│   ├── next-session-prompt.md
│   ├── operations/ (42 files)
│   ├── research/ (9 files)
│   ├── self-healing/ (1 files)
│   ├── self_healing_skills.md
│   ├── session-log-archive.md
│   ├── session-log.md
│   ├── skills-package/ (29 files)
│   ├── strategic/
│   │   └── advisory-board-adr-065-pricing-analysis-2026-03-16.md
│   ├── strategy/ (6 files)
│   ├── ux-spotchecks/
│   │   ├── PROMOTE_PAGE_UX_SPEC.md
│   │   └── add-items-ux-audit-2026-03-15.md
│   └── workflow-retrospectives/ (2 files)
├── conversation-defaults-SKILL.md
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
│   │   ├── docs/
│   │   │   └── EMAIL_SMS_REMINDERS.md
│   │   ├── nodemon.json
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── __tests__/
│   │   │   │   ├── emailReminders.e2e.ts
│   │   │   │   ├── stripe.e2e.ts
│   │   │   │   └── weeklyDigest.e2e.ts
│   │   │   ├── _triggerDigest.ts
│   │   │   ├── config/
│   │   │   │   └── regionConfig.ts
│   │   │   ├── controllers/ (91 files)
│   │   │   ├── helpers/
│   │   │   │   └── itemQueries.ts
│   │   │   ├── index.ts
│   │   │   ├── instrument.ts
│   │   │   ├── jobs/ (13 files)
│   │   │   ├── lib/ (7 files)
│   │   │   ├── middleware/ (5 files)
│   │   │   ├── models/ (1 files)
│   │   │   ├── routes/ (90 files)
│   │   │   ├── services/ (45 files)
│   │   │   ├── types/ (1 files)
│   │   │   └── utils/ (4 files)
│   │   └── tsconfig.json
│   ├── database/
│   │   ├── .env
│   │   ├── .env.example
│   │   ├── CLAUDE.md
│   │   ├── index.ts
│   │   ├── package-lock.json
│   │   ├── package.json
│   │   ├── prisma/
│   │   │   ├── migrations/ (105 migrations)
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── tsconfig.json
│   ├── frontend/
│   │   ├── .env.local
│   │   ├── .env.local.example
│   │   ├── .gitignore
│   │   ├── CLAUDE.md
│   │   ├── Dockerfile
│   │   ├── FEATURE_33_OG_META_WIRING.md
│   │   ├── components/ (142 files)
│   │   ├── context/ (1 files)
│   │   ├── contexts/ (2 files)
│   │   ├── hooks/ (36 files)
│   │   ├── lib/ (5 files)
│   │   ├── next-env.d.ts
│   │   ├── next-sitemap.config.js
│   │   ├── next.config.js
│   │   ├── package.json
│   │   ├── pages/ (52 files)
│   │   ├── postcss.config.js
│   │   ├── public/ (14 files)
│   │   ├── sentry.client.config.ts
│   │   ├── sentry.edge.config.ts
│   │   ├── sentry.server.config.ts
│   │   ├── styles/ (2 files)
│   │   ├── tailwind.config.js
│   │   ├── tsconfig.json
│   │   ├── types/ (5 files)
│   │   └── utils/ (1 files)
│   └── shared/
│       ├── CLAUDE.md
│       ├── package.json
│       ├── src/
│       │   ├── constants/
│       │   │   └── tagVocabulary.ts
│       │   ├── index.ts
│       │   ├── tierGate.ts
│       │   └── types/ (1 files)
│       └── tsconfig.json
├── pnpm
├── pnpm-workspace.yaml
├── push.ps1
├── railway.toml
├── scripts/
│   ├── health-check.ts
│   ├── package-skill.sh
│   ├── session-wrap-check.ps1
│   ├── session-wrap-check.sh
│   ├── statusline-token-usage.sh
│   ├── stress-test.js
│   └── update-context.js
└── v0-prompt.md

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
