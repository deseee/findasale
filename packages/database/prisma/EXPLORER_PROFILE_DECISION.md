# Architecture Decision: Explorer's Guild Gamification Data Model

**Date:** 2026-03-30 (S352)
**Architect:** Systems Architect
**Status:** DECIDED
**Roadmap Item:** #84

---

## Decision

**OPTION A: Keep all gamification fields on User model.**

Consolidate all Explorer's Guild profile data (XP, rank, Hunt Pass, seasonal tracking) directly on the User model. Do not create a separate ExplorerProfile model.

---

## Rationale

### Why Option A (not Option B)

**Option B (separate ExplorerProfile model) was evaluated and rejected:**
- Adds unnecessary join complexity for the most-read profile data (dashboard loads, hold checks, leaderboard queries)
- Gamification fields are user-core — not orthogonal data needing separate lifecycle
- One-to-one relation adds 1 migration + 1 model definition + `include { explorerProfile }` on every user fetch (token bloat, query complexity)
- User model already has 160+ lines with relationships; separation doesn't meaningfully improve readability
- Current code (reservationController, dashboard) reads these fields directly from User — refactor burden is high, benefit is low

**Why Option A wins:**
- Fields already exist on User and are actively used (guildXp, explorerRank in reservationController.ts, dashboard.tsx, leaderboard queries)
- No join required — faster reads on high-traffic pages (dashboard, holds, leaderboard)
- Minimal schema change — only additive fields (see below)
- Aligns with how UserStreak and VisitStreak are scoped: they model *type-specific* state; gamification rank is user-wide state
- Monorepo principle: avoid relational fragmentation without clear separation of concerns

**Precedent:** User model already contains domain-specific lifetime fields (reputationTier on Organizer, collectorTitle on User) without separate Profile models. Consistency across the schema.

---

## Exact Schema Changes Required

**Current User model has (all present):**
```prisma
guildXp         Int           @default(0)         // Cumulative XP, never resets
explorerRank    ExplorerRank  @default(INITIATE)  // Derived from guildXp
seasonalResetAt DateTime?                         // Most recent Jan 1 UTC
rarityBoosts    RarityBoost[] @relation("RarityBoosts")  // Per-sale boosts
```

**New fields to add to User model (for Hunt Pass feature parity):**

```prisma
// Phase 2b: Hunt Pass subscription state
huntPassActive    Boolean  @default(false)  // Already exists ✓
huntPassExpiry    DateTime?                 // Already exists ✓

// TOTAL ADDITIONS: 0 new fields — Hunt Pass fields already present in schema
```

**Index additions needed:**
None — guildXp and explorerRank already indexed.

**Status:** NO MIGRATION REQUIRED. All fields are already in the schema.

---

## What This Unblocks

This decision unblocks the following TODOs immediately:

1. **Dashboard rank/XP widget wiring:** `shopper/dashboard.tsx` can wire real rank data from User.guildXp + User.explorerRank
2. **Hold duration logic:** `reservationController.ts` already uses explorerRank correctly for rank-gated hold durations
3. **Leaderboard queries:** Can include explorerRank without joins
4. **Hunt Pass trial banner:** Wires against User.huntPassActive + User.huntPassExpiry (both exist)
5. **Explorer Rank badge displays:** RankBadge component displays User.explorerRank directly
6. **API endpoint `/xp/profile`:** Backend controller can fetch User.guildXp + User.explorerRank + derive rankProgress (currentXp, nextRankXp, nextRank)

---

## Implementation Sequence

### Phase 1: Backend API Endpoint (Block Dev)
**File:** `packages/backend/src/routes/users.ts`

Add GET `/api/xp/profile` endpoint:
- Auth-required
- Fetch current User (id, guildXp, explorerRank)
- Return shape matches `XpProfileData` interface:
  ```typescript
  interface XpProfileData {
    guildXp: number;
    explorerRank: ExplorerRank;
    rankProgress: {
      currentXp: number;
      nextRankXp: number;
      nextRank: ExplorerRank | null; // null if GRANDMASTER
    };
  }
  ```
- Rank thresholds (locked per decisions-log):
  - INITIATE → 500
  - SCOUT → 1500
  - RANGER → 2500
  - SAGE → 5000
  - GRANDMASTER → Infinity (no progression)
