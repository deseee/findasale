# Affiliate Program Architecture Specification — Session 544

**Date:** 2026-04-22  
**Architect:** Claude (Haiku 4.5)  
**Status:** LOCKED DECISION ARCHITECTURE  
**Authority:** FindA.Sale Systems Architect (§7, CLAUDE.md)  

---

## Executive Summary

The Affiliate Program is a **monetary referral system for organizers**, distinct from the **Referral Rewards Program** (shopper-to-shopper XP). This spec closes the gap between the 4 schema models (AffiliateLink, AffiliateCode, AffiliatePayout, AffiliateReferral) and a production-ready implementation.

**Current state:** Link tracking ✅ | Conversion counting ✅ | Attribution gap ❌ | Qualification rules ❌ | Payouts ❌ | Stripe transfers ❌ | Dashboard endpoints ❌

**Delivery model:** Ordered dev instructions for independent, deployable batches.

---

## 1. Business Model Clarification

### 1.1 Who Are Affiliates?

**ORGANIZERS ONLY.** FindA.Sale does not run a public affiliate network (no random influencers or resellers). Affiliates are current and prospective **FindA.Sale organizers** who refer other organizers to the platform.

**Rationale:**
- Shopper referrals already exist (Referral Rewards program with XP)
- Organizer acquisition is the bottleneck (supply-side growth)
- Affiliate payouts incentivize high-value sign-ups

### 1.2 Payout Model (LOCKED)

**Commission structure (proposed, pending Patrick approval):**

| Metric | Amount | Notes |
|--------|--------|-------|
| **Referrer earns (per qualified referral)** | **2% of referred organizer's net lifetime GMV** OR **$50 flat, whichever is greater** | Hybrid model caps admin overhead on tiny sales; scales fairly on large sales |
| **Qualification trigger** | Referred organizer completes first PAID sale (status=PAID) | Protects against signup-and-abandon abuse |
| **Payout threshold** | $50 minimum balance before transfer | Reduces Stripe transfer fees for small earners |
| **Payout frequency** | Manual on-demand or automatic monthly | TBD: Patrick preference (manual = lower ops overhead) |

**Example scenarios:**

- Organizer A refers Organizer B. B completes $5,000 sale. A earns max(2% × $5K, $50) = $100
- Organizer A refers Organizer C. C completes $2,000 sale. A earns max(2% × $2K, $50) = $50 (hits floor)
- Organizer A refers Organizer D. D never completes a sale. A earns $0

### 1.3 Tier Gating (LOCKED DECISION)

**Who can participate:**

| Tier | Can Earn Affiliate Commissions? | Can Become Affiliate? | Notes |
|------|------|------|-------|
| SIMPLE (Free) | ✅ Yes | ✅ Yes | Everyone eligible once they complete first paid sale |
| PRO ($29/mo) | ✅ Yes | ✅ Yes | Likely high earners; extra commission motivation |
| TEAMS ($79/mo) | ✅ Yes | ✅ Yes | Multi-user team; all team members can share affiliate links |

**Rationale:**
- Affiliate program is a **customer acquisition incentive**, not a paywall feature
- Lower friction = higher conversion
- All tiers are organizer-eligible because all tiers complete transactions

### 1.4 Overlap with Referral Rewards Program

**DO NOT CONFUSE:**

| System | User Type | Currency | Trigger | Model |
|--------|-----------|----------|---------|-------|
| **Referral Rewards** | Shopper → Shopper | XP (gamification) | New shopper signup | Invite code in User.affiliateReferralCode |
| **Affiliate Program** | Organizer → Organizer | USD (payout) | Referred organizer's first PAID sale | New AffiliateReferral record + AffiliatePayout |

These are parallel systems. Both can exist on the same platform.

---

## 2. Schema Review & Migration Plan

### 2.1 Current Schema State

Four models exist:

```prisma
model AffiliateLink {
  // Link tracking (click tracking, conversion counting)
  id          String     @id @default(cuid())
  userId      String
  saleId      String
  clicks      Int        @default(0)
  conversions Int        @default(0)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  user        User       @relation(fields: [userId], references: [id])
  sale        Sale       @relation(fields: [saleId], references: [id])
  purchases   Purchase[]

  @@unique([userId, saleId])
}

model AffiliateCode {
  // Referral code generation (UNUSED — data exists, no endpoint)
  id        String   @id @default(cuid())
  userId    String
  code      String   @unique
  createdAt DateTime @default(now())
}

model AffiliatePayout {
  // Payout tracking (NO business logic / qualification logic)
  id             String    @id @default(cuid())
  referrerId     String    // Affiliate who earned
  referrer       User      @relation("AffiliatePayoutsGiven", fields: [referrerId], references: [id])
  referredUserId String?   // Referred organizer (optional, for per-user tracking)
  referredUser   User?     @relation("AffiliatePayoutsReceived", fields: [referredUserId], references: [id])
  saleId         String?   // Linked sale (optional)
  sale           Sale?     @relation(fields: [saleId], references: [id])
  amount         Decimal
  status         String    @default("PENDING") // PENDING | PAID | CANCELLED
  paidAt         DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([referrerId])
  @@index([referredUserId])
  @@index([saleId])
  @@index([status])
}

model AffiliateReferral {
  // Individual referral relationship (UNUSED — data exists, no creation logic)
  id                String    @id @default(cuid())
  referrerId        String
  referrer          User      @relation("AffiliateReferrals_Referrer", fields: [referrerId], references: [id])
  referredUserId    String
  referredUser      User      @relation("AffiliateReferrals_Referred", fields: [referredUserId], references: [id])
  referralCode      String    @unique
  status            String    @default("PENDING") // PENDING | QUALIFIED | PAID
  payoutAmountCents Int?
  paidAt            DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([referrerId])
  @@index([referredUserId])
  @@index([referralCode])
  @@index([status])
}
```

