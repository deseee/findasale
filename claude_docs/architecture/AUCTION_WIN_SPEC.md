# Architect Spec: #174 + #80 — Auction Win + Persistent Purchase Confirmation

**Status:** READY FOR DEV DISPATCH
**Locked Decisions:** S342 (10 items)
**Scope:** Schema assessment + auction close flow + backend contract + frontend UI + migration + rollback
**Effort:** M–L (3–4 dev passes, staggered to avoid checkout breakage)

---

## 1. Schema Assessment

### Current State

#### Item Model
```prisma
model Item {
  // ... existing fields
  auctionStartPrice     Float?
  auctionReservePrice   Float?
  currentBid            Float?
  auctionEndTime        DateTime?
  auctionClosed         Boolean   @default(false)
  status                String    @default("AVAILABLE")  // AVAILABLE, SOLD, RESERVED, AUCTION_ENDED
  // ... rest of fields
}
```

#### Bid Model
```prisma
model Bid {
  id        String   @id @default(cuid())
  amount    Float
  status    String   @default("ACTIVE")  // ACTIVE, WINNING, WON, LOST
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  itemId    String
  item      Item     @relation(fields: [itemId], references: [id])
  // ... rest of fields
}
```

#### Purchase Model
```prisma
model Purchase {
  id                    String   @id @default(cuid())
  amount                Float
  platformFeeAmount     Float?
  status                String   @default("PENDING")  // PENDING, PAID, REFUNDED, FAILED, DISPUTED
  userId                String?
  user                  User?    @relation(fields: [userId], references: [id])
  itemId                String?
  item                  Item?    @relation(fields: [itemId], references: [id])
  saleId                String?
  sale                  Sale?    @relation(fields: [saleId], references: [id])
  stripePaymentIntentId String?  @unique
  // ... rest of fields
}
```

### Schema Changes Required

**NONE.** The existing models support the feature:
- `Item.status` already includes `AUCTION_ENDED` state
- `Item.auctionReservePrice` already exists for reserve logic
- `Bid.status` already tracks `ACTIVE`, `WINNING`, `WON`, `LOST`
- `Purchase` model already exists with `PENDING` → `PAID` status flow
- Stripe payment intent tracking already in place via `Purchase.stripePaymentIntentId`

**One addition (optional, for better reserve auditing):**
```prisma
// Add to Item model (optional — helps organizer dashboard show reserve decisions)
reservePriceMet    Boolean?  @default(null)  // null = auction hasn't ended yet, true/false = organizer decision logged
```

This field is **nice-to-have** for audit trail only. Feature works without it. Recommend deferring to Phase 2 if schema migration token budget is tight.

---

## 2. Auction Close Flow

### Current State (auctionJob.ts)

1. **Every 5 minutes:** Cron job finds items where `auctionEndTime < now()` and `status = AVAILABLE`
2. **For each ended auction:**
   - Find highest bid
   - Mark item `status = AUCTION_ENDED`, `currentBid = highestBid.amount`
   - Create PaymentIntent (NOT charged yet — marked `PENDING`)
   - Create Purchase record linked to highest bidder
   - Email bidder with "payment required" message
   - Award XP to bidder
3. **Problem:** No reserve price handling. No explicit redirect or persistent confirmation page.

### New Flow (Spec)

#### Phase 1: Reserve Price Check + Immediate Charge (Dev Pass 1)

**When auctionJob runs:**

1. Find all items where `auctionEndTime < now()` and `status = AVAILABLE`
2. For each:
   - **Check reserve:**
     - If `item.auctionReservePrice` is set:
       - If `highestBid.amount >= auctionReservePrice` → proceed to charge
       - Else → mark `status = AUCTION_ENDED`, log organizer notification (no payment)
     - If no reserve → proceed to charge

3. **If reserve met OR no reserve:**
   - ✅ Create Stripe PaymentIntent (same code as Buy It Now)
   - ✅ Create Purchase record (status = PENDING)
   - ✅ Award XP to bidder
   - ✅ Send "complete payment" email to bidder (with `/purchases/{purchaseId}` link)
   - ✅ Notify organizer (separate channel if no charge; same channel if charging)

4. **If reserve NOT met:**
   - Mark `status = AUCTION_ENDED` (do NOT create PaymentIntent yet)
   - Notify organizer: "Auction ended, reserve not met. Decide: (a) Accept lower bid, (b) Relist"
   - Organizer manually decides (Phase 2: UI for organizer to approve lower bid)

#### Phase 2: Organizer Reserve Decision UI (Dev Pass 2 — deferred to POST-PHASE-1)

Organizer dashboard shows pending auctions with reserve not met. Two CTA buttons:
- "Accept this bid" → retroactively create PaymentIntent, email bidder
- "Relist item" → mark item as not sold, return to AVAILABLE

