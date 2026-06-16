# Patrick's Dashboard — Week of June 16, 2026

---

## What Happened This Week

The big story this week was eBay shipping accuracy — the preview tool was computing from a null location instead of the sale's ZIP code, so it showed $28 while the live listing correctly charged $32. That's now fixed: preview matches the listing. We also overhauled the confusing "minimum price" widget (it now shows a quiet amber warning only when you're pricing too low). A P1 bug was caught and fixed: new organizer accounts weren't getting their ORGANIZER role properly. QA is fully caught up — #358 Follower Count Toggle, #318 affiliate tab filter, #313 HAUL_POST_LIKES XP idempotency, and #465 GA4 Tier 2 events are all Chrome-verified. BQ is at 1 (GSC indexing — see below).

**S993 (today — Outreach pipeline fix):** Found and fixed the reason the outreach pipeline only ever sent 848 emails despite 80k organizers. Root cause: a Prisma ORM quirk where `NOT: [{emailDiscoveryConfidence: 0.0}]` silently excludes NULL values in SQL — blocking 12,136 scraped-email organizers that the code explicitly labelled "trusted". Only ~329 orgs with confirmed email-discovery scores were ever passing the filter. Also found 2,276 ARCHIVED rows (from past maintenance SQL) permanently dead-ending out of the queue. Fixed both: reset valid ARCHIVED rows to PENDING, fixed the null-safe filter in two files. Queue: 2,292 PENDING. Pipeline should start seeding 500 new rows/day.

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

1. **Push S993 code + wrap docs** (push block below — 2 backend files).
2. **Push S992 code + wrap docs** (separate commit — 2 frontend files + SEO framework).
2. **GSC indexing (BQ P1):** 2,071 pages discovered-not-indexed since 5/23. S991 shipped 3 root-cause fixes — monitoring required. Expect improvement over next 1–2 weeks as Googlebot recrawls.
4. **S994: Extend city SEO framework to yard-sales pages** — `Skill('findasale-dev')` dispatch ready in STATE.md Next Session.
3. **S994 records pass:** Apply #465 PCVs to roadmap.md (5-element evidence confirmed S990).
5. **Send the 4 Gmail drafts** sitting in your inbox (eBay dev ticket, 3 press pitches).

---

## Action Items for Patrick

- [ ] **Push S993 outreach fix:**
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale
  git add packages/backend/src/jobs/autoSeedOutreachCron.ts
  git add packages/backend/src/scripts/seedDirectoryClaimEmails.ts
  git add claude_docs/STATE.md
  git add claude_docs/patrick-dashboard.md
  git commit -m "S993: fix outreach pipeline — null-safe Prisma confidence filter + ARCHIVED→PENDING reset"
  .\push.ps1
  ```

- [ ] **Push S992 code + wrap (combine into one commit):**
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale
  git add packages/frontend/lib/seo/cityData.ts
  git add "packages/frontend/pages/estate-sales/[city-slug].tsx"
  git add claude_docs/scripts/oauth_setup2.py
  git add claude_docs/STATE.md
  git add claude_docs/patrick-dashboard.md
  git commit -m "S992: city SEO framework + estate-sales upgrade + analytics OAuth helper + wrap"
  .\push.ps1
  ```

- [ ] **Send 4 Gmail drafts** (eBay dev ticket reply + 3 press pitches — review before sending)

- [ ] **Directory quick-wins (~1–2 hrs, all free):** Bing Places, Apple Business Connect, Yelp, Foursquare, Appsco.pe, findPWA, eBay Partner Network, Alignable, Paw Paw Chamber.

---

## BQ Status

**Count: 1** — below QA ceiling. Dev fully unblocked.

| Feature | Status |
|---------|--------|
| GSC "Discovered not indexed" — 2,071 pages (P1 monitor) | S991 root causes fixed; monitoring |