### 2.2 Schema Sufficiency Assessment

**Gaps identified:**

1. **AffiliateCode is unused** — No endpoint to generate codes, no lookup on signup. User.affiliateReferralCode exists but isn't wired to AffiliateCode model.
2. **AffiliateReferral status flow is unclear** — `PENDING → QUALIFIED → PAID` means what? When does QUALIFIED trigger? What is the calculation rule?
3. **AffiliatePayout vs AffiliateReferral redundancy** — Both track the same relationship. Should consolidate.
4. **Missing fields:**
   - `AffiliateReferral.payoutAmountCents` — is NULL until payout calculated. Needs calculation logic spec.
   - `AffiliateReferral.stripePayoutId` — Stripe Transfer object ID (missing).
   - `AffiliateReferral.stripeTransferId` — Transfer receipt (missing).
   - `AffiliatePayout.affiliateReferralId` — FK to AffiliateReferral (missing, causes duplication).
5. **User.affiliateReferralCode field exists** — But is never populated / generated on signup.

### 2.3 Schema Redesign (LOCKED)

**CONSOLIDATION DECISION:** Merge AffiliatePayout into AffiliateReferral. Single source of truth.

**New AffiliateReferral model (replace current):**

```prisma
model AffiliateReferral {
  id                    String    @id @default(cuid())
  
  // Referral relationship
  referrerId            String    // Organizer who referred
  referrer              User      @relation("AffiliateReferrals_Referrer", fields: [referrerId], references: [id])
  referredUserId        String    // Organizer who was referred (must sign up as organizer)
  referredUser          User      @relation("AffiliateReferrals_Referred", fields: [referredUserId], references: [id])
  
  // Code tracking
  referralCode          String    @unique // Generated code (e.g., "ORG_K9X2L4")
  
  // Status flow: PENDING → QUALIFIED → PAID
  status                String    @default("PENDING") // PENDING | QUALIFIED | PAID | CANCELLED
  
  // Qualification trigger: first PAID purchase by referred organizer
  qualifiedAt           DateTime? // Timestamp when referred organizer's first PAID sale completed
  
  // Payout calculation
  payoutAmountCents     Int?      // Calculated on qualification, before payout transfer
  payoutCalculatedAt    DateTime? // When amount was calculated
  
  // Stripe transfer
  stripeTransferId      String?   // Stripe Transfer object ID (created when payout issued)
  paidAt                DateTime? // When transfer completed in Stripe
  
  // Audit trail
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@unique([referrerId, referredUserId])
  @@index([referrerId])
  @@index([referredUserId])
  @@index([referralCode])
  @@index([status])
  @@index([qualifiedAt])
}

// Delete AffiliatePayout model entirely
```

**New relationship in User model:**

```prisma
model User {
  // ... existing fields ...
  
  // Affiliate code for signup tracking
  affiliateReferralCode  String?  @unique // Code this user was referred with (e.g., "ORG_K9X2L4")
  
  // Affiliate relationships (one-way: I referred others)
  affiliateReferrals     AffiliateReferral[] @relation("AffiliateReferrals_Referrer")
  
  // Inverse: I was referred by someone (via AffiliateReferral, not as a separate field)
}
```

### 2.4 Migration Path

**Step 1: Create new AffiliateReferral schema**
```bash
npx prisma migrate create --name consolidate_affiliate_payout_to_referral
```

**Step 2: Migration SQL (manual write)**
```sql
-- Rename old AffiliateReferral to AffiliateReferral_OLD (backup)
-- Create new AffiliateReferral with new schema
-- Migrate data from AffiliatePayout → new AffiliateReferral
-- Add user.affiliateReferralCode field
-- Drop old AffiliatePayout model
-- Drop old AffiliateReferral_OLD
```

**Step 3: Deploy**
```powershell
cd packages/database
$env:DATABASE_URL="postgresql://..."  # Railway URL
npx prisma migrate deploy
npx prisma generate
```

---

## 3. API Contract Definition

### 3.1 POST /affiliate/generate-code

**Purpose:** Generate a unique affiliate code for the authenticated organizer.

**Auth:** Organizer (ORGANIZER role) who has completed at least 1 PAID sale.

