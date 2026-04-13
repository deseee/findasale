# UX Spec: Save vs. Wishlist on Item Cards

**Author:** findasale-ux
**Date:** 2026-03-28
**Status:** Design Review (ready for findasale-dev implementation)
**Scope:** All item card surfaces (sale detail, search results, trending, favorites page)

---

## Executive Summary

Shoppers currently report confusion on item cards: "I can like, but where's the wishlist button?" The heart button (Save/Favorite) exists but wishlists (named collections) are hidden from the card surface.

This spec clarifies the distinction and proposes a mobile-first, low-friction pattern that makes both actions immediately accessible on item cards:
- **Heart = Save to default wishlist** (one tap, optimistic feedback, no friction)
- **Menu / Long-Press = Add to named wishlist** (secondary action, opens collection picker)

Both actions coexist without crowding the card and work equally well on mobile and desktop.

---

## Problem Statement

**Current State:**
- Heart icon toggles "favorite" status (saves to default wishlist in backend)
- Named wishlists exist in the database but are not surfaced on item cards
- Shoppers see the heart and assume it's "save," but don't know wishlists exist
- Wishlists are only accessible via a dedicated page (`/shopper/favorites` or similar), not in-context

**User Impact:**
- Shopper saves an item with the heart
- Later tries to "add to a wishlist" but doesn't know how
- Confusion between save (heart) and wishlist (collection name + note)
- Reduced wishlist adoption and engagement

**Design Goal:**
Make both save and wishlist actions visible and distinct on the card without adding visual clutter.

---

## Design Decisions

### 1. Terminology Clarity

| Term | Backend | UX | Behavior |
|------|---------|----|-|
| **Save** | `Favorite` model, `userId + itemId` | Red heart icon | One-tap toggle to default wishlist (favorites) |
| **Wishlist** | `Wishlist` model, `name`, `occasion` | Menu / dropdown | Create or add to named collections (with optional note) |
| **Default Wishlist** | Implicit first wishlist, auto-created on first save | N/A | Backend-only; shows in "/saved-items" or "Favorites" page |

**Key Insight:** Conceptually, "Save" = "add to Favorites wishlist" (the default). Named wishlists are upgrades for organization.

### 2. Interaction Pattern: Heart + Menu (Mobile-First)

#### Visual Layout (Item Card)

```
┌─────────────────────────────────────┐
│                                     │
│          [ITEM IMAGE]               │ 60% visual weight
│                                     │
│  [Status Badge]    [❤️] [⋯ Menu]   │ Top-right corner
│                                     │
├─────────────────────────────────────┤
│ Victorian Chair                     │ 40% visual weight
│ $45.99            2h 30m left       │
└─────────────────────────────────────┘
```

**Components:**
1. **Heart Button (Primary)** — save to default wishlist
   - Outline heart = not saved
   - Filled red heart = saved
   - One tap to toggle
   - Shows toast: "Saved!" or "Removed from saves"
   - Accessible via keyboard (Enter, Space)

2. **More Menu Button (Secondary)** — wishlist & actions
   - Icon: three dots (`⋯`) or chevron (`>`)
   - Tap to open bottom sheet (mobile) or dropdown (desktop)
   - Menu options:
     - "Add to Wishlist" or "Add to Collection" (only if user has created wishlists)
     - "Share item"
     - "Report item" (if moderation needed)
   - Positioned next to heart, top-right

**Why this pattern:**
- Minimal card footprint (two small icons)
- One-tap friction-free save (most common action)
- Named wishlists remain discoverable but secondary
- Works on mobile (thumb-friendly top-right) and desktop (hover/click)
- Dark mode and light mode contrast both readable

---

### 3. Wishlist Picker Interaction (Bottom Sheet / Dropdown)

#### Mobile (Bottom Sheet)

When user taps "Add to Wishlist" from the menu:

