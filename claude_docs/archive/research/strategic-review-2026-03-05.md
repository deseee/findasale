# FindA.Sale — Strategic Review & Next Moves
**Date:** 2026-03-05
**Context:** All sprints A–X complete. 21 phases shipped. All locked decisions and Grand Rapids constraints removed for this exercise.

---

## Where We Stand

FindA.Sale has shipped a remarkable amount of functionality for a pre-revenue product: JWT auth, sale management, Stripe payments, push notifications, creator affiliates, auction UI, QR marketing, virtual line scaffold, AI item tagging (Ollama), Schema.org SEO, PWA, social login, follow system, Hunt Pass points, shopper messaging, reservation/hold UI, affiliate/referral program, weekly curator email, CSV export, advanced photo pipeline, semantic search, neighborhood landing pages, Socket.io live bidding, instant payouts, UGC bounties, shipping workflow, label PDFs, and Zapier webhooks.

That's a feature set most startups take 12–18 months to build. The question now is not "what more can we build" but "what must we do to turn this into a business that serves real people."

---

## The Honest Assessment

### What We Have
- A production-deployed PWA with deep feature coverage
- Domain (finda.sale) live on Vercel, backend on Railway, DB on Neon
- Stripe Connect Express wired and ready
- Sentry monitoring deployed
- Zero real users, zero revenue, zero validated assumptions

### What We Don't Have
- Any proof that organizers want what we built
- Working AI tagging in production (Ollama is local-only)
- A legal business entity
- Real-world stress testing of payment flows, edge cases, or data at scale
- A go-to-market plan beyond ideas on paper
- Customer service infrastructure
- Any of the "human side" work done

---

## Priority Stack: What to Do Next (Ranked)

### 1. FORM THE BUSINESS ENTITY (Week 1–2) — Mandatory Before Beta

You cannot process real money without this. Steps in order:

**Michigan LLC:** $50 filing with LARA, 7–10 business days. You can self-serve as registered agent (free) since you're in Grand Rapids.

**EIN:** Free, instant online at IRS.gov. Needed for bank account and Stripe verification.

**Business Bank Account:** Mercury or Stripe Business Account — both free, both startup-friendly. Separates personal and business finances from day one.

**Terms of Service + Privacy Policy:** Use Termly.io or TermsFeed ($0–$300). Template is fine for beta. Lawyer review ($1,500–$3,000) before public launch. Your ToS MUST address: organizer liability, dispute resolution, platform fees, cancellation, and Stripe's role.

**Total cost to be legally operational: ~$200. Timeline: 2 weeks.**

Things that can wait until public launch: lawyer review of ToS, general liability insurance ($30–50/mo), cyber liability insurance. Things that can wait until you hit $100K Michigan sales or 200+ transactions: sales tax registration.

---

### 2. GET AI TAGGING WORKING IN PRODUCTION (Week 2–4) — Your Stated Beta Prerequisite

Current state: Ollama with qwen3-vl:4b runs locally in Docker. Not production-deployable. You said you want at least rudimentary tagging before beta testers arrive. Here's the realistic path:

**Phase 1 (Immediate, $0–$50/month):** Replace Ollama local with a cloud vision API. Best options for our budget:

- **Google Cloud Vision API** — 1,000 free images/month, then ~$1.50 per 1,000. $300 free credits for new accounts. Handles item identification and category tagging well.
- **Claude Haiku via API** — $1 input / $5 output per million tokens. Batch mode halves that. Excellent for condition assessment and price estimation alongside identification. You're already in the Anthropic ecosystem.
- **RAM++ (Recognize Anything Model)** — Free, open source, can run on a cheap GPU instance. Zero-shot tagging that handles diverse categories without retraining.

**Recommended approach:** Google Vision for item detection + Claude Haiku for description/condition/pricing. Total cost at beta scale (500–2,000 images/month): $10–$50/month.

**Phase 2 (Post-beta, when volume justifies):** Fine-tune a YOLOv8 model on estate-sale-specific items using HomeObjects-3K dataset + your own collected data. Add specialized handling for antiques/collectibles.

**What about those public GitHub repos and private companies you found?** The most relevant:
- **SimpleConsign** has AI-powered item entry (photo → brand, color, size, price) but it's a closed platform.
- **EstateFlow** does AI-assisted pricing but is a competitor, not an API.
- **RAM++** (GitHub: xinyu1205/recognize-anything) is the best open-source option — zero-shot tagging, CVPR-published, competitive with Google's tagging.
- **LocalAI** (GitHub: mudler/LocalAI) gives you an OpenAI-compatible API wrapper around local models if you want to keep things self-hosted later.

