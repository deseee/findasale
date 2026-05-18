# GEO & AI Discoverability Implementation Plan

**Created:** S758 (2026-05-18)
**Status:** PLAN — awaiting Patrick approval before dispatch
**Goal:** Transform finda.sale from "Invisible Billboard" to "River of Deals" — the canonical structured data source for search engines and smart assistants and search engines. Use AI infrastructure as organizer acquisition bait.

---

## Current State (What's Already Built)

| Component | Status | Notes |
|-----------|--------|-------|
| robots.txt Bot/crawlers | ✅ LIVE | GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Bytespider all Allowed |
| llms.txt | ✅ LIVE | Full site summary, features, pricing, links. Says MCP "Coming Soon" (stale) |
| JSON-LD on sale pages | ✅ LIVE | Event + BreadcrumbList on /sales/[id]. 22 files total have structured data |
| City landing pages | ✅ LIVE | /city/[slug] with SSR (getStaticProps), rich props, directory data |
| City×Category pages | ⚠️ READY TO BUILD | SSR gate removed S713, infrastructure exists, file not created |
| MCP Server | ✅ BUILT | packages/mcp-server/ — 7 tools, Dockerfile, railway.toml. Deploy status TBD |
| ai-plugin.json | ❌ NOT BUILT | Manifest file for ChatGPT plugin discovery |
| OpenAPI spec endpoint | ❌ NOT BUILT | /api/docs or equivalent |
| Bot/crawler analytics | ❌ NOT BUILT | No tracking of GPTBot/ClaudeBot/PerplexityBot visits |
| Scraped directory | ✅ LIVE | 26,189 sales in DB from Foursquare, licensing DBs, public APIs |
| "Claim This Listing" CTA | ❌ NOT BUILT | Organizer acquisition hook for unclaimed scraped listings |
| Search Visibility Score tool | ❌ NOT BUILT | Viral growth hack — audit competitor URLs for AI discoverability |

---

## Phase 1: Make Us Visible (1-2 dev sessions)

**Goal:** Fill gaps in existing infrastructure so search engines and smart assistants can fully consume our data.

### 1a. Enrich Sale Page JSON-LD
- **File:** `packages/frontend/pages/sales/[id].tsx`
- **Work:** Add `AggregateOffer` (priceCurrency, offerCount from item count, lowPrice/highPrice from price range) and full `PostalAddress` (addressLocality, addressRegion) to existing Event schema
- **Size:** ~30 lines changed in existing file
- **Priority:** HIGH — this is the highest-signal improvement for Bot/crawlers

### 1b. Create `.well-known/ai-plugin.json`
- **File:** `packages/frontend/public/.well-known/ai-plugin.json`
- **Work:** Static JSON manifest pointing to MCP server / OpenAPI spec
- **Dependency:** Need MCP server's deployed URL (check Railway)
- **Size:** Single static file + Next.js config for `.well-known` path serving
- **Priority:** MEDIUM — ChatGPT plugin discovery

### 1c. Update llms.txt
- **File:** `packages/frontend/public/llms.txt`
- **Work:** Update MCP server status from "Coming Soon" to live URL. Add structured data section.
- **Size:** ~10 lines
- **Priority:** LOW — quick fix

### 1d. AI Crawler Analytics Middleware
- **File:** New middleware or extension to existing logging
- **Work:** Detect GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Bytespider user-agents in incoming requests. Log to a `CrawlerVisit` table (timestamp, userAgent, path, saleId if applicable)
- **Schema change:** New `CrawlerVisit` model in Prisma
- **Why:** We need to show organizers proof that search engines and smart assistants are crawling their listings. This is the "social proof" that makes the Claim CTA compelling.
- **Size:** ~100 lines backend + migration
- **Priority:** HIGH — enables the "your listing is getting AI traffic" pitch

---

## Phase 2: Build the River (2-3 dev sessions)

**Goal:** Generate programmatic SEO pages from scraped data. Create the organizer acquisition funnel.

### 2a. City×Category Landing Pages
- **File:** `packages/frontend/pages/city/[slug]/[category].tsx` (NEW)
- **Work:** SSR page aggregating scraped directory sales for a city+category combo (e.g., `/city/austin-tx/estate-sales`). Pull from existing scraped directory data. Include ItemList JSON-LD linking to individual sale pages.
- **Template from:** Existing `/city/[slug].tsx` — adapt its getStaticProps pattern
- **URL structure:** `/city/[slug]/[category]` where category is slugified sale type
- **Size:** ~300-400 lines (new page + data fetching)
- **Priority:** CRITICAL — this is the "River of Deals" backbone