```
┌─────────────────────────────────────┐
│  Add to Wishlist                 ✕  │ Header
├─────────────────────────────────────┤
│ Create new wishlist                 │ "New" action
├─────────────────────────────────────┤
│ ☑ Favorites                         │ Default (auto-checked if already saved)
│ ☐ Moving to New Place               │ Named wishlist
│ ☐ Home Office Decor                 │
│ ☐ Birthday Gifts (for Mom)          │
│                                     │
│ [Create New Collection]             │ CTA
├─────────────────────────────────────┤
│ [Cancel]           [Save Changes]   │ Actions
└─────────────────────────────────────┘
```

**Behavior:**
- Checkboxes (not radio) — item can belong to multiple wishlists
- "Favorites" always visible at top (cannot be deleted)
- Shows up to 8 wishlists; scroll if more
- Tapping a wishlist immediately adds/removes the item (optimistic)
- "Create New Collection" button opens quick-add modal

#### Desktop (Dropdown)

```
┌──────────────────────────────┐
│ Add to Wishlist              │
├──────────────────────────────┤
│ ☑ Favorites                  │
│ ☐ Moving to New Place        │
│ ☐ Home Office Decor          │
├──────────────────────────────┤
│ [+ Create New Collection]    │
└──────────────────────────────┘
```

**Differences from mobile:**
- Hover for chevron icon
- Dropdown positioned below button (or above if near bottom of viewport)
- Same checkbox logic
- Same scroll behavior if >8 wishlists

#### Create New Wishlist (Quick-Add Modal)

Triggered from wishlist picker:

```
┌─────────────────────────────────────┐
│  Create New Wishlist             ✕  │
├─────────────────────────────────────┤
│ Collection name                     │
│ [_____________________________]      │ e.g., "Moving to New Place"
│                                     │
│ Occasion (optional)                 │
│ [Select: Moving / Decorating / ...] │
│                                     │
│ [Cancel]        [Create & Add]      │
└─────────────────────────────────────┘
```

**UX:**
- Name field required, max 50 characters
- Occasion dropdown (optional): moving, downsizing, decorating, gifting, other
- "Create & Add" button creates the wishlist + immediately adds the current item to it
- Toast: "Created 'Moving to New Place' and added item"

---

### 4. Backend Data Sync

When a user toggles the heart on an item card, the backend:

1. **Saves to default Wishlist** (if not already saved):
   - Looks up or creates user's default `Wishlist` (name = "Favorites")
   - Creates `WishlistItem` linking item to default wishlist
   - Increments `Favorite` record (for backward compatibility + analytics)

2. **Unsaves from default Wishlist** (if already saved):
   - Removes `WishlistItem` from default wishlist
   - Removes `Favorite` record

3. **Returns state to frontend:**
   - `{ isSaved: true, wishlistId: "...", wishlistName: "Favorites" }`

**Why dual-track?**
- `Favorite` model is already integrated (points, leaderboard, query optimization)
- `Wishlist` model is the new canonical source
- Migration path: eventually deprecate `Favorite` in favor of `Wishlist`

---

## Copy & Microcopy

### Toast Messages

| Action | Toast | Duration |
|--------|-------|----------|
| Save item to default | "❤️ Saved!" | 2s |
| Remove from default | "✓ Removed from saves" | 2s |
| Add to named wishlist | "Added to 'Moving to New Place'" | 2s |
| Remove from named wishlist | "Removed from 'Moving to New Place'" | 2s |
| Create new wishlist | "Created 'New Collection' and added item" | 3s |
| Error saving | "Failed to save. Please try again." | 3s |

### Button Labels

| Element | Label | Context |
|---------|-------|---------|
| Heart button | (icon only, no label) | Item card |
| Menu button | (icon only, "⋯" or ">") | Item card |
| Menu item | "Add to Wishlist" | More menu |
| Empty state | "No wishlists yet — create one to organize items" | Card picker, when user has 0 wishlists |
| CTA button | "Create New Collection" | Wishlist picker |
| Modal header | "Add to Wishlist" | Bottom sheet / dropdown |
| Modal action | "Save Changes" | Batch edit (if multiple wishlists toggled) |

### Help Text / Tooltips

