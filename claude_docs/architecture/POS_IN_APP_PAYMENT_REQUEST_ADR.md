# Architecture Decision Record: POS In-App Payment Request via Socket.io

**Date:** 2026-04-06
**Status:** ARCH_REVIEW_COMPLETE (awaiting Patrick dev approval)
**Feature:** POS Payment Request — real-time shopper notifications + in-app Stripe payment
**Stakeholder:** Patrick (FindA.Sale Founder)
**Reviewed:** Schema, Socket.io setup, existing payment flows, Stripe contract, Notification model

---

## Executive Summary

Currently, when an organizer in the POS links a shopper's account (via QR), the payment workflow requires:
1. Organizer sees Stripe Payment Link QR code
2. Shopper scans QR code, leaves the PWA
3. Shopper completes payment on Stripe-hosted page
4. Webhook marks item SOLD

**Proposed improvement:** Send a payment request directly to the shopper's device in real time. The shopper receives it:
- **In-app (Socket.io):** If shopper is actively using FindA.Sale
- **Notification inbox:** If shopper is offline (fallback)

The shopper stays in-app, reviews the payment request, and pays via Stripe payment modal without ever leaving FindA.Sale.

**Win:** Organizers don't need to share QR codes. Shoppers complete payment 3x faster. Higher conversion rate.

---

## 1. Schema Design

### New Model: `POSPaymentRequest`

**Decision:** Create a dedicated `POSPaymentRequest` model instead of reusing `HoldInvoice` or `POSPaymentLink`.

**Rationale:**
- HoldInvoice is 1:1 with ItemReservation (holds). POS requests can be for mixed items (held + non-held).
- POSPaymentLink is QR-code-based (no real-time signaling). POS requests need Socket.io + notification channel.
- This model cleanly separates the organizer-initiated-push-payment flow from existing workflows.

**Schema:**

```prisma
model POSPaymentRequest {
  id                  String    @id @default(cuid())
  organizerId         String
  organizer           Organizer @relation(fields: [organizerId], references: [id], onDelete: Cascade)
  shopperUserId       String
  shopper             User      @relation(fields: [shopperUserId], references: [id], onDelete: Cascade)
  saleId              String
  sale                Sale      @relation(fields: [saleId], references: [id], onDelete: Cascade)

  // Payment details
  itemIds             String[]              // all items in this payment request
  totalAmountCents    Int                   // total amount in cents (inc. fees + tax if applicable)
  platformFeeCents    Int                   // 10% flat fee deducted from organizer payout
  stripeFeeEstimate   Int?                  // estimated Stripe fee (2.9% + $0.30)

  // Stripe integration
  stripePaymentIntentId String?     @unique  // created on shopper acceptance OR organizer send
  stripePaymentIntentSecret String?  @db.VarChar(255)  // shared with frontend to confirm payment

  // Status & lifecycle
  status              String      @default("PENDING")   // PENDING | ACCEPTED | PAID | DECLINED | EXPIRED | CANCELLED
  requestedAt         DateTime    @default(now())
  acceptedAt          DateTime?
  paidAt              DateTime?
  expiresAt           DateTime    // 15 min from creation

  // Audit trail
  declineReason       String?     // if declined: "SHOPPER_CANCEL" | "TIMEOUT" | "PAYMENT_FAILED"

  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt

  @@index([organizerId, saleId])
  @@index([shopperUserId, status])
  @@index([status, expiresAt])
  @@index([stripePaymentIntentId])
}
```

**Migration Plan:**
```prisma
// New table will be created by:
npx prisma migrate dev --name add_pos_payment_request

// On Railway (production):
DATABASE_URL="postgresql://..." npx prisma migrate deploy
npx prisma generate
```

**Rollback Plan:**
If needed, delete the migration and:
```prisma
npx prisma migrate resolve --rolled-back add_pos_payment_request
npx prisma db push
```

---

## 2. Socket.io Event Contract

### Rooms & Audience

**Organizer socket room:**
```
user:${organizerId}  // single organizer listening for payment confirmations
```

**Shopper socket room:**
```
user:${shopperUserId}  // shopper listening for incoming payment requests
```

Rooms are joined on socket connect if `socket.data.userId` is set (authenticated).

### Event: Organizer → Backend → Shopper (Payment Request Push)

**Endpoint:** `POST /api/pos/payment-request`
**Requester:** Organizer (authenticated)

