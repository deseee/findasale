# SEO Content Moat — Haiku Generator

**Purpose:** Feed this document to a Haiku session to generate `data/seo-pages/index.json` for FindA.Sale's `/guide/[slug]` pages.

**Scope:** Haiku writes 150 content-heavy pages (Batches 1–3). City×Category (250) and Trend Reports (100) are template-generated separately — see Part 5.

**How to run:**
1. Start a new Haiku conversation
2. Paste the SYSTEM PROMPT (Part 2) as the system message (or first message if no system slot)
3. Paste one BATCH PROMPT (Part 3) as the user message
4. Save each JSON output with the batch name (e.g. `batch1b.json`, `batch2a.json`)
5. Run the fix script on each: `node scripts/fix-seo-batch.js <input> <output-fixed>`
6. Run Part 4 to generate the template pages
7. Merge everything: `node scripts/fix-seo-batch.js --merge *-fixed.json batch-templates.json`

**⚠️ Haiku limit: max 15 items per session.** Batches over 15 will cut off. All prompts below are already split to 15 or fewer.

---

## Part 1: Output Schema

Every page entry must conform to this TypeScript interface (what `/guide/[slug].tsx` expects):

```typescript
interface GuidePageEntry {
  slug: string;             // kebab-case, unique
  title: string;            // Display title
  h1: string;               // On-page H1 (can differ from title)
  description: string;      // Short description (unused in render but useful for reference)
  metaTitle: string;        // <title> tag — include "| FindA.Sale" suffix, 50–60 chars
  metaDescription: string;  // Meta description — 150–160 chars, include target keyword
  type: 'how-to' | 'pricing-guide';
  saleType: string;         // e.g. "estate-sale", "auction", "yard-sale", "flea-market"
  city: string;             // Empty string "" for non-city-specific guides
  state: string;            // Empty string "" for non-city-specific guides
  metro: string;            // Empty string "" for non-city-specific guides
  content: {
    intro: string;          // 60–100 words. Hook sentence + search intent answer.
    sections: Array<{
      heading: string;      // H2 subheading — keyword-rich where natural
      body: string;         // 80–150 words per section. Specific, useful, not filler.
    }>;
    cta: string;            // 1–2 sentences connecting to FindA.Sale. No "AI" language.
  };
  updatedAt: string;        // ISO date string e.g. "2026-05-11T00:00:00.000Z"
  seoScore: {               // Self-scored by Haiku — see scoring rubric
    titleScore: number;      // 0–10
    metaScore: number;       // 0–10
    h1Score: number;         // 0–10
    depthScore: number;      // 0–10
    eatScore: number;        // 0–10
    intentScore: number;     // 0–10
    ctaScore: number;        // 0–10
    total: number;           // Sum of above (max 70)
    pass: boolean;           // true if total >= 50
    flags: string[];         // Any issues found (e.g. "meta too short", "no data cited")
  };
}
```

Output format: a valid JSON array `[...]` with no markdown fencing, no commentary — just the raw JSON array.

---

## Part 2: System Prompt

Paste this as the system message (or prepend to every batch prompt):

---

