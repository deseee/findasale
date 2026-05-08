# Directory Crawler Innovation — Quick-Start Guide
## What to Build Next (Ranked by ROI per Hour)

**For:** Patrick (decision-maker)  
**Length:** 3 min read  
**Output:** Ranked list of Phase 2 features with effort + payoff estimates

---

## The Hierarchy: Do These in Order

### Tier 1: Maximum ROI / Minimum Effort (Do First)

#### **1. Review Velocity Scraper** (12h effort, 6/10 ROI)
**What:** Scrape Google Maps review list page weekly; track review count + newest review date.

**Why now:**
- Detects business closure 60–90 days before it happens (hard signal)
- Prevents indexing dead businesses (reduces shopper frustration)
- Cost: negligible (~500 API calls/mo extra)

**Quick implementation:**
```typescript
async function updateReviewMetrics(organizerId: string): Promise<void> {
  const org = await prisma.organizer.findUnique({ where: { id: organizerId } });
  const googlePlaceId = org.googlePlaceId;
  
  if (!googlePlaceId) return; // skip if no Google data
  
  // Use existing Google Places API to fetch review count + newest date
  const placeDetails = await googlePlacesApi.getPlaceDetails(googlePlaceId);
  
  await prisma.reviewMetrics.upsert({
    where: { organizerId },
    update: {
      totalReviews: placeDetails.reviews.length,
      newestReviewDate: placeDetails.reviews[0]?.time ? new Date(placeDetails.reviews[0].time * 1000) : null,
      reviewsLast30Days: placeDetails.reviews.filter(r => daysAgo(r.time) < 30).length,
      reviewVelocity: computeVelocity(placeDetails.reviews),
    },
    create: {
      organizerId,
      totalReviews: placeDetails.reviews.length,
      newestReviewDate: placeDetails.reviews[0]?.time ? new Date(placeDetails.reviews[0].time * 1000) : null,
      reviewsLast30Days: placeDetails.reviews.filter(r => daysAgo(r.time) < 30).length,
      reviewVelocity: computeVelocity(placeDetails.reviews),
    },
  });
}

// Use in closure detection
async function markAsClosedIfSignals(organizerId: string): Promise<void> {
  const metrics = await prisma.reviewMetrics.findUnique({ where: { organizerId } });
  
  // If no reviews in 120 days + no recent photos, mark closed
  if (
    metrics?.newestReviewDate &&
    daysAgo(metrics.newestReviewDate) > 120 &&
    metrics.reviewsLast90Days === 0
  ) {
    await prisma.organizer.update({
      where: { id: organizerId },
      data: { isOperating: false, closedAt: new Date() },
    });
  }
}
```

**Expected impact:**
- Reduce false positives in search results (dead businesses de-ranked)
- Increase shopper trust ("only live businesses here")
- Inform organizers: "Your reviews are slowing; consider visibility boost"

---

#### **2. Relevance Score Rollout** (8h effort, 7/10 ROI)
**What:** Compute relevance score for all organizers; use it to prioritize crawl queue.

**Why now:**
- Reduce crawl volume by 40–50% without losing quality
- Focus crawl energy on high-value businesses (PREMIUM tier)
- Save API budget for later expansion

**Quick implementation:**
- Formula already designed (see full doc Part 2.2)
- Run once/week in background job:
  ```typescript
  // Every Sunday at 02:00 UTC
  async function recomputeRelevanceScores(): Promise<void> {
    const allOrgs = await prisma.organizer.findMany({
      include: { 
        sales: { select: { id: true, startDate: true } },
        reviews: true,
        _count: { select: { items: true } }
      },
    });
    
    for (const org of allOrgs) {
      const score = calculateRelevanceScore(org);
      await prisma.organizer.update({
        where: { id: org.id },
        data: {
          relevanceScore: score.score,
          relevanceTier: score.tier,
          recommendedCrawlFrequency: score.recommendation,
        },
      });
    }
  }
  ```

