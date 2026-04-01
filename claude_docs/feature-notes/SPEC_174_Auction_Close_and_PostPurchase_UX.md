# Architecture Spec: #174 Auction Mechanics + Close Flow & #80 Purchase Confirmation Redesign

**Date:** 2026-03-30
**Status:** Research & Architecture (No Implementation)
**Related Issues:** #174, #80, #221, #132
**Prepared for:** Patrick (FindA.Sale Founder)

---

## Executive Summary

Issues #174 and #80 are tightly coupled and should be unified into a single redesigned Auction Close + Post-Purchase UX. Currently:

- **#174 (Auction Mechanics):** When an auction ends, there's no clear close flow — no winner notification, no checkout initiation, no persistent confirmation.
- **#80 (Purchase Confirmation):** The post-checkout success card (checkout-success.tsx) displays for ~5 seconds then disappears with no persistent record available. Shoppers can't revisit what they bought unless they navigate to /purchases.

**Root cause:** The purchase flow creates a transient modal/card that lacks persistence, visibility, and integration with auction winner workflows.

**Recommended approach:** Merge into one "Auction Win + Post-Purchase Flow" that:
1. Closes auction automatically (cron or explicit action)
2. Determines winner and initiates Stripe checkout (or hold-to-pay invoice)
3. Routes winner to a persistent, shareable, refreshable confirmation page (not a dismissable modal)
4. Sends in-app notification + email to winner with contextual details
5. Notifies organizer of auction close and payment status

**Key schema changes required:**
- Add `winnerId` to Item model for auction tracking
- Add `auctionClosedAt` and `auctionWinnerNotifiedAt` to Item model
- Enhance Purchase model to support auction-specific metadata
- Create AuctionWinner table (optional, for audit trail)

---

## Part 1: Current State Diagnosis

### 1.1 Auction Fields in Schema (Current)

From `schema.prisma`:

```prisma
model Item {
  // ... core fields
  auctionStartPrice     Float?
  auctionReservePrice   Float?
  currentBid            Float?
  bidIncrement          Float?    @default(1)
  auctionEndTime        DateTime?
  auctionClosed         Boolean   @default(false)
  status                String    @default("AVAILABLE")
  // AVAILABLE, SOLD, RESERVED, INVOICE_ISSUED, AUCTION_ENDED

  // Missing:
  // - winnerId (FK to User)
  // - auctionClosedAt (DateTime)
  // - auctionWinnerNotifiedAt (DateTime)
}

model Bid {
  id                String      @id @default(cuid())
  itemId            String
  item              Item        @relation(fields: [itemId], references: [id], onDelete: Cascade)
  bidderId          String
  bidder            User        @relation(fields: [bidderId], references: [id], onDelete: Cascade)
  amount            Float
  timestamp         DateTime    @default(now())
  ipRecords         BidIpRecord[] // Platform Safety #94
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
}
```

**Assessment:** Auction fields exist but are incomplete:
- No winner tracking (no `winnerId` field)
- No auction close timestamps
- No winner notification flag
- Live bidding is handled via Socket.io (not in schema)

### 1.2 Bid Tracking (Current)

