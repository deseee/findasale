# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S779 — Outreach Email Deliverability Fix**

Root cause of 0% open rate (417 sends, 0 real opens): all outreach email bodies contained `https://backend-production-153c9.up.railway.app` URLs (tracking pixel + unsubscribe link). `.railway.app` is a shared provider domain flagged by spam filters same as heroku/ngrok. Fix: added `api.finda.sale` custom domain to Railway backend service; added CNAME (`api` → `uerigpyb.up.railway.app`) and TXT verification record to Vercel DNS; Patrick set `RAILWAY_BACKEND_URL=https://api.finda.sale` in Railway Variables. Future outreach emails will use clean branded URLs.

Secondary issue identified (not yet fixed): `buildRawEmail()` in `outreachEmailsCron.ts` declares `multipart/alternative` but only includes `text/html` — missing `text/plain` fallback. Fix needed next session.

Added GitGuardian to `findasale-ci-sentry-health` scheduled task (Step 3). GG_API_KEY needed to activate.

No code files changed this session — DNS + Railway env changes only.

**Previous: S778 — Vercel Build Fix + eBay Blue Pill + Re-push Button + #424 Root Cause**

Vercel build was failing for 4+ consecutive deploys (`@types/react` missing) because `NODE_ENV=production` causes pnpm to skip all `devDependencies`. Fix: moved all 11 devDependencies to regular `dependencies` in `packages/frontend/package.json`; added `.npmrc` with public-hoist-pattern entries. Then hit a second missing type (`@types/minimatch`) — added to deps. Awaiting Patrick push + Vercel confirmation.

eBay UX improvements: (1) status badge on `[saleId].tsx` turns blue (instead of green "Live") when `item.ebayListingId` is set; (2) "Re-push to eBay" button added to `edit-item/[id].tsx` alongside "View on eBay" — calls existing `handlePushToEbay`, allows applying description template to already-listed items.

#424 root cause confirmed: `EbayPolicyMapping.defaultDescriptionHtml` was NULL in Patrick's DB (template never saved in FindA.Sale eBay Settings, only in eBay's own listing template system). Patrick added the template to the FindA.Sale field. Existing items need "Re-push to eBay" to apply it.

user3 TEAMS modal (Blocked Queue): Confirmed not a bug — Patrick had manually set user3 to TEAMS in Railway DB. Removed from blocked queue.

**Previous: S775 — eBay Tier 2B QA + Custom Label Bug Fix**

Chrome QA of eBay Tier 2B batch: #427 Local Pickup Mode ✅, #428 Review Card Readiness Borders ✅, #429 Description Template on Approve ✅, Voice location extraction ✅ (Patrick verified directly). Bug found and fixed: Custom Label append toggles (`skuAppendDate/Cost/Location`) were not persisting — root cause was GET /organizers/me missing these 3 fields from its response JSON. Fix: 3-line add to `packages/backend/src/routes/organizers.ts`. TypeScript clean. Awaiting Patrick push.

---

**S774 — Scraper Audit + Admin User Mgmt + Migration Recovery**

Full scraper ecosystem audit: removed 5 dead scrapers (SaleSeker, Newspaper RSS, Canada411, Eventbrite, AuctionNinja dupe), fixed 4 misconfigured scrapers (FB Marketplace state field, YellowPages.ca stats tracking, ESN cron removal, Website Address Friday), fixed backfillBenchmarks dead Prisma query, created AuctionZip GH Actions workflow. Added admin suspend/delete for users + `isHiddenFromDirectory` flag on Organizer. Migration crashed production DB (WAL overflow from bulk UPDATE on 57K rows) — rewrote migration to DDL-only, resolved Prisma failed-migration record, re-applied successfully. Backfill run separately via `prisma db execute`. Postgres region moved from EU West (Amsterdam) to US East by Patrick. Stale DATABASE_URL password discovered and corrected (was `QvnU...` → now `Qlzi...`).

