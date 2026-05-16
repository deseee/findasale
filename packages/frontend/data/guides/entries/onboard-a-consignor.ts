import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'onboard-a-consignor',
  title: "Onboard a consignor and set their split",
  audience: 'organizer',
  format: 'written+video',
  priority: 1,
  relatedGuides: ['settle-up-reconcile-sales-and-get-your-payout', 'pricing-an-item-suggested-price-and-your-override', 'the-review-queue-from-photo-to-live-listing'],
  videoUrl: undefined,
  body: `Consignment means someone else's items are listed and sold through your sale. You manage the photos, pricing, and transactions. After the sale closes, you pay them their share. FindA.Sale tracks every consignor's items separately so the math happens automatically.

---

## What you need before you start

- The consignor's name and email address
- The payout split you've agreed on (example: consignor keeps 60%, you keep 40%)

You can change the split later, but the agreed percentage locks in at settlement, so confirm it before you list any of their items.

---

## Step 1. Add the consignor

1. Go to **Organizer → Consignors**.
2. Tap **Add Consignor**.
3. Enter their name and email address.
4. Set the **Payout Split** — enter the consignor's percentage. If they keep 60 cents of every dollar, type \`60\`.
5. Tap **Save**.

The consignor receives an email with a link to their read-only portal. They don't need to create an account.

---

## Step 2. Tag items to the consignor

When you add or edit an item:

1. Open the item in your inventory or review queue.
2. Find the **Consignor** dropdown.
3. Pick the consignor's name from the list.
4. Save the item.

That item is now linked to that consignor. You can tag as many items as you need. There's no limit per consignor.

If you forget to tag an item before the sale closes, you can still edit it in settlement. Tagging before close is cleaner — do it at photo time if you can.

---

## Step 3. What the consignor sees

When consignors open their portal link, they see:

- A list of their items with photos and asking prices
- Status for each item: active, on hold, or sold
- Their running total as items sell

They can't see other consignors' items. They can't see your total revenue. They can't see items that aren't tagged to them. The portal is read-only — they can't edit prices or item details.

If a consignor asks why an item isn't showing up, check that the Consignor field is set on that item.

---

## Step 4. Settle up after the sale

When you close the sale:

1. Go to **Organizer → Settlement**.
2. The Settlement hub lists every consignor with their total sold, your cut, and their payout amount.
3. You can export a line-item breakdown for each consignor as a CSV — useful if they want to see exactly what sold.
4. Mark the payout as sent after you pay them (bank transfer, check, Venmo — however you've agreed).

FindA.Sale does not initiate the payout to the consignor. That part is between you and them. The Settlement hub gives you the number; you make the payment.

---

## Common questions

**Can I add a consignor mid-sale?**
Yes. You can add a consignor and start tagging their items at any point before close.

**Can a consignor have a different split for different items?**
Not directly. The split is set per consignor. If you need different rates for the same person across different categories, the workaround is to create two separate consignor entries (example: "Maria — Jewelry" at 70% and "Maria — Furniture" at 50%).

**What if I forget to tag an item before the sale closes?**
You can still assign it in the Settlement hub before you mark the consignor as paid. Do it before you export their line items.

**Can I run consignors across multiple sale types?**
Yes. The consignor system works the same way for yard sales, flea market booths, and pop-up consignment events. The item tagging and settlement process is identical.

**Does the consignor get notified when their item sells?**
Not automatically in real time. Their portal updates as sales happen, so they can check it. If you want to notify them, you'd do that manually.

**What if an item is returned or a hold falls through?**
If a held item is released, the status resets to active in the consignor's portal automatically. Returns after close need to be handled manually in Settlement — adjust the line item before you export.

---

## Related guides

- [Settle up: reconcile sales and get your payout](settle-up-reconcile-sales-and-get-your-payout.md)
- [Pricing an item: suggested price and your override](pricing-an-item-suggested-price-and-your-override.md)
- [The review queue: from photo to live listing](the-review-queue-from-photo-to-live-listing.md)

---

## Video script

**[60-second VO script — screen recording over app UI]**

---

**[0:00–0:08]**
If you're selling items on behalf of someone else — a client, a family, a neighbor — FindA.Sale tracks their items separately and calculates their payout automatically.

**[0:08–0:18]**
Go to Organizer, then Consignors. Tap Add Consignor. Enter their name, their email, and the percentage they keep. Say they keep 60% — type 60. Save it.

**[0:18–0:25]**
They'll get an email with a link to their portal. They can check what sold and what's still active. Read-only — they can't change anything.

**[0:25–0:38]**
Now tag their items. Open any item in your inventory. Find the Consignor dropdown and pick their name. Do that for every item that belongs to them. You can do it at photo time or anytime before close.

**[0:38–0:50]**
When the sale closes, go to Settlement. Their total is already calculated — what sold, your cut, what you owe them. Export the line items as a CSV if they want the details.

**[0:50–1:00]**
You make the payment however you've agreed — bank transfer, check, whatever. Mark it paid in FindA.Sale. That's it. No spreadsheet math, no manual tallying.`,
};

export default entry;
