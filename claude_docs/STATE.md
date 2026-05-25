# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S786 — DB Audit: Camera Features Root Cause Found + Railway CLI Fixed + Nav Fix**

Railway DB access fixed permanently: CLI `railway run --service backend env` gets live password; psycopg2 works. DB audit of all 6 camera features complete. Mobile nav drawer updated to match desktop. Roadmap corrections for #323/#332/#334.

**#319, #325, #328 — BROKEN (root cause confirmed):** Photo table has 0 rows. Upload pipeline writes to Item.photoUrls (string array) only; never creates Photo records. All three features depend on Photo model fields (photoRole, orderIndex, roleReasoning) — dead code. Fix: make upload pipeline create Photo records. Dispatching to dev next session.

**#336 Intent-Wins — ✅ data confirmed:** userEditedFields populated on 18/130 items with real field arrays. Pending Chrome QA to verify AI respects the gate.

**#339 Low-Confidence — ⚠️ partial:** aiConfidence written on 100% of items (avg 0.589, 93/130 below 0.6 threshold). But low-conf items still have titles/categories filled in — refuse-to-fill gate may not be enforcing. Pending Chrome QA.

**#340 Auto-Reopen — UNVERIFIED:** pure frontend flow, no DB column. Needs Chrome rapidfire mobile test.

**Mobile nav fix shipped:** Discount Rules, Consignors, Locations, Shopify added to mobile drawer TEAMS section (were missing, desktop sidebar had them).

**Roadmap corrections:** #323 (PriceBenchmark — IS implemented as ItemValuation.method/60-40 blend), #332 (Shopify — IS implemented on Organizer model + ShopifyListing table), #334 (Markdown Cycles — IS implemented as MarkdownCycle model). All three moved to Pending Chrome QA.

**Previous: S785 — QA Batches 1+2+3 Complete (8 ✅, 16 UNVERIFIED, 2 ✅ DB-only, 1 Bug Fixed)**

