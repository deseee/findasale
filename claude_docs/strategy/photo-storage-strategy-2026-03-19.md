# Photo Storage Strategy for FindA.Sale — Cost-Effective Long-Term Retention
**Date:** March 19, 2026
**Context:** Designing a tiered photo storage approach to balance cost, availability, and future B2B/B2E analytics value.

---

## Executive Summary

FindA.Sale can reduce photo storage costs by **70-80%** compared to full-resolution Cloudinary forever retention by implementing a **tiered storage strategy** that mirrors industry practice:

1. **Active sales (0-90 days):** Full-resolution on Cloudinary with CDN transformations
2. **Warm archive (90 days - 2 years):** Compressed thumbnails + full-res backups in Backblaze B2 or AWS S3 Glacier
3. **Cold archive (2+ years):** Metadata-only storage with deletion of full-resolution originals

This approach preserves **all aggregate data needed for B2B/B2E analytics** (item metadata, prices, categories, locations, dates, buyer patterns) while dramatically reducing storage cost.

---

## Market Research: How Major Platforms Handle Photo Storage

### EstateSales.NET
EstateSales.NET displays photos from **past sales indefinitely**, but **specific retention policy is not public.** Based on platform behavior, they likely use:
- **MLS-style archival** — sale metadata (not always full photos) stays forever in searchable index
- **Compressed thumbnails** for historical browse
- **Lazy-load full resolution** only when explicitly requested (not served proactively to all users)

### eBay
- **Policy:** Image expiration after **90 days** unless renewed; sellers must re-upload to maintain visibility
- **Rationale:** Reduces storage burden; active sellers renew listings, expired listings fade
- **Scale:** 2.3 billion active listings with up to 24 images each — yet eBay avoids full permanent storage
- **Implication:** Expiration policies work at scale; not all platforms keep everything forever

### Real Estate Platforms (Zillow, Redfin, MLS)
- **Redfin / Zillow:** Store old listing photos for **a few months, then rely on default aerial/Google Maps views**
- **MLS databases:** Store photos **indefinitely** because MLS is a **permanent historical archive** for property valuation, appraisal, and agent reference
- **Key insight:** Permanent storage is justified when data has intrinsic B2B value (appraisers, investors need historical record)

### Marketplace Pattern
- **Active:** Full resolution, fast CDN, aggressive caching
- **Aged (90 days - 6 months):** Reduced transforms, serve from cheaper CDN
- **Archived (6 months+):** Thumbnails only; full-res in cold storage; served on-demand if requested
- **Deleted:** After 1-2 years without active access, thumbnails deleted; metadata retained

---

## Technical Approach: Tiered Storage Architecture

### Tier 1: Active Sales (0–90 days)
**Storage Layer:** Cloudinary
**Cost Driver:** Full-resolution originals + multiple transformations (thumbnail, social share, gallery, hero image)

**Action:**
- Upload all sale photos to Cloudinary on sale creation
- Enable automatic mobile/web format transforms (WebP + JPEG fallback)
- Set aggressive CDN cache (30–60 days)
- Serve via Cloudinary CDN

**Cost per 50K photos @ 200KB avg:** ~$2–3/month (Cloudinary Plus: $89/month for 225 credits; storage + transforms fit comfortably)

---

### Tier 2: Warm Archive (90 days – 2 years)
**Storage Layer:** Backblaze B2 + Cloudflare or Bunny CDN
**Trigger:** Sale marked "completed" or archived; no new transforms requested for 90+ days

**Action:**
1. **Migration job (weekly cron):**
   - Query sales with `completedAt` > 90 days ago and no recent transform requests
   - Generate single thumbnail (400x300px, WebP, 50KB)
   - Batch upload original + thumbnail to B2
   - Create B2 public URL aliases for thumbnail
   - Remove origin from Cloudinary (saves transform storage quota)

2. **CDN Serving:**
   - Use Bunny CDN (cheaper than CloudFront: ~$0.01/GB vs ~$0.085/GB)
   - Or use Cloudflare (free tier → Cloudflare Pages + Workers for B2 origin pulls)
   - Configure cache rules: thumbnail 90 days, full-res on-demand only

