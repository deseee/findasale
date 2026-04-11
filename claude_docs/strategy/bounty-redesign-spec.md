# Bounties Redesign Specification

**Status:** Architecture Specification (Research Phase)  
**Date:** 2026-04-11  
**Scope:** Complete redesign of MissingListingBounty system (organizer submissions workflow + shopper review flow)  
**Related:** Explorer's Guild XP economy, Hunt Pass, gifting system economics

---

## Executive Summary

Current bounties are passive and friction-heavy: shoppers request items, organizers manually link fulfilled items by pasting item IDs. The redesigned system becomes an active marketplace where:

1. **During item publish**, the system auto-matches organizer items against local active bounties (fuzzy text match).
2. **Organizer sees matches** and submits a listing as a bounty fulfillment.
3. **Shopper reviews submissions** and decides to purchase via the platform.
4. **XP economics** follow the gifting pattern: shopper pays 2x XP cost; organizer earns base XP.
5. **Organizers can browse** all local bounties (not just ones for their current sale).

This transforms bounties from a manual "helpdesk" feature into a **discovery and engagement engine** that increases item velocity and creates XP sinks.

---

## 1. Matching System

### Overview
During the item publish workflow (`/organizer/add-items` → item creation), the system:
1. Extracts item metadata (title, description, tags, category)
2. Queries active bounties within the same geographic region (sale location)
3. Performs fuzzy text match on bounty description vs. item title/tags
4. Returns ranked candidates (confidence score)
5. Surfaces matched bounties to organizer in a post-publish modal or card

### Algorithm

**Inputs:**
- Item title (string)
- Item description (string, optional)
- Item tags (array, e.g., ["furniture", "vintage", "dresser"])
- Item category (enum, e.g., "FURNITURE")
- Sale location (lat/lon or zip code)
- Sale radius threshold (default: 25 miles for same-metro sales)

**Bounty query:**
```
SELECT bounties FROM MissingListingBounty
WHERE
  status = 'OPEN'
  AND sale.location within 25 miles of current_sale.location
  AND sale.status != 'ENDED'
  AND bounty.createdAt > NOW() - 90 days  // Don't surface stale bounties
```

**Fuzzy match scoring (Levenshtein-like):**

For each bounty in result set:
1. Compute text similarity between:
   - Bounty description (e.g., "Vintage dresser with mirror")
   - Item title + tags (e.g., "Vintage Dresser | furniture, wood, 6-drawer, mirror")
2. Apply category bonus: +0.15 confidence if item category matches bounty category (if bounty is tagged)
3. Apply recency bonus: +0.05 confidence if bounty created <7 days ago
4. Apply tag overlap: +0.10 per matching tag (max 0.30 for 3+ matching tags)

**Confidence threshold:** Display matches with ≥0.60 confidence (Patrick locked 60%+, S437).

**Ranking:** Sort by confidence descending, then by bounty created date (newest first).

**Result set:** Return top 3–5 matches. If <1 match, show "No matching requests found" + CTA to browse all local bounties.

### When It Triggers
- **Primary:** After organizer publishes an item (item creation succeeds, before redirect to item detail page)
- **Secondary:** Optional—organizers can manually re-match from `/organizer/bounties` → "Suggest matches for this item" button
- **Not:** During item draft (only on publish)

### Edge Cases
- Organizer publishes multiple items in one batch → Run matching once per item (or once for entire batch, showing all matches together)
- Bounty created for a sale that has ended → Filter out (status check prevents match)
- Item price far below bounty offer price → Still match; shopper can choose to buy at organizer's price or request organizer to lower
- Organizer's sale is outside 25-mile radius of bounty's sale → Don't match (geographic isolation)

---

## 2. Organizer Flow

### New Screens / Updates

