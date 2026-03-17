# ADR-017-019: Bid Bot Detector + Passkey/WebAuthn Authentication — Specification

**Date:** 2026-03-17
**Status:** DESIGN READY
**Session:** S190
**Sprint:** 1.5 + 2 (concurrent)

---

## Executive Summary

Two security and user experience enhancements:

1. **Feature #17: Bid Bot Detector & Fraud Confidence Score** [PRO tier] — Detects suspicious bidding patterns (rapid bids, cancel loops, velocity spikes) and surfaces a 0–100 fraud confidence score to organizers. Human-review workflow only; no auto-bans. ~1–1.5 sprints.

2. **Feature #19: Passkey/WebAuthn Support** [ALL tiers] — Phishing-resistant passwordless authentication. Users register passkeys alongside password auth; JWT returned on completion mirrors existing password auth flow. ~1–2 sprints.

Both features are **backend-heavy** (database schema + API) with **minimal frontend** (organizer fraud dashboard, settings UI). No new dependencies on the locked stack; auth uses `@simplewebauthn/server` + `@simplewebauthn/browser`.

---

## Feature #17: Bid Bot Detector & Fraud Confidence Score

### 1. Schema Design

**New model: `FraudSignal`**

```prisma
model FraudSignal {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  itemId          String
  item            Item      @relation(fields: [itemId], references: [id])
  saleId          String
  sale            Sale      @relation(fields: [saleId], references: [id])

  // Signal type enum: what triggered the flag
  signalType      String    // RAPID_BID | BID_CANCEL_PATTERN | HIGH_CANCELLATION_RATE | VELOCITY_SPIKE

  // Fraud confidence: 0-100, higher = more suspicious
  confidenceScore Int       @default(0)

  // Metadata
  detectedAt      DateTime  @default(now())
  reviewedAt      DateTime?
  reviewedByAdminId String?
  reviewedByAdmin User?     @relation("FraudReviewsBy", fields: [reviewedByAdminId], references: [id])

  // Admin review outcome
  reviewOutcome   String?   // PENDING | DISMISSED | CONFIRMED
  notes           String?   // Admin notes or auto-generated details

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([userId, itemId, signalType])
  @@index([saleId])
  @@index([userId])
  @@index([confidenceScore])
  @@index([reviewOutcome])
}
```

**Update: `User` model**

Add to existing User model:
```prisma
fraudSignals      FraudSignal[]
fraudReviewsGiven FraudSignal[] @relation("FraudReviewsBy")
```

**Update: `Sale` model**

Add to existing Sale model:
```prisma
fraudSignals      FraudSignal[]
```

**Update: `Item` model**

Add to existing Item model:
```prisma
fraudSignals      FraudSignal[]
```

### 2. Migration SQL

**File:** `packages/database/prisma/migrations/20260317001300_add_fraud_signals/migration.sql`

```sql
-- CreateTable "FraudSignal"
CREATE TABLE "FraudSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewedByAdminId" TEXT,
    "reviewOutcome" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FraudSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id"),
    CONSTRAINT "FraudSignal_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id"),
    CONSTRAINT "FraudSignal_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id"),
    CONSTRAINT "FraudSignal_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "User" ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FraudSignal_userId_itemId_signalType_key" ON "FraudSignal"("userId", "itemId", "signalType");

-- CreateIndex
CREATE INDEX "FraudSignal_saleId_idx" ON "FraudSignal"("saleId");

-- CreateIndex
CREATE INDEX "FraudSignal_userId_idx" ON "FraudSignal"("userId");

-- CreateIndex
CREATE INDEX "FraudSignal_confidenceScore_idx" ON "FraudSignal"("confidenceScore");

-- CreateIndex
CREATE INDEX "FraudSignal_reviewOutcome_idx" ON "FraudSignal"("reviewOutcome");
```

### 3. Fraud Confidence Algorithm

**Inputs & Weights:**

