# ADR — Featured Boost System (Dual-Rail: XP or Stripe) — S418 (2026-04-08)

## Decision

Build a single `BoostPurchase` service that handles all time-limited promotional boosts (Sale Bump, Haul Visibility, Bounty Visibility, Event Sponsorship, Wishlist Notification, Seasonal Challenge Access, Guide Publication, Rarity Boost) with two payment rails: **XP** (existing `xpService.spendXp`) or **STRIPE** (new one-time charge via existing Stripe Connect setup, platform-account charge — not Connect, since these go to FindA.Sale not the organizer).

Permanent cosmetics (Username Color, Frame Badge, Custom Map Pin, Profile Showcase Slot, Guild Creation) remain **XP-only**. Reasoning: status symbols lose meaning if buyable.

Lucky Roll / Mystery Box is **XP-only** and out of scope for this ADR (separate gacha mechanic with pity counter — needs its own design).

## Rationale

**Why unified service:** All eight boost types share the same shape — `(userId, boostType, targetId?, durationDays, paymentMethod) → BoostPurchase record + activation`. Building eight separate purchase flows means eight controllers, eight UI patterns, eight ledger reconciliation paths. One service means one audit trail, one refund path, one analytics view.

**Why dual rails:** XP-only locks out new users at the exact moment they're most engaged (just signed up, want to promote their first sale). Cash-only abandons the loyalty loop. Both rails feeding the same scarce-supply inventory (e.g. featured slots) keeps the placement valuable regardless of how it was paid for.

**Why platform-charge Stripe (not Connect):** Boost revenue belongs to FindA.Sale, not the organizer. This is unrelated to the existing Connect Express setup used for sale GMV. Use a standard Stripe `paymentIntent` against the platform account.

## Schema Changes

### New model: `BoostPurchase`

```prisma
model BoostPurchase {
  id              String        @id @default(cuid())
  userId          String
  user            User          @relation(fields: [userId], references: [id])
  boostType       BoostType     // enum below
  targetType      String?       // "SALE" | "HAUL" | "BOUNTY" | "GUIDE" | "WISHLIST" | null
  targetId        String?       // FK string (sale id, haul id, etc.) — nullable for non-targeted boosts
  paymentMethod   PaymentMethod // XP | STRIPE
  xpCost          Int?          // populated if paymentMethod = XP
  stripeAmountCents Int?        // populated if paymentMethod = STRIPE (e.g. 50 = $0.50)
  stripePaymentIntentId String? // populated if paymentMethod = STRIPE
  durationDays    Int           // how long the boost runs
  activatedAt     DateTime      @default(now())
  expiresAt       DateTime      // activatedAt + durationDays
  status          BoostStatus   @default(ACTIVE) // ACTIVE | EXPIRED | REFUNDED | FAILED
  refundedAt      DateTime?
  refundReason    String?
  createdAt       DateTime      @default(now())

  @@index([userId, status])
  @@index([boostType, status, expiresAt]) // for "show all active featured sales"
  @@index([targetType, targetId, status])
  @@index([expiresAt]) // for expiry sweep cron
}

enum BoostType {
  SALE_BUMP
  HAUL_VISIBILITY
  BOUNTY_VISIBILITY
  EVENT_SPONSORSHIP
  WISHLIST_NOTIFICATION
  SEASONAL_CHALLENGE_ACCESS
  GUIDE_PUBLICATION
  RARITY_BOOST
}

enum PaymentMethod {
  XP
  STRIPE
}

enum BoostStatus {
  ACTIVE
  EXPIRED
  REFUNDED
  FAILED
}
```

### `User` relation

Add `boostPurchases BoostPurchase[]` to the User model.

### Deprecation note

The existing `RarityBoost` model and the `boostType`/`boostPct`/`expiresAt` fields on `PointsTransaction` are subsumed by `BoostPurchase`. **Do not delete them in this migration.** Mark for cleanup in a follow-up migration once existing rows are migrated and all read paths point at `BoostPurchase`.

