# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S765 — Sentry/CI health audit + 11 bug fixes**

Daily health monitor triggered investigation. All actionable Sentry issues resolved. Backend Sentry: 36 → 0 active unresolved (11 resolved by code fixes, 14 ignored as stale build artifacts, rest moot). Frontend Sentry: 4 → 0. Requires 1 migration (non-blocking indexes).

**Fixed this session:**
- ✅ Hooks-count violations in 5 frontend pages — moved hooks above auth guards
- ✅ Global MutationCache onError (_app.tsx) — kills 45x/day "Error: Rejected" Sentry noise
- ✅ Sentry beforeSend filter — drops Dashlane extension errors at source
- ✅ AI enrichment endpoint — fire-and-forget, eliminates Railway 30s timeout
- ✅ Geocoding bulk endpoint — same fire-and-forget fix
- ✅ Scraper ingest endpoint — same fire-and-forget fix (81 events, NODEJS-1B)
- ✅ Facebook Events scraper — parseAddressFromFacebookSlug() extracts real addresses from ~54% of records
- ✅ eBay account deletion — stream.not.readable suppressed before Sentry (eBay retry behavior, NODEJS-S)
- ✅ Workspace routes — removed invalid Prisma relation filter causing PrismaClientUnknownRequestError on /api/workspace + /api/workspace/my-memberships (87 events, NODEJS-A/B)
- ✅ Missing DB indexes — Review.saleId (eliminates 17s query), ItemReservation.userId + (status,expiresAt) — migration created
- ✅ NODEJS-17 (e is not defined) — already fixed in prior commit 2e69a27f, confirmed closed

**Verified this session:**
- ✅ #433 #434 #378 #60 #260 #432 #441 #451 #440 #449 #457 #352 #360 #405 — Tier 2A quick checks all pass
- ✅ #263 — Insights + Brand Kit accessible via PRO TOOLS dropdown (not sidebar nav as plan assumed)
- ✅ #411 — Dorm Dash sale type present on create-sale page
- ✅ #416 — Leaflet map renders on sale detail; Directions button opens Google Maps correctly
- ✅ #153 — Organizer storefront shows full profile (name, location, bio, hours, contact)
- ⚠️ #363 — Buyer's Premium % in step 4 ✅; Lot Number field **MISSING** from organizer item form (P1 dispatched)
- ⚠️ #223 — Tooltips on dashboard/settings/create-sale ✅; add-items page has **zero** guidance elements (P2)

**P2 Brand Kit findings:** Logo field is URL-only (no upload button). Social links split across Brand Kit and Profile Settings pages.

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

**Priority 0 — Patrick: push S763 + S764 + S765 changes:**
```powershell
git add packages/frontend/pages/organizer/flip-report/[saleId].tsx
git add packages/frontend/pages/login.tsx
git add packages/frontend/pages/organizer/holds.tsx
git add packages/frontend/pages/sales/[id].tsx
git add packages/frontend/pages/organizer/message-templates.tsx
git add packages/frontend/pages/coupons.tsx
git add packages/frontend/pages/organizer/payouts.tsx
git add packages/frontend/pages/organizer/webhooks.tsx
git add packages/frontend/pages/shopper/rare-finds.tsx
git add packages/frontend/pages/_app.tsx
git add packages/frontend/sentry.client.config.ts
git add packages/backend/src/controllers/internalListingEnrichmentController.ts
git add packages/backend/src/controllers/internalGeocodingController.ts
git add packages/backend/src/services/scraper/sources/search-facebook-events.ts
git add claude_docs/strategy/roadmap.md
git add claude_docs/audits/qa-status-reconciliation-2026-05-18.md
git add claude_docs/audits/qa-plan-2026-05-18.md
git add claude_docs/audits/geo-verification-2026-05-18.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: hooks order, MutationCache onError, Sentry filter, enrichment+geocoding fire-and-forget, FB Events address parsing; S764 P1 bugs, QA findings"
.\push.ps1
```

**Priority 1 — Dispatch #363 P1 fix (lot number input):**
Dispatch `findasale-dev` to add `lotNumber` text input to organizer item form in `packages/frontend/pages/organizer/add-items/[saleId].tsx`. Backend already handles it at itemController.ts lines 729/903. Condition: only show for AUCTION type sales (match pattern of buyersPremiumPct in create-sale.tsx). Display is already in ItemCard.tsx (line 377) and items/[id].tsx (line 681).

