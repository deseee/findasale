# ADR: Roadmap Batch D — Dual-Role Account & Tier Lapse State (#72–#75)

**Author:** Systems Architect
**Date:** 2026-03-24
**Status:** APPROVED (Architect decision — D2 lapse behavior decided)
**Relates To:** Features #72, #73, #74, #75 + Phase 2 Auth overhaul

---

## Executive Summary

Roadmap Batch D covers three interconnected features that implement per-role subscription management for dual-account users (organizers who also shop):

1. **#72 Dual-Role Account Schema** — Schema already built (Phase 1). Phase 2 decision: JWT payload with roles array + auth middleware enforcement.
2. **#73 Two-Channel Notification System** — Route notifications to OPERATIONAL or DISCOVERY channels based on role context.
3. **#74 Role-Aware Consent Flow** — Separate opt-in checkboxes at signup; backfill consent records for existing organizers (D1 locked).
4. **#75 Tier Lapse State Logic** — When organizer subscription lapses: **PARTIAL FREEZE** (organizer features only). Shopper features remain active. **Reactivates on resume.**

### Decision Points Status
- **D1 (Backfill):** LOCKED — Auto-backfill `UserRoleSubscription` from existing `Organizer` records using `createdAt` timestamp (Patrick decision, S272 ready).
- **D2 (Tier Lapse):** **ARCHITECT DECIDES THIS SESSION** — See §5 below.
- **D3 (Consent Copy):** Blocked on Legal review — UX/schema spec included, placeholder for text.

---

## Part 1: #72 Dual-Role Account Schema

### Current State (Schema Complete — Phase 1)

The database schema already supports dual-role accounts:

```prisma
// User model
model User {
  roles         String[]   @default(["USER"])  // ["USER"], ["USER", "ORGANIZER"], ["USER", "ORGANIZER", "ADMIN"]
  roleSubscriptions UserRoleSubscription[] @relation("roleSubscriptions")
  // ... other fields ...
}

// Feature #72: Per-role subscription state
model UserRoleSubscription {
  id                String   @id @default(cuid())
  userId            String
  role              String   // "ORGANIZER" | "SHOPPER"

  // Subscription state (ORGANIZER role only; SHOPPER is always active)
  subscriptionTier  SubscriptionTier @default(SIMPLE)
  subscriptionStatus String?
  trialEndsAt       DateTime?
  stripeCustomerId  String?
  stripeSubscriptionId String?

  // Tier expiry (Feature #75 gate)
  tierLapseWarning  DateTime?
  tierLapsedAt      DateTime?
  tierResumedAt     DateTime?

  tokenVersion      Int       @default(0)  // SECURITY: Increment on tier upgrade
  stripeConnectId   String?
  reputationTier    String    @default("NEW")
  verificationStatus String   @default("NONE")
  verifiedAt        DateTime?

  consentRecord     RoleConsent?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@unique([userId, role])
  @@index([userId])
  @@index([role])
}

// Role-specific consent
model RoleConsent {
  id                String   @id @default(cuid())
  subscriptionId    String   @unique
  roleSubscription  UserRoleSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  role              String   // "ORGANIZER" | "SHOPPER"

  // Consent timestamps: null = not yet consented
  termsAcceptedAt   DateTime?
  privacyAcceptedAt DateTime?
  businessVerificationAcceptedAt DateTime?  // ORGANIZER only
  paymentMethodAcceptedAt DateTime?        // ORGANIZER only
  marketingOptInAt  DateTime?              // SHOPPER only

  emailOptOut       Boolean   @default(false)

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([subscriptionId])
}
```

### Phase 2 Implementation: JWT + Auth Middleware

**No schema changes needed.** JWT payload and auth middleware must be updated to enforce role-based access control.

#### 2.1 JWT Payload Update

Current JWT (legacy single-role):
```json
{
  "userId": "user_123",
  "role": "ORGANIZER",
  "email": "org@example.com",
  "iat": 1711270000,
  "exp": 1711356400
}
```

