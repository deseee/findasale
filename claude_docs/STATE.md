# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 150 COMPLETE (2026-03-12) — STRIPE TERMINAL POS (ROADMAP #5):**
- **Ship-Ready subcommittee** reviewed POS feature: approved for implementation. Reader selected: BBPOS WisePOS E / S700 (WiFi, `internet` discovery) — M2 Bluetooth rejected (unsupported in iOS Safari/PWA).
- **Architect** produced ADR: `claude_docs/feature-notes/stripe-terminal-pos-adr.md`. v1 scope: 1 item per transaction (multi-item cart deferred — needs POSTransaction model).
- **Dev implemented all 7 steps:**
  1. `packages/database/prisma/schema.prisma` — `Purchase.userId` nullable, added `source` (default `'ONLINE'`) and `buyerEmail` fields
  2. `packages/database/prisma/migrations/20260312000002_add_purchase_pos_fields/migration.sql` — safe additive migration
  3. `packages/backend/src/controllers/terminalController.ts` — NEW: connection token, create PI, capture, cancel endpoints
  4. `packages/backend/src/routes/stripe.ts` — 4 terminal routes added
  5. `packages/backend/src/controllers/stripeController.ts` — webhook `isPOS` guard; buyer-only ops skipped for POS purchases
  6. `packages/frontend/pages/organizer/pos.tsx` — NEW: full POS UI (sale selector, item search, reader connect, charge flow)
  7. `packages/frontend/pages/organizer/dashboard.tsx` — 💳 POS quick-action link added
- **Migration pending Neon deploy:** `20260312000002_add_purchase_pos_fields`
- **Patrick action required:** `pnpm --filter frontend add @stripe/terminal-js`, add `NEXT_PUBLIC_STRIPE_TERMINAL_SIMULATED=true` env var, deploy migration, push to GitHub via `.\push.ps1`
- **QA flag:** Payment flow changes — flag `findasale-qa` before enabling for beta organizers.
- **Vercel reconnect:** Patrick confirmed GitHub App reconnected this session (no further deploy blockers from that issue).
**Last Updated:** 2026-03-12 (session 150 — Stripe Terminal POS implementation complete, awaiting Patrick push + Neon migration)

