# Patrick's Dashboard — Week of April 18, 2026

## S502 Summary (2026-04-18) — Label Sheet Composer: build + 3 bug fixes

**7 files changed. 1 push block.**

### Push block — S502:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add packages/backend/src/constants/cheatsheet.ts
git add packages/backend/src/controllers/labelComposerController.ts
git add packages/backend/src/routes/organizers.ts
git add packages/backend/src/controllers/printKitController.ts
git add "packages/frontend/pages/organizer/label-composer/[saleId].tsx"
git add "packages/frontend/pages/organizer/print-kit/[saleId].tsx"
git add "packages/frontend/pages/organizer/add-items/[saleId]/review.tsx"
git commit -m "feat: label sheet composer + fix PDF auth, export download, saved batch recall"
.\push.ps1
```

### What was done this session:

**Label Sheet Composer built** — Full single-page tool at `/organizer/label-composer/[saleId]`. Pick from 30 cheat-sheet prices or search your catalog. Set quantities, see a live Avery 5160 sheet preview with color-coded price bands. Drag to reorder. Fill leftover cells. Backend generates real PDFs with QR codes.

**3 bugs fixed after your testing:**
1. Print/Export PDF was failing with "Authentication required" — `window.open()` can't send auth headers. Replaced with authenticated blob fetch.
2. Export PDF now triggers an actual file download instead of opening in a new tab.
3. Saved batches now have a recall UI — collapsible section below the action bar shows all saved presets with Load and Delete buttons.

**CTA links** — Label Composer linked from print-kit page (amber card) and the review page ("Print labels for N priced items").

### Next session — S503: QR code sizing consistency

You flagged that QR codes are different sizes between interactive codes, full-page print, and label PDFs. Next session will audit all QR generation across `printKitController.ts`, `labelComposerController.ts`, and the print-kit frontend, then standardize sizes so they all match.

---

## S500 Summary (2026-04-18) — XP economy rebalance: commercial hierarchy enforced, backend fully wired

**8 files changed. 1 push block.**

### Push block — S500:

```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add packages/backend/src/services/xpService.ts
git add packages/backend/src/jobs/auctionJob.ts
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/services/appraisalService.ts
git add packages/backend/src/controllers/haulPostController.ts
git add packages/backend/src/services/challengeService.ts
git add packages/frontend/pages/shopper/hunt-pass.tsx
git add claude_docs/feature-notes/gamedesign-decisions-2026-04-18.md
git commit -m "XP rebalance: commercial hierarchy enforcement + haul/challenge wiring — D-XP-015 through D-XP-018"
.\push.ps1
```

### What was done this session:

**Commercial hierarchy rule established** — Purchase (10 XP) is the per-action anchor. Every non-commercial action must sit below it. Haul posts are post-purchase documentation (additive, not competing). Appraisals are a paid service (selected responses stay at 20 XP — they're rewarding real expertise).

**Critical bugs fixed in backend:**
- REFERRAL_FIRST_PURCHASE was 30 XP — should be 500 XP (locked D-XP-004, 16× underpayment — fixed)
- Purchase XP was per-dollar (1 × amount) — should be flat 10 XP per transaction (D-XP-004 — fixed in both Stripe webhook and POS handler)
- Auction value bonus removed — flat 20 XP only (D-XP-009 — fixed)

**New things wired for the first time:**
- Haul post XP: was never awarded anywhere. Now awards 15 XP on post creation, capped at 4/month (D-XP-008)
- Challenge completion XP: was never awarded. Now awards XP based on difficulty (EASY=25, MEDIUM=50, HARD=100, MICRO_EVENT=10) when a seasonal challenge badge is earned

**XP rates corrected (decisions D-XP-015 through D-XP-018):**
- QR clue scan: 12 → 3 XP (was beating a purchase)
- Completion bonus: 30 → 15 XP
- Haul post: 25 → 15 XP (post-purchase bonus, not a competing earn path)
- Social share: 10 → 5 XP (honor system, low-verification action)
- Appraisal selected: stays 20 XP (people pay real money for appraisals — reward the work)

### Next session — S501: Photo station + treasure hunt 3-clue limit

- Treasure hunt clue cap: 10 → 3 per sale (update `treasureHuntQRController.ts`)
- Photo station shopper page: `pages/sales/[id]/photo-station.tsx`
- Photo station backend endpoint: `POST /api/sales/:saleId/photo-station/scan`
- Update print kit QR URL to point to photo station page

---

## S499 Summary (2026-04-18) — Progress tracker: links fixed, Pre-Sale rename, checkbox fix, print kit QR sections

**7 files changed. 1 push block.**

### Push block — S499 (includes S498 carry-forward if not already pushed):

```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add packages/backend/src/controllers/checklistController.ts
git add "packages/frontend/pages/organizer/plan/[saleId].tsx"
git add "packages/frontend/pages/organizer/print-kit/[saleId].tsx"
git add packages/frontend/components/SaleProgressWidget.tsx
git add packages/frontend/pages/plan.tsx
git add packages/frontend/pages/organizer/dashboard.tsx
git add packages/frontend/components/Layout.tsx
git commit -m "feat: progress tracker links, Pre-Sale rename, checkbox fix, print kit QR sections (queue/clues/photo-station)"
.\push.ps1
```

*(If you already pushed S498, the plan.tsx/dashboard.tsx/Layout.tsx lines above may be clean — git add will skip unchanged files.)*

### What was done this session:

**Progress tracker task links** — Audited every task in the 6-stage checklist. All 29 tasks now link to the right page. Previously many linked to `/organizer/inventory` incorrectly. Key corrections: Rapidfire/tags/pricing → Add Items page, price tags/signs/QR codes → Print Kit, POS → POS page, social sharing → Promote page, QR scan activity → QR Codes page, virtual queue → Line Queue, flip report → Flip Report, settlement → Settlement Wizard.

**"Ready to Publish" renamed "Pre-Sale"** — Stage 3 is now called Pre-Sale throughout the backend and frontend (checklist controller, stage timeline, stage cards).

**QR codes at photo stations moved to Pre-Sale** — The photo station QR task is now in the Pre-Sale stage where it belongs, linked to the Print Kit.

**Checkbox rendering fixed** — Many tasks had a link label but no way to check them off. Fixed: every non-auto task now always shows a checkbox alongside its label. Click the checkbox to toggle completion, click the label to navigate to that feature.

**Checkbox saves now stick** — Checking a task fired a success toast but the box immediately unchecked itself. Root cause: after saving, the app was re-fetching checklist data from the server, and the server was briefly returning the old state. Fixed by not re-fetching at all — the save response itself contains the full updated checklist, so that gets applied directly to the UI.

**Print Kit — three new QR sections added:**
- **Virtual Queue QR** (PRO/TEAMS only) — full-page printable QR so shoppers can scan to join the virtual queue
- **Treasure Hunt Clues QR** (PRO/TEAMS only) — full-page QR linking to your treasure hunt clues page
- **Photo Station QR** (all tiers) — compact grid of 4 QR codes for posting around your sale; shoppers scan to browse & buy items

**Photo station design locked** — One QR per sale. Shoppers who scan earn XP (same rate as a treasure hunt clue scan). If they share a photo to social media from the page, they earn an additional share bonus. This gives non-buyers an XP on-ramp — they didn't buy anything for a haul post, but they can still engage. The shopper-facing photo station page (`/sales/[id]/photo-station`) isn't built yet — that's next session.

**XP discrepancy found** — The hunt-pass page and the backend are out of sync on several XP rates. The hunt-pass page shows a sale visit = 2 XP; the backend has it as 5. Clue scans show 25 XP on the page; backend has 12 (was rebalanced months ago and the UI was never updated). Full rebalance is next session.

### Next session — S500: XP rebalance + photo station

**Sequence matters:** The game designer reviews and corrects `hunt-pass.tsx` first (source of truth for intended rates). Once the UI is right and approved, the backend `xpService.ts` constants get updated to match. Not the other way around.

Then: implement treasure hunt 3-clue limit, build the photo station shopper page, update print kit QR URL to point to it.

---

## S498 Summary (2026-04-17) — Time pickers, inventory sort, video branding, checklist fix, planner copy

**7 files changed. 1 push block.**

### Push block — S498:

```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add packages/frontend/pages/organizer/edit-sale/[id].tsx
git add packages/backend/src/controllers/itemController.ts
git add packages/frontend/public/organizer-video-ad.html
git add packages/frontend/public/video.html
git add packages/frontend/components/SaleChecklist.tsx
git add packages/backend/src/controllers/plannerController.ts
git add packages/frontend/pages/plan.tsx
git commit -m "fix: time pickers on edit sale, inventory sort (newest first), video frame branding, checklist cache invalidation, planner inclusive copy, chat scroll removed"
.\push.ps1
```

### What was fixed this session:

**Edit-sale time pickers** — Start and end times now appear on the edit sale form as separate time inputs (HH:MM) alongside the date fields. Times load from the existing sale's ISO dates. On save they're recombined into UTC ISO before being sent to the backend.

**Inventory sort — new items first** — When you add a new item to a sale, it now appears at the top of the review/publish list instead of the bottom. One-line fix: added `orderBy: { createdAt: 'desc' }` to the inventory query.

**Video opening frame branding** — The opening black frame of the animated video player now shows the FindA.Sale logo and "WATCH — 38 SECONDS" text above the play button, matching the treatment you showed in the screenshot. The page-level logo and caption that used to live above the iframe wrapper have been removed — branding now lives inside the player where it belongs.

**Sale checklist checkboxes** — Checking/unchecking items at finda.sale/plan now actually works. Root cause: all three data mutations (toggle item, add item, delete item) had empty `onSuccess` callbacks with no cache invalidation, so the UI never refreshed after a change. Fixed by adding proper `invalidateQueries` to each.

**Planning assistant — inclusive copy** — The planning assistant's system prompt no longer opens with "estate sale planning assistant" and focuses only on estate sale scenarios. It now covers all sale types — estate, yard, auction, flea market, consignment. Can still mention estate sales when relevant but won't treat them as the only sale type.

**Chat auto-scroll removed** — Sending a message in the planning assistant no longer jumps the page down. The auto-scroll `useEffect` was calling `scrollIntoView` on an element inside an unconstrained flex container, making the browser window itself scroll. Removed it entirely.

---

## S497 Summary (2026-04-17) — Geocoding + entrance pin + treasure hunt + eBay + inventory batch pull

**14 files changed. 3 commits to push (consolidate or push separately).**

### Push 1 — Main S497 batch:

```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add packages/backend/src/controllers/geocodeController.ts
git add packages/backend/src/routes/sales.ts
git add packages/frontend/pages/organizer/edit-sale/[id].tsx
git rm packages/frontend/components/ManualLocationPicker.tsx
git add packages/frontend/components/TreasureHuntQRManager.tsx
git add packages/backend/src/controllers/treasureHuntQRController.ts
git add packages/backend/src/services/xpService.ts
git add packages/backend/src/services/cloudAIService.ts
git add packages/backend/src/controllers/saleController.ts
git add packages/backend/src/controllers/ebayController.ts
git add packages/frontend/components/InventoryItemCard.tsx
git add packages/frontend/pages/organizer/inventory.tsx
git commit -m "fix: geocoding fallbacks + entrance pin save + treasure hunt hardening + eBay description sync + inventory batch pull"
.\push.ps1
```

### Also connected this session:
**Railway MCP** — `mcp.railway.com` is now connected. Tools available in next session: list-projects, list-services, redeploy, whoami, railway-agent. First use will OAuth prompt → Railway login.

### What was fixed this session:

**"Sale location not found" on edit page** — Nominatim doesn't know every USPS-valid address. Added US Census Geocoder as a third fallback strategy. It runs after both Nominatim attempts fail and handles addresses that USPS considers valid but OpenStreetMap doesn't have indexed.

**Entrance pin and notes not saving** — Two bugs in `edit-sale/[id].tsx`: (1) The form change handler was using `{...formData, [field]: value}` which captures a stale snapshot — if you edited a field after placing the entrance pin, the pin coordinates were wiped from state. Fixed with functional updater `prev => ({...prev})`. (2) The `formInitialized` ref was declared but never actually checked in the useEffect, so every background refetch reset the form. Now wired in correctly.

**Treasure hunt: removed organizer toggle** — Organizers no longer control whether the completion bonus fires. It always fires. The checkbox is gone from the form.

**Treasure hunt: anti-gaming** — Max 10 clues per sale (enforced server-side). Completion bonus is now deduped via `PointsTransaction` — a user can't delete and recreate clues to farm the bonus repeatedly.

**Description generator now matches your sale type** — Instead of always describing it as "an estate sale", the AI now uses the actual sale type label (yard sale, auction, flea market, etc.) based on what the organizer selected.

**eBay description sync** — Many eBay sellers use HTML templates (full CSS layout, header graphics, etc.). When the sync stripped HTML tags, all that layout code was leaving an empty string instead of the item description. Now strips `<style>` and `<script>` blocks first, then removes remaining tags. Descriptions should now come through correctly on next sync.

**Inventory on mobile** — Action buttons (Pull to Sale, price history, delete) were always invisible on mobile because they used a hover-only reveal. Now always visible on small screens. Also added batch select: tap the checkbox on any card, select as many as you want, then tap "Pull X to Sale" from the sticky bottom bar to send them all to one sale at once.

---

## S496 Summary (2026-04-17) — Nav freeze + sale creation geocoding

**2 bugs fixed. shopperCredits migration confirmed applied.**

### Your action — push S494 + S495 + S496 together:

```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git add packages/frontend/hooks/useShopperCart.ts
git add packages/frontend/pages/organizer/create-sale.tsx
git add packages/frontend/components/EbayCategoryPicker.tsx
git add packages/frontend/pages/organizer/edit-item/[id].tsx
git add packages/frontend/pages/organizer/command-center.tsx
git add packages/frontend/pages/city/[city].tsx
git add packages/frontend/components/SearchFilterPanel.tsx
git add packages/frontend/components/SearchSuggestions.tsx
git add packages/backend/src/services/discoveryService.ts
git add packages/frontend/pages/shopper/loyalty.tsx
git add packages/frontend/pages/organizer/subscription.tsx
git commit -m "fix: nav freeze (useShopperCart cross-instance loop) + geocoding on create sale + orphaned component wiring"
.\push.ps1
```

### What was fixed this session:

**Navigation frozen sitewide (P0)** — Clicking Login, any nav link, or any button did nothing on desktop and Android. Root cause: `useShopperCart` mounted in 5 simultaneous instances (Layout, AvatarDropdown, ShopperCartFAB, ShopperCartDrawer, sale/item pages). The sync handler was calling `setCart(JSON.parse(stored))` on every `fas_cart_sync` event — which creates a new object reference even when the data is identical. That triggered each instance's persistence effect → which dispatched another sync event → infinite cascade that kept React's scheduler permanently busy. Clicks were silently dropped. Fix: functional `setCart` with `JSON.stringify(prev) === stored` check — when data hasn't changed, returns the same `prev` reference and React skips the re-render entirely. Loop terminates. Chrome-verified: Login nav works.

**"Sale location not found" on new sale (P1)** — When creating a sale and selecting an address from the autocomplete dropdown, you'd hit this error on the edit page. Root cause: `create-sale.tsx` was throwing away the `lat` and `lng` that the autocomplete provided when a suggestion was selected. The sale was created without coordinates, then the edit page tried to re-geocode via Nominatim and failed for specific addresses. Fix: `lat`/`lng` now flow from the autocomplete selection through `formData` into the POST body. The backend already accepted them — nothing else needed.

**shopperCredits DROP COLUMN migration** — Confirmed applied by Patrick this session ✅.

---

## S495 Summary (2026-04-17) — Orphaned component QA complete + 3 bug fixes

### What was QA-verified this session:

- ✅ **LiveFeedWidget** — command-center, real sale events loading
- ✅ **QuickReplyPicker** — messages/[id], all 3 chips work, sends real message
- ✅ **RankLevelingHint** — /shopper/ranks as Karen (5 XP, Initiate), next-rank hint renders
- ✅ **ShopperReferralCard** — /profile as Karen, real referral code + 1 referral tracked
- ✅ **storefront/[slug]** — brand banner, About card, 4 active sales with photos
- ✅ **SharePromoteModal** — /organizer/promote/[saleId], 5 tabs, real sale data, copy works

### What was fixed this session (3 files):

- **discoveryService.ts** — Feed API was not including active boost data on sales. BoostBadge was wired in SaleCard but `sale.boost` was always `null` from the feed endpoint. Fixed by adding the same `boostPurchase.findMany()` lookup used in `saleController.ts`.
- **loyalty.tsx** — RankUpModal was imported and rendered but `setShowRankUpModal(true)` was never called anywhere. Fixed by adding a `useEffect` that watches `xpProfile.explorerRank`, compares to `localStorage.guild_last_rank`, and triggers the modal when the rank increases.
- **subscription.tsx** — DowngradePreviewModal was imported and rendered but `setShowDowngradePreview(true)` was never called. Fixed by adding a "Downgrade to SIMPLE" button (amber style) in the Plan Actions section, visible only when `tier !== 'SIMPLE'`.

---

## S493 Summary (2026-04-16) — QA pass: Feature #294 eBay picker, workspace, admin, layout fixes

**2. When dev agents return** — they'll have changes for:
- `packages/frontend/components/EbayCategoryPicker.tsx` (P2: show selected leaf category name)
- `packages/frontend/pages/organizer/command-center.tsx` (layout: overflow + Team Coverage clip + alerts empty state)

### What happened this session:

**Feature #294 — Live eBay Taxonomy Category Picker** ✅ (with P2 open)
- Live API search confirmed working — typed "typewriter", got 5 real results with IDs + L1 parent labels
- P0 bug found: `ebayCategoryId`/`ebayCategoryName` were never wired into `updateItem` handler — saved silently to null in DB
- P0 fix: added both fields to destructuring + `updateData` block in `itemController.ts` — pushed green
- P2 open: after selecting a category, picker shows L1 parent as placeholder instead of confirming the leaf name — dispatched to findasale-dev

**Workspace (TEAMS tier)** ✅
- Chat, task assignments (PENDING→IN_PROGRESS→COMPLETED), activity feed — all verified end-to-end with real data
- Sale selector, assignee selector, status cycling all working

**Other pages verified** ✅
- Subscription page loads, tier display correct
- Add-items page no crash (previous bug from S491 confirmed resolved)
- Admin reports (Alice Johnson / user1@example.com) — loads correctly
- Hall of fame → redirects to /leaderboard ✅
- /organizer/pricing → /pricing (confirmed correct by Patrick)

**Open regressions:**
- ❌ `/city/grand-rapids` still 404 — getStaticPaths fix from S492 may not have triggered a Vercel rebuild, or no city record with slug "grand-rapids" exists in DB
- ⚠️ H-001 PARTIAL — SearchFilterPanel section labels fixed (dark mode readable), but Condition/Category/Sort By `<select>` inputs still show white backgrounds in dark mode
- ❌ H-002 NOT CONFIRMED — STATE.md says Items section moved to position 1 on sale detail, but browser shows: About → Live Activity → Items. Either fix didn't deploy or there's a discrepancy.
- ⚠️ Command-center layout broken — 4th stat card clipped, Team Coverage overflows, alerts empty state oversized — layout fix dispatched

---

## S492 Summary (2026-04-16) — Workspace collaboration + command center monitoring

**Workspace chat, task assignments, activity feed all live. Command center staffing and technical alerts added. 4 build errors fixed.**

### Your actions:

**1. Docs push block (STATE.md + dashboard wrap):**
```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "docs: S492 wrap — workspace chat/tasks/activity, command center staffing+alerts, S493 QA theme"
.\push.ps1
```

### What was built this session:

**Workspace team chat** — `/workspace/[slug]` now has a working chat panel. Per-sale tabs, 15-second polling, auto-scroll, 1000-char limit, member-only posting. Backend: `GET/POST /:workspaceId/sales/:saleId/chat`.

**Workspace task assignments** — Task list with clickable status cycling (PENDING → IN_PROGRESS → COMPLETED), assignee selector, sale selector, 30-second polling. Backend: `GET/POST/PATCH /:workspaceId/tasks`.

**Workspace activity feed wired** — Team Activity section replaced with real data from the activity feed API, scoped to workspace sale IDs (backend was already live, frontend was using a stub).

**Command center staffing panel** — Team Coverage section shows workspace members with roles and accept status.

**Command center technical alerts** — Technical Alerts section shows color-coded alerts: NO_ITEMS (no items listed for an upcoming sale), ITEMS_MISSING_PHOTOS (items without photos), EXPIRING_HOLDS (holds expiring in 24h), SALE_STARTING_SOON (sale starts within 48h).

**4 build fixes:**
- workspaceController.ts TS2322 (`string | null` used where `string` required) — fixed with `as string`
- Frontend `types/commandCenter.ts` was missing `TeamMember`, `TechnicalAlert`, and updated `CommandCenterResponse` — Agent D only updated the backend copy
- `city/[city].tsx` `getStaticPaths` was calling `.filter()` on `{ cities: [] }` object instead of array — fixed
- saleController.ts `boosts` Prisma include (doesn't exist on Sale) — replaced with batch BoostPurchase query by targetId

---

## S491 Summary (2026-04-16) — Large batch: 40+ files

**Admin reports fixed, 20 orphaned components wired, 4 security fixes, eBay quota, batch brand/audit fixes, Hooks violations, Scout Reveal hardened.**

### Your actions (do these in order):

**1. Run the push block (43 files — includes deletions and build fixes):**
```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add packages/frontend/pages/admin/reports.tsx
git add packages/database/prisma/schema.prisma
git add "packages/database/prisma/migrations/20260416_ebay_push_quota/migration.sql"
git add packages/backend/src/controllers/ebayController.ts
git add packages/backend/src/controllers/itemController.ts
git add packages/backend/src/controllers/treasureHuntQRController.ts
git add packages/backend/src/jobs/auctionJob.ts
git add packages/backend/src/controllers/authController.ts
git add packages/backend/src/services/referralService.ts
git add packages/backend/src/middleware/requireTier.ts
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/controllers/saleController.ts
git add packages/backend/src/controllers/xpController.ts
git add packages/backend/src/services/xpService.ts
git add packages/frontend/next.config.js
git add packages/frontend/components/Layout.tsx
git add packages/frontend/components/SaleCard.tsx
git add packages/frontend/components/ItemCard.tsx
git add packages/frontend/components/OrganizerHoldsPanel.tsx
git add packages/frontend/components/QuickActionsBar.tsx
git add packages/frontend/components/SharePromoteModal.tsx
git add packages/frontend/components/SearchFilterPanel.tsx
git add packages/frontend/pages/organizer/dashboard.tsx
git add packages/frontend/pages/organizer/subscription.tsx
git add packages/frontend/pages/organizer/pricing.tsx
git add "packages/frontend/pages/organizer/storefront/[slug].tsx"
git add "packages/frontend/pages/organizer/add-items/[saleId].tsx"
git add "packages/frontend/pages/sales/[id].tsx"
git add packages/frontend/pages/shopper/crews/index.tsx
git add packages/frontend/pages/shopper/hall-of-fame.tsx
git add packages/frontend/pages/shopper/loyalty.tsx
git add packages/frontend/pages/shopper/ranks.tsx
git add packages/frontend/pages/profile.tsx
git add "packages/frontend/pages/messages/[id].tsx"
git add packages/frontend/pages/organizer/command-center.tsx
git add packages/frontend/pages/faq.tsx
git add packages/frontend/pages/condition-guide.tsx
git add packages/frontend/pages/pricing.tsx
git add "packages/frontend/pages/organizers/[id].tsx"
git rm packages/frontend/pages/organizer/premium.tsx
git rm packages/frontend/pages/shopper/lucky-roll.tsx
git commit -m "S491: admin reports, orphaned pages, security fixes, brand drift, H-001/H-002/H-003, Hooks, Scout Reveal, boost query fix, delete premium+lucky-roll"
.\push.ps1
```

**2. Run the eBay migration (Railway DB):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**3. Chrome QA (P0):** Navigate to `/admin/reports` — verify organizers appear in the list. Root cause was the frontend reading `res.data.organizers` (never existed) instead of `res.data.items`. Should be fully resolved now.

### What was fixed this session:

**Admin reports** — frontend interface mismatch (was reading `res.data.organizers`, backend sends `res.data.items`). Should fully resolve "No organizers found."

**eBay push quota** — SIMPLE=10/month, PRO=200/month, TEAMS/ENT=unlimited. Migration required (step 2 above).

**XP caps enforced** — CONDITION_RATING, TREASURE_HUNT_SCAN, AUCTION_WIN now silently skip if daily/monthly cap exceeded.

**Referral atomicity** — `processReferral()` inside `prisma.$transaction()`. No more orphaned users from race conditions.

**Grace period enforcement** — downgraded organizers in 7-day window get 403 for PRO+ features.

**Payment dedup** — duplicate card fingerprint → `fraudSuspect = true` set for manual review.

**20 orphaned pages/components wired:** SearchSuggestions, BoostBadge, LiveFeedWidget, QuickReplyPicker, DowngradePreviewModal, RankLevelingHint, RankUpModal, ShopperReferralCard, storefront slug page rebuilt, hall-of-fame fetch fixed, hall-of-fame redirects added.

**SharePromoteModal P0 (3rd week!) fixed** — "estate sale" in 3 share templates → dynamic label. subscription.tsx brand drift fixed (4 instances). organizers/[id].tsx 4 dark mode violations fixed.

**H-001/H-002/H-003 all fixed** — search filter dark mode, sale detail section order (Items first), Teams "Up to 12 team members."

**React Hooks violations fixed** — add-items/[saleId].tsx: 3 useMutation + 1 useEffect moved above conditional returns.

**Scout Reveal hardened** — `scoutReveals` is DB-persisted (no bug), but fixed null pointer exception + guard scope mismatch (was checking 1 photo, updating all).

**Pricing redirect loop fixed** — `/pricing` ↔ `/organizer/pricing` were pointing at each other. Both now point directly to `/organizer/subscription`.

**Deprecated stubs** — OrganizerHoldsPanel, QuickActionsBar, organizer/premium.tsx (all inferior/unused versions of existing features).

**Lucky-roll resolved** — `/shopper/lucky-roll` was replaced in S449 (commit b8aa04b, D-XP-002) by `/shopper/early-access-cache`. Stubbed as permanent redirect to early-access-cache.

---

## S490 Summary (2026-04-16)

**Video + landing page polished ✅ — 11 rounds on the marketing video, landing copy cleaned up, two-tone Montserrat logo in the app nav.**

**organizer-video-ad.html:**
- White checkmarks on the green circle elements in the Published and payment scenes (were black)
- Fonts bumped (counter, item row, success sub-text — all 2–3px larger to fill the space)
- Scene nav added: left/right arrows + 5 dot indicators so viewers can skip between scenes
- Wrapper height corrected after nav addition (iframe grew 844→915px, desktop wrapper 693→750px, mobile 628→679px — nav was being clipped)
- Lamp SVG completely redesigned — traditional empire style (narrow top 18px, wide base 52px) instead of the martini-glass shape it was. Includes finial, socket collar, and two-tier base.
- Return beam (shopper → organizer) now flows right-to-left correctly (delay order was backwards)
- eBay push button color corrected to amber-600 (#D97706) — was a slightly different shade
- Scene 2 "You're done." and "Under an hour." now each on their own line, "You're done." in orange
- Scene 3 "Shoppers Pay" / "on their phone." split across two lines
- Beam and item label text brightened (30% → 60% white) — now readable
- Bullet timing bug fixed: bullets were appearing simultaneously with the charge tap instead of before it (array ordering issue in the RAF event loop)
- CTA copy: "Snap your first photo and watch it work."

**video.html (landing page at finda.sale/video):**
- Page padding reduced — less dead space above the video
- Features list updated: "Advanced Analytics" instead of "Insights"
- Per-sale offer copy: "Run just a few large sales a year? Get PRO capacity for $9.99 per sale."
- Badge: "No credit card. No trial. / No catch." (No catch on its own line)

**App nav logo:**
- Both nav locations (desktop + mobile drawer) now show `FindA.Sale` in two-tone Montserrat 800: grey/white outer text + amber "A." — same treatment as the video landing page
- Montserrat was not previously loaded in the app — added to the Google Fonts URL in `_document.tsx`

**Your actions:**
1. Run the push block below
2. Delete root-level `finda-sale-landing.html` and `organizer-video-ad.html` from repo root (superseded by public/ copies)
3. Delete `The_True_Plan.md` from workspace

---

## Audit Alerts — 2026-04-16

**3 HIGH findings from weekly automated site audit.** All are DECISIONS.md violations requiring dispatch.

**H-001 — Search page dark mode: Filter labels invisible (D-002).**
`/search` filter sidebar — Price Range, Condition, Category, Sort By labels and all radio text are white-on-white in dark mode. Completely unreadable. Fix: add `dark:text-gray-200` variants to filter label/option text in the search sidebar component. Dispatch to findasale-dev (~15 lines).

**H-002 — Sale detail section order wrong (D-006).**
Items for Sale is currently at the bottom of the page — after Reviews and Map. D-006 requires Items to be the FIRST full-width section (before UGC, Map, Reviews). Fix: reorder JSX sections in `pages/sales/[id].tsx`. No logic change. Dispatch to findasale-dev.

**H-003 — Pricing page says "5 team members" for Teams tier (D-007 LOCKED).**
`/organizer/pricing` Teams card reads "Includes 5 team members." D-007 is locked at 12. This is a copy error. Fix: update copy to "Up to 12 team members." Trivial (<5 lines). Dispatch to findasale-dev.

**Also noted (DECISION NEEDED — Patrick):** "Favorites" nav link → `/shopper/wishlist` URL → "My Collections" page title. Three names for one feature. Pick one — Favorites, Wishlist, or Collections — and findasale-records will lock it in DECISIONS.md.

Full audit: `claude_docs/audits/weekly-audit-2026-04-16.md`

---

## What Happened This Week

**S488** (2026-04-16) — Feature flags backend + Chrome QA verification

Feature flags backend API fully implemented and deployed. `/admin/feature-flags` full CRUD (create, toggle, delete) verified in Chrome ✅. `/admin/reports` both tabs verified with real data, no crash ✅. All outstanding migrations confirmed applied via direct Railway DB query — nothing left pending.

**S487** (2026-04-16) — Schema additions + admin nav cleanup + Chrome QA

4 new database tables (FeatureFlag, PwaEvent, OrganizerScore, ApiUsageLog). `(Soon)` labels removed from admin nav — all 4 admin pages now live links. Chrome QA: /admin/items ✅, /admin/broadcast ✅. reports.tsx crash fix applied. Acquisition Playbook language broadened.

---

**S486** (2026-04-16) — Video polish pass 2 + landing page strip + SEO meta tags ✅

Second polish pass on `organizer-video-ad.html`: scene 2 lamp made bigger (it was too small inside the new enlarged camera frame), success and review screens fixed so content actually centers vertically (needed `height: 100%` + `box-sizing: border-box` — flex had no space to distribute before), scene 3 payments row sized down to fit the "Request" beam label without squishing the phones, and font sizes bumped across the entire video — especially scene 5 CTA and scene 3 bullet points.

Landing page stripped down to the essentials — removed the hero H1, 3 feature cards, testimonial, and 3 of the 5 FAQ rows. What's left: logo → video → "Built for organizers. Loved by shoppers." split → Free Forever offer → 2 FAQs → CTA → footer. Clean and punchy.

SEO meta tags added to the landing page: canonical URL, Open Graph (for Facebook/LinkedIn previews), Twitter cards, theme-color, robots, favicon refs, and JSON-LD SoftwareApplication structured data with pricing and audience. The page is now properly indexed and previews well when shared.

Pipeline wired. Landing now serves at `finda.sale/video` via a Next.js rewrite. Canonical copies moved into `packages/frontend/public/` (`video.html` + `organizer-video-ad.html`), uses the existing favicon/apple-touch-icon system, and ships a new `og-default.png` (1200×630) that also fixes broken social preview refs in `trending.tsx` and `map.tsx`.

**Post-deploy fixes:** After deploy Patrick flagged the iframe was blank and slightly wider than its frame. Two fixes shipped: (1) CSP `frame-src` in `next.config.js` was missing `'self'` so the same-origin iframe was silently blocked — now added. (2) Iframe scale tightened from `0.821` to `0.82` (desktop) and `0.744` to `0.7425` (mobile) so the scaled width fits cleanly inside the phone-frame wrapper with no overflow. After redeploy, a hard refresh (Ctrl+Shift+R) clears the old CSP header cached by the service worker.

**Next up:** Audit Organizer Acquisition Playbook — strip all estate sale and AI language, broaden every instance to cover yard sales, auctions, flea markets, consignment. This is a recurring drift issue that needs a hard fix in the doc itself. Also: synthesize all the S484 acquisition research into a single 90-day action plan with no hedging.

---

**S485** (2026-04-15) — Animated video polish (organizer-video-ad.html) ✅

38-second animated video is done. Key changes this session: phones now stay static during payment swap (CSS grid stacking fix), counter starts at 75, bullets appear after shopper phone settles, lamp larger, "Not anymore!" with exclamation, eBay confirm sub-line removed, beam label width stabilized so it doesn't shift on "Request → Paid." Total runtime 38s.

---

**S484** (2026-04-15) — Acquisition strategy research: Koerner methodology + guru frameworks + influencer intelligence + animated video ✅

**What this session produced:**

**Organizer Acquisition Playbook — rebuilt to v3.** Three major additions beyond the original demand-gen scope:

1. **Koerner methodology at scale** — Chris Koerner scraped 242 US MSAs for 20,000 estate/resale business contacts using Outscraper ($5–15/5k records), validated phone numbers through Searchbug (separates cell from landline), and sent ringless voicemails at $0.004/drop via Drop Cowboy. 5,000 contacts = $20 in RVM. Not 25 contacts — thousands. Full tool stack: Outscraper → Searchbug → RVM → cold text (GoHighLevel $97/mo) → cold email (Instantly.ai $30/mo) → Facebook group email capture (GroupBoss $20/mo) → VA follow-up. Total: $285/month. These organizers arrive pre-warmed from the video — the outreach just delivers traffic.

2. **Guru framework summary** — mapped 8 acquisition gurus to FindA.Sale's exact situation: Hormozi (Core Four + Grand Slam Offer — "first 3 items free, refund month 1 if 2 don't move"), Nick Huber (Sweaty Startup local-first — GMB, Nextdoor, physical presence at estate sale venues), Codie Sanchez (media-first — tributaries strategy, newsletter before product), Noah Kagan (48-hour validation → ProductHunt/AppSumo launch, potential $4,900 burst), Russell Brunson (full funnel RVM→video→trial→month-2 upsell), Justin Welsh (founder as brand, TikTok screen recordings of real sessions), Sam Parr/Shaan Puri (who already has our customers — EstateSales.NET has 50k organizers, partnership play), Paul Yonover (Dream 100 — 100 high-value personal outreach targets), Dan Henry (B2B SaaS cold email).

3. **Two-sided influencer flywheel** — the Airbnb model applied to FindA.Sale: shopper-side influencers drive buyers to browse → organizers see buyer traffic → organizers adopt the platform. Named targets: Gary Vaynerchuk (34M YouTube subs, "Trash Talk" garage sale series, explicitly loves yard/estate sales), Lara Spencer (HGTV Flea Market Flip + "That Thrifting Show"), Mike Wolfe (American Pickers, History Channel antiques audience), Flea Market Flipper (Rob & Melissa, dedicated reseller community), Hairy Tornado (full-time YouTube/Whatnot reseller), Ralli Roots (Ryan & Alli, $200 → 6-figure reselling income), Treasure Hunting with Jebus (727K YouTube), Thrifting Vegas (estate sales + garage sales for profit), Whatnot platform ($6B+ GMV, integration + influencer partnership play).

**ICP locked:** Solo or 2-person team, 6–20 sales/year, currently using spreadsheets + phone photos + Venmo, tech-comfortable, frustrated by setup time. ASEL professional member profile. Not the 1-sale/year hobbyist. Not the national liquidation enterprise.

**9 innovation ideas evaluated with BUILD NOW / DEFER verdicts:**
- Risk-reversal guarantee ("first 3 items free, refund month 1 if 2 don't move") → BUILD NOW (15 lines)
- Probate attorney referral loop with tracking links + profile badge → BUILD NOW (~150 lines)
- ProductHunt + AppSumo launch → BUILD NOW (no code, potential $4,900 immediate)
- Month-2 upsell email triggered by feature limit behavior → BUILD NOW (30 lines)
- 48-hour concierge sprint with 5 organizers → case study → BUILD NOW (no code)
- Copy reframe "Save time" → "Finish. Then go on vacation." → A/B test NOW
- Estate Sale Insider podcast (bi-weekly, zero competition in this space) → BUILD NOW
- Justin Welsh 5-part TikTok screen recording series → BUILD NOW
- EstateSales.NET partnership/migration offer → RESEARCH (ops + legal)

**Animated video built.** 25-second HTML5/CSS animated video, 9:16 vertical (TikTok/Shorts format). 5 scenes: Hook ("200 items. Not anymore."), Product Demo (camera capture → auto-tag → publish → counter animation 0→47 items), POS (two-phone payment sequence with ripple animation), Feature Chips (5 cards with FREE/PRO tier badges), CTA (FindA.Sale wordmark + "Try it free."). Brand-accurate colors, Montserrat + Inter from CDN, JavaScript RAF timeline controller. Self-contained single HTML file, no dependencies, no watermark.

**Files changed (2):**
- `Organizer_Acquisition_Playbook.md` — rebuilt v3
- `organizer-video-ad.html` — NEW 25-second animated video

**Push block for S484:**
```powershell
git add Organizer_Acquisition_Playbook.md
git add organizer-video-ad.html
git commit -m "S484: Acquisition playbook v3 (Koerner methodology + guru frameworks + influencer flywheel + ICP) + 25s animated video"
.\push.ps1
```

**Next session: synthesize everything → THE TRUE PLAN.** All research is done. Next session produces a single 90-day action plan: Week 1 / Month 1 / Month 2-3 with owners, tools, budgets, success metrics. No hedging. Commit to the sequence.

---

**S483** (2026-04-15) — Admin dashboard rebuild + eBay settings bugs + Cost protection docs ✅

**eBay settings bugs — ✅ 3 fixed:**
- oz inputs no longer show browser spin buttons (changed to text type)
- Policy dropdowns now stick — selection persists after choosing
- "Use suggested defaults" weight-tier ranges corrected (1+ lb = 16–31 oz, 2+ lb = 32–47 oz, etc.)

**Admin dashboard — ✅ rebuilt with real business metrics:**
Your admin dashboard home page now shows: MRR by tier, today's revenue, 30-day transaction revenue, Hunt Pass revenue, organizer tier breakdown (SIMPLE/PRO/TEAMS counts), a full conversion funnel (Signups → Have Organizer → Created Sale → Published Sale → Paid Tier with % at each step), and 7-day sparklines for signups/revenue/new sales.

**4 Coming Soon admin pages — ✅ all implemented:**
- **Reports:** Organizer performance table (sortable by revenue, sales, sell-through, last active; tier badges; CSV export) + Revenue breakdown by 7d/30d/90d with daily chart
- **Items:** Global search across all items with photo thumbnail, status, price, organizer, sale info, pagination
- **Broadcast:** Send emails to specific audiences (All users, Organizers, Shoppers, PRO, TEAMS) with live recipient count preview before sending
- **Feature Flags:** Toggle product features on/off with optimistic UI — NOTE: needs schema migration before backend works (see below)

**eBay rate limiter — ✅ shipped:**
eBay API now has an in-memory daily call counter. Soft cap at 4,500/day (eBay's limit is 5,000). If a bug or bulk import hits the cap, pushes return a clean "rate limited" error instead of exhausting your quota and breaking eBay for the rest of the day.

**Cost protection playbook — ✅ written:**
All 8 services (Cloudinary, Google Vision, Anthropic, Railway, Vercel, eBay API, Stripe, Resend) documented with exact URLs, step-by-step instructions for spending caps and alerts, and a viral spike response plan. See `claude_docs/operations/cost-protection-playbook.md`. 7 quick-action items for you to do manually (links are all in the doc).

**Organizer signals spec — ✅ written:**
Full spec for expansion readiness scoring (when to nudge SIMPLE → PRO, PRO → TEAMS) and churn risk scoring for the admin dashboard. 4 proactive expansion signals: fee savings breakeven math, capacity trajectory (trending toward limit before hitting it), feature gap (high-GMV organizer never used Smart Pricing), velocity acceleration (doubled sale frequency). Ready for schema + dev dispatch when you want it.

**Schema work pending (Patrick action required):**
Architect designed 4 new tables: FeatureFlag (needed for feature flags backend), PwaEvent (PWA metrics), OrganizerScore (expansion/churn scoring), ApiUsageLog (replace in-memory AI/Cloudinary cost trackers with DB persistence). These are NOT in schema.prisma yet — dispatch Architect+Dev next session or the session after.

**15 files changed total. Push blocks below.**

---

**S482** (2026-04-15) — Camera UI overhaul: settings pill, toast fix, pinch zoom, iPad fullscreen ✅
- **Toast fix — ✅ done.** Toasts were firing inside the header zone (top-4 = 16px, header is 48–64px tall), covering the notification bell and hamburger. Now clears the header: `top-14` mobile / `top-20` desktop.
- **Camera settings redesigned — ✅ done.** The old torch-button-in-top-bar approach caused X button to be covered on devices with torch. Full redesign:
  - X button always top-left, never covered.
  - Gear icon top-right opens a **vertical pill** that drops down from the gear.
  - Pill contains: Flash/Torch cycle, White balance (with sub-chips extending left), Timer, Corner guides toggle, Level indicator toggle, Switch camera.
  - **Torch merged into flash cycle:** Off → On → Auto → Torch (4-step cycle, one button). Torch step hidden on devices that don't support it.
  - White balance sub-chips now correctly clickable (were broken due to wrong positioning context — fixed by moving inside pill as child).
  - Tap outside or re-tap gear to close.
- **iPad now fullscreen — ✅.** Camera was switching to modal at 768px (iPad portrait). Bumped modal treatment from `md:` to `lg:` breakpoints.
- **Settings button was unclickable — ✅ fixed.** Two separate bugs: (1) viewfinder had no z-index and was stacking above top bar in DOM paint order — fixed with `z-0`; (2) settings panel had `z-19` which isn't a valid Tailwind class (compiled to nothing) — fixed to `z-30`.
- **Level indicator is now live — ✅.** Was a static line. Now reads device gyroscope, rotates an 80px bar: amber within ±2°, white ±2–10°, red beyond. Cleans up on unmount, handles iOS 13+ permission.
- **Pinch-to-zoom fixed — ✅.** Browser was claiming the pinch gesture as a page zoom. Added `touch-action: none` to the viewfinder — all pinch events now handled by the camera's custom zoom logic.
- **Zoom pill added — ✅.** `0.5×/1×/2×/3×` tap targets centered between the bottom corner brackets. Shows only levels the device actually supports. Hidden entirely if zoom not supported.
- **2 files changed (RapidCapture.tsx, ToastContext.tsx). Zero TypeScript errors.**

**Next session — push S482 first, then fix 3 eBay settings bugs:**
- Bug A: oz inputs show as number spinners (up/down arrows) — should be plain text inputs
- Bug B: Policy dropdowns open but can't select — stays at "-- Select policy --"
- Bug C: "Use suggested defaults" not matching lb-weighted policies to correct oz ranges (1+ lb = 16–31oz, 2+ lb = 32–47oz, etc.)

---

**S481** (2026-04-15) — AI camera improvements batch + trails security + Hubs nav ✅
- **Trails security — ✅ fixed.** Anyone could see, edit, and delete other people's Treasure Trails at `/shopper/trails`. The public endpoint returned all trails with no ownership check. Fixed: new authenticated `/trails/mine` endpoint filters by your user ID. Edit/Delete buttons now check `trail.userId === user.id` — other people's trails are read-only.
- **Hubs nav move — ✅ done.** Market Hubs removed from the general organizer nav section and moved into the TEAMS block in both the avatar dropdown and mobile nav. Icons changed from purple to grey to match the TEAMS section style.
- **AI camera batch (7 improvements) — ✅ all shipped:**
  - **Dark/glass items:** Google Vision now runs TEXT_DETECTION alongside LABEL_DETECTION — catches brand marks and etched text on glass, dark ceramics, and transparent items. If fewer than 3 usable labels come back, Haiku is told to reason from silhouette and shape instead of guessing blindly.
  - **Pricing anti-anchor:** Removed the "estate sale / 20–50% of retail" framing that was pulling prices toward round numbers. Prices are now grounded in actual secondary market comps (real sold items from your DB by category). Example JSON in the prompt changed from `$15` to `$14` — breaks the model's round-number bias.
  - **Comp-based price refinement:** After AI tags an item, the system fetches the 5 most recent sold items in that category and runs a `suggestPrice` call to override the raw AI price with a market-informed one. Requires at least 2 comps to trigger.
  - **Condition grade visual checklist:** The AI now assesses scratches, chips, color fading, rust, missing parts, and signs of repair — not just "good/fair/poor" intuition.
  - **Tag grouping:** In the Review page, suggested tags are now displayed in labeled groups — Material, Era, Brand, Style, and Other — instead of a flat unlabeled list.
  - **Within-session suppression:** If you remove a suggested tag twice, it stops appearing for the rest of that session. The system learns your preferences as you work.
  - **Condition-adjusted pricing:** Clicking a condition grade (S/A/B/C/D) on the review page now silently re-fetches a price suggestion adjusted for that grade. Price field updates automatically. Grade buttons dim while refreshing.
- **9 files total. Zero TypeScript errors.**

---

**S480** (2026-04-15) — S468 status card fix + photo lightbox + Item 5 confirmed done + eBay push error toast fix ✅
- **S468 status card — ✅ fixed.** The "Business Policies" card on Settings → eBay now shows green ✓ when you've synced policies. Root cause: `/api/ebay/connection` was stripping 4 policy fields from its JSON response. Added them, simplified display condition to `policiesFetchedAt`. 2 files.
- **Photo lightbox — ✅ shipped.** Clicking any photo in the item editor now opens a full-screen overlay. Escape-to-dismiss, close button, `cursor-zoom-in` hint. You verified it works. 1 file.
- **Item 5 reconciliation — ✅ already done.** Verified the full implementation was already in S467. No new code needed.
- **NudgeBar — ✅ confirmed.** Organizer suppression working. Nudge bar does not show for organizer accounts.
- **eBay Advanced Setup save bar — ✅ browser-confirmed.** The bar renders at the bottom of the browser — confirmed by setting it to hot-pink and you said "it's pink." The screenshot tool has a blind spot at the viewport bottom (browser chrome offset). Bar is real and functional.
- **eBay push error toast — ✅ P2 fixed.** The item editor's "Push to eBay" button was always showing a generic "Failed to push item" error even when the backend sent a specific error code. Root cause: frontend checked `result.error` but backend sends `result.code` + `result.message` — `error` field never exists. Fixed in `edit-item/[id].tsx`. Now correctly shows "eBay not connected" or "eBay policies not configured" for the right error codes, with `result.message` as fallback. Also fired a live push to confirm the fix — backend returned `NO_FULFILLMENT_POLICY_MATCH` (test item has no weight set), which the fix now surfaces correctly instead of falling through to generic.
- **USED_EXCELLENT condition — ✅ code-verified, ⚠️ live unverified.** `mapGradeToInventoryCondition` correctly returns `USED_EXCELLENT` for grade S + condition=USED. Can't verify on eBay yet because the test item has no weight set — the push fails before reaching condition logic.
- **S469 sticky save bar — ⚠️ P2 noted.** Bar hides behind footer when scrolled to very bottom. Save still works. Fix next session (z-index, <5 lines).
- **4 files total this session.**

---

**S479** (2026-04-15) — Chrome QA of S467/S468/S469 ✅ mostly, ⚠️ one bug found
- **S467 rarity filter fix — ✅ verified.** Celestion Vintage 30 G12 (ULTRA_RARE) now visible on Add Items page as Artifact MI. Organizer no longer loses sight of their own ULTRA_RARE items during the 6h Hunt Pass window.
- **S469 Advanced Setup page — ✅ verified.** All 8 sections render on `/organizer/settings/ebay`: default policies dropdown (22 real policies populated), weight-tier matrix, shipping classification overrides, category overrides, description template, draft-mode checkbox, merchant location radio (3 options, Sale Address pre-selected), sticky "Save setup" bar. No app-level console errors.
- **S468 policy sync — ⚠️ partial.** The sync endpoint works — 22 real eBay business policies ARE in the DB and populating the Advanced Setup dropdowns (e.g. "No Return Accepted (295102147011)", "1 lb Ground Advantage", "6+ lb Ground Advantage"). But the "Business Policies" status card on the main Settings → eBay tab still shows `⚠ No policies synced` even after a successful sync. **Root cause located:** `GET /api/ebay/connection` response strips `fulfillmentPolicyId`, `returnPolicyId`, `paymentPolicyId`, and `policiesFetchedAt` from its payload — the frontend status card gates its green ✓ on those undefined fields. ~30 line fix across 2 files. Routed to dev next session.
- **Minor note:** Your `1+ lb` through `5+ lb` Ground Advantage policies are classified as `unknown` by the weight-tier parser — only the highest `N+ lb` tier gets promoted to Infinity per S469 design. May be working as intended, but worth checking when you click "Use suggested defaults" that the auto-match gets every tier covered.
- **No code changes this session.** Just QA + doc updates.

---

**S469** (2026-04-15) — eBay Phase 1-3 Foundation: Policy Routing + Weight Tiers + Draft Mode + Setup UI ✅
- **The problem you flagged:** I picked the "first payment policy" as a shortcut. Your real-world account has 22 shipping policies named by weight tier ("8oz Ground Advantage", "1+ lb Ground Advantage", "6+ lb Ground Advantage", "Freight 150+ lb Freight"). eBay also supports 10 description templates per seller. One-policy-wins is not automation — it's a guess.
- **The architecture shipped:** New `EbayPolicyMapping` model (separate from EbayConnection) lets you configure: default fulfillment/return/payment policies, weight-tier routing table, shipping classification overrides (HEAVY_OVERSIZED / FRAGILE / UNKNOWN), category-specific overrides, description template (with `{{DESCRIPTION}}` placeholder), draft-mode toggle, merchant location source (Sale Address / Organizer Address / Existing eBay location).
- **Per-item policy resolution priority:** category override → HEAVY_OVERSIZED override → FRAGILE override → weight-tier match → UNKNOWN override → default fulfillment → EbayConnection fallback. Every push now picks the right policy based on the actual item's weight and classification.
- **Weight-tier parser:** Automatically parses your policy names ("8oz", "1+ lb", "6+ lb") into ranges and matches item `packageWeightOz` to the correct tier. Last "N+ lb" tier is promoted to Infinity (catches everything heavier).
- **New setup page:** `/organizer/settings/ebay` — 8 sections covering defaults, weight tiers (with "Use suggested defaults" button that auto-matches your policies), classification overrides, category overrides, description template, draft mode, merchant location, sticky save bar. Linked from your main Settings page as "Advanced eBay Setup →".
- **Draft mode:** Toggle "Push as Draft" to create unpublished Offers on eBay — you can review/edit in Seller Hub before publishing. Unchecked = auto-publish (current behavior).
- **3 parallel dev agents shipped this session:** non-overlapping file ownership, all returned zero TypeScript errors. Main session verified schema fields, new exports, route registration.
- **Migration required** before testing — block below.
- **Files changed:** 7 (2 new frontend files, 1 new backend util, 1 new migration). Push block below.

---

**S468** (2026-04-15) — eBay policy sync UI + /sync-policies route ✅
- **Confirmed push flow was already correct:** `conn.paymentPolicyId/fulfillmentPolicyId/returnPolicyId` are used in the push call at lines 1648–1650 of ebayController.ts, with a hard validation gate at line 1392. Schema already had all fields. The "Free Standard Shipping" issue on the Celestion listing was because the policy fields were never populated on your EbayConnection row.
- **What shipped:** `POST /api/ebay/sync-policies` route (authenticated) + "Business Policies" block on settings page with green ✓ when synced, amber warning with eBay link when missing, "Sync from eBay" button. `fetchAndStoreEbayPolicies()` was already implemented — just needed `export`.
- **No schema changes. 3 files.**

---

**S467** (2026-04-15) — eBay listing quality batch (all 6 items) + sitewide organizer rarity filter fix ✅
- **P0 bug found:** Your Celestion ($285, ULTRA_RARE) was invisible on ALL your organizer management pages because they were all calling the public browsing endpoint — which runs the Hunt Pass rarity filter (ULTRA_RARE items hidden for 6 hours unless shopper has Hunt Pass). You correctly identified this should be sitewide. Fixed: all 7 organizer pages (Add Items, Sale Detail, Print Kit, Promote, Print Inventory, Bounties, Dashboard) now call the authenticated `/items/drafts` endpoint. Public browsing stays filtered — Hunt Pass early access still works. Buyer Preview still shows the shopper view.
- **Item 1** (manual category): No bug. Code already respects your picker selection.
- **Item 2** (condition fix): Grade S + condition=USED now pushes to eBay as USED_EXCELLENT not NEW.
- **Item 3** (aspect quality): Brand now checks your item.brand field first. MPN checks item.mpn. Tags matched against enum values. No more Brand="RIC" on a Celestion speaker.
- **Item 4** (toast fix): "Failed to push" showing on success — fixed in 3 files (was checking `result.success` instead of `result.status === 'success'`).
- **Item 5** (reconciliation): When you end a listing on eBay directly, the app now detects it. Cron runs every 4 hours + you can trigger it manually via `/api/ebay/sync-ended-listings`. When detected: clears `ebayListingId`, sends in-app notification, item becomes re-listable. No schema changes.
- **Item 6** (watermark): QR resized 130→85px, moved from bottom-center to bottom-right corner.
- **Files changed:** 19 files. Push block below.

---

**S466** (2026-04-14) — Post-push triage: Add Items filter fix + eBay price override fix ✅
- **Problem you hit:** Pushed a Celestion guitar speaker to eBay, ended the listing on eBay, then couldn't find the item in the app. Also flagged a long list of listing-quality problems (wrong category, nonsense aspects like Brand="RIC" and Type="Control Knob", condition miscategorized as NEW when it was USED grade S, and $285 saved → $169.09 on eBay).
- **Root cause — missing item:** Add Items was filtering out everything you'd already published. The backend's `getDraftItemsBySaleId` hardcoded `draftStatus IN ('DRAFT','PENDING_REVIEW')`. Once you pushed an item to eBay, it flipped to PUBLISHED and vanished from your working view. Your mental model (Add Items is home base for the whole sale regardless of publish state) is correct — fixed.
- **Root cause — price override:** eBay push was resolving price as `aiSuggestedPrice → estimatedValue → item.price`. Your explicit $285 got overridden by an earlier AI guess of $169.09. Inverted: your price now wins when set; AI fields are fallbacks only for items you never priced.
- **What did NOT ship this session:** The other 5 listing-quality issues (manual category override, condition mapping, aspect auto-fill, "Failed to push" toast on success, reconciliation) plus the watermark QR resize (6th item). All queued for next session as a parallel dev dispatch — plan in STATE.md "Next Session Priority."
- **Files pushed:** 2 (itemController.ts, ebayController.ts).

---

**S465** (2026-04-14) — Roadmap graduation audit + STATE.md compaction ✅
- **31 features graduated to SHIPPED & VERIFIED:** Audited the roadmap (v106 → v107) for features with both ✅ Claude QA and ✅ Human QA marks. Moved 10 more items from the Building/UNTESTED sections plus 21 already-graduated items from "Only Human Left" into the SHIPPED & VERIFIED table. Newly graduated this pass: #222 Dashboard Redesign, #225 Revenue/Metrics API, #229 AI Comp Tool, #236 Weather Strip, #246 Camera Coaching Banner, #247 AI Branding Purge, #248 FAQ Expansion, #250 Price Research Panel, #262 Tier Restructure, #149 Email Reminders.
- **#245 Feedback Widget deprecated:** Moved from Building to Rejected section. Decision: replaced with planned micro-surveys approach (less intrusive, contextual).
- **STATE.md compacted from 1603 → 150 lines:** Sessions S428–S449 (~850 lines of narrative) archived to `COMPLETED_PHASES.md`. STATE.md rewritten to compact structure: Current Work / Recent Sessions one-liners / Go-Live Blockers / Next Session Priority / Blocked-Unverified Queue / Standing Notes. Complies with T5 size rule.
- **No code changes this session.** Pure documentation pass. S464 code/migration from earlier today still needs your manual actions (below).

---

**S464** (2026-04-14) — ebayNeedsReview, billing webhook fix, Stripe env cleanup, eBay retry hardening ✅
- **ebayNeedsReview:** When eBay push exhausts all 5 category suggestions with error 25005 (non-leaf category), the item is now flagged in the DB and the sale detail page shows an amber "⚠ eBay Category Needed" badge. The push button switches to "Set Category" with an amber color. When you push successfully later, the flag clears. Migration added: `20260414_ebay_needs_review` — **you must run this before testing.**
- **Billing webhook secret fixed (P0):** The billing webhook was using the wrong signing secret (`STRIPE_WEBHOOK_SECRET` instead of `STRIPE_BILLING_WEBHOOK_SECRET`). This meant every incoming subscription event (subscribe, cancel, renew) would fail signature verification and be silently dropped. Fixed. Make sure `STRIPE_BILLING_WEBHOOK_SECRET` is set in Railway with the correct signing secret from the `/api/billing/webhook` endpoint in Stripe live dashboard.
- **Stripe price IDs from env vars:** The pricing page now reads price IDs from `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` and `NEXT_PUBLIC_STRIPE_TEAMS_PRICE_ID` (you added these to Vercel). Old hardcoded test IDs gone. You can now delete the old Vercel vars: `NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID` and `NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID`.
- **eBay retry hardening:** Rewrote the 25005/25021 retry as two independent passes instead of a chained `else if` (Pass 1 = 25021 condition retry, Pass 2 = 25005 category candidates — always runs after Pass 1). Offer PUT now fetches the existing offer first before merging changes (fixes a bug where sending only `{ categoryId }` wiped all other offer fields and caused 25002 "currency missing" error).
- **itemController.ts fix:** The `/items?saleId=` endpoint wasn't returning `ebayListingId` or `ebayNeedsReview` — both were undefined in the frontend. Fixed.
- **Roadmap updated to v106:** New rows #292–#295 (Post-Sale Panel, Listing Data Parity, Live Category Picker, ebayNeedsReview). Feature #25 and #244 notes updated.

**The Whip-It item:** All 5 eBay category suggestions for "Whip-It butane lighter fuel" come back as branch (non-leaf) categories — there's no good leaf category for this product in eBay's tree. After S464 ships, this item will show the amber "⚠ eBay Category Needed" badge on the sale detail page, which is exactly the right behavior. You'll need to set the category manually in the item editor.

---

**S463** (2026-04-14) — Static eBay category picker retired, eBay sync architecture spec, roadmap audit ✅
- **Live eBay category picker shipped:** `EbayCategoryPicker.tsx` now calls the Taxonomy API as you type (400ms debounce), shows real leaf categories with IDs from eBay. The old 120-entry static JSON (with wrong IDs on several categories) is gone. `ebayCategoryMap.ts` deleted. `getEbayCategoryId()` and all 3 call sites removed. New `GET /api/ebay/taxonomy/suggest?q=...` endpoint added.
- **eBay sync architecture spec:** The sequential GetItem enrichment loop (86 API calls, ~9 seconds) should be replaced with `GetMultipleItems` Shopping API (5 calls, ~1-2 seconds). Webhook code to retire the 15-min polling cron already partially exists. Next dev dispatch: implement the batch refactor.
- **Roadmap updated to v105:** Human QA marks added for S450 rank display, S451 dashboard layout, S454 Hunt Pass Stripe, S456 eBay import, S461 Contigo push.
- **QA deferred:** You indicated you'll Chrome-QA S462 listing parity yourself. Any failures become S464 fix items.

---

**S462** (2026-04-14) — eBay Listing Data Parity (Phases A + B + C shipped) ✅ (pending Chrome QA)
- **The problem you caught:** Our FAS-pushed Contigo mug showed "Free Standard Shipping" and "Grand Rapids, MI" pickup — both wrong. Meanwhile, a native eBay listing from the same account (Spawn #4 comic) showed real calculated shipping, the correct Fox Island pickup location, rich HTML description, 18+ item specifics, catalog match, and "or Best Offer." Our push was technically working but producing low-credibility listings. Your call: "i'd rather be right than fast."
- **What shipped (Phase A — code-only fixes):**
  - Merchant location now queries your real eBay location first, falls back to the Sale's structured address, never hardcodes Grand Rapids.
  - Business policy picker filters to EBAY_US marketplace + prefers the policy you marked as default (not `[0]` alphabetized).
  - HTML descriptions now sanitize instead of strip — rich formatting carries through to eBay.
  - Condition description builds from grade + notes + description excerpt + tags (used to be enum-only).
  - Secondary category auto-adds for vintage/antique/handmade/rare/collectible tags.
- **What shipped (Phase B — schema additions, 17 new Item fields + 2 EbayConnection fields):**
  - Package dimensions (weight oz, L/W/H, package type) → unlocks real calculated shipping.
  - Product identifiers (UPC, EAN, ISBN, MPN, brand, EPID) → unlocks catalog match + product ratings box.
  - Best Offer opt-in (with auto-accept/auto-decline thresholds) — opt-in only, never forced.
  - Condition notes, secondary category, subtitle (55-char paid upgrade).
  - Organizer-facing "Edit eBay" form on the post-sale panel with 3 collapsible sections (Product Details / Shipping / Offers), client validation (UPC 12 digits, ISBN 10/13), dark mode, sage palette.
- **What shipped (Phase C — new service layer):**
  - eBay Taxonomy API integration with 24h cache (`get_item_aspects_for_category`).
  - eBay Catalog API search by GTIN or MPN+brand → returns top 3 matches for catalog hit.
  - Haiku-powered "Auto-fill" suggest for brand/UPC/MPN from title + description + tags. Skips already-filled fields. Labeled "Auto-fill" per your rule — never says "AI."
  - 3 new endpoints: `/api/ebay/taxonomy/aspects/:categoryId`, `/api/ebay/catalog/search`, `/api/ebay/suggest/identifiers`.
- **Answers to your four decisions:** (1) Phase B+C now ✅ (2) HTML allowlist = standard safe tags + tables for comic-seller specs ✅ (3) Best Offer opt-in only ✅ (4) Missing Sale.address blocks push with clear error ✅.
- **Migration ran:** `add_ebay_listing_parity_fields` applied to Railway production DB. All fields nullable/defaulted — existing items unaffected.
- **Rollback plan:** code revert reverses Phases A+C cleanly. Phase B migration is additive/nullable so rollback is non-destructive.
- **Chrome QA queued for you** — you asked to drive the QA. Test flows: (1) push a Contigo-like item with UPC + package dimensions + Best Offer enabled, verify eBay shows calculated shipping + catalog match + offer button. (2) push an item with zero package dims → confirm "Calculated shipping unavailable" warning (or block, depending on policy). (3) open "Edit eBay" panel, click Auto-fill, verify brand/UPC suggestions. (4) verify merchant location reads your real eBay location, not Grand Rapids.
- **Files pushed:** 12 (schema.prisma, migration.sql, ebayController.ts, itemController.ts, ebayTaxonomyController.ts + service + routes, index.ts, PostSaleEbayPanel.tsx, package.json, pnpm-lock.yaml, ADR doc).

---

**S461** (2026-04-14) — eBay push end-to-end WORKING (6 rounds of fixes) ✅
- **Verified live:** Contigo Stainless Steel Travel Mug published to eBay successfully. Category 177006 (Mugs), condition NEW_OTHER (after retry), Brand="Contigo" + Color="Black" auto-filled from title.
- **Why it kept breaking:** Each fix revealed the next layer. (1) Static map returned branch categories, not leaf IDs. (2) No API call for items we created ourselves. (3) Taxonomy API required app token, not user token. (4) `LIKE_NEW` is media-only and was being sent for hard goods. (5) Even after (4), stale offer state from earlier failures persisted. (6) eBay categories require specific item aspects (Type, Brand, Color) that we weren't sending.
- **Fix 1 ✅:** Capture eBay's numeric CategoryID on import and prefer it on push.
- **Fix 2 ✅:** For items we create in FindA.Sale, call eBay Taxonomy API to get a real leaf category from the title.
- **Fix 3 ✅:** Swapped Taxonomy call from user token → app token (user token lacks `commerce.taxonomy` scope).
- **Fix 4 ✅:** Grade "Like New" (A) now maps to `USED_VERY_GOOD` instead of `LIKE_NEW` (media-only). Before every push we hit eBay's condition-policies API and auto-remap if needed. Cached in memory.
- **Fix 5 ✅:** Three safety nets — (a) GET inventory_item back after PUT and log `sent=X stored=Y`, (b) if existing offer has wrong categoryId, DELETE and recreate, (c) 25021 retry loop walks remaining accepted conditions until one publishes.
- **Fix 6 ✅:** Programmatic required-aspect population. Before publish, call Taxonomy API `get_item_aspects_for_category` to get required aspects for the target category. Smart-fill from title/description with keyword matching. Brand defaults to "Unbranded" if available, FREE_TEXT non-brand defaults to "Unspecified", SELECTION_ONLY defaults to first enum value.
- **Verification log excerpt:**
  ```
  [eBay RequiredAspects] category 177006: 3 required (Type, Brand, Color)
  [eBay AspectFill] Brand="Contigo" (auto-filled)
  [eBay AspectFill] Color="Black" (auto-filled)
  [eBay Retry25021] succeeded with condition=NEW_OTHER
  ```
- **Known minor issues (queued, not blocking):** USED_VERY_GOOD false-positive from Metadata API (retry loop handles it, one wasted API call per push). Static EbayCategoryPicker still in use. `ebayCategoryMap.ts` is dead code. In-memory caches clear on Railway restart.
- **Queued for next session:** Retire static picker (use live Taxonomy search), delete dead `ebayCategoryMap.ts`, optionally persist condition/aspect caches to DB, cache last-successful condition per category, end-to-end organizer QA across book / clothing / furniture categories.

---

**S460** (2026-04-14) — eBay push UI everywhere, QR watermark default, photo import fix, post-sale workflow:
- **eBay push button now in 3 places:** Sale detail page (new), Edit Item page, Review & Publish page. Before today, the only way to push to eBay was via a hidden API call — no UI existed.
- **QR watermark is now the default for all eBay photos** — every photo pushed to eBay has a QR code pointing back to `finda.sale/items/{itemId}` + your organizer name. Works for both push and CSV export.
- **Photo import bug fixed** — sync was skipping items that already had 1 photo. Now enrichment always fetches all photos for partially-synced items.
- **Post-sale eBay panel built** — when a sale ends, you'll get a soft toast: "X items didn't sell — ready to list on eBay?" The panel shows each unsold item with a shipping badge (shippable/heavy/fragile), lets you check items to push, and has a "Too heavy to ship?" toggle to flag items you don't want to ship.
- **Shipping classification:** Items are automatically tagged SHIPPABLE/HEAVY/FRAGILE/UNKNOWN from their category and tags. You can override per item.
- **eBay push: no tier gate** — confirmed ungated. Any organizer with eBay connected can push.
- **TS build error fixed** (line 257 in sales/[id]/index.tsx) — bad comparison removed.
- **⚠️ Run migration below before testing the post-sale panel.**

**S459** (2026-04-14) — eBay webhook confirmed + enrichment fully operational:
- **ORDER_CONFIRMATION webhook** ✅ — Per-organizer subscription working. The 409 in logs = correct (subscription already exists from first connect). No action needed.
- **eBay photos now syncing** ✅ — Items showing 4–22 photos each. Categories populated (Comics, Golf, Magazines, Tobacciana, etc.)
- **Shopping API killed, Trading API GetItem in use** — eBay's old Shopping API was silently returning empty responses (retired). Replaced with Trading API GetItem calls, 5 concurrent, fire-and-forget after HTTP response.
- **Timeout error fixed** — Sync now responds immediately with item count. Enrichment runs in background. When done, you'll get a toast: "Photos and details synced for X eBay items."
- **`&amp;` in categories** — eBay returns HTML-encoded category names. Will be fixed next session (cosmetic).
- **Two inventory page bugs queued for next session** — images need hard refresh, no click/edit on cards.

**S458** (2026-04-14) — Pull to Sale UX + eBay GetItem enrichment:
- **Toast on pull** ✅ — "Item added to [sale name]" on pull confirm
- **Sale title in Add Items header** ✅ — was using `sale.name` (wrong), fixed to `sale.title`
- **GetItem enrichment pass** — after sync, calls eBay `GetItem` with `DetailLevel=ReturnAll` for each item missing description/category/tags. Backfills from full eBay item data. (GetMyeBaySelling doesn't return these fields — this was the root cause of empty item cards.)
- **Photo fallback** — `ItemPhotoManager.tsx` now has `onError` retry with raw URL for eBay CORS edge cases
- **⚠️ Architecture concern:** GetItem 1-per-item is a stopgap. Next session: architect designs proper batch sync using `GetItems` (20/call) + eBay Platform Notifications for real-time sold events.

**S457** (2026-04-14) — Pull to Sale P2011 crash fixed + inventory filter:
- `embedding: []` added to `pullFromInventory` create — was causing Prisma P2011 null constraint crash on every pull attempt
- `inInventory: true` filter added to `getInventoryItems` — was returning entire sale history instead of only inventory items
- `conditionGrade` now copied when pulling an item to a sale

**S456** (2026-04-14) — eBay inventory import fully operational:
- **86 eBay listings imported with photos** ✅ — Trading API (GetMyeBaySelling) working. Photos from eBay show correctly on `/organizer/inventory`.
- **Sync is now idempotent** — re-sync correctly shows 0 new items (duplicate detection fixed).
- **81 duplicate items cleaned up** from Railway DB directly (from the previous failed sync attempts).
- **eBay photos were blocked by Next.js CSP** — `i.ebayimg.com` added to image domains and `img-src`. Now visible.
- **`sell.fulfillment` scope added** to eBay OAuth — stops the 403 errors in sync cron logs. Artifact MI should disconnect + reconnect eBay once to get updated token.
- **⚠️ "Pull to Sale" not working** for eBay-imported inventory items — confirmed broken, fix is P0 next session.

**S455** (2026-04-13) — eBay inventory import, library→inventory cleanup, OAuth/cart fixes:
- **eBay "Sync Inventory" button live** on Settings → eBay tab. Pulls all eBay listings into `/organizer/inventory` as persistent items. Deduplicates by SKU on re-sync.
- **"Library" terminology fully eliminated:** All code, files, hooks, components renamed to "inventory." `inLibrary` DB field renamed to `inInventory` via migration.
- **Google/Facebook OAuth auto-link:** Accounts created with email+password can now log in with Google or Facebook (same email). Previously rejected with a 400 error.
- **OAuth mobile race condition fixed:** Login with Google/Facebook on mobile no longer gets stuck loading.
- **Cart isolation fixed:** Each user's cart is isolated by user ID. Logging out clears the cart. Previous user's cart no longer bleeds to next user.
- **eBay redirect fixed:** After eBay OAuth, now correctly lands on FindA.Sale settings page (not Railway backend 404).
- **eBay policy scope fixed:** `sell.account` scope added — Artifact MI needs to disconnect + reconnect eBay to get a new token with this scope.
- **Add-items page:** Sale name now shown in header. Walkthrough modal explains Rapidfire vs Regular mode on first visit. All "AI" branding removed from copy.

**⚠️ Artifact MI action required:** Disconnect and reconnect eBay account after deploy (Settings → eBay → Disconnect, then reconnect).

**S453+S454** (2026-04-13) — Hunt Pass → real recurring subscription. Stripe go-live audit.
- **Hunt Pass is now a real Stripe Subscription** ($4.99/mo auto-renewing). Old PaymentIntent flow removed entirely. Users click "Subscribe" → redirected to Stripe Checkout → webhook activates pass. Cancel at period end supported.
- **Subscription ID persistence fixed (P0):** `stripeSubscriptionId` was never being saved → billing portal and cancel always failed. Fixed in `syncTier.ts`.
- **Pricing page endpoint fixed (P0):** `pricing.tsx` was calling the broken checkout endpoint (orphaned Stripe customers). Now correctly calls `/billing/checkout`.
- **POS product catalog guard:** New env var `STRIPE_GENERIC_ITEM_PRODUCT_ID` — when set, all POS payment links reuse one generic product instead of creating new ones per item. Keeps Stripe catalog clean.
- **pricing.tsx null byte build error fixed.**
- **Migration deployed:** `huntPassStripeCustomerId` + `huntPassStripeSubscriptionId` added to User table.

**S452** (2026-04-13) — eBay + Stripe go-live prep. Bidirectional eBay sync (both directions). Policy ID fetch post-OAuth. endEbayListingIfExists wired into all 5 SOLD paths. Phase 3 polling cron (15-min). Stripe env confirmed. **Hunt Pass is a subscription — investigation required next session.**

**S451** (2026-04-13) — Dashboard layout fixed, QR inline, broken buttons fixed:
- **⚠️ Catastrophic push recovered:** Git index desync wiped 1,708 files. Recovery complete via `git add -A`. All files restored.
- **Dashboard layout now correct:** Hero → Action Buttons → QR Panel (inline toggle) → Hunt Pass strip → Tabs → Content
- **Browse Sales removed** (was 404ing). **Button routes fixed:** Collections → `/shopper/wishlist`, Purchase History → `/shopper/history`
- **My QR button** added to action row — QR expands inline below buttons, no more separate card
- **Initiate icon:** sprout → Compass
- **Purchases tab removed** (redundant). Referral banner removed (stale). Saved items banner removed.
- **Pending Patrick decision:** Followed Brands tab — brand tracking for item alerts — keep, rename, or remove?

**S450** (2026-04-13) — Rank staleness P0 fixed, dashboard character sheet attempt, organizer badge, /shopper/ranks:
- **P0 rank staleness FIXED:** `explorerRank` removed from JWT entirely. `AvatarDropdown` now calls `useXpProfile()` API hook for fresh rank on every render. Cascade fixes in `useXpSink`, `haul-posts`, `items/[id]`, `dashboard` (5 files updated).
- **Tier names LOCKED:** Initiate → Scout → Ranger → Sage → Grandmaster (0/500/2000/5000/12000 XP). "Hunter" was wrong — Ranger confirmed.
- **AvatarDropdown XP progress bar:** XP progress bar now shows below rank badge in dropdown using `rankProgress.currentXp / rankProgress.nextRankXp`.
- **Dashboard character sheet attempt:** `RankHeroSection`, `ActionBar`, `RankLevelingHint` built. Dashboard reordered. **BUT QR code landed at position 7 (near bottom) — this is wrong. QR is how shoppers pay at POS. Fix is first job next session.**
- **`/shopper/ranks` page:** All 5 ranks shown with perks + "you are here" indicator. Linked from loyalty page.
- **Organizer Special badge:** `maxOrganizerDiscount` on SaleCard + sale detail page. 4 backend feed endpoints updated.
- **Specs created:** `claude_docs/design/RANK_PERKS_DISPLAY_SPEC.md`, `claude_docs/UX/SHOPPER_DASHBOARD_RETHINK_UX_SPEC.md`

**S449** (2026-04-13) — Full rank perks system + P0/P1/P4 fixes:
- **Rank perks system shipped:** `rankUtils.ts`, hold enforcement (rank-based duration snapshot), wishlist cap (server-side), legendary early access (0/0/2/4/6h by rank), Hall of Fame endpoint + page, RankBenefitsCard + RankUpModal, `getRankDashboardConfig()`
- **3 new migrations:** rankUpHistory, holdDurationMinutes, legendary fields — need Railway deploy
- **Rank staleness P0:** JWT rank sync + AuthContext.updateUser() — nav rank updates live on XP earn
- **Scout Reveal:** interestedUsers returned + results panel on item page
- **Organizer discount badge:** Teal pill on item detail + subtle pill on sale listing cards
- **Haul post test data seeded:** 3 posts for Alice (IDs 2-4) — Bump Post + Haul Unboxing QA-ready
- **Two push blocks** — first (10 files, S449 P0-P4), second (20 files, rank perks system)

**S448** (2026-04-13) — QA audit + Scout Reveal bug + rank naming locked:
- Scout Reveal is a hollow stub — XP spent, toast fires, nothing revealed. Backend never queries interest data. Full flesh-out queued for S449.
- Rank naming locked: **Initiate → Scout → Ranger → Sage → Grandmaster** (prior session dropped Initiate — that was the error; Ranger was always correct)
- "Save Passport" → "Save Profile" copy fix shipped
- Stripe sandbox: COMPLETED ✅
- Bump Post + Haul Unboxing: unverified (no test haul posts in DB)

**S447** (2026-04-13) — 3 dispatch batches, all shipped ✅

**S446** (2026-04-13) — XP frontend + workspace invite flow:
- Hunt Pass cancellation wired to Stripe webhook (exploit gate closed)
- XP earning rates + coupon tiers updated across 6 frontend pages
- 3 micro-sinks: Scout Reveal (5 XP), Haul Unboxing Animation (2 XP), Bump Post (10 XP)
- Organizer-funded discounts: 200/400/500 XP = $2/$4/$5 off; blocks shopper coupon stacking
- Workspace magic link invite: `/join?token=` page, Resend email, MyTeamsCard on dashboards, welcome banner
- WorkspaceMember schema properly fixed: `organizerId` nullable, `userId` added — no ghost organizer accounts for shoppers/new users
- ⚠️ Bump Post feed sorting pending (DB field set, feed sort not yet implemented)

**S445** (2026-04-13) — XP economy redesign + workspace flows:
- 5 P0 fraud gates shipped (appraisal cap, referral gate, HP claw-back, device fingerprinting, chargeback)
- Workspace invite banner, staff delete, owner permissions gate, template fixes

**S444** (2026-04-13) — STAFF→MEMBER rename + workspace permissions fix.

---

## Action Items for Patrick

**S490 wrap push (do this now):**

```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add packages/frontend/public/organizer-video-ad.html
git add packages/frontend/public/video.html
git add packages/frontend/components/Layout.tsx
git add packages/frontend/pages/_document.tsx
git commit -m "S490: video polish (scene nav, lamp, beam, fonts, CTA), landing page, two-tone Montserrat logo"
.\push.ps1
```

**Delete manually from repo root** (cannot be deleted programmatically — these are superseded):
- `finda-sale-landing.html`
- `organizer-video-ad.html`
- `The_True_Plan.md`

---

**✅ All S464 manual actions COMPLETE (verified S465).** Migration run, Vercel + Railway env clean, all live Stripe keys/IDs confirmed by screenshot.

**✅ All Go-Live env blockers CLOSED (S465).** Live webhooks registered, signing secrets match, publishable key is `pk_live_...`, `STRIPE_HUNT_PASS_PRICE_ID` and `STRIPE_GENERIC_ITEM_PRODUCT_ID` are live values, Resend + MailerLite keys present on Railway.

**Remaining open checklist items (non-blocking):**
- [ ] **Archive junk Stripe test products** (P3) — keep: Hunt Pass, Teams, Pro, Item Sale. Delete the rest.
- [ ] **Chrome QA walkthrough:** eBay push with book/clothing/furniture items (beyond Contigo), PostSaleEbayPanel on an ENDED sale, watermark layout after S465 fix (QR above text, no overlap).

**Carry-forward from S463:**
- [ ] **STEP 2 Broader category test:** Push a book, clothing item, and furniture item to verify Phase A/B/C holds
- [ ] **STEP 0 Chrome QA:** Walk S462 eBay listing parity (PostSaleEbayPanel → Edit eBay → Auto-fill → Push)

**NEW — S461 Session wrap push block (do this now):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/.last-wrap
git add claude_docs/audits/brand-drift-2026-04-14.md
git add claude_docs/design/SHOPPER_DASHBOARD_RETHINK_UX_SPEC.md
git add claude_docs/feature-notes/adr-ebay-sync-architecture.md
git commit -m "docs(s461): wrap eBay push fixes (6 rounds) + brand audit + shopper dashboard spec + eBay sync ADR"
.\push.ps1
```