**Request:**
```json
{}  // No body
```

**Response (201):**
```json
{
  "referralCode": "ORG_K9X2L4",
  "shareUrl": "https://finda.sale/signup?ref=ORG_K9X2L4",
  "createdAt": "2026-04-22T14:30:00Z"
}
```

**Error cases:**
- 401: Not authenticated
- 403: User is not an organizer OR hasn't completed first paid sale
- 400: Code already exists (idempotent — return existing code)

---

### 3.2 GET /affiliate/code

**Purpose:** Retrieve authenticated organizer's affiliate code (if exists).

**Auth:** Organizer (ORGANIZER role)

**Response (200):**
```json
{
  "referralCode": "ORG_K9X2L4",
  "shareUrl": "https://finda.sale/signup?ref=ORG_K9X2L4",
  "createdAt": "2026-04-22T14:30:00Z",
  "totalReferrals": 3,
  "qualifiedReferrals": 1,
  "totalEarned": 50000,  // cents
  "unpaidEarnings": 0    // cents
}
```

---

### 3.3 GET /affiliate/referrals

**Purpose:** List all referrals for the authenticated affiliate, with status and payout info.

**Auth:** Organizer (ORGANIZER role)

**Query params:**
- `status`: PENDING | QUALIFIED | PAID | CANCELLED (optional, filter)
- `limit`: 1-100 (default 25)
- `offset`: pagination offset (default 0)

**Response (200):**
```json
{
  "referrals": [
    {
      "id": "aff_ref_123",
      "referredUserName": "Margaret's Estate Sales",
      "referredUserEmail": "margaret@example.com",
      "referralCode": "ORG_K9X2L4",
      "status": "QUALIFIED",
      "payoutAmountCents": 10000,
      "qualifiedAt": "2026-04-20T12:30:00Z",
      "paidAt": null,
      "createdAt": "2026-04-15T08:00:00Z"
    }
  ],
  "pagination": {
    "total": 5,
    "limit": 25,
    "offset": 0
  }
}
```

---

### 3.4 POST /affiliate/payout/request

**Purpose:** Request manual payout of earned commissions (if unpaid balance >= $50 threshold).

**Auth:** Organizer (ORGANIZER role)

**Request:**
```json
{
  "stripeAccountId": "acct_1A2B3C4D5E6F7G8H"  // Organizer's Stripe Connect account
}
```

**Response (200 or 400):**
```json
{
  "success": true,
  "transferId": "tr_1ABC123DEF",
  "amount": 15000,  // cents
  "message": "Payout of $150.00 initiated. Check Stripe dashboard for status."
}
```

**Error cases:**
- 400: Unpaid balance < $50 (insufficient)
- 400: Organizer missing stripeAccountId
- 403: No qualified referrals yet
- 500: Stripe transfer failed

---

### 3.5 POST /affiliate/qualify-referral (INTERNAL / WEBHOOK)

**Purpose:** Internal endpoint triggered by webhook when a referred organizer completes their first PAID sale.

**Auth:** Internal (webhook signature validation OR server-to-server JWT with elevated scopes)

**Request:**
```json
{
  "referralCode": "ORG_K9X2L4",
  "referredUserId": "user_456",
  "purchaseId": "pur_789",  // The first PAID purchase
  "purchaseAmount": 500000  // cents
}
```

**Response (200):**
```json
{
  "success": true,
  "referralId": "aff_ref_123",
  "status": "QUALIFIED",
  "payoutAmountCents": 10000,
  "message": "Referral qualified. Payout calculated and pending manual request."
}
```

---

### 3.6 GET /organizer/dashboard/affiliate-earnings (DASHBOARD)

**Purpose:** Organizer dashboard widget showing affiliate earnings summary.

**Auth:** Organizer (ORGANIZER role)

**Response (200):**
```json
{
  "totalEarned": 50000,      // cents
  "unpaidBalance": 15000,
  "thisMonthEarnings": 20000,
  "referralCode": "ORG_K9X2L4",
  "shareUrl": "https://finda.sale/signup?ref=ORG_K9X2L4",
  "recentPayouts": [
    {
      "amount": 50000,
      "paidAt": "2026-04-20T14:00:00Z",
      "stripeTransferId": "tr_1ABC"
    }
  ]
}
```

---

## 4. Stripe Connect Integration Plan

### 4.1 Affiliate Payout Flow

FindA.Sale uses Stripe Connect Express for organizer payouts already (schema has `Organizer.stripeCustomerId`). Affiliate payouts follow the same pattern.

**Flow:**

1. **Affiliate earns commission:**
   - Referred organizer completes first PAID sale
   - AffiliateReferral.status: PENDING → QUALIFIED
   - AffiliateReferral.payoutAmountCents calculated (2% of GMV, minimum $50)

