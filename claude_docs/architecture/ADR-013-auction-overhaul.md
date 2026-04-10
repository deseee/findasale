# ADR-013: Auction System Overhaul

**Status:** PROPOSED
**Date:** 2026-04-10
**Owner:** FindA.Sale Architect

---

## Context

FindA.Sale auctions exist in a fragmented state. The schema includes auction fields (`auctionStartPrice`, `auctionReservePrice`, `currentBid`, `bidIncrement`, `auctionEndTime`, `auctionClosed`), a `Bid` model with status tracking, and socket-based live bidding, but the implementation is incomplete and production-risky:

- **Reserve prices are accepted but never validated** — items sell below reserve with no user visibility
- **Auctions don't auto-close** — the `auctionClosed` flag exists but is never set; bids accepted past deadline
- **Outbid bidders receive no notification** — displaced high bidder has no idea they lost
- **Bid increment is hardcoded to $1** — no professional tiering (eBay uses scaled increments)
- **No proxy/max bidding** — users must manually re-bid to win; UX is hostile vs. competing platforms
- **No bid history display** — opacity reduces buyer confidence
- **Sniping is unrestricted** — hard deadline at auctionEndTime allows last-second bids to win without warning
- **No buyer premium transparency** — 5% fee is hardcoded with no seller control or front-end visibility

This ADR defines a two-phase implementation:

- **Phase 1 (P0):** Fix the broken fundamentals (reserve enforcement, auto-close, outbid notifications). No schema migration needed. Ships first.
- **Phase 2 (P1):** Implement professional features (proxy bidding, dynamic increments, soft-close, bid history, status badge). Requires one migration.

---

## Phase 1: P0 Fixes (No Schema Migration)

### 1.1 Reserve Price Enforcement

**Decision:** Add validation in `placeBid` (backend). Do NOT change schema.

**What's broken:**
- `item.auctionReservePrice` exists but is never checked in `itemController.ts:placeBid`
- Organizer sets reserve = $100, but if a bidder offers $50, it's accepted and the item "wins"

**Implementation:**
- **File:** `packages/backend/src/controllers/itemController.ts:placeBid` (~line 861)
- **Change:** After validating bid amount >= minimumBid, add check:
  ```typescript
  if (item.auctionReservePrice && bidAmount < item.auctionReservePrice) {
    return res.status(400).json({
      message: `Bid must be at least $${item.auctionReservePrice.toFixed(2)} to meet reserve`,
      minimumBid: Math.max(minimumBid, item.auctionReservePrice),
      currentBid: currentHighBid,
      reservePrice: item.auctionReservePrice
    });
  }
  ```
- **Acceptance:** Bidder receives clear error. Reserve price is communicated in response. Bid rejected if below reserve.

### 1.2 Reserve Status Display (Frontend)

**Decision:** Add reserve-met indicator on item detail page.

**What's missing:**
- Shopper sees `currentBid: $50` and `auctionReservePrice: $100` but no label saying "Reserve not met"
- Uncertainty suppresses bids

**Implementation:**
- **File:** `packages/frontend/pages/items/[id].tsx`
- **Change:** After fetching item, compute `reserveMet = item.currentBid >= item.auctionReservePrice`
- **Render:** Add badge above BidModal:
  ```tsx
  {item.auctionReservePrice && (
    <div className={`text-sm font-medium mb-3 ${
      reserveMet ? 'text-green-600' : 'text-amber-600'
    }`}>
      {reserveMet ? '✓ Reserve met' : `Reserve: $${item.auctionReservePrice.toFixed(2)} (not met)`}
    </div>
  )}
  ```
- **Acceptance:** Shopper sees "Reserve: $100 (not met)" in red until currentBid >= 100, then "✓ Reserve met" in green.

### 1.3 Auto-Close at Deadline

**Decision:** Implement cleanup endpoint + cron OR call on item fetch.

**What's broken:**
- `item.auctionClosed` is never set to `true`
- Organizer closes auction manually (if at all) or it stays open indefinitely
- Bids are accepted hours after auctionEndTime passes

**Implementation:**

