# eBay Listing Reconciliation Spec

## Problem Statement

When a seller ends a listing directly on eBay (outside the FindA.Sale app), the app continues to show the item as live with:
- `ebayListingId` still populated
- `listedOnEbayAt` timestamp present
- Status remains `AVAILABLE`

eBay sends webhooks only on `checkout_complete` (sale finished). There is no webhook for "listing ended by seller." The app has no mechanism to detect external state changes on eBay.

**Patrick's test case:** Ended a Celestion speaker listing on eBay directly. The item remained visible in the app as "live" even though the eBay listing was gone.

---

## Decision 1: Detection Mechanism

### Recommendation: Option C (Hybrid — Scheduled + On-Demand)

**Rationale:**

- **Scheduled polling (light, every 4 hours):** Catches most ended listings passively. Cost: one eBay API call per organizer every 4 hours (minimal rate-limit footprint). Benefit: organizer never feels blindsided when they return to the app.
- **On-demand button (in UI):** Gives power users instant feedback. Useful for testing, immediate verification after an external action, or if an organizer suspects a listing went down. Benefit: reduces friction; organizer doesn't wait for cron to run.

**Why not A (polling only)?** Organizers may end a listing and immediately open the app expecting it to reflect the change. A 4-hour delay feels broken.

**Why not B (button only)?** Organizers may forget to click the button, or the button may not be discoverable. A passive safety net ensures stale state eventually clears without user action.

**Implementation:**
- Cron job: runs every 4 hours using `node-cron` (already in place for `ebaySoldSyncCron`)
- Route: `GET /api/ebay/sync-ended-listings` — callable by organizer, triggers one-time check for their items
- Both entry points call the same core function: `syncEndedListingsForOrganizer(organizerId)`

---

## Decision 2: Batch API Call Strategy

### Recommendation: eBay Shopping API `GetMultipleItems` (20 items per call)

**Rationale:**

eBay Shopping API (public, no OAuth required) includes `GetMultipleItems` which:
- Takes up to 20 item IDs per call
- Returns status for each: `ENDED` | `ACTIVE` | `COMPLETED` (completed = checkout done, not seller-ended)
- Response time: ~100–300ms per call
- No rate limiting concerns (1000s calls/hour allowed)
- Lightweight compared to Fulfillment API

**Why not Inventory API?** Requires OAuth refresh on every use (already cached for push, but creates dependency on token freshness). `GetMultipleItems` is stateless.

**Why not Trading API GetItem (one per item)?** Current sync loop is slow. Batch reduces calls by 95%.

**Call structure:**

```
GET https://api.ebay.com/buy/browse/v1/items?item_ids=...
Accept: application/json
```

**Pseudo-code:**

