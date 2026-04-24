# ADR-070: Mark Sold → POS Cart & Stripe Invoice Evolution

**Date:** 2026-04-23  
**Status:** RECOMMENDED  
**Scope:** Item.status SOLD workflow, Stripe checkout integration  
**Affected Models:** Item, Purchase, POSSession, POSPaymentLink, Sale  

---

## Problem Statement

Currently, organizers mark items as sold via a single-item status update endpoint. This leaves value on the table:

1. **In-person at a sale:** Organizers ring up multiple items together (typical estate sale, yard sale, flea market flow) but FindA.Sale forces item-by-item checkout. No cart, no aggregate total, no terminal payment.
2. **Remote buyers:** Organizers have no way to generate a shareable payment link (no Stripe checkout link, no invoice). Buyer must navigate the full app or call the organizer.
3. **Data model:** The existing `Purchase` model is single-item per row (one itemId per Purchase). Building a multi-item cart on this model is awkward — either create multiple Purchase rows and link them to one PaymentIntent (current pattern), or redesign to support LineItems.
4. **Sale type variance:** An estate sale organizer wants a quick in-person POS flow. A consignment organizer wants remotely-generated Stripe checkout links. The UI/UX should reflect the right interaction model for each organizer's sale type.

---

## Current State

### Existing Models & Patterns

- **Item.status:** AVAILABLE, SOLD, RESERVED, AUCTION_ENDED, DONATED  
- **Purchase:** One row per item-transaction pair. Multi-item carts are multiple Purchase rows sharing one `stripePaymentIntentId`  
- **POSSession:** Exists (status: OPEN, PULLED, COMPLETED, ABANDONED) — stores cart as JSON array `cartItems[]`  
- **POSPaymentLink:** Exists — creates Stripe Payment Link for a POS sale, stores `itemIds[]` and `purchaseIds[]`  
- **Stripe:** PaymentIntents (existing) and Payment Links (exists but underused)

### Current Mark Sold Flow

1. Organizer clicks "Mark Sold" on an item
2. Item.status → SOLD
3. Creates a Purchase record (single item)
4. Optionally creates a stripePaymentIntentId if paid online

**Limitation:** No aggregation, no remote link generation, no invoice PDF.

---

## Options Considered

### Option A: Leave POSPaymentLink as-is, add Invoice Generator

**Approach:** Extend the existing POSPaymentLink model to support invoice PDFs. Organizers call "Generate Payment Link" per sale, which batches items and creates a Stripe Payment Link.

**Pros:**
- Minimal schema changes (just add invoice fields to POSPaymentLink)
- Reuses existing POS infrastructure

**Cons:**
- Doesn't address the in-person multi-item flow; organizers still ring up item-by-item
- POS cart (POSSession) and payment link are separate concepts; no unification
- No native invoice PDF support (third-party required)
- Organizers must manually decide when to generate a link (no organic "add to cart → checkout" flow)

**Recommendation:** ❌ Insufficient for the use case. POS and remote invoice are too different to merge without a unified cart model.

---

### Option B: Unified Cart Model (LineItem-based, Multi-Mode Checkout)

**Approach:** Introduce a `Cart` model that centralizes item aggregation. One Cart can be checked out via:
1. **Terminal (in-person):** POS organizer pulls the cart, processes payment at terminal
2. **Stripe Checkout Link (remote):** Organizer generates a sharable checkout link for the cart
3. **Stripe Payment Link (remote, self-serve):** Buyer scans QR, self-checks out

**Schema Changes:**

