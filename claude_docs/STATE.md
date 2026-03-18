# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 199 COMPLETE (2026-03-18) — FULL DOCS AUDIT + #51 RIPPLES + #42 VOICE-BUTTON + #60 SPRINT 2 + #19 P0 FIX:**

**Full-stack feature shipping:**
- `#51 Sale Ripples` — Complete schema + API + frontend. RippleIndicator auto-records views. ripples.tsx page with trend analytics. **Patrick action: Neon migration + prisma generate pending.**
- `#42 Voice-to-Tag` — VoiceTagButton.tsx + useVoiceTag.ts complete. Web Speech API + browser compat fallback. Ready for integration into add-items page.
- `#60 Premium Tier Bundle Sprint 2` — 5 new frontend files: useSubscription, UsageBar, TierComparisonTable, PremiumCTA, premium.tsx page. Layout.tsx + subscription.tsx modified with nav wiring + usage overview.
- `#19 Passkey P0 Fix` — Concurrent challenge race condition fixed (session-based key replaces fixed 'passkey-auth-current'). **Dispatched to findasale-dev; confirmation + merge pending.**

**Docs audit (447 files scanned):**
- HIGH: archive-old/ stale duplicate (delete after verify). roadmap.old.md orphan (move to archive/feature-notes/).
- MEDIUM: STATE.md at 200 lines (trim next session). /packages/shared/CLAUDE.md empty (populate or delete). archive-index.json out of date.
- Full report: `claude_docs/audits/periodic-docs-audit-2026-03-18.md`

**All code pushed to main (4 commits).** Vercel + Railway green. MESSAGE_BOARD.json untracked (git rm --cached applied).

---

**Session 198 COMPLETE (2026-03-18) — QA AUDIT + ROADMAP v51 + ARCHIVE RE-FILED:**

**Frontend bug fixed:**
- `useOrganizerTier.ts` — removed `@findasale/shared` import (Vercel unblocked). ✅ Pushed by Patrick.

**QA audit — S196+S197 files:**
- 17 files audited, ALL PASS. No additional TypeScript errors found.

**Roadmap v51 (major restructure):**
- 13-column enriched schema applied to all 146 Completed feature rows
- TIER 2/3 tables removed — all QA-PASS features promoted to Completed
- #51 Sale Ripples: IMPLEMENTATION-GAP discovered — no schema, no API, no UI. Moved to TIER 1.
- #42 Voice-to-Tag: UI ⚠️ — VoiceTagButton.tsx missing
- 8 legacy phase features slotted into Completed (CSV Import, Stripe Connect, Auction Mechanics, etc.)
- Claude Automated Checks table added (9 checks)
- Human test column: ALL features show 📋 — no Patrick execution records exist

**Archive-old re-filed:**
- 134 files reorganized from archive-old/ into archive/ (15 subdirectories)
- archive/README.md + MIGRATION_LOG_2026-03-18.md created

**COMPLETED_PHASES.md:**
- Wave 5 statuses updated for all Sprint 2 completions

**Last Updated:** 2026-03-18 (session 198)

**Pending — carry to S199:**
- [ ] findasale-records: Full project docs audit (stale docs, rule violations, orphaned folders)
- [ ] #51 Sale Ripples: Full build from scratch (schema + API + UI — treat as new feature)
- [ ] #42 Voice-to-Tag: Build VoiceTagButton.tsx (UI layer missing)
- [ ] #19 Passkey: End-to-end re-QA (register → login → redirect)
- [ ] #60 Premium Tier Bundle: Sprint 2 build (billing + workspace management UX)
- [ ] Patrick human testing: Execute E2E checklist and mobile gestures guide; update Human column from 📋 to ✅ for verified features
- [ ] Open Stripe business account (test keys still in production — recurring)

---

**Session 197 COMPLETE (2026-03-18) — WAVE 5 SPRINT 2 FRONTENDS + P3 NAV + WORKFLOW FIXES:**

**Sprint 2 frontends built (4 features):**
- `#46 Treasure Typology Classifier` — `useTypology.ts`, `TypologyBadge.tsx`, `typology.tsx`, Layout.tsx nav ✅
- `#54 Crowdsourced Appraisal API` — `useAppraisal.ts`, `AppraisalResponseForm.tsx`, `appraisals.tsx`, Layout.tsx nav ✅ (AI path placeholder only — Sprint 3 async)
- `#17 Bid Bot Detector` — `useBidBot.ts`, `fraud-signals.tsx`, Layout.tsx nav ✅
- `#69 Local-First Offline Mode` — `useOfflineMode.ts`, `offline.tsx`, Layout.tsx nav ✅

