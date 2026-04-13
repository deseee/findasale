# POS In-App Payment Request — Architecture Summary for Patrick

**Feature:** Allow organizers to send payment requests directly to linked shoppers in the POS. Shoppers receive the request in real time (Socket.io) and pay without leaving FindA.Sale.

**Problem it solves:** Current POS → shopper workflow requires scanning QR code → leaving app → Stripe payment page. New flow: organizer clicks "send" → shopper gets in-app notification → pays in modal → done (all in FindA.Sale).

---

## What We're Building

### 1. New Database Model: `POSPaymentRequest`
- Tracks payment requests from organizer → shopper
- Status: PENDING → ACCEPTED → PAID (or DECLINED/EXPIRED)
- Stores Stripe Payment Intent ID + secret
- 15-minute expiration window
- One migration SQL file required

### 2. Three New API Endpoints

**POST /api/pos/payment-request** (organizer sends)
- Input: shopperUserId, saleId, itemIds, totalAmountCents, expiresInSeconds
- Creates request + Stripe payment intent upfront
- Sends Socket.io event to shopper + creates notification
- Returns: requestId, stripe secret for frontend

**POST /api/pos/payment-request/:requestId/accept** (shopper accepts)
- Shopper reviews + confirms
- Updates status to ACCEPTED
- Emits socket event to organizer (confirmation)

**POST /api/pos/payment-request/:requestId/decline** (shopper declines)
- Shopper rejects
- Optional reason: USER_CANCEL, INSUFFICIENT_FUNDS, etc.
- Emits socket event to organizer

### 3. Socket.io Events (Real Time)

**`POS_PAYMENT_REQUEST`** (organizer → backend → shopper)
- Sent immediately when organizer creates request
- Contains: organizer name, sale name, item list, amount, expiration timer
- Includes stripe secret for payment form

**`POS_PAYMENT_STATUS`** (backend → organizer + shopper)
- Sent when status changes (ACCEPTED, PAID, DECLINED, EXPIRED)
- Lets organizer know in real time if payment cleared

### 4. New Frontend Page: `/shopper/pay-request/:requestId`
- Displays payment request summary
- Shows countdown timer (expires in X seconds)
- "Accept & Pay" button → opens Stripe payment form (card element)
- "Decline" button
- Real-time updates via socket listener
- On payment success → redirect to `/shopper/purchases`

### 5. Stripe Webhook Integration (Existing Handler)
- Update `payment_intent.succeeded` handler to detect POS requests
- When POS request paid:
  - Mark items SOLD
  - Create Purchase records
  - Award XP to shopper
  - Send receipt email
  - Emit socket event to organizer (payment complete)

---

## File Changes Summary

### Backend
| File | Change |
|------|--------|
| `packages/database/prisma/schema.prisma` | Add POSPaymentRequest model |
| `packages/backend/src/routes/pos.ts` | Add 3 route handlers |
| `packages/backend/src/controllers/posController.ts` | Implement 3 endpoint functions |
| `packages/backend/src/controllers/stripeController.ts` | Update webhook for POS requests |

**No changes needed to:** socket.ts, notificationService (existing models work)

### Frontend
| File | Change |
|------|--------|
| `packages/frontend/pages/shopper/pay-request/[requestId].tsx` | **New page** |
| `packages/frontend/components/PaymentRequestForm.tsx` | **New component** |
| `packages/frontend/hooks/usePOSPaymentRequest.ts` | **New hook** |
| `packages/frontend/lib/types/index.ts` | Add POSPaymentRequest types |

---

## Key Decisions Made

1. **Dedicated model:** POSPaymentRequest is separate from HoldInvoice (cleaner, different lifecycle)
2. **Intent upfront:** Create Stripe Payment Intent immediately when organizer sends (faster payment flow)
3. **15-min window:** Requests expire in 15 minutes (reasonable for in-person use)
4. **Socket + fallback:** Real-time Socket.io + notification inbox (works even if shopper offline)
5. **Existing Notification model:** Reuse Notification table (no new schema needed for fallback)

---

## Questions Needing Your Input

1. **Tier gating:** Available to PRO+ only, or all organizers (even SIMPLE)?
2. **Concurrent limit:** PRO = 5 requests/sale, TEAMS = unlimited? (Or different?)
3. **Shopper notification:** Email notification, or in-app only?
4. **Duplicate prevention:** How aggressively prevent duplicate payment requests? (Re-send safety?)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Shopper never sees notification (offline for 15 min) | Notification inbox visible on next login |
| Duplicate payments (2 requests paid) | De-dup check on webhook (one request per shopper+items within 60s) |
| Item sold before shopper pays | Re-check item status on /accept endpoint |
| Stripe fee estimate wrong | Show as estimate; actual charged on payment |

---

## Timeline & Complexity

**Complexity:** Medium (schema change + webhook update + new frontend route)

**Backend work:** ~4–6 hours (schema + 3 endpoints + webhook update)

**Frontend work:** ~3–4 hours (page + form + socket listener)

**QA:** ~2 hours (full e2e + edge cases)

**Total:** ~1 day of focused dev work

---

## Success Criteria

- [ ] Organizer can send payment request from POS
- [ ] Shopper receives in-app notification immediately (Socket.io)
- [ ] Shopper navigates to payment page, sees request details
- [ ] Shopper clicks "Accept & Pay", Stripe form appears
- [ ] After payment, items marked SOLD on organizer side
- [ ] Organizer sees real-time confirmation (socket event)
- [ ] Receipt email sent to shopper
- [ ] Request expires after 15 min (shopper can't pay after expiration)
- [ ] Works for all shopper tiers / all organizer tiers

---

## Architecture Decision Record

Full details in: `claude_docs/architecture/POS_IN_APP_PAYMENT_REQUEST_ADR.md`

This document includes:
- Complete schema design with migrations
- Socket.io event payloads
- Endpoint specifications
- Typescript interfaces
- Webhook handler changes
- Implementation order
- Testing strategy
- Risk assessment

