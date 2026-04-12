# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Current Work

**S442 COMPLETE (2026-04-11):** Team Collaboration Phase 2 schema fix + test data seeding. Fixed 18 TS errors in workspaceController.ts by adding 5 missing fields to WorkspaceSettings model. Seeded full team test data for user1 (Alice) and user3 (Carol).

**S442 What shipped:**
- **Schema fix:** Added `name`, `description`, `brandRules` (Text), `templateUsed`, `maxMembers` (default 5) to WorkspaceSettings model — these were specified in the ADR but omitted by the schema agent in Phase 1.
- **Migration:** `20260411000003_workspace_settings_fields/migration.sql` — 5 ALTER TABLE ADD COLUMN statements.
- **Cache bust:** Updated `Dockerfile.production` cache-bust date to force Railway rebuild.
- **Test data seeded (Railway DB direct via psycopg2):**
  - Alice (user1): 7-member team — Alice (OWNER), David Jones (ADMIN), Bob Smith (MEMBER), Emma Brown (MANAGER), Frank Davis (STAFF), Iris Moore (STAFF), Grace Miller (VIEWER). All with departments, phone numbers, Mon-Sat availability, weekly+monthly performance stats, 3 weeks of leaderboard history.
  - Carol (user3): 4-member team — Henry Wilson (ADMIN), Bob Smith (MEMBER), Frank Davis (MANAGER), Emma Brown (STAFF). Same data completeness.
  - Both workspaces: WorkspaceSettings (templates, brand rules, commission override), 76 workspace permissions across all roles, 33 leaderboard entries.
  - Alice's team = $119/mo scenario (5 base + 2 extra seats × $20).

**S442 Files changed (3):**
- `packages/database/prisma/schema.prisma` — 5 fields added to WorkspaceSettings
- `packages/database/prisma/migrations/20260411000003_workspace_settings_fields/migration.sql` — NEW
- `packages/backend/Dockerfile.production` — cache bust 2026-04-11

**S442 Migration required:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

**S441 COMPLETE (2026-04-11):** 8-issue fix batch from Patrick's live site review. 2 dispatch rounds (7+2 agents). 15 files changed. 1 DB backfill.

**S441 What shipped:**
- **Bounties:** XP explainer copy added below input ("Minimum 50 XP. Organizers receive 1/2..."). Submit Match button wired with informational toast (requires organizer context).
- **Achievements:** Stale streak copy replaced with guildXp/Explorer Rank progression. JWT now carries `guildXp` across all 4 auth flows. Frontend shows rank progression with XP progress bar.
- **Reputation (P0 bug fix):** Root cause — `reputationService.ts` used `Organizer.id` instead of `User.id` for `OrganizerReputation` upserts. Fixed service + controller. DB backfilled: 1 organizer now has score=4.67 from 3 reviews.
- **Dashboard:** Added "View Sale" eye icon button linking to public `/sales/${id}`.
- **Receipts:** Fixed review CTA route (`/organizer/{id}/reviews` → `/organizers/{id}`).
- **Haul Posts:** Replaced URL text input with Cloudinary file upload (camera icon, preview, 5MB limit). Replaced item ID input with searchable autocomplete from purchase history.
- **Price Research Card:** Condensed layout, reordered sections (Smart Estimate top, comps middle), added sage-green "Request Community Appraisal" button with loading states. Props passed from edit-item + review pages.
- **Lucky Roll:** Investigated — already fully implemented (frontend + backend + pity system + weekly resets). May need XP in test account to test.

