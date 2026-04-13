# Architecture Specs — Feature #26 (Favorite Button UI) + Feature #29 (Message Organizer)

**Author:** Claude Architect
**Date:** 2026-03-21
**Status:** Specification (ready for findasale-dev implementation)

---

## Executive Summary

Two feature specs for FindA.Sale shopper engagement:

1. **Feature #26 — Favorite Button UI Expansion:** Schema already supports polymorphic favorites (items + sales). UI layer missing: heart icon on sale cards, item cards, sale detail page, favorite list page. No backend changes needed.

2. **Feature #29 — Message Organizer:** Full feature (schema + backend + UI) to enable shoppers to message organizers per sale with replies. Schema + existing Message/Conversation tables already in place. Backend controller is complete and tested. Only UI implementation remains: "Message Organizer" button on sale detail, inbox UI for both roles, unread badges.

**Critical Note:** Both features require authentication — non-logged-in shoppers cannot favorite or message.

---

## FEATURE #26: FAVORITE BUTTON (UI EXPANSION)

### Current State

**Database (COMPLETE):**
- `Favorite` model already exists with polymorphic design:
  - `userId` + `saleId` (favorite a whole sale)
  - `userId` + `itemId` (favorite a single item)
  - Unique constraints: `@@unique([userId, saleId])` and `@@unique([userId, itemId])`

**Backend (COMPLETE):**
- `favoriteController.ts`:
  - `toggleItemFavorite(itemId)` — POST to create/delete item favorite
  - `getUserFavorites(?category)` — GET list with sale info + item detail
  - `getItemFavoriteStatus(itemId)` — GET boolean (used to show filled/hollow heart)
- Routes already mounted (checked `/api/favorites` in routes/favorites.ts)
- Points awarded: 2 points per favorite (integrated with pointsService)

**Frontend (PARTIAL):**
- Heart icon component likely exists (`<HeartIcon />` or similar)
- Used on some pages but incomplete coverage

### Design Decisions

**1. Scope: Item Favorites Only (MVP)**
- Start with **item favorites** only (cleaner UX, higher engagement signal)
- Sale-level favorites deferred (lower priority per STATE.md)
- Rationale: Individual items are more actionable (holds, purchases) than aggregating a whole sale

**2. UI Placement (Non-Exhaustive)**
| Location | Component | Behavior |
|----------|-----------|----------|
| Sale Detail Page — Item List | `Item` card row | Heart icon top-right; click toggles + optimistic update |
| Item Detail Popup/Drawer | Item detail modal | Heart icon + count ("Favorited by X shoppers") |
| Favorites List Page | `/organizer/favorites` or `/shopper/favorites` | Dedicated tab showing all favorited items with sale context |
| Search Results | Item card in grid | Heart icon with count |

**3. UX Pattern**
- **Hollow heart** = not favorited (clickable)
- **Filled heart** = favorited (clickable to unfavorite)
- **Click behavior:** Optimistic UI update (heart fills immediately), async POST/DELETE in background
- **Feedback:** Toast notification on success ("Added to favorites" / "Removed from favorites")
- **Unread state:** No unread badge needed (unlike messages)

**4. Frontend Data Flow**
- Component: Read `isFavorite` state from `useQuery` hook (if fetching on mount) or prop (if passed from parent)
- On click: `toggleFavorite(itemId)` → optimistic update local state → background mutation
- Mutation: `POST /api/favorites/:itemId` with `{ isFavorite: true/false }`
- Response: `{ message: '...', favorite: { id, userId, itemId, createdAt } }`

### Prisma Schema (No Changes Required)

The `Favorite` model is already complete. No migration needed.

```prisma
model Favorite {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  saleId    String?
  sale      Sale?    @relation(fields: [saleId], references: [id])
  itemId    String?
  item      Item?    @relation(fields: [itemId], references: [id])
  createdAt DateTime @default(now())

  @@unique([userId, saleId])
  @@unique([userId, itemId])
}
```

### Migration SQL (None Required)

No schema changes → no migration.

### API Contract (Already Implemented)

**POST /api/favorites/:itemId**
- **Auth:** Required (403 if not logged in)
- **Request Body:**
  ```json
  { "isFavorite": true }  // or false to remove
  ```
