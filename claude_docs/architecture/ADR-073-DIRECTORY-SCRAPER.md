# ADR-073: Directory Scraper — Cold-Start Sales Aggregation

**Date:** 2026-04-30  
**Status:** Proposed  
**Architecture Owner:** findasale-architect  
**Session:** S603 (Viral Mechanics Planning)

---

## Context

FindA.Sale faces a **cold-start problem:** organizers won't join a platform with no listings, and shoppers won't visit a platform with no inventory. Traditional solutions (paid acquisition, founder hustle, influencer marketing) are cost-prohibitive and require users that don't yet exist.

**The Zillow Play:** Zillow indexed every real-estate listing in the US before a single homeowner uploaded their property. The index became the distribution network. Agents joined *because* their properties were already visible. FindA.Sale can execute the same strategy by scraping public secondary-sale listings from competitors and aggregators, seeding the platform with hundreds of thousands of indexed sales, then converting organizers via the **Claim-This-Listing** flow (shipped S601).

**Existing infrastructure to compose with:**
- `Sale` and `Item` Prisma models with `isUnmanagedListing: boolean` and `Organizer.isClaimed: boolean` (S601, `packages/database/prisma/schema.prisma`)
- `ClaimRequest` model + POST `/organizers/:id/claim` endpoint + `ClaimListingModal.tsx` frontend (S601)
- Vercel proxy pattern at `packages/frontend/pages/api/proxy/ebay.ts` to bypass IP blocks and DNS issues
- eBay sync flowing sold-comps into `Item` table for price intelligence
- OG meta + watermarking infrastructure for shareable cards (S599)
- Per-city URL structure for SEO crawlability

**Result:** A comprehensive directory that drives organic SEO traffic while converting organizers at claim-time.

---

## Decision

### 1. Data Sources (Ranked by Feasibility + Value)

| Source | Type | Coverage | Scraping Technique | Refresh Cadence | Legal Risk | Value Score |
|--------|------|----------|-------------------|-----------------|-----------|------------|
| **EstateSales.NET** | Directory | ~80% of US estate sales | HTML parse + Puppeteer (JS-heavy) | Daily (metro-by-metro) | **HIGH** — paid placements, litigious | 95 (most comprehensive) |
| **EstateSales.org** | Directory | ~15% of US estate sales (different operator) | HTML parse | Daily | MEDIUM — similar business model | 85 |
| **Craigslist** (estate sales section) | Classifieds | ~30% (metro-dependent, fast turnover) | HTML parse + rotating UA | Hourly (metro crawl) | **HIGH** — explicitly forbids scraping; CFAA enforced | 75 (high traffic, litigious) |
| **AuctionZip** | Auction aggregator | ~40% of US auctions | API (if available) or HTML parse | Daily | MEDIUM — less aggressive than EstateSales | 70 |
| **GarageSaleFinder.com** | Yard sale directory | ~20% of US yard sales | HTML parse | Daily | LOW — minimal enforcement | 65 |
| **Yard Sale Treasure Map** | Yard sale crowdsource | ~10% of US yard sales | HTML parse or RSS | Daily | LOW — community-driven | 60 |
| **Facebook Marketplace** | Social commerce | Uncapped; unlisted estates, private sales | **BLOCKED** — not scrapable (requires login, anti-bot enforced) | N/A | **CRITICAL** — ToS + legal enforcement | 80 (blocked) |
| **Local newspapers** | Classifieds | ~5% per metro (declining) | HTML parse or Google CSE structured data | Weekly | LOW-MEDIUM (copyright on text) | 30 |

**Strategic prioritization:**
- **Phase 1 MVP:** EstateSales.NET only, Grand Rapids metro (proof-of-concept, 400–600 live sales at any time)
- **Phase 2:** EstateSales.NET + AuctionZip, expand to 10 metros (Chicago, Denver, Phoenix, Atlanta, etc. — high sale frequency)
- **Phase 3:** Add Craigslist (with explicit takedown protocol) + GarageSaleFinder + secondary sources