**What exists:**
- `Bid` model stores individual bids with `itemId`, `bidderId`, `amount`, `timestamp`
- IP tracking for fraud via `BidIpRecord` (Platform Safety #94)
- No highest-bid index or winner determination logic visible in schema

**What's missing:**
- No pre-computed `currentBidder` or `winnerId` field on Item (requires query each time)
- No bid vetting or reserve price enforcement in schema
- No auction state machine (pending → active → closed → winner_determined)

### 1.3 Checkout Success Flow (Current)

**File:** `/packages/frontend/pages/shopper/checkout-success.tsx`

**Current behavior:**
1. User completes Stripe payment → Stripe webhook fires (`payment_intent.succeeded`)
2. Backend webhook handler (stripeController.ts) creates Purchase record with status `PAID`
3. Frontend redirected to `/shopper/checkout-success?purchaseId=XXX`
4. Page fetches Purchase from API (`GET /users/purchases/{purchaseId}`)
5. Displays permanent success card with item photo, price, pickup info, organizer contact
6. **BUT:** No timeout or dismissal timer coded — card persists until user navigates away OR page is reloaded

**Issue identified:** Patrick says "success card displays for ~5 seconds then disappears." This suggests:
- Either a missing toast/modal (different from the page) that is auto-dismissed
- Or confusion with modal behavior in sales/[id].tsx checkout flow

**Investigation needed:** Verify whether confirmation happens via:
- Temporary modal (dismissed after 5s)
- Full-page redirect to checkout-success.tsx (which persists)
- Toast notification (which is auto-dismissed)

### 1.4 What's Broken & Why

**#80 Root Cause:**
The checkout-success page is a full page (good), but the **initiation** may be a modal that's dismissed too quickly. If a buyer places an order via "Buy Now" modal on sales/[id].tsx, the flow might be:
1. Open CheckoutModal
2. Modal calls `/api/stripe/checkout-session` or `/api/stripe/payment-intent`
3. Gets `clientSecret` and `purchaseId`
4. Shows confirmation card inside modal with auto-dismiss
5. Modal closes before user reads confirmation
6. User navigates away unsure of status

**#174 Root Cause:**
No auction close workflow exists. When `auctionEndTime` passes, there's no:
- Automatic winner determination
- Invoice/checkout generation
- Winner notification
- Organizer alert

---

## Part 2: Redesigned Post-Purchase + Auction Close Flow

### 2.1 High-Level Flow (Unified)

```
[Auction Ends]
  ↓
[Determine Winner (highest bid or reserve price met)]
  ↓
[Create HoldInvoice OR Stripe Checkout Session]
  ↓
[Notify Winner: in-app notification + email]
  ↓
[Winner clicks "Complete Purchase" or "Pay Now"]
  ↓
[Stripe Checkout opens (new tab or frame)]
  ↓
[Payment completes]
  ↓
[Webhook: payment_intent.succeeded]
  ↓
[Update Item status → SOLD]
[Create Purchase record]
[Notify Organizer: "Payment received for auction item X"]
  ↓
[Redirect Winner to /orders/{orderId}]
  OR
[Navigate to persistent /purchases/{purchaseId}]
```

### 2.2 Post-Purchase Persistence (Solving #80)

**Current issue:** Success info is transient (modal dismisses, or unclear).

**New design:**

#### Route: `/orders/{orderId}` or `/purchases/{purchaseId}`

Users need a **persistent, shareable, refreshable** page showing:
- Item photo + title
- Price breakdown (item price, buyer premium, platform fee, discount)
- Organizer name + contact
- Pickup location & dates
- Transaction ID (for reference)
- Order status (PAID, AWAITING_PICKUP, COMPLETED, DISPUTED)
- CTA to contact organizer or return to browse

**Design spec:**
- Accessible via direct URL: `/orders/{orderId}` or `/purchases/{purchaseId}`
- Requires authentication (user can only see own purchases)
- Full-page (not modal, not toast)
- Shareable link (optional: expiring time-limited link for organizers to view sale activity)
- Includes "Receipt" button → generates PDF via `generateReceipt()` (already exists)

**Decision:** Reuse existing `/shopper/checkout-success.tsx` but rename route to `/shopper/purchases/{purchaseId}` for clarity. OR consolidate both routes:
- `/shopper/purchases` (list view) — already exists
- `/shopper/purchases/{purchaseId}` (detail view) — NEW, replaces checkout-success.tsx

### 2.3 Checkout Flow Redesign

**Current flow in sales/[id].tsx:**
1. "Buy Now" button → opens CheckoutModal
2. Modal calls createPaymentIntent → gets clientSecret
3. Stripe Elements embedded in modal
4. On success → shows success card (5s?) → unclear dismissal
5. User navigates manually to purchases

**New flow:**

1. "Buy Now" button → calls `POST /api/stripe/checkout-session` (or reuses `createPaymentIntent`)
   - Returns `sessionId` and `clientSecret`
2. **Option A (Recommended for auctions):** Open Stripe Checkout in new tab/window
   - `window.open(checkoutSession.url)` — user completes payment off-site
   - On return: redirect to `/purchases/{purchaseId}` (handled by success_url param)
   - Reduces complexity, mirrors standard e-commerce UX
3. **Option B (Current):** Embed Stripe Elements in modal
   - On success: close modal → redirect to `/purchases/{purchaseId}`
   - Show persistent page, not transient card
4. **For auctions:** Override "Buy Now" → "Complete Auction Purchase" or "Pay Invoice"
   - Points to HoldInvoice checkout (if hold-to-pay path) OR Stripe session (if direct checkout)

### 2.4 Auction Close Flow (Solving #174)

**Trigger options:**

**Option 1: Cron job (Recommended)**
- `jobs/auctionCloseJob.ts` runs every 5 minutes
- Finds all Items where `auctionEndTime < NOW()` and `auctionClosed = false`
- For each:
  1. Determine winner (highest bid, reserve met)
  2. Set `winnerId` on Item
  3. Update Item `status` → `AUCTION_ENDED` (or keep `AVAILABLE` if reserve not met)
  4. Create HoldInvoice (if hold-to-pay path) or Stripe checkout session (if direct)
  5. Create Notification for winner
  6. Send email to winner
  7. Set `auctionClosedAt` timestamp
  8. Update `auctionClosed = true`
- Idempotent: checks `auctionClosed` flag to avoid duplicate notifications

**Option 2: Organizer manual close**
- Organizer dashboard / sale detail page shows "End Auction Early" button
- POST `/api/sales/{saleId}/items/{itemId}/close-auction`
- Same logic as cron, but triggered synchronously
- Useful for organizer-managed auctions (not open-ended)

**Recommendation:** Implement both. Cron is automatic safety net; manual close gives organizer control.

### 2.5 In-App Notification Spec

**Trigger:** Auction close + winner determined

**Notification record (Notification model):**
```
{
  userId: <winnerId>,
  type: "auction_won",
  title: "You won the auction!",
  body: "Vintage Record Player has sold to you for $45.00. Proceed to checkout to complete your purchase.",
  link: "/orders/{purchaseId}" OR "/items/{itemId}?auction_closed=true",
  channel: "OPERATIONAL",
  createdAt: <auctionClosedAt>,
  read: false
}
```

**In-app UI:**
- Appears in Notification Inbox (bell icon → dropdown)
- Mark as read on click
- Persists until dismissed by user
- CTA leads to item detail page with "Complete Purchase" button or to confirmation page if already paid

### 2.6 Email Spec

**Winner notification (Auction end):**
- Service: `saleAlertEmailService.ts` → `sendAuctionWonEmail()`
- Template: "Congratulations! You Won an Auction"
- Content:
  - Item photo + title
  - Final bid amount
  - Buyer premium (5%) + platform fee breakdown
  - Sale organizer name
  - CTA: "Complete Your Payment" → link to Stripe checkout or hold invoice
  - Fallback: "If you don't complete payment within 7 days, the item may be re-listed"
- Send delay: Immediate (within 1 min of auction close)

**Organizer notification (Item sold):**
- Existing: `sendItemSoldAlert()` already fires on payment success
- Enhancement: Add auction-specific copy
  - "Auction closed: {itemTitle} sold to {winnerName} for ${finalBid} (including buyer premium)"
  - Include buyer contact info for coordination

**Payment success receipt:**
- Existing: `sendReceiptEmail()` fires on webhook
- Enhancement: Add auction-specific fields to email context
  - Buyer premium line item
  - Bid history (optional: link to auction details)

---

## Part 3: Hold-to-Pay Integration (#221 Tie-in)

### 3.1 Can HoldInvoice Reuse Work?

**HoldInvoice (already built in S341):**
```prisma
model HoldInvoice {
  id                    String    @id @default(cuid())
  reservationId         String    @unique
  reservation           ItemReservation @relation(...)
  shopperUserId         String
  status                String    // PENDING, PAID, REFUNDED, EXPIRED
  stripeCheckoutUrl     String?
  expiresAt             DateTime
  // ...
}
```

**What's shared:**
- Both are "hold until payment" workflows
- Both generate Stripe checkout sessions
- Both track payment status over time
- Both expire (auction winner has 7 days to pay; hold expires per hold duration)

**What's different:**
- **HoldInvoice:** Organizer initiates by marking item sold on held item
  - Shopper already in store
  - Natural next step: pay to take item
  - Hold duration: 30-90 min (then expires)
  - Invoice duration: 7 days (longer grace period)

- **Auction winner:** Automatic when auction closes
  - Winner may be remote
  - Needs email notification
  - Automatic cron trigger (not manual organizer action)

**Recommendation:** **Reuse HoldInvoice architecture but create separate table**

Create `AuctionCheckout` table:
```prisma
model AuctionCheckout {
  id                    String    @id @default(cuid())
  itemId                String    @unique
  item                  Item      @relation(fields: [itemId], references: [id], onDelete: Cascade)
  winnerId              String
  winner                User      @relation(fields: [winnerId], references: [id], onDelete: Cascade)
  status                String    @default("PENDING") // PENDING, PAID, EXPIRED, REFUNDED
  stripeCheckoutUrl     String?
  stripeCheckoutSessionId String?
  expiresAt             DateTime  // 7 days from auctionClosedAt
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([winnerId])
  @@index([expiresAt])
}
```

**Shared logic:**
- Both use `POST /api/stripe/checkout-session` to create Stripe sessions
- Both webhook: `checkout.session.completed` → status PAID → creates Purchase
- Both notify winner/shopper and organizer

**Different logic:**
- Auction trigger: automatic cron
- Hold trigger: manual organizer action
- Auction email tone: "You won!"
- Hold email tone: "Complete your hold"
- Expiry: 7 days (auction) vs 30-90 min (hold)

---

## Part 4: Downstream Effects & Schema Changes

### 4.1 Schema Additions

**Item model:**
```prisma
model Item {
  // ... existing fields

  // Auction winner tracking
  winnerId              String?         // FK to User, null until auction closes
  winner                User?           @relation("AuctionWinners", fields: [winnerId], references: [id])
  auctionClosedAt       DateTime?       // When auction ended
  auctionWinnerNotifiedAt DateTime?     // When winner was notified (idempotency flag)

  // FK to AuctionCheckout
  auctionCheckoutId     String?
  auctionCheckout       AuctionCheckout? @relation(fields: [auctionCheckoutId], references: [id])

  @@index([winnerId])
  @@index([auctionClosedAt])
}

model User {
  // ... existing fields
  auctionWins           Item[]          @relation("AuctionWinners")
}

model AuctionCheckout {
  id                    String    @id @default(cuid())
  itemId                String    @unique
  item                  Item      @relation(fields: [itemId], references: [id], onDelete: Cascade)
  winnerId              String
  winner                User      @relation(fields: [winnerId], references: [id], onDelete: Cascade)
  status                String    @default("PENDING")
  stripeCheckoutUrl     String?
  stripeCheckoutSessionId String?
  expiresAt             DateTime
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([winnerId])
  @@index([expiresAt])
}

// Optional: Audit trail for auction winners (historical record)
model AuctionWinnerHistory {
  id                    String    @id @default(cuid())
  itemId                String
  item                  Item      @relation(fields: [itemId], references: [id], onDelete: Cascade)
  winnerId              String
  winner                User      @relation(fields: [winnerId], references: [id], onDelete: Cascade)
  finalBid              Float
  auctionEndTime        DateTime
  winTimestamp          DateTime  @default(now())
  paymentCompletedAt    DateTime?

  @@index([winnerId])
  @@index([auctionEndTime])
}
```

**Migration:**
```
20260330_add_auction_winner_tracking
- Add winnerId, auctionClosedAt, auctionWinnerNotifiedAt, auctionCheckoutId to Item
- Add indexes on winnerId, auctionClosedAt
- Create AuctionCheckout table
- Create AuctionWinnerHistory table (optional)
- No breaking changes; all fields nullable or optional
```

### 4.2 API Endpoint Changes

**New endpoints:**

```
POST /api/auctions/{itemId}/close
  - Manual auction close (organizer)
  - Determine winner, create checkout, notify winner
  - Input: { itemId, reason?: "organizer_requested" | "expired" }
  - Output: { winnerId, auctionCheckoutId, checkoutUrl }
  - Auth: ORGANIZER only for this sale

GET /api/auctions/{itemId}/winner
  - Check if auction won and get checkout status
  - Output: { winnerId, status, checkoutUrl?, expiresAt? }
  - Auth: Public (but only reveals if user is the winner)

GET /api/checkouts/auction/{auctionCheckoutId}
  - Fetch auction checkout details
  - Output: { itemId, winnerId, status, expiresAt, checkoutUrl }
  - Auth: User (own checkout only)

POST /api/purchases
  - Enhanced to support auction metadata
  - Input: { itemId, auctionCheckoutId?, source: "direct" | "auction" }
  - Creates Purchase record with source + auction context

GET /api/purchases/{purchaseId}
  - Fetch purchase details (existing, already used by checkout-success.tsx)
  - Enhanced to include auction winner context if applicable
```

**Modified endpoints:**

```
GET /api/sales/{saleId}/items/{itemId}
  - Added: winnerId, auctionClosedAt, auctionCheckoutId in response
  - Allows frontend to show "You won!" badge or "Payment pending" state

POST /api/stripe/checkout-session
  - Input: now accepts { itemId, auctionCheckoutId?, holdInvoiceId? }
  - Determines which type of checkout to create
  - Handles auction vs. direct vs. hold-to-pay flows uniformly
```

### 4.3 Backend Controllers

**New/Modified files:**

**auctionController.ts (NEW)**
```typescript
// Determine winner (highest bid, validate reserve)
export const determineWinner = (item: Item, bids: Bid[]): Bid | null => { }

// Create auction checkout (calls stripeController.createCheckoutSession)
export const createAuctionCheckout = async (itemId: string, winnerId: string) => { }

// Close auction (manual)
export const closeAuction = async (req: AuthRequest, res: Response) => { }

// Get auction status
export const getAuctionStatus = async (req: Request, res: Response) => { }
```

**reservationController.ts (MODIFIED)**
- Extract `createCheckoutSession` → shared utility in `stripeController.ts`
- Both hold-to-pay and auction use same underlying Stripe logic

**stripeController.ts (MODIFIED)**
- Unified `createCheckoutSession` that accepts { itemId, auctionCheckoutId?, holdInvoiceId? }
- Detect which type and populate metadata accordingly
- Webhook handlers updated to handle auction checkout completion

**notificationService.ts (MODIFIED)**
- `sendAuctionWonEmail()` — new function
- Templates for auction winner notifications

**jobs/auctionCloseJob.ts (NEW)**
```typescript
// Runs every 5 minutes
// Find items where auctionEndTime < NOW() and auctionClosed = false
// Call auctionController.closeAuction for each
// Idempotent via auctionWinnerNotifiedAt flag
```

### 4.4 Frontend Pages/Components

**New/Modified:**

**pages/shopper/purchases/{purchaseId}.tsx (RENAMED from checkout-success.tsx)**
- Full-page detail view (already mostly built)
- Add auction-specific content if present
- Add status indicator (PENDING, PAID, AWAITING_PICKUP, COMPLETED, DISPUTED)
- Add "Download Receipt" button
- Add "Contact Organizer" CTA linking to messages

**pages/items/{itemId}.tsx (MODIFIED)**
- Add "You won this auction!" badge if user is winner and not yet paid
- Add "Complete Your Payment" button → links to AuctionCheckout
- Show countdown timer if checkout expires soon
- Add "Payment pending" state with expiry

**components/CheckoutModal.tsx (MODIFIED)**
- Support auction checkout flow
- Different messaging for "Complete Auction Purchase"
- Option to open Stripe Checkout in new tab

**components/AuctionCheckoutCard.tsx (NEW)**
- Shows if item won by user but not paid
- "You won this auction for $XX"
- "Complete payment by {expiryDate}"
- "Complete Purchase" button

**hooks/useAuctionStatus.ts (NEW)**
- Fetch `GET /api/auctions/{itemId}/winner`
- Returns winner status and checkout info

**TypeScript types (packages/shared/types):**
```typescript
type AuctionCheckout = {
  id: string;
  itemId: string;
  winnerId: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "REFUNDED";
  expiresAt: Date;
  checkoutUrl?: string;
};

type PurchaseWithAuctionContext = Purchase & {
  auctionCheckoutId?: string;
  finalBid?: number; // if auction
  source: "direct" | "auction" | "hold_to_pay";
};
```

---

## Part 5: Tie-in with Hold-to-Pay (#221)

### 5.1 Shared Architecture

Both flows (Hold-to-Pay and Auction) are "hold until payment" patterns:

| Aspect | Hold-to-Pay | Auction |
|--------|-------------|---------|
| Trigger | Organizer marks sold on held item | Auction closes (cron or manual) |
| Invoice created | HoldInvoice | AuctionCheckout |
| Winner/Shopper | Existing hold owner (shopper) | Auction winner (highest bidder) |
| Duration | 7 days (hard limit) | 7 days (recommended) |
| Email | "Pay your hold" | "You won! Complete payment" |
| Checkout type | Stripe session (reuse `createCheckoutSession`) | Stripe session (same) |
| Notification | In-app + email | In-app + email |
| Expiry action | Refund (or re-list if not paid) | Re-list (or donor cleanup) |

### 5.2 Consolidation Opportunity

**Single `CheckoutType` enum:**
```typescript
type CheckoutSource = "direct" | "hold_to_pay" | "auction";
```

**Single Stripe endpoint:**
```typescript
POST /api/stripe/checkout-session
  Input: { itemId, source: CheckoutSource, ... }
  - source = "direct" → normal item purchase
  - source = "hold_to_pay" → holdInvoiceId required
  - source = "auction" → auctionCheckoutId required
```

**Shared webhook handler:**
```typescript
case 'checkout.session.completed':
  - Determine source from metadata
  - If hold_to_pay → update HoldInvoice status = PAID
  - If auction → update AuctionCheckout status = PAID
  - Both create Purchase record
  - Both notify organizer
  - Both update Item status = SOLD
```

### 5.3 Product Roadmap Sequence

**Phase 1 (This session):** Architecture spec only
**Phase 2 (Next dev session):** Schema + migrations + auctionController
**Phase 3 (Next dev session):** Backend endpoints + webhook handling
**Phase 4 (Next dev session):** Frontend pages + components
**Phase 5 (QA session):** E2E testing of auction close → payment → confirmation

---

## Part 6: Implementation Roadmap & Sequencing

### 6.1 Recommended Build Sequence

1. **Week 1: Schema & Migrations**
   - Add winnerId, auctionClosedAt, auctionWinnerNotifiedAt to Item
   - Create AuctionCheckout table
   - Create migration 20260330_add_auction_winner_tracking
   - Deploy to Railway, verify schema synced

2. **Week 1: Backend Foundation**
   - auctionController.ts: determineWinner(), createAuctionCheckout()
   - jobs/auctionCloseJob.ts: cron runner
   - Update stripeController.ts: unify createCheckoutSession
   - Update notificationService.ts: sendAuctionWonEmail()

3. **Week 2: API Routes**
   - POST /api/auctions/{itemId}/close (organizer manual)
   - GET /api/auctions/{itemId}/winner (check status)
   - GET /api/checkouts/auction/{id} (fetch details)
   - Webhook updates for auction checkout completion

4. **Week 2: Frontend Pages**
   - Rename checkout-success.tsx → purchases/{purchaseId}.tsx (or add both routes)
   - Update items/{itemId}.tsx with AuctionCheckoutCard
   - Create AuctionCheckoutCard component
   - Create useAuctionStatus hook

5. **Week 3: QA & Polish**
   - E2E test: auction close → winner notified → payment → confirmation
   - Email template testing
   - Expiry cron testing
   - Dark mode/mobile/accessibility

### 6.2 Dependency Graph

```
Schema migrations
  ↓
auctionController
  ↓
stripeController (unify checkout creation)
  ↓
API routes (POST /auctions/{itemId}/close, etc.)
  ↓
Frontend pages (AuctionCheckoutCard, purchases/{purchaseId})
  ↓
QA & E2E testing
```

### 6.3 Risk Mitigation

**Risk 1: Concurrent purchases (auction item bought as "Buy Now" before auction closes)**
- Mitigation: Check Item.status before creating AuctionCheckout
- If already SOLD, skip auction workflow and refund winner

**Risk 2: Winner doesn't pay within 7 days**
- Mitigation: Cron checks AuctionCheckout.expiresAt, marks EXPIRED
- Organizer dashboard shows "Payment expired" status
- Decision: Auto-refund or re-list? (Patrick decision)

**Risk 3: Reserve price not met**
- Mitigation: determineWinner() checks final bid vs. auctionReservePrice
- If not met: Item status stays AVAILABLE, no winner created
- Notify organizer: "Auction closed, reserve not met"

**Risk 4: Email delivery delays**
- Mitigation: Async send with retry queue
- Set auctionWinnerNotifiedAt only after confirmed send
- Fallback: In-app notification always fires synchronously

---

## Part 7: Recommended Roadmap Split & Prioritization

### Option 1: Merge #174 + #80 (RECOMMENDED)

**Single feature:** "Auction Win + Persistent Purchase Confirmation"

**Rationale:**
- Both touch checkout flow
- Both require persistent confirmation page
- Both need notifications
- Unified implementation is cleaner than separate

**Scope:**
- Complete auction close flow (cron + manual)
- Complete auction winner checkout flow
- Persistent purchase confirmation page for all purchase types
- In-app + email notifications for auction winner

**Estimate:** 2.5 weeks (schema, backend, frontend, QA)

**Go-to-market:** Launch with Hold-to-Pay (#221) — same release

### Option 2: Separate Implementation

**#80 First (1 week):**
- Fix checkout-success.tsx → make sure it persists (already does)
- Rename to /purchases/{purchaseId}
- Ensure redirect from modal works
- Quick win, minimal scope

**#174 Second (2 weeks):**
- Full auction close flow
- Winner notification
- Checkout integration
- Requires hold-to-pay for payment path

**Rationale:** Smaller initial scope, easier to ship #80 quickly

**Risk:** #80 + #174 likely need to merge anyway for auction winner payment path

---

## Part 8: Open Questions & Patrick Decisions

1. **Auction winner payment path:**
   - Direct Stripe checkout (new tab)?
   - Embedded elements in modal?
   - Hold-to-Pay invoice (organizer initiates)?
   - **→ Patrick call:** Which experience do you prefer?

2. **Auction win notification priority:**
   - In-app Notification first (user sees bell icon)?
   - Email first (background task)?
   - Simultaneous (preferred)?
   - **→ Patrick call:** Timing preference?

3. **Auction reserve price not met:**
   - Auto-refund and re-list?
   - Notify organizer, wait for manual action?
   - Allow "accept lower bid" workflow?
   - **→ Patrick call:** Business rule?

4. **Payment expiry for auction winner:**
   - 7 days (hard deadline)?
   - 14 days (longer)?
   - Extendable?
   - **→ Patrick call:** Grace period?

5. **Merge #80 + #174 or separate?**
   - Single 2.5-week feature (merged)?
   - Two 1-week features (separate)?
   - **→ Patrick call:** Dev sequence preference?

---

## Summary: What Gets Built

### Schema Changes
- Item: +winnerId, +auctionClosedAt, +auctionWinnerNotifiedAt, +auctionCheckoutId
- New AuctionCheckout table (mirroring HoldInvoice structure)
- Optional AuctionWinnerHistory table for audit trail
- Indexes on winnerId, auctionClosedAt

### Backend
- auctionController: close auction, determine winner, create checkout
- auctionCloseJob: cron to auto-close expired auctions
- stripeController: unified checkout session creation
- Webhooks: handle auction checkout completion
- Notifications: sendAuctionWonEmail() + in-app Notification

### Frontend
- /purchases/{purchaseId}: persistent confirmation page
- items/{itemId}: AuctionCheckoutCard for won items awaiting payment
- Notifications: show "You won!" badge and payment link

### API Endpoints
- POST /api/auctions/{itemId}/close (manual)
- GET /api/auctions/{itemId}/winner (status check)
- GET /api/checkouts/auction/{id} (fetch checkout)
- Enhanced Stripe endpoints to support auction source

---

**Status:** Ready for Patrick review and technical decision input.
**Next step:** Patrick confirms #80 + #174 merge vs. separate, then dispatch to findasale-dev for implementation.