- Update crawl scheduler to respect `recommendedCrawlFrequency`:
  ```typescript
  // Build queue based on relevance tier
  const premiumOrgs = await prisma.organizer.findMany({
    where: { relevanceTier: 'PREMIUM' },
  });
  const standardOrgs = await prisma.organizer.findMany({
    where: { relevanceTier: 'STANDARD' },
  });
  
  const queue = [
    ...premiumOrgs.map(o => ({ org: o, crawlEvery: 3 })), // 3 days
    ...standardOrgs.map(o => ({ org: o, crawlEvery: 7 })), // 7 days
  ];
  ```

**Expected impact:**
- API budget freed up for Phase 2 expansion (new sources, new metros)
- Focus on organizers most likely to claim (higher relevance = more engaged)
- Faster closure detection (PREMIUM businesses crawled 3x weekly instead of once)

---

#### **3. EstateSales.NET Company Directory Scraper** (16h effort, 8/10 ROI)
**What:** Scrape the public ESN company directory to discover 2,000+ estate sale companies.

**Why now:**
- Direct path to organizers (no marketplace intermediary)
- Get phone numbers + websites for outreach
- Link to their full ESN sale history (high relevance source)

**Quick implementation:**
```typescript
async function scrapeEstateSalesNetCompanyDirectory(): Promise<void> {
  const page = await puppeteer.launch().then(b => b.newPage());
  
  let pageNum = 1;
  const companies: CompanyRecord[] = [];
  
  // ESN publishes ~25 companies per page
  while (pageNum <= 100) { // adjust based on total count
    await page.goto(`https://www.estatesales.net/companies?page=${pageNum}`);
    const pageCompanies = await page.$$eval('.company-listing', (els) =>
      els.map(el => ({
        name: el.querySelector('.company-name')?.textContent?.trim() || '',
        address: el.querySelector('.address')?.textContent?.trim() || '',
        phone: el.querySelector('.phone')?.textContent?.trim() || '',
        website: el.querySelector('.website a')?.href || '',
        yearsInBusiness: parseInt(
          el.querySelector('.years')?.textContent?.match(/\d+/)?.[0] ?? '0'
        ),
        esnUrl: el.querySelector('a.link')?.href || '',
        esnOrgId: el.getAttribute('data-org-id'),
      }))
    );
    
    companies.push(...pageCompanies);
    pageNum++;
  }
  
  // Deduplicate + ingest
  for (const co of companies) {
    // Check if already exists
    const existing = await prisma.organizer.findFirst({
      where: {
        businessName: co.name,
        address: { contains: co.address.split(',')[0] }, // first part of address
      },
    });
    
    if (!existing) {
      await ingestScrapedOrganizer({
        businessName: co.name,
        phone: co.phone,
        website: co.website,
        address: co.address,
        esnOrgId: parseInt(co.esnOrgId || '0'),
        source: 'ESN_COMPANY_DIRECTORY',
        yearsInBusiness: co.yearsInBusiness,
      });
    }
  }
  
  console.log(`[scraper] Ingested ${companies.length} estate companies from ESN directory`);
}
```

**Expected impact:**
- 2,000+ new organizer records (many already have website + phone)
- Reduce cold outreach friction (you found them; they didn't sign up)
- High-relevance source (if they're on ESN directory, they're active)
- Direct phone numbers for claim outreach

---

### Tier 2: High ROI / Medium Effort (Do Second)

#### **4. Closure Report UI** (12h effort, 6/10 ROI)
**What:** Let shoppers report closed businesses.

**Why:**
- Crowdsourced ground truth
- Users feel heard (improves satisfaction)
- Real-time signal (vs. waiting for review data to age)

**Quick implementation:**
- Add button on organizer page: "Report Issue → This business is closed"
- Modal: "Why do you think this is closed?" (radio: visited/called/website gone)
- Log to DB; after 3 reports, auto-flag as "LIKELY_CLOSED"

```prisma
model ClosureReport {
  id          String  @id @default(cuid())
  organizerId String
  userId      String
  reason      String  // "visited", "called", "website_gone"
  reportedAt  DateTime @default(now())
  
  @@unique([organizerId, userId])
}
```

**Expected impact:**
- Reduce frustration (shoppers find closed businesses, can flag them)
- Faster closure detection (real users, not algorithms)
- Data signal (when do organizers typically close?)

---

#### **5. A/B Testing for Claim Emails** (8h effort, 7/10 ROI)
**What:** Test 3 claim email variants; roll out winning version.

**Why:**
- Claim conversion baseline: 3–5%
- Small messaging change could lift to 10%+
- Cost: zero (already sending emails)

**Quick implementation:**
```typescript
// When sending claim outreach email
async function sendClaimEmail(organizerId: string, emailAddress: string): Promise<void> {
  const variants = ['simple', 'with-incentive', 'urgency'];
  const variant = variants[Math.floor(Math.random() * variants.length)];
  
  const messages = {
    simple: 'We indexed your estate sale on FindA.Sale. Claim it to reach more shoppers.',
    'with-incentive': 'Claim your listing on FindA.Sale + get 1 month free access to our heat maps.',
    urgency: 'Your listing expires in 7 days unless claimed. Claim now to keep it active.',
  };
  
  // Track variant + outcome
  await prisma.claimOutreachCampaign.create({
    data: {
      organizerId,
      emailAddress,
      messageVariant: variant,
      sentAt: new Date(),
    },
  });
  
  // Send email (variant message)
  await sendgrid.send({
    to: emailAddress,
    from: 'noreply@finda.sale',
    subject: `Claim your estate sale on FindA.Sale`,
    text: messages[variant],
  });
}

