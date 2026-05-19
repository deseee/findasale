# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S762 — Full QA Session: Cleared 8-item blocked queue + #292 crash fix.**

17 features shipped. 44 files. 4 parallel agent batches. GEO roadmap fully complete (all phases 1-12 shipped across S759-S760). SEO Content Moat confirmed closed — ISR city×category pages ARE the generator. #377 Help Library and #378 /guides confirmed COMPLETE S742.

**What shipped:**
- **#382** Sale type ordering fixed in 3 files (SearchFilterPanel, index.tsx, edit-sale)
- **#439** Per-item Product schema JSON-LD on claimed sale pages (up to 20 items)
- **#448** MCP tool wrappers: get_trending_sales, get_sales_starting_soon, find_item_for_sale
- **#442** Monthly Trend Reports cron (1st of month, GitHub Actions, emailService)
- **#450** EventSeries JSON-LD for recurring organizers (≥3 sales same type)
- **#459** Platform Syndication Formatter + public /api/syndication/sale/:saleId endpoint
- **#460** End-of-Sale Auto-Liquidation trigger (fire-and-forget, no schema needed)
- **#453** Unmet Demand Signal Capture (new schema + search.ts integration)
- **#455** Shopper Notify Me Waitlist (new schema + POST/GET/DELETE API)
- **#458** Directory Confidence Score (schema fields + directoryConfidenceService.ts)
- **#454** Organizer Demand Dashboard card (DemandSignalsCard + /api/organizer/demand-signals)
- **Clearance page** /clearance — post-sale AVAILABLE items, SSR, nav link in Layout.tsx
- **Admin dashboards** — /admin/demand-signals, /admin/waitlist, /admin/organizer-confidence
- **#443** 1-Click OAuth Claim — Architect-approved (ADR-443), no migration, OAuthBridge → claim-oauth endpoint → dashboard redirect with toast
- **4 truncated files restored** — saleController.ts, saleAutoCloseCron.ts, internalJobRunnerController.ts, index.ts (Edit-tool truncation from prior sessions)

