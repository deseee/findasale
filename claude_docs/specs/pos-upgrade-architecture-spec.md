# POS Upgrade Architecture Spec

**Date:** 2026-04-04
**Status:** Planning — No implementation code written
**Scope:** 5 new POS feature capabilities for FindA.Sale organizers
**Authority:** Architect role — locked decisions apply (Stripe Connect, 10% flat fee, Next.js 14, Cloudinary)

---

## 1. System Overview

FindA.Sale POS upgrade extends the existing Stripe Terminal in-person checkout (already v2-capable) with **5 new capabilities:**

1. **Camera QR Scanning** — Organizer scans item QR pricetags; items auto-add to cart
2. **Manual Card Entry** — Organizer keys in shopper's card (card-not-present, higher Stripe fees)
3. **Stripe Payment QR Codes** — Generate QR → shopper scans → pays on their phone via Stripe Payment Link
4. **Invoice via Email/SMS** — Send Stripe invoice for holds/reservations/pay-later scenarios
5. **Open Carts** — Shoppers scan item QRs in app while browsing; cashier pulls cart, verifies, pushes payment back to shopper's app (real-time sync via Socket.io)

These features assume:
- Stripe Connect Express already active (organizer-on-boarded)
- Item QR codes exist (each Item has a qrCode URL already generated)
- Socket.io backbone already deployed (auctions use it)
- Terminals already in production (stripeConnectId present)

---

## 2. Schema Changes

### New Models

#### `POSSession`
```prisma
model POSSession {
  id                String   @id @default(cuid())
  organizerId       String
  organizer         Organizer @relation(fields: [organizerId], references: [id], onDelete: Cascade)
  saleId            String
  sale              Sale     @relation(fields: [saleId], references: [id], onDelete: Cascade)

  // Active cart items
  items             POSLineItem[]

  // Session state
  status            String   @default("OPEN")  // OPEN | PAYMENT_PENDING | COMPLETED | ABANDONED
  cartTotal         Int      // in cents
  discountAmount    Int      @default(0)       // in cents (platform doesn't apply, organizer's discretion)
  platformFeeAmount Int      // in cents (calculated at payment)

  // Payment method (track which method was used)
  paymentMethod     String?  // "CARD_PRESENT" | "CARD_NOT_PRESENT" | "PAYMENT_LINK" | "INVOICE" | null
  stripePaymentIntentId String?  // for card present/not present
  stripeInvoiceId   String?     // for invoice method
  stripePaymentLinkId String?    // for payment link method

  // Real-time sync (for open carts)
  shopperId         String?
  shopper           User?    @relation(fields: [shopperId], references: [id], onDelete: SetNull)
  linkedAt          DateTime?  // when shopper linked their app to this session

  // Timestamps
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  completedAt       DateTime?
  expiresAt         DateTime?  // session expires after 1 hour idle

  @@index([organizerId, saleId, status])
  @@index([shopperId])
  @@index([expiresAt])
}

model POSLineItem {
  id                String   @id @default(cuid())
  posSessionId      String
  posSession        POSSession @relation(fields: [posSessionId], references: [id], onDelete: Cascade)

  itemId            String
  item              Item     @relation(fields: [itemId], references: [id], onDelete: Restrict)

  quantity          Int      @default(1)
  pricePerUnit      Int      // in cents (item's sale price at time of add)
  lineTotal         Int      // in cents (pricePerUnit × quantity)

  addedVia          String   // "QR_SCAN" | "MANUAL" | "SHOPPER_CART"
  addedAt           DateTime @default(now())

  @@index([posSessionId])
  @@index([itemId])
}
```

