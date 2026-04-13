# POS & Mobile Checkout Market Research — Secondary Sales
**Research Date:** April 2026
**Focus:** Estate sales, yard sales, flea markets, auctions — organizer and shopper perspectives

---

## Executive Summary

Secondary sale marketplaces lack integrated POS. EstateSales.NET and EstateSales.org do **not** offer in-app checkout, QR scanning, or payment collection. The gap is significant: organizers manually manage payment outside the platform, reducing conversion and creating friction.

**FindA.Sale opportunity:** In-app QR-based checkout could capture abandoned sales and reduce organizer manual work. However, adoption risk is **high** for the core demographic (organizers 50–70 years old, tech-hesitant). Recommendation: build **Simple Mode first** (payment-only), then **Advanced Mode** (QR scanning, open cart) in Phase 2.

---

## 1. Competitor POS Analysis

| Platform | In-App Checkout? | QR Scanning? | Mobile Payments? | Notes |
|---|---|---|---|---|
| **EstateSales.NET** | ❌ No | ❌ No | ❌ No | Directory + listing only. No POS. |
| **EstateSales.org** | ❌ No | ❌ No | ❌ No | Same. Offline payment required. |
| **Garage Sale Tracker** | ❌ No | ❌ No | ❌ No | Discovery only. No sales processing. |
| **General Marketplace** (Mercari, OfferUp, Poshmark) | ✅ Yes | ⚠️ Limited | ✅ Yes | Shipping-centric, not in-person sales. |
| **POS Leaders** (Square, Clover, Shopify) | ✅ Yes | ⚠️ Optional add-on | ✅ Yes | Hardware-dependent or web-based; expensive for small operators. |

**Insight:** Zero competitors in secondary sales space offer POS. Organizers using EstateSales.NET today must accept payments via external Square, PayPal, or cash. This is a **major friction point and an unmet need.**

---

## 2. Adjacent Market POS Best Practices

### Square, Shopify POS, Clover — Comparison

| Feature | Square | Shopify POS | Clover | FindA.Sale Fit |
|---|---|---|---|---|
| **Setup Cost** | $0–49/mo | $39–399/mo + $89/mo | $14–95/mo | ✅ Offer free Simple Mode |
| **Hardware Required?** | Optional (iPad OK) | iPad/Android | Proprietary only | ✅ Browser-based = no hardware |
| **Card Rates** | 2.6% + 15¢ in-person | 2.4–2.6% in-person | Varies | ✅ Recommend 2.7% + 5¢ via Stripe Terminal |
| **QR Checkout** | ❌ No built-in | ✅ Shopify QR codes | ❌ No built-in | ✅ High-value differentiator |
| **Ease of Use** | ⭐⭐⭐⭐ Simple | ⭐⭐⭐ Moderate | ⭐⭐⭐⭐ Simple (hardware coupling) | Target: ⭐⭐⭐⭐ for organizers |

**Key Learning:** Simplicity wins. Square dominates because setup is frictionless. Hardware lock-in (Clover) limits adoption among small, mobile operators.

### QR-Based Shopping Success Factors

- **Sam's Club Scan & Go:** 4x adoption increase. Success: frictionless opt-in, shoppers reduce bag checkout time, staff trust improved.
- **Walmart Scan & Go (failed):** Abandoned. Friction: app glitches, Wi-Fi dependency, shopper uncertainty ("why do I do the work?"), bagging burden.
- **Amazon Go:** Passive entry (no QR, just turnstile tech). High operational overhead; limited to urban, high-traffic stores.

**For FindA.Sale:** Active (QR) is more appropriate than passive (ambient). But UX must be **dead simple**: scan item → done. No extra steps.

---

## 3. Stripe Integration Strategy & Costs

### Product Recommendations

| Stripe Product | Use Case | Fees | Pros | Cons |
|---|---|---|---|---|
| **Payment Links** | Email/SMS checkout link post-sale | 2.9% + 30¢ (CNP) | No code. Fast. | Higher fees. Post-purchase friction. |
| **Payment Intents** | In-app web checkout | 2.9% + 30¢ (CNP) | Full control. Flexible. | Requires integration. |
| **Terminal** | In-person card reader (Tap, Insert, Chip) | 2.7% + 5¢ (CP) | Lowest fees. Hardware-agnostic reader. | Requires hardware ($99–299). |
| **QR Codes (custom + Payment Intents)** | In-app QR + mobile checkout | 2.9% + 30¢ (CNP) if web; 2.7% + 5¢ if hardware Terminal | Differentiator. Mobile-native. | Requires custom build. |

### Fee Comparison: CP vs. CNP

**Card-Present (in-person, Stripe Terminal):** 2.7% + 5¢
**Card-Not-Present (web, Payment Intents/Links):** 2.9% + 30¢

**Cost impact per $100 transaction:**
- CP (Terminal): $2.75
- CNP (web): $3.20
- **Difference: 45 cents per transaction.** For a $2,000 sale: $9 vs. $7.20. Over 50 sales/year per organizer = ~$85 annual cost increase.

