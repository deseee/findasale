import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'flip-report',
  title: "Read your flip report (price calibration over time)",
  audience: 'organizer',
  format: 'written',
  priority: 3,
  relatedGuides: ['pricing-an-item-suggested-price-and-your-override', 'discount-rules-and-markdown-cycles', 'settle-up-reconcile-sales-and-get-your-payout'],
  videoUrl: undefined,
  body: `The flip report shows you whether your prices are working. It compares what you asked to what you got, and how long each item sat before it sold. Over time it tells you where you're consistently leaving money on the table — and where you're underpricing items that fly off the floor.

---

## How to open it

Go to **Organizer → Flip Report**.

You can filter by sale, date range, or item category. Start with a single closed sale to get a clear picture before looking at trends across multiple sales.

---

## How to read the grid

Items are plotted on a two-axis grid:

**X axis — days to sell**
Items on the left sold quickly. Items on the right sat.

**Y axis — final price vs. asking price**
Items near the top sold at or above asking. Items near the bottom sold at a discount.

This gives you four zones to pay attention to:

**Top-left (sold fast, sold at price)**
These items were priced right. Buyers grabbed them without waiting for a discount. This is the target zone.

**Top-right (sat, but eventually sold at asking)**
Buyers took their time but eventually paid full price. These items might be niche — patient buyers find them eventually. Not a problem unless the sale was over before they sold.

**Bottom-left (sold fast, sold below asking)**
These are your underpriced items. They moved in the first hour, which sounds good — but it usually means you left money on the table. If several items land here in the same category, raise your opening price next time.

**Bottom-right (sat, sold at a discount)**
These items were overpriced and marked down to move. If the same category keeps showing up here across multiple sales, your opening price for that category is consistently too high.

---

## Patterns to watch for

**A category that keeps landing bottom-right.** You're starting too high on those items. Pull comps from recent sales before you price the next batch, or use the suggested price as your starting point instead of overriding it.

**Items that sold in the first hour.** Check the Y-axis position. If they sold at full price, you got lucky — price those higher next time. If they sold at a steep discount, you marked down too early.

**A flat line near zero on the Y axis.** This means you're pricing at market consistently. That's fine for fast-moving categories. For higher-value items, there may be room to test higher opening prices.

**The long tail on the right.** Items that sat for days near the end of the sale often needed a steeper markdown than you applied, or they were genuinely not worth listing at that price. Look at what category those are and decide whether they belong in your sales at all.

---

## How to use it before your next sale

1. Open the flip report for the last two or three sales.
2. Filter to the category you're about to price (furniture, jewelry, tools, collectibles).
3. Look at where those items landed on the grid.
4. If they cluster bottom-right, lower your opening price by 10–15%.
5. If they cluster bottom-left (sold fast at a discount), raise your opening price by 10–15%.
6. If they cluster top-left, you're already calibrated — stay the course.

You're not trying to nail a formula. You're trying to notice a drift and correct it. One adjustment at a time.

---

## How often to check it

Check it after every sale while the data is fresh. Spend five minutes — not more. The goal is to catch the same mistake before you make it twice.

If you run frequent sales (weekly or bi-weekly), a monthly review across all sales can surface category-level trends you'd miss looking at one sale at a time. Filter to 30 or 60 days and look for patterns in the bottom-right zone.

---

## Common questions

**Does the flip report include items that didn't sell?**
No. It only tracks items that sold. Unsold items don't appear because there's no final sale price to compare against. To track your unsold rate, look at the sale summary in your dashboard.

**What counts as "asking price" — my opening price or my price at time of sale?**
The asking price used in the flip report is your price at the time the item sold, not your original listing price. If you marked something down mid-sale, the markdown is the asking price used for comparison.

**Can I export the flip report?**
Yes. Tap Export in the top right to download a CSV with all the underlying data — item name, opening price, final price, days to sell, category, and sale date.

**How many sales do I need before the report is useful?**
You'll start seeing patterns after three or four sales in the same category. One sale gives you a snapshot; multiple sales give you a trend.

**Does it show anything about items I listed but removed before selling?**
No. Only completed sales appear. Items you removed or ended early don't show up.

**What if my sales are very different from each other — consignment one week, yard sale the next?**
Filter by sale type or specific sale when you're doing calibration work. Mixing estate sale consignment items with yard sale items in the same view muddies the picture. The category filter helps if your sale types overlap.

---

## Related guides

- [Pricing an item: suggested price and your override](pricing-an-item-suggested-price-and-your-override.md)
- [Discount rules and markdown cycles](discount-rules-and-markdown-cycles.md)
- [Settle up: reconcile sales and get your payout](settle-up-reconcile-sales-and-get-your-payout.md)`,
};

export default entry;