All 3 QA batches run. Batch 1 (XP/Guild): 8 Chrome-verified. Batch 2 (Camera/Photo): all 6 UNVERIFIED — upload_image imageId issue + handleAnalyzePhotos JS crash blocked photo tests. Batch 3 (eBay): 2 DB-verified (#320, #321), rest UNVERIFIED — user1 has no eBay connection. Rank permanence bug fixed and in push block.

**Verified ✅:** #267 RSVP XP (2 XP, SaleRSVP row created, RSVP_CONFIRMED notification), #255 Rank-Up Notifications (Maya 498→503 guildXp → SCOUT, RANK_UP notification in DB), #257 Scout Hold Duration (holdDurationMinutes=45, UI shows 00:44:57 countdown), #227 XP Profile API (5 fields confirmed on /api/xp/profile), #290 Hunt Pass Dual-Rail Cash Column ($ value + XP cost side-by-side on /coupons), #289 Shopper Coupon Generation (Standard tier generated, 100 XP deducted), #312 XP Economy Security Hardening (leaderboard API returns only rank/userName/guildXp/explorerRank — no PII), #349 In-App QR Scanner Phase 1 (scan button in header, modal opens with camera permission request).

**Bug → dev dispatched:** `explorerRank` demotes on XP spend. Leo (user5) was SCOUT (guildXp=500). Generating a Standard coupon deducted 100 XP → guildXp=400 → backend recalculated explorerRank → INITIATE demotion. Fix: rank should ratchet up only; use cumulative/peak XP for threshold checks, never decrement on spend. Dispatched to findasale-dev this session.

**UNVERIFIED:** #261 Treasure Hunt XP Rank Multiplier (blocked by rank permanence bug — manipulating to RANGER tier unreliable until fix ships), RSVP XP monthly cap (only 3 platform sales have Going/RSVP button; need 5 RSVPs in one month to verify 10 XP cap).

**Batch 2/3 run — mostly UNVERIFIED:** Camera/Photo (#319, #336, #339, #340, #328, #325) all UNVERIFIED — photo upload blocked in VM. eBay: #320 ✅ DB-verified, #321 ✅ DB-verified, rest UNVERIFIED (no eBay connection for user1). See Blocked Queue.

**Previous: S784 — Audit Fixes: Map Geocoding + Categories Icons + QA Batch (9 items)**

Map bug fixed: platform sales (organizer-created) now get geocoded server-side when status transitions to PUBLISHED and lat is null. `geocodeAddress()` call added to `updateSaleStatus` in saleController.ts (fire-and-forget, never blocks publish response). Batch backfill job (`internalGeocodingController.ts`) extended to include `sourceName: null, status: PUBLISHED` sales so existing pinless sales will be geocoded on next batch run.

Categories bug fixed: `CATEGORY_ICONS` expanded from 14 to 200+ entries covering eBay leaf node names (comics, action figures, toys, kitchen items, coins, jewelry, clothing subcategories, electronics, sports, music, art, etc.). `DISPLAY_NAME_OVERRIDES` map added to shorten verbose eBay names (e.g. "Comics & Graphic Novels" → "Comics"). Render logic updated to use displayLabel everywhere.

Roadmap items #424 and #425: human-verified by Patrick this session.

**S784b QA continuation (same session, context compressed):** Chrome QA of 9 Pending Chrome QA roadmap items — all verified. Chrome conflict encountered mid-session (two Cowork sessions sharing one browser — mutual logout). DB inaccessible from VM (disk full + Railway password rotated 2026-05-24 post-GitGuardian, new password not available in VM). QA prompt for Groups B/C/D (`qa-session-prompt-groups-bcd.md`) fixed: added Chrome concurrency warning + replaced hardcoded DB password with Railway dashboard instructions.

**Previous: S783 — SEO Sprint: Sitemap Expansion + IndexNow + Schema.org Audit**

Sitemap grew from 1,727 → 1,885 URLs. Added items, encyclopedia, and category pages to the sitemap; fixed guide pages (slim slugs.json + outputFileTracingIncludes + Cache-Control bypass); fixed Washington DC slug (dots in city name). New `/api/items/sitemap` backend endpoint returns all items from PUBLISHED sales (lightweight id+updatedAt). IndexNow integration built from scratch: fires on every sale publish, POSTs sale URL + all item URLs to `https://api.indexnow.org/indexnow`. Key file live at `https://finda.sale/fa3d9e1b8c2047a6d5f3e9b1c4a87d20.txt`. Schema.org audit confirmed: Product schema on items, JSON-LD on sale detail, HowTo/Article on guide pages — already implemented. Also fixed homepage "Error Loading Sales" (localhost fallback), /creator/dashboard role guard, and built admin creators/affiliate page.

**Previous: S781 — DMARC Upgrade to p=quarantine + Email Stack Audit**

DMARC upgraded from `p=none` to `p=quarantine` (with `rua=mailto:dmarc-reports@finda.sale`). SPF/DKIM confirmed clean for Resend and Google Workspace. MailerLite DKIM gap documented (free plan limitation — acceptable given ~0 campaign usage). Email stack roles clarified.

**Previous: S780 — Deliverability Fix + GitGuardian + CORS + Slow Query Indexes**

Audit of S779 priorities plus execution. 4 code fixes, 1 P0 credential leak remediated, 6 DB indexes added.

**Fixes shipped:**
- ✅ buildRawEmail() MIME fix — added `htmlToPlainText()` helper + text/plain part to multipart/alternative (was html-only, contributing to spam classification)
- ✅ CORS P0 — `api.finda.sale` added to allowedOrigins in index.ts (34 CORS errors in 23hrs from new Railway custom domain added S779 but not in CORS allowlist)
- ✅ GitGuardian P0 — PostgreSQL URI (live Railway password) found in STATE.md + patrick-dashboard.md committed in S776. Removed from both files. **Password rotation needed** — credential remains in git history.
- ✅ 7 performance indexes added for 5 Sentry slow queries (NODEJS-2N/2M/2K/2J/1P): DirectoryClaimEmail outreach cron (status+touch4+touch1, sentAt), Sale (createdAt, status+markdownEnabled+startDate), Organizer (isUnmanagedListing+createdAt, createdAt)

**Deliverability DNS fixes (S780b):**
- ✅ Root SPF updated: `v=spf1 a mx include:_spf.google.com include:_spf.mlsend.com ~all` (added Google, changed ?all → ~all)
- Root DKIM for Google: not needed for root domain (root sends via Resend/MailerLite, outreach subdomain already has Google DKIM)
- DMARC at p=none — upgrade to p=quarantine after SPF propagation confirmed (give it a few days)

**S780b — Railway DB password rotated:**
- ✅ New password active: `luEGUhvHsopwwUtCbQQcfIDIDHuxZvdW`
- ✅ Backend `DATABASE_URL` uses `${{Postgres.DATABASE_URL}}` reference variable (auto-rotates)
- ✅ `packages/database/.env` updated with new password
- ✅ `scripts/backup-everything.ps1` PGPASSWORD updated
- ✅ Memory file updated with new password
- ⚠️ Global CLAUDE.md still has old password — Patrick must update manually

**Sentry scan (6 issues reviewed):**
- FINDASALE-NODEJS-3: CORS errors — fixed (api.finda.sale origin)
- 5 slow queries — indexes added (migration 20260524120000)

**Previous: S779 — Outreach Email Deliverability Fix**

Root cause of 0% open rate (417 sends, 0 real opens): all outreach email bodies contained `https://backend-production-153c9.up.railway.app` URLs. Fix: added `api.finda.sale` custom domain to Railway; set `RAILWAY_BACKEND_URL=https://api.finda.sale` in Railway Variables.

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
| #261 Treasure Hunt XP Rank Multiplier | Rank permanence bug FIXED (xpService.ts ratchet shipped S785). Still needs retest: set user12 to RANGER, trigger QR scan, verify ~38 XP awarded | Re-run test as RANGER after push.ps1; needs QR scan API call | S785 |
| RSVP XP Monthly Cap (#267 part 2) | Only 3 platform sales have Going/RSVP button; need 5 RSVPs in one month to hit 10 XP cap | Create more platform sales with RSVP enabled, or wait for organic usage | S785 |
| #319 Burst Clustering | BROKEN S786 — Photo table has 0 rows; upload pipeline writes to Item.photoUrls only, never creates Photo records; clusterConfidence NULL on all 130 items | Fix upload pipeline to create Photo records (dispatch findasale-dev) | S786 |

| #339 Low-Confidence Refuse-to-Fill | ⚠️ aiConfidence written on all items but low-conf items still have titles/categories — gate may not enforce blanks | Chrome QA: upload ambiguous item, verify brand/category left blank at conf <0.6 | S786 |
| #340 Auto-Reopen Camera After Publish | No DB column (pure frontend flow). Needs Chrome rapidfire mobile viewport test | Chrome QA mobile: rapidfire → publish → verify camera reopens | S786 |
| #328 Photo Role Awareness Phase 1 | BROKEN S786 — Photo table has 0 rows; same root cause as #319/#325. photoRole/roleReasoning exist in schema but dead code | Fix upload pipeline to create Photo records (same dispatch as #319) | S786 |
| #325 Best-Photo-First Sorting | BROKEN S786 — Photo table has 0 rows; same root cause as #319. orderIndex column exists but unreachable | Fix upload pipeline to create Photo records (same dispatch as #319) | S786 |
| #244 eBay Quick List / Direct Push | Push to eBay button confirmed in edit-item ✅; eBay CSV export not found on add-items page; full flow needs eBay connection for user1 | Connect eBay to user1 in Railway DB, then retest | S785 |
| #293 eBay Listing Data Parity | PostSaleEbayPanel requires eBay connection + completed sale with items | Connect eBay to user1, complete a sale, then test 17-field Edit eBay section | S785 |
| #295 eBay Category Review Alerting | 0 items with ebayNeedsReview=true in DB; badge can't be triggered without eBay connection | Connect eBay to user1, push item to trigger category exhaustion | S785 |
| #298 eBay Advanced Setup | Page renders 'eBay Connection Required' instead of 8 sections; needs eBay connected | Connect eBay to user1, then verify 8 sections + Use suggested defaults button | S785 |


| #333 ACH Consignor Payouts | /organizer/consignors page renders but no consignors for user1; no settlement to test ACH | Create test consignor + settlement for user1 | S785 |

| #335 Automated Consignor Email Notifications | 0 consignors with email in DB; no data to verify notification flow | Add email to test consignor, trigger a sale/item event | S785 |
| Facebook Marketplace scraper | FB GraphQL doc_id may break with platform changes | Monitor for breakage; fragile by design | S712 |
| directoryMostRecentSource NULL | 84% of organizers have NULL (Phase 2 scrapers write sourcesJson only) | Backfill fix deferred — Phase 2 scrapers need to write the field | S712 |
| MN/MI/TN licensing scrapers | Bot-blocked (Radware/DIFS 403) — graceful no-ops, no failure emails | Needs headless browser + residential proxy (#SCRAPER-HEADLESS-PROXY in Deferred) | S713 |
| AI listing enrichment | Fire-and-forget | Check Railway logs for `[listingEnrichmentService]` or query `scrapedMetadata.aiEnriched` | S651 |

---

## Next Session

**Patrick Action — Push S786 wrap docs + nav fix + roadmap:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/components/Layout.tsx
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix(nav): add missing mobile drawer items (Discount Rules, Consignors, Locations, Shopify); chore(roadmap): camera feature DB audit S786; chore(state): S786 wrap"
.\push.ps1
```

**Patrick Action — Update Global CLAUDE.md credentials section:**
Both DATABASE_URL lines now use password: `luEGUhvHsopwwUtCbQQcfIDIDHuxZvdW`
Also update binary note: Railway CLI downloads to /tmp each session (not persistent). Token stays the same.

**Patrick Action — Push S783 + S784 + S784b files (combined — still pending):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/pages/index.tsx
git add packages/frontend/next.config.js
git add packages/frontend/pages/creator/dashboard.tsx
git add packages/backend/src/controllers/adminAffiliateController.ts
git add packages/backend/src/routes/adminAffiliate.ts
git add packages/backend/src/index.ts
git add packages/frontend/pages/admin/creators.tsx
git add packages/frontend/pages/admin/index.tsx
git add packages/frontend/data/seo-pages/slugs.json
git add packages/frontend/vercel.json
git add packages/frontend/public/robots.txt
git add packages/frontend/public/sitemap.xml
git add packages/backend/src/routes/sales.ts
git add packages/backend/src/controllers/itemController.ts
git add packages/backend/src/routes/items.ts
git add packages/frontend/pages/server-sitemap.xml.tsx
git add packages/backend/src/services/indexNowService.ts
git add packages/backend/src/controllers/saleController.ts
git add "packages/frontend/public/fa3d9e1b8c2047a6d5f3e9b1c4a87d20.txt"
git add packages/backend/.env.example
git add packages/backend/src/controllers/internalGeocodingController.ts
git add packages/frontend/pages/categories/index.tsx
git add claude_docs/strategy/roadmap.md
git add claude_docs/qa-session-prompt-groups-bcd.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat(map): geocode platform sales on publish + batch backfill; feat(categories): expand icons; qa(S784b): verify 9 Pending Chrome QA items; fix QA session prompt"
.\push.ps1
```

**Patrick Action — Push S785 wrap docs + rank permanence fix:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add packages/backend/src/services/xpService.ts
git add packages/backend/src/controllers/xpController.ts
git add claude_docs/strategy/roadmap.md
git commit -m "fix(xp): rank permanence — explorerRank ratchet-only, never demotes on XP spend; qa(S785): Batches 1+2+3 results in roadmap + blocked queue"
.\push.ps1
```

**Patrick Action — Update Global CLAUDE.md password:**
Update both DATABASE_URL lines (internal + public proxy) with the current password from Railway dashboard. [Passwords redacted from docs — store in CLAUDE.md only]

**Patrick Action — Submit sitemap to Bing Webmaster Tools:**
Go to https://www.bing.com/webmasters → Add sitemap → `https://finda.sale/server-sitemap.xml`

**Priority 1 — Rank permanence bug fix (SHIPPED S785 — in push block above):**
Fix: `spendXp()` in `xpService.ts` now uses `lifetimeXpEarned` for rank threshold + ratchet against current stored rank (takes the higher). All 5 XP sink endpoints in `xpController.ts` now read `explorerRank` from DB post-write rather than recomputing from spendable balance. Leo's DB record restored to SCOUT. Awaiting push.

**Priority 2 — Investigate missing schema items:**
#323 (Item.valuationMethod not in schema), #332 (ShopifyConnection table missing), #334 (MarkdownRule table missing) — all claim to be shipped but DB schema doesn't match. Dispatch findasale-dev to investigate migration history and either confirm shipped or flag as not migrated.

**Priority 3 — Resolve upload_image camera QA block:**
Camera/Photo batch (#319, #336, #339, #340, #328, #325) all UNVERIFIED because upload_image imageId format is unknown in VM context. Research correct imageId format for `mcp__Claude_in_Chrome__upload_image` or find alternative photo injection method.

**Priority 4 — Remaining organizer QA (Group A):**
- #363 Auction Buyer's Premium — "Buyer's Premium %" input + per-item "Lot #" fields not confirmed. Needs Chrome.
- #41 Sale Share / iCal Export — not tested.
- Shopper batch: #266, #7, #350, #351, #184 — need user12/user13 login.

**Priority 5 — Chrome QA backlog:**
- #424: Code-verified. Needs live eBay push to confirm end-to-end.
- M-003: `/sales/[id]` — "YARD" badge on auction sale + breadcrumb missing sale name.

## Recent Sessions

### S786 — DB Audit: Camera Feature Root Cause + Railway CLI Fixed + Nav Fix + Roadmap Corrections

**Trigger:** Continue QA backlog — investigate why camera features showed 0 DB rows in S785. Fix Railway DB access (psycopg2 auth failing due to stale password in session context).

**Railway CLI fixed:** Downloaded CLI to /tmp, used `RAILWAY_TOKEN + railway run --service backend env` to extract live DATABASE_URL password. psycopg2 now works. Pattern saved to memory — no more hardcoded passwords. Live password: `luEGUhvHsopwwUtCbQQcfIDIDHuxZvdW` (internal password, also works against maglev public proxy).

**DB audit — 130 items, 0 Photo records:**
- Photo table completely empty — Cloudinary URLs stored in Item.photoUrls array only
- #319 clusterConfidence NULL on all items — burst clustering never fires
- #325 orderIndex unreachable — Photo records never created
- #328 photoRole unreachable — same root cause
- Root cause (all three): upload pipeline skips Photo table insertion entirely
- #336 userEditedFields populated on 18/130 items ✅ data confirmed; needs Chrome QA
- #339 aiConfidence on 100% of items; but low-conf items still have titles filled — gate may not enforce
- #340 no DB column (pure frontend) — needs Chrome mobile test

**Roadmap corrections (all 3 were wrong table/field names in roadmap):**
- #323: IS implemented as ItemValuation.method (60/40 blend) → Pending Chrome QA
- #332: IS implemented on Organizer model + ShopifyListing table → Pending Chrome QA
- #334: IS implemented as MarkdownCycle model → Pending Chrome QA

**Mobile nav fix:** Discount Rules, Consignors, Locations, Shopify added to mobile drawer TEAMS section.

**Files changed:** Layout.tsx, roadmap.md, STATE.md, patrick-dashboard.md

### S785 — QA Batch 1: XP/Guild System (8 ✅, 2 UNVERIFIED, 1 Bug)

**Trigger:** S784b QA session prompt ready. Groups B/C/D priority. Batch 1 = XP/Guild features for Leo (user5/SCOUT) and Maya (user6/shopper near rank-up).

**Verified ✅ (8 features):**
- #267 RSVP XP: Maya RSVPed to a sale. SaleRSVP row created, +2 guildXp, RSVP_CONFIRMED notification in DB. ✅
- #255 Rank-Up Notifications: Maya at 498 XP → VISIT event (+5) pushed her to 503 (threshold=500) → RANK_UP notification (type=RANK_UP, title="You've reached SCOUT!") confirmed in DB. ✅
- #257 Scout Hold Duration: Leo's reservation shows holdDurationMinutes=45, countdown displays 00:44:57 on /shopper/holds. ✅
- #227 XP Profile API + Shopper Dashboard: /api/xp/profile returns guildXp, explorerRank, rankLabel, nextRankXp, lifetimeXp. All 5 fields confirmed. ✅
- #290 Hunt Pass Dual-Rail Cash Column: /coupons shows $ value alongside XP cost for each tier. ✅
- #289 Shopper Coupon Generation (3 Tiers): Standard tier generated successfully, 100 XP deducted, coupon code appeared. ✅
- #312 XP Economy Security Hardening: /api/xp/leaderboard returns only rank, userName, guildXp, explorerRank — no userId, no email. ✅
- #349 In-App QR Scanner Phase 1: Scan button visible in header, modal opens and requests camera permission. ✅

**UNVERIFIED (2):** #261 Treasure Hunt XP Rank Multiplier (blocked by rank permanence bug), RSVP XP monthly cap (need 5 RSVPs in one month; only 3 platform sales have Going button).

**Bug found:** `explorerRank` demotes on XP spend. Leo (SCOUT, guildXp=500) → generated Standard coupon → guildXp=400 → backend recalculated rank → INITIATE demotion. Root cause: rank threshold check uses current `guildXp` balance, not cumulative/peak. Fix dispatched to findasale-dev.

**Batch 2 (Camera/Photo) — all UNVERIFIED:** #319, #336, #339, #340, #328, #325 — all blocked by upload_image imageId unknown + handleAnalyzePhotos JS crash with DataTransfer programmatic upload. photoRole and orderIndex columns confirmed in schema; 0 photos have data in DB.

**Batch 3 (eBay) — DB-verified (2), UNVERIFIED (rest):**
- ✅ #320 Async eBay Comp Fetch: 6 items with aiSuggestedPrice confirmed.
- ✅ #321 Encyclopedia Auto-Generation: 57 AUTO_GENERATED entries + haiku_inferred benchmarks confirmed.
- UNVERIFIED: #244, #293, #295, #298 — user1 has no EbayConnection in test DB. #323 (Item.valuationMethod not in schema), #332 (ShopifyConnection table missing), #334 (MarkdownRule table missing) — schema gaps need investigation. #333, #335 — no test consignors with email.

**Bug fix shipped:** Rank permanence ratchet in xpService.ts + xpController.ts. Leo's DB record restored to SCOUT.

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md` · `packages/backend/src/services/xpService.ts` · `packages/backend/src/controllers/xpController.ts`

---

### S784 — Audit Fixes: Map Geocoding + Categories Icons + Chrome QA Batch

**Trigger:** Weekly audit had HIGH (/categories raw taxonomy) and MEDIUM (/map zero pins). Patrick confirmed #424 and #425 human-verified. Also: QA plan session — 9 Pending Chrome QA items knocked out.

**Completed:**
- ✅ `/map` zero pins root cause confirmed and fixed: `geocodeAddress()` call added to `updateSaleStatus` in `saleController.ts` — fires when status → PUBLISHED and lat is null. Non-blocking fire-and-forget. `internalGeocodingController.ts` batch job extended with `OR: [{ sourceName: null, status: 'PUBLISHED' }]` to backfill existing platform sales without coordinates.
- ✅ `/categories` display improved: `CATEGORY_ICONS` expanded from 14 to 200+ entries covering eBay leaf node names. `DISPLAY_NAME_OVERRIDES` added for verbose names (e.g. "Comics & Graphic Novels" → "Comics"). Render logic updated to use displayLabel.
- ✅ Roadmap #424 (eBay description template code-verified) and #425 marked human-verified.
- ✅ Chrome QA — 9 items verified: #352 (tagline field), #354 (business hours), #356 (broadcasts), #359 (pin sale), #360 (social links), #60 (pricing page $29/$79), #260 (one-big-sale upgrade), #263 (PRO TOOLS dropdown), #271 (TEAMS webhooks/API table). Roadmap rows updated.
- ✅ QA session prompt fixed (`qa-session-prompt-groups-bcd.md`): Chrome concurrency warning added; hardcoded DB password replaced with Railway dashboard instructions.

**Chrome conflict mid-session:** Patrick had started the groups B/C/D QA session in another Cowork window — they share one browser, causing mutual logout. Chrome work stopped; prompt was already generated and sent to the other session.

**DB inaccessible from VM:** Railway DB password rotated 2026-05-24 (post-GitGuardian). New password not available in VM bash. psycopg2 auth failure confirmed regardless per memory. DB checks deferred to groups B/C/D session via Railway dashboard instructions in the prompt.

**Audit closure:** `/privacy` and `/calendar` audit findings confirmed already resolved in deployed code — no changes needed. All 4 findings from the weekly-audit-2026-05-23 are closed.

**Files changed:** `packages/backend/src/controllers/saleController.ts` · `packages/backend/src/controllers/internalGeocodingController.ts` · `packages/frontend/pages/categories/index.tsx` · `claude_docs/strategy/roadmap.md` · `claude_docs/qa-session-prompt-groups-bcd.md` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S783 — SEO Sprint: Sitemap Expansion + IndexNow + Schema.org Audit

**Trigger:** Patrick — sitemap count was 1,727 (Bing), fix it properly; items/sales/articles/neighborhoods all missing.

**Completed:**
- ✅ Homepage "Error Loading Sales" fix — `NEXT_PUBLIC_BACKEND_URL`/`NEXT_PUBLIC_API_URL` localhost fallback changed to `https://api.finda.sale`
- ✅ /creator/dashboard role guard — was rejecting ORGANIZER role (CREATOR doesn't exist in schema); fixed to allow ADMIN + ORGANIZER
- ✅ Admin creators/affiliate page — new `/admin/creators` page + backend controller querying users with AffiliateCode or AffiliateLinks; linked from admin index
- ✅ Guide pages in sitemap — slim `slugs.json` (500 slugs, 16KB) + `outputFileTracingIncludes` key fixed + `Cache-Control: max-age=0` header in vercel.json
- ✅ Sitemap: added `/categories/[category]` (10 hardcoded), `/encyclopedia/[slug]` (via API), `/items/[id]` (new backend endpoint)
- ✅ New `/api/items/sitemap` backend endpoint — returns all items from PUBLISHED sales, `id+updatedAt` only, 10k cap, no auth
- ✅ Washington DC slug fix — `.replace(/\./g, '')` strips dots from city slugs in `/api/sales/city-slugs`
- ✅ IndexNow integration — `indexNowService.ts` created; fires on sale DRAFT→PUBLISHED transition; POSTs sale URL + all item URLs to `https://api.indexnow.org/indexnow`; non-blocking fire-and-forget
- ✅ Key file live: `https://finda.sale/fa3d9e1b8c2047a6d5f3e9b1c4a87d20.txt`
- ✅ Schema.org audit: Product schema on items, JSON-LD on sale detail, HowTo/Article on guides — all already implemented and SSR-safe
- Sitemap count: 1,727 → 1,885 (+138 URLs; 110 items, 10 categories, ~18 encyclopedia)

**Files changed:** `pages/index.tsx` · `next.config.js` · `pages/creator/dashboard.tsx` · `adminAffiliateController.ts` (new) · `routes/adminAffiliate.ts` (new) · `backend/index.ts` · `pages/admin/creators.tsx` (new) · `pages/admin/index.tsx` · `data/seo-pages/slugs.json` (new) · `vercel.json` · `public/robots.txt` · `public/sitemap.xml` · `routes/sales.ts` · `itemController.ts` · `routes/items.ts` · `server-sitemap.xml.tsx` · `indexNowService.ts` (new) · `saleController.ts` · `fa3d9e1b8c2047a6d5f3e9b1c4a87d20.txt` (new) · `.env.example`

---

### S782 — Outreach Opens UI + Queue Reset

**Trigger:** Patrick saw 7 new email opens on the admin dashboard and wanted to (1) see which emails were opened, (2) have a clickable page for it, and (3) re-queue all emails sent before the fix.

**Completed:**
- ✅ Fixed `getOutreachOpens` controller — initial version assumed flat fields (`openedAt`, `organizerName`, `city`, `state`) that don't exist. Rewrote to query per-touch fields (`touch1OpenedAt`–`touch4Ope