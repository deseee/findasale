# Technical Brief — FindA.Sale Codebase

**Purpose:** Single source of truth for subagents and new developers joining mid-project. Reads in 5 minutes.

**Scope:** Entire monorepo. This brief is **not** the full documentation — it's the 20% of facts that solve 80% of questions.

**Last Updated:** Session 236 (2026-03-22)

---

## Stack Summary

| Layer | Tech | Details |
|-------|------|---------|
| **Frontend** | Next.js 14, TypeScript, Tailwind, react-query | Deployed on Vercel; SPA via pages router; PWA with service worker |
| **Backend** | Express, TypeScript, Prisma ORM | Deployed on Railway; RESTful API (`/api/*`); WebSocket for real-time sales |
| **Database** | PostgreSQL on Neon (cloud) | Docker-local dev via compose. Pool connection for runtime, direct `DATABASE_URL_UNPOOLED` for migrations |
| **Monorepo** | pnpm workspaces | `packages/frontend`, `backend`, `database`, `shared` — strict layer contracts |
| **Auth** | JWT + Passkey (WebAuthn) | Roles: `USER` \| `ORGANIZER` \| `ADMIN`; Tiers: `FREE` \| `SIMPLE` \| `PRO` \| `TEAMS`; Users may hold multiple roles (S235: dual-role schema) |
| **CI/CD** | GitHub → Vercel / Railway | Auto-deploy on push to `main`; no manual redeploy buttons |

---

## Key File Locations

### Database & Schema
- **Schema source:** `packages/database/prisma/schema.prisma` (1936 lines; 80+ models)
- **Migrations:** `packages/database/prisma/migrations/` (numbered folders: `migration_lock.toml` + `migration.sql`)
- **Client generation:** `packages/database/src/index.ts` (re-exports Prisma client)
- **To modify:** Always `prisma migrate dev` locally, then **manual `prisma migrate deploy` + `prisma generate` against Neon** before shipping

### Backend (Express API)
- **Main entry:** `packages/backend/src/index.ts` (app setup, middleware stack, rate limiters, WebSocket server)
- **Auth middleware:** `packages/backend/src/middleware/auth.ts` (JWT validation → req.user)
- **Organizer gate:** `packages/backend/src/middleware/auth.ts` → `requireOrganizer` (now allows `ADMIN` role as of S233)
- **Rate limiters:** 4 limiters in `index.ts`:
  - `globalLimiter` (15 req/min per IP, Redis-backed)
  - `authLimiter` (5 auth attempts/min per IP, Redis-backed)
  - `fileUploadLimiter` (10 uploads/min per user, Redis-backed)
  - `webhookLimiter` (100 requests/min per organizer, in-memory)
- **Timeout guard:** `packages/backend/src/middleware/requestTimeout.ts` (30s timeout, 503 on exceed)
- **Controllers:** `packages/backend/src/controllers/` (96 files, one per feature or domain)
  - Naming: `[domain]Controller.ts` (e.g., `saleController.ts`, `billingController.ts`)
  - Return shape: all controllers return `{ success: boolean, data?: T, message?: string }`
- **Routes:** `packages/backend/src/routes/` (38 route files, one per domain, import controllers)
  - Naming: `[domain].ts` (e.g., `sales.ts`, `billing.ts`)
  - All routes import from controllers; no business logic in routes
- **Services:** `packages/backend/src/services/` (business logic, API calls, notifications)
  - Key services: `stripeService`, `sendgridService`, `cloudAIService`, `notificationService`, `firebaseService`
- **Utils:** `packages/backend/src/utils/` (helpers: `validators.ts`, `errors.ts`, `redis.ts`)

### Frontend (Next.js)
- **Pages:** `packages/frontend/pages/` (page router; `[param].tsx` for dynamic routes)
  - Key pages:
    - `index.tsx` → home (splash, then role-based redirect)
    - `organizer/` → organizer flow (add-items, sales, command-center, billing)
    - `shopper/` → shopper flow (explore, map, messages)
    - `admin/` → admin dashboard
    - `messages/[id].tsx` → conversation thread (real-time via WebSocket)
    - `login.tsx`, `register.tsx`, `passkey-*` pages for auth
