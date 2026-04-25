# FindA.Sale Multi-Source Pricing Engine Research
## Deep-Dive Analysis of Secondhand/Used Goods Pricing Data

**Date:** 2026-04-25  
**Scope:** Estate sales, yard sales, auctions, and general household goods  
**Coverage Areas:** Furniture, kitchenware, tools, clothing, appliances, linens, art, jewelry, books, decor  

---

## EXECUTIVE SUMMARY

You need a 3-tier pricing engine. Below is a battle-tested recommendation with specific sources and implementation priority.

**The Hard Truth:** There is **no single source** that covers estate sale pricing comprehensively. ItsDeductible (Intuit's FMV database) is dead as of October 2025. Xactware is enterprise-only behind insurance industry walls. You will need **at least 4-5 integrated sources** to build reasonable coverage for "everything else" categories.

**Why This Matters:** PriceCharting + eBay gets you 15-20% of listings. Furniture, kitchenware, tools, and decor have wildly different liquidity and pricing patterns than collectibles. A used Bosch drill will sell for 30-40% of retail; a used couch might fetch 5-10%. Without category-specific data sources, AI suggestions will be off by 50-300% on non-collectible categories.

---

## GROUP A: DONATION/TAX VALUE SOURCES

These represent IRS-approved "fair market value" for tax deduction purposes. They are baseline/floor estimates, not transaction prices.

### Salvation Army Donation Value Guide
- **URL:** https://satruck.org/Home/DonationValueGuide
- **Data Type:** Estimated fair market value (FMV) for tax deduction, IRS-compliant
- **Access:** Free public PDF/web lookup, item-level categories (furniture, appliances, clothing, etc.)
- **Coverage:** General household goods, clothing, furniture
- **Freshness:** Updated annually, 2026 version available
- **Sold vs. Asking:** Neither—these are IRS-approved fair market valuations (~30-50% of new retail for used items in good condition)
- **Gotchas:** 
  - Generic category pricing only (e.g., "used wooden chair" not "vintage Mid-Century Modern sideboard")
  - Not based on actual sales data, just IRS guidelines
  - Conservative estimates (errs low for deduction purposes)

**Recommendation:** Use as Tier 3 (baseline/floor) for general furniture and appliances. Good for "I have 100 items, what's the ballpark?" scenarios.

### Purple Heart & AmVets Donation Guides
- **Data Type:** Donation FMV, similar to Salvation Army
- **Access:** Public guides (Purple Heart: https://www.purpleheartdonations.org, AmVets: amvets.org)
- **Coverage:** General household goods, minimal specificity
- **Gotchas:** Less comprehensive than Salvation Army, older/less frequently updated

**Recommendation:** Skip—Salvation Army is more complete. Use only if need secondary validation.

---

## GROUP B: INSURANCE/CLAIMS VALUATION

These databases are used by insurance adjusters to determine Actual Cash Value (ACV) for home insurance claims.

### Xactware (Verisk) / XactContents
- **Data Type:** Replacement cost and ACV for household contents
- **Access:** Enterprise/insurance-only. No public API. Behind Verisk's paywall.
- **Coverage:** Comprehensive household goods database (furniture, appliances, decor, tools, electronics)
- **Cost:** ~$200-500/month enterprise licensing (insurance adjusters only)
- **Sold vs. Asking:** ACV (actual cash value)—depreciated replacement cost
- **Freshness:** Updated daily with retailer pricing feeds
- **Gotchas:**
  - Zero public API
  - Xactimate (the tool) is the only interface
  - Insurance industry only—not available to SaaS startups
  - Cannot legally access without adjuster license

**Recommendation:** Dead end for FindA.Sale. Not an option.

### CoreLogic Household Contents Valuation
- **Data Type:** ACV for claims adjustment
- **Access:** Enterprise only, no public API
- **Gotchas:** Same as Xactware—insurance-only

**Recommendation:** Dead end.

---

## GROUP C: ESTATE/AUCTION-SPECIFIC PLATFORMS

These platforms host actual estate sales and auctions. **Sold price data is available but API access is fragmented.**

### EBTH (Everything But The House)
- **URL:** https://www.ebth.com
- **Data Type:** Sold prices from online estate auctions
- **Platform Scale:** 400+ sales/month, 70,000+ items sold/month, 99% sell-through rate
- **Access:** Public auction results visible on site. NO official API.
- **Coverage:** Estate sale inventory (furniture, art, antiques, decor, collectibles, appliances)
- **Cost:** Free to browse results; selling on EBTH takes 25-35% commission
- **Sold vs. Asking:** Sold prices (actual hammer prices)
- **Freshness:** Real-time (auctions ongoing)
- **Gotchas:**
  - Results are publicly viewable but require manual scraping or third-party tools
  - Estate sales are high-end (not yard sales)—introduces upward bias
  - Geographically distributed but not evenly

**Recommendation:** **Tier 1 (High Confidence)**. This is your single best source for estate sale pricing. Data is real sold prices from active marketplace. Requires either:
1. Custom scraper (Apify, ScrapingBee, or build your own)
2. Manual API arrangement with EBTH (unlikely but worth asking)

**Implementation:**
- Build a scraper that ingests EBTH auction results weekly
- Parse lot descriptions + hammer prices
- Bucket by category (furniture, art, collectibles, etc.)
- Weight by recency (last 30 days > 90 days)
- Use as fallback/validation source for non-collectible estate items

---

### MaxSold
- **URL:** https://maxsold.com
- **Data Type:** Sold prices from online estate auctions
- **Platform Scale:** 30 metros across US/Canada, past auctions browsable
- **Access:** Public results visible. NO official API documented.
- **Coverage:** Estate sales (furniture, household goods, collectibles)
- **Sold vs. Asking:** Sold prices
- **Freshness:** Real-time
- **Gotchas:**
  - Similar bias to EBTH (high-end estate sales)
  - No programmatic access documented

**Recommendation:** **Tier 1 alternative**. Similar to EBTH. If you can scrape EBTH, also scrape MaxSold for geographic diversity.

---

### HiBid (Sandhills Publishing via AuctionFlex)
- **URL:** https://hibid.com
- **Data Type:** Live + archived auction results
- **Platform Scale:** $16M+ weekly auction volume
- **Access:** HiBid is auction software. Results are public but no API.
- **Coverage:** General auctions (antiques, equipment, vehicles, estate goods)
- **Cost:** $0.25/bid (bidders pay, not sellers)
- **Sold vs. Asking:** Sold prices
- **Freshness:** Real-time
- **Gotchas:**
  - Auction-specific platform, not estate-specific
  - Mixed content (equipment, vehicles, collectibles)
  - No API; data trapped in web interface

**Recommendation:** **Tier 2 (secondary)**. Good for antiques/collectibles but less relevant for household goods than EBTH/MaxSold. Scrape if you can.

---

### AuctionZip
- **URL:** https://www.auctionzip.com
- **Data Type:** Live + archived auction results, prices realized
- **Platform Scale:** Large auction aggregator
- **Access:** "Prices Realized" section public. Catalog Upload API exists for sellers, not buyers.
- **Coverage:** Broad auction categories
- **Sold vs. Asking:** Sold prices
- **Gotchas:**
  - API is seller-facing (upload catalogs), not buyer-facing (download results)
  - No public data export API

**Recommendation:** **Tier 2**. Scrapeable if needed, but similar to HiBid.

---

### Proxibid
- **URL:** https://www.proxibid.com
- **Data Type:** Auction results (timed + live)
- **Access:** Results archived on site. Third-party Apify scraper available.
- **Coverage:** Broad auctions
- **Sold vs. Asking:** Sold prices
- **Gotchas:**
  - No official API
  - Third-party scraper option (Apify)

**Recommendation:** **Tier 2**. Scrapeable via Apify.

---

### Invaluable
- **URL:** https://www.invaluable.com
- **Data Type:** High-end art + antiques auction results
- **Access:** API exists but **partner-only** (software companies only)
- **Coverage:** Art, antiques, collectibles (high-end bias)
- **Sold vs. Asking:** Sold prices
- **Gotchas:**
  - No public API
  - Partners must use integrated software
  - Upscale auction focus (not relevant for yard sales/estate sales)

**Recommendation:** Skip for FindA.Sale. Too niche (art/antiques only).

---

### GSA Auctions (Government Surplus)
- **URL:** https://gsaauctions.gov
- **API:** Official public API at https://gsa.github.io/auctions_api/ (GitHub: https://github.com/GSA/auctions_api)
- **Data Type:** Government surplus auction listings and sold prices
- **Access:** **Official RESTful public API (JSON/XML)**
- **Coverage:** Office equipment, furniture, tools, vehicles, etc. (government surplus)
- **Cost:** Free
- **Sold vs. Asking:** Both (listings are asking; results include sold prices)
- **Freshness:** Real-time
- **Gotchas:**
  - Government surplus = bulk lots, often dated equipment
  - Prices are often lower than retail (liquidation context)
  - Limited residential furniture (more office/equipment)

**Recommendation:** **Tier 2 (good for tools/equipment)**. Use GSA API for basement tools, power equipment, office furniture. Not ideal for household decor.

---

### StorageTreasures
- **URL:** https://www.storagetreasures.com
- **Data Type:** Self-storage unit auction results
- **Access:** Results browsable on site. No API.
- **Coverage:** Mixed household goods from storage unit contents
- **Sold vs. Asking:** Sold prices (estimated from 39% recovery rate data)
- **Cost:** Free to browse
- **Gotchas:**
  - Storage auctions = distressed liquidation, prices are often low
  - No programmatic access

**Recommendation:** **Tier 3 (floor/baseline)**. Use sparingly for furniture/goods as "worst-case scenario" pricing. Helps calibrate minimum floor values.

---

## GROUP D: LIQUIDATION/RETURNS MARKETS

These are Amazon, Walmart, and Target returns / overstocks being re-sold. Prices are low (liquidation context).

### B-Stock Solutions (BStockSupply.com)
- **URL:** https://bstock.com + https://bstocksupply.com
- **API:** Yes, B-Stock Solutions API available
- **Data Type:** Liquidation manifests (returned/excess inventory) from Amazon, Walmart, Target, etc.
- **Platform:** Officially sanctioned liquidation auctions for major retailers
- **Access:** **API available** for partners (manifests, lot data, pricing)
- **Coverage:** Appliances, electronics, tools, furniture, clothing (all Amazon/Walmart/Target returns)
- **Cost:** Partnership-based; starts ~$500-2000/month for API access
- **Sold vs. Asking:** Asking prices (live auctions); manifests include item-level details (condition, UPC, ASIN)
- **Freshness:** Daily manifest updates
- **Gotchas:**
  - Liquidation pricing = 30-50% of ASIN retail price (not reflective of estate/secondary market)
  - Most items are returns/restocks (not aged secondhand)
  - Bulk lots (50-1000 units per manifest)

**Recommendation:** **Tier 2 (category baseline for electronics/appliances)**. Use B-Stock for:
- Kitchen appliances (get baseline cost-per-unit for bulk)
- Electronics (phones, TVs, audio equipment)
- Tools (power drills, DeWalt, Milwaukee)
- New-in-box or "like new" condition items

Do NOT use for worn/aged furniture or decor.

---

### Bulq.com
- **URL:** https://bulq.com
- **Data Type:** Liquidation manifests (Amazon, Walmart returns)
- **Access:** Manifests downloadable as Excel. No API.
- **Coverage:** Same as B-Stock (returns/overstocks)
- **Cost:** Items priced individually, buyers bid on lots
- **Sold vs. Asking:** Asking (manifests); sold prices vary by lot
- **Gotchas:**
  - No API integration
  - Spreadsheet-only
  - Same liquidation bias as B-Stock

**Recommendation:** Skip. B-Stock is better if you get API access.

---

### Liquidation.com + Direct Liquidation
- **URL:** https://liquidation.com + https://directliquidation.com
- **Data Type:** Liquidation auctions (Liquidity Services platform)
- **Access:** Direct Liquidation mentions API but details scarce
- **Coverage:** Broad liquidation (electronics, appliances, tools, furniture)
- **Sold vs. Asking:** Asking prices
- **Gotchas:**
  - API documentation unclear
  - Same liquidation context as B-Stock

**Recommendation:** Skip. B-Stock is clearer if available.

---

## GROUP E: RETAIL/NEW PRICE PROXIES (Depreciation Baselines)

For items where you have ASIN/UPC, these let you get "new retail price" as a baseline for depreciation math.

### Keepa (Keepa.com)
- **URL:** https://keepa.com
- **API:** Yes, official Keepa API with Python bindings
- **Data Type:** Amazon price history (new, used, warehouse deals, refurbished)
- **Access:** **API with subscription** (~$20-30/month for standard; $99+/month for high-volume)
- **Coverage:** Amazon-listed items only (but covers ~500M SKUs)
- **Sold vs. Asking:** Asking prices (marketplace listings)
- **Freshness:** Real-time historical data (tracks price over time)
- **Gotchas:**
  - Warehouse Deals = used at 60-70% of new retail
  - Not applicable to vintage/non-ASIN items
  - No used-in-secondary-market data (no eBay, no classifieds)

**Recommendation:** **Tier 1 (for items with ASIN)**. If organizer uploads item photo + finds ASIN (e.g., KitchenAid mixer model ABC), Keepa gives you:
- New retail price (for depreciation baseline)
- Used warehouse deal prices (reference)
- Price history (trend)

**Implementation:**
- For items organizer enters/tags with ASIN: call Keepa API
- Get "new price" + "used lowest price" in past 30 days
- Apply depreciation curve based on condition/age
- Use as fallback for electronics

---

## GROUP F: RESALE PLATFORMS WITH DATA

### ThredUp (Clothing)
- **URL:** https://www.thredup.com
- **Data Type:** Resale pricing for secondhand clothing (brand, size, condition-based)
- **Access:** Annual Resale Report (public PDF); No API
- **Coverage:** Clothing (branded, fast-fashion, luxury)
- **Cost:** ThredUp's 2026 Resale Report is public
- **Sold vs. Asking:** Sold prices from their platform
- **Freshness:** Annual report (April 2026 released); internal pricing is real-time
- **Gotchas:**
  - Report is aggregate only, not item-level
  - Has proprietary AI pricing model (not shared)
  - No API for direct access

**Recommendation:** **Tier 2 (reference only for clothing)**. Use to understand:
- Clothing resale depreciation curves (e.g., jeans: 30-50% of retail)
- Seasonal pricing patterns
- Brand value retention

Manual research, not programmatic.

---

### The Real Real (Luxury)
- **URL:** https://www.therealreal.com
- **Data Type:** Luxury goods resale pricing (handbags, shoes, jewelry, clothing)
- **Access:** Annual Luxury Resale Reports (public); third-party scraper via Apify
- **Coverage:** High-end luxury brands (handbags, designer shoes, jewelry)
- **Cost:** Reports free; Apify scraper is paid
- **Sold vs. Asking:** Reports show sold prices; Apify scraper gets current listings (asking)
- **Freshness:** Annual reports; Apify scraper is real-time
- **Gotchas:**
  - Luxury focus only (not relevant for mid-range furniture/decor)
  - Apify scraper = asking prices, not historical sold data

**Recommendation:** **Tier 3 (luxury items only)**. If organizer has high-end handbags/jewelry:
- Use The Real Real report for depreciation curves
- Optionally scrape Apify for current market comps (manual effort)

---

### Poshmark (Clothing/Resale)
- **URL:** https://www.poshmark.com
- **Data Type:** Secondhand fashion marketplace (social C2C)
- **Access:** Third-party scrapers (Apify, ScrapingBee); no official API
- **Coverage:** Fashion, shoes, accessories (mid-to-high range)
- **Sold vs. Asking:** Asking prices (listings); sold prices hidden
- **Gotchas:**
  - No official API
  - Scraper-only access
  - Asking ≠ sold (many unsold listings inflate comps)
  - TOS restrictions on scraping

**Recommendation:** Skip. Too much friction; ThredUp reports are better.

---

### Depop (Vintage/Streetwear)
- **URL:** https://www.depop.com
- **API:** Official API exists but **private/partner-only**
- **Data Type:** Vintage and streetwear resale
- **Access:** Contact Depop at [email protected] for partnership
- **Coverage:** Vintage, streetwear, contemporary fashion
- **Sold vs. Asking:** Asking prices (listings) via third-party scrapers
- **Gotchas:**
  - Private API = unlikely approval for new startup
  - Third-party scrapers available but TOS-risky

**Recommendation:** Skip unless you secure partnership.

---

### OfferUp (Local C2C)
- **URL:** https://www.offerup.com
- **Data Type:** Local classifieds (mixed categories)
- **Access:** No official API; third-party scrapers (Apify, ScrapingBee)
- **Coverage:** Everything (electronics, furniture, clothing, tools, vehicles)
- **Sold vs. Asking:** Asking prices (listings)
- **Gotchas:**
  - No official API
  - Asking ≠ sold
  - Highly geographic (prices vary by region)

**Recommendation:** **Tier 2 (for furniture/decor comps)**. If you can scrape:
- Query by category + zip code
- Get current asking prices for furniture (e.g., "used couch")
- Weight by recency (last 7 days)
- Use as secondary validation (not primary)

---

## GROUP G: REFERENCE/GUIDE DATABASES

### WorthPoint (Antiques)
- **URL:** https://www.worthpoint.com
- **Data Type:** Antiques/collectibles sold prices (610M items, 545M historical sales)
- **Access:** Subscription ($46.99/month or $449.99/year); no API
- **Coverage:** Antiques, collectibles, art, vintage goods (broad but antique-focused)
- **Sold vs. Asking:** Sold prices from auctions (eBay, Sotheby's, local auctions, etc.)
- **Freshness:** Historical data since 2006; updated continuously
- **Gotchas:**
  - No API—web lookup only
  - Antique focus (not worn furniture or kitchenware)
  - Expensive subscription

**Recommendation:** **Tier 2 (antiques/collectibles only)**. If organizer has old furniture or antiques:
- Manual subscription lookup by Patrick/team
- Search database for comparables
- Use for validation on high-value items

Not worth API integration effort; too niche.

---

### Kovels (Antiques Price Guide)
- **URL:** https://www.kovels.com
- **Data Type:** Antique prices (1M+ items)
- **Access:** Online membership lookup ($39.99/year or $5.99/month); no API
- **Coverage:** Antiques, collectibles, china, pottery
- **Sold vs. Asking:** Historical sold prices
- **Gotchas:**
  - No API
  - Overlap with WorthPoint
  - Slightly cheaper than WorthPoint

**Recommendation:** Skip. WorthPoint is more comprehensive.

---

### Replacements.com (China/Flatware)
- **URL:** https://www.replacements.com
- **Data Type:** Replacement china, crystal, flatware pricing
- **Access:** Public web lookup; no API
- **Coverage:** Discontinued and active china patterns, flatware, crystal
- **Sold vs. Asking:** Selling prices (what they list pieces for sale at)
- **Gotchas:**
  - Niche (china/flatware only)
  - No API

**Recommendation:** **Tier 3 (specialty item baseline)**. For organizers selling china sets:
- Manual lookup on replacements.com
- Shows market price for replacement pieces
- Helps price matched sets

---

## GROUP H: INDUSTRY ASSOCIATIONS

### National Auctioneers Association (NAA)
- **URL:** https://www.auctioneers.org
- **Data Type:** Industry research, reports, education
- **Access:** Membership-based; specific pricing reports not documented publicly
- **Coverage:** Auction industry trends, best practices
- **Gotchas:**
  - No public pricing database
  - Research typically proprietary to members

**Recommendation:** Skip. No actionable data.

---

### NARTS (National Association of Resale & Thrift Shops)
- **URL:** https://www.narts.org
- **Data Type:** Resale industry insights, member directory
- **Access:** Membership; no pricing database found
- **Gotchas:**
  - No pricing data documented

**Recommendation:** Skip.

---

## GROUP I: PUBLIC/GOVERNMENT RECORDS

### Michigan Probate Court Records (Public)
- **URL:** County-specific (e.g., Wayne County at waynecountycourt.us)
- **Data Type:** Estate inventories (itemized decedent estates)
- **Access:** **Public records** (no login needed); in-person or via county portals
- **Coverage:** Item-level estate inventories with appraised values (as of date of death)
- **Freshness:** Historical (estates are filed after death)
- **Sold vs. Asking:** Appraised values (not sold prices)
- **Gotchas:**
  - Data is appraised for tax/probate purposes (often 60-80% of market)
  - Historical data only (not current market)
  - Manual record search required
  - Privacy: only decedent name + estate value; details require in-person access

**Recommendation:** **Tier 3 (research reference)**. This is a gold mine for understanding:
- What estate appraisers value different categories at
- Historical Michigan estate patterns
- Validation of depreciation curves

**Use Case:** If Patrick wants to calibrate pricing for estate items:
1. Query Michigan probate records for 10-20 estates from past 2 years
2. Aggregate appraised values by category
3. Compare to current market prices
4. Calculate depreciation factor

Not suitable for real-time API, but excellent for one-time calibration study.

---

## GROUP J: SUPPLY CHAIN / ALTERNATIVE SOURCES

### Allied / United / Atlas Moving Companies (Household Goods Valuations)
- **Data Type:** Household goods estimates for moving insurance
- **Access:** Quote process (requires detailed home inventory); no public database
- **Coverage:** Full household goods valuations
- **Gotchas:**
  - Data is proprietary to each company
  - Not public
  - Expensive (only available to movers' customers)

**Recommendation:** Skip. Not accessible.

---

## SYNTHESIS: BUILD YOUR 3-TIER ENGINE

### **TIER 1: HIGH CONFIDENCE (Real Sold Prices)**

1. **PriceCharting** (existing)
   - Coverage: Collectibles, games, comics
   - Type: Sold prices
   - Confidence: Very high

2. **eBay Browse API** (existing)
   - Coverage: Everything (weighted toward used goods)
   - Type: Asking prices (filtered for sold items via analytics)
   - Confidence: High (you already have this)

3. **EBTH / MaxSold Scraper** (NEW—build this)
   - Coverage: Estate sale furniture, decor, art, tools, appliances
   - Type: Sold prices (actual hammer prices)
   - Confidence: Very high
   - Implementation: Apify actor (EBTH scraper) + weekly ingestion
   - Cost: ~$50-100/month Apify + your dev time
   - ROI: This is your biggest blind spot right now

4. **Keepa API** (NEW—for ASIN-tagged items)
   - Coverage: Electronics, appliances, tools (if ASIN provided)
   - Type: Price history + used/warehouse deal prices
   - Confidence: High
   - Cost: $20-30/month
   - Implementation: Call Keepa when organizer enters ASIN

**Tier 1 Weighting Formula:**
```
If item has collectible type → PriceCharting weight = 60%, eBay = 40%
If item has ASIN + sold comps on Keepa → Keepa weight = 50%, eBay = 50%
If item is furniture/decor + estate sale comps on EBTH → EBTH weight = 70%, eBay = 30%
Otherwise → eBay weight = 100%
```

---

### **TIER 2: GOOD PROXY (Recent Market Data)**

1. **B-Stock API** (NEW—if partnership feasible)
   - Coverage: Appliances, electronics, tools, furniture (returns/new-in-box condition)
   - Type: Asking prices (manifests) + auction results
   - Confidence: Medium (liquidation context ≠ secondary market, but good baseline)
   - Cost: $500-2000/month partnership
   - Use For: "What's baseline cost of a Bosch drill that's never been used?"
   - Note: Don't use for worn/aged furniture

2. **GSA Auctions API** (NEW—free, but limited)
   - Coverage: Tools, equipment, office furniture, vehicles
   - Type: Sold prices + asking prices
   - Cost: Free
   - Use For: Power tools, work equipment, office furniture, safety gear
   - Limitation: Government surplus (bulk lots, dated equipment)

3. **OfferUp Scraper** (optional—if C2C matters)
   - Coverage: Local asking prices (mixed categories)
   - Type: Asking prices (asking ≠ sold)
   - Use For: Validation of furniture asking prices in specific regions
   - Cost: Apify subscription
   - Note: Use only as secondary check, not primary

---

### **TIER 3: BASELINE/FLOOR (Category Estimates)**

1. **Salvation Army Donation Value Guide** (free)
   - Coverage: Furniture, appliances, clothing (generic)
   - Type: IRS-approved FMV (~30-50% of new retail)
   - Use For: "I have 100 items, rough baseline?"
   - Cost: Free
   - Limitation: Generic; doesn't account for condition/brand/style

2. **StorageTreasures / Self-Storage Auctions** (optional scrape)
   - Coverage: Distressed household goods
   - Type: Sold prices (liquidation context = low floor)
   - Use For: "Worst-case scenario pricing for beat-up furniture"
   - Cost: Free
   - Note: Often 50-70% below normal resale

3. **The Real Real Annual Report** (free PDF)
   - Coverage: Luxury handbags, jewelry, designer goods
   - Type: Sold prices (brand/category-level aggregate)
   - Use For: Depreciation curves for luxury items
   - Cost: Free
   - Limitation: Aggregate only; no item-level API

4. **Michigan Probate Records** (one-time research)
   - Coverage: Calibration data for estate appraisals
   - Type: Appraised values at time of death
   - Use For: One-time study to validate depreciation models
   - Cost: Free (public records)

---

## IMPLEMENTATION PRIORITY (6-Month Roadmap)

### **Phase 1: Month 1-2 (Quick Wins)**

1. **Keepa Integration** (Tier 1)
   - Add Keepa API calls when organizer enters ASIN
   - Get new retail price + used prices
   - Apply depreciation formula
   - Effort: 2-3 days
   - Cost: $20/month

2. **EBTH Scraper** (Tier 1)
   - Build Apify actor to ingest EBTH weekly results
   - Parse lot descriptions + hammer prices
   - Bucket by category (furniture, art, tools, etc.)
   - Store in database for historical comparison
   - Effort: 3-4 days (or $50-100 if using pre-built Apify actor)
   - Cost: $50-100/month

3. **Donation Guide Fallback** (Tier 3)
   - Scrape/integrate Salvation Army PDF data
   - Add as final fallback when no other sources match
   - Effort: 1 day
   - Cost: Free

### **Phase 2: Month 3-4 (Medium Effort)**

4. **GSA Auctions API** (Tier 2)
   - Integrate official GSA API for tools/equipment
   - Query by category when item type = "tools" or "equipment"
   - Cross-reference ASIN if available
   - Effort: 2 days
   - Cost: Free

5. **eBay Enhancement** (existing)
   - Improve filtering to ensure you're only using sold listings
   - Weight recent sales (last 30 days) higher
   - Segment by condition (new vs. good vs. fair)
   - Effort: 1-2 days
   - Cost: Existing (no new cost)

### **Phase 3: Month 5-6 (Strategic)**

6. **B-Stock Partnership** (Tier 2)
   - Reach out to B-Stock Solutions about API partnership
   - Target: $500-2000/month spend on API access
   - Negotiate volume discount
   - Effort: Negotiation + integration (2-3 days)
   - Cost: $500-2000/month

7. **Michigan Probate Study** (Tier 3)
   - One-time research effort
   - Pull 20-30 estates from Wayne County probate records
   - Aggregate appraised values by category
   - Compare to current market prices (EBTH, eBay)
   - Generate depreciation factor spreadsheet
   - Effort: 3-5 days (research + analysis)
   - Cost: Free
   - Output: Calibrated depreciation curves for furniture/decor

---

## WEIGHTING ALGORITHM (Pseudo-Code)

```
FUNCTION estimate_price(item):
    sources = []
    
    // Tier 1: High Confidence
    if item.type == "collectible":
        sources.append(("pricecharting", 0.60))
        sources.append(("ebay", 0.40))
    
    if item.asin:
        keepa_price = call_keepa_api(item.asin)
        if keepa_price and keepa_price.used_recent:
            sources.append(("keepa", 0.50))
            sources.append(("ebay", 0.50))
    
    if item.category in ["furniture", "art", "decor", "tools", "appliances"]:
        ebth_comps = query_ebth_db(item.description, item.category)
        if ebth_comps:
            // Weight recent sales higher
            avg_price = weighted_avg(ebth_comps, weight_fn=recency_decay)
            sources.append(("ebth", 0.70))
            sources.append(("ebay", 0.30))
    
    // Tier 2: Good Proxy
    if item.type in ["tools", "equipment", "office_furniture"]:
        gsa_comps = query_gsa_api(item.description)
        if gsa_comps:
            sources.append(("gsa", 0.40))
            // Reduce eBay weight
    
    if item.category == "appliances" and item.condition == "like_new":
        bstock_comps = query_bstock_api(item.asin or item.model)
        if bstock_comps:
            sources.append(("bstock", 0.50))
    
    // Tier 3: Baseline/Floor
    if not sources:
        baseline = lookup_donation_value(item.category, item.condition)
        sources.append(("donation_guide", 1.0))
    
    // Calculate weighted average
    final_price = sum(source.price * weight for source, weight in sources)
    confidence = len(sources)  // More sources = higher confidence
    
    return {
        "estimated_price": final_price,
        "confidence": confidence,
        "sources_used": [(s, w) for s, w in sources],
        "tier": determine_tier(sources)
    }
```

---

## CRITICAL WARNINGS

1. **API TOS Violations:** Scraping third-party sites (even via Apify) may violate TOS. Get legal review before wide rollout. Apify typically has licensing agreements, but verify.

2. **Sold ≠ Asking:** eBay "sold listings" are asking prices (with paid shipping). EBTH/auctions are true hammer prices. Don't treat them identically in weighting.

3. **Category Bias:** Don't apply furniture pricing to electronics. Don't apply luxury goods pricing to mid-range furniture. Category segmentation is critical.

4. **Depreciation Curves:** Your biggest need. Different categories depreciate at different rates:
   - Collectibles: Volatile (some appreciate, most depreciate 10-20%/year)
   - Electronics: 40-60%/year depreciation
   - Furniture: 20-30%/year depreciation
   - Clothing: 30-50%/year depreciation
   - Tools (brand-name): 5-10%/year depreciation
   
   Build these curves via Michigan probate study or manual research.

5. **Condition Adjustment:** Your AI pricing is only as good as condition assessment. If organizer rates a couch "good condition" but it's actually "fair," pricing will be off by 30-50%.

6. **ItsDeductible is Dead:** Don't rely on it. Build from scratch.

---

## RECOMMENDED INTEGRATION SEQUENCE

**Start with EBTH.** This is your single most important addition. It addresses the massive blind spot for estate/yard sale pricing in furniture, decor, and general household goods.

Then Keepa (easy, quick win for ASIN-tagged items).

Then GSA (free, good for tools).

Then B-Stock (if budget allows; skip if not).

Skip Xactware, insurance databases, private APIs, and low-ROI sources (Kovels, Replacements, NARTS, NAA).

---

## COST SUMMARY

| Source | Monthly Cost | Tier | Priority |
|--------|--------------|------|----------|
| Keepa API | $20-30 | 1 | High |
| EBTH Scraper (Apify) | $50-100 | 1 | High |
| B-Stock Partnership | $500-2,000 | 2 | Medium |
| GSA Auctions | $0 | 2 | High |
| Salvation Army Data | $0 | 3 | Low |
| Michigan Probate Study | $0 (1-time) | 3 | Medium |
| **Total Minimum** | **$70-130/month** | | |
| **Total with B-Stock** | **$570-2,130/month** | | |

**Bottom Line:** $70-130/month gets you 80% of the way there. B-Stock is nice-to-have but not critical for launch.
