# Dynamic Project Context
*Generated at 2026-03-07T21:39:36.990Z*
*Run `node scripts/update-context.js` on Windows to refresh.*

## Last Session
### 2026-03-07
**Worked on:**
- **Sprint 4b frontend (5 files):** `hooks/useItemSearch.ts` (React Query hook, `filtersFromQuery`, `useFilterSync` with shallow URL routing), `components/FilterSidebar.tsx` (desktop sticky sidebar + mobile full-screen drawer, 14 categories, 5 conditions, price range, sort, facet counts), `components/ItemSearchResults.tsx` (results grid, 8-card skeleton, empty/error states, pagination up to 7 page buttons), `components/ItemSearch.tsx` (300ms debounce, clear button, mobile filter toggle), `pages/search.tsx` (5 targeted edits integrating FTS into items tab — other tabs unchanged).
- **MailerLite spec rewrite:** Old spec used Tags tab (doesn't exist), Custom Event condition (doesn't exist), API v1. Rewrote `mailerlite-onboarding-automation-2026-03-07.md` for current UI: drag-and-drop builder, "Joins a group" trigger, Custom Field `sale_published` (not a Tag), exit condition via "Condition → Custom fields → Is set", API v2 endpoint `POST https://connect.mailerlite.com/api/subscribers`.
- **MailerLite backend wire-up:** Created `packages/backend/src/services/mailerliteService.ts` (upsert subscriber with `fields: { sale_published: "yes" }`, graceful no-op if key not set). Wired into `saleController.ts` PUBLISHED transition block (fire-and-forget `.then()`). Added `MAILERLITE_API_KEY` to `.env.example`.
- **TypeScript fix (`itemSearchService.ts`):** `ftsSearch` and `ilikeSearch` signatures used `Required<Omit<SearchQuery, 'q'>>` making optional filter fields required. Fixed to `Omit<SearchQuery, 'q'> & Required<Pick<SearchQuery, 'limit' | 'offset' | 'sort'>>`. `pnpm tsc --noEmit` passes clean on both packages.
**Decisions:** Sprint 4b items tab uses `/api/items/search` (FTS); all/sales tabs keep existing `/api/search` endpoint. No breaking changes to existing search behavior.
**Next up:** Sprint 5 — Seller Performance Dashboard. Patrick must add `MAILERLITE_API_KEY` to Railway and run `.\push.ps1` before testing.
**Blockers:** `MAILERLITE_API_KEY` not yet in Railway. Neon migration `20260310000001_add_item_fulltext_search_indexes` not yet deployed (needed for Sprint 4b end-to-end testing). Patrick to run `.\push.ps1`.

## Health Status
Last scan: health-scout-pre-beta-2026-03-07
Overall health is **STRONG** with no critical blockers identified. Sprint 3 (Shopper Loyalty Program with coupons) and Sprint 3.5 (code deGR-ification) are production-ready. All coupon validation logic correctly prevents negative totals, enforces minimum charge thresholds, and handles edge cases (expired coupons, wrong user, already-used). Region configuration successfully externalizes Grand Rapids defaults via environment variables with graceful fallbacks. The codebase shows consistent error handling, proper authentication on all sensitive endpoints, and secure webhook verification. Two minor recommendations relate to environment variable documentation completeness and a missing frontend env var reference.

## Environment
- GitHub CLI: ✗ not authenticated (not required when GitHub MCP is active — check MCP tools at session start)
- CLI tools: node
- Dev stack: native (backend/frontend/postgres run natively on Windows — no Docker)

## Signals
⚠ Env drift — in .env.example but missing from .env: MAILERLITE_API_KEY, DEFAULT_CITY, DEFAULT_STATE, DEFAULT_STATE_ABBREV, DEFAULT_LAT, DEFAULT_LNG, DEFAULT_RADIUS_MILES, DEFAULT_COUNTY, DEFAULT_TIMEZONE
✓ TODOs: none found

## Project File Tree
```
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
│   ├── archive/ (20 files)
│   ├── beta-launch/ (21 files)
│   ├── brand/ (9 files)
│   ├── competitor-intel/ (2 files)
│   ├── feature-notes/ (11 files)
│   ├── guides/ (6 files)
│   ├── health-reports/ (1 files)
│   ├── improvement-memos/ (4 files)
│   ├── logs/ (6 files)
│   ├── operations/ (7 files)
│   ├── research/ (13 files)
│   ├── self-healing/ (1 files)
│   ├── skills-package/ (21 files)
│   ├── strategy/ (5 files)
│   └── workflow-retrospectives/ (1 files)
├── docker-compose.yml
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
│   │   │   ├── controllers/ (51 files)
│   │   │   ├── index.ts
│   │   │   ├── instrument.ts
│   │   │   ├── jobs/ (11 files)
│   │   │   ├── lib/ (3 files)
│   │   │   ├── middleware/ (2 files)
│   │   │   ├── models/ (1 files)
│   │   │   ├── routes/ (53 files)
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
│   │   │   ├── migrations/ (66 migrations)
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── tsconfig.json
│   ├── frontend/
│   │   ├── .env.local
│   │   ├── .env.local.example
│   │   ├── CLAUDE.md
│   │   ├── Dockerfile
│   │   ├── components/ (92 files)
│   │   ├── context/ (1 files)
│   │   ├── contexts/ (1 files)
│   │   ├── hooks/ (8 files)
│   │   ├── lib/ (2 files)
│   │   ├── next-env.d.ts
│   │   ├── next-sitemap.config.js
│   │   ├── next.config.js
│   │   ├── package.json
│   │   ├── pages/ (47 files)
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
│   ├── session-wrap-check.ps1
│   ├── session-wrap-check.sh
│   ├── stress-test.js
│   └── update-context.js
├── test-write.txt
├── ziR1PxfV
└── ziTnO8qK

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