- **API routes:** `packages/frontend/pages/api/` (proxy routes to backend; thin layer for CORS/auth header forwarding)
- **Hooks:** `packages/frontend/hooks/` (51 custom hooks for data fetching, state, real-time)
  - Pattern: Most hooks use `useQuery` from react-query → return `{ data, isLoading, isError, error }` object
  - Some hooks use `useState` → return direct state values, NOT an object (e.g., `useSaleStatus` returns `[status, isLoading, error]`)
  - **CRITICAL:** Always read the hook file before destructuring — no assumptions
- **API client:** `packages/frontend/lib/api.ts` (axios instance; auto-includes JWT from `localStorage.token`)
- **Auth context:** `packages/frontend/context/AuthContext.tsx` (JWT payload shape; roles array; subscriptionTier)
- **Components:** `packages/frontend/src/components/` (UI building blocks)
- **Styles:** Tailwind CSS via `globals.css`; dark mode via `next-themes`

### Shared Types
- **Location:** `packages/shared/src/types/` (4 files)
  - `reputation.ts` → `OrganizerReputationDTO` (score, isNew, saleCount)
  - `commandCenter.ts` → `SaleMetrics`, `CommandCenterSummary`, `CommandCenterResponse`
  - `ripples.ts` → ripple types for real-time engagement
  - `encyclopedia.ts` → encyclopedia entry types
- **Rules:** Shared types are re-exports of cross-boundary DTOs only. Never use shared for internal utilities.
- **⚠️ CRITICAL BUG:** `import { anything } from '@findasale/shared'` in frontend **causes Vercel build failure**. Frontend may only import types from backend API responses or context.

---

## Cross-Layer Contracts (CLAUDE.md § 3)

### Database Layer
- **Owns:** Schema (prisma/schema.prisma), migrations (prisma/migrations/), Prisma client generation
- **Authority:** Schema is SOURCE OF TRUTH for all model field names
- **Contract:** Backend reads schema to emit TypeScript types; frontend trusts backend API responses
- **Gotcha:** Always verify a field exists in schema BEFORE referencing it in code

### Backend Layer
- **Owns:** Business logic, validation, API response shapes, middleware stack
- **Authority:** Controllers define response DTOs (inline, no separate types file)
- **Contract:** All API responses follow `{ success: boolean, data?: T, message?: string }`
- **Error contract:** All errors return `{ message: string, code?: string }` (status-based HTTP code)

### Frontend Layer
- **Owns:** UI rendering, client-side state, form handling, theming
- **Authority:** Pages + components own their own state; hooks fetch data
- **Contract:** Components destructure API responses assuming backend contracts
- **Gotcha:** Do NOT query backend directly from components — always use hooks

### Shared Layer
- **Owns:** Enums and DTOs used by 2+ packages
- **Current contents:**
  - `reputation.ts` → Reputation DTO (used by backend and frontend)
  - `commandCenter.ts` → Dashboard types (used by frontend pages and backend controllers)
  - `ripples.ts` → Real-time engagement types
  - `encyclopedia.ts` → Encyclopedia entry types
- **Rule:** Do NOT put utilities, validators, or constants here unless shared across 3+ packages

---

## Schema Quick-Reference

### Core Models (Most-Referenced)

