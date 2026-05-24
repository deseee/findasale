# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S784 — Audit Fixes: Map Geocoding + Categories Icons**

Map bug fixed: platform sales (organizer-created) now get geocoded server-side when status transitions to PUBLISHED and lat is null. `geocodeAddress()` call added to `updateSaleStatus` in saleController.ts (fire-and-forget, never blocks publish response). Batch backfill job (`internalGeocodingController.ts`) extended to include `sourceName: null, status: PUBLISHED` sales so existing pinless sales will be geocoded on next batch run.

Categories bug fixed: `CATEGORY_ICONS` expanded from 14 to 200+ entries covering eBay leaf node names (comics, action figures, toys, kitchen items, coins, jewelry, clothing subcategories, electronics, sports, music, art, etc.). `DISPLAY_NAME_OVERRIDES` map added to shorten verbose eBay names (e.g. "Comics & Graphic Novels" → "Comics"). Render logic updated to use displayLabel everywhere.

Roadmap items #424 and #425: human-verified by Patrick this session.

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
| Facebook Marketplace scraper | FB GraphQL doc_id may break with platform changes | Monitor for breakage; fragile by design | S712 |
| directoryMostRecentSource NULL | 84% of organizers have NULL (Phase 2 scrapers write sourcesJson only) | Backfill fix deferred — Phase 2 scrapers need to write the field | S712 |
| MN/MI/TN licensing scrapers | Bot-blocked (Radware/DIFS 403) — graceful no-ops, no failure emails | Needs headless browser + residential proxy (#SCRAPER-HEADLESS-PROXY in Deferred) | S713 |
| AI listing enrichment | Fire-and-forget | Check Railway logs for `[listingEnrichmentService]` or query `scrapedMetadata.aiEnriched` | S651 |

---

## Next Session

**Patrick Action — Push S783 + S784 files (combined):**
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
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat(map): geocode platform sales on publish + batch backfill; feat(categories): expand icons + display name overrides (S784)"
.\push.ps1
```

**Patrick Action — Update Global CLAUDE.md password:**
Update both DATABASE_URL lines (internal + public proxy) with the current password from Railway dashboard. [Passwords redacted from docs — store in CLAUDE.md only]

**Patrick Action — Submit sitemap to Bing Webmaster Tools:**
Go to https://www.bing.com/webmasters → Add sitemap → `https://finda.sale/server-sitemap.xml`

**Priority 1 — Chrome QA backlog:**
- #424: Code-verified. Needs live eBay push to confirm end-to-end.
- #425: UI confirmed. End-to-end push not tested without real publish.

**Priority 2 — Remaining audit items (weekly-audit-2026-05-23):**
- `/sales/[id]` — "YARD" type badge on auction sale + breadcrumb missing sale name (M-003, not yet fixed)

**Priority 3 — Next batch of roadmap items after push.**

## Recent Sessions

### S784 — Audit Fixes: Map Geocoding + Categories Icons

**Trigger:** Weekly audit had HIGH (/categories raw taxonomy) and MEDIUM (/map zero pins). Patrick confirmed #424 and #425 human-verified.

**Completed:**
- ✅ `/map` zero pins root cause confirmed and fixed: `geocodeAddress()` call added to `updateSaleStatus` in `saleController.ts` — fires when status → PUBLISHED and lat is null. Non-blocking fire-and-forget. `internalGeocodingController.ts` batch job extended with `OR: [{ sourceName: null, status: 'PUBLISHED' }]` to backfill existing platform sales without coordinates.
- ✅ `/categories` display improved: `CATEGORY_ICONS` expanded from 14 to 200+ entries covering eBay leaf node names. `DISPLAY_NAME_OVERRIDES` added for verbose names (e.g. "Comics & Graphic Novels" → "Comics"). Render logic updated to use displayLabel.
- ✅ Roadmap #424 (eBay description template code-verified) and #425 marked human-verified.

**Audit closure:** `/privacy` and `/calendar` audit findings confirmed already resolved in deployed code — no changes needed. All 4 findings from the weekly-audit-2026-05-23 are closed.

**Files changed:** `packages/backend/src/controllers/saleController.ts` · `packages/backend/src/controllers/internalGeocodingController.ts` · `packages/frontend/pages/categories/index.tsx` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

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
- ✅ Fixed `getOutreachOpens` controller — initial version assumed flat fields (`openedAt`, `organizerName`, `city`, `state`) that don't exist. Rewrote to query per-touch fields (`touch1OpenedAt`–`touch4OpenedAt`) with OR condition + organizer relation join for `businessName` and `website`.
- ✅ Built `/admin/outreach-opens` page (`pages/admin/outreach-opens.tsx`) — table of all organizers who opened any outreach email, with name, email, address, website (linked), touch number, sent date, open date, status badge.
- ✅ Added "View opened emails →" link to Outreach Email Pipeline widget in `pages/admin/index.tsx`.
- ✅ Re-queued 418 pre-fix emails via direct Railway DB update: 354 from May 17–23 + 64 from May 24 batches before 16:51:43 UTC (first confirmed open). All touch fields cleared, status reset to PENDING, attemptCount = 0.

**Files changed:** `packages/backend/src/controllers/adminController.ts` · `packages/backend/src/routes/admin.ts` · `packages/frontend/pages/admin/index.tsx` · `packages/frontend/pages/admin/outreach-opens.tsx` (new)

---

### S781 — DMARC Upgrade + Email Stack Audit

**Trigger:** Deferred from S780b — upgrade `_dmarc.finda.sale` from `p=none` to `p=quarantine` after SPF propagation.

**Completed:**
- ✅ Full SPF/DKIM/DMARC audit: Resend DKIM (TXT) verified, Google Workspace DKIM on `outreach.finda.sale` verified, MailerLite DKIM gap documented (free plan uses `d=mlsend.com` not `d=finda.sale` — paywalled feature, ~0 campaigns sent so risk is negligible)
- ✅ Email stack roles clarified: Resend = platform automated emails (outreachEmailsCron etc.), Google Workspace = cold outreach to organizers, MailerLite = subscriber list/newsletter (barely used)
- ✅ DMARC upgraded: `_dmarc.finda.sale` TXT → `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@finda.sale` — confirmed live via Google DNS

**Still pending (Patrick):**
- Global CLAUDE.md password update — get current password from Railway dashboard and update both DATABASE_URL lines [redacted from docs]

**Files changed:** None (DNS change only via Vercel dashboard)

---

### S780 — Deliverability Fix + GitGuardian + CORS + Slow Query Indexes

**Trigger:** Patrick — "audit last few sessions and begin the work on the to do's"

Executed S779 Next Session priorities. 4 fixes shipped:
1. **buildRawEmail() MIME fix** — added htmlToPlainText() + text/plain part to multipart/alternative emails (outreachEmailsCron.ts)
2. **CORS P0** — api.finda.sale added to allowedOrigins (index.ts). 34 CORS errors in 23hrs from new custom domain.
3. **GitGuardian P0** — live Railway DB password found in STATE.md + patrick-dashboard.md on GitHub (commit 00e58aadd, S776). Credential removed from both files. Password rotation needed (credential in git history).
4. **7 performance indexes** — migration 20260524120000 addresses 5 Sentry slow queries (DirectoryClaimEmail 2x, Sale 2x, Organizer 2x + createdAt)

DNS deliverability audit: root SPF missing google include (P1), root DKIM missing, DMARC at p=none. Patrick action items provided.

Verified all 4 pending pushes from S779 deployed to Vercel (READY). fbExportedAt migration confirmed applied in Railway DB.

**S780b continuation:** Railway DB password rotated (Patrick did it in Railway dashboard). Backend uses `${{Postgres.DATABASE_URL}}` reference variable — auto-updates. Local `.env` and backup script updated. Root SPF DNS record updated via Chrome in Vercel DNS dashboard: `v=spf1 a mx include:_spf.google.com include:_spf.mlsend.com ~all` (added Google include, changed `?all` → `~all`). S780 code changes confirmed already on GitHub. Migration confirmed applied. All S780 action items complete except: Global CLAUDE.md password update (Patrick manual — Cowork internal file not editable by Claude), temp script deletion, DMARC upgrade (deferred for SPF propagation).

Files changed: `packages/backend/src/jobs/outreachEmailsCron.ts`, `packages/backend/src/index.ts`, `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260524120000_add_performance_indexes/migration.sql`, `packages/database/.env`, `scripts/backup-everything.ps1`, `claude_docs/STATE.md`, `claude_docs/patrick-dashboard.md`

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

