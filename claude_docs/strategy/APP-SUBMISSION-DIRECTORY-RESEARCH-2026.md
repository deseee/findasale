# Where to Submit FindA.Sale — Reconciled Master List (June 2026)

Cross-checked against the existing **Directory & App Listing Submissions** pipeline (roadmap #476–#488), the S814 Table Stakes work, and decisions-log rejections. **Already-done, in-flight, and rejected venues are marked as such — this report only treats as "new" the venues not already in our pipeline.**

FindA.Sale is a **web app / PWA** (no native store flow). Targets split three ways: launch-day spikes, evergreen backlinks + local SEO, and two-sided discovery (organizers + shoppers).

---

## PART A — Already Handled (do not re-do)

### ✅ Done / Live / Submitted
| Venue | Status | Ref |
|---|---|---|
| **G2 + Capterra + GetApp + Software Advice** (one submission covers all 4 via G2 Digital Markets) | ✅ Submitted S952, review pending | #476 |
| **SaaSHub** | ✅ Submitted S956, claimed by Patrick S963 | #480 |
| **Crunchbase** | ✅ Submitted S956 | #481 |
| **Uneed** | ✅ Submitted S956 (waiting line) | #488 |
| **Google Business Profile** | ✅ Created S814 — *Patrick still needs phone verification to go live* | roadmap L44 |
| **Google Merchant Center** (free product listings feed) | ✅ Built + live S808, ~52 products | #463 |
| **MCP server** (mcp.finda.sale) + AI registry submissions | ✅ Live; registry submissions queued S781 | #388 / #462 |

### ⏳ In progress / already queued
| Venue | Status | Ref |
|---|---|---|
| **AlternativeTo** | ⏳ Account created; eligible to submit **June 18, 2026** (age gate) | #477 |
| **Product Hunt** | ⏳ Assets built S956; needs screenshots + hunter + warm-up before launch | #478 |
| **G2 profile optimization** | ⬜ After G2 approves #476 — add eBay/Maps/Stripe/Cloudinary integrations | #479 |
| **SourceForge** (also covers Slashdot) | ⬜ TODO | #482 |
| **Software Finder** | ⬜ TODO | #483 |
| **Trustpilot** | ⬜ TODO (social proof as pipeline scales) | #485 |
| **AppSumo** | ⬜ TODO — time to a paid-tier launch deal | #486 |
| **Roundup outreach** (Gitnux, WifiTalents) | ⏳ Gmail drafts created S956, pending send | #484 |

### ❌ Rejected / blocked (do not re-add)
| Venue | Why | Ref |
|---|---|---|
| **BetaList** | Submit step is paid-only ($39–$299), no free tier, no organic discovery value | #487 ❌ SKIPPED |
| **DIYAuctions** roundup | Competitor — Patrick to delete the draft | #484 |
| **Google Local Inventory Ads** | Needs permanent address per location; incompatible with roving sales | #468 deferred |
| **GSalr.com** (as a data/syndication source) | ToS prohibits aggregation/competing use; $10k/day liquidated damages | #381 PROHIBITED |
| **EstateSales.org, EstatePros, HiBid, LiveAuctioneers, US YellowPages** (as *scrape* sources) | ToS prohibit scraping/aggregation | decisions-log / #473 |

> **Important nuance on that last row:** those bans are about *pulling their data into our pipeline*. Listing *our own* product or posting *our own* sales on them is a different action and is generally allowed — but because several are also direct competitors, treat any listing there as a deliberate call, not an automatic win. Flagged per-venue in Part B.

---

## PART B — Genuinely New Opportunities (not in any current pipeline)

This is the actual output of the deep dive — venues we have **not** already submitted to, rejected, or queued.

### B1 — Local SEO citations (free, high authority) — biggest clean gap ⭐
We did Google Business Profile but skipped the rest of the citation set. These are free, high-DA, and directly serve "estate sales near me" shopper discovery. Use the Paw Paw address (219 E Michigan Ave, Suite F, Paw Paw, MI 49079), identical NAP everywhere.
- **Bing Places** — bingplaces.com ⭐ HIGH
- **Apple Business Connect** — businessconnect.apple.com ⭐ HIGH
- **Yelp for Business** — biz.yelp.com ⭐ HIGH
- **Foursquare** — claim venue (also feeds downstream data aggregators) ⭐ HIGH
- Better Business Bureau (free listing) — MEDIUM
- Yellow Pages (YP.com), Manta, EZlocal — MEDIUM
- Hotfrog, Brownbook, Cylex — LOW
- **Data aggregators** (Data Axle, Neustar Localeze, Acxiom): one push → 300+ downstream directories. Best done later via a citation tool (BrightLocal/Whitespark/Yext). MEDIUM.

### B2 — PWA-specific directories (free, exact-fit, low competition) ⭐
Nobody's touched these and FindA.Sale being a PWA is a genuine advantage here.
- **Appsco.pe** — submit manifest URL ⭐
- **findPWA** — findpwa.com (aim for Verified badge) ⭐
- WebCatalog — webcatalog.io
- progressivewebapp.store / PWA Store — MEDIUM

### B3 — Launch / startup directories (free, beyond what's queued)
- **Hacker News — Show HN** (lead with the PWA + local-marketplace build story) — MEDIUM
- **Indie Hackers** (post as a build/launch story) — MEDIUM
- Fazier, MicroLaunch, TinyLaunch, Peerlist Launchpad, Smol Launch — free curated directories
- BetaPage, Startup Stash, Launching Next, Wellfound, F6S, StartupRanking, TinyStartups — free profiles
- Batch source: github.com/mahseema/awesome-saas-directories (100+ submit links)

### B4 — Other SaaS review directories (free, beyond G2/SaaSHub)
- Tekpon (US editorial), Crozdesk, SaaSworthy, SoftwareSuggest — free listings, MEDIUM
- *(Skip TrustRadius, Clutch, GoodFirms until we can mobilize organizer reviews — review-gated.)*

### B5 — Niche resale / sale-event directories (the high-intent traffic)
**Leverage note:** the garage-sale web is an aggregation network — a few source nodes (YardSaleSearch, YardSales.net, EstateSales.org) get auto-pulled by the popular downstream apps. Posting *our sales* into 2-3 nodes syndicates them widely. **Caveat:** several overlap with our scraper/competitor list (see Part A nuance).
- **GarageSaleFinder.com** — free sale posting. (We scrape it for data; posting our own sales is separate.) HIGH reach.
- **YardSaleSearch.com / YardSales.net** — free posting, source nodes. HIGH.
- **EstateSales.org** — ~$50/sale listing, source node. *Scrape-prohibited but self-listing allowed.* MEDIUM (it's a competitor — deliberate call).
- **AuctionZip** auctioneer directory; **LiveAuctioneers** directory (self-listing) — MEDIUM, auction slice.
- **Flea Market Zone**, Flea Market Insiders/Fleamapket — MEDIUM, flea slice.
- Thrift/antique: **TheThriftShopper.com**, **MyLocalThriftStore.com** (free claimable), **Antique Trader** business directory + free event calendar — MEDIUM.
- Classifieds (cross-post sales, not "submit the app"): Nextdoor, Craigslist garage-sales, Facebook Marketplace, OfferUp, VarageSale — HIGH reach.
- Event calendars: **Eventbrite**, **Patch**, **AmericanTowns** — free event/sale listings, shopper discovery + SEO. MEDIUM.
- **Citywide garage-sale registries** (Westland MI, Taylor MI, etc.): pitch FindA.Sale as the white-label registration + mapping tool. B2G/partnership play, high strategic value. MEDIUM.

### B6 — Trade associations (organizer audience, highest intent)
- **NESA** (nesa-usa.com) — member forums + directory — HIGH
- **ASEL** (aselonline.com) — pitch a resource feature — HIGH
- NAOEL, National Auctioneers Association — MEDIUM

### B7 — Press & communities (net-new channels)
- **Reddit** (build karma first): r/SideProject (launch posts OK), r/estatesales, r/garagesales (value posts), r/flipping (organic only) — HIGH but etiquette-sensitive
- **Antique Trader** news tip → ATNews@aimmedia.com (free event listings too) — HIGH
- **Local GR media**: MLive / Grand Rapids Press, WZZM 13 — HIGH for a local founder story
- The Penny Hoarder (frugal angle), frugal-living blogs (guest posts), reseller podcasts (tool-review pitches), reseller Discords + garage-sale Facebook groups — MEDIUM

---

## Recommended next actions (new-only)

1. **One free sitting (~1-2 hrs):** Bing Places, Apple Business Connect, Yelp, Foursquare (B1) + Appsco.pe, findPWA (B2). All free, high-fit, zero currently done.
2. **Finish the queued pipeline:** AlternativeTo (June 18), Product Hunt launch prep, SourceForge, Trustpilot — already tracked, just execute.
3. **Launch-week batch (with Product Hunt):** Show HN + Indie Hackers + Fazier + MicroLaunch + Peerlist (B3).
4. **Organizer trade push:** NESA + ASEL feature pitch, Antique Trader news tip (B6/B7).
5. **Vertical syndication (deliberate):** decide on EstateSales.org / GarageSaleFinder / YardSaleSearch self-listing given the competitor overlap (B5).

*Reconciled June 12, 2026 against roadmap #462–#488, S814 Table Stakes, and decisions-log. Part A = already accounted for; Part B = net-new.*
