# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-05 (v10 — Parallel path model. All Five Pillars + Sprints A–X shipped. 5-track parallel structure adopted.)
**Status:** Production MVP live at finda.sale. 21 phases + post-launch T–X complete. Entering parallel beta-prep phase.

---

## Achievement: All Sprints Complete ✅

21 phases + post-launch Sprints T–X shipped. Five Pillars complete. Full detail: `claude_docs/COMPLETED_PHASES.md`.

---

## Parallel Path Architecture

5 tracks run concurrently. Sync points defined below.

**P — Patrick (Human):** Beta recruitment, API keys, branding decisions, Stripe setup, real-world partnerships.

**CA — Claude: Production Readiness:** Stress testing, bug fixing, ToS implementation, polish. Fully autonomous.

**CB — Claude: AI Tagging Pipeline:** Research → integrate → test. One sync point for API keys/budget.

**CC — Claude: Business Intel & Content:** Investor materials, marketing content, pricing analysis. Fully autonomous.

**CD — Claude: Innovation & Experience:** Blue-sky feature development, branding implementation, UX research, cross-industry feature porting.

---

## Path P — Patrick

### P1: Business Formation — IN PROGRESS
- [x] File Michigan LLC with LARA
- [x] Get EIN from IRS.gov
- [x] Open business bank account
- [ ] Set up support@finda.sale email forwarding
- [ ] Order business cards (~$25)
- [ ] Create Google Business Profile for FindA.Sale

### P2: Legal + Stripe — IN PROGRESS
- [ ] Open Stripe business account (if easier than personal Connect)
- [ ] ⚡ **Sync: Claude implements ToS/Privacy into the app (CA1)**
- [ ] Set up Google Voice for support line
- [ ] Google Search Console verification (if not done)

### P3: Field Research — ✅ COMPLETE
Original project research done. Notes available.

### P4: Beta Recruitment (Week 3–6)
- [ ] Identify 5 target beta organizers
- [ ] ⚡ **Sync: Claude provides demo walkthrough + onboarding guide (CA7)**
- [ ] Schedule 1-on-1 onboarding sessions
- [ ] Hand-hold first 3 sales
- [ ] Collect structured feedback
- [ ] ⚡ **Sync: feedback → Claude for iteration**

### P5: API Keys & Services (As Needed)
- [x] Google Cloud account + Vision API key ✅ 2026-03-05
- [x] Anthropic API key (for Claude Haiku) ✅ 2026-03-05
- [x] UptimeRobot monitoring ✅ 2026-03-05
- [ ] OAuth credentials (Google, Facebook) → Vercel env vars: GOOGLE_CLIENT_ID/SECRET, FACEBOOK_CLIENT_ID/SECRET
- [ ] VAPID keys confirmed in production

### P6: Branding Decisions (Week 2–4)
- [x] Review branding brief (`claude_docs/research/branding-brief-2026-03-05.md`)
- [x] Logo generated via AI (SVG) — `claude_docs/brand/logo-primary.svg` ✅ 2026-03-05 — unblocks business cards + CD1
- [ ] ⚡ **Sync: Claude implements chosen color palette, typography, PWA manifest (CD1)**

---

## Path CA — Claude: Production Readiness

### CA1: ToS & Privacy Policy Implementation (1 session) ← NEXT
Draft + implement `/terms` and `/privacy` pages using competitor-standard language. Add footer links and checkout consent checkbox. ⚡ **Sync: Patrick reviews before going live.**

### CA2: Database & Migration Health (1 session)
Apply 3 pending Neon migrations. Prisma schema validation against production. Document production migration runbook.

### CA3: Payment Flow Stress Test (2 sessions)
Map every Stripe path: onboarding, checkout, refund, failed payment, 3DS, auction win, instant payout. Test 5% vs 7% item-level fee logic. Webhook failure recovery. Edge cases: $0 items, concurrent bids, expired cards.

### CA4: User Flow Audit (2 sessions)
Full shopper journey, organizer journey, creator/affiliate journey. Mobile responsiveness on real viewport sizes. Accessibility pass. Edge cases: 0 items, 1000+ items, deleted sale mid-auction.

### CA5: Performance & Security (1 session)
Health-scout baseline scan. Lighthouse on key pages. Auth middleware audit. Sentry verification. CSP/CORS review.

### CA6: Feature Polish (3 sessions)
Photo upload UX, semantic search with real queries, push notification verification, onboarding walkthrough, empty states and error handling.

### CA7: Human Documentation (2 sessions)
Organizer guide, shopper FAQ, Zapier webhook API docs, in-app help tooltips.

---

## Path CB — Claude: AI Tagging Pipeline