**Why NOT Facebook:** Requires login auth, actively blocks bots (Cloudflare + JavaScript challenges), claims listings under their ToS, shares zero structured data. Technical and legal cost too high; value too low.

---

### 2. Scraping Infrastructure

#### **Architecture**

```
┌──────────────────────────────────────────────────────────────┐
│ Railway Scheduled Job (Node.js, pnpm workspace)              │
│ ├─ CronJob (pm2 or node-schedule)                            │
│ │  ├─ MetroQueue (Grand Rapids, then Chicago, etc.)         │
│ │  └─ SourceQueue (EstateSales, Auctions, Craigslist, ...)  │
│ │                                                             │
│ ├─ ScrapeOrchestrator (packages/backend/jobs/scraper)        │
│ │  ├─ Source Adapters (packages/backend/jobs/adapters)      │
│ │  │  ├─ EstateSalesAdapter (HTML parse + Puppeteer)        │
│ │  │  ├─ CraigslistAdapter (rotating proxies)               │
│ │  │  ├─ AuctionZipAdapter (API parse)                      │
│ │  │  └─ [one per source]                                    │
│ │  │                                                         │
│ │  └─ ImportPipeline                                         │
│ │     ├─ Dedup (sourceName + sourceUrl → existing Sale?)    │
│ │     ├─ Validate (required fields: date, address, items)   │
│ │     ├─ Transform (normalize dates, parse addresses)       │
│ │     ├─ Bulk insert or upsert to Sale + Item tables        │
│ │     └─ Log ScrapedSalesJob (audit trail)                  │
│ │                                                             │
│ └─ DeadLetterQueue (failed items, ToS blocks, errors)        │
│    └─ Manual review or auto-retry after 48h                 │
│                                                             │
├─ Vercel Proxy Layer (optional — for IP blocking only)        │
│  └─ packages/frontend/pages/api/proxy/[source].ts           │
│     (route scraper requests through Vercel if needed)       │
│                                                             │
└─ PostgreSQL (existing Railway DB)                            │
   ├─ Sale table (existing, reuse isUnmanagedListing)         │
   ├─ Item table (existing, add source_name, source_url)      │
   └─ ScrapedSalesJob table (audit, retry metadata)           │
```

#### **Implementation details**

**Proxy Strategy:**
- **Default:** Direct from Railway backend (no proxy cost)
- **Fallback:** Vercel proxy pattern (like `ebay.ts`) if IP gets blocked mid-crawl
  - Path: `packages/frontend/pages/api/proxy/scraper/[source].ts`
  - Routes requests through Vercel's IP pool to evade bans
  - Adds ~200ms latency per request; use only when necessary
- **Escalation:** Third-party proxy service (Bright Data, ScrapFly) only if Vercel exhausted
  - Cost: $50–200/mo for residential rotation
  - Used only after both Railway and Vercel blocked

**Headless Browser (Puppeteer):**
- **When:** EstateSales.NET, Craigslist, other JS-heavy sites
- **Cost:** ~0.3s per page load, ~$2–5/mo for compute (Railway already paying)
- **Pool:** 2–3 concurrent instances, queue overflow to dead-letter
- **Timeout:** 15s per page; fail-fast to DLQ if exceeded

**Scheduling:**
- **EstateSales.NET:** 00:00 UTC daily (all metros in serial, ~2h total)
- **Craigslist:** 06:00 and 18:00 UTC daily (estate sales section only)
- **AuctionZip:** 03:00 UTC daily
- **GarageSaleFinder:** 09:00 UTC daily
- Each job runs independently; failures do not block others

**Retry & Dead-Letter:**
- **Transient errors** (timeout, 503): exponential backoff, max 3 retries over 24h
- **Permanent errors** (410 Gone, 451 Unavailable, ToS block): send to DLQ, alert Slack
- **DLQ review:** Architect spot-checks weekly; escalates to Patrick if source is dead

