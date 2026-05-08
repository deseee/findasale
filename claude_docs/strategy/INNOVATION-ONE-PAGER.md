# Directory Crawler Innovation — One-Pager
**For rapid decisions and investor conversations**

---

## The Problem (ADR-073 Gap)

ADR-073 scraper gets you **cold-start inventory** (50K sales day 1), but misses three layers:
1. **Signals:** No closure detection, no relevance scoring → shoppers find dead businesses
2. **Discovery:** Only 40% of market (EstateSales.NET only; misses companies on registries, Facebook, Nextdoor)
3. **Monetization:** Directory only drives subscription signups; zero data product revenue

**Result:** Commodity product. EstateSales.NET could replicate in 3 months.

---

## The Solution (Phase 2 + 3)

### **Phase 2: Signals + Discovery** (8 weeks, 260h)
| Feature | Effort | Impact |
|---|---|---|
| Review velocity scraper | 12h | Closure detection 85–90% accurate |
| Relevance scoring | 8h | Crawl costs -60%; PREMIUM orgs crawled 3x/wk |
| ESN company directory | 16h | +2,000 organizers discovered |
| State auctioneer registries | 40h | +500–1K licensed organizers (zero legal risk) |
| Closure reports + email A/B testing | 20h | Claim conversion 3–5% → 10–15% |

**Outcomes:** 50K–80K sales, 1,500+ organizers, 10–15% claim rate

### **Phase 3: Monetization + Partnerships** (8 weeks, 200h)
| Feature | Effort | Revenue |
|---|---|---|
| Heat maps (where are demand gaps?) | 20h | $5–10K/mo |
| Pricing benchmarks | 15h | $5–10K/mo |
| White-label (NASMM, state assocs) | 40h | $2–5K/mo per partner |
| Lead generation outreach | 20h | $5–15K/mo |

**Outcomes:** $15K–30K/mo new revenue + organizer lock-in (switching costs: $5K+)

---

## Why This Beats Competitors

| Angle | EstateSales.NET | Craigslist | FindA.Sale (Phase 3) |
|---|---|---|---|
| **Shopper loyalty** | 1x (one-off search) | 1x | 3–5x (repeat + saved searches) |
| **Organizer intelligence** | None | None | ✅ (heat maps, benchmarks) |
| **Closure detection** | ❌ | ❌ | ✅ (review velocity) |
| **Data products** | ❌ | ❌ | ✅ ($15K+/mo) |
| **Switching costs** | $0 | $0 | $5K+ (once using intelligence) |

**Why competitors can't copy:**
- EstateSales.NET: Intelligence would cannibalize $300–1K/mo paid placements (won't build)
- Craigslist: Trust is opposite of their brand; curation breaks their model

---

## The Numbers

### **Revenue at 10% Organizer Penetration (Phase 3)**
- 50,000 US resale organizers
- 10% adoption = 5,000 organizers
- 3,500 on SIMPLE ($29/mo): $102K/mo
- 1,000 on PRO ($79/mo): $79K/mo
- 500 on TEAMS ($299/mo): $149K/mo
- 2,500 buy data products ($29/mo): $72K/mo
- **Total: $402K/mo at 10% penetration**

*(Phase 1 alone: $29K/mo from organizer subscriptions only)*

---

## Critical Decisions

### **Decision 1: Legal Posture**
- **Question:** EstateSales.NET will likely sue. Accept?
- **If YES:** Full Phase 2 (including ESN company directory scraping)
- **If NO:** Focus on zero-risk sources (state auctioneer registries, Facebook, Nextdoor) — slower discovery, but legal clean

### **Decision 2: Monetization Timing**
- **Question:** Defer data products to Phase 3, or prototype in Phase 2?
- **If PHASE 2:** Parallel work (260h + 60h = 320h total)
- **If PHASE 3:** Sequential (260h Phase 2, then 200h Phase 3) — longer timeline, lower risk

### **Decision 3: Metro Expansion**
- **Question:** Phase 2 should cover how many metros?
- **If 5 METROS:** Grand Rapids, Detroit, Chicago, Denver, Phoenix (50K–80K sales)
- **If 10+ METROS:** Faster growth, but stretched dev focus + legal risk (more sources = more takedowns)

---

## Effort vs. Payoff

```
Effort (hours)  |  Payoff (revenue lift)
200            |  Phase 1 MVP (ADR-073): +$5K/mo
460            |  Phase 1 + 2 + 3: +$402K/mo (80x)
```

**ROI:** 3–5x per hour of dev effort (vs. typical SaaS: 1–2x)

---

## Decision Framework

**Approve Phase 2 if:**
- ✅ Dev team has 8 weeks available next sprint
- ✅ Comfortable with legal risk from EstateSales.NET (cease-and-desist likely; have kill-switch ready)
- ✅ Can support email outreach (GDPR/CAN-SPAM compliance)
- ✅ Want to defend against competition (vs. let EstateSales.NET copy in 3 months)

**Defer Phase 2 if:**
- ❌ Legal risk too high (don't want to be sued)
- ❌ No dev capacity next 8 weeks
- ❌ Want to pivot business model entirely (Phase 2 assumes organizer acquisition is core)

---

## Success Metrics (30-Day)

**Phase 2 is working if:**
1. Closure detection accuracy 85%+ (test on 20 known-closed businesses)
2. Claim conversion 10%+ (up from 3–5%)
3. Review velocity signal reduces false positives in search by 40%+

**Phase 3 is working if:**
1. Heat map has >30% weekly active organizers
2. $5K+/mo revenue from data products
3. Organizer repeat visit rate 20%+ (vs. competitors: 2–5%)

---

## Files to Share

| Who | What | Why |
|---|---|---|
| Investors | COMPETITIVENESS.md | Shows 3–5x valuation lift (Phase 1 = $5M Series A; Phase 3 = $30M+) |
| Dev Team | QUICK-START.md | Ranked features, effort estimates, decision gates |
| Advisors | Full INNOVATION-ANALYSIS.md | Strategic depth, competitive defensibility |
| Board | This one-pager | 3-min summary + decision framework |

---

## Bottom Line

**Phase 1 (ADR-073):** Solves cold-start. Good.
**Phase 2 + 3 (This proposal):** Builds defensible moat + $400K+/mo revenue. Great.

**Cost to build:** 460 hours ($40K–60K dev cost)
**Cost to not build:** EstateSales.NET copies in 3 months; FindA.Sale stays commodity

---

**Next step:** 30-min decision call to confirm Phase 2 go-ahead, legal posture, metro scope.

Questions? See full INNOVATION-ANALYSIS.md or QUICK-START.md.
