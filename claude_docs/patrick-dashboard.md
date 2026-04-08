# Patrick's Dashboard — April 8, 2026 (S415)

---

## What Happened This Session (S415)

**Full tech debt audit completed.** Scanned all 821 files across the monorepo and scored 12 debt items using a priority formula. Full report saved to `claude_docs/research/tech-debt-audit-s413.md`. Phase 3 (structural refactors) is deferred until post-beta.

**Phase 1 quick wins shipped (inline):**
- Stripe price IDs were hardcoded in 6 places in `stripeController.ts` — now use env vars (lower billing bug risk)
- `fraudDetectionJob` was imported but the cron was commented out — now actually runs daily at 2AM
- Monday 8AM email collision fixed — organizer weekly digest shifted to 9AM (was fighting curator digest for Resend bandwidth)
- `healthController` and `viewerController` missing try/catch — added
- `.env.example` updated with 13 missing vars that production actually requires

**Phase 2 sprints shipped (5 parallel agents):**
- **Auction cron dedup:** Found two cron jobs both firing every 5 minutes to close auctions. `auctionCloseCron.ts` was missing reserve price validation, XP awards, and Stripe PaymentIntents — deprecated it. `auctionJob.ts` is now the only auction closer.
- **Zod validation:** 5 backend routes that used manual `if (!field)` checks now use proper Zod schemas (contact, auth, organizers, items, search).
- **next/image migration:** 9 components/pages migrated from raw `<img>` tags to Next.js `<Image>` — improves Core Web Vitals and Vercel image optimization.
- **Condition constants centralized:** `lib/itemConstants.ts` created with 4 canonical DB condition values. 3 components that each had their own local definitions now import from one place.
- **Account deletion implemented:** `DELETE /api/users/me` backend endpoint + settings.tsx frontend wired. Confirmation modal, password verification, Stripe subscription cancel on organizer delete. ⚠️ Needs QA before beta users can reach it.

**Two TypeScript errors caught and fixed before wrap:**
- `add-items/[saleId].tsx` — `import Image from 'next/image'` was shadowing the native browser `Image()` constructor used in the canvas enhancement pipeline. Aliased to `NextImage`.
- `search.ts:83-84` — Zod optional values are `undefined` not `null`; fixed `!== null` to `!= null`.

---

## Full Push Block (S415 — this session only)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/jobs/fraudDetectionJob.ts
git add packages/backend/src/jobs/organizerWeeklyDigestJob.ts
git add packages/backend/src/controllers/healthController.ts
git add packages/backend/src/controllers/viewerController.ts
git add packages/backend/.env.example
git add packages/backend/src/index.ts
git add packages/backend/src/jobs/auctionCloseCron.ts
git add packages/backend/src/routes/contact.ts
git add packages/backend/src/routes/auth.ts
git add packages/backend/src/routes/organizers.ts
git add packages/backend/src/routes/items.ts
git add packages/backend/src/routes/search.ts
git add packages/backend/src/controllers/userController.ts
git add packages/backend/src/routes/users.ts
git add packages/frontend/components/HaulPostCard.tsx
git add packages/frontend/components/HighValueTrackerWidget.tsx
git add packages/frontend/components/InstallPrompt.tsx
git add packages/frontend/components/SaleQRCode.tsx
git add "packages/frontend/pages/organizer/add-items/[saleId].tsx"
git add packages/frontend/pages/organizer/dashboard.tsx
git add "packages/frontend/pages/organizer/print-kit/[saleId].tsx"
git add packages/frontend/pages/profile.tsx
git add packages/frontend/pages/shopper/history.tsx
git add packages/frontend/pages/shopper/settings.tsx
git add packages/frontend/lib/itemConstants.ts
git add packages/frontend/components/camera/PreviewModal.tsx
git add packages/frontend/components/SmartInventoryUpload.tsx
git add "packages/frontend/pages/organizer/add-items/[saleId]/review.tsx"
git add claude_docs/research/tech-debt-audit-s413.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S415: tech debt audit + phase 1+2 quick wins (30 files)

Phase 1 inline: stripe price IDs to env vars, fraudDetectionJob wired to
cron, email job timing collision fixed, try/catch on bare controllers,
.env.example synced with 13 missing vars.

Phase 2 parallel agents: auction cron dedup (auctionCloseCron deprecated),
Zod validation on 5 routes, next/image migration (9 files), condition
constants centralized to lib/itemConstants.ts, account deletion implemented.

Post-agent TS fixes: NextImage alias (native Image constructor conflict),
search.ts undefined vs null for Zod optional values."
.\push.ps1
```

---

## Action Items for Patrick

- [ ] **Run the push block above** (includes S415 changes)
- [ ] **QA account deletion before beta** — dispatch `findasale-qa` to test DELETE /api/users/me (OAuth user, email user, organizer with Stripe sub)
- [ ] **Previous carryover still pending:**
  - Complete eBay keyset activation (developer.ebay.com → Alerts & Notifications → endpoint + token)
  - Set Railway env var: `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831`
  - Stripe seat product ($20/mo team member seat)

---

## Decisions Needed from Patrick

**Map MVP dispatch?** Treasure Trails badge on map pins + Start-from-my-location route planning. Full spec in `claude_docs/feature-notes/map-enhancements-ux-spec.md`. Both ready to dispatch.

---

## What's Coming (S416)

Options in priority order:
1. QA pass on account deletion + S412/S413/S414 smoke test (admin dropdown, newly unblocked pages, shopper reputation, eBay picker)
2. Map features dispatch (Treasure Trails badge + Start from location)
3. Phase 3 tech debt (post-beta: controller decomposition, route refactoring, test coverage for critical paths)

---

## What's Blocked Until Real Camera / Test Data

- ValuationWidget — TEAMS user with a draft item in review page
- Treasure Trails check-in — organizer must create a trail first
- Review card redesign — need camera-captured item in DRAFT state
- Camera thumbnail refresh — real device required
- POS QR scan — real device required

*Updated S415 — 2026-04-08*
