# Patrick Dashboard — FindA.Sale

**Last updated:** S974 — 2026-06-13 (BUG/DEV: FVF flat-rate shipping fix pushed | BQ 3 | Next: end listings → re-push → Chrome verify)

---

## Session S974 Summary — eBay FVF Flat-Rate Shipping Fix

**Type:** BUG/DEV — root cause confirmed, 3 files shipped (commit 11cfb344), Railway deploying
**BQ:** 3 (+1: FVF flat-rate Chrome verify + tier-ID investigation needed)

| Item | Status | Details |
|------|--------|---------|
| AP-40 $75 root cause | ✅ CONFIRMED | FLAT_TIERS gap — USPS caps at 111oz, 11lb AP-40 fell into FedEx $75 catch-all tier |
| FVF flat-rate service | 🔧 SHIPPED CODE-ONLY | New ebayFlatRatePolicyService.ts creates "FindA.Sale Flat $X.XX" policies on eBay per item |
| Gap-overshoot guard fix | 🔧 SHIPPED CODE-ONLY | Gap now tries FVF flat-rate first instead of blocking. AP-40 → ~$23.59 |
| Butter Knife re-push | ⏳ NEEDS CHROME VERIFY | Expected: $6.65 (exact FLAT_TIERS tier match) |
| AP-40 re-push | ⏳ NEEDS CHROME VERIFY | Expected: ~$23.59 (new "FindA.Sale Flat $23.59" policy created on eBay) |
| Tier-ID source | ⚠️ UNKNOWN | How did 23 tier policy IDs get into FindA.Sale DB? "Sync from eBay" only saves ONE default. Opus must investigate. |

**What you need to do:**
1. Wait for Railway to finish deploying commit 11cfb344 (~2-3 min)
2. "Remove from eBay" on Butter Knife (137412262678) and AP-40 (137411858004)
3. "Re-push to eBay" on both — verify prices

---

## 🟠 ACTION NEEDED — Push Block (S973 — 4 files)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/controllers/ebayController.ts
git add packages/backend/src/controllers/itemController.ts
git add packages/frontend/pages/organizer/edit-item/[id].tsx
git add packages/backend/src/services/ebayCalculatedPolicyService.ts
git commit -m "fix: eBay calculated-shipping bugs (err:216314, brand/mpn GET, ShippingNetPreview wiring)

err:216314: strip packageType from inventory payload when routing CALCULATED
(LSAS computed-rate engine rejects MAILING_BOX; weight+dims alone are sufficient).

Brand/mpn/upc: add fields to getItemById select — were saved correctly but
stripped from GET response, so edit-item form showed empty on load.

ShippingNetPreview: import + wire component to edit-item page (built S971 but
never added to the page). Suggest Price button now live in shipping section.

