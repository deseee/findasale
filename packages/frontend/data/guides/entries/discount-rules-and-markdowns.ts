import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'discount-rules-and-markdowns',
  title: "Discount rules and markdown cycles",
  audience: 'organizer',
  format: 'written',
  priority: 2,
  relatedGuides: ['color-rules', 'manage-holds'],
  videoUrl: undefined,
  body: `You have two tools for automatic price changes: discount rules and markdown cycles. They solve different problems. This guide covers both.

---

## The short version

**Discount rules** apply a fixed discount on a specific day or condition. You define the rule once; it fires automatically when the condition is met.

**Markdown cycles** drop the price incrementally over time until the item sells or hits a floor. Set it and walk away.

Use rules when you know the day you want a discount to kick in. Use cycles when you want to move an item before the sale closes no matter what.

---

## Discount rules

### What they do

A discount rule targets a group of items — by category, tag, or color — and applies a price reduction on a day you specify.

Examples:
- "All furniture priced over $50 gets 25% off on day 2."
- "Everything tagged 'electronics' is 15% off on Saturday."
- "Items with a red color tag drop to 50% off on the last hour of the sale."

The rule fires automatically. You don't touch anything on sale day.

### How to create a discount rule

1. Go to **/organizer/discount-rules**.
2. Tap **New Rule**.
3. Name the rule — something you'll recognize: "Day 2 furniture markdown."
4. Set the target: All items / by category / by color tag / by price range.
5. Set the discount: percentage off or flat dollar amount.
6. Set the trigger: a specific sale date, a day number (Day 1, Day 2), or an hour window on a specific day.
7. Save.

The rule activates automatically when the trigger condition is met during your sale.

### What discount rules are good for

- Category-based discounts on a scheduled day ("All clothing 50% off Sunday")
- Last-hour clearance across the board ("Everything 30% off the final two hours")
- Consignment markdowns on day 2 without renegotiating with each consignor

---

## Markdown cycles

### What they do

A markdown cycle drops an item's price on a schedule — every few hours, every day — until the item reaches a floor price you set.

Example: An auction item opens at $150. You set a cycle: drop 10% every 6 hours, floor at $50. If it doesn't sell by close, it'll have moved through five price points on its own.

### How to set up a markdown cycle

You can set cycles at the sale level or the item level.

**Per sale (applies to all items without an individual cycle):**
1. Open the sale in **/organizer/sales → Edit Sale**.
2. Find **Markdown Cycle** in the pricing section.
3. Set the starting price basis (full item price or a custom starting point), the drop amount (percentage or flat), the interval (hours or days), and the floor price.
4. Save.

**Per item (overrides the sale-level cycle for that item):**
1. Open the item in your inventory.
2. Tap **Edit → Pricing → Markdown Cycle**.
3. Set the same fields as above.
4. Save.

Item-level cycles always win over sale-level cycles.

### What markdown cycles are good for

- High-value items you want to sell before close rather than haul back
- Auction-style pricing for items where you don't know the right price
- Flea market or consignment runs where you'd rather move volume than negotiate

---

## Discount rules vs. markdown cycles: which to use

| Situation | Use |
|-----------|-----|
| You know the day you want a price change | Discount rule |
| You want to move an item before sale end, no fixed day | Markdown cycle |
| You're discounting by category or tag | Discount rule |
| You want incremental drops on a single item | Markdown cycle |
| You're running a multi-day sale with a scheduled clearance event | Discount rule |
| You're running a long consignment sale and don't want to reprice manually | Markdown cycle |

You can use both on the same sale. A discount rule might drop a category 25% on day 2. A markdown cycle on a specific piece of furniture might drop it an additional 10% every 4 hours regardless.

When both apply to the same item, the effective price uses whichever discount is greater. Check the inventory view before sale day to confirm effective prices.

---

## Common questions

**Do these fire automatically or do I need to start them?**
Both fire automatically once the sale is active and the trigger condition is met. You set them once.

**Can I turn off a rule or cycle mid-sale?**
Yes. Go to **/organizer/discount-rules** or the sale's pricing settings and deactivate the rule or cycle. Prices stop changing from that point forward.

**Will shoppers see the original price crossed out?**
Shoppers see the current effective price. Original prices are shown as crossed out when a discount is active, depending on your sale's display settings.

**Can a markdown cycle go below my floor price?**
No. The floor is a hard stop. The price will not drop below what you set.

**What if I set a discount rule and a markdown cycle on the same item?**
Both can be active. The effective price in the app reflects both. Review item prices in your inventory before the sale opens to avoid surprises.

**Can I copy rules from a previous sale?**
Not automatically right now. You'll create rules fresh for each sale. If you run the same setup often, keeping notes on your standard rule configs speeds this up.

---

## Related guides

- [Color rules: use tag colors for in-person sorting](color-rules)
- [Manage holds: approve, extend, and cancel](manage-holds)`,
};

export default entry;