**New JWT payload (roles array):**
```json
{
  "userId": "user_123",
  "roles": ["USER", "ORGANIZER"],
  "roleSubscriptions": [
    {
      "role": "ORGANIZER",
      "subscriptionTier": "PRO",
      "subscriptionStatus": "active",
      "tokenVersion": 1,
      "stripeConnectId": "acct_abc123",
      "reputationTier": "TRUSTED"
    },
    {
      "role": "SHOPPER",
      "subscriptionTier": "FREE",
      "subscriptionStatus": null,
      "tokenVersion": 0
    }
  ],
  "email": "org@example.com",
  "iat": 1711270000,
  "exp": 1711356400
}
```

**Rationale:**
- `roles[]` replaces deprecated `role` enum — easier to add ADMIN or future roles.
- `roleSubscriptions[]` carries tier state inline → no DB lookup on every request.
- `tokenVersion` per role — increment on tier upgrade to invalidate cached tier claims.
- Backward-compatible: old single-role tokens continue to work; new tokens are dual-role.

#### 2.2 Auth Middleware Update

**File:** `packages/backend/src/middleware/auth.ts`

**Current behavior:** Check `req.user.role === "ORGANIZER"` and gate endpoint.

**New behavior:**
```typescript
// Helper to check if user has a role
export function hasRole(req: Request, roleNeeded: string): boolean {
  return req.user?.roles?.includes(roleNeeded) ?? false;
}

// Helper to get role subscription (includes tier check)
export function getRoleSubscription(req: Request, roleNeeded: string) {
  if (!req.user?.roleSubscriptions) return null;
  return req.user.roleSubscriptions.find((rs: any) => rs.role === roleNeeded);
}

// Middleware: Require role + optional tier gate
export const requireRole = (roleNeeded: string, tierNeeded?: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!hasRole(req, roleNeeded)) {
      return res.status(403).json({ error: "Insufficient role" });
    }
    if (tierNeeded) {
      const subscription = getRoleSubscription(req, roleNeeded);
      if (!subscription || subscription.subscriptionTier === "SIMPLE") {
        return res.status(403).json({ error: "Tier upgrade required" });
      }
    }
    next();
  };
};
```

**Usage:**
```typescript
// Organizer endpoint (any tier)
router.post('/sales', requireRole('ORGANIZER'), createSaleController);

// PRO-tier organizer only
router.post('/batch-operations', requireRole('ORGANIZER', 'PRO'), batchOpController);
```

**Key points:**
- No role duplication: single source of truth in JWT.
- Tier checks include subscription status validation (do not allow access if lapsed).
- Token version mismatch detected on API calls → redirect to login/token refresh.

#### 2.3 Backward Compatibility

Existing code using `req.user.role` will fail silently on dual-role JWTs. Transition plan:

1. **Week 1:** Deploy JWT payload + middleware with both legacy and new helpers (deprecation warnings in logs).
2. **Week 2:** Audit all 47 endpoints — switch from `.role` to `hasRole()` / `getRoleSubscription()`.
3. **Week 3:** Delete deprecated `.role` field from JWT and local User object.

No data migration needed; tokens are ephemeral.

---

## Part 2: #73 Two-Channel Notification System

### Current State

`Notification` model exists but lacks channel routing:
```prisma
model Notification {
  id        String   @id @default(uuid())
  userId    String
  type      String   // "sale_alert" | "purchase" | ...
  title     String
  body      String
  link      String?
  read      Boolean  @default(false)
  createdAt DateTime
}
```

All notifications are inbox + push. No separation between organizer operational alerts and shopper discovery alerts.

### Schema Change: Add `notificationChannel` Field

**Migration:**
```sql
-- Add notificationChannel field to Notification table
ALTER TABLE "Notification"
ADD COLUMN "notificationChannel" VARCHAR(50) DEFAULT 'OPERATIONAL';

-- Backfill: Categorize by type
UPDATE "Notification"
SET "notificationChannel" = 'OPERATIONAL'
WHERE type IN ('purchase', 'message', 'system');

UPDATE "Notification"
SET "notificationChannel" = 'DISCOVERY'
WHERE type IN ('sale_alert', 'flash_deal', 'badge');

-- Add index for efficient filtering
CREATE INDEX idx_notification_channel_userid ON "Notification"(userId, "notificationChannel");
```