- **Response (201 or 200):**
  ```json
  {
    "message": "Item added to favorites",
    "favorite": {
      "id": "cuid...",
      "userId": "cuid...",
      "itemId": "cuid...",
      "createdAt": "2026-03-21T12:00:00Z"
    }
  }
  ```
- **Errors:**
  - `401` — Not authenticated
  - `400` — Invalid itemId (item not found)
  - `409` — Already favorited (if `isFavorite: true` and already exists) — optional, can 200 instead

**GET /api/favorites**
- **Auth:** Required
- **Query Params:** `?category=furniture` (optional, filter by item category)
- **Response (200):**
  ```json
  {
    "favorites": [
      {
        "id": "cuid...",
        "title": "Victorian Chair",
        "price": 45.99,
        "status": "AVAILABLE",
        "category": "furniture",
        "condition": "good",
        "photoUrls": ["https://..."],
        "sale": {
          "id": "cuid...",
          "title": "Downtown Estate Sale",
          "startDate": "2026-03-22T09:00:00Z",
          "endDate": "2026-03-23T17:00:00Z",
          "status": "PUBLISHED",
          "organizer": { "id": "cuid...", "businessName": "Jane's Estate Sales" }
        }
      }
    ],
    "categories": ["furniture", "art", "jewelry"],
    "total": 12
  }
  ```

**GET /api/favorites/:itemId**
- **Auth:** Required
- **Response (200):**
  ```json
  { "isFavorite": true }
  ```

### Frontend Touch Points (Implementation Required)

**Files to Create:**
1. `packages/frontend/src/pages/shopper/favorites.tsx` — Dedicated favorites list page (NEW)
   - Tabs by category (all items, furniture, art, etc.)
   - Grid or list view
   - Sale context for each item
   - Empty state

**Files to Modify:**
1. `packages/frontend/src/components/SaleCard.tsx` or sale grid component — Add heart icon
2. `packages/frontend/src/components/ItemCard.tsx` or item row component — Add heart icon
3. `packages/frontend/src/pages/sales/[id].tsx` — Heart icon on item list within sale detail
4. `packages/frontend/src/hooks/useFavorite.ts` (NEW) or use existing `useQuery`/`useMutation` hooks
5. `packages/frontend/src/components/FavoriteButton.tsx` (NEW) — Reusable heart button component

**Component Spec (FavoriteButton.tsx):**
```typescript
interface FavoriteButtonProps {
  itemId: string;
  isFavorite?: boolean;  // Default false, can fetch if not provided
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;   // "Add to favorites" text?
}

export function FavoriteButton({ itemId, isFavorite: initialFavorite, size = 'md', showLabel = false }) {
  const [isFavorite, setIsFavorite] = useState(initialFavorite ?? false);
  const toggleMutation = useMutation(() => toggleItemFavorite(itemId, !isFavorite));

  const handleToggle = async () => {
    setIsFavorite(!isFavorite);  // Optimistic
    try {
      await toggleMutation.mutate();
      // Success — state already updated
    } catch (err) {
      setIsFavorite(isFavorite);  // Revert on error
      toast.error('Failed to update favorite');
    }
  };

  return (
    <button onClick={handleToggle} disabled={toggleMutation.isPending}>
      <HeartIcon filled={isFavorite} size={size} />
      {showLabel && <span>{isFavorite ? 'Favorited' : 'Add to favorites'}</span>}
    </button>
  );
}
```

### Complexity Estimate

**S (Small)** — 2–3 hours frontend development
- Heart button integration into 4–5 existing components
- New favorites list page (grid view + category tabs)
- No backend work, no schema, no migration

---

## FEATURE #29: MESSAGE ORGANIZER (FULL FEATURE)

### Current State

**Database (COMPLETE):**
- `Conversation` model exists:
  - `shopperUserId` (User sending message)
  - `organizerId` (Organizer receiving/replying)
  - `saleId` (Optional — conversation tied to specific sale or general inquiry)
  - `lastMessageAt` + `createdAt` for sorting
  - Unique constraint: `@@unique([shopperUserId, organizerId, saleId])`

- `Message` model exists:
  - `conversationId` (linked to Conversation)
  - `senderId` (User.id of sender, can be shopper or organizer)
  - `body` (message text)
  - `isRead` (boolean, auto-marked on fetch)
  - `createdAt` for ordering