#### 2a. Post-Publish Match Modal
**Trigger:** Item just published  
**Layout:**
```
┌─ Match Found: Your Vintage Dresser ─────────────┐
│                                                  │
│  🎯 3 shoppers are looking for items like this: │
│                                                  │
│  ☐ [93%] "Vintage dresser with mirror, 6-dr"  │
│     User: Sarah M. • Willing to pay: $150      │
│     Sale: Grand Rapids Estate Sale (5 mi away) │
│     ⚡ Submit | ← Back                          │
│                                                  │
│  ☐ [78%] "Mid-century furniture, any dresser" │
│     User: James K. • No price specified        │
│     Sale: Kent City Yard Sale (22 mi away)     │
│     ⚡ Submit | ← Back                          │
│                                                  │
│  ☐ [61%] "Dresser or nightstand, wood"        │
│     User: Lisa R. • Willing to pay: $75       │
│     Sale: Comstock Flea Mkt (18 mi away)      │
│     ⚡ Submit | ← Back                          │
│                                                  │
│ ← View all local bounties (X requests nearby)   │
│ ← Skip for now                                  │
└──────────────────────────────────────────────────┘
```

**Interaction:**
- Organizer clicks "Submit" on a match
- System shows a pre-filled submission form (see 2b)
- If organizer skips, modal closes; they can re-access matches from bounties page

**Copy guidance:**
- Match confidence as percentage (not a technical score—frame as "Match quality")
- Show bounty creator's name, requested price (if any), distance, and sale title
- Emphasize urgency: "Sarah is actively looking for this item!"

#### 2b. Bounty Submission Form
**New flow:** Organizer → Publish Item → Modal Shows Matches → Click "Submit" → Submission Form

**Form fields:**
```
Bounty Submission
─────────────────
Item being submitted: [Vintage Dresser (auto-populated, read-only)]
Bounty request: [Vintage dresser with mirror, 6-dr] (read-only, from bounty)
Shopper: Sarah M. (read-only)

Your selling price:           $[amount] (auto-filled from item price)
Message to shopper (opt):     [text box, 500 chars max]
                              e.g., "Excellent condition, recently restored"

                              ☐ Mark as shipped (if physical delivery expected)

[ Submit Submission ] [ Cancel ]
```

**Behavior:**
- Organizer can modify the message but not the price (price comes from item listing)
- On submit, create a BountySubmission record and notify shopper (see 3b)
- Organizer sees confirmation: "Submission sent! Sarah has 3 days to review."
- Redirect to bounties page or item detail (configurable)

#### 2c. Updated Bounties Page (`/organizer/bounties`)
**Current state:** Only shows bounties for the selected sale  
**New state:** Shows all local bounties + recent submissions

**Sections:**
1. **Browse Local Bounties** (new)
   - Search + filter by distance, offer price range, category
   - Card layout: bounty description, shopper, offered price, distance, sale info
   - CTA: "See if I have this" → Opens quick-check modal (describe what you have)
   - Bounties sorted by: distance (closest first), recency (newest first)
   - Pagination or infinite scroll

2. **Your Recent Submissions** (new)
   - Shows bounty submissions organizer has made in past 30 days
   - Status: PENDING_REVIEW, APPROVED_BY_SHOPPER, REJECTED_BY_SHOPPER, EXPIRED
   - Card: bounty request, item submitted, shopper name, status, age
   - CTA for APPROVED: "Go to purchase flow" (shopper approved; ready to transact)

3. **Open Requests for Your Sales** (current, renamed)
   - Bounties specific to organizer's sales (current /organizer/bounties behavior)
   - Kept for backward compatibility but de-emphasized

4. **Closed Requests** (current, collapsed by default)

