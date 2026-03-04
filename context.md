# Dynamic Project Context
*Generated at 2026-03-04T16:42:28.385Z*

## Git Status
- **Branch:** (run git locally)
- **Commit:** (run git locally)
- **Remote:** (run git locally)

## Last Session
### 2026-03-04
**Worked on:** Full ROADMAP.md rewrite (v2) with deep research: competitor sentiment (estatesales.net 1.4★ Trustpilot, opaque fees, broken auctions; Facebook Marketplace flags "estate" as Fair Housing violation), UI/UX design system (warm palette, Montserrat/Inter typography, bottom tab nav, card redesign, onboarding flows), social layer (follow organizer, activity feeds, "Share Your Find" modal, dual-sided referral), growth channels (local partnerships, SEO arbitrage, Google Events, Google Play TWA), cross-industry mechanics (Pokemon GO, Fortnite battle pass, Supreme drops, TikTok Shop affiliates). OAuth promoted from deferred to Phase 31 (P1). Roadmap restructured into 5 pillars with phases 14–32. Context alignment audit: fixed stale facts in STACK.md, STATE.md, trimmed session-log.md.
**Decisions:** Full ROADMAP.md rewrites violated diff-only rule — will use targeted edits going forward. OAuth promoted because social login impacts organizer signup conversion directly.
**Next up:** Sprint A (Phase 12 auction completion) + Sprint B (Phase 24+25 design system) in parallel.
**Blockers:** None. Research-only session — no code changes.

## Health Status
Last scan: 2026-03-03
FindA.Sale is in **GREEN** status — no critical blockers found. The codebase has strong fundamentals: all routes use proper auth middleware, CORS is restricted, no hardcoded secrets, all Prisma `findMany` calls are paginated, and SSR-sensitive browser globals are properly guarded in `useEffect`/`onClick` handlers. One high-severity finding (password reset token logged to console) needs fixing before real user traffic arrives. Two medium items are cleanup-grade. This is the healthiest scan to date.

## Docker
```
Docker status unavailable — run update-context.js locally (Windows) to capture container state
```

## Environment
- GitHub CLI: ✗ not authenticated (not required when GitHub MCP is active — check MCP tools at session start)
- ngrok tunnel: unknown (check Docker Desktop logs for findasale-ngrok-1)
- CLI tools: node

## Signals
⚠ Env drift — in .env.example but missing from .env: HF_TOKEN
✓ TODOs: none found