**Cost Estimate (Monthly):**
| Item | Cost | Notes |
|------|------|-------|
| Railway compute (scraper job) | $0 (within included hours) | ~2h/day = 60h/mo, well under 600h Railway free tier |
| Puppeteer (headless browser) | $2–5 | Marginal; already in Railway |
| Vercel proxy (optional) | $0 (included) | Serverless calls stay free tier unless DDoS-ish traffic |
| Third-party proxy (escalation only) | $50–200 | Only if multiple sources blocked simultaneously |
| **Total** | **$52–205** | **Most likely $2–5/mo baseline** |

---

### 3. Legal Posture (Critical)

#### **Terms of Service Audit**

| Source | ToS Scraping Clause | Fair-Use Defense | Attribution Required | Takedown Risk | Recommendation |
|--------|---------------------|------------------|----------------------|---------------|-----------------|
| **EstateSales.NET** | "No scraping without written permission" | Weak (curated, copyrighted descriptions) | Yes (required) | **VERY HIGH** — they sue | Block 24h on request; get written permission first if possible |
| **EstateSales.org** | "No automated access" | Weak | Yes (required) | HIGH | Same as above |
| **Craigslist** | "No scraping" + CFAA enforcement | **Depends on hiQ ruling (2022)** — public facts (address, price, date) may be fair use; descriptions are copyrighted | Minimal ("Reposted from Craigslist") | **VERY HIGH** — litigious, have sued scrapers | Proceed with caution; test with 1% sample first; implement instant 24h takedown |
| **AuctionZip** | "No scraping without permission" | Moderate (auction data is mostly public facts) | "Auction hosted on AuctionZip" | MEDIUM | Seek API access first; fallback to scraping with attribution |
| **GarageSaleFinder** | Silent (no explicit ToS) | Strong (public facts, user-generated) | Optional but recommended | LOW | Safe to scrape; include attribution as courtesy |
| **Yard Sale Treasure Map** | Silent | Strong (crowdsourced, facts) | Optional | LOW | Safe; community-driven, unlikely enforcement |
| **Newspapers** | Copyright on text | Weak for copyrighted descriptions | Required | MEDIUM | Use Google CSE structured data only; do not republish article text |

#### **Legal Mechanics**

**Public facts vs. copyrighted expressions:**
- **Facts (safe):** addresses, dates, sale type (estate, yard, auction, flea market, consignment), opening times, approximate item categories
- **Expressions (copyrighted):** descriptions ("Beautiful Victorian home with period details…"), photos, listings text, seller contact copy

**Implementation rule:** 
- Scrape facts; do NOT republish seller descriptions or photos from the original source
- If a description exists in source, DO NOT copy it; use AI to auto-generate a neutral summary or ask organizer to edit after claim
- Photos: Same as description — do NOT mirror; if organizer claims listing, they must re-upload or provide license

**Attribution UX:**
- Every unmanaged listing shows: "Listed on [Source Name]. Verified and managed by its organizer (claim it below)."
- Link to original source optional but recommended (drives legitimacy)
- Example: "Originally listed on EstateSales.NET"

**Takedown protocol:**
1. Cease-and-desist letter → STOP scraping that source immediately (same day)
2. Implement host/domain block list in scraper config
3. Set 24h auto-removal of all listings from that source (bulk delete via `Sale.sourceUrl LIKE` query)
4. Email organizers who claimed listings from blocked source: "This source was removed; your listing remains active"
5. Alert Patrick in Slack; document in decisions-log

**DMCA registration:**
- Register a designated agent with US Copyright Office ($6/year + one-time filing fee ~$45)
- Reduces liability if a third-party copyright holder files DMCA against FindA.Sale (moves liability to the source data, not us)
- Name: FindA.Sale LLC, registered agent: Patrick [last name], email: legal@finda.sale

**Risk mitigation:**
- Start with **lowest-risk sources** (GarageSaleFinder, Treasure Map, AuctionZip API)
- Test EstateSales + Craigslist with 1% sample (e.g., Grand Rapids only) for 2 weeks before expansion
- Monitor Slack alerts for blocks; have kill-switch ready (disable scraper via feature flag)
- Build good-faith relationship: if EstateSales.NET threatens, offer to remove their data + link to them as the authoritative source

