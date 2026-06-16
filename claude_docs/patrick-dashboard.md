# Patrick's Dashboard — Week of June 16, 2026 (Updated S998)

---

## What Happened This Week

**S998 (today — eBay bidirectional sync restored):** Fixed the root cause of classic eBay listings (items listed directly on eBay, not via FindA.Sale) showing "Push to eBay" even though they were already live. Root cause: the import function had an `if (totalFetched === 0)` guard before the Trading API block — ArtifactMI has 18 Inventory API items, so the guard always fired and the Trading API (`GetMyeBaySelling`, which returns ALL listings regardless of how they were created) never ran. Fix: removed the guard — both APIs now always run. Dedup logic handles items found by both paths. Patrick confirmed after deploy: "wrap it synced now." Also shipped: `seed.ts` fix removing user1 ADMIN role and eBay connection from test seeding.

**S997 (today — Yard-sales Chrome QA + GSC sitemap fix):** Chrome-verified `/yard-sales/grand-rapids-mi` — H1 correct, About shows yard-sale copy, 7 FAQs, 5 nearby city links, 7 listings, FAQPage JSON-LD confirmed. Also shipped GSC P1 fix: removed 10,000 `/items/{id}` URLs from sitemap. Crawl budget freed for city/sale/guide pages.

**S996 (today — eBay sold sync fix):** Items sold on eBay will now actually get marked SOLD on FindA.Sale. Root cause was a 7-day `lastmodifieddate` window that permanently dropped settled orders after a week. Fixed to 90-day `creationdate` window.

**S994/S995 (today — Yard-sales SEO pages):** Built `/yard-sales/[city-slug].tsx` (47-city ISR). Fixed Vercel build error (possessive apostrophes in string literals). Yard-sale-specific FAQs, About copy, nearby city links, FAQPage JSON-LD all live.

**S993 (today — Outreach pipeline fix + RDAP email discovery):** Found and fixed why the outreach pipeline only ever sent 848 emails despite 80k organizers. Prisma NULL bug + 2,276 ARCHIVED rows. Queue: 2,292 PENDING. 5,057 more organizers now addressable via RDAP.

**S992 (today — SEO + FB Commerce Manager checkout):** Analytics OAuth restored. City SEO framework built (50+ cities). Estate-sales landing pages upgraded with FAQ schema. FB checkout flow confirmed working live.

---

## Pending Decisions

No PENDING items in DECISIONS.md. All standing design and brand rules are active.

---

## Beta Tester Impact

**eBay bidirectional sync (S998):** ArtifactMI (and any organizer with a mix of FAS-pushed and manually-listed eBay items) will now see all their eBay classic listings in FindA.Sale after running "Import from eBay."

**eBay sold sync (S996):** Items sold on eBay now get marked SOLD on FindA.Sale within 15 minutes of the cron cycle.

**Yard-sales pages (S994+S995):** 47 markets now have ISR landing pages with FAQ schema, city-specific yard-sale content, and nearby city links.

**Outreach pipeline (S993):** 2,292 PENDING organizers now eligible. RDAP adds 5,057 more addressable.

---

## This Week's Priority

1. **Push S997+S998 changes** (push block below — 5 files).
2. **GSC improvement live:** sitemap no longer includes 10k /items/{id} URLs — crawl budget freed.
3. **GSC P1 remaining (wait 1–2 weeks):** After sitemap fix is indexed, dispatch ISR conversion for `/items/[id].tsx`.
4. **Send the 4 Gmail drafts** sitting in your inbox (eBay dev ticket, 3 press pitches).

---

## Action Items for Patrick

- [ ] **Push S997+S998 changes:**
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale
  git add packages/frontend/pages/server-sitemap.xml.tsx
  git add packages/backend/src/controllers/ebayController.ts
  git add packages/database/prisma/seed.ts
  git add claude_docs/STATE.md
  git add claude_docs/patrick-dashboard.md
  git commit -m "S997+S998: GSC sitemap itemUrls removed; eBay bidirectional sync fix; seed user1 ADMIN removed"
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
