# ADR — eBay Sync Architecture — 2026-04-14

## Decision

Replace the sequential GetItem enrichment pass (86 items = 86 sequential API calls) with the eBay Shopping API `GetMultipleItems` batch call (max 20 items per call = 5 calls total). Implement Platform Notifications webhooks for real-time order completion events to replace 15-minute polling cron for sold-item sync. Keep GetMyeBaySelling as the primary inventory source (Trading API) because it is the only call that returns ALL active listings regardless of how they were created (Inventory API vs Seller Hub UI).

---

## Current vs Proposed

| Phase | Current Approach | Issues | Proposed |
|-------|------------------|--------|----------|
| **Pass 1: REST Inventory API** | `GET /sell/inventory/v1/inventory_item` | Only returns items created via Inventory API, not Seller Hub (0 items for Patrick) | **Keep as fallback** — try first, fall through if 0 items |
| **Pass 2: Get Listing IDs** | `GetMyeBaySelling` (Trading API, paginated 200/page) | Reliable, works for all creation methods; returns Title, SKU, Price, CurrentPrice, GalleryURL, limited pictures | **Keep unchanged** — this is the gold standard |
| **Pass 3: Enrichment** | `GetItem` × 86 items (100ms delay = ~9 seconds minimum) | Sequential calls; rate-limit risk; slow UX (9+ sec per import) | **Replace with GetMultipleItems batch × 5 calls (~1-2 sec total)** |
| **Ongoing Sold Sync** | Polling cron every 15 min via `GET /sell/fulfillment/v1/order` | 15-min latency; 96 calls/day per organizer; no real-time feedback | **Add Platform Notifications webhooks for real-time ORDER_COMPLETED/ITEM_SOLD events** |

---

## GetItems Batch Spec

### eBay Shopping API — GetMultipleItems (Not Trading API GetItem)

**Why not Trading API GetItem batch?**
Trading API has NO batch call. GetItem requires one ItemID per request. Shopping API's `GetMultipleItems` supports 20 ItemIDs per call and is still part of the legacy-but-stable API family.

**Request (XML):**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetMultipleItemsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials></RequesterCredentials>
  <ItemID>ITEM_ID_1</ItemID>
  <ItemID>ITEM_ID_2</ItemID>
  <!-- ... up to 20 ItemIDs ... -->
  <ItemID>ITEM_ID_20</ItemID>
  <IncludeSelector>Description,ItemSpecifics</IncludeSelector>
</GetMultipleItemsRequest>
```

**HTTP Headers:**
```
POST https://open.api.ebay.com/shopping
X-EBAY-API-CALL-NAME: GetMultipleItems
X-EBAY-API-APP-NAME: (your client ID)
X-EBAY-API-SITEID: 0
X-EBAY-API-COMPATIBILITY-LEVEL: 967
X-EBAY-API-IAF-TOKEN: (OAuth access token)
Content-Type: text/xml
```

**Note on Auth:**
Shopping API uses the same OAuth token flow (X-EBAY-API-IAF-TOKEN) as Trading API. No separate authentication required.

**IncludeSelector Options:**
- `Description` — includes HTML description (slower response)
- `TextDescription` — includes description without HTML tags (better for text-only storage)
- `ItemSpecifics` — includes Item Specifics (Name/Value pairs like Brand, Color, Material)
- Multiple selectors combined: `Description,ItemSpecifics` (comma-separated)

**Response Fields — Confirmed Parity with GetItem:**
GetMultipleItems returns the same ItemType schema as GetItem:
- `Title` — item title (✓ available)
- `Description` — full item description (✓ available with IncludeSelector=Description)
- `PrimaryCategory.CategoryName` — category name (✓ available)
- `ItemSpecifics.NameValueList[].Name` and `[].Value` — attribute values (✓ available with IncludeSelector=ItemSpecifics)
- `PictureDetails.PictureURL` — array of photo URLs (✓ available)
- `ConditionID` — condition code (✓ available)
- `Quantity`, `QuantitySold`, `StartPrice`, `ReservePrice` — auction details (✓ available)

**Data Completeness vs GetItem:**
Shopping API returns the same rich data. The only difference is that GetItem in Trading API supports more specialized fields (e.g., ReturnDetails, ShippingServiceCostSummaryList). For FindA.Sale's use case (title, description, category, tags, photos, condition), GetMultipleItems is 100% sufficient.

**Batch Logic (JavaScript pseudocode):**
```javascript
// Chunk items into batches of 20
const batches = [];
for (let i = 0; i < itemIds.length; i += 20) {
  batches.push(itemIds.slice(i, i + 20));
}