**Request body:**
```typescript
{
  shopperUserId: string;      // ID of shopper to send request to
  saleId: string;             // sale context
  itemIds: string[];          // array of item IDs (all same sale)
  totalAmountCents: number;   // total incl. platform fee
  expiresInSeconds?: number;  // default: 900 (15 min)
}
```

**Response (on success):**
```typescript
{
  requestId: string;           // UUID of POSPaymentRequest
  status: "PENDING";
  shopperName: string;
  totalAmountCents: number;
  expiresAt: ISO8601_string;
  stripePaymentIntentId?: string;  // if created upfront
  stripePaymentIntentSecret?: string;
}
```

**Response (on error):**
```typescript
{
  message: string;  // e.g., "Shopper not found", "Invalid items", "Stripe failed"
  status: 400 | 403 | 404 | 500;
}
```

---

### Real-Time Socket Event: `POS_PAYMENT_REQUEST`

**Emitted to:** Room `user:${shopperUserId}`
**When:** Immediately after `POST /api/pos/payment-request` completes
**Payload:**

```typescript
interface POSPaymentRequestEvent {
  type: "POS_PAYMENT_REQUEST";
  requestId: string;
  organizerName: string;
  saleName: string;
  saleLocation: string;        // optional
  itemNames: string[];
  totalAmountCents: number;
  displayAmount: string;        // "$X.XX" formatted
  expiresAt: ISO8601_string;
  expiresIn: number;            // seconds remaining
  stripePaymentIntentSecret?: string;  // if immediate intent creation
  deepLink: string;            // e.g., "/shopper/pay-request/[requestId]"
}
```

**Example:**
```json
{
  "type": "POS_PAYMENT_REQUEST",
  "requestId": "clp92k1x0000108ju8c5e5z7e",
  "organizerName": "Estate Sale Pros",
  "saleName": "Estate of Jane Doe",
  "saleLocation": "Downtown Grand Rapids",
  "itemNames": ["Antique Mirror", "Leather Chair"],
  "totalAmountCents": 15750,
  "displayAmount": "$157.50",
  "expiresAt": "2026-04-06T15:45:00Z",
  "expiresIn": 300,
  "stripePaymentIntentSecret": "pi_test_secret_...",
  "deepLink": "/shopper/pay-request/clp92k1x0000108ju8c5e5z7e"
}
```

---

### Shopper → Backend: Accept / Decline Request

**Endpoint (Accept):** `POST /api/pos/payment-request/:requestId/accept`
**Endpoint (Decline):** `POST /api/pos/payment-request/:requestId/decline`
**Requester:** Shopper (authenticated)

**Accept request body (optional, can be empty POST):**
```typescript
{
  // empty or metadata
}
```

**Accept response:**
```typescript
{
  requestId: string;
  status: "ACCEPTED";
  stripePaymentIntentId: string;           // PI exists now
  stripePaymentIntentSecret: string;
  clientSecret: string;                    // Stripe PI secret
  displayAmount: string;
}
```

**Decline request body:**
```typescript
{
  reason?: "USER_CANCEL" | "INSUFFICIENT_FUNDS" | "PAYMENT_CONCERN" | "OTHER";  // optional
}
```

**Decline response:**
```typescript
{
  requestId: string;
  status: "DECLINED";
  reason: string;
}
```

---

### Real-Time Socket Event: Payment Status Update (Bidirectional)

**Event name:** `POS_PAYMENT_STATUS`
**Emitted by:** Backend (on Stripe webhook `payment_intent.succeeded`)
**Emitted to:** Both organizer room (`user:${organizerId}`) and shopper room (`user:${shopperUserId}`)

**Payload:**
```typescript
{
  type: "POS_PAYMENT_STATUS";
  requestId: string;
  status: "ACCEPTED" | "PAID" | "DECLINED" | "EXPIRED";
  totalAmountCents?: number;
  paidAt?: ISO8601_string;
  declineReason?: string;
}
```

---

## 3. API Endpoint Specification

### POST /api/pos/payment-request

**Auth:** ORGANIZER role required

**Request:**
```typescript
POST /api/pos/payment-request
{
  "shopperUserId": "user_abc123",
  "saleId": "sale_xyz789",
  "itemIds": ["item_1", "item_2"],
  "totalAmountCents": 15750,
  "expiresInSeconds": 900
}
```

**Validation:**
1. Requester must be ORGANIZER
2. `shopperUserId` must exist and not be blocked/suspended
3. `saleId` must be PUBLISHED and organized by requester
4. All `itemIds` must:
   - Exist in the specified sale
   - Be in status AVAILABLE or RESERVED (not SOLD, ARCHIVED, DRAFT)