**Backend (COMPLETE):**
- `messageController.ts` with 5 endpoints:
  - `getConversations()` — List all conversations for current user (shopper or organizer view)
  - `getThread(conversationId)` — Get all messages in a thread
  - `sendMessage(organizerId, saleId?, body)` — Create conversation + first message (shopper initiates)
  - `replyInThread(conversationId, body)` — Send reply (either shopper or organizer)
  - `getUnreadCount()` — Total unread messages across all conversations
- All routes mounted in `routes/messages.ts`
- Access control: Organizer/shopper verification per thread
- Hard caps: 100 conversations per user, 200 messages per thread (prevents memory spikes)

**Frontend (ZERO):**
- No UI exists yet
- Needs: Message inbox, compose modal, thread detail view, unread badges

### Design Decisions

**1. Scope: Simple Inbox (No Threading Initially)**
- Single inbox UI for both shoppers and organizers
- Conversations grouped by organizer (shopper view) or shopper (organizer view)
- Single message reply chain per conversation (no sub-threads)
- No typing indicators, read receipts, or voice messages (MVP)

**2. Conversation Context**
- Messages are tied to an **optional `saleId`**:
  - If `saleId` is provided → "Message about [Sale Title]"
  - If `saleId` is null → "General inquiry to [Organizer Name]"
- Unique constraint prevents duplicate conversations: one per (shopper, organizer, sale)
- If shopper messages same organizer about two different sales, creates 2 conversations

**3. Role Symmetry**
- **Shopper view:** Inbox lists conversations grouped by organizer
- **Organizer view:** Inbox lists conversations grouped by shopper + unread count per thread
- Both can initiate and reply in a conversation
- No permission asymmetry (shopper can't block organizer, organizer can't delete shopper messages)