### Recommendation

**For Phase 1 (Simple Mode):** Use **Payment Intents** (2.9% + 30¢). No hardware friction. Organizers enter amount in app → shopper clicks payment link in-app or email.

**For Phase 2 (Advanced Mode, if QR launches):** Evaluate **Stripe Terminal** hardware reader. Cost: ~$99 upfront. Saves 20 basis points per transaction. ROI ~12 months for active organizers (>20 sales).

---

## 4. Risk Assessment: Adoption & Complexity by Feature

### Organizer Adoption Likelihood (Age 50–70, 1–3 sales/year)

| Feature | Adoption Risk | Complexity | Value to Organizer | Recommendation |
|---|---|---|---|---|
| **Simple Payment Entry** (amount + take payment) | 🟢 Low | Trivial | High (replaces manual Venmo/Square) | **PHASE 1** |
| **QR Code Scanning** (scan items to cart) | 🟠 Medium | Medium | Medium (faster checkout, fewer errors) | **PHASE 2** (with training) |
| **Open Cart / Scan-as-you-shop** | 🔴 High | High | Medium (optional for organizer, convenience for shoppers) | **PHASE 3** (low priority) |
| **Social Sharing Post-Purchase** | 🟢 Low | Low | Low-Medium (virality benefit, not organizer pain point) | **Nice-to-have, Phase 2** |
| **Receipt Email/SMS** | 🟢 Low | Low | Medium (shopper retention, tax records) | **PHASE 1** |
| **Inventory Sync** (mobile checkout ↔ backend) | 🟠 Medium | Medium | High (prevents overselling) | **PHASE 2** |

### Detailed Risk Breakdown

**Scan-as-you-shop failure modes (drawn from Walmart):**
1. Wi-Fi dependency → app crashes mid-sale → lost cart → frustration.
2. Organizers unfamiliar with tech → support burden → negative reviews.
3. Shoppers (especially older) refuse to use app → dual workflow (manual + app) → chaos.
4. Mis-scans → inventory miscount → trust damage.

**Mitigation:** Start simple. Validate Simple Mode adoption first. Only invest in scanning if organizers demand it and provide support training.

---

## 5. Post-Purchase Social Virality

### Current Benchmarks (Marketplace Apps, 2025–2026)

- **Social commerce conversion:** 67% of TikTok US users (~80M) shop in-app. Total social commerce: $2.9T globally by 2026.
- **User-generated content (UGC) impact:** Brands integrating UGC see **6x higher conversion** than non-UGC.
- **Post-purchase sharing:** Typical CTR on "share your purchase" prompts: **8–12%** (low). Most shoppers ignore.

### Estate Sales Opportunity

**Lower virality ceiling.** Estate sale shoppers buy **items**, not **brands**. Unlike fashion (high social signal), vintage furniture or glassware has lower peer-pressure signal. Sharing "I bought a dresser" ≠ "I bought a luxury watch."

**Recommendation:** Offer optional "share to Facebook/Instagram" button after purchase, but **don't obsess over it**. Net value for organizer: **low**. Better ROI: focus on organizer satisfaction → word-of-mouth → repeat sales.

---

## 6. Stripe Fee Communication Strategy

**Key decision:** Does FindA.Sale absorb fees or pass to organizer?

### Option A: Pass Fees to Organizer
- Organizer sees: "2.9% + 30¢ processing fee"
- **Pros:** Transparent. Organizer controls pricing.
- **Cons:** Friction at payment. May reduce conversion ("I have to pay a fee?").
- **Best for:** Premium organizers (high-value sales, accept all costs).

### Option B: FindA.Sale Absorbs Fees
- Shopper and organizer both see "no additional fees."
- **Pros:** Frictionless. Encourages adoption. Competitive moat vs. Square.
- **Cons:** Reduces FindA.Sale margin on each transaction.
- **Best for:** Early adoption phase. Premium-tier monetization (embed in PRO/TEAMS pricing).

### Hybrid (Recommended)
- **SIMPLE tier:** FindA.Sale absorbs 1.9% processing, organizer pays remainder (1.0% + 30¢). Net to organizer: clean.
- **PRO/TEAMS tier:** FindA.Sale absorbs all processing fees. Differentiate premium tiers.

---

## 7. Phased Implementation Roadmap

### **Phase 1: Simple Mode (MVP) — Weeks 1–4**
- **Organizer workflow:** Open sale → "Accept Payment" button → enter amount → shopper clicks payment link → Stripe Payment Intents (web checkout) → receipt.
- **Shopper experience:** Minimal friction. Email receipt. No app required for payment (link-based).
- **Infrastructure:** Stripe Payment Intents API. Modal or redirect to payment form.
- **Success metric:** >30% of SIMPLE-tier organizers use in-app checkout (vs. manual Square).
- **Risk:** Low. Minimal new UX. Reuses existing Stripe integration pattern.

