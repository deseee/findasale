# Next Session Resume Prompt
*Written: 2026-03-05T04:52:02Z*
*Session ended: normally*

## Resume From

Start Sprint M — Phase 15 (Review + rating system UI). Full spec below.

**No critical blockers** — production is live and stable. Seed succeeded. Phase 22 migration applied.

**One pending check:** The Phase 19 Neon migration (`phase19_points_transaction`) was flagged in session 53 as needed. The session 54 seed succeeded but may not have written PointsTransaction records. If points features throw DB errors, run `prisma migrate deploy` with `phase19_points_transaction` migration (migration file should already exist in `packages/database/prisma/migrations/`).

## What Was In Progress

Nothing — session ended cleanly. All production incidents resolved.

## What Was Completed This Session (54)

- **Railway backend 502 fixed** — root cause: `EXPOSE 5000` in Dockerfile but Railway was injecting `PORT=8080`. Fixed by setting `PORT=5000` explicitly in Railway Variables. Backend now returns 200.
- **CORS fixed** — `finda.sale` was missing from `ALLOWED_ORIGINS`. Fixed.
- **NextAuth 500 fixed** — `NEXTAUTH_SECRET` + `NEXTAUTH_URL` were missing from Vercel env vars. Added.
- **Phase 22 reputationTier migration created** — `reputationTier`/`avgRating`/`totalReviews`/`totalSales` were applied to local DB via `db push` without a migration file, causing seed to fail on Neon. Created `20260305000001_phase22_reputation_tier`, pushed to GitHub, ran `db:deploy` against production.
- **Neon DB seeded** — `pnpm run db:generate && pnpm run prisma:seed` succeeded.
- **Dockerfile.production updated** — added warning comment about PORT/EXPOSE alignment.
- **Self-healing entries 25–27 added** — Railway PORT mismatch, missing Prisma migration, stale Windows Prisma client.
- **STATE.md, session-log.md, context.md** all synced.

## Environment Notes

- **Production: LIVE and stable.** Railway backend healthy on PORT 5000. Vercel frontend deployed. Neon DB seeded with demo data.
- **`PORT=5000` locked in Railway Variables** — must stay aligned with `EXPOSE 5000` in `Dockerfile.production`. Do not remove.
- **Phase 31 OAuth still dormant** — add to Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` + configure redirect URIs → `https://finda.sale/api/auth/callback/{google,facebook}`.
- **Seed command (Windows):** `cd packages\database`, then set `$env:DATABASE_URL` and `$env:DIRECT_URL` from `packages/backend/.env`, then `pnpm run db:generate && pnpm run prisma:seed`. ⚠️ Clears all data.
- GitHub MCP active — push via `mcp__github__push_files`. Repo: `deseee/findasale`, branch: `main`.

## Exact Context

All session 54 fixes were pushed to GitHub. No uncommitted changes expected.

---

## Sprint M — Phase 15: Review + Rating System UI

### What already exists

- `Review` model in `schema.prisma`: `id`, `userId`, `saleId`, `rating` (Int), `comment` (String?), `createdAt`
- `Organizer.avgRating` + `Organizer.reviewCount` fields exist and are exposed in `GET /api/organizers/:id`
- Phase 17 reputation job references `prisma.review.findMany` — confirms the table is live

### What to build

**Backend (new file + edits):**

1. **`packages/backend/src/routes/reviews.ts`** (new)
   - `POST /api/reviews` — auth required, body: `{ saleId, rating (1–5), comment? }` — validates sale exists + ENDED status (can only review past sales) + user attended (purchased at least one item from sale) — creates `Review`, then recalculates `Organizer.avgRating` + `reviewCount`
   - `GET /api/reviews/sale/:saleId` — public, returns reviews for a sale with `user.name`
   - `GET /api/reviews/organizer/:organizerId` — public, paginated reviews for organizer profile

2. **`packages/backend/src/index.ts`** — add `app.use('/api/reviews', reviewRoutes)`

**Frontend (new files + edits):**

1. **`packages/frontend/components/StarRating.tsx`** (new)
   - Interactive star picker (1–5): filled vs empty stars, hover state, `onChange` callback
   - Also usable in display-only mode (`readonly` prop) — used in review cards

2. **`packages/frontend/components/ReviewCard.tsx`** (new)
   - Displays a single review: `user.name`, `StarRating` (readonly), `comment`, `createdAt` formatted

3. **`packages/frontend/components/ReviewForm.tsx`** (new)
   - `StarRating` picker + optional comment textarea + Submit button
   - Calls `POST /api/reviews`, shows success toast on submit
   - Props: `saleId`, `onSubmitted` callback

4. **`packages/frontend/pages/sales/[id].tsx`** (edit)
   - Below items section: add Reviews section
   - Fetch `GET /api/reviews/sale/:saleId`
   - If user is authenticated + sale ENDED + user purchased item from this sale → show `ReviewForm`
   - List of `ReviewCard` components

5. **`packages/frontend/pages/organizers/[id].tsx`** (edit)
   - Add `avgRating` star display + review count near organizer header (already fetched from `/api/organizers/:id`)
   - Add reviews tab or section: `GET /api/reviews/organizer/:organizerId`, list `ReviewCard`

### Points integration

When `POST /api/reviews` succeeds, fire-and-forget `pointsService.awardPoints(userId, 'REVIEW', 5, saleId, undefined, 'Left a review')` — Phase 19 points rule.

---

## Sprint N — Phase 20: Shopper Messaging

### Scope

- `Message` model (if not already in schema): `id`, `fromUserId`, `toUserId`, `saleId?`, `body`, `read` (bool), `createdAt`
- `GET /api/messages` — auth, returns conversation threads grouped by other user
- `POST /api/messages` — auth, body: `{ toUserId, saleId?, body }`
- `GET /api/messages/:threadId/read` — marks as read
- Frontend: `/messages` page — conversation list + message thread view
- Notification: when new message arrives, send push notification to recipient (reuse VAPID push service)

---

## Sprint O — Phase 21: Reservation / Hold UI

### Scope

- `Reservation` model: `id`, `userId`, `itemId`, `expiresAt` (24hr hold), `status` (ACTIVE/EXPIRED/CANCELLED)
- `POST /api/items/:id/reserve` — auth, creates 24hr hold (one per user per item), marks item `RESERVED`
- `DELETE /api/items/:id/reserve` — auth, cancels hold
- Cron: hourly job expires stale reservations, reverts item to `AVAILABLE`
- Frontend: "Hold for 24h" button on item cards (shoppers only), countdown timer if held by current user

---

## K+ Post-Beta Phases (load spec on demand)

| Sprint | Phase | Focus |
|--------|-------|-------|
| P | 23 | Affiliate + referral program |
| Q | 30 | Weekly curator email |
| R | 32 | Creator tools (CSV export, Zapier) |
| S | 16 | Advanced photo pipeline (video-to-inventory) |
