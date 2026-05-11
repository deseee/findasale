# SEO Content Moat — Agent Dispatch (After Reset)

**Status:** 384 of 500 pages live (34 Haiku pricing guides + 350 templates).
Remaining: 116 Haiku-written pages needed.

---

## What's Already Done

- `packages/frontend/data/seo-pages/index.json` exists with 384 entries
- Batch 1 pricing guides (34/50): Rolex → Vintage Fur Coat ✅
- Missing from Batch 1 (items 35–50): vintage denim, first editions, vinyl, Fenton, Rookwood, Frankoma, Chippendale, Arts & Crafts, Mission, Daum, Gallé, slag glass, Heisey, Imperial, Cambridge, Burmese glass
- City×Category pages (250): ✅ generated
- Trend Reports (100): ✅ generated
- Batches 2 and 3 (100 identification + buying guides): NOT generated

**Schema reference:** `seo-pages-haiku-generator.md` Part 1 has the correct interface.

**Fix script:** `scripts/fix-seo-batch.js` handles structural repair on any Haiku output.

---

## Agent Dispatch Prompt

Paste the following as the task for a `general-purpose` agent:

---

**Task:** Generate 116 SEO guide pages and append them to `packages/frontend/data/seo-pages/index.json`.

**Context files to read first:**
1. `packages/frontend/pages/guide/[slug].tsx` — understand the GuidePageProps interface the page expects
2. `packages/frontend/data/seo-pages/index.json` — read the existing entries to understand the format, then append to this file (do NOT overwrite)
3. `seo-pages-haiku-generator.md` — Part 1 (schema) and Part 2 (brand/content/SEO rules)

**Your job:**
Write 116 new guide entries and append them to the existing JSON array in `packages/frontend/data/seo-pages/index.json`. Generate in batches of 15 internally — no need to save separate files.

**Content rules (from seo-pages-haiku-generator.md Part 2):**
- Never use "AI" in copy. Use "smart", "auto", or omit.
- Never say "estate sale" as the only sale type. Use: estate sales, yard sales, auctions, garage sales, flea markets, consignment.
- Every factual claim must be specific with numbers/ranges. No vague generalizations.
- Sections minimum 4, maximum 7. Total 500–900 words per page.
- metaTitle: 50–60 chars including "| FindA.Sale". metaDescription: 150–160 chars.

**Output structure (CRITICAL — page renders blank if wrong):**
```json
{
  "slug": "kebab-case-unique",
  "title": "Display title",
  "h1": "On-page H1",
  "description": "One sentence summary.",
  "metaTitle": "Keyword Phrase 2026 | FindA.Sale",
  "metaDescription": "150-160 char description with keyword and specific hook.",
  "type": "pricing-guide",
  "saleType": "general",
  "city": "", "state": "", "metro": "",
  "updatedAt": "2026-05-11T00:00:00.000Z",
  "content": {
    "intro": "60-100 word hook paragraph.",
    "sections": [
      { "heading": "H2 Section Heading", "body": "80-150 words." }
    ],
    "cta": "1-2 sentences connecting to FindA.Sale."
  }
}
```

