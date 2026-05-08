# FindA.Sale Pricing Sources - API Reference Sheet

## TIER 1: HIGH CONFIDENCE (Real Sold Prices)

### PriceCharting (Already Integrated)
- **URL:** https://www.pricecharting.com
- **Status:** Integrated
- **API:** Yes (existing integration)
- **Category:** Collectibles, games, comics
- **Data Type:** Sold prices

---

### eBay Browse API (Already Integrated)
- **URL:** https://developer.ebay.com/api-docs/buy/browse
- **Status:** Integrated
- **API:** Official REST API
- **Category:** General (weighted toward used goods)
- **Data Type:** Asking prices (filter for sold items)

---

### EBTH (Everything But The House) - BUILD THIS FIRST
- **URL:** https://www.ebth.com
- **API Status:** No official API
- **Implementation:** Custom scraper (Apify or build own)
- **Category:** Estate sale furniture, decor, art, tools, appliances
- **Data Type:** Sold prices (hammer prices)
- **Scale:** 400+ sales/month, 70,000+ items/month, 99% sell-through
- **Access:** Public results visible on site
- **Cost:** $50-100/month (Apify actor + storage)
- **Effort:** 3-4 days dev time OR use pre-built Apify actor
- **Freshness:** Real-time (auctions ongoing)

**Scraper Implementation:**
- Use Apify EBTH actor: https://apify.com/actors/ebth-scraper
- OR build custom scraper with Puppeteer/Selenium
- Parse lot descriptions + hammer prices
- Store in PostgreSQL with category bucketing
- Weekly ingestion schedule

**Weighting:** EBTH weight = 70%, eBay weight = 30% (for furniture/decor)

---

### MaxSold - SUPPLEMENT EBTH
- **URL:** https://maxsold.com
- **API Status:** No official API
- **Implementation:** Custom scraper (same as EBTH)
- **Category:** Estate sales (furniture, household goods, collectibles)
- **Data Type:** Sold prices
- **Scale:** 30 metros across US/Canada
- **Access:** Public results browsable
- **Cost:** Included in EBTH scraper approach (same tooling)
- **Purpose:** Geographic diversity for EBTH data

**Implementation:** If scraping EBTH, also scrape MaxSold for east coast coverage.

---

### Keepa API - SECOND PRIORITY
- **URL:** https://keepa.com
- **API Status:** Official REST API with Python bindings
- **API Documentation:** https://keepa.readthedocs.io/en/latest/
- **Implementation:** Add API calls in organizer form when ASIN is entered
- **Category:** Electronics, appliances, tools (Amazon-listed items)
- **Data Type:** Price history + used/warehouse deal prices
- **Coverage:** ~500M SKUs
- **Cost:** $20-30/month (standard tier)
- **Authentication:** API key (subscription-based)
- **Rate Limiting:** Depends on subscription tier
- **Freshness:** Real-time historical data

**API Call Pattern:**
```
GET https://api.keepa.com/product
Parameters:
  - key: YOUR_API_KEY
  - asin: PRODUCT_ASIN
  - domain: AMAZON_DOMAIN (1 = US)
  - stats: Last 30 days

Response includes:
  - csv (price history as CSV array)
  - new lowest price
  - used lowest price
  - warehouse deals price
```

**Implementation:**
```javascript
// Pseudo-code for organizer form
if (organizer.item.asin) {
  const keepaData = await callKeepaAPI(asin);
  const newPrice = keepaData.newPrice;
  const usedPrice = keepaData.usedPrice;
  const depreciatedPrice = applyDepreciation(newPrice, age, condition);
  return { estimate: depreciatedPrice, sources: ['keepa', 'ebay'] };
}
```

**Weighting:** Keepa weight = 50%, eBay weight = 50% (for ASIN items)

---

## TIER 2: GOOD PROXY (Recent Market Data)

### GSA Auctions API - FREE & EASY
- **URL:** https://gsaauctions.gov
- **API Status:** Official public API (no auth required)
- **API Documentation:** https://gsa.github.io/auctions_api/
- **GitHub:** https://github.com/GSA/auctions_api
- **Implementation:** RESTful JSON/XML API
- **Category:** Tools, equipment, office furniture, vehicles (government surplus)
- **Data Type:** Auction listings (asking prices) + sold prices (historical)
- **Cost:** Free
- **Authentication:** None required (public API)
- **Rate Limiting:** Check documentation
- **Freshness:** Real-time