**What Patrick must understand:**
- Scraping aggressive sites (EstateSales.NET, Craigslist) WILL result in cease-and-desist letters
- Being named publicly as "the scraper of Craigslist" is reputationally risky (Craigslist is litigious and vocal)
- DMCA registration protects us legally but does not stop takedowns — it just makes fighting them cheaper
- **There is no zero-risk play here.** The trade-off is: index fast (viral flywheel) vs. negotiate permissions (slow, expensive). You chose index-fast.

---

### 4. Schema Additions

**Reuse existing models (preferred):**

The `Sale` and `Item` models already have:
- `isUnmanagedListing: boolean` (S601 — set `true` for scraped listings)
- `organizerId: Int?` (nullable until claim, then populated)
- `Organizer.isClaimed: boolean` (tracks if the organizer took ownership)

**Add minimal new fields to `Sale`:**
```prisma
model Sale {
  // existing fields ...
  
  // Scraper metadata (new)
  sourceUrl       String?         // "https://estatesales.net/sales/12345"
  sourceName      String?         // "EstateSales.NET", "Craigslist", etc.
  lastScrapedAt   DateTime?       // when this listing was last validated/updated from source
  scrapeVersion   Int?            // version of scraper that ingested this (for audit/rollback)
  scrapedMetadata Json?           // arbitrary JSON: original_title, original_address, etc. (for dispute resolution)
}

model Item {
  // existing fields ...
  
  sourceItemId    String?         // e.g., "estatesales.net:item:67890" (dedupe key)
}

// NEW: Audit trail for scraping jobs
model ScrapedSalesJob {
  id              Int             @id @default(autoincrement())
  source          String          // "EstateSales.NET"
  metro           String          // "Grand Rapids, MI"
  startedAt       DateTime        @default(now())
  completedAt     DateTime?
  status          String          // "PENDING", "RUNNING", "SUCCESS", "PARTIAL_FAILURE", "FAILED"
  
  itemsFound      Int             @default(0)
  itemsCreated    Int             @default(0)
  itemsUpdated    Int             @default(0)
  itemsSkipped    Int             @default(0) // existing listings, deduplicated
  itemsFailed     Int             @default(0)
  
  error           String?         // if failed, the error message
  logUrl          String?         // link to Railway logs
  
  @@index([source, createdAt])
}
```

**No migration yet** — architecture review only. Dev agent will generate migration in next session if Patrick approves this spec.

---

### 5. Claim Conversion Flow (Integration)

**Existing claim infrastructure (S601):**
- `ClaimRequest` model + POST `/organizers/:id/claim` endpoint + `ClaimListingModal.tsx` frontend
- Claim changes `Sale.organizerId` and sets `Sale.isUnmanagedListing = false`
- Organizer gains full edit rights (price, description, photos, items)

**Scraper → Claim integration:**

```
┌─ Shopper discovers scraped listing via search/city page
│
├─ Listing UI shows "Listed on EstateSales.NET"
│
├─ Organizer recognizes their own sale (matching address, date)
│
└─ Clicks "Claim This Listing" (existing modal)
   ├─ Email verification (optional: "we detected your email in the original listing")
   ├─ Phone or address verification
   └─ On success:
      ├─ organizerId populated
      ├─ isUnmanagedListing = false
      ├─ organizer gains edit rights
      └─ sourceUrl + sourceName preserved (for audit)
```

**Proactive conversion (email outreach):**
- When scraper ingest finds an email in source listing (e.g., "Contact Jane at jane@example.com"), send:
  - "We've indexed your sale on FindA.Sale. Click here to claim it for free and get unlimited reach."
  - Link: `/organizers/claim?email=jane@example.com&saleId=123`
  - Prefill email + sale in ClaimModal
  - Reduces claim friction from "who are you and how did you get my listing?" to "yes, that's me"
- Send on Day 1 (after scrape), Day 3 (reminder), Day 7 (final reminder)
- Tracked via ClaimRequest.emailSentAt, ClaimRequest.emailOpenedAt (if email has tracking pixel — optional)

