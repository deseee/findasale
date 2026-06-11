# Patrick Dashboard — FindA.Sale

**Last updated:** S954 — 2026-06-11

---

## Session S954 Summary — Scraper Fix Campaign Complete

**Type:** DEV — 4 parallel scraper fixes + coverage/infra research
**BQ:** 1 (unchanged — #470 organizer_signup)

All 4 broken-but-fixable scrapers from the S951 diagnosis are now rewritten. Push block below.

### What was fixed

| Scraper | Problem | Fix |
|---------|---------|-----|
| **Kentucky phase2** | `web1.ky.gov` dead | Rewritten to `oop.ky.gov/lic_search.aspx`. ASP.NET ViewState flow, A–Z last-name loop, ~155 records expected. |
| **Indiana phase2** | Parser returned 1 record instead of ~1,560 | Removed early-return stub; fixed comma-number regex; rewrote multi-line `<tr>` parser. |
| **Maine phase2** | `pfr.maine.gov` NXDOMAIN | Rewritten to ALMSOnline `ExportToCSV.aspx`, regulator=4210. CSV parser, ~1,118 records expected. |
| **Alabama phase2** | undici 10s CONNECT timeout | Added `isTimeoutError()` + retry-once with 5s wait on timeout. |

All 4: TypeScript 0 errors ✅

### What was researched

**Coverage in "dead" scraper states** (no statewide license source — confirmed):
- NY: 31,733 organizers already in DB from NewYorkPhase2 + ESN + AuctionZip → **RETIRE**
- NJ: 703 organizers from ESN + AuctionZip → **RETIRE**
- MA phase1 licensing: 267 orgs from ESN → **RETIRE**; the MA phase2 (REST API) just needs DNS unblock — flag separately
- RI: 64 orgs from ESN → **RETIRE**
- NE phase1: no statewide auctioneer license → **RETIRE**; NE phase2 NDBF pawnbroker has a live form and zero pawn records in DB → **gap to fix later**

**Infrastructure alternatives** (sources exist, just blocked by tech):
- ME Licensing (ASP.NET AJAX cascade): Playwright on GitHub Actions, no WAF, 4–6 hrs, $0
- WY phase2 (Google Sites SPA): Playwright on GitHub Actions, 3–4 hrs, $0
- MA phase2 (DNS fails from cloud IPs): Request MA DPL API key first (free)
- NH (Akamai WAF): Email OPLC for bulk CSV first; residential proxy fallback
- WI (Salesforce SPA): Wisconsin open records request first (legally enforceable)

**Headless browser harness ROI:**
26 scrapers blocked by JS rendering or WAF. One shared Playwright + residential proxy runner unblocks them all. Build cost ~20–30 dev hours. NAA Find-an-Auctioneer alone (5,000+ national auction house records, currently JS-blocked) justifies the investment.

---

## Push Block

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

# Step 1: Restore corrupted NE + WY files (NOT all of sources/)
git checkout -- packages/backend/src/services/scraper/sources/nebraskaPhase2Scraper.ts `
    packages/backend/src/services/scraper/sources/wyomingLicensingScraper.ts `
    .github/workflows/scrape-ne-phase2.yml `
    .github/workflows/scrape-wyoming-licensing.yml

# Step 2: Stage the 4 fixed scrapers + wrap docs
git add packages/backend/src/services/scraper/sources/kentuckyPhase2Scraper.ts
git add packages/backend/src/services/scraper/sources/indianaPhase2Scraper.ts
git add packages/backend/src/services/scraper/sources/mainePhase2Scraper.ts
git add packages/backend/src/services/scraper/sources/alabamaPhase2Scraper.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md

# Step 3: Commit + push
git commit -m "fix: KY/IN/ME/AL phase2 scrapers restored from dead URLs/broken parsers/timeouts (S954)"
.\push.ps1
```

**After push:** Go to GitHub Actions → manually trigger `scrape-kentucky-phase2`, `scrape-indiana-phase2`, `scrape-maine-phase2`, `scrape-alabama-phase2` via `workflow_dispatch` to confirm they run without errors. Kentucky especially — if it returns 0 records with no error, the ASP.NET control IDs need adjusting (page source will show the real field names).

---

## Open Patrick Actions

| Action | Priority | Notes |
|--------|----------|-------|
| Push the 4 scraper fixes (block above) | HIGH | |
| Update GitHub Actions `DATABASE_URL` secret | HIGH | Settings → Secrets → Actions → DATABASE_URL → Railway public proxy URL. HERE Places + DB scrapers fail until done. |
| AlternativeTo listing | HIGH | https://alternativeto.net/about/add-software/ — 10 min, free, immediate. MaxSold already indexed there. |
| Searlo credit upgrade | Optional | $3.99+ lifts the 10/min cap; bump `SEARLO_RPM` variable after |
| Product Hunt launch prep | Medium | 2–3 week runway needed; Claude can draft all assets |

---

## Session S953 Summary — Email Infrastructure Audit + Forwarding Fix

**Type:** INFRA/OPS — full email-address audit, ImprovMX forwarding fix, Resend suppression cleanup
**BQ:** 1 (unchanged)

| Problem | Fix | Status |
|---------|-----|--------|
| legal@/privacy@/info@/contact@/receipts@ silently dropping | You added 5 missing ImprovMX aliases + catch-all | ✅ verified forwarding to Gmail |
| Resend had suppressed legal@/privacy@/info@ from earlier bounce-tests | Removed from Resend suppression list + deleted 4 DB rows | ✅ all deliver + forward |

Rule: never test @finda.sale addresses via Resend/app — use ImprovMX's per-alias TEST button. Gmail auto-files support mail under FindASale/Support label (unread).

---

## Session S951 Summary — Scheduled-Task Audit + Scraper Diagnosis

**Type:** RECORDS/AUDIT
**BQ:** 1 (unchanged)

3 real backend fixes were already committed + live but missing from docs: Google Maps billing lockdown (529f4ee7), scraper/email hardening + 65-workflow DB pre-flight (ed5c020e), outreach null-safe GSF fix (bd6e6967).

Scraper diagnosis: 16 of 132 workflows failing. 4 fixable (done S954), 5 dead (covered by other scrapers), 5 need infra.