| Element | Tooltip | Trigger |
|---------|---------|---------|
| Heart button | "Save to Favorites" (not saved) or "Saved to Favorites" (saved) | Hover (desktop) / long-hold (mobile) |
| Heart button (unauthenticated) | "Sign in to save items" | Hover / long-hold |
| Menu button | "More options" | Hover / long-hold |
| Occasion dropdown | "Helps you remember why you saved this" | Tooltip icon or inline |
| Favorites wishlist | "Your default collection — items saved with the heart icon" | Info icon next to "Favorites" |

---

## Mobile vs. Desktop Differences

### Touch Targets & Spacing

| Device | Heart Size | Menu Size | Spacing | Padding |
|--------|-----------|-----------|---------|---------|
| Mobile | 44×44 px | 44×44 px | 8px gap | 8px margin |
| Desktop | 36×36 px | 36×36 px | 6px gap | 12px margin |

**Rationale:** Touch targets ≥ 44×44 px per WCAG; desktop can be smaller due to mouse precision.

### Interaction Differences

| Gesture | Mobile | Desktop |
|---------|--------|---------|
| Heart save | Tap (immediate fill) | Click (immediate fill) |
| Open menu | Tap (bottom sheet) | Click (dropdown) or right-click (context menu) |
| Long-press heart | Show tooltip "Saved to Favorites" | Hover shows tooltip |
| Keyboard nav | Arrow keys in bottom sheet | Tab to focus + Enter to activate |

### Viewport Behavior

| Viewport | Card Width | Text Clamp | Menu Position |
|----------|-----------|-----------|--|
| Mobile (< 640px) | Full width - 16px margin | 1 line for title | Bottom sheet (full width) |
| Tablet (640–1024px) | 45% of container | 2 lines for title | Dropdown above/below |
| Desktop (> 1024px) | Fixed 280px | 2 lines for title | Dropdown or context menu |

---

## Edge Cases

### 1. User Has No Wishlists Yet

**Current State:**
User hasn't created any named wishlists; only "Favorites" default exists.

**UI Behavior:**
- Heart works normally (saves to Favorites)
- Tapping menu → "Add to Wishlist" → opens bottom sheet
- Only "Favorites" checkbox visible
- "Create New Collection" button prominent
- Empty state text: "No named collections yet. Create one to organize items by occasion or category."

**Toast:** "Added to Favorites. Create a collection to organize items."

### 2. Item Already Saved (Heart is Filled)

**Current State:**
Heart is filled (red); item is in "Favorites" wishlist.

**UI Behavior:**
- Heart tap removes it (unfills heart, toast "Removed from saves")
- Menu → "Add to Wishlist" → "Favorites" checkbox is pre-checked
- User can still toggle other wishlists without affecting "Favorites" status
- Unchecking "Favorites" is equivalent to tapping the heart

**Copy Clarity:** "Favorites" always shows as a separate option in the picker (not conflated with the heart action).

### 3. Item Removed from Sale While Saved

**Current State:**
User saved an item, then the organizer deleted it or changed its status to SOLD/INACTIVE.

**UI Behavior:**
- Item still appears in user's wishlists (soft delete, preserve history)
- Card shows "(Unavailable)" or "(Sold)" status badge
- Heart is greyed out or shows "No longer available"
- Tapping heart shows toast: "This item is no longer available for purchase, but we kept it in your collection."
- User can still view the wishlist with the unavailable item; it appears last in the list with muted styling

**Design Rationale:** Preserve shopper's collection history even if the item is no longer available.

### 4. User Tries to Save but Is Not Authenticated

**Current State:**
User is not logged in.

**UI Behavior:**
- Heart button is visible but disabled (greyed out or 50% opacity)
- Tapping heart redirects to `/login?redirect=/items/[itemId]`
- Menu button still works (has "Share" option)
- Tooltip on heart: "Sign in to save items"

**Alternative Pattern:** Heart button can be fully clickable and redirect directly to login, with a param indicating they want to save after auth:
- Click heart → redirect to `/login?action=save&itemId=[id]&redirect=/items/[id]`
- After login, auto-trigger save + show toast "Saved!"