5. `totalAmountCents` must be > 0 and ≤ sum of all item prices × 2 (fraud check)
6. Organizer must have valid Stripe account (stripeConnectId)

**Side effects (on success):**
1. Create `POSPaymentRequest` record (status = PENDING)
2. Create Stripe Payment Intent immediately (no need to wait for shopper acceptance):
   - Amount = totalAmountCents
   - Metadata: { requestId, saleId, organizerId, shopperId }
   - **Key:** Do NOT require confirmation yet (setup_future_usage NOT set)
3. Emit `POS_PAYMENT_REQUEST` socket event to shopper
4. Create Notification record:
   - type: "pos_payment_request"
   - title: "[Organizer Name] Sent You a Payment Request"
   - body: "$X.XX for X items from [Sale Name]"
   - link: "/shopper/pay-request/[requestId]"

**Response (201):**
```typescript
{
  "requestId": "clp92k1x0000108ju8c5e5z7e",
  "status": "PENDING",
  "shopperName": "Alice Smith",
  "totalAmountCents": 15750,
  "expiresAt": "2026-04-06T15:45:00Z",
  "stripePaymentIntentId": "pi_test_123abc",
  "stripePaymentIntentSecret": "pi_test_secret_..."
}
```

**Error (400):**
```typescript
{
  "message": "One or more items are no longer available",
  "details": { "unavailableItemIds": ["item_5"] }
}
```

---

### POST /api/pos/payment-request/:requestId/accept

**Auth:** SHOPPER role required (must own the request)

**Request:**
```typescript
POST /api/pos/payment-request/clp92k1x0000108ju8c5e5z7e/accept
{}
```

**Validation:**
1. `requestId` must exist
2. Requester.id must equal request.shopperUserId
3. Request status must be PENDING
4. Request.expiresAt > now()

**Side effects:**
1. Update request status to ACCEPTED
2. Update request.acceptedAt = now()
3. Emit `POS_PAYMENT_STATUS` to both organizer and shopper (status = ACCEPTED)

**Response (200):**
```typescript
{
  "requestId": "clp92k1x0000108ju8c5e5z7e",
  "status": "ACCEPTED",
  "stripePaymentIntentId": "pi_test_123abc",
  "stripePaymentIntentSecret": "pi_test_secret_...",
  "displayAmount": "$157.50"
}
```

---

### POST /api/pos/payment-request/:requestId/decline

**Auth:** SHOPPER role required

**Request:**
```typescript
POST /api/pos/payment-request/clp92k1x0000108ju8c5e5z7e/decline
{
  "reason": "USER_CANCEL"
}
```

**Validation:** Same as accept

**Side effects:**
1. Update status to DECLINED, declineReason = reason
2. Emit `POS_PAYMENT_STATUS` to organizer (status = DECLINED, reason)
3. Create Notification to organizer: "Alice declined your payment request for $X.XX"

**Response (200):**
```typescript
{
  "requestId": "clp92k1x0000108ju8c5e5z7e",
  "status": "DECLINED",
  "reason": "USER_CANCEL"
}
```

---

## 4. Shopper Payment Page Route

**Route:** `/shopper/pay-request/:requestId`

**Responsibility:** Render payment request summary + Stripe payment form

**Components:**
1. **Request summary panel:**
   - Organizer name + sale name + location
   - Item list (thumbnails + names)
   - Total amount, platform fee, Stripe fee estimate
   - Countdown timer → expires at requestData.expiresAt

2. **Stripe payment form:**
   - Card element (Stripe React library)
   - Mounted after shopper clicks "Accept Payment Request"
   - Uses `stripePaymentIntentSecret` to confirm payment

3. **Action buttons:**
   - "Accept & Pay" → POST /accept, then show form
   - "Decline" → POST /decline, then close modal

4. **Real-time updates:**
   - Listen to `POS_PAYMENT_STATUS` socket event
   - On PAID: show success → redirect to `/shopper/purchases` after 2s
   - On EXPIRED: show "This request has expired" → disable buttons

**Data fetch:**
```typescript
GET /api/pos/payment-request/:requestId
// Response includes all request details needed to render page
```

---

## 5. Stripe Webhook & Payment Completion

### Webhook Event: `payment_intent.succeeded`

**Existing handler:** `packages/backend/src/controllers/stripeController.ts` (webhookHandler)

**New logic needed:**