```prisma
model Cart {
  id            String    @id @default(cuid())
  organizerId   String
  organizer     Organizer @relation(fields: [organizerId], references: [id], onDelete: Cascade)
  saleId        String
  sale          Sale      @relation(fields: [saleId], references: [id], onDelete: Cascade)
  shopperId     String?
  shopper       User?     @relation("CartShopper", fields: [shopperId], references: [id], onDelete: SetNull)
  lineItems     LineItem[]
  totalAmount   Float     @default(0) // cached for perf
  status        String    @default("OPEN") // OPEN, PROCESSING, ABANDONED, COMPLETED
  
  // Terminal checkout (POS)
  terminalSessionId String? // links to optional future TerminalSession for pin pad integration
  
  // Remote checkout (Stripe)
  stripeCheckoutSessionId String? // Stripe Checkout Session (temporary, single-use)
  stripePaymentLinkId    String? // Stripe Payment Link (persistent, reusable)
  stripePaymentLinkUrl   String? // buy.stripe.com/... URL
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  expiresAt     DateTime? // 24h for remote links
  completedAt   DateTime?
  
  @@index([organizerId, status])
  @@index([shopperId])
  @@index([expiresAt])
}

model LineItem {
  id          String  @id @default(cuid())
  cartId      String
  cart        Cart    @relation(fields: [cartId], references: [id], onDelete: Cascade)
  itemId      String
  item        Item    @relation(fields: [itemId], references: [id], onDelete: Cascade)
  quantity    Int     @default(1)
  unitPrice   Float
  discount    Float?  @default(0) // e.g. bundle discount
  lineTotal   Float   // unitPrice * quantity - discount
  
  @@unique([cartId, itemId]) // one item per cart
  @@index([itemId])
}
```

**Checkout Outcomes:**

1. **POS Terminal:** Organizer pulls cart, integrates with Square/Clover pin pad, creates Purchase records on success, items → SOLD
2. **Stripe Checkout Link:** Organizer sends cart link to buyer, buyer completes payment via Checkout Session, webhook creates Purchase records, items → SOLD
3. **Stripe Payment Link:** Organizer generates reusable QR, buyer scans, self-checks out via Payment Link, webhook creates Purchase records, items → SOLD

**Purchase Changes:**

- Keep Purchase model as-is (one row per item)
- Add new field: `cartId` (optional) to link Purchase back to the Cart it came from
- A completed Cart with N items creates N Purchase rows, all with the same cartId

**Pros:**
- Unified model for all checkout modes (POS, Stripe Checkout, Payment Link)
- Clear aggregation boundary (Cart = the transaction unit)
- LineItem enforces one item per cart (prevents duplicate adds)
- Easy to add discounts, tax, tips per-cart
- Remote organizers can email/QR-code a payment link
- In-person organizers get a native multi-item cart
- Reusable Stripe Payment Links (not consumed after one use, unlike Checkout Sessions)

**Cons:**
- Larger schema change (adds 2 new models)
- Terminal integration requires pin pad vendor (Square, Clover, etc.) — not in scope yet, but architecture allows it
- Need to backfill migration for existing POSSession → Cart data

**Recommendation:** ✅ **PRIMARY CHOICE** — This is the correct long-term architecture. Unifies all checkout modes under one model.

---

### Option C: Extend Purchase to LineItem (Denormalized)

**Approach:** Flatten LineItem logic into Purchase by adding a `cartId` field and `groupedItems` JSON array.

**Pros:**
- Minimal schema (one field per Purchase)
- Doesn't require backfill

**Cons:**
- Denormalization makes querying "items in a cart" slow
- No uniqueness constraint preventing duplicate item adds
- LineItem metadata (discount, quantity) is implicit; unclear how to query

**Recommendation:** ❌ Denormalization without benefit. Option B is only slightly larger and much cleaner.

---

## Recommended Solution: **Option B (Unified Cart Model)**

### Key Design Decisions

1. **Cart is the transaction boundary.** One Cart → One Payment (terminal, Stripe Checkout, or Payment Link) → Multiple Purchase rows (one per item).

2. **LineItem enforces 1:1 item-to-cart.** Quantity field is future-proofing for bundle discounts; MVP quantity is always 1.

3. **Checkout modes are mutually exclusive per Cart.** A Cart is either POS-terminal-bound OR remote-link-bound, not both.

4. **Stripe Payment Link vs. Checkout Session:**
   - **Payment Link:** Persistent, reusable URL. Ideal for email or QR code. Shopper can revisit. No session timeout.
   - **Checkout Session:** Temporary, single-use. Ideal for "pay now" buttons in real-time flows.
   - **Recommendation for MVP:** Use Payment Link for remote checkout (more user-friendly for email/QR). Checkout Session is Phase 2 (real-time web flow).