**Updated Prisma schema:**
```prisma
model Notification {
  id                   String   @id @default(uuid())
  userId               String
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  type                 String   // "sale_alert" | "purchase" | "message" | "flash_deal" | "badge" | "system"
  notificationChannel  String   @default("OPERATIONAL") // "OPERATIONAL" | "DISCOVERY"

  title                String
  body                 String
  link                 String?
  read                 Boolean  @default(false)
  createdAt            DateTime @default(now())

  @@index([userId, notificationChannel, read])
  @@index([createdAt])
}

enum NotificationChannel {
  OPERATIONAL  // Organizer-facing: orders, holds, holds expiring, refunds, messages, system alerts
  DISCOVERY    // Shopper-facing: sales nearby, items added, flash deals, badges, recommendations
}
```

### Backend Routing Logic

**Service layer:** `packages/backend/src/services/notificationService.ts`

```typescript
export class NotificationService {

  // Create notification with automatic channel routing
  async create(userId: string, notif: NotificationInput) {
    const channel = this.deriveChannel(notif.type, userId);

    return db.notification.create({
      data: {
        userId,
        type: notif.type,
        notificationChannel: channel,
        title: notif.title,
        body: notif.body,
        link: notif.link,
      }
    });
  }

  // Derive channel from notification type + user role context
  private deriveChannel(type: string, userId: string): string {
    const orgChannelTypes = ['purchase', 'message', 'system', 'hold_expiring'];
    const shopperChannelTypes = ['sale_alert', 'flash_deal', 'badge', 'recommendation'];

    if (orgChannelTypes.includes(type)) return 'OPERATIONAL';
    if (shopperChannelTypes.includes(type)) return 'DISCOVERY';
    return 'OPERATIONAL'; // safe default
  }

  // Get notifications by channel (ORGANIZER can see only OPERATIONAL when in org context)
  async getByChannel(userId: string, channel: string) {
    return db.notification.findMany({
      where: {
        userId,
        notificationChannel: channel,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
```

### Frontend Impact

- **Organizer inbox:** Filter `notificationChannel === "OPERATIONAL"` when user is in organizer context.
- **Shopper inbox:** Filter `notificationChannel === "DISCOVERY"` when user is in shopper context.
- **Dual context:** Show both channels with tabs or toggles.

Example: `/pages/notifications.tsx`
```typescript
const [channel, setChannel] = useState<'OPERATIONAL' | 'DISCOVERY'>('OPERATIONAL');
const notifications = useQuery(['notifications', channel],
  () => api.get(`/notifications?channel=${channel}`)
);
```

### Backward Compatibility

- All existing notifications default to `OPERATIONAL` (safe for organizer-first product).
- Old code that fetches `/api/notifications` without filtering still works (gets all).
- New code gradually adopts channel-aware queries.

---

## Part 3: #74 Role-Aware Registration Consent Flow

### Current State

`RoleConsent` table exists (Phase 1 schema). No UI flow yet. Signup currently uses legacy single-role consent.

### Schema Already Built

```prisma
model RoleConsent {
  id                                 String   @id @default(cuid())
  subscriptionId                     String   @unique
  role                               String   // "ORGANIZER" | "SHOPPER"
  termsAcceptedAt                    DateTime?
  privacyAcceptedAt                  DateTime?
  businessVerificationAcceptedAt     DateTime?  // ORGANIZER only
  paymentMethodAcceptedAt            DateTime?  // ORGANIZER only
  marketingOptInAt                   DateTime?  // SHOPPER only
  emailOptOut                        Boolean   @default(false)
  createdAt                          DateTime
  updatedAt                          DateTime
}
```

### Signup Flow (Frontend)

