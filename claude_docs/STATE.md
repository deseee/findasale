# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

Parallel path model active (5 tracks). MVP stable in Grand Rapids. Beta target: 6–8 weeks. CA1 (ToS) is next Claude task.

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

Parallel path model active. Session 76–77 batches complete.

- **CA7** — ✅ COMPLETE. `/guide` organizer guide page, expanded FAQ (shopper+organizer tabs), footer guide link, webhooks Zapier help link. Session 77.
- **CB4** — ✅ COMPLETE. Haiku prompt improved (tags field, estate-sale context, category/condition guidance). AITagResult includes `tags[]`. Feedback endpoint `/upload/ai-feedback`. add-items panel shows AI tags. Session 77.
- **CB5** — ✅ COMPLETE. TAGGER_URL/TAGGER_API_KEY legacy code removed from itemController.ts. analyzeItemTags now uses cloudAIService. .env vars deprecated. Ollama fallback prompt updated to include tags. TS syntax bug in treasureHuntService.ts fixed. Session 77.
- **CD2-P2 QR Codes** — ✅ COMPLETE. `SaleQRCode.tsx` component (qrserver.com API, download/print/copy). Wired to sale detail page Share sidebar + organizer dashboard per-sale toggle. utm_source=qr_sign tracking already in sales/[id].tsx. Session 77.
- **Treasure Hunt + Live Drop** — ✅ VERIFIED COMPLETE (prior session). TreasureHuntBanner, service, routes, item page integration, LiveDrop all confirmed shipped.

- **CA1** — ✅ COMPLETE. Full ToS + Privacy Policy + checkout consent checkbox. Pushed 2026-03-05.
- **CA5** — ✅ COMPLETE. Health scout: GREEN. Medium fixes shipped (M1/M2 message pagination take:200/100, M3 contactLimiter 5/15min). Pushed 2026-03-05.
- **CC3** — ✅ COMPLETE. Pricing analysis: competitors 13–20% vs FindA.Sale 5%. 4 options. Recommends flat 5%/7% for beta. ⚡ Patrick confirms?
- **CC1** — ✅ COMPLETE. Investor materials: exec summary, 12-slide pitch deck outline, 3-year financial model, TAM $150M. Pushed 2026-03-05.
- **CC2** — ✅ COMPLETE. Marketing content: 2 blog posts (organizer + shopper), social templates (IG/FB/GBP), 4 email templates, messaging pillars, hashtag bank. Pushed 2026-03-05.
- **CD4** — ✅ COMPLETE. Bi-weekly workflow review scheduled task (1st + 15th, 9AM). First run: March 15.
- **CD2 Phase 1** — ✅ COMPLETE. Scarcity counter + social proof stats bar. Pulsing "Only X left!" + "On Hold" / "Sold" badges. Pushed 2026-03-05.
- **CB1** — ✅ COMPLETE. `cloudAIService.ts` (Google Vision → Claude Haiku). `uploadController.ts` cloud AI primary, Ollama fallback. Pushed 2026-03-05.
- **CB3** — ✅ COMPLETE. AI tagging suggestions review panel in add-items. Apply/dismiss/rescan. No silent pre-fill. Pushed 2026-03-05.
- **P5** — ✅ Google Vision, Anthropic API, UptimeRobot DONE. Remaining: OAuth credentials, VAPID production confirm.
- **P6** — ✅ AI-generated SVG + PNG logos created (`claude_docs/brand/`). 4 PNG files: logo-icon-512.png, logo-primary.png, business-card-front.png, business-card-back.png — Vistaprint-ready. Pushed 2026-03-05.
- **P1** — Support email, business cards (use business-card-front/back.png from claude_docs/brand/), Google Business Profile (Patrick)
- **CA2** — ✅ COMPLETE. Schema validated (4 additive migrations pending Railway deploy). Migration runbook created. Pushed 2026-03-05.
- **CD1** — ✅ COMPLETE. Fraunces serif font, sage-green color palette added to Tailwind + _document. Pushed 2026-03-05.
- **CA3** — ✅ COMPLETE. Payment stress test map created. 2 bugs fixed: concurrent purchase auto-refund guard + $0.50 minimum check. Pushed 2026-03-05.
- **P2** — Stripe business account, Google Voice, Search Console (Patrick)

---

## Pending Manual Action (Blocks Beta Launch)

- **Phase 31 OAuth env vars** — ✅ DONE (2026-03-06). GOOGLE_CLIENT_ID/SECRET + FACEBOOK_CLIENT_ID/SECRET added to Vercel. Redirect URIs configured.
- **Support email** — ✅ DONE (2026-03-06). support@finda.sale email forwarding configured.
- **Railway migrations** — 4 migrations pending deploy (Live Drop, Treasure Hunt, Reverse Auction, StripeEvent). Run `prisma migrate deploy` via Railway CLI or confirm they auto-ran on last deploy.
- **Uptime monitoring** — ✅ UptimeRobot done (Patrick confirmed 2026-03-05).
- **Sentry** — ✅ Fully deployed. DSNs set in Railway + Vercel.
- **STRIPE_WEBHOOK_SECRET** — ✅ Set in Railway (2026-03-05).

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

Sessions 68–69 complete: favicon.ico + CA4 + CA6 shipped. Next: CD2 Phase 2 (engagement layer), CA7 (human documentation). Patrick: P1 business cards (PNG logo ready in claude_docs/brand/), P2 Stripe/Search Console, P5 OAuth credentials, apply Railway migrations (`prisma migrate deploy` runs on deploy — verify in Railway logs). Beta target: 6–8 weeks. Full roadmap: `claude_docs/roadmap.md`.

---

## Known Gotchas (Production)

- **Railway PORT mismatch** — `PORT=5000` locked in Railway Variables. Must match `EXPOSE 5000` in Dockerfile. Do not remove.
- **Neon production DB** — `prisma migrate deploy` must be run manually after any new migration. All 26 migrations applied to Neon as of 2026-03-05; 4 more pending (Live Drop, Treasure Hunt, Reverse Auction, StripeEvent).
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

- **favicon.ico** — ✅ COMPLETE. Multi-size ICO (16/32/48px) from logo-icon-512.png. `_document.tsx` updated with shortcut/icon links. Pushed 2026-03-05.
- **CA4** — ✅ COMPLETE. User flow audit (shopper/organizer/creator). 10 fixes shipped: search aria-label, purchases error handling, index refetch(), items/[id] retry, referral copy feedback. Open items logged in `claude_docs/ux-spotchecks/ca4-ca6-audit-2026-03-05.md`.
- **CA6** — ✅ COMPLETE. Feature polish: 5MB photo validation + server error surfacing, push notification toggle in organizer settings, onboarding step 3 copy improved, empty referrals state. Pushed 2026-03-05.

Last Updated: 2026-03-06 (session 79 — TS build fixes (flashDeal, leaderboard, wishlist, reverseAuction, itemController). AuthContext notificationPrefs added. Price drop alerts shipped. Accessibility improvements (ARIA, keyboard nav, skip-to-content). Sale countdown timer on cards + detail pages. ROADMAP.md regression fixed: v3 stale→v12 recovered from git history. Self-healing entries 33-35 added (MCP size pre-check, autocrlf rebase, roadmap regression). Remaining batch 7: social sharing, print inventory.)