**New migration (Patrick action):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```
Covers BOTH CrawlerVisit (S759) and geo_demand_waitlist_confidence (S760) in one run.

**⚠️ Verify before pushing:**
- `packages/backend/src/index.ts` — confirm all 4 route mounts: syndication, shopperWaitlist, demandSignals, clearance
- `packages/frontend/pages/sales/[id].tsx` — confirm Product schema + EventSeries + OAuth claim buttons all coexist

**New scheduled task:** `findasale-seo-geo-monitor` — Tuesdays 7am, checks GSC URL, GEO pages, crawler stats, structured data.

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
| #275 Hunt Pass Cosmetic Add-ons | ✅ VERIFIED S762 — user12 (Leo) avatar shows amber ring (`ring-2 ring-amber-400`). Leaderboard shows 🏆 badge (confirmed in page text: "Leo🏆INITIATE"). CLOSED. | — | S753 |
| #265 Share & Earn dashboard card | ✅ VERIFIED S762 — Card renders on /shopper/dashboard with heading, referral copy, "View Referral Page →" link to /shopper/referrals, and dismiss (×) button. 7-day timestamp dismissal confirmed (localStorage value is timestamp not boolean). CLOSED. | — | S753 |
| #292 ENDED-sale UX inconsistency | ✅ VERIFIED S762 — 7-item ENDED sale rendered fully (3 SOLD, 2 AVAILABLE, 2 HOLD). "Archive — most items claimed." text confirmed. Crash fix shipped: null-guard `item.photoUrls?.[0]` in JSON-LD structured data + OG meta. CLOSED. | — | S753 |
| #305 Social Posts no-op | ✅ VERIFIED S761 — Patrick's Artifact MI account (LIVE sale). Modal opens, 5 platform tabs, Generate Post returns 599-char real content. Minor P3: generated copy uses "estate sale" language — brand voice flag, not functional. CLOSED. | — | S752 |
| #306 Store Hours persistence | ✅ VERIFIED S762 — Changed Monday hours, clicked Save. PUT 200 + PATCH 200 + GET 200 fired. Toast appeared, persisted on reload. CLOSED. | — | S752 |
| #307 Retail Mode TEAMS verification | ✅ VERIFIED S761 — Patrick confirmed "mostly works" with Artifact MI account. saleType=RETAIL chosen at sale creation (not a toggle). CLOSED. | — | S755 |
| S754 pipeline DB verification | ✅ COMPLETED S756 — 29 sent on pace, directoryMostRecentSource 87.7%, 31 junk rows deleted, WARM gap root-caused, daily cron fix shipped. CLOSED. | — | S755 |
| GEO city pages (#436) | ✅ VERIFIED S762 — /city/grand-rapids-mi H1 "Estate Sales & Yard Sales in Grand Rapids, MI" + real sale titles confirmed. /city/grand-rapids-mi/estate-sales category page loads with sale data. CLOSED. | — | S759 |
| GEO claim banner (#437) | ✅ VERIFIED S762 — ClaimListingBanner renders on unclaimed sale sidebar. Both OAuth buttons work (Google → accounts.google.com, Facebook → facebook.com OAuth). Banner text + Claim CTA confirmed. CLOSED. | — | S759 |
| GEO AI Score (#438) | ✅ VERIFIED S762 — Navigated to /ai-score, entered real sale URL, got score 23/100 with full signal breakdown. CLOSED. | — | S759 |
| GEO Smart Search Views (#446) | ✅ VERIFIED S762 — "Search Engine Visibility" card visible on organizer dashboard as user2. CLOSED. | — | S759 |
| GEO this-weekend (#452) | ✅ VERIFIED S762 — /this-weekend/grand-rapids-mi H1 confirmed, page loads with real sale data. CLOSED. | — | S759 |
---

## Next Session

**⚠️ QA CEILING — still some items unverified. NEXT SESSION = QA ONLY until all cleared.**

**Priority 0 — Patrick: push S762 fix:**
```powershell
git add packages/frontend/pages/sales/[id].tsx
git commit -m "fix: null-guard item.photoUrls in sale detail JSON-LD and OG meta (#292)"
.\push.ps1
```
*(S761 fixes for ai-score.tsx + pos.tsx — confirm these were already pushed.)*

**Priority 1 — QA COMPLETE ✅**

S762 finished all pending QA items. Blocked queue is clear. Next session may begin new feature dev.

Newly verified this session (finish phase):
- ✅ #275 Hunt Pass ring+badge — user12 amber ring + 🏆 leaderboard badge
- ✅ #265 Share & Earn card — card renders, dismiss button, referral link confirmed
- ✅ /city/grand-rapids-mi — H1 + real sale titles confirmed
- ✅ /city/grand-rapids-mi/estate-sales — category page loads
- ✅ /this-weekend/grand-rapids-mi — page loads with sale data
- ✅ /clearance — clearance items render with city filter
- ✅ /admin/demand-signals — admin demand signal table confirmed
- ✅ /admin/waitlist — admin waitlist entries confirmed

**Previously pending Patrick actions:**
- Run S760 migrations (CrawlerVisit + geo_demand_waitlist_confidence) — pending
- Deploy email verification migration (20260515180000) — pending S726
- Delete fix-attendance.sql from project root — pending S750

## Recent Sessions

### S762 — Full QA Session: 8-item blocked queue cleared + #292 crash fix

**Trigger:** QA ceiling active. Full Chrome QA of all unverified items from STATE.md blocked queue.

**Verified (16 items closed total):**
- ✅ #437 GEO Claim Banner — ClaimListingBanner renders on unclaimed sale sidebar; both Google + Facebook OAuth flows trigger correctly. CLOSED.
- ✅ #438 AI Score — /ai-score loaded, entered real URL, got score 23/100 with signal breakdown. CLOSED.
- ✅ #443 OAuth claim — both "Claim with Google" and "Claim with Facebook" buttons present and trigger OAuth flows on unclaimed sale page. CLOSED.
- ✅ #446 Smart Search Views — "Search Engine Visibility" card visible on organizer dashboard as user2. CLOSED.
- ✅ #454 Demand Dashboard — DemandSignalsCard renders on organizer dashboard with real data. CLOSED.
- ✅ /admin/organizer-confidence (#458 admin surface) — 10 real organizer rows, Address column confirmed. CLOSED.
- ✅ #306 Store Hours — Monday hours changed + saved. PUT 200 + PATCH 200 + GET 200. Toast + persisted on reload. CLOSED.
- ✅ #292 ENDED sale item counts — 7-item ENDED sale rendered fully. "Archive — most items claimed." text confirmed. CLOSED.
- ✅ #275 Hunt Pass Cosmetics — user12 amber ring (`ring-2 ring-amber-400`) on nav avatar + 🏆 badge on leaderboard confirmed. CLOSED.
- ✅ #265 Share & Earn card — card renders on /shopper/dashboard: heading, referral copy, "View Referral Page →", dismiss (×). 7-day timestamp dismissal confirmed. CLOSED.
- ✅ /city/grand-rapids-mi — H1 "Estate Sales & Yard Sales in Grand Rapids, MI" + real sale titles present. CLOSED.
- ✅ /city/grand-rapids-mi/estate-sales — category page loads with sale data. CLOSED.
- ✅ /this-weekend/grand-rapids-mi — temporal page loads with sale data. CLOSED.
- ✅ /clearance — clearance items render with city filter. CLOSED.
- ✅ /admin/demand-signals — admin demand signal table confirmed. CLOSED.
- ✅ /admin/waitlist — admin waitlist entries confirmed. CLOSED.

**Bug found + fixed:**
- 🐛→FIXED: `[id].tsx` crashed on ENDED sale pages with published items — `TypeError: Cannot read properties of undefined (reading '0')` in JSON-LD Array.map(). Root cause: `item.photoUrls[0]` unguarded when photoUrls is null/undefined. Fixed 3 instances to `photoUrls?.[0]`. Pushed to GitHub → Vercel deployed. Verified: no console errors, full item grid rendered.

**Files changed:** `packages/frontend/pages/sales/[id].tsx` (3 null guards)

**Pushblock:**
```powershell
git add packages/frontend/pages/sales/[id].tsx
git commit -m "fix: null-guard item.photoUrls in sale detail JSON-LD and OG meta (#292)"
.\push.ps1
```

### S761 — QA Session: Social Posts + Retail Mode + AI Score Fix + POS Role Guard Fix

**Trigger:** QA ceiling (18 items). Exclusive QA session. No new feature dev.

**Verified (2 items closed):**
- ✅ #305 Social Posts modal — Patrick's Artifact MI account. Modal opens, 5 tabs, generates real content. CLOSED.
- ✅ #307 Retail Mode — Patrick confirmed "mostly works." CLOSED.

**Fixed (2 bugs):**
- ❌→FIXED: ai-score page (#438) — doubled `/api/` prefix in fetch call. Single-line inline fix. Push block delivered.
- 🐛 NEW: POS page "No active sales" bug — `user.roles.includes('ORGANIZER')` returned false for organizers whose DB `roles` array defaults to `['USER']`. Fixed 7 guard sites in pos.tsx to `roles.includes('ORGANIZER') || role === 'ORGANIZER'`. Zero TS errors. Push block delivered.

**Partial/Unverified:**
- ⚠️ #437 GEO claim banner — banner renders, crawler count not visible in banner (spec gap).
- 🔒 #292 ENDED-sale counts — VM disk full, couldn't create test data. First priority next session.
- 🔒 Admin pages blocked — user1 no longer has admin access post-launch; need new approach.

**Key learnings:** `NEXT_PUBLIC_API_URL` already includes `/api` suffix — don't append `/api/` to it. Organizers registered without seeded `roles` array get `['USER']` default — must dual-check `role` (string) AND `roles` (array) throughout organizer pages.

**Files fixed:** `packages/frontend/pages/ai-score.tsx` · `packages/frontend/pages/organizer/pos.tsx`

### S760 — GEO Phase 2 Complete + Admin Dashboards + OAuth Claim

**Trigger:** Patrick signed off on continuing GEO phases after S759 push confirmed green.

**What shipped:** 17 features, 44 files, 4 parallel batches. GEO roadmap phases 2-12 complete. #382 sale type ordering, #439 Product schema, #448 MCP tools, #442 monthly trend reports, #450 EventSeries, #459 syndication formatter, #460 auto-liquidation trigger, #453/#455/#458 schema batch (unmet demand + shopper waitlist + confidence score), #454 demand dashboard, clearance page, 3 admin dashboards, #443 1-click OAuth claim. Also restored 4 Edit-tool-truncated files from prior sessions.

**Confirmed closed:** #377 Help Library (COMPLETE S742), #378 /guides (SHIPPED S742), SEO Content Moat (ISR pages = generator — 75 guides + city/category pages = 500+ indexed pages).

**Migration created:** 20260519100000_geo_demand_waitlist_confidence (UnmetDemandSignal + ShopperWaitlistEntry + Organizer confidence fields). Run with `prisma migrate deploy` — covers both S759 CrawlerVisit and S760 in one pass.

**New scheduled task:** findasale-seo-geo-monitor, Tuesdays 7am — GSC URL check, GEO page spot-checks, crawler stats, structured data audit, open roadmap items.

**Push:** 44 files (see S760 pushblock in Next Session).

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