**File:** `packages/frontend/pages/auth/register.tsx`

**New UI: Dual Consent Checkboxes**

```
[ ] I agree to the Terms of Service
[ ] I agree to the Privacy Policy

--- ORGANIZER (Sale Management) ---
[ ] I want to receive alerts about my sales (holds expiring, new orders, refunds)
    [LEGAL_COPY_PLACEHOLDER_ORGANIZER_ALERTS]

--- SHOPPER (Discovery) ---
[ ] I want to discover nearby sales and special offers
    [LEGAL_COPY_PLACEHOLDER_SHOPPER_DISCOVERY]
```

**Form submission:**
1. User clicks "Register".
2. Validate: terms + privacy = required; organizer/shopper alerts = optional.
3. POST `/api/auth/register` with:
   ```json
   {
     "email": "user@example.com",
     "password": "...",
     "name": "Jane Doe",
     "consentData": {
       "termsAcceptedAt": "2026-03-24T10:00:00Z",
       "privacyAcceptedAt": "2026-03-24T10:00:00Z",
       "organizerAlertsOptIn": true,
       "shopperDiscoveryOptIn": true
     }
   }
   ```

### Backend Registration Flow

**File:** `packages/backend/src/controllers/authController.ts`

```typescript
export async function registerUser(req: Request, res: Response) {
  const { email, password, name, consentData } = req.body;

  // 1. Create User with both roles
  const user = await db.user.create({
    data: {
      email,
      password: bcrypt.hashSync(password, 10),
      name,
      roles: ['USER', 'ORGANIZER', 'SHOPPER'], // All roles enabled at signup
    },
  });

  // 2. Create UserRoleSubscription for ORGANIZER
  const orgSubscription = await db.userRoleSubscription.create({
    data: {
      userId: user.id,
      role: 'ORGANIZER',
      subscriptionTier: 'SIMPLE',  // All new organizers start SIMPLE
    },
  });

  // 3. Create RoleConsent for ORGANIZER
  await db.roleConsent.create({
    data: {
      subscriptionId: orgSubscription.id,
      role: 'ORGANIZER',
      termsAcceptedAt: consentData.termsAcceptedAt,
      privacyAcceptedAt: consentData.privacyAcceptedAt,
      businessVerificationAcceptedAt: null,  // Required later in onboarding
      paymentMethodAcceptedAt: null,         // Required at first payout
      marketingOptInAt: consentData.organizerAlertsOptIn
        ? new Date()
        : null,
    },
  });

  // 4. Create UserRoleSubscription for SHOPPER
  const shopperSubscription = await db.userRoleSubscription.create({
    data: {
      userId: user.id,
      role: 'SHOPPER',
      subscriptionTier: 'FREE',  // All shoppers are FREE tier
    },
  });

  // 5. Create RoleConsent for SHOPPER
  await db.roleConsent.create({
    data: {
      subscriptionId: shopperSubscription.id,
      role: 'SHOPPER',
      termsAcceptedAt: consentData.termsAcceptedAt,
      privacyAcceptedAt: consentData.privacyAcceptedAt,
      marketingOptInAt: consentData.shopperDiscoveryOptIn
        ? new Date()
        : null,
    },
  });

  // 6. Issue JWT with both role subscriptions
  const token = jwt.sign({
    userId: user.id,
    roles: user.roles,
    roleSubscriptions: [orgSubscription, shopperSubscription],
    email: user.email,
  }, JWT_SECRET, { expiresIn: '30d' });

  return res.json({ token, user });
}
```

### D1 Backfill: Auto-Consent for Existing Organizers

**Decision (Patrick, S272):** Use `createdAt` as proxy for signup timestamp. Auto-backfill consent records as if user had opted in.

**Migration:** `packages/database/prisma/migrations/[timestamp]_backfill_role_consent.sql`