- Calculate currentXp as `guildXp % nextThreshold`
- Calculate nextRank based on guildXp crossing thresholds

### Phase 2: Frontend Hook (Already Wired)
**File:** `packages/frontend/hooks/useXpProfile.ts`

Already exists and correctly typed. No changes needed. Wiring is ready to consume the endpoint once it's live.

### Phase 3: Dashboard Wiring (Block Dev)
**Files:**
- `packages/frontend/pages/shopper/dashboard.tsx` — replace TODO placeholders with real `useXpProfile` calls
- `packages/frontend/pages/organizer/dashboard.tsx` (if needed) — similar placeholder replacement

Remove hardcoded test data. Wire RankProgressBar and RankBadge to `xpProfile.explorerRank` and `xpProfile.rankProgress`.

### Phase 4: QA
Verify across all roles (shopper, organizer, dual-role, new, experienced).

---

## Contract Definition

### API Response Shape (from `/api/xp/profile`)
```typescript
200 OK
{
  guildXp: number;
  explorerRank: "INITIATE" | "SCOUT" | "RANGER" | "SAGE" | "GRANDMASTER";
  rankProgress: {
    currentXp: number;        // XP within current rank bucket
    nextRankXp: number;       // XP needed to reach next rank (threshold)
    nextRank: string | null;  // Next rank name, or null if GRANDMASTER
  };
}
```

**Examples:**
- User with 0 XP (INITIATE): `{ guildXp: 0, explorerRank: "INITIATE", rankProgress: { currentXp: 0, nextRankXp: 500, nextRank: "SCOUT" } }`
- User with 750 XP (SCOUT): `{ guildXp: 750, explorerRank: "SCOUT", rankProgress: { currentXp: 750, nextRankXp: 1500, nextRank: "RANGER" } }`
- User with 5000+ XP (GRANDMASTER): `{ guildXp: 5000, explorerRank: "GRANDMASTER", rankProgress: { currentXp: 5000, nextRankXp: Infinity, nextRank: null } }`

---

## Edge Cases & Rules

1. **Rank derivation:** Backend must ALWAYS derive current rank from guildXp on fetch, not trust stored explorerRank. explorerRank is denormalized for fast indexing; guildXp is source of truth.
2. **Seasonal reset:** Jan 1 UTC each year, `seasonalResetAt` updates. guildXp continues accumulating (never resets). (Seasonal reset details TBD in next phase.)
3. **Hunt Pass expiry:** When User.huntPassExpiry < now(), Hunt Pass is inactive. Dashboard must check this.
4. **Zero XP display:** If guildXp = 0, display as "0 / 500 XP" for INITIATE, not negative numbers.

---

## What This Does NOT Do

This decision does not:
- Create a SourcebookEntry or other expert-profile model (separate decision)
- Change Hunt Pass pricing or feature set (locked at $4.99/mo, 2x XP, 6h early access)
- Define seasonal reset mechanics (deferred to Phase 2b)
- Change organizer reputation tier (entirely separate system)
- Define XP earn rates (already locked: +5 visit, +10 scan, +25 purchase, +100 seasonal achievement)

---

## Constraints Added

1. All Explorer's Guild read operations must use User.guildXp + User.explorerRank, never a separate Profile model
2. If gamification needs to grow (new fields: totalPurchases, totalScans, etc.), add them to User model, not a side table
3. Migration-first rule applies: never `db push`. Any schema change → SQL migration file + `prisma migrate deploy` on Railway
4. explorerRank must always be derived server-side; frontend receives computed rankProgress

---

## Migration Plan

**No migration needed.** All fields exist.

If future additions require a migration (e.g., adding `totalLeagueScans`), the migration file name pattern is:
```
20260330_add_explorer_guild_[field]_to_user
```

Example: `20260330_add_explorer_guild_total_scans_to_user`

---

## Rollback (N/A)

No rollback needed — no schema changes in this decision. If field additions are made later, rollback is standard Prisma `migrate down` (not yet documented for Railway setup).

---

## Sign-Off

**Architect decision:** LOCKED. Proceed with Option A implementation.

**Next:** Dispatch findasale-dev to build `/api/xp/profile` endpoint + dashboard wiring.