### CB1: Research & Architecture (1 session)
Recommended: Google Vision (labels) + Claude Haiku (descriptions). Cost at beta: $10–50/month. Write technical spec + cost model at 100/1K/10K images/month. ⚡ **Sync: Patrick approves approach + creates API keys (P5).**

### CB2: Backend Integration (2 sessions)
Replace Ollama with cloud API calls. Fallback chain: Vision → Haiku → manual. Rate limiting, cost controls, cache strategy.

### CB3: Frontend Integration (1 session)
Photo upload → AI suggestions flow. Accept/edit/reject per suggestion. Batch mode. "AI suggested" badge.

### CB4: Quality Tuning (ongoing)
Test across item categories. Measure organizer acceptance rate. Prompt engineering for Haiku. Feedback loop for rejected suggestions.

---

## Path CC — Claude: Business Intel & Content

### CC1: Investor Materials (2 sessions)
Executive summary, pitch deck (10–15 slides), financial model, TAM/SAM/SOM, competitive landscape.

### CC2: Marketing Content (ongoing)
"How to Run an Estate Sale" guide, "Estate Sale Shopping Guide", social media templates, email templates, landing page copy, blog drafts.

### CC3: Pricing Model Analysis (1 session)
Competitor fee deep dive, cost-per-sale analysis, break-even by tier, A la carte AI pricing model. ⚡ **Sync: Patrick decides launch pricing.**

### CC4: Automated Intelligence (running)
7 scheduled tasks covering competitor monitoring, industry intel, changelog, UX spots, health, monthly digest, workflow retrospective.

---

## Path CD — Claude: Innovation & Experience

### CD1: Branding Implementation (2 sessions)
Apply branding brief to app: warm amber (#D97706) + sage green + navy, PWA manifest updates, typography audit, updated app icons, brand voice in microcopy. ⚡ **Sync: Patrick chooses direction in P6 first.**

### CD2: Feature Innovation Pipeline (ongoing)

**Phase 1 — Quick Wins:**

| Feature | What It Does |
|---------|-------------|
| Live Scarcity Counter | "3 left" / "5 bought in last hour" on item listings |
| Streak Challenges | Visit/save/buy streaks with Hunt Pass point bonuses |
| Social Proof Live Feed | "X people viewing" / "Y just bought" on sale pages |

**Phase 2 — Engagement Layer:**

| Feature | What It Does |
|---------|-------------|
| Treasure Hunt Mode | Daily discovery challenges with AI-generated clues |
| Live Drop Events | Countdown reveals of premium items, FOMO-driven |
| Personalized Weekly Email | Curated items based on shopper browse/buy history |
| Smart Inventory Upload | Bulk photo → AI tags → listings in one batch |

**Phase 3 — Moat Features:**

| Feature | What It Does |
|---------|-------------|
| AI Discovery Feed | Personalized item feed using ML on browse/buy signals |
| Buyer-to-Sale Matching | ML matches shoppers to sales based on preference history |
| Dynamic Pricing | AI suggests prices based on comps, condition, demand |
| Visual Search | Photo → find similar items across all active sales |
| Virtual Tours (360°) | Walkable preview of sale space before visiting |

**Phase 4 — Market Expansion:**

| Feature | What It Does |
|---------|-------------|
| Reverse Auction | Declining price on slow inventory — shoppers get alerts |
| Group Buying Pools | Co-buy expensive items (antique sets, furniture collections) |
| White-label MaaS | Marketplace-as-a-Service for thrift chains and antique dealers |
| Estate Sale Planning Assistant | AI chatbot guiding executors through the entire process |
| Consignment Integration | Connect thrift store POS systems to FindA.Sale listings |

### CD3: Cross-Industry Research (ongoing)
Weekly feature-innovation-scan monitors: real estate, social commerce, gaming, food delivery, dating apps, fitness apps, auction houses.

### CD4: UX & Workflow Review System (bi-weekly)
Scheduled bi-weekly review of session logs, skill effectiveness, doc freshness, and workflow bottlenecks.

---

## Sync Point Calendar

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

## Long-Term Hold

| Item | Reason | Revisit |
|------|--------|----------|
| Video-to-inventory | Vision models can't segment rooms reliably yet | Late 2026+ |
| Multi-metro expansion | Business decision — Grand Rapids validation first | After beta data |

---

## Infrastructure (All Done)

Backend on Railway (`backend-production-153c9.up.railway.app`), PostgreSQL on Neon, frontend on Vercel (`finda.sale`). Session safeguards, model routing, scheduled tasks, self-healing skills all active. See `claude_docs/CORE.md` and `claude_docs/self_healing_skills.md`.

---

*v10 updated 2026-03-05. Five Pillars + Sprints T–X complete. Parallel 5-path model adopted. Source: `claude_docs/research/parallel-roadmap-v2-2026-03-05.md`.*
