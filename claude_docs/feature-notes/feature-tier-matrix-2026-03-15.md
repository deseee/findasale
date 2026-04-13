# Feature Tier Matrix — FindA.Sale Organizer & Shopper Tiers

**Status:** Complete tier classification covering all shipped, queued, and future features across SIMPLE / PRO / ENTERPRISE organizer tiers and FREE / PREMIUM_SHOPPER shopper tiers.

**Last Updated:** 2026-03-15 (Session 176)

**Authority:** ADR-065 (Organizer Mode Tiers approved). This document operationalizes ADR-065 by mapping every feature from the roadmap to its tier home.

---

## Executive Summary

**Organizer Tiers (ADR-065):**
- **SIMPLE (free):** Core estate sale workflow. Create sales → upload items → set prices → publish. Holds, basic reminders, email/SMS. Ten buttons, zero clutter.
- **PRO (paid monthly, $9.99–$19.99):** Power features. Batch operations, analytics, tags, branding, exports, social templates. Multi-sale management. Performance benchmarking.
- **ENTERPRISE (high-price annual):** Teams, API access, webhooks, white-label, priority support. 2.5% platform fee discount (vs 10% flat base).

**Shopper Tier (new):**
- **FREE:** Core discovery. Calendar, search, map, item details, holds, wishlist (basic). Email newsletters opt-in.
- **PREMIUM_SHOPPER (optional experimental):** Status TBD. Candidates: Early-access badges, priority hold durations, shopper analytics, saved routes, advanced filters. Defer unless strong beta signal.

**Platform Fee Model (separate from tier):**
- 10% flat fee on all transactions (organizer tier does NOT affect this).

---

## 1. Organizer Tier Matrix

### Format
| Feature | Status | SIMPLE | PRO | ENTERPRISE | Rationale |
|---------|--------|--------|-----|-----------|-----------|
| Name | [SHIPPED/QUEUED/FUTURE] | ✓/✗ | ✓/✗ | ✓/✗ | One-line business case |

---

### PHASE 3 — Core Features (Shipped, Sessions 135–174)

| Feature | Status | SIMPLE | PRO | ENTERPRISE | Rationale |
|---------|--------|--------|-----|-----------|-----------|
| **Sale Creation & Publishing** | [SHIPPED] | ✓ | ✓ | ✓ | Core organizer workflow. All tiers. |
| **Item Management** (add/edit/delete) | [SHIPPED] | ✓ | ✓ | ✓ | Core CRUD. All tiers. |
| **Rapidfire Camera Mode** | [SHIPPED] | ✓ | ✓ | ✓ | Friction reduction. Free tier drives adoption. |
| **AI Tag Suggestions** | [SHIPPED] | ✓ | ✓ | ✓ | AI powered by Haiku (cost-effective). All tiers justify inclusion. |
| **Health Score & Publishing Gate** | [SHIPPED] | ✓ | ✓ | ✓ | Quality assurance. All tiers. |
| **Condition Grading (S/A/B/C/D)** | [SHIPPED] | ✓ | ✓ | ✓ | AI-suggested grades + manual override. All tiers (cross-platform trust). |
| **Holds + Hold Duration Config** | [SHIPPED] | ✓ | ✓ | ✓ | Inventory protection. Core to 2-tier (SIMPLE/paid) model. All tiers. |
| **Stripe Terminal POS** (v2: multi-item, cash) | [SHIPPED] | ✓ | ✓ | ✓ | Revenue driver. 10% fee parity with online. All tiers. |
| **Basic Email Reminders** | [SHIPPED] | ✓ | ✓ | ✓ | Shopper engagement. All tiers. |
| **Simple Sale Calendar** (shopper view) | [SHIPPED] | ✓ | ✓ | ✓ | Discovery. All tiers. |
| **Share Card Factory** (OG tags, Cloudinary) | [SHIPPED] | ✓ | ✓ | ✓ | Social proof. All tiers. |
| **Hype Meter** (real-time activity count) | [SHIPPED] | ✓ | ✓ | ✓ | Social proof. Lightweight, all tiers. |
| **Entrance Pin Location** | [SHIPPED] | ✓ | ✓ | ✓ | Shopper experience. All tiers. |
| **Weekly Treasure Digest** (shopper email) | [SHIPPED] | ✓ | ✓ | ✓ | Retention. All tiers. |
| **Neighborhood Heatmap** | [SHIPPED] | ✓ | ✓ | ✓ | Discovery layer. All tiers. |
| **Serendipity Search** (Surprise Me) | [SHIPPED] | ✓ | ✓ | ✓ | Engagement. All tiers. |
| **Search by Item Type** (category pages) | [SHIPPED] | ✓ | ✓ | ✓ | Discovery. All tiers. |
| **Near-Miss Nudges** (gamification) | [SHIPPED] | ✓ | ✓ | ✓ | Retention. Lightweight psychology. All tiers. |
| **Organizer Referral** (fee bypass) | [SHIPPED] | Limited | ✓ | ✓ | Acquisition incentive. SIMPLE: one-time use. PRO+: recurring use. |