**4. Notification Policy (Out of Scope)**
- Sending a message does NOT automatically trigger email/push (deferred to #73 Two-Channel Notification System)
- Organizer sees unread badge in inbox UI (real-time, no delay)
- Shopper sees unread badge similarly

**5. UI Placement**
| Location | Component | Behavior |
|----------|-----------|----------|
| Sale Detail Page | "Message Organizer" button | Opens compose modal, pre-fills organizerId + saleId |
| Organizer Dashboard | "Messages" nav link | Shows inbox with unread count badge |
| Shopper Dashboard | "Messages" nav link | Shows inbox with unread count badge |
| Organizer Settings | Conversation management page (future) | Archive, delete, reply templates (future) |

### Prisma Schema (Already Complete)

No new models needed. Existing `Conversation` + `Message` are sufficient.

```prisma
model Conversation {
  id            String    @id @default(cuid())
  saleId        String?
  sale          Sale?     @relation(fields: [saleId], references: [id])
  shopperUserId String
  shopperUser   User      @relation("ShopperConversations", fields: [shopperUserId], references: [id])
  organizerId   String
  organizer     Organizer @relation(fields: [organizerId], references: [id])
  messages      Message[]
  lastMessageAt DateTime  @default(now())
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([shopperUserId, organizerId, saleId])
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  senderId       String
  sender         User         @relation("SentMessages", fields: [senderId], references: [id])
  body           String
  isRead         Boolean      @default(false)
  createdAt      DateTime     @default(now())
}
```

### Migration SQL (None Required)

Schema is already in place (added in previous sessions). No new migration.

### API Contract (Already Implemented)

**POST /api/messages**
- **Auth:** Required (shopper initiates)
- **Request Body:**
  ```json
  {
    "organizerId": "cuid...",
    "saleId": "cuid...",   // Optional (null for general inquiry)
    "body": "Is this item still available?"
  }
  ```
- **Response (201):**
  ```json
  {
    "conversation": {
      "id": "cuid...",
      "saleId": "cuid...",
      "shopperUserId": "cuid...",
      "organizerId": "cuid...",
      "lastMessageAt": "2026-03-21T12:00:00Z",
      "createdAt": "2026-03-21T12:00:00Z"
    },
    "message": {
      "id": "cuid...",
      "conversationId": "cuid...",
      "senderId": "cuid...",
      "body": "Is this item still available?",
      "isRead": false,
      "createdAt": "2026-03-21T12:00:00Z"
    }
  }
  ```

**GET /api/messages**
- **Auth:** Required
- **Behavior:** Auto-detects if user is shopper or organizer, returns appropriate view
- **Response (200):**
  ```json
  [
    {
      "id": "cuid...",
      "saleId": "cuid...",
      "shopperUser": { "id": "cuid...", "name": "Alice" },
      "organizer": { "id": "cuid...", "businessName": "Jane's Sales", "userId": "cuid..." },
      "sale": { "id": "cuid...", "title": "Downtown Estate Sale" },
      "messages": [
        {
          "id": "cuid...",
          "conversationId": "cuid...",
          "senderId": "cuid...",
          "body": "Last message preview...",
          "isRead": true,
          "createdAt": "2026-03-21T12:00:00Z"
        }
      ],
      "_count": { "messages": { "unread": 2 } },
      "lastMessageAt": "2026-03-21T12:00:00Z"
    }
  ]
  ```
- **Hard Cap:** Max 100 conversations returned (prevents memory spike for high-volume users)

**GET /api/messages/:conversationId**
- **Auth:** Required (user must be shopper or organizer in conversation)
- **Response (200):**
  ```json
  {
    "conversation": {
      "id": "cuid...",
      "saleId": "cuid...",
      "shopperUser": { "id": "cuid...", "name": "Alice" },
      "organizer": { "id": "cuid...", "businessName": "Jane's Sales", "userId": "cuid..." },
      "sale": { "id": "cuid...", "title": "Downtown Estate Sale" }
    },
    "messages": [
      {
        "id": "cuid...",
        "conversationId": "cuid...",
        "senderId": "cuid...",
        "body": "Message body...",
        "isRead": true,
        "sender": { "id": "cuid...", "name": "Alice" },
        "createdAt": "2026-03-21T11:55:00Z"
      }
    ]
  }
  ```
- **Side Effect:** Auto-marks all unread messages in thread as `isRead: true`
- **Hard Cap:** Max 200 messages returned per thread (prevents runaway queries on old threads)

**POST /api/messages/:conversationId/reply**
- **Auth:** Required (user must be shopper or organizer in conversation)
- **Request Body:**
  ```json
  {
    "body": "Yes, I can hold it until Friday."
  }
  ```
- **Response (201):**
  ```json
  {
    "id": "cuid...",
    "conversationId": "cuid...",
    "senderId": "cuid...",
    "body": "Yes, I can hold it until Friday.",
    "isRead": false,
    "sender": { "id": "cuid...", "name": "Jane" },
    "createdAt": "2026-03-21T12:05:00Z"
  }
  ```
- **Side Effect:** Updates conversation's `lastMessageAt` to now

**GET /api/messages/unread-count**
- **Auth:** Required
- **Response (200):**
  ```json
  { "unread": 5 }
  ```

### Frontend Touch Points (Implementation Required)

**Files to Create:**

1. **`packages/frontend/src/pages/organizer/messages.tsx` (NEW)**
   - Organizer inbox view
   - Two sections: unread conversations + all conversations
   - List of conversations grouped by shopper name
   - Unread badge per conversation (`_count.messages.unread`)
   - Last message preview + timestamp
   - Click to open thread detail
   - Empty state if no conversations

2. **`packages/frontend/src/pages/shopper/messages.tsx` (NEW)**
   - Shopper inbox view
   - Two sections: unread conversations + all conversations
   - List of conversations grouped by organizer name
   - Same layout as organizer view
   - Click to open thread detail

3. **`packages/frontend/src/pages/messages/[conversationId].tsx` (NEW)**
   - Thread detail view (shared between shopper + organizer)
   - Show conversation header: "Chat with [Organizer Name] about [Sale Title]"
   - Message list (scrollable, reverse order — newest at bottom)
   - Sender name + timestamp on each message
   - Compose box at bottom: text input + send button
   - Auto-scroll to newest message on load + new message arrival
   - "Typing..." indicator (optional, future)

4. **`packages/frontend/src/components/MessageComposeModal.tsx` (NEW)**
   - Modal triggered from sale detail "Message Organizer" button
   - Pre-fill `organizerId` + `saleId`
   - Text input + send button
   - Validation: non-empty body
   - On send: create conversation + close modal + optionally navigate to inbox
   - Loading state + error toast

5. **`packages/frontend/src/components/MessageBadge.tsx` (NEW)**
   - Small badge showing unread count
   - Used in nav/sidebar next to "Messages" link
   - Shows only if count > 0

6. **`packages/frontend/src/hooks/useConversations.ts` (NEW)**
   - useQuery hook to fetch `GET /api/messages`
   - Refetch on mount + manual refetch trigger (for real-time updates)
   - Handles shopper vs organizer view auto-detection

7. **`packages/frontend/src/hooks/useThread.ts` (NEW)**
   - useQuery hook to fetch `GET /api/messages/:conversationId`
   - Includes message list + conversation metadata
   - Auto-marks messages as read on load

8. **`packages/frontend/src/hooks/useSendMessage.ts` (NEW)**
   - useMutation hook for `POST /api/messages` (new conversation)
   - Validation: body trim + non-empty

9. **`packages/frontend/src/hooks/useReplyInThread.ts` (NEW)**
   - useMutation hook for `POST /api/messages/:conversationId/reply`
   - Invalidates thread query on success (refetch messages)

**Files to Modify:**

1. **`packages/frontend/src/pages/sales/[id].tsx`**
   - Add "Message Organizer" button near "Contact Organizer" or action buttons section
   - Button opens `MessageComposeModal` with `organizerId` + `saleId` pre-filled
   - Or navigate to compose page: `/messages/new?organizerId=X&saleId=Y`

2. **`packages/frontend/src/components/Layout.tsx`**
   - Add "Messages" nav link
   - Show unread badge next to "Messages"
   - Badge count fetched from `useQuery(GET /api/messages/unread-count)`
   - Organizer + Shopper both see it

3. **`packages/frontend/src/pages/organizer/dashboard.tsx`** or nav
   - Add "Messages" link in organizer sidebar/nav
   - Or "Go to Inbox" CTA if unread count > 0

4. **`packages/frontend/src/pages/shopper/home.tsx`** or profile nav
   - Add "Messages" link
   - Same as organizer

### Component Specs

**MessageComposeModal.tsx:**
```typescript
interface MessageComposeModalProps {
  organizerId: string;
  saleId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;  // Navigate to thread after send?
}

export function MessageComposeModal({ organizerId, saleId, isOpen, onClose, onSuccess }) {
  const [body, setBody] = useState('');
  const sendMutation = useSendMessage();

  const handleSend = async () => {
    if (!body.trim()) return;
    try {
      const result = await sendMutation.mutate({ organizerId, saleId, body });
      toast.success('Message sent');
      onClose();
      onSuccess?.();  // e.g., navigate to thread
    } catch (err) {
      toast.error('Failed to send message');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <Modal.Header>Message Organizer</Modal.Header>
      <Modal.Body>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ask about items, request holds, or inquire about the sale..."
          rows={4}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={onClose} variant="secondary">Cancel</Button>
        <Button
          onClick={handleSend}
          disabled={!body.trim() || sendMutation.isPending}
        >
          Send
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
```

**Organizer Messages Page:**
```typescript
// pages/organizer/messages.tsx
export default function OrganizerMessages() {
  const { data: conversations, isLoading } = useConversations();

  if (isLoading) return <Spinner />;
  if (!conversations?.length) return <EmptyState message="No conversations yet" />;

  // Group by unread
  const unread = conversations.filter(c => c._count.messages.unread > 0);
  const read = conversations.filter(c => !c._count.messages.unread);

  return (
    <Layout>
      <div className="messages-container">
        <h1>Messages</h1>

        {unread.length > 0 && (
          <>
            <h2>Unread ({unread.length})</h2>
            <ConversationList conversations={unread} />
          </>
        )}

        {read.length > 0 && (
          <>
            <h2>All Conversations</h2>
            <ConversationList conversations={read} />
          </>
        )}
      </div>
    </Layout>
  );
}

function ConversationList({ conversations }) {
  return (
    <ul>
      {conversations.map(conv => (
        <li key={conv.id}>
          <Link href={`/messages/${conv.id}`}>
            <div className="conversation-row">
              <div className="conversation-header">
                <span className="shopper-name">{conv.shopperUser.name}</span>
                {conv._count.messages.unread > 0 && (
                  <Badge>{conv._count.messages.unread}</Badge>
                )}
              </div>
              {conv.sale && <small>About: {conv.sale.title}</small>}
              <div className="last-message">{conv.messages[0]?.body}</div>
              <small className="timestamp">{formatTime(conv.lastMessageAt)}</small>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

### Complexity Estimate

**M (Medium)** — 4–6 hours frontend + integration
- 5–6 new component + page files
- 4 new hooks (useConversations, useThread, useSendMessage, useReplyInThread)
- Integration into sale detail page + nav/layout
- API contract fully implemented + tested (no backend work)
- Moderate complexity: thread view, message list, role detection, unread management

---

## Implementation Priority

**Feature #26 (Favorites UI):** LOWER PRIORITY
- Schema + backend complete
- Pure frontend feature
- No blocking dependencies
- Estimated 2–3 hours

**Feature #29 (Message Organizer UI):** HIGHER PRIORITY
- Unblocks organizer engagement feedback loop
- Schema + backend complete
- UI is primary remaining work
- Estimated 4–6 hours
- Recommended to pair with #73 Two-Channel Notification System (email/push on new message)

---

## Dependencies & Constraints

**#26 Dependencies:** None. Independent.

**#29 Dependencies:**
- Gated by #72 Phase 2 (JWT + auth middleware) — awaiting Patrick's `prisma migrate deploy` on Neon
- Pairs well with #73 Two-Channel Notification System (deferred, but design assumes email/push on message received)
- Pre-wired for #40 Sale Hubs (conversations tied to specific sales or general inquiries)

**Environment Requirements:**
- Both features require authenticated users (session/JWT)
- Feature #29 requires organizer detection (either by User.role or User.roles array — Phase 2 gate)

---

## Testing Checklist (For QA / findasale-dev)

### Feature #26 (Favorite Button)

- [ ] Unauthenticated user sees heart icon but can't click (redirects to login)
- [ ] Shopper favorited item: heart fills, "Added to favorites" toast
- [ ] Shopper unfavorites: heart empties, "Removed" toast
- [ ] `/shopper/favorites` shows all favorited items with sale context
- [ ] Category filter works: `/shopper/favorites?category=furniture` only shows furniture
- [ ] Heart icon visible on: sale detail item list, search results, item card grid
- [ ] Points awarded: 2 points per favorite (check leaderboard)
- [ ] Favorite persists: reload page, heart still filled

### Feature #29 (Message Organizer)

- [ ] Unauthenticated user: "Message Organizer" button disabled or redirects to login
- [ ] Shopper sends message: compose modal opens, message appears in thread
- [ ] Organizer sees unread badge in inbox
- [ ] Organizer replies: message appears in thread, shopper sees unread badge
- [ ] Multiple conversations: inbox shows separate threads per (shopper, organizer, sale)
- [ ] General inquiry: `saleId: null` conversation shows "General inquiry" header
- [ ] Hard caps: Max 100 conversations listed, max 200 messages per thread
- [ ] Read status: Opening thread auto-marks messages as read
- [ ] Unread count: `/api/messages/unread-count` returns correct total across all conversations
- [ ] Access control: Shopper A cannot see Shopper B's conversations
- [ ] Access control: Organizer cannot see conversations they're not part of

---

## Migration Deployment Sequence

1. **Feature #26:** No migration. Deploy as part of feature branch (findasale-dev).
2. **Feature #29:** No migration. Deploy as part of feature branch (findasale-dev).
   - **Prerequisite:** Patrick must have run `prisma migrate deploy` for #72 Phase 1 (Neon production)

---

## Notes for Implementation

- **Feature #26:** Use existing `toggleItemFavorite`, `getUserFavorites`, `getItemFavoriteStatus` endpoints. No backend changes.
- **Feature #29:** Use existing Message + Conversation routes. No backend changes. UI is the only work.
- Both features assume authenticated users — non-logged-in shoppers cannot access (expected behavior per spec).
- Feature #29 inbox UX should show unread count prominently to encourage organizer engagement.
- Consider pairing Feature #29 UI deployment with email notifications (#73) for maximum engagement signal.

---

**End of Specification**