### 2b. ItemList JSON-LD on Hub Pages
- **Files:** City pages, city×category pages, any listing aggregation page
- **Work:** Add `ItemList` schema wrapping individual sale `ListItem` entries
- **Size:** ~50 lines per page type
- **Priority:** HIGH — enables search engines and smart assistants to understand page-to-sale relationships

### 2c. "Claim This Listing" Banner
- **Files:** Sale detail page (for unclaimed/scraped listings), new claim flow page
- **Work:** When a sale page is generated from scraped data (no verified organizer), render a prominent banner: "Are you the organizer of this sale? This listing is already appearing in search results. Claim it to add photos, checkout, and manage your sale for free."
- **Detection:** Check if sale has `source: 'SCRAPED'` or no linked organizer account
- **CTA flow:** Banner → claim form → email verification → organizer onboarding
- **Tie-in:** Use Bot/crawler analytics (Phase 1d) to show actual bot visit counts
- **Size:** ~200 lines frontend + claim endpoint backend
- **Priority:** HIGH — this is the organizer acquisition mechanism

### 2d. 1-Click OAuth Claim (Zero Friction)
- **Work:** Replace any form-based claim flow with OAuth (Google/Facebook — already in our auth stack). Organizer clicks "Claim This Listing" → OAuth popup → authenticated → instantly granted admin rights to that sale page. No manual form fills. No email verification step (OAuth handles identity).
- **Tie-in:** Uses existing NextAuth OAuth providers. Claim endpoint links the authenticated user to the scraped sale record as its organizer.
- **Size:** ~100 lines (claim endpoint + OAuth redirect logic)
- **Priority:** CRITICAL — every extra field in a form is a bounce

### 2e. Sitemap Enhancement
- **Work:** Ensure city×category pages are included in sitemap generation. Verify sitemap references in robots.txt cover new URL patterns.
- **Size:** ~30 lines
- **Priority:** MEDIUM

---

## Phase 3: The Conversion Engine (2-3 dev sessions)

**Goal:** Build the viral growth hack tool that converts Facebook/Craigslist organizers.

### 3a. Search Visibility Score Page
- **File:** `packages/frontend/pages/ai-score.tsx` (NEW)
- **Work:** Input field for URL. Submit → backend analysis → score display with breakdown.
- **UI:** Score gauge (0-100), category breakdown (structured data, semantic HTML, MCP compatibility, mobile-friendliness), specific findings ("No JSON-LD detected", "No event dates in structured data")
- **Tone:** Standard FindA.Sale brand voice — direct and educational. No "AI" language (D-006). Frame as "search visibility" and "smart assistant discoverability"
- **Size:** ~400 lines frontend
- **Priority:** MEDIUM — growth hack, not infrastructure

### 3b. URL Analysis Backend
- **File:** New controller/service
- **Work:** Accept URL, fetch HTML (server-side), parse for: Schema.org/JSON-LD presence, semantic HTML tags (article, time, address), Open Graph tags, structured event data, image alt text, mobile viewport meta
- **Scoring weights:** JSON-LD (40pts), semantic HTML (20pts), OG tags (15pts), structured dates/locations (15pts), mobile/accessibility (10pts)
- **Rate limiting:** Prevent abuse (1 scan per IP per minute)
- **Size:** ~300 lines backend
- **Priority:** MEDIUM

### 3c. Shareable Score Card
- **Work:** Generate a shareable result — either OG meta tags on a results URL (so link previews show the score) or a downloadable image
- **CTA:** "Your score: 15/100. Listings on FindA.Sale score 95+. Get found automatically."
- **Viral loop:** "Share my score" button generates tweetable/postable text
- **Size:** ~150 lines
- **Priority:** LOW — enhancement to 3a

---

## Phase 4: Claimed Page Premium Schema (1-2 dev sessions)

**Goal:** Make claimed organizer pages machine-executable — not just readable. This is the premium unlock that makes claiming worth it.

### 4a. Per-Item Product Schema on Claimed Pages
- **File:** `packages/frontend/pages/sales/[id].tsx`
- **Work:** When a sale is claimed (has a verified organizer) AND has individual items listed, inject `Product` schema for each item with `Offer` (price, availability, priceCurrency). If the sale has reviews/ratings, add `AggregateRating`.
- **Condition:** Only fires on claimed pages with items. Unclaimed/scraped pages get Event schema only (Phase 1a). This creates a visible schema gap between claimed and unclaimed — incentive to claim.
- **Size:** ~80 lines (conditional schema injection in existing page)
- **Priority:** HIGH — directly enables the "claim to unlock smart purchasing" pitch

