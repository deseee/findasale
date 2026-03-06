# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**CONDITIONAL GO for beta.** Core complete. 3 Patrick actions block launch. Target: March 12–19, 2026.

---

## Locked Decisions

- 5% platform fee (regular), 7% platform fee (auction)
- Stripe Connect Express
- Leaflet + OSM maps, backend geocoding cache
- Cloudinary image storage
- PWA enabled
- Socket.io live bidding (Sprint V1 — shipped)
- Stripe Connect Express payouts (instant payout schedule — Sprint V2 — shipped)

---

## Completed Phases (summary)

Phases 1–13 + pre-beta audit + rebrand + Sprints A–X all verified and shipped (21 phases total). Full detail: `claude_docs/COMPLETED_PHASES.md`

---

## In Progress

Sessions 66–73 complete.

- **All CA1–CA7** ✅ ToS, schema, payments, audits, health, polish, docs, tooltips.
- **All CB1/CB3/CB4** ✅ Cloud AI tagging, review panel, category prompts.
- **All CC1–CC4** ✅ Investor materials, marketing, pricing, intel tasks.
- **All CD1, CD2 Phase 1** ✅ Branding, scarcity counter.
- **CD2 Phase 2: Live Drop Events** ✅ CountdownTimer, schema. 2026-03-05.
- **CD2 Phase 2: Personalized Weekly Email** ✅ weeklyEmailService, cron. 2026-03-05.
- **CD2 Phase 2: Treasure Hunt Mode** ✅ TreasureHunt schema, Haiku clues, banner, item Mark as Found. 2026-03-05.
- **CD2 Phase 2: Smart Inventory Upload** ✅ `POST /api/upload/batch-analyze`, SmartInventoryUpload.tsx 3-step wizard, batch AI → draft items → save all. Third tab in add-items. 2026-03-05.
- **CD2 Phase 3: Dynamic Pricing** ✅ suggestPrice() + PriceSuggestion.tsx. 2026-03-05.
- **CD2 Phase 3: Visual Search** ✅ `POST /api/search/visual` (Vision labels → item search), VisualSearchButton.tsx, wired into search.tsx. 2026-03-05.
- **CD2 Phase 4: Reverse Auction** ✅ reverseAuction/reverseDailyDrop/reverseFloorPrice/reverseStartDate on Item, migration, 6AM daily cron, push notifications to favorited users, ReverseAuctionBadge.tsx, organizer form. 2026-03-05.
- **CD4** ✅ Bi-weekly workflow review scheduled task.
- **Organizer Onboarding, Manual Item Add, creator/dashboard, Error Boundary** ✅
- **Health H1/H2/H3** ✅ SSR, pagination, rate limits, alert(), OAuth email.
- **Stripe Webhook Hardening** ✅ Idempotency (StripeEvent table), signature verify confirmed, dispute/payout/Connect handlers added, Sentry on error, fire-and-forget long ops. 2026-03-05.
- **Stripe Webhook Secret** ✅ Set in Railway. 2026-03-05.
- **Beta Readiness Audit** ✅ CONDITIONAL GO. Full doc: `claude_docs/beta-readiness-audit-2026-03-05.md`. 2026-03-05.
- **P5** ✅ Google Vision, Anthropic API, UptimeRobot done. Remaining: OAuth credentials, VAPID confirm.
- **P6** ✅ Logos, business cards.
- **P1** — Support email, business cards, Google Business Profile (Patrick)
- **P2** — Stripe business account, Google Voice, Search Console (Patrick)

---

## Pending Manual Action (Blocks Beta Launch)

1. **OAuth env vars** — Add to Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`. Redirect URIs → `https://finda.sale/api/auth/callback/{google,facebook}`. (~15 min)
2. **Support email** — Configure `support@finda.sale` forwarding via domain registrar. (~10 min)
3. **Railway migrations** — 4 pending migrations need `prisma migrate deploy`:
   - `20260305120000_add_live_drop`
   - `20260305130000_add_treasure_hunt`
   - `20260305140000_add_reverse_auction`
   - `stripe_event_idempotency`
   - Run: `cd packages\database && railway run -- npx prisma migrate deploy`
4. ~~**Stripe webhook secret**~~ ✅ Done 2026-03-05.

---

## Deferred (Post-Beta)

- AI Discovery Feed (ML on browse/buy signals — needs real data)
- Buyer-to-Sale Matching (ML — needs real data)
- Treasure Hunt mobile UX improvements
- Visual Search vector embeddings (upgrade from label matching)
- Group Buying Pools, White-label MaaS, Consignment Integration
- Video-to-inventory (vision models not ready)
- Multi-metro expansion

---

## Beta Launch Target

**March 12–19, 2026** — pending Patrick completing items 1–3 above.
Full go/no-go: `claude_docs/beta-readiness-audit-2026-03-05.md`

---

## Known Gotchas (Production)

- **Railway PORT mismatch** — `PORT=5000` locked. Must match `EXPOSE 5000` in Dockerfile.
- **Neon production DB** — 4 migrations pending (see above).
- **Dev stack is now native** — As of 2026-03-05, Docker is no longer used for core dev (backend/frontend/postgres run natively on Windows). Docker remains only for `image-tagger` (AI photo feature). See `claude_docs/DEVELOPMENT.md`.
- **Production seed:**
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
  $env:DATABASE_URL="postgresql://neondb_owner:npg_6CVGh8YvPSHg@ep-plain-sound-aeefcq1y-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
  $env:DIRECT_URL="postgresql://neondb_owner:npg_6CVGh8YvPSHg@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
  pnpm run db:generate
  npx prisma migrate deploy
  ```
  ⚠️ Seed clears all data — run intentionally.

---

## Constraints

- Token efficiency required — keep Tier 1 docs lean
- Diff-only updates
- Grand Rapids launch first

---

Last Updated: 2026-03-05 (session 74 — Stripe webhook ✅, native PostgreSQL stack complete, dev docs updated. 3 beta blockers remain.)
