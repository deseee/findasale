# Dynamic Project Context
*Generated at 2026-03-14T20:17:55.013Z*
*Run `node scripts/update-context.js` on Windows to refresh.*

## Last Session
No recent session found in log.

## Health Status
Last scan: records-audit-sessions-110-118-2026-03-09
3 documentation drift items found. 2 are HIGH priority — features marked as open that

## Environment
- GitHub CLI: ✗ not authenticated (not required when GitHub MCP is active — check MCP tools at session start)
- CLI tools: node
- Dev stack: native (backend/frontend/postgres run natively on Windows — no Docker)

## Signals
⚠ Env drift — in .env.example but missing from .env: MAILERLITE_API_KEY, DEFAULT_CITY, DEFAULT_STATE, DEFAULT_STATE_ABBREV, DEFAULT_LAT, DEFAULT_LNG, DEFAULT_RADIUS_MILES, DEFAULT_COUNTY, DEFAULT_TIMEZONE
⚠ 1+ TODO/FIXME markers in source (showing up to 5):
  /sessions/funny-amazing-mendel/mnt/FindaSale/packages/frontend/pages/organizer/add-items/[saleId].tsx:152:// TODO: Implement face detection with @tensorflow-models/coco-ssd

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
├── FEATURE_35_IMPLEMENTATION.md
├── FEATURE_35_WIRING_SNIPPETS.md
├── README.md
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
│   ├── archive/ (13 files)
│   ├── beta-launch/ (5 files)
│   ├── brand/ (8 files)
│   ├── competitor-intel/ (1 files)
│   ├── decisions-log.md
│   ├── escalation-log.md
│   ├── feature-decisions/
│   │   ├── CAMERA_WORKFLOW_V2_ARCHITECTURE.md
│   │   ├── CASH_FEE_COLLECTION_ARCHITECTURE.md
│   │   └── CASH_FEE_COLLECTION_SUMMARY.md
│   ├── feature-notes/ (11 files)
│   ├── guides/ (0 files)
│   ├── health-reports/ (1 files)
│   ├── logs/ (2 files)
│   ├── next-session-prompt.md
│   ├── operations/ (27 files)
│   ├── research/ (5 files)
│   ├── self-healing/ (1 files)
│   ├── session-log.md
│   ├── skills-package/ (30 files)
│   ├── strategy/ (4 files)
│   └── workflow-retrospectives/ (1 files)
├── next
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
│   │   │   ├── controllers/ (54 files)
│   │   │   ├── helpers/
│   │   │   │   └── itemQueries.ts
│   │   │   ├── index.ts
│   │   │   ├── instrument.ts
│   │   │   ├── jobs/ (13 files)
│   │   │   ├── lib/ (3 files)
│   │   │   ├── middleware/ (2 files)
│   │   │   ├── models/ (1 files)
│   │   │   ├── routes/ (55 files)
│   │   │   ├── services/ (19 files)
│   │   │   └── utils/ (2 files)
│   │   └── tsconfig.json
│   ├── database/
│   │   ├── .env
│   │   ├── .env.example
│   │   ├── CLAUDE.md
│   │   ├── index.ts
│   │   ├── package-lock.json
│   │   ├── package.json
│   │   ├── prisma/
│   │   │   ├── migrations/ (79 migrations)
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
│   │   ├── components/ (101 files)
│   │   ├── context/ (1 files)
│   │   ├── contexts/ (1 files)
│   │   ├── hooks/ (9 files)
│   │   ├── lib/ (4 files)
│   │   ├── next-env.d.ts
│   │   ├── next-sitemap.config.js
│   │   ├── next.config.js
│   │   ├── package.json
│   │   ├── pages/ (48 files)
│   │   ├── postcss.config.js
│   │   ├── public/ (14 files)
│   │   ├── sentry.client.config.ts
│   │   ├── sentry.edge.config.ts
│   │   ├── sentry.server.config.ts
│   │   ├── styles/ (2 files)
│   │   ├── tailwind.config.js
│   │   ├── tsconfig.json
│   │   ├── types/ (3 files)
│   │   └── utils/ (1 files)
│   └── shared/
│       ├── CLAUDE.md
│       ├── package.json
│       ├── src/
│       │   └── index.ts
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