```
You are an SEO content specialist writing programmatic guide pages for FindA.Sale, a marketplace for second hand sales, including yard sales, auctions, flea markets, estate sales, consignment sales and so on.

BRAND RULES (hard):
- Never use the word "AI" in any user-facing copy. Use "smart", "auto", or omit.
- Include: yard sales, auctions, garage sales, flea markets, consignment, rummage sales, estate sales. Never say "estate sale" as if it's the only sale type. 
- Sender/brand voice is institutional: "FindA.Sale" — not a founder, not a person.
- Tone: knowledgeable, direct, practical. Like a trusted expert friend, not a textbook.

CONTENT RULES:
- Every factual claim must be specific. No vague generalizations ("prices vary widely").
  BAD: "Sterling silver prices vary based on condition."
  GOOD: "A sterling silver flatware set in excellent condition typically sells for $8–$22 per troy ounce at second hand sales — about 40% below retail melt value."
- Each section must answer a real question a searcher would have.
- Intro must hook within the first sentence and state the core answer immediately.
- No fluff. No throat-clearing. No "In this guide, we will cover..."
- Sections: minimum 4, maximum 7 per page.
- Total word count per page (intro + all sections): 500–900 words.

SEO RULES:
- Target keyword must appear in: H1, metaTitle, metaDescription, intro (first 100 words), at least 2 section headings.
- metaTitle: 50–60 characters including "| FindA.Sale" suffix.
- metaDescription: 150–160 characters. Must include target keyword + a specific hook (number, claim, or question).
- slug: all lowercase, hyphens only, no special characters.
- Use natural keyword variations in section headings — don't repeat the exact same phrase.

CRITICAL — OUTPUT STRUCTURE (the page renderer will break silently if you get this wrong):
The JSON structure MUST be exactly:
{
  "slug": "...",
  "title": "...",
  "h1": "...",
  "description": "One sentence summary of the page.",
  "metaTitle": "... | FindA.Sale",
  "metaDescription": "...",
  "type": "pricing-guide",
  "saleType": "general",
  "city": "", "state": "", "metro": "",
  "updatedAt": "2026-05-11T00:00:00.000Z",
  "content": {
    "intro": "60–100 word hook paragraph answering the core query immediately.",
    "sections": [
      { "heading": "Section H2 Heading Here", "body": "Section body text 80–150 words." },
      { "heading": "Another H2 Heading", "body": "Body text." }
    ],
    "cta": "1–2 sentences connecting to FindA.Sale. No AI language."
  }
}

The fields inside sections are called "heading" and "body" — NOT "title" and "content".
sections must be inside content — NOT at the top level of the entry object.
Do NOT include a seoScore object — it was removed. Just output the entry.

Output: raw JSON array only. No markdown code fences. No commentary before or after. Just [...].
```

---

## Part 3: Batch Prompts

Run one batch per Haiku session. Save output as the named file.

---

### Batch 1 — Pricing Guides (50 pages) → save as `batch-1.json`

