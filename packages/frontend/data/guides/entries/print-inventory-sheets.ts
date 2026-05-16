import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'print-inventory-sheets',
  title: "Print inventory sheets for walk-through reference",
  audience: 'organizer',
  format: 'written',
  priority: 3,
  relatedGuides: ['label-composer', 'color-rules', 'manage-holds'],
  videoUrl: undefined,
  body: `An inventory sheet is a printed list of your items with names, prices, conditions, and thumbnail photos. Hand one to a staff member and they can work the floor without needing their phone.

---

## What inventory sheets are for

The app handles everything — but not every sale day is app-friendly.

You might be running a large outdoor consignment event across three tables. Your helper in the back does not have a smartphone. The church basement where you're running the sale gets two bars of signal on a good day.

An inventory sheet gives your team a physical reference. They mark items sold with a pen as transactions happen. At the end of the day, you reconcile against your POS records.

No app required on the floor. No shouting across the room to ask what something costs.

---

## How to generate a sheet

1. Go to **/organizer/print-inventory**.
2. Select the sale you want to print for.
3. Choose a format:
   - **Full sheet** — includes item name, price, condition, notes, and a small photo thumbnail.
   - **Summary** — name and price only, fits more items per page, faster to scan.
4. Tap **Generate** — a PDF opens.
5. Download and print.

The sheet is sorted by category by default. Items within each category are sorted alphabetically.

---

## Print settings that matter

**Orientation:** Use landscape. Portrait cuts off item names and prices on wider rows.

**Scaling:** Set to "Fit to page" in your printer dialog. This prevents rows from running off the edge.

**Paper:** Standard 8.5x11 works. If you are printing thumbnails, slightly heavier paper (20lb or 24lb) holds the ink better and does not bleed at the edges.

Expect roughly 20-30 items per page on full-sheet format, 50-60 on summary format.

---

## How staff use the sheet on sale day

Give each person working a section their own copy — or highlight the rows for their area with a marker before handing it out.

When something sells:
1. Draw a line through the item row.
2. Write the price if it changed (negotiated down or color-rule discount applied).
3. If the item has a hold, circle it rather than crossing it off until the shopper pays.

At close, bring the sheets together. Compare struck-through rows against your POS transaction log. Any item marked sold on paper that does not show in the app gets entered manually.

---

## When to print vs. just use the app

The app is faster for most sales. Print when:

**Phone signal is unreliable.** Outdoor markets, church basements, barn sales — if your crew cannot load a page, they need paper.

**Multiple rooms or areas with no overlap.** Three people in three different spaces with no way to coordinate in real time. Each gets their own sheet for their zone.

**You are working with helpers who are not comfortable with the app.** A printed sheet is a zero-training handoff. Point to the column, hand them a pen.

**You want a backup.** Even at tech-friendly sales, a printed sheet is insurance against a dead battery or a bad update.

---

## Common questions

**Does the sheet update if I change prices after printing?**
No. The sheet reflects prices at the moment you generate it. If you change prices after printing, reprint or note the changes manually.

**Can I filter the sheet to one category or section?**
Not yet — the sheet includes all active items in the selected sale. Use the summary format and highlight sections by hand to split it up.

**Does the sheet include items that are held?**
Yes. Held items appear on the sheet and are marked with a "Hold" status flag. Staff should check the hold status in the app before confirming a sale on any flagged item.

**Can I reprint a sheet for just the unsold items at end of day?**
Regenerate the PDF at any point during the sale — it reflects current item statuses including what is already marked sold. Unsold items will appear without a "Sold" flag.

**What if I need the sheet in a different format (Excel, CSV)?**
The print-inventory page generates a PDF only. For a spreadsheet export, use the inventory export option under **/organizer/sales -> [sale name] -> Export**.

---

## Related guides

- [Compose custom labels for your sale](label-composer)
- [Color rules: use tag colors for in-person sorting](color-rules)
- [Manage holds: approve, extend, and cancel](manage-holds)`,
};

export default entry;