The production architecture: your backend receives the photo upload → sends to Google Vision API for labels → sends to Claude Haiku for description/condition/price estimate → returns combined results to the organizer. Fallback: if either API is down, show manual entry with a "AI unavailable" message. No Ollama needed in production.

---

### 3. STRESS TEST AND BUG FIX WHAT WE HAVE (Week 2–6) — Before Any Real Users

This is the most important technical work. We've built fast across 21 phases. Things that need verification:

**Payment flow end-to-end:** Create a real Stripe test scenario — organizer onboards, lists items, shopper buys, platform fee deducts correctly, organizer gets paid out. Test: refund flow, failed payment, expired card, 3DS challenge, auction bid → win → payment. Test instant payouts. Test the 5% vs 7% item-level fee logic.

**User flow walkthrough:** Register as shopper → browse → search → favorite → follow organizer → get notification → view sale → buy item → leave review. Register as organizer → create sale → add items (manual + CSV + photo) → publish → manage line → end sale → view analytics → get paid.

**Edge cases to hunt:**
- What happens with 0 items in a sale?
- What happens with 1,000+ items? (performance)
- What if an organizer deletes a sale mid-auction?
- What if two people bid at the same second?
- What if Stripe webhook delivery fails?
- What if Cloudinary is down during upload?
- Timezone handling for sale dates/times
- What does the app look like with no data? (empty states exist but are they good?)
- Mobile responsiveness on actual phones, not just dev tools

**Run the health-scout skill** before any of this for a baseline scan.

**Apply pending migrations:** 3 migrations waiting on Neon (v3_bounties, w1_shipping, x1_webhooks). Do this before testing.

---

### 4. POLISH EXISTING FEATURES (Week 4–8) — Quality Over Quantity

Stop building new things. Make what exists feel professional.

**Photo experience:** This is the #1 differentiator from estatesales.net (whose photos are terrible). The photo pipeline works but needs: upload progress indicators, image compression before upload (reduce Cloudinary costs and load times), photo ordering UX refinement, and guidance prompts ("Take a wide shot of the room first, then close-ups of individual items").

**Search and discovery:** Full-text search works. But does it find "mid-century modern dresser" when the item is tagged "wooden dresser"? Semantic search via Ollama was built but needs testing with real-world queries. Consider whether Google Vision labels + simple keyword matching outperforms the current approach.

**Notifications:** Push notifications are wired. Test: do they actually arrive on a real phone? Is the timing right? Are they annoying or useful?

**Onboarding:** The shopper onboarding and empty states exist. Walk through them as if you've never seen the app. Are they clear? Do they guide someone to their first action?

---

### 5. DROP DOCKER FOR LOCAL DEV (Week 1–2) — Quick Win

Your recurring git issues between Docker Desktop and GitHub are a tax on every session. The fix is simple: stop using Docker for local development.

**Why it makes sense now:**
- Your production doesn't use Docker (Vercel + Railway + Neon)
- Docker adds file permission conflicts, line ending issues, and volume mount problems on Windows
- Hot reload through Docker is slower than native
- You're a solo developer — you don't need environment parity enforcement