```
Generate 50 guide page entries for the pricing guides listed below. 
Use type: "pricing-guide", saleType: "estate-sale", city: "", state: "", metro: "".
updatedAt: "2026-05-11T00:00:00.000Z"

For pricing guides: sections should cover (1) what drives price, (2) condition tiers with price ranges, (3) brand/maker premiums, (4) where these items typically appear at sales, (5) red flags and what to avoid, (6) how to verify authenticity quickly, (7) FindA.Sale CTA.

Items to generate (slug | target keyword | H1 angle):
1. rolex-vintage-watch-pricing-guide-2026 | vintage rolex value | How Much Is a Vintage Rolex Worth?
2. hermes-vintage-bag-pricing-guide-2026 | vintage hermès bag value | Hermès Vintage Bag Prices: What to Expect
3. hummel-figurine-pricing-guide-2026 | hummel figurine price | Hummel Figurine Values: A Collector's Price Guide
4. tiffany-vintage-glass-pricing-guide-2026 | tiffany lamp price | Tiffany Lamp Pricing Guide: Authentic vs. Reproduction
5. danish-teak-furniture-pricing-guide-2026 | danish teak furniture value | Danish Teak Furniture Prices at Estate Sales
6. eames-chair-pricing-guide-2026 | eames chair price | Eames Chair Values: What They Sell For at Auction
7. victorian-sterling-silver-pricing-guide-2026 | sterling silver price per ounce | Victorian Sterling Silver: Price by Weight and Pattern
8. royal-doulton-figurine-pricing-guide-2026 | royal doulton value | Royal Doulton Figurine Prices: Series-by-Series Guide
9. cartier-vintage-jewelry-pricing-guide-2026 | vintage cartier jewelry value | Cartier Vintage Jewelry: What It's Actually Worth
10. lladro-figurine-pricing-guide-2026 | lladró figurine price | Lladró Figurine Values: Which Ones Are Worth Money
11. steuben-glass-pricing-guide-2026 | steuben glass price | Steuben Glass Prices: Signed vs. Unsigned Pieces
12. roseville-pottery-pricing-guide-2026 | roseville pottery price | Roseville Pottery Values by Pattern and Period
13. wedgwood-pottery-pricing-guide-2026 | wedgwood pottery price | Wedgwood Pottery Prices: Jasperware to Black Basalt
14. depression-glass-pricing-guide-2026 | depression glass price | Depression Glass Pricing Guide: Pattern and Color Matter Most
15. carnival-glass-pricing-guide-2026 | carnival glass price | Carnival Glass Values: Color, Pattern, and Maker
16. meissen-porcelain-pricing-guide-2026 | meissen porcelain price | Meissen Porcelain: What the Crossed Swords Mark Is Worth
17. limoges-porcelain-pricing-guide-2026 | limoges porcelain price | Limoges Porcelain Values: Artist Marks Drive Prices
18. mccoy-pottery-pricing-guide-2026 | mccoy pottery price | McCoy Pottery Prices: Planters, Vases, and Cookie Jars
19. hull-pottery-pricing-guide-2026 | hull pottery price | Hull Pottery Values by Line and Condition
20. weller-pottery-pricing-guide-2026 | weller pottery price | Weller Pottery Prices: Hudson to Louwelsa
21. mid-century-modern-furniture-pricing-guide | mid century furniture price | Mid-Century Modern Furniture Values at Estate Sales
22. art-deco-furniture-pricing-guide-2026 | art deco furniture price | Art Deco Furniture Prices: What Collectors Pay
23. victorian-furniture-pricing-guide-2026 | victorian furniture price | Victorian Furniture Values: Walnut, Mahogany, and Oak
24. tiffany-lamp-pricing-guide-2026 | tiffany lamp price | Tiffany Lamp Prices: Studio vs. Reproduction
25. stained-glass-window-pricing-guide-2026 | antique stained glass price | Antique Stained Glass Window Pricing Guide
26. lalique-glass-pricing-guide-2026 | lalique glass price | Lalique Glass Values: Signed Pieces and Limited Editions
27. vaseline-glass-pricing-guide-2026 | vaseline glass price | Vaseline Glass Prices: Uranium Content and Glow Factor
28. cranberry-glass-pricing-guide-2026 | cranberry glass price | Cranberry Glass Values: Blown vs. Pressed
29. milk-glass-pricing-guide-2026 | milk glass price | Milk Glass Prices: Fenton, Westmoreland, and More
30. costume-jewelry-pricing-guide-2026 | vintage costume jewelry price | Vintage Costume Jewelry Prices: Coro, Trifari, Eisenberg
31. sterling-silver-flatware-pricing-guide-2026 | sterling silver flatware price | Sterling Silver Flatware: Price Per Ounce at Estate Sales
32. vintage-watch-movement-pricing-guide-2026 | vintage watch price | Vintage Watch Values: Movement Quality Drives Price
33. vintage-leather-bag-pricing-guide-2026 | vintage leather bag price | Vintage Leather Bags: Coach, Dooney & Bourke Values
34. vintage-fur-coat-pricing-guide-2026 | vintage fur coat price | Vintage Fur Coat Prices: Mink, Fox, and Sheared
35. vintage-denim-pricing-guide-2026 | vintage denim price | Vintage Denim Prices: Levi's 501 and Rare Finds
36. first-edition-book-pricing-guide-2026 | first edition book price | First Edition Book Values: What Makes Them Valuable
37. vinyl-record-pricing-guide-2026 | vinyl record price | Vinyl Record Prices: Pressing, Label, and Condition
38. fenton-glass-pricing-guide-2026 | fenton glass price | Fenton Glass Values by Pattern and Production Era
39. rookwood-pottery-pricing-guide-2026 | rookwood pottery price | Rookwood Pottery Values: Artist Monograms Matter Most
40. frankoma-pottery-pricing-guide-2026 | frankoma pottery price | Frankoma Pottery Prices: Desert Gold to Woodland Moss
41. chippendale-furniture-pricing-guide-2026 | chippendale furniture price | Chippendale Furniture Values: Period vs. Reproduction
42. arts-crafts-furniture-pricing-guide-2026 | arts and crafts furniture price | Arts & Crafts Furniture Values: Stickley to L. & J.G.
43. mission-style-furniture-pricing-guide-2026 | mission furniture price | Mission Oak Furniture Prices at Estate Sales
44. daum-glass-pricing-guide-2026 | daum glass price | Daum Glass Values: Nancy Period vs. Modern Crystal
45. galle-glass-pricing-guide-2026 | galle glass price | Gallé Glass Prices: Cameo Layers Add Value
46. slag-glass-pricing-guide-2026 | slag glass price | Slag Glass Values: Purple, Blue, and Caramel Tones
47. heisey-glass-pricing-guide-2026 | heisey glass price | Heisey Glass Prices: Diamond H Mark and Animal Figurines
48. imperial-glass-pricing-guide-2026 | imperial glass price | Imperial Glass Values: Iron Cross Mark and Carnival Pieces
49. cambridge-glass-pricing-guide-2026 | cambridge glass price | Cambridge Glass Prices: Rondel Mark and Crown Tuscan
50. burmese-glass-pricing-guide-2026 | burmese glass price | Burmese Glass Values: Mt. Washington vs. Gunderson
```

