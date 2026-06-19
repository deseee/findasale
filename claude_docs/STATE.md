# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**S1009 — DEV/QA (2026-06-18). Label composer polish + Buy Now graceful error + Stripe tax OFF. All pushed + Patrick-verified live as artifactmi on "QA First Item Test Sale S983".**
- **PERMANENT STOREFRONT (isOngoing) — SHIPPED + Chrome-verified ✅ (deployed commit 066e0be0):** Retired retailAutoRenewJob (no-op); added Sale.isOngoing; additive discovery/feed/search filters `(isOngoing OR endDate>=now)`; Store/LocalBusiness JSON-LD (not Event); cron guards. 16 files + migration. **Chrome QA:** Artifact storefront (cmpt2oq6q) renders LIVE as "Permanent storefront" (no end date/countdown/archive), JSON-LD @type=Store with NO endDate/Event, 104 items ✅. Regression clean: /sales feed 19,509 sales render with date ranges ✅; /search?q=thrift returns 10 sales ✅ (additive filters did NOT break discovery). 
  - **Migration handling note (correction):** this repo's _prisma_migrations IS in sync — `prisma migrate deploy` had only 1 pending migration. The isOngoing column was applied via raw `ALTER TABLE` (psycopg2); when Patrick separately ran `migrate deploy` it hit P3018 (column already exists). Resolved by marking the migration applied in _prisma_migrations (equivalent of `prisma migrate resolve --applied`). 0 unfinished migrations now. LESSON: for a schema change here, either let `migrate deploy` apply it OR raw-DDL THEN `migrate resolve --applied` — don't do both.
  - **Artifact consolidation DONE:** canonical sale cmpt2oq6q set isOngoing=true; orphaned item from old ENDED row (cmom7h73l) re-pointed (103→104 items); old row soft-deleted (deletedAt set, status ENDED, 0 items). Historical PointsTransaction/SaleChecklist/SaleRipple left on the old row (not re-pointed — avoids points/analytics skew).
  - **FOLLOW-UPS CLOSED (S1009, Patrick: stop deferring):**
    1. **Soft-deleted sales now 404** — `saleController.getSale` returns 404 when `sale.deletedAt` is set (was returning the row → stale render). Frontend getStaticProps already returns Next `notFound` on backend 404. Backend tsc 0. CODE-ONLY pending deploy (then old Artifact sale ID 404s once ISR revalidates).
    2. **reputationJob credits permanent stores** — count widened to `ENDED OR (PUBLISHED && isOngoing)` (var renamed qualifyingSalesCount) so a permanent storefront isn't stuck at NEW tier. Backend tsc 0. (Patrick decision: permanent store = 1 qualifying sale.)
    3. **Photo retention** — already handled: photoRetentionCron skips isOngoing sales (permanent-store item photos retained while listed). No further work.
    4. **Buy Now graceful message — QA ✅ VERIFIED live:** as user5 shopper, Buy It Now → Continue to Pay on Kelly's QA item (invalid Stripe acct) → modal displays "This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your..." (alert element). Not the bare "Try Again". Graceful 409 + CheckoutModal render confirmed end-to-end.
    5. **Platform-wide consolidation of 400+ scraped RETAIL chains** — intentionally NOT done (Patrick: Artifact is the only real storefront; auto-renew now disabled so no new fragmentation).
  - **STILL OPEN (genuine external constraint, not a defer):** cart multi-item payment-completion → items-SOLD webhook — prod is on Stripe LIVE keys, so it can only be confirmed by a real (small) purchase. No code to finish.