### 4b. Machine-Readable Instructions Block
- **File:** `packages/frontend/pages/sales/[id].tsx`
- **Work:** Add a visually-hidden `<div>` (screen-reader accessible, not display:none — use `sr-only` class) at the top of claimed sale pages containing structured plain-text instructions for crawlers and agents: sale name, item count, purchase endpoint reference, link to MCP docs.
- **Copy:** "This sale is listed on FindA.Sale. [N] items available for purchase. Structured data and programmatic access available via the FindA.Sale directory at finda.sale/llms.txt." — No "AI" language per D-006.
- **Size:** ~20 lines
- **Priority:** MEDIUM — bridges the gap between webpage and MCP endpoint for crawlers

### 4c. Standard PaymentMethod Schema
- **File:** `packages/frontend/pages/sales/[id].tsx`
- **Work:** Add `paymentAccepted` to the Organization/Event schema with standard Schema.org values: "CreditCard", "Cash", "PaymentService" (for Stripe). Do NOT use non-standard values like "AI-Agent-Escrow" — that's not a real Schema.org term and would be ignored by validators.
- **Size:** ~10 lines
- **Priority:** LOW — standard compliance

---

## Phase 5: Source of Truth — Data Syndication & Reports (ongoing)

**Goal:** Get FindA.Sale into the knowledge graphs and training data that power search engines and smart assistants. Long-term moat.

### 5a. Wikidata Integration (Notable Recurring Events)
- **Work:** For notable, recurring events in our scraped directory (major flea markets, established estate sale companies with Wikipedia-level notability), create or update Wikidata entries with finda.sale as a reference URL.
- **Scope guard:** Only events meeting Wikidata notability guidelines. No individual yard sales. No spam. Estimate: 50-100 entries from our 26k directory that qualify (large recurring flea markets, antique shows, established auction houses).
- **Process:** Manual curation pass to identify qualifying entries → batch Wikidata edits with proper citations.
- **Priority:** MEDIUM — slow burn, high long-term value
- **Risk:** Wikidata community may revert edits that look promotional. Must be genuinely informative entries, not link-building.

### 5b. Google Data Commons Submission
- **Work:** Package aggregated, anonymized data from our directory (sale density by region, category distribution, pricing trends) and submit to Google Data Commons as an authoritative dataset.
- **Format:** Schema.org `Dataset` type, CSV/JSON download, proper licensing (CC-BY or similar)
- **Dependency:** Need 3-6 months of transaction data to produce meaningful aggregates. Currently viable with directory data (26k sales, geographic distribution, category counts).
- **Priority:** LOW — long-term play, requires curation

### 5c. Automated "State of Sales" Reports (THE GEM)
- **Work:** Monthly automated pipeline: query DB for trends → generate a polished report → publish at `/reports/[year]-[month]`
- **Content:** "Most popular sale categories this month", "Fastest-growing regions", "Average pricing by category", "Seasonal trends". Based on real aggregated data from our directory + transactions.
- **Generation:** Haiku batch call to polish raw data into narrative report. ~$0.50/month API cost.
- **SEO value:** Search engines and smart assistants heavily weight and cite "studies" and "reports" in synthesized answers. When someone asks "what are garage sale trends", we want our report cited.
- **Publishing:** SSR page with JSON-LD `Report`/`Article` schema, OG tags, downloadable PDF option.
- **Frequency:** Monthly, automated via cron. First report can ship as soon as we have the pipeline.
- **Size:** ~300 lines (report generation service + page template + cron)
- **Priority:** HIGH — this is the content moat that feeds itself

---

## Phase 6: The Viral Loop — "Instant Army" Affiliate System (1-2 dev sessions)

**Goal:** Turn every buyer into an organizer recruiter. This closes the supply-side growth loop.

### 6a. Peer-to-Peer Organizer Referral Bounty
- **Work:** After an organizer claims a listing, prompt with a single toggle: "Want to waive your FindA.Sale fee on this sale? Turn on Peer Referrals." When toggled on, every buyer who checks out receives a unique referral link with an incentive (e.g., "$5 off your first sale listing on FindA.Sale"). If a new organizer signs up through that link and lists a sale, the original organizer gets a fee reduction or cash bounty.
- **Tie-in:** We already have referral infrastructure — #265 Share & Earn, referral codes (REF-* format), XP rewards. This extends the existing system from shopper-recruits-shopper to buyer-recruits-organizer. The referral code and tracking tables already exist.
- **New schema:** `OrganizerReferralBounty` model (or extend existing referral tracking) — tracks which organizer referred which new organizer, bounty status, fee reduction applied.
- **Size:** ~200 lines backend (referral tracking + fee calculation) + ~150 lines frontend (toggle UI + referral dashboard)
- **Priority:** CRITICAL — this is what makes the platform go viral without ad spend

