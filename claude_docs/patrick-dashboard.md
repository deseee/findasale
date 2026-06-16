# Patrick's Dashboard — Week of June 16, 2026 (Updated S997)

---

## What Happened This Week

**S996 (today — eBay sold sync fix):** Found and fixed the reason items sold on eBay weren't being marked SOLD on FindA.Sale. Root cause: the sync cron used a 7-day `lastmodifieddate` filter. Once an order settles (paid + shipped), eBay stops updating its `lastmodifieddate` within hours — so after 7 days the order permanently drops out of the polling window. Fix: switched to a 90-day `creationdate` window. `creationdate` is immutable — an order placed 60 days ago is always returned until day 91. Existing sold items won't double-mark (the cron only looks at AVAILABLE items). 1 file changed, 0 TS errors.

**S995–S997 (today):** S995 built the GarageSaleFinder photo pipeline (gallery page scraper to pull real 700×500 images) + cityData.ts About/meta for yard-sales pages. S996 fixed eBay sold sync (7-day → 90-day creationdate window). S997 fixed a Vercel TypeScript build error blocking deployment of all S994–S996 work: 12 single-quoted strings in `YARD_SALE_ABOUT` contained possessive apostrophes (city\'s, Chicago\'s, etc.) which terminated the string literals prematurely. Fixed by converting to double-quoted strings. Vercel build unblocked.

**S997 (today — Yard-sales Chrome QA + GSC sitemap fix):** Chrome-verified `/yard-sales/grand-rapids-mi` — H1 correct ("Yard Sales in Grand Rapids, MI"), About section shows yard-sale copy (NOT estate-sale text), 7 yard-sale FAQs render, 5 nearby city links, 7 listings, FAQPage JSON-LD confirmed. All 6 QA criteria passed. Also shipped GSC P1 fix: removed 10,000 `/items/{id}` URLs from `server-sitemap.xml.tsx` (255→241 lines, TS 0 errors). Crawl budget now freed for city/sale/guide pages.

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

1. **Push S997 changes** (push block below — 3 files: server-sitemap.xml.tsx + STATE.md + dashboard).
2. **GSC improvement live:** sitemap no longer includes 10k /items/{id} URLs — Googlebot crawl budget freed for your SEO pages.
3. **GSC P1 remaining (wait 1–2 weeks):** After sitemap fix is indexed, dispatch ISR conversion for `/items/[id].tsx`.
4. **Send the 4 Gmail drafts** sitting in your inbox (eBay dev ticket, 3 press pitches).

---

## Action Items for Patrick

- [ ] **Push S997 changes:**
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale
  git add packages/frontend/pages/server-sitemap.xml.tsx
  git add claude_docs/STATE.md
  git add claude_docs/patrick-dashboard.md
  git commit -m "S997: GSC sitemap itemUrls removed from server-sitemap + STATE + dashboard"
  .\push.ps1
  ```

- [x] **Yard-sales About section** — Chrome-verified ✅. "Yard Sales in Grand Rapids, MI" H1, yard-sale copy in About, 7 FAQs, 5 nearby cities, FAQPage JSON-LD all confirmed.

- [ ] **Send 4 Gmail drafts** (eBay dev ticket reply + 3 press pitches — review before sending)

- [ ] **Directory quick-wins (~1–2 hrs, all free):** Bing Places, Apple Business Connect, Yelp, Foursquare, Appsco.pe, findPWA, eBay Partner Network, Alignable, Paw Paw Chamber.

---

## BQ Status

**Count: 2** — below QA ceiling (≥8 triggers QA mode). Dev fully unblocked.

| Feature | Status |
|---------|--------|
| GSC: /items/[id].tsx SSR, no CDN caching (P1) | Sitemap fix shipped S997 — wait 1–2 weeks for GSC crawl reset, then convert to ISR revalidate:3600 |
| GSC discovered-not-indexed monitor | Sitemap itemUrls fix live; crawl budget improving |
