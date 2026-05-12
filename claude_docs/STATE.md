# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S719 — Chrome QA Sprint (COMPLETE)**

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

Run: 2026-05-11 (updated S715). Railway DB queried directly via psycopg2.

**Pool size:** 55,230 unmanaged org listings total (up from 37,531 — NY Phase 2 run added 29,728 records, 23 junk deleted).

**leadTier breakdown (outreach queue field):**
- COLD: 32,513
- WARM: 5,663 + 356 NY prospects promoted S715 = ~6,019
- HOT: 215
- NULL: 16,839 (NY Phase 2 records — not yet tiered, invisible to outreach cron)

**Note:** `tier` field on Organizer = subscription/reputation tier (BRONZE/WARM/etc.) — separate from `leadTier` (outreach queue). Pool audit uses `leadTier`.

**S712 addition:** 183 high-confidence organizers seeded directly into DirectoryClaimEmail table via psycopg2 Python script (live DB change, 2026-05-10). Warmup schedule confirmed: 20/day (days 0-7) → 50 (8-14) → 100 (15-21) → 200/day stable, 6 four-hour windows.

**S712 addition:** 183 high-confidence organizers seeded directly into DirectoryClaimEmail table via psycopg2 Python script (live DB change, 2026-05-10). Warmup schedule confirmed: 20/day (days 0-7) → 50 (8-14) → 100 (15-21) → 200/day stable, 6 four-hour windows.

**Source attribution:** 94.5% have NULL `directoryMostRecentSource`. Only Foursquare (1,130) and HEREPlaces (920) have tags — everything else predates the S696 source-tracking forward-fix. Provenance of ~35,481 orgs is unknown from tags alone (ESN + state licensing scrapers predated the fix).

**Email coverage:**
- Has email: 5,382 (14.3%)
- High confidence (>0.6): 197 (0.5%) — now 183 seeded into outreach queue
- Junk / zeroed: 471

**Geocoding:** 2,202 geocoded (5.9%). 35,329 not geocoded.

**Spot check — WARM tier:** ~75% legitimate resale. Sendable first cohort.

**Verdict:** WARM tier is sendable — mostly legitimate resale businesses, Canada already excluded by cron. COLD tier has significant non-resale noise; don't send broadly. Actionable first cohort: 183 seeded into DirectoryClaimEmail.

---

