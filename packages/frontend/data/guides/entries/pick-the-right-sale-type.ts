import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'pick-the-right-sale-type',
  title: "Pick the right sale type for what you're running",
  audience: 'organizer',
  format: 'written',
  priority: 1,
  relatedGuides: ['create-your-first-sale', 'schedule-and-visibility', 'shop-mode'],
  videoUrl: undefined,
  body: `Choosing the right sale type matters before you publish.
It controls which features are available and how your sale appears in search.
You can change it in edit-sale before publishing — not after.

---

## Estate Sale

An estate sale is a household liquidation event, usually spread across multiple rooms.
Items are priced individually and buyers browse in person.
Most estate sales run two to three days.

**Best for:** Full-house liquidations, estate settlements, downsizing a property.

**Features unlocked:** Standard item catalog, multi-day scheduling, Hubs for overflow locations.

---

## Yard / Garage Sale

A yard sale is an outdoor or driveway event with mixed household items.
Prices tend to be low, turnover is fast, and setup is minimal.

**Best for:** One-day neighborhood sales, moving sales, quick household cleanouts.

**Features unlocked:** Standard item catalog, single-day or weekend scheduling.

---

## Flea Market

A flea market is a multi-vendor event where each vendor manages their own inventory.
As the organizer, you host the space — vendors each handle their own table or booth.

**Best for:** Organizers running a market where multiple sellers participate, indoor or outdoor.

**Features unlocked:** Vendor management, per-vendor item catalogs, Hubs for booth areas.

---

## Auction

An auction sells items to the highest bidder.
FindA.Sale supports two formats: timed (online bidding with a countdown) and live (in-person with an auctioneer).

**Best for:** High-value items, antique collections, estate jewelry, farm equipment.

**Features unlocked:** Bidding system, bid-bot (auto-bid up to a max), auction close and winner notification, Stripe checkout for winners.

---

## Consignment

A consignment sale holds items that belong to third parties.
You sell on their behalf and take a percentage.
The consignor portal lets you track which items belong to whom and calculate payouts.

**Best for:** Ongoing consignment shops, multi-consignor estate sales, organizers who handle goods for multiple clients.

**Features unlocked:** Consignor portal, per-consignor item tracking, payout reports.

---

## Pop-Up / Retail

A pop-up or retail sale is a recurring storefront or boutique.
It works like a regular sale but is designed for organizers who run a permanent or semi-permanent booth.

**Best for:** Shop Mode organizers, flea market regulars with a fixed booth, estate liquidators with ongoing inventory.

**Features unlocked:** Extended scheduling, Shop Mode eligibility (TEAMS tier).

---

## What happens if you pick the wrong type?

You can change sale type in **edit-sale** any time before you publish.
After you publish, sale type is locked.

If you published with the wrong type, unpublish the sale, change the type, and republish.
No shopper data or item data is lost when you unpublish.

---

## How sale type affects features

| Sale type | Bidding | Consignor portal | Vendor management | Shop Mode eligible |
|---|---|---|---|---|
| Estate Sale | No | No | No | No |
| Yard/Garage Sale | No | No | No | No |
| Auction | Yes | No | No | No |
| Flea Market | No | No | Yes | No |
| Consignment | No | Yes | No | No |
| Pop-Up / Retail | No | No | No | Yes (TEAMS) |

---

## Common questions

**Can I run an auction that also has fixed-price items?**
Yes. An Auction sale type supports both bidding items and buy-now items. Set individual items as "Auction" or "Fixed Price" in the item edit form.

**I run estate sales but sometimes take consignment items too. Which type do I pick?**
Pick Consignment if tracking consignor payouts matters to you. If consignment is a small part of your business and you don't need payout reports, Estate Sale works fine.

**Can a flea market vendor use FindA.Sale for their own booth?**
Yes — a vendor can create their own sale listing independent of the market organizer. The market organizer's Flea Market sale type is for managing the event itself, not individual vendor storefronts.

**What's the difference between Auction and Estate Sale with high-value items?**
Estate Sale items have a fixed asking price. Auction items go to the highest bidder. If you want to let buyers compete on price, choose Auction. If you want to set prices yourself, choose Estate Sale.

---

## Related guides

- [Create your first sale, step by step](create-your-first-sale.md)
- [Schedule a sale and set your visibility window](schedule-and-visibility.md)
- [Run a permanent storefront with Shop Mode](shop-mode.md)`,
};

export default entry;