**Option A (Recommended):** Lazy close on fetch
- **File:** `packages/backend/src/controllers/itemController.ts:getItemById` (~line 620)
- **Change:** After fetching item, if `auctionEndTime < now` and `!auctionClosed`, set `auctionClosed = true` and update DB:
  ```typescript
  if (item.auctionEndTime && new Date(item.auctionEndTime) < new Date() && !item.auctionClosed) {
    await prisma.item.update({
      where: { id: itemId },
      data: { auctionClosed: true }
    }).catch(err => console.warn('[getItemById] Failed to auto-close auction:', err));
    item.auctionClosed = true;
  }
  ```
- **Frontend check:** `BidModal` button hides if `auctionClosed || auctionEndTime < now`

**Option B (Parallel):** Add cron job or cleanup endpoint
- Call `/api/items/close-expired-auctions` nightly
- Scans all items where `auctionEndTime < now AND !auctionClosed`
- Sets `auctionClosed = true` and fires winner notifications (Phase 1.4)
- Useful for notifying winners without waiting for next page load

**Acceptance:** Bid submission rejected with clear message if `auctionClosed === true`. No auction stays open past its deadline.

### 1.4 Outbid Notifications

**Decision:** Notify displaced bidder when they are outbid. Use existing `createNotification` service.

**What's missing:**
- User places bid of $50, is winning
- Another bidder places $75
- Original bidder gets no alert they've been outbid
- Organizer sends confusing messages like "your bid lost" with no context

**Implementation:**
- **File:** `packages/backend/src/controllers/itemController.ts:placeBid` (~line 900)
- **Change:** Before creating the new bid, find the previous high bidder:
  ```typescript
  // Get the previous winning bid (before this new one)
  const previousHighBid = item.bids.length > 0 ? item.bids[0] : null;
  
  // Create the new bid
  const bid = await prisma.bid.create({
    data: { itemId, userId: req.user.id, amount: bidAmount }
  });
  
  // Notify displaced bidder
  if (previousHighBid && previousHighBid.userId !== req.user.id) {
    createNotification(
      previousHighBid.userId,
      'OUTBID',
      'You Were Outbid',
      `You were outbid on ${item.title}. New bid: $${bidAmount.toFixed(2)}. Place another bid to win!`,
      `/items/${itemId}`,
      'OPERATIONAL'
    ).catch(err => console.warn('[placeBid] Failed to notify outbid:', err));
  }
  ```
- **Acceptance:** Previous high bidder receives notification (in-app + email if opted in). Text includes item name, new bid amount, and link to bid again.

---

## Phase 2: P1 Professional Features (Schema Migration Required)

### 2.1 Proxy / Max Bidding

**Decision:** Add `maxBidByUser` table to store each bidder's max amount. Backend auto-bids incrementally.

**Why needed:** 
- eBay/Temu standard: bidder sets max, system auto-bids up to max
- Current: user must manually re-bid or lose to sniper
- Business impact: Longer auction durations (more engagement), higher final prices (less snipe-winner dynamics)

**Schema Migration:**
```sql
-- Create proxy bid tracker
CREATE TABLE "MaxBidByUser" (
  "id" TEXT PRIMARY KEY,
  "itemId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "maxAmount" FLOAT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL,
  UNIQUE("itemId", "userId"),
  FOREIGN KEY ("itemId") REFERENCES "Item"(id) ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);
```

**Prisma Schema Addition:**
```prisma
model MaxBidByUser {
  id        String   @id @default(cuid())
  itemId    String
  userId    String
  maxAmount Float
  item      Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([itemId, userId])
}
```

**Backend `placeBid` Logic:**
1. Bidder submits `{ bidAmount: 150 }` (their max)
2. Calculate what they should bid now: `currentBid + bidIncrement = $50 + $5 = $55`
3. Create bid for $55 if no higher proxy exists
4. Store `maxBidByUser = $150`
5. If another bidder comes in with max $120:
   - Auto-bid first bidder to $125 (if $120 + increment > current)
   - Return error: "Proxy bidder has outbid you. Your max: $150. Current winning bid: $125."

**Frontend:**
- BidModal changes: replace "Your bid" with "Maximum bid"
- Explain: "We'll bid on your behalf up to this amount"
- Display auto-bid schedule if applicable

**Acceptance:** Bidder sets max $200 once. System auto-bids against other proxies. Bidder sees they're winning without manual re-bids. Outbid notifications still fire.

