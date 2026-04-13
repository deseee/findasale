# POS Upgrade UX Flows — FindA.Sale

**Author:** UX Designer
**Date:** 2026-04-04
**Status:** Design Spec (ready for dev handoff)

---

## Overview

This spec defines the complete UX flows for five new POS features enabling cash-based sales organizers and mobile-first shoppers to transact efficiently. All flows are mobile-first, dark-mode compatible, and designed for organizers aged 40-60+ operating from garages/tables.

---

## Navigation & Information Architecture

### Organizer Sidebar Updates
- **POS Hub** (existing): `/organizer/pos`
- **New subtabs:**
  - Scan QR (camera flow)
  - Enter Card Manually (payment)
  - Open Carts (shopper list & checkout)
  - Send Invoice (holds/reservations)
  - Payment Links (reusable QR codes)

### Shopper App Nav
- **Cart Icon** (floating, persistent): Shows item count
- **Scan Item** (prominent button in bottom nav): Opens camera
- **Payment Requests** (notification badge): Pending payment requests from organizer

---

## Feature 1: Camera QR Scanning Flow (Organizer)

**Goal:** Organizer scans item QR codes to build a transaction ticket.

### Screen 1: POS Home → "Scan Item" Button
```
┌─────────────────────────────────┐
│ FindA.Sale POS                  │
│ Sale: Summer Estate Sale         │
├─────────────────────────────────┤
│                                 │
│  Items in cart: 3  |  Total: $47 │
│                                 │
│  [Scan Item]  [Manual Search]   │
│  [Quick Add]  [Enter Card]      │
│                                 │
│  Cart Preview:                  │
│  • Vase (blue)        — $12.00  │
│  • Table lamp         — $20.00  │
│  • Book lot           — $15.00  │
│                                 │
│  [Review & Checkout]            │
└─────────────────────────────────┘
```

**Copy:** "Tap Scan Item to start. Point your camera at the QR tag."

### Screen 2: Camera View (Active Scanning)
```
┌─────────────────────────────────┐
│ [× Close]       [Scan Item]      │
├─────────────────────────────────┤
│                                 │
│    [CAMERA VIEW - LIVE FEED]    │
│                                 │
│    ┌─────────────────────┐      │
│    │   ○ QR Zone        │      │
│    │   (preview box)    │      │
│    └─────────────────────┘      │
│                                 │
│    Hold steady at arm's length   │
│                                 │
│  [Flashlight Toggle]            │
│                                 │
└─────────────────────────────────┘
```

**States:**
- **Searching:** "Move closer" / "Point at QR code"
- **Found (loading):** QR box highlights, 200ms pause before next state
- **Success:** Haptic feedback, item name + price appears momentarily

### Screen 3: Item Added to Cart (Success Toast)
```
┌─────────────────────────────────┐
│ [Back to POS]                   │
├─────────────────────────────────┤
│                                 │
│  ✓ Vase (blue) added            │
│    $12.00                       │
│                                 │
│  [Scan Another]  [Done]         │
│                                 │
│  Items in cart: 4               │
│                                 │
└─────────────────────────────────┘
```

**Behavior:**
- Toast appears for 2 seconds (dismissible)
- "Scan Another" keeps camera open, auto-focuses
- "Done" returns to cart review

### Screen 4: QR Scan Failure (Error Recovery)
**Condition:** User scans invalid QR, tapped code, or non-item barcode.

```
┌─────────────────────────────────┐
│ [Back]                          │
├─────────────────────────────────┤
│                                 │
│  ⚠ Unable to read QR code       │
│                                 │
│  Try again: Point the camera    │
│  steadily at the QR tag.        │
│                                 │
│  [Manual Search Instead]        │
│  [Close Camera]                 │
│                                 │
└─────────────────────────────────┘
```

**Copy:** "If the QR is damaged or worn, search for the item manually below."

---

## Feature 2: Manual Card Entry Flow (Organizer)

**Goal:** Organizer enters shopper's card details when no card reader available.

