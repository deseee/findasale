# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

Session 86 complete. Production outage recovered (ERR_REQUIRE_ESM from uuid@13 → crypto.randomUUID, Dockerfile --no-frozen-lockfile escape hatch for Railway). Organizer.website schema drift fixed (P2022 → manual migration applied, 62 Neon migrations total). Workflow audit completed (8 recovered turns documented, 5 self-healing entries #41–45 added). CORE.md lockfile rule + session-safeguards Production Startup Failures section added. Dockerfile.production still on --no-frozen-lockfile (temporary escape hatch — restore next session). Beta GO status unchanged.

---

## Locked Decisions

- **BUSINESS_PLAN.md** — Tier 1 Strategic Authority Document (created 2026-03-06). All business strategy, market analysis, financial projections, competitive positioning, and go-to-market strategy defined here. Reference for all strategic decisions.
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
- **Neon migrations** — ✅ 62 migrations applied to Neon production (last: 20260307000038_add_organizer_website). No pending migrations.
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

**Status: GO.** All 8 audit work paths complete (session 84). All 4 critical code fixes shipped (session 85).

**4 critical code fixes — ✅ COMPLETE (session 85):**
- C1: ✅ JWT fallback secret removed, env var validation guard added on startup
- C2: ✅ Password reset rate-limited (5/hr) via express-rate-limit on `/auth/forgot-password`
- C3: ✅ `/api/upload/ai-feedback-stats` protected with `authenticate` + `requireAdmin` middleware
- C4: ✅ Stripe webhook secret rotation plan documented in OPS.md

**Patrick's 5 blocking items:**
1. Confirm 5%/7% fee (locked in STACK.md but never verbally confirmed)
2. Set up Stripe business account
3. Google Search Console verification
4. Order business cards (design ready in `claude_docs/brand/`)
5. Start beta organizer outreach (`claude_docs/beta-launch/organizer-outreach.md` + `marketing-calendar-2026-03-06.md`)
6. Rotate Neon credentials (were in committed history — scrubbed but should be rotated)
7. Optional: consult Michigan attorney re estate sale permit (~$300–500)

Full audit reports: `claude_docs/health-reports/qa-pre-beta-audit-2026-03-06.md`, `claude_docs/beta-launch/ops-readiness-2026-03-06.md`
Beta checklist: `claude_docs/BETA_CHECKLIST.md`

---

## Known Gotchas (Production)

- **Railway PORT mismatch** — `PORT=5000` locked in Railway Variables. Must match `EXPOSE 5000` in Dockerfile. Do not remove.
- **Neon production DB** — `prisma migrate deploy` must be run manually after any new migration. 62 migrations applied to Neon as of 2026-03-07. Last: `20260307000038_add_organizer_website`.
- **Dockerfile.production** — Currently using `--no-frozen-lockfile` (emergency escape hatch from session 86). Restore to `--frozen-lockfile` after running `pnpm install` and pushing a clean lockfile.
- **Git push workflow** — Patrick uses `.\push.ps1` (repo root) instead of raw `git push`. Self-heals: index.lock, CRLF phantoms, fetch+merge (never rebase). See self-healing entry #36.
- **Dev stack is now native** — Docker no longer used at all. `image-tagger/` deleted by Patrick (session 81). Backend/frontend/postgres run natively on Windows. See `claude_docs/DEVELOPMENT.md`.
- **Production seed:** DB URLs are in `packages/backend/.env`. Copy them into the commands below:
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
  $env:DATABASE_URL="<from packages/backend/.env>"
  $env:DIRECT_URL="<from packages/backend/.env>"
  pnpm run db:generate
  npx prisma migrate deploy
  ```
  ⚠️ Seed clears all data — run intentionally. Never commit credentials to docs.

---

## Constraints

- Token efficiency required — keep Tier 1 docs lean
- Diff-only updates
- Grand Rapids launch first

---

- **favicon.ico** — ✅ COMPLETE. Multi-size ICO (16/32/48px) from logo-icon-512.png. `_document.tsx` updated with shortcut/icon links. Pushed 2026-03-05.
- **CA4** — ✅ COMPLETE. User flow audit (shopper/organizer/creator). 10 fixes shipped: search aria-label, purchases error handling, index refetch(), items/[id] retry, referral copy feedback. Open items logged in `claude_docs/ux-spotchecks/ca4-ca6-audit-2026-03-05.md`.
- **CA6** — ✅ COMPLETE. Feature polish: 5MB photo validation + server error surfacing, push notification toggle in organizer settings, onboarding step 3 copy improved, empty referrals state. Pushed 2026-03-05.

Last Updated: 2026-03-07 (session 86 — production outage recovery: uuid→crypto.randomUUID, Dockerfile --no-frozen-lockfile, Organizer.website migration. Workflow audit: 5 self-healing entries, CORE.md lockfile rule, session-safeguards updated. Beta status: GO.)
