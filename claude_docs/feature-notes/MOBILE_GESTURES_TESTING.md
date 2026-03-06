# Mobile Gestures & Haptic Feedback - Testing Guide

## Overview

This document describes how to test the mobile gesture and haptic feedback features implemented in the FindA.Sale frontend.

## Features Implemented

### 1. Pull-to-Refresh Gesture

**Pages Affected:**
- `/` (Homepage - sale listings)
- `/shopper/dashboard` (Shopper dashboard)

**How to Test:**

1. Open the page on a mobile device or use mobile emulation in Chrome DevTools
2. Scroll to the very top of the page (scrollY = 0)
3. Place finger on screen and drag downward
4. Observe:
   - Amber progress bar appears at the top as you drag
   - Progress bar fills from 0-100% as you drag 0-60px
   - Loading spinner appears when threshold (60px) is reached
5. Release your finger
   - Spinner continues while data refetch completes
   - Progress bar and spinner disappear when done

**Expected Behavior:**
- Works only when page is scrolled to top
- Doesn't trigger on partial scrolls
- Visual feedback (progress bar) appears immediately
- Data refreshes via React Query

### 2. Swipe-to-Dismiss Notifications

**Page:** `/notifications`

**How to Test:**

1. Navigate to notifications page
2. Find a notification item
3. Touch the notification and drag to the LEFT
4. Observe:
   - Notification translates left as you drag
   - Opacity decreases as you drag further
   - Delete button becomes visible on the right
5. Drag >40% of screen width:
   - Release finger
   - Notification slides out of view with fade
   - Notification is removed from list after animation
6. Drag <40% of screen width:
   - Release finger
   - Notification snaps back to original position

**Expected Behavior:**
- Smooth animation during swipe
- Threshold is 40% of viewport width
- Dismissal includes opacity fade
- Item deleted after animation completes

### 3. Long-Press Context Menu

**Component:** ItemCard (appears on all item listings)

**How to Test:**

1. Find any item card (on homepage, dashboard, etc.)
2. Press and hold your finger on the card for 600ms
3. Observe:
   - Card provides haptic feedback (50ms vibration on supported devices)
   - Context menu appears at touch location
   - Menu contains 4 options:
     - View Item (opens item detail)
     - Add to Wishlist
     - Share (uses Web Share API or clipboard)
     - View Similar
4. Tap anywhere outside menu to close
5. Tap menu option to execute action

**Expected Behavior:**
- 600ms hold time before menu appears
- Menu positioned to stay within viewport
- Haptic feedback on detection (if supported)
- Click-outside detection closes menu

**Testing Haptic Feedback:**
- Test on Android or iOS device with vibration enabled
- You should feel a brief vibration when menu appears

### 4. Haptic Feedback Patterns

**Locations and Patterns:**

#### a. Favorite Toggle
**Page:** `/items/[id]` (item detail page)
**Trigger:** Click heart/favorite button
**Pattern:** Single 10ms vibration
**Feel:** Subtle, light feedback

#### b. Wishlist Add
**Page:** `/items/[id]` (item detail page)
**Trigger:** Add to wishlist (from context menu or dropdown)
**Pattern:** Single 10ms vibration
**Feel:** Subtle, light feedback

#### c. Long-Press Detection
**Component:** ItemCard (item listings)
**Trigger:** Long-press (600ms hold)
**Pattern:** Single 50ms vibration
**Feel:** More noticeable, signals menu will appear

#### d. Share Action
**Component:** ItemCard context menu
**Trigger:** Click "Share" option
**Pattern:** Single 10ms vibration
**Feel:** Subtle feedback

#### e. Purchase Complete
**Page:** `/items/[id]` (item detail page)
**Trigger:** Checkout completes successfully
**Pattern:** [100ms on, 50ms off, 100ms on]
**Feel:** Celebration pattern with two beats

**How to Test Haptic Feedback:**

1. On iOS: Enable "Haptic Feedback" in Settings > Accessibility
2. On Android: Ensure vibration is enabled in Settings > Sound > Vibration
3. Test each action above with phone held in hand
4. Verify vibration pattern matches description

## Technical Details

### Hook: `useHaptics`

Location: `/packages/frontend/hooks/useHaptics.ts`

Usage:
```typescript
import { useHaptics } from '../hooks/useHaptics';

const { vibrate } = useHaptics();

// Single vibration (10ms)
vibrate(10);

// Pattern vibration
vibrate([100, 50, 100]);
```

**Graceful Degradation:**
- On desktop: No vibration (expected)
- On unsupported browsers: Silent fail, no errors
- On restricted devices: Silent fail, logged to console

### Hook: `usePullToRefresh`

Location: `/packages/frontend/hooks/usePullToRefresh.ts`

Usage:
```typescript
import { usePullToRefresh } from '../hooks/usePullToRefresh';

const { isRefreshing, pullDistance } = usePullToRefresh({
  onRefresh: async () => {
    // Refetch data
    await refetch();
  },
  threshold: 60, // pixels
});
```

Returns:
- `isRefreshing`: Boolean indicating if refresh is in progress
- `pullDistance`: Current pixels dragged downward
- `progress`: Normalized 0-1 progress value

## Browser Support

### Desktop Testing (Chrome DevTools Mobile Emulation)

1. Open Chrome DevTools (F12)
2. Click device icon (toggle device toolbar)
3. Select "iPhone" or "Pixel" device
4. Test touch gestures using mouse:
   - Click and drag simulates touch
   - Hold and drag simulates swipe
   - Long hold simulates long-press

**Limitations:** Desktop emulation doesn't provide actual haptic feedback.

### Real Mobile Device Testing

- **iOS:** Safari or Chrome
- **Android:** Chrome, Firefox, or Samsung Internet
- **Required:** Device with touch screen and vibration motor

## Expected Behavior Summary

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Pull-to-Refresh | Works (emulated) | Works |
| Swipe-to-Dismiss | Works (emulated) | Works |
| Long-Press Menu | Works (emulated) | Works |
| Haptic Feedback | No vibration | Vibrates |

## Files Modified

- `/packages/frontend/hooks/useHaptics.ts` (NEW)
- `/packages/frontend/hooks/usePullToRefresh.ts` (NEW)
- `/packages/frontend/pages/index.tsx`
- `/packages/frontend/pages/shopper/dashboard.tsx`
- `/packages/frontend/pages/notifications.tsx`
- `/packages/frontend/components/ItemCard.tsx`
- `/packages/frontend/pages/items/[id].tsx`

## Troubleshooting

**Pull-to-Refresh Not Triggering:**
- Ensure page is scrolled to very top (scrollY = 0)
- Check that main element exists in DOM
- Verify drag distance exceeds 60px

**Swipe-to-Dismiss Not Working:**
- Ensure drag is on notification item itself
- Verify drag direction is LEFT (negative X)
- Check that drag distance is >40% of viewport width

**Long-Press Menu Not Appearing:**
- Hold finger for full 600ms (not just click)
- Verify device supports touch events
- Check browser console for errors

**No Haptic Feedback:**
- Verify vibration is enabled on device
- Check browser permissions for vibration API
- Some browsers restrict vibration API usage

## Performance Notes

- Touch event listeners use passive: true where possible
- Minimal state updates during gesture tracking
- Cleanup functions remove event listeners on unmount
- No external dependencies beyond React and React Query

## Accessibility Considerations

- All gestures have alternative interactions:
  - Pull-to-refresh: Manual refresh button as fallback
  - Swipe-to-dismiss: Delete button in context menu
  - Long-press: Menu accessible via other means
- Haptic feedback is non-critical enhancement
- Works on keyboard/mouse-only devices
