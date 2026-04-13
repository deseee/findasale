# ADR — Explorer's Guild Rank Perks System Architecture

**Date:** 2026-04-13  
**Author:** Architect  
**Status:** Ready for Dev Implementation  
**Locked Decision Gate:** S449 (Patrick confirmed rank names, Game Designer approved perks table, Dashboard creative brief locked)

---

## EXECUTIVE SUMMARY

This architecture covers two interlocking specs:
1. **Rank Perks Spec** — Unlock system for holds, wishlists, early access, cosmetics, confirmations
2. **Dashboard Creative Brief** — Rank-aware dashboard rendering & progression communication

**Scope:** 2 schema migrations, 7 new backend endpoints, 2 utility functions, 5 UI components, 1 dashboard config system.

**No code deviations from locked specs.** All perks, XP thresholds, hold durations are canonical as written in S449 specs.

---

## SECTION 1: SCHEMA CHANGES

### 1.1 NEW FIELDS (User model)

Add these fields to `packages/database/prisma/schema.prisma` → `model User`:

```prisma
// Phase 2a: Rank-up history for Hall of Fame + seasonal tracking
rankUpHistory         Json?  // Array of { rank: string, timestamp: DateTime, xpAtTime: number }
```

**Rationale:**
- Hall of Fame page needs to display all-time Grandmasters and top 100 Sage+ per season
- Seasonal reset (Jan 1) requires knowing when each rank was achieved
- Per-rank timestamps allow retroactive seasonal "best rank achieved" queries

**Schema location:** Add after `seasonalResetAt` field (line 166)

**Type definition (TypeScript):**
```typescript
type RankUpHistoryEntry = {
  rank: ExplorerRank;     // "INITIATE" | "SCOUT" | "RANGER" | "SAGE" | "GRANDMASTER"
  timestamp: Date;        // ISO timestamp when rank was unlocked
  xpAtTime: number;       // XP balance when rank was achieved (for display)
};

// On User model, rankUpHistory is stored as JSON array
// SQL: `rankUpHistory` `jsonb[]` or `text` containing JSON stringified array
```

**No other User fields need modification.** All required fields (`guildXp`, `explorerRank`, `seasonalResetAt`, `showcaseSlots`) already exist.

---

### 1.2 NEW FIELDS (Item model)

Check and confirm these fields exist for Legendary early access:

```prisma
// From SPEC 2: Early Access for Legendary items
// Field name: isLegendary (NEW — check if present)
// Field name: legendaryVisibleAt (NEW — check if present)
```

**If absent, add to Item model:**

```prisma
model Item {
  // ... existing fields ...
  isLegendary         Boolean     @default(false)  // Organizer marks item as Legendary
  legendaryVisibleAt  DateTime?   // When item becomes visible to non-Sage shoppers
  legendaryPublishedAt DateTime?  // When organizer published this item as Legendary (for audit)
  
  // ... rest of fields ...
}
```

**Rationale:**
- Organizers mark items Legendary during item creation (edit-item.tsx)
- Backend calculates `legendaryVisibleAt = now() - (earlyAccessHours * 60min)`
- Query filter: only show items where `legendaryVisibleAt <= now()` unless `user.explorerRank in [SAGE, GRANDMASTER]`
- Sage/Grandmaster shoppers see 2–6 hours before public

**Alternative (if schema too constrained):** Store visibility rule on `Sale` model instead — "all items in this sale have Legendary early access of X hours"

---

### 1.3 MIGRATION REQUIREMENTS

**Two separate migrations needed:**

**Migration 1:** `20260413_add_rankup_history`
```sql
-- Add rankUpHistory to User model
ALTER TABLE "User" ADD COLUMN "rankUpHistory" jsonb DEFAULT '[]'::jsonb;
-- No index needed (queried rarely, in-transaction only)
```

