# FindA.Sale — Monthly Digest: April 2026
**Generated:** 2026-05-02 (automated — findasale-records scheduled task)
**Sessions covered:** S572–S622 (approximately April 25–May 2, 2026 visible in log; see note below)

> **Note on coverage:** STATE.md "## Recent Sessions" contains sessions S572–S622, all dated April 25–May 2, 2026. Earlier April sessions (pre-S572) have been rotated out of the log. The digest below covers what is visible in the record. Earlier April work (Storefront v2 groundwork, gamification QA, eBay sync work) is partially captured via Current Status entries.

---

## What Shipped This Month

### 🕷️ Scraper Platform (Major Theme — ~15 sessions)

The dominant work area this month. FindA.Sale went from zero external data to a nationally running multi-source scraper pipeline ingesting thousands of listings daily.

**Backend**
- EstateSalesNet scraper: full Puppeteer → direct JSON API rewrite. Bypasses WAF by hitting `/api/sale-details` endpoint (unprotected from datacenter IPs). 5,499 unique sales ingested on first clean run. 40-center national grid covering continental US + AK/HI.
- GarageSaleFinder scraper: Cheerio + plain fetch, live.
- Craigslist scraper: multiple iterations; surgical fix with live-probed selectors, real date parsing, no synthetic ZIPs. Cron at 00:30 UTC.
- Eventbrite scraper: new `sources/eventbrite.ts` + GitHub Actions workflow. Free public API, 5 query terms, national grid, page-3 cap. Cron at 01:00 UTC.
- Newspaper/Oodle RSS scraper: 62 feeds (Oodle classifieds × 27 metros + Google News), keyword filter, address extraction. Cron at 02:00 UTC. (Note: Google News disabled post-S621 — produced junk records.)
- Cron stagger: ESN 00:00 → CL 00:30 → Eventbrite 01:00 → RSS 02:00 UTC.
- Scraper anti-detection: rotating user agents, jitter delays, puppeteer-extra-plugin-stealth.
- Unclaimed listing filter: scraped sales now hidden from all public feeds until claimed (`OR: [{ isUnmanagedListing: false }, { isClaimed: true }]`).
- Admin scraper page (`/admin/scraper`): 5 bugs fixed, dark mode, Railway cache-bust.
- `ScrapedSalesJob` model + `scraper_phase1` migration deployed.

**Enrichment Pipeline**
- `enrichment.ts`: Google Places full-detail enrichment (phone, website, hours, photos, address). Fire-and-forget after organizer creation.
- Phase 2: `contactEmail` scraping (scrapes `/contact`, `/contact-us`, `/about`, homepage for mailto + bare email patterns; falls back to sale description parsing). `esnCompanyPageUrl` stored from ESN API.
- New schema fields: `esnOrgId`, `linkedInUrl`, `esnMemberships`, `esnPackageType`, `contactEmail`, `esnCompanyPageUrl`.
- Migrations deployed: `20260502000001_add_esn_enrichment_fields`, `20260502000002_add_contact_email_esn_url`.
- Per-organizer attribution fix: `ingestScrapedListing` now routes `organizerName` first (was using `organizerId` fallback incorrectly). All ESN listings now land on per-company organizer records.
- Data cleanup: 5,833 sales attributed to system organizer (`system-scraper@finda.sale`) deleted.
- Enrichment backfill `?all=true` mode added to controller + `enrich-backfill.yml` GitHub Actions workflow.

**Canada Expansion Research (S621)**
- CONDITIONAL GO verdict from both standalone agent and full advisory board.
- Quebec Bill 96 = Phase 1 blocker (full French translation required; block QC at signup).
- 17 Canadian cities added to Facebook Events search metros (30→92 total).
- 9 Canadian coordinate centers added to national grid (40→51).
- Roadmap items #366–#371 added (Canada Scraper, Platform Core, Legal Compliance, Bill 96 flag, Admin Analytics, Phase 1 Soft Launch).

**City Dataset**
- `generate-us-cities.ts` rewritten (two-source: plotly/datasets + kelvins). 2,723 population-sorted US cities output.
- `us-cities-3000.json` regenerated.

---

### 🏪 Storefront v2 (9 features, ~5 sessions)