---

## 3. Backend Contract (API Spec)

### Existing Endpoints (No Changes)

- **POST `/checkout/payment-intent`** — Creates PaymentIntent for regular items + Buy It Now
  - Signature unchanged
  - Already handles auction items at `currentBid` (line 355–369 in stripeController.ts)
  - No changes needed for this endpoint

- **GET `/users/purchases/{purchaseId}`** — Fetch purchase details
  - Already exists, used by checkout-success.tsx
  - Return shape already includes all needed fields
  - No changes

### New/Modified Flow (No new endpoints needed)

The auction job uses **internal** Prisma calls (no API changes):

1. **PaymentIntent Creation:** Already works in stripeController (lines 450–460)
   - auctionJob will call the same `stripe().paymentIntents.create()` pattern
   - No API exposure needed

2. **Webhook Handler:** Already at `/webhooks/stripe`
   - On `payment_intent.succeeded`:
     - Updates `Purchase.status = 'PAID'`
     - Updates `Item.status = 'SOLD'`
     - Sends receipt email to shopper
     - Sends organizer payment notification
   - **No changes to webhook logic** — auction purchases processed same as Buy It Now

3. **Reserve Decision (Phase 2 endpoint — deferred):**
   - POST `/organizer/auctions/{itemId}/approve-reserve-bid`
   - POST `/organizer/auctions/{itemId}/relist`
   - Not needed for Phase 1

### Data Flow Diagram

```
auctionJob (every 5 min)
  ↓
  Find ended auctions (auctionEndTime < now, status=AVAILABLE)
  ↓
  For each:
    Check highestBid vs. auctionReservePrice
    ↓
    Reserve met or no reserve? YES → Create PaymentIntent → Email bidder + organizer
                               NO  → Mark AUCTION_ENDED → Organizer notification
    ↓
  Stripe webhook (async): payment_intent.succeeded
    ↓
    Update Purchase.status = PAID
    Update Item.status = SOLD
    Send receipt email
    Create notification for organizer
```

---

## 4. Frontend Spec

### New Page: `/purchases/[id].tsx`

**Purpose:** Persistent purchase confirmation page (replaces 5-second dismissable modal)

**Route:** `/purchases/{purchaseId}` (not `/checkout-success`)

**Query Params:** None (purchaseId in path)

**API Call:**
```typescript
GET /api/purchases/{purchaseId}
// Return shape (use existing endpoint):
{
  id: string
  amount: number
  status: "PENDING" | "PAID" | "REFUNDED" | "FAILED" | "DISPUTED"
  user: { id: string, email: string, name: string }
  item: { id: string, title: string, photoUrls: string[] }
  sale: {
    id: string,
    title: string,
    startDate: Date,
    endDate: Date,
    address: string,
    city: string,
    state: string,
    zip: string,
    organizer: { id: string, businessName: string, name: string }
  }
  createdAt: Date
  stripePaymentIntentId: string
  // Optional for auction:
  bidAmount?: number  // highestBid.amount (add to response if auction)
}
```

**Page Layout** (reference: existing checkout-success.tsx):