```sql
-- For each existing Organizer user without a RoleConsent record:
-- 1. Get or create UserRoleSubscription (should already exist from D1)
-- 2. Create RoleConsent with termsAcceptedAt = User.createdAt

INSERT INTO "RoleConsent" (
  "id", "subscriptionId", "role",
  "termsAcceptedAt", "privacyAcceptedAt",
  "businessVerificationAcceptedAt", "paymentMethodAcceptedAt",
  "emailOptOut",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  urs.id,  -- UserRoleSubscription ID
  'ORGANIZER',
  u."createdAt",  -- Assume user consented at signup
  u."createdAt",
  NULL,  -- Not yet verified
  NULL,  -- Not yet set payout
  FALSE,
  now(),
  now()
FROM "User" u
INNER JOIN "UserRoleSubscription" urs ON u.id = urs."userId" AND urs.role = 'ORGANIZER'
LEFT JOIN "RoleConsent" rc ON urs.id = rc."subscriptionId"
WHERE rc.id IS NULL;  -- Only insert if RoleConsent doesn't exist
```

### D3: Legal Copy (Blocked on Legal Review)

**Placeholders in schema + UI:**
- `[LEGAL_COPY_PLACEHOLDER_ORGANIZER_ALERTS]` — Legal will provide exact wording for organizer notification consent.
- `[LEGAL_COPY_PLACEHOLDER_SHOPPER_DISCOVERY]` — Legal will provide exact wording for shopper discovery consent.

These will be pulled from `claude_docs/legal/consent-copies.md` (to be filled by Legal agent).

### Email Preference Sync

After signup, both roles have opt-in stored. Email service respects role context:
- `emailService.sendOrganizerDigest(userId)` → checks `RoleConsent.organizerRole.marketingOptInAt`
- `emailService.sendSaleAlert(userId)` → checks `RoleConsent.shopperRole.marketingOptInAt`

**Existing behavior preserved:** Organizer can opt out of weekly digest; shopper can opt out of discovery emails.

---

## Part 4: #75 Tier Lapse State Logic (D2 Architect Decision)

### Architectural Decision: PARTIAL FREEZE on Tier Lapse

**Problem:** When a PRO or TEAMS organizer's subscription lapses, what happens?

**Options considered:**
1. **HARD FREEZE (Rejected):** Block all organizer features immediately. Organizer can't view sales, add items, or access dashboard. Bad UX.
2. **SOFT READ-ONLY (Rejected):** Allow read-only access to organizer features. Incomplete features confuse users; not a clear fallback.
3. **PARTIAL FREEZE (Selected):** Suspend only PRO/TEAMS-specific features. SIMPLE features + all shopper features remain active. Clear signal of what tier unlocks. Better retention.

### D2 Decision: PARTIAL FREEZE + SIMPLE Fallback + 7-Day Warning

**Lapse Timeline:**
- **T-7 days:** Send warning email: "Your PRO subscription expires in 7 days. All PRO features will be suspended if you don't renew."
- **T-0 (expiry):** Tier lapses. `UserRoleSubscription.tierLapsedAt = now()`.
- **T+0 to T+30:** Organizer can still add items, view sales (SIMPLE features). PRO features are gated. Show "Upgrade to unlock" prompts.
- **Resume:** If organizer re-subscribes, `tierResumedAt = now()` + all features re-enabled.

### Schema Already Built

```prisma
model UserRoleSubscription {
  // ... existing fields ...
  tierLapseWarning  DateTime?   // When to send warning email
  tierLapsedAt      DateTime?   // When tier actually lapsed
  tierResumedAt     DateTime?   // When subscription reactivated
}
```

### Feature Gating Rules (PRO/TEAMS Only)

**PRO-tier features (suspended on lapse):**
- Item Library (consignment rack)
- Voice-to-Tag
- Flip Report
- Batch Operations Toolkit
- Advanced Analytics Dashboard
- CSV/JSON exports
- Data Open Export (ZIP)
- Photo filters + advanced tagging

**SIMPLE-tier features (always available):**
- Create/edit/publish sales
- Add items (no library, no batch ops)
- View dashboard (no analytics)
- Item holds + reservations
- Payout transparency (basic)
- Weekly email digest

