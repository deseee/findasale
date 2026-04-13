# Feature #73: Two-Channel Notification System
## Architecture Decision Spec

**Status:** Ready for Dev Implementation
**Author:** Architect
**Date:** 2026-03-21
**Blocks:** Features #74 (Notification Preferences), #75 (Tier-Lapse Warnings)

---

## 1. Executive Summary

Feature #73 implements a dual-channel notification system for organizers and shoppers:
- **Channel 1: In-App** — Bell icon in navbar showing unread count + expandable dropdown list
- **Channel 2: Email** — Transactional emails via Resend (already configured)

The system reuses the existing `Notification` Prisma model (already in schema) and existing email infrastructure (Resend + buildEmail template).

**Key constraints:**
- Reuse existing Notification model — no schema changes
- Use Resend for email (not MailerLite, which is for marketing)
- Build on existing route structure (`/api/notifications/inbox/` routes already exist)
- In-app notifications must be real-time-capable for future Socket.io integration

---

## 2. Schema

### No Changes Required ✅

The `Notification` model already exists in `schema.prisma` and is complete:

```prisma
model Notification {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String   // "sale_alert" | "purchase" | "message" | "flash_deal" | "badge" | "system"
  title     String
  body      String
  link      String?  // optional deep link e.g. "/sales/abc123"
  read      Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([userId, read])
  @@index([createdAt])
}
```

**Fields sufficient for all triggers:**
- `type` → trigger classification (new_bid, message_received, etc. expand the enum list)
- `title` → display headline in bell dropdown
- `body` → display description in bell dropdown
- `link` → deep link on click (e.g., `/organizer/sales/abc123` for new bid)
- `read` → track read state for UI (unread count, visual indicator)

---

## 3. Backend Layer

### 3.1 New Notification Service

**File:** `packages/backend/src/services/notificationService.ts`

Purpose: Unified interface for creating notifications (both channels) with consistent error handling and optional email trigger.

```typescript
// Pseudo-code structure
export interface NotificationPayload {
  userId: string;
  type: string;  // 'new_bid', 'message_received', 'sale_published', 'payment_received', 'payment_failed', 'item_favorited_sold', 'bid_outbid'
  title: string;
  body: string;
  link?: string;
  email?: {
    recipientEmail: string;
    recipientName: string;
    subject: string;
    headline: string;
    ctaText?: string;
    accentColor?: string; // For buildEmail template
  };
}

export const createNotification = async (payload: NotificationPayload): Promise<Notification> => {
  // 1. Create in-app notification
  const notification = await prisma.notification.create({
    data: { userId: payload.userId, type: payload.type, title: payload.title, body: payload.body, link: payload.link }
  });

  // 2. Send email if requested
  if (payload.email) {
    await sendNotificationEmail(payload.email);
  }

  return notification;
};

const sendNotificationEmail = async (emailPayload: EmailPayload): Promise<void> => {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = buildEmail({
    headline: emailPayload.headline,
    body: emailPayload.body,
    ctaText: emailPayload.ctaText,
    ctaUrl: emailPayload.ctaUrl,
    accentColor: emailPayload.accentColor
  });

  await resend.emails.send({
    from: 'notifications@findasale.com',
    to: emailPayload.recipientEmail,
    subject: emailPayload.subject,
    html
  });
};
```

