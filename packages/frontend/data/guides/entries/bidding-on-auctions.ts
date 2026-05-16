import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'bidding-on-auctions',
  title: "Bidding on auction items",
  audience: 'shopper',
  format: 'written',
  priority: 2,
  relatedGuides: ['holds-for-shoppers', 'pay-requests', 'condition-grades-for-shoppers'],
  videoUrl: undefined,
  body: `Some organizers run sales where items go to the highest bidder instead of selling at a fixed price. Those items look different from regular listings — you'll see a current bid amount, a timer, and a Bid button instead of a price tag and Buy button.

Fixed-price items and auction items can appear in the same sale. Look for the **Auction** badge on the item card to tell them apart.

---

## How to place a bid

**Step 1.** Open the item. You'll see the current bid, the number of bids placed so far, and the time remaining.

**Step 2.** Tap **Bid**. Enter an amount above the current bid. The app will tell you the minimum increment if your amount is too low.

**Step 3.** Tap **Confirm Bid**. Your bid is placed immediately. You'll get a confirmation notification.

**Step 4.** Watch for outbid notifications. If another shopper bids higher, you'll get a push notification so you can decide whether to bid again.

---

## Reserve price

Some items have a reserve — a minimum price the organizer is willing to accept. If the current bid is below the reserve, the item card shows **Reserve not met**. The item won't sell unless bidding reaches that floor. The reserve amount itself is not shown.

---

## Auto-extend

If a bid comes in during the last two minutes of an auction, the clock extends automatically — usually by two minutes. This prevents last-second sniping and gives everyone a fair shot. Keep an eye on the timer near the end.

---

## When you win

You'll get a notification as soon as the auction closes. After that, the organizer sends a pay request through the app with the final amount plus any applicable buyer's fee.

Pay the request through your FindA.Sale notification. The organizer will confirm pickup details — date, time, and location — in a follow-up message.

---

## Pickup and shipping for auction wins

Most auction wins are pickup only. The item detail page will say if the organizer offers shipping. If it's listed as pickup only, arrange a time with the organizer through the in-app message thread after you've paid.

Never arrange payment or shipping through outside channels. All payment goes through the pay request in the app.

---

## Common questions

**Can I set a maximum bid and let the app bid for me?**
Not currently. You place each bid manually.

**What happens if no one meets the reserve?**
The auction closes without a sale. The item may be relisted or the organizer may reach out directly.

**Can I hold an auction item?**
No. Holds apply to fixed-price items only. Active auction items cannot be held.

**What if I win but can't pick up the item?**
Message the organizer as soon as possible. Most organizers can adjust pickup timing. Backing out of a won auction may affect your standing on the platform.

**Is there a buyer's fee?**
Some organizers charge one. The item detail page will say so before you bid. The pay request will show the full breakdown.

---

## Related guides

- [Pay requests: how organizers bill you](/guides/pay-requests)
- [Holds: reserve an item before you get there](/guides/holds-for-shoppers)
- [What the condition grades mean](/guides/condition-grades-for-shoppers)

---

*Last updated: 2026-05-16*`,
};

export default entry;