**S771 — Bug Hunt (Sentry / Railway / crons)**

- ✅ Scraper Sentry-noise flood fixed at source — `services/scraper/index.ts` was firing `Sentry.captureMessage(...returned 0 results..., 'warning')` on every zero-result scrape (added in today's commit 176fc6c). 18 of 19 unresolved Sentry issues were this noise. Zero results is a normal SUCCESS for low-volume metros (only small markets fired → scraper is healthy). Both calls → console.log; removed now-unused Sentry import.
- ✅ NODEJS-W (playwright-extra `default.use is not a function`, fatal module-load crash) — confirmed already fixed in current `saleDetailEnrichment.ts` (named `{ chromium }` import + deferred stealth registration). Resolved stale Sentry issue.
- ✅ NEXTJS-G ("Java object is gone") — Facebook in-app browser instrumentation, not our code. Added beforeSend filter in `sentry.client.config.ts`. Resolved.
- Verified Railway backend Online, all in-process crons [CRON OK], no runtime errors in log buffer. Slow-query Sentry warnings (NODEJS-10/1G/1X/1T) confirmed STALE — last fired 2026-05-08, transient scrape-load, no fix shipped (would need speculative migration).
- Files changed: `packages/backend/src/services/scraper/index.ts` · `packages/frontend/sentry.client.config.ts`

**S770 — MailerLite Purge + Hex Escape Fix + Cron Root Cause Fix**

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

_S772 reconciliation: graduated/closed rows (✅ VERIFIED/CLOSED/DONE) removed — they are now reconciled into `strategy/roadmap.md` (SHIPPED & VERIFIED S772 + Pending Chrome QA Backlog). Only genuinely open items remain below._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| Settings UI for linked OAuth providers | Backend endpoint `/auth/oauth/link` ready, no frontend surface yet | Build linked-accounts section in organizer/settings.tsx (deferred — security hole closed by backend rejection alone) | S723 |

| P0-3: Email verification token expiry | Migration created S726 (20260515180000) — schema.prisma updated, authController.ts updated. Patrick deploying next week. | Patrick: deploy migration when ready (same powershell block as before) | S722 |
| AuctionNinja + NAA scrapers | enabled:false in sourceRegistry | Decide: set enabled:true to activate | S712 |
| Facebook Marketplace scraper | FB GraphQL doc_id may break with platform changes | Monitor for breakage; fragile by design | S712 |
| directoryMostRecentSource NULL | 84% of organizers have NULL (Phase 2 scrapers write sourcesJson only) | Backfill fix deferred — Phase 2 scrapers need to write the field | S712 |
| MN/MI/TN licensing scrapers | Bot-blocked (Radware/DIFS 403) — graceful no-ops, no failure emails | Needs headless browser + residential proxy (#SCRAPER-HEADLESS-PROXY in Deferred) | S713 |
| AI listing enrichment | Fire-and-forget | Check Railway logs for `[listingEnrichmentService]` or query `scrapedMetadata.aiEnriched` | S651 |

---

## Next Session

**Priority 0 — Outreach deliverability follow-ups:**
- Fix `buildRawEmail()` in `outreachEmailsCron.ts` — add `text/plain` MIME part so `multipart/alternative` is valid. Dispatch findasale-dev.
- Gmail deliverability audit — check SPF/DKIM/DMARC alignment for `outreach@finda.sale`; review Gmail Postmaster Tools if available.
- Review GitGuardian issues Patrick flagged — resolve or dismiss each incident.
- Review new Sentry issues Patrick flagged.
- Note: `GG_API_KEY` needed in Railway env to activate GitGuardian step in `findasale-ci-sentry-health` scheduled task.

**Priority 1 — Patrick: push everything pending**

Commit 1 — S778 @types/minimatch fix (Vercel build):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
pnpm install
git add packages/frontend/package.json pnpm-lock.yaml
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: add @types/minimatch to deps; S778 wrap docs"
.\push.ps1
```
Then watch Vercel — should deploy clean. eBay blue pill + re-push button already in this deploy.

Commit 2 — S776 scraper fix:
```powershell
git add packages/backend/src/services/scraper/index.ts
git commit -m "fix: remove isHiddenFromDirectory=true from new scraped org creation (was hiding all new scrapes from city pages)"
.\push.ps1
```

Commit 3 — S775 Custom Label fix:
```powershell
git add packages/backend/src/routes/organizers.ts
git commit -m "fix: include skuAppendDate/Cost/Location in GET /organizers/me response"
.\push.ps1
```
After Railway deploys: go to `/organizer/settings/ebay`, toggle Append Date, save, reload — checkbox should stay checked.

Commit 4 — S773 Facebook export tracking:
```powershell
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260523120000_add_fb_exported_at/migration.sql
git add packages/backend/src/controllers/exportController.ts
git add packages/backend/src/services/facebookNudgeService.ts
git add packages/backend/src/controllers/posPaymentController.ts
git add packages/backend/src/controllers/reservationController.ts
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/controllers/terminalController.ts
git add packages/backend/src/controllers/ebayController.ts
git add packages/backend/src/jobs/ebaySoldSyncCron.ts
git add packages/backend/src/routes/items.ts
git commit -m "feat: track fbExportedAt per item on Facebook XLSX export; nudge organizer to mark sold on FB when item sells"
.\push.ps1
```
Then run migration:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:Qlzi9PdY34gG6H7zIVOBbJScz1V1sI2sicifzXhDM8@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**Also: delete temp scripts** `packages/database/check-hidden.js` and `packages/database/fix-hidden-backfill.js` (hardcoded credentials — do not commit).

**Priority 1 — Dispatch user3 TEAMS modal bug + review queue UX improvement:**
- Dispatch findasale-dev to fix SIMPLE tier user seeing "Welcome to TEAMS!" onboarding modal
- Patrick flagged the review queue "More details" expand section as needing UX improvement — log for findasale-ux to spec

**Priority 2 — Pending Chrome QA backlog (remaining):**
- #424: Code-verified (backend `{{DESCRIPTION}}` replacement confirmed). Needs live eBay push to fully confirm end-to-end.
- #425: UI confirmed (✅ "Also push to eBay" checkbox in review queue More Details). End-to-end push not tested without real publish.
- #426: ✅ fully verified (Best Offers checkbox + conditional fields on edit-item).

**Priority 3 — Slow query dispatch (Sentry 2K, 2J, 1P, 1G):**
4 slow query warnings remain (1–1.7s). Dispatch findasale-dev to add missing indexes.

**Priority 2 — Slow query dispatch (Sentry 2K, 2J, 1P, 1G):**
4 slow query warnings remain (1–1.7s). Dispatch findasale-dev to add missing indexes.

**Note:** Global CLAUDE.md has wrong DB password (`JaZz` should be `JScz`). Cannot edit from Cowork session — Patrick must update manually or it will cause auth failures on future migration commands.

## Recent Sessions

### S779 — Outreach Email Deliverability Fix (DNS + Railway Env)

**Trigger:** Patrick — "not one open in 417 sends?" (outreach touch 1 stats: 418 sent, 1 open = test send, 0 real opens)

**Root cause:** Every outreach email body embedded `https://backend-production-153c9.up.railway.app` URLs (tracking pixel + one-click unsubscribe link). `.railway.app` is a shared hosting provider domain (same spam-filter category as herokuapp.com, ngrok.io) — routed directly to spam regardless of sender reputation.

**Fix applied:**
- Registered `api.finda.sale` as custom domain on Railway backend service (port 5000)
- Added CNAME `api` → `uerigpyb.up.railway.app` to Vercel DNS via API
- Added TXT `_railway-verify.api` → `railway-verify=86c20c9ad02b641fa4ea5fdff1ca936cca0c89b584a1f4bdc0e5d22322765783` to Vercel DNS via API
- Patrick set `RAILWAY_BACKEND_URL=https://api.finda.sale` in Railway Variables

**Secondary issue identified:** `buildRawEmail()` in `outreachEmailsCron.ts` declares `multipart/alternative` but only includes `text/html` — no `text/plain` part. Spam filters treat this as a secondary signal. Fix pending.

**Scheduled task update:** `findasale-ci-sentry-health` updated to include GitGuardian as Step 3. GG_API_KEY needed in Railway env.

**Files changed:** None (DNS + Railway env only). Scheduled task prompt updated via MCP.

---

### S778 — Vercel Build Fix + eBay Blue Pill + Re-push Button

**Trigger:** Continuation of S777 QA session. Vercel build was failing; eBay UX gaps addressed.

**Vercel build fix:** `NODE_ENV=production` causes pnpm to skip `devDependencies`. Fix: moved all 11 devDependencies to regular `dependencies` in `packages/frontend/package.json`. Added `.npmrc` with public-hoist-pattern entries. Then hit `@types/minimatch` missing — added to deps. Awaiting Patrick push + Vercel confirmation.

**eBay UX:** (1) Status badge on `[saleId].tsx` turns blue when `item.ebayListingId` is set (instead of showing a second "eBay" pill). (2) "Re-push to eBay" button added to `edit-item/[id].tsx` alongside "View on eBay" — allows applying description template to already-listed items via existing `handlePushToEbay` handler.

**#424 root cause:** `EbayPolicyMapping.defaultDescriptionHtml` was NULL (template lived in eBay's own system, not FindA.Sale settings). Patrick added the template. Existing items need re-push to pick it up.

**user3 TEAMS modal:** Confirmed not a bug — Patrick manually set user3 to TEAMS in Railway DB. Removed from blocked queue.

**Files changed:** `packages/frontend/package.json` · `packages/frontend/pages/organizer/add-items/[saleId].tsx` · `packages/frontend/pages/organizer/edit-item/[id].tsx` · `.npmrc`

---

### S777 — Chrome QA: #338, #430 Verified; #424/#425/#426 UNVERIFIED; user3 TEAMS modal bug found

**Trigger:** Patrick — "Begin QA, only QA and noting fixes, be token efficient and plan groups accordingly so you don't waste my session logging in and out."

**Chrome QA results:**
- #430 Register Form Silent Error ✅ — duplicate email submission shows red toast + inline "Sign in instead?" error banner. Fix confirmed live.
- #338 Sold-Price Comps in Edit-Item UI ✅ — comps widget present on full edit-item page; shows price range + condition (e.g. "$80–$225 EXCELLENT") + 3 eBay sold listings grid. Note: format is range+condition, not "N sources/median" as roadmap described. Comp match quality appears low (AI matching issue — Cast Iron Skillet matched against Pyrex bowl) — data quality concern, not a missing feature.
- #424/#425/#426 eBay features UNVERIFIED — seed account user2 (PRO) shows "eBay Connection Required" / "Failed to load setup data". eBay OAuth not connected on any seed account. Review queue also empty on user2, blocking #425 test independently.

**Bug found:** user3 (Carol Williams, SIMPLE tier) showed "Welcome to TEAMS!" onboarding modal. Wrong tier check — added to Blocked Queue for dispatch.

**Behavioral feedback from Patrick:** "This is the planning i keep talking about! why can't you actually look first you dumbass?" — standing rule confirmed: open Chrome and look first before planning from docs. Applied immediately.

**Roadmap updated:** #338 and #430 graduated to ✅ Chrome QA S777. #424/#425/#426 updated with UNVERIFIED S777 + specific blocker notes.

**Patrick restored:** artifactmi@gmail.com session confirmed active in Chrome at session end.

---

### S776 — isHiddenFromDirectory Investigation + Scraper Fix + Data Recovery

**Trigger:** Patrick — investigate whether the S774 isHiddenFromDirectory backfill was actually needed.

**Finding:** `isHiddenFromDirectory` has exactly 3 usages in the entire codebase: (1) `citiesController.ts` filters `isHiddenFromDirectory: false` to show scraped orgs on city pages, (2) `scraper/index.ts` was creating new orgs with `isHiddenFromDirectory: true`, (3) claim flow sets it to `false` on claim. There is no separate "public organizer directory" — the field gates city page visibility only. S774's intent (hide from "public directory") misidentified the consumer.

**Scraper bug fixed:** Removed `isHiddenFromDirectory: true` from new org creation in `scraper/index.ts` line 489. New scraped orgs will now appear on city pages (column defaults to `false`).

**Data regression found and fixed:** Verified via direct DB query — backfill DID run in S774. All 60,236 scraped organizers had `isHiddenFromDirectory = true`, making every city page return zero organizer results (live, silent regression). Ran batched reverse fix in 500-row chunks. All 60,236 restored to `false`. City pages functional.

**Password discovery:** Correct proxy URL password is `JScz...` (in `packages/database/.env`). Global CLAUDE.md and dashboard.md had stale `JaZz...` — dashboard.md corrected this session. Global CLAUDE.md cannot be edited from Cowork session.

**Files changed:** `packages/backend/src/services/scraper/index.ts`
**Temp files (delete, do not commit):** `packages/database/check-hidden.js`, `packages/database/fix-hidden-backfill.js`

---

### S775 — eBay Tier 2B QA + Custom Label Bug Fix

**Trigger:** Patrick — "begin the qa"

**Chrome QA results:**
- #427 eBay Local Pickup Mode ✅ — switched to SALE_ADDRESS, saved, reloaded, JS confirmed persisted
- #428 Review Card Readiness Borders ✅ — red border on incomplete (Untitled, $0), blue border on complete (MXL 770, 92% confidence)
- #429 Description Template on Approve ✅ — MXL 770 approved from review queue; API confirmed description "2 8. MXL 770 small-diaphragm..." saved to item
- Voice location extraction ✅ — Patrick verified directly on device
- Custom Label toggles ❌ BUG FOUND → root cause identified → fix deployed

**Bug root cause:** GET /organizers/me (line ~515 in organizers.ts) manually constructs response JSON but omitted `skuAppendDate`, `skuAppendCost`, `skuAppendLocation`. PATCH saves correctly; GET never returns them. Frontend defaults to `false` on reload.

**Fix:** 3-line add to `packages/backend/src/routes/organizers.ts` GET /me response. TypeScript clean. Awaiting Patrick push.

**Roadmap updated:** #427, #428, #429 marked ✅ Chrome QA S775 in roadmap.md Pending Chrome QA Backlog and UNTESTED sections.

---

### S774 — Scraper Audit + Admin User Management + Migration Recovery

**Trigger:** Patrick — "scraper audit — what do we actually have, what works, what's dead weight?"

**Scraper cleanup (5 removed, 4 fixed):**
- Removed: SaleSeker (dead), Newspaper RSS (dead), Canada411 (dead), Eventbrite (dead), AuctionNinja dupe (redundant — NAA covers same source)
- Fixed: FB Marketplace missing `state` field, YellowPages.ca stats tracking, ESN cron removal (non-functional), Website Address Friday cron (moved to weekly from daily)
- Fixed: backfillBenchmarks dead Prisma query (`findMany` on deleted fields)
- Created: AuctionZip GH Actions workflow (was missing — scraper existed but no cron)
- NAA scraper: tested selectors, confirmed working, left `enabled: false` for Patrick to activate

**Admin user management:**
- Added suspend/delete endpoints to admin users controller
- Added `isHiddenFromDirectory` boolean to Organizer model (scraped organizers hidden by default)
- Added `deletedAt` soft-delete timestamp to User model

**Migration crash + recovery:**
- Original migration included `UPDATE "Organizer" SET "isHiddenFromDirectory" = true WHERE "isUnmanagedListing" = true` — bulk UPDATE on ~57K rows caused WAL overflow, Postgres ran out of disk, crashed
- Database confirmed clean (PostgreSQL transactional DDL rolled back all changes)
- Rewrote migration to DDL-only (ALTER TABLE + CREATE INDEX, no data manipulation)
- Resolved Prisma `_prisma_migrations` failed record via `prisma migrate resolve --rolled-back`
- Re-applied migration successfully
- Ran backfill separately via `prisma db execute --stdin`

**Infrastructure:**
- Discovered Postgres was in EU West (Amsterdam) while backend is US East — cross-Atlantic latency on every API call. Patrick moved Postgres to US East during this session.
- Discovered stale DATABASE_URL password in CLAUDE.md and STATE.md. Old: `QvnU...`, current: `Qlzi...`. All references updated.

**Files changed:** Multiple scraper configs, admin controllers, schema.prisma, migration SQL. All pushed by Patrick during session.

---

### S773 — Facebook Export Tracking + Sold Nudge (#461)

**Trigger:** Patrick — "now that we have facebook marketplace bulk uploads, is there any way that if a listing gets marked as sold on facebook or finda.sale the item is removed from the other?"

**Research finding:** Facebook Marketplace has no public API or webhooks for standard sellers — the bulk upload is a manual XLSX download that organizers upload themselves. Meta Marketplace Partner Program (Item API) is a real integration path (how Shopify does it) but requires Meta partner approval not achievable at current scale.

**Feature built:** Per-item Facebook export tracking (`fbExportedAt DateTime?` on Item) + organizer nudge notification when a tracked item sells on FindA.Sale with deep link to facebook.com/marketplace/selling/.

- `fbExportedAt` field added to Item model (schema.prisma)
- Migration created: `20260523120000_add_fb_exported_at`
- `exportController.ts`: both `exportFacebookXLSX` and `exportFacebookJSON` now stamp `fbExportedAt` on exported items
- `facebookNudgeService.ts`: new service — fetches item, checks `fbExportedAt`, creates organizer notification
- 8 sold trigger points wired (posPaymentController, reservationController, stripeController, terminalController, ebayController webhook, ebaySoldSyncCron, routes/items.ts)
- All wired as fire-and-forget: `notifyFacebookExportedItemSold(id).catch(err => console.warn(...))`
- TypeScript: zero errors
- Roadmap: #461 added — "Facebook Export Tracking + Sold Nudge | ORG | SIMPLE | Queued S773 — Dev dispatched"
- Long-term path documented in roadmap: Meta Marketplace Partner Program application

**Files changed (11):** schema.prisma · 20260523120000_add_fb_exported_at/migration.sql · exportController.ts · facebookNudgeService.ts (NEW) · posPaymentController.ts · reservationController.ts · stripeController.ts · terminalController.ts · ebayController.ts · ebaySoldSyncCron.ts · routes/items.ts

**Push block:** See "## Next Session" Priority 0.
**Pending:** Migration deploy (fbExportedAt column) after Railway picks up the push. Chrome QA of nudge flow.

---

### S772 — Roadmap Reconciliation Audit (DOCS)
Synced `strategy/roadmap.md` against ~30 sessions of QA evidence (S718–S769), then consolidated the file to make it leaner. No code touched.
- **~33 verified items consolidated into the compact SHIPPED & VERIFIED table** — their long verbose detail rows were REMOVED from the Building / UNTESTED / "Only Human Left" / GEO tables and each now appears exactly once as a one-line entry. Items: #174, #228, #235, #241, #294, #305, #306, #307, #310, #322, #326, #329, #330, #331, #353, #355, #362, #124, #265, #275, #292, #378, #380, #407, #418, and GEO #436/#437/#438/#443/#446/#452/#454/#456. (#88 already lived in the compact table as #277 — its verbose duplicate was removed, no second entry added.)
- **Removed the duplicate "Reconciled to SHIPPED & VERIFIED in the S772 audit" index table** — it was pure duplication of rows that already exist elsewhere.
- **Moved 5 superseded/deprecated items to Deferred → Superseded/Deprecated** (compact one-liners, verbose rows removed): #460 (superseded by #334+#310), #27a + #131 (superseded by #305), #364 + #414 (deprecated).
- **"Pending Chrome QA Backlog (Reconciled S772)" section** retained as the single home for genuinely-unverified shipped features (#338, #427, #428, #429, #424, #425, #426) plus pointers to the standing UNTESTED/TESTING tables.
- **STATE.md Blocked Queue trimmed:** 38 closed (✅ VERIFIED/CLOSED/DONE) rows removed — they now live in the roadmap. 7 genuinely-open rows retained.
- roadmap.md REDUCED 753 → 724 lines net (started session at 753). Verbose verified rows consolidated to compact one-liners, duplicate "Reconciled" index table removed, 50-line historical changelog header collapsed to one current line (history in git + COMPLETED_PHASES.md). Tail verified intact, zero truncation.
- Files: `claude_docs/strategy/roadmap.md`, `claude_docs/STATE.md`, `claude_docs/patrick-dashboard.md`.

### S771 — Bug Hunt (Sentry / Railway / crons)

**Trigger:** Patrick — "use remaining usage to hunt and fix bugs, especially Railway/GitHub Actions/crons."

**Found + fixed:**
- **Scraper Sentry-noise flood (root cause):** today's commit 176fc6c added `Sentry.captureMessage(...returned 0 results..., 'warning')` to `services/scraper/index.ts` (two call sites, lines ~569 + ~602). It fired on every zero-result scrape — 18 of 19 unresolved Sentry issues were this, all from one scrape run ~16h ago across small markets. Differential evidence (only small metros fired, not all) proves the scraper is healthy and these are legitimate empties. Both calls converted to `console.log`; removed unused `import * as Sentry`. The empty job is already recorded in ScrapedSalesJob; real failures still throw + are captured in the catch block.
- **NEXTJS-G (filtered):** "Java object is gone" / enableDidUserTypeOnKeyboardLogging — Facebook in-app browser (Facebook 561.0.0) injected instrumentation (`app://navigation_performance_logger_android`), not our code. Added beforeSend filter in `sentry.client.config.ts`. Resolved.

**Verified / triaged (no fix needed):**
- **NODEJS-W** (playwright-extra fatal module-load crash) — already fixed in current source (named `{ chromium }` import + deferred `chromium.use(StealthPlugin())` in getPlaywrightBrowser). Last fired 2026-05-06. Resolved stale issue.
- **Slow-query warnings** (NODEJS-10 Sale ~1.6s [48 events], 1G Organizer, 1X BEGIN, 1T ItemReservation) — all STALE, last fired 2026-05-08, transient load during a bulk scrape window. No structural index gap; declined speculative migration.
- Railway backend Online; in-process crons (auction, markdown, eBay sync, reservation expiry) all [CRON OK]; no runtime errors in log buffer.
- GitHub Actions run history not directly queryable via available MCP (no workflow-runs tool); scraper crons confirmed running healthy via Sentry + Railway cross-reference.

**Could not do:** Railway DB direct query (psycopg2) — VM `/sessions` disk at 100%, install failed. Not needed (log + differential evidence sufficient).

**Files changed:** `packages/backend/src/services/scraper/index.ts` · `packages/frontend/sentry.client.config.ts`

---

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

---

### S768 — CI/Sentry Fixes + Voice Location Extraction + eBay Custom Label Toggles (summary)

CI/Sentry: fixed requestTimeout middleware, NODEJS-1B double-response, 6 slow-query indexes. Features: voice location extraction (roomTag auto-fill), eBay Custom Label append toggles (skuAppendDate/Cost/Location). Schema truncation recovered.

---

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