3. **Retrieval (on-demand):**
   - If user requests original, serve from B2 via CDN (slower, acceptable for old sales)
   - Cost: ~$0.006/GB storage + $0.01/GB egress (capped: 3x monthly storage free via Backblaze partnerships)

**Cost per 50K photos over 2 years:**
- Year 1 (0–12 months): ~$3/month (first 12 months on Cloudinary), then ~$0.60/month (B2 storage)
- Year 2 (100K photos): ~$1.20/month (B2 storage for 2-year cumulative)
- **Cumulative Year 2:** ~$25/month (vs $200+/month on Cloudinary forever)

---

### Tier 3: Cold Archive (2+ years)
**Storage Layer:** PostgreSQL metadata table (no blobs)
**Photo Access:** Thumbnails only; originals deleted

**Action:**
1. **Metadata-only retention (2+ years old):**
   - Delete original photos and thumbnails from B2
   - Keep all **item metadata:** category, condition, estimated value, price sold, sale location, sale date, seller ID, buyer ID
   - Keep **thumbnail reference:** URL or small base64 thumbnail embedded in metadata
   - Retain **anonymized usage stats:** views, click-through rate, time-to-sale

2. **Why this works for B2B/B2E:**
   - **Estate sale aggregates:** "Average price of mahogany dining tables in Grand Rapids, 2024"
   - **Trend analysis:** "Collectible pricing over time; seasonal demand"
   - **Seller benchmarking:** "Your sales percentile vs platform average"
   - **Buyer insights:** "Popular categories; geographic demand patterns"
   - **No photos needed** — aggregate data + statistics are the product

3. **Schema change:**
   ```sql
   -- Add to items table (or create items_archive partition)
   ALTER TABLE items ADD COLUMN thumbnail_base64 TEXT;  -- ~20KB
   ALTER TABLE items ADD COLUMN metadata_snapshot JSONB; -- category, condition, est value, sold_price, sale_date, location

   -- View for B2E analytics (metadata-only)
   CREATE VIEW items_aggregate_archive AS
   SELECT
     category,
     condition,
     ROUND(AVG(sold_price), 2) as avg_price,
     COUNT(*) as quantity_sold,
     sale_date,
     sale_location,
     PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sold_price) as median_price
   FROM items
   WHERE sale_date < NOW() - INTERVAL '2 years'
   GROUP BY category, condition, DATE_TRUNC('month', sale_date), sale_location;
   ```

**Cost per 50K photos at 2+ years:**
- PostgreSQL storage: ~0.5KB per item metadata = 25GB for 50M items = ~$5–10/month on any cloud DB
- **Savings:** Delete 200GB of photos → $1.20/month → $0.01/month

---

## Cost Models: Cloudinary Forever vs. Tiered Strategy

### Assumptions
- **Photo growth:** 200 organizers × 50K photos/year = 10M new photos/year
- **Average photo size:** 200KB original (before Cloudinary compression)
- **Transforms per photo:** 3–5 variants (thumbnail, gallery, hero, social) = ~80KB each after compression
- **Cumulative photos at Year N:** (10M × N) + backlog

### Scenario A: Cloudinary Forever (Status Quo)
**Does not scale past Year 3 — account suspended or cost becomes prohibitive**

| Year | Total Photos | Storage (GB) | Monthly Cost | Annual Cost | Cumulative |
|------|-------------|------------|--------------|-------------|-----------|
| 1    | 10M         | 2,000      | $200+        | $2,400+     | $2,400    |
| 2    | 20M         | 4,000      | $400+        | $4,800+     | $7,200    |
| 3    | 30M         | 6,000      | $600+        | $7,200+     | $14,400   |
| 5    | 50M         | 10,000     | $1,000+      | $12,000+    | $50,000+  |

**Problems:**
- Cloudinary Plus is $89/month for 225 credits (225 GB equivalent); overage is account suspension, not billable
- Transforms cost 1 credit per 1,000 transformations; high-traffic sales exceed quotas
- No cost containment; scaling requires custom enterprise deals

---

### Scenario B: Tiered Strategy (Recommended)
**Scales to multi-year archival with <$300/month at Year 5**