**API Call Pattern:**
```
GET https://api.gsaauctions.gov/v1/listings
Parameters:
  - keyword: SEARCH_TERM (e.g., "power drill", "office desk")
  - category: CATEGORY_ID (e.g., "office furniture")
  - status: SOLD (for historical prices)

Example:
GET https://api.gsaauctions.gov/v1/listings?keyword=drill&status=sold&limit=100
```

**Implementation:**
```javascript
if (item.type === 'tools' || item.category === 'equipment') {
  const gsaComps = await callGSAAPI(item.description);
  if (gsaComps.length > 0) {
    sources.push({ source: 'gsa', weight: 0.40, price: gsaComps.avgSoldPrice });
  }
}
```

**Weighting:** GSA weight = 40%, eBay weight = 60% (for tools/equipment)

---

### B-Stock Solutions API - OPTIONAL (IF PARTNERSHIP)
- **URL:** https://bstock.com + https://bstocksupply.com
- **API Status:** Official API available (partner/enterprise only)
- **Implementation:** Contact B-Stock for partnership terms
- **Category:** Appliances, electronics, tools, furniture (returns/new-in-box)
- **Data Type:** Liquidation manifests (item-level with condition, UPC, ASIN)
- **Cost:** $500-2,000/month (partnership-based)
- **Authentication:** API key or OAuth (varies by plan)
- **Freshness:** Daily manifest updates
- **Data Quality:** UPC/ASIN + condition + wholesale price

**Contact for Partnership:**
- https://bstock.com/contact
- Propose: API partnership for secondary sale pricing baseline

**Implementation (if approved):**
```javascript
if (item.asin || item.upc) {
  const bstockComps = await callBStockAPI(item.asin || item.upc);
  if (bstockComps && item.condition === 'like_new') {
    sources.push({ source: 'bstock', weight: 0.50, price: bstockComps.avgPrice });
  }
}
```

**Weighting:** B-Stock weight = 50% (for like-new appliances/electronics only)

**Note:** Don't use for worn furniture or decor. Liquidation context skews low.

---

### OfferUp Scraper - OPTIONAL (Local Comps)
- **URL:** https://www.offerup.com
- **API Status:** No official API
- **Implementation:** Third-party scraper (Apify or ScrapingBee)
- **Category:** Everything (electronics, furniture, clothing, tools)
- **Data Type:** Asking prices (listings only, not sold)
- **Cost:** Apify actor subscription (~$50-100/month)
- **Freshness:** Real-time listings
- **Limitation:** Asking ≠ sold; asking prices are inflated 20-40%

**Implementation (if needed):**
```javascript
if (item.category === 'furniture') {
  const offerupComps = await scrapeOfferUp(item.description, organizer.zipcode);
  // Weight only recent listings (last 7 days)
  const recentComps = offerupComps.filter(c => daysSincePosted(c) <= 7);
  if (recentComps.length > 0) {
    // Apply 30% discount to asking price (estimation)
    const estimatedSoldPrice = recentComps.avgPrice * 0.70;
    sources.push({ source: 'offerup', weight: 0.20, price: estimatedSoldPrice });
  }
}
```

**Note:** Use only as secondary validation, not primary source.

---

## TIER 3: BASELINE/FLOOR (Category Estimates)

### Salvation Army Donation Value Guide - FREE FALLBACK
- **URL:** https://satruck.org/Home/DonationValueGuide
- **Data Type:** IRS-approved fair market value (generic)
- **Access:** Free public lookup
- **Category:** Furniture, appliances, clothing
- **Coverage:** Generic categories only (e.g., "used wooden chair")
- **Cost:** Free

**Implementation:**
```javascript
if (sources.length === 0) {
  const baseline = lookupSalvationArmyValue(item.category, item.condition);
  sources.push({ source: 'donation_guide', weight: 1.0, price: baseline });
}
```

**Note:** Use only as fallback when no other sources available.

---

### Michigan Probate Court Records - RESEARCH REFERENCE
- **URL:** County-specific (e.g., Wayne County: waynecountycourt.us)
- **Data Type:** Estate inventories with appraised values
- **Access:** Public records (no API, manual lookup)
- **Category:** Item-level estate appraisals
- **Cost:** Free
- **Purpose:** One-time calibration study

