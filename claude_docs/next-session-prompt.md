# Next Session Resume Prompt
*Written: 2026-03-05T00:00:00Z*
*Session ended: normally*

## Resume From

Start Sprint I — Phase 19 (Hunt Pass + shopper points). Add `PointsTransaction` model to schema, run migration against Neon, then build backend + frontend.

## What Was In Progress

Nothing — session ended cleanly. Sprints A–H all complete and pushed.

## What Was Completed This Session

- **Phase 26** — Listing card redesign: LQIP 3-tier blur-up, aspect-square grid, badge overlays, 2-col mobile / 3-col desktop, SkeletonCards. Commits abe5461, 11d06e1.
- **Phase 28** — Social proof + activity feed: `GET /api/feed` personalized endpoint (Follow table fallback), `favoriteCount` added to listSales, `/feed` page with auth gate + empty states. Commit ac7ebf2.
- **Phase 18** — Photo lightbox: `PhotoLightbox.tsx` (full-screen, keyboard+swipe nav, dot indicators, 1600w), wired into `sales/[id].tsx` + `items/[id].tsx`. Commit 2225c4d.

## Environment Notes

- **Vercel redeploy still pending** — rate-limited since session 47. Frontend may still point at old backend URL. Verify before testing anything in browser.
- **Phase 31 OAuth dormant until env vars added to Vercel:** `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, `FACEBOOK_CLIENT_ID/SECRET` + redirect URIs in Google Console + Meta Dev Portal.
- Railway backend: healthy. GitHub MCP active — push via `mcp__github__push_files`.

---

## Sprint I — Phase 19: Hunt Pass + Shopper Points

### Schema (do first — requires Neon migration)

`User.points` (Int, default 0) already exists. Add to `schema.prisma`:

```prisma
model PointsTransaction {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  type        String   // "VISIT", "FAVORITE", "PURCHASE", "SHARE", "REVIEW"
  points      Int
  saleId      String?
  itemId      String?
  description String?
  createdAt   DateTime @default(now())
}
```

Also add relation to User: `pointsTransactions PointsTransaction[]`

Migration name: `phase19_points_transaction`

### Points Earning Rules

| Action | Points |
|--------|--------|
| Visit sale detail page | 1 pt (once per sale per day) |
| Favorite an item | 2 pts |
| Purchase an item | 10 pts |
| Leave a review | 5 pts |
| Share a sale | 3 pts |

### Backend — new files/edits

1. **`packages/backend/src/services/pointsService.ts`** (new)
   - `awardPoints(userId, type, points, saleId?, itemId?, description?)`
   - Wraps `prisma.pointsTransaction.create` + `prisma.user.update({ points: { increment: points } })`

2. **`packages/backend/src/routes/points.ts`** (new)
   - `GET /api/points` — returns `{ points, tier, transactions[] }` for auth'd user
   - `POST /api/points/track-visit` — body: `{ saleId }` — awards 1pt (idempotent: check for existing VISIT transaction for saleId today)

3. **`packages/backend/src/index.ts`** — add `app.use('/api/points', pointsRoutes)`

4. **`packages/backend/src/controllers/itemController.ts`** — in `purchaseItem` handler: fire-and-forget `pointsService.awardPoints(userId, 'PURCHASE', 10, saleId, itemId)`

5. **`packages/backend/src/controllers/saleController.ts`** — in favorite/unfavorite: award/deduct 2pts on favorite (already has favorite endpoints — wire points there)

### Frontend — new files/edits

1. **`packages/frontend/components/PointsBadge.tsx`** (new)
   - Displays `🏆 {points} pts` — small amber badge used in nav + profile

2. **`packages/frontend/pages/profile.tsx`** (edit)
   - Add points total card + recent transactions list (last 10)
   - Show tier label: 0–99 pts = Scout, 100–499 = Hunter, 500+ = Estate Pro

3. **`packages/frontend/hooks/usePoints.ts`** (new)
   - TanStack Query wrapping `GET /api/points`

4. **`packages/frontend/components/BottomTabNav.tsx`** (edit)
   - Show PointsBadge in Profile tab if user has points > 0

5. **Visit tracking** — in `sales/[id].tsx`, after page load, fire `POST /api/points/track-visit` with `saleId` (fire-and-forget, swallow errors)

---

## Sprint J — Phase 22: Creator Tier Program

### What already exists

- `Organizer.reputationTier` (String) — values: `NEW`, `TRUSTED`, `ESTATE_CURATOR`
- Phase 17 reputation logic: tier upgrades based on reviews/completed sales (basic — may need review)

### What to build

1. **`packages/backend/src/jobs/reputationJob.ts`** (new)
   - Weekly cron (node-cron `0 2 * * 1`) — recalculates all organizer tiers
   - Criteria: `NEW` = default; `TRUSTED` = 5+ completed sales + avg rating ≥ 4.0; `ESTATE_CURATOR` = 20+ completed sales + avg rating ≥ 4.5 + 50+ followers
   - Updates `Organizer.reputationTier` in batch

2. **`packages/frontend/components/TierBadge.tsx`** (new)
   - Maps tier → label + color: NEW = gray "New Organizer", TRUSTED = blue "Trusted Seller", ESTATE_CURATOR = amber "Estate Curator ✦"
   - Used in: SaleCard organizer line, organizer profile page

3. **Organizer dashboard** — add tier status card: current tier, progress to next tier (e.g. "3 more sales to reach Trusted"), benefits list per tier

4. **Tier benefits** (no new schema needed — frontend-only display for now):
   - NEW: basic listing
   - TRUSTED: "Verified" badge, priority in search results (sort tweak)
   - ESTATE_CURATOR: featured placement, newsletter inclusion, custom profile page

---

## Sprint K — Phase 27: Onboarding + Empty States + Microinteractions

### Scope

1. **First-time shopper flow** — after registration, 3-step onboarding modal: (1) Welcome + browse CTA, (2) How favorites work, (3) Enable push notifications prompt
2. **First-time organizer flow** — after first sale publish: confetti animation (canvas-confetti), "Your sale is live!" modal with share link
3. **Empty states for every major screen:**
   - `/feed` — already has 3 empty states (done in Phase 28)
   - `/sales` browse — "No sales in your area yet. Be the first!" with organizer CTA
   - Favorites page — "Nothing saved yet. Start browsing!" with browse CTA
   - Organizer dashboard — "Create your first sale" with big + button
   - Items list (sale with no items) — "Add your first item" with camera icon
4. **Microinteractions:**
   - Heart/favorite button: scale pulse animation on click (Tailwind `active:scale-90 transition-transform`)
   - +N points toast: small amber toast bottom-right when points are awarded
   - Skeleton → content fade-in: `animate-pulse` → `animate-fade-in` (already have skeleton components)

### Key packages to add
- `canvas-confetti` for organizer publish celebration

---

## Sprint L — Phase 29: Discovery + Neighborhood Pages

### Scope

1. **Neighborhood landing pages** — `/neighborhoods/[slug]` — static paths from known GR neighborhoods (Eastown, Wealthy Street, East Hills, Heritage Hill, etc.)
   - Each page: upcoming sales in that area, map centered on neighborhood bounding box, SEO meta

2. **Category browse pages** — `/categories/[category]` — items grouped by category
   - Categories: Furniture, Clothing, Electronics, Books, Antiques, Tools, Kitchen, Art, Jewelry, Other
   - Grid of items with sale info, links to item detail

3. **Search improvements** — full-text search across sale title/description + item title/description
   - Backend: Prisma `contains` search on `Sale` + `Item`, combined results
   - Frontend: `/search?q=` page with tabs (Sales / Items)

4. **SEO static pages** — generate sitemap.xml from published sales + items (Next.js `getStaticPaths`)

---

## K+ Post-Beta Phases (load spec on demand)

| Sprint | Phase | Focus |
|--------|-------|-------|
| M | 15 | Review + rating system UI |
| N | 20 | Shopper messaging |
| O | 21 | Reservation / hold UI |
| P | 23 | Affiliate + referral program |
| Q | 30 | Weekly curator email |
| R | 32 | Creator tools (CSV export, Zapier) |
| S | 16 | Advanced photo pipeline (video-to-inventory) |
