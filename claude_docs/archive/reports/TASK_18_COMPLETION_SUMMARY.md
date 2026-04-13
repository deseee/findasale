# TASK #18 — Post Performance Analytics [COMPLETE]

## Completion Status
✅ **ALL FILES CREATED + INTEGRATED IN ONE PASS**

## Mission
Implement UTM tracking + analytics dashboard for social shared sale links (PRO tier). Track clicks via fire-and-forget pixel, aggregate by source, display 7-day sparkline on insights dashboard.

## Architecture

### Database
- **New Model: LinkClick**
  - Fields: id, saleId (FK), utmSource, utmMedium, utmCampaign, utmContent, ipHash (SHA256), clickedAt
  - Indexes: (saleId, clickedAt), (saleId, utmSource)
  - Relation: Sale.linkClicks[] (one-to-many, cascade delete)
- **Migration**: `packages/database/prisma/migrations/20260317000810_add_link_clicks/migration.sql`

### Backend
1. **Service**: `packages/backend/src/services/linkClickService.ts` (96 lines)
   - `recordClick(params)` — async fire-and-forget
   - `getClickStats(saleId)` — returns { totalClicks, clicksByDay[], topSources[] }

2. **Utility**: `packages/backend/src/lib/ipUtils.ts` (12 lines)
   - `getClientIp(req)` — proxy-aware IP extraction

3. **Controller**: `packages/backend/src/controllers/linkClickController.ts` (55 lines)
   - `recordClickHandler()` — GET /api/link-clicks/record (public, fire-and-forget)
   - `getStatsHandler()` — GET /api/link-clicks/stats/:saleId (auth + PRO tier)

4. **Route**: `packages/backend/src/routes/linkClicks.ts` (16 lines)
   - Registered: app.use('/api/link-clicks', linkClickRoutes)
   - Public: GET /record
   - Protected: GET /stats/:saleId (requireTier('PRO'))

### Frontend
1. **Component**: `packages/frontend/components/PostPerformanceCard.tsx` (126 lines)
   - Displays: total clicks, top source, 7-day trend (recharts LineChart)
   - Source breakdown (top 5)
   - Loading skeleton + no-data state
   - Tailwind styled (warm-*, amber-*, sage-green #8FB897)

2. **Utility**: `packages/frontend/lib/linkShareUtils.ts` (14 lines)
   - `generateShareUrl(baseUrl, saleId)` — helper to inject UTM params (optional)

3. **Hooks**: `packages/frontend/pages/_app.tsx` — UTMCapture hook
   - Detects utm_* + saleId from router.query on page load
   - Fires silent GET to /api/link-clicks/record
   - No error handling (silent fail)

4. **Integration**: `packages/frontend/pages/organizer/insights.tsx`
   - Added import: PostPerformanceCard
   - Added query: clickStats useQuery for stats endpoint
   - Added JSX: <PostPerformanceCard /> in per-sale breakdown

## Files Created
- packages/database/prisma/migrations/20260317000810_add_link_clicks/migration.sql
- packages/backend/src/services/linkClickService.ts
- packages/backend/src/lib/ipUtils.ts
- packages/backend/src/controllers/linkClickController.ts
- packages/backend/src/routes/linkClicks.ts
- packages/frontend/components/PostPerformanceCard.tsx
- packages/frontend/lib/linkShareUtils.ts

## Files Modified
- packages/database/prisma/schema.prisma (LinkClick model + Sale.linkClicks relation)
- packages/backend/src/index.ts (import linkClickRoutes, app.use())
- packages/frontend/pages/organizer/insights.tsx (import, useQuery, JSX)
- packages/frontend/pages/_app.tsx (UTMCapture hook + component tree)

## Tier Gating
- **Public**: GET /api/link-clicks/record (pixel endpoint, no auth)
- **PRO-Only**: GET /api/link-clicks/stats/:saleId (requireTier('PRO') middleware)

## Database Migration
After merge, run on Neon:
```powershell
cd packages/database
$env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
npx prisma migrate deploy   # Applies migration to live DB
npx prisma generate         # Regenerates @prisma/client
```

## Verification Checklist
- ✅ Schema: LinkClick model with indexes, Sale.linkClicks relation
- ✅ Migration SQL: CREATE TABLE + indexes
- ✅ Service: recordClick async, getClickStats aggregation logic
- ✅ Controller: public record endpoint, auth+tier gated stats endpoint
- ✅ Frontend: PostPerformanceCard recharts integration
- ✅ Integration: insights.tsx wired with card + query
- ✅ UTM Capture: _app.tsx hook fires on page load
- ✅ No schema conflicts, no breaking changes

## Ready For
- Social sharing feature integration (link generation in promote.tsx)
- Organizer dashboard analytics (per-sale stats on insights page)
- Production deployment (Railway backend + Vercel frontend)

## Notes
- Do NOT push to GitHub (per instructions)
- All TypeScript strict
- Tailwind classes: warm-*, amber-*, sage-green
- Recharts library already installed
- No new npm packages required
