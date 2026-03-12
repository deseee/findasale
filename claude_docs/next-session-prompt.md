# Next Session Resume Prompt
*Written: 2026-03-12T00:00:00Z*
*Session ended: normally*

## Resume From

Run findasale-qa on the Stripe Terminal POS payment flow (terminalController.ts, stripeController.ts webhook isPOS guard) before enabling for beta organizers.

## What Was In Progress

Nothing mid-task. All 7 implementation steps for Stripe Terminal POS are complete. Waiting on Patrick actions before next dev work can proceed.

## What Was Completed This Session

- Ship-Ready subcommittee approved Stripe Terminal POS (session 150)
- Architect ADR: `claude_docs/feature-notes/stripe-terminal-pos-adr.md`
- Schema: `Purchase.userId` nullable, `source` + `buyerEmail` fields added
- Migration: `packages/database/prisma/migrations/20260312000002_add_purchase_pos_fields/migration.sql`
- `packages/backend/src/controllers/terminalController.ts` (NEW — 4 endpoints)
- `packages/backend/src/routes/stripe.ts` (4 terminal routes added)
- `packages/backend/src/controllers/stripeController.ts` (isPOS webhook guard)
- `packages/frontend/pages/organizer/pos.tsx` (NEW — full POS charge UI)
- `packages/frontend/pages/organizer/dashboard.tsx` (💳 POS nav link added)

## Environment Notes

**Patrick must complete before next session:**
1. `pnpm --filter frontend add @stripe/terminal-js` (from PowerShell, project root)
2. Add env var: `NEXT_PUBLIC_STRIPE_TERMINAL_SIMULATED=true` (Vercel + local .env)
3. Deploy Neon migration (from `packages/database`):
   - Read the commented-out Neon DATABASE_URL from `packages/backend/.env`
   - Run `npx prisma migrate deploy` with that URL
4. Run `npx prisma generate` (from `packages/database`, local)
5. Git push — feature commit (9 files) + ADR commit (1 file) via `.\push.ps1`

**Vercel:** GitHub App integration was reconnected this session — auto-deploy should resume on next push.

**Stripe business account:** Patrick still needs to open one to register real hardware. Simulated mode works without it.

## Exact Context

- POS page lives at `/organizer/pos` — requires ORGANIZER role JWT
- Connection token endpoint: `POST /api/stripe/terminal/connection-token`
- PaymentIntent: `POST /api/stripe/terminal/payment-intent` — body: `{ itemId, buyerEmail? }`
- Capture: `POST /api/stripe/terminal/capture` — body: `{ paymentIntentId }`
- Cancel: `POST /api/stripe/terminal/cancel` — body: `{ paymentIntentId }`
- All terminal routes go through `authenticate` middleware — organizer JWT required
- `NEXT_PUBLIC_STRIPE_TERMINAL_SIMULATED=true` enables the simulated reader in the frontend (no hardware required for testing)
- Multi-item POS cart deferred to v2 — needs new `POSTransaction` model (Architect must approve)
- QA flag: payment flow (terminal PI creation, capture, webhook idempotency) should be reviewed by findasale-qa before beta enablement
