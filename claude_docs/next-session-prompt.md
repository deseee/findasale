# Next Session Resume Prompt
*Written: 2026-03-07T00:00:00Z*
*Session ended: normally — session wrap triggered by Patrick*

## Resume From

Run the Phase 2 feature sprint (features 3–5) using the subagent **Skill** tool pipeline:
`findasale-architect` → `findasale-dev` → `findasale-qa` for each feature in order.

**CRITICAL: Use `Skill` tool to invoke subagents, NOT the `Agent` tool.**
The `Agent` tool will return "agent type not found" for all findasale-* types.
The correct invocation is: `Skill("findasale-architect")` with a detailed prompt.

---

## What Was In Progress

### Sprints queued but NOT started:
1. **Sprint 3 — Shopper Loyalty Program** (Phase 2, feature 3) — No Coupon model exists yet; migration required.
2. **Sprint 4 — Search by Item Type** (Phase 2, feature 4) — DB indexes + search endpoint + frontend filter UI.
3. **Sprint 5 — Seller Performance Dashboard** (Phase 2, feature 5) — `organizerAnalyticsService.ts` already has weekly stats logic; can be extended. No schema changes needed.
4. **Sprint 6 — Shopper Referral Rewards** (Phase 3, feature 7) — `shopperReferralController.ts` already exists; `User.shopperCredits Float` already in schema. Wire-up sprint likely.
5. **Sprint 7 — Stripe Terminal POS** (Phase 3, feature 5) — Complex infra. Architecture design only; Patrick needs to acquire Stripe Terminal hardware separately.

---

## What Was Completed This Session

- ✅ Dockerfile.production: restored `--frozen-lockfile` (commit b82180d)
- ✅ Sprint 1 — AI Sale Description Writer (commit 7b1b71d):
  - `cloudAIService.ts`: `SaleDescriptionInput`, `generateSaleDescription()`, `isAnthropicAvailable()`
  - `saleController.ts`: `generateSaleDescriptionHandler` (title required, max 300 chars, 503 guard)
  - `routes/sales.ts`: `POST /api/sales/generate-description`
  - `create-sale.tsx` + `edit-sale/[id].tsx`: ✨ Generate button
- ✅ Sprint 2 — Social Post Generator wire-up (commit 982dd6e):
  - `socialPostController.ts`: prisma singleton, AuthRequest, ANTHROPIC_MODEL env var, API key guard
  - `index.ts`: registered `/api/social-post` route (was completely orphaned)
  - `dashboard.tsx`: SocialPostGenerator integration with 📣 Share button + modal

---

## Environment Notes

- All changes from this session are committed and pushed. Patrick confirmed push successful.
- No pending migrations — Neon is at 62 migrations, last: `20260307000038_add_organizer_website`.
- Dockerfile.production is clean (`--frozen-lockfile` restored).
- Patrick's 5 manual beta blockers remain open (Stripe business account, Search Console, business cards, organizer outreach, Neon credential rotation).

---

## Exact Context for Sprint 3 (Shopper Loyalty Program)

Schema state (read `/packages/database/prisma/schema.prisma`):
- No `Coupon` model exists — migration required.
- `Purchase` model has `userId`, `itemId`, `saleId`, `amount`, `status`.
- `User` has `shopperCredits Float @default(0)` — already exists (added in batch 17 for referral credits).
- Email: use Resend via pattern in `stripeController.ts` (`buildEmail` from `emailTemplateService.ts`).
- Purchase completion hook is in `stripeController.ts` `webhookHandler` → `payment_intent.succeeded` block — this is where coupon issuance should be triggered (alongside the existing receipt email send).

Key files for Sprint 3:
- `packages/database/prisma/schema.prisma` — add Coupon model
- `packages/backend/src/controllers/stripeController.ts` — hook coupon issuance into `payment_intent.succeeded`
- `packages/backend/src/services/emailTemplateService.ts` — reuse `buildEmail()`
- New: `packages/backend/src/controllers/couponController.ts`
- New: `packages/backend/src/routes/coupons.ts`
- `packages/frontend/pages/shopper/purchases.tsx` — show available coupons
- `packages/frontend/pages/items/[id].tsx` or checkout — coupon redemption field

For Sprint 4 (Search by Item Type):
- Existing browse: `packages/frontend/pages/index.tsx`
- `packages/backend/src/controllers/saleController.ts` — check for existing search endpoint
- Item model has `category`, `condition`, `title` — all searchable without migration
- May need DB indexes: `@@index([category])`, `@@index([status, saleId])` on Item

For Sprint 5 (Seller Performance Dashboard):
- `packages/backend/src/services/organizerAnalyticsService.ts` already has `getOrganizerWeeklyStats()` — good foundation
- New endpoint needed: `GET /api/sales/analytics` (authenticated organizer)
- New frontend page: `packages/frontend/pages/organizer/analytics.tsx`
- Check `packages/frontend/package.json` for chart library (recharts likely installed)

## Subagent Invocation Pattern

```
Skill("findasale-architect") with prompt:
  "Design [Feature Name] for FindA.Sale. [Context]. Read these files first: [paths].
   Produce: schema changes, API contract, frontend touchpoints, files to modify."

→ After Architect returns spec:

Skill("findasale-dev") with prompt:
  "Implement [Feature Name] per this spec: [paste spec]. Read current file state first.
   Write diffs only — no full rewrites. Stage for: packages/database, packages/backend,
   packages/frontend."

→ After Dev returns diffs:

Skill("findasale-qa") with prompt:
  "QA review for [Feature Name]. Changes: [list files]. Spec: [paste spec].
   Check: TypeScript correctness, route ordering, prisma singleton, AuthRequest usage,
   API key guards, migration needed?"
```

Tell Patrick which files changed at end of each sprint so he can `git add` + `.\push.ps1`.
