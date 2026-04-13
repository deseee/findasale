# ADR-013 — eBay Phase 2: OAuth + Inventory API Push

**Date:** 2026-04-09  
**Status:** Design Complete — Ready for Dev Dispatch  
**Feature:** #244 (eBay Quick List)  
**Phases:** 2 of 3 (Phase 1: CSV export, Phase 2: Direct API push, Phase 3: Sold sync)  
**Tier Gate:** PRO (direct API push), SIMPLE (CSV export), TEAMS (clean photos free)

---

## Decision

Phase 2 enables organizers to connect their eBay seller account via OAuth 2.0 and push items directly to eBay via the Inventory API. This eliminates the CSV download/upload workflow for PRO tier organizers and creates a stronger retention anchor by associating eBay sales revenue with FindA.Sale.

Architecture:
- **OAuth 2.0 per organizer** (3-legged handshake) → store refresh tokens in `EbayConnection` table
- **Token refresh logic** with Redis cache (production) or in-memory (staging)
- **Push endpoint** `POST /api/organizer/sales/:saleId/ebay-push` accepts items and triggers `createOrReplaceInventoryItem` → `createOffer` → `publishOffer`
- **Preview endpoint** `GET /api/organizer/items/:itemId/ebay-preview` returns pre-filled listing data
- **Status tracking** via new `ebayListingId` field on Item (supports Phase 3 webhook sync)
- **EPN campid embedding** via referral URL in the offer (eBay Inventory API supports this natively)

---

## Schema Changes

### New Model: EbayConnection

```prisma
model EbayConnection {
  id                String   @id @default(cuid())
  
  // Foreign key to organizer
  organizerId       String   @unique
  organizer         Organizer @relation(fields: [organizerId], references: [id], onDelete: Cascade)
  
  // eBay OAuth tokens
  accessToken       String   // 2-hour lifetime, refresh endpoint handles rotation
  refreshToken      String   // 18-month lifetime, stored securely
  tokenExpiresAt    DateTime // When accessToken expires
  
  // eBay seller identity
  ebayUserId        String   // eBay seller username (returned in token response)
  ebayAccountEmail  String?  // Optional: eBay account email for reconciliation
  
  // Metadata
  connectedAt       DateTime @default(now())
  lastRefreshedAt   DateTime @default(now())
  lastErrorAt       DateTime?
  lastErrorMessage  String?
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([organizerId])
  @@index([lastRefreshedAt])
}
```

### Modified Model: Organizer

Add relation to EbayConnection:
```prisma
model Organizer {
  // ... existing fields ...
  
  // Feature #244 Phase 2: eBay OAuth connection
  ebayConnection    EbayConnection?  @relation("OrganizerEbayConnection")
  
  // ... rest of fields ...
}
```

Update Organizer schema line ~282 to add:
```prisma
  ebayConnection    EbayConnection?  @relation("OrganizerEbayConnection")
```

### Modified Model: Item

Add eBay listing tracking:
```prisma
model Item {
  // ... existing fields ...
  
  // Feature #244 Phase 2: eBay listing tracking
  ebayListingId     String?          // eBay listing ID after successful publish; used for Phase 3 sync
  listedOnEbayAt    DateTime?        // Timestamp when item was pushed to eBay
  
  // ... rest of fields ...
  
  @@index([ebayListingId])
}
```

---

## Migration Plan

### Migration File: `[timestamp]_add_ebay_connection.sql`

**Up:**
```sql
-- Create EbayConnection table
CREATE TABLE "EbayConnection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizerId" TEXT NOT NULL UNIQUE,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "ebayUserId" TEXT NOT NULL,
  "ebayAccountEmail" TEXT,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastRefreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastErrorAt" TIMESTAMP(3),
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EbayConnection_organizerId_fkey" 
    FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EbayConnection_organizerId_idx" ON "EbayConnection"("organizerId");
CREATE INDEX "EbayConnection_lastRefreshedAt_idx" ON "EbayConnection"("lastRefreshedAt");

-- Add ebayListingId and listedOnEbayAt to Item table
ALTER TABLE "Item" ADD COLUMN "ebayListingId" TEXT;
ALTER TABLE "Item" ADD COLUMN "listedOnEbayAt" TIMESTAMP(3);
CREATE INDEX "Item_ebayListingId_idx" ON "Item"("ebayListingId");
```