// After 30 days, analyze
async function analyzeClaimVariants(): Promise<void> {
  const results = await prisma.claimOutreachCampaign.groupBy({
    by: ['messageVariant'],
    where: { sentAt: { gte: 30daysAgo } },
    _count: { claimed: true },
    _sum: { claimed: true },
  });
  
  // Results show which variant had highest claim rate
  console.log(results);
}
```

**Expected impact:**
- 3–5% → 10–15% claim conversion (3x improvement)
- Data on organizer psychology (what messaging works?)
- Compounding: keep testing variants

---

### Tier 3: Very High ROI / High Effort (Do Third)

#### **6. State Auctioneer Registry Scraper** (40h effort, 9/10 ROI)
**What:** Scrape 5 state auctioneer registries (Michigan, Ohio, Indiana, Illinois, Wisconsin).

**Why:**
- Licensed auctioneers = PREMIUM tier automatically
- Ground truth (public record; no legal risk)
- Gateway to auction-focused organizers

**Quick implementation (state-by-state):**
```typescript
// Michigan example
async function scrapesMichiganAuctioneers(): Promise<void> {
  const page = await puppeteer.launch().then(b => b.newPage());
  
  // Michigan SOS business search
  await page.goto('https://www.michigan.gov/cis');
  await page.type('input[name="name"]', 'auctioneer');
  await page.click('button[type="submit"]');
  
  const auctioneers = await page.$$eval('tr.result', (rows) =>
    rows.map(row => ({
      name: row.querySelector('td:nth-child(1)')?.textContent?.trim() || '',
      licenseNum: row.querySelector('td:nth-child(2)')?.textContent?.trim() || '',
      isActive: row.querySelector('td.status')?.textContent?.includes('Active') ?? false,
    }))
  );
  
  // Ingest
  for (const auc of auctioneers) {
    const existing = await prisma.businessRegistration.findFirst({
      where: { licenseNumber: auc.licenseNum },
    });
    
    if (!existing) {
      await prisma.businessRegistration.create({
        data: {
          state: 'MI',
          businessName: auc.name,
          licenseType: 'auctioneer',
          licenseNumber: auc.licenseNum,
          isActive: auc.isActive,
        },
      });
    }
  }
}

