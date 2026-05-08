# Pre-Sale Payment Testing Guide

Test every payment path before your sale opens. This takes about 10 minutes and catches issues before real customers run into them.

---

## 1. Verify Your Stripe Account Is Connected

**Where:** Settings → Stripe Connect (or your subscription/earnings page)

Before anything else, confirm your Stripe account is fully onboarded. If you see a "Complete Setup" or "Connect Stripe" banner anywhere in FindA.Sale, do that first — no payments will process until onboarding is complete.

**Signs you're good:**
- You can see your Stripe dashboard link from FindA.Sale
- Earnings page shows a payout method

---

## 2. Run the POS Test Transaction

**Where:** POS page → select your sale → "Pre-Sale Test" card → "Run $1.00 Test Transaction"

This is the main pre-sale check. It sends a real $1 charge through Stripe's test environment (no actual money moves), records the purchase, and automatically checks off the "POS open and test transaction done" item on your progress checklist.

**What to do:**
1. Open the POS page and select your upcoming sale
2. Tap "Run $1.00 Test Transaction"
3. Wait for the "Test transaction successful" confirmation
4. Open your sale's progress checklist and confirm the POS task shows as complete

**What it tests:** POS connectivity, your Stripe account routing, the 10% platform fee calculation, and purchase record creation.

If the test fails, check that your Stripe account is fully onboarded (step 1) before troubleshooting further.

---

## 3. Test the Online Checkout (Payment Link / Self-Checkout QR)

**Where:** Your sale's public page → any item → "Buy Now" or via the QR checkout flow

If you're using self-checkout QR codes so shoppers can pay on their phones, test this before printing your QR materials.

**What to do:**
1. Navigate to your sale's public page (the shopper-facing URL)
2. Find any priced item and tap through to checkout
3. Use Stripe's test card: **4242 4242 4242 4242**, any future expiry, any CVC
4. Complete the checkout and confirm the purchase appears in your earnings/orders view

**What it tests:** The full shopper checkout flow, payment link routing, webhook processing, and your earnings record.

> Note: Test card numbers only work while your sale is in test/pre-live mode. If checkout asks for a real card, your Stripe account may already be in live mode — contact support.

---

## 4. Test In-Person POS (Manual Item Entry)

**Where:** POS page → search for an item → add to cart → charge

This tests the actual in-sale POS flow, not just connectivity.

**What to do:**
1. Open the POS page and select your sale
2. Search for an item by title or SKU and add it to the cart
3. Tap "Charge" and confirm the amount looks right (item price + any buyer's premium)
4. You don't need to complete a real charge — just verify items load correctly, prices are right, and the charge screen appears as expected

**What to check:**
- Item prices match what you set in your catalog
- The total includes the correct buyer's premium if applicable
- Your sale appears in the sale selector dropdown

---

## 5. Test Auction Checkout (Auction Sales Only)

**Where:** Your auction's admin panel → confirm a winning bid

If you're running an auction, test that winning bidder checkout works before your auction opens.

**What to do:**
1. Create a test auction item in your sale with a low starting bid
2. Confirm a bid as a winner from the admin side
3. Verify the winning bidder receives a checkout notification (email or in-app)
4. Have someone complete checkout using Stripe test card **4242 4242 4242 4242**
5. Confirm the winning purchase appears in earnings

---

## 6. Quick Checklist Before You Go Live

Run through this the day before your sale:

- [ ] Stripe account fully onboarded (no yellow banners)
- [ ] POS test transaction completed — checklist auto-checked ✓
- [ ] At least one item is priced and published
- [ ] QR codes printed (check-in, payment link, photo station if using)
- [ ] Float ready (if accepting cash alongside card payments)
- [ ] Sale start time is set correctly (check timezone)
- [ ] Sale marked as published and visible on the discovery feed

---

## Test Card Numbers (Stripe Test Mode)

| Card Number | What It Does |
|---|---|
| 4242 4242 4242 4242 | Succeeds — use this for most tests |
| 4000 0000 0000 0002 | Declines — tests your declined-card handling |
| 4000 0025 0000 3155 | Requires 3D Secure authentication |

Use any future expiry date (e.g. 12/30) and any 3-digit CVC.

---

*Questions? Message us through FindA.Sale or email support.*
