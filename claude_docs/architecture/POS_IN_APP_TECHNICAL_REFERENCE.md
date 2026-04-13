# POS In-App Payment Request — Technical Reference

**For:** Development team (findasale-dev subagent)
**Purpose:** Exact code patterns, socket event names, endpoint signatures

---

## 1. Prisma Schema Block (Copy-Paste Ready)

Add this to `packages/database/prisma/schema.prisma` **before the last closing brace:**

```prisma
model POSPaymentRequest {
  id                      String    @id @default(cuid())
  organizerId             String
  organizer               Organizer @relation(fields: [organizerId], references: [id], onDelete: Cascade)
  shopperUserId           String
  shopper                 User      @relation("ShopperPaymentRequests", fields: [shopperUserId], references: [id], onDelete: Cascade)
  saleId                  String
  sale                    Sale      @relation("SalePOSPaymentRequests", fields: [saleId], references: [id], onDelete: Cascade)

  // Payment details
  itemIds                 String[]              // all item IDs in this request
  totalAmountCents        Int                   // total in cents (incl. all fees)
  platformFeeCents        Int                   // 10% flat deducted from organizer payout
  stripeFeeEstimate       Int?                  // estimated Stripe fee (~2.9% + $0.30)

  // Stripe integration
  stripePaymentIntentId   String?     @unique  // created on organizer send
  stripePaymentIntentSecret String?   @db.VarChar(255)  // secret for frontend

  // Lifecycle
  status                  String      @default("PENDING")   // PENDING | ACCEPTED | PAID | DECLINED | EXPIRED | CANCELLED
  requestedAt             DateTime    @default(now())
  acceptedAt              DateTime?
  paidAt                  DateTime?
  expiresAt               DateTime    // 15 min from creation

  // Audit
  declineReason           String?     // "USER_CANCEL" | "INSUFFICIENT_FUNDS" | "PAYMENT_CONCERN" | "OTHER"
  createdAt               DateTime    @default(now())
  updatedAt               DateTime    @updatedAt

  @@index([organizerId, saleId])
  @@index([shopperUserId, status])
  @@index([status, expiresAt])
  @@index([stripePaymentIntentId])
}
```

**Also add to Sale model relations:**
```prisma
posPaymentRequests POSPaymentRequest[] @relation("SalePOSPaymentRequests")
```

**Also add to Organizer model relations:**
```prisma
posPaymentRequests POSPaymentRequest[]
```

**Also add to User model relations:**
```prisma
posPaymentRequests POSPaymentRequest[] @relation("ShopperPaymentRequests")
```

---

## 2. Migration Commands

**After adding schema, run:**
```bash
cd packages/database
npx prisma migrate dev --name add_pos_payment_request
npx prisma generate
```

**On production (Railway):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## 3. Socket.io Room Pattern (Existing — No Changes Needed)

Rooms already supported in `packages/backend/src/lib/socket.ts`:

```typescript
socket.join(`user:${socket.data.userId}`);  // User joins room on connect
```

**Emit to shopper:**
```typescript
const io = getIO();
io.to(`user:${shopperUserId}`).emit('POS_PAYMENT_REQUEST', event);
```

**Emit to organizer:**
```typescript
const io = getIO();
io.to(`user:${organizerId}`).emit('POS_PAYMENT_STATUS', event);
```

---

## 4. Endpoint Route Handlers

**File:** `packages/backend/src/routes/pos.ts`

Add to existing router:
```typescript
router.post('/payment-request', authenticate, createPaymentRequest);
router.post('/payment-request/:requestId/accept', authenticate, acceptPaymentRequest);
router.post('/payment-request/:requestId/decline', authenticate, declinePaymentRequest);
router.get('/payment-request/:requestId', authenticate, getPaymentRequest);
```

---

## 5. Controller Function Signatures

**File:** `packages/backend/src/controllers/posController.ts`

```typescript
export const createPaymentRequest = async (req: AuthRequest, res: Response) => {
  // Validates organizer role + Stripe account
  // Validates shopper exists + not blocked
  // Validates sale + items + amounts
  // Creates POSPaymentRequest + Stripe PI
  // Emits socket event + creates notification
  // Returns 201 with request details
};

export const acceptPaymentRequest = async (req: AuthRequest, res: Response) => {
  // Validates request exists + not expired + status = PENDING
  // Validates requester owns request (shopperUserId)
  // Updates status to ACCEPTED
  // Emits socket event to organizer
  // Returns 200
};

export const declinePaymentRequest = async (req: AuthRequest, res: Response) => {
  // Validates request exists + not expired
  // Validates requester owns request
  // Updates status to DECLINED + declineReason
  // Emits socket event to organizer
  // Returns 200
};

export const getPaymentRequest = async (req: AuthRequest, res: Response) => {
  // Fetch request details (for payment page)
  // Return all request info + item details
};
```