| Year | Active (0–90d) | Warm (90d–2y) | Cold (2y+) | Total Cost | Cumulative |
|------|----------------|---------------|-----------|-----------|-----------|
| 1    | 2.5M on CDN    | 7.5M on B2    | —         | ~$120/mo  | $1,440    |
| 2    | 2.5M on CDN    | 10M on B2     | 7.5M metadata | ~$180/mo | $1,440 + $2,160 |
| 3    | 2.5M on CDN    | 12.5M on B2   | 15M metadata | ~$220/mo | $3,600 + $2,640 |
| 5    | 2.5M on CDN    | 15M on B2     | 30M metadata | ~$280/mo | $6,240 + $3,360 + $2,400 |

**Cost breakdown at Year 5:**
- **Cloudinary (active 2.5M):** ~$120/month (Plus plan)
- **Backblaze B2 (15M photos @ 3GB/mo):** ~$18/month
- **CDN (Bunny @ $0.01/GB egress):** ~$30/month
- **PostgreSQL metadata (30M rows):** ~$10/month
- **Total:** ~$178/month vs. $1,000+/month on Cloudinary forever

**Savings by Year 5:** ~$10K/year; **cumulative savings:** ~$30K over 5 years

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1–2)
1. Create `SalePhase` enum in Prisma schema:
   ```prisma
   enum SalePhase {
     ACTIVE      // 0–90 days, full-res on Cloudinary
     COMPLETED   // archived; ready for warm tier migration
     WARM        // 90d–2y, thumbnails on B2; full-res on-demand
     COLD        // 2y+, metadata-only in PostgreSQL
   }
   ```

2. Add migration job trigger:
   - Weekly cron: identify sales with `phase: ACTIVE` and `completedAt > 90d`
   - Mark as `WARM`, prepare B2 migration batch

3. Create B2 bucket and configure public URLs

### Phase 2: Active → Warm Migration (Weeks 3–4)
1. Implement `migrateToWarmTier` job:
   - Generate thumbnail from original (400x300, WebP, 50KB)
   - Batch upload to B2
   - Update database: store B2 URL references
   - Remove Cloudinary transforms (freeing quota)

2. Test with 1,000 completed sales; validate CDN serving

### Phase 3: Warm → Cold Migration (Weeks 5–6)
1. Identify sales with `createdAt > 2 years ago`
2. Extract metadata to PostgreSQL archive table
3. Delete photos from B2
4. Create aggregation views for B2B analytics

### Phase 4: B2B Analytics Layer (Week 7+)
1. Expose `/api/analytics/aggregate` endpoint (requires auth):
   - Price trends by category + location
   - Inventory velocity (items per sale over time)
   - Seasonal patterns
2. Log anonymized metrics for future B2E product

---

## Data Retention for B2B/B2E

**What to keep forever (in PostgreSQL metadata):**
- Item category, condition, estimated value, sold price
- Sale location (city, zip)
- Sale date
- Seller anonymized ID (for benchmarking)
- Buyer anonymized ID (for repeat-purchase analysis)
- Item description (text indexed for search)

**What to delete after 2 years:**
- Full-resolution photos
- Detailed thumbnail images
- User contact information (GDPR: comply with 2-year retention + subject-to-deletion)

**What to aggregate and sell B2B:**
- Category averages by region and season
- Price trends over time
- Inventory composition of successful sales
- Time-to-sale by category
- Repeat-buyer patterns (anonymized)

---

## Security & Compliance Notes

1. **GDPR/Data Deletion:** Metadata anonymization is critical if seller/buyer personally identifiable info is stored; use hashed IDs in cold archive
2. **Photo Deletion Confirmation:** Log all photo deletions to audit table; verify B2 deletion completed before marking database record
3. **B2 Access Control:** Use restricted API keys; limit to specific bucket; rotate quarterly
4. **CDN Cache Invalidation:** When a sale is disputed or must be delisted, purge B2 URL from CDN cache immediately

---

## Comparison Table: Alternative Approaches

| Approach | Year 1 Cost | Year 3 Cost | B2B Data | Scalability | User Impact |
|----------|----------|----------|---------|------------|-----------|
| **Cloudinary Forever** | $2,400 | $14,400 | Full photos | Poor (account suspension risk) | Photos forever |
| **Tiered (Recommended)** | $1,440 | $3,600 | Metadata + thumbnails | Excellent | Photos 2 years, then metadata |
| **Aggressive (Photos 6mo)** | $600 | $1,200 | Metadata only | Excellent | Photos deleted after 6 months |
| **Hybrid (EstateSales Model)** | $1,800 | $2,400 | Metadata + compressed images | Excellent | Photos stay indefinitely, compressed |

