import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'list-items-on-ebay',
  title: "List items on eBay from your sale (and what makes a listing go live)",
  audience: 'organizer',
  format: 'written+video',
  priority: 1,
  relatedGuides: ['the-review-queue-from-photo-to-live-listing', 'pricing-an-item-suggested-price-and-your-override', 'connect-shopify'],
  videoUrl: undefined,
  body: `If an item is worth more than local buyers will pay, put it on eBay too. FindA.Sale handles the title, photos, pricing, and listing details automatically. You add the shipping info. The listing goes live in about a minute.

---

## Before you push anything: connect your eBay account

1. Go to **Settings → Integrations → eBay**.
2. Tap **Connect eBay Account**.
3. Sign in to eBay and authorize FindA.Sale.

You only do this once. After that, any item in your sale can be pushed to eBay.

---

## How to read the readiness indicator

Every item card in the review queue shows a colored border:

- **Green** — Ready on FindA.Sale. All required fields are filled.
- **Blue** — Ready to push to eBay. Weight and dimensions are filled in (eBay requires these; FindA.Sale doesn't).
- **Yellow** — Missing something optional. The listing will go live but may underperform — usually a short description or only one photo.
- **Red** — Missing something required. The listing can't go live until this is fixed.

An item can be green before it's blue. Green means it's ready for your FindA.Sale listing. Blue means it's also ready for eBay — the difference is usually just weight and dimensions. If you see red, tap the item to find out what's missing.

---

## Step 1. Open the item in the review queue

1. Go to **Organizer → Inventory** or open the review queue.
2. Tap the item you want to push.
3. Scroll to the **eBay** section.

---

## Step 2. Fill in shipping details

This is the one thing FindA.Sale can't fill in for you.

**If you're offering calculated shipping:**
- Enter the package weight in ounces (\`packageWeightOz\` field).
- Enter the package dimensions in inches: length, width, height.
- eBay uses these to calculate the exact shipping cost for each buyer's location.

**If you're offering local pickup only:**
- Select **Local Pickup** instead.
- No weight or dimensions needed.

You can offer both — calculated shipping and local pickup — at the same time.

**Tip: capture weight, dimensions, and location with voice notes.**
During a photo session, tap the microphone and say something like "twelve ounces, eight by six by four inches, master bedroom bookshelf." The app automatically parses what you said and fills in the correct fields — no typing, no manual transfer. You can do this from the edit item page too, if you're filling in details after the sale is already set up.

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

The listing appears in your eBay seller account within 60 seconds.

---

## What happens when it sells

If the item sells on eBay, FindA.Sale marks it sold automatically and removes it from your active sale listing. You won't accidentally sell it twice.

If it sells at your sale first — in-person or through FindA.Sale — the eBay listing is ended automatically. No manual action needed on either side.

---

## Bonus: your items also show up on Google Shopping — automatically

eBay isn't the only place your shippable items get discovered. FindA.Sale also sends them to **Google Shopping** through an automatic product feed — no per-item work, no extra button to push.

Here's how it works:

- Once a sale is published, every shippable item in it is included in FindA.Sale's nightly product feed to Google.
- Those items can then appear in Google's **free product listings** when shoppers search Google for what you're selling.
- It happens on its own. You don't connect an account, fill in anything extra, or push items one at a time the way you do with eBay.

**What's included:** items from published sales that can ship — the same kind of items worth putting on eBay. The feed uses your item's title, photos, price, and condition, and works out a shipping estimate from the weight tiers you've already set up for eBay.

**What's excluded:** anything marked **Local Pickup Only** is left out of the Google feed — Google Shopping is for items a shopper can buy and have delivered, so pickup-only inventory doesn't belong there. Genuinely oversized or freight-only items are excluded too.

So the shipping details you enter for eBay do double duty: they make your items eligible for Google Shopping at the same time, with no extra steps.

---

## Common errors and fixes

**"Weight required"**
The item has calculated shipping selected but no weight entered. Open the item, scroll to \`packageWeightOz\`, enter the weight in ounces, save, then push again.

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
No — the two stay in sync. If you update the price in FindA.Sale, it pushes to your live eBay listing automatically when you save. If you change the price directly on eBay, it syncs back into FindA.Sale within a few hours. Title, description, and condition work the same way.

**What shipping policies does FindA.Sale use?**
It uses whatever defaults are set in your eBay seller account. If you haven't set them up, eBay will prompt you when you first connect. Check your eBay account's Business Policies section if you get errors.

**Can I push the same item to multiple platforms at once?**
You can push to eBay and Shopify independently. They're separate actions.

**What if a buyer on eBay wants to negotiate?**
That happens through eBay's messaging system directly. FindA.Sale doesn't see eBay messages.

**Do my items show up anywhere besides eBay and my sale page?**
Yes — shippable items from published sales are also sent to Google Shopping through an automatic nightly product feed, so they can appear in Google's free product listings. There's nothing to set up and no per-item push; it runs on its own. Items marked Local Pickup Only are excluded, since Google Shopping is for items that can be delivered.

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
Now go to your review queue. Each item card has a colored border. Green means it's ready on FindA.Sale. Blue means it's also ready to push to eBay — weight and dimensions are filled in. Red means something required is missing. Tap a blue item to open it.

**[0:32–0:50]**
Scroll to the eBay section. If you're shipping it, enter the package weight in ounces and the dimensions. If it's pickup only, select Local Pickup. That's the one thing FindA.Sale can't fill in for you — everything else, it handles.

**[0:50–1:05]**
Tap Push to eBay. FindA.Sale sends the title, photos, description, category, condition, and price over to eBay. The listing is live in about 60 seconds. The border on the card turns blue.

**[1:05–1:20]**
If it sells on eBay, FindA.Sale marks it sold automatically. No double-selling. If it sells at your sale first, the eBay listing is ended automatically too — no manual step needed.

**[1:20–1:30]**
If a push fails, the error tells you exactly what's wrong. Missing weight, wrong category, expired account token — tap the item, fix the issue, push again. Usually takes 30 seconds to fix.`,
};

export default entry;