5. **Invoice PDF generation:** Store invoice as a blob in a new `Invoice` model or as a Stripe-generated PDF link. Phase 2 add-on — not MVP scope.

6. **Organizer sale-type hinting (future):** Add `organizer.preferredCheckoutMode` (TERMINAL | REMOTE) to hint the UI which flow to prefer. Phase 2.

---

## Schema Changes (Full)

### New Models

```prisma
model Cart {
  id                      String     @id @default(cuid())
  organizerId             String
  organizer               Organizer  @relation(fields: [organizerId], references: [id], onDelete: Cascade)
  saleId                  String
  sale                    Sale       @relation(fields: [saleId], references: [id], onDelete: Cascade)
  shopperId               String?
  shopper                 User?      @relation("CartShopper", fields: [shopperId], references: [id], onDelete: SetNull)
  
  lineItems               LineItem[]
  totalAmount             Float      @default(0)
  discountAmount          Float?     @default(0)
  taxAmount               Float?
  tipAmount               Float?
  
  status                  String     @default("OPEN") // OPEN | PROCESSING | COMPLETED | ABANDONED
  
  // Checkout integration
  stripePaymentIntentId   String?    // For future Checkout Session integration
  stripePaymentLinkId     String?    @unique // Stripe's own ID
  stripePaymentLinkUrl    String?    // buy.stripe.com/...
  qrCodeDataUrl           String?    // base64 QR image
  
  // Terminal (POS)
  terminalSessionId       String?    // Placeholder for future pin pad integration
  
  createdAt               DateTime   @default(now())
  updatedAt               DateTime   @updatedAt
  expiresAt               DateTime?  // 24h for remote links
  completedAt             DateTime?
  
  @@index([organizerId, saleId, status])
  @@index([shopperId])
  @@index([expiresAt])
}

model LineItem {
  id                      String     @id @default(cuid())
  cartId                  String
  cart                    Cart       @relation(fields: [cartId], references: [id], onDelete: Cascade)
  itemId                  String
  item                    Item       @relation(fields: [itemId], references: [id], onDelete: Cascade)
  
  quantity                Int        @default(1)  // MVP: always 1; future: bundles
  unitPrice               Float
  discountAmount          Float?     @default(0)
  lineTotal               Float      // unitPrice * quantity - discountAmount
  
  createdAt               DateTime   @default(now())
  
  @@unique([cartId, itemId])
  @@index([itemId])
}
```

### Modified Models

**Purchase** (add field):
```prisma
  cartId                  String?
  cart                    Cart?      @relation(fields: [cartId], references: [id], onDelete: SetNull)
```

**Sale** (add relation):
```prisma
  carts                   Cart[]
```

**Organizer** (add relation):
```prisma
  carts                   Cart[]
```

**Item** (add relation):
```prisma
  lineItems               LineItem[]
```

---

## Files to Modify

### Backend Controllers & Services

1. **`packages/backend/src/controllers/posPaymentController.ts`** (new/extend)
   - `POST /api/cart` — Create new Cart for a sale/shopper
   - `POST /api/cart/:cartId/add-item` — Add item to cart (create LineItem)
   - `POST /api/cart/:cartId/remove-item` — Remove item from cart
   - `POST /api/cart/:cartId/checkout-terminal` — Initiate POS checkout (placeholder for pin pad)
   - `POST /api/cart/:cartId/checkout-stripe` — Generate Stripe Payment Link, return QR code
   - `GET /api/cart/:cartId` — Retrieve cart with LineItems

2. **`packages/backend/src/controllers/stripeController.ts`** (modify)
   - `createPaymentIntent()` — Add cartId handling
   - Webhook handler — On Payment Link completion, create Purchase records for all LineItems in cart, set items → SOLD, set cart.status → COMPLETED

3. **`packages/backend/src/controllers/itemController.ts`** (modify)
   - `markSold()` — Deprecated (kept for backwards compat). New flow: add to cart, then checkout.
   - OR extend `markSold()` to accept optional `cartId` — if cartId provided, add to cart instead of creating Purchase directly.

4. **`packages/backend/src/routes/items.ts` and `routes/sales.ts`** (modify)
   - Add new cart routes (or create `routes/cart.ts`)

### Frontend Components

