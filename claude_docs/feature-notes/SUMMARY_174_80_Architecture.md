# Quick Summary: #174 Auction Close + #80 Purchase Confirmation Redesign

## The Problem

**#174:** When an auction ends, there's no clear workflow. No winner is notified. No checkout is initiated. The item just sits there.

**#80:** When a shopper buys something, the success confirmation appears for ~5 seconds then disappears. They have no persistent record unless they hunt through their purchase history.

## The Root Cause

Both issues stem from **missing persistence and automation:**
- Auctions have no close mechanism (manual or automatic)
- Purchase confirmation has no dedicated persistent page
- No integration between auction close → winner notification → checkout

## The Solution: Unified Auction Win + Post-Purchase Flow

Merge #174 and #80 into one feature:

1. **Auction closes** (cron fires every 5 min, or organizer clicks "End Auction")
2. **Winner is determined** (highest bid, if reserve met)
3. **Winner is notified** (in-app Notification + email: "You won!")
4. **Checkout is initiated** (Stripe session or HoldInvoice, depending on path)
5. **Winner completes payment** (opens Stripe Checkout, pays, returns)
6. **Persistent confirmation page** shows order details
   - Path: `/purchases/{purchaseId}`
   - Shows item photo, price breakdown, pickup info, organizer contact
   - Shareable, refreshable, persistent
   - Same page for all purchase types (direct, auction, hold-to-pay)

## Key Schema Changes

**Item model:**
- Add `winnerId` (FK to User) — who won this auction
- Add `auctionClosedAt` (DateTime) — when did it close
- Add `auctionWinnerNotifiedAt` (DateTime) — idempotency flag
- Add `auctionCheckoutId` (FK) — link to payment record

**New AuctionCheckout table:**
- Stores auction payment details (like HoldInvoice, but for auctions)
- Tracks status: PENDING → PAID → COMPLETED
- Expires in 7 days if not paid

## API Endpoints (Backend)

New:
- `POST /api/auctions/{itemId}/close` — organizer ends auction manually
- `GET /api/auctions/{itemId}/winner` — check if user won + get checkout link

Modified:
- `POST /api/stripe/checkout-session` — now handles direct + auction + hold-to-pay
- `GET /api/purchases/{purchaseId}` — returns persistent order info

## Frontend Pages (UI)

New/Modified:
- `/purchases/{purchaseId}` — persistent order confirmation page (rename from checkout-success.tsx)
- `/items/{itemId}` — add "You won! Complete payment" card if user is auction winner
- New `AuctionCheckoutCard` component — shows "You won for $X, pay by {date}"

## Implementation Sequence

1. **Schema + migrations** (1 week)
   - Add fields to Item, create AuctionCheckout table, deploy to Railway

2. **Backend** (1 week)
   - auctionController (close auction, determine winner, create checkout)
   - Cron job (auto-close auctions every 5 min)
   - Stripe webhook updates (handle auction checkout completion)
   - Email templates (winner notification)

3. **Frontend** (1 week)
   - Persistent /purchases/{purchaseId} page
   - AuctionCheckoutCard component
   - Item detail page updates (show "You won!" banner)

4. **QA** (1 week)
   - E2E test: auction closes → winner notified → pays → sees confirmation

**Total estimate:** 2.5–3 weeks for full feature (including QA)

## What Gets Reused

**From #221 (Hold-to-Pay):**
- Same `createCheckoutSession` logic in Stripe
- Same webhook handlers (`checkout.session.completed` → status PAID)
- Same HoldInvoice + Stripe integration pattern
- Both are "hold until payment" workflows

**From existing code:**
- `checkout-success.tsx` → rename to `purchases/{purchaseId}`
- `sendReceiptEmail()` → extend for auction context
- Notification system (already built)

## Key Decisions Needed from Patrick

1. **Merge or separate?**
   - Merge #174 + #80 into one 2.5-week feature?
   - Or ship #80 first (quick 1-week win), then #174 (2 weeks)?

2. **Auction winner payment path:**
   - Open Stripe Checkout in new tab? (cleaner UX)
   - Embed in modal? (current pattern)
   - Use Hold-to-Pay invoice? (organizer initiates payment request)

3. **Reserve price not met?**
   - Auto-refund and re-list?
   - Notify organizer, wait for manual action?
   - Allow organizer to "accept lower bid"?

4. **Payment deadline for winner:**
   - 7 days hard limit?
   - 14 days?
   - Extendable by request?

---

**Full spec:** See `SPEC_174_Auction_Close_and_PostPurchase_UX.md` for complete architecture, schema details, and implementation roadmap.

**Ready for:** Dev dispatch once Patrick confirms merge vs. separate and answers the 4 decision questions above.
