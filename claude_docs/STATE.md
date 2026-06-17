# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**S1006 — QA/BUG (2026-06-17). QA of S1005 cart/checkout/GMC fixes. Found + fixed a P1: Buy It Now broken by `automatic_tax` on raw PaymentIntent.**
- **QA-5 Return policy ✅** Chrome — finda.sale/return-policy live, marketplace language ("each seller", "no single blanket return policy"), dark mode clean. (ss_2020ezr74)
- **QA-4 Google Merchant feed ✅** Live feed (67 rows): `image_link` col = 8 Cloudinary, 23 eBay-thumbnail FALLBACK (items w/ no Cloudinary photo), rest full-size/other. **0 rows** where a thumbnail beat an available Cloudinary URL — `isEbayThumbnail` filter works on deployed backend.
- **QA-1 Cart item links ✅** Chrome (user5 shopper) — added Star Raiders to cart, opened CartDrawer, clicked thumbnail in "Saved in Cart (1)" (href=/items/cmo3esog…) → navigated to that item page + drawer closed. (ss_8070oi6kv→ss_670035opy). NOTE: open CartDrawer reliably freezes CDP screenshot capture (overlay quirk) — DOM tools + URL change used for evidence.
- **QA-2 Cart multi-item checkout ⚠️ PARTIAL** — 2 same-sale items ($3.49+$3.99=$7.48 subtotal ✅), "Go to Checkout" replaced the coming-soon toast with a REAL Stripe Checkout Session (redirect to `checkout.stripe.com/c/pay/cs_live_…`, merchant "Patrick Desmond" = Connect routing worked). **Payment-completion → ?checkout=success → items-SOLD webhook UNVERIFIED**: prod is on **Stripe LIVE keys (cs_live_)**, so test card 4242 is rejected and a real charge won't be made in QA; Stripe domain also blocked in QA browser.
- **QA-3 Buy It Now ❌→FIXED CODE-ONLY** — REPRODUCED the "Try Again" error as BOTH user5 (Star Raiders) AND artifactmi (QA Test First Item S983, item cmqer8m8w00x5me4oqoabaulh, sale cmpfplxqbxwtucltmbouvz0os owned by Kelly's Estate Sales — NOT a self-purchase). Live replay: `POST /api/stripe/create-payment-intent` → **400 `{"error":"Received unknown parameter: automatic_tax"}`**. ROOT CAUSE (evidence-first): Buy Now PaymentIntent passed `automatic_tax:{enabled:true}` which the installed Stripe API version rejects on raw PaymentIntents; it's NOT a Connect error so the S1005 Connect-fallback never caught it (S1005 patched the wrong cause). Cart works because Checkout Sessions support automatic_tax + collect a buyer address. **FIX (S1006):** removed `automatic_tax` from createPaymentIntent basePaymentIntentData (stripeController.ts ~L487); the 2 Checkout-Session automatic_tax usages kept. Backend tsc 0 errors (pnpm-store 5.9.3). CODE-ONLY — needs deploy + Chrome re-test.
- **FINDING (Patrick-flagged): production runs Stripe LIVE keys.** All real Buy Now / cart purchases are real charges; QA cannot use Stripe test cards on prod. (Patrick asked this be noted.)
- **TAX DECISION (Patrick, S1006): do NOT collect sales tax until FindA.Sale must register in nexus states.** All 3 `automatic_tax` sites removed from stripeController.ts: createPaymentIntent (Buy Now), createCheckoutSession (PRO/TEAMS subscription), createAlaCarteCheckout ($9.99). Cart checkout never had it. Reason: marketplace-facilitator tax not yet triggered at beta volume; collecting w/o registration is its own liability. Flip back on (per-state) when a tax pro / nexus thresholds say so. Backend tsc 0 errors.
- **Buy Now valid-account path VERIFIED ✅ (deployed fix):** After Patrick pushed+deployed (commit 45829dd), replayed `POST /api/stripe/create-payment-intent` as user5 shopper for an Artifact item (cmo3esog, Artifact's VALID live Connect acct) → **HTTP 200** with clientSecret + purchaseId + totalAmount 3.49. automatic_tax fix confirmed end-to-end. (Did NOT complete the charge — live keys.)
- **Buy Now invalid-account path → GRACEFUL FIX (S1006, CODE-ONLY):** The QA test item (Kelly's Estate Sales, connectId `acct_1T6f2DLlmra0eowv`) failed post-deploy with `400 "No such destination"` — Kelly's is a seed org whose Connect acct doesn't exist on live Stripe. Root cause of the cryptic UX: (a) backend fallback didn't match "No such destination" so it threw raw; (b) **CheckoutModal.tsx never rendered the error message — only a bare "Try Again" link**, so every failure looked identical. FIX (2 files): stripeController.ts createPaymentIntent catch now detects seller-account-unusable errors (No such destination / No such account / account_invalid / account_closed / insufficient_capabilities) and returns 409 with a friendly message "This seller isn't set up to accept online payments yet…" (REMOVED the old silent platform-capture fallback — capturing buyer money you can't route to the seller is wrong; valid accounts never reach this branch so unaffected). CheckoutModal.tsx now renders `{loadError}` text + dark-mode classes. Backend tsc 0 errors; frontend not VM-tsc-verifiable (corrupt node_modules) — change is a trivial render of an existing string. Needs deploy + Chrome re-test.
- **BQ: 0→2** (Buy Now fix CODE-ONLY pending deploy+retest; cart payment-completion path unverified).

**S1005 — DEV (2026-06-17). Google Merchant feed quality fix + cart checkout regression fix + return policy page.**
- **Google Merchant feed (image_link quality):** `googleMerchantFeed.ts` — added `isEbayThumbnail()` filter. eBay CDN thumbnails (`i.ebayimg.com/$_N.JPG` ~180px) excluded from `image_link`/`additional_image_link`. Cloudinary URLs preferred; falls back to any eBay URL only if no Cloudinary photo. Fixes 0% high-res images causing Google "FAIR" store quality score.
- **Cart item links (CartDrawer.tsx):** "Saved in Cart" section — wrapped item thumbnail + title in `<Link href="/items/${item.id}" onClick={closeCart}>`. Cart items now navigate to item page on click, matching the "On Hold" section pattern.
- **Cart checkout wired to Stripe (CartDrawer.tsx + stripeController.ts + stripe.ts):** Replaced "coming soon" toast with real multi-item Stripe Checkout Session. New function `createCartCheckoutSession` — validates items, all same sale, all AVAILABLE, builds `line_items`, uses `payment_method_types: ['card']` (not `automatic_payment_methods`), Connect fallback pattern (try with `payment_intent_data`, catch Connect errors, retry without). New route `POST /stripe/create-cart-checkout-session` (authenticate + paymentLimiter). Webhook extended: `cart_checkout` type → creates Purchase per item, marks all SOLD.
- **Buy Now Connect fallback broadened (stripeController.ts):** `createPaymentIntent` — new `CONNECT_FALLBACK_CODES` Set (`insufficient_capabilities_for_transfer`, `account_invalid`, `account_closed`, `platform_cannot_pay`, `platform_api_key_expired`) + message-based matching ("does not have the necessary capabilities", "No such account"). Fixes "try again" on Buy Now for real Stripe Connect test accounts.
- **Return policy page (return-policy.tsx NEW):** `/return-policy` — marketplace language (each seller sets their own policy, no blanket return window). 6 sections. Matches `privacy.tsx` layout + dark mode. Google Merchant Center can now point to this URL.
- **TypeScript: 0 errors (both packages). BQ: 0 (unchanged).**
- **CODE-ONLY — pending Chrome QA next session.**

**S1004 — QA/RECORDS (2026-06-17). BQ cleared to 0: eBay Queue cron confirmed live + Facebook Connected badge dev fix + SEO5/SEO6 Chrome QA ✅.**
- **BQ item 1 — eBay Queue Mode RESOLVED ✅:** Railway logs confirmed `[eBay Queue] Starting queue cron for 0 organizer(s)` + `[CRON OK] ebayListingQueueCron completed` at 02:30:01 and 03:00:11 — both on */30 schedule. "0 organizer(s)" correct (no org has ebayQueueMode enabled). Cron registered and firing.
- **BQ item 2 — Facebook Connected badge RESOLVED ✅:** platforms.tsx Facebook card now shows green "Connected" badge (bg-green-100/text-green-700) when `facebook?.connected` truthy, "Not connected" badge otherwise. TypeScript: 0 errors. Agent-applied + verified in file.
- **SEO5 — /auctions/grand-rapids-mi CHROME QA ✅:** H1 "Auctions in Grand Rapids, MI" ✅. FAQPage JSON-LD with 7 auction-specific Q&As (bidding, buyer's premiums, consigning, etc.) ✅. No estate-sale/generic bleed-over. Nearby cities present. Meta title: "2 Auctions in Grand Rapids, MI — Find Local Sales | FindA.Sale". ISR serving (not 404). P3: 2 of 5 nearby cities out-of-state (Chicago IL, Toledo OH) — non-blocking. Screenshots: ss_533815fys.
- **SEO6 — /flea-markets/grand-rapids-mi CHROME QA ✅:** H1 "Flea Markets in Grand Rapids, MI" ✅. FAQPage JSON-LD with 5 flea-market-specific Q&As (vendor booths, cash-only, haggling, etc.) ✅. No auction/estate-sale bleed-over. Nearby cities present. ISR serving. Screenshots: ss_0332eyqoc, ss_7930nzpey.
- **BQ: 2→0.**
- PCVs staged for next-session roadmap Chrome col apply (SEO5 + SEO6 cross-session rule).

**S1003 — QA/DEV (2026-06-17). Chrome QA (ISR smoke test + SEO4 human QA + BQ item 2) + Auction/flea-market SEO pages built.**
- **ISR smoke test ✅:** Navigated https://finda.sale/items/cmnzf780a0009pf19ru5qppqn as guest. Full item detail rendered (title, price $285.00, photos, condition). Reloaded — still loaded cleanly (ISR cache serving). Screenshots ss_8940sbrut, ss_03897mqk5.
- **SEO4 Human QA ✅ (PCV staged for next-session roadmap apply):** Navigated https://finda.sale/yard-sales/grand-rapids-mi as guest. H1: "Yard Sales in Grand Rapids, MI". FAQPage JSON-LD present (7 Q&As confirmed via JS). Nearby cities: Detroit MI, Kalamazoo MI, Lansing MI, Chicago IL, Toledo OH. 7 sales shown. Meta: "7 Yard Sales in Grand Rapids, MI — Find Local Sales | FindA.Sale". BreadcrumbList + ItemList + FAQPage all confirmed. Screenshots ss_3207v3q1s, ss_4548wcacx, ss_4234cbvhi.
- **BQ item 2 — fbCatalogEnabled ⚠️ P2:** Tested as user1 via DB flag. Data layer ✅ — "Not connected" badge disappears, count updates (3→4), copy changes to "Updates when you export from your sale". P2 cosmetic gap: no positive "Connected" badge when flag is ON. Replaced BQ entry with badge-specific P2 fix.
- **BQ item 1 — eBay Queue Mode UNVERIFIED:** Railway backend logs empty this session — could not confirm */30 cron fires. BQ item remains.
- **New SEO pages CODE-ONLY:** /pages/auctions/[city-slug].tsx + /pages/flea-markets/[city-slug].tsx built. ISR: revalidate:86400, 47-city prerender, fallback:blocking. Auction: category=auctions (AUCTION saleType). Flea: category=flea-markets (FLEA_MARKET saleType). Full FAQPage JSON-LD, BreadcrumbList, ItemList, nearby city links, empty/error/loading states. cityData.ts extended (getAuctionMeta/Faqs, getFleaMarketMeta/Faqs). server-sitemap.xml.tsx updated (auctionsUrls + fleaMarketsUrls priority 0.70). TypeScript: 0 errors. SEO5+SEO6 rows added to roadmap.md.
- **BQ: 2→2** (fbCatalogEnabled replaced with Facebook Connected badge P2; eBay Queue Mode remains UNVERIFIED).

**S1002 — DEV/RECORDS (2026-06-16). Records pass + ISR conversion for /items/[id].tsx.**
- **Records pass:** SEO4 Claude QA col → ✅ S997. New roadmap rows 548 (Platform Dashboard+Widget ✅ S1001), 549 (eBay Queue Mode ⚠️ S1001), 550 (FB Commerce Manager ✅/✅ S1001) added to Building section. All 7 PCV entries cleared from PCV table.
- **BQ 4→2:** Item 1 (ISR conversion) FIXED this session. Item 2 (FB CM feed link 404) already pushed S1001 (git 392976b2) — cleared. Items 3 (eBay Queue Mode live flip) + 4 (fbCatalogEnabled flag-ON) remain.
- **ISR conversion — packages/frontend/pages/items/[id].tsx** (1392→1398 lines): GetServerSidePropsContext→GetStaticPropsContext+GetStaticPathsResult. getServerSideProps→getStaticProps + getStaticPaths ({paths:[], fallback:'blocking'}). revalidate:3600 on all 5 return paths. context.params was already used. Structurally identical to estate-sales/[city-slug].tsx ISR pattern. 0 import/structural errors.

**S1001 — QA (2026-06-16, Opus). QA pass on S999 + S1000 (Facebook flagged by Patrick). Parallel code audits + live API + Chrome. Found+fixed 1 P1 FB bug.**
- **FB `link` 404 — FOUND + FIXED (severity corrected by live evidence):** S1000's CM feed `link` built `/sales/${saleId}/items/${item.id}` (exportController.ts L981 per-sale + L1093 org-level) → **HTTP 404 proven live** (correct `/items/${id}` → 200). Audit claimed FB would reject every item — **WRONG**: Patrick's live Commerce Manager shows all **103 products Active/in-stock** (catalog ingested fine). Real impact is **click-through** only: a shopper tapping a product in a FB Shop/ad lands on a 404. Downgraded P1→**P2** (click-through correctness, not catalog-blocking). Fixed both lines → `/items/${item.id}`; backend tsc 0 errors. Still worth shipping (non-urgent).
- **Migrations confirmed applied on Railway:** 20260616000001_ebay_queue_mode + 20260616000002_add_organizer_fb_catalog_enabled both present; all 6 columns exist.
- **Parallel code audits (2 read-only agents):** S1000 — all 8 claims implemented correctly, only the `link` scope-miss. S999 — 6 core claims verified, cron genuinely publishes to eBay (not a stub); minor: claimed ebayController queue edits NOT FOUND (no queue code there — harmless); design boundary: queue only publishes items that already have an ebayOfferId (doesn't create offers from scratch — confirm intent).
- **Live API:** GET /api/organizers/cmnxueoas.../export/commerce-feed → HTTP 200, 11 cols incl quantity_to_sell_on_facebook (1=avail/0=sold ✅), brand='' ✅, public (no auth) ✅.
- **Chrome QA (as Artifact MI, real acct) — 5 ✅:** FB CM settings section (ss_6614rpneu), FB CM promote section (ss_799354zpz), /organizer/platforms cards+coverage 40/100 (ss_68954s71x), eBay Listing Queue + PlatformGapPanel "Invisible Inventory 62 items", PlatformHighlightsWidget on dashboard 40%/eBay 1/Google 84/Unlisted 62 (ss_86419jwe2).
- **⚠️ UX finding (minor):** /organizer/platforms first load hit a 429 rate-limit → degraded to MISLEADING state (eBay falsely "Not connected", coverage ring stuck "Loading…" with no error/retry). Clean reload = correct. Recommend an error/retry state on stats failure.
- **Did NOT flip** fbCatalogEnabled or ebayQueueMode on Patrick's real account (persistent side-effects); both render + PATCH/cron code-verified — flip on a test org or Patrick confirms.
- **BQ: 9→4.** Staged 5 PCVs for next-session roadmap apply.

**S1000 — DEV (2026-06-16). Facebook Commerce Manager overhaul — 8 issues fixed.**
- **Root cause (ArtifactMI error report):** All 10 CM items "Not visible in Shops" — single missing field `quantity_to_sell_on_facebook`. Audit surfaced 7 additional FB integration gaps.
- **Issue 1 (CRITICAL):** Added `quantity_to_sell_on_facebook` to `exportCommerceManagerFeed` — `1` for AVAILABLE, `0` for SOLD.
- **Issue 2 (HIGH):** Fixed `brand` fallback from `'N/A'` → `''` (FB spec requires empty string for unknown brand).
- **Issue 3 (HIGH):** New organizer-level CM feed endpoint: `GET /api/organizers/:organizerId/export/commerce-feed` — stable URL across all active sales. Per-sale endpoint kept for backward compat.
- **Issue 4 (MEDIUM):** Added `Organizer.fbCatalogEnabled Boolean @default(false)` + `fbCatalogRegisteredAt DateTime?`. Migration: `20260616000002_add_organizer_fb_catalog_enabled`. `platformStatsService` now uses flag for facebook.connected + facebook.listed.
- **Issue 5 (MEDIUM):** Settings page — new "Facebook Commerce Manager" section with feed URL + registration toggle. PATCH /organizers/me handles `fbCatalogEnabled`.
- **Issue 6 (LOW):** `facebookNudgeService` routes to `business.facebook.com/commerce` for CM users, `facebook.com/marketplace/selling/` for Marketplace users.
- **Issue 7 (LOW):** `formatFacebookCsv` in `exportService.ts` marked `@deprecated` (not deleted — removal gate).
- **Issue 8 (LOW):** Promote page — Commerce Manager section with organizer-level feed URL + copy button.
- **Schema:** Migration `20260616000002_add_organizer_fb_catalog_enabled` — Patrick MUST run `prisma migrate deploy` + `prisma generate`.
- **TypeScript:** 0 errors (both packages). ADR saved to `claude_docs/feature-notes/adr-facebook-commerce-manager-2026-06-16.md`.
- **QA:** CODE-ONLY — pending Chrome verification. 4 items added to Blocked Queue.
- **BQ delta:** 5 → 9.

**S999 — DEV (2026-06-16). Platform Metrics Dashboard + eBay Queue Mode engine shipped.**
- **Shipped:** 12 files — 4 new backend (platformStatsService.ts, platformStatsController.ts, ebayListingQueueCron.ts, 5 new routes), 3 new frontend (platforms.tsx, PlatformHighlightsWidget.tsx, PlatformGapPanel.tsx), 5 modified (organizers.ts, index.ts, ebayController.ts, dashboard.tsx).
- **Schema:** 4 new fields — Item.ebayQueuedAt, Item.ebayListedAt, Organizer.ebayQueueMode, Organizer.ebayQueueRotation. Migration: 20260616000001_ebay_queue_mode.
- **Status:** Pushed. Patrick MUST run `prisma migrate deploy` before backend will start correctly.
- **Build fixes:** Removed TanStack Query v5-incompatible `onSuccess` + `keepPreviousData` → useEffect + `placeholderData` pattern in PlatformGapPanel.tsx and platforms.tsx.
- **TypeScript:** 0 errors. All pushes completed.
- **QA:** CODE-ONLY — pending Chrome verification. 4 items added to Blocked Queue.
- **BQ delta:** 2 → 5.

**S998 — BUG (2026-06-16). eBay bidirectional sync restored — Trading API now always runs after Inventory API.**
- **Root cause (tool-cited):** `importInventoryFromEbay` in `ebayController.ts` had `if (totalFetched === 0)` guard before the Trading API `GetMyeBaySelling` block. ArtifactMI has 18 Inventory API items → `totalFetched = 18` → guard prevented Trading API from running → 75+ classic eBay listings (created directly on eBay, not via FindA.Sale) never synced. Items showed "Push to eBay" despite being live on eBay.
- **Fix (commit 5e517cf7):** Changed `if (totalFetched === 0) {` to a bare block `{`. Trading API now always runs after Inventory API loop. Dedup (`prisma.item.findFirst({ OR: [{ebayListingId: storedId}, {ebayListingId: ebayItemId}] })`) handles items found by both paths safely.
- **Also shipped:** `seed.ts` — user1 no longer seeded as ADMIN + eBay connection removed (commit 97e78a3f).
- **Patrick confirmed:** "wrap it synced now" — post-deploy sync ran and imported classic listings.
- **Pending:** 4 UNPUBLISHED items (Loy Norrix Choirs offerId=166668232011, Kirkland Pepper offerId=166412704011, Whip-It Butane offerId=151850469011, Contigo Travel Mug offerId=151769728011) have offers on eBay but no ebayListingId in DB — need ebayOfferId backfilled to publish from FindA.Sale.
- **BQ delta:** 2 → 2 (unchanged).

**S997 — SEO/DEV (2026-06-16). Yard-sales Chrome QA verified + GSC sitemap itemUrls fix.**
- **Chrome QA (S995 fix confirmed):** Navigated https://finda.sale/yard-sales/grand-rapids-mi as logged-in user. H1 = "Yard Sales in Grand Rapids, MI" ✅. About section = yard-sale copy (not Dutch heritage text) ✅. 7 yard-sale FAQs rendered ✅. 5 nearby city links (Detroit, Kalamazoo, Lansing, Chicago, Toledo) ✅. 7 sale listings ✅. FAQPage JSON-LD in source (BreadcrumbList + ItemList + FAQPage confirmed) ✅. Screenshots: ss_14861obk4, ss_59206270m, ss_6493n5xfp. PCV staged for S998 roadmap Chrome column update (per cross-session rule).
- **GSC P1 fix — server-sitemap.xml.tsx:** Removed itemUrls block (try/catch calling /items/sitemap + itemUrls map + ...itemUrls spread). 255→241 lines. ~10,000 /items/{id} SSR leaf pages removed from sitemap — crawl budget freed for city/sale/guide pages. Comment added explaining the intentional exclusion. TypeScript: 0 errors. 1 file changed.
- **BQ: 3→2** (sitemap itemUrls CLEARED; items ISR conversion remains P1).

**S996 — BUG (2026-06-16). eBay sold sync window fix — 90-day creationdate replaces 7-day lastmodifieddate.**
- **Root cause:** `ebaySoldSyncCron.ts` used `lastmodifieddate` filter (7-day window) on the eBay Fulfillment API. A settled order (paid + shipped quickly) has its `lastmodifieddate` frozen within hours of creation. After 7 days it falls outside the window permanently — the cron never sees it again. Items sold on eBay were never marked SOLD on FindA.Sale.
- **Fix:** Changed filter to `creationdate:[now-90d..now]`. `creationdate` is immutable — an order placed 60 days ago always appears in a 90-day window until day 91. Idempotency preserved: cron pre-filters to AVAILABLE items only so already-SOLD items are never re-processed.
- Backend TS 0 errors. 1 file: `packages/backend/src/jobs/ebaySoldSyncCron.ts`.

**S993 — BUG/DATA (2026-06-16). Outreach pipeline root-cause fix — ARCHIVED rows + Prisma NULL-exclusion bug.**
- **Why ARCHIVED?** No application code ever sets DCE.status='ARCHIVED'. All rows were set via direct SQL in past maintenance sessions. Undocumented unofficial status.
- **Root cause of auto-seed underperformance (Prisma NULL bug):** `autoSeedOutreachCron.ts` used `NOT: [{ emailDiscoveryConfidence: 0.0 }]` → SQL `NOT (col = 0.0)` → PostgreSQL NULL comparison returns NULL (not true) → 12,136 organizers with NULL confidence (scraped emails, labeled "trusted" in comments) silently excluded. Only ~329 positive-confidence orgs ever passed. This is why the pipeline only sent 848 emails despite 80,852 organizer records.
- **Data fix (SQL):** Reset 2,276 ARCHIVED rows (0 attempts, valid biz categories, non-junk domains) back to PENDING. Kept 422 ARCHIVED (government, Canadian, mall cos., tech/font/junk). Queue after: PENDING 2,292, SENT 699, ARCHIVED 422, OPTED_OUT 1.
- **Code fix — autoSeedOutreachCron.ts:** (1) Null-safe Prisma filter: `AND:[{OR:[{emailDiscoveryConfidence:null},{emailDiscoveryConfidence:{gt:0}}]}]` + Canada NOT appended separately. (2) Email dedup query now excludes ARCHIVED rows so an ARCHIVED email can't permanently block a new seed.
- **Code fix — seedDirectoryClaimEmails.ts:** Same null-safe Prisma filter (was identical bug in the manual seed script).
- TypeScript: 0 errors. 2 files changed. 6,077 novel organizers now eligible to seed (up from ~329).
- **S993 continued — RDAP Stage 3 implemented (emailDiscoveryService.ts):** `lookupRdapEmail()` via `https://rdap.org/domain/{domain}` (universal TLD router, 8s timeout), vCard 4.0 parser, 13-domain privacy-proxy filter (whoisguard.com, domainsbyproxy.com, etc.), role-priority walk (registrant→admin→technical), nested entity support. Wired into `discoverEmail()` as Stage 3 fallback after Stage 1 scrape miss. Confidence base 0.80 (high signal — registrant's own registrar email). `toDiscoveryMethod('whois')` now returns `'whois_rdap'` (was `'pattern_match'`). TS 0 errors. 1 additional file. 5,057 organizers with website but no email are now addressable via RDAP on next discovery run.

**S992 — SEO/DEV (2026-06-16). Analytics OAuth restored + city SEO framework built + estate-sales landing pages upgraded.**
- Analytics pipeline: created `claude_docs/scripts/oauth_setup2.py` (missing file referenced by scheduled task), repaired truncated `.analytics-creds.json`, ran weekly report successfully. OAuth re-auth flow documented.
- New file: `packages/frontend/lib/seo/cityData.ts` — reusable SEO framework for all city/category landing pages:
  - 50+ city `CITY_DATA` lookup with unique `knownFor`, `tip`, and `nearbySlugs` per city
  - Builders: `getCityMeta`, `getEstateSalesFaqs` (7 city-specific FAQs), `buildFaqJsonLd` (FAQPage JSON-LD), `buildSeoTitle` (count-aware, hits multiple query variants), `buildSeoDescription`, `getNearbyLinks`
  - Designed for reuse by: `/yard-sales/[city-slug]`, `/auctions/[city-slug]`, `/flea-markets/[city-slug]` (next session)
- Updated: `packages/frontend/pages/estate-sales/[city-slug].tsx` — consumed the framework:
  - Birmingham AL + Long Beach CA added to prerender list (GSC fix — both showing impressions at pos 27+, zero clicks)
  - Prerender list expanded to 45 cities covering all known GSC impression markets
  - FAQPage JSON-LD schema on every page (Google rich result eligibility)
  - City-specific About section (`knownFor` + `tip` — no more identical boilerplate on every page)
  - Nearby cities section (internal link equity across city pages)
  - Empty-state nearby city links (reduces pogo-stick on zero-sale pages)
  - Count-aware title: `"51 Estate Sales in Denver, CO — Find Local Sales | FindA.Sale"` (multi-variant)
- TypeScript: 0 errors (frontend tsc clean). BQ unchanged = 1.
## Next Session
- ⚠️ FRONTEND NOT TSC-VERIFIED (VM node_modules corrupt): EbayCategoryPicker prefill, CatalogSuggestionPanel, edit-item panel render. Verify in a real build / Chrome before trusting.
- When eBay Buy-API grant lands: ebayCatalog provider activates automatically — verify it returns identifiers/dims; consider adding get_product/{epid} for fuller aspects.
- Optional: Go-UPC paid provider is wired but OFF (set GOUPC_API_KEY to enable; cache makes it ~once-per-product).
- Chrome QA: verify CatalogSuggestionPanel renders + accept fills fields; verify live title-edit propagation end to end as an organizer.
- Frontend "tie-it-together" UX polish for enrichment suggestions if desired.

**S975 LIVE-LISTING EDIT PROPAGATION FIXED — backend-tsc clean, push pending:** Patrick: customers WILL want to edit live titles — must propagate. Root cause (proven via direct eBay API: PUT inventory_item new title + POST offer/publish → 200, live title updated): the sync updated the eBay inventory item but NEVER republished the offer, so edits never reached the live listing. eBay only reflects changes to shoppers after a republish. FIX: added `republishEbayOffer` + `syncListedItemFieldsToEbay` helpers (itemController) — GET offer (real SKU) → GET-merge-PUT inventory → republish; non-fatal, 25402 business-policy warning treated as success. Wired republish into PushSync (after price+inventory PUTs, gated on pushedFields>0 && ebayOfferId). /reanalyze-item now syncs+republishes title/desc/condition on apply for listed items (category drift detected+reported, NOT pushed — eBay locks primary category on active listings → needs end+relist); response adds ebaySynced/ebaySyncReason/ebayCategoryLocked. Files: itemController.ts, internal.ts. Backend tsc 0 errors. (Pump's live title already corrected manually via direct PUT during diagnosis — listing now fully correct: "Danner Manufacturing AP-40 Air Pump, Aquarium" / Pet Supplies 100351 / $32 flat.)

**S975 PRODUCT ENRICHMENT CASCADE — built (Architect ADR-enrichment-cascade-2026-06-14), backend-tsc clean, needs DDL + push, then pump test:** Provider-cascade `enrichItem(item, ctx)` in new productEnrichment.ts — runs free-first, first-non-null-per-field, cached by identifier, NEVER throws. Providers: localBarcode (decoded UPC/EAN, no API, conf 1.0) → openLibrary (ISBN, free, live-verified) → openFoodFacts (grocery UPC → brand + product_quantity g→oz, free, live-verified) → ebayCatalog (wraps enrichItemFromCatalog; null on current 403, lights up on Buy-API grant) → goUpc (PAID, env-gated OFF via GOUPC_API_KEY) → aiEstimate (dims fallback). NO GS1. Apply rule (planEnrichmentApply): auto-apply when source∈{barcode,openLibrary,openFoodFacts,ebayCatalog,goUpc} OR conf≥0.85, EMPTY fields only (organizer wins), dims only if !packageConfirmedByOrganizer; else → catalogSuggestions. Haiku one-pass now reads visible UPC + HARD no-fabrication rule (never invent a UPC/dims from memory). Decoded barcode stored straight onto upc/ean (no API). Wired into batchAnalyze + processRapidDraft + /reanalyze-item. Reuses Item.catalogSuggestions column (needs the DDL run). Comps model-token filter + AI model capture from prior build intact. Files: productEnrichment.ts(new), cloudAIService.ts, batchAnalyzeController.ts, processRapidDraft.ts, internal.ts (+ prior catalog-enrichment: schema.prisma, ebayCatalogLookup.ts, ebayController.ts). Backend tsc 0 errors. NEXT: run catalogSuggestions DDL on Railway → push all → re-analyze pump w/apply to test full chain (Vintage gone, Pet Supplies cat, model-enforced comps, enrichment). Frontend Accept-suggestion UI = follow-up.

**S975 CATALOG-ENRICHMENT FEATURE — backend built (Architect-spec'd ADR-catalog-enrichment-2026-06-14), backend-tsc clean, NEEDS schema DDL + push, then pump test:** Confidence-gated product enrichment: barcode→catalog (full incl dims) or brand+model→eBay Catalog (epid+matched title; searchCatalogProduct returns only epid/title/brand — NO mpn/upc/dims, so dims still come from barcode path or AI estimate). HIGH (≥0.85) auto-fills EMPTY identifier fields + dims (only if !packageConfirmedByOrganizer); below-0.85 → Item.catalogSuggestions Json (one-click accept, edit UI follow-up). Comps now enforce a model token (query + post-filter) → fixes AP-4/AP-100 noise + skewed price. AI prompt now captures a visible model/part number → mpn (evidence-only). Wired into batchAnalyze, processRapidDraft, /reanalyze-item. NEW additive column Item.catalogSuggestions Json? (Railway build runs prisma generate → client learns it on deploy). Files: schema.prisma, cloudAIService.ts, ebayCatalogLookup.ts, ebayController.ts, batchAnalyzeController.ts, processRapidDraft.ts, internal.ts. Backend tsc 0 errors. NEXT: run DDL (ADD COLUMN catalogSuggestions JSONB) on Railway → push code → then re-analyze pump with apply to test full chain. Frontend "Accept suggestion" UI = follow-up (frontend tsc unverifiable in VM).

**S975 ON-DEMAND RE-ANALYZE CAPABILITY (admin/internal) — built, backend-tsc clean, push pending:** Patrick wants Claude/admin to be able to re-analyze an existing item on demand (no user-facing button needed). Built `POST /api/internal/reanalyze-item` (requireSecret, header x-internal-secret === OUTREACH_SECRET; not CSRF/user-auth so Claude can call it directly). Body `{itemId, apply?}`. Downloads up to 5 item photos → analyzeItemImages (the deployed FIXED multi-image prompt) → re-resolves eBay category via suggestEbayCategoryForTitle → returns {before, after}; apply=true writes title/description/category/condition/conditionGrade/tags + ebayCategoryId/Name (NEVER price — organizer pricing wins). File: routes/internal.ts (+ imports axios, analyzeItemImages, suggestEbayCategoryForTitle). TS 0 errors. NEXT: deploy → Claude calls dry-run on the pump (cmqbb252i000i60qq7eilco9z) to show before/after (verify Vintage drops), then apply + fresh eBay push. Needs OUTREACH_SECRET value to call.

**S975 — BUG/AUDIT (2026-06-13, Opus). Verified-not-trusted review of the "Begin 973 autonomously" Sonnet run (logged S973+S974). Conclusion: the eBay system is HEALTHY; the panic was self-inflicted.**
- **Root cause of the whole mess FOUND (tool-cited):** Sonnet added the `sell.logistics` OAuth scope (commit c412281a) → eBay rejected with `invalid_scope` → the artifactmi eBay connection broke → Sonnet told Patrick to disconnect/reconnect. Scope was then removed (commit 52e73d80, verified absent from current scope list ebayController.ts L1421-1424). The reconnect — not any policy problem — is what spawned all the confusion.
- **"Policies weren't synced" = FALSE (verified via live eBay API).** GET /sell/account/v1/fulfillment_policy with artifactmi's live token (valid till 03:00 UTC) → 23 policies. ALL 14 weightTierMappings IDs, calc default 295011801011, media-mail 295438565011, local-pickup 297301122011 are present + valid. EbayPolicyMapping created 2026-04-15 (Patrick's own config). Disconnect/reconnect does not delete eBay business policies — they belong to the account, not the OAuth token.
- **Production is healthy:** Railway backend `{"status":"ok"}`; OAuth scopes clean; NO junk "FindA.Sale Flat $X.XX" policies have been created on the real account yet.
- **Danner pump (cmqbb252i000i60qq7eilco9z):** offer 186196728011 PUBLISHED on eBay (137411858004) with calc policy 295011801011 applied (correct for an 11lb item). BUT in our DB brand=NULL, mpn=NULL (S971's claim that Danner/AP-40 were set is stale/false), category=179986 "Other Fish & Aquarium Supplies" (the catch-all S971 meant to avoid), ebayNeedsReview=true. A clean re-push wants brand=Danner/mpn=AP-40 set + a leaf category.
- **Shipped code judged individually:** KEEP — brand/mpn/upc added to getItemById select (itemController L533-535, verified present); ShippingNetPreview wired into edit-item (L36/L1457, verified); err:216314 packageType-strip-on-calculated guard; FVF flat-rate service (Option B — Patrick explicitly wanted this). DEAD-BUT-HARMLESS — Logistics-API live-rate path (scope removed, always falls back to the rate table). Nothing needs reverting.
- **STATE/doc accuracy issues from the Sonnet run (now corrected):** claimed commit 11cfb344 = 3 files incl. new ebayFlatRatePolicyService.ts — actually 1 file (ebayCalculatedPolicyService.ts, −74 lines, removing the mistaken $1.50 Option-A handling fee); claimed pump brand/mpn set — actually null; flagged tier-IDs as "unknown source / routing may be broken" — false. BQ: 2 → 2 (both rows reworded to reflect verified-healthy reality; no real blocker remains, only optional Chrome re-test).

**S975 PROPER E2E QA (Chrome, logged in as Artifact MI — real account, real pushes):**
- **New edit-item features all render ✅:** Brand/MPN/UPC fields (ss_2026bnuy5); Shipping Dimensions pre-fill Box(standard)/176oz/12×9×7 (ss_8586m0neb); ShippingNetPreview "Buyer pays ~$20.38 / net $145.59" (ss_8578c0h7p); Suggest-price 20/30/40% margin buttons (ss_8578c0h7p). 
- **Butter Knife (4oz) re-push ✅ E2E:** eBay offer 186848465011 PUBLISHED, fulfillmentPolicyId=295437504011 "4oz Ground Advantage $6.65", categoryId=20099 Flatware (correct leaf), ebayNeedsReview=false. FLAT_TIERS weight-tier routing correct (verified via live eBay Inventory API).
- **Danner pump (176oz) re-push ❌ BLOCKED → REAL BUG FOUND + FIXED:** push returned the SHIPPING_TIER_GAP toast (ss_75467502z), ebayNeedsReview set true. Root cause proven via live eBay API (POST fulfillment_policy → HTTP 400 errorId 20403 / LSAS 216018 **UNKNOWN_SHIPPING_SERVICE_CODE: USPSGroundAdvantage**): `ebayFlatRatePolicyService.ts` builds the FVF flat-rate policy with `shippingServiceCode:'USPSGroundAdvantage'` (carrier-specific, CALCULATED-only) — eBay rejects it for FLAT_RATE → ensureFvfFlatRatePolicy returns null → gap guard falls through to the block. This is the SAME bad code S974 already fixed in the sibling calculated service but missed here. **FIX APPLIED S975:** USPSGroundAdvantage/USPS → ShippingMethodStandard/GENERIC (the exact code the organizer's own working flat-rate tier policies use — e.g. 295437504011). Backend TS 0 errors. Needs deploy + pump re-push to confirm it publishes at ~$23.59 with a "FindA.Sale Flat $23.59" policy.
- **Minor UI gaps (non-blocking):** (1) Category field renders empty on edit-item load though DB has ebayCategoryId 179986 — pre-fill needs ebayCategoryName which is null. (2) Butter Knife shipping preview shows "Could not estimate shipping right now" (no package dims). 
- **No junk policies created on the eBay account** (the diagnostic POST 400'd, nothing persisted).
- **Files changed S975:** packages/backend/src/services/ebayFlatRatePolicyService.ts (fix), claude_docs/STATE.md, claude_docs/patrick-dashboard.md.

**S975 SMART FLAT-RATE ENGINE BUILT (Patrick-approved design, ADR-smart-flat-rate-shipping-engine-2026-06-14):**
- Multi-carrier cheapest-rate (USPS/UPS/FedEx Ground, per-carrier dim divisor) priced at the organizer's FARTHEST-CONUS coverage zone (per-origin, from geocoded lat/lng or ZIP fallback), FVF gross-up (÷0.864), rounded UP into a bounded reusable bucket ladder ($0.50/$1/$2.50/$5 steps). Never falls back to eBay calculated (removed). Block-for-details when weight/dims missing.
- Numeric check: 11lb pump (zone 7) → cheapest USPS $26.99 → gross $31.24 → bucket **$32.00** (vs old $75 catch-all). Light 4oz → USPS wins. Bucket ladder rounds up + stays bounded.
- Files: ebayRateEstimateService.ts (+182 lines: UPS/FedEx tables, coverageZoneForOrigin, estimateCheapestRate, computeCheapestForOrigin, CARRIER_TABLES + effectiveDate/source consts), ebayFlatRatePolicyService.ts (cheapest-carrier + roundUpToBucket rewire), ebayController.ts (calc fallback removed → SHIPPING_POLICY_UNAVAILABLE soft-block).
- **VERIFIED:** full backend tsc (typescript 5.9.3 from pnpm store) = 0 errors. NOTE: the workspace `npx tsc` is broken (Cannot find module ../lib/tsc.js) → it silently "passes" without checking. Always run tsc via `node node_modules/.pnpm/typescript@*/node_modules/typescript/lib/tsc.js` for a real check.
- ⚠️ **UPS/FedEx rate NUMBERS are best-available ESTIMATES** (flagged in-code with the S975 verify comment) — replace with Patrick's Pirate Ship UPS/FedEx rate card. USPS table is the real Pirate Ship data. Structure/logic are correct regardless.
- ⚠️ **SUBAGENT WRITE TRUNCATION (recurring):** the findasale-dev dispatch silently truncated ebayRateEstimateService.ts (→107 lines, mid-array) and ebayFlatRatePolicyService.ts (→189 lines, mid-statement) while reporting success. Caught via line-count/tail verification; both restored from HEAD and rebuilt via verified bash writes in the main session. Reinforces: never trust subagent Write without wc -l + tail + real tsc.
- **Rate-staleness mechanism:** monthly Cowork scheduled task created to flag when carrier rate tables age past reprice windows (Patrick requirement).
- **PUSH BLOCK (6 files):** ebayRateEstimateService.ts, ebayFlatRatePolicyService.ts, ebayController.ts, ADR doc, STATE.md, patrick-dashboard.md. After deploy: re-push Danner pump to confirm it publishes at the bucketed flat rate (no SHIPPING_TIER_GAP block).

**S975 POST-DEPLOY VERIFICATION + packageType bug (cache-bust deploy):**
- Engine deploy was stuck — Railway served pre-fix code despite "green" (the green deploy was an OLD commit; 611cf463/b679d89d builds weren't live). Forced redeploy via Dockerfile.production cache-bust (line 2 date bump). After that, ENGINE CONFIRMED LIVE.
- **ENGINE VERIFIED ✅ (live):** re-pushing the pump made the app create "FindA.Sale Flat $32.00" policy (id 316596123011) on the real eBay account — exact predicted bucket (USPS z7 via ZIP 49079 → FVF gross-up → $1 ladder). Smart flat-rate engine works end-to-end in production. (Also a manual test policy "FindA.Sale Flat $35.00" id 316580545011 exists — UNUSED orphan from a diagnostic create; safe to delete on eBay.)
- **NEW BUG FOUND + FIXED — packageType MAILING_BOX (err 25101 / 216305 MailingBoxes):** pump push then failed at inventory-item create with "Failed to create inventory item: 400". Real eBay error pulled by replaying the PUT directly: errorId 25101 "Invalid <ShippingPackage>" / err:216305|MailingBoxes — eBay rejects packageType MAILING_BOX for an ~11lb / 12×9×7 parcel (too big for a mailing box). Replaying the PUT WITHOUT packageType → HTTP 200. Root cause: the packageType strip (ebayController.ts L2225) only fired for routingReason 'calculated-default'; the new flat-rate paths (fvf-flat / tier-gap-fvf-flat) didn't strip it → MAILING_BOX reached eBay. This is exactly why the pump "listed fine yesterday" (calculated path, stripped) but failed today (flat-rate path). FIX: broadened the strip to calculated* + fvf-flat* + tier-gap-fvf-flat* routing reasons. Real tsc 0 errors.
- NOTE: during the diagnostic replay I PUT the live pump inventory item without packageType (200), so its inventory item is currently valid; a fresh app push (post-deploy) will apply the $32 policy + republish + clear ebayNeedsReview.
- **PUSH BLOCK (this fix): packages/backend/src/controllers/ebayController.ts** (+ STATE.md, patrick-dashboard.md). After deploy: final pump re-push → expect publish at $32 flat, ebayNeedsReview cleared.

**S975 CATEGORY RESOLVER FIX (domain-aware) — built, backend-tsc clean, pending deploy+test:**
- Root cause of the pump listing in "Bait Buckets" (eBay cat 179986, under Sporting Goods›Fishing): the PUSH resolver suggestEbayCategoryForTitle re-sorted eBay's category suggestions DEEPEST-FIRST and picked the most specific leaf — eBay returns bait-bucket aerator categories for "Air Pump/Aerator", so depth-sort promoted Bait Buckets over the correct aquarium category. The S971 catch-all skip compounded it. NOT the camera (the blank Category field = push path saved id only, no name). Confirmed via eBay UI breadcrumb + code read.
- FIX (ADR-ebay-category-resolver-domain-aware-2026-06-14): removed depth re-sort; added ebayTopLevelForDomain map (aquarium/aerator/pet→Pet Supplies, +14 domains); suggestEbayCategoryForTitle now domain-aware — prefers candidates whose ancestor path matches the domain, in eBay relevance order, skipping catch-alls. Domain detected from AI category hint AND TITLE (the pump's AI category was wrongly "Electronics"; title "Aquarium Aerator" carries the real signal). All push save-sites now persist ebayCategoryName; both camera + push paths share the resolver; edit-item picker shows the saved name. Backend tsc 0 errors (typescript@5.9.3 from pnpm store; workspace npx tsc is broken). Frontend EbayCategoryPicker.tsx = 1-line useEffect dep add — not tsc-verified (frontend node_modules corrupted in VM), trivial/error-neutral.
- Files: ebayController.ts, batchAnalyzeController.ts, EbayCategoryPicker.tsx, ADR doc.
- TEST PLAN (post-deploy, Patrick-approved "fix it for real"): clear pump cmqbb252i000i60qq7eilco9z ebayCategoryId/Name → null, re-push as artifactmi → expect a Pet Supplies aquarium category (NOT Bait Buckets), $32 flat policy intact, name shown in edit UI.
- FOLLOW-UP (separate): AI category misclassification (air pump → "Electronics") is a cloudAIService accuracy issue, not fixed here; resolver now tolerates it via title-based domain detection.

**S975 AI CATEGORY ACCURACY FIX (cloudAIService prompt) — built, backend-tsc clean:** Root cause of "Electronics" for an aquarium pump: the AI category enum (cloudAIService L184 + L748, single + multi-image prompts) was a too-small generic list (Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Jewelry, Toys, Sports, Collectibles, Glassware, Linens, Other) with NO Pet Supplies / aquarium option — so a powered device got forced into "Electronics". FIX: expanded both enums to 24 domains aligned with eBay L1 + the resolver's ebayTopLevelForDomain map (added Pet Supplies, Consumer Electronics, Musical Instruments, Health & Beauty, Baby & Kids, Automotive, Home & Garden, Pottery & Ceramics, Crafts, Office Supplies, Shoes, etc.), and added a USE/DOMAIN instruction: "categorize by what the item is FOR, not its materials or whether it plugs in (an aquarium air pump is Pet Supplies, not Electronics)". Affects new analyses only (doesn't re-run the photo flow on existing items). Backend tsc 0 errors. File: cloudAIService.ts. 

**S975 PushSync + Logistics fixes + Vintage root cause (from Patrick's Railway logs):**
- Logs CONFIRMED category fix works live: `[eBay Taxonomy] hint="Electronics" → 100351 (Pumps (Air)) [domain-matched]` + `[eBay Offer] stale category detected ... had=179986 want=100351 — deleting + recreating`.
- **PushSync 400 FIXED:** background price/title sync (itemController ~L1360) was sending PARTIAL bodies to eBay PUT (=full replace) + the BARE SKU `FAS-${id}` → HTTP 400 (silently failing all inline edits). Fix: GET-merge-PUT — GET the full offer (real SKU from offer.sku), merge price, PUT full; GET the full inventory item, merge title/desc/condition (preserving imageUrls/aspects/packageWeightAndSize), PUT full. Non-fatal path preserved.
- **Dead Logistics call DELETED:** getEbayLiveShippingRate (always 400 errorId 2004, fell back to rate table) + its 2 call sites removed; estimateBuyerShippingRate used directly. grep getEbayLiveShippingRate = 0.
- **Vintage root cause:** stored title ("...Aquarium Aerator, Vintage") + tags ['Vintage','1980s'] are STALE from the pre-fix analysis. Grep confirms NOTHING re-applies them (no re-analysis on push/edit/sync). The AI accuracy fix is forward-only; the pump's stored fields are untouched. Proper fix = re-analyze the pump's photos (would clear Vintage AND verify the fixed prompt). NOT a manual title edit.
- Backend tsc 0 errors. Files: itemController.ts, ebayController.ts.

**S975 ✅ CATEGORY FIX FULLY VERIFIED LIVE (root cause = active-listing category lock):** The earlier "taxonomy returns nothing" finding was a MISREAD — taxonomy/token/proxy/deploy all proven healthy (Logistics 400 in Railway logs confirmed the app token authenticates; external replays of the exact ?action=token→taxonomy chain returned 8 suggestions incl. 100351 Pumps Air). The real reason re-push left category null: **eBay does not allow changing the PRIMARY category of an already-live listing**, so the resolver's pick was rejected and rolled back (25005-class). FIX/TEST (Patrick-approved): withdrew offer 186196728011 (ended listing 137411858004) → re-pushed fresh. Result: NEW listing, ebayCategoryId=100351 "Pumps (Air)" (Pet Supplies › Fish & Aquariums), ebayCategoryName saved, shipping policy 316596123011 "FindA.Sale Flat $32.00" intact, needsReview=false. Domain-aware resolver + L1 single-source CONFIRMED WORKING in production. (NOTE: existing pump TITLE still contains "Vintage" — forward-only AI accuracy fix doesn't retroactively edit it; manual title edit or re-analysis needed to drop it.)

**S975 ⚠️ PROD ISSUE FOUND — eBay Taxonomy API returns no category candidates:** Pump category test (resolver deployed via 74bd6c17+bec179c7, green): cleared pump cmqbb252i000i60qq7eilco9z ebayCategoryId/Name → null, re-pushed TWICE. Both times republished clean ($32 policy 316596123011 intact, needsReview=false) but ebayCategoryId stayed NULL and offer stayed in 179986 (Bait Buckets). Code path confirmed (ebayController L2155 calls suggestEbayCategoryForTitle when categoryId null), so suggestEbayCategoryForTitle returned null → getEbayCategoryCandidates → get_category_suggestions returned 0 candidates → resolver can't categorize ANYTHING (not just the pump). Depends on eBay APP token (EBAY_CLIENT_ID/SECRET in Railway, not seller OAuth). Likely cause: app token expired/rotated/rate-limited/misconfigured; recent redeploys cleared the in-memory token cache and exposed it. NEEDS: Railway backend log line `[eBay] EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not configured` OR `[eBay Taxonomy] getCategorySuggestions <status>` to pinpoint. The resolver CODE is verified correct — blocked on the taxonomy API/app-token being live. (Decade prompt instruction loosened per Patrick: era allowed with reasonable evidence, not forced; Vintage stays evidence-required.)

**S975 AI ACCURACY PASS (prompt over-labeling) — backend-tsc clean:** Patrick: "why listed Vintage? it's not old." Root cause: cloudAIService prompt (both single+multi-image, L188/L752) said `Always include "Vintage" or "Antique" when applicable` + title guideline `Include decade if identifiable` — no evidence requirement, so a worn modern pump got tagged Vintage/1980s. Same pattern as the category bug (prompt pushes a confident guess). FIX (3 edits ×2 prompts): (1) added "Accuracy over richness: only state attributes you can SEE/verify; when unsure, omit rather than guess"; (2) era/decade only from datable marks/manufacture date/period styling, never guess from wear; (3) Vintage(~20yr)/Antique(~100yr) only with real evidence of age, omit when unclear. Forward-only (affects new analyses, not the existing pump's saved title). Backend tsc 0 errors. File: cloudAIService.ts. Push pending.

**S975 SINGLE-SOURCE eBay L1 CATEGORIES (clean refactor) — backend-tsc clean:** Patrick's "why a few fixed categories anyway?" → item.category is documented (schema.prisma:1026) as an eBay L1 name powering shopper browse pages (/categories/[x]), city pages, and wishlist matching, so a constrained list is correct — but the list had DRIFTED into a small generic set missing whole domains. FIX: new shared module packages/backend/src/config/ebayCategories.ts exports EBAY_L1_CATEGORIES (28 canonical eBay US L1 names) + domainToL1(text) (exact-L1-match → keyword map → []). Both the AI prompt (cloudAIService, 2 prompts now interpolate the constant) and the resolver (ebayController ebayTopLevelForDomain → domainToL1) read from it — they can no longer drift. item.category is now a true eBay L1 name. Backend tsc 0 errors.

**S975 FINAL ✅ FULLY VERIFIED (live, post-packageType-fix deploy):** Danner pump re-push → toast "Item listed on eBay" (ss_4305vnsyw); DB ebayNeedsReview=FALSE; eBay offer 186196728011 PUBLISHED with fulfillmentPolicyId 316596123011 = "FindA.Sale Flat $32.00". Full chain verified end-to-end: smart engine (cheapest carrier → coverage zone → FVF gross-up → bounded bucket) + packageType strip on flat-rate path. Butter Knife ($6.65 tier) also ✅. eBay shipping system DONE.

**S974 — BUG/DEV (2026-06-13). eBay FVF-inclusive flat-rate shipping fix. 3 files shipped (commit 11cfb344). CODE-ONLY — Railway deployed, Chrome verify pending.**
- **Shipping dimensions pre-fill ✅:** Package Type=Box(standard), Weight=176oz, L=12, W=9, H=7 all pre-populated on edit-item page. ss_0277k2jba
- **Weight-tier gap-overshoot toast ✅:** Warning fired during FLAT_TIERS push (176oz hits $75 FedEx tier — actionable message shown to user).
- **eBay item specifics ✅:** Brand=Danner, MPN=AP-40 confirmed on live eBay listing 137411858004. ss_1925495922 (prior session evidence)
- **Bug 1 FOUND+FIXED — err:216314 (calculated policy not applying):** MAILING_BOX rejected by eBay LSAS for CALCULATED fulfillment policy. Offer PUT was non-fatal (phantom 200); policy never changed on eBay. Fix: strip packageType from inventory payload when routing.routingReason=calculated-default. ebayController.ts L2131-2138. CODE-ONLY.
- **Bug 2 FOUND+FIXED — Brand/MPN/Category not pre-populating on edit-item:** GET /api/items/:id select block was missing brand/mpn/upc fields. Form showed empty placeholders despite DB having Danner/AP-40. Fix: added brand/mpn/upc to itemController.ts getItemById select (L533-535). CODE-ONLY.
- **Bug 3 FOUND+FIXED — ShippingNetPreview (+ Suggest Price) not wired to edit-item page:** S971 built ShippingNetPreview component with POST /api/ebay/shipping-preview/suggest-price but never imported it into edit-item/[id].tsx. Fix: added import + component render when packageWeightOz is set (L1454-1460). CODE-ONLY.
- **ebayCalculatedPolicyService.ts FIXED:** USPSGroundAdvantage → USPSParcel+USPSPriority (UNKNOWN_SHIPPING_SERVICE_CODE bug). CODE-ONLY.
- **UNVERIFIED (needs re-push after next deploy):** Calculated policy applying on eBay (err:216314 fix), Brand/MPN/Category pre-fill, ShippingNetPreview rendering + Suggest Price, weight-tier gap-overshoot block in CALCULATED mode.
- **Push block provided** — 4 files: ebayController.ts, itemController.ts, edit-item/[id].tsx, ebayCalculatedPolicyService.ts.
- BQ: 2 → 2 (febe1f46 row updated — bugs fixed CODE-ONLY, re-verify still needed post-deploy. #313 unchanged).

**S972 — QA (2026-06-13). Partial Chrome QA of S971 febe1f46 build.**
- **Deploy verification ✅:** febe1f46 GREEN on Railway (health OK, /api/ebay/shipping-preview endpoint responds) and Vercel (READY, dpl_EGnCoYtcosPKTEVt2naetMT5btLL).
- **Brand/MPN/UPC on edit-item ✅:** Navigated /organizer/edit-item/cmq2z2ocg001810t51m6su0bb as user1. Brand "e.g. Danner, Sony, Pyrex — leave blank if unbranded" + eBay required note present. MPN "Manufacturer part #" and UPC "Barcode number" visible. ss_6085zmmkb
- **Shipping mode toggle ✅:** /organizer/settings/ebay shows "Calculated" (Recommended) card selected + "Flat-rate tiers" (Advanced) card. Smart-pick default policy "Smart-pick (weight tier → calculated → flat-rate → free)" set. ss_3600f1du9
- **UNVERIFIED (needs Patrick's real eBay account — artifactmi@gmail.com):** Danner pump re-push through CALCULATED path; ShippingNetPreview component + net/buyer-shipping preview rendering; Suggest-price button; weight-tier gap-overshoot block message. Also: Brand/MPN/UPC on review page (review queue empty on user1/user2 test accounts).
- BQ: 2 (unchanged — febe1f46 partial QA done, remaining items gated on Patrick's real account).

**S971 — DEV/RECORDS (2026-06-13). eBay listing-push fix + calculated-shipping/net-engine build (commit febe1f46).**
- **Trigger:** organizer couldn't push the Danner AP-40 aquarium pump (itemId cmqbb252i000i60qq7eilco9z) to eBay — friendly "Brand is missing" error.
- **Root causes (found by hitting the eBay API directly — evidence-first, not guessed):** (1) eBay needs the Brand+MPN PAIR for many categories — real error was errorId 25002 `<BrandMPN>`, the friendly message was misleading; (2) secondaryCategoryId="1" from SECONDARY_CATEGORY_MAP (vintage/rare/collectible→'1', antique→'20081', handmade→'14339' are all NON-LEAF ROOT categories) → errorId 25005; (3) publishItemOffer used the wrong SKU (bare FAS-{id}); real SKU includes skuAppend segments → broke repair paths; (4) category resolver took eBay's "Other/Misc" catch-all blindly (pump landed in 179986 "Other Fish & Aquarium Supplies"); (5) shipping — 11 lb pump billed $75 because the organizer's weight-tier ladder has a gap (≤111oz/$19.99 then nothing until ≤720oz/$75 FedEx).
- **Listing-push fixes shipped:** Brand→"Unbranded" only when blank; force Brand+MPN aspects on push; publishItemOffer self-heals missing Brand/MPN on 25002; correct SKU via buildCustomLabel in repair paths; secondary-category guard (SECONDARY_CATEGORY_MAP disabled — emitted only invalid root categories); category resolver skips Other/Misc/Everything-Else catch-alls; weight-tier gap-overshoot guard (blocks with an actionable message instead of overcharging); Brand/MPN/UPC inputs added to edit-item + review pages; "Publish to eBay now" saves the form first; drafts API returns brand/mpn/upc.
- **BIG BUILD (commit febe1f46, 13 files) — eBay calculated-shipping default + fee-aware net-proceeds engine + package-estimation + "Suggest price":** new schema models PackageProfile + EbayCategoryFee, +3 Item cols, +3 EbayConnection cols, +2 EbayPolicyMapping cols (migration 20260613190000_ebay_calculated_shipping_net_engine). New services: ebayCalculatedPolicyService, ebayRateEstimateService, ebayNetProceedsService, ebayPackageEstimateService; cloudAIService extended for weight/dim estimation; resolvePoliciesForItem now CALCULATED-default with FLAT_TIERS backfill for existing organizers; new endpoints POST /ebay/shipping-preview + /shipping-preview/suggest-price; frontend ShippingNetPreview component + PostSaleEbayPanel confirm card + settings shipping-mode toggle. Both TS gates 0 errors (orchestrator-verified). **CODE-ONLY — NOT browser-verified.**
- **Locked decisions:** default shipping = CHARGED/calculated (buyer pays); free shipping = organizer opt-in; net engine displays net AND ships Suggest-price (never auto-set); fees = real settled-order data + ~1.25% safety buffer (FEE_SAFETY_BUFFER_PCT), seeded from published rates for now; existing flat-tier organizers preserved. Behavior rule added: CLAUDE.md §10b "Evidence-First Debugging Gate" (gather the real error/state from the live system before proposing/shipping any fix).
- **Pump state:** was published live (listingId 137411387725) via direct eBay API after fixing Brand+MPN+secondary-category, then WITHDRAWN per Patrick. Now reset for a clean re-push — ebayListingId/listedOnEbayAt/ebayCategoryId/ebayCategoryName cleared; brand=Danner, mpn=AP-40 set; offer 186196728011 retained. Ready to re-push through the new calculated path.
- **✅ MIGRATION APPLIED (2026-06-13):** febe1f46 schema migration applied + verified on Railway — PackageProfile (60 rows) + EbayCategoryFee (5 rows) tables present, new columns present, existing organizer backfilled to FLAT_TIERS (verified via DB query). Remaining for this build: Chrome QA only. Stray `packages/database/prisma/_schema_gen.prisma` should be deleted locally if present (never commit).
- BQ: 1 (S970 #313) → 2 (added: febe1f46 build CODE-ONLY — migration APPLIED, Chrome QA pending).

**S970 — QA/RECORDS (2026-06-13). S969 records pass + #219 Chrome re-verify.**
- **Records pass:** applied S969 PCVs to roadmap.md — #164 Tiers Infra (UNVERIFIED S804 → ✅ Claude QA S970), #27b TEAMS watermark toggle (re-confirmed), #317 Geofence QR (both rows: Building backlog inside/outside-radius now ✅, Backlog-P1 row ✅). All had 5-element evidence.
- **#219 Achievements XP framing — CHROME VERIFIED ✅ (S969 fix confirmed live):** logged in as user5 (Leo Thomas, RANGER) via direct /api/auth/login. /api/xp/profile authoritative = guildXp 2065, RANGER→SAGE, nextRankXp 5000. /shopper/achievements now shows ABSOLUTE "2,065 / 5,000 XP to Sage · 2935 XP remaining" (ss_5725naacs) — identical to /shopper/dashboard "Progress to SAGE · 2,065 / 5,000 XP · 2,935 XP to Sage" (ss_32707qytx). Pre-fix band-relative "865/3,800" gone. achievements.tsx now reads useXpProfile (shared cache → identical numbers). Dark mode clean on both. Roadmap #219 → ✅ CHROME VERIFIED S970.
- **CODE-ONLY verification pass (Patrick request) — 7 gamification XP items re-checked against current backend code (tool-cited):** 5 MATCH (#254 HP 1.5x, #278 HP scan +10%/150 cap, #281 STREAK_7DAY_BONUS 100, #314 ORG_SHOPPER_SIGNUP 10, #315 REFERRAL_ORG_FIRST_SALE 50) — stay ⚠️ CODE-ONLY (browser verify needs real Stripe/GPS/multi-acct). 2 DRIFTED: **#268** = doc drift only (code awards tiered 40-80 XP via TRAIL_COMPLETION + TrailCompletion-unique guard, NOT flat-100/hasEarnedTrailBonus as the claim said — roadmap text corrected, code is correct). **#313 = REAL BUG FOUND + FIXED S970** — HAUL_POST_LIKES idempotency guard was non-functional (dedup queried "photoId: <id>" but award stored "...post <id>"), re-awarding 5 XP on every like ≥10 = XP-farm vector. Dev fix: award description now writes "(photoId: <id>)" so guard matches → fires once per post. 1 file (haulPostController.ts), TS clean, idempotency trace confirmed.
- BQ: 1 (#313 fix pending Chrome verify — needs 10 accounts liking, env-blocked). PCV table cleared of all applied rows.

**S969 — QA (2026-06-13). S968 post-deploy smoke + Pending-QA burn-down.**
- **S968 SMOKE OK** — homepage CLS fix LIVE + correct: CityHeat ("Phoenix is heating up") / TreasureHunt / SaleOfDay banners render BELOW the map (no shift); both code-split banners mount; Featured Sales 20/20 + When/Type filter pills render. Organizer pages (dashboard / settings / add-items / POS) + public sale detail all render CLEAN post the app-wide `_app.tsx` ssr:false code-split — no broken overlays. Only console error across all pages = wallet browser-extension conflict (MetaMask/evmAsk inpage.js), NOT app code.
- **#164 Tiers Backend Infra VERIFIED** — GET /api/tiers/mine (getMyTier) -> HTTP 200 {tier, progress: currentTier BRONZE / nextTier SILVER / completedSales 1 / salesNeeded 4}; OrganizerTierBadge renders "Bronze Organizer" + "1/4 sales until next tier" (ss_5723zet9w). syncTier wired into billingController webhooks (4 events, code-confirmed). **P3 latent:** organizer.tier stores subscription value "PRO" (not BRONZE/SILVER/GOLD) -> getTierBenefits('PRO')=undefined, `benefits` omitted from API; masked by frontend `TIER_CONFIG[tier] || BRONZE` fallback — zero user impact.
- **#27b Watermark TEAMS gate VERIFIED** — /organizer/settings Appearance as Alice (TEAMS): "Remove FindA.Sale watermark from exports and shareable images" checkbox CHECKED + enabled, correct helper copy (ss_4877f2sdx). PDF-footer-visual + iCal `.ics`-text sub-checks still pending (need a non-TEAMS account for the on/off comparison).
- **#317 Geofence QR scan VERIFIED** — authenticated GET /api/items/:id/qr/scan vs geocoded GR sale: FAR (NYC ~970km) -> HTTP 403 "You must be at the sale location to scan this QR code"; AT-LOCATION -> HTTP 200 (cleared 100m gate, dup-check returned already-scanned); NO coords -> HTTP 200 graceful fallback (matches S936). haversine 100m enforcement confirmed LIVE. Was Backlog P1.
- **DOC-HYGIENE NOTE (resolved, not a bug):** `user12@example.com` login failed because **user12 was intentionally removed long ago** (Patrick confirmed — only ~6 seed users remain). QA docs/memory still referencing user12 as "primary shopper" are OUTDATED. Use **user5 (Leo Thomas)** for shopper QA; user1 (Alice, ADMIN+TEAMS organizer) for organizer QA. Both confirmed working with Seedy2025! this session.
- **Authenticated shopper smoke ✅ (user5 via direct /api/auth/login, bypassing form-autofill):** /shopper/dashboard renders clean — Ranger Explorer rank card, "Progress to SAGE 2,060/5,000 XP" bar, perks, and the NudgeBar code-split overlay ("Only 3 more favorites to reach 5!") all mount (ss_49483yyyg). **Smart Cart E2E ✅** — clicking item "+" fired addItem -> wrote to fas_shopper_cart_<userId> localStorage + "Added to cart" toast; nav cart badge 0->1; drawer (code-split overlay) opened showing "Saved in Cart (1)" Vintage Radio $25 + Place Hold + Cart Subtotal; item card flips to green ✓ in-cart state (ss_45892y66j). (Earlier passes showed cart 0 only because the UI click missed the small button — code path verified correct, NOT a bug.) Confirms shopper-side S968 code-split has no broken mounts.
- **#40 Market Hubs (TEAMS) ✅** — /organizer/hubs renders cleanly as an intentional Phase-2 coming-soon teaser (4 market types, value-props, inert "Create Event — Coming Soon" CTA, empty state); no functional flow yet by design (ss_93464pwy9). Not a bug.
- **Walkthroughs (organizer user1 + shopper user5):** organizer (dashboard/settings/add-items/POS/hubs/insights/earnings/holds/reputation/consignors/create-sale) + shopper (dashboard/sale-detail/cart/achievements/challenges/wishlist) all render clean — good empty states, real data, dark mode OK.
- **#219 Achievements XP progress — INCONSISTENCY FOUND + FIXED S969 (P3, pending Chrome verify):** /shopper/achievements showed "865 / 3,800 XP to Sage" (~23%, BAND-relative: progress within the Ranger->Sage band) while the dashboard showed "2,060 / 5,000" (~41%, ABSOLUTE from /api/xp/profile). NOT a wrong-threshold bug — backend RANK_THRESHOLDS genuinely uses RANGER=1200, so band size 5000-1200=3800 was internally correct; the two pages just used different FRAMING. Fix: achievements.tsx now reads the authoritative useXpProfile hook and displays absolute progress matching the dashboard (shared ['xpProfile'] cache => identical numbers). 1 file changed, TS clean. (ss_9952rn5q0 vs ss_49483yyyg).
- **P3 observation:** Insights "Total Revenue $45.00" vs Earnings "Gross Revenue $325.00" for same org — different definitions (marketplace sold-item vs POS/all-channel gross); labels don't disambiguate. Not a bug.
- PCVs staged below for the records pass (cross-session rule — roadmap Chrome cols NOT touched this session). BQ: 0 (the #219 inconsistency was fixed same-session — code shipped, pending Chrome verify; not left blocking).

**S968 — DEV/PERF (2026-06-12). Mobile homepage performance + repeatable audit infrastructure.**
- **PERF (pushed):** code-split 10 non-critical overlay/banner components to `next/dynamic` ssr:false (_app.tsx ×7 app-wide + index.tsx ×3) + lazy-loaded below-fold item images — trims initial JS/TBT.
- **LIGHTHOUSE CI BUILT (pushed):** `.github/workflows/lighthouse.yml` (median-of-3, mobile, 4 URLs: /, /pricing, /map, /estate-sales/denver-co; warn-only assertions; temporary-public-storage + artifact) + `lighthouserc.json` + `scripts/psi-audit.mjs` (on-demand PSI). PSI API confirmed **100% free** (25k/day, no billing) — needs a free key to avoid the shared anon 429. Cron set **MONTHLY** (`0 6 1 * *`). Ran green 3× via workflow_dispatch.
- **HOMEPAGE CLS FIXED + VERIFIED:** first attempt (reserve map skeleton + TreasureHunt placeholder) **REGRESSED 0.204→0.284** (reserved blocks collapse → new shift) and was reverted. Diagnosed via Lighthouse `layout-shifts` audit: dominant shift was `section.mb-12` (the "Sales Near You" map) pushed down by the CityHeat + TreasureHunt promo banners mounting above it (~0.135). **Fix (Option 1):** moved CityHeatBanner/TreasureHuntBanner/SaleOfTheDayCard **below the map section**. Verified both ways — CI median homepage CLS warning **CLEARED (<0.1)**; throttled sandbox **0.135→0.019**.
- **Vercel Speed Insights confirmed LIVE** (real-user mobile RES **91 "Great"**, field LCP 1.68s / INP 240ms / CLS 0.19).
- **Directory listings:** findPWA submission attempted but their server (lima-city) returned **HTTP 500** — NOT submitted, retry when their backend recovers. Appsco.pe (#493) is a dead Heroku app → mark defunct.
- **New Cowork scheduled task** `findasale-monthly-perf-audit` (2nd of month, 9am) reviews the audit + field data and reports CWV status to Patrick.
- Docs: `claude_docs/brand/directory-listing-copy-2026-06.md`, `claude_docs/audits/lighthouse-audit-2026-06-12.md`. BQ: 0 (unchanged).

**S967 — RESEARCH/OUTREACH (2026-06-12). App-submission + greenfield growth research, reconciled against existing pipeline. Added roadmap rows #489–546: Tier 1B (local citations Bing/Apple/Yelp/Foursquare + PWA dirs Appsco.pe/findPWA), Tier 1C (Microsoft Store/Google Play/Samsung PWA paths, eBay Partner Network, Stripe Partner, SOS/Featured PR, NASMM/NAPO, Start Garden, Alignable, SBAM, Wikidata), Tier 1D (West MI local: Paw Paw Chamber, 5×5 Night, The Rapidian, Local First, Crain's GR/Rapid Growth/Second Wave press, Discover Kalamazoo). Verified AI-discovery ALREADY SHIPPED — schema.org JSON-LD on 26 page types incl. Event on sales/[id].tsx, indexNowService.ts built, robots.txt allows AI crawlers; only Wikidata entity remains, no dev needed. eBay email catch-up: Developer API Growth Check #260428-000018 reply DRAFTED (links to completed EPN questionnaire, stops auto-close); EPN affiliate #00448478 — we replied 6/5, awaiting eBay; Marketplace Insights #00447997 closed by eBay (access closed). Marketing: west-michigan-local-outreach doc (Paw Paw Chamber + Local First listing copy, 3 press pitches). 4 Gmail drafts created (eBay dev ticket + Rapid Growth + Second Wave + Crain's/Anna Fifelski) — pending Patrick send. Docs: APP-SUBMISSION-DIRECTORY-RESEARCH-2026.md + GREENFIELD-GROWTH-AVENUES-2026.md. BQ: 0 (unchanged).**

**S966 — RESEARCH (2026-06-12). Directory listing sprint: Software Finder (#483) profile fully built — description, 5 features, 3 FAQs all rewritten with real product content. Trustpilot (#485) blocked (account creation fails regardless of email used). BQ: 0 (unchanged).**

**S964 — DEV (2026-06-12). Scraper expansion: EstateSale.com directory scraper built (51-state two-phase, 500–1,500 featured companies with phone/email/website, Crawl-Delay:10 respected). Playwright CI harness continue-on-error fixed. sourceRegistry.ts + quarterly workflow created. BQ: 0 (unchanged).**

**S963 — DEV/RECORDS/WRAP (2026-06-12). Records pass: S962 PCVs applied. #27c FIXED + CHROME VERIFIED ✅ (em-dash/ampersand title → CSV downloads clean, no 500). SellMyAntiques domain parked. SaaSHub #480 CLAIMED by Patrick. KY/ME workflow triggers DONE. BQ: 1→0.**

**S962 — QA (2026-06-12). Records pass: #74 + #463 S961 PCVs applied to roadmap.md. Chrome QA: #219 ✅, #218 ✅, #55 ✅, #81 ✅ spot-check, #127 ✅. Bug found: #27c eBay CSV export → HTTP 500. BQ: 0→1.**

**S961 — QA (2026-06-12). Chrome QA pass: #463 Claim Button Tracking ✅, #74 Role-Aware Reg ✅. Records pass: SEO3 S944 applied to roadmap.md. #472 PCVs (S948) cleared from PCV table. BQ: 0.**

**S960 — DEV (2026-06-12). Bid13 scraper activated + NFMA parked + dead flea market directory research.**
- **Bid13 ACTIVATED** — full rewrite from parked stub. `POST /api/v1/search.php` JSON API confirmed. 9 national coverage zips at 500-mile radius, paginated, deduplicated by `facility_nid`. Category: `AUCTION_HOUSE`. Respects crawl-delay (5s). `enabled: true` in sourceRegistry. Monthly GH Actions workflow created. TypeScript: 0 errors. Push block delivered — pending Patrick push.
- **NFMA PARKED** — member directory behind NFMA login wall. Parked stub created with investigation date. Workflow created but effectively no-ops.
- **Dead flea market research** — 7 dead scrapers investigated. Space largely collapsed 2020–2024. FleaMarketZone already in codebase and is the main comprehensive survivor. fleamapket.com and fleamarketlocator.com flagged as potential future Playwright candidates (neither worth building now).
**S994 — SEO/DEV (2026-06-16). Yard-sales city landing pages built + GSC discovered-not-indexed root cause audited.**
- **Records pass:** #465 Chrome QA col already ✅ S990 in roadmap.md — confirmed applied. #465 PCV table rows cleared.
- **GitHub verification:** all S992/S993 files confirmed on GitHub main (cityData.ts sha:db2dbd65, autoSeedOutreachCron.ts sha:40ec378f, seedDirectoryClaimEmails.ts sha:cc30ff53, oauth_setup2.py sha:81ae1cd2). No push blocks needed for prior sessions.
- **SEO4 yard-sales city page SHIPPED (CODE-ONLY):** Created `packages/frontend/pages/yard-sales/[city-slug].tsx` (554 lines) — full ISR page (revalidate:86400, 47-city prerender, fallback:blocking). Copies estate-sales page pattern exactly, changes saleType filter to yard-sales, uses yard-sale copy/FAQs throughout.
- **cityData.ts extended:** Added `getYardSaleFaqs(cityName, stateCode): FaqItem[]` — 7 yard-sale-specific FAQs (timing, how to find, best app, this-weekend, start times, how to post, best sellers). No existing exports touched.
- **server-sitemap.xml.tsx updated:** Added `yardSalesUrls` block (mirrors `estateSalesUrls`, priority 0.70) spread into fields.
- TypeScript: 0 errors (frontend tsc clean). 3 files changed.
- **GSC audit completed (P1 findings):** Root cause of 2,071 discovered-not-indexed = 10,000 /items/{id} URLs in sitemap exhausting crawl budget. Items are SSR (getServerSideProps), thin leaf pages, not the right index targets. Fix: remove itemUrls from sitemap; then convert /items/[id].tsx to ISR. Secondary: /guides/[slug] exists but not in sitemap (P2). Crawl-delay:2 in robots.txt (P3). Both P1 items added to BQ.
- BQ: 1 → 3 (old generic GSC entry replaced with 2 specific P1 items: sitemap itemUrls removal + items ISR conversion).

**S995 — BUG (2026-06-16). Vercel TypeScript build error fix — cityData.ts apostrophe escape.**
- **Root cause:** 12 single-quoted TypeScript string values in `YARD_SALE_ABOUT` (lines 672–763) contained possessive apostrophes (city\'s, Chicago\'s, Denver\'s, etc.) which prematurely closed the string delimiters. TypeScript reported "Type \'number\' is not assignable to type \'Record<...>\'" at the const declaration — the classic signature of a misparse from a prior unterminated expression.
- **Fix:** Python script converted the 12 affected `tip:` and `knownFor:` values from single-quoted to double-quoted strings. None of the affected strings contain double quotes. No logic change.
- **File:** `packages/frontend/lib/seo/cityData.ts` (1 file). Node syntax check: 0 issues in YARD_SALE_ABOUT block.
- **Impact:** Unblocks Vercel build for S994 yard-sales city pages, photo-enriched scraped listings (S995 backend), and sort-before-disappear date fix.

## Pool Audit Findings

Run: 2026-05-18 (S756). Railway DB queried directly via psycopg2.

**DirectoryClaimEmail (outreach queue):** 3,319 PENDING, 29 SENT. 31 junk rows deleted (26 image filenames stored as emailAddress, 5 Patrick test emails).

**leadTier breakdown:** HOT: 5,517 (100% website coverage) · WARM: 36,851 (3.3% website coverage) · COLD: 14,314

**WARM email gap:** Only 208 WARM orgs currently addressable. Website enrichment job changed from weekly → daily (S756). API headroom: HERE 250K/month cap, ~1,500/month usage. Pipeline healthy.

**Geocoding:** 6,760 sales still not geocoded. Nightly geocoding job addresses gradually.

---

## Blocked Queue

_S982: NODEJS-10 CLEARED (migration applied 2026-06-15 03:58 UTC; no June 15 Sentry events; resolved in Sentry). eBay AI weight CLEARED CODE-ONLY (ebayController L5445-5447 maps aiPackageWeightOz→aiEstimatedWeightOz). BQ: 3→1._
_S983: P1 organizer roles bug fix shipped CODE-ONLY (authController.tx.user.create roles set explicitly). BQ: 1→2._
_S984: P1 roles bug CLEARED — Chrome-verified ✅ (DB roles=['USER','ORGANIZER'], /organizer/dashboard accessible). BQ: 2→1._
_S772 reconciliation: graduated/closed rows removed — reconciled into strategy/roadmap.md. Only genuinely open items remain._
_⚠️ P0 AGING: #332 at 73+ sessions — mandatory P0 per CLAUDE.md §10a._
_S919 WRAP: #230 RESOLVED (SmartBuyerWidget rendering confirmed). FB Marketplace RESOLVED (Patrick decision: DEFERRED — Apify path added to roadmap #380). #335 updated: Jane Thrift is fictional. BQ: 7→5._
_S921: SEC-001, SEC-002, #196, #201 coded but pending push+Chrome-verify — all 4 remained in BQ. BQ: 9._
_S922 QA MODE: all 4 S921 fixes Chrome-verified live RESOLVED (commit 7058d99c deployed): SEC-001 (admin.ts Prisma.sql parameterized, page returns 11 patterns no error), SEC-002 (items.ts scoped multer, valid types pass, add-items loads clean), #196 Buying Pools (card renders on $169 item ss_5769b4ui3, negative test on $25 item), #201 Favorites all 3 (Items(1) count, Saved Sales section, /shopper/collections→302→/shopper/wishlist ss_37941eelg/ss_1509jponw). All 4 rows REMOVED. BQ: 9→5. Below QA ceiling — DEV available S923._
_S928: HTML entity P2 FIXED (textUtils.ts + insights.tsx + itemController.ts). GA4 #470 conversion events built. 22 Chr cols bulk-applied (S803–S805 backlog). BQ: 6→5._
_S932: Hunt Pass multiplier display inconsistency RESOLVED (Patrick confirmed 1.5x XP on live site). BQ: 6→5._
_S933: #335 RESOLVED (outreach confirmed active, 658 sent). WARM leads backfill RESOLVED (0 orgs missing DCE row). WARM enrichment removed (3.5%→4.7%, not a bug, growing). GSF geocoding removed (structural/by-design, fallback confirmed). Domain blocking shipped (estatesales.net/org blocked across all 3 email rails). BQ: 5→1._
_S937b: SUPPRESSION PASS COMPLETE (Patrick-approved) — added `suppressionService.isHardSuppressed()` (blocked-domain+hard-bounce+complaint only) and guarded ~15 more Gmail-rail senders: BULK→isSuppressed (curatorEmailJob, monthlyTrendReportJob, abandonedCheckoutJob, buyingPoolController×2, lib/notificationService +placeholder skip, organizers.ts), TRANSACTIONAL→isHardSuppressed (auctionJob, reservationController, saleWaitlistController, waitlistController, contact.ts autoreply, emailReminderService) + reclassified saleAlert(×4)/saleLive full→hard. Internal alert senders left unguarded by design. Backend TS 0 errors. SENTRY CAPTURE added to both rails (transactionalEmailService `resend_send_rejected`, emailService `gmail_send_failed`) so a future send-rejection pings Sentry → caught by the daily health check. GMAIL RAIL AUDIT done (`gmail-rail-audit-s937.md`): rail is PROPER + healthy — From=outreach.finda.sale is SPF+DKIM+DMARC aligned, ~200-400/day sending, 0 Sentry gmail errors/7d, no P0/P1. 4 P2 follow-ups (see Next Session). G1 ESCALATED to P0 after Resend log detail (SES_FROM_EMAIL=find@outreach.finda.sale → whole transactional rail 403). Audit history consolidated → `claude_docs/feature-notes/email-audit-history-consolidated.md` (28 findings, R-1..R-7 recurring). The 401 GET /emails/suppressions is an external curl with a send-only Resend key — not our backend, ignore._
_S937f: G1 P0 RESOLVED — E2E VERIFIED. After push + Railway green + RESEND_FROM_EMAIL=noreply@finda.sale: registered deseee+s937e2e@gmail.com via POST /api/auth/register (HTTP 201) → verification email RECEIVED from `noreply@finda.sale` in INBOX (not spam), subject "Verify Your FindA.Sale Email Address", Gmail thread 19eaf109a9b88af7. This is the exact send class that was 403-rejected pre-fix → Resend transactional rail now delivers from the verified domain. Real inbox receipt = full ✅ (not CODE-ONLY). GMAIL RAIL also E2E-verified: POST /api/contact → autoreply received from find@outreach.finda.sale in INBOX (thread 19eaf18a44195799) — also confirms the send-as alias is valid. ZONE BLOCK verified LIVE: EmailQuotaLog 0→2 (normal contact submit = support+autoreply) →3 (@system submit = support only, autoreply to @system filtered, +1 not +2 — no quota burn, no bounce). support@finda.sale allowlist confirmed (support send went through). Resend block proven transitively (same isEmailDomainBlocked gate, live on Gmail + 7/7 logic). M2 Resend-admin-API monitor runs 06:07 (no CLI this session for the key). BQ: 2→1 (#332 Shopify remains). (Test user deseee+s937e2e@gmail.com left in prod — harmless +alias; delete if desired.)_
_S938: #332 Shopify DEFERRED (Patrick decision) — blocked on connecting a real custom-app Shopify store for live QA; code fixes already coded/pushed S890. Removed from Blocked Queue; revisit when a test store is available. BQ: 1→0._
_S939: Deliverability hardening session — NO blockers added. Gmail-rail false-alarm P0 was not real (send-only token, no re-auth needed); placeholder-leak guard, Resend webhook (4 fixes), and soft-bounce policy all shipped + live + e2e-verified. Optional Gmail outreach-token re-auth is non-blocking. BQ: 0 (unchanged)._
_S937e: SOURCE PROVEN + rail-suppression aligned. Bounce source was NOT saleLive (dead code) — it was `postSaleRecapEmailService.sendPostSaleRecaps()` via outwardEmailAutomationsJob (10:00 UTC daily): Sale.recapSentAt stamps 173/195/120 on 06-06/07/08, all hour-10 UTC, all isUnmanagedListing=true (proof in system-finda-sale-bounce-source-S937.md). Recap query NOW filters `isClaimed:true,isUnmanagedListing:false` (L241) — already self-fixed; rail guard is belt-and-suspenders. Allowlist verdict: support@finda.sale (SUPPORT_EMAIL) is the ONLY code send-target @finda.sale; info@/privacy@/legal@/admin@ are NOT code recipients (frontend/mailto only). Allowlist now env-extensible via SENDABLE_FINDA_SALE_ADDRESSES. RAIL-SUPPRESSION ALIGNED: added checkMultipleHard(); Resend rail switched full→hard (opted-out users now get receipts/resets); Gmail rail chokepoint now also drops hard-bounce/complaint (not just domains). Both rails enforce the same floor: domain-block + hard-bounce + complaint; bulk senders layer full isSuppressed on top. Comprehensive E2E rewritten (4 rails × positive + negative/guard, 27-item checklist). Backend TS 0 errors. _
_S937d: BOUNCE-FLOOD FIXED (rail-level). Root cause: a Gmail-rail event send (likely saleLiveEmailService on scraped-sale publish) was emailing scraped organizers' own User.email = scraper+slug@system.finda.sale (72,060 such users); S929 only blocked @system in the 3 outreach SEEDERS, never the send rails. FIX: `isEmailDomainBlocked()` now blocks the ENTIRE finda.sale zone (domain==='finda.sale' OR endsWith '.finda.sale') — no real user ever has an @finda.sale address — with a one-address allowlist for SUPPORT_EMAIL (contact-form support@finda.sale). Plus a hard guard at the emailService.emails.send Gmail chokepoint (filters unsendable recipients before quota+send). Covers BOTH rails (Resend checkMultiple + Gmail rail guard), autoSeed, and the 16 guarded senders. Verified: 7/7 logic cases, backend TS 0 errors. In-flight DSNs from the pre-fix 06-08 batch will taper as Gmail stops retrying (~21h); they don't pollute suppression (bounce parser ignores finda.sale). Files: suppressionService.ts, emailService.ts (already in push block)._
_S937: G3 suppression gap FIXED (8 bulk lifecycle services, pending push). G1 reframed P2 latent after Resend dashboard check (send.finda.sale not a Resend domain; SES_FROM_EMAIL env almost certainly overrides the dead fallback — verify, don't rewrite). NO SES rail exists in code. NOTED (not yet fixed, awaiting Patrick scope): ~9 more Gmail-rail senders lack suppression — most important `lib/notificationService.createNotification` (central fan-out), plus buyingPool/reservation/saleWaitlist/waitlist/abandonedCheckout/curator/monthlyTrendReport/emailReminder/organizers. Transactional ones (auction receipt, reservation, contact) should suppress hard-bounce+blocked-domain only, NOT opt-out. BQ: 1→2._

_S987: #318 tab filter FIXED CODE-ONLY (affiliate.tsx useState<string> active state) — removed from BQ. BQ: 2→1._
_S989: #313 HAUL_POST_LIKES Chrome-verified ✅ (user1 reaction→ user5 XP 416→421 +5 once; user2 reaction→ user5 XP stays 421, no re-award). BQ: 1→0._
_S991 SEO MONITOR: GSC discovered-not-indexed 2,071 pages (core nav never crawled since 5/23/26) added as P1 per §10a mandatory trigger. BQ: 0→1._
_S997: GSC sitemap itemUrls CLEARED — removed itemUrls block from server-sitemap.xml.tsx (255→241 lines, TS 0 errors). BQ: 3→2._
_S1001 QA: 5 of 8 S999/S1000 CODE-ONLY rows Chrome-verified ✅ (FB CM settings, FB CM promote, FB org-level feed API, /organizer/platforms page, PlatformHighlightsWidget) — REMOVED, staged in PCV for roadmap apply. Found+fixed FB feed `link` 404 bug — severity corrected P1→P2 after Patrick's live Commerce Manager showed 103 products Active (catalog ingests fine; link only affects click-through). In BQ, needs push. 3 rows reworded (render-verified; live toggle/cron path still open). BQ: 9→4._

_S1003: fbCatalogEnabled data-layer VERIFIED (badge disappears, count updates, copy changes ✅). P2 badge gap → replaced with new BQ entry. Railway logs empty → eBay Queue Mode UNVERIFIED, reworded. BQ: 2→2._
_S1004: BQ item 1 (eBay Queue cron) RESOLVED — Railway logs confirmed */30 firing. BQ item 2 (FB Connected badge) RESOLVED — platforms.tsx fixed + verified. BQ: 2→0._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| Buy It Now | automatic_tax fix DEPLOYED + valid-account path VERIFIED ✅ (200 as user5 vs Artifact item). Graceful invalid-account handling (friendly 409 + CheckoutModal renders error) CODE-ONLY, not yet deployed. | Patrick push S1006b block (stripeController.ts + CheckoutModal.tsx) → deploy → Chrome confirm invalid-seller shows friendly message, valid item completes | S1006 |
| Cart multi-item checkout — payment completion | Session creation ✅ but ?checkout=success + items-SOLD webhook UNVERIFIED (prod = Stripe LIVE keys; no real charge in QA) | Patrick (or a real low-value purchase) confirms end-to-end, OR a Stripe test-mode path for QA | S1006 |






---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
_S970 records pass: S969 PCVs (#164 Tiers Infra, #27b watermark toggle, #317 Geofence QR) applied to roadmap.md. Stale already-applied rows (#74/#463/#472×3/#27c/#219/#218/#55/#81/#127 — confirmed applied S949/S962/S963/S965) cleared from table._
|---|---------|----------|---------|
_(SEO3 ✅ S944 applied S981 — roadmap already had ✅ S944 in Human QA from S961 — cleared. 547-GR/547-SHIP/547-ZIP/547-SWEEP ✅ S979/S980 applied S981 — roadmap.md #547 Claude QA col updated to ✅ S979/S980 — cleared.)_
_(#422 ✅ S949 applied S950 — cleared. #75 ✅ S949 applied S950 — cleared. #470 item_viewed ✅ S949 applied S950 — cleared.)_
_(SEO3 ✅ S944 applied S961 — UI col ✅ S944 in roadmap.md — cleared. #472 ✅ S948 applied S949 — cleared from PCV table S961.)_
_(S963 records pass: S962 PCVs #219/#218/#55/#81/#127 all ✅ — 5-element evidence confirmed — applied to roadmap.md Claude QA columns. #27c PCV staged for Chrome verify.)_
_(S949: #472 applied to roadmap.md (3x PCVs all pass 5-element gate). #422/#75/#470 item_viewed re-verified with screenshot IDs — ready for next records pass. #470 organizer_signup UNVERIFIED → BQ.)_
_(S940 PCV rows — #27b watermark settings gating ✅ PRO/TEAMS, #75 non-lapsed TEAMS label ✅, #422 OAuth buttons+linked-accounts UI ✅ — applied to roadmap.md in S941 records pass — cleared.)_
_(S939 PCV rows — SEO3 REJECTED no screenshot ID (Human QA ⬜ unchanged), #470 RUNTIME-VERIFIED already in roadmap — cleared S941.)_
|---|---------|----------|---------|
_(#465 S984 PCVs — roadmap #465 Claude QA col already shows ⏳ 3/4 Chr verified S984. All 4 rows cleared S986.)_
_(#465 S990 PCVs — shopper_item_favorited / checkout_initiated / first_item_published — all 4 events confirmed in roadmap.md row #465 Chrome QA col as ✅ S990. Cleared S994.)_

_(⁠#358 OFF direction ✅ S986 applied S987 records pass — roadmap.md #358 Claude QA col → ⏳ OFF ✅ S986 / ON pending Chr verify — cleared.)_
_(#318 ✅ S988 applied S989 records pass — roadmap.md #318 Chrome QA col → ✅ S988 — cleared.)_
_(#313 ✅ S989 applied S990 — roadmap.md #313 Claude QA col → ✅ S989. HAUL_POST_LIKES idempotency confirmed. Cleared.)_
_(S935 PCV rows — #317 Geofence graceful fallback ⚠️ S936, #470 GA4 conversion CODE-ONLY S936 — applied to roadmap.md in S936 records pass — cleared.)_
_(S931 PCV rows — #462 Attribution, #237 Command Center, /admin/outreach-opens, SEO1 SSR, #455 Notify Me, #464 SEO footer, sale detail, /trending, /map — applied to roadmap.md in S932 records pass — cleared.)_
_(S930 PCV rows — organizer dashboard, HTML entity fix, shopper dashboard, Explorer Profile, #123 rank label, #199 Hunt Pass — applied to roadmap.md in S931 records pass — cleared.)
_(S925 PCV rows — logout flow Chr✅, #463 CODE-ONLY, #462 CSRF partial — applied to roadmap.md in S930 records pass — cleared.)
_(S927 PCV rows #79/#164/#316 applied to roadmap.md in S928 records pass — cleared.)
_(S920/S921/S922 PCV rows applied to roadmap.md in S923 records pass — cleared.)_
_(S1001 PCVs FB-CM-Live-Ingest/FB-CM-Settings/FB-CM-Promote/FB-CM-Feed-API/Platform-Dashboard/Platform-Widget all ✅ S1001 — applied to roadmap.md rows 548/549/550 in S1002 records pass — cleared. S997 PCV SEO4-YardSalesAbout ✅ S997 — applied to roadmap.md SEO4 Chr col → ✅ S997 in S1002 records pass — cleared.)_
_(SEO4 ✅ S1003 Human QA applied — roadmap.md Human QA col already ✅ S1003 — cleared friction-audit-2026-06-17. SEO5 ✅ S1004 Claude QA applied S1005 — roadmap.md Claude QA col ✅ S1004 — cleared. SEO6 ✅ S1004 Claude QA applied S1005 — roadmap.md Claude QA col ✅ S1004 — cleared.)_
---


## Next Session

### S1007 — re-test Buy Now after deploy (Buy Now fix + live-keys note)

**S1006 push block (Patrick):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/controllers/stripeController.ts
git add packages/frontend/components/CheckoutModal.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S1006b: graceful Buy Now error for unusable seller Connect accounts + render error in CheckoutModal"
.\push.ps1
```
**No migration required.**

**After Railway deploy — Chrome re-test (S1007):**
1. As a shopper (user5@example.com / Seedy2025!) OR artifactmi: open any AVAILABLE Buy-Now item, click Buy It Now → Continue to Pay. Expect the Stripe payment step to load (redirect to checkout.stripe.com / payment element) — NO "Try Again". Evidence: network `POST /api/stripe/create-payment-intent` → 200 with clientSecret (replay in-page is fine).
2. Do NOT complete a real charge — prod is on **Stripe LIVE keys**. Verifying the 200 + payment step loads = the fix; payment completion stays a Patrick/real-purchase check.

**Open carry-forward:**
- Cart multi-item checkout payment-completion + items-SOLD webhook still UNVERIFIED (live keys; needs a real purchase or a QA test-mode path).
- Pending fee-rate question (feeCalculator.ts 8% vs CLAUDE.md/Stack 10% locked S106) — Patrick decision before touching feeCalculator.

### S1005 onward — QA session

**S1005 push block (Patrick) — includes S1003/S1004 files + S1005 cart/checkout/GMC fixes:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add "packages/frontend/pages/auctions/[city-slug].tsx"
git add "packages/frontend/pages/flea-markets/[city-slug].tsx"
git add packages/frontend/lib/seo/cityData.ts
git add packages/frontend/pages/api/server-sitemap.xml.tsx
git add packages/frontend/pages/organizer/platforms.tsx
git add packages/frontend/components/CartDrawer.tsx
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/routes/stripe.ts
git add packages/backend/src/utils/googleMerchantFeed.ts
git add packages/frontend/pages/return-policy.tsx
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S1003-S1005: Auction+flea-market SEO pages; FB Connected badge; cart checkout fix; Google Merchant feed; return policy"
.\push.ps1
```

**No migration required.**

**Session type: QA (BQ=0 — run QA on S1005 cart/checkout/GMC fixes before new dev)**

**BQ = 0**

---

**QA dispatch stubs — S1006 (run sequentially, one Chrome agent at a time):**

**QA-1 — Cart item links:**
`Skill('findasale-qa')` → Navigate to finda.sale as logged-in shopper. Add an item to cart. Open CartDrawer. Click item thumbnail in "Saved in Cart" section. Verify: navigates to `/items/:id` page AND cart drawer closes. Evidence: Navigated [URL] as [user]. Clicked [element]. Saw [outcome]. Screenshot IDs required.

**QA-2 — Cart multi-item checkout:**
`Skill('findasale-qa')` → As logged-in shopper, add 2+ items from the SAME sale to cart. Open CartDrawer. Click "Go to Checkout". Verify: no "coming soon" toast, Stripe Checkout page loads with correct line items and total. Use Stripe test card 4242 4242 4242 4242. Verify redirect to sale page with `?checkout=success`. Verify items show as SOLD. Evidence required per QA Honesty Gate.

**QA-3 — Buy Now fix:**
`Skill('findasale-qa')` → As logged-in shopper, open any item detail page. Click "Buy Now". Verify: checkout modal opens, payment form loads without "try again" error, can enter test card. Evidence required.

**QA-4 — Google Merchant feed image quality:**
`Skill('findasale-qa')` → Hit feed endpoint (check backend routes for the GMC feed URL). Verify `image_link` column contains no `i.ebayimg.com` URLs for items that have Cloudinary photos (`res.cloudinary.com` URLs). Evidence: grep or sample of feed output.

**QA-5 — Return policy page:**
`Skill('findasale-qa')` → Navigate to `finda.sale/return-policy`. Verify page loads, contains marketplace language ("each seller"), no blanket return window, dark mode works. Evidence: screenshot ID + URL.

---

**Patrick — actions needed post S1005:**
1. Push the S1005 block above.
2. After deploy, Google Merchant Center: update return policy URL to `https://finda.sale/return-policy` and remove the 2-day blanket window.
3. Pending fee rate question: `feeCalculator.ts` returns 8% for PRO/TEAMS but CLAUDE.md §10/Stack says 10% flat (locked S106). Confirm which is correct — needs a Patrick decision before touching that file.

**Optional carry-forward:**
- 4 unpublished eBay items backfill (Loy Norrix Choirs offerId=166668232011, Kirkland Pepper offerId=166412704011, Whip-It Butane offerId=151850469011, Contigo Travel Mug offerId=151769728011)
- Canada return policy in Google Merchant Center
- Flip ebayQueueMode on a test org to observe actual queue processing (optional validation)


### S974 — Carry-forward (eBay FVF flat-rate — Chrome verify + tier-ID investigation)

**RESOLVED S975 — the premise of this carry-forward was wrong. Verified directly against the live eBay account:**
1. Tier-ID source is NOT a mystery and routing is NOT broken. The EbayPolicyMapping row for artifactmi was created 2026-04-15 (Patrick configured the 14 weight tiers + category overrides + classification policies himself, long ago). A direct GET /sell/account/v1/fulfillment_policy with artifactmi's live token returned 23 policies; every tier policyId in the DB mapping matches a real, present policy on eBay. No "Sync from eBay" sleuthing needed.
2. Chrome verify as artifactmi@gmail.com: End Butter Knife (137412262678) + AP-40 (137411858004) → re-push → expect Butter Knife=$6.65, AP-40=~$23.59 with new "FindA.Sale Flat $23.59" policy appearing on eBay.
3. Three mistakes from S974 are documented in the session block above — don't repeat them.

### S974 — 2026-06-13 | BUG/DEV (eBay FVF shipping — flat-rate fix)

**Session type:** BUG/DEV — evidence-first debugging, service build, code push

**Root cause:** AP-40 listed at $75 FedEx because organizer is on FLAT_TIERS mode with a gap — USPS caps at 111oz, next tier is FedEx 45lb $75 catch-all (maxOz 720). The 11lb (176oz) AP-40 fell through. Gap-overshoot guard (commit 3db01c72) was added after the AP-40 was first pushed, so it was already live at $75.

**Fix shipped (commit 11cfb344, 3 files):**
- `ebayFlatRatePolicyService.ts` — NEW (195 lines). Creates "FindA.Sale Flat $X.XX" per-organizer flat-rate policies on eBay, idempotent (name-check + error 20400 guard), in-process cache, graceful fallback. Calls eBay via proxy with EBAY_PROXY_SECRET — works in production (403 was VM-only; Railway has the secret).
- `ebayController.ts` — gap-overshoot guard (~L3621) now tries ensureFvfFlatRatePolicy FIRST before returning SHIPPING_TIER_GAP error.
- `ebayRateEstimateService.ts` — rewritten with real 2026-04-26 Pirate Ship USPS GA rates. Exports EBAY_SHIPPING_FVF_RATE=0.136.

**Expected after Railway deploy (NOT Chrome-verified):** Butter Knife (4oz) → $6.65 (FLAT_TIERS exact tier); AP-40 (11lb/176oz) → $23.59 (new "FindA.Sale Flat $23.59" policy created on eBay).

**Mistakes made (Opus must not repeat):**
1. Built Option A ($1.50 handling fee) before confirming with Patrick — he wanted Option B (per-item FVF flat-rate). Wasted 1 build cycle.
2. Reasoned from code/DB without testing live eBay API. Patrick correct callout.
3. Wrong about eBay policy sync — kept saying policies ARE synced. Patrick is RIGHT: "Sync from eBay" button only saves ONE default policy per type to EbayConnection. It does NOT populate the FLAT_TIERS tier mapping. The 23 weight-based tier entries and their eBay policy IDs — source unknown. Patrick says he didn't sync them. Opus MUST investigate before assuming FLAT_TIERS routing is correct.

**BQ delta:** 2 → 3 (added: FVF flat-rate Chrome verify + tier-ID source investigation)


### S973 — Carry-forward (eBay shipping — push + deploy + re-QA needed)

**S973 QA found 3 bugs, all fixed CODE-ONLY. Push block delivered.** After Patrick pushes 4-file block and Railway + Vercel deploy:

**`Skill('findasale-qa')`** — Chrome QA as artifactmi@gmail.com organizer. Re-push the Danner pump (itemId cmqbb252i000i60qq7eilco9z, offer 186196728011).
1. Verify calculated policy applies on eBay (listing should show USPS-calculated rate, NOT $75 FedEx flat)
2. Brand/MPN/Category pre-fill correctly on edit-item page (Danner/AP-40/category name visible on load)
3. ShippingNetPreview appears in shipping section when weight is set; Suggest Price button fires a network request and returns a value
4. Pump publishes with Brand=Danner, MPN=AP-40, sensible non-Other category
5. Weight-tier gap-overshoot block message in CALCULATED mode

Evidence required per QA Honesty Gate — URL, user, element, outcome, screenshot IDs.

### S971 — Carry-forward (eBay shipping — GATED on migration — COMPLETED)

**STEP 1 — DONE ✅:** Deploy GREEN (febe1f46 Railway + Vercel). Migration applied + verified.

**STEP 2 + STEP 3 — PARTIALLY DONE S972:** Brand/MPN/UPC edit-item ✅, shipping-mode toggle ✅. Full pump re-push UNVERIFIED → see S972 carry-forward above.

### S970 — Carry-forward (QA/DEV)

S969 PCVs applied + #219 Chrome-verified this session. BQ is 0 — DEV fully unblocked.

1. **#27b remaining:** PDF footer visual + iCal `.ics` description text still need a non-TEAMS org to verify the watermark on/off comparison (the only outstanding sub-checks on #27b).
2. **#164 P3 (optional, low priority):** organizer.tier stores subscription value "PRO" instead of loyalty enum BRONZE/SILVER/GOLD → getTierBenefits returns undefined, `benefits` omitted from /api/tiers/mine. Frontend `|| BRONZE` fallback masks it — cosmetic/data-hygiene only.
3. **Next work:** with BQ empty and no open BROKEN rows, the frontier is the directory/growth pipeline (#489–546) and the ⚠️ CODE-ONLY gamification items (#254/#268/#278/#281/#313/#314/#315) that need real Stripe/GPS to Chrome-verify. QA accounts: user5 (Leo Thomas) shopper, user1 (Alice) organizer, Seedy2025!.

### Patrick — Actions Needed (post S967)

1. **Send the 4 Gmail drafts (review first — Gmail MCP can only draft, not send):**
   - eBay Developer ticket #260428-000018 reply (closes the auto-close loop; send from artifactmi@gmail.com if possible).
   - Press pitch → Rapid Growth Media (Editor@RapidGrowthMedia.com).
   - Press pitch → SW Michigan's Second Wave (feedback@secondwavemedia.com).
   - Press pitch → Crain's GR Business (anna.fifelski@crain.com — confirm byline if desired).

2. **~~Push S967 research + outreach docs~~ ✅ CONFIRMED ON GITHUB (S973)** — APP-SUBMISSION-DIRECTORY-RESEARCH-2026.md present on main.

3. **Time-sensitive grants (applications open now):** Start Garden "The 100" (#506) + Start Garden 5×5 Night (#510). Both free, no eligibility gate.

4. **Free quick-win listings (~1-2 hrs, all $0):** Bing Places #489, Apple Business Connect #490, Yelp #491, Foursquare #492, Appsco.pe #493, findPWA #494; eBay Partner Network #498; Alignable #500; Paw Paw Area Chamber #509.

5. **EPN affiliate (#00448478) nudge** — if eBay stays quiet past ~1 week from 6/5, send a short follow-up to epn-tigs@ebay.com (offer available on request).

### Patrick — Actions Needed (post S964)

1. **~~Push S964 changes (EstateSale.com scraper + CI fix)~~ ✅ CONFIRMED ON GITHUB (S973)** — estateSaleComScraper.ts + sourceRegistry.ts + .github/workflows/scrape-estatesalecom.yml present on main.

2. **Push S963 changes (if not yet pushed):**
   ```
   git add packages/backend/src/controllers/ebayController.ts
   git add packages/backend/src/services/scraper/sources/sellMyAntiquesScraper.ts
   git commit -m "S963: fix eBay CSV export HTTP 500 (Content-Disposition); update SellMyAntiques status"
   .\push.ps1
   ```

3. **SaaSHub (#480)** — Claim saashub.com/finda-sale (page open in Chrome). Create account, add logo/pricing/description.

4. **AlternativeTo (#477) — June 18, 2026 ~9:49 PM Stockholm.** Log in as "FindASale" → alternativeto.net → Add Software.

5. **KY/ME scraper triggers** — Trigger `workflow_dispatch` on scrape-kentucky-phase2 and scrape-maine-phase2 to verify S959 fixes write records to DB.

### S966 — Suggested Work (carry forward)

**Option A — AlternativeTo submission (June 18, 2026 deadline).** Patrick logs into alternativeto.net as "FindASale" and submits. Highest-urgency remaining directory listing.

**Option B — Trustpilot (#485) retry.** Try account creation with support@finda.sale. If still blocked, park indefinitely.

**Option C — AuctionTime scraper (if Cloudflare block is resolvable).** See S965 notes.

**Option D — Next roadmap BROKEN item.** BQ is 0 — dev fully unblocked.

### S965 — Suggested Work (archived)

**Option A — AlternativeTo submission (June 18, 2026 deadline).** Patrick logs into alternativeto.net as "FindASale" and submits. Highest-urgency remaining directory listing.

**Option B — AuctionTime scraper (if Cloudflare block is resolvable).** AuctionTime.com was found Cloudflare-blocked via direct fetch in S965. Try with realistic UA rotation (same approach as AuctionZip S890 fix) — may be unblockable. If blocked, skip.

**Option C — MaxSold.com scraper research.** MaxSold is a major online estate/downsizing auction platform not in current source registry. Likely static HTML catalog pages. Research: robots.txt, ToS, URL structure, data availability.

**Option D — Next roadmap BROKEN item.** BQ is 0 — dev is fully unblocked.


## Recent Sessions

### S999 — 2026-06-16 | DEV (Platform Metrics Dashboard + eBay Queue Mode)

**Session type:** DEV
**Shipped:** Platform Metrics Dashboard + eBay Queue Mode engine
**Files changed:** 12 files — 4 new backend, 3 new frontend, 5 modified. Migration: 20260616000001_ebay_queue_mode (4 new schema fields).
**Schema:** Item.ebayQueuedAt, Item.ebayListedAt, Organizer.ebayQueueMode, Organizer.ebayQueueRotation.
**Status:** Pushed. Patrick must run `prisma migrate deploy` before backend will start correctly.
**QA:** Pending Chrome verification next session — 4 items added to Blocked Queue (platforms page, dashboard widget, queue mode toggle, cron verification).
**BQ delta:** 2 → 5.

### S998 — 2026-06-16 | BUG (eBay bidirectional sync fix)

**Session type:** BUG — evidence-first diagnosis, targeted fix

**Root cause:** `importInventoryFromEbay` had `if (totalFetched === 0)` guard before the Trading API `GetMyeBaySelling` block. ArtifactMI has 18 items in eBay Inventory API → guard prevented Trading API from running → 75+ classic eBay listings (created directly on eBay, not via FindA.Sale) never imported. Items showed "Push to eBay" despite being live on eBay.

**Fix (commit 5e517cf7):** Changed `if (totalFetched === 0) {` to a bare block `{`. Trading API `GetMyeBaySelling` now always runs after Inventory API loop completes. Dedup logic handles items found by both paths safely (imported++ for new, skipped++ for existing).

**Also shipped:** `seed.ts` fix — user1 ADMIN role + eBay connection removed (commit 97e78a3f).

**Patrick confirmed:** "wrap it synced now" — sync ran successfully post-deploy and imported classic listings.

**Pending (not addressed this session):** 4 UNPUBLISHED eBay items (Loy Norrix Choirs/Kirkland Pepper/Whip-It Butane/Contigo Travel Mug) have FAS- SKUs + offers on eBay but no ebayListingId in DB. Need ebayOfferId backfilled so they can be published from FindA.Sale.

**Files changed:** `packages/backend/src/controllers/ebayController.ts`, `packages/database/prisma/seed.ts`

**BQ delta:** 2 → 2 (unchanged)

### S996 — 2026-06-16 | BUG (eBay sold sync window fix)

**Session type:** BUG — evidence-first diagnosis, targeted fix

**Root cause:** `ebaySoldSyncCron.ts` used `lastmodifieddate` (7-day window). Settled orders stop being "recently modified" within hours — permanently dropping out of the window after 7 days. Result: items sold on eBay never marked SOLD on FindA.Sale.

**Fix:** Switched to `creationdate` (90-day window). Immutable at order creation — always returned until day 91. Idempotency preserved by AVAILABLE-only pre-filter.

**Files changed:** `packages/backend/src/jobs/ebaySoldSyncCron.ts`

**BQ delta:** 3 → 3 (unchanged)

### S995 — 2026-06-16 | QA + BUG FIX (S991–S994 QA pass; yard-sales About section P2 fix)

**Session type:** QA — QA pass on S991/S992/S993/S994 + P2 bug fix dispatch

**QA results:**
- S991 (shipping preview null organizerId) ✅ CHROME VERIFIED — Celestion Vintage returned shipping + net estimate correctly (ss_5973i4mmj). organizerId=NULL no longer 404s.
- S992 FB checkout ✅ CHROME VERIFIED — `fas_shopper_cart` localStorage confirmed with correct item/price/saleId. Patrick's own live test (S992) also confirmed Super Mario Bros + X-Force #1 at correct prices.
- S993 outreach pipeline ✅ DB VERIFIED — PENDING 2,284 / SENT 699 / ARCHIVED 430 / OPTED_OUT 1. Null-safe Prisma filter working.
- S994 yard-sales pages ✅ PARTIAL — H1, title, listings, Nearby Cities (5 links), FAQs (7 items), FAQPage JSON-LD all confirmed. BUG FOUND: About section showed "Grand Rapids estate sales reflect the city's Dutch heritage..." (estate-sale copy on a yard-sales page). P2.

**P2 bug fix shipped:**
- Root cause: `yard-sales/[city-slug].tsx` used `cityMeta.knownFor`/`cityMeta.tip` from `getCityMeta()` — estate-sale branded content.
- Fix: Added `YARD_SALE_ABOUT` record (15 cities) + `getYardSaleMeta()` export to `cityData.ts`. Updated `[city-slug].tsx` import → interface → destructure → getStaticProps → About section render.
- TypeScript: 0 errors. PCV staged — re-verify /yard-sales/grand-rapids-mi About section after deploy.

**Files changed:** `packages/frontend/lib/seo/cityData.ts`, `packages/frontend/pages/yard-sales/[city-slug].tsx`

**BQ delta:** 3 → 3 (unchanged — 2 GSC P1 items + prior GSC monitor)

### S994 — 2026-06-16 | SEO/DEV (yard-sales city pages + GSC crawl-budget audit)

**Session type:** SEO/DEV — yard-sales ISR pages + GSC root cause

**Completed:**
- Built `packages/frontend/pages/yard-sales/[city-slug].tsx` (554 lines) — 47-city ISR (revalidate:86400), yard-sale-specific H1/title/FAQs/nearby-cities, FAQPage JSON-LD.
- Extended `cityData.ts` with `getYardSaleFaqs()` — 7 yard-sale-specific FAQs.
- Updated `server-sitemap.xml.tsx` with `yardSalesUrls` block (priority 0.70).
- GSC audit: root cause of 2,071 discovered-not-indexed = 10,000 /items/{id} SSR pages exhausting crawl budget. Both items added to BQ as P1.
- Records pass: #465 Chrome QA col confirmed already ✅ S990 in roadmap.md.

**Files changed:** `packages/frontend/pages/yard-sales/[city-slug].tsx` (new), `packages/frontend/lib/seo/cityData.ts`, `packages/frontend/pages/server-sitemap.xml.tsx`

**BQ delta:** 1 → 3 (2 GSC P1 items added: sitemap itemUrls removal + items ISR conversion)

### S993 — 2026-06-16 | BUG/DATA (outreach pipeline root-cause fix + RDAP Stage 3)

**Session type:** BUG/DATA — outreach pipeline null-exclusion bug + RDAP email discovery

**Completed:**
- Root cause confirmed (Prisma NULL bug): `NOT: [{emailDiscoveryConfidence: 0.0}]` → SQL `NOT (col = 0.0)` → PostgreSQL NULL comparison returns NULL → 12,136 scraper-email organizers with NULL confidence permanently excluded. Fixed with null-safe Prisma filter in `autoSeedOutreachCron.ts` and `seedDirectoryClaimEmails.ts`.
- Data fix: reset 2,276 ARCHIVED rows (valid categories, non-junk domains) back to PENDING. Queue: PENDING 2,292, SENT 699, ARCHIVED 422.
- RDAP Stage 3 implemented in `emailDiscoveryService.ts` — rdap.org query, vCard 4.0 parser, 13-domain privacy-proxy filter. 5,057 organizers with website but no email now addressable.

**Files changed:** `packages/backend/src/jobs/autoSeedOutreachCron.ts`, `packages/backend/src/scripts/seedDirectoryClaimEmails.ts`, `packages/backend/src/services/emailDiscoveryService.ts`

**BQ delta:** 0 → 0

### S992 — 2026-06-16 | SEO/DEV (analytics OAuth + city SEO framework)

**Session type:** SEO/DEV — analytics pipeline repair + city landing page SEO upgrade

**Completed:**
- Created `claude_docs/scripts/oauth_setup2.py` — OAuth2 re-auth helper for GA4/Search Console (was referenced by scheduled task but didn't exist). Repaired truncated `.analytics-creds.json`. Weekly analytics report ran successfully.
- NEW: `packages/frontend/lib/seo/cityData.ts` — reusable SEO framework (50+ cities with unique `knownFor`, `tip`, `nearbySlugs`; builders for FAQ JSON-LD, count-aware titles, descriptions, nearby links). Designed for reuse by all city page types.
- UPDATED: `packages/frontend/pages/estate-sales/[city-slug].tsx` — added Birmingham AL + Long Beach CA to prerender list (GSC fix); 45-city prerender total; FAQPage JSON-LD schema; city-specific About section; Nearby Cities section with internal links; empty-state nearby links; count-aware title variants.

**Files changed:** `packages/frontend/lib/seo/cityData.ts` (new), `packages/frontend/pages/estate-sales/[city-slug].tsx` (updated), `claude_docs/scripts/oauth_setup2.py` (new)

**BQ delta:** 1 → 1 (GSC "discovered not indexed" monitor — no change)


### S992 — 2026-06-16 | DEV+QA (Facebook Commerce Manager checkout page)

**Session type:** DEV+QA — external integration (Facebook Commerce Manager)

**Facebook Commerce Manager feed:** Verified Artifact MI commerce feed live (103 products imported). Investigated FB Partner API — EU-only per EC antitrust ruling, not available for US. Data feed approach confirmed correct.

**Checkout page built + verified live:** FB Commerce Manager requires a checkout URL before allowing Marketplace connection. Built `pages/checkout.tsx` (186 lines, new file) — client-side cart injection. Three iterations. Root issues found + fixed: (1) first version used `getServerSideProps` — server-side, can't access localStorage; (2) second version took only the first product ID, price not converted to cents (stored $9 → displayed $0.09; ShopperCartDrawer expects cents); (3) final: `useEffect` client-side, parses all IDs, `Promise.all` parallel fetch, `Math.round(price * 100)` for cents, merges cart, redirects to `/sales/:saleId`.

**Verified live (Patrick):** Facebook sent Super Mario Bros + X-Force #1. Both added to cart at correct prices. Redirected to sale page. Cart opened correctly. X-Force #1 at $62 is correct market price (sealed/polybagged 1991 first Deadpool appearance).

**Files changed:** packages/frontend/pages/checkout.tsx (new, 186 lines) — pushed via 3 push blocks during session.

**BQ delta:** 1 → 1 (unchanged)

### S991 — 2026-06-16 | BUG (shipping preview 404 on null organizerId items)

**Session type:** BUG — evidence-first debug, 2-line fix

**Root cause found:** Patrick reported "Could not estimate shipping right now" when entering weight/dimensions for the Celestion Vintage item in PostSaleEbayPanel. Direct DB query revealed `Item.organizerId = NULL` on this item (items created through the sale flow aren't always backfilled with organizerId). Both `getShippingNetPreview` and `getSuggestedPriceForMargin` queried `WHERE id = itemId AND organizerId = organizer.id` — getting no result → 404 → frontend catch block → generic error message. No Railway log entry because the 404 returns early, before the catch block.

**Fix:** Changed both item ownership checks from `organizerId: organizer.id` to `sale: { organizerId: organizer.id }` — same ownership pattern `getUnsoldItems` already uses correctly.

**Files changed:** packages/backend/src/controllers/ebayController.ts (lines 5868 + 6011)

**BQ delta:** 0 → 0

### S989 — 2026-06-15 | QA + RECORDS (#313 HAUL_POST_LIKES verified; #318 records pass)

**Session type:** QA + RECORDS — records pass (#318 applied), Chrome QA #313

**Records pass:** roadmap.md #318 Chrome QA col updated from `⏳ CODE-ONLY` to `✅ S988` (Python bash confirmed, evidence from S988 PCV). PCV #318 row cleared.

**#313 HAUL_POST_LIKES XP idempotency — CHROME VERIFIED ✅:** Navigated https://finda.sale/shopper/haul-posts as user1 (Alice Johnson). Confirmed threshold is 2 (code: `likesCount >= 2`, haulPostController.ts L171). user1 reacted via POST /api/ugc-photos/4/reactions (201) — DB: user5 XP 416→421 (+5), 1 PointsTransaction created with desc "Haul post milestone: 2+ likes on post (photoId: 4)". user2 logged in via /api/auth/login JWT, reacted (201) — DB: user5 XP stayed 421, no second HAUL_POST_LIKES transaction. Idempotency guard confirmed functional. S970 fix verified end-to-end.

**BQ delta:** 1 → 0

**Files changed:** claude_docs/strategy/roadmap.md, claude_docs/STATE.md, claude_docs/patrick-dashboard.md

### S988 — 2026-06-15 | QA + RECORDS (#318 affiliate tab fix Chrome-verified; #358 records pass)

**Session type:** QA + RECORDS — records pass, Chrome QA #318

**Records pass:** roadmap.md #358 Claude QA col updated from `⏳ OFF ✅ S986 / ON pending Chr verify` to `✅ S987` (Python bash confirmed). PCV #358 row cleared.

**#318 Affiliate tab filter — CHROME VERIFIED ✅:** Navigated https://finda.sale/organizer/affiliate as Alice Johnson (user1 / Seedy2025!). Clicked Pending tab (ref_69) — orange highlight moved from All to Pending + "Loading referrals..." API call fired (ss_53773zh3u). Clicked Cancelled — orange moved to Cancelled (ss_3742seq7c). Active state correctly tracks clicks across all tabs. S987 fix confirmed live. PCV staged for next-session roadmap.md update.

**BQ delta:** 1 → 1 (unchanged — #313 env-blocked)

**Files changed:** claude_docs/strategy/roadmap.md, claude_docs/STATE.md, claude_docs/patrick-dashboard.md

### S987 — 2026-06-15 | DEV+QA (#318 affiliate tab fix, #358 copy fix, #358 ON Chrome verified)

**Session type:** DEV+QA — records pass, parallel dev dispatch (CODE-ONLY), Chrome QA

**Records pass:** roadmap.md #358 Claude QA col updated from `⏳ Pending Chr QA S986` to `⏳ OFF ✅ S986 / ON pending Chr verify` (Python bash confirmed). roadmap.md #318 Chrome QA col updated: ⚠️ P2 FIXED S987 CODE-ONLY — pending push + Chrome verify.

**#358 Follower Count Toggle — ON direction Chrome verified ✅:** Navigated https://finda.sale/organizers/cmomwf956000z11qwnjieosli as Leo Thomas (user5 / Seedy2025!). get_page_text confirmed "Follow / 1 follower" next to Follow button. showFollowerCount=true → followerCount displayed (ss_9942gchzq). Evidence staged in PCV table — next session applies #358 Claude QA col → ✅ S987.

**#318 affiliate tab filter — FIXED CODE-ONLY:** Root cause: active class derived from `currentStatus === status.value` with `undefined` sentinel — doesn't update on click. Fix: `useState<string>('All')` + `setActiveTab(status.label)` on click; active class = `activeTab === status.label`. File: packages/frontend/pages/organizer/affiliate.tsx. TS: 0 errors.

**#358 settings copy fix — FIXED CODE-ONLY:** Old: "The Follow button always remains visible" (wrong — FollowButton returns null for unauthenticated). New: "Logged-in followers can see your count. Visitors see the Follow button only when signed in." File: packages/frontend/pages/organizer/settings.tsx. TS: 0 errors.

**BQ delta:** 2 → 1 (#318 removed — fixed CODE-ONLY; #313 env-blocked remains)

**Files changed:** packages/frontend/pages/organizer/affiliate.tsx, packages/frontend/pages/organizer/settings.tsx, claude_docs/strategy/roadmap.md, claude_docs/STATE.md, claude_docs/patrick-dashboard.md


---


_(Archived — see session-log-archive.md)_

### S986 — 2026-06-15 | QA (#358 Follower Count Toggle + #318 Affiliate Dashboard)

**Session type:** QA — Chrome QA pass on #358 and #318

**#358 Follower Count Visibility Toggle — partial QA:**
- ✅ OFF direction: Navigated https://finda.sale/organizer/settings as user2. Profile tab → Follower Count toggle (ref_165) was checked. Clicked to uncheck — "Updating…" appeared — settled unchecked. Reloaded — still unchecked (ss_41825ttx9). DB: showFollowerCount=False via psycopg2. Navigated https://finda.sale/organizers/cmomwf956000z11qwnjieosli — __NEXT_DATA__ {followerCount:1,showFollowerCount:false} — storefront rendered "Follow" with NO count despite 1 real follower in DB. OFF direction fully verified.
- CODE-ONLY: ON direction — code path confirmed (showCount={organizer.showFollowerCount} → {followerCount} follower(s) renders when true, FollowButton L57-61). Chrome disconnected before storefront ON-state verify. DB reset to showFollowerCount=true via psycopg2.
- ⚠️ P2 copy: Settings card text "The Follow button always remains visible" is wrong — FollowButton returns null for unauthenticated users. Dispatch fix to findasale-dev.
- Evidence staged in PCV table for next session roadmap apply.

**#318 Affiliate Program Dashboard — partial QA:**
- ✅ Dashboard renders: affiliate link card, copy button, earnings summary (empty state), referrals table with status tabs.
- ❌ P2 bug: Referrals tab filter active indicator stays on "All" regardless of tab click — visual state not updating. Added to BQ.

**BQ delta:** 1 → 2 (#318 P2 tab filter bug added)

### S984 — 2026-06-15 | QA (P1 roles bug Chrome-verified; GA4 Tier 2 events #465)

**Session type:** QA — BQ burn-down (BQ 2→1)

**BQ cleared:**
- **P1 Organizer registration roles bug** — Chrome-verified ✅: psycopg2 DB query confirmed new account deseee+s984qa@yahoo.com has `roles=['USER','ORGANIZER']`; login JWT contains `roles:["USER","ORGANIZER"]`; /organizer/dashboard loaded with full organizer UI. register.tsx redirect confirmed (sends organizer → /organizer/dashboard). CLEARED.
- **#313 HAUL_POST_LIKES** — Env-blocked (needs 10 accounts). Remains in BQ.

**GA4 Tier 2 events (#465) QA:**
- `shopper_item_favorited` ✅ — favorites API 200 + GA4 collect `en=shopper_item_favorited`, `ep.item_id=cmo3etp4d005djqsu4yi9w45m`, 204
- `checkout_initiated` ✅ — GA4 collect `en=checkout_initiated`, `ep.item_id=cmo3etp4d005djqsu4yi9w45m`, 204
- `organizer_registration_complete` ✅ — GA4 collect `en=organizer_registration_complete`, `ep.role=organizer`, 204
- `first_item_published` — CODE-ONLY (condition `items.length === 0` confirmed at add-items/[saleId].tsx:645-649)
Evidence staged in PCV table — next session applies #465 Claude QA col to roadmap.md.

**Records pass:**
- #27b PCV (S982) confirmed already applied to roadmap.md (row 337 shows ✅ S982). PCV table entry CLEARED.

**BQ delta:** 2 → 1 (#313 env-blocked remains)

### S983 — 2026-06-15 | DEV (P1 organizer roles bug fix)

**Session type:** DEV — single targeted fix

**Shipped:** P1 roles array bug in `packages/backend/src/controllers/authController.ts`. Root cause: Prisma schema `roles String[] @default(["USER"])` pre-populates the field before the create transaction runs, so the `[user.role]` fallback (which checks `if (!roles || roles.length === 0)`) never fires for new organizers. Fix: `roles: effectiveRole === 'USER' ? ['USER'] : ['USER', effectiveRole]` explicitly set in `tx.user.create`. Backend TS: 0 errors.

**Files changed:** packages/backend/src/controllers/authController.ts

**BQ delta:** 1 → 2 (added P1 roles bug CODE-ONLY pending Chrome verify)

### S982 — 2026-06-15 | DEV+QA (BQ burn-down: NODEJS-10 + AI weight + #27b watermark + GA4 Tier 2)

**Session type:** DEV — parallel dispatch (BQ = 3 → 1, below ceiling)

**BQ cleared:**
- **NODEJS-10 (P1)** — Migration `20260614000000_fix_sale_slow_query_nodejs10` confirmed applied 2026-06-15 03:58 UTC (fixed: removed CONCURRENTLY). No June 15 Sentry events. Issue marked resolved in Sentry. ✅ CLEARED
- **eBay AI package-weight (CODE-ONLY)** — Wiring verified via API: ebayController L5445-5447 maps `aiPackageWeightOz → aiEstimatedWeightOz` before calling `estimatePackageProfile`. Step-4 AI path fires correctly when confidence ≥ 0.5 and weight/dims present. 0/129 production items currently populated (expected — feature activates on new uploads/re-analyses). Stale comment in ebayPackageEstimateService.ts L119-122 corrected. ✅ CLEARED CODE-ONLY
- **#313 HAUL_POST_LIKES** — Env-blocked (needs 10 accounts). Remains in BQ.

**#27b watermark (Chrome QA)** — All 4 sub-checks confirmed: iCal non-TEAMS (watermark present ✅), iCal TEAMS + toggle=true (no watermark ✅), PDF TEAMS + toggle=false (watermark present ✅), PDF TEAMS + toggle=true (no watermark ✅). Evidence staged in PCV table — findasale-records applies to roadmap.md next session.

**GA4 Tier 2 events (#465)** — 4 events added to frontend: `organizer_registration_complete` (register.tsx L188), `first_item_published` (add-items/[saleId].tsx L648), `shopper_item_favorited` (items/[id].tsx L295), `checkout_initiated` (items/[id].tsx L430). `sale_created` was already present (create-sale.tsx L2188). TS: 0 errors. Pending Chrome QA to verify events fire.

**Files changed:** packages/frontend/pages/register.tsx, packages/frontend/pages/organizer/add-items/[saleId].tsx, packages/frontend/pages/items/[id].tsx, packages/backend/src/services/ebayPackageEstimateService.ts (stale comment fix), claude_docs/STATE.md, claude_docs/patrick-dashboard.md

**BQ delta:** 3 → 1 (#313 env-blocked remains)

### S981 — 2026-06-14 | DEV (Records pass + BQ burn-down: NODEJS-10 index + AI package-weight wiring)

**Session type:** DEV — parallel dispatch (BQ = 3, below ceiling)

**Shipped:**
- **Records pass** — SEO3 PCV stale (already applied S961); 547-GR/SHIP/ZIP/SWEEP applied → roadmap.md #547 Claude QA col → ✅ S979/S980. PCV table cleared.
- **NODEJS-10 slow query fix (BQ P1)** — 2 partial indexes via migration 20260614000000_fix_sale_slow_query_nodejs10. Root cause confirmed: saleAutoCloseCron planner picks wrong status-only index → heap-scans 14k PUBLISHED rows (3342ms); sourceName COUNT had no index (49ms seqscan). Partial indexes: 239x faster (0.046ms). TS: 0 errors.
- **Architect ADR: AI package-weight wiring** — adr-ai-package-weight-wiring.md. Decision: 3 nullable Item cols (aiPackageWeightOz/aiPackageDimsJson/aiPackageConfidence). Write: batchAnalyzeController + processRapidDraft. Read: ebayController → estimatePackageProfile step-4.
- **Dev: AI package-weight implementation** — Schema + migration (20260614100000_add_item_ai_package_estimate_columns) + 3 backend files. Wires cloudAI estimates from analysis into the estimator so cables/misc items stop falling to 24oz SEED. TS: 0 errors.

**BQ delta:** 3 → 3 (NODEJS-10 + AI package-weight both fixed CODE-ONLY pending deploy; #313 unchanged)

**Patrick actions needed:**
1. Push block (see Next Session)
2. Run `migrate deploy` for BOTH new migrations after push

### S980 — 2026-06-14 | DEV+QA (eBay shipping preview/policy accuracy — multi-phase)

**Patrick's thread:** flagged the shipping preview as wrong/embarrassing → uncovered a chain of issues, all fixed + deployed green.

**Shipped:** (1) Preview origin-ZIP fix — preview computed from NULL lat/lng with no zip → wrong zone → $28; now loads `sale.zip` → $32 matching the live listing (the listing was right all along). VERIFIED LIVE. (2) Shared resolver `ebayShippingResolver.ts` — preview==listing single source of truth. (3) Phase 2 live re-pin — migration 20260614224302 (4 Item cols, APPLIED to Railway); resyncItemShippingPolicy + applyFulfillmentPolicyToOffer on edit-save + re-push; guarded vs null-weight + LOCAL_PICKUP_ONLY. (4) Phase 3 bulk sweep — resyncShippingDriftSweep daily 4AM cron + internal endpoint; re-pins on ≥$0.50/≥5% drift; dry-run verified 7 candidates post-guard. (5) Package-estimator fix — keyword-before-category + category-defaults-only; figurine 4→18oz, cable 36→24oz fallback. (6) fmt negative-$ fix; latent crash fix (ebayFlatRatePolicyService); NUL-byte recovery.

**Files:** ShippingNetPreview.tsx, ebayController.ts, ebayShippingResolver.ts (new), ebayPackageEstimateService.ts, ebayFlatRatePolicyService.ts, itemController.ts, jobs/resyncShippingDrift.ts (new), routes/internal.ts, index.ts, schema.prisma + migration 20260614224302, feature-notes/adr-shipping-policy-resync.md.

**RUNTIME VERIFIED LIVE:** ran the real sweep (dryRun:false) — 9 listings re-pinned, eBay API confirms each offer policy matches stored. Yzerman 8oz$6.99→12oz$7.75 + Brett Hull→$7.75 (mis-tier fixes); Porcelain pickup→$12.49 + Casio→$6.99 (after setting weights 18oz/5oz; added a 'cable' PackageProfile to fix the cable gap); Celestion→LOCAL_PICKUP_ONLY. Offer-PUT proven.

### S979 — 2026-06-14 | BUG→DEV→QA (eBay min-price suggester → low-price guardrail)

**Session type:** Patrick flagged the "Min. list price to hit a net margin" widget — unclear purpose + absurd $6.22 suggestion on a $175 item.

**Diagnosis (read both layers):** the suggester defined "margin" as net-as-fraction-of-list-price with no cost basis (`suggestPriceForMargin` in ebayNetProceedsService.ts), so on any real item it collapsed to the fee/shipping floor — correct math, wrong question. Copy never said what it was for.

**Fix (Patrick chose guardrail direction):** removed the always-on suggester in `components/ShippingNetPreview.tsx`; now auto-fetches the fee-safe floor (15% margin, reuses existing /shipping-preview/suggest-price) and shows an amber warning ONLY when entered price < floor. Silent on normal items. One-tap "Use $X" applies the floor. Frontend-only, no schema. Plus fmt() negative-dollar fix (-$X.XX not $-0.87) — covers net box too.

**Deploy:** push #1 RED — 554 trailing NUL bytes corrupted the file in the push round-trip (`Invalid character`; local tsc clean). Stripped nulls, re-pushed → GREEN. New memory reference_nul_byte_file_corruption.

**QA:** live Chrome as Artifact MI on both the pre- and post-fix builds — $175 = no warning + old suggester gone; $3 = guardrail fires (net -$0.87, floor $4.89); "Use $4.89" → net $0.74, warning clears. Staged in Pending Chrome Verifications row 547-GR for next-session roadmap apply.

**Files Changed:** packages/frontend/components/ShippingNetPreview.tsx; claude_docs/STATE.md, patrick-dashboard.md, strategy/roadmap.md.

**Part 2 — shipping preview accuracy (Patrick flag):** preview ignored `shippingMode` and showed a calculated USPS estimate as the buyer charge for a flat-rate organizer, never named the flat policy, and made label==shipping. Architect ADR + dev: `resolvePreviewShipping` branches on FLAT_TIERS vs CALCULATED — flat organizers now show the named flat policy ($28.00) as the buyer charge with label cost separated; net corrected to $148.31. Applied to both preview + suggest-price endpoints; latent crash in ebayFlatRatePolicyService.ts fixed. Backend+frontend TS clean, no schema. Verified live (Artifact MI). Files: ebayController.ts, ebayFlatRatePolicyService.ts, ShippingNetPreview.tsx.

### S978 — 2026-06-14 | DEV (Suggest price P2 safety guard + ShippingNetPreview copy)

**Session type:** DEV — P2 bug fix dispatch (findasale-dev), copy clarification.

**Suggest price P2 safety guard — FIXED:**
- Root cause: `PriceSuggestion` sent only `{title, category, condition}` to the AI — no awareness of the organizer's current price. AI correctly priced a generic pump at $6.22; "Use this price" would have catastrophically replaced a $175 price.
- Fix (3 files): `routes/items.ts` — added `currentPrice` to pricesuggestionSchema; `services/cloudAIService.ts` — `suggestPrice()` now accepts `currentPrice` as 5th param and injects it into the Claude Haiku prompt ("differs >30%, explain why clearly"); `components/PriceSuggestion.tsx` — full rewrite (137→184 lines): passes `currentPrice` in API body, adds `pendingConfirm` safety gate that fires when suggestion < 50% of current price, shows "⚠️ This is X% below your current price of $Y. Replace it?" with explicit Yes/Keep buttons instead of silently applying.
- `components/PriceResearchPanel.tsx` — was NOT forwarding `currentPrice` to `<PriceSuggestion>` despite having it in props; added `currentPrice={currentPrice}` to JSX.
- Backend TS: 0 errors. Frontend TS: 0 errors.

**ShippingNetPreview FVF copy — CLARIFIED:**
- Problem: "Suggest price for a target margin" section looked visually identical to the PriceSuggestion widget above it; result "List at $6.22" read like an item price, not a min-list-price-to-net-margin back-solver.
- Fix (`components/ShippingNetPreview.tsx`): section header → "Min. list price to hit a net margin"; added FVF context paragraph ("eBay charges its Final Value Fee on both the item price and the shipping amount. This calculates the minimum item price to still net your target margin after both fees."); result label → "List item at $X — nets Y% after eBay fees (Z est.)"; button → "Calculate".
- Backend TS: 0 errors. Frontend TS: 0 errors.

**BQ delta:** 3 → 2 (Suggest price P2 bug FIXED + removed; #313 + NODEJS-10 remain)

### S977 — 2026-06-14 | QA (Sentry cron verify + eBay pump re-push Chrome QA)

**Session type:** QA — Sentry monitoring, Chrome QA as artifactmi@gmail.com.

**Sentry results (verified post-S976 stagger):**
- FINDASALE-NODEJS-38/-2N/-2Z/-2S/-3D: ALL RESOLVED ✅ — cron stagger eliminated the 2:00 AM stampede. Zero unresolved instances of these issues.
- FINDASALE-NODEJS-33 (graceEndAt 1233ms): Fired ONCE at 2:00:02 AM UTC today (the pre-fix run before the new migration + stagger took effect). Expected — tomorrow's run at 2:00 with the index active should be clean. Treated as resolved.
- FINDASALE-NODEJS-10 (Sale SELECT 3342ms): Pre-existing, 55 events since May 6. Last seen 6:29 AM UTC today. NOT related to cron stampede — separate issue needing investigation. Added to BQ as P1.
- No new errors from eBay pump re-push.

**eBay pump Chrome QA (artifactmi@gmail.com as Artifact MI organizer):**
- Navigated https://finda.sale/organizer/edit-item/cmqbb252i000i60qq7eilco9z ✅
- Category: "Pumps (Air) / Pet Supplies" ✅ (ss_9966wrf59)
- ShippingNetPreview renders: "Buyer pays for shipping ~$20.38 USPS Ground Advantage, est." + "Your estimated net $145.59" + See breakdown ✅ (ss_2819q3nee, ss_5347wxgwk)
- Suggest price fired: returned "List at $6.22 for a 30% net ($1.87)" + "Use this price" button ✅ (fires) ⚠️ P2 bug (see BQ)
- Clicked "Re-push to eBay" → button showed "Pushing..." → toast "Item listed on eBay" ✅ (ss_65997l4j3, ss_309347xtn)
- POST /api/ebay/organizer/sales/.../ebay-push → HTTP 200 ✅
- DB verified: ebayNeedsReview=False, ebayListingId=137415317997 ✅
- eBay Inventory API verified: offer 187130124011 status=PUBLISHED, fulfillmentPolicyId=316596123011 ("FindA.Sale Flat $32.00") ✅, price=$175 ✅

**BQ delta:** 3 → 3 (removed 2 resolved eBay items; added FINDASALE-NODEJS-10 P1 + Suggest price P2 bug; #313 unchanged)

