import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'run-the-pos',
  title: 'Run The Pos',
  audience: 'both',
  format: 'written',
  priority: 2,
  relatedGuides: [],
  videoUrl: undefined,
  body: `# Run the POS: take payments in person

The POS is your checkout screen on sale day.
Open it on your phone or tablet, scan an item or search by name, and the total builds as you go.
Tap Checkout when the shopper is ready and pick how they're paying.
That's it.
Sold items drop off the live listing the moment a transaction closes.

Bookmark \`/organizer/pos\` on your phone now so you're not hunting for it at 8 a.m.

---

## Before you start

- Your sale must be published and set to Active.
- Stripe must be connected if you want card or payment-link checkout. (Cash and Venmo/Zelle work without Stripe.)
- Charge your tablet or phone the night before. The POS is the one screen you can't afford to lose.

---

## How to use the POS

### 1. Open the POS

Go to \`/organizer/pos\` or tap POS in the organizer nav.
You'll see a search bar, an empty cart, and your payment options at the bottom.

### 2. Add items to the cart

Two ways to add an item:

**Scan the QR code.** Every listed item has a QR sticker or tag you can print from the inventory screen. Point your camera, tap the result, and it lands in the cart at its listed price.

**Search by name.** Type a keyword in the search bar. Tap the item in the results.

Repeat for everything the shopper is buying.
Remove an item by tapping the X next to it.

### 3. Review the total

The cart shows each item, its price, and the running total.
You don't need to calculate anything.

### 4. Tap Checkout and pick a payment method

**Cash.** The screen shows the amount owed. You hand back change. Tap Confirm.

**Venmo.** A QR code appears pre-filled with your Venmo handle and the exact total. The shopper opens Venmo, scans, and pays. Once you see the notification, tap Confirm.

**Zelle.** Your Zelle handle appears with a copy button next to it. The shopper sends the amount. Tap Confirm when it arrives.

**Stripe in-person link.** Available if you've connected Stripe. Tap to generate a link or QR code. The shopper pays on their phone. The POS confirms automatically when payment clears.

### 5. Items are marked sold

As soon as you tap Confirm, every item in that cart is marked sold.
They disappear from the public listing immediately.
No one else can add them to a hold or see them in search.

If you need to undo a transaction, tap POS History, find the sale, and tap Void.
Items return to active inventory.

### 6. Mark sold manually for cash

If a cash transaction happened outside the POS (e.g., you were away from your device), find the item in inventory and tap Mark Sold.
This removes it from the live listing without running a checkout.

---

## Running the line queue at the same time

The line queue and the POS both run in your organizer nav.
Switch between them in the same browser tab or use two tabs on a tablet.
One device handles both.

---

## If your connection drops

The POS stays open in offline mode for cash transactions.
You can still add items and tap Confirm.
The sale logs locally and syncs when your connection comes back.
Venmo, Zelle, and Stripe links need a connection — those are on the shopper's device anyway.

---

## Common questions

**Can I adjust the price at checkout?**
Not from the POS cart directly. Edit the listing price first, then add the item to the cart.
For a one-off discount, complete the checkout at the listed price and accept a lower cash amount — just note it for your records.

**What if I scan an item that's already sold?**
The POS won't add it to the cart. Sold items are filtered out of scan results.

**Can two staff members use the POS at the same time?**
Yes, from separate devices logged into the same organizer account. If they ring up the same item simultaneously, the first to confirm gets it; the second sees a "no longer available" error.

**Do I need a receipt printer?**
No. The POS can text or email a receipt to the shopper. A printer speeds things up but isn't required.

**What if a shopper pays Venmo but for the wrong amount?**
Don't tap Confirm until the correct amount shows in your Venmo notifications. Ask them to send the difference or void and re-do the transaction.

**Can I run the POS without internet?**
Cash transactions only. Venmo, Zelle, and Stripe require a connection on your side or the shopper's. Plan accordingly at sales with poor cell service.

---

## Related guides

- [Settle up: reconcile sales, pay consignors, and get your payout](/guides/settlement-and-payouts)
- [The line queue: manage walk-up traffic](/guides/line-queue)
- [Onboard a consignor and set their split](/guides/onboard-a-consignor-and-set-their-split)`,
};

export default entry;