1. **`packages/frontend/app/[saleId]/cart`** (new)
   - Cart drawer / page showing LineItems
   - "Add to Cart" button on item cards (replaces "Mark Sold" for shoppers)
   - Cart total, empty state
   - "Checkout with Stripe" button → opens Payment Link

2. **`packages/frontend/app/[saleId]/organizer/pos`** (modify)
   - Organizer POS terminal view — pulls cart, shows items, total
   - Terminal checkout button (placeholder for pin pad)

3. **`packages/frontend/components/ItemCard.tsx`** (modify)
   - Add "Add to Cart" button (in addition to or replacing "Mark Sold" depending on user role)

### Database Migration

```bash
# New migration
npx prisma migrate dev --name "add-cart-lineitem-models"
```

---

## Implementation Sequence (MVP)

**Phase 1: Core Cart Model (1–2 sprints)**
1. Write migration (Cart, LineItem, Purchase.cartId)
2. Implement cart CRUD endpoints (add, remove, list)
3. Implement Stripe Payment Link generation (POST `/api/cart/:cartId/checkout-stripe`)
4. Update Stripe webhook to create Purchase records from Cart on Payment Link completion
5. Test: Organizer creates cart → adds 3 items → generates Payment Link → QR → buyer scans → pays → items marked SOLD

**Phase 2: POS Terminal Integration (2–3 sprints)**
1. Terminal session model & pin pad vendor integration (Square, Clover, Stripe Terminal)
2. POST `/api/cart/:cartId/checkout-terminal` endpoint
3. Organizer POS UI — cart view, payment processing
4. Test: In-person at sale, organizer rings up items, processes payment, items marked SOLD

**Phase 3: Polish & Backwards Compat (1 sprint)**
1. Deprecate old `markSold()` endpoint (keep working for legacy)
2. Data migration: Existing Purchase rows with stripePaymentIntentId → backfill cartIds
3. Invoice PDF generation (Stripe or third-party)
4. Email/QR sharing UI

---

## Complexity Rating

**Schema:** Medium (2 new models, 1 new field on Purchase)  
**Backend:** Medium-High (new cart endpoints, Stripe Payment Link integration, webhook updates)  
**Frontend:** Medium (new cart UI, modified item card, organizer POS view)  
**Testing:** High (multi-item cart state, Stripe webhook handling, edge cases: expired carts, partial refunds)  

**Total Effort:** 4–5 sprints (MVP through POS terminal)  
**Token Burn (dev dispatch):** ~200–300k (Phase 1 cart + Stripe); ~150–200k each for Phase 2 & 3

---

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| Stripe Payment Link webhook delays (items not marked SOLD immediately) | Implement idempotency; webhook handler marks cart COMPLETED + items SOLD in single txn |
| Cart expiration (24h) confuses organizers | UI shows countdown; auto-regenerate link if requested within 1h of expiry |
| Old `markSold()` endpoint broken during migration | Extend to check if cartId in request; route to new flow if present; else fall back to old logic |
| Backwards compat: old Purchase rows missing cartId | Data migration job that backfills cartIds from stripePaymentIntentId clusters |
| POS terminal integration vendor lock-in | Use vendor-agnostic abstraction layer (PaymentProcessorService interface) |

---

## Success Criteria

1. ✅ Organizer can add multiple items to cart without checkout
2. ✅ Organizer can generate a Stripe Payment Link for the cart
3. ✅ Buyer can scan QR code (or click email link) and pay
4. ✅ On payment, all items in cart marked SOLD
5. ✅ In-person: Organizer can ring up items at a POS terminal (Phase 2)
6. ✅ Invoice PDF generated on purchase completion

---

## Decision: APPROVED

**Recommendation:** Implement **Option B (Unified Cart Model)** as the long-term architecture for Mark Sold evolution. This unifies POS, Stripe Checkout, and Payment Link flows under a single, extensible Cart model. Phase 1 (Stripe Payment Link) can ship in 1–2 sprints; Phase 2 (terminal integration) adds the in-person POS capability.

**Phase 1 MVP Scope:** Cart model + LineItem + Stripe Payment Link generation + webhook handling. No terminal integration, no invoice PDF, no backwards compat migration (Phase 3).