2. **Affiliate requests payout (or auto-monthly):**
   - Organizer calls POST /affiliate/payout/request
   - Backend validates balance >= $50
   - Backend creates Stripe Transfer (platform account → affiliate's Stripe Connect account)
   - On success, update AffiliateReferral.stripeTransferId + AffiliateReferral.status=PAID + AffiliateReferral.paidAt

3. **Stripe webhook confirmation:**
   - Listen for `transfer.created` and `transfer.paid` events
   - Update AffiliateReferral record
   - Send email notification to affiliate

### 4.2 Stripe Account Requirements

**Who needs a Stripe account:**
- Affiliates (organizers receiving payouts)
- Already required for normal organizer payouts (TEAMS and PRO tiers)

**Who doesn't:**
- SIMPLE tier organizers don't get normal payouts (they only earn on sales they host on FindA.Sale)
- But they CAN earn affiliate commissions and request payout

**Decision:** Affiliates must have a valid Stripe Connect account to receive payout transfers. If SIMPLE organizer has no Stripe account, they can still refer and earn, but can't request payout until they upgrade or create Stripe account.

### 4.3 Webhook Events

**Subscribe to (existing):**
- `transfer.created` — log transfer creation
- `transfer.paid` — update AffiliateReferral.paidAt, send confirmation email
- `transfer.failed` — mark payout as failed, notify affiliate to retry

---

## 5. Referral Attribution Flow (Complete End-to-End)

**Problem to solve:** `affiliateRef` in sessionStorage is never linked to Purchase in checkout.

### 5.1 Current Broken State

1. User clicks `/affiliate/[id]` (affiliate link)
2. Frontend calls GET /affiliate/click/:id
3. Backend increments AffiliateLink.clicks
4. Frontend stores `affiliateRef` in sessionStorage
5. **BROKEN:** Checkout flow never reads sessionStorage, so Purchase.affiliateLinkId is null

### 5.2 Fixed Flow (LOCKED)

**Step 1: User discovers sale via affiliate link**
- Clicks `/affiliate/[id]` link (sent by affiliate organizer)
- Frontend: GET /affiliate/click/:id → receive saleId
- Frontend: stores `sessionStorage.affiliateRef = id` (AffiliateLink ID)
- Frontend: redirects to `/items/[saleId]` or sale page

**Step 2: User browses and adds to cart**
- Clicks "Add to Cart" / "Checkout"
- Frontend loads checkout form
- Cart state includes AffiliateLink ID (persisted in sessionStorage)

**Step 3: Checkout submission**
- Frontend reads `sessionStorage.affiliateRef`
- Sends to backend in POST /stripe/create-payment-intent:
  ```json
  {
    "items": [...],
    "affiliateLinkId": "aff_link_123"  // From sessionStorage
  }
  ```

**Step 4: Backend creates Purchase**
- Creates Purchase with `affiliateLinkId: aff_link_123`
- Increments AffiliateLink.conversions on payment success
- On success webhook from Stripe, check if Purchase.affiliateLinkId is set
- If set: find AffiliateLink.userId → locate any AffiliateReferral where referred user is the organizer who owns this sale
- Trigger /affiliate/qualify-referral if this is referred organizer's first paid sale

**Step 5: Qualification logic**
- When purchase completes (Stripe payment_intent.succeeded):
  - Load AffiliateLink → get affiliate organizer (userId)
  - Load Sale → get organizer (organizerId)
  - Find any AffiliateReferral where referrerId=affiliate AND referredUserId=organizer
  - If found AND status==PENDING AND this is first PAID sale by referredUser:
    - Update AffiliateReferral.status=QUALIFIED
    - Calculate payoutAmountCents = max(round(purchase.amount * 0.02), 5000)  // 2% or $50
    - Send notification email to referrer

---

## 6. Payout Calculation Engine

### 6.1 Calculation Rule (LOCKED)

```
payoutAmountCents = max(
  round(purchaseAmount * 0.02),   // 2% of first PAID sale by referred user
  5000                             // $50 minimum
)
```

**Applied once per referral relationship, on qualification trigger.**

### 6.2 Edge Cases

| Scenario | Payout | Reason |
|----------|--------|--------|
| Referrer A → Referred B. B's first sale: $2,000. | $5,000 (50¢) | Hits floor |
| Referrer A → Referred B. B's first sale: $5,000. | $10,000 ($100) | 2% of GMV |
| Referrer A → Referred B. B completes multiple sales. | $X only from first PAID sale | Once-per-referral-relationship |
| Referrer A → Referred B. B's first sale refunded (REFUNDED status). | $0 | No payout until another PAID sale exists |
| Referrer A → Referred B. B never makes a sale. | $0 | Status remains PENDING |

---

## 7. Fraud Prevention

### 7.1 Self-Referral Detection

**Block:** Organizer from generating own referral code and signing up under own name/email.

**Implementation:**
- POST /affiliate/generate-code: If organizer has existing User.affiliateReferralCode, return error "You already have a referral code"
- On signup with referral code: If referrer=referred (same user ID), reject and flag as abuse

### 7.2 Multi-Account Collusion

**Detect:** Same person (IP, email, payment method) creating multiple organizer accounts and referring to self.

**Implementation:**
- On POST /affiliate/qualify-referral: Check if referrer and referredUser have overlapping IPs, payment methods, or email domain
- If suspicious: flag for manual review (Organizer.fraudScore or new table), do NOT auto-qualify
- Require Patrick approval for suspicious referrals

### 7.3 Minimum Account Age

**Block:** New accounts from immediately referring others.

**Implementation:**
- POST /affiliate/generate-code: Require User.createdAt < now() - 7 days
- POST /affiliate/payout/request: Require User.createdAt < now() - 30 days

### 7.4 Minimum Sale Requirement

**Block:** Organizers with no sales (or 1 failed sale) from earning affiliate payouts.

**Implementation:**
- AffiliateReferral qualification only triggers on first PAID (not PENDING or FAILED) purchase by referrer
- Also: referrer must have at least 1 PAID sale themselves (already implied by "completed first paid sale" requirement to generate code)

---

## 8. Role/Tier Gating (LOCKED)

**Eligible to participate:**
- Must be ORGANIZER role (checked at /affiliate/generate-code and /affiliate/referrals endpoints)
- Must have completed at least 1 PAID sale (business logic check)
- Any subscription tier (SIMPLE, PRO, TEAMS) eligible

**Design rationale:**
- Affiliate program is customer acquisition incentive, not premium feature
- All organizers benefit from recruitment
- Low friction = higher participation

---

## 9. Ordered Dev Instructions

**These steps are sequenced so each is independently deployable and testable.**

### DEV INSTRUCTION 1: Schema Migration

**File:** `packages/database/prisma/migrations/[TIMESTAMP]_consolidate_affiliate_payout_to_referral/migration.sql`

**What:** Consolidate AffiliatePayout into AffiliateReferral. Add missing fields.

**Steps:**
1. Read current schema.prisma and backup current AffiliateReferral / AffiliatePayout models
2. Write SQL migration:
   - Rename AffiliateReferral to AffiliateReferral_OLD
   - Create new AffiliateReferral with consolidated schema (see §2.3)
   - Migrate data: INSERT INTO new AffiliateReferral FROM AffiliatePayout (map fields)
   - DROP AffiliateReferral_OLD, AffiliatePayout
   - Add User.affiliateReferralCode UNIQUE nullable field
3. Update schema.prisma to reflect new schema
4. Test locally: `npx prisma migrate deploy`, `npx prisma generate`
5. Push migration + schema.prisma changes

**Acceptance:**
- Migration runs without error
- New AffiliateReferral model has all required fields
- No data loss (verify row counts before/after)
- TypeScript generation succeeds

---

### DEV INSTRUCTION 2: Attribution Gap Fix (sessionStorage → Checkout)

**File:** `packages/frontend/pages/checkout.tsx` (or checkout component)  
**File:** `packages/backend/src/controllers/stripeController.ts` (payment intent creation)

**What:** Wire affiliate link ID from sessionStorage into Purchase record during checkout.

**Steps:**

**Frontend:**
1. Add to checkout form initial state: read `sessionStorage.affiliateRef` on mount
2. Store in form state as `affiliateLinkId`
3. Include `affiliateLinkId` in POST /stripe/create-payment-intent request body

**Backend (stripeController.ts):**
1. Extract `affiliateLinkId` from request.body
2. Validate: affiliateLinkId exists in AffiliateLink table
3. Pass to Stripe metadata: `metadata.affiliateLinkId = affiliateLinkId`
4. On payment success (payment_intent.succeeded webhook):
   - Create Purchase with `affiliateLinkId: req.body.affiliateLinkId`
   - Increment AffiliateLink.conversions counter

**Acceptance:**
- Checkout form includes affiliateLinkId in request
- Purchase.affiliateLinkId is populated on successful payment
- AffiliateLink.conversions increments
- No impact on non-affiliate purchases (nullable field)

---

### DEV INSTRUCTION 3: Affiliate Code Generation & Retrieval

**File:** `packages/backend/src/controllers/affiliateController.ts` (new/extended)

**What:** POST /affiliate/generate-code and GET /affiliate/code endpoints.

**Implementation:**

```typescript
// generateAffiliateCode(req, res)
// - Auth: organizer role + completed ≥1 PAID sale
// - If code exists: return existing (idempotent)
// - Else: generate 8-char code like "ORG_K9X2L4"
// - Create AffiliateReferral? NO — code exists before referrals
// - Return { referralCode, shareUrl, createdAt }

// getAffiliateCode(req, res)
// - Auth: organizer role
// - Fetch code from User.affiliateReferralCode
// - If not exists: return 404 or redirect to generate
// - Include stats: totalReferrals, qualifiedReferrals, totalEarned, unpaidEarnings
```

**Acceptance:**
- Code generated with format "ORG_XXXXX"
- Code unique across all users
- Idempotent: calling again returns same code
- GET endpoint returns stats
- No code generation if organizer hasn't completed first PAID sale

---

### DEV INSTRUCTION 4: Referral Signup Link Handling

**File:** `packages/frontend/pages/auth/register.tsx` (or signup page)  
**File:** `packages/backend/src/controllers/authController.ts`

**What:** On signup, accept `ref=CODE` query param and store in User.affiliateReferralCode.

**Implementation:**

**Frontend (signup page):**
1. Extract `ref` from query params (e.g., `/auth/register?ref=ORG_K9X2L4`)
2. Display message: "You were referred by [Affiliate Name]. Get paid if you complete your first sale!"
3. Pass `referralCode: ref` to signup POST request

**Backend (auth/register):**
1. Extract `referralCode` from request.body
2. If provided: validate code exists in User where affiliateReferralCode=code
3. On successful user creation: set new User.affiliateReferralCode = referred code
4. Create AffiliateReferral record: status=PENDING, referrerId=[found user], referredUserId=[new user]
5. Send welcome email mentioning referral

**Acceptance:**
- Referred users can sign up with ref code
- AffiliateReferral record created immediately on signup
- Status is PENDING until first PAID sale
- Invalid/expired codes are rejected gracefully

---

### DEV INSTRUCTION 5: Qualification Trigger (Internal Webhook)

**File:** `packages/backend/src/controllers/affiliateController.ts` (new)  
**File:** `packages/backend/src/controllers/stripeController.ts` (extend webhook handler)

**What:** When referred organizer completes first PAID sale, qualify referral and calculate payout.

**Implementation:**

**In stripeController.ts (payment_intent.succeeded handler):**
1. After Purchase is marked PAID:
   ```typescript
   if (purchase.affiliateLinkId) {
     const affiliateLink = await prisma.affiliateLink.findUnique({
       where: { id: purchase.affiliateLinkId },
       include: { user: true }
     });
     
     const referral = await prisma.affiliateReferral.findFirst({
       where: {
         referrerId: affiliateLink.userId,
         referredUserId: purchase.sale.organizerId,
         status: 'PENDING'
       }
     });
     
     if (referral) {
       // This is first PAID sale by referred organizer
       const payoutCents = Math.max(
         Math.round(purchase.amount * 0.02 * 100),
         5000
       );
       
       await prisma.affiliateReferral.update({
         where: { id: referral.id },
         data: {
           status: 'QUALIFIED',
           payoutAmountCents: payoutCents,
           qualifiedAt: new Date(),
           payoutCalculatedAt: new Date()
         }
       });
       
       // Send notification email to referrer
       sendAffiliateQualificationEmail({
         affiliateEmail: affiliateLink.user.email,
         affiliateName: affiliateLink.user.name,
         referredName: referral.referredUser.name,
         payoutAmount: payoutCents / 100
       });
     }
   }
   ```

**Acceptance:**
- AffiliateReferral transitions PENDING → QUALIFIED
- payoutAmountCents calculated correctly (2% or $50 floor)
- Notification email sent
- Only triggers once per referral (status check prevents duplicates)

---

### DEV INSTRUCTION 6: Affiliate Earnings Dashboard Endpoints

**File:** `packages/backend/src/controllers/affiliateController.ts` (new)

**What:** GET /affiliate/referrals and GET /organizer/dashboard/affiliate-earnings

**Implementation:**

```typescript
// GET /affiliate/referrals
// - Auth: organizer role
// - Query: status (filter), limit, offset
// - Return list of AffiliateReferral records where referrerId=req.user.id
// - Include referredUser name/email, qualification date, payout amount

// GET /organizer/dashboard/affiliate-earnings
// - Auth: organizer role
// - Summary stats:
//   - totalEarned: SUM of all PAID referrals' payoutAmountCents
//   - unpaidBalance: SUM of QUALIFIED (not PAID) referrals' payoutAmountCents
//   - thisMonthEarnings: SUM of referrals qualified in current month
//   - recentPayouts: Last 5 PAID referrals with stripe transfer info
```

**Acceptance:**
- Organizer can list all their referrals
- Status filtering works
- Dashboard widget shows accurate earnings summary
- Pagination works

---

### DEV INSTRUCTION 7: Payout Request Endpoint

**File:** `packages/backend/src/controllers/affiliateController.ts` (new)  
**File:** `packages/backend/src/services/stripeConnectService.ts` (new or extended)

**What:** POST /affiliate/payout/request — initiate Stripe Transfer to affiliate.

**Implementation:**

```typescript
// POST /affiliate/payout/request
// - Auth: organizer role
// - Body: { stripeAccountId }
// - Validation:
//   - unpaidBalance >= $50 (5000 cents)
//   - organizer has stripeAccountId on file
//   - organizer created ≥30 days ago (fraud prevention)
// - Create Stripe Transfer:
//   - FROM: platform Stripe account (process.env.STRIPE_ACCOUNT_ID)
//   - TO: organizer stripeAccountId
//   - AMOUNT: unpaidBalance
// - On success:
//   - Update all QUALIFIED referrals: status=PAID, paidAt=now, stripeTransferId=transfer.id
//   - Send confirmation email
// - On failure: return 500 with error detail
```

**Acceptance:**
- Only affiliates with ≥$50 unpaid can request payout
- Stripe Transfer created successfully
- AffiliateReferral records updated to PAID
- Email confirmation sent
- Stripe webhook handlers for transfer.created/transfer.paid

---

### DEV INSTRUCTION 8: Fraud Detection & Self-Referral Blocking

**File:** `packages/backend/src/controllers/affiliateController.ts` (extend instructions 3, 4)  
**File:** `packages/backend/src/middleware/fraudDetection.ts` (new)

**What:** Add fraud checks to affiliate flow.

**Implementation:**

**In POST /affiliate/generate-code:**
- Check: User.createdAt < now() - 7 days (require 7-day account age)
- Check: User hasn't already generated a code (idempotent, but enforce 1 per organizer)
- Return error if threshold not met

**In POST /auth/register (signup):**
- If referral code provided:
  - Validate code owner != new user (self-referral block)
  - Check for IP overlap between referrer and referred (flag suspicious)
  - Check payment method overlap (flag suspicious)
  - If flagged: create AffiliateReferral with status=PENDING_REVIEW, require Patrick approval

**In POST /affiliate/payout/request:**
- Check: Organizer.createdAt < now() - 30 days (require 30-day payout lockout)
- Check: No pending reviews on organizer's referrals
- Return error if thresholds not met

**Acceptance:**
- 7-day minimum account age before code generation
- 30-day minimum before payout request
- Self-referral attempts logged and blocked
- Suspicious patterns flagged for review

---

### DEV INSTRUCTION 9: Email Notifications

**File:** `packages/backend/src/services/emailService.ts` (new templates)

**What:** Transactional emails for affiliate lifecycle.

**Templates:**

1. **Referral Signup Notification** (to referrer)
   - Subject: "You referred a new organizer to FindA.Sale"
   - Body: "Margaret's Estate Sales signed up with your code. When they complete their first sale, you'll earn a commission."

2. **Referral Qualified Notification** (to referrer)
   - Subject: "You earned $X from a referral!"
   - Body: "Margaret's Estate Sales completed their first sale ($5,000). You earned $100 commission. Request payout anytime."
   - CTA: Link to /organizer/dashboard#affiliate-earnings

3. **Payout Initiated Notification** (to affiliate)
   - Subject: "Payout of $X requested"
   - Body: "Your payout request has been submitted to Stripe. You'll receive funds within 1-2 business days."

4. **Payout Completed Notification** (to affiliate)
   - Subject: "You've been paid!"
   - Body: "Payout of $X has been transferred to your Stripe account."

**Acceptance:**
- All emails sent without error
- Emails contain correct amounts
- CTAs point to correct dashboard pages
- Email service integration tested

---

### DEV INSTRUCTION 10: QA & Integration Testing

**File:** `packages/backend/__tests__/affiliate.integration.test.ts` (new)  
**File:** Chrome MCP test session

**What:** End-to-end affiliate flow test.

**Test scenarios:**

1. **Code generation:** Organizer with ≥1 PAID sale generates code
2. **Signup with referral:** New organizer signs up with ref code, AffiliateReferral created (PENDING)
3. **First sale qualification:** Referred organizer completes first PAID sale, AffiliateReferral → QUALIFIED, payout calculated
4. **Payout request:** Affiliate requests payout, Stripe Transfer created, status → PAID
5. **Dashboard verification:** Affiliate views earnings dashboard, all stats match records
6. **Fraud blocking:** Self-referral attempt blocked, new account trying to generate code rejected

**Acceptance criteria:**
- All tests pass
- Dashboard widget shows correct earnings
- Stripe Transfer successfully created and received
- Email notifications sent at each step

---

## 10. Architectural Decision Record (ADR)

**Title:** Affiliate Program Referral Attribution & Payout Model

**Context:**
FindA.Sale has 4 half-built affiliate models (AffiliateLink, AffiliateCode, AffiliatePayout, AffiliateReferral) with no wired checkout flow, no qualification logic, and no payout processing. The platform needs a way to incentivize existing organizers to refer new organizers, creating a viral acquisition loop.

**Decision:**
Implement a **consolidated AffiliateReferral model** with a **2% payout (minimum $50 floor)** triggered on referred organizer's first PAID sale, with Stripe Transfer processing.

**Rationale:**

1. **Consolidation (AffiliatePayout → AffiliateReferral):**
   - Two separate models tracking the same relationship caused confusion and implementation gaps
   - Single source of truth reduces bugs and improves data consistency
   - Fewer database round-trips on qualification/payout

2. **2% + $50 floor model:**
   - 2% is industry-standard for SaaS referral programs (aligns with Zapier, Stripe, Salesforce)
   - $50 floor protects against micro-transactions and reduces Stripe transfer overhead (transfers cost ~$0.25 each)
   - Hybrid approach scales fairly: large sales benefit from percentage, small sales hit the floor

3. **First PAID sale trigger:**
   - Protects against signup-and-abandon abuse (referred user must prove engagement)
   - Prevents PENDING/FAILED/REFUNDED purchases from qualifying (only real revenue counts)
   - Clear, unambiguous qualification rule (no gray area)

4. **Organizer-only affiliates:**
   - Shopper referrals handled by separate Referral Rewards XP system
   - Organizer-to-organizer affiliation is higher-value (GMV driver)
   - Reduces open-enrollment spam and fraud surface

5. **Attribution gap fix (sessionStorage → Purchase):**
   - Current state: affiliate link click tracked, but conversion never recorded
   - Fix: pass affiliateLinkId through checkout → Purchase record
   - Enables attribution for the entire funnel (click → signup → first sale)

**Alternatives considered:**
- **Flat $50 per referral:** Simple but doesn't scale. Large organizers (>$20K/sale) earn same as small ones.
- **Tiered percentages (1%-3%):** Complexity for minimal benefit. 2% is defensible and simple.
- **Auto-monthly payouts:** Adds complexity. Manual-on-demand is cleaner initially; auto can be added later.
- **Per-sale recurring (2% of every sale by referred organizer):** Incentivizes forever but causes tracking issues and unexpected affiliate income. Once-per-relationship is cleaner.

**Consequences:**
- **Positive:** New customer acquisition incentive, clear referral tracking, fraud controls in place
- **Negative:** Slight margin erosion (2% payout reduces net revenue by ~0.2% at scale), Stripe transfer fee overhead
- **Mitigation:** Monitor affiliate abuse, keep payout threshold at $50 to batch transfers

**Status:** LOCKED (Patrick approval required to change payout %, trigger rules, or tier gating)

---

## 11. Glossary

| Term | Definition |
|------|-----------|
| **Affiliate** | Organizer who generates a referral code and earns commission when referred organizer completes first PAID sale |
| **Referred organizer** | New organizer who signs up via affiliate's referral code |
| **Referral code** | Unique code (e.g., "ORG_K9X2L4") generated by affiliate and shared with prospects |
| **PENDING** | AffiliateReferral status after signup; awaiting first PAID sale by referred organizer |
| **QUALIFIED** | AffiliateReferral status after referred organizer completes first PAID sale; payout amount calculated |
| **PAID** | AffiliateReferral status after Stripe Transfer completes successfully |
| **CANCELLED** | AffiliateReferral status if referral is manually cancelled or fraud detected |
| **Payout threshold** | Minimum unpaid balance ($50) required to request affiliate payout |
| **Stripe Transfer** | Direct payment from FindA.Sale platform account to affiliate's Stripe Connect account |
| **Commission rate** | 2% of first PAID sale GMV by referred organizer (minimum $50) |

---

## 12. Implementation Timeline (Estimate)

| Dev Instruction | Complexity | Effort | Estimate | Blocker |
|---|---|---|---|---|
| 1. Schema migration | High | 3-4h | Dev 1 day | None |
| 2. Attribution fix | Medium | 2-3h | Dev 3-4h | Schema (1) |
| 3. Code generation | Low | 1-2h | Dev 2h | Schema (1) |
| 4. Signup referral handling | Medium | 2-3h | Dev 3-4h | Dev Instructions 2, 3 |
| 5. Qualification trigger | High | 4-5h | Dev 5-6h | Dev Instructions 2, 4 |
| 6. Dashboard endpoints | Medium | 2-3h | Dev 3-4h | Schema (1) |
| 7. Payout request | High | 4-5h | Dev 5-6h | Dev Instructions 5, 6 |
| 8. Fraud detection | Medium | 2-3h | Dev 3-4h | Dev Instructions 3, 4, 7 |
| 9. Email templates | Low | 1-2h | Dev 2-3h | Dev Instructions 5 |
| 10. QA & testing | Medium | 3-4h | Dev 4-5h | Dev Instructions 1-9 |
| **Total** | — | **~25-30h** | **4-5 dev-days** | — |

**Parallel deployment batches:**
- **Batch A (Day 1):** 1, 2, 3 (foundation)
- **Batch B (Day 2):** 4, 5, 6 (affiliate flow)
- **Batch C (Day 3):** 7, 8, 9 (payout + fraud)
- **Batch D (Day 4-5):** 10 (QA + go-live)

Each batch is independently testable and can be deployed separately.

---

## Final Checklist (Pre-Dispatch to Dev)

- [ ] Schema migration tested locally
- [ ] Attribution gap fix wired in checkout flow
- [ ] API contracts match OpenAPI spec (if applicable)
- [ ] Stripe Transfer flow documented and tested in Stripe test mode
- [ ] All email templates reviewed by Patrick
- [ ] Fraud detection rules approved by Patrick
- [ ] Payout calculation formula locked in
- [ ] Role/tier gating explicit in code
- [ ] QA test scenarios written and shared with QA subagent
- [ ] CLAUDE.md Subagent-First Implementation Gate acknowledged (dev instructions go to findasale-dev skill)

---

**Document Status:** Architecture Complete — Ready for Dev Dispatch  
**Last Updated:** 2026-04-22  
**Authority:** FindA.Sale Systems Architect