**Conversion rate estimate:**
- **Baseline (self-discovery):** 3–5% of unmanaged listings claimed over 6 months
- **With proactive email:** 8–15% over 6 months (roughly 3–4x lift)
- **Target:** 100 claimed listings by end of Q3 2026 (indicates product-market fit)

---

### 6. SEO + Content Strategy Implications

**Indexing structure:**
- Each scraped sale = its own URL: `/sales/[saleId]` (existing)
- Dynamic OG meta (S599 carryover) generates share cards with:
  - Sale title + date + address
  - Item count + category breakdown (computed)
  - Organizer name (if claimed) or source name (if unmanaged)
  - Photo (from organizer upload, or placeholder if unmanaged)

**URL strategy for SEO depth:**
- City landing page: `/sales?city=Grand+Rapids&type=estate` (aggregates all sales in metro)
- Category landing: `/sales?category=Furniture&city=Grand+Rapids`
- Calendar view: `/sales?date=2026-05-15&city=Grand+Rapids` (by weekend, by date)
- Organizer storefront: `/organizers/[organizerId]` (once claimed, surfaces all their sales)

**Internal linking:**
- Each sale page → city page → metro category pages → organizer storefront
- Each city page → "Claim your sale here" CTA (targets organizers discovering their scraped listing)

**Content deduplication (important for SEO):**
- If same sale listed on multiple sources (e.g., EstateSales.NET + Craigslist), detect duplicates and merge:
  - Merge by: (address + date) OR (phone + email + date)
  - Canonical URL: oldest sourceUrl (first-scraped wins)
  - Preserve metadata from all sources (for dispute resolution)
  - Prevent duplicate-content penalty from Google

**Google Search Console:**
- Submit sitemaps for city/category/date landing pages
- Monitor coverage; flag unindexed pages to architect

---

### 7. Engineering Effort + Sequencing

#### **Phase 1 MVP (Weeks 1–2, ~40h)**
**Scope:** EstateSales.NET only, Grand Rapids metro, basic claim flow

**Deliverables:**
- Scraper scaffold: `packages/backend/jobs/scrapers/estatesales.ts`
- EstateSalesAdapter: HTML parse + Puppeteer
- ImportPipeline: dedup, validate, insert to Sale + Item
- ScrapedSalesJob audit table + schema migration
- Cron trigger in Railway
- Slack alerts (success, failures, DLQ)
- City landing page: `/sales?city=Grand+Rapids` (aggregate unmanaged listings)

**Acceptance criteria:**
- 400–600 live estate sales in Grand Rapids (EstateSales.NET current inventory)
- Shopper can search/filter by type, date, area
- Organizer can click "Claim This Listing" and take ownership
- TS compilation passes; no runtime errors
- Scraper runs daily at 00:00 UTC, completes in <30min

**Risk:** EstateSales.NET might block IP mid-testing → have Vercel proxy ready

#### **Phase 2 Expansion (Weeks 3–4, ~80h)**
**Scope:** 4 more sources, 10 metros, email outreach

**Deliverables:**
- AuctionZipAdapter (API parse if available, else HTML parse)
- CraigslistAdapter (with rotating proxies, takedown protocol)
- GarageSalesFinderAdapter (HTML parse, lowest risk)
- YardSaleTreasureMapAdapter (RSS + HTML fallback)
- Metro expansion: Chicago, Denver, Phoenix, Atlanta, Austin, Seattle, Portland, Nashville, Raleigh, Dallas
- Proactive email outreach (SendGrid integration or existing email service)
- ScrapedSalesJob dashboard (Architect spot-check weekly)
- DeadLetterQueue review workflow + Slack routing

**Acceptance criteria:**
- 10 metros × 4 sources = 40,000–80,000 indexed sales
- Claim email outreach: sending daily to detected email addresses
- Zero unhandled errors in production logs (all errors → DLQ or alert)
- Rotation through sources complete: no single source down >2 days
- Architect reviews job audit log weekly; escalates blocks to Patrick

**Risk:** Multiple sources might escalate enforcement → have kill-switch feature flag ready