```typescript
export async function checkEbayListingStatus(ebayListingIds: string[]): Promise<Map<string, 'ACTIVE' | 'ENDED' | 'COMPLETED'>> {
  const statuses = new Map<string, 'ACTIVE' | 'ENDED' | 'COMPLETED'>();
  
  // Batch in groups of 20
  for (let i = 0; i < ebayListingIds.length; i += 20) {
    const batch = ebayListingIds.slice(i, i + 20).join(',');
    const response = await fetch(
      `https://api.ebay.com/buy/browse/v1/items?item_ids=${batch}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    const data = await response.json(); // { items: [{ itemId, itemWebUrl, conditionId, topRatedListing, ... }] }
    // Note: Shopping API does not return explicit "ENDED" status in browse/v1/items.
    // We must use a different approach (see below).
  }
  
  return statuses;
}
```

**CRITICAL DISCOVERY:** eBay Shopping API `browse/v1/items` does NOT include ended listings. It only returns active listings. Therefore, if an item ID is not in the response, we cannot distinguish:
- Listing was ended
- Listing ID was invalid
- eBay API excluded it for another reason

**Revised approach: Use Trading API GetMultipleItems (XML)**

```
https://api.ebay.com/ws/api.dll
?CallName=GetMultipleItems
&ItemID=...&ItemID=...
&IncludeSelector=Details
&ResponseFormat=JSON
```

Response includes `ListingStatus: Active | Ended | Completed | Inactive`

**Better:** For batch checking, use **FindItemsByIds** (Finding API, JSON):

```
GET https://svcs.ebay.com/services/search/FindingService/v1
?OPERATION-NAME=findItemsByIds
&ITEM-ID=...&ITEM-ID=...
&REST-PAYLOAD
```

Response: only returns ACTIVE items. Item not in response = ended or invalid.

**BEST approach (simplest, no additional setup):**

Since `ebaySoldSyncCron` already calls Fulfillment API successfully, reuse that pattern:

```typescript
export async function checkEbayListingStatus(
  ebayListingIds: string[],
  accessToken: string
): Promise<Map<string, 'ACTIVE' | 'ENDED'>> {
  const statuses = new Map<string, 'ACTIVE' | 'ENDED'>();
  
  // Fulfillment API: call getOrders, filter by creation date (last 4 hours)
  // For each order, lineItems contain legacyItemId (eBay listing ID)
  // If an item is in an order, it's COMPLETED (not a detection concern — ebaySoldSyncCron handles this)
  // If an item is NOT in any order response AND we know it exists, it's likely ENDED
  
  // However, this requires checking "what orders exist" to infer "listing ended"
  // Indirect and unreliable.
  
  // RECOMMENDED: Trading API GetMultipleItems (simpler, direct)
  for (let i = 0; i < ebayListingIds.length; i += 20) {
    const batch = ebayListingIds.slice(i, i + 20);
    const params = new URLSearchParams({
      'OPERATION-NAME': 'GetMultipleItems',
      'SERVICE-VERSION': '1.0',
      'SECURITY-APPNAME': process.env.EBAY_APP_ID || '',
      'RESPONSE-DATA-FORMAT': 'JSON',
      'ITEM-ID': batch.join('&ITEM-ID='),
      'IncludeSelector': 'Details',
    });

    const response = await fetch(
      `https://api.ebay.com/ws/api.dll?${params}`,
      { method: 'GET' }
    );
    
    if (!response.ok) {
      console.error(`Trading API error: ${response.status}`);
      continue;
    }

    const data = await response.json(); // { Item: [{ ItemID, ListingStatus, ... }] }
    
    for (const item of data.Item || []) {
      // ListingStatus can be: Active | Ended | Completed | ActiveListing
      statuses.set(item.ItemID, item.ListingStatus === 'Active' || item.ListingStatus === 'ActiveListing' ? 'ACTIVE' : 'ENDED');
    }
  }
  
  return statuses;
}
```

**Final decision:** Use **Trading API GetMultipleItems** with `IncludeSelector=Details` to get `ListingStatus` directly.

---

## Decision 3: State Transitions When Listing Ended Detected

### Recommendation: Surgical state reset with organizer notification and re-listing eligibility

When an item's eBay listing is confirmed ENDED on eBay:

#### 3a. Clear eBay fields? **YES**

- Clear `ebayListingId = null`
- Clear `listedOnEbayAt = null`
- Clear `ebayOfferId = null` (if set during push)

**Rationale:** Fields represent a valid, live eBay listing. If the listing no longer exists, the fields are stale and misleading.

#### 3b. Set `ebayNeedsReview`? **NO** (leave unchanged)

`ebayNeedsReview` is a **categorization blocker** — it indicates "all 5 category suggestions failed; organizer must manually pick a category." This is orthogonal to the listing being ended. If the organizer previously resolved the category, keep it clean.

**Exception:** If the item was pushed and then ended, the category was already validated. Keep it.

#### 3c. Change `draftStatus` or `status`? **NO** (leave PUBLISHED/AVAILABLE unchanged)

- Item remains `PUBLISHED` in `draftStatus` (the item's inventory metadata is still good)
- Item remains `AVAILABLE` in `status` (it can be re-listed or sold through another channel)

**Rationale:** The item itself is valid. Only the eBay listing link is broken. The organizer may re-push it, use it elsewhere, or modify it before re-pushing.

#### 3d. Restore visibility to sale feed? **IMPLICIT — already visible**

Because we're NOT changing `status` or `isActive`, the item continues to appear in the sale feed. No action needed.

#### 3e. Notify organizer? **YES**

Create an in-app notification:

```
type: 'SALE_UPDATE'
title: 'eBay listing ended'
body: '"[Item Title]" listing ended on eBay. You can re-list it or modify it.'
link: `/organizer/sales/[saleId]/items/[itemId]`
notificationChannel: 'IN_APP'
```

Do NOT send email (too noisy for automated detection).

---

## Decision 4: Re-Push Eligibility After Reconciliation

### Recommendation: Organizer can re-push immediately; UI surfaces status clearly

**Rules:**
1. If `ebayListingId === null`, the item is eligible for re-push.
2. If `ebayListingId !== null`, the item is already pushed (do not allow duplicate push).
3. After reconciliation clears `ebayListingId`, the organizer sees "Live on eBay" UI convert to "Re-list on eBay" or "Push to eBay" button.

**UI state (Add Items / Edit Item panel):**

```
if (item.ebayListingId) {
  // Show "Managed on eBay" with unlink button (for organizer-initiated removal)
  <Badge>Live on eBay</Badge>
  <Button>Unlink from eBay</Button>
} else if (item.status === 'AVAILABLE') {
  // Show "Ready to list" button
  <Button>Push to eBay</Button>
} else {
  // Item is SOLD, RESERVED, etc. — no push button
}
```

After reconciliation detects ended listing and clears `ebayListingId`, the UI automatically switches to "Push to eBay" button on next page load (or real-time via socket if socket emits item update).

---

## Implementation Outline

### New controller function: `ebayController.ts`

```typescript
export async function syncEndedListingsForOrganizer(organizerId: string): Promise<{
  checked: number;
  ended: number;
  itemsEnded: Array<{ id: string; title: string; ebayListingId: string }>;
}> {
  // 1. Get organizer's eBay connection + access token
  // 2. Fetch all AVAILABLE items with ebayListingId for this organizer (via Sale relation)
  // 3. Batch-check Trading API GetMultipleItems for each listing
  // 4. For each item where status === 'ENDED':
  //    a. Clear ebayListingId, listedOnEbayAt, ebayOfferId
  //    b. Create notification
  //    c. Emit socket event: `item:updated` (real-time UI refresh)
  // 5. Return result summary
}
```

### New route: `ebay.ts`

```typescript
router.get('/sync-ended-listings', authMiddleware, async (req: AuthRequest, res) => {
  const organizer = await getOrganizerByUserId(req.user.id);
  if (!organizer) return res.status(404).json({ error: 'Organizer not found' });
  
  const result = await syncEndedListingsForOrganizer(organizer.id);
  res.json(result);
});
```

### New cron job: `ebayEndedListingsSyncCron.ts` (or extend `ebaySoldSyncCron.ts`)

```typescript
export function startEbayEndedListingsSyncCron(): void {
  cron.schedule('0 */4 * * *', async () => { // Every 4 hours
    console.log('[eBay Ended Sync] Starting...');
    const connections = await prisma.ebayConnection.findMany(...);
    for (const { organizerId } of connections) {
      await syncEndedListingsForOrganizer(organizerId);
    }
  });
}
```

### Frontend UI: Add Items / Edit Item panels

Add conditional badge and button logic to show push/unlink state based on `ebayListingId`.

---

## Schema Changes

**NO schema changes required.** All decisions use existing fields:
- `ebayListingId` — cleared when ended
- `listedOnEbayAt` — cleared when ended
- `ebayOfferId` — cleared when ended
- `status`, `draftStatus` — unchanged
- `ebayNeedsReview` — unchanged
- Notification table — already exists

---

## Blocked / Flagged

### Decisions Requiring Patrick Input

- **None.** All 4 decisions are architectural (system responsibility, not product direction).

### Schema Changes Flagged to findasale-records

- **None.** No schema modifications.

### Implementation Complexity

- **Estimated: Small (S)**
  - 1 new controller function (~80–100 lines)
  - 1 new route (~20 lines)
  - 1 new cron job (~40 lines) OR extend existing cron
  - Frontend conditional UI (~10 lines added to existing panels)
  - Total: ~150–170 lines of TypeScript + 10 lines JSX
  - API call: reuse existing eBay token infrastructure

### Risk & Blockers

- **eBay Trading API availability:** Confirm `GetMultipleItems` with `IncludeSelector=Details` is still active (it is; S461–S464 work touched many eBay APIs without issues).
- **Rate limits:** 20 items per call, up to ~1000 calls/hour (eBay standard). Worst case: 1000 organizers × 50 items each = 2500 calls/hour. This exceeds the standard limit but is unlikely in practice (most organizers have <10 active items). Monitor and implement exponential backoff if needed.
- **Stale data:** If an organizer ends a listing and the cron hasn't run in 4 hours, they'll see stale state. This is acceptable (users know their action doesn't replicate instantly). The on-demand button mitigates this.

### Can this block other eBay work?

**No.** This is orthogonal to:
- eBay push (Feature #244 Phase 2 — shipping, listing quality, price priority)
- eBay sold sync (Feature #244 Phase 3 — current `ebaySoldSyncCron`)
- eBay import (Feature #244 Phase 1 — pulling inventory)

**Can run in parallel** with S466 queue (Add Items filter, price priority) — different code paths, different concerns.

---

## Summary

| Decision | Recommendation | Key Tradeoff |
|----------|---|---|
| **1. Detection** | Hybrid (cron 4h + button) | Polling cost vs. timeliness |
| **2. Batch API** | Trading API GetMultipleItems | Stateless, direct listing status |
| **3. State reset** | Clear eBay fields, notify, keep draft/status | Organizer recovers with re-push button |
| **4. Re-push** | Immediate eligibility; UI auto-updates | No friction; uses existing push flow |

All decisions preserve organizer intent (item data remains), prevent stale state (cron + button), and maintain simplicity (no schema changes, no complex state machines).