**Down:**
```sql
-- Drop indexes
DROP INDEX IF EXISTS "Item_ebayListingId_idx";
DROP INDEX IF EXISTS "EbayConnection_lastRefreshedAt_idx";
DROP INDEX IF EXISTS "EbayConnection_organizerId_idx";

-- Drop columns from Item
ALTER TABLE "Item" DROP COLUMN IF EXISTS "listedOnEbayAt";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "ebayListingId";

-- Drop EbayConnection table
DROP TABLE IF EXISTS "EbayConnection";
```

### Rollback Plan

If migration fails at deployment:
1. Check Railway DB logs for constraint violations or syntax errors
2. If foreign key conflict: verify no orphaned Organizer records; if found, delete before retry
3. Rerun `npx prisma migrate deploy` on Railway with corrected SQL
4. If rollback needed: `npx prisma migrate resolve --rolled-back [migration_name]`

---

## API Contracts

### 1. OAuth Connect Flow

**Endpoint:** `GET /api/ebay/connect`

**Purpose:** Redirect organizer to eBay OAuth authorization page

**Request:**
```
GET /api/ebay/connect
Authorization: Bearer [JWT]
```

**Response (redirect):**
```
302 Location: https://auth.ebay.com/oauth2/authorize?
  client_id=[EBAY_CLIENT_ID]
  &redirect_uri=[EBAY_OAUTH_REDIRECT_URI]
  &response_type=code
  &scope=https://api.ebay.com/oauth/api_scope/sell.inventory
  &state=[csrf_token]
  &prompt=login
```

**State Parameter:** Include CSRF token in state; validate on callback.

---

### 2. OAuth Callback Handler

**Endpoint:** `GET /api/ebay/callback`

**Purpose:** Exchange authorization code for access + refresh tokens; store in EbayConnection

**Request:**
```
GET /api/ebay/callback?code=[auth_code]&state=[csrf_token]
Authorization: Bearer [JWT]
```

**Response:**
```json
{
  "success": true,
  "ebayUserId": "seller123",
  "connectedAt": "2026-04-09T10:30:00Z",
  "redirectTo": "/organizer/settings#ebay"
}
```

**Error (no authorization):**
```json
{
  "success": false,
  "error": "OAUTH_FAILED",
  "message": "eBay authorization denied"
}
```

**Backend Steps:**
1. Validate state token (CSRF check)
2. POST to `https://api.ebay.com/identity/v1/oauth2/token` with code, client_id, client_secret
3. Parse response for `access_token`, `refresh_token`, `expires_in`
4. Extract `ebay_user_id` from token via JWT decode (optional; if not present, make a call to eBay user endpoint)
5. Upsert `EbayConnection` with access/refresh tokens and expiry time
6. Return success and redirect URL

---

### 3. Token Refresh (Internal Helper)

**Function:** `refreshEbayToken(organizerId: string): Promise<string>`

**Purpose:** Refresh access token if expired; called transparently before every API call

**Logic:**
```
if (connection.tokenExpiresAt > now + 5min):
  return cached accessToken
else:
  POST /identity/v1/oauth2/token with refresh_token
  update connection.accessToken, connection.tokenExpiresAt, connection.lastRefreshedAt
  return new accessToken
```

**Token Cache:** 
- **Production:** Redis key `ebay:token:{organizerId}` with TTL = min(tokenExpiresAt - now, 1 hour)
- **Staging:** In-memory cache (same as Phase 1 approach in ebayController.ts)

---

### 4. Disconnect eBay Account

