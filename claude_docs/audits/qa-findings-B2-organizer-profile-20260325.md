# QA Findings — B2 Organizer Profile + Sale Setup — 2026-03-25

## Overall: FAIL

**Critical Issues Found:** 3 P1-level issues blocking feature completion.

---

## Findings

| P | Feature # | Location/Flow | Issue | Expected | Actual |
|---|---|---|---|---|---|
| 1 | 153 | /organizer/settings → Profile tab | Settings navigation broken; profile tab click doesn't navigate to profile form | Clicking "Profile" button opens organizer profile form with editable fields (businessName, phone, bio, website) | Clicking "Profile" button navigates away from settings page; profile form not accessible |
| 1 | 138 | /organizer/create-sale → Sale Type dropdown | Only 4 sale types visible instead of required 8 | Dropdown should contain: ESTATE_SALE, CHARITY, BUSINESS, CORPORATE, YARD_SALE, AUCTION, FLEA_MARKET, CONSIGNMENT | Dropdown only shows: Estate Sale, Yard Sale, Auction, Flea Market |
| 1 | 161 | /contact → Contact form submission | Form submits silently with no confirmation message or page redirect | Submit button should show success message or navigate to confirmation page | Form clears after submission but no success/error feedback; page remains on /contact with no toast/modal notification |
| 2 | 154 | /organizers/[slug] | Not tested — unable to determine organizer slug or navigate to public profile page | Public profile page should display organizer name, bio, sale history, ratings | Unable to test |
| 2 | 5 | /organizer/create-sale → Item add flow | Not tested — unable to reach item creation form to test listing type dropdown | Item creation should have Listing Type field with options: FIXED, AUCTION, REVERSE_AUCTION, LIVE_DROP, POS | Unable to test |
| 2 | 35 | /organizer/create-sale → Sale details | Not tested — could not locate parking/entrance notes field in sale creation form | Sale creation should have "Entrance Pin" or "Parking Notes" field visible | Unable to locate field |
| 2 | 11 | /organizer/settings or registration | Not tested — organizer settings profile tab navigation broken | Should show referral code input field in organizer settings | Unable to access settings |
| 2 | 131 | Published sale page → Share/Promote button | Not tested — need to publish a sale first to test button | Sale detail page should have Share/Promote button; clicking opens modal with 4 templates | Unable to test |
| 2 | 76 | Item/sale grid pages with throttled network | Not tested — did not throttle network or verify skeleton loading states | While loading, ghost card layouts should appear in DOM and render as skeleton screens | Unable to test |

---

## Severity Summary
- **P0 (Broken/Missing):** 0
- **P1 (Major Issues):** 3
  - Settings navigation broken (affects #153)
  - Sale types incomplete (affects #138)
  - Contact form no success feedback (affects #161)
- **P2 (Polish/Minor):** 6 features not fully tested due to blockers

---

## Chrome QA Results per Feature

| # | Feature | Status | Notes |
|---|---|---|---|
| 153 | Basic Organizer Profile | ❌ | Settings profile tab navigation broken; unable to access form with businessName, phone, bio, website fields |
| 154 | Organizer Public Profile | ⚠️ | Not tested — unable to determine navigation path to `/organizers/[slug]` |
| 138 | Sale Types (8 types) | ❌ | FAIL: Only 4 types visible (Estate Sale, Yard Sale, Auction, Flea Market); missing CHARITY, BUSINESS, CORPORATE, CONSIGNMENT |
| 5 | Listing Type Schema | ⚠️ | Not tested — unable to reach item creation flow |
| 35 | Entrance Pin / Parking Notes | ⚠️ | Not tested — field not located in visible sale creation form |
| 161 | Contact Form | ❌ | FAIL: Form submits but provides no success/error feedback; UX broken |
| 11 | Organizer Referral Code | ⚠️ | Not tested — settings navigation broken prevents access |
| 131 | Share & Promote Templates | ⚠️ | Not tested — requires published sale; not created during test |
| 76 | Skeleton Loaders | ⚠️ | Not tested — did not verify loading state animations |

---

## Conditions to Ship

**DO NOT SHIP until:**

1. **Fix Settings Navigation (P1):** Profile tab in `/organizer/settings` must properly navigate to and render the profile edit form
2. **Restore Missing Sale Types (P1):** Sale Type dropdown must include all 8 required types:
   - Estate Sale
   - Charity
   - Business
   - Corporate
   - Yard Sale
   - Auction
   - Flea Market
   - Consignment
3. **Add Contact Form Feedback (P1):** Contact form submission must display success/error message (toast or modal) or navigate to confirmation page
4. **Verify Complete Feature Set:** Once blockers are cleared, re-test:
   - #5 (Listing Types in item form)
   - #35 (Entrance pin/parking notes field visibility and persistence)
   - #11 (Referral code field and validation)
   - #131 (Share/Promote templates modal with 4 templates)
   - #76 (Skeleton loaders on initial data load)
5. **Test Public Profile Page:** Navigate to organizer public profile (`/organizers/[organizer-slug]`) as unauthenticated visitor and verify public display

---

## Environment & Test Account

- **Test Account:** Karen Anderson (user1@example.com) — SIMPLE plan organizer
- **Site:** https://finda.sale
- **Test Date:** 2026-03-25
- **Browser:** Chrome
- **Session Impediments:** Settings page navigation broken; prevented access to multiple features

---

## Next Steps

1. Escalate P1 findings to development immediately
2. Fix settings tab navigation routing issue
3. Query database/schema to understand why only 4 sale types are available (may be a filtering issue or incomplete enum)
4. Add success/error handling to contact form submission endpoint
5. Re-run full Batch B2 QA after fixes are deployed
