# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S770 — MailerLite Purge + Hex Escape Fix + Cron Root Cause Fix**

Purged 498 junk scraped-directory subscribers from MailerLite (free plan was full at 500, blocking real users like a1clcook@gmail.com). Fixed hex escape Prisma error from scraped HTML descriptions. Patched `syncLeadTierGroups` cron to only sync registered users (root cause of the junk subscriber flood).

**Also fixed this session (S768+, UX spot-check + Sentry dispatch):**
- ✅ dashboard.tsx — Literal "X shoppers" placeholder replaced with real viewCount; clipboard copy wrapped in try/catch+toast; 3 stray console.errors removed; icon-only links got aria-label; dropdown buttons got aria-haspopup/aria-expanded
- ✅ edit-sale/[id].tsx — Rules of Hooks violation fixed (auth early return moved into useEffect); geocoding failure now shows toast to user; 9 redundant aria-labels removed from inputs with htmlFor associations
- ✅ NODEJS-17 — organizers.ts was truncated (Edit tool truncation bug) — appended missing 14 lines for claim-oauth route close: prisma.$transaction close + res.json + error handler + export default router
- ✅ NODEJS-S — index.ts: added express.raw() middleware for /api/ebay/account-deletion and /api/ebay/notifications (matches Stripe webhook pattern); stops "stream is not readable" Sentry error
- ✅ NODEJS-1Q — Added 3 Review table indexes to schema.prisma (userId, saleId+moderationStatus+createdAt composite, reviewerIp) + migration 20260520140000

**Fixed this session:**
- ✅ requestTimeout middleware — added `/api/internal/` exemption; prevents 30s kill switch firing on fire-and-forget enrichment routes
- ✅ NODEJS-1B double-response — `internalScraperController.ts` moved 202 outside try; `internalSaleDetailEnrichmentController.ts` + `internal.ts` route got `!res.headersSent` guard in catch
- ✅ 6 slow-query indexes added to schema.prisma — Organizer stripeCustomerId, subscriptionStatus/Tier, graceEndAt, lastScoredAt; User createdAt, roles

**New features this session:**
- ✅ Voice location extraction — `extractLocationTag()` in voiceController.ts detects room names, bin codes (bin B6), shelf/row/aisle references from transcript; auto-fills roomTag field via existing description mic button in VoiceDescriptionInput + RapidCapture (no new UI button)
- ✅ eBay Custom Label append toggles — skuAppendDate/Cost/Location booleans on Organizer model; `buildCustomLabel()` in ebayController builds `FAS-{id} [date] [$cost] [location]`; settings UI added to organizer/settings/ebay.tsx; manual migration created (20260520120000)

**Recovery this session:**
- schema.prisma truncation: Edit tool cut file at line 4689 mid-UnmetDemandSignal, ShopperWaitlistEntry entirely missing. Recovered via `git show 683fd4a4:...` as clean base, added 3 new fields, restored to 4716 lines. Pushed as commit 2ba70eb2.

**Test data in Railway DB (use artifactmi account; Patrick must be present):**
- "Barn Door QA Test Sale" (id: cmpbvumj90001e7t7v5sa1iqi) — PUBLISHED, holdsEnabled, safetyNotes set, 3 items (draftStatus=PUBLISHED), active hold for user12 (CONFIRMED status)
- "QA Test Ended Sale — Donation Kit" (id: 6c9c9f00-17ce-4e69-a9df-b8ba30c1f387) — ENDED, 3 unsold AVAILABLE items

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

