import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'choose-a-plan',
  title: "Choosing a plan: Simple, Pro, or Teams",
  audience: 'organizer',
  format: 'written',
  priority: 2,
  relatedGuides: ['set-up-your-account', 'connect-stripe', 'add-staff'],
  videoUrl: undefined,
  body: `Three plans, one platform fee. The plan you pick determines which tools you get — not what you pay per sale. Every plan charges the same 10% on sales.

---

## Simple — free

**What you get:**
- One active sale at a time
- Unlimited items per sale
- Basic analytics (views, holds, total revenue)
- Manual pricing
- Standard point-of-sale on sale day

**Best for:** Organizers running occasional yard sales, flea market booths, or consignment lots who want to try the platform before committing to a monthly fee.

You can run a complete sale on Simple — create it, add items, publish, sell, and collect your payout. The only hard limit is one active sale at a time. If you need to run two sales simultaneously, you'll need Pro.

---

## Pro — $29/month

**What you get:**
- Unlimited simultaneous sales
- Discount rules (percentage off, buy-X-get-Y, end-of-day markdown cycles)
- Community appraisals — let shoppers suggest item values
- Priority placement in search results
- Cross-listing to eBay

**Best for:** Full-time organizers, estate liquidators, auctioneers, and anyone running more than one or two sales per month. The eBay cross-listing alone covers the monthly fee if you move a handful of higher-value items.

On top of eBay, your shippable items are also surfaced on **Google Shopping** through an automatic product feed — included on every plan, with no per-item work. Once a sale is published, its shippable items can appear in Google's free product listings. (Items marked Local Pickup Only are excluded, since Google Shopping is for items that can be delivered.)

The markdown cycles feature is worth calling out separately. You set price-reduction rules (drop 20% on day two, drop another 20% on day three), and the system handles it automatically. No manual re-pricing on sale day.

---

## Teams — $79/month

**What you get:**
- Everything in Pro
- Shopify sync — push your inventory to your Shopify store
- Consignor portal — clients submit items, you review and price
- Multi-location hubs — manage multiple sale locations under one dashboard
- Shop Mode — run a permanent online storefront between live sales
- Staff accounts — give helpers role-based access without sharing your login
- Webhooks — send sale data to your own systems

**Best for:** Estate sale companies with multiple crew leads, auction houses, co-op flea market operators, or any operation where more than one person needs to manage sales.

Teams is the right choice when your operation outgrows one person. If you're handing a tablet to a helper on sale day, if you have clients who consign items through you, or if you're running three locations at once — that's what Teams is built for.

---

## The platform fee

All three plans charge **10% on every sale**. This is the same rate regardless of which plan you're on. The fee covers payment processing, hosting, search indexing, and shopper notifications.

The fee is deducted before your payout is calculated. If your auction brings in $2,500, your payout is $2,250 (before Stripe's processing fee, which is typically 2.9% + $0.30 per transaction).

There is no annual contract. All plans are month-to-month.

---

## How to upgrade

Go to **Settings → Subscription → Upgrade**. Pick your plan. Enter a card. Your new features are available immediately.

If you upgrade mid-month, you're billed a prorated amount for the days remaining. Your next full billing cycle starts on the same date next month.

---

## Can I downgrade?

Yes. Go to Settings → Subscription and select a lower plan. The downgrade takes effect at the end of your current billing period — you keep your current features until then.

**What happens to your data when you downgrade:**
- All your sales and items are preserved. Nothing is deleted.
- Features beyond your new tier become read-only. For example, if you downgrade from Teams to Pro, your consignor portal history is still visible — you just can't add new consignors until you upgrade again.
- If you downgrade from Pro to Simple with multiple active sales, your existing sales stay active. You won't be able to create new sales until you're back to one active at a time.

---

## Common questions

**Is there a free trial for Pro or Teams?**
Not currently. Simple is free indefinitely — use it to get a feel for the platform before upgrading.

**Do I get charged the platform fee on Simple?**
Yes. The 10% fee applies on all plans. Simple is free in the sense that there's no monthly subscription — but FindA.Sale earns a commission on every sale regardless of plan.

**Can multiple people share one Pro account?**
Yes, but they'd share one login. If you need separate logins with different permissions, that's what the staff account feature in Teams is for.

**What if I run a mix of sale types — yard sales some months, auctions others?**
All plans support all sale types. You can run a yard sale and an auction under the same account. The plan limits (one active sale at a time on Simple, unlimited on Pro and Teams) apply across all sale types combined.

**Can I pause my subscription instead of canceling?**
Not currently. You can cancel at any time and resubscribe later — your data stays on file.

---

## Related guides

- [Set up your organizer account](/guides/set-up-your-account)
- [Connect Stripe and receive your first payout](/guides/connect-stripe)
- [Add staff and set their permissions](/guides/add-staff)`,
};

export default entry;