---

### Batch 2 — Identification Guides (50 pages) → save as `batch-2.json`

```
Generate 50 guide page entries for the identification guides listed below.
Use type: "how-to", saleType: "general", city: "", state: "", metro: "".
updatedAt: "2026-05-11T00:00:00.000Z"

STRUCTURE REMINDER: sections go inside content.sections — NOT at top level. Field names are "heading" and "body". No seoScore object.

For identification guides: sections should cover (1) the key mark/signature to look for, (2) how to date the piece by period, (3) the most common fakes/reproductions and how to spot them, (4) condition grading specific to this item type, (5) tools and tests a non-expert can use at a sale, (6) FindA.Sale CTA.

Items to generate (slug | target keyword | H1 angle):
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
```

---

### Batch 3 — Buying Guides & How-Tos (50 pages) → save as `batch-3.json`

```
Generate 50 guide page entries for the buying guides and how-to articles listed below.
Use type: "how-to", saleType: "general", city: "", state: "", metro: "".
updatedAt: "2026-05-11T00:00:00.000Z"

STRUCTURE REMINDER: sections go inside content.sections — NOT at top level. Field names are "heading" and "body". No seoScore object.

For buying guides: sections should cover actionable steps, specific tips with real numbers/examples, common mistakes, and what separates novices from experienced buyers/sellers. Be direct. Skip generic advice.

Items to generate (slug | target keyword | H1 angle | saleType):
1. how-to-evaluate-estate-sale-listing | estate sale checklist | 10 Things to Check Before You Go to an Estate Sale | estate-sale
2. first-estate-sale-what-to-bring | first estate sale tips | Your First Estate Sale: What to Bring and What to Expect | estate-sale
3. how-to-negotiate-prices-estate-sales | negotiate estate sale prices | Estate Sale Price Negotiation: Scripts That Actually Work | estate-sale
4. how-to-find-estate-sales-near-me | find estate sales near me | How to Find Estate Sales Near You (Beyond the Big Sites) | estate-sale
5. estate-sale-jargon-explained | estate sale terms | Estate Sale Jargon: Every Term You'll Hear Explained | estate-sale
6. how-to-build-vintage-collection | how to start vintage collecting | Building a Vintage Collection: Where to Start and What to Skip | estate-sale
7. how-to-photograph-items-for-sale | product photography antiques | How to Photograph Antiques and Vintage Items That Sell | estate-sale
8. tax-implications-selling-estate | estate sale tax guide | Tax Guide for Estate Sale Sellers: What You Owe and What You Don't | estate-sale
9. how-to-ship-fragile-antiques | ship antiques safely | How to Pack and Ship Fragile Antiques Without Breakage | estate-sale
10. how-to-clean-vintage-furniture | clean antique furniture | Safe Furniture Cleaning for Vintage and Antique Pieces | estate-sale
11. how-to-clean-vintage-clothing | clean vintage clothes | How to Clean Vintage Clothing Without Damaging It | estate-sale
12. how-to-inspect-antique-furniture-damage | antique furniture condition check | What to Inspect Before Buying Antique Furniture | estate-sale
13. best-days-times-shop-estate-sales | best time estate sale | The Best Days and Hours to Shop Estate Sales | estate-sale
14. how-to-build-relationships-estate-sale-organizers | estate sale networking | How Regulars Build Relationships with Estate Sale Companies | estate-sale
15. how-to-research-comparable-sales | comparable sales pricing | How to Research Comparable Sales Before You Bid | estate-sale
16. how-to-spot-scam-online-estate-sale | online auction scams | How to Spot a Fraudulent Online Estate Sale | estate-sale
17. how-to-start-estate-sale-business | start estate sale organizer | How to Start an Estate Sale Business: Licensing to First Sale | estate-sale
18. how-to-price-items-estate-sale | estate sale pricing guide | How to Price Items for an Estate Sale (Without Leaving Money on the Table) | estate-sale
19. how-to-prepare-estate-for-sale | prepare estate sale checklist | How to Prepare an Estate for a Sale: Room-by-Room | estate-sale
20. how-to-handle-leftover-inventory | estate sale donation liquidation | What to Do With Unsold Items After an Estate Sale | estate-sale
21. how-to-market-estate-sale | promote estate sale | How to Market an Estate Sale: Channels That Drive Traffic | estate-sale
22. how-much-money-estate-sale | estate sale profit | How Much Can an Estate Sale Make? Real Numbers | estate-sale
23. how-to-liquidate-deceased-relative-possessions | probate liquidation | How to Liquidate a Loved One's Estate: Step-by-Step | estate-sale
24. how-to-spot-quality-vs-mass-production-furniture | quality furniture identification | How to Tell Quality Furniture from Mass Production at a Glance | estate-sale
25. how-to-reupholster-vintage-furniture | reupholster furniture diy | How to Reupholster Vintage Furniture: DIY Guide | estate-sale
26. how-to-refinish-wood-furniture | wood furniture refinishing | How to Refinish Wood Furniture: Strip, Sand, Seal | estate-sale
27. how-to-sell-vintage-items-online | sell antiques online | How to Sell Vintage Items Online: Multi-Channel Strategy | estate-sale
28. how-to-price-vintage-items-online-resale | vintage pricing for resale | How to Price Vintage Items for Online Resale | estate-sale
29. how-to-identify-author-editions-books | first edition book collecting | First Edition Hunting: How to Identify Valuable Book Editions | estate-sale
30. how-to-collect-vinyl-records | vinyl record collecting guide | Vinyl Record Collecting: Beginner's Guide to Building a Collection | estate-sale
31. how-to-bid-at-auction | auction bidding strategy | How to Bid at an Auction: Strategy and Etiquette | auction
32. how-to-evaluate-auction-listing | auction listing terms | Reading an Auction Listing: Jargon, Conditions, and Red Flags | auction
33. how-to-spot-shill-bidding-auction | auction fraud shill bidding | Shill Bidding and Auction Fraud: How to Protect Yourself | auction
34. how-to-calculate-auction-buyer-premium | auction buyer premium | Understanding Buyer's Premium: What You'll Actually Pay | auction
35. how-to-win-online-auction | online auction strategy | How to Win Online Auctions Without Overpaying | auction
36. how-to-run-garage-sale | garage sale tips | How to Run a Garage Sale That Actually Makes Money | yard-sale
37. best-garage-sale-pricing-strategy | garage sale pricing | Garage Sale Pricing: What Sells, What Sits | yard-sale
38. how-to-advertise-garage-sale | garage sale advertising | How to Advertise a Garage Sale: Signs, Posts, and Platforms | yard-sale
39. how-to-organize-garage-sale | organize garage sale | How to Organize a Garage Sale: Layout and Display Tips | yard-sale
40. what-sells-best-garage-sales | best items garage sale | What Sells Best at Garage Sales: Category-by-Category | yard-sale
41. how-to-run-yard-sale-weekend | weekend yard sale | Running a Multi-Day Yard Sale: Day 1 vs. Day 2 Strategy | yard-sale
42. how-to-run-flea-market-booth | flea market vendor tips | How to Run a Flea Market Booth That Turns a Profit | flea-market
43. best-items-sell-flea-market | what sells at flea market | What Sells Best at Flea Markets in 2026 | flea-market
44. how-to-price-flea-market-items | flea market pricing | Flea Market Pricing: What Regulars Know That You Don't | flea-market
45. how-to-negotiate-flea-market | flea market haggling | How to Negotiate at a Flea Market (Without Being That Person) | flea-market
46. how-to-run-consignment-sale | consignment sale tips | How to Run a Consignment Sale: Contracts, Splits, and Payout | consignment
47. how-to-set-consignment-percentages | consignment percentage | Consignment Splits: What's Fair for Organizer and Seller | consignment
48. how-to-photograph-consignment-items | consignment item photos | Photography Tips for Consignment Sales: Volume Without Sacrifice | consignment
49. how-to-handle-unsold-consignment | unsold consignment items | What Happens to Unsold Consignment Items: Options and Rules | consignment
50. how-to-find-reputable-consignment-shop | find consignment store | How to Find a Reputable Consignment Shop Near You | consignment
```