### Screen 1: Payment Method Selection
```
┌─────────────────────────────────┐
│ Checkout                        │
│ Total: $47.00                   │
├─────────────────────────────────┤
│                                 │
│ How will they pay?              │
│                                 │
│ ○ Card (Stripe reader)          │
│ ● Card (manual entry)           │
│ ○ Cash                          │
│ ○ Payment Link (QR)             │
│                                 │
│  [Continue]                     │
│                                 │
└─────────────────────────────────┘
```

### Screen 2: CNP Warning + Card Form
```
┌─────────────────────────────────┐
│ Card Details                    │
│ Manual Entry                    │
├─────────────────────────────────┤
│                                 │
│ ⚠ Fee Notice:                   │
│  Card-not-present fee: $1.40    │
│  (3% of $47)                    │
│                                 │
│  New Total: $48.40              │
│                                 │
│ ─────────────────────────────── │
│                                 │
│ Card Number                     │
│ [____  ____  ____  ____]        │
│                                 │
│ MM / YY              CVC        │
│ [__/__]              [___]      │
│                                 │
│ Postal Code                     │
│ [__________]                    │
│                                 │
│ [Process Payment]               │
│                                 │
└─────────────────────────────────┘
```

**Accessibility:**
- Card input uses numpad on mobile (no software keyboard)
- Labels visible, inputs have clear focus states
- CNP warning in yellow/orange box with icon

### Screen 3: Processing
```
┌─────────────────────────────────┐
│ Processing...                   │
├─────────────────────────────────┤
│                                 │
│  ◉ Charging card...             │
│                                 │
│  Amount: $48.40                 │
│                                 │
│  (do not close this screen)     │
│                                 │
│  [Cancel]                       │
│                                 │
└─────────────────────────────────┘
```

### Screen 4: Success
```
┌─────────────────────────────────┐
│ Payment Confirmed               │
├─────────────────────────────────┤
│                                 │
│  ✓ Card charged                 │
│                                 │
│  Amount: $48.40                 │
│  Card: ••••4242                 │
│  Time: 2:34 PM                  │
│                                 │
│  Receipt Options:               │
│  [ ] Email                      │
│  [ ] SMS                        │
│  [ ] Print                      │
│                                 │
│  [New Transaction]  [Close]     │
│                                 │
└─────────────────────────────────┘
```

### Screen 5: Error State
```
┌─────────────────────────────────┐
│ Payment Declined                │
├─────────────────────────────────┤
│                                 │
│  ✗ Card was declined            │
│                                 │
│  Reason: Insufficient funds     │
│                                 │
│  Have them try another card     │
│  or choose cash payment.        │
│                                 │
│  [Try Again]  [Use Cash]        │
│                                 │
└─────────────────────────────────┘
```

---

## Feature 3: Stripe Payment QR Code Flow (Shopper Self-Checkout)

**Goal:** Shopper pays via QR without talking to cashier (self-service).

### Organizer Side: QR Generation
```
┌─────────────────────────────────┐
│ Payment Link                    │
├─────────────────────────────────┤
│                                 │
│ Generate a payment QR or link:  │
│                                 │
│ Amount: $47.00                  │
│                                 │
│ ○ One-time (this sale)          │
│ ● Reusable (all sales)          │
│                                 │
│  [Generate QR]                  │
│                                 │
│  ┌─────────────┐                │
│  │  ████ ████  │  QR Code       │
│  │  ████ ████  │  (displayed)   │
│  │  ████ ████  │                │
│  └─────────────┘                │
│                                 │
│  [Display on Screen]            │
│  [Print]                        │
│  [Copy Link]                    │
│                                 │
└─────────────────────────────────┘
```

### Shopper Side: Scan & Pay
**Shopper uses phone camera (not app):**

1. **Phone Camera:** Shopper opens default camera, points at QR
2. **Apple/Google prompt:** "Open in Safari" → taps
3. **Stripe Checkout Page:** Pre-filled amount shown
4. **Card Entry:** Shopper enters card details
5. **Confirmation:** Shows receipt

### Organizer Real-Time Confirmation
```
┌─────────────────────────────────┐
│ Open Payments                   │
├─────────────────────────────────┤
│ Total: $47.00                   │
│ Paid via QR: $47.00       ✓ NEW │
│                                 │
│  [Update Cart Status]           │
│  [Email Receipt]                │
│  [New Transaction]              │
│                                 │
└─────────────────────────────────┘
```