### 2.2 Dynamic Bid Increment Table

**Decision:** Implement eBay-style tiered increments in shared utility. No schema change.

**Current state:** `bidIncrement` is hardcoded $1 always.

**Implementation:**
- **File:** `packages/shared/src/utils/bidIncrement.ts` (new file)
- **Export function:**
  ```typescript
  export function calculateBidIncrement(currentBid: number): number {
    // eBay-style tiers
    if (currentBid < 1) return 0.05;
    if (currentBid < 5) return 0.25;
    if (currentBid < 25) return 0.50;
    if (currentBid < 100) return 1.00;
    if (currentBid < 250) return 2.50;
    if (currentBid < 500) return 5.00;
    if (currentBid < 1000) return 10.00;
    if (currentBid < 2500) return 25.00;
    if (currentBid < 5000) return 50.00;
    return 100.00;
  }
  ```
- **Usage in backend:** Replace `item.bidIncrement || 1` with `calculateBidIncrement(currentHighBid)`
- **Usage in frontend:** Replace `item.bidIncrement ?? 1` with same function
- **Acceptance:** Minimum bid for $50 item is $51, for $500 item is $505, for $1000 item is $1010. Clear and professional.

### 2.3 Bid History Display

**Decision:** Add bid log endpoint + component on item detail page.

**Implementation:**

**Backend:**
- **File:** `packages/backend/src/controllers/itemController.ts`
- **Endpoint:** Already exists at `GET /api/items/:id/bids` (getBids function)
- **Enhancement:** Add `status` field to response (WINNING / OUTBID / LOST)
- **Logic:**
  ```typescript
  const bids = await prisma.bid.findMany({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, name: true } } }
  });
  
  // Mark winning bid
  const currentHighBid = bids[0];
  return bids.map(b => ({
    ...b,
    status: b.id === currentHighBid?.id ? 'WINNING' : 'OUTBID'
  }));
  ```

**Frontend:**
- **File:** `packages/frontend/pages/items/[id].tsx` or new `BidHistory.tsx` component
- **Render below current bid:**
  ```tsx
  <div className="mt-6 border-t pt-4">
    <h3 className="font-bold text-sm mb-3">Bid History</h3>
    <div className="space-y-2 max-h-48 overflow-y-auto">
      {bidHistory.map((bid, idx) => (
        <div key={bid.id} className="flex justify-between text-sm">
          <span className="text-warm-600">
            {bid.bidderName}
            {bid.status === 'WINNING' && <span className="ml-1 text-green-600 font-bold">✓ Winning</span>}
            {bid.status === 'OUTBID' && <span className="ml-1 text-warm-400">Outbid</span>}
          </span>
          <span className="font-medium">${bid.amount.toFixed(2)}</span>
        </div>
      ))}
    </div>
  </div>
  ```
- **Acceptance:** Shopper sees all bids in reverse chronological order, with "Winning" badge on current high bid. Builds trust (transparency).

### 2.4 Soft-Close / Time Extension

**Decision:** Extend auction by 5 minutes if bid placed in final 5 minutes.

**Why needed:** Prevents sniping. Standard on all major auction platforms.

**Schema Change:** Add `originalEndTime` (DateTime?) to Item to track extensions.

**Implementation:**
- **File:** `packages/backend/src/controllers/itemController.ts:placeBid`
- **Logic after bid creation:**
  ```typescript
  const timeToEnd = item.auctionEndTime?.getTime() - Date.now();
  const EXTENSION_WINDOW = 5 * 60 * 1000; // 5 minutes
  const EXTENSION_DURATION = 5 * 60 * 1000; // Add 5 minutes
  
  if (timeToEnd && timeToEnd > 0 && timeToEnd < EXTENSION_WINDOW) {
    const newEndTime = new Date(item.auctionEndTime.getTime() + EXTENSION_DURATION);
    await prisma.item.update({
      where: { id: itemId },
      data: { auctionEndTime: newEndTime }
    });
    
    // Notify watchers
    io.to(`item-${itemId}`).emit('auctionExtended', {
      itemId,
      newEndTime,
      reason: 'Bid placed in final 5 minutes'
    });
  }
  ```