**S441 Files changed (15):**
- `packages/frontend/pages/shopper/bounties.tsx`
- `packages/frontend/pages/shopper/achievements.tsx`
- `packages/frontend/components/AuthContext.tsx`
- `packages/backend/src/controllers/authController.ts`
- `packages/backend/src/controllers/passkeyController.ts`
- `packages/backend/src/routes/organizers.ts`
- `packages/backend/src/routes/users.ts`
- `packages/backend/src/services/reputationService.ts`
- `packages/backend/src/controllers/reputationController.ts`
- `packages/frontend/pages/organizer/dashboard.tsx`
- `packages/frontend/components/ReceiptCard.tsx`
- `packages/frontend/components/PriceResearchPanel.tsx`
- `packages/frontend/pages/organizer/edit-item/[id].tsx`
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx`
- `packages/frontend/pages/shopper/haul-posts/create.tsx`

**S441 No schema changes.** S440 migrations still need to be applied if not done yet.

---

**S440 COMPLETE (2026-04-11):** Massive nav/UX session — 3 push rounds.

**S440 Round 1 (7 parallel agents):** Nav restructured (grey icons, Explorer Passport rename, Hunt Exclusives group, league moved). Bounties UX upgraded (XP input 50 min, reference URLs, expandable cards, BountySubmission model). Subscription upgrade pitches rebuilt for FREE→PRO/ALC and PRO→TEAMS. Achievements dark mode + unlock logic fixed. Reputation API path fixed. Dashboard primary sales cards got dates. Receipt review CTA added.

**S440 Round 2:** Nav reorder (Connect > Hunt Pass > Hunt Exclusives) in all 3 nav locations + avatar dropdown. Removed Inspiration from desktop header. Holds icon: CartIcon bag→Clock, mobile holds icon with holdCount badge. Command Center icon grey in mobile.

**S440 Round 3 (3 parallel agents):** Leaderboard consolidated — `/shopper/leaderboard` redirects to `/leaderboard`, backend uses `guildXp` not `streakPoints`, xpService returns correct shape. Messages dual-role fix — backend returns both organizer AND shopper conversations with roleContext badges, `/organizer/messages` redirects to `/messages`. Missing Connect nav links added (Appraisals, Leaderboard, Achievements) to both mobile sections.

**S440 Schema changes (3 migrations):**
- `20260411_add_reference_url_bounty` — adds referenceUrl to MissingListingBounty
- `20260411_bounty_submissions` — adds xpReward/expiry to MissingListingBounty, creates BountySubmission table
- `20260411_make_unlockedAt_nullable` — UserAchievement.unlockedAt becomes nullable

**S440 Migration required:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**S440 Files changed:**
- `packages/frontend/components/Layout.tsx` — nav: grey icons, Explorer Passport rename, Hunt Exclusives group, league moved
- `packages/frontend/components/AvatarDropdown.tsx` — same nav changes
- `packages/frontend/pages/shopper/explorer-passport.tsx` — title/heading → Explorer Passport
- `packages/frontend/pages/shopper/bounties.tsx` — XP input, referenceUrl field, expandable cards
- `packages/frontend/pages/organizer/subscription.tsx` — dark mode fix, upgrade pitches
- `packages/frontend/components/AchievementBadge.tsx` — dark mode styling
- `packages/frontend/pages/shopper/reputation.tsx` — fixed API path
- `packages/frontend/pages/organizer/dashboard.tsx` — dates on primary sales cards
- `packages/frontend/components/ReceiptCard.tsx` — review CTA
- `packages/backend/src/controllers/bountyController.ts` — xpReward/referenceUrl support
- `packages/backend/src/controllers/receiptController.ts` — organizer data in receipts
- `packages/backend/src/services/achievementService.ts` — unlock logic fix
- `packages/database/prisma/schema.prisma` — referenceUrl + unlockedAt nullable + BountySubmission
- `packages/database/prisma/migrations/20260411_add_reference_url_bounty/migration.sql` — NEW
- `packages/database/prisma/migrations/20260411_bounty_submissions/migration.sql` — NEW
- `packages/database/prisma/migrations/20260411_make_unlockedAt_nullable/migration.sql` — NEW

**S440 Open decision:** Bounties — dollars vs XP-only. Patrick exploring Stripe/legal implications before committing.

---

**S439 COMPLETE (2026-04-11):** 6 live-site issues fixed. Inventory root-cause resolved (447 items backfilled). Shopper bounties model evolved. Market Hubs renamed. Subscription PRO display fixed.

**S439 What shipped:**
- `itemLibraryService.ts` — query uses `OR [organizerId, sale.organizerId]` to catch items missing denormalized field
- `itemController.ts` — new items now get `organizerId` on create + CSV import
- **DB backfill** — 447 existing `Item` rows updated with correct `organizerId` via psycopg2
- `schema.prisma` — `MissingListingBounty.saleId` now optional, added `itemName`/`category`/`maxBudget`/`radiusMiles`
- Migration: `20260411_make_saleId_optional_shopper_bounties/migration.sql`
- `bountyController.ts` — createBounty accepts shopper-first (no saleId); new `getCommunityBounties` endpoint; null guard on `bounty.sale` (TS build fix)
- `bounties.ts` routes — `GET /api/bounties/community` added
- `shopper/bounties.tsx` — posts without saleId, Browse tab fetches /community, cards show itemName/budget/XP/radius
- `Layout.tsx` + `AvatarDropdown.tsx` — "Sale Hubs" → "Market Hubs", Store icon
- `hubs/index.tsx` — heading "Flea Market Events" → "Market Hubs"
- `subscription.tsx` — PRO plan card for manually-seeded users (no Stripe sub object)
- `organizers.ts` — added `subscriptionTier` to `/me` response

**S439 Migration required (shopper bounties):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**S439 Files changed:**
- `packages/backend/src/services/itemLibraryService.ts`
- `packages/backend/src/controllers/itemController.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260411_make_saleId_optional_shopper_bounties/migration.sql` — NEW
- `packages/backend/src/controllers/bountyController.ts`
- `packages/backend/src/routes/bounties.ts`
- `packages/frontend/pages/shopper/bounties.tsx`
- `packages/frontend/components/Layout.tsx`
- `packages/frontend/components/AvatarDropdown.tsx`
- `packages/frontend/pages/organizer/hubs/index.tsx`
- `packages/frontend/pages/organizer/subscription.tsx`
- `packages/backend/src/routes/organizers.ts`

**S439 QA needed:**
- Inventory: any organizer → /organizer/inventory → items visible (not 0)
- Shopper bounties: create bounty → card shows itemName/budget/XP/radius; Browse tab loads from /community
- Market Hubs: nav label + Store icon in desktop, mobile, avatar dropdown
- Subscription: user2 PRO → "Your PRO Plan" card (not support message)

**S438 COMPLETE (2026-04-11):** Patrick's 6-issue review session. Fixed tier-aware platform fees in 5 backend files. Rebuilt hubs page as Flea Market Events. Merged checklist into /plan. Moved bounties out of PRO Tools. Removed appraisal PRO gate, created shopper appraisals page.

**S438 Files changed:**
- `packages/backend/src/routes/organizers.ts` — tier-aware fee calculation in analytics
- `packages/backend/src/controllers/payoutController.ts` — always use tierRate, removed ?? fallback
- `packages/backend/src/controllers/earningsPdfController.ts` — tier-aware fees + businessName select fix
- `packages/backend/src/controllers/posController.ts` — tier-aware fees (2 locations)
- `packages/backend/src/controllers/stripeController.ts` — tier-aware webhook fee calculation
- `packages/backend/src/routes/appraisals.ts` — removed requireTier('PRO') from POST
- `packages/frontend/pages/organizer/hubs/index.tsx` — rebuilt as Flea Market Events page
- `packages/frontend/pages/plan.tsx` — two-tab layout (Checklist + Planning Assistant)
- `packages/frontend/pages/organizer/checklist/index.tsx` — redirect to /plan
- `packages/frontend/components/Layout.tsx` — nav: removed duplicate Item Library, moved bounties out of PRO, added shopper appraisals
- `packages/frontend/components/AvatarDropdown.tsx` — same nav changes
- `packages/frontend/pages/shopper/bounties.tsx` — rebuilt from Coming Soon (has 400 bug, see above)
- `packages/frontend/pages/organizer/inventory.tsx` — redirect to /organizer/item-library (was other direction)
- `packages/frontend/pages/organizer/item-library.tsx` — redirect to /organizer/inventory
- `packages/frontend/pages/organizer/appraisals.tsx` — removed PRO gate on submit
- `packages/frontend/pages/shopper/appraisals.tsx` — NEW: community appraisals page
- `packages/frontend/pages/organizer/bounties.tsx` — fixed implicit any type on .find()

**S438 Push block (already pushed during session):** Fee fixes, nav changes, hubs rebuild, plan tabs, appraisals, bounties type fix, earningsPdfController businessName fix — all pushed. Shopper bounties page pushed but non-functional (400 on submit).

---

**S437 COMPLETE (2026-04-11):** Massive organizer tools session — 6 sale-selector bugs fixed, calendar built, bounty redesign Phase 1 shipped (schema + 6 endpoints + wired frontend), 7 organizer pages improved, typology deprecated and deleted.

**S437 What shipped:**

**Batch 1 — Sale Selector Fix + Calendar:**
- Fixed 6 pages where "Choose a Sale" showed empty even with active sales: promote, send-update, photo-ops, print-kit, checklist, line-queue. Root cause: backend returns flat array `res.json(sales)`, frontend expected `{ sales: Sale[] }` wrapper.
- Built full calendar page (`/organizer/calendar`): monthly grid with color-coded sale events, prev/next/today nav, upcoming sales sidebar, team schedules placeholder. TEAMS tier gated.

**Batch 2 — UI Polish:**
- Subscription toast: suppressed Stripe API error toast when tier available from auth context
- OrganizerSaleCard: dark mode text fix
- Photo-ops station form: removed lat/lng inputs, replaced frame URL with XP teaser card
- Bounty redesign spec: `claude_docs/strategy/bounty-redesign-spec.md` (architect + innovation review)

**Batch 3 — Cross-cutting Fixes:**
- Tier-aware platform fees: new `feeCalculator.ts` — 10% SIMPLE, 8% PRO/TEAMS. Applied to payoutController, stripeController, terminalController. Earnings page shows dynamic fee %.
- Checklist: full dark mode pass + updated default items to match FindA.Sale workflow (Rapidfire upload → AI tags → pricing → publish → process → review earnings)
- Nav cleanup: removed Reviews (merged into Reputation S434), Inventory redirects to item-library
- Appraisals: removed outer TierGate (community feed visible to all), PRO gate on submit only
- Email digest: dark mode pass

**Batch 4 — Bounty Redesign Phase 1:**
- Schema: BountySubmission model with status/expiry/XP fields, indexes, relations to User/Item/MissingListingBounty
- Migration: `20260411_bounty_submissions/migration.sql`
- Backend: 6 new endpoints (browseLocalBounties, submitToBounty, getMySubmissions, reviewSubmission, autoMatchItem, purchaseBounty). Auto-match uses word-overlap at 60% confidence. 2x XP economics (shopper pays 50, organizer earns 25).
- Frontend: Complete bounties.tsx rewrite V4 — tabbed UI (Browse Local / Your Requests / Your Submissions), search + mile range, submission modal, status badges. Fixed premature `</div>` layout bug.

**Final — Typology Deprecation:**
- Commented out typology import + route in `backend/src/index.ts`
- Removed "Typology Classifier" from TierComparisonTable.tsx
- 7 files to delete: typology page, hook, badge, controller, service, routes, test

**S437 Files changed:**
- `packages/frontend/pages/organizer/promote/index.tsx` — sale selector fix
- `packages/frontend/pages/organizer/send-update/index.tsx` — sale selector fix
- `packages/frontend/pages/organizer/photo-ops/index.tsx` — sale selector fix
- `packages/frontend/pages/organizer/print-kit/index.tsx` — sale selector fix
- `packages/frontend/pages/organizer/checklist/index.tsx` — sale selector fix
- `packages/frontend/pages/organizer/line-queue/index.tsx` — sale selector fix
- `packages/frontend/pages/organizer/calendar.tsx` — full calendar (replaced Coming Soon)
- `packages/frontend/pages/organizer/subscription.tsx` — toast fix
- `packages/frontend/components/OrganizerSaleCard.tsx` — dark mode
- `packages/frontend/pages/organizer/photo-ops/[saleId].tsx` — form cleanup + frame teaser
- `packages/frontend/pages/organizer/bounties.tsx` — complete rewrite V4
- `packages/backend/src/utils/feeCalculator.ts` — NEW tier-aware fee utility
- `packages/backend/src/controllers/payoutController.ts` — tier-aware fees
- `packages/backend/src/controllers/stripeController.ts` — tier-aware fees
- `packages/backend/src/controllers/terminalController.ts` — tier-aware fees
- `packages/frontend/pages/organizer/earnings.tsx` — dynamic fee display
- `packages/frontend/components/SaleChecklist.tsx` — dark mode + workflow defaults
- `packages/backend/src/controllers/checklistController.ts` — updated defaults
- `packages/frontend/components/Layout.tsx` — removed Reviews nav, Inventory→item-library
- `packages/frontend/components/AvatarDropdown.tsx` — same nav cleanup
- `packages/frontend/pages/organizer/inventory.tsx` — redirect to item-library
- `packages/frontend/pages/organizer/appraisals.tsx` — TierGate scoped to submit only
- `packages/frontend/pages/organizer/email-digest-preview.tsx` — dark mode
- `packages/database/prisma/schema.prisma` — BountySubmission model + MissingListingBounty fields
- `packages/database/prisma/migrations/20260411_bounty_submissions/migration.sql` — NEW
- `packages/backend/src/controllers/bountyController.ts` — 6 new endpoints
- `packages/backend/src/routes/bounties.ts` — 6 new routes
- `packages/backend/src/index.ts` — commented out typology import/route
- `packages/frontend/components/TierComparisonTable.tsx` — removed Typology Classifier
- `claude_docs/strategy/bounty-redesign-spec.md` — NEW

**S437 Files to DELETE (typology deprecation):**
- `packages/frontend/pages/organizer/typology.tsx`
- `packages/frontend/hooks/useTypology.ts`
- `packages/frontend/components/TypologyBadge.tsx`
- `packages/backend/src/controllers/typologyController.ts`
- `packages/backend/src/services/typologyService.ts`
- `packages/backend/src/routes/typology.ts`
- `packages/backend/src/__tests__/typologyClassifier.integration.ts`

**S437 Migration required:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**S437 QA needed:**
- Sale selector: promote/send-update/photo-ops/print-kit/checklist/line-queue → should list organizer's active sales (not empty)
- Calendar: `/organizer/calendar` → monthly grid with sales shown on correct dates, nav works
- Bounties: Browse tab → search/mile range → bounty cards load. Submit → modal opens → select sale/item → submit. Submissions tab → pending submissions visible
- Platform fees: PRO organizer earnings page shows "8%", SIMPLE shows "10%"
- Appraisals: non-PRO user can see community feed tab; submit form shows PRO gate
- Checklist: dark mode renders clean, default items match workflow

---

**S436 COMPLETE (2026-04-10):** Three placeholder pages replaced with functional implementations. S433/S434/S435 confirmed pushed by Patrick.

**S436 What shipped:**
1. **earnings.tsx** — Full earnings dashboard: lifetime gross/fees/net summary cards, per-sale breakdown table with sortable revenue data, year selector, PDF export button. Uses `/api/organizers/me/analytics`. 51-line stub → 350-line functional page.
2. **qr-codes.tsx** — QR Scan Analytics (#186): total scans lifetime, active sale scans, per-sale breakdown table sorted by scan count descending, 3-step explainer. Backend updated: `qrScanCount` added to `/api/organizers/me/sales` response. 51-line stub → analytics dashboard.
3. **staff.tsx** — Team management page: TEAMS tier gate + upgrade wall, workspace creation flow for first-time TEAMS users, member list with roles/dates, invite by email with role selector, remove member with confirmation. Uses existing workspace API endpoints.

**S436 Architect audit result:** Double-close cron issue was already resolved in a prior session. Cron audit cleared.

**S436 Files changed:**
- `packages/frontend/pages/organizer/earnings.tsx`
- `packages/frontend/pages/organizer/qr-codes.tsx`
- `packages/frontend/pages/organizer/staff.tsx`
- `packages/frontend/pages/organizer/typology.tsx` — fixed 202 response handling
- `packages/frontend/pages/plan.tsx` — fixed scroll-to-middle bug
- `packages/backend/src/routes/organizers.ts` — added qrScanCount to /me/sales SELECT
- `packages/backend/src/routes/lines.ts` — added requireTier('SIMPLE') to 6 Line Queue routes
- `packages/frontend/components/BountyModal.tsx` — dark mode
- `packages/frontend/pages/organizer/bounties.tsx` — cancel button, dark mode, invalidation
- `packages/backend/src/controllers/bountyController.ts` — shopper notification on fulfill
- `packages/frontend/components/Layout.tsx` — "Price Tags"→"QR Analytics", hubs href fixed
- `packages/frontend/components/AvatarDropdown.tsx` — same nav fixes
- `claude_docs/architecture/ADR-014-hubs-flea-market-repurpose.md` — NEW
- `claude_docs/research/flea-market-software-competitive-analysis.md` — NEW
- `claude_docs/decisions-log.md` — S436 Hubs decisions appended
- `claude_docs/strategy/roadmap.md` — #40 and #238 updated

**S436 Verified:**
- S435 all 5 fixes CONFIRMED in code (Layout mobile nav, offline.tsx, AvatarDropdown, auctionJob, auctionAutoCloseCron)
- item-library already functional (no TierGate, real API call) — no changes needed

**S436 Bounties (#197) — SHIPPED:**
Full end-to-end: organizer cancel button (DELETE /api/bounties/:id + React Query invalidation + loading state), dark mode throughout BountyModal + bounties.tsx, shopper notification on fulfillment (type BOUNTY_FULFILLED, "Good news!", link to /items/{itemId}).

**S436 Hubs → Flea Market Events — DECISION LOCKED:**
- Repurposed Sale Hubs as Flea Market Events (ADR-014). SaleHubMembership → VendorBooth.
- 4 locked decisions: TEAMS tier only, all 4 hubTypes (FLEA_MARKET, ANTIQUE_MALL, POPUP_MARKET, FARMERS_MARKET), unlimited booths, organizer-choice payout (flat booth fee / revenue share / hybrid).
- Nav: "Price Tags" → "QR Analytics", /organizer/sale-hubs → /organizer/hubs (removed "(Soon)" + disabled styling)
- Research doc: `claude_docs/research/flea-market-software-competitive-analysis.md` — key finding: no competitor has shopper app; QR auto-settlement is the differentiator
- ADR-014: `claude_docs/architecture/ADR-014-hubs-flea-market-repurpose.md`
- Roadmap: #40 → "Repurposed S436 — Flea Market Events (TEAMS)", #238 → "Folded into #40 S436"

**S436 QA needed:**
- Earnings page: `/organizer/earnings` → verify summary cards show real revenue data, per-sale table renders, PDF export downloads
- QR Analytics: `/organizer/qr-codes` → verify scan totals load, per-sale table shows qrScanCount, empty state works
- Staff page: `/organizer/staff` → TEAMS user: workspace creation → invite member → member appears in list → remove works. Non-TEAMS: upgrade wall shows.

**S435 COMPLETE (2026-04-10):** S434 audit completed, nav parity fixed, Hunt Pass section corrected. All S433/S434 commits are local and ready to push.

**S435 What was audited and fixed:**
1. **S434 audit** — Read all 14 changed files. 5 bugs found and fixed:
   - `Layout.tsx` mobile nav: Typology was still in mobile "Pro Tools" (removed)
   - `offline.tsx`: Stale comment "TierGate handles PRO access check" removed
   - `AvatarDropdown.tsx`: S434 never updated this file — 3 fixes applied (Add Items href → `/organizer/sales`, Command Center → TEAMS section, Typology removed)
   - `auctionJob.ts`: `auctionClosed: true` not set in bid-won path (fixed)
   - `auctionAutoCloseCron.ts`: Circular import `'../index'` → `'../lib/prisma'` (fixed)
2. **S433 cron audit** — 3 cron files confirmed safe: different query predicates, complementary responsibilities, no double-processing
3. **Full nav parity audit** — Systematic comparison of AvatarDropdown.tsx vs Layout.tsx:
   - Organizer: Messages + Inventory missing from AvatarDropdown (added), Flip Report + Appraisals wrongly PRO-gated (ungated), Sale Hubs href wrong `/organizer/hubs` → `/organizer/sale-hubs`
   - Shopper: AvatarDropdown "Explore & Connect" split into 3 proper sections (Explore / Hunt Pass / Connect) matching Layout.tsx
   - Hunt Pass: Lucky Roll moved from Hunt Pass → Explore (it's a free XP mechanic, not HP exclusive) in both desktop + mobile
   - Mobile bugs fixed: mobile Hunt Pass sections were using wrong state vars (`mobileCartOpen` and `mobileDevToolsOpen`) — replaced with `mobileHuntPassOpen` and `mobileDualRoleHuntPassOpen`
   - TS check: zero errors
4. **Original S434 prompt review** — Confirmed what was NOT done by S434: placeholder pages (promote, send-update, photo-ops, qr-codes, print-kit, checklist, earnings, line-queue, calendar, staff), functional issues with item-library and typology, offline sync awareness, bounties game design check, Line Queue gating. These are separate workloads.

**S435 Files changed (uncommitted — include in push):**
- `packages/frontend/components/AvatarDropdown.tsx`
- `packages/frontend/components/Layout.tsx`

**S435 Next session:**
- Push S433 + S434 + S435 commits using `.\push.ps1`
- S433 migration must run first (see below)
- Chrome QA all S434 pages after deploy
- Remaining S434 original prompt work: placeholder pages, functional bugs

---

**S433 COMPLETE (2026-04-10):** Full auction overhaul — Phase 1 P0 fixes + Phase 2 professional features. ADR-013 written. Migration required for Phase 2.

**S433 Phase 1 (No migration — ships now):**
- `itemController.ts` — Reserve price enforcement in `placeBid` (bids below reserve rejected with clear error + reserve amount in response). Auto-close lazy fetch in `getItemById` (sets `auctionClosed: true` when `auctionEndTime` past). Outbid notifications to displaced WINNING bidder after new bid created.
- `items/[id].tsx` — Reserve-met badge: "✓ Reserve met" (green) / "Reserve: $X.XX (not met)" (amber). Added `auctionReservePrice` and `auctionClosed` to Item interface.
- `BidModal.tsx` — `auctionClosed` prop added. Submit button disables with "Auction Closed" text when true.

**S433 Phase 2 (Migration required — MaxBidByUser table):**
- `schema.prisma` — MaxBidByUser model added with `@@unique([itemId, userId])`. Relations added to Item + User.
- Migration: `packages/database/prisma/migrations/20260410_add_max_bid_by_user/migration.sql` — NEW
- `shared/src/utils/bidIncrement.ts` — eBay-style tiered bid increment function (NEW)
- `itemController.ts` — `placeBid` rewritten for proxy bidding: user submits maxBidAmount, system auto-bids against competing maxes, calculates actual bid via `calculateBidIncrement()`, marks previous WINNING bids as OUTBID. Soft-close: bid in final 5 min → auction extended 5 min → `auctionExtended` socket emitted. `getBids` anonymized: shoppers see "Bidder 1/2/3", organizers see real names. `getItemById` computes `auctionStatus` (ACTIVE/ENDING_SOON/ENDED).
- `BidHistory.tsx` — New component: anonymized bid log with WINNING badge (NEW)
- `items/[id].tsx` — BidHistory wired in, `auctionExtended` socket listener, auction status badge rendered
- `jobs/auctionAutoCloseCron.ts` — 5-min cron: closes expired auctions, notifies winner + organizer (NEW)
- `index.ts` — Cron scheduled at startup

**S433 eBay categories finding:** Already working. EbayCategoryPicker exists in edit-item form. Export/push use `ebayCategoryMap.ts` runtime mapping. No schema fields needed. No additional UI work required.

**S433 ADR:** `claude_docs/architecture/ADR-013-auction-overhaul.md` — NEW

**S433 Files changed:**
- `packages/backend/src/controllers/itemController.ts`
- `packages/frontend/pages/items/[id].tsx`
- `packages/frontend/components/BidModal.tsx`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260410_add_max_bid_by_user/migration.sql` — NEW
- `packages/shared/src/utils/bidIncrement.ts` — NEW
- `packages/frontend/components/BidHistory.tsx` — NEW
- `packages/backend/src/jobs/auctionAutoCloseCron.ts` — NEW
- `packages/backend/src/index.ts`
- `claude_docs/architecture/ADR-013-auction-overhaul.md` — NEW

