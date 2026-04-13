# ADR-073: Two-Channel Notification System — OPERATIONAL + DISCOVERY

**Status:** APPROVED FOR DEVELOPMENT
**Decision Date:** 2026-03-20
**Scope:** Feature #73 (depends on #72 Phase 2: dual-role JWT with `roles: string[]`)
**Risk Level:** 🟡 MEDIUM — schema + routing logic change, fully backward compatible
**Owner:** Architect + findasale-dev

---

## 1. Problem Statement

### Current State: Single Notification Channel

Today, the `Notification` model has no channel differentiation:

```prisma
model Notification {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(...)
  type      String   // "sale_alert" | "purchase" | "message" | "flash_deal" | "badge" | "system"
  title     String
  body      String
  link      String?
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}
```

All notifications—whether organizer operational alerts (sale published, item sold, payout ready) or shopper discovery alerts (new sale nearby, item back in stock, flash deal)—flow into a single inbox. This creates three problems:

#### Problem 1A: Notification Fatigue
An organizer-shopper receives all types of alerts mixed together. Critical operational alerts (payment processed, sale published) compete with nice-to-have discovery alerts (flash deal nearby). Users either disable all notifications or miss operational ones.

**Result:** Organizers can't distinguish urgent alerts from routine marketing.

#### Problem 1B: Misrouted Preferences
Feature #72 added role-based subscription tiers and consent. Feature #74 (Role-Aware Registration Consent) will track consent per role. But today, notification opt-out is ambiguous:
- Does the user opt out of push notifications, email, or both?
- Does the organizer opt out of operational alerts only, or all alerts?
- Does the shopper's email preference apply to organizer alerts?

Without channel semantics, preference storage becomes a tangle of flags.

**Result:** Email preferences don't map to notification types; users receive unwanted alerts.

#### Problem 1C: Intent Mismatch in Discovery
Feature #31 (Buyer-to-Sale Matching) and future discovery features are inherently shopper-facing. But if organizers are also receiving these discovery alerts as part of a unified inbox, the signal becomes noisy for organizers and the feature feels less targeted for shoppers.

**Result:** Dual-role users get generic, not curated, discovery alerts.

---

## 2. Proposed Solution: Dual-Channel Notification Model

### 2.1 Schema Changes

#### New `Notification.notificationChannel` Field

```prisma
enum NotificationChannel {
  OPERATIONAL  // Organizer-facing: sale published, item sold, payout ready, tier updates, verification status
  DISCOVERY    // Shopper-facing: new sale nearby, item back in stock, flash deal, wishlist alert, badge unlock
}

model Notification {
  id                  String               @id @default(uuid())
  userId              String
  user                User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  type                String
  title               String
  body                String
  link                String?
  read                Boolean              @default(false)
  notificationChannel NotificationChannel  @default(DISCOVERY)
  createdAt           DateTime             @default(now())

  @@index([userId, notificationChannel, read])
  @@index([userId, read, createdAt])
}
```

#### Semantics