**Features shipped (S600–S611):**
- **#352 Organizer Tagline** — italic display in header banner
- **#353 Year Founded** — "Est. YYYY" in About section
- **#354 Business Hours** — 7-day time grid, timezone, byAppointment toggle. Day-of-week sort bug fixed inline (S610).
- **#355 Organizer Type Multi-Select** — 8-type checkbox grid, pill badges on storefront
- **#356 Broadcast to Followers** — "Latest Update" card on storefront (latest broadcast, relative time). Backend + frontend shipped S611; Chrome QA pending.
- **#359 Sale Featured/Pinned** — `isPinned` flag, amber "Featured" badge. PATCH /pin endpoint working.
- **#361 Claim-This-Listing** — `ClaimRequest` model, `verificationToken` magic link email flow (72h expiry), admin approve/reject endpoints, `pages/claim/verify/[token].tsx` (5 states). Positive path test: seed data (Sunrise Consignment, user12) added S611.
- **#362 Sale Attendance Count** — "👥 N attended" renders under sale title
- **#363 Auction Buyer's Premium** — amber "Buyer's Premium: n%" badge on AUCTION cards. Backend shipped S611; Chrome QA pending.
- **Social links:** Twitter/X, TikTok, YouTube, Pinterest added to organizer profile (S600)
- **Backend root-cause fix (S609):** `GET /organizers/:id` expanded from 12 → 34 fields. Was causing all S601 features to show blank on production.

**Chrome QA verified (S610):** #354 ✅, #355 ✅, #359 ✅, #361 ✅ (hidden path), #362 ✅, tagline ✅, yearFounded ✅, social links ✅.

---

### 🔗 eBay Sync (2 sessions)

- **Root cause found (S590):** `api.ebay.com` resolves via Akamai CNAME chain that requires EDNS Client Subnet in DNS queries. Serverless resolvers (Vercel, Railway) don't send ECS → `ENOTFOUND`. Not a code bug or IP block.
- **Fix:** Vercel proxy at `pages/api/proxy/ebay.ts` — resolves via Google DoH with ECS, caches IPs 60s, calls Akamai via `node:https.request` with explicit Host + SNI.
- All 35+ direct `api.ebay.com` calls in backend migrated to proxy.
- eBay image proxy added (`imageProxyController.ts`) — rewrites `i.ebayimg.com` CDN URLs through Railway to fix incognito/tracking-protection blocking.
- Sold-sync filter changed from `creationdate` to `lastmodifieddate` (catches late-paying orders).
- One stuck sale fixed manually via psycopg2 (Nintendo Power book, `ebayListingId` was NULL).

---

### 🔧 Bug Fixes

**Frontend**
- **P0 SSR root cause (S605):** `@vercel/analytics` and `@vercel/speed-insights` imported statically in `_app.tsx` — their ESM build's `useEffect` import fails in Node CJS context → every unauthenticated SSR page returned 500. Fixed with `next/dynamic(..., { ssr: false })`. Had been live since at least S572, masked by auth cache.
- **Deleted-sale loop (S615/S616):** `setInterval(() => queryClient.invalidateQueries(...), 5000)` in `pages/sales/[id].tsx` bypassed all `useQuery` guards. Fixed by reading `queryClient.getQueryState()` inside interval and skipping on error state.
- **Hydration #418 (S564/S566 — partial):** Duplicate `mounted` declaration removed from `[id].tsx`; remaining instances across QR button, bounty tabs, POS dropdown, hamburger, notification bell still need systematic fix.
- **Condition rating sync (S597):** 5 disagreeing sources reconciled. "Like New" canonical for S grade. As-Is treated as flag, not 6th tier. FAQ rewritten to link to guild-primer (prevents future drift).
- **Watermark feature + TEAMS-gating (S599):** Schema field, migration, helper, controller, settings UI. 5 surfaces gated. PDF watermarks selective. OG image tier-aware.
- **Items/{id} OG image 500 (S600):** `ogImage.ts` was using `data:image/svg+xml` as Cloudinary base path. Fixed with `b_rgb:fef3c7` Cloudinary background parameter.

**Backend**
- **Ripple guard (S615):** `rippleController.ts` checks sale existence before `recordRipple()` — eliminates P2003 FK flood on deleted-sale pages.
- **#310 Color-tag Discount Rules 3× P0 bugs (S585):** `userId` vs `organizerId` mismatch, `workspace.subscriptionTier` vs `Organizer.tier`, `optionalAuthenticate` missing organizer join. All fixed and Chrome QA verified.
- **#311 Locations — "Workspace not found" (S561/S563):** OrganizerWorkspace created by onboarding modal. CRUD verified.
- **Brand-kit PDF auth (S581):** Browsers don't send Authorization headers on direct `<a href>` clicks. Fixed with `?token=` query param.
- **track-visit points route (S581):** `pointsController.ts` + `routes/points.ts` — 5 XP per sale visit.

---

### 📊 Strategy / Research (no code)

- **S602:** eBay-as-channel strategy memo, RVM scripts for established operators (5 V1 + 5 V2 compliant versions), TCPA/A2P 10DLC compliance research, phase1-channel-bridge ADR (296 eng hours, 8-week ship).
- **S603:** Viral mechanics planning + cold-start mechanics. GTM stress test. Final plan: Waitlist Position-Jumping (K=3–4), Loot Drop Cascade, TikTok creator sponsorship (capped). PR Wire Blast selected as primary launch vehicle (PRNewswire eSpeed, May 5 9:00 AM EST).
- **S606:** PR Wire launch checklist + 4-week distribution plan written.
- **S596:** 28 Gmail outreach drafts created for all advisory contacts with confirmed emails.

