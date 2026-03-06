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

Phases 1–13 + pre-beta audit + rebrand + Sprints A–S all verified and shipped (21 phases total).
Sprints T–X complete 2026-03-05.

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

Parallel path model active. Session 66–67 batches complete.

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

## Pending Manual Action

- **Phase 31 OAuth env vars** — Social login dormant until added to Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`. Configure redirect URIs → `https://finda.sale/api/auth/callback/{google,facebook}`.
- **Uptime monitoring** — ✅ UptimeRobot done (Patrick confirmed 2026-03-05).
- **Sentry** — ✅ Fully deployed. `@sentry/node` (backend) + `@sentry/nextjs` (frontend) wired and running in Docker. Lockfile committed. Vercel deployed. DSNs set in Railway + Vercel. Test: add `/sentry-test` route → verify event in Sentry dashboard → remove route.

---

## Deferred (Long-Term)

- Multi-metro expansion — Grand Rapids first, business decision
- Video-to-inventory — vision models not ready, revisit late 2026
- Real-user beta onboarding — human task

---

## Next Strategic Move

Sessions 66–67 complete: CA2+CA3+CD1+CB1+CB3+CC2 shipped. Next: CA4 (user flow audit), CA6 (feature polish), CD2 Phase 2 (engagement layer). Patrick: P1 business cards (PNG logo ready in claude_docs/brand/), P2 Stripe/Search Console, P5 OAuth credentials, apply Railway migrations (`prisma migrate deploy` runs on deploy — verify in Railway logs). Beta target: 6–8 weeks. Full roadmap: `claude_docs/roadmap.md`.

---

## Known Gotchas (Production)

- **Railway PORT mismatch** — `PORT=5000` locked in Railway Variables. Must match `EXPOSE 5000` in Dockerfile. Do not remove.
- **Neon production DB** — `prisma migrate deploy` must be run manually after any new migration. All 26 migrations applied to both Neon and local Docker as of 2026-03-05.
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

Last Updated: 2026-03-05 (session 68 — CB1+CB3+CA2+CA3+CD1+CC2+P6 complete. PNG logos generated (Vistaprint-ready). STATE.md updated.)