- **OPERATIONAL**: System-critical alerts for organizers (sale published, item sold, payout issued, tier upgraded, tier lapse warning — Feature #75, verification status)
- **DISCOVERY**: Marketing & engagement alerts for shoppers (new sale nearby, item back in stock, flash deal, badge unlocked, treasure trail, messages in shopper context)

---

### 2.2 Relationship to Feature #72 (Dual-Role Auth)

Phase 2 of ADR-072 added `User.roles` and `UserRoleSubscription`. Backend can now branch: `if (req.user.roles.includes("ORGANIZER")) { ... }`

```typescript
// Channel decision logic
if (notificationType === "SALE_PUBLISHED") {
  channel = NotificationChannel.OPERATIONAL;
} else if (notificationType === "FLASH_DEAL") {
  channel = NotificationChannel.DISCOVERY;
}
```

---

### 2.3 API Contract Changes

```
GET /api/notifications/inbox?channel=OPERATIONAL&limit=50
GET /api/notifications/inbox?channel=DISCOVERY&limit=50
GET /api/notifications/inbox  // All channels (backward compatible)
```

Response adds `unreadByChannel: { OPERATIONAL: number, DISCOVERY: number }`

---

### 2.4 Frontend Contract

Tab UI recommended: All / Operational / Discovery tabs with per-channel unread counts.

---

### 2.5 Relationship to Feature #74 (Role-Aware Consent)

RoleConsent `emailOptOut` per role maps to notification channel: ORGANIZER role consent gates OPERATIONAL emails; SHOPPER role consent gates DISCOVERY emails.

---

### 2.6 Migration Path

- Phase 1: Add `notificationChannel` column (default DISCOVERY). No backfill needed.
- Phase 2: Update all notification creators to set channel explicitly.
- Phase 3: Frontend tab UI (optional for MVP).

SQL migration template:
```sql
CREATE TYPE "NotificationChannel" AS ENUM ('OPERATIONAL', 'DISCOVERY');
ALTER TABLE "Notification" ADD COLUMN "notificationChannel" "NotificationChannel" NOT NULL DEFAULT 'DISCOVERY';
CREATE INDEX "Notification_userId_notificationChannel_read_idx" ON "Notification" ("userId", "notificationChannel", "read");
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification" ("userId", "read", "createdAt");
```

---

## 3. Implementation Sequence

| Task | Duration | Notes |
|------|----------|-------|
| Phase 1: Schema Deploy | 2 hours | Prisma migrate; deploy to Neon |
| Phase 2: Backend Routing | 1 day | Update all notification creators |
| Feature #74 (Consent Flow) | 2 days | Parallel; depends on RoleConsent table |
| Feature #75 (Tier Lapse Job) | 2 days | Parallel; creates OPERATIONAL notifications |
| Phase 3: Frontend UI | 1–2 days | Optional for MVP |

---

## 4. Decision & Rationale

**Chosen:** Channel enum (`OPERATIONAL` | `DISCOVERY`) as first-class field.

**Rejected alternatives:** Separate tables (code duplication), audience field (conflates sender/receiver context), type-embedded channel (pollutes type taxonomy).

**Why this solution:** Clean separation of concerns, scales with features, solves dual-role problem, enables per-role consent enforcement, backward compatible, indexed for performance.

---

## 5. Risks & Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| New notifications miss channel assignment | 🟠 MEDIUM | TypeScript `NotificationPayload` interface enforces at compile time |
| Query performance degrades | 🔴 HIGH | Test `(userId, notificationChannel, read)` index with EXPLAIN ANALYZE |
| Organizers opt out; miss operational alerts | 🟡 MEDIUM | RoleConsent defaults `emailOptOut = false` for ORGANIZER |
| NULL channel on existing rows | 🔴 HIGH | Schema default is DISCOVERY; verify 0 NULLs post-deploy |

---

## 6. Rollback Plan

Phase 1: Restore Neon backup, drop column + indexes. Phase 2: Feature flag `FEATURE_DUAL_CHANNEL_NOTIF` to disable routing; all notifications default to DISCOVERY.

---

## 7. Dev Subagent Spec

**Files to touch:**
1. `packages/database/prisma/schema.prisma` — Add `NotificationChannel` enum + field to `Notification`
2. `packages/database/prisma/migrations/[timestamp]_add_notification_channel.sql` — SQL migration
3. `packages/backend/src/controllers/notificationInboxController.ts` — Add channel filter + `unreadByChannel`
4. All notification creation points — Set `notificationChannel` explicitly
5. `packages/backend/src/routes/notificationInbox.ts` — Accept `?channel` query param

**Schema change:** Add `NotificationChannel` enum + `notificationChannel NotificationChannel @default(DISCOVERY)` + indexes.

**Rule:** Every notification creation MUST explicitly assign `notificationChannel`. TypeScript `NotificationPayload` interface enforces at compile time. Zero TS errors required.

---

**Document Version:** 1.0  
**Last Updated:** 2026-03-20
