# CD2 Phase 2 — Treasure Hunt Mode Implementation

## Overview

Treasure Hunt Mode is a daily discovery challenge that creates FOMO-driven engagement. Each day, shoppers get an AI-generated clue hinting at a specific item category. They browse sales to find matching items, "discover" them, and earn Hunt Pass points.

## Database Schema

### New Models

**TreasureHunt**
- `id` (Int, PK)
- `date` (String, unique) — YYYY-MM-DD format
- `clue` (String) — Cryptic clue text
- `category` (String) — Item category hint
- `keywords` (String[]) — Matching keywords (secret from shoppers)
- `pointReward` (Int, default 50)
- `createdAt` (DateTime)
- Relation: `finds -> TreasureHuntFind[]`

**TreasureHuntFind**
- `id` (Int, PK)
- `userId` (String, FK)
- `huntId` (Int, FK)
- `itemId` (String, FK)
- `foundAt` (DateTime)
- Unique constraint: `(userId, huntId)` — One find per hunt per user
- Relations: User, TreasureHunt, Item

### Updated Models

**User**: Added `treasureHuntFinds` relation

**Item**: Added `treasureHuntFinds` relation

**PointsTransaction**: Type enum now includes `TREASURE_HUNT_FIND`

## Backend Architecture

### Services

**treasureHuntService.ts** (`packages/backend/src/services/treasureHuntService.ts`)

- `generateDailyClue(date: string)` — Uses Claude Haiku to generate a fun clue with keywords
- `getTodayHunt()` — Gets or creates today's hunt
- `checkIfItemMatchesHunt(item, hunt)` — Matches item title/category against keywords
- `markFound(userId, huntId, itemId)` — Records find and awards points

**API Endpoints**

- `GET /api/treasure-hunt/today` — Returns clue + category + reward. Keywords hidden. Returns `alreadyFound` for authenticated users.
- `POST /api/treasure-hunt/found` — Body: `{ itemId }`. Validates item matches keywords. Returns `{ success, pointsEarned, message }` or `{ success: false, message }` if no match.

### Route Registration

Routes registered in `packages/backend/src/index.ts`:
```typescript
app.use('/api/treasure-hunt', treasureHuntRoutes);
```

## Frontend Components

### TreasureHuntBanner.tsx

Gold/amber card displayed on home page below hero section. Shows:
- Clue text (italic, mysterious tone)
- Category badge (uppercase)
- Point reward
- Status:
  - If found: Green checkmark + "Found!"
  - If authenticated: "Find it to earn points!"
  - If not logged in: "Sign in to earn points" (link to /login)

Features graceful degradation — renders nothing if hunt fetch fails.

### Item Detail Page Integration

Added "Mark as Found" section near bottom of item detail page:
- Blue-tinted card with map emoji
- Text: "Does this match today's treasure hunt clue?"
- [Mark as Found] button
- Only shows for authenticated non-organizers on AVAILABLE items

Success toast: "You found it! Earned 50 Hunt Pass points!"
Error toast: "That item doesn't match today's clue! Keep looking!"

### Home Page Integration

`TreasureHuntBanner` component imported and rendered in `packages/frontend/pages/index.tsx` between hero section and map.

## User Flow

1. **Shopper lands on home page** → Sees TreasureHuntBanner with today's clue + category hint
2. **Shopper browses sales** → Looks for items matching the clue (e.g., "Grandmother kept her treasures here, between spine and spine..." = books)
3. **Shopper finds matching item** → Clicks "Mark as Found" on item detail page
4. **Backend validates** → Item title/category checked against hunt keywords
5. **Success** → User awarded points, banner updates to show "Found!", points transaction recorded
6. **Failure** → User sees "Keep looking!" message, can continue searching

## Prompt Engineering (Claude Haiku)

The service calls Claude Haiku with this system prompt:

```
Generate a fun, cryptic clue for an estate sale treasure hunt.
The clue should hint at one of these item categories: [10 categories].

Format your response as ONLY valid JSON:
{
  "clue": "...",
  "category": "...",
  "keywords": ["...", "...", "..."]
}

Guidelines:
- Clue: 1-2 sentences, fun and mysterious, for estate sale shoppers
- Category: one of the listed categories
- Keywords: 3-5 matching terms/variations
```

Example output:
```json
{
  "clue": "Grandmother kept her treasures here, between spine and spine...",
  "category": "books",
  "keywords": ["book", "novel", "vintage paperback", "hardcover", "tome"]
}
```

## Files Created

### Database
- `packages/database/prisma/schema.prisma` (updated) — Added TreasureHunt + TreasureHuntFind models
- `packages/database/prisma/migrations/20260305130000_add_treasure_hunt/migration.sql` (new)

### Backend
- `packages/backend/src/services/treasureHuntService.ts` (new)
- `packages/backend/src/routes/treasureHunt.ts` (new)
- `packages/backend/src/index.ts` (updated) — Registered treasure hunt routes

### Frontend
- `packages/frontend/components/TreasureHuntBanner.tsx` (new)
- `packages/frontend/pages/index.tsx` (updated) — Wired banner component
- `packages/frontend/pages/items/[id].tsx` (updated) — Added mark as found UI

## Key Design Decisions

1. **Keywords hidden from shoppers** — `/api/treasure-hunt/today` returns clue + category but NOT keywords. Keeps discovery fun and challenging.

2. **One find per user per hunt** — Unique constraint prevents gaming points by "finding" same item multiple times.

3. **Fire-and-forget points** — Points awarded asynchronously to avoid blocking the API response.

4. **Graceful degradation** — If AI service unavailable or hunt fails to load, banner renders nothing (no error spam).

5. **Match flexibility** — Item title and category are both checked against keywords (case-insensitive), allowing for some variation in how shoppers name/categorize items.

6. **Clue generation idempotency** — If `getTodayHunt()` is called multiple times, only one clue is generated per calendar day (checked via date string).

## Testing Checklist

- [ ] Run migration: `prisma migrate deploy`
- [ ] Test `/api/treasure-hunt/today` returns clue + category (no keywords)
- [ ] Test `/api/treasure-hunt/found` with matching item → points awarded
- [ ] Test `/api/treasure-hunt/found` with non-matching item → 400 error
- [ ] Test duplicate finds → 400 error
- [ ] Test unauthenticated request to `/found` → 401 error
- [ ] Banner appears on home page, fetches hunt data
- [ ] Banner gracefully degrades if hunt fetch fails
- [ ] Item detail page shows "Mark as Found" button for authenticated users
- [ ] Clicking "Mark as Found" calls API and shows success/error toast
- [ ] Points transaction created with type `TREASURE_HUNT_FIND`

## Future Enhancements

- Leaderboard for top treasure hunters (weekly/monthly)
- Streak badges for consecutive days finding items
- Difficulty levels (easy/medium/hard clues)
- Category-specific hunts (alternate between categories)
- Admin UI to manually set/preview daily clues
- Scheduled job to pre-generate clues (instead of on-demand)