---

### 🗺️ Roadmap Additions

New items added this month: #354–#371 (Storefront v2 gap + Canada expansion)

---

## 🔴 Stale In-Flight Work

No sessions are currently "in-flight" (all recent sessions are COMPLETE). However, the following Blocked/Unverified Queue items warrant Patrick's attention:

| Item | Status | Blocker | Age |
|------|--------|---------|-----|
| `/items/{id}` returns 500 (P1) | ❌ NOT FIXED | Vercel SSR error — `data:image` SyntaxError in ogImage.ts. Root cause: `INTERNAL_API_URL` / `ogData:null`. Full Vercel stack trace needed to confirm. | Added S599 (Apr 30) |
| Sales pages SSR OG meta (P2) | Diagnosed, not deployed | `INTERNAL_API_URL` env var likely missing in Vercel. Add it pointing to Railway URL. No code change needed. | Added S599 (Apr 30) |
| Hunt Pass status inconsistency (P2) | Bug confirmed | XP Store shows "Hunt Pass Inactive" for Karen while AvatarDropdown shows "Hunt Pass Active". Fix needed before beta. | Added S582 (Apr 26) |
| Hydration #418 (P1 partial) | Partial fix only | QR button, bounty tabs, POS dropdown, hamburger, notification bell still affected. Systematic fix needed. | Added S564 (Apr 25) |
| 24-file window.confirm() (P2 systemic) | UNVERIFIED | No deletable data available in test account to smoke test ConfirmDialog. | Added S563 (Apr 26) |
| Treasure hunt progress page + via=qr guard | Shipped S595, pending push+QA | Code not pushed — waiting for push block execution. | Added S595 (Apr 27) |
| Affiliate ?aff= signup attribution | UNVERIFIED | Frontend signup flow with affiliate param not Chrome-tested. | Added S550 |
| #278 Treasure Hunt Pro XP bonus | UNVERIFIED | Requires Hunt Pass account + active QR scan (physical constraint). | Added S530 |
| #268 Trail Completion XP | UNVERIFIED | Need trail with all stops completed (physical constraint). | Added S530 |
| #281 Streak Milestone XP | UNVERIFIED | Cannot simulate multi-day streak in automation (physical constraint). | Added S530 |
| #356 Broadcast storefront card | Pending Chrome QA | Shipped S611, verify latest broadcast renders on organizer storefront. | Added S601 (Apr 30) |
| #363 Buyer's Premium badge | Pending Chrome QA | Shipped S611, verify amber badge on AUCTION sale cards. | Added S601 (Apr 30) |

**Physical-constraint items (S530 group):** These legitimately require real-world QR scans or multi-day usage. Not neglected — queue for beta cohort.

---

## 📋 Draft Changelog (April 2026)

### Backend
- **Scraper platform Phase 1–2:** EstateSalesNet direct JSON API, GarageSaleFinder, Craigslist, Eventbrite, Newspaper RSS — national multi-source ingestion pipeline live
- **Scraper enrichment Phase 1–2:** Google Places full details, contactEmail scraping from organizer websites, esnCompanyPageUrl storage
- **Per-organizer scraper attribution:** `getOrCreateScrapedOrganizer()` — listings land on per-company records, not system organizer
- **Canada expansion:** 92 metros in Facebook Events search, 51 national grid centers
- **eBay API proxy:** DoH-based Akamai IP resolution, full proxy migration for all 35+ eBay API calls
- **eBay image proxy:** Railway-side proxy for i.ebayimg.com CDN (fixes incognito blocking)
- **track-visit XP route:** 5 XP per sale visit
- **Brand-kit PDF auth:** JWT via query param (fixes Authorization header not sent on `<a href>` clicks)
- **Ripple guard on deleted sales:** No more P2003 FK violations when viewing deleted sale pages
- **Storefront v2 backend:** `GET /organizers/:id` expanded from 12 → 34 fields; hours include; isPinned/attendanceCount on sales
- **Claim-This-Listing magic link:** `ClaimRequest` token flow, Resend email, 72h expiry, admin endpoints
- **Broadcast to Followers:** `POST /organizers/me/broadcast` with Notification rows for all followers
- **Discounted Rules P0 fixes:** organizerId lookup, tier field fix, optional-auth organizer join
- **claimEmailCron:** 3-touch Day 1/3/7 email sequence to unmanaged organizers (gated `CLAIM_EMAIL_ENABLED`)
- **metroSyncCron:** Nightly metro top-finds sync from eBay (gated `METRO_SYNC_ENABLED`)
- **markdownCycleCron + consignorExpiryNoticeJob:** Daily crons at 03:00 and 02:00 UTC

