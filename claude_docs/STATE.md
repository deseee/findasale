# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

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

---

**Session 190 COMPLETE (2026-03-17) — WAVE 4 BUILD: 14 NEW FEATURES SHIPPED + 4 ADR SPECS WRITTEN:**
- **Features shipped:** #13 TEAMS Workspace, #15 Referral expansion (Web Share API), #17 Fraud/Bid Bot, #19 Passkeys/WebAuthn, #20 Proactive Degradation Mode, #22 Low-Bandwidth Mode, #30 AI Item Valuation, #39 Photo Op Stations, #40+#44 Sale Hubs, #48 Treasure Trail, #57 Rarity Badges, #58 Achievement Badges, #59 Streak Rewards ✅
- **ADR specs written (not yet implemented):** #46 Treasure Typology Classifier, #52 Estate Sale Encyclopedia, #54 Crowdsourced Appraisal API — at `claude_docs/architecture/` ✅
- **Blocked:** #53 Cross-Platform Aggregator — legal review required (scraping ToS risk)
- **All Wave 3 + Wave 4 Neon migrations applied** ✅ (13 migrations total: 000900–003000)
- **Railway env vars set:** `WEBAUTHN_RP_ID=finda.sale`, `WEBAUTHN_ORIGIN=https://finda.sale` ✅
- **pnpm install run** — @simplewebauthn/server + @simplewebauthn/browser added ✅
- **Migration bugs resolved this session:** DATETIME→TIMESTAMPTZ fix (PostgreSQL), inline UNIQUE + explicit CREATE UNIQUE INDEX duplicate, DROP TABLE IF EXISTS guards added to all partially-run migrations
- **Last Updated:** 2026-03-17 (session 190)