### **Phase 2: Advanced Mode (QR + Inventory) — Weeks 5–12**
- **Organizer option:** Enable QR scanning in sale setup.
- **Shopper workflow:** Scan item QR → auto-add to cart → review → pay (Payment Intents).
- **Inventory sync:** Each QR scan decrements backend `itemsSold` count.
- **Training:** In-app tutorial. Optional Zoom support session for organizers.
- **Success metric:** >10% of organizers enable QR scanning (lower bar, optional feature).
- **Risk:** Medium. Tech-hesitant organizers may ignore. Require robust QR printing & setup guide.

### **Phase 3: Terminal & Advanced Metrics (Q3 2026+)**
- **Organizer option:** Purchase Stripe Terminal reader (~$99) for in-person card taps.
- **Benefit:** Lower fees (2.7% + 5¢ vs. 2.9% + 30¢). Offline-resilient if device is cached.
- **Target:** High-volume organizers (20+ sales/year, >$10k revenue). ROI clear.
- **Risk:** Low post-Phase 2. Only advanced users opt-in.

---

## 8. Simple Mode vs. Advanced Mode Recommendation

### Simple Mode (Phase 1) — Recommended Start
**For:** Organizers who want payment collection without friction. Ideal for:
- First-time users learning FindA.Sale.
- Small sales (1–5 items).
- Lower-tech-comfort organizers.

**Features:**
- Manual amount entry.
- One-click payment link (Stripe Payment Intents).
- Email receipt.
- Optional social share button (low priority).

**Adoption forecast:** High (50–60% of organizers, especially SIMPLE tier).

### Advanced Mode (Phase 2) — Optional Upsell
**For:** Experienced organizers running high-volume sales. Ideal for:
- Frequent runners (2+ sales/month).
- Multi-item sales (50+ items).
- Organizers who value speed and accuracy.

**Features:**
- QR scanning per item.
- Live cart view (shopper + organizer sync).
- Inventory decrement.
- Terminal reader option (Phase 3).

**Adoption forecast:** Medium (10–15% of organizers, PRO/TEAMS tiers).

**Key insight:** Don't force Advanced Mode on everyone. Organizers 50–70 years old running 1–2 estate sales/year have **zero motivation** to learn QR scanning. Simple Mode (manual entry) is fast enough and familiar.

---

## 9. Competitive Differentiation Opportunities

### vs. Square / Clover / Shopify
1. **Purpose-built for secondary sales.** Square is generic retail. FindA.Sale is estate-sales-specific → simpler onboarding.
2. **No hardware required.** Web-based simple mode = instant adoption. No "$99 Terminal" friction.
3. **Integrated inventory.** Organizer lists items in FindA.Sale → checkout auto-syncs stock → no external POS.
4. **Organizer support embedded.** In-app help, tutorials, Zoom support for setup (if PRO/TEAMS).

### vs. EstateSales.NET / EstateSales.org
1. **Monetization via organizer fees.** They have no POS revenue stream → no incentive to build checkout.
2. **Shopper satisfaction.** Frictionless in-app payment = higher conversion → organizers make more → happier with FindA.Sale.

---

## 10. Key Takeaways

1. **No existing POS in secondary sales market.** Huge gap. Opportunity to differentiate.
2. **Adoption is low in older demographics.** Plan for Simple Mode first; Advanced Mode is phase 2 or 3.
3. **Scan-as-you-shop failed at Walmart.** Complexity, Wi-Fi, friction. Keep it optional and well-supported.
4. **Stripe fees: Card-present is 15 bp cheaper.** Terminal worthwhile for high-volume organizers; not MVP.
5. **Social sharing is nice-to-have, not core.** Organizer friction reduction (Simple Mode) is the real value driver.
6. **Recommend hybrid fee model:** FindA.Sale absorbs some processing in PRO/TEAMS tiers to differentiate.
7. **Phase in ruthlessly.** Simple Mode (manual entry) first. Validate adoption before investing in QR, Terminal, or advanced features.

---

## References

- [QR Code Adoption Statistics 2026](https://www.qrcodechimp.com/qr-code-statistics/)
- [Mobile POS QR Scanning Trends 2025–2026](https://www.qrcode-tiger.com/qr-code-scanning-trends-in-retail-and-ecommerce)
- [Walmart Scan & Go Failure Case Study](https://progressivegrocer.com/walmarts-scan-go-has-failed-its-time-empower-associates)
- [Square vs. Clover vs. Shopify POS Comparison 2025](https://www.selecthub.com/pos-software/clover-vs-shopify-pos/)
- [Stripe Processing Fees 2026](https://stripe.com/pricing)
- [Card-Present vs. Card-Not-Present Fees](https://merchantcostconsulting.com/lower-credit-card-processing-fees/card-present-vs-card-not-present-transactions/)
- [Senior Citizens Mobile Payment Adoption Barriers](https://pmc.ncbi.nlm.nih.gov/articles/PMC9859444/)
- [Social Commerce Benchmarks 2025–2026](https://www.influencers-time.com/social-commerce-2026-from-discovery-to-in-app-purchasing/)