### Frontend
- **SSR P0 fix:** `@vercel/analytics` and `@vercel/speed-insights` moved to `next/dynamic({ ssr: false })` — unblocks all unauthenticated SSR pages
- **Deleted-sale polling loop fix:** `setInterval + invalidateQueries` guard — skips invalidation when query state is error
- **Storefront v2 features:** Business Hours, Organizer Type badges, Broadcast card, Featured/Pinned badge, Claim banner, Attendance count, Buyer's Premium badge, Tagline, Year Founded, social links (Twitter, TikTok, YouTube, Pinterest)
- **Watermark TEAMS-gating:** Toggle in settings, 5 surfaces gated, PDF watermarks, OG image tier-aware
- **Condition rating sync:** "Like New" canonical for S grade, As-Is as flag, FAQ links to guild-primer
- **Items/{id} OG image fix:** Cloudinary `b_rgb` parameter replaces data URI
- **City pages:** ISR pages for 2,723 US cities with top-finds data
- **SEO content moat:** 500 guide pages at `/guide/[slug]` with ISR + schema.org structured data
- **Claim verify page:** `pages/claim/verify/[token].tsx` — 5 states (loading/success/already-verified/expired/invalid)
- **City dataset regenerated:** 2,723 population-sorted cities (was 13-city stub)

### Database Migrations (April 2026)
- `20260430000000_storefront_v2_hours_types_pinned` — OrganizerHours, organizerTypes, timezone, isPinned
- `20260430100000_storefront_v2_organizer_fields` — tagline, yearFounded, social links
- `20260430200000_broadcast` — OrganizerBroadcast model
- `20260430210000_sale_attendance` — attendanceCount
- `20260430220000_storefront_v2_claim_listing` — isClaimed, isUnmanagedListing, ClaimRequest
- `20260501020000_scraper_phase1` — Sale scrape fields, ScrapedSalesJob, ClaimEmail
- `20260501030000_metro_top_finds` — MetroTopFinds model
- `20260501060000_organizer_claim_email` — OrganizerClaimEmail model
- `20260502000000_claim_request_magic_link` — verificationToken, emailVerifiedAt, reviewedBy
- `20260502000001_add_esn_enrichment_fields` — esnOrgId, linkedInUrl, esnMemberships, esnPackageType
- `20260502000002_add_contact_email_esn_url` — contactEmail, esnCompanyPageUrl
- And misc: `add_markdown_cycles`, `add_shopify`, `add_stripe_connect_ach`, `add_user_edited_fields`, `add_pricing_engine`, `organizer_phone_nullable`, `tasteProfile_rename`, others

---

## 🔍 Stale Decisions Audit

**3-month threshold:** Decisions dated before 2026-02-02 would be flagged.

**Result: No decisions are older than 3 months.** The oldest entries in `decisions-log.md` are dated 2026-03-23 (approximately 5.5 weeks ago). All decisions are within the 3-month window.

**However, note one superseded decision worth reviewing:**
- **S251 Gamification Core Loop** (2026-03-23) — logged as LOCKED with "$1 = 1pt, referral = 50pts, badges at 25/100/250 purchases" — this was explicitly superseded by S268's Gamification 3-System Model (guildXp + Hunt Pass + Explorer Rank). The S251 entry should be annotated as SUPERSEDED to prevent context drift. The S268 entry (same date) correctly describes the current model.

---

## 📅 Next Month Focus

Per STATE.md "## Next Session" (S623):

**Immediate:** Scraper audit — verify `getOrCreateScrapedOrganizer` is working, per-organizer attribution confirmed via DB query, contactEmail population after enrichment backfill.

**Pending Patrick actions (carry-forward):**
1. Run ESN scraper (GitHub Actions) — rebuilds sales under per-company organizers
2. Run Enrichment Backfill `all=true` — populate contactEmail on all organizer records
3. File PRNewswire press release (was May 5 9:00 AM EST — confirm if filed)
4. Review + send 19 Gmail outreach drafts (Nick Loper, Codie Sanchez, NASMM, ISA, NESA, etc.)
5. Add `INTERNAL_API_URL` to Vercel env vars → fixes Sales OG meta SSR

**May 2026 likely focus areas:**
- Scraper quality: verify attribution, upsert protocol, contactEmail coverage
- Claim-This-Listing end-to-end Chrome QA + organizer outreach using contactEmail pipeline
- Canada Phase 1 prep (Ontario + BC + Alberta targeting, if GO decision formalized)
- eBay channel bridge (phase1-channel-bridge ADR — 296 eng hours, pending decision)
- Beta launch: QA carryover items, ConfirmDialog systemic fix, hydration #418 sweep

---

*Generated by findasale-records scheduled task (findasale-monthly-digest). Run monthly on the 1st.*
