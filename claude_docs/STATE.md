# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

Session 105 Bug Blitz COMPLETE. Session 106 B1 ADR COMPLETE. Session 107 B1 implementation COMPLETE. Session 109 skill packaging COMPLETE. Session 110 P1 bug blitz COMPLETE. Full detail: `claude_docs/COMPLETED_PHASES.md`.

**Session 113 COMPLETE (2026-03-09):** Fleet audit + governance overhaul.
- 11-subagent management audit. Fleet grade: D+. Root causes confirmed: honor-system rules, no enforcement gates, no token visibility, 6 of 7 Session 108 fixes never implemented.
- CORE.md v2: consolidated 19 rules → 5 (compression logging + read-before-write hard rule added). ~427 → 107 lines.
- 188 stale docs removed from git (archive-for-removal). Repo: 255 → 67 doc files.
- session-scoreboard-template.json added. session-digest scheduled task (8am daily) created.
- Unused plugins disabled by Patrick.

**Session 112 COMPLETE (2026-03-09):** Security fix + workflow audit + H1 quick win.
- Scrubbed live Neon credentials, workflow audit + 3 CORE.md fixes, H1 "How It Works" card shipped.

**Remaining open:** A3.6 single-item 500 (needs production logs). B2 (copy written, needs schema migration + UI wiring). D3 (ADR approved, ready for dev). H1 compact mobile header (pending). B3/B7/D1/C1/C2 (deferred/attorney). Vercel MCP connected but not yet leveraged.

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

**3 Neon migrations — ✅ DEPLOYED (Session 112, confirmed by Patrick).** 66 total applied.
1. `20260309_add_auction_reserve_price`
2. `20260310000001_add_item_fulltext_search_indexes`
3. `20260311000001_add_sale_type_item_listing_type`

For future migration deploys, see `claude_docs/DEVELOPMENT.md` and `packages/backend/.env` (commented-out Neon URLs). Never embed credentials in committed files (CORE.md §17.3c).

---

## Pending Manual Action (Blocks Beta Launch)

- **Phase 31 OAuth env vars** — ✅ DONE (2026-03-06). GOOGLE_CLIENT_ID/SECRET + FACEBOOK_CLIENT_ID/SECRET added to Vercel. Redirect URIs configured.
- **Support email** — ✅ DONE (2026-03-06). support@finda.sale email forwarding configured.
- **Neon migrations** — ✅ 66 applied (Session 112). All caught up.
- **Neon credentials** — ✅ Rotated (Session 111). Old exposed password scrubbed from git history.
- **conversation-defaults skill** — ✅ v2 installed (Session 111).

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
1. ~~Confirm 5%/7% fee~~ — ✅ DONE. Locked at 10% flat (Session 106).
2. Set up Stripe business account
3. Google Search Console verification
4. Order business cards (design ready in `claude_docs/brand/`)
5. Start beta organizer outreach (materials archived — rebuild fresh from strategy/roadmap.md)
6. ~~Rotate Neon credentials~~ — ✅ DONE (Session 111).
7. Optional: consult Michigan attorney re estate sale permit (~$300–500)

Full audit reports: archived (git history, sessions 84–85). Beta checklist: archived.

---

## Known Gotchas (Production)

- **Railway PORT mismatch** — `PORT=5000` locked in Railway Variables. Must match `EXPOSE 5000` in Dockerfile. Do not remove.
- **Neon production DB** — `prisma migrate deploy` must be run manually after any new migration. 66 applied as of 2026-03-09. Run from `packages/database` (NOT `packages/backend`).
- **Dockerfile.production** — ✅ Restored to `--frozen-lockfile` (session 87, commit b82180d). Lockfile is clean.
- **Git push workflow** — Patrick uses `.\push.ps1` (repo root) instead of raw `git push`. Self-heals: index.lock, CRLF phantoms (--ignore-cr-at-eol), fetch+merge (never rebase), doc-file merge conflicts (--theirs auto-resolve). See self-healing entries #36, #51, #52.
- **Dev stack is now native** — Docker no longer used at all. `image-tagger/` deleted by Patrick (session 81). Backend/frontend/postgres run natively on Windows. See `claude_docs/DEVELOPMENT.md`.
- **Production migration deploy (Neon):** Claude reads `packages/backend/.env` from the VM, extracts the commented-out Neon URLs, and provides a ready-to-paste command with real credentials in chat output (ephemeral — never committed). Never embed credentials in any committed file. See SECURITY.md §3 and CORE.md §17.3(c).

---

## Constraints

- Token efficiency required — keep Tier 1 docs lean
- Diff-only updates
- Grand Rapids beta first — scope is not geography-limited; yard sales, auctions, and flea markets are in scope

---

Last Updated: 2026-03-09 (session 114 — stale entries pruned)
