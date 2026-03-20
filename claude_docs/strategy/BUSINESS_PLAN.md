# FindA.Sale Business Plan — Strategic Overview

**Date:** 2026-03-19
**Status:** Tier 1 Strategic Document
**Last Updated:** 2026-03-19

---

## 1. Executive Summary

**Company Name:** FindA.Sale
**Location:** Grand Rapids, Michigan
**Founding Date:** 2025
**Business Structure:** Michigan LLC (filed)
**Website:** finda.sale

**Mission Statement:** To empower organizers of all resale events with a unified, AI-powered platform that dramatically reduces manual work, enables frictionless selling, and transforms how community resales are discovered and purchased.

**What We Do:** FindA.Sale is a mobile-first Progressive Web App connecting organizers of ALL types of community resale events—estate sales, garage sales, auctions, flea markets, rummage sales, charity sales, corporate liquidations, and beyond—with shoppers seeking the thrill of treasure discovery. We've built the first platform that serves both organizers and shoppers in a deeply integrated ecosystem. Organizers get a complete workflow: rapid photo-to-listing AI engine, instant payment processing, and professional output (watermarked images, exportable data, marketplace templates). Shoppers get discovery tools, item-level search, community engagement, and a treasure-hunt experience that keeps them coming back.

**Target Market:** Primary—organizers of all community resale types, starting with Michigan, expanding regionally and nationally. Secondary—treasure hunters and bargain seekers nationwide seeking discovery and purchase of secondhand goods.

**Competitive Advantage:** The unified organizer + shopper platform powered by a photo-first workflow. Photo upload → AI-generated titles, descriptions, and pricing → organizer refinement → publication across FindA.Sale AND exportable to eBay, Amazon, and other marketplaces. This workflow becomes the organizer's moat: once locked into our system, the professional outputs make it easy to syndicate inventory everywhere. We don't compete on price (competitors will copy fees) or features (competitors will copy features). We compete on workflow efficiency and professional asset generation.

**Financial Highlights:**
- **Revenue Model:** 10% platform fee on all sales (organizer-paid, deducted at payout)
- **Monthly Operating Costs (beta):** ~$300–400
- **Break-Even:** 1–2 medium sales/month ($5,000–$10,000 GMV each)
- **Year 1 Projection:** 8–80 active organizers, $40K–$650K monthly GMV, $1.5K–$30K net monthly revenue
- **Funding Required:** Seed: $150K–$300K (contingent on investor interest; current operations self-funded)

**Current Status:** Production MVP launched January 2026. 71 features across 4 subscription tiers shipped. All critical systems operational: JWT authentication, Stripe Connect payments, real-time auctions, AI tagging pipeline, push notifications, virtual queue management, and compliance infrastructure. Product-market fit being validated through beta recruitment in Q1 2026.

**Near-Term Goals (Next 12 Weeks):**
1. Recruit and onboard 5–10 beta organizers across Grand Rapids
2. Process 20–30 sales, validate organizer and shopper workflows
3. Achieve break-even monthly operations with 2–3 active organizers
4. Demonstrate retention and repeat-use patterns
5. Prepare investor-ready financial model and growth playbook

---

## 2. Company Overview

### Business Name, Location, and Legal Structure

**Company Name:** FindA.Sale
**Registered Address:** Grand Rapids, Michigan (USA)
**Legal Structure:** Michigan Limited Liability Company (LLC) — filed with Michigan Department of Labor and Economic Opportunity (LARA)
**Federal Tax ID (EIN):** Obtained
**Business License:** Michigan sales tax permit active (triggered at EIN issuance)

### History and Founding

FindA.Sale emerged from founder Patrick DeSee's direct observation of inefficiency across the entire resale ecosystem. After extensive conversations with estate sale organizers, garage sale hosts, auctioneers, and flea market operators in Grand Rapids, consistent pain points surfaced across all event types: outdated software built on 1990s architectures, opaque fee structures, poor mobile experience, no AI inventory support, and fragmented tools requiring separate systems for photos, payments, messaging, and analytics.

Simultaneously, shoppers complained about stale listings, poor photo quality, inability to search by item, and no unified discovery—they had to check 10 different platforms to find available sales in their area.

Between late 2024 and early 2026, FindA.Sale was built iteratively using AI-assisted development (Claude), shipping 71 features across five parallel development tracks. The platform launched as a production MVP in January 2026, fully functional but with zero paying customers. Beta recruitment began Q1 2026 with a focus on validating the core value proposition: rapid listing creation via photo upload and AI intelligence, combined with discovery and purchase workflows for shoppers.

### Mission and Vision

**Mission:** Reduce organizer manual work by 70%. Give every organizer (professional or first-time) access to professional-grade asset generation and syndication tools. Make treasure discovery irresistible for shoppers.

**Vision:** A unified platform that becomes the default destination for community resales—where organizers list once, shoppers discover easily, and AI handles the tedious work so humans can focus on connection and value.

### Business Model Overview

FindA.Sale operates as a two-sided marketplace with asymmetric fee structure:

**Supply Side (Organizers):**
- Create sales (estate, garage, auction, flea market, or custom event type)
- Add items via:
  - Batch photo upload (20–50 items at once)
  - Manual entry (form-based)
  - CSV import (bulk import from existing inventory)
  - Voice-to-text (rapid audio capture)
- AI auto-tags each item:
  - Photo analysis (Google Cloud Vision: materials, condition, brand)
  - Description generation (Claude Haiku: SEO-optimized, category-specific)
  - Condition grading (S/A/B/C/D scale)
  - Price suggestion (based on comparable data)
- Publish and manage (virtual queue, holds, pricing, analytics)
- Export professionally (watermarked images, CSV, JSON, eBay/Amazon templates)
- Get paid immediately (Stripe Connect Express payouts within 24 hours)
- Pay 10% fee only on what sells (no listing fees, no upfront costs)

**Demand Side (Shoppers):**
- Discover sales by location (map view, distance-based filters, neighborhood pages)
- Search by item (keyword, category, condition, price range)
- View items with professional photos, descriptions, prices, organizer ratings
- Purchase fixed-price items or bid on auctions (real-time bidding with soft-close)
- Manage orders (favorites, holds, messaging with organizer, reviews)
- Engage (gamified treasure hunts, leaderboards, points, achievement badges)
- Free to browse and purchase (no shopper fees, organizer pays platform fee)

**Monetization:** Platform earns 10% on all transactions (organizer-paid, deducted at payout). Zero upfront listing fees. Post-beta revenue opportunities: subscription tiers ($0–$99/month) with reduced fee rates, AI tagging premium add-on, and featured placement.