---

## 6. Socket Event Payloads (Exact)

### Event: `POS_PAYMENT_REQUEST`
**Room:** `user:${shopperUserId}`
**When:** Immediately after organizer sends request

```typescript
{
  type: "POS_PAYMENT_REQUEST",
  requestId: "clp92k1x0000108ju8c5e5z7e",
  organizerName: "Estate Sale Pros",
  saleName: "Estate of Jane Doe",
  saleLocation: "123 Main St, Grand Rapids, MI",
  itemNames: ["Antique Mirror", "Leather Chair"],
  itemCount: 2,
  totalAmountCents: 15750,
  displayAmount: "$157.50",
  expiresAt: "2026-04-06T15:45:30Z",
  expiresIn: 900,
  stripePaymentIntentSecret: "pi_test_123abc_secret_xyz",
  deepLink: "/shopper/pay-request/clp92k1x0000108ju8c5e5z7e"
}
```

### Event: `POS_PAYMENT_STATUS`
**Rooms:** `user:${organizerId}` + `user:${shopperUserId}`
**When:** Status changes (accepted, paid, declined, expired)

```typescript
{
  type: "POS_PAYMENT_STATUS",
  requestId: "clp92k1x0000108ju8c5e5z7e",
  status: "PAID",  // or ACCEPTED, DECLINED, EXPIRED
  totalAmountCents: 15750,
  displayAmount: "$157.50",
  paidAt: "2026-04-06T15:42:30Z",
  declineReason: null
}
```

---

## 7. Stripe Webhook Integration

**File:** `packages/backend/src/controllers/stripeController.ts`

**In webhookHandler, add before existing purchase logic:**

```typescript
case 'payment_intent.succeeded': {
  const intent = event.data.object as Stripe.PaymentIntent;
  const { requestId, organizerId, shopperUserId, saleId } = intent.metadata;

  // Check if this is a POS payment request
  if (requestId && intent.metadata.requestId) {
    const request = await prisma.pOSPaymentRequest.findUnique({
      where: { id: requestId },
      include: { organizer: true, shopper: true, sale: true }
    });

    if (!request) {
      console.warn(`[webhook] POS request not found: ${requestId}`);
      break;
    }

    // 1. Update request status to PAID
    await prisma.pOSPaymentRequest.update({
      where: { id: requestId },
      data: { status: 'PAID', paidAt: new Date() }
    });

    // 2. For each item in request.itemIds:
    for (const itemId of request.itemIds) {
      const item = await prisma.item.findUnique({
        where: { id: itemId },
        include: { sale: true }
      });

      if (item) {
        // Create Purchase
        const purchase = await prisma.purchase.create({
          data: {
            userId: shopperUserId,
            itemId: itemId,
            saleId: saleId,
            amount: item.price * 100,  // convert to cents
            status: 'PAID',
            paymentSource: 'STRIPE'
          }
        });

        // Update Item.status
        await prisma.item.update({
          where: { id: itemId },
          data: { status: 'SOLD' }
        });

        // Update ItemReservation if exists
        await prisma.itemReservation.updateMany({
          where: { itemId, userId: shopperUserId },
          data: { status: 'COMPLETED' }
        });

        // Award XP
        await awardXp(shopperUserId, 'PURCHASE', { itemId, saleId });
      }
    }

    // 3. Emit socket event
    const io = getIO();
    io.to(`user:${organizerId}`).emit('POS_PAYMENT_STATUS', {
      type: 'POS_PAYMENT_STATUS',
      requestId,
      status: 'PAID',
      totalAmountCents: request.totalAmountCents,
      displayAmount: `$${(request.totalAmountCents / 100).toFixed(2)}`,
      paidAt: new Date().toISOString()
    });
    io.to(`user:${shopperUserId}`).emit('POS_PAYMENT_STATUS', {
      type: 'POS_PAYMENT_STATUS',
      requestId,
      status: 'PAID',
      totalAmountCents: request.totalAmountCents,
      displayAmount: `$${(request.totalAmountCents / 100).toFixed(2)}`,
      paidAt: new Date().toISOString()
    });

    // 4. Create notification to organizer
    await createNotification(organizerId, {
      type: 'pos_payment_completed',
      title: `${request.shopper.name} Paid $${(request.totalAmountCents / 100).toFixed(2)}`,
      body: `${request.itemIds.length} items from ${request.sale.title}`,
      link: null
    });

    break;
  }
}
```