**S433 Migration required (run before pushing):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**S433 QA needed:**
- Phase 1: Place bid below reserve → rejected with error + reserve amount shown. Reserve badge renders correctly (amber → green as bids climb). Outbid notification fires to displaced bidder. Auction past deadline → auto-closes on next page load (no bid accepted).
- Phase 2: Set max bid $200 → system places actual bid. Competitor bids up → auto-counter. Bid in last 5 min → countdown extends 5 min + toast. Bid history shows Bidder 1/2/3 (not real names). Status badge: green ACTIVE → orange ENDING SOON → gray ENDED. Cron runs every 5 min (check Railway logs).

**⚠️ Auction cron audit needed (flagged 2026-04-10 friction audit):** Three auction job files now exist: `auctionCloseCron.ts` (deprecated stub S415), `auctionJob.ts` (declared authoritative S415), and `auctionAutoCloseCron.ts` (new from S433). Unclear if both `auctionJob.ts` and `auctionAutoCloseCron.ts` are wired in `index.ts` — could cause double-close on same auction. Dispatch `findasale-architect` to verify before next production deploy.

---

**S432 COMPLETE (2026-04-10):** eBay OAuth bug fixes + Stripe Connect status display + auction listing type display (3 layers).

**S432 Fixes:**
- `organizers.ts` — Added `stripeConnected: !!(organizer as any).stripeConnectId` to `/organizers/me` response.
- `settings.tsx` — Added `stripeConnected` state, set from `/organizers/me`. Payments tab now shows "Stripe Connected ✓" + "Manage Payouts" for connected organizers; unconnected still see "Setup Stripe Connect". eBay OAuth fixed: removed `/api/` double prefix from all 3 eBay calls; changed from axios-following `res.redirect()` to `res.json({ redirectUrl })` + `window.location.href`. Public eBay callback route un-gated from JWT middleware.
- `saleController.ts` — `getSale` now includes `listingType`, `auctionReservePrice`, `auctionClosed` in items select (were missing, causing auction items to render as fixed-price).
- `sales/[id].tsx` — Auction UI conditions updated to check `item.listingType === 'AUCTION'` in addition to `sale.isAuctionSale`. `listingType` added to Item interface.
- `add-items/[saleId].tsx` — Auction fields added (Starting Bid, Reserve Price, Auction End Time) when listing type is AUCTION. End time defaults to 8 PM night before sale start. Auction field name mapping fixed (form `startingBid` → API `auctionStartPrice`, etc.).
- `itemController.ts` — `getItemById` and `getItemsBySaleId` now include `auctionClosed` in select.
- `items/[id].tsx` — `isAuction` now checks `item.listingType === 'AUCTION'` in addition to `item.auctionStartPrice`. Fixes auction item detail page showing fixed-price UI.

