# Patrick's Dashboard — S622 WRAP

## Status: 🟢 Contact email scraping pipeline live | Enrichment Phase 2 deployed | Scraper attribution fixed

**Headline:** S622 fixed the root cause of the 84-organizer problem (ingest was routing all named-organizer listings to the system account), cleaned up 5,833 misattributed sales, and shipped enrichment Phase 2 — the pipeline now scrapes organizer websites for contact emails and stores the ESN company page URL as a last-resort outreach channel. DB should be visible to Claude VM after Patrick's reboot.

---

## 🎯 Your Pending Actions (in priority order)

| Priority | Action | Deadline | Notes |
|----------|--------|----------|-------|
| **P1** | Run ESN scraper (GitHub Actions) | ASAP | Rebuilds the ~5,833 deleted sales under correct per-company organizers. Go to GitHub → Actions → Scrape EstateSalesNet → Run workflow. |
| **P1** | Run Enrichment Backfill with `all=true` | After scraper finishes | GitHub Actions → Enrichment Backfill → select `all=true` → Run. Populates contactEmail + esnCompanyPageUrl on all organizer records. |
| **P1** | Add `GOOGLE_PLACES_API_KEY` Railway env var | ASAP | Railway dashboard → findasale-backend → Variables. Required for phone/address/photo enrichment. |
| **P2** | Press release — fill `[Last Name]` ×3 + real cell | OVERDUE | `claude_docs/strategy/s603-pr-wire-blast-package.md` Version B. |
| **P3** | Review + send 19 outreach drafts in Gmail | When ready | Nick Loper, Codie Sanchez, NAA ×2, NASMM, ISA, NESA, Antique Trader, AntiqueWeek, 8 others |

---

## 📊 What Shipped This Session (S622)

### Root cause fix — 84-organizer problem
The `ingestScrapedListing` function was checking the `organizerId` parameter first, before `organizerName`. This caused all ESN listings (which pass `systemOrganizerId` as a fallback) to ignore the `organizerName` field entirely and route to the system account. Fixed: `organizerName` now always wins; `organizerId` is the fallback for listings with no named organizer.

### Data cleanup
5,833 scraped sales that were misattributed to the `FindA.Sale Directory` system organizer were deleted. After re-running the ESN scraper, they'll be recreated under the correct per-company organizer records.

### Enrichment Phase 2 — contact email discovery
New `contactEmail` field on Organizer. After ESN + Google Places enrichment, the pipeline now:
1. Fetches `{website}/contact`, `/contact-us`, `/about`, and homepage looking for `mailto:` links and bare email patterns
2. Falls back to scanning up to 20 scraped sale descriptions for embedded email addresses
3. Stores the first valid non-noreply email found as `contactEmail`

### ESN company page URL (last-resort outreach)
New `esnCompanyPageUrl` field. Populated from ESN `companyPageUrl` field during enrichment. Stored for use only when no other contact method (email, phone, website, social) is available. Not surfaced in primary outreach to avoid revealing we're sourcing from ESN.

### Contact priority ladder (for outreach)
1. `contactEmail` — scraped from their website
2. `phone` — from ESN or Google Places
3. `website` — direct contact form
4. `facebook` / `instagram`
5. `esnCompanyPageUrl` — last resort only

### Enrichment skip logic updated
Fully enriched orgs skip re-enrichment: `googlePlaceId AND NOT esnOrgId AND contactEmail`. Orgs with an `esnOrgId` always re-run to pick up the company page URL and any new data.

---

## 📦 Push Block — S622 wrap docs only

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md

git commit -m "docs: S622 wrap — contactEmail enrichment + scraper root cause fix + cleanup"
.\push.ps1
```

---

## 🔎 Pending Chrome QA

| Item | What to Test | Status |
|------|-------------|--------|
| **#361 Claim flow** | Login as user12 (shopper, `Seedy2025!`) → Sunrise Consignment storefront → amber banner → modal → submit → "Check Your Email" | ⏳ Pending |
| **#361 Verify page** | Get token from DB → navigate to `/claim/verify/{token}` → confirm success state | ⏳ Pending |
| **#356 Broadcast card** | Any organizer storefront with a broadcast → "Latest Update" card renders | ⏳ Pending |
| **#363 Buyer's Premium badge** | AUCTION sale on storefront → amber "Buyer's Premium: n%" pill | ⏳ Pending |
| **Tier Lapse plan card** | tier-lapse-test@example.com dashboard → plan card is amber when lapsed | ⏳ Pending |

---

## 🚦 Scraper Status

| Source | Status | Notes |
|--------|--------|-------|
| EstateSalesNet | ✅ Live — needs re-run | Attribution fix deployed. Re-run to rebuild sales under correct organizers. |
| Craigslist | ❌ Suspended | Datacenter IP block — don't trigger |
| Eventbrite | ⏳ Needs key | Add `EVENTBRITE_API_KEY` GitHub Secret |
| Newspaper/Oodle RSS | ✅ Wired | 02:00 UTC (no API key needed) |

## 🗂️ Organizer Contact Pipeline Status

| Field | Source | Status |
|-------|--------|--------|
| `phone` | ESN → Google Places | ✅ Live |
| `website` | ESN → Google Places | ✅ Live |
| `facebook` / `instagram` | ESN | ✅ Live |
| `contactEmail` | Website scrape → description parse | ✅ Deployed — runs on next backfill |
| `esnCompanyPageUrl` | ESN company-public-page API | ✅ Deployed — runs on next backfill |

**Test accounts:** `Seedy2025!` for all seed users. user1=Alice (TEAMS), user2=Bob (PRO), user11=Sunrise Consignment (unclaimed organizer), user12=primary shopper.