**SHOPPER features (always available regardless of organizer tier):**
- Browse sales
- Bid / purchase
- Favorites
- Reviews
- Sale subscriptions
- Push notifications

### Backend Implementation: Lapse Detection Service

**File:** `packages/backend/src/services/tierLapseService.ts`

```typescript
export class TierLapseService {

  // Run daily cron job: detect lapsed subscriptions
  async detectAndNotifyLapsed() {
    // Find subscriptions expiring in 7 days
    const warningDue = await db.userRoleSubscription.findMany({
      where: {
        role: 'ORGANIZER',
        subscriptionStatus: 'active',
        trialEndsAt: {
          lte: addDays(new Date(), 7),
          gte: addDays(new Date(), 6),  // Only notify once
        },
        tierLapseWarning: null,  // Not yet warned
      },
    });

    for (const sub of warningDue) {
      await this.sendLapseWarning(sub);
      await db.userRoleSubscription.update({
        where: { id: sub.id },
        data: { tierLapseWarning: new Date() },
      });
    }

    // Find subscriptions that have lapsed
    const nowLapsed = await db.userRoleSubscription.findMany({
      where: {
        role: 'ORGANIZER',
        subscriptionStatus: { in: ['canceled', 'past_due'] },
        trialEndsAt: { lte: new Date() },
        tierLapsedAt: null,  // Not yet marked lapsed
      },
    });

    for (const sub of nowLapsed) {
      await db.userRoleSubscription.update({
        where: { id: sub.id },
        data: { tierLapsedAt: new Date() },
      });

      // Invalidate tier JWT claims
      await db.user.update({
        where: { id: sub.userId },
        data: { /* no change needed; JWT will re-fetch on next request */ },
      });

      await this.sendLapseNotification(sub);
    }
  }

  private async sendLapseWarning(sub: UserRoleSubscription) {
    const user = await db.user.findUnique({ where: { id: sub.userId } });
    await emailService.send(user.email, 'tier-lapse-warning', {
      tier: sub.subscriptionTier,
      expiryDate: sub.trialEndsAt,
      renewUrl: `${FRONTEND_URL}/organizer/billing?renew=true`,
    });
  }

  private async sendLapseNotification(sub: UserRoleSubscription) {
    const user = await db.user.findUnique({ where: { id: sub.userId } });
    await emailService.send(user.email, 'tier-lapsed', {
      tier: sub.subscriptionTier,
      fallbackTier: 'SIMPLE',
      restorationUrl: `${FRONTEND_URL}/organizer/billing`,
    });
  }

  // Check if organizer can access PRO feature
  canAccessFeature(sub: UserRoleSubscription, feature: 'ITEM_LIBRARY' | 'VOICE_TAG' | 'BATCH_OPS' | 'EXPORT' | 'ANALYTICS'): boolean {
    if (sub.role !== 'ORGANIZER') return false;
    if (sub.tierLapsedAt) return false;  // Lapsed = no PRO features
    return ['PRO', 'TEAMS'].includes(sub.subscriptionTier);
  }
}
```

### Frontend Gating: Feature Lock Messages

**Pattern:** Any PRO-tier feature shows a "Upgrade Required" gate if lapsed.

```typescript
// Example: Item Library page
export function ItemLibraryPage({ user }: Props) {
  const orgSubscription = user.roleSubscriptions?.find(rs => rs.role === 'ORGANIZER');
  const isLapsed = orgSubscription?.tierLapsedAt !== null;
  const isPro = ['PRO', 'TEAMS'].includes(orgSubscription?.subscriptionTier || 'SIMPLE');

  if (isLapsed && !isPro) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold">PRO Feature Unavailable</h2>
        <p className="text-gray-600 mb-6">Your PRO subscription expired on {orgSubscription.tierLapsedAt.toLocaleDateString()}.</p>
        <Button href="/organizer/billing">Renew Subscription</Button>
      </div>
    );
  }

  // Normal Item Library UI
  return <ItemLibrary />;
}
```

