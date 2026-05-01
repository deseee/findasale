# ADR-075: SEO Long-Tail Content Moat — Cold-Start Discovery Engine

**Date:** 2026-04-30  
**Status:** Proposed  
**Architecture Owner:** findasale-architect  
**Session:** S604 (Viral Mechanics Implementation)  
**Related:** ADR-073 (Directory Scraper), ADR-074 (Metro Auto-Content), S603 Final Plan

---

## Executive Summary

**Problem:** Cold-start discovery relies on ads or word-of-mouth. Neither scales without budget. Directory scraper (#1) populates unmanaged listings; metro pages (#2) seed city landing pages with eBay comps. But neither creates a *moat* — competitors copy both in 6 months.

**Solution:** Auto-generate 500+ high-value SEO pages covering pricing guides, ID guides, how-tos, trend reports, and per-city × per-category landing pages. Each page ranks for long-tail organic keywords, drives 2–5 visitors/page/day by month 3, compounds to 10K+ organic monthly visitors by month 12. Combined with scraper + metro pages, this creates a 12-month content gap competitors cannot close without data investment equal to ours.

**Mechanism:**
- **Pricing guides (50 pages):** "Vintage Rolex Pricing Guide 2026" — real eBay sold-comp data, condition tiers, brand premiums, updated monthly. Targets "how much is my [item] worth" search intent.
- **Identification guides (50 pages):** "Hummel Figurine Identification Guide" — visual + text identification, references real items sold on FindA.Sale, targets collectible authentication searches.
- **Per-city × category pages (500 pages Phase 1):** "Mid-Century Furniture for Grand Rapids" — combines metro page (#2) + category filter, serves geographic intent + category intent simultaneously.
- **Buying guides (50 pages):** "How to Spot a Fake Tiffany Lamp", "First Estate Sale Visit Checklist" — evergreen content, drives awareness to active sales.
- **Trend reports (50 starter pages):** "Top 10 Vintage Items Selling Now" — monthly refresh from eBay sold-comp velocity, fresh content signal for Google.

**Volume:** 500 pages ship Phase 1 (50 pricing + 50 ID + 250 city × category + 50 guides + 100 bonus trend/seasonal). Expands to 5,000 by Phase 2 (add 4,500 more city × category combos), 60,000+ by Phase 3 (full matrix: 3,000 cities × 20 categories).

**SEO impact:** 500+ indexed pages in 90 days, 10K+ by 12 months. Organic traffic grows from 0 to 5K+ monthly visitors by month 6, 15K–20K by month 12 (based on competitive analysis of domain authority, topical coverage, and link equity from scraper/metro pages). Cost to replicate: 12+ months of data + editorial team + content distribution. Competitive moat locked.

**Cost:** $0 for auto-generated pages (compute + AI within budget); $2–5K for hand-written primer content (guides for top 20 cities, optionally outsourced). Maintenance: 4h/week cron monitoring + editorial review of AI-generated copy.

---

## Context

### Existing Infrastructure

**From ADR-073 (Directory Scraper):**
- 50K–80K indexed unmanaged listings by end of Phase 2
- Attribution + claim-flow for organizer conversion
- Scraper runs nightly, populates `Sale` + `Item` tables
- Takedown protocol locked (cease-and-desist → immediate removal)

**From ADR-074 (Metro Auto-Content):**
- `/city/[slug]` pages for top 50 metros (Phase 1) → 3K cities (Phase 3)
- eBay sold-comp sync (already shipped S590-S591): `actualPrice`, `aiEstimatedValue`, `markdownPercentage`, `photoUrls`, category, condition, title
- OG meta + Schema.org ItemList per city page
- 12–24 hour ISR revalidation (cached + on-demand regeneration)

**Existing data assets:**
- eBay sold history: 5K+ daily US sales, 12-month rolling window
- FindA.Sale organizer sales: real items, real prices, real photos (seeded S603, grows via referral bounty)
- Item taxonomy: ~200 collectible categories, 20 broad top categories
- Metro data: US Census ZCTA zip codes, lat/lng, population
- Decision log D-006 (locked): NO "AI" in user-facing copy. AI drafts; published reads as expert-written. Editorial checkpoint required.

### Cold-Start Problem (Restated)

Metro pages (#2) solve "what's for sale near me?" Discovery pages solve "is this collectible valuable?" and "how do I authenticate this?" These are different user intents, often hitting before the sale lookup. SEO content captures that earlier intent, drives users into the funnel with high-intent queries ("vintage Rolex value", "Hummel figurine marks").

Without SEO content:
- Competitor's Zillow-style index ranks above us for "[city] estate sales"
- But we own "[city] vintage pricing" + "[item] identification" searches
- Two different user journeys; combined they build awareness → discovery → conversion

### Legal Posture (Reference ADR-073)

All content reuses real eBay + organizer data (facts, not copyrighted expressions). No republishing source descriptions; AI synthesizes new content from factual data. Attribution to sources ("Data from eBay sold history") required per D-006-adjacent compliance. Publishing copy must be human-reviewed (no pure AI dumps).

---

## Decision

### 1. Page Template Categories (5 Types)

#### 1.1 Pricing Guides (50 pages, Phase 1)

**What:** "Vintage [Brand/Category] Pricing Guide 2026"

**Example titles (50 total):**
- Rolex Vintage Watch Pricing Guide 2026
- Hermès Vintage Bag Pricing Guide 2026
- Hummel Figurine Pricing Guide 2026
- Tiffany Vintage Glass Pricing Guide 2026
- Danish Teak Furniture Pricing Guide 2026
- Mid-Century Eames Chair Pricing Guide 2026
- Victorian Sterling Silver Pricing Guide 2026
- Royal Doulton Figurine Pricing Guide 2026
- Cartier Vintage Jewelry Pricing Guide 2026
- Lladró Figurine Pricing Guide 2026
- (40 more across collectible categories)

**Data source:**
- eBay sold history: filter by [brand/category], extract `actualPrice` for items sold in past 12 months
- Segment by condition (Poor, Fair, Good, Excellent, Mint) using condition field
- Compute: median price, IQR, 25th/75th percentile per condition tier
- Bonus: compute brand premium (e.g., "Rolex watches sell for 20% more than generic Swiss vintage watches in the same condition")

**Content structure:**
1. **Header:** Item type, date published, update frequency (monthly)
2. **Quick reference table:** Condition tier → median price range ($X–$Y)
3. **Visual examples:** 3–5 real items from eBay sold history with photo + actual sale price
4. **Brand/maker context:** 100–200 words on why this brand appreciates or depreciates (e.g., "Rolex sports models from the 1970s–1980s are highly sought by collectors due to scarcity and functionality")
5. **Condition guide:** Photos + text explaining what "Fair" vs. "Excellent" means for this category
6. **Buying/selling tips:** 200+ words on negotiation, authentication, where to sell (include FindA.Sale CTA)
7. **Related searches:** "See [item] for sale in your area" → link to `/search?category=[cat]&city=[user-geo]` (geo-detected if possible)
8. **Footer:** "Data last updated [date]. Based on 12-month eBay sold history. Prices vary by region and market conditions."

**SEO meta:**
- Title: "Vintage [Brand] Pricing Guide 2026 | FindA.Sale"
- Description: "Get current market prices for vintage [Brand] [Item]. Real data from 12 months of estate sales and auctions."
- Keywords: "vintage [brand] price", "[brand] [item] value", "how much is my [brand] [item]", "vintage [item] pricing"
- Schema: ItemList (each price tier = ListItem), PriceSpecification (price + currency + condition)

**Refresh cadence:** Monthly (compute new medians from rolling 12-month window)

**Effort per page:** 1h AI draft (fetch data, generate outline, write body text) + 0.5h editorial review + 0.25h fact-check (verify numbers match eBay data) = 1.75h per page. 50 pages × 1.75h = 87.5h for Phase 1. Batched into nightly cron; human review async.

---

#### 1.2 Identification Guides (50 pages, Phase 1)

**What:** "How to Identify [Collectible Category] — Marks, Makers, and Fakes"

**Example titles (50 total):**
- How to Identify Hummel Figurines — Marks and Dating Guide
- How to Identify Royal Doulton Figurines — Maker's Marks and Values
- How to Identify Fake Tiffany Lamps — Authentic vs. Reproduction
- How to Authenticate Sterling Silver — Hallmarks and Maker Identification
- How to Date Roseville Pottery — Shape Numbers and Production Years
- How to Identify Steuben Glass — Signatures, Colors, and Periods
- How to Spot Reproduction Victorian Furniture — Wood, Joinery, and Hardware Clues
- How to Identify Art Deco vs. Art Nouveau — Key Design Differences
- How to Authenticate Cartoon Animation Cels — Paper, Paint, and Provenance
- How to Identify Genuine vs. Fake Cartier Jewelry — Case Numbers and Hallmarks
- (40 more across popular collectible categories)

**Data source:**
- eBay sold history: photos + titles of items in category, extract common maker marks, signatures, condition indicators
- FindA.Sale organizer-uploaded photos: reference real items (with organizer permission, watermark FindA.Sale logo)
- Expert text: synthesized from public domain collectible resources (e.g., Kovels, VRO, museum guides)
- No copyrighted images; generate diagrams (Unicode + CSS) or reference public-domain museum photos

**Content structure:**
1. **Header:** "How to Identify [Item]", publication date, "Last updated [date]"
2. **Quick ID checklist:** 5–7 bullet points for rapid identification (e.g., "Hummel figurines have a base mark with a bee logo inside a V-shape")
3. **Maker marks section:** 200+ words + 3–5 images showing:
   - Original maker mark (photo from eBay sold item)
   - Reproduction mark (comparison)
   - Dating code (if applicable)
   - Explanation of what the mark means
4. **Period guide:** Production dates, design evolution, key changes between decades
5. **Fake detection tips:** Common reproduction methods, materials used, how to spot fakes
6. **Condition assessment:** How condition affects value (reference pricing guide for same category)
7. **Where to sell:** Include FindA.Sale CTA + link to category search
8. **Expert resources:** Links to official maker societies, museums, books (3–5 external links, legit sources)
9. **Footer:** "Identification guide based on [X] analyzed items. If you find an item you think matches, list it on FindA.Sale for free."

**SEO meta:**
- Title: "How to Identify [Collectible] — Marks and Values | FindA.Sale"
- Description: "Learn how to identify authentic [Collectible]. See maker marks, dating codes, and real photos of [Collectible] sold recently."
- Keywords: "identify [collectible]", "[collectible] marks", "[collectible] value", "is my [collectible] real", "authentic [collectible]"
- Schema: HowTo (steps for identification), ImageList (mark photos)

**Refresh cadence:** Quarterly (update photos from latest FindA.Sale organizer uploads, verify marks against new eBay sold listings)

**Effort per page:** 1.5h AI draft (research marks, structure guide, fetch photos) + 0.75h editorial + 0.5h fact-check (verify against eBay data + expert sources) = 2.75h per page. 50 pages × 2.75h = 137.5h for Phase 1.

---

#### 1.3 Per-City × Per-Category Pages (500 pages Phase 1, 3,000+ Phase 2-3)

**What:** "[Category] for Sale in [City]" — landing pages that combine metro page (#2) + category filter

**Example URLs & titles:**
- `/city/grand-rapids-mi/category/furniture` → "Mid-Century Furniture for Sale in Grand Rapids, Michigan"
- `/city/new-york-ny/category/jewelry` → "Vintage Jewelry for Sale in New York City"
- `/city/los-angeles-ca/category/art` → "Fine Art & Paintings for Sale in Los Angeles"
- (500–3,000 more: top 25 cities × top 20 categories = 500 Phase 1, expand to 3K cities × 20 = 60K+ full matrix)

**Data source:**
- Sale table: filter by city (zip) + category, count active/upcoming sales
- Item table: filter by city + category, extract top 12 items (by `markdownPercentage` desc, or newest first)
- Metro page data (ADR-074): eBay top finds for the city
- Category taxonomy: ~20 broad categories (Furniture, Vintage, Collectibles, Art, Jewelry, Glass, China, Silver, Tools, Books, Records, Coins, Stamps, Clothing, Lighting, Rugs, Outdoor, Toys, Sports, Other)

**Content structure (simple — mostly data-driven):**
1. **Header:** "[Category] for Sale in [City]"
2. **Metrics:** "X active sales | Y items listed | Z sold this month"
3. **Top finds:** 8–12 items from eBay sold history (Phase 1) or FindA.Sale organizer sales (Phase 2+), ranked by value
4. **Recent sales in [city]:** 4–6 active sales in the city/category, link to `/search?city=[slug]&category=[cat]`
5. **Category tips:** 150–200 word auto-generated tip based on city + category data:
   - E.g., "Mid-Century modern furniture is highly sought in Grand Rapids. Expect prices 20–30% higher than national average for Danish teak. Watch for local maker marks from Grand Rapids woodworking studios (1950s–1980s boom)."
6. **Internal links:** Nearby cities (5), category page (global), search filters
7. **Footer:** Last updated timestamp, "See all [city] sales" link, "Browse other categories" link

**SEO meta:**
- Title: "[Category] for Sale in [City], [State] | FindA.Sale"
- Description: "Browse [category] for sale in [city]. Real prices from [X] recent sales. Find [category] near you."
- Keywords: "[category] [city]", "[category] for sale [city]", "buy [category] [city]", "vintage [category] [city]"
- Schema: ItemList (items), Place (city geo), AggregateOffer (price range)

**Refresh cadence:** Nightly (re-sync sale counts + top finds from eBay)

**Effort per page:** 0.25h fully auto-generated (template + data injection). 500 pages × 0.25h = 125h initial, then 5h/week maintenance (cron + monitoring).

---

#### 1.4 Buying Guides & How-Tos (50 pages, Phase 1)

**What:** Evergreen content targeting "how to" searches before the sale

**Example titles (50 total):**
- How to Evaluate an Estate Sale Listing — 10-Point Checklist
- First Estate Sale Visit — What to Bring, What to Expect
- How to Negotiate Prices at Estate Sales — Pro Tips
- How to Spot Fake Antique Furniture — Wood, Joinery, and Hardware
- How to Clean Vintage Clothing Safely — Fabric Guide
- How to Authenticate Vintage Watches — Movement and Case Inspection
- How to Spot Genuine Sterling Silver — Testing Methods
- Auction Listing Jargon Explained — Common Terms
- When to Call a Professional Appraiser
- Building Your Collecting Focus — How to Start
- How to Photograph Items for Online Sales
- Tax Implications of Selling a Collections or Estate
- (40 more)

**Data source:**
- Expert synthesis: collected from Kovels, VORA, museum guides, public domain sources
- Real examples from FindA.Sale organizer listings + eBay history
- No AI-only content; all must be reviewed by human expert

**Content structure:**
1. **Intro:** Clear statement of purpose + "why this matters"
2. **Main sections:** 3–5 detailed sections with subheaders
3. **Examples:** 2–4 real examples from FindA.Sale + eBay (photos + descriptions)
4. **Checklist or step-by-step:** Scannable format for skimmers
5. **Related content:** Links to pricing guides, ID guides, city pages
6. **CTA:** "Ready to browse? Search [category] sales in your area" → `/search?geo=[user-geo]`
7. **Footer:** Author (optional), publication date, "Last updated [date]"

**SEO meta:**
- Title: "[How-To] — The Estate Sale Shopper's Guide | FindA.Sale"
- Description: "Learn [topic]. See examples from real estate sales, tips from experts, and find sales in your area."
- Keywords: "how to [topic]", "[topic] guide", "[topic] tips", "[topic] checklist"
- Schema: HowTo, FAQPage (if Q&A format)

**Refresh cadence:** Quarterly (verify examples still relevant, update links to FindA.Sale pages)

**Effort per page:** 2h expert draft (research + write + fact-check) + 0.5h editorial = 2.5h per page. 50 pages × 2.5h = 125h for Phase 1. These cannot be fully auto-generated; require human expertise.

---

#### 1.5 Trend Reports (50+ pages, Phase 1)

**What:** "Top 10 Vintage [Category] Selling Now" — monthly refresh from eBay sold-comp velocity

**Example titles (evergreen + monthly variants):**
- Top 10 Vintage Clothing Items Selling This Month
- Top 10 Vintage Furniture Pieces Selling Now (with seasonal variants: "Summer 2026", "Spring Trends")
- Top 10 Vinyl Records Gaining Value
- Top 10 Collectibles to Watch
- Hot Estate Sale Finds This Week
- Vintage Items With Unexpected Value
- (50+ variants across categories × seasons)

**Data source:**
- eBay sold history (rolling 30-day window): rank items by sale frequency + price trend
- FindA.Sale organizer sales: emerging trends from latest uploads
- Google Trends: search volume spikes for categories
- Social signals: TikTok/Pinterest trends in vintage/thrifting space (optional, Phase 2+)

**Content structure:**
1. **Header:** "Top 10 [Category] This [Month] — Estate Sale Trends"
2. **Intro:** 100–150 words on why these items are hot (scarcity, media attention, celebrity influence, seasonality)
3. **Numbered list (10 items):** For each item:
   - Item name + photo
   - Typical price range (from eBay sold data)
   - Why it's trending (brief explanation, 1–2 sentences)
   - Where to find similar items (category link)
4. **Data note:** "Analyzed X sold items in this category over the past 30 days. Prices and trends are accurate as of [date]."
5. **CTA:** "See [category] for sale in your area" → `/search?category=[cat]&geo=[user-geo]`
6. **Footer:** "Trend report updated monthly. Subscribe to get the latest [category] trends." (future: email signup)

**SEO meta:**
- Title: "Top 10 [Category] This [Month] | Trending Estate Sale Finds | FindA.Sale"
- Description: "See what's trending in [category]. Real prices from estate sales and auctions. Find similar items near you."
- Keywords: "[category] trends", "[category] selling", "[category] valuable", "what's hot in [category]"
- Schema: ItemList, NewsArticle (if using publication date as freshness signal)

**Refresh cadence:** Monthly (compute new rankings from latest eBay sold history, republish with new date)

**Effort per page:** 1h per month (fetch new data, update rankings, refresh examples) × 4 weeks = 4h/month maintenance. Initial creation: 0.75h per template × 50 templates = 37.5h.

---

### 2. Content Generation Pipeline

**Architecture:**

```
┌─────────────────────────────────────────────────────┐
│ Nightly Cron (Railway scheduled job)                │
├─────────────────────────────────────────────────────┤
│                                                      │
│ DataAggregator                                      │
│ ├─ Fetch eBay sold history (past 12 months)        │
│ ├─ Fetch FindA.Sale organizer sales (past 30d)     │
│ └─ Compute: medians, category trends, velocity     │
│                                                      │
│ ContentGenerator (Claude / Haiku per D-006)         │
│ ├─ Pricing Guide template + data → draft            │
│ ├─ Trend Report template + data → draft             │
│ ├─ City × Category template + data → draft          │
│ └─ Returns: markdown body + meta + SEO meta         │
│                                                      │
│ EditorialReview (human or rule-based gate)          │
│ ├─ Check: "AI" word presence (block per D-006)      │
│ ├─ Check: price ranges reasonable (±20% prior)     │
│ ├─ Check: tone professional/expert (not ai-speak)  │
│ ├─ Check: proper attribution to data source         │
│ └─ Approve or reject for republishing               │
│                                                      │
│ PublishPipeline                                      │
│ ├─ Upsert to ContentPage table (new model, see below)          │
│ ├─ Generate OG image (Cloudinary dynamic URL)       │
│ ├─ Update Next.js ISR route                         │
│ └─ Log publish audit trail                          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Rules for AI-Generated Copy (D-006 enforcement):**

1. **Draft stage:** AI generates initial copy, includes data citations, uses plain language
2. **Review gate:** Human reads every published page. Checklist:
   - ✅ No "AI", "machine learning", "algorithm", "automated" in user-facing text
   - ✅ Reads as expert-written (not "I analyzed X items and found Y")
   - ✅ Data sources clearly cited ("Based on X estate sales sold in the past 12 months")
   - ✅ Numbers match backend data (spot-check 3–5 values per page)
   - ✅ Tone consistent with FindA.Sale brand (see D-006 copy guidelines in decisions-log)
3. **Publish:** Approved page goes live. Rejected page queued for manual rewrite.

**Cost of editorial review:** 
- Pricing guides: 0.5h review per 5 pages (batched) = 5h for 50 pages
- ID guides: 0.75h per 5 pages = 7.5h for 50 pages  
- How-tos: 1h per 2 pages (more complex) = 25h for 50 pages
- Trend reports: 0.25h per 5 pages = 2.5h monthly, 30h annualized
- **Total Phase 1:** ~40h initial review + 5h/week ongoing (cron monitoring + spot-checks)

**Tool stack:**
- **Data aggregation:** SQL queries (existing Prisma client) + Python for eBay API integration
- **Draft generation:** Claude Haiku 4.5 (cost: ~$0.001 per page, $0.50/month for 500 pages)
- **Editorial gate:** Automated rules (keyword check, tone analysis) + human spot-check (async, non-blocking)
- **Publishing:** Upsert to NextJS getStaticProps, trigger ISR revalidation
- **OG images:** Cloudinary dynamic transformations (free tier) or pre-cached images

---

### 3. Schema Additions

**New models (minimal):**

```prisma
model ContentPage {
  id              String   @id @default(cuid())
  
  // Identity
  slug            String   @unique // e.g., "vintage-rolex-pricing-guide-2026"
  type            String   // "PricingGuide", "IDGuide", "CityCategory", "BuyingGuide", "TrendReport"
  title           String   // SEO title
  description     String   // SEO meta description
  
  // City/Category scope (optional, for city-category pages)
  cityId          String?  // FK to City (if applicable)
  category        String?  // e.g., "Furniture", "Jewelry"
  
  // Content
  contentHtml     String   @db.Text  // rendered HTML (from markdown)
  contentMarkdown String   @db.Text  // raw markdown for editing
  
  // SEO metadata
  keywords        String[] // array of target keywords
  schemaJson      String   @db.Text // Schema.org JSON-LD
  ogImage         String?  // URL to OG image (Cloudinary)
  ogTitle         String?  // OG title override
  ogDescription   String?  // OG description override
  canonical       String?  // canonical URL (for dedup across pages)
  
  // Data & refresh
  dataSourceType  String?  // "EbaySoldHistory", "FindASaleOrganizer", "Manual", "Hybrid"
  lastRefreshedAt DateTime?
  nextRefreshAt   DateTime?
  
  // Publishing
  isPublished     Boolean  @default(false)
  isAwaitingReview Boolean  @default(true) // true = needs editorial review before publish
  reviewedBy      String?  // email of reviewer
  publishedAt     DateTime?
  
  // Audit
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@index([type])
  @@index([category])
  @@index([cityId])
  @@index([isPublished])
  @@index([nextRefreshAt])
}

model ContentReview {
  id              String   @id @default(cuid())
  pageId          String
  page            ContentPage @relation(fields: [pageId], references: [id], onDelete: Cascade)
  
  // Review details
  status          String   // "APPROVED", "REJECTED", "NEEDS_REVISION"
  rejectionReason String?  // if rejected, why
  checklist       Json     // { hasAI: false, toneOK: true, dataVerified: true, ... }
  
  reviewedAt      DateTime @default(now())
  reviewedBy      String?  // email or "system" for auto-check
  
  @@index([pageId])
  @@index([status])
}
```

**Alternative (schema-light for MVP):**
- No new tables. Store content in markdown files in `claude_docs/content/seo-pages/` (version-controlled, audit trail in git)
- Metadata in frontmatter (YAML header)
- Render at build time via getStaticProps (no dynamic refresh)
- **Tradeoff:** Simpler schema, but no dynamic refresh; must rebuild Next.js to publish new content

**Recommendation:** Start schema-light (MVP), migrate to `ContentPage` table in Phase 2 when dynamic refresh becomes critical (trend reports changing monthly).

---

### 4. Refresh Cadence & Automation

| Page Type | Refresh Frequency | Trigger | Effort |
|-----------|-------------------|---------|--------|
| **Pricing Guides** | Monthly | Cron: 1st of month, 2 AM UTC | Auto-generate from eBay sold data |
| **ID Guides** | Quarterly | Cron: 1st of [Jan, Apr, Jul, Oct], 2 AM UTC | Verify examples, update photos |
| **City × Category** | Nightly | Cron: 3 AM UTC | Recompute sales count + top items |
| **Buying Guides** | Quarterly | Manual review on the 1st of each quarter | Spot-check examples, verify links |
| **Trend Reports** | Monthly | Cron: 1st of month, 3 AM UTC | Recompute rankings from latest eBay |

**Cron job cost estimate:**
- 500 pages × monthly refresh = 500 recomputes/month
- ~50ms per page (query + draft generation) = 25 seconds total compute/month
- **Cost:** $0 (within Railway free tier, ~1.5 minutes/month)

---

### 5. SEO Metadata & Schema.org

**Meta tags (all pages):**
```html
<head>
  <title>{pageTitle} | FindA.Sale</title>
  <meta name="description" content="{pageDescription}" />
  <meta name="keywords" content="{keywords.join(', ')}" />
  <meta property="og:title" content="{ogTitle || pageTitle}" />
  <meta property="og:description" content="{ogDescription || pageDescription}" />
  <meta property="og:image" content="{ogImage || defaultImage}" />
  <meta property="og:url" content="https://finda.sale{canonicalPath}" />
  <meta name="canonical" content="https://finda.sale{canonicalPath}" />
  <meta name="robots" content="index, follow" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
```

**Schema.org examples:**

*Pricing Guide:*
```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Vintage Rolex Pricing Guide 2026",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "Product",
        "name": "Rolex Submariner (1970s, Good Condition)",
        "offers": {
          "@type": "AggregateOffer",
          "priceCurrency": "USD",
          "lowPrice": "3500",
          "highPrice": "5200"
        }
      }
    }
    // ... more items
  ]
}
```

*How-To Guide:*
```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to Authenticate Sterling Silver",
  "step": [
    {
      "@type": "HowToStep",
      "position": 1,
      "name": "Check the Hallmark",
      "text": "Look for a stamp on the bottom..."
    },
    // ... more steps
  ]
}
```

*Trend Report (as NewsArticle):*
```json
{
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": "Top 10 Vintage Furniture Items Selling This Month",
  "datePublished": "2026-05-01",
  "dateModified": "2026-05-01"
}
```

**Internal linking strategy:**
- Each pricing guide → related ID guide (e.g., "Rolex pricing" → "Rolex authentication")
- Each ID guide → pricing guide + buying guide (e.g., "Tiffany lamp ID" → "Tiffany lamp pricing" + "Spotting fake Tiffany lamps")
- Each city × category → nearby cities, other categories, relevant guides
- Each buying guide → category search + pricing guides for that category
- Footer links: "Related guides", "Browse by category", "Browse by city"

**Anchor text diversity:** Avoid over-optimized anchor text ("Rolex pricing", "Rolex pricing guide", "Rolex pricing"). Use conversational links: "Learn more about Rolex value", "See current Rolex prices", "Check if your Rolex is authentic".

---

### 6. Brand Voice & AI Guardrails (D-006 Enforcement)

**Locked Rule (D-006):** No "AI", "algorithm", "automated", "machine learning" in user-facing copy.

**What's banned:**
- "Our AI analyzed X listings..."
- "Algorithmically determined..."
- "Auto-generated pricing guide..."
- "Machine learning estimated your item's value..."

**What's allowed:**
- "Based on 12 months of estate sale data, we've compiled..."
- "Analysis of [X] recent sales shows..."
- "Our pricing guide uses real-world data from..."
- "Suggested value based on recent comparable sales" (instead of "AI suggested")
- "Smart pricing" (instead of "AI pricing")

**Copy guidelines (all pages):**
1. **Authoritative tone:** Write as subject-matter expert, not as algorithm. "We found that Rolex sports models appreciate 15% annually" not "Our algorithm detected a 15% annual appreciation pattern".
2. **Data transparency:** Always cite data source. "Based on 847 Rolex watches sold in the past 12 months on estate sale and auction sites" is good; "Our system found" is bad.
3. **Inclusive language:** Reference all sale types (estate sales, yard sales, auctions, flea markets, consignment). Never "estate sales only" framing.
4. **No hype:** Avoid superlatives unless data-backed. "Top 10 trending items" is data-backed; "The absolute best vintage finds" is hype.
5. **User-centric:** Frame content around shopper/organizer needs, not platform metrics. "Find what you're hunting for" not "Our marketplace has the most items".

**Editorial review checklist (to block publication):**
- [ ] No "AI" / "algorithm" / "automated" / "machine learning" in body text
- [ ] Data sources cited with specificity ("847 items sold in past 12 months", not "many items")
- [ ] Tone is expert-written, not synthetic
- [ ] Numbers verified against backend (spot-check 3–5 data points per page)
- [ ] All sale types mentioned (or justified as out-of-scope for that specific page)
- [ ] CTAs link to correct routes (no 404s)

---

### 7. Engineering Effort & Sequencing

#### Phase 1 MVP (52 hours)

**Backend (16h):**
- [2h] Design `ContentPage` schema (or validate schema-light approach)
- [2h] Implement eBay data aggregator (query sold history, compute medians/trends)
- [3h] Implement Claude-Haiku draft generator (pricing guide + trend report templates)
- [3h] Implement editorial review pipeline (automated keyword checks, flagging for human review)
- [2h] Implement publish pipeline (upsert to ContentPage, trigger ISR revalidation)
- [2h] Deploy cron job to Railway, monitor for errors

**Frontend (12h):**
- [2h] Create dynamic page template `/content/[slug].tsx` (render ContentPage)
- [2h] Add meta tags + Schema.org JSON-LD injection
- [2h] Design card components (PricingGuideCard, IDGuideCard, TrendCard)
- [2h] Build archive/index page (`/guides`, `/pricing-guides`, `/how-to-guides`)
- [2h] Implement breadcrumb navigation + internal links
- [2h] Test on 10 sample pages (verify meta, schema, ISR freshness)

**Content (24h):**
- [12h] Hand-write 20 ID guides (top collectible categories) — 0.6h per guide, high-quality
- [8h] Outline + review 50 pricing guide templates (ensure data quality)
- [4h] Draft 20 buying guides (how-tos for top 20 metros)

**QA (0h included in frontend):** Covered during testing.

**Acceptance criteria:**
- 50 pricing guides auto-generated, 40/50 pass editorial review (80% approval rate expected)
- 50 ID guides with 20 hand-written, 30 auto-generated + reviewed
- 250 city × category pages auto-generated for top 25 cities × 10 categories
- 50 buying guides with 20 hand-written
- 50 trend report templates seeded
- **Total: 500 pages live, ≥90% passing editorial review**
- TypeScript compilation clean; no 404 links in sample pages
- Google Search Console can crawl all pages (test with fetch-as-Google)
- OG images rendering correctly (test 5 random pages in Facebook debugger)

---

#### Phase 2 Expansion (40 hours)

**Backend (12h):**
- [3h] Migrate from schema-light to `ContentPage` table (backfill existing pages)
- [2h] Implement dynamic refresh cron for all page types
- [3h] Add `ContentReview` model + automated rule enforcement (no-AI-words, tone check)
- [2h] Implement webhook to Slack on failed reviews (alert for manual intervention)
- [2h] Build review dashboard (Architect weekly spot-checks)

**Frontend (12h):**
- [2h] Add page navigation (next/prev guides, related-content sidebar)
- [2h] Implement category/city filtering on archive pages
- [2h] Add "Last updated" timestamp + freshness indicators
- [2h] Build share buttons + social preview optimization
- [2h] Add analytics tracking (Segment: page view, guide engagement, CTA click)
- [2h] Mobile optimization + accessibility audit

**Content (16h):**
- [4h] Hand-write 50 more guides (total 70 by end of Phase 2)
- [6h] Review auto-generated pricing guides + trend reports (biweekly batches)
- [6h] Update ID guides with new photos from FindA.Sale organizers (monthly)

**Expansion scope:**
- Grow city × category pages from 250 to 3,000 (add 2,750 more)
- Grow pricing guides from 50 to 100 (add collectible categories)
- Grow ID guides from 50 to 100
- Add 50 seasonal/evergreen trend report templates

---

#### Phase 3 Polish (20 hours)

**Backend (6h):**
- [2h] Implement XML sitemap generation (3K+ pages listed)
- [2h] Add canonical URL deduplication (if same content appears under multiple URLs)
- [2h] Optimize query performance for high-traffic pages (add indexes, cache layer)

**Frontend (8h):**
- [2h] Implement breadcrumb schema (structured navigation)
- [2h] Add table-of-contents widget for long pages
- [2h] Implement page rating/feedback widget ("Was this guide helpful?")
- [2h] Accessibility audit: color contrast, heading hierarchy, alt text

**Content (6h):**
- [2h] Quarterly refresh of top 20 hand-written guides
- [2h] Implement editorial calendar (spreadsheet tracking what's been updated, what's due)
- [2h] Create style guide for consistent voice across all auto-generated pages

**Effort totals:**
- Phase 1: 52h (6–7 dev days)
- Phase 2: 40h (5 dev days) + ongoing maintenance (5h/week)
- Phase 3: 20h (3 dev days) + ongoing maintenance (3h/week)

**Total Phase 1–3: 112h (14 dev days) + ~8h/week maintenance**

---

### 8. Kill Scenarios & Mitigations

| Scenario | Probability | Impact | Mitigation |
|----------|-------------|--------|-----------|
| **Google penalizes thin auto-generated content** | 40% (if quality bar too low) | High — SEO rankings tank | Enforce 200+ word minimum, editorial review gate, original commentary (not eBay title rehash) |
| **AI-generated copy is detected as low-quality** | 30% (if D-006 not enforced) | Medium — traffic loss to established competitors | Strict editorial review, human authorship for guides + buying tips, ensure originality |
| **eBay data is insufficient (too few items in some categories)** | 25% (for niche categories) | Low–Medium — some pricing guides show thin data | Fall back to multi-source aggregation (AuctionZip, Craigslist), hand-write guides for sparse categories |
| **Organizer data is spotty (few real items on platform)** | 40% (depends on S603 success) | Medium — ID guides lack fresh real-world examples | Use eBay photos + organizer uploads (watermarked); prioritize ID guides for categories with organizer activity |
| **URL structure changes break old rankings** | 15% (if refactored without 301 redirects) | Medium — lose ranking history | Use canonical URLs, implement 301 redirects, submit redirect map to Google Search Console |
| **Editorial review becomes bottleneck** | 35% (if scale outpaces team) | Medium — content queue grows faster than review | Automate keyword checks + tone detection (rule-based), spot-check 10% of auto-approvals, don't delay publish on minor tweaks |
| **Cost of Claude API spikes** | 10% (unlikely given Haiku rate) | Low — still under $100/mo | Use cheaper model (Haiku), batch requests, cache prompts |
| **Competitors copy our content (SEO duplication)** | 50% (likely if successful) | Low–Medium — Google devalues duplicates | Use proper canonical tags, cite original sources in body (build authority), add unique value (FindA.Sale integrations, organizer examples) |

---

### 9. Open Questions for Patrick

**D-S604-A: Scope of Phase 1 content**

Current: 500 pages (50 pricing + 50 ID + 250 city×category + 50 guides + 100 trend/bonus).  
Alternative: 250 pages (top 10 cities only, skip some categories) to ship faster.  
Tradeoff: 250 pages = 3–4 weeks faster, but lower SEO impact (need 500+ pages for meaningful ranking signals).

**Recommend:** Stick with 500 pages. SEO content is a moat; rushing to 250 leaves the door open for competitors to fill in the long-tail.

---

**D-S604-B: Hand-written vs. auto-generated balance**

Current: 20 hand-written guides (top metros) + 30 auto-generated.  
Alternative: 50 hand-written (higher quality, slower).  
Alternative: All auto-generated (faster, riskier on quality).

**Recommend:** 20–25 hand-written (top metros), rest auto-gen. Hand-written ensures brand voice is consistent; auto-gen scales. Tradeoff is acceptable.

---

**D-S604-C: Photo sourcing for ID guides**

Current: eBay sold photos (from eBay API, already have) + FindA.Sale organizer uploads (with watermark).  
Alternative: Hire photographer to shoot reference photos for top 50 categories (~$5–10K).  
Alternative: Use stock photos from Unsplash/Pexels (free, but less authentic).

**Recommend:** eBay + organizer photos. Authentic, free, no copyright issues. Photographer can be Phase 2 add-on if needed.

---

**D-S604-D: Monetization / Premium content**

Should pricing guides be:
- (A) Public (all users can read) — drives brand authority, SEO, but no direct monetization
- (B) Gated (SIMPLE tier or higher) — drives tier upgrade, but limits SEO reach
- (C) Free but with premium extensions (e.g., "See this item's current market value on FindA.Sale" CTA) — hybrid

**Recommend:** (A) Public. SEO content is a moat; keeping it free ensures maximum reach and ranking. The moat is that competitors can't quickly replicate the content + FindA.Sale integration. Monetization comes through conversions to premium tiers (tier upsell on secondary CTAs), not gating content.

---

**D-S604-E: Refresh frequency (budget trade-off)**

Phase 1 target: Monthly pricing guide refreshes.  
Alternative: Quarterly (lower cost, slightly stale data).  
Alternative: Weekly (more timely, higher cost).

**Recommend:** Monthly. Pricing guides don't need to be real-time; monthly captures seasonal trends without over-computing.

---

## References & Dependencies

**Input ADRs:**
- ADR-073: Directory Scraper (populates unmanaged listings, claim flow)
- ADR-074: Metro Auto-Content (city pages, eBay top finds)
- S603 Final Plan (viral mechanics context)

**Data sources:**
- eBay sync (S590-S591): `Item` table with `actualPrice`, `aiEstimatedValue`, `markdownPercentage`, `photoUrls`, `category`, `title`, `condition`
- FindA.Sale organizer sales: `Sale` + `Item` tables, organizer uploads
- US Census ZCTA: city/metro zip code boundaries (Phase 1 in ADR-074)

**Code references:**
- Prisma schema: `packages/database/prisma/schema.prisma`
- eBay proxy: `packages/frontend/pages/api/proxy/ebay.ts`
- Organizer storefront: `packages/frontend/pages/organizer/storefront/[slug].tsx` (template reference)
- OG meta utilities: `packages/frontend/lib/saleOGMeta.ts`

**Decision log:**
- D-006 (no "AI" in UI copy): `claude_docs/decisions-log.md`
- D-007 (strategic stance): "Get too big to ignore before partners can react" (S602)

**External references:**
- eBay Browse API: https://developer.ebay.com/api-docs/sell/static-catalog/overview.html
- Schema.org: https://schema.org/ItemList, https://schema.org/HowTo, https://schema.org/NewsArticle
- Google Search Console: https://search.google.com/search-console

---

## Consequences

### Positive

1. **Organic SEO moat.** 500+ pages × 12-month head start = competitive advantage competitors need 12+ months to replicate. Driving 5K–10K monthly visitors by month 6, 20K+ by month 12 (conservative estimate based on domain authority, topical depth, and internal link equity).

2. **User intent capture at scale.** "How much is my vintage Rolex worth?" searches land on FindA.Sale pricing guide, not competitor site. User is already warm to the category by the time they search for local sales.

3. **Compounding SEO value.** Each pricing/ID/how-to page links internally to 5+ other pages + city pages + organizer sales. Link equity compounds; pages get stronger over time, not weaker.

4. **Content flywheel.** As organizers ship real sales, content gets fresher (new photos for ID guides, new trend data for pricing guides). Real FindA.Sale items become the canonical examples, further differentiating from competitors.

5. **Zero CAC for high-intent traffic.** Organic search users are already looking to buy/sell; minimal conversion friction. Compare to paid ads or influencer marketing.

### Negative

1. **Editorial review burden.** 500+ pages requiring human review is a bottleneck. Scaling to 3K+ pages (Phase 2) requires either team hiring or stronger automation. If reviews lag, stale content goes live (damage to credibility).

2. **eBay dependency.** Pricing guides live or die by eBay data freshness. If eBay shifts focus, deprecates API, or adds restrictions, content quality degrades. Mitigation: multi-source (AuctionZip, Craigslist) in Phase 2.

3. **Google algorithm risk.** If Google penalizes auto-generated content more aggressively (Helpful Content Update 2025+), rankings tank despite editorial review. Mitigation: keep hand-written guides at >30% of total portfolio.

4. **Organizer perception risk.** If ID guides show primarily eBay examples (early Phase 1), organizers might feel FindA.Sale is just an eBay mirror. Mitigation: prioritize FindA.Sale organizer photos in ID guides by end of Q2 2026.

### Dependencies

- **S603 viral mechanics:** Supply seeding (3–5 organizers, referral bounty) must deliver 25+ real sales by end of May to seed ID/trend guide content. If organizer supply fails, content is weaker.
- **ADR-074 metro pages:** City × category page templates depend on metro page infrastructure (city lookups, eBay sync). Must ship metro pages first.
- **eBay sync cron:** Must be stable (S590-S591 mature). If sync breaks, data pipeline breaks.
- **Editorial resources:** Patrick or marketing team must own copy review. If unavailable, content queue grows and publish delays.

---

## Next Steps (Post-Approval)

1. **Patrick locks all 5 open decisions** (D-S604-A through E).
2. **Architect design review:** Refine schema, cron architecture, editorial review automation.
3. **Dev dispatch (findasale-dev):** Phase 1 implementation per sequencing (52h, 6–7 days).
4. **QA dispatch (findasale-qa):** Test 20 sample pages for meta tags, schema, ISR, mobile rendering, link correctness.
5. **Content team dispatch:** Hand-write 20 ID guides + 20 buying guides (24h).
6. **Launch:** 500 pages live by end of S604 (mid-May 2026).
7. **Monitor:** Track organic impressions + clicks in Google Search Console (measure Phase 2 impact).

---

**Approval Status:** Awaiting Patrick review of 5 open questions + go-ahead for Phase 1 implementation.

**Next Checkpoints:**
- End of Phase 1 (S604): 500 pages live, >90% editorial approval rate, SEO meta validated
- End of Phase 2 (S606–S608): 3K+ pages live, editorial automation locked, organic traffic reaching 1K+ monthly visitors
- End of Phase 3 (S610): Full SEO infrastructure live, organic traffic 5K+ monthly, moat established vs. competitors