---

### PHASE 3 — Advanced/Analytics (Shipped, Sessions 160–174)

| Feature | Status | SIMPLE | PRO | ENTERPRISE | Rationale |
|---------|--------|--------|-----|-----------|-----------|
| **Batch Operations Toolkit** | [SHIPPED] | ✗ | ✓ | ✓ | Organizer efficiency. Requires 5+ items to justify. PRO+ tier. |
| **Holds-Only Item View** (batch ops) | [SHIPPED] | ✗ | ✓ | ✓ | High-volume hold management. PRO+. |
| **Seller Performance Dashboard** (per-sale analytics) | [SHIPPED] | ✗ | ✓ | ✓ | Data-driven pricing. Benchmarking. PRO+ feature. |
| **Organizer Insights** (lifetime cross-sale) | [SHIPPED] | ✗ | ✓ | ✓ | Career visibility. Motivates power organizers. PRO+. |
| **Payout Transparency** (item-level fee breakdown) | [SHIPPED] | ✗ | ✓ | ✓ | Trust + tax documentation. PRO+ feature. |
| **Open Data Export** (items/sales/purchases CSV ZIP) | [SHIPPED] | ✗ | ✓ | ✓ | Data portability + compliance. CCPA/GDPR. PRO+ feature. |
| **Brand Kit** (colors, logo, socials) | [SHIPPED] | ✗ | ✓ | ✓ | Professional identity. Auto-propagates to templates + exports. PRO upsell. |
| **Listing Factory** (Sprints 1–3 complete) | [SHIPPED] | Limited | ✓ | ✓ | **See subsections below.** |

---

### Listing Factory (Breakdown)

| Sub-Feature | Status | SIMPLE | PRO | ENTERPRISE | Rationale |
|-------------|--------|--------|-----|-----------|-----------|
| **AI Tag Suggestions** (part of Listing Factory Sprint 1) | [SHIPPED] | ✓ | ✓ | ✓ | Base catalog quality. All tiers. |
| **Curated Tag Picker** | [SHIPPED] | Limited | ✓ | ✓ | SIMPLE: 0 free tags. PRO+: 50 curated tags + 1 custom/item. |
| **Cloudinary Watermark** (exports) | [SHIPPED] | ✗ | ✓ | ✓ | Branding on exports. PRO+ feature. |
| **CSV/JSON/Text Exports** (listings) | [SHIPPED] | ✗ | ✓ | ✓ | Multi-format output. PRO+ feature. |
| **Social Templates** (3 tones × 2 platforms) | [SHIPPED] | ✗ | ✓ | ✓ | Pre-written Instagram/Facebook copy. PRO+ feature. |
| **/tags/[slug] ISR Pages** | [SHIPPED] | ✓ | ✓ | ✓ | SEO for shoppers. All tiers benefit. |
| **Popular Tags Endpoint** | [SHIPPED] | ✓ | ✓ | ✓ | Discovery data. All tiers. |

---

### PHASE 4 — Queued Features (Board v26, Tier 2)