---

## 8. Frontend Hook Pattern

**File:** `packages/frontend/hooks/usePOSPaymentRequest.ts`

```typescript
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useSocket } from './useSocket';

interface POSPaymentRequest {
  id: string;
  organizerName: string;
  saleName: string;
  saleLocation?: string;
  itemNames: string[];
  itemCount: number;
  totalAmountCents: number;
  displayAmount: string;
  expiresAt: string;
  expiresIn: number;
  stripePaymentIntentSecret?: string;
  deepLink: string;
}

export const usePOSPaymentRequest = (requestId: string) => {
  const { data: request, isLoading, error } = useQuery({
    queryKey: ['posPaymentRequest', requestId],
    queryFn: async () => {
      const res = await api.get(`/api/pos/payment-request/${requestId}`);
      return res.data;
    }
  });

  const [status, setStatus] = useState(request?.status || 'PENDING');
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    socket.on('POS_PAYMENT_STATUS', (event: any) => {
      if (event.requestId === requestId) {
        setStatus(event.status);
      }
    });

    return () => {
      socket.off('POS_PAYMENT_STATUS');
    };
  }, [socket, requestId]);

  const accept = async () => {
    await api.post(`/api/pos/payment-request/${requestId}/accept`);
    setStatus('ACCEPTED');
  };

  const decline = async (reason?: string) => {
    await api.post(`/api/pos/payment-request/${requestId}/decline`, { reason });
    setStatus('DECLINED');
  };

  return { request, status, accept, decline, isLoading, error };
};
```

---

## 9. Frontend Page Structure

**File:** `packages/frontend/pages/shopper/pay-request/[requestId].tsx`

```typescript
import { usePOSPaymentRequest } from '../../../hooks/usePOSPaymentRequest';
import PaymentRequestForm from '../../../components/PaymentRequestForm';

export default function PaymentRequestPage({ requestId }: { requestId: string }) {
  const { request, status, accept, decline, isLoading } = usePOSPaymentRequest(requestId);

  if (isLoading) return <div>Loading...</div>;
  if (!request) return <div>Payment request not found</div>;
  if (status === 'EXPIRED') return <div>This payment request has expired</div>;
  if (status === 'PAID') return <div>Payment complete!</div>;

  return (
    <div className="payment-request-page">
      <h1>Payment Request from {request.organizerName}</h1>
      <p>{request.saleName} • {request.saleLocation}</p>

      <div className="items-list">
        {request.itemNames.map((name: string) => (
          <div key={name}>{name}</div>
        ))}
      </div>

      <div className="amount">
        <span>{request.displayAmount}</span>
        <span className="countdown">Expires in {request.expiresIn}s</span>
      </div>

      {status === 'PENDING' && (
        <div className="actions">
          <button onClick={accept}>Accept & Pay</button>
          <button onClick={() => decline()}>Decline</button>
        </div>
      )}

      {status === 'ACCEPTED' && (
        <PaymentRequestForm
          requestId={request.id}
          secret={request.stripePaymentIntentSecret}
          amount={request.totalAmountCents}
        />
      )}

      {status === 'DECLINED' && <div>You declined this request</div>}
    </div>
  );
}
```

---

## 10. Prevent Duplicate Requests

**In createPaymentRequest endpoint:**

```typescript
// Check for duplicate requests from same organizer to same shopper in last 60s
const recentRequest = await prisma.pOSPaymentRequest.findFirst({
  where: {
    organizerId,
    shopperUserId,
    saleId,
    createdAt: {
      gte: new Date(Date.now() - 60000)  // last 60 seconds
    },
    status: { in: ['PENDING', 'ACCEPTED'] }
  }
});

if (recentRequest) {
  return res.status(400).json({
    message: 'Payment request already sent to this shopper in the last minute',
    requestId: recentRequest.id
  });
}
```

---

## 11. Validation Checklist

Before returning request creation response:

