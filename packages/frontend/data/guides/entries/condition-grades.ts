import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'condition-grades',
  title: "Picking the right condition and grade",
  audience: 'organizer',
  format: 'written',
  priority: 1,
  relatedGuides: ['review-queue', 'pricing-items', 'edit-live-listing'],
  videoUrl: undefined,
  body: `Condition is one of the two things shoppers use to decide whether to hold or buy an item before seeing it in person: the other is the photo. Getting it right reduces disputes and holds that fall through. It also decides what eBay shows buyers if you list the item there.

The app suggests a condition from the photo. You confirm or change it before you approve the item.

## The four conditions

**New**: Never used. Unopened, or still has its original tags or packaging. Shows on eBay as New.

**Used**: Owned and used. Pick a grade from A to D (see below). This is the right choice for most items at a sale.

**Refurbished**: Restored to working order, by you or by a professional. It follows its own eBay condition, Seller refurbished, and doesn't take a grade.

**Parts / Repair**: Doesn't work, is incomplete, or is untested. Shows on eBay as For parts or not working. It doesn't take a grade.

## Grades for used items

**A (Very good)**: Looks close to new. No visible wear at normal viewing distance. Minor marks that need a close look are fine.

**B (Very good)**: Normal light wear for its age and use. Works fully. Small scratches or fading are fine. The most common grade for household goods.

**C (Good)**: Noticeable wear, fading, or surface damage, or a missing accessory that doesn't affect function. It works, and clearly shows its age.

**D (Acceptable)**: Heavy wear or damage, but still usable. If it is broken or sold for parts, use Parts / Repair instead.

A and B both read "Very good" on eBay. The letter still matters in FindA.Sale, because it changes the suggested price.

Grade S is retired for used goods. Something never used belongs under New. Existing items that still carry S show "S (legacy)" in the grade picker and are treated as A. Items stored as "Like new" are treated as Used, grade A.

## What eBay receives

- New: New
- Used, grade A or B: Used - Very good
- Used, grade C: Used - Good
- Used, grade D: Used - Acceptable
- Refurbished: Seller refurbished
- Parts / Repair: For parts or not working

If the item is on eBay, the item form shows "On eBay this shows as" with the result, so you can check it before you save.

## How the grade changes the suggested price

Price suggestions for used items are adjusted by grade: A x1.10, B x1.00, C x0.85, D x0.65. When an adjustment applies, the suggestion says so, for example "Adjusted for grade C (x0.85)." New, Refurbished and Parts / Repair items are not adjusted. The price is never filled in for you: tap **Use $X** to apply a suggestion.

## Trading cards

Trading cards use the card scale instead of A to D: NM (Near Mint), LP (Lightly Played), MP, HP and DMG. The app may suggest a card condition, or read it from a graded card's label, but it never saves one for you. Confirm it with one tap. Until you do, the card can't be sent to eBay.

## Where to set it

In the review queue, the condition buttons are on each card. The grade picker is under **More details** and only appears when the condition is Used. In Add Items, open an item's row. On the Edit Item page, or in the **All details** sheet, use the Condition & details section. In the form the grade picker stays visible for every condition, with a note that the grade only changes the eBay condition for used items.

## The most common mistake

Listing C items as A out of optimism. Shoppers who request a hold and then find a worse item than they expected lose trust. They may skip holds next time, or leave early. When in doubt, go one grade lower than you think. Shoppers who find a better-than-expected item are pleasantly surprised.

For consignment, an accurate grade on record at the time of acceptance also protects you with clients.

## Common questions

**What should I choose if something works but looks rough?**
Used, grade C or D, depending on severity. If it works fully but has clear cosmetic damage, use C. If function is questionable or it's untested, use Parts / Repair.

**The app suggested A but I think it's B. Should I change it?**
Yes. The suggestion comes from the photo. If the item has wear the photo didn't capture (underside, interior, back of frame), change the grade yourself. Your read of the physical item is more reliable.

**Can I change the condition after an item is live?**
Yes. Open the item, change the condition, and save. If the item is on eBay and the eBay condition really changes, the line above Save says "Saving will update eBay: condition." Changing between A and B doesn't change what eBay shows.

**Where can shoppers read about the grades?**
The public Condition Guide page (/condition-guide) opens the FAQ, which has a short version under "What is a Condition Rating?".`,
};

export default entry;