#### **Phase 3 Polish (Week 5, ~40h)**
**Scope:** Legal hardening, UX polish, SEO optimization

**Deliverables:**
- DMCA agent registration + legal.md documenting protocol
- Takedown email template + auto-removal pipeline
- OG meta + watermarking for unmanaged sales (S599 carryover)
- Canonical URL deduplication (same sale scraped from 2 sources)
- Google Search Console sitemaps (city/category/date landing pages)
- Dashboard: scraper status, job history, claim conversion rate (for Patrick)
- Remove feature flag (safe to remove killswitch if no escalations)

**Acceptance criteria:**
- All 4 major sources scraped successfully without legal escalation after 2 weeks
- Claim conversion rate tracking (email open rate, claim rate)
- Legal protocol documented; Patrick can execute takedown in <1h
- SEO crawl shows 10k+ pages indexed (sales + city/category/date pages)
- Zero manual intervention required weekly (fully automated)

**Total effort:** ~160h (4 dev weeks FTE)

---

### 8. Kill Scenarios (Risk Mitigation)

| Scenario | Probability | Impact | Mitigation |
|----------|------------|--------|-----------|
| **EstateSales.NET cease-and-desist** | 70% (they aggressively protect paid placements) | High — lose largest source (60% of value) | Stop scraping immediately; offer to link to them as "authoritative source"; negotiate permission or API access |
| **Craigslist CFAA enforcement / legal threat** | 50% (they sue scrapers, though hiQ 2022 ruling helps) | Medium-High — reputational + legal cost | Implement instant 24h removal; test with 1% sample first; be prepared to kill this source entirely |
| **Cloudflare / anti-bot escalation across multiple sources** | 40% (becomes costlier over time) | Medium — move to paid proxies (Bright Data, ScrapFly) | Budget $50–200/mo proxy cost; implement Vercel fallback; test with low-frequency schedule (daily → every 3 days) |
| **Google penalizes duplicate content (same sale × 2 sources)** | 30% (if canonical URLs not set up correctly) | Medium — SEO rankings tank | Implement merge logic + canonical URL per sale; verify in Search Console; monitor Core Web Vitals |
| **Public PR backlash (small business owners angry)** | 25% (unlikely if attribution clear) | Medium — social media backlash | Attribution prominent in UI ("Listed on [Source]"); claim flow emphasizes organizer ownership; pivot messaging to "we help organizers reach more shoppers" |
| **Cost overruns ($1K/mo proxy fees for residential rotation)** | 15% (only if ALL sources escalate simultaneously) | Low-Medium — impacts burn rate | Prioritize free sources (GarageSaleFinder, YardSale, AuctionZip API); kill expensive sources if cost exceeds $200/mo |
| **Scraper blocked across all sources simultaneously** | 10% (catastrophic, unlikely) | Critical — feature dead | Feature flag ready for instant kill; fallback to manual organizer directory submission form |

---

## Alternatives Considered

### **Alt 1: Paid creator acquisition (rejected)**
- Approach: Hire 10 creators to list 50 sales each (500 listings in 4 weeks)
- Cost: $500/creator × 10 = $5,000
- Timeline: 4 weeks
- **Rejected because:** No money, no users to convert, manually un-scalable after Phase 1. Founders-first signals "no distribution."

### **Alt 2: Founder hustle (rejected)**
- Approach: Patrick manually finds 100 estate sales, builds relationships, soft-launches in Grand Rapids
- Cost: ~40h work + travel
- Timeline: 8 weeks
- **Rejected because:** Doesn't scale to viral. Building relationships is slow; scraping is fast. Index first, convert second.