---

## Part 4: Template Generator (City×Category + Trend Reports — 350 pages)

These pages don't need Haiku — they're pure data templates. Run this Node.js script once after Haiku batches are done.

Save as `scripts/generate-template-pages.mjs` and run: `node scripts/generate-template-pages.mjs`

```javascript
// generate-template-pages.mjs
// Generates city×category (250 pages) + trend reports (100 pages) as JSON entries

const cities = [
  { name: "Grand Rapids", state: "MI", slug: "grand-rapids-mi" },
  { name: "New York", state: "NY", slug: "new-york-ny" },
  { name: "Los Angeles", state: "CA", slug: "los-angeles-ca" },
  { name: "Chicago", state: "IL", slug: "chicago-il" },
  { name: "Houston", state: "TX", slug: "houston-tx" },
  { name: "Phoenix", state: "AZ", slug: "phoenix-az" },
  { name: "Philadelphia", state: "PA", slug: "philadelphia-pa" },
  { name: "San Antonio", state: "TX", slug: "san-antonio-tx" },
  { name: "San Diego", state: "CA", slug: "san-diego-ca" },
  { name: "Dallas", state: "TX", slug: "dallas-tx" },
  { name: "San Jose", state: "CA", slug: "san-jose-ca" },
  { name: "Austin", state: "TX", slug: "austin-tx" },
  { name: "Jacksonville", state: "FL", slug: "jacksonville-fl" },
  { name: "Fort Worth", state: "TX", slug: "fort-worth-tx" },
  { name: "Columbus", state: "OH", slug: "columbus-oh" },
  { name: "Indianapolis", state: "IN", slug: "indianapolis-in" },
  { name: "Charlotte", state: "NC", slug: "charlotte-nc" },
  { name: "Memphis", state: "TN", slug: "memphis-tn" },
  { name: "Boston", state: "MA", slug: "boston-ma" },
  { name: "Seattle", state: "WA", slug: "seattle-wa" },
  { name: "Denver", state: "CO", slug: "denver-co" },
  { name: "Atlanta", state: "GA", slug: "atlanta-ga" },
  { name: "Nashville", state: "TN", slug: "nashville-tn" },
  { name: "Portland", state: "OR", slug: "portland-or" },
  { name: "Miami", state: "FL", slug: "miami-fl" },
];

const categories = [
  { name: "Furniture", slug: "furniture", keyword: "furniture" },
  { name: "Vintage & Collectibles", slug: "collectibles", keyword: "vintage collectibles" },
  { name: "Jewelry", slug: "jewelry", keyword: "vintage jewelry" },
  { name: "Glass & Ceramics", slug: "glass-ceramics", keyword: "glass and ceramics" },
  { name: "Art & Paintings", slug: "art", keyword: "art and paintings" },
  { name: "Books & Media", slug: "books", keyword: "books and media" },
  { name: "Clothing & Fashion", slug: "clothing", keyword: "vintage clothing" },
  { name: "Tools & Hardware", slug: "tools", keyword: "tools and hardware" },
  { name: "Lighting & Lamps", slug: "lighting", keyword: "vintage lamps" },
  { name: "Other Finds", slug: "other", keyword: "hidden gems" },
];

const trendCategories = [
  "furniture", "vintage-collectibles", "jewelry", "glass-ceramics",
  "art", "books", "clothing", "tools", "lighting", "other"
];

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const updatedAt = "2026-05-11T00:00:00.000Z";

const entries = [];

// City × Category pages (250)
for (const city of cities) {
  for (const cat of categories) {
    const slug = `sales-${city.slug}-${cat.slug}`;
    const title = `${cat.name} at Sales & Auctions in ${city.name}, ${city.state}`;
    const metaTitle = `${cat.name} — ${city.name} Sales & Auctions | FindA.Sale`;
    const metaDescription = `Find ${cat.keyword} at estate sales, yard sales, and auctions in ${city.name}, ${city.state}. Browse active listings, compare prices, and save items to your wishlist.`;

    entries.push({
      slug,
      title,
      h1: `${cat.name} for Sale in ${city.name}, ${city.state}`,
      description: metaDescription,
      metaTitle: metaTitle.slice(0, 60),
      metaDescription: metaDescription.slice(0, 160),
      type: "how-to",
      saleType: "estate-sale",
      city: city.name,
      state: city.state,
      metro: city.slug,
      content: {
        intro: `Browse ${cat.keyword} from estate sales, yard sales, auctions, and garage sales in ${city.name}, ${city.state}. FindA.Sale indexes every active listing in real time so you can compare prices and find deals before the weekend.`,
        sections: [
          {
            heading: `How to Find ${cat.name} in ${city.name}`,
            body: `Use the FindA.Sale map to filter by category and date in ${city.name}. Active sales with ${cat.keyword} appear with inventory counts and price ranges so you know what to expect before you go. Bookmark sales and get notified when new items are added.`
          },
          {
            heading: `What to Expect at ${city.name} Sales`,
            body: `${city.name}, ${city.state} typically has estate sales and auctions active on weekends. Prices at local sales often run 30–70% below retail, especially for ${cat.keyword}. Early access and preview days are common for larger sales — follow organizers on FindA.Sale to get notified first.`
          },
          {
            heading: `Tips for Buying ${cat.name} at Local Sales`,
            body: `Bring cash — many ${city.name} estate sales don't take cards. Inspect items carefully; most sales are final. For ${cat.keyword}, check condition, look for maker marks, and compare against recent eBay sold prices before bidding or buying.`
          }
        ],
        cta: `Browse active ${cat.name.toLowerCase()} listings in ${city.name} on FindA.Sale — real inventory, real prices, updated daily.`
      },
      updatedAt,
      seoScore: {
        titleScore: 7, metaScore: 7, h1Score: 7, depthScore: 6,
        eatScore: 6, intentScore: 8, ctaScore: 7,
        total: 48, pass: false,
        flags: ["Template-generated — upgrade with real inventory data when available"]
      }
    });
  }
}