---

## Feature 4: Invoice via Email/SMS Flow (Organizer)

**Goal:** Organizer sends itemized invoice to shopper for payment at their own pace.

### Screen 1: Hold/Reservation List
```
┌─────────────────────────────────┐
│ My Holds                        │
├─────────────────────────────────┤
│                                 │
│ Active Holds (7)                │
│                                 │
│ Sarah M.              24h left   │
│ • Dresser                  $80  │
│ • Side table           $25      │
│ [Send Invoice] [Mark Sold]      │
│                                 │
│ James K.              2h left   │
│ • Set of plates            $15  │
│ [Send Invoice] [Mark Sold]      │
│                                 │
└─────────────────────────────────┘
```

### Screen 2: Send Invoice Modal
```
┌─────────────────────────────────┐
│ Send Invoice                    │
│ Sarah M.                        │
├─────────────────────────────────┤
│                                 │
│ Items (2):                      │
│ • Dresser         $80.00        │
│ • Side table      $25.00        │
│ ─────────────────────────       │
│ Total             $105.00       │
│                                 │
│ Send via:                       │
│ ● Email: sarah@email.com        │
│ ○ SMS: +1 (616) 555-0123       │
│ ○ Both                          │
│                                 │
│ Expiry:                         │
│ ○ 24 hours (default)            │
│ ○ 7 days                        │
│ ○ 30 days                       │
│                                 │
│ [Send Invoice]  [Cancel]        │
│                                 │
└─────────────────────────────────┘
```

### Screen 3: Invoice Email Template (Shopper Receives)
```
Subject: "Your items are ready! – FindA.Sale Estate Sale"

Hello Sarah,

We've set aside these items for you:
• Dresser – $80.00
• Side table – $25.00

Total: $105.00

[PAY NOW] (→ Stripe checkout)

This hold expires in 24 hours.
Not interested? No problem — we'll put them back for sale.

Questions? Reply to this email.
```

### Screen 4: Confirmation
```
┌─────────────────────────────────┐
│ Invoice Sent                    │
├─────────────────────────────────┤
│                                 │
│  ✓ Invoice sent to              │
│    sarah@email.com              │
│                                 │
│  Expires: Tomorrow at 2:34 PM   │
│                                 │
│  Status: Awaiting payment       │
│                                 │
│  [View Invoice]  [Done]         │
│                                 │
└─────────────────────────────────┘
```

### Organizer Payment Status
```
Organizer dashboard shows:
Sarah M.  |  Dresser + table  |  $105  |  Inv. sent 2h ago
Status: PENDING_PAYMENT         [Cancel Hold]
```

---

## Feature 5: Open Carts Flow (Flagship Feature)

**Goal:** Shopper browses freely, scans items into personal cart, pays when ready.

### Shopper Journey: A. Building Cart

**Screen 1: Shopper Home → Cart**
```
┌─────────────────────────────────┐
│ Tap "Scan Item" or browse sale  │
├─────────────────────────────────┤
│                                 │
│  [Scan Item]  [Browse]          │
│                                 │
│  Your Cart (2)                  │
│  ────────────────────────────   │
│  • Blue Vase         $12.00     │
│  • Table Lamp        $20.00     │
│                                 │
│  Subtotal: $32.00               │
│                                 │
│  [Continue Shopping]            │
│  [Checkout]                     │
│                                 │
└─────────────────────────────────┘
```

**Screen 2: Scan Item (Shopper Camera)**
```
Same flow as organizer scanning (Feature 1).
Shopper scans QR, item added to personal cart in-app.
```

**Screen 3: Item Added (Shopper)**
```
┌─────────────────────────────────┐
│ ✓ Added to Your Cart            │
├─────────────────────────────────┤
│                                 │
│  Blue Vase                      │
│  $12.00                         │
│                                 │
│  Your Cart (2)                  │
│  [Continue Shopping]            │
│  [Checkout Now]                 │
│                                 │
│  Cart is waiting for you. No    │
│  hold time limit.               │
│                                 │
└─────────────────────────────────┘
```

### Organizer Journey: B. Managing Shoppers at Checkout

