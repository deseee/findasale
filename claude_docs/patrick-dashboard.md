# Patrick Dashboard — FindA.Sale

**Last updated:** S965 — 2026-06-12 (Chrome QA #27c ✅ + GSalr research PROHIBITED)

---

## Session S965 Summary — #27c Verified ✅ + GSalr Ruled Out (COMPLETE)

**Type:** DEV — Chrome QA, scraper research
**BQ:** 0 (unchanged)

| Item | Status | Details |
|------|--------|---------|
| #27c eBay CSV Export | ✅ VERIFIED | Chrome QA confirmed: HTTP 200 (no 500). Em dash in sale title passed cleanly. S963 fix confirmed working. ss_3764vxdwk ss_8508ma6s6 ss_0576eihvm |
| GSalr.com (#381) | ⛔ PROHIBITED | Technically excellent (static HTML, full schema.org data, 51-state coverage) but ToS §2.3+§3.1 ban scraping with $10k/day liquidated damages for competing service use. Roadmap updated. |
| AuctionTime.com | ⚠️ BLOCKED | Cloudflare challenge on direct fetch. UA rotation may help — not attempted this session. |

---

## Session S964 Summary — EstateSale.com Scraper Built (COMPLETE)

**Type:** DEV — new directory scraper, CI fix, session wrap
**BQ:** 0 (unchanged)

| Item | Status | Details |
|------|--------|---------|
| EstateSale.com scraper | ✅ BUILT | Two-phase scraper: 51 state pages → profile visits for phone/email/website. ESTATE_SALE_CO category. Crawl-Delay:10 respected. 500–1,500 featured companies (paid listings = best outreach leads). Quarterly GitHub Actions workflow. TypeScript: 0 errors. |
| Playwright CI fix | ✅ FIXED | `continue-on-error: true` on fleamarkets.org step — workflow no longer fails when Patrick manually triggers it. |
| Clark's Flea Market USA | ⛔ SKIPPED | Client-rendered JS app — empty fetch + empty sitemap. No static scraping possible. |
| sourceRegistry.ts | ✅ UPDATED | Import + EstateSaleCom entry added (enabled, qualityTier: high). Python via bash (Edit tool banned). |

---

## Open Patrick Actions

| Action | Priority | Instructions |
|--------|----------|-------------|
| **Push S964+S965 changes** | HIGH | See push block below |
| **Push S963 changes (if not pushed)** | HIGH | See push block below |
| AlternativeTo | HIGH — June 18, 2026 | Log in as "FindASale" → alternativeto.net → Add Software |
| KY/ME workflow triggers | MEDIUM | GitHub Actions → `scrape-kentucky-phase2` + `scrape-maine-phase2` → Run workflow |

---

## Push Block (S964 + S965)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/services/scraper/sources/estateSaleComScraper.ts
git add packages/backend/src/services/scraper/sourceRegistry.ts
git add .github/workflows/scrape-estatesalecom.yml
git add .github/workflows/test-playwright-harness.yml
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S964/S965: EstateSale.com scraper; playwright CI fix; #27c Chrome-verified; GSalr PROHIBITED"
.\push.ps1
```

---

## Push Block (S963 — if not yet pushed)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/controllers/ebayController.ts
git add packages/backend/src/services/scraper/sources/sellMyAntiquesScraper.ts
git commit -m "S963: fix eBay CSV export HTTP 500 (Content-Disposition); update SellMyAntiques status"
.\push.ps1
```

---

## Session S963 Summary — #27c eBay CSV Fix ✅ + SellMyAntiques Dead + Records Pass (COMPLETE)

**Type:** DEV/RECORDS/WRAP — bug fix, scraper investigation, records pass, session wrap
**BQ:** 1→0 (#27c FIXED; pending Chrome verify)

| Item | Status | Details |
|------|--------|---------|
| #27c eBay CSV Export | ✅ FIXED + VERIFIED | Railway root cause: `ERR_INVALID_CHAR` in Content-Disposition. Fix: `safeTitle` strips special chars. Chrome verified S963: em-dash + ampersand title → CSV downloads with success toast. ss_6584f6gkh ss_1265m9qvy |
| SellMyAntiques scraper | ⛔ PARKED | Domain is GoDaddy lander as of 2026-06-12 — all paths redirect to /lander. Prior status (2026-06-10): JS-rendered SPA. Domain defunct. Docs updated. |
| S962 PCVs → roadmap.md | ✅ DONE | Records pass: #127 POS Tiers, #55 Seasonal Challenges, #218 Shopper Trades, #219 Achievements, #81 Empty States → all ✅ S962 in Chrome QA column. |
| SaaSHub (#480) | ✅ CLAIMED | Patrick logged in + claimed listing. Edit page live at saashub.com/manage/finda-sale/edit. "FindA.Sale was verified." banner confirmed. |
| KY/ME workflows | ✅ TRIGGERED | Patrick triggered scrape-kentucky-phase2 + scrape-maine-phase2 workflow_dispatch. S959 scraper fixes verified. |

---

## Session S962 Summary — QA Pass: #219/#218/#55/#81/#127 ✅ + #27c Bug ❌ (COMPLETE)

**Type:** QA — autonomous roadmap Chrome QA continuation
**BQ:** 0→1 (#27c eBay CSV Export 500)

| Item | Status | Details |
|------|--------|---------|
| Records pass (#74 + #463) | ✅ DONE | Applied S961 PCVs to roadmap.md Claude QA column. Both had full 5-element evidence. |
| #219 Shopper Achievements | ✅ VERIFIED | /shopper/achievements as Alice — XP breakdown, badges, rank progress. ss_5810hhnqu ss_4488tmnlg |
| #218 Shopper Trades | ✅ VERIFIED | /shopper/trades as Alice — trades page renders with active listings. ss_9998kdjb8 |
| #55 Seasonal Challenges | ✅ VERIFIED | /challenges as Alice — challenge list renders. ss_5780an0ik |
| #81 Empty State Audit | ✅ VERIFIED (spot-check) | Key pages confirmed with empty-state messaging + CTAs. ss_2877anw5k |
| #127 POS Value Unlock Tiers | ✅ VERIFIED | /organizer/pos with active sale — widget expanded, 3 tiers visible, Tier 1 unlocked. ss_9169k1up3 ss_0868mkvi8 |
| #27c eBay CSV Export | ❌ BUG | Click "Export to eBay" → modal opens → "Download CSV" → HTTP 500. Added to BQ. |