**Bug fixed:**
- `#19 Passkey registerBegin` — challenge generated BEFORE `generateRegistrationOptions()` so stored challenge ≠ browser challenge. Fixed: generate challenge AFTER options, override `options.challenge` before sending. ✅

**P3 nav discoverability:**
- `Layout.tsx` — 8+ additional organizer nav links (Bounties, Message Templates, Reputation, UGC Moderation, Performance, Neighborhoods + Cities + Trending in static links) ✅
- `dashboard.tsx` — 5 quick-link cards added for hidden features ✅

**Workflow fixes:**
- `CORE.md §2.1` — Post-Compression Re-Init rule added ✅
- `findasale-dev SKILL.md` — "Context Checkpoint" renamed to "Context-Maintenance Triggered" to prevent confusion with system autocompaction ✅
- `workflow-retrospectives/2026-03-18-autocompact-checkpoint-confusion.md` — root cause documented ✅

**Last Updated:** 2026-03-18 (session 197)

**Pending — Wave 5 Sprint 2 remaining:**
- [ ] `#60 Premium Tier Bundle` — Sprint 2 frontend not yet built
- [ ] `#54 AI Appraisal` — Sprint 3 async (Stripe + Claude Haiku) not yet built (deferred)
- [ ] Patrick must push S197 files via `.\push.ps1` (see push block below)
- [ ] Re-QA #54 Appraisal Sprint 2 after push

---

**Session 196 COMPLETE (2026-03-17) — BUG FIX SPRINT + FEATURE BUILDS + RATE LIMITING + FULL FRONTEND WIRING AUDIT:**

**Bugs fixed (all live on Railway + Vercel):**
- `#54 Appraisal API` — `requireTier('PAID_ADDON')` was invalid SubscriptionTier enum value (Railway TypeScript build error). Fixed to `requireTier('PRO')` as interim gate until addon billing wired.
- `#19 Passkey auth` — two backend blockers fixed in `passkeyController.ts`: (1) `authenticateComplete` creating empty Map instead of calling `getAndValidateChallenge()` — challenges never retrieved, auth always failed; (2) JWT response missing `role` field causing frontend redirect break. Both fixed.
- Railway build unblocked (was failing with PAID_ADDON TS error).

**Features built:**
- `#22 Low-Bandwidth Mode` (SIMPLE) — full implementation complete: `LowBandwidthContext.tsx`, `LowBandwidthBanner.tsx`, `useLowBandwidthInitializer.ts`, `lib/imageUrl.ts`, `_app.tsx` updated. Network Information API detection, localStorage persistence, manual toggle, SSR-safe. ✅ QA PASS on first build.
- Wave 5 Sprint 2 frontends: `#52 Encyclopedia` (index.tsx, [slug].tsx, EncyclopediaCard.tsx, useEncyclopedia.ts) and `#71 Reputation Score` (reputation.tsx, useReputation.ts). ✅ QA-PASS Sprint 1.
- `#29 Loyalty Passport` page built (shopper/loyalty.tsx) — was the only Wave 4 feature with no page at all.
- Shopper settings page (shopper/settings.tsx) with Low-Bandwidth toggle.

**Rate limiting added:**
- `POST /photo-ops/:stationId/shares` — 10/hr per user
- `POST /shares/:shareId/like` — 30/15min per user
- New middleware: `packages/backend/src/middleware/rateLimiter.ts`

**Frontend wiring audit + fixes (COMPLETE):**
Full wiring audit run across all QA-PASS features. All orphaned components mounted, all nav links wired:

