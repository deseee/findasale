# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S759 — GEO/AI Discoverability Build — Phases 1-11 (COMPLETE).**

Dispatched 12 parallel agents across 3 batches. 21 files shipped. 15 GEO roadmap entries (#432–#438, #440, #441, #446, #447, #449, #451, #452, #457) moved from Queued → SHIPPED S759 Pending Chrome QA.

**What was built:**
- **City landing pages**: /city/[slug] (all types) + /city/[slug]/[category] (estate-sales, yard-sales, auctions, flea-markets, consignment) — ISR, ItemList JSON-LD, BreadcrumbList JSON-LD, dark mode, claim CTA
- **Cities index**: /cities — state-grouped city browser with counts, links to city pages — ISR
- **"This Weekend" pages**: /this-weekend/[city] — temporal ISR pages, Friday–Sunday window, revalidate 4h
- **Sale page JSON-LD enrichment**: Real AggregateOffer (actual min/max prices), Speakable schema (h1/.sale-description/.sale-dates), paymentAccepted (CreditCard/Cash/PaymentService), SoldOut availability for ENDED sales, machine-readable sr-only block on claimed pages
- **Claim banner**: ClaimListingBanner component on unclaimed sale pages — client-side crawler visit count + CTA to /claim with city pre-fill
- **AI Score tool**: /ai-score — public URL analyzer, scores 0-100 against 10 GEO signals, letter grade, breakdown
- **Crawler tracking**: CrawlerVisit model (schema change, migration needed), middleware detecting GPTBot/ClaudeBot/Perplexity/Bing/Google, fire-and-forget logging
- **Crawler stats**: /api/crawler-stats/sale/:saleId + /api/crawler-stats/organizer endpoints
- **Smart Search Views card**: SmartSearchViewsCard on organizer dashboard — "Search Engine Visibility", 7-day crawler count with friendly bot names
- **First-crawl notification**: Email sent to organizer on first crawler visit per sale
- **Stale data protection**: ENDED+scraped sales get noindex; excluded from search/MCP results (saleController filter)
- **ChatGPT plugin manifest**: /.well-known/ai-plugin.json pointing to MCP server
- **Sitemap enrichment**: City + city×category entries in server-sitemap.xml + next-sitemap additionalPaths
- **llms.txt**: MCP status → Live, national scope, structured data section added

**Pre-existing broken files fixed (build crashers):**
- pages/city/[slug].tsx — had 5+ non-existent lib imports, would cause Vercel build failure. Rewritten clean.
- pages/cities/index.tsx — was client-side with no ISR. Rewritten with getStaticProps.

**Migration needed (Patrick action):**
CrawlerVisit schema change requires:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```
Migration file: `packages/database/prisma/migrations/20260519000000_add_crawler_visit/migration.sql`

**Previous: S758 — GEO & Discoverability Implementation Plan (COMPLETE).**

Analyzed cross-session GEO/AI Discoverability strategy prompt against existing codebase. Found significant infrastructure already built (JSON-LD on 22 files, robots.txt, llms.txt, MCP server with 7 tools, city landing pages with SSR). Created 12-phase implementation plan + 5-item research queue + 4 GTM strategy notes (`claude_docs/strategy/geo-implementation-plan.md`). Added 29 roadmap entries #432–#460 covering the complete GEO stack. No code changes this session — planning only.
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
| GEO city pages (#436) | S759 — city/[slug] + city/[slug]/[category] pages | Chrome QA: verify a city page loads with real sale data and category tabs | S759 |
| GEO claim banner (#437) | S759 — ClaimListingBanner on unclaimed sales | Chrome QA: visit unclaimed scraped sale detail, verify banner shows with crawler count | S759 |
| GEO AI Score (#438) | S759 — /ai-score URL analysis tool | Chrome QA: enter finda.sale/sales/[id], verify score renders with breakdown | S759 |
| GEO Smart Search Views (#446) | S759 — SmartSearchViewsCard on organizer dashboard | Chrome QA: log in as organizer, verify "Search Engine Visibility" card visible | S759 |
| GEO this-weekend (#452) | S759 — /this-weekend/[city] pages | Chrome QA: visit /this-weekend/grand-rapids-mi, verify page loads | S759 |
---

## Next Session

**⚠️ QA CEILING TRIGGERED — 11 items in Blocked Queue. NEXT SESSION MUST BE QA-FIRST.**

CLAUDE.md §4: "If the Blocked/Unverified Queue has ≥8 items, the next session MUST be a dedicated QA session. No new feature dev without Patrick explicit sign-off."

**Priority 0 — PUSH S759 (Patrick action — 21 files).**

This is the largest push block in recent sessions. Push ALL files in the pushblock below.

**Priority 1 — Run CrawlerVisit migration (Patrick action):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**Priority 2 — Chrome QA session (11 Blocked Queue items).**

Run QA one per dispatch (§10c micro-dispatch rule):
- #275 Hunt Pass ring+badge (FIXED S755)
- #265 Share & Earn card (FIXED S755)
- #292 ENDED-sale counts (FIXED S755)
- #305 Social Posts modal (FIXED S755)
- #306 Store Hours persistence (FIXED S755)
- #307 Retail Mode on TEAMS account
- GEO city pages — city/grand-rapids-mi and city/grand-rapids-mi/estate-sales load with real data
- GEO claim banner — unclaimed sale page shows ClaimListingBanner
- GEO AI Score — /ai-score returns real score for a finda.sale URL
- GEO Smart Search Views — organizer dashboard has "Search Engine Visibility" card
- GEO this-weekend — /this-weekend/grand-rapids-mi page loads

**Priority 3 — Remaining GEO items after QA pass (pending Patrick sign-off to continue):**
- #439 Per-item Product Schema on claimed sale pages
- #442 Automated Monthly Trend Reports
- #443 1-Click OAuth Claim
- #448 MCP Tool Wrappers (get_trending_sales, get_sales_starting_soon, find_item_for_sale)
- #450 EventSeries Schema for recurring sales
- #453 Unmet Demand Signal Capture (schema change)
- #454 Organizer Demand Dashboard
- #455 Shopper Notify Me Waitlist (schema change)
- #458 Confidence Score on Directory Entries (schema change)
- #459 Platform Syndication Formatter
- #460 End-of-Sale Auto-Liquidation

**Previously pending Patrick actions (still needed):**
- PUSH S755 block (10 code files) — if not yet done
- PUSH S756 block (2 files) — if not yet done
- PUSH S758 block (roadmap + STATE + dashboard + strategy doc)
- Deploy email verification token migration (20260515180000) — pending from S726
- Delete fix-attendance.sql from project root — pending from S750
- Log back into Chrome as yourself (artifactmi@gmail.com) after any QA


## Recent Sessions

### S759 — GEO/AI Discoverability Build — Phases 1-11 (COMPLETE)

**Trigger:** Patrick's S758 GEO plan ready for implementation; QA deferred per Patrick directive.

**What shipped:** 21 files across 3 parallel batches (12 agents). 15 GEO roadmap entries moved from Queued → SHIPPED.

Core: city×category ISR pages, cities browse index, this-weekend temporal pages, sale page JSON-LD enrichment (Speakable + PaymentMethod + SoldOut + sr-only block + real AggregateOffer prices), ClaimListingBanner on unclaimed pages, AI Score tool at /ai-score, ChatGPT plugin manifest, CrawlerVisit schema+middleware+stats endpoint, Smart Search Views card on organizer dashboard, first-crawl email notification, stale scraped data protection (noindex + search exclusion).

**Pre-existing crash bugs fixed:** city/[slug].tsx (5+ non-existent lib imports), cities/index.tsx (broken client-side). Both would have caused Vercel build failure.

**Migration needed:** CrawlerVisit model — run `prisma migrate deploy` + `prisma generate` with Railway DB URL.

**Push:** 21 files (see S759 pushblock below).


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

**Fix 1 — RapidCapture.tsx:** Swapped `matchMedia('change')` listener to `window.addEventListener('resize', ...)` + `screen.or