# Dynamic Project Context
*Generated at 2026-03-04T00:27:17.057Z*

## Git Status
- **Branch:** (run git locally)
- **Commit:** (run git locally)
- **Remote:** (run git locally)

## Last Session
### 2026-03-04
**Worked on:** Fixed all 11 high-severity pre-beta audit findings. H1: organizer badges/rating in getSale. H2: Promise.allSettled for partial upload success. H3: email/name normalization on auth. H4: weekend filter Saturday edge case. H5: mobile card views for 3 dashboard tables. H6: loading="lazy" on 16 frontend files (Python script introduced JSX arrow-operator bug in SaleCard.tsx — caught and fixed). H7: Zod CSV row validation. H8: global Express error handler. H9: Stripe webhook secret guard. H10: CAN-SPAM one-click unsubscribe (email link + backend endpoint + /unsubscribe page). H11: Resend domain — already verified, no action needed. Track B: tested all 5 Docker-from-VM options (MCP registry ✗, TCP 2375/2376 ✗, SSH ✗, relay ✗) — accepted gap, documented in RECOVERY.md entry 17. All 27 changed files pushed to GitHub via MCP.
**Decisions:** Docker-from-VM gap is permanent unless Patrick manually enables TCP socket in Docker Desktop settings. Working pattern remains copy-paste PowerShell. Python lazy-load scripts that use regex on JSX must be reviewed for arrow-operator splits before committing.
**Next up:** Activate fixes in Docker (`docker compose restart backend`, then `docker compose build --no-cache frontend && docker compose up -d`). Then begin M1-M19 medium findings or move to real-user beta.
**Blockers:** None. All fixes pushed. Docker restart/rebuild required to activate on localhost.

## Health Status
Last scan: 2026-03-03
FindA.Sale is in **GREEN** status — no critical blockers found. The codebase has strong fundamentals: all routes use proper auth middleware, CORS is restricted, no hardcoded secrets, all Prisma `findMany` calls are paginated, and SSR-sensitive browser globals are properly guarded in `useEffect`/`onClick` handlers. One high-severity finding (password reset token logged to console) needs fixing before real user traffic arrives. Two medium items are cleanup-grade. This is the healthiest scan to date.

## Docker
```
Docker status unavailable — run update-context.js locally (Windows) to capture container state
```

## Environment
- GitHub: ✗ not authenticated (gh auth login to fix)
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
├── Session Wrap — 2026-03-03.txt
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
│   ├── audit-remaining-areas-2026-03-03.md
│   ├── changelog-tracker/
│   │   └── .gitkeep
│   ├── competitor-intel/
│   │   └── .gitkeep
│   ├── health-reports/
│   │   ├── .gitkeep
│   │   ├── 2026-03-01.md
│   │   ├── 2026-03-02.md
│   │   └── 2026-03-03.md
│   ├── monthly-digests/
│   │   └── .gitkeep
│   ├── next-session-prompt.md
│   ├── pre-beta-audit-2026-03-03.md
│   ├── rebrand-audit.md
│   ├── self_healing_skills.md
│   ├── session-log.md
│   ├── test_write
│   ├── ux-spotchecks/
│   │   └── .gitkeep
│   ├── workflow-audit-2026-03-03.md
│   └── workflow-retrospectives/
│       └── .gitkeep
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
│   │   │   │   ├── sales.ts
│   │   │   │   ├── stripe.ts
│   │   │   │   ├── upload.ts
│   │   │   │   └── users.ts
│   │   │   ├── services/
│   │   │   │   └── emailReminderService.ts
│   │   │   └── utils/
│   │   │       └── stripe.ts
│   │   └── tsconfig.json
│   ├── database/
│   │   ├── .env
│   │   ├── .env.example
│   │   ├── CLAUDE.md
│   │   ├── index.ts
│   │   ├── package-lock.json
│   │   ├── package.json
│   │   ├── prisma/
│   │   │   ├── migrations/ (14 migrations)
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── tsconfig.json
│   ├── frontend/
│   │   ├── .env.local
│   │   ├── .env.local.example
│   │   ├── CLAUDE.md
│   │   ├── Dockerfile
│   │   ├── components/
│   │   │   ├── AuthContext.tsx
│   │   │   ├── BadgeDisplay.tsx
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