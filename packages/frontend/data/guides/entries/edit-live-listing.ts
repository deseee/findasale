import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'edit-live-listing',
  title: "Editing a listing after it's already live",
  audience: 'organizer',
  format: 'written',
  priority: 2,
  relatedGuides: ['review-queue', 'pricing-items', 'condition-grades'],
  videoUrl: undefined,
  body: `Publishing an item doesn't lock it. You can edit any live listing before the sale ends: price, description, condition, photos, category, tags, all of it. Changes in FindA.Sale take effect when you save, with no re-publishing. If the item is also on eBay, the form tells you what saving will send there before you tap Save.

This guide covers how to open the editor, what is in it, what saving does to your marketplaces, and how to mark an item sold or take it down.

## One form everywhere

Edit Item is a full page. Add Items and the review queue open the same form in a slide-up sheet. In Add Items, open an item's row and tap **All details** for the sheet, or **Full Edit** for the full page. In the review queue, tap **All details** on a card for the sheet, or **Edit more** for the full page.

The sections are in the same order wherever you open the form. Nothing was removed: the advanced parts are collapsed until you need them.

- **Photos & basics**: photos, title and description.
- **Category**: the shopper-facing category and the eBay category.
- **Condition & details**: condition and grade. Product IDs and Size, color, material are inside it, collapsed.
- **Trading card details**: collapsed until you open it.
- **Pricing**: listing type, then cost basis, then your price with Price Research, then best offers for eBay and Keep out of automatic markdowns. Discounts & coupons (Organizer Special) is collapsed inside Pricing.
- **Shipping & package**
- **Quantity & setup**: quantity, with More options collapsed inside.
- **Where this is listed**: every marketplace the item is on. Marketplaces it isn't on are collapsed under Other marketplaces. If Discogs or Reverb is connected and the category fits, their panels are here too.
- **Danger zone**: delete the item.

## Save, and what it sends to eBay

Above the Save button, the form states exactly what saving will do. For an item on eBay it reads like "Saving will update eBay: description." It also names any marketplace that needs a manual update. Craigslist, Vinted and the other extension marketplaces (Facebook, Poshmark, Mercari, Grailed and Gumtree AU) are prompt-only: FindA.Sale never changes those listings for you. You'll see "Needs manual update on Vinted" and make the change there yourself.

Only fields that really changed are sent to eBay: title, description, condition, price, and shipping inputs (weight, dimensions, package type). If nothing eBay uses changed, eBay is left alone.

Photos, category, quantity and best-offer settings are not sent by Save. To send those, use **Re-push to eBay** under Where this is listed. Discogs and Reverb are never updated by Save either. Use their buttons in the same section.

After you save, you stay on the page. A line next to the buttons shows what happened: "eBay updated: price", "eBay not changed" with the reason, or "eBay update failed" with the reason and a **Retry** button.

## Save without updating marketplaces

For an item that is on eBay, **Save without updating marketplaces** saves in FindA.Sale only. Use it when you want to finish editing here and send the changes to eBay later.

eBay sync for that item is then paused. You'll see an "eBay paused" chip, and a panel that says "Not sent to eBay yet" with the fields that are waiting. The panel has two buttons:

- **Update eBay now**: sends everything that is waiting. When it succeeds, syncing turns back on.
- **Resume syncing**: turns syncing back on without sending. The next sync can replace text you haven't sent with what is on eBay, so it asks you to confirm first.

The pause lasts until you choose one of the two. It doesn't expire on its own. Automatic markdowns still change the price on eBay while an item is paused.

## If an eBay update fails

A banner at the top of the Edit page says what eBay did not accept. Your changes are already saved in FindA.Sale. Fix the problem and save again, tap **Retry** on the result line after a save, or use Re-push to eBay. Tap **Acknowledge** to clear the banner.

In Add Items, the item's row shows an "eBay update failed" badge. Tap it to open the Edit page. No email is sent about failed updates.

## Last edited

The header shows "Last edited" with the time of your own last edit. Automatic changes like markdowns and syncs don't count. An item you have never edited shows "Added" with its date. In Add Items, each row shows "Saved" with how long ago.

## What you can change anytime

**Price**: Shoppers viewing the item see the new price on their next page load. If a shopper has an active hold on the item when you change the price, they receive a notification with the updated amount.

**Description and title**: No limit on length or on how many times you edit. Short, accurate titles perform better than long ones.

**Condition and grade**: If you mis-graded an item and catch it after publishing, fix it. An accurate grade is better than a published-but-wrong one. Switching between A and B doesn't change what eBay shows, because eBay shows both as "Very Good".

**Photos**: Add photos, replace the primary photo, or remove a photo. At least one photo is required to keep the listing live. A second or third angle often helps move items that have been sitting.

**Category and tags**: Updates re-index for search. If an item isn't getting views, recheck the category and tags first.

## What shoppers with active holds see when price changes

If a shopper has placed a hold on an item and you lower the price, they get a notification with the new price. The hold remains active at the new, lower price.

If you raise the price, the shopper also receives a notification. The hold remains active, but the shopper can release it if the new price doesn't work for them. Releasing a hold removes their claim on the item.

Best practice: if you need to raise a price on a held item, message the shopper through the hold thread before making the change. It avoids surprise and usually results in a cleaner resolution.

## Marking an item sold manually

If an item sells in person (at a yard sale, during a preview, at a flea market booth), mark it sold in the app right away. This prevents a shopper from placing a hold on something that's already gone.

To mark sold:
1. Open the item (from the live sale or item list)
2. Tap **Mark Sold**
3. Confirm

The item status changes to **Sold** and it's removed from the active listing. It remains visible in your sale history.

If the item sold through the app's checkout (not in person), the status updates automatically when payment completes. You don't need to do anything.

## Taking an item down without marking it sold

If you want to pull an item from the listing for a while (it needs repair, you're reconsidering the price, a family member wants it), open the item and tap **Unpublish** next to Save. The item disappears from the public listing and goes back to Draft. Tap **Publish** when you're ready to put it back.

## Common questions

**Can I edit an item after the sale has ended?**
No. Once a sale closes, listings become read-only. If you need to update a record for your own notes, contact support.

**Can I add items to a sale that's already live?**
Yes. Photograph new items, review them in the queue, and tap Approve. They go live on the existing sale page without any disruption to what's already there.

**Does editing a listing reset its position in search results?**
No. Edits don't affect sort order. Items are sorted by relevance, recency of the sale start date, and shopper preferences, not by listing edit time.

**Can a team member edit items, or only the sale owner?**
Any team member with editor access can edit live listings. Viewer-only access cannot make changes.`,
};

export default entry;
