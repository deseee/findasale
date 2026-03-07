# FindA.Sale Business Plan — SCORE Template

**Date:** 2026-03-06
**Status:** Tier 1 Strategic Document
**Last Updated:** 2026-03-06

---

## 1. Executive Summary

**Company Name:** FindA.Sale
**Location:** Grand Rapids, Michigan
**Founding Date:** 2025
**Business Structure:** Michigan LLC (filed)
**Website:** finda.sale

**Mission Statement:** To empower estate sale organizers and shoppers with transparent, AI-powered tools that simplify the estate sale experience, eliminate outdated workflows, and create a thriving secondhand marketplace.

**Products and Services Offered:** FindA.Sale is a mobile-first Progressive Web App (PWA) connecting estate sale organizers (sellers) with shoppers (buyers). The platform offers organizers AI-powered inventory management, real-time auctions with live bidding, instant payment processing, and virtual queue management. Shoppers get discovery tools, item-level search, favorites, messaging, and online purchasing.

**Target Market:** Primary—estate sale organizers (professional and semi-professional) in Michigan, expanding regionally. Secondary—estate sale shoppers nationwide seeking inventory discovery and online purchasing.

**Competitive Advantage:** The only unified platform serving both organizers and shoppers; AI-powered item tagging; transparent 5%–7% platform fees (versus competitors' 13%–20%); mobile-first PWA architecture; real-time auction capabilities; and responsive customer support.

**Financial Highlights:**
- **Revenue Model:** 5% platform fee on fixed-price sales, 7% on auction sales
- **Monthly Operating Costs (beta):** ~$300–400
- **Break-Even:** 2–3 medium sales/month ($6,000–8,000 GMV each)
- **Year 1 Projection:** 8–100 active organizers, $40K–$650K monthly GMV, $1.4K–$24K net monthly revenue
- **Funding Required:** Seed: $150K–$300K (contingent on investor interest; current operations self-funded)

**Current Status:** Production MVP launched. 21 development phases complete. All critical features shipped: JWT authentication, Stripe Connect payments, live auction system, AI tagging pipeline, push notifications, virtual queue, affiliate program, and compliance infrastructure. No paying customers yet (beta recruitment begins Q1 2026). Zero technical debt blockers for launch.

**Near-Term Goals (Next 12 Weeks):**
1. Complete legal entity formation (LLC, EIN, business bank account) ✅ In Progress
2. Deploy AI tagging production pipeline (Google Vision + Claude Haiku)
3. Recruit and onboard 5 beta organizers in Grand Rapids
4. Process 20–30 sales, validate organizer and shopper workflows
5. Achieve break-even monthly operations or secure seed funding

---

## 2. Company Overview

### Business Name, Location, and Legal Structure

**Company Name:** FindA.Sale
**Registered Address:** Grand Rapids, Michigan (USA)
**Legal Structure:** Michigan Limited Liability Company (LLC) — filed with Michigan Department of Labor and Economic Opportunity (LARA)
**Federal Tax ID (EIN):** [Applied for, awaiting confirmation]
**Business License:** Michigan sales tax permit pending (triggering event: first transaction or $150K revenue threshold)

### History and Founding Story

FindA.Sale emerged from founder Patrick DeSee's direct observation of inefficiencies in the estate sale market. After conversations with multiple Grand Rapids-area estate sale organizers, consistent pain points surfaced: outdated software (EstateSales.NET, built on legacy technology), opaque fees (13%–20% of gross sales), poor mobile experience, no AI inventory support, and fragmented tools (separate systems for payment, messaging, analytics). Simultaneously, shoppers complained about stale listings, poor photos, and no online purchasing options.

Between late 2024 and early 2026, FindA.Sale was built iteratively using AI-assisted development (Claude), shipping 21 development phases across five parallel tracks: production readiness (CA), AI image processing (CB), business intelligence (CC), innovation and design (CD), and administrative/legal work (P). The platform launched as a production MVP in January 2026, fully functional but with zero customers. Beta recruitment begins Q1 2026.

### Mission and Vision Statement

**Mission:** Empower estate sale organizers to sell more, keep more, and spend less on outdated tools.

**Vision:** A unified, mobile-first marketplace that becomes the default platform for estate sales across North America — where organizers list with confidence, shoppers discover with joy, and AI handles the tedious parts.

### Business Model Overview

FindA.Sale operates as a two-sided marketplace:

**Supply Side (Organizers):**
- Create sales (event-based or continuous)
- Add items (batch photo upload, manual entry, CSV import)
- Use AI to auto-tag items (title, description, condition, price suggestion)
- Publish and manage (virtual queue, hold items, reduce prices, end sales)
- Track analytics (views, conversions, revenue per item)
- Get paid (instant Stripe Connect payouts)
- Zero listing fees (lower barrier to entry versus competitors)

**Demand Side (Shoppers):**
- Discover sales by location (map view, list view, neighborhood filters)
- Search by item type (keyword search, AI-powered filtering)
- View items (individual photos, descriptions, prices, seller info)
- Purchase or bid (fixed-price, auctions with real-time bidding)
- Manage orders (favorites, holds, messaging, reviews)
- Free to browse and purchase (no shopper fees)

**Monetization:** Platform earns 5% on fixed-price transactions, 7% on auction sales (organizer-paid, deducted at payout). Zero upfront listing fees. Post-beta revenue opportunities: AI tagging add-ons ($0.05/item), premium organizer subscriptions ($39–99/month), and featured placement ($50–100/sale).

### Current Status (as of 2026-03-06)

**Development:** Production-ready MVP. All features shipping. Zero customers (beta phase).

**Deployment:**
- Frontend: Vercel (finda.sale) — PWA installable, offline-capable
- Backend: Railway (backend-production-153c9.up.railway.app) — Node.js/Express
- Database: Neon PostgreSQL (35 migrations applied, production-ready)
- Image Storage: Cloudinary (CDN-delivered)
- Payments: Stripe Connect Express (Express onboarding, instant payouts)
- Monitoring: Sentry (error tracking), UptimeRobot (uptime monitoring)

**Legal Status:** Michigan LLC formation in progress. Business bank account awaiting funding. ToS and Privacy Policy live in production. Stripe Connect compliance verified.

**User Count:** 0 (closed beta recruitment planned for Q1 2026).

**Revenue:** $0 (no paying customers).

---

## 3. Products and Services

### Overview: What FindA.Sale Offers

FindA.Sale is a unified estate sale marketplace serving two distinct user groups with deeply integrated workflows. The platform exists as a responsive web app (PWA) optimized for mobile-first usage, eschewing native mobile apps to avoid app store friction while maintaining offline capability and installability.

### Organizer Tools (Seller-Facing)

**Sale Management Dashboard:**
- Create and publish sales (date/time, location, event type)
- Bulk inventory entry: batch photo upload (20–50 items at once), voice-to-text descriptions, CSV import
- AI-powered item tagging: upload photo → Google Vision labels + Claude Haiku analysis → auto-generate title, category, condition assessment, price suggestion → organizer review/edit
- Per-item management: edit details, add more photos (gallery), adjust price, mark as sold/reserved/hold, adjust in/out of virtual queue
- Virtual line queue management: set max capacity, monitor queue depth, release shoppers in FIFO order, track entry/exit
- Advanced features: recurring sales, multi-sale calendar view, organizer affiliate tracking, shopper messaging (in-app), virtual tour gallery (360° swipeable photos)
- Analytics dashboard: total views, views per item, conversion rates, average item price, revenue per hour, repeat shopper tracking

**Organizer Payment & Payout:**
- Stripe Connect Express onboarding (organizer identity verification, bank account linking)
- Transaction history with fee transparency (5% fee shown per transaction)
- Instant payout option (funds available within 24 hours of transaction)
- Monthly statement / CSV export for accounting

### Shopper Tools (Buyer-Facing)

**Discovery & Search:**
- Map view: shows all active sales by location, filters by date/distance/keyword
- List view: browse sales in card format, sort by date, rating, number of items
- Neighborhood landing pages: "Estate sales this weekend in Midtown Grand Rapids"
- Item search: full-text keyword search (e.g., "mid-century furniture," "antique jewelry")
- Sale details: organizer profile, ratings, item count, sale type, photos, directions, hours

**Shopping & Checkout:**
- Item gallery: individual items with multiple photos, zoomable, color-coded condition, price history
- Item details: title, description, category, condition, price, seller info, buyer reviews
- Favorites / wishlist: save items, get alerts if price drops or item sells
- Shopping cart: add multiple items, bulk purchase, hold items (24–48 hours)
- Auctions: real-time bidding with live bid updates, extended bidding (soft-close), bid history, next-bid suggestion
- Checkout: Stripe payment, optional buyer convenience fee, order confirmation
- Post-purchase: order tracking, messaging with organizer, leave review

**Engagement Features:**
- Shopper ratings & reviews: rate items and organizers, view community reviews
- Push notifications: new sales matching favorites, price drops, auctions ending soon, items going on hold
- Hunt Pass (optional, paid tier): seasonal 4-week pass ($4.99) unlocking daily treasure hunt challenges, point-based rewards, leaderboards
- Referral program: share sales, earn $5 credit per referred shopper
- Weekly curator email: personalized item recommendations based on browse/buy history

### Technology Platform

**Architecture:** Monorepo using pnpm workspaces — four packages:
- **Frontend:** Next.js 14 (Pages Router), React, TailwindCSS, @tanstack/react-query, Socket.io client (live auctions)
- **Backend:** Node.js + Express, Prisma ORM, JWT + OAuth authentication (Google, Facebook), rate limiting, Stripe integration
- **Database:** PostgreSQL (schema-as-code via Prisma migrations)
- **Shared:** TypeScript types, API contracts, Zod validation schemas

**Key Libraries & Services:**
- **PWA:** next-pwa (installable, offline-capable, push notifications)
- **UI/UX:** Leaflet + OpenStreetMap (maps), Fraunces serif + sage-green design system, accessibility (WCAG 2.1 AA)
- **AI & Images:** Google Cloud Vision API (item identification), Claude Haiku API (description/condition/pricing), Cloudinary (photo storage + CDN)
- **Real-Time:** Socket.io (live auction bidding)
- **Email:** Resend (transactional emails, weekly digests)
- **SMS:** Twilio (optional, for virtual queue position updates)
- **Background Jobs:** node-cron (scheduled tasks), Zapier webhooks (organizer automation)
- **Monitoring:** Sentry (error tracking), UptimeRobot (uptime alerts)
- **SEO:** next-sitemap, Schema.org structured data, open graph meta tags

**Why PWA Over Native App?**
- Zero app store friction (users install from web, no Google Play / App Store review delays)
- 50% faster to ship features (no duplicate codebases)
- Cross-platform: iOS, Android, Windows, macOS all run identical PWA
- Offline-capable (shopper can browse saved items without connectivity)
- Lower memory footprint than native apps (critical for older shoppers' phones)
- Easier A/B testing and feature flags (no approval cycle)

### AI Features (Current & Roadmap)

**Current (2026-03-06):**
- **Item Tagging:** Organizer uploads photo → Google Cloud Vision identifies objects (item type, color, material) → Claude Haiku via API generates:
  - Item title (e.g., "Vintage oak dining chair, mid-century")
  - Category (Furniture, Antiques, Electronics, etc.)
  - Condition assessment (Excellent/Good/Fair/Poor)
  - Suggested price (based on similar items)
  - Description snippet (2–3 sentences)
  - Estimated shipping weight
  - Fallback: If Vision or Haiku unavailable, organizer enters manually
- **Cost at Beta Scale:** ~$10–50/month (Google Vision $1.50/1,000 images, Claude Haiku <$1/1,000 items)

**Post-Beta (Q2–Q3 2026):**
- **AI Discovery Feed:** Personalized shopper recommendations based on browse/buy history (ML on engagement signals)
- **Buyer-to-Sale Matching:** Auto-notify shoppers of newly-listed sales matching their saved searches
- **Dynamic Pricing Suggestions:** Item-specific price recommendations based on historical sales data, condition, seasonality
- **Visual Search:** Upload photo → find similar items across all active sales
- **Planned:** Fine-tuned YOLO object detection for estate-sale-specific item categories (antiques, collectibles, furniture sets)

### Pricing Model (Locked Decision)

**Organizer-Paid Platform Fees:**
- **Fixed-Price Items:** 5% of sale amount
- **Auction Items:** 7% of sale amount
- **Listing Fees:** $0 (no upfront cost)
- **Account Maintenance:** $0

**Organizer Transparent Cost Breakdown (Example: $5,000 Sale):**
| Cost Component | Amount | Notes |
|---|---|---|
| Gross Sale Amount | $5,000 | Organizer receipts |
| FindA.Sale Platform Fee (5%) | –$250 | Deducted at payout |
| Stripe Processing (2.9% + $0.30) | –$145 | Stripe's standard rate |
| **Organizer Net Payout** | **$4,605** | Received within 24 hours |

**Post-Beta Revenue Tiers (Q2+ 2026, pending validation):**
- **Starter (Free):** 5%/7% fees, unlimited sales, basic analytics
- **Growth ($39/month):** 3%/5% fees, advanced analytics, featured listing (1/month), dedicated support
- **Pro ($99/month):** 2%/3% fees, unlimited featured listings, API access, white-label options (future)

**AI Tagging Add-On (Post-Beta):**
- **Included:** 50 free AI tags per sale for all organizers
- **Pay-Per-Use:** $0.05 per item tag beyond 50 (cost to FindA.Sale: $0.01, margin: 80%)
- **Bulk Discount:** 200+ items/month = $0.03/tag

**Rationale for 5%–7% Model:**
- **Competitive:** 3–4× cheaper than EstateSales.NET (13–20%), on-par with DIY Auctions (10%), lower than MaxSold (15–30%)
- **Sustainable:** Break-even at 2–3 medium sales/month at current infrastructure costs; scales profitably to 5,000+ sales/month
- **Organizer-Aligned:** We earn more when organizers earn more (no listing fees incentivize frequent use)
- **Transparent:** All fees shown before organizer confirms sale (no surprise charges)

### Future Product Roadmap (Post-Beta)

**Q2 2026 (Months 4–6):**
- AI Discovery Feed (personalized recommendations)
- Buyer-to-Sale Matching (auto-notifications)
- Virtual event support (live stream preview, multi-organizer sales)
- Merchandise integration (bundle physical items with gift wrapping)

**Q3 2026 (Months 7–9):**
- Multi-metro expansion (Detroit, Lansing, Ann Arbor)
- White-label marketplace-as-a-service (MAAS) for antique dealers, thrift chains
- Advanced logistics (shipping integration, logistics partner API)
- Seasonal promotions (flash deals, limited-time pricing)

**Q4 2026+ (Long-term Hold):**
- Consignment integration (thrift store POS systems)
- AR furniture preview (see items in your space)
- Video-to-inventory (convert video walkthrough to item list)
- National expansion (all US markets)

---

## 4. Market Analysis

### Industry Overview

**Estate Sale Market Size:**
- **US Estate Sales:** 150,000–200,000 events per year
- **Average GMV per Sale:** $15,000–$25,000
- **Total Annual Market:** $2.25B–$5B
- **Growth Rate:** 17% annually (ThredUp 2025 Resale Report)
- **Key Driver:** Baby boomer downsizing (78 million people, ages 60–78)

**Broader Secondhand Economy (Adjacent Market):**
- **Total US Secondhand Market:** $186B annually
- **Growth Rate:** 17–22% year-over-year
- **Segments:** Online resale (Poshmark, Mercari, eBay), thrift retail ($13.8B), consignment, auction houses ($17.4B), garage/yard sales ($1.5B–$2B)
- **Tailwind:** Sustainability mindset + economic uncertainty driving demand for affordable goods

**Estate Sale Industry Characteristics:**
- **Fragmented:** 40,000–60,000 independent organizers (professional and semi-professional)
- **Underdigitized:** Majority still use spreadsheets, Craigslist, or EstateSales.NET (built ~2005, minimal mobile optimization)
- **Labor-Intensive:** Manual photo upload, item-by-item pricing, in-person attendance required
- **Local/Regional:** Shoppers typically drive <30 miles for sales, organizers serve their geographic community
- **Seasonal Variation:** Q2–Q4 peak (spring/summer downsizing, holiday estate sales); Q1 low
- **High-Value Inventory:** Average item price $100–300, creating strong shopper incentive for accuracy and photos

### Target Market: Primary & Secondary

**Primary Target: Estate Sale Organizers**

*Who They Are:*
- **Professional Organizers:** Companies running 20+ sales/year, managing multi-property estates, serving probate attorneys and senior living facilities
- **Semi-Professional:** Individual organizers running 3–15 sales/year (retirees, side-business operators, real estate agents/contractors)
- **One-Time Executors:** Family members handling one estate sale (parents' downsizing, house clearing)
- **Antique Dealers & Consignment Stores:** Liquidating inventory through multi-lot sales

*Geographic Focus:*
- **Phase 1 (Now–Q2 2026):** Grand Rapids, Michigan metro area (~200,000 people; ~1,200 estate sales/year estimated)
- **Phase 2 (Q3–Q4 2026):** Midwest (Detroit, Lansing, Ann Arbor; ~15,000 sales/year estimated)
- **Phase 3 (2027):** National (all US markets; 150,000+ sales/year)

*Why They Choose FindA.Sale:*
1. **Cost:** 5% fee saves $500–$1,000 per sale vs EstateSales.NET's 13–20%
2. **Simplicity:** Batch photo upload + AI tagging cuts item entry from 2 hours to 20 minutes
3. **Features:** Virtual queue eliminates physical crowds; real-time auction support; instant payouts
4. **Support:** Responsive customer service (vs. competitors' 2-week support response times)
5. **Trust:** Modern PWA experience, clear fees, transparent payout

**Secondary Target: Estate Sale Shoppers**

*Who They Are:*
- **Treasure Hunters:** Age 35–70, shopping for vintage furniture, antiques, collectibles
- **Budget Shoppers:** Price-conscious buyers seeking deals on used goods
- **Decorators/Designers:** Curating specific items for client projects
- **Resellers:** Buying items to re-sell on eBay, Poshmark, other platforms
- **Casual Browsers:** Exploring for fun (weekend activity)

*Geographic Focus:*
- Initial 100-mile radius around Grand Rapids
- Expand nationally as inventory density increases

*Why They Choose FindA.Sale:*
1. **Discovery:** Map view, keyword search, neighborhood filters make finding sales easy
2. **Inventory:** Item-level photos, descriptions, prices (not just sale-level info)
3. **Convenience:** Online purchasing, wish lists, push notifications, messaging
4. **Safety:** Organizer ratings, shopper reviews, verified profiles
5. **Engagement:** Gamification (Hunt Pass points, leaderboards, weekly curator email)

### Market Size — TAM / SAM / SOM

| Metric | Calculation | Value |
|--------|-------------|-------|
| **TAM (Total Addressable Market)** | 5% platform fee on $3B domestic estate sale GMV | **$150M annually** |
| **SAM (Serviceable Addressable Market)** | 35–45% of TAM (Midwest + Southeast, boomer density) | **$52M–$67M annually** |
| **SOM Year 3** | 5% regional market share (conservative; single platform wins eventually) | **$2.5M–$3.4M in platform revenue** |
| **SOM Year 5** | 10% regional market share, 25 states | **$15M–$20M in platform revenue** |

**Defensibility of Numbers:**
- EstateSales.NET processes an estimated 40,000–60,000 organizer sales annually (based on 7.1M monthly visits ÷ 1.8M unique estate sale shoppers = ~125 shopper visits per organizer-month; 60K organizers × 12 months × 30% active = ~216K sales estimated)
- At FindA.Sale's 5% fee ($250 per $5K sale) vs. EstateSales.NET's 13–20% ($650–$1K), the switching incentive is $400–$750 per sale
- Network effects compound: more organizers → more inventory → more shoppers → organizers earn more → migration acceleration
- Geographic moat: Grand Rapids/Michigan expertise creates first-mover advantage in region before national platforms adapt

### Customer Personas

**Persona 1: Margaret, Professional Estate Organizer**
- Age: 58, runs company with 1 part-time employee
- Runs 25–30 estate sales/year across Michigan
- Currently uses EstateSales.NET + spreadsheets + PayPal
- Pain: Tedious photo upload, $2.95/item fee kills margins on smaller estates, customer support nonexistent (2-week response times)
- Goal: Reduce time spent on admin, keep more revenue, offer shoppers online purchasing
- Motivation: 5% fee saves ~$600/sale vs. current platform; 20-minute AI tagging saves 2 hours of manual work per sale
- Growth Potential: High-volume organizer = ideal repeat customer; likely to upgrade to Growth tier ($39/month) if revenue increases

**Persona 2: Derek, One-Time Executor**
- Age: 52, handling parents' estate (downsizing, house clearing)
- Selling 200+ items from parents' estate
- Never run an estate sale before
- Pain: Overwhelmed by volume, doesn't know how to price items, wants to avoid selling at Goodwill for pennies
- Goal: Liquidate quickly, maximize revenue for family inheritance
- Motivation: No upfront cost (vs. $99+ on EstateSales.NET); AI pricing suggestions reduce uncertainty
- Growth Potential: One-time customer, but likely to refer friends/family; community reputation building block

**Persona 3: Emma, Casual Shopper / Treasure Hunter**
- Age: 42, loves vintage furniture and antiques
- Browses 2–3 estate sales per month
- Currently uses Facebook Marketplace + Craigslist + drives to sales randomly
- Pain: No centralized discovery, stale listings, hard to find specific items (e.g., "teak dining tables")
- Goal: Find great deals on specific items without wasting time driving to sales without inventory
- Motivation: Map view + keyword search save hours of planning; push notifications alert to new matching items
- Growth Potential: High engagement, potential Hunt Pass subscriber ($4.99/season), affiliate promoter

**Persona 4: James, Reseller / Buying for Profit**
- Age: 35, buys estate sale items to resell on eBay + Poshmark
- Volume buyer: 5–10 items per sale, 4–5 sales per week
- Uses specialized sourcing software + dealer networks
- Pain: Estate sales are hit-or-miss; pricing variability makes bulk purchasing risky
- Goal: Source consistent inventory of specific categories (vintage electronics, designer furniture) at predictable margins
- Motivation: Advanced search + inventory alerts reduce sourcing time; bulk messaging with organizers creates direct relationships
- Growth Potential: Multi-sale orders, potential subscription upgrade if organizer tools added

---

## 5. Competitive Analysis

### Competitive Landscape Overview

The estate sale and auction marketplace is highly fragmented, with no single dominant platform. Competitors fall into four categories:

1. **Estate Sale Operator Platforms** (EstateFlow, PROSALE, SimpleConsign): Operator-focused, inventory management, little to no shopper discovery
2. **Auction Platforms** (AuctionNinja, DIY Auctions, MaxSold, HiBid): Real-time bidding, payment processing, but limited inventory discovery features
3. **Shopper Discovery Platforms** (EstateSales.NET, VarageSale, Yard Sale Treasure Map, GSAIR): Shopper-focused, minimal organizer tools
4. **Generalist Secondhand Marketplaces** (Facebook Marketplace, Craigslist, eBay): Massive but not specialized for estate sales

**FindA.Sale's Unique Position:** No competitor owns both organizer tools AND shopper discovery in the same platform.

### Direct Competitors (Tier 1 — Direct Threat)

**EstateSales.NET** (Leader by traffic, worst support)
- **Pricing:** $99/sale + $2.95/item = 13–20% effective fee rate
- **Audience:** 7.1M monthly visits; dominant national brand
- **Strengths:** High shopper traffic, established organizer trust, directory of professional companies
- **Weaknesses:** 1.4-star Trustpilot rating; horrible customer service (2–3 week response times); clunky web interface; poor mobile UX; static listings; no real-time inventory; no online auction; no organizer tools
- **Threat Level:** HIGH (entrenched, but declining trust)
- **FindA.Sale Advantage:** 5% fee (3–4× cheaper), mobile-first, real-time inventory, responsive support

**MaxSold** (Premium managed service)
- **Pricing:** 15–30% commission (managed service handles photography and marketing)
- **Audience:** ~50,000 annual transactions (estimated)
- **Strengths:** Professional managed service option; handles photography and cataloging; strong for high-value estates
- **Weaknesses:** 2-star Yelp rating; item misrepresentation complaints; poor pickup coordination; opaque fees; slow to innovate
- **Threat Level:** MEDIUM (serves premium segment, not accessible to small organizers)
- **FindA.Sale Advantage:** Transparent pricing, self-serve option, AI tagging democratizes photography, instant payouts

**AuctionNinja** (Real-time bidding focus)
- **Pricing:** $19.19/month + $250 signup + 2% transaction fee
- **Audience:** ~500 active auctioneers (estimated)
- **Strengths:** Excellent bidding UX; real-time extended bidding; good item density; 4.6-star Trustpilot rating
- **Weaknesses:** Horrible customer support (recurring complaint); site crashes during peak auctions; missing organizer discovery tools; no shopper app; no AI features; high upfront cost
- **Threat Level:** MEDIUM (strong for auctions, weak for estate sales specifically)
- **FindA.Sale Advantage:** Zero upfront cost, unified shopper discovery, no transaction fee (only platform fee), customer support commitment

**DIY Auctions** (Budget auction platform)
- **Pricing:** 10% commission capped at $1,000 (extremely transparent)
- **Audience:** 10,000+ annual transactions (estimated)
- **Strengths:** Crystal-clear pricing; organizer-friendly; no upfront cost; strong for small operators
- **Weaknesses:** No shopper discovery; invitation-only buyer model; limited to auction format; basic web UI; single-auction-at-a-time model
- **Threat Level:** LOW (lacks shopper discovery, niche market)
- **FindA.Sale Advantage:** Integrated shopper discovery, fixed-price + auction support, modern mobile PWA, AI tagging

### Indirect Competitors (Tier 2 — Market Share Theft)

**Facebook Marketplace**
- **Threat:** Free local buying/selling; algorithm reaches massive shopper base
- **Why Not a Direct Threat:** Blocks estate sale and auction terminology; poor organizer discovery; no payment processing integration; unmoderated (safety issues)
- **Opportunity:** FindA.Sale can serve safety-conscious shoppers; transparent organizer verification

**Craigslist**
- **Threat:** Dominant local classifieds; ~30M monthly US visitors
- **Why Not a Direct Threat:** Declining use among younger shoppers; no safety features; rampant scams; no platform enforcement
- **Opportunity:** FindA.Sale safer, modern alternative

**eBay / Poshmark / Mercari**
- **Threat:** Massive resale platforms; ship nationwide
- **Why Not a Direct Threat:** Designed for individual items, not estate sales as events; no local discovery; shipping-only model
- **Opportunity:** FindA.Sale owns in-person estate sale discovery (shopper experience differs fundamentally from eBay)

### Competitive Matrix

| Feature | EstateSales.NET | MaxSold | AuctionNinja | DIY Auctions | SimpleConsign | Yard Sale Map | **FindA.Sale** |
|---------|---|---|---|---|---|---|---|
| **Shopper Discovery** | ✅ | ⚠️ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Organizer Tools** | ⚠️ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| **Real-Time Auctions** | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Payment Processing** | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Mobile-First UX** | ❌ | ⚠️ | ⚠️ | ❌ | ✅ | ✅ | ✅ (PWA) |
| **AI Features** | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ✅ |
| **Fee Transparency** | ❌ | ❌ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ |
| **Customer Support** | ❌ | ❌ | ❌ | ⚠️ | ✅ | ⚠️ | ✅ (goal) |
| **Pricing (% of GMV)** | 13–20% | 15–30% | 2%+ fees | 10% | ~8–12% | Free | **5–7%** |

**Key Takeaway:** FindA.Sale is the only platform combining organizer tools, shopper discovery, auctions, AI tagging, and transparent pricing in one product. No competitor has built a unified experience.

### Competitive Advantages

1. **Unified Organizer + Shopper Platform:** Every competitor serves one audience. FindA.Sale serves both with integrated workflows.

2. **Transparent, Organizer-Friendly Pricing:** 5%–7% fee (lowest in market) with no upfront costs. Clear pricing shown at confirmation (vs. competitors' hidden fees).

3. **AI-Powered Item Entry:** Photo → auto-generated title, category, condition, price. Organizers save 80% of time on data entry versus manual work.

4. **Mobile-First PWA Architecture:** Installable, offline-capable, fast, no app store friction. Avoids the slowness of EstateSales.NET and crashes of native apps.

5. **Real-Time Auction System:** Socket.io live bidding with soft-close (extended bidding). Drives engagement and competitive pricing.

6. **Customer Support Commitment:** Promise of responsive support (<4-hour response time) addresses #1 complaint across all competitors.

7. **Modern Design & UX:** Fraunces serif + sage-green branding, accessibility (WCAG 2.1 AA), intuitive workflows. Competitors look and feel outdated.

8. **Network Effects:** More organizers → more inventory → more shoppers → organizers earn more → attracts more organizers. Flywheel starts at regional scale.

### What We Should Watch (Threats)

1. **Incumbents Improving Support:** If EstateSales.NET or MaxSold hire better support teams, it erodes our main differentiator.

2. **Facebook Marketplace Adding Estate Sale Features:** If Meta removes its estate sale + auction terminology blocks, Marketplace becomes a direct threat.

3. **National Players Localizing:** If AuctionNinja or DIY Auctions add shopper discovery layers, they gain on our unified advantage.

4. **Platform Consolidation:** MaxSold acquired VarageSale in 2024. Consolidation could create a stronger competitor.

---

## 6. Marketing and Sales Strategy

### Target Customer Acquisition Channels

**Organizer Acquisition (Supply-Side)**

*Direct Outreach (High ROI, Personal)*
- **Facebook Groups:** Estate sale organizers, Michigan real estate professionals, Grand Rapids business community
- **Professional Associations:** Michigan Auction Association, Better Business Bureau, Grand Rapids Chamber of Commerce
- **Personal Referrals:** Ask early customers to refer peers (give $50 credit per referral)
- **Networking Events:** Attend 2–3 estate sales per month in person, introduce app to organizers on-site

*Local Partnerships (Scalable)*
- **Probate Attorneys:** Recommend FindA.Sale to clients needing estate liquidation (3–5 referrals/month per attorney)
- **Senior Living Facilities:** Partner to offer FindA.Sale as "downsizing service" for residents (1–2 sales/month per facility)
- **Moving Companies:** Leave FindA.Sale cards at end of estate clearance jobs (10–30 inquiries/month)
- **Real Estate Agents:** Recommend for estate home clearing before sale listing
- **Antique Dealers:** Cross-promotion + consignment pipeline

*Content Marketing*
- **Blog:** "How to run your first estate sale," "Pricing strategies," "Virtual queue best practices"
- **Video:** TikTok / YouTube shorts of estate sale finds (user-generated content from shoppers)
- **Local Press:** Pitch "Grand Rapids startup modernizes estate sales" story (500–2,000 visits per article)

*SEO / Organic Search*
- **Long-Tail Keywords:** "[Neighborhood] estate sales this weekend," "sell estate fast Michigan," "online estate auction"
- **Google Business Profile:** Optimize for local search
- **Neighborhood Landing Pages:** "Estate Sales in Midtown Grand Rapids," "Estate Sales in East Hills"

**Shopper Acquisition (Demand-Side)**

*Organic / Viral*
- **Shopper Reviews & Ratings:** Word-of-mouth from estate sale community
- **Social Proof:** Social media posts about "great find at FindA.Sale" organically shared
- **TikTok / Instagram:** "Estate sale hauls," "thrift flips," influencer partnerships with local pickers

*Content & SEO*
- **Blog:** "Treasure hunting guide," "How to spot valuable antiques," "Before & after furniture flips"
- **Seasonal Content:** "Spring cleaning," "Summer downsizing," "Holiday gift guide from estate sales"
- **Video Tutorials:** Organizer tips (on FindA.Sale blog + YouTube)

*Paid Acquisition (Later Stage, Once LTV Validated)*
- **Google Search Ads:** Bid on "[city] estate sales" once unit economics are clear
- **Instagram / Facebook Ads:** Retargeting users who viewed sales but didn't purchase
- **Reddit / Local Community Groups:** Organic mentions in downsizing/moving communities

*Partnerships & Cross-Promotion*
- **Estate Sale Influencers:** Partner with local antique pickers, resellers, decorators (affiliate commission on referrals)
- **Complementary Services:** Real estate agents, moving companies, junk removal (cross-promotion)
- **Events:** Pop-up "Mega Estate Sale" events in Grand Rapids to drive buzz

### Organizer Acquisition Strategy (Phase 1: Now–Q2 2026)

**Target: 5–10 beta organizers by end of Q1 2026**

**Week 1–2: Targeting & Outreach**
1. Identify 20 potential organizers in Grand Rapids (via Facebook groups, EstateSales.NET directory, Google Maps)
2. Send personalized email + message: "I built a free estate sale platform. Want to try it?"
3. Offer: Free setup, hands-on onboarding, fee waiver for first sale (to reduce risk)

**Week 3–4: Onboarding & Support**
1. Schedule 1-on-1 setup calls with interested organizers
2. Walk through sale creation, item entry, payment setup
3. Provide phone number + email for support (personal touch)
4. Collect feedback: What's confusing? What's missing? What would make you switch from EstateSales.NET?

**Week 5–8: First Sales & Iteration**
1. Monitor first 5–10 sales for bugs, edge cases, UX issues
2. Fix blockers in real-time (daily communication)
3. Collect organizer feedback on pricing, features, support
4. Document case studies ("How Margaret sold $8,000 in one weekend")

**Week 8–12: Expand & Iterate**
1. Recruit next cohort of 5–10 organizers
2. Referral incentive: $50 credit per organizer referred
3. Testimonial collection for website/marketing
4. Identify power users for upgrade to Growth tier

### Shopper Acquisition Strategy (Phase 1: Organic, Seeded by Organizers)

**Initial Acquisition: Through Organizers**
- Each organizer promotes FindA.Sale to their shopper audience (email, Facebook, signage at physical sale)
- Target: 10–50 new shoppers per organizer signup (depends on organizer's audience)
- First 100–500 shoppers will be organic/referral (lowest CAC)

**Phase 2 (Q2+):** Once organizer base reaches 20+ and inventory density increases:
- **Organic Search:** Long-tail keywords ("estate sales near me," "vintage furniture Grand Rapids")
- **Social Proof:** Reviews, ratings, user-generated content (estate sale hauls)
- **Referral Program:** $5 credit per referred shopper (incentivizes existing users to invite friends)

### Brand Positioning and Messaging

**Core Brand Message:** "FindA.Sale makes estate selling simple. No complicated fees, no 2-week waits for support. Just smarter tools and faster payouts."

**Tone:** Friendly, trustworthy, modern (vs. competitors' outdated corporate tone)

**Pillars:**
1. **Transparency:** All fees shown upfront; no surprise charges
2. **Simplicity:** Photo upload → AI tags → publish → get paid (3 steps)
3. **Speed:** Instant payouts, same-day support response, quick checkout for shoppers
4. **Support:** Real people answering questions (not chatbots)
5. **Modern Tech:** PWA, real-time auctions, AI tagging (vs. 2005-era platforms)

**Key Messaging Frameworks:**

*For Organizers:*
> "You spend hours cataloging items. FindA.Sale does it with AI. You get paid instantly. And we charge 5% instead of 20%. Your spreadsheet called — it wants a break."

*For Shoppers:*
> "Find the best estate sales near you. Real items, real prices, real people. No algorithms, no surprises."

### Pricing Strategy & Rationale (Locked)

**Platform Fees (Locked Decision):**
- **Fixed-Price Items:** 5% of sale amount
- **Auction Items:** 7% of sale amount
- **Organizer Messaging:** "We charge nothing upfront. We earn 5% only on what sells. You keep 95%."

**Competitive Framing:**
> "EstateSales.NET charges $99 upfront + $2.95 per item before you sell anything. MaxSold charges 30%. FindA.Sale charges 5% only on what actually sells. That's 3–6× cheaper."

**Post-Beta Tiers (Conditional on validator, Q2+ 2026):**
| Tier | Monthly Fee | Platform % | Target |
|------|-------------|-----------|--------|
| **Starter** | $0 | 5% / 7% | Casual organizers, 1–2 sales/year |
| **Growth** | $39 | 3% / 5% | Active organizers, 4+ sales/month |
| **Pro** | $99 | 2% / 3% | Professional companies, 16+ sales/month |

---

### Marketing Calendar Summary (Q1–Q2 2026)

| Week | Organizer Activity | Shopper Activity | Marketing |
|------|-------------------|-----------------|-----------|
| 1–2 | Recruit 5 beta organizers | — | Email outreach, testimonials setup |
| 3–4 | Onboard, first sales | Organic traffic seeded by organizers | Local press pitch |
| 5–8 | Collect feedback, iterate | 100–200 shopper registrations | Blog post: "First estate sale on FindA.Sale" |
| 9–12 | Recruit next 5 organizers, testimonials | 500+ shoppers, social proof | Facebook/Instagram: user-generated content, case studies |
| Q2 | Expand to 20 organizers | 1,000+ active shoppers | Local partnerships, referral program |

### Customer Success & Retention Strategy

**For Organizers:**

1. **Onboarding:** Personal setup call, walkthrough guide, email support for first 30 days
2. **Education:** Weekly tips email ("Best photo angles," "Pricing for different categories"), FAQ video library
3. **Support:** 4-hour response time target, phone support for critical issues
4. **Community:** Private Slack / Facebook group for organizer tips, best practices, feature requests
5. **Loyalty:** Referral program ($50 credit per organizer referred), exclusive features for repeat users

**For Shoppers:**

1. **Email:** Weekly curator recommendations, price drop alerts, new sales matching saved searches
2. **Notifications:** Push alerts for favorite items, auction ending soon, organizer new sales
3. **Community:** Shopper reviews, ratings visible, user-generated haul photos
4. **Engagement:** Hunt Pass gamification (points, streaks, leaderboards), referral bonuses ($5 credit)
5. **Feedback:** In-app survey after purchase, feature request form

---

## 7. Operations Plan

### Technology Infrastructure

**Deployment Architecture:**

| Component | Service | Cost (Monthly) | Purpose |
|-----------|---------|----------------|---------|
| Frontend | Vercel (finda.sale) | $0–20 | Next.js PWA, edge functions, image optimization |
| Backend API | Railway | $5–50 | Node.js/Express server, cron jobs |
| Database | Neon PostgreSQL | $0–20 | Primary data store, 35 migrations ready |
| Image Storage | Cloudinary | $0–30 | Photo CDN, transformations, storage |
| Email | Resend | $0–25 | Transactional emails, weekly digests |
| SMS | Twilio | $0–10 | Optional queue position updates |
| Real-Time | Socket.io (Railway) | Included | Live auction bidding |
| Monitoring | Sentry | $0–20 | Error tracking, uptime alerts |
| Analytics | PostHog (optional) | $0–50 | User behavior tracking, feature analytics |
| **Total (Beta)** | — | **~$300–400** | All systems included |

**Data & Compliance:**
- **Database Backups:** Neon automated daily snapshots (14-day retention)
- **PII Security:** Passwords hashed with bcrypt; payment data handled by Stripe (no cardholder data stored)
- **Monitoring:** Sentry tracks errors in real-time; UptimeRobot alerts on downtime
- **Disaster Recovery:** Code backed up to GitHub; database snapshots automated; recovery runbook documented

### Team Structure (Bootstrap Phase)

**Current Team (2026-03-06):**
- **Patrick DeSee:** Founder, solo builder (21 development phases completed using AI-assisted development)
- **AI Agents:** Claude 3.5 Sonnet + Haiku API (for customer support scripting, feature development)

**Planned Additions:**

*Q1–Q2 2026 (Beta):*
- **Customer Support Lead (Contract):** 10–20 hrs/week, respond to organizer/shopper emails and phone calls
- **Marketing Contractor (Optional):** Social media, local partnerships, SEO optimization

*Q3 2026 (Growth):*
- **Technical Co-Founder / Backend Lead (Full-Time):** Stabilize infrastructure, optimize database queries, lead payment flow improvements
- **Operations Manager (Full-Time):** Customer support coordination, organizer onboarding, community management

*Q4 2026+ (Scale):*
- **Full-Stack Engineer (Full-Time):** Feature development, mobile app exploration
- **Marketing Manager (Full-Time):** Paid acquisition, partnerships, content strategy
- **Customer Success Manager (Full-Time):** Organizer retention, feedback loops, expansion selling

**Current Operating Model:**
- Extremely lean: Patrick handles product decisions, partnerships, fundraising
- Development outsourced to AI (Claude); routine updates and bug fixes handled via skills/automation
- Support handled manually by Patrick until volume requires contractor hire

### Key Operational Processes

**Sale Creation Workflow (Organizer):**
1. Register / login
2. Create sale (date, location, event type)
3. Add items (batch photo upload, manual entry, CSV import, or voice-to-text)
4. AI auto-tags items (photo → title, category, condition, price)
5. Organizer reviews/edits AI suggestions
6. Publish sale
7. Manage during sale (virtual queue, hold items, price reductions, close items)
8. End sale, view analytics, initiate payout

**Purchase Workflow (Shopper):**
1. Browse sales (map, search, neighborhood filters)
2. View items (photos, descriptions, organizer info)
3. Add to cart / bid on auction
4. Checkout (Stripe, optional delivery/pickup coordination)
5. Receive order confirmation, messaging with organizer
6. Leave review

**Payment & Payout Flow (BackEnd):**
1. Shopper completes payment via Stripe (organizer acts as "seller" via Connect Express)
2. Platform fee automatically deducted (5% or 7%)
3. Stripe processing fee deducted (~2.9% + $0.30)
4. Organizer receives net payout
5. Instant payout option: funds available within 24 hours
6. Weekly or monthly statement available for download

**Customer Support Process:**
1. Shopper/organizer submits ticket via email (support@finda.sale) or in-app form
2. Support lead receives email, categorizes (billing, technical, account, feedback)
3. Response time: <4 hours during business hours (8am–8pm ET)
4. For complex issues: escalate to Patrick or technical team
5. Track and resolve in ticketing system (Google Sheets or Zapier during beta; upgrade to Help Scout / Zendesk at scale)

**Marketing & Growth Process:**
1. Identify 20 potential beta organizers (manual research: Facebook groups, Google Maps)
2. Personalized outreach: email + direct message
3. Schedule onboarding calls (Calendly)
4. Walk through setup, collect feedback
5. Monitor first sales for edge cases, UX issues
6. Publish case studies and testimonials
7. Iterate based on feedback and usage metrics

### Technology Development Process

**Release Cycle:**
- **Weekly:** Bug fixes, small improvements, infrastructure updates (deploy to main via GitHub MCP when <5 files changed)
- **Bi-Weekly:** Feature rollout, schema migrations, major updates (manual git push via PowerShell `.push.ps1` script for larger batches)
- **Monthly:** Roadmap reviews, data migrations, performance optimization

**Code Quality:**
- Pre-push hooks validate TypeScript, Prisma schema, controller stubs, auth coverage
- All API routes require authentication (JWT or OAuth)
- All payment flows tested against Stripe test mode
- Database migrations tested on Neon staging before production deploy
- Sentry monitors errors in production; Slack alerts on new error types

**Feature Development:**
- Claude handles design, implementation, testing
- Patrick reviews and approves before merge
- Organizer/shopper feedback incorporated into next sprint planning

### Customer Support Model

**Support Channels (Beta → Q1 2026):**
1. **Email:** support@finda.sale (4-hour response target)
2. **In-App Feedback Form:** Linked to email ticketing
3. **Phone (Optional):** Google Voice number for urgent issues (organizers running sales)

**Support SLAs:**
| Issue Type | Response Time | Example |
|-----------|----------------|---------|
| Payment/Payout Issues | <1 hour | "My payout isn't showing up" |
| Account Access / Reset | <2 hours | "I forgot my password" |
| Feature Questions | <4 hours | "How do I create a virtual queue?" |
| Product Feedback | <24 hours | "This feature would be great..." |
| Bug Reports | <2 hours | "The add-items page won't load" |

**Knowledge Base (Q2+):**
- FAQ by role (organizer, shopper)
- Video tutorials (5–10 min each)
- Email template responses to common questions
- Internal support KB (Notion or Confluence)

### Geographic Expansion Plan

**Phase 1: Grand Rapids (Months 1–3)**
- Focus: 200,000 metro area, ~1,200 estate sales/year
- Target: 5–10 organizers, 100–500 shoppers
- Method: Direct outreach, local partnerships, in-person networking

**Phase 2: Midwest (Months 4–12)**
- Geographic: Detroit, Lansing, Ann Arbor, Kalamazoo (Michigan); then Indianapolis, Chicago, Milwaukee
- Scale: 20–50 organizers, 5,000–10,000 shoppers
- Method: Referral loops from early organizers, SEO scaling, paid partnerships

**Phase 3: National (Year 2+)**
- Geographic: All US markets, starting with high-boomer-density regions (Florida, Arizona, California)
- Scale: 200+ organizers, 100,000+ shoppers
- Method: Paid acquisition, creator partnerships, paid search

---

## 8. Management Team

### Founder & CEO

**Patrick DeSee**
- **Title:** Founder & CEO
- **Background:** Grand Rapids, MI native with deep knowledge of local estate sale market and real estate community
- **Technical Skillset:** Product management, project planning, AI-assisted development (14 months, 21 phases with Claude)
- **Relevant Experience:** Understanding of organizer workflows from field research; relationships with probate attorneys, real estate agents, senior living facilities in Grand Rapids
- **Role:** Product strategy, partnerships, funding, customer interviews, fundraising
- **Current:** Full-time on FindA.Sale (2024–present)

### Advisory & Future Hires

**Advisor Needs (Q1–Q2 2026):**
- **Michigan Business Attorney:** Guidance on estate sale permits, sales tax obligations, platform liability (1–2 consultations/quarter, ~$300–500 per consult)
- **CPA / Tax Advisor:** Tax structure, sales tax registration, quarterly payroll planning (1 consult/quarter, ~$200–400 per consult)
- **Estate Sale Industry Advisor:** Validation of product roadmap, organizer feedback interpretation, competitive intelligence (TBD — seek among early customers)

**Technical Co-Founder / CTO (Target: Q3 2026, if revenue or seed funding available)**
- Qualifications: Full-stack Node.js + React experience, Stripe/payments, database optimization, deployment infrastructure
- Role: Lead technical stability, payment system improvements, performance optimization at scale
- Structure: Co-founder equity (exact % TBD based on funding/runway)

**Sales Lead (Target: Q3 2026)**
- Qualifications: Estate sale industry connections, comfort with cold outreach, consultative selling
- Role: Organizer acquisition, partnership negotiation, customer success for high-touch accounts
- Structure: Commission-based initially (10–15% of platform fees from organizers they recruit), transition to salary at scale

**Customer Success Manager (Target: Q4 2026)**
- Qualifications: Customer support experience, strong communication, problem-solving
- Role: Organizer onboarding, retention, feedback collection, feature request triage
- Structure: Full-time salary + bonus based on organizer retention

### AI Agent Fleet (Current Advantage)

FindA.Sale leverages an "AI agent fleet" approach to development, where Claude 3.5 Sonnet serves as a dedicated engineering partner across:
- **Product Development:** Feature implementation, bug fixes, schema migrations
- **Customer Support Scripts:** Email response templates, FAQ generation, troubleshooting flows
- **Marketing Content:** Blog posts, social media, email sequences
- **Analytics & Reporting:** Monthly business metrics, competitive intelligence, data analysis
- **Documentation:** Technical specs, onboarding guides, process documentation

This model allows a solo founder to ship enterprise-grade features at startup velocity. Limitation: AI cannot make customer acquisition calls, attend partnership meetings, or sign legal documents. Those remain Patrick's domain.

---

## 9. Financial Plan

### Revenue Model

FindA.Sale earns revenue exclusively through platform fees (organizer-paid):

**Primary Revenue: Platform Fees**
- **Fixed-Price Sales:** 5% of gross transaction amount
- **Auction Sales:** 7% of gross transaction amount
- **Example:** $5,000 sale, 5% fee = $250 revenue to FindA.Sale

**Formula:**
```
Monthly Revenue = (Fixed-Price GMV × 0.05) + (Auction GMV × 0.07)
Assuming 80% fixed / 20% auction mix:
Blended fee rate = (0.80 × 0.05) + (0.20 × 0.07) = 0.054 (5.4%)
```

**Post-Beta Revenue Streams (Q2+ 2026, Conditional):**
1. **AI Tagging Add-On:** $0.05 per item beyond 50 free tags/sale (cost: $0.01, margin: 80%)
2. **Subscription Tiers:** Growth ($39/month, 3%/5% fees) and Pro ($99/month, 2%/3% fees)
3. **Featured Placement:** $50–100 per featured sale slot (optional premium listing)
4. **Affiliate Commissions:** 2–3% on referred organizers (if partnership model develops)

### Revenue Projections (Conservative Estimate)

**Assumptions:**
- Average GMV per sale: $5,000 (conservative; typical estate sale $15K–$25K; online = 25–35% of typical sale)
- Platform fee blended: 5.5% (80% fixed at 5%, 20% auction at 7%)
- Organizer churn: 50% monthly (typical SaaS churn for new service; improves over time)
- Sales per active organizer: 1.5 sales/month average
- Stripe processing cost: ~2.2% of GMV (after discounts)

| Period | Active Organizers | Sales/Month | GMV/Month | Gross Platform Revenue* | Stripe Cost | Net Revenue | Status |
|--------|-------------------|-------------|-----------|------------------------|------------|-------------|--------|
| **Q1 2026 (Beta)** | 5 | 8 | $40K | $2,200 | $880 | $1,320 | Validation |
| **Q2 2026** | 15 | 25 | $125K | $6,875 | $2,750 | $4,125 | Early traction |
| **Q3 2026** | 35 | 60 | $300K | $16,500 | $6,600 | $9,900 | Growth |
| **Q4 2026** | 75 | 130 | $650K | $35,750 | $14,300 | $21,450 | Acceleration |
| **Year 1 Total** | ~80 avg | ~223 | ~$1.1M | ~$61K | ~$24K | ~$37K | |
| **Year 2 Total** | ~200 avg | ~3,500 | ~$17M | ~$935K | ~$374K | ~$561K | Scale |
| **Year 3 Total** | ~500 avg | ~9,000 | ~$45M | ~$2.5M | ~$990K | ~$1.51M | Profit |

*Gross platform revenue = before Stripe fees and operating costs

**Important Caveats:**
- Projections assume organizer acquisition targets are met; actual may vary
- GMV per sale may be lower initially (smaller estates in beta)
- Organizer retention assumes product-market fit; poor retention would reduce projections significantly
- Post-beta subscription upsells (Growth/Pro tiers) not included in projections (conservative approach)

### Cost Structure

**Fixed Monthly Operating Costs (Infrastructure):**

| Item | Cost | Notes |
|------|------|-------|
| Vercel (Frontend CDN) | $0–20 | Free tier sufficient for initial scale |
| Railway (Backend) | $5–50 | ~$20–50/month at beta scale |
| Neon PostgreSQL | $0–20 | Free tier (10GB) → paid (~$15/month) at growth |
| Cloudinary (Images) | $0–30 | Free tier (25GB storage) → paid at scale |
| Resend (Email) | $0–25 | 100 emails/day free → $20/month at higher volume |
| Twilio (SMS, optional) | $0–10 | For virtual queue SMS updates |
| Sentry (Monitoring) | $0–20 | Free tier sufficient for beta |
| Domain & DNS | $15/year | finda.sale registry + Vercel DNS |
| Misc. (API keys, tests) | $0–20 | Buffer for unexpected services |
| **Total Infrastructure** | **~$300–400/month** | Scales sub-linearly with usage |

**Variable Costs (Scale with GMV):**

| Item | Rate | Notes |
|------|------|-------|
| Stripe Processing | 2.2% of GMV | Covers payment processing, fraud, chargeback |
| Google Cloud Vision API | $1.50 per 1K images | AI tagging; free 1K/month tier |
| Claude Haiku API | $1 input / $5 output per 1M tokens | AI descriptions; ~$0.25 per 1K items |
| **Total Variable** | **~3.9–4.5% of GMV** | Improves margins at scale |

**Staffing Costs (Phase 2, Q2 2026+):**

| Role | Type | Cost/Month | When |
|------|------|-----------|------|
| Customer Support Lead | Contract | $1,500–2,000 | Q2 2026 |
| Marketing Contractor | Contract | $1,000–2,000 | Q2 2026 (optional) |
| Technical Co-Founder | Full-Time (salary + equity) | $4,000–8,000 | Q3 2026 (if funded) |
| Operations Manager | Full-Time | $3,000–5,000 | Q3 2026 (if funded) |

### Break-Even Analysis

**Monthly Operating Cost:** ~$400 (infrastructure only, beta phase)

**Revenue Needed to Break Even:**
```
$400 ÷ 0.054 (blended fee rate) = $7,407 monthly GMV
```

**In Organizer Terms:**
```
$7,407 ÷ $5,000 (avg sale) = 1.48 sales/month
1.48 sales ÷ 5 organizers = 0.3 sales per organizer per month
```

**Conclusion:** Break-even occurs at 1–2 medium sales per month ($5K–$10K GMV). Achievable within beta (Week 8–12, once 5 organizers are active).

**Cash Runway (No Revenue):**
- **Current Burn:** ~$400/month (infrastructure only)
- **With Contractor Support ($1,500/month):** $1,900/month
- **With Full-Time Hire ($5,000/month):** $5,400/month

**If Seed Funding Secured ($200,000):**
- Runway at $5,400/month burn: 37 months
- Timeline to profitability: 12–18 months (assumes revenue targets met)
- Safety margin: 2 years to validate product-market fit

### Key Financial Metrics to Track

**Leading Indicators (Weekly/Monthly):**
- **Organizers:** New signups, active (≥1 sale/month), churn rate
- **GMV:** Total sales processed, average sale size, sales by category
- **Shoppers:** New signups, active (≥1 purchase/month), repeat purchase rate
- **Engagement:** Favorites saved, items searched, search-to-purchase conversion

**Trailing Indicators (Monthly/Quarterly):**
- **Revenue:** Gross platform fees, net revenue (post-processing costs), MRR
- **Unit Economics:** CAC (organizer acquisition cost), LTV (lifetime value per organizer), LTV:CAC ratio (target: >3:1)
- **Retention:** Organizer month-over-month retention, repeat purchase rate (shoppers)
- **Profitability:** Gross margin, operating margin, months to profitability

**Strategic Metrics:**
- **TAM Expansion:** Percent of addressable market captured (regional, then national)
- **Market Share:** Estimated % of Grand Rapids / Michigan estate sale volume
- **NPS (Net Promoter Score):** Organizer and shopper satisfaction (target: 50+)
- **Support Response Time:** Average first-response time (target: <4 hours)

### Funding Requirements

**Current Status:** Self-funded through March 2026. Seeking seed funding to accelerate growth.

**Funding Ask:** $150,000–$300,000 (Seed / Pre-seed)

**Use of Funds:**

| Category | % | $150K | $300K | Purpose |
|----------|---|-------|-------|---------|
| **Organizer Acquisition** | 30% | $45K | $90K | Direct outreach, partner development, incentives for first 20 organizers |
| **AI Infrastructure** | 15% | $22K | $45K | Google Vision + Claude Haiku API costs, tagging model optimization |
| **Customer Support** | 25% | $37K | $75K | Contract support lead (Q2–Q4), customer success operations |
| **Marketing & SEO** | 20% | $30K | $60K | Local partnerships, content marketing, paid search testing |
| **Legal & Compliance** | 10% | $15K | $30K | Michigan attorney for permits/tax questions, LLC costs, compliance audit |

**Funding Milestones (Contingent on Achieving):**
- **Months 1–3 (Q1 2026):** 5 beta organizers, 50+ shoppers, validate payment flows
- **Months 4–6 (Q2 2026):** 15 organizers, 500+ shoppers, $100K GMV processed, achieve break-even operations
- **Months 7–12 (Q3–Q4 2026):** 50+ organizers, 5,000+ shoppers, $1M GMV processed, $20K+ monthly revenue
- **Year 2 Readiness:** 200+ organizers, Series Seed evaluation at $2M+ ARR run rate

---

## 10. Appendix

### Supporting Documents & References

All referenced research and analysis documents are stored in `/claude_docs/`:

**Business & Strategy:**
- `STATE.md` — Current project state, locked decisions, pending actions
- `STACK.md` — Technology stack lock, architecture principles
- `roadmap.md` — Development roadmap, parallel path model, achieved milestones
- `COMPLETED_PHASES.md` — Historical record of all 21 phases shipped

**Research & Competitive Analysis:**
- `competitor-intel/competitive-analysis-2026-03-06.md` — Detailed analysis of 12 competitors, feature gaps, market opportunities
- `research/pricing-analysis-2026-03-05.md` — Pricing models, competitor fees, break-even analysis
- `research/investor-materials-2026-03-05.md` — Pitch deck outline, TAM/SAM/SOM, financial model
- `research/strategic-review-2026-03-05.md` — Honest product assessment, priority stack, recommendations
- `research/growth-channels-2026-03-04.md` — Customer acquisition channels, partnerships, content strategy

**Compliance & Operations:**
- `beta-launch/LEGAL_EXEC_SUMMARY.md` — Legal readiness, ToS/Privacy Policy, Michigan permits
- `beta-launch/legal-compliance-scan-2026-03-06.md` — Detailed legal audit, recommendations
- `brand/` — Logo SVG/PNG, business card designs, color palette, typography (Fraunces serif + sage green)

**Technical:**
- `SECURITY.md` — Security rules, data protection, compliance guardrails
- `DEVELOPMENT.md` — Local dev setup, Docker migration (native PostgreSQL), deployment runbook
- `OPS.md` — Stripe webhook rotation, credential management, disaster recovery

**Launch Materials:**
- `beta-launch/organizer-outreach.md` — Template for recruiting beta organizers
- `beta-launch/marketing-calendar-2026-03-06.md` — Week-by-week marketing plan for beta and beyond
- `BETA_CHECKLIST.md` — Pre-launch checklist, all items tracked

### Glossary of Terms

**AI Tagging:** Automated item identification and description generation using Google Cloud Vision and Claude Haiku APIs. Photo → title, category, condition, price suggestion.

**DeFi/Crypto:** Not applicable to FindA.Sale's business model. Platform uses Stripe for payments (traditional fintech).

**Estate Sale:** Event-based liquidation of property from a deceased or downsizing person, typically managed by a professional organizer or family member.

**GMV (Gross Merchandise Value):** Total dollar value of goods sold on the platform (before platform fees, payment processing, refunds).

**Hunt Pass:** Optional paid tier ($4.99/season) for shoppers, unlocking gamified treasure hunt challenges, points, and leaderboards.

**LTV (Lifetime Value):** Estimated total profit expected from a single organizer or shopper over their entire lifetime using the platform.

**MRR (Monthly Recurring Revenue):** Revenue from subscriptions and ongoing fees (applicable once subscription tiers launch).

**NPS (Net Promoter Score):** Satisfaction metric (0–100 scale) measuring likelihood of recommendation. Score >50 considered excellent.

**PWA (Progressive Web App):** Web application that functions like a native app (installable, offline-capable, push notifications) without requiring app store distribution.

**SAM (Serviceable Addressable Market):** Subset of TAM that FindA.Sale can realistically capture given geographic and product constraints.

**SOM (Serviceable Obtainable Market):** Realistic portion of SAM achievable in 3–5 years (5–10% share).

**TAM (Total Addressable Market):** Total market size if FindA.Sale captured 100% of all possible customers.

**Stripe Connect Express:** Payment onboarding for sellers (organizers) via Stripe; enables organizers to receive payouts directly without going through FindA.Sale's bank account.

**Virtual Queue / Virtual Line:** Digital queueing system for shoppers, replacing physical in-person lines at estate sales. Shoppers can join queue remotely, receive SMS position updates.

---

## Final Notes

This business plan represents the current strategic state of FindA.Sale as of 2026-03-06. It is a living document and will be updated quarterly or when material changes occur (funding, market shifts, major product pivots).

**Key Assumptions to Validate:**
1. Organizers will adopt a new platform if it saves them $500+/sale vs. incumbents
2. Shoppers prefer a unified discovery + purchasing platform over separate shopping destinations
3. Mobile-first PWA architecture solves the UX problems that plague competitors
4. AI-powered item tagging reduces data entry friction by 70%+
5. Grand Rapids is a viable pilot market before Midwest/national expansion

**Success Defined:**
- Year 1: 50+ active organizers, 5,000+ shoppers, $1M GMV processed
- Year 2: 200+ organizers, 50,000+ shoppers, $17M GMV processed, $561K net revenue
- Year 3: 500+ organizers across 25+ US states, $45M GMV processed, path to Series A

---

**Document Authority:** Tier 1 Strategic Document
**Last Updated:** 2026-03-06
**Next Review:** 2026-06-06 (Quarterly)
**Author:** Claude (with Patrick DeSee, Founder)
