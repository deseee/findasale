# Patrick's Dashboard — S528 Complete

## What Shipped This Session

| Feature | Status | Notes |
|---------|--------|-------|
| Unified /coupons page | ✅ Live | Cross-role. Organizer (50 XP → $1-off) + Shopper (3 tiers: 100/200/500 XP). /organizer/coupons redirects there. |
| Per-sale analytics endpoint | ✅ Live | GET /api/insights/organizer/sale/:saleId now returns data |
| Categories HTML entities | ✅ Live | &amp; and other entities decode correctly in category names |
| Explorer Profile rename | ✅ Live | "Collector Passport" → "Explorer Profile". New URL: /shopper/explorer-profile. Old URL auto-redirects. |
| collectorTitle removed | ✅ Live | Deprecated and deleted from schema, backend, frontend. Migration deployed. |
| profileSlug XP gate | ✅ Live | First-time custom URL slug costs 1500 XP. Free to change after. |
| SettlementWizard fee label | ✅ Live | "Platform Fee (10%)" → shows organizer's actual rate (8% for PRO/TEAMS) |
| Onboarding card XP values | ✅ Live | Check-in: 2→5 XP. Purchase: 25→10 XP. |
| Platform fees | ✅ Locked | PRO=8%, TEAMS=8%. The "TEAMS should be 10%" bug entry was wrong. |

## Needs Chrome QA Next Session

- `/coupons` — log in as shopper, generate a coupon. Log in as organizer, generate a code.
- `/shopper/explorer-profile` — verify loads, nav shows "Explorer Profile", old /shopper/explorer-passport redirects
- Per-sale analytics — verify /organizer/sales/[id]/analytics returns data
- SettlementWizard receipt step — verify fee label shows 8% (not hardcoded 10%)
- Onboarding card — verify +5 XP and +10 XP values show correctly
- #235 DonationModal — charity close step in settlement wizard (live since S526, unverified)
- #224 rapid-capture — /organizer/rapid-capture → /organizer/sales redirect

## Known Issue

- `/organizer/insights` shows "failed to load" in browser — pre-existing, not caused by S528. Needs Railway log investigation next session.

## Key Decisions Locked This Session

- PRO and TEAMS both have **8% platform fee** — do not change
- collectorTitle is **gone** — do not rebuild
- profileSlug costs **1500 XP** first time, free after
- Coupons live at **/coupons** (not under /organizer or /shopper)
- Explorer Profile is the **permanent name** for what was Collector Passport

## Next Session Priorities

1. Investigate /organizer/insights runtime error (Railway logs)
2. Chrome QA the S528 features above
3. Chrome QA remaining S526 items (#235, #224, #270)

---

## ⚠️ Brand Drift Alert — 2026-04-21

**Weekly brand audit completed.** Two items fixed since last week (SharePromoteModal templates now dynamic ✅, subscription.tsx copy fixed ✅). But ~17 violations remain open.

**New finding this cycle: 12 modal components missing dark mode** — BidModal, BulkCategoryModal, BulkOperationErrorModal, BulkPhotoModal, BulkPriceModal, BulkStatusModal, BulkTagModal, CheckoutModal, HoldButton modal, HuntPassModal, ItemSearchResults card + skeleton, ActivityFeed — all show white in dark mode. Organizers using dark mode at night get blinded by these.

**Highest priority remaining (copy fixes — all string substitutions):**
- `pages/sales/[id].tsx:881` — Nextdoor share still hardcodes "estate sale" for all sale types (P1, 1-line fix)
- `pages/index.tsx:266,268,274,285` — all 4 homepage meta tags omit flea markets (P1)
- `pages/organizers/[id].tsx:84` — organizer profile meta says "Estate sales by..." (P1)

Full details: `claude_docs/audits/brand-drift-2026-04-21.md`

**Suggested dispatch:** One `findasale-dev` call for Batches 1–3+5 (~17 copy fixes), one separate call for Batch 4 (12 modal dark mode fixes).