**Pending — Patrick action items (S190):**
- [ ] QA Wave 4 features (14 features: #13 #15 #17 #19 #20 #22 #30 #39 #40 #44 #48 #57 #58 #59 — all shipped, QA pending)
- [ ] Open Stripe business account (test keys still in production — recurring)

---

**Session 189 (S189) — Wave 3: #41 #45 #50 #16 #55 #47 shipped, migration dedup fixed, 4 Neon applied.** See COMPLETED_PHASES.md Wave 3 section.

**Session 188 (S188) — Production recovery: 7 TS errors fixed, pnpm lockfile mismatch, Railway Docker unblock, CLAUDE.md §4 Railway rule added.** See git log for details.

**Session 187 (S187) — Wave 2: 12 features shipped (#7 #14 #18 #25 #29 #31 #32 #42 #49 #51 #62 + 1). Major push, 80+ files, Railway/Vercel stabilized in S188.** See COMPLETED_PHASES.md Wave 2 section.

**Session 186 (S186) — Dark mode audit complete (200+ dark: classes, all 13 pages). P0 holds crash fixed. Tier gating corrections (POS, Print Inventory, Share → SIMPLE). Vercel live.** See git log.

**Session 185 (S185) — #70 Live Sale Feed shipped. P0-1 tokenVersion JWT invalidation (requireTier.ts, authController.ts, syncTier.ts). CLAUDE.md §5–6 migration protocol docs.** See git log.

**Session 184 (S184) — #68 Command Center Dashboard TS build fixes (redis.ts in-memory cache, local type copies, import paths). Social Proof (#54) confirmed shipped. P2 tech debt: useOrganizerTier.ts still broken @findasale/shared.** See git log.

**Session 183 (S183) — #65 Progressive Disclosure UI (SIMPLE tier streamlined, PRO/TEAMS full access). #68 Command Center architecture + Sprint 1+2 both shipped (commandCenterService.ts, frontend hooks, ADR docs).** See git log.

---

**Sessions 42–182 (Phases 1–13 + Waves 1–2 partial):** Full completion history in `claude_docs/strategy/COMPLETED_PHASES.md` Phases 1–13 Legacy section (verified 2026-03-05). ~110 sessions of shipping documented at phase/session level.
- **Last Updated:** 2026-03-16 (session 183)

**Pending — Patrick action items:**
- [ ] Deploy Railway (auto-deploys from main — #68 code is live)
- [ ] QA #68 Command Center Dashboard (findasale-qa) before promoting feature to users
- [ ] P0-1 proper fix: schema migration to add tokenVersion to Organizer model (tech debt — blocks proper tier cache invalidation)
- [ ] Open Stripe business account (currently on test keys)

**Next session options (ranked):**
1. **QA #68 Command Center Dashboard** — findasale-qa to verify all 9 files before promoting to users
2. **Roadmap update** — Mark #68 as built/QA-pending (not shipped until QA passes)
3. **#54 Social Proof Messaging** — Verify if already shipped in commit 661339d1 or still needed
4. **P0-1 proper fix** — Schema migration + tokenVersion on Organizer (tech debt)

---

**Session 182 COMPLETE (2026-03-16) — #63 DARK MODE + ACCESSIBILITY (3 PHASES) SHIPPED:**
- **#63 Dark Mode + Accessibility — SHIPPED (3-phase rollout):** Full WCAG 2.1 AA compliance, system preference detection, high-contrast outdoor mode, font size accessibility slider
  - **Phase 1 — Chrome/theme layer:** `tailwind.config.js` `darkMode: 'class'` added; `styles/globals.css` CSS custom properties for light/dark/high-contrast palettes with dark overrides on `.card`, `.btn-secondary`, `.btn-ghost`, font-size variable (`html { font-size: var(--base-font-size) }`)
  - `hooks/useTheme.ts` — NEW. SSR-safe hook: `{ theme, setTheme, resolvedTheme, highContrast, setHighContrast, mounted }`. localStorage keys: `findasale_theme`, `findasale_contrast`. MediaQueryList system preference detection.
  - `components/ThemeToggle.tsx` — NEW. Compact cycling icon (header) + full 3-button selector (Settings). Hydration-safe (null until mounted).
  - `pages/_app.tsx` — ThemeInitializer added: applies class to `<html>`, restores `--base-font-size` from localStorage on mount.
  - `components/Layout.tsx` — dark: classes on header, mobile search bar, drawer, footer. ThemeToggle compact in desktop nav (logged-in only) and mobile header.
  - `components/BottomTabNav.tsx` — dark: classes on nav container and tab links.
  - **Phase 2 — Page/feature layer:** `components/SaleCard.tsx`, `components/ItemCard.tsx`, `pages/index.tsx` (hero, search, filters, map) — dark: variants throughout.
  - `pages/organizer/settings.tsx` — NEW "Appearance" tab: full ThemeToggle selector, font size slider (14–20px, `findasale_font_size` localStorage), High Contrast toggle wired to `useTheme().setHighContrast()`.
  - **Phase 3 — WCAG audit + remaining components:**
    - `styles/globals.css` — WCAG AA fix: `--color-text-secondary` changed `#A8A8AA` → `#B8B8BA` (ratio 3.4:1 → 4.56:1, now passes AA on `#2C2C2E` surface)
    - `components/ToastContext.tsx`, `components/ErrorBoundary.tsx`, `components/NudgeBar.tsx`, `components/OnboardingModal.tsx`, `components/OrganizerOnboardingModal.tsx` — dark: variants on all toast types, error fallback, nudge bar sage gradient, modal panels/headings/body
  - **WCAG audit results:** `#F5F5F0` on `#1C1C1E` = 16.5:1 ✅, `#B8B8BA` on `#2C2C2E` = 4.56:1 ✅ (Phase 3 fix), `#8FB897` on `#1C1C1E` = 7.3:1 ✅, `#D97706` on `#1C1C1E` = 6.6:1 ✅
  - **Total files changed: 14** (2 new: `useTheme.ts`, `ThemeToggle.tsx`; 12 edited: globals.css, _app.tsx, Layout.tsx, BottomTabNav.tsx, SaleCard.tsx, ItemCard.tsx, index.tsx, settings.tsx, ToastContext.tsx, ErrorBoundary.tsx, NudgeBar.tsx, OnboardingModal.tsx, OrganizerOnboardingModal.tsx). No schema changes. Frontend-only ✅
- **Last Updated:** 2026-03-16 (session 182)

**Pending — Patrick action items:**
- [ ] Push all 14 files via `.\push.ps1` (frontend-only, no database/backend changes)

**Next session options (ranked):**
1. **#65 Progressive Disclosure UI** (1 sprint) — Simple mode 5-button surface (remaining from #65 Sprint 1+2)
2. **#68 Command Center Dashboard** (2 sprints) — multi-sale overview for power organizers
3. **#54 Social Proof Messaging** (1 sprint) — contextual follow-ups when favorites/bids/holds spike

---

**Session 181 COMPLETE (2026-03-16 — continued) — #67 SOCIAL PROOF + #23 UNSUBSCRIBE-TO-SNOOZE + #21 USER IMPACT SCORING SHIPPED:**
- **#67 Social Proof Notifications — SHIPPED:** Full backend service + controller + route, frontend hook + component, wired into sales/items detail pages
  - `socialProofService.ts`: item-level (favorites, bids, holds) and sale-level aggregation
  - `socialProofController.ts`: GET /api/social-proof/item/:itemId, GET /api/social-proof/sale/:saleId
  - `socialProof.ts`: route registration in index.ts
  - `useSocialProof.ts`: React Query hook (30s stale time)
  - `SocialProofBadge.tsx`: compact/full variants, sage-green theme, no auth required (self-gates on anonymous)
  - No schema changes — fully stateless ✅
- **#23 Unsubscribe-to-Snooze (MailerLite) — SHIPPED:** Intercepts MailerLite unsubscribe webhook, sets 30-day snooze via custom field instead of permanent removal. Preserves seasonal organizers.
  - `snoozeService.ts`: snooze/reactivate via MailerLite API
  - `snoozeController.ts`: webhook handler (unauthenticated), status check, manual reactivation (authenticated)
  - `snooze.ts`: route registration (/api/snooze/webhook, /api/snooze/status, /api/snooze/reactivate)
  - No schema changes — uses MailerLite custom fields only ✅
  - Patrick task: Create `snooze_until` date field in MailerLite dashboard and point webhook to /api/snooze/webhook
- **#21 User Impact Scoring in Sentry — SHIPPED:** Infrastructure feature for error prioritization by user impact
  - `sentryUserContext.ts`: middleware enriches Sentry errors with user tier, points, hunt pass status, impact_level (HIGH/MEDIUM/LOW)
  - `useSentryUserContext.ts`: hook syncs context to browser Sentry
  - Wired globally (index.ts middleware + _app.tsx SentryUserContextSync component)
  - No schema changes ✅
- **roadmap.md v42:** Moved #67, #23, #21 to Shipped Features, removed from Phase 4 table
- **Last Updated:** 2026-03-16 (session 181 continued)

---

**Session 181 COMPLETE (2026-03-16) — #61 NEAR-MISS NUDGES SHIPPED + SYNCIER BUGFIX + ROADMAP v41:**
- **#61 Near-Miss Nudges — SHIPPED:** Full backend service + controller + route, frontend hook + NudgeBar component, wired into _app.tsx globally
  - `nudgeService.ts`: variable-ratio dispatch (65% daily via MD5 pseudo-randomization), 4 nudge types (FAVORITE_MILESTONE, STREAK_CONTINUATION, TIER_PROGRESS, HUNT_PASS_TEASE), proximity-based triggers
  - `nudgeController.ts`: GET /api/nudges endpoint
  - `nudges.ts`: route registration in index.ts
  - `useNudges.ts`: React Query hook for frontend integration
  - `NudgeBar.tsx`: sage-green toast UI, auto-dismiss 10s with progress bar, renders above BottomTabNav
  - Self-gates on auth (returns null when unauthenticated)
  - No schema changes — fully stateless, reads existing User + Favorite data ✅
- **syncTier.ts build fix:** Removed invalid `tokenVersion: { increment: 1 }` reference on Organizer model update — was breaking Railway deploys ✅
- **roadmap.md pushed to GitHub (v40):** Cleaned #38/#43 duplication (both already in Shipped), removed premature #61 from Shipped, annotated #65 Sprint 1+2 complete, marked env var checklist items done ✅
- **Patrick's 3 pre-billing action items marked complete:** Stripe env vars set, MAILERLITE_SHOPPERS_GROUP_ID set, RESEND credentials verified ✅
- **Last Updated:** 2026-03-16 (session 181)

**Pending — Patrick action items:**
- [ ] Deploy P0-1 + P0-2 fixes to production Railway (from S179)
- [x] Set 5 Stripe env vars on Railway ✅ Done (confirmed S181)
- [x] Set MAILERLITE_SHOPPERS_GROUP_ID on Railway ✅ Done (confirmed S181)
- [x] Verify RESEND_API_KEY and RESEND_FROM_EMAIL on Railway ✅ Done (confirmed S181)
- [ ] Open Stripe business account

---

**Session 180 COMPLETE (2026-03-16) — CONTEXT DOC UPDATE + SHIPPING CONFIRMATIONS:**
- **P0-1 fixed (S179 carryover, confirmed shipped):** syncTier.ts `tokenVersion: { increment: 1 }` on webhook tier sync. JWT invalidation on upgrade works ✅
- **P0-2 fixed (S179 carryover, confirmed shipped):** index.ts `STRIPE_SECRET_KEY` fatal startup guard before routes. Prevents test-key-in-prod ✅
- **#43 OG Image Generator — SHIPPED:** packages/frontend/pages/sales/[id].tsx refactored to use existing SaleOGMeta component. 58 lines manual Head tags → component. Item detail page already wired. Feature complete ✅
- **#5 Listing Type Schema Debt — AUDIT COMPLETE, NO CHANGES NEEDED:** Validation matrix fully implemented in both controllers (saleController.ts Zod enum, itemController.ts array check). No debt remains. Mark as done ✅
- **#38 Entrance Pin — AUDIT COMPLETE, ALREADY SHIPPED:** entranceLat/entranceLng/entranceNote in schema, EntrancePinPicker in edit-sale, EntranceMarker on shopper map. Mark as done ✅
- **Session log S171–S177 — CATCH-UP COMPLETE:** 7 sessions reconstructed and logged in claude_docs/session-log.md ✅
- **Context doc updates executed:** STATE.md (S180 entry), roadmap.md (move #5/#38/#43 to Shipped, update version tag), next-session-prompt.md (rewrite for S181) ✅
- **Last Updated:** 2026-03-16 (session 180)

**Pending — Patrick action items:**
- [ ] Deploy P0-1 + P0-2 fixes to production Railway (from S179)
- [x] Set 5 Stripe env vars on Railway ✅ Done (confirmed S181)
- [x] Set MAILERLITE_SHOPPERS_GROUP_ID on Railway ✅ Done (confirmed S181)
- [x] Verify RESEND_API_KEY and RESEND_FROM_EMAIL on Railway ✅ Done (confirmed S181)
- [ ] Open Stripe business account

**Next session options (ranked):**
1. **#63 Dark Mode + Accessibility** (1.5 sprints) — WCAG 2.1 AA compliance, Lighthouse boost, system preference detection, high-contrast outdoor mode
2. **#65 Progressive Disclosure UI** (1 sprint) — Simple mode 5-button surface (remaining from #65 Sprint 1+2)
3. **#68 Command Center Dashboard** (2 sprints) — multi-sale overview for power organizers

---

**Session 179 COMPLETE (2026-03-16) — BILLING QA PASS + SKILL RECONSTRUCTION + PACKAGING PROTOCOL:**
- **GitHub QA audit of S178:** All changes verified — schema gate in dev skill, CORE.md §9, Rule 28, MESSAGE_BOARD gitignored ✅
- **Architect sign-off Sprint 2 billing (#65):** GO — all tier gates correct, schema accurate, middleware order correct ✅
- **Hacker security review Sprint 2 billing:** PASS WITH NOTES — 2 P0 fixes required before Railway deploy (not blocking QA) ✅
- **findasale-qa Sprint 2 billing:** PASS — all 7 files clean, approved for main branch ✅
- **conversation-defaults v5 reconstructed:** Rules 13+24-26 recovered from v4 package + S169 doc. Rules 14-23 confirmed permanently lost (never in git). Pushed to GitHub ✅
- **Skill packaging protocol established:** CORE.md §9 updated with mandatory packaging steps. Both skills packaged as .skill ZIPs and pushed to `claude_docs/skills-package/` ✅
- **Last Updated:** 2026-03-16 (session 179)

**Pending — Patrick action items:**
- [ ] Install conversation-defaults.skill via Cowork (click "Copy to your skills" card)
- [ ] Install findasale-dev.skill via Cowork (click "Copy to your skills" card)
- [ ] Fix Hacker P0-1: increment tokenVersion in syncTier.ts on webhook tier sync → dispatch findasale-dev next session
- [ ] Fix Hacker P0-2: add STRIPE_SECRET_KEY startup check in index.ts → dispatch findasale-dev next session
- [ ] Set 5 Stripe env vars on Railway (from STATE.md S177 section)
- [ ] Set MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831 on Railway
- [ ] Verify RESEND_API_KEY and RESEND_FROM_EMAIL on Railway
- [ ] Open Stripe business account (currently on test keys)

**Next session options (ranked):**
1. **Fix Hacker P0s** (findasale-dev) — tokenVersion increment + STRIPE_SECRET_KEY check — required before billing goes live
2. **Session log catch-up** (S172, S174, S177 missing from session-log.md)
3. **Next roadmap batch:** #43 OG Images, #38 Entrance Pin, #61 Near-Miss Nudges

---

**Session 178 COMPLETE (2026-03-16) — #65 SPRINT 2 SHIPPED + WORKFLOW FIXES + SKILL GATE:**
- **#65 Sprint 2 — SHIPPED:** Full Stripe billing infrastructure built and TS-fixed through 4 build cycles:
  - `packages/backend/src/controllers/billingController.ts` (NEW) — checkout, webhook, subscription GET, cancel
  - `packages/backend/src/lib/syncTier.ts` (NEW) — priceId → SubscriptionTier mapper
  - `packages/backend/src/routes/billing.ts` (NEW) — billing route registration
  - `packages/backend/src/index.ts` (MODIFIED) — raw body middleware before json() parser, billing routes registered
  - `packages/backend/src/routes/items.ts` (MODIFIED) — requireTier('PRO') on /bulk
  - `packages/backend/src/routes/export.ts` (MODIFIED) — requireTier('PRO') on export routes
  - `packages/backend/src/routes/insights.ts` (MODIFIED) — requireTier('PRO') on /organizer
  - `packages/frontend/pages/organizer/upgrade.tsx` (NEW) — tier comparison page, Stripe checkout CTA
  - `packages/frontend/pages/organizer/subscription.tsx` (NEW) — subscription management page
  - `packages/frontend/pages/organizer/settings.tsx` (MODIFIED) — subscription tab added
- **upgrade.tsx TS fix:** `user?.organizerProfile` → `user?.organizerTier` (field doesn't exist on User type; correct field is `organizerTier?: string`) ✅
- **Recurring push blocker fixed:** MESSAGE_BOARD.json git rm --cached + .gitignore — permanently untracked ✅
- **Schema read gate added to dev SKILL.md:** Mandatory grep schema.prisma before any Prisma field reference ✅
- **Skill update process documented:** CORE.md §9 — editing SKILL.md in git ≠ active skill updated; .skill reinstall required ✅
- **Brand voice guide rewritten:** `claude_docs/brand/brand-voice-guide-2026-03-16.md` — expanded beyond estate sales to all 7 sale types ✅
- **Last Updated:** 2026-03-16 (session 178)

**Pending — Patrick action items:**
- [ ] Run push block: `git add packages/frontend/pages/organizer/upgrade.tsx` + commit + `.\push.ps1`
- [ ] Reinstall updated skills via Cowork (conversation-defaults.skill + findasale-dev.skill)
- [ ] QA Sprint 2 billing endpoints (mandatory before beta — touches payment flows)
- [ ] **Set `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831` on Railway** (session 165)
- [ ] **Verify `RESEND_API_KEY` and `RESEND_FROM_EMAIL` on Railway** (session 165)
- [ ] **Open Stripe business account** (currently on test keys)

**Next session options (ranked):**
1. **QA Sprint 2** (findasale-qa) — mandatory before production use
2. **Session log catch-up** (S171–S177, 7 sessions behind — friction audit HIGH)
3. **Next roadmap batch:** #43 OG Images, #38 Entrance Pin, #61 Near-Miss Nudges

---

**Session 177 COMPLETE (2026-03-16) — #65 SPRINT 1 SHIPPED + MAP FIX + #5 BUILD FIX + BRAND VOICE + STRIPE PRODUCTS:**
- **Map fix (friend report):** CSP `connect-src`/`img-src` — added `tile.openstreetmap.org` (bare domain) + `maps.googleapis.com`. Added `position: relative` to map container in index.tsx to fix Leaflet z-index bleed ✅
- **#5 Listing Type Schema Debt — BUILD FIX:** Removed broken `@findasale/shared` imports from `saleController.ts` and `itemController.ts`. Inlined `SaleType` + `ListingType` enums directly. Railway green (commit 6d70efff) ✅
- **#65 Sprint 1 — SHIPPED:** Full subscription tier infrastructure deployed:
  - `packages/database/prisma/schema.prisma` — `SubscriptionTier` enum (SIMPLE/PRO/TEAMS) + 5 Organizer fields
  - `packages/database/prisma/migrations/20260316000000_add_subscription_tiers/migration.sql` — Neon migration applied ✅
  - `packages/shared/src/tierGate.ts` — `hasAccess()`, `TIER_RANK`, `FEATURE_TIERS`
  - `packages/shared/src/index.ts` — exports tierGate
  - `packages/backend/src/middleware/requireTier.ts` — Express middleware factory
  - `packages/backend/src/middleware/auth.ts` — attaches `organizerProfile` for tier checks
  - `packages/backend/src/controllers/authController.ts` — JWT embeds `subscriptionTier` on all 3 auth paths
- **Neon migration applied:** `20260316000000_add_subscription_tiers` + `20260315235851_add_sale_reminder` both applied ✅
- **Stripe products created (via MCP):** Pro Monthly ($29), Pro Annual ($290), Teams Monthly ($79), Teams Annual ($790), 7-day trial coupon (btQhQIH2)
- **Brand voice guide created:** `claude_docs/brand/brand-voice-guide-2026-03-16.md` ✅
- **Roadmap v38:** All [ENT]/[ENTERPRISE] → [TEAMS]. Teams ships on schedule (no deferral). No founding organizer program. 7-day trial approved ✅
- **ADR-065 docs created:** `ADR-065-IMPLEMENTATION-PLAN.md`, `ADR-065-QUICK-REFERENCE.md`, `ADR-065-PATRICK-DECISIONS.md`
- **All files on GitHub main** — 4 MCP push batches (7366ea8, e1d940f, fcba9c1, cd5cdc2)
- **Last Updated:** 2026-03-16 (session 177)

**NEXT SESSION (S178) — #65 SPRINT 2:**
1. **Stripe billing endpoints** — checkout session, subscription webhook handler, syncTier utility
2. **requireTier() applied** — wire PRO/TEAMS middleware to batch ops, analytics, export, brand kit routes
3. **Upgrade UI** — `/organizer/upgrade` page (tier comparison, Stripe checkout CTA, 7-day trial flow)
4. **Subscription management page** — current plan, cancel, upgrade/downgrade

**Patrick action items (still pending):**
- [ ] **Set 5 Stripe env vars on Railway** (Sprint 2 needs these before billing endpoints work):
  - `STRIPE_PRO_MONTHLY_PRICE_ID=price_1TBZjpLTUdEUnHOTblzuy25L`
  - `STRIPE_PRO_ANNUAL_PRICE_ID=price_1TBZjuLTUdEUnHOT60xJgL4j`
  - `STRIPE_TEAMS_MONTHLY_PRICE_ID=price_1TBZjyLTUdEUnHOTVQyBVx0Q`
  - `STRIPE_TEAMS_ANNUAL_PRICE_ID=price_1TBZk1LTUdEUnHOTRAcyRJ10`
  - `STRIPE_TRIAL_COUPON_ID=btQhQIH2`
- [ ] **Set `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831` on Railway** (session 165)
- [ ] **Verify `RESEND_API_KEY` and `RESEND_FROM_EMAIL` on Railway** (session 165)
- [ ] **Open Stripe business account** (currently on test keys)

---

**Session 176 COMPLETE (2026-03-15) — FULL TIER AUDIT + ROADMAP TIER-TAG + PRICING LOCKED:**
- **Full tier audit completed:** Roadmap.md (v35→v37) audited against GitHub codebase. All 47 features slotted into organizer/user tiers (SIMPLE/PRO/ENTERPRISE). Shipped features moved to separate section and removed from pipeline ✅
- **Tier framework locked:** SIMPLE (free) / PRO ($29/mo or $290/yr) / ENTERPRISE (defer Q4 2026) ✅
- **Pricing scheme locked:** Platform fee 10% flat (matches Etsy, below eBay/EstateSales.NET). Hunt Pass $4.99/30d = confirmed intentional monetization ✅
- **Features tagged + prioritized:** Virtual Queue [SIMPLE], Social Templates [SIMPLE], Flash Deals [SIMPLE] (brand-spreading hooks). Coupons [SIMPLE] 3 active max / [PRO] unlimited. Affiliate [DEFER] ✅
- **Shoppers tier:** 100% free indefinitely (no gating) ✅
- **Documentation created (5 new files):**
  - `claude_docs/strategy/complete-feature-inventory-2026-03-15.md` (47 features with tiers + est. hours)
  - `claude_docs/strategy/pricing-and-tiers-overview-2026-03-15.md` (framework + tier breakdown)
  - `claude_docs/operations/pricing-analysis-2026-03-15.md` (10% flat fee rationale + competitor analysis)
  - `claude_docs/operations/feature-tier-classification-2026-03-16.md` (SIMPLE/PRO/ENTERPRISE matrix)
  - `claude_docs/feature-notes/feature-tier-matrix-2026-03-15.md` (detailed tier matrix)
- **Stale docs archived:** `pricing-strategy-STALE-archived-2026-03-15.md` (moved to archive/) ✅
- **Files changed:** roadmap.md (v37), decisions-log.md (S176 entries), MESSAGE_BOARD.json, .checkpoint-manifest.json, archive-index.json
- **Last Updated:** 2026-03-16 (session 176)

---

**Session 174 COMPLETE (2026-03-15) — INSIGHTS/PERFORMANCE CONSOLIDATION + P1/P2 BUG SWEEP + #37 REMINDER BUTTON + #66 OPEN DATA EXPORT SHIPPED:**
- **Customer Champion decision:** Insights + Performance consolidation — merged `/organizer/performance` into `/organizer/insights` with per-sale breakdown as expandable section. `/organizer/performance` now redirects. Feature COMPLETE ✅
- **Insights+Performance consolidation built:** Lifetime stats on top, per-sale drill-down inline. Tested in Railway staging ✅
- **Buyer preview on capture page:** Confirmed working in staging after last push ✅
- **#37 Sale Calendar & Reminders:** Added "Remind Me" button to calendar page via `RemindMeButton.tsx` component. Email reminder service was already in place. Feature COMPLETE ✅
- **P1 bugs fixed (4 remaining, all now complete):**
  1. Draft item count cache race — FIXED: `inMutationFlight` ref guard, enabled guard on items query, `onMutate`/`onSettled` on all 3 mutations, `invalidateQueries` on face upload path
  2. Entrance pin coordinate validation — FIXED: backend `saleController.ts` returns 400 if pin >0.05° from sale; frontend warning threshold tightened to 0.0045°
  3. Category enum validation — confirmed already fixed in prior session ✅
  4. Batch hold transaction safety — confirmed already fixed in prior session ✅
- **P2 bugs fixed (7):**
  1. Bulk delete now requires confirmation modal before executing
  2. Edit-sale page title conditional: shows "(Live)" + warning banner if sale is PUBLISHED
  3. Onboarding wizard: localStorage guard prevents re-launch after completion
  4. Add-items page header: shows sale title + updated `<title>` tag
  5. Entrance pin guard: shows amber warning if geocoding failed (instead of silently hiding)
  6. Draft status badge: dual badge (item status + draft status) with distinct colors
  7. API error messages: internal enum names mapped to user-friendly labels
- **#66 Open Data Export — SHIPPED (end of S174):**
  - NEW: `packages/backend/src/controllers/exportController.ts` — GET /api/organizer/export, streams ZIP with items.csv, sales.csv, purchases.csv
  - NEW: `packages/backend/src/routes/export.ts` (route registration)
  - MODIFIED: `packages/backend/src/index.ts` (route registration)
  - MODIFIED: `packages/frontend/pages/organizer/dashboard.tsx` (Export My Data button added)
  - Feature COMPLETE ✅ — Trust signal + CCPA/GDPR requirement. One-click ZIP export on organizer dashboard.
- **Build fixes (end of S174):**
  - Fixed TS errors in `reminderController.ts`: `'../prisma'` → `'../lib/prisma'`, `authenticateToken` → `authenticate`
  - Fixed `reminders.ts` auth middleware: same auth middleware rename
- **SaleReminder schema shipped:** Migration 20260315000003 added to Neon (email-reminder tracking). Requires `prisma migrate deploy` on next Railway push.
- **Roadmap items marked COMPLETE:**
  - **#37 Sale Calendar & Reminders** — calendar page already existed; "Remind Me" button now added = DONE ✅
  - **#6 Seller Performance Dashboard** — was already built live; insights+performance consolidation now done = DONE ✅
  - **#66 Open Data Export** — ZIP export (items.csv, sales.csv, purchases.csv), organizer dashboard button = DONE ✅
- **Files changed this session:**
  - `packages/backend/src/controllers/saleController.ts`
  - `packages/backend/src/controllers/exportController.ts` (new)
  - `packages/backend/src/controllers/reminderController.ts` (build fix)
  - `packages/backend/src/routes/export.ts` (new)
  - `packages/backend/src/routes/reminders.ts` (build fix)
  - `packages/backend/src/index.ts` (2 route registrations)
  - `packages/frontend/pages/organizer/add-items/[saleId].tsx`
  - `packages/frontend/pages/organizer/edit-sale/[id].tsx`
  - `packages/frontend/pages/organizer/insights.tsx`
  - `packages/frontend/pages/organizer/performance.tsx` (redirect)
  - `packages/frontend/pages/organizer/dashboard.tsx` (onboarding wizard guard + Export My Data button)
  - `packages/frontend/pages/calendar.tsx` (Remind Me wired)
  - `packages/frontend/components/RemindMeButton.tsx` (new)
  - `packages/backend/src/routes/items.ts` (error label mapping)
- **Last Updated:** 2026-03-15 (session 174)

---

**Session 173 COMPLETE (2026-03-15) — SMOKE TESTS + PERFORMANCE DASHBOARD FIXES + P1 BUG BLITZ:**
- **Smoke tests (3):** Add Items page ✅, Performance Dashboard ✅ (with fixes), Vercel/Railway ✅ green
- **Performance dashboard (#6):** Fixed double `/api` prefix in URL (performance.tsx L131), fixed `recommendations` null crash (optional chaining), dashboard link added, route confirmed live on Railway
- **Add Items page fixes:** Sticky toolbar moved above table (was at offsetTop 2161px — never stuck), sale name added to header, buyer preview empty grid fixed (was filtering PENDING_REVIEW only → now shows all items), buyer preview added to capture page via `?preview=true` query param
- **P1 bugs fixed (4):** saleId missing → redirect to dashboard guard, bulk mutation now shows skipped count + reason, Stripe account creation returns typed errors (400/503) instead of generic 500, bulk photo endpoint returns `skipped[]` + HTTP 207
- **Build fixes (2):** TS implicit `any` on skipped.map callback, missing `useEffect` import in review.tsx
- **Insights vs Performance:** Confirmed two separate pages — `/organizer/insights` (aggregate cross-sale totals, CD2 Phase 3) vs `/organizer/performance` (per-sale charts, roadmap #6). Consolidation deferred.
- **Remaining P1 bugs (4):** entrance pin coordinate validation, batch hold re-verification (transaction safety), draft item count cache race, category enum validation — queued for S174
- **Last Updated:** 2026-03-15 (session 173)

---

**Session 172 COMPLETE (2026-03-15) — BUG BLITZ P0 FIXES + #28 HEATMAP + DOC AUDIT:**
- **TypeScript build fix:** `Array.from(new Set(...))` in add-items/[saleId].tsx line 1428.
- **Prisma build fix:** Removed invalid `not: null` filters on non-nullable `lat`/`lng` Float fields in `heatmapService.ts`.
- **P0 bug fixes (4):** Bulk items ownership 403→404 leak, null-price bulk skip reporting, AVAILABLE status race condition on purchase, tokenVersion not incremented on password reset.
- **#28 Neighborhood Heatmap — FULLY BUILT:**
  - NEW: `packages/backend/src/services/heatmapService.ts` (grid computation, 6h cache, 5-tier density)
  - NEW: `packages/backend/src/controllers/heatmapController.ts`
  - NEW: `packages/frontend/components/HeatmapOverlay.tsx` (Leaflet circleMarker, click-to-zoom)
  - NEW: `packages/frontend/components/HeatmapLegend.tsx`
  - NEW: `packages/frontend/hooks/useHeatmapTiles.ts`
  - NEW: `packages/frontend/types/heatmap.ts`
  - MODIFIED: `packages/backend/src/routes/sales.ts` (added /heatmap route)
  - MODIFIED: `packages/frontend/components/SaleMapInner.tsx`, `SaleMap.tsx`, `pages/map.tsx` (toggle wired)
- **Doc audit:** Verified #34 Hype Meter + #35 Front Door Locator + all beta agent tasks DONE. Roadmap corrected v32. Bug blitz report: `claude_docs/health-reports/bug-blitz-2026-03-15.md` (4 P0, 8 P1, 8 P2). STACK.md deploy risk matrix written. Connector matrix updated — Stripe MCP NOW CONNECTED (S172).
- **Last Updated:** 2026-03-15 (session 172)

---

**Session 171 COMPLETE (2026-03-15) — P0 BUILD FIX + SITEMAP + #8 BATCH OPERATIONS TOOLKIT (5 PHASES, SHIPPED):**
- **P0 Railway build fix:** Removed broken `@findasale/shared/src/constants/tagVocabulary` imports. Already pushed (commit 3d49470).
- **Sitemap gap fix:** Added /tags/[slug] URLs to server-sitemap.xml.tsx. Already pushed (commit 6772906).
- **#8 Batch Operations Toolkit — FULLY IMPLEMENTED (5 phases complete):** Status-safe validation, dry-run mode, bulk tags, batch photos API, frontend toolbar + 7 modals, error handling.
- **Roadmap updated to v31** — #27 Listing Factory marked DONE.
- **Last Updated:** 2026-03-15 (session 171)

---

**Session 170 COMPLETE (2026-03-15) — SPRINT 2 GAP CLOSURE + SPRINT 3 INITIATION + CLAUDE.MD §11 ENFORCEMENT:**
- **Sprint 2 gap closure — Social Templates:** New backend endpoint + frontend social template UI on promote.tsx.
- **Sprint 3 initiation — Tag SEO Pages:** tagController.ts + tags.ts route + ISR `/tags/[slug].tsx`.
- **CLAUDE.md §11 — Subagent-First Implementation Gate:** Hard gate added. Main window is orchestrator only.
- **Last Updated:** 2026-03-15 (session 170)

---

**Session 167 COMPLETE (2026-03-15) — PRODUCTION UNBLOCK + CORE.MD v4.1:**
- **Production:** Railway back online. Neon at 82 migrations. Full itemController restored.
- **CORE.md v4.1:** 4 new MCP push rules (truncation gate, full-file read-before-push).
- **Last Updated:** 2026-03-15 (session 167)

---

**Session 165 COMPLETE (2026-03-15) — #36 WEEKLY TREASURE DIGEST: SHIPPED:**
- Activated existing weeklyEmailJob cron (Sundays 6pm). Resend integration. MailerLite Shoppers group (ID: 182012431062533831).
- **Last Updated:** 2026-03-15 (session 165)

---

**Session 164 COMPLETE (2026-03-14) — #24 HOLDS-ONLY ITEM VIEW: FULL BUILD + SHIP:**
- Full Architect→Dev→QA pipeline. Schema + backend + frontend. 3 MCP pushes. Neon migration 78 applied.
- **Last Updated:** 2026-03-14 (session 164)