**Migration path (30 minutes):**
1. Install PostgreSQL via EDB Windows installer (free, port 5432)
2. Update backend .env to point at local PostgreSQL for dev, Neon for production
3. Run `next dev` and Express natively — no containers
4. Archive docker-compose.yml (don't delete — you might want it later)
5. Stop Docker Desktop (frees 5+ GB RAM)

This also eliminates the question of "do we need Docker because of GitHub MCP limitations?" The GitHub MCP works regardless of Docker — it pushes files via API, not git CLI.

---

### 6. USER RESEARCH — Before Building More Features (Week 3–8)

**You asked about researching other markets and user preferences. Here's the market reality:**

The US estate sale market is $2.7B–$4B annually. ~150,000–200,000 sales per year at $18K–$20K average. The broader secondhand market is $186B and growing 17% annually. The baby boomer downsizing wave (ages 60–78 now) is a structural tailwind through 2030.

**Adjacent markets that overlap with your feature set:**
- Yard sales / garage sales (~$1.5B–$2B)
- Thrift stores ($13.8B)
- Antiques and collectibles ($65.2B)
- Auction houses ($17.4B)
- Online resale (eBay, Poshmark, Mercari — massive and consolidating)

**But here's the thing: you don't need more market research right now.** You need 5–10 real organizers using the app and telling you what they actually need. Market research is a procrastination trap when you have zero users. The most valuable research is watching a real organizer try to list their first sale.

**What to research instead:**
- Talk to 3–5 estate sale organizers in Grand Rapids. Buy them coffee. Watch them use estatesales.net. Ask what drives them crazy.
- Talk to 3–5 estate sale shoppers. What do they search for? How do they decide which sales to attend? What information do they wish they had?
- Attend 2–3 estate sales in person. Observe the setup, the flow, the chaos. What technology could genuinely help?

This is more valuable than any web research on eBay's fee structure.

---

### 7. PRICING TIERS — Redesign for Different Organizer Sizes (Week 6–10)

Your current 5% (regular) and 7% (auction) fees are reasonable but undifferentiated. Here's how the market breaks down:

**Competitive landscape:**
- estatesales.net: ~$99 listing + hidden fees. Terrible support.
- MaxSold: 30% commission (managed) or 30% + $99 (self-managed). Expensive.
- eBay: 13.25% average final value fee
- Poshmark: 20% on items ≥$15
- Mercari: 0% seller commission (competing on free)
- Facebook Marketplace: 0% local, 10% shipped

**Recommended 3-tier model:**

**Casual (1–2 sales/year):** 3% platform fee. These are one-time garage sale hosts. Low fee attracts them; they become shoppers on other sales. Volume play.

**Active (3–15 sales/year):** 5% platform fee, 7% auctions. Your current rate. This is the sweet spot — semi-professional organizers who do this regularly.

**Professional (16+ sales/year):** 4% platform fee, 5.5% auctions. Volume discount earns loyalty from companies that run dozens of sales. They bring the most inventory and the most shoppers.

**A la carte image processing:** Yes, offer this. If AI tagging costs you $0.01–$0.05 per image via Google Vision + Claude Haiku, you can charge $0.10–$0.25 per image or bundle it into tiers (Casual gets 50 free AI tags/sale, Active gets 200, Professional gets unlimited). This creates a genuine upsell without gating core functionality.

**Stripe processing (2.9% + $0.30) is always on top.** Be transparent about this — it's the #1 complaint about estatesales.net (hidden fees). Show organizers exactly: "Your 5% platform fee + 2.9% + $0.30 Stripe processing = total X%."

**Don't launch all three tiers at beta.** Start with one flat rate (5%), observe usage, then introduce tiers when you have data on organizer behavior.

---

### 8. DOCUMENTATION AUDIT (Week 2–4)

Your claude_docs/ is well-organized but has some staleness:

**STATE.md** references "Grand Rapids launch first" as a constraint — you're removing that for this exercise but it should be updated to reflect current strategy. The "Next Strategic Move" section says "define Sprint Y or begin beta onboarding" — that needs to become the actual next sprint definition.

**roadmap.md** still has Sprints T–X as the roadmap, but all are complete. It needs to reflect the new strategic priorities.

**COMPLETED_PHASES.md** is accurate and useful as historical record.

**Missing documentation:**
- No investor-ready pitch document
- No user-facing documentation (help center, FAQ beyond the basic one, onboarding guides)
- No API documentation for the Zapier webhook system
- No organizer guide ("How to run your first sale on FindA.Sale")

**The documentation you need most is not for Claude — it's for humans.** An organizer onboarding guide and a shopper FAQ would do more for beta success than any amount of technical docs.

---

### 9. PREPARING THE HUMAN SIDE (Week 4–10)

**Customer service:** At beta scale (5–20 organizers, maybe 50–200 shoppers), you ARE the customer service. Set up:
- A dedicated email (support@finda.sale — you already have Resend configured)
- A simple response template for common questions
- A feedback form in the app (or just a link to email)
- Decide: will you offer phone support? For organizers managing live sales, a phone number builds enormous trust. A Google Voice number costs $0.

**Beta onboarding:** Hand-hold the first 5 organizers. Set up their accounts with them. Watch them list items. Fix what confuses them. This is the most important work you'll do.

**"We're a real business" steps beyond LLC:**
- Google Business Profile (free, huge for local SEO)
- Simple landing page explaining what FindA.Sale is (the PWA is the product, but a marketing page helps)
- Business cards (yes, physical ones — you'll hand them to organizers at estate sales)
- A Calendly or similar for booking demo calls with interested organizers

---

### 10. INVESTOR DOCUMENTATION (Week 8–12) — Only If You Want Outside Money

**Do you need investors right now?** Probably not. Your costs are minimal: Vercel (free tier), Railway (~$5–20/mo), Neon (free tier), Cloudinary (free tier), Stripe (no cost until transactions), domain (~$15/yr). Total: under $50/month.

**If you do want to pursue funding, you'll need:**
- Executive summary (1 page)
- Pitch deck (10–15 slides)
- Financial model (projected revenue at various organizer counts)
- TAM/SAM/SOM analysis

**Market sizing for investors:**
- TAM (Total Addressable Market): $50M–$150M (platform fees on US estate sale transactions)
- SAM (Serviceable Addressable Market): $41M–$67.5M (Midwest/regional focus initially)
- SOM (Serviceable Obtainable Market): $2.4M–$6.5M by Year 5 (5–10% regional market share)

**The story investors want to hear:** Baby boomers are downsizing at unprecedented rates. The existing platforms (estatesales.net — 7.1M visits/month, 1.4 stars on Trustpilot) have terrible UX and worse support. FindA.Sale is mobile-first, AI-powered, and built for the organizer's workflow — not just a listing directory. Early traction in Grand Rapids proves the model before expansion.

**But you need traction first.** Even 10 successful sales processed through the platform is more compelling than any pitch deck. Focus on getting real users before investor materials.

---

### 11. TECH STACK ASSESSMENT

**Is the stack workable?** Yes. Next.js 14 + Express + Prisma + PostgreSQL is battle-tested. Vercel + Railway + Neon is a solid deployment stack for your scale. No changes needed.

**Concerns to watch:**
- Next.js 14 with Pages Router — the ecosystem is moving to App Router. Not urgent, but plan for migration eventually.
- Express is fine but you have a lot of hand-rolled middleware (auth, rate limiting, validation). Consider if this becomes a maintenance burden.
- Prisma is great for your scale. If you ever hit performance issues with complex queries, you can drop to raw SQL selectively.

**The Docker question is answered above (drop it for dev).** The GitHub MCP question: the MCP tool pushes via GitHub's API, independent of your local git setup. Dropping Docker doesn't affect MCP capabilities. Your git issues were Docker-specific (file permissions in mounted volumes).

---

## Recommended Roadmap: Next 12 Weeks

| Week | Focus | Key Deliverable |
|------|-------|----------------|
| 1–2 | LLC + EIN + bank account + drop Docker | Legal entity operational, dev environment simplified |
| 2–3 | ToS/Privacy Policy + AI tagging production path | Legal docs live, Google Vision + Claude Haiku integration spec |
| 3–4 | Apply pending migrations + stress test payment flows | All 3 migrations on Neon, payment E2E verified |
| 4–6 | Full user flow stress test + bug fixes | Health scout report clean, critical bugs fixed |
| 6–8 | AI tagging MVP deployed to production | Organizers can photograph items and get AI suggestions |
| 6–8 | Polish: photo UX, search, notifications, onboarding | App feels professional for first impression |
| 7–8 | Organizer onboarding guide + support email + Google Business Profile | Human-facing materials ready |
| 8–10 | Recruit 5 beta organizers in Grand Rapids | First real sales listed and processed |
| 10–12 | Iterate based on beta feedback | Fix what's broken, cut what's unused |

---

## What NOT to Do Right Now

- **Don't build more features.** You have more features than most funded startups. Every new feature is technical debt without users to validate it.
- **Don't research eBay/Amazon/Walmart integration.** Cross-platform syndication is a growth play for when you have product-market fit. You don't yet.
- **Don't build complex automation workflows.** The automations you have (cron jobs, email digests, push notifications) are sufficient. Watch real organizers before adding more.
- **Don't optimize for scale.** You're not going to have scale problems with 5–20 organizers. Optimize for learning speed.
- **Don't spend money on marketing.** Your first 5–10 organizers come from personal outreach, not ads. The growth channels doc is excellent but premature.
- **Don't build a paid Hunt Pass.** Gamification is a retention play. You need acquisition first.

---

## The One Thing That Matters Most

Get 5 real organizers to list real sales on FindA.Sale. Everything else — pricing tiers, investor docs, multi-metro expansion, feature research — follows from watching real people use your product. The gap between "built" and "used" is where most side projects die. Cross it.

---

*Research sources: claude_docs/research/competitor-intel-2026-03-04.md, claude_docs/research/growth-channels-2026-03-04.md, web research on photo tagging APIs (Google Vision, AWS Rekognition, Clarifai, RAM++, LocalAI), marketplace pricing models (eBay, Poshmark, Mercari, MaxSold, HiBid), Michigan LLC formation requirements, Stripe Connect Express legal requirements, estate sale market sizing (ThredUp 2025, NAR Generational Trends 2025, EstateSales.net 2024 Industry Survey).*
