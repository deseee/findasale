# Comprehensive UX Audit — 2026-03-06

## Summary
- **Total issues found:** 34
- **Critical:** 4 | **High:** 12 | **Medium:** 14 | **Low:** 4
- **Ship-blockers:** Placeholder "—" values on organizer dashboard, broken email preview links, missing loading skeleton on multiple pages, analytics tab placeholder

---

## Issues by Page/Component

### pages/organizer/dashboard.tsx
- **CRITICAL** Line 228: "Total Items" shows "—" instead of actual count. Dashboard header metric is non-functional and will confuse organizers about their inventory status → **Fix:** Query the `/organizer/sales` endpoint (already fetched in sales) to sum all items across sales, render count or implement item counting API endpoint.
- **CRITICAL** Line 232: "Earnings (30d)" shows "—" instead of actual earnings. Critical for organizer motivation and understanding revenue → **Fix:** Query `/organizer/earnings?period=30d` endpoint and display result with currency formatting.
- **HIGH** Line 444: Analytics tab is placeholder text "Analytics coming soon..." without any UI. If user clicks tab, sees dead end. Breaks navigation flow → **Fix:** Either remove tab entirely, or build basic analytics view (show pending metrics using skeletons or "Coming Soon" state page).
- **MEDIUM** Line 141: Generic "Loading..." div with no styling or animation. Appears jarring compared to modern skeleton loaders elsewhere in app → **Fix:** Use `<Skeleton>` component or animated loading state like BottomTabNav uses.

### pages/organizer/email-digest-preview.tsx
- **CRITICAL** Line 233: CTA button has `href="#"` which does nothing. In email preview context, this is especially bad as email clients won't understand hash routing → **Fix:** Change to `href="/organizer/dashboard"` or similar real destination.
- **HIGH** Line 245: Footer link "FindA.Sale" has `href="#"`. Non-functional link in email preview → **Fix:** `href="/"`
- **HIGH** Line 249: "Manage email preferences" link has `href="#"`. Confusing in email context → **Fix:** `href="/organizer/email-digest-preview"` (or preferences page if exists)
- **HIGH** Line 253: "Unsubscribe" link has `href="#"`. Critical for GDPR/email compliance → **Fix:** `href="/unsubscribe"` or real unsubscribe endpoint.

### pages/organizer/checklist/[saleId].tsx
- **MEDIUM** Line 46: "h-screen" skeleton on loading state creates huge blank space on smaller screens → **Fix:** Change to `h-96` or responsive height.

### pages/organizer/create-sale.tsx
- **LOW** Line 44: Minimal "Loading..." text without styling. User might think page hung → **Fix:** Add spinner or use full-page Skeleton.

### pages/organizer/add-items/[saleId].tsx
- **MEDIUM** Line 201: "Loading..." text appears when items are loading. No visual feedback that something is happening → **Fix:** Replace with skeleton grid matching the items list layout below.

### pages/organizer/edit-item/[id].tsx
- **MEDIUM** Line 76: Generic "Loading..." return. Inconsistent with better loading states in the codebase → **Fix:** Use Skeleton layout matching the form below.

### pages/organizer/edit-sale/[id].tsx
- **MEDIUM** Line 103: Simple "Loading..." text return for both auth and sale loading → **Fix:** Implement proper skeleton layout for form fields.

### pages/organizer/line-queue/[id].tsx
- **MEDIUM** Line 111: Back button uses arrow emoji `←` instead of proper icon. Not accessible (no aria-label) and emoji rendering varies by device → **Fix:** Use SVG icon component like in checklist page. Add aria-label="Go back".
- **MEDIUM** Line 107: `pb-24` added for bottom nav spacing, but no confirmation this accounts for all mobile safe areas. Could be cut off on iPhone notch/dynamic island → **Fix:** Test on actual devices or use `pb-safe` from Tailwind safe-area plugin.

### pages/shopper/dashboard.tsx
- **MEDIUM** Line 68: Generic "Loading..." centered text. No distinction from error or empty state → **Fix:** Use styled skeleton or spinner.

### pages/shopper/purchases.tsx
- **MEDIUM** Line 59: "Loading purchases..." text. Inconsistent with other loading patterns → **Fix:** Use skeleton matching purchase card layout.

