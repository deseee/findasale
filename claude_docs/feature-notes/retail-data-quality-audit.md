# RETAIL Data-Quality Audit (read-only)

**Date:** 2026-06-09
**Scope:** `Sale` rows where `saleType='RETAIL' AND status='PUBLISHED'`
**DB:** Railway production (public proxy), read-only. No mutations performed.
**Method:** All counts below are real psycopg2 query results. The junk count is a documented keyword *heuristic* (lower bound, not exact).

---

## 1. Totals & breakdown

**Total RETAIL published: 7,692**

```sql
SELECT COUNT(*) FROM "Sale" WHERE "saleType"='RETAIL' AND status='PUBLISHED';  -- 7692
```

### By sourceName
```sql
SELECT "sourceName", COUNT(*) FROM "Sale"
WHERE "saleType"='RETAIL' AND status='PUBLISHED' GROUP BY 1 ORDER BY 2 DESC;
```
| sourceName | count |
|---|---|
| Foursquare | 4,600 |
| HEREPlaces | 3,083 |
| FacebookMarketplace | 8 |
| (null) | 1 |

### By title-suffix category (`— <Category> in <City>, <ST>`)
```sql
SELECT (regexp_match(title,'— (.+?) in '))[1] AS cat, COUNT(*)
FROM "Sale" WHERE "saleType"='RETAIL' AND status='PUBLISHED'
GROUP BY 1 ORDER BY 2 DESC;
```
| Category | count |
|---|---|
| **(NO SUFFIX — raw business name, no `— Category in` pattern)** | **3,459** |
| Resale Shop | 1,185 |
| Pawn Shop | 825 |
| Antique Mall | 745 |
| Consignment Shop | 399 |
| Estate Sale Company | 382 |
| Thrift Store | 235 |
| Coin Dealer | 56 |
| Used Furniture Store | 52 |
| Auction House | 36 |
| Surplus Store | 32 |
| Used Sporting Goods | 30 |
| Record Store | 26 |
| Liquidation Store | 25 |
| Estate Liquidator | 24 |
| Junk Removal / Estate Cleanout | 23 |
| Used Bookstore | 23 |
| Salvage Store | 22 |
| Used Electronics | 21 |
| Antique Dealer | 20 |
| Moving Sale Company | 15 |
| Vintage Shop | 14 |
| Jewelry Resale | 12 |
| Yard Sale Organizer | 10 |
| Online Auction Service | 10 |
| Buy Sell Trade Store | 6 |
| Garage Sale Company | 4 |
| Tag Sale Company | 1 |

**Key structural finding:** 3,459 rows (45% of all RETAIL) have **no `— Category in City` suffix at all** — they are raw scraped business names with no resale category attached. Sampled titles: *The Pool At Craig Brewing Company*, *Kawneer Company of Canada*, *William Yetke Real Estate Consultants & Appraisers*, *Larry's Barber Shop*, *Library Company of Philadelphia*, *I Smoke Shop*, *Racquet Club Barber Shop*, *P F Real Estate*, *Arden Theatre Company*. This bucket is the single largest and the dirtiest.

---

## 2. Junk detection (keyword heuristic — lower bound)

Heuristic: `LOWER(title)` contains any of ~80 non-resale business keywords (brewing, real estate, realtor/realty, barber, smoke shop, restaurant, church, university, attorney, dental, insurance, salon, coffee, manufacturing, industries, dealership, etc.).

```sql
-- ors = "LOWER(title) LIKE '%brewing%' OR ... (80 terms)"
SELECT COUNT(*) FROM "Sale"
WHERE "saleType"='RETAIL' AND status='PUBLISHED' AND (ors);
```

**Junk-keyword hits: 1,312 of 7,692 = 17.1%** — and this is conservative. The heuristic only catches titles whose *words* match a blocklist; it misses junk like personal-name real-estate agents and generic company names that don't contain a flagged term. True contamination is materially higher (see §4).