#### `POSPaymentLink`
```prisma
model POSPaymentLink {
  id                  String   @id @default(cuid())
  organizerId         String
  organizer           Organizer @relation(fields: [organizerId], references: [id], onDelete: Cascade)

  stripePaymentLinkId String   @unique  // Stripe API ID
  qrCodeUrl           String            // Generated QR code URL (Stripe or self-hosted)

  amount              Int              // in cents
  currency            String   @default("USD")

  // Metadata
  saleId              String?
  sale                Sale?    @relation(fields: [saleId], references: [id], onDelete: SetNull)
  itemIds             String[] // items included in this link

  // State tracking
  status              String   @default("ACTIVE")  // ACTIVE | EXPIRED | COMPLETED | CANCELLED
  createdAt           DateTime @default(now())
  expiresAt           DateTime?
  completedAt         DateTime?

  // Track purchases via this link
  stripeCheckoutSessionId String?  // if user checks out via Payment Link

  @@index([organizerId, status])
  @@index([saleId])
}

model POSInvoice {
  id                String   @id @default(cuid())
  organizerId       String
  organizer         Organizer @relation(fields: [organizerId], references: [id], onDelete: Cascade)

  shopperId         String
  shopper           User     @relation(fields: [shopperId], references: [id], onDelete: Restrict)

  saleId            String
  sale              Sale     @relation(fields: [saleId], references: [id], onDelete: Cascade)

  stripeInvoiceId   String   @unique  // Stripe Invoicing API ID

  // Content
  itemIds           String[]  // items in this invoice
  totalAmount       Int       // in cents
  platformFeeAmount Int       // in cents

  // Delivery
  sentVia           String?   // "EMAIL" | "SMS" | null (not sent yet)
  sentAt            DateTime?

  // Payment tracking
  paidAt            DateTime?
  status            String    @default("DRAFT")  // DRAFT | SENT | VIEWED | PAID | FAILED | CANCELLED

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([organizerId, saleId, status])
  @@index([shopperId])
}
```

### Model Updates (existing)

Add to `Item`:
```prisma
model Item {
  // ... existing fields ...
  qrCode            String?   // URL to item-specific QR code (already exists or will be added)
  posLineItems      POSLineItem[] // back-relation for open carts
}

model Organizer {
  // ... existing fields ...
  posSessions       POSSession[]
  posPaymentLinks   POSPaymentLink[]
  posInvoices       POSInvoice[]
}

model Sale {
  // ... existing fields ...
  posSessions       POSSession[]
  posPaymentLinks   POSPaymentLink[]
  posInvoices       POSInvoice[]
}

model User {
  // ... existing fields (if not already present) ...
  posInvoicesAsShoppers POSInvoice[] @relation("ShopperInvoices")
  linkedPOSSessions POSSession[]  // for open cart linking
}
```

### Migration Plan

1. **Phase 1 — Schema Create:** Prisma `create migration` with 3 new models + 2 updated model relations
2. **Phase 2 — Seed (optional):** No seed needed for new tables (user-generated data)
3. **Phase 3 — Deploy Migration:**
   ```powershell
   cd packages/database
   $env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
   npx prisma migrate deploy
   npx prisma generate
   ```
4. **Rollback Plan:** If migration fails, `prisma migrate resolve --rolled-back [migration-name]` (applies only to production DB; local rolls back immediately)

---

## 3. API Contracts

All endpoints require organizer JWT. Responses include standard error structure: `{ message: string, code?: string }`.

### QR Code Scanning

**POST `/api/pos/sessions/:sessionId/scan-qr`**
- Body: `{ qrCode: string }`
- Response: `{ success: true, lineItem: POSLineItem, cartTotal: number }`
- Logic:
  - Validate `qrCode` format (item ID embedded in QR or raw item ID)
  - Lookup Item by ID
  - Check item belongs to this sale
  - Create POSLineItem with `addedVia: "QR_SCAN"`
  - Update POSSession cartTotal
  - Emit Socket.io event `pos:item-added` (for open cart sync)
- Error: 404 (item not found), 400 (item not in sale), 409 (item already sold)

### Manual Card Entry

**POST `/api/stripe/terminal/manual-card-payment`**
- Body: `{ sessionId: string, cardNumber: string, expiry: string, cvc: string, zip: string, amount: number }`
- Response: `{ success: true, paymentIntentId: string, requiresAction: boolean }`
- Logic:
  - Create Stripe PaymentIntent (manual capture)
  - Use `payment_method_data` with card details (CNP)
  - Apply higher Stripe fee (~3.7% vs 3.2% for card-present)
  - Confirm payment immediately (no separate capture step)
  - Update POSSession status to PAYMENT_PENDING
  - Emit webhook/event for receipt