### 5. Network Error During Save/Unsave

**Current State:**
User taps heart, optimistic update happens, but backend request fails.

**UI Behavior:**
- Heart fill updates immediately (optimistic)
- Request fails (no connection or 500 error)
- Heart reverts to previous state after 1s delay
- Toast: "Failed to save. Please try again." (shows 3s)
- User can retry immediately

**Implementation:** Same pattern as `FavoriteButton.tsx` (revert on catch).

### 6. Item in Multiple Wishlists, User Deletes One Wishlist

**Current State:**
User has "Moving to New Place" + "Favorites", both contain the same item. User deletes "Moving to New Place".

**UI Behavior:**
- Item remains in "Favorites"
- No notification to user (silent removal from non-default collections)
- If user opens the wishlist picker for this item, "Moving to New Place" no longer appears
- Toast on wishlist deletion: "'Moving to New Place' was deleted. Items moved to Favorites remain in your account."

---

## Accessibility (WCAG 2.1 AA)

### Keyboard Navigation

| Action | Keys |
|--------|------|
| Focus heart button | `Tab` |
| Activate heart (toggle save) | `Enter` or `Space` |
| Focus menu button | `Tab` (from heart) |
| Activate menu (open picker) | `Enter` or `Space` |
| Navigate wishlist checkboxes | Arrow keys (up/down) or `Tab` |
| Toggle checkbox | `Space` or `Enter` |
| Close picker | `Escape` |
| Submit changes | `Tab` to "Save Changes" + `Enter` |

### Screen Reader

| Element | Announcement |
|---------|--------------|
| Heart button (not saved) | "Save item to Favorites, button" |
| Heart button (saved) | "Remove from Favorites, button" (or "Saved to Favorites, button") |
| Menu button | "More options for [Item Title], button" |
| Wishlist checkbox | "Add to [Wishlist Name] collection, checkbox, [checked/unchecked]" |
| Status badge (Sold) | "(Sold)" or "SOLD, status badge" |
| Occasion label | "Occasion: moving, optional dropdown" |

### Color Contrast

| Element | Foreground | Background | Ratio |
|---------|-----------|-----------|-------|
| Heart (filled) | #EF4444 (red) | White/light | 5.2:1 ✓ |
| Heart (outline) | #374151 (gray) | White/light | 9:1 ✓ |
| Heart (dark mode) | #FCA5A5 (light red) | #1F2937 | 5.8:1 ✓ |
| Menu icon | #374151 | White/light | 9:1 ✓ |
| Toast text | White | #1F2937 | 19:1 ✓ |

---

## Implementation Notes

### Frontend Components (New/Modified)

1. **ItemCard.tsx** (existing, modify)
   - Replace hard-coded `FavoriteButton` with new "heart + menu" layout
   - Add `showWishlistMenu` prop (default true)
   - Heart remains icon-only (no label)
   - Menu button with three-dot icon

2. **ItemCardMenu.tsx** (new component)
   - Renders bottom sheet (mobile) / dropdown (desktop)
   - Options: "Add to Wishlist", "Share", "Report"
   - Handles conditional rendering based on user auth + data

3. **WishlistPicker.tsx** (new component)
   - Checkbox list of user's wishlists
   - "Create New Collection" button
   - Handles multi-select logic
   - Toast feedback on add/remove

4. **WishlistCreateModal.tsx** (new component)
   - Name input + occasion dropdown
   - "Create & Add" CTA
   - Inline validation

5. **FavoriteButton.tsx** (modify existing)
   - Keep for reuse on other surfaces (if needed)
   - Update to call optimistic save + backend `/api/favorites`
   - Integrate with new wishlist backend

### API Contract (Backend Implementation)

**POST /api/wishlists/{wishlistId}/items**
- Add item to named wishlist
- Response: `{ success: true, message: "Added to [Wishlist Name]" }`

