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

## Step 1. Connect your Shopify store

1. Go to **Settings → Integrations → Shopify**.
2. Enter your Shopify store URL (example: \`your-store.myshopify.com\`).
3. Tap **Connect**. You'll be redirected to Shopify to authorize the integration.
4. Approve the permissions and return to FindA.Sale.

The connection is active immediately. No webhook setup needed on your end — FindA.Sale handles it.

---

## Step 2. Push an item to Shopify

1. Open any item in your inventory or review queue.
2. Find the **Shopify** toggle.
3. Toggle it on.
4. Tap **Save**.

The item appears in your Shopify store as a product within a minute or two. Whether it appears as a draft or an active listing depends on how your store is configured — by default, it publishes as active.

---

## What syncs to Shopify

| FindA.Sale field | Shopify field |
|-----------------|---------------|
| Item name | Product title |
| Description / notes | Body HTML |
| Asking price | Price |
| Photos (all) | Product images |
| Condition | Metafield (condition) |

Condition maps to a Shopify product metafield. If your theme doesn't display metafields, customers won't see it — but it's stored and available if you customize your theme later.

---

## What does not sync to Shopify

- Sale dates and hours (those are FindA.Sale-only)
- Holds (a hold placed in FindA.Sale does not lock the Shopify listing)
- QR codes and in-person sale mechanics
- Color tags and internal labels

Shopify is for your online storefront. The in-person sale tools stay in FindA.Sale.

---

## Sold-status sync

When an item sells on Shopify, FindA.Sale marks it sold automatically. This requires the Shopify webhook that FindA.Sale sets up when you first connect — it's automatic, you don't need to configure anything.

When an item sells through FindA.Sale (in-person or online), the Shopify product is updated to out-of-stock automatically.

Either way, you don't sell the same item twice.

---

## Remove an item from Shopify

To stop showing an item in your Shopify store:
1. Open the item in FindA.Sale.
2. Toggle Shopify off.
3. Save.

The product is unpublished in your Shopify store (not deleted). If you want it deleted from Shopify entirely, do that from your Shopify admin.

---

## Common questions

**Do I need TEAMS tier to use this?**
Yes. Shopify cross-listing is a TEAMS feature. If you're on PRO or below, this integration won't appear in Settings.

**Can I control whether items publish as draft or active in Shopify?**
Not yet from FindA.Sale directly. To have items publish as drafts by default, contact Shopify support and adjust your API publishing defaults, or toggle items manually in Shopify after they appear.

**What if my Shopify store has existing products with the same name?**
FindA.Sale creates new products — it doesn't match or update existing ones. You'll end up with duplicates if you push items you've already listed manually. Clean up the manual duplicates in Shopify after switching to this workflow.

**Can I push all my items at once?**
Not with a single button yet. You toggle Shopify per item. If you have a large inventory, work through your review queue and toggle items in batches.

**What happens to the Shopify product if I delete the item in FindA.Sale?**
The product stays in Shopify. Deleting it from FindA.Sale disconnects the sync but doesn't remove it from your store. Delete it in Shopify separately if needed.

**Does Shopify pricing stay in sync if I change the price in FindA.Sale?**
Yes. Price changes in FindA.Sale push to Shopify within a few minutes as long as the Shopify toggle is on.

---

## Related guides

- [List items on eBay from your sale](list-items-on-ebay.md)
- [The review queue: from photo to live listing](the-review-queue-from-photo-to-live-listing.md)
- [Webhooks and Zapier: send sale events to your tools](webhooks-and-zapier.md)`,
};

export default entry;
