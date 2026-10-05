import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'pricing-items',
  title: "Pricing an item: suggested price, comparable sales, and your override",
  audience: 'organizer',
  format: 'written+video',
  priority: 1,
  relatedGuides: ['review-queue', 'condition-grades', 'edit-live-listing'],
  videoUrl: undefined,
  body: `When you ask for one, the app looks up what similar things have actually sold for recently and suggests a price. You don't have to use it, and the app never fills your price in for you. Your price always wins. But understanding where the suggestion comes from (and how to read the supporting data) makes it easier to decide when to trust it and when to set your own number.

This guide covers how the suggested price works, how to read the comp tiles, and what happens when you override.

---

## Step 1: Where the suggested price comes from

Tap **Suggest Price** under the price field. The app uses what it knows about the item (category, brand when visible, approximate age, material, condition) to run a comparable-sale lookup: recent sold prices for similar items in similar condition across secondary sale sources.

The result is a suggested price based on where comparable items have been clearing, sometimes with a range. It's a starting point, not a directive. To apply it, tap **Use $X**. Nothing is filled in until you do.

You'll find Suggest Price in two places:
- On each item card in the review queue, next to your price
- In the Pricing section of the item form (the Edit Item page, or the slide-up sheet from All details)

The lookups run only when you tap a button, such as Suggest Price or **Look up comparable prices**. They don't run on their own when you open an item.

---

## How the grade adjusts the suggestion

For used items, the suggestion is adjusted by condition grade: A x1.10, B x1.00, C x0.85, D x0.65. When an adjustment applies, the suggestion says so, for example "Adjusted for grade C (x0.85)."

In the review queue, tapping a different grade under More details shows a new suggested price the same way, and you tap **Use $X** to apply it. New, Refurbished and Parts / Repair items are not adjusted.

---

## Step 2: How to read the comp tiles

Comp tiles are the comparable sales that informed the suggested price. In the Pricing section, **Look up comparable prices** shows the price range and how many comparable sales were found, and the collapsed Price Research panel holds the other tools. Each tile shows:

- **Item description**: what the comparable item was
- **Sold price**: what it actually sold for (not listed price, sold)
- **Condition**: what grade the comparable was listed at
- **Time since sold**: how recent the sale was (older comps carry less weight)
- **Source**: where the comparable sale came from

Read them left to right. The tile closest to your item in condition and recency is the most useful signal.

**What to look for:**
- Are the comps actually similar, or just in the same category? A mid-century credenza and a flat-pack dresser are both "Furniture" but shouldn't share a price.
- Are the condition grades consistent with yours? If your item is a C (Good) but the comps are all A (Excellent) or B (Very good), the suggested price may be high.
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
- Comps are sparse: only 1 or 2, and they vary widely
- The item is unusual and comps are pulling from something that only superficially resembles it
- You have experience with what this item actually sells for at your type of sale

For estate sales and consignment, you likely know your items well enough to have a house price in mind. For yard sales and flea markets, the suggestion is often accurate enough for general goods. Auctions are different. See below.

---

## Step 4: Setting your own price

In the review queue, tap the price field on any item card and type your number. Your price is saved when you tap **Approve**. The other card edits save on their own as drafts.

In the item form, type your number in the Pricing section and tap **Save Changes**. If the item is on eBay, the line above Save tells you whether the new price will be sent there.

Your price is what shoppers see. The comp data stays for your reference. If you want the suggestion back after typing your own number, tap **Suggest Price** again and then **Use $X**.

---

## Step 5: How your prices affect future suggestions

When you set prices manually, the app notes that. Over time, if items you priced are selling (or not selling), that pattern feeds back into calibration. Organizers who consistently price a category higher than the suggestion (and those items sell) will see suggestions drift upward for similar items in future sessions.

This is gradual, not immediate. But pricing accurately is the fastest path to suggestions that match your style of sale and your specific inventory.

---

## Step 6: Pricing for auctions vs. fixed-price sales

For **auction-format sales**, the starting bid is what matters, not a final price. Set your starting bid low enough to invite opening bids (typically 20–30% of comparable value), not at the full comp price. The comp tiles are still useful as a ceiling reference.

For **fixed-price yard sales and flea markets**, the suggested price is usually slightly above what a fast sell requires. Price to sell, not to hold.

For **consignment**, you may have a client-agreed price already. Enter it directly. The suggestion is there for reference if a client disputes your estimate.

---

## Common questions

**Can I price something at $0 or free?**
Yes. Enter 0 as the price. The item will show as "Free" on the listing. Useful for things you want gone: packing material, partial sets, items with minor damage.

**What if I'm not sure what something is worth?**
Open the comp tiles, look at the range, and pick somewhere in the middle for a B-condition item. If the item is unusual or you can't find good comps, a conservative price (low end of range) moves it faster. You can always edit the price after publishing.

**Does the price include tax?**
No. The price is the item price. Tax handling is a separate sale-level setting in your organizer dashboard.

**Will shoppers see the suggested price or just my price?**
Shoppers only ever see the price you set. The comparable-sale data is internal to your review workflow.

**What happens if I don't set a price?**
Items without a price are flagged in the review queue with a warning. You can't publish them until a price is entered. There's no default of $0: a blank price means "not ready."

**Can I apply a price to multiple items at once?**
Not in the review queue. Each item is priced individually. For bulk pricing (e.g., "all books $1"), use the Category Price Override in Sale Settings: this sets a floor price for all items in a category that don't have a manual price.

---

## Video script

*[60-second screen-capture VO: cut to match actual screen recording]*

---

**[0:00: Item card in review queue, price field empty]**

"When you want a suggestion, tap Suggest Price. The app looks up what similar items have actually sold for recently and suggests a price. Nothing is filled in until you tap Use."

**[0:10: Comparable sales open]**

"Tap Look up comparable prices to see the sales behind it. Each tile shows what a similar item sold for, in what condition, and how recently. This is sold data: not what someone listed, what it actually cleared for."

**[0:22: Point to condition column and recency]**

"Check the condition and the date. A comp from six months ago in excellent condition isn't a great guide for your good-condition item today. Look for recent comps that match your item's grade."

**[0:35: Type an override price]**

"If the comps look off, or you know what this item is worth: just type your price. Your number is the price. It saves when you approve the item."

**[0:45: Show the item card updated with new price]**

"Your price is what shoppers see. The comparable data stays in the background for your reference, but buyers only ever see the number you set."

**[0:53: Closing]**

"Suggested price is a starting point. Your override always wins."

---

## Related guides

- [The review queue: from photo to live listing](review-queue)
- [Picking the right condition and grade](condition-grades)
- [Editing a listing after it's already live](edit-live-listing)`,
};

export default entry;