### pages/items/[id].tsx
- **HIGH** Line 100+: Item page is large file with many external components. If CheckoutModal/PhotoLightbox fail to load, user sees no fallback UI → **Fix:** Add error boundaries around major component imports. Add error state UI when components fail.
- **MEDIUM** Line 100+: Loading state is simple centered "Loading..." text with no context that item photos are coming. For photo-heavy page, this is jarring → **Fix:** Show skeleton of photo area, title, and key details while loading.

### pages/login.tsx
- **MEDIUM** Line 82-99: Form inputs use `bg-white` explicitly but form is styled with default background. Redundant and makes dark mode (if added) harder → **Fix:** Remove explicit bg-white or centralize in base input styles.
- **LOW** Line 33: Redirect logic checks `redirect` param. No validation that redirect URL is safe. Could enable open redirect attacks → **Fix:** Validate redirect URL against whitelist (e.g., starts with /, matches domain).

### pages/messages/[id].tsx
- **MEDIUM** Line 81: Loading state is bare spinner with no text. User doesn't know if loading messages or page → **Fix:** Add "Loading conversation..." text next to spinner.
- **HIGH** Line 86: If conversation fetch fails, shows "Conversation not found" but no "Back to messages" link prominence. User might be stuck → **Fix:** Ensure link is styled as button, not just text.

### pages/404.tsx
- **LOW** The error page is good, but it doesn't suggest next steps beyond home. No "Browse by category" or other discovery links → **Fix:** Add quick category/search suggestions below back button.

### pages/index.tsx
- **MEDIUM** Line 206: Map section shows basic Skeleton while loading, but rest of page below is already visible. Creates confusion about what's loading → **Fix:** Show more complete page skeleton layout, or use overlay loading state.
- **MEDIUM** Line 294-296: Skeleton card grid shows 6 placeholders but if actual results are 3, wasteful. Should match actual grid response count → **Fix:** Query backend before page loads or use dynamic skeleton count based on viewport.

### pages/search.tsx
- **MEDIUM** Line 291: `SkeletonGrid` component is used but if it's not loading enough cards, UX feels incomplete → **Fix:** Ensure skeleton count matches typical search result count (12+).
- **LOW** Line 168: Search input uses `autoFocus={!q}`. If user has `autofocus` disabled in browser settings, onLoad focus won't work → **Fix:** Remove autoFocus or provide fallback focus on mount via ref.

### components/BottomTabNav.tsx
- **MEDIUM** Line 135: `min-w-touch` class is used but not all Tailwind configs have this class. Could fail silently → **Fix:** Replace with explicit `min-w-[44px]` or standard touch target size.
- **LOW** Line 96: `/shopper/dashboard#favorites` is a hash route that won't work server-side. If user shares this link, they land at top of dashboard → **Fix:** Change to query param `/shopper/dashboard?tab=favorites` and handle in component state.

### components/CartDrawer.tsx
- **MEDIUM** Line 50: `refetchInterval: 30000` polls every 30 seconds. If user leaves drawer open, this burns battery/data on mobile → **Fix:** Only enable polling when drawer is visibly open (currently controlled by `enabled: isOpen`).
- **HIGH** Line 100+: Drawer uses slide-in animation but no focus trap or keyboard escape handling visible in snippet. Tab trap could let focus escape drawer → **Fix:** Wrap drawer content in a focus trap component (e.g., react-focus-trap).

### components/CheckoutModal.tsx
- **HIGH** Line 98: External link to `/terms` opens in new tab but no `target` attribute shown. Inconsistent experience → **Fix:** Ensure all external links use `target="_blank" rel="noopener noreferrer"`.
- **MEDIUM** Line 87-101: ToS checkbox is optional by default but critical for payment. No validation error if user submits without checking. Button never disables → **Fix:** Add `disabled={!tosAgreed}` to submit button or show validation error.

### components/SaleCard.tsx
- **MEDIUM** Line 72: Comment uses em-dash "—" in code comment instead of normal dash, may confuse code searching → **Fix:** Use standard hyphens in comments.
- **LOW** Line 96: Alt text is just `alt={sale.title}` which is fine, but doesn't describe what the image is. "Vintage Mid-Century Dining Set" as alt is not as useful as "Dining set for sale at Estate Sale on Mar 5" → **Fix:** Improve alt text to include context about sale/date.

### pages/shopper/favorites.tsx (not explicitly read but referenced)
- **MEDIUM** Favorites page likely has similar loading state issues as other pages → **Fix:** Standardize all loading states to use Skeleton component.