**Screen 1: Open Carts Dashboard**
```
┌─────────────────────────────────┐
│ Open Carts                      │
│ Sale: Summer Estate Sale        │
├─────────────────────────────────┤
│ Active Shoppers (3)             │
│                                 │
│ Sarah M.                        │
│ 4 items  |  $47.50              │
│ [View Cart] [Request Payment]   │
│                                 │
│ James K.                        │
│ 1 item   |  $12.00              │
│ [View Cart] [Request Payment]   │
│                                 │
│ Margaret L.                     │
│ 6 items  |  $89.75              │
│ [View Cart] [Request Payment]   │
│                                 │
└─────────────────────────────────┘
```

**Screen 2: View Shopper's Cart**
```
┌─────────────────────────────────┐
│ Sarah M.'s Cart                 │
│ Verify items in person          │
├─────────────────────────────────┤
│                                 │
│ □ Blue Vase        $12.00       │
│ □ Table Lamp       $20.00       │
│ □ Book lot         $15.00       │
│ □ Ceramic bowl     $0.50        │
│                                 │
│ ─────────────────────────────   │
│ Subtotal           $47.50       │
│                                 │
│ [Apply Coupon/Discount]         │
│                                 │
│ [Request Payment]  [Done]       │
│                                 │
│ (Check off items as verified)   │
│                                 │
└─────────────────────────────────┘
```

**Screen 3: Request Payment (Organizer Sends)**
```
┌─────────────────────────────────┐
│ Request Payment                 │
│ Sarah M.                        │
├─────────────────────────────────┤
│                                 │
│ Amount: $47.50                  │
│                                 │
│ Payment Options for Shopper:    │
│ ● Card (in app)                 │
│ ○ Card (she enters her own)     │
│ ○ Apple Pay / Google Pay        │
│                                 │
│ Message (optional):             │
│ "Great selections! Ready to    │
│  check out?"                   │
│                                 │
│ [Send Request]  [Cancel]        │
│                                 │
└─────────────────────────────────┘
```

### Shopper Journey: C. Responding to Payment Request

**Screen 1: Payment Notification**
```
Push Notification:
"Sarah, your items are ready for checkout ($47.50). Tap to pay."
```

**Screen 2: Payment Confirmation Screen**
```
┌─────────────────────────────────┐
│ Ready to Checkout?              │
│                                 │
│ Your items:                     │
│ • Blue Vase        $12.00       │
│ • Table Lamp       $20.00       │
│ • Book lot         $15.00       │
│ • Ceramic bowl     $0.50        │
│                                 │
│ Total: $47.50                   │
│                                 │
│ [Pay with Saved Card]           │
│ [Enter Card Info]               │
│ [Apple Pay]                     │
│                                 │
│ [Decline]                       │
│                                 │
└─────────────────────────────────┘
```

**Screen 3: Payment Success (Both Sides)**
```
SHOPPER:                          ORGANIZER:
┌──────────────────┐              ┌──────────────────┐
│ Payment Sent     │              │ Payment Received │
│ ✓ $47.50        │              │ ✓ Sarah M.      │
│ Confirm at       │              │ $47.50          │
│ checkout         │              │ [Print Receipt]  │
│ [Get Receipt]    │              │ [New Customer]   │
└──────────────────┘              └──────────────────┘
```

### Edge Cases & Recovery

**Shopper leaves without checkout:**
- Cart persists in organizer's "Open Carts" for the sale duration
- Organizer can manually confirm / abandon cart
- Shopper can return to app and resume anytime

**Payment fails:**
- Shopper sees: "Payment declined. Retry or use cash payment?"
- Organizer sees: "Payment pending from Sarah M. ($47.50)" — can retry or call over shopper

**Cart conflict (item sold to someone else):**
- If item removed from inventory during open cart, show: "Item no longer available. Remove from your cart?"
- Reduce cart total accordingly

---

## Feature 6: Share Your Find + App Download Prompts

