# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

Parallel path model active (5 tracks). MVP stable in Grand Rapids. Beta target: 6–8 weeks.

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

Phases 1–13 + pre-beta audit + rebrand + Sprints A–X all verified and shipped (21 phases total).

Key milestones: JWT auth, sale management, Stripe payments, push notifications,
creator affiliates, auction UI + cron + 7% item-level fee, QR marketing,
virtual line scaffold, AI item tagging, Schema.org SEO, PWA hardening,
warm design system, bottom tab nav, full palette swap, skeleton components,
follow system + notification delivery, OAuth social login (NextAuth v4),
listing card redesign (LQIP blur-up + square + badges), social proof + activity feed,
photo lightbox, Hunt Pass points, creator tier program, shopper onboarding + empty states,
discovery + full-text search, review + rating system, shopper messaging,
reservation/hold UI, affiliate + referral program, weekly curator email,
CSV export, advanced photo pipeline (add/remove/reorder + ItemPhotoManager).
Post-launch: Ollama semantic search (U1), neighborhood landing pages (U2),
Socket.io live bidding (V1), instant payouts (V2), UGC bounties (V3),
shipping workflow (W1), label PDF (W2), Zapier webhooks (X1).

Full detail: `claude_docs/COMPLETED_PHASES.md`

---

## In Progress

Parallel path model active. Sessions 66–71 batches complete.

- **CA1** — ✅ COMPLETE. Full ToS + Privacy Policy + checkout consent checkbox. Pushed 2026-03-05.
- **CA2** — ✅ COMPLETE. Schema validated. Migration runbook created. Pushed 2026-03-05.
- **CA3** — ✅ COMPLETE. Payment stress test. 2 bugs fixed. Pushed 2026-03-05.
- **CA4** — ✅ COMPLETE. User flow audit. 10 fixes shipped. Pushed 2026-03-05.
- **CA4b** — ✅ COMPLETE. Remaining audit fixes: profile push toggle + error handling, categories/city error states, create-sale date validation, register.tsx WCAG labels. Pushed 2026-03-05.
- **CA5** — ✅ COMPLETE. Health scout: GREEN. Medium fixes shipped. Pushed 2026-03-05.
- **CA6** — ✅ COMPLETE. Feature polish: photo validation, push toggle, onboarding copy, empty states. Pushed 2026-03-05.
- **CA6b** — ✅ COMPLETE. Profile shopper push toggle, category/city/profile error states. Pushed 2026-03-05.
- **CA7** — ✅ COMPLETE. Human documentation: organizer guide, shopper FAQ, Zapier webhook docs. `claude_docs/guides/`. Pushed 2026-03-05.
- **CB1** — ✅ COMPLETE. `cloudAIService.ts` (Google Vision → Claude Haiku). Cloud AI primary, Ollama fallback. Pushed 2026-03-05.
- **CB3** — ✅ COMPLETE. AI tagging suggestions review panel in add-items. Pushed 2026-03-05.
- **CB4** — ✅ COMPLETE. Category-specific AI prompts (9 categories), improved title generation, tag deduplication. Pushed 2026-03-05.
- **CC1** — ✅ COMPLETE. Investor materials: exec summary, pitch deck outline, 3-year financial model. Pushed 2026-03-05.
- **CC2** — ✅ COMPLETE. Marketing content: blog posts, social templates, email templates. Pushed 2026-03-05.
- **CC3** — ✅ COMPLETE. Pricing analysis: 5%/7% confirmed for beta.
- **CD1** — ✅ COMPLETE. Fraunces serif + sage-green palette. Pushed 2026-03-05.
- **CD2 Phase 1** — ✅ COMPLETE. Scarcity counter + social proof stats bar. Pushed 2026-03-05.
- **CD2 Phase 2: Live Drop Events** — ✅ COMPLETE. isLiveDrop + liveDropAt schema, CountdownTimer component, teaser view, organizer form fields. Pushed 2026-03-05.
- **CD2 Phase 2: Personalized Weekly Email** — ✅ COMPLETE. `weeklyEmailService.ts`, cron Sunday 6pm. Pushed 2026-03-05.
- **CD2 Phase 3: Dynamic Pricing** — ✅ COMPLETE. `suggestPrice()` in cloudAIService.ts (Haiku estate sale pricing expert), `POST /api/items/ai/price-suggest` route, `PriceSuggestion.tsx` component, wired into item edit form. Pushed 2026-03-05.
- **CD4** — ✅ COMPLETE. Bi-weekly workflow review scheduled task. First run: March 15.
- **Organizer Onboarding Walkthrough** — ✅ COMPLETE. `OrganizerOnboardingModal.tsx` (5-step: welcome → create sale → add items → go live → dashboard). Shown once to new ORGANIZER users via localStorage flag. Pushed 2026-03-05.
- **Manual Single-Item Add Form** — ✅ COMPLETE. New "✏️ Manual Entry" tab in add-items alongside photo upload. Full form: title, description, price/auction toggle, category, condition, quantity. Pushed 2026-03-05.
- **creator/dashboard.tsx** — ✅ COMPLETE. Replaced placeholder analytics + settings tabs with real UI: referral stats, commission tier, recent referrals table, Stripe payout status, notification toggles. Pushed 2026-03-05.
- **Global React Error Boundary** — ✅ COMPLETE. `ErrorBoundary.tsx` class component (friendly fallback + dev error panel). Wraps `_app.tsx` with `key={router.asPath}` for auto-reset on navigation. Pushed 2026-03-05.
- **P5** — ✅ Google Vision, Anthropic API, UptimeRobot DONE. Remaining: OAuth credentials, VAPID production confirm.
- **P6** — ✅ AI-generated SVG + PNG logos created. Vistaprint-ready. Pushed 2026-03-05.
- **P1** — Support email, business cards (use business-card-front/back.png from claude_docs/brand/), Google Business Profile (Patrick)
- **P2** — Stripe business account, Google Voice, Search Console (Patrick)
- **favicon.ico** — ✅ COMPLETE. Multi-size ICO (16/32/48px). Pushed 2026-03-05.