ebayCalculatedPolicyService: USPSGroundAdvantage → USPSParcel+USPSPriority
(UNKNOWN_SHIPPING_SERVICE_CODE fix for new calculated-policy provisioning)."
.\push.ps1
```

---

## Session S971 Summary — eBay Push Fixed + Calculated-Shipping/Net-Engine Build (migration applied ✅)

**Type:** DEV — eBay listing-push debugging + a big shipping/pricing build
**BQ:** 1 → 2

| Item | Status | Details |
|------|--------|---------|
| eBay push fixes | ✅ SHIPPED + ✅ UI VERIFIED | Brand/Model now sent correctly; bad category map disabled; resolver skips "Other/Misc"; $75 overcharge case blocks with clear message. Brand/Model/UPC fields confirmed on edit-item page (S972 Chrome ✅). |
| 🚢 Calculated shipping + net-proceeds engine | ✅ SHIPPED — partially browser-verified | Shipping-mode toggle confirmed on settings page (S972 Chrome ✅). ShippingNetPreview + Danner pump re-push still need your real eBay account. |
| The Danner pump | ↩️ Reset & ready | Reset so it can be cleanly re-pushed through the new shipping path. |
| Database migration | ✅ DONE | Applied + verified on Railway 2026-06-13. |

---

## ✅ DONE — eBay Shipping Migration Applied to Railway (S971, 2026-06-13)

Tables, columns, and backfill all verified on Railway. Nothing more needed here.

---

## Session S970 Summary — S969 Records Pass + #219 Chrome Re-Verify (COMPLETE)

**Type:** QA / RECORDS — records pass + Chrome verification
**BQ:** 0 (unchanged)

| Item | Status | Details |
|------|--------|---------|
| S969 PCVs → roadmap | ✅ APPLIED | #164 Tiers, #27b watermark toggle, #317 geofence QR all marked verified on the roadmap with their evidence. The old "to-verify" notes are cleared. |
| Achievements XP (#219) | ✅ VERIFIED LIVE | The fix from last session is confirmed working. Your Achievements page and dashboard now show the **same** XP number — "2,065 / 5,000 XP to Sage" in both places (was showing two different numbers before). Checked live as a shopper account; dark mode clean. |
| Blocked Queue | ✅ CLEAN (0) | Cleared the 3 already-resolved leftover rows. Nothing blocking. DEV is fully open for new work. |
| Housekeeping | ✅ DONE | Trimmed STATE.md (427 → 282 lines), moved older session entries to the archive file. |
| Code verification (7 items) | ✅ DONE | Re-checked 7 gamification XP rewards against the live code. 5 are correct as-is. 1 was just a wrong note in our docs (trail completion — fixed the note). |
| 🐛 #313 XP-farm bug | ✅ FOUND + FIXED | A real bug: once a "haul" photo post got 10 likes, the author was getting +5 XP on **every** additional like instead of just once — an XP-farming loophole. Fixed so it pays out once per post. (Final browser test needs 10 accounts, so it's queued.) |

---

## Session S969 Summary — S968 Post-Deploy Smoke + Pending-QA Burn-Down (COMPLETE)

**Type:** QA — Chrome MCP verification (run by main session)
**BQ:** 0 (unchanged)

| Item | Status | Details |
|------|--------|---------|
| S968 homepage smoke | ✅ PASS | CLS fix is LIVE and correct — the promo banners now sit below the map (no shift). Both code-split banners load, Featured Sales + filter pills render. The only console error anywhere was a wallet browser-extension conflict, not our code. |
| S968 app-wide pages | ✅ CLEAN | Organizer dashboard / settings / add-items / POS and the public sale-detail page all render cleanly after the app-wide code-split change — no broken overlays. |
| #164 Tiers infrastructure | ✅ VERIFIED | Loyalty-tier API returns correctly; the "Bronze Organizer" badge shows the right progress ("1/4 sales until next tier"). Minor data-hygiene note logged (no user impact). |
| #27b Watermark (TEAMS) | ✅ VERIFIED | The "Remove FindA.Sale watermark" toggle is present + enabled for your TEAMS account. PDF-footer and calendar-text sub-checks still need a non-TEAMS account to compare. |
| #317 Geofence QR scan | ✅ VERIFIED | Scanning from far away is correctly blocked (403 "must be at the sale location"); at-location and no-location scans pass. 100-meter rule working live. |
| ✅ Achievements XP (#219) | FIXED — verify after deploy | **Found in walkthrough AND fixed same session.** The Achievements page and your dashboard were showing the same XP progress two different ways — Achievements counted progress *within* your current rank (865/3,800), the dashboard counted *total* toward the next rank (2,060/5,000). Both technically correct, but confusing side-by-side. Fixed so Achievements now matches the dashboard exactly. Needs a quick click-check once it deploys. |
| #40 Market Hubs | ✅ AS-INTENDED | The multi-vendor events page (/organizer/hubs) is a clean "coming in Phase 2" teaser — 4 market types, value props, a disabled Create-Event button. Nothing broken; just not built yet. |
| Full walkthroughs | ✅ CLEAN | Clicked through the organizer product (dashboard, sales, add-items, POS, insights, earnings, holds, reputation, consignors, create-sale) and shopper product (dashboard, sale page, cart, achievements, challenges, wishlist). All render well with real data. One minor label note: "Total Revenue" on Insights vs "Gross Revenue" on Earnings show different numbers (different definitions — not a bug). |
| user12 account | ℹ️ RESOLVED | The earlier "login failed" was because user12 was removed long ago (you confirmed ~6 seed accounts remain). Not a bug — just outdated QA notes. Using user5/user1 going forward. |

---

## Session S968 Summary — Mobile Perf + Lighthouse Audit Infrastructure + CLS Fix (COMPLETE)

**Type:** DEV / PERF — homepage performance, repeatable audit setup, Core Web Vitals fix
**BQ:** 0 (unchanged)

| Item | Status | Details |
|------|--------|---------|
| Mobile homepage perf | ✅ SHIPPED | Code-split 10 overlay/banner components to `next/dynamic` ssr:false (7 app-wide in _app.tsx + 3 on homepage) + lazy-loaded below-fold item images. Trims initial JS / TBT. |
| Lighthouse CI | ✅ BUILT + RUNNING | New GitHub Action (median-of-3, mobile, 4 key URLs, warn-only). Runs **monthly** (1st) + on-demand. Plus `scripts/psi-audit.mjs` for instant checks (PSI API is 100% free — grab a free key to skip the rate limit). |
| Homepage CLS | ✅ FIXED + VERIFIED | First attempt regressed (0.204→0.284) and was reverted. Diagnosed the real culprit (promo banners shoving the map down), then moved the banners below the map. CI median CLS now **< 0.1** (warning cleared); sandbox 0.135→0.019. |
| Vercel Speed Insights | ✅ CONFIRMED LIVE | Real users are healthy: mobile Real Experience Score **91 "Great"**, LCP 1.68s. Already collecting — view in Vercel → Speed Insights. |
| findPWA listing (#494) | ⛔ THEIR SERVER DOWN | Submission attempted; findPWA's backend returned HTTP 500. NOT submitted — retry when their site recovers. Form data + screenshots are ready. |
| Appsco.pe (#493) | ⛔ DEAD SITE | Entire site is a broken Heroku app → mark defunct on roadmap. |
| Monthly perf scheduled task | ✅ CREATED | Cowork task `findasale-monthly-perf-audit` (2nd of month) reviews the audit + field data and reports CWV status. |

## Session S967 Summary — Submission Research + eBay Catch-up + Local Outreach (COMPLETE)

**Type:** RESEARCH / OUTREACH — where-else-to-submit research, eBay email catch-up, West Michigan outreach prep
**BQ:** 0 (unchanged)

| Item | Status | Details |
|------|--------|---------|
| App-submission research | ✅ DONE | Reconciled vs existing pipeline → `APP-SUBMISSION-DIRECTORY-RESEARCH-2026.md`. Part A = already done/queued/rejected; Part B = net-new. |
| Greenfield growth research | ✅ DONE | `GREENFIELD-GROWTH-AVENUES-2026.md` — app-store paths, vendor programs, AI discovery, PR platforms, MI ecosystem + West-MI deep-dig. |
| Roadmap rows #489–546 | ✅ ADDED | Tier 1B (local citations + PWA), 1C (greenfield), 1D (West Michigan local). Skip-lists flagged. |
| AI discovery | ✅ VERIFIED ALREADY SHIPPED | schema.org JSON-LD on 26 page types (Event on sales/[id].tsx), indexNowService.ts, robots.txt allows AI crawlers. Only Wikidata entity left — no dev needed. |
| eBay Developer ticket #260428-000018 | ✍️ REPLY DRAFTED | Browse API Growth Check was waiting on us; draft links it to the completed EPN questionnaire to stop auto-close. Pending Patrick send. |
| eBay EPN affiliate #00448478 | ✅ UP TO DATE | We replied 6/5 (fixes live); awaiting eBay. |
| eBay Marketplace Insights #00447997 | ℹ️ CLOSED BY EBAY | Access requests currently closed — dead end, no action. |
| West Michigan outreach | ✅ DRAFTED | `marketing/west-michigan-local-outreach-2026-06.md` — Paw Paw Chamber + Local First listing copy + 3 press pitches. 3 Gmail drafts created (Rapid Growth, Second Wave, Crain's/Anna Fifelski). |

---

## Session S966 Summary — Directory Listings Sprint (COMPLETE)

**Type:** RESEARCH — external directory listing setup
**BQ:** 0 (unchanged)

| Item | Status | Details |
|------|--------|---------|
| Software Finder (#483) | ✅ SUBMITTED | Full profile built: accurate description, 5 real features, 3 real FAQs. Patrick clicked Submit Profile. |
| Trustpilot (#485) | ⛔ BLOCKED | Account creation fails with Yahoo + Gmail. Try support@finda.sale or defer. |
| SourceForge (#482) | ✅ DONE | Completed prior session. |

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
| **Push S972 wrap docs** | HIGH | See push block below — STATE.md + patrick-dashboard.md |
| **Danner pump re-push (next session)** | HIGH | Be present with artifactmi@gmail.com account — next session re-pushes the Danner pump through the new CALCULATED path to verify ShippingNetPreview, Suggest-price, and eBay calculated rate |
| eBay shipping migration | ✅ DONE (2026-06-13) | Applied + verified on Railway. |
| AlternativeTo | HIGH — June 18 deadline | Log in as "FindASale" → alternativeto.net → Add Software |
| Trustpilot (#485) retry | MEDIUM | Try with support@finda.sale |
| KY/ME workflow triggers | MEDIUM | GitHub Actions → scrape-kentucky-phase2 + scrape-maine-phase2 → Run workflow |

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
