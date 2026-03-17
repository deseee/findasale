# ADR-013-060: Premium Organizer Tier (TEAMS) + Premium Tier Bundle (PRO) Architecture Spec

**Status:** DESIGN COMPLETE — Ready for Developer Dispatch
**Date:** 2026-03-17
**Sprint Allocation:** 2 sprints each (#13 TEAMS, #60 Bundle)
**Owner:** Systems Architect
**Authority:** Feature Tier Matrix (2026-03-15), STACK.md, Organizer Mode Tiers (ADR-065)

---

## 1. Executive Summary

### Feature #13: Premium Organizer Tier [TEAMS]
TEAMS is already in the schema and Stripe products exist. This sprint **defines what makes TEAMS distinct from PRO, implements feature differentiation, and optionally enables multi-user workspace support** (if scope allows).

**Core Decision:**
- **If NO multi-user support:** TEAMS = PRO with higher limits + different branding + priority support badge
- **If YES multi-user support:** TEAMS unlocks `OrganizerWorkspace` model with 2–5 seat limit, role-based access, shared sales management

Current Status: Schema supports tier enum; feature gates missing; upgrade page exists but needs TEAMS copy/comparison.

### Feature #60: Premium Tier Bundle [PRO]
Bundle marketing positioning for PRO tier combining three major features: Brand Kit (#31, shipped), Flip Report (#41, shipped), and priority support infrastructure.

**Core Decision:** PRO is already feature-complete. #60 is **marketing + pricing strategy + gating verification**, not new feature work.

**Current Status:** Brand Kit (shipped S187), Flip Report (shipped S189). No bundling messaging. No priority support infrastructure.

---

## 2. What's Already Done (No Re-Work)

### Shipped Features
- ✅ **Brand Kit (#31)** — Organizer color customization, logo upload, social links. Shipping in S187. Tier-gated to PRO in schema.
- ✅ **Flip Report (#41)** — Post-sale analytics dashboard (sell-through %, revenue, top performers, category breakdown, pricing insights). Shipped S189. No schema changes. Tier-gated to PRO.

### Infrastructure Already Exists
- ✅ **SubscriptionTier enum** — `SIMPLE | PRO | TEAMS` defined in schema
- ✅ **Organizer.subscriptionTier field** — stores user's current tier
- ✅ **Organizer.subscriptionStatus field** — tracks "active" vs "canceled"
- ✅ **Organizer.tokenVersion** — invalidates stale JWTs on tier upgrade
- ✅ **requireTier() middleware** — gating at route level (packages/backend/src/middleware/requireTier.ts)
- ✅ **syncTier() service** — Stripe webhook → tier sync (packages/backend/src/lib/syncTier.ts)
- ✅ **Upgrade page** — `/organizer/upgrade` displays all 3 tiers (SIMPLE, PRO, TEAMS). TEAMS currently "Contact Sales" CTA.
- ✅ **Stripe products** — STRIPE_PRO_MONTHLY_PRICE_ID, STRIPE_PRO_ANNUAL_PRICE_ID, STRIPE_TEAMS_MONTHLY_PRICE_ID, STRIPE_TEAMS_ANNUAL_PRICE_ID all exist in .env

### What Does NOT Need to Change
- Payment processing (Stripe Connect Express locked)
- Auth flows (JWT token validation locked)
- 10% flat platform fee (separate from tier)

---

## 3. Design: Feature #13 Premium Organizer Tier [TEAMS]

### 3.1 TEAMS Tier Differentiation (PRO vs TEAMS)

**Current State:** upgrade.tsx shows TEAMS as "$79/mo or $790/yr" with list:
```
Everything in PRO
Multi-user team management
API access & webhooks
White-label customization
Priority support badge
```

**Design Decision #1: Multi-User Workspace**

| Aspect | SIMPLE | PRO | TEAMS |
|--------|--------|-----|-------|
| **Single User Only** | ✅ | ✅ | ✗ — Multi-user optional |
| **Seat Limit** | 1 | 1 | 2–5 users (configurable) |
| **Workspace Model** | Direct user→organizer FK | Direct | Indirect (via `OrganizerWorkspace`) |
| **Role-Based Access** | N/A | N/A | OWNER, MANAGER, VIEWER |
| **Shared Sales** | N/A | N/A | All workspace members see same sales |

**If scope allows (estimated 1 sprint):** Add schema:
```prisma
model OrganizerWorkspace {
  id          String @id @default(cuid())
  organizerId String @unique  // Workspace parent (TEAMS organizer account)
  maxSeats    Int    @default(3)

  members     WorkspaceMember[]
  sales       Sale[]  // All sales in workspace

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model WorkspaceMember {
  id          String @id @default(cuid())
  workspaceId String
  workspace   OrganizerWorkspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  userId      String
  user        User @relation(fields: [userId], references: [id], onDelete: Cascade)

  role        String @default("MANAGER")  // OWNER, MANAGER, VIEWER
  invitedAt   DateTime @default(now())
  acceptedAt  DateTime?

  @@unique([workspaceId, userId])
}
```

Migration needed: `20260317_add_organizer_workspace.sql`

**If scope too tight:** Defer multi-user to future sprint. TEAMS = PRO + priority support badge only.

### 3.2 TEAMS-Only Features vs PRO Duplication

**Option A: TEAMS = PRO + More**
All PRO features included in TEAMS. Additional features:

| Feature | PRO | TEAMS | Rationale |
|---------|-----|-------|-----------|
| Batch Operations | ✓ | ✓ | Copy from PRO |
| Sales Analytics | ✓ | ✓ | Copy from PRO |
| Brand Kit | ✓ | ✓ | Copy from PRO |
| Flip Report | ✓ | ✓ | Copy from PRO |
| Data Export (CSV) | ✓ | ✓ | Copy from PRO |
| **API Access** (OAuth2, rate-limited) | ✗ | ✓ | NEW — TEAMS exclusive |
| **Webhooks** (real-time events) | ✗ | ✓ | NEW — TEAMS exclusive |
| **White-Label** (custom domain) | ✗ | ✓ | NEW — TEAMS exclusive |
| **Multi-User Workspace** | ✗ | ✓ (if scope) | NEW — TEAMS exclusive |
| **Priority Support** | ✗ | ✓ (badge) | NEW — visible in UI |

**Decision:** TEAMS is **strict superset of PRO**. Feature gates:
```typescript
// hasAccess('PRO') = hasAccess('TEAMS')
// hasAccess('TEAMS') = true (tier rank 2 highest)
// TEAMS exclusive gates: 'TEAMS' only, no fallback to PRO
```

### 3.3 Schema & Backend Changes Needed

**If multi-user deferred:**
- ✅ No schema changes
- ✅ Organizer.subscriptionTier already supports TEAMS
- ✅ Add requireTier('TEAMS') guards to API endpoints (see §3.4)

**If multi-user included:**
- ⚠️ **2 new models:** OrganizerWorkspace, WorkspaceMember
- ⚠️ **Migration file:** `20260317_add_organizer_workspace.sql`
- ⚠️ **Auth middleware update:** `packages/backend/src/middleware/auth.ts` must resolve user → workspace before checking tier
- ⚠️ **Sale controller:** Sales created by workspace member must set `workspaceId` FK, not direct `organizerId`

### 3.4 Backend Feature Gates for TEAMS Exclusive Features

**Tier-Gated Endpoints (requireTier('TEAMS')):**

| Endpoint | Current | New Gate | Rationale |
|----------|---------|----------|-----------|
| `POST /api/api-keys` | Not implemented | Add `requireTier('TEAMS')` | TEAMS exclusive API access |
| `GET /api/api-keys` | Not implemented | Add `requireTier('TEAMS')` | Retrieve API keys |
| `DELETE /api/api-keys/:id` | Not implemented | Add `requireTier('TEAMS')` | Revoke API key |
| `POST /api/webhooks` | Not implemented | Add `requireTier('TEAMS')` | TEAMS exclusive webhooks |
| `GET /api/webhooks` | Not implemented | Add `requireTier('TEAMS')` | List webhooks |
| `PUT /api/webhooks/:id` | Not implemented | Add `requireTier('TEAMS')` | Update webhook |
| `DELETE /api/webhooks/:id` | Not implemented | Add `requireTier('TEAMS')` | Delete webhook |
| `POST /api/workspace/invite` | Not implemented | Add `requireTier('TEAMS')` | Invite user to workspace (if multi-user) |
| `GET /api/workspace/members` | Not implemented | Add `requireTier('TEAMS')` | List workspace members (if multi-user) |

**Files to Create/Modify:**
- `packages/backend/src/controllers/apiKeyController.ts` — NEW (if scope)
- `packages/backend/src/controllers/webhookController.ts` — NEW (if scope)
- `packages/backend/src/routes/apiKeys.ts` — NEW (if scope)
- `packages/backend/src/routes/webhooks.ts` — NEW (if scope)
- `packages/backend/src/index.ts` — MODIFY (register new routes)
- `packages/backend/src/middleware/requireTier.ts` — Already exists ✅

### 3.5 Frontend Changes for TEAMS

**upgrade.tsx** — Already correct ✓
Current code shows TEAMS tier with correct pricing and "Contact Sales" CTA. No changes needed unless:
1. **Multi-user details** — If workspace included, add to feature list: "Multi-user team management"
2. **Priority support messaging** — Add to TEAMS feature list (marketing copy)

**Organizer dashboard** (if multi-user):
- Add "Team" tab showing workspace members, invite interface
- Add "API Keys" tab for TEAMS users to manage API credentials
- Add "Webhooks" tab for TEAMS users to manage event subscriptions

**organizer/settings.tsx** — Verify tier gating:
- "API Access" section: Only visible for TEAMS users
- "Webhooks" section: Only visible for TEAMS users
- "Team Members" section: Only visible for TEAMS users (if multi-user)

### 3.6 Stripe Integration

**No Changes Needed:**
- ✅ STRIPE_TEAMS_MONTHLY_PRICE_ID and STRIPE_TEAMS_ANNUAL_PRICE_ID already exist
- ✅ syncTier() already maps these price IDs to 'TEAMS' tier
- ✅ Checkout flow already handles both monthly/annual billing

---

## 4. Design: Feature #60 Premium Tier Bundle [PRO]

### 4.1 What Is the Bundle?

**Bundle Name:** "PRO Organizer Bundle" or "Complete Estate Sale Toolkit"

**Bundled Components:**
1. **Brand Kit** — Custom colors, logo, social links. Auto-propagates to social templates, exports.
2. **Flip Report** — Post-sale analytics (sell-through %, revenue drivers, category breakdown, pricing insights, print-friendly PDF).
3. **Priority Support** — Badge on organizer profile + email support SLA (24h response, non-Slack).

**Price Point:**
- $29/month (or $290/year with 20% discount = $24.17/mo equivalent)
- No separate SKU. PRO tier = automatic inclusion.

### 4.2 What PRO Marketing Should Communicate

**Before:** Upgrade page lists generic features (batch operations, analytics, etc.)

**After:** Marketing narrative pivots to use-case bundles:

| Use Case | Bundle Components | Example |
|----------|---|---|
| "Organize like a pro" | Brand Kit + Social Templates | "Upload your logo once. Auto-generate Instagram posts." |
| "Learn what sold" | Flip Report + Performance Dashboard | "See exactly which items drove revenue. Reprice next sale." |
| "Get expert support" | Priority Support + Verified Badge | "24-hour email support. Verified organizer badge." |

**Copy Examples (for upgrade.tsx PRO features section):**
```
✓ Brand Kit — Your logo, colors, custom socials
✓ Flip Report — Post-sale PDF analytics & recommendations
✓ Social Templates — Pre-written Instagram/Facebook copy
✓ Sales Analytics — Performance dashboard + benchmarking
✓ Data Export — CSV/ZIP for accounting & planning
✓ Priority Support — 24h email SLA + verified badge
```

### 4.3 "Priority Support" Infrastructure

**What Exists:**
- Badge display (organizer profile) — not yet implemented
- Email support (Patrick handles manually) — not yet automated

**What Needs Building:**
1. **Organizer model:** Add `supportTier` field (STANDARD | PRIORITY)
   ```prisma
   organizer {
     supportTier String @default("STANDARD")  // or read from tier?
   }
   ```
   OR infer from `subscriptionTier` (PRO+ = PRIORITY support).

2. **Support Request Form** (optional, deferred):
   - Form at `/organizer/support`
   - Stores to database (SupportTicket model)
   - Emails Patrick (via Resend)
   - SLA metric: Response within 24 hours for PRIORITY, 48h for STANDARD

3. **Verified Badge UI Component:**
   - Already implemented in S189 (#16 Verified Organizer Badge)
   - Shows on organizer profile if `verificationStatus === 'VERIFIED'`

**Recommendation:** Defer priority support SLA automation to future sprint. For now:
- Update upgrade.tsx copy to mention "priority support"
- Manually track PRO subscribers; prioritize their emails
- Implement formal ticketing system later (when demand justifies)

### 4.4 Bundle Positioning in UI

**upgrade.tsx PRO Card:**
```
Tier: PRO
Price: $29/month or $290/year
Badge: "Most Popular"

Includes:
✓ Everything in SIMPLE
✓ Brand Kit (custom colors, logo, socials)
✓ Flip Report (post-sale analytics PDF)
✓ Batch Operations (edit 100s of items)
✓ Sales Analytics (performance dashboard)
✓ Data Export (CSV/ZIP for accounting)
✓ Social Templates (Instagram/Facebook copy)
✓ Priority Support (24h email response)

CTA: [Start Free Trial] [Annual -20% Save]
```

**No Logic Changes Needed:** All features already shipped and tier-gated. Bundle is positioning + copy.

### 4.5 Files Needing Updates

| File | Change | Scope |
|------|--------|-------|
| `packages/frontend/pages/organizer/upgrade.tsx` | Update PRO feature list to emphasize Brand Kit + Flip Report + priority support | 5 lines |
| `claude_docs/STACK.md` | Add bundle positioning note (optional) | 10 lines |
| Release notes / Marketing email | Announce PRO bundle positioning | Out of scope (Patrick) |

---

## 5. Schema Changes Summary

### Feature #13 (TEAMS)

**Option A: Defer Multi-User**
- ✅ Zero schema changes
- ✅ Zero migrations
- ✅ Pure feature-gating in backend controllers

**Option B: Include Multi-User (1 sprint effort)**
- ⚠️ **New Models:** OrganizerWorkspace, WorkspaceMember
- ⚠️ **Migration:** `20260317_add_organizer_workspace.sql`
  ```sql
  CREATE TABLE "OrganizerWorkspace" (
    id TEXT PRIMARY KEY,
    organizerId TEXT UNIQUE NOT NULL,
    maxSeats INT DEFAULT 3,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP,
    FOREIGN KEY (organizerId) REFERENCES "Organizer"(id) ON DELETE CASCADE
  );

  CREATE TABLE "WorkspaceMember" (
    id TEXT PRIMARY KEY,
    workspaceId TEXT NOT NULL,
    userId TEXT NOT NULL,
    role TEXT DEFAULT 'MANAGER',
    invitedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acceptedAt TIMESTAMP,
    UNIQUE(workspaceId, userId),
    FOREIGN KEY (workspaceId) REFERENCES "OrganizerWorkspace"(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES "User"(id) ON DELETE CASCADE
  );

  CREATE INDEX idx_workspace_members_workspace_id ON "WorkspaceMember"(workspaceId);
  CREATE INDEX idx_workspace_members_user_id ON "WorkspaceMember"(userId);
  ```

- ⚠️ **Rollback Plan:**
  ```
  Down migration: DROP TABLE "WorkspaceMember"; DROP TABLE "OrganizerWorkspace";
  Playbook: If deploy fails at workspace creation, rollback and revert to single-user TEAMS (no data loss).
  ```

### Feature #60 (Bundle)

- ✅ **Zero schema changes**
- ✅ **Zero migrations**
- Bundle is purely marketing + confirmation that Brand Kit (#31) + Flip Report (#41) are both PRO-gated

---

## 6. Sprint Breakdown

### Sprint 1: Feature #13 TEAMS Core (1.5 weeks)

**Tasks:**
1. **Design decision finalization** (Architect + Patrick call): Multi-user or not?
2. **If multi-user:** Create schema migration, implement OrganizerWorkspace + WorkspaceMember models
3. **Backend tier gates:** Add requireTier('TEAMS') to API endpoints (apiKeys, webhooks, workspace routes)
4. **Frontend:** Update organizer/settings.tsx to show TEAMS-exclusive sections (if applicable)
5. **Upgrade page:** Verify copy is correct, no changes needed (already "Contact Sales")
6. **Testing:** Verify tier gates (TEAMS user can access, PRO user gets 403, SIMPLE user gets 403)
7. **Deployment:** Neon migration + Railway rebuild

**Files to Create:**
- (Conditional) `packages/database/prisma/migrations/20260317_add_organizer_workspace.sql`
- (Conditional) `packages/backend/src/controllers/workspaceController.ts`
- (Conditional) `packages/backend/src/routes/workspace.ts`
- (Conditional) `packages/backend/src/controllers/apiKeyController.ts`
- (Conditional) `packages/backend/src/routes/apiKeys.ts`
- (Conditional) `packages/backend/src/controllers/webhookController.ts`
- (Conditional) `packages/backend/src/routes/webhooks.ts`

**Files to Modify:**
- `packages/backend/src/index.ts` (register new routes)
- `packages/frontend/pages/organizer/settings.tsx` (add TEAMS sections)
- `packages/database/prisma/schema.prisma` (if multi-user)

---

### Sprint 2: Feature #60 Bundle + Integration (1 week)

**Tasks:**
1. **Verify Brand Kit gating:** Confirm Brand Kit is requireTier('PRO')
2. **Verify Flip Report gating:** Confirm Flip Report is requireTier('PRO')
3. **Update upgrade.tsx:** Bundle messaging for PRO features (Brand Kit + Flip Report + priority support)
4. **QA:** Verify all PRO features are accessible to TEAMS (tier hierarchy works)
5. **Marketing copy:** Update all references to "PRO Organizer Bundle"
6. **Deployment:** No migrations needed; just frontend + copy updates

**Files to Modify:**
- `packages/frontend/pages/organizer/upgrade.tsx` (add bundle copy to PRO card)
- `packages/frontend/pages/organizer/settings.tsx` (optional: bundle messaging)
- `claude_docs/STACK.md` (optional: note bundle positioning)

---

## 7. Feature Gate Verification Checklist

### TEAMS-Exclusive Gates
- [ ] API Key CRUD endpoints require requireTier('TEAMS')
- [ ] Webhook CRUD endpoints require requireTier('TEAMS')
- [ ] Workspace invite/members endpoints require requireTier('TEAMS') (if multi-user)
- [ ] Frontend hides these sections for PRO users
- [ ] QA: SIMPLE user tries to POST /api/api-keys → 403 Forbidden

### PRO+ Gates (Both PRO and TEAMS)
- [ ] Brand Kit editor requires requireTier('PRO')
- [ ] Flip Report endpoint requires requireTier('PRO')
- [ ] Social Templates require requireTier('PRO')
- [ ] Batch Operations require requireTier('PRO')
- [ ] Performance Dashboard requires requireTier('PRO')
- [ ] Data Export requires requireTier('PRO')
- [ ] QA: SIMPLE user tries to GET /api/flip-report/[saleId] → 403 Forbidden

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Multi-user scope creep** | Adds 1+ sprint | Decide before dev starts. If unclear, defer to S191. |
| **Workspace migration conflicts** | Deploy failure | Test migration locally first. Have rollback plan ready. |
| **Tier hierarchy bugs** | PRO users lose access | Write exhaustive unit tests for requireTier(). 100% coverage of tier rank logic. |
| **TEAMS price point acceptance** | Low signup rate | A/B test $59 vs $79 vs $99/mo with first 50 organizers. Ready to adjust. |
| **Bundle messaging confusion** | Customer support burden | Ensure "PRO Bundle" language is consistent across all UI, email, docs. |
| **Priority support SLA not enforced** | Customer dissatisfaction | Manual process is OK for S190. Formalize ticket system later. |

---

## 9. Success Metrics

### Feature #13 (TEAMS)
- ✅ At least 2 TEAMS signups in first month
- ✅ Tier gates are 100% effective (no unauthorized access)
- ✅ TEAMS features show up correctly on profile (if multi-user implemented)
- ✅ Organizer reporting: "I can now manage my team / access API" (if multi-user)

### Feature #60 (Bundle)
- ✅ All PRO features are accessible to TEAMS users (tier hierarchy works)
- ✅ Marketing copy is clear: "PRO = Brand Kit + Flip Report + Priority Support"
- ✅ No tier gate confusion: PRO users don't lose access to existing features
- ✅ Upgrade page displays bundle messaging correctly

---

## 10. Locked Decisions (No Revisit)

1. **TEAMS pricing:** $79/mo, $790/yr (20% annual discount) — locked per Stripe product
2. **PRO pricing:** $29/mo, $290/yr (20% annual discount) — locked per Stripe product
3. **SIMPLE:** Free forever — locked per business plan
4. **Multi-user decision:** To be decided with Patrick. Either defer or include, not TBD mid-sprint.

---

## 11. Rollback: Multi-User Workspace Migration

**If deploy vX fails at workspace creation:**
```
Down migration: DROP TABLE "WorkspaceMember"; DROP TABLE "OrganizerWorkspace";
Playbook:
1. Alert: Workspace creation failed during migration
2. Run: prisma migrate resolve --rolled-back 20260317_add_organizer_workspace
3. Revert: git revert [commit with migration]
4. Railway rebuild will use previous schema (no data loss — tables don't exist yet)
5. Fix: Investigate migration syntax, try again next deploy
```

---

## Files Affected Summary

### New Files (if multi-user included)
- `packages/database/prisma/migrations/20260317_add_organizer_workspace.sql`
- `packages/backend/src/controllers/workspaceController.ts`
- `packages/backend/src/routes/workspace.ts`
- `packages/backend/src/controllers/apiKeyController.ts`
- `packages/backend/src/routes/apiKeys.ts`
- `packages/backend/src/controllers/webhookController.ts`
- `packages/backend/src/routes/webhooks.ts`

### Modified Files
- `packages/backend/src/index.ts` (route registration)
- `packages/frontend/pages/organizer/upgrade.tsx` (bundle copy)
- `packages/frontend/pages/organizer/settings.tsx` (TEAMS sections)
- `packages/database/prisma/schema.prisma` (if multi-user)

### No Changes Needed
- `packages/backend/src/middleware/requireTier.ts` — already supports TEAMS ✅
- `packages/backend/src/lib/syncTier.ts` — already syncs TEAMS tier ✅
- `packages/backend/src/middleware/auth.ts` — already validates tokens ✅

---

## Handoff to Developer

**Dispatch:** findasale-dev

**Input Files:**
- This spec (ADR-013-060)
- Feature Tier Matrix (feature-notes/feature-tier-matrix-2026-03-15.md)
- Current schema (packages/database/prisma/schema.prisma)
- Current tier gates (packages/backend/src/middleware/requireTier.ts)

**Questions for Patrick Before Dev Starts:**
1. **Multi-user workspace for TEAMS?** Yes (1 sprint) or defer (0 sprints)?
2. **Priority support SLA automation?** Implement ticket system or manual for now?
3. **API key / webhook stub or full implementation?** Full OAuth2 or basic static keys?

**Estimated Timeline:**
- If multi-user deferred: 1 sprint (Feature #13 gates + Feature #60 copy)
- If multi-user included: 2 sprints (Feature #13 full + Feature #60 bundling)

---

**Spec Status:** ✅ READY FOR DISPATCH

