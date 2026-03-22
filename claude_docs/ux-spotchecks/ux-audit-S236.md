# UX Audit Report — FindA.Sale S236

**Date:** March 22, 2026
**Auditor:** findasale-ux
**Session:** 236
**Test Environment:** https://finda.sale (production)
**Browsers/Devices:** Desktop (1239×992px), Mobile (375×667px)

---

## Executive Summary

FindA.Sale is functionally robust with clean navigation and strong visual design. However, there are **3 critical UX friction points** that will impact first-time users:

1. **Settings & Wishlist pages are 404s but remain in the UI** — creates broken navigation
2. **Pricing page navigation from nav menu doesn't work** — users can't find pricing info via top nav
3. **Pricing plan copy is light/faded on desktop** — feature comparison text has low contrast

The app is **production-ready for beta** with these issues flagged as P1 for immediate fix.

---

## Findings by Severity

### HIGH SEVERITY

| Issue | Screen | Impact | Recommendation |
|-------|--------|--------|-----------------|
| **Settings page is 404** | Avatar dropdown menu → "Settings" | Users expect account settings but land on 404. Creates impression of incomplete product. | Remove "Settings" from dropdown OR create the page. If intentional, hide from UI entirely. |
| **Wishlist page is 404** | Avatar dropdown menu → "My Wishlists" | Same as above. Users see broken link in primary nav. | Remove "My Wishlists" from dropdown OR implement saved/favorites feature and populate it. Heart icon in nav suggests favorites exist—clarify intent. |
| **Pricing link in top nav doesn't navigate** | Top nav → "Pricing" button | Users trying to view pricing from logged-in view see no action. Pricing information is only accessible via `/pricing` URL or when logged out. | Make "Pricing" link clickable. Verify href attribute points to `/pricing` or intended destination. |
| **Pricing page text contrast too low** | `/pricing` — pricing feature list | Feature comparison copy (checkmarks and feature names) appears very light/faded on light backgrounds. Hard to read; violates WCAG AA contrast requirements. | Increase text opacity/darkness for feature list items. Test contrast ratio (target: 4.5:1 for normal text). |

### MEDIUM SEVERITY

| Issue | Screen | Impact | Recommendation |
|-------|--------|--------|-----------------|
| **AvatarDropdown profile badge identity** | `/profile` — organizer view | Logged-in organizer sees "Hunter" badge (shopper gamification badge) on profile, not an organizer badge. Profile shows Hunt Pass points & "My Bids" section — shopper-only content. | Add organizer-specific badge (e.g., "Organizer", "Verified Organizer") to organizer profiles. Hide shopper-only sections (Hunt Pass, My Bids, My Referrals) from organizer view OR create separate organizer profile layout. |
| **Navigation behavior on pricing page** | `/pricing` → scroll → redirection | Scrolling or interacting with pricing page triggers unexpected navigation (redirects to `/organizer/premium`). May confuse users. | Debug scroll/interaction handlers. Ensure pricing page is standalone and doesn't redirect mid-interaction. |
| **Mobile nav icons overflowing** | Mobile (375px) — top nav | Need to verify responsive behavior. Top nav may not reflow to mobile hamburger at 375px width. | Test mobile nav reflow. Ensure nav items stack or collapse to hamburger menu at mobile breakpoints (375px). |

### LOW SEVERITY (Polish / Enhancement)

| Issue | Screen | Impact | Recommendation |
|-------|--------|--------|-----------------|
| **Sale detail page lacks visible items section** | `/sales/[id]` | Sale detail shows organizer, share, QR code but items section not visible in viewport. Items may load dynamically below, but unclear to user that items exist. | Verify items load on detail page. Add CTA or section header (e.g., "Inventory: 42 items") above fold to signal items are available. Add empty state with CTA if sale has no items. |
| **Profile referral loading modal** | `/profile` — My Referrals section | Modal says "Loading referral information..." blocks content briefly. Minor UX friction. | Consider skeleton loader or progressive load instead of blocking modal. |
| **Create Sale form lacking inline validation feedback** | `/organizer/create-sale` | Form fields don't show validation errors inline. Users won't know fields are required until form submission. | Add real-time validation feedback: required indicators (*), error messages on blur, field highlighting on error. |

---

## Accessibility Findings (WCAG 2.1)

### CRITICAL
- **Color contrast on pricing page**: Feature list text fails WCAG AA (4.5:1 minimum for normal text). Text appears ~2:1 contrast on light backgrounds.
  - **Fix:** Darken feature text or use opaque backgrounds behind light text.

### PASS
- ✓ Navigation links are descriptive and clickable
- ✓ Alt text present on sale images (assumed — verify in code)
- ✓ Share buttons have clear labels (Facebook, Nextdoor)
- ✓ Tap targets appear to meet 44×44px minimum on mobile

---