- **Frontend:** Display live countdown. When extended, show "Auction extended by 5 minutes" toast.
- **Acceptance:** Bid placed at 2:57 PM on 3:00 PM auction extends deadline to 3:05 PM. All watchers notified. Countdown resets.

### 2.5 Auction Status Badge

**Decision:** Compute status (ACTIVE / ENDING_SOON / ENDED) on item fetch. Display on card and detail page.

**Implementation:**
- **File:** `packages/backend/src/controllers/itemController.ts:getItemById`
- **Logic:**
  ```typescript
  const now = Date.now();
  const endTime = item.auctionEndTime?.getTime() || 0;
  const timeToEnd = endTime - now;
  
  let auctionStatus = 'INACTIVE';
  if (item.listingType === 'AUCTION' && item.auctionEndTime) {
    if (item.auctionClosed) {
      auctionStatus = 'ENDED';
    } else if (timeToEnd <= 0) {
      auctionStatus = 'ENDED'; // Auto-closed
    } else if (timeToEnd < 5 * 60 * 1000) {
      auctionStatus = 'ENDING_SOON';
    } else {
      auctionStatus = 'ACTIVE';
    }
  }
  
  return { ...item, auctionStatus };
  ```
- **Frontend:** On item card and detail:
  ```tsx
  {item.auctionStatus === 'ACTIVE' && (
    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">Active</span>
  )}
  {item.auctionStatus === 'ENDING_SOON' && (
    <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded">Ending Soon</span>
  )}
  {item.auctionStatus === 'ENDED' && (
    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded">Ended</span>
  )}
  ```
- **Acceptance:** Shopper sees ACTIVE in green, ENDING_SOON in orange with countdown, ENDED in gray. Clear auction state at a glance.

### 2.6 Buyer Premium Configuration

**Decision:** Move hardcoded 5% buyer premium to organizer settings. Validate in itemController.

**Why needed:** TEAMS tier organizers want flexibility (or to disable it). Enterprise needs custom premiums. Currently hardcoded with no transparency.

**Schema Change:** Add `buyerPremiumPercent` (Float, default 5.0) to Organizer model.

**Implementation:**
- **File:** `packages/backend/src/controllers/itemController.ts:placeBid`
- **After bid creation:**
  ```typescript
  const organizer = await prisma.organizer.findUnique({
    where: { userId: item.sale.organizer.userId },
    select: { buyerPremiumPercent: true }
  });
  
  const premium = (bidAmount * (organizer?.buyerPremiumPercent ?? 5) / 100);
  const totalCost = bidAmount + premium;
  
  // Return to frontend
  res.status(201).json({
    ...bid,
    buyerPremium: premium,
    totalCost: totalCost
  });
  ```
- **Frontend:** In BidModal, show breakdown:
  ```tsx
  Your bid:        $${bid}
  Buyer premium:   $${premium.toFixed(2)} (5%)
  Total cost:      $${totalCost.toFixed(2)}
  ```
- **Acceptance:** Shopper sees all-in cost before placing bid. Organizer can set premium in settings. Builds trust.

---

## Implementation Order (Dev Checklist)

Dev will execute in this exact sequence to avoid knock-on failures:

### Phase 1 Sequence
1. **1.1 Reserve enforcement** — Edit `itemController.ts:placeBid` (~line 861), add reserve check
2. **1.3 Auto-close (Option A)** — Edit `itemController.ts:getItemById`, add lazy-close logic
3. **1.2 Reserve status display** — Edit `pages/items/[id].tsx`, add reserve-met badge
4. **1.4 Outbid notifications** — Edit `itemController.ts:placeBid` (~line 900), add notification call
5. **1.3 Auto-close (Option B, parallel)** — If time permits, add `/api/items/close-expired-auctions` endpoint
6. **BidModal frontend sync** — Edit `BidModal.tsx`, hide button if `auctionClosed === true`
7. **Test Phase 1:** Smoke test on local: place bid below reserve (fails), place bid meeting reserve (wins), verify outbid notification, verify reserve badge