**Pages to generate — Batch 1 missing (16 pricing guides, type: "pricing-guide"):**
1. vintage-denim-pricing-guide-2026 | vintage denim price | Vintage Denim Prices: Levi's 501 and Rare Finds
2. first-edition-book-pricing-guide-2026 | first edition book price | First Edition Book Values: What Makes Them Valuable
3. vinyl-record-pricing-guide-2026 | vinyl record price | Vinyl Record Prices: Pressing, Label, and Condition
4. fenton-glass-pricing-guide-2026 | fenton glass price | Fenton Glass Values by Pattern and Production Era
5. rookwood-pottery-pricing-guide-2026 | rookwood pottery price | Rookwood Pottery Values: Artist Monograms Matter Most
6. frankoma-pottery-pricing-guide-2026 | frankoma pottery price | Frankoma Pottery Prices: Desert Gold to Woodland Moss
7. chippendale-furniture-pricing-guide-2026 | chippendale furniture price | Chippendale Furniture Values: Period vs. Reproduction
8. arts-crafts-furniture-pricing-guide-2026 | arts and crafts furniture price | Arts & Crafts Furniture Values: Stickley to L. & J.G.
9. mission-style-furniture-pricing-guide-2026 | mission furniture price | Mission Oak Furniture Prices at Estate Sales
10. daum-glass-pricing-guide-2026 | daum glass price | Daum Glass Values: Nancy Period vs. Modern Crystal
11. galle-glass-pricing-guide-2026 | galle glass price | Gallé Glass Prices: Cameo Layers Add Value
12. slag-glass-pricing-guide-2026 | slag glass price | Slag Glass Values: Purple, Blue, and Caramel Tones
13. heisey-glass-pricing-guide-2026 | heisey glass price | Heisey Glass Prices: Diamond H Mark and Animal Figurines
14. imperial-glass-pricing-guide-2026 | imperial glass price | Imperial Glass Values: Iron Cross Mark and Carnival Pieces
15. cambridge-glass-pricing-guide-2026 | cambridge glass price | Cambridge Glass Prices: Rondel Mark and Crown Tuscan
16. burmese-glass-pricing-guide-2026 | burmese glass price | Burmese Glass Values: Mt. Washington vs. Gunderson

**Batch 2 — Identification Guides (50 pages, type: "how-to"):**
Sections should cover: (1) the key mark/signature to look for, (2) how to date by period, (3) most common fakes and how to spot them, (4) condition grading specific to this item type, (5) tools/tests a non-expert can use at a sale, (6) FindA.Sale CTA in content.cta field.

