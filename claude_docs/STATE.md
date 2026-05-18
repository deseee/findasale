# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S758 — GEO & Discoverability Implementation Plan (COMPLETE).**

Analyzed cross-session GEO/AI Discoverability strategy prompt against existing codebase. Found significant infrastructure already built (JSON-LD on 22 files, robots.txt, llms.txt, MCP server with 7 tools, city landing pages with SSR). Created 12-phase implementation plan + 5-item research queue + 4 GTM strategy notes (`claude_docs/strategy/geo-implementation-plan.md`). Added 29 roadmap entries #432–#460 covering the complete GEO stack: Phases 1-8 (core funnel), Phase 9 (compounding data assets), Phase 10 (demand intelligence), Phase 11 (data trust: auto-expire stale scrapes + confidence scoring with MCP filter — CRITICAL defensive infrastructure), Phase 12 (platform syndication formatter + end-of-sale auto-liquidation). Research queue R1-R5. GTM notes: build-in-public case study, Product Hunt as infrastructure launch, developer bounty program, weekly wrangler audit. No code changes this session — planning only.

**Previous: S757 — Production DB Cleanup (COMPLETE).**

Removed test/QA data from the Railway production database. Deleted 5 test sales (QA Test Auction, QA Settlement Test Sale, QA Dims/Weight Test, 2 stale ENDED Artifact Downtown copies) and 13 items, plus all cascaded FK records (bids, donated items, line entries, purchases, ripples, settlements, etc.). Nintendo Power item moved from ENDED Artifact copy into the live Artifact Downtown Paw Paw sale (now 100 items). eBay Inventory draft (empty, 0 items) also removed. Scraped directory (26,189 sales) and all organizer accounts untouched. No code changes this session.

**Previous: S756 — Pipeline DB Verification + WARM Email Gap Root Cause + Cron Fix (COMPLETE).**

Completed the S754/S755 deferred pipeline DB verification via psycopg2 (workspace bash now available). Pipeline confirmed healthy: 29 emails sent since S754 fix deployed (May 17-18), on pace at ~48/day matching warmup schedule. Deleted 31 junk BOUNCED DirectoryClaimEmail rows (26 image filenames stored as emailAddress, 5 Patrick test emails — all had attemptCount=0, never actually sent). directoryMostRecentSource confirmed 87.7% tagged. Confirmed #336 and #339 already fully implemented (roadmap rows updated). Identified and fixed WARM email gap bottleneck: switched website enrichment cron from weekly (Sundays only) to daily.

**Previous: S755 — QA Ceiling Session: 6 Bug Fixes from S752/S753 Backlog (COMPLETE).**

Mandatory QA session (Blocked Queue ≥8 items, CLAUDE.md §4 ceiling rule). Pipeline live audit partial (workspace bash unavailable entire session — no DB queries possible). Railway deploy confirmed SUCCESS, all crons firing clean, Vercel frontend READY. Six bugs fixed via 4 parallel dev agents + 1 inline fix. Patrick corrected: #307 is "Retail Mode" (renamed from Shop Mode), TEAMS-only by design — not a bug for PRO tier, dropped from fix batch.

**Fixes shipped (10 files):**

- **`packages/frontend/pages/organizer/dashboard.tsx`** — #305 Social Posts no-op: replaced broken `<Link>` to `/organizer/promote/` with `<button onClick>` that opens SocialPostGenerator modal inline. Import + state + modal rendering added.
- **`packages/frontend/pages/shopper/dashboard.tsx`** — #265 Share & Earn card: referral CTA dismissal changed from permanent (`'true'`) to 7-day timestamp expiry. Card re-appears after 7 days.
- **`packages/frontend/tailwind.config.js`** — #275 Hunt Pass ring: added `safelist` with `ring-2`, `ring-amber-400`, `ring-amber-500`, `dark:ring-amber-500` to prevent Tailwind purging dynamic classes.
- **`packages/frontend/components/Avatar.tsx`** — #275 Hunt Pass ring: added inline `boxShadow` fallback when `huntPassActive` is true, ensuring amber ring renders even if Tailwind classes purged.
- **`packages/backend/src/controllers/leaderboardController.ts`** — #275 Hunt Pass leaderboard: changed `where: { role: 'USER' }` to `where: { roles: { has: 'USER' } }` so dual-role users appear on shopper leaderboard.
- **`packages/frontend/pages/shopper/league.tsx`** — #275 Hunt Pass badge: fixed CSS conflict on badge span (`inline-block flex` → `inline-flex`).
- **`packages/frontend/pages/sales/[id].tsx`** — #292 ENDED-sale UX: replaced misleading "All items sold or reserved" with accurate item breakdown ("5 items · 2 sold · 3 available").
- **`packages/frontend/pages/organizer/settings.tsx`** — #306 Store Hours persistence: `handleSaveHours` now refetches hours from server via `GET /organizers/me/hours` after successful save.
- **`packages/database/prisma/seed.ts`** — Subscription copy: fixed misleading console.log labels for orgTiers (actual data was correct, only log output was wrong).

**Note:** TypeScript checks could not run (workspace bash unavailable). Vercel/Railway builds will be the TS gate.

**#307 Retail Mode:** Patrick confirmed this is TEAMS-only by design. PRO users correctly see it disabled. Needs Chrome QA on a TEAMS account to verify it works there — added to Blocked Queue.

**Pipeline audit status (S754 verification — PARTIAL):**
- ✅ Railway backend deploy SUCCESS, crons firing clean
- ✅ Vercel frontend READY
- ⚠️ DB queries blocked (workspace bash unavailable) — outreach rate limit, digest suppression, directoryMostRecentSource backfill quality all UNVERIFIED
- ⚠️ Storefront ENDED sales — code deployed but no organizer with actual ENDED sales found to visually confirm

**Previous: S754 — Scraper/Enrichment Pipeline Audit + Gmail Rate Limit Fix (COMPLETE).**

S754 shipped 8 pipeline fixes: outreach rate limit (sleep 1100ms), digest suppression for @system.finda.sale, storefront ENDED sales visibility, HOT-first enrichment, directoryMostRecentSource backfill, Foursquare category filter, DuckDuckGo fallback. Investigation closed: GSalr.com (ToS $10k/day penalty, syndicated from estatesales.org).

**Previous: S753 — Chrome QA Backlog Sprint Continued (COMPLETE).**

