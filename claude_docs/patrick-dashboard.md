# Patrick's Dashboard — Week of June 16, 2026 (Updated S996)

---

## What Happened This Week

**S996 (today — eBay sold sync fix):** Found and fixed the reason items sold on eBay weren't being marked SOLD on FindA.Sale. Root cause: the sync cron used a 7-day `lastmodifieddate` filter. Once an order settles (paid + shipped), eBay stops updating its `lastmodifieddate` within hours — so after 7 days the order permanently drops out of the polling window. Fix: switched to a 90-day `creationdate` window. `creationdate` is immutable — an order placed 60 days ago is always returned until day 91. Existing sold items won't double-mark (the cron only looks at AVAILABLE items). 1 file changed, 0 TS errors.

**S995 (today — QA pass + yard-sales About bug fix):** Ran QA on everything shipped this week. S991 shipping preview fix ✅ Chrome-verified (Celestion Vintage now shows net estimate). S992 FB checkout ✅ Chrome-verified. S993 outreach pipeline ✅ DB-verified (2,284 PENDING ready to send). S994 yard-sales pages ✅ PARTIAL — found and fixed a P2 bug: the About section on `/yard-sales/grand-rapids-mi` was showing estate-sale copy ("Grand Rapids estate sales reflect the city's Dutch heritage..."). Root cause: the page was pulling from `getCityMeta()` which returns estate-sale branded content. Fix: added a separate `YARD_SALE_ABOUT` record (15 cities) + `getYardSaleMeta()` function to `cityData.ts`. Yard-sales About now says yard-sale copy. TypeScript 0 errors.

**S994 (today — Yard-sales SEO pages + GSC audit):** Built `/yard-sales/[city-slug].tsx` (47-city ISR, same pattern as estate-sales). Added `getYardSaleFaqs()` to `cityData.ts`. Updated sitemap with `yardSalesUrls` at priority 0.70. Also audited the 2,071 discovered-not-indexed issue — root cause confirmed: 10,000 `/items/{id}` SSR pages in the sitemap exhaust crawl budget. P1 fix dispatch ready for next session.

**S993 (today — Outreach pipeline fix + RDAP email discovery):** Found and fixed the reason the outreach pipeline only ever sent 848 emails despite 80k organizers. Root cause 1: a Prisma ORM quirk where `NOT: [{emailDiscoveryConfidence: 0.0}]` silently excludes NULL values — blocking 12,136 scraped-email organizers. Root cause 2: 2,276 ARCHIVED rows permanently dead-ending the queue. Fixed both. Queue: 2,292 PENDING. Also implemented RDAP Stage 3 — pipeline now queries ICANN's registrar database for organizer emails. 5,057 more organizers now addressable.

**S992 (today — SEO + FB Commerce Manager checkout):** Analytics OAuth restored. Built city SEO framework (`cityData.ts`, 50+ cities). Estate-sales landing pages upgraded with FAQ schema, city-specific content, Nearby Cities links. Built `checkout.tsx` for Facebook Commerce Manager integration — confirmed working live with Super Mario Bros + X-Force #1.

---

## Pending Decisions

No PENDING items in DECISIONS.md. All standing design and brand rules are active.

---

## Beta Tester Impact

**eBay sold sync (S996):** Items sold on eBay will now actually get marked SOLD on FindA.Sale within 15 minutes of the cron cycle. Previously the 7-day window was missing settled orders permanently.

**Yard-sales pages (S994+S995):** `/yard-sales/[city-slug].tsx` — 47 markets now have ISR landing pages with FAQ schema, city-specific yard-sale content, and nearby city links. The estate-sale copy bug (About section) is fixed.

**Outreach pipeline (S993):** 2,292 PENDING organizers now eligible (was effectively ~329 due to Prisma NULL bug). RDAP adds 5,057 more addressable via registrar email lookup.

**FB Commerce Manager (S992):** Checkout flow confirmed — feed products link directly to a cart page that injects items and redirects to the sale.

---

## This Week's Priority

1. **Push combined S996+S995+S994+S993 block** (push block below — 11 files).
2. **Chrome QA after deploy:** verify `/yard-sales/grand-rapids-mi` About section no longer says "estate sales".
3. **GSC P1 fix (next session):** Remove `/items/{id}` URLs from sitemap — root cause of 2,071 discovered-not-indexed confirmed.
4. **Send the 4 Gmail drafts** sitting in your inbox (eBay dev ticket, 3 press pitches).

---

## Action Items for Patrick

- [ ] **Push S996+S995+S994+S993+S992 combined:**
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale
  git add "packages/frontend/pages/yard-sales/[city-slug].tsx"
  git add packages/frontend/lib/seo/cityData.ts
  git add packages/frontend/pages/server-sitemap.xml.tsx
  git add "packages/frontend/pages/estate-sales/[city-slug].tsx"
  git add packages/frontend/pages/checkout.tsx
  git add packages/backend/src/jobs/autoSeedOutreachCron.ts
  git add packages/backend/src/scripts/seedDirectoryClaimEmails.ts
  git add packages/backend/src/services/emailDiscoveryService.ts
  git add packages/backend/src/jobs/ebaySoldSyncCron.ts
  git add claude_docs/scripts/oauth_setup2.py
  git add claude_docs/STATE.md
  git add claude_docs/patrick-dashboard.md
  git commit -m "S996: eBay sold sync 90-day creationdate fix + S995 yard-sales About fix + S994 yard-sales pages + S993 outreach + S992 city SEO/checkout"
  .\push.ps1
  ```

- [ ] **After deploy — verify yard-sales About section:** Go to https://finda.sale/yard-sales/grand-rapids-mi. The About section should say "Grand Rapids yard sales and garage sales thrive in established West Michigan neighborhoods..." (NOT anything about "estate sales").

- [ ] **Send 4 Gmail drafts** (eBay dev ticket reply + 3 press pitches — review before sending)

- [ ] **Directory quick-wins (~1–2 hrs, all free):** Bing Places, Apple Business Connect, Yelp, Foursquare, Appsco.pe, findPWA, eBay Partner Network, Alignable, Paw Paw Chamber.

---

## BQ Status

**Count: 3** — below QA ceiling (≥8 triggers QA mode). Dev fully unblocked.

| Feature | Status |
|---------|--------|
| GSC: 10,000 /items/{id} URLs bloating sitemap (P1) | Root cause confirmed S994 — dispatch findasale-dev to remove itemUrls block |
| GSC: /items/[id].tsx SSR, no CDN caching (P1) | Fix after sitemap fix — convert to ISR revalidate:3600 |
| GSC discovered-not-indexed monitor | Root cause resolved by above two fixes |