1. how-to-identify-hummel-figurines | hummel figurine marks | Hummel Marks Explained: How to Date and Authenticate
2. how-to-identify-royal-doulton-figurines | royal doulton marks | Royal Doulton Marks: A Complete Identification Guide
3. how-to-spot-fake-tiffany-lamps | fake tiffany lamp | How to Spot a Fake Tiffany Lamp in 5 Minutes
4. how-to-authenticate-sterling-silver | sterling silver hallmarks | Sterling Silver Hallmarks: The Complete Authentication Guide
5. how-to-date-roseville-pottery | roseville pottery marks | Roseville Pottery Marks: Shape Numbers and Production Dates
6. how-to-identify-steuben-glass | steuben glass signature | Steuben Glass Signatures: Acid Mark vs. Engraved
7. how-to-spot-reproduction-antique-furniture | fake antique furniture | Reproduction vs. Antique Furniture: Wood and Joinery Tell All
8. how-to-authenticate-vintage-rolex | fake rolex watch | Vintage Rolex Authentication: Serial Numbers and Dial Details
9. how-to-spot-fake-hermes-bags | fake hermès bag | How to Spot a Fake Hermès Bag: Stitching, Stamps, Hardware
10. how-to-authenticate-cartier-jewelry | fake cartier jewelry | Cartier Authentication: Case Numbers and Hallmarks
11. how-to-identify-wedgwood-pottery | wedgwood pottery marks | Wedgwood Marks: Jasperware, Creamware, and Black Basalt
12. how-to-identify-meissen-porcelain | meissen sword marks | Meissen Sword Marks: How to Date Crossed Swords
13. how-to-identify-limoges-porcelain | limoges marks | Limoges Marks: Factory vs. Artist Signatures
14. how-to-identify-depression-glass | identify depression glass pattern | Depression Glass Patterns: How to Identify All 100+
15. how-to-identify-carnival-glass | carnival glass makers | Carnival Glass Identification: Iridescence and Pattern Keys
16. how-to-identify-heisey-glass | heisey glass diamond H | Heisey Glass: Finding and Verifying the Diamond H Mark
17. how-to-authenticate-tiffany-sterling-silver | tiffany sterling mark | Tiffany & Co. Sterling Marks: T&Co. vs. Reproductions
18. how-to-spot-fake-lladro-figurines | fake lladró figurines | How to Spot Fake Lladró: Mark, Finish, and Mold Lines
19. how-to-identify-mccoy-pottery | mccoy pottery marks | McCoy Pottery Marks: USA, NM, and the Unmarked Problem
20. how-to-identify-hull-pottery | hull pottery marks | Hull Pottery Marks: Incised, Raised, and Paper Labels
21. how-to-identify-weller-pottery | weller pottery marks | Weller Pottery Marks: Impressed, Ink, and Unsigned Pieces
22. how-to-identify-fenton-glass | fenton glass marks | Fenton Glass Marks: Oval Logo and Paper Labels by Era
23. how-to-identify-lalique-glass | lalique signature | Lalique Signatures: Engraved, Molded, and Acid-Etched
24. how-to-spot-fake-vintage-coins | fake coins numismatic | Fake Coin Detection: Weight, Edge, and Ring Tests
25. how-to-identify-vintage-stamps | stamp rarity identification | Rare Stamp Identification: Perforations, Watermarks, and Printing
26. how-to-authenticate-vintage-coach-bags | fake coach bag | Vintage Coach Authentication: Creed, Stitching, and Hardware
27. how-to-authenticate-vintage-levis | fake levis 501 vintage | Vintage Levi's Authentication: Red Tab, Paper Patch, Rivets
28. how-to-identify-first-edition-books | first edition identification | First Edition Identification: Copyright Page Clues That Matter
29. how-to-authenticate-vinyl-record-pressings | vinyl pressing identification | Vinyl Record Pressing ID: Matrix Numbers and Label Variants
30. how-to-spot-fake-persian-rugs | fake persian rug | How to Spot a Fake Persian Rug: Knots, Back, and Dye
31. how-to-authenticate-vintage-paintings | fake painting authentication | Vintage Painting Authentication: Canvas, Pigment, and Craquelure
32. how-to-authenticate-estate-jewelry | gold testing methods | Estate Jewelry Authentication: Acid Tests and Hallmarks
33. how-to-identify-bisque-china-dolls | antique doll identification | Antique Doll Identification: Bisque, China, and Composition
34. how-to-authenticate-vintage-autographs | fake autograph detection | Authentic vs. Forged Autographs: What Experts Look For
35. how-to-identify-stained-glass-technique | leaded stained glass | Leaded vs. Copper Foil Stained Glass: How to Tell the Difference
36. how-to-identify-victorian-furniture | victorian furniture identification | Victorian Furniture Identification: Carved Details and Joinery
37. how-to-identify-art-deco-furniture | art deco furniture style | Art Deco Furniture Identification: Geometry, Chrome, and Veneers
38. how-to-identify-chippendale-furniture | chippendale style guide | Chippendale Identification: Ball-and-Claw, Cabriole, and Wood
39. how-to-identify-arts-crafts-stickley | stickley furniture identification | Arts & Crafts / Stickley Identification: Marks and Construction
40. how-to-identify-daum-glass | daum glass signature | Daum Signatures: Nancy Period Cameo vs. Modern Crystal
41. how-to-identify-galle-glass | galle glass signature | Gallé Cameo Glass: Reading the Signature and Dating the Piece
42. how-to-identify-animation-cels | animation cel authentication | Animation Cel Authentication: Paper, Paint, and Provenance
43. how-to-identify-fenton-hobnail | fenton hobnail identification | Fenton Hobnail Glass: Colors, Production Dates, and Marks
44. how-to-identify-rookwood-pottery | rookwood pottery marks | Rookwood Pottery Marks: Flame, RP, and Artist Monograms
45. how-to-identify-frankoma-pottery | frankoma pottery marks | Frankoma Pottery Marks: Leopard Paw to Prairie Green
46. how-to-spot-fake-lalique-jewelry | fake lalique jewelry | Fake Lalique Jewelry: Glass vs. Crystal and Mark Verification
47. how-to-identify-art-nouveau-art-deco | art nouveau vs art deco | Art Nouveau vs. Art Deco: Design Differences That Determine Value
48. how-to-identify-vaseline-glass | uranium glass identification | Uranium Glass Identification: The UV Flashlight Test
49. how-to-identify-costume-jewelry-makers | costume jewelry marks | Costume Jewelry Maker Marks: Coro, Trifari, Eisenberg, and More
50. how-to-identify-vintage-leather-goods | vintage leather authentication | Vintage Leather Goods Authentication: Hardware, Stitching, Labels