### **Alt 3: Partner API access (rejected)**
- Approach: Negotiate API access with EstateSales.NET, AuctionZip, etc.
- Cost: Revenue share or subscription fee (likely $500–2000/mo)
- Timeline: 2–3 months (legal negotiation)
- **Rejected because:** No budget for fees; negotiation timeline too long; scraping gives unilateral control (can't be negotiated away).

### **Chosen: Scraper-first (this spec)**
- Cold-start via indexing (Zillow model)
- Fast (weeks), cheap ($5/mo baseline), unilateral (no partner dependency)
- Risk: Legal escalation (mitigated by takedown protocol)
- Upside: Viral flywheel (index → shoppers → claims → organizers)

---

## Consequences

### **Positive**

1. **Cold-start solved in weeks, not months.** 40k–80k listings by end of Phase 2. Shoppers see a real directory; conversion probability jumps from "ghost town" to "maybe I should list my sale here."

2. **Viral distribution without paid acquisition.** Organic search for "estate sales near me" lands on FindA.Sale city pages; organizers discovering their scraped listing convert at 8–15% (with email outreach). This scales without customer acquisition cost.

3. **Claim flow becomes the primary organizer onboarding.** Instead of "convince me to sign up," it's "recognize your sale, claim it." Friction drops; conversion rate improves.

4. **SEO ranking potential.** 50k+ indexed pages (sales × cities × categories × dates) + backlinks from source sites = strong Google ranking for "estate sales [city]" keywords. Captures search volume at zero CAC.

5. **Price intelligence at scale.** Aggregate item prices from 50k+ estate sales + eBay comps = high-confidence pricing suggestions for organizers. Competitive moat.

### **Negative**

1. **Legal liability.** Cease-and-desist letters from EstateSales.NET, Craigslist, others are certain. You must accept being named publicly as "the scraper." Requires legal groundedness and PR preparedness.

2. **Operational burden.** Weekly DLQ review, source rotation monitoring, takedown execution, DMCA registration, legal letters. Not zero-touch; requires governance.

3. **Platform reputation risk.** If scraping is perceived as "stealing listings," early adopter organizers might resent FindA.Sale. Mitigated by clear attribution + strong claim flow UX, but risk exists.

4. **Data quality risk.** Scraped listings may be incomplete, outdated, or inaccurate. Organizer claim + re-upload mitigates this, but frontend must be ready for "messy" unmanaged listings.

5. **Vendor lock-in on sources.** If EstateSales.NET (80% of value) shuts us down, the viral loop breaks. Mitigation: diverse source portfolio (4+ sources) so no single source is critical.

---

## Open Questions for Patrick

1. **Legal comfort level:** Are you prepared for cease-and-desist letters? If yes, are you comfortable having FindA.Sale publicly named as a "scraper"? (Required to proceed with EstateSales.NET + Craigslist sources.)

2. **Email outreach permission:** If scraper detects an organizer's email in a listing, should we proactively email them to claim? (Drives 3–4x higher claim conversion but requires GDPR/CAN-SPAM compliance.)

3. **Photo handling:** Scraped listings will have no photos initially. Should unmanaged listings show a placeholder, or should we run a fallback (e.g., try to find a photo on Google Images for the address)? (Impacts UX and legal exposure.)

4. **Tier-gating:** Should unmanaged listings be visible to FREE organizers, or only to SIMPLE/PRO? (Trade-off: visibility vs. exclusivity incentive for premium tiers.)

5. **Monetization:** Does the claim flow convert organizers to paying tiers, or is the first claim free? (Affects unit economics of the viral loop.)

6. **Timeline:** Can dev team start Phase 1 next week (start of S604)? Requires ~40h with current team capacity.

---

## Referenced Files (for Dev Agent)

- **Schema:** `packages/database/prisma/schema.prisma` (Sale, Item, ClaimRequest, Organizer models)
- **Claim endpoint:** `packages/backend/src/controllers/organizerController.ts` (POST /organizers/:id/claim)
- **Claim frontend:** `packages/frontend/components/modals/ClaimListingModal.tsx`
- **Proxy pattern:** `packages/frontend/pages/api/proxy/ebay.ts` (template for scraper proxy routes)
- **OG meta:** `packages/frontend/lib/saleOGMeta.ts` (S599 carryover for sale share cards)
- **Scheduled jobs pattern:** `packages/backend/jobs/` (if exists; architecture for cron jobs)

---

**Architecture owner:** findasale-architect  
**Approval gate:** Patrick sign-off on legal comfort + email outreach permission
