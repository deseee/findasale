# Next Session Resume Prompt
*Written: 2026-03-14T18:12:24Z*
*Session ended: normally*

## Resume Priority — Critical Issue First

**Railway backend is restarting randomly.** Main page shows "Error Loading Sales" intermittently. No build errors in deploy logs. This blocks feature validation and all 4 shipped features (#61, #34, #35, #33). **Fix this before anything else.**

## What Was Completed This Session
Four Phase 4 features built and wired (not yet pushed to GitHub):
- **#61 Near-Miss Nudges** — Progress nudge on review page (60–99% complete)
- **#34 Hype Meter** — Real-time viewer count on sale detail (viewerController + viewers.ts)
- **#35 Front Door Locator** — Entrance pin picker, schema migration created, wired into edit-sale + shopper view
- **#33 Share Card Factory** — Cloudinary OG image generation, full OG/Twitter Card meta tags

## In Progress / Pending Deployment
All 4 features are tested locally but **NOT YET PUSHED** due to Railway investigation.

## What To Do Next

### URGENT (Session Start)
1. **Debug Railway backend restarts** — Check Railway dashboard for error logs. Look for:
   - Route conflicts (viewersRouter might be interfering with existing saleRoutes)
   - Missing middleware or authentication guards
   - Cold start timeouts
   - Consider rolling back recent viewers/viewerController changes if Railway logs point to them
2. Once Railway is stable, push all 4 features to GitHub via `.\push.ps1`

### Secondary (After Railway Fixed)
3. **Deploy entrance pin migration to Neon:** Run `prisma migrate deploy` with migration `20260314193440_add_entrance_pin` against Neon production
4. **Add Vercel env var:** `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=db8yhzjdq` to Vercel project settings
5. **Test all 4 features end-to-end** on production (Vercel + Railway)
6. Once confirmed working, resume roadmap P1: **#24 Holds** (1 sprint, trust blocker for beta)

## Key Files Changed (Waiting to Push)
Frontend: NearMissNudge.tsx, HypeMeter.tsx, EntrancePinPicker.tsx, EntrancePinPickerInner.tsx, EntranceMarker.tsx, SaleOGMeta.tsx, ItemOGMeta.tsx, SaleMap.tsx, SaleMapInner.tsx, add-items/[saleId].tsx, edit-sale/[id].tsx, sales/[id].tsx, items page Head block
Backend: viewerController.ts, viewers.ts, itemController.ts, routes wiring (index.ts)
Schema: Migration 20260314193440_add_entrance_pin (created locally, needs Neon deploy)

## Environment Status
- **frontend/.env.local** — NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME added, needs copying to Vercel
- **Vercel GitHub App** — still potentially disconnected (flagged session 149)
- **Neon migrations** — 72 current, +1 pending (entrance pin)
- **Railway** — unstable (main blocker)

## Context
- Roadmap v27, next priority after fix: #24 Holds (1 sprint)
- Brand Voice session on upcoming list
- Load STATE.md and CLAUDE.md before starting work