## Blocked Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #405 Founding Badge | Built S719: backend GET /:id returns field, frontend renders amber pill in trust-signal cluster. Push block ready. | Push packages/backend/src/routes/organizers.ts + packages/frontend/pages/organizers/[id].tsx | S719 |
| #326 eBay Comp Tiles | eBay search returns summary card (10 listings, Median $260) but EbayCompTiles.tsx image grid NOT rendering. ebayImageUrl from ItemCompLookup not displaying | Dispatch findasale-dev: check EbayCompTiles render condition, verify ebayImageUrl is returned from /api/items/comps/ebay endpoint | S719 |
| #280 Condition Rating XP | Set grade B, saved on Victorian Silver Pocket Watch, XP balance unchanged at 15 XP. XP not awarded for condition rating action | Dispatch findasale-dev: trace xpService call in item save handler — confirm conditionGrade XP award is wired up | S719 |
| AuctionNinja + NAA scrapers | enabled:false in sourceRegistry | Decide: set enabled:true to activate | S712 |
| Facebook Marketplace scraper | FB GraphQL doc_id may break with platform changes | Monitor for breakage; fragile by design | S712 |
| directoryMostRecentSource NULL | 84% of organizers have NULL (Phase 2 scrapers write sourcesJson only) | Backfill fix deferred — Phase 2 scrapers need to write the field | S712 |
| MN/MI/TN licensing scrapers | Bot-blocked (Radware/DIFS 403) — graceful no-ops, no failure emails | Needs headless browser + residential proxy (#SCRAPER-HEADLESS-PROXY in Deferred) | S713 |
| Wyoming pawnbroker scraper | wyomingbankingdivision.wyo.gov — not yet investigated this session | Run diagnostic to confirm if still returning data | S713 |
| AI listing enrichment | Fire-and-forget | Check Railway logs for `[listingEnrichmentService]` or query `scrapedMetadata.aiEnriched` | S651 |
| CategoryTopFinds TrendingSection | Cron runs 05:00 UTC — no data until first run | QA after nightly run; verify TrendingSection on `/categories/[category]` | S647 |
| Outreach pipeline open/click tracking | Can't verify without real sends | After first cron run: check Railway logs, confirm pixel route 200 | S647 |

---

## Recent Sessions

### S719 — Chrome QA Sprint (COMPLETE)

Chrome QA on Blocked Queue items. #251 Markdown badge ✅ (verified: ~~$75.00~~ $56.25 on Victorian Silver Pocket Watch sale card). #271 TEAMS copy ✅ (Webhooks line on /pricing TEAMS column). #330 Appraisals ✅ (edit-item button + /organizer/appraisals page both work). Bugs found: #326 eBay Comp Tiles ❌ (summary card renders but EbayCompTiles image grid not shown — dispatch needed to check render condition). #280 Condition Rating XP ❌ (grade B set+saved, XP balance stuck at 15 — XP not awarded). #322 Encyclopedia Inline Tip UNVERIFIED (category picker doesn't resolve free-text inputs). #405 Founding Badge shipped: backend now returns foundingOrgBadge in GET /organizers/:id, frontend renders amber pill badge in trust-signal cluster on storefront — push block pending. Outreach cron code confirmed deployed but Railway log window too short for historical confirm.

### S718 — QA Sprint + Outreach Live (COMPLETE)

Chrome QA: #228 Settlement Receipt ✅, #241 Brand Kit PDFs ✅, #235 Charity Close ✅, #369 Quebec Block ✅ (Canada→Quebec→amber warning + disabled Register), #407 Flip Tracker ROI ✅ (Signed First Edition Novel: $500 revenue - $300 costBasis = +$200 net profit, +66.7% ROI shown in flip-report). Outreach live: OUTREACH_ENABLED=true, cron every 4h, 183 organizers queued. #405 Founding Badge: settings Profile tab renders 🏆 badge when foundingOrgBadge=true — but storefront copy claim "badge appears on your storefront" has no storefront implementation (gap, DECISION needed). #251 Markdown badge: item changed AUCTION→STANDARD (psycopg2); rate limit blocked Chrome verify this session. Purchase record created for Flip Tracker ROI (psycopg2). Data seeded: costBasis, PAID purchase, markdownApplied, priceBeforeMarkdown.

### S717 — eBay Price Comps + Backend Crash Fix (COMPLETE — wrap)

Backend crash loop fixed (ebayController.ts truncated mid-template-literal — 15 lines missing, restored from git). Browse API price comps fixed: `sort=price` → `sort=bestMatch`; added `cleanTitle()` to strip post-comma content, generic words, cap at 5 words — "Zoom B3 Multi-Effects Processor, Rec, Model B3" now searches "Zoom B3 Multi-Effects Processor". eBay developer account audit: Growth Check (Incident 260428-000018, filed 2026-04-28) was filed under artifactmi@gmail.com (Patrick's personal eBay seller account, username artifactcoinsandcollectibles) — production keys on deseee1/deseee@yahoo.com. Draft reply prepared to correct App ID + add Finding API request. No Finding API approval yet. Vercel proxy `EBAY_CLIENT_SECRET` was file secret (not plain text) — fixed in Vercel dashboard. React hooks order crash (#310) — `isDark` useState/useEffect were after early return — moved above all early returns.

### S716 — QA Sprint + 4 Bug Fixes (COMPLETE — wrap)

Chrome QA on 10 features from S712 backlog. ✅ Verified: #411 Dorm Dash (crash fixed), Wave 2 edit-sale (all 6 fields), #412 Cash Bridge POS (handle fields added), Leaderboard, #304 Early Access Cache, #288 Featured Boost, #310 Color Discount Rules. Three P1 bugs found and fixed: #241 Brand Kit PDFs + #228 Settlement Receipt shared root cause (download links used localStorage for auth, empty after cookie migration — replaced with axios+withCredentials). #235 Charity Close — `getUnsoldItems` used `notIn:['SOLD','RESERVED']` but donationController required `status==='AVAILABLE'` — fixed to `status:'AVAILABLE'`. Mid-session fix: #412 Venmo/Zelle handle fields added to Settings Profile tab + PATCH endpoint + POS display. #174 Auction Mechanics human-verified by Patrick. All 3 P1 fixes pending re-verify after push.

### S715 — Scraper Egress Investigation & Fix (COMPLETE — wrap)

117GB Railway Postgres egress traced to runaway NY Phase 2 GitHub Actions workflow (ran ~9 hours, bulk-downloading 29,728 NYC resale license records over public proxy). Investigation path: Railway MCP logs → Postgres checkpoint distances + duplicate-key error pattern (`scraper+*-newyorkphase2@system.finda.sale`) → GitHub Actions workflow identified and manually stopped by Patrick. Root cause: all 45 Phase 2 state scrapers download entire Socrata datasets locally then filter in code. Fixes shipped: (1) server-side `$where`/`$q` Socrata filtering added to 9 scrapers missing it (CA, CT, HI, IL, NV, NY, PA, TX, VA — CO/IA/LA already had filters), (2) P2002 timestamp-suffix duplicate fallback replaced with existing-record lookup in `index.ts`, (3) `timeout-minutes: 60` added to 40 Phase 2 workflows. DB: 23 junk records deleted, 356 legit NY businesses promoted to WARM leadTier. 626 timestamp-dupe organizers with Sales attached — left in place (inert). External brute-force on public proxy confirmed routine internet scanning, not targeted. Google Places API deprecated (not in scope).

### S714 — SEO Content Foundation (COMPLETE — wrap)

384 SEO guide pages generated and live in index.json: 34 Haiku pricing guides (antiques, furniture, jewelry, glass, tools, art — post-processed via fix-seo-batch.js: markdown fence strip, two-array corruption repair, field rename title→heading/content→body, flat→nested content structure, seoScore stripped, saleType normalized to "general") + 350 template pages (city×category + trend reports) from generate-template-pages.mjs. Scripts built: fix-seo-batch.js (fixer + --merge mode) and generate-template-pages.mjs. System prompt in seo-pages-haiku-generator.md updated: correct field names in example JSON, seoScore removed, 15-item batch limit documented. After-reset dispatch at claude_docs/strategy/seo-agent-dispatch.md for 116 remaining pages (batch1b items 35-50 + batch2 50 + batch3 50). Pages served at /guide/[slug], ISR 24hr revalidate, sitemap auto-populates.

### S713 — Scraper Repair Batch (COMPLETE — wrap)

Two emergency MCP pushes to fix backend crash loops (missing yellowPagesCaScraper.ts from subagent write failure; missing export default router from parallel agent conflict on internal.ts). Scraper fixes shipped: OSM 406 (form-encoded POST), GarageSaleFinder hidden-address parse recovery (~50% listing improvement), Missouri auctioneer TLS (axios rejectUnauthorized:false), weekly digest FK crash (Organizer ID → User ID), Canada outreach → OUTREACH_CANADA_ENABLED flag, YellowPages.ca scraper (10 provinces, 6 keywords, JSON-LD), AuctionZip + Canada411 workflows disabled, Missouri pawnbroker schedule disabled. Oklahoma pawnbroker: real PDF scraper (pdf-parse, ODCC monthly roster, 215+ licensees). Louisiana auctioneer: real POST scraper (lalb.org/all_auctioneer-bus.php, cheerio, 76 businesses). pdf-parse added to backend package.json. Roadmap: #SCRAPER-HEADLESS-PROXY added to Deferred (MN/MI/TN need residential proxy). Railway confirmed green after pushes. Patrick: run git fetch && git pull + pnpm install before next push.ps1.

### S712 — Dorm Dash / Wave 2 / Outreach Pipeline / GitHub Actions (COMPLETE — wrap)

P0 Dorm Dash crash fixed: saleController.ts made startDate/endDate/address/city/state/zip optional with defaults (online-only sales were failing Zod validation). Wave 2 edit-sale features shipped: DORM_DASH added to sale type dropdown, Safety Notes textarea, Grief Firewall checkbox, Cover the Fee (Auction-only), Floor Map / Bundle Pricing / Donation Kit nav sections all added to edit-sale/[id].tsx. Settings cleanup: Digital Payment Handles card and Cover Buyer Fees info card removed from settings.tsx. Cash Bridge POS rebuilt: pos.tsx now has Venmo/Zelle payment method buttons with handle display and Stripe fee capture; file reconstructed after mid-write truncation (2557→2667 lines). Leaderboard crash fixed: leaderboardController.ts scouts catch returns empty valid response; Promise.all→Promise.allSettled in leaderboard.tsx. Outreach: 7 pipeline gaps closed (autoSeedOutreachCron.ts created + registered, status filter in outreachEmailsCron, schedule race fix, DCE upsert on discovery, queueForOutreach helper, scoring scoped to unmanaged only, /api/internal/outreach/status observability endpoint). 183 high-confidence organizers seeded live into DirectoryClaimEmail via psycopg2. GitHub Actions: 6 broken state scrapers fixed (PA/RI/SC/SD/TX/UT — wrong URL + wrong auth header), 7 new Phase 2 state workflows (AL/IN/KY/ME/MD/MA/NH — Monday staggered 03:00–04:30 UTC), 17 schedule collisions fixed (Monday had 49 workflows with 13+ exact-time collisions), enrich-backfill.yml auth fixed, 3 new scrapers created (scrape-auction-ninja.yml, scrape-naa.yml, scrape-facebook-marketplace.yml + run-facebook-marketplace.ts). All 4 shipped features Pending Chrome QA.

### S711 — Wave 2 Chrome QA Sprint (COMPLETE — wrap)

Chrome QA on 12 Wave 2 features (main session, no subagent). ✅ #406 Split Bill (both persons paid, counter correct). ⚠️ #407 Flip Tracker (Cost Basis input works, Flip Report renders, ROI needs sold items — queued). UNVERIFIED: #405 Founding Badge (no display surface found anywhere), #369 Quebec block (needs test user). P0 found: DORM_DASH sale type crashes wizard on selection (other sale types unaffected per Patrick). 6 Wave 2 per-sale features absent from /organizer/edit-sale: Safety Notes, Grief Firewall, Sale Floor Map, Bundle Pricing, Cover the Fee, Donation Kit — organizers can't access them. P2: Leaderboard "Failed to load leaderboard data." Product decisions: #412 Cash Bridge → Venmo/Zelle as POS buttons with Stripe fee, remove from Settings standalone; #402 Cover the Fee → Auction sale type only. P0 Dorm Dash wizard crash dispatched to findasale-dev (S711 post-wrap).

### S710 — Wave 2 Vercel Build Fix (COMPLETE — pushed)

Three Vercel build errors from Wave 2 (S696) agent truncation fixed. (1) create-sale.tsx: unescaped apostrophe in DORM_DASH tip string → `they're`. (2) settings.tsx: eBay tab `{activeTab === 'ebay' && (` never closed with `)}` — Wave 2 agent replaced it with `</div>`, dropped the Help & Support tab entirely, and dropped the FeedbackMenu modal. Fixed by restoring pre-W2 tail from f3ee4597 while preserving all Wave 2 additions. (3) sales/[id].tsx: stray `}}` on comment line. TSC zero errors. Vercel green. Roadmap: 12 Wave 2 items updated QUEUED → SHIPPED Pending Chrome QA.

### S709 — Phase 2 Smoke Tests + Connection Pool Fix + Outreach Live (COMPLETE — pushed)

S708 push confirmed landed. OUTREACH_ENABLED flipped to true — 197 high-confidence cohort now live. Backfill confirmed complete: 38,408 scored (COLD=32,530 / WARM=5,663 / HOT=215 / SUPPRESSED=3,498). Phase 2 smoke tests: IA ✅, WI ✅, LA running, AR/MS/Canada411 identified as dead sources. Connection pool fix applied: `?connection_limit=3&pool_timeout=20` added to all 41 Phase 2 scraper ymls. MT 401 pending: INTERNAL_API_TOKEN GH secret doesn't match Railway INTERNAL_API_KEY (Patrick ops action).

### S707 — QA Sprint + Bug Fixes (COMPLETE — pushed)

NSFW detection deferred (roadmap #394 closed). Chrome QA: #174 bid protection ⚠️ confirmed working; P2 bid form UX fixed (shows "Auction Closed" state on ended auctions). #251 priceBeforeMarkdown ❌ on SaleCard fixed — frontend type was missing `markdownApplied`/`priceBeforeMarkdown` fields, backend already returning them. getSaleActivity P1 crash fixed — orphaned Favorite FK caused `PrismaClientUnknownRequestError` on every Live Activity load. All 3 fixes pushed and verified.

---

## Next Session — S720

### Patrick Action Required First

**Push #405 Founding Badge:**
```powershell
git add packages/backend/src/routes/organizers.ts
git add packages/frontend/pages/organizers/[id].tsx
git commit -m "feat: #405 surface foundingOrgBadge on public organizer storefront"
.\push.ps1
```

### Priority 1 — Bug Fixes (dispatch findasale-dev)

1. **#326 eBay Comp Tiles ❌** — EbayCompTiles.tsx image grid not rendering after eBay search. Check render condition and whether ebayImageUrl is returned from /api/items/comps/ebay endpoint.
2. **#280 Condition Rating XP ❌** — Grade B set+saved, XP balance unchanged. Trace xpService call in item save handler — confirm conditionGrade XP award is wired up correctly.

### Priority 2 — Outreach monitoring

Check Railway logs for `[OutreachCron]` and `[autoSeedOutreachCron]` entries. If no sends visible, query DirectoryClaimEmail table for sentAt values via psycopg2. Cron fires every 4 hours — check window times.

### Priority 3 — Decisions

- **AuctionNinja + NAA scrapers:** Enable? Set `enabled:true` in sourceRegistry.
- **MT scraper fix:** Railway → backend → Variables → copy `INTERNAL_API_KEY` → GitHub Secrets → `INTERNAL_API_TOKEN` → re-run MT workflow.
- **eBay Growth Check reply:** Reply to Incident 260428-000018 from artifactmi@gmail.com — correct App ID to `PatrickD-FindAVal-PRD-064c158e4-8fa09c76` + add Finding API request.

### Still in Blocked Queue

- #322 Encyclopedia Inline Tip — needs category pre-set via psycopg2 to trigger tooltip hook
- Wyoming pawnbroker — not yet investigated
- AI listing enrichment — check Railway logs for `[listingEnrichmentService]`
- CategoryTopFinds TrendingSection — verify after nightly 05:00 UTC cron
- Outreach open/click pixel tracking — verify after first real send
