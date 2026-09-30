import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'choose-a-plan',
  title: "Choosing a plan: Simple, Pro, or Teams",
  audience: 'organizer',
  format: 'written',
  priority: 2,
  relatedGuides: ['set-up-your-account', 'connect-square', 'add-staff'],
  videoUrl: undefined,
  body: `Three plans, one simple fee structure. The plan you pick determines which tools you get and gives Pro and Teams a lower platform fee on every sale. The fee rates are in the table under "The platform fee" below.

---

## Simple: free

**What you get:**
- One active sale at a time
- Unlimited items per sale
- Basic analytics (views, holds, total revenue)
- Manual pricing
- Automatic Day 2 and Day 3 markdowns: turn on Auto-Markdown for a sale and items drop to 50% off on Day 2 and 75% off on Day 3
- Markdown Re-tag List: see which discounted items still need a new tag or sticker on the shelf, and get a daily reminder
- Standard point-of-sale on sale day

**Best for:** Organizers running occasional yard sales, flea market booths, or consignment lots who want to try the platform before committing to a monthly fee.

The automatic Day 2 and Day 3 markdowns and the Re-tag List are free on every plan, so you never need to upgrade just to clear a multi-day sale.

You can run a complete sale on Simple: create it, add items, publish, sell, and collect your payout. The only hard limit is one active sale at a time. If you need to run two sales simultaneously, you'll need Pro.

---

## Pro: $29/month

**What you get:**
- Unlimited simultaneous sales
- Everything in Simple
- Inventory: keep unsold items in a persistent inventory and pull them into your next sale
- Text updates: text the shoppers who opted in to updates for a sale
- Markdown cycles: your own price-drop steps and timing instead of the standard Day 2 and Day 3 schedule
- Priority placement in search results
- Cross-listing to eBay
- A lower platform fee than Simple (see the fee table below)

**Best for:** Full-time organizers, professional liquidators, auctioneers, and anyone running more than one or two sales per month. The eBay cross-listing alone covers the monthly fee if you move a handful of higher-value items.

On top of eBay, your shippable items are also surfaced on **Google Shopping** through an automatic product feed: included on every plan, with no per-item work. Once a sale is published, its shippable items can appear in Google's free product listings. (Items marked Local Pickup Only are excluded, since Google Shopping is for items that can be delivered.)

The markdown cycles feature is worth calling out separately. The standard 50% off Day 2 and 75% off Day 3 schedule is free on every plan. With Pro you build your own steps instead (drop 20% on day two, drop another 20% on day three, or whatever suits your sale), and the system handles it automatically. No manual re-pricing on sale day.

---

## Teams: $79/month

**What you get:**
- Everything in Pro
- Shopify sync: push your inventory to your Shopify store
- Consignor portal: clients submit items, you review and price
- Consignor payouts: see what each consignor is owed and record what you paid them (paid through Square or settled by you)
- Discount rules: color-tagged rules that apply a percentage off to the items you tag
- Multi-location hubs: manage multiple sale locations under one dashboard
- Shop Mode: run a permanent online storefront between live sales
- Staff accounts: give helpers role-based access without sharing your login
- Webhooks: send sale data to your own systems

**Best for:** Sale companies with multiple crew leads, auction houses, co-op flea market operators, or any operation where more than one person needs to manage sales.

Teams is the right choice when your operation outgrows one person. If you're handing a tablet to a helper on sale day, if you have clients who consign items through you, or if you're running three locations at once, that's what Teams is built for.

---

## The platform fee

The platform fee is one blended rate that already includes card processing. It depends on your plan and on where the sale happens: at the register while the shopper is standing at your sale, or online (Buy Now, holds, invoices, reservations, bounties and auctions).

| Plan | At the register (in person) | Online |
| --- | --- | --- |
| Simple | 8% | 9.5% |
| Pro | 6% | 7.5% |
| Teams | 6% | 7.5% |

There is a minimum fee of $0.75 per transaction, so a very small sale pays $0.75 instead of a fraction of a dollar.

The fee is deducted before your payout is calculated. If a Simple sale brings in $2,500 online, the fee is $237.50 and your payout is $2,262.50. On Pro the same sale costs $187.50 and you receive $2,312.50. Card processing is included in the fee, so there is no separate processing line for these sales.

Auction sales carry one additional fee, paid by the winning bidder rather than by you: a 5% buyer's premium added to the winning bid at checkout. It does not change your platform fee. On a $200 winning bid on Simple the buyer pays $210, your fee is $19.00 (9.5% of the $200 bid), and you receive $181.00. On Pro your fee is $15.00 and you receive $185.00.

There is no annual contract. All plans are month-to-month.

---

## How to upgrade

Go to **Settings → Subscription → Upgrade**. Pick your plan. Enter a card. Your new features are available immediately.

If you upgrade mid-month, you're billed a prorated amount for the days remaining. Your next full billing cycle starts on the same date next month.

---

## Can I downgrade?

Yes. Go to Settings → Subscription and select a lower plan. The downgrade takes effect at the end of your current billing period: you keep your current features until then.

**What happens to your data when you downgrade:**
- All your sales and items are preserved. Nothing is deleted.
- Features beyond your new tier become read-only. For example, if you downgrade from Teams to Pro, your consignor portal history is still visible: you just can't add new consignors until you upgrade again.
- If you downgrade from Pro to Simple with multiple active sales, your existing sales stay active. You won't be able to create new sales until you're back to one active at a time.

---

## Common questions

**Is there a free trial for Pro or Teams?**
Not currently. Simple is free indefinitely: use it to get a feel for the platform before upgrading.

**Do I get charged the platform fee on Simple?**
Yes. The platform fee applies on all plans, at 8% in person and 9.5% online on Simple. Simple is free in the sense that there's no monthly subscription, but FindA.Sale earns a commission on every sale regardless of plan. Pro and Teams have a lower rate (6% in person, 7.5% online).

**Can multiple people share one Pro account?**
Yes, but they'd share one login. If you need separate logins with different permissions, that's what the staff account feature in Teams is for.

**What if I run a mix of sale types: yard sales some months, auctions others?**
All plans support all sale types. You can run a yard sale and an auction under the same account. The plan limits (one active sale at a time on Simple, unlimited on Pro and Teams) apply across all sale types combined.

**Are community appraisals a Pro feature?**
No. Community appraisals are open to every plan, Simple included. They are paid for with Guild XP instead of a subscription: a request costs a minimum of 250 XP, and you set the price. A higher offer tends to bring better responses.

**Can I pause my subscription instead of canceling?**
Not currently. You can cancel at any time and resubscribe later: your data stays on file.

---

## Related guides

- [Set up your organizer account](/guides/set-up-your-account)
- [Connect Square and receive your first payout](/guides/connect-square)
- [Add staff and set their permissions](/guides/add-staff)`,
};

export default entry;