**UX improvements:**
- All bounties show a "Match" indicator (✓ You have it / ? Maybe / ✗ Don't have it) if organizer has recently uploaded items
- "Browse Local Bounties" section prominently featured (primary engagement path)

#### 2d. Bounty Detail Modal (Optional)
**Trigger:** Organizer clicks a bounty card in "Browse Local Bounties"  
**Shows:**
```
┌─ Request: Vintage Dresser with Mirror ────────────────┐
│                                                         │
│ Posted by: Sarah M. (Sage rank 🏆)                     │
│ Requested on: March 28, 2026                           │
│ Willing to pay: $150                                   │
│                                                         │
│ Description:                                           │
│ Looking for a 6-drawer dresser with an attached        │
│ mirror, preferably vintage or mid-century. Must be      │
│ in good condition, no major damage.                    │
│                                                         │
│ Location: Grand Rapids Estate Sale (5 mi from you)     │
│ Sale date: April 15, 2026                              │
│                                                         │
│ [ I have this! ]  [ Maybe, show me more ]              │
│ [ Close ]                                               │
└──────────────────────────────────────────────────────┘
```

**"I have this!"** opens submission form (2b)  
**"Maybe, show me more"** shows shopper's profile (previous purchases, reviews) + other requests from same shopper

---

## 3. Shopper Flow

### Overview
Shoppers can now:
1. Create bounties (existing behavior)
2. **Receive notifications** when organizers submit matching items
3. **Review submissions** in a new dedicated page
4. **Approve/reject** submissions
5. **Purchase approved items** through the platform (integrated checkout)

### New Screens / Updates

#### 3a. Bounty Submissions Page (`/shopper/bounties/submissions` or embedded in `/shopper/bounties`)
**Layout:** Tab or sidebar showing "Submissions Pending Review" (count badge)

**For each submission:**
```
┌─ Submission: Vintage Dresser ────────────────────────────┐
│                                                            │
│ From: Grand Rapids Organizers (Shop since 2025)           │
│ Sale: Grand Rapids Estate Sale • April 15, 2026           │
│ Distance: 5 miles                                         │
│ Their price: $129 (You offered: $150)                     │
│ Your bounty: "Vintage dresser with mirror, 6-dr"         │
│                                                            │
│ Message from organizer:                                  │
│ "Excellent condition, recently restored. 6 drawers,       │
│  original mirror intact. Beautiful grain detail."        │
│                                                            │
│ Item preview: [Thumbnail image] View full listing →       │
│                                                            │
│ [✓ Approve & Buy] [✗ Decline] [❓ Message Seller]         │
│                                                            │
│ Expires in: 5 days                                        │
└────────────────────────────────────────────────────────┘
```

**Interactions:**
- **Approve & Buy:** Takes shopper to purchase flow (see 3b)
- **Decline:** Rejects submission; organizer notified; bounty stays open for others
- **Message Seller:** Opens chat/contact form (optional, for questions)

**Status indicators:**
- Pending review (light blue)
- Approved (green, shows "Go to checkout" CTA)
- Declined (gray, archive-able)

#### 3b. Integrated Purchase Flow
**When shopper clicks "Approve & Buy":**
1. System validates: bounty still OPEN, submission still PENDING_REVIEW
2. Creates a "Bounty Purchase" order linking bounty ↔ submission ↔ item
3. Takes shopper to **Stripe checkout** with:
   - Item price: organizer's listed price (e.g., $129)
   - Platform fee: included
   - **XP Deduction (new line item):** "Bounty Fulfillment (2x): -50 XP" (if bounty XP cost is 25 base)
   - Total due: $129 + fees - (2x XP credit applied)
4. After successful payment:
   - Bounty status → FULFILLED
   - Submission status → PURCHASED
   - Organizer receives notification with purchase details
   - Order created in both shopper and organizer dashboards

**XP mechanics during checkout:**
- Display deduction clearly: "This purchase costs 50 XP (2x the bounty value of 25 XP)"
- Check shopper's current XP balance before allowing purchase
- If insufficient XP, show warning: "You have 10 XP. You need 50 XP. Earn 40 more or purchase XP separately." (if XP purchase is available, add link)
- Block purchase if insufficient XP (no overdraft)

#### 3c. Bounty Notifications
**Types:**

1. **New Submission Received**
   - Title: "✨ Someone found your [Vintage Dresser]!"
   - Body: "Sarah's store has a matching item for $129. Review within 3 days."
   - Link: `/shopper/bounties/submissions?id=[submissionId]`

2. **Submission Expiring Soon**
   - Title: "⏰ [Vintage Dresser] submission expires in 24 hours"
   - Body: "Sarah's dresser expires tomorrow. Approve or decline now."
   - Link: `/shopper/bounties/submissions?id=[submissionId]`

3. **Submission Declined by Shopper** (sent to organizer)
   - Title: "The shopper declined your submission"
   - Body: "Your [Vintage Dresser] submission for Sarah's bounty was declined. The bounty is still open."
   - Link: `/organizer/bounties?id=[bountyId]`

4. **Submission Approved and Purchased** (sent to organizer)
   - Title: "🎉 Sale! Your [Vintage Dresser] matched a bounty!"
   - Body: "Sarah purchased your dresser ($129). Process payment via Settlement Hub."
   - Link: `/organizer/settlement`

---

## 4. XP Economics

### 4a. Bounty XP Cost (Shopper Side)

**Current model (if it exists):** Unknown; assuming bounties don't have XP cost today.

**New model:**

Bounties are created with an optional **shopper-set XP cost** (default: 0, optional: 10–50 XP):

```
Shopper creates bounty:
─────────────────────
"Looking for: Vintage Dresser"
Bounty reward (optional): [slider] 0 ← → 50 XP
[Description here]
[Submit bounty]
```

**Interpretation:** Shopper is offering other shoppers XP credit if they submit a matching item on the shopper's behalf (e.g., "If you find this, I'll give you 25 XP").

**OR** (simpler):

Bounties default to **no shopper XP cost**. The XP mechanic only applies when organizer submits a fulfillment (see 4b).

**Recommendation: No shopper-set cost.** Bounties are free to create. XP sinks/sources are defined purely by the fulfillment transaction.

### 4b. Submission Purchase XP Cost (Shopper Pays 2x)

**When shopper purchases via a bounty submission:**

1. **Base XP cost:** 25 XP (default; tunable)
2. **Shopper pays:** 2× base = 50 XP
3. **Organizer earns:** 1× base = 25 XP
4. **Net platform impact:** -50 XP (shopper debit) + 25 XP (organizer credit) = **-25 XP sink**

This mirrors the gifting system: the sender pays a premium to subsidize the recipient.

**In the checkout UX:**
```
Item Price:              $129.00
Platform Fee:            +$12.90
─────────────────────────────────
Subtotal:                $141.90

XP Deduction:            -50 XP
  (Bounty fulfillment reward to organizer)

Total Due (after XP):     $141.90
```

**Implementation detail:** The -50 XP is **non-refundable**. It's deducted at purchase confirmation, before payment processing. If payment fails, XP is already spent (harsh, but prevents gaming).

**Alternative (softer):** Deduct XP *after* successful payment. Requires refund logic if payment fails.

### 4c. Organizer XP Credit

**When shopper approves and purchases:**
1. Create `PointsTransaction` record
   - userId: organizer.userId
   - type: "BOUNTY_FULFILLMENT"
   - points: 25
   - bountyId: [bountyId]
   - itemId: [itemId]

2. Award to organizer's account immediately (before payment settles)
3. Notify organizer: "🎉 +25 XP for fulfilling Sarah's bounty!"

### 4d. Fallback: Non-Purchase Submissions

**If shopper declines or submission expires:**
- No XP transferred (free exploration for organizers)
- Bounty remains OPEN
- Organizer's work is unrewarded (risk)

**This is intentional:** Encourages organizers to submit high-quality matches. Junk submissions = 0 XP.

### 4e. XP Sink Sustainability

**New sink:** Bounty fulfillment purchases (-50 XP per approved submission)

**Baseline:** Assume 10% of published items match ≥1 bounty. 30% of matches result in submission. 50% of submissions are approved and purchased.

```
Example: 100 items published/day
  → 10 matches
  → 3 submissions
  → 1.5 purchases
  → 1.5 × (-50 XP) = -75 XP/day sink
```

At 500 active shoppers, -75 XP/day is manageable (typical shopper earns 540 XP/month = 18 XP/day, so 75 XP/day = 4 bounty purchases = 4 fulfilled bounties active). This is not a bottleneck.

**Compare to existing sinks:**
- Coupon redemption (75 XP → $5): ~150–300 coupons/month across 500 shoppers
- Bounty fulfillment purchase (50 XP per purchase): ~30–50 purchases/month (if 10% match rate holds)

Bounty sinks are **smaller than coupon sinks** and more directly tied to engagement (organizer agency).

---

## 5. Schema Changes

### 5a. New MissingListingBounty Fields

Add to existing `MissingListingBounty` model:

```prisma
model MissingListingBounty {
  id          String   @id @default(cuid())
  saleId      String
  sale        Sale     @relation(fields: [saleId], references: [id])
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  description String   // What the shopper is looking for
  offerPrice  Float?   // What they'd pay if listed
  status      String   @default("OPEN") // OPEN, FULFILLED, CANCELLED
  itemId      String?  // (DEPRECATED) Legacy: item linked by organizer
  item        Item?    @relation(fields: [itemId], references: [id])
  crewId      String?
  crew        Crew?    @relation(fields: [crewId], references: [id], onDelete: SetNull)

  // NEW FIELDS:
  xpReward    Int      @default(25) // XP earned by organizer if submission purchased
  expiry      DateTime? // Auto-expire bounty after 90 days (null = no auto-expire for backward compat)

  // Relations:
  submissions    BountySubmission[]   // All submissions for this bounty

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([saleId, status])
  @@index([userId])
  @@index([status, expiry]) // For query: active bounties + expiry check
}
```

### 5b. New BountySubmission Model

```prisma
model BountySubmission {
  id              String   @id @default(cuid())
  bountyId        String
  bounty          MissingListingBounty @relation(fields: [bountyId], references: [id], onDelete: Cascade)
  organizerId     String   // User.id of organizer submitting
  organizer       User     @relation("OrganizerSubmissions", fields: [organizerId], references: [id])
  itemId          String
  item            Item     @relation("BountySubmissions", fields: [itemId], references: [id])

  status          String   @default("PENDING_REVIEW") // PENDING_REVIEW, APPROVED, REJECTED, EXPIRED, PURCHASED
  shoppMessage    String?  // Message from organizer to shopper (500 char limit)
  submittedAt     DateTime @default(now())
  reviewedAt      DateTime? // When shopper approved/rejected
  expiresAt       DateTime // Auto-expiry: submittedAt + 3 days

  // When purchased:
  orderId         String?  // Link to Order record (if purchase completed)
  order           Order?   @relation(fields: [orderId], references: [id], onDelete: SetNull)
  purchasedAt     DateTime?

  updatedAt       DateTime @updatedAt

  @@index([bountyId, status])
  @@index([organizerId])
  @@index([expiresAt]) // For query: expired submissions
  @@index([status]) // For query: pending submissions per shopper
}
```

### 5c. Updated Item Model

Add relation to BountySubmission:

```prisma
model Item {
  // ... existing fields ...
  
  // NEW RELATION:
  bountySubmissions  BountySubmission[]  // Items submitted to bounties

  // No new fields on Item itself; BountySubmission owns the link
}
```

### 5d. Updated User Model

Add relation to BountySubmission:

```prisma
model User {
  // ... existing fields ...
  
  // NEW RELATIONS:
  organizerSubmissions  BountySubmission[]  // Submissions made by this organizer @relation("OrganizerSubmissions")
}
```

### 5e. Updated Order Model (if using orders for bounty purchases)

If bounty purchases create Order records:

```prisma
model Order {
  // ... existing fields ...
  
  // NEW FIELD:
  bountySubmissionId  String?
  bountySubmission    BountySubmission? @relation(fields: [bountySubmissionId], references: [id])

  // NEW FIELD (for XP deduction tracking):
  xpDeducted          Int @default(0) // Amount of XP deducted from shopper
}
```

### 5f. New PointsTransaction Type

Add to `PointsTransaction.type` enum (currently a string, should be an enum):

```prisma
model PointsTransaction {
  // ... existing fields ...
  
  // UPDATE type enum to include:
  // type: "BOUNTY_FULFILLMENT" // When organizer submits and shopper purchases
}
```

---

## 6. API Endpoints

### 6a. New Endpoints

#### GET `/api/bounties/local` (Browse Local Bounties)
**Auth:** Required (ORGANIZER role)  
**Query params:**
- `saleId`: (optional) Filter to bounties near this sale
- `lat`, `lon`: (optional) Coordinates to filter by distance
- `distance`: (default 25, in miles)
- `category`: (optional) Filter by item category
- `offerPrice[min]`, `offerPrice[max]`: (optional) Price range
- `sort`: (default "distance_asc", options: "distance_asc", "newest_first", "offer_price_desc")
- `limit`: (default 20)
- `offset`: (default 0)

**Response:**
```json
{
  "bounties": [
    {
      "id": "bounty_123",
      "description": "Vintage dresser with mirror",
      "offerPrice": 150,
      "user": { "id": "user_456", "name": "Sarah M.", "rank": "SAGE" },
      "sale": { "id": "sale_789", "title": "Grand Rapids Estate Sale", "date": "2026-04-15" },
      "distance": 5.2,
      "createdAt": "2026-03-28T...",
      "submissionCount": 0,
      "yourSubmission": null // { id, status, itemId, itemTitle } if organizer has pending submission
    }
    // ... more bounties
  ],
  "total": 47,
  "limit": 20,
  "offset": 0
}
```

#### POST `/api/bounties/:id/submissions` (Submit Item to Bounty)
**Auth:** Required (ORGANIZER role)  
**Body:**
```json
{
  "itemId": "item_xyz",
  "message": "Excellent condition, recently restored"
}
```

**Validation:**
- Bounty must be OPEN
- Item must belong to organizer
- Item must be published (status not DRAFT)
- Organizer can have max 1 pending submission per bounty (prevents spam)
- Item saleId should be within distance of bounty saleId (soft check, allow anyway)

**Response:**
```json
{
  "id": "submission_abc",
  "bountyId": "bounty_123",
  "itemId": "item_xyz",
  "status": "PENDING_REVIEW",
  "submittedAt": "2026-04-11T...",
  "expiresAt": "2026-04-18T...",
  "message": "Excellent condition, recently restored"
}
```

#### GET `/api/bounties/submissions` (Shopper: View My Submissions)
**Auth:** Required (SHOPPER role)  
**Query params:**
- `status`: (optional, default "PENDING_REVIEW") Filter by status
- `sort`: (default "newest_first", options: "newest_first", "expiring_soonest")
- `limit`: (default 20)

**Response:**
```json
{
  "submissions": [
    {
      "id": "submission_abc",
      "bounty": {
        "id": "bounty_123",
        "description": "Vintage dresser with mirror",
        "offerPrice": 150,
        "createdAt": "2026-03-28T..."
      },
      "item": {
        "id": "item_xyz",
        "title": "Vintage Dresser",
        "price": 129,
        "saleId": "sale_789",
        "images": [...]
      },
      "organizer": { "id": "org_123", "name": "Grand Rapids Organizers" },
      "message": "Excellent condition, recently restored",
      "status": "PENDING_REVIEW",
      "submittedAt": "2026-04-11T...",
      "expiresAt": "2026-04-18T...",
      "xpCost": 50 // 2x the bounty's xpReward
    }
    // ... more submissions
  ],
  "total": 12,
  "unreviewed": 3
}
```

#### PATCH `/api/bounties/submissions/:id` (Shopper: Approve/Decline)
**Auth:** Required (SHOPPER role, owner of bounty)  
**Body:**
```json
{
  "action": "APPROVE" // or "DECLINE"
}
```

**Behavior:**
- If APPROVE: Set status → "APPROVED", create Order + start Stripe session, return checkout URL
- If DECLINE: Set status → "REJECTED", keep bounty OPEN, notify organizer

**Response:**
```json
{
  "id": "submission_abc",
  "status": "APPROVED",
  "checkoutUrl": "https://checkout.stripe.com/pay/..."
}
```

OR (if DECLINE):

```json
{
  "id": "submission_abc",
  "status": "REJECTED",
  "message": "Bounty remains open"
}
```

#### POST `/api/bounties/:id/match` (Auto-match during item publish)
**Auth:** Required (ORGANIZER role)  
**Body:** (optional, can be empty; system queries on item metadata)
```json
{
  "itemId": "item_xyz"
}
```

**Response:**
```json
{
  "matches": [
    {
      "id": "bounty_123",
      "description": "Vintage dresser with mirror",
      "confidence": 0.93,
      "offerPrice": 150,
      "user": { "name": "Sarah M.", "rank": "SAGE" },
      "sale": { "title": "Grand Rapids Estate Sale", "distance": 5 }
    }
    // ... up to 5 matches
  ]
}
```

#### POST `/api/bounties/:id/submissions/:submissionId/purchase` (Complete Bounty Purchase)
**Auth:** Required (SHOPPER role, owner of bounty)  
**Body:**
```json
{
  "stripeTokenId": "tok_..." // or session flow result
}
```

**Behavior:**
1. Validate submission still PENDING_REVIEW or APPROVED
2. Deduct XP from shopper (xpCost = 2 × bounty.xpReward)
3. Process Stripe payment
4. On success:
   - Create Order with bountySubmissionId
   - Award organizer XP (bounty.xpReward)
   - Update Bounty status → FULFILLED
   - Update Submission status → PURCHASED
   - Create notifications (both roles)
   - Return order confirmation
5. On failure: Refund XP (if deducted pre-payment), return error

**Response:**
```json
{
  "orderId": "order_xyz",
  "bountyId": "bounty_123",
  "submissionId": "submission_abc",
  "status": "PURCHASED",
  "xpDeducted": 50,
  "organizerXpAwarded": 25
}
```

### 6b. Updated Endpoints

#### GET `/api/bounties/sale/:saleId` (Organizer: View Bounties for Sale)
**Current behavior:** Fetch bounties for a specific sale  
**No breaking changes** — this remains the same

#### PATCH `/api/bounties/:id/fulfill` (Legacy: Mark as Fulfilled)
**Current behavior:** Organizer marks bounty fulfilled with optional item ID  
**Migration:**
- Keep this endpoint working (backward compatible)
- Internally, this now creates a BountySubmission record (under the hood)
- Shopper doesn't need to approve (legacy path)
- Recommended to deprecate in favor of `/api/bounties/:id/submissions` (new path)

---

## 7. Migration Path (Zero-Breaking)

### Phase 1: Database & Schemas (Week 1)
1. Add new tables: `BountySubmission`
2. Add fields to `MissingListingBounty`: `xpReward`, `expiry`
3. Add relations to `Item`, `User`, `Order`
4. No data migration needed (new features only)

### Phase 2: Backend Endpoints (Week 2)
1. Implement all 6 new endpoints (no UI wired yet)
2. Unit test matching algorithm
3. Implement XP deduction logic
4. Test submission workflow (Postman)

### Phase 3: Frontend - Organizer (Week 3)
1. Build post-publish match modal (optional, can skip submission entirely)
2. Update `/organizer/bounties` page layout (add "Browse Local Bounties" section)
3. Wire "Submit" buttons to new endpoints
4. Test matching UX with 10+ test bounties

### Phase 4: Frontend - Shopper (Week 4)
1. Build `/shopper/bounties/submissions` page
2. Integrate Stripe checkout for bounty purchases
3. Wire approval/decline actions
4. Test purchase flow end-to-end

### Phase 5: Rollout
1. **Soft launch:** Enable bounty submissions for PRO/TEAMS organizers only (beta)
2. **Monitor:** Track match quality, approval rate, abandonment
3. **Adjust:** Tweak confidence thresholds, distance radius, XP values
4. **General launch:** Roll out to all organizers

### Backward Compatibility
- Old `PATCH /api/bounties/:id/fulfill` endpoint still works
- Old `/organizer/bounties` still shows sale-specific bounties (just adds new sections)
- No data loss; legacy bounties continue functioning

---

## 8. Known Issues & Open Questions

### Layout Issue: "Way Low" Content
**Current problem:** `/organizer/bounties` page content sits too far down (excessive top padding or hero bar).  
**Fix:** (Pending UX review)
- Reduce header padding
- Make sale selector compact
- Remove decorative spacing

### Organizer Distance Filtering
**Question:** Should organizers see bounties outside their sale's region?  
**Current design:** Yes, 25-mile radius from any organizer sale.  
**Alternative:** Only bounties within same county/metro area.  
**Recommendation:** Default to 25 miles; let organizer adjust in filters.

### Bounty Auto-Expiry
**Question:** Should bounties auto-expire after 90 days if unfulfilled?  
**Current design:** Optional (expiry field nullable).  
**Recommendation:** Default to 60–90 days for active bounties; allow shopper to renew manually.

### XP Economics: Shopper Earn Rate
**Question:** Is 50 XP per bounty purchase too much/too little?  
**Current design:** 50 XP (2× the 25 XP organizer earns).  
**Recommendation:** Monitor coupon redemption rate post-launch. If bounty purchases spike, may need to increase XP cost (50 → 75).

### Submission Message Character Limit
**Current design:** 500 characters (organizer message to shopper).  
**Rationale:** Keeps messages concise (no essays); prevents abuse.  
**Recommendation:** Make it configurable (start at 200, increase to 500 if feedback suggests).

### Shopper Can Override Organizer Price?
**Question:** Should shopper be able to negotiate price before purchase?  
**Current design:** No—shopper buys at organizer's listed price or declines.  
**Rationale:** Keeps flow simple; organizer controls pricing.  
**Alternative:** Add "Make Offer" button (adds negotiation step, slows flow).  
**Recommendation:** Ship with no negotiation; add in Phase 2 if feedback suggests.

---

## 9. Success Metrics & KPIs

### Adoption KPIs
- **Match rate:** % of published items that match ≥1 bounty (target: 15–25%)
- **Submission rate:** % of shown matches that organizers act on (target: 20–30%)
- **Approval rate:** % of submissions shopper approves (target: 40–50%)
- **Purchase rate:** % of approved submissions that convert to purchase (target: 70–80%)

### Engagement KPIs
- **Bounty creation rate:** Bounties created per 100 shopper visits (target: +50% vs. current)
- **Avg time to fulfillment:** Days from bounty creation to purchase (target: <14 days)
- **Organizer participation:** % of organizers who submit ≥1 bounty submission (target: 20%)

### Economic KPIs
- **XP sink velocity:** XP consumed per day by bounty purchases (target: <100 XP/day at 500 shoppers)
- **Organizer XP earned:** Total XP awarded to organizers via bounties (target: 5–10% of total organizer engagement XP)
- **Revenue per bounty purchase:** Transaction fee (10% SIMPLE, 8% PRO) + organizer tier subscription (target: $15–20 per bounty purchase)

---

## 10. Patrick's Design Decisions (Locked S437, 2026-04-11)

1. **XP cost:** 2× confirmed. Shopper pays 50 XP, organizer earns 25 XP.
2. **Auto-matching confidence threshold:** 60%+ required to surface a match.
3. **Organizer browsing scope:** 25 miles from any sale they run. Confirmed.
4. **Submission expiry:** 3 days (NOT 7). Shoppers must review within 72 hours or submission expires.
5. **Message character limit:** 500 chars.
6. **Layout fix priority:** Before new features ship — fix the "way low" layout as part of the redesign.
7. **Soft launch tier:** Scout rank+ shoppers can REQUEST bounties. Any organizer can FULFILL. "Work in progress" language in UI.
8. **Geographic matching fallback:** Search modal with mile-range selector so organizers can expand/narrow their search radius.

---

## 11. Related Documents

- `claude_docs/feature-notes/investor-xp-economics-S402.md` — XP sink sustainability analysis
- `claude_docs/research/gamification-xp-economy-S259.md` — XP earning rates + daily engagement mechanics
- `claude_docs/specs/explorers-guild-master-spec.md` — XP economy context
- Current bounties implementation: `packages/backend/src/controllers/bountyController.ts`, `packages/frontend/pages/organizer/bounties.tsx`

---

## Appendix: Data Flow Diagrams

### Organizer Submit Flow
```
Organizer publishes item
  ↓ (itemController.ts)
  ├─ Create Item record
  ├─ Run matching algorithm
  │   └─ Query bounties within 25 miles
  │   └─ Rank by fuzzy match
  ├─ Return top 3–5 matches
  └─ Show modal
       ↓
       Organizer clicks "Submit"
       ↓ (POST /api/bounties/:bountyId/submissions)
       ├─ Validate organizer owns item
       ├─ Create BountySubmission
       └─ Notify shopper + return confirmation
```

### Shopper Review & Purchase Flow
```
Notification: "New bounty submission for your [Dresser] request"
  ↓
Shopper navigates to /shopper/bounties/submissions
  ↓
Shopper views submission card (item preview, organizer message, price)
  ↓
Shopper clicks "Approve & Buy"
  ↓ (PATCH /api/bounties/submissions/:id + POST /api/bounties/submissions/:id/purchase)
  ├─ Validate bounty still OPEN
  ├─ Deduct 50 XP from shopper
  ├─ Create Order record (bountySubmissionId link)
  ├─ Initiate Stripe checkout
  ├─ On payment success:
  │   ├─ Award organizer 25 XP
  │   ├─ Update Bounty status → FULFILLED
  │   ├─ Update Submission status → PURCHASED
  │   └─ Notify both roles
  └─ Return order confirmation
```

---

**Status:** Specification complete. Ready for Patrick decision on questions in Section 10. Proceed to findasale-dev for implementation planning after approval.

