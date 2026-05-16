import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'categories-and-tags',
  title: "Categories, tags, and why they affect searchability",
  audience: 'organizer',
  format: 'written',
  priority: 1,
  relatedGuides: ['review-queue', 'pricing-items', 'edit-live-listing'],
  videoUrl: undefined,
  body: `Every item in your sale has a category and a set of tags. Categories control which filter a shopper uses to find the item. Tags control whether the item shows up when a shopper types something specific into search. The app pre-fills both from photo recognition — your job in the review queue is to confirm they're right, correct the ones that aren't, and occasionally add a tag the app missed.

---

## Step 1: Understand what categories do

Categories are the shopper-facing filter tabs on your sale page: Furniture, Tools, Clothing, Electronics, Collectibles, Kitchenware, Outdoor, Books, and so on. Every item belongs to exactly one category.

When a shopper taps "Furniture" to filter your sale, they see only items in the Furniture category. If a wooden side table got tagged as Miscellaneous, it won't appear in that filter — and many shoppers won't see it at all.

Categories are also used to weight price suggestions. An item in the Jewelry category pulls comps from jewelry sales; the same item in Miscellaneous pulls from a broader (less useful) pool.

**The fix is easy:** If the category looks wrong, tap it in the review queue and select the right one from the dropdown. One tap.

---

## Step 2: Understand what tags do

Tags are free-text keywords attached to an item. They're not visible to shoppers as separate labels — they're woven into the search index. When a shopper searches "cast iron skillet" or "vintage Pyrex" or "Craftsman drill," the app matches against tags.

The app pre-fills 3–5 tags per item based on photo recognition. For common items, these are usually accurate. For unusual items, rare brands, or items where the photo angle missed a key detail, you may need to add a tag manually.

---

## Step 3: Which tags matter most

**Brand name** is the single most valuable tag. If the item has a visible brand — Craftsman, Le Creuset, Singer, Fender, Corelle, Pendleton — make sure that brand appears as a tag. Shoppers searching by brand are high-intent buyers.

**Material** matters for furniture, jewelry, and tools. "Oak," "sterling silver," "cast iron," "stoneware" all drive specific searches that generic category names don't cover.

**Style or era** matters for clothing, furniture, collectibles, and decor. "Mid-century," "Victorian," "Art Deco," "1970s," "farmhouse" — these are terms shoppers actually type.

For most yard sale and flea market items, brand + material + one style tag is enough. For estate sale items, especially furniture and collectibles, adding a maker's name or period increases discoverability significantly.

---

## Step 4: When to correct tags vs. leave them

**Leave them if:** The tags the app filled in are accurate and cover the key brand, material, and category. Adding more tags on top of accurate ones doesn't hurt, but it's not necessary.

**Correct them if:** The category is wrong (most important fix), or a key brand name is missing, or the tags describe something that doesn't match the item.

**Add a tag if:** The app got the category and general tags right, but missed the brand, a specific material, or a style term you know shoppers search for.

**Remove a tag if:** It's inaccurate. Inaccurate tags don't hurt search ranking directly, but they create a bad experience when a shopper searches for something specific and finds an unrelated item.

---

## Step 5: What over-tagging looks like

More tags are not always better. An item with 15 tags pulls from too many search contexts and starts appearing in irrelevant results. Shoppers who find an item that doesn't match what they searched for don't click — and don't come back to your listing.

A good tag set for most items is 3–6 tags: the category-adjacent term (in case a shopper searches the category name rather than using the filter), brand, material, and 1–2 style or era terms.

Avoid stuffing tags with synonyms ("chair," "seating," "seat," "armchair," "dining chair" all on the same dining chair). Pick the most accurate two and stop.

---

## Step 6: Bulk items and lots

For multi-piece lots (a box of kitchen tools, a set of records, a bag of clothes), the category is the container category. Tags should cover the contents that shoppers are most likely to search for individually.

A box of records → Category: Music | Tags: vinyl, records, LP, [genre], [any visible artist names]

A bag of clothes → Category: Clothing | Tags: [size if consistent], [style], [any visible brands]

A kitchen tool lot → Category: Kitchenware | Tags: [most valuable individual items in the lot]

You don't need a tag for every item in the lot — just the ones worth searching for.

---

## Common questions

**Why isn't my item showing up when I search for it?**
Check two things: the category (should match where you'd expect to find it) and whether the search term you're using appears in the title or tags. If a shopper searches "cast iron" and neither the title nor any tag says "cast iron," the item won't surface.

**Can I use the same tag on multiple items?**
Yes. Tags are not exclusive. If you have six pieces of Fiestaware, all six can have the "Fiestaware" tag. Shoppers searching that term will find all six.

**Does the order of tags matter?**
No. Tags are treated as a set, not a ranked list. The app doesn't weight the first tag more heavily than the last.

**Can shoppers search by category name as a keyword?**
Yes. Searching "furniture" will surface items with "furniture" in their title, tags, or description — in addition to items in the Furniture category. But the filter tab is faster, so most shoppers use that.

**What's the difference between a tag and the item description?**
The description is a free-text paragraph that appears on the item detail page — shoppers read it after they click. Tags are indexed keywords that determine whether the item appears in search results in the first place. Both matter, but tags are what get the item found; description is what closes the hold.

**The app tagged my item wrong. Should I correct it every time?**
Yes, correct it. Each correction improves your listing's accuracy. If you're seeing the same type of item miscategorized repeatedly (e.g., garden tools landing in "Miscellaneous"), that's a pattern worth flagging — contact support with the examples.

---

## Related guides

- [The review queue: from photo to live listing](review-queue)
- [Pricing an item: suggested price, comparable sales, and your override](pricing-items)
- [Editing a listing after it's already live](edit-live-listing)`,
};

export default entry;
