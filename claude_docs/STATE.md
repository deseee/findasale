# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

Session 105 Bug Blitz COMPLETE (2026-03-09). 7 P0 bugs fixed, QA PASS.

**Session 106 COMPLETE (2026-03-10):** B1 ADR written and approved. Fee structure locked at 10% flat. Dev sequence planned across 107A/B/C.

**Session 107 COMPLETE (2026-03-11):** B1 full implementation DONE. 107A/B/C continuous run: schema + FeeStructure model, backend controllers (saleController/itemController/stripeController/auctionJob all reading FeeStructure at fee time), frontend forms (saleType selector + listingType selector). QA found P0 blocker (auctionJob.ts hardcoded 0.07), dev fixed. All code staged and ready for Patrick's push. **Patrick must push 10 files** (see push block below). Prisma migration still pending.

**Session 109 COMPLETE (2026-03-09):** Housekeeping only. Packaged and reinstalled 8 updated skill archives (Session 108 version tracking). advisory-board, hacker, pitchman newly packaged as flat .skill archives. All 8 installed by Patrick.

**Session 110 COMPLETE (2026-03-09):** Multi-agent P1 bug blitz. QA scoped + dev fixed: A1.3 (geo toast), A1.4 (FTS merged into main search), A2.2 (all 13 PWA icons regenerated from FindA.Sale brand source), A5.1 (double layout removed), A5.2 (organizer profile links), A6.1 (hardcoded city → env vars). Then continuous fleet deployment: fixed A4.1 (dashboard Add Items gating + analytics NaN), A3.3 (× unicode), A3.4 (edit-item error handling), A3.8 (removed orphan upload tab), A5.3 (backend badge fetch), B4 (auctionReservePrice field + migration + frontend), B8 (webhook UI surfaced in dashboard). Architect decisions: B5 DEFERRED (email reply parsing post-beta, trigger at 500 organizers), B8 GO (webhooks already built — UI only). B6 no typo found.

**Remaining open:** A3.6 single-item 500 (needs Railway production logs — blocked). B2 (AI tagging disclosure copy). B3 (holds/reservations — deferred). B7 (referral safeguards — attorney required). D1 (quasi-POS — attorney required). D3 (map route planning). H1 (UX inspiration research). C1/C2 (legal terms — no action for beta). G-batch (Cowork platform research).

---

## Locked Decisions

- **BUSINESS_PLAN.md** — Tier 1 Strategic Authority Document (created 2026-03-06). All business strategy, market analysis, financial projections, competitive positioning, and go-to-market strategy defined here. Reference for all strategic decisions.
- **Platform fee: 10% flat** across all item types (FIXED, AUCTION, REVERSE_AUCTION, LIVE_DROP, POS) — locked 2026-03-10. `FeeStructure` DB table, single row, rate configurable without code deploy. Replaces 5%/7% split. All-in ~13.2% with Stripe. Tier discounts deferred post-beta. See STACK.md.
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

Sessions 95–105 complete. Self-improvement loop DONE. Fleet Self-Audit DONE. Bug Blitz (Session 105) DONE. Next: Session 106 Architecture Decisions (B1 linchpin). Sprint 5 (Seller Performance Dashboard) deferred to after B1 decision. Neon migration `20260310000001_add_item_fulltext_search_indexes` still needs `prisma migrate deploy` on production. 18 skill files queued for Patrick to install: `claude_docs/skill-updates-2026-03-09/`. Full history: `claude_docs/COMPLETED_PHASES.md`

---

## Pending Manual Action (Blocks Beta Launch)

- **Phase 31 OAuth env vars** — ✅ DONE (2026-03-06). GOOGLE_CLIENT_ID/SECRET + FACEBOOK_CLIENT_ID/SECRET added to Vercel. Redirect URIs configured.
- **Support email** — ✅ DONE (2026-03-06). support@finda.sale email forwarding configured.
- **Neon migrations** — ✅ 63 migrations applied to Neon production (last: 20260307153530_add_coupon_model). Pending: `20260310000001_add_item_fulltext_search_indexes` (Sprint 4a — run before Sprint 4b end-to-end testing). NEW: Migration `20260311000001_add_sale_type_item_listing_type` (Session 107 schema) pending `prisma migrate deploy`.
- **MAILERLITE_API_KEY** — ✅ DONE (2026-03-09). Added to Railway env vars by Patrick. MailerLite automation active on sale publish.
- **Uptime monitoring** — ✅ UptimeRobot done (Patrick confirmed 2026-03-05).
- **Sentry** — ✅ Fully deployed. DSNs set in Railway + Vercel.
- **STRIPE_WEBHOOK_SECRET** — ✅ Set in Railway (2026-03-05).
- **Prisma migration deploy (Session 107)** — Patrick must run `prisma generate && prisma migrate deploy` for migration `20260311000001_add_sale_type_item_listing_type` on Neon production.
- **conversation-defaults skill reinstall (Session 107)** — Patrick must reinstall from `claude_docs/skill-updates-2026-03-09/conversation-defaults-updated.skill/conversation-defaults-edit.skill` (Rule 3 expanded to cover ALL first-message types, not just ≤5 word openers).

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
- **Neon production DB** — `prisma migrate deploy` must be run manually after any new migration. 63 migrations applied as of 2026-03-07. Pending: `20260310000001_add_item_fulltext_search_indexes` — run before Sprint 4b end-to-end testing.
- **Dockerfile.production** — ✅ Restored to `--frozen-lockfile` (session 87, commit b82180d). Lockfile is clean.
- **Git push workflow** — Patrick uses `.\push.ps1` (repo root) instead of raw `git push`. Self-heals: index.lock, CRLF phantoms (--ignore-cr-at-eol), fetch+merge (never rebase), doc-file merge conflicts (--theirs auto-resolve). See self-healing entries #36, #51, #52.
- **Dev stack is now native** — Docker no longer used at all. `image-tagger/` deleted by Patrick (session 81). Backend/frontend/postgres run natively on Windows. See `claude_docs/DEVELOPMENT.md`.
- **Production migration deploy (Neon):** Before running `migrate deploy`, Claude must read `packages/backend/.env` directly to confirm the Neon URLs are present (commented-out `# DATABASE_URL=` and `# DIRECT_URL=` lines pointing to `neon.tech`). Claude provides the migration command template only — Patrick reads credentials directly from `packages/backend/.env`. Never embed credentials in any committed file. See SECURITY.md §3.

---

## Constraints

- Token efficiency required — keep Tier 1 docs lean
- Diff-only updates
- Grand Rapids beta first — scope is not geography-limited; yard sales, auctions, and flea markets are in scope

---

- **favicon.ico** — ✅ COMPLETE. Multi-size ICO (16/32/48px) from logo-icon-512.png. `_document.tsx` updated with shortcut/icon links. Pushed 2026-03-05.
- **CA4** — ✅ COMPLETE. User flow audit (shopper/organizer/creator). 10 fixes shipped: search aria-label, purchases error handling, index refetch(), items/[id] retry, referral copy feedback. Open items logged in `claude_docs/ux-spotchecks/ca4-ca6-audit-2026-03-05.md`.
- **CA6** — ✅ COMPLETE. Feature polish: 5MB photo validation + server error surfacing, push notification toggle in organizer settings, onboarding step 3 copy improved, empty referrals state. Pushed 2026-03-05.

Last Updated: 2026-03-09 (session 110 complete — P1 bug blitz + A4.1 dashboard + A3.x upload fixes + B4 auction reserves + B8 webhook UI)