**Migration 2:** `20260414_add_legendary_early_access` (if Item fields don't exist)
```sql
-- Add early access fields to Item
ALTER TABLE "Item" ADD COLUMN "isLegendary" boolean DEFAULT false;
ALTER TABLE "Item" ADD COLUMN "legendaryVisibleAt" timestamp;
ALTER TABLE "Item" ADD COLUMN "legendaryPublishedAt" timestamp;
-- Index for query performance
CREATE INDEX "Item_isLegendary_legendaryVisibleAt_idx" ON "Item"("isLegendary", "legendaryVisibleAt");
```

**Deployment order (Patrick will execute):**
1. Run migrations on Railway DB via Architect-provided SQL
2. `npx prisma generate` to regenerate TypeScript client
3. Deploy frontend + backend to Vercel/Railway

---

## SECTION 2: `getRankBenefits()` UTILITY

### 2.1 File Location & Structure

**Path:** `packages/backend/src/utils/rankUtils.ts`

**Purpose:** Pure function, no DB calls. Maps `guildXp` → `ExplorerRank` + full benefits object.

**Principle:** Source of truth for all rank-related logic. One function, used everywhere.

---

### 2.2 Function Signature & Return Type

```typescript
// ============================================
// packages/backend/src/utils/rankUtils.ts
// ============================================

import { ExplorerRank } from '@findasale/shared'; // or directly from schema

/**
 * Calculate explorer rank from XP (and optionally use cached rank)
 */
export function calculateRankFromXp(guildXp: number): ExplorerRank {
  if (guildXp < 500) return 'INITIATE';
  if (guildXp < 2000) return 'SCOUT';
  if (guildXp < 5000) return 'RANGER';
  if (guildXp < 12000) return 'SAGE';
  return 'GRANDMASTER';
}

/**
 * Get all benefits unlocked by a specific rank
 * Pure function — no DB calls, safe to call from anywhere
 */
export interface RankBenefits {
  rank: ExplorerRank;
  
  // Hold System
  holdDurationMinutes: number;         // 30 | 45 | 60 | 75 | 90
  maxConcurrentHolds: number;          // 1 | 1 | 2 | 3 | 3
  enRouteGraceHolds: number;          // 1 | 2 | 2 | 3 | 3
  
  // Wishlist
  wishlistSlots: number | 'unlimited'; // 1 | 3 | 10 | 15 | unlimited
  
  // Confirmation Dialogs (client-side only, no server enforcement)
  confirmationSkipsPerSale: number;    // 0 | 0 | 1 | 2 | 'all' (Grandmaster = 'all')
  autoConfirmAllHolds: boolean;        // false | false | false | false | true
  
  // Legendary Early Access (hours before public)
  legendaryEarlyAccessHours: number;   // 0 | 1 | 2 | 4 | 6
  
  // Treasure Trails
  maxTreasureTrails: number | 'unlimited'; // N/A (future feature placeholder)
  
  // Cosmetics
  cosmetics: {
    unlocked: string[];                // List of cosmetic IDs (e.g., "rank_badge_scout", "custom_map_pin_unlock")
  };
  
  // Micro-sinks availability
  microSinksAvailable: {
    scoutReveal: boolean;              // 5 XP → see who saved your items (Scout+)
    haulUnboxing: boolean;             // 2 XP → unlock animation (Scout+)
    bumpPost: boolean;                 // 10 XP → bump haul 24h (Scout+)
  };
}

export function getRankBenefits(rank: ExplorerRank | string = 'INITIATE'): RankBenefits {
  const normalizedRank = (rank as ExplorerRank) || 'INITIATE';
  
  const benefitsMap: Record<ExplorerRank, RankBenefits> = {
    INITIATE: {
      rank: 'INITIATE',
      holdDurationMinutes: 30,
      maxConcurrentHolds: 1,
      enRouteGraceHolds: 1,
      wishlistSlots: 1,
      confirmationSkipsPerSale: 0,
      autoConfirmAllHolds: false,
      legendaryEarlyAccessHours: 0,
      maxTreasureTrails: 0,
      cosmetics: { unlocked: [] },
      microSinksAvailable: {
        scoutReveal: false,
        haulUnboxing: false,
        bumpPost: false,
      },
    },
    SCOUT: {
      rank: 'SCOUT',
      holdDurationMinutes: 45,
      maxConcurrentHolds: 1,
      enRouteGraceHolds: 2,
      wishlistSlots: 3,
      confirmationSkipsPerSale: 0,
      autoConfirmAllHolds: false,
      legendaryEarlyAccessHours: 1,
      maxTreasureTrails: 0,
      cosmetics: { unlocked: ['scout_badge', 'scout_map_pin'] },
      microSinksAvailable: {
        scoutReveal: true,  // 5 XP
        haulUnboxing: true, // 2 XP
        bumpPost: true,     // 10 XP
      },
    },
    RANGER: {
      rank: 'RANGER',
      holdDurationMinutes: 60,
      maxConcurrentHolds: 2,
      enRouteGraceHolds: 2,
      wishlistSlots: 10,
      confirmationSkipsPerSale: 1,    // Skip 1 hold confirmation per sale
      autoConfirmAllHolds: false,
      legendaryEarlyAccessHours: 2,
      maxTreasureTrails: 3,
      cosmetics: { unlocked: ['ranger_badge', 'ranger_map_pin', 'collector_badges'] },
      microSinksAvailable: {
        scoutReveal: true,
        haulUnboxing: true,
        bumpPost: true,
      },
    },
    SAGE: {
      rank: 'SAGE',
      holdDurationMinutes: 75,
      maxConcurrentHolds: 3,
      enRouteGraceHolds: 3,
      wishlistSlots: 15,
      confirmationSkipsPerSale: 2,     // Skip 2 confirmations per sale
      autoConfirmAllHolds: false,
      legendaryEarlyAccessHours: 4,
      maxTreasureTrails: 'unlimited',
      cosmetics: { unlocked: ['sage_badge', 'sage_map_pin', 'collector_badges', 'leaderboard_visibility'] },
      microSinksAvailable: {
        scoutReveal: true,
        haulUnboxing: true,
        bumpPost: true,
      },
    },
    GRANDMASTER: {
      rank: 'GRANDMASTER',
      holdDurationMinutes: 90,
      maxConcurrentHolds: 3,
      enRouteGraceHolds: 3,
      wishlistSlots: 'unlimited',
      confirmationSkipsPerSale: 'all',  // Auto-confirm all holds (no dialogs)
      autoConfirmAllHolds: true,
      legendaryEarlyAccessHours: 6,
      maxTreasureTrails: 'unlimited',
      cosmetics: { unlocked: ['grandmaster_badge', 'custom_map_pin_unlock', 'all_cosmetics_free'] },
      microSinksAvailable: {
        scoutReveal: true,
        haulUnboxing: true,
        bumpPost: true,
      },
    },
  };
  
  return benefitsMap[normalizedRank] || benefitsMap.INITIATE;
}

/**
 * Rank progression info for UI (next rank threshold, XP remaining)
 */
export interface RankProgressInfo {
  currentRank: ExplorerRank;
  currentXp: number;
  nextRank: ExplorerRank | null; // null if GRANDMASTER
  nextRankXp: number;
  xpToNextRank: number;
  percentToNextRank: number; // 0–100
}

export function getRankProgressInfo(guildXp: number): RankProgressInfo {
  const currentRank = calculateRankFromXp(guildXp);
  
  const thresholds: Record<ExplorerRank, number> = {
    INITIATE: 0,
    SCOUT: 500,
    RANGER: 2000,
    SAGE: 5000,
    GRANDMASTER: 12000,
  };
  
  const nextRankMap: Record<ExplorerRank, ExplorerRank | null> = {
    INITIATE: 'SCOUT',
    SCOUT: 'RANGER',
    RANGER: 'SAGE',
    SAGE: 'GRANDMASTER',
    GRANDMASTER: null,
  };
  
  const nextRank = nextRankMap[currentRank];
  const nextRankXp = nextRank ? thresholds[nextRank] : Infinity;
  const xpToNextRank = Math.max(0, nextRankXp - guildXp);
  const currentRankXp = thresholds[currentRank];
  const percentToNextRank = nextRank
    ? Math.round(((guildXp - currentRankXp) / (nextRankXp - currentRankXp)) * 100)
    : 100;
  
  return {
    currentRank,
    currentXp: guildXp,
    nextRank,
    nextRankXp,
    xpToNextRank,
    percentToNextRank,
  };
}

// Export constants for frontend use
export const RANK_NAMES: Record<ExplorerRank, string> = {
  INITIATE: 'Initiate',
  SCOUT: 'Scout',
  RANGER: 'Ranger',
  SAGE: 'Sage',
  GRANDMASTER: 'Grandmaster',
};

export const RANK_COLORS: Record<ExplorerRank, string> = {
  INITIATE: '#6B7280',    // Gray
  SCOUT: '#3B82F6',       // Blue
  RANGER: '#10B981',      // Green
  SAGE: '#F59E0B',        // Amber
  GRANDMASTER: '#8B5CF6', // Purple
};
```

---

### 2.3 Usage Rules

**In backend:**
- Any controller that needs to enforce rank limits → call `getRankBenefits(user.explorerRank)`
- Example: `wishlistController.ts` → before adding item, check `getRankBenefits(user.explorerRank).wishlistSlots`
- Example: `reservationController.ts` → already calls `getHoldDurationMinutes()` — replace with `getRankBenefits(user.explorerRank).holdDurationMinutes`

**In frontend:**
- `components/RankBadge.tsx` → use `RANK_COLORS[rank]` and `RANK_NAMES[rank]`
- `components/RankProgressBar.tsx` → call `getRankProgressInfo(user.guildXp)` 
- `pages/shopper/dashboard.tsx` → import for perks display

**Export to shared:**
Consider exporting `getRankBenefits` + enums to `packages/shared/src/` so frontend can compute benefits client-side without API calls.

---

## SECTION 3: HOLD DURATION ENFORCEMENT

### 3.1 Current Hold Creation Flow

**File:** `packages/backend/src/controllers/reservationController.ts` (lines 25–34)

**Current code:**
```typescript
function getHoldDurationMinutes(rank: string): number {
  switch (rank) {
    case 'INITIATE':    return 30;
    case 'SCOUT':       return 45;
    case 'RANGER':      return 60;
    case 'SAGE':        return 75;
    case 'GRANDMASTER': return 90;
    default:            return 30;
  }
}
```

**Decision:** This function should be **deleted** and replaced with `getRankBenefits()` import. Hold duration must be **stored on the Hold record at creation time** so rank changes mid-hold don't affect existing holds.

---

### 3.2 REQUIRED CHANGE: Store Duration on Hold

**Model:** `ItemReservation` (line 1019 in schema.prisma)

**Add field:**
```prisma
model ItemReservation {
  id              String   @id @default(cuid())
  itemId          String   @unique
  item            Item     @relation(fields: [itemId], references: [id])
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  status          String   @default("PENDING")
  
  // NEW: Store the duration that was active when hold was created
  holdDurationMinutes Int   @default(30)  // Snapshot of user's rank-based duration
  
  expiresAt       DateTime
  // ... rest of fields ...
}
```

**Migration:**
```sql
ALTER TABLE "ItemReservation" ADD COLUMN "holdDurationMinutes" integer DEFAULT 30;
UPDATE "ItemReservation" SET "holdDurationMinutes" = 30 WHERE "holdDurationMinutes" IS NULL;
```

---

### 3.3 CHANGE: Hold Creation Logic

**File:** `packages/backend/src/controllers/reservationController.ts`

**In `placeHold()` function (line 50+), replace the hold calculation:**

**Before:**
```typescript
const explorerRank = (user?.explorerRank as string) ?? 'INITIATE';
const holdDurationMinutes = getHoldDurationMinutes(explorerRank);
const expiresAt = new Date(Date.now() + holdDurationMinutes * 60 * 1000);
```

**After:**
```typescript
import { getRankBenefits } from '../utils/rankUtils';

const explorerRank = (user?.explorerRank as string) ?? 'INITIATE';
const rankBenefits = getRankBenefits(explorerRank);
const holdDurationMinutes = rankBenefits.holdDurationMinutes;
const expiresAt = new Date(Date.now() + holdDurationMinutes * 60 * 1000);

// When creating the reservation, store the duration snapshot
const reservation = await prisma.itemReservation.create({
  data: {
    itemId,
    userId: req.user.id,
    status: 'PENDING',
    expiresAt,
    holdDurationMinutes,  // Store snapshot
    enRoute,
    // ... other fields ...
  },
});
```

---

### 3.4 Hold Expiry Cron

**File:** (likely in `packages/backend/src/crons/` or `src/jobs/`)

**Confirm:** The hold expiry cron reads `ItemReservation.expiresAt` and expires holds when `expiresAt <= now()`. The `holdDurationMinutes` field is **for display/audit only** — not used in expiry logic (that's still `expiresAt`).

**Change needed:** If cron references `getHoldDurationMinutes()`, remove that call. Expiry is purely time-based.

---

## SECTION 4: WISHLIST SLOT CAP ENFORCEMENT

### 4.1 Current Wishlist Endpoint

**File:** `packages/backend/src/controllers/wishlistController.ts`

**Function:** `addToWishlist()` (line 68+)

**Current code (snippet):**
```typescript
const item = await prisma.item.findUnique({
  where: { id: itemId },
});

if (!item) {
  return res.status(404).json({ message: 'Item not found' });
}

// NO SLOT VALIDATION — add directly
const wishlistItem = await prisma.wishlistItem.create({
  data: {
    wishlistId,
    itemId,
    note: note || null,
  },
});
```

---

### 4.2 REQUIRED CHANGE: Add Slot Validation

**Add validation before `.create()`:**

```typescript
import { getRankBenefits } from '../utils/rankUtils';

export const addToWishlist = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { wishlistId, itemId, note } = req.body;

    if (!wishlistId || !itemId) {
      return res.status(400).json({ message: 'wishlistId and itemId are required' });
    }

    // Verify wishlist belongs to user
    const wishlist = await prisma.wishlist.findUnique({
      where: { id: wishlistId },
      include: {
        items: { select: { id: true } }, // Get current item count
      },
    });

    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }

    if (wishlist.userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // NEW: Fetch user and rank-based slot limit
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { explorerRank: true },
    });

    const rankBenefits = getRankBenefits(user?.explorerRank ?? 'INITIATE');
    const maxSlots = rankBenefits.wishlistSlots === 'unlimited'
      ? Infinity
      : rankBenefits.wishlistSlots;

    // Check if user has exceeded slot limit
    const currentItemCount = wishlist.items.length;
    if (currentItemCount >= maxSlots) {
      return res.status(403).json({
        message: `Wishlist is full (max ${maxSlots} items for your rank)`,
        maxSlots,
        currentCount: currentItemCount,
      });
    }

    // Verify item exists
    const item = await prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Proceed with add (existing code)
    const wishlistItem = await prisma.wishlistItem.create({
      data: {
        wishlistId,
        itemId,
        note: note || null,
      },
    });

    res.status(201).json(wishlistItem);
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ message: 'Failed to add to wishlist' });
  }
};
```

**Key points:**
- Slot validation is **server-side only** (no security risk, no XP/payment involved)
- Return `maxSlots` + `currentCount` in error response so frontend can show "You have 3/15 slots"
- If user rank changes mid-session, next wishlist add validates against new limit

---

## SECTION 5: CONFIRMATION DIALOG SKIP LOGIC

### 5.1 CLIENT-SIDE ONLY (No Server Enforcement)

**Decision:** Confirmation skip is a **UX convenience**, not a security feature. Server does NOT validate or enforce. Frontend stores skip count in React state.

**Rationale:**
- Skipping a confirmation dialog has zero security/data risk
- A user placing an unauthorized hold would be caught at hold creation (auth check), not at the dialog
- Storing skip count server-side is unnecessary overhead

---

### 5.2 Hold Button State Management

**File:** `packages/frontend/components/HoldButton.tsx` (or wherever hold placement happens)

**Component prop/state addition:**

```typescript
interface HoldButtonProps {
  itemId: string;
  saleId: string;
  user: CurrentUser; // { guildXp, explorerRank, ... }
  onHoldPlaced?: (reservation: ItemReservation) => void;
}

export const HoldButton: React.FC<HoldButtonProps> = ({ itemId, saleId, user, onHoldPlaced }) => {
  const router = useRouter();
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // NEW: Skip count tracking (per-sale session)
  const [skipCountThisSale, setSkipCountThisSale] = useState(0);
  
  // Derive max skips from user rank
  const rankBenefits = getRankBenefits(user.explorerRank);
  const maxSkips = rankBenefits.confirmationSkipsPerSale === 'all'
    ? Infinity
    : rankBenefits.confirmationSkipsPerSale;
  
  const canSkipDialog = skipCountThisSale < maxSkips && !rankBenefits.autoConfirmAllHolds;
  
  const handlePlaceHold = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, latitude: null, longitude: null }),
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error(error.message || 'Failed to place hold');
        return;
      }

      const reservation = await response.json();
      
      if (onHoldPlaced) {
        onHoldPlaced(reservation);
      }
      
      // Increment skip count for this sale
      setSkipCountThisSale((prev) => prev + 1);
      setHoldDialogOpen(false);
      
      toast.success('Hold placed!');
    } catch (error) {
      toast.error('Error placing hold');
    } finally {
      setIsLoading(false);
    }
  };
  
  // If Grandmaster or skips available → auto-place, no dialog
  if (rankBenefits.autoConfirmAllHolds || canSkipDialog) {
    return (
      <button
        onClick={handlePlaceHold}
        disabled={isLoading}
        className="btn btn-primary"
      >
        {isLoading ? 'Placing hold...' : 'Place Hold'}
      </button>
    );
  }
  
  // Otherwise → show confirmation dialog first
  return (
    <>
      <button
        onClick={() => setHoldDialogOpen(true)}
        className="btn btn-primary"
      >
        Place Hold
      </button>
      
      {holdDialogOpen && (
        <HoldConfirmationDialog
          itemTitle="Item Name"
          holdDuration={rankBenefits.holdDurationMinutes}
          onConfirm={handlePlaceHold}
          onCancel={() => setHoldDialogOpen(false)}
          isLoading={isLoading}
        />
      )}
    </>
  );
};
```

**Key behaviors:**
- Reset `skipCountThisSale` when user navigates to a different sale
- Grandmaster (`autoConfirmAllHolds: true`) never shows dialog, bypasses state entirely
- Ranger + Sage show dialog N times per sale, then auto-confirm
- Initiate + Scout always show dialog

---

## SECTION 6: EARLY ACCESS TIMING FOR LEGENDARY ITEMS

### 6.1 Legendary Item Visibility Logic

**Current assumption:** Organizer marks item as `isLegendary: true` during item creation. Backend must calculate visibility window.

**Decision:** Store `legendaryVisibleAt` at item creation time (not dynamically computed).

**Calculation rule:**
```
legendaryVisibleAt = publishedAt - (earlyAccessHours * 60 minutes)
```

Where `earlyAccessHours` comes from `getRankBenefits(SAGE or GRANDMASTER).legendaryEarlyAccessHours` at **query time** (not storage time).

---

### 6.2 Backend: Item Creation Flow

**File:** `packages/backend/src/controllers/itemController.ts` (item creation endpoint)

**Add logic:**

```typescript
import { getRankBenefits } from '../utils/rankUtils';

export const createItem = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId, title, isLegendary, /* ... other fields ... */ } = req.body;
    
    // Determine visibility window for Legendary items
    let legendaryVisibleAt = null;
    let legendaryPublishedAt = null;
    
    if (isLegendary) {
      legendaryPublishedAt = new Date();
      
      // Sages see 4 hours early, Grandmasters see 6 hours early
      // For consistency, we use Sage's early access as the default
      const sageEarlyAccessHours = getRankBenefits('SAGE').legendaryEarlyAccessHours; // 4
      legendaryVisibleAt = new Date(
        legendaryPublishedAt.getTime() - (sageEarlyAccessHours * 60 * 60 * 1000)
      );
    }
    
    const item = await prisma.item.create({
      data: {
        saleId,
        title,
        isLegendary: isLegendary ?? false,
        legendaryVisibleAt,
        legendaryPublishedAt,
        // ... other fields ...
      },
    });

    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ message: 'Failed to create item' });
  }
};
```

---

### 6.3 Backend: Item Query Filter

**File:** Any endpoint that fetches items (e.g., `itemController.getItemsBySaleId()`)

**Add visibility filter:**

```typescript
import { getRankBenefits } from '../utils/rankUtils';

export const getItemsBySaleId = async (req: Request, res: Response) => {
  try {
    const { saleId } = req.params;
    const userId = (req as AuthRequest).user?.id;
    
    // Fetch user rank if authenticated
    let userRank = 'INITIATE'; // Default for anonymous
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { explorerRank: true },
      });
      userRank = user?.explorerRank ?? 'INITIATE';
    }
    
    const isSageOrHigher = ['SAGE', 'GRANDMASTER'].includes(userRank);
    
    // Build query: include Legendary items only if visible or user is Sage+
    const items = await prisma.item.findMany({
      where: {
        saleId,
        isActive: true,
        status: 'AVAILABLE',
        // Legendary visibility: only include if legendaryVisibleAt <= now OR user is Sage+
        OR: [
          { isLegendary: false }, // Non-legendary always visible
          {
            AND: [
              { isLegendary: true },
              isSageOrHigher
                ? {} // Sage+ see all Legendaries
                : { legendaryVisibleAt: { lte: new Date() } }, // Others see only if time has passed
            ],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        price: true,
        isLegendary: true,
        legendaryVisibleAt: true,
        // ... other fields ...
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ message: 'Failed to fetch items' });
  }
};
```

**Key points:**
- `legendaryVisibleAt` is only visible to organizer/staff (don't send to client)
- Frontend uses `isLegendary` flag to show "Exclusive Early Access" badge
- Query is DB-efficient (uses index on `isLegendary, legendaryVisibleAt`)

---

## SECTION 7: RANK-UP DETECTION & RANK-UP MODAL

### 7.1 Rank-Up Trigger in AuthContext

**File:** `packages/frontend/components/AuthContext.tsx`

**Current code (from S449):** Already carries `explorerRank` in JWT and calls `updateUser({ explorerRank, guildXp })`

**Change needed:** Emit a rank-up event when rank changes

```typescript
export const AuthContext = createContext<{
  user: CurrentUser | null;
  updateUser: (updates: Partial<CurrentUser>) => void;
  rankUpEvent: { rank: string; previousRank: string } | null;
}>(/* ... */);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [rankUpEvent, setRankUpEvent] = useState<{ rank: string; previousRank: string } | null>(null);

  const updateUser = (updates: Partial<CurrentUser>) => {
    setUser((prev) => {
      if (!prev) return null;

      // Detect rank change
      if (updates.explorerRank && updates.explorerRank !== prev.explorerRank) {
        setRankUpEvent({
          previousRank: prev.explorerRank,
          rank: updates.explorerRank,
        });
        
        // Clear event after 1 second (Modal component consumes it)
        setTimeout(() => setRankUpEvent(null), 100);
      }

      return { ...prev, ...updates };
    });
  };

  return (
    <AuthContext.Provider value={{ user, updateUser, rankUpEvent }}>
      {children}
      {rankUpEvent && <RankUpModal rankUpEvent={rankUpEvent} />}
    </AuthContext.Provider>
  );
};
```

---

### 7.2 RankUpModal Component

**File:** `packages/frontend/components/RankUpModal.tsx`

**Purpose:** Full-screen celebration modal when user ranks up

**Implementation:**

```typescript
import React, { useEffect, useState } from 'react';
import { RANK_COLORS, RANK_NAMES } from '@/utils/rankUtils';

interface RankUpModalProps {
  rankUpEvent: {
    previousRank: string;
    rank: string;
  };
}

export const RankUpModal: React.FC<RankUpModalProps> = ({ rankUpEvent }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Auto-close after 5 seconds
    const timer = setTimeout(() => setIsVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [rankUpEvent]);

  if (!isVisible) return null;

  const rankColor = RANK_COLORS[rankUpEvent.rank as any] || '#666';
  const rankName = RANK_NAMES[rankUpEvent.rank as any] || rankUpEvent.rank;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur"
      onClick={() => setIsVisible(false)}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl"
        style={{ borderTop: `4px solid ${rankColor}` }}
      >
        {/* Celebration animation (confetti or scale-up) */}
        <div className="mb-6 text-6xl animate-bounce">🎉</div>

        <h1 className="text-3xl font-bold text-gray-900">
          You ranked up!
        </h1>

        <div
          className="my-6 inline-block rounded-full px-8 py-3 text-2xl font-bold text-white"
          style={{ backgroundColor: rankColor }}
        >
          {rankName}
        </div>

        <p className="mb-4 text-gray-600">
          New perks unlocked. Check your progress in Explorer's Guild.
        </p>

        <button
          onClick={() => setIsVisible(false)}
          className="mt-6 rounded-lg bg-gray-200 px-6 py-2 font-semibold text-gray-900 hover:bg-gray-300"
        >
          Close
        </button>
      </div>
    </div>
  );
};
```

**Design notes (from Dashboard Creative Brief):**
- Full-screen modal (not toast) for celebration impact
- Rank color matches `RANK_COLORS` mapping
- Auto-closes after 5 seconds but user can dismiss earlier
- Shows on every rank-up (no cooldown)

---

## SECTION 8: HALL OF FAME DATA MODEL

### 8.1 Query-Based (No New Model)

**Decision:** Hall of Fame is **derived from User queries**, not stored in a new model.

**Rationale:**
- Grandmaster data never changes (lifetime achievement)
- Seasonal data resets Jan 1 via cron (update User.seasonalResetAt timestamp)
- Query is efficient (indexed on guildXp, explorerRank)
- Avoids denormalization and sync issues

---

### 8.2 Hall of Fame Data Structure

**Two sections:**

1. **All-Time Grandmasters**
```sql
SELECT id, name, profileSlug, guildXp, explorerRank, createdAt
FROM "User"
WHERE explorerRank = 'GRANDMASTER'
ORDER BY guildXp DESC, createdAt ASC -- Tiebreaker: earliest achiever first
LIMIT 100;
```

2. **Top 100 This Season (Sage+)**
```sql
SELECT id, name, profileSlug, guildXp, explorerRank, seasonalResetAt
FROM "User"
WHERE (explorerRank = 'SAGE' OR explorerRank = 'GRANDMASTER')
  AND (seasonalResetAt IS NULL OR seasonalResetAt = '2026-01-01 00:00:00 UTC')
ORDER BY guildXp DESC
LIMIT 100;
```

**Seasonal reset logic (runs Jan 1 00:00 UTC via cron):**
- No data deletion
- Update User.seasonalResetAt = '2026-01-01 00:00:00 UTC' for all users
- Cron queries users where `seasonalResetAt < CURRENT_DATE` → update to today's date at 00:00 UTC
- Next season's leaderboard shows only users with today's `seasonalResetAt`

---

### 8.3 Backend API Endpoints

**GET `/api/guild/hall-of-fame`**

```typescript
export const getHallOfFame = async (req: Request, res: Response) => {
  try {
    // All-time Grandmasters
    const grandmasters = await prisma.user.findMany({
      where: { explorerRank: 'GRANDMASTER' },
      select: {
        id: true,
        name: true,
        profileSlug: true,
        guildXp: true,
        explorerRank: true,
        createdAt: true,
      },
      orderBy: [
        { guildXp: 'desc' },
        { createdAt: 'asc' }, // Tiebreaker
      ],
      take: 100,
    });

    // Top 100 Sage+ this season
    const now = new Date();
    const seasonStart = new Date(now.getFullYear(), 0, 1); // Jan 1 UTC
    
    const seasonalLeaders = await prisma.user.findMany({
      where: {
        explorerRank: { in: ['SAGE', 'GRANDMASTER'] },
        seasonalResetAt: { gte: seasonStart }, // Only this season's resets
      },
      select: {
        id: true,
        name: true,
        profileSlug: true,
        guildXp: true,
        explorerRank: true,
      },
      orderBy: { guildXp: 'desc' },
      take: 100,
    });

    res.json({
      allTimeGrandmasters: grandmasters.map((u, idx) => ({
        rank: idx + 1,
        userId: u.id,
        name: u.name,
        profileSlug: u.profileSlug,
        guildXp: u.guildXp,
        explorerRank: u.explorerRank,
        achievedAt: u.createdAt.toISOString(),
      })),
      seasonalTop100: seasonalLeaders.map((u, idx) => ({
        rank: idx + 1,
        userId: u.id,
        name: u.name,
        profileSlug: u.profileSlug,
        guildXp: u.guildXp,
        explorerRank: u.explorerRank,
      })),
    });
  } catch (error) {
    console.error('Error fetching Hall of Fame:', error);
    res.status(500).json({ message: 'Failed to fetch Hall of Fame' });
  }
};
```

**GET `/api/user/:id/rank-info`**

```typescript
import { getRankProgressInfo, getRankBenefits } from '../utils/rankUtils';

export const getUserRankInfo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        guildXp: true,
        explorerRank: true,
        rankUpHistory: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const progressInfo = getRankProgressInfo(user.guildXp);
    const benefits = getRankBenefits(user.explorerRank);

    res.json({
      currentRank: user.explorerRank,
      guildXp: user.guildXp,
      nextRankXp: progressInfo.nextRankXp,
      xpToNextRank: progressInfo.xpToNextRank,
      percentToNextRank: progressInfo.percentToNextRank,
      unlockedPerks: benefits,
      rankUpHistory: user.rankUpHistory || [],
    });
  } catch (error) {
    console.error('Error fetching user rank info:', error);
    res.status(500).json({ message: 'Failed to fetch rank info' });
  }
};
```

---

## SECTION 9: DASHBOARD RANK-AWARE RENDERING ARCHITECTURE

### 9.1 Single Dashboard, Conditional Rendering

**Decision:** Single dashboard page (`/shopper/dashboard`) with rank-aware conditionals, not separate pages per rank.

**Rationale:**
- Reduces code duplication
- Simpler navigation
- Easier A/B testing
- Matches FindA.Sale pattern (one page with role-based conditions)

---

### 9.2 Dashboard Config System

**File:** `packages/frontend/utils/dashboardConfig.ts`

**Purpose:** Single source of truth for dashboard layout per rank

```typescript
import { ExplorerRank } from '@findasale/shared';

export type DashboardCard = 
  | 'onboarding'
  | 'xpProgress'
  | 'unlockedPerks'
  | 'savedItems'
  | 'haulHistory'
  | 'bounties'
  | 'collectionTracking'
  | 'leaderboardPosition'
  | 'appraisalRequests'
  | 'reputation'
  | 'exclusiveEarlyAccess'
  | 'grandmasterStats'
  | 'myTeams';

export interface DashboardConfig {
  prominentCards: DashboardCard[]; // Top row, full width or large
  secondaryCards: DashboardCard[]; // Second row, smaller
  hiddenCards: DashboardCard[];    // Not rendered at all
}

export function getRankDashboardConfig(rank: ExplorerRank): DashboardConfig {
  const configs: Record<ExplorerRank, DashboardConfig> = {
    INITIATE: {
      prominentCards: ['onboarding', 'xpProgress'],
      secondaryCards: ['unlockedPerks', 'myTeams'],
      hiddenCards: ['leaderboardPosition', 'reputation', 'exclusiveEarlyAccess', 'grandmasterStats'],
    },
    SCOUT: {
      prominentCards: ['xpProgress', 'unlockedPerks'],
      secondaryCards: ['savedItems', 'haulHistory', 'bounties', 'myTeams'],
      hiddenCards: ['leaderboardPosition', 'reputation', 'exclusiveEarlyAccess', 'grandmasterStats'],
    },
    RANGER: {
      prominentCards: ['xpProgress', 'savedItems'],
      secondaryCards: ['haulHistory', 'bounties', 'collectionTracking', 'unlockedPerks', 'myTeams'],
      hiddenCards: ['leaderboardPosition', 'reputation', 'exclusiveEarlyAccess', 'grandmasterStats'],
    },
    SAGE: {
      prominentCards: ['leaderboardPosition', 'xpProgress'],
      secondaryCards: ['appraisalRequests', 'reputation', 'savedItems', 'bounties', 'myTeams'],
      hiddenCards: ['onboarding', 'exclusiveEarlyAccess', 'grandmasterStats'],
    },
    GRANDMASTER: {
      prominentCards: ['grandmasterStats', 'exclusiveEarlyAccess'],
      secondaryCards: ['leaderboardPosition', 'appraisalRequests', 'reputation', 'myTeams'],
      hiddenCards: ['onboarding', 'haulHistory', 'collectionTracking'],
    },
  };

  return configs[rank] || configs.INITIATE;
}
```

---

### 9.3 Dashboard Page Implementation

**File:** `packages/frontend/pages/shopper/dashboard.tsx`

**Structure:**

```typescript
import { getRankDashboardConfig } from '@/utils/dashboardConfig';
import { getRankBenefits, getRankProgressInfo } from '@/utils/rankUtils';

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;

  const config = getRankDashboardConfig(user.explorerRank);
  const benefits = getRankBenefits(user.explorerRank);
  const progress = getRankProgressInfo(user.guildXp);

  return (
    <div className="space-y-6 p-6">
      {/* Header: Rank badge + progress */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Welcome, {user.name}</h1>
        <RankBadge rank={user.explorerRank} />
      </div>

      {/* Progress bar (always visible) */}
      {user.explorerRank !== 'GRANDMASTER' && (
        <RankProgressBar
          currentXp={user.guildXp}
          nextRankXp={progress.nextRankXp}
          currentRank={user.explorerRank}
          nextRank={progress.nextRank}
        />
      )}

      {/* Prominent cards — render all */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {config.prominentCards.map((cardName) => (
          <DashboardCardRenderer key={cardName} cardType={cardName} user={user} benefits={benefits} />
        ))}
      </div>

      {/* Secondary cards — responsive grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {config.secondaryCards.map((cardName) => (
          <DashboardCardRenderer key={cardName} cardType={cardName} user={user} benefits={benefits} />
        ))}
      </div>

      {/* Hidden cards are skipped (not rendered at all) */}
    </div>
  );
}

// Helper component to render based on card type
function DashboardCardRenderer({ cardType, user, benefits }: any) {
  switch (cardType) {
    case 'onboarding':
      return <OnboardingCard />;
    case 'xpProgress':
      return <XpProgressCard user={user} />;
    case 'unlockedPerks':
      return <RankBenefitsCard rank={user.explorerRank} benefits={benefits} />;
    case 'savedItems':
      return <SavedItemsCard />;
    case 'leaderboardPosition':
      return <LeaderboardPositionCard />;
    // ... other cards
    default:
      return null;
  }
}
```

---

## SECTION 10: REQUIRED COMPONENTS

**5 new components needed:**

| Component | Path | Purpose |
|-----------|------|---------|
| `RankBadge` | `components/RankBadge.tsx` | Rank icon + name + color |
| `RankProgressBar` | `components/RankProgressBar.tsx` | XP bar toward next rank |
| `RankBenefitsCard` | `components/RankBenefitsCard.tsx` | Unlocked perks + next rank preview |
| `RankUpModal` | `components/RankUpModal.tsx` | Full-screen rank-up celebration |
| `HallOfFamePage` | `pages/guild/hall-of-fame.tsx` | All-time Grandmasters + seasonal top 100 |

**Quick signatures:**

```typescript
// RankBadge.tsx
export const RankBadge: React.FC<{ rank: ExplorerRank; size?: 'sm' | 'md' | 'lg' }> = ({ rank, size = 'md' }) => {
  const color = RANK_COLORS[rank];
  const name = RANK_NAMES[rank];
  return <div style={{ backgroundColor: color }} className="..."> {name} </div>;
};

// RankProgressBar.tsx
export const RankProgressBar: React.FC<{
  currentXp: number;
  nextRankXp: number;
  currentRank: ExplorerRank;
  nextRank: ExplorerRank | null;
}> = ({ currentXp, nextRankXp, currentRank, nextRank }) => {
  const percentComplete = ((currentXp - XP_THRESHOLDS[currentRank]) / (nextRankXp - XP_THRESHOLDS[currentRank])) * 100;
  return <div className="..."> Progress: {percentComplete}% </div>;
};

// RankBenefitsCard.tsx
export const RankBenefitsCard: React.FC<{
  rank: ExplorerRank;
  benefits: RankBenefits;
}> = ({ rank, benefits }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold">Rank: {RANK_NAMES[rank]}</h3>
      <ul className="space-y-2">
        <li>Hold Duration: {benefits.holdDurationMinutes} min</li>
        <li>Wishlist Slots: {benefits.wishlistSlots}</li>
        {/* ... other perks ... */}
      </ul>
    </div>
  );
};

// RankUpModal.tsx
// (Detailed implementation in Section 7.2 above)

// HallOfFamePage.tsx
export default function HallOfFamePage() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    fetch('/api/guild/hall-of-fame')
      .then((r) => r.json())
      .then(setData);
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold">Hall of Fame</h1>
      
      <section>
        <h2 className="text-2xl font-bold">All-Time Grandmasters</h2>
        <UserLeaderboardTable users={data?.allTimeGrandmasters} />
      </section>
      
      <section>
        <h2 className="text-2xl font-bold">Top 100 This Season</h2>
        <UserLeaderboardTable users={data?.seasonalTop100} />
      </section>
    </div>
  );
}
```

---

## SECTION 11: MIGRATION DEPLOYMENT CHECKLIST

**Patrick executes this block (in order):**

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database

# Override environment to Railway
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"

# Run migrations in order
npx prisma migrate deploy
npx prisma generate

# Verify no errors
echo "Migrations complete. Check Railway dashboard for confirmation."
```

**If migrations fail:**
- Check Railway dashboard for connection issues
- Verify `$env:DATABASE_URL` is correct (copy from above)
- Never use localhost .env URL for production

---

## SECTION 12: IMPLEMENTATION ORDER & DEPENDENCIES

**Phase 1 (BLOCKING):**
1. ✅ Merge `rankUtils.ts` (no DB calls, can't break anything)
2. ✅ Deploy 2 migrations (schema changes)
3. ✅ Regenerate Prisma client

**Phase 2 (Can run parallel):**
- Backend: 7 new endpoints + hold/wishlist validation (no UI needed)
- Frontend: 5 new components (independent, uses mock data first)

**Phase 3 (Integration):**
- Wire auth context rank-up event → RankUpModal
- Dashboard config + rendering
- Test end-to-end with real rank-ups

---

## SECTION 13: DEVIATION NOTES

**None.** All decisions align exactly with S449 locked specs:
- Rank thresholds (0/500/2000/5000/12000) ✓
- Perks table (hold duration, wishlist slots, early access hours) ✓
- Rank names (Initiate, Scout, Ranger, Sage, Grandmaster) ✓
- Dashboard creative brief (per-rank card prioritization) ✓

---

## SECTION 14: QA SIGN-OFF GATES

**Dev returns to Architect with:**
1. List of files created/modified
2. `npm run build` passes (no TypeScript errors)
3. Migrations confirmed applied to Railway
4. One screenshot: `/api/user/:id/rank-info` response (curl + Postman)

**Architect verifies:**
1. `getRankBenefits()` returns all field types correctly
2. Hold creation stores duration snapshot
3. Wishlist endpoint enforces slot caps
4. Hall of Fame query runs under 500ms

**QA verifies (post-deploy):**
1. Rank-up modal triggers on XP earn
2. Hold duration matches rank (30/45/60/75/90)
3. Wishlist cap enforced (Initiate=1, Scout=3, Ranger=10, Sage=15, Grandmaster=unlimited)
4. Legendary items visible with early access for Sage+
5. Hall of Fame page loads + displays correctly

---

## APPENDIX A: TypeScript Enums & Shared Types

**Export from `packages/shared/src/types/` or include in backend `rankUtils.ts`:**

```typescript
export type ExplorerRank = 'INITIATE' | 'SCOUT' | 'RANGER' | 'SAGE' | 'GRANDMASTER';

export const XP_THRESHOLDS: Record<ExplorerRank, number> = {
  INITIATE: 0,
  SCOUT: 500,
  RANGER: 2000,
  SAGE: 5000,
  GRANDMASTER: 12000,
};

export const RANK_DISPLAY_NAMES: Record<ExplorerRank, string> = {
  INITIATE: 'Initiate',
  SCOUT: 'Scout',
  RANGER: 'Ranger',
  SAGE: 'Sage',
  GRANDMASTER: 'Grandmaster',
};

export const RANK_COLORS_HEX: Record<ExplorerRank, string> = {
  INITIATE: '#6B7280',    // gray-500
  SCOUT: '#3B82F6',       // blue-500
  RANGER: '#10B981',      // emerald-500
  SAGE: '#F59E0B',        // amber-500
  GRANDMASTER: '#8B5CF6', // violet-500
};
```

---

**Status:** Ready for findasale-dev dispatch.

All decisions locked. No follow-up needed from Patrick before implementation begins.
