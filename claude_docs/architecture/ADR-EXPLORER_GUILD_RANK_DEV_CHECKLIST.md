# Dev Implementation Checklist — Explorer's Guild Rank System

**Reference:** `ADR-EXPLORER_GUILD_RANK_ARCHITECTURE.md` (primary doc)

---

## PRE-IMPLEMENTATION

- [ ] Read full architecture doc (sections 1–14)
- [ ] Confirm schema.prisma currently has: `guildXp`, `explorerRank`, `seasonalResetAt`, `showcaseSlots`
- [ ] Check if Item model already has: `isLegendary`, `legendaryVisibleAt` (if missing, add in migration)

---

## PHASE 1: SCHEMA + UTILITIES (BLOCKING)

### A. Migrations (2 files)

- [ ] Create `packages/database/prisma/migrations/20260414_add_rankup_history/migration.sql`
  - Add `rankUpHistory jsonb DEFAULT '[]'::jsonb` to User
  - No index needed

- [ ] Create `packages/database/prisma/migrations/20260414_add_legendary_early_access/migration.sql` (if Item fields don't exist)
  - Add `isLegendary boolean DEFAULT false` to Item
  - Add `legendaryVisibleAt timestamp` to Item
  - Add `legendaryPublishedAt timestamp` to Item
  - Create index on (isLegendary, legendaryVisibleAt)

### B. rankUtils.ts

- [ ] Create `packages/backend/src/utils/rankUtils.ts`
  - [ ] Export `calculateRankFromXp(guildXp: number): ExplorerRank`
  - [ ] Export `getRankBenefits(rank: ExplorerRank): RankBenefits` with all 5 ranks
  - [ ] Export `getRankProgressInfo(guildXp: number): RankProgressInfo`
  - [ ] Export constants: `RANK_NAMES`, `RANK_COLORS`
  - [ ] TypeScript compiles: `cd packages/backend && npx tsc --noEmit`

### C. Share to Frontend (Optional)

- [ ] Export from `packages/shared/src/types/` or duplicate constants in frontend

---

## PHASE 2A: BACKEND — NEW ENDPOINTS (Can run in parallel)

### D. New Endpoints (7 total)

**File: `packages/backend/src/controllers/`**

- [ ] Create/update endpoint: `GET /api/user/:id/rank-info`
  - Uses `getRankProgressInfo()` + `getRankBenefits()`
  - Returns: currentRank, guildXp, nextRankXp, xpToNextRank, percentToNextRank, unlockedPerks, rankUpHistory

- [ ] Create endpoint: `GET /api/ranks/perks/:rank`
  - Input: rank name (INITIATE | SCOUT | RANGER | SAGE | GRANDMASTER)
  - Returns: full RankBenefits object for that rank
  - Used by frontend for perks preview

- [ ] Create endpoint: `GET /api/leaderboard/seasonal`
  - Returns: top 100 users by guildXp (Sage+ only, filtered visibility)
  - Include rank badge info

- [ ] Create endpoint: `GET /api/guild/hall-of-fame`
  - Returns: allTimeGrandmasters (all GRANDMASTER users) + seasonalTop100 (Sage+ this season)
  - Code in architecture doc Section 8.3

- [ ] Update endpoint: `POST /api/reservations` (placeHold)
  - Get rank from user query
  - Call `getRankBenefits()` for hold duration
  - Store `holdDurationMinutes` on ItemReservation (new field)
  - Code: Section 3.3 in architecture doc

- [ ] Update endpoint: `POST /api/wishlists/items` (addToWishlist)
  - Check user rank before adding
  - Enforce wishlist slot cap from `getRankBenefits().wishlistSlots`
  - Return error with maxSlots + currentCount if over limit
  - Code: Section 4.2 in architecture doc

- [ ] Update endpoint: `POST /api/items` or item creation route
  - If `isLegendary: true`, calculate `legendaryVisibleAt = now - (earlyAccessHours * 60min)`
  - Use SAGE early access hours (4h) as default
  - Code: Section 6.2 in architecture doc

### E. Query Filters (2 files)

- [ ] Update: `getItemsBySaleId()` or item list endpoints
  - Add visibility filter: only return Legendaries if `legendaryVisibleAt <= now` OR user is Sage+
  - Code: Section 6.3 in architecture doc

- [ ] Update: Hold creation cron (if exists)
  - Verify expiry uses `expiresAt` not `getHoldDurationMinutes()`
  - Remove old duration calculation if present

### F. Backend TypeScript Check

- [ ] `cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules`
  - Must be ZERO errors

---

## PHASE 2B: FRONTEND — NEW COMPONENTS (Can run in parallel)

### G. Dashboard Config System

- [ ] Create `packages/frontend/utils/dashboardConfig.ts`
  - Export `getRankDashboardConfig(rank: ExplorerRank): DashboardConfig`
  - Define card types: onboarding, xpProgress, unlockedPerks, savedItems, etc.
  - Mapping per rank (code in Section 9.2)

### H. New Components (5 files)

**Location: `packages/frontend/components/`**

- [ ] `RankBadge.tsx` — rank icon + name + color
  - Props: rank, size?
  - Uses `RANK_COLORS`, `RANK_NAMES`

- [ ] `RankProgressBar.tsx` — XP bar toward next rank
  - Props: currentXp, nextRankXp, currentRank, nextRank
  - Shows: "123 XP toward Ranger (450 remaining)"

- [ ] `RankBenefitsCard.tsx` — unlocked perks display
  - Props: rank, benefits
  - Lists: holdDuration, wishlistSlots, earlyAccessHours, etc.

- [ ] `RankUpModal.tsx` — full-screen celebration
  - Props: rankUpEvent { previousRank, rank }
  - Auto-closes after 5 seconds
  - Code: Section 7.2 in architecture doc

**Location: `packages/frontend/pages/`**

- [ ] `guild/hall-of-fame.tsx` — Hall of Fame page
  - Fetch `GET /api/guild/hall-of-fame`
  - Display: All-time Grandmasters + seasonal top 100
  - Code: Section 8.3 in architecture doc

### I. AuthContext Update

- [ ] Update `components/AuthContext.tsx`
  - Add `rankUpEvent` state: `{ rank: string, previousRank: string } | null`
  - In `updateUser()`, detect rank change and emit event
  - Render `<RankUpModal rankUpEvent={rankUpEvent} />` conditionally
  - Code: Section 7.1 in architecture doc

### J. Dashboard Page Update

- [ ] Update `pages/shopper/dashboard.tsx`
  - Import `getRankDashboardConfig()`
  - Use config to conditionally render cards
  - Show RankBadge + RankProgressBar in header
  - Code: Section 9.3 in architecture doc

### K. HoldButton Update (Client-Side Skip Logic)

- [ ] Update hold button component (e.g., `components/HoldButton.tsx`)
  - Add state: `skipCountThisSale`
  - Derive `maxSkips` from `getRankBenefits(user.explorerRank).confirmationSkipsPerSale`
  - If Grandmaster or skips available: auto-confirm (no dialog)
  - Otherwise: show confirmation dialog
  - Code: Section 5.2 in architecture doc
  - **Key:** No server-side enforcement needed

### L. Frontend TypeScript Check

- [ ] `cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules`
  - Must be ZERO errors

---

## PHASE 3: INTEGRATION & TESTING

### M. Local Testing

- [ ] Run `npm run dev` (frontend + backend)
- [ ] Test rank-aware hold duration:
  - Place hold as INITIATE → should expire in 30 min
  - Place hold as SAGE → should expire in 75 min
  - Check `itemReservation.holdDurationMinutes` in DB

- [ ] Test wishlist slot cap:
  - Login as INITIATE, add 2 items to wishlist → should fail on 2nd (1 slot max)
  - Earn XP to SCOUT, refresh, should allow 3 total
  - Use Prisma Studio to update `guildXp` manually for testing

- [ ] Test rank-up modal:
  - In DB, manually update `guildXp` from 450 to 500 (triggers SCOUT rank-up)
  - Page refresh or next XP action → RankUpModal should appear
  - Verify modal colors and name match spec

- [ ] Test early access (if Item fields added):
  - Create item as LEGENDARY
  - Verify `legendaryVisibleAt` is set to `now - 4 hours`
  - Query as non-Sage user → item hidden
  - Query as Sage user → item visible (can see 4 hours early)

### N. Deployment Readiness

- [ ] Patrick confirms `$env:DATABASE_URL` override (Railway URL)
- [ ] Run migrations on Railway via Architect SQL
- [ ] Deploy to Vercel + Railway
- [ ] Verify: `/api/user/:id/rank-info` endpoint returns correct data via curl

---

## PHASE 4: QA ACCEPTANCE GATES

### O. Dev Returns with:

- [ ] Complete list of files created (paths + line counts)
- [ ] Complete list of files modified (paths + diff summary)
- [ ] `git status` clean output (no uncommitted changes to core files)
- [ ] TypeScript compile results: `error TS` count (must be 0)
- [ ] Screenshot of one API call:
  ```bash
  curl http://localhost:3000/api/user/{user-id}/rank-info | jq .
  ```
  Response includes: currentRank, guildXp, nextRankXp, unlockedPerks

---

## PHASE 5: POST-DEPLOY QA

**Handed to findasale-qa, one scenario per dispatch:**

1. [ ] **Rank-up modal trigger** — Earn XP, modal appears, closes after 5 sec
2. [ ] **Hold duration by rank** — Place holds as INITIATE/SCOUT/SAGE, verify expiry times
3. [ ] **Wishlist slot cap** — Add items, hit limit per rank, verify error messaging
4. [ ] **Legendary early access** — Sage user sees items 4h early, non-Sage doesn't
5. [ ] **Hall of Fame page** — Loads, displays Grandmasters + seasonal top 100
6. [ ] **Confirmation skip** — Ranger skips 1 hold/sale, Sage skips 2, Grandmaster skips all
7. [ ] **Dashboard rank rendering** — Initiate sees onboarding, Grandmaster sees elite stats

---

## BLOCKERS & DECISION POINTS

- **If Item fields already exist:** Skip migration 20260414, confirm in schema grep
- **If Hall of Fame needs seasonal reset logic:** That's a separate cron job (not in scope)
- **If custom username color exists:** It's independent, no coordination needed
- **If frontend doesn't have dashboard yet:** Build stub with at least RankBadge + RankProgressBar

---

## FILES SUMMARY

**New files (10):**
- `packages/database/prisma/migrations/20260414_add_rankup_history/migration.sql`
- `packages/database/prisma/migrations/20260414_add_legendary_early_access/migration.sql` (conditional)
- `packages/backend/src/utils/rankUtils.ts`
- `packages/frontend/utils/dashboardConfig.ts`
- `packages/frontend/components/RankBadge.tsx`
- `packages/frontend/components/RankProgressBar.tsx`
- `packages/frontend/components/RankBenefitsCard.tsx`
- `packages/frontend/components/RankUpModal.tsx`
- `packages/frontend/pages/guild/hall-of-fame.tsx`

**Modified files (6+):**
- `packages/database/prisma/schema.prisma` (add User.rankUpHistory, Item fields if needed)
- `packages/backend/src/controllers/reservationController.ts` (hold duration logic)
- `packages/backend/src/controllers/wishlistController.ts` (slot validation)
- `packages/backend/src/controllers/itemController.ts` (legendary early access calc)
- `packages/frontend/components/AuthContext.tsx` (rankUpEvent emission)
- `packages/frontend/pages/shopper/dashboard.tsx` (rank-aware rendering)
- (Optional) Hold button component (confirmation skip logic)

**Total: ~1500 lines of code across ~16 files**

---

## TIME ESTIMATE

- Phase 1 (schema + rankUtils): 1–2 hours
- Phase 2A (backend endpoints + validation): 3–4 hours
- Phase 2B (frontend components): 2–3 hours
- Phase 3 (integration): 1 hour
- Phase 4 (QA prep): 30 min
- **Total: 8–11 hours for single dev**

**Parallelizable:** Phase 2A and 2B can run simultaneously (2 devs) → 5–6 hours total.

---

End of checklist. Start with Phase 1 (no dependencies). Proceed to Phase 2 when Phase 1 is TypeScript-clean.
