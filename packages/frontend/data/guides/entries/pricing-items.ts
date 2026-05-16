import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'pricing-items',
  title: "Pricing an item: suggested price, comparable sales, and your override",
  audience: 'organizer',
  format: 'written+video',
  priority: 1,
  relatedGuides: ['review-queue', 'condition-grades', 'edit-live-listing'],
  videoUrl: undefined,
  body: `When you photograph an item, the app looks up what similar things have actually sold for recently and suggests a price. You don't have to use it. Your price always wins. But understanding where the suggestion comes from — and how to read the supporting data — makes it easier to decide when to trust it and when to set your own number.

This guide covers how the suggested price works, how to read the comp tiles, and what happens when you override.

---

## Step 1: Where the suggested price comes from

When an item goes through photo recognition, the app identifies what the item is (category, brand when visible, approximate age, material). It then runs a comparable-sale lookup: recent sold prices for similar items in similar condition across secondary sale sources.

The result is a suggested price — a single number, not a range — based on where comparable items have been clearing. It's a starting point, not a directive.

You'll see the suggested price in two places:
- On the item card in the review queue
- In the item detail view, just below the photo

Tap the info icon next to the price to open the comp tiles.

---

## Step 2: How to read the comp tiles

Comp tiles are the comparable sales that informed the suggested price. Each tile shows:

- **Item description** — what the comparable item was
- **Sold price** — what it actually sold for (not listed price — sold)
- **Condition** — what grade the comparable was listed at
- **Time since sold** — how recent the sale was (older comps carry less weight)
- **Source** — where the comparable sale came from

Read them left to right. The tile closest to your item in condition and recency is the most useful signal.

**What to look for:**
- Are the comps actually similar, or just in the same category? A mid-century credenza and a flat-pack dresser are both "Furniture" but shouldn't share a price.
- Are the condition grades consistent with yours? If your item is a B (Good) but the comps are all A (Excellent), the suggested price may be high.
- How old are the comps? Recent sales (30 days) are more reliable than 90-day-old data.

If the comps look accurate, the suggested price is probably a solid starting point. If they don't look like your item, set your own price.

---

## Step 3: When to trust the suggestion vs. override it

**Good signal to trust:**
- 3 or more comps in a consistent price range
- Condition grades match yours
- Comps are recent (30 days or less)
- Item category is specific (not just "Miscellaneous")

**Reasons to override:**
- You know the item's provenance and it changes the value (original packaging, signed, documented history)
- Comps are sparse — only 1 or 2, and they vary widely
- The item is unusual and comps are pulling from something that only superficially resembles it
- You have experience with what this item actually sells for at your type of sale

For estate sales and consignment, you likely know your items well enough to have a house price in mind. For yard sales and flea markets, the suggestion is often accurate enough for general goods. Auctions are different — see below.

---

## Step 4: Setting your own price

In the review queue, tap the price field on any item card. Type your number. Tap Save (or tap the next field to move on).

In the detail view, tap the price to edit it inline.

Your price immediately replaces the suggestion. The comp tiles remain visible for reference, but the suggested price is no longer shown once you've overridden it.

There's no "revert to suggested" button — if you want to go back to the original suggestion after overriding, tap the info icon to see the comps and recalculate manually.

---

## Step 5: How your prices affect future suggestions

When you set prices manually, the app notes that. Over time, if items you priced are selling (or not selling), that pattern feeds back into calibration. Organizers who consistently price a category higher than the suggestion — and those items sell — will see suggestions drift upward for similar items in future sessions.

This is gradual, not immediate. But pricing accurately is the fastest path to suggestions that match your style of sale and your specific inventory.

---

## Step 6: Pricing for auctions vs. fixed-price sales

For **auction-format sales**, the starting bid is what matters — not a final price. Set your starting bid low enough to invite opening bids (typically 20–30% of comparable value), not at the full comp price. The comp tiles are still useful as a ceiling reference.

For **fixed-price yard sales and flea markets**, the suggested price is usually slightly above what a fast sell requires. Price to sell, not to hold.

For **consignment**, you may have a client-agreed price already. Enter it directly. The suggestion is there for reference if a client disputes your estimate.

---

## Common questions

**Can I price something at $0 or free?**
Yes. Enter 0 as the price. The item will show as "Free" on the listing. Useful for things you want gone — packing material, partial sets, items with minor damage.

**What if I'm not sure what something is worth?**
Open the comp tiles, look at the range, and pick somewhere in the middle for a B-condition item. If the item is unusual or you can't find good comps, a conservative price (low end of range) moves it faster. You can always edit the price after publishing.

**Does the price include tax?**
No. The price is the item price. Tax handling is a separate sale-level setting in your organizer dashboard.

**Will shoppers see the suggested price or just my price?**
Shoppers only ever see the price you set. The comparable-sale data is internal to your review workflow.

**What happens if I don't set a price?**
Items without a price are flagged in the review queue with a warning. You can't publish them until a price is entered. There's no default of $0 — a blank price means "not ready."

**Can I apply a price to multiple items at once?**
Not in the review queue. Each item is priced individually. For bulk pricing (e.g., "all books $1"), use the Category Price Override in Sale Settings — this sets a floor price for all items in a category that don't have a manual price.

---

## Video script

*[60-second screen-capture VO — cut to match actual screen recording]*

---

**[0:00 — Item card in review queue, suggested price visible]**

"When you photograph something, the app looks up what similar items have actually sold for recently and suggests a price. You'll see it right here on the item card."

**[0:10 — Tap info icon, comp tiles open]**

"Tap the info icon to see the comparable sales behind it. Each tile shows what a similar item sold for, in what condition, and how recently. This is sold data — not what someone listed, what it actually cleared for."

**[0:22 — Point to condition column and recency]**

"Check the condition and the date. A comp from six months ago in excellent condition isn't a great guide for your good-condition item today. Look for recent comps that match your item's grade."

**[0:35 — Type an override price]**

"If the comps look off, or you know what this item is worth — just type your price. Your number replaces the suggestion immediately. There's nothing to toggle, nothing to confirm. You type it, it saves."

**[0:45 — Show the item card updated with new price]**

"Your price is what shoppers see. The comparable data stays in the background for your reference, but buyers only ever see the number you set."

**[0:53 — Closing]**

"Suggested price is a starting point. Your override always wins."

---

## Related guides

- [The review queue: from photo to live listing](review-queue)
- [Picking the right condition grade (with examples)](condition-grades)
- [Editing a listing after it's already live](edit-live-listing)`,
};

export default entry;