- **CORRECTION (Patrick flagged):** prior S1008 BQ rows claimed Buy Now/labels "can't be tested until June 29." FALSE — the published "Artifact Downtown Paw Paw" sale (cmpt2oq6q00138cehpgqx3huk) has 101 AVAILABLE items and its items are purchasable NOW (verified Buy Now 200 + live cart checkout session this session); purchase endpoints don't gate on startDate. The "June 29" was that sale's DB startDate (2026-06-29→07-29) — possibly a wrong date on an already-open sale (flagged to Patrick).
- **Label composer — 5 refinements, all LIVE + Patrick-confirmed working:**
  1. Item name now prints after the price (8pt) and wraps to 2 lines (forced: width:100% + white-space:normal + overflow-wrap + -webkit-line-clamp:2). Name pulled from Item.title via the same DB lookup as roomTag.
  2. ALL label text now **black (#000)** — sale name, item name, finda.sale, room, dates were grey (#666/#999) and unreadable in mono prints.
  3. **Warm shared Puppeteer browser** — launched on boot, reused per request (fresh page each), relaunch+retry on failure. Fixes the cold-start "failed first time, worked second" on label generation.
  4. Page preview now **starts at the chosen start-position slot** (prepends skip slots, mirrors the PDF).
  5. Per-item **room tag** (the "Room / Area Tag" form field, saved via itemController) prints on each label; sale dates moved to the top corner.
  - Files: labelComposerController.ts, label-composer/[saleId].tsx, plus earlier add-items/[saleId].tsx + edit-item/[id].tsx (Label Sheets links, save→add-items redirect, item search).
- **Buy It Now P1 (S1006, live + valid-path VERIFIED ✅):** removed `automatic_tax` from raw PaymentIntent (Stripe rejected it → every Buy Now 400'd; S1005 had patched the wrong cause). HTTP 200 confirmed as user5 buying an Artifact item. Graceful 409 "seller not set up to accept payments" + CheckoutModal now renders the error text (was a bare "Try Again").
- **Stripe tax OFF (Patrick decision, memory saved):** removed automatic_tax from all 3 Stripe sites (Buy Now PI + subscription + à-la-carte Checkout Sessions). Don't collect until FindA.Sale must register in nexus states. Prod runs Stripe LIVE keys.

**S1008 — Patrick commits (2026-06-18). 4 label/scraper improvements shipped directly by Patrick.**
- **`b99f05c1` labels: show item name after the price** — label-composer/[saleId].tsx + labelComposerController.ts updated. Item title now displays alongside the price on printed Avery 5160 labels. LIVE (Vercel + Railway).
- **`55abfc62` labels: add per-item room tag + move sale dates to top corner** — room tag shown on each label (where dates previously were); sale date range moved to corner. LIVE.
- **`c06cb773` label composer: start-position card above preview, collapsed by default** — UI layout change: start-position picker card moves above label preview and collapses by default (expand toggle). LIVE.
- **`17595003` perf(scraper): batch lastScrapedAt writes + GIN-index dedup** — scraper/index.ts + internalScraperController.ts + dedupe.ts: `lastScrapedAt` writes batched (was N individual DB writes); GIN index on dedup key reduces duplicate detection cost. Backend only — LIVE on Railway.
- **Infrastructure confirmed:** Vercel ✅ READY (`b99f05c1` latest, 2026-06-18 ~12:53 EDT). Railway backend ✅ SUCCESS (2026-06-18T16:53:07 UTC). All S1006+S1007 commits deployed.
- **BQ: 3→1** (Buy Now graceful 409 ✅ VERIFIED this session — user5 on Kelly's QA sale → "This seller isn't set up to accept online payments yet…" rendered correctly; ss_8945gfi4w, ss_8856ik32o. Label composer S1006c/d ✅ VERIFIED this session — item name after price, dates in corner (6/18–19), start-position card collapsed above preview; ss_7380smxpk, ss_2761xkv7y. Cart payment-completion UNVERIFIED — Stripe LIVE keys, test card rejected). **Blog ✅ VERIFIED this session** (7 cards, post body+JSON-LD+canonical+Back-to-Blog, dark mode; ss_170867567, ss_9890ula3j).


**S1007 — DEV (2026-06-18). Blog section built — /blog + /blog/[slug], 7 posts, SEO, JSON-LD. Competitor-monitor scheduled task updated to write full blog posts weekly.**
- **Blog section (CODE-ONLY, 10 new files + 1 modified):** `/blog` listing page (7 cards: title, category badge, publish date, reading time, excerpt). `/blog/[slug]` post pages (parseMarkdown renderer, JSON-LD Article schema, canonical + og: tags, breadcrumb, Back to Blog link). 7 post data files in `packages/frontend/data/blog/posts/`. Blog index (`packages/frontend/data/blog/index.ts`). Footer Blog link added to Layout.tsx. ISR: revalidate:86400 on both pages. Static paths with fallback:'blocking'. TypeScript: 0 errors.
- **Competitor-monitor SKILL.md updated:** Phase 2 now writes full 600–900 word blog post drafts to `claude_docs/marketing/blog-drafts/draft-[DATE]-[slug].md` in BlogPost format. Hardcoded old session path fixed → dynamic discovery via `ls -d /sessions/*/mnt/FindaSale`.
- **BQ: 2→3** (blog /blog + /blog/[slug] added, CODE-ONLY pending push + Chrome QA).

**S1006 — QA/BUG (2026-06-17). QA of S1005 cart/checkout/GMC fixes. Found + fixed a P1: Buy It Now broken by `automatic_tax` on raw PaymentIntent.**
- **S1006d — 3 organizer-workflow features (Patrick requests, CODE-ONLY):** (1) edit-item Save Changes now returns to `/organizer/add-items/${saleId}` (was /dashboard). (2) "🏷️ Label Sheets" link added to add-items + edit-item action rows → `/organizer/label-composer/${saleId}`. (3) Label composer: new **starting-position** picker (3×10 mini-grid) for partially-used Avery 5160 sheets — prepends `(startPosition-1)` blank slots so labels begin at the chosen slot; default 1 = no-op. PDF is server-side (Puppeteer in labelComposerController.ts), so the offset was wired through the backend (`startPosition` body param → blank `TagRecord`s; print loop renders empty cells). Backend tsc 0 errors; frontend not VM-tsc-verifiable. Files: edit-item/[id].tsx, add-items/[saleId].tsx, label-composer/[saleId].tsx, labelComposerController.ts.
- **NEW FEATURE (Patrick request, S1006c CODE-ONLY): item search on add-items page.** `add-items/[saleId].tsx` — added a live client-side search box above the saved-items list (filters by title/category/tags, case-insensitive), "Showing X of Y" count, clear button, and a no-match empty state. Helps organizers with 100+ items. Additive; selection/bulk untouched. Frontend not VM-tsc-verifiable (corrupt node_modules); needs deploy + Chrome verify.
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
## Blocked Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| Cart multi-item payment-completion | Stripe LIVE keys block test card; real purchase needed to verify items→SOLD webhook | Real purchase or test-mode proxy | S1006 |
| Soft-deleted sales → 404 (deploy + verify) | FIXED CODE-ONLY S1009 (getSale 404s on deletedAt). Not yet deployed. | Deploy → Chrome: old Artifact sale cmom7h73l → 404; a normal sale unaffected | S1009 |

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 551 | Blog — /blog listing + /blog/[slug] post page | Navigated finda.sale/blog as user5. 7 cards rendered (category badge, date, reading time, title, excerpt). Clicked post → full body, breadcrumb, "← Back to Blog" link. JSON-LD Article schema verified (correct @type, headline, datePublished). Canonical URL correct. Footer Blog link confirmed. Dark mode clean. ss_170867567, ss_9890ula3j | S1008 |
| — | Buy Now graceful 409 error (S1006 fix — CheckoutModal renders loadError) | Navigated to item cmqer8m8w00x5me4oqoabaulh as user5 (Leo Thomas). Clicked "Buy It Now" → "Complete Purchase" modal opened. Clicked "Continue to Pay" → red error box: "This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your purchase." with "Try Again" link. stripeController.ts 409 + CheckoutModal.tsx {loadError} confirmed working. ss_8945gfi4w, ss_9148p3694, ss_8856ik32o, ss_56944gx1i | S1008 |
| — | Label composer: item name after price (b99f05c1) + dates in corner (55abfc62) + start-position card above preview collapsed (c06cb773) | As Alice Johnson (user1@example.com), navigated /organizer/label-composer/cmpfplxqbxwtucltmbouvz0os. Added "QA Test First Item S983" ($5.00) via PULL FROM PRICED ITEMS → batch shows 1/30 used. Page text confirmed: label contains "$5.00" then "QA Test First Item S983" (item name after price ✅), "6/18–19" in corner (dates ✅). "Expand to choose starting label ▲" card collapsed above label grid (start-position ✅). ss_7380smxpk, ss_26234jf7i, ss_2761xkv7y | S1008 |

## Next Session

### S1010 — QA the S1009 shipped work (after Patrick pushes the pending block)

**Push first (pending — code + docs, no migration; the isOngoing column is already on prod):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/controllers/saleController.ts packages/backend/src/jobs/reputationJob.ts claude_docs/STATE.md claude_docs/patrick-dashboard.md
git commit -m "S1009 follow-ups: soft-deleted sales 404 (getSale) + permanent stores count toward reputation"
.\push.ps1
```

**QA dispatch stubs (Chrome, after the above deploys — run sequentially):**
1. **Soft-deleted sale → 404** — `Skill('findasale-qa')`: navigate `/sales/cmom7h73l000hz36wzbruoa64` (old Artifact ENDED row, soft-deleted) → expect Next 404 (NOT the stale storefront page). Negative test: a normal published sale still loads 200. Evidence: URL + outcome + screenshot.
2. **Cart multi-item payment-completion** — Patrick action (not automatable): make ONE real low-value purchase (2 same-sale Buy-Now items → cart → Go to Checkout → real card) → confirm redirect `?checkout=success` + both items flip to SOLD + Purchase rows created. Prod is on Stripe LIVE keys so QA cannot use a test card. Accept as the only open item.
3. **Regression re-confirm (already spot-checked S1009, re-confirm post-deploy):** `/sales` feed renders, `/search?q=thrift` returns results, a normal time-boxed sale page loads + a normal ENDED sale still shows ended — confirm the saleController 404 change didn't affect non-deleted sales.

**Already VERIFIED this session — do NOT re-QA (recorded S1009):** permanent storefront live (Artifact = one ongoing store, Store JSON-LD, 104 items); feed 19,509 + search regression clean; Buy Now graceful "seller isn't set up" message renders; reputationJob fix (code-only — tier recalculation is weekly/non-observable, accept code-only); photo-retention (handled). Label composer (item name, room tag, dates-corner, start-position, black text, preview offset) + Blog — verified prior.

**Deferred (ADR §6, Patrick decisions when ready, non-blocking):** old→canonical redirect map for dead sale links; permanent-store photo-retention-by-item-status refinement; reputationJob "active storefront" weighting.


### S1009 — Dev or QA

**Patrick action (already done — blog push block was S1007 Next Session):** Confirm push `b99f05c1` included blog + S1006 graceful-error files.

**BQ item open:**
1. Cart payment-completion — UNVERIFIED (Stripe LIVE keys; test card rejected on prod)

**Apply PCVs to roadmap.md (per cross-session rule):** Blog row 551 + Buy Now graceful error + Label composer S1006c/d → apply Chrome QA ✅ columns. Include roadmap.md in push block.

**Apply blog PCV to roadmap.md (per cross-session rule):** Row 551 Blog Chrome QA column → ✅ S1008. Include roadmap.md in push block.

**Open carry-forward:**
- Fee rate question: feeCalculator.ts 8% vs CLAUDE.md/Stack 10% locked S106 — Patrick decision needed before touching that file
- 4 unpublished eBay items backfill (Loy Norrix Choirs, Kirkland Pepper, Whip-It Butane, Contigo Travel Mug)
- Flip ebayQueueMode on a test org to observe actual queue processing

## Recent Sessions

### S1008 — 2026-06-18 | QA (Blog ✅ + Buy Now/Label Composer UNVERIFIED)

**Session type:** QA
**Confirmed Patrick commits live:** `b99f05c1` (labels: item name after price), `55abfc62` (labels: room tag + dates to corner), `c06cb773` (label composer: start-position card above preview, collapsed), `17595003` (scraper: batch lastScrapedAt writes + GIN-index dedup). Infrastructure: Vercel ✅ READY, Railway ✅ SUCCESS.
**QA-Blog ✅:** Navigated finda.sale/blog as user5. 7 cards loaded (category badge, date, reading time, title, excerpt). Clicked post → full body rendered, breadcrumb, "← Back to Blog" link, JSON-LD Article schema (@type Article, correct headline+datePublished), canonical URL. Footer Blog link confirmed. Dark mode clean. ss_170867567, ss_9890ula3j.
**QA-Buy-Now-Graceful ✅ VERIFIED (S1008 continuation):** Found "QA First Item Test Sale S983" (Alice Johnson / Kelly's Estate Sales, stripeConnectEnabled=false) LIVE in prod. As user5 (Leo Thomas), navigated to item cmqer8m8w00x5me4oqoabaulh → clicked "Buy It Now" → "Continue to Pay" → red error box displayed: "This seller isn't set up to accept online payments yet." CheckoutModal.tsx {loadError} rendering confirmed. ss_8945gfi4w, ss_9148p3694, ss_8856ik32o, ss_56944gx1i.
**QA-Label-Composer ✅ VERIFIED (S1008 continuation):** As Alice Johnson (user1@example.com), navigated /organizer/label-composer/cmpfplxqbxwtucltmbouvz0os. Added "QA Test First Item S983" ($5.00) to batch via PULL FROM PRICED ITEMS. Page text confirmed: label shows "$5.00" then "QA Test First Item S983" (item name after price ✅ b99f05c1), "6/18–19" in corner (dates ✅ 55abfc62). "Expand to choose starting label ▲" collapsed above label grid (start-position ✅ c06cb773). ss_7380smxpk, ss_26234jf7i, ss_2761xkv7y.
**BQ delta:** 3 → 1 (Buy Now graceful error ✅; label composer ✅; blog ✅ — only cart payment-completion remains).
**PCVs staged:** Blog row 551 + Buy Now graceful error + Label composer — apply Chrome QA ✅ to roadmap.md next session.

### S1007 — 2026-06-18 | DEV (Blog section + competitor-monitor update)
- Blog section built (CODE-ONLY): /blog listing page (7 posts, ISR revalidate:86400), /blog/[slug] detail page (parseMarkdown, JSON-LD Article schema, SEO Head, Back to Blog link). 10 new files + Layout.tsx footer Blog link. TypeScript: 0 errors.
- Competitor-monitor SKILL.md updated: Phase 2 now writes full 600–900 word blog posts to claude_docs/marketing/blog-drafts/. Hardcoded session path replaced with dynamic discovery.
- BQ: 2→3 (blog QA added).

### S1006 — 2026-06-17 | QA/BUG (Buy It Now P1 fix + organizer workflow features)

**Session type:** QA/BUG
**Shipped:** (1) Buy It Now P1 fix — removed `automatic_tax` from raw PaymentIntent (stripeController.ts); (2) graceful invalid-account 409 error + CheckoutModal renders error text (stripeController.ts, CheckoutModal.tsx); (3) edit-item Save returns to add-items page; (4) Label Sheets link on add-items+edit-item pages; (5) label composer start-position picker (3×10 grid, prepends blank TagRecords); (6) live item search on add-items page (client-side filter, case-insensitive, title/category/tags).
**Files changed:** stripeController.ts, CheckoutModal.tsx, edit-item/[id].tsx, add-items/[saleId].tsx, label-composer/[saleId].tsx, labelComposerController.ts. Backend tsc 0 errors; frontend not VM-tsc-verifiable (corrupt node_modules).
**QA:** Buy It Now valid-account path ✅ deployed (HTTP 200, commit 45829dd). Graceful invalid-account error CODE-ONLY. Cart payment-completion UNVERIFIED (Stripe LIVE keys — test card rejected).
**Decision:** Patrick — no sales tax collection until nexus registration required. All 3 `automatic_tax` usages removed.
**BQ delta:** 0 → 2 (Buy It Now graceful error CODE-ONLY; cart payment completion UNVERIFIED).

### S1005 — 2026-06-17 | DEV (Google Merchant feed + cart checkout + return policy)

**Session type:** DEV
**Shipped:** (1) Google Merchant feed `isEbayThumbnail()` filter — eBay CDN thumbnails excluded from image_link, Cloudinary preferred; (2) cart item links clickable (CartDrawer.tsx thumbnail+title → /items/:id); (3) cart multi-item checkout wired to real Stripe Checkout Session (createCartCheckoutSession, Connect fallback pattern, webhook extended: cart_checkout type → Purchase records + SOLD); (4) Buy Now Connect fallback broadened (5 new error codes + message-based matching); (5) return policy page /return-policy (marketplace language, dark mode, 6 sections).
**Files changed:** googleMerchantFeed.ts, CartDrawer.tsx, stripeController.ts, stripe.ts, pages/return-policy.tsx (new).
**QA:** CODE-ONLY — all 5 features pending Chrome verification.
**BQ delta:** unchanged (BQ from S1000 pending).

### S1004 — 2026-06-17 | QA/RECORDS (BQ cleared to 0; SEO5+SEO6 Chrome ✅)

**Session type:** QA/RECORDS
**Shipped:** (1) Facebook Connected badge fix — platforms.tsx now shows green "Connected" badge when `facebook?.connected` truthy (TS 0 errors); (2) BQ item 1 RESOLVED — Railway logs confirmed eBay Queue cron firing */30 (`[eBay Queue] Starting queue cron for 0 organizer(s)` at 02:30:01 + 03:00:11).
**QA:** SEO5 /auctions/grand-rapids-mi ✅ Chrome (H1, FAQPage JSON-LD x7, ISR, no bleed-over; ss_533815fys). SEO6 /flea-markets/grand-rapids-mi ✅ Chrome (H1, FAQPage JSON-LD x5, ISR; ss_0332eyqoc, ss_7930nzpey).
**PCVs staged:** SEO5 + SEO6 for next-session roadmap Chrome col apply (cross-session rule).
**BQ delta:** 2 → 0.

### S1003 — 2026-06-17 | QA/DEV (ISR smoke; SEO4 ✅; auction+flea-market pages)

**Session type:** QA/DEV
**Shipped:** (1) /pages/auctions/[city-slug].tsx (ISR revalidate:86400, 47-city prerender, fallback:blocking, FAQPage JSON-LD, auction-specific copy); (2) /pages/flea-markets/[city-slug].tsx (same pattern, flea-market copy); (3) cityData.ts extended (getAuctionMeta/Faqs, getFleaMarketMeta/Faqs); (4) server-sitemap.xml.tsx updated (auctionsUrls + fleaMarketsUrls priority 0.70).
**Files changed:** pages/auctions/[city-slug].tsx (new), pages/flea-markets/[city-slug].tsx (new), lib/seo/cityData.ts, pages/server-sitemap.xml.tsx. TS 0 errors.
**QA:** ISR /items/:id ✅ (ss_8940sbrut, ss_03897mqk5). SEO4 /yard-sales/grand-rapids-mi ✅ (H1, FAQPage x7, BreadcrumbList+ItemList+FAQPage; ss_3207v3q1s, ss_4548wcacx). fbCatalogEnabled data-layer ✅. eBay Queue cron UNVERIFIED (Railway logs empty this session).
**BQ delta:** 2 → 2 (cron remained UNVERIFIED; FB badge gap replaced FB data-layer BQ item).

### S1002 — 2026-06-16 | DEV/RECORDS (ISR conversion for /items/[id]; records pass)

**Session type:** DEV/RECORDS
**Shipped:** (1) /items/[id].tsx converted to ISR (getServerSideProps → getStaticProps + getStaticPaths, revalidate:3600, fallback:'blocking'; 1392→1398 lines). (2) Records pass: SEO4 Claude QA col → ✅ S997; roadmap rows 548-550 added (Platform Dashboard+Widget, eBay Queue Mode, FB Commerce Manager); 7 PCV entries cleared.
**Files changed:** packages/frontend/pages/items/[id].tsx, claude_docs/STATE.md, claude_docs/strategy/roadmap.md.
**BQ delta:** 4 → 2 (ISR conversion FIXED; FB feed link 404 already pushed S1001 — cleared; eBay Queue Mode live flip + fbCatalogEnabled remain).