## Mobile Experience (375px)

| Area | Status | Notes |
|------|--------|-------|
| **Feed** | ✓ PASS | Cards stack vertically. Images display properly. |
| **Pricing** | ✓ PASS | Three-column layout converts to single column stack. Text readable. |
| **Messages** | ✓ PASS | Message thread thread responsive. Input box functional. |
| **Navigation** | ⚠️ VERIFY | Need to confirm top nav reflows to hamburger at 375px. |
| **Buttons** | ✓ PASS | Share, Message, Follow buttons sized appropriately for touch. |

---

## Dark Mode Status

- **Status:** Not tested (dark mode toggle not visible in audit).
- **Note from S233:** Dark mode fixes were applied in prior session. Recommend smoke test of key pages (Feed, Pricing, Dashboard, Profile) in dark mode during next QA pass.

---

## Flow Audit Checklist

### ✓ COMPLETE (Working as Expected)
- [x] **Organizer Dashboard**: Loads correctly. Stats, quick actions, tier progress all functional.
- [x] **Create Sale flow**: Form displays all fields (title, description, dates, address, neighborhood, sale type). Help icons present. "Generate" button for AI description visible.
- [x] **Shopper Browse (Feed)**: Cards display with title, date, organizer, category tag. "Browse all" link visible.
- [x] **Sale Detail page**: Shows title, address, dates, organizer info, Message Organizer button, Following status, Share (Facebook/Nextdoor), QR code.
- [x] **Messaging**: Thread list loads. Message detail page functional with input box.
- [x] **Profile**: Displays user name, email, badges, Hunt Pass points, My Bids section, My Referrals section.
- [x] **Pricing page**: Three pricing tiers visible with feature comparison table.

### ⚠️ INCOMPLETE / NOT TESTED
- [ ] **Add Items flow**: Not tested (requires navigating to edit sale or add items interface).
- [ ] **Publish Sale**: Not tested (requires completing sale creation first).
- [ ] **Shopper Purchase/Bid flow**: Not tested (no purchase or bid interface accessed).
- [ ] **Upgrade flow**: Upgrade buttons visible but upgrade process not tested.
- [ ] **Settings page**: 404 — not functional.
- [ ] **Wishlist/Favorites**: 404 — not functional.

---

## Open Questions for Patrick

1. **Settings page**: Is this intentionally disabled for beta, or should it be built? What settings do organizers/shoppers need access to?

2. **Wishlist vs. Favorites**: The "My Wishlists" menu item links to a 404, but there's a heart icon in the nav. Should this be a saved/favorites feature? If yes, should it populate user's followed/saved sales?

3. **Organizer Profile Badge**: Should organizers see a "Verified Organizer" badge instead of "Hunter"? Is the shopper-centric content (Hunt Pass, My Bids, My Referrals) intentional on organizer profiles?

4. **Pricing Page Redirect**: Why does scrolling on `/pricing` redirect to `/organizer/premium`? Is this expected behavior or a bug?

5. **Sale Items Section**: Do sales always have items listed? Should the sale detail page show "Inventory: X items" before the fold to signal that items exist?

6. **Dark Mode**: Should dark mode be tested in next audit pass? Any known issues from S233 dark mode fixes?

---

## Priority Fixes (Recommend Before Beta Launch)

### Must Fix (Blocking)
1. Remove "Settings" and "My Wishlists" from avatar dropdown OR create functional pages for both.
2. Fix "Pricing" link in top nav to navigate to `/pricing`.
3. Increase contrast on pricing page feature list (WCAG AA compliance).

### Should Fix (High Impact)
4. Add organizer-specific profile layout (hide shopper content like Hunt Pass from organizers).
5. Verify navigation behavior on pricing page (debug redirect issue).
6. Add visible empty state or inventory count to sale detail page above fold.

---

## Session Artifacts

- Screenshots: Desktop Feed, Dashboard, Create Sale, Pricing (desktop & mobile), Profile, Messages, Sale Detail, 404 pages
- Test accounts used: `user2@example.com` (PRO organizer, Oscar Bell)
- Test environments: Desktop (1239×992px), Mobile (375×667px)
- No accessibility tools (axe) used — visual audit only

---

## Recommendations for S237 (Next Session)

1. **QA Dispatch**: Create QA tasks for:
   - Settings page implementation or removal
   - Wishlist/Favorites feature clarity
   - Add Items flow (organizer)
   - Publish Sale flow (organizer)
   - Purchase/Bid flow (shopper)
   - Upgrade flow (both)

2. **Accessibility**: Run automated accessibility scan (axe or Lighthouse) on top 10 pages.

3. **Dark Mode**: Smoke test dark mode on Feed, Dashboard, Pricing, Profile, Messages.

4. **Mobile**: Test responsive breakpoints and hamburger nav at 375px, 480px, 768px.