*(Note: eBay Fix 6 code in `ebayController.ts` was already pushed and verified live during S461 — no code files in this wrap push.)*

**NEW — S460 Push block (do this now):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/components/InventoryItemCard.tsx
git add packages/frontend/lib/useEbayConnection.ts
git add "packages/frontend/pages/organizer/sales/[id]/index.tsx"
git add "packages/frontend/pages/organizer/edit-item/[id].tsx"
git add "packages/frontend/pages/organizer/add-items/[saleId]/review.tsx"
git add packages/frontend/components/PostSaleEbayPanel.tsx
git add packages/backend/src/controllers/ebayController.ts
git add packages/backend/src/services/exportService.ts
git add packages/backend/src/utils/ebayShippingClassifier.ts
git add packages/backend/src/routes/ebay.ts
git add packages/database/prisma/schema.prisma
git add "packages/database/prisma/migrations/20260414_ebay_shipping_classification/migration.sql"
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat: eBay push UI, QR watermark default, photo import fix, post-sale workflow, shipping classification"
.\push.ps1
```

- [ ] **Run S460 migration:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```
- [ ] **After deploy:** Settings → Sync eBay Inventory — enrichment pass now includes items with ≤1 photo, pulls all eBay photos
- [ ] **Artifact MI: disconnect + reconnect eBay** — gets new token with `sell.fulfillment` scope (stops 403 cron errors)
- [ ] **Run S455 migration** (still pending — `inInventory` rename + `isInventoryContainer` + `lastEbayInventorySyncAt`):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```
- [ ] **git rm old library files** (from S455 rename):
```powershell
git rm packages/backend/src/services/itemLibraryService.ts
git rm packages/backend/src/controllers/itemLibraryController.ts
git rm packages/backend/src/routes/itemLibrary.ts
git rm packages/frontend/hooks/useItemLibrary.ts
git rm packages/frontend/components/LibraryItemCard.tsx
```

**NEW — S454:**
- [ ] **Add to Railway env vars:** `STRIPE_HUNT_PASS_PRICE_ID=price_1TLtY1LIWHQCHu75W9F23hVJ` (live)
- [ ] **Add to Railway env vars:** `STRIPE_GENERIC_ITEM_PRODUCT_ID=prod_UKZ2G21VhLJ3CE` (live)
- [ ] **Archive junk Stripe sandbox products** — keep only: Hunt Pass, FindA.Sale Teams, FindA.Sale Pro, FindA.Sale — Item Sale
- [ ] **Set up live Stripe webhooks** — live account has no webhooks yet (see S455 next session)
- [ ] ~~**Tell Claude your real organizer email**~~ — `survivor-seed.ts` already created (see Standing Notes)

**Carry-forward:**
- [ ] **Add `STRIPE_CONNECT_WEBHOOK_SECRET`** in Railway — Stripe Dashboard → Webhooks → Connected accounts endpoint
- [ ] **Decide: Followed Brands tab** — keep as "Brand Alerts", rename, or remove?
- [ ] **Decide: Sales Near You** — fix or remove permanently?
- [ ] **Decide: Bounties rewards — dollars, XP, or both?** (S440 open, still blocking)

---

## XP System — Current State

**Coupon tiers (locked D-XP-001):**
- 100 XP → $0.75 off $10+ | 2x/mo standard, 3x/mo Hunt Pass
- 200 XP → $2.00 off $25+ | 2x/mo standard, 3x/mo Hunt Pass
- 500 XP → $5.00 off $50+ | 1x/mo all users

**Micro-sinks (new S446):**
- Scout Reveal: 5 XP → see who flagged interest first on an item
- Haul Unboxing: 2 XP → celebratory animation on haul post share
- Bump Post: 10 XP → bumps haul post to feed top for 24h (feed sort pending)

**Organizer-funded discounts (new S446):**
- Spend 200/400/500 XP in item edit → puts $2/$4/$5 off the item
- Shopper coupon doesn't stack — best single discount wins

---

## What's Next (S466+)

**✅ Go-Live env gate CLOSED (S465).** All P0 and P1 environment blockers cleared:
- S464 migration applied
- Live Stripe webhooks registered (both endpoints, correct events)
- Signing secrets match Railway env
- `pk_live_...` publishable key on Vercel
- Live `STRIPE_HUNT_PASS_PRICE_ID` + `STRIPE_GENERIC_ITEM_PRODUCT_ID` on Railway
- Resend + MailerLite keys present on Railway

Live payments can now transact end-to-end. Remaining work is behavioral QA (Chrome walkthroughs) and a Stripe catalog cleanup — not blockers.

**P1 — Patrick Chrome QA:** Walk S462/S463/S464 eBay flow (PostSaleEbayPanel → Edit eBay → Auto-fill → Push). Also test: push an item with no good eBay leaf category → verify amber badge.

**P1 — Broader category test:** Push a book, clothing item, furniture item to verify Phase A/B/C holds beyond Contigo.

**P2 — eBay sync batch refactor:** Replace sequential GetItem loop with `GetMultipleItems` batches (20/call). 86 API calls → 5. Dev dispatch ready (spec from S463).

**P2 — Vercel/Railway env cleanup** (see Action Items).

**Carry-forward:**
- QA queue (S436/S430/S431/S427/S433) — still postponed
- Bump Post feed sort (Architect sign-off in place, dev pending)
- RankUpModal — not connected to AuthContext rank-change yet
- Legendary item flag — no organizer UI yet

---

## Recent Sessions

| Session | Date | Summary |
|---------|------|---------|
| S465 | 2026-04-14 | Roadmap graduation audit (31 features to SHIPPED & VERIFIED, v107). #245 Feedback Widget → Rejected. STATE.md compacted 1603→150 lines. S428–S449 archived to COMPLETED_PHASES.md. |
| S464 | 2026-04-14 | ebayNeedsReview flag + amber badge, billing webhook secret fix, Stripe price IDs from env vars, two-pass 25005/25021 retry, offer PUT merge fix, roadmap v106 |
| S463 | 2026-04-14 | Live eBay category picker shipped (Taxonomy API), ebayCategoryMap.ts deleted, eBay sync batch architecture spec (GetMultipleItems), roadmap audit v105 |
| S462 | 2026-04-14 | eBay Listing Data Parity A+B+C: merchant location fix, policy picker, HTML sanitizer, 17 schema fields, PostSaleEbayPanel, taxonomy service, catalog API, Auto-fill suggest |
| S461 | 2026-04-14 | eBay push end-to-end WORKING (6 rounds): CategoryID capture, Taxonomy API, app-token fix, condition remap, stale offer cleanup, 25021 retry, required aspect auto-fill. Contigo mug published ✅ |
| S460 | 2026-04-14 | eBay push UI (3 locations), QR watermark default, photo import fix, PostSaleEbayPanel, shipping classification. 13 files. |
| S457 | 2026-04-14 | Pull to Sale fixed: embedding[] in create, inInventory=true filter in list query. |
| S456 | 2026-04-14 | eBay import fully working: Trading API auth, xmlVal regex fix, photos via GranularityLevel=Fine, CSP fix, 81 dupes removed. |
| S455 | 2026-04-13 | eBay sync button, library→inventory rename, Google OAuth auto-link, cart isolation fix. |
| S454 | 2026-04-13 | Hunt Pass → Stripe Subscription. Pricing page P0. POS catalog guard. |
| S452 | 2026-04-13 | eBay bidirectional sync: policy fetch, offer withdrawal, Phase 3 cron. Stripe env audit. Hunt Pass subscription gap flagged. |
| S451 | 2026-04-13 | Dashboard layout fix: QR inline, action buttons fixed, Compass icon, layout reordered. Catastrophic git push (1,708 files deleted) — recovered. |
| S450 | 2026-04-13 | Rank staleness P0 (JWT fix), dashboard character sheet attempt, /shopper/ranks, organizer badge, XP progress bar in nav. QR code landed wrong — fix is P0 next session. |
| S449 | 2026-04-13 | Rank staleness P0, Scout Reveal P1, discount badge P4, dashboard/perks specs, haul test data. 10 files. |
| S448 | 2026-04-13 | QA audit. Scout Reveal bug ID'd. Rank naming locked. 1-line fix. |
| S447 | 2026-04-13 | 3 dispatch batches: Early Access Cache, XP expiry, bump sort, cosmetics repricing, coupon enforcement, nav renames. |
| S446 | 2026-04-13 | XP frontend, 3 micro-sinks, organizer discounts, workspace magic link invite, WorkspaceMember schema fix |
| S445 | 2026-04-13 | XP economy redesign + 5 fraud gates + workspace invite flow |

---

## Brand Audit (still open) — Updated 2026-04-14

⚠️ **P0 SharePromoteModal has now been flagged 3 consecutive weeks** — still unresolved. Garage/auction/flea market organizers sharing via Nextdoor/Threads get "estate sale" copy. 1 existing function (`saleTypeLabel()`) already exists in that file — fix is ~10 lines.

**Current violation count: ~22 active** (was ~20 last week, +3 new, -1 fixed)

**New since last audit:**
- `subscription.tsx:205/517` — PRO upgrade copy says "large estate sale or auction" — ignores garage/flea market organizers
- `condition-guide.tsx:56` — Condition FAQ says "The estate sale organizer" — applies to all organizer types
- `organizers/[id].tsx` — 4 dark mode violations (missing `dark:` variants on header card and empty state) + 1 D-003 violation (empty state has no CTA)

**Fixed this cycle:** `typology.tsx` — 2 violations resolved ✅

Full audit: `claude_docs/audits/brand-drift-2026-04-14.md`

All ~25 fix items are dispatch-ready to `findasale-dev` — no decisions needed. Batches grouped in the audit file.