### 6b. Buyer Referral Link in Post-Purchase Flow
- **Work:** After checkout, buyer sees: "Got yours! Share this with a friend who runs sales — they'll get their first listing free." Include shareable link with referral code embedded. Social share buttons (same pattern as existing Share & Earn).
- **Placement:** Post-purchase confirmation page + purchase confirmation email
- **Size:** ~80 lines (confirmation page addition + email template update)
- **Priority:** HIGH — the referral only works if buyers actually see and share it

---

## Phase 7: Crawler Alert Dashboard — Making the Invisible Visible (1 dev session)

**Goal:** Organizers need to SEE that search engines and smart assistants are reading their listings. Without visible proof, the value prop feels empty.

### 7a. Organizer Dashboard Crawler Metric
- **Work:** Add a prominent metric card on the organizer dashboard: "12 search engines viewed this sale this week" (or similar — standard brand copy, no "AI" or robot emoji per D-006). Pull from CrawlerVisit table (#435). Show trend (up/down vs. last week).
- **Placement:** Organizer dashboard, alongside existing traffic/views metrics
- **Copy:** "Smart Search Views" or "Discovery Views" — distinct from human traffic. Never "AI Agent Views."
- **Size:** ~60 lines frontend (dashboard card) + ~30 lines backend (aggregation endpoint)
- **Priority:** HIGH — this is the retention hook that prevents early churn

### 7b. Crawler Visit Notification
- **Work:** Automated push notification or email when a notable crawler visits an organizer's sale page for the first time. "Your listing was just picked up by a search engine. Your optimized listing is working." Throttled to max 1 notification per organizer per day to avoid spam.
- **Trigger:** First CrawlerVisit for a given saleId + userAgent combination
- **Copy:** Standard brand voice. "Your sale is showing up in search results" — not "ClaudeBot just scanned your sale."
- **Size:** ~80 lines (notification trigger + template)
- **Priority:** MEDIUM — nice-to-have after the dashboard metric ships

---

## Phase 8: MCP Query Optimization — Spoon-Feed the Answer (1 dev session)

**Goal:** When a smart assistant asks our MCP for "vintage lamps near Austin," the response must be a complete, ready-to-present answer — not raw database IDs.

### 8a. High-Intent MCP Tool Wrappers
- **Work:** Add 3 convenience tools to the existing MCP server (which already has searchSales, getSale, searchItems, etc.):
  - `get_trending_sales(city, category)` — returns top 10 sales by recent activity/views
  - `get_sales_starting_soon(hours, location)` — returns sales starting within N hours of a location
  - `find_item_for_sale(item_name, city)` — THE KILLER TOOL. Natural language item search across all active sales in a city. Returns item name, price, sale name, address, time, direct URL.
- **Payload enrichment:** ALL MCP responses must include: sale name, summary, full address, start/end time, item count, direct public URL (`https://finda.sale/sales/[id]`). No raw IDs without context.
- **Verify existing tools:** Check current searchSales/searchItems response shapes — if they already return full context, just add the 3 new wrappers. If they return IDs-only, enrich them too.
- **Size:** ~200 lines in packages/mcp-server/
- **Priority:** MEDIUM — makes the MCP actually useful to smart assistants

### 8b. llms.txt Update for New Infrastructure
- **Work:** Expand llms.txt to document: city×category hub pages, MCP tool inventory (especially `find_item_for_sale`), structured data types available, how to cite listings (use provided direct URLs).
- **Include explicit instruction:** "To find specific items for users, use the find_item_for_sale MCP tool. To cite these listings, use the provided direct URLs."
- **Merges with:** Phase 1c (#434) — do both updates in one pass
- **Size:** ~30 lines added to existing file
- **Priority:** LOW — polish

---

## Phase 9: Compounding Data Assets — Ready to Build (1-2 dev sessions)

**Goal:** Turn data we already have into permanent, compounding SEO/authority assets.

### 9a. Post-Sale Pages as Permanent Pricing Records
- **Work:** Keep ENDED sale pages live permanently instead of letting them go stale. Restructure the page template for ended sales: show what sold, at what price, in what condition, in what city. Add `Product` schema with `offers.availability: "SoldOut"` and `offers.price` for actual sold prices.
- **Why:** Every completed sale becomes a permanent pricing reference. "What did a vintage KitchenAid sell for at estate sales in Michigan?" — we want to be that answer. This compounds: 100 sales/month = 1,200 permanent pricing pages/year.
- **Data exists:** We already store sold prices, item details, and sale history. Just needs a template adjustment and schema enrichment on the ENDED-sale view.
- **Size:** ~100 lines (ENDED template variant + schema injection)
- **Priority:** HIGH — compounding asset, minimal effort

### 9b. EventSeries Schema for Recurring Sales
- **Work:** Tag recurring events in our scraped directory (weekly flea markets, monthly antique shows, recurring consignment sales) with `EventSeries` schema instead of individual `Event`. Search engines treat recurring events differently — they get persistent knowledge panel entries and "every Saturday" annotations.
- **Detection:** Flag directory entries with recurring patterns (same name + same location + multiple dates, or entries tagged as "weekly"/"monthly" in source data).
- **Size:** ~60 lines (schema conditional + directory flag)
- **Priority:** HIGH — free authority upgrade for data we already have

### 9c. Speakable Schema for Voice Search
- **Work:** Add Google's `speakable` property to sale page JSON-LD, marking which content blocks voice assistants should read aloud (sale name, date, location, item highlights).
- **Target queries:** "Hey Google, are there any yard sales near me this weekend?" — voice assistants prioritize pages with speakable markup.
- **Size:** ~15 lines of schema addition
- **Priority:** MEDIUM — small effort, positions us for voice search growth

### 9d. "This Weekend" Auto-Generating Pages
- **Work:** Build `/this-weekend/[city]` pages that auto-regenerate every Thursday via ISR. Show all sales happening that weekend in a city. Expire/redirect Monday. Include `ItemList` schema.
- **Target queries:** "estate sales this weekend near me", "yard sales Saturday Grand Rapids" — these are the highest-intent, highest-conversion search queries in our space.
- **Freshness signal:** Search engines heavily favor recency for time-bound queries. Weekly regeneration = perpetual freshness.
- **Size:** ~250 lines (new page + ISR config + expiry logic)
- **Priority:** HIGH — captures the highest-intent queries in our category

---

## Phase 10: Demand Intelligence — Ready to Build (1 dev session)

**Goal:** Turn zero-result queries into organizer acquisition signals.

### 10a. Unmet Demand Signal Capture
- **Work:** When the MCP server or site search returns zero results for a query, log the search terms + location as unmet demand. Store in a `DemandSignal` table (query, city, timestamp, source: MCP|SEARCH|BROWSE).
- **Schema change:** New `DemandSignal` model
- **Size:** ~60 lines backend
- **Priority:** HIGH — the data capture is cheap and enables everything below

### 10b. Organizer Demand Dashboard
- **Work:** Surface unmet demand to organizers: "3 people searched for vintage lamps in your area this week. List some and they'll find you." Show on organizer dashboard alongside crawler alerts (Phase 7).
- **Pitch inversion:** Instead of "here's traffic on your stuff," it's "here's demand waiting for you." Fundamentally different acquisition angle.
- **Size:** ~80 lines frontend + aggregation endpoint
- **Priority:** HIGH — transforms cold outreach into warm demand proof

### 10c. Shopper "Notify Me" Waitlist
- **Work:** When a shopper searches and gets no results, offer "We'll notify you when this appears in your area." Email capture costs nothing. Creates a waiting audience to show prospective organizers.
- **Outreach tie-in:** "47 shoppers in Austin are waiting for vintage furniture listings. Your sale would reach them instantly." Reverses the cold outreach pitch entirely.
- **Size:** ~100 lines (waitlist capture + notification trigger when matching items appear)
- **Priority:** MEDIUM — requires shopper search volume to be meaningful

---

## Research Queue — Needs Investigation Before Committing

These ideas have high potential but need research to validate feasibility, scope, or market fit before becoming roadmap entries.

### R1. Embeddable Sale Widget (Backlink Engine)
- **Concept:** Let organizers embed a live, structured-data-rich sale widget on their own website or Facebook page. Widget pulls real-time data from FindA.Sale and renders with full JSON-LD. Every embed = a backlink. Structured data lives on their domain, canonically pointing to us.
- **Research needed:** Technical feasibility of structured data in iframes/embeds (most crawlers don't index iframe content). Facebook embed restrictions. Whether organizers actually have websites to embed on (our data says only 3.3% of WARM organizers have websites — may limit impact). Alternative: embeddable link/badge instead of live widget.
- **Potential:** HIGH if the technical path works. LOW if iframe structured data isn't indexed.

### R2. Price Oracle — Public Pricing API
- **Concept:** Expose our valuation data (eBay comps, transaction prices, AI valuations) as a public pricing endpoint. "What's a fair price for a used KitchenAid mixer in good condition?" Become Kelley Blue Book for secondhand goods.
- **Research needed:** Do we have enough transaction volume to produce statistically meaningful prices? Current pricing data is primarily eBay Browse API (asking prices, not sold — #337 flagged this). Need Marketplace Insights (sold prices) access or sufficient internal transaction data. Legal review: can we expose aggregated pricing data publicly? Rate limiting and abuse prevention for a public API.
- **Potential:** VERY HIGH if data quality is there. This is a long-term authority moat. Blocked on #337 (eBay sold-price data source).

### R3. Sale Density as Economic Signal
- **Concept:** Package our geographic distribution data (26k+ sales) as an economic indicator. "Estate sale density by ZIP code" correlates with demographic shifts, housing turnover, generational wealth transfer. Pitch to journalists, researchers, real estate platforms.
- **Research needed:** Is 26k sales enough geographic coverage to produce meaningful density maps? What ZIP codes have sufficient data? Are there existing datasets we'd compete with? Media outreach strategy — who covers this beat? Data licensing terms (CC-BY? Restricted?).
- **Potential:** HIGH for domain authority if a single news article cites us. Medium effort to package.

### R4. Multi-Language Structured Data (Spanish)
- **Concept:** Add Spanish-language structured data (`inLanguage: "es"`) and meta tags on sale pages in TX, CA, FL, AZ. "Ventas de garaje cerca de mí" has real search volume and near-zero competition.
- **Research needed:** Actual search volume for Spanish-language sale queries (need keyword research). Do we need translated page content or just structured data/meta? Legal: any compliance considerations for multilingual content? Impact on existing SEO (hreflang tags, canonical URLs).
- **Potential:** HIGH if search volume confirms demand. Very low cost if structured-data-only approach works.

### R5. Real-Time Inventory Feed for Agent Subscriptions
- **Concept:** Beyond request-response MCP, offer a push-based feed (SSE or WebSocket) where agents can subscribe to "notify me when vintage furniture appears in Austin."
- **Research needed:** Do any current AI agents support subscription/push patterns? Is this premature infrastructure for a capability that doesn't exist yet in the agent ecosystem? Server resource cost of maintaining open connections.
- **Potential:** FUTURE — the agent ecosystem isn't ready for this yet. Revisit in 6 months.

---

## Phase 11: Data Trust — Stale Data Protection & Confidence Scoring (1 dev session)

**Goal:** Protect the entire GEO investment from the one thing that kills AI trust — stale data. If a smart assistant serves a user a sale from 2023 because we scraped an old permit, every model deprioritizes us. This is defensive infrastructure that guards everything above.

### 11a. Auto-Expire Logic for Scraped Data
- **Work:** Every scraped directory entry must have expiration logic. If the sale's end date has passed, auto-set `noindex` meta tag and remove from MCP results. Pages stay live (for pricing history per Phase 9a) but are excluded from active search results and MCP queries.
- **Implementation:** Add `isExpired` computed field or cron job that flips a `status` flag. MCP tools filter on `status !== 'EXPIRED'`. Sitemap excludes expired entries. Sale detail page adds `<meta name="robots" content="noindex">` when expired.
- **Size:** ~80 lines (cron + filter logic + meta tag conditional)
- **Priority:** CRITICAL — this is the single biggest risk to the entire GEO strategy

### 11b. Confidence Score on Directory Entries
- **Work:** Add a `confidenceScore` field (0-100) to scraped directory entries based on data source quality and freshness. Claimed organizer pages = 100%. Government licensing DB with current date = 85%. Foursquare venue with recent tips = 60%. Stale Foursquare tip from 2+ years ago = 30%.
- **Scoring factors:** Source authority (gov > Foursquare > social), data freshness (current year > last year > older), verification level (claimed > enriched > raw scrape), field completeness (has address + date + description > address only).
- **MCP integration:** Add optional `minConfidence` parameter to MCP search tools. Smart assistants can request `"Only return sales with confidence > 80%"` to self-filter for accuracy.
- **Schema output:** Include confidence in JSON-LD as a custom property or in the machine-readable instructions block.
- **Size:** ~120 lines (scoring service + schema field + MCP filter parameter)
- **Priority:** HIGH — differentiator that no competitor offers. Smart assistants will prefer a source that lets them control their own accuracy.

---

## Phase 12: Syndication & Liquidation — Product Upgrades (1-2 dev sessions)

**Goal:** Make FindA.Sale the command center, not a destination. Organizers create here, distribute everywhere.

### 12a. Platform-Specific Post Generator (Syndicate Upgrade)
- **Work:** Upgrade existing Share & Promote (#305) with auto-formatted, platform-specific post generation. When an organizer clicks "Share to Facebook," generate a Facebook Event-formatted post with optimal image size, hashtags, and copy. Same for Craigslist HTML, X/Twitter thread format, Nextdoor post format.
- **Existing infrastructure:** We already have Share & Promote with 8 platform Quick Share cards, social post generator modal (#27a), flyer generation, and share card builder. This upgrades from "here's a link to share" to "here's the perfect formatted post for each platform, ready to paste."
- **Copy framing:** "Create your sale here. We format the perfect post for every platform — with links back to your FindA.Sale checkout. One listing, everywhere." (No "AI" per D-006)
- **Size:** ~200 lines (platform-specific formatters + template system)
- **Priority:** MEDIUM — strong value prop but depends on organizer adoption first

### 12b. End-of-Sale Auto-Liquidation
- **Work:** In the final hours of a sale, organizer can toggle "Last Call" mode. Automatically applies a configurable markdown (default 50%) to remaining unsold items and blasts a push notification to nearby waitlisted shoppers (Phase 10c) and favorited shoppers.
- **Tie-in:** Extends existing markdown cycles (#334), flash deals, and the shopper waitlist. The notification blast uses existing VAPID push infrastructure.
- **Organizer control:** Organizer sets the markdown percentage and the trigger time (e.g., "2 hours before sale ends"). Not fully automatic — organizer opts in per sale.
- **Size:** ~150 lines (toggle UI + cron trigger + notification blast)
- **Priority:** MEDIUM — solves a real pain point but needs active sales to be useful

---

## Go-to-Market Strategy Notes (Not Dev Work — Patrick Reference)

These are strategic recommendations from the GEO analysis session. Not roadmap items — captured here for Patrick's reference when the technical foundation is in place.

### GTM-1. "Build in Public" — Content Topics for Existing Channels
Not a separate initiative — these are blog post and social media topics for our existing content pipeline. Document the GEO journey as content: "How we got smart assistants to recommend our marketplace over Craigslist." Post on Hacker News, Indie Hackers, X. The tech press is obsessed with this space and nobody has a real playbook yet. Feeds into our existing marketing/blogging workflow — just new subject matter.

### GTM-2. Product Hunt Launch as Infrastructure, Not Marketplace
Launch angle: "FindA.Sale: The first MCP-powered commerce directory for smart assistants" — not "another marketplace." Lead with the technical infrastructure (MCP endpoint, structured data, programmatic SEO). The marketplace is the proof-of-concept for the API. Tech community upvotes ingenuity; some will list their stuff while they're there.

### GTM-3. Developer Bounty Program
Offer a bounty (fee waiver or cash) to the first developer whose agent successfully navigates our MCP, finds an item, and completes a purchase. Post in LangChain Discords, Hugging Face, agent-building communities. The GitHub repos and demos that result are free advertising for FindA.Sale's capabilities.

### GTM-4. Weekly "Wrangler" Audit (Scheduled Task)
Scheduled Claude task, not a human role. Weekly automated audit: query ChatGPT, Claude, and Perplexity for sale searches in random cities. If FindA.Sale isn't surfaced, diagnose why (broken schema? stale MCP data? unclear llms.txt?). Reports findings to Patrick. Implement as a Cowork scheduled task once crawler tracking (Phase 1d) is live.

---

## Phasing Summary

| Phase | Sessions | Delivers | Organizer Impact |
|-------|----------|----------|------------------|
| 1 | 1-2 | Enriched JSON-LD, ai-plugin.json, crawler tracking | Data foundation |
| 2 | 2-3 | City×Category pages, 1-Click Claim, ItemList schema | Acquisition funnel live |
| 3 | 2-3 | Visibility Score tool, shareable results | Viral conversion engine |
| 4 | 1-2 | Per-item Product schema, machine-readable instructions, payment schema | Claimed page premium unlock |
| 5 | Ongoing | Wikidata entries, Data Commons, monthly trend reports | Long-term authority moat |
| 6 | 1-2 | Peer-to-peer organizer referral bounty, buyer referral links | Viral supply-side growth loop |
| 7 | 1 | Crawler alert dashboard metric, visit notifications | Retention hook — visible proof |
| 8 | 1 | High-intent MCP tools, enriched payloads, llms.txt update | Smart assistant integration |
| 9 | 1-2 | Post-sale pricing records, EventSeries, speakable, "This Weekend" pages | Compounding data assets |
| 10 | 1 | Unmet demand capture, organizer demand dashboard, shopper waitlist | Demand intelligence loop |
| 11 | 1 | Auto-expire stale data, confidence scoring, MCP confidence filter | Data trust protection |
| 12 | 1-2 | Platform syndication formatter, end-of-sale auto-liquidation | Command center positioning |

**Total estimate:** 14-22 dev sessions for Phases 1-12, plus ongoing monthly for Phase 5 reports. Research queue (R1-R5) activates as research validates. GTM strategy (GTM-1 through GTM-4) executes when technical foundation is live.

**The complete funnel:** Search engine/smart assistant finds our pages (Phase 1-2, 9d) or queries MCP (Phase 8) with confidence filtering (Phase 11) → organizer sees unclaimed page or uses Visibility Score tool (Phase 3) → organizer 1-click claims (Phase 2d) → organizer sees crawler alerts + demand signals (Phase 7, 10) → organizer syndicates to all platforms from FindA.Sale (Phase 12a) → organizer toggles on referral bounty (Phase 6) → buyers recruit more organizers → unsold items auto-liquidate to waitlisted shoppers (Phase 12b) → post-sale data becomes permanent pricing reference (Phase 9a) → trend reports compound authority (Phase 5c) → loop repeats.

---

## Design Decisions (Locked S758)

1. **Score tool branding** — Standard FindA.Sale brand tone. No "AI" language per D-006. Educational and empowering, not snarky. Copy says "search engines and smart assistants can't find your items" — never "search engines and smart assistants."

2. **Claim flow** — 1-click OAuth (Google/Facebook). No forms. Organizer clicks Claim → OAuth popup → instantly owns the page. Uses existing NextAuth providers.

8. **Crawler alert copy** — Dashboard metric: "Smart Search Views" or "Discovery Views." Notifications: "Your sale is showing up in search results." Never "AI Agent Views" or robot emoji. D-006 applies.

9. **Referral bounty structure** — Fee waiver or cash bounty when a referred organizer lists their first sale. Exact economics need findasale-investor analysis before implementation. Extends existing referral infrastructure (#265).

10. **MCP response shape** — All tools must return full human-readable context (name, address, time, URL). No raw IDs without context. Verify existing tools before building new wrappers.

3. **MCP server deployment** — Check Railway status at dispatch time. If not deployed, deploy as part of Phase 1.

4. **City×Category page volume** — ISR (Incremental Static Regeneration) with on-demand generation. No static build bloat. Pages generate on first visit and revalidate on a schedule.

5. **Machine-readable instructions block** — Use `sr-only` (visually hidden, screen-reader accessible), NOT `display:none`. The `display:none` approach is a known SEO cloaking risk that Google penalizes. `sr-only` is accessibility-standard and crawler-friendly. No "AI" in the copy — standard brand language only.

6. **Wikidata scope** — Notable recurring events only. No individual yard sales. Quality over quantity. If Wikidata community reverts, accept it — don't re-add.

7. **Report automation** — Monthly cadence. Haiku-generated narrative from real data. No fabricated statistics. Reports must be genuinely useful — the authority comes from real data, not volume.

---

## Alignment with Existing Roadmap

- **#384 llms.txt** — ✅ Already shipped S676
- **#385 robots.txt Bot/crawlers** — ✅ Already shipped S676
- **#386 JSON-LD structured data** — ✅ Shipped S676, Phase 1a enriches it
- **#387 SSR for public pages** — ✅ Gate removed S713
- **#388 MCP Server Phase 1** — ✅ Built, deploy status TBD
- **#389 mcp.json discovery** — Phase 1b covers this
- **#375 Shopper-Side Discovery SEO** — Phase 2 directly addresses this
- **#SEO-Content-Moat** — Phase 2a is the programmatic version of this

This plan does NOT duplicate existing work. It extends what's built into a complete AI discoverability stack.
