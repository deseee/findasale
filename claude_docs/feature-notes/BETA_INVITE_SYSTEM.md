# Beta Invite Code System

## Overview
Patrick can now generate and manage beta invite codes to control who gets organizer access during the beta period. When a user registers with a valid invite code, their account is automatically created with role=ORGANIZER and an Organizer profile is created.

## What Was Built

### 1. Database Schema
**File:** `/packages/database/prisma/schema.prisma`

Added `BetaInvite` model:
```prisma
model BetaInvite {
  id        String    @id @default(cuid())
  code      String    @unique          // 8-char uppercase alphanumeric
  email     String?                    // Optional: restrict invite to specific email
  createdAt DateTime  @default(now())
  usedAt    DateTime?                  // When the code was redeemed
  usedById  String?   @unique          // One-to-one: user can only use one invite
  usedBy    User?     @relation(fields: [usedById], references: [id], onDelete: SetNull)
}
```

Added relation to User model:
```prisma
betaInviteUsed BetaInvite?  // One-to-one: user can only use one invite
```

**Migration:** `/packages/database/prisma/migrations/20260306000021_add_beta_invite/migration.sql`

### 2. Backend Controllers
**File:** `/packages/backend/src/controllers/betaInviteController.ts`

#### Public Endpoints (no auth required)
- `POST /api/invites/validate` — Validate invite code before registration
  - Input: `{ code: string, email?: string }`
  - Returns: `{ valid: true, code: string }`
  - Error cases: Invalid code, used code, email mismatch

- `POST /api/invites/redeem` — Mark code as used (called from registration)
  - Input: `{ code: string, userId: string }`
  - Returns: `{ success: true, invite: BetaInvite }`

#### Admin Endpoints (auth + admin role required)
- `POST /api/admin/invites` — Create new invite code
  - Input: `{ email?: string }` (optional email restriction)
  - Returns: BetaInvite object with generated code

- `GET /api/admin/invites` — List all invites with usage status
  - Returns: Array of invites with `status: "used" | "unused"` and user info

- `DELETE /api/admin/invites/:inviteId` — Delete unused invite
  - Returns: `{ success: true, message: string }`

**Code Generation:** 8-character uppercase alphanumeric
```typescript
Math.random().toString(36).slice(2, 10).toUpperCase()
```

### 3. Backend Routes
**File:** `/packages/backend/src/routes/invites.ts` (new)
```typescript
router.post('/validate', validateCode);
router.post('/redeem', redeemInvite);
```

**Updated:** `/packages/backend/src/routes/admin.ts`
```typescript
router.post('/invites', createInvite);
router.get('/invites', listInvites);
router.delete('/invites/:inviteId', deleteInvite);
```

**Registered in:** `/packages/backend/src/index.ts`
```typescript
app.use('/api/invites', invitesRoutes);
```

### 4. Auth Registration Flow Update
**File:** `/packages/backend/src/controllers/authController.ts`

Modified `register()` to:
1. Accept optional `inviteCode` in request body
2. Validate invite code if provided
3. Check email restriction if applied
4. Automatically set `role = 'ORGANIZER'` if valid invite
5. Redeem invite atomically with user creation

Flow:
```
POST /auth/register
├─ inviteCode provided?
│  ├─ Fetch invite from DB
│  ├─ Check if unused
│  ├─ Check email match (if restricted)
│  └─ Set role = 'ORGANIZER'
└─ Create user + Organizer + redeem invite in transaction
```

### 5. Frontend Admin Page
**File:** `/packages/frontend/pages/admin/invites.tsx` (new)

#### Features:
- **Generate New Invite:** Form to create invite code with optional email restriction
- **List All Invites:** Table showing:
  - Code (copyable)
  - Restricted email (if any)
  - Status: used/unused (color-coded badge)
  - Who redeemed it (name, email, when they registered)
  - Created date
  - Actions: Copy code, Delete (unused only)
- **Info Box:** Instructions on how to share codes

#### Copy-to-Clipboard:
- Click "Copy" to copy just the code
- Share via URL: `https://finda.sale/register?invite=XXXX`

### 6. Frontend Registration Page Update
**File:** `/packages/frontend/pages/register.tsx`

#### Added:
- `inviteCode` field to form state
- URL parameter detection: `?invite=CODE` pre-fills the code
- Real-time validation: validates code as user types
- Error display for invalid/used codes
- Email mismatch detection
- Pass `inviteCode` to registration API

#### Form Field:
```html
<input
  id="inviteCode"
  placeholder="Beta Invite Code (optional)"
  onChange={handleInviteCodeChange}
/>
```

When valid, the user is automatically set to ORGANIZER role during registration.

### 7. Admin Dashboard Navigation
**File:** `/packages/frontend/pages/admin/index.tsx`

Added link card to invites page:
```
Beta Invites — Generate and manage organizer beta invite codes
```

## Usage Examples

### Generate Invite (Admin)
```bash
curl -X POST http://localhost:3001/api/admin/invites \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"organizer@example.com"}'

# Response:
{
  "id": "cuid123",
  "code": "ABC12XYZ",
  "email": "organizer@example.com",
  "createdAt": "2026-03-06T...",
  "usedAt": null,
  "usedById": null
}
```

### Share Invite URL
```
https://finda.sale/register?invite=ABC12XYZ
```

User visits URL → code pre-filled → registers → automatically becomes ORGANIZER

### Validate Code
```bash
curl -X POST http://localhost:3001/api/invites/validate \
  -H "Content-Type: application/json" \
  -d '{"code":"ABC12XYZ","email":"organizer@example.com"}'

# Response: { "valid": true, "code": "ABC12XYZ" }
```

### List Invites (Admin)
```bash
curl http://localhost:3001/api/admin/invites \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Returns array with status and usage info
```

## Key Constraints
- Invite codes are 8-char uppercase alphanumeric
- One-to-one: each user can only redeem one invite
- Codes are unique and single-use
- Email restriction is optional (if set, must match registration email)
- Expired/used invites cannot be deleted from admin panel
- Code validation happens in real-time on registration form

## Security Notes
- Validate endpoint is public (no auth) to support registration flow
- Admin endpoints require `authenticate` + `requireAdmin` middleware
- Invite codes are case-insensitive (`toUpperCase()` on all lookups)
- Email matching is case-insensitive
- Redemption is atomic with user creation (no orphaned records)

## Files Changed/Created

### New Files:
1. `/packages/database/prisma/migrations/20260306000021_add_beta_invite/migration.sql`
2. `/packages/backend/src/controllers/betaInviteController.ts`
3. `/packages/backend/src/routes/invites.ts`
4. `/packages/frontend/pages/admin/invites.tsx`

### Modified Files:
1. `/packages/database/prisma/schema.prisma` — Added BetaInvite model and User relation
2. `/packages/backend/src/controllers/authController.ts` — Added invite code handling to register()
3. `/packages/backend/src/routes/admin.ts` — Added invite management routes
4. `/packages/backend/src/index.ts` — Registered invites routes
5. `/packages/frontend/pages/register.tsx` — Added invite code field and validation
6. `/packages/frontend/pages/admin/index.tsx` — Added link to invites page

## Next Steps
1. Run migration: `cd packages/database && npx prisma migrate deploy`
2. Restart backend
3. Visit `/admin/invites` to start generating codes
4. Share codes or invite URLs with beta organizers
