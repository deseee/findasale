# Pricing Page Innovation — Executive Summary for Patrick

**Generated:** 2026-04-04 | **Full analysis:** `pricing-page-innovation-analysis.md`

---

## The Problem

Your current pricing page (organizer/pricing) is **feature-complete but strategically broken:**

- Feature names don't match your UI ("AI valuation engine" → should be "Auto Tags")
- Missing the biggest differentiator: photo-to-listing automation (the time-saver organizers care about)
- À la carte ($9.99) says "Everything in SIMPLE" — but why pay for SIMPLE features you already get free?
- Table-based tier comparison confuses non-tech-savvy organizers (40–65 year olds)

**Fix strategy:** Focus on **outcomes** (hours saved) not features (feature soup).

---

## 5 Ideas (Pick Your Top 3)

### 1. "Hours Saved" Metric — DO THIS FIRST ⭐⭐⭐⭐⭐
Add one line above pricing tiers: **"Organizers save 3.2 hours per sale on average."**
- Reframes entire page around outcome (time) not features
- Takes 1 hour to implement
- Expected lift: +10–15% conversion
- **Action:** Give me the hours-saved number (research beta organizers or use 3.2h estimate)

### 2. Feature Naming Audit — DO THIS FIRST ⭐⭐⭐⭐⭐
Find-replace 8 stale names across pricing page:
- "AI valuation engine" → "Auto Tags"
- "Link click stats" → "Ripples: Item Interest Tracker"
- Remove false SLA claims (S268 decision = zero SLA)
- Takes <1 hour
- Removes compliance risk + trust friction
- **Action:** Approve 15-min code review

### 3. Workflow-Stage Comparison — DO NEXT (S393) ⭐⭐⭐⭐
Replace TierComparisonTable with 5 expandable sections:
1. **Getting Started** (photo upload, limits, support)
2. **Speed Up Workflows** (auto-tags, exports, batch)
3. **Run Multiple Sales** (concurrent, teams, workspace)
4. **Analyze & Optimize** (analytics, Flip Report)
5. **Advanced Integrations** (API, webhooks, white-label)

- Makes tiers obvious ("I run 3 sales/mo → I'm in Scale section → PRO is right")
- Takes 4–6 hours
- High conversion impact
- **Action:** Sketch section names with me, then dev builds

### 4. "Why Photos Matter" Narrative ⭐⭐⭐ (Bonus, Low Effort)
Add 1 section explaining the photo-to-listing pipeline:
- Phone photo → Auto Tags → Auto-fill → Publish → Multi-platform sync → Track interest → Run day with QR codes
- Unique to FindA.Sale (competitors don't explain this)
- Takes 1–2 hours
- Novel positioning against Craigslist/EstateSales.NET

### 5. Organizer Profile Selector ⭐⭐⭐ (Nice-to-Have for S393)
"Which describes you?" above tiers (just starting / running 3+ sales/mo / team operation)
- Medium complexity (2–3h)
- Medium impact
- Consider only if engagement metrics suggest it

### 6. ROI Calculator ⭐⭐ (Defer to S394+)
"Enter your item count → see hours saved & cost-per-hour"
- Highest complexity (6–8h)
- Medium impact
- Risk: assumptions may not fit all organizers
- **Better to build after real beta feedback on hours-savings claims**

---

## À La Carte ($9.99) — Clarify the Value Prop

**Decision D-004 locked the price, NOT the feature set.**

**Current problem:** "Everything in SIMPLE + $9.99" — why pay for features you get free?

**Fix:** À la carte = **PRO limits for one sale only**
- 500 items (not 200)
- 10 photos/item (not 5)
- 2,000 auto tags (not 100)
- Batch operations + CSV export + Flip Report
- Single sale, 30-day access window
- Positioning: "Test PRO features on one sale. See if time savings justify $29/mo."

**Expected:** 40%+ convert to PRO within 90 days (proves à la carte works as trial tier).

---

## Ranking: Pick 3 (Do Now)

| Rank | What | Time | Impact | Action |
|------|------|------|--------|--------|
| 1 | Hours metric + naming audit | 2h | High | DO THIS WEEK |
| 2 | Workflow-stage comparison | 4–6h | High | S393 |
| 3 | Why Photos narrative | 1–2h | Medium | S393 if time |

---

## One Novel Idea: "Why Photos Matter"

**What competitors DON'T do:**

EstateSales.NET, Craigslist, Facebook Marketplace all lack one thing: **explanation of the photo-to-listing pipeline.**

FindA.Sale's real advantage: **phone-first workflow** (you take photo, app does the rest).

**Add one section to pricing page:**
```
Why Photos Are Everything

Every sale starts the same way: you take a photo.
FindA.Sale does the rest.

Photo → Auto Tags (reads image, suggests title/condition/value)
→ Auto-Fill (you review 3 sec, publish)
→ Multi-Platform (Craigslist, Facebook, EstateSales.NET, one click)
→ Track Interest (see which items shoppers like — Ripples)
→ Run the Day (QR codes, online holds, shopper queue)

That's 3+ hours saved. Per sale.
```

This is **narrative positioning** — tells a story, not a feature list. No competitor does this.

---

## Next Steps (Pick One)

**Option A — Aggressive (This Week):**
1. Confirm hours-savings number with me (research organizers or use 3.2h)
2. Dev implements #1 + #2 (metrics + naming audit) — 2h batch
3. Chrome QA (15 min)
4. Push

**Option B — Cautious (Next Week):**
1. Read full analysis (pricing-page-innovation-analysis.md)
2. Chat through ideas 3–5 (comparison table, profile selector, narrative)
3. Pick top 2, sketch changes
4. Dev batch implements S393

**Recommendation:** Option A this week (2h, high confidence), then S393 does the bigger refactor (#3 comparison table).

---

## Questions for You

1. **Hours saved per sale:** Use 3.2h estimate, or do you want to research beta organizers first?
2. **À la carte:** Confirm PRO-level limits ($9.99 for 500 items, 10 photos, 2K tags, 30 days)?
3. **Timeline:** Want #1 + #2 done this week (2h batch), or skip to S393 and do #3 (comparison table) instead?
4. **Narrative:** Interested in "Why Photos Matter" section on pricing page?

---

**Full analysis & implementation details:** `claude_docs/strategy/pricing-page-innovation-analysis.md`