### Pricing table (constants — `boostPricing.ts`)

| Boost | XP cost | Cash cents | Duration |
|---|---|---|---|
| SALE_BUMP | 50 | 50 ($0.50) | 1 hour |
| HAUL_VISIBILITY | 25 | 25 ($0.25) | 7 days |
| BOUNTY_VISIBILITY | 15 | 15 ($0.15) | 7 days |
| EVENT_SPONSORSHIP | 500 | 500 ($5.00) | 7 days |
| EVENT_SPONSORSHIP_14D | 1000 | 1000 ($10.00) | 14 days |
| WISHLIST_NOTIFICATION | 30/mo | 30/mo ($0.30) | 30 days |
| SEASONAL_CHALLENGE_ACCESS | 250 | 250 ($2.50) | season length |
| GUIDE_PUBLICATION | 50 | 50 ($0.50) | permanent |
| RARITY_BOOST | 15 | 15 ($0.15) | sale duration |

Single source of truth — both `xpService.ts` constants and `boostPricing.ts` reference the same values.

## API Contracts

### `POST /api/boosts/quote`
Returns the XP and cash price for a boost type so the UI can show "Pay 25 XP or $0.25".

```ts
// Request
{ boostType: BoostType, durationDays?: number }

// Response
{
  boostType: BoostType,
  xpCost: number,
  stripeAmountCents: number,
  durationDays: number,
  userXpBalance: number,
  canAffordXp: boolean
}
```

### `POST /api/boosts/purchase`
Single endpoint, branches on `paymentMethod`.

```ts
// Request
{
  boostType: BoostType,
  targetType?: "SALE" | "HAUL" | "BOUNTY" | "GUIDE" | "WISHLIST",
  targetId?: string,
  paymentMethod: "XP" | "STRIPE",
  durationDays?: number  // for boosts with multiple duration options (e.g. EVENT_SPONSORSHIP)
}

// Response — XP rail
{
  boostPurchase: BoostPurchase,
  newXpBalance: number,
  status: "ACTIVE"
}

// Response — STRIPE rail
{
  boostPurchase: BoostPurchase,  // status: ACTIVE only after webhook confirms
  clientSecret: string,           // for stripe.js confirmCardPayment
  status: "PENDING"
}
```

### `POST /api/webhooks/stripe` (existing endpoint, new handler branch)
On `payment_intent.succeeded` for a boost-tagged intent: flip BoostPurchase status from PENDING → ACTIVE, set activatedAt = now, expiresAt = now + durationDays.

On `payment_intent.payment_failed`: status → FAILED.

### `GET /api/boosts/active?targetType=SALE`
Returns all currently-active boosts of a type — used by SaleMap, haul feed, bounty list, etc. to show "featured" badges.

### `GET /api/boosts/me`
Returns the current user's active + recent boost purchases (history view).

## Service Layer (`boostService.ts`)

```ts
purchaseBoost(userId, params): Promise<BoostPurchase>
  → branches on paymentMethod
  → XP path: validate balance via xpService.spendXp, create record ACTIVE
  → STRIPE path: create paymentIntent with metadata { boostPurchaseId },
    create record PENDING, return clientSecret
expireBoosts(): Promise<number>
  → cron sweeper: status=ACTIVE AND expiresAt < now → status=EXPIRED
refundBoost(boostPurchaseId, reason): Promise<BoostPurchase>
  → XP path: xpService.awardXp refund
  → STRIPE path: stripe.refunds.create
```

All operations wrapped in Prisma `$transaction` so the ledger and the BoostPurchase row land atomically.

## Cross-Layer Contract Boundaries