### Post-Purchase: "Share Your Find"
```
┌─────────────────────────────────┐
│ Great Find!                     │
│                                 │
│  [Photo of item purchased]      │
│                                 │
│  "I found this at an estate     │
│   sale via FindA.Sale!"         │
│                                 │
│  [Share to Instagram]           │
│  [Share to Facebook]            │
│  [Copy Link]                    │
│  [Skip]                         │
│                                 │
│ Help other treasure hunters     │
│ find their next favorite.       │
│                                 │
└─────────────────────────────────┘
```

### For QR Code Shoppers (Not App Users Yet)
```
After payment via QR code:

┌─────────────────────────────────┐
│ Find More Items Here            │
│                                 │
│  [App Store Badge]              │
│  [Google Play Badge]            │
│                                 │
│ Download the FindA.Sale app to: │
│ • Browse more sales            │
│ • Build wishlists              │
│ • Get early notifications      │
│                                 │
│ [Download]  [Not Now]           │
│                                 │
└─────────────────────────────────┘
```

---

## Coupon/Discount Application

**At POS (Organizer):**
```
┌─────────────────────────────────┐
│ Apply Discount                  │
├─────────────────────────────────┤
│                                 │
│ Cart: $47.50                    │
│                                 │
│ Discount Code:                  │
│ [INSIDER10      ✓]              │
│                                 │
│ Discount: -$4.75 (10%)          │
│                                 │
│ New Total: $42.75               │
│                                 │
│ [Confirm]  [Remove]             │
│                                 │
└─────────────────────────────────┘
```

---

## Key UI States & Patterns

### Loading States (all features)
- Spinner with "Processing..." message
- Disable buttons during load
- Show estimated time if > 2 seconds

### Success States
- Green checkmark icon, 200ms pulse
- Toast message (2-3 seconds, dismissible)
- Haptic feedback on mobile

### Error States
- Red/orange alert box with icon
- Clear explanation: "Why" + "What to do next"
- Always provide recovery option (retry, fallback, contact support)

### Empty States
- "No open carts yet" when shopper list is empty
- "Scan your first item to start" on blank cart

### Dark Mode
- All whites → #f5f5f5 (light gray)
- All blacks → #1a1a1a (dark gray)
- Form backgrounds → slightly lighter than page
- Inputs → clear border (white or 40% opacity border)

### Mobile Considerations
- All buttons ≥44px tall for thumb-tappable targets
- Forms stack vertically, no side-by-side
- Camera view full-screen, safe-area-aware
- Numpad buttons large (avoid typos)
- Floating action buttons for primary CTA

---

## Accessibility Requirements

- **Keyboard navigation:** All flows completable without mouse/touch
- **Screen readers:** Form labels announced, state changes narrated
- **Color contrast:** WCAG AA minimum (4.5:1 text, 3:1 UI)
- **Focus indicators:** Visible on all interactive elements
- **Motion:** Animations ≤300ms, reduced-motion respected
- **Camera access:** Request permission explicitly, with explanation

---

## Copy Guidelines (Tone: Friendly, Clear, Action-Oriented)

- **Errors:** "Card was declined. Have them try another card or pay cash." (not "Error 402")
- **Confirmations:** "✓ Charged $47.50. Receipt sent to sarah@email.com."
- **Guidance:** "Hold the camera steady at arm's length. Tap the QR tag."
- **Buttons:** Action verbs: "Scan Item", "Request Payment", "Send Invoice"

---

## Navigation Summary

| Feature | Organizer Entry | Shopper Entry |
|---------|---|---|
| **Scan QR** | POS tab → Scan Item | Cart tab → Scan Item |
| **Manual Card** | POS tab → Checkout → Manual Entry | N/A |
| **Payment QR** | POS tab → Payment Link | Phone camera (not app) |
| **Invoice** | Holds tab → Send Invoice | Email / SMS link |
| **Open Carts** | POS tab → Open Carts | Cart tab → submit at cashier |

---

## Next Steps (Dev Handoff)

1. **Schema confirm:** Verify `holds`, `carts`, `invoices` tables exist with payment_status, expiry, item tracking
2. **Stripe integration:** Ensure payment QR + verification webhooks ready
3. **Notifications:** Set up push notifications for payment requests + invoice reminders
4. **Camera permissions:** Implement camera access request + graceful degradation
5. **Real-time sync:** Open Carts must reflect payment status within 1 second