### Current Status (as of 2026-03-19)

**Development:** Production MVP. All 71 core features shipped and operational across organizer tools (operations, analytics, marketing, sales), shopper discovery and engagement, gamification, and platform AI services.

**Deployment:**
- Frontend: Vercel (finda.sale) — PWA installable, offline-capable, low bandwidth mode
- Backend: Railway (Node.js/Express) — Payment processing, real-time auctions, email/SMS
- Database: Neon PostgreSQL (35 migrations applied, 100% schema-complete)
- Image Storage: Cloudinary (CDN-delivered photos with watermarking, transformations)
- Payments: Stripe Connect Express (organizer identity verification, instant payouts)
- Monitoring: Sentry (error tracking), UptimeRobot (uptime monitoring)

**Legal Status:** Michigan LLC formed. Business bank account active. Terms of Service and Privacy Policy live in production. Stripe Connect compliance verified and activated.

**User Count:** 0 paying organizers (closed beta recruitment in progress).

**Revenue:** $0 (no paying transactions yet).

---

## 3. Products and Services

### Overview: The Unified Platform

FindA.Sale is the first platform serving both organizers and shoppers of community resales with deep integration. The platform exists as a responsive PWA optimized for mobile-first usage, avoiding native app friction while maintaining offline capability, installability, and push notification support.

### The Photo-First Workflow (Core Differentiator)

At the heart of FindA.Sale is a radical simplification: **photos are the primary input.**

**Organizer Workflow:**
1. Upload batch of photos (20–50 items, 2–3 photos per item)
2. AI instantly analyzes each photo:
   - Identifies item (furniture, jewelry, electronics, artwork, collectibles, etc.)
   - Generates title (optimized for search and marketplace syndication)
   - Writes description (SEO-tuned, category-specific, professional tone)
   - Suggests category and condition grade
   - Recommends price (based on comparable sold items)
3. Organizer reviews AI suggestions (typically 30 seconds per item)
4. Publish to FindA.Sale instantly
5. Export for syndication:
   - Watermarked images (with FindA.Sale attribution)
   - CSV/JSON structured data (ready for eBay, Amazon, other marketplaces)
   - eBay/Amazon marketplace templates (pre-formatted listing formats)
   - Social media templates (3 tone options: casual, professional, friendly)
6. Payment flows directly to organizer's bank account (Stripe Connect, 24-hour payout)

**Why This Matters:** Organizers historically spend 2–3 hours per 50-item sale on photography, data entry, pricing, and formatting for multiple platforms. FindA.Sale's workflow does this in 20–30 minutes. More importantly, the structured data export means organizers can list once on FindA.Sale and automatically syndicate to eBay, Amazon, and Facebook Marketplace without rework. This creates a moat: once an organizer uses our workflow, switching costs become high because they're now accustomed to rapid, exportable listings.

### Organizer Tools (Complete Feature Set)

**Core Sale Management:**
- Create and manage sales (date/time, location, event type: estate/garage/auction/flea market/custom)
- Batch item entry: photo upload, manual form, CSV import, voice-to-text
- AI auto-tagging with organizer review/edit workflow
- Per-item management: photo gallery, description editing, pricing, condition grading, status (available/sold/hold/draft)
- Inventory library: save items to organizer's personal library for reuse across sales (consignment rack feature)
- Virtual queue management: max capacity, FIFO release, SMS position updates to shoppers
- Holds and reservations: configurable hold duration (24–72 hours), automated expiry, grouped hold view

**Analytics & Intelligence:**
- Performance dashboard: views, conversion rates, revenue per hour, item-level analytics
- Lifetime insights: cross-sale totals, benchmarking, trend analysis
- Batch operations: bulk price/status/category/tag/photo updates
- Flip report: resale potential scoring for items
- Fraud detection: bid bot detection and fraud scoring on auction activity
- Real-time status updates: shopper notifications, sale activity feed

**Marketing & Asset Generation:**
- Social templates: 3 tone options (casual, professional, friendly) × 2 platforms (Instagram, Facebook) auto-filled with sale name and item highlights
- Cloudinary watermarking: export photos with FindA.Sale branding for protection and attribution
- CSV/JSON/Text export: listings in multiple formats for syndication
- Open data export: ZIP containing items, sales, and purchase data for archival
- Brand kit: custom colors, logo, website links (auto-propagated across all sale collateral)
- Share cards: OG tag generation for branded social previews
- Hype meter: real-time social proof (favorites, bids, holds, views)

**Sales & Engagement Tools:**
- Virtual queue: real-time line management with SMS integration
- Auction mechanics: live bidding, countdown timer, auto-bid, soft-close extended bidding
- Flash deals: time-limited price reductions
- Coupons: post-purchase promotional codes (percent or fixed amount)
- Verified organizer badge: built-in reputation score (1–5 stars)
- Message templates: pre-written reply templates for common shopper questions
- Stripe Terminal POS v2: in-person checkout with card reader, multi-item support, 10% fee parity

**Professional Outputs:**
- Payout dashboard: item-level fee breakdown, transparent accounting
- PDF export: detailed earnings reports for taxes and accounting
- Refund policy configuration: per-organizer window (0–30 days)
- Revenue tracking: earnings counter animations, historical data

**Subscription Tiers:**
- **Simple (Free):** Core operations, basic analytics, 10% fee
- **Pro ($29/month):** Advanced analytics, batch operations, inventory library, voice-to-tag, flip report, AI valuations, 10% fee
- **Teams ($79/month):** Multi-user workspace, role management, team analytics, 10% fee

### Shopper Tools (Complete Feature Set)

**Discovery & Exploration:**
- Map view: all active sales by location, distance-based filters, clustering
- List view: sales in card format, sortable by date/rating/distance
- Item search: full-text keyword search with advanced filters (category, condition, price range, sale type)
- City and neighborhood pages: curated landing pages for local discovery
- Category and tag browsing: hierarchical exploration by item type
- Trending items/sales: weekly and real-time popularity rankings
- Activity feed: social proof (favorites, purchases, new listings)
- Route planning: multi-sale itinerary builder with turn-by-turn routing (OSRM-based)
- Price history tracking: historical price trends for saved items
- Surprise me: serendipity-based discovery for exploration

