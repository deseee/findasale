import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'label-composer',
  title: "Compose custom labels for your sale",
  audience: 'organizer',
  format: 'written',
  priority: 3,
  relatedGuides: ['print-inventory-sheets', 'color-rules'],
  videoUrl: undefined,
  body: `The label composer generates printable price tags with item names, prices, and QR codes. Print them at home, stick them on items before your sale opens, and let shoppers scan for details on anything that catches their eye.

---

## What the label composer does

Each label includes:

- Item name
- Your set price
- Condition grade (optional)
- A QR code that links to the item's detail page on FindA.Sale

The QR code is the part that earns its space. A shopper can scan a label on a dresser, pull up the full listing — photos, measurements, condition notes — and decide whether to buy without hunting you down to ask questions.

---

## How to access it

Go to **/organizer/label-composer**.

You can also reach it from your inventory list — select items and tap **Actions -> Print Labels**.

---

## How to generate labels

1. Open **/organizer/label-composer**.
2. Select the sale.
3. Choose the items you want labels for. You can select all, select by category, or pick individually.
4. Set the label size. The default is **Avery 5160** (30 labels per sheet, 1" x 2-5/8"). This is the most common adhesive label sheet you will find at any office store.
5. Toggle condition grade on or off — useful for high-value items, less useful for bulk lots.
6. Tap **Download PDF**.
7. Open in any PDF viewer and print.

Load your label sheets into the printer with the sticky side face-up (or follow your printer's sheet guide). Run a test sheet on plain paper first to confirm alignment before using your label stock.

---

## How the QR code works

Every label includes a QR code tied to that specific item on FindA.Sale.

When a shopper scans it:
- They see the full item listing — photos, price, condition, any notes you added.
- They can save it to their wishlist.
- They can request a hold directly from the listing.

This is useful for large or fragile items where shoppers want to look before committing — furniture, art, appliances. Put the label somewhere visible. Let the listing answer their questions so you can keep moving.

---

## Labels vs. color rules: when to use which

Both serve different jobs.

**Use labels when:**
- The item is high enough value that shoppers want details before buying.
- Items will be moved around during the sale and might get separated from any group pricing system.
- You want to give shoppers a way to save or hold an item from the floor.
- You are running a sale where not everyone helping knows every price.

**Use color rules when:**
- You are doing bulk markdown pricing across a category (all clothing 50% off).
- You are running a consignment sale and need to track which items belong to which consignor.
- Your team needs a fast visual system with no app needed.

Labels and color rules work together. A piece of furniture can have a label for shopper detail and a color tag that tells your staff it is consignor Jane's item.

---

## Sticker paper vs. cardstock

**Avery 5160 adhesive labels** are the standard choice for indoor sales. They stick cleanly, peel off without residue on most surfaces, and load easily into laser and inkjet printers.

**Cardstock + string tags** work better for outdoor markets and sales where items will be handled repeatedly. Adhesive labels can peel or smear in heat and humidity. A cardstock tag tied to the item holds up through a full day outside.

**Weatherproof labels** exist (search "waterproof Avery labels") and are worth the extra cost for anything sitting outside all day. Standard adhesive labels will curl or smear in direct sun or dew.

For a one-day indoor sale, standard Avery 5160 is fine. For a multi-day outdoor flea market or yard sale, go weatherproof or cardstock.

---

## Common questions

**What label sizes does the composer support?**
Currently Avery 5160 (30-up, 1" x 2-5/8"). Additional sizes are on the roadmap. If you need a different size, download the PDF and use your printer's scaling to adjust.

**Can I include a barcode instead of (or in addition to) a QR code?**
Not currently. QR codes only. Barcodes require a scanner and a matching database — QR codes work with any smartphone camera.

**What happens if an item sells and someone scans the old label?**
The item listing updates to "Sold" automatically when you mark it. The QR code still works — it just shows the item as no longer available.

**Can I generate labels for items that have not been priced yet?**
No. Items need a price set before they can appear in the label composer. Items without a price are filtered out of the selection list.

**Can I reprint labels for a subset of items?**
Yes. Just select the specific items you need on the label composer page and generate a new PDF. You do not need to reprint the full sale.

**Do labels work offline?**
The label itself is printed — no app needed to display it. The QR code requires an internet connection when scanned. If a shopper is offline, the code will not load. The printed price and item name are always visible regardless.

---

## Related guides

- [Print inventory sheets for walk-through reference](print-inventory-sheets)
- [Color rules: use tag colors for in-person sorting](color-rules)`,
};

export default entry;
