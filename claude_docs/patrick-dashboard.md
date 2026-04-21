# Patrick's Dashboard — S529 Complete

## What Shipped This Session

| Feature | Status | Notes |
|---------|--------|-------|
| Storefront widget | ✅ Pending push | Organizer dashboard now shows your storefront URL with Copy Link + View Storefront buttons |
| Avatar dropdown rank | ✅ Pending push | Compact inline icon+label+XP bar — replaces the oversized RankBadge. Initiate shows compass, others show emoji |
| Mobile nav rank | ✅ Pending push | Was hardcoded "⚔️ Scout" with static 40% bar. Now reads real rank + XP from API. MI shows Initiate correctly. |
| Card reader content | ✅ Pending push | FAQ, organizer guide, and support pages updated: S700 + S710 only. No Tap to Pay (PWA limitation). |

## Needs Chrome QA Next Session

**S529 (new):**
- Organizer dashboard — storefront widget shows correct URL, Copy Link copies it, View Storefront opens correctly
- Avatar dropdown — rank shows compact (small icon + label), XP bar renders
- Mobile nav — rank shows real value (Initiate for user MI), XP bar accurate

**S528 (carry-over):**
- `/coupons` — log in as shopper, generate a coupon. Log in as organizer, generate a code.
- `/shopper/explorer-profile` — verify loads, nav shows "Explorer Profile", old /shopper/explorer-passport redirects
- Per-sale analytics — verify /organizer/sales/[id]/analytics returns data
- SettlementWizard receipt step — verify fee label shows 8% (not hardcoded 10%)
- Onboarding card — verify +5 XP and +10 XP values show correctly
- #235 DonationModal, #224 rapid-capture (live since S526, unverified)

## Known Issue

- `/organizer/insights` shows "failed to load" in browser — pre-existing. Needs Railway log investigation.

## Next Session Priorities

1. Push S529 changes (push block below)
2. Investigate /organizer/insights runtime error (Railway logs)
3. Chrome QA S529 + S528 features above

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