### Resume Flow

When organizer reactivates subscription:
1. Stripe webhook → `invoice.payment_succeeded`
2. Backend updates `UserRoleSubscription.subscriptionStatus = 'active'` + `tierResumedAt = now()`.
3. Clear `tierLapsedAt` (not set).
4. JWT refresh includes tier state again.
5. Frontend automatically unlocks PRO features.

No manual action from organizer needed; all automatic.

### Cron Job Setup

**File:** `packages/backend/src/jobs/tierLapseCron.ts`

```typescript
import cron from 'node-cron';
import { TierLapseService } from '../services/tierLapseService';

const tierLapseService = new TierLapseService();

// Daily at 2 AM UTC
cron.schedule('0 2 * * *', async () => {
  try {
    await tierLapseService.detectAndNotifyLapsed();
    console.log('[Tier Lapse Cron] Run complete');
  } catch (error) {
    console.error('[Tier Lapse Cron] Error:', error);
  }
});
```

### Shopper Features Never Affected

**Critical:** When an organizer's tier lapses, their shopper features are NOT suspended. An organizer who shops can:
- Continue viewing sales
- Continue bidding / purchasing
- Continue favorites
- Receive shopper discovery notifications

Only organizer-role features are gated by tier status.

---

## Part 5: Implementation Handoff to findasale-dev

### Batch Summary

| Item | Scope | Depends On | Estimated Effort | Notes |
|------|-------|-----------|-----------------|-------|
| #72 Phase 2 | JWT payload + auth middleware | None | 6h | Phase 1 schema complete; code changes only. |
| #73 | Add `notificationChannel` field + backend routing | #72 | 4h | Schema migration + service layer. |
| #74 | Signup flow UI + consent records | #72, D1 backfill | 5h | D1 migration runs before this. Legal copy pending. |
| #75 | Lapse detection + feature gating | #72 | 8h | Cron job + frontend gates across 8+ PRO features. |
| **D1 Backfill** | Auto-populate UserRoleSubscription + RoleConsent | None | 2h | **Patrick runs this first.** |
| **Total** | All of Batch D | | 25h | D1 must run before #74/#75. |

### Execution Order (Dev Session)

1. **Dev reads this ADR** → confirms schema + decisions.
2. **Patrick runs D1 backfill** → `prisma migrate deploy` + `prisma generate`.
3. **Dev: #72 Phase 2** → JWT payload + auth middleware + endpoint audit.
4. **QA smoke test #72** → JWT payload verified, auth middleware enforces role checks.
5. **Dev: #73 + #74 + #75** → can run in parallel after #72 QA passes.
6. **QA: Full Batch D** → test all four features end-to-end.

### Files to Create / Modify

**Migrations:**
- `packages/database/prisma/migrations/[timestamp]_add_notification_channel.sql` — Add field + backfill + index.
- `packages/database/prisma/migrations/[timestamp]_backfill_role_consent.sql` — Create RoleConsent records (D1 dependent).

**Backend Code:**
- `packages/backend/src/middleware/auth.ts` — Add hasRole(), getRoleSubscription(), requireRole().
- `packages/backend/src/controllers/authController.ts` — Update registerUser() for dual roles.
- `packages/backend/src/services/notificationService.ts` — Add channel routing logic.
- `packages/backend/src/services/tierLapseService.ts` — NEW FILE. Lapse detection + notifications.
- `packages/backend/src/jobs/tierLapseCron.ts` — NEW FILE. Cron registration.
- `packages/backend/src/index.ts` — Register cron job at startup.

**Frontend Code:**
- `packages/frontend/pages/auth/register.tsx` — NEW UI: dual consent checkboxes.
- `packages/frontend/pages/notifications.tsx` — Add channel filtering.
- `packages/frontend/pages/organizer/item-library.tsx` — Add lapse gate.
- `packages/frontend/pages/organizer/[... 8 other PRO feature pages]` — Add lapse gates.
- `packages/frontend/hooks/useFeatureAccess.ts` — NEW FILE. Helper to check `canAccessFeature()`.

