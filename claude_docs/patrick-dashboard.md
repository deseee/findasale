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

## Next Session Priorities

1. Wire 10 feedback survey triggers (OG-1 through SH-5) — infrastructure done, just needs hook calls on specific pages
2. Chrome QA on S398 dashboard + S399 review card + S400–401 camera fixes + S402 pricing panel
3. Social share template fix — hardcoded "estate sale" language on share cards

*Updated S402 — 2026-04-06*
