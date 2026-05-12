# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S717 — eBay Price Comps + Backend Crash Fix (COMPLETE — wrap)**

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
| #228 Settlement Receipt | Download Receipt returns 401 — fixed S716 (axios+cookies), pending re-verify after push | Chrome QA: click Download Receipt on /organizer/settlement/qa-settlement-001 | S716 |
| #241 Brand Kit PDFs | `?token=` empty on all 4 download buttons — fixed S716 (axios+cookies), pending re-verify after push | Chrome QA: /organizer/brand-kit as PRO user, click all 4 PDF downloads | S716 |
| #235 Charity Close | `getUnsoldItems` returned non-AVAILABLE items — fixed S716, pending re-verify after push | Chrome QA: full DonationModal flow on sale with AVAILABLE items | S716 |
| ShopperOrganizerIntroduction migration | Migration SQL exists but never deployed to Railway — leaderboard scouts section returns empty | Patrick: run `npx prisma migrate deploy` from packages/database with Railway DATABASE_URL | S712 |
| AuctionNinja + NAA scrapers | enabled:false in sourceRegistry | Decide: set enabled:true to activate | S712 |
| Facebook Marketplace scraper | FB GraphQL doc_id may break with platform changes | Monitor for breakage; fragile by design | S712 |
| directoryMostRecentSource NULL | 84% of organizers have NULL (Phase 2 scrapers write sourcesJson only) | Backfill fix deferred — Phase 2 scrapers need to write the field | S712 |
| MN/MI/TN licensing scrapers | Bot-blocked (Radware/DIFS 403) — graceful no-ops, no failure emails | Needs headless browser + residential proxy (#SCRAPER-HEADLESS-PROXY in Deferred) | S713 |
| Wyoming pawnbroker scraper | wyomingbankingdivision.wyo.gov — not yet investigated this session | Run diagnostic to confirm if still returning data | S713 |
| #405 Founding Badge | No display surface found (profile, storefront, leaderboard all checked — badge not rendering anywhere) | Code review to find where badge should render; verify organizer with badge can see it | S711 |
| #369 Quebec block | Needs Quebec user account to test | Create test user with Quebec address; verify they are blocked at checkout | S711 |
| #407 Flip Tracker ROI | Cost Basis input works; Flip Report renders but ROI section requires sold items | Mark an item sold in test account then re-verify ROI calculations in Flip Report | S711 |
| #174 Auction bid form UX | auctionIsOver fix shipped S708 — push pending Patrick confirmation | Re-verify in Chrome after push lands | S707 |
| #251 SaleCard markdown badge | hasMarkdownItems + Sale badge shipped S708 — push pending Patrick confirmation | Re-verify SaleCard shows Sale badge on markdown items after push lands | S707 |
| AI listing enrichment | Fire-and-forget | Check Railway logs for `[listingEnrichmentService]` or query `scrapedMetadata.aiEnriched` | S651 |
| CategoryTopFinds TrendingSection | Cron runs 05:00 UTC — no data until first run | QA after nightly run; verify TrendingSection on `/categories/[category]` | S647 |
| Outreach pipeline open/click tracking | Can't verify without real sends | After first cron run: check Railway logs, confirm pixel route 200 | S647 |

---

## Recent Sessions

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

## Next Session — S718

### Priority 1 — Patrick push (S717 fixes)

```powershell
git add packages/backend/src/controllers/ebayController.ts
git add packages/frontend/pages/organizer/brand-kit.tsx
git add packages/frontend/components/SettlementWizard.tsx
git add packages/frontend/pages/organizer/settings.tsx
git add packages/backend/src/routes/organizers.ts
git add packages/frontend/pages/organizer/pos.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: eBay price comps — truncation crash, bestMatch sort, cleanTitle query trimming"
.\push.ps1
```

### Priority 2 — eBay Growth Check reply (Patrick action)

Reply to Incident 260428-000018 from artifactmi@gmail.com. Draft from S717:
- Correct App ID to `PatrickD-FindAVal-PRD-064c158e4-8fa09c76` (deseee1 account)
- Add Finding API (`findCompletedItems`) access request for sold-price data

### Priority 3 — Re-verify S716 fixes after push (Chrome QA)

1. Brand Kit PDFs — /organizer/brand-kit as PRO user, click all 4 PDF downloads
2. Settlement Receipt — /organizer/settlement/qa-settlement-001, click Download Receipt
3. Charity Close — DonationModal flow on a sale with AVAILABLE items

### Priority 4 — Carry-forward Patrick actions

1. **ShopperOrganizerIntroduction migration (P0 for leaderboard scouts):**
   ```powershell
   cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
   $env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
   npx prisma migrate deploy
   ```
2. **Railway env:** Confirm `OUTREACH_ENABLED=true` and `OUTREACH_WARMUP_START_DATE=2026-05-06`

### Priority 5 — Decisions needed

- **AuctionNinja + NAA scrapers:** Enable? Set `enabled:true` in sourceRegistry.
- **MT scraper fix:** Railway → backend → Variables → copy `INTERNAL_API_KEY` → GitHub Secrets → `INTERNAL_API_TOKEN` → re-run MT workflow.