- PCI: Card data is sent directly to Stripe, never stored locally (PCI-DSS requirement)
- Error: 400 (invalid card), 402 (payment declined)

### Stripe Payment QR Codes

**POST `/api/pos/payment-links/create`**
- Body: `{ saleId: string, itemIds: string[], amount: number }`
- Response: `{ success: true, paymentLinkId: string, qrCodeUrl: string }`
- Logic:
  - Create Stripe Payment Link (`stripe.paymentLinks.create`)
  - Generate QR code pointing to Payment Link (Stripe or qrserver.com)
  - Store POSPaymentLink record
  - Emit qrCodeUrl to frontend for display/printing
- Stripe automatically handles:
  - Payment collection on shopper's phone
  - Webhook confirmation to update status
  - Tax/fee calculation
- Expiry: 24 hours (configurable)

**GET `/api/pos/payment-links/:linkId`**
- Response: `{ linkId: string, qrCodeUrl: string, amount: number, status: string, completedAt?: string }`

**POST `/api/pos/payment-links/:linkId/cancel`**
- Response: `{ success: true, status: "CANCELLED" }`

### Invoice via Email/SMS

**POST `/api/pos/invoices/create`**
- Body: `{ saleId: string, shopperId: string, itemIds: string[], deliverVia: "EMAIL" | "SMS" }`
- Response: `{ success: true, invoiceId: string, sentAt: string }`
- Logic:
  - Create Stripe Invoice (using Invoicing API)
  - Store POSInvoice record
  - Send via Resend (email) or Twilio (SMS)
  - Email includes Stripe payment link; SMS includes shortened payment link
  - Update status to SENT
- Email template: Order summary, item list, organizer name, payment link
- SMS: "Hi [Shopper], your sale from [Organizer] is ready. Pay: [shortened link]"

**GET `/api/pos/invoices/:invoiceId`**
- Response: `{ invoiceId: string, status: string, totalAmount: number, paidAt?: string }`

**POST `/api/pos/invoices/:invoiceId/resend`**
- Body: `{ deliverVia: "EMAIL" | "SMS" }`
- Response: `{ success: true, sentAt: string }`

### Open Carts (Real-time Sync)

**POST `/api/pos/sessions/create`**
- Body: `{ saleId: string }`
- Response: `{ sessionId: string, joinCode: string }`
- Logic:
  - Create POSSession record
  - Generate 6-digit `joinCode` (human-readable code for app linking)
  - Emit Socket.io event `pos:session-created`