**DELETE /api/wishlists/{wishlistId}/items/{itemId}**
- Remove item from named wishlist
- Response: `{ success: true, message: "Removed from [Wishlist Name]" }`

**POST /api/wishlists**
- Create new wishlist
- Request: `{ name: "...", occasion?: "..." }`
- Response: `{ id, name, occasion, createdAt }`

**GET /api/wishlists**
- List user's wishlists
- Response: `[{ id, name, occasion, itemCount }]`

**POST /api/favorites/{itemId}** (existing, modify)
- Syncs with default wishlist backend
- Request: `{ isFavorite: true/false }`
- Response: `{ isFavorite: true/false, savedToWishlist: "Favorites" }`

---

## Testing Checklist

### Functional Testing

- [ ] Heart toggle saves/unsaves item (optimistic update + backend sync)
- [ ] Menu button opens picker (mobile = bottom sheet, desktop = dropdown)
- [ ] "Favorites" always appears in picker and cannot be deleted
- [ ] User can toggle multiple wishlists from picker
- [ ] "Create New Collection" button opens modal + creates wishlist + adds item
- [ ] Empty state shows when user has no named wishlists
- [ ] Toast messages appear correctly for all actions
- [ ] Network error reverts optimistic update + shows error toast
- [ ] Unauthenticated user cannot save (redirected to login)
- [ ] Removed/sold items show status badge + heart is disabled

### Cross-Browser Testing

- [ ] Mobile Safari (iOS 14+): Heart + menu responsive, bottom sheet opens
- [ ] Chrome Mobile: Same as above
- [ ] Desktop Chrome/Safari/Firefox: Dropdown menu positions correctly (not cut off)
- [ ] Dark mode: Heart color and text contrast both ≥ 5:1

### Accessibility Testing

- [ ] Keyboard navigation works (Tab → Arrow keys → Enter)
- [ ] Screen reader announces heart as "Save item" or "Remove from favorites"
- [ ] Screen reader announces wishlist checkboxes correctly
- [ ] Color contrast passes WCAG AA for all states
- [ ] Focus indicators visible on all interactive elements

### Edge Cases

- [ ] Unauthenticated user taps heart → redirects to login
- [ ] User with no wishlists saves item → toast mentions creating collection
- [ ] User saves item, then item is deleted by organizer → shows unavailable state
- [ ] User deletes a wishlist containing the item → item remains in Favorites
- [ ] Network is slow: optimistic UI updates, then reverts if needed

---

## Rollout Plan

### Phase 1: Code Review & Integration (Day 1–2)
- Findasale-dev implements all components, hooks, API integration
- findasale-qa reviews code + smoke tests on staging

### Phase 2: QA Testing (Day 3)
- QA tests all functional + edge cases
- Cross-browser testing (mobile + desktop)
- Accessibility audit

### Phase 3: Soft Rollout (Day 4)
- Deploy to production
- Monitor error logs + user behavior
- Watch for wishlist adoption metrics

### Phase 4: Announcement (Day 5)
- Email shoppers about new Wishlist feature
- Add in-app tooltip or tip ("💡 Tip: Create collections to organize items by occasion")

---

## Metrics to Track

| Metric | Baseline | Goal | Monitor |
|--------|----------|------|---------|
| Saves per session | N/A | +20% from current | Weekly |
| Wishlist creation rate | 0 | 5% of active shoppers | Weekly |
| Items per wishlist (avg) | N/A | 8+ | Weekly |
| Wishlist reuse (items moved between wishlists) | N/A | 10% of saved items | Monthly |
| Heart click-through rate | Existing | +15% | Weekly |
| Error rate on save/unsave | <1% | <0.5% | Daily |

---

## Future Enhancements (Out of Scope)

- Wishlist sharing (make a wishlist public, share a link)
- Collaborative wishlists (invite friends to add items)
- Wishlist notifications ("Item on your [Wishlist Name] is now on sale!")
- Export wishlist as PDF or email
- Wishlist templates (pre-built collections like "Housewarming" or "Office Setup")

---

**End of Specification**
