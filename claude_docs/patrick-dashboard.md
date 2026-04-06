# Patrick's Dashboard — April 6, 2026

---

## What Happened This Week

Eleven sessions across April 4–6. Big ones: POS rebuild, add-items mobile overhaul, review card redesigned to plain-English status, feedback system built, camera inline append, eBay integration.

**S402 (today):** Pricing and review page bug batch. Health score now flags unset category and condition selects. Price Research Panel condensed and renamed (Smart Pricing, eBay Market Comps, Sales Comps) with explanatory copy under each section. eBay comps button fixed — was hitting a 404 due to wrong endpoint. eBay CSV export now respects selected items. TEAMS accounts no longer see the PRO upgrade gate on comparable sales. eBay sandbox credentials now wired and working.

---

## Push Block (S402 — run now)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/utils/listingHealthScore.ts
git add packages/backend/src/controllers/ebayController.ts
git add "packages/frontend/pages/organizer/add-items/[saleId]/review.tsx"
git add packages/frontend/components/PriceResearchPanel.tsx
git add packages/frontend/components/ValuationWidget.tsx
git add "packages/frontend/pages/organizer/add-items/[saleId].tsx"
git add packages/frontend/pages/faq.tsx
git add packages/frontend/pages/support.tsx
git add packages/backend/Dockerfile.production
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S402: health score, price research panel, eBay comps + CSV, Railway cache bust"
.\push.ps1
```

---

## Pending Decisions

- **Encyclopedia rename** — "Resale Encyclopedia," "Secondhand Encyclopedia," or keep "Estate Sale Encyclopedia" for SEO? Dev blocked until decided.
- **USPTO trademark** — File for FindA.Sale? ~$250–$400 per class.
- **eBay production credentials** — When ready to go live with real eBay data, get production app credentials from developer.ebay.com and swap Railway env vars + two API URLs back to `api.ebay.com`.

---

## Action Items for Patrick

- [ ] **Run push block above**
- [ ] **Run S399 migration** if not already done — FeedbackSuppression table
- [ ] **Encyclopedia rename decision**
- [ ] **Trademark call**
- [ ] **Set Railway env var:** `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831`
- [ ] **Stripe seat product** — $20/mo team member seat needs a Stripe product created

---

## Next Session (S403) — Gamification Deep Dive

**P1: Full board session on Shopping Companion / loyalty system design.**

The session will run Innovation research → DA+Steelman → full Advisory Board review. No code. Pure strategy.

**What's being researched:** Duolingo, Starbucks Stars, Whatnot, Poshmark Ambassador, Pokémon GO, Reddit karma, Foursquare Mayor (died), Robinhood confetti (cautionary). Every roadmap feature audited for XP/badge/companion-trigger potential.

**The framing Patrick chose:** A "Shopping Companion" — something with agency that helps users, not just rewards them. Pre-sale alerts, during-sale coaching, post-sale haul summaries.

**10 questions that will reshape the proposal:**
- Is this solving churn or acquisition? (Different mechanics)
- What happens when users max rank? (End-game problem — prestige? seasonal resets?)
- Shopper-only or organizer XP too? (Can't mix without structural unfairness)
- Does this cost FindA.Sale money or make money? (Economics must pencil first)
- Does rewarding deal-finding depress organizer revenue? (Revenue tension)
- Are badges visible to organizers? Leaderboards? (Virality vs. anxiety tradeoff)
- What's the notification cadence? (Gamification dies without this answer)
- Any legal/regulatory exposure if rewards have cash value? (Sweepstakes law)
- Platform-wide XP or sale-scoped? (Retention vs. attribution)
- Does "Explorer's Guild" work for non-gamer users? (Brand fit question)

**Known locked decisions:** Rank thresholds 500/2000/5000/12000 XP (S388). PRO=$29, TEAMS=$79.

**P2:** Wire 10 feedback survey triggers (infrastructure done, just needs hook calls)
**P3:** Chrome QA sweep — S402 pricing panel, S399 review card, S400–401 camera, POS walkthrough

*Updated S402 — 2026-04-06*