1. **Hero Section:**
   - Large checkmark circle (sage green #a4a99e)
   - "It's yours! 🎉" headline
   - "Purchase confirmed" subheader

2. **Item Display:**
   - Item photo (first image)
   - Item title
   - Organizer name
   - (NEW for auction) Winning bid amount (if auction)

3. **Pickup Info Box:**
   - Sale dates
   - Address
   - "Contact organizer for specifics"

4. **Order Details Box:**
   - Amount Paid: `$${purchase.amount.toFixed(2)}`
   - (NEW for auction) Breakdown if buyer premium was charged:
     ```
     Winning Bid:    $50.00
     Buyer Premium (5%): $2.50
     ─────────────────────
     Total Paid:     $52.50
     ```
   - Reference ID (partial Stripe PI)
   - Confirmation date

5. **CTAs:**
   - "View My Purchases" → `/shopper/purchases`
   - "Keep Shopping" → `/` (home)

6. **Footer Message:**
   - "Questions? Visit your messages to contact organizer"

**State Handling:**

- **PENDING status:** Show payment pending badge (organizer payout pending)
- **PAID status:** Show confirmed checkmark
- **FAILED/REFUNDED:** Show error state with retry link
- If no purchase data: 404 state

**Dark Mode:** Full support (existing checkout-success.tsx already does this)

### Modified Pages

#### `/shopper/checkout-success?purchaseId=XXX` (Legacy redirect)

**Action:** Add redirect logic:
```typescript
if (router.query.purchaseId) {
  redirect to `/purchases/${purchaseId}`
}
```

This allows old links to continue working.

#### `/items/[id].tsx` (Auction item detail)

**Changes:**
- After auction ends and payment intent created:
  - Show "Auction Closed" state instead of bid input
  - Show "View auction results" link → details of winning bid + link to payment page
  - For non-winner: Show "You didn't win. Place a bid on similar items →" suggestions

**No schema changes to this page — Item.status = AUCTION_ENDED is already visible.**

#### `/shopper/purchases.tsx` (Purchase history)

**Changes (if needed):**
- Add icon/badge for "Auction Win" purchases (optional, nice-to-have)
- Filter UI already supports filtering by sale type — ensure auction wins show up

**Implementation:** Likely no changes needed; query already fetches all purchases.

---

## 5. Knock-on Effects

### What Breaks Without Fix

| Flow | Issue | Fix |
|------|-------|-----|
| Buy It Now checkout (non-auction) | Unchanged | None — stripeController already handles both |
| POS checkout | Unchanged | None — POS flow separate from auction |
| Auction items at currentBid checkout | Unchanged | None — stripeController already charges at currentBid (line 358–364) |
| Old checkout-success links | May 404 | Add redirect middleware to `/checkout-success?purchaseId=X` → `/purchases/X` |

### Design Continuity

- **Color palette:** Use existing sage green (#a4a99e) for checkmark circle (matches existing design)
- **Typography:** Fraunces for headline (matches existing checkout-success.tsx)
- **Buyer premium disclosure:** MUST display 5% rate + amount breakdown (legal requirement — Platform Safety #96)
- **Dark mode:** Must match existing dark mode styling (gray-900, gray-800, etc.)

---

## 6. Phased Implementation (3 Dev Passes)

### Pass 1: Reserve Check + PaymentIntent (3–4 hours)
**Goal:** Auction job creates charges at close; existing webhook handles payment confirmation.

**Dev Tasks:**
1. Update `auctionJob.ts`:
   - Add reserve price check logic
   - Create PaymentIntent for reserve-met auctions (copy existing pattern from stripeController)
   - Handle reserve-not-met case (mark AUCTION_ENDED, skip PaymentIntent)
   - Update email copy to link to `/purchases/{purchaseId}`

2. Update Bid model (optional — defer):
   - Add `reservePriceMet` field to Item (only if organizer dashboard needs audit trail)
   - Migration: nullable boolean

3. Test:
   - Create auction with reserve
   - Set auctionEndTime to past
   - Run job manually (dev command)
   - Verify PaymentIntent created + email sent

**Acceptance:**
- Auction job runs, creates PaymentIntent for met reserves
- Webhook fires, marks purchase PAID, marks item SOLD
- Email successfully delivered with `/purchases/{id}` link

### Pass 2: Persistent Confirmation Page (2–3 hours)
**Goal:** New `/purchases/[id].tsx` page replaces modal experience.

**Dev Tasks:**
1. Create `/packages/frontend/pages/purchases/[id].tsx`
   - Fetch purchase data via `/api/purchases/{id}`
   - Render confirmation page (copy layout from checkout-success.tsx)
   - Add buyer premium breakdown for auction items
   - Handle PENDING / PAID / FAILED states
   - Dark mode support

2. Update `CheckoutModal.tsx`:
   - On payment success, redirect to `/purchases/{purchaseId}` instead of showing inline success card
   - Remove inline success card UI (paymentSucceeded state can be deleted)

3. Update `/shopper/checkout-success.tsx`:
   - Add redirect logic to catch old links
   - Keep for backward compatibility (optional — can be deprecated later)

4. Test:
   - Complete a Buy It Now purchase → should land on `/purchases/{id}`
   - Complete an auction payment → should land on `/purchases/{id}`
   - Dark mode toggle → should render correctly
   - Mobile viewport → should be responsive

**Acceptance:**
- Persistent page loads with correct purchase data
- Buyer premium breakdown displays for auction items
- User can navigate back to purchases list
- Page works in dark mode and mobile

### Pass 3: Organizer Reserve Decision UI (Deferred to Phase 2)
**Goal:** Organizer can approve or reject bids below reserve.

**Deferred Items:**
- Organizer dashboard "pending auctions" section
- POST `/organizer/auctions/{itemId}/approve-reserve-bid`
- POST `/organizer/auctions/{itemId}/relist`
- Organizer receives notification when reserve not met

**Not in Phase 1 scope.** Locked decision says "organizer manual decision OR per-sale toggle" — Phase 1 implements manual notification only. Phase 2 adds UI.

---

## 7. Migration Plan

### No Schema Migration Needed (Recommended)

**Why:**
- `Item.auctionReservePrice` already exists
- `Item.status = 'AUCTION_ENDED'` already exists
- `Bid.status` already tracks states
- `Purchase` model fully supports auction purchases

**Optional migration (deferred to Phase 2):**
```sql
-- 20260330_add_reserve_price_audit_field.sql
ALTER TABLE "Item" ADD COLUMN "reservePriceMet" BOOLEAN DEFAULT NULL;
```

If this is added, no data migration needed — column is nullable and used only for future organizer decisions.

---

## 8. Rollback Plan

### No Rollback Needed (Code-Only)

**Why:** No schema changes in Phase 1 → no data loss risk.

If optional `reservePriceMet` column is added (Phase 2):

```sql
-- Rollback
ALTER TABLE "Item" DROP COLUMN "reservePriceMet";
```

**Deploy Rollback:**
- If auctionJob code breaks, disable cron job in env:
  ```
  AUCTION_JOB_ENABLED=false
  ```
- Stripe webhook handler is backwards-compatible (no changes)
- Frontend new page is additive (no existing page replaced in Phase 1)
- Revert frontend commit to remove `/purchases/[id].tsx`, keep `/checkout-success` as is

---

## 9. Patrick Decisions Needed (NONE)

All decisions locked in S342:

1. ✅ Merge #174 + #80 → persistent page at `/purchases/{id}`
2. ✅ Charge immediately at auction close (same as Buy It Now)
3. ✅ Organizer manual decision for reserve not met (Phase 2)
4. ✅ Buyer premium 5% (already implemented, locked S176+)
5. ✅ Platform fee model (organizer pays — already locked)

**No Patrick input required before dev dispatch.**

---

## 10. Acceptance Criteria (QA Stage)

### Phase 1 (auctionJob + PaymentIntent)

- [ ] Auction with reserve met: PaymentIntent created, shopper emailed, organizer notified
- [ ] Auction without reserve: PaymentIntent created immediately
- [ ] Auction with reserve NOT met: AUCTION_ENDED status set, no PaymentIntent, organizer notified
- [ ] Winning bid amount recorded on Purchase
- [ ] Buyer premium (5%) calculated correctly for auction items
- [ ] Email includes link to `/purchases/{purchaseId}`
- [ ] Webhook processes payment correctly (PAID status set)
- [ ] Item status transitions: AVAILABLE → AUCTION_ENDED → SOLD

### Phase 2 (Persistent Page)

- [ ] `/purchases/[id]` loads with correct purchase data
- [ ] Buyer premium breakdown displays for auction items (not for Buy It Now)
- [ ] Dark mode renders correctly
- [ ] Mobile viewport is responsive (<384px, 384–768px, 768px+)
- [ ] Redirect from old `/checkout-success?purchaseId=X` works
- [ ] User can navigate to `/shopper/purchases` and find the transaction
- [ ] Receipt email sent with correct amount + breakdown
- [ ] Organizer payment notification includes item title + amount

### Phase 3 (Reserve Decision UI — deferred)

- TBD (post-phase-1)

---

## 11. Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Duplicate PaymentIntents created if job runs twice | auctionJob already marks AUCTION_ENDED → won't re-process |
| Stripe API rate limit on job | Job runs every 5 min, typically finds <10 items per run. Safe. |
| Reserve price logic has off-by-one error | Test: bid = 50.00, reserve = 50.00 should PASS (>= not >) |
| Email links 404 if Purchase not created yet | Create Purchase first (line 82–93 in auctionJob), then send email |
| Organizer not onboarded to Stripe | Already handled in auctionJob (lines 62–79): skip PaymentIntent, mark PAID |
| Buyer premium not disclosed in checkout | Add to `/purchases/[id]` breakdown section (legal requirement) |

---

## 12. Dev Dispatch Readiness

**Status:** READY FOR DEV

**Next Steps:**
1. Dispatch to `findasale-dev` with this spec
2. Dev completes Pass 1 (auctionJob + PaymentIntent)
3. Main session reviews + QA tests auction end-to-end
4. Dev completes Pass 2 (persistent page)
5. QA browser-tests `/purchases/[id]` page
6. Deploy to production

**Estimated Timeline:** 2–3 days (dev + QA)

---

## References

- **Schema:** `/sessions/brave-fervent-ptolemy/mnt/FindaSale/packages/database/prisma/schema.prisma` (Bid, Purchase, Item models)
- **auctionJob:** `/sessions/brave-fervent-ptolemy/mnt/FindaSale/packages/backend/src/jobs/auctionJob.ts`
- **stripeController:** `/sessions/brave-fervent-ptolemy/mnt/FindaSale/packages/backend/src/controllers/stripeController.ts`
- **Checkout UI:** `/sessions/brave-fervent-ptolemy/mnt/FindaSale/packages/frontend/pages/shopper/checkout-success.tsx`
- **Decisions:** `/sessions/brave-fervent-ptolemy/mnt/FindaSale/claude_docs/decisions-log.md` (S342)
