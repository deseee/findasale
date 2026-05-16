import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'color-rules',
  title: "Color rules: use tag colors for in-person sorting",
  audience: 'organizer',
  format: 'written',
  priority: 2,
  relatedGuides: ['discount-rules-and-markdowns', 'label-composer', 'print-inventory-sheets'],
  videoUrl: undefined,
  body: `Color rules turn a colored sticker into a price signal your whole team understands without looking anything up.

Red tag means half off. Blue tag belongs to Jane. Green tag is Sunday price. Your crew walks the floor and handles pricing on their own.

---

## What color rules are

A color rule pairs a color with a name and a price modifier.

You create the rules once. Then you apply colors to items during your setup. On sale day, the color on the sticker tells your staff everything they need to know.

Two common uses:

**Multi-day markdown pricing.** Day one items are full price. Day two items get a sticker swap or a pre-applied color that signals 25% off or 50% off depending on the color.

**Consignment tracking.** Each consignor gets a color. Blue = Jane's items. Orange = Marcus's items. You settle up at the end based on which colors sold, without sorting through a spreadsheet.

---

## How to create a color rule

1. Go to **/organizer/color-rules**.
2. Tap **New Rule**.
3. Pick a color from the palette.
4. Give it a name — something your staff will recognize: "Sunday 50% off" or "Consignor — Jane."
5. Set the modifier:
   - A percentage discount: "50% off"
   - A flat dollar amount: "$5 off"
   - A label only (no price change): "Belongs to consignor"
6. Save.

The rule is now available to apply to any item in that sale.

---

## How to apply a color to items

You can color items one at a time or in bulk.

**One at a time:**
1. Open any item from the review queue or inventory list.
2. Find the **Color Tag** dropdown.
3. Select the rule you want.
4. Save.

**Bulk apply:**
1. Go to your inventory list.
2. Select multiple items using the checkboxes.
3. Tap **Bulk Edit → Color Tag**.
4. Pick the rule.
5. Apply.

The color shows on each item's card in your inventory view so you can see at a glance what's been tagged.

---

## How this works on sale day

Your staff sees a physical sticker on the item. They also see the color in the app if they pull up the item.

They don't need to do math. They don't need to find you. They know red tag = half off.

For consignment sales, anyone helping you run the floor can look at a color, find it in your printed color key, and know exactly who gets credit for that sale.

Print your color key on a single sheet and tape it to your cash register or checkout table. Takes 30 seconds and saves you a hundred questions during the sale.

---

## Multi-day sale markdown setup

This is the most common use of color rules.

**Example setup for a two-day yard sale:**

| Color | Name | Modifier |
|-------|------|----------|
| Yellow | Saturday price | No discount (full price) |
| Green | Sunday 25% off | 25% discount |
| Red | Sunday 50% off | 50% discount |

**Day one:** All items get yellow tags. Full price.

**After close on day one:** Walk the floor. Swap yellow tags for green or red depending on what you want to move. No repricing needed — the color does the work.

**Day two:** Staff handles pricing based on the sticker. You don't touch the app.

---

## Consignment tracking setup

**Example setup for a consignment sale:**

| Color | Name | Modifier |
|-------|------|----------|
| Blue | Jane | Label only |
| Orange | Marcus | Label only |
| Pink | Lisa | Label only |

As items sell, the color on the record tells you who gets paid. Export the sold items filtered by color at the end of the sale. You have your consignor report.

---

## Common questions

**Can I use color rules across multiple sales?**
Color rules are set per sale. If you run the same setup frequently, you'll create the rules each time — they don't carry over automatically right now.

**What if an item has no color tag?**
It has no modifier applied. It sells at whatever price you set for it. Color rules are optional per item.

**Can I change a color rule after I've applied it to items?**
Yes. Edit the rule at **/organizer/color-rules**. The change applies to all items with that color going forward.

**Can shoppers see the color tags?**
No. Color tags are for your internal use. Shoppers see the final price, not the tag or modifier.

**Can I delete a color rule?**
Yes. Deleting a rule removes it from any new assignments. Items already tagged keep their color visually but the modifier is cleared.

**Do color rules interact with discount rules?**
They can stack — an item with a color-rule modifier could also fall under a discount rule. Check your effective prices in the inventory view before sale day if you're using both.

---

## Related guides

- [Discount rules and markdown cycles](discount-rules-and-markdowns)
- [Compose custom labels for your sale](label-composer)
- [Print inventory sheets for walk-through reference](print-inventory-sheets)`,
};

export default entry;