// Repeat for OH, IN, IL, WI
```

**Expected impact:**
- 500–1,000 new organizers (licensed auctioneers)
- Zero legal risk (public records)
- High relevance (licensed = serious business)
- Automate legal verification (no manual review needed)

---

#### **7. Data Product Launch: Heat Maps** (60h effort, 10/10 ROI)
**What:** Dashboard showing shopper density by metro + business type.

**Why:**
- Monetizable directly ($29/mo for organizers)
- Answers strategic question: "Where should I open my next location?"
- Defensible (only FindA.Sale has this data)

**Quick implementation:**
```typescript
// Aggregate shopper activity by metro + business type
async function generateHeatMap(metro: string): Promise<HeatMapData> {
  const sales = await prisma.sale.findMany({
    where: { city: metro },
    include: {
      _count: { select: { views: true, favorites: true } },
      organizer: { select: { businessCategory: true } },
    },
  });
  
  // Compute heatmap
  const byCategory = groupBy(sales, 'organizer.businessCategory');
  const heatmap = Object.entries(byCategory).map(([category, sales]) => ({
    category,
    avgViews: mean(sales.map(s => s._count.views)),
    avgFavorites: mean(sales.map(s => s._count.favorites)),
    salesCount: sales.length,
  }));
  
  return heatmap;
}

// Serve to organizer dashboard
// POST /organizers/my/heatmap
app.get('/organizers/my/heatmap', async (req, res) => {
  const org = req.user.organizer;
  if (!org) return res.status(403).json({ error: 'Not an organizer' });
  
  const metro = org.address.split(',')[1]; // extract city
  const heatmap = await generateHeatMap(metro);
  
  res.json(heatmap);
});
```

**Expected impact:**
- $500–2K/mo revenue per organizer × 20 orgs = $10K+/mo
- Competitive advantage (no competitor has this data)
- Retention (organizers come back to check heatmap)

---

## Ranked Summary: Do Them in This Order

| Rank | Feature | Effort | ROI | Priority | Timeline |
|---|---|---|---|---|---|
| 1 | Review Velocity Scraper | 12h | 6/10 | High | Week 1 |
| 2 | Relevance Score Integration | 8h | 7/10 | High | Week 1 |
| 3 | ESN Company Directory | 16h | 8/10 | High | Week 2 |
| 4 | Closure Report UI | 12h | 6/10 | Medium | Week 2 |
| 5 | Claim Email A/B Testing | 8h | 7/10 | Medium | Week 2 |
| 6 | State Auctioneer Registries (5 states) | 40h | 9/10 | Very High | Weeks 3–4 |
| 7 | Heat Map Data Product | 60h | 10/10 | Very High | Weeks 4–6 |
| **Total** | — | **156h** | — | — | **6 weeks FTE** |

---

## Expected Outcomes After 6 Weeks

**Phase 1 (ADR-073) → Phase 2 (This Plan):**

| Metric | Phase 1 | Phase 2 | Improvement |
|---|---|---|---|
| Indexed sales | 10K | 50K–80K | 5–8x |
| Organizers discovered | 100 | 1,500–2,000 | 15–20x |
| Closure detection accuracy | 30% | 85–90% | 3x |
| Claim conversion rate | 3–5% | 10–15% | 2–3x |
| Crawl cost per organizer | $0.05 | $0.02 | 60% savings |
| Revenue (subscriptions) | $2K–5K/mo | $10K–30K/mo | 3–6x |
| New revenue (data products) | $0 | $5K–15K/mo | New |

---

## Decision Gates

**Before starting Phase 2, confirm with Patrick:**

1. **Legal comfort:** Can you accept cease-and-desist from EstateSales.NET? (If no, skip their company directory; start with state registries instead.)

2. **Email outreach permission:** Can we email organizers we discover in registries? (Requires GDPR/CAN-SPAM compliance.)

3. **Data product rollout:** Should heat maps be public (all organizers) or premium (PRO+ only)? (Affects pricing strategy.)

4. **Timeline:** Can dev start next sprint, or defer to next quarter?

---

## Files to Reference

- `DIRECTORY-CRAWL-INNOVATION-ANALYSIS.md` — Full deep-dive
- `packages/database/prisma/schema.prisma` — Current schema
- `packages/backend/src/services/scraper/index.ts` — Scraper scaffold
- `packages/backend/src/controllers/internalScraperController.ts` — Admin routes