1. **Parse metadata:**
   ```typescript
   const { requestId, organizerId, shopperId, saleId } = intent.metadata;
   ```

2. **Is this a POS payment request?**
   - If requestId exists → lookup POSPaymentRequest
   - Else → existing checkout flow (no change)

3. **Update POSPaymentRequest:**
   ```typescript
   await prisma.pOSPaymentRequest.update({
     where: { id: requestId },
     data: { status: "PAID", paidAt: new Date() }
   });
   ```

4. **Mark items SOLD:**
   - For each itemId in request.itemIds:
     - Create Purchase record
     - Update Item.status = SOLD
     - Update ItemReservation.status = COMPLETED (if exists)
     - Award XP to shopper (PURCHASE event)
     - Create receipt notification

5. **Emit socket event:**
   - `POS_PAYMENT_STATUS` to organizer & shopper rooms

6. **Create Notification to organizer:**
   - type: "pos_payment_completed"
   - title: "[Shopper Name] Paid $X.XX"
   - body: "X items from [Sale Name] marked SOLD"

7. **Email receipt to shopper** (existing sendReceiptEmail logic reused)

8. **Payout tracking:**
   - Deduct platform fee + Stripe fee from organizer payout
   - Existing flow (no change needed)

---

## 6. Notification Fallback (Offline Shoppers)

**Model:** Existing `Notification` model
**Type field:** Add "pos_payment_request" to enum

**Notification record created by** `POST /api/pos/payment-request` endpoint:

```typescript
await prisma.notification.create({
  data: {
    userId: shopperUserId,
    type: "pos_payment_request",
    title: `${organizerName} Sent You a Payment Request`,
    body: `$${(totalAmountCents / 100).toFixed(2)} for ${itemNames.slice(0, 2).join(', ')}...`,
    link: `/shopper/pay-request/${requestId}`,
    notificationChannel: "IN_APP",  // no email/push for POS requests yet
    channel: "OPERATIONAL"
  }
});
```

**Frontend:** Notification inbox queries `/api/notifications/inbox` and displays these as cards.
**Deep link:** Clicking notification → navigates to `/shopper/pay-request/:requestId`

---

## 7. Knock-On Effects & File Changes

### Backend Files (Must be modified):

1. **Database:**
   - `packages/database/prisma/schema.prisma` — add POSPaymentRequest model
   - Migration file — auto-generated by Prisma

2. **Routes:**
   - `packages/backend/src/routes/pos.ts` — add 3 new endpoints

3. **Controllers:**
   - `packages/backend/src/controllers/posController.ts` — implement payment request endpoints
   - `packages/backend/src/controllers/stripeController.ts` — update webhookHandler for POS requests

4. **Services:**
   - `packages/backend/src/services/notificationService.ts` or `lib/notificationService.ts` — ensure notification creation works

5. **Socket.io:**
   - `packages/backend/src/lib/socket.ts` — already supports room-based emission; no changes needed

### Frontend Files (Must be created/modified):

1. **Pages:**
   - `packages/frontend/pages/shopper/pay-request/[requestId].tsx` — new payment request page

2. **Components:**
   - `packages/frontend/components/PaymentRequestForm.tsx` — Stripe payment form wrapper

3. **Hooks:**
   - `packages/frontend/hooks/usePOSPaymentRequest.ts` — data fetch + status polling/socket listening

4. **Types:**
   - `packages/frontend/lib/types/index.ts` — add POSPaymentRequest, POSPaymentRequestEvent types

### Optional Enhancements (Phase 2):

1. **Organizer dashboard widget** — "Pending payment requests" queue
2. **Shopper notification badge** — incoming requests badge
3. **Email notification** — send email in addition to in-app (tier-gated?)
4. **Bulk payment requests** — organizer sends same request to multiple shoppers

---

## 8. Implementation Order (Sequential)

1. **Database:** Add migration (posController ready to use schema)
2. **Backend endpoints:** POST create, POST accept, POST decline
3. **Stripe webhook:** Update to handle POS intent succeeded
4. **Socket events:** Emit in controllers
5. **Frontend route:** `/shopper/pay-request/[requestId]`
6. **Frontend components:** PaymentRequestForm, Socket listener
7. **QA & integration testing** (all roles, all tiers)

---

## 9. Tier Gating & Feature Availability

**Proposed gatekeeping:**
- **SIMPLE:** 0 concurrent requests per sale (feature disabled)
- **PRO:** 5 concurrent requests per sale
- **TEAMS:** Unlimited concurrent requests