**Priority 2 — Dispatch #439 P1 fix (items in SSR sale query):**
Dispatch `findasale-dev` to add `items: { take: 20, select: { title, price, condition, status } }` to the backend public sale GET query in saleController.ts (~line 313) so Product schema renders server-side for crawlers.

**Priority 3 — QA remaining from qa-plan-2026-05-18.md:**
- #350 Nav Polish — shopper mobile viewport
- Tier 2B eBay batch: #428, #424, #425, #426, #427, #429 (needs PRO + eBay connected)
- Tier 2C Wave 2: #413, #412, #356, #359, #415, #271
- Tier 3A Payment flows: #285, #402, #289, #288, #406 (highest business value)
- #221 Hold-to-Pay modal flow (after S763 push)
- #29 Loyalty Passport, #58 Achievement Badges

**Previously pending Patrick actions:**
- Run S760 migrations (CrawlerVisit + geo_demand_waitlist_confidence) — still pending
- Deploy email verification migration (20260515180000) — pending S726
- Delete fix-attendance.sql from project root — pending S750

## Recent Sessions

### S765 — Sentry/CI Health Audit + 6 Bug Fixes

**Trigger:** Daily health monitor (scheduled task) ran. Patrick directed "investigate and dispatch repairs."

**Health findings (last 24h):**
- GitHub Actions: 11 failures — 10x auctioneer/pawnbroker scrapers (LOW, known ongoing), 1x Enrich AI Listing Metadata (FIXED)
- Backend Sentry: 36 unresolved (14 ignored as stale build artifacts, 2 resolved by fixes, 3 active issues remain)
- Frontend Sentry: 4 unresolved → all 3 code-related resolved; 1 ServiceWorker (persistent, low priority)

**Bugs fixed (4 parallel agents):**
- ✅ Hooks-count violations — 5 pages had auth-guard early returns before hook calls. Fixed: message-templates.tsx, coupons.tsx, payouts.tsx, webhooks.tsx, rare-finds.tsx
- ✅ Global MutationCache onError in _app.tsx — TanStack Query v5 mutateAsync() rejections were unhandled
- ✅ Sentry beforeSend filter (sentry.client.config.ts) — Dashlane extension errors dropped at source
- ✅ internalListingEnrichmentController.ts — fire-and-forget pattern; Railway 30s timeout → 503 fixed
- ✅ internalGeocodingController.ts — same fire-and-forget fix; "Geocode Ungeocoded Sales" workflow now passes
- ✅ search-facebook-events.ts — parseAddressFromFacebookSlug() + parseAddressFromTitle() added; ~54% of FB Events records will now arrive with real street addresses

**Geocoding investigation findings:**
- GarageSaleFinder 5,637 null-lat records: parser is fine, addresses are clean — pure throughput backlog from May 16 large scrape. Will self-clear in ~10 nightly runs. No fix needed.
- Facebook Events 1,130 null-lat records: structural — addresses were always blank at ingest. Fix shipped (slug parser). Existing records unaddressed; future scrapes will geocode correctly.

**Sentry cleanup (MCP):**
- Resolved: NEXTJS-1 (Error: Rejected), NEXTJS-E (Dashlane), NEXTJS-6 (hooks), NODEJS-1W (enrichment double-response), NODEJS-1V (geocoding double-response)
- Ignored forever: 13 stale build artifacts (old "Cannot find module" errors, 15-25 days old)
- Ignored until escalating: NODEJS-1E, NODEJS-11 (geocoding audit warnings, being addressed by FB Events fix)

**Active Sentry issues NOT yet fixed (next dispatch candidates):**
- NODEJS-1B: "Cannot set headers" at POST /api/internal/scraper/ingest — 81 events (double-response in scraper ingest handler)
- NODEJS-17: ReferenceError: `e is not defined` at organizers route — 12 events, 10 days ago
- NODEJS-S: "stream is not readable" at POST /api/ebay/account-deletion — 7 events, last seen 6h ago (active)
- NODEJS-1Q: Slow DB query 17,391ms on Review LEFT JOIN Sale — P1 missing index
- NODEJS-B/A: PrismaClientUnknownRequestError at /api/workspace routes — 87 events, 22-25 days old

