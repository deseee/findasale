# Dynamic Project Context
*Generated at 2026-03-06T08:05:35.610Z*

## Git Status
- **Branch:** (run git locally)
- **Commit:** (run git locally)
- **Remote:** (run git locally)

## Last Session
### 2026-03-05
**Worked on:** 25 roadmap items shipped across 5 parallel sessions. favicon.ico (multi-size ICO). CA4/CA6 remaining audit fixes (profile push toggle, error states, date validation, WCAG labels). CA7 human docs (organizer guide, shopper FAQ, Zapier docs) + in-app tooltips. CB4 AI quality (9 category prompts, title format, tag dedup). CD2 Phase 2 complete: Live Drop Events (CountdownTimer, schema), Personalized Weekly Email (cron), Treasure Hunt Mode (Haiku clues, Hunt Pass points), Smart Inventory Upload (batch photo → AI → items). CD2 Phase 3: Dynamic Pricing (suggestPrice() + PriceSuggestion.tsx), Visual Search (Vision labels → item search + VisualSearchButton). CD2 Phase 4: Reverse Auction (daily price drop cron, push notifications, organizer form). Organizer onboarding walkthrough, manual item add form, creator dashboard real content, global error boundary. Health fixes: SSR guards (3 pages), Prisma pagination (9 queries), contact rate limit, OAuth email dedup. Stripe webhook hardening (idempotency via StripeEvent table, dispute/payout handlers, Sentry). Beta Readiness Audit: CONDITIONAL GO.
**Decisions:** Beta target March 12–19, 2026. Verdict: CONDITIONAL GO — all tech ready, 4 Patrick actions block launch. Railway CLI migration path: `cd packages\database && railway run -- npx prisma migrate deploy`. Visual Search uses Vision API label matching (no vector DB). Reverse Auction cron at 6AM UTC.
**Next up:** Patrick: (1) OAuth creds → Vercel, (2) support@finda.sale email, (3) `prisma migrate deploy` (4 pending migrations), (4) STRIPE_WEBHOOK_SECRET in Railway. Then beta recruitment (P4). Claude: post-beta features (AI Discovery Feed, Buyer-to-Sale Matching) or P4 support.
**Blockers:** 4 pending Railway migrations (Live Drop, Treasure Hunt, Reverse Auction, StripeEvent). OAuth env vars not yet in Vercel. Support email not configured. STRIPE_WEBHOOK_SECRET not set in Railway.

