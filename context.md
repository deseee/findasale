# Dynamic Project Context
*Generated at 2026-03-06T02:19:06.234Z*

## Git Status
- **Branch:** (run git locally)
- **Commit:** (run git locally)
- **Remote:** (run git locally)

## Last Session
### 2026-03-05
**Worked on:** CB1: `cloudAIService.ts` (Google Vision REST → Claude Haiku chain, Ollama fallback), `uploadController.ts` updated. CA5 medium fixes: message pagination caps (take:200/100), `contactLimiter` (5/15min). CB3: AI suggestions review panel in add-items (Apply/Dismiss/Rescan — no silent pre-fill). CC2: marketing content doc (2 blog posts, social templates, 4 email templates). CA2: schema verified (4 additive migrations pending Railway), migration runbook created. CD1: Fraunces serif font + sage-green palette in Tailwind + `_document.tsx`. CA3: payment stress test doc, 2 Stripe bugs fixed (concurrent purchase auto-refund, $0.50 minimum guard). P6: AI-generated logo — initial SVG + PNG set, then full redesign to clean price tag icon after Patrick rejected phone/Q shape. Five final PNGs: logo-icon-512, logo-oauth-120, logo-primary, business-card-front, business-card-back.
**Decisions:** Logo concept: amber rounded-square bg, white price tag (pointing left), dark amber price lines inside. No magnifying glass. OAuth consent screen needs 120×120 square PNG — `logo-oauth-120.png` created. Business cards use Vistaprint 3.5×2" @ 300dpi (1050×600px).
**Next up:** CA4 (user flow audit — full shopper/organizer/creator journey, mobile + a11y), CA6 (feature polish — photo UX, push notifications, onboarding, empty states), CD2 Phase 2 (engagement layer). Patrick: order business cards (business-card-front/back.png in claude_docs/brand/), P2 (Stripe business account, Google Voice, Search Console), P5 OAuth credentials to Vercel.
**Blockers:** Brand PNGs generated locally but push agent hit token limit — need to verify GitHub has latest logo files. Patrick to confirm 5%/7% flat fee for beta (CC3). Railway migrations (4 pending) — should auto-run on next deploy.

## Health Status
No health reports yet — run health-scout skill.

## Docker
```
Docker status unavailable — run update-context.js locally (Windows) to capture container state
```

## Environment
- GitHub CLI: ✗ not authenticated (not required when GitHub MCP is active — check MCP tools at session start)
- ngrok tunnel: unknown (check Docker Desktop logs for findasale-ngrok-1)
- CLI tools: node

## Signals
⚠ Env drift — in .env.example but missing from .env: ANTHROPIC_MODEL, OLLAMA_URL, OLLAMA_VISION_MODEL
⚠ 1+ TODO/FIXME markers in source (showing up to 5):
  /sessions/lucid-dazzling-hawking/mnt/FindaSale/packages/backend/src/controllers/userController.ts:210:          // TODO: Implement notification system when ready