**Research Protocol:**
1. Query Wayne County probate records for 20-30 estates (2024-2026)
2. Extract itemized inventory + appraised values
3. Aggregate by category (furniture, art, tools, appliances, etc.)
4. Compare to current market prices (EBTH, eBay)
5. Calculate depreciation factors (appraised → market price)

**Output:** Calibrated depreciation curve spreadsheet

---

### The Real Real Annual Report - LUXURY REFERENCE
- **URL:** https://www.therealreal.com/resale-report-2025
- **Data Type:** Luxury goods sold prices (aggregate)
- **Access:** Free PDF annual report
- **Category:** Handbags, shoes, jewelry, designer clothing
- **Cost:** Free
- **Purpose:** Depreciation curves for luxury items

**Use Case:** If organizer has high-end handbags/jewelry, reference report for
category-level depreciation benchmarks.

---

### StorageTreasures - DISTRESSED FLOOR PRICING
- **URL:** https://www.storagetreasures.com
- **Data Type:** Self-storage unit auction results
- **Access:** Browsable on site (no API)
- **Category:** Mixed household goods (furniture, electronics, appliances)
- **Cost:** Free
- **Purpose:** Worst-case scenario pricing (distressed liquidation)

**Use Case:** Validate floor pricing for beat-up furniture. Typically 50-70%
below normal secondary market prices.

---

## SOURCES TO SKIP

| Source | Reason |
|--------|--------|
| Xactware/XactContents | Enterprise insurance-only, no public API, not accessible |
| ItsDeductible | DEAD (shut down October 2025) |
| Invaluable | Partner API only, art/antiques niche, not relevant |
| WorthPoint | Subscription, no API, antiques-only overlap |
| Kovels | Redundant with WorthPoint, no API |
| Replacements.com | China/flatware niche only, no API |
| NARTS/NAA | No pricing data available |
| Poshmark | No official API, TOS-risky scraping, asking prices only |
| Depop | Private API only (unlikely partnership approval), TOS-risky |
| Moving companies | Proprietary data, not public |

---

## IMPLEMENTATION ROADMAP

### PHASE 1: MONTH 1-2 (Quick Wins)
- [ ] EBTH Scraper implementation (Tier 1)
- [ ] Keepa API integration (Tier 1)
- [ ] Salvation Army fallback (Tier 3)

### PHASE 2: MONTH 3-4 (Medium Effort)
- [ ] GSA Auctions API integration (Tier 2)
- [ ] eBay filtering improvements (existing)

### PHASE 3: MONTH 5-6 (Strategic)
- [ ] B-Stock partnership negotiation (Tier 2)
- [ ] Michigan probate calibration study (Tier 3)

---

## WEIGHTING REFERENCE TABLE

| Scenario | Weight Distribution | Confidence |
|----------|-------------------|------------|
| Collectible | PriceCharting 60%, eBay 40% | Very High |
| ASIN + Keepa comps | Keepa 50%, eBay 50% | High |
| Furniture + EBTH comps | EBTH 70%, eBay 30% | Very High |
| Tools + GSA comps | GSA 40%, eBay 60% | High |
| No comps found | Donation Guide 100% | Low |
| Multiple sources (3+) | Average + recency weight | High |

---

## CRITICAL IMPLEMENTATION NOTES

1. **Sold ≠ Asking:** eBay sold listings are asking prices. EBTH/auctions are
   true hammer prices. Adjust weights accordingly.

2. **Category Segmentation:** Don't cross-apply furniture pricing to electronics.
   Each category needs dedicated depreciation curves.

3. **Depreciation Rates:**
   - Collectibles: 10-20%/year (volatile)
   - Electronics: 40-60%/year
   - Furniture: 20-30%/year
   - Clothing: 30-50%/year
   - Tools (brand-name): 5-10%/year

4. **Condition Multipliers:**
   - New: 100%
   - Like New: 90-95%
   - Good: 70-85%
   - Fair: 50-70%
   - Poor: 20-50%

5. **Recency Decay:** Weight EBTH/eBay comps from last 30 days at 1.0x,
   60 days at 0.7x, 90 days at 0.5x.

---

End of API Reference Sheet