**Shopping & Purchase:**
- Item detail pages: multiple photos, zoomable, condition guide, seller info, related items
- Favorites and wishlists: distinct save mechanisms, price drop alerts, notifyOnNew triggers
- Shopping cart: multi-item checkout, bulk purchase, hold items (24–72 hours configurable)
- Real-time auctions: live bidding with soft-close (extended bidding), next-bid suggestion, bid history
- Checkout: Stripe payment processing, optional organizer fee, order confirmation
- Post-purchase: digital receipt, return window, messaging with organizer, review system

**Engagement & Community:**
- Shopper profiles: public collection showcase, badges, finds, reputation (1–5 stars based on purchase history)
- Messaging: threaded shopper ↔ organizer conversations for questions, negotiations, pickup coordination
- Reviews: rate organizers and sales, read community reviews
- Buying pools: group purchasing on high-value items
- Bounties: shopper "want ads" for items they're searching for
- Weekly treasure digest: personalized email recommendations (Sunday 6pm, MailerLite-powered)
- Unsubscribe-to-snooze: intercept unsubscribe → 30-day email pause (MailerLite custom field)

**Gamification:**
- Points system: 1 pt/visit/day, tier-based multipliers
- Streaks: visit, save, and purchase streaks with milestone rewards
- Daily treasure hunt: daily clue + category matching, increasing difficulty
- Leaderboards: public rankings for shoppers and organizers
- Achievement badges: 50+ badges (collector, discount hunter, early bird, etc.)
- Hunt Pass ($4.99/30 days): 2× streak multiplier, exclusive challenges, recurring Stripe billing
- Near-miss nudges: variable-ratio psychology nudges (4 types)
- Shopper loyalty passport: stamps, badges, early-access perks
- Collector passport: specialty collection tracking, achievement paths
- Loot log: personal purchase history with photos and prices
- Rare item badges: automatically applied to unique or scarce finds
- Seasonal discovery challenges: rotating challenges by season/category

**Platform AI & Intelligence:**
- AI sale planner chat: public-facing acquisition tool for planning sales
- AI tag suggestions (Haiku): automatic suggestions from curated vocabulary
- Condition grading: S/A/B/C/D from photo analysis
- SEO description optimization: high-intent search term bias
- Item valuation widget: AI comparables for pricing guidance (PRO-gated)
- Treasure typology classifier: AI item classification (PRO-gated)
- Sale ripples: real-time activity tracking (favorites, bids, holds, purchases)
- Estate sale encyclopedia: wiki-style knowledge base for educating shoppers
- Crowdsourced appraisal: shopper-sourced valuations with voting (PAID_ADDON in roadmap)

**Accessibility & Inclusivity:**
- Dark mode: full dark theme with WCAG 2.1 AA compliance
- High-contrast outdoor mode: legible in bright sunlight
- Low-bandwidth mode: Network API detection, localStorage-first, minimal data
- Mobile-first PWA: installable like native app, offline-capable with service worker sync

### Technology Stack

**Architecture:** Monorepo (pnpm workspaces) with four packages:
- **Frontend:** Next.js 14 (Pages Router), React, TailwindCSS, @tanstack/react-query, Socket.io client (live auctions)
- **Backend:** Node.js + Express, Prisma ORM, JWT + OAuth (Google, Facebook), rate limiting, Stripe integration
- **Database:** PostgreSQL (schema-as-code via Prisma migrations, Neon hosted)
- **Shared:** TypeScript types, API contracts, Zod validation

**Key Infrastructure:**
- **PWA:** next-pwa (installable, offline-capable, push notifications via VAPID)
- **Maps:** Leaflet + OpenStreetMap (open-source, OSRM routing)
- **Design System:** Fraunces serif typography + sage-green color palette, accessibility-first
- **AI & Vision:** Google Cloud Vision API (object detection), Claude Haiku API (NLP), Anthropic embeddings
- **Images:** Cloudinary (CDN, watermarking, transformations, background removal)
- **Real-Time:** Socket.io (live auction bidding, activity feeds)
- **Email:** Resend (transactional) + MailerLite (marketing, unsubscribe-to-snooze)
- **SMS:** Twilio (virtual queue position updates)
- **Background Jobs:** node-cron (scheduled tasks)
- **Monitoring:** Sentry (error tracking), UptimeRobot (uptime alerts)
- **SEO:** next-sitemap, Schema.org structured data, OG meta tags, ISR pages

