import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'connect-shopify',
  title: "Connect Shopify and cross-list items",
  audience: 'organizer',
  format: 'written',
  priority: 2,
  relatedGuides: ['list-items-on-ebay', 'the-review-queue-from-photo-to-live-listing', 'webhooks-and-zapier'],
  videoUrl: undefined,
  body: `Shopify cross-listing syncs items from your sale to your Shopify store. If you already have a storefront, you don't need to re-enter anything. List it once in FindA.Sale, push it to Shopify, and it appears in your store.

This is a TEAMS tier feature.

---

## Who this is for

You already have a Shopify store. You run sales — estate sales, consignment events, flea market booths — and you want those items visible to your online customers without double data entry. When something sells on either platform, you want the other to know.

If you don't have a Shopify store, this guide doesn't apply yet.

---

## Step 1. Create a custom app in Shopify

FindA.Sale connects to your store using a Shopify custom app access token. You create the app once in your Shopify admin and paste the token into FindA.Sale.

1. In your Shopify admin, go to **Settings → Apps and sales channels → Develop apps**.
2. Tap **Create an app**, give it a name (for example, "FindA.Sale"), and create it.
3. Open the **Configuration** tab and configure **Admin API scopes**. Enable **\`write_products\`** and **\`write_inventory\`**.
4. Save, then open the **API credentials** tab and tap **Install app**.
5. Copy the **Admin API access token** (it starts with \`shpat_\`). Shopify shows this token only once, so copy it now.

---

## Step 2. Paste your credentials into FindA.Sale

1. Go to **Shopify** in your organizer dashboard (\`/organizer/shopify\`).
2. Enter your **Shop Domain** (example: \`your-store.myshopify.com\`).
3. Paste the **Admin API access token** you copied from Shopify.
4. Tap **Connect Shopify**.

The connection is active immediately once the token is accepted.

---

## Step 3. Push an item to Shopify

1. Open any item in your inventory or review queue.
2. Tap **Push to Shopify**.

The item is created in your Shopify store as a product. By default it publishes as an active listing, with inventory set to 1 and tracked by Shopify.

---

## What syncs to Shopify

| FindA.Sale field | Shopify field |
|-----------------|---------------|
| Item name | Product title |
| Description / notes | Body HTML |
| Asking price | Variant price |
| Photos (all) | Product images |
| Category | Product type |
| Tags | Product tags |
| SKU | Variant SKU |

Inventory is set to 1 and tracked by Shopify when the item is pushed, so the product sells out after one sale.

---

## What does not sync to Shopify

- Sale dates and hours (those are FindA.Sale-only)
- Holds (a hold placed in FindA.Sale does not lock the Shopify listing)
- QR codes and in-person sale mechanics
- Color tags and internal labels

Shopify is for your online storefront. The in-person sale tools stay in FindA.Sale.

---

## Sold-status sync

When an item sells through FindA.Sale (in-person or online), the matching Shopify product is automatically set to out-of-stock so it stops selling on your storefront.

Sync currently runs one direction: FindA.Sale → Shopify. If an item sells **on Shopify first**, FindA.Sale is not notified automatically — mark it sold in FindA.Sale yourself so the two stay in agreement. Two-way (Shopify → FindA.Sale) sync is planned but not available yet.

---

## Remove an item from Shopify

FindA.Sale does not currently unpublish or delete items from Shopify on its own. To take a product down, open your Shopify admin and unpublish or delete it there. (When an item sells through FindA.Sale, its Shopify product is automatically set to out-of-stock so it stops selling — see Sold-status sync above.)

---

## Common questions

**Do I need TEAMS tier to use this?**
Yes. Shopify cross-listing is a TEAMS feature. If you're on PRO or below, the Shopify page won't be available.

**Can I control whether items publish as draft or active in Shopify?**
Not yet from FindA.Sale directly. Items are pushed as active by default. To change a product to a draft, edit it in your Shopify admin after it appears.

**What if my Shopify store has existing products with the same name?**
FindA.Sale creates new products — it doesn't match or update existing ones. You'll end up with duplicates if you push items you've already listed manually. Clean up the manual duplicates in Shopify after switching to this workflow.

**Can I push all my items at once?**
Not with a single button yet. You push items one at a time with **Push to Shopify**. If you have a large inventory, work through your review queue and push items in batches.

**What happens to the Shopify product if I delete the item in FindA.Sale?**
The product stays in Shopify. Removing it from FindA.Sale does not remove it from your store — delete it in Shopify separately if needed.

**Does Shopify pricing stay in sync if I change the price in FindA.Sale?**
Not automatically. The price is sent to Shopify only at the moment you push the item. If you change the price in FindA.Sale afterward, update it in your Shopify admin to match. (Pushing the same item again creates a second product in Shopify rather than updating the first, so edit in Shopify rather than re-pushing.)

---

## Related guides

- [List items on eBay from your sale](list-items-on-ebay.md)
- [The review queue: from photo to live listing](the-review-queue-from-photo-to-live-listing.md)
- [Webhooks and Zapier: send sale events to your tools](webhooks-and-zapier.md)`,
};

export default entry;