**Implementation:** Check `organizer.subscription.tier` before creating request.

**Patrick decision needed:** Is this tier-locked, or available to all?

---

## 10. XP & Rewards

**Explorer's Guild XP award:** Already triggers on PURCHASE creation. No new logic needed.

**Hunt Pass multiplier:** Applied during PURCHASE creation. No new logic needed.

---

## 11. TypeScript Contracts

### Backend

```typescript
// Shared
interface POSPaymentRequestData {
  id: string;
  organizerId: string;
  shopperUserId: string;
  saleId: string;
  itemIds: string[];
  totalAmountCents: number;
  platformFeeCents: number;
  status: "PENDING" | "ACCEPTED" | "PAID" | "DECLINED" | "EXPIRED" | "CANCELLED";
  expiresAt: Date;
  createdAt: Date;
}

// Controller request
interface CreatePaymentRequestRequest {
  shopperUserId: string;
  saleId: string;
  itemIds: string[];
  totalAmountCents: number;
  expiresInSeconds?: number;
}

// Controller response
interface CreatePaymentRequestResponse {
  requestId: string;
  status: string;
  shopperName: string;
  totalAmountCents: number;
  expiresAt: string;
  stripePaymentIntentId?: string;
  stripePaymentIntentSecret?: string;
}

// Socket event
interface POSPaymentRequestEvent {
  type: "POS_PAYMENT_REQUEST";
  requestId: string;
  organizerName: string;
  saleName: string;
  saleLocation?: string;
  itemNames: string[];
  totalAmountCents: number;
  displayAmount: string;
  expiresAt: string;
  expiresIn: number;
  stripePaymentIntentSecret?: string;
  deepLink: string;
}
```

---

## 12. Questions for Patrick

1. **Tier gating:** Is POS in-app payment request available to SIMPLE, or PRO+ only?
2. **Expiration:** 15 minutes (900s) reasonable? Or different?
3. **Organizer notifications:** Email notification when shopper declines? Or just socket event to dashboard?
4. **Multiple requests:** Can organizer send multiple requests to same shopper for same sale? (Risk of duplicate payments.)
5. **Platform fee:** Always 10% flat? Or negotiated?
6. **Email notification to shopper:** Send email notification in addition to in-app, or in-app only?

---

## 13. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Duplicate payments (2 requests sent, both paid) | Low | High | De-dup check: reject new requests if request.status != PAID for same shopper+items in last 60s |
| Shopper never sees notification (offline) | Medium | Medium | Notification inbox + email (Phase 2) |
| Stripe fee estimate wrong | Low | Low | Show estimate with disclaimer; actual charged on payment |
| Item sold by organizer before request accepted | Medium | Medium | Re-check item status on /accept; if SOLD, reject request |
| Payment intent expires before shopper acts | Low | Low | 15 min timeout reasonable; request can be re-sent |

---

## 14. Testing Strategy

### Unit Tests
- POSPaymentRequest creation validation
- Status transition logic (PENDING → ACCEPTED → PAID)
- Expiration check on accept/decline
- Stripe intent metadata parsing

### Integration Tests
- Full flow: send request → shopper accepts → pays → webhook → marked SOLD
- Offline flow: send request → shopper offline → notification inbox → pay later
- Error cases: invalid shopper, unavailable item, expired request, payment failed

### Manual QA (Chrome + 2 devices)
- Device 1 (organizer): POS terminal, send request
- Device 2 (shopper): receive socket event → navigate to page → accept → pay
- Verify items marked SOLD on organizer side
- Verify receipt sent to shopper

---

## 15. Schema Validation Checklist

- [x] POSPaymentRequest model designed
- [x] Indexes chosen for query patterns (organizerId, shopperUserId, status, expiresAt)
- [x] Foreign key constraints correct (Organizer, User, Sale)
- [x] Cascade delete configured
- [x] Stripe PI storage fields adequate (String, varchar(255) for secret)
- [x] Status enum clear and exhaustive
- [x] Timestamp fields consistent (createdAt, updatedAt, requestedAt, acceptedAt, paidAt, expiresAt)

---

## Approval Checklist

- [ ] Patrick approves feature scope & tier gating
- [ ] Patrick confirms API endpoint contracts
- [ ] Patrick confirms Socket.io event names (no conflicts with existing)
- [ ] Architect confirms schema design and knock-on effects
- [ ] Dev ready to implement (schema → backend → frontend)