| Feature | Status | SIMPLE | PRO | ENTERPRISE | Rationale |
|---------|--------|--------|-----|-----------|-----------|
| **Listing Type Schema Debt** (#5) | [QUEUED] | — | — | — | Backend cleanup (ESTATE/CHARITY/BUSINESS/CORPORATE enums). No tier gating. Internal refactor. |
| **Flip Report** (#41) | [QUEUED] | ✗ | ✓ | ✓ | Post-sale PDF/dashboard with "what sold, what didn't, what to reprice." Analytics upsell. PRO+. |
| **Photo Op Stations** (#39) | [QUEUED] | ✗ | ✓ | ✓ | Selfie spot markers. UGC driver. PRO+ engagement feature. |
| **Sale Hubs** (#40) | [QUEUED] | ✗ | ✓ | ✓ | Group nearby sales. Multi-sale coordination. PRO+ feature. |
| **Voice-to-Tag** (#42) | [QUEUED] | ✗ | ✓ | ✓ | Web Speech API transcription during Rapidfire. PRO efficiency feature. |
| **OG Image Generator** (#43) | [QUEUED] | Limited | ✓ | ✓ | Cloudinary dynamic OG images. SIMPLE: basic static cards. PRO+: dynamic per-sale branded cards. |
| **Neighborhood Sale Day** (#44) | [QUEUED] | ✗ | ✓ | ✓ | Coordinate shared dates in neighborhood. Community marketing. PRO+ feature. |
| **Collector Passport** (#45) | [QUEUED] | ✗ | ✓ | ✓ | Gamified collection tracking. Shopper retention—drives organizer adoption. PRO+ feature. |
| **Treasure Typology Classifier** (#46) | [QUEUED] | ✗ | ✓ | ✓ | ML classification into collector categories (Art Deco, MCM, etc.). Requires training data. PRO+ data-heavy feature. |
| **Social Proof Notifications** (#67) | [QUEUED] | ✗ | ✓ | ✓ | Real-time "47 people viewed this." Extends Hype Meter. PRO+ feature. |
| **Command Center Dashboard** (#68) | [QUEUED] | ✗ | ✓ | ✓ | Multi-sale overview for power organizers. PRO+ feature. |
| **Organizer Reputation Score** (#71) | [QUEUED] | Limited | ✓ | ✓ | Public 1–5 stars. SIMPLE: display only. PRO+: dashboard controls. Trust infrastructure. |

---

### PHASE 4 — Team / API / Infrastructure (Enterprise Exclusive)

| Feature | Status | SIMPLE | PRO | ENTERPRISE | Rationale |
|---------|--------|--------|-----|-----------|-----------|
| **Team Management** | [FUTURE] | ✗ | ✗ | ✓ | Multi-user organizer accounts. Role-based access. ENTERPRISE only. |
| **API Access** (OAuth2, rate-limited) | [FUTURE] | ✗ | ✗ | ✓ | Public API for 3rd-party integrations. ENTERPRISE only. |
| **Webhooks** | [FUTURE] | ✗ | ✗ | ✓ | Real-time event payloads (item sold, hold created, etc.). ENTERPRISE only. |
| **White-Label** (custom domain, branding) | [FUTURE] | ✗ | ✗ | ✓ | Full platform rebranding. Reseller/platform-as-a-service model. ENTERPRISE only. |
| **Priority Support** | [FUTURE] | ✗ | ✗ | ✓ | Dedicated support channel + 1h SLA. ENTERPRISE only. |

---

### PHASE 4 — Data & Intelligence (PRO+)

| Feature | Status | SIMPLE | PRO | ENTERPRISE | Rationale |
|---------|--------|--------|-----|-----------|-----------|
| **AI Item Valuation & Comparables** (#30) | [FUTURE] | ✗ | ✓ | ✓ | Price range suggestions from sold-item data + visual embeddings. PRO+ data feature. Requires 100+ sold items per category. |
| **Proactive Degradation Mode** (#20) | [FUTURE] | Limited | ✓ | ✓ | Latency > 2s → auto-drop analytics, reduce image quality. All tiers have fallback; PRO+ gets telemetry control. |
| **Organizer Item Library** (#25) (Consignment Rack) | [FUTURE] | ✗ | ✓ | ✓ | Upload once, reuse across sales. Cross-sale price history + analytics. PRO+ upsell. |
| **User Impact Scoring in Sentry** (#21) | [FUTURE] | — | — | — | Internal observability. No tier gating. Engineering feature. |

---

### PHASE 5 — Deferred & Vision

| Feature | Status | SIMPLE | PRO | ENTERPRISE | Rationale |
|---------|--------|--------|-----|-----------|-----------|
| **Local-First Offline Mode** (#69) | [FUTURE] | ✗ | ✓ | ✓ | IndexedDB catalog + sync. Competitive requirement. PRO+ feature. Deferred until core stable. |
| **Live Sale Feed** (#70) | [FUTURE] | ✗ | ✓ | ✓ | WebSocket real-time "just sold" stream. PRO+ engagement feature. |
| **Passkey / WebAuthn Support** (#19) | [FUTURE] | Limited | ✓ | ✓ | Phishing-resistant auth. SIMPLE: OAuth only. PRO+: passkey option. |
| **Premium Tier Bundle** (#60) | [FUTURE] | ✗ | ✗ | ✓ | Bundles Brand Kit + Flip Report + priority support. ENTERPRISE tier positioning. |

---

## 2. Shopper Tier Matrix

### Format
| Feature | Status | FREE | PREMIUM_SHOPPER | Rationale |
|---------|--------|------|-----------------|-----------|
| Name | [SHIPPED/QUEUED/FUTURE] | ✓/✗ | ✓/✗ | Business case |

---

### Shipped Shopper Features (All FREE)

| Feature | Status | FREE | PREMIUM_SHOPPER | Rationale |
|---------|--------|------|-----------------|-----------|
| **Sale Discovery** (map, search, calendar) | [SHIPPED] | ✓ | ✓ | Core UX. All shoppers. |
| **Item Details** (photos, price, description, hold) | [SHIPPED] | ✓ | ✓ | Core transaction. All shoppers. |
| **Holds** (reserve items, expiry timer) | [SHIPPED] | ✓ | ✓ | Inventory protection. All shoppers. |
| **Wishlist** (basic save items) | [SHIPPED] | ✓ | ✓ | Interest signal. All shoppers. |
| **Weekly Treasure Digest** (email) | [SHIPPED] | ✓ | ✓ | Retention. All shoppers, opt-in. |
| **Share Card** (OG preview, social sharing) | [SHIPPED] | ✓ | ✓ | Network effect. All shoppers. |
| **Hype Meter** (view count) | [SHIPPED] | ✓ | ✓ | FOMO. All shoppers. |
| **Entrance Pin** (location detail) | [SHIPPED] | ✓ | ✓ | Shopper convenience. All shoppers. |
| **Serendipity Search** (Surprise Me) | [SHIPPED] | ✓ | ✓ | Engagement. All shoppers. |
| **Neighborhood Heatmap** | [SHIPPED] | ✓ | ✓ | Discovery. All shoppers. |
| **Search by Item Type** (categories) | [SHIPPED] | ✓ | ✓ | Navigation. All shoppers. |
| **Near-Miss Nudges** (gamification messages) | [SHIPPED] | ✓ | ✓ | Engagement. All shoppers. |

---

### Queued Shopper Features (Candidates for FREE or PREMIUM_SHOPPER)

| Feature | Status | FREE | PREMIUM_SHOPPER | Rationale & Tier Decision |
|---------|--------|------|-----------------|-----------|
| **Shopper Loyalty Passport** (#29) | [QUEUED] | Limited | ✓ | FREE: view stamps only. PREMIUM_SHOPPER: unlock perks, early access. Retention upsell. |
| **Shopper Wishlist Alerts + Smart Follow** (#32) | [QUEUED] | Limited | ✓ | FREE: basic wishlist. PREMIUM_SHOPPER: category/tag alerts + smart follow. Intent signal drives reengagement. |
| **Collector Passport** (#45) | [QUEUED] | Limited | ✓ | FREE: read-only identity cards. PREMIUM_SHOPPER: custom collections, alerts, rankings. Niche retention. |
| **Treasure Trail Route Builder** (#48) | [QUEUED] | Limited | ✓ | FREE: single-sale map. PREMIUM_SHOPPER: multi-sale routes, time estimates, "don't miss" highlights. Planning tool upsell. |
| **UGC Photo Tags** (#47) | [QUEUED] | ✓ | ✓ | All shoppers can share finds. PREMIUM_SHOPPER: higher upload limits, featured gallery placement, badges. Content network effect. |
| **Digital Receipt + Returns** (#62) | [QUEUED] | ✓ | ✓ | All receipt functionality. PREMIUM_SHOPPER: extended return windows, buyback eligibility. Risk/trust management. |
| **Dark Mode + Accessibility** (#63) | [QUEUED] | ✓ | ✓ | All modes. Accessibility is universal design principle. No tier gate. |
| **Social Proof Notifications** (#67) | [QUEUED] | Limited | ✓ | FREE: aggregate stats ("47 people viewed this"). PREMIUM_SHOPPER: friend activity, personalized notifications. |
| **Loot Log** (#50) | [QUEUED] | Limited | ✓ | FREE: view your purchases. PREMIUM_SHOPPER: gallery, sharing, collection stats. Identity investment. |

---

### PREMIUM_SHOPPER Tier Summary

**Tier Name:** PREMIUM_SHOPPER (experimental, defer unless strong beta signal)

**Proposed Price:** $2.99–$4.99/month or $19.99/year

**Core Value Prop:**
- Early-access badges on hot sales
- Smart alerts on wishlist items + collector categories
- Extended hold durations (72h vs 48h default)
- Bonus "daily deal" notifications
- "Favorite Organizer" badges for follow-ups
- Haul gallery + sharing with monetization path (Amazon affiliate for decor items, etc.)

**Decision Point:**
Launch PREMIUM_SHOPPER tier only if (A) beta generates 1,000+ active shoppers within first 4 weeks, AND (B) engagement metrics (wishlist saves, hold-to-purchase conversion, repeat visits) exceed 30% baseline. Otherwise, keep all shopper features free to maximize organic growth and network effects.

**Rationale:**
- Organizer tier is primary revenue stream (PRO/ENTERPRISE subscriptions).
- Shopper "whales" are rare (most shoppers visit 3–5 sales/year).
- Shopper premium features have low unit economics (alerts, badges are free to serve).
- Secondary revenue path should be *engagement-based* (ads, affiliate, data licensing) not *subscription*.
- Defer PREMIUM_SHOPPER until organizer tier is proven (S177+).

---

## 3. A-La-Carte Candidates

**Rationale:** Some features don't fit monthly subscription but could work as one-time purchases, per-sale charges, or usage-based pricing.

| Feature | Pricing Model | PRO/ENTERPRISE Override | Notes |
|---------|---------------|------------------------|-------|
| **Fast Pass for Sales** (priority entry) | Per-sale: $5–$15 / shopper | Shopper buys; organizer receives revenue share | Enables premium entry experiences. Not tier-gated. Pairs with gamification (badges, early-bird bonuses). |
| **Featured Listing Boost** (homepage placement) | Per-sale: $25–$50 / organizer | SIMPLE: not available. PRO+: pay-per-boost. | Zero value pre-scale (needs 500+ daily shoppers). Defer to post-beta. |
| **Auto-Markdown / Smart Clearance** (discount engine) | Per-sale: tiered usage | SIMPLE: not available. PRO+: $0.50–$1 per automated discount. | Usage-based incentivizes adoption. Organizer benefit. |
| **Instant Appraisal Token** | Per-use: $0.99 / shopper | Not tier-gated; standalone micro-purchase. | Requires 1,000+ sold items per category + ML confidence. Deferred. |
| **Priority Checkout Pass** (2.99/pass) | Per-use: $2.99 / shopper | Shopper buys at high-traffic sales for queue bypass. | Requires POS integration + organizer opt-in. Low priority. |
| **Appraisal API Access** (B2B) | Per-query: $0.50–$2.00 | ENTERPRISE: 10,000 free queries/month. PRO: pay-per-query. SIMPLE: not available. | Revenue path if crowdsourced appraisals reach critical mass. Vision feature. |
| **State of Estate Sales Report** (B2B) | Annual: $199 / buyer | Not consumer-facing. B2B intelligence product. | Requires 6+ months transaction data. Deferred. |
| **Merchandise Store** (Printful integration) | Per-item: % margin | All tiers sell (revenue share model). | Drop-shipped "I ❤️ Estate Sales" merch. Low priority but fun. |
| **Restoration Portfolio Boost** | Per-portfolio: $29.99 / creator | SIMPLE creators: not available. PRO+: optional portfolio premium placement. | Creator economy path. Pairs with UGC Photo Tags (#47). Deferred. |
| **Collector Identity Badge** | One-time or annual: $4.99 | Not tier-gated; shopper add-on. | "I collect MCM furniture" verified badge. Status signal. Optional. |

---

## 4. Tier Gate Architecture Notes

### What Requires Feature-Flag Gates

**Backend Gates (Prisma `$transaction` or controller-level checks):**
1. **Batch Operations** (`batchUpdateHolds`, `POST /api/items/bulk`) — Check `organizer.tier === 'PRO' || 'ENTERPRISE'` in controller. Return 403 Forbidden if SIMPLE.
2. **Analytics Endpoints** (`GET /api/organizers/performance`, `/insights`) — Auth + tier check. SIMPLE users get 403.
3. **Team API** (`POST /api/teams`, `POST /api/api-keys`) — ENTERPRISE only. 403 if not ENTERPRISE.
4. **Webhooks** (`POST /api/webhooks`) — ENTERPRISE only.
5. **API Access** (`GET /api/profile` with API key) — ENTERPRISE only.
6. **Social Templates** (`GET /api/social/:itemId/template`) — PRO+ only. 403 if SIMPLE.
7. **Listing Type Restrictions** (optional: CORPORATE listing only for PRO+) — Tier check in `saleController.ts` when creating sale.
8. **Hold Duration Config** (optional: flexible config vs. hardcoded 48h) — SIMPLE: hardcoded 48h. PRO+: configurable per-sale.

**Implementation Pattern:**
```typescript
const checkTierAccess = (tier: 'SIMPLE' | 'PRO' | 'ENTERPRISE', requiredTier: string) => {
  const tierHierarchy = { SIMPLE: 0, PRO: 1, ENTERPRISE: 2 };
  if (tierHierarchy[tier] < tierHierarchy[requiredTier]) {
    throw new Error(`Tier "${tier}" not eligible for this feature. Upgrade to ${requiredTier}.`);
  }
};
```

---

### What Can Be UI-Only Gates

**Frontend-Only (no backend check — UX graceful degradation):**
1. **Brand Kit fields** — SIMPLE sees read-only profile; PRO+ sees edit forms.
2. **Analytics tab in dashboard** — SIMPLE: hidden. PRO+: visible with "Upgrade to PRO" CTA.
3. **Batch operation buttons** — SIMPLE: disabled with tooltip "Pro feature." PRO+: enabled.
4. **Export button** — SIMPLE: hidden. PRO+: visible.
5. **Social template copybox** — SIMPLE: not shown. PRO+: shown.
6. **Tag picker** — SIMPLE: view-only; shows "Pro feature" badge. PRO+: full picker with 50 tags + custom input.

**Rationale:** UI-only gates reduce backend complexity for non-financial features. If a SIMPLE user tries to POST to `/api/items/bulk` directly (bypassing UI), backend tier check catches it and returns 403.

---

### Gotchas When Gating Already-Shipped Features

**Problem:** Many features shipped before tier gating was designed (Listing Factory, Performance Dashboard, etc.).

**Solution:**
1. **Retrospective gating:** For shipped features, decide tier *at gate-architecture time*, then gate going forward.
   - Listing Factory: AI tags (all tiers); curated tag picker (PRO+); exports (PRO+); social templates (PRO+).
   - Performance Dashboard: Backend endpoint unchanged; frontend UI hidden for SIMPLE. Organizers with existing data keep access; new SIMPLE users can't create.

2. **Grandfathering:** Organizers who created sales before tier launch keep access to all current features. New sales inherit tier limits.

3. **Data integrity:** Don't corrupt existing data. If a PRO organizer downgrades to SIMPLE, their batch operations still exist; they just can't create new ones.

---

### Feature Flag Infrastructure

**Recommended approach (minimal implementation for S176+):**

1. **Store tier on Organizer model** (already exists in schema: `tier ENUM('SIMPLE', 'PRO', 'ENTERPRISE') @default('SIMPLE')`).
2. **Gating utility in shared/src/utils/tierGate.ts:**
   ```typescript
   export const canAccessFeature = (tier: string, feature: string): boolean => {
     const featureMap = {
       'batch-operations': ['PRO', 'ENTERPRISE'],
       'analytics': ['PRO', 'ENTERPRISE'],
       'api-access': ['ENTERPRISE'],
       'webhooks': ['ENTERPRISE'],
       'team-management': ['ENTERPRISE'],
       'brand-kit': ['PRO', 'ENTERPRISE'],
       'social-templates': ['PRO', 'ENTERPRISE'],
       'exports': ['PRO', 'ENTERPRISE'],
     };
     return featureMap[feature]?.includes(tier) ?? true; // default to allow if not listed
   };
   ```
3. **Controller middleware:**
   ```typescript
   router.post('/api/items/bulk', authenticate, (req, res, next) => {
     if (!canAccessFeature(req.user.organizer.tier, 'batch-operations')) {
       return res.status(403).json({ error: 'Feature requires PRO tier.' });
     }
     next();
   });
   ```
4. **Frontend gating (conditional render):**
   ```typescript
   {canAccessFeature(user.organizer.tier, 'batch-operations') && (
     <BulkActionDropdown />
   )}
   ```

---

## 5. Recommendations & Gaps

### What's Working Well

1. **Clear tier separation:** SIMPLE (core) vs. PRO (power) vs. ENTERPRISE (platform) is intuitive and defensible.
2. **PRO tier value is high:** Batch ops + analytics + branding + exports justify $9.99–$19.99/mo for organizers running 3+ sales.
3. **ENTERPRISE tier justifies premium price:** Teams + API + webhooks + white-label is B2B-grade, supports $199–$499/mo pricing.
4. **Base platform fee (10% flat) is separate:** All features inherit same transaction fee, simplifying economics.

---

### Critical Gaps to Address

#### Gap 1: No Upsell Funnel for SIMPLE → PRO
**Problem:** SIMPLE users aren't shown why they need PRO until they hit a wall.
**Recommendation:**
- **After 3rd item listed:** Show in-app modal — "Unlock batch pricing updates. Upgrade to PRO." Link to `/pricing`.
- **After 5th sale:** "See how your sales compare. PRO analytics included." Link to `/pricing`.
- **If organizer bulk-deletes items:** "Bulk operations unlocked in PRO tier." CTA.
- **If organizer requests CSV export:** Show feature, offer 7-day free trial of PRO.

#### Gap 2: PREMIUM_SHOPPER Tier Is Unclear
**Problem:** Shopper tier economics are weak (low LTV, high churn risk). Do we launch it?
**Recommendation:**
- **Defer to S177+** until organizer beta data shows: (1) 1,000+ active shoppers, (2) repeat visit rate > 30%, (3) clear demand signal (1,000+ wishlist saves, 500+ collector passport signups mock feature).
- **Phase 1 (S176–S177):** Keep all shopper features free. Maximize organic reach and network effects.
- **Phase 2 (S177+, if justified):** Launch PREMIUM_SHOPPER as "early-access + alerts + badges" tier at $2.99/mo or $19.99/yr.
- **Phase 3 (2027+):** Monetize via **engagement-based revenue** (affiliate, data licensing) rather than subscription.

#### Gap 3: No Clear Tier Upgrade Path
**Problem:** How does a SIMPLE organizer upgrade to PRO? One-click checkout? Confirmation modal?
**Recommendation:**
- **Implement tier upgrade flow** (S176 final task if scope allows):
  1. Click "Upgrade to PRO" CTA (in-app or `/pricing` page).
  2. Stripe Checkout modal opens (use Stripe Billing for recurring charges).
  3. Organizer selects plan (monthly $9.99 or annual $99.99 = 2-month discount).
  4. After payment, `organizer.tier` updates to 'PRO', feature gates unlock.
  5. Confirmation email sent via Resend.
- **Downgrade flow:**
  1. Settings → Subscription → "Manage Plan" → "Downgrade to SIMPLE."
  2. Modal: "You'll lose access to batch operations, analytics, exports. Existing data is preserved."
  3. After downgrade, PRO-only features are hidden (not deleted).

#### Gap 4: Enterprise Tier Pricing Not Defined
**Problem:** ADR-065 says ENTERPRISE includes "2.5% fee discount" but doesn't specify annual price or billing.
**Recommendation:**
- **ENTERPRISE Pricing Model:**
  - **Base:** $199–$499/month (annual, ~$2k–$6k/yr) depending on sale volume.
  - **Billing:** Annual prepay preferred (simpler accounting). Month-to-month available for qualified customers.
  - **Tier-specific benefits:** Teams (up to 5 users), API access, webhooks, white-label domain, priority support, 2.5% fee discount.
  - **Sales-qualified lead model:** ENTERPRISE tier requires conversation with Patrick or Sales Agent (no self-serve). Targets organizers running 5+ concurrent sales or 10+ sales/year.

#### Gap 5: No Feature Rollout Strategy
**Problem:** Shipping features without tier communication confuses organizers.
**Recommendation:**
- **At feature ship time:**
  1. **Docs:** Feature tier is defined in this matrix.
  2. **Email:** If it affects organizers, send tier-specific email:
     - SIMPLE users: "PRO organizers can now [feature]. Upgrade to unlock."
     - PRO users: "You now have access to [feature]. Go to [link] to try it."
  3. **In-app:** Show 1-time badge on the new feature for 7 days.
  4. **Changelog:** Reference tier in release notes (`claude_docs/operations/CHANGELOG.md`).

---

### Missing Features to Unlock Revenue

#### High-Priority Revenue Gaps

1. **Tier Upgrade Flow** (S176 final scope?)
   - Stripe Checkout integration for PRO tier.
   - Downgrade safeguards.
   - One-click billing management.

2. **Premium Organizer Onboarding** (S177?)
   - ENTERPRISE tier sales conversation → Patrick / Sales Agent.
   - Custom team setup, API docs, whitelabel config.

3. **A-La-Carte Monetization** (S177+)
   - Fast Pass for Sales ($5–$15, shopper buys).
   - Featured Listing Boost ($25–$50, organizer buys).
   - Smart Clearance usage ($0.50–$1 per discount).

#### Lower-Priority (Post-Beta)

1. **Affiliate Revenue** (2027+): Link to Amazon Affiliate when shoppers search for item styles (e.g., "Eames chairs"). 2–4% commission.
2. **Appraisal API** (2027+): License valuation data to insurance adjusters, appraisers. $0.50–$2 per lookup.
3. **Data License** (2027+): Anonymized pricing trends to retailers, economists. $199–$999/month.

---

### Feature Promotion Path

**Path from Roadmap to Tier Matrix:**

1. **Architect specifies tier** in feature spec (e.g., "Flip Report is PRO+ feature because...").
2. **Dev implements** with tier checks in controller.
3. **QA verifies** tier gates work (SIMPLE user gets 403, PRO user sees feature).
4. **At ship time:** This matrix is updated with [SHIPPED] status + tier placement.
5. **Marketing notifies:** Tier-specific messaging goes out.

---

### Tier-Specific Messaging Playbook

| Tier | Problem Statement | Solution Offered | Call-to-Action |
|------|-------------------|------------------|-----------------|
| SIMPLE → PRO | "I have 50 items across 3 sales—can't bulk update prices!" | Batch Operations Toolkit | "See PRO features" (link to `/pricing`) |
| SIMPLE → PRO | "I want to know which categories sell best each season." | Performance Dashboard + Flip Report | "Upgrade to PRO" (Stripe Checkout modal) |
| SIMPLE → PRO | "My competitor has a professional-looking Instagram post template." | Social Templates + Brand Kit | "Try templates in PRO" |
| PRO → ENTERPRISE | "We have 5 people managing estate sales. Can they all login?" | Team Management + Role-Based Access | "Contact us for Enterprise" (email Patrick) |
| PRO → ENTERPRISE | "We want to automate our CRM sync with Zapier." | API Access + Webhooks | "Request API documentation" |
| Shopper FREE → PREMIUM (optional, defer) | "I want alerts when mid-century furniture shows up in my area." | Collector Passport + Smart Alerts | "Early access coming soon" (waitlist) |

---

## 6. Implementation Checklist for S176+

### S176 (This Session)
- [x] **Feature Tier Matrix complete** (this document)
- [ ] **Tier upgrade flow spec** (Stripe Checkout integration)
  - Organizer clicks "Upgrade to PRO"
  - Stripe Checkout modal
  - Post-payment: update `organizer.tier`, send email
  - Time: 4–6 hours (frontend + backend)

### S177 (Next Session)
- [ ] **Implement tier upgrade flow** (dispatch to findasale-dev)
- [ ] **Retrospective tier gating** for shipped features:
  - Add `checkTierAccess()` middleware to batch operations endpoints
  - Add `checkTierAccess()` to analytics endpoints
  - Update frontend to hide PRO-only features for SIMPLE users
- [ ] **Email campaign:** "PRO tier now available" to all SIMPLE organizers
- [ ] **Pricing page redesign** (`/pricing`) with tier comparison table, calculators

### S178 (Optional Follow-up)
- [ ] **ENTERPRISE sales qualification** (Patrick's conversation with target accounts)
- [ ] **API documentation** (if ENTERPRISE tier generates demand)
- [ ] **Team management backend** (multi-user login, role-based access)

---

## 7. Risk Mitigation

### Risk 1: SIMPLE Tier Too Limited (Churn Risk)
**Mitigation:**
- Monitor first 2 weeks of beta. If SIMPLE organizers churn before 2nd sale, loosen gates (e.g., allow 1 bulk operation/month on SIMPLE).
- Have PRO free trial (7 days) ready to convert hesitant organizers.

### Risk 2: PRO Pricing Too High or Too Low
**Mitigation:**
- A/B test $9.99 vs. $14.99 vs. $19.99 with first 100 organizers.
- Compare to Shopify ($29) and EtSy ($0.20/listing). FindA.Sale $14.99 is 12× cheaper than Shopify → compelling.
- Adjust based on conversion rate and LTV data.

### Risk 3: ENTERPRISE Tier Overkill (Overengineering)
**Mitigation:**
- Don't build full team API / white-label until Patrick has *concrete interest* from real organizers.
- Phase 1: API docs + webhook stubs (no full implementation).
- Phase 2: Build as demand signals arrive.

### Risk 4: Feature Gate Bypasses (Billing Integrity)
**Mitigation:**
- **Every backend gate must have a corresponding test:**
  - POST `/api/items/bulk` with SIMPLE user → expect 403.
  - GET `/api/organizers/performance` with SIMPLE user → expect 403.
  - POST `/api/webhooks` with PRO user → expect 403.
- **Penetration test:** findasale-hacker agent to verify no gate bypasses (S177+).

---

## 8. Appendix: Tier Comparison Table (Marketing)

| Feature | SIMPLE (Free) | PRO ($14.99/mo) | ENTERPRISE (Custom) |
|---------|---------------|-----------------|--------------------|
| **Create & Publish Sales** | ✓ | ✓ | ✓ |
| **Holds & Reminders** | ✓ | ✓ | ✓ |
| **Stripe Terminal POS** | ✓ | ✓ | ✓ |
| **AI Tag Suggestions** | ✓ | ✓ | ✓ |
| **Condition Grading** | ✓ | ✓ | ✓ |
| **Brand Kit** | ✗ | ✓ | ✓ |
| **Batch Operations** | ✗ | ✓ | ✓ |
| **Performance Analytics** | ✗ | ✓ | ✓ |
| **Flip Report (Post-Sale)** | ✗ | ✓ | ✓ |
| **Social Templates** | ✗ | ✓ | ✓ |
| **Data Export (CSV/ZIP)** | ✗ | ✓ | ✓ |
| **Organizer Item Library** | ✗ | ✓ | ✓ |
| **Team Management** | ✗ | ✗ | ✓ |
| **API Access** | ✗ | ✗ | ✓ |
| **Webhooks** | ✗ | ✗ | ✓ |
| **White-Label Domain** | ✗ | ✗ | ✓ |
| **Priority Support** | ✗ | ✗ | ✓ |
| **Fee Discount** | — | — | 2.5% (vs 10% base) |

---

## Decision Log

**ADR-065 Approved:** Organizer Mode Tiers (SIMPLE/PRO/ENTERPRISE) + separate 10% flat platform fee.

**S176 Decisions:**
1. Shopper PREMIUM_SHOPPER tier deferred to S177+. Keep all shopper features free in beta.
2. ENTERPRISE tier targeted at 5+ concurrent sale organizers. Sales-qualified lead model (no self-serve).
3. PRO free trial (7 days) recommended for conversion.
4. Tier upgrade flow (Stripe Checkout) is priority for S176 final scope.
5. Retrospective gating (tag picker, exports, analytics) to be done in S177.

---

**Status:** Ready for investor agent (pricing analysis) and advisory board (stress test). Patrick will use this matrix for beta communication and tier configuration.

---

## Files Changed This Session

- **NEW:** `claude_docs/feature-notes/feature-tier-matrix-2026-03-15.md` (this document)
- **Updated:** `MESSAGE_BOARD.json` (completion message posted on save)

