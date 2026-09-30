import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'discount-rules-and-markdowns',
  title: "Discount rules and markdown cycles",
  audience: 'organizer',
  format: 'written',
  priority: 2,
  relatedGuides: ['color-rules', 'manage-holds', 'choose-a-plan'],
  videoUrl: undefined,
  body: `You have three tools for automatic price changes: the free Day 2 and Day 3 markdown schedule, discount rules, and markdown cycles. They solve different problems. This guide covers all three.

---

## The short version

**The Day 2 / Day 3 schedule** is built in and free on every plan. Turn it on for a sale and items drop to 50% off on Day 2 and 75% off on Day 3, with no setup.

**Discount rules** (a Teams feature) tie a discount percentage to an item's color tag. You define the rule once, and every item carrying that color shows the discounted price on your sale page while the rule is active.

**Markdown cycles** drop the price incrementally over time until the item sells or hits a floor. Set it and walk away.

Use the free schedule when a standard clearance is all you need. Use rules (a Teams feature) when you sort stock by colored sticker and want each color to show its own discount. Use cycles (a Pro feature) when you want your own steps and timing, or want to move an item before the sale closes no matter what.

---

## The free Day 2 / Day 3 markdown schedule

### What it does

Every plan, including Simple, can turn on automatic markdowns for a sale:

- **Day 1:** full price.
- **Day 2** (24 to 48 hours after the sale starts): items drop to 50% off.
- **Day 3 and after** (48 hours after the sale starts): items drop to 75% off.

It is the informal standard for a two or three day sale, and it costs nothing extra.

### How to turn it on

1. Open the sale in **/organizer/sales → Edit Sale**.
2. Check **Enable Auto-Markdown for this sale**.
3. Optionally set a **markdown floor**, the lowest price any item is allowed to reach.
4. Save.

It is off until you check the box, one sale at a time.

### How the new price is worked out

Every markdown lands on the nearest keystone price, meaning a price ending in **.49 or .99**. A $13 item at 50% off is $6.50, which becomes $6.49. A $10 item at 50% off is $5.00, which becomes $4.99. This keeps shelf prices easy to write and easy to make change for.

Two things are never rounded or overridden by the schedule:
- **Prices you set yourself.** If you type a price on an item, that is the true price, exactly as you entered it.
- **Your markdown floor.** It is used as you set it.

Auction items are skipped, and only items that are still available are marked down. Sold items and items being held for a buyer keep their price. An item that comes back to available is picked up automatically within about five minutes.

### The Markdown Re-tag List

When the price changes online, the sticker on the shelf is now wrong. The **Markdown Re-tag List** (**/organizer/markdown-retag**) shows every item that has been marked down and still needs a new tag, with the percentage off to write on the sticker (for example 50% or 75%).

- **Needs re-tagging** lists what staff still need to change. Tap **Mark as re-tagged** on an item, or mark a whole batch, once the new sticker is on.
- **All discounted now** lists everything currently marked down, deepest discount first. It has a Print button for a walk-around sheet.
- A daily reminder (in the app and by email, around 9:20 AM Eastern) tells you how many items are waiting at each percentage.
- When an item drops to its next step, it appears on the list again.

**Who can use it:** the list and the reminder are free on every plan. You, as the owner, can always view it and mark items. On the Teams plan, staff can use it too. Give a role the **Mark items as re-tagged** permission in **Workspace → Role & Permissions**. The Member and Manager roles have it by default, and the Viewer role does not. Staff accounts only work while the owner is on Teams; on Simple and Pro the list belongs to the owner's login.

---

## Discount rules

Discount rules are a **Teams** feature. On Simple and Pro, the **/organizer/discount-rules** page asks you to upgrade. The free Day 2 / Day 3 schedule above and Pro markdown cycles below are available without Teams.

### What they do

A discount rule pairs an item **color tag** with a **discount percentage**. Any item whose Tag Color matches the rule shows the discounted price on your sale page, with the original price crossed out beside it.

Examples:
- A red sticker means 50% off. One rule, "Red tag, 50% off", covers every red item.
- A green rule that runs only on Sunday: set it to start and end on that date, and it switches on and off by itself.

That is the whole feature. A rule matches on color only. It does not target categories, tags, price ranges, days of the sale or hours of the day, and it has no flat-dollar option. The percentage can be anything from 0 to 100, and decimals are fine.

### How to create a discount rule

1. Go to **/organizer/discount-rules**.
2. Tap **Add Rule**.
3. Enter the **Color Tag**: a hex code such as #EF4444, or a color name such as red.
4. Enter a **Label**, a name your team will recognize, like "25% off, red tag".
5. Enter the **Discount %**.
6. Optionally set **Active From** and **Active To** dates. Leave them empty and the rule is always on with no end date.
7. Save.

From the same page you can edit a rule or delete it (you confirm before it is deleted). Rules belong to your workspace, so they apply across your sales rather than to one sale.

### Putting a color on your items

A rule only affects items that carry its color. Open an item to edit it and fill in **Tag Color**, using exactly the same value as the rule. The match is on the exact text, so "red" and "#EF4444" count as different colors. Pick one style and stick to it.

### What shoppers and staff see

- **Sale page:** items with a matching color show the discounted price, with the original price crossed out.
- **Color Discount Key:** on your own sale page, a key lists your active rules with a color swatch and the percentage off, so your crew can check a sticker against it. It is shown to you as the organizer, not to shoppers.

### One thing to know about checkout

A rule changes the price shown on the sale page. It does not change the item's own stored price, and checkout takes its price from the item. If a discount has to be the price the shopper is actually charged, lower the item's price itself, or use the free Day 2 / Day 3 schedule or a markdown cycle, which do change the price.

### What discount rules are good for

- A color-coded clearance that your staff can read off a sticker
- Showing a limited-window discount on every item of one color without editing each item
- Consignment days where one consignor's color gets its own marked-down price on display

---

## Markdown cycles

Markdown cycles are a **Pro** feature. The standard Day 2 and Day 3 schedule above is free. Cycles are for when you want your own steps and timing instead.

### What they do

A markdown cycle drops an item's price on a schedule (every few hours, every day) until the item reaches a floor price you set.

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
| You sort items by colored sticker and want each color to show its own discount | Discount rule |
| You want a discount to show only between two dates | Discount rule |
| You want to move an item before sale end, no fixed day | Markdown cycle |
| You want incremental drops on a single item | Markdown cycle |
| You want the lower price to be the price actually charged | Markdown cycle or the free Day 2 / Day 3 schedule |
| You're running a long consignment sale and don't want to reprice manually | Markdown cycle |

You can use both on the same sale. A markdown cycle lowers the item's real price. A discount rule then shows a further percentage off that price on the sale page for items with a matching color. Check your sale page before it opens to confirm the prices shoppers will see.

---

## Common questions

**Do these fire automatically or do I need to start them?**
Both are automatic once set. A discount rule shows its price whenever it is active (always, or between its Active From and Active To dates). A markdown cycle steps down on its schedule once the sale is live.

**Can I turn off a rule or cycle mid-sale?**
For a discount rule, delete it on **/organizer/discount-rules**, or edit it and set an Active To date that has already passed. For a markdown cycle, deactivate it in the sale's pricing settings. Prices stop changing from that point forward.

**Will shoppers see the original price crossed out?**
Yes. On the sale page, an item with a matching discount rule shows its original price crossed out with the discounted price beside it.

**Does a discount rule change what the shopper pays?**
Not by itself. It changes the price displayed. Checkout uses the item's own price, so lower the item price or use a markdown when the discount must be charged.

**Can a markdown cycle go below my floor price?**
No. The floor is a hard stop. The price will not drop below what you set.

**What if I set a discount rule and a markdown cycle on the same item?**
Both can be active. The cycle lowers the item's price, and the rule shows a further percentage off that lower price on the sale page. Review your sale page before it opens to avoid surprises.

**Can I copy rules from a previous sale?**
You do not need to. Rules belong to your workspace rather than to one sale, so a rule you made once keeps applying to any of your sales with matching colors until you delete it or its Active To date passes.

---

## Related guides

- [Choosing a plan: Simple, Pro, or Teams](/guides/choose-a-plan)
- [Color rules: use tag colors for in-person sorting](color-rules)
- [Manage holds: approve, extend, and cancel](manage-holds)`,
};

export default entry;