**Batch 3 — Buying Guides (50 pages, type: "how-to"):**
Sections should cover actionable steps, specific tips with real numbers, common mistakes, and what separates novice from experienced buyers. saleType: "general".

1. how-to-evaluate-estate-sale-listing | estate sale checklist | 10 Things to Check Before You Go to an Estate Sale
2. first-estate-sale-what-to-bring | first estate sale tips | Your First Estate Sale: What to Bring and What to Expect
3. how-to-negotiate-prices-estate-sales | negotiate estate sale prices | Estate Sale Price Negotiation: Scripts That Actually Work
4. how-to-find-estate-sales-near-me | find estate sales near me | How to Find Estate Sales Near You (Beyond the Big Sites)
5. estate-sale-jargon-explained | estate sale terms | Estate Sale Jargon: Every Term You'll Hear Explained
6. how-to-build-vintage-collection | how to start vintage collecting | Building a Vintage Collection: Where to Start and What to Skip
7. how-to-photograph-items-for-sale | product photography antiques | How to Photograph Antiques and Vintage Items That Sell
8. tax-implications-selling-estate | estate sale tax guide | Tax Guide for Estate Sale Sellers: What You Owe and What You Don't
9. how-to-price-estate-sale-items | estate sale pricing | How to Price Estate Sale Items: The Organizer's Framework
10. how-to-run-yard-sale | yard sale tips | How to Run a Yard Sale That Actually Makes Money
11. how-to-stage-estate-sale | estate sale staging | Estate Sale Staging: How Presentation Affects Final Prices
12. how-to-advertise-estate-sale | advertise estate sale | How to Advertise an Estate Sale: Free and Paid Channels
13. how-to-handle-estate-sale-day-of | estate sale day management | Day-Of Estate Sale Management: Staffing, Flow, Cash Handling
14. how-to-price-antiques-without-appraiser | antique pricing without appraisal | Pricing Antiques Without a $300 Appraisal
15. how-to-sell-at-flea-market | flea market tips | How to Sell at a Flea Market: Setup, Pricing, and Traffic
16. how-to-find-best-deals-estate-sales | estate sale deals | How to Find the Best Deals at Estate Sales Every Time
17. how-to-buy-at-auction | buying at auction tips | How to Buy at an Estate Auction: Bidding Strategy for Beginners
18. how-to-spot-underpriced-items-estate-sales | underpriced estate sale finds | Spotting Underpriced Items at Estate Sales
19. how-to-resell-estate-sale-finds | reselling estate sale items | How to Resell Estate Sale Finds for Profit
20. how-to-sell-inherited-items | selling inherited belongings | Selling Inherited Items: What to Keep, Donate, or Sell
21. how-to-evaluate-silver-at-estate-sale | silver at estate sales | How to Quickly Evaluate Silver at an Estate Sale
22. how-to-spot-valuable-art-estate-sales | valuable art estate sales | How to Spot Valuable Art at Estate Sales
23. how-to-buy-vintage-furniture-estate-sales | vintage furniture buying | Vintage Furniture Buying: What to Check Before You Bid
24. how-to-start-antique-reselling-business | antique reselling business | How to Start an Antique Reselling Business from Estate Sales
25. how-to-use-ebay-sold-listings | ebay research antiques | Using eBay Sold Listings to Price Anything at a Sale
26. estate-sale-etiquette | estate sale rules | Estate Sale Etiquette: The Unwritten Rules Buyers Follow
27. how-to-buy-at-consignment-shop | consignment shopping tips | How to Buy at a Consignment Shop: Timing, Pricing, Deals
28. how-to-sell-at-consignment | consignment selling guide | How to Sell at Consignment: Contracts, Splits, and What to Expect
29. how-to-donate-estate-items | donating estate items | What to Donate from an Estate: Organizations That Pick Up
30. how-to-store-antiques-properly | storing antiques | How to Store Antiques and Collectibles Without Damaging Them
31. how-to-clean-antiques-safely | cleaning antiques | How to Clean Antiques Safely: What Works and What Destroys Value
32. how-to-pack-ship-antiques | shipping antiques | How to Pack and Ship Antiques Without Breaking Them
33. how-to-get-estate-appraised | estate appraisal guide | Getting an Estate Appraised: When You Need One and What It Costs
34. how-to-find-estate-sale-company | hire estate sale company | How to Find and Hire an Estate Sale Company
35. how-to-evaluate-estate-sale-company | estate sale company fees | Estate Sale Company Fees: What's Fair and What's a Red Flag
36. how-to-handle-estate-after-death | settling estate belongings | Handling Belongings After a Death: A Practical Timeline
37. how-to-buy-vintage-jewelry-safely | buying vintage jewelry | Buying Vintage Jewelry Safely: Tests, Marks, and Red Flags
38. how-to-buy-vintage-watches | buying vintage watches | Buying Vintage Watches at Estate Sales: What to Check
39. how-to-spot-designer-items-estate-sales | designer items estate sales | How to Spot Designer Items at Estate Sales
40. how-to-value-old-books | old book value | How to Tell If Old Books Are Worth Money
41. how-to-sell-vintage-clothing | selling vintage clothing | How to Sell Vintage Clothing: Platforms, Pricing, Presentation
42. how-to-find-rare-vinyl-records | rare vinyl records | Finding Rare Vinyl Records at Estate Sales and Flea Markets
43. how-to-buy-antique-rugs | buying antique rugs | Antique Rug Buying: Size, Condition, and What Dealers Won't Tell You
44. how-to-liquidate-estate-quickly | fast estate liquidation | How to Liquidate an Estate Quickly Without Leaving Money Behind
45. how-to-buy-tools-estate-sales | vintage tools estate sales | Buying Vintage Tools at Estate Sales: Brands Worth Picking Up
46. how-to-set-consignment-percentages | consignment percentage | Consignment Splits: What's Fair for Organizer and Seller
47. how-to-photograph-consignment-items | consignment item photos | Photography Tips for Consignment Sales: Volume Without Sacrifice
48. how-to-handle-unsold-consignment | unsold consignment items | What Happens to Unsold Consignment Items: Options and Rules
49. how-to-find-reputable-consignment-shop | find consignment store | How to Find a Reputable Consignment Shop Near You
50. how-to-build-buyers-list-estate-sales | estate sale buyer list | How Organizers Build a Loyal Buyer List

**After generating all 116 entries:**
1. Read the current `packages/frontend/data/seo-pages/index.json`
2. Append the 116 new entries to the existing array
3. Write the complete combined array back to `packages/frontend/data/seo-pages/index.json`
4. Run TypeScript check: `cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules`
5. Report: total entry count, any duplicate slugs found, any structural issues

**Acceptance criteria:**
- All 116 entries follow the exact schema above (content.sections with heading/body, not top-level sections)
- No seoScore objects
- No "AI" language in any copy
- No entry uses "estate sale" as the sole sale type in body copy
- saleType: "general" on all entries
- Zero TypeScript errors
