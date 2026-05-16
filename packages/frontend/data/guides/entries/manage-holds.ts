import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'manage-holds',
  title: "Manage holds: approve, extend, and cancel",
  audience: 'organizer',
  format: 'written+video',
  priority: 1,
  relatedGuides: ['print-inventory-sheets', 'discount-rules-and-markdowns'],
  videoUrl: undefined,
  body: `A hold lets a shopper reserve an item before they arrive to pick it up. You stay in control — you approve or deny, set the window, and release the item if they don't show.

---

## How holds work

When a shopper taps "Hold this item," you get a push notification. The item is flagged as Held in your inventory but stays in your count — it is not marked sold until you confirm the transaction.

From there, three things can happen:

- You approve the hold — the shopper gets a confirmation with the pickup window.
- You deny it — the item returns to Available and the shopper is notified.
- You do nothing — after a short window, the hold auto-approves.

The auto-approve default keeps things moving during a busy sale day. You can turn it off in your sale settings if you prefer manual review for every request.

---

## Where to see all holds

Go to **/organizer/holds**.

The list shows all active holds across your sales. Filter by sale or sort by expiry time — holds closest to expiring appear at the top so nothing slips through.

Each hold card shows:

- Item name and photo
- Shopper name and contact
- Time remaining before the hold expires
- Approve / Deny / Extend buttons

---

## How to approve or deny a hold

1. Open **/organizer/holds** or tap the hold from your push notification.
2. Review the item and shopper details.
3. Tap **Approve** or **Deny**.

The shopper gets a notification either way.

---

## How to extend a hold

Sometimes a shopper is running late and asks for more time. To extend:

1. Find the hold in **/organizer/holds**.
2. Tap the hold card to open details.
3. Tap **Extend**.
4. Pick the new expiration window.
5. Save — the shopper is notified automatically.

You can extend a hold as many times as you want before it expires.

---

## How to cancel a hold

If an item sells in person or you no longer want to honor the hold:

1. Open the hold in **/organizer/holds**.
2. Tap **Cancel**.
3. Confirm — the shopper gets a notification that the hold was released.

The item status immediately returns to Available.

---

## What happens when a hold expires

If the shopper never shows and the hold window closes, the item automatically returns to Available status. No action needed from you.

At that point you have two options:

- Leave it in Available so other shoppers can claim it.
- Mark it sold if you ended up selling it in person during the hold window.

Expired holds do not charge or penalize the shopper — holds are not payments.

---

## How holds affect your inventory count

Held items stay in your inventory count. They show a "Held" badge rather than Available, so your team can see at a glance which items are spoken for without assuming they're sold.

The item only moves out of active inventory when you mark it sold or when the sale closes.

---

## Common questions

**Can a shopper place a hold without my approval?**
By default, holds auto-approve after a short window if you don't respond. You can switch to manual-only approval in your sale settings.

**Can I set a maximum hold duration?**
Yes. Set your default hold window in sale settings. Individual holds can be extended past that window if you choose.

**What if two shoppers request a hold on the same item?**
The first request is processed. The second shopper sees the item as Held and can add it to their watchlist or check back after the hold expires.

**Does a hold show up on the public sale page?**
Held items are still visible to shoppers but are marked "On Hold." Shoppers cannot request a second hold on an already-held item.

**Can I see a history of holds after my sale ends?**
Yes. Completed holds appear in your sale's transaction history under **/organizer/sales → [sale name] → Activity**.

**What if the shopper never picks up and I already approved?**
Cancel the hold from **/organizer/holds**. The item returns to Available. The hold history shows the outcome but there is no financial impact.

---

## Related guides

- [Print inventory sheets for walk-through reference](print-inventory-sheets)
- [Discount rules and markdown cycles](discount-rules-and-markdowns)

---

## Video script

**[45-second VO — screen recording of /organizer/holds]**

When a shopper requests a hold, you'll get a push notification right away.

Tap it — or go to /organizer/holds — to see everything waiting on your approval.

Holds are sorted by expiry time so the most urgent ones are always at the top.

To approve: tap the card, then Approve. The shopper gets a confirmation automatically.

Need to give them more time? Tap Extend, pick a new window, save. Done.

If the item sells in person before pickup, tap Cancel. The item goes back to Available and the shopper gets a heads-up.

If the hold window runs out and nobody picks up — no action needed. The item flips back to Available on its own.

Holds don't affect your sold count until you confirm the sale. They're a reservation tool, not a payment.`,
};

export default entry;