## Project File Tree
```
├── .env
├── .env.example
├── .gitignore
├── CLAUDE.md
├── README.md
├── ai-config/
│   └── global-instructions.md
├── claude_docs/
│   ├── .last-wrap
│   ├── CORE.md
│   ├── DEVELOPMENT.md
│   ├── OPS.md
│   ├── RECOVERY.md
│   ├── ROADMAP.md
│   ├── SECURITY.md
│   ├── SEED_SUMMARY.md
│   ├── STACK.md
│   ├── STATE.md
│   ├── changelog-tracker/
│   │   └── .gitkeep
│   ├── competitor-intel/
│   │   └── .gitkeep
│   ├── feature-research-2026-03-04.md
│   ├── health-reports/
│   │   ├── .gitkeep
│   │   ├── 2026-03-01.md
│   │   ├── 2026-03-02.md
│   │   └── 2026-03-03.md
│   ├── monthly-digests/
│   │   └── .gitkeep
│   ├── next-session-prompt.md
│   ├── self_healing_skills.md
│   ├── session-log.md
│   ├── ux-spotchecks/
│   │   ├── .gitkeep
│   │   └── 2026-03-04.md
│   └── workflow-retrospectives/
│       └── .gitkeep
├── conversation-defaults Skill.md
├── docker-compose.yml
├── next
├── package.json
├── packages/
│   ├── backend/
│   │   ├── .env
│   │   ├── .env.example
│   │   ├── CLAUDE.md
│   │   ├── Dockerfile
│   │   ├── docs/
│   │   │   └── EMAIL_SMS_REMINDERS.md
│   │   ├── nodemon.json
│   │   ├── package.json
│   │   ├── services/
│   │   │   └── image-tagger/
│   │   │       ├── .coverage
│   │   │       ├── .coverage.claude.pid10229.XQC9qibx.H0CrSzLFxgoh
│   │   │       ├── .pytest_cache/
│   │   │       │   ├── .gitignore
│   │   │       │   ├── CACHEDIR.TAG
│   │   │       │   ├── README.md
│   │   │       │   └── v/
│   │   │       │       └── cache/
│   │   │       │           ├── lastfailed
│   │   │       │           └── nodeids
│   │   │       ├── Dockerfile
│   │   │       ├── TESTING_PROGRESS.md
│   │   │       ├── app.py
│   │   │       ├── docs/
│   │   │       │   ├── TAGGER_ACCURACY.md
│   │   │       │   ├── TAGGER_BENCHMARKS.md
│   │   │       │   ├── TAGGER_DESIGN.md
│   │   │       │   └── TAGGER_TROUBLESHOOTING.md
│   │   │       ├── pytest-cache-files-pv4rszl7/
│   │   │       ├── requirements-dev.txt
│   │   │       ├── requirements.txt
│   │   │       ├── setup.sh
│   │   │       ├── tagger.py
│   │   │       ├── templates/
│   │   │       │   └── index.html
│   │   │       └── tests/
│   │   │           ├── __init__.py
│   │   │           ├── conftest.py
│   │   │           ├── test_app.py
│   │   │           ├── test_app_simple.py
│   │   │           ├── test_tagger.py
│   │   │           └── test_tagger_simple.py
│   │   ├── src/
│   │   │   ├── __tests__/
│   │   │   │   ├── emailReminders.e2e.ts
│   │   │   │   ├── stripe.e2e.ts
│   │   │   │   └── weeklyDigest.e2e.ts
│   │   │   ├── _triggerDigest.ts
│   │   │   ├── controllers/
│   │   │   │   ├── affiliateController.ts
│   │   │   │   ├── authController.ts
│   │   │   │   ├── favoriteController.ts
│   │   │   │   ├── geocodeController.ts
│   │   │   │   ├── itemController.ts
│   │   │   │   ├── lineController.ts
│   │   │   │   ├── marketingKitController.ts
│   │   │   │   ├── notificationController.ts
│   │   │   │   ├── pushController.ts
│   │   │   │   ├── saleController.ts
│   │   │   │   ├── stripeController.ts
│   │   │   │   ├── stripeStatusController.ts
│   │   │   │   ├── uploadController.ts
│   │   │   │   └── userController.ts
│   │   │   ├── index.ts
│   │   │   ├── jobs/
│   │   │   │   ├── auctionJob.ts
│   │   │   │   ├── emailReminderJob.ts
│   │   │   │   └── notificationJob.ts
│   │   │   ├── lib/
│   │   │   │   └── prisma.ts
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts
│   │   │   ├── models/
│   │   │   │   └── LineEntry.ts
│   │   │   ├── routes/
│   │   │   │   ├── affiliate.ts
│   │   │   │   ├── auth.ts
│   │   │   │   ├── contact.ts
│   │   │   │   ├── favorites.ts
│   │   │   │   ├── geocode.ts
│   │   │   │   ├── items.ts
│   │   │   │   ├── lines.ts
│   │   │   │   ├── notifications.ts
│   │   │   │   ├── organizers.ts
│   │   │   │   ├── push.ts
│   │   │   │   ├── sales.ts
│   │   │   │   ├── stripe.ts
│   │   │   │   ├── upload.ts
│   │   │   │   └── users.ts
│   │   │   ├── services/
│   │   │   │   └── emailReminderService.ts
│   │   │   └── utils/
│   │   │       ├── stripe.ts
│   │   │       └── webpush.ts
│   │   └── tsconfig.json
│   ├── database/
│   │   ├── .env
│   │   ├── .env.example
│   │   ├── CLAUDE.md
│   │   ├── index.ts
│   │   ├── package-lock.json
│   │   ├── package.json
│   │   ├── prisma/
│   │   │   ├── migrations/ (16 migrations)
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── tsconfig.json
│   ├── frontend/
│   │   ├── .env.local
│   │   ├── .env.local.example
│   │   ├── CLAUDE.md
│   │   ├── Dockerfile
│   │   ├── components/
│   │   │   ├── AuctionCountdown.tsx
│   │   │   ├── AuthContext.tsx
│   │   │   ├── BadgeDisplay.tsx
│   │   │   ├── BidModal.tsx
│   │   │   ├── CSVImportModal.tsx
│   │   │   ├── CheckoutModal.tsx
│   │   │   ├── InstallPrompt.tsx
│   │   │   ├── ItemCard.tsx
│   │   │   ├── Layout.tsx
│   │   │   ├── SaleCard.tsx
│   │   │   ├── SaleMap.tsx
│   │   │   ├── SaleMapInner.tsx
│   │   │   ├── SaleShareButton.tsx
│   │   │   ├── SaleSubscription.tsx
│   │   │   ├── Skeleton.tsx
│   │   │   └── ToastContext.tsx
│   │   ├── contexts/
│   │   │   └── ToastContext.tsx
│   │   ├── hooks/
│   │   │   └── usePushSubscription.ts
│   │   ├── lib/
│   │   │   └── api.ts
│   │   ├── next-env.d.ts
│   │   ├── next-sitemap.config.js
│   │   ├── next.config.js
│   │   ├── package.json
│   │   ├── pages/
│   │   │   ├── 404.tsx
│   │   │   ├── 500.tsx
│   │   │   ├── _app.tsx
│   │   │   ├── _document.tsx
│   │   │   ├── about.tsx
│   │   │   ├── affiliate/
│   │   │   │   └── [id].tsx
│   │   │   ├── api/
│   │   │   │   └── og.tsx
│   │   │   ├── city/
│   │   │   │   └── [city].tsx
│   │   │   ├── contact.tsx
│   │   │   ├── creator/
│   │   │   │   └── dashboard.tsx
│   │   │   ├── faq.tsx
│   │   │   ├── forgot-password.tsx
│   │   │   ├── index.tsx
│   │   │   ├── items/
│   │   │   │   └── [id].tsx
│   │   │   ├── login.tsx
│   │   │   ├── offline.tsx
│   │   │   ├── organizer/
│   │   │   │   ├── add-items/
│   │   │   │   │   └── [saleId].tsx
│   │   │   │   ├── add-items.tsx
│   │   │   │   ├── create-sale.tsx
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── edit-item/
│   │   │   │   │   └── [id].tsx
│   │   │   │   ├── edit-sale/
│   │   │   │   │   └── [id].tsx
│   │   │   │   ├── line-queue/
│   │   │   │   │   └── [id].tsx
│   │   │   │   ├── send-update/
│   │   │   │   │   └── [saleId].tsx
│   │   │   │   └── settings.tsx
│   │   │   ├── organizers/
│   │   │   │   └── [id].tsx
│   │   │   ├── privacy.tsx
│   │   │   ├── profile.tsx
│   │   │   ├── referral-dashboard.tsx
│   │   │   ├── register.tsx
│   │   │   ├── reset-password.tsx
│   │   │   ├── sales/
│   │   │   │   ├── [id].tsx
│   │   │   │   └── zip/
│   │   │   │       └── [zip].tsx
│   │   │   ├── server-sitemap.xml.tsx
│   │   │   ├── shopper/
│   │   │   │   ├── dashboard.tsx
│   │   │   │   └── purchases.tsx
│   │   │   ├── terms.tsx
│   │   │   └── unsubscribe.tsx
│   │   ├── postcss.config.js
│   │   ├── public/
│   │   │   ├── fallback-OI8nXpndPrduP2yucmXrX.js
│   │   │   ├── fallback-UaNjxref6efOge_HGFwCr.js
│   │   │   ├── fallback-WBXriFD53-Yn3WC9tqMWi.js
│   │   │   ├── fallback-er3uCbRza2kFz6gsQte4u.js
│   │   │   ├── fallback-gNeuXxCbTqbTpJfL6SNTp.js
│   │   │   ├── icons/
│   │   │   │   ├── apple-touch-icon.png
│   │   │   │   ├── favicon-16x16.png
│   │   │   │   ├── favicon-32x32.png
│   │   │   │   ├── icon-128x128.png
│   │   │   │   ├── icon-144x144.png
│   │   │   │   ├── icon-152x152.png
│   │   │   │   ├── icon-192x192-maskable.png
│   │   │   │   ├── icon-192x192.png
│   │   │   │   ├── icon-384x384.png
│   │   │   │   ├── icon-512x512-maskable.png
│   │   │   │   ├── icon-512x512.png
│   │   │   │   ├── icon-72x72.png
│   │   │   │   └── icon-96x96.png
│   │   │   ├── images/
│   │   │   │   └── placeholder.svg
│   │   │   ├── manifest.json
│   │   │   ├── sw-push.js
│   │   │   ├── sw.js
│   │   │   └── workbox-5d03dacf.js
│   │   ├── styles/
│   │   │   ├── globals.css
│   │   │   └── output.css
│   │   ├── tailwind.config.js
│   │   ├── tsconfig.json
│   │   └── tsconfig.tsbuildinfo
│   └── shared/
│       ├── CLAUDE.md
│       ├── package.json
│       ├── src/
│       │   └── index.ts
│       └── tsconfig.json
├── pnpm
├── pnpm-workspace.yaml
└── scripts/
    └── update-context.js

```