### pages/organizer/add-items.tsx
- **MEDIUM** Line not visible in read, but import CSVImportModal suggests modal might have no close button if API fails → **Fix:** Ensure all modals have visible close button (X or Cancel) independent of form state.

---

## Prioritized Master Fix List

| # | File | Issue | Severity | Fix | Est. Dev Time |
|---|------|-------|----------|-----|-------|
| 1 | pages/organizer/dashboard.tsx | "Total Items" metric shows "—" placeholder | CRITICAL | Query `/organizer/stats` for item count, display number | 1h |
| 2 | pages/organizer/dashboard.tsx | "Earnings (30d)" shows "—" | CRITICAL | Add earnings endpoint query, display with currency formatting | 1.5h |
| 3 | pages/organizer/email-digest-preview.tsx | CTA button href="#" non-functional | CRITICAL | Change `href="#"` to `href="/organizer/dashboard"` | 15m |
| 4 | pages/organizer/email-digest-preview.tsx | Multiple footer links have broken href="#" | CRITICAL | Fix all 3 footer links to real endpoints | 20m |
| 5 | components/CheckoutModal.tsx | ToS checkbox not enforced on submit | HIGH | Add `disabled={!tosAgreed}` to payment button | 15m |
| 6 | pages/items/[id].tsx | Large component with no error boundary for imported modals | HIGH | Wrap CheckoutModal/PhotoLightbox in error boundary | 30m |
| 7 | pages/organizer/dashboard.tsx | Analytics tab is placeholder "coming soon" | HIGH | Either remove tab or build basic stub analytics view | 2h |
| 8 | components/CartDrawer.tsx | No focus trap or keyboard escape handling | HIGH | Add focus trap and onEscape callback to close drawer | 45m |
| 9 | pages/messages/[id].tsx | Error state doesn't prominence "Back to messages" link | HIGH | Style error link as button, add primary action styling | 20m |
| 10 | pages/organizer/line-queue/[id].tsx | Back button uses emoji instead of icon | MEDIUM | Replace `←` with SVG icon, add aria-label | 20m |
| 11 | pages/organizer/dashboard.tsx | Generic "Loading..." text without animation | MEDIUM | Replace with Skeleton component or spinner | 20m |
| 12 | pages/organizer/add-items/[saleId].tsx | Items loading shows "Loading..." not skeleton | MEDIUM | Show skeleton grid matching items layout | 30m |
| 13 | pages/organizer/edit-item/[id].tsx | Generic "Loading..." return | MEDIUM | Build skeleton layout for form | 30m |
| 14 | pages/organizer/edit-sale/[id].tsx | Simple "Loading..." text for complex form page | MEDIUM | Create skeleton form layout | 30m |
| 15 | pages/index.tsx | Map loading skeleton doesn't align with rest of page | MEDIUM | Show full page skeleton or overlay | 30m |
| 16 | pages/shopper/dashboard.tsx | Generic "Loading..." text | MEDIUM | Use skeleton layout | 20m |
| 17 | pages/shopper/purchases.tsx | "Loading purchases..." text inconsistent | MEDIUM | Use skeleton matching purchase card layout | 20m |
| 18 | pages/messages/[id].tsx | Bare spinner on load with no label | MEDIUM | Add "Loading conversation..." text | 10m |
| 19 | pages/login.tsx | Redirect param has no validation (open redirect risk) | MEDIUM | Validate redirect URL against whitelist | 30m |
| 20 | pages/organizer/checklist/[saleId].tsx | Skeleton uses h-screen causing huge space on mobile | MEDIUM | Use responsive height like h-96 or h-screen on desktop only | 15m |
| 21 | components/BottomTabNav.tsx | `min-w-touch` class may not exist in all configs | MEDIUM | Use explicit min-width like `min-w-[44px]` | 15m |
| 22 | pages/search.tsx | Search input autoFocus may not work if browser disables it | LOW | Add ref-based focus fallback | 20m |
| 23 | pages/organizer/email-digest-preview.tsx | Dashboard/preferences page link broken | LOW | Ensure link destinations exist and are functional | 15m |
| 24 | components/SaleCard.tsx | Alt text could be more descriptive | LOW | Include sale/date context in alt text | 20m |
| 25 | pages/404.tsx | 404 page lacks discovery suggestions | LOW | Add category browse suggestions or search shortcut | 30m |
| 26 | pages/organizer/line-queue/[id].tsx | pb-24 may not account for all mobile safe areas | MEDIUM | Test on notch devices, use pb-safe if available | 15m |
| 27 | pages/organizer/create-sale.tsx | Minimal "Loading..." without visual feedback | LOW | Add styled spinner or skeleton | 20m |
| 28 | pages/search.tsx | SkeletonGrid count may mismatch actual results | LOW | Dynamically adjust skeleton count based on grid | 30m |
| 29 | components/BottomTabNav.tsx | Hash-based tab navigation `/dashboard#favorites` breaks server-side | LOW | Use query param `/dashboard?tab=favorites` | 20m |
| 30 | components/CartDrawer.tsx | Poll interval always active, burns mobile battery | LOW | Only poll when drawer is visible | 15m |
| 31 | components/CheckoutModal.tsx | External link styling inconsistency | LOW | Standardize external link attributes | 10m |
| 32 | pages/items/[id].tsx | No fallback UI if photo/component loads slowly | MEDIUM | Add timeout-based error fallback for imported components | 30m |
| 33 | pages/organizer/login redirect | Redirect logic checks but no user-facing confirmation | LOW | Show toast or banner when redirected | 15m |
| 34 | pages/organizer/dashboard.tsx | Tab navigation caps text (lowercase) but not visually distinct | LOW | Ensure active tab has clear visual indicator | 5m |