**Tests:**
- `packages/backend/tests/services/tierLapseService.test.ts` — NEW. Lapse detection logic.
- `packages/backend/tests/middleware/auth.test.ts` — JWT payload + role checks.
- `packages/frontend/__tests__/pages/register.test.tsx` — Dual consent checkboxes.

### Acceptance Criteria

**#72 Complete when:**
- [ ] JWT payload includes `roles[]` and `roleSubscriptions[]`.
- [ ] `hasRole()`, `getRoleSubscription()`, `requireRole()` middleware working.
- [ ] 47 endpoints audited: all using new helpers (no `.role` references).
- [ ] Auth test suite passes: legacy JWT still works; new JWT enforces role checks.
- [ ] TypeScript: zero errors in auth + notification modules.

**#73 Complete when:**
- [ ] `notificationChannel` field present on all Notification records.
- [ ] Migration backfills `OPERATIONAL` for existing alerts, `DISCOVERY` for sales.
- [ ] NotificationService.getByChannel() filters correctly.
- [ ] Notification creation auto-routes to correct channel.
- [ ] API test: GET `/notifications?channel=OPERATIONAL` returns only OPERATIONAL.

**#74 Complete when:**
- [ ] Register form shows dual consent checkboxes (with legal placeholders).
- [ ] New users create UserRoleSubscription + RoleConsent for both roles.
- [ ] D1 backfill ran: existing organizers have RoleConsent records.
- [ ] Consent prefs respected by email service.
- [ ] TypeScript: zero errors in auth controller.

**#75 Complete when:**
- [ ] Cron job runs daily, detects lapsed subscriptions, sends warnings + notifications.
- [ ] `tierLapsedAt` and `tierResumedAt` timestamps recorded correctly.
- [ ] 8 PRO feature pages show "Upgrade" gate when lapsed.
- [ ] Shopper features still accessible when organizer tier lapses.
- [ ] Resume flow: reactivate subscription → PRO features unlock immediately.
- [ ] QA: Test both lapse and resume flows end-to-end (stripe mock).

---

## Summary Table: Feature Dependencies

```
Signup → #72 (JWT + Auth Middleware) → #73 (Notifications)
                                    ↓
                                 #74 (Consent Flow)
                                 #75 (Tier Lapse)
```

**D1 (Backfill)** is a pre-requisite: Patrick runs this before Dev starts #74/#75.

**D2 (Tier Lapse Behavior)** is decided: PARTIAL FREEZE + SIMPLE fallback + 7-day warning.

**D3 (Consent Copy)** is blocked: Legal provides copy → frontend inserts into placeholders.

---

## Appendix: Why This Architecture

### Why Dual-Role (Not Separate Accounts)?

Separate accounts → user friction (login twice), lost cart context, broken favorites. Single user with multiple roles → seamless experience.

### Why PARTIAL FREEZE (Not HARD FREEZE)?

Hard freeze → organizer can't view sales or add items. Organizer panic → immediate churn. Partial freeze → clear upgrade funnel, organizer retains access to core tools, higher retention.

### Why 7-Day Warning?

Too early (14 days) → users ignore. Too late (1 day) → no time to act. 7 days is standard SaaS practice and gives organizers time to decide.

### Why Backfill (Not Require Fresh Consent)?

Platform is beta, no real organizers yet (per Patrick). Requiring fresh consent = friction. Auto-backfill = no friction.

---

## References

- Schema Lock: `packages/database/prisma/schema.prisma` (Phase 1 models already exist)
- Auth Middleware: `packages/backend/src/middleware/auth.ts`
- STACK.md: JWT + bcrypt already locked (no changes needed)
- DECISIONS.md: #65 (Subscription Tiers), #71 (Organizer Reputation)

---

**Status:** READY FOR DEV DISPATCH
**Next Action:** Patrick runs D1 backfill → Dev dispatch to findasale-dev with this ADR.
