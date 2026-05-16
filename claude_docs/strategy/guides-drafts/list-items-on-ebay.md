---
title: "List items on eBay from your sale (and what makes a listing go live)"
slug: list-items-on-ebay
audience: organizer
format: W+V
priority: P1
relatedGuides:
  - the-review-queue-from-photo-to-live-listing
  - pricing-an-item-suggested-price-and-your-override
  - connect-shopify
linkFrom:
  - /organizer/inventory
  - /organizer/review-queue (eBay section)
  - /faq (Can I cross-list to eBay?)
---

If an item is worth more than local buyers will pay, put it on eBay too. FindA.Sale handles the title, photos, pricing, and listing details automatically. You add the shipping info. The listing goes live on eBay almost immediately.

---

## Before you push anything: connect your eBay account

1. Go to **Settings → Integrations → eBay**.
2. Tap **Connect eBay Account**.
3. Sign in to eBay and authorize FindA.Sale.

You only do this once. After that, any item in your sale can be pushed to eBay.

---

## How to read the readiness indicator

Every item card in the review queue shows a colored border:

| Color | Meaning |
|-------|---------|
| **Green** | Ready to push. All required fields are filled. |
| **Blue** | Already pushed to eBay. |
| **Yellow** | Missing something optional — listing will go live but may underperform (missing a second photo, short description). |
| **Red** | Missing something required. Listing cannot go live until this is fixed. |

If you see red, tap the item to see what's missing. Common culprits: no photos, no price, no weight or dimensions for calculated shipping.

---

## Step 1. Open the item in the review queue

1. Go to **Organizer → Inventory** or open the review queue.
2. Tap the item you want to push.
3. Scroll to the **eBay** section.

---

## Step 2. Fill in shipping details

This is the one thing FindA.Sale can't fill in for you.

**If you're offering calculated shipping:**
- Enter the package weight in ounces (`packageWeightOz` field).
- Enter the package dimensions in inches: length, width, height.
- eBay uses these to calculate the exact shipping cost for each buyer's location.

**If you're offering local pickup only:**
- Select **Local Pickup** instead.
- No weight or dimensions needed.

You can offer both — calculated shipping and local pickup — at the same time.

---

## Step 3. Push the item

Tap **Push to eBay**.

FindA.Sale sends to eBay:
- Title (from your item name)
- Description (from your item notes)
- Category (from what was tagged)
- Condition (maps to eBay's condition scale)
- All photos, in order
- Your asking price
- Your shipping policy, payment policy, and fulfillment settings (pulled from your eBay account defaults)

The listing appears in your eBay seller account almost immediately. The item card border turns blue.

---

## What happens when it sells

If the item sells on eBay, FindA.Sale marks it sold automatically. The item is removed from your active sale listing. You won't accidentally sell it twice.

If it sells at your sale first (in-person or through FindA.Sale), you'll need to end the eBay listing manually from your eBay seller account. FindA.Sale marks it sold but doesn't yet push a sold status back to eBay.

---

## Common errors and fixes

**"Weight required"**
The item has calculated shipping selected but no weight entered. Open the item, scroll to `packageWeightOz`, enter the weight in ounces, save, then push again.

**"Category mismatch"**
eBay rejected the auto-assigned category. Open the item, scroll to the eBay section, tap **eBay Category**, and use the picker to find the right category. This usually happens with unusual or mixed items.

**"Listing failed — account not connected"**
Your eBay token expired. Go to Settings → Integrations → eBay and reconnect.

**"Photos not uploaded"**
The item has no photos, or the photos are still processing. Wait for the review queue to show the photos, then push.

---

## Common questions

**Does every item in my sale need to go on eBay?**
No. You push items one at a time. Only push what makes sense for shipping — fragile items, very large items, or things worth less than $15 after shipping usually aren't worth it.

**Can I change the price on eBay separately from my sale price?**
Not through FindA.Sale. The price pushed to eBay is your sale price. If you change the price in FindA.Sale after the listing is live, it won't update eBay automatically. End the eBay listing and push again at the new price.

**What shipping policies does FindA.Sale use?**
It uses whatever defaults are set in your eBay seller account. If you haven't set them up, eBay will prompt you when you first connect. Check your eBay account's Business Policies section if you get errors.

**Can I push the same item to multiple platforms at once?**
You can push to eBay and Shopify independently. They're separate actions.

**What if a buyer on eBay wants to negotiate?**
That happens through eBay's messaging system directly. FindA.Sale doesn't see eBay messages.

**My item is sitting at yellow — should I fix it before pushing?**
Yellow means the listing will go live but something optional is missing. A short description or only one photo won't block the listing — but items with two or more photos and a decent description sell faster. Fix it if you have 30 seconds.

---

## Related guides

- [The review queue: from photo to live listing](the-review-queue-from-photo-to-live-listing.md)
- [Pricing an item: suggested price and your override](pricing-an-item-suggested-price-and-your-override.md)
- [Connect Shopify and cross-list items](connect-shopify.md)

---

## Video script

**[90-second VO script — screen recording over app UI]**

---

**[0:00–0:10]**
Some items are worth more than your local buyers will pay. For those, push them to eBay. FindA.Sale handles almost everything automatically. You just add the shipping info.

**[0:10–0:20]**
First, connect your eBay account. Go to Settings, then Integrations, then eBay. Tap Connect, sign in to eBay, and authorize. You only do this once.

**[0:20–0:32]**
Now go to your review queue. Each item card has a colored border. Green means it's ready to push. Red means something's missing — usually weight or dimensions. Blue means it's already on eBay. Tap a green item to open it.

**[0:32–0:50]**
Scroll to the eBay section. If you're shipping it, enter the package weight in ounces and the dimensions. If it's pickup only, select Local Pickup. That's the one thing FindA.Sale can't fill in for you — everything else, it handles.

**[0:50–1:05]**
Tap Push to eBay. FindA.Sale sends the title, photos, description, category, condition, and price over to eBay. The listing goes live on eBay almost immediately. The border on the card turns blue.

**[1:05–1:20]**
If it sells on eBay, FindA.Sale marks it sold here automatically. No double-selling. If it sells at your sale first, go end the eBay listing from your eBay account — that part isn't automatic yet.

**[1:20–1:30]**
If a push fails, the error tells you exactly what's wrong. Missing weight, wrong category, expired account token — tap the item, fix the issue, push again. Usually takes 30 seconds to fix.