## Tool & Skill Tree
MCP tools are injected at session start — check active tools before assuming availability.
```
MCP Connectors (check at session start):
├── mcp__github__*          — GitHub file push, PR, issues (repo: deseee/findasale)
├── mcp__Claude_in_Chrome__ — Browser automation, screenshots, form filling
├── mcp__MCP_DOCKER__       — Playwright browser, code execution
├── mcp__scheduled-tasks__  — Cron scheduling for recurring tasks
├── mcp__cowork__           — File access, directory requests, file presentation
└── mcp__mcp-registry__     — Search/suggest additional connectors

Skills (loaded on demand):
├── conversation-defaults   — AskUserQuestion workaround + diff-only gate (ALWAYS ACTIVE)
├── dev-environment         — Docker/DB/Prisma reference (load before shell commands)
├── context-maintenance     — Session wrap protocol (load at session end)
├── health-scout            — Proactive code scanning (load before deploys)
├── findasale-deploy        — Deploy checklist (load before production push)
├── skill-creator           — Create/edit/eval skills
├── docx / xlsx / pptx / pdf — Document creation skills
└── schedule                — Create scheduled tasks

Self-Healing Skills: 19 entries in claude_docs/self_healing_skills.md
Docker Containers: findasale-backend-1, findasale-frontend-1, findasale-postgres-1, findasale-image-tagger-1
```

## On-Demand References
Read these files only when the task requires them — they are not loaded by default.
- Schema: `packages/database/prisma/schema.prisma`
- Dependencies: `packages/*/package.json` (and root `package.json`)
- Env vars: `packages/*/.env.example`
- Stack decisions: `claude_docs/STACK.md`
- Project state: `claude_docs/STATE.md`
- Security rules: `claude_docs/SECURITY.md`
- Ops procedures: `claude_docs/OPS.md`
- Session history: `claude_docs/session-log.md`
