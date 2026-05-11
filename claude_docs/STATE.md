# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S714 — SEO Content Foundation (COMPLETE — wrap)**

384 SEO pages generated and merged into `packages/frontend/data/seo-pages/index.json`. Batch breakdown: 34 Haiku-written pricing guides (batch1-fixed.json — after post-processing via fix-seo-batch.js to handle markdown fence wrapping, two-array corruption, field renaming, score stripping) + 350 template pages (25 cities × 10 categories = 250 city×category + 10 categories × 10 months = 100 trend reports). All pages served at `/guide/[slug]` — ISR 24hr revalidate, auto-populates server-sitemap.xml. Two new scripts: `scripts/fix-seo-batch.js` (post-processing fixer + merge tool) and `scripts/generate-template-pages.mjs` (template generator). System prompt updated in `seo-pages-haiku-generator.md` (field names fixed, seoScore removed, 15-item batch limit noted). After-reset dispatch ready at `claude_docs/strategy/seo-agent-dispatch.md` to generate remaining 116 Haiku-written pages (batch1b + batches 2+3). Haiku limit confirmed: ~15 items max per session before truncation — agent dispatch avoids this.

**S713 (prior):**
Two backend crash loops fixed. OSM 406, GarageSaleFinder hidden-address, Missouri TLS, digest FK, Canada flag, YellowPages.ca scraper, AuctionZip/Canada411 disabled, MO pawnbroker disabled, OK pawnbroker PDF scraper, LA auctioneer POST scraper.

---

## Pool Audit Findings

Run: 2026-05-10. Railway DB queried directly via psycopg2.

**Pool size:** 37,531 unmanaged org listings total.

**Tier breakdown (post-S708 backfill):**
- COLD: 32,530 (84.7%)
- WARM: 5,663 (14.7%)
- HOT: 215 (0.6%)
- SUPPRESSED: 3,498 (9.1% of total — permanently out of outreach queue via COLD noise blocklist)

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
| #411 Dorm Dash | Shipped — Pending Chrome QA | Navigate to sale creation wizard, select DORM_DASH, verify no crash, confirm sale saves | S712 |
| Wave 2 edit-sale (Safety Notes, Grief Firewall, Cover the Fee, Floor Map, Bundle Pricing, Donation Kit) | Shipped — Pending Chrome QA | Open /organizer/edit-sale/[id] for an existing sale; verify all 6 fields/sections appear and save correctly | S712 |
| #412 Cash Bridge POS (Venmo/Zelle buttons) | Shipped — Pending Chrome QA | Open POS for a sale; verify Venmo/Zelle payment method buttons appear with handle display | S712 |
| Leaderboard | Shipped — Pending Chrome QA | Navigate to /leaderboard; verify page loads without "Failed to load" error | S712 |
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

## Next Session — S715

### Priority 1 — Patrick push action

Push all S714 SEO content:
```powershell
git add scripts/fix-seo-batch.js
git add scripts/generate-template-pages.mjs
git add packages/frontend/data/seo-pages/index.json
git add seo-pages-haiku-generator.md
git add claude_docs/strategy/seo-agent-dispatch.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat(seo): 384 guide pages — 34 Haiku pricing guides + 350 city/category/trend templates; fix-seo-batch.js + generate-template-pages.mjs"
.\push.ps1
```

Note: batch1-fixed.json and batch-templates.json are intermediate files in the project root — they can be committed or .gitignored, your call.

### Priority 2 — After-reset agent dispatch

Once pushed: start a fresh session and run the dispatch from `claude_docs/strategy/seo-agent-dispatch.md` to generate the remaining 116 Haiku pages. This adds the final pricing guide content to index.json.

### Priority 3 — S713 Patrick actions (carry-forward)

1. **ShopperOrganizerIntroduction migration (P0 for leaderboard scouts):**
   ```powershell
   cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
   $env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
   npx prisma migrate deploy
   ```
2. **Railway env check:** Confirm `OUTREACH_ENABLED=true` and `OUTREACH_WARMUP_START_DATE=2026-05-06` in Railway backend Variables tab

### Priority 4 — Chrome QA (4 features still pending from S712)

Sequential Chrome QA (one at a time — no parallel):
1. Dorm Dash: create a new sale, select DORM_DASH, complete wizard, verify no crash
2. Wave 2 edit-sale: open /organizer/edit-sale/[id], verify Safety Notes / Grief Firewall / Cover the Fee / Floor Map / Bundle Pricing / Donation Kit all appear and save
3. Cash Bridge POS: open POS on a sale, verify Venmo/Zelle buttons appear with handle display
4. Leaderboard: navigate to /leaderboard, verify page loads without error

### Priority 5 — Decisions needed

5. **AuctionNinja + NAA scrapers:** Enable? Set `enabled:true` in sourceRegistry to activate both.
6. **MT secret fix:** Railway dashboard → backend Variables → copy `INTERNAL_API_KEY` → GitHub Secrets → `INTERNAL_API_TOKEN` → update to match → re-run MT workflow