### Phase 2 Sequence (Blocked by migration)
1. **Schema migration** — Generate and review migration for `MaxBidByUser` and organizer `buyerPremiumPercent`
2. **2.2 Bid increment table** — Create `packages/shared/src/utils/bidIncrement.ts`, export function
3. **2.1 Proxy bidding** — Edit `itemController.ts:placeBid`, add max-bid logic, update `BidModal.tsx` labels
4. **2.3 Bid history** — Enhance `getBids` response with status field, create `BidHistory.tsx` component
5. **2.4 Soft-close** — Edit `itemController.ts:placeBid`, add time-extension logic, add socket emit
6. **2.5 Auction status badge** — Edit `getItemById`, add auctionStatus computation, render badge on item card + detail
7. **2.6 Buyer premium config** — Add `buyerPremiumPercent` to Organizer schema, fetch in `placeBid`, display in BidModal
8. **TypeScript check** — `cd packages/frontend && npx tsc --noEmit --skipLibCheck`
9. **Test Phase 2:** Full auction flow with max bidding, dynamic increments, soft-close, bid history visibility

---

## Knock-On Effects & Sequencing Constraints

**Critical ordering:**
- **1.3 must precede 1.4:** Auto-close sets `auctionClosed = true`, which gates 1.4 winner notifications
- **1.1 must precede 2.1:** Proxy bidding inherits reserve logic from Phase 1. If reserve not enforced, proxy bids can undercut
- **2.2 must precede 2.1 in code review:** Bid increment table is used immediately in Phase 2.1 proxy logic
- **Frontend 1.2 and 1.3 interact:** BidModal button hide logic must check BOTH `auctionClosed` (1.3) and `auctionEndTime` (1.2)

**No backward-compatibility risk:**
- Phase 1 is pure validation + notification adds. No schema change. Existing bids remain valid.
- Phase 2 adds new tables but defaults preserve current behavior (5% premium, no proxy). Bidders opt into proxy.

**Deployment order:**
- Ship Phase 1 first (dev complete → QA → production in one deploy). Reserve enforcement is a must-have before Feature #3 (organizer premium negotiation).
- Phase 2 follows one sprint later. Migration must run on Railway before backend code ships. See CLAUDE.md §6 for migration protocol.

---

## Acceptance Criteria

### Phase 1
- [ ] Bid below reserve is rejected with error message including reserve amount
- [ ] Reserve-met badge displays correctly in red (not met) and green (met)
- [ ] Item with past `auctionEndTime` has `auctionClosed` set to true (verify in DB)
- [ ] Bid submission fails if `auctionClosed === true` with user-friendly error
- [ ] Outbid bidder receives notification with item name, new bid amount, and link to re-bid
- [ ] BidModal button disabled/hidden if auction is closed or deadline passed
- [ ] No auction accepts bids past its deadline

### Phase 2
- [ ] Bidder sets max bid $500, system auto-bids $35 on their behalf as competitors bid up
- [ ] Bid increment scales correctly ($5 increment at $100, $25 at $250, etc.)
- [ ] Bid history displays all bids in reverse chronological order with winning bid marked
- [ ] Bid placed at 4:56 PM on 5:00 PM auction extends deadline to 5:05 PM
- [ ] Auction status badge shows ACTIVE (green), ENDING_SOON (orange), ENDED (gray)
- [ ] Buyer premium % pulled from Organizer settings, displayed in BidModal before placement
- [ ] All six features work together: max bid + dynamic increment + soft-close + history + status + premium

---

## Questions for Patrick

1. **Phase 1 auto-close approach:** Do you prefer lazy close on fetch (cheaper, hidden) or explicit nightly endpoint (more auditable)?
2. **Soft-close extension duration:** Is 5 minutes the right extension? Any organizer feedback on sniping frustration?
3. **Proxy bidding opt-in:** Should this be a seller setting ("Allow proxy bidding") or always-on?
4. **Buyer premium:** Should SIMPLE tier always use 5%, or allow customization starting at PRO?
5. **Bid history anonymity:** Show full bidder names (current plan) or use "Bidder #1, Bidder #2" format?

---

## References

- Current auction code: `packages/backend/src/controllers/itemController.ts` (placeBid ~line 829)
- Frontend bidding: `packages/frontend/components/BidModal.tsx`
- Item detail page: `packages/frontend/pages/items/[id].tsx`
- Notifications: `packages/backend/src/services/notificationService.ts`
- Routes: `packages/backend/src/routes/items.ts` (lines 743–744)