**S432 Files changed:**
- `packages/frontend/pages/organizer/settings.tsx`
- `packages/backend/src/routes/organizers.ts`
- `packages/frontend/pages/sales/[id].tsx`
- `packages/frontend/pages/organizer/add-items/[saleId].tsx`
- `packages/backend/src/controllers/saleController.ts`
- `packages/backend/src/controllers/itemController.ts`
- `packages/frontend/pages/items/[id].tsx`

**S432 QA needed:**
- eBay OAuth: settings → eBay tab → Connect → eBay sign in → redirects back with success toast, connection status shows
- Stripe: connected organizer → settings Payments tab → shows "Stripe Connected ✓" + Manage Payouts (not Setup button)
- Auction item card: auction item on sale page shows bid UI, not Buy Now/Cart
- Auction item detail: `/items/[id]` for auction item shows bid UI, not fixed-price
- Auction create: add-items form → set listing type AUCTION → auction fields appear, end time defaults to 8 PM night before sale

---

**S431 COMPLETE (2026-04-09):** Treasure Trails map activation mode + 3 trail URL bugs fixed + XP purchase rate bug fixed.

**S431 Fixes:**
- `map.tsx` — `activeTrail` state + dismissal bar (trail name, "View Details →" link, ✕ close). Passes `activeTrail`/`setActiveTrail` props to SaleMap.
- `SaleMap.tsx` — `ActiveTrail` interface + optional props passthrough.
- `SaleMapInner.tsx` — `handleViewTrail(shareToken)`: fetches trail on click, sets `activeTrail`. CircleMarker rendering for stops (amber #F59E0B, radius 12). Fixed double `/api/` prefix bug: `api.get('/trails/${shareToken}')`.
- `trailController.ts` — `getTrail`: shareToken fallback lookup after ID lookup returns null. Fixes "Trail Not Found" on detail page.
- `useTrails.ts` — `usePublicTrail`: was calling `/trails/public/${shareToken}` (nonexistent route) → fixed to `/trails/${shareToken}`.
- `stripeController.ts` — P0 XP bug: `PURCHASE_COMPLETED` was awarding flat 1 XP regardless of amount. Fixed both POS path (`Math.floor(totalAmountCents/100 * XP_AWARDS.PURCHASE)`) and webhook path (`Math.floor(Number(purchase.amount) * XP_AWARDS.PURCHASE)`). Min 1 XP enforced.
- Test trail + 3 stops inserted into Railway DB directly via psycopg2 for testing.

**S431 Files changed:**
- `packages/frontend/pages/map.tsx`
- `packages/frontend/components/SaleMap.tsx`
- `packages/frontend/components/SaleMapInner.tsx`
- `packages/frontend/hooks/useTrails.ts`
- `packages/backend/src/controllers/trailController.ts`
- `packages/backend/src/controllers/stripeController.ts`

**S431 QA needed:**
- Trail activation: open map → click sale with trail → "View Treasure Trail →" button → trail stops appear as amber circles
- Trail dismissal: ✕ button removes stops from map
- Trail detail page: `/trail/[shareToken]` should now load (useTrails.ts fix deployed)
- XP: complete a purchase → check `PointsTransaction` for `Math.floor(amount)` XP, not flat 1

---

**S430 COMPLETE (2026-04-09):** Sale page layout cleanup, email spam fixes, iOS geo UX, organizer photo upload, label redesign, print label auth fix, activity dedup, auction Buy Now gate.

**S430 Fixes:**
- `emailTemplateService.ts` — removed literal `[UNSUBSCRIBE_URL]` placeholder from footer (spam trigger). Replaced with transactional email disclosure.
- `buyingPoolController.ts`, `collectorPassportService.ts` — unified sender from `findasale.com` (unverified) → `finda.sale` (verified in Resend).
- `posController.ts` — subject `"Payment link: $X"` → `"Your checkout is ready — $X"` (phishing trigger removed).
- `next.config.js` — added `api.qrserver.com` to `images.domains` (QR codes were silently blocked by Next.js image loader).
- `map.tsx` — Permissions API query-first pattern + two-phase accuracy + iOS-specific PERMISSION_DENIED messages.
- `index.tsx` — homepage auto-locates only when permission already `'granted'` (prevents iOS Safari false PERMISSION_DENIED).
- `sales/[id].tsx` — Removed broken duplicate LocationMap. Removed standalone HypeMeter card (moved inline above LiveFeedTicker). Removed ActivityFeed at bottom (duplicate). Removed SocialProofBadge ("Sale Activity" pill). Removed second Organized By card; moved "Plan My Route in Maps" button into Location card. Auction Buy Now gate hardened: `!sale.isAuctionSale && !item.auctionStartPrice`.
- `PickupBookingCard.tsx` — full dark mode. Internal post-purchase gate (only shows if user has a hold at sale).
- `sales/[id].tsx` — PickupBookingCard removed from sale page entirely.
- `checkout-success.tsx` — PickupBookingCard added to receipt page with haversine GPS gate: hidden if buyer is within 300m of sale (they're already there).
- `userController.ts` — `getPurchases` now includes `sale.lat`, `sale.lng`, `sale.id`, `sale.address` etc. for GPS check.
- `sales/[id].tsx` — Organizer photo management: "+ Add Photos" button in gallery (max 6), × remove on thumbnail hover, `handlePhotoUpload` (Cloudinary via existing `/upload/sale-photos`), `handleRemovePhoto`, file size validation.
- `edit-item/[id].tsx` — Print Label button fixed: was `window.open(url)` → now `api.get(responseType: 'blob')` + blob URL. Bearer token now sent correctly.
- `labelController.ts` — Label redesign: two-column layout (text left, QR right), QR 72×72 vertically centred, content block centred in label, removed `moveDown(0.5)` that caused blank second page, border 1pt inset from page edge.

**S430 Files changed:**
- `packages/backend/src/controllers/buyingPoolController.ts`
- `packages/backend/src/controllers/posController.ts`
- `packages/backend/src/controllers/userController.ts`
- `packages/backend/src/controllers/labelController.ts`
- `packages/backend/src/services/collectorPassportService.ts`
- `packages/backend/src/services/emailTemplateService.ts`
- `packages/frontend/components/PickupBookingCard.tsx`
- `packages/frontend/next.config.js`
- `packages/frontend/pages/index.tsx`
- `packages/frontend/pages/map.tsx`
- `packages/frontend/pages/sales/[id].tsx`
- `packages/frontend/pages/shopper/checkout-success.tsx`
- `packages/frontend/pages/organizer/edit-item/[id].tsx`

**S430 QA needed:**
- Email: send a payment link / invite email to Yahoo address → confirm not spam
- QR code on sale page: confirm QR image renders (not broken image)
- iOS map page: test geolocation → two-phase accuracy, correct error message if denied
- Sale page: confirm only 2 live activity elements (HypeMeter pill + LiveFeedTicker card)
- Sale page: auction items → confirm no "Buy Now" button
- Receipt page: organizer pickup slots only shown when buyer not at sale (GPS gate)
- Print label: open from edit-item page → PDF opens with no second blank page, content centred
- Photo upload: organizer adds photo from sale page → appears in gallery, capped at 6

---

**S429 COMPLETE (2026-04-09):** POS socket 502 fixes, payment intent fee bug, Stripe Connect invalid account, expired hold blocking, IDB crash fix, Request Cart Share feature. No migration required.

**S429 Fixes:**
- `PosPaymentRequestAlert.tsx`, `pos.tsx` — last two sockets still using polling → `transports: ['websocket'], upgrade: false`. Eliminates Railway 502s on those connections.
- `posPaymentController.ts` — `application_fee_amount` was 10% of the **total** on a PaymentIntent for card amount only (split payment). Changed to 10% of card portion. Was likely causing Stripe rejection on split payments.
- `pos.tsx` — surfaces actual Stripe error text (`err.response.data.error`) in errorMessage state so Patrick can diagnose Stripe rejections without reading logs.
- `stripeController.ts` — `createConnectAccount`: when `stripeConnectId` is a fake/seeded value (e.g. `acct_test_user3`), Stripe rejects login link. Was rethrowing. Now: detect invalid account error → clear `stripeConnectId` to null → fall through to create a real account. Settings → Setup Stripe Connect now works.
- `reservationController.ts` — `placeHold`: when item is RESERVED but the active reservation is past `expiresAt`, inline-expire it and allow the new hold. Cron runs every 10 min — users were blocked for up to 10 min after a hold expired.
- `offlineSync.ts` — add `onclose`/`onversionchange` handlers to clear stale `dbInstance` singleton. Add try/catch around `db.transaction()` in `getAllFromStore`. Fixes `InvalidStateError: The database connection is closing`.
- `posController.ts` — `sendPaymentLinkEmail`: new endpoint sends Stripe payment link URL via Resend to `buyerEmail`.
- `posController.ts` — `requestCartShare`: emits `CART_SHARE_REQUEST` socket event to shopper's device + creates in-app notification fallback. Confirmed working by Patrick.
- `pos.tsx` — "📲 Request Cart from Shopper" button in invoice panel. Polls 4s after request for cart.
- `PosPaymentQr.tsx` — mailto link replaced with real Resend email button (loading/sent states).
- `Layout.tsx` — `CART_SHARE_REQUEST` socket listener: if shopper has matching cart → auto-posts POSSession; otherwise shows actionable toast.
- `usePOSPaymentRequest.ts`, `useSaleStatus.ts`, `useLiveFeed.ts` — websocket-only transport (done earlier in S428/S429 context).

**S429 Files changed:**
- `packages/frontend/components/PosPaymentRequestAlert.tsx`
- `packages/frontend/pages/organizer/pos.tsx`
- `packages/backend/src/controllers/posPaymentController.ts`
- `packages/backend/src/controllers/stripeController.ts`
- `packages/backend/src/controllers/reservationController.ts`
- `packages/backend/src/controllers/posController.ts`
- `packages/backend/src/routes/pos.ts`
- `packages/frontend/components/PosPaymentQr.tsx`
- `packages/frontend/components/Layout.tsx`
- `packages/frontend/hooks/usePOSPaymentRequest.ts`
- `packages/frontend/hooks/useSaleStatus.ts`
- `packages/frontend/hooks/useLiveFeed.ts`
- `packages/frontend/lib/offlineSync.ts`

**S429 QA needed:**
- Socket 502: POS page → no 502 errors in Railway logs on WebSocket connections
- Split payment Send to Phone: $597.96 total, $250 cash, $347.96 card → should create PaymentIntent successfully
- Settings → Payments → Setup Stripe Connect: should redirect to real Stripe onboarding (not 500)
- Expired hold → user can immediately place new hold (no 10-min wait)
- Request Cart Share: organizer taps button → shopper gets notification → cart auto-appears in POS ✅ confirmed

---

**S428 COMPLETE (2026-04-09):** 4 POS bug fixes — no migration required.

**S428 Fixes:**
- `pos.tsx` — Invoice preview filter: `item.id !== hold.itemId` → `item.itemId !== hold.itemId` (5 occurrences). Root cause: `cartItem.id` is a generated UUID, not the DB item ID. `cartItem.itemId` is the actual Prisma item ID. Same bug fixed in `miscItems` prop to PosInvoiceModal. "📌 On Hold" badge in cart list also fixed.
- `pos.tsx` — `handleLoadHold`: now auto-merges shopper's open linked cart (from `linkedCarts` state) when loading a hold. Adds all shared cart items to POS cart. Toast shows item count.
- `pos.tsx` — Dark mode loaded hold card: `dark:bg-sage-900/20` → `dark:bg-gray-600` (20% opacity was too transparent against parent).
- `posController.ts` — `createPaymentLink` items check: removed `status: 'AVAILABLE'` filter and strict count check. Items may be mid-sale when QR is generated; `amount` is passed explicitly from frontend so the check was blocking QR generation unnecessarily.

**S428 Files changed:**
- `packages/frontend/pages/organizer/pos.tsx`
- `packages/backend/src/controllers/posController.ts`

**S428 QA needed:**
- Invoice preview: Load hold → add misc items → Send Invoice → verify hold item NOT duplicated in preview
- Load Hold: shopper with shared cart → Load Hold → cart should contain hold item + all shared cart items
- Dark mode: load a hold → invoice panel hold card should have dark gray background
- QR code: generate QR for cart with inventory items → 200 (not 400), shopper scans → no AccessDenied

---

## Next Session Priority

### Immediate (S443) — Shopper Page Strategic UX Exploration

**Mode: EXPLORE (same pattern as S441-organizer team collab ecosystem)**

Patrick wants strategic UX/innovation thinking applied to 4 interconnected shopper pages that need cohesive design, possible merges, and name/nav cleanup. Same approach as the Staff/Workspace/Command Center ecosystem design: UX spec first, then innovation ideas, then Patrick approves, then parallel dev dispatch.

**Pages to evaluate (read all 4 current implementations first):**

1. **`/shopper/loyalty`** — Needs work. Patrick asks: combine with shopper dashboard? Nav/header names need changing at minimum.

2. **`/shopper/dashboard`** — Still needs work. Patrick asks: combine with similar pages?

3. **`/shopper/explorer-passport`** — Needs work. Patrick asks: combine with shopper dashboard?

4. **`/shopper/hunt-pass`** — Patrick thinks this should split into 2 pages: (a) Hunt Pass upsell/purchase page, and (b) How to Earn XP / How to Spend XP guide. Whether 1 or 2 pages, it needs cohesiveness with the others.

**Key questions the exploration must answer:**
- Which pages merge? Which stay separate? Which split?
- What should each page be called in nav? (Current names may not match content)
- How do these pages relate to each other in the shopper journey?
- What's the information architecture? (Where does a shopper go to see XP? Rank? Rewards? Progress?)
- What innovations from the idea bank apply here?

**Approach:**
1. Dispatch `findasale-ux` with all 4 page paths — get UX spec for the shopper engagement ecosystem
2. Dispatch `findasale-innovation` — brainstorm ideas for shopper engagement/gamification pages
3. Present Patrick with combined findings + recommendations
4. After Patrick approves: parallel dev dispatch (same Phase pattern as team collab)

**Pre-read for next session:**
- `packages/frontend/pages/shopper/loyalty.tsx`
- `packages/frontend/pages/shopper/dashboard.tsx`
- `packages/frontend/pages/shopper/explorer-passport.tsx`
- `packages/frontend/pages/shopper/hunt-pass.tsx`
- `packages/frontend/components/Layout.tsx` (nav structure for shopper sections)

### Team Collab Phases Remaining
- **Phase 2 status:** Code pushed, Railway rebuild pending (cache bust + schema fix in S442 push block). Migration needed.
- **Phase 3:** Workspace View internal collaboration hub (live sales board, per-sale chat, task distribution, team leaderboard) + WebSocket integration
- **Phase 4:** Smart tasks + leaderboard
- **Phase 5:** Analytics + Command Center alerts + polish

### Deferred
- hunt-pass.tsx 3 missing XP sink rows (Custom Map Pin 75 XP, Profile Showcase Slot 50/150 XP, Treasure Trail Sponsor 100 XP)
- Bounty redesign Phase 2: auto-match on publish, shopper notifications, expiry cron
- Flea Market Events full implementation (ADR-014 locked, schema ready)
- Stripe Connect webhook config (items not marking SOLD after POS card payment — see Standing Notes)
- Bounties dollars vs XP: open decision (Stripe/legal)

**⏸️ QA QUEUE — postponed:**
- S436: earnings/qr-codes/staff pages
- S430: Yahoo spam test, iOS geolocation, sale page activity dedup, print label, photo upload
- S431: Trail detail page, trail stops on map
- S427: Full invoice flow, cart-only invoice
- S433: Auction reserve/proxy/soft-close/bid history/cron

---

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|----------------|---------------|
| #143 PreviewModal onError | Code fix pushed (sha: ffa4a83). 📷 fallback on Cloudinary 503 in place. | Defensive fix only — can't trigger 503 in prod. ACCEPTABLE UNVERIFIED. | S312 |
| #143 AI confidence — Camera mode | cloudAIService.ts fix is code-correct; processRapidDraft passes aiConfidence through. Can't test without real camera hardware in Chrome MCP. | Real device camera capture → Review & Publish → confirm "Good (X%)" or similar. | S314 |
| Single-item publish fix | S326 code fix deployed. S327 confirmed API call fires but no DRAFT items exist to test the button. Manual Entry creates AVAILABLE items, skipping draft pipeline. | Camera-capture an item → go to Review & Publish → click Publish on single item → confirm status changes + toast. | S326/S327 |
| ValuationWidget (S406) | No draft items in user2's sales (all 11 are Live). TEAMS tier required. | TEAMS organizer with draft item → Review page → confirm ValuationWidget renders with auth fix + dark mode. | S406 |
| Treasure Trails check-in (S404) | No trail data in DB (test trail inserted S431 via psycopg2). | Organizer creates a trail → shopper navigates to /trails/[id] → checks in at a stop → confirm XP awarded. | S406 |
| Review card redesign (S399) | No draft items for any test organizer. | Camera-capture an item → go to Review page → confirm new card redesign (Ready/Needs Review/Cannot Publish) renders. | S406 |
| Camera thumbnail refresh (S400/S401) | Requires real camera hardware in Chrome MCP. | Capture photo in rapidfire → confirm thumbnail strip updates live without page reload. | S406 |
| POS camera/QR scan (S405) | Camera hardware required for scan flow. | Organizer opens POS → taps QR tile → camera opens → scan item sticker → confirm added to cart. | S406 |

---

## Standing Notes

- Railway backend: https://backend-production-153c9.up.railway.app
- Vercel frontend: https://finda.sale
- Test accounts: user1 (TEAMS), user2 (organizer SIMPLE), user3 Carol Williams (TEAMS), user11 Karen Anderson (shopper, Hunt Pass active), user12 Leo Thomas (shopper). All passwords: password123
- eBay: production credentials live in Railway. Browse API confirmed returning real listings.
- POS test: Organizer must have Stripe Connect account configured; shopper must be linked via QR scan first
- DB: Railway PostgreSQL (`maglev.proxy.rlwy.net:13949/railway`) — see CLAUDE.md §6 for migration commands
- Backend route mounts: `app.use('/api/organizers', organizerRoutes)`, `app.use('/api/sales', saleRoutes)`, `app.use('/api/trails', trailRoutes)`, `app.use('/api/boosts', boostsRouter)`, `app.use('/api/lucky-roll', luckyRollRouter)`
- **Stripe Connect webhook (P2 — unresolved since S421):** Configure in Stripe Dashboard → Events on Connected accounts → `payment_intent.succeeded` → URL: `https://backend-production-153c9.up.railway.app/api/webhooks/stripe` → copy secret → Railway env `STRIPE_CONNECT_WEBHOOK_SECRET`. Without this, items aren't marked SOLD after POS card payment.
- **STATE.md compacted 2026-04-10:** Sessions S427 and older archived to `COMPLETED_PHASES.md` by daily-friction-audit. ~2,300 lines removed.