| Model | Key Fields | Relations | Notes |
|-------|-----------|-----------|-------|
| **User** | id, email, password?, name, role (deprecated), **roles** (array), subscriptionTier, tokenVersion, oauthId | organizer, roleSubscriptions, purchases, favorites, bids, reviews, conversations | Dual-role schema (S235): `roles: ["USER"]` or `["USER", "ORGANIZER"]` or `["USER", "ADMIN"]` |
| **Organizer** | id, userId, businessName, location, phoneNumber, websiteUrl, tier, subscription* | user, sales, badges, reputation, workspace | Linked 1:1 to User; tier is stored here, NOT in User |
| **Sale** | id, organizerId, title, description, status, startDate, endDate, location | organizer, items, subscribers, ripples, checklist | Status: DRAFT \| PUBLISHED \| ACTIVE \| ENDED; organizer ownership gated by middleware |
| **Item** | id, saleId, name, description, category, estimatedValue, draftStatus, photoCount | sale, photos, purchases, reservations, favorites, bids | draftStatus: DRAFT \| PENDING_REVIEW \| PUBLISHED; `PUBLIC_ITEM_FILTER` hardcoded to `{}` (disabled) until Rapidfire #80 launch |
| **Photo** | id, itemId, url, order | item | Picsum URLs during dev; real URLs post-launch |
| **Purchase** | id, itemId, buyerId, sellerId, status, totalPrice, stripePaymentIntentId | item, buyer, seller | `stripePaymentIntentId` is @unique; use `randomUUID()` for cash sales |
| **Favorite** | id, userId, itemId | user, item | 1:1 per user/item; toggle pattern (create if absent, delete if exists) |
| **Bid** | id, itemId, bidderId, status | item, bidder | Auction flow for high-value items |
| **Conversation** | id, buyerId, organizerId, status, updatedAt | buyer, organizer, messages | 1:1 per buyer-organizer; updatedAt triggers real-time WebSocket |
| **Message** | id, conversationId, senderId, body, createdAt | conversation, sender | Unread status calculated from max(message.createdAt) vs user's last read |
| **Follow** | id, followerId, organizerId | follower, organizer | 1:1; followId used in real-time notifications |
| **UserRoleSubscription** | id, userId, role, tier, status, currentPeriodEnd | user | Feature #72: Enables dual-role billing (separate subscriptions per role) |
| **Notification** | id, userId, type, title, body, read, createdAt | user | Two-channel system (S235 #73): organizer channel vs shopper channel; both routed to single table, differentiated by `type` |
| **OrganizerReputation** | id, organizerId, score, isNew, saleCount, photoQualityAvg | organizer | Feature #71: denormalized; recalculated nightly via cron job |
| **RoleConsent** | id, userId, role, consentType, acceptedAt | user | Feature #74: separate consent per role (TERMS, PAYMENT_METHOD, BUSINESS_VERIFICATION) |

### Tier & Pricing
- **Tiers:** FREE (limit: 1 active sale, 50 items), SIMPLE ($39/mo, 3 sales, 200 items), PRO ($99/mo, 10 sales, unlimited items), TEAMS ($199/mo, unlimited, team members, analytics)
- **Stored in:** `Organizer.tier` (enum), `UserRoleSubscription.tier` (when feature #72 fully deployed)
- **Subscription state:** `UserRoleSubscription.status` (ACTIVE, TRIALING, PAST_DUE, CANCELED) and `currentPeriodEnd` (ISO date)

### Draft Status & Visibility
- **Item.draftStatus:** DRAFT (organizer only), PENDING_REVIEW (organizer + moderator), PUBLISHED (public)
- **Endpoint contract:**
  - `GET /items?saleId=X` → returns PUBLISHED items only (hardcoded `PUBLIC_ITEM_FILTER`)
  - `GET /items/drafts?saleId=X` → returns DRAFT + PENDING_REVIEW items (requires organizer auth)
  - ⚠️ **Gotcha:** Draft page (`review.tsx`) must call `/items/drafts`, NOT `/items?draftStatus=DRAFT` (param is ignored)

---

## Hook Return Shape Reference

**CRITICAL:** Hooks have inconsistent return shapes. Always read the hook file before destructuring.

### React-Query Hooks (return `{ data, isLoading, isError, error }` object)
- `useSubscription()` → `{ data: SubscriptionData, isLoading, isError }`
- `useUsageStats()` → `{ data: UsageStats, isLoading, isError }`
- `useSaleStatus()` (socket-based, not react-query) → `{ status: SaleStatus | null, isLoading, error }`
- `useConversations()` → `{ data: Conversation[], isLoading }`
- `useFavorite(itemId)` → `{ isFavorited: boolean, isLoading }`
- `useRipples()` → `{ data: SaleRipple[], isLoading }`
- `useReputation(organizerId)` → `{ data: OrganizerReputationDTO, isLoading }`

### useState Hooks (return direct state values, NOT objects)
- `useSaleStatus(saleId)` → `[status, isLoading, error]` (array destructuring)
- `useTheme()` → `[theme, setTheme]`
- `useOfflineMode()` → `{ isOffline, queue }`

### Custom Hooks (mixed patterns)
- `useCommandCenter()` → `{ summary, sales, filters, setFilters, isLoading }`
- `useOrganizerTier()` → `{ tier, isLoading, error }`
- `usePasskey()` → `{ isPasskeyAvailable, register, authenticate }`

**Rule:** If unsure, read the hook's `return` statement — don't assume.

---

## Known Gotchas (CRITICAL)

### 1. uuid@13 ESM Crash
- **Symptom:** `SyntaxError: Cannot use import statement outside a module` in backend logs when UUID generated
- **Cause:** uuid v13+ dropped CommonJS support; backend is CommonJS
- **Fix:** Use `uuid@^9.x.x` (not 13+). Enforced in package.json; verified in S233
- **Confidence:** HIGH — seen across multiple sessions; version lock prevents recurrence

### 2. CORS Hardcoded Origins
- **Rule:** Only `finda.sale` and `www.finda.sale` are in allowed list (not wildcard)
- **Location:** `packages/backend/src/index.ts` → `cors({ origin: [...] })`
- **Gotcha:** Localhost and staging are NOT allowed for security reasons; must test production domain or mock CORS
- **Confidence:** HIGH — S233 confirmed this prevents local dev CORS errors with prod database

### 3. Draft Items — Disabled PUBLIC_ITEM_FILTER
- **Symptom:** Draft page (`review.tsx`) shows all published items, not new drafts
- **Root cause:** `getItemsBySaleId()` hardcodes `PUBLIC_ITEM_FILTER = {}` (query param ignored)
- **Workaround:** Call `/items/drafts?saleId=X` instead (verifies organizer ownership)
- **When to re-enable:** Rapidfire Mode launch (Feature #80) — when draft UI is fully public
- **Confidence:** HIGH — architectural decision logged in SH-008

### 4. Prisma Migrations (NEVER use db push in production)
- **Rule:** `prisma db push` is local-only. Production MUST use:
  ```bash
  cd packages/database
  $env:DATABASE_URL="[Neon direct URL]"
  npx prisma migrate deploy   # applies SQL to Neon
  npx prisma generate         # regenerates TS client
  ```
- **Why:** `db push` skips the migration history table (`_prisma_migrations`). Skipping it leaves Neon out of sync with Railway code
- **Gotcha:** `packages/database/.env` points to localhost — always override with Neon connection string
- **Confidence:** HIGH — enforced in CLAUDE.md §6

### 5. Database Connection — Pooled vs Direct
- **Runtime:** Use pooled connection (via `DATABASE_URL` env var, `ep-*-pooler` in hostname)
- **Migrations:** Use direct connection (via `DATABASE_URL_UNPOOLED` env var, NO `-pooler` suffix)
- **Prisma schema:** `datasource db { url = env("DATABASE_URL"); directUrl = env("DATABASE_URL_UNPOOLED") }`
- **Why:** Prisma migrations need direct connections; runtime can use pooled for cost
- **Confidence:** MEDIUM — S234 confirmed this works; edge case on pooler/direct distinction

### 6. requireOrganizer Middleware Now Allows ADMIN Role
- **Change:** S233 fixed role gating to allow ADMIN users to act as organizers
- **Location:** `packages/backend/src/middleware/auth.ts` → `requireOrganizer` middleware
- **Pattern:** Middleware checks `req.user.roles.includes('ORGANIZER') || req.user.role === 'ADMIN'`
- **Gotcha:** Do NOT add additional role checks inline in controller; middleware stack is the gate
- **Confidence:** HIGH — verified live in S233

### 7. Hook Shape Assumption Bug
- **Symptom:** `Cannot read property 'isLoading' of undefined` or similar in component render
- **Cause:** Component assumes hook returns `{ isLoading, data }` but hook returns `[data, loading]` or vice versa
- **Pattern:** Always check hook's `export` function and `return` statement before destructuring
- **Examples:**
  - `const { data, isLoading } = useSubscription()` ✅ correct (react-query)
  - `const { data, isLoading } = useSaleStatus()` ❌ wrong (returns array)
  - `const [status, isLoading] = useSaleStatus()` ✅ correct
- **Confidence:** HIGH — recurring bug pattern in S232–S235

### 8. Shared Imports Cause Vercel Build Failure
- **Symptom:** Build fails with "Module not found: Can't resolve '@findasale/shared'…" during Vercel deploy
- **Cause:** frontend imports from shared via pnpm workspace alias; Vercel doesn't resolve workspace symlinks in strict mode
- **Fix:** Frontend must only import types from:
  - Backend API response interfaces (inferred from usage)
  - Context providers (AuthContext, ThemeContext, etc.)
  - Local type definitions in the frontend package
- **Gotcha:** Do NOT import utilities or components from shared in frontend
- **Confidence:** HIGH — seen in S234, prevented via linter rules

### 9. Stripe Payment Intent — Use randomUUID for Cash Sales
- **Symptom:** `Prisma P2002: Unique constraint failed on stripePaymentIntentId`
- **Cause:** Cash sales don't have real Stripe PI; placeholder ID using `Date.now()` causes collisions
- **Fix:** Use `const cashPiId = \`cash_\${randomUUID()}\`` for each transaction
- **Location:** `packages/backend/src/controllers/terminalController.ts` (or any cash payment handler)
- **Confidence:** HIGH — logged in SH-010

### 10. findUnique Fails on Non-Unique Fields
- **Symptom:** Prisma error "Argument must be \`@id\` or \`@unique\`"
- **Cause:** Using `findUnique()` on a field without @unique (e.g., `stripeCustomerId`, email-like fields)
- **Fix:** Use `findFirst()` instead for non-unique lookups
- **Pattern:**
  - `findUnique({ where: { id: X } })` ✅ OK (id is @id)
  - `findUnique({ where: { stripeCustomerId: X } })` ❌ WRONG if stripeCustomerId is not @unique
  - `findFirst({ where: { stripeCustomerId: X } })` ✅ correct
- **Confidence:** MEDIUM — Prisma pattern, not FindA.Sale-specific but commonly mistaken

---

## Auth Contract

### JWT Payload (in localStorage as `token`)
```typescript
{
  id: string (user ID)
  email: string
  name: string
  role: string (deprecated — use roles array)
  roles: string[] (["USER"], ["USER", "ORGANIZER"], ["USER", "ORGANIZER", "ADMIN"])
  subscriptionTier: "FREE" | "SIMPLE" | "PRO" | "TEAMS"
  iat: number (issued at)
  exp: number (expires at)
}
```

### Middleware Stack (Order enforced)
1. `authMiddleware` → validates JWT, attaches `req.user`
2. `requireOrganizer` (optional) → gates to `req.user.roles.includes('ORGANIZER')` OR `req.user.role === 'ADMIN'`
3. `requireAdmin` (optional) → gates to `req.user.role === 'ADMIN'`
4. `rateLimiters` (per-domain, applied selectively)
5. `requestTimeout` → 30s timeout, 503 on exceed
6. Handler function

### Passkey Auth (WebAuthn)
- **Credentials stored:** `PasskeyCredential` model (discoverable credentials, counter, transports)
- **Challenge flow:** Generated in memory (S234 fixed: now uses Redis with `getDel` for atomic safety)
- **Flow types:** `auth` (login) vs `registration` (signup) — stored to prevent flow replay attacks
- **Race condition fix:** S234 moved challenge storage to Redis; atomic operations prevent concurrent request collisions

---

## API Response Error Shape

All controllers return HTTP error with body:
```json
{
  "message": "Human-readable error message",
  "code": "OPTIONAL_ERROR_CODE"
}
```

**Status codes:**
- `400` → Validation error (Zod)
- `401` → Unauthorized (missing/invalid JWT)
- `403` → Forbidden (role/permission gate)
- `404` → Resource not found
- `429` → Rate limit exceeded
- `500` → Server error (log to Sentry)
- `503` → Service degraded (external API down) or timeout

---

## Real-Time Contracts (WebSocket)

**Server:** Socket.io on backend; singleton per session

**Rooms by domain:**
- `sale:{saleId}` → sale status updates, item sales, bid notifications
- `user:{userId}` → personal notifications (messages, badges, tier updates)

**Events:** Domain-specific (e.g., `ITEM_SOLD`, `MESSAGE_RECEIVED`, `SALE_STATUS_UPDATE`)

**Client:** `socket.io-client` in frontend; hooks subscribe to rooms on mount

---

## Deployment & Environment

### Frontend (Vercel)
- **Env vars:** `NEXT_PUBLIC_*` only (exposed to client)
  - `NEXT_PUBLIC_API_URL` → defaults to `/api` (backend proxy)
  - `NEXT_PUBLIC_SOCKET_URL` → defaults to `http://localhost:3001`
- **Build command:** `pnpm build` (type-check + Next.js build)
- **Auto-deploy:** On push to `main`; no manual trigger

### Backend (Railway)
- **Env vars:** All secrets safe (not prefixed with `NEXT_PUBLIC_`)
  - `DATABASE_URL` → Neon pooled connection
  - `DATABASE_URL_UNPOOLED` → Neon direct (for migrations only)
  - `STRIPE_SECRET_KEY`, `SENDGRID_API_KEY`, `FIREBASE_*` → credentials
  - `AI_COST_CEILING_USD` → max spend per month on Claude API
  - `MAILERLITE_SHOPPERS_GROUP_ID` → for email list segmentation
- **Build command:** `pnpm build`
- **Start command:** `node dist/index.js`
- **Auto-deploy:** On push to `main`; database migrations must be manually triggered before code deploy

### Database (Neon)
- **Connection:** `postgresql://[user]:[password]@[host]:[port]/[db]?sslmode=require`
- **Pooler endpoint:** For runtime (RxJS, connection pooling)
- **Direct endpoint:** For migrations (Prisma requires direct connection)

---

## Key Files to Read Before Any Task

1. **Schema:** `packages/database/prisma/schema.prisma` (verify fields exist)
2. **Controller signature:** The specific controller file being modified (response shape)
3. **Hook shape:** The hook being used (return type)
4. **Middleware stack:** `packages/backend/src/index.ts` (order matters)
5. **Frontend route:** The page being modified (role gates, data dependencies)

---

## Quick Troubleshooting

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Build fails: "Cannot use import statement outside a module" | uuid@13+ | Downgrade to uuid@^9.x.x |
| Stripe checkout returns 404 | Missing `/api/billing/checkout` proxy route | Create route that calls backend |
| Draft items show as published | Using `/items?saleId=X` instead of `/items/drafts` | Change endpoint to `/items/drafts?saleId=X` |
| Messages page blank | CSS collapse (`min-h-screen` flex bug) | Use `h-full` instead of `min-h-screen` |
| Rate limit 429 on auth | IPv6 key generation error in express-rate-limit v8 | Add `keyGenerator: (req) => req.ip` to limiters |
| Migrations don't apply to Neon | Using `db push` or pooled connection | Use `migrate deploy` with direct connection string |
| Hook throws "isLoading is undefined" | Wrong return shape assumption | Read hook file and check actual return |
| CORS 403 | Domain not in allowed list | Must be `finda.sale` or `www.finda.sale` |

---

## Quick Reference: File Paths

```bash
# Schema & Database
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/
packages/database/src/index.ts

# Backend
packages/backend/src/index.ts                    # app setup, middleware
packages/backend/src/middleware/auth.ts          # JWT validation, role gates
packages/backend/src/controllers/[domain]Controller.ts
packages/backend/src/routes/[domain].ts
packages/backend/src/services/                   # business logic
packages/backend/src/utils/                      # helpers

# Frontend
packages/frontend/pages/
packages/frontend/pages/api/                     # proxy routes
packages/frontend/hooks/use*.ts
packages/frontend/lib/api.ts
packages/frontend/context/AuthContext.tsx
packages/frontend/src/components/
packages/frontend/globals.css

# Shared
packages/shared/src/types/                       # reputation.ts, commandCenter.ts, ripples.ts, encyclopedia.ts

# Docs
claude_docs/STATE.md                             # active state
claude_docs/architecture/                        # ADRs, design decisions
claude_docs/self-healing/                        # recurring bug fixes
```

---

**Status:** AUTHORITATIVE — Maintained by Architect; approved for subagent reference