## Health Status
Last scan: 2026-03-05
FindA.Sale is in **GREEN** status — excellent health for pre-beta. No critical or high

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
⚠ 2+ TODO/FIXME markers in source (showing up to 5):
  C:\Users\desee\ClaudeProjects\FindaSale\packages\backend\src\controllers\tierController.ts:90:    // TODO: add admin check here if needed
  C:\Users\desee\ClaudeProjects\FindaSale\packages\backend\src\controllers\userController.ts:210:          // TODO: Implement notification system when ready

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
├── EMAIL_TEMPLATE_SYSTEM.md
├── PRICE_ALERTS_IMPLEMENTATION.md
├── README.md
├── STRIPE_WEBHOOK_HARDENING.md
├── ai-config/
│   └── global-instructions.md
├── claude_docs/
│   ├── .last-wrap
│   ├── COMPLETED_PHASES.md
│   ├── CORE.md
│   ├── DEVELOPMENT.md
│   ├── OPS.md
│   ├── RECOVERY.md
│   ├── ROADMAP.md
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
│   │   ├── payment-stress-test.md
│   │   ├── pre-beta-audit-2026-03-03.md
│   │   ├── rebrand-audit.md
│   │   └── workflow-audit-2026-03-03.md
│   ├── brand/
│   │   ├── README.md
│   │   ├── business-card-back.png
│   │   ├── business-card-front.png
│   │   ├── logo-dark-bg.svg
│   │   ├── logo-icon-512.png
│   │   ├── logo-icon.svg
│   │   ├── logo-oauth-120.png
│   │   ├── logo-primary.png
│   │   └── logo-primary.svg
│   ├── changelog-tracker/
│   │   └── .gitkeep
│   ├── competitor-intel/
│   │   └── .gitkeep
│   ├── guides/
│   │   ├── organizer-guide.md
│   │   ├── shopper-faq.md
│   │   └── zapier-webhooks.md
│   ├── health-reports/
│   │   ├── .gitkeep
│   │   ├── 2026-03-05-full-scan.md
│   │   └── 2026-03-05.md
│   ├── migration-runbook.md
│   ├── model-routing.md
│   ├── monthly-digests/
│   │   └── .gitkeep
│   ├── new 1.txt
│   ├── new 2.txt
│   ├── next-session-prompt.md
│   ├── patrick-language-map.md
│   ├── pre-commit-check.md
│   ├── research/
│   │   ├── branding-brief-2026-03-05.md
│   │   ├── competitor-intel-2026-03-04.md
│   │   ├── feature-brainstorm-2026-03-05.md
│   │   ├── growth-channels-2026-03-04.md
│   │   ├── investor-materials-2026-03-05.md
│   │   ├── marketing-content-2026-03-05.md
│   │   ├── parallel-roadmap-v2-2026-03-05.md
│   │   ├── pricing-analysis-2026-03-05.md
│   │   └── strategic-review-2026-03-05.md
│   ├── self_healing_skills.md
│   ├── session-log.md
│   ├── session-safeguards.md
│   ├── test_write
│   ├── ux-spotchecks/
│   │   ├── .gitkeep
│   │   └── ca4-ca6-audit-2026-03-05.md
│   └── workflow-retrospectives/
│       └── .gitkeep
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
│   │   ├── services/
│   │   │   └── image-tagger/
│   │   │       ├── .coverage
│   │   │       ├── .coverage.claude.pid10229.XQC9qibx.H0CrSzLFxgoh
│   │   │       ├── Dockerfile
│   │   │       ├── TESTING_PROGRESS.md
│   │   │       ├── app.py
│   │   │       ├── docs/
│   │   │       │   ├── TAGGER_ACCURACY.md
│   │   │       │   ├── TAGGER_BENCHMARKS.md
│   │   │       │   ├── TAGGER_DESIGN.md
│   │   │       │   └── TAGGER_TROUBLESHOOTING.md
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
│   │   │   │   ├── adminController.ts
│   │   │   │   ├── affiliateController.ts
│   │   │   │   ├── authController.ts
│   │   │   │   ├── batchAnalyzeController.ts
│   │   │   │   ├── bountyController.ts
│   │   │   │   ├── buyingPoolController.ts
│   │   │   │   ├── favoriteController.ts
│   │   │   │   ├── flashDealController.ts
│   │   │   │   ├── geocodeController.ts
│   │   │   │   ├── insightsController.ts
│   │   │   │   ├── itemController.ts
│   │   │   │   ├── labelController.ts
│   │   │   │   ├── leaderboardController.ts
│   │   │   │   ├── lineController.ts
│   │   │   │   ├── marketingKitController.ts
│   │   │   │   ├── messageController.ts
│   │   │   │   ├── notificationController.ts
│   │   │   │   ├── notificationInboxController.ts
│   │   │   │   ├── payoutController.ts
│   │   │   │   ├── pickupController.ts
│   │   │   │   ├── plannerController.ts
│   │   │   │   ├── pushController.ts
│   │   │   │   ├── referralController.ts
│   │   │   │   ├── reservationController.ts
│   │   │   │   ├── reviewController.ts
│   │   │   │   ├── saleController.ts
│   │   │   │   ├── stripeController.ts
│   │   │   │   ├── stripeStatusController.ts
│   │   │   │   ├── tierController.ts
│   │   │   │   ├── uploadController.ts
│   │   │   │   ├── userController.ts
│   │   │   │   ├── waitlistController.ts
│   │   │   │   ├── webhookController.ts
│   │   │   │   └── wishlistController.ts
│   │   │   ├── index.ts
│   │   │   ├── instrument.ts
│   │   │   ├── jobs/
│   │   │   │   ├── abandonedCheckoutJob.ts
│   │   │   │   ├── auctionJob.ts
│   │   │   │   ├── curatorEmailJob.ts
│   │   │   │   ├── emailReminderJob.ts
│   │   │   │   ├── notificationJob.ts
│   │   │   │   ├── organizerWeeklyDigestJob.ts
│   │   │   │   ├── reputationJob.ts
│   │   │   │   ├── reservationExpiryJob.ts
│   │   │   │   ├── reverseAuctionJob.ts
│   │   │   │   ├── saleEndingSoonJob.ts
│   │   │   │   └── weeklyEmailJob.ts
│   │   │   ├── lib/
│   │   │   │   ├── prisma.ts
│   │   │   │   └── socket.ts
│   │   │   ├── middleware/
│   │   │   │   ├── adminAuth.ts
│   │   │   │   └── auth.ts
│   │   │   ├── models/
│   │   │   │   └── LineEntry.ts
│   │   │   ├── routes/
│   │   │   │   ├── admin.ts
│   │   │   │   ├── affiliate.ts
│   │   │   │   ├── auth.ts
│   │   │   │   ├── bounties.ts
│   │   │   │   ├── buyingPools.ts
│   │   │   │   ├── contact.ts
│   │   │   │   ├── favorites.ts
│   │   │   │   ├── feed.ts
│   │   │   │   ├── flashDeals.ts
│   │   │   │   ├── geocode.ts
│   │   │   │   ├── insights.ts
│   │   │   │   ├── items.ts
│   │   │   │   ├── leaderboard.ts
│   │   │   │   ├── lines.ts
│   │   │   │   ├── messages.ts
│   │   │   │   ├── notificationInbox.ts
│   │   │   │   ├── notifications.ts
│   │   │   │   ├── organizerDigest.ts
│   │   │   │   ├── organizers.ts
│   │   │   │   ├── pickup.ts
│   │   │   │   ├── planner.ts
│   │   │   │   ├── points.ts
│   │   │   │   ├── push.ts
│   │   │   │   ├── referrals.ts
│   │   │   │   ├── reservations.ts
│   │   │   │   ├── reviews.ts
│   │   │   │   ├── sales.ts
│   │   │   │   ├── search.ts
│   │   │   │   ├── streaks.ts
│   │   │   │   ├── stripe.ts
│   │   │   │   ├── tiers.ts
│   │   │   │   ├── treasureHunt.ts
│   │   │   │   ├── upload.ts
│   │   │   │   ├── users.ts
│   │   │   │   ├── waitlist.ts
│   │   │   │   ├── webhooks.ts
│   │   │   │   └── wishlists.ts
│   │   │   ├── services/
│   │   │   │   ├── buyerMatchService.ts
│   │   │   │   ├── cloudAIService.ts
│   │   │   │   ├── discoveryService.ts
│   │   │   │   ├── emailReminderService.ts
│   │   │   │   ├── emailTemplateService.ts
│   │   │   │   ├── followerNotificationService.ts
│   │   │   │   ├── notificationService.ts
│   │   │   │   ├── organizerAnalyticsService.ts
│   │   │   │   ├── pointsService.ts
│   │   │   │   ├── priceDropService.ts
│   │   │   │   ├── streakService.ts
│   │   │   │   ├── tierService.ts
│   │   │   │   ├── treasureHuntService.ts
│   │   │   │   ├── webhookService.ts
│   │   │   │   └── weeklyEmailService.ts
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
│   │   │   ├── migrations/ (46 migrations)
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── tsconfig.json
│   ├── frontend/
│   │   ├── .env.local
│   │   ├── .env.local.example
│   │   ├── CLAUDE.md
│   │   ├── Dockerfile
│   │   ├── components/
│   │   │   ├── ActivitySummary.tsx
│   │   │   ├── AuctionCountdown.tsx
│   │   │   ├── AuthContext.tsx
│   │   │   ├── BadgeDisplay.tsx
│   │   │   ├── BidModal.tsx
│   │   │   ├── BottomTabNav.tsx
│   │   │   ├── BountyModal.tsx
│   │   │   ├── BulkItemToolbar.tsx
│   │   │   ├── BuyingPoolCard.tsx
│   │   │   ├── CSVImportModal.tsx
│   │   │   ├── CheckoutModal.tsx
│   │   │   ├── CountdownTimer.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── FlashDealBanner.tsx
│   │   │   ├── FlashDealForm.tsx
│   │   │   ├── FlashDealsBanner.tsx
│   │   │   ├── FollowButton.tsx
│   │   │   ├── InstallPrompt.tsx
│   │   │   ├── ItemCard.tsx
│   │   │   ├── ItemListWithBulkSelection.tsx
│   │   │   ├── ItemPhotoManager.tsx
│   │   │   ├── Layout.tsx
│   │   │   ├── MyPickupAppointments.tsx
│   │   │   ├── NotificationBell.tsx
│   │   │   ├── NotificationPreferences.tsx
│   │   │   ├── OnboardingModal.tsx
│   │   │   ├── OnboardingWizard.tsx
│   │   │   ├── OrganizerOnboardingModal.tsx
│   │   │   ├── OrganizerTierBadge.tsx
│   │   │   ├── PhotoLightbox.tsx
│   │   │   ├── PickupBookingCard.tsx
│   │   │   ├── PickupSlotManager.tsx
│   │   │   ├── PointsBadge.tsx
│   │   │   ├── PriceSuggestion.tsx
│   │   │   ├── RapidCapture.tsx
│   │   │   ├── RecentlyViewed.tsx
│   │   │   ├── ReputationTier.tsx
│   │   │   ├── ReverseAuctionBadge.tsx
│   │   │   ├── ReviewsSection.tsx
│   │   │   ├── SaleCard.tsx
│   │   │   ├── SaleMap.tsx
│   │   │   ├── SaleMapInner.tsx
│   │   │   ├── SaleQRCode.tsx
│   │   │   ├── SaleShareButton.tsx
│   │   │   ├── SaleSubscription.tsx
│   │   │   ├── SalesNearYou.tsx
│   │   │   ├── SearchFilterPanel.tsx
│   │   │   ├── Skeleton.tsx
│   │   │   ├── SkeletonCards.tsx
│   │   │   ├── SmartInventoryUpload.tsx
│   │   │   ├── StarRating.tsx
│   │   │   ├── StreakWidget.tsx
│   │   │   ├── TierBadge.tsx
│   │   │   ├── ToastContext.tsx
│   │   │   ├── Tooltip.tsx
│   │   │   ├── TreasureHuntBanner.tsx
│   │   │   ├── VisualSearchButton.tsx
│   │   │   └── YourWishlists.tsx
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
│   │   │   ├── admin/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── sales.tsx
│   │   │   │   └── users.tsx
│   │   │   ├── affiliate/
│   │   │   │   └── [id].tsx
│   │   │   ├── api/
│   │   │   │   ├── auth/
│   │   │   │   │   └── [...nextauth].ts
│   │   │   │   └── og.tsx
│   │   │   ├── calendar.tsx
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
│   │   │   ├── guide.tsx
│   │   │   ├── index.tsx
│   │   │   ├── items/
│   │   │   │   └── [id].tsx
│   │   │   ├── leaderboard.tsx
│   │   │   ├── login.tsx
│   │   │   ├── map.tsx
│   │   │   ├── messages/
│   │   │   │   ├── [id].tsx
│   │   │   │   ├── index.tsx
│   │   │   │   └── new.tsx
│   │   │   ├── neighborhoods/
│   │   │   │   ├── [slug].tsx
│   │   │   │   └── index.tsx
│   │   │   ├── notifications.tsx
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
│   │   │   │   ├── insights.tsx
│   │   │   │   ├── line-queue/
│   │   │   │   │   └── [id].tsx
│   │   │   │   ├── payouts.tsx
│   │   │   │   ├── send-update/
│   │   │   │   │   └── [saleId].tsx
│   │   │   │   ├── settings.tsx
│   │   │   │   └── webhooks.tsx
│   │   │   ├── organizers/
│   │   │   │   └── [id].tsx
│   │   │   ├── plan.tsx
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
│   │   │   ├── unsubscribe.tsx
│   │   │   ├── wishlists/
│   │   │   │   └── shared/
│   │   │   │       └── [slug].tsx
│   │   │   └── wishlists.tsx
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
│   │       ├── bulk-items.ts
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