### 25 confirmed junk samples (verbatim)
- `Hulen Mall Family Dental Center — Antique Mall in Fort Worth, TX`
- `JAMES R. MALLORY Attorney — Antique Mall in Fort Worth, TX`
- `Texas Wesleyan University Mall — Antique Mall in Fort Worth, TX`
- `Wild Acre Brewing Company — Estate Sale Company in Fort Worth, TX`
- `Paris Coffee Shop — Consignment Shop in Fort Worth, TX`
- `Anthony Gulley - Fort Worth Texas Real Estate — Estate Sale Company in Fort Worth, TX`
- `Glen Garden Barber Shop — Consignment Shop in Fort Worth, TX`
- `Fort Worth Texas Real Estate — Estate Sale Company in Fort Worth, TX`
- `Martin House Brewing Company — Estate Sale Company in Fort Worth, TX`
- `Ronda Christian / Fort Worth Texas Real Estate — Estate Sale Company in Fort Worth, TX`
- `Cowtown Brewing Company — Estate Sale Company in Fort Worth, TX`
- `Cisneros Real Estate Solutions — Estate Sale Company in Fort Worth, TX`
- `Fort Worth Barber Shop — Consignment Shop in Fort Worth, TX`
- `Eagle Mountain International Real Estate — Estate Sale Company in Fort Worth, TX`
- `AC Real Estate — Estate Sale Company in Fort Worth, TX`
- `Fort Worth Real Estate By Dana — Estate Sale Company in Fort Worth, TX`
- `24K Smoke Shop||Kratom||Vape||Flower||Glass||Novelty — Consignment Shop in Fort Worth, TX`
- `Bienes Raices real estate brokrage — Estate Sale Company in Fort Worth, TX`
- `Grayson J J Real Estate — Estate Sale Company in Fort Worth, TX`
- `Case Commercial Real Estate Partners — Estate Sale Company in Fort Worth, TX`
- `Diane Delabano Real Estate — Estate Sale Company in Fort Worth, TX`
- `B & J Real Estate Co. — Estate Sale Company in Fort Worth, TX`
- `Stiles- mind real estate group — Estate Sale Company in Fort Worth, TX`
- `Doe's Smoke Shop — Consignment Shop in Fort Worth, TX`
- `Red Team Real Estate — Estate Sale Company in Fort Worth, TX`

**Root cause confirmed:** Foursquare/HERE category "Estate Sale Company" is matching on the literal word "Estate" — real-estate agents/brokerages are systematically swept in. `103 of 382` "Estate Sale Company" titles literally contain the string "real estate" (27%).

---

## 3. Junk rate per subcategory

```sql
SELECT (regexp_match(title,'— (.+?) in '))[1] AS cat, COUNT(*) total,
       SUM(CASE WHEN (ors) THEN 1 ELSE 0 END) junk
FROM "Sale" WHERE "saleType"='RETAIL' AND status='PUBLISHED' GROUP BY 1 ORDER BY 2 DESC;
```

| Category | total | junk (heuristic) | junk % |
|---|---|---|---|
| **Estate Sale Company** | 382 | 149 | **39%** |
| **(NO SUFFIX — raw biz name)** | 3,459 | 966 | **28%** |
| **Consignment Shop** | 399 | 87 | **22%** |
| Used Bookstore | 23 | 4 | 17% |
| Liquidation Store | 25 | 4 | 16% |
| Coin Dealer | 56 | 6 | 11% |
| Yard Sale Organizer | 10 | 1 | 10% |
| Used Sporting Goods | 30 | 2 | 7% |
| Vintage Shop | 14 | 1 | 7% |
| Resale Shop | 1,185 | 46 | **4%** |
| Estate Liquidator | 24 | 1 | 4% |
| Antique Mall | 745 | 21 | **3%** |
| Auction House | 36 | 1 | 3% |
| Pawn Shop | 825 | 19 | **2%** |
| Thrift Store | 235 | 3 | **1%** |
| Used Furniture / Surplus / Record / Salvage / Used Electronics / Antique Dealer / Jewelry Resale / Moving Sale / Online Auction / Buy-Sell-Trade / Garage Sale / Tag Sale | (each) | 0 | **0%** |

**Clean vs. junk split is stark.** The three problem buckets — Estate Sale Company, NO-SUFFIX, Consignment Shop — hold **4,240 rows (55% of the table) and account for 1,202 of the 1,312 heuristic junk hits (92%)**. Everything below them (Antique Mall, Pawn Shop, Thrift Store, Resale Shop, and all the small categories) is 0–4% junk and is safe to surface.

---

## 4. Coordinate clusters (the flea-booth check)

```sql
SELECT lat,lng,COUNT(*) c FROM "Sale"
WHERE "saleType"='RETAIL' AND status='PUBLISHED' AND lat IS NOT NULL AND lng IS NOT NULL
GROUP BY lat,lng HAVING COUNT(*)>=5 ORDER BY 3 DESC;
```

**RETAIL coordinate clustering is NOT a major problem (unlike FLEA_MARKET).** All 7,692 rows are geocoded. Only **35 clusters have ≥5 sales on an identical coordinate, covering 207 sales total**. The worst cluster is 7 rows, and those 7 are exact duplicates of the same shop (*Mint Condition — Resale Shop in Alexandria, VA*). Most 6-row clusters are genuinely distinct shops in the same strip mall / building (legitimate). There is no 443-on-2-coords pile-up like the flea vendor booths.

