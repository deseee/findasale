# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S712 — Dorm Dash / Wave 2 / Outreach Pipeline / GitHub Actions (COMPLETE — wrap)**

Shipped: Dorm Dash P0 crash fix (saleController.ts — startDate/endDate/address fields made optional with defaults for online-only sales). Wave 2 edit-sale features added (DORM_DASH dropdown, Safety Notes textarea, Grief Firewall checkbox, Cover the Fee auction-only, Floor Map / Bundle Pricing / Donation Kit nav sections). Settings cleanup (Digital Payment Handles card and Cover Buyer Fees info card removed — consolidated into POS). Cash Bridge POS rebuild (Venmo/Zelle buttons with handle display and fee capture in pos.tsx — file was truncated mid-write and reconstructed from 2557→2667 lines). Leaderboard crash fix (Promise.all → Promise.allSettled; leaderboardController scouts catch returns empty valid response). Outreach pipeline: 7 gaps closed (auto-seed cron, status filters, schedule race fix, DCE upsert on discovery, queueForOutreach at all write sites, scoring scoped to unmanaged, /api/internal/outreach/status endpoint). 183 high-confidence organizers seeded into DirectoryClaimEmail live via psycopg2. GitHub Actions: 6 broken state scrapers fixed (PA/RI/SC/SD/TX/UT), 7 new Phase 2 state workflows created (AL/IN/KY/ME/MD/MA/NH), 17 schedule collisions fixed, enrich-backfill.yml auth fixed, 3 new scrapers (AuctionNinja, NAA, Facebook Marketplace).

**S711 (prior):**
Chrome QA on 12 Wave 2 features. ✅ #406 Split Bill. ⚠️ #407 Flip Tracker (ROI needs sold items). UNVERIFIED: #405 Founding Badge, #369 Quebec block. P0 found: DORM_DASH wizard crash. 6 Wave 2 edit-sale features absent. P2: Leaderboard error. Decisions: Cash Bridge → POS buttons; Cover the Fee → Auction-only.

**S710 (prior):**
Three Vercel build errors fixed (create-sale.tsx, settings.tsx, sales/[id].tsx). 12 Wave 2 features confirmed live — marked Pending Chrome QA on roadmap.

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
| Zero-output scraper diagnostics | OSM, GarageSaleFinder, AuctionZip, Canada411, SaleSeeker, Newspaper RSS returning 0 | Run diagnostic scripts to identify root cause | S712 |
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

## Next Session — S713

### Priority 1 — Chrome QA (4 features shipped S712)

**Sequential Chrome QA (one at a time — no parallel):**
1. Dorm Dash: create a new sale, select DORM_DASH, complete wizard, verify no crash, confirm sale saves
2. Wave 2 edit-sale: open /organizer/edit-sale/[id], verify Safety Notes / Grief Firewall / Cover the Fee (Auction) / Floor Map / Bundle Pricing / Donation Kit all appear and save
3. Cash Bridge POS: open POS on a sale, verify Venmo/Zelle buttons appear with handle display
4. Leaderboard: navigate to /leaderboard, verify page loads without error

### Priority 2 — Patrick actions (carry-forward + new)

1. **ShopperOrganizerIntroduction migration (P0 for leaderboard scouts):**
   ```powershell
   cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
   $env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
   npx prisma migrate deploy
   ```
2. **Railway env check:** Confirm `OUTREACH_ENABLED=true` and `OUTREACH_WARMUP_START_DATE=2026-05-06` are set in Railway backend Variables tab
3. **MT secret fix:** Railway dashboard → backend Variables → copy `INTERNAL_API_KEY` value → GitHub Secrets → `INTERNAL_API_TOKEN` → update to match → re-run MT workflow

### Priority 3 — Decisions needed

4. **AuctionNinja + NAA scrapers:** Enable? Set `enabled:true` in sourceRegistry to activate both.
5. **Phase 1 + Phase 2 state scraper parameterization:** Currently 50 Phase 1 + 39 Phase 2 = 89 separate workflow files. Parameterize into 2 matrix workflows? (Low token cost, high maintenance win.)

### Priority 4 — Zero-output scraper diagnostics

OSM, GarageSaleFinder, AuctionZip, Canada411, SaleSeeker, Newspaper RSS all returning 0 records. Dispatch findasale-dev to run diagnostics and identify root cause per scraper.