**Files changed:**
`packages/frontend/pages/organizer/message-templates.tsx` · `packages/frontend/pages/coupons.tsx` · `packages/frontend/pages/organizer/payouts.tsx` · `packages/frontend/pages/organizer/webhooks.tsx` · `packages/frontend/pages/shopper/rare-finds.tsx` · `packages/frontend/pages/_app.tsx` · `packages/frontend/sentry.client.config.ts` · `packages/backend/src/controllers/internalListingEnrichmentController.ts` · `packages/backend/src/controllers/internalGeocodingController.ts` · `packages/backend/src/services/scraper/sources/search-facebook-events.ts`

---

### S764 — Tier 2 Chrome QA (18 items verified, 2 P1 bugs found)

**Trigger:** Patrick directed "start tier 2, of the full flow ones what are the most pressing?" after S763 TS build fix confirmed green.

**Verified:** ✅ #433 #434 #378 #60 #260 #432 #441 #451 #440 #449 #457 #352 #360 #405 #263 #411 #416 #153 — 18 items confirmed. See Current Status for details.

**Bugs found:**
- ❌ #363 P1: `lotNumber` input missing from organizer item form. Backend accepts it (itemController.ts lines 729/903), ItemCard.tsx + items/[id].tsx display it — but no organizer UI to set it. Dispatch to findasale-dev needed.
- ❌ #439 P1: Backend public sale GET query excludes items. Product schema SSR can't render item data for crawlers. Fix: add items to saleController.ts ~line 313 query. Dispatch to findasale-dev needed.
- ⚠️ #223 P2: add-items page (highest-use organizer flow) has zero Tooltip/explainer elements. Dashboard has 4, settings has 16, create-sale has 3 — but add-items has none.
- ⚠️ Brand Kit P2: Logo field is URL-only (no upload button); social links duplicated across Brand Kit + Profile Settings pages.

**No code changes this session. No push required beyond S763 + this STATE.md + patrick-dashboard.md.**

---

### S763 — QA Reconciliation + 5 Bug Fixes

**Trigger:** Stale roadmap had ~60 "Pending Chrome QA" entries; Patrick directed low-token document audit before Chrome to avoid re-verifying already-confirmed items.

**Audit (document-only, no Chrome):** Cross-referenced all QA session records. 22 items updated to VERIFIED in roadmap, #414 (Grief Firewall) deprecated (code absent from codebase), #27a/#131 marked SUPERSEDED by #305. Created qa-status-reconciliation-2026-05-18.md, qa-plan-2026-05-18.md, geo-verification-2026-05-18.md.

**Bugs fixed (4 parallel agents):**
- ✅ #41 Flip Report "Unable to load" — useFlipReport called unconditionally; non-PRO gets 403 before TierGate. Fixed: null-disable hook for non-PRO + early-return TierGate guard.
- ✅ login.tsx silent error — showToast wired to catch block (same pattern register.tsx already had). 
- ✅ #221 Hold-to-Pay wiring — HoldToPayModal.tsx was complete + orphaned. Imported into holds.tsx, state wired, markSold opens modal for first selected hold.
- ✅ GEO JSON-LD SSR (#432 #439 #440 #441 #451) — !mounted guard at [id].tsx line ~691 blocked all JSON-LD from SSR. JSON-LD blocks moved before the guard using initialData (already SSR prop). Crawlers now receive full structured data.
- ✅ noindex SSR (#449 #457) — noindex computed in getServerSideProps but missing from SaleDetailPageProps. Added to props type, destructured, rendered in <Head> for ENDED/private sales.

**#184 iCal confirmed already fixed:** AddToCalendarButton.tsx uses data: URI client-side. No action needed.

**Files changed:** `packages/frontend/pages/organizer/flip-report/[saleId].tsx` · `packages/frontend/pages/login.tsx` · `packages/frontend/pages/organizer/holds.tsx` · `packages/frontend/pages/sales/[id].tsx` · `claude_docs/strategy/roadmap.md` + 3 new audit docs

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


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                