**Organizer fixes:**
- `dashboard.tsx` — Added nav links for #25 Item Library, #41 Flip Report (PRO), #71 Reputation Score
- `command-center.tsx` — Mounted `SaleStatusWidget` (#14) per-sale
- `dashboard.tsx` — Added `SaleStatusWidget` to sales tab for published sales
- `SaleCard.tsx` — Added `VerifiedBadge` (#16) next to organizer name for shoppers
- `sales/[id].tsx` — Added `VerifiedBadge` to organizer header + `UGCPhotoGallery` (#47) after description
- `add-items/[saleId].tsx` — Wired `ValuationWidget` (#30, PRO-gated) in price section
- `holds.tsx` — Added `FraudBadge` (#17) to buyer accordion headers

**Shopper fixes:**
- `Layout.tsx` — Added nav links for all 6 hidden shopper pages (#32 #45 #48 #50 #62 #29)
- `shopper/dashboard.tsx` — Added quick-links grid for all shopper features

**QA results:**
- `#14 Real-Time Status` — UPGRADED to ✅ PASS (S195 audit was wrong; REST+Socket.io both working)
- `#22 Low-Bandwidth Mode` — ✅ PASS
- `#52 Encyclopedia Sprint 2` — ✅ PASS
- `#71 Reputation Sprint 2` — ✅ PASS
- `#46 #69` — ✅ PASS Sprint 1
- `#60` — ⚠️ PARTIAL (Sprint 1 backend only)
- `#54` — QA-FIXED (re-QA needed)
- `#19` — QA-FIXED (re-QA needed)

**Infrastructure:** Railway GREEN ✅ | Vercel GREEN ✅

**Last Updated:** 2026-03-17 (session 196)

**Pending — re-QA items (S197):**
- [ ] Re-QA #19 Passkey end-to-end (backend fixed, frontend wired — needs full flow test: register → login → redirect)
- [ ] Re-QA #54 Appraisal API (tier gate fixed, needs smoke test: POST requires PRO tier)
- [ ] Wave 5 Sprint 2 remaining: #46 #54 #60 #69 frontend builds not yet complete
- [ ] Open Stripe business account (test keys still in production — recurring)
- [ ] P3 nav discoverability pass (trending/cities/neighborhood/bounties routes exist but no nav entry points from dashboard)

---

**Session 195 COMPLETE (2026-03-17) — 6 BUG FIXES + COMPREHENSIVE QA AUDIT (29 FEATURES) + HEALTH SCOUT:**
- **Bugs fixed (all live on Railway + Vercel):**
  - Login infinite redirect loop → `NudgeBar` fired unauthenticated API call; 401 interceptor redirected to `/login` causing reload cycle. Fixed: `NudgeBar.tsx` guards `useNudges(!!user)`; `api.ts` interceptor skips redirect when already on `/login`.
  - Google Fonts CSP violation (service worker) → added `fonts.googleapis.com` + `fonts.gstatic.com` to `connect-src` in `next.config.js`
  - Dark mode body not inheriting `.dark` class → added `.dark body { bg-[#1C1C1E] }` to `globals.css`
  - Desktop ThemeToggle hidden for logged-out users → moved `<ThemeToggle>` outside `user ? (` conditional in `Layout.tsx`
  - Service worker breaking image loading (picsum, unpkg, raw.githubusercontent.com) → added all three to `connect-src`
  - `CityHeatBanner` showing raw coordinates "42.9, -85.7 is heating up" → `cityHeatService.ts` now groups by `sale.city` field instead of lat/lng grid cells
- **QA PASS — 29 features across 3 parallel agents:**
  - Organizer (7/7 PASS): #13 TEAMS Workspace, #17 Bid Bot Detector, #18 Post Performance Analytics, #25 Item Library, #31 Brand Kit, #41 Flip Report, #68 Command Center ✅
  - Shopper (7/8 PASS): #7 Referral Rewards, #29 Loyalty Passport, #32 Wishlist Alerts, #45 Collector Passport, #48 Treasure Trail, #50 Loot Log, #62 Digital Receipt ✅ | #19 Passkey UI not surfaced on login page ⚠️
  - Public/Infrastructure (12/14): #16 Verified Badge, #20 Degradation Mode, #30 AI Valuation, #39 Photo Ops, #40 Sale Hubs, #42 Voice-to-Tag, #47 UGC Photos, #49 City Heat, #51 Sale Ripples, #55 Challenges, #57 Rarity Badges, #59 Streak Rewards ✅ | #14 Real-Time Status partial (event-driven, no REST route) ⚠️ | **#22 Low-Bandwidth Mode FAIL — zero implementation** ❌
  - `/neighborhoods/[slug]` QA PASS ✅ (slugs are hardcoded, no DB needed — S194 assumption was wrong)
- **Health Scout:** 1 High (MAILERLITE_API_KEY vs _TOKEN mismatch — already fixed by Patrick in Railway), 1 Medium (photoOps share/like no rate limit), 2 Low (DEFAULT_* env vars, undocumented STRIPE_TERMINAL_SIMULATED var)
- **Both platforms green:** Railway ✅ Vercel ✅
- **Last Updated:** 2026-03-17 (session 195)

**Pending — Patrick action items (S195):**
- [ ] Build #22 Low-Bandwidth Mode (SIMPLE tier — zero implementation found, needs findasale-dev dispatch)
- [ ] Surface Passkey UI on login page (#19 backend complete, frontend integration missing)
- [ ] Add rate limiting to `POST /photo-ops/:stationId/shares` and `POST /shares/:shareId/like` (health scout medium finding)
- [ ] Add `NEXT_PUBLIC_STRIPE_TERMINAL_SIMULATED` to `.env.example` (health scout low)
- [ ] QA Wave 5 Sprint 1 features (#46 #52 #54 #60 #69 #71 — backend smoke tests, migrations required first)
- [ ] Wave 5 Sprint 2 frontend builds (6 features)
- [ ] P3 nav discoverability gaps (trending/cities/neighborhood/activity-feed/bounties etc.)
- [ ] Open Stripe business account (test keys still in production — recurring)

---

**Sessions 192+193 COMPLETE (2026-03-17) — VERCEL BUILD RECOVERY: ALL S192 TYPESCRIPT ERRORS CLEARED:**
- **Root cause:** S192 shipped new frontend pages referencing non-existent modules, wrong auth patterns, and SSR-unsafe code
- **Errors fixed (8 MCP commits to main):**
  - `hooks/useAuth` does not exist → corrected to `components/AuthContext` across hubs/, challenges.tsx, hubs/[slug].tsx (S192), loot-log pages (S193)
  - `user.organizerId` does not exist → corrected to `user.id` in workspace.tsx
  - `UGCPhoto.sale`/`.item` missing → added optional relation types to useUGCPhotos.ts
  - NextAuth `useSession` used in shopper pages → replaced with app's `useAuth` in loot-log.tsx, [purchaseId].tsx
  - `AuthContextType.loading` → `isLoading` in trails.tsx
  - `EmptyState title/description/action` → correct props `heading/subtext/cta` in trails.tsx, [trailId].tsx, trail/[shareToken].tsx
  - SSR prerender crash (`router.push` at render time) → wrapped in `useEffect` + hooks moved before auth guard in 6 shopper pages: achievements, alerts, holds, purchases, receipts, disputes
  - S192 `Layout title` prop → removed, moved to `<Head>` in challenges.tsx
  - `{ Skeleton }` named import → default import in flip-report page
  - `ValuationWidget editingItem` undefined reference → removed block in add-items page
  - PasskeyController + simplewebauthn types + Uint8Array/BufferSource incompatibility
- **Vercel build status: READY ✅ (commit 0626821)**
- **Last Updated:** 2026-03-17 (sessions 192+193)

**Pending — Patrick action items (S193):**
- [ ] QA Wave 5 features Sprint 1 (6 features: #46 #52 #54 #60 #69 #71 — backend + migrations only)
- [ ] Implement Sprint 2 for each Wave 5 feature (frontend UI + user-facing flow)
- [ ] QA Waves 2–4 features (S187–S190, 30+ features awaiting QA pass before promotion to users)
- [ ] Open Stripe business account (test keys still in production — recurring)

---

**Session 191 COMPLETE (2026-03-17) — WAVE 5 BUILD: 6 NEW FEATURES SHIPPED (ALL SPRINT 1) + 5 NEON MIGRATIONS APPLIED:**
- **Features shipped:** #71 Organizer Reputation Score (SIMPLE), #60 Premium Tier Bundle (PRO), #52 Estate Sale Encyclopedia (FREE), #54 Crowdsourced Appraisal API (PAID_ADDON), #46 Treasure Typology Classifier (PRO), #69 Local-First Offline Mode (PRO) ✅
- **All 6 features Sprint 1 COMPLETE** — backend services, schema, controllers, routes, migrations
- **Neon migrations applied (5 total):** 20260317003100_add_organizer_reputation, 20260317110000_add_teams_onboarding_complete, 20260317100000_add_encyclopedia, 20260317120000_add_appraisals, 20260317_add_item_typology ✅
- **pnpm install + prisma generate clean** ✅
- **Schema fix:** Named @relation annotations for appraisal User fields (commit 307b979) ✅
- **Commits:** 7ebcfb5, 307b979 (Wave 5 build + schema fix) ✅
- **Last Updated:** 2026-03-17 (session 191)

**Pending — Patrick action items (S191):**
- [ ] QA Wave 5 features Sprint 1 (6 features: #46 #52 #54 #60 #69 #71 — backend + migrations only)
- [ ] Implement Sprint 2 for each Wave 5 feature (frontend UI + user-facing flow)
- [ ] QA Waves 2–4 features (S187–S190, 30+ features awaiting QA pass before promotion to users)
- [ ] Open Stripe business account (test keys still in production — recurring)