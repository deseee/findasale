# Patrick's Dashboard — S598 ✅ COMPLETE

## Status: Scheduled task audit + FAQ fixes + 5 parallel dispatches. All pushed.

---

## S598 Summary

**Scheduled task audit** — read all 14 task session transcripts from the past 2 weeks. Findings dispatched.

**FAQ fixes (live after push):**
- Platform fee now says "SIMPLE=10%, PRO/TEAMS=8%" instead of flat 10%
- "How do Auto Tags work?" — grammar fixed
- POS cash description no longer says "recorded manually"

**Decision locked:** "Wishlist" is the canonical name everywhere user-facing. Code internals (isFavorite, /api/favorites, DB fields) unchanged.

**5 parallel dispatches — all shipped:**
1. Dark mode modals: 8 components now have `dark:bg-gray-800`
2. Mobile overflow: admin/items + shopper/history page wrappers
3. Backend: findMany limits on 3 services; eBay/PriceCharting adapters now throw instead of silently failing
4. Error states: organizer dashboard + edit-sale show error UI on fetch failure
5. Wishlist rename: 16 occurrences across 10 files updated

---

## ⚡ Do This Now

Nothing blocking — Patrick already pushed the S598 batch.

Push the wrap docs:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "wrap: S598 — scheduled task audit, FAQ fixes, dark mode modals, overflow, wishlist rename, error states"
.\push.ps1
```

---

## Pending Patrick Actions

| Action | Why | Blocking? |
|--------|-----|-----------|
| dev-environment skill Neon URL fix | Flagged 4x by power user sweep — Neon is decommissioned S264, skill still has old URL | No — but next session |
| Competitor monitor Apr 23 content | Blog brief + social post + 3 subject lines generated, never used | No |
| Label composer QR-free layout | Small Avery labels (60-70/sheet ≈ 1"×1-5/8") can't reliably scan QR — add text-only layout option | No |

---

## P1/P2 Bugs Still Pending Dev Dispatch

| Bug | Notes |
|-----|-------|
| #75 Tier Lapse banner | Red + dismissible (spec: sticky amber). "Your Plan: PRO" card contradicts lapse message. Needs dev fix before beta. |
| #235 DonationModal URL | SettlementWizard.tsx line 68-72 fetches wrong route (`GET /api/sales/${id}/items?status=AVAILABLE` → 404). Correct: `/api/organizer/sales/${id}/unsold-items` |

---

## QA Queue

| Feature | Status | Notes |
|---------|--------|-------|
| S598 dark mode modals | Pending Chrome QA | 8 components |
| S598 mobile overflow | Pending Chrome QA | admin/items + shopper/history |
| S598 error states | Pending Chrome QA | dashboard + edit-sale |
| S598 Wishlist rename | Pending Chrome QA | visual scan across pages |
| S597 condition rating sync + FAQ merge | Pending Chrome QA | From S597 |
| Treasure hunt progress page | Pending Chrome QA | S595 carryover |
| ConfirmDialog smoke test | UNVERIFIED | Need deletable consignor/location |
| #278 Treasure Hunt Pro | Blocked | Needs Hunt Pass + live QR scan |
| #268 Trail Completion XP | Blocked | Karen's trail has 0 stops |
| #281 Streak Milestone XP | Blocked | Needs 5 real consecutive days |
| RankUpModal dark mode | Blocked | Can't trigger rank artificially |
| S529 mobile nav rank | Pending | Mobile viewport test |
| #52 Encyclopedia detail page | Pending | Railway redeploy d77cff42 |

---

## Carry-over

- **Advisory outreach:** 28 Gmail drafts queued. Send 1–2/day using patrick@finda.sale Send As alias.
- **eBay sync:** Click "Sync eBay Inventory" after S591 deploy to re-import 96 items with null ebayListingId.