- **Database:** owns BoostPurchase model, enums, indexes.
- **Backend:** owns boostService, boostPricing constants, /api/boosts/* routes, Stripe webhook handler branch, expiry cron.
- **Frontend:** owns BoostPurchaseModal (single component, branches on rail), BoostBadge (renders "Featured" / "Trending" / "Hot Bounty"), BoostHistory page. No price logic in frontend — always fetch via /quote.
- **Shared:** export `BoostType`, `PaymentMethod`, `BoostStatus` enums.

## Migration Plan

```
20260408_add_boost_purchase
  - CREATE TABLE BoostPurchase
  - CREATE TYPE BoostType, PaymentMethod, BoostStatus
  - CREATE INDEX (userId, status), (boostType, status, expiresAt), (targetType, targetId, status), (expiresAt)
  - No data migration — existing RarityBoost rows untouched
```

### Rollback: 20260408_add_boost_purchase

Down migration: `DROP TABLE BoostPurchase; DROP TYPE BoostType, PaymentMethod, BoostStatus;`

Playbook: "If deploy fails after migration but before backend ships boostService, no action needed — table is unused. If backend ships and BoostPurchase rows exist but UI is broken, leave table in place and roll back frontend only. Never drop table with rows — refund all ACTIVE STRIPE purchases first via Stripe dashboard, then drop."

## Risks

**R1 — Stripe webhook race condition:** A user could complete a boost payment but the webhook fires before the BoostPurchase row is committed. Mitigation: create the row with status=PENDING *before* creating the paymentIntent, and use the row's id as paymentIntent metadata. Webhook handler does an upsert, not a strict update.

**R2 — Refund ledger drift:** XP refunds re-credit the user's guildXp, which can re-trigger rank-up logic. Mitigation: refund path calls `xpService.awardXp` with a `BOOST_REFUND` type that's excluded from rank-up notifications.

**R3 — Featured slot inflation:** If both rails are too cheap, every sale becomes "featured" and the badge means nothing. Mitigation: scarcity is enforced at the *display* layer — SaleMap shows max 5 featured pins per viewport, sorted by purchase recency. Adjustable via env var.

**R4 — Subscription-style boosts (Wishlist):** WISHLIST_NOTIFICATION is the only recurring one. For now, treat it as a 30-day one-shot purchase that the user re-buys monthly. Stripe Subscription mode is out of scope — revisit if churn data shows users don't re-buy.

## Consequences

- New revenue line independent of GMV fees. At 100 organizers averaging 1 Event Sponsorship per sale per month, that's $500/mo recurring.
- BoostPurchase becomes the canonical model for any future "promotional placement" feature. RarityBoost gets deprecated in a follow-up.
- Stripe webhook handler grows a new branch — needs unit test coverage for the PENDING → ACTIVE flip.
- Frontend gets one new modal component instead of eight. Major UX consistency win.

## Constraints Added

- All future "boost" or "featured placement" features MUST go through BoostPurchase. Do not add ad-hoc boost tables.
- Boost pricing constants MUST live in `boostPricing.ts` and be referenced by both `xpService.ts` and the frontend `/quote` endpoint. Never hardcode in components.
- Stripe webhook handler is the ONLY place that flips BoostPurchase from PENDING → ACTIVE. Never do this from the API route directly.

---

## Architect Handoff — 2026-04-08

### Decision Made
Unified BoostPurchase service with dual XP/Stripe rails for all 8 promotional boost types. Permanent cosmetics stay XP-only.

### Contract Defined
- 4 endpoints: POST /api/boosts/quote, POST /api/boosts/purchase, GET /api/boosts/active, GET /api/boosts/me
- 1 webhook branch in existing /api/webhooks/stripe
- 1 service: boostService.ts (purchaseBoost, expireBoosts, refundBoost)
- 1 constants file: boostPricing.ts
- 1 frontend component: BoostPurchaseModal (rail-aware)

### Migration Plan
File: `20260408_add_boost_purchase`
Adds BoostPurchase model + 3 enums + 4 indexes. Additive only. RarityBoost left in place for follow-up cleanup.

### Dev Instructions (ordered)

1. **Schema** — Add `BoostPurchase` model + enums to `schema.prisma`. Add `boostPurchases BoostPurchase[]` relation to User. Run `prisma migrate dev` locally, then deploy to Railway per protocol (override DATABASE_URL, `migrate deploy`, `generate`).
2. **Constants** — Create `packages/backend/src/services/boostPricing.ts` with the pricing table from this ADR.
3. **Service** — Create `packages/backend/src/services/boostService.ts` implementing purchaseBoost (with XP and STRIPE branches), expireBoosts (cron-callable), refundBoost.
4. **Routes** — Create `packages/backend/src/routes/boosts.ts` with the 4 endpoints. Wire into express app.
5. **Stripe webhook** — Add branch in existing webhook handler: `if (event.data.object.metadata.boostPurchaseId)` → flip status. Add unit test.
6. **Cron** — Add `expireBoosts` to the existing cron runner (whatever currently sweeps expired ItemReservations — same pattern).
7. **Shared types** — Export `BoostType`, `PaymentMethod`, `BoostStatus` from `packages/shared`.
8. **Frontend modal** — Create `BoostPurchaseModal.tsx` with both rails. XP path: confirm → API call → success. Stripe path: confirm → API call → stripe.confirmCardPayment(clientSecret) → success.
9. **Frontend integration points** — Add "Boost this sale" / "Boost this haul" / "Boost this bounty" / "Featured Sale" buttons to the relevant pages. All open BoostPurchaseModal with the appropriate boostType.
10. **Featured display** — Wire SaleMap, haul feed, bounty list to call `/api/boosts/active` and render badges via BoostBadge component.
11. **Hunt-pass.tsx update** — Add cash prices alongside XP prices in the sinks table now that both rails exist.
12. **TS check + return changed-files list.**

### Patrick Decisions Locked (2026-04-08)

- **Lucky Roll / Mystery Box** — DEFERRED to separate gamedesign session (gacha mechanics need own design).
- **Wishlist subscription mode** — Ship as monthly one-shot, revisit Stripe Subscription if churn shows forgetfulness.
- **Featured slot cap** — Locked at max 5 featured pins per viewport, env-var adjustable. Validate against first 10 organizers.
- **Refund policy** — LOCKED: Stripe rail admin-only with 2 auto-refund cases (failed webhook reconcile, target deleted within 1hr). XP rail no refunds. 5-minute self-serve undo window on success modal. Matches Facebook/Google/eBay Promoted Listings standard.

### Coupon System Constraints (locked — must build alongside boost system)

Three coupon tiers, all using existing Coupon model + new generation flow:

| Coupon | XP cost | Min purchase | Monthly cap |
|---|---|---|---|
| $1 off $10+ | 100 XP | $10 | 1/mo |
| $1.50 off $20+ | 150 XP | $20 | 3/mo |
| $5 off $50+ | 500 XP | $50 | 1/mo |

**Constraints (enforced server-side):**
- Min purchase amount checked at Stripe charge time, not at coupon generation
- Monthly cap enforced per coupon type per user (not aggregate)
- Cannot stack with organizer-issued coupons
- 30-day expiry from generation
- Must be redeemed against a real Stripe-cleared transaction (no manual/cash sales)
- One coupon per transaction

**New schema fields needed on existing `Coupon` model:**
```prisma
minPurchaseAmount Int?     // cents — null for organizer coupons
generatedFromXp   Boolean  @default(false)  // distinguishes shopper-XP coupons
xpTier            String?  // "DOLLAR_OFF_TEN" | "ONE_FIFTY_OFF_TWENTY" | "FIVE_OFF_FIFTY"
```

**New endpoint:** `POST /api/coupons/generate-from-xp` with body `{ tier }`. Server enforces XP balance, monthly cap per tier, and creates Coupon row.

This is a separate dev task from the boost system but should ship in the same sprint since they share the "shopper spends XP for a benefit" UX pattern.

### Context Checkpoint
yes — significant new subsystem, STATE.md should record the BoostPurchase decision and the deprecation note for RarityBoost.
