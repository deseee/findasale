# Dynamic Project Context
*Generated at 2026-03-10T12:54:08.645Z*
*Run `node scripts/update-context.js` on Windows to refresh.*

## Last Session
### 2026-03-10
**Worked on:** (Session 121) Friction items 7 (bulk edit) + 13 (neighborhood autocomplete): backend `/bulk` endpoint extended for isActive/price ops, `add-items/[saleId].tsx` bulk UI (Select All, per-item checkboxes, amber highlight, Hide/Price toolbar), `create-sale.tsx` + `edit-sale/[id].tsx` neighborhood input+datalist. New schema field `isActive Boolean @default(true)` + migration `20260309000003_add_item_is_active`. Build fixes: template literal + Set spread errors, dashboard.tsx newline corruption (literal `\n` sequences). (Session 122) AI tagging architecture review documented (`claude_docs/feature-notes/ai-tagging-architecture.md`). Webcam capture added to add-items page (MediaDevices API, canvas JPEG, rapid-batch upload). Public item listing now filters `isActive=true` across all search paths (FTS, ILIKE, filtered, counts, getItemById, getItemsBySaleId). Upload pipeline P0/P1 fixes: Cloudinary URL validation, Haiku timeout/parse/rate-limit error capture, `isAiTagged` only set on AI success, feedback endpoint wired (CB4), retry button for failed analysis. **Overwrite incident:** dev agent replaced `itemController.ts` with stub (build broken) — restored via commit `7f6f2ebd`. (Session 123) Two follow-on fixes: `SmartInventoryUpload` isAiTagged Boolean() cast, `embedding: []` added to `createItem` (fixes P2011 null constraint on `Float[]` field).
**Decisions:** `isActive` added to Item schema to support hide/show without deletion. Webcam capture uses canvas JPEG compression before Cloudinary upload. Haiku error types distinguished (timeout vs parse vs rate-limit) for better retry UX. `embedding: []` is the correct default — `scheduleItemEmbedding` fills async after record creation.
**Token efficiency:** Sessions 121–123 used parallel agents. Overwrite incident in session 122 required restore + hotfix cycle. Session wrap docs not pushed — records gap for sessions 121–123.
**Token burn:** ~60k (121) + ~90k (122) + ~20k (123) est. Session wrap logs missing from GitHub.
**Next up:** Session 124 — Chrome audit of AI tagging + add-item flow (continuation). Deploy `20260309000003_add_item_is_active` migration to Neon. Session wrap docs push (STATE.md, session-log.md, next-session-prompt.md for sessions 121–123).
**Blockers:** Neon migration `20260309000003_add_item_is_active` not deployed. Session 122–123 wrap docs not pushed to GitHub.

## Health Status
Last scan: records-audit-sessions-110-118-2026-03-09
3 documentation drift items found. 2 are HIGH priority — features marked as open that

## Environment
- GitHub CLI: ✗ not authenticated (not required when GitHub MCP is active — check MCP tools at session start)
- CLI tools: node
- Dev stack: native (backend/frontend/postgres run natively on Windows — no Docker)

## Signals
⚠ Env drift — in .env.example but missing from .env: MAILERLITE_API_KEY, DEFAULT_CITY, DEFAULT_STATE, DEFAULT_STATE_ABBREV, DEFAULT_LAT, DEFAULT_LNG, DEFAULT_RADIUS_MILES, DEFAULT_COUNTY, DEFAULT_TIMEZONE
✓ TODOs: none found

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
├── AGENT_QUICK_REFERENCE.md
├── CLAUDE.md
├── README.md
├── STRIPE_WEBHOOK_HARDENING.md
├── ai-config/
│   └── global-instructions.md
├── claude_docs/
│   ├── .last-wrap
│   ├── CORE.md
│   ├── RECOVERY.md
│   ├── SECURITY.md
│   ├── SESSION_WRAP_PROTOCOL.md
│   ├── STACK.md
│   ├── STATE.md
│   ├── WRAP_PROTOCOL_QUICK_REFERENCE.md
│   ├── archive/ (0 files)
│   ├── audits/
│   │   ├── chrome-audit-session-124.md
│   │   ├── next-audit-brief-add-edit-item.md
│   │   └── session-125-edit-item-photo-audit.md
│   ├── beta-launch/ (5 files)
│   ├── brand/ (8 files)
│   ├── competitor-intel/ (1 files)
│   ├── feature-notes/ (7 files)
│   ├── guides/ (0 files)
│   ├── health-reports/ (1 files)
│   ├── improvement-memos/ (0 files)
│   ├── logs/ (2 files)
│   ├── marketing/
│   │   ├── content-pipeline/
│   │   │   └── spring-content-2026-03-09.md
│   │   └── spring-2026-content.md
│   ├── next-session-prompt.md
│   ├── operations/ (14 files)
│   ├── qa/
│   │   └── payment-edge-cases-2026-03-09.md
│   ├── research/ (2 files)
│   ├── security/
│   │   └── oauth-redteam-2026-03-09.md
│   ├── self-healing/ (1 files)
│   ├── session-log.md
│   ├── session-wraps/
│   │   └── session-124-wrap.md
│   ├── skills-package/ (27 files)
│   ├── strategy/ (4 files)
│   └── workflow-retrospectives/ (0 files)
├── docs/
│   └── CD2_PHASE2_TREASURE_HUNT.md
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
│   │   │   ├── controllers/ (52 files)
│   │   │   ├── index.ts
│   │   │   ├── instrument.ts
│   │   │   ├── jobs/ (11 files)
│   │   │   ├── lib/ (3 files)
│   │   │   ├── middleware/ (2 files)
│   │   │   ├── models/ (1 files)
│   │   │   ├── routes/ (54 files)
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
│   │   │   ├── migrations/ (73 migrations)
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── tsconfig.json
│   ├── frontend/
│   │   ├── .env.local
│   │   ├── .env.local.example
│   │   ├── .gitignore
│   │   ├── CLAUDE.md
│   │   ├── Dockerfile
│   │   ├── components/ (93 files)
│   │   ├── context/ (1 files)
│   │   ├── contexts/ (1 files)
│   │   ├── hooks/ (8 files)
│   │   ├── lib/ (3 files)
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
└── scripts/
    ├── health-check.ts
    ├── session-wrap-check.ps1
    ├── session-wrap-check.sh
    ├── stress-test.js
    └── update-context.js

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