Continued the S752 main-session Opus Chrome QA approach (~3-5k tokens/feature). Verified 13 Pending Chrome QA items across public, organizer (user2 PRO Bob Smith), and shopper (user12 Hunt Pass Leo Thomas) roles. Found 1 P1 (Hunt Pass cosmetics fully broken), 1 P2 (referral card not visible on dashboard), 1 P3 (Settlement sale message inconsistency). All S752 bugs (#306, #305 button, #307, subscription copy) remain unfixed — no dev work was dispatched this session, pure QA.

**Chrome QA Verified ✅ (13 items):**
- #259 Hunt Pass page accuracy (re-confirm, was S530)
- #260 À La Carte $9.99 callout on /organizer/pricing
- #271 TEAMS solo differentiator (webhooks copy)
- #263 Insights nav route — `/organizer/insights` renders "Your Sales Analytics" (3 sales, $500 revenue, 11.1% conversion, per-sale breakdown)
- #263 Brand Kit nav route — `/organizer/brand-kit` renders full page (Social Links, Logo, Storefront URL, Brand Colors, PRO Advanced)
- #302 Email Verification Banner — amber "Check your inbox" banner on user2 organizer dashboard
- #305 Share & Promote — promote page renders 8 platform Quick Share cards + EstateSales.NET/FB Marketplace/Craigslist + Flyer + Share Card; dashboard B1 teal "Your sale is live — spread the word!" banner with Copy Link + More Options
- #297 eBay Policy Sync UI — disconnected-state Connect CTA correct (active state was S480)
- #298 eBay Advanced Setup — disconnected-state Connect CTA correct (active state was S479)
- #292 Post-Sale eBay Panel soft toast — "3 items didn't sell — ready to list on eBay?" toast renders on ENDED sale
- #227 XP Profile API + Dashboard wiring — Leo Thomas dashboard shows guildXp=55, Initiate rank, 445 XP to Scout, next-rank perks listed (Scout Reveal, longer holds, 3 wishlist slots)
- #265 Rank progress next-rank benefit + /shopper/referrals page (Share & Earn, REF-419CCE51, 5 share buttons, stats 0/0/0)
- #266 Explorer Profile Rename — `/shopper/explorer-profile` renders correctly (Specialties, Categories, Keywords, Achievements 1/12)

**Bugs found this session ⚠️ (NEW):**
- **#275 Hunt Pass Cosmetic Add-ons — ENTIRE FEATURE BROKEN (P1).** Verified as logged-in user12 (huntPassActive=true confirmed via /auth/me, guildXp=55). (1) Avatar amber ring missing: DOM shows only `bg-amber-500`, no `ring-2 ring-amber-400` persistent ring class on the avatar element or its parents. (2) Leaderboard 🏆 badge missing: Leo Thomas appears at #1 (🥇) on Scout Leaderboard with 55 XP but page contains zero 🏆 emojis. The Hunt Pass page copy still promises "Golden Trophy Avatar Frame" + "Hunt Pass Leaderboard Badge — A 🏆 badge next to your name". Roadmap entry claims shipped S544. Either conditional rendering check broken, components weren't actually deployed, or loyaltyController doesn't return huntPassActive in leaderboard payload.
- **#265 Share & Earn dashboard card not visible (P2).** Card not rendered on user12 shopper dashboard despite huntPassActive=true. Likely dismissible-state stuck (localStorage shows `onboardingModalDismissed=true` from 2026-05-08 — separate flag may apply to referral card). /shopper/referrals destination page works correctly.
- **#292 ENDED-sale UX inconsistency (P3).** qa-settlement-001 page header shows "0 items / All items sold!" simultaneously with soft toast "3 items didn't sell — ready to list on eBay?". Two queries returning conflicting unsold counts.

**Pending S752 bugs still unfixed (no dev dispatched S753):**
- #306 Store Hours save persistence
- #305 Social Posts dashboard button is no-op
- #307 Shop Mode PRO visibility / TEAMS verification
- Subscription copy mismatch ("Your TEAMS plan" on PRO account)

**No code changes shipped S753.** Pure QA session — findings get routed to a dev batch next session.

**Previous: S752 — Chrome QA Backlog Sprint + Outreach Fix (COMPLETE).**

Token-efficient QA approach: main session Opus ran Chrome QA directly (~3-5k tokens/feature vs ~40-50k for Sonnet subagent dispatch). Verified 30+ features across shopper and organizer roles. Outreach query starvation bug fixed (CANDIDATE_MULTIPLIER=10, exhaustedFilter, nulls-first ordering, quota cap in send loop).

**Chrome QA Results — Verified ✅ (30+ features):**
Shopper side: Homepage (hero, search, Treasure Hunt, Sale of Day, map, Featured Sales), Sale Detail (hero, badges, gallery, share sidebar), Favorites (heart toggle), Cart (drawer from nav icon + dropdown), Dashboard (rank, XP, perks, QR, Guild onboarding, Hunt Pass upsell), Explorer Profile (name, email, bids, Hunt Pass, rank), Settings (Display, Notifications), Map (200 sales, filters, Plan Route, Heatmap), Trending (Hot Sales, Most Wanted), Leaderboard (City tabs, XP, ranks, badges).
Organizer side: Dashboard (quick actions, plan info, storefront URL, sale card action buttons, weather), POS (sale selector, search, camera scan, 6 payment methods, manual card), Print Kit (5 signs, 4 QR labels, Label Sheet Composer, 3 Interactive QR), Close Sale (confirmation modal), Holds (sale selector, sort, empty state), Subscription Settings (plan, limits, actions), Items (5 items, 4 input methods, inline editing, export), Appearance Settings (Mode, Color, Text, Accessibility, Low-Bandwidth, Watermark), eBay Settings (connect page, two-way sync), Pricing Page (hero, 6 feature cards, 3-tier pricing).
Also verified: #288 Featured Boost/Sale Bump (dual-rail XP or $1.00), Flash Deal (form + item selector), #265, #227, #275, #278, #260, #271, #263.

**Bugs found ⚠️:**
- #306 Store Hours — save doesn't persist after reload
- #305 Social Posts — button is no-op
- #307 Shop Mode — not visible on PRO tier, needs TEAMS verification
- Subscription copy mismatch — says "Your TEAMS plan" when user is on PRO

**Outreach fix:** `packages/backend/src/jobs/outreachEmailsCron.ts` — query starvation bug. Prior: each batch re-fetched same candidates, quota check outside send loop. Fixed: 10x candidate pool, exhaustedFilter excludes already-processed, nulls-first ordering, quota cap inside send loop.

**Previous: S751 — Camera Landscape Orientation Fix (COMPLETE).**

Bug: RapidCapture (both rapidfire and regular mode) didn't adapt when phone held in landscape. Two-part fix: (1) Replaced `matchMedia('change')` listener with `resize` + `screen.orientation.change` events in RapidCapture.tsx for reliable cross-browser orientation detection. (2) Changed `"orientation": "portrait"` → `"orientation": "any"` in manifest.json — the PWA manifest was locking the app to portrait so the viewport never rotated and no resize event ever fired. Files: `packages/frontend/components/RapidCapture.tsx`, `packages/frontend/public/manifest.json`. Note: users with the PWA already installed on their home screen may need to remove and re-add it for the manifest change to take effect.

**Previous: S750 — Blocked Queue QA: #362 Attendance Count + #124 Rarity Boost (COMPLETE).**

Both long-standing UNVERIFIED items closed. Migration 20260515180000 confirmed already deployed (264 migrations, none pending). Attendance count data seeded directly via psql (Railway Query tab is read-only for DML — uses psql -f flag workaround). "75 attended" verified rendering on storefront. Rarity Boost: user12 guildXp=55 via direct SQL, button enabled, modal confirmed open. Backend gap found: storefront endpoint filters to PUBLISHED sales only — attendanceCount on ENDED sales never surfaces (separate fix needed). seed.ts edits pushed but seed not re-run in production; data patched directly via SQL instead. fix-attendance.sql left in project root — delete it.

**Previous: S749 — Claim Page QA + P0 emailService Rewrite (COMPLETE).**

Claim flow QA revealed P0: ALL transactional emails across the platform were broken (SES SMTP not approved by Amazon, Railway blocks SMTP ports). Fix: rewrote `emailService.ts` from nodemailer/SMTP to Gmail API (same transport outreach already uses). Fire-and-forget pattern applied to claim route so 201 returns instantly. 35 backend services that call `emailService.emails.send()` are now unblocked. Also fixed: ClaimListingModal dark mode (P2), created `/claim` landing page (P3). Verified end-to-end: claim submit → instant success toast → verification email received at deseee@yahoo.com from `find@outreach.finda.sale`. Outreach startup catch-up also wired into index.ts this session.

**Previous: S748 — Pipeline Deep Audit + Full Fix Batch (COMPLETE).**

Opus deep audit of entire scraping + enrichment pipeline. DB-verified all numbers. Six fixes shipped: (1) `enrich-ai-metadata.yml` + `backfill-organizer-contacts.yml` created (P0 — untriggered endpoints), (2) `leadScoringService.ts` HOT OR-gate now requires email (P1 — tiers were 78% HOT), (3) `internalOrganizerContactBackfillController.ts` rewritten with cursor pagination + raw SQL eligibility (P0 — was reprocessing same 500 forever), (4) `organizerWebsiteAddressCron.ts` flipped to opt-out gate + broadened eligibility + rotation (P1 — never ran due to unset env var). Results after 3 backfill runs: addresses 46→2,919, phones +161, websites +222. Lead rescore: HOT 44,120→5,517, WARM 1,201→36,851, COLD 11,361→14,314, SUPPRESSED 5,538. Auto-seed ran green. Investigating: outreach send rate (~2/day vs expected 50/day).

**Previous: S744 — CI Infrastructure Hardening: ESN Scraper End-to-End Fix + Fleet Preventive Sweep (COMPLETE).**

Gmail flooded with 50+ GH Actions failure emails triggered a full audit. ESN scraper (`scrape-estatesalesnet.yml` + `run-estatesalesnet.ts`) required 4 sequential fixes to reach green: (1) `concurrency:` block was at workflow level referencing `${{ matrix.chunk }}` (invalid context outside a job) AND a job-level `if:` referenced `matrix.chunk` (evaluated before matrix expansion), causing "No jobs were run" with 0.0s duration on every push — moved concurrency into the job, dropped the if; (2) per-job concurrency then serialized chunks 2-4 behind chunk 1 — removed it entirely (matrix already parallelizes by default); (3) `pnpm/action-setup@v3` post-step deadlocked all 4 chunks after ingest completed, then `@v4` errored on version conflict with package.json's `packageManager` field — replaced with `corepack enable` (Node 20 builtin, no post-step); (4) `run-estatesalesnet.ts` never exited because undici keepalive sockets kept the event loop alive and stdout buffer never flushed the "Ingest complete" line — added `.then(() => process.exit(0))`. Result: all 4 chunks run parallel end-to-end, ~3-4min each, green ✅. **State licensing scrapers (27+ states):** Agent investigation of Railway logs found backend code on `main` already gracefully handles dead/blocked target URLs (commits 5c855ac0, 8af6e1df, 6e180d0d) but every Railway deploy May 14-16 failed with `Cannot find module '@findasale/database'` in `organizerWebsiteAddressCron.js`. Backend ran stale code while GH Actions hammered crashing endpoints. Commit 716414af (today 22:52 UTC) deployed clean. Live-curl confirmed: Wisconsin 200/0.3s, AZ 0.2s, WY 2.9s. Monitor next 7d for incoming failure emails. **Preventive sweep — 67 files:** Two parallel agent dispatches applied same patterns across the fleet. (1) **57 workflow files** with `pnpm/action-setup@v3` migrated to `corepack enable`; **2 `@v2` files** also fixed inline (scrape-wy-phase2.yml, scrape-ok-phase2.yml). (2) **8 fetch-using workflow-entry-point scripts** patched with `process.exit(0)`: run-eventbrite, run-search-facebook-events, run-facebook-marketplace, run-foursquare-places, run-google-places, run-here-places, run-newspaper-rss, run-osm. Gmail bulk-archive of 100+ failure emails **BLOCKED** on Gmail MCP connector lacking label-modify scope — needs reconnect.

**Previous: S743 — CategorySync Fix + Voice Strip QA + Wyoming Restoration (COMPLETE).**

CategoryTopFinds cron fully debugged and all 9 categories populating live: furniture 12, jewelry 24, art-decor 24, clothing 20, kitchenware 22, tools-hardware 23, collectibles 12, electronics 24, books-media 24. Root cause: Browse API requires `category_ids=` as direct query param (not `filter=categoryIds:{...}`), and accepts max 1 category per call (was passing comma-separated IDs). Fixed to loop per category ID and merge results. Fire-and-forget trigger route also fixed (was timing out PowerShell by awaiting the 30s sync before responding). Voice strip QA confirmed ✅ PASS — "8 oz" → empty, "2 lb 4 oz" → empty, control phrase preserved. Wyoming scraper restored to active fetch+parse logic after agent accidentally replaced it with a disabled no-op stub and registered it in sourceRegistry; both reverted. Outreach seeder image-filename false-positive fix also shipped this session (blocks `.png`/`.jpg` etc. from being inserted as emailAddress).

**Previous: S742 — Help Library Complete (COMPLETE).**

Help Library shipped: 75 guides written, voice notes coverage added, fabrication audit completed, `/guides` route live. Clusters 1–13 covering organizer and shopper audiences: Photo Workflow, Review & Publish, Promotion, Shopper At-the-Sale, Shopper Discovery, Trust & Community, Sale Day, Inventory, Advanced, Sale Creation, Setup, Explorer's Guild, Community. Route: `packages/frontend/pages/guides/index.tsx` + `pages/guides/[slug].tsx` with ISR 24h, TypeScript array data source (76 entry files in `packages/frontend/data/guides/entries/`), custom markdown renderer, no new npm deps. Fabrication audit: 16 guide files fixed, 20+ invented performance/time claims removed. Voice notes: coverage added to rapidfire-mode, photo-sessions-with-helpers, categories-and-tags, review-queue (feature uses Web Speech API, Chrome/Edge only, keyword extraction only, no AI call). Cluster 7 slug fix: 5 stub entries populated from long-named draft files. TS: zero new errors.

**Previous: S740 — Parallel Feature Batch (COMPLETE). Push block below.**

Three parallel dispatches shipped. (1) **#251 priceBeforeMarkdown FIXED** — `sales/[id].tsx` line 1492 had `item.markdownApplied &&` guard that only fires for cron-auto-markdowns; manual discounts have `priceBeforeMarkdown` set but `markdownApplied=false`, so crossed-out price never rendered. Removed the extra guard. All other card components (ItemCard.tsx, items/[id].tsx, InventoryItemCard.tsx) already used the correct guard — only this one file was wrong. TS: zero errors. (2) **Settings linked OAuth UI** — added Linked Accounts card to organizer/settings.tsx Profile tab. Uses `oauthProvider` from `/auth/me` query; shows Google Connected pill or "Link Google Account" button. Disconnect omitted (no backend unlink endpoint yet). Python/bash used for edit (file is 2043 lines). TS: zero errors. (3) **Roadmap cleanup** — #429 (eBay review queue skips description template) and #430 (register form silent error) rows updated to FIXED S736 with 5 targeted edits. Chrome QA: Review page eBay dims remains UNVERIFIABLE — user2/Maya Jackson is a shopper in production (access-denied on organizer area); seed data incorrectly attached qa-dims-test-sale-001 to a shopper account. Code confirmed: all 9 fields present in getDraftItemsBySaleId lines 2283–2292. Patrick's Google session restored ✅.

**Previous: S739 — AWS SES Migration (COMPLETE). Code pushed ✅. Awaiting smoke test + Resend cleanup.**

AWS SES migration complete. `send.finda.sale` domain verified ✅. All 3 DKIM CNAME records confirmed in Vercel DNS ✅. AWS production access approved ✅ (quota: 50,000/day, 14/sec). Patrick added 5 Railway env vars (SMTP_HOST, SMTP_PORT=587, SMTP_USERNAME, SMTP_PASSWORD, SES_FROM_EMAIL=noreply@send.finda.sale). Code migration pushed green: emailService.ts nodemailer wrapper, ~37 backend files updated, all from addresses → @send.finda.sale. Pending: smoke test one transactional email → confirm inbox delivery → remove resend from package.json + Railway env vars.

**Previous: S738 — Bug Fix Session (COMPLETE). Pushed ✅.**

Three Railway production bugs diagnosed and fixed from logs Patrick sent during session. (1) **valuationService.ts** — `orderBy: { createdAt: 'desc' }` on PriceBenchmark (field doesn't exist; correct is `updatedAt`). One-line fix. (2) **appraisalService.ts** — `getOpenRequests()` crashed on orphaned AppraisalRequest rows where linked user was deleted; added `submittedBy: { isNot: null }` filter. (3) **FavoriteButton + favoriteController** — clicking save/heart on a sale detail page passed the sale ID as `itemId` to the item-only favorites endpoint → P2003 FK violation. Favorite model already had `saleId String?`; added `POST /sale/:id` and `GET /sale/:id` routes + `toggleSaleFavorite`/`getSaleFavoriteStatus` controllers; FavoriteButton now routes to `/sale/:id` endpoint when no `itemId` is provided. Also confirmed and included in push: organizers.ts returnWindowHours removal from Prisma update (P2025 fix from prior session) + index.ts authLimiter /me exemption (CRIT-1 fix). Push green ✅.

**Previous: S737 — QA Session (COMPLETE).**

Chrome QA burn-down. Three Blocked Queue items verified: #326 eBay Comp Tiles ✅, #322 EbayCategoryPicker ✅, S733 desktop claim-listing CTA ✅. Two items UNVERIFIABLE (no VM microphone for voice strip; all user2 items published — no draft queue for review-card dims test). Patrick confirmed: S736 push done, QA_RATE_LIMIT_BYPASS_SECRET added to Railway, SES AWS steps completed, MailerLite group ID set. Email verification migration (20260515180000) deploying next week.

**Previous: S735 — Unclaimed Organizer Profile Redesign (COMPLETE).**

Redesigned the unclaimed organizer profile page (`pages/organizers/[id].tsx`) from a sparse data stub into a conversion-focused acquisition page. 8 targeted additions, all conditional on `isUnmanagedListing === true` — claimed profiles unchanged. New elements: amber trust bar ("We found your sales listed publicly"), profile completion ring SVG (28%) next to organizer name, missing-items block + 3-col value props grid, full-width orange "Claim This Profile — It's Free" CTA button with IntersectionObserver sticky bottom bar, locked Shopper Activity card (blurred stats + backdrop overlay), locked Buyer Insights strip (gradient-fade right edge), ghost review card (text CSS-blurred, stars visible, warning about losing review control), locked Sale History Intelligence card with diagonal stripe + UNCLAIMED stamp. TypeScript: zero errors. Needs Chrome QA at /organizers/cmoyqeau503478i796442jnnh.

**Previous: S734 — QA Session (COMPLETE). Chrome QA on Blocked Queue items + bug discovery.**

Four findings: (1) #280 Condition Rating XP VERIFIED via DB — PointsTransaction confirmed +5 XP on conditionGrade save; removed from Blocked Queue. (2) eBay push from Review queue VERIFIED — listing #137314168141 created successfully; cleared from Blocked Queue. (3) NEW BUG #430 — Register form swallows "existing email" API error silently (P2 BROKEN). (4) NEW BUG #429 — Review queue approve handler doesn't pass store description template to eBay push; listing uses raw AI text instead of template (P2 BROKEN).

**Previous: S734 — eBay Bidirectional Sync + Voice Strip Fix + Review Card Dims (COMPLETE)**

Three bugs fixed. (1) **eBay pull-sync cron** (`ebayListingSyncCron.ts`) — new cron every 4h pulls title, description, condition, and price back from eBay into FindA.Sale; skips description pull when organizer has a `defaultDescriptionHtml` template (prevents expanded HTML clobbering clean description). Also wired description template (`{{DESCRIPTION}}` placeholder) into push-on-save flow in `itemController.ts`. (2) **Voice strip fix** (`VoiceDescriptionInput.tsx`) — component was calling `voice/extract` AFTER `append`, so `weightOz` was never forwarded to the backend; swapped order (extract first, then pass values to append) so `stripShippingPhrases` now correctly fires on new recordings. Also verified: regex correctly strips compound weights ("2 lb 4 oz" → fully removed). (3) **Review page dims** (`itemController.ts` `getDraftItemsBySaleId`) — `packageWeightOz`, `packageLengthIn`, `packageWidthIn`, `packageHeightIn`, `ebayShippingOverride`, `quantity`, `listingType`, `reverseDailyDrop`, `reverseFloorPrice` were all missing from the Prisma select; eBay push card always showed empty shipping fields regardless of what was saved. Added all 9 fields. Note: old descriptions with orphaned numbers (e.g. "14" left from "14oz") are from pre-fix recordings — the fix only applies to new voice notes.

**Previous: S733 — UI Fixes: Organizer Page Mobile Layout, Sales Page Content Parity, Settings.tsx Restore, Duplicate Appraisal Button Removed (COMPLETE)**

Four UI issues fixed. (1) **Organizer page mobile layout** — sales count badge was a `justify-between` sibling with `whitespace-nowrap ml-4` that pushed the heading off-screen on narrow viewports; moved inline into the heading row as an amber pill (🏷️ 1 sale). (2) **Sales page content parity** — removed the 96px mini-map thumbnail from the When/Where card (too small to read); added `lg:hidden` "Where to Go" card (160px SaleMap + Directions button) below When/Where; added `lg:hidden` Holds & Shipping card; added `lg:hidden` SaleShareCard — all three were desktop-aside-only and invisible on mobile. Added claim-this-listing CTA to the desktop aside organizer card (shown when `!sale.organizer.isClaimed`). (3) **Settings.tsx restored** — file was silently truncated at line 2021 by a prior session's Edit tool usage (6 opening `<>`, only 5 `</>`, no `export default`); retrieved canonical version from GitHub via MCP, dispatched agent to decode base64 + reconstruct missing tail using Python-via-bash. Final: 2043 lines, TypeScript clean. (4) **Duplicate appraisal button** — edit-item page had two "Request Appraisal" buttons: the correct green one in `PriceResearchPanel` (XP-based community flow) and a later-added purple `Link` to `/organizer/appraisals?open=true`; removed the purple one. Files: `pages/organizers/[id].tsx`, `pages/sales/[id].tsx`, `pages/organizer/settings.tsx`, `pages/organizer/edit-item/[id].tsx`.

**Previous: S730 — Sale Wizard Cleanup: Photo Toast, Hold Duration Rework, Grief Firewall Removal, Return Window to Account Settings (COMPLETE)**

Five issues addressed from sale creation flow review. (1) **Photo upload toast** — Step3 catch block in create-sale.tsx was silently swallowing errors; wired `useToast()` into Step3, catch now shows error toast. (2) **Hold duration removed from organizer control** — removed `holdDurationHours` from create-sale WizardFormData + buildPayload + Advanced Settings UI; removed from saleController.ts zod schema; reservationController.ts now uses `getRankBenefits(explorerRank).holdDurationMinutes` (INITIATE=30min, SCOUT=45min, RANGER=60min, SAGE=75min, GRANDMASTER=90min). Agent initially inserted wrong hours-based map — caught and corrected inline. (3) **Return window moved to account settings** — removed from per-sale wizard; added to organizer settings.tsx Profile tab + organizers.ts PATCH/GET + new migration 20260515200000. Field already existed in schema.prisma. (4) **Grief Firewall removed** — `estatePrivacyMode` checkbox removed from edit-sale; info card removed from settings.tsx; removed from saleController zod schema + itemController tag-analysis handler. DB column left intact. (5) **Price/category suggestion toggle removed** — was the Grief Firewall mechanism; gone with it. Files: create-sale.tsx, edit-sale/[id].tsx, settings.tsx, saleController.ts, itemController.ts, reservationController.ts, organizers.ts, migration 20260515200000.

**Previous: S729 — Venmo Deeplink QR + Zelle Display on POS + Shopper Holds (COMPLETE)**

Smart payment UX for Venmo and Zelle across two pages. No schema changes needed — `venmoHandle`/`zelleHandle` were already on Organizer model (S716). (1) **POS page** — when organizer has `venmoHandle` set, payment section now shows a 160px QR code generated from the Venmo deeplink URL with cart total + sale name pre-filled; shopper scans with camera app, Venmo opens ready to send. Zelle section shows handle in large text + amount + copy-to-clipboard button + "send in your bank app" note. Both sections silent when handle not set. (2) **Shopper holds page** — Venmo "Pay with Venmo" button fires deeplink with hold total pre-filled; Zelle shows handle + amount + copy button. Backend extended: `getMyHoldsFull` in reservationController.ts now includes `organizer: { select: { venmoHandle, zelleHandle } }` in the sale query and surfaces as `organizerVenmoHandle`/`organizerZelleHandle` on each hold. Added `react-qr-code ^2.0.0` to frontend package.json; Patrick ran `pnpm install` to sync lockfile. Files: package.json, pnpm-lock.yaml, pos.tsx, holds.tsx, reservationController.ts.

**Previous: S727 — eBay Integration Fixes + Feature Batch (COMPLETE)**

Five eBay issues diagnosed and fixed in three parallel agent dispatches. (1) **{{DESCRIPTION}} template bug** — ebayController.ts: when item had no description, first branch left `{{DESCRIPTION}}` literal in eBay listing; fixed to replace with empty string in the no-description case. (2) **eBay push not firing from Publish All** — review.tsx: `publishMutation.onSuccess` was missing the eBay push call entirely; wired to fire for checked items matching pattern from `handleApproveAll`. `ebayPushMutation.onError` toast also added (was silent). (3) **Draft item eBay push** — `draftStatus` and `ebayShippingOverride` were both missing from item SELECT in push loop (silent regression); added. Push now includes `warning: 'DRAFT_ON_FINDASALE'` for draft items; review.tsx shows info toast. (4) **Card readiness borders** — review.tsx: `computeReadiness()` helper added; each item card now has `border-l-4` in red/yellow/green/blue based on completeness (blue = green + weight set + eBay connected). (5) **Best Offers UI** — edit-item/[id].tsx: toggle + two percentage inputs (auto-accept/auto-decline) with live dollar previews and threshold validation; converts to dollar amounts on save; reverse-computed from stored amounts on load. (6) **Local pickup checkbox** — edit-item/[id].tsx: checkbox sets `ebayShippingOverride = 'LOCAL_PICKUP_ONLY'`; smart phrase detector scans description/notes and shows dismissible nudge. review.tsx: same checkbox added to per-item eBay section. ebayController.ts: `resolvePoliciesForItem` routes to local pickup fulfillment policy when override is set. S726 push still pending (see Next Session).

**Previous: S726 — Pipeline Punch List + Email Verification Token (COMPLETE)**

Confirmed S725 deploy green (all 3 commits on main, Railway healthy). Set `ENABLE_ORGANIZER_WEBSITE_ENRICHMENT=true` in Railway (re-enabled after S725 extractor fix). Verified GH Actions pipeline: auto-seed-outreach workflow fired, InternalJobRunner confirmed, 255 eligible orgs found, 0 new to seed (queue caught up). Dispatched 5 pipeline punch list items in parallel — all shipped: (1) **Cron Step 3** — removed 6 in-memory `cron.schedule` calls + imports from index.ts; GitHub Actions now sole trigger for all pipeline jobs. (2) **HOT-tier rework** — leadScoringService.ts: HOT = isStateLicensed OR esnOrgId non-null OR website+custom-domain-email OR sourceCount≥3; numeric score path unchanged. (3) **MailerLite 429 batching** — mailerliteService.ts: 55k one-at-a-time HTTP calls → bulk import 500/batch with 500ms delay + Retry-After retry logic; outreachEmailsCron.ts import updated. (4) **D.C. state parser** — outreachEmailsCron.ts: `normalizeDottedState()` helper added, handles D.C./P.R./VI/GU/AS; addressStateMatch regex updated to tolerate trailing ZIP. (5) **Email discovery extraction quality** — emailDiscoveryService.ts: EMAIL_REGEX tightened (no apostrophes/brackets), `preprocessTextForExtraction()` strips markdown links, `isMalformedCandidate()` gate added. Also shipped: **P0-3 Email verification token expiry** — schema migration created (20260515180000), schema.prisma updated (`emailVerificationTokenExpiry DateTime?` on User), authController.ts updated (set 24h expiry on register, check+clear on verifyEmail). **Migration NOT yet deployed** — Patrick must run manually (see Next Session). Confirmed: eBay DRAFT "option C" already implemented in a prior session — removed from Blocked Queue.

**Previous: S725 — Organizer Pipeline Overhaul + Cron Reliability Keystone (COMPLETE)**

Full diagnosis + overhaul of the scrape→enrich→score→outreach pipeline. ROOT SYSTEMIC ISSUE found: enrichment/scoring/outreach jobs ran as in-memory node-cron inside the backend — every Railway redeploy wiped the schedules, so they ran erratically or not at all (only ~7 outreach emails ever sent; `lastScoredAt` frozen at 2026-05-10). KEYSTONE FIX shipped (architect-spec'd, dev-built, Steps 1+2 of 3): new `POST /api/internal/jobs/run` dispatcher endpoint (reuses `requireSecret`/`x-internal-secret` auth) + 7 `pipeline-*.yml` GitHub Actions workflows that trigger the jobs durably. In-memory crons left running alongside until green cycle — **green cycle now CONFIRMED** (logs show `[InternalJobRunner]` fired all 7 jobs, lead-scoring scored 56,347 orgs). Step 3 (remove in-memory crons) is unblocked. Also shipped: cron cleanup (gated 3 double-running scrapers behind GH Actions, disabled backend sale-enrichment cron, enrich-sale-details daily→3-days, enrich-contact-emails 6h→daily, smtp-verify daily→weekly, deleted auctionzip+canada411 workflows); address enrichment pipeline (new organizerWebsite.ts scraper + organizerWebsiteAddressCron, bulkUpsertEnrichedSales accepts address fields, eligibility query fixed 0→8,804 rows); bug fixes (email-discovery image-filename filter, outreach `[state]` token parsed from address, outreach category filter relaxed +1,661 leads, website→email chaining, `@prisma/client` import build-break fix). DB fixes via psycopg2: 46 junk image-filename emails nulled, 36 corrupted organizer addresses recovered from Sales city/state. ESN auth-cookie route abandoned (Patrick chose website-only). HOT-tier rework signal set approved by Patrick (state-licensed / active platform sales / website+custom-domain-email / 3+ source corroboration — NO Google API) — not yet dispatched. P0 caught + fixed mid-session: address extractor was over-matching and writing page-nav text into Organizer.address — bounded regex + validation + junk blocklist + 110-char cap rewrite shipped.

**Previous: S724 — UX Spot-Check Backlog Burn-Down (COMPLETE)**

Reviewed five most-recent UX spotchecks (2026-05-13, 2026-05-06, 2026-05-02, 2026-04-22, 2026-04-15), grep-verified each issue against current code, dispatched six parallel dev agents to fix everything still unfixed. Confirmed-already-fixed: dashboard salesError destructure + render, edit-sale isError + window.confirm removal, shopper Pickups tab render block (now uses local holds query), add-items useMutation hooks moved before early returns, add-items duplicate saleId useEffect collapsed, search input aria-label, sale type filter aria-label, approachNotes.startDate parseISO bug (file refactored, code path gone). Shipped this session: (1) **create-sale.tsx** — added `isOnlineOnly: form.isOnlineOnly` to `buildPayload()` + matching backend `saleCreateSchema` zod field so the toggle now actually persists (frontend was sending nothing, knock-on found backend strip), removed 3 stale TODO comments, added aria-labels to 3 photo manipulation buttons. (2) **add-items/[saleId].tsx** — feature-flagged "Enhance All" stub button behind `NEXT_PUBLIC_ENABLE_ENHANCE_ALL` (RapidCapture already gates on `&& onEnhanceAll`), wrapped 8 `console.error` calls in dev-only guards, hoisted `URL.createObjectURL(pendingFaceBlob)` into a `useMemo` + `useEffect` revoke cleanup, replaced native `confirm()` for bundle delete with inline confirm-state pattern, camera heading now reflects `rapidItems.length` too. (3) **line-queue/[id].tsx** — fixed Rules of Hooks violation (auth redirect now in useEffect after all hooks; render-guard runs identically every render), added initial-load error state with Retry, added `lastSyncedAt` staleness indicator ("Updated Xs ago" + amber "⚠ Not updating" after 30s), added aria-label to Mark Entered button. (4) **shopper/dashboard.tsx** — replaced `alert()` with `showToast` for referral copy, wrapped 2 `console.error` in dev guards. (5) **index.tsx** — added `isError` to search useQuery + error message, gated "Save This Search" behind `user` (guests get sign-in link), added `aria-pressed` to date filters, gated SaleMap on `hasMapPins` (no more 220px empty container). (6) **sales/[id].tsx** — fixed OG meta double-render (was rendering `<SaleOGMeta>` twice when SSR ogHead truthy), moved Buyer's Premium disclosure from left column to immediately above Auction Items section header. (7) **organizer/dashboard.tsx** — aria-label on welcome banner ✕, replaced `setTimeout(window.location.reload, 1000)` with `queryClient.invalidateQueries(['organizer-sales', user?.id])` at both reopen sites. (8) **edit-sale/[id].tsx** — added `id="edit-{field}"` + matching `htmlFor` to 12 label/input pairs (title, saleType, description, startDate, endDate, startTime, endTime, address, city, state, zip, notes). (9) **backend saleController.ts** — added `isOnlineOnly: z.boolean().optional()` to `saleCreateSchema` (S724 knock-on from frontend dispatch). All edits verified via Read tool against Windows source-of-truth files; VM-side TS check unreliable due to mount truncation, deferred to Vercel/Railway build for final signal.

**Previous: S723 — eBay Push End-to-End + Blocked Queue Burn-Down (COMPLETE)**

Massive eBay-flow debugging + multiple Blocked Queue clearances. Patrick pushed a live eBay listing for the first time end-to-end. Iterative tonight: every Railway error became the next fix. Final state: weight 49oz + dims 10x13x4 + valid packageType (MAILING_BOX/PADDED_BAGS) persists, smart-pick picks CALCULATED→FLAT→FREE in correct order with weight-gate, eBay aspect filler uses tag/keyword/neutral cascade instead of `enums[0]` ("Accordion" on MIDI cables fixed), publish mode cascade (settings → sale-level toggle → per-call override) verified working, stale-category offer recreation works. Auto-save-before-push wired so eBay reads current form state. Fixes shipped: #326 eBay Comp Tiles (live listings array vs singleton), #280 Condition Rating XP (null-guard blocked AI-prefilled grades), #422 OAuth Option B (logged-in required for linking, 409 redirect with amber banner), #322 Encyclopedia category picker (Vercel proxy dropped `q` param — embedded in path), eBay frontendUrl + proxySecret ReferenceErrors in pushSaleToEbay, packageType enum allowlist (drops invalid like "BOX" via warn log, dropdown rebuilt with 17 real eBay values), edit-item form save (string→Int coercion, getItemById SELECT was missing package fields → form re-loaded blank after save), Favorite query `user: { isNot: null }` removed (required relation, invalid syntax, broke getSaleActivity). Schema migration deployed for `Organizer.ebayDefaultPublishMode` + `ebayDefaultShippingPolicyId`. ~25 file changes across the session, all in parallel/serial-batched dev dispatches plus inline edits for <20-line fixes.

**Previous: S722 — Monthly Retro + Auth Security Hardening (COMPLETE)**

Monthly retrospective run. Rate limit fix shipped (loginLimiter 5→15 + skipSuccessfulRequests). Auth security audit completed — hacker agent found 3 P0s, 4 P1s, 5 P2s, 4 P3s. 10 fixes dispatched and applied: JWT access token expiry 7d→15m, /auth/oauth rate limiter added, tokenVersion absent bypass fixed, organizerTokenVersion multi-role miss fixed, resend-verification regenerates token, logout clearCookie attributes fixed, jwt.verify algorithms constraint added, /verify-email rate limiter added, X-Forwarded-For logging fixed, OAuthBridge CSRF skip documented. OSM scraper URL fixed (overpass-api.de → overpass.kumi.systems). Indiana licensing scraper fixed (3 root causes: session cookie forwarding, __VIEWSTATEGENERATOR field, Recaptcha1 field). Doc cleanup: 22 root violations resolved, 2 deprecated files archived.

**Previous: S721 — Outreach Gmail API Migration (COMPLETE)**

Root cause of outreach email failure identified and permanently fixed. Railway Hobby plan silently blocks outbound SMTP on ports 25/465/587 — only Railway Pro ($20/mo) allows SMTP. Solution: rewrote outreachEmailsCron.ts from nodemailer SMTP to Google Gmail API over HTTPS (port 443, unblocked). Steps: (1) Created GCP OAuth client "FindA.Sale Outreach Mailer" under outreach@finda.sale project (qualified-cedar-496114-v1), scope: gmail.send. (2) Added GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN to Railway env vars. (3) Rewrote cron: `createGmailClient()` replaces `createTransport()`, `buildRawEmail()` constructs RFC 2822 MIME with base64url encoding, `gmail.users.messages.send()` replaces `transport.sendMail()`. (4) Added `googleapis` to backend package.json. (5) Fixed duplicate initOutreachEmailsCron block (VM mount truncation artifact). (6) Debugged OAuth invalid_grant — initial tokens were bound to Playground's default client, not ours. Re-authorized with "Use your own OAuth credentials" checked. (7) Verified token exchange via curl (200 OK + access_token). (8) Sent live test email via Gmail API from VM → deseee@yahoo.com (message ID 19e1d4e882ea0c52). (9) Updated Railway GMAIL_REFRESH_TOKEN and redeployed. Backend running, cron registered every 4 hours.

**Previous: S720 — Outreach SMTP Debug (WRAPPED — led to S721 Gmail API fix)**

Outreach cron fires correctly but all sends timeout with "Connection timeout" on smtp.gmail.com:465. Exhaustive audit confirmed: not a code bug — Railway Hobby plan blocks SMTP ports at the network level. Two attempted SMTP fixes deployed (IPv4 forcing, requireTLS removal) — neither worked because the block is at TCP level. Led directly to S721's Gmail API rewrite.

**Previous: S719 — Chrome QA Sprint (COMPLETE)**

Chrome QA on Blocked Queue items. Verified: #251 Markdown badge ✅ (sale card ~~$75.00~~ $56.25), #271 TEAMS copy ✅ (Webhooks line visible on /pricing), #330 Appraisals ✅ (button + /organizer/appraisals page). Bugs found: #326 eBay Comp Tiles ❌ — eBay search returns summary card (10 listings, Median $260) but EbayCompTiles image grid not rendering at all. #280 Condition Rating XP ❌ — set grade B, saved, XP balance unchanged at 15 XP (no XP awarded). #322 Encyclopedia Inline Tip: UNVERIFIED — category picker doesn't resolve free-text to eBay taxonomy. #405 Founding Badge: Patrick said "Build" — dev agent shipped: backend GET /:id now returns foundingOrgBadge field, frontend organizers/[id].tsx renders amber pill badge in trust-signal cluster. PUSH BLOCK PENDING (see Next Session). Outreach cron: registered in index.ts, OUTREACH_ENABLED=true, but Railway log window too short to confirm historical sends.

**Previous: S718 — QA Sprint + Outreach Enabled (COMPLETE)**

Chrome QA completed S718: #228 Settlement Receipt ✅, #241 Brand Kit PDFs ✅, #235 Charity Close ✅, #369 Quebec block ✅ (Canada → Quebec → amber warning + disabled Register button), #407 Flip Tracker ROI ✅ (Signed First Edition Novel: $500 revenue - $300 cost = +$200 profit, +66.7% ROI displayed in flip-report). Outreach confirmed live — `OUTREACH_ENABLED=true` set by Patrick, cron registered every 4 hours, 183 seeded organizers in queue. #405 Founding Badge: render surface found — organizer/settings.tsx Profile tab (🏆 card renders when foundingOrgBadge=true). Storefront copy says "badge appears on your storefront" but storefront page has no foundingOrgBadge rendering — this is a gap. #251 markdown badge: item changed from AUCTION to STANDARD type (psycopg2), re-QA blocked by rate limit (610s). Code path confirmed present in sales/[id].tsx line 1535 — only fires for non-auction items.

**Previous: S717 — eBay Price Comps + Backend Crash Fix (COMPLETE — wrap)**

eBay price research panel on review page fully debugged and fixed. Root causes resolved: (1) Backend crash loop — `ebayController.ts` was truncated mid-template-literal at line 4246 (`console.log(\`[eBay EndedSync] Batch of \${bat`) — restored missing 15 lines from git history. (2) Browse API `sort=price` returning cheap accessories (AC adapters at $11) instead of actual items — switched to `sort=bestMatch`. (3) bestMatch returning too many unrelated models — added `cleanTitle()` function that strips everything after first comma/standalone dash, removes generic descriptors, caps at 5 words (e.g. "Zoom B3 Multi-Effects Processor, Rec, Model B3" → "Zoom B3 Multi-Effects Processor"). Also: eBay developer account audit — Growth Check ticket (Incident 260428-000018) was filed April 28 from wrong account (artifactmi@gmail.com, Patrick's personal eBay seller account) — production keys are on deseee@yahoo.com / deseee1 account. No application ever reached the correct account. Draft reply prepared to correct App ID and add Finding API request. No Finding API access yet — Browse API is what's running.

**S716 (prior):**

Chrome QA on 10 features from S712 backlog. Verified passing: #411 Dorm Dash ✅, Wave 2 edit-sale ✅ (all 6 fields present), #412 Cash Bridge POS ✅ (Venmo/Zelle handle fields added mid-session), Leaderboard ✅, #304 Early Access Cache ✅, #288 Featured Boost ✅, #310 Color Discount Rules ✅. Three P1 bugs found and fixed same session: (1) Brand Kit PDFs + Settlement Receipt both had `?token=` empty on download links — root cause auth migrated to httpOnly cookies but these two still read localStorage; fixed to use axios instance with `withCredentials: true`. (2) Charity Close #235 — `getUnsoldItems` query too broad, returned non-AVAILABLE items that `donationController` rejected; fixed to filter `status: 'AVAILABLE'` only. Also fixed mid-session: Venmo/Zelle handle fields missing from Settings and POS — `venmoHandle`/`zelleHandle` already in schema, wired to Settings Profile tab + PATCH endpoint + POS display. Push block in Next Session.

Chrome QA on 10 features from S712 backlog. Verified passing: #411 Dorm Dash ✅, Wave 2 edit-sale ✅ (all 6 fields present), #412 Cash Bridge POS ✅ (Venmo/Zelle handle fields added mid-session), Leaderboard ✅, #304 Early Access Cache ✅, #288 Featured Boost ✅, #310 Color Discount Rules ✅. Three P1 bugs found and fixed same session: (1) Brand Kit PDFs + Settlement Receipt both had `?token=` empty on download links — root cause auth migrated to httpOnly cookies but these two still read localStorage; fixed to use axios instance with `withCredentials: true`. (2) Charity Close #235 — `getUnsoldItems` query too broad, returned non-AVAILABLE items that `donationController` rejected; fixed to filter `status: 'AVAILABLE'` only. Also fixed mid-session: Venmo/Zelle handle fields missing from Settings and POS — `venmoHandle`/`zelleHandle` already in schema, wired to Settings Profile tab + PATCH endpoint. Push block in Next Session.

**S715 (prior):**

Railway Postgres showing 117GB egress traced to runaway NY Phase 2 GitHub Actions workflow (ran 10am–7pm, bulk-downloading 29,728 NYC resale license records). Root causes fixed: server-side Socrata `$where`/`$q` filtering added to 9 Phase 2 scrapers (CA, CT, HI, IL, NV, NY, PA, TX, VA), timestamp-suffix duplicate creation removed from `index.ts` P2002 handler, `timeout-minutes: 60` added to 40 Phase 2 workflows missing it. DB cleanup: 23 junk timestamp-suffix organizers deleted, 356 legit NY businesses promoted to WARM `leadTier`. Pool state confirmed: 55,230 total unmanaged orgs, COLD 32,513 / WARM 5,663+356 / HOT 215 / NULL 16,839 (NY noise). 626 timestamp-dupe organizers with Sales attached remain — inert, can't delete without orphaning Sale records. egress fix is code-only, no schema changes.

**S714 (prior):**

384 SEO pages generated and merged into `packages/frontend/data/seo-pages/index.json`. Batch breakdown: 34 Haiku-written pricing guides (batch1-fixed.json — after post-processing via fix-seo-batch.js to handle markdown fence wrapping, two-array corruption, field renaming, score stripping) + 350 template pages (25 cities × 10 categories = 250 city×category + 10 categories × 10 months = 100 trend reports). All pages served at `/guide/[slug]` — ISR 24hr revalidate, auto-populates server-sitemap.xml. Two new scripts: `scripts/fix-seo-batch.js` (post-processing fixer + merge tool) and `scripts/generate-template-pages.mjs` (template generator). System prompt updated in `seo-pages-haiku-generator.md` (field names fixed, seoScore removed, 15-item batch limit noted). After-reset dispatch ready at `claude_docs/strategy/seo-agent-dispatch.md` to generate remaining 116 Haiku-written pages (batch1b + batches 2+3). Haiku limit confirmed: ~15 items max per session before truncation — agent dispatch avoids this.

**S713 (prior):**
Two backend crash loops fixed. OSM 406, GarageSaleFinder hidden-address, Missouri TLS, digest FK, Canada flag, YellowPages.ca scraper, AuctionZip/Canada411 disabled, MO pawnbroker disabled, OK pawnbroker PDF scraper, LA auctioneer POST scraper.

---

## Pool Audit Findings

Run: 2026-05-18 (S756). Railway DB queried directly via psycopg2.

**DirectoryClaimEmail (outreach queue):** 3,319 PENDING, 29 SENT. 31 junk rows deleted this session (26 image filenames stored as emailAddress, 5 Patrick test emails — all had attemptCount=0).

**Outreach pace:** 29 emails sent since S754 fix deployed (May 17-18). ~48/day, matching warmup schedule (Day 1-7: 20/day cap). Pipeline healthy.

**leadTier breakdown:**
- HOT: 5,517 (all have website — 100% coverage)
- WARM: 36,851 (only 1,223 have website — 3.3% coverage)
- COLD: 14,314
- NULL: small residual

**WARM email gap — root cause confirmed S756:** Email discovery requires `website IS NOT NULL` as prerequisite. Only 208 WARM orgs are currently addressable (have website + no contactEmail). The website enrichment job (`websiteEnrichmentJob.ts`) is the upstream bottleneck — it only targets `isStateLicensed: true` orgs (intentional: WARM→HOT bridge for licensed orgs) and was running weekly only. **Fix shipped S756: cron changed from weekly to daily** (`0 1 * * *`). API headroom: HERE 250K/month cap, current usage ~400/month — daily runs increase this to ~1,500/month, well under cap.

**Source attribution (updated S754):** 87.7% of organizers have `directoryMostRecentSource` tagged (was ~5.5% before S754 backfill of 46,333 records).

**Email coverage:**
- Has contactEmail: HOT ~100%, WARM ~2.77%
- Addressable WARM pool (website + no email): 208 orgs

**Geocoding:** 6,760 sales still not geocoded. Nightly geocoding job should address gradually.

**Verdict:** Pipeline healthy. WARM outreach will slow once the 208-org addressable pool is exhausted — daily website enrichment extends the runway by adding newly-licensed orgs continuously.

---

## Blocked Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #326 eBay Comp Tiles | ✅ VERIFIED S737 — 3-tile grid rendered on edit-item page (Victorian Pocket Watch): $295, $450, $675 Pre-owned Good listings with photos. CLOSED. | — | S719 |
| eBay full push flow | VERIFIED S734 — listing #137314168141 created successfully via Review queue approve with "Also push to eBay" checked | CLOSED | S723 |
| #422 OAuth Option B | FIXED S723 — backend 409 + amber banner redirect works. CLOSED S742 — Patrick indicated this was tested. #430 register form silent error was a separate bug, fixed S736. | — | S723 |
| #322 Encyclopedia category picker | ✅ VERIFIED S737 — Typed "pocket watch" → dropdown populated with real eBay taxonomy: Pocket Watches (3937), Movements (57720), Other Watch Parts (10324), etc. CLOSED. | — | S723 |
| Settings UI for linked OAuth providers | Backend endpoint `/auth/oauth/link` ready, no frontend surface yet | Build linked-accounts section in organizer/settings.tsx (deferred — security hole closed by backend rejection alone) | S723 |
| #431 Rate limiter QA bypass | ✅ DONE — S736 fix pushed, QA_RATE_LIMIT_BYPASS_SECRET added to Railway. CLOSED. CRIT-1 residual also FIXED S738 — authLimiter /me exemption added to index.ts and pushed. CLOSED. | — | S736 |

| Sales page desktop claim-listing CTA (S733) | ✅ VERIFIED S737 — Navigated to /sales/cmoyqeblk035j8i79qtgjtt3m as guest. Desktop aside showed "Is this your sale? Claim this listing..." + orange Claim button. CLOSED. | — | S733 |
| Voice strip — weight/dims (S734) | ✅ VERIFIED S743 — JS console test (exact deployed regex, V8 engine, sha 1fd4c07): "8 oz" → empty, "2 lb 4 oz" → empty, "weighs 3 pounds" → empty, "nice ceramic vase in good condition" → unchanged. CLOSED. | — | S734 |
| Review page eBay card — dims/weight (S734) | ✅ VERIFIED S741 — Navigated to /organizer/add-items/qa-dims-test-sale-001/review as user2 (Bob Smith). Called GET /api/items/drafts?saleId=qa-dims-test-sale-001 (200 OK). All 9 previously-missing fields present: packageWeightOz=24, packageLengthIn=12, packageWidthIn=8, packageHeightIn=4, ebayShippingOverride=null, quantity=1, listingType=FIXED, reverseDailyDrop=null, reverseFloorPrice=null. eBay section not rendered in UI because user2 has no EbayConnection row — correct behavior, not a bug. Fix in getDraftItemsBySaleId confirmed working. CLOSED. | — | S734 |
| P0-3: Email verification token expiry | Migration created S726 (20260515180000) — schema.prisma updated, authController.ts updated. Patrick deploying next week. | Patrick: deploy migration when ready (same powershell block as before) | S722 |
| #SES-MIGRATION — email provider move | ✅ RESOLVED S749 — SES SMTP never worked (Amazon hasn't approved + Railway blocks SMTP ports). emailService.ts rewritten to use Gmail API (same as outreach). All 35 services now send via Gmail API through `find@outreach.finda.sale`. Verified: claim verification email delivered. SES remains available as future scale path (50k/day) once approved — but Gmail API (2k/day) is sufficient for current volume. CLOSED. | — | S739 |
| AuctionNinja + NAA scrapers | enabled:false in sourceRegistry | Decide: set enabled:true to activate | S712 |
| Facebook Marketplace scraper | FB GraphQL doc_id may break with platform changes | Monitor for breakage; fragile by design | S712 |
| directoryMostRecentSource NULL | 84% of organizers have NULL (Phase 2 scrapers write sourcesJson only) | Backfill fix deferred — Phase 2 scrapers need to write the field | S712 |
| MN/MI/TN licensing scrapers | Bot-blocked (Radware/DIFS 403) — graceful no-ops, no failure emails | Needs headless browser + residential proxy (#SCRAPER-HEADLESS-PROXY in Deferred) | S713 |
| Wyoming pawnbroker scraper | ✅ CLOSED S743 — restored to active fetch+parse logic (attempts page fetch, returns 0 stats gracefully — expected, page is JS-rendered Google Sites). Removed from sourceRegistry (was never registered before agent added it accidentally). | — | S713 |
| AI listing enrichment | Fire-and-forget | Check Railway logs for `[listingEnrichmentService]` or query `scrapedMetadata.aiEnriched` | S651 |
| CategoryTopFinds TrendingSection | ✅ CLOSED S745 — Data confirmed S743, Patrick confirmed UI renders. | — | S647 |
| Outreach pipeline open/click tracking | ✅ CLOSED S745 — Live sends confirmed. OUTREACH_TEST_EMAIL deleted S745, real organizer sends now active at Day 11 warmup (50/day, 8/window). Pipeline healthy: InternalJobRunner firing, 3,370 organizers in queue. | — | S721 |
| Cron migration Step 3 | DONE S726 — 6 in-memory cron.schedule calls + imports removed from index.ts; GitHub Actions is now sole trigger | — | S725 |
| HOT-tier rework | DONE S726 — leadScoringService.ts: HOT = isStateLicensed OR esnOrgId non-null OR website+custom-domain-email OR sourceCount≥3 | — | S725 |
| MailerLite 429 storm | DONE S726 — mailerliteService.ts: bulk import 500/batch + 500ms delay + Retry-After retry; outreachEmailsCron.ts import updated | — | S725 |
| Washington D.C. orgs skipped | DONE S726 — normalizeDottedState() helper in outreachEmailsCron.ts handles D.C./P.R./VI/GU/AS; addressStateMatch regex tolerates trailing ZIP | — | S725 |
| Email discovery extraction quality | DONE S726 — EMAIL_REGEX tightened, preprocessTextForExtraction() strips markdown links, isMalformedCandidate() gate added | — | S725 |
| Re-enable address cron | DONE S726 — ENABLE_ORGANIZER_WEBSITE_ENRICHMENT=true set in Railway by Patrick | — | S725 |
| Confirm 7 new pipeline workflows | DONE S726 — auto-seed-outreach workflow fired, InternalJobRunner confirmed in Railway logs, 255 eligible orgs found | — | S725 |

| #310 Color-tagged Discount Rules | ✅ FIXED S745 — Root cause: TierGate pointer-events-none during auth refresh blocked modal. Fixed: modal JSX moved outside TierGate. CLOSED. | — | S745 |
| #330 Appraisals "Submit New Request" | ✅ FIXED S745 — Root cause: missing type="button" on trigger, causing browser to absorb click as form submit. CLOSED. | — | S745 |
| #88 Haul Posts | ✅ VERIFIED S746 — Page loads at /shopper/haul-posts. S745 QA tested wrong URL. Nav link confirmed in Layout.tsx. Community Hauls feed + Share Your Haul button render correctly. CLOSED. | — | S745 |
| #362 Attendance Count | ✅ VERIFIED S750 — "75 attended" renders on Bestmate Company Ltd storefront at /organizer/storefront/cmoqov790025xhbc5v11zy5pi. Persists after reload. CLOSED. Backend gap noted: storefront only returns PUBLISHED sales, so attendanceCount on ENDED sales never renders — separate fix needed. | — | S745 |
| #353 Year Founded | ✅ VERIFIED S746 — Set to 2019 via React fiber. PATCH /api/organizers/me sent yearFounded:2019. Reloaded — field shows 2019. CLOSED. | — | S745 |
| #355 Org Types | ✅ VERIFIED S746 — Estate Sales checkbox set + saved. PATCH sent organizerTypes:["estate_sale"]. Reloaded — checkbox shows checked. CLOSED. | — | S745 |
| #124 Rarity Boost modal | ✅ VERIFIED S750 — user12 (Leo Thomas) guildXp set to 55 via direct SQL. Button on /coupons enabled (spendableXp ≥ 50). Modal opens correctly. CLOSED. | — | S745 |
| #275 Hunt Pass Cosmetic Add-ons | FIXED S755 — Tailwind safelist + Avatar inline boxShadow fallback + leaderboard `roles: { has: 'USER' }` + league.tsx CSS fix. Pending Chrome QA. | Chrome QA: verify amber ring on user12 avatar + 🏆 badge on leaderboard | S753 |
| #265 Share & Earn dashboard card | FIXED S755 — Dismissal changed from permanent to 7-day timestamp expiry. Card re-appears after 7 days. Pending Chrome QA. | Chrome QA: verify card renders on shopper dashboard | S753 |
| #292 ENDED-sale UX inconsistency | FIXED S755 — Replaced "All items sold or reserved" with accurate item breakdown on ENDED sales. Pending Chrome QA. | Chrome QA: verify accurate counts on qa-settlement-001 | S753 |
| #305 Social Posts no-op | FIXED S755 — Broken Link replaced with button+modal. Pending Chrome QA. | Chrome QA: verify promote button opens SocialPostGenerator modal | S752 |
| #306 Store Hours persistence | FIXED S755 — handleSaveHours refetches from server after save. Pending Chrome QA. | Chrome QA: save hours, reload, verify persisted | S752 |
| #307 Retail Mode TEAMS verification | Not a bug for PRO (TEAMS-only by design). Needs TEAMS account QA. | Chrome QA: log in as TEAMS user, verify Retail Mode visible + functional | S755 |
| S754 pipeline DB verification | ✅ COMPLETED S756 — 29 sent on pace, directoryMostRecentSource 87.7%, 31 junk rows deleted, WARM gap root-caused, daily cron fix shipped. CLOSED. | — | S755 |
---

## Next Session

**Priority 0 — Push S755 + S756 + S758 (Patrick action).**

S755 had 10 code files. S756 added 2 more (roadmap.md + website enrichment cron). S757 = DB-only. S758 = planning only (roadmap.md + STATE.md + dashboard + new strategy doc).

**Priority 1 — Chrome QA on Blocked Queue (7 items, QA deferred per Patrick S756).**

All 6 S755 bug fixes need browser verification: #275 Hunt Pass ring+badge, #265 Share & Earn card, #292 ENDED-sale counts, #305 Social Posts modal, #306 Store Hours persistence, #307 Retail Mode on TEAMS account. One per QA dispatch per §10c.

**Priority 2 — Begin GEO Phase 1 (#432–#435).**

After QA ceiling is cleared, dispatch GEO Phase 1: enrich sale page JSON-LD (#432), create ai-plugin.json (#433), update llms.txt (#434), add bot/crawler visit tracking middleware + CrawlerVisit schema (#435). Also consider Phase 11 (auto-expire stale data #457 + confidence scoring #458) early in the sequence — it's defensive infrastructure that protects everything else. Full 12-phase plan in `claude_docs/strategy/geo-implementation-plan.md` — 29 roadmap entries (#432–#460) + 5 research items + 4 GTM plays.

**Priority 3 — Continue roadmap BROKEN items.**

After GEO Phase 1 ships, resume BROKEN items from roadmap.

**Patrick actions needed:**
- **PUSH S755 block** (10 code files — see last session)
- **PUSH S756 block** (2 files: website enrichment cron + roadmap)
- **PUSH S758 block** (see below — roadmap, STATE, dashboard, strategy doc)
- Log back into Chrome as yourself (artifactmi@gmail.com) after any QA
- Deploy email verification token migration (20260515180000) — still pending from S726
- Delete fix-attendance.sql from project root — still pending from S750

---

## Recent Sessions

### S758 — GEO & Discoverability Implementation Plan (COMPLETE)

**Trigger:** Patrick shared cross-session GEO strategy prompt for analysis.

Complete GEO strategy session. 12-phase plan + 5 research items + 4 GTM plays. 29 roadmap entries #432–#460. Phases 1-8: core funnel. Phase 9: compounding data assets. Phase 10: demand intelligence. Phase 11: data trust (auto-expire + confidence scoring — CRITICAL). Phase 12: syndication + auto-liquidation. Research queue: embeddable widget, Price Oracle, economic signals, Spanish data, agent subscriptions. GTM: build-in-public, Product Hunt infra launch, dev bounty, weekly wrangler audit. No code changes. Strategy doc: `claude_docs/strategy/geo-implementation-plan.md`.

### S757 — Production DB Cleanup (COMPLETE)

**Trigger:** Patrick requested test data removal.

Removed 5 test/QA sales + 13 items from Railway production DB. Cascading FK records cleaned in order (Bid, DonatedItem, ItemReservation, MaxBidByUser, Purchase, LineEntry, SaleChecklist, SaleDonation, SaleRipple, SaleSettlement, TrailStop, TreasureHuntQRClue, TreasureTrail). Nintendo Power item (from ENDED Artifact copy) migrated to live Artifact Downtown Paw Paw (now 100 items). 3 orphaned eBay-sync test items also removed. No code changes. No push required.

---

### S756 — Pipeline DB Verification + WARM Email Gap Root Cause + Daily Cron Fix (COMPLETE)

**Trigger:** Patrick deferred Chrome QA, asked to begin S754 pipeline audit (blocked last session by workspace bash unavailability).

**DB audit results (psycopg2 via Railway public proxy):**
- DirectoryClaimEmail: 3,319 PENDING, 29 SENT. 31 junk rows deleted (26 image filenames + 5 Patrick test emails).
- Outreach pace: 29 sent since S754 deploy (May 17-18), ~48/day — on warmup schedule.
- directoryMostRecentSource: 87.7% tagged (S754 backfill of 46,333 records confirmed working).
- WARM addressable pool: 208 orgs (have website + no contactEmail).

**#336 + #339 roadmap cleanup:** Both features confirmed already fully implemented (schema + PATCH handler + processRapidDraft gate for #336; cloudAIService.ts confidence gate for #339). Roadmap rows updated from "P1 violation — queued" / "Queued" → "SHIPPED (confirmed S756) — Pending Chrome QA".

**WARM email gap root cause:** Email discovery requires `website IS NOT NULL`. Only 1,223 of 36,851 WARM orgs have a website (3.3%). Root cause: `websiteEnrichmentJob.ts` has intentional `isStateLicensed: true` filter (WARM→HOT bridge for licensed orgs) and was running weekly only. Fix: switched GitHub Actions cron `0 1 * * 0` → `0 1 * * *` (daily). API impact: HERE 250K/month cap, daily runs = ~1,500/month (well under cap). Foursquare sandbox — fallback only, no lifetime cap concern.

**Files changed:**
- `.github/workflows/pipeline-website-enrichment.yml` — cron weekly → daily
- `claude_docs/strategy/roadmap.md` — #336 and #339 status updated

### S754 — Scraper/Enrichment Pipeline Audit + Gmail Rate Limit Fix (COMPLETE)

**Trigger:** Outreach pipeline showing "0 sent, 21 failed" with "User-rate limit exceeded" errors on every send attempt. Patrick asked for full audit.

**Root causes found:** (1) `organizerWeeklyDigestJob` was firing to all unmanaged scraped orgs — most have `@system.finda.sale` placeholder emails. Was burning the entire daily Gmail API quota before real outreach ran. (2) Send loop in `outreachEmailsCron.ts` fired all emails ~300ms apart with no inter-send delay, hitting Gmail's 1/sec rate limit even when quota remained.

**Fixes shipped:**
- `outreachEmailsCron.ts` — `sleep(1100)` between sends; spaces to ~1/second
- `organizerAnalyticsService.ts` — digest suppression: `isUnmanagedListing: { not: true }` in findMany + early return guard on `@system.finda.sale` email domain
- `organizers.ts` — storefront ENDED-sale gap: `status: { in: ['PUBLISHED', 'ENDED'] }` at two query sites
- `enrichContactEmails.ts` — HOT/WARM two-pass query (HOT/WARM take:150 → COLD fills to 200); DuckDuckGo free-search fallback for Pass 2/3 before Google Places
- `scraper/index.ts` — `directoryMostRecentSource` fallback now writes `sourceName` (all 77 Phase 2 scrapers covered without touching individual files)
- `backfillDirectoryMostRecentSource.py` *(new)* — ran live: 46,333 records updated
- `foursquarePlaces.ts` — category allowlist (19 entry substrings); skips off-target businesses
- `googlePlaces.ts` — extended business name blocklist

**GSalr.com:** Closed. $10k/day ToS clause for competitor use. Data from estatesales.org anyway.

**Push block has 8 files — see Current Status push block above.**

### S753 — Chrome QA Backlog Sprint Continued (COMPLETE)

**Trigger:** Patrick asked for a less token-wasteful QA approach (Sonnet subagents waste ~40-50k tokens per feature). Also investigated outreach send rate (~2/day vs expected 50/day).

**Outreach fix:** Query starvation in `outreachEmailsCron.ts`. Each batch re-fetched same candidates, quota check was outside send loop. Fixed: CANDIDATE_MULTIPLIER=10, exhaustedFilter excludes already-processed, nulls-first ordering, quota cap inside send loop. Edit tool truncated file (567→526 lines) — recovered via Python splice from git original.

**Chrome QA sprint (main session Opus, ~3-5k tokens/feature):** Verified 30+ features across shopper and organizer roles. Shopper: Homepage (hero, search, Treasure Hunt, Sale of Day, map, Featured Sales), Sale Detail (hero, badges, gallery, share), Favorites, Cart, Dashboard (rank, XP, perks, QR, Guild, Hunt Pass), Explorer Profile, Settings, Map (200 sales, filters, Plan Route, Heatmap), Trending, Leaderboard. Organizer: Dashboard (quick actions, plan info, storefront URL, sale cards, weather), POS (sale selector, search, camera scan, 6 payment methods, manual card), Print Kit (5 signs, 4 QR labels, Label Sheet Composer, 3 Interactive QR), Close Sale, Holds, Subscription Settings, Items (5 items, 4 input methods, inline editing, export), Appearance Settings, eBay Settings, Pricing Page. Also: Featured Boost/Sale Bump, Flash Deal, and several roadmap items.

**Bugs found:** #306 Store Hours save persistence, #305 Social Posts no-op, #307 Shop Mode PRO visibility, Subscription copy mismatch (TEAMS label on PRO account).

**Files changed:** `packages/backend/src/jobs/outreachEmailsCron.ts`

**Google login restoration:** Failed after 5+ attempts — OAuth chooser kept selecting wrong account (Lorene Cook) despite precise element targeting. Patrick needs to log in manually.

### S751 — Camera Landscape Orientation Fix (COMPLETE)

**Trigger:** Patrick reported camera (rapidfire + regular mode) doesn't shift to landscape layout when phone held horizontally.

**Discovery:** `isLandscape` state and all landscape layout code was already present in RapidCapture.tsx from a prior session. The detection used `matchMedia('(orientation: landscape)')` change events, which don't fire reliably on all mobile WebKit versions.

**Fix 1 — RapidCapture.tsx:** Swapped `matchMedia('change')` listener to `window.addEventListener('resize', ...)` + `screen.orientation?.addEventListener('change', ...)`. `resize` fires universally on orientation change across all mobile browsers.

**Fix 2 — manifest.json:** Patrick reported fix worked in Chrome browser but not the installed PWA. Root cause: `"orientation": "portrait"` in the PWA manifest locked the app to portrait at the OS level — the viewport never rotated, so no `resize` event ever fired. Changed to `"orientation": "any"`.

**Files changed:**
- `packages/frontend/components/RapidCapture.tsx` — orientation detection useEffect rewritten
- `packages/frontend/public/manifest.json` — orientation: portrait → any

**Note for users:** PWA already installed to home screen requires remove + re-add for manifest change to apply. Browser-only users get the fix immediately on deploy.

### S750 — Blocked Queue QA: #362 Attendance Count + #124 Rarity Boost (COMPLETE)

**Trigger:** Patrick asked to seed and verify the two remaining UNVERIFIED blocked queue items.

**Migration check:** 20260515180000 already deployed — confirmed 264 migrations, none pending.

**#362 Attendance Count:**
- Railway Query tab is read-only (no DML commits) — discovered this session.
- Wrote fix-attendance.sql and ran `psql ... -f fix-attendance.sql` to set `attendanceCount = 75` on 3 published sales.
- Original target organizers (user6-8) have no sales in production (seed not re-run) — targeted any 3 published sales instead.
- Storefront visits `/organizer/storefront/cmoqov790025xhbc5v11zy5pi` — "75 attended" confirmed via accessibility tree. Persists after reload. ✅ PASS.
- Backend gap found: `GET /organizers/:id` filters `status: 'PUBLISHED'` only — attendanceCount on ENDED sales never renders. Separate fix needed.

**#124 Rarity Boost:**
- Set `guildXp = 55` on user12 (Leo Thomas) via direct SQL.
- Navigated to `/coupons` as user12 — Rarity Boost button enabled (spendableXp ≥ 50 threshold). Modal opens correctly. ✅ PASS.
- Patrick's session restored after QA.

**seed.ts changes:** Pushed last session (attendanceCount on ENDED sales, user12 guildXp=55) but seed not re-run in production. Data patched directly via SQL.

**Cleanup needed:** Delete `fix-attendance.sql` from project root — it contains production sale IDs and shouldn't be committed.

### S749 — Claim Page QA + P0 emailService Rewrite (COMPLETE)

**Trigger:** Patrick asked for claim page QA. Escalated to P0 when SMTP timeout revealed ALL transactional emails were dead.

**Fixes shipped:**
- **P0: emailService.ts rewrite** — SES SMTP → Gmail API. Same transport pattern as outreach (OAuth2 + `gmail.users.messages.send()`). 35 backend services unblocked. Fire-and-forget `.catch()` on claim route so 201 returns instantly.
- **P1: Claim submit timeout** — `await emailService.send()` blocked HTTP response for 30s+ until SMTP timed out, then threw ERR_HTTP_HEADERS_SENT. Fixed by fire-and-forget pattern.
- **P2: ClaimListingModal dark mode** — Form state had no dark classes. Added `dark:bg-gray-800`, `dark:text-gray-100`, `dark:text-gray-300/400`, `dark:bg-gray-700`, `dark:border-gray-600` to container, heading, labels, inputs, cancel button.
- **P3: /claim landing page** — Created `pages/claim/index.tsx` with 3-step instructions + "Find Your Sale" CTA. Was returning 404.
- **Outreach startup catch-up** — Wired `outreachStartupCatchUp()` into index.ts listen callback (30s delay).

**Verified end-to-end:** Submitted claim for "From Trash To Treasure" organizer → instant success toast → verification email received at deseee@yahoo.com from `find@outreach.finda.sale` with valid verification link.

**Key finding:** Railway Hobby plan blocks SMTP ports (25/465/587) at TCP level. SES SMTP was never going to work without upgrading to Railway Pro ($20/mo). Gmail API over HTTPS (port 443) is the correct bridge until SES approval + plan upgrade. Gmail cap: 2,000 emails/day — sufficient for current volume.

**Files changed:** `packages/backend/src/lib/emailService.ts`, `packages/backend/src/routes/organizers.ts`, `packages/backend/src/index.ts`, `packages/frontend/components/ClaimListingModal.tsx`, `packages/frontend/pages/claim/index.tsx`.

### S748 — Pipeline Deep Audit + Full Fix Batch (COMPLETE)

(Content moved from S748 IN-FLIGHT above.)

(Sessions S747 and older archived — see Current Status section for summaries.)
- Organizer profile UI — correctly renders address/phone/website/contactEmail. Data gap, not display bug.
- ESN address situation confirmed: ESN does NOT provide street addresses at scrape time (city/state only). Organizer contact backfill will help Foursquare/HERE-sourced orgs but not ESN-only. Address enrichment for ESN requires organizerWebsite.ts visiting the organizer's own website.

**Patrick's feedback:** Claude doing surface-level work without deep research into the full pipeline. Next session: Opus deep audit of entire scraping + enrichment workflow before touching anything.

(Sessions S746 and older archived — see Current Status section for summaries.)