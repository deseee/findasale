# Patrick's Dashboard — Week of June 16, 2026 (Updated S994)

---

## What Happened This Week

The big story this week was eBay shipping accuracy — the preview tool was computing from a null location instead of the sale's ZIP code, so it showed $28 while the live listing correctly charged $32. That's now fixed: preview matches the listing. We also overhauled the confusing "minimum price" widget (it now shows a quiet amber warning only when you're pricing too low). A P1 bug was caught and fixed: new organizer accounts weren't getting their ORGANIZER role properly. QA is fully caught up — #358 Follower Count Toggle, #318 affiliate tab filter, #313 HAUL_POST_LIKES XP idempotency, and #465 GA4 Tier 2 events are all Chrome-verified. BQ is at 1 (GSC indexing — see below).


**S994 (today — Yard-sales SEO pages + GSC audit):** Built `/yard-sales/[city-slug].tsx` (47-city ISR, same pattern as estate-sales). Added `getYardSaleFaqs()` to `cityData.ts`. Updated sitemap with `yardSalesUrls` at priority 0.70. Also audited the 2,071 discovered-not-indexed issue — root cause confirmed: 10,000 `/items/{id}` SSR pages in the sitemap exhaust crawl budget. P1 fix dispatch ready for next session. TypeScript 0 errors. Chrome QA pending.

**S993 (S993 — Outreach pipeline fix + RDAP email discovery):** Found and fixed the reason the outreach pipeline only ever sent 848 emails despite 80k organizers. Root cause 1: a Prisma ORM quirk where `NOT: [{emailDiscoveryConfidence: 0.0}]` silently excludes NULL values in SQL — blocking 12,136 scraped-email organizers the code labelled "trusted". Root cause 2: 2,276 ARCHIVED rows (past maintenance SQL) were permanently dead-ending out of the queue. Fixed both: reset valid ARCHIVED rows to PENDING, fixed the null-safe filter in two files. Queue: 2,292 PENDING. Also implemented RDAP Stage 3 in the email discovery service — the pipeline now queries ICANN's registrar database for the registrant's email when the website scraper finds nothing. 5,057 organizers with a website but no email are now addressable. Privacy proxy detection filters fake registrar addresses automatically.

**S992 (yesterday — SEO):** Analytics OAuth pipeline restored (Google token had expired; created the missing `oauth_setup2.py` helper, ran the weekly report). Built a reusable city SEO framework (`lib/seo/cityData.ts`) covering 50+ cities with unique content per city. Upgraded the estate-sales city landing pages: Birmingham AL and Long Beach CA are now pre-rendered (they had GSC impressions but no clicks because the pages weren't building at deploy time), FAQPage schema added, city-specific "About" content replaces the identical boilerplate, and a Nearby Cities section creates internal link equity across pages.

---

## Pending Decisions

No PENDING items in DECISIONS.md. All standing design and brand rules are active.

---

## Beta Tester Impact

**City SEO pages (S992):** Birmingham AL, Long Beach CA, and 43 other markets now have pre-rendered landing pages with FAQ schema (Google rich result eligible), city-specific content, and nearby city links. Estate sale searchers in those markets land on real pages instead of a blocking ISR spin.

**eBay shipping fix (S991):** The "Could not estimate shipping right now" error on items with null organizerId (items created through the sale flow) is fixed. The Celestion Vintage item unblocked.

**Better for eBay sellers (S979/S980):** The shipping preview shows the right number — what the buyer actually pays. The guardrail that warns when a price is too low fires quietly and only when it matters.

**New organizer registrations (S983/S984):** The bug where new organizers couldn't access their dashboard after signing up is fixed.

**GA4 Tier 2 events (#465):** All four engagement events confirmed firing in production. Chrome-verified S990.

---

## This Week's Priority

1. **Push combined S994+S993+S992 block** (push block in Action Items below — 11 files).
2. **Chrome QA after deploy:** verify `/yard-sales/grand-rapids-mi` renders with yard-sale H1, FAQ schema, nearby cities.
3. **GSC P1 fix (next session):** Remove `/items/{id}` URLs from sitemap — root cause of 2,071 discovered-not-indexed confirmed.
4. **Send the 4 Gmail drafts** sitting in your inbox (eBay dev ticket, 3 press pitches).

---

## Action Items for Patrick

- [ ] **Push S994 + S993 + S992 combined:**
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale
  git add "packages/frontend/pages/yard-sales/[city-slug].tsx"
  git add packages/frontend/lib/seo/cityData.ts
  git add packages/frontend/pages/server-sitemap.xml.tsx
  git add "packages/frontend/pages/estate-sales/[city-slug].tsx"
  git add packages/backend/src/jobs/autoSeedOutreachCron.ts
  git add packages/backend/src/scripts/seedDirectoryClaimEmails.ts
  git add packages/backend/src/services/emailDiscoveryService.ts
  git add claude_docs/scripts/oauth_setup2.py
  git add claude_docs/STATE.md
  git add claude_docs/patrick-dashboard.md
  git add claude_docs/strategy/roadmap.md
  git commit -m "S994: yard-sales city pages + GSC crawl-budget audit + S993 outreach fix + S992 city SEO framework"
  .\push.ps1
  ```

- [ ] **Send 4 Gmail drafts** (eBay dev ticket reply + 3 press pitches — review before sending)

- [ ] **Directory quick-wins (~1–2 hrs, all free):** Bing Places, Apple Business Connect, Yelp, Foursquare, Appsco.pe, findPWA, eBay Partner Network, Alignable, Paw Paw Chamber.

---

## BQ Status

**Count: 3** — below QA ceiling (≥8 triggers QA mode). Dev fully unblocked.

| Feature | Status |
|---------|--------|
| GSC: 10,000 /items/{id} URLs bloating sitemap (P1) | Root cause confirmed S994 — dispatch findasale-dev to remove itemUrls block |
| GSC: /items/[id].tsx SSR, no CDN caching (P1) | Fix after sitemap fix — convert to ISR revalidate:3600 |