**Why PWA Over Native?**
- Zero app store friction (install directly from web)
- 50% faster to ship features (single codebase)
- Cross-platform (iOS, Android, Windows, macOS identical experience)
- Offline-capable (critical for unreliable estate sale WiFi)
- Lower memory footprint (important for older shoppers' phones)
- Easier A/B testing (no approval cycle)

### Pricing Model (LOCKED — Session 207, Patrick approved)

**Organizer Platform Fees (Simple Binary Model):**
- **SIMPLE tier (Free):** 10% of sale amount
- **PRO tier ($29/month):** 8% of sale amount
- **TEAMS tier ($79/month):** 8% of sale amount
- **Listing fees:** $0
- **Account maintenance:** $0
- **Rationale:** "We earn when you earn" — simple binary (free=10%, subscriber=8%)

**Overages (Beyond Tier Allocations):**
- **SIMPLE:** $0.10/item beyond 200 items/sale
- **PRO:** $0.05/item beyond 500 items/sale
- **TEAMS:** $0.05/item beyond 2,000 items/sale (soft cap, negotiable)

**Tier Limits (Capacity):**
| Metric | SIMPLE | PRO | TEAMS |
|--------|--------|-----|-------|
| Items per sale | 200 included | 500 included | 2,000 included |
| Photos per item | 5 | 10 | 15 |
| Photos per month | 500 | 5,000 | 30,000 |
| AI tags per month | 100 | 2,000 | Unlimited (soft cap 5,000) |
| Concurrent active sales | 1–3 | Unlimited | Unlimited |

**Shopper Monetization:**
- **Buyer Premium on Auctions:** 5% on auction items ONLY (splits 95% organizer / 5% platform)
- **Hunt Pass:** $4.99/30 days — PAUSED until 1,000+ DAU + 30% repeat rate
- **Premium Shopper Tier:** DEFERRED to 2027 Q2

**Example Cost Breakdown (PRO Organizer, $5,000 Sale):**
| Component | Amount | Notes |
|-----------|--------|-------|
| Gross sale | $5,000 | Organizer receipts |
| FindA.Sale fee (8%) | –$400 | PRO subscriber rate |
| Stripe processing (2.9% + $0.30) | –$145 | Stripe's standard rate |
| Monthly PRO subscription | –$29 | (paid separately) |
| **Organizer net payout** | **$4,600 + monthly benefit** | Received within 24 hours |

**Post-Beta Subscription Tiers (Q2+ 2026):**
- **Simple (Free):** 10% fee, core features, basic analytics
- **Pro ($29/month or $290/year):** 8% fee, advanced analytics, inventory library, unlimited sales, batch operations, brand kit, exports
- **Teams ($79/month or $790/year):** 8% fee, multi-user access, API, webhooks, white-label, priority support

**Post-Beta Add-Ons (Deferred):**
- **Featured Placement:** $29.99 per 7-day featured sale listing
- **AI Tagging Premium:** $4.99/month for unlimited tags (SIMPLE-tier only; PRO/TEAMS bundled unlimited)
- **Affiliate Commissions:** 2–3% on referred organizers
- **B2B Data Products:** DEFERRED (see b2b-b2e-b2c-innovation-broad-2026-03-19.md)

**Competitive Positioning (Updated):**
- EstateSales.NET: $99/sale + $2.95/item = 13–20% effective rate
- MaxSold: 15–30% commission (managed service)
- AuctionNinja: $19/month + $250 setup + 2% fee
- DIY Auctions: 10% fee (auction-only, no organizer tools)
- **FindA.Sale: 10%/8%/8% tiered, zero upfront, subscription optional, best organizer tools + shopper discovery**

---

## 4. The Real Moat: Workflow + Export

### Why Price & Features Aren't Defensible

**The Problem with Competing on Price:**
Competitors will copy our 10% fee within 6 months. Price is transparent, measurable, and easy to undercut. A competitor can launch tomorrow at 8% and steal our best customers.

**The Problem with Competing on Features:**
We've built 71 features across organizer and shopper sides. Competitors will copy the top 10 within 12 months. Features are visible, well-documented in our marketing, and relatively straightforward to replicate.

### The Real Defensibility: Photo-First Workflow + Syndication

**What Creates Lock-In:**

Once an organizer adopts our photo-to-listing workflow, they are invested in:
1. **Speed of listing creation** (20 minutes vs. 2+ hours elsewhere)
2. **Professional asset generation** (watermarked images, structured data, multiple export formats)
3. **Syndication to external platforms** (one listing → eBay, Amazon, Facebook, FindA.Sale simultaneously)
4. **Organizer reputation** (ratings, repeat shopper networks, testimonials)

**The Switching Cost:**
- Organizers become accustomed to rapid workflow
- They've built templates and brand kits in FindA.Sale
- They're exporting watermarked images for eBay/Amazon listings
- If they leave, they lose: speed advantage, asset generation, professional branding, reputation accumulated

**How We Protect the Moat:**
1. **Make the workflow so good** that manual data entry feels impossibly slow elsewhere
2. **Export to major marketplaces** (eBay, Amazon templates built-in)
3. **Build organizer reputation** across FindA.Sale that doesn't transfer to competitors
4. **Create network effects** where more organizers → more inventory → more shoppers → higher organizer earnings
5. **Continuously improve AI** (better condition grading, price suggestions, category detection)

### The Shopper Side of the Moat

**Why Shoppers Keep Coming Back:**
- Unified discovery (find all sales in one place, not 10 different sites)
- Gamification (leaderboards, badges, streaks, treasure hunts)
- Community (follow organizers, see shopper hauls, rate and review)
- Trust (verified organizers, fraud detection, digital receipts)
- Engagement (weekly digest, push alerts, real-time activity feed)

**Network Effects:**
- More organizers → more inventory → more search results
- More search results → better discovery → more shoppers
- More shoppers → higher organizer GMV → attracts more organizers
- Flywheel compounds at regional scale

---

## 5. Market Analysis

### Market Overview

**Community Resale Event Market (Domestic):**
- **Estate Sales:** 150,000–200,000 events/year, $15K–$25K avg GMV, $2.25B–$5B annual market
- **Garage/Yard Sales:** ~100,000 events/year, ~$3K avg GMV, $300M–$500M annual market
- **Auctions (Live + Online):** ~50,000 events/year, $20K+ avg GMV, $1B+ market
- **Flea Markets:** ~20,000 venues/year, $5K–$50K avg vendor revenue
- **Rummage Sales, Charity Sales, Corporate Liquidations:** Combined ~50,000 events/year
- **Total Addressable Market:** ~$3.5B–$6B annually
- **Growth Rate:** 17–22% YoY (secondhand economy, sustainability, economic uncertainty)

**Broader Context:**
- US secondhand market: $186B annually
- Baby boomer downsizing: 78 million people (ages 60–78)
- Resale preference among Gen Z: 62% prefer secondhand when available
- eBay/Poshmark/Mercari growth: 25%+ YoY

### Target Market

**Primary: Organizers of All Community Resales**

*Who they are:*
- **Professional companies:** Estate sale operators (20+ sales/year)
- **Semi-professionals:** Individual organizers (3–15 sales/year) — retirees, side-business, real estate agents
- **One-time executors:** Family members handling estate liquidation
- **Auctioneers:** Live and online auction houses
- **Flea market operators & vendors:** Multi-booth and single-vendor setups
- **Nonprofits & charities:** Rummage sales, charity liquidations
- **Corporate liquidators:** Business asset disposal

*Why they choose FindA.Sale:*
1. **Time savings:** 70% reduction in listing creation time (photo upload vs. manual entry)
2. **Cost:** 10% fee (lowest in market) saves $500–$2,000 per sale vs. competitors
3. **Professional assets:** Watermarked images, exportable data, marketplace templates
4. **Simplicity:** AI handles data entry; organizer just refines and publishes
5. **Reach:** Unified platform for all sale types, reaching 5,000+ nearby shoppers
6. **Support:** Real people answering questions in <4 hours
7. **Modern experience:** Mobile-first PWA vs. 1990s competitor platforms

**Secondary: Shoppers (Treasure Hunters & Bargain Seekers)**

*Who they are:*
- **Treasure hunters:** Age 35–70, seeking vintage furniture, collectibles, antiques
- **Budget shoppers:** Price-conscious buyers seeking deals on used goods
- **Resellers:** Sourcing inventory for eBay, Poshmark, Depop
- **Decorators/designers:** Curating specific items for client projects
- **Casual browsers:** Weekend fun, exploring for entertainment

*Why they choose FindA.Sale:*
1. **Discovery:** Unified map + search (find all nearby sales without visiting 5+ websites)
2. **Inventory visibility:** Item-level photos, descriptions, prices (not vague sale descriptions)
3. **Convenience:** Online purchasing, messaging, push alerts, favorites
4. **Safety:** Verified organizers, fraud detection, ratings, digital receipts
5. **Fun:** Gamification (treasure hunts, leaderboards, badges, streaks)
6. **Community:** Follow organizers, see other shoppers' hauls, rate and review

### Market Size (TAM / SAM / SOM)

| Metric | Calculation | Value |
|--------|-------------|-------|
| **TAM** | 10% of $4B community resale GMV | **$400M annually** |
| **SAM** | 40% of TAM (Midwest + Southeast boomer density + early adopters) | **$160M annually** |
| **SOM Year 3** | 5% market capture (regional consolidation) | **$8M–$10M revenue** |
| **SOM Year 5** | 10% market capture (25 states, multi-platform) | **$40M+ revenue** |

**Defensibility:**
- EstateSales.NET (7.1M monthly visits, estimated 60K organizers, 40K–60K events/year) is entrenched but declining in trust (1.4-star Trustpilot)
- No unified competitor combines organizer tools + shopper discovery + AI + payment processing
- Network effects compound at 20%+ monthly growth (once organizer base reaches 50+)
- Moat strengthens as organizer reputation and syndication workflows lock in customers

### Customer Personas

**Persona 1: Margaret — Professional Estate Organizer**
- Age 58, runs company with 1 part-time employee
- Runs 25–30 estate sales/year across Michigan
- Currently uses EstateSales.NET + spreadsheets + PayPal
- Pain: Tedious photo upload, $2.95/item fee kills margins, nonexistent customer support
- Motivation: FindA.Sale's 10% fee saves $600–$1,000/sale; AI tagging saves 2 hours per sale
- Growth potential: High-volume repeat customer likely to upgrade to Pro tier

**Persona 2: Derek — One-Time Executor**
- Age 52, handling parents' estate liquidation
- Selling 200+ items from inherited property
- Never run an estate sale before
- Pain: Overwhelmed, doesn't know pricing, wants to avoid Goodwill pennies
- Motivation: No upfront cost; AI pricing removes uncertainty; simple interface
- Growth potential: One-time customer but likely to refer friends/family

**Persona 3: Emma — Treasure Hunter & Shopper**
- Age 42, loves vintage furniture and antiques
- Browses 2–3 estate sales per month
- Currently uses Facebook Marketplace + Craigslist (frustrating, unreliable)
- Pain: No centralized discovery, stale listings, hard to find specific categories
- Motivation: Map view + keyword search save hours; push alerts bring deals to her
- Growth potential: High engagement, potential Hunt Pass subscriber, affiliate promoter

**Persona 4: James — Reseller / Buying for Profit**
- Age 35, sources items for eBay + Poshmark resale
- Volume buyer: 5–10 items per sale, 4–5 sales per week
- Uses specialized sourcing software
- Pain: Estate sales are hit-or-miss; pricing variability makes bulk purchasing risky
- Motivation: Advanced search + inventory alerts reduce sourcing time; bulk messaging creates direct organizer relationships
- Growth potential: Multi-sale orders, subscription upgrade potential

---

## 6. Competitive Analysis

### Competitive Landscape

Four categories of competitors, none controlling both organizer tools and shopper discovery:

1. **Estate Sale Operator Platforms** (EstateFlow, PROSALE, SimpleConsign): Organizer-focused, poor shopper discovery
2. **Auction Platforms** (AuctionNinja, DIY Auctions, MaxSold, HiBid): Real-time bidding, limited organizer tools
3. **Shopper Discovery Platforms** (EstateSales.NET, VarageSale, Yard Sale Treasure Map): Shopper-focused, minimal organizer features
4. **Generalist Secondhand Marketplaces** (Facebook Marketplace, Craigslist, eBay): Massive but not specialized for community resales

**FindA.Sale's Unique Position:** Only platform combining unified organizer tools, shopper discovery, AI tagging, payment processing, and gamification for ALL sale types in one product.

### Direct Competitors (Tier 1)

**EstateSales.NET** (Market leader by traffic)
- **Pricing:** $99/sale + $2.95/item = 13–20% effective rate
- **Audience:** 7.1M monthly visits; dominant national brand
- **Strengths:** High shopper traffic, established organizer trust, professional company directory
- **Weaknesses:** 1.4-star Trustpilot; 2–3 week support response; clunky web UI; poor mobile; no real-time inventory; no auctions; no organizer tools; no AI
- **FindA.Sale Advantage:** 10% fee (simpler than their per-item model), photo-first workflow, mobile-first, responsive support, AI tagging

**MaxSold** (Premium managed service)
- **Pricing:** 15–30% commission (handles photography and cataloging)
- **Audience:** ~50K annual transactions
- **Strengths:** Managed service option; professional photography; strong for high-value estates
- **Weaknesses:** 2-star Yelp; item misrepresentation complaints; poor pickup coordination; opaque fees; slow innovation
- **FindA.Sale Advantage:** Transparent pricing, self-serve option, AI tagging democratizes quality, instant payouts

**AuctionNinja** (Real-time bidding)
- **Pricing:** $19/month + $250 setup + 2% fee
- **Audience:** ~500 active auctioneers
- **Strengths:** Excellent bidding UX, real-time extended bidding, 4.6-star Trustpilot
- **Weaknesses:** Horrible support, site crashes during peak auctions, no organizer discovery tools, no app, no AI, high upfront cost
- **FindA.Sale Advantage:** Zero upfront cost, unified shopper discovery, real-time auctions, customer support commitment, organizer + shopper experience

**DIY Auctions** (Budget auction platform)
- **Pricing:** 10% commission (transparent)
- **Audience:** 10K+ annual transactions
- **Strengths:** Crystal-clear pricing, organizer-friendly, no upfront cost
- **Weaknesses:** No shopper discovery, invitation-only buyer model, auction-only format
- **FindA.Sale Advantage:** Integrated shopper discovery, all sale types, modern PWA, AI tagging, payment processing

### Indirect Competitors (Tier 2)

**Facebook Marketplace:** Free, massive shopper base, but blocks estate sale terminology; safety issues; poor organizer tools

**Craigslist:** Declining use among younger shoppers; unmoderated; rampant scams

**eBay / Poshmark / Mercari:** Designed for individual items, not estate sale events; shipping-only model; no local discovery

### Competitive Matrix

| Feature | EstateSales | MaxSold | AuctionNinja | DIY Auctions | FindA.Sale |
|---------|---|---|---|---|---|
| Shopper Discovery | ✅ | ⚠️ | ✅ | ❌ | ✅ |
| Organizer Tools | ⚠️ | ✅ | ❌ | ✅ | ✅ |
| Real-Time Auctions | ❌ | ❌ | ✅ | ✅ | ✅ |
| Payment Processing | ❌ | ✅ | ✅ | ✅ | ✅ |
| Mobile-First | ❌ | ⚠️ | ⚠️ | ❌ | ✅ (PWA) |
| AI Features | ❌ | ❌ | ❌ | ❌ | ✅ |
| Photo Export / Syndication | ❌ | ❌ | ❌ | ❌ | ✅ |
| Fee Transparency | ❌ | ❌ | ⚠️ | ✅ | ✅ |
| Customer Support | ❌ | ❌ | ❌ | ⚠️ | ✅ |
| Pricing (% of GMV) | 13–20% | 15–30% | 2%+ | 10% | **10%** |

### Competitive Advantages (Defensible)

1. **Unified organizer + shopper platform:** No competitor serves both audiences in one product
2. **Photo-first workflow:** Reduces data entry from 2+ hours to 20 minutes per sale
3. **Professional asset export:** Watermarked images, CSV/JSON, eBay/Amazon templates
4. **Organizer-aligned pricing:** 10% flat (lowest in market), zero upfront, we earn when they earn
5. **AI-powered tagging:** Instant title, description, category, condition, price suggestions
6. **Mobile-first PWA:** Installable, offline-capable, fast (vs. competitors' legacy web apps)
7. **Real-time auctions:** Socket.io live bidding with soft-close (drives engagement)
8. **Gamified shopper experience:** Treasure hunts, leaderboards, badges, streaks (drives retention)
9. **Customer support commitment:** <4-hour response time vs. competitors' 2+ weeks
10. **Modern design & UX:** Fraunces serif + sage-green, accessibility-first, intuitive workflows

---

## 7. Marketing and Sales Strategy

### Organizer Acquisition (Supply-Side)

**Phase 1: Direct Outreach (Week 1–12)**

*Target: 5–10 beta organizers by end of Q1 2026*

1. **Identify prospects** (Facebook groups, EstateSales.NET directory, Google Maps, local networks)
2. **Personalized outreach:** Email + direct message with specific value prop
3. **Offer:** Free setup, hands-on onboarding, fee waiver for first sale
4. **Schedule 1-on-1 calls:** Walkthrough, answer questions, provide personal phone number
5. **Monitor first sales:** Daily communication, real-time bug fixes, feedback collection
6. **Collect testimonials:** Case studies with earnings data and time savings

**Phase 2: Referral & Partnerships (Q2 2026)**

- **Referral incentive:** $50 credit per organizer referred by existing organizer
- **Probate attorneys:** Partner for estate liquidation referrals (3–5 per attorney/month)
- **Senior living facilities:** Downsizing service for residents
- **Real estate agents:** Estate home clearing before sale
- **Antique dealers:** Cross-promotion + consignment pipeline

**Phase 3: Content & SEO (Q2–Q3 2026)**

- **Blog:** "How to run your first estate sale," "Pricing strategies," "Virtual queue best practices"
- **Video:** TikTok / YouTube shorts of estate sale hauls (user-generated from shoppers)
- **Local press:** "Grand Rapids startup modernizes estate sales" (500–2K visits per article)
- **SEO:** Long-tail keywords ("[neighborhood] estate sales this weekend," "sell estate fast Michigan")
- **Google Business Profile:** Local search optimization

### Shopper Acquisition (Demand-Side)

**Phase 1: Organic Seeding (Through Organizers)**

- Each organizer promotes FindA.Sale to their shopper audience
- Email, social signage, in-person at physical sales
- Target: 10–50 new shoppers per organizer signup
- First 100–500 shoppers will be organic/referral (lowest CAC)

**Phase 2: Viral & Social Proof (Q2+)**

- Shopper reviews and ratings (word-of-mouth in estate sale communities)
- User-generated content ("haul" videos, collection showcases)
- TikTok / Instagram: Estate sale finds, thrift flips, treasure hunting
- Influencer partnerships: Local pickers, resellers, decorators (affiliate commission)

**Phase 3: Organic Search (Q2–Q3)**

- Long-tail keywords ("estate sales near me," "vintage furniture Grand Rapids," "treasure hunting")
- Neighborhood landing pages for each city
- Weekly digest email (personalized recommendations)
- Referral program: $5 credit per referred shopper

**Phase 4: Paid Acquisition (Q3+ Once Unit Economics Validated)**

- Google Search Ads: "[city] estate sales," "treasure hunting [city]"
- Instagram / Facebook retargeting: Users who viewed sales but didn't purchase
- Reddit / local community groups: Organic mentions in downsizing communities

### Brand Positioning & Messaging

**Core Message:** "Find All The Sales. Estate sales, garage sales, auctions, flea markets — discover secondhand treasures happening near you. For organizers: list once with AI, get paid instantly, keep 90%. For shoppers: treasure hunt for deals, follow organizers, earn badges."

**Brand Tone:** Helpful, honest, inclusive, practical, curious. Warm but professional. Celebrates all forms of community resale — not gatekeeping or elitist.

**Key Pillars (Organizer-Facing):**
1. **Time Savings:** 70% reduction in listing creation time
2. **Professional Assets:** Watermarked images, exportable data, marketplace templates
3. **Simplicity:** Photo → AI tags → publish → get paid (3 steps)
4. **Reach:** Unified platform, 5,000+ nearby shoppers
5. **Fair Pricing:** 10% flat (lowest in market), zero upfront

**Key Pillars (Shopper-Facing):**
1. **Discovery:** Unified map + search for all nearby sales
2. **Community:** Follow organizers, see hauls, join treasure hunts
3. **Engagement:** Gamification, badges, leaderboards, streaks
4. **Value:** Great deals, professional inventory, trusted organizers
5. **Fun:** Treasure hunt experience, weekend adventures

---

## 8. Financial Plan

### Revenue Model (LOCKED)

**Primary Revenue: Tiered Platform Fees**
- **SIMPLE tier (Free):** 10% of gross transaction amount
- **PRO tier ($29/month):** 8% of gross transaction amount
- **TEAMS tier ($79/month):** 8% of gross transaction amount
- **Listing Fees:** $0
- **Account Maintenance:** $0
- **Auction Buyer Premium:** 5% on auction items ONLY

**Formula (Blended, Assumes 30% Paid Tier Penetration):**
```
Monthly Revenue = (GMV × 0.10 × 0.70) + (GMV × 0.08 × 0.30) + (Subscription Revenue)
Example: $100K GMV with 30% PRO/TEAMS = ($100K × 0.097) + ($870/mo sub) = $10.67K
```

**Subscription Revenue (Annual):**
- PRO: $29/month × 12 = $348/organizer/year
- TEAMS: $79/month × 12 = $948/organizer/year
- Example: 50 organizers (40 PRO + 10 TEAMS) = $16.9K annual subscription revenue

**Post-Beta Revenue Streams (Q2+ 2026, Deferred Until Scale):**
1. **Featured Placement:** $29.99 per 7-day featured sale (with transparency label)
2. **AI Tagging Premium:** $4.99/month for unlimited tags (SIMPLE heavy users only)
3. **Affiliate Commissions:** 2–3% on referred organizers
4. **B2B Data Products:** Aggregated secondhand market intelligence, valuation API, trend reports (DEFERRED to 200+ organizers)

### Revenue Projections (Conservative)

**Assumptions:**
- Average GMV per sale: $5,000 (conservative; typical estate sale is $15K–$25K, but online = 25–35% of typical)
- Platform fee: 10% flat
- Organizer churn: 50% monthly initially (improves as product-market fit proven)
- Sales per active organizer: 1.5 sales/month average
- Stripe processing cost: ~2.2% of GMV

| Period | Active Organizers | Sales/Month | GMV/Month | Gross Revenue | Stripe Cost | Net Revenue |
|--------|---|---|---|---|---|---|
| **Q1 2026 (Beta)** | 5 | 8 | $40K | $4,000 | $880 | $3,120 |
| **Q2 2026** | 15 | 25 | $125K | $12,500 | $2,750 | $9,750 |
| **Q3 2026** | 35 | 60 | $300K | $30,000 | $6,600 | $23,400 |
| **Q4 2026** | 75 | 130 | $650K | $65,000 | $14,300 | $50,700 |
| **Year 1 Total** | ~80 avg | ~223 | ~$1.1M | ~$110K | ~$24K | ~$86K |
| **Year 2 Total** | ~200 avg | ~3,500 | ~$17.5M | ~$1.75M | ~$385K | ~$1.365M |
| **Year 3 Total** | ~500 avg | ~9,000 | ~$45M | ~$4.5M | ~$990K | ~$3.51M |

**Caveat:** Projections assume organizer acquisition targets are met. Actual may vary based on market response and competitive pressure. GMV per sale may be lower initially in beta. Retention assumptions depend on product-market fit validation.

### Cost Structure

**Fixed Monthly Operating Costs (Infrastructure):**

| Item | Cost | Notes |
|------|------|-------|
| Vercel (Frontend) | $0–20 | Free tier sufficient for beta scale |
| Railway (Backend) | $5–50 | Node.js/Express, cron jobs |
| Neon PostgreSQL | $0–20 | Free tier (10GB) → paid at growth |
| Cloudinary (Images) | $0–30 | Free tier (25GB) → paid at scale |
| Resend (Email) | $0–25 | 100 emails/day free → $20/month at scale |
| Twilio (SMS) | $0–10 | Virtual queue updates |
| MailerLite (Marketing) | $0–20 | Subscriber-based, free up to 1K |
| Sentry (Monitoring) | $0–20 | Free tier sufficient for beta |
| Domain & DNS | $15/year | finda.sale registry |
| **Total Infrastructure** | **~$300–400/month** | Scales sub-linearly |

**Variable Costs (Scale with GMV):**

| Item | Rate | Notes |
|------|------|-------|
| Stripe Processing | 2.2% of GMV | Payment processing, fraud, chargebacks |
| Google Vision API | $1.50/1K images | AI tagging; free 1K/month tier |
| Claude Haiku API | $1/1M input tokens | AI descriptions; ~$0.25 per 1K items |
| **Total Variable** | **~3.9% of GMV** | Improves margins at scale |

**Staffing Costs (Phase 2, Q2 2026+):**

| Role | Type | Cost/Month | When |
|------|------|-----------|------|
| Customer Support Lead | Contract | $1,500–2,000 | Q2 2026 |
| Marketing Contractor | Contract | $1,000–2,000 | Q2 2026 (optional) |
| Technical Co-Founder | Full-Time | $4,000–8,000 | Q3 2026 (if funded) |
| Operations Manager | Full-Time | $3,000–5,000 | Q3 2026 (if funded) |

### Break-Even Analysis

**Monthly Operating Cost:** ~$400 (infrastructure only, beta phase)

**Revenue Needed to Break Even:**
```
$400 ÷ 0.10 (fee rate) = $4,000 monthly GMV
$4,000 ÷ $5,000 (avg sale) = 0.8 sales/month
```

**Conclusion:** Break-even occurs at <1 medium sale per month. Achievable within beta (Week 8–12 with 5 active organizers).

### Key Financial Metrics to Track

**Leading Indicators (Weekly/Monthly):**
- Active organizers, new signups, organizer churn rate
- GMV, average sale size, sales by category
- Active shoppers, new signups, repeat purchase rate
- Favorites saved, items searched, search-to-purchase conversion

**Trailing Indicators (Monthly/Quarterly):**
- Gross platform revenue, net revenue (post-processing), MRR
- Organizer CAC (customer acquisition cost), LTV (lifetime value), LTV:CAC ratio (target: >3:1)
- Organizer retention, repeat purchase rate (shoppers)
- Gross margin, operating margin, months to profitability

**Strategic Metrics:**
- TAM expansion (regional → national)
- Market share (% of US community resale volume)
- NPS (Net Promoter Score) — target 50+
- Support response time — target <4 hours

### Funding Requirements

**Current Status:** Self-funded through March 2026.

**Funding Ask:** $150,000–$300,000 (Seed round)

**Use of Funds:**

| Category | % | $150K | $300K |
|----------|---|-------|-------|
| Organizer Acquisition | 30% | $45K | $90K |
| Customer Support | 25% | $37K | $75K |
| Marketing & SEO | 20% | $30K | $60K |
| AI Infrastructure | 15% | $22K | $45K |
| Legal & Compliance | 10% | $15K | $30K |

**Funding Milestones:**
- **Q1 2026:** 5 beta organizers, 50+ shoppers, validate payment flows
- **Q2 2026:** 15 organizers, 500+ shoppers, $100K GMV, break-even operations
- **Q3–Q4 2026:** 50+ organizers, 5,000+ shoppers, $1M GMV, $20K+ monthly revenue
- **Year 2:** 200+ organizers, Series Seed evaluation at $2M+ ARR

---

## 9. Operations & Go-to-Market

### Organizer Onboarding

1. **Intake Call (15 min):** Walkthrough, pain points, answer questions
2. **Setup & Training (30 min):** Create account, upload first batch of photos, watch AI tag items
3. **Review & Refinement (20 min):** Organizer reviews AI suggestions, makes edits
4. **Publish & Promote (10 min):** Publish sale, share to social, set virtual queue capacity
5. **Day-of Support:** Phone number for urgent questions during sale
6. **Post-Sale Analysis (15 min):** Review earnings, feedback, testimonial collection

**Goal:** First sale achievable within 48 hours of signup.

### Customer Support Model

**Support Channels:**
- Email: support@finda.sale (target: <4 hour response)
- In-app feedback form (linked to ticketing)
- Phone: Google Voice (for urgent organizer issues during sales)

**SLA by Issue Type:**
| Type | Response Time | Example |
|------|---|---|
| Payment/Payout Issues | <1 hour | "Payout not showing up" |
| Account Access | <2 hours | "I forgot my password" |
| Feature Questions | <4 hours | "How do I enable the virtual queue?" |
| Product Feedback | <24 hours | "This feature would help..." |
| Bug Reports | <2 hours | "Page won't load" |

### Geographic Expansion Plan

**Phase 1: Beta Launch — Grand Rapids (Months 1–3)**
- Focus: Grand Rapids metro as initial organizer recruitment ground
- Target: 5–10 organizers, 100–500 shoppers
- Method: Direct outreach, local partnerships, in-person networking

**Phase 2: Midwest (Months 4–12)**
- Geographic: Detroit, Lansing, Ann Arbor, Kalamazoo (Michigan); Indianapolis, Chicago, Milwaukee
- Scale: 20–50 organizers, 5,000–10,000 shoppers
- Method: Referral loops, SEO scaling, paid partnerships

**Phase 3: National (Year 2+)**
- Geographic: All US markets, starting with high-boomer-density regions (Florida, Arizona, California)
- Scale: 200+ organizers, 100,000+ shoppers
- Method: Paid acquisition, creator partnerships, paid search

---

## 10. Management Team

### Founder & CEO

**Patrick DeSee**
- **Title:** Founder & CEO
- **Background:** Grand Rapids native with deep knowledge of local estate sale market and real estate community
- **Experience:** Product management, AI-assisted development (14 months, 71 features with Claude), field research with 20+ estate sale organizers
- **Relevant Relationships:** Probate attorneys, real estate agents, senior living facilities, antique dealers
- **Current Role:** Product strategy, partnerships, customer interviews, fundraising

### Advisory & Future Hires

**Q1–Q2 2026 (Contract Advisors):**
- **Michigan Business Attorney:** Permits, sales tax, platform liability (~$300–500/consult)
- **CPA / Tax Advisor:** Tax structure, sales tax registration, payroll planning (~$200–400/consult)
- **Estate Sale Industry Advisor:** Competitive intelligence, product feedback (TBD from early customers)

**Q3 2026+ (Key Hires):**
- **Customer Support Lead (Contract):** 10–20 hrs/week, email + phone support
- **Technical Co-Founder / CTO (Full-Time):** Infrastructure stability, payment optimization, scaling
- **Sales Lead (Commission-Based):** Organizer acquisition, partnership negotiation
- **Operations Manager (Full-Time):** Customer success, organizer onboarding, community

---

## 11. Appendix

### Supporting Documents

All strategic and technical documents are in `/claude_docs/`:

**Strategy:**
- `STATE.md` — Current project state, locked decisions, pending actions
- `STACK.md` — Technology stack, architecture principles
- `roadmap.md` — 71 shipped features, in-progress work, backlog
- `COMPLETED_PHASES.md` — Build history across 21 development phases

**Brand & Marketing:**
- `brand/brand-voice-guide-2026-03-16.md` — Tone, messaging pillars, audience segments
- `beta-launch/organizer-outreach.md` — Recruiting template
- `beta-launch/marketing-calendar-2026-03-06.md` — Week-by-week Q1–Q2 plan

**Compliance & Operations:**
- `beta-launch/legal-compliance-scan-2026-03-06.md` — Legal readiness audit
- `SECURITY.md` — Data protection, compliance guardrails
- `DEVELOPMENT.md` — Local setup, deployment runbook

### Key Terms

**AI Tagging:** Photo → Google Vision (object detection) + Claude Haiku (NLP) → auto-generated title, description, category, condition, price suggestion

**Gamification:** Points, streaks, badges, leaderboards, daily treasure hunts (drive shopper engagement and retention)

**Hunt Pass:** $4.99/30-day shopper subscription (2× streak multiplier, exclusive challenges)

**LTV:CAC Ratio:** Lifetime value of customer ÷ cost to acquire them (target: >3:1)

**MRR:** Monthly recurring revenue from subscriptions

**NPS:** Net Promoter Score (0–100, target >50)

**Platform Fee:** Percentage of sale amount retained by FindA.Sale (10% locked decision)

**PWA:** Progressive Web App (installable, offline-capable, push notifications)

**SAM:** Serviceable addressable market (realistic portion of TAM)

**SOM:** Serviceable obtainable market (5–10% SAM in 3–5 years)

**TAM:** Total addressable market ($400M for community resales)

**Virtual Queue:** Digital line management (shoppers join remotely, receive position updates via SMS)

---

## Final Notes

This business plan reflects FindA.Sale's strategic position as of 2026-03-19. It is a living document updated quarterly or when material changes occur (funding, market shifts, product pivots).

**Key Assumptions to Validate:**
1. Organizers will adopt a new platform if it saves 2+ hours and $500+/sale
2. Shoppers prefer unified discovery + purchase in one app over 5+ separate sites
3. Mobile-first PWA solves the UX problems that plague competitors
4. AI photo-to-listing workflow reduces data entry friction by 70%+
5. Professional asset export (watermarked images, marketplace templates) creates meaningful switching costs
6. Grand Rapids is a viable pilot market before Midwest/national expansion
7. Gamification (treasure hunts, badges, streaks) drives shopper retention >40% MoM

**Success Defined:**
- **Year 1:** 50+ active organizers, 5,000+ shoppers, $1M GMV processed, break-even or better
- **Year 2:** 200+ organizers, 50,000+ shoppers, $17.5M GMV, $1.365M net revenue
- **Year 3:** 500+ organizers across 25+ states, $45M GMV, path to Series A

**Document Authority:** Tier 1 Strategic Document
**Last Updated:** 2026-03-19
**Next Review:** 2026-06-19 (Quarterly)
**Author:** Claude (with Patrick DeSee, Founder)