// Execute all batches in sequence (respecting rate limits)
for (const batch of batches) {
  const resp = await shoppingApiCall(batch);
  // Parse and backfill DB
  for (const item of resp.Item) {
    // description, category, tags, photos extracted
  }
}

// 86 items = 5 calls (16, 20, 20, 20, 10)
// Estimated latency: ~1-2 seconds total (vs 9 seconds with GetItem)
```

**Rate Limits:**
Shopping API has generous rate limits (500 calls/hour for basic keys). 5 calls to backfill 86 items is negligible. No delays necessary between calls.

---

## Platform Notifications Assessment

### Current Polling Architecture
- Endpoint: `GET /sell/fulfillment/v1/order`
- Frequency: every 15 minutes (6 calls/hour × 96 calls/day per organizer)
- Latency: 15 minutes (order sold → FindA.Sale learns about it)
- State: Requires `lastEbaySoldSyncAt` timestamp to avoid duplicates
- Reliability: Depends on cron health, can be blocked by network/API issues

### Platform Notifications Alternative
eBay's new **Notification API** (commerce/notification) supports event subscriptions:

**Supported Events for Sold Items:**
- `marketplace.order.paid` — order has been paid (maps to "item sold + checkout complete")
- `marketplace.order.shipped` — fulfillment event (secondary)

**Event Payload** (webhook POST to your HTTPS endpoint):
```json
{
  "metadata": {
    "topic": "marketplace.order.paid",
    "schemaVersion": "1.0",
    "eventId": "...",
    "eventTime": "2026-04-14T12:34:56.000Z"
  },
  "data": {
    "orderId": "string",
    "orderPaymentStatus": "PAID",
    "lineItems": [
      {
        "lineItemId": "string",
        "legacyItemId": "string",
        "sku": "string",
        "title": "string"
      }
    ]
  }
}
```

**Setup Cost:**
- **Development:** Implement HTTPS endpoint that validates X-EBAY-SIGNATURE header and responds with 200/202
- **Deployment:** Endpoint must be public + HTTPS; eBay will POST to it; expect retries on failure
- **Code overhead:** ~200 lines (signature validation + parse + match + mark SOLD)
- **Licensing cost:** Free (included in seller subscription)

**Complexity vs Polling Cron:**
| Aspect | Polling Cron | Webhooks |
|--------|--------------|----------|
| Server-side complexity | Low (fetch + parse) | Medium (signature validation + retries) |
| Latency | 15 min (acceptable) | <1 sec (ideal) |
| Scalability | Fixed cost (5 organizers = 480 calls/day) | Dynamic (only fires on actual sales) |
| Failure mode | Missed syncs if cron down | Retry queue on eBay side; must handle failures gracefully |
| Duplicate handling | Timestamp-based dedup | Event ID–based dedup (idempotent) |

**Viability: YES, but as Phase 2**
- **Phase 1 (Now):** Keep 15-min polling. Reliable, proven, low complexity.
- **Phase 2 (v2.1):** Add webhooks. Improves latency for real-time feedback. Keep polling as fallback.
- **Do we need polling at all with webhooks?** Not if webhook reliability is proven (retry queue on eBay side, idempotent event processing). But hybrid approach (webhooks + fallback cron) is safest for a paid product.

---

## Bidirectional Gaps

### FindA.Sale → eBay (Outbound)

**Currently Implemented:**
- ✓ Push item offer to eBay Inventory API (`POST /sell/inventory/v1/offer`)
- ✓ Create ebayOfferId on item after successful push

**Missing:**
- ❌ Withdraw listing when item marked SOLD on FindA.Sale
  - **Impact:** Item remains active on eBay after organizer marks it sold locally
  - **Fix:** Call `POST /sell/inventory/v1/offer/{offerId}/withdraw` when `item.status = SOLD`
  - **Timing:** On manual mark-SOLD, or on eBay sold-sync notification receipt
- ❌ Sync photos back to eBay if organizer updates item photos
  - **Impact:** eBay listing photos lag behind FindA.Sale
  - **Fix:** Requires eBay Inventory API image endpoints (lower priority)
- ❌ Sync price back to eBay if organizer changes price
  - **Impact:** Price in FindA.Sale differs from eBay (findAsale is source of truth)
  - **Fix:** Update offer price via `POST /sell/inventory/v1/offer/{offerId}` with new price
  - **Timing:** On price change event

**Priority:**
1. **P0:** Withdraw on SOLD (prevents double-sales)
2. **P1:** Sync price on update (data consistency)
3. **P2:** Sync photos on update (visual consistency)

### eBay → FindA.Sale (Inbound)

**Currently Implemented:**
- ✓ Inventory import (Pass 2: GetMyeBaySelling)
- ✓ Enrichment (Pass 3: GetItem — to be replaced with GetMultipleItems)
- ✓ Sold sync (polling cron)

**Missing:**
- ❌ Listen for item revisions (price changes, photo updates, title changes on eBay)
  - **Impact:** FindA.Sale stale when organizer edits listing on eBay.com directly
  - **Fix:** Webhook event `marketplace.item.revised` (if eBay provides it; TBD)
  - **Viability:** Low priority; not part of primary flow (organizers edit in FindA.Sale, not eBay)
- ❌ Handle listing ended/delisted on eBay
  - **Impact:** Item shows AVAILABLE in FindA.Sale but is inactive on eBay
  - **Fix:** Webhook event `marketplace.item.delisted` or poll for inactive listings
  - **Viability:** Low priority; rare scenario

**Priority:**
1. **P1:** Sold sync (webhooks vs polling — Phase 2)
2. **P3:** Item revision sync (out of scope; assumes organizers use FindA.Sale as primary editor)

---

## Fields Never Available From eBay

eBay's API does not provide organizer-specific data that FindA.Sale requires:

| Field | FindA.Sale Use | eBay Availability | Why |
|-------|-----------------|------------------|-----|
| **Lot/Lot Number** | Estate sale lot grouping | ❌ Not available | eBay has no concept of lots; each item is individual |
| **FindA.Sale Tags** | Custom organizer tags (Brand, Era, Condition nuance) | ❌ Not available | eBay's ItemSpecifics are eBay-defined, not custom |
| **Estimated Value** | Organizer's private valuation | ❌ Not available | Not a public eBay field; organizer must enter manually |
| **Reserve Price (Private)** | Organizer's reserve on auction items | ⚠️ Partially available | GetItem returns ReservePrice, but only for auction items, not fixed-price |
| **Quantity Remaining** | Handwritten tally for physical sales | ❌ Not available | eBay tracks quantity sold, not remaining stock count |
| **Local Pickup Notes** | "Item at 123 Main St, pickup Wed 2-5pm" | ❌ Not available | eBay has no location metadata for items |
| **Photos (Organizer-taken)** | Photos taken by FindA.Sale user | ⚠️ Partial | GetItem returns eBay's photos, not organizer's original uploads |
| **Buyer's Name** | Who purchased the item (privacy) | ❌ Not available (intentional) | eBay does not expose buyer PII to seller via API for privacy |
| **Buyer's Address** | Shipping address (privacy) | ⚠️ Limited | GetUserContactDetails excludes street address + email for privacy |
| **Buyer's Feedback** | Prior purchases/reliability | ❌ Not available | eBay feedback retrieval is restricted; requires special agreement |

**Organizer Actions:**
- Pre-sync: Organize items into lots in FindA.Sale (not eBay)
- Post-import: Review and hand-edit tags, condition notes, estimated values
- Post-import: Upload FindA.Sale-native photos (preferred over eBay photos for consistency)

**Data Expectations to Set:**
Sync from eBay fills: `title`, `description`, `photos` (eBay's), `category`, `condition`, `basic tags` (ItemSpecifics).  
Organizer fills: `lot number`, `custom tags`, `local notes`, `estimated value`, `custom photos`, `quantity on hand`.

---

## Dev Instructions (findasale-dev)

**Order:** Execute these as a single feature batch, not separate commits.

### 1. Replace Pass 3 Enrichment with GetMultipleItems Batch

**File:** `packages/backend/src/controllers/ebayController.ts` (lines 1795–1916)

**Changes:**
- Remove the sequential GetItem loop (lines 1818–1915)
- Create a new function `enrichItemsWithShoppingAPI(itemIds, accessToken)`
- Chunk itemIds into batches of 20
- For each batch, POST to Shopping API with `IncludeSelector=TextDescription,ItemSpecifics`
- Parse response (same as GetItem parsing, just loop over Item array instead of one)
- Backfill DB with description, category, tags, photos
- **No rate-limiting delay needed** (Shopping API is generous)
- Log: `[eBay Enrich] Batch N/X: enriched X items in Yms`

**Expected Result:**
- 86 items = 5 calls = ~1–2 seconds total (vs 9+ seconds with GetItem)
- Same data output (description, category, tags, photos)

**Testing:**
- Call with organizer who has 86 items
- Verify all items backfilled with description, category, tags, photos
- Verify no 429 (too many requests) errors
- Verify log shows 5 batch calls, not 86 individual calls

---

### 2. Add P0 Bidirectional Gap: Withdraw Listing on SOLD

**File:** `packages/backend/src/routes/items.ts` (bulk status update endpoint)

**Trigger:** When item status changes to SOLD (either manually by organizer or via eBay sync)

**Logic:**
```javascript
if (item.status === 'AVAILABLE' && newStatus === 'SOLD' && item.ebayOfferId) {
  // Withdraw from eBay
  const accessToken = await refreshEbayAccessToken(item.sale.organizerId);
  const resp = await fetch(
    `https://api.ebay.com/sell/inventory/v1/offer/${item.ebayOfferId}/withdraw`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ marketplaceId: 'EBAY_US' })
    }
  );
  
  if (!resp.ok) {
    console.warn(`Failed to withdraw offer ${item.ebayOfferId}: ${resp.status}`);
    // Do NOT block status change; log and continue
  }
}
```

**File:** `packages/backend/src/jobs/ebaySoldSyncCron.ts` (line 168)

**Change:** When marking item SOLD from eBay sync, also call withdraw:
```javascript
// After marking SOLD, withdraw from eBay
if (matchedItem.ebayOfferId) {
  try {
    await withdrawEbayListing(matchedItem.ebayOfferId, accessToken);
  } catch (err) {
    console.warn(`Failed to withdraw ${matchedItem.ebayOfferId}:`, err.message);
    // Continue — don't block sync
  }
}
```

**Expected Result:**
- Item marked SOLD in FindA.Sale → automatically withdrawn from eBay within seconds
- No double-sales possible (item removed from active listings on eBay)

**Testing:**
- Create a test item, push to eBay, verify ebayOfferId is set
- Mark item SOLD in FindA.Sale
- Verify eBay API withdraw call succeeded (check Railway logs)
- Verify item no longer in eBay active listings

---

### 3. Code Quality Gates (Before Submitting)

**Pre-return checklist:**
- [ ] Read full ebayController.ts. Verify no hidden GetItem calls remain (search: `GetItem`)
- [ ] Read ebaySoldSyncCron.ts. Verify withdraw logic doesn't block main sync
- [ ] Verify all new eBay API calls use `Authorization: Bearer` (REST) not `X-EBAY-API-IAF-TOKEN` (Trading)
- [ ] Run TypeScript check: `cd packages/backend && npx tsc --noEmit --skipLibCheck`
- [ ] Grep for rate-limit delays in new Shopping API code — should be **zero** (Shopping API is fast)
- [ ] Grep for sequential loops calling eBay API — should be **one GetMultipleItems loop only** (batched)

**Return format:**
List all changed files with line ranges. Example:
```
- packages/backend/src/controllers/ebayController.ts (lines 1795–1850, 1900–1920 NEW)
- packages/backend/src/jobs/ebaySoldSyncCron.ts (line 168–180)
- packages/backend/src/routes/items.ts (line 410–430 NEW bulk SOLD handler)
```

---

## Rationale

### Why Shopping API GetMultipleItems over Trading API GetItem?
- Trading API has no batch GetItem. Shopping API was designed for this use case.
- Shopping API is stable, widely used, and returns identical data for FindA.Sale's needs.
- Batch retrieval (20 items/call) vs sequential (1 item/call) is 17x fewer calls.
- No auth changes required — both use OAuth with eBay.

### Why keep GetMyeBaySelling?
- It is the ONLY eBay endpoint that returns ALL active listings created via Seller Hub UI (the majority of Patrick's 86 items).
- Inventory API returns 0 items for Seller Hub listings (confirmed bug in current code).
- GetMyeBaySelling is proven, paginated, and reliable.

### Why webhooks for sold sync are Phase 2?
- Polling cron is proven, simple, and acceptable (15-min latency is fine for organizers).
- Webhooks require HTTPS public endpoint + signature validation. More complexity upfront.
- Hybrid approach (webhooks + fallback cron) is safest for a paid product. Don't skip the cron.
- Event-driven is ideal, but can be added after initial launch proves demand.

### Why withdraw on SOLD is P0?
- Prevents double-sales: organizer marks SOLD in FindA.Sale, item still active on eBay, buyer purchases on eBay = conflict.
- Trivial API call (one line). Low risk.
- Organizer expectation: "If it's sold in my app, it should stop selling elsewhere."

---

## Consequences

### Immediate (After Deployment)
1. **Import Speed:** eBay imports drop from ~30 seconds (3 passes) to ~5 seconds (2 passes + batch enrichment).
2. **User Experience:** Organizers see items imported faster; faster feedback loop.
3. **Bidirectional:** Items withdraw from eBay when marked SOLD, preventing confusion + support tickets.

### Phase 2 (Webhooks)
1. **Real-Time Sync:** Sold items appear in FindA.Sale within 1 second (vs 15 minutes).
2. **Reduced Load:** Cron calls drop from 96/day to 0 (webhooks only). Cron becomes fallback.
3. **Scalability:** Each sale triggers one webhook, not six polling checks.

### Future Considerations
1. **Sync Pricing:** Add `reviseOffer` call when organizer changes price in FindA.Sale → push to eBay.
2. **Photo Sync:** Add image endpoints to keep eBay photos in sync with FindA.Sale uploads.
3. **Item Revision Events:** Monitor eBay for listing edits (not critical; assumes organizers edit in FindA.Sale).

### Risk Mitigation
- **GetMultipleItems response size:** Shopping API responses are smaller than Trading API GetItem. No payload/timeout issues expected.
- **Withdraw failures:** Non-blocking (logged, continue). Item still marked SOLD locally; manual eBay cleanup if needed.
- **Webhook reliability:** Phase 2 will include idempotent event processing + dead-letter queue.

---

## References

- [eBay Shopping API GetMultipleItems](https://developer.ebay.com/devzone/shopping/docs/callref/GetMultipleItems.html)
- [eBay Trading API GetItem vs Shopping API GetMultipleItems](https://forums.developer.ebay.com/questions/28716/getitem-but-for-many-itemids.html)
- [eBay Notification API Overview](https://developer.ebay.com/api-docs/commerce/notification/overview.html)
- [eBay REST Inventory API Documentation](https://developer.ebay.com/api-docs/sell/inventory/overview.html)
- [eBay Fulfillment API Order Retrieval](https://developer.ebay.com/api-docs/sell/fulfillment/overview.html)
- [eBay Trading API GetMyeBaySelling](https://developer.ebay.com/devzone/xml/docs/reference/ebay/GetMyeBaySelling.html)

---

**Document Status:** Ready for dev dispatch  
**Last Updated:** 2026-04-14  
**Owner:** FindA.Sale Architect