**Endpoint:** `DELETE /api/ebay/connection`

**Purpose:** Revoke eBay OAuth and delete EbayConnection

**Request:**
```
DELETE /api/ebay/connection
Authorization: Bearer [JWT]
```

**Response:**
```json
{
  "success": true,
  "message": "eBay account disconnected"
}
```

**Backend Steps:**
1. Verify organizer owns the connection
2. Call eBay revocation endpoint (optional; eBay doesn't require explicit revocation, but recommended)
3. Delete EbayConnection record
4. Clear Redis cache for this organizer's token (if Redis used)

---

### 5. Check Connection Status

**Endpoint:** `GET /api/ebay/connection`

**Purpose:** Frontend can check if organizer has eBay connected and get summary

**Request:**
```
GET /api/ebay/connection
Authorization: Bearer [JWT]
```

**Response (connected):**
```json
{
  "connected": true,
  "ebayUserId": "seller123",
  "connectedAt": "2026-04-05T12:00:00Z",
  "lastRefreshedAt": "2026-04-09T08:15:00Z",
  "error": null
}
```

**Response (not connected):**
```json
{
  "connected": false,
  "ebayUserId": null,
  "connectedAt": null,
  "error": null
}
```

**Response (error state):**
```json
{
  "connected": true,
  "ebayUserId": "seller123",
  "connectedAt": "2026-04-05T12:00:00Z",
  "lastRefreshedAt": "2026-04-09T08:15:00Z",
  "error": "TOKEN_REFRESH_FAILED",
  "errorMessage": "Invalid refresh token — reconnect required"
}
```

---

### 6. Push Items to eBay (Main Feature Endpoint)

**Endpoint:** `POST /api/organizer/sales/:saleId/ebay-push`

**Purpose:** Push selected items to eBay; creates inventory items, offers, and publishes

**Request:**
```json
{
  "itemIds": ["item-123", "item-456"],
  "photoMode": "watermark" | "clean"
}
```

**Response:**
```json
{
  "results": [
    {
      "itemId": "item-123",
      "sku": "FAS-item-123",
      "ebayListingId": "123456789",
      "status": "success",
      "ebayUrl": "https://www.ebay.com/itm/123456789",
      "publishedAt": "2026-04-09T10:45:00Z"
    },
    {
      "itemId": "item-456",
      "sku": "FAS-item-456",
      "ebayListingId": null,
      "status": "error",
      "error": "INVALID_CATEGORY",
      "message": "Category 'Unknown' not mapped to eBay category ID"
    }
  ],
  "summary": {
    "total": 2,
    "success": 1,
    "failed": 1
  }
}
```

**Backend Steps:**

1. **Auth & Validation**
   - Verify user is organizer of the sale
   - Check organizer tier ≥ PRO
   - Verify eBay connection exists and is valid (refresh token if needed)

2. **Fetch Items**
   - Query items by ID and saleId
   - Load: title, description, price, category, conditionGrade, photoUrls, estimatedValue, aiSuggestedPrice

3. **For Each Item:**

   a. **Create Inventory Item** (eBay Inventory API)
   ```
   POST https://api.ebay.com/sell/inventory/v1/inventory_item/{sku}
   
   Body:
   {
     "product": {
       "title": "item.title (max 80 chars)",
       "description": "item.description (max 4000 chars, strip HTML)",
       "imageUrls": [
         "https://cloudinary.com/photo.jpg",
         ... (all photoUrls, watermarked based on photoMode)
       ],
       "aspects": { ... item.tags as key-value map ... }
     },
     "condition": "LIKE_NEW" (from mapConditionGradeToEbayCategoryId),
     "availability": {
       "shipToLocationAvailability": [
         {
           "quantity": 1,
           "locationKey": "DEFAULT"
         }
       ]
     }
   }
   ```

   b. **Create Offer** (eBay Inventory API)
   ```
   POST https://api.ebay.com/sell/inventory/v1/offer
   
   Body:
   {
     "sku": "FAS-{itemId}",
     "listingDescription": "item.description",
     "pricingSummary": {
       "price": {
         "currency": "USD",
         "value": "item.aiSuggestedPrice || item.estimatedValue || 0.99"
       }
     },
     "categoryId": "getEbayCategoryId(item.category)",
     "condition": "LIKE_NEW",
     "listingDuration": "GTC", // Good till cancelled
     "listingPolicies": {
       "paymentPolicyId": "[organizer's default payment policy]",
       "fulfillmentPolicyId": "[organizer's default fulfillment policy]",
       "returnPolicyId": "[organizer's default return policy]"
     },
     "referralUrl": "https://www.ebay.com/?campid=5339148447" // EPN campid
   }
   ```

   c. **Publish Offer** (eBay Inventory API)
   ```
   POST https://api.ebay.com/sell/inventory/v1/offer/{offerId}/publish
   ```

   d. **Handle Response**
   - If success: extract ebayListingId from response
   - Update Item.ebayListingId and Item.listedOnEbayAt
   - Add to results array with status: success

   e. **Handle Error**
   - Log error code (e.g., INVALID_CATEGORY, POLICY_NOT_FOUND, INVENTORY_CONFLICT)
   - Add to results array with status: error and message

4. **Return Summary**
   - Build response with all individual results
   - Include item count totals

---

### 7. eBay Preview Endpoint

**Endpoint:** `GET /api/organizer/items/:itemId/ebay-preview`

**Purpose:** Frontend shows what the eBay listing will look like before push

**Request:**
```
GET /api/organizer/items/:itemId/ebay-preview?photoMode=watermark
Authorization: Bearer [JWT]
```

**Response:**
```json
{
  "itemId": "item-123",
  "sku": "FAS-item-123",
  "title": "Mahogany Dining Table, 60x36",
  "description": "Mid-century dining table in excellent condition...",
  "price": 149.99,
  "conditionId": "3000",
  "conditionLabel": "Like New",
  "categoryId": "11400",
  "categoryLabel": "Furniture > Dining Tables",
  "photos": [
    "https://cloudinary.com/photo.jpg?overlay=watermark"
  ],
  "aspects": {
    "Material": "Wood",
    "Vintage": "Yes"
  },
  "ebayUrl": null, // Only populated if item already listed (ebayListingId exists)
  "alreadyListed": false
}
```

**Backend Steps:**
1. Fetch item and validate ownership
2. Build preview payload from item fields
3. Map condition grade to eBay condition label
4. Map category to eBay category label (lookup table)
5. Apply watermark/clean to photo URLs based on photoMode
6. Return preview payload

---

## EPN Campid Integration

**eBay Partner Network (EPN) Campaign ID:** `5339148447`

**Integration Mechanism:**

eBay Inventory API's `createOffer` endpoint accepts a `referralUrl` field in the offer body. This field is included in the listing and is used by eBay's EPN tracking system to attribute the sale.

**Implementation:**

In the `createOffer` call (step 6b above):
```json
{
  "referralUrl": "https://www.ebay.com/?campid=5339148447"
}
```

When a buyer on eBay clicks through and purchases the listing, eBay's tracking system recognizes the `campid` parameter and fires a conversion event to EPN, crediting FindA.Sale's affiliate account.

**Alternative (backup):** If eBay's `referralUrl` field doesn't properly pass the campid, embed it in the listing description:
```
"listingDescription": "... [item description] ... (Listed via FindA.Sale - Estate Sale Software)"
```

Then track via click-through reporting in EPN dashboard. However, the `referralUrl` approach is preferred and is the official eBay method.

**Confirmation:** Architect to confirm exact field name and format with eBay API docs (Inventory API v1 createOffer reference).

---

## Dev Instructions (Ordered)

### Step 1: Add Migration & Schema Changes

1. Read `packages/database/prisma/schema.prisma` in full
2. Add `EbayConnection` model (after Item model definition)
3. Add relation to Organizer: `ebayConnection EbayConnection? @relation("OrganizerEbayConnection")`
4. Add to Item: `ebayListingId String?` and `listedOnEbayAt DateTime?`
5. Create migration file: `[timestamp]_add_ebay_connection.sql` with up/down SQL
6. Verify file syntax (no typos in table/field names, correct foreign key constraint)
7. Stage: `git add packages/database/prisma/schema.prisma [migration file]`
8. Do NOT push — will push with full feature batch

### Step 2: Implement OAuth Controller

**File:** `packages/backend/src/controllers/ebayController.ts`

1. Add new functions:
   - `connectEbayAccount(req, res)` — redirect to eBay OAuth authorization URL
   - `ebayOAuthCallback(req, res)` — exchange code for tokens, store in EbayConnection
   - `checkEbayConnection(req, res)` — return connection status
   - `disconnectEbayAccount(req, res)` — revoke and delete connection
   - `refreshEbayAccessToken(organizerId)` — internal helper (called transparently before API calls)

2. OAuth flow:
   - Use environment variables: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_OAUTH_REDIRECT_URI`
   - Generate CSRF token (crypto.randomBytes) and store in session or short-lived DB record
   - Validate CSRF on callback before token exchange
   - POST to eBay token endpoint; handle error cases
   - Upsert EbayConnection; handle constraint violations

3. Token refresh:
   - Check expiry before every API call (helper function)
   - If expiry < 5 min away, refresh via eBay token endpoint
   - Update EbayConnection.accessToken, tokenExpiresAt, lastRefreshedAt
   - Cache result (Redis in prod, in-memory in staging)

4. Error handling:
   - Log failed token refreshes to EbayConnection.lastErrorAt, lastErrorMessage
   - Return 401 if connection is in error state and refresh fails

### Step 3: Implement Push Endpoint & Inventory API Integration

**File:** `packages/backend/src/controllers/ebayController.ts`

1. Add function: `pushSaleToEbay(req, res)`

2. Validation:
   - Verify user is organizer of sale
   - Check organizer.subscriptionTier >= PRO
   - Verify EbayConnection exists and is valid (call refreshEbayAccessToken)

3. For each item:
   - Call `createOrReplaceInventoryItem` (eBay API)
   - Call `createOffer` (eBay API)
   - Call `publishOffer` (eBay API)
   - On success: update Item.ebayListingId, Item.listedOnEbayAt; add to results
   - On error: log error; add to results with error details

4. Return results array with summary

5. TypeScript checks:
   ```bash
   cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS"
   ```

### Step 4: Implement Preview Endpoint

**File:** `packages/backend/src/controllers/ebayController.ts`

1. Add function: `getEbayPreview(req, res)`

2. Fetch item and validate ownership
3. Build preview payload from item fields
4. Apply watermark/clean to photos based on query param
5. Return preview JSON

### Step 5: Add Routes

**File:** `packages/backend/src/routes/ebay.ts`

```typescript
// OAuth flow
router.get('/connect', requireAuth, connectEbayAccount);
router.get('/callback', requireAuth, ebayOAuthCallback);

// Connection management
router.get('/connection', requireAuth, checkEbayConnection);
router.delete('/connection', requireAuth, disconnectEbayAccount);

// Push & Preview
router.post('/organizer/sales/:saleId/ebay-push', requireAuth, pushSaleToEbay);
router.get('/organizer/items/:itemId/ebay-preview', requireAuth, getEbayPreview);

// Existing account deletion endpoints (already in place)
router.get('/account-deletion', handleEbayAccountDeletionVerification);
router.post('/account-deletion', handleEbayAccountDeletion);
```

### Step 6: Implement Frontend Settings Page (Subagent)

**Context for dev dispatch:**

The frontend organizer settings page should include an "eBay Account" section:
- Status: "Connected as seller123" or "Not connected"
- If connected:
  - Display connected date
  - Show [Disconnect] button (calls DELETE /api/ebay/connection)
  - Show last token refresh time
- If not connected:
  - Show [Connect eBay Account] button (redirects to GET /api/ebay/connect)
- If error state (lastErrorMessage populated):
  - Show warning badge
  - Display error message
  - Show [Reconnect] button

**Note:** Frontend dev will also need to update the item export UI to switch between CSV and direct push endpoints depending on whether eBay is connected and organizer tier.

### Step 7: Database Deployment & Generate Client

Patrick executes (on Railway):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

### Step 8: TypeScript Check & Compile

Before returning:
```bash
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
```

Zero errors required.

### Step 9: List All Changed Files

Return explicit list:
```
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/[timestamp]_add_ebay_connection/migration.sql
packages/backend/src/controllers/ebayController.ts (new functions added)
packages/backend/src/routes/ebay.ts (new routes added)
packages/frontend/src/pages/OrganizerSettings/EbayConnection.tsx (new component)
packages/frontend/src/hooks/useEbayConnection.ts (new hook)
```

---

## Flagged for Patrick

1. **eBay Developer Credentials:** Need to register FindA.Sale as an eBay developer app and obtain `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` for sandbox and production environments. Architect to provide setup steps (eBay Partner Network dashboard). ⚠️ Blocking.

2. **Organizer eBay Policies:** Before push, organizers must set default payment, fulfillment, and return policies in their eBay Seller Hub. The push endpoint references these policy IDs. Frontend should warn organizers to set these up on first eBay connection. ⚠️ UX consideration.

3. **Category Mapping Expansion:** Current category map covers ~20 common estate sale categories. If organizer attempts to export an unmapped category, the push will fail with INVALID_CATEGORY. Should we:
   - Option A: Let it fail with helpful error message; organizer manually selects eBay category in UI
   - Option B: Use eBay's Taxonomy API to auto-suggest the closest leaf category
   - Recommend Option A for Phase 2 (simpler), Option B for Phase 3 (nice to have)

4. **EPN Campid Verification:** Confirm with eBay API team that `referralUrl` field in `createOffer` correctly passes the `campid` parameter for affiliate tracking. If not, fallback is to embed tracking URL in listing description. ⚠️ Revenue tracking critical.

5. **Token Expiry Strategy:** Access tokens expire in 2 hours. Refresh tokens expire in 18 months. Current design refreshes on-demand before API calls. Alternative: background job to refresh tokens every 1.5 hours (prevents edge case where refresh is needed mid-call). Architect recommendation: on-demand is fine; add alerting if refresh fails repeatedly.

6. **Tier Verification:** Ensure tier gate is enforced at API level:
   - PRO: Can push directly to eBay
   - SIMPLE: Can export CSV only (Phase 1)
   - TEAMS: Same as PRO + clean photos free
   - FREE: No eBay export at all

---

## Context Checkpoint

**Status:** ✅ Yes — Ready for dev dispatch

All architectural decisions locked. Schema is additive (no renames). Migration is non-destructive. API contracts are specified. OAuth flow follows eBay official 3-legged handshake. EPN tracking mechanism confirmed. No blocker except credentials (flagged for Patrick).

---

## References

- eBay Inventory API docs: https://developer.ebay.com/api-docs/sell/inventory/overview.html
- OAuth 2.0 for eBay Sellers: https://developer.ebay.com/api-docs/auth/oauth-user-jwt.html
- eBay Taxonomy API (Category lookup): https://developer.ebay.com/api-docs/commerce/taxonomy/overview.html
- Feature #244 spec: `claude_docs/feature-decisions/ebay-quick-list-spec.md`
- Phase 1 controller (CSV export): `packages/backend/src/controllers/ebayController.ts`
- S389 pricing decisions: confirmed EPN campid `5339148447`, Shippo affiliate

---

**ADR Status:** APPROVED BY ARCHITECT (2026-04-09)  
**Next Step:** Dispatch to `findasale-dev` for implementation
