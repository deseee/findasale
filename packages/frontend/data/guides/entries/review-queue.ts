import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'review-queue',
  title: "The review queue: from photo to live listing",
  audience: 'organizer',
  format: 'written+video',
  priority: 1,
  relatedGuides: ['pricing-items', 'categories-and-tags', 'edit-live-listing'],
  videoUrl: undefined,
  body: `Every item you photograph lands in the review queue before it goes live. Nothing reaches shoppers until you approve it. The queue is where you check titles, fix categories and conditions, set prices, and publish.

This guide walks you through each card, what saves on its own, and what happens when you tap Approve.

## Step 1: Get to the review queue

From your organizer dashboard, tap **Review** on any sale card. You land on the queue for that sale: every item that has been photographed but not yet published.

Each card shows:
- The photo
- The title and category the app filled in
- The condition (New, Used, Refurb or Parts)
- Brand, part number and barcode, when known
- Tags, which are keywords that help shoppers find the item in search
- Your price field, Suggest Price, and the Approve button

The left edge of each card is colored by how ready the item is. Red means it is missing a title, a price or a photo. Yellow means it is missing a category, condition or description. Green means it is complete. Blue means it is complete, has a package weight, and is ready for eBay.

## Step 2: Check the fields

**Title**: Filled in from the photo. Edit it if it's vague ("brown box") or wrong.

**Category**: Tap to change it. The picker uses eBay category names, so the item is ready for eBay if you list it there.

**Condition**: New, Used, Refurb or Parts. See the condition guide for what each means. The app suggests one. You confirm or change it.

**Tags**: The app pre-fills a few based on the photo. Add more or remove ones that don't fit.

## Step 3: Set the price

The price is never filled in for you. Your price field starts empty, and an item can't be approved without one.

Tap **Suggest Price** to see a suggestion. It shows a suggested amount with a **Use $X** button. Tap Use to put it in your price field, or Dismiss to ignore it. For used items the suggestion is adjusted by grade, and it says so, for example "Adjusted for grade C (x0.85)." See the pricing guide for how to read it.

Tapping a different grade under More details shows a new suggestion the same way. Nothing changes until you tap Use.

## Step 4: Your edits save on their own

Edits to the title, category, condition, tags and the other card fields autosave as drafts a moment after you stop typing. A status line under each card says "Saved just now" when it's done, or tells you if it could not save and will retry.

Your price is the one exception. It is saved when you tap Approve.

## Step 5: Approve publishes the item

Tap **Approve** on a card. The item is saved with your price and goes live right away. There is no separate publish step. If the card has no price, Approve stops and the card says "Set a price before publishing."

If eBay is connected, you can tick **Also push to eBay** under More details. The push starts after the item is published.

**Approve all**, at the top of the queue, publishes every item that has a price after you confirm. Items without a price are skipped so you can come back to them.

## More details, All details and Edit more

**More details** opens extra fields on the card: photos, description, package weight and size, condition grade, listing type, price research, and the eBay options.

The grade picker (A to D) lives here, and it only appears when the condition is Used. A trading card shows the card condition confirm (NM, LP, MP, HP, DMG) instead.

**All details** opens the same item form as the Edit Item page, in a slide-up sheet, without leaving the queue. Your pending card edits are saved first. The sheet stays open after you save, and the card updates behind it. **Edit more** opens the full Edit Item page.

## Draft vs. Live

**Draft** items are invisible to shoppers. They have all their data, but no one can see them on the public listing page or in search results.

**Live** items are visible to anyone browsing the sale. Shoppers can favorite them, request holds, and add them to a cart if checkout is enabled.

An item moves from Draft to Live when you tap Approve.

## After approving

Once items are live, you can still edit them. See the guide on editing a live listing for what you can change and what the form tells you before it updates eBay.

## Common questions

**What if I approve something by accident?**
Open the item and tap **Unpublish** next to Save. It goes back to Draft and disappears from the public listing.

**Can I approve items in bulk without reviewing each one?**
Yes. **Approve all** publishes every item that has a price. Spot-check a few first, because approving publishes. Use it when you've done a quick photo session and the items are straightforward.

**Why does a card say "Set a price before publishing"?**
The price field is empty. Type a price or tap Suggest Price and then Use. Approve works once there is a price.

**Can my assistant or co-organizer review the queue?**
Yes, if you've added them to the sale as a team member with editor access. They see the same queue you do and can edit and approve items.

**Does the order of items in the queue matter?**
No. Shoppers see items sorted by their own preferences (price, recency, category). The queue order is just the sequence items were photographed.

**Can I review the queue on my phone?**
Yes. Scroll through the cards, edit what needs it, set a price, and tap Approve.

## Video script

[90-second screen-capture VO: cut to match actual screen recording]

**[0:00: Queue overview shot]**

"After you finish photographing, every item lands here, in the review queue. Nothing is live yet. This is your chance to check titles, fix categories, set prices, and publish when you're ready."

**[0:10: Scroll through queue cards]**

"Each card shows the photo, the title, the category, the condition, and your price field. The colored edge tells you how ready each item is."

**[0:22: Edit a title, show the Saved just now line]**

"Change something and it saves on its own. You'll see Saved just now under the card."

**[0:35: Tap Suggest Price, then Use]**

"The price is never filled in for you. Tap Suggest Price to see a suggestion based on what similar items sold for, then tap Use to apply it. Or just type your own. Your price always wins."

**[0:50: Tap Approve]**

"When the card looks right, tap Approve. That saves your price and publishes the item. It's live right away."

**[1:05: Show All details sheet]**

"Need every field? Tap All details to open the full item form in a sheet, without leaving the queue."

**[1:15: Closing]**

"Check the card, set a price, approve. Next up: how prices are suggested and when to override them."`,
};

export default entry;
