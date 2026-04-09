# Patrick's Dashboard — April 9, 2026 (S427)

## ✅ Done This Session

- **Multi-source POS cart implemented** — cashier can search shopper by email, load their held item(s) into POS cart, add misc items, and send a combined invoice link
- **Cart-only invoice** — works without any hold (misc items only)
- **QUICK/TRUST invoice modes** — 15-min default (QUICK) or organizer-set hours (TRUST) with amber warning at ≥24h
- **Cash split on invoice** — enter cash received at POS, modal shows "Cash Collected / Remaining to Charge on invoice"
- **Cancel Hold** — red button on loaded hold card cancels the reservation
- **Invoice preview** — shows all line items + total before sending

## 🔴 Action Required — Push S427 + Run Migrations

Push block at bottom. **2 migrations required** after push.

## 🐛 3 Bugs Found in Live Testing — Next Session

1. **Duplicate item in invoice preview** — held item appears twice (once as Hold line, once as misc cart item). Total is wrong.
2. **Shopper's app cart not merged in** — when you load a hold by email, only the held item comes in. The shopper's other in-app cart items (Console Table, Oil Painting, etc.) don't appear.
3. **Dark mode hold card** — loaded hold card has white/light background in dark mode.

These are P0/P1 and will be the first dispatches next session.

---

## 🚨 Action Required Right Now — S425 Migration

The S425 schema change (removing unique constraint on Purchase.stripePaymentIntentId) requires a migration:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## What Happened This Session (S425)

**POS payment bug sprint — 7 bugs fixed.**

- **Card Reader "Failed to create Terminal payment intent" 500 fixed** — a multi-item cart creates one Purchase row per item, all sharing the same PaymentIntent ID. The old `@unique` constraint on `stripePaymentIntentId` blocked the second row (Prisma P2002 error). Removed the constraint, added a regular index.
- **QR/Card Reader button amounts now show immediately** — split balance (`cartTotal - cashReceived`) is computed before the user clicks anything, so the Stripe QR and "Charge $X" buttons always show the right card amount even before QR generation.
- **Wrong survey fixed** — "You used online checkout!" (OG-4) was firing after POS card and cash payments. Now fires "An item sold" (OG-3).
- **Mark Sold no longer shows to non-owners** — the button was visible to any organizer-role user on any item page. Now checks `user.id === item.sale.organizer.userId`.
- **POS Invoice button unblocked** — holds are created as PENDING, but the invoice lookup was only looking for CONFIRMED holds. Fixed to include both states.
- **Railway + Vercel build failures fixed** — removing @unique cascaded to 5 Prisma calls in stripeController.ts (findUnique → findFirst/updateMany). Vercel failed because the organizer type in [id].tsx was missing the `userId` field that the backend already returned.

**New bug found (next session):** Send Invoice tile + modal shows `$0.18` for `$18.00` item. Price field formatting issue to investigate.

---

## What Happened This Session (S424)

**POS payment popup fully working + dual-role shopper access fixed.**

- Popup now fires for organizer accounts (was blocked for ORGANIZER role — Bob Smith is organizer+shopper)
- False "PAID" flash fixed when cashier cancels or shopper declines
- Split payment shows amber box with cash/card breakdown in popup
- 4 dual-role access components fixed: reviews, reputation page, nudge bar, feedback surveys

---

## Audit Alerts (from S423 weekly audit — still current)

### HIGH — D-006 Violation: Items section buried below Map + Reviews
Sale detail pages: Reviews (top) → Map → Items (bottom). D-006 requires Items first. Conversion blocker.
**Action:** Dispatch findasale-dev to reorder sections in `pages/sales/[id].tsx`

### HIGH — D-004 Violation: Mobile nav broken at 375px
No hamburger menu. "Host a Sale" button wraps to 3 lines. Unusable on phones.
**Action:** Dispatch findasale-dev to build mobile hamburger nav

### HIGH — Lucky Roll API 404 (S420 Batch 2 not pushed)
`/shopper/lucky-roll` fails with backend returning HTML instead of JSON. Migration not run.
**Action:** Push S420 Batch 2 (block below) then run migration

---

## Patrick Action Items

- [ ] **Run S425 migration** (see block above — unblocks multi-item card reader payments)
- [ ] **Configure Stripe Connect webhook** (unblocks items marked SOLD after POS payment)
  - Stripe Dashboard → Developers → Webhooks → Add endpoint
  - URL: `https://backend-production-153c9.up.railway.app/api/webhooks/stripe`
  - Listen to: **Events on Connected accounts**
  - Event: `payment_intent.succeeded`
  - Copy signing secret → Railway env var `STRIPE_CONNECT_WEBHOOK_SECRET`
- [ ] **Push S420 Batch 2** (if not done):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/database/prisma/schema.prisma
git add "packages/database/prisma/migrations/20260408_add_xp_sinks_showcase_mappin/migration.sql"
git add packages/backend/src/services/xpService.ts
git add packages/backend/src/controllers/trailController.ts
git add packages/backend/src/routes/users.ts
git add packages/frontend/pages/shopper/hunt-pass.tsx
git add claude_docs/feature-notes/ADR-guild-crew-creation-S420.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat(S420): XP sinks (custom map pin, showcase slots, treasure trail sponsor) + guild/crew ADR"
.\push.ps1
```

---

## Investor Verdict (S416 — still current)

🟡 **YELLOW — Don't invest today. Here's what changes that:**
- Product: extraordinary for a solo AI-assisted build.
- **Fatal gap: zero paying customers, zero transactions.**
- **What changes it to GREEN:** 5 recurring organizers + any real transaction. List your own eBay inventory first.

---

*Updated S425 — 2026-04-09*
