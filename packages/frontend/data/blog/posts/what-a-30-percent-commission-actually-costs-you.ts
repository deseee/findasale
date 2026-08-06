import { BlogPost } from '../index';

export const postS: BlogPost = {
  slug: 'what-a-30-percent-commission-actually-costs-you',
  title: "MaxSold's Fees vs. FindA.Sale's: What You Actually Keep",
  metaDescription: "MaxSold charges 30% commission plus a $2,000 flat fee on managed auctions. Here's the real payout math against FindA.Sale's flat rate, sale by sale.",
  publishDate: '2026-09-03',
  category: 'guides',
  readingTimeMinutes: 7,
  excerpt: "MaxSold's managed auctions charge 30% commission plus a $2,000 flat fee. We ran the actual payout numbers against FindA.Sale's flat rate on three sale sizes, plus MaxSold's own seller-managed option.",
  body: `## Two platforms, two fee structures

MaxSold runs managed online auctions for estate sales, downsizing, and business liquidations. Its fee structure is public: a managed auction (MaxSold handles photography, cataloging, hosting, marketing, invoicing, and pickup) charges 30% commission plus a $2,000 flat fee, with a $500 deposit required upfront. A seller-managed auction, where the organizer or family does the cataloging and pickup themselves, charges the greater of 30% of proceeds or a $99 minimum commission.

FindA.Sale charges a flat commission with no flat fee and no deposit: 10% on standard accounts, 8% on PRO and TEAMS accounts, plus standard Stripe payment processing of about 3.2%. All-in, that's roughly 13.2% or 11.2% depending on tier.

Those numbers only mean something once you run them against a real sale. Here's the payout on three sale sizes.

## On a $3,000 sale

This is where the flat fee does the most damage. On MaxSold's managed auction, 30% commission is $900, plus the $2,000 flat fee, for $2,900 total in fees. The seller keeps $100, out of $3,000 in sold inventory. On MaxSold's seller-managed option, there's no flat fee, so the fee is just $900 and the seller keeps $2,100. On FindA.Sale, the standard 13.2% all-in rate is $396 in fees, keeping $2,604; the PRO/TEAMS 11.2% rate is $336 in fees, keeping $2,664.

## On a $10,000 sale

MaxSold managed: $3,000 commission plus the $2,000 flat fee, $5,000 total fees, seller keeps $5,000. MaxSold seller-managed: $3,000 in fees, seller keeps $7,000. FindA.Sale standard: $1,320 in fees, seller keeps $8,680. FindA.Sale PRO/TEAMS: $1,120 in fees, seller keeps $8,880.

## On a $20,000 sale

MaxSold managed: $6,000 commission plus the $2,000 flat fee, $8,000 total fees, seller keeps $12,000. MaxSold seller-managed: $6,000 in fees, seller keeps $14,000. FindA.Sale standard: $2,640 in fees, seller keeps $17,360. FindA.Sale PRO/TEAMS: $2,240 in fees, seller keeps $17,760.

The gap narrows as sale size grows, since the flat fee matters less against a bigger number, but it never closes. The commission percentage alone (30% versus 8-10%) keeps the gap open regardless of sale size.

## Where the higher fee actually buys something

MaxSold's managed-auction fee pays for real work: someone else photographs the inventory, writes the catalog, hosts the auction, markets it, invoices the winning bidders, and runs pickup logistics, without the organizer or family touching any of it. For a one-time estate liquidation where nobody wants to learn a new tool or spend a weekend cataloging a house, that's a fair trade for the cost.

The seller-managed option is the one place that trade gets harder to justify. It still charges the same 30% commission as the managed version, even though the seller is the one doing the cataloging and pickup. Doing your own prep work on that platform doesn't lower the rate.

FindA.Sale's lower rate assumes the opposite setup: the organizer catalogs their own items (using Smart Auto-tag to speed up titles, descriptions, and pricing suggestions) and lists on FindA.Sale's built-in buyer marketplace for discovery, rather than paying someone else to run the whole operation. That fits organizers who want to keep their own hands on the sale, run sales often enough that a recurring 30% cut adds up fast, or are managing multiple sale types, estate sales, yard sales, auctions, flea markets, where a single flat commission is easier to plan around than a per-platform fee schedule.

## What to check before picking either

Run your own last two or three sales through both fee structures before deciding. Ask whether you're paying for someone else to do the work or doing it yourself, whether a flat fee is part of the deal, whether there's a deposit required before the sale happens, and whether the rate changes if you handle your own cataloging. On a small sale, the flat fee can matter more than the percentage. On a large sale, the percentage is what matters.

finda.sale is free to try.`,
};
