# Next Session Resume Prompt
*Written: 2026-03-04T12:00:00Z*
*Session ended: normally*

## Resume From
Run pending DB migrations in Docker, generate VAPID keys, and rebuild the backend container to activate Phase 9/11/12.

## What Was In Progress
- **Migrations not applied** — `20260304000001_add_affiliate_conversions` and `20260304000002_add_push_subscriptions` exist on GitHub and locally but have NOT been run in Docker. The rolled-back marker for 000001 was cleared; both are ready to deploy.
- **VAPID keys not generated** — web-push is installed but no keys exist. Push notifications silently no-op until keys are set.
- **Backend needs Docker rebuild** — `web-push` was added to package.json after the last image build. The running container doesn't have it.

## What Was Completed This Session
- Phase 9 (affiliate conversion attribution): affiliateController fix, schema + migration, Stripe webhook attribution, `affiliate/[id].tsx` redirect page, creator dashboard Conversions/Conv. Rate stats, CheckoutModal sessionStorage ref
- Phase 12 (auction launch): auctionJob cron schedule added (critical fix — auctions were never ending), AuctionCountdown component, BidModal component, sale detail page wired
- Phase 11 (PWA push notifications): PushSubscription model + migration, push controller/routes/webpush utility, usePushSubscription hook, sw-push.js service worker, PushSubscriber in _app.tsx
- Vercel build fixed: pnpm-lock.yaml pushed after extended git conflict resolution
- Migration 20260304000001 made idempotent (IF NOT EXISTS guards)
- Self-healing skills 14–16 added

## Environment Notes
- Vercel is building from updated main. Build should be clean.
- Docker backend is running the OLD image (no web-push). Push endpoints will 500 until after rebuild.
- All code is on GitHub main (commit `74684b9`).

## Exact Commands for Next Session Start

**Step 1 — Apply migrations:**
```powershell
docker exec findasale-backend-1 sh -c "cd /app/packages/database && npx prisma migrate deploy"
```

**Step 2 — Regenerate Prisma client:**
```powershell
docker exec findasale-backend-1 sh -c "cd /app/packages/database && npx prisma generate"
```

**Step 3 — Generate VAPID keys (one-time, save output):**
```powershell
npx web-push generate-vapid-keys
```
Add to `packages/backend/.env`:
```
VAPID_PUBLIC_KEY=<public-key>
VAPID_PRIVATE_KEY=<private-key>
VAPID_CONTACT_EMAIL=admin@finda.sale
```
Add to `packages/frontend/.env.local`:
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public-key>
```
Also add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to Vercel project → Environment Variables.

**Step 4 — Rebuild backend:**
```powershell
docker compose build --no-cache backend
docker compose up -d
```

**Step 5 — Smoke test:**
- Log in at localhost:3000, accept push permission prompt
- Check backend logs: `docker compose logs backend | Select-String "Push"`