```typescript
// Validate organizer
const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER');
const organizer = await prisma.organizer.findUnique({ where: { userId: req.user?.id } });
if (!hasOrganizerRole || !organizer) return 403;

// Validate shopper
const shopper = await prisma.user.findUnique({ where: { id: shopperUserId } });
if (!shopper || shopper.suspendedAt) return 404 or 403;

// Validate sale
const sale = await prisma.sale.findUnique({ where: { id: saleId } });
if (!sale || sale.organizerId !== organizer.id) return 404;

// Validate items
const items = await prisma.item.findMany({
  where: { id: { in: itemIds }, saleId }
});
if (items.length !== itemIds.length) return 400;  // some items not found
if (items.some(i => i.status !== 'AVAILABLE' && i.status !== 'RESERVED')) return 400;

// Validate amount
const maxAllowedCents = items.reduce((sum, i) => sum + (i.price || 0) * 100, 0) * 2;
if (totalAmountCents <= 0 || totalAmountCents > maxAllowedCents) return 400;

// Validate Stripe account
if (!organizer.stripeConnectId) return 400;
```

---

## 12. Tier Check (Optional)

**If tier-gating is decided:**

```typescript
if (organizer.subscription?.tier === 'SIMPLE') {
  return res.status(403).json({
    message: 'In-app payment requests require PRO tier or higher'
  });
}

// Check concurrent limit
const pendingCount = await prisma.pOSPaymentRequest.count({
  where: {
    organizerId,
    saleId,
    status: 'PENDING'
  }
});

const limit = organizer.subscription?.tier === 'TEAMS' ? 999 : 5;
if (pendingCount >= limit) {
  return res.status(400).json({
    message: `Max ${limit} concurrent requests per sale. Complete or decline existing requests first.`
  });
}
```

---

## 13. Error Response Examples

```json
{
  "status": 400,
  "message": "Shopper account not found or suspended"
}

{
  "status": 400,
  "message": "One or more items are no longer available",
  "unavailableItemIds": ["item_123"]
}

{
  "status": 403,
  "message": "In-app payment requests require PRO tier or higher"
}

{
  "status": 409,
  "message": "Payment request already sent to this shopper in the last minute",
  "requestId": "clp92k1x0000108ju8c5e5z7e"
}
```

---

## 14. Database Indexes (Already in Schema)

```prisma
@@index([organizerId, saleId])        // list requests by organizer + sale
@@index([shopperUserId, status])      // list requests to shopper by status
@@index([status, expiresAt])          // cleanup job: find expired requests
@@index([stripePaymentIntentId])      // webhook: lookup by PI ID
```

---

## 15. Cleanup Job (Optional)

**Runs every 15 minutes to mark expired requests:**

```typescript
// packages/backend/src/jobs/expirePaymentRequestsJob.ts

export const expirePaymentRequests = async () => {
  await prisma.pOSPaymentRequest.updateMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: new Date() }
    },
    data: { status: 'EXPIRED' }
  });
};

// Schedule in index.ts:
setInterval(expirePaymentRequests, 15 * 60 * 1000);
```

---

## 16. Type Definitions

**File:** `packages/frontend/lib/types/index.ts`

```typescript
export interface POSPaymentRequest {
  id: string;
  organizerId: string;
  shopperUserId: string;
  saleId: string;
  itemIds: string[];
  totalAmountCents: number;
  platformFeeCents: number;
  stripeFeeEstimate?: number;
  status: 'PENDING' | 'ACCEPTED' | 'PAID' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;  // ISO8601
  stripePaymentIntentSecret?: string;
  organizer?: { name: string };
  sale?: { title: string; location?: string };
  items?: Array<{ id: string; title: string; photoUrl?: string }>;
}

export interface POSPaymentRequestEvent {
  type: 'POS_PAYMENT_REQUEST';
  requestId: string;
  organizerName: string;
  saleName: string;
  saleLocation?: string;
  itemNames: string[];
  itemCount: number;
  totalAmountCents: number;
  displayAmount: string;
  expiresAt: string;
  expiresIn: number;
  stripePaymentIntentSecret?: string;
  deepLink: string;
}

export interface POSPaymentStatusEvent {
  type: 'POS_PAYMENT_STATUS';
  requestId: string;
  status: 'ACCEPTED' | 'PAID' | 'DECLINED' | 'EXPIRED';
  totalAmountCents: number;
  displayAmount: string;
  paidAt?: string;
  declineReason?: string;
}
```

