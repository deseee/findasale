# Patrick's Dashboard — S578 Complete → S579 Bug Dispatch Next

## ✅ S578 Complete — Chrome QA Done

9 items verified. 6 pass, 2 partial, 1 fail. New P1 bugs found from Railway logs + QA. S579 dispatches all fixes.

---

## S578 Chrome QA Results

| # | Feature | Result | Notes |
|---|---------|--------|-------|
| 1 | Settlement payout | ✅ PASS | Receipt shows real amounts, no $0/$NaN |
| 2 | Shopify #332 TEAMS gate | ✅ PASS | Bob sees upgrade wall correctly |
| 3 | Stripe Connect #333 | ✅ PASS | Bob blocked, Alice consignors load |
| 4 | Voice-to-tag mic icon | ✅ PASS | Mic icon correct in RapidCapture + edit-item |
| 5 | Tier Lapse #75 | ⚠️ PARTIAL | Amber banner ✅, but dashboard still shows "Your Plan: PRO" (P2 visual bug) |
| 6 | DonationModal #235 | ❌ FAIL | P1 bug: wrong API URL in SettlementWizard → donation section never shows |
| 7 | Holds countdown | ⚠️ PARTIAL | Timer renders on item detail ✅, My Holds page broken (P1), Place Hold button end-to-end UNVERIFIED |
| 8 | PricingCompSummary #338 | ✅ PASS | Amber comp tile renders with 3 sources |
| 9 | Storefront widget S529 | ✅ PASS | Copy Link toast ✅, eye icon → public sale page ✅ |

---

## S579 Bug Dispatch Queue

### P1 Fixes (dispatch in parallel by file domain)

**Batch A — Frontend only (no backend):**
- `SettlementWizard.tsx` line 68-72: change `GET /api/sales/${saleId}/items?status=AVAILABLE` → `GET /api/organizer/sales/${saleId}/unsold-items`
- Payout confirmation card dark mode: white background, Recipient/Amount/Method values not rendering

**Batch B — Backend routes only:**
- `packages/backend/src/routes/reservations.ts`: add `GET /shopper` route returning current shopper's active reservations with item + sale details
- `GET /api/api/items/:id/similar` → 404: fix double `/api/api/` prefix bug
- `GET /api/items/:id/ebay-comps` → 500: fix backend error (Railway logs)
- `GET /api/items/:id/price-history` → 404: add missing route
- `GET /api/workspace` → 404: add missing route or verify route registration
- `GET /api/brand-kit/organizers/me` → 404: add missing route
- `GET /api/locations` → 404 (firing on charity sale page, possibly discount-rules controller)
- `GET /api/discount-rules` → 403 on charity sale page (should be 200 or gracefully absent)

**Batch C — Tier Lapse P2:**
- Dashboard "Your Plan: PRO" shows despite `isLapsed=true` — find where the plan label renders and gate it on lapse state

---

## ⏳ Patrick Action Needed

None — no migrations, no manual steps. S579 can start immediately.

---

## S578 Wrap Push Block

```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S578: Chrome QA complete — 6 pass, 2 partial, 1 fail. New P1/P2 bugs logged for S579 dispatch."
.\push.ps1
```