**Session 149 COMPLETE (2026-03-12) — REVIEW PAGE P0 FIX + SHOPPER 404 FIXES:**
- **P0 fixed:** `review.tsx` was calling `GET /items?saleId=...&draftStatus=DRAFT,PENDING_REVIEW` — backend `getItemsBySaleId` hardcodes `PUBLIC_ITEM_FILTER={draftStatus:'PUBLISHED'}` and ignores all query params, so the page always returned published items instead of drafts. Fixed: switched to `GET /items/drafts?saleId=...` (`getDraftItemsBySaleId` — correct organizer-only endpoint). Commit b578cca.
- **Shopper 404s fixed:** `ActivitySummary.tsx`, `shopper/dashboard.tsx`, `shopper/purchases.tsx` were calling `/shopper/purchases`, `/shopper/favorites`, `/sales/subscribed` — none of these routes exist in the backend. Corrected to `/users/purchases`, `/favorites`, `/notifications/subscriptions`. `Layout.tsx` nav spacing cleaned up (mr-3 → flex gap-2). Commits 816c352 + 9e1f905 + 73a309c.
- **Friction audit ran** (daily-friction-audit scheduled task): report at `claude_docs/operations/friction-audit-2026-03-12.md`. P0 flagged: Vercel GitHub App integration disconnected — frontend pushes not deploying. Patrick needs to reconnect in Vercel dashboard → findasale → Settings → Git.
- **Next session:** Planning committee (Ship-Ready subcommittee) reviews Stripe Terminal POS (roadmap item #5) → findasale-dev implements.
**Last Updated:** 2026-03-12 (session 149 — review page P0 + shopper 404 fixes; Vercel reconnect still pending)

**Sessions 147–148 COMPLETE (2026-03-12) — RAPIDFIRE UI P1 FIXES + PHASE 5 WIRING:**
Two bugs diagnosed and fixed in the Rapidfire camera UI:
1. **Nested `<button>` HTML invalidity** (`RapidCarousel.tsx`) — browsers eject inner `<button>` elements from outer `<button>` wrappers, making the "+" button and photo-count badge invisible. Fix: changed outer wrapper from `<button>` to `<div>`, preserving all touch/mouse handlers. Pushed via GitHub MCP (SHA: `622195faa8fdd410bb9347231469af8bb4b560c5`).
2. **Phase 5 add-photo-to-item never wired** (`add-items/[saleId].tsx`) — `onAddPhotoToItem` was a no-op stub, `addingToItemId` was hardcoded `null`. Fix: added `addingToItemId` state, full toggle logic, Phase 5 append pipeline using `/upload/sale-photos` → `POST /items/:id/photos`. Skip optimistic temp entry in append-mode. Pushed by Patrick via push.ps1 (merge commit `a7eb375`).
**Deployment status:** Both fixes confirmed on GitHub main. Vercel (frontend) GitHub App integration appears disconnected — latest Vercel deployment (March 11 ~15:15 UTC) predates the new commits (March 12 02:53 UTC). Patrick needs to reconnect GitHub App in Vercel dashboard → findasale → Settings → Git, OR manually trigger a new production deployment using "Use latest commit from main."
**Railway** is backend-only (`packages/backend/Dockerfile.production`) — frontend-only changes never trigger Railway rebuilds. This is expected behavior.

**Session 146 COMPLETE (2026-03-11) — CAMERA WORKFLOW v2 + PUBLISHING PAGE DESIGN SPRINT:**
Full interactive mockup built (`camera-mode-mockup.jsx` in repo root — two-screen React component). Camera screen: Rapidfire multi-photo via "+" button on carousel thumbnails, 4:3 crop guide overlay, auto-enhance ✨ badges, add-mode banner above shutter, mode toggle pill, torch/shutter/flip/gallery row. Publishing screen: AI confidence color tinting (green/amber/red), per-item expand panel with photo tools (aspect ratio 4:3/1:1/16:9, background removal, auto-enhance toggle, brightness/contrast sliders), batch toolbar (select all, bulk price, bulk category, bulk BG removal), buyer preview mode (light-mode buyer-facing grid). Innovation + UX + Customer Champion consulted for feature ideas — shortlist: real-time quality warning, retake toast, face detection flag, duplicate detection (future), batch context injection. Feature spec written: `claude_docs/feature-notes/camera-workflow-publishing-spec.md`. Ready for architecture review + Ship-Ready subcommittee before implementation.

**Session 146 carry-forward:** Desktop nav parity subagent was dispatched in session 145 — confirm which file was edited and that changes are staged for git.

**Session 144 COMPLETE (2026-03-11) — FILE GOVERNANCE OVERHAUL (ADVISORY BOARD MEETING #1):**
Advisory Board Meeting #1 convened (full 12-seat board). Agenda: (1) audit sessions 142-143 — strategic deliverables confirmed, file hygiene failures identified; (2) hard-gated file/folder rules — 5-point plan approved unanimously and implemented. Implementation: deleted 10 junk/deprecated files, rebuilt MESSAGE_BOARD.json (68KB corrupted → clean 600-byte JSON), archived 25 files from 9 unauthorized directories (audits/, marketing/, qa/, security/, session-wraps/, ux-spotchecks/, improvement-memos/, operations/context-audit/), created archive-index.json (Records-only vault with manifest visible to all agents), rewrote file-creation-schema.md with hard gates + Locked Folder Map + Archive Vault section + Tier system + banned temp patterns, added Rules 20-22 to conversation-defaults SKILL.md (temp gate, locked dirs, archive vault), added Archive Vault Gatekeeper section to findasale-records SKILL.md. Both skills packaged and presented to Patrick.
**Session 143 COMPLETE (2026-03-11) — FLEET REDESIGN PHASE 2 IMPLEMENTATION:**
Phase 2 fully executed. 5 new agents: `findasale-sales-ops`, `findasale-devils-advocate`, `findasale-steelman`, `findasale-investor`, `findasale-competitor`. Advisory board rewritten to 12 seats + 6 subcommittees + async voting. 4 infrastructure docs: budget-first-session-planning, trial-rollback-protocol, cross-agent-feedback-loops, async-decision-voting. 2 scheduled tasks: daily-friction-audit (8:30am Mon-Fri), weekly-pipeline-briefing (Mon 9am). conversation-defaults v6: Rules 17-19 (budget-first, DA/Steelman co-fire, feedback loop routing). All 5 new agents on 2-week trial. ✅ All skills installed (session 145).

**Sessions 140-142:** Fleet redesign Phase 1 complete + plugin-skill awareness upgrade. See session-log for details.

**Session 137 COMPLETE (2026-03-11) — RAPIDFIRE BUG FIX + ENFORCEMENT HARDENING:**
Two critical bugs fixed: (1) Prisma P2022 — `Item.draftStatus` missing from Neon production DB — fixed by deploying migration `20260311000002_add_item_draft_status`; (2) Rapidfire camera button bug — clicking Rapidfire opened regular camera flow instead of rapid capture flow — fixed with `handleRapidCameraComplete` handler in add-items/[saleId].tsx, creates optimistic DRAFT items per photo. Workflow improvements: skill enforcement gates hardened across `conversation-defaults` and `dev-environment`, CORE.md env gate upgraded to hard STOP gate with explicit `Skill()` invocation, SECURITY.md §6 updated with no-placeholder-credential rule, skill packaging workflow fixed. Global CLAUDE.md updated with subagent-first rule. Files changed: `packages/frontend/pages/organizer/add-items/[saleId].tsx`, plus docs/skills already pushed to GitHub.

✅ Migration `20260311000002_add_item_draft_status` deployed to Neon (session 145 confirmed — applied 2026-03-11 12:30 UTC, committed c921313).

**Session 136 COMPLETE (2026-03-10) — RAPIDFIRE MODE IMPLEMENTATION:**
Phases 1A–3C fully built and pushed to GitHub. QA verdict: PASS WITH NOTES. One migration pending Neon deploy — everything else is live on Railway/Vercel once Patrick deploys.

**What was built (all pushed to main):**
- Migration `20260311000002_add_item_draft_status` — draftStatus/aiErrorLog/optimisticLockVersion + backfill + indexes
- `helpers/itemQueries.ts` — PUBLIC_ITEM_FILTER, getPublicItemsBySaleId
- `jobs/processRapidDraft.ts` — background AI analysis (setImmediate, non-throwing)
- `jobs/cleanupStaleDrafts.ts` — 7-day DRAFT cleanup cron (2am daily)
- `uploadController.ts` — uploadRapidfire endpoint
- `itemController.ts` — getItemDraftStatus + publishItem (B2+B5 enforced) + BLOCKER fix (createItem/importItemsFromCSV now set draftStatus: 'PUBLISHED')
- `routes/items.ts` — new routes registered before /:id
- `index.ts` — scheduleCleanupCron() wired at startup
- Search service + routes — all updated with PUBLIC_ITEM_FILTER
- Frontend: ModeToggle, CaptureButton, RapidCarousel, PreviewModal, useUploadQueue hook
- Frontend: review.tsx page, add-items/[saleId].tsx Phase 3C integration

✅ Migration deployed and Rapidfire unblocked (session 145 confirmed).

**Known Phase 3C gaps (post-beta):**
- `useUploadQueue` not fully wired to camera blob capture (upload queue scaffolded, wiring incomplete)
- `rapidItems` not loaded on mount from existing DB drafts (review page starts empty on revisit)

**Session 135 COMPLETE (2026-03-10) — RAPIDFIRE MODE DESIGN SPRINT:**
Full design package complete and greenlit. Files: rapidfire-mode-adr.md, rapidfire-mode-ux-spec.md, rapidfire-mode-design-brief.md, rapidfire-dev-session-prompt.md.

---

Session 105 Bug Blitz COMPLETE. Session 106 B1 ADR COMPLETE. Session 107 B1 implementation COMPLETE. Session 109 skill packaging COMPLETE. Session 110 P1 bug blitz COMPLETE. Full detail: `claude_docs/COMPLETED_PHASES.md`.

**Session 113 COMPLETE (2026-03-09):** Fleet audit + governance overhaul.
- 11-subagent management audit. Fleet grade: D+. Root causes confirmed: honor-system rules, no enforcement gates, no token visibility, 6 of 7 Session 108 fixes never implemented.
- CORE.md v2: consolidated 19 rules → 5 (compression logging + read-before-write hard rule added). ~427 → 107 lines.
- 188 stale docs removed from git (archive-for-removal). Repo: 255 → 67 doc files.
- session-scoreboard-template.json added. session-digest scheduled task (8am daily) created.
- Unused plugins disabled by Patrick.

**Session 112 COMPLETE (2026-03-09):** Security fix + workflow audit + H1 quick win.
- Scrubbed live Neon credentials, workflow audit + 3 CORE.md fixes, H1 "How It Works" card shipped.

**Session 115 COMPLETE (2026-03-09):** P0 security + payment fixes shipped. Token tracking research complete.
- Security fixes: OAuth account-takeover removed (no auto-link by email), redirect_uri allowlist added, tokenVersion-based session invalidation on password change
- Payment fixes: chargeback webhook handler (DISPUTED status), webhook idempotency (ProcessedWebhookEvent), negative price guards in itemController, buyer-own-item purchase guard
- Migrations: `20260309000002_add_token_version`, `20260309200001_add_processed_webhook_event` (Patrick must deploy)
- Research: token-tracking-feasibility.md — IMPLEMENT YES (hybrid approach: budget briefing + checkpoints)
- Migration naming fix: corrected two agent-generated migrations with conflicting names

**Session 114 COMPLETE (2026-03-09):** D3 + B2 + H1 shipped. Agent fleet (6 workers) completed.
- D3: Map route planning — OSRM backend controller, routes.ts, routeApi.ts, RouteBuilder.tsx, wired into map.tsx
- B2: AI tagging disclosure — items/[id].tsx, organizer/add-items/[saleId].tsx, organizer/settings.tsx updated with approved copy
- H1: Compact mobile header — search bar py-1.5, main content pt-[92px]

**Session 116 COMPLETE (2026-03-09):** Token tracking + 3 features shipped.
- Token tracking (P1): CORE.md §3 updated with checkpoint format, `operations/token-checkpoint-guide.md` created, conversation-defaults skill v3 packaged
- Feature #4 (Search by Item Type): `categories/index.tsx` created — /categories landing page with category cards sorted by item count. `[category].tsx` already existed (Phase 29).
- Feature #12 (SEO Description Optimization): `cloudAIService.ts` Haiku prompt — titles now format "[Type], [Material], [Maker]"; tags 5–8 terms biased toward material/era/maker keywords
- Feature #9 (Payout Transparency Dashboard): `GET /api/stripe/earnings` + `payouts.tsx` — per-item breakdown: sale price → 10% platform fee → est. Stripe fee → net payout. Summary totals + full item table on payouts page.

**Session 117 COMPLETE (2026-03-09):** Feature #11 + Vercel build fix + Feature #10 + earningsPDF fix.
- Feature #11 (Organizer Referral Reciprocal): `stripeController.ts` — fee bypass when `referralDiscountExpiry > now` (0% instead of 10%); `routes/organizers.ts` — `GET /organizers/me` exposes `referralDiscountActive` + `referralDiscountExpiry`; `payouts.tsx` — green referral discount banner when active. MCP commit 3243091.
- Vercel build fix: `pages/items/[id].tsx` — renamed `triggerToast` → `showToast` (6 occurrences). MCP commit 949d743.
- Feature #10 (Serendipity Search): `packages/backend/src/routes/search.ts` — `GET /api/search/random`; `packages/frontend/pages/surprise-me.tsx` — /surprise-me page with filters. Commit 5473c14.
- earningsPdfController fee fix: footer updated from "5%/7%" to "Platform fee: 10% flat." Commit bd34de4.
- A3.6 single-item 500: ✅ RESOLVED — no errors in latest Railway deploy (confirmed by Patrick, session 119).
- New migration: `20260312000001_add_organizer_referral_discount` — adds `referralDiscountExpiry DateTime?` to Organizer. Patrick must deploy.

**Session 129 COMPLETE (2026-03-10):** Dashboard/UX polish + build error chain resolved.
- BUG-1 (P1): Edit Sale 404 fixed — route corrected to `/organizer/edit-sale/${id}`
- BUG-2 (P2): Stale fee copy fixed across dashboard + tierService (all tiers → 10% flat)
- CSVImportModal prop mismatch fixed (`onSuccess` → `onImportComplete`, added `isOpen`)
- Backend TypeScript error: removed `quantity` from Prisma `item.update()` (field not in schema); `bulkUpdateItems` extended to support `isActive` and `price` operations
- `sales/[id].tsx` restored (was truncated to 100 lines by prior MCP push — restored full 923-line file)
- BUG-3 (/organizer/items 404): Advisory Board + Pitchman consulted. Manage Holds button removed from dashboard as interim. Full feature deferred.
- Dashboard Analytics tab removed (duplicate of Insights page). Tabs reduced to Overview + Sales.
- Tier Rewards card cleaned up: removed fee sub-card, removed "better rates" copy, added tier descriptions.
- Print Inventory fixed: was calling `/organizer/sales` (404) → corrected to `/sales/mine`.
- Add-items page: old single-form version redirects to dashboard. New tabbed version (Rapid Capture, Camera, CSV Import) at `/organizer/add-items/[saleId]` is canonical. Camera tab fully wired (confirmed session 145 — no "coming soon" regression).

**Session 131 COMPLETE (2026-03-10):** Print inventory fix + per-sale insights filter. Verified live.
- Print Inventory 500 error fixed: `getItemsBySaleId` was returning `embedding Float[]` (thousands of floats per item), crashing JSON serialization. Added `select` clause excluding embedding. Commit 10c66a5.
- Per-sale insights: `insightsController.ts` now accepts optional `?saleId` query param + returns `salesList` for dropdown. `insights.tsx` has sale selector dropdown, scoped metrics, dynamic subtitle. Commit 3cfc1ad.
- Both fixes verified live in Chrome: print inventory loads all 43 items; insights dropdown filters correctly (tested "Downtown Downsizing" → 1 sale, 17 items, $1,629.22 revenue).
- Minor data quality note: "Collectibles" appears twice in insights category breakdown (capitalization variant from seed data).
- Scoped AI branding audit for next session: 6 user-facing locations reference "Google Vision", "Claude Haiku", or "Anthropic" by name → should say "AI" generically.

**Session 130 COMPLETE (2026-03-10):** Session 129 compression damage audit + fixes.
- Audited all session 129 claimed fixes against live site + GitHub code
- Found stale 5%/7% fee copy in 3 customer-facing pages missed by session 129: terms.tsx (Section 6), faq.tsx (2 locations), guide.tsx (4 locations)
- All 3 pages fixed and pushed to GitHub (commits 926a2d7 + 726146f). Vercel deployed — confirmed live via Chrome.
- Old `add-items.tsx` (48KB static page, no saleId) replaced with redirect to `/organizer/dashboard` — eliminates routing conflict with `add-items/[saleId].tsx`
- Backend tierService.ts perks text confirmed correct on GitHub ("10% flat") — Railway deploy pending (stale instance still shows 5%/7% in dashboard tier perks card)
- ✅ Camera tab "coming soon" regression resolved — fully wired in current code (confirmed session 145).


**Session 126 COMPLETE (2026-03-10):** Docs correction + session 125 fix verification + item list audit.
- Session 125 fixes verified live in Chrome: BUG-1 (PUT fix) ✅, BUG-2 (organizer null crash) ✅, BUG-3 (dropdown case) ✅
- Organizer item list audit: all bulk actions pass (hide, show, set price, checkboxes). Per-item edit + delete pass.
- 3 new findings: FINDING-1 (no filter/sort on list, P2), FINDING-2 (native confirm on delete, P2), FINDING-3 (stale 5%/7% fee copy on dashboard, P2).
- Audit report: `claude_docs/audits/session-126-dashboard-items-audit.md`

**Session 125 COMPLETE (2026-03-10) — FIXES VERIFIED:** Edit-item + photo management flow audit via Chrome MCP. 4 critical bugs found + fixed. Code pushed (b2ac5c7). All fixes confirmed in production (session 126).
- P0: Save Changes broken (api.patch → api.put mismatch in edit-item/[id].tsx). Fixed — verified ✅
- P0: Shopper item detail page crashes on every item (TypeError: Cannot read properties of undefined (reading 'name') — organizer null in API response). Fixed with optional chaining + fallback — verified ✅
- P1: Category/Condition dropdowns blank on edit page (case mismatch). Fixed — verified ✅
- P2: No error state when item not found on edit page. Fixed — pushed, untested.
- Photo ops verified in audit: upload, reorder, delete all working correctly.
- ⚠️ Two remaining issues NOT fixed: (1) backend `getItemById` omits `organizer` from Prisma select (should be fixed in backend); (2) edit page uses public endpoint that filters ENDED/DRAFT items (organizer can't edit items on closed sales).
- Files: `packages/frontend/pages/organizer/edit-item/[id].tsx`, `packages/frontend/pages/items/[id].tsx`.
- Commit: b2ac5c7. Audit report: `claude_docs/audits/session-125-edit-item-photo-audit.md`.

**Session 120 COMPLETE (2026-03-10):** Beta dry run friction blitz. 13/15 items implemented (items 7 + 13 deferred). Vercel build cascade fixed (6 type errors in items/[id].tsx after agent full-file rewrite). QA P2 fixes: z-index, per-field validation. Docs: migration rollback plan, beta organizer email, spring content, dry run friction log.

**Session 119 COMPLETE (2026-03-09):** Records audit sessions 110–118. 4 drift items corrected (earningsPDF fix, Feature #10, roadmap checkmarks, A3.6). Manifest test PASS — first full live session with `.checkpoint-manifest.json`.

**Remaining open:** B3/B7/D1/C1/C2 (deferred/attorney). VAPID keys confirm in prod. Vercel MCP not yet leveraged. Feature #11 Referral Discount requires Neon migration deploy before active in production.

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

**Migrations pending Neon deploy (session 150):**
- `20260312000002_add_purchase_pos_fields` — Makes `Purchase.userId` nullable, adds `source` + `buyerEmail` columns. Required for Terminal POS to work in production.

**All prior migrations deployed.** 71 total applied as of session 145. Previously deployed:
1. `20260309_add_auction_reserve_price`
2. `20260310000001_add_item_fulltext_search_indexes`
3. `20260311000001_add_sale_type_item_listing_type`
4. `20260309000002_add_token_version` — ✅ Deployed session 119
5. `20260309200001_add_processed_webhook_event` — ✅ Deployed session 119
6. `20260312000001_add_organizer_referral_discount` — ✅ Deployed session 119

For future migration deploys, see `claude_docs/DEVELOPMENT.md` and `packages/backend/.env` (commented-out Neon URLs). Never embed credentials in committed files (CORE.md §17.3c).

---

## Pending Manual Action (Blocks Beta Launch)

- **Phase 31 OAuth env vars** — ✅ DONE (2026-03-06). GOOGLE_CLIENT_ID/SECRET + FACEBOOK_CLIENT_ID/SECRET added to Vercel. Redirect URIs configured.
- **Support email** — ✅ DONE (2026-03-06). support@finda.sale email forwarding configured.
- **Neon migrations** — ✅ 66 applied (Session 112). All caught up.
- **Neon credentials** — ✅ Rotated (Session 111). Old exposed password scrubbed from git history.
- **conversation-defaults skill** — ✅ v3 reinstalled (Session 119). v3: Rule 3 unified single-path, Rules 10 & 11 added (manifest reads + pre-dispatch checkpoint).

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
- **Vercel GitHub App integration** — As of session 148 (2026-03-12), Vercel is not auto-deploying on push. GitHub App connection may be broken. Check Vercel dashboard → findasale → Settings → Git to reconnect, or manually trigger deployment. Railway and Vercel use GitHub App integration (Settings → Applications), NOT traditional webhooks.
- **Railway is backend-only** — `railway.toml` builds from `packages/backend/Dockerfile.production`. Frontend-only changes (Next.js pages, components) never trigger Railway builds. All frontend deploys go to Vercel only.
- ✅ **P0 QA bug (FIXED session 149):** `review.tsx` now calls `GET /items/drafts?saleId=...` — previously called `GET /items?...&draftStatus=DRAFT,PENDING_REVIEW` which was silently returning only PUBLISHED items. Commit b578cca.
- **Migration `20260311000003_add_camera_workflow_v2_fields` (status unclear):** Adds `aiConfidence`, `backgroundRemoved`, `faceDetected`, `autoEnhanced` to Item + new Photo table. Created in session 147 to fix potential P2022 auction job crash. Verify whether Patrick deployed this via `prisma migrate deploy`.

---

## Constraints

- Token efficiency required — keep Tier 1 docs lean
- Diff-only updates
- Grand Rapids beta first — scope is not geography-limited; yard sales, auctions, and flea markets are in scope

---

**Session 133 COMPLETE (2026-03-10):** Session 128 audit regression fixes + edit-item P2022 crash fix.
- Session 128 regressions restored: RapidCapture torch toggle, camera switch, photo upload, tab reorder, bulk delete — commit faa16f4
- AI vendor branding genericized: faq.tsx + privacy.tsx — "Google Vision" / "Claude Haiku" references replaced with "AI" — commit aa7ae46
- add-items/[saleId].tsx: tab reorder, photo upload wiring, bulk delete restore — commit d7648e1
- **P0 bug fixed:** `getItemById` (GET /items/:id) was crashing with P2022 — `Item.tags` column doesn't exist in production DB (migration never created). Switched from `include` to explicit `select`, excluding `tags` and `embedding` — commit aa13deb. Verified live in Chrome: edit-item page loads correctly.
- ✅ Resolved in session 134: `Item.tags` migration created (`20260310000002_add_item_tags`) and deployed. All bare `include` endpoints confirmed safe.

**Session 134 COMPLETE (2026-03-10):** Auction job P2022 fix + session wrap.
- Diagnosed `auctionJob` P2022 crash: `Item.tags` column missing from Neon production DB, no migration file existed.
- Created migration `20260310000002_add_item_tags` (`ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}'`).
- Also committed two other missing migrations: `20260309000002_add_token_version` and `20260309200001_add_processed_webhook_event`.
- `prisma migrate deploy` confirmed no pending — column already on Neon. All Item `include` endpoints (auction job, updateItem, deleteItem, etc.) are safe.
- ⚠️ Deferred (post-beta): `exportItems` (itemController line 815) and `trendingController` pull full `embedding[]` (768 floats/item) with no `select` — performance concern on large sales, not a crash.
- Two items NOT completed this session (interrupted): hide/show/selected bar move to top of item list, test CSV file for import.

**Session 128 COMPLETE (2026-03-10):** Chrome QA audit of session 127/128 changes. FINDING-3 fixed. CSV import 500 bug found and fixed.
- Chrome audit PASS: tab labels ✅, click-to-edit item titles ✅, inline delete confirm ✅, CSV modal opens ✅, camera fullscreen overlay ✅
- FINDING-3 (stale 5%/7% fee copy on organizer settings.tsx) → fixed (committed 9d6bfda)
- CSV import 500 bug: `importItemsFromCSV` called `createMany()` without `embedding: []` → NOT NULL constraint violation. Fixed in `itemController.ts` (committed a670457)
- Root cause: `DEFAULT '{}'` dropped from `embedding Float[]` column in coupon migration `20260307153530`. All new item create paths must supply `embedding: []`.
- Settings.tsx build error (hallucinated `lastName` field from push_files) resolved — correct file pushed via create_or_update_file (committed 9d6bfda)
- add-items full rewrite (session 127 carry-forward): committed c0831bf — camera fullscreen overlay, flash/torch toggle, tab labels, click-to-edit titles, inline delete confirm
- CSV import fix pending Railway redeploy verification (Chrome disconnected before re-test)

**Session 127 COMPLETE (2026-03-10):** Chrome QA — add-items photo upload flow. 2 bugs found and fixed.
- Bug 1: Manual Entry tab had no photo upload field. Fixed — standard file input added (no AI, preserves AI as paid feature).
- Bug 2: Camera tab Analyze button fired API call but discarded response — toast appeared, nothing happened. Fixed — `uploadCapturedPhoto` now consumes response, pre-fills form, switches to Manual tab. Auto-create (⚡) checkbox added above Start Camera button.
- UX decision: Manual Entry = standard upload only. Camera = AI pre-fill (with option to auto-create immediately).
- Merge conflict resolved (agents had done full-file rewrites across multiple commits). Final file: 989 lines, all auction fields intact.
- Commits: 451b1de, db0e1b8, 4d61bcf, 1f4cada (MCP), 202127c (local), afc280a (conflict resolution).
- FINDING-3 (stale fee copy on dashboard) — deferred from session 126, still open.
- 4 new QA findings queued — all resolved in Session 128: camera fullscreen/flash ✅, tab labels ✅, click-to-edit ✅, CSV import tested + fixed ✅.

Last Updated: 2026-03-12 (session 149 — review page P0 + shopper 404 fixes; Vercel reconnect still pending Patrick)