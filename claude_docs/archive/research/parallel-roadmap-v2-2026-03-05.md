# FindA.Sale — Parallel Path Roadmap v2
**Date:** 2026-03-05
**Status:** P1 partially complete, P3 complete, P2 in progress. Claude paths ready to execute.

---

## Updated Status

| Path | Item | Status |
|------|------|--------|
| P1 | Michigan LLC, EIN, business bank account | **DONE** |
| P1 | Support email, business cards, Google Business Profile | **Open** |
| P3 | Field research (organizers, shoppers, in-person sales) | **DONE** (was the project's origin) |
| P2 | ToS/Privacy — needs implementation | **Next for Claude** |
| P5 | Stripe business account | Patrick can open when ready |

P1 core formation is done. Remaining P1 items (support email, cards, GBP) can run in parallel with everything else. P3 being done compresses us — we can hit beta in 6–8 weeks.

---

## Path Architecture (5 Parallel Tracks)

**P — Patrick (Human):** Beta recruitment, API keys, branding decisions, Stripe setup, real-world partnerships.

**CA — Claude: Production Readiness:** Stress testing, bug fixing, ToS implementation, polish. Pure autonomous work.

**CB — Claude: AI Tagging Pipeline:** Research → integrate → test. One sync point for API keys/budget.

**CC — Claude: Business Intel & Content:** Investor materials, marketing content, pricing analysis. Fully autonomous.

**CD — Claude: Innovation & Experience (NEW):** Blue-sky feature development, branding implementation, UX research, cross-industry feature porting. This is the "outside the box" path — Claude continuously researches and prototypes features that make FindA.Sale best-in-class.

---

## Path P — Patrick (Updated)

### P1: Business Formation — IN PROGRESS
- [x] File Michigan LLC with LARA
- [x] Get EIN from IRS.gov
- [x] Open business bank account
- [ ] Set up support@finda.sale email forwarding
- [ ] Order business cards (~$25)
- [ ] Create Google Business Profile for FindA.Sale

### P2: Legal + Stripe — IN PROGRESS
- [ ] Open Stripe business account (if easier than personal Connect)
- [ ] ⚡ **Sync: Claude implements ToS/Privacy into the app (using competitor-sourced language)**
- [ ] Set up Google Voice for support line
- [ ] Google Search Console verification (if not done)

### P3: Field Research — ✅ COMPLETE
Original project research done. Notes available.

### P4: Beta Recruitment (Week 3–6)
- [ ] Identify 5 target beta organizers
- [ ] ⚡ **Sync: Claude provides demo walkthrough + onboarding guide**
- [ ] Schedule 1-on-1 onboarding sessions
- [ ] Hand-hold first 3 sales
- [ ] Collect structured feedback
- [ ] ⚡ **Sync: feedback → Claude for iteration**

### P5: API Keys & Services (As Needed)
- [ ] Google Cloud account + Vision API key
- [ ] Anthropic API key (for Claude Haiku — may already have)
- [ ] UptimeRobot/StatusGator monitoring
- [ ] OAuth credentials (Google, Facebook)
- [ ] VAPID keys confirmed in production

### P6: Branding Decisions (Week 2–4)
- [ ] Review branding brief (claude_docs/research/branding-brief-2026-03-05.md)
- [ ] Decide: DIY Phase 1 ($200–300) or skip to 99designs ($1,200–1,500)?
- [ ] ⚡ **Sync: Claude implements chosen color palette, typography, and PWA manifest updates**

---

## Path CA — Claude: Production Readiness

### CA1: ToS & Privacy Policy Implementation (1 session)
**Goal:** Live legal pages using competitor-standard language.

Research findings (from ToS agent):
- Standard provisions across all competitors: limitation of liability, dispute resolution, user content ownership, platform fee disclosure, account termination, indemnification
- Estate-sale-specific: item condition disclaimers, in-person transaction safety, "as-is" sale language
- Recommended generator: Termly.io (free tier) or hand-craft from competitor patterns

Tasks:
- Draft ToS covering: platform fees (transparent breakdown), dispute resolution, user content license, item condition disclaimers, cancellation/refund policy, Stripe's role, account termination
- Draft Privacy Policy: data collection, cookies, Stripe/Cloudinary third-party sharing, CCPA basics
- Implement as /terms and /privacy pages (update existing if they exist)
- Add footer links + checkout consent checkbox
- ⚡ **Sync: Patrick reviews before going live**

### CA2: Database & Migration Health (1 session)
- Apply 3 pending Neon migrations
- Prisma schema validation against production
- Document production migration runbook

### CA3: Payment Flow Stress Test (2 sessions)
- Map every Stripe path: onboarding, checkout, refund, failed payment, 3DS, auction win, instant payout
- Test 5% vs 7% item-level fee logic
- Webhook failure recovery testing
- Edge cases: $0 items, concurrent bids, expired cards

### CA4: User Flow Audit (2 sessions)
- Full shopper journey end-to-end
- Full organizer journey end-to-end
- Creator/affiliate journey
- Mobile responsiveness on real viewport sizes
- Accessibility pass
- Edge cases: 0 items, 1000+ items, deleted sale mid-auction

### CA5: Performance & Security (1 session)
- Health-scout baseline scan
- Lighthouse on key pages
- Auth middleware audit
- Sentry verification
- CSP/CORS review

### CA6: Feature Polish (3 sessions)
- Photo upload: progress indicators, compression, ordering UX
- Search: semantic search with real queries
- Push notification delivery verification
- Onboarding walkthrough
- Empty states, error handling, loading states

### CA7: Human Documentation (2 sessions)
- Organizer guide: "How to run your first sale on FindA.Sale"
- Shopper FAQ
- Zapier webhook API docs
- In-app help tooltips

---

## Path CB — Claude: AI Tagging Pipeline

### CB1: Research & Architecture (1 session)
Best options identified:
- **Google Cloud Vision** — 1,000 free/month, $1.50 per 1K after. Good for object detection + labeling.
- **Claude Haiku** — $1/$5 per million tokens. Excellent for description, condition, price estimate.
- **RAM++** (open source) — Zero-shot tagging, no per-image cost, requires GPU hosting.

Recommended: Google Vision for labels + Claude Haiku for descriptions. Cost at beta: $10–50/month.

Tasks:
- Write technical spec with architecture diagram
- Cost model at 100, 1K, 10K images/month
- Evaluate Patrick's discovered GitHub repos
- ⚡ **Sync: Patrick approves approach + creates API keys (P5)**

### CB2: Backend Integration (2 sessions)
- Replace Ollama with cloud API calls
- Fallback chain: Vision → Haiku → manual
- Rate limiting and cost controls
- Cache strategy for repeated lookups

### CB3: Frontend Integration (1 session)
- Photo upload → AI suggestions flow
- Accept/edit/reject per suggestion
- Batch mode for multiple photos
- "AI suggested" badge

### CB4: Quality Tuning (ongoing)
- Test across item categories
- Measure organizer acceptance rate
- Prompt engineering for Haiku descriptions
- Feedback loop for rejected suggestions

---

## Path CC — Claude: Business Intel & Content

### CC1: Investor Materials (2 sessions)
- Executive summary (1 page)
- Pitch deck structure (10–15 slides)
- Financial model
- TAM/SAM/SOM ($50M–$150M TAM, $2.4M–$6.5M SOM by Y5)
- Competitive landscape

### CC2: Marketing Content (ongoing)
- "How to Run an Estate Sale" guide
- "Estate Sale Shopping Guide"
- Social media templates
- Email templates (welcome, reminder, digest, review request)
- Landing page copy
- Blog drafts

### CC3: Pricing Model Analysis (1 session)
- Competitor fee deep dive
- Cost-per-sale analysis
- Break-even by tier
- A la carte AI pricing model
- ⚡ **Sync: Patrick decides launch pricing**

### CC4: Automated Intelligence (already running)
7 scheduled tasks covering competitor monitoring, industry intel, changelog, UX spots, health, monthly digest, workflow retrospective.

---

## Path CD — Claude: Innovation & Experience (NEW)

### CD1: Branding Implementation (2 sessions)
**Goal:** Apply the branding brief to the existing app.

- Update color palette to warm amber (#D97706) + sage green + navy system
- Update PWA manifest (theme_color, background_color)
- Typography audit: evaluate Fraunces/Lora for headings + Inter/DM Sans for body
- Update app icons and splash screens
- Implement brand voice in microcopy (empty states, errors, success messages)
- ⚡ **Sync: Patrick chooses direction in P6 first**

### CD2: Feature Innovation Pipeline (3+ sessions, ongoing)
**Goal:** Ship high-impact features and continuously research new ones.
**Source:** claude_docs/research/feature-brainstorm-2026-03-05.md (25+ features ranked by impact-to-effort)

**Phase 1 — Quick Wins (Low effort, high impact):**

| Feature | Inspiration | What It Does |
|---------|-------------|-------------|
| Live Scarcity Counter | Auction psychology | "3 left" / "5 bought in last hour" on item listings |
| Streak Challenges | Snapchat | Visit/save/buy streaks with Hunt Pass point bonuses |
| Social Proof Live Feed | Amazon/eBay | "X people viewing" / "Y just bought" on sale pages |

**Phase 2 — Engagement Layer (Medium effort, high impact):**

| Feature | Inspiration | What It Does |
|---------|-------------|-------------|
| Treasure Hunt Mode | Pokemon GO | Daily discovery challenges with AI-generated clues |
| Live Drop Events | TikTok live + auctions | Countdown reveals of premium items, FOMO-driven |
| Personalized Weekly Email | Spotify Discover | Curated items based on shopper browse/buy history |
| Smart Inventory Upload | CRM automation | Bulk photo → AI tags → listings in one batch |

**Phase 3 — Moat Features (High effort, very high impact):**

| Feature | Inspiration | What It Does |
|---------|-------------|-------------|
| AI Discovery Feed | TikTok FYP | Personalized item feed using ML on browse/buy signals |
| Buyer-to-Sale Matching | Hinge | ML matches shoppers to sales based on preference history |
| Dynamic Pricing | Uber/real estate | AI suggests prices based on comps, condition, demand |
| Visual Search | Google Lens | Photo → find similar items across all active sales |
| Virtual Tours (360°) | Real estate | Walkable preview of sale space before visiting |

**Phase 4 — Market Expansion (Long-term):**

| Feature | What It Does |
|---------|-------------|
| Reverse Auction | Organizer sets declining price on slow inventory — shoppers get alerts |
| Group Buying Pools | Co-buy expensive items (antique sets, furniture collections) |
| White-label MaaS | Marketplace-as-a-Service for thrift chains and antique dealers |
| Estate Sale Planning Assistant | AI chatbot guiding executors through the entire estate sale process |
| Consignment Integration | Connect thrift store POS systems to FindA.Sale listings |

Each feature follows: research doc → technical spec → prototype → pilot test → ship or shelve decision.

### CD3: Continuous Cross-Industry Research (ongoing)
**Goal:** Never stop looking outside estate sales for ideas.

Monitored industries for feature inspiration: real estate (Zillow, Redfin), social commerce (TikTok Shop, Poshmark), gaming (battle passes, daily quests), food delivery (ETA transparency, live tracking), dating apps (matching algorithms), fitness apps (streaks, challenges), auction houses (Christie's, Sotheby's digital).

Claude runs a weekly feature-innovation-scan to surface new patterns worth evaluating.

### CD4: UX & Workflow Review System (NEW — recurring)
**Goal:** Regular self-assessment of Claude's workflow effectiveness.

Create a scheduled task (bi-weekly) that:
- Reviews recent session logs for repeated friction patterns
- Audits skill effectiveness (which skills fire, which don't, which need updating)
- Checks documentation freshness
- Identifies workflow bottlenecks
- Proposes process improvements
- Reports findings to Patrick in digestible format

---

## Sync Point Calendar (Compressed)

| Week | Sync | What Converges |
|------|------|----------------|
| 1 | ⚡ ToS review | CA1 draft → Patrick approves |
| 1 | ⚡ Branding direction | Patrick chooses path → CD1 implements |
| 2 | ⚡ AI tagging approach | CB1 spec → Patrick approves + API keys |
| 3 | ⚡ Payment test results | CA3 report → go/no-go |
| 4 | ⚡ Documentation review | CA7 guides → Patrick reviews |
| 5 | ⚡ Beta readiness check | All paths → go/no-go for beta |
| 6–8 | ⚡ Beta feedback loops | P4 feedback → CA/CB/CD iterate |

---

## New Infrastructure to Build

### Skills
1. **stress-test** — Guided flow testing (payment, shopper, organizer, auction)
2. **beta-prep** — Pre-beta checklist across all paths
3. **ai-tagging-dev** — AI pipeline development workflow
4. **investor-materials** — Generate/maintain investor docs
5. **branding-implementation** — Apply brand changes consistently

### Scheduled Tasks
1. **beta-readiness-tracker** (weekly Thu) — Cross-path progress report
2. **ai-tagging-research** (weekly Fri) — Monitor vision API developments
3. **workflow-self-review** (bi-weekly) — Claude audits own workflow effectiveness
4. **feature-innovation-scan** (weekly) — Cross-industry feature monitoring

---

## What Success Looks Like at Week 8

- ToS/Privacy live on the site
- All payment flows verified
- AI tagging working with real photos in production
- App rebranded with warm amber palette
- 2–3 quick-win features shipped (scarcity counter, streaks, social proof)
- Organizer onboarding guide complete
- 5 beta organizers recruited and onboarding
- Investor one-pager drafted
- All automated monitoring running

---

*v2 updated 2026-03-05. Incorporates P1/P3 completion, 5-path parallel model, branding track, innovation track, compressed timeline.*