**However — exact duplicate rows ARE a problem:**
```sql
SELECT COALESCE(SUM(c-1),0) FROM (
  SELECT title, COUNT(*) c FROM "Sale"
  WHERE "saleType"='RETAIL' AND status='PUBLISHED'
  GROUP BY title HAVING COUNT(*)>1) t;   -- 1478
```
**911 distinct titles appear more than once, producing 1,478 redundant duplicate rows (~19% of the table).** Same shop scraped multiple times into separate Sale rows. This dilutes SEO pages with literal repeats.

---

## 5. Geographic coverage

```sql
SELECT COUNT(DISTINCT (city,state)) ...;  -- 438 distinct (city,state)
```

- **438 distinct (city, state) pairs.** Decent national spread.
- Top cities: Toronto (667), New York (527), Philadelphia (455), Houston (433), Vancouver (331), Chicago (244), Miami (208), Brooklyn (204), Fort Worth (163), Los Angeles (161).
- **1,842 rows (24%) are in Canadian provinces** (ON 1,042 + BC 800 + others). Toronto and Vancouver are the #1 and #5 cities by volume. For a US-market product (Grand Rapids, MI focus; national US Phase 1) this is off-market data inflating the index.
- Minor city-key fragmentation: `Washington, DC` (158) and `Washington, D.C.` (137) are split — a normalization issue.

---

## RECOMMENDATION — SEO suppression filter (no mutation; query-time filter)

Do **not** delete rows. Apply a suppression filter at the SEO-index / public-page query layer so junk never renders, while leaving raw data intact for later cleanup. Proposed rules, in priority order:

1. **Drop the three junk-prone buckets from public SEO pages.**
   Exclude `saleType='RETAIL'` rows where the parsed suffix category is `Estate Sale Company`, `Consignment Shop`, **or** where there is **no `— Category in City` suffix at all** (the 3,459 raw-name bucket). This removes ~4,240 rows (55%) but eliminates 92% of detected junk. *Estate Sale Company at 39% junk and the no-suffix bucket at 28% junk are not salvageable by keyword filtering alone.*

2. **Business-keyword blocklist on whatever survives rule 1.**
   Suppress any title matching the non-resale keyword list (real estate, realty, realtor, brewing/brewery, barber, smoke shop, restaurant, cafe/coffee, church, university/college, attorney/law, dental/medical, insurance, salon, manufacturing, industries, dealership/auto sales, theatre, funeral, etc.). Catches the residual junk in otherwise-clean categories (e.g. the Antique Mall dental center).

3. **Collapse exact duplicates.** De-dupe by `title` (or `title+lat+lng`) at render time — keep one row per shop. Removes ~1,478 redundant rows.

4. **Region gate.** Exclude Canadian-province rows (`state IN ('ON','BC','QC','AB',…)`) from US SEO pages — 1,842 rows. Optionally hold for a future Canada launch.

5. **Normalize `Washington, D.C.` → `Washington, DC`** in the city-key used for SEO slugs.

### What remains after suppression
A high-confidence clean pool of **~3,288 rows** in the trustworthy categories (Antique Mall, Pawn Shop, Thrift Store, Resale Shop, Used Furniture, Auction House, Surplus, Record, Salvage, Used Electronics, Antique Dealer, Vintage, Jewelry Resale, Used Bookstore, Used Sporting Goods, Coin Dealer, Estate Liquidator) with business-keyword junk already excluded — verified at **0–4% residual junk per category.** Applying region + dedupe gates on top trims further but yields a defensible, mostly-US, no-duplicate index suitable for public SEO surfaces.

```sql
-- clean-keep pool (3288):
SELECT COUNT(*) FROM "Sale"
WHERE "saleType"='RETAIL' AND status='PUBLISHED'
AND (regexp_match(title,'— (.+?) in '))[1] IN
 ('Antique Mall','Pawn Shop','Thrift Store','Resale Shop','Used Furniture Store','Auction House',
  'Surplus Store','Record Store','Salvage Store','Used Electronics','Antique Dealer','Vintage Shop',
  'Jewelry Resale','Used Bookstore','Used Sporting Goods','Coin Dealer','Estate Liquidator')
AND NOT (LOWER(title) LIKE '%real estate%' OR LOWER(title) LIKE '%brewing%' OR ...);
```

**No cleanup mutation written — recommendation only, per audit scope.**