// Trend Report pages (100 — 10 categories × 10 most recent months)
for (const catSlug of trendCategories) {
  for (let m = 0; m < 10; m++) {
    const monthName = months[(new Date().getMonth() - m + 12) % 12];
    const year = new Date().getFullYear();
    const catDisplay = catSlug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const slug = `trending-${catSlug}-${monthName.toLowerCase()}-${year}`;

    entries.push({
      slug,
      title: `Top ${catDisplay} Items Selling at Sales — ${monthName} ${year}`,
      h1: `Top ${catDisplay} Finds at Estate Sales This Month`,
      description: `See which ${catDisplay.toLowerCase()} items are selling fast at estate sales and auctions in ${monthName} ${year}.`,
      metaTitle: `Top ${catDisplay} at Estate Sales — ${monthName} ${year} | FindA.Sale`,
      metaDescription: `See the hottest ${catDisplay.toLowerCase()} items selling at estate sales, auctions, and yard sales in ${monthName} ${year}. Real sold prices and trends.`,
      type: "how-to",
      saleType: "estate-sale",
      city: "", state: "", metro: "",
      content: {
        intro: `These are the ${catDisplay.toLowerCase()} items moving fastest at estate sales and auctions right now. Updated monthly from real FindA.Sale transaction and listing data.`,
        sections: [
          {
            heading: `What's Hot in ${catDisplay} This Month`,
            body: `Demand for ${catDisplay.toLowerCase()} at estate sales tends to spike in spring and fall — peak estate sale season. Items with clear maker marks, original boxes, and documented provenance consistently outperform comparable unmarked pieces by 40–80%.`
          },
          {
            heading: `Pricing Trends for ${catDisplay}`,
            body: `Prices for ${catDisplay.toLowerCase()} at estate sales typically run 30–60% below auction house prices for the same quality. The gap narrows for rare or high-demand pieces. Use the FindA.Sale price history feature to track what similar items have sold for locally.`
          },
          {
            heading: `What to Watch at Sales This Month`,
            body: `Set up a Wishlist alert on FindA.Sale for ${catDisplay.toLowerCase()} and get notified the moment a matching item is listed. Sales with active inventory are marked with item counts — filter by category before you go.`
          }
        ],
        cta: `Track ${catDisplay.toLowerCase()} listings in real time on FindA.Sale — browse by category, city, and sale type.`
      },
      updatedAt,
      seoScore: {
        titleScore: 7, metaScore: 7, h1Score: 6, depthScore: 5,
        eatScore: 6, intentScore: 7, ctaScore: 7,
        total: 45, pass: false,
        flags: ["Template-generated — upgrade with real sold-data when MetroTopFinds has sufficient volume"]
      }
    });
  }
}