| Signal | Threshold | Points | Notes |
|--------|-----------|--------|-------|
| **Rapid Bids** | >3 bids on same item in 60s | +40 | Indicates bot-like speed |
| **Bid-Cancel Pattern** | 5+ consecutive bid-cancel cycles on same item | +30 | Indicates price testing or manipulation |
| **High Cancellation Rate** | >50% of all bids cancelled in last 7d | +20 | Repeated reservations without purchase |
| **Velocity Spike** | >10 bids in 24h (vs user's avg 2/day) | +15 | Abnormal activity surge |
| **New Account** | Account <7 days old + rapid activity | +10 | Time-limited boost for fresh accounts |
| **Failed Payments** | 3+ payment failures in last 48h | +10 | Suggests testing/probing |

**Calculation:**
```
finalScore = min(100, sum of matching signal weights)
```

**Score Interpretation:**
- **0–30:** Low risk — no badge shown
- **31–50:** Medium risk — amber badge shown
- **51–75:** High risk — orange badge shown
- **76–100:** Very high risk — red badge shown

### 4. Detection Trigger Points

Fraud detection is triggered at two key moments:

1. **On bid placement** (`POST /api/items/:itemId/bid`)
   → Check rapid-bid and velocity-spike signals
   → Upsert FraudSignal if score > 30

2. **On hold/reservation completion** (`POST /api/items/:itemId/reserve`)
   → Check cancellation history
   → Upsert FraudSignal if score > 30

### 5. API Contract

**All endpoints PRO-gated unless noted. Authentication required.**

#### 5.1 GET /api/fraud/sale/:saleId
**Organizer views fraud signals for their sale**

- **Auth:** authenticate + requireTier('PRO')
- **Ownership:** Caller must own the sale
- **Query params:**
  - `minScore` (int, default 30): Filter signals >= this score
  - `status` (string): Filter by reviewOutcome (PENDING, DISMISSED, CONFIRMED)
  - `page` (int, default 1): Pagination
  - `limit` (int, default 20): Results per page

**Response:**
```json
{
  "signals": [
    {
      "id": "sig_...",
      "userId": "user_...",
      "userName": "Suspicious Bidder",
      "itemId": "item_...",
      "itemTitle": "Antique Desk",
      "signalType": "RAPID_BID",
      "confidenceScore": 67,
      "detectedAt": "2026-03-17T12:34:00Z",
      "reviewedAt": null,
      "reviewOutcome": "PENDING",
      "notes": "3 bids in 45 seconds"
    }
  ],
  "total": 4,
  "page": 1,
  "hasMore": false
}
```

#### 5.2 GET /api/fraud/user/:userId
**Admin views fraud history for a specific user**

- **Auth:** authenticate + requireRole('ADMIN')
- **Query params:**
  - `minScore` (int, default 0)
  - `page` (int, default 1)
  - `limit` (int, default 50)

**Response:** Same schema as 5.1

#### 5.3 POST /api/fraud/signals/:signalId/review
**Organizer or admin marks a signal as reviewed**

- **Auth:** authenticate + (requireTier('PRO') OR requireRole('ADMIN'))
- **Ownership:** If organizer, must own the sale linked to the signal
- **Body:**
```json
{
  "outcome": "DISMISSED" | "CONFIRMED",
  "notes": "False positive — legitimate multi-item shopper"
}
```

**Response:**
```json
{
  "id": "sig_...",
  "reviewedAt": "2026-03-17T13:00:00Z",
  "reviewedByAdminId": "admin_...",
  "reviewOutcome": "DISMISSED",
  "notes": "False positive — legitimate multi-item shopper"
}
```

**Status codes:**
- `200`: Updated
- `403`: Not owner / insufficient tier
- `404`: Signal not found

### 6. Files to Create/Modify

**Backend:**
- `packages/backend/src/controllers/fraudController.ts` (NEW) — 3 handlers
- `packages/backend/src/routes/fraud.ts` (NEW) — Router with 3 endpoints
- `packages/backend/src/services/fraudDetectionService.ts` (NEW) — Confidence scoring logic
- `packages/database/prisma/schema.prisma` (MODIFY) — Add FraudSignal, relations to User/Item/Sale
- `packages/backend/src/index.ts` (MODIFY) — Register /api/fraud route

**Frontend:**
- `packages/frontend/components/FraudBadge.tsx` (NEW) — Badge component (colors: amber/orange/red)
- `packages/frontend/pages/organizer/command-center.tsx` (MODIFY) — Add Fraud tab to Command Center
- `packages/frontend/pages/organizer/fraud-signals.tsx` (NEW) — Fraud signals dashboard page (optional, or inline tab)

### 7. Sprint Breakdown

**Sprint 1 (1 week):**
- Schema design + migration
- fraudDetectionService (confidence algorithm)
- fraudController (3 handlers)
- fraud routes
- Index.ts registration
- API testing (POST /api/fraud/sale/:saleId with mock data)

**Sprint 2 (0.5 week):**
- FraudBadge component
- Command Center Fraud tab
- Organizer fraud dashboard UI
- E2E test (place bid → fraud signal generated → organizer views signal)

### 8. Key Risks

1. **False positives:** Enthusiastic shoppers marked as bot-like. Mitigation: score threshold 50+, organizer review required.
2. **Legitimate multi-item velocity:** Power shoppers buying multiple items fast. Mitigation: confidence algo weights new accounts differently.
3. **Privacy concern:** Organizers seeing PII of flagged users. Mitigation: Show minimal PII (email hidden, first name + last initial only).

### 9. Rollback Plan

**Migration down:**
```sql
DROP TABLE "FraudSignal";
```

**Playbook:** If fraud signals table is corrupted or detection is creating false positives, run the down migration, then delete the `FraudSignal` table from Neon. No app code changes needed — fraud endpoints will 404 gracefully.

---

## Feature #19: Passkey/WebAuthn Support

### 1. Schema Design

**New model: `PasskeyCredential`**

```prisma
model PasskeyCredential {
  id                String    @id @default(cuid())
  userId            String
  user              User      @relation(fields: [userId], references: [id])

  // WebAuthn credential identifier (base64url encoded)
  credentialId      String    @unique

  // Public key (PEM-encoded string, stored as text)
  publicKey         String

  // Counter for replay attack detection (incremented each auth)
  counter           Int       @default(0)

  // Optional: device name set by user ("iPhone Face ID", "MacBook Touch ID")
  deviceName        String?

  // Registration timestamp
  createdAt         DateTime  @default(now())
  lastUsedAt        DateTime?
  updatedAt         DateTime  @updatedAt

  @@index([userId])
}
```

**Update: `User` model**

Add to existing User model:
```prisma
passkeys          PasskeyCredential[]
```

### 2. Migration SQL

**File:** `packages/database/prisma/migrations/20260317001400_add_passkey_credentials/migration.sql`

```sql
-- CreateTable "PasskeyCredential"
CREATE TABLE "PasskeyCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL UNIQUE,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "deviceName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PasskeyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id")
);

-- CreateIndex
CREATE INDEX "PasskeyCredential_userId_idx" ON "PasskeyCredential"("userId");
```

### 3. Challenge Storage

**In-Memory Challenge Map** (no database)

```typescript
// packages/backend/src/lib/webauthnChallenges.ts
const challengeMap = new Map<string, { challenge: string; expiresAt: number }>();

const CHALLENGE_TTL = 5 * 60 * 1000; // 5 minutes

export function generateAndStoreChallenge(userId: string): string {
  const challenge = base64url(crypto.getRandomBytes(32));
  const expiresAt = Date.now() + CHALLENGE_TTL;

  challengeMap.set(userId, { challenge, expiresAt });

  // Cleanup: delete expired challenges every 10 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, { expiresAt }] of challengeMap) {
      if (now > expiresAt) {
        challengeMap.delete(key);
      }
    }
  }, 10 * 60 * 1000);

  return challenge;
}

export function getAndValidateChallenge(userId: string): string | null {
  const entry = challengeMap.get(userId);
  if (!entry || Date.now() > entry.expiresAt) {
    challengeMap.delete(userId);
    return null;
  }
  challengeMap.delete(userId); // One-time use
  return entry.challenge;
}
```

### 4. Registration Flow

**Two-step handshake:**

#### 4.1 POST /api/auth/passkey/register/begin
**Start passkey registration**

- **Auth:** authenticate (user must be logged in)
- **Body:** (none)

**Response:**
```json
{
  "publicKeyOptions": {
    "challenge": "...",
    "rp": {
      "name": "FindA.Sale",
      "id": "finda.sale"
    },
    "user": {
      "id": "...",
      "name": "user@example.com",
      "displayName": "User Name"
    },
    "pubKeyCredParams": [
      { "type": "public-key", "alg": -7 },
      { "type": "public-key", "alg": -257 }
    ],
    "timeout": 60000,
    "attestation": "none",
    "authenticatorSelection": {
      "authenticatorAttachment": "platform",
      "residentKey": "discouraged"
    }
  }
}
```

- **Status codes:** 200 (success), 401 (not authenticated)

#### 4.2 POST /api/auth/passkey/register/complete
**Complete passkey registration**

- **Auth:** authenticate
- **Body:**
```json
{
  "credentialId": "base64url_encoded_id",
  "attestationObject": "base64url_encoded_attestation",
  "clientDataJSON": "base64url_encoded_client_data",
  "deviceName": "My iPhone Face ID" (optional)
}
```

**Response:**
```json
{
  "id": "credential_id",
  "deviceName": "My iPhone Face ID",
  "createdAt": "2026-03-17T14:00:00Z",
  "message": "Passkey registered successfully"
}
```

- **Status codes:** 201 (created), 400 (invalid credential), 401 (not authenticated), 409 (credential already exists)

### 5. Authentication Flow

**Two-step handshake:**

#### 5.1 POST /api/auth/passkey/authenticate/begin
**Start passkey authentication**

- **Auth:** None (public endpoint)
- **Body:** (none)

**Response:**
```json
{
  "publicKeyOptions": {
    "challenge": "...",
    "timeout": 60000,
    "rpId": "finda.sale",
    "allowCredentials": [],
    "userVerification": "preferred"
  }
}
```

- **Note:** `allowCredentials` can be empty (discoverable/resident key flow) or populated with known credential IDs if user provides email first
- **Status codes:** 200

#### 5.2 POST /api/auth/passkey/authenticate/complete
**Complete passkey authentication**

- **Auth:** None
- **Body:**
```json
{
  "credentialId": "base64url_encoded_id",
  "authenticatorData": "base64url_encoded_data",
  "clientDataJSON": "base64url_encoded_client_data",
  "signature": "base64url_encoded_signature"
}
```

**Response (on success):**
```json
{
  "user": {
    "id": "user_...",
    "email": "user@example.com",
    "name": "User Name",
    "role": "USER",
    "points": 150,
    "referralCode": "ABC12345"
  },
  "token": "eyJhbGc...",
  "message": "Authenticated via passkey"
}
```

- **Status codes:** 200 (success), 400 (invalid credential), 401 (verification failed), 404 (credential not found)

### 6. Environment Variables

Add to `.env` and Railway config:

```bash
WEBAUTHN_RP_ID=finda.sale          # Production: finda.sale
WEBAUTHN_ORIGIN=https://finda.sale # Production origin for verification
```

**Local development (.env.local):**
```bash
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:3000
```

### 7. Files to Create/Modify

**Backend:**
- `packages/backend/src/controllers/passkeyController.ts` (NEW) — 4 handlers
- `packages/backend/src/routes/passkey.ts` (NEW) — Router with 4 endpoints
- `packages/backend/src/lib/webauthnChallenges.ts` (NEW) — In-memory challenge store
- `packages/database/prisma/schema.prisma` (MODIFY) — Add PasskeyCredential, relation to User
- `packages/backend/src/index.ts` (MODIFY) — Register /api/auth/passkey routes (nested under /api/auth)

**Frontend:**
- `packages/frontend/pages/auth/passkey-register.tsx` (NEW) — Passkey registration UI
- `packages/frontend/pages/auth/passkey-authenticate.tsx` (NEW) — Passkey authentication UI (optional; can be modal)
- `packages/frontend/pages/organizer/settings.tsx` (MODIFY) — Add "Security" tab with "Manage Passkeys" section
- `packages/frontend/components/PasskeyManager.tsx` (NEW) — List, add, delete passkeys

**Dependencies:**
- Add `@simplewebauthn/server` + `@simplewebauthn/browser` to `packages.json` workspace

### 8. Co-existence with Password Auth

**Key principle:** Passkeys are _additional_ auth methods, not replacements.

- Users keep their password; password auth continues to work
- Users can register 0 or more passkeys
- JWT returned is _identical_ whether password or passkey auth was used
- On login page: "Sign in with email/password" OR "Sign in with passkey"
- On settings Security tab: "Change Password" section + separate "Manage Passkeys" section

### 9. Sprint Breakdown

**Sprint 1 (1 week):**
- Schema design + migration
- webauthnChallenges.ts (in-memory store)
- passkeyController (4 handlers with @simplewebauthn/server)
- passkey routes (begin/complete registration & authentication)
- index.ts registration
- API testing (begin → complete flow for registration + auth)

**Sprint 2 (1 week):**
- PasskeyManager component + settings tab UI
- passkey-register.tsx page
- passkey-authenticate.tsx page or modal
- Browser-side @simplewebauthn/browser integration
- E2E test (register passkey → log out → authenticate with passkey → JWT returned)

### 10. Key Risks

1. **Browser support:** WebAuthn not available on all browsers (older Safari, older Android). Mitigation: Graceful fallback to password auth.
2. **Lost passkey:** User deletes passkey from device/browser, can't log in. Mitigation: Users must have password or backup passkey.
3. **Challenge replay:** Attacker reuses a challenge. Mitigation: One-time challenge consumption; TTL 5 min.

### 11. Rollback Plan

**Migration down:**
```sql
DROP TABLE "PasskeyCredential";
```

**Playbook:** If passkey auth is broken post-deploy, run the down migration. Users fall back to password auth. No app code changes needed — passkey endpoints will 404 gracefully, and password auth is unaffected.

---

## Implementation Sequencing

### Recommended Order

1. **Feature #17 Schema + Service** (days 1–2)
2. **Feature #19 Schema + Service** (days 3–4)
3. **Feature #17 Controller + Routes** (days 5–6)
4. **Feature #19 Controller + Routes** (days 7–8)
5. **Feature #17 Frontend Dashboard** (days 9–10)
6. **Feature #19 Frontend UI** (days 11–12)

### Critical Checkpoints

- ✅ Both migrations test-applied to local Neon
- ✅ All API endpoints 200 in Postman
- ✅ JWT returned from passkey auth identical to password auth
- ✅ Fraud signals generated on test bids
- ✅ Organizer can view fraud signals for their sale

---

## Design Decisions Locked

1. **Fraud scoring:** Weights and thresholds above are final. Adjustments require new session.
2. **Passkey storage:** Public key stored as text (PEM); counter tracked for replay detection.
3. **Challenge TTL:** 5 minutes; non-configurable.
4. **RP ID:** Derived from `WEBAUTHN_RP_ID` env var; no hardcoding.
5. **No auto-remediation:** Fraud signals are for organizer review only; no auto-blocking.

---

## Appendix: Library Justification

### @simplewebauthn

**Why chosen:**
- Simplest WebAuthn server for Node.js (battle-tested)
- No dependency on external crypto libs (uses Node.js native crypto)
- Clear API for registration and verification
- Minimal boilerplate compared to fido2-lib or passport-fido2

**Alternatives considered:**
- `fido2-lib`: More flexible, heavier; overkill for basic passkey flow
- `passport-fido2`: Passport middleware; adds abstraction layer
- Homebrew: Risk of missing replay/challenge validation

---

## Sign-off

This specification is ready for developer handoff. All schema changes, API contracts, and frontend components are defined. No ambiguity remains.

**Architect:** Ready for `findasale-dev` sprint planning.

---