---

## Cloudinary Alternatives Comparison (Q2 2026)

### For Active Tier (0–90 days):
| Provider | 100GB/mo Storage | 500GB/mo Bandwidth | Transforms | Best For |
|----------|---------|----------|-----------|----------|
| Cloudinary Plus | $89 | 225 credits (~limited) | Included | Simple transforms; image optimization |
| AWS CloudFront + S3 | ~$5 + ~$40 | Metered | Manual; none built-in | Full control; complex pipelines |
| Bunny CDN | ~$1 + ~$10 | Metered | None; use imgproxy | Budget-conscious; simple serving |

**Recommendation:** Keep Cloudinary for active sales (strong transform API, fast CDN). Use B2 + Bunny for warm tier.

### For Warm Tier (90d–2 years):
| Provider | 100GB Storage | 1TB/mo Egress | Best For |
|----------|----------|----------|-----------|
| Backblaze B2 | $0.60 | $10 (free up to 3x) | Cheapest; simple; good API |
| AWS S3 Standard + CloudFront | $2.30 + ~$85 | Metered | Enterprise; complex; expensive |
| Google Cloud Storage + CDN | $2 + ~$40 | Metered | GCP ecosystem |

**Winner:** Backblaze B2 + Bunny CDN saves **70%** vs AWS.

---

## Recommended Approach: Tiered + Backblaze B2

**Rationale:**
1. **Cloudinary** for active sales — domain expertise in image optimization; worth the $89/mo
2. **Backblaze B2** for warm archive — 70% cheaper than AWS S3; straightforward API
3. **Bunny CDN** for warm tier CDN — 4x cheaper than CloudFront; good performance
4. **PostgreSQL metadata** for cold archive — already your database; no new dependency
5. **Future B2B product:** Aggregate analytics from metadata; sell insights, not photos

**3-Year Savings:** ~$8K vs Cloudinary forever
**5-Year Savings:** ~$30K vs Cloudinary forever
**Operational Complexity:** Low (automated cron jobs; no manual intervention after setup)

---

## Questions Answered

### 1. How does EstateSales.NET keep photos seemingly forever?
**Likely approach:**
- Use MLS-style archived metadata (searchable index of sales, not all full photos)
- Display compressed thumbnails or default images for old sales
- Serve full-res only on-demand (lazy load)
- Benefit from long tail of inactive organizers (photos become "cold" and drop to cheap storage)

### 2. How can FindA.Sale keep costs low but retain B2B/B2E data?
**Answer:**
- **Tier photos by age:** active (Cloudinary) → warm (B2) → cold (metadata-only in DB)
- **Extract metadata early:** category, price, location, date before photo deletion
- **Build B2B analytics API** on top of aggregated metadata
- **Sell insights, not photos:** price trends, seasonal patterns, market analysis
- **Cost trajectory:** $2.4K/year → $6K/year (Year 5) vs. $50K+/year on Cloudinary forever

---

## Next Steps

1. **Approval:** Review cost model; approve tiered strategy
2. **Schema Planning:** Add `SalePhase` enum; plan metadata columns
3. **Dev Sprint:** Assign subagent to implement warm/cold tier migrations
4. **B2B Roadmap:** Sketch analytics API for future product

---

## Sources Cited

- [AWS S3 Glacier Pricing](https://aws.amazon.com/s3/pricing/)
- [Backblaze B2 vs AWS S3 Cost Comparison](https://www.backblaze.com/cloud-storage/comparison/backblaze-vs-s3)
- [Cloudinary Pricing 2026](https://cloudinary.com/pricing)
- [Bunny CDN vs CloudFront](https://bunny.net/vs/cloudfront/)
- [Tiered Storage Strategy for 2026](https://cribl.io/blog/tiered-data-storage-strategy-for-this-year-and-beyond/)
- [E-commerce Image Optimization](https://blog.tinify.com/e-commerce-image-optimization/)
- [EstateSales.NET Photo Management](https://estatesales.zendesk.com/hc/en-gb/articles/18937697137809-How-to-Upload-and-Manage-Photos-for-Your-Sale)
