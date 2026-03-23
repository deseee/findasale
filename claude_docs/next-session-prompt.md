# Next Session Prompt — S253

**Date:** 2026-03-23 (S252 complete, 30 files changed)
**Status:** All D-012-D-016 features live. 5 smoke test bugs fixed. Ready for QA verification before beta week concludes.

---

## FIRST TASK — Live Smoke Test of S252 Changes (Critical — Beta Week Active)

Run Chrome MCP against finda.sale. Verify all 30 files changed in S252 render correctly and features work end-to-end:
- **Wishlist pages:** /shopper/wishlist (3 tabs: Saved Items, Collections, Watching). Verify /shopper/favorites + /shopper/alerts redirect to /wishlist.
- **Notifications page:** /shopper/notifications (user11 has data to render).
- **Bids page:** /shopper/bids (user11 has 9 active bids to display).
- **Pricing page:** /pricing — verify support tier copy matches SIMPLE/PRO/TEAMS/ENTERPRISE spec exactly.
- **Settings/Profile pages:** Profile pages read-only (no edit buttons); Settings pages have all write controls.
- **CTA redirects:** All `/organizer/upgrade` → `/pricing`, all `/organizer/premium` → `/organizer/subscription`.
- **Double footers on shopper pages:** Loyalty, Collector Passport, Alerts, Trails, Bids pages should show ONE footer only (fixed in S252).

Log results. If any page fails, flag immediately and dispatch findasale-dev before proceeding.

---

## S253 Priority 1 — Organizer Double Footer Verification

Verify double footer fix applied to organizer pages also:
- `/organizer/inventory` (I2) — should show ONE footer
- `/organizer/sales` (S3) — should show ONE footer

If still duplicated, dispatch findasale-dev with same Layout wrapper fix that worked for shopper pages.

---

## S253 Priority 2 — Dashboard Tabs Verification

User dashboard tabs (Favorites, Subscribed, Purchases, Pickups) should be responsive + switchable via Chrome MCP. S252 dispatched tab-switching fix (router.push + hash). Verify it works live.

---

## S253 Priority 3 — Carry-forward Decisions

**Carry-forward if time allows (low priority):**
- Message reply E2E test (D1 from friction audit) — still pending browser verification
- Full-product dark mode pass (may be deferred to S254)

---

## Test Accounts (Live on Neon)

All password: `password123`
- `user1@example.com` — ADMIN + SIMPLE organizer
- `user2@example.com` — PRO organizer (Stripe connected)
- `user3@example.com` — TEAMS organizer (Stripe connected)
- `user11@example.com` — Shopper with full activity history (9 bids, 6 purchases, wishlists, follows, notifications)

---

## Context Loading

- Read `claude_docs/STATE.md` — S252 completion summary, S253 priorities
- Reference S252 file list: 30 files changed (wishlist pages, notifications, bids, pricing, settings/profile, CTA consolidation)
- Beta week active: Every broken page costs credibility with real testers. QA pass mandatory before Patrick's user testing week concludes.