---

## Pending Manual Action

- **Phase 31 OAuth env vars** — Social login dormant until added to Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`. Configure redirect URIs → `https://finda.sale/api/auth/callback/{google,facebook}`.
- **Live Drop migration** — New migration `20260305120000_add_live_drop` needs `prisma migrate deploy` on Railway/Neon. Use Railway CLI: `railway run -- sh -c "cd /app/packages/database && npx prisma migrate deploy"`
- **Uptime monitoring** — ✅ UptimeRobot done.
- **Sentry** — ✅ Fully deployed. DSNs set in Railway + Vercel.

---

## Deferred (Long-Term)

- Multi-metro expansion — Grand Rapids first, business decision
- Video-to-inventory — vision models not ready, revisit late 2026
- Real-user beta onboarding — human task
- CD2 Phase 2: Treasure Hunt Mode (complex, post-beta)
- CD2 Phase 3: AI Discovery Feed, Visual Search, Group Buying (post-beta)
- CD2 Phase 4: Reverse Auction, White-label MaaS (post-beta)

---

## Next Strategic Move

Session 71 complete: organizer onboarding + manual item add + creator dashboard + dynamic pricing + error boundary shipped.
Roadmap largely complete for beta readiness. Remaining Claude work: CD2 Phase 3 remaining moat features (AI Discovery Feed, Visual Search), beta hardening, or CB4 tuning based on real data.
Patrick: P1 business cards, P2 Stripe/Search Console, P5 OAuth credentials, run `prisma migrate deploy` on Railway (Live Drop migration pending).
Beta target: 6–8 weeks. Full roadmap: `claude_docs/roadmap.md`.

---

## Known Gotchas (Production)

- **Railway PORT mismatch** — `PORT=5000` locked in Railway Variables. Must match `EXPOSE 5000` in Dockerfile. Do not remove.
- **Neon production DB** — `prisma migrate deploy` must be run manually after any new migration. Live Drop migration pending.
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

Last Updated: 2026-03-05 (session 71 — organizer onboarding + manual item add + creator dashboard + CD2 dynamic pricing + error boundary. Pushed.)