**Key decisions:**
- Service wraps Prisma + Resend calls — callers don't instantiate either
- Email is optional per notification — most triggers send both, some may be in-app only
- Error handling: log email errors (don't fail transaction if email fails)
- Resend client lazily initialized (pattern already used in notificationController.ts)

### 3.2 Notification Trigger Points

Integrate `notificationService.createNotification()` into these existing controllers:

#### Organizer Triggers

**1. New Bid on Item** (already has bidController.ts)
- Trigger: When a bid is placed on organizer's item
- Controller: `packages/backend/src/controllers/bidController.ts` (placeB id function)
- Add call after bid creation:
```typescript
await notificationService.createNotification({
  userId: item.sale.organizerId,
  type: 'new_bid',
  title: `New bid on "${item.title}"`,
  body: `${bidder.name} bid $${bid.amount}`,
  link: `/organizer/sales/${item.saleId}/items/${itemId}`,
  email: { ... } // organizer's email + subscription preference check
});
```

**2. New Message** (already has messageController.ts / messages.ts route)
- Trigger: When a shopper sends a message to organizer
- Controller: `packages/backend/src/controllers/messageController.ts` (sendMessage function)
- Check User.notificationPrefs.emailNewMessages before sending email

**3. Sale Published** (already has saleController.ts)
- Trigger: When organizer clicks "Publish Sale"
- Controller: `packages/backend/src/controllers/saleController.ts` (publishSale function)
- In-app only (success confirmation)

**4. Payment Received / Failed** (already has stripeController.ts webhook)
- Trigger: Stripe webhook transfer.created (paid out) or charge.failed
- Controller: `packages/backend/src/controllers/stripeController.ts` (webhook handler)
- Email critical — always send

#### Shopper Triggers

**1. Item Favorited Sold / Won** (favorites system exists)
- Trigger: When a favorited item status changes to SOLD or SOLD_TO_WINNER
- Controller: `packages/backend/src/controllers/itemController.ts` (updateItemStatus function)
- Loop through Favorite records and notify each favoriter

**2. New Message** (shared with organizer)
- Trigger: When organizer sends a reply to shopper message thread
- Same message controller call as organizer trigger

**3. Bid Outbid** (existing bid system)
- Trigger: When a higher bid is placed on item in AUCTION
- Controller: `packages/backend/src/controllers/bidController.ts` (placeB id)
- Notify previous highest bidder

### 3.3 Existing Routes (No Changes, Minor Expansion)

**Route:** `GET /api/notifications/inbox/`
**Controller:** `packages/backend/src/controllers/notificationInboxController.ts`
**Already implemented** — returns paginated notifications for authenticated user

**Expansion needed:**
- Return unread count in response header (for bell icon)
- Support filter by type (future: `?type=new_bid,message_received`)
- Pagination limit defaults to 20, max 100

**Route:** `PATCH /api/notifications/inbox/:id/read`
**Already implemented** — mark single notification as read

**Route:** `PATCH /api/notifications/inbox/read-all`
**Already implemented** — mark all as read (useful for bell dropdown "Mark all read" button)

**Route:** `DELETE /api/notifications/inbox/:id`
**Already implemented** — delete a notification

### 3.4 App Integration

**File:** `packages/backend/src/index.ts`
**Already registered at line 329:** `app.use('/api/notifications/inbox', notificationInboxRoutes);`

No changes needed. New notifications created via notificationService will automatically flow to the route.

---

## 4. Frontend Layer

### 4.1 Notification Bell Component

**File:** `packages/frontend/components/NotificationBell.tsx`

```typescript
// Pseudo-code structure
export const NotificationBell: React.FC<{ userId: string }> = ({ userId }) => {
  const { data: notifications, isLoading } = useNotifications(userId);
  const [isOpen, setIsOpen] = useState(false);

  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  return (
    <div className="relative">
      {/* Bell Icon + Badge */}
      <button onClick={() => setIsOpen(!isOpen)} className="relative">
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white shadow-lg rounded-lg p-4 max-h-96 overflow-y-auto">
          {notifications?.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No notifications</p>
          ) : (
            <>
              {notifications.map(notif => (
                <NotificationItem key={notif.id} notification={notif} />
              ))}
              <div className="border-t mt-4 pt-4 flex gap-2">
                <button onClick={() => markAllRead()}>Mark all read</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
```

**Key features:**
- Unread count badge (red, top-right of bell)
- Dropdown list of last ~20 notifications (reverse chronological)
- Click notification title → navigate to link (e.g., sale detail, message thread)
- "Mark all read" button in footer
- Delete individual notification (small X icon)
- Visual distinction for read vs. unread (gray vs. bold text)

### 4.2 Notification Hook

**File:** `packages/frontend/hooks/useNotifications.ts`

```typescript
export const useNotifications = (userId: string) => {
  return useQuery(
    ['notifications', userId],
    async () => {
      const res = await fetch(`/api/notifications/inbox/?limit=20`);
      return res.json();
    },
    {
      refetchInterval: 30000, // Poll every 30 seconds (can be replaced with Socket.io later)
      enabled: !!userId
    }
  );
};

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();
  return useMutation(
    async (notifId: string) => {
      await fetch(`/api/notifications/inbox/${notifId}/read`, { method: 'PATCH' });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['notifications']);
      }
    }
  );
};
```

### 4.3 Layout Integration

**File:** `packages/frontend/components/Layout.tsx`

Mount the NotificationBell in the header/navbar:

```typescript
export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-white shadow-sm">
        <nav className="flex justify-between items-center p-4">
          <Link href="/">FindA.Sale</Link>
          <div className="flex gap-4 items-center">
            {user && <NotificationBell userId={user.id} />}
            <UserMenu />
          </div>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
};
```

**Position:** Next to user menu in top-right of header

---

## 5. Cross-Layer Contracts

### 5.1 API Shape

#### GET `/api/notifications/inbox/` (Enhanced)

**Response:**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "new_bid",
      "title": "New bid on Old Blue Chair",
      "body": "Alice bid $45",
      "link": "/organizer/sales/abc123/items/xyz",
      "read": false,
      "createdAt": "2026-03-21T14:30:00Z"
    }
  ],
  "unreadCount": 3,
  "total": 47
}
```

**Query params:**
- `limit` (default: 20, max: 100)
- `offset` (default: 0)
- `type` (optional filter, e.g., `?type=new_bid,message_received`)

#### PATCH `/api/notifications/inbox/:id/read`

**Request:** `{}`
**Response:** `{ success: true, notification: { ...updated} }`

#### PATCH `/api/notifications/inbox/read-all`

**Request:** `{}`
**Response:** `{ success: true, updated: 5 }`

#### DELETE `/api/notifications/inbox/:id`

**Request:** `{}`
**Response:** `{ success: true }`

### 5.2 Type Definitions

**File:** `packages/shared/types/notification.ts`

```typescript
export type NotificationType =
  | 'new_bid'
  | 'message_received'
  | 'sale_published'
  | 'payment_received'
  | 'payment_failed'
  | 'item_favorited_sold'
  | 'bid_outbid';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: Date;
}
```

---

## 6. Email Template Details

**Use existing:** `packages/backend/src/services/emailTemplateService.ts` buildEmail() function

**Example: New Bid Notification**

```typescript
await notificationService.createNotification({
  userId: organizer.id,
  type: 'new_bid',
  title: 'New bid on Old Blue Chair',
  body: 'Alice bid $45 — place your counter bid now',
  link: '/organizer/sales/abc123/items/xyz',
  email: {
    recipientEmail: organizer.email,
    recipientName: organizer.name,
    subject: 'New bid on your item',
    headline: 'You received a bid!',
    body: `<p><strong>${bidder.name}</strong> bid <strong>$${bid.amount}</strong> on <strong>"${item.title}"</strong>.</p>`,
    ctaText: 'Review Bid',
    ctaUrl: `${process.env.FRONTEND_URL}/organizer/sales/${item.saleId}`,
    accentColor: '#10b981' // green for positive event
  }
});
```

**Preference Check:** Before sending email, check `user.notificationPrefs`:

```typescript
const prefs = user.notificationPrefs || {};
if (!prefs.emailNewBids) {
  // Skip email, but still create in-app notification
  payload.email = undefined;
}
```

---

## 7. Migration Requirement

**No migration needed.** ✅

- `Notification` model already in schema
- User already has `notifications` relation
- All indices present

---

## 8. Implementation Order

### Phase 1: Service + Trigger Integration (Dev Task 1)
1. Create `notificationService.ts` with createNotification() + sendNotificationEmail()
2. Integrate into bidController.ts (new_bid trigger)
3. Integrate into messageController.ts (message_received trigger)
4. Integrate into saleController.ts (sale_published trigger)
5. Add unit tests for notificationService

**Acceptance:** Manually place a bid, verify notification appears in `/api/notifications/inbox/` and email sent

### Phase 2: In-App UI (Dev Task 2)
1. Create NotificationBell.tsx component
2. Create useNotifications() hook
3. Integrate NotificationBell into Layout.tsx
4. Add NotificationItem.tsx for individual item rendering
5. Test unread count badge, dropdown, mark-read functionality

**Acceptance:** Chrome test — bell appears, unread count shows, dropdown opens, notifications clickable

### Phase 3: Payment + Favorites Triggers (Dev Task 3)
1. Integrate payment_received / payment_failed into stripeController.ts
2. Integrate item_favorited_sold into itemController.ts
3. Integrate bid_outbid into bidController.ts
4. Add notification preference checks (don't send if user opted out)

**Acceptance:** Stripe test mode payment → notification sent; favorite item sold → notification sent

---

## 9. Locked Decisions

1. **Use existing Notification model** — no schema changes, no migrations
2. **Resend for transactional email** — not MailerLite (which is marketing-only)
3. **Email optional per notification** — notificationService.createNotification({ email?: {...} })
4. **30-second poll interval** — hook can be switched to Socket.io later without UI changes
5. **Unread count in badge** — not in API response header (keep API payload clean)
6. **Dropdown max 20 items** — paginated via `limit` query param for performance
7. **notificationPrefs stored in User.notificationPrefs JSON** — no separate table yet (feature #74 will formalize)
8. **Email errors don't rollback notification creation** — fail open for in-app, log email error

---

## 10. Risks & Open Questions

### Risk: Email Deliverability
**Impact:** High
**Mitigation:** Resend has 98%+ deliverability; use bounce/complaint webhooks later to unsubscribe bad addresses. Start with sendgrid-like monitoring.

**Decision needed:** Should we track bounces/complaints now or wait for #74?
**Recommendation:** Wait for #74 — too complex for MVP. Log all Resend errors to Sentry for now.

---

### Risk: Real-Time Gap
**Impact:** Medium
**Mitigation:** 30-second poll is acceptable for MVP. Socket.io integration (Feature #76?) can replace without changing API.

**Decision needed:** When should real-time notifications ship?
**Recommendation:** Post-launch. Polling is sufficient for beta.

---

### Risk: Notification Preferences State
**Impact:** Medium
**Mitigation:** User.notificationPrefs is JSON — unstructured. Feature #74 will create NotificationPreference table for granular control.

**Decision needed:** For now, should we support opt-out per trigger type?
**Recommendation:** Yes, check `user.notificationPrefs.emailNewBids`, etc. in each trigger point. Feature #74 will migrate to table.

---

### Risk: Organizer vs. Shopper Role Notifications
**Impact:** Low
**Mitigation:** Feature #72 (Dual-Role Schema) is complete. User.roles exists. Check role before deciding which notifications to send.

**Decision needed:** Should organizers see shopper notifications (e.g., "Your bid was outbid") if they also shop?
**Recommendation:** Yes — check role context in each trigger. Notification.userId doesn't care about role, but trigger logic should.

---

### Open Question: Notification Metadata
**Current:** type, title, body, link only.
**Future needs:** Should we store trigger data (e.g., `bidId`, `saleId`, `messageId`) for analytics or UI enhancement?

**Recommendation:** Add later (Feature #74). Keep MVP simple — link field is sufficient for navigation.

---

## 11. Dependencies & Blockers

✅ **#72 (Dual-Role Schema)** — COMPLETE. User.roles exists.
✅ **Resend API Key** — Already in .env
✅ **emailTemplateService.buildEmail()** — Already exists
✅ **notificationInboxRoutes** — Already exist

**No blockers.** Feature #73 is ready for Dev implementation.

---

## 12. Acceptance Criteria

**Dev returns to Architect with:**

1. ✅ notificationService.ts created, all triggers integrated
2. ✅ NotificationBell.tsx mounted in Layout, unread count badge visible
3. ✅ useNotifications hook working, 30s poll functional
4. ✅ TypeScript compile clean (`tsc --noEmit`)
5. ✅ Manual test: Place bid → notification in inbox + email sent
6. ✅ Manual test: Click notification → navigates to correct page
7. ✅ Manual test: Mark as read → unread count decreases
8. ✅ Manual test: Favorite item sold → shopper notified

---

## Reference Files

- Schema: `/sessions/optimistic-serene-johnson/mnt/FindaSale/packages/database/prisma/schema.prisma` (lines 816+)
- Email service: `packages/backend/src/services/emailTemplateService.ts`
- Notification routes: `packages/backend/src/routes/notificationInbox.ts`
- Existing controller pattern: `packages/backend/src/controllers/buyingPoolController.ts` (Resend example)
- Layout component: `packages/frontend/components/Layout.tsx`

---

**Status:** Ready for `findasale-dev` dispatch.