## Project File Tree
```
├── .env
├── .env.example
├── .gitattributes
├── .githooks/
│   ├── pre-commit
│   └── pre-push
├── .gitignore
├── CLAUDE.md
├── README.md
├── ai-config/
│   └── global-instructions.md
├── claude_docs/
│   ├── .last-wrap
│   ├── COMPLETED_PHASES.md
│   ├── CORE.md
│   ├── DEVELOPMENT.md
│   ├── OPS.md
│   ├── RECOVERY.md
│   ├── SECURITY.md
│   ├── SEED_SUMMARY.md
│   ├── STACK.md
│   ├── STATE.md
│   ├── archive/
│   │   ├── 2026-03-01.md
│   │   ├── 2026-03-02.md
│   │   ├── 2026-03-03.md
│   │   ├── 2026-03-05-health-check.json
│   │   ├── 2026-03-05.md
│   │   ├── beta-readiness-audit-2026-03-05.md
│   │   ├── ca4-ca6-audit-2026-03-05.md
│   │   ├── migration-runbook.md
│   │   ├── pre-beta-audit-2026-03-03.md
│   │   ├── rebrand-audit.md
│   │   └── workflow-audit-2026-03-03.md
│   ├── brand/
│   │   ├── README.md
│   │   ├── business-card-back.png
│   │   ├── business-card-front.png
│   │   ├── logo-icon-512.png
│   │   ├── logo-oauth-120.png
│   │   └── logo-primary.png
│   ├── changelog-tracker/
│   │   └── .gitkeep
│   ├── competitor-intel/
│   │   └── .gitkeep
│   ├── health-reports/
│   │   ├── .gitkeep
│   │   └── 2026-03-05-full-scan.md
│   ├── model-routing.md
│   ├── monthly-digests/
│   │   └── .gitkeep
│   ├── new 1.txt
│   ├── new 2.txt
│   ├── next-session-prompt.md
│   ├── patrick-language-map.md
│   ├── payment-stress-test.md
│   ├── pre-commit-check.md
│   ├── research/
│   │   ├── branding-brief-2026-03-05.md
│   │   ├── competitor-intel-2026-03-04.md
│   │   ├── feature-brainstorm-2026-03-05.md
│   │   ├── growth-channels-2026-03-04.md
│   │   ├── investor-materials-2026-03-05.md
│   │   ├── marketing-content-2026-03-05.md
│   │   ├── parallel-roadmap-2026-03-05.md
│   │   ├── parallel-roadmap-v2-2026-03-05.md
│   │   ├── pricing-analysis-2026-03-05.md
│   │   └── strategic-review-2026-03-05.md
│   ├── roadmap.md
│   ├── self_healing_skills.md
│   ├── session-log.md
│   ├── session-safeguards.md
│   ├── test_write
│   ├── ux-spotchecks/
│   │   └── .gitkeep
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
│   │   ├── Dockerfile.production
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
│   │   │   │   ├── bountyController.ts
│   │   │   │   ├── favoriteController.ts
│   │   │   │   ├── geocodeController.ts
│   │   │   │   ├── itemController.ts
│   │   │   │   ├── labelController.ts
│   │   │   │   ├── lineController.ts
│   │   │   │   ├── marketingKitController.ts
│   │   │   │   ├── messageController.ts
│   │   │   │   ├── notificationController.ts
│   │   │   │   ├── payoutController.ts
│   │   │   │   ├── pushController.ts
│   │   │   │   ├── referralController.ts
│   │   │   │   ├── reservationController.ts
│   │   │   │   ├── reviewController.ts
│   │   │   │   ├── saleController.ts
│   │   │   │   ├── stripeController.ts
│   │   │   │   ├── stripeStatusController.ts
│   │   │   │   ├── uploadController.ts
│   │   │   │   ├── userController.ts
│   │   │   │   └── webhookController.ts
│   │   │   ├── index.ts
│   │   │   ├── instrument.ts
│   │   │   ├── jobs/
│   │   │   │   ├── auctionJob.ts
│   │   │   │   ├── curatorEmailJob.ts
│   │   │   │   ├── emailReminderJob.ts
│   │   │   │   ├── notificationJob.ts
│   │   │   │   ├── reputationJob.ts
│   │   │   │   └── reservationExpiryJob.ts
│   │   │   ├── lib/
│   │   │   │   ├── prisma.ts
│   │   │   │   └── socket.ts
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts
│   │   │   ├── models/
│   │   │   │   └── LineEntry.ts
│   │   │   ├── routes/
│   │   │   │   ├── affiliate.ts
│   │   │   │   ├── auth.ts
│   │   │   │   ├── bounties.ts
│   │   │   │   ├── contact.ts
│   │   │   │   ├── favorites.ts
│   │   │   │   ├── feed.ts
│   │   │   │   ├── geocode.ts
│   │   │   │   ├── items.ts
│   │   │   │   ├── lines.ts
│   │   │   │   ├── messages.ts
│   │   │   │   ├── notifications.ts
│   │   │   │   ├── organizers.ts
│   │   │   │   ├── points.ts
│   │   │   │   ├── push.ts
│   │   │   │   ├── referrals.ts
│   │   │   │   ├── reservations.ts
│   │   │   │   ├── reviews.ts
│   │   │   │   ├── sales.ts
│   │   │   │   ├── search.ts
│   │   │   │   ├── stripe.ts
│   │   │   │   ├── upload.ts
│   │   │   │   ├── users.ts
│   │   │   │   └── webhooks.ts
│   │   │   ├── services/
│   │   │   │   ├── cloudAIService.ts
│   │   │   │   ├── emailReminderService.ts
│   │   │   │   ├── followerNotificationService.ts
│   │   │   │   ├── pointsService.ts
│   │   │   │   └── webhookService.ts
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
│   │   │   ├── migrations/ (28 migrations)
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
│   │   │   ├── BottomTabNav.tsx
│   │   │   ├── BountyModal.tsx
│   │   │   ├── CSVImportModal.tsx
│   │   │   ├── CheckoutModal.tsx
│   │   │   ├── FollowButton.tsx
│   │   │   ├── InstallPrompt.tsx
│   │   │   ├── ItemCard.tsx
│   │   │   ├── ItemPhotoManager.tsx
│   │   │   ├── Layout.tsx
│   │   │   ├── OnboardingModal.tsx
│   │   │   ├── PhotoLightbox.tsx
│   │   │   ├── PointsBadge.tsx
│   │   │   ├── PriceSuggestion.tsx
│   │   │   ├── RapidCapture.tsx
│   │   │   ├── ReputationTier.tsx
│   │   │   ├── ReviewsSection.tsx
│   │   │   ├── SaleCard.tsx
│   │   │   ├── SaleMap.tsx
│   │   │   ├── SaleMapInner.tsx
│   │   │   ├── SaleShareButton.tsx
│   │   │   ├── SaleSubscription.tsx
│   │   │   ├── Skeleton.tsx
│   │   │   ├── SkeletonCards.tsx
│   │   │   ├── StarRating.tsx
│   │   │   ├── TierBadge.tsx
│   │   │   └── ToastContext.tsx
│   │   ├── contexts/
│   │   │   └── ToastContext.tsx
│   │   ├── hooks/
│   │   │   ├── usePoints.ts
│   │   │   ├── usePushSubscription.ts
│   │   │   └── useUnreadMessages.ts
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── imageUtils.ts
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
│   │   │   │   ├── auth/
│   │   │   │   │   └── [...nextauth].ts
│   │   │   │   └── og.tsx
│   │   │   ├── categories/
│   │   │   │   └── [category].tsx
│   │   │   ├── city/
│   │   │   │   └── [city].tsx
│   │   │   ├── contact.tsx
│   │   │   ├── creator/
│   │   │   │   └── dashboard.tsx
│   │   │   ├── faq.tsx
│   │   │   ├── feed.tsx
│   │   │   ├── forgot-password.tsx
│   │   │   ├── index.tsx
│   │   │   ├── items/
│   │   │   │   └── [id].tsx
│   │   │   ├── login.tsx
│   │   │   ├── messages/
│   │   │   │   ├── [id].tsx
│   │   │   │   ├── index.tsx
│   │   │   │   └── new.tsx
│   │   │   ├── neighborhoods/
│   │   │   │   ├── [slug].tsx
│   │   │   │   └── index.tsx
│   │   │   ├── offline.tsx
│   │   │   ├── organizer/
│   │   │   │   ├── add-items/
│   │   │   │   │   └── [saleId].tsx
│   │   │   │   ├── add-items.tsx
│   │   │   │   ├── bounties.tsx
│   │   │   │   ├── create-sale.tsx
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── edit-item/
│   │   │   │   │   └── [id].tsx
│   │   │   │   ├── edit-sale/
│   │   │   │   │   └── [id].tsx
│   │   │   │   ├── holds.tsx
│   │   │   │   ├── line-queue/
│   │   │   │   │   └── [id].tsx
│   │   │   │   ├── payouts.tsx
│   │   │   │   ├── send-update/
│   │   │   │   │   └── [saleId].tsx
│   │   │   │   ├── settings.tsx
│   │   │   │   └── webhooks.tsx
│   │   │   ├── organizers/
│   │   │   │   └── [id].tsx
│   │   │   ├── privacy.tsx
│   │   │   ├── profile.tsx
│   │   │   ├── refer/
│   │   │   │   └── [code].tsx
│   │   │   ├── referral-dashboard.tsx
│   │   │   ├── register.tsx
│   │   │   ├── reset-password.tsx
│   │   │   ├── sales/
│   │   │   │   ├── [id].tsx
│   │   │   │   └── zip/
│   │   │   │       └── [zip].tsx
│   │   │   ├── search.tsx
│   │   │   ├── server-sitemap.xml.tsx
│   │   │   ├── shopper/
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── favorites.tsx
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
│   │   │   ├── favicon.ico
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
│   │   ├── sentry.client.config.ts
│   │   ├── sentry.edge.config.ts
│   │   ├── sentry.server.config.ts
│   │   ├── styles/
│   │   │   ├── globals.css
│   │   │   └── output.css
│   │   ├── tailwind.config.js
│   │   ├── tsconfig.json
│   │   ├── tsconfig.tsbuildinfo
│   │   └── types/
│   │       └── next-auth.d.ts
│   └── shared/
│       ├── CLAUDE.md
│       ├── package.json
│       ├── src/
│       │   └── index.ts
│       └── tsconfig.json
├── pnpm
├── pnpm-workspace.yaml
├── railway.toml
└── scripts/
    ├── health-check.ts
    ├── stress-test.js
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