**POST `/api/pos/sessions/:sessionId/link-shopper`**
- Body: `{ joinCode: string }` (sent from shopper's app)
- Response: `{ success: true, linkedAt: string }`
- Logic:
  - Validate joinCode
  - Set POSSession.shopperId and linkedAt
  - Emit Socket.io `pos:shopper-linked` → shopper receives their active cart
  - Shopper's app now shows items as they're scanned by cashier

**POST `/api/pos/sessions/:sessionId/push-to-shopper`**
- Body: `{}`
- Response: `{ success: true, paymentUrl: string }`
- Logic:
  - Create Stripe Payment Intent for POSSession.cartTotal
  - Create or reuse POSPaymentLink pointing to this intent
  - Emit Socket.io `pos:payment-requested` + payment link to shopper's app
  - Shopper receives notification: "Checkout ready — tap to pay $X.XX"
  - Shopper confirms payment in their app

**Socket.io Events (Organizer → Shopper sync):**
- `pos:item-added { lineItem, cartTotal }` — real-time cart update
- `pos:item-removed { itemId, cartTotal }` — shopper can see items being removed
- `pos:payment-requested { paymentUrl, cartTotal, expiresAt }` — checkout initiated
- `pos:payment-completed { cartTotal, items, receipt }` — post-purchase
- `pos:session-closed` — cashier ended session, clear shopper's cart

**Socket.io Events (Shopper → Organizer sync):**
- `pos:shopper-linked { shopperId, appVersion }` — confirmation that app is connected
- `pos:payment-confirmed { amount, timestamp }` — shopper tapped "pay"

---

## 4. Cross-Layer Contracts

**Database (Prisma):** Owns `POSSession`, `POSLineItem`, `POSPaymentLink`, `POSInvoice` models and all schema migrations. No queries outside database package.

**Backend (Express):**
- Owns all API endpoints (routes in `/routes/pos.ts`)
- Owns Stripe API calls (new methods in `stripeController.ts` or `posController.ts`)
- Owns Socket.io event broadcasting (via `/lib/socket.ts`)
- Owns email/SMS sending logic (Resend/Twilio calls for invoices)

**Frontend (Next.js):**
- Owns `pages/organizer/pos/` (dashboard, session mgmt, QR scanner, manual card entry UI)
- Owns `pages/shopper/checkout/` (real-time cart display, payment confirmation)
- Owns Socket.io listeners (connect to organizer's session via joinCode)
- Owns QR code rendering (display Payment Link QR or session joinCode QR)

**Shared (TypeScript types):**
- `POSSession`, `POSLineItem`, `POSPaymentLink`, `POSInvoice` types (exported from database package client)
- `POSEventPayload` union for Socket.io events
- API request/response types for all 10+ endpoints

---

## 5. Stripe Integration Details

### Payment Methods by Feature

| Feature | Stripe API | Key Params | Fee | Complexity |
|---------|-----------|-----------|-----|------------|
| Card Present (existing Terminal) | Terminal + Payment Intent | `capture_method: manual` | 3.2% + $0.10 | Low |
| Card Not Present (manual entry) | Payment Intent + `payment_method_data` | `type: card`, tokenize via Stripe | 3.7% + $0.10 | Medium |
| Payment Link (shopper self-checkout) | Payment Links API | `line_items[]`, auto-generate Payment Link URL | 3.2% + $0.10 | Low |
| Invoice (pay-later) | Invoicing API + Email | `stripe.invoices.create()` + webhook | 3.2% + $0.10 | Medium |
| Terminal (in-person) | Terminal API (v2, existing) | Reader discovery, connection token | 3.2% + $0.10 | High |

### API Workflow Examples

#### Manual Card Entry Flow
```
1. Organizer enters card details in app
2. Backend: stripe.paymentIntents.create({
     amount: cartTotal,
     currency: "usd",
     payment_method_data: {
       type: "card",
       card: { number, exp_month, exp_year, cvc }
     },
     confirm: true
   })
3. Stripe processes immediately (CNP, higher risk)
4. Webhook: payment_intent.succeeded → update POSSession
5. Receipt emitted to frontend
```

#### Payment Link + QR Flow
```
1. Backend: stripe.paymentLinks.create({
     line_items: [{ price_data: { currency, unit_amount }, quantity: 1 }],
     after_completion: { type: "redirect", redirect: { url: ... } }
   })
2. Stripe returns paymentLink.url + custom_fields (for item list)
3. Generate QR code → qrserver.com/api/generate?format=svg&data=[paymentLink.url]
4. Display QR to organizer or shopper
5. Webhook: checkout.session.completed → update POSPaymentLink status
```

#### Stripe Invoice Flow
```
1. Backend: stripe.invoices.create({
     customer: shopperId (maps to shopper's Stripe customer ID),
     collection_method: "send_invoice",
     days_due: 1,
     lines: [{ price_data: { currency, unit_amount }, quantity: 1 }]
   })
2. Backend: stripe.invoices.sendInvoice(invoiceId)
3. Shopper receives email with Stripe's hosted payment page
4. Webhook: invoice.payment_succeeded → update POSInvoice status
```

### Application Fee (10% Platform Fee)

Ensure all Stripe operations include `application_fee_amount`:
```typescript
const platformFeeAmount = Math.round(total * 0.10);
stripe.paymentIntents.create({
  // ...
  application_fee_amount: platformFeeAmount,
  stripeAccount: organizer.stripeConnectId
});
```

---

## 6. Real-time Requirements

### Socket.io Integration

**Namespace:** `/pos`

**Server Listeners:**
- `pos:join-session { sessionId, joinCode, shopperId }` — shopper joins organizer's session
- `pos:leave-session { sessionId }` — shopper exits or organizer closes session
- `pos:item-scan { sessionId, qrCode }` — QR scanned, processed server-side
- `pos:payment-ready { sessionId }` — organizer ready to charge

**Server Emitters:**
- `pos:item-added` → all connected clients in session
- `pos:item-removed` → all connected clients
- `pos:cart-updated { cartTotal, itemCount }` → real-time totals
- `pos:payment-initiated { paymentUrl }` → shopper receives link
- `pos:payment-confirmed { amount, timestamp }` → organizer sees confirmation

**State Management:**
- Server maintains in-memory `posSessionStates` map: `sessionId → { items, total, shopper, status }`
- On organizer disconnect: session expires after 5 minutes
- On shopper disconnect: session persists (shopper may reconnect)
- Cart survives page refresh (retrieved from DB on reconnect)

**Scaling Considerations:**
- Sessions are organizer-scoped (one session per POS terminal per sale)
- Expect 1–3 concurrent users per session
- No fan-out required; messages go to 2 clients max (organizer + shopper)
- Redis pub/sub not required for initial launch (monolith Socket.io sufficient)

---

## 7. QR Code Strategy

### Existing Item QRs
- Each Item already has `item.qrCode` field (URL)
- QR encodes: `https://finda.sale/qr/items/[itemId]` or bare `[itemId]` (TBD)
- When organizer scans in POS, backend decodes and looks up by itemId

### New QR Types for POS

**Session JoinCode QR (Open Cart):**
- Format: `https://finda.sale/join-pos/[sessionId]/[joinCode]`
- Display: POS screen shows QR, shopper scans with camera or app
- 6-digit numeric code is also human-readable (fallback if QR fails)

**Payment Link QR (Shopper Checkout):**
- Stripe generates URL: `https://buy.stripe.com/[token]`
- We wrap it in QR via qrserver.com API
- Shopper scans → redirects to Stripe Payment Link
- QR code printed or displayed on POS terminal screen

**Implementation:**
- Use `qr-code-styling` npm package (npm install qr-code-styling)
- Generate as SVG → embed in frontend or convert to image
- Store URL in POSPaymentLink.qrCodeUrl (Cloudinary or data URI)

---

## 8. Security Considerations

### PCI-DSS Compliance (Card Data)

- **NEVER** log, store, or transmit raw card numbers, expiry, CVC
- Card data flows: Organizer → HTTPS → Stripe API directly
- Backend receives only `paymentMethodId` or `token`, never raw card
- Use Stripe's `payment_method_data` tokenization (not manual tokenization)

### Fraud Prevention

- Implement Stripe's 3D Secure (3DS) for card-not-present payments (mandatory for high-risk)
- Log IP addresses for all POS sessions (already in schema: `getClientIp()`)
- Rate limit `/api/pos/sessions/*/scan-qr` to prevent cart-stuffing (10 scans/min per session)
- Validate item ownership (item.saleId must match POSSession.saleId)

### Auth & Permissions

- All POS endpoints require organizer JWT
- Session ID must be cryptographically random (cuid is sufficient)
- Shopper can only view/pay for their own linked session (auth on Socket.io events)
- Organizer cannot modify a session after payment is confirmed

### Invoice Delivery

- Email: Use Resend (encrypted transport)
- SMS: Use Twilio (only after user opts in — check User.notificationPrefs)
- Never send sensitive details (card last-4, full amounts) in SMS

---

## 9. Implementation Sequence

### Phase 1: Foundation (Week 1)
- **Schema:** Prisma migration for POSSession, POSLineItem
- **Backend:** POST `/api/pos/sessions/create`, basic CRUD
- **Frontend:** POS dashboard stub (organizer list active sessions)
- **Acceptance:** Organizer creates session, sees cartTotal increment

### Phase 2: QR Scanning (Week 2)
- **Backend:** POST `/api/pos/sessions/:sessionId/scan-qr` + item validation
- **Frontend:** QR scanner UI (use `react-webcam` + `jsqr` library)
- **Socket.io:** Emit `pos:item-added` on scan
- **Acceptance:** Organizer scans item QR, cart updates in real-time

### Phase 3: Payment Methods (Week 3)
- **Backend:** Stripe Payment Intent creation (card-present Terminal already exists)
- **Backend:** Manual card entry endpoint + CNP tokenization
- **Frontend:** Manual card entry form (organizer inputs for shopper if needed)
- **Acceptance:** Organizer completes payment via card, receipt sent

### Phase 4: Payment Links + Invoices (Week 4)
- **Backend:** Stripe Payment Link creation + QR generation
- **Backend:** Stripe Invoice creation + email/SMS delivery
- **Frontend:** Payment Link QR display + modal
- **Acceptance:** Shopper scans QR, completes payment on phone; invoice email sends

### Phase 5: Open Carts + Real-time Sync (Week 5)
- **Backend:** Socket.io namespace + session join logic
- **Backend:** POST `/api/pos/sessions/:sessionId/push-to-shopper`
- **Frontend (Shopper):** Real-time cart display, payment request modal
- **Frontend (Organizer):** Link shopper UI, push payment button
- **Acceptance:** Organizer scans, shopper sees cart live; organizer pushes payment link

### Phase 6: Polish & QA (Week 6)
- Offline fallback for QR scanning (local queue if network drops)
- Error handling (declined cards, expired sessions, network errors)
- Full smoke test: all 5 features end-to-end
- Organizer + shopper UX feedback loops

---

## 10. Edge Cases & Fallback Strategies

| Scenario | Handling |
|----------|----------|
| **Organizer closes POS before payment** | POSSession expires after 1 hour; cart items released back to available inventory |
| **Shopper leaves session without paying** | Session persists; organizer can close manually or auto-close after 30 min idle |
| **Card payment declined** | PaymentIntent fails; organizer can retry or switch payment method |
| **Network drops during scan** | QR code stored locally (service worker); retransmit on reconnect |
| **Stripe API timeout** | Retry with exponential backoff (3 retries, then fail gracefully) |
| **Payment Link expires** | User sees "link expired" → organizer creates new link + re-sends QR |
| **Shopper scans same item twice** | Increment quantity (POSLineItem.quantity += 1) instead of duplicate |
| **Organizer refunds after POS payment** | Use Stripe Refunds API; no special POS logic needed (existing refund flow) |
| **Multiple organizers on same sale** | Each organizer gets isolated POSSession (organizerId scoped); no cross-organizer cart sharing |

---

## 11. Rollback Plan

### Schema Rollback
If migration fails in production:
```powershell
cd packages/database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate resolve --rolled-back [migration-name]
# OR: manually run SQL to drop tables (generated from Prisma)
```

### Code Rollback
- Revert commit on GitHub
- Kill running Railway backend (auto-redeploy triggers on commit)
- If POS UI remains: hide feature behind feature flag `NEXT_PUBLIC_POS_ENABLED=false`

### Data Cleanup
- POSSessions older than 24 hours auto-expire (cron task)
- Abandoned POSPaymentLinks (not completed) expire after 48 hours
- Unreferenced POSInvoices deleted after 90 days

---

## 12. Monitoring & Observability

### Metrics to Track
- **POS Sessions:** Active sessions, avg cart size, completion rate
- **Payment Methods:** Distribution (card-present vs manual vs link vs invoice)
- **Errors:** Stripe API failures, QR decode failures, payment failures
- **Socket.io:** Connection count, event latency, disconnect rate

### Alerting Thresholds
- Stripe API error rate > 2% → page on-call
- Socket.io disconnect rate > 5% → investigate network/server
- Payment Link expiry before completion → log warning

### Logging
- All Stripe API calls: method, amount, fee, response time
- All QR scans: itemId, timestamp, success/failure
- All Socket.io events: namespace, event type, user count, latency

---

## Summary

This spec enables 5 POS capabilities with minimal schema changes (3 new models + 4 relations) and leverages existing Stripe + Socket.io infrastructure. Total API surface: ~12 endpoints + 4 Socket.io events. No new external dependencies required beyond what's already locked (Stripe, Resend, Twilio).

**Next Step:** Dispatch to findasale-dev for implementation starting with Phase 1 (foundation). Each phase depends on prior phase(s) except Phase 4, which can run in parallel with Phase 3 after week 3 checkpoint.