**Priority 0 — Patrick: combined push (S768 + S770 fixes):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/middleware/requestTimeout.ts
git add packages/frontend/pages/organizer/dashboard.tsx
git add packages/frontend/pages/organizer/edit-sale/[id].tsx
git add packages/backend/src/index.ts
git add packages/database/prisma/migrations/20260520140000_add_review_query_indexes/migration.sql
git add packages/backend/src/controllers/internalScraperController.ts
git add packages/backend/src/controllers/internalSaleDetailEnrichmentController.ts
git add packages/backend/src/routes/internal.ts
git add packages/database/prisma/schema.prisma
git add packages/backend/src/controllers/voiceController.ts
git add packages/frontend/components/VoiceDescriptionInput.tsx
git add packages/frontend/components/RapidCapture.tsx
git add "packages/frontend/pages/organizer/edit-item/[id].tsx"
git add "packages/frontend/pages/organizer/add-items/[saleId].tsx"
git add packages/backend/src/controllers/uploadController.ts
git add packages/backend/src/controllers/ebayController.ts
git add packages/backend/src/routes/organizers.ts
git add packages/frontend/pages/organizer/settings/ebay.tsx
git add packages/database/prisma/migrations/20260520120000_add_sku_append_toggles/migration.sql
git add packages/backend/Dockerfile.production
git add packages/backend/src/services/listingEnrichmentService.ts
git add packages/backend/src/jobs/outreachEmailsCron.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git commit -m "feat: voice location extraction + eBay Custom Label toggles; fix: MailerLite cron userId filter (prevents scraped org sync); fix: hex escape sanitizer for scraped HTML; fix: requestTimeout /api/internal/; fix: double-response scraper/enrichment; fix: 6 slow-query indexes; fix: organizers.ts truncation; fix: eBay webhook stream; fix: Review indexes; fix: dashboard placeholder + clipboard; fix: edit-sale hooks + geocoding toast"
.\push.ps1
```

**Priority 1 — After push: Patrick run migration:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**Priority 2 — QA: eBay Tier 2B batch (Patrick present + PRO + eBay connected):**
- #428 Review Card Readiness Borders — verify colored left borders (red/yellow/green/blue) on review queue item cards
- #427 eBay Local Pickup Mode — edit-item eBay section, verify Local Pickup checkbox present
- #429 Review Queue Skips Store Description Template — approve item from queue, verify description is item's own not store template boilerplate
- Verify voice extraction: say "living room" while describing an item — roomTag should auto-fill
- Verify eBay settings: toggle skuAppendDate/Cost/Location — Custom Label preview should update

**Priority 3 — Sentry bugs not yet fixed:**
- NODEJS-17: ReferenceError `e is not defined` at organizers route (12 events)
- NODEJS-S: "stream is not readable" at POST /api/ebay/account-deletion (7 events, still active)
- NODEJS-1Q: slow DB query on Review LEFT JOIN Sale — P1 missing index (separate from indexes added this session)
- ebayController.ts line ~2726 (25021 retry path) — still uses `FAS-${item.id}` (intentional, matches existing eBay item). Needs buildCustomLabel() applied once retry path is understood.

**Priority 4 — Railway log check (optional):**
- Check Railway logs for more 413 MailerLite errors like a1clcook@gmail.com (could not access Railway CLI from this session's VM). a1clcook should auto-enroll on next login — `addShopperSubscriber` fires on auth.

**Pending Patrick actions:**
- Deploy email verification migration (20260515180000) — pending S726

## Recent Sessions

### S770 — MailerLite Purge + Hex Escape Fix + Cron Root Cause

**Trigger:** Patrick pasted 3 Railway log issues: MailerLite 413 for a1clcook@gmail.com, hex escape Prisma error on sale cmoog3n0l009tq4utw56ejcrx, enrichment batch health 6/7.

**MailerLite investigation + purge:**
- Free plan was at 500/500 subscribers — all real user registrations blocked (413 errors)
- Root cause: `syncLeadTierGroups` weekly cron in outreachEmailsCron.ts synced ALL organizers with contactEmail + leadTier to MailerLite — including ~56K scraped directory organizers who never created accounts
- 498 of 501 subscribers were junk (scraped emails). 4 legitimate subscribers identified and preserved (a1clcook, plus 3 seed accounts)
- Purged all 498 junk subscribers via MailerLite `batch_requests` API (batches of 50 DELETE operations)
- **Root cause fix:** Added `userId: { not: null }` to `syncLeadTierGroups` Prisma query — only registered users now sync to MailerLite

**Hex escape fix (listingEnrichmentService.ts):**
- Scraped HTML descriptions contain literal `\x` byte sequences that Prisma/PostgreSQL rejects as invalid hex escapes
- Added `sanitizeForPostgres()` function: strips `\x` not followed by valid hex pairs
- Applied in both free extraction path and Haiku AI path

**Could not complete:** Railway log search for more 413-blocked users. Railway CLI not available in this VM session; Sentry had no matching issues. a1clcook should auto-enroll on next login.

**Files changed:** `packages/backend/src/services/listingEnrichmentService.ts` · `packages/backend/src/jobs/outreachEmailsCron.ts`

---

### S769 — Roadmap Audit + 7 Status Corrections

**Trigger:** Patrick asked "what roadmap stuff is left that isn't QA?" — needed accurate remaining dev work list.

**Roadmap corrections (all Patrick-confirmed):**
- #380 Facebook Marketplace GraphQL Scraper → SHIPPED (confirmed done)
- #364 Bing Search API Facebook Event Discovery → DEPRECATED (approach abandoned)
- #418 Phase 2 Scrapers (18 remaining states) → SHIPPED (audit complete)
- #460 End-of-Sale Auto-Liquidation → SUPERSEDED (existing auto-markdown #334 + color-tagged discount rules #310 cover same functionality)
- #378 Help Library Site Surface → SHIPPED S742 — VERIFIED per Patrick
- #331 Voice-to-Tag Phase 2 → SHIPPED (confirmed done)
- #338 Surface Sold-Price Comps → Possibly shipped — Patrick said "may be done"; marked for Chrome verify

**OAuth linked accounts clarification:** #422 UI gap is a settings surface to manage which OAuth providers are connected to an existing account (distinct from main OAuth login). Non-urgent — backend 409 rejection already closes the security hole.

**Files changed:** `claude_docs/strategy/roadmap.md`

---

### S768 — CI/Sentry Fixes + Voice Location Extraction + eBay Custom Label Toggles

**Trigger:** Daily health monitor output (automated). Patrick directed "investigate remaining GitHub Actions 2, 3, 4" then "dispatch 1 2 3 in parallel."

**CI/Sentry fixed (3 parallel agents):**
- ✅ requestTimeout middleware — `/api/internal/` path exempted; Enrich AI timeout was 30s kill switch hitting fire-and-forget routes before 202 response (2/6 runs failing)
- ✅ NODEJS-1B double-response — `internalScraperController.ts` moved `res.status(202).json()` outside try block; `internalSaleDetailEnrichmentController.ts` + `internal.ts` route added `!res.headersSent` guard in catch
- ✅ 6 slow-query indexes — Organizer stripeCustomerId (Stripe webhook `findFirst`), subscriptionStatus+subscriptionTier composite, graceEndAt+graceTierBefore, lastScoredAt; User createdAt, roles

**Voice location extraction (Patrick request — no new button):**
- `extractLocationTag(transcript)` in voiceController.ts — regex patterns for room names (living room, bedroom, garage, attic, kitchen, etc.), bin codes (bin B6), shelf/row/aisle, location/loc codes. Returns title-cased result (e.g. "bin b6" → "Bin B6", "row c shelf two" → "Row C Shelf 2")
- Wired into VoiceDescriptionInput.tsx — if `result.locationTag` and roomTag empty, auto-fills via `onFieldUpdate({ roomTag })`, appends "room: X" to toast
- Wired into RapidCapture.tsx `handleVoiceInput` — after description PATCH succeeds, silent PATCH `/items/${itemId}` with `{ roomTag }`, appends to toast
- Removed: separate room mic button from edit-item/[id].tsx label + RapidCapture overlay badge (Patrick: "too much for the ui")
- Removed: `roomTag` from uploadController.ts item create (now set via post-creation PATCH in voice handler)

**eBay Custom Label append toggles (Patrick request):**
- schema.prisma: `skuAppendDate`, `skuAppendCost`, `skuAppendLocation` Boolean @default(false) on Organizer model
- ebayController.ts: `buildCustomLabel(itemId, organizer, item)` builds `FAS-{id}[ date][ $cost][ location]` based on toggles; replaces hardcoded `FAS-${item.id}` at ~lines 1586 + 1869
- organizers.ts route: 3 new Zod schema fields + prisma.organizer.update() data
- ebay.tsx settings page: "Custom Label (SKU) Append" card with live preview + 3 toggle rows
- Manual migration created: `20260520120000_add_sku_append_toggles/migration.sql` (IF NOT EXISTS guards; `migrate dev` fails on Railway — no shadow DB permission)

**Schema truncation recovery:**
- Edit tool truncated schema.prisma at line 4689 mid-UnmetDemandSignal; ShopperWaitlistEntry entirely missing
- Recovered via `git show 683fd4a4:packages/database/prisma/schema.prisma` as clean base
- Added 3 SKU fields, restored to 4716 lines, pushed as commit 2ba70eb2

**Railway cache-bust:** Dockerfile.production comment updated to `2026-05-20b-force-rebuild (sku-append-toggles)`

**Not fixed this session:**
- NODEJS-17: ReferenceError `e` at organizers route (12 events)
- NODEJS-S: stream not readable at eBay account-deletion (7 events)
- ebayController.ts ~line 2726 retry path still hardcoded `FAS-${item.id}` (intentional)

**Files changed:** `requestTimeout.ts` · `internalScraperController.ts` · `internalSaleDetailEnrichmentController.ts` · `internal.ts` (routes) · `schema.prisma` · `voiceController.ts` · `VoiceDescriptionInput.tsx` · `RapidCapture.tsx` · `edit-item/[id].tsx` · `add-items/[saleId].tsx` · `uploadController.ts` · `ebayController.ts` · `organizers.ts` (routes) · `ebay.tsx` (settings) · `migration.sql` (20260520120000) · `Dockerfile.production`

---

### S766 — QA Sweep (Tier 2C/3A) + 3 Bug Fixes + Test Data Seeded

**Trigger:** Patrick directed "dispatch more QA, be token conscious."

**Fixed:**
- ✅ #363 — lotNumber text input in auction item form (add-items/[saleId].tsx)
- ✅ #58 — achievement event hooks: PURCHASE_MADE (POS), ITEM_LISTED, SALE_ATTENDED, ORGANIZER_CLAIMED never fired. Wired to rsvpController, itemController, posPaymentController, referralService.
- ✅ #221 — shopper holds: "Purchase Now" /checkout 404 fixed → /items/[id]. Button overflow fixed (flex-row + whitespace-nowrap on mobile).

**Verified:**
- ✅ #356 #271 #29 #289 #402 #285 #406 #288 #350

**eBay (Patrick tested):** #424 broken, #425 two bugs (intermittent toast + stale price on push), #426 broken. All deferred to next session.

**Dropped:** #359 Feature/Pinned Flag — maps to Feature Boost paid addon (post-500 organizer scale, already deferred in roadmap).

**Test data seeded in Railway DB:** Barn Door QA Test Sale published (3 items, holds enabled, safetyNotes, hold for user12). Ended sale created for donation kit QA (3 unsold items).

**Files changed:** `packages/frontend/pages/organizer/add-items/[saleId].tsx` · `packages/frontend/pages/shopper/holds.tsx` · `packages/backend/src/controllers/rsvpController.ts` · `packages/backend/src/controllers/itemController.ts` · `packages/backend/src/controllers/posPaymentController.ts` · `packages/backend/src/services/referralService.ts` · `claude_docs/audits/qa-plan-2026-05-18.md`

---

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