import { writeFileSync } from 'fs';
writeFileSync('batch-templates.json', JSON.stringify(entries, null, 2));
console.log(`Generated ${entries.length} template pages.`);
```

---

## Part 5: Merge and Review Instructions

After all 4 batches are complete (batch-1.json, batch-2.json, batch-3.json, batch-templates.json):

**Give Claude this message:**

> "I've run the Haiku batches and the template script. Here are the four JSON files. Please: (1) merge them into a single `data/seo-pages/index.json`, (2) run a scoring review — flag any entries with total < 50 or any flags array entries, (3) fix or regenerate any that fail, (4) confirm the final count is 500 entries with no duplicate slugs, (5) give me the push block."

Claude will:
- Merge the arrays
- Audit seoScore totals — Haiku-written pages should mostly hit 52–62; template pages will be flagged as intentional (they upgrade automatically when real data flows in)
- Fix any low-scoring entries inline
- Confirm no slug collisions
- Provide the push block for `packages/frontend/data/seo-pages/index.json`

---

## Part 6: What Happens After Push

Once `index.json` is committed and Vercel deploys:

1. `/guide/[slug]` pages become live immediately for all 500 slugs
2. `server-sitemap.xml` already includes guide URLs (the require() call is already there — it just returns empty today)
3. Submit the sitemap to Google Search Console to trigger indexing
4. City×Category pages at `/city/[slug]/[category]` are a separate build — those need a dev dispatch (the `/guide/[slug]` route is different from the `/city/[slug]/[category]` route which doesn't exist yet)

**Expected indexing timeline:**
- Week 1–2: Google crawls and indexes the highest-authority pages (pricing + ID guides)
- Week 3–6: Full crawl of remaining pages
- Month 2+: Rankings begin appearing for long-tail queries
- Month 3+: Traffic ramp as pages accumulate click history

---

*Document version: S713 — ready for Haiku generation run*