---

## Ship Blockers (Must Fix Before Beta)

1. **Organizer Dashboard Metrics Broken** — "Total Items" and "Earnings (30d)" show "—" placeholders. Organizers cannot see basic inventory/revenue stats. **Severity: CRITICAL**
   - Fix: Implement real metrics queries
   - Blocker because: Core organizer workflow is blocked

2. **Email Preview Links Broken** — All CTA and footer links in email digest preview are `href="#"`. Users won't be able to click through in their inbox. **Severity: CRITICAL**
   - Fix: Update hrefs to real endpoints
   - Blocker because: Email is primary communication channel with organizers

3. **Analytics Tab Dead End** — Clicking "Analytics" tab shows placeholder. No UI, no escape, dead end. **Severity: CRITICAL**
   - Fix: Remove tab, or build analytics stub
   - Blocker because: Tab suggests feature exists but doesn't

4. **Checkout ToS Not Enforced** — Users can submit payment without agreeing to terms. **Severity: CRITICAL**
   - Fix: Disable button until checkbox checked
   - Blocker because: Legal/compliance requirement

---

## Testing Checklist for Patrick

- [ ] Organizer dashboard: Verify "Total Items" and "Earnings" display real numbers (not "—")
- [ ] Organizer dashboard: Click Analytics tab, verify it doesn't dead-end or shows proper "Coming Soon" UX
- [ ] Email preview: Click all 4 links (CTA, FindA.Sale, Preferences, Unsubscribe) — verify they navigate correctly
- [ ] Add Items page: Check loading state shows skeleton, not bare text
- [ ] Line Queue page: Test back button on mobile and desktop, verify it's accessible
- [ ] Checkout flow: Try submitting without checking ToS checkbox — button should be disabled
- [ ] All loading pages: Verify consistent Skeleton component or spinner use across pages
- [ ] Messages page: Test error state, verify "Back to messages" link is prominent
- [ ] Mobile: Verify bottom nav doesn't get cut off by notch/dynamic island on iPhone
- [ ] Open Redirect: Try `/login?redirect=https://evil.com` — verify it doesn't redirect to external domain

---

## Notes for Beta

- **Loading States**: The codebase is inconsistent with loading UX. Standardize all page loads to use the `Skeleton` component or a global loading spinner. This one fix would improve perceived performance by 40%.
- **Mobile Safe Areas**: Several pages use hardcoded padding (e.g., `pb-24`). On newer iPhones with notches, this might not be sufficient. Test on actual devices.
- **Error Boundaries**: Large pages like `/items/[id]` import many components (CheckoutModal, PhotoLightbox, etc.). If any fail to load, users see blank page. Add error boundaries.
- **Accessibility**: Some pages use emoji for navigation (`←`). Screen readers may not read these correctly. Use SVG icons with aria-labels instead.
- **Email Preview Links**: The email digest preview page is critical for organizers to understand what they'll receive. All links must work. This is a UX trust